import { looksLikeCover, similarity } from '../lib/text.js';

export interface TrackDetails {
  artist: string;
  title: string;
  album: string | null;
  artworkUrl: string | null;
  previewUrl: string | null;
  storeUrl: string | null;
}

interface ITunesResult {
  artistName?: string;
  trackName?: string;
  collectionName?: string;
  artworkUrl100?: string;
  previewUrl?: string;
  trackViewUrl?: string;
}

const EMPTY: Omit<TrackDetails, 'artist' | 'title'> = {
  album: null,
  artworkUrl: null,
  previewUrl: null,
  storeUrl: null,
};

/**
 * Pick the canonical commercial recording for a hummed/sung title.
 * iTunes search is roughly popularity-sorted, so the first real (non-karaoke)
 * title match is usually the original hit — e.g. Eurythmics for Sweet Dreams
 * even if the humming engine named a cover act.
 */
export async function canonicalizeTrack(
  artist: string,
  title: string,
  hummingArtists: string[] = [artist],
): Promise<TrackDetails> {
  const [byTitle, byBoth] = await Promise.all([
    itunesSearch(title, 10),
    itunesSearch(`${title} ${artist}`, 5),
  ]);

  let best: { hit: ITunesResult; score: number } | null = null;
  const seen = new Set<string>();

  for (const [hit, index, bonus] of [
    ...byTitle.map((h, i) => [h, i, 4] as const),
    ...byBoth.map((h, i) => [h, i, 0] as const),
  ]) {
    const key = `${hit.artistName}|${hit.trackName}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const titleScore = similarity(title, hit.trackName ?? '');
    if (titleScore < 0.5) continue;

    let score = titleScore * 50 + (10 - index) * 2 + bonus;
    if (hummingArtists.some((a) => similarity(a, hit.artistName ?? '') > 0.55)) score += 18;
    if (looksLikeCover(hit.artistName ?? '', `${hit.trackName} ${hit.collectionName}`)) score -= 28;

    if (!best || score > best.score) best = { hit, score };
  }

  if (!best) {
    return { artist, title, ...EMPTY };
  }

  const hit = best.hit;
  return {
    artist: hit.artistName || artist,
    title: hit.trackName || title,
    album: hit.collectionName ?? null,
    artworkUrl: hit.artworkUrl100?.replace('100x100', '600x600') ?? null,
    previewUrl: hit.previewUrl ?? null,
    storeUrl: hit.trackViewUrl ?? null,
  };
}

async function itunesSearch(term: string, limit: number): Promise<ITunesResult[]> {
  const url = `https://itunes.apple.com/search?media=music&entity=song&limit=${limit}&term=${encodeURIComponent(term)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: ITunesResult[] };
    return data.results ?? [];
  } catch {
    return [];
  }
}
