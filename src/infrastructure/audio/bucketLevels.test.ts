import assert from "node:assert/strict";
import { test } from "node:test";
import { bucketLevels, type DecodedAudio } from "./bucketLevels";

const SAMPLE_RATE = 44_100;

function audioFrom(samples: Float32Array): DecodedAudio {
  return { sampleRate: SAMPLE_RATE, getChannelData: () => samples };
}

/** A deterministic signal whose loudness wanders, like a real track's. */
function varyingSignal(seconds: number): Float32Array {
  const samples = new Float32Array(Math.floor(seconds * SAMPLE_RATE));
  let seed = 12345;
  for (let i = 0; i < samples.length; i++) {
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
    const noise = (seed / 0x7fffffff) * 2 - 1;
    // Slow envelope so different buckets land at genuinely different levels.
    const envelope = 0.05 + 0.95 * Math.abs(Math.sin((i / samples.length) * Math.PI * 7));
    samples[i] = noise * envelope;
  }
  return samples;
}

/**
 * The regression this module was extracted for.
 *
 * `levels` is a Float32Array, so storing a double rounds it, and the rounding
 * can go down. Taking the minimum from the pre-store double and subtracting it
 * from the post-store float made the quietest bucket very slightly negative,
 * and `Math.pow(negative, 0.85)` is NaN. A NaN bar height draws absolutely
 * nothing, which appeared as bars missing from the middle of the waveform.
 */
test("every level is a finite number", () => {
  const levels = bucketLevels(audioFrom(varyingSignal(16)), 56, 0, 16_000);
  for (const [index, value] of levels.entries()) {
    assert.ok(Number.isFinite(value), `bucket ${index} is ${value}`);
  }
});

test("levels stay within the drawable range", () => {
  const levels = bucketLevels(audioFrom(varyingSignal(16)), 56, 0, 16_000);
  for (const value of levels) {
    assert.ok(value >= 0 && value <= 1, `${value} out of range`);
  }
});

test("the quietest bucket sits on the floor, not below it", () => {
  const levels = bucketLevels(audioFrom(varyingSignal(16)), 56, 0, 16_000);
  assert.ok(Math.min(...levels) >= 0.15, `floor breached: ${Math.min(...levels)}`);
});

test("a varying signal produces a varying wave", () => {
  const levels = [...bucketLevels(audioFrom(varyingSignal(16)), 56, 0, 16_000)];
  assert.ok(Math.max(...levels) - Math.min(...levels) > 0.3, "wave is nearly flat");
});

test("digital silence is flat and finite rather than NaN", () => {
  const levels = bucketLevels(audioFrom(new Float32Array(SAMPLE_RATE * 4)), 56, 0, 16_000);
  for (const value of levels) assert.ok(Number.isFinite(value));
  assert.equal(new Set(levels).size, 1, "silence should be uniform");
});

test("a clip shorter than the span still fills every bucket", () => {
  // Previews run anywhere from 15 to 30 seconds; the tail must not be NaN.
  const levels = bucketLevels(audioFrom(varyingSignal(4)), 56, 0, 16_000);
  assert.equal(levels.length, 56);
  for (const value of levels) assert.ok(Number.isFinite(value));
});

test("an offset past the end of the audio is harmless", () => {
  const levels = bucketLevels(audioFrom(varyingSignal(2)), 56, 30_000, 16_000);
  for (const value of levels) assert.ok(Number.isFinite(value));
});

test("a single bucket works", () => {
  const levels = bucketLevels(audioFrom(varyingSignal(2)), 1, 0, 16_000);
  assert.equal(levels.length, 1);
  assert.ok(Number.isFinite(levels[0]));
});
