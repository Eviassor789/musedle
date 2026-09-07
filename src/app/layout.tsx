import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

/*
 * Three faces, three jobs: a geometric display face for headings, a neutral
 * text face for everything you read, and a monospace for anything counting -
 * seconds, timers, scores - so digits hold their column instead of shuffling
 * as they tick.
 */
const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--ff-display",
  display: "swap",
});

const body = Inter({
  subsets: ["latin"],
  variable: "--ff-body",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--ff-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Musedle - name the song in one second",
  description:
    "Music meets Wordle. Turn any Spotify or YouTube playlist into a song-guessing game: one second of audio, five chances.",
};

export const viewport: Viewport = {
  themeColor: "#121213",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
