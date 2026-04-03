---
name: ruleassociations-to-territory2rule-transformation
description: "Territory2 XML ruleAssociations elements cannot be deployed directly - they must be transformed into separate Territory2Rule and [SFDC_ID] metadata objects. Transformation logic: extract booleanFilter, create Territory2Rule per [SFDC_ID], create [SFDC_ID] per filter item, preserve field/operator/value relationships."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Write
agent: opspal-salesforce:sfdc-territory-manager
---

# Ruleassociations To Territory2rule Transformation

Territory2 XML ruleAssociations elements cannot be deployed directly - they must be transformed into separate Territory2Rule and [SFDC_ID] metadata objects. Transformation logic: extract booleanFilter, create Territory2Rule per [SFDC_ID], create [SFDC_ID] per filter item, preserve field/operator/value relationships.

## When to Use This Skill

- When deploying metadata that involves the patterns described here

**Category**: configuration
**Discovered from**: reflection analysis

## Workflow

1. Territory2 XML ruleAssociations elements cannot be deployed directly - they must be transformed into separate Territory2Rule and [SFDC_ID] metadata objects
2. Transformation logic: extract booleanFilter, create Territory2Rule per [SFDC_ID], create [SFDC_ID] per filter item, preserve field/operator/value relationships

## Source

- **Reflection**: 1566c1a7-aa6a-4212-8572-f1a9687152f8
- **Agent**: sfdc-territory-manager
- **Enriched**: 2026-04-03
