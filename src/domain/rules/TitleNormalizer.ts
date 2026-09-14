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

/**
 * What a channel calls itself on top of the artist's actual name.
 *
 * A channel is not a credit: "אריק סיני הערוץ הרשמי Aric Sinai Official" is one
 * artist wearing three extra words, and those words are what stop a lyrics
 * lookup matching the plain "אריק סיני" the database has. Stripping them also
 * tends to leave *both* spellings of the name in place, which is exactly what
 * is wanted when the two catalogues disagree about which script to use.
 */
const CHANNEL_NOISE = /\b(?:official|officiel|oficial|channel)\b/gi;

/**
 * VEVO gets its own rule because it is usually glued straight onto the name -
 * "ArianaGrandeVEVO" - where a word boundary never fires.
 */
const VEVO_SUFFIX = /\s*vevo\s*$/i;

/** The same, in Hebrew: "the official channel" / "official channel". */
const CHANNEL_NOISE_HE = /ה?ערוץ\s+ה?רשמי/g;

/** Scripts that are not Latin, for spotting a bilingual restatement. */
const NON_LATIN =
  /[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Cyrillic}\p{Script=Greek}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}\p{Script=Devanagari}]/u;

/**
 * Drops a translated restatement of the title after a pipe.
 *
 * Uploaders outside the Anglosphere routinely title a video in both languages:
 * "הגיבן הקדוש | Aaron Razel - The Holy Hunchback". Carried into the track's
 * title, the tail wrecks every lookup and reads badly in the guess list.
 *
 * Only dropped when the two halves are in *different scripts*, which is what
 * distinguishes a restatement from a qualifier that genuinely changes the song.
 * "Song | Live at Wembley" is all Latin, so it survives untouched.
 */
function dropBilingualTail(title: string): string {
  const at = title.indexOf(" | ");
  if (at <= 0) return title;

  const head = title.slice(0, at);
  const tail = title.slice(at + 3);
  if (!head.trim() || !tail.trim()) return title;

  return NON_LATIN.test(head) === NON_LATIN.test(tail) ? title : collapse(head);
}

const collapse = (s: string): string => s.replace(/\s+/g, " ").trim();

/** Loose equality for matching a channel name against one half of a title. */
function looselyEqual(a: string, b: string): boolean {
  // Script-agnostic, like the domain's normaliser: a Latin-only filter emptied
  // both sides for a non-Latin channel, so the comparison always said "no" and
  // the artist and title could end up assigned the wrong way round.
  const key = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/\p{Mn}+/gu, "")
      .replace(/\b(?:the|official|vevo|music|records)\b/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, "");
  const ka = key(a);
  const kb = key(b);
  if (!ka || !kb) return false;
  return ka === kb || ka.includes(kb) || kb.includes(ka);
}

export function cleanChannelName(channel: string | null): string | null {
  if (!channel) return null;
  const cleaned = collapse(
    channel
      .replace(TOPIC_SUFFIX, "")
      .replace(CHANNEL_NOISE_HE, " ")
      .replace(CHANNEL_NOISE, " ")
      .replace(VEVO_SUFFIX, ""),
  );
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
    return {
      title: dropBilingualTail(cleaned || collapse(rawTitle)),
      artists: channel ? [channel] : [],
    };
  }

  const [left, right] = parts;

  // The channel tells us which half is the artist. Uploaders use both orders,
  // so matching beats assuming.
  if (channel && looselyEqual(channel, right) && !looselyEqual(channel, left)) {
    return { title: dropBilingualTail(left), artists: splitArtistCredit(right) };
  }
  if (channel && looselyEqual(channel, left)) {
    return { title: dropBilingualTail(right), artists: splitArtistCredit(left) };
  }

  // Unknown channel: "Artist - Title" is overwhelmingly the convention.
  return { title: dropBilingualTail(right), artists: splitArtistCredit(left) };
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
