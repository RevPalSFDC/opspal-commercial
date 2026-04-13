---
name: hook-event-coverage-auditor
description: Audit hook event registrations against implemented scripts and identify undercovered lifecycle events.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
agent: opspal-core:plugin-doctor
version: 1.0.0
---

# hook-event-coverage-auditor

## When to Use This Skill

- Before a major hook refactor to establish a coverage baseline
- After a plugin release where hook behavior appears inconsistent or incomplete
- When onboarding a new plugin and need to verify all lifecycle events are handled
- When a `PreToolUse`, `PostToolUse`, `Stop`, or `PreCompact` event has no registered handler for a given tool pattern
- When the hook config (`plugin.json` or `settings.json`) references a script that does not exist on disk

**Not for**: debugging individual hook script logic — use `hook-shell-safety-hardener` for that.

## Coverage Matrix Format

| Hook Event | Registered Matcher | Script Path | Script Exists | Gap? |
|------------|--------------------|-------------|---------------|------|
| PreToolUse | `Bash` | `hooks/pre-bash-guard.sh` | Yes | No |
| PostToolUse | `mcp__sfdc__*` | `hooks/post-sfdc-audit.sh` | No | **YES** |
| Stop | `*` | `hooks/stop-reflect.sh` | Yes | No |

## Workflow

1. **Collect scope**: identify target plugin(s), hook config file paths (`plugin.json` and any `settings.json` overrides), and the event types to audit (default: all).
2. **Extract registered hooks**: use `jq '.hooks[]' plugin.json` to enumerate event type, matcher, and script path for each entry.
3. **Verify script existence**: for each registered script path, confirm the file exists and is executable (`test -x`).
4. **Scan for unregistered scripts**: glob `hooks/*.sh` and cross-reference against the registered list — scripts present on disk but not in config are orphaned.
5. **Identify uncovered events**: compare registered event types against the full lifecycle set (`PreToolUse`, `PostToolUse`, `Stop`, `PreCompact`, `Notification`) and flag any with zero coverage.
6. **Produce the coverage matrix**: output a markdown table with gap flags; annotate each gap with severity (critical if `PreToolUse` for destructive tools, low if `Notification`).
7. **Prioritize remediation**: rank gaps by blast radius — unguarded write/deploy tools first, observability gaps last.

## Safety Checks

- Read-only by default; do not modify hook configs or scripts during audit
- Distinguish runtime hooks (in `~/.claude/settings.json`) from project hooks (in `plugin.json`) — report them separately
- Flag any script that calls external APIs without a timeout as an unsafe assumption
