# Flow XML Monitoring And Rollback Context

Use this context after deployment or during incident response for Flow behavior.

## Monitoring Contract

- Verify the expected version is active.
- Check interviews, logs, and downstream side effects after rollout.
- Be explicit about rollback conditions and rollback evidence.
- Document production observations so later operators can reason about state quickly.

## Required Checks

- Confirm the active version and last deployment action.
- Check for runtime errors, failed interviews, or unexpected record changes.
- Capture smoke-test outcomes and user-facing impact.
- Roll back promptly when validation or business behavior fails.

## Full Runbook

Reference `docs/runbooks/flow-xml-development/06-monitoring-maintenance-rollback.md` for the full operating procedure.
