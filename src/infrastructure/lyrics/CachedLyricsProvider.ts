import { lyricsQueryKey, type LyricsProvider, type LyricsQuery } from "@/application/ports/LyricsProvider";
import type { Lyrics } from "@/domain/entities/Lyrics";

/**
 * One lookup per song, ever.
 *
 * The words to a song do not change, so a hit is permanent - and a *miss* is
 * cached too, so a track LRCLIB has never heard of is not re-queried every time
 * it comes up in the shuffle.
 */
export class CachedLyricsProvider implements LyricsProvider {
  private readonly entries = new Map<string, Lyrics | null>();
  /** In-flight lookups, so a burst of identical requests makes one call. */
  private readonly pending = new Map<string, Promise<Lyrics | null>>();

  constructor(private readonly inner: LyricsProvider) {}

  async fetch(query: LyricsQuery): Promise<Lyrics | null> {
    const key = lyricsQueryKey(query);

    if (this.entries.has(key)) return this.entries.get(key) ?? null;

    const inFlight = this.pending.get(key);
    if (inFlight) return inFlight;

    const lookup = this.inner
      .fetch(query)
      .then((lyrics) => {
        this.entries.set(key, lyrics);
        return lyrics;
      })
      .finally(() => {
        this.pending.delete(key);
      });

    this.pending.set(key, lookup);
    return lookup;
  }
}
