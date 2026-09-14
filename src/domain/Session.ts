import { createGame, reduceGame, type GameAction, type GameState } from "./GameEngine";
import type { SnippetLadder } from "./rules/SnippetLadder";

/**
 * A run of consecutive rounds on one playlist.
 *
 * Stats live in the same pure reduction as the game itself rather than in a
 * separate setState call. That is not tidiness: recording a win is a *side
 * effect of a transition*, and the only way to know a transition happened is to
 * see the before and after states together. Doing it any other way - a callback
 * inside a state updater, or an effect watching `status` - either double-counts
 * under StrictMode or races the render that caused it.
 */

export interface SessionStats {
  readonly played: number;
  readonly won: number;
  readonly streak: number;
  readonly bestStreak: number;
}

export const EMPTY_STATS: SessionStats = { played: 0, won: 0, streak: 0, bestStreak: 0 };

export interface SessionState {
  readonly game: GameState;
  readonly stats: SessionStats;
  /** Answers already used, so rounds do not repeat until the playlist runs dry. */
  readonly usedIds: readonly string[];
}

export type SessionAction =
  | GameAction
  | {
      readonly type: "NEXT_ROUND";
      readonly answerId: string;
      /**
       * Fresh randomness for the round being started. Supplied by the caller
       * for the same reason `answerId` is: the reducer stays pure, and every
       * unpredictable thing about a round arrives as data rather than being
       * conjured inside it.
       */
      readonly roundSeed: string;
      /** Set when the playlist has been exhausted and the cycle starts over. */
      readonly resetUsed?: boolean;
    };

export function createSession(
  answerId: string,
  ladder: SnippetLadder,
  roundSeed = "",
): SessionState {
  return { game: createGame(answerId, ladder, roundSeed), stats: EMPTY_STATS, usedIds: [] };
}

function recordResult(stats: SessionStats, won: boolean): SessionStats {
  const streak = won ? stats.streak + 1 : 0;
  return {
    played: stats.played + 1,
    won: stats.won + (won ? 1 : 0),
    streak,
    bestStreak: Math.max(stats.bestStreak, streak),
  };
}

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  if (action.type === "NEXT_ROUND") {
    const previousAnswer = state.game.answerTrackId;
    const usedIds = action.resetUsed
      ? []
      : state.usedIds.includes(previousAnswer)
        ? state.usedIds
        : [...state.usedIds, previousAnswer];

    return {
      game: createGame(action.answerId, state.game.ladder, action.roundSeed),
      stats: state.stats,
      usedIds,
    };
  }

  const game = reduceGame(state.game, action);
  // reduceGame returns the same object when the action changed nothing.
  if (game === state.game) return state;

  const justEnded = state.game.status === "in_progress" && game.status !== "in_progress";
  return {
    game,
    stats: justEnded ? recordResult(state.stats, game.status === "won") : state.stats,
    usedIds: state.usedIds,
  };
}
