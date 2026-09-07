"use client";

import { useEffect, useRef, useState } from "react";
import type { AudioSource } from "@/domain/entities/Track";

interface RevealPlayerProps {
  readonly source: AudioSource;
}

/**
 * Listen to the track properly, once the round is over.
 *
 * The two source kinds get genuinely different treatment rather than a lowest
 * common denominator. A Spotify preview is a plain MP3, so it gets a compact
 * transport that matches the rest of the app. A YouTube track gets its real
 * embedded player, visible and full size - which is both the nicer thing to
 * watch and the only presentation of it that YouTube's terms actually allow.
 */
/**
 * Does this player already put a picture of the song on screen?
 *
 * True for a YouTube embed, which shows the video itself. Callers use it to
 * avoid pairing the player with a second, redundant piece of artwork.
 */
export function playerShowsItsOwnVisual(source: AudioSource): boolean {
  return source.kind === "youtube";
}

export function RevealPlayer({ source }: RevealPlayerProps) {
  if (source.kind === "youtube") {
    return (
      // Constrained rather than full-bleed: this is a bonus listen after the
      // round, not the main event.
      <div className="mx-auto w-full max-w-xs overflow-hidden rounded-xl border border-line bg-black">
        <iframe
          // `?rel=0` keeps the end screen from recommending the next answer.
          src={`https://www.youtube-nocookie.com/embed/${source.ref}?rel=0`}
          title="Listen to the full track"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
          allowFullScreen
          className="aspect-video w-full border-0"
        />
      </div>
    );
  }

  return <PreviewPlayer url={source.ref} />;
}

function PreviewPlayer({ url }: { url: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = (): void => setCurrentTime(audio.currentTime);
    const onLoaded = (): void => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onPlay = (): void => setIsPlaying(true);
    const onPause = (): void => setIsPlaying(false);
    const onEnded = (): void => {
      setIsPlaying(false);
      /*
       * The playhead deliberately stays at the end.
       *
       * Snapping it back to zero empties the bar the instant the preview
       * finishes, which reads as "nothing played". Leaving it parked shows what
       * you just heard - a full green track with the pin at the end. Pressing
       * play from there rewinds explicitly, in `toggle`.
       */
      setCurrentTime(audio.duration || 0);
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.pause();
    };
  }, [url]);

  const toggle = (): void => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!audio.paused) {
      audio.pause();
      return;
    }

    // Parked at the end from the last listen: start it over rather than
    // playing nothing.
    if (audio.duration && audio.currentTime >= audio.duration - 0.05) {
      audio.currentTime = 0;
      setCurrentTime(0);
    }
    void audio.play().catch(() => setIsPlaying(false));
  };

  const seek = (seconds: number): void => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = seconds;
    setCurrentTime(seconds);
  };

  // Painted as a gradient because WebKit draws no progress before the thumb.
  const progress = duration > 0 ? Math.min(1, currentTime / duration) * 100 : 0;

  return (
    <div className="mx-auto flex w-full max-w-xs items-center gap-2.5 rounded-xl border border-line bg-surface/70 px-2.5 py-2">
      {/* A separate element from the game's engine, so the two never fight over
          playback. */}
      <audio ref={audioRef} src={url} preload="metadata" crossOrigin="anonymous" />

      <button
        type="button"
        onClick={toggle}
        aria-label={isPlaying ? "Pause" : "Play the full preview"}
        className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-app
                   transition hover:bg-accent-glow active:scale-95"
      >
        {isPlaying ? (
          <svg viewBox="0 0 24 24" aria-hidden className="size-3.5 fill-current">
            <rect x="6" y="5" width="4" height="14" rx="1.2" />
            <rect x="14" y="5" width="4" height="14" rx="1.2" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden className="ml-0.5 size-4 fill-current">
            <path d="M8 5.14v13.72a1 1 0 0 0 1.53.85l10.4-6.86a1 1 0 0 0 0-1.7L9.53 4.29A1 1 0 0 0 8 5.14Z" />
          </svg>
        )}
      </button>

      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.05}
        value={currentTime}
        onChange={(event) => seek(Number(event.target.value))}
        aria-label="Seek"
        className="range-fill min-w-0 flex-1 cursor-pointer"
        style={{
          background: `linear-gradient(to right, var(--color-accent) ${progress}%, var(--color-line) ${progress}%)`,
        }}
      />

      <span className="shrink-0 font-mono text-[11px] tabular-nums text-fg-faint">
        {formatTime(currentTime)}
      </span>
    </div>
  );
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, "0")}`;
}
