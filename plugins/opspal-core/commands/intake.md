---
name: intake
description: Classify a request, generate an implementation plan, and create Asana tasks from natural language
argument-hint: "[request description] [--json] [--plan-only] [--project-gid <gid>] [--workspace-gid <gid>] [--platform <name>] [--mode quick|thorough] [--no-questions]"
stage: ready
---

# Intelligent Intake

Classify a natural language request, generate a phased implementation plan, and create structured Asana tasks.

## What This Does

1. **Classifies** your request into a sophistication level (L1 Simple Config through L5 Platform Engineering)
2. **Assesses risk** (Low / Medium / High) and identifies the primary domain
3. **Asks minimal questions** — only what's needed, capped by sophistication level
4. **Generates a plan** with phased tasks, effort estimates, and dependencies
5. **Creates Asana tasks** (with your confirmation) in the correct project with proper sections

## Usage

```
/intake We need to redesign our lead routing in Salesforce to support territory-based assignment

/intake --json "Add a checkbox field to Account for tracking opt-in status"

/intake --project-gid 1234567890 --platform salesforce "Build a CPQ quoting workflow"

/intake --plan-only "Migrate 50k contacts from HubSpot to Salesforce with dedup"

/intake --no-questions "Set up lead scoring in HubSpot based on email engagement"

/intake --mode quick "Overhaul our opportunity stages across all record types"
```

## Options

| Flag | Description |
|------|-------------|
| `--json` | Output pure JSON (no markdown, no conversation) |
| `--plan-only` | Generate plan without creating Asana tasks |
| `--project-gid <gid>` | Target Asana project for task creation |
| `--workspace-gid <gid>` | Target Asana workspace |
| `--platform <name>` | Hint the platform: `salesforce`, `hubspot`, `marketo`, `internal`, `mixed` |
| `--mode quick` | Limit to 3 questions max, make assumptions for the rest |
| `--mode thorough` | Ask up to the max questions for the classified level |
| `--no-questions` | Proceed with assumptions, skip all clarifying questions |

## Instructions

You MUST use the Task tool to route this to the `intelligent-intake-orchestrator` agent.

Parse the user's input to extract:
1. **request_text** — everything that isn't a flag
2. **flags** — `--json`, `--plan-only`, `--project-gid`, `--workspace-gid`, `--platform`, `--mode`, `--no-questions`

Then invoke:

```
Task(
  subagent_type = "intelligent-intake-orchestrator",
  prompt = "Process this intake request.\n\nRequest: {request_text}\n\nFlags: {parsed_flags}\n\nFollow your full workflow: Understand → Classify → Identify gaps → Ask questions (if allowed) → Generate plan → Confirm → Create Asana tasks (if not --plan-only)."
)
```

If no request text is provided (bare `/intake`), ask the user:

> What do you need built, fixed, or improved? Describe it in plain English — I'll classify it, ask a few questions if needed, and create a structured plan.

Then pass their response to the agent.

## Examples

### Simple (L1)
```
/intake Add a checkbox field called "Marketing_Opt_In__c" to the Account object in Salesforce
```
Expected: L1 classification, 0-1 questions, 1-2 task plan.

### Automation (L2)
```
/intake Create a lead routing flow that assigns leads based on territory with round-robin fallback
```
Expected: L2 classification, 2-4 questions, 4-6 task plan with Build/QA/Deploy sections.

### Process System (L3)
```
/intake Redesign the opportunity stage definitions and exit criteria for our sales process across all record types
```
Expected: L3 classification, 5-8 questions, 10-15 task plan with Discovery phase.

### JSON Mode
```
/intake --json "Update the Account page layout to include a new Revenue section"
```
Expected: Pure JSON output matching the output schema, no markdown.

### Plan Only
```
/intake --plan-only "Build a CPQ renewal automation with approval chains"
```
Expected: Full plan JSON without Asana task creation.

## Related

- `/intake-generate-form` — Generate HTML form for structured intake (legacy)
- Agent: `intelligent-intake-orchestrator`
- Config: `config/intelligent-intake-rubric.json`
