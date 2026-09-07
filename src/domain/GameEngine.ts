import { SnippetLadder } from "./rules/SnippetLadder";

export type GameStatus = "in_progress" | "won" | "lost";

export type Attempt =
  | { readonly kind: "skipped" }
  | {
      readonly kind: "guess";
      readonly trackId: string;
      readonly label: string;
      readonly correct: boolean;
      /** Right artist, wrong song: a near miss rather than a plain miss. */
      readonly artistMatch: boolean;
    };

export interface GameState {
  readonly answerTrackId: string;
  readonly ladder: SnippetLadder;
  readonly attempts: readonly Attempt[];
  readonly status: GameStatus;
}

export type GameAction =
  | { readonly type: "SKIP" }
  | {
      readonly type: "GUESS";
      readonly trackId: string;
      readonly label: string;
      readonly artistMatch: boolean;
    };

export function createGame(answerTrackId: string, ladder = SnippetLadder.default()): GameState {
  return { answerTrackId, ladder, attempts: [], status: "in_progress" };
}

/**
 * The single source of truth for game progression.
 *
 * Pure and synchronous on purpose: no audio, no network, no React. Everything
 * the UI shows is derived from this state via the selectors below, which keeps
 * the rules testable in isolation and impossible to desync from the view.
 */
export function reduceGame(state: GameState, action: GameAction): GameState {
  if (state.status !== "in_progress") return state;

  const attemptIndex = state.attempts.length;
  const isFinal = state.ladder.isFinalAttempt(attemptIndex);

  const attempt: Attempt =
    action.type === "SKIP"
      ? { kind: "skipped" }
      : {
          kind: "guess",
          trackId: action.trackId,
          label: action.label,
          correct: action.trackId === state.answerTrackId,
          artistMatch: action.artistMatch,
        };

  const won = attempt.kind === "guess" && attempt.correct;

  return {
    ...state,
    attempts: [...state.attempts, attempt],
    status: won ? "won" : isFinal ? "lost" : "in_progress",
  };
}

/* ---------------------------------- selectors --------------------------------- */

export function isOver(state: GameState): boolean {
  return state.status !== "in_progress";
}

/** Attempts used so far, and how many remain. */
export function attemptsUsed(state: GameState): number {
  return state.attempts.length;
}

export function attemptsRemaining(state: GameState): number {
  return Math.max(0, state.ladder.maxAttempts - state.attempts.length);
}

/**
 * How much audio the player is allowed to hear right now.
 * A finished game unlocks the full snippet regardless of how it ended.
 */
export function unlockedMs(state: GameState): number {
  if (isOver(state)) return state.ladder.maxDurationMs;
  return state.ladder.durationAtMs(state.attempts.length);
}

/** Emoji progress bar for the share card. */
export function shareSquares(state: GameState): string {
  const squares = state.attempts.map((a) => {
    if (a.kind === "skipped") return "\u2B1C";
    if (a.correct) return "\uD83D\uDFE9";
    // Yellow for the right artist on the wrong song, the way Wordle marks a
    // correct letter in the wrong place.
    return a.artistMatch ? "\uD83D\uDFE8" : "\uD83D\uDFE5";
  });
  const blanks = "\u2B1B".repeat(attemptsRemaining(state));
  return squares.join("") + blanks;
}
