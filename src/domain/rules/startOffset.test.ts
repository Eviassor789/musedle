import assert from "node:assert/strict";
import { test } from "node:test";
import type { AudioSourceKind, Track } from "@/domain/entities/Track";
import { pickStartOffsetMs } from "./startOffset";

const SPAN_MS = 16_000;

function track(
  id: string,
  durationMs: number | null,
  kind: AudioSourceKind = "youtube",
): Track {
  return {
    id,
    title: id,
    artists: ["Someone"],
    durationMs,
    artworkUrl: null,
    source: { kind, ref: id, startOffsetMs: 0 },
  };
}

test("a Spotify preview never moves", () => {
  // It is already an excerpt, and only thirty seconds of one.
  assert.equal(pickStartOffsetMs(track("a", 210_000, "mp3"), SPAN_MS, "r"), 0);
});

test("an unknown duration never moves", () => {
  assert.equal(pickStartOffsetMs(track("a", null), SPAN_MS, "r"), 0);
});

test("a song too short to hold the ladder never moves", () => {
  // 20s: the intro guard and a 16s ladder already overrun it.
  assert.equal(pickStartOffsetMs(track("a", 20_000), SPAN_MS, "r"), 0);
});

test("the whole ladder fits between the intro and the outro", () => {
  for (const durationMs of [45_000, 90_000, 210_000, 420_000]) {
    const offset = pickStartOffsetMs(track(`song-${durationMs}`, durationMs), SPAN_MS, "r");
    assert.ok(offset >= durationMs * 0.15, `${durationMs}ms started inside the intro`);
    assert.ok(
      offset + SPAN_MS <= durationMs * 0.85,
      `${durationMs}ms ran the ladder into the outro`,
    );
  }
});

/**
 * Stable for exactly as long as a round lasts, and no longer.
 *
 * The first half is why this is seeded at all: it is read during render, and a
 * Math.random would move the clip under the player on every repaint. The second
 * half is why the seed is the *round* rather than the track - seeded on the
 * track alone, a song opened at the same instant in every session forever.
 */
test("the clip holds still within a round", () => {
  const song = track("stable", 210_000);
  assert.equal(pickStartOffsetMs(song, SPAN_MS, "round-1"), pickStartOffsetMs(song, SPAN_MS, "round-1"));
});

test("the same song opens somewhere else in a later round", () => {
  const song = track("stable", 210_000);
  const offsets = new Set(
    ["r1", "r2", "r3", "r4", "r5", "r6"].map((seed) => pickStartOffsetMs(song, SPAN_MS, seed)),
  );
  assert.ok(offsets.size > 1, "six rounds of one song all opened at the same instant");
});

test("different songs open in different places", () => {
  const offsets = new Set(
    ["a", "b", "c", "d", "e", "f"].map((id) => pickStartOffsetMs(track(id, 210_000), SPAN_MS, "r")),
  );
  // Collisions are possible but six identical draws would mean the seed is
  // not reaching the generator at all.
  assert.ok(offsets.size > 1);
});
