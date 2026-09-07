import type { PlaylistSource } from "@/application/ports/PlaylistSource";
import { ImportError } from "@/application/ports/errors";
import type { RawPlaylist } from "@/domain/entities/Playlist";
import type { RawTrack } from "@/domain/entities/Track";

/**
 * Reads a public Spotify playlist or album through the same endpoint the
 * embeddable Spotify player uses.
 *
 * Why not the Web API: since the February 2026 migration, GET /playlists/{id}
 * returns *metadata only* for any playlist the authenticated user does not own,
 * and preview_url was removed from the API entirely in November 2024. So the
 * documented API can give us neither the track list of a playlist someone
 * pasted, nor any audio. The embed endpoint gives us both, unauthenticated.
 *
 * The trade-off, stated plainly: this surface is undocumented and can change
 * without notice. It is deliberately isolated in this one file, parses
 * defensively, and fails with a clear ImportError rather than a stack trace.
 */

const EMBED_ORIGIN = "https://open.spotify.com/embed";
const NEXT_DATA_RE =
  /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/;

/** Desktop UA - the embed serves a different, track-less payload to unknown clients. */
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

type SpotifyEntityType = "playlist" | "album";

interface ParsedRef {
  readonly type: SpotifyEntityType;
  readonly id: string;
}

/**
 * Accepts every shape a user might paste:
 *   https://open.spotify.com/playlist/{id}?si=...
 *   https://open.spotify.com/intl-de/album/{id}
 *   spotify:playlist:{id}
 *   {id}   (bare, assumed to be a playlist)
 */
export function parseSpotifyRef(input: string): ParsedRef | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const uri = /^spotify:(playlist|album):([A-Za-z0-9]+)$/.exec(trimmed);
  if (uri?.[1] && uri[2]) return { type: uri[1] as SpotifyEntityType, id: uri[2] };

  if (/open\.spotify\.com/i.test(trimmed)) {
    // The optional /intl-xx segment appears on localised share links.
    const url = /open\.spotify\.com\/(?:intl-[a-z-]+\/)?(playlist|album)\/([A-Za-z0-9]+)/i.exec(
      trimmed,
    );
    if (url?.[1] && url[2]) {
      return { type: url[1].toLowerCase() as SpotifyEntityType, id: url[2] };
    }
    return null;
  }

  if (/^[A-Za-z0-9]{22}$/.test(trimmed)) return { type: "playlist", id: trimmed };
  return null;
}

/* --------------------------- defensive schema readers -------------------------- */

const asRecord = (v: unknown): Record<string, unknown> | null =>
  typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;

const asString = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v : null;

function dig(root: unknown, path: readonly string[]): unknown {
  let node: unknown = root;
  for (const key of path) {
    const rec = asRecord(node);
    if (!rec) return undefined;
    node = rec[key];
  }
  return node;
}

function firstCoverUrl(coverArt: unknown): string | null {
  const sources = asRecord(coverArt)?.["sources"];
  if (!Array.isArray(sources)) return null;
  // Sources run small -> large; the last is the highest resolution available.
  for (let i = sources.length - 1; i >= 0; i--) {
    const url = asString(asRecord(sources[i])?.["url"]);
    if (url) return url;
  }
  return null;
}

/** The embed joins artists into one string; split it back apart. */
function splitArtists(subtitle: string | null): string[] {
  if (!subtitle) return [];
  return subtitle
    .split(/\s*,\s*/)
    .map((a) => a.trim())
    .filter(Boolean);
}

function toRawTrack(node: unknown, fallbackArtwork: string | null): RawTrack | null {
  const track = asRecord(node);
  if (!track) return null;

  const title = asString(track["title"]);
  if (!title) return null;

  const previewUrl = asString(asRecord(track["audioPreview"])?.["url"]);
  // Without preview audio the track is unplayable for us; a resolver may still
  // rescue it later, so we keep it with a null source rather than dropping it.
  const duration = typeof track["duration"] === "number" ? track["duration"] : null;

  return {
    title,
    artists: splitArtists(asString(track["subtitle"])),
    durationMs: duration,
    artworkUrl: fallbackArtwork,
    externalId: asString(track["uri"]),
    source: previewUrl ? { kind: "mp3", ref: previewUrl, startOffsetMs: 0 } : null,
  };
}

export class SpotifyEmbedSource implements PlaylistSource {
  readonly id = "spotify" as const;
  readonly label = "Spotify";

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  supports(input: string): boolean {
    return parseSpotifyRef(input) !== null;
  }

  async load(input: string): Promise<RawPlaylist> {
    const ref = parseSpotifyRef(input);
    if (!ref) {
      throw new ImportError(
        "UNSUPPORTED_INPUT",
        "That does not look like a Spotify playlist or album link.",
      );
    }

    const html = await this.fetchEmbed(ref);
    const entity = this.extractEntity(html);
    const artwork = firstCoverUrl(entity["coverArt"]);

    const rawList = entity["trackList"];
    if (!Array.isArray(rawList) || rawList.length === 0) {
      throw new ImportError(
        "EMPTY_PLAYLIST",
        "Spotify returned no tracks for that link. Private playlists cannot be read - make it public and try again.",
      );
    }

    const tracks = rawList
      .map((node) => toRawTrack(node, artwork))
      .filter((t): t is RawTrack => t !== null);

    if (tracks.length === 0) {
      throw new ImportError("PARSE_FAILED", "Could not read any track names from that playlist.");
    }

    return {
      id: `spotify:${ref.type}:${ref.id}`,
      title: asString(entity["title"]) ?? asString(entity["name"]) ?? "Spotify playlist",
      description: asString(entity["subtitle"]),
      artworkUrl: artwork,
      provider: "spotify",
      // The embed serves the first page only; very long playlists arrive capped.
      truncated: tracks.length >= 100,
      tracks,
    };
  }

  private async fetchEmbed(ref: ParsedRef): Promise<string> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${EMBED_ORIGIN}/${ref.type}/${ref.id}`, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
        // Public content; cache hard so repeated imports cost nothing.
        next: { revalidate: 3600 },
      } as RequestInit);
    } catch (cause) {
      throw new ImportError("UPSTREAM_UNAVAILABLE", "Could not reach Spotify.", cause);
    }

    if (response.status === 404) {
      throw new ImportError(
        "NOT_FOUND",
        "Spotify has no public playlist at that link. Private and personalised playlists (Discover Weekly, Daily Mix) cannot be imported.",
      );
    }
    if (!response.ok) {
      throw new ImportError(
        "UPSTREAM_UNAVAILABLE",
        `Spotify responded with ${response.status}.`,
      );
    }
    return response.text();
  }

  private extractEntity(html: string): Record<string, unknown> {
    const match = NEXT_DATA_RE.exec(html);
    if (!match?.[1]) {
      throw new ImportError(
        "PARSE_FAILED",
        "Spotify changed the shape of its embed page - the importer needs updating.",
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(match[1]);
    } catch (cause) {
      throw new ImportError("PARSE_FAILED", "Spotify returned data we could not read.", cause);
    }

    // The payload parsed, so the page shape is intact. A missing entity here
    // means the id itself is bad - Spotify serves 200 + an empty shell for those.
    const entity = asRecord(dig(payload, ["props", "pageProps", "state", "data", "entity"]));
    if (!entity) {
      throw new ImportError(
        "NOT_FOUND",
        "Spotify has no public playlist or album at that link.",
      );
    }
    return entity;
  }
}
