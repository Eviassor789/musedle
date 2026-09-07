/**
 * Turns a YouTube video title into a clean artist + song pair.
 *
 * Spotify hands us structured metadata. YouTube hands us whatever the uploader
 * typed - "Numb (Official Music Video) [4K UPGRADE] - Linkin Park" - and the
 * guess list is unusable until that is cleaned up. Pure and separately tested,
 * because the heuristics here are the kind of thing that needs to be tweaked
 * against real-world examples without touching anything else.
 */

export interface NormalizedTitle {
  readonly title: string;
  readonly artists: readonly string[];
}

/**
 * Words that carry no musical meaning on their own.
 *
 * Deliberately a curated allow-list rather than "strip all brackets":
 * "(feat. Rosalia)", "(Acoustic)" and "(Live at Wembley)" change what the song
 * *is* and must survive. A bracket is only removed when *every* word inside it
 * is noise, which is what lets "[Official HD Music Video]" go while
 * "(Original Mix)" stays.
 */
const NOISE_WORD =
  "official|officiel|oficial|original|music|video|videoclip|audio|visuali[sz]er|lyrics?|mv|hd|hq|uhd|4k|8k|remaster(?:ed)?|upgrade|\\d{4}";

const NOISE_IN_BRACKETS = new RegExp(
  `[([（]\\s*(?:(?:${NOISE_WORD})[\\s\\-–—/]*)+[)\\]）]`,
  "gi",
);

/** The same noise as a trailing suffix without brackets: "... | Official Video". */
const NOISE_SUFFIX =
  /\s*[|\-–—]\s*(?:official\s*(?:music\s*)?(?:video|audio)|lyric(?:s)?(?:\s*video)?|visuali[sz]er)\s*$/gi;

/** Separators uploaders use between artist and title, longest first. */
const SEPARATORS = [" -- ", " — ", " – ", " - ", " | ", " ｜ ", " : "];

/** YouTube's auto-generated per-artist channels are named "Artist - Topic". */
const TOPIC_SUFFIX = /\s*-\s*topic\s*$/i;

const collapse = (s: string): string => s.replace(/\s+/g, " ").trim();

/** Loose equality for matching a channel name against one half of a title. */
function looselyEqual(a: string, b: string): boolean {
  const key = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/\b(?:the|official|vevo|music|records)\b/g, "")
      .replace(/[^a-z0-9]/g, "");
  const ka = key(a);
  const kb = key(b);
  if (!ka || !kb) return false;
  return ka === kb || ka.includes(kb) || kb.includes(ka);
}

export function cleanChannelName(channel: string | null): string | null {
  if (!channel) return null;
  const cleaned = collapse(channel.replace(TOPIC_SUFFIX, "").replace(/\s*VEVO\s*$/i, ""));
  return cleaned || null;
}

/** Splits "A - B" on the first separator that actually appears. */
function splitOnSeparator(text: string): [string, string] | null {
  for (const sep of SEPARATORS) {
    const at = text.indexOf(sep);
    if (at > 0 && at < text.length - sep.length) {
      const left = collapse(text.slice(0, at));
      const right = collapse(text.slice(at + sep.length));
      if (left && right) return [left, right];
    }
  }
  return null;
}

/** Splits a credit string into individual artists: "A, B & C" -> [A, B, C]. */
export function splitArtistCredit(credit: string): string[] {
  return credit
    // `\bfeat\b\.?` not `\bfeat\.?\b` - a word boundary cannot sit between "." and " ".
    .split(/\s*(?:,|&|\bx\b|\bfeat\b\.?|\bft\b\.?|\bwith\b)\s*/i)
    .map(collapse)
    .filter(Boolean);
}

export function normalizeVideoTitle(
  rawTitle: string,
  channelName: string | null = null,
): NormalizedTitle {
  const channel = cleanChannelName(channelName);
  const cleaned = collapse(rawTitle.replace(NOISE_IN_BRACKETS, " ").replace(NOISE_SUFFIX, ""));

  const parts = splitOnSeparator(cleaned);
  if (!parts) {
    // No separator: the whole string is the song, the channel is the artist.
    return { title: cleaned || collapse(rawTitle), artists: channel ? [channel] : [] };
  }

  const [left, right] = parts;

  // The channel tells us which half is the artist. Uploaders use both orders,
  // so matching beats assuming.
  if (channel && looselyEqual(channel, right) && !looselyEqual(channel, left)) {
    return { title: left, artists: splitArtistCredit(right) };
  }
  if (channel && looselyEqual(channel, left)) {
    return { title: right, artists: splitArtistCredit(left) };
  }

  // Unknown channel: "Artist - Title" is overwhelmingly the convention.
  return { title: right, artists: splitArtistCredit(left) };
}

/** Parses YouTube's "3:08" / "1:02:33" duration badges into milliseconds. */
export function parseDurationLabel(label: string | null): number | null {
  if (!label) return null;
  const parts = label.trim().split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  let total = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    total = total * 60 + Number(part);
  }
  return total * 1000;
}
