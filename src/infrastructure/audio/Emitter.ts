import type { Unsubscribe } from "@/application/ports/AudioEngine";

/** Minimal typed listener set. Shared by the audio engines. */
export class Emitter<T> {
  private readonly listeners = new Set<(value: T) => void>();

  on(listener: (value: T) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(value: T): void {
    // Copy first: a listener may unsubscribe itself while we iterate.
    for (const listener of [...this.listeners]) listener(value);
  }

  clear(): void {
    this.listeners.clear();
  }
}
