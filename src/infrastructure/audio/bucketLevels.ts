/** The slice of AudioBuffer this needs, so it can be tested without one. */
export interface DecodedAudio {
  readonly sampleRate: number;
  getChannelData(channel: number): Float32Array;
}

/** Every bar sits at least this high, so a quiet passage still reads as a bar. */
const FLOOR = 0.16;

/** Softens the top of the range without flattening it. */
const CURVE = 0.85;

/**
 * Reduces decoded audio to one level per bucket, 0..1.
 *
 * Two decisions, both forced by how modern masters are made:
 *
 * **RMS, not peak.** Measured against a real track, peak-per-bucket came out
 * with a mean of 0.92 and a minimum of 0.64 - brick-wall limiting means the
 * loudest sample in any 285ms window is essentially always full scale, so a
 * peak-based wave draws a flat bar every time. RMS tracks perceived loudness
 * and actually moves between a verse and a chorus.
 *
 * **Normalised across the observed range, not against silence.** Even RMS only
 * spanned 0.50 to 1.00 on that track. Dividing by the maximum would leave every
 * bar in the top half of the display; stretching the range the track actually
 * occupies is what turns it into a readable shape.
 */
export function bucketLevels(
  audio: DecodedAudio,
  buckets: number,
  startOffsetMs: number,
  spanMs: number,
): Float32Array {
  const channel = audio.getChannelData(0);
  const from = Math.floor((startOffsetMs / 1000) * audio.sampleRate);
  const to = Math.min(channel.length, from + Math.floor((spanMs / 1000) * audio.sampleRate));

  const levels = new Float32Array(buckets);
  const perBucket = Math.max(1, (to - from) / buckets);

  let quietest = Infinity;
  let loudest = 0;

  for (let bucket = 0; bucket < buckets; bucket++) {
    const start = from + Math.floor(bucket * perBucket);
    const end = Math.min(to, from + Math.floor((bucket + 1) * perBucket));

    // Stride through long slices: 512 samples is ample for a representative
    // level, and keeps a 16-second decode well under a frame.
    const stride = Math.max(1, Math.floor((end - start) / 512));
    let sum = 0;
    let count = 0;
    for (let i = start; i < end; i += stride) {
      const value = channel[i] ?? 0;
      sum += value * value;
      count++;
    }

    levels[bucket] = count > 0 ? Math.sqrt(sum / count) : 0;

    /*
     * Read the value *back out* of the array before comparing.
     *
     * `levels` is a Float32Array, so storing a double rounds it - and the
     * rounding can go down. Tracking the minimum from the pre-store double then
     * subtracting it from the post-store float yields a slightly negative
     * number for the quietest bucket, and `Math.pow(negative, 0.85)` is NaN.
     * A NaN height silently draws nothing, which showed up as bars randomly
     * missing from the middle of the wave.
     */
    const stored = levels[bucket] ?? 0;
    if (stored < quietest) quietest = stored;
    if (stored > loudest) loudest = stored;
  }

  const range = loudest - quietest;
  for (let bucket = 0; bucket < buckets; bucket++) {
    // A silent or perfectly uniform clip has no range to stretch; give it a
    // flat mid-height rather than dividing by zero.
    const raw = range > 1e-6 ? ((levels[bucket] ?? 0) - quietest) / range : 0.5;
    // Belt and braces after the fix above: never hand a negative to Math.pow.
    const scaled = Math.min(1, Math.max(0, raw));
    levels[bucket] = FLOOR + (1 - FLOOR) * Math.pow(scaled, CURVE);
  }
  return levels;
}
