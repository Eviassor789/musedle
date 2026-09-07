"use client";

import type { PlaybackState } from "@/application/ports/AudioEngine";

interface VinylRecordProps {
  readonly state: PlaybackState;
  readonly isPlaying: boolean;
  /** Size utility classes. The drawing space below scales into whatever it is. */
  readonly sizeClass: string;
}

/**
 * The record.
 *
 * Purely decorative: the transport lives in its own button below the deck, so
 * this is free to be a piece of scenery that reports state rather than a
 * control competing for the same job. It spins while audio plays and stops
 * where it stopped.
 *
 * Two details do the work. The grooves rotate but the specular highlight does
 * not - a reflection belongs to the room, not the disc, and pinning it in place
 * is what makes the spin read as a spinning object rather than a rotating
 * picture. And the grooves are deliberately not concentric-perfect: a single
 * brighter arc gives the eye something to track, without which a symmetrical
 * disc spinning at any speed looks completely still.
 */

/** Internal drawing space. The SVG scales this to whatever `size` is asked for. */
const VIEWBOX = 116;
const CENTRE = VIEWBOX / 2;

export function VinylRecord({ state, isPlaying, sizeClass }: VinylRecordProps) {
  const isLoading = state === "loading";
  const hasFailed = state === "error";

  return (
    <div
      aria-hidden
      className={`relative shrink-0 rounded-full transition-opacity duration-300 ${
        hasFailed ? "opacity-40" : ""
      } ${sizeClass}`}
    >
      <svg viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`} aria-hidden className="h-full w-full">
        <defs>
          <radialGradient id="vinyl-body" cx="38%" cy="32%" r="78%">
            <stop offset="0%" stopColor="#22222c" />
            <stop offset="55%" stopColor="#101016" />
            <stop offset="100%" stopColor="#08080c" />
          </radialGradient>

          {/* Static highlight: a soft band of room light lying across the disc. */}
          <linearGradient id="vinyl-sheen" x1="12%" y1="0%" x2="88%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.16" />
            <stop offset="38%" stopColor="#ffffff" stopOpacity="0.03" />
            <stop offset="52%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="78%" stopColor="#ffffff" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.12" />
          </linearGradient>

          <radialGradient id="vinyl-label" cx="34%" cy="28%" r="82%">
            <stop offset="0%" stopColor="var(--color-accent)" />
            <stop offset="100%" stopColor="var(--color-accent-glow)" />
          </radialGradient>
        </defs>

        {/* Everything that physically turns with the record. */}
        <g
          className="vinyl-disc"
          data-spinning={isPlaying || isLoading ? "true" : "false"}
          style={{ animationDuration: isLoading ? "6s" : "2.4s" }}
        >
          <circle cx={CENTRE} cy={CENTRE} r={CENTRE - 1} fill="url(#vinyl-body)" />

          {/* Grooves. Spacing tightens outward, the way a pressing actually is. */}
          {GROOVE_RADII.map((r, i) => (
            <circle
              key={r}
              cx={CENTRE}
              cy={CENTRE}
              r={r}
              fill="none"
              stroke="#ffffff"
              strokeOpacity={i % 3 === 0 ? 0.075 : 0.035}
              strokeWidth={0.7}
            />
          ))}

          {/* The asymmetry the eye locks onto while it turns. */}
          <path
            d={arc(CENTRE, CENTRE, 47, -34, 26)}
            fill="none"
            stroke="#ffffff"
            strokeOpacity="0.14"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path
            d={arc(CENTRE, CENTRE, 39, 150, 196)}
            fill="none"
            stroke="#ffffff"
            strokeOpacity="0.08"
            strokeWidth="1.1"
            strokeLinecap="round"
          />

          <circle cx={CENTRE} cy={CENTRE} r="22.5" fill="url(#vinyl-label)" />
          {/* A mark on the label, so its rotation is legible too. */}
          <circle cx={CENTRE} cy={CENTRE - 16} r="1.6" fill="#07070a" fillOpacity="0.28" />
          <circle
            cx={CENTRE}
            cy={CENTRE}
            r="22.5"
            fill="none"
            stroke="#07070a"
            strokeOpacity="0.22"
            strokeWidth="1"
          />
        </g>

        {/* Pinned to the room, not the disc. */}
        <circle
          cx={CENTRE}
          cy={CENTRE}
          r={CENTRE - 1}
          fill="url(#vinyl-sheen)"
          className="pointer-events-none"
        />
        <circle
          cx={CENTRE}
          cy={CENTRE}
          r={CENTRE - 1}
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.09"
          strokeWidth="1"
        />

        {/* Spindle hole, upright while the label turns beneath it. */}
        <circle cx={CENTRE} cy={CENTRE} r="3.4" fill="var(--color-app)" fillOpacity="0.85" />
      </svg>

      {/* Ring that pulses outward while audio is live. */}
      {(isPlaying || isLoading) && (
        <span className="pointer-events-none absolute inset-0 rounded-full border border-accent animate-pulse-ring" />
      )}
    </div>
  );
}

/** Groove radii, tighter toward the rim. */
const GROOVE_RADII = [26, 29, 31.5, 34, 36, 38, 39.8, 41.5, 43, 44.4, 45.7, 47, 48.2, 49.3, 50.4, 51.4, 52.4, 53.3, 54.2, 55];

/** SVG arc path between two angles, in degrees, clockwise from 12 o'clock. */
function arc(cx: number, cy: number, r: number, from: number, to: number): string {
  const point = (angle: number): [number, number] => {
    const rad = ((angle - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };
  const [x1, y1] = point(from);
  const [x2, y2] = point(to);
  const large = Math.abs(to - from) > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}
