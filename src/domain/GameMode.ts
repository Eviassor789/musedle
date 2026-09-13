/**
 * How a round gives its clues.
 *
 * `audio` unlocks more seconds of the recording with each miss; `lyrics`
 * unlocks more of the words. The rules underneath - a win, a loss on the last
 * rung, a near miss on the artist - are the same either way, which is why the
 * mode is a single value rather than two games. Only the ladder differs, and
 * each mode brings its own.
 */
export type GameMode = "audio" | "lyrics";

export const GAME_MODES: readonly GameMode[] = ["audio", "lyrics"];

export function isGameMode(value: unknown): value is GameMode {
  return value === "audio" || value === "lyrics";
}
