---
name: ocr-triggered-flow-pattern
description: "For flows that need Contact data at [COMPANY] creation, trigger on OpportunityContactRole (Create + Update) instead of Opportunity. OCR is always created in a separate DML transaction after the Opportunity."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Write
  - Bash
agent: opspal-salesforce:sfdc-automation-auditor
---

# Ocr Triggered Flow Pattern

For flows that need Contact data at [COMPANY] creation, trigger on OpportunityContactRole (Create + Update) instead of Opportunity. OCR is always created in a separate DML transaction after the Opportunity.

## When to Use This Skill

- When working with Salesforce Flows or automation

**Category**: automation
**Discovered from**: reflection analysis

## Workflow

1. For flows that need Contact data at [COMPANY] creation, trigger on OpportunityContactRole (Create + Update) instead of Opportunity
2. OCR is always created in a separate DML transaction after the Opportunity

## Source

- **Reflection**: 999bb96d-9efd-4506-a192-5c2fec780e72
- **Agent**: sfdc-automation-auditor
- **Enriched**: 2026-04-03
