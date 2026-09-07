/**
 * What a lyrics round has given away after each miss.
 *
 * The audio game buys you more seconds; this one buys you more to read. The
 * order is deliberate: another line is worth more than the artist, so the
 * cheaper hint comes first and the schedule alternates rather than handing over
 * everything at once.
 *
 *   1st guess   one line
 *   2nd guess   + the artist
 *   3rd guess   + a second line
 *   4th guess   + the album
 *   5th guess   + a third line
 */
export interface LyricReveal {
  /** How many lyric lines are on screen. */
  readonly lines: number;
  readonly artist: boolean;
  readonly album: boolean;
}

const SCHEDULE: readonly LyricReveal[] = [
  { lines: 1, artist: false, album: false },
  { lines: 1, artist: true, album: false },
  { lines: 2, artist: true, album: false },
  { lines: 2, artist: true, album: true },
  { lines: 3, artist: true, album: true },
];

/** Attempts allowed in a lyrics round - one per rung, as with the audio game. */
export const LYRIC_ATTEMPTS = SCHEDULE.length;

/** The most lines any round will ever need to have chosen up front. */
export const MAX_LYRIC_LINES = Math.max(...SCHEDULE.map((step) => step.lines));

/** What is on screen at a given attempt, clamped at both ends. */
export function lyricRevealAt(attemptIndex: number): LyricReveal {
  const clamped = Math.min(Math.max(attemptIndex, 0), SCHEDULE.length - 1);
  return SCHEDULE[clamped] ?? SCHEDULE[0]!;
}

/** Everything revealed - what a finished round shows, win or lose. */
export function fullLyricReveal(): LyricReveal {
  return SCHEDULE[SCHEDULE.length - 1]!;
}

/**
 * What the next miss would add, for the skip button's label.
 * Null on the final attempt, where there is nothing left to give.
 */
export function nextLyricHint(attemptIndex: number): string | null {
  if (attemptIndex >= SCHEDULE.length - 1) return null;

  const now = lyricRevealAt(attemptIndex);
  const next = lyricRevealAt(attemptIndex + 1);

  if (next.lines > now.lines) return "another line";
  if (next.artist && !now.artist) return "the artist";
  if (next.album && !now.album) return "the album";
  return null;
}
