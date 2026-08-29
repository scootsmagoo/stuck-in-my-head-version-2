/** A single candidate song returned by a recognition provider. */
export interface RecognitionMatch {
  /** Provider confidence, normalized to 0–100 (higher = more likely). */
  score: number;
  artist: string;
  title: string;
}

/**
 * Abstraction over melody/humming recognition services so the AudD
 * implementation can be swapped for ACRCloud (or others) without touching
 * the HTTP layer or the frontend.
 */
export interface RecognitionProvider {
  readonly name: string;

  /**
   * Identify a song from a recording of someone humming/singing.
   * Returns candidates ordered by descending confidence; empty array if
   * nothing matched.
   */
  recognizeHumming(audio: Buffer, mimeType: string): Promise<RecognitionMatch[]>;
}
