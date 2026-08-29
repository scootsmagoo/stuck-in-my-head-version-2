# Stuck In My Head

Got a song stuck in your head but can't name it? Hum, sing, or whistle the
melody into your microphone and the app returns its best guesses, ranked by
likelihood, with album art.

## How it works

1. The browser records ~10–20 seconds of your voice and, in Chromium browsers,
   live-captions any words you sing.
2. The backend sends the recording to [AudD humming recognition](https://docs.audd.io/)
   (`recognizeWithOffset`), and optionally to [ACRCloud](https://www.acrcloud.com/humming-recognition/)
   if those keys are set.
3. Sung words are searched against AudD's lyrics index.
4. Candidates are collapsed by song title, boosted when melody and lyrics agree,
   and rewritten to the canonical recording (popular original, not a karaoke
   cover) via the iTunes Search API.

## Setup

```bash
npm install
cp .env.example .env   # then paste your AudD token into .env
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

Get a free AudD API token at [dashboard.audd.io](https://dashboard.audd.io/) —
300 free requests, no credit card.

Optional: add ACRCloud humming keys to `.env` from a humming-enabled project
at [console.acrcloud.com](https://console.acrcloud.com/) (14-day trial).

## Tips for good matches

- Sing the **vocal chorus**, not a guitar riff — riffs usually aren't in humming databases.
- Words help. Even messy lyrics let the app search a lyrics index.
- Off-key is fine; keep a steady rhythm for 10+ seconds.
- Coverage is best for popular songs.

## Project structure

```
client/   React + Vite + TypeScript frontend (record UI, results screen)
server/   Node + Express + TypeScript API (providers, ranking, enrichment)
```
