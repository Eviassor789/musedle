import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanAlbumName, LrcLibProvider, rejectsAlbum } from "./LrcLibProvider";

/** All of these are values LRCLIB actually returned while building this. */
test("strips catalogue noise from a real album name", () => {
  assert.equal(cleanAlbumName("Currents (CD)"), "Currents");
  assert.equal(cleanAlbumName("Rumours (1988, 20P2-2036)"), "Rumours");
  assert.equal(cleanAlbumName("Nevermind [Remastered]"), "Nevermind");
});

test("strips more than one trailing suffix", () => {
  assert.equal(cleanAlbumName("Rumours (Remaster) (CD)"), "Rumours");
});

test("treats submitter placeholders as no album at all", () => {
  for (const value of ["NA", "N/A", "unknown", "none", "-", "??", "  "]) {
    assert.equal(cleanAlbumName(value), null, `${value} should be null`);
  }
  assert.equal(cleanAlbumName(null), null);
});

test("leaves an ordinary album name alone", () => {
  assert.equal(cleanAlbumName("Random Access Memories"), "Random Access Memories");
  assert.equal(cleanAlbumName("21"), "21");
});

/** A name that is only a parenthetical has nothing left once stripped. */
test("a name made entirely of noise becomes null", () => {
  assert.equal(cleanAlbumName("(CD)"), null);
});

/**
 * These are the album names LRCLIB actually served for these tracks. Each one
 * would have been shown to a player as "the album" hint.
 */
test("rejects compilation and genre-bucket albums", () => {
  const junk = [
    "Holiday Hits 2023",
    "Leather and Lace Live",
    "Deutsche TOP 100 Single_Jahres",
    "Rap Hip hop  Selecta",
    "90s Anthems",
    "Now That's What I Call Music",
    "The Best of Queen",
    "Greatest Hits",
    "Ultimate Collection",
    "Bangers Vol. 3",
  ];
  for (const name of junk) {
    assert.equal(rejectsAlbum(name), true, `${name} should be rejected`);
  }
});

test("keeps real album names", () => {
  const real = ["Currents", "Rumours", "Nevermind", "Random Access Memories", "21", "Abbey Road"];
  for (const name of real) {
    assert.equal(rejectsAlbum(name), false, `${name} should be kept`);
  }
});

/* ------------------------- the artist-blind fallback ------------------------- */

/** Enough invented lines to clear MIN_USABLE_LINES, in no particular language. */
const WORDS = Array.from({ length: 10 }, (_, i) => `line number ${i} of this song`).join("\n");

/** A stub LRCLIB that answers the structured search and the title-only one. */
function stubFetch(rows: { structured: unknown[]; byTitle: unknown[] }): typeof fetch {
  return (async (url: string) => ({
    ok: true,
    json: async () => (String(url).includes("artist_name=") ? rows.structured : rows.byTitle),
  })) as unknown as typeof fetch;
}

const row = (trackName: string, artistName: string, durationSeconds: number) => ({
  trackName,
  artistName,
  albumName: "Some Album",
  duration: durationSeconds,
  instrumental: false,
  plainLyrics: WORDS,
});

/**
 * The two catalogues disagree about which script an artist's name is written
 * in - LRCLIB credits "Danny Robas" where the playlist says "דני רובס" - so the
 * artist has to be set aside and the duration has to take over its job.
 */
test("a title-only match is taken when the recording length agrees", async () => {
  const provider = new LrcLibProvider(
    stubFetch({ structured: [], byTitle: [row("אני בא הביתה מהלילה", "Danny Robas", 287)] }),
  );
  const lyrics = await provider.fetch({
    title: "אני בא הביתה מהלילה",
    artists: ["דני רובס"],
    durationMs: 287_000,
  });
  assert.ok(lyrics, "the differently-scripted credit should not have blocked the match");
});

/**
 * And the reason that is safe. Three separate Israeli artists have a song
 * called בלעדייך; without the duration check the first one found would be
 * quoted at a player guessing a different song entirely.
 */
test("a title-only match is refused when the length disagrees", async () => {
  const provider = new LrcLibProvider(
    stubFetch({ structured: [], byTitle: [row("בלעדייך", "Somebody Else", 300)] }),
  );
  const lyrics = await provider.fetch({
    title: "בלעדייך",
    artists: ["Gidi Gov"],
    durationMs: 228_000,
  });
  assert.equal(lyrics, null);
});

test("a different song of the same length is still refused", async () => {
  const provider = new LrcLibProvider(
    stubFetch({ structured: [], byTitle: [row("A Totally Different Song", "Someone", 228)] }),
  );
  const lyrics = await provider.fetch({
    title: "בלעדייך",
    artists: ["Gidi Gov"],
    durationMs: 228_000,
  });
  assert.equal(lyrics, null);
});

test("with no duration there is no fallback at all", async () => {
  const provider = new LrcLibProvider(
    stubFetch({ structured: [], byTitle: [row("בלעדייך", "Anyone", 228)] }),
  );
  const lyrics = await provider.fetch({
    title: "בלעדייך",
    artists: ["Gidi Gov"],
    durationMs: null,
  });
  assert.equal(lyrics, null, "guessing is worse than missing when nothing can corroborate");
});

test("the fallback never displaces a proper artist match", async () => {
  const provider = new LrcLibProvider(
    stubFetch({
      structured: [row("בלעדייך", "Gidi Gov", 228)],
      byTitle: [row("בלעדייך", "Someone Else", 228)],
    }),
  );
  const lyrics = await provider.fetch({
    title: "בלעדייך",
    artists: ["Gidi Gov"],
    durationMs: 228_000,
  });
  assert.ok(lyrics);
});
