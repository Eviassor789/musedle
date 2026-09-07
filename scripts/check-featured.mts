/**
 * Checks every featured playlist still resolves, and still points at the
 * playlist its label promises.
 *
 * These are Spotify's own editorial playlists, reached through an undocumented
 * endpoint; they get retired and re-pointed without notice, and a card labelled
 * "80s" quietly loading a house compilation is worse than one that fails.
 *
 *   npm run featured
 */
import { FEATURED_PLAYLISTS } from "@/presentation/featuredPlaylists";
import { SpotifyEmbedSource } from "@/infrastructure/playlist/SpotifyEmbedSource";

const source = new SpotifyEmbedSource();
let problems = 0;

for (const featured of FEATURED_PLAYLISTS) {
  try {
    const playlist = await source.load(featured.url);
    const playable = playlist.tracks.filter((track) => track.source).length;
    const matches = playlist.title === featured.expectedTitle;
    if (!matches) problems++;

    console.log(
      `${matches ? "OK  " : "DRIFT"} ${featured.label.padEnd(14)} ` +
        `${String(playable).padStart(3)}/${playlist.tracks.length} playable · "${playlist.title}"` +
        (matches ? "" : `  (expected "${featured.expectedTitle}")`),
    );
  } catch (error) {
    problems++;
    console.log(`FAIL  ${featured.label.padEnd(14)} ${(error as Error).message.slice(0, 60)}`);
  }
}

console.log(problems === 0 ? "\nAll featured playlists healthy." : `\n${problems} need attention.`);
process.exit(problems === 0 ? 0 : 1);
