"use client";

import type {
  AudioEngine,
  PlaybackState,
  SnippetRequest,
  Unsubscribe,
} from "@/application/ports/AudioEngine";
import type { AudioSource } from "@/domain/entities/Track";
import { Emitter } from "./Emitter";
import { SnippetCutter } from "./SnippetCutter";

/**
 * Plays YouTube-backed tracks through the IFrame Player API.
 *
 * Note on YouTube's terms: the embedded player is required to be visible and
 * at least 200x200. A hide-the-video guessing game is in tension with that,
 * which is why playlists imported from Spotify - which never touch this engine,
 * because they carry their own CORS-open audio - are the better default. The
 * host component decides how the player is presented; this class only drives it.
 *
 * Timing here is looser than the MP3 engine by nature: seeking is a network
 * round trip, so we wait for playback to actually reach the start offset before
 * we begin counting the snippet, rather than trusting the clock from play().
 */

const IFRAME_API_SRC = "https://www.youtube.com/iframe_api";
const READY_TIMEOUT_MS = 15_000;

/**
 * How long playback may fail to advance before we call it dead.
 *
 * Without this the render loop spins forever on a video that never starts -
 * age-restricted, region-blocked, embedding disabled - leaving the button stuck
 * on "Stop" with no way out. A snippet that cannot start must fail loudly.
 */
const STALL_TIMEOUT_MS = 8_000;

/** How close getCurrentTime() must get to the target to count as landed. */
const SEEK_TOLERANCE_S = 1.5;

/** YT.PlayerState values, inlined so we do not depend on the namespace. */
const PLAYER_STATE_ENDED = 0;
const PLAYER_STATE_PLAYING = 1;

/* Minimal shape of the bits of the IFrame API we use. */
interface YTPlayer {
  loadVideoById(args: { videoId: string; startSeconds?: number }): void;
  cueVideoById(args: { videoId: string; startSeconds?: number }): void;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getPlayerState(): number;
  setVolume(volume: number): void;
  destroy(): void;
}

interface YTNamespace {
  Player: new (
    element: HTMLElement,
    options: {
      height: string;
      width: string;
      videoId?: string;
      playerVars: Record<string, number | string>;
      events: {
        onReady?: () => void;
        onStateChange?: (event: { data: number }) => void;
        onError?: (event: { data: number }) => void;
      };
    },
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;

/** Loads the IFrame API exactly once per page, whoever asks first. */
function loadIframeApi(): Promise<YTNamespace> {
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }

    const timer = setTimeout(
      () => reject(new Error("YouTube player did not load.")),
      READY_TIMEOUT_MS,
    );

    // The API calls this global when it is ready; chain any existing handler.
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      clearTimeout(timer);
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error("YouTube player did not load."));
    };

    if (!document.querySelector(`script[src="${IFRAME_API_SRC}"]`)) {
      const script = document.createElement("script");
      script.src = IFRAME_API_SRC;
      script.async = true;
      script.onerror = () => {
        clearTimeout(timer);
        reject(new Error("YouTube player could not be loaded."));
      };
      document.head.appendChild(script);
    }
  });

  return apiPromise;
}

export class YouTubeIframeEngine implements AudioEngine {
  private readonly stateEmitter = new Emitter<PlaybackState>();
  private readonly progressEmitter = new Emitter<number>();

  private player: YTPlayer | null = null;
  private playerReady: Promise<YTPlayer> | null = null;
  private loadedVideoId: string | null = null;
  private cutter: SnippetCutter | null = null;
  private finishCurrent: (() => void) | null = null;
  private disposed = false;
  /** This engine's own slot in the shared container. */
  private wrapper: HTMLElement | null = null;

  constructor(private readonly container: HTMLElement) {}

  async prepare(source: AudioSource): Promise<void> {
    if (this.disposed) return;
    this.stateEmitter.emit("loading");

    const player = await this.ensurePlayer(source);
    if (this.disposed) return;

    if (this.loadedVideoId !== source.ref) {
      this.loadedVideoId = source.ref;
      player.cueVideoById({ videoId: source.ref, startSeconds: source.startOffsetMs / 1000 });
    }
    this.stateEmitter.emit("ready");
  }

  async playSnippet({ source, durationMs }: SnippetRequest): Promise<void> {
    if (this.disposed) return;
    this.stop();

    const player = await this.ensurePlayer(source);
    if (this.disposed) return;

    const startSeconds = source.startOffsetMs / 1000;

    if (this.loadedVideoId !== source.ref) {
      this.loadedVideoId = source.ref;
      player.loadVideoById({ videoId: source.ref, startSeconds });
    } else {
      player.seekTo(startSeconds, true);
    }

    player.playVideo();
    // Deliberately *not* "playing" yet: YouTube may still be fetching, and a
    // play button that says "Stop" while nothing is audible reads as a bug.
    // The state flips once real playback is observed, below.
    this.stateEmitter.emit("loading");

    await new Promise<void>((resolve) => {
      this.finishCurrent = resolve;

      /*
       * Measure from a latched baseline, not from `startSeconds`.
       *
       * seekTo() is asynchronous: for the first frames after it is issued,
       * getCurrentTime() still reports wherever the video was already playing.
       * Comparing that stale position against the target makes a replay look
       * like it has already run past the end of the snippet, and the clip is
       * cut off before a single sample is heard. So wait until the player is
       * genuinely PLAYING *and* the position has landed near the target, then
       * take that instant as zero and count forward from it.
       */
      let baselineSeconds: number | null = null;

      this.cutter = new SnippetCutter({
        durationMs,
        stallAfterMs: STALL_TIMEOUT_MS,
        readElapsedMs: () => {
          const current = player.getCurrentTime();

          if (baselineSeconds === null) {
            const landed =
              current >= startSeconds - SEEK_TOLERANCE_S &&
              current <= startSeconds + SEEK_TOLERANCE_S;
            if (!landed || player.getPlayerState() !== PLAYER_STATE_PLAYING) return null;

            baselineSeconds = current;
            this.stateEmitter.emit("playing");
          }

          return (current - baselineSeconds) * 1000;
        },
        isExhausted: () => player.getPlayerState() === PLAYER_STATE_ENDED,
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
    try {
      this.player?.pauseVideo();
    } catch {
      // Player torn down mid-flight.
    }

    // The playhead deliberately stays where it stopped: the next press resumes
    // from there rather than starting the song over.
    if (!this.disposed) this.stateEmitter.emit(this.loadedVideoId ? "ready" : "idle");

    const finish = this.finishCurrent;
    this.finishCurrent = null;
    finish?.();
  }

  extendSnippet(durationMs: number): void {
    this.cutter?.extendTo(durationMs);
  }

  dispose(): void {
    this.disposed = true;
    this.stop();

    // Destroying a player that has not finished initialising is the common case
    // under StrictMode's mount/unmount/remount, and it is exactly the case that
    // leaks an orphaned iframe if we only look at `this.player`.
    const pending = this.playerReady;
    this.player = null;
    this.playerReady = null;

    void pending
      ?.then((player) => {
        try {
          player.destroy();
        } catch {
          // Already gone.
        }
      })
      .catch(() => undefined)
      .finally(() => this.removeWrapper());

    this.removeWrapper();
    this.stateEmitter.clear();
    this.progressEmitter.clear();
  }

  /**
   * Removes only this engine's own wrapper.
   *
   * The container is shared with whatever engine replaces us, so emptying it
   * wholesale would tear out the successor's player - which is exactly what
   * happens under StrictMode, where the disposed engine's pending player
   * settles *after* its replacement has already mounted.
   */
  private removeWrapper(): void {
    this.wrapper?.remove();
    this.wrapper = null;
  }

  /**
   * Always null: the video plays inside a cross-origin iframe, so its audio
   * never reaches this document and there is nothing to decode. The UI draws an
   * acknowledged stand-in for these tracks rather than pretending otherwise.
   */
  async sampleWaveform(): Promise<Float32Array | null> {
    return null;
  }

  onProgress(listener: (elapsedMs: number) => void): Unsubscribe {
    return this.progressEmitter.on(listener);
  }

  onStateChange(listener: (state: PlaybackState) => void): Unsubscribe {
    return this.stateEmitter.on(listener);
  }

  private ensurePlayer(source: AudioSource): Promise<YTPlayer> {
    this.playerReady ??= loadIframeApi().then(
      (YT) =>
        new Promise<YTPlayer>((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error("YouTube player did not become ready.")),
            READY_TIMEOUT_MS,
          );

          // YT.Player *replaces* the element it is given, synchronously, and
          // destroy() then removes the iframe. Nest it inside a wrapper we own,
          // so the container React holds a ref to survives, and so teardown can
          // remove this engine's player without touching anyone else's.
          const wrapper = document.createElement("div");
          this.wrapper = wrapper;
          this.container.appendChild(wrapper);

          const mount = document.createElement("div");
          wrapper.appendChild(mount);

          const player = new YT.Player(mount, {
            height: "200",
            width: "200",
            // Construct with the first video rather than an empty embed: a
            // player built with no videoId starts in a state where the first
            // cue + play can silently fail to begin.
            videoId: source.ref,
            playerVars: {
              controls: 0,
              disablekb: 1,
              modestbranding: 1,
              rel: 0,
              playsinline: 1,
              origin: typeof window === "undefined" ? "" : window.location.origin,
            },
            events: {
              onReady: () => {
                clearTimeout(timer);
                this.loadedVideoId = source.ref;
                try {
                  player.setVolume(100);
                } catch {
                  // Non-fatal.
                }
                this.player = player;
                resolve(player);
              },
              onError: () => {
                clearTimeout(timer);
                this.stateEmitter.emit("error");
                reject(new Error("That video cannot be played here."));
              },
            },
          });
        }),
    );

    return this.playerReady;
  }
}
