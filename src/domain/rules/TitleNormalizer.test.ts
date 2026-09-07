import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cleanChannelName,
  normalizeVideoTitle,
  parseDurationLabel,
  splitArtistCredit,
} from "./TitleNormalizer";

test("strips promo noise in brackets", () => {
  const r = normalizeVideoTitle("Numb (Official Music Video) [4K UPGRADE] – Linkin Park", "Linkin Park");
  assert.equal(r.title, "Numb");
  assert.deepEqual(r.artists, ["Linkin Park"]);
});

test("handles the conventional Artist - Title order", () => {
  const r = normalizeVideoTitle("Tame Impala - The Less I Know The Better", "TameImpalaVEVO");
  assert.equal(r.title, "The Less I Know The Better");
  assert.deepEqual(r.artists, ["Tame Impala"]);
});

test("uses the channel to detect the reversed Title - Artist order", () => {
  const r = normalizeVideoTitle("Bohemian Rhapsody - Queen", "Queen Official");
  assert.equal(r.title, "Bohemian Rhapsody");
  assert.deepEqual(r.artists, ["Queen"]);
});

test("falls back to the channel when there is no separator", () => {
  const r = normalizeVideoTitle("Redbone (Official Audio)", "Childish Gambino - Topic");
  assert.equal(r.title, "Redbone");
  assert.deepEqual(r.artists, ["Childish Gambino"]);
});

test("keeps meaningful parentheticals", () => {
  const r = normalizeVideoTitle("KAROL G - TQG (feat. Shakira) (Official Video)", "KAROL G");
  assert.equal(r.title, "TQG (feat. Shakira)");
  assert.deepEqual(r.artists, ["KAROL G"]);
});

test("keeps version markers that change the song", () => {
  const r = normalizeVideoTitle("Adele - Someone Like You (Acoustic) [HD]", "Adele");
  assert.equal(r.title, "Someone Like You (Acoustic)");
});

test("strips a trailing unbracketed suffix", () => {
  const r = normalizeVideoTitle("Dua Lipa - Levitating | Official Video", "Dua Lipa");
  assert.equal(r.title, "Levitating");
  assert.deepEqual(r.artists, ["Dua Lipa"]);
});

test("splits multi-artist credits", () => {
  assert.deepEqual(splitArtistCredit("KAROL G, Judeline & rusowsky"), [
    "KAROL G",
    "Judeline",
    "rusowsky",
  ]);
  assert.deepEqual(splitArtistCredit("Calvin Harris feat. Rihanna"), ["Calvin Harris", "Rihanna"]);
});

test("cleans Topic and VEVO channel suffixes", () => {
  assert.equal(cleanChannelName("Tame Impala - Topic"), "Tame Impala");
  assert.equal(cleanChannelName("ArianaGrandeVEVO"), "ArianaGrande");
  assert.equal(cleanChannelName(null), null);
});

test("never returns an empty title", () => {
  const r = normalizeVideoTitle("(Official Video)", null);
  assert.ok(r.title.length > 0);
});

test("parses duration badges", () => {
  assert.equal(parseDurationLabel("3:08"), 188_000);
  assert.equal(parseDurationLabel("1:02:33"), 3_753_000);
  assert.equal(parseDurationLabel("LIVE"), null);
  assert.equal(parseDurationLabel(null), null);
});

test("strips brackets only when every word inside is noise", () => {
  assert.equal(normalizeVideoTitle("Linkin Park - In The End [Official HD Music Video]", "Linkin Park").title, "In The End");
  assert.equal(normalizeVideoTitle("Queen - Bohemian Rhapsody (Official Video Remastered)", "Queen").title, "Bohemian Rhapsody");
  assert.equal(normalizeVideoTitle("Oasis - Wonderwall (2014 Remaster)", "Oasis").title, "Wonderwall");
  // ...but a bracket carrying real information survives intact.
  assert.equal(normalizeVideoTitle("Deadmau5 - Strobe (Original Mix)", "Deadmau5").title, "Strobe (Original Mix)");
  assert.equal(normalizeVideoTitle("Nirvana - Come As You Are (Live At Reading)", "Nirvana").title, "Come As You Are (Live At Reading)");
});
