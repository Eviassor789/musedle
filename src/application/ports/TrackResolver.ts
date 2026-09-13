import type { AudioSource } from "@/domain/entities/Track";
import { cacheKey } from "@/domain/rules/similarity";

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

/**
 * Stable cache key for a track, independent of which resolver produced it.
 *
 * Shares the domain's normaliser rather than inlining one. A hand-copy here
 * drifted from it and kept the Latin-only `[^a-z0-9]+` rule, which meant every
 * non-Latin track in a playlist reduced to the same empty key - so the first
 * one resolved won the cache entry and every other Hebrew, Arabic or Japanese
 * song in the playlist played *its* audio. This cache is written to disk, so
 * the collision outlived the session that created it.
 */
export function trackQueryKey(query: TrackQuery): string {
  return `${cacheKey(query.artists.join(" "))}|${cacheKey(query.title)}`;
}
