# Asana Integration Standards

Use this reference when an agent creates, updates, or relies on Asana tasks, projects, or workflow state.

## Required Standards

- Preserve stable task identity and external system references.
- Keep project, section, and assignee mapping explicit.
- Do not silently create duplicate tasks when an update path exists.
- Record sync direction and reconciliation behavior when automation touches Asana state.

## Safety Rules

- Validate required Asana identifiers before write operations.
- Treat missing workspace or project configuration as blocking.
- Prefer idempotent updates over blind task recreation.
- Capture any user-visible workflow impact when changing sections, ownership, or due dates.

## Evidence To Capture

- Task or project identifiers used
- Operation performed and whether it was create vs update
- Any retry, bypass, or reconciliation action taken
