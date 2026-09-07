/** A song's words, cleaned and ready to quote from. */
export interface Lyrics {
  /** Lines worth showing as a clue - decoration and spoilers already removed. */
  readonly lines: readonly string[];
  /** The album, used as the last hint. Null when the source did not name one. */
  readonly albumName: string | null;
}
