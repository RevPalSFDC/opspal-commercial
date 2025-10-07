---
description: Audit all children from children.yaml and save reports (read-only batch operation).
allowed-tools: Read, Grep, Glob, Bash(pwd:*), Bash(ls:*), Bash(cat:*), Bash(date:*)
---

You are running a batch audit of all child projects defined in children.yaml.

## Process

### 1. Load Project Registry
Read `children.yaml` to get the list of projects to audit.

### 2. Validate Each Project
For each project in the registry:
- Check if path exists
- Verify `.claude/agents/` directory present
- Count agent files

### 3. Run Audits Sequentially
For each valid project:
1. Read all `.claude/agents/*.md` files
2. Apply heuristic scoring (SRD, OPT, MB, MH, OL, MEM, DC)
3. Analyze overlaps and redundancies
4. Generate consolidation recommendations
5. Save report to `./reports/[project]-agents-audit-[date].md`

### 4. Generate Summary Report
Create `./reports/batch-audit-summary-[date].md` with:
```markdown
# Batch Audit Summary
Date: [YYYY-MM-DD]
Projects Audited: [count]

## Project Overview
| Project | Path | Current Agents | Recommended | Status |
|---------|------|----------------|--------------|---------|
| Project1| path | 30 | 5 | Needs refactoring |
| Project2| path | 20 | 4 | Needs refactoring |
| Project3| path | 7  | 7 | Recently optimized |

## Key Findings
1. Total agents across projects: X
2. Recommended total after refactoring: Y
3. Potential reduction: Z%

## Common Issues
- [Issue 1]: Found in X projects
- [Issue 2]: Found in Y projects
- [Issue 3]: Found in Z projects

## Priority Actions
1. [Highest impact refactoring]
2. [Second priority]
3. [Third priority]

## Individual Reports
- platforms/SFDC: ./reports/platforms-SFDC-agents-audit-[date].md
- platforms/HS: ./reports/platforms-HS-agents-audit-[date].md
- Agents: ./reports/Agents-agents-audit-[date].md
```

### 5. Output Summary
Display to user:
```
✅ Batch Audit Complete
📊 Projects audited: [count]
📁 Reports saved to: ./reports/
🔍 Summary: ./reports/batch-audit-summary-[date].md

Key Statistics:
- Total agents found: X
- Recommended total: Y
- Potential reduction: Z%

Top Issues:
1. [Most common problem]
2. [Second most common]
3. [Third most common]
```

## Error Handling
- If a project path doesn't exist: Note in summary, continue with others
- If no agents found: Note as "No agents configured"
- If access denied: Note as "Permission denied"

## Constraints
- **NO MODIFICATIONS** to any child project
- **READ-ONLY** analysis
- Reports saved only to `./reports/` in parent
- Process continues even if individual projects fail
- Maximum processing time: 5 minutes total

## CI Integration

Set exit code based on worst scores across all projects:
- **0**: All projects pass (all scores < 2)
- **1**: Any project has warning (score = 2)
- **2**: Any project fails (score ≥ 3)
- **3**: Configuration errors detected

Final output should include:
```
OVERALL_STATUS: FAIL
WORST_SCORES: platforms/SFDC(MB=3), platforms/HS(OPT=2)
EXIT_CODE: 2
```