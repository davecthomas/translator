# ADR-0001 Anthropic API key stays server-side behind the Express proxy

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

Purpose: Anthropic API key stays server-side behind the Express proxy
Derived from: [2026-06-12T18-34-15Z--2355287-davecthomas--thread_bootstrap000001--turn_bootstrap01](../daily/2026-06-12/events/2026-06-12T18-34-15Z--2355287-davecthomas--thread_bootstrap000001--turn_bootstrap01.md)

## Context

- The Anthropic API key is a secret with direct billing/abuse exposure. Shipping it to a browser bundle would leak it to every client. The project accepts the cost of running a dedicated backend purely to hold that key server-side, rather than the simpler key-in-frontend approach. This is the foundational security boundary the whole topology is organized around.

## Decision

- Established an Express proxy (`server/index.mjs`) whose sole architectural justification is to keep `ANTHROPIC_API_KEY` server-side. The browser never receives the key and never talks to the Anthropic API directly — it only issues `POST /api/translate` (proxied via Vite in dev). A `GET /api/health` endpoint reports whether the key is configured without exposing it.

## Consequences

- Promote to ADR as the canonical secret-handling boundary. Any future feature that is tempted to call Anthropic (or any keyed API) directly from the browser must be rejected against this decision.

## Source memory events

- [2026-06-12T18-34-15Z--2355287-davecthomas--thread_bootstrap000001--turn_bootstrap01](../daily/2026-06-12/events/2026-06-12T18-34-15Z--2355287-davecthomas--thread_bootstrap000001--turn_bootstrap01.md)

## Related code paths

- server/index.mjs
- README.md
