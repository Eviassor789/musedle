import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_LADDER_MS, HARD_LADDER_MS, SnippetLadder } from "./SnippetLadder";

/**
 * The shape of each ladder is a game-design decision, not an implementation
 * detail: it is how hard the opening clue is, and how many guesses you get.
 * Pinned here so that changing either is a deliberate act rather than a typo.
 */
test("the default ladder opens on a second and doubles to sixteen", () => {
  assert.deepEqual(DEFAULT_LADDER_MS, [1000, 2000, 4000, 8000, 16000]);

  const ladder = SnippetLadder.default();
  assert.equal(ladder.maxAttempts, 5);
  assert.equal(ladder.durationAtMs(0), 1000);
  assert.equal(ladder.maxDurationMs, 16_000);
});

test("the hard ladder is the default with a half second in front of it", () => {
  assert.deepEqual(HARD_LADDER_MS, [500, ...DEFAULT_LADDER_MS]);

  const ladder = SnippetLadder.hard();
  assert.equal(ladder.maxAttempts, 6);
  assert.equal(ladder.durationAtMs(0), 500);
  // The extra rung buys a guess; it does not buy more audio at the end.
  assert.equal(ladder.maxDurationMs, SnippetLadder.default().maxDurationMs);
});

test("an attempt beyond either end clamps to the nearest rung", () => {
  const ladder = SnippetLadder.hard();
  assert.equal(ladder.durationAtMs(-1), 500);
  assert.equal(ladder.durationAtMs(99), 16_000);
});

test("only the last rung is final", () => {
  for (const ladder of [SnippetLadder.default(), SnippetLadder.hard()]) {
    assert.ok(!ladder.isFinalAttempt(ladder.maxAttempts - 2));
    assert.ok(ladder.isFinalAttempt(ladder.maxAttempts - 1));
  }
});

test("both ladders are shared instances", () => {
  assert.equal(SnippetLadder.default(), SnippetLadder.default());
  assert.equal(SnippetLadder.hard(), SnippetLadder.hard());
  assert.notEqual(SnippetLadder.default(), SnippetLadder.hard());
});
