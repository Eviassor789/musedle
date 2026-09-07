import { NextResponse } from "next/server";
import { ImportError, type ImportErrorCode } from "@/application/ports/errors";
import { getImportPlaylist } from "@/infrastructure/container";

/**
 * The one server entry point: user input in, playable playlist out.
 *
 * This has to run server-side. Spotify's embed endpoint and YouTube's InnerTube
 * both reject cross-origin browser calls, so the browser could not fetch them
 * directly even though the audio they point at is CORS-open.
 */

export const runtime = "nodejs";

const STATUS_BY_CODE: Record<ImportErrorCode, number> = {
  UNSUPPORTED_INPUT: 400,
  NOT_FOUND: 404,
  PARSE_FAILED: 422,
  EMPTY_PLAYLIST: 422,
  TOO_FEW_PLAYABLE: 422,
  UPSTREAM_UNAVAILABLE: 502,
};

const MAX_INPUT_LENGTH = 20_000;

export async function POST(request: Request): Promise<NextResponse> {
  let input: unknown;
  try {
    const body: unknown = await request.json();
    input = (body as Record<string, unknown> | null)?.["input"];
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  if (typeof input !== "string" || input.trim().length === 0) {
    return NextResponse.json({ error: "Paste a playlist link or a list of songs." }, { status: 400 });
  }
  if (input.length > MAX_INPUT_LENGTH) {
    return NextResponse.json({ error: "That list is too long." }, { status: 413 });
  }

  try {
    const playlist = await getImportPlaylist().execute(input);
    return NextResponse.json(playlist, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (error) {
    if (error instanceof ImportError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: STATUS_BY_CODE[error.code] },
      );
    }
    console.error("[musedle] unexpected import failure", error);
    return NextResponse.json({ error: "Something went wrong importing that playlist." }, { status: 500 });
  }
}
