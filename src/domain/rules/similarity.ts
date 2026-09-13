/**
 * String matching shared by two very different callers:
 *
 *  - the resolver, deciding whether a YouTube search hit really is the track
 *    we asked for, and
 *  - the guess box, ranking the playlist as the player types.
 *
 * Both need "close enough, ignoring punctuation and decoration", so the rules
 * live in one pure module instead of being reinvented on each side.
 */

/**
 * Lowercase, strip accents, drop punctuation. The comparison key.
 *
 * Letters and digits are kept in *any* script, not just Latin. This used to
 * read `[^a-z0-9]+`, which silently erased every non-Latin title, artist and
 * lyric line to the empty string - and an empty key is not a near miss, it is
 * a guaranteed zero. A Hebrew song scored 0.00 against its own exact match in
 * the lyrics database and was rejected as a mismatch; every one of its lines
 * was then dropped as unreadable. The same held for Arabic, Greek, Cyrillic,
 * Japanese and the rest.
 *
 * Nonspacing marks go after NFKD, which folds Latin accents as before and now
 * also folds Hebrew niqqud and Arabic harakat - lyrics are pointed or not
 * depending on who typed them, and the two spellings have to match.
 *
 * One known limitation: tokens are split on separators, so scripts that do not
 * put spaces between words (Chinese, Japanese, Thai) reduce to a single token
 * and score 1 or 0 rather than anything in between. That is a much smaller
 * failure than scoring 0 always, and fixing it properly means a segmenter.
 */
export function normalizeKey(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Mn}+/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * One fragment of a cache key.
 *
 * Normalised, with the raw text as a floor: a key is an identity, and two
 * different songs collapsing to the same one is not a weaker cache, it is a
 * cache that hands back the wrong song's answer. Anything that normalises to
 * nothing keeps its raw form rather than joining an anonymous bucket with
 * everything else that did.
 */
export function cacheKey(value: string): string {
  return normalizeKey(value) || value.trim().toLowerCase();
}

/** Decoration that should not decide whether two titles match. */
const IGNORED_TOKENS = new Set([
  "the", "a", "an", "and", "feat", "ft", "featuring", "with",
  "official", "video", "audio", "music", "remaster", "remastered",
  "version", "hd", "hq", "4k", "lyrics", "lyric",
]);

export function tokenize(input: string): string[] {
  return normalizeKey(input)
    .split(" ")
    .filter((t) => t.length > 0 && !IGNORED_TOKENS.has(t));
}

/**
 * Dice coefficient over token sets: 0 = nothing in common, 1 = identical.
 * Token-based rather than character-based so word order does not matter -
 * "Queen Bohemian Rhapsody" and "Bohemian Rhapsody Queen" score 1.
 */
export function similarity(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 || tb.size === 0) return 0;

  let shared = 0;
  for (const token of ta) if (tb.has(token)) shared++;
  return (2 * shared) / (ta.size + tb.size);
}

/** True when `query` appears in `text` as a prefix-matching subsequence of tokens. */
export function matchesPrefix(text: string, query: string): boolean {
  const haystack = tokenize(text);
  const needles = tokenize(query);
  if (needles.length === 0) return true;
  return needles.every((needle) =>
    haystack.some((token) => token.startsWith(needle)),
  );
}

/**
 * Ranks candidates against a query for the guess box.
 * Prefix matches come first (what a typist expects), then fuzzy similarity.
 */
export function rankByQuery<T>(
  items: readonly T[],
  query: string,
  toText: (item: T) => string,
  limit = 8,
): T[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const scored: Array<{ item: T; score: number }> = [];
  for (const item of items) {
    const text = toText(item);
    const exactish = text.toLowerCase().includes(trimmed.toLowerCase());
    const prefix = matchesPrefix(text, trimmed);
    const fuzzy = similarity(text, trimmed);

    // Bands, not a blend: a substring hit should always outrank a fuzzy one.
    const score = exactish ? 2 + fuzzy : prefix ? 1 + fuzzy : fuzzy;
    if (score > 0.2) scored.push({ item, score });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.item);
}
