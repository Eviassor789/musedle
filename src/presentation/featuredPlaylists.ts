export interface FeaturedPlaylist {
  /** Short label on the card. */
  readonly label: string;
  /** The playlist's real Spotify title, used to check the id still points here. */
  readonly expectedTitle: string;
  readonly url: string;
}

/**
 * Somewhere to start without hunting down a link.
 *
 * Every id below was checked against the live embed endpoint and every label
 * matches the playlist's real title - `npm run featured` re-checks that, because
 * these are Spotify's own editorial playlists and it retires them without
 * notice. Two ids that looked right during this list's first draft turned out to
 * point at completely different playlists, which is exactly the failure the
 * check exists to catch.
 *
 * Note there is no "2020s" card: Spotify publishes no public All Out 2020s, so
 * the run ends with the current-hits playlist rather than a decade label
 * pointing at something that is not that decade.
 */
export const FEATURED_PLAYLISTS: readonly FeaturedPlaylist[] = [
  { label: "50s", expectedTitle: "All Out 50s", url: "https://open.spotify.com/playlist/37i9dQZF1DWSV3Tk4GO2fq" },
  { label: "60s", expectedTitle: "All Out 60s", url: "https://open.spotify.com/playlist/37i9dQZF1DXaKIA8E7WcJj" },
  { label: "70s", expectedTitle: "All Out 70s", url: "https://open.spotify.com/playlist/37i9dQZF1DWTJ7xPn4vNaz" },
  { label: "80s", expectedTitle: "All Out 80s", url: "https://open.spotify.com/playlist/37i9dQZF1DX4UtSsGT1Sbe" },
  { label: "90s", expectedTitle: "All Out 90s", url: "https://open.spotify.com/playlist/37i9dQZF1DXbTxeAdrVG2l" },
  { label: "2000s", expectedTitle: "All Out 2000s", url: "https://open.spotify.com/playlist/37i9dQZF1DX4o1oenSJRJd" },
  { label: "2010s", expectedTitle: "All Out 2010s", url: "https://open.spotify.com/playlist/37i9dQZF1DX5Ejj0EkURtP" },
  { label: "Today's hits", expectedTitle: "Today’s Top Hits", url: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M" },
  { label: "All-time hits", expectedTitle: "just hits", url: "https://open.spotify.com/playlist/37i9dQZF1DXcRXFNfZr7Tp" },
  { label: "Rock classics", expectedTitle: "Rock Classics", url: "https://open.spotify.com/playlist/37i9dQZF1DWXRqgorJj26U" },
];
