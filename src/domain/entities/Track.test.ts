import assert from "node:assert/strict";
import { test } from "node:test";
import { sharesArtist, trackLabel } from "./Track";

test("matches a shared artist regardless of casing or accents", () => {
  assert.ok(sharesArtist(["Beyoncé"], ["BEYONCE"]));
  assert.ok(sharesArtist(["Tame Impala"], ["tame  impala"]));
});

test("matches when only one credit of several overlaps", () => {
  assert.ok(sharesArtist(["Calvin Harris", "Rihanna"], ["Rihanna"]));
  assert.ok(sharesArtist(["Drake"], ["Future", "Drake"]));
});

test("does not match unrelated artists", () => {
  assert.equal(sharesArtist(["Queen"], ["Nirvana"]), false);
  assert.equal(sharesArtist([], ["Queen"]), false);
  assert.equal(sharesArtist(["Queen"], []), false);
});

test("an empty credit never counts as a match", () => {
  assert.equal(sharesArtist([""], [""]), false);
});

test("labels read as artist then title", () => {
  assert.equal(trackLabel({ title: "Numb", artists: ["Linkin Park"] }), "Linkin Park - Numb");
  assert.equal(trackLabel({ title: "Untitled", artists: [] }), "Untitled");
});
