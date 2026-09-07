"use client";

import type {
  AudioEngine,
  PlaybackState,
  SnippetRequest,
  Unsubscribe,
} from "@/application/ports/AudioEngine";
import type { AudioSource } from "@/domain/entities/Track";
import { Emitter } from "./Emitter";
import { bucketLevels } from "./bucketLevels";
import { SnippetCutter } from "./SnippetCutter";

/**
 * Plays direct audio URLs through a plain <audio> element.
 *
 * This is the good path. Spotify preview MP3s are served with
 * `Access-Control-Allow-Origin: *` and support range requests, so the browser
 * can buffer them directly and we get frame-accurate control over exactly how
 * much of the song the player hears.
 *
 * The snippet is cut against the element's own playback position rather than
 * wall-clock time: a timer keeps running while audio stalls on a slow network,
 * and overshooting by 200ms on a 1000ms clue is the difference between a fair
 * round and a free answer. See SnippetCutter for how that position is polled.
 */

const BUFFER_TIMEOUT_MS = 12_000;

/** A snippet that cannot start must fail loudly rather than hang. */
const STALL_TIMEOUT_MS = 8_000;

export class HtmlAudioEngine implements AudioEngine {
  private readonly audio: HTMLAudioElement;
  private readonly stateEmitter = new Emitter<PlaybackState>();
  private readonly progressEmitter = new Emitter<number>();

  private cutter: SnippetCutter | null = null;
  private finishCurrent: (() => void) | null = null;
  private loadedRef: string | null = null;

  constructor() {
    this.audio = new Audio();
    this.audio.preload = "auto";
    // The previews are CORS-open; this keeps the element consistent with the
    // cross-origin fetch used to decode the waveform.
    this.audio.crossOrigin = "anonymous";
    this.audio.addEventListener("error", () => this.stateEmitter.emit("error"));
  }

  async prepare(source: AudioSource): Promise<void> {
    if (this.loadedRef === source.ref && this.audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      this.stateEmitter.emit("ready");
      return;
    }

    this.stateEmitter.emit("loading");
    this.audio.src = source.ref;
    this.loadedRef = source.ref;
    this.audio.load();

    await this.waitUntilBuffered();
    this.seekTo(source.startOffsetMs);
    this.stateEmitter.emit("ready");
  }

  async playSnippet({ source, durationMs }: SnippetRequest): Promise<void> {
    this.stop();
    await this.prepare(source);

    const startSeconds = source.startOffsetMs / 1000;
    this.seekTo(source.startOffsetMs);

    try {
      await this.audio.play();
    } catch {
      // Autoplay policy, or the element was torn down mid-flight.
      this.stateEmitter.emit("error");
      return;
    }
    this.stateEmitter.emit("playing");

    await new Promise<void>((resolve) => {
      this.finishCurrent = resolve;

      this.cutter = new SnippetCutter({
        durationMs,
        stallAfterMs: STALL_TIMEOUT_MS,
        // Position is exact here, so the snippet is measured from the audio
        // itself and buffering hiccups never shorten the clue.
        readElapsedMs: () => (this.audio.currentTime - startSeconds) * 1000,
        isExhausted: () => this.audio.ended,
        onProgress: (ms) => this.progressEmitter.emit(ms),
        onDone: (finalMs) => {
          this.progressEmitter.emit(finalMs);
          this.stop();
        },
        onStall: () => {
          this.stateEmitter.emit("error");
          this.stop();
        },
      });
      this.cutter.start();
    });
  }

  stop(): void {
    this.cutter?.stop();
    this.cutter = null;
    if (!this.audio.paused) this.audio.pause();

    // The playhead deliberately stays where it stopped: the next press resumes
    // from there rather than starting the song over.
    this.stateEmitter.emit(this.loadedRef ? "ready" : "idle");

    const finish = this.finishCurrent;
    this.finishCurrent = null;
    finish?.();
  }

  extendSnippet(durationMs: number): void {
    this.cutter?.extendTo(durationMs);
  }

  dispose(): void {
    this.stop();
    this.audio.removeAttribute("src");
    this.audio.load();
    this.stateEmitter.clear();
    this.progressEmitter.clear();
  }

  /**
   * Decodes the clip once and reduces it to one level per bucket.
   *
   * Spotify previews are served with `Access-Control-Allow-Origin: *`, so the
   * bytes can be fetched and decoded directly. Note this never touches the
   * <audio> element: decoding a copy of the file is inert, whereas routing the
   * live element through a Web Audio graph is a one-way change that silences
   * playback outright if that graph cannot start.
   */
  async sampleWaveform(
    source: AudioSource,
    buckets: number,
    spanMs: number,
  ): Promise<Float32Array | null> {
    if (typeof window === "undefined") return null;

    const Ctor =
      window.OfflineAudioContext ??
      (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
        .webkitOfflineAudioContext;
    if (!Ctor) return null;

    try {
      const response = await fetch(source.ref, { mode: "cors" });
      if (!response.ok) return null;
      const bytes = await response.arrayBuffer();

      // An offline context decodes without a user gesture and without ever
      // being started, neither of which a live AudioContext can promise.
      const decoder = new Ctor(1, 1, 44_100);
      const audio = await decoder.decodeAudioData(bytes);

      return bucketLevels(audio, buckets, source.startOffsetMs, spanMs);
    } catch {
      // Offline, blocked, or an undecodable payload: the UI draws a stand-in.
      return null;
    }
  }

  onProgress(listener: (elapsedMs: number) => void): Unsubscribe {
    return this.progressEmitter.on(listener);
  }

  onStateChange(listener: (state: PlaybackState) => void): Unsubscribe {
    return this.stateEmitter.on(listener);
  }

  private seekTo(offsetMs: number): void {
    try {
      this.audio.currentTime = offsetMs / 1000;
    } catch {
      // Seeking before metadata arrives throws in some browsers; harmless.
    }
  }

  private waitUntilBuffered(): Promise<void> {
    if (this.audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return Promise.resolve();

    return new Promise<void>((resolve, reject) => {
      const cleanup = (): void => {
        clearTimeout(timer);
        this.audio.removeEventListener("canplay", onReady);
        this.audio.removeEventListener("error", onError);
      };
      const onReady = (): void => {
        cleanup();
        resolve();
      };
      const onError = (): void => {
        cleanup();
        reject(new Error("Could not load that track's audio."));
      };
      const timer = setTimeout(onError, BUFFER_TIMEOUT_MS);

      this.audio.addEventListener("canplay", onReady, { once: true });
      this.audio.addEventListener("error", onError, { once: true });
    });
  }
}
