"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { trackLabel, type Track } from "@/domain/entities/Track";
import { rankByQuery } from "@/domain/rules/similarity";

interface GuessInputProps {
  readonly tracks: readonly Track[];
  readonly disabled: boolean;
  /** Track ids already guessed this round - they never come back. */
  readonly guessedIds: readonly string[];
  /**
   * What the next miss would reveal, already phrased - "+2s" in audio mode,
   * "the artist" in lyrics mode. Null on the final attempt, where a skip is
   * simply giving up.
   */
  readonly nextHint: string | null;
  onGuess(track: Track): void;
  onSkip(): void;
}

/**
 * Type-ahead over the playlist.
 *
 * Guesses are constrained to songs that are actually in the playlist - free
 * text would mean fuzzy-matching a player's spelling against the answer, and
 * arguing with someone about whether their typo counted is not a game
 * mechanic. Picking from a list also makes the puzzle honest: the answer is
 * always somewhere in front of you.
 *
 * Choosing a song *is* the guess - by click, by tap, or by Enter. There is no
 * confirm step, because there is nothing to confirm: the list only ever holds
 * songs from this playlist, and a song already guessed is removed from it, so
 * the only way to pick wrong is to pick the wrong song. A separate Submit
 * button could never be anything but an extra press.
 *
 * Implemented as a proper ARIA combobox: arrow keys move the active option,
 * Enter commits it, Escape closes the list.
 */
export function GuessInput({
  tracks,
  disabled,
  guessedIds,
  nextHint,
  onGuess,
  onSkip,
}: GuessInputProps) {
  const listboxId = useId();
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  // A song you have already tried is not a guess you can make again, so it
  // stops being offered rather than being offered and rejected.
  const remaining = useMemo(() => {
    const guessed = new Set(guessedIds);
    return tracks.filter((track) => !guessed.has(track.id));
  }, [tracks, guessedIds]);

  const matches = useMemo(
    () => rankByQuery(remaining, query, trackLabel),
    [remaining, query],
  );

  // Keep the active option inside the list whenever the results change.
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const choose = (track: Track): void => {
    if (disabled) return;
    onGuess(track);
    setQuery("");
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (isOpen) setIsOpen(false);
      else setQuery("");
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const active = matches[activeIndex];
      if (isOpen && active) choose(active);
      return;
    }

    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;

    event.preventDefault();
    if (!isOpen && matches.length > 0) {
      setIsOpen(true);
      return;
    }
    if (matches.length === 0) return;

    setActiveIndex((prev) => {
      const delta = event.key === "ArrowDown" ? 1 : -1;
      return (prev + delta + matches.length) % matches.length;
    });
  };

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          disabled={disabled}
          placeholder="Know it? Start typing…"
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={isOpen && matches.length > 0}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            isOpen && matches[activeIndex] ? optionId(activeIndex) : undefined
          }
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsOpen(query.length > 0)}
          // Delay so a click on an option lands before the list unmounts.
          onBlur={() => window.setTimeout(() => setIsOpen(false), 120)}
          className="w-full rounded-2xl border border-line bg-surface px-4 py-3.5 text-[15px] text-fg
                     placeholder:text-fg-faint transition
                     hover:border-muted focus:border-accent/50 focus:outline-none
                     disabled:cursor-not-allowed disabled:opacity-50"
        />

        {isOpen && matches.length > 0 && (
          <ul
            id={listboxId}
            role="listbox"
            aria-label="Matching songs"
            className="surface absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl p-1.5 shadow-2xl shadow-black/60"
          >
            {matches.map((track, index) => (
              <li
                key={track.id}
                id={optionId(index)}
                role="option"
                aria-selected={index === activeIndex}
              >
                <button
                  type="button"
                  // onMouseDown, not onClick: blur fires first and would close
                  // the list before the click could land.
                  onMouseDown={(event) => {
                    event.preventDefault();
                    choose(track);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`flex w-full items-baseline gap-2 rounded-xl px-3 py-2.5 text-left transition ${
                    index === activeIndex ? "bg-line/70" : "hover:bg-muted/60"
                  }`}
                >
                  <span className="truncate text-[15px] text-fg">{track.title}</span>
                  <span className="truncate text-[13px] text-fg-faint">
                    {track.artists.join(", ")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={onSkip}
        disabled={disabled}
        className="w-full rounded-2xl border border-line bg-transparent px-4 py-3 text-sm font-semibold text-fg-dim
                   transition hover:border-muted hover:bg-surface active:scale-[0.99]
                   disabled:cursor-not-allowed disabled:opacity-40"
      >
        {nextHint === null ? "Give up" : `Skip (${nextHint})`}
      </button>
    </div>
  );
}
