import type { IncomingMessage, ServerResponse } from 'node:http';
import { nodeRecognize } from '../server/src/node-recognize.js';
import { readBody, sendJson } from './_http.js';

export default async function handler(
  req: IncomingMessage & { body?: unknown },
  res: ServerResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  try {
    const audio = await readBody(req);
    if (!audio.length) {
      sendJson(res, 400, { error: 'No audio uploaded — POST the recording as the raw body.' });
      return;
    }

    const url = new URL(req.url ?? '/', 'http://localhost');
    const mime = req.headers['content-type'] || 'audio/wav';
    const blob = new Blob([new Uint8Array(audio)], { type: mime });
    sendJson(res, 200, await nodeRecognize(blob, url.searchParams.get('lyrics') ?? ''));
  } catch (err) {
    console.error('[api] recognition failed:', err);
    sendJson(res, 502, {
      error: err instanceof Error ? err.message : 'Recognition failed.',
    });
  }
}
