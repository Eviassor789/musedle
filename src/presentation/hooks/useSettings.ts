"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from "@/presentation/settings";

export interface SettingsStore {
  readonly settings: Settings;
  /** Change one or more settings, persisting the result. */
  update(patch: Partial<Settings>): void;
}

/**
 * The device's remembered preferences.
 *
 * Starts from the defaults and reads storage after mount rather than during
 * render, for the same reason the recently-played row does: localStorage does
 * not exist on the server, so seeding state from it would make the first client
 * render disagree with the prerendered HTML. The cost is that a toggle shows
 * its default for one frame before the stored value lands.
 */
export function useSettings(): SettingsStore {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  /*
   * The write happens here, in the event, rather than inside the state updater
   * or an effect watching `settings`. An updater is not the place for a side
   * effect - StrictMode invokes it twice - and an effect would fire once on
   * mount with the defaults, before the load above has had a chance to land.
   */
  const latest = useRef(settings);
  latest.current = settings;

  const update = useCallback((patch: Partial<Settings>) => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    saveSettings(next);
    setSettings(next);
  }, []);

  return { settings, update };
}
