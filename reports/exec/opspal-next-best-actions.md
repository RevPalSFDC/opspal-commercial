# OpsPal Next-Best Actions

Source Fingerprint: `7e36e91303c4e369`
Source Input: `reports/exec/opspal-gap-priority-matrix.csv`

## Ranked Actions

| Rank | Action ID | Opportunity | Title | Risk | Confidence | Triage Label | Rank Score | Approval Required | Owner |
|---|---|---|---|---|---:|---|---:|---|---|
| 1 | `nba-opp-003` | `OPP-003` | Copilot Approval Queue for Mandatory Route Outputs | critical | 0.90 | `auto_route` | 14.50 | yes | `revpal-platform` |
| 2 | `nba-opp-001` | `OPP-001` | Capability Narrative Drift Guardrail | medium | 0.85 | `auto_route` | 14.25 | no | `revpal-platform` |
| 3 | `nba-opp-005` | `OPP-005` | Data Hygiene Sunset Completion | high | 0.85 | `auto_route` | 14.25 | yes | `revpal-platform` |
| 4 | `nba-opp-009` | `OPP-009` | Unified RevOps Next-Best-Action Layer | high | 0.90 | `auto_route` | 13.50 | yes | `revpal-platform` |
| 5 | `nba-opp-002` | `OPP-002` | AI Maturity Uplift for Lowest-Coverage Plugins | medium | 0.65 | `assisted_review` | 11.25 | no | `revpal-platform` |
| 6 | `nba-opp-004` | `OPP-004` | Cross-Plugin Command Telemetry Contract | high | 0.65 | `assisted_review` | 11.25 | yes | `revpal-platform` |
| 7 | `nba-opp-007` | `OPP-007` | Manual Review Load Reduction in Dedup and Routing | high | 0.65 | `assisted_review` | 11.25 | yes | `revpal-platform` |
| 8 | `nba-opp-012` | `OPP-012` | Strategy Dashboard Gap Category Feeds | medium | 0.65 | `assisted_review` | 11.25 | no | `revpal-platform` |
| 9 | `nba-opp-011` | `OPP-011` | Initiative ROI Instrumentation Layer | medium | 0.65 | `assisted_review` | 10.25 | no | `revpal-platform` |
| 10 | `nba-opp-006` | `OPP-006` | Monday Plugin Graduation Readiness | medium | 0.60 | `manual_review` | 9.00 | no | `revpal-experimental` |
| 11 | `nba-opp-008` | `OPP-008` | Cross-Model Consultation Expansion | medium | 0.60 | `manual_review` | 9.00 | no | `revpal-ai` |
| 12 | `nba-opp-010` | `OPP-010` | Forecast and Simulation Standardization | medium | 0.60 | `manual_review` | 9.00 | no | `revpal-gtm` |

## Shadow-Mode Triage

- Mode: `shadow` (non-blocking; no routing changes).
- Policy source: `reports/exec/opspal-manual-review-reduction-pack.json`
- Thresholds: auto-route `>= 0.85`, assisted-review `>= 0.65`, manual-review `< 0.65`
- Distribution: auto-route `4` (0.33), assisted-review `5` (0.42), manual-review `3` (0.25)

## Handoff

- Approval payloads are generated in `reports/exec/approval-payloads/`.
- Use `npm run copilot:approval -- submit --input <payload>` for manual submission.
- Use `node scripts/generate-next-best-actions.js --submit --top 5` for bulk submission of top actions requiring approval.
