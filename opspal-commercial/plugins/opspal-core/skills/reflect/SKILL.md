---
name: reflect
description: Analyze session for errors, feedback, and generate improvement playbook. Use after development sessions to document patterns and submit to centralized database.
allowed-tools: Read, Write, Bash, Grep, Glob
---

# Session Reflection Skill

This skill analyzes your development session and generates a structured improvement playbook.

## Quick Execution

Run the reflect command which handles all the work:

```bash
/reflect
```

## When to Use

- After completing a development session
- When you encountered errors worth documenting
- When you have feedback about tools or agents
- After discovering patterns that could be automated

## What It Does

1. Analyzes session history (tool calls, errors, feedback)
2. Categorizes issues by taxonomy
3. Generates improvement playbook with root cause analysis
4. Saves reflection JSON locally
5. Submits to Supabase database for trend analysis

## Output

Creates `.claude/SESSION_REFLECTION_<timestamp>.json` with:
- Summary and outcome
- Issues identified with taxonomy/priority
- User feedback classification
- Wiring plan for improvements
- ROI analysis

For full documentation, see the `/reflect` command.
