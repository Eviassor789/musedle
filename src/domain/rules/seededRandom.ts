/**
 * A deterministic random sequence from a string seed.
 *
 * Used wherever the same input must produce the same "random" result every
 * render: the placeholder waveform for a track, and which lyric lines a round
 * shows. Re-rolling those on every repaint would be a bug, not a feature.
 *
 * FNV-1a to fold the seed into 32 bits, then xorshift to walk it.
 */
export function seededRandom(seed: string): () => number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return () => {
    hash = Math.imul(hash ^ (hash >>> 15), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    return ((hash ^= hash >>> 16) >>> 0) / 4294967296;
  };
}
