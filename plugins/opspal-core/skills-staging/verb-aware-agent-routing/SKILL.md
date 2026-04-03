---
name: verb-aware-agent-routing
description: "Before keyword-matching to select an agent, classify the user request verb as READ (audit/assess/analyze) or WRITE (delete/deploy/create/update). Route READ to audit agents, WRITE to execution agents. This prevents mis-routing destructive operations to read-only agents."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-core:parent-context
---

# Verb Aware Agent Routing

Before keyword-matching to select an agent, classify the user request verb as READ (audit/assess/analyze) or WRITE (delete/deploy/create/update). Route READ to audit agents, WRITE to execution agents. This prevents mis-routing destructive operations to read-only agents.

## When to Use This Skill

- Before executing the operation described in this skill
- When deploying metadata that involves the patterns described here
- When performing audits or assessments of the target system

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Before keyword-matching to select an agent, classify the user request verb as READ (audit/assess/analyze) or WRITE (delete/deploy/create/update)
2. Route READ to audit agents, WRITE to execution agents
3. This prevents mis-routing destructive operations to read-only agents

## Source

- **Reflection**: 055c82a5-83c0-46cf-94e0-573190e2e445
- **Agent**: parent-context
- **Enriched**: 2026-04-03
