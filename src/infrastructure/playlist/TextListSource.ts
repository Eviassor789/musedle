import type { PlaylistSource } from "@/application/ports/PlaylistSource";
import { ImportError } from "@/application/ports/errors";
import type { RawPlaylist } from "@/domain/entities/Playlist";
import type { RawTrack } from "@/domain/entities/Track";
import { splitArtistCredit } from "@/domain/rules/TitleNormalizer";

/**
 * The universal fallback: a pasted list of songs, one per line.
 *
 * This is what makes the game work with services we have no adapter for -
 * Apple Music, Tidal, a setlist, a friend's text message. Nothing here is
 * playable yet; every line goes to the resolver.
 */

/** Leading track numbers and bullets from copy-pasted lists. */
const LEADING_ORDINAL = /^\s*(?:\d{1,3}[.)\]]|[-*•])\s+/;

/** Trailing "3:45" timestamps that come with copied tracklists. */
const TRAILING_DURATION = /\s+[-–—]?\s*\(?\d{1,2}:\d{2}(?::\d{2})?\)?\s*$/;

const SEPARATORS = [" -- ", " — ", " – ", " - ", " | ", " · "];

function parseLine(line: string): RawTrack | null {
  const cleaned = line.replace(LEADING_ORDINAL, "").replace(TRAILING_DURATION, "").trim();
  if (!cleaned) return null;

  for (const sep of SEPARATORS) {
    const at = cleaned.indexOf(sep);
    if (at > 0 && at < cleaned.length - sep.length) {
      const artists = splitArtistCredit(cleaned.slice(0, at).trim());
      const title = cleaned.slice(at + sep.length).trim();
      if (title) {
        return { title, artists, durationMs: null, artworkUrl: null, externalId: null, source: null };
      }
    }
  }

  // No separator - treat the whole line as a title and let the resolver cope.
  return {
    title: cleaned,
    artists: [],
    durationMs: null,
    artworkUrl: null,
    externalId: null,
    source: null,
  };
}

export class TextListSource implements PlaylistSource {
  readonly id = "text" as const;
  readonly label = "Pasted list";

  /**
   * The registry consults link-based adapters first, so this only has to reject
   * things that are obviously a single URL rather than a list of songs.
   */
  supports(input: string): boolean {
    const trimmed = input.trim();
    if (!trimmed) return false;
    const isBareUrl = /^https?:\/\/\S+$/i.test(trimmed) && !/\n/.test(trimmed);
    return !isBareUrl;
  }

  async load(input: string): Promise<RawPlaylist> {
    const tracks = input
      .split(/\r?\n/)
      .map(parseLine)
      .filter((t): t is RawTrack => t !== null);

    if (tracks.length === 0) {
      throw new ImportError("EMPTY_PLAYLIST", "No songs found. Put one song on each line.");
    }

    return {
      id: `text:${tracks.length}:${hash(input)}`,
      title: "Pasted list",
      description: `${tracks.length} songs`,
      artworkUrl: null,
      provider: "text",
      truncated: false,
      tracks,
    };
  }
}

/** Small stable hash so the same pasted list keeps the same playlist id. */
function hash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
