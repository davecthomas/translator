<div align="center">

# Kol · Hebrew Live Translator

**Real-time, bidirectional English ⇄ Hebrew voice translation in the browser.**

Speak into the mic in either language — Kol transcribes your speech, translates it with Claude, displays both sides, and reads the translation aloud.

`קול` *(kol)* — Hebrew for **voice**.

</div>

---

## Features

- 🎙 **Bidirectional voice** — one tap for English→Hebrew, one for Hebrew→English.
- 🔊 **Speaks translations aloud** with native text-to-speech (toggleable).
- ✍️ **Live transcription** with an animated waveform as you talk.
- ⌨️ **Type fallback** for browsers without speech recognition, or for pasting text.
- ⧉ **Copy & ▶ replay** any translation; **⤓ export** the whole conversation to a text file.
- 🔁 **One-tap retry** on any failed translation.
- 🎨 **Modern dark UI** — glassy cards, ambient gradients, full RTL handling, and the
  Frank Ruhl Libre serif for beautiful Hebrew typography.
- 🔐 **Key stays server-side** — the browser never sees your Anthropic API key.

## Architecture

```
Browser (Vite + React, port 5173)
  ├─ Web Speech API  → speech-to-text (en-US / he-IL)
  ├─ SpeechSynthesis → reads translations aloud
  └─ POST /api/translate
        │  (Vite dev proxy)
        ▼
Express proxy (port 3001)
  └─ @anthropic-ai/sdk → claude-sonnet-4-6
```

The Express layer exists for one reason: it keeps `ANTHROPIC_API_KEY` server-side, so the
key is never shipped to the browser.

## Prerequisites

- **Node.js 18+** (developed on Node 26)
- An **Anthropic API key** — get one at [console.anthropic.com](https://console.anthropic.com/)
- A **Chromium-based browser** (Chrome or Edge) for the best speech-recognition support

## Quick start

```bash
git clone https://github.com/davecthomas/hebrew-live-translator.git
cd hebrew-live-translator
cp .env.example .env          # then edit .env and paste your key
./start.sh
```

`./start.sh` is the one-liner launcher — it installs dependencies if needed, warns if no API
key is set, opens your browser, and starts the app. You can also run it as `npm run go`.

Grant microphone permission when the browser prompts you, and you're translating.

### Manual setup

If you'd rather run the steps yourself:

```bash
npm install
cp .env.example .env          # then edit .env and paste your key
# or just export it for the session:
export ANTHROPIC_API_KEY=sk-ant-...
npm run dev
```

Open **http://localhost:5173** and grant microphone permission when prompted.

> Either way, the server auto-loads `.env`, so you don't need to export the key manually.
> `npm run dev` runs the Vite frontend (5173) and the Express API (3001) together; the
> frontend proxies `/api/*` to the API, so you only ever open the 5173 URL.

## Production

```bash
npm run build      # bundles the frontend into dist/
npm start          # serves dist/ AND the API from a single port (3001)
```

Then open **http://localhost:3001**. Set `PORT` to serve elsewhere.

## Deploy to Vercel (free Hobby plan)

The repo is ready for Vercel out of the box. The same translation core (`server/translate-core.mjs`) powers both the local Express dev route and a Vercel serverless function (`api/translate.mjs`), so the contract can't drift between environments.

### Account-specific config stays out of git

**Nothing in this repository contains your Vercel account information**, and it should stay that way. The deploy is wired up through Vercel's web dashboard, not via committed files. Specifically:

- `.gitignore` excludes `.vercel/` — that directory is created by `vercel link` / `vercel pull` and contains your `projectId` and `orgId`. Even though those aren't passwords, they're account fingerprints — keep them local.
- The `ANTHROPIC_API_KEY` (the actual secret) is set in **Vercel → Project Settings → Environment Variables**, not in any file. For local dev, the same key goes in `.env` (also gitignored).
- There is no `vercel.json` and you do not need one — Vercel auto-detects Vite + the `api/` functions. If you choose to add one later for custom rewrites, keep it free of account IDs / tokens.
- The GitHub Action in this repo (`.github/workflows/build.yml`) only runs `npm ci && npm run build`. It does **not** deploy and does **not** need a `VERCEL_TOKEN` secret — deploys are triggered by Vercel's native GitHub integration, which uses your account's OAuth grant, not a token in CI.

If you ever do want CI-driven deploys (rather than Vercel's GitHub integration), the tokens (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`) belong in **GitHub → Settings → Secrets and variables → Actions**, never in committed files.

### One-time setup — scripted (recommended)

Two things only you can do (interactive, no script can automate them):

1. Sign up at [vercel.com](https://vercel.com) — the free **Hobby** tier covers this app.
2. `npx vercel login` — this opens a browser for OAuth.

Then everything else is one command:

```bash
npm run vercel:setup
```

The script (`scripts/setup-vercel.sh`) is idempotent and safe to re-run. It will:

- Verify you're logged into the Vercel CLI.
- `vercel link` this checkout to a Vercel project (creates the gitignored `.vercel/project.json`).
- Read `ANTHROPIC_API_KEY` from your shell environment or local `.env`.
- Upload it to **production**, **preview**, and **development** environment scopes, skipping any scope where it's already set.
- Trigger a production deploy.

Verify the deploy with `GET /api/health` on your deploy URL — it returns `{ ok: true, keyConfigured: true }` when the key is wired up.

Subsequent pushes to `main` deploy to prod via Vercel's GitHub integration; pull requests get preview URLs automatically.

### One-time setup — manual fallback

If you'd rather click through the dashboard:

1. **Import Project** → pick this GitHub repo. Vercel auto-detects Vite + the `api/` functions.
2. In **Project Settings → Environment Variables**, add `ANTHROPIC_API_KEY` (set for *all environments*).
3. Trigger the first deploy.

### Optional: link locally for `vercel dev`

`vercel dev` gives you the same serverless runtime locally as in production. Once you've run `npm run vercel:setup` (or `vercel link` directly), `vercel dev` works without any further setup. `.vercel/project.json` stays out of git.

## Configuration

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | — | Your Anthropic key. Read only by the server. |
| `PORT` | — | `3001` | Port the Express API/static server binds to. |

A quick health probe is available at **`GET /api/health`** — it reports whether the key is
configured, which is handy for deploy checks.

## Project layout

| Path | Purpose |
|---|---|
| `start.sh` | One-command local launcher (`./start.sh` or `npm run go`) |
| `scripts/setup-vercel.sh` | One-command Vercel setup (`npm run vercel:setup`) — idempotent |
| `src/VoiceTranslator.jsx` | Full UI: mic buttons, transcript cards, TTS, copy/export, typed fallback |
| `src/styles.css` | Design tokens, ambient background, animations |
| `src/main.jsx` | React entry point |
| `server/translate-core.mjs` | Shared translation logic (validation + Anthropic call) used by both transports |
| `server/index.mjs` | Local Express dev server → calls `translate-core` (+ health check, static serving) |
| `api/translate.mjs` | Vercel serverless function → calls `translate-core` |
| `api/health.mjs` | Vercel serverless function — `/api/health` deploy probe |
| `.github/workflows/build.yml` | CI: install + `vite build` on each PR and `main` push |
| `vite.config.js` | Dev server + `/api` proxy |
| `index.html` | Entry HTML; loads Inter + Frank Ruhl Libre |

## Browser support notes

- **Speech recognition** (`SpeechRecognition` / `webkitSpeechRecognition`): best in Chrome
  and Edge. Safari support is partial; Firefox lacks it. The **⌨ Type** fallback covers
  unsupported browsers.
- **Speech synthesis**: Hebrew voice quality varies by OS. macOS and Android ship a usable
  `he-IL` voice; Windows may need the Hebrew language pack installed.
- Mic access requires a **secure context**: `localhost` qualifies, but a LAN IP over plain
  HTTP will be blocked. Use a tunnel (e.g. `ngrok`) or HTTPS to test on a phone over the
  same network.

## Ideas for iteration

- Swap browser speech recognition for a server-side Whisper call to improve Hebrew accuracy.
- `continuous: true` recognition with voice-activity segmentation for hands-free mode.
- Stream translations via the Messages streaming endpoint to cut perceived latency.
- Add more language pairs — the server contract (`{ text, srcLang }`) generalizes cleanly.

## License

[MIT](./LICENSE)
