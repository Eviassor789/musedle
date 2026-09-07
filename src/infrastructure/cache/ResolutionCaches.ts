import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ResolutionCache } from "@/application/ports/ResolutionCache";
import type { AudioSource } from "@/domain/entities/Track";

/** Process-local cache. Always present; the outermost layer. */
export class MemoryResolutionCache implements ResolutionCache {
  private readonly entries = new Map<string, AudioSource | null>();

  async get(key: string): Promise<AudioSource | null | undefined> {
    return this.entries.has(key) ? (this.entries.get(key) ?? null) : undefined;
  }

  async set(key: string, source: AudioSource | null): Promise<void> {
    this.entries.set(key, source);
  }

  get size(): number {
    return this.entries.size;
  }
}

/**
 * Disk-backed cache for local development, so restarting the dev server does
 * not re-resolve everything. Writes are debounced because imports arrive in
 * bursts of dozens.
 *
 * Serverless filesystems are read-only, so this degrades to memory-only rather
 * than throwing - see createResolutionCache().
 */
export class FileResolutionCache implements ResolutionCache {
  private entries: Map<string, AudioSource | null> | null = null;
  private loading: Promise<void> | null = null;
  private flushTimer: NodeJS.Timeout | null = null;
  private writable = true;

  constructor(
    private readonly filePath: string,
    private readonly flushDelayMs = 400,
  ) {}

  private async ensureLoaded(): Promise<void> {
    if (this.entries) return;
    this.loading ??= (async () => {
      try {
        const raw = await readFile(this.filePath, "utf8");
        const parsed: unknown = JSON.parse(raw);
        this.entries = new Map(
          Object.entries(parsed as Record<string, AudioSource | null>),
        );
      } catch {
        // Missing or corrupt cache is not an error - start empty.
        this.entries = new Map();
      }
    })();
    await this.loading;
  }

  async get(key: string): Promise<AudioSource | null | undefined> {
    await this.ensureLoaded();
    const entries = this.entries;
    if (!entries?.has(key)) return undefined;
    return entries.get(key) ?? null;
  }

  async set(key: string, source: AudioSource | null): Promise<void> {
    await this.ensureLoaded();
    this.entries?.set(key, source);
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (!this.writable || this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, this.flushDelayMs);
    // Never hold the process open just to write a cache.
    this.flushTimer.unref?.();
  }

  async flush(): Promise<void> {
    if (!this.entries || !this.writable) return;
    try {
      await mkdir(dirname(this.filePath), { recursive: true });
      const plain = Object.fromEntries(this.entries);
      await writeFile(this.filePath, JSON.stringify(plain, null, 2), "utf8");
    } catch {
      // Read-only filesystem (Vercel, containers): keep serving from memory.
      this.writable = false;
    }
  }
}

/** Reads through memory first, falling back to the slower layer beneath. */
export class TieredResolutionCache implements ResolutionCache {
  constructor(private readonly layers: readonly ResolutionCache[]) {}

  async get(key: string): Promise<AudioSource | null | undefined> {
    for (const [index, layer] of this.layers.entries()) {
      const hit = await layer.get(key);
      if (hit === undefined) continue;
      // Promote into every faster layer we just missed.
      for (let i = 0; i < index; i++) await this.layers[i]?.set(key, hit);
      return hit;
    }
    return undefined;
  }

  async set(key: string, source: AudioSource | null): Promise<void> {
    await Promise.all(this.layers.map((layer) => layer.set(key, source)));
  }
}
