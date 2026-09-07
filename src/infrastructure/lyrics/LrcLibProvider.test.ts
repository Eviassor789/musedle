import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanAlbumName, rejectsAlbum } from "./LrcLibProvider";

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
