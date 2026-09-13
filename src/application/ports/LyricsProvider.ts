import type { Lyrics } from "@/domain/entities/Lyrics";
import { cacheKey } from "@/domain/rules/similarity";

export interface LyricsQuery {
  readonly title: string;
  readonly artists: readonly string[];
  /** Used to tell a studio cut apart from a live version of the same song. */
  readonly durationMs: number | null;
}

/**
 * Finds the words to a song.
 *
 * Returns null when there is nothing usable - no match, an instrumental, or a
 * transcription too thin to build a round from. That is an ordinary outcome,
 * not an error: the caller simply picks a different song.
 */
export interface LyricsProvider {
  fetch(query: LyricsQuery): Promise<Lyrics | null>;
}

/**
 * Stable cache key; the same song must not be looked up twice.
 *
 * Shares the domain's normaliser rather than inlining one, for the reason
 * spelled out on trackQueryKey: the hand-copy that used to live here erased
 * every non-Latin script to the empty string, so one cached miss answered for
 * every Hebrew song in a playlist - and a cached *hit* would have answered with
 * the wrong song's words.
 */
export function lyricsQueryKey(query: LyricsQuery): string {
  return `${cacheKey(query.artists.join(" "))}|${cacheKey(query.title)}`;
}
