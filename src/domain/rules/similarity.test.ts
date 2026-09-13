import assert from "node:assert/strict";
import { test } from "node:test";
import { matchesPrefix, normalizeKey, similarity, tokenize } from "./similarity";

test("folds case, accents and punctuation", () => {
  assert.equal(normalizeKey("Café del Mar!"), "cafe del mar");
  assert.equal(normalizeKey("Don't Stop Believin'"), "don t stop believin");
});

test("decoration does not decide a match", () => {
  assert.equal(similarity("Numb (Official Music Video)", "Numb"), 1);
  assert.equal(similarity("Queen - Bohemian Rhapsody", "Bohemian Rhapsody Queen"), 1);
});

test("different songs do not match", () => {
  assert.ok(similarity("Bohemian Rhapsody", "Smells Like Teen Spirit") < 0.2);
});

/**
 * The regression this file exists for.
 *
 * The key used to be built with `[^a-z0-9]+`, which erased every non-Latin
 * script to the empty string - and an empty key is not a weak match, it is a
 * guaranteed zero. A Hebrew song scored 0.00 against its own exact match in the
 * lyrics database and was thrown out as a mismatch, then every one of its lines
 * was dropped as unreadable. Nothing in the Latin tests above could catch it.
 */
test("non-Latin scripts survive normalisation", () => {
  for (const [script, sample] of [
    ["Hebrew", "אין לי ארץ אחרת"],
    ["Arabic", "نسم علينا الهوى"],
    ["Cyrillic", "Группа крови"],
    ["Greek", "Ένα το χελιδόνι"],
    ["Japanese", "上を向いて歩こう"],
    ["Korean", "아리랑"],
  ] as const) {
    assert.ok(normalizeKey(sample).length > 0, `${script} normalised to nothing`);
    assert.ok(tokenize(sample).length > 0, `${script} produced no tokens`);
  }
});

test("a non-Latin title matches itself exactly", () => {
  const hebrew = "אין לי ארץ אחרת";
  assert.equal(similarity(hebrew, hebrew), 1);
  assert.equal(similarity("אריק איינשטיין", "אריק איינשטיין"), 1);
});

test("non-Latin titles still tell each other apart", () => {
  assert.ok(similarity("אין לי ארץ אחרת", "סע לאט") < 0.2);
});

/** Punctuation differs between a title and a transcription of it. */
test("a non-Latin title survives different punctuation", () => {
  assert.equal(similarity("סע לאט!", "סע לאט"), 1);
});

/**
 * Hebrew vowel points are optional and inconsistently typed, so the two
 * spellings of the same word have to fold together.
 */
test("Hebrew niqqud is folded away", () => {
  assert.equal(normalizeKey("שָׁלוֹם"), normalizeKey("שלום"));
});

test("the guess box can be typed into in any script", () => {
  assert.ok(matchesPrefix("אריק איינשטיין - סע לאט", "סע"));
  assert.ok(!matchesPrefix("אריק איינשטיין - סע לאט", "שלום"));
});
