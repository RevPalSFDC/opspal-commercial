---
name: revops-maturity
description: Run a unified RevOps maturity assessment across all connected platforms — produces maturity score, benchmark comparison, and remediation roadmap
argument-hint: "[optional: --platforms sf,hs,mk] [--org <slug>]"
intent: Execute the platform's signature cross-platform maturity diagnostic for RevOps readiness
dependencies: [revops-maturity-orchestrator]
failure_modes: [no_platforms_connected, org_slug_missing]
---

# RevOps Maturity Assessment

Run the platform's signature diagnostic — a unified RevOps maturity assessment across all connected platforms.

## Usage

```
/revops-maturity                           # Assess all connected platforms
/revops-maturity --platforms sf,hs         # Salesforce + HubSpot only
/revops-maturity --platforms sf            # Salesforce only
/revops-maturity --org acme-corp           # Specify org explicitly
```

## What You Get

1. **Maturity Score** (1-5) across 6 dimensions:
   - Data Foundation, Process Automation, Revenue Intelligence
   - Governance & Compliance, Cross-Platform Integration, Strategic Planning

2. **Benchmark Comparison** against industry peers

3. **Interactive Dashboard** (HTML) with radar chart and drill-downs

4. **Branded PDF Report** with executive summary

5. **Remediation Roadmap** prioritized by impact and effort

## Instructions

Route to `opspal-core:revops-maturity-orchestrator` agent. The orchestrator will:
1. Launch platform-specific auditors in parallel
2. Retrieve industry benchmarks
3. Normalize scores to the 6-dimension rubric
4. Generate dashboard, report, and PDF

## Prerequisites

- At least one platform connected (SF, HS, or MK)
- ORG_SLUG set (or provided via --org)
- For cross-platform integration scoring: 2+ platforms required
