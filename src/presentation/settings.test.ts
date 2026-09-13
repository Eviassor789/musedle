import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SETTINGS, parseSettings } from "./settings";

test("an empty or unreadable record falls back to the defaults", () => {
  assert.deepEqual(parseSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings("nonsense"), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings({}), DEFAULT_SETTINGS);
});

test("a full record round-trips", () => {
  const stored = { halfSecondStage: false, randomStart: true, mode: "lyrics" };
  assert.deepEqual(parseSettings(stored), stored);
});

/**
 * The reason this is parsed field by field. A record written before a setting
 * existed - or after one was added - must keep every preference it can still
 * make sense of rather than resetting the lot.
 */
test("a partial record keeps what it has and defaults the rest", () => {
  assert.deepEqual(parseSettings({ mode: "lyrics" }), {
    ...DEFAULT_SETTINGS,
    mode: "lyrics",
  });
  assert.deepEqual(parseSettings({ randomStart: true, unknownFuture: 42 }), {
    ...DEFAULT_SETTINGS,
    randomStart: true,
  });
});

test("a field of the wrong type falls back without taking the others with it", () => {
  assert.deepEqual(parseSettings({ halfSecondStage: "yes", mode: "lyrics" }), {
    ...DEFAULT_SETTINGS,
    mode: "lyrics",
  });
  assert.deepEqual(parseSettings({ mode: "humming", randomStart: true }), {
    ...DEFAULT_SETTINGS,
    randomStart: true,
  });
});
