# Routing Reminder (Short)

Use the Task tool for blocked operations (cpq/q2c, revops, automation/flow audit,
permission sets, reports/dashboards, data import/export, production deploys,
diagrams/ERDs, territory). When in doubt, use Task.
Before doing work manually, check for available sub-agents, runbooks, tools, and skills
and prefer those resources (see AGENTS.md and docs/routing-help.md).

## Rules
- Use `Agent` when the work is specialist, multi-step, cross-system, deployment/data/automation/config related, or the hooks require routing.
- Use fully-qualified agent names ONLY: `plugin:agent-name`.
- Do NOT invent generic role labels such as `Explore`, `Research`, `Analyst`, or `Builder`.
- If the route is uncertain, pick an exact agent from the mapping below instead of guessing.

## Specialist Mapping

### Salesforce
  `cpq/q2c/pricing -> opspal-salesforce:sfdc-cpq-assessor`
  `revops/pipeline/forecast -> opspal-salesforce:sfdc-revops-auditor`
  `automation/flow audit -> opspal-salesforce:sfdc-automation-auditor`
  `permission set/FLS -> opspal-salesforce:sfdc-permission-orchestrator`
  `reports/dashboards -> opspal-salesforce:sfdc-reports-dashboards`
  `import/export/upsert data -> opspal-salesforce:sfdc-data-operations`
  `deploy/production -> opspal-core:release-coordinator`
  `territory -> opspal-salesforce:sfdc-territory-orchestrator`
  `complex multi-step SF -> opspal-salesforce:sfdc-orchestrator`

### HubSpot
  `hubspot assessment -> opspal-hubspot:hubspot-assessment-analyzer`
  `hubspot workflow -> opspal-hubspot:hubspot-workflow-builder`
  `hubspot contacts/deals -> opspal-hubspot:hubspot-contact-manager`
  `hubspot pipeline -> opspal-hubspot:hubspot-pipeline-manager`
  `complex multi-step HS -> opspal-hubspot:hubspot-orchestrator`

### Marketo
  `marketo campaign -> opspal-marketo:marketo-campaign-builder`
  `marketo lead scoring -> opspal-marketo:marketo-lead-scoring-architect`
  `marketo program -> opspal-marketo:marketo-program-architect`
  `complex multi-step MK -> opspal-marketo:marketo-orchestrator`

### Cross-Platform
  `diagrams/ERD/flowchart -> opspal-core:diagram-generator`
  `OKR -> opspal-okrs:okr-strategy-orchestrator`
  `GTM planning -> opspal-gtm-planning:gtm-planning-orchestrator`
  `data dedup -> opspal-core:revops-dedup-specialist`
  `pipeline health -> opspal-core:pipeline-intelligence-agent`

## Invocation
Invoke specialists with `Agent(subagent_type='<fully-qualified-agent>', prompt=<request>)`.
Only skip routing for simple reads, status checks, or narrow local edits.
