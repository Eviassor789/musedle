/**
 * Turns a YouTube video title into a clean artist + song pair.
 *
 * Spotify hands us structured metadata. YouTube hands us whatever the uploader
 * typed - "Numb (Official Music Video) [4K UPGRADE] - Linkin Park" - and the
 * guess list is unusable until that is cleaned up. Pure and separately tested,
 * because the heuristics here are the kind of thing that needs to be tweaked
 * against real-world examples without touching anything else.
 */

import { normalizeKey } from "./similarity";

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

/**
 * The same, in Hebrew: "... - קליפ", "... - הקליפ הרשמי".
 *
 * Uploaders label a video in the language they wrote the title in, and an
 * English-only noise list leaves "לא פוגע - הקליפ הרשמי" believing "the
 * official clip" is part of the song's name. Nothing then matches it.
 */
const NOISE_SUFFIX_HE =
  /\s*[|\-–—]\s*(?:ה?קליפ(?:\s+ה?רשמי)?|ה?וידאו(?:\s+ה?רשמי)?|ה?רשמי)\s*$/g;

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
 * Drops the artist's own name from the ends of the title.
 *
 * "אריק איינשטיין כמה טוב שבאת הביתה" is a channel repeating itself: the credit
 * is already in the artist field, and leaving it in the title means searching a
 * lyrics database for a song name that does not exist. Only leading and
 * trailing runs are removed - a credit in the *middle* of a title is usually a
 * genuine collaboration - and if that would empty the title the original is
 * kept, because a band and its song do sometimes share a name.
 */
function dropArtistEcho(title: string, artists: readonly string[]): string {
  const credit = new Set(normalizeKey(artists.join(" ")).split(" ").filter(Boolean));
  if (credit.size === 0) return title;

  const words = title.split(/\s+/).filter(Boolean);
  const isEcho = (word: string): boolean => {
    const key = normalizeKey(word);
    return key.length > 0 && credit.has(key);
  };

  let start = 0;
  let end = words.length;
  while (start < end && isEcho(words[start]!)) start++;
  while (end > start && isEcho(words[end - 1]!)) end--;

  const kept = words.slice(start, end).join(" ");
  return kept.length > 0 ? kept : title;
}

/**
 * Drops a run of words written in another script from either end.
 *
 * The same restatement habit as the pipe case, without the pipe: "כמה טוב שבאת
 * הביתה Arik Einstein" ends with the artist's name transliterated for search
 * engines, and "Aaron Razel - אהבתי את ההתחלה" opens with it.
 *
 * Which script is the song's is decided by weight of words rather than by
 * whichever happens to come first - the transliteration is routinely the one at
 * the front. Words carrying no letters at all, like a stray dash, belong to
 * neither side and are trimmed along with whichever run they sit in. A title
 * written entirely in one script is never touched.
 */
function dropForeignRun(title: string): string {
  const words = title.split(/\s+/).filter(Boolean);
  if (words.length < 2) return title;

  /** true = non-Latin, false = Latin, null = no letters to judge by. */
  const scriptOf = (word: string): boolean | null => {
    if (!/\p{L}/u.test(word)) return null;
    return NON_LATIN.test(word);
  };

  const scripts = words.map(scriptOf);
  const nonLatin = scripts.filter((s) => s === true).length;
  const latin = scripts.filter((s) => s === false).length;
  if (nonLatin === 0 || latin === 0) return title;

  // The majority script is the song's; the minority is the restatement.
  const keep = nonLatin >= latin;

  let start = 0;
  let end = words.length;
  while (start < end && scripts[start] !== keep) start++;
  while (end > start && scripts[end - 1] !== keep) end--;

  const kept = words.slice(start, end).join(" ");
  return kept.length > 0 ? kept : title;
}

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
  const cleaned = collapse(
    rawTitle
      .replace(NOISE_IN_BRACKETS, " ")
      .replace(NOISE_SUFFIX, "")
      .replace(NOISE_SUFFIX_HE, ""),
  );

  /*
   * The title is scrubbed against the credit we settled on, in this order:
   * drop a translated restatement after a pipe, then the artist's own name
   * echoed at either end, then a transliterated tail. Each step can only
   * shorten the title, and each refuses to empty it.
   */
  const finish = (title: string, artists: readonly string[]): NormalizedTitle => ({
    title: dropForeignRun(dropArtistEcho(dropBilingualTail(title), artists)),
    artists,
  });

  const parts = splitOnSeparator(cleaned);
  if (!parts) {
    // No separator: the whole string is the song, the channel is the artist.
    return finish(cleaned || collapse(rawTitle), channel ? [channel] : []);
  }

  const [left, right] = parts;

  // The channel tells us which half is the artist. Uploaders use both orders,
  // so matching beats assuming.
  if (channel && looselyEqual(channel, right) && !looselyEqual(channel, left)) {
    return finish(left, splitArtistCredit(right));
  }
  if (channel && looselyEqual(channel, left)) {
    return finish(right, splitArtistCredit(left));
  }

  // Unknown channel: "Artist - Title" is overwhelmingly the convention.
  return finish(right, splitArtistCredit(left));
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
