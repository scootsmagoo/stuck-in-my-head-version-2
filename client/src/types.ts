export type MatchSource = 'melody' | 'lyrics' | 'audio';

export interface SongMatch {
  score: number;
  artist: string;
  title: string;
  album: string | null;
  artworkUrl: string | null;
  previewUrl: string | null;
  storeUrl: string | null;
  sources?: MatchSource[];
  alternateArtists?: string[];
}

export interface RecognizeResponse {
  matches?: SongMatch[];
  heard?: string | null;
  error?: string;
}
