# Flow XML Validation Context

Use this context when checking Flow XML quality, correctness, and deploy readiness.

## Validation Contract

- Validate structure, references, formulas, and fault handling before deployment.
- Check for missing field references, invalid metadata relationships, and broken paths.
- Treat warnings that affect production safety as blocking until resolved.
- Confirm the flow still matches the requested business behavior after each edit batch.

## Required Checks

- Run the available Flow validation tooling.
- Confirm all referenced fields and objects exist in the target org.
- Confirm fault paths and defensive handling for write operations.
- Review naming, descriptions, and version metadata for maintainability.

## Full Runbook

Reference `docs/runbooks/flow-xml-development/04-validation-and-best-practices.md` for the complete checklist.
