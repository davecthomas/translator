# ADR-0002 Browser-native speech I/O with a typed fallback; server-side Whisper deferred

Status: accepted
Date: 2026-06-12
Owners: 2355287-davecthomas
Must read: true
Supersedes: 
Superseded by: 
ai-generated: True
ai-model: claude-unknown
ai-tool: claude
ai-surface: claude-code
ai-executor: local-agent

Purpose: Browser-native speech I/O with a typed fallback; server-side Whisper deferred
Derived from: [2026-06-12T18-34-17Z--2355287-davecthomas--thread_bootstrap000003--turn_bootstrap03](../daily/2026-06-12/events/2026-06-12T18-34-17Z--2355287-davecthomas--thread_bootstrap000003--turn_bootstrap03.md)

## Context

- Speech capture and playback can live either in the browser (free, zero-infra, but uneven quality and browser-dependent) or on the server (consistent, e.g. Whisper, but cost + latency + infra). The project deliberately chooses browser-native speech I/O for the initial product: the Web Speech API for STT and `SpeechSynthesis` for TTS. This keeps the backend a thin key-holding proxy (see the server-side-key boundary decision) and ships nothing audio-related to the server. The known cost — partial Safari support, no Firefox STT, OS-dependent Hebrew voice quality — is accepted and mitigated with a typed fallback rather than solved with server infra.

## Decision

- Established browser-native speech as the I/O layer: `SpeechRecognition`/`webkitSpeechRecognition` for transcription (`en-US`/`he-IL`) and `SpeechSynthesis` for reading translations aloud, both toggleable. A `⌨ Type` fallback is a first-class part of the contract so browsers lacking speech recognition (or pasted text) still work. The accepted tradeoff is documented, and server-side Whisper is explicitly recorded as the deferred upgrade path.

## Consequences

- Promote to ADR as the speech-I/O boundary + accepted tradeoff. Revisit if/when Hebrew STT accuracy complaints justify the server-side Whisper path, which would shift audio across the browser/server boundary and change the proxy's role.

## Source memory events

- [2026-06-12T18-34-17Z--2355287-davecthomas--thread_bootstrap000003--turn_bootstrap03](../daily/2026-06-12/events/2026-06-12T18-34-17Z--2355287-davecthomas--thread_bootstrap000003--turn_bootstrap03.md)

## Related code paths

- src/VoiceTranslator.jsx
- README.md
