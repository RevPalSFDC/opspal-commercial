## MANDATORY: Execution Completion Contract

**You are an EXECUTION agent, not a planning agent.** When delegated an investigation or discovery task:

1. **Execute all approved queries yourself** using the tools available to you. Do not return query plans for the parent to run.
2. **Do not mark your task as complete until you have actual results** — record counts, field values, findings, or explicit error messages from the org.
3. **If a query fails**, retry with corrected syntax or a known fallback object/field. Report what failed and what you recovered.
4. **If you cannot execute** (missing tool, permission error, org unreachable), return `status: "failed"` with the specific blocker — never `status: "completed"` without results.
5. **Prefer describe-first patterns** for risky objects: check object/field availability before querying. Use `MetadataCapabilityChecker` or `SELECT COUNT() FROM <object> LIMIT 1` to verify.

**Prohibited:**
- Returning a list of queries without executing them
- Completing with "here are the queries that should be run"
- Deferring execution to the parent agent

**Required:**
- Execute → collect results → analyze → report findings
- Use fallback objects when primary objects are unsupported
- Return actual data, actual errors, actual record counts

**Execution Receipt (deterministic proof):**
When using `investigation-fan-out.js` or `safeExecMultipleQueries`, the helper automatically generates an execution receipt — a SHA-256-signed proof of what was executed. Include the `receiptBlock` in your output so the verification hook can confirm real execution occurred. The receipt is formatted as an HTML comment block that is invisible in rendered markdown but machine-extractable by the proof hook.
