"use client";

import { useCallback, useMemo, useReducer } from "react";
import {
  attemptsRemaining,
  isOver,
  shareSquares,
  unlockedMs,
  type GameState,
} from "@/domain/GameEngine";
import {
  createSession,
  sessionReducer,
  type SessionStats,
} from "@/domain/Session";
import type { Playlist } from "@/domain/entities/Playlist";
import { sharesArtist, trackLabel, type Track } from "@/domain/entities/Track";
import { SnippetLadder } from "@/domain/rules/SnippetLadder";

export interface MusedleGame {
  readonly answer: Track;
  readonly state: GameState;
  readonly ladder: SnippetLadder;
  readonly unlockedMs: number;
  readonly attemptsLeft: number;
  readonly isOver: boolean;
  readonly stats: SessionStats;
  readonly shareText: string;
  guess(track: Track): void;
  skip(): void;
  nextRound(): void;
}

/** Avoids repeating a song until the playlist has been exhausted. */
function pickAnswer(tracks: readonly Track[], usedIds: readonly string[]): Track {
  const used = new Set(usedIds);
  const unused = tracks.filter((track) => !used.has(track.id));
  const pool = unused.length > 0 ? unused : tracks;
  const index = Math.floor(Math.random() * pool.length);
  // ImportPlaylist guarantees a minimum track count, so the pool is never empty.
  return pool[index] ?? pool[0]!;
}

/**
 * Thin adapter over the pure session reducer.
 *
 * Everything stateful lives in one reducer; the only impure step - choosing a
 * random next song - happens here and is passed *into* the reducer as data.
 */
export function useMusedleGame(playlist: Playlist, ladder = SnippetLadder.default()): MusedleGame {
  const [session, dispatch] = useReducer(
    sessionReducer,
    undefined,
    () => createSession(pickAnswer(playlist.tracks, []).id, ladder),
  );

  const byId = useMemo(
    () => new Map(playlist.tracks.map((track) => [track.id, track])),
    [playlist.tracks],
  );

  const answer = byId.get(session.game.answerTrackId) ?? playlist.tracks[0]!;

  const guess = useCallback(
    (track: Track) =>
      dispatch({
        type: "GUESS",
        trackId: track.id,
        label: trackLabel(track),
        // Worked out here rather than in the reducer: the reducer only knows
        // track *ids*, and answering "same artist?" needs the tracks.
        artistMatch: sharesArtist(track.artists, answer.artists),
      }),
    [answer.artists],
  );

  const skip = useCallback(() => dispatch({ type: "SKIP" }), []);

  const nextRound = useCallback(() => {
    // +1 for the round just finished, which the reducer is about to mark used.
    const exhausted = session.usedIds.length + 1 >= playlist.tracks.length;
    const pool = exhausted ? [] : [...session.usedIds, session.game.answerTrackId];
    dispatch({
      type: "NEXT_ROUND",
      answerId: pickAnswer(playlist.tracks, pool).id,
      resetUsed: exhausted,
    });
  }, [playlist.tracks, session.game.answerTrackId, session.usedIds]);

  const shareText = useMemo(() => {
    const { game } = session;
    const heardSeconds = game.ladder.durationAtMs(Math.max(0, game.attempts.length - 1)) / 1000;
    const headline =
      game.status === "won"
        ? `Musedle - got it in ${game.attempts.length} (${heardSeconds}s)`
        : "Musedle - missed it";
    return `${headline}\n${shareSquares(game)}\n${playlist.title}`;
  }, [playlist.title, session]);

  return {
    answer,
    state: session.game,
    ladder,
    unlockedMs: unlockedMs(session.game),
    attemptsLeft: attemptsRemaining(session.game),
    isOver: isOver(session.game),
    stats: session.stats,
    shareText,
    guess,
    skip,
    nextRound,
  };
}
