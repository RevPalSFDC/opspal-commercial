---
name: sop-enable
description: Enable the SOP subsystem — validates config and verifies hook registration before activating
argument-hint: ""
visibility: user-invocable
tags:
  - sop
  - configuration
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
---

# SOP Enable

## Purpose

Enable the SOP subsystem by setting `SOP_ENABLED=1`. Performs mandatory validation before activating:

1. Verify `config/sop/sop-config.yaml` exists
2. Validate all policy files against schema
3. Verify hook registration in dispatcher scripts
4. Check SOP hook scripts exist and are executable
5. Warn if Asana targets are still unconfigured (`CONFIGURE_VIA_SOP_MAP`)

If all checks pass, set `enabled: true` in `sop-config.yaml` and print: "SOP enabled. Set `SOP_ENABLED=1` in your environment or `.env` file to activate hooks."

If any check fails, print the failure details and advise on remediation.

## Environment

The SOP hooks check `SOP_ENABLED` env var at runtime. Options to set it:
- `export SOP_ENABLED=1` in shell profile
- Add `SOP_ENABLED=1` to `.env` file in the workspace
- The `enabled: true` flag in `sop-config.yaml` is read by the session-init hook
