# Flow XML Scenario Design Context

Use this context when mapping business scenarios to Flow structure.

## Scenario Translation Rules

- Convert the user request into trigger conditions, decision branches, and record actions.
- Separate screen-only requirements from metadata-deployable logic.
- Identify manual UI steps early when Screen Flow work cannot be fully automated.
- Prefer small, testable segments when the scenario is multi-stage or high risk.

## Required Checks

- Capture the business event that starts the flow.
- List records read, updated, created, or deleted.
- Document any dependencies on formulas, permissions, or related automation.
- Note where manual post-deploy configuration will still be required.

## Full Runbook

Reference `docs/runbooks/flow-xml-development/02-designing-flows-for-project-scenarios.md` for deeper scenario guidance.
