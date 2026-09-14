"use client";

import { useEffect, useRef, useState } from "react";
import type { GameMode } from "@/domain/GameMode";
import type { Playlist } from "@/domain/entities/Playlist";
import { trackLabel } from "@/domain/entities/Track";
import { lyricLadder, nextLyricHint } from "@/domain/rules/LyricLadder";
import { SnippetLadder } from "@/domain/rules/SnippetLadder";
import { pickStartOffsetMs } from "@/domain/rules/startOffset";
import type { Settings } from "@/presentation/settings";
import { useLyrics } from "@/presentation/hooks/useLyrics";
import { useMusedleGame } from "@/presentation/hooks/useMusedleGame";
import { useSnippetPlayer } from "@/presentation/hooks/useSnippetPlayer";
import { AttemptList } from "./AttemptList";
import { GuessInput } from "./GuessInput";
import { LyricsDeck } from "./LyricsDeck";
import { PlayerDeck } from "./PlayerDeck";
import { WAVE_BAR_COUNT } from "./WaveformScrubber";
import { RoundResult } from "./RoundResult";

interface GameScreenProps {
  readonly playlist: Playlist;
  /**
   * Snapshotted when the game started, not read live. Both audio settings
   * decide the shape of a round at the moment it is created, so a game already
   * in progress must keep the rules it was dealt.
   */
  readonly settings: Settings;
  onChangePlaylist(): void;
  /** Change how this playlist is played, keeping the playlist itself. */
  onSwitchMode(mode: GameMode): void;
}

/**
 * How many songs to try before giving up on lyrics mode for a playlist.
 *
 * LRCLIB does not have everything - its catalogue thins out sharply outside
 * English - so the odd track has to be passed over. A bound stops that becoming
 * an endless shuffle through a playlist whose songs it has never heard of, and
 * when the bound is reached the round says so rather than sitting on a spinner
 * that will never resolve.
 */
const MAX_LYRIC_SKIPS = 20;

/** Close enough to the limit that another press means "from the top". */
const END_TOLERANCE_MS = 60;

export function GameScreen({
  playlist,
  settings,
  onChangePlaylist,
  onSwitchMode,
}: GameScreenProps) {
  const isLyrics = settings.mode === "lyrics";
  /*
   * Each mode brings its own ladder, because each mode has its own idea of what
   * a miss buys you: another doubling of the clip, or another hint. They used to
   * be the same length by coincidence, which meant lengthening one silently
   * granted the other an extra guess worth nothing.
   */
  const game = useMusedleGame(
    playlist,
    isLyrics
      ? lyricLadder()
      : settings.halfSecondStage
        ? SnippetLadder.hard()
        : SnippetLadder.default(),
  );
  const lyrics = useLyrics(game.answer, isLyrics);

  /*
   * Where this round's clip is lifted from. Derived rather than stored: the
   * rule is seeded on the track, so it returns the same number on every render
   * without needing to be memoised or kept in state.
   */
  const startOffsetMs = settings.randomStart
    ? pickStartOffsetMs(game.answer, game.ladder.maxDurationMs, game.state.roundSeed)
    : 0;

  /*
   * Passing null in lyrics mode keeps the audio engine entirely idle: no
   * buffering, no decode, and - the bug this fixes - nothing that can be told
   * to play. A lyrics round should never make a sound.
   */
  const player = useSnippetPlayer(isLyrics ? null : game.answer, {
    buckets: WAVE_BAR_COUNT,
    spanMs: game.ladder.maxDurationMs,
    startOffsetMs,
  });

  // How much *extra* audio a skip would buy, which is what the button promises.
  const nextUnlockSeconds = game.ladder.isFinalAttempt(game.state.attempts.length)
    ? null
    : (game.ladder.durationAtMs(game.state.attempts.length + 1) - game.unlockedMs) / 1000;

  /*
   * A song with no words cannot be a lyrics round, so move on to the next one.
   * This runs before the player has done anything, so nothing is lost - and
   * NEXT_ROUND leaves the stats alone, so a passed-over song is not a played
   * round either.
   *
   * Kept as state rather than a counter in a ref, because the player is told
   * about it by name: songs changing under you with no explanation reads as a
   * bug, and after enough of them the round has to stop shuffling and say what
   * is wrong.
   */
  const [skipped, setSkipped] = useState<readonly { id: string; label: string }[]>([]);
  /*
   * The dispatch guard, separately, in a ref. StrictMode invokes this effect
   * twice against the same answer, and a counter in state would not have been
   * updated yet the second time round - so two songs would be spent on one
   * miss. Keyed by track id, which makes the whole effect idempotent.
   */
  const handledIds = useRef(new Set<string>());

  const { nextRound } = game;
  const answerId = game.answer.id;
  const answerLabel = trackLabel(game.answer);

  useEffect(() => {
    if (!isLyrics || lyrics.status !== "missing") return;
    if (handledIds.current.has(answerId)) return;
    if (handledIds.current.size >= MAX_LYRIC_SKIPS) return;

    handledIds.current.add(answerId);
    setSkipped((previous) => [...previous, { id: answerId, label: answerLabel }]);
    nextRound();
  }, [isLyrics, lyrics.status, answerId, answerLabel, nextRound]);

  // A fresh playlist deserves a fresh budget of attempts.
  useEffect(() => {
    handledIds.current = new Set();
    setSkipped([]);
  }, [playlist.id]);

  /*
   * Time to stop shuffling and say so.
   *
   * Two ways to get here. The budget runs out on a long playlist, or - on a
   * short one - the shuffle comes back round to a song already passed over,
   * which means every track has been tried. Without the second test a
   * six-song playlist with no coverage would sit on the spinner forever,
   * having quietly run out of songs well before it ran out of budget.
   */
  const backToASkippedSong = skipped.some((entry) => entry.id === answerId);
  const outOfLyrics =
    isLyrics &&
    lyrics.status === "missing" &&
    (skipped.length >= MAX_LYRIC_SKIPS || backToASkippedSong);

  const handleSkip = (): void => {
    /*
     * The ladder value is read before dispatching, because the reducer has not
     * run yet at this point. `durationAtMs` clamps, so this is also correct on
     * the final skip, where the round ends and the whole song opens up.
     */
    const nextUnlockedMs = game.ladder.durationAtMs(game.state.attempts.length + 1);
    game.skip();

    // In lyrics mode a skip buys a hint, not a clip - touching the player here
    // was what started the answer playing quietly in the background.
    if (isLyrics) return;

    if (player.isPlaying) {
      // Mid-listen, a skip should buy more audio, not snatch away the clip you
      // are in the middle of. The engine just moves its own finish line.
      player.extendTo(nextUnlockedMs);
    } else {
      // Standing still, a skip means "let me hear the longer clue", from the top.
      player.play(0, nextUnlockedMs);
    }
  };

  const handlePlay = (): void => {
    // Resume from the playhead, unless it is already sitting at the limit - in
    // which case the only sensible reading of "play" is from the top.
    const atLimit = player.positionMs >= game.unlockedMs - END_TOLERANCE_MS;
    player.play(atLimit ? 0 : player.positionMs, game.unlockedMs);
  };

  const handleNextRound = (): void => {
    player.stop();
    game.nextRound();
  };

  return (
    <div
      // Drives the accent colour for everything inside: a Spotify game is
      // green, a YouTube game red, a pasted list cyan.
      data-source={playlist.provider}
      className="theme-transition flex w-full max-w-2xl flex-col gap-5"
    >
      <PlaylistHeader
        playlist={playlist}
        stats={game.stats}
        onChangePlaylist={onChangePlaylist}
      />

      {/*
        Guesses above, deck below. The two controls a player alternates between -
        press the record, then type - end up adjacent, and the attempt rows read
        as the history they are rather than as something still to fill in.
      */}
      {/* Nothing is being attempted once we have given up on the playlist, and
          a row announcing otherwise is the same lie the spinner used to tell. */}
      {!outOfLyrics && (
        <AttemptList
          attempts={game.state.attempts}
          maxAttempts={game.ladder.maxAttempts}
          isLive={!game.isOver}
        />
      )}

      {isLyrics ? (
        <LyricsDeck
          answer={game.answer}
          lyrics={lyrics}
          attemptIndex={game.state.attempts.length}
          isOver={game.isOver}
          roundSeed={game.state.roundSeed}
          skipped={skipped.map((entry) => entry.label)}
          outOfLyrics={outOfLyrics}
          onPlayByEar={() => onSwitchMode("audio")}
        />
      ) : (
        <PlayerDeck
          ladder={game.ladder}
          unlockedMs={game.unlockedMs}
          positionMs={player.positionMs}
          state={player.state}
          isPlaying={player.isPlaying}
          resetKey={game.answer.id}
          peaks={player.peaks}
          onPlay={handlePlay}
          onStop={player.stop}
          onSeek={player.seek}
        />
      )}

      {game.isOver ? (
        <RoundResult
          state={game.state}
          answer={game.answer}
          shareText={game.shareText}
          onNextRound={handleNextRound}
        />
      ) : outOfLyrics ? (
        // The deck below has taken over with an explanation and a way out; a
        // guess box under it would be a control with nothing to act on.
        null
      ) : (
        <GuessInput
          tracks={playlist.tracks}
          disabled={isLyrics && lyrics.status !== "ready"}
          guessedIds={game.state.attempts.flatMap((attempt) =>
            attempt.kind === "guess" ? [attempt.trackId] : [],
          )}
          nextHint={
            isLyrics
              ? nextLyricHint(game.state.attempts.length)
              : nextUnlockSeconds === null
                ? null
                : `+${nextUnlockSeconds}s`
          }
          onGuess={game.guess}
          onSkip={handleSkip}
        />
      )}

      {/*
        Host for the YouTube IFrame player. Playlists imported from Spotify
        never reach it - they carry their own audio - but a YouTube-sourced
        playlist needs a real player element in the document to drive.
      */}
      <div
        ref={player.containerRef}
        aria-hidden
        // A real 200x200 box parked offscreen rather than a 1px transparent
        // one: YouTube throttles playback in elements with no layout presence.
        className="pointer-events-none fixed -left-[9999px] top-0 h-[200px] w-[200px]"
      />
    </div>
  );
}

const SOURCE_LABELS: Record<string, string> = {
  spotify: "Spotify",
  youtube: "YouTube",
  text: "Pasted list",
};

function PlaylistHeader({
  playlist,
  stats,
  onChangePlaylist,
}: {
  playlist: Playlist;
  stats: { played: number; won: number; streak: number };
  onChangePlaylist: () => void;
}) {
  return (
    <header className="flex items-center gap-4">
      {/*
        The cover is the shortcut, the button is the label.
        Reaching for the artwork to swap what you are listening to is the
        instinct people already have from every music app; the explicit button
        stays because nothing about a picture announces that it is pressable.
      */}
      <button
        type="button"
        onClick={onChangePlaylist}
        aria-label="Change playlist"
        className="group relative size-16 shrink-0 overflow-hidden rounded-2xl border border-line
                   transition hover:border-accent/60 active:scale-95"
      >
        {playlist.artworkUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={playlist.artworkUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="size-full object-cover"
          />
        ) : (
          <span className="grid size-full place-items-center bg-muted text-fg-faint">♪</span>
        )}

        <span
          aria-hidden
          className="absolute inset-0 grid place-items-center bg-app/70 opacity-0 backdrop-blur-[2px]
                     transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          <SwapIcon className="size-5 text-accent" />
        </span>
      </button>

      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-lg font-bold text-fg">{playlist.title}</h1>
        <p className="truncate text-[13px] text-fg-faint">
          {/* The source lives here rather than in a badge of its own - it is one
              more detail about the playlist, not a headline. */}
          <span className="inline-flex items-center gap-1.5 align-middle">
            <span aria-hidden className="size-1.5 rounded-full bg-accent" />
            {SOURCE_LABELS[playlist.provider] ?? playlist.provider}
          </span>
          {" · "}
          {playlist.tracks.length} songs
          {stats.played > 0 && (
            <>
              {" · "}
              {stats.won}/{stats.played} correct
              {stats.streak > 1 && ` · ${stats.streak} streak`}
            </>
          )}
        </p>
      </div>

      <button
        type="button"
        onClick={onChangePlaylist}
        className="flex shrink-0 items-center gap-2 rounded-full border-2 border-line bg-surface
                   px-3 py-2 text-sm font-semibold text-fg-dim transition
                   hover:border-accent hover:bg-raised hover:text-accent active:scale-95
                   sm:px-4"
      >
        <SwapIcon className="size-4" />
        <span className="hidden sm:inline">Change</span>
      </button>
    </header>
  );
}

/** Two arrows trading places - swap this playlist for another. */
function SwapIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h13l-3.5-3.5" />
      <path d="M20 16H7l3.5 3.5" />
    </svg>
  );
}
