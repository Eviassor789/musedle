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
  /** Songs passed over for having no usable words, most recent last. */
  readonly skipped: readonly string[];
  /** Too many in a row: this playlist is not going to work in lyrics mode. */
  readonly outOfLyrics: boolean;
  onPlayByEar(): void;
}

/**
 * The lyrics equivalent of the player deck.
 *
 * Each miss buys another piece of the puzzle - a second line, the artist, the
 * album - so the panel grows downward as the round goes on rather than swapping
 * its contents. Lines already shown stay put: taking a clue away to make room
 * for a new one would be a strange way to reward a wrong guess.
 */
export function LyricsDeck({
  answer,
  lyrics,
  attemptIndex,
  isOver,
  skipped,
  outOfLyrics,
  onPlayByEar,
}: LyricsDeckProps) {
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

  /*
   * Given up on this playlist.
   *
   * Checked before the spinner, because this is precisely the state that used
   * to sit on "picking another…" forever - the search had stopped and the
   * message was still promising it hadn't.
   */
  if (outOfLyrics) {
    return (
      <section className="surface animate-rise flex min-h-40 flex-col items-center justify-center gap-3 rounded-3xl p-6 text-center">
        <h2 className="font-display text-lg font-bold text-fg">No words for this playlist</h2>
        <p className="max-w-sm text-balance text-[13px] leading-relaxed text-fg-dim">
          We looked up {skipped.length} songs from it and found lyrics for none of them. The
          database behind this mode is strongest in English; other languages are hit and miss.
        </p>
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          {/* The remedy, not just the diagnosis: the same playlist plays fine
              by ear, and that is one tap away rather than a trip back out. */}
          <button
            type="button"
            onClick={onPlayByEar}
            className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-app
                       transition hover:bg-accent-glow active:scale-95"
          >
            Play it by ear instead
          </button>
        </div>
        <SkippedList skipped={skipped} />
      </section>
    );
  }

  // Loading, idle, and "missing but still searching" are one state to the
  // player: we are looking. Saying which song just failed is what stops the
  // shuffling underneath from reading as a glitch.
  if (lyrics.status === "loading" || lyrics.status === "idle" || lyrics.status === "missing" || !words) {
    const lastSkipped = skipped[skipped.length - 1];
    return (
      <section className="surface flex min-h-40 flex-col items-center justify-center gap-2 rounded-3xl p-6 text-center">
        <span className="flex items-center gap-3 text-sm text-fg-faint">
          <span className="size-4 animate-spin rounded-full border-2 border-muted border-t-accent" />
          Finding the words…
        </span>
        {lastSkipped && (
          <p className="animate-rise max-w-sm text-balance text-[12px] leading-relaxed text-fg-faint">
            No lyrics for <span className="text-fg-dim">{lastSkipped}</span> — trying another
            {skipped.length > 1 && ` (${skipped.length} skipped so far)`}.
          </p>
        )}
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

/**
 * Which songs came up empty, behind a disclosure.
 *
 * Folded away because the headline number is the useful part and eight titles
 * is a wall of text - but available, because "none of them" is a claim worth
 * being able to check.
 */
function SkippedList({ skipped }: { skipped: readonly string[] }) {
  if (skipped.length === 0) return null;

  return (
    <details className="mt-1 w-full max-w-sm text-left">
      <summary className="cursor-pointer list-none text-center text-[11px] uppercase tracking-[0.14em] text-fg-faint transition-colors hover:text-fg-dim">
        Which songs?
      </summary>
      <ul className="mt-2 flex flex-col gap-1 rounded-xl border border-line bg-app/50 p-3">
        {skipped.map((label) => (
          <li key={label} className="truncate text-[12px] text-fg-faint">
            {label}
          </li>
        ))}
      </ul>
    </details>
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
