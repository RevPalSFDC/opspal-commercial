---
name: review-queue
description: Process pending data quality actions from the review queue
argument-hint: "[--action list|approve|reject|bulk] [--type merge|enrichment|correction]"
visibility: user-invocable
aliases:
  - dq-review
  - pending-actions
tags:
  - data-quality
  - review
  - governance
  - revops
---

# /review-queue Command

View and process pending data quality actions that require human review. Includes merge requests, enrichment approvals, anomaly corrections, and compliance decisions.

## Usage

```bash
# List all pending reviews
/review-queue --action list

# List only merge requests
/review-queue --action list --type merge

# Approve a specific item
/review-queue --action approve --id rev_abc123

# Reject with reason
/review-queue --action reject --id rev_abc123 --reason "Data mismatch"

# Bulk approve high-confidence items
/review-queue --action bulk --type merge --min-confidence 90
```

## Options

| Option | Values | Default | Description |
|--------|--------|---------|-------------|
| `--action` | list, approve, reject, bulk | list | Queue action |
| `--type` | merge, enrichment, correction, all | all | Filter by type |
| `--id` | [review-id] | - | Specific review item |
| `--reason` | [text] | - | Rejection reason |
| `--min-confidence` | 60-100 | 85 | Bulk approve threshold |
| `--sort` | confidence, date, type | confidence | Sort order |
| `--limit` | [number] | 20 | Max items to show |
| `--queue` | [path] | - | Override review queue JSON path |

## Review Types

### Merge Reviews
Duplicate record clusters awaiting merge approval:
- Shows matching signals and confidence score
- Displays proposed golden record
- Highlights conflicting field values

### Enrichment Reviews
Data enrichment updates below auto-approval threshold:
- Shows source and confidence
- Displays before/after values
- Lists affected records

### Correction Reviews
Anomaly corrections requiring approval:
- Role-account reassignments
- Hierarchy relationship changes
- Data normalization updates

### Compliance Reviews
Actions on protected or regulated records:
- GDPR/CCPA data subject requests
- Consent-required updates
- Protected field modifications

## Output Example

### List View
```markdown
# Review Queue

**Pending Items:** 47
**Oldest:** 3 days ago
**Avg Confidence:** 82%

## Summary by Type
| Type | Count | Avg Confidence |
|------|-------|----------------|
| merge | 23 | 85% |
| enrichment | 15 | 78% |
| correction | 7 | 74% |
| compliance | 2 | N/A |

## Pending Reviews

### [rev_abc123] Account Merge (89% confidence)
**Created:** 2025-01-14T09:30:00Z
**Type:** merge
**Records:**
- Acme Inc (001xxx001) - Proposed Master
- Acme Incorporated (001xxx002) - Merge into master

**Matching Signals:**
- ✅ same_domain (acme.com)
- ✅ name_similarity (0.91)
- ✅ same_phone (555-1234)

**Conflicting Fields:**
| Field | Record 1 | Record 2 | Proposed |
|-------|----------|----------|----------|
| Industry | Technology | IT Services | Technology |
| Employees | 250 | 300 | 300 (most recent) |

**Actions:** [Approve] [Reject] [Skip]

---

### [rev_def456] Contact Enrichment (76% confidence)
**Created:** 2025-01-14T10:15:00Z
**Type:** enrichment
**Record:** John Smith (003xxx001)

**Proposed Updates:**
| Field | Current | Proposed | Source | Confidence |
|-------|---------|----------|--------|------------|
| Title | null | VP of Sales | linkedin | 4 |
| Department | null | Sales | linkedin | 4 |
| Seniority | null | Executive | inferred | 3 |

**Note:** Seniority inferred from title (lower confidence)

**Actions:** [Approve All] [Approve Partial] [Reject]

---
```

### Detail View (Single Item)
```json
{
  "id": "rev_abc123",
  "type": "merge",
  "status": "pending",
  "createdAt": "2025-01-14T09:30:00Z",
  "confidence": 89,
  "data": {
    "cluster": {
      "records": [
        {"Id": "001xxx001", "Name": "Acme Inc"},
        {"Id": "001xxx002", "Name": "Acme Incorporated"}
      ],
      "matchSignals": ["same_domain", "name_similarity", "same_phone"],
      "conflicts": ["Industry", "Employees"]
    },
    "proposedGoldenRecord": {
      "Id": "001xxx001",
      "Name": "Acme Incorporated",
      "Industry": "Technology",
      "Employees": 300
    }
  },
  "requiredApprovers": 1,
  "approvals": [],
  "rejections": []
}
```

## Approval Workflow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Pending   │ ──► │  Approved   │ ──► │  Executed   │
└─────────────┘     └─────────────┘     └─────────────┘
       │                                       │
       │            ┌─────────────┐            │
       └──────────► │  Rejected   │            │
                    └─────────────┘            │
                                               ▼
                                        ┌─────────────┐
                                        │   Logged    │
                                        └─────────────┘
```

## Bulk Operations

### Bulk Approve
```bash
# Approve all merges with 90%+ confidence
/review-queue --action bulk --type merge --min-confidence 90

# Result:
# ✅ Approved 12 items
# ⏭️ Skipped 11 items (below threshold)
# Execution scheduled...
```

### Bulk Reject
```bash
# Reject all items older than 7 days
/review-queue --action bulk --older-than 7d --reject --reason "Stale review"
```

## Asana Integration

Reviews can be synced to Asana for team workflow:

```bash
# Create Asana task for review item
/review-queue --action export-asana --id rev_abc123

# Sync all pending to Asana project
/review-queue --action sync-asana --project "Data Quality Reviews"
```

## Audit Trail

All review decisions are logged:
```json
{
  "reviewId": "rev_abc123",
  "decision": "approved",
  "approvedBy": "user-123",
  "approvedAt": "2025-01-15T14:30:00Z",
  "comment": "Verified manually",
  "executedAt": "2025-01-15T14:30:05Z",
  "rollbackAvailable": true
}
```

## Related Commands

- `/data-quality-audit` - Full audit generates review items
- `/deduplicate` - Dedup generates merge reviews
- `/enrich-data` - Enrichment generates approval reviews
- `/data-health` - Health check shows review backlog

## CLI Usage

```bash
# List reviews via script
node .claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/scripts/lib/governance/review-queue.js list

# Approve via script
node .claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/scripts/lib/governance/review-queue.js approve \
  --id rev_abc123 \
  --user $(whoami)

# Export pending to JSON
node .claude-plugins/opspal-core-plugin/packages/opspal-core/cross-platform-plugin/scripts/lib/governance/review-queue.js export \
  --format json \
  --output ./pending-reviews.json
```

## Configuration

```bash
# Set default sort order
export REVIEW_QUEUE_SORT=confidence

# Set page size
export REVIEW_QUEUE_LIMIT=20

# Auto-execute approved items
export REVIEW_QUEUE_AUTO_EXECUTE=1

# Notification on new reviews
export REVIEW_QUEUE_NOTIFY=slack
```

## Examples

### Morning review session
```bash
/review-queue --action list --sort confidence --limit 10
```

### Approve specific merge
```bash
/review-queue --action approve --id rev_abc123
```

### Reject with reason
```bash
/review-queue --action reject --id rev_def456 --reason "Different companies"
```

### Bulk approve high-confidence
```bash
/review-queue --action bulk --min-confidence 92
```
