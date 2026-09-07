import type { Playlist } from "@/domain/entities/Playlist";

export interface RecentPlaylist {
  /** The playlist's own id, so the same playlist is never listed twice. */
  readonly id: string;
  readonly title: string;
  readonly artworkUrl: string | null;
  readonly provider: string;
  readonly trackCount: number;
  /** The original input, replayed verbatim to reopen it. */
  readonly input: string;
  readonly playedAt: number;
}

const STORAGE_KEY = "musedle.recent";

/** Enough to be useful as a shortcut, few enough to stay one glance. */
const MAX_RECENT = 6;

/**
 * The last few playlists played, kept in this browser.
 *
 * Deliberately localStorage rather than anything server-side: it is a
 * convenience for one person on one device, and there are no accounts to hang
 * it off. Every access is guarded - storage throws outright in some privacy
 * modes, and a shortcut row is never worth taking the page down for.
 */
export function loadRecentPlaylists(): RecentPlaylist[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(isRecentPlaylist).slice(0, MAX_RECENT);
  } catch {
    // Unreadable or corrupt: start over rather than fail.
    return [];
  }
}

/** Records a playlist as just played, moving it to the front. */
export function rememberPlaylist(playlist: Playlist, input: string): RecentPlaylist[] {
  const entry: RecentPlaylist = {
    id: playlist.id,
    title: playlist.title,
    artworkUrl: playlist.artworkUrl,
    provider: playlist.provider,
    trackCount: playlist.tracks.length,
    input,
    playedAt: Date.now(),
  };

  const next = [entry, ...loadRecentPlaylists().filter((item) => item.id !== entry.id)].slice(
    0,
    MAX_RECENT,
  );

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Full, or blocked. The list still works for this session.
  }
  return next;
}

function isRecentPlaylist(value: unknown): value is RecentPlaylist {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item["id"] === "string" &&
    typeof item["title"] === "string" &&
    typeof item["input"] === "string" &&
    typeof item["provider"] === "string" &&
    typeof item["trackCount"] === "number" &&
    (typeof item["artworkUrl"] === "string" || item["artworkUrl"] === null)
  );
}
