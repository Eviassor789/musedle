/**
 * Tiny helpers for walking InnerTube responses.
 *
 * These payloads are deep, inconsistently nested and change shape between
 * YouTube releases (the playlist page moved from `playlistVideoRenderer` to
 * `lockupViewModel` mid-2025). Searching the tree for the renderer we want,
 * instead of hard-coding a path to it, survives most of that churn.
 */

export const asRecord = (v: unknown): Record<string, unknown> | null =>
  typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;

export const asString = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v : null;

export const asNumber = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/**
 * Follows a fixed key path, returning undefined the moment it breaks.
 * Numeric segments index into arrays, so "metadataRows/0/metadataParts" works.
 */
export function dig(root: unknown, path: readonly string[]): unknown {
  let node: unknown = root;
  for (const key of path) {
    if (Array.isArray(node)) {
      if (!/^\d+$/.test(key)) return undefined;
      node = node[Number(key)];
      continue;
    }
    const rec = asRecord(node);
    if (!rec) return undefined;
    node = rec[key];
  }
  return node;
}

/**
 * Depth-first collection of every value stored under `key` anywhere in the tree.
 * Order matches the document, so playlist ordering is preserved.
 */
export function collectByKey(root: unknown, key: string, limit = Infinity): unknown[] {
  const found: unknown[] = [];
  const stack: unknown[] = [root];
  const walk = (node: unknown): void => {
    if (found.length >= limit) return;
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    const rec = asRecord(node);
    if (!rec) return;
    for (const [k, v] of Object.entries(rec)) {
      if (found.length >= limit) return;
      if (k === key) found.push(v);
      else walk(v);
    }
  };
  walk(stack[0]);
  return found;
}

/** First value stored under `key`, anywhere. */
export function findByKey(root: unknown, key: string): unknown {
  return collectByKey(root, key, 1)[0];
}

/** Flattens InnerTube's `{ runs: [{text}] }` and `{ content }` text shapes. */
export function readText(node: unknown): string | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const text = readText(child);
      if (text) return text;
    }
    return null;
  }

  const rec = asRecord(node);
  if (!rec) return asString(node);

  const content = asString(rec["content"]);
  if (content) return content;

  const simple = asString(rec["simpleText"]);
  if (simple) return simple;

  const runs = rec["runs"];
  if (Array.isArray(runs)) {
    const joined = runs
      .map((run) => asString(asRecord(run)?.["text"]) ?? "")
      .join("")
      .trim();
    if (joined) return joined;
  }
  return null;
}

/** Highest-resolution image from a `{ sources: [{url, width}] }` block. */
export function bestImageUrl(node: unknown): string | null {
  const sources = asRecord(node)?.["sources"] ?? asRecord(node)?.["thumbnails"];
  if (!Array.isArray(sources)) return null;
  let best: { url: string; width: number } | null = null;
  for (const source of sources) {
    const rec = asRecord(source);
    const url = asString(rec?.["url"]);
    if (!url) continue;
    const width = asNumber(rec?.["width"]) ?? 0;
    if (!best || width > best.width) best = { url, width };
  }
  return best?.url ?? null;
}
