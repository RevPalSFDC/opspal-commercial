# Agent Routing Reminder

Check routing before operational work. Use the listed specialist when the request clearly matches that domain or the hooks explicitly require routing.

| Keywords | Preferred Agent | Agent Tool Call |
|----------|-----------------|-----------------|
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

**Route to an agent when the work is clearly specialist or high risk:**
- Multi-step operations (3+ steps)
- Cross-platform or cross-object operations
- Org-wide analysis or audit
- Data migrations or production changes
- Workflow, automation, or configuration changes

**Direct execution is usually acceptable when hooks do not require routing:**
- Simple reads or status checks
- Small local documentation updates
- Narrow repo-only edits
- Simple configuration inspection

## Self-Check Protocol

Before every response, ask:

1. Does this clearly match a specialist domain above?
2. Is this multi-step, cross-system, or operationally risky?
3. Am I performing an assessment, audit, deployment, or automation change?
4. Did the runtime hooks require a route or name an approved agent family?

If yes, invoke the appropriate `Agent` before operational tools. If the hooks do not require routing and the task is low-risk, direct execution is acceptable.

---
*Injected via `UserPromptSubmit` hook.*
