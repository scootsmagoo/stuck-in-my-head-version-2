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
npm run dev            # http://localhost:5173
```

That is the whole app — recognition runs in the browser. It works with no
configuration at all, on AudD's anonymous tier (~10 requests/day).

For the full 300-request quota locally, drop your own token in a `.env`:

```bash
cp .env.example .env   # then set VITE_AUDD_API_TOKEN
```

Optional extras:

- `npm run dev:server` also starts the Express app on :3001, which keeps the
  token out of the bundle and enables ACRCloud.
- `npm run typecheck` checks the server and serverless wrappers, which the
  client build does not cover.

Get a free AudD API token at [dashboard.audd.io](https://dashboard.audd.io/) —
300 free requests, no credit card.

Optional: add ACRCloud humming keys to `.env` from a humming-enabled project
at [console.acrcloud.com](https://console.acrcloud.com/) (14-day trial).

## Tips for good matches

- Sing the **vocal chorus**, not a guitar riff — riffs usually aren't in humming databases.
- Words help. Even messy lyrics let the app search a lyrics index.
- Off-key is fine; keep a steady rhythm for 10+ seconds.
- Coverage is best for popular songs.

## Deploying (free, on GitHub Pages)

The app runs entirely in the browser — AudD and the iTunes Search API both allow
cross-origin requests — so it deploys as static files with no server.

Pushing to `master` triggers [.github/workflows/deploy.yml](.github/workflows/deploy.yml),
which builds the client and publishes it. Enable it once under
**Settings → Pages → Source → GitHub Actions**, and the site lands at
`https://<user>.github.io/<repo>/`.

**No API token is deployed.** The published bundle falls back to AudD's
anonymous tier, roughly 10 requests per day — enough to demo, not to rely on.
Because Vite inlines `VITE_*` variables into the bundle at build time, adding
your token as a GitHub Actions secret would publish it to anyone who views
source. Keep it in your local `.env` only.

To lift that limit you need somewhere to hide the key, which means a server:
`server/` still holds an Express app wrapping the very same pipeline, and
`api/` holds serverless wrappers for it. Neither is used by the Pages build.

## Tips for good matches

- Sing the **vocal chorus**, not a guitar riff — riffs usually aren't in humming databases.
- Words help. Even messy lyrics let the app search a lyrics index.
- Off-key is fine; keep a steady rhythm for 10+ seconds.
- Coverage is best for popular songs.

## Deploying (free, on Vercel)

The repo is Vercel-ready: the client builds to static files and the two API
endpoints run as serverless functions that share the same pipeline code as the
local Express server.

1. Push to GitHub (already done if you cloned this repo).
2. At [vercel.com/new](https://vercel.com/new), import the repo. Leave every
   build setting alone — `vercel.json` supplies them.
3. Add an environment variable **`AUDD_API_TOKEN`** with your AudD token.
   Optionally add `ACRCLOUD_HOST` / `ACRCLOUD_ACCESS_KEY` / `ACRCLOUD_ACCESS_SECRET`.
4. Deploy. You get a free `https://<project>.vercel.app` domain, and every push
   to `master` redeploys.

Or from the CLI: `npx vercel login && npx vercel --prod`.

The microphone needs a secure context, which `*.vercel.app` provides. Note that
the deployed site is public — anyone with the URL spends your AudD quota.

## Project structure

```
shared/   The recognition pipeline: providers, ranking, iTunes enrichment.
          Isomorphic — takes a Blob, uses only fetch/FormData.
client/   React + Vite + TypeScript frontend. Bundles shared/ and runs it
          in the browser; this is what GitHub Pages serves.
server/   Optional Express app wrapping shared/, for hiding an API token.
          Also the only place ACRCloud can run (it signs with a secret).
api/      Optional serverless wrappers around the same pipeline.
```

Recordings are captured, downmixed to 16 kHz mono WAV, and passed straight to
the pipeline as a `Blob`.
