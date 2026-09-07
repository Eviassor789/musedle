import { normalizeKey } from "@/domain/rules/similarity";

/**
 * How a snippet is actually produced at playback time.
 *
 * `mp3`      - a direct audio URL we can stream and cut with sample accuracy.
 * `youtube`  - an 11-character video id played through the IFrame Player API.
 *
 * The game never branches on this. Only the audio adapters do.
 */
export type AudioSourceKind = "mp3" | "youtube";

export interface AudioSource {
  readonly kind: AudioSourceKind;
  /** Absolute URL for `mp3`, video id for `youtube`. */
  readonly ref: string;
  /** Where the song proper begins inside the source (skips label intros). */
  readonly startOffsetMs: number;
}

/** A track that is ready to play. */
export interface Track {
  readonly id: string;
  readonly title: string;
  readonly artists: readonly string[];
  readonly durationMs: number | null;
  readonly artworkUrl: string | null;
  readonly source: AudioSource;
}

/**
 * A track as a playlist provider hands it to us, before we know how to play it.
 * `source` is already populated when the provider supplies playable audio
 * (Spotify embeds do); otherwise a TrackResolver has to find one.
 */
export interface RawTrack {
  readonly title: string;
  readonly artists: readonly string[];
  readonly durationMs: number | null;
  readonly artworkUrl: string | null;
  readonly source: AudioSource | null;
  /** Provider-native id, used as the cache key when resolving. */
  readonly externalId: string | null;
}

/**
 * Do two credits name any artist in common?
 *
 * Drives the "right artist, wrong song" state - the near-miss that makes a
 * wrong guess still feel like progress. Compared on normalised keys so casing,
 * accents and punctuation cannot decide it.
 */
export function sharesArtist(a: readonly string[], b: readonly string[]): boolean {
  const known = new Set(a.map(normalizeKey).filter(Boolean));
  return b.some((artist) => known.has(normalizeKey(artist)));
}

export function formatArtists(artists: readonly string[]): string {
  return artists.join(", ");
}

/** The string shown in the guess box and compared against. */
export function trackLabel(track: Pick<Track, "title" | "artists">): string {
  const artists = formatArtists(track.artists);
  return artists ? `${artists} - ${track.title}` : track.title;
}
