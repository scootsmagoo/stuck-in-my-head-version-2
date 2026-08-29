import type { RecognitionMatch, RecognitionProvider } from './types.js';

const AUDD_HUMMING_URL = 'https://api.audd.io/recognizeWithOffset/';

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

  async recognizeHumming(audio: Buffer, mimeType: string): Promise<RecognitionMatch[]> {
    const form = new FormData();
    form.append('api_token', this.apiToken);
    form.append('file', new Blob([new Uint8Array(audio)], { type: mimeType }), 'recording');

    const res = await fetch(AUDD_HUMMING_URL, { method: 'POST', body: form });
    if (!res.ok) {
      throw new Error(`AudD request failed with HTTP ${res.status}`);
    }

    const data = (await res.json()) as AuddHummingResponse;
    if (data.status === 'error') {
      const { error_code, error_message } = data.error ?? {
        error_code: -1,
        error_message: 'unknown error',
      };
      throw new Error(`AudD error #${error_code}: ${error_message}`);
    }

    const list = data.result?.list ?? [];
    return dedupe(list).sort((a, b) => b.score - a.score);
  }
}

/**
 * AudD's humming DB often contains near-duplicate entries of the same song
 * (e.g. "Last Christmas" by "Taylor Swift" and "TAYLOR SWIFT"). Keep only the
 * highest-scoring entry per normalized artist+title.
 */
function dedupe(matches: RecognitionMatch[]): RecognitionMatch[] {
  const seen = new Map<string, RecognitionMatch>();
  for (const m of matches) {
    const key = `${normalize(m.artist)}|${normalize(m.title)}`;
    const existing = seen.get(key);
    if (!existing || m.score > existing.score) {
      seen.set(key, m);
    }
  }
  return [...seen.values()];
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/[^a-z0-9]/g, '');
}
