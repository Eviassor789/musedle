import { seededRandom } from "@/domain/rules/seededRandom";

/**
 * The stand-in wave drawn when a track's audio cannot be decoded.
 *
 * Used for YouTube tracks, whose audio lives in a cross-origin iframe and can
 * never be read from this document, and for the moment before a Spotify decode
 * lands. Seeded from the track id so no two songs share a shape - a single
 * hard-coded silhouette repeated under every title reads as a broken feature
 * rather than a placeholder.
 *
 * Deliberately smooth and low-contrast next to real measured audio: it should
 * look like a placeholder, not impersonate a signal nothing measured.
 */
export function placeholderWaveform(seed: string, buckets: number): Float32Array {
  const random = seededRandom(seed);

  // Three detuned components give something song-shaped rather than periodic.
  const frequencies = [3 + random() * 6, 8 + random() * 12, 15 + random() * 22];
  const phases = [random() * Math.PI * 2, random() * Math.PI * 2, random() * Math.PI * 2];

  const out = new Float32Array(buckets);
  for (let i = 0; i < buckets; i++) {
    const t = buckets > 1 ? i / (buckets - 1) : 0;
    const shape =
      Math.sin(t * (frequencies[0] ?? 5) + (phases[0] ?? 0)) * 0.42 +
      Math.sin(t * (frequencies[1] ?? 11) + (phases[1] ?? 0)) * 0.3 +
      Math.sin(t * (frequencies[2] ?? 23) + (phases[2] ?? 0)) * 0.18;
    // Tapered at both ends so the run reads as one wave, not a field of ticks.
    const taper = Math.sin(Math.PI * t) ** 0.35;
    out[i] = Math.min(1, Math.max(0.12, (0.58 + shape * 0.34) * taper));
  }
  return out;
}
