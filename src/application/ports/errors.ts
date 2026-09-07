export type ImportErrorCode =
  | "UNSUPPORTED_INPUT"
  | "NOT_FOUND"
  | "UPSTREAM_UNAVAILABLE"
  | "PARSE_FAILED"
  | "EMPTY_PLAYLIST"
  | "TOO_FEW_PLAYABLE";

/** A failure we can show a human a useful sentence about. */
export class ImportError extends Error {
  constructor(
    readonly code: ImportErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ImportError";
  }
}
