import { lyricsOverlap, normalizeKey } from './text.js';
import type { LyricsHit, RecognitionMatch } from './types.js';

/**
 * Both of AudD's recognition endpoints are acoustic fingerprinting: they match
 * the spectral signature of one specific master recording. That is robust to
 * room noise and compression, but it cannot match a hummed or sung melody,
 * which shares no fingerprint with the original. recognizeWithOffset is used
 * here because it returns ranked candidates rather than a single result;
 * calling the plain endpoint as well would repeat the same work.
 */
const AUDD_FINGERPRINT_URL = 'https://api.audd.io/recognizeWithOffset/';
const AUDD_LYRICS_URL = 'https://api.audd.io/findLyrics/';

interface AuddFingerprintResponse {
  status: 'success' | 'error';
  error?: { error_code: number; error_message: string };
  result?: {
    count?: number;
    list?: Array<{ score: number; artist: string; title: string }>;
  } | null;
}

export class AuddProvider {
  readonly name = 'audd';

  constructor(private readonly apiToken: string) {}

  /**
   * Identify a recording of the actual song — music playing nearby, not a
   * person humming it. Returns ranked candidates, or an empty array if nothing
   * matched.
   */
  async recognizeFingerprint(audio: Blob): Promise<RecognitionMatch[]> {
    const data = await this.postFile<AuddFingerprintResponse>(AUDD_FINGERPRINT_URL, audio);
    if (data.status === 'error') throw auddError(data.error);
    return dedupe(data.result?.list ?? []).sort((a, b) => b.score - a.score);
  }

  /**
   * Search AudD's lyrics index by a sung excerpt. Returns each hit with how
   * much of the query its lyrics actually contain, so ranking can weigh the
   * evidence instead of trusting result order.
   */
  async findLyrics(query: string): Promise<LyricsHit[]> {
    const form = new FormData();
    form.append('api_token', this.apiToken);
    form.append('q', query);

    const res = await fetch(AUDD_LYRICS_URL, { method: 'POST', body: form });
    if (!res.ok) throw new Error(`AudD lyrics request failed with HTTP ${res.status}`);

    const data = (await res.json()) as {
      status: 'success' | 'error';
      error?: { error_code: number; error_message: string };
      result?: Array<{ artist?: string; title?: string; lyrics?: string }> | null;
    };
    if (data.status === 'error') throw auddError(data.error);

    const hits: LyricsHit[] = [];
    const seen = new Set<string>();

    (data.result ?? []).forEach((r, rank) => {
      if (!r.artist || !r.title) return;
      const key = `${normalizeKey(r.artist)}|${normalizeKey(r.title)}`;
      if (seen.has(key)) return;
      seen.add(key);
      hits.push({ artist: r.artist, title: r.title, rank, overlap: lyricsOverlap(query, r.title, r.lyrics) });
    });

    return hits;
  }

  private async postFile<T>(
    url: string,
    audio: Blob,
    extra: Record<string, string> = {},
  ): Promise<T> {
    const form = new FormData();
    form.append('api_token', this.apiToken);
    form.append('file', audio, `recording.${extensionFor(audio.type)}`);
    for (const [k, v] of Object.entries(extra)) form.append(k, v);

    const res = await fetch(url, { method: 'POST', body: form });
    if (!res.ok) throw new Error(`AudD request failed with HTTP ${res.status}`);
    return (await res.json()) as T;
  }
}

function auddError(error?: { error_code: number; error_message: string }): Error {
  const { error_code, error_message } = error ?? { error_code: -1, error_message: 'unknown error' };
  return new Error(`AudD error #${error_code}: ${error_message}`);
}

function extensionFor(mimeType: string): string {
  const subtype = mimeType.split('/')[1]?.split(';')[0] ?? '';
  switch (subtype) {
    case 'webm':
      return 'webm';
    case 'mp4':
      return 'm4a';
    case 'ogg':
      return 'ogg';
    case 'mpeg':
      return 'mp3';
    case 'wav':
    case 'x-wav':
      return 'wav';
    default:
      return 'webm';
  }
}

function dedupe(matches: RecognitionMatch[]): RecognitionMatch[] {
  const seen = new Map<string, RecognitionMatch>();
  for (const m of matches) {
    const key = `${normalizeKey(m.artist)}|${normalizeKey(m.title)}`;
    const existing = seen.get(key);
    if (!existing || m.score > existing.score) seen.set(key, m);
  }
  return [...seen.values()];
}
