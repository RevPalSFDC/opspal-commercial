# Flow XML Authoring Runbook Context

Use this context when the task is about creating or modifying Flow XML directly.

## Authoring Contract

- Start from the target flow type and required business outcome.
- Keep element API names stable and descriptive.
- Prefer incremental changes over large unstructured rewrites.
- Preserve flow metadata required for deploy, activate, and rollback flows.

## Required Checks

- Confirm the flow type before editing XML.
- Confirm object, trigger timing, and entry criteria before creating elements.
- Keep formulas, assignments, and decisions consistent with existing naming standards.
- Validate every new element has a clear purpose and downstream connection.

## Full Runbook

Reference `docs/runbooks/flow-xml-development/01-authoring-flows-via-xml.md` for the complete authoring procedure.
