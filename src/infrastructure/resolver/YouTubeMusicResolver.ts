import type { TrackQuery, TrackResolver } from "@/application/ports/TrackResolver";
import type { AudioSource } from "@/domain/entities/Track";
import { similarity } from "@/domain/rules/similarity";
import { InnerTubeClient } from "@/infrastructure/youtube/InnerTubeClient";
import {
  asRecord,
  asString,
  collectByKey,
  dig,
  readText,
} from "@/infrastructure/youtube/traverse";
import { parseDurationLabel } from "@/domain/rules/TitleNormalizer";

/**
 * Finds a YouTube Music song for a track we only have text for.
 *
 * The `params` blob below is YouTube Music's "Songs only" search filter. It
 * matters more than it looks: song results are the plain studio audio, whereas
 * unfiltered results are full of music videos that open with several seconds of
 * label idents and dialogue - death for a game whose first clue is a second or less.
 */

/** Base64 protobuf for the "Songs" filter tab. */
const SONGS_ONLY_FILTER = "EgWKAQIIAWoKEAoQAxAEEAkQBQ%3D%3D";

/** Below this, we would rather show the player nothing than the wrong song. */
const MIN_CONFIDENCE = 0.55;

/** A candidate more than this far from the expected length is a different cut. */
const MAX_DURATION_DRIFT_MS = 20_000;

interface Candidate {
  readonly videoId: string;
  readonly title: string;
  readonly artist: string;
  readonly durationMs: number | null;
}

export class YouTubeMusicResolver implements TrackResolver {
  constructor(private readonly client: InnerTubeClient = new InnerTubeClient()) {}

  async resolve(query: TrackQuery): Promise<AudioSource | null> {
    const term = [query.artists.join(" "), query.title].filter(Boolean).join(" ");
    if (!term.trim()) return null;

    const payload = await this.client.search("WEB_REMIX", term, SONGS_ONLY_FILTER);
    const candidates = extractCandidates(payload);

    const best = pickBest(candidates, query);
    if (!best) return null;

    return { kind: "youtube", ref: best.videoId, startOffsetMs: 0 };
  }
}

function extractCandidates(payload: unknown): Candidate[] {
  const rows = collectByKey(payload, "musicResponsiveListItemRenderer");
  const out: Candidate[] = [];

  for (const row of rows) {
    const rec = asRecord(row);
    if (!rec) continue;

    const videoId = asString(dig(rec, ["playlistItemData", "videoId"]));
    if (!videoId) continue;

    // Flex columns run: title, then artist / album / duration.
    const columns = collectByKey(rec["flexColumns"], "musicResponsiveListItemFlexColumnRenderer")
      .map((col) => readText(asRecord(col)?.["text"]))
      .filter((t): t is string => t !== null);

    const [title, details] = columns;
    if (!title) continue;

    // The details column is "Artist • Album • 3:44".
    const parts = (details ?? "").split("•").map((p) => p.trim());
    const artist = parts[0] ?? "";
    const durationLabel = parts.find((p) => /^\d+:\d{2}(?::\d{2})?$/.test(p)) ?? null;

    out.push({ videoId, title, artist, durationMs: parseDurationLabel(durationLabel) });
  }

  return out;
}

/**
 * Scores title and artist separately so a right-title/wrong-artist cover cannot
 * win on title alone, then rejects anything of clearly the wrong length.
 */
export function pickBest(
  candidates: readonly Candidate[],
  query: TrackQuery,
): Candidate | null {
  const wantedArtists = query.artists.join(" ");

  let best: { candidate: Candidate; score: number } | null = null;

  for (const candidate of candidates) {
    if (query.durationMs !== null && candidate.durationMs !== null) {
      if (Math.abs(candidate.durationMs - query.durationMs) > MAX_DURATION_DRIFT_MS) continue;
    }

    const titleScore = similarity(candidate.title, query.title);
    const artistScore = wantedArtists ? similarity(candidate.artist, wantedArtists) : 1;

    // Title carries the most weight, but a wrong artist still sinks the match.
    const score = titleScore * 0.65 + artistScore * 0.35;
    if (score < MIN_CONFIDENCE) continue;

    if (!best || score > best.score) best = { candidate, score };
  }

  return best?.candidate ?? null;
}
