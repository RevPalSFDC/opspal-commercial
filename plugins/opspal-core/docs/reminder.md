# Agent Routing Reminder

## BLOCKED Operations - MUST Use Agent Tool

Before responding, check if the request matches any blocked operation:

| Keywords | Required Agent | Agent Tool Call |
|----------|----------------|----------------|
| cpq, quote, pricing, q2c | `sfdc-cpq-assessor` | `Agent(subagent_type='opspal-salesforce:sfdc-cpq-assessor', ...)` |
| revops, pipeline, forecast | `sfdc-revops-auditor` | `Agent(subagent_type='opspal-salesforce:sfdc-revops-auditor', ...)` |
| automation audit, flow audit | `sfdc-automation-auditor` | `Agent(subagent_type='opspal-salesforce:sfdc-automation-auditor', ...)` |
| permission set | `sfdc-permission-orchestrator` | `Agent(subagent_type='opspal-salesforce:sfdc-permission-orchestrator', ...)` |
| report, dashboard | `sfdc-reports-dashboards` | `Agent(subagent_type='opspal-salesforce:sfdc-reports-dashboards', ...)` |
| import data, export data | `sfdc-data-operations` | `Agent(subagent_type='opspal-salesforce:sfdc-data-operations', ...)` |
| deploy, production | `release-coordinator` | `Agent(subagent_type='release-coordinator', ...)` |
| diagram, flowchart, ERD | `diagram-generator` | `Agent(subagent_type='diagram-generator', ...)` |
| territory | `sfdc-territory-orchestrator` | `Agent(subagent_type='opspal-salesforce:sfdc-territory-orchestrator', ...)` |

## Complexity Assessment

**HIGH (Must use agent):**
- Multi-step operations (3+ steps)
- Cross-platform operations
- Org-wide analysis or audit
- Data migrations, production changes

**MEDIUM (Should use agent):**
- Multi-object modifications
- Workflow/Flow creation
- Permission restructuring

**LOW (Direct execution OK):**
- Single field creation
- Simple SOQL queries
- Documentation updates
- Configuration reads

## Self-Check Protocol

Before every response, ask yourself:

1. Does this match a BLOCKED keyword above? → **Use Agent tool**
2. Is this HIGH complexity? → **Use Agent tool**
3. Am I performing an assessment or audit? → **Use Agent tool**
4. Is this a production deployment? → **Use Agent tool**

**If uncertain → Default to using the Agent tool**

## Why This Matters

Specialists deliver:
- 60-90% time savings
- 40-80% error reduction
- Consistent, validated outputs
- Proper methodology adherence

**NEVER respond directly to a specialist task. Always use the Agent tool.**

---
*Injected via UserPromptSubmit hook - see docs/HOOK_BUG_SUMMARY.md*
