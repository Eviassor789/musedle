"use client";

import { useMemo } from "react";
import type { Lyrics } from "@/domain/entities/Lyrics";
import type { Track } from "@/domain/entities/Track";
import { lyricRevealAt, MAX_LYRIC_LINES } from "@/domain/rules/LyricLadder";
import { pickLyricLines } from "@/domain/rules/lyricLines";
import type { LyricsState } from "@/presentation/hooks/useLyrics";

interface LyricsDeckProps {
  readonly answer: Track;
  readonly lyrics: LyricsState;
  /** How many misses so far - decides how much has been given away. */
  readonly attemptIndex: number;
  /** A finished round shows everything, win or lose. */
  readonly isOver: boolean;
}

/**
 * The lyrics equivalent of the player deck.
 *
 * Each miss buys another piece of the puzzle - a second line, the artist, the
 * album - so the panel grows downward as the round goes on rather than swapping
 * its contents. Lines already shown stay put: taking a clue away to make room
 * for a new one would be a strange way to reward a wrong guess.
 */
export function LyricsDeck({ answer, lyrics, attemptIndex, isOver }: LyricsDeckProps) {
  const words = lyrics.status === "ready" ? lyrics.lyrics : null;

  /*
   * Chosen once per song, not per render.
   *
   * Seeded on the track id so the same round always quotes the same lines -
   * re-rolling them on every repaint would make the clue shift under the
   * player mid-guess.
   */
  const chosenLines = useMemo(
    () => (words ? pickLyricLines(words.lines, MAX_LYRIC_LINES, answer.id) : []),
    [words, answer.id],
  );

  if (lyrics.status === "loading" || lyrics.status === "idle") {
    return (
      <section className="surface flex min-h-40 items-center justify-center rounded-3xl p-6">
        <span className="flex items-center gap-3 text-sm text-fg-faint">
          <span className="size-4 animate-spin rounded-full border-2 border-muted border-t-accent" />
          Finding the words…
        </span>
      </section>
    );
  }

  if (lyrics.status === "missing" || !words) {
    return (
      <section className="surface flex min-h-40 items-center justify-center rounded-3xl p-6">
        <span className="text-sm text-fg-faint">No lyrics for this one - picking another…</span>
      </section>
    );
  }

  const reveal = isOver ? lyricRevealAt(Number.MAX_SAFE_INTEGER) : lyricRevealAt(attemptIndex);

  /*
   * When the album is unknown the album hint would be a blank space, so that
   * rung spends itself on an extra line instead. Every miss stays worth
   * something.
   */
  const albumIsUsable = words.albumName !== null;
  const lineCount = reveal.lines + (reveal.album && !albumIsUsable ? 1 : 0);
  const visibleLines = chosenLines.slice(0, Math.min(lineCount, chosenLines.length));

  return (
    <section className="surface flex flex-col gap-4 rounded-3xl p-5 sm:p-6">
      <ol className="flex flex-col gap-3">
        {visibleLines.map((line, index) => (
          <li
            key={line}
            className={`animate-rise border-l-2 pl-3.5 text-balance text-[17px] leading-snug sm:text-lg ${
              index === 0 ? "border-accent text-fg" : "border-muted text-fg-dim"
            }`}
          >
            “{line}”
          </li>
        ))}
      </ol>

      {(reveal.artist || (reveal.album && albumIsUsable)) && (
        <div className="flex flex-wrap gap-2 border-t border-line pt-3.5">
          {reveal.artist && <HintChip label="Artist" value={answer.artists.join(", ")} />}
          {reveal.album && albumIsUsable && (
            <HintChip label="Album" value={words.albumName ?? ""} />
          )}
        </div>
      )}
    </section>
  );
}

function HintChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="animate-rise inline-flex items-center gap-2 rounded-full border border-line bg-app px-3 py-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
        {label}
      </span>
      <span className="text-sm font-medium text-fg">{value}</span>
    </span>
  );
}
