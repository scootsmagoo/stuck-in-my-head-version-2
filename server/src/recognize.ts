import { isUsefulTranscript } from './lib/text.js';
import { lyricsToMatches, rankAndEnrich } from './rank.js';
import { AcrCloudProvider } from './providers/acrcloud.js';
import { AuddProvider } from './providers/audd.js';
import type { RankedMatch, RecognitionMatch, RecognitionProvider } from './providers/types.js';

const MAX_TRANSCRIPT_CHARS = 500;

export interface RecognizeResult {
  matches: RankedMatch[];
  heard: string | null;
}

interface Services {
  audd: AuddProvider;
  humming: RecognitionProvider[];
  hasToken: boolean;
}

let cached: Services | null = null;

/**
 * Providers are built lazily and memoized so that environment variables are
 * read on first use rather than at import time — dotenv (local) and Vercel's
 * injected env populate `process.env` at different points in startup.
 */
function services(): Services {
  if (cached) return cached;

  const apiToken = process.env.AUDD_API_TOKEN?.trim();
  if (!apiToken) {
    console.warn(
      '[recognize] AUDD_API_TOKEN is not set — using AudD anonymous access, ' +
        'limited to ~10 requests/day. Get a free token at https://dashboard.audd.io/',
    );
  }
  const audd = new AuddProvider(apiToken || 'test');

  const acrHost = process.env.ACRCLOUD_HOST?.trim();
  const acrKey = process.env.ACRCLOUD_ACCESS_KEY?.trim();
  const acrSecret = process.env.ACRCLOUD_ACCESS_SECRET?.trim();
  const acrcloud =
    acrHost && acrKey && acrSecret ? new AcrCloudProvider(acrHost, acrKey, acrSecret) : null;
  if (acrcloud) console.log('[recognize] ACRCloud humming provider enabled');

  cached = {
    audd,
    humming: [audd, ...(acrcloud ? [acrcloud] : [])],
    hasToken: Boolean(apiToken),
  };
  return cached;
}

export function health() {
  const { humming, hasToken } = services();
  return {
    ok: true,
    providers: humming.map((p) => p.name),
    hasToken,
    lyrics: hasToken,
  };
}

/**
 * Run a recording through every available signal — humming providers and the
 * lyrics index in parallel, audio fingerprinting only as a last resort — then
 * rank and enrich the candidates.
 */
export async function recognize(
  audio: Buffer,
  mimeType: string,
  rawTranscript: string,
): Promise<RecognizeResult> {
  const { audd, humming: providers } = services();
  const transcript = rawTranscript.trim().slice(0, MAX_TRANSCRIPT_CHARS);

  const [hummingSettled, lyrics] = await Promise.all([
    Promise.allSettled(providers.map((p) => p.recognizeHumming(audio, mimeType))),
    searchLyrics(audd, transcript),
  ]);

  const humming = mergeHumming(hummingSettled);
  let fingerprint: RecognitionMatch[] = [];

  if (humming.length === 0 && lyrics.length === 0) {
    try {
      fingerprint = await audd.recognizeFingerprint(audio, mimeType);
    } catch (err) {
      if (!isAuddFingerprintError(err)) throw err;
      console.warn('[recognize] audio fingerprinting failed:', err);
    }
  }

  const matches = await rankAndEnrich({ humming, lyrics, fingerprint });
  return { matches, heard: transcript || null };
}

async function searchLyrics(audd: AuddProvider, transcript: string): Promise<RecognitionMatch[]> {
  if (!isUsefulTranscript(transcript)) return [];
  try {
    return lyricsToMatches(await audd.findLyrics(transcript));
  } catch (err) {
    console.warn('[recognize] lyrics search failed:', err);
    return [];
  }
}

function mergeHumming(results: PromiseSettledResult<RecognitionMatch[]>[]): RecognitionMatch[] {
  const out: RecognitionMatch[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') {
      out.push(...r.value);
    } else if (!isAuddFingerprintError(r.reason)) {
      console.warn('[recognize] humming provider failed:', r.reason);
    } else {
      console.warn('[recognize] humming engine could not extract a melody');
    }
  }
  return out;
}

function isAuddFingerprintError(err: unknown): boolean {
  return err instanceof Error && /#300|#500/.test(err.message);
}
