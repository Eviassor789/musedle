"use client";

/**
 * Ends a snippet at the right playback position, and never hangs.
 *
 * The obvious implementation - poll getCurrentTime() in requestAnimationFrame -
 * has a correctness bug hiding in it: rAF is throttled hard whenever the page
 * is backgrounded, occluded, or rendered offscreen, sometimes to a single frame
 * per second. Frame-driven cutting therefore makes the length of the clue
 * depend on the frame rate, and any watchdog living inside that loop stops
 * being a watchdog at exactly the moment it is needed.
 *
 * So the cut runs on self-correcting timers, which keep firing when frames do
 * not, and rAF is demoted to what it is actually good for: painting a smooth
 * progress bar. If frames stop, the audio still stops on time and the reported
 * position still advances - only its smoothness is lost.
 */

export interface SnippetCutterOptions {
  readonly durationMs: number;
  /** Elapsed playback ms, or null while playback has not really started. */
  readElapsedMs(): number | null;
  onProgress(elapsedMs: number): void;
  /** The snippet reached its full length, at this elapsed position. */
  onDone(elapsedMs: number): void;
  /** Playback never started; treat the track as unplayable. */
  onStall(): void;
  readonly stallAfterMs: number;
  /**
   * True once the media has run out before the snippet was satisfied.
   *
   * Spotify previews are not a fixed length - observed anywhere from 16 to 28
   * seconds - so the last rung of the ladder can ask for more audio than the
   * clip actually contains. Without this the position simply stops advancing
   * short of the target and the cut never fires at all.
   */
  isExhausted?(): boolean;
}

/** Never sleep longer than this, so progress stays responsive near the end. */
const MAX_SLEEP_MS = 120;
const MIN_SLEEP_MS = 12;

export class SnippetCutter {
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private frameId: number | null = null;
  private startedAt = 0;
  private running = false;
  private durationMs: number;

  constructor(private readonly options: SnippetCutterOptions) {
    this.durationMs = options.durationMs;
  }

  /**
   * Moves the finish line while the snippet is still running.
   *
   * Skipping mid-playback buys more audio; it should not restart the clip the
   * player is already listening to. Only ever extends - a shorter limit would
   * cut off audio that has already been earned.
   */
  extendTo(durationMs: number): void {
    this.durationMs = Math.max(this.durationMs, durationMs);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.startedAt = performance.now();
    this.tick();
    this.paint();
  }

  stop(): void {
    this.running = false;
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }

  /** Authoritative loop: decides when the snippet ends. Timer-driven. */
  private tick = (): void => {
    if (!this.running) return;

    const { readElapsedMs, onDone, onStall, stallAfterMs } = this.options;
    const durationMs = this.durationMs;
    const elapsed = readElapsedMs();

    if (elapsed === null) {
      if (performance.now() - this.startedAt > stallAfterMs) {
        this.stop();
        onStall();
        return;
      }
      this.timerId = setTimeout(this.tick, MIN_SLEEP_MS);
      return;
    }

    if (elapsed >= durationMs || this.options.isExhausted?.()) {
      this.stop();
      onDone(elapsed);
      return;
    }

    /*
     * Report position from the timer as well as from the frame loop.
     *
     * The playhead is game state - it decides where the next press resumes -
     * not just decoration, so it cannot be left to requestAnimationFrame, which
     * is suspended entirely while a tab is hidden. The frame loop still runs
     * and simply makes the same value smoother between ticks.
     */
    this.options.onProgress(Math.max(0, elapsed));

    // Sleep for what is left, capped so the final approach stays tight and any
    // stall in playback is noticed promptly.
    const remaining = durationMs - elapsed;
    this.timerId = setTimeout(this.tick, clamp(remaining, MIN_SLEEP_MS, MAX_SLEEP_MS));
  };

  /** Cosmetic loop: drives the progress bar, free to be throttled. */
  private paint = (): void => {
    if (!this.running || typeof requestAnimationFrame !== "function") return;
    const elapsed = this.options.readElapsedMs();
    if (elapsed !== null) this.options.onProgress(Math.max(0, elapsed));
    this.frameId = requestAnimationFrame(this.paint);
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
