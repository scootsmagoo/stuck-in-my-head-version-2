import { recognize, type RecognizeResult } from '../../shared/recognize.js';
import type { RecognitionProvider } from '../../shared/types.js';
import { AcrCloudProvider } from './providers/acrcloud.js';

/**
 * Server-side wrapper around the shared pipeline: reads credentials from the
 * environment and adds ACRCloud, which needs a secret and Node's crypto and so
 * cannot run in the browser build.
 *
 * Env is read per call rather than at import time so dotenv has always run.
 */
function config(): { apiToken?: string; melodyProviders: RecognitionProvider[] } {
  const apiToken = process.env.AUDD_API_TOKEN?.trim();

  const host = process.env.ACRCLOUD_HOST?.trim();
  const key = process.env.ACRCLOUD_ACCESS_KEY?.trim();
  const secret = process.env.ACRCLOUD_ACCESS_SECRET?.trim();
  const acrcloud = host && key && secret ? new AcrCloudProvider(host, key, secret) : null;

  return { apiToken, melodyProviders: acrcloud ? [acrcloud] : [] };
}

export function health() {
  const { apiToken, melodyProviders } = config();
  return {
    ok: true,
    fingerprint: 'audd',
    lyrics: 'audd',
    melody: melodyProviders.map((p) => p.name),
    hasToken: Boolean(apiToken),
  };
}

export function nodeRecognize(audio: Blob, transcript: string): Promise<RecognizeResult> {
  return recognize(audio, transcript, config());
}
