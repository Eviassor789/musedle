import assert from "node:assert/strict";
import { test } from "node:test";
import { placeholderWaveform } from "./waveformPlaceholder";

const BUCKETS = 56;

test("the same track always draws the same shape", () => {
  const a = placeholderWaveform("track-abc", BUCKETS);
  const b = placeholderWaveform("track-abc", BUCKETS);
  assert.deepEqual([...a], [...b]);
});

/**
 * The regression this exists for: a single hard-coded silhouette under every
 * song looks like a broken feature rather than a placeholder.
 */
test("different tracks draw visibly different shapes", () => {
  const a = placeholderWaveform("kXYiU_JCYtU", BUCKETS);
  const b = placeholderWaveform("8SbUC-UaAxE", BUCKETS);

  const meanAbsoluteDifference =
    [...a].reduce((total, value, i) => total + Math.abs(value - (b[i] ?? 0)), 0) / BUCKETS;

  assert.ok(
    meanAbsoluteDifference > 0.05,
    `shapes are near-identical (mean difference ${meanAbsoluteDifference.toFixed(3)})`,
  );
});

test("stays within the drawable range", () => {
  for (const seed of ["a", "zzz", "spotify:track:123", ""]) {
    for (const value of placeholderWaveform(seed, BUCKETS)) {
      assert.ok(value >= 0 && value <= 1, `${seed} produced ${value}`);
    }
  }
});

test("has real variation rather than a flat line", () => {
  const values = [...placeholderWaveform("some-track", BUCKETS)];
  assert.ok(Math.max(...values) - Math.min(...values) > 0.2);
});

test("handles degenerate bucket counts", () => {
  assert.equal(placeholderWaveform("x", 0).length, 0);
  assert.equal(placeholderWaveform("x", 1).length, 1);
  assert.ok(Number.isFinite(placeholderWaveform("x", 1)[0]));
});
