import { normalizeKey } from "./similarity";
import { seededRandom } from "./seededRandom";

/**
 * Turning a raw lyrics blob into lines worth guessing from.
 *
 * Community-contributed lyrics carry a lot that is not singing: section
 * headers, decorative markers, and - in more submissions than you would hope -
 * the track's own credits pasted in where the words should be. Worse, some of
 * the real lines *are* the title, which hands over the answer for free.
 */

/**
 * LRC timing tags. Some submissions put synced lyrics in the plain-text field,
 * so a line arrives as "[02:16.09] Don't make me wait forever".
 */
const LRC_LINE_TIMESTAMP = /^\s*(?:\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]\s*)+/;

/** Per-word timings inside a line: "<00:12.30>". */
const LRC_WORD_TIMESTAMP = /<\d{1,2}:\d{2}(?:[.:]\d{1,3})?>/g;

/** Nothing but punctuation, whitespace or note glyphs. */
const DECORATION_ONLY = /^[\s♪♫•·\-—–_.*~=]+$/u;

/** "[Chorus]", "(Verse 2)", "{Bridge}" - structure, not lyrics. */
const SECTION_HEADER = /^[[({].{0,40}[\])}]$/u;

/** Credit blocks pasted into the lyrics field. */
const METADATA_LINE =
  /^\s*(artist|album|title|track|by|written\s+by|producer|produced\s+by|lyrics|composer|feat\.?)\s*[:\-]/i;

/**
 * Short lines carry too little to guess from, and are usually interjections
 * ("Oh", "Yeah, yeah") rather than anything identifying.
 */
const MIN_LINE_LENGTH = 12;

/** Below this a track is not worth playing in lyrics mode. */
export const MIN_USABLE_LINES = 6;

/**
 * Cleans a raw lyrics body into lines that can be shown as a clue.
 *
 * Lines containing the song's title are dropped outright: a clue that states
 * the answer is not a clue. That does remove some of the most singable lines,
 * which is the correct trade - the game is unplayable otherwise.
 */
export function usableLyricLines(rawLyrics: string, title: string): string[] {
  const titleKey = compactKey(title);

  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of rawLyrics.split(/\r?\n/)) {
    // Strip timing tags first, or a timestamped line clears the length check on
    // the strength of "[02:16.09]" alone and shows the clue with a clock on it.
    const line = raw
      .replace(LRC_LINE_TIMESTAMP, "")
      .replace(LRC_WORD_TIMESTAMP, "")
      .trim();

    if (line.length < MIN_LINE_LENGTH) continue;
    if (DECORATION_ONLY.test(line)) continue;
    if (SECTION_HEADER.test(line)) continue;
    if (METADATA_LINE.test(line)) continue;

    const key = normalizeKey(line);
    if (!key) continue;
    // A line that contains the title gives the game away.
    if (titleKey && compactKey(line).includes(titleKey)) continue;
    // Choruses repeat; showing the same line twice wastes a hint.
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(line);
  }

  return out;
}

/**
 * Letters and digits only, with the separators removed entirely.
 *
 * Spoiler matching has to survive lyrics that punctuate differently from the
 * title - "Dont Stop Believin" against "Don't Stop Believin'". Keeping spaces
 * leaves the apostrophe as a gap and the two stop matching, so the comparison
 * drops separators altogether. It over-matches slightly across word boundaries,
 * which is the right way to be wrong: showing a clue that states the answer is
 * far worse than dropping one usable line.
 */
function compactKey(value: string): string {
  return normalizeKey(value).replace(/\s+/g, "");
}

/**
 * Chooses the run of lines a round will reveal, in order.
 *
 * The clues are *consecutive*: each miss carries on from the last, so the
 * hints read as a passage of the song rather than three unrelated fragments.
 * Where that passage starts is random, so a round is as likely to open on the
 * last chorus as the first verse - the opening couplet of a track is both the
 * easiest to recognise and the least interesting place to begin.
 *
 * Consecutive here means consecutive among the *usable* lines: anything
 * filtered out - a title spoiler, a section header - is simply not there to
 * show, so the run reads on to the next line a player could actually be given.
 *
 * Deterministic in `seed`, so a round shows the same lines however many times
 * the component re-renders.
 */
export function pickLyricLines(
  lines: readonly string[],
  count: number,
  seed: string,
): string[] {
  if (count <= 0 || lines.length === 0) return [];
  if (lines.length <= count) return [...lines];

  const random = seededRandom(seed);
  // Start anywhere that still leaves room for the whole run.
  const start = Math.floor(random() * (lines.length - count + 1));
  return lines.slice(start, start + count);
}
