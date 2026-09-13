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
import { SnippetLadder } from "./SnippetLadder";

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

/**
 * The attempt ladder for a lyrics round.
 *
 * The engine counts attempts in rungs, and a lyrics round has no audio, so it
 * borrows the ladder purely for its length - the millisecond values are never
 * read, because the player deck is not on screen in this mode. Deriving the
 * length from SCHEDULE rather than sharing the audio ladder is the whole point:
 * when the audio game grew a half-second rung it would otherwise have handed
 * lyrics players a sixth guess that buys them no sixth hint.
 *
 * One shared instance, for the same reason SnippetLadder.default() is: this is
 * read during render, and a fresh object each time invalidates any effect keyed
 * on the ladder's identity.
 */
let sharedLyricLadder: SnippetLadder | null = null;

export function lyricLadder(): SnippetLadder {
  return (sharedLyricLadder ??= SnippetLadder.of(
    SCHEDULE.map((_, index) => (index + 1) * 1000),
  ));
}

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
