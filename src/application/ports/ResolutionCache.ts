import type { AudioSource } from "@/domain/entities/Track";

/**
 * Artist + title -> audio source is a fact that never changes, so it is cached
 * forever and shared across every user. This is what keeps us off the YouTube
 * search quota: a track is only ever looked up once, globally.
 *
 * `null` is a meaningful stored value - it records "we looked, there is nothing"
 * so we do not burn a lookup on the same dead track repeatedly.
 */
export interface ResolutionCache {
  /** `undefined` means never looked up; `null` means looked up and not found. */
  get(key: string): Promise<AudioSource | null | undefined>;
  set(key: string, source: AudioSource | null): Promise<void>;
}
