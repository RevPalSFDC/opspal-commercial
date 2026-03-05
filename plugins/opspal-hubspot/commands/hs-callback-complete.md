---
name: hs-callback-complete
description: Complete a pending HubSpot workflow callback with output fields
argument-hint: "--callback <id> [--status success|failure] [--output <json>]"
arguments:
  - name: callback
    description: Callback ID to complete
    required: false
  - name: status
    description: Status value (success, failed, etc.)
    required: false
  - name: output
    description: JSON output fields
    required: false
---

# /hs-callback-complete - Complete Workflow Callback

Complete a pending HubSpot workflow callback for async custom actions.

## Usage

```bash
/hs-callback-complete                                        # Interactive mode
/hs-callback-complete --callback abc123                      # Complete specific callback
/hs-callback-complete --callback abc123 --status success     # With status
/hs-callback-complete --callback abc123 --output '{"key":"value"}'  # With JSON output
```

## Prerequisites

### Authentication

```bash
echo $HUBSPOT_ACCESS_TOKEN
```

### Pending Callback

You must have a pending callback from a workflow that returned BLOCK state.

## Workflow

### Step 1: Identify Callback

If callback ID not provided, check for pending callbacks:

```javascript
const CallbackStateManager = require('./scripts/lib/callback-state-manager');

const manager = new CallbackStateManager({
  accessToken: process.env.HUBSPOT_ACCESS_TOKEN
});

const pending = manager.getPendingCallbacks();

// Display pending callbacks
pending.forEach(cb => {
  console.log(`${cb.callbackId}`);
  console.log(`  Expires: ${cb.expiresAt}`);
  console.log(`  Metadata: ${JSON.stringify(cb.metadata)}`);
});
```

### Step 2: Gather Output Fields

Ask user for output field values based on action definition:

```markdown
Enter output field values:

**status** (enumeration: success, failed, pending)
> success

**result_message** (string)
> Contact enriched successfully

**processed_at** (datetime)
> [auto-filled: current timestamp]
```

### Step 3: Complete Callback

**Using State Manager:**

```javascript
await manager.completeCallback(callbackId, {
  status: 'success',
  result_message: 'Contact enriched successfully',
  processed_at: new Date().toISOString()
});
```

**Using MCP Tool:**

```javascript
await mcp__hubspot-v4__callback_complete({
  callbackId: 'abc123',
  outputFields: {
    status: 'success',
    result_message: 'Contact enriched successfully'
  }
});
```

### Step 4: Verify Completion

```markdown
## Callback Completed Successfully

**Callback ID:** {callbackId}
**Status:** Completed
**Completed At:** {timestamp}

### Output Fields Sent:
```json
{
  "status": "success",
  "result_message": "Contact enriched successfully",
  "processed_at": "2026-01-19T12:00:00Z"
}
```

### What Happens Next

1. HubSpot receives the completion signal
2. The paused workflow resumes
3. Subsequent actions can use output fields for branching
4. Record continues through workflow
```

## Quick Complete

For simple success completions:

```bash
# Auto-complete with default success
/hs-callback-complete --callback abc123 --quick
```

This sends:
```json
{
  "outputFields": {
    "status": "success"
  }
}
```

## Output Field Types

| Type | Format | Example |
|------|--------|---------|
| `string` | Text | `"Hello world"` |
| `number` | Numeric | `42` |
| `bool` | Boolean | `true` |
| `date` | ISO date | `"2026-01-19"` |
| `datetime` | ISO datetime | `"2026-01-19T12:00:00Z"` |
| `enumeration` | Defined value | `"success"` |

## Batch Completion

Complete multiple callbacks:

```bash
/hs-callback-complete --batch '["abc123","def456","ghi789"]' --status success
```

```javascript
const callbackIds = ['abc123', 'def456', 'ghi789'];
const outputFields = { status: 'success' };

for (const callbackId of callbackIds) {
  try {
    await manager.completeCallback(callbackId, outputFields);
    console.log(`✓ ${callbackId}`);
  } catch (error) {
    console.error(`✗ ${callbackId}: ${error.message}`);
  }
}
```

## Callback Status Check

Check status before completing:

```bash
/hs-callback-complete --callback abc123 --check
```

```markdown
## Callback Status

**ID:** abc123
**Status:** PENDING
**Registered:** 2026-01-19T10:00:00Z
**Expires:** 2026-01-20T10:00:00Z
**Time Remaining:** 22 hours

**Metadata:**
- contactId: 12345
- processType: enrichment

Ready to complete? (y/n)
```

## List Pending Callbacks

```bash
/hs-callback-complete --list
```

```markdown
## Pending Callbacks

| ID | Registered | Expires | Metadata |
|----|------------|---------|----------|
| abc123 | 2026-01-19 10:00 | 2026-01-20 10:00 | contact: 12345 |
| def456 | 2026-01-19 11:00 | 2026-01-19 13:00 | contact: 67890 |

Total: 2 pending callbacks

Commands:
- `/hs-callback-complete --callback abc123` - Complete specific
- `/hs-callback-complete --all --status success` - Complete all with status
```

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| Callback not found | Invalid ID | Verify callback ID |
| Already completed | Double completion | Check status first |
| Expired | Past expiration | Cannot complete expired callbacks |
| Invalid output | Wrong field format | Check output field types |

### Handling Expiration

```markdown
## Callback Expired

**Callback ID:** abc123
**Expired At:** 2026-01-20T10:00:00Z

This callback can no longer be completed. The workflow for this record has timed out.

### Options:

1. **Re-enroll the record** in the workflow to trigger the action again
2. **Check workflow settings** for timeout handling
3. **Adjust expiration duration** in your action definition for future callbacks
```

## Implementation Notes

1. Always verify callback exists before completing
2. Validate output fields match action definition
3. Handle already-completed callbacks gracefully
4. Log completions for audit trail
5. Set up alerts for callbacks nearing expiration

## Related Commands

- `/hs-action-create` - Create custom action
- `/hs-action-list` - List custom actions
- `/hs-action-add-function` - Add action function
