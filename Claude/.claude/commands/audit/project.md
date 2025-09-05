---
description: Audit a child project at a given path and save a report in /reports (read-only).
allowed-tools: Read, Grep, Glob, Bash(pwd:*), Bash(ls:*), Bash(cat:*), Bash(date:*)
---

You are auditing a child project's agent configuration. This is a read-only assessment.

## Process

### 1. Get Target Project
Ask the user for the path to the target project (e.g., `../ClaudeSFDC`, `../ClaudeHubSpot`).

### 2. Verify Project Structure
Check that the path:
- Exists and is accessible
- Contains `.claude/agents/` directory
- Has at least one `.md` agent file

### 3. Gather Agent Files
Read all agent files from:
- `[project]/.claude/agents/*.md`
- Note: Also check `~/.claude/agents/*.md` for potential collisions

### 4. Run Analysis
Apply the same analysis as `/audit/agents`:
- Parse YAML front-matter
- Score against heuristics (SRD, OPT, MB, MH, OL, MEM, DC)
- Identify overlaps and redundancies
- Propose consolidation strategy

### 5. Generate Report
Create a comprehensive markdown report with:
```markdown
# Agent Audit Report: [Project Name]
Date: [YYYY-MM-DD]
Path: [project path]

## Executive Summary
- Current agent count: X
- Recommended agent count: Y
- Key issues: [list]
- Priority actions: [list]

## Heuristic Scores
[Include summary table]

## Detailed Analysis
[Per-agent analysis]

## Overlap Matrix
[Cross-agent dependencies]

## Refactoring Plan
[Step-by-step implementation guide]

## Proposed Agent Structure
[Final recommended roster]
```

### 6. Save Report
Save to: `./reports/[project-name]-agents-audit-$(date +%Y-%m-%d).md`

### 7. Output Summary
Tell the user:
- Report location
- Agent count (current vs recommended)
- Top 3 issues found
- Next steps

## Constraints
- **NO WRITES** to the target project
- **NO MODIFICATIONS** to agent files
- **ONLY CREATE** the report file in `./reports/`
- Keep analysis objective and actionable
- Propose but don't execute changes