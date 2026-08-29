# Stuck In My Head

Got a song stuck in your head but can't name it? Hum, sing, or whistle the
melody into your microphone and the app returns its best guesses, ranked by
likelihood, with album art.

## How it works

1. The browser records ~10–20 seconds of your voice with the MediaRecorder API.
2. The recording is sent to the backend, which forwards it to
   [AudD's humming recognition endpoint](https://docs.audd.io/) (`recognizeWithOffset`).
   Melody matching works on pitch contour, so off-key singing and wrong lyrics
   are fine — humming and whistling work too.
3. Matches are enriched with album name, artwork, and a 30-second preview via
   the iTunes Search API (no key required), then shown ranked by confidence.

## Setup

```bash
npm install
cp .env.example .env   # then paste your AudD token into .env
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

Get a free AudD API token at [dashboard.audd.io](https://dashboard.audd.io/) —
300 free requests, no credit card. Without a token the app uses AudD's
anonymous access (roughly 10 requests/day), which is enough to try it out.

## Tips for good matches

- Hum the **chorus or hook** — the most recognizable part of the melody.
- Give it **10+ seconds** of continuous melody.
- Don't worry about key, lyrics, or vocal quality; steady rhythm matters most.
- Coverage is best for popular songs; obscure tracks may not be in the
  humming database.

## Project structure

```
client/   React + Vite + TypeScript frontend (record UI, results screen)
server/   Node + Express + TypeScript API (provider abstraction, enrichment)
```

The backend exposes a plain REST endpoint (`POST /api/recognize`, multipart
audio upload), so a future native mobile app can use the same server as-is.
Recognition providers implement a small interface (`server/src/providers/`),
so ACRCloud or another engine can be swapped in later.
