# Agent Registry
Last validated: 2025-09-05

## Active Agents

| Agent | Scope | Tools | Delegates To |
|-------|-------|-------|--------------|
| release-coordinator | Cross-platform releases | Task, Read, Grep, Glob, Bash(git:*) | All platform agents |
| hubspot-workflow | HubSpot automation | mcp__hubspot, Read, Write | None |
| hubspot-data | HubSpot data ops | mcp__hubspot, Read, Write, Grep | None |
| hubspot-api | HubSpot integrations | mcp__hubspot, Read | None |
| sfdc-metadata | Salesforce deploys | mcp__salesforce-dx, Read, Grep, Glob, Bash(sf/sfdx:*) | None |
| sfdc-apex | APEX development | Read, Write, Grep, Glob, Bash(sf/sfdx:*) | sfdc-metadata |
| sfdc-discovery | Salesforce analysis | mcp__salesforce-dx, Read, Grep, Glob | sfdc-apex, sfdc-metadata |

## Agent Responsibilities

### Orchestration
- **release-coordinator**: Master orchestrator for all releases. Delegates platform-specific work.

### HubSpot Domain (3 agents)
- **hubspot-workflow**: Workflow creation and enrollment logic only
- **hubspot-data**: Contact/company properties and data hygiene
- **hubspot-api**: Webhooks, integrations, and API configuration

### Salesforce Domain (3 agents)
- **sfdc-metadata**: Metadata packaging and deployment operations
- **sfdc-apex**: APEX code development and testing
- **sfdc-discovery**: Read-only org analysis and impact assessment

## Key Principles

1. **Single Responsibility**: Each agent does ONE thing well
2. **Explicit Handoffs**: Clear delegation chains prevent overlap
3. **Least Privilege**: Minimal tool access for each agent
4. **Don't Rules**: Each agent explicitly states what it won't do

## Validation

Run `.claude/validate-agents.sh` after any changes to verify:
- All 7 agents present
- MCP servers configured
- Permissions properly scoped
- Slack webhook available

## Maintenance

- Review quarterly for scope creep
- Update tool permissions as needed
- Archive unused agents to `.claude/_archive/`
- Keep backstories under 30 lines