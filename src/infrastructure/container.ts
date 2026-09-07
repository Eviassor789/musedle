import { join } from "node:path";
import { ImportPlaylist, PlaylistSourceRegistry } from "@/application/usecases/ImportPlaylist";
import type { ResolutionCache } from "@/application/ports/ResolutionCache";
import {
  FileResolutionCache,
  MemoryResolutionCache,
  TieredResolutionCache,
} from "@/infrastructure/cache/ResolutionCaches";
import { SpotifyEmbedSource } from "@/infrastructure/playlist/SpotifyEmbedSource";
import { TextListSource } from "@/infrastructure/playlist/TextListSource";
import { YouTubePlaylistSource } from "@/infrastructure/playlist/YouTubePlaylistSource";
import { CachedTrackResolver } from "@/infrastructure/resolver/CachedTrackResolver";
import { YouTubeMusicResolver } from "@/infrastructure/resolver/YouTubeMusicResolver";
import { InnerTubeClient } from "@/infrastructure/youtube/InnerTubeClient";
import type { LyricsProvider } from "@/application/ports/LyricsProvider";
import { CachedLyricsProvider } from "@/infrastructure/lyrics/CachedLyricsProvider";
import { LrcLibProvider } from "@/infrastructure/lyrics/LrcLibProvider";

/**
 * Composition root - the one place that knows which concrete adapter fills
 * which port. Everything else depends on interfaces only, so swapping a
 * provider is an edit here and nowhere else.
 */

function buildCache(): ResolutionCache {
  const memory = new MemoryResolutionCache();
  // Serverless filesystems are read-only; FileResolutionCache degrades to a
  // no-op write there, so this stays safe in both environments.
  if (process.env.NODE_ENV === "production" && process.env.MUSEDLE_CACHE_DIR === undefined) {
    return memory;
  }
  const dir = process.env.MUSEDLE_CACHE_DIR ?? join(process.cwd(), ".cache");
  return new TieredResolutionCache([memory, new FileResolutionCache(join(dir, "resolutions.json"))]);
}

function build(): ImportPlaylist {
  const innerTube = new InnerTubeClient();

  const registry = new PlaylistSourceRegistry([
    // Link adapters first; the pasted-list adapter accepts almost anything.
    new SpotifyEmbedSource(),
    new YouTubePlaylistSource(innerTube),
    new TextListSource(),
  ]);

  const resolver = new CachedTrackResolver(new YouTubeMusicResolver(innerTube), buildCache());

  return new ImportPlaylist(registry, resolver);
}

/**
 * Held on globalThis so Next's dev-mode module reloading does not throw away a
 * warm resolution cache on every edit.
 */
const globalRef = globalThis as typeof globalThis & {
  __musedleImportPlaylist?: ImportPlaylist;
  __musedleLyrics?: LyricsProvider;
};

export function getImportPlaylist(): ImportPlaylist {
  globalRef.__musedleImportPlaylist ??= build();
  return globalRef.__musedleImportPlaylist;
}

export function getLyricsProvider(): LyricsProvider {
  globalRef.__musedleLyrics ??= new CachedLyricsProvider(new LrcLibProvider());
  return globalRef.__musedleLyrics;
}
