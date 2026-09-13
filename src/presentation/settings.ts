import { isGameMode, type GameMode } from "@/domain/GameMode";

/**
 * What this browser remembers between visits.
 *
 * Same reasoning as the recently-played row: localStorage rather than anything
 * server-side, because there are no accounts to hang preferences off and these
 * are conveniences for one person on one device. Every access is guarded -
 * storage throws outright in some privacy modes, and a preference is never
 * worth taking the page down for.
 */
export interface Settings {
  /**
   * Open the audio ladder on half a second instead of a full one.
   * On by default: it is the game as designed, and the gentler ladder is the
   * concession rather than the other way round.
   */
  readonly halfSecondStage: boolean;
  /**
   * Take the clue from the middle of the song rather than the opening.
   * Off by default - it changes the puzzle materially, so it should be chosen
   * rather than discovered.
   */
  readonly randomStart: boolean;
  /**
   * The mode last played. Not a preference so much as a memory: leaving a
   * lyrics game should not drop you back on the audio one.
   */
  readonly mode: GameMode;
}

export const DEFAULT_SETTINGS: Settings = {
  halfSecondStage: true,
  randomStart: false,
  mode: "audio",
};

const STORAGE_KEY = "musedle.settings";

/**
 * Reads a stored record field by field over the defaults.
 *
 * Never all-or-nothing: a record written by an older build is missing keys, one
 * written by a newer build has extra keys, and either would throw away the rest
 * of somebody's preferences if a single unrecognised field condemned the whole
 * object. Anything unreadable simply falls back to its default.
 */
export function parseSettings(value: unknown): Settings {
  if (typeof value !== "object" || value === null) return DEFAULT_SETTINGS;
  const record = value as Record<string, unknown>;

  const mode = record["mode"];
  return {
    halfSecondStage: boolish(record["halfSecondStage"], DEFAULT_SETTINGS.halfSecondStage),
    randomStart: boolish(record["randomStart"], DEFAULT_SETTINGS.randomStart),
    mode: isGameMode(mode) ? mode : DEFAULT_SETTINGS.mode,
  };
}

export function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? parseSettings(JSON.parse(raw)) : DEFAULT_SETTINGS;
  } catch {
    // Unreadable, corrupt, or blocked: start from the defaults.
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Full, or blocked. The choice still holds for this session.
  }
}

function boolish(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}
