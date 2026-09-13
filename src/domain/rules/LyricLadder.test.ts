import assert from "node:assert/strict";
import { test } from "node:test";
import { LYRIC_ATTEMPTS, lyricLadder, nextLyricHint } from "./LyricLadder";

/**
 * The regression this file exists for.
 *
 * A lyrics round counts its attempts in ladder rungs but spends them on the
 * reveal schedule. While both happened to be five long, sharing the audio
 * ladder worked; the moment the audio game grew a half-second rung it would
 * have handed lyrics players a sixth guess that reveals nothing new.
 */
test("the lyrics ladder has exactly one rung per reveal", () => {
  assert.equal(lyricLadder().maxAttempts, LYRIC_ATTEMPTS);
});

test("every attempt but the last still has a hint left to give", () => {
  for (let attempt = 0; attempt < LYRIC_ATTEMPTS - 1; attempt++) {
    assert.ok(nextLyricHint(attempt), `attempt ${attempt} should promise a hint`);
  }
  assert.equal(nextLyricHint(LYRIC_ATTEMPTS - 1), null);
});

test("the lyrics ladder is one shared instance", () => {
  assert.equal(lyricLadder(), lyricLadder());
});
