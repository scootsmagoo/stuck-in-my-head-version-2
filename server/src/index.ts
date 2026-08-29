import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import multer from 'multer';
import { lookupTrackDetails } from './enrich/itunes.js';
import { AuddProvider } from './providers/audd.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const PORT = Number(process.env.PORT) || 3001;
const MAX_MATCHES = 5;

const apiToken = process.env.AUDD_API_TOKEN?.trim();
if (!apiToken) {
  console.warn(
    '[server] AUDD_API_TOKEN is not set — using AudD anonymous access, ' +
      'limited to ~10 requests/day. Get a free token at https://dashboard.audd.io/',
  );
}
const provider = new AuddProvider(apiToken || 'test');

const app = express();
app.use(cors());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // AudD's standard endpoint cap
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, provider: provider.name, hasToken: Boolean(apiToken) });
});

app.post('/api/recognize', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No audio file uploaded (expected field "audio").' });
    return;
  }

  try {
    const matches = await provider.recognizeHumming(
      req.file.buffer,
      req.file.mimetype || 'audio/webm',
    );

    const top = matches.slice(0, MAX_MATCHES);
    const enriched = await Promise.all(
      top.map(async (m) => ({ ...m, ...(await lookupTrackDetails(m.artist, m.title)) })),
    );

    res.json({ matches: enriched });
  } catch (err) {
    console.error('[server] recognition failed:', err);
    const message = err instanceof Error ? err.message : 'Recognition failed.';

    // AudD's #300 fingerprinting error is what anonymous (token-less) access
    // returns for hummed/sung input: without a registered token the request
    // appears to fall back to regular fingerprinting, which can't process a
    // hummed melody.
    if (!apiToken && message.includes('#300')) {
      res.status(502).json({
        error:
          'Humming recognition needs a (free) AudD API token — anonymous access ' +
          'only supports matching original recordings, not hummed melodies. ' +
          'Get a token at dashboard.audd.io and add it to .env as AUDD_API_TOKEN.',
      });
      return;
    }

    res.status(502).json({ error: message });
  }
});

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});
