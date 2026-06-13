---
agentmemory_version: "0.4.4"
timestamp: "2026-06-12T18:34:15Z"
author: "2355287-davecthomas"
branch: "main"
thread_id: "bootstrap000001"
turn_id: "bootstrap01"
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
  - "README.md"
design_docs_touched:
  - "README.md"
verification:
  - "README.md §Architecture: 'The Express layer exists for one reason: it keeps ANTHROPIC_API_KEY server-side, so the key is never shipped to the browser.'"
  - "server/index.mjs: PORT-bound Express app reads the key from process.env and is the only component holding the @anthropic-ai/sdk client; the browser only ever calls POST /api/translate."
source_commits:
  - "5c67f70 (2026-06-12) initial commit — Hebrew ⇄ English live voice translator"
---

## Why

- The Anthropic API key is a secret with direct billing/abuse exposure. Shipping it to a browser bundle would leak it to every client. The project accepts the cost of running a dedicated backend purely to hold that key server-side, rather than the simpler key-in-frontend approach. This is the foundational security boundary the whole topology is organized around.

## What changed

- Established an Express proxy (`server/index.mjs`) whose sole architectural justification is to keep `ANTHROPIC_API_KEY` server-side. The browser never receives the key and never talks to the Anthropic API directly — it only issues `POST /api/translate` (proxied via Vite in dev). A `GET /api/health` endpoint reports whether the key is configured without exposing it.

## Evidence

- README.md §Architecture: "The Express layer exists for one reason: it keeps `ANTHROPIC_API_KEY` server-side, so the key is never shipped to the browser."
- README.md §Features: "🔐 Key stays server-side — the browser never sees your Anthropic API key."
- README.md §Configuration: `ANTHROPIC_API_KEY` "Read only by the server."
- server/index.mjs: the key is read from `process.env` on the server; the Anthropic SDK client lives only there.

## Next

- Promote to ADR as the canonical secret-handling boundary. Any future feature that is tempted to call Anthropic (or any keyed API) directly from the browser must be rejected against this decision.
