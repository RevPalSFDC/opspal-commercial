---
name: sop-disable
description: Disable the SOP subsystem without deleting policies
argument-hint: ""
visibility: user-invocable
tags:
  - sop
  - configuration
allowed-tools:
  - Read
  - Write
  - Bash
---

# SOP Disable

## Purpose

Disable the SOP subsystem without removing any configuration or policies. Sets `enabled: false` in `config/sop/sop-config.yaml`.

Print: "SOP disabled. Policies and mappings are preserved. Set `SOP_ENABLED=0` in your environment to ensure hooks are inactive."

Policies remain on disk and can be re-enabled at any time with `/sop-enable`.
