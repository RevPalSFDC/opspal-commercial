---
name: okr-change-management
description: Nine-step OKR rollout playbook, three-tier cadence design, adoption anti-patterns, and rollout timing benchmarks.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# OKR Change Management

This skill provides the complete change management framework for rolling out an OKR program. It covers the nine-step playbook, cadence tiers, anti-patterns, and timing benchmarks.

## Nine-Step OKR Rollout Playbook

### Step 1: Executive Alignment
**Objective:** Secure executive buy-in and define the "why" behind OKRs.
**Owner:** CEO / COO
**Artifact:** Executive alignment memo with OKR charter
**Success Criteria:** Executive team unanimously agrees on OKR purpose and scope
**Timeline:** Week 1-2

### Step 2: Pilot Selection
**Objective:** Choose 1-2 teams for the initial OKR pilot.
**Owner:** OKR Program Lead
**Artifact:** Pilot team selection rationale
**Success Criteria:** Pilot teams selected, managers briefed, timeline agreed
**Timeline:** Week 2-3

### Step 3: Training and Enablement
**Objective:** Train pilot teams on OKR methodology.
**Owner:** OKR Program Lead + HR
**Artifact:** Training materials, workshop recordings
**Success Criteria:** All pilot team members attend workshop, pass quiz (≥80%)
**Timeline:** Week 3-4

### Step 4: First Cycle Draft
**Objective:** Draft OKRs for the pilot teams using live data.
**Owner:** Pilot team managers
**Artifact:** Draft OKR set per pilot team
**Success Criteria:** Drafts pass schema validation, baselines are real, targets use three stances
**Timeline:** Week 4-5

### Step 5: Approval and Launch
**Objective:** Review, approve, and activate the first OKR cycle.
**Owner:** Executive sponsor + pilot team managers
**Artifact:** Approved OKR set, Asana project (optional)
**Success Criteria:** "APPROVED: OKR-{cycle}" recorded, cadence calendar published
**Timeline:** Week 5-6

### Step 6: Operating Rhythm Activation
**Objective:** Establish and begin the weekly/monthly/quarterly cadence.
**Owner:** OKR Program Lead
**Artifact:** Cadence calendar, first weekly check-in template
**Success Criteria:** First 3 weekly check-ins completed on time
**Timeline:** Week 6-8

### Step 7: Mid-Cycle Review
**Objective:** Conduct a formal mid-cycle health check.
**Owner:** Executive sponsor
**Artifact:** Mid-cycle scorecard, intervention list
**Success Criteria:** All at-risk KRs have documented interventions
**Timeline:** Mid-quarter

### Step 8: Scale to Organization
**Objective:** Extend OKRs to all departments based on pilot learnings.
**Owner:** OKR Program Lead
**Artifact:** Org-wide rollout plan, department alignment map
**Success Criteria:** All departments have approved OKR sets with cascade links
**Timeline:** Next quarter

### Step 9: Governance and Automation
**Objective:** Automate cadence, reporting, and calibration.
**Owner:** RevOps / OKR Program Lead
**Artifact:** Automated dashboards, cadence tasks, learning engine active
**Success Criteria:** Zero manual reporting, calibration engine has ≥4 cycles of data
**Timeline:** Quarter 3+

## Three-Tier Cadence Design

### Weekly Check-In (15-30 minutes)
- **Who:** KR owners + team lead
- **Format:** Async update or brief standup
- **Content:** KR progress update, blockers, help needed
- **Template:** `templates/reports/weekly-kr-update.md`
- **Red Flags:** >2 consecutive missed check-ins, same blocker reported 3+ weeks

### Monthly Scorecard (45-60 minutes)
- **Who:** Department leadership + executive sponsor
- **Format:** Synchronous meeting with pre-read scorecard
- **Content:** One-page scorecard, biggest movement, top risks, decisions needed
- **Template:** `templates/reports/monthly-scorecard.md`
- **Red Flags:** No decisions made for 2+ months, scorecard not distributed before meeting

### Quarterly Review (90-120 minutes)
- **Who:** Full leadership team
- **Format:** Formal presentation with Q&A
- **Content:** Cycle outcomes, what worked/didn't, calibration, next cycle planning
- **Template:** `templates/reports/quarterly-review.md`
- **Red Flags:** Review deferred or cancelled, no learning capture, next cycle not drafted

## Adoption Anti-Patterns (Six Failure Modes)

### 1. Trophy OKRs
**Symptom:** OKRs are written once, never checked, displayed for optics only.
**Root Cause:** No operating rhythm established; OKRs disconnected from daily work.
**Fix:** Activate weekly check-ins within 1 week of approval.

### 2. Waterfall Targets
**Symptom:** Targets are imposed top-down without team input or data grounding.
**Root Cause:** Executive team sets all targets without consulting KR owners.
**Fix:** Use collaborative drafting with three stances. Team proposes base, leadership adjusts.

### 3. KR Stuffing
**Symptom:** Objectives have 8+ KRs, many are activity metrics (not outcomes).
**Root Cause:** Conflating tasks and deliverables with measurable outcomes.
**Fix:** Enforce 2-5 KRs per objective. Apply the "would a customer notice?" test.

### 4. Orphan Objectives
**Symptom:** Team/department objectives don't link to any company objective.
**Root Cause:** OKRs written in isolation without cascade alignment.
**Fix:** Run alignment audit before approval. Block activation of unlinked objectives.

### 5. Check-In Theater
**Symptom:** Check-ins happen but are superficial — "all green" when nothing has changed.
**Root Cause:** No accountability for honest updates; fear of showing red.
**Fix:** Normalize yellow/red as healthy signals. Celebrate early escalation.

### 6. Retrospective Amnesia
**Symptom:** Cycle ends without outcome recording; same mistakes repeat.
**Root Cause:** No formal close process; team moves immediately to next cycle.
**Fix:** Block next cycle generation until `/okr-retrospective` is completed.

## Rollout Timing Benchmarks

| Company Size | Pilot Duration | Full Rollout | Steady State |
|-------------|----------------|--------------|--------------|
| <50 employees | 1 quarter | 2 quarters | Quarter 3 |
| 50-200 employees | 1 quarter | 2-3 quarters | Quarter 4 |
| 200-1000 employees | 1-2 quarters | 3-4 quarters | Quarter 5-6 |
| 1000+ employees | 2 quarters | 4-6 quarters | Quarter 7+ |

**Key Milestones:**
- **Quarter 1:** Pilot team running full cadence
- **Quarter 2:** 2-3 additional departments onboarded
- **Quarter 3:** Org-wide adoption with cascade alignment
- **Quarter 4+:** Learning engine calibration reaches decision-grade
