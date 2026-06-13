---
agentmemory_version: "0.4.4"
timestamp: "2026-06-12T18:34:18Z"
author: "2355287-davecthomas"
branch: "main"
thread_id: "bootstrap000004"
turn_id: "bootstrap04"
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
  - "server/index.mjs"
  - "src/VoiceTranslator.jsx"
  - "README.md"
design_docs_touched:
  - "README.md"
verification:
  - "server/index.mjs:39-53: POST /api/translate accepts { text, srcLang, dstLang }; validates both langs are in SUPPORTED, rejects srcLang===dstLang, and rejects when neither side is 'en' ((srcLang !== 'en' && dstLang !== 'en'))."
  - "README.md §Ideas for iteration: 'Add more language pairs — the server contract ({ text, srcLang }) generalizes cleanly.'"
source_commits:
  - "5c67f70 (2026-06-12) initial commit — Hebrew ⇄ English live voice translator"
---

## Why

- The translate endpoint needs a stable request shape that survives adding languages without breaking the frontend. The project settles on a small JSON contract — `{ text, srcLang, dstLang }` — and an invariant that English is the pivot language: exactly one side of every translation must be `en`. This intentionally constrains the matrix to English-hub pairs (en⇄he, and any future en⇄X) rather than arbitrary N×N pairs, keeping prompt construction and quality assumptions tractable while the README's stated goal of "more language pairs" generalizes cleanly.

## What changed

- Canonical server contract for translation: `POST /api/translate` with body `{ text, srcLang, dstLang }`, where both codes must be in the server's `SUPPORTED` set, must differ, and must include `en` on one side. Requests violating the invariant are rejected with a 4xx describing the contract. This is the source-of-truth interface between the React frontend and the Express proxy, currently being extended on branch `add-languages-and-mobile-picker` from the README's original `{ text, srcLang }` shape to the explicit `{ text, srcLang, dstLang }` form.

## Evidence

- server/index.mjs:39-53: validates `srcLang`/`dstLang` against `SUPPORTED`, rejects equal codes, and rejects when neither side is `'en'`.
- server/index.mjs:30: `const SUPPORTED = Object.keys(LANG_NAMES)` — the language registry that bounds the contract.
- README.md §Ideas for iteration: "Add more language pairs — the server contract (`{ text, srcLang }`) generalizes cleanly."

## Next

- Promote to ADR as the canonical translate contract + English-pivot invariant. Future language additions extend `SUPPORTED`/`LANG_NAMES` but must preserve the one-side-must-be-English rule unless a deliberate superseding decision lifts it.
