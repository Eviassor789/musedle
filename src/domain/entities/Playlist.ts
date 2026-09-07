import type { RawTrack, Track } from "./Track";

export type PlaylistProviderId = "spotify" | "youtube" | "text";

interface PlaylistBase {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly artworkUrl: string | null;
  readonly provider: PlaylistProviderId;
  /** True when the provider capped the list and more tracks exist upstream. */
  readonly truncated: boolean;
}

/** Straight out of a provider - not necessarily playable yet. */
export interface RawPlaylist extends PlaylistBase {
  readonly tracks: readonly RawTrack[];
}

/** Every track has a usable audio source. This is what the game consumes. */
export interface Playlist extends PlaylistBase {
  readonly tracks: readonly Track[];
  /** Tracks dropped because no audio source could be found for them. */
  readonly unresolvedCount: number;
}
