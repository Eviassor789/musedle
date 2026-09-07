"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { SnippetLadder } from "@/domain/rules/SnippetLadder";
import { placeholderWaveform } from "./waveformPlaceholder";

interface WaveformScrubberProps {
  readonly ladder: SnippetLadder;
  readonly unlockedMs: number;
  /** Playhead position in song time. */
  readonly positionMs: number;
  readonly isPlaying: boolean;
  /** Changing this reseeds the placeholder - a new round, a new shape. */
  readonly resetKey: string;
  /** One level per bar for the whole clip, or null while decoding / unreadable. */
  readonly peaks: Float32Array | null;
  /** Height utility classes, shared with the record so the row squares up. */
  readonly heightClass: string;
  onSeek(ms: number): void;
}

/**
 * The wave, the clock and the scrubber, as one object.
 *
 * The important decision is that bars are indexed by *song time* across the
 * whole ladder, not by position within the current clip. Everything else falls
 * out of that:
 *
 *  - Locked audio is simply the tail of the same wave, drawn dark, so the
 *    ladder needs no separate track to show what is still to come.
 *  - Skipping only moves the boundary between dark and light.
 *  - A bar can be scrubbed to, because its x position already means a time.
 *
 * The whole shape is present from the moment the song loads: the clip is
 * decoded up front rather than sampled as it plays, so the wave is a picture of
 * the song rather than a trail left behind the playhead. Colour is then a plain
 * progress fill over that fixed shape - lit behind the playhead, mid ahead of
 * it, dark past the unlock boundary.
 */

/**
 * Deliberately coarse. At roughly 285ms per bar they are wide enough to read as
 * rounded strokes with real air between them, which is the point; the playhead
 * is its own line, so nothing depends on the bars being finely grained.
 */
export const WAVE_BAR_COUNT = 56;

/** Share of each slot left empty. Just over half the slot is gap. */
const BAR_GAP_RATIO = 0.52;

/**
 * How much of a bar the playhead must cover before it counts as played.
 *
 * A bar spans ~285ms, so lighting it the instant the playhead touches its left
 * edge means the bar straddling the unlock boundary turns green while most of
 * the audio it represents has not been heard - it reads as the clue leaking
 * past its own limit. Requiring most of the bar keeps the fill honest.
 */
const PLAYED_THRESHOLD = 0.8;

export function WaveformScrubber({
  ladder,
  unlockedMs,
  positionMs,
  isPlaying,
  resetKey,
  peaks,
  heightClass,
  onSeek,
}: WaveformScrubberProps) {
  const totalMs = ladder.maxDurationMs;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  /**
   * Shown for audio we cannot decode - a YouTube track, or the brief moment
   * before the decode lands. Seeded from the track so two songs never get the
   * same shape, and deliberately smooth: it should read as a placeholder rather
   * than impersonate a signal nothing measured.
   */
  const placeholder = useMemo(() => placeholderWaveform(resetKey, WAVE_BAR_COUNT), [resetKey]);

  // Mirrored into refs: the draw loop runs on the display's clock, not React's,
  // and must survive the ~60 renders a second that playback causes.
  const positionRef = useRef(0);
  const unlockedRef = useRef(0);
  const playingRef = useRef(false);
  const valuesRef = useRef<Float32Array>(placeholder);
  const stepsRef = useRef<readonly number[]>(ladder.stepsMs);
  /** Set while a pointer is dragging, overriding the real playhead. */
  const dragMsRef = useRef<number | null>(null);
  /** Lets a data change force a repaint without waiting for a frame. */
  const paintRef = useRef<(() => void) | null>(null);

  positionRef.current = positionMs;
  unlockedRef.current = unlockedMs;
  playingRef.current = isPlaying;
  valuesRef.current = peaks ?? placeholder;
  stepsRef.current = ladder.stepsMs;

  const msFromClientX = useCallback(
    (clientX: number): number => {
      const track = trackRef.current;
      if (!track) return 0;
      const rect = track.getBoundingClientRect();
      const ms = ((clientX - rect.left) / rect.width) * totalMs;
      // You may scrub anywhere you have earned, and no further.
      return Math.min(Math.max(ms, 0), unlockedRef.current);
    },
    [totalMs],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    try {
      // Keeps the drag alive if the pointer leaves the track. Throws for
      // pointer ids the browser no longer considers active, which must not
      // take the whole interaction down with it.
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Dragging still works, it just stops at the edge of the element.
    }
    dragMsRef.current = msFromClientX(event.clientX);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (dragMsRef.current === null) return;
    dragMsRef.current = msFromClientX(event.clientX);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (dragMsRef.current === null) return;
    const target = msFromClientX(event.clientX);
    dragMsRef.current = null;
    // Committed on release, so dragging across a playing clip does not re-issue
    // playback on every pointer event.
    onSeek(target);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const step = event.shiftKey ? 1000 : 250;
    const moves: Record<string, number> = {
      ArrowLeft: -step,
      ArrowRight: step,
      Home: -Infinity,
      End: Infinity,
    };
    const delta = moves[event.key];
    if (delta === undefined) return;

    event.preventDefault();
    // Stepping from the ref, not the prop: a held arrow key fires faster than
    // React re-renders, and reading the prop would make every repeat start over
    // from the same stale position.
    const next =
      delta === -Infinity ? 0 : delta === Infinity ? unlockedMs : positionRef.current + delta;
    const clamped = Math.min(Math.max(next, 0), unlockedMs);

    positionRef.current = clamped;
    onSeek(clamped);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    /*
     * Colours are read from the canvas, not from the document root.
     *
     * The accent is scoped to a [data-source] ancestor so it can follow the
     * playlist's service, and the root element never sees that value - reading
     * it there would paint every playlist in the default colour. Re-read each
     * paint so switching source recolours the wave along with everything else.
     */
    const readTheme = () => {
      const styles = getComputedStyle(canvas);
      const token = (name: string, fallback: string): string =>
        styles.getPropertyValue(name).trim() || fallback;
      return {
        played: token("--color-accent", "#1db954"),
        unlocked: token("--color-fg-faint", "#6e6e76"),
        locked: token("--color-muted", "#3a3a3c"),
      };
    };

    let frameId = 0;
    let width = 0;
    let height = 0;

    /*
     * Match the backing store to the displayed size, every frame.
     *
     * Sizing once on mount is not enough: at that point layout has often not
     * settled, so the element measures zero and the canvas keeps its default
     * 300x150 buffer while CSS stretches it across the real width. The result
     * is a resampled wave with bars smeared or dropped entirely. A
     * ResizeObserver was supposed to correct that, but its callbacks are
     * delivered with the rendering lifecycle, so a throttled or occluded tab
     * can leave the canvas mis-sized indefinitely. Checking here costs a
     * property read and cannot fall out of sync.
     */
    const syncSize = (): boolean => {
      const cssWidth = canvas.clientWidth;
      const cssHeight = canvas.clientHeight;
      if (cssWidth === 0 || cssHeight === 0) return false;

      const ratio = window.devicePixelRatio || 1;
      const bufferWidth = Math.round(cssWidth * ratio);
      const bufferHeight = Math.round(cssHeight * ratio);

      if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
        canvas.width = bufferWidth;
        canvas.height = bufferHeight;
        // Assigning width/height resets the context, so the transform that maps
        // CSS pixels onto device pixels has to be reapplied here.
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
      }

      width = cssWidth;
      height = cssHeight;
      return true;
    };

    const paint = (): void => {
      if (!syncSize()) return;
      const { played: playedColor, unlocked: unlockedColor, locked: lockedColor } = readTheme();

      const values = valuesRef.current;
      const unlocked = unlockedRef.current;
      const playhead = dragMsRef.current ?? positionRef.current;

      context.clearRect(0, 0, width, height);

      const barDurationMs = totalMs / WAVE_BAR_COUNT;
      const slot = width / WAVE_BAR_COUNT;
      const barWidth = Math.max(2, slot * (1 - BAR_GAP_RATIO));
      const centreY = height / 2;
      // Leave room for the rounded cap so tall bars are not clipped flat.
      const maxHalf = height / 2 - barWidth / 2;

      for (let i = 0; i < WAVE_BAR_COUNT; i++) {
        const barStartMs = (i / WAVE_BAR_COUNT) * totalMs;
        const isLocked = barStartMs >= unlocked;
        // Green means "the playhead has covered most of this bar", not merely
        // "it has touched the left edge".
        const isPlayed = (playhead - barStartMs) / barDurationMs >= PLAYED_THRESHOLD;

        // Drawn as measured: the engine already contrast-stretched the levels,
        // and curving them again here would flatten the shape back out. Guarded
        // because a non-finite height draws *nothing* - a silently missing bar
        // rather than a visibly wrong one.
        const raw = values[i] ?? 0;
        const amplitude = Number.isFinite(raw) ? raw : 0;
        // Silence still renders as a dot rather than vanishing.
        const half = Math.max(barWidth / 2, amplitude * maxHalf);

        context.fillStyle = isPlayed ? playedColor : isLocked ? lockedColor : unlockedColor;
        context.globalAlpha = isPlayed ? 0.95 : isLocked ? 0.7 : 0.55;

        const x = i * slot + (slot - barWidth) / 2;
        roundedBar(context, x, centreY - half, barWidth, half * 2);
      }

      context.globalAlpha = 1;

      // Hairlines tying each second label to the wave above it.
      for (const stepMs of stepsRef.current) {
        const x = Math.round((stepMs / totalMs) * width) + 0.5;
        context.fillStyle = stepMs <= unlocked ? unlockedColor : lockedColor;
        context.globalAlpha = 0.5;
        context.fillRect(x, height - 5, 1, 5);
      }

      // The boundary of what has been earned.
      if (unlocked > 0 && unlocked < totalMs) {
        const x = Math.round((unlocked / totalMs) * width) + 0.5;
        context.fillStyle = unlockedColor;
        context.globalAlpha = 0.5;
        context.fillRect(x, 0, 1, height);
      }

      // Playhead last, so it sits above everything.
      context.globalAlpha = 1;
      const headX = Math.round((playhead / totalMs) * width) + 0.5;
      context.fillStyle = playedColor;
      context.fillRect(headX - 1, 0, 2, height);
      context.beginPath();
      context.arc(headX, 3, 3, 0, Math.PI * 2);
      context.fill();
    };

    /*
     * Paint once immediately, then keep painting on frames.
     *
     * requestAnimationFrame is suspended outright while a tab or pane is
     * hidden, so a purely frame-driven canvas can sit blank until it happens to
     * be looked at. The wave is mostly a still image - one synchronous paint
     * gets it right, and the loop only exists to move the playhead.
     */
    paint();
    paintRef.current = paint;

    const loop = (): void => {
      frameId = requestAnimationFrame(loop);
      paint();
    };
    frameId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frameId);
      paintRef.current = null;
    };
  }, [totalMs]);

  // The shape and the lock boundary change rarely but must show up at once,
  // even where frames are not being delivered.
  useEffect(() => {
    paintRef.current?.();
  }, [peaks, placeholder, unlockedMs, positionMs]);

  return (
    <div className="flex w-full flex-col gap-1.5">
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Playback position"
        aria-valuemin={0}
        aria-valuemax={Math.round(unlockedMs / 100) / 10}
        aria-valuenow={Math.round(positionMs / 100) / 10}
        aria-valuetext={`${(positionMs / 1000).toFixed(1)} of ${unlockedMs / 1000} seconds unlocked`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
        className={`relative w-full cursor-pointer touch-none select-none rounded-lg ${heightClass}`}
      >
        <canvas ref={canvasRef} aria-hidden className="h-full w-full" />
      </div>

      {/* The seconds, sitting under the wave they refer to. */}
      <div className="relative h-4" aria-hidden>
        {ladder.stepsMs.map((stepMs, index) => {
          const unlocked = stepMs <= unlockedMs;
          // The early rungs sit close together - on a doubling ladder the first
          // two are always the tightest pair - and collide on a narrow screen.
          // Anything with too little room to its left steps aside there.
          const previousMs = ladder.stepsMs[index - 1] ?? 0;
          const gapPercent = ((stepMs - previousMs) / totalMs) * 100;
          const crowded = index > 0 && gapPercent < 7;

          return (
            <span
              key={stepMs}
              className={`absolute -translate-x-1/2 font-mono text-[10px] tabular-nums transition-colors sm:text-[11px] ${
                crowded ? "hidden sm:inline" : ""
              } ${unlocked ? "text-fg-dim" : "text-muted"}`}
              style={{ left: `${(stepMs / totalMs) * 100}%` }}
            >
              {stepMs / 1000}s
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** A bar with fully rounded caps - a pill, or a dot when it is short. */
function roundedBar(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const r = Math.min(width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
  context.fill();
}
