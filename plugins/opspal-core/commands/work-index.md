---
name: work-index
description: Manage client work request index for project memory
argument-hint: "<subcommand> [options]"
visibility: user-invocable
aliases:
  - wi
  - project-log
  - work-log
tags:
  - project-memory
  - client-management
  - work-tracking
---

# /work-index Command

Manage client work request indexes - your project memory across sessions. Track requests, deliverables, status, and quickly retrieve context for any client.

## Usage

```bash
# List all work for a client
/work-index list <org>

# Search across all clients
/work-index search <query>

# Add a new work request
/work-index add <org> --title "CPQ Assessment" --classification audit

# Update request status
/work-index update <org> WRK-20260129-001 --status completed

# Generate client summary report
/work-index summary <org>

# Get context for session start (recent work + follow-ups)
/work-index context <org>

# List all orgs with work indexes
/work-index orgs

# View dashboard of all work across orgs
/work-index dashboard

# Backfill: Scan org folder and create entries from discovered files
/work-index init <org> [--dry-run] [--rescan]
```

## Subcommands

### list

List work requests for a specific client.

```bash
/work-index list acme-corp
/work-index list acme-corp --status completed
/work-index list acme-corp --since 2026-01
/work-index list acme-corp --type audit --limit 10
```

| Option | Description |
|--------|-------------|
| `--status` | Filter by status (requested, in-progress, completed, follow-up-needed) |
| `--type` | Filter by classification (audit, report, build, migration, etc.) |
| `--since` | Filter by date (YYYY-MM or YYYY-MM-DD) |
| `--limit` | Maximum results to show |
| `--json` | Output as JSON |

### search

Search work requests across all clients.

```bash
/work-index search "cpq"
/work-index search "automation" --org acme-corp
/work-index search "pipeline" --type report
```

| Option | Description |
|--------|-------------|
| `--org` | Limit search to specific org |
| `--type` | Filter by classification |
| `--json` | Output as JSON |

### add

Add a new work request entry.

```bash
/work-index add acme-corp \
  --title "CPQ Assessment and Remediation Plan" \
  --classification audit \
  --sub-type cpq-assessment \
  --abstract "Comprehensive Q2C audit with automation cascade analysis"
```

| Option | Required | Description |
|--------|----------|-------------|
| `--title` | Yes | Short title (5-200 chars) |
| `--classification` | Yes | Category (see taxonomy below) |
| `--sub-type` | No | Sub-type within classification |
| `--abstract` | No | Brief summary (max 500 chars) |
| `--platforms` | No | Comma-separated platform list |
| `--tags` | No | Comma-separated tags |

### update

Update an existing work request.

```bash
/work-index update acme-corp WRK-20260129-001 --status completed
/work-index update acme-corp WRK-20260129-001 --status follow-up-needed \
  --abstract "Assessment complete, remediation planning needed"
```

| Option | Description |
|--------|-------------|
| `--status` | New status value |
| `--title` | Update title |
| `--abstract` | Update summary |

### summary

Generate a summary report for a client.

```bash
/work-index summary acme-corp
/work-index summary acme-corp --format json
/work-index summary acme-corp --since 2026-01
```

| Option | Description |
|--------|-------------|
| `--format` | Output format (markdown, json) |
| `--since` | Filter by date |

### context

Load recent work and pending follow-ups for session context.

```bash
/work-index context acme-corp
/work-index context acme-corp --json
```

This is typically called automatically at session start when `ORG_SLUG` is set.

### dashboard

View a summary dashboard of work across all orgs.

```bash
/work-index dashboard
/work-index dashboard --json
```

Shows:
- Total organizations and requests
- Breakdown by status (completed, in-progress, follow-up-needed)
- Breakdown by classification (audit, report, build, etc.)
- Items needing attention (in-progress or follow-up-needed)
- Recent work from the last 30 days

### orgs

List all organizations with work indexes.

```bash
/work-index orgs
/work-index orgs --json
```

### init (Backfill)

Scan the org folder and backfill the work index from discovered files. Use this when:
- Onboarding a client with existing work
- Retroactively cataloging untracked deliverables
- Recovering from a lost or corrupted work index

```bash
# Preview what would be added (recommended first)
/work-index init acme-corp --dry-run

# Execute backfill
/work-index init acme-corp

# Re-scan and update existing entries
/work-index init acme-corp --rescan

# Interactive mode - review each file before adding
/work-index init acme-corp --interactive
```

| Option | Description |
|--------|-------------|
| `--dry-run` | Preview only, don't modify WORK_INDEX.yaml |
| `--rescan` | Re-process files that are already tracked |
| `--interactive`, `-i` | Review each file interactively before adding |
| `--json` | Output as JSON |

**Interactive Mode:**

In interactive mode, you'll be prompted for each discovered file with:
- **[Enter]** - Accept with current classification
- **[s]** - Skip this file
- **[c]** - Change classification before accepting
- **[q]** - Quit and save accepted entries

**What gets scanned:**

| File Pattern | Classification | Sub-Type |
|--------------|---------------|----------|
| `*cpq*`, `*q2c*` | audit | cpq-assessment |
| `*revops*`, `*pipeline*` | audit | revops-audit |
| `*automation*`, `*flow*` | audit | automation-audit |
| `*security*`, `*permission*` | audit | security-audit |
| `*discovery*`, `*metadata*` | audit | discovery |
| `*report*`, `*summary*` | report | executive-report |
| `*dashboard*` | report | custom-dashboard |
| `*field-dictionary*` | configuration | field-config |
| `*migration*`, `*import*` | migration | data-import |

**Scan depth:** 3 levels deep from org folder

**Supported file types:** `.md`, `.pdf`, `.json`, `.yaml`, `.csv`, `.html`

## Classification Taxonomy

| Classification | Sub-Types | Description |
|----------------|-----------|-------------|
| **audit** | cpq-assessment, revops-audit, automation-audit, security-audit, data-quality-audit, permission-audit | Assessment and analysis work |
| **report** | executive-report, pipeline-report, forecast-report, compliance-report, custom-dashboard | Report and dashboard creation |
| **build** | flow-development, trigger-development, validation-rule, permission-set, report-dashboard, layout-design | Development and configuration |
| **migration** | data-import, data-export, schema-migration, platform-migration | Data and schema migrations |
| **configuration** | field-config, object-setup, automation-config, territory-setup | System configuration work |
| **consultation** | architecture-review, process-design, best-practices | Advisory and planning work |
| **support** | bug-fix, troubleshooting, training, documentation | Support and maintenance |

## Status Values

| Status | Description | Transitions To |
|--------|-------------|----------------|
| `requested` | Work requested but not started | in-progress, on-hold, cancelled |
| `in-progress` | Work actively being performed | completed, follow-up-needed, on-hold |
| `completed` | Work finished | follow-up-needed |
| `follow-up-needed` | Completed but needs additional action | in-progress, completed |
| `on-hold` | Paused pending external input | in-progress, cancelled |
| `cancelled` | Work cancelled | (terminal state) |

## Request ID Format

IDs follow the pattern: `WRK-YYYYMMDD-NNN`

- `WRK` - Prefix
- `YYYYMMDD` - Request date
- `NNN` - Sequence number for that day (001, 002, etc.)

Example: `WRK-20260129-001`

## Session Tracking

Session IDs are automatically captured by hooks when work is performed. This provides traceability without manual entry.

Sessions are stored with:
- `session_id` - Claude Code session identifier
- `date` - Date of the session
- `type` - initial, continuation, or follow-up
- `summary` - Brief description of what was done

## Storage Location

Work indexes are stored per-client:

```
orgs/{org_slug}/WORK_INDEX.yaml
```

For legacy structures, also checked:
- `instances/salesforce/{org}/WORK_INDEX.yaml`
- `instances/{org}/WORK_INDEX.yaml`

## Auto-Population

Work index entries are automatically created/updated by:

1. **Post-assessment hook** - After assessment agents (CPQ, RevOps, etc.) complete
2. **Session end** - Prompt to log work at session end (optional)
3. **Reflection link** - When `/reflect` is run, reflections can be linked

## Context Loading at Session Start

When `ORG_SLUG` is set, the pre-task hook automatically displays:

```
📋 Recent work for acme-corp:
- WRK-20260125-001: CPQ Assessment (completed)
- WRK-20260128-001: Pipeline Dashboard (in-progress)

⚠️ Open follow-ups:
- WRK-20260125-001: Schedule remediation session
```

## CLI Usage

```bash
# Run directly via Node
node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/work-index-manager.js list acme-corp

# Schema utilities
node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/work-index-schema.js classifications
node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/work-index-schema.js statuses
node ${CLAUDE_PLUGIN_ROOT}/scripts/lib/work-index-schema.js generate-id 2026-01-29 1
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ORG_SLUG` | - | Current org for context loading |
| `WORK_INDEX_VERBOSE` | 0 | Enable verbose logging |

## Related Commands

- `/reflect` - Submit session reflection (can link to work request)
- `/asana-link` - Link Asana project to work
- `/migrate-schema` - Migrate to org-centric structure

## Examples

### Start of Session Workflow

```bash
# Set org context
export ORG_SLUG=acme-corp

# Check what's pending
/work-index context acme-corp

# Start work on follow-up
/work-index update acme-corp WRK-20260125-001 --status in-progress
```

### After Completing Work

```bash
# Mark as completed with summary
/work-index update acme-corp WRK-20260129-001 \
  --status completed \
  --abstract "Deployed 15 flows, 3 triggers, and updated 8 permission sets"
```

### Quick Search

```bash
# Find all CPQ work across clients
/work-index search "cpq"

# Find audits for specific client
/work-index search "audit" --org eta-corp
```

### Generate Client Report

```bash
# Full summary
/work-index summary acme-corp

# Since Q4
/work-index summary acme-corp --since 2025-10

# For automation/API consumption
/work-index summary acme-corp --format json
```
