/**
 * Live smoke test for the import pipeline.
 *
 * Unlike the unit tests, this one really talks to Spotify, YouTube and LRCLIB.
 * It is the fastest way to find out whether an upstream response shape has
 * drifted, which is the main risk of building on other people's endpoints.
 *
 *   npm run smoke
 */
import { ImportPlaylist, PlaylistSourceRegistry } from "@/application/usecases/ImportPlaylist";
import { MemoryResolutionCache } from "@/infrastructure/cache/ResolutionCaches";
import { SpotifyEmbedSource } from "@/infrastructure/playlist/SpotifyEmbedSource";
import { TextListSource } from "@/infrastructure/playlist/TextListSource";
import { YouTubePlaylistSource } from "@/infrastructure/playlist/YouTubePlaylistSource";
import { CachedTrackResolver } from "@/infrastructure/resolver/CachedTrackResolver";
import { YouTubeMusicResolver } from "@/infrastructure/resolver/YouTubeMusicResolver";
import { InnerTubeClient } from "@/infrastructure/youtube/InnerTubeClient";
import { LrcLibProvider } from "@/infrastructure/lyrics/LrcLibProvider";

const innerTube = new InnerTubeClient();
const importer = new ImportPlaylist(
  new PlaylistSourceRegistry([
    new SpotifyEmbedSource(),
    new YouTubePlaylistSource(innerTube),
    new TextListSource(),
  ]),
  new CachedTrackResolver(new YouTubeMusicResolver(innerTube), new MemoryResolutionCache()),
);

const CASES: ReadonlyArray<{ name: string; input: string }> = [
  { name: "Spotify playlist", input: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M" },
  { name: "Spotify album", input: "https://open.spotify.com/album/4m2880jivSbbyEGAKfITCa" },
  { name: "YouTube playlist", input: "https://www.youtube.com/playlist?list=PLyORnIW1xT6wFALM5dZlkFhOULbToFok3" },
  {
    name: "Pasted list",
    input: [
      "1. Tame Impala - The Less I Know The Better",
      "Nirvana – Smells Like Teen Spirit  3:45",
      "Fleetwood Mac - Dreams",
      "Daft Punk - Get Lucky feat. Pharrell Williams",
      "Kendrick Lamar - HUMBLE.",
    ].join("\n"),
  },
];

let failures = 0;

for (const { name, input } of CASES) {
  const startedAt = Date.now();
  try {
    const playlist = await importer.execute(input);
    const kinds = new Set(playlist.tracks.map((t) => t.source.kind));
    console.log(
      `PASS  ${name.padEnd(18)} ${String(playlist.tracks.length).padStart(3)} playable` +
        ` · ${playlist.unresolvedCount} dropped · [${[...kinds].join(", ")}]` +
        ` · ${Date.now() - startedAt}ms · "${playlist.title.slice(0, 40)}"`,
    );
    const [first] = playlist.tracks;
    if (first) console.log(`      e.g. ${first.artists.join(", ")} - ${first.title}`);
  } catch (error) {
    failures++;
    console.error(`FAIL  ${name.padEnd(18)} ${(error as Error).message}`);
  }
}

// Lyrics mode leans on a second external service, so check that too.
const lyricsProvider = new LrcLibProvider();
const LYRIC_CASES: ReadonlyArray<{ title: string; artists: string[]; durationMs: number }> = [
  { title: "The Less I Know The Better", artists: ["Tame Impala"], durationMs: 216_000 },
  { title: "Smells Like Teen Spirit", artists: ["Nirvana"], durationMs: 301_000 },
  { title: "Dreams", artists: ["Fleetwood Mac"], durationMs: 257_000 },
];

console.log("");
for (const query of LYRIC_CASES) {
  const label = `${query.artists[0]} - ${query.title}`;
  const lyrics = await lyricsProvider.fetch(query);

  if (!lyrics) {
    failures++;
    console.error(`FAIL  lyrics  ${label}: no usable words`);
    continue;
  }

  console.log(
    `PASS  lyrics  ${label.padEnd(34)} ${String(lyrics.lines.length).padStart(3)} lines` +
      ` · album ${lyrics.albumName === null ? "(withheld)" : `"${lyrics.albumName}"`}`,
  );
}

console.log(failures === 0 ? "\nAll external paths healthy." : `\n${failures} path(s) failing.`);
process.exit(failures === 0 ? 0 : 1);
