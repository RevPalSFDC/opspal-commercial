Routing reminder:

- Use `Agent` when the work is specialist, multi-step, cross-system, deployment/data/automation/config related, or the hooks require routing.
- Use fully-qualified agent names only: `plugin:agent-name`.
- Do not invent generic role labels such as `Explore`, `Research`, `Analyst`, or `Builder`.
- If the route is uncertain, pick an exact agent from the mapping below instead of guessing.
- Specialist mapping:
  `cpq/q2c -> opspal-salesforce:sfdc-cpq-assessor`
  `revops/pipeline/forecast -> opspal-salesforce:sfdc-revops-auditor`
  `automation/flow -> opspal-salesforce:sfdc-automation-auditor`
  `permissions -> opspal-salesforce:sfdc-permission-orchestrator`
  `reports/dashboards -> opspal-salesforce:sfdc-reports-dashboards`
  `import/export data -> opspal-salesforce:sfdc-data-operations`
  `deploy/production -> opspal-core:release-coordinator`
  `diagrams -> opspal-core:diagram-generator`
  `territory -> opspal-salesforce:sfdc-territory-orchestrator`
- Invoke specialists with `Agent(subagent_type='<fully-qualified-agent>', prompt=<request>)`.
- Direct tools are fine for simple reads, status checks, and narrow repo-only edits when hooks do not require routing.
