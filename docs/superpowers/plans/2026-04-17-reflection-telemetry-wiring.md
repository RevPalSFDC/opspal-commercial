# Reflection Telemetry Wiring: Populating skills_used, missing_skills, missing_agents

> **Status:** follow-up spec — run `superpowers:brainstorm` before writing implementation tasks.
> **Filed:** 2026-04-17
> **Origin:** reflection-remediation-2026-04-17 branch, Task 5

## Problem

The reflection schema has three fields designed to capture session-level skill telemetry:
`skills_used`, `missing_skills`, and `missing_agents`. These fields are present in every
reflection record, but in the 90-day corpus of 592 reflections, only 20 records have a
non-empty `skills_used` array — a 96.6% empty rate. The `missing_skills` and `missing_agents`
fields are universally empty. This means six months of reflection data cannot answer the
most important pipeline questions: which skills are actually being used in production, which
are being requested but don't exist, and which agents are missing from the routing table.
Without this data, the 90-day analysis can only reason about issues (root causes,
recommendations) — not about whether the right tools were available or invoked.

## Source reflections / analysis

- Corpus analysis: 572/592 reflections have `skills_used: []` — the field exists on all records but nothing writes to it at session end
- Corpus analysis: `missing_skills` and `missing_agents` are `[]` on all 592 records — no instrumentation captures skill gaps
- The reflection schema (`data.skills`, `data.wiring`, `data.instrumentation_gaps`) supports structured skill telemetry but no session lifecycle hook populates it
- `opspal-core:reflect` command writes the reflection record but does not query session tool-invocation history before writing

## Target plugins

- `opspal-core` (primary: `reflect` command is the write path; session lifecycle hooks are the capture point)
- `dev-tools/reflection-pipeline` (secondary: schema validation and backfill tooling)

## Open questions for brainstorm

1. Where in the session lifecycle should `skills_used` be captured? Options: (a) at session end via a Stop hook that aggregates tool calls, (b) real-time via PostToolUse hooks that append to a session-local buffer, (c) within the `reflect` command itself by inspecting a session log. Which is most reliable?
2. How do we distinguish "skills legitimately available" from "skills the user actually invoked"? The `reflect` command knows the current plugin manifest but not which skills ran in this session unless something tracked them.
3. What counts as a "missing skill"? Is it (a) something the user asked for that wasn't routed, (b) a tool call that failed with "not found", or (c) a pattern in the session that matches no skill's description?
4. What's the migration path for the 572 records with empty arrays — is backfill from session logs possible, or do we accept the gap and start fresh from the wiring date?

## Out of scope

- Retroactive backfill of the 572 empty records unless session log artifacts are verifiably available
- Changes to the Supabase reflection schema (the fields already exist; this is about populating them)
- Skill-level performance metrics beyond presence/absence (invocation duration, error rates — separate observability concern)

## Pre-requisites

- Understanding of what session log format (if any) `opspal-core` writes at Stop-hook time — check `session-continuity-ops` skill and Stop hook definitions before brainstorming

---
**Next step:** Run `superpowers:brainstorm` with this stub as input.
