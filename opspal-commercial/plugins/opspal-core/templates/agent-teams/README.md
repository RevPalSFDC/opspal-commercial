# Agent Teams Templates

> **STATUS: BLOCKED** - Agent Teams is a research preview in Claude Code. These templates document planned team configurations but are **not executable** until the feature reaches GA.

## What Are These Templates?

Each template describes a team configuration for a specific workflow. When Agent Teams exits experimental mode, these will be converted to executable configurations.

## Template Files

| Template | Agents | Use Case |
|----------|--------|----------|
| `cpq-plus-automation-team.md` | CPQ assessor + automation auditor + response validator | Combined CPQ and automation assessment |
| `cross-platform-revops-team.md` | SF auditor + HS auditor + unified reporting | Cross-platform RevOps assessment |
| `assessment-plus-benchmarks-team.md` | Any assessor + benchmark research agent | Assessment with real-time benchmark enrichment |

## Prerequisites (When GA)

1. Claude Code must support Agent Teams (currently experimental)
2. Environment variable: `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` (current requirement)
3. MCP tools must be accessible by teammates (currently not supported)

## Enabling Agent Teams (Experimental)

```bash
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
```

## Key Constraints

- Each teammate is a full model process (3 teammates = 3x token cost)
- Teammates only get Task and SendMessage tools (no MCP access)
- No session resumption for teams
- One team per session
- No nested teams

## Converting Templates to Executable Config

When Agent Teams reaches GA, the conversion process will be:

1. Parse the team structure from each template
2. Generate team configuration in whatever format Claude Code specifies
3. Wire into orchestrator agents or create a `/spawn-team` command
4. Add team cost tracking to the adaptive routing engine

## References

- Feature exploration: `docs/AGENT_TEAMS_EXPLORATION.md`
- Model tier recommendations: `docs/AGENT_MODEL_TIER_RECOMMENDATIONS.md`
- Adaptive thinking guide: `docs/ADAPTIVE_THINKING_GUIDE.md`
