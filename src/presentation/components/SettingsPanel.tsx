"use client";

import type { Settings } from "@/presentation/settings";

interface SettingsPanelProps {
  readonly settings: Settings;
  readonly disabled: boolean;
  onChange(patch: Partial<Settings>): void;
}

/**
 * The two knobs that change what a round is.
 *
 * Deliberately here on the front door and nowhere else. Both of these decide
 * the shape of a game before it starts - how many rungs the ladder has, where
 * the clip is cut from - and a control that silently does nothing until the
 * next round is worse than one you have to come back out for.
 */
export function SettingsPanel({ settings, disabled, onChange }: SettingsPanelProps) {
  return (
    <div className="surface animate-rise flex w-full flex-col rounded-2xl p-1.5">
      <SettingRow
        title="Start at 0.5s"
        badge="Hard"
        hint="Half the opening clue, and a sixth guess to make up for it. Off starts at 1s."
        checked={settings.halfSecondStage}
        disabled={disabled}
        onChange={(halfSecondStage) => onChange({ halfSecondStage })}
      />

      <SettingRow
        title="Start mid-song"
        hint="Take the clue from the body of the track, not the intro. YouTube playlists only — a Spotify preview is already an excerpt."
        checked={settings.randomStart}
        disabled={disabled}
        onChange={(randomStart) => onChange({ randomStart })}
      />

      {/* Neither knob touches a lyrics round, and a panel that looks live while
          doing nothing is a small betrayal. Said once, quietly, rather than by
          greying out two rows whose values still matter for the other mode. */}
      {settings.mode === "lyrics" && (
        <p className="px-3 pb-1.5 pt-0.5 text-[11px] leading-snug text-fg-faint">
          Both apply to <span className="text-fg-dim">Hear it</span> rounds.
        </p>
      )}
    </div>
  );
}

function SettingRow({
  title,
  badge,
  hint,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  /** A word of warning that has to land before the hint is read, if at all. */
  badge?: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    // The whole row is the control, not just the switch: a 36px target beside
    // two lines of text is a miss waiting to happen on a phone.
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition
                 hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="text-[13px] font-medium text-fg">{title}</span>
          {badge && (
            // Amber, not red: this is a difficulty, not a warning. It sits on
            // the title line so the cost registers before the sentence below
            // has to be read at all.
            <span className="rounded-full bg-partial/20 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-partial">
              {badge}
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-[11px] leading-snug text-fg-faint">{hint}</span>
      </span>
      <Switch checked={checked} />
    </button>
  );
}

/** A plain track-and-knob switch. The row above owns the semantics. */
function Switch({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={`relative block h-[1.375rem] w-10 shrink-0 rounded-full transition-colors ${
        checked ? "bg-accent" : "bg-muted"
      }`}
    >
      <span
        className={`absolute top-[0.1875rem] size-4 rounded-full bg-fg transition-[left] duration-200 ${
          checked ? "left-[1.3125rem]" : "left-[0.1875rem]"
        }`}
      />
    </span>
  );
}

/**
 * The cog that opens the panel.
 *
 * Bare - no border, no fill. It sits beside the mode picker because that is
 * what it qualifies, and a bordered box there read as a third segment of a
 * two-option control. Stripped back it is an accessory to the picker rather
 * than a peer, and the quarter turn on open carries the state the background
 * used to.
 */
export function SettingsToggle({
  open,
  disabled,
  onClick,
}: {
  open: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-expanded={open}
      aria-label="Game options"
      className={`grid shrink-0 place-items-center rounded-xl px-2 transition
                  disabled:cursor-not-allowed disabled:opacity-50 ${
                    open ? "text-accent" : "text-fg-faint hover:text-fg"
                  }`}
    >
      <CogIcon className={`size-5 transition-transform duration-300 ${open ? "rotate-90" : ""}`} />
    </button>
  );
}

function CogIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}
