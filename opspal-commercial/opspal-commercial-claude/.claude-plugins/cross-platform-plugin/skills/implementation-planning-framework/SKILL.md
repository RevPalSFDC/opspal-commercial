---
name: implementation-planning-framework
description: Implementation planning methodology with specification parsing, agent selection, and effort estimation. Use when creating implementation plans from requirements, parsing specification documents, selecting appropriate agents for tasks, estimating effort, or creating project structures in Asana. Provides planning templates, estimation formulas, and agent mapping patterns.
allowed-tools: Read, Grep, Glob
---

# Implementation Planning Framework

## When to Use This Skill

- Creating implementation plans from requirements
- Parsing specification documents (Markdown, PDF, text)
- Selecting appropriate agents for tasks
- Estimating effort and timeline
- Creating project structures in Asana
- Breaking down complex initiatives

## Quick Reference

### Planning Phases

| Phase | Duration | Output |
|-------|----------|--------|
| Specification Analysis | 15-30 min | Requirements breakdown |
| Task Decomposition | 30-60 min | Task list with dependencies |
| Agent Assignment | 15 min | Agent-task mapping |
| Effort Estimation | 15-30 min | Timeline and resource plan |
| Project Creation | 10-15 min | Asana project structure |

### Specification Formats

| Format | Parser | Notes |
|--------|--------|-------|
| Markdown | Native | Headers → Tasks |
| PDF | pdf-parse | Extract text first |
| Plain Text | NLP | Sentence segmentation |
| JIRA Export | JSON | Map issue types |

### Agent Selection Matrix

| Task Domain | Primary Agent | Backup Agent |
|-------------|---------------|--------------|
| Salesforce Metadata | sfdc-metadata-manager | sfdc-orchestrator |
| Salesforce Data | sfdc-data-operations | sfdc-query-specialist |
| Salesforce Reports | sfdc-reports-dashboards | sfdc-report-designer |
| HubSpot Workflows | hubspot-workflow-builder | hubspot-automation |
| Cross-Platform | unified-orchestrator | platform-instance-manager |

## Detailed Documentation

See supporting files:
- `specification-parsing.md` - Document parsing patterns
- `phase-patterns.md` - Phase templates
- `risk-assessment.md` - Risk evaluation
- `resource-estimation.md` - Effort estimation
