import { canonicalizeTrack } from './enrich/itunes.js';
import { looksLikeCover, normalizeKey, similarity } from './lib/text.js';
import type { MatchSource, RankedMatch, RecognitionMatch } from './providers/types.js';

const MAX_MATCHES = 5;
const LYRICS_BASE = 72;

/**
 * Merge humming, lyrics, and fingerprint candidates: collapse covers of the
 * same title, boost songs that showed up on more than one signal, then attach
 * canonical artist/artwork from iTunes.
 */
export async function rankAndEnrich(input: {
  humming: RecognitionMatch[];
  lyrics: RecognitionMatch[];
  fingerprint: RecognitionMatch[];
}): Promise<RankedMatch[]> {
  const buckets = new Map<string, Bucket>();

  addAll(buckets, input.humming, 'melody');
  addAll(buckets, input.lyrics, 'lyrics');
  addAll(buckets, input.fingerprint, 'audio');

  const combined = [...buckets.values()].map((b) => {
    let score = b.bestScore;
    if (b.sources.has('melody') && b.sources.has('lyrics')) score = Math.min(100, score + 16);
    if (b.sources.has('audio')) score = Math.min(100, Math.max(score, 96));
    return { ...b, score };
  });

  combined.sort((a, b) => b.score - a.score);
  const top = combined.slice(0, MAX_MATCHES);

  const enriched = await Promise.all(
    top.map(async (b) => {
      const canonical = await canonicalizeTrack(b.artist, b.title, b.artists);
      const alternateArtists = unique(
        b.artists.filter((a) => similarity(a, canonical.artist) < 0.6),
      );
      return {
        score: Math.round(b.score),
        artist: canonical.artist,
        title: canonical.title,
        album: canonical.album,
        artworkUrl: canonical.artworkUrl,
        previewUrl: canonical.previewUrl,
        storeUrl: canonical.storeUrl,
        sources: [...b.sources],
        alternateArtists,
      };
    }),
  );

  return collapseCanonical(enriched);
}

export function lyricsToMatches(hits: RecognitionMatch[]): RecognitionMatch[] {
  return hits
    .filter((h) => !looksLikeCover(h.artist, h.title))
    .slice(0, 5)
    .map((h, i) => ({
      ...h,
      score: Math.max(40, LYRICS_BASE - i * 8),
    }));
}

interface Bucket {
  key: string;
  title: string;
  artist: string;
  artists: string[];
  bestScore: number;
  sources: Set<MatchSource>;
}

function addAll(buckets: Map<string, Bucket>, matches: RecognitionMatch[], source: MatchSource) {
  for (const m of matches) {
    const key = normalizeKey(m.title);
    if (!key) continue;
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, {
        key,
        title: m.title,
        artist: m.artist,
        artists: [m.artist],
        bestScore: m.score,
        sources: new Set([source]),
      });
      continue;
    }
    existing.sources.add(source);
    if (m.score > existing.bestScore) {
      existing.bestScore = m.score;
      existing.artist = m.artist;
    }
    if (!existing.artists.some((a) => similarity(a, m.artist) > 0.7)) {
      existing.artists.push(m.artist);
    }
  }
}

function unique(items: string[]): string[] {
  const out: string[] = [];
  for (const item of items) {
    if (!out.some((x) => similarity(x, item) > 0.7)) out.push(item);
  }
  return out;
}

function collapseCanonical(matches: RankedMatch[]): RankedMatch[] {
  const buckets = new Map<string, RankedMatch>();
  for (const m of matches) {
    const key = `${normalizeKey(m.artist)}|${normalizeKey(m.title)}`;
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, m);
      continue;
    }
    existing.score = Math.max(existing.score, m.score);
    existing.sources = uniqueSources([...existing.sources, ...m.sources]);
    existing.alternateArtists = unique([...existing.alternateArtists, ...m.alternateArtists]);
    if (!existing.artworkUrl && m.artworkUrl) Object.assign(existing, m, { score: existing.score });
  }
  return [...buckets.values()].sort((a, b) => b.score - a.score);
}

function uniqueSources(sources: MatchSource[]): MatchSource[] {
  return [...new Set(sources)];
}
