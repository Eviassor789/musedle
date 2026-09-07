"use client";

import type { PlaybackState } from "@/application/ports/AudioEngine";
import type { SnippetLadder } from "@/domain/rules/SnippetLadder";
import { VinylRecord } from "./VinylRecord";
import { WaveformScrubber } from "./WaveformScrubber";

interface PlayerDeckProps {
  readonly ladder: SnippetLadder;
  readonly unlockedMs: number;
  readonly positionMs: number;
  readonly state: PlaybackState;
  readonly isPlaying: boolean;
  /** Identifies the current round, so the wave reseeds when the song changes. */
  readonly resetKey: string;
  /** One level per bar for the whole clip; null while decoding or unreadable. */
  readonly peaks: Float32Array | null;
  onPlay(): void;
  onStop(): void;
  onSeek(ms: number): void;
}

/*
 * The record sits inside the wave's height band rather than matching it, and
 * the transport sits on its own row underneath both. Separating them lets the
 * record be scenery and the wave be a readout, without either one having to
 * double as a button.
 */
const ROW_HEIGHT = "h-24 sm:h-28";
const RECORD_SIZE = "size-20 sm:size-24";

export function PlayerDeck({
  ladder,
  unlockedMs,
  positionMs,
  state,
  isPlaying,
  resetKey,
  peaks,
  onPlay,
  onStop,
  onSeek,
}: PlayerDeckProps) {
  const unlockedSeconds = unlockedMs / 1000;
  const hasFailed = state === "error";
  const isLoading = state === "loading";

  return (
    <section className="surface theme-transition flex flex-col gap-4 rounded-3xl p-5">
      <div className="flex items-start gap-4">
        {/* Centred within the wave's height, so the record reads as aligned
            with it rather than floating at the top. */}
        <div className={`grid shrink-0 place-items-center ${ROW_HEIGHT}`}>
          <VinylRecord state={state} isPlaying={isPlaying} sizeClass={RECORD_SIZE} />
        </div>

        <div className="min-w-0 flex-1">
          <WaveformScrubber
            ladder={ladder}
            unlockedMs={unlockedMs}
            positionMs={positionMs}
            isPlaying={isPlaying}
            resetKey={resetKey}
            heightClass={ROW_HEIGHT}
            peaks={peaks}
            onSeek={onSeek}
          />
        </div>
      </div>

      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={isPlaying ? onStop : onPlay}
          disabled={hasFailed}
          aria-label={
            hasFailed
              ? "Audio unavailable for this track"
              : isPlaying
                ? "Stop"
                : `Play ${unlockedSeconds} second${unlockedSeconds === 1 ? "" : "s"}`
          }
          className="grid size-12 place-items-center rounded-full bg-accent text-app
                     transition duration-300 hover:bg-accent-glow active:scale-95
                     disabled:cursor-not-allowed disabled:bg-muted disabled:text-fg-faint"
        >
          {isLoading ? (
            <span className="size-4 animate-spin rounded-full border-2 border-app/30 border-t-app" />
          ) : isPlaying ? (
            <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-current">
              <rect x="6" y="5" width="4" height="14" rx="1.2" />
              <rect x="14" y="5" width="4" height="14" rx="1.2" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden className="ml-0.5 size-5 fill-current">
              <path d="M8 5.14v13.72a1 1 0 0 0 1.53.85l10.4-6.86a1 1 0 0 0 0-1.7L9.53 4.29A1 1 0 0 0 8 5.14Z" />
            </svg>
          )}
        </button>

        {/*
          No running commentary under the button - the wave and the second
          markers already say how much is unlocked. A failure is the exception:
          a dimmed button alone would not explain itself.
        */}
        {hasFailed && (
          <p className="text-center text-[13px] text-wrong" role="alert">
            Audio unavailable for this track
          </p>
        )}
      </div>
    </section>
  );
}
