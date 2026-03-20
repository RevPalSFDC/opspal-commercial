---
name: opspalfirst
aliases: [first-run]
description: Check first-run OpsPal setup and guide license activation plus workspace initialization
argument-hint: "[--project-dir=<path>]"
visibility: user-invocable
tags:
  - onboarding
  - first-run
  - license
  - initialize
---

# OpsPal First-Run Check

Inspect the current machine and workspace, then guide the user through any missing first-run setup steps.

## Execute

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/first-run-onboarding.js" render
```

## Follow-Up Rules

- If activation is required, tell the user to run:

```bash
/activate-license <email> <license-key>
```

- If workspace initialization is required after activation, tell the user to run:

```bash
/initialize
```

- If both are required, require activation first, then `/initialize`.
- If the machine is already activated and the workspace is initialized, tell the user OpsPal is ready.
