import type { AudioSource } from "@/domain/entities/Track";

export type PlaybackState = "idle" | "loading" | "ready" | "playing" | "error";

export interface SnippetRequest {
  readonly source: AudioSource;
  /** Play from the source's start offset for exactly this long. */
  readonly durationMs: number;
}

export type Unsubscribe = () => void;

/**
 * Playback, abstracted away from where the audio comes from.
 *
 * Two very different implementations sit behind this: a plain <audio> element
 * for direct MP3s, and the YouTube IFrame Player for video-backed tracks. The
 * game engine and every component know only this interface, so swapping in a
 * licensed audio provider later touches exactly one file.
 */
export interface AudioEngine {
  /** Buffer ahead of time so the first note lands instantly. */
  prepare(source: AudioSource): Promise<void>;
  /** Resolves when the snippet has finished playing or was stopped. */
  playSnippet(request: SnippetRequest): Promise<void>;
  stop(): void;
  /**
   * Moves the end of the clip currently playing, without restarting it.
   * A no-op when nothing is playing.
   */
  extendSnippet(durationMs: number): void;
  dispose(): void;
  /** Elapsed ms within the current snippet, for the progress bar. */
  onProgress(listener: (elapsedMs: number) => void): Unsubscribe;
  onStateChange(listener: (state: PlaybackState) => void): Unsubscribe;

  /**
   * Peak amplitude per bucket across the first `spanMs` of the source,
   * normalised to 0..1 - or null when the audio cannot be read at all.
   *
   * Done up front rather than sampled live during playback, so the whole shape
   * of the clip is on screen before a note is played. The alternative, tapping
   * the running audio through an analyser, can only ever draw the part already
   * heard, and requires permanently rerouting the media element into a Web
   * Audio graph - which silences playback outright if that graph cannot start.
   *
   * Returns null for sources whose audio is not readable from this document,
   * such as a YouTube track playing inside a cross-origin iframe.
   */
  sampleWaveform(
    source: AudioSource,
    buckets: number,
    spanMs: number,
  ): Promise<Float32Array | null>;
}
