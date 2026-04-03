---
name: flow-decision-condition-review
description: "Before deployment, review flow decision conditions to ensure optional field checks (like Contact != null) don't inadvertently skip required field assignments (like Prepared_By__c)"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-flow-diagnostician
---

# Flow Decision Condition Review

Before deployment, review flow decision conditions to ensure optional field checks (like Contact != null) don't inadvertently skip required field assignments (like Prepared_By__c)

## When to Use This Skill

- Before executing the operation described in this skill
- When deploying metadata that involves the patterns described here
- When working with Salesforce Flows or automation

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: Before deployment, review flow decision conditions to ensure optional field checks (like Contact != null) don't inadvertently skip required field assignments (like Prepared_By__c)
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: 4a1d688d-fba5-4df4-ac7d-cd8dacd78b88
- **Agent**: sfdc-flow-diagnostician
- **Enriched**: 2026-04-03
