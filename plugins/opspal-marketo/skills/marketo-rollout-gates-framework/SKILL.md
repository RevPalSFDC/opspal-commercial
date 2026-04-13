---
name: marketo-rollout-gates-framework
description: Apply preflight and launch gates for Marketo program and campaign deployments.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-marketo:marketo-orchestrator
version: 1.0.0
---

# marketo-rollout-gates-framework

## When to Use This Skill

- Before activating a new smart campaign or batch email program in production for the first time
- When deploying a cloned program that includes dependency changes (new tokens, updated suppression lists, modified Smart List rules)
- Before a coordinated multi-program launch (webinar series, nurture track activation) where ordering matters
- Validating that integration dependencies (SFDC sync, webhook endpoints, Launchpoint services) are healthy before a high-stakes send
- Producing a formal go/no-go record required by change management or compliance process

**Not for**: routine daily campaign sends with no configuration changes (use `marketo-campaign-execution-operations`) or post-launch incident response (use `marketo-incident-response-playbook`).

## Gate Checklist Summary

| Gate | Validation Method | Block on Failure |
|------|------------------|-----------------|
| Asset approval | `mcp__marketo__email_get`, `mcp__marketo__landing_page_get` | Yes |
| Smart List lead count | `mcp__marketo__campaign_get_smart_list` | Yes if 0 or >150% expected |
| Suppression lists | Query global suppression list membership | Yes |
| Token completeness | Check all `{{program.X}}` tokens defined | Yes |
| SFDC sync healthy | `mcp__marketo__sync_status` error rate <1% | Yes |
| Webhook/integration reachable | Connectivity check to dependent endpoints | Yes for P1 integrations |
| Communication limit headroom | API usage check against daily quota | Warn if >70% consumed |
| Stakeholder approval | Explicit written sign-off captured | Yes for P1/P2 campaigns |

## Required Inputs

- Program and campaign IDs for the rollout scope
- Planned launch window and any blackout constraints
- Approval requirements (stakeholder names, sign-off format)

## Output Artifacts

- Go/no-go checklist with pass/fail status per gate
- Launch validation report with evidence for each gate
- Rollback and fallback path with specific reversal steps

## Workflow

1. **Define rollout scope**: enumerate all programs, campaigns, assets, and integrations involved in this launch.
2. **Run asset and configuration gates**: validate all emails, landing pages, and forms are approved; verify all tokens are populated; confirm Smart List lead count is within expected range.
3. **Validate integration health**: check SFDC sync status, webhook endpoint reachability, and any Launchpoint partner service dependencies.
4. **Confirm suppression and compliance**: verify global suppression lists are current; confirm communication limit headroom is adequate for the send volume.
5. **Capture stakeholder approval**: obtain and record explicit go/no-go sign-off from the campaign owner and RevOps lead before proceeding.
6. **Execute with abort criteria**: define the specific condition (e.g., delivery rate below 70% at 15 minutes) that triggers an immediate abort and rollback.
7. **Produce launch validation report**: record gate results, approvals, execution timestamps, and rollback path as a durable artifact.

## Safety Checks

- Enforce approval checkpoints before any production activation
- Validate all integration dependencies are healthy before launch
- Stop rollout immediately and execute rollback on any hard gate failure
