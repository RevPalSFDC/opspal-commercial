---
description: Snapshot and diff Smart List rules for campaign and asset backups
argument-hint: "[campaigns|assets|both] [--label=name] [--portal=id]"
---

# Smart List Snapshot

Capture Smart List rule snapshots for backup and diffing.

## Usage

```
/smart-list-snapshot [campaigns|assets|both] [--label=name] [--portal=id]
```

## Modes

- `campaigns` (default) - Snapshots Smart Lists attached to Smart Campaigns
- `assets` - Snapshots standalone Smart List assets
- `both` - Captures both types

## Output Location

Snapshots are stored under:
`instances/{portal}/observability/smart-lists/{snapshotId}/`

## Example

```
/smart-list-snapshot campaigns --label=pre-ui-change --portal=acme
```

## Related

- [Smart List Snapshot & Diff](../docs/runbooks/smart-campaigns/11-smart-list-snapshots.md)
- `/smart-campaign-api` - Smart Campaign API reference
