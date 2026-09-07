"use client";

import type {
  AudioEngine,
  PlaybackState,
  SnippetRequest,
  Unsubscribe,
} from "@/application/ports/AudioEngine";
import type { AudioSource, AudioSourceKind } from "@/domain/entities/Track";
import { Emitter } from "./Emitter";
import { HtmlAudioEngine } from "./HtmlAudioEngine";
import { YouTubeIframeEngine } from "./YouTubeIframeEngine";

/**
 * Routes each track to the engine that can play it, and presents the pair as
 * one AudioEngine.
 *
 * A single playlist can genuinely be mixed: a Spotify import whose tracks
 * mostly carry preview MP3s may still have a few that had to be resolved to
 * YouTube. Everything above this line - the game engine, the hooks, the whole
 * UI - stays unaware that there is more than one way to make a sound.
 */
export class CompositeAudioEngine implements AudioEngine {
  private readonly engines = new Map<AudioSourceKind, AudioEngine>();
  private readonly stateEmitter = new Emitter<PlaybackState>();
  private readonly progressEmitter = new Emitter<number>();
  private readonly teardown: Unsubscribe[] = [];

  private active: AudioEngine | null = null;

  constructor(youtubeContainer: HTMLElement) {
    this.register("mp3", new HtmlAudioEngine());
    this.register("youtube", new YouTubeIframeEngine(youtubeContainer));
  }

  private register(kind: AudioSourceKind, engine: AudioEngine): void {
    this.engines.set(kind, engine);
    // Only forward events from whichever engine is currently in charge, so a
    // stopped engine's reset does not clobber the active one's progress.
    this.teardown.push(
      engine.onProgress((ms) => {
        if (this.active === engine) this.progressEmitter.emit(ms);
      }),
      engine.onStateChange((state) => {
        if (this.active === engine) this.stateEmitter.emit(state);
      }),
    );
  }

  private engineFor(source: AudioSource): AudioEngine {
    const engine = this.engines.get(source.kind);
    if (!engine) throw new Error(`No audio engine registered for "${source.kind}".`);
    return engine;
  }

  async prepare(source: AudioSource): Promise<void> {
    const engine = this.engineFor(source);
    this.active = engine;
    await engine.prepare(source);
  }

  async playSnippet(request: SnippetRequest): Promise<void> {
    const engine = this.engineFor(request.source);

    // Switching engines mid-game must silence the one we are leaving.
    if (this.active && this.active !== engine) this.active.stop();
    this.active = engine;

    await engine.playSnippet(request);
  }

  stop(): void {
    this.active?.stop();
  }

  extendSnippet(durationMs: number): void {
    this.active?.extendSnippet(durationMs);
  }

  dispose(): void {
    for (const unsubscribe of this.teardown) unsubscribe();
    this.teardown.length = 0;
    for (const engine of this.engines.values()) engine.dispose();
    this.engines.clear();
    this.active = null;
    this.stateEmitter.clear();
    this.progressEmitter.clear();
  }

  /**
   * Routed by the source itself rather than by whichever engine happens to be
   * active: the shape is wanted before anything has played.
   */
  sampleWaveform(
    source: AudioSource,
    buckets: number,
    spanMs: number,
  ): Promise<Float32Array | null> {
    return this.engineFor(source).sampleWaveform(source, buckets, spanMs);
  }

  onProgress(listener: (elapsedMs: number) => void): Unsubscribe {
    return this.progressEmitter.on(listener);
  }

  onStateChange(listener: (state: PlaybackState) => void): Unsubscribe {
    return this.stateEmitter.on(listener);
  }
}
