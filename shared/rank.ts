import { canonicalizeTrack } from './itunes.js';
import { looksLikeCover, normalizeKey, similarity } from './text.js';
import type { LyricsHit, MatchSource, RankedMatch, RecognitionMatch } from './types.js';

const MAX_MATCHES = 5;
/**
 * Lyrics scoring. Most of the range is earned by how much of what was sung
 * actually appears in the song; only a little comes from the provider's own
 * ordering. Below MIN_OVERLAP there is no evidence at all and the hit is
 * dropped — a deliberately low bar, because discarding the right song costs
 * far more here than showing an extra wrong one.
 */
const LYRICS_MIN_SCORE = 28;
const LYRICS_EVIDENCE_RANGE = 56;
const LYRICS_RANK_BONUS = 6;
const MIN_OVERLAP = 0.25;

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

export function lyricsToMatches(hits: LyricsHit[]): RecognitionMatch[] {
  return hits
    .filter((h) => h.overlap >= MIN_OVERLAP && !looksLikeCover(h.artist, h.title))
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, 5)
    .map((h) => ({
      artist: h.artist,
      title: h.title,
      score: Math.round(
        LYRICS_MIN_SCORE +
          LYRICS_EVIDENCE_RANGE * h.overlap +
          LYRICS_RANK_BONUS * Math.max(0, 1 - h.rank * 0.2),
      ),
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
