import type { PlaylistSource } from "@/application/ports/PlaylistSource";
import type { TrackResolver } from "@/application/ports/TrackResolver";
import { ImportError } from "@/application/ports/errors";
import type { Playlist, RawPlaylist } from "@/domain/entities/Playlist";
import type { RawTrack, Track } from "@/domain/entities/Track";
import { normalizeKey } from "@/domain/rules/similarity";

/** Fewer than this and there is no game to play. */
const MIN_PLAYABLE_TRACKS = 4;

/** Politeness limit on the unofficial endpoints we resolve against. */
const RESOLVE_CONCURRENCY = 6;

/**
 * Picks the right adapter for whatever the user pasted.
 *
 * Order matters: the link-based adapters get first refusal, and the pasted-text
 * adapter is last because it accepts almost anything.
 */
export class PlaylistSourceRegistry {
  constructor(private readonly sources: readonly PlaylistSource[]) {}

  select(input: string): PlaylistSource {
    const source = this.sources.find((candidate) => candidate.supports(input));
    if (!source) {
      throw new ImportError(
        "UNSUPPORTED_INPUT",
        "Paste a Spotify or YouTube playlist link, or a list of songs one per line.",
      );
    }
    return source;
  }

  load(input: string): Promise<RawPlaylist> {
    return this.select(input).load(input);
  }
}

/**
 * Turns user input into a playable playlist.
 *
 * The two halves are deliberately separate: a *source* knows how to list a
 * playlist's songs, a *resolver* knows how to find audio for one song. Spotify
 * hands us both at once, YouTube hands us both at once, a pasted list hands us
 * neither - and this use case is the only place that has to care.
 */
export class ImportPlaylist {
  constructor(
    private readonly registry: PlaylistSourceRegistry,
    private readonly resolver: TrackResolver,
  ) {}

  async execute(input: string): Promise<Playlist> {
    const raw = await this.registry.load(input);
    const resolved = await this.resolveAll(raw.tracks);

    const tracks: Track[] = [];
    const seen = new Set<string>();
    let unresolved = 0;

    for (const [index, track] of raw.tracks.entries()) {
      const source = track.source ?? resolved[index] ?? null;
      if (!source) {
        unresolved++;
        continue;
      }

      // Duplicates make the guess list confusing and the answer ambiguous.
      const id = stableTrackId(raw.id, track, index);
      const dedupeKey = `${normalizeKey(track.artists.join(" "))}|${normalizeKey(track.title)}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      tracks.push({
        id,
        title: track.title,
        artists: track.artists,
        durationMs: track.durationMs,
        artworkUrl: track.artworkUrl ?? raw.artworkUrl,
        source,
      });
    }

    if (tracks.length < MIN_PLAYABLE_TRACKS) {
      throw new ImportError(
        "TOO_FEW_PLAYABLE",
        `Only ${tracks.length} of ${raw.tracks.length} songs could be played. Try a different playlist.`,
      );
    }

    return {
      id: raw.id,
      title: raw.title,
      description: raw.description,
      artworkUrl: raw.artworkUrl,
      provider: raw.provider,
      truncated: raw.truncated,
      tracks,
      unresolvedCount: unresolved,
    };
  }

  /**
   * Resolves only the tracks that arrived without audio, a few at a time.
   * A single failed lookup must not fail the import, so rejections become null.
   */
  private async resolveAll(tracks: readonly RawTrack[]): Promise<Array<Track["source"] | null>> {
    const results = new Array<Track["source"] | null>(tracks.length).fill(null);
    const queue = tracks
      .map((track, index) => ({ track, index }))
      .filter(({ track }) => track.source === null);

    if (queue.length === 0) return results;

    let cursor = 0;
    const worker = async (): Promise<void> => {
      while (cursor < queue.length) {
        const job = queue[cursor++];
        if (!job) return;
        try {
          results[job.index] = await this.resolver.resolve({
            title: job.track.title,
            artists: job.track.artists,
            durationMs: job.track.durationMs,
          });
        } catch {
          results[job.index] = null;
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(RESOLVE_CONCURRENCY, queue.length) }, worker),
    );
    return results;
  }
}

/** Deterministic id so the same playlist yields the same ids across imports. */
function stableTrackId(playlistId: string, track: RawTrack, index: number): string {
  if (track.externalId) return track.externalId;
  const key = normalizeKey(`${track.artists.join(" ")} ${track.title}`);
  return key ? `t:${key.replace(/\s+/g, "-")}` : `${playlistId}:${index}`;
}
