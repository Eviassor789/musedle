import assert from "node:assert/strict";
import { test } from "node:test";
import { SnippetCutter } from "./SnippetCutter";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Drives a fake playhead so tests do not depend on real audio or on frames. */
function harness(opts: { durationMs: number; stallAfterMs: number; elapsed: () => number | null }) {
  const events: string[] = [];
  let progress = 0;
  const cutter = new SnippetCutter({
    durationMs: opts.durationMs,
    stallAfterMs: opts.stallAfterMs,
    readElapsedMs: opts.elapsed,
    onProgress: (ms) => { progress = ms; },
    onDone: () => events.push("done"),
    onStall: () => events.push("stall"),
  });
  return { cutter, events, progressAt: () => progress };
}

test("cuts the snippet once playback passes the duration", async () => {
  const startedAt = Date.now();
  const h = harness({ durationMs: 200, stallAfterMs: 2000, elapsed: () => Date.now() - startedAt });
  h.cutter.start();
  await wait(600);
  assert.deepEqual(h.events, ["done"]);
});

/**
 * The regression this class exists for: no requestAnimationFrame in Node, so if
 * the cut depended on frames it would never fire here at all.
 */
test("cuts without any animation frames available", async () => {
  assert.equal(typeof (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame, "undefined");
  const startedAt = Date.now();
  const h = harness({ durationMs: 150, stallAfterMs: 2000, elapsed: () => Date.now() - startedAt });
  h.cutter.start();
  await wait(500);
  assert.deepEqual(h.events, ["done"]);
});

test("stalls out when playback never starts", async () => {
  const h = harness({ durationMs: 1000, stallAfterMs: 200, elapsed: () => null });
  h.cutter.start();
  await wait(600);
  assert.deepEqual(h.events, ["stall"]);
});

test("a stalled start does not shorten the snippet once it begins", async () => {
  let started: number | null = null;
  setTimeout(() => { started = Date.now(); }, 200);
  const h = harness({
    durationMs: 200,
    stallAfterMs: 2000,
    elapsed: () => (started === null ? null : Date.now() - started),
  });
  const t0 = Date.now();
  h.cutter.start();
  await wait(900);
  assert.deepEqual(h.events, ["done"]);
  // Finished only after the delayed start plus the full snippet length.
  assert.ok(Date.now() - t0 >= 380, "snippet was cut short by the late start");
});

test("stopping prevents any further callbacks", async () => {
  const startedAt = Date.now();
  const h = harness({ durationMs: 200, stallAfterMs: 2000, elapsed: () => Date.now() - startedAt });
  h.cutter.start();
  h.cutter.stop();
  await wait(500);
  assert.deepEqual(h.events, []);
});

test("start is idempotent", async () => {
  const startedAt = Date.now();
  const h = harness({ durationMs: 150, stallAfterMs: 2000, elapsed: () => Date.now() - startedAt });
  h.cutter.start();
  h.cutter.start();
  h.cutter.start();
  await wait(500);
  assert.deepEqual(h.events, ["done"]);
});

/**
 * Spotify preview clips vary in length (16s and 28s both observed), so the
 * final 16s rung can ask for more audio than the clip holds. The position then
 * stops advancing short of the target, and without an exhaustion signal the
 * cutter would wait for a moment that never arrives.
 */
test("finishes when the media runs out before the snippet does", async () => {
  const startedAt = Date.now();
  let exhausted = false;
  setTimeout(() => { exhausted = true; }, 200);

  const events: string[] = [];
  const cutter = new SnippetCutter({
    durationMs: 16_000,
    stallAfterMs: 30_000,
    readElapsedMs: () => Math.min(Date.now() - startedAt, 200),
    isExhausted: () => exhausted,
    onProgress: () => undefined,
    onDone: () => events.push("done"),
    onStall: () => events.push("stall"),
  });

  cutter.start();
  await wait(700);
  assert.deepEqual(events, ["done"]);
});

/**
 * requestAnimationFrame does not exist in Node, and is suspended outright in a
 * hidden tab. The playhead decides where the next press resumes, so it has to
 * keep advancing from the timer alone.
 */
test("reports progress without any animation frames", async () => {
  const startedAt = Date.now();
  const seen: number[] = [];
  const cutter = new SnippetCutter({
    durationMs: 600,
    stallAfterMs: 3000,
    readElapsedMs: () => Date.now() - startedAt,
    onProgress: (ms) => seen.push(ms),
    onDone: () => undefined,
    onStall: () => undefined,
  });

  cutter.start();
  await wait(400);
  cutter.stop();

  assert.ok(seen.length >= 2, `expected several progress reports, got ${seen.length}`);
  assert.ok(seen[seen.length - 1]! > seen[0]!, "progress did not advance");
});
