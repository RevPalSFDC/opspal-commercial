---
name: deduplicate
description: Run deduplication workflow to identify and merge duplicate records
argument-hint: "[--object Account|Contact|Lead] [--mode detect|merge|both] [--threshold 80-100]"
visibility: user-invocable
aliases:
  - dedup
  - find-duplicates
tags:
  - data-quality
  - deduplication
  - revops
---

# /deduplicate Command

Identify and optionally merge duplicate records across CRM objects using multi-layer matching (deterministic + probabilistic) with survivorship rules.

## Usage

```bash
# Detect duplicates only (safe mode)
/deduplicate --object Account --mode detect

# Detect and auto-merge high-confidence matches
/deduplicate --object Account --mode both --threshold 95

# Merge previously detected clusters
/deduplicate --mode merge --cluster-file ./clusters.json

# Full deduplication with custom threshold
/deduplicate --object Contact --mode both --threshold 85
```

## Options

| Option | Values | Default | Description |
|--------|--------|---------|-------------|
| `--object` | Account, Contact, Lead | Account | Target object type |
| `--mode` | detect, merge, both | detect | Operation mode |
| `--threshold` | 80-100 | 95 | Minimum confidence for auto-merge |
| `--review-threshold` | 60-94 | 80 | Minimum confidence for review queue |
| `--org` | [org-alias] | default | Salesforce org alias |
| `--cluster-file` | [path] | - | Load pre-detected clusters |
| `--dry-run` | true/false | false | Preview changes without executing |
| `--input` | [path] | - | JSON input data file (required for CLI detection) |

## Matching Layers

### Layer 1: Deterministic (Exact Match)
- **Domain Match** - Same website domain
- **Email Match** - Same email address
- **External ID Match** - Same DUNS, D&B, etc.

### Layer 2: Probabilistic (Fuzzy Match)
- **Name Similarity** - Jaro-Winkler distance (weight: 50)
- **Address Match** - Component-level comparison (weight: 20)
- **Phone Match** - Normalized phone comparison (weight: 10)
- **Industry/Type** - Categorical match (weight: 10)
- **Parent Account** - Hierarchy relationship (weight: 10)

## Confidence Scoring

| Score | Classification | Action |
|-------|---------------|--------|
| 95-100 | Very High | Auto-merge |
| 85-94 | High | Auto-merge with review flag |
| 70-84 | Medium | Route to review queue |
| 50-69 | Low | Flag for manual review |
| <50 | Very Low | No action (separate records) |

## Survivorship Rules

When merging, the "golden record" is selected using:

| Field | Strategy | Description |
|-------|----------|-------------|
| Name | Most Complete | Longest, most detailed name |
| Address | Most Recent | Last updated wins |
| Phone | Verified First | Prefer verified over unverified |
| Email | Quality Score | Deliverability + recency |
| Revenue | Most Recent | Latest data wins |
| Industry | Source Priority | CRM > Enrichment > Import |

## Output Example

### Detection Results
```markdown
# Duplicate Detection Results

**Object:** Account
**Records Scanned:** 5,432
**Clusters Found:** 87

## Summary by Confidence
| Confidence | Clusters | Records | Action |
|------------|----------|---------|--------|
| 95-100% | 23 | 52 | Auto-merge ready |
| 85-94% | 31 | 78 | High confidence |
| 70-84% | 33 | 89 | Review required |

## Top Clusters
### Cluster 1 (98% confidence)
- Acme Inc (001xxx001) - Master
- Acme Incorporated (001xxx002) - Merge
- ACME Inc. (001xxx003) - Merge

Match signals: same_domain, name_similarity(0.94), same_phone

### Cluster 2 (92% confidence)
...
```

### Merge Results
```json
{
  "merged": {
    "count": 23,
    "clusters": [...],
    "recordsAffected": 52
  },
  "queued": {
    "count": 31,
    "clusters": [...]
  },
  "skipped": {
    "count": 33,
    "reason": "below_threshold"
  },
  "auditTrail": "audit-2025-01-15.json"
}
```

## Rollback Support

All merges are logged with before-state snapshots:

```bash
# View merge history
node scripts/lib/governance/audit-logger.js query --type merge

# Rollback a specific merge
node scripts/lib/governance/rollback.js --snapshot-id snap_xxx123
```

## Governance Integration

- **Protected Fields**: Lead source and consent fields are never auto-merged
- **Compliance Check**: GDPR/CCPA records require explicit approval
- **Rate Limits**: Maximum 100 merges per hour (configurable)
- **Audit Trail**: Every merge logged with full before/after state

## Related Commands

- `/data-quality-audit` - Full audit including dedup analysis
- `/review-queue` - Process pending merge requests
- `/data-health` - Quick health check

## CLI Usage

```bash
# Source shared path resolver
RESOLVE_SCRIPT=""
for _candidate in \
  "${CLAUDE_PLUGIN_ROOT:+${CLAUDE_PLUGIN_ROOT}/scripts/resolve-script.sh}" \
  "$HOME/.claude/plugins/cache/revpal-internal-plugins/opspal-core"/*/scripts/resolve-script.sh \
  "$HOME/.claude/plugins/marketplaces"/*/plugins/opspal-core/scripts/resolve-script.sh \
  "$PWD/plugins/opspal-core/scripts/resolve-script.sh" \
  "$PWD/.claude-plugins/opspal-core/scripts/resolve-script.sh"; do
  [ -n "$_candidate" ] && [ -f "$_candidate" ] && RESOLVE_SCRIPT="$_candidate" && break
done
if [ -z "$RESOLVE_SCRIPT" ]; then echo "ERROR: Cannot locate opspal-core resolve-script.sh"; exit 1; fi
source "$RESOLVE_SCRIPT"

# Run detection via script
DEDUP_SCRIPT=$(find_script "deduplication/run-dedup.js")
node "$DEDUP_SCRIPT" \
  --object Account \
  --mode detect \
  --org production \
  --input ./reports/account-export.json

# Export clusters for review
EXPORT_SCRIPT=$(find_script "deduplication/export-clusters.js")
node "$EXPORT_SCRIPT" \
  --output ./clusters.json \
  --input ./reports/account-export.json
```

## Configuration

```bash
# Set default thresholds
export DEDUP_AUTO_THRESHOLD=95
export DEDUP_REVIEW_THRESHOLD=80

# Enable dry-run by default
export DEDUP_DRY_RUN=1

# Set batch size
export DEDUP_BATCH_SIZE=100
```

## Examples

### Safe duplicate detection
```bash
/deduplicate --object Account --mode detect
```

### Aggressive auto-merge (production cleanup)
```bash
/deduplicate --object Lead --mode both --threshold 90
```

### Process specific cluster file
```bash
/deduplicate --mode merge --cluster-file ./reviewed-clusters.json
```
