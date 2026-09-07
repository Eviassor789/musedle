"use client";

import type { RecentPlaylist } from "@/presentation/recentPlaylists";

interface RecentPlaylistsProps {
  readonly playlists: readonly RecentPlaylist[];
  readonly isLoading: boolean;
  readonly pendingInput: string | null;
  onPick(input: string): void;
}

const SOURCE_LABELS: Record<string, string> = {
  spotify: "Spotify",
  youtube: "YouTube",
  text: "Pasted list",
};

/**
 * The playlists you played last, as a row of covers.
 *
 * Artwork does the work here: you recognise a playlist you have played before
 * by its cover long before you finish reading its name, which is the whole
 * point of a shortcut row. It scrolls sideways rather than wrapping, so it
 * stays exactly one row however many are remembered.
 */
export function RecentPlaylists({
  playlists,
  isLoading,
  pendingInput,
  onPick,
}: RecentPlaylistsProps) {
  if (playlists.length === 0) return null;

  return (
    <section className="flex w-full flex-col gap-3">
      <h2 className="text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-faint">
        Jump back in
      </h2>

      {/* Negative margin lets the row bleed to the screen edge on a phone, so
          the last cover is visibly cut off rather than looking like the end. */}
      <div className="-mx-5 overflow-x-auto px-5 pb-1 sm:mx-0 sm:px-0">
        <ul className="flex gap-2.5">
          {playlists.map((playlist) => {
            const isPending = isLoading && pendingInput === playlist.input;
            return (
              <li key={playlist.id} className="shrink-0">
                {/*
                  Laid out sideways - cover left, name right - so the row costs
                  a line of height rather than a block of it. The tall stacked
                  version pushed everything below it off the fold.
                */}
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => onPick(playlist.input)}
                  className="group flex w-[15rem] items-center gap-3 rounded-2xl border border-line bg-surface p-2
                             text-left transition hover:border-accent/50 hover:bg-raised
                             disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="relative block size-12 shrink-0 overflow-hidden rounded-xl bg-muted">
                    {playlist.artworkUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={playlist.artworkUrl}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="size-full object-cover"
                      />
                    ) : (
                      <span className="grid size-full place-items-center text-fg-faint">♪</span>
                    )}

                    {isPending && (
                      <span className="absolute inset-0 grid place-items-center bg-app/70">
                        <span className="size-4 animate-spin rounded-full border-2 border-muted border-t-accent" />
                      </span>
                    )}
                  </span>

                  <span className="flex min-w-0 flex-1 flex-col gap-0.5 pr-1">
                    <span className="truncate text-[13px] font-semibold text-fg transition-colors group-hover:text-accent">
                      {playlist.title}
                    </span>
                    <span className="truncate text-[11px] text-fg-faint">
                      {SOURCE_LABELS[playlist.provider] ?? playlist.provider} ·{" "}
                      {playlist.trackCount} songs
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
