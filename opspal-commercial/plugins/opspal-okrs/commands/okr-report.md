---
name: okr-report
description: Generate an executive OKR report in BLUF+4 format with branded output, confidence context, and board-level metrics
argument-hint: "--org <org-slug> --cycle <Q3-2026|H2-2026> [--audience board|exec|department] [--format pdf|markdown] [--include-appendix] [--portrait]"
intent: Package the current OKR state into a leadership-ready narrative with explicit decisions, risks, and confidence.
dependencies: [opspal-okrs:okr-executive-reporter, status_snapshot, pdf_generation_service]
failure_modes: [status_snapshot_missing, board_scoreline_missing, audience_mode_invalid, pdf_render_failure]
telemetry-contract: opspal-command-telemetry-v1
telemetry-enabled: true
visibility: user-invocable
aliases:
  - okr-exec-report
  - board-okr-report
tags:
  - okr
  - reporting
  - executive
---

# /okr-report Command

Generate a leadership-ready OKR report for the selected cycle. The default output is a branded executive report in **landscape orientation** (better for tables and KPI strips) that leads with the decision-ready summary, then backs it with objective health, confidence bands, and the five numbers leadership expects to see. Pass `--portrait` to override to portrait orientation.

## Usage

```bash
# Generate the standard board-ready PDF
/okr-report --org acme-corp --cycle Q3-2026

# Produce an executive markdown version for async review
/okr-report --org acme-corp --cycle Q3-2026 --audience exec --format markdown

# Add appendix detail for department leads
/okr-report --org acme-corp --cycle Q3-2026 --audience department --include-appendix
```

## Report Standard

The report follows a BLUF+4 structure:

1. **BLUF** - The one-page answer: overall health, key decision, and what leadership should do next
2. **Business Scoreline** - ARR growth, NRR, pipeline coverage, burn multiple, KR completion rate
3. **Objective Health** - Traffic-light status with confidence commentary
4. **Risks and Interventions** - What is off track, why, and the recovery action
5. **Forward View** - What changes next cycle, what needs approval, and what to watch

## Output

| Artifact | Location | Purpose |
|----------|----------|---------|
| Executive report | `orgs/{org}/platforms/okr/{cycle}/reports/okr-executive-report-{cycle}.pdf` | Branded leadership PDF |
| Source narrative | `orgs/{org}/platforms/okr/{cycle}/reports/okr-executive-report-{cycle}.md` | Editable markdown source |
| Appendix data | `orgs/{org}/platforms/okr/{cycle}/reports/okr-executive-report-{cycle}.json` | Metric payload and confidence context |

## Execution

This command invokes the `okr-executive-reporter` agent.

```javascript
Task({
  subagent_type: 'opspal-okrs:okr-executive-reporter',
  prompt: `Create an OKR executive report for org: ${org || process.env.ORG_SLUG}
    Cycle: ${cycle}
    Audience: ${audience || 'board'}
    Format: ${format || 'pdf'}
    Include appendix: ${includeAppendix ? 'yes' : 'no'}

    Produce:
    1. BLUF+4 narrative
    2. Board-level five-number summary
    3. Traffic-light health with confidence commentary
    4. Clear decisions, risks, and next actions`
});
```

## Audience Modes

| Audience | Emphasis |
|----------|----------|
| Board | Company scoreline, material risks, decisions required |
| Exec | Functional tradeoffs, owners, recovery actions |
| Department | Objective detail, initiative dependencies, operating notes |

## Related Commands

- `/okr-status` - Generate the current status source data
- `/okr-prioritize` - Show the rationale behind initiative selection
- `/generate-report` - Shared report infrastructure used across the suite
