# OpsPal Mandatory Route Approval Governance Pack

Source Fingerprint: `305808dbe315d5f1`

## Objective
Enforce explicit approval governance for production-impacting recommendations in mandatory-route plugin scope.

## Mandatory Route Plugin Inventory

| Plugin | Owner | Status | Mandatory Agents | Commands |
|---|---|---|---:|---:|
| `opspal-marketo` | `revpal-marketing-ops` | `active` | 25 | 30 |
| `opspal-salesforce` | `revpal-salesforce` | `active` | 20 | 60 |
| `opspal-core` | `revpal-platform` | `active` | 7 | 90 |
| `opspal-hubspot` | `revpal-hubspot` | `active` | 6 | 34 |
| `opspal-gtm-planning` | `revpal-gtm` | `active` | 1 | 15 |

## Governed Opportunity Coverage

| Opportunity | Title | Risk | Required Approvals | Required Roles | Approval Required |
|---|---|---|---:|---|---|
| `OPP-003` | Copilot Approval Queue for Mandatory Route Outputs | `critical` | 3 | `domain-owner, platform-owner, security-owner` | `yes` |
| `OPP-004` | Cross-Plugin Command Telemetry Contract | `high` | 2 | `domain-owner, platform-owner` | `yes` |
| `OPP-007` | Manual Review Load Reduction in Dedup and Routing | `high` | 2 | `domain-owner, platform-owner` | `yes` |
| `OPP-009` | Unified RevOps Next-Best-Action Layer | `high` | 2 | `domain-owner, platform-owner` | `yes` |
| `OPP-001` | Capability Narrative Drift Guardrail | `medium` | 1 | `domain-owner` | `no` |
| `OPP-010` | Forecast and Simulation Standardization | `medium` | 1 | `domain-owner` | `no` |
| `OPP-011` | Initiative ROI Instrumentation Layer | `medium` | 1 | `domain-owner` | `no` |
| `OPP-012` | Strategy Dashboard Gap Category Feeds | `medium` | 1 | `domain-owner` | `no` |

## Risk-to-Approval Policy

| Risk Class | Required Approvers | Required Roles |
|---|---:|---|
| `low` | 1 | `domain-owner` |
| `medium` | 1 | `domain-owner` |
| `high` | 2 | `domain-owner, platform-owner` |
| `critical` | 3 | `domain-owner, platform-owner, security-owner` |

## Queue Snapshot
- Queue file present: `yes`
- Queue file: `state/copilot-approval-queue.json`
- Total requests: 6
- Pending: 0
- Approved: 6
- Rejected: 0
- Pending high/critical: 0

## Operational Controls
- Use risk-based approver role requirements before status transition to approved.
- Keep queue state in `state/copilot-approval-queue.json` and decision log in append-only NDJSON.
- Run `npm run next-actions:promote` after approval decisions to refresh runtime handoff exports.
