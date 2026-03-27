# Flow XML Deployment Context

Use this context when packaging, deploying, activating, or rolling back Flow XML.

## Deployment Contract

- Default to deploy-inactive, verify, then activate when risk is non-trivial.
- Confirm prerequisites such as fields, permissions, and dependent metadata first.
- Capture the exact deployment command and target org.
- Preserve a rollback path before activation.

## Required Checks

- Validate package contents and dependencies.
- Confirm activation behavior and version impact.
- Run smoke checks after deployment.
- Stop if required remediation actions remain unresolved.

## Full Runbook

Reference `docs/runbooks/flow-xml-development/05-testing-and-deployment.md` for the detailed deployment sequence.
