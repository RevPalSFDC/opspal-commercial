---
name: parallel-agent-batch-orchestration
description: "Analyze dependency graph, group independent batches into waves, launch multiple sfdc-metadata-manager agents in parallel per wave, wait for completion before launching dependent waves"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:orchestrator (main conversation)
---

# Parallel Agent Batch Orchestration

Analyze dependency graph, group independent batches into waves, launch multiple sfdc-metadata-manager agents in parallel per wave, wait for completion before launching dependent waves

## When to Use This Skill

- Before executing the operation described in this skill
- When performing audits or assessments of the target system

**Category**: deployment
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Analyze dependency graph, group independent batches into waves, launch multiple sfdc-metadata-manager agents in parallel per wave, wait for completion before launching dependent waves
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 33c1d941-02ad-4767-b8be-0d507aeb4640
- **Agent**: orchestrator (main conversation)
- **Enriched**: 2026-04-03
