Routing reminder:

- Use `Agent` when the work is specialist, multi-step, cross-system, deployment/data/automation/config related, or the hooks require routing.
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
- Direct tools are fine for simple reads, status checks, and narrow repo-only edits when hooks do not require routing.
