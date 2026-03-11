# OKR Cadence Guide

Operational guide to establishing and maintaining the weekly/monthly/quarterly operating rhythm for OKR programs.

---

## Overview

A successful OKR program requires a consistent operating rhythm — a "digital heartbeat" that ensures objectives stay visible, key results are tracked, and interventions happen early. This guide covers the three tiers of cadence, Asana integration, and red flags to watch for.

---

## Three Cadence Tiers

### Tier 1: Weekly Check-In

**Duration:** 15-30 minutes
**Participants:** KR owners + team lead
**Format:** Async (Slack/Asana update) or brief standup

**Protocol:**
1. Each KR owner updates current value and status (green/yellow/red)
2. Flag any blockers or help needed
3. Team lead reviews and acknowledges
4. At-risk items escalated to department lead

**Asana Integration:**
- Recurring task created per KR owner
- Due every Friday at 3:00 PM
- Template: `templates/reports/weekly-kr-update.md`

**Red Flags:**
- >2 consecutive missed check-ins from the same person
- Same blocker reported 3+ weeks without resolution
- All KRs reported as "green" for 4+ weeks (suspiciously optimistic)

---

### Tier 2: Monthly Scorecard

**Duration:** 45-60 minutes
**Participants:** Department leadership + executive sponsor
**Format:** Synchronous meeting with pre-read scorecard

**Protocol:**
1. OKR lead distributes scorecard 24 hours before meeting
2. Review: biggest movement this month, top 3 risks, decisions needed
3. Executive sponsor makes decisions or assigns owners
4. Action items logged in Asana with deadlines

**Asana Integration:**
- Monthly recurring task for scorecard generation
- Subtasks auto-created for decisions/action items
- Template: `templates/reports/monthly-scorecard.md`

**Red Flags:**
- Scorecard not distributed before meeting
- No decisions made for 2+ consecutive months
- Meeting regularly runs over 60 minutes (scope creep)

---

### Tier 3: Quarterly Review

**Duration:** 90-120 minutes
**Participants:** Full leadership team
**Format:** Formal presentation with Q&A

**Protocol:**
1. Run `/okr-retrospective` to capture outcomes
2. Generate review document from `templates/reports/quarterly-review.md`
3. Present: cycle summary, KR outcomes, what worked/didn't, calibration
4. Plan: next cycle objectives, adjusted targets, resource allocation
5. Approve next cycle before adjourning

**Asana Integration:**
- Quarterly milestone in Asana project
- Linked to retrospective and next-cycle approval tasks
- Template: `templates/reports/quarterly-review.md`

**Red Flags:**
- Quarterly review deferred or cancelled
- No retrospective conducted (amnesia pattern)
- Next cycle not drafted before review meeting
- Same "what didn't work" items appear multiple quarters

---

## Asana Integration Setup

```bash
# Set up the full cadence calendar with Asana tasks
/okr-cadence --org <org-slug> --cycle <Q3-2026> --action setup --activate-asana
```

This creates:
- Weekly check-in tasks (recurring, assigned to KR owners)
- Monthly scorecard tasks (recurring, assigned to OKR lead)
- Quarterly review milestone (one-time, assigned to executive sponsor)
- Mid-cycle review task (one-time, halfway through the cycle)

---

## Cadence Health Monitoring

```bash
# Check cadence health for active cycle
/okr-cadence --org <org-slug> --cycle <Q3-2026> --action review
```

The health review checks:
- Check-in completion rate (target: >90%)
- Average check-in delay (target: <2 days)
- Scorecard distribution timeliness
- Decision-to-action conversion rate
- Stale KR data detection

---

## Quick Reference

| Tier | Frequency | Duration | Key Output | Tool |
|------|-----------|----------|-----------|------|
| Weekly | Every week | 15-30 min | KR status update | `/okr-status` |
| Monthly | Every month | 45-60 min | One-page scorecard | `/okr-report` |
| Quarterly | End of quarter | 90-120 min | Full review + next plan | `/okr-retrospective` |

---

*Part of the opspal-okrs plugin v3.0.0*
