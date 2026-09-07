import assert from "node:assert/strict";
import { test } from "node:test";
import { MIN_USABLE_LINES, pickLyricLines, usableLyricLines } from "./lyricLines";
import { lyricRevealAt, nextLyricHint, LYRIC_ATTEMPTS, MAX_LYRIC_LINES } from "./LyricLadder";

const SONG = `♪
The less I know the better
Oh my love, can't you see yourself by my side?
[Chorus]
No surprise when you're on his shoulder like every night
Oh
Artist: Tame Impala
Album: Currents
She said "It's not now or never"
Waiting for something else to complete us`;

test("keeps only lines worth guessing from", () => {
  const lines = usableLyricLines(SONG, "The Less I Know The Better");

  assert.ok(!lines.includes("♪"), "kept a decoration marker");
  assert.ok(!lines.includes("[Chorus]"), "kept a section header");
  assert.ok(!lines.includes("Oh"), "kept a too-short interjection");
  assert.ok(!lines.some((l) => /^Artist:/.test(l)), "kept pasted credits");
  assert.ok(!lines.some((l) => /^Album:/.test(l)), "kept pasted credits");
  assert.ok(lines.some((l) => l.startsWith("Oh my love")), "dropped a real line");
});

/** A clue that states the answer is not a clue. */
test("drops lines containing the song title", () => {
  const lines = usableLyricLines(SONG, "The Less I Know The Better");
  assert.ok(
    !lines.some((line) => line.toLowerCase().includes("the less i know the better")),
    "a line gave the title away",
  );
});

test("title matching ignores punctuation and casing", () => {
  const raw = "Dont Stop Believin, hold on to that feeling\nSomething else entirely here";
  const lines = usableLyricLines(raw, "Don't Stop Believin'");
  assert.equal(lines.length, 1);
  assert.equal(lines[0], "Something else entirely here");
});

test("a repeated chorus line is only offered once", () => {
  const raw = [
    "We could have had it all, you and me",
    "We could have had it all, you and me",
    "Another completely different line here",
  ].join("\n");
  assert.equal(usableLyricLines(raw, "Set Fire").length, 2);
});

/**
 * A one-word title appearing mid-line removes a lot of lines. That is the
 * intended trade; MIN_USABLE_LINES is what stops a gutted song being played.
 */
test("a title word inside a line still counts as a spoiler", () => {
  const raw = [
    "We could have had it all, rolling in it",
    "Another completely different line here",
  ].join("\n");
  assert.deepEqual(usableLyricLines(raw, "Rolling"), ["Another completely different line here"]);
});

test("handles Windows line endings", () => {
  const lines = usableLyricLines("First proper line of the song\r\nSecond proper line here", "X");
  assert.equal(lines.length, 2);
});

test("picked lines are stable for the same seed and differ across seeds", () => {
  const lines = Array.from({ length: 40 }, (_, i) => `This is lyric line number ${i}`);

  assert.deepEqual(pickLyricLines(lines, 3, "track-a"), pickLyricLines(lines, 3, "track-a"));
  assert.notDeepEqual(pickLyricLines(lines, 3, "track-a"), pickLyricLines(lines, 3, "track-b"));
});

/** Each hint carries on from the last, so the clues read as a passage. */
test("the clues are consecutive lines", () => {
  const lines = Array.from({ length: 60 }, (_, i) => `This is lyric line number ${i}`);

  for (let seed = 0; seed < 20; seed++) {
    const picked = pickLyricLines(lines, 3, `seed-${seed}`);
    const positions = picked.map((line) => lines.indexOf(line));
    assert.deepEqual(
      positions,
      [positions[0], positions[0]! + 1, positions[0]! + 2],
      `seed-${seed} did not read on`,
    );
  }
});

/** The opening couplet is the easiest and least interesting part of a song. */
test("the passage does not always start at the beginning", () => {
  const lines = Array.from({ length: 60 }, (_, i) => `This is lyric line number ${i}`);

  const starts = new Set(
    Array.from({ length: 20 }, (_, seed) => lines.indexOf(pickLyricLines(lines, 3, `s${seed}`)[0]!)),
  );

  assert.ok(starts.size > 1, "every round started in the same place");
  assert.ok([...starts].some((start) => start > 5), "never started past the opening lines");
});

test("the run always fits inside the song", () => {
  const lines = Array.from({ length: 8 }, (_, i) => `This is lyric line number ${i}`);

  for (let seed = 0; seed < 30; seed++) {
    const picked = pickLyricLines(lines, 3, `s${seed}`);
    assert.equal(picked.length, 3);
    assert.equal(new Set(picked).size, 3);
  }
});

test("asking for more lines than exist returns what there is", () => {
  const lines = ["Only one usable line in this song"];
  assert.deepEqual(pickLyricLines(lines, 3, "seed"), lines);
  assert.deepEqual(pickLyricLines([], 3, "seed"), []);
  assert.deepEqual(pickLyricLines(lines, 0, "seed"), []);
});

test("the reveal schedule adds one hint at a time", () => {
  const steps = Array.from({ length: LYRIC_ATTEMPTS }, (_, i) => lyricRevealAt(i));

  assert.deepEqual(steps[0], { lines: 1, artist: false, album: false });
  for (let i = 1; i < steps.length; i++) {
    const before = steps[i - 1]!;
    const after = steps[i]!;
    const added =
      (after.lines > before.lines ? 1 : 0) +
      (after.artist && !before.artist ? 1 : 0) +
      (after.album && !before.album ? 1 : 0);
    assert.equal(added, 1, `step ${i} revealed ${added} things at once`);
  }
});

test("the schedule never needs more lines than it plans for", () => {
  for (let i = 0; i < LYRIC_ATTEMPTS; i++) {
    assert.ok(lyricRevealAt(i).lines <= MAX_LYRIC_LINES);
  }
  assert.ok(MIN_USABLE_LINES >= MAX_LYRIC_LINES);
});

test("the skip label names the next hint, and nothing on the last try", () => {
  assert.equal(nextLyricHint(0), "the artist");
  assert.equal(nextLyricHint(1), "another line");
  assert.equal(nextLyricHint(2), "the album");
  assert.equal(nextLyricHint(3), "another line");
  assert.equal(nextLyricHint(LYRIC_ATTEMPTS - 1), null);
});
