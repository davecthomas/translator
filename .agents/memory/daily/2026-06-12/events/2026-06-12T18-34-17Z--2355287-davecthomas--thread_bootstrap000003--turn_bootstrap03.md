---
agentmemory_version: "0.4.4"
timestamp: "2026-06-12T18:34:17Z"
author: "2355287-davecthomas"
branch: "main"
thread_id: "bootstrap000003"
turn_id: "bootstrap03"
workstream_id: "bootstrap-foundational-decisions"
workstream_scope: "repo"
decision_candidate: true
bootstrapped_at: "2026-06-13T13:29:57Z"
enriched: true
ai_generated: true
ai_model: "claude-unknown"
ai_tool: "claude"
ai_surface: "claude-code"
ai_executor: "local-agent"
related_adrs:
files_touched:
  - "src/VoiceTranslator.jsx"
  - "README.md"
design_docs_touched:
  - "README.md"
verification:
  - "README.md §Architecture: 'Web Speech API → speech-to-text (en-US / he-IL)' and 'SpeechSynthesis → reads translations aloud'."
  - "README.md §Browser support notes documents the accepted limitation and the ⌨ Type fallback for unsupported browsers."
  - "README.md §Ideas for iteration names the deferred alternative: 'Swap browser speech recognition for a server-side Whisper call to improve Hebrew accuracy.'"
source_commits:
  - "5c67f70 (2026-06-12) initial commit — Hebrew ⇄ English live voice translator"
---

## Why

- Speech capture and playback can live either in the browser (free, zero-infra, but uneven quality and browser-dependent) or on the server (consistent, e.g. Whisper, but cost + latency + infra). The project deliberately chooses browser-native speech I/O for the initial product: the Web Speech API for STT and `SpeechSynthesis` for TTS. This keeps the backend a thin key-holding proxy (see the server-side-key boundary decision) and ships nothing audio-related to the server. The known cost — partial Safari support, no Firefox STT, OS-dependent Hebrew voice quality — is accepted and mitigated with a typed fallback rather than solved with server infra.

## What changed

- Established browser-native speech as the I/O layer: `SpeechRecognition`/`webkitSpeechRecognition` for transcription (`en-US`/`he-IL`) and `SpeechSynthesis` for reading translations aloud, both toggleable. A `⌨ Type` fallback is a first-class part of the contract so browsers lacking speech recognition (or pasted text) still work. The accepted tradeoff is documented, and server-side Whisper is explicitly recorded as the deferred upgrade path.

## Evidence

- README.md §Architecture: browser box lists `Web Speech API → speech-to-text` and `SpeechSynthesis → reads translations aloud`.
- README.md §Features: live transcription, speaks-aloud toggle, and "⌨️ Type fallback for browsers without speech recognition."
- README.md §Browser support notes: documents Chrome/Edge as best, Safari partial, Firefox lacking, OS-dependent Hebrew TTS, and secure-context requirement for mic access.
- README.md §Ideas for iteration: server-side Whisper named as the accuracy-improving alternative, confirming this was a conscious tradeoff, not an oversight.

## Next

- Promote to ADR as the speech-I/O boundary + accepted tradeoff. Revisit if/when Hebrew STT accuracy complaints justify the server-side Whisper path, which would shift audio across the browser/server boundary and change the proxy's role.
