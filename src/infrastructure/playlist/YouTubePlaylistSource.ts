import type { PlaylistSource } from "@/application/ports/PlaylistSource";
import { ImportError } from "@/application/ports/errors";
import type { RawPlaylist } from "@/domain/entities/Playlist";
import type { RawTrack } from "@/domain/entities/Track";
import { normalizeVideoTitle, parseDurationLabel } from "@/domain/rules/TitleNormalizer";
import { InnerTubeClient } from "@/infrastructure/youtube/InnerTubeClient";
import {
  asRecord,
  asString,
  bestImageUrl,
  collectByKey,
  dig,
  findByKey,
  readText,
} from "@/infrastructure/youtube/traverse";

/**
 * Loads a public YouTube or YouTube Music playlist.
 *
 * Unlike Spotify, YouTube gives us no structured artist/title split - just
 * whatever the uploader named the video - so every entry goes through
 * TitleNormalizer before it reaches the guess list.
 */

const PLAYLIST_ID_RE = /^(?:PL|OLAK5uy_|RDCLAK5uy_|UU|LL|FL|SP)[A-Za-z0-9_-]{10,}$/;

/** Accepts full URLs (any YouTube host), or a bare playlist id. */
export function parseYouTubePlaylistId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/youtube\.com|youtu\.be|youtube-nocookie\.com/i.test(trimmed)) {
    const list = /[?&]list=([A-Za-z0-9_-]+)/.exec(trimmed);
    return list?.[1] ?? null;
  }

  return PLAYLIST_ID_RE.test(trimmed) ? trimmed : null;
}

/** The current playlist item shape (`lockupViewModel`). */
function fromLockup(node: unknown): RawTrack | null {
  const lockup = asRecord(node);
  if (!lockup) return null;
  if (!/VIDEO/.test(asString(lockup["contentType"]) ?? "")) return null;

  const videoId = asString(lockup["contentId"]);
  if (!videoId) return null;

  const meta = asRecord(dig(lockup, ["metadata", "lockupMetadataViewModel"]));
  const rawTitle = readText(meta?.["title"]);
  if (!rawTitle) return null;

  // Row 0 is the uploader; row 1 is view count and age.
  const channel = readText(
    dig(meta, [
      "metadata",
      "contentMetadataViewModel",
      "metadataRows",
      "0",
      "metadataParts",
      "0",
      "text",
    ]),
  );

  // Duration lives in the badge painted over the bottom of the thumbnail.
  const durationLabel = readText(
    asRecord(findByKey(lockup["contentImage"], "thumbnailBadgeViewModel"))?.["text"],
  );

  return buildTrack(videoId, rawTitle, channel, durationLabel);
}

/** The older shape, still served to some clients and regions. */
function fromPlaylistVideoRenderer(node: unknown): RawTrack | null {
  const r = asRecord(node);
  if (!r) return null;
  const videoId = asString(r["videoId"]);
  const rawTitle = readText(r["title"]);
  if (!videoId || !rawTitle) return null;

  const channel = readText(r["shortBylineText"]);
  const seconds = asString(r["lengthSeconds"]);
  const durationLabel = readText(r["lengthText"]);

  const track = buildTrack(videoId, rawTitle, channel, durationLabel);
  if (track && !track.durationMs && seconds && /^\d+$/.test(seconds)) {
    return { ...track, durationMs: Number(seconds) * 1000 };
  }
  return track;
}

function buildTrack(
  videoId: string,
  rawTitle: string,
  channel: string | null,
  durationLabel: string | null,
): RawTrack {
  const { title, artists } = normalizeVideoTitle(rawTitle, channel);
  return {
    title,
    artists,
    durationMs: parseDurationLabel(durationLabel),
    artworkUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    externalId: videoId,
    // YouTube uploads open with label idents and intros far more often than
    // studio audio does, so skip a little rather than gambling on silence.
    source: { kind: "youtube", ref: videoId, startOffsetMs: 0 },
  };
}

export class YouTubePlaylistSource implements PlaylistSource {
  readonly id = "youtube" as const;
  readonly label = "YouTube";

  constructor(private readonly client: InnerTubeClient = new InnerTubeClient()) {}

  supports(input: string): boolean {
    return parseYouTubePlaylistId(input) !== null;
  }

  async load(input: string): Promise<RawPlaylist> {
    const playlistId = parseYouTubePlaylistId(input);
    if (!playlistId) {
      throw new ImportError(
        "UNSUPPORTED_INPUT",
        "That does not look like a YouTube playlist link.",
      );
    }

    // The `VL` prefix asks for a playlist's contents rather than its channel.
    const payload = await this.client.browse("WEB", `VL${playlistId}`);

    const tracks = this.extractTracks(payload);
    if (tracks.length === 0) {
      const alert = readText(findByKey(payload, "alertRenderer"));
      throw new ImportError(
        "NOT_FOUND",
        alert ??
          "YouTube returned no videos for that playlist. Private, deleted and auto-generated mix playlists cannot be imported.",
      );
    }

    const title =
      asString(findByKey(payload, "pageTitle")) ??
      readText(dig(payload, ["metadata", "playlistMetadataRenderer", "title"])) ??
      "YouTube playlist";

    return {
      id: `youtube:playlist:${playlistId}`,
      title,
      description: null,
      artworkUrl: bestImageUrl(findByKey(payload, "image")) ?? tracks[0]?.artworkUrl ?? null,
      provider: "youtube",
      // Browse returns the first page; long playlists need continuation tokens.
      truncated: tracks.length >= 100,
      tracks,
    };
  }

  private extractTracks(payload: unknown): RawTrack[] {
    const lockups = collectByKey(payload, "lockupViewModel")
      .map(fromLockup)
      .filter((t): t is RawTrack => t !== null);
    if (lockups.length > 0) return dedupe(lockups);

    const legacy = collectByKey(payload, "playlistVideoRenderer")
      .map(fromPlaylistVideoRenderer)
      .filter((t): t is RawTrack => t !== null);
    return dedupe(legacy);
  }
}

/** The same video can appear in both the grid and a shelf; keep the first. */
function dedupe(tracks: readonly RawTrack[]): RawTrack[] {
  const seen = new Set<string>();
  const out: RawTrack[] = [];
  for (const track of tracks) {
    const key = track.externalId ?? `${track.title}|${track.artists.join()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(track);
  }
  return out;
}
