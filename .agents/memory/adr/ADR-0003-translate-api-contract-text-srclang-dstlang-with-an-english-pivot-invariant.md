# ADR-0003 Translate API contract {text, srcLang, dstLang} with an English-pivot invariant

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

Purpose: Translate API contract {text, srcLang, dstLang} with an English-pivot invariant
Derived from: [2026-06-12T18-34-18Z--2355287-davecthomas--thread_bootstrap000004--turn_bootstrap04](../daily/2026-06-12/events/2026-06-12T18-34-18Z--2355287-davecthomas--thread_bootstrap000004--turn_bootstrap04.md)

## Context

- The translate endpoint needs a stable request shape that survives adding languages without breaking the frontend. The project settles on a small JSON contract — `{ text, srcLang, dstLang }` — and an invariant that English is the pivot language: exactly one side of every translation must be `en`. This intentionally constrains the matrix to English-hub pairs (en⇄he, and any future en⇄X) rather than arbitrary N×N pairs, keeping prompt construction and quality assumptions tractable while the README's stated goal of "more language pairs" generalizes cleanly.

## Decision

- Canonical server contract for translation: `POST /api/translate` with body `{ text, srcLang, dstLang }`, where both codes must be in the server's `SUPPORTED` set, must differ, and must include `en` on one side. Requests violating the invariant are rejected with a 4xx describing the contract. This is the source-of-truth interface between the React frontend and the Express proxy, currently being extended on branch `add-languages-and-mobile-picker` from the README's original `{ text, srcLang }` shape to the explicit `{ text, srcLang, dstLang }` form.

## Consequences

- Promote to ADR as the canonical translate contract + English-pivot invariant. Future language additions extend `SUPPORTED`/`LANG_NAMES` but must preserve the one-side-must-be-English rule unless a deliberate superseding decision lifts it.

## Source memory events

- [2026-06-12T18-34-18Z--2355287-davecthomas--thread_bootstrap000004--turn_bootstrap04](../daily/2026-06-12/events/2026-06-12T18-34-18Z--2355287-davecthomas--thread_bootstrap000004--turn_bootstrap04.md)

## Related code paths

- server/index.mjs
- src/VoiceTranslator.jsx
- README.md
