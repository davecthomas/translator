---
agentmemory_version: "0.4.4"
timestamp: "2026-06-12T18:34:16Z"
author: "2355287-davecthomas"
branch: "main"
thread_id: "bootstrap000002"
turn_id: "bootstrap02"
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
  - "server/index.mjs:65 model: \"claude-sonnet-4-6\" — translation is performed by the Anthropic SDK call inside the proxy."
  - "README.md §Architecture: '@anthropic-ai/sdk → claude-sonnet-4-6'."
source_commits:
  - "5c67f70 (2026-06-12) initial commit — Hebrew ⇄ English live voice translator"
---

## Why

- Translation quality is the core value of the product, and Hebrew ⇄ English is harder than mainstream pairs. The project commits to an LLM-based translator (Anthropic Claude via `@anthropic-ai/sdk`) rather than a rules-based or dedicated MT service, accepting LLM latency/cost in exchange for context-aware, idiomatic translation. The model is pinned (`claude-sonnet-4-6`) so behavior is reproducible.

## What changed

- The translation engine is the Anthropic Claude model `claude-sonnet-4-6`, invoked through `@anthropic-ai/sdk` exclusively from the server proxy. This is the single source of translation truth; the frontend contributes only speech capture, display, and TTS.

## Evidence

- server/index.mjs:65: `model: "claude-sonnet-4-6"` inside the `/api/translate` handler.
- README.md §Architecture diagram: `Express proxy → @anthropic-ai/sdk → claude-sonnet-4-6`.

## Next

- Kept as a decision candidate rather than promoted immediately: the specific model id is expected to churn across releases, so the durable invariant ("LLM translation via Claude behind the proxy") may warrant an ADR while the exact version stays in config. Revisit when migrating models or adding streaming (README §Ideas for iteration).
