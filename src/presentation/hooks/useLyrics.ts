"use client";

import { useEffect, useState } from "react";
import type { Lyrics } from "@/domain/entities/Lyrics";
import type { Track } from "@/domain/entities/Track";

export type LyricsState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly lyrics: Lyrics }
  /** No usable words for this track - the round should move to another song. */
  | { readonly status: "missing" };

/**
 * Fetches the words for the current answer.
 *
 * "Missing" is an expected outcome, not an error: LRCLIB does not have every
 * track, instrumentals have nothing to quote, and some transcriptions are too
 * thin to build five hints from. The caller deals with it by choosing a
 * different song.
 */
export function useLyrics(track: Track | null, enabled: boolean): LyricsState {
  const [state, setState] = useState<LyricsState>({ status: "idle" });

  useEffect(() => {
    if (!enabled || !track) {
      setState({ status: "idle" });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });

    void (async () => {
      try {
        const response = await fetch("/api/lyrics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: track.title,
            artists: track.artists,
            durationMs: track.durationMs,
          }),
        });

        const payload: unknown = await response.json();
        const lyrics = (payload as { lyrics?: Lyrics | null } | null)?.lyrics ?? null;

        if (cancelled) return;
        setState(lyrics ? { status: "ready", lyrics } : { status: "missing" });
      } catch {
        // A network failure is indistinguishable from "no words" as far as the
        // round is concerned: either way this song cannot be played.
        if (!cancelled) setState({ status: "missing" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [track, enabled]);

  return state;
}
