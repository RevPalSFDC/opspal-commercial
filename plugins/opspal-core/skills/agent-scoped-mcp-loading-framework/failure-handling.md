# Agent Load Failure Handling

Primary hook source: `../scripts/hooks/pre-agent-load.sh`.

## Guidance

Define behavior for missing metadata or missing agent files.

## MCP Unreachable → Local Fallback Policy

When an MCP server an agent would otherwise use is unreachable (Bad Gateway, repeated reconnect failures, 5xx), the agent MUST fall through to the documented local capability rather than silently degrade.

### Mermaid Chart MCP

Symptom in debug log: `MCP server "claude.ai Mermaid Chart": Connection error: Streamable HTTP error: Failed to open SSE stream: Bad Gateway`, followed by `Maximum reconnection attempts (2) exceeded`.

Policy:

- **Do not** call `mcp__claude_ai_Mermaid_Chart__validate_and_render_mermaid_diagram` as a primary renderer. No repo agent does today; keep it that way.
- **Do** use the local renderer for all Mermaid rendering: `plugins/opspal-core/scripts/lib/mermaid-pre-renderer.js`. It provides a three-tier fallback chain:
  1. `mmdc` (@mermaid-js/mermaid-cli) — highest quality
  2. `puppeteer` — direct headless-browser rendering
  3. Styled placeholder + `mermaid.live` link — always available

- Probe health with `node plugins/opspal-core/scripts/lib/mcp-connectivity-tester.js --server mermaid --json`. Expected statuses:
  - `connected` / `configured` → MCP reachable; local fallback still preferred for determinism
  - `error` → MCP unreachable; use local fallback exclusively

### General pattern

For any MCP tool an agent's system prompt references, the prompt must include a "if unavailable, use X" clause pointing at a concrete local alternative. Silent degradation is the failure mode — surface the fallback choice to the user if quality differs.
