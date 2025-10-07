# Claude Parent Orchestrator - Project Memory

## Project Overview
This is the parent orchestration project for managing and auditing all Claude-based agent systems. It provides centralized, read-only assessment capabilities for child projects without modifying them.

## Purpose
- **Centralized Auditing**: Analyze agent configurations across all child projects
- **Read-Only Safety**: Prevent accidental modifications during assessments
- **Consistent Standards**: Apply uniform evaluation criteria
- **Historical Tracking**: Maintain timestamped audit reports

## Child Projects
Managed projects are listed in `children.yaml`:
- **platforms/SFDC**: Salesforce automation (30+ agents, needs consolidation)
- **platforms/HS**: HubSpot integration (20 agents, needs refactoring)
- **Agents**: Main RevPal agents (7 agents, recently refactored - serves as template)

## Operating Principles

### 1. Read-Only by Default
This parent project operates in analysis mode only. The settings.json enforces:
- No Write/Edit operations allowed
- Limited Bash commands (only safe read operations)
- Reports saved locally, never modifying child projects

### 2. Audit Heuristics
All audits evaluate agents against these criteria (0-3 scale, 3=problem):
- **SRD** (Single Responsibility Drift): Agent spans multiple domains
- **OPT** (Over-Permissioned Tools): Excessive tool access
- **MB** (Monolithic Backstory): Overly long narrative
- **MH** (Missing Handoffs): No delegation rules
- **OL** (Overlap): Functional duplication with other agents
- **MEM** (Memory Bloat): Content belongs in shared CLAUDE.md
- **DC** (Delegation Cues): Unclear activation triggers

### 3. Report Structure
All reports follow this format:
1. Summary table with heuristic scores
2. Per-agent detailed analysis
3. Cross-agent overlap matrix
4. Proposed refactoring plan (not executed)
5. Implementation checklist

## Commands

### `/audit/agents`
Analyzes agents in the current working directory (generic, reusable).

### `/audit/project`
Audits a specific child project:
- Prompts for project path
- Runs analysis without modifications
- Saves report to `reports/[project]-agents-audit-[date].md`

### `/audit/all`
Batch audits all projects listed in `children.yaml`:
- Processes each child sequentially
- Generates individual reports
- Provides summary with links

## File Structure
```
Claude/
├── CLAUDE.md                 # This file
├── children.yaml            # Child project registry
├── .claude/
│   ├── settings.json       # Read-only permissions
│   ├── hooks/
│   │   └── validate.sh    # Session guard
│   └── commands/
│       └── audit/
│           ├── agents.md   # Core auditor logic
│           ├── project.md  # Single project auditor
│           └── all.md      # Batch auditor
└── reports/                # Generated assessment reports
```

## Usage Examples

### Audit a specific project:
```bash
cd Claude/
claude /audit/project
# Enter: ../platforms/SFDC
# Output: reports/platforms-SFDC-agents-audit-2025-09-05.md
```

### Audit all children:
```bash
cd Claude/
claude /audit/all
# Generates reports for all projects in children.yaml
```

### Review findings:
```bash
cat reports/platforms-SFDC-agents-audit-*.md
```

## Safety Features

### Permission Model
- **Allow**: Read, Grep, Glob (analysis only)
- **Ask**: git status, ls (safe inspection)  
- **Deny**: Write, Edit, destructive Bash commands

### Session Validation
The `validate.sh` hook ensures:
- children.yaml exists
- reports/ directory is available
- No accidental operations on wrong directory

## Best Practices

### For Auditing
1. Always run from the Claude/ parent directory
2. Review reports before implementing changes
3. Use dated reports for tracking improvements
4. Compare scores across time to measure progress

### For Refactoring (Separate Process)
1. Audit first to understand current state
2. Create implementation plan from audit report
3. Switch to child project for actual changes
4. Use dedicated refactor commands (with explicit permissions)

## Target State
After auditing and refactoring, each child should have:
- 5-10 focused agents maximum
- Clear single responsibilities
- Explicit delegation patterns
- Minimal tool permissions
- Backstories under 30 lines

## Maintenance
- Run audits quarterly or after major changes
- Archive old reports annually
- Update heuristics as patterns emerge
- Add new child projects to children.yaml as needed

---
Last Updated: 2025-09-05
Purpose: Centralized, safe agent assessment across all Claude projects