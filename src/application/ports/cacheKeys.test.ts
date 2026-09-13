import assert from "node:assert/strict";
import { test } from "node:test";
import { lyricsQueryKey } from "./LyricsProvider";
import { trackQueryKey } from "./TrackResolver";

const track = (title: string, artist: string) => ({ title, artists: [artist], durationMs: null });

const KEY_BUILDERS = [
  ["trackQueryKey", trackQueryKey],
  ["lyricsQueryKey", lyricsQueryKey],
] as const;

/**
 * The regression this file exists for, and the worst of the family.
 *
 * Both keys were built with a hand-copied Latin-only normaliser, so every
 * non-Latin song in a playlist reduced to the same empty key. That is not a
 * cache that misses - it is a cache that answers, confidently, with a different
 * song's video or a different song's words. It is also written to disk, so one
 * poisoned entry outlived the session that made it.
 */
test("different non-Latin songs get different keys", () => {
  for (const [name, key] of KEY_BUILDERS) {
    const keys = new Set([
      key(track("סע לאט", "אריק איינשטיין")),
      key(track("אין לי ארץ אחרת", "גלי עטרי")),
      key(track("أهواك", "عبد الحليم حافظ")),
      key(track("Группа крови", "Кино")),
      key(track("上を向いて歩こう", "坂本九")),
    ]);
    assert.equal(keys.size, 5, `${name} collapsed distinct songs into ${keys.size} key(s)`);
  }
});

test("two songs by the same non-Latin artist stay apart", () => {
  for (const [name, key] of KEY_BUILDERS) {
    assert.notEqual(
      key(track("סע לאט", "אריק איינשטיין")),
      key(track("אהובתי", "אריק איינשטיין")),
      `${name} confused two songs by one artist`,
    );
  }
});

test("a key is never empty, whatever the title is made of", () => {
  for (const [name, key] of KEY_BUILDERS) {
    // Nothing survives normalising, so the raw text has to carry the identity.
    const a = key(track("!!!", "???"));
    const b = key(track("***", "???"));
    assert.notEqual(a, b, `${name} collided on unnormalisable titles`);
  }
});

test("the same song always produces the same key", () => {
  for (const [, key] of KEY_BUILDERS) {
    assert.equal(key(track("סע לאט", "אריק איינשטיין")), key(track("סע לאט", "אריק איינשטיין")));
    // Punctuation and casing must not split one song into two entries.
    assert.equal(key(track("Bohemian Rhapsody", "Queen")), key(track("bohemian rhapsody!", "QUEEN")));
  }
});

/**
 * Latin keys must be byte-identical to what the old normaliser produced, or
 * every cache entry on disk is orphaned and every track is re-resolved.
 */
test("Latin keys are unchanged by the rewrite", () => {
  assert.equal(trackQueryKey(track("Bohemian Rhapsody", "Queen")), "queen|bohemian rhapsody");
  assert.equal(lyricsQueryKey(track("Café del Mar", "Energy 52")), "energy 52|cafe del mar");
});
