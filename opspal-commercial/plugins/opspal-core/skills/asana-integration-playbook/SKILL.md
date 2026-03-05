---
name: asana-integration-playbook
description: Asana project management integration patterns and best practices. Use when creating Asana tasks, posting updates, reading task context, tracking project progress, or formatting task updates. Provides 40+ Asana API patterns, error handling, update templates, and brevity standards.
allowed-tools: Read, Grep, Glob
---

# Asana Integration Playbook

## When to Use This Skill

- Creating or updating Asana tasks from agents
- Posting progress updates to linked projects
- Reading task context for agent assignments
- Formatting updates with brevity standards
- Breaking down projects into trackable subtasks
- Managing project status and milestones
- Navigating Asana hierarchy (projects, sections, tasks)

## Quick Reference

### Core Principles

1. **Context-Aware** - Always pull full task and project context before acting
2. **Succinct** - Keep updates brief (<100 words) with maximum signal
3. **Actionable** - Every update should drive the project forward or flag blockers
4. **Data-Driven** - Include concrete metrics and outcomes
5. **Structured** - Use consistent formatting for easy scanning

### Word Limits by Update Type

| Update Type | Target | Max |
|-------------|--------|-----|
| Progress checkpoint | 50-75 words | 100 words |
| Blocker notification | 40-60 words | 80 words |
| Completion summary | 60-100 words | 150 words |
| Milestone update | 100-150 words | 200 words |
| Project status | 150-200 words | 300 words |

### Standard Update Structure

```markdown
**Progress:** What has been accomplished since last update
**Roadblocks:** Any blockers or issues (omit if none)
**Next Steps:** What will be worked on next or what input is needed
```

## Key Fields to Extract from Tasks

- **Task Name** - The work to be done
- **Description** - Detailed instructions and context
- **Status** - Current state (Not Started, In Progress, Completed)
- **Assignee** - Who is responsible
- **Due Date** - When work should be completed
- **Priority** - Urgency level
- **Custom Fields** - Project-specific metadata (ROI, effort hours)
- **Section** - Phase or grouping within project
- **Dependencies** - Blocking or blocked by other tasks

## Detailed Documentation

See supporting files:
- `api-patterns.md` - 40+ Asana API patterns with examples
- `navigation-patterns.md` - Finding projects, tasks, and sections with MCP tool examples
- `error-scenarios.md` - Error handling and recovery
- `task-templates.md` - Task creation and update templates
- `project-patterns.md` - Project management workflows
