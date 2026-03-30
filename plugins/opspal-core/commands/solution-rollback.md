---
name: solution-rollback
description: Rollback a solution deployment to a previous checkpoint state
argument-hint: "[--checkpoint <id>] [--deployment <id>] [--list]"
---

# Solution Rollback Command

Rollback a solution deployment to a previous checkpoint state.

## Usage

```bash
/solution-rollback [options]
```

## Options

- `--checkpoint <id>` - Specific checkpoint ID to rollback to
- `--deployment <id>` - Rollback deployment by deployment ID
- `--list` - List available checkpoints
- `--force` - Skip confirmation prompt
- `--continue-on-error` - Continue rollback even if individual components fail
- `--verbose` - Enable verbose logging

## Examples

### Rollback Last Deployment
```bash
/solution-rollback
```

### Rollback Specific Checkpoint
```bash
/solution-rollback --checkpoint chkpt-abc123
```

### Rollback by Deployment ID
```bash
/solution-rollback --deployment deploy-xyz789
```

### List Available Checkpoints
```bash
/solution-rollback --list
```

### Force Rollback (No Confirmation)
```bash
/solution-rollback --checkpoint chkpt-abc123 --force
```

## Workflow

1. **Load Checkpoint** - Find and load checkpoint data
2. **Verify Status** - Ensure checkpoint is rollback-ready
3. **Confirm** - Prompt user for confirmation (unless --force)
4. **Rollback Components** - Restore each component in reverse order:
   - Delete newly created components
   - Restore modified components to previous state
   - Reactivate previously active flows
5. **Verify** - Confirm rollback completed
6. **Update Status** - Mark checkpoint as rolled back

## Output

### Confirmation Prompt
```
Rollback Confirmation

Checkpoint: chkpt-abc123
Solution: lead-management
Environment: production
Created: 2025-12-04T10:00:00Z

Components to rollback:
  1. lead-permission-set (salesforce:permissionSet) - DELETE
  2. lead-routing-flow (salesforce:flow) - RESTORE (was active)
  3. lead-score-field (salesforce:customField) - DELETE

Proceed with rollback? [y/N]
```

### Rollback Progress
```
Starting rollback to checkpoint: chkpt-abc123

Rolling back components (3 total):
  [1/3] lead-permission-set... deleted
  [2/3] lead-routing-flow... restored (activated)
  [3/3] lead-score-field... deleted

✓ Rollback completed successfully!

Summary:
  Deleted: 2 components
  Restored: 1 component
  Duration: 12s
```

### List Checkpoints Output
```
Available Checkpoints

ID              Solution           Environment  Created              Status
─────────────────────────────────────────────────────────────────────────────
chkpt-abc123    lead-management    production   2025-12-04 10:00     ready
chkpt-def456    lead-management    sandbox      2025-12-03 15:30     ready
chkpt-ghi789    quote-to-cash      production   2025-12-02 09:15     rolled_back

Total: 3 checkpoints (2 available for rollback)
```

## Rollback Actions by Component State

| Previous State | Action |
|----------------|--------|
| Did not exist | Delete component |
| Existed (captured) | Restore previous content |
| Flow was active | Restore and reactivate |
| Flow was inactive | Restore without activation |

## Error Handling

If rollback fails:
```
⚠ Rollback partially completed

Successful:
  - lead-permission-set: deleted
  - lead-routing-flow: restored

Failed:
  - lead-score-field: Field is referenced by validation rule

Recommendation:
  1. Remove the validation rule reference
  2. Re-run: /solution-rollback --checkpoint chkpt-abc123 --continue-on-error
```

## Checkpoint Retention

- Default: 10 checkpoints retained
- Retention period: 30 days
- Checkpoints are automatically cleaned up

To change retention settings, update SolutionEngine options:
```javascript
const engine = new SolutionEngine({
  maxCheckpoints: 20,
  retentionDays: 60
});
```

## Related Commands

- `/solution-deploy` - Deploy a solution
- `/solution-status` - Check deployment status
- `/solution-list` - List available solutions
