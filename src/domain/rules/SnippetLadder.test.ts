import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_LADDER_MS, SnippetLadder } from "./SnippetLadder";

/**
 * The shape of the default ladder is a game-design decision, not an
 * implementation detail: it is how hard the opening clue is. Pinned here so
 * that changing it is a deliberate act rather than a typo.
 */
test("the default ladder opens on half a second and doubles to sixteen", () => {
  assert.deepEqual(DEFAULT_LADDER_MS, [500, 1000, 2000, 4000, 8000, 16000]);

  const ladder = SnippetLadder.default();
  assert.equal(ladder.maxAttempts, 6);
  assert.equal(ladder.durationAtMs(0), 500);
  assert.equal(ladder.maxDurationMs, 16_000);
});

test("an attempt beyond either end clamps to the nearest rung", () => {
  const ladder = SnippetLadder.default();
  assert.equal(ladder.durationAtMs(-1), 500);
  assert.equal(ladder.durationAtMs(99), 16_000);
});

test("only the last rung is final", () => {
  const ladder = SnippetLadder.default();
  assert.ok(!ladder.isFinalAttempt(ladder.maxAttempts - 2));
  assert.ok(ladder.isFinalAttempt(ladder.maxAttempts - 1));
});
