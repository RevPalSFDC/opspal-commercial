---
name: postmortem-rca-writer
description: Produce consistent post-incident RCA documents with corrective actions, ownership, and prevention tracking.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:solution-analyzer
version: 1.0.0
---

# postmortem-rca-writer

## When to Use This Skill

- Writing the postmortem document after a Salesforce Flow failure, integration outage, or data-corruption incident is resolved
- Structuring RCA findings from an evidence bundle produced by `evidence-capture-packager`
- Ensuring corrective actions have owners, due dates, and traceable backlog items before the postmortem is shared with stakeholders
- Converting a raw incident timeline (chat log, Slack thread, alert history) into a structured, blameless RCA document
- Producing a prevention backlog that feeds into the next sprint or release cycle planning

**Not for**: Running the incident triage and command workflow — use `incident-commander-checklist` first; this skill picks up after stabilization.

## Required Inputs

| Input | Description |
|-------|-------------|
| Incident timeline | Chronological event log with timestamps (declaration → resolution) |
| Impact metrics | Records affected, downtime duration, revenue impact estimate, users impacted |
| Root-cause evidence | Tool call outputs, logs, API traces, or diff results that support the conclusion |

## Output Artifacts

- RCA draft with blameless narrative, contributing factors, and root cause chain
- Corrective action log: each action has an owner, due date, priority (P1/P2/P3), and linked backlog item
- Prevention backlog: systemic improvements to prevent recurrence (monitoring, tests, process changes)

## Workflow

1. Load the incident timeline and evidence bundle; confirm the timeline is complete from declaration to resolution.
2. Identify the immediate trigger (what broke), the contributing conditions (why it was possible), and the root cause (the systemic gap that allowed it).
3. Draft the RCA narrative using the "5 Whys" structure — write in blameless, system-focused language throughout.
4. Generate the corrective action log: for each identified gap, specify the action, owner, due date, and priority. No unassigned actions.
5. Produce the prevention backlog: separate immediate fixes (P1, within sprint) from systemic improvements (P2/P3, roadmap).
6. Review the draft against the evidence bundle — every causal claim must cite a specific artifact (log line, API response, screenshot timestamp).

## Safety Checks

- Evidence-backed conclusions only — no inferred causes without supporting artifacts cited
- No blame language: name systems, configurations, and processes — never individual people
- Every corrective action requires an owner and due date before the document is finalized
