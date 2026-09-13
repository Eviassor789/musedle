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
  assert.equal(pickStartOffsetMs(track("a", 210_000, "mp3"), SPAN_MS), 0);
});

test("an unknown duration never moves", () => {
  assert.equal(pickStartOffsetMs(track("a", null), SPAN_MS), 0);
});

test("a song too short to hold the ladder never moves", () => {
  // 20s: the intro guard and a 16s ladder already overrun it.
  assert.equal(pickStartOffsetMs(track("a", 20_000), SPAN_MS), 0);
});

test("the whole ladder fits between the intro and the outro", () => {
  for (const durationMs of [45_000, 90_000, 210_000, 420_000]) {
    const offset = pickStartOffsetMs(track(`song-${durationMs}`, durationMs), SPAN_MS);
    assert.ok(offset >= durationMs * 0.15, `${durationMs}ms started inside the intro`);
    assert.ok(
      offset + SPAN_MS <= durationMs * 0.85,
      `${durationMs}ms ran the ladder into the outro`,
    );
  }
});

test("the same song always opens in the same place", () => {
  const song = track("stable", 210_000);
  assert.equal(pickStartOffsetMs(song, SPAN_MS), pickStartOffsetMs(song, SPAN_MS));
});

test("different songs open in different places", () => {
  const offsets = new Set(
    ["a", "b", "c", "d", "e", "f"].map((id) => pickStartOffsetMs(track(id, 210_000), SPAN_MS)),
  );
  // Collisions are possible but six identical draws would mean the seed is
  // not reaching the generator at all.
  assert.ok(offsets.size > 1);
});
