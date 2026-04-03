---
name: ocr-lifecycle-stage-impact-analysis
description: "When auto-creating OpportunityContactRole records, audit DLRS rollups on OCR, flows on OCR, Contact flows triggered by OCR-derived fields, and Process Builders to confirm no cascade to lifecycle stage fields"
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-automation-auditor
---

# Ocr Lifecycle Stage Impact Analysis

When auto-creating OpportunityContactRole records, audit DLRS rollups on OCR, flows on OCR, Contact flows triggered by OCR-derived fields, and Process Builders to confirm no cascade to lifecycle stage fields

## When to Use This Skill

- When performing audits or assessments of the target system
- When working with Salesforce Flows or automation

**Category**: assessment
**Discovered from**: reflection analysis

## Workflow

1. Verify prerequisites — confirm the target org/object/context is appropriate
2. Execute the pattern: When auto-creating OpportunityContactRole records, audit DLRS rollups on OCR, flows on OCR, Contact flows triggered by OCR-derived fields, and Process Builders to confirm no cascade to lifecycle stage fields
3. Validate the outcome — confirm the expected result was achieved

## Source

- **Reflection**: bbd7abab-cb99-4032-a9c2-0adad65d7ffc
- **Agent**: sfdc-automation-auditor
- **Enriched**: 2026-04-03
