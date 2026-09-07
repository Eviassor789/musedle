import type { PlaylistProviderId, RawPlaylist } from "@/domain/entities/Playlist";

/**
 * Turns whatever the user pasted into a normalised playlist.
 *
 * Every supported service gets one adapter behind this interface, so adding
 * Apple Music or Deezer later is a new file plus a registry entry - the game,
 * the API route and the UI stay untouched.
 */
export interface PlaylistSource {
  readonly id: PlaylistProviderId;
  /** Human-facing name, used in error messages and the UI. */
  readonly label: string;
  /** Does this adapter recognise the input? Cheap and synchronous. */
  supports(input: string): boolean;
  load(input: string): Promise<RawPlaylist>;
}
