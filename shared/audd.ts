import { lyricsMentionQuery, normalizeKey } from './text.js';
import type { RecognitionMatch, RecognitionProvider } from './types.js';

const AUDD_HUMMING_URL = 'https://api.audd.io/recognizeWithOffset/';
const AUDD_RECOGNIZE_URL = 'https://api.audd.io/';
const AUDD_LYRICS_URL = 'https://api.audd.io/findLyrics/';

interface AuddHummingResponse {
  status: 'success' | 'error';
  error?: { error_code: number; error_message: string };
  result?: {
    count?: number;
    list?: Array<{ score: number; artist: string; title: string }>;
  } | null;
}

export class AuddProvider implements RecognitionProvider {
  readonly name = 'audd';

  constructor(private readonly apiToken: string) {}

  async recognizeHumming(audio: Blob): Promise<RecognitionMatch[]> {
    const data = await this.postFile<AuddHummingResponse>(AUDD_HUMMING_URL, audio);
    if (data.status === 'error') throw auddError(data.error);
    return dedupe(data.result?.list ?? []).sort((a, b) => b.score - a.score);
  }

  /**
   * Shazam-style fingerprinting of the original recording (not humming).
   * Used as a fallback when the user captured a song playing nearby.
   */
  async recognizeFingerprint(audio: Blob): Promise<RecognitionMatch[]> {
    const data = await this.postFile<{
      status: 'success' | 'error';
      error?: { error_code: number; error_message: string };
      result?: { artist?: string; title?: string } | null;
    }>(AUDD_RECOGNIZE_URL, audio, { return: 'apple_music,spotify' });

    if (data.status === 'error') throw auddError(data.error);
    const artist = data.result?.artist;
    const title = data.result?.title;
    if (!artist || !title) return [];
    return [{ score: 100, artist, title }];
  }

  /** Search AudD's lyrics index by a sung excerpt (or title/artist text). */
  async findLyrics(query: string): Promise<RecognitionMatch[]> {
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

    return dedupe(
      (data.result ?? [])
        .filter((r): r is { artist: string; title: string; lyrics?: string } =>
          Boolean(r.artist && r.title),
        )
        .filter((r) => lyricsMentionQuery(query, r.title, r.lyrics))
        .map((r) => ({ score: 0, artist: r.artist, title: r.title })),
    );
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
