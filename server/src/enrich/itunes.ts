/**
 * AudD's humming endpoint returns only artist/title/score, so album name,
 * artwork, and audio previews are looked up separately via the iTunes Search
 * API (free, no key required).
 */

export interface TrackDetails {
  album: string | null;
  artworkUrl: string | null;
  previewUrl: string | null;
  storeUrl: string | null;
}

interface ITunesResult {
  collectionName?: string;
  artworkUrl100?: string;
  previewUrl?: string;
  trackViewUrl?: string;
}

const EMPTY: TrackDetails = { album: null, artworkUrl: null, previewUrl: null, storeUrl: null };

export async function lookupTrackDetails(artist: string, title: string): Promise<TrackDetails> {
  const term = encodeURIComponent(`${artist} ${title}`);
  const url = `https://itunes.apple.com/search?media=music&entity=song&limit=1&term=${term}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return EMPTY;

    const data = (await res.json()) as { results?: ITunesResult[] };
    const track = data.results?.[0];
    if (!track) return EMPTY;

    return {
      album: track.collectionName ?? null,
      // iTunes serves artwork at any size; swap the 100x100 path for 600x600.
      artworkUrl: track.artworkUrl100?.replace('100x100', '600x600') ?? null,
      previewUrl: track.previewUrl ?? null,
      storeUrl: track.trackViewUrl ?? null,
    };
  } catch {
    return EMPTY;
  }
}
