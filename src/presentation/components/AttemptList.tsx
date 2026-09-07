"use client";

import type { Attempt } from "@/domain/GameEngine";

interface AttemptListProps {
  readonly attempts: readonly Attempt[];
  readonly maxAttempts: number;
  /** True while the round is still live, so the active row can say so. */
  readonly isLive: boolean;
}

/** One row per rung of the ladder: filled behind you, waiting ahead. */
export function AttemptList({ attempts, maxAttempts, isLive }: AttemptListProps) {
  const rows = Array.from({ length: maxAttempts }, (_, index) => attempts[index] ?? null);

  return (
    <ol className="flex w-full flex-col gap-1.5" aria-label="Your attempts">
      {rows.map((attempt, index) => (
        <li key={index}>
          <AttemptRow
            attempt={attempt}
            isCurrent={attempt === null && index === attempts.length && isLive}
          />
        </li>
      ))}
    </ol>
  );
}

function AttemptRow({ attempt, isCurrent }: { attempt: Attempt | null; isCurrent: boolean }) {
  if (!attempt) {
    if (isCurrent) {
      // The rung being played right now. Naming it means the row you are about
      // to fill is never mistaken for one of the empty ones below it.
      return (
        <div className="flex h-11 items-center gap-2.5 rounded-xl border border-dashed border-accent/50 bg-accent-tint px-3.5">
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-accent animate-source-dot" />
          <span className="text-sm font-medium text-accent">Listening</span>
        </div>
      );
    }

    return <div className="h-11 rounded-xl border border-dashed border-muted bg-surface/70" />;
  }

  if (attempt.kind === "skipped") {
    return (
      <div className="flex h-11 animate-rise items-center gap-2.5 rounded-xl border border-muted bg-surface px-3.5">
        <Marker className="bg-fg-faint/20 text-fg-faint">–</Marker>
        <span className="text-sm text-fg-faint">Skipped</span>
      </div>
    );
  }

  const { correct, artistMatch } = attempt;

  /*
   * Three outcomes, three colours. Success is the fixed green rather than the
   * source accent: on a YouTube playlist the accent is red, and a correct guess
   * that looks identical to a wrong one is worse than no colour at all.
   */
  const tone = correct
    ? {
        border: "border-correct/45",
        bg: "bg-correct/10",
        chip: "bg-correct/20 text-correct",
        glyph: "✓",
      }
    : artistMatch
      ? {
          border: "border-partial/40",
          bg: "bg-partial/[0.08]",
          chip: "bg-partial/20 text-partial",
          glyph: "○",
        }
      : {
          border: "border-wrong/30",
          bg: "bg-wrong/[0.07]",
          chip: "bg-wrong/20 text-wrong",
          glyph: "✕",
        };

  return (
    <div
      className={`flex h-11 animate-rise items-center gap-2.5 rounded-xl border px-3.5 ${tone.border} ${tone.bg}`}
    >
      <Marker className={tone.chip}>{tone.glyph}</Marker>
      <span className={`truncate text-sm ${correct ? "font-medium text-fg" : "text-fg-dim"}`}>
        {attempt.label}
      </span>
      {artistMatch && !correct && (
        <span className="ml-auto shrink-0 text-[11px] font-medium uppercase tracking-wider text-partial">
          Right artist
        </span>
      )}
    </div>
  );
}

function Marker({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span
      aria-hidden
      className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${className}`}
    >
      {children}
    </span>
  );
}
