/** Beadle/Heardle progression: each miss doubles what you get to hear. */
export const DEFAULT_LADDER_MS: readonly number[] = [1000, 2000, 4000, 8000, 16000];

export class InvalidLadderError extends Error {}

/**
 * The escalating snippet lengths for one puzzle.
 * Immutable and validated at construction so the engine can trust it.
 */
export class SnippetLadder {
  private constructor(readonly stepsMs: readonly number[]) {}

  static of(stepsMs: readonly number[]): SnippetLadder {
    if (stepsMs.length === 0) {
      throw new InvalidLadderError("A ladder needs at least one step.");
    }
    for (const [i, ms] of stepsMs.entries()) {
      if (!Number.isFinite(ms) || ms <= 0) {
        throw new InvalidLadderError(`Step ${i} must be a positive number of ms.`);
      }
      const prev = stepsMs[i - 1];
      if (prev !== undefined && ms <= prev) {
        throw new InvalidLadderError(`Step ${i} (${ms}ms) must exceed step ${i - 1} (${prev}ms).`);
      }
    }
    return new SnippetLadder([...stepsMs]);
  }

  /**
   * The shared default ladder.
   *
   * Deliberately one instance rather than a fresh object per call. This is
   * routinely used as a React default argument - `useMusedleGame(playlist,
   * ladder = SnippetLadder.default())` - and a new instance on every render
   * silently invalidates any effect that depends on the ladder's identity.
   * The class is immutable, so sharing is free and safe.
   */
  private static sharedDefault: SnippetLadder | null = null;

  static default(): SnippetLadder {
    return (SnippetLadder.sharedDefault ??= SnippetLadder.of(DEFAULT_LADDER_MS));
  }

  /** One attempt per rung. */
  get maxAttempts(): number {
    return this.stepsMs.length;
  }

  /** Longest snippet the player will ever hear - what we must buffer. */
  get maxDurationMs(): number {
    return this.stepsMs[this.stepsMs.length - 1] ?? 0;
  }

  /** How much audio is unlocked at a given attempt, clamped at both ends. */
  durationAtMs(attemptIndex: number): number {
    const clamped = Math.min(Math.max(attemptIndex, 0), this.stepsMs.length - 1);
    return this.stepsMs[clamped] ?? 0;
  }

  isFinalAttempt(attemptIndex: number): boolean {
    return attemptIndex >= this.stepsMs.length - 1;
  }
}
