import assert from "node:assert/strict";
import { test } from "node:test";
import { createSession, sessionReducer, type SessionAction, type SessionState } from "./Session";
import { SnippetLadder } from "./rules/SnippetLadder";

const LADDER = SnippetLadder.default();
const A = "answer-a";
const B = "answer-b";

const guess = (id: string): SessionAction => ({ type: "GUESS", trackId: id, label: id, artistMatch: false });
const SKIP: SessionAction = { type: "SKIP" };

const play = (state: SessionState, ...actions: SessionAction[]) =>
  actions.reduce(sessionReducer, state);

/** Skips every rung, however many the ladder has, and so loses the round. */
const loseRound = (state: SessionState) =>
  play(state, ...Array.from({ length: LADDER.maxAttempts }, () => SKIP));

test("a win is counted exactly once", () => {
  const session = play(createSession(A, LADDER), guess(A));
  assert.deepEqual(session.stats, { played: 1, won: 1, streak: 1, bestStreak: 1 });
});

/**
 * The regression that motivated this module: React StrictMode invokes reducers
 * twice with the same input, so replaying an action must not double-count.
 */
test("replaying the same transition does not double-count", () => {
  const start = createSession(A, LADDER);
  const once = sessionReducer(start, guess(A));
  const twice = sessionReducer(start, guess(A));
  assert.deepEqual(once.stats, twice.stats);
  assert.equal(twice.stats.played, 1);

  // Acting again on the finished round changes nothing at all.
  const after = sessionReducer(once, guess(A));
  assert.equal(after, once);
});

test("a loss breaks the streak but still counts as played", () => {
  let session = play(createSession(A, LADDER), guess(A));
  session = sessionReducer(session, { type: "NEXT_ROUND", roundSeed: "r", answerId: B });
  session = loseRound(session);

  assert.deepEqual(session.stats, { played: 2, won: 1, streak: 0, bestStreak: 1 });
});

test("best streak survives a later loss", () => {
  let session = createSession(A, LADDER);
  for (const id of [A, B, "c"]) {
    session = sessionReducer(session, guess(session.game.answerTrackId));
    session = sessionReducer(session, { type: "NEXT_ROUND", roundSeed: "r", answerId: id });
  }
  assert.equal(session.stats.bestStreak, 3);

  session = loseRound(session);
  assert.equal(session.stats.streak, 0);
  assert.equal(session.stats.bestStreak, 3);
});

test("moving on remembers which answers have been used", () => {
  let session = createSession(A, LADDER);
  session = sessionReducer(session, { type: "NEXT_ROUND", roundSeed: "r", answerId: B });
  assert.deepEqual(session.usedIds, [A]);

  session = sessionReducer(session, { type: "NEXT_ROUND", roundSeed: "r", answerId: "c" });
  assert.deepEqual(session.usedIds, [A, B]);
});

test("an exhausted playlist starts a fresh cycle", () => {
  let session = createSession(A, LADDER);
  session = sessionReducer(session, { type: "NEXT_ROUND", roundSeed: "r", answerId: B });
  session = sessionReducer(session, { type: "NEXT_ROUND", roundSeed: "r", answerId: A, resetUsed: true });
  assert.deepEqual(session.usedIds, []);
});

test("a new round resets the board but keeps the stats", () => {
  let session = play(createSession(A, LADDER), SKIP, guess(A));
  const statsBefore = session.stats;

  session = sessionReducer(session, { type: "NEXT_ROUND", roundSeed: "r", answerId: B });
  assert.equal(session.game.status, "in_progress");
  assert.equal(session.game.attempts.length, 0);
  assert.equal(session.game.answerTrackId, B);
  assert.deepEqual(session.stats, statsBefore);
});

/**
 * The round seed is what stops a song asking the identical question forever.
 * It has to survive the reducer, and a new round has to get the new one.
 */
test("each round carries its own seed", () => {
  let session = createSession(A, LADDER, "first");
  assert.equal(session.game.roundSeed, "first");

  session = sessionReducer(session, { type: "NEXT_ROUND", roundSeed: "second", answerId: B });
  assert.equal(session.game.roundSeed, "second");

  // Guessing and skipping leave it alone; the clue must not move mid-round.
  session = sessionReducer(session, SKIP);
  assert.equal(session.game.roundSeed, "second");
});
