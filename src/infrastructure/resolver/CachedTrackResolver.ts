import type { ResolutionCache } from "@/application/ports/ResolutionCache";
import { trackQueryKey, type TrackQuery, type TrackResolver } from "@/application/ports/TrackResolver";
import type { AudioSource } from "@/domain/entities/Track";

/**
 * Decorator that makes every lookup happen at most once, ever.
 *
 * "Artist + title -> this video" is a fact that does not change, so caching it
 * is not an optimisation, it is what makes the whole approach viable: without
 * this, a single 100-track playlist import would exhaust the entire YouTube
 * Data API daily quota, and a second user importing the same playlist would
 * pay for it all over again.
 *
 * A cached `null` is meaningful and deliberate - it records "we looked and
 * there is nothing", so a track with no match does not get re-queried forever.
 */
export class CachedTrackResolver implements TrackResolver {
  /** In-flight lookups, so a burst of identical requests makes one call. */
  private readonly pending = new Map<string, Promise<AudioSource | null>>();

  constructor(
    private readonly inner: TrackResolver,
    private readonly cache: ResolutionCache,
  ) {}

  async resolve(query: TrackQuery): Promise<AudioSource | null> {
    const key = trackQueryKey(query);

    const cached = await this.cache.get(key);
    if (cached !== undefined) return cached;

    const inFlight = this.pending.get(key);
    if (inFlight) return inFlight;

    const lookup = this.inner
      .resolve(query)
      .then(async (result) => {
        await this.cache.set(key, result);
        return result;
      })
      .finally(() => {
        this.pending.delete(key);
      });

    this.pending.set(key, lookup);
    return lookup;
  }
}
