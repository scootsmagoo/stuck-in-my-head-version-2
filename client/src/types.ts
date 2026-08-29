export interface SongMatch {
  score: number;
  artist: string;
  title: string;
  album: string | null;
  artworkUrl: string | null;
  previewUrl: string | null;
  storeUrl: string | null;
}

export interface RecognizeResponse {
  matches?: SongMatch[];
  error?: string;
}
