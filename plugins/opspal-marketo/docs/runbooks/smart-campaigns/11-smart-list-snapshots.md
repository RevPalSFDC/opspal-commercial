# Smart List Snapshot & Diff

## Overview

Smart List rules cannot be modified via API, but they **can** be read. Use snapshots to:
- Capture pre-change state before UI edits
- Compare “before” and “after” states
- Maintain an audit trail of trigger/filter changes

Snapshots are stored under:
`instances/{portal}/observability/smart-lists/{snapshotId}/`

## What Gets Captured

### Campaign Smart Lists
- Campaign ID + name
- Smart list rules (triggers + filters)
- Rule hash for diffing

### Smart List Assets (optional)
- Smart List asset ID + name
- Rules (if `includeRules` enabled)

## Snapshot Workflow

1. **Take a pre-change snapshot**
2. **Make UI changes** (or clone templates)
3. **Take a post-change snapshot**
4. **Diff the results**

## Programmatic Usage (Agent Context)

```javascript
const {
  snapshotCampaignSmartLists,
  snapshotSmartListAssets,
  diffSnapshots
} = require('../scripts/lib/smart-list-snapshot-manager');

// 1) Snapshot campaign smart lists
const before = await snapshotCampaignSmartLists('acme', {
  label: 'pre-ui-change',
  includeRules: true
});

// 2) Snapshot after UI changes
const after = await snapshotCampaignSmartLists('acme', {
  label: 'post-ui-change',
  includeRules: true
});

// 3) Diff snapshots
const diff = await diffSnapshots(
  before.outputPath,
  after.outputPath
);
```

## Notes

- Use **campaign smart list snapshots** for trigger campaigns and workflows.
- Use **smart list asset snapshots** for standalone Smart Lists in the asset tree.
- Diffs compare rule hashes; order-only changes may still appear as changed.

## Related

- [Smart List & Flow Limitations](./10-smart-list-flow-limitations.md)
- [Trigger Campaign Best Practices](../campaign-operations/trigger-campaign-best-practices.md)
