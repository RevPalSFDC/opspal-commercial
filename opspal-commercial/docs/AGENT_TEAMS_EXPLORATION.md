# Agent Teams Exploration

> **STATUS: EXPERIMENTAL** - Agent Teams is a research preview in Claude Code v2.1.32. Do NOT use for production client work. This document is for future planning only.

## What Are Agent Teams?

Agent Teams enable **peer-to-peer multi-agent collaboration** where agents can send messages directly to each other, rather than the current hub-and-spoke model where a parent agent delegates to child agents sequentially.

### Enabling the Feature

```bash
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
```

### Current Model vs Agent Teams

| Aspect | Current (Task Tool) | Agent Teams |
|--------|-------------------|-------------|
| **Communication** | Parent → Child (one-way delegation) | Peer-to-peer messaging |
| **Execution** | Sequential or parallel spawning | Parallel with coordination |
| **Context Sharing** | Parent summarizes for child | Agents share context directly |
| **Coordination** | Parent orchestrates | Agents self-coordinate |
| **Error Handling** | Parent handles child failures | Agents negotiate recovery |

## Why This Matters for OpsPal

Our current architecture uses the Task tool for all agent delegation:

```
User Request
  └── Orchestrator (sfdc-orchestrator / hubspot-orchestrator)
       ├── Task(sfdc-discovery, ...) → sequential
       ├── Task(sfdc-cpq-assessor, ...) → sequential
       └── Task(sfdc-automation-auditor, ...) → sequential
```

Agent Teams would enable:

```
User Request
  └── Team spawns simultaneously:
       ├── sfdc-cpq-assessor ←→ sfdc-automation-auditor (share findings)
       ├── sfdc-revops-auditor ←→ benchmark-research-agent (request benchmarks)
       └── All agents ←→ response-validator (continuous validation)
```

## Candidate Workflows for Future Exploration

### 1. Cross-Platform RevOps Assessment

**Current**: Sequential - SF audit, then HS audit, then combined report.
**With Teams**: SF and HS auditors run simultaneously, sharing findings about shared objects (Contacts, Leads, Opportunities) in real-time.

**Potential benefit**: 40-60% time reduction on cross-platform audits.

### 2. CPQ + Automation Audit

**Current**: CPQ assessor runs, then automation auditor runs separately.
**With Teams**: Both analyze the same org simultaneously. CPQ assessor finds pricing rules while automation auditor maps the flows that execute them. They share discoveries about automation-CPQ interactions.

**Potential benefit**: Better coverage of CPQ-automation intersections.

### 3. Multi-Platform Data Quality

**Current**: Each platform's data quality check runs independently.
**With Teams**: SF, HS, and Marketo data quality agents run in parallel, cross-referencing records across platforms to find sync gaps and duplicates.

**Potential benefit**: Catch cross-platform data issues that single-platform audits miss.

### 4. Assessment + Benchmark Research

**Current**: Assessment completes, then benchmark agent is called for each metric.
**With Teams**: Benchmark agent receives metrics as they're discovered, fetches benchmarks in parallel with ongoing assessment.

**Potential benefit**: Assessment and benchmarking complete at the same time.

## Risks and Concerns

- **Experimental**: API may change or be removed
- **Cost**: Multiple Opus agents running simultaneously could be expensive
- **Complexity**: Debugging peer-to-peer agent interactions is harder than sequential delegation
- **Context bloat**: Agents sharing context could hit token limits faster
- **Determinism**: Parallel execution order may affect results

## Architecture Details

### Team Structure

Agent Teams uses a **team lead + teammates** model:

- **Team Lead**: The primary agent that orchestrates the team. Created with a system prompt that defines the team's mission. Uses `delegate` display mode to show teammate names/status to the user.
- **Teammates**: Peer agents spawned by the team lead. Each gets their own system prompt and operates independently. Uses `full` display mode (default) showing all output.

### Communication Model

Teammates communicate via **mailbox-based messaging**:

- Each teammate has a shared **task list** (visible to all team members)
- Agents use **SendMessage** to send direct messages to specific teammates
- Messages are asynchronous - agents can continue working while awaiting replies

### Display Modes

| Mode | Used By | Behavior |
|------|---------|----------|
| `full` | Teammates (default) | Shows all agent output to the user |
| `delegate` | Team lead | Shows teammate names and status indicators |

### Tool Access

Teammates have a **restricted tool set** compared to regular agents:

- **Task** tool - For spawning sub-agents (same as parent)
- **SendMessage** - For peer-to-peer messaging with other teammates
- Teammates do **NOT** get the parent's full tool set (no MCP tools, no direct file access, etc.)

This is a significant constraint for our use case - assessment agents that need MCP tools (Salesforce queries, etc.) would need to spawn sub-agents via Task tool to access those capabilities.

### Known Limitations

| Limitation | Impact on OpsPal |
|------------|-----------------|
| **No session resumption** | Cannot resume a team session after disconnect |
| **One team per session** | Cannot run multiple teams simultaneously |
| **No nested teams** | A teammate cannot spawn its own team |
| **No MCP tool sharing** | Teammates can't use parent's MCP servers directly |
| **Experimental API** | May change or be removed without notice |

### Cost Model

Each teammate is a **full Opus/Sonnet process**:

- Running 3 teammates = 3x the token cost
- A team of 3 Opus agents running for 5 minutes each costs ~$2.25 (vs ~$0.75 for a single agent)
- Cost scales linearly with teammate count and session duration
- For our typical assessment workflows, a 3-agent team could cost $3-5 per run

**Cost comparison for a typical cross-platform RevOps assessment:**

| Approach | Est. Cost | Est. Time | Quality |
|----------|-----------|-----------|---------|
| Sequential Task tool | ~$1.50 | 15 min | Good |
| Agent Team (3 agents) | ~$4.50 | 7 min | Potentially better (shared findings) |

## Decision

**DO NOT** build production features on Agent Teams until:

1. Feature exits research preview
2. API is stable and documented
3. Cost implications are understood
4. We have a clear use case where Teams significantly outperforms Task tool

**DO** monitor the feature for updates and keep this document current.

**DO** prepare team template configurations (see `plugins/opspal-core/templates/agent-teams/`) so we can move quickly when the feature reaches GA.

---

**Version**: 2.0.0
**Last Updated**: 2026-02-05
**Status**: Documentation only - no code changes
