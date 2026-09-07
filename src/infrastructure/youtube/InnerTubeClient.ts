import { ImportError } from "@/application/ports/errors";

/**
 * Minimal client for YouTube's InnerTube endpoints - the same JSON API the
 * youtube.com and music.youtube.com front-ends call.
 *
 * Why not the official Data API v3: `search.list` costs 100 quota units against
 * a 10,000/day allowance, i.e. ~100 track lookups per day for the entire app.
 * That is unusable for resolving playlists. InnerTube has no quota and needs no
 * key. It is unofficial, so like the Spotify adapter it is quarantined behind
 * one narrow interface and parsed defensively.
 *
 * Set YOUTUBE_API_KEY to route playlist reads through the official API instead;
 * `playlistItems.list` costs only 1 unit per 50 tracks, so that path is cheap
 * and stable if you have a key. See YouTubeDataApiPlaylistSource.
 */

export type InnerTubeClientName = "WEB" | "WEB_REMIX";

interface ClientProfile {
  readonly host: string;
  readonly clientName: InnerTubeClientName;
  readonly clientVersion: string;
}

const PROFILES: Record<InnerTubeClientName, ClientProfile> = {
  WEB: {
    host: "https://www.youtube.com",
    clientName: "WEB",
    clientVersion: "2.20240911.01.00",
  },
  WEB_REMIX: {
    host: "https://music.youtube.com",
    clientName: "WEB_REMIX",
    clientVersion: "1.20240911.01.00",
  },
};

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export class InnerTubeClient {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async post(
    client: InnerTubeClientName,
    endpoint: "browse" | "search" | "next",
    body: Record<string, unknown>,
  ): Promise<unknown> {
    const profile = PROFILES[client];
    const payload = {
      context: {
        client: {
          clientName: profile.clientName,
          clientVersion: profile.clientVersion,
          hl: "en",
          gl: "US",
        },
      },
      ...body,
    };

    let response: Response;
    try {
      response = await this.fetchImpl(
        `${profile.host}/youtubei/v1/${endpoint}?prettyPrint=false`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
            Origin: profile.host,
            Referer: `${profile.host}/`,
          },
          body: JSON.stringify(payload),
          cache: "no-store",
        },
      );
    } catch (cause) {
      throw new ImportError("UPSTREAM_UNAVAILABLE", "Could not reach YouTube.", cause);
    }

    // InnerTube rejects a malformed or unknown id with 400 rather than 404,
    // so both mean "there is nothing at that link" to a user.
    if (response.status === 400 || response.status === 404) {
      throw new ImportError(
        "NOT_FOUND",
        "YouTube has nothing at that link. Check the playlist is public and the URL is complete.",
      );
    }
    if (!response.ok) {
      throw new ImportError(
        "UPSTREAM_UNAVAILABLE",
        `YouTube responded with ${response.status}.`,
      );
    }

    try {
      return await response.json();
    } catch (cause) {
      throw new ImportError("PARSE_FAILED", "YouTube returned data we could not read.", cause);
    }
  }

  browse(client: InnerTubeClientName, browseId: string): Promise<unknown> {
    return this.post(client, "browse", { browseId });
  }

  search(client: InnerTubeClientName, query: string, params?: string): Promise<unknown> {
    return this.post(client, "search", params ? { query, params } : { query });
  }
}
