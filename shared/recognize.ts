import { AuddProvider } from './audd.js';
import { lyricsToMatches, rankAndEnrich } from './rank.js';
import { isUsefulTranscript } from './text.js';
import type { RankedMatch, RecognitionMatch, RecognitionProvider } from './types.js';

const MAX_TRANSCRIPT_CHARS = 500;

/** AudD's keyless tier — no account, roughly 10 requests per day. */
export const ANONYMOUS_TOKEN = 'test';

export interface RecognizeResult {
  matches: RankedMatch[];
  heard: string | null;
}

export interface RecognizeOptions {
  /** AudD API token. Omit for anonymous access. */
  apiToken?: string;
  /**
   * Additional humming engines. ACRCloud lives here rather than inline because
   * it signs requests with Node's crypto and a secret, so it can only run on a
   * server — the browser build gets AudD alone.
   */
  extraProviders?: RecognitionProvider[];
}

/**
 * Run a recording through every available signal — humming engines and the
 * lyrics index in parallel, audio fingerprinting only as a last resort — then
 * rank and enrich the candidates.
 *
 * Everything here is isomorphic: it takes a Blob and uses only fetch/FormData,
 * so the same pipeline runs in the browser and behind the Express server.
 */
export async function recognize(
  audio: Blob,
  rawTranscript: string,
  options: RecognizeOptions = {},
): Promise<RecognizeResult> {
  const audd = new AuddProvider(options.apiToken?.trim() || ANONYMOUS_TOKEN);
  const providers: RecognitionProvider[] = [audd, ...(options.extraProviders ?? [])];
  const transcript = rawTranscript.trim().slice(0, MAX_TRANSCRIPT_CHARS);

  const [hummingSettled, lyrics] = await Promise.all([
    Promise.allSettled(providers.map((p) => p.recognizeHumming(audio))),
    searchLyrics(audd, transcript),
  ]);

  const humming = mergeHumming(hummingSettled);
  let fingerprint: RecognitionMatch[] = [];

  if (humming.length === 0 && lyrics.length === 0) {
    try {
      fingerprint = await audd.recognizeFingerprint(audio);
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
