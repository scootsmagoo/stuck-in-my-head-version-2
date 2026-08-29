import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import multer from 'multer';
import { isUsefulTranscript } from './lib/text.js';
import { lyricsToMatches, rankAndEnrich } from './rank.js';
import { AcrCloudProvider } from './providers/acrcloud.js';
import { AuddProvider } from './providers/audd.js';
import type { RecognitionMatch, RecognitionProvider } from './providers/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const PORT = Number(process.env.PORT) || 3001;

const apiToken = process.env.AUDD_API_TOKEN?.trim();
if (!apiToken) {
  console.warn(
    '[server] AUDD_API_TOKEN is not set — using AudD anonymous access, ' +
      'limited to ~10 requests/day. Get a free token at https://dashboard.audd.io/',
  );
}
const audd = new AuddProvider(apiToken || 'test');

const acrHost = process.env.ACRCLOUD_HOST?.trim();
const acrKey = process.env.ACRCLOUD_ACCESS_KEY?.trim();
const acrSecret = process.env.ACRCLOUD_ACCESS_SECRET?.trim();
const acrcloud =
  acrHost && acrKey && acrSecret ? new AcrCloudProvider(acrHost, acrKey, acrSecret) : null;
if (acrcloud) console.log('[server] ACRCloud humming provider enabled');

const hummingProviders: RecognitionProvider[] = [audd, ...(acrcloud ? [acrcloud] : [])];

const app = express();
app.use(cors());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    providers: hummingProviders.map((p) => p.name),
    hasToken: Boolean(apiToken),
    lyrics: Boolean(apiToken),
  });
});

app.post('/api/recognize', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No audio file uploaded (expected field "audio").' });
    return;
  }

  const mime = req.file.mimetype || 'audio/wav';
  const transcript = String(req.body?.lyrics ?? '').trim();

  try {
    const [hummingSettled, lyricsMatches] = await Promise.all([
      Promise.allSettled(hummingProviders.map((p) => p.recognizeHumming(req.file!.buffer, mime))),
      searchLyrics(transcript),
    ]);

    const humming = mergeHumming(hummingSettled);
    let fingerprint: RecognitionMatch[] = [];

    if (humming.length === 0 && lyricsMatches.length === 0) {
      try {
        fingerprint = await audd.recognizeFingerprint(req.file.buffer, mime);
      } catch (err) {
        if (!isAuddFingerprintError(err)) throw err;
        console.warn('[server] audio fingerprinting failed:', err);
      }
    }

    const matches = await rankAndEnrich({ humming, lyrics: lyricsMatches, fingerprint });
    res.json({ matches, heard: transcript || null });
  } catch (err) {
    console.error('[server] recognition failed:', err);
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Recognition failed.',
    });
  }
});

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});

async function searchLyrics(transcript: string): Promise<RecognitionMatch[]> {
  if (!isUsefulTranscript(transcript)) return [];
  try {
    return lyricsToMatches(await audd.findLyrics(transcript));
  } catch (err) {
    console.warn('[server] lyrics search failed:', err);
    return [];
  }
}

function mergeHumming(results: PromiseSettledResult<RecognitionMatch[]>[]): RecognitionMatch[] {
  const out: RecognitionMatch[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') {
      out.push(...r.value);
    } else if (!isAuddFingerprintError(r.reason)) {
      console.warn('[server] humming provider failed:', r.reason);
    } else {
      console.warn('[server] humming engine could not extract a melody');
    }
  }
  return out;
}

function isAuddFingerprintError(err: unknown): boolean {
  return err instanceof Error && /#300|#500/.test(err.message);
}
