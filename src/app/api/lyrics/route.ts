import { NextResponse } from "next/server";
import { getLyricsProvider } from "@/infrastructure/container";

/**
 * Words for one song.
 *
 * Server-side rather than straight from the browser: it keeps one shared cache
 * for every player instead of one per tab, and keeps the upstream identified by
 * a single User-Agent, as LRCLIB asks of its clients.
 */

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const payload = body as Record<string, unknown> | null;
  const title = payload?.["title"];
  const artists = payload?.["artists"];
  const durationMs = payload?.["durationMs"];

  if (typeof title !== "string" || !Array.isArray(artists)) {
    return NextResponse.json({ error: "Expected a title and artists." }, { status: 400 });
  }

  const lyrics = await getLyricsProvider().fetch({
    title,
    artists: artists.filter((artist): artist is string => typeof artist === "string"),
    durationMs: typeof durationMs === "number" ? durationMs : null,
  });

  // A song with no usable words is an ordinary outcome, not a failure - the
  // client simply moves on to another track.
  return NextResponse.json(
    { lyrics },
    { headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
