import type { Lyrics } from "@/domain/entities/Lyrics";

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

/** Stable cache key; the same song must not be looked up twice. */
export function lyricsQueryKey(query: LyricsQuery): string {
  const norm = (value: string) =>
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  return `${norm(query.artists.join(" "))}|${norm(query.title)}`;
}
