/** A single candidate song returned by a recognition provider. */
export interface RecognitionMatch {
  /** Provider confidence, normalized to 0–100 (higher = more likely). */
  score: number;
  artist: string;
  title: string;
}

/** A lyrics-index hit, carrying the evidence behind it. */
export interface LyricsHit {
  artist: string;
  title: string;
  /** Position in the provider's own result list, 0-based. */
  rank: number;
  /** Share of the sung words found in these lyrics, 0-1. */
  overlap: number;
}

export type MatchSource = 'melody' | 'lyrics' | 'audio';

export interface RankedMatch {
  score: number;
  artist: string;
  title: string;
  album: string | null;
  artworkUrl: string | null;
  previewUrl: string | null;
  storeUrl: string | null;
  sources: MatchSource[];
  alternateArtists: string[];
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
  recognizeHumming(audio: Blob): Promise<RecognitionMatch[]>;
}
