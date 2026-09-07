"use client";

import { useState } from "react";
import type { GameState } from "@/domain/GameEngine";
import type { Track } from "@/domain/entities/Track";
import { RevealPlayer, playerShowsItsOwnVisual } from "./RevealPlayer";

interface RoundResultProps {
  readonly state: GameState;
  readonly answer: Track;
  readonly shareText: string;
  onNextRound(): void;
}

/**
 * The reveal.
 *
 * Win or lose, this always names the answer - the payoff for a near-miss is
 * finding out what it was, and hiding that to punish a loss just makes people
 * close the tab.
 *
 * There is exactly one picture of the song. A YouTube embed already shows the
 * video, so pairing it with the track's artwork puts the same song on screen
 * twice; the artwork only appears when the player has no visual of its own. The
 * title sits under whichever one is showing, captioning it.
 */
export function RoundResult({ state, answer, shareText, onNextRound }: RoundResultProps) {
  const won = state.status === "won";
  const attemptCount = state.attempts.length;
  const playerIsTheVisual = playerShowsItsOwnVisual(answer.source);

  return (
    <div className="animate-rise surface flex flex-col items-center gap-4 rounded-3xl p-6 text-center">
      <div className="flex flex-col items-center gap-1">
        <p
          className={`text-xs font-semibold uppercase tracking-[0.18em] ${
            won ? "text-correct" : "text-wrong"
          }`}
        >
          {won ? "Got it" : "Out of guesses"}
        </p>
        <p className="text-sm text-fg-faint">
          {won
            ? `In ${attemptCount} ${attemptCount === 1 ? "try" : "tries"}`
            : "Better luck on the next one"}
        </p>
      </div>

      {!playerIsTheVisual && answer.artworkUrl && (
        // A plain <img>: the artwork hosts vary per provider and carry signed
        // query strings, which the image optimiser handles poorly.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={answer.artworkUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="size-28 rounded-2xl object-cover shadow-lg shadow-black/50"
        />
      )}

      {/* The answer, then the means to hear it: name first, player under it. */}
      <div className="flex flex-col gap-1">
        <h2 className="text-balance text-lg font-semibold leading-tight text-fg">
          {answer.title}
        </h2>
        <p className="text-sm text-fg-dim">{answer.artists.join(", ")}</p>
      </div>

      <RevealPlayer source={answer.source} />

      <div className="flex w-full flex-col gap-2.5">
        <button
          type="button"
          onClick={onNextRound}
          className="w-full rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-app transition
                     hover:bg-accent-glow active:scale-[0.98]"
        >
          Next song
        </button>
        <ShareButton shareText={shareText} />
      </div>
    </div>
  );
}

function ShareButton({ shareText }: { shareText: string }) {
  const [copied, setCopied] = useState(false);

  const share = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked (insecure origin, denied permission) - stay quiet
      // rather than throwing an error at someone for pressing "share".
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void share()}
      className="w-full rounded-2xl border border-line px-4 py-3 text-sm font-semibold text-fg-dim
                 transition hover:border-muted hover:bg-surface active:scale-[0.98]"
    >
      {copied ? "Copied to clipboard" : "Copy result"}
    </button>
  );
}
