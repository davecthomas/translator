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
| `start.sh` | One-command launcher (`./start.sh` or `npm run go`) |
| `src/VoiceTranslator.jsx` | Full UI: mic buttons, transcript cards, TTS, copy/export, typed fallback |
| `src/styles.css` | Design tokens, ambient background, animations |
| `src/main.jsx` | React entry point |
| `server/index.mjs` | Express proxy → Anthropic API (+ health check, static serving) |
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
