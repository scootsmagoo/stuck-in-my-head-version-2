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
  /**
   * Whether a real melody engine took part. False means nothing in this run
   * could match a hummed tune, so a miss says nothing about the humming — the
   * UI should say so rather than implying the melody was searched and lost.
   */
  melodySearched: boolean;
}

export interface RecognizeOptions {
  /** AudD API token. Omit for anonymous access. */
  apiToken?: string;
  /**
   * Engines that match a hummed or sung melody. AudD is deliberately not one:
   * both of its recognition endpoints are acoustic fingerprinting and cannot
   * match humming at all. ACRCloud can, but signs requests with a secret and
   * Node's crypto, so it is only available to server-side callers.
   */
  melodyProviders?: RecognitionProvider[];
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
  const melodyProviders = options.melodyProviders ?? [];
  const transcript = rawTranscript.trim().slice(0, MAX_TRANSCRIPT_CHARS);

  const [melodySettled, lyrics] = await Promise.all([
    Promise.allSettled(melodyProviders.map((p) => p.recognizeHumming(audio))),
    searchLyrics(audd, transcript),
  ]);
  const melody = collectMelody(melodySettled);

  // Fingerprinting only runs when nothing else found anything. It answers a
  // different question — "is this song playing right now?" — and costs a
  // request, which matters most on the keyless tier.
  let fingerprint: RecognitionMatch[] = [];
  if (melody.length === 0 && lyrics.length === 0) {
    try {
      fingerprint = await audd.recognizeFingerprint(audio);
    } catch (err) {
      if (!isFingerprintFailure(err)) throw err;
      console.warn('[recognize] no fingerprint match:', err);
    }
  }

  const matches = await rankAndEnrich({ humming: melody, lyrics, fingerprint });
  return { matches, heard: transcript || null, melodySearched: melodyProviders.length > 0 };
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

function collectMelody(results: PromiseSettledResult<RecognitionMatch[]>[]): RecognitionMatch[] {
  const out: RecognitionMatch[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') out.push(...r.value);
    else console.warn('[recognize] melody provider failed:', r.reason);
  }
  return out;
}

/**
 * AudD #300 is a fingerprinting failure and #500 an unreadable file. Neither
 * is an outage, so both mean "no match" rather than an error worth surfacing.
 */
function isFingerprintFailure(err: unknown): boolean {
  return err instanceof Error && /#300|#500/.test(err.message);
}
