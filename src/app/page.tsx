"use client";

import { useCallback, useState } from "react";
import type { Playlist } from "@/domain/entities/Playlist";
import { GameScreen } from "@/presentation/components/GameScreen";
import { PlaylistImportForm } from "@/presentation/components/PlaylistImportForm";
import { useSettings } from "@/presentation/hooks/useSettings";
import { rememberPlaylist } from "@/presentation/recentPlaylists";
import type { Settings } from "@/presentation/settings";

type Screen =
  | { readonly name: "import"; readonly error: string | null; readonly isLoading: boolean }
  /** The settings are captured here so a running game keeps the rules it started with. */
  | { readonly name: "game"; readonly playlist: Playlist; readonly settings: Settings };

const IMPORT_IDLE: Screen = { name: "import", error: null, isLoading: false };

export default function HomePage() {
  const [screen, setScreen] = useState<Screen>(IMPORT_IDLE);
  // One owner for everything this device remembers; both screens read from it.
  const { settings, update } = useSettings();

  const importPlaylist = useCallback(async (input: string): Promise<void> => {
    setScreen({ name: "import", error: null, isLoading: true });

    try {
      const response = await fetch("/api/playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });

      const payload: unknown = await response.json();

      if (!response.ok) {
        const message =
          (payload as { error?: string } | null)?.error ?? "That playlist could not be loaded.";
        setScreen({ name: "import", error: message, isLoading: false });
        return;
      }

      const playlist = payload as Playlist;
      // Recorded on success only, so a mistyped link never joins the shortcuts.
      rememberPlaylist(playlist, input);
      setScreen({ name: "game", playlist, settings });
    } catch {
      setScreen({
        name: "import",
        error: "Could not reach the server. Check your connection and try again.",
        isLoading: false,
      });
    }
  }, [settings]);

  return (
    <main
      data-source={screen.name === "game" ? screen.playlist.provider : "text"}
      className="theme-transition relative flex min-h-dvh flex-col items-center justify-center px-5 py-12"
    >
      <Backdrop artworkUrl={screen.name === "game" ? screen.playlist.artworkUrl : null} />

      {screen.name === "import" ? (
        <PlaylistImportForm
          isLoading={screen.isLoading}
          error={screen.error}
          settings={settings}
          onSettingsChange={update}
          onImport={(input) => void importPlaylist(input)}
        />
      ) : (
        <GameScreen
          playlist={screen.playlist}
          settings={screen.settings}
          onChangePlaylist={() => setScreen(IMPORT_IDLE)}
        />
      )}
    </main>
  );
}

/**
 * Blurred cover art behind the game.
 *
 * Cheaper and more robust than sampling the artwork for an accent colour: no
 * canvas, no CORS negotiation, and it makes every playlist feel like its own
 * room without any per-provider special casing.
 */
function Backdrop({ artworkUrl }: { artworkUrl: string | null }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {artworkUrl && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={artworkUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="absolute left-1/2 top-1/2 h-[130%] w-[130%] -translate-x-1/2 -translate-y-1/2
                       object-cover opacity-25 blur-[80px] saturate-150"
          />
          <div className="absolute inset-0 bg-app/70" />
        </>
      )}
      <div className="absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_100%_at_50%_0%,rgba(199,249,74,0.07),transparent)]" />
    </div>
  );
}
