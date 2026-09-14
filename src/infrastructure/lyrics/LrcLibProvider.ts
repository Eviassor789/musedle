import type { LyricsProvider, LyricsQuery } from "@/application/ports/LyricsProvider";
import type { Lyrics } from "@/domain/entities/Lyrics";
import { MIN_USABLE_LINES, usableLyricLines } from "@/domain/rules/lyricLines";
import { similarity } from "@/domain/rules/similarity";

/**
 * Lyrics from LRCLIB, an open, free, key-less lyrics database.
 *
 * The exact-match endpoint needs an album name we do not have, so this goes
 * through search - and search is noisy. A query for "Smells Like Teen Spirit"
 * returns twenty rows including live bootlegs, an "MTV Studios 1992" cut, and an
 * artist field reading "Nirvana - Nirvana". Taking the first row would regularly
 * quote the wrong recording, so candidates are scored, and the clearest signal
 * is duration: a live take is rarely within seconds of the studio one.
 *
 * Some rows also carry pasted credits where the words should be ("Artist: ...
 * Album: ..."), which the domain's line filter strips. If too little survives,
 * the candidate is rejected rather than served as a round nobody can win.
 */

const ENDPOINT = "https://lrclib.net/api";

/**
 * We could not ask - as distinct from LRCLIB answering "no such song".
 *
 * The difference matters entirely to the cache: one is a fact about a song and
 * worth remembering forever, the other is a fact about a moment and must not
 * outlive it.
 */
export class LyricsUnavailableError extends Error {}

/** LRCLIB asks its clients to identify themselves. */
const USER_AGENT = "Musedle/0.1 (https://github.com/musedle/musedle)";

/** Beyond this the recording is a different cut - live, extended, remixed. */
const MAX_DURATION_DRIFT_MS = 15_000;

/** Below this the row is probably a different song that shares some words. */
const MIN_CONFIDENCE = 0.5;

/**
 * How close a title must be before an artist-blind row is even considered,
 * and how tightly the recording's length must then agree.
 *
 * See `byTitleAlone` for why the second number is doing all the work.
 */
const FALLBACK_TITLE_SIMILARITY = 0.9;

/**
 * A YouTube playlist reports the length of the *video*, not of the recording:
 * sampled against the database, the same songs differ by up to twenty seconds
 * once idents, intros and dead air at the end are counted. Seven seconds only
 * ever matched a Spotify-sourced playlist.
 */
const FALLBACK_DRIFT_MS = 20_000;

/**
 * How far apart the surviving candidates may be from *each other*.
 *
 * This is what replaces the artist check. Rows within a second or two of the
 * same length are the same recording submitted more than once, so it does not
 * matter which is taken - but rows of visibly different lengths are different
 * recordings, and with the credit set aside there is nothing left to tell them
 * apart. Six artists have a song called בלעדייך; when several of them land in
 * the window, the honest answer is to refuse rather than guess.
 */
const FALLBACK_SPREAD_MS = 8_000;

/**
 * Album names that are not the song's actual album.
 *
 * LRCLIB rows frequently credit a chart compilation or a live recording rather
 * than the release. Observed while building this: "Holiday Hits 2023", "Leather
 * and Lace Live", "Deutsche TOP 100 Single_Jahres". That matters twice over -
 * the album is one of the hints, and a live cut also has different words from
 * the studio take, so such a row is the wrong lyrics as well as the wrong album.
 */
const COMPILATION_ALBUM = new RegExp(
  String.raw`\b(?:live|unplugged|karaoke|tribute|instrumental|remixes?` +
    String.raw`|greatest\s+hits|best\s+of|top\s*\d+|hits|compilation|various|jahres|now\s+that` +
    // Genre-bucket and chart names: "Rap Hip hop Selecta", "90s Anthems".
    String.raw`|selecta|mixtape|playlist|essentials|anthems|collection|sampler|megamix|charts?` +
    String.raw`|vol\.?\s*\d)\b`,
  "i",
);

function looksLikeCompilation(albumName: string | null): boolean {
  return albumName !== null && COMPILATION_ALBUM.test(albumName);
}

/** Would this album be withheld from the player? Exposed for testing. */
export function rejectsAlbum(albumName: string | null): boolean {
  return looksLikeCompilation(albumName) || cleanAlbumName(albumName) === null;
}

/** Values submitters use to mean "I do not know". */
const PLACEHOLDER_ALBUM = /^(?:n\/?a|unknown|none|null|single|-+|\?+)$/i;

/** Catalogue noise appended to a release name: "(CD)", "(1988, 20P2-2036)". */
const ALBUM_SUFFIX = /\s*[([][^)\]]*[)\]]\s*$/;

/**
 * Tidies an album into something worth showing as a hint.
 *
 * Real observed values: "Currents (CD)", "Rumours (1988, 20P2-2036)", "NA".
 * The first two are the right album wearing a catalogue number; the third is
 * not an album at all. Returns null when nothing useful is left.
 */
export function cleanAlbumName(raw: string | null): string | null {
  if (raw === null) return null;

  let name = raw.trim();
  // Repeat: some names carry two suffixes, "Rumours (Remaster) (CD)".
  for (let i = 0; i < 3 && ALBUM_SUFFIX.test(name); i++) {
    name = name.replace(ALBUM_SUFFIX, "").trim();
  }

  if (name.length === 0 || PLACEHOLDER_ALBUM.test(name)) return null;
  return name;
}

interface LrcLibRow {
  readonly trackName?: unknown;
  readonly artistName?: unknown;
  readonly albumName?: unknown;
  readonly duration?: unknown;
  readonly instrumental?: unknown;
  readonly plainLyrics?: unknown;
}

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

export class LrcLibProvider implements LyricsProvider {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async fetch(query: LyricsQuery): Promise<Lyrics | null> {
    // Ranked best-first, but a high score is no guarantee the row's lyrics
    // survive cleaning - so walk down until one actually yields a round.
    for (const row of this.rank(await this.search(query), query)) {
      const lyrics = this.toLyrics(row, query.title);
      if (lyrics) return lyrics;
    }

    for (const row of await this.byTitleAlone(query)) {
      const lyrics = this.toLyrics(row, query.title);
      if (lyrics) return lyrics;
    }
    return null;
  }

  /**
   * Last resort: the same title, ignoring who it is credited to.
   *
   * The two catalogues routinely disagree about which *script* an artist's
   * name is written in. LRCLIB credits "Danny Robas" where the playlist says
   * "דני רובס", and "גידי גוב" where the playlist says "Gidi Gov" - the
   * mismatch runs in both directions, neither side is wrong, and nothing short
   * of transliteration can match one to the other. So the artist is set aside.
   *
   * That is only safe because duration takes over the job. Matching on title
   * alone is exactly how you end up quoting a different singer's song of the
   * same name - three separate Israeli artists have a song called בלעדייך - so
   * a row is taken only when the title is all but identical *and* the recording
   * is within a few seconds of the one in the playlist. Two different songs
   * sharing a title and a running time is rare; one of them being the first
   * result is rarer still, and the closest length wins regardless.
   *
   * With no duration to check against there is no fallback at all. A guess
   * here is worse than a miss: a miss moves to the next song, while a wrong
   * match spends a player's whole round on clues from a song that was never in
   * the playlist.
   */
  private async byTitleAlone(query: LyricsQuery): Promise<LrcLibRow[]> {
    const wantedMs = query.durationMs;
    if (wantedMs === null) return [];

    const rows = await this.request({ track_name: query.title });

    const survivors = rows
      .map((row) => ({
        row,
        driftMs:
          typeof row.duration === "number"
            ? Math.abs(row.duration * 1000 - wantedMs)
            : Number.POSITIVE_INFINITY,
      }))
      .filter(
        ({ row, driftMs }) =>
          driftMs <= FALLBACK_DRIFT_MS &&
          similarity(asString(row.trackName) ?? "", query.title) >= FALLBACK_TITLE_SIMILARITY,
      )
      .sort((a, b) => a.driftMs - b.driftMs);

    if (survivors.length === 0) return [];

    // All one recording, or several different ones? See FALLBACK_SPREAD_MS.
    const lengths = survivors.map(({ row }) => (row.duration as number) * 1000);
    const spreadMs = Math.max(...lengths) - Math.min(...lengths);
    if (spreadMs > FALLBACK_SPREAD_MS) return [];

    return survivors.map(({ row }) => row);
  }

  private search(query: LyricsQuery): Promise<LrcLibRow[]> {
    return this.request({
      track_name: query.title,
      artist_name: query.artists.join(" "),
    });
  }

  /**
   * One search, which either answers or fails loudly.
   *
   * Deliberately *not* swallowing transport errors into an empty list. "LRCLIB
   * has no such song" and "we could not ask LRCLIB" look identical to the
   * caller if both come back empty, and the result gets cached forever - so a
   * single blip, a rate-limited burst, or a dev server reloading mid-edit turns
   * a perfectly ordinary song into a permanent miss for the life of the
   * process. That is the failure that made an Earth, Wind & Fire track look
   * like it had no lyrics. Throwing keeps the two outcomes distinguishable, and
   * the cache above only remembers real answers.
   */
  private async request(fields: Record<string, string>): Promise<LrcLibRow[]> {
    const params = new URLSearchParams(fields);

    const response = await this.fetchImpl(`${ENDPOINT}/search?${params}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      // The words to a song do not change; let the platform cache hard.
      next: { revalidate: 60 * 60 * 24 * 7 },
    } as RequestInit);

    if (!response.ok) {
      throw new LyricsUnavailableError(`LRCLIB answered ${response.status}.`);
    }

    const payload: unknown = await response.json();
    return Array.isArray(payload) ? (payload as LrcLibRow[]) : [];
  }

  /** Best match first. Text similarity opens, duration decides. */
  private rank(rows: readonly LrcLibRow[], query: LyricsQuery): LrcLibRow[] {
    const wantedArtists = query.artists.join(" ");

    return rows
      .map((row) => {
        const titleScore = similarity(asString(row.trackName) ?? "", query.title);
        const artistScore = wantedArtists
          ? similarity(asString(row.artistName) ?? "", wantedArtists)
          : 1;

        let score = titleScore * 0.5 + artistScore * 0.5;

        if (query.durationMs !== null && typeof row.duration === "number") {
          const driftMs = Math.abs(row.duration * 1000 - query.durationMs);
          if (driftMs > MAX_DURATION_DRIFT_MS) score -= 0.5;
          // A near-exact length is the clearest sign this is the same recording.
          else score += 0.3 * (1 - driftMs / MAX_DURATION_DRIFT_MS);
        }

        // Prefer a row credited to a real release over a chart compilation.
        if (looksLikeCompilation(asString(row.albumName))) score -= 0.3;

        return { row, score };
      })
      .filter((candidate) => candidate.score >= MIN_CONFIDENCE)
      .sort((a, b) => b.score - a.score)
      .map((candidate) => candidate.row);
  }

  private toLyrics(row: LrcLibRow, title: string): Lyrics | null {
    if (row.instrumental === true) return null;

    const plain = asString(row.plainLyrics);
    if (!plain) return null;

    const lines = usableLyricLines(plain, title);
    // Too little left to build a five-hint round from.
    if (lines.length < MIN_USABLE_LINES) return null;

    // Only offer an album we believe in. A hint reading "Holiday Hits 2023" is
    // worse than no hint at all; the round shows an extra lyric line instead.
    const raw = asString(row.albumName);
    const albumName = looksLikeCompilation(raw) ? null : cleanAlbumName(raw);
    return { lines, albumName };
  }
}
