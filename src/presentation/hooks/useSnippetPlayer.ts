"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlaybackState } from "@/application/ports/AudioEngine";
import type { Track } from "@/domain/entities/Track";
import { CompositeAudioEngine } from "@/infrastructure/audio/CompositeAudioEngine";

export interface SnippetPlayer {
  /** Attach to the element that hosts the YouTube iframe. */
  readonly containerRef: React.RefObject<HTMLDivElement | null>;
  readonly state: PlaybackState;
  /** Playhead position measured from the start of the song, not of the clip. */
  readonly positionMs: number;
  readonly isPlaying: boolean;
  /** Play the span [fromMs, toMs) of the song. */
  play(fromMs: number, toMs: number): void;
  stop(): void;
  /** Move the playhead. Playing audio follows it; paused audio just relocates. */
  seek(toMs: number): void;
  /** Push the end of the running clip later, without restarting it. */
  extendTo(limitMs: number): void;
  /**
   * One peak per bar for the whole clip, ready before anything is played.
   * Null while it is still decoding, or for audio that cannot be read at all.
   */
  readonly peaks: Float32Array | null;
}

export interface SnippetPlayerOptions {
  /** How many buckets the waveform should be reduced to. */
  readonly buckets: number;
  /** How much of the song the waveform should span. */
  readonly spanMs: number;
}

/**
 * Bridges the imperative AudioEngine to React.
 *
 * The engine is created once and kept in a ref: it owns a live <audio> element
 * and a YouTube iframe, neither of which should be torn down and rebuilt just
 * because a parent re-rendered.
 *
 * Everything here is expressed in song time rather than clip time. The engine
 * reports progress relative to wherever the current clip began, so this is the
 * layer that adds the offset back on - which is what lets the playhead survive
 * a stop, and lets the next press resume instead of starting over.
 */
export function useSnippetPlayer(
  track: Track | null,
  { buckets, spanMs }: SnippetPlayerOptions,
): SnippetPlayer {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<CompositeAudioEngine | null>(null);

  const [state, setState] = useState<PlaybackState>("idle");
  const [positionMs, setPositionMs] = useState(0);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);

  /** Where the running clip started, so engine progress can be made absolute. */
  const originRef = useRef(0);
  /** The furthest the current clip may play to. */
  const limitRef = useRef(0);
  const isPlayingRef = useRef(false);

  isPlayingRef.current = state === "playing";

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const engine = new CompositeAudioEngine(container);
    engineRef.current = engine;

    const offProgress = engine.onProgress((elapsedMs) =>
      setPositionMs(originRef.current + elapsedMs),
    );
    const offState = engine.onStateChange(setState);

    return () => {
      offProgress();
      offState();
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Buffer the next answer as soon as it is known, so the first press of play
  // is instant rather than a spinner.
  useEffect(() => {
    setPositionMs(0);
    originRef.current = 0;
    limitRef.current = 0;
    if (!track) return;

    let cancelled = false;
    void engineRef.current?.prepare(track.source).catch(() => {
      if (!cancelled) setState("error");
    });

    return () => {
      cancelled = true;
      engineRef.current?.stop();
    };
  }, [track]);

  /*
   * Decode the whole clip up front so the wave is on screen before the first
   * press. Kept separate from prepare() because it must not delay playback:
   * the shape arriving a moment late is fine, audio arriving late is not.
   */
  useEffect(() => {
    setPeaks(null);
    if (!track) return;

    let cancelled = false;
    void engineRef.current
      ?.sampleWaveform(track.source, buckets, spanMs)
      .then((sampled) => {
        if (!cancelled) setPeaks(sampled);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [track, buckets, spanMs]);

  const play = useCallback(
    (fromMs: number, toMs: number) => {
      if (!track || toMs <= fromMs) return;

      originRef.current = fromMs;
      limitRef.current = toMs;
      setPositionMs(fromMs);

      void engineRef.current
        ?.playSnippet({
          source: { ...track.source, startOffsetMs: fromMs },
          durationMs: toMs - fromMs,
        })
        .catch(() => setState("error"));
    },
    [track],
  );

  const stop = useCallback(() => {
    engineRef.current?.stop();
  }, []);

  const seek = useCallback(
    (toMs: number) => {
      const target = Math.max(0, toMs);
      setPositionMs(target);
      originRef.current = target;

      // Scrubbing during playback should keep playing from the new spot; while
      // paused it only moves the playhead, ready for the next press.
      if (isPlayingRef.current && limitRef.current > target) {
        play(target, limitRef.current);
      }
    },
    [play],
  );

  const extendTo = useCallback((limitMs: number) => {
    if (limitMs <= limitRef.current) return;
    limitRef.current = limitMs;
    engineRef.current?.extendSnippet(limitMs - originRef.current);
  }, []);

  return {
    containerRef,
    state,
    positionMs,
    isPlaying: state === "playing",
    play,
    stop,
    seek,
    extendTo,
    peaks,
  };
}
