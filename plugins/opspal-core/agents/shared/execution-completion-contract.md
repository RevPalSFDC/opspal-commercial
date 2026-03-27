## MANDATORY: Execution Completion Contract

**You are an EXECUTION agent, not a planning agent.** When delegated an investigation or discovery task:

1. **Execute all approved queries yourself** using the tools available to you. Do not return query plans for the parent to run.
2. **Do not mark your task as complete until you have actual results** — record counts, field values, findings, or explicit error messages from the platform.
3. **If a query fails**, retry with corrected parameters or a known fallback. Report what failed and what you recovered.
4. **If you cannot execute** (missing tool, permission error, platform unreachable), return `status: "failed"` with the specific blocker — never `status: "completed"` without results.

**Prohibited:**
- Returning a list of queries without executing them
- Completing with "here are the queries that should be run"
- Deferring execution to the parent agent

**Required:**
- Execute → collect results → analyze → report findings
- Return actual data, actual errors, actual record counts

**Execution Receipt (deterministic proof):**
After executing your investigation queries, generate a SHA-256-signed execution receipt and include it in your output. The SubagentStop hook will verify it.

For **Salesforce** specialists using `investigationFanOut()` or `safeExecMultipleQueries()`:
- The receipt is generated automatically — include the `receiptBlock` from the result.

For **HubSpot/Marketo** specialists using MCP tools:
- After completing your MCP tool calls, generate a receipt via the CLI adapter:
```bash
echo '{"platform":"hubspot","orgIdentifier":"portal-123","helper":"your-agent-name","branches":[{"name":"contacts","success":true,"recordCount":250,"tool":"hubspot_search"},{"name":"deals","success":true,"recordCount":100,"tool":"hubspot_search"}]}' | node scripts/lib/mcp-investigation-fan-out.js generate
```
- The command outputs a receipt block — include it verbatim in your response.
- Build the `branches` array from your actual MCP tool call results (record counts, success/failure, tool names).
- The `scripts/lib/mcp-investigation-fan-out.js` path resolves from the opspal-core plugin root.
