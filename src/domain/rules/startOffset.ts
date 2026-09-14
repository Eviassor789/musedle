import type { Track } from "@/domain/entities/Track";
import { seededRandom } from "./seededRandom";

/**
 * Where inside the recording a round should begin.
 *
 * Starting every round at 0:00 makes the game partly a test of how well you
 * know intros, which is a different skill from knowing songs - and a generous
 * one, because an intro is the most distinctive four bars most tracks have.
 * Dropping the player somewhere in the body of the song removes that crutch.
 */

/**
 * The share of the song skipped at each end.
 *
 * The head is where label idents, count-ins and spoken tags live; the tail is
 * where fades, outros and dead air do. Neither makes a fair clue, and both are
 * proportionally sized because a ninety-second punk song and a seven-minute
 * album closer do not have intros of the same length.
 */
const INTRO_SHARE = 0.15;
const OUTRO_SHARE = 0.15;

export function pickStartOffsetMs(track: Track, spanMs: number, roundSeed: string): number {
  /*
   * Only YouTube-backed tracks can move.
   *
   * A Spotify preview is already a thirty-second excerpt the service chose
   * from somewhere in the middle of the song - the feature, applied to it,
   * would be moving a window that has already been moved. Worse, the last rung
   * needs sixteen of those thirty seconds, so any offset worth calling random
   * would run the clip out of audio before the ladder finished.
   */
  if (track.source.kind !== "youtube") return 0;

  const { durationMs } = track;
  if (durationMs === null || !Number.isFinite(durationMs)) return 0;

  const earliest = durationMs * INTRO_SHARE;
  // The whole ladder has to fit before the outro, or the final clue would run
  // off the end of the song and be cut short through no fault of the player.
  const latest = durationMs * (1 - OUTRO_SHARE) - spanMs;
  if (latest <= earliest) return 0;

  /*
   * Seeded, not rolled fresh - but seeded on the *round*, not the track.
   *
   * A round is a puzzle and a puzzle that moves under you is not one: this is
   * read during render, and a Math.random here would hand back a different
   * answer on every repaint. The seed has to hold still for exactly as long as
   * the round lasts and no longer, though. Seeded on the track alone, as it
   * was, a song opened at the same instant in every session forever, so playing
   * a playlist twice asked the identical question twice.
   */
  const random = seededRandom(`start:${track.id}:${roundSeed}`);
  return Math.round(earliest + random() * (latest - earliest));
}
