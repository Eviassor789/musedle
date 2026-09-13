"use client";

import { useEffect, useState } from "react";
import { type GameMode } from "@/domain/GameMode";
import { FEATURED_PLAYLISTS } from "@/presentation/featuredPlaylists";
import { loadRecentPlaylists, type RecentPlaylist } from "@/presentation/recentPlaylists";
import type { Settings } from "@/presentation/settings";
import { RecentPlaylists } from "./RecentPlaylists";
import { SettingsPanel, SettingsToggle } from "./SettingsPanel";

interface PlaylistImportFormProps {
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly settings: Settings;
  onSettingsChange(patch: Partial<Settings>): void;
  onImport(input: string): void;
}

/**
 * The front door.
 *
 * Your own music first, ours second. Anyone arriving with a playlist in mind
 * should not have to scroll past our suggestions to use it - and anyone without
 * one finds the decade cards immediately below, one tap from a full round.
 */
export function PlaylistImportForm({
  isLoading,
  error,
  settings,
  onSettingsChange,
  onImport,
}: PlaylistImportFormProps) {
  const [input, setInput] = useState("");
  const [recent, setRecent] = useState<readonly RecentPlaylist[]>([]);
  /** Closed by default: two toggles should not greet everyone who arrives. */
  const [showSettings, setShowSettings] = useState(false);

  /*
   * Read after mount rather than during render: localStorage does not exist on
   * the server, and seeding state from it directly would make the first client
   * render disagree with the prerendered HTML.
   */
  useEffect(() => {
    setRecent(loadRecentPlaylists());
  }, []);
  /** Which card was tapped, so only that one shows the wait. */
  const [pending, setPending] = useState<string | null>(null);
  const isMultiline = input.includes("\n");

  const start = (value: string): void => {
    if (isLoading) return;
    setPending(value);
    onImport(value);
  };

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    if (input.trim()) start(input);
  };

  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-9">
      <header className="flex flex-col items-center gap-2 text-center">
        <h1 className="font-display text-6xl font-bold leading-none tracking-tight text-fg sm:text-7xl">
          Muse<span className="text-accent">dle</span>
        </h1>
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-fg-faint">
          music × wordle
        </p>
        <p className="text-balance mt-3 max-w-md text-[15px] leading-relaxed text-fg-dim">
          1 Second. 1 Song. Can You Name It?
        </p>
      </header>

      {/*
        The cog sits in the same row as the mode picker because that is what it
        qualifies: both settings behind it change what "Hear it" means. Beside
        rather than below, so opening them costs no vertical space on the fold.
      */}
      <div className="flex w-full max-w-md flex-col gap-2">
        <div className="flex items-stretch gap-2">
          <ModePicker
            mode={settings.mode}
            onChange={(mode) => onSettingsChange({ mode })}
            disabled={isLoading}
          />
          <SettingsToggle
            open={showSettings}
            disabled={isLoading}
            onClick={() => setShowSettings((open) => !open)}
          />
        </div>

        {showSettings && (
          <SettingsPanel settings={settings} disabled={isLoading} onChange={onSettingsChange} />
        )}
      </div>

      <h2 className="-mb-1 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-faint">
        Test your own taste
      </h2>

      <form onSubmit={submit} className="flex w-full flex-col gap-3">
        <label htmlFor="playlist-input" className="sr-only">
          Playlist link or song list
        </label>

        <textarea
          id="playlist-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            // Enter submits a single-line link; Shift+Enter always adds a line.
            if (event.key === "Enter" && !event.shiftKey && !isMultiline) submit(event);
          }}
          rows={isMultiline ? 6 : 1}
          spellCheck={false}
          placeholder="Paste a Spotify or YouTube playlist link…"
          className="w-full resize-y rounded-2xl border border-line bg-surface px-4 py-3.5 text-[15px] leading-relaxed
                     text-fg placeholder:text-fg-faint transition
                     hover:border-muted focus:border-accent/50 focus:outline-none"
        />

        <button
          type="submit"
          disabled={isLoading || input.trim().length === 0}
          className="flex items-center justify-center gap-2 rounded-2xl bg-accent px-4 py-3.5 text-sm font-semibold
                     text-app transition hover:bg-accent-glow active:scale-[0.99]
                     disabled:cursor-not-allowed disabled:bg-muted disabled:text-fg-faint"
        >
          {isLoading && pending === input && (
            <span className="size-4 animate-spin rounded-full border-2 border-muted border-t-app" />
          )}
          {/* Answers the heading above it: "Test your own taste" -> "Test my taste".
              Deliberately not "Play my playlist" - the field also takes a pasted
              list of songs, which is not a playlist. */}
          Drop & Play
        </button>

        {error && (
          <p
            role="alert"
            className="animate-rise rounded-xl border border-wrong/30 bg-wrong/10 px-3.5 py-2.5 text-sm text-wrong"
          >
            {error}
          </p>
        )}
      </form>

      {/*
        Between your own playlist and our suggestions. A playlist you played
        yesterday is closer to "your own taste" than anything we picked, but it
        should not sit above the field for someone arriving with a fresh link.
      */}
      <RecentPlaylists
        playlists={recent}
        isLoading={isLoading}
        pendingInput={pending}
        onPick={start}
      />

      <div className="flex w-full items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-line" />
        <span className="text-[11px] uppercase tracking-[0.16em] text-fg-faint">
          Or start with these
        </span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <section className="flex w-full flex-col gap-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
          {FEATURED_PLAYLISTS.map((featured) => {
            const isPending = pending === featured.url && isLoading;
            return (
              <button
                key={featured.url}
                type="button"
                disabled={isLoading}
                onClick={() => start(featured.url)}
                className="group flex h-16 items-center justify-center rounded-2xl border border-line
                           bg-surface px-2 text-center transition
                           hover:border-accent/50 hover:bg-raised
                           disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isPending ? (
                  <span className="size-4 animate-spin rounded-full border-2 border-muted border-t-accent" />
                ) : (
                  <span className="font-display text-[15px] font-semibold text-fg transition-colors group-hover:text-accent">
                    {featured.label}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <p className="max-w-md text-balance text-center text-xs leading-relaxed text-fg-faint">
        Works with public Spotify playlists and albums, YouTube playlists, or a plain
        list of songs — one per line.
      </p>
    </div>
  );
}

/*
 * Blurbs kept to a couple of words each. The labels above them already say
 * hear or read, and sharing the row with the cog leaves each button about
 * 100px of text on a phone - enough for the size of the clue, not for a
 * sentence about it.
 */
const MODES: ReadonlyArray<{ value: GameMode; label: string; blurb: string }> = [
  { value: "audio", label: "Hear it", blurb: "half a second" },
  { value: "lyrics", label: "Read it", blurb: "one lyric line" },
];

/**
 * Chosen before the playlist, because it changes what a round even is - and
 * whichever way you start, the buttons below both honour it.
 */
function ModePicker({
  mode,
  onChange,
  disabled,
}: {
  mode: GameMode;
  onChange: (mode: GameMode) => void;
  disabled: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="How to play"
      className="flex min-w-0 flex-1 gap-1.5 rounded-2xl border border-line bg-surface p-1.5"
    >
      {MODES.map((option) => {
        const active = option.value === mode;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl px-3 py-2.5 transition
                        disabled:cursor-not-allowed disabled:opacity-50 ${
                          active ? "bg-accent text-app" : "text-fg-dim hover:bg-raised hover:text-fg"
                        }`}
          >
            <span className="font-display text-sm font-bold">{option.label}</span>
            <span className={`text-[11px] ${active ? "text-app/70" : "text-fg-faint"}`}>
              {option.blurb}
            </span>
          </button>
        );
      })}
    </div>
  );
}
