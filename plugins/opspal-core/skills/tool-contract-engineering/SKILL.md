---
name: tool-contract-engineering
description: Design and maintain pre/post tool contract validation hooks and failure triage patterns.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# tool-contract-engineering

## When to Use This Skill

- Designing a PreToolUse contract for a high-risk tool (e.g., `sf data delete record`, `sf metadata deploy`) to validate required parameters before execution
- A tool call is failing with unclear errors — triaging whether the failure is a contract violation (bad input) or a downstream system error
- Adding a new tool to the contract coverage system and generating its validation schema via `node scripts/lib/tool-contract-coverage.js generate-template <tool-name>`
- Running a contract coverage report to identify which tools lack pre/post validation contracts
- Reviewing PostToolUse contracts to confirm they correctly validate tool output shape and flag unexpected empty results

**Not for**: Enforcing MCP server scoping per agent — use `agent-scoped-mcp-loading-framework` for that.

## Contract Coverage Quick Reference

```bash
# List all tools with contracts
node scripts/lib/tool-contract-coverage.js report

# Generate a contract template for a new tool
node scripts/lib/tool-contract-coverage.js generate-template sf_data_query

# Validate a specific tool invocation
node scripts/lib/tool-contract-validator.js validate sf_data_query \
  --params '{"query":"SELECT Id FROM Account"}'

# Run the full contract validation dashboard
node scripts/lib/validation-dashboard-generator.js generate --days 30
```

## Workflow

1. Identify the tool to contract: determine if it is a high-risk write operation (needs PreToolUse contract) or a data-return operation (needs PostToolUse contract).
2. Read `pretool-contracts.md` or `posttool-contracts.md` to understand the contract schema format and required validation fields.
3. Generate the contract template using the coverage tool, then fill in the required parameter constraints, type assertions, and forbidden value patterns.
4. Register the contract in the schema registry and run a validation dry-run against a known-good and known-bad invocation to confirm both paths behave correctly.
5. If triaging a contract failure: read `failure-triage.md` — distinguish between a schema validation rejection (contract caught the problem) and an unexpected failure (contract gap).
6. Update the contract coverage report after adding or modifying contracts to ensure the CI gate reflects current coverage.

## Routing Boundaries

Use this skill for pre/post tool contract design, validation, and failure triage.
Defer to `agent-scoped-mcp-loading-framework` when the issue is which MCP servers an agent is permitted to call, rather than the input/output contract of a specific tool.

## References

- [Pre-Tool Contract Validation](./pretool-contracts.md)
- [Post-Tool Contract Validation](./posttool-contracts.md)
- [Contract Failure Triage](./failure-triage.md)
