import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { health, nodeRecognize } from './node-recognize.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const PORT = Number(process.env.PORT) || 3001;

const app = express();
app.use(cors());
// The recording arrives as the raw request body; see api/recognize.ts for the
// deployed equivalent.
app.use(express.raw({ type: '*/*', limit: '10mb' }));

app.get('/api/health', (_req, res) => {
  res.json(health());
});

app.post('/api/recognize', async (req, res) => {
  const audio = Buffer.isBuffer(req.body) ? req.body : null;
  if (!audio?.length) {
    res.status(400).json({ error: 'No audio uploaded — POST the recording as the raw body.' });
    return;
  }

  try {
    const mime = req.headers['content-type'] || 'audio/wav';
    const blob = new Blob([new Uint8Array(audio)], { type: mime });
    res.json(await nodeRecognize(blob, String(req.query.lyrics ?? '')));
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
