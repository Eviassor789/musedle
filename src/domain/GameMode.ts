/**
 * How a round gives its clues.
 *
 * `audio` unlocks more seconds of the recording with each miss; `lyrics`
 * unlocks more of the words. The rules underneath - five attempts, a win, a
 * near miss on the artist - are the same either way, which is why the mode is
 * a single value rather than two games.
 */
export type GameMode = "audio" | "lyrics";

export const GAME_MODES: readonly GameMode[] = ["audio", "lyrics"];

export function isGameMode(value: unknown): value is GameMode {
  return value === "audio" || value === "lyrics";
}
