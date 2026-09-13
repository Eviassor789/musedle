import assert from "node:assert/strict";
import { test } from "node:test";
import {
  attemptsRemaining,
  createGame,
  isOver,
  reduceGame,
  shareSquares,
  unlockedMs,
  type GameState,
} from "./GameEngine";
import { SnippetLadder } from "./rules/SnippetLadder";

const ANSWER = "track-answer";
const WRONG = "track-wrong";

const guess = (id: string) => ({ type: "GUESS" as const, trackId: id, label: id, artistMatch: false });
const SKIP = { type: "SKIP" as const };

const play = (state: GameState, ...actions: Parameters<typeof reduceGame>[1][]) =>
  actions.reduce(reduceGame, state);

test("starts in progress with only the first rung unlocked", () => {
  const game = createGame(ANSWER);
  assert.equal(game.status, "in_progress");
  assert.equal(unlockedMs(game), 500);
  assert.equal(attemptsRemaining(game), 6);
});

test("each miss doubles the unlocked audio", () => {
  let game = createGame(ANSWER);
  const heard: number[] = [unlockedMs(game)];
  for (let i = 0; i < 5; i++) {
    game = reduceGame(game, SKIP);
    heard.push(unlockedMs(game));
  }
  assert.deepEqual(heard, [500, 1000, 2000, 4000, 8000, 16000]);
});

test("a correct guess wins and reveals the full snippet", () => {
  const game = play(createGame(ANSWER), SKIP, guess(ANSWER));
  assert.equal(game.status, "won");
  assert.ok(isOver(game));
  assert.equal(unlockedMs(game), 16000);
});

test("running out of attempts loses", () => {
  const game = play(createGame(ANSWER), SKIP, SKIP, SKIP, SKIP, SKIP, SKIP);
  assert.equal(game.status, "lost");
  assert.equal(attemptsRemaining(game), 0);
});

test("a wrong guess on the final rung loses", () => {
  const game = play(createGame(ANSWER), SKIP, SKIP, SKIP, SKIP, SKIP, guess(WRONG));
  assert.equal(game.status, "lost");
});

test("actions after the game ends are ignored", () => {
  const won = play(createGame(ANSWER), guess(ANSWER));
  assert.equal(reduceGame(won, guess(WRONG)), won);
  assert.equal(reduceGame(won, SKIP), won);
});

test("state is never mutated in place", () => {
  const game = createGame(ANSWER);
  const next = reduceGame(game, SKIP);
  assert.equal(game.attempts.length, 0);
  assert.equal(next.attempts.length, 1);
  assert.notEqual(game, next);
});

test("share squares mark skips, misses and the win", () => {
  const game = play(createGame(ANSWER), SKIP, guess(WRONG), guess(ANSWER));
  assert.equal(shareSquares(game), "\u2B1C\uD83D\uDFE5\uD83D\uDFE9\u2B1B\u2B1B\u2B1B");
});

test("a custom ladder drives the whole game", () => {
  const ladder = SnippetLadder.of([500, 3000]);
  let game = createGame(ANSWER, ladder);
  assert.equal(unlockedMs(game), 500);
  game = reduceGame(game, SKIP);
  assert.equal(unlockedMs(game), 3000);
  game = reduceGame(game, SKIP);
  assert.equal(game.status, "lost");
});

test("ladders must ascend", () => {
  assert.throws(() => SnippetLadder.of([2000, 1000]));
  assert.throws(() => SnippetLadder.of([]));
  assert.throws(() => SnippetLadder.of([0]));
});

/**
 * Regression guard. `SnippetLadder.default()` is used as a React default
 * argument, so returning a fresh instance per call invalidates every effect
 * keyed on the ladder - which silently stopped the waveform from painting.
 */
test("the default ladder is one shared instance", () => {
  assert.equal(SnippetLadder.default(), SnippetLadder.default());
});

test("a near miss records the shared artist without winning", () => {
  const game = reduceGame(createGame(ANSWER), {
    type: "GUESS",
    trackId: WRONG,
    label: "same band, other song",
    artistMatch: true,
  });
  const [attempt] = game.attempts;
  assert.equal(attempt?.kind === "guess" && attempt.correct, false);
  assert.equal(attempt?.kind === "guess" && attempt.artistMatch, true);
  assert.equal(game.status, "in_progress");
});

test("share squares mark a near miss in yellow", () => {
  const game = reduceGame(createGame(ANSWER), {
    type: "GUESS",
    trackId: WRONG,
    label: "close",
    artistMatch: true,
  });
  assert.ok(shareSquares(game).startsWith("\uD83D\uDFE8"));
});
