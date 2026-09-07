import type { AudioSource } from "@/domain/entities/Track";

export interface TrackQuery {
  readonly title: string;
  readonly artists: readonly string[];
  /** Used to reject matches of wildly the wrong length (live cuts, remixes). */
  readonly durationMs: number | null;
}

/**
 * Finds playable audio for a track that arrived without any.
 * Returns null when nothing good enough was found - that is a normal outcome,
 * not an error, and the caller drops the track from the playable set.
 */
export interface TrackResolver {
  resolve(query: TrackQuery): Promise<AudioSource | null>;
}

/** Stable cache key for a track, independent of which resolver produced it. */
export function trackQueryKey(query: TrackQuery): string {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  return `${norm(query.artists.join(" "))}|${norm(query.title)}`;
}
