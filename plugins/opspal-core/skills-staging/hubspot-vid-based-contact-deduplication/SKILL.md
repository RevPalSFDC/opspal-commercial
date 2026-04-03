---
name: hubspot-vid-based-contact-deduplication
description: "Always use HubSpot VID (contact.vid) as Map key for deduplication, not email. Email can be used for SF matching but VID is the canonical identifier."
version: 1.0.0
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Hubspot Vid Based Contact Deduplication

Always use HubSpot VID (contact.vid) as Map key for deduplication, not email. Email can be used for SF matching but VID is the canonical identifier.

## When to Use This Skill

- When the task matches the pattern described in the description

**Category**: validation
**Discovered from**: reflection analysis

## Workflow

1. Always use HubSpot VID (contact
2. vid) as Map key for deduplication, not email
3. Email can be used for SF matching but VID is the canonical identifier

## Source

- **Reflection**: d4628483-2fbe-4180-8cf2-f83f0e9a9a02
- **Agent**: manual
- **Enriched**: 2026-04-03
