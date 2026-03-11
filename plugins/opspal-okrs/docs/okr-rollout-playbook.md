# OKR Rollout Playbook

A step-by-step guide for launching an OKR program within your organization using the OpsPal OKR plugin.

---

## Why OKRs Fail

Before diving into the rollout steps, understand the six most common failure modes:

1. **Trophy OKRs** — Written once, never revisited. No operating rhythm.
2. **Waterfall Targets** — Imposed top-down without data or team input.
3. **KR Stuffing** — Too many KRs per objective, mixing tasks with outcomes.
4. **Orphan Objectives** — No cascade link to company strategy.
5. **Check-In Theater** — Superficial updates that hide real status.
6. **Retrospective Amnesia** — Cycle ends without learning capture.

---

## The Nine Steps

### Step 1: Executive Alignment (Week 1-2)

**Objective:** Get the leadership team aligned on why OKRs matter.

**Owner:** CEO or COO

**Activities:**
- Present the OKR business case to the executive team
- Define the scope (company + departments, or company only for now)
- Agree on the first cycle timeline

**Artifact:** Executive alignment memo

**Success Criteria:** All executives agree to participate and support the program

---

### Step 2: Pilot Selection (Week 2-3)

**Objective:** Choose 1-2 teams for the initial pilot.

**Owner:** OKR Program Lead

**Selection Criteria:**
- Team has clear, measurable outcomes
- Manager is enthusiastic and data-oriented
- Team size is manageable (5-15 people)
- Data is available in Salesforce/HubSpot for baselines

**Artifact:** Pilot team selection rationale document

**Success Criteria:** Pilot teams confirmed with manager buy-in

---

### Step 3: Training and Enablement (Week 3-4)

**Objective:** Equip pilot teams with OKR knowledge.

**Owner:** OKR Program Lead + HR/L&D

**Workshop Agenda (90 minutes):**
1. What are OKRs? (15 min)
2. Good vs bad KRs — examples (20 min)
3. Three stances and confidence bands (15 min)
4. The operating rhythm — weekly/monthly/quarterly (15 min)
5. Hands-on: Draft one objective with 3 KRs (25 min)

**Artifact:** Workshop deck, recording, one-page reference card

**Success Criteria:** All attendees pass a brief quiz (≥80% score)

---

### Step 4: First Cycle Draft (Week 4-5)

**Objective:** Generate the first real OKR draft.

**Owner:** Pilot team managers

**How to Execute:**
```bash
/okr-generate --org <org-slug> --cycle <Q3-2026>
```

**Review Checklist:**
- [ ] Every KR has a real baseline (not a guess)
- [ ] Targets include aggressive/base/conservative stances
- [ ] 3-5 objectives, 2-5 KRs each
- [ ] No activity metrics disguised as outcomes
- [ ] Each KR has a clear owner (DRI)

**Artifact:** Draft OKR set in `orgs/{org}/platforms/okr/{cycle}/drafts/`

**Success Criteria:** Draft passes schema validation

---

### Step 5: Approval and Launch (Week 5-6)

**Objective:** Formally approve and activate the cycle.

**Owner:** Executive sponsor + pilot managers

**Approval Process:**
1. Manager presents draft to exec sponsor
2. Review baseline evidence and target rationale
3. Adjust targets if needed (use `/okr-generate` with different stance)
4. Record approval: "APPROVED: OKR-{cycle}"
5. Optionally sync to Asana: `--activate-asana`

```bash
/okr-approve --org <org-slug> --cycle <Q3-2026> --activate-asana
```

**Success Criteria:** Cycle status is "active" in the system

---

### Step 6: Operating Rhythm Activation (Week 6-8)

**Objective:** Start the cadence machine.

**How to Execute:**
```bash
/okr-cadence --org <org-slug> --cycle <Q3-2026> --action setup --activate-asana
```

This creates:
- Weekly check-in recurring tasks in Asana
- Monthly scorecard calendar entries
- Quarterly review scheduling

**Success Criteria:** First 3 weekly check-ins completed on time

---

### Step 7: Mid-Cycle Review (Mid-Quarter)

**Objective:** Formal health check at the halfway point.

```bash
/okr-status --org <org-slug> --cycle <Q3-2026>
/okr-dashboard --org <org-slug> --cycle <Q3-2026> --audience exec
```

**Intervention Triggers:**
- Any objective with overall status "off_track"
- KR with >2 weeks of stale data
- Initiative marked "blocked" for >1 week

**Artifact:** Mid-cycle scorecard with intervention list

---

### Step 8: Scale to Organization (Next Quarter)

**Objective:** Extend OKRs beyond the pilot.

**Prerequisites:**
- Pilot teams completed at least 1 full cycle
- `/okr-retrospective` completed with learnings recorded
- Executive sponsor endorses org-wide rollout

**Rollout Process:**
1. Present pilot results and learnings to all department heads
2. Run training workshops for new teams (reuse Step 3 materials)
3. Generate department OKRs with cascade links to company objectives
4. Run alignment audit before activation:

```bash
/okr-align-check --org <org-slug> --cycle <Q4-2026> --level all
```

**Success Criteria:** All departments have approved, cascade-linked OKR sets

---

### Step 9: Governance and Automation (Quarter 3+)

**Objective:** Make OKRs a sustainable, automated discipline.

**Automation Targets:**
- Weekly check-in reminders (Asana recurring tasks)
- Monthly scorecard generation (scheduled prompt)
- Dashboard auto-refresh (on-demand via `/okr-dashboard`)
- Learning engine calibration (automatic after `/okr-retrospective`)

**Governance Checks:**
- Alignment audit before every cycle activation
- Cadence health review monthly
- Calibration confidence reaches "decision-grade" (4+ cycles)

---

## Pre-Launch Readiness Checklist

- [ ] Executive alignment memo signed
- [ ] Pilot teams selected and managers briefed
- [ ] Training workshops completed
- [ ] Salesforce/HubSpot data available for baselines
- [ ] opspal-okrs plugin installed and verified
- [ ] `ORG_SLUG` environment variable configured
- [ ] First draft generated and reviewed

---

## Week-by-Week Schedule

| Week | Activity | Owner |
|------|----------|-------|
| 1 | Executive alignment kick-off | CEO/COO |
| 2 | Pilot team selection | OKR Lead |
| 3 | Training workshop delivery | OKR Lead + HR |
| 4 | First cycle draft generation | Pilot managers |
| 5 | Draft review and approval | Exec sponsor |
| 6 | Cadence setup and launch | OKR Lead |
| 7 | First weekly check-in | KR owners |
| 8 | Second weekly check-in + adjustment | KR owners |
| 9-12 | Ongoing cadence | All |
| 13 | Mid-cycle review | Exec sponsor |

---

## Sustaining the Rhythm

After the initial rollout:
- **Never skip the retrospective.** Block next cycle generation until outcomes are recorded.
- **Celebrate yellow and red.** Normalize honest status reporting.
- **Rotate the check-in facilitator.** Prevents one person from becoming the "OKR police."
- **Share wins broadly.** Use `/okr-report` to generate board-ready summaries.
- **Feed the learning engine.** Every closed cycle makes future targets more accurate.

---

## Troubleshooting Blockers

| Blocker | Solution |
|---------|----------|
| "We don't have enough data" | Start with Salesforce pipeline data only. Add more sources over time. |
| "Managers won't participate" | Executive sponsor directly communicates expectation and models behavior. |
| "OKRs feel like extra work" | Integrate with existing meetings. Replace one status meeting with OKR check-in. |
| "Targets are unrealistic" | Use three stances. Conservative is achievable, aggressive is aspirational. |
| "We lost momentum after Q1" | Re-run cadence setup. Assign a new facilitator. Reduce check-in frequency if needed. |

---

*Part of the opspal-okrs plugin v3.0.0*
