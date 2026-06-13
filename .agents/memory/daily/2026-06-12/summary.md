# 2026-06-12 summary

## Snapshot

- Captured 4 memory events.
- Main work: Established an Express proxy (`server/index.mjs`) whose sole architectural justification is to keep `ANTHROPIC_API_KEY` server-side. The browser never receives the key and never talks to the Anthropic API directly — it only issues `POST /api/translate` (proxied via Vite in dev). A `GET /api/health` endpoint reports whether the key is configured without exposing it.
- Top decision: The Anthropic API key is a secret with direct billing/abuse exposure. Shipping it to a browser bundle would leak it to every client. The project accepts the cost of running a dedicated backend purely to hold that key server-side, rather than the simpler key-in-frontend approach. This is the foundational security boundary the whole topology is organized around. ([2026-06-12 18:34:15 UTC by 2355287-davecthomas](events/2026-06-12T18-34-15Z--2355287-davecthomas--thread_bootstrap000001--turn_bootstrap01.md))
- Blockers: None.

| Metric | Value |
|---|---|
| Memory events captured | 4 |
| Repo files changed | 4 |
| Decision candidates | 4 |
| Active blockers | 0 |

## Major work completed

- Established an Express proxy (`server/index.mjs`) whose sole architectural justification is to keep `ANTHROPIC_API_KEY` server-side. The browser never receives the key and never talks to the Anthropic API directly — it only issues `POST /api/translate` (proxied via Vite in dev). A `GET /api/health` endpoint reports whether the key is configured without exposing it.
- The translation engine is the Anthropic Claude model `claude-sonnet-4-6`, invoked through `@anthropic-ai/sdk` exclusively from the server proxy. This is the single source of translation truth; the frontend contributes only speech capture, display, and TTS.
- Established browser-native speech as the I/O layer: `SpeechRecognition`/`webkitSpeechRecognition` for transcription (`en-US`/`he-IL`) and `SpeechSynthesis` for reading translations aloud, both toggleable. A `⌨ Type` fallback is a first-class part of the contract so browsers lacking speech recognition (or pasted text) still work. The accepted tradeoff is documented, and server-side Whisper is explicitly recorded as the deferred upgrade path.
- Canonical server contract for translation: `POST /api/translate` with body `{ text, srcLang, dstLang }`, where both codes must be in the server's `SUPPORTED` set, must differ, and must include `en` on one side. Requests violating the invariant are rejected with a 4xx describing the contract. This is the source-of-truth interface between the React frontend and the Express proxy, currently being extended on branch `add-languages-and-mobile-picker` from the README's original `{ text, srcLang }` shape to the explicit `{ text, srcLang, dstLang }` form.

## Why this mattered

- The Anthropic API key is a secret with direct billing/abuse exposure. Shipping it to a browser bundle would leak it to every client. The project accepts the cost of running a dedicated backend purely to hold that key server-side, rather than the simpler key-in-frontend approach. This is the foundational security boundary the whole topology is organized around.
- Translation quality is the core value of the product, and Hebrew ⇄ English is harder than mainstream pairs. The project commits to an LLM-based translator (Anthropic Claude via `@anthropic-ai/sdk`) rather than a rules-based or dedicated MT service, accepting LLM latency/cost in exchange for context-aware, idiomatic translation. The model is pinned (`claude-sonnet-4-6`) so behavior is reproducible.
- Speech capture and playback can live either in the browser (free, zero-infra, but uneven quality and browser-dependent) or on the server (consistent, e.g. Whisper, but cost + latency + infra). The project deliberately chooses browser-native speech I/O for the initial product: the Web Speech API for STT and `SpeechSynthesis` for TTS. This keeps the backend a thin key-holding proxy (see the server-side-key boundary decision) and ships nothing audio-related to the server. The known cost — partial Safari support, no Firefox STT, OS-dependent Hebrew voice quality — is accepted and mitigated with a typed fallback rather than solved with server infra.
- The translate endpoint needs a stable request shape that survives adding languages without breaking the frontend. The project settles on a small JSON contract — `{ text, srcLang, dstLang }` — and an invariant that English is the pivot language: exactly one side of every translation must be `en`. This intentionally constrains the matrix to English-hub pairs (en⇄he, and any future en⇄X) rather than arbitrary N×N pairs, keeping prompt construction and quality assumptions tractable while the README's stated goal of "more language pairs" generalizes cleanly.

## Active blockers

- None

## Decision candidates

- The Anthropic API key is a secret with direct billing/abuse exposure. Shipping it to a browser bundle would leak it to every client. The project accepts the cost of running a dedicated backend purely to hold that key server-side, rather than the simpler key-in-frontend approach. This is the foundational security boundary the whole topology is organized around. ([2026-06-12 18:34:15 UTC by 2355287-davecthomas](events/2026-06-12T18-34-15Z--2355287-davecthomas--thread_bootstrap000001--turn_bootstrap01.md))
- Translation quality is the core value of the product, and Hebrew ⇄ English is harder than mainstream pairs. The project commits to an LLM-based translator (Anthropic Claude via `@anthropic-ai/sdk`) rather than a rules-based or dedicated MT service, accepting LLM latency/cost in exchange for context-aware, idiomatic translation. The model is pinned (`claude-sonnet-4-6`) so behavior is reproducible. ([2026-06-12 18:34:16 UTC by 2355287-davecthomas](events/2026-06-12T18-34-16Z--2355287-davecthomas--thread_bootstrap000002--turn_bootstrap02.md))
- Speech capture and playback can live either in the browser (free, zero-infra, but uneven quality and browser-dependent) or on the server (consistent, e.g. Whisper, but cost + latency + infra). The project deliberately chooses browser-native speech I/O for the initial product: the Web Speech API for STT and `SpeechSynthesis` for TTS. This keeps the backend a thin key-holding proxy (see the server-side-key boundary decision) and ships nothing audio-related to the server. The known cost — partial Safari support, no Firefox STT, OS-dependent Hebrew voice quality — is accepted and mitigated with a typed fallback rather than solved with server infra. ([2026-06-12 18:34:17 UTC by 2355287-davecthomas](events/2026-06-12T18-34-17Z--2355287-davecthomas--thread_bootstrap000003--turn_bootstrap03.md))
- The translate endpoint needs a stable request shape that survives adding languages without breaking the frontend. The project settles on a small JSON contract — `{ text, srcLang, dstLang }` — and an invariant that English is the pivot language: exactly one side of every translation must be `en`. This intentionally constrains the matrix to English-hub pairs (en⇄he, and any future en⇄X) rather than arbitrary N×N pairs, keeping prompt construction and quality assumptions tractable while the README's stated goal of "more language pairs" generalizes cleanly. ([2026-06-12 18:34:18 UTC by 2355287-davecthomas](events/2026-06-12T18-34-18Z--2355287-davecthomas--thread_bootstrap000004--turn_bootstrap04.md))

## Next likely steps

- Promote to ADR as the canonical secret-handling boundary. Any future feature that is tempted to call Anthropic (or any keyed API) directly from the browser must be rejected against this decision.
- Kept as a decision candidate rather than promoted immediately: the specific model id is expected to churn across releases, so the durable invariant ("LLM translation via Claude behind the proxy") may warrant an ADR while the exact version stays in config. Revisit when migrating models or adding streaming (README §Ideas for iteration).
- Promote to ADR as the speech-I/O boundary + accepted tradeoff. Revisit if/when Hebrew STT accuracy complaints justify the server-side Whisper path, which would shift audio across the browser/server boundary and change the proxy's role.
- Promote to ADR as the canonical translate contract + English-pivot invariant. Future language additions extend `SUPPORTED`/`LANG_NAMES` but must preserve the one-side-must-be-English rule unless a deliberate superseding decision lifts it.

## Relevant event shards

- [2026-06-12 18:34:15 UTC by 2355287-davecthomas](events/2026-06-12T18-34-15Z--2355287-davecthomas--thread_bootstrap000001--turn_bootstrap01.md)
- [2026-06-12 18:34:16 UTC by 2355287-davecthomas](events/2026-06-12T18-34-16Z--2355287-davecthomas--thread_bootstrap000002--turn_bootstrap02.md)
- [2026-06-12 18:34:17 UTC by 2355287-davecthomas](events/2026-06-12T18-34-17Z--2355287-davecthomas--thread_bootstrap000003--turn_bootstrap03.md)
- [2026-06-12 18:34:18 UTC by 2355287-davecthomas](events/2026-06-12T18-34-18Z--2355287-davecthomas--thread_bootstrap000004--turn_bootstrap04.md)
