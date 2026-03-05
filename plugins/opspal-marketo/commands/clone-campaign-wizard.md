---
description: Interactive wizard to clone Smart Campaigns with validation and customization
argument-hint: "[--source=id] [--target-folder=id] [--name=string] [--batch]"
---

# Clone Campaign Wizard

Interactive wizard to clone Smart Campaigns with pre-validation, name collision detection, and template management.

## Usage

```
/clone-campaign-wizard [--source=id] [--target-folder=id] [--name=string] [--batch]
```

## Parameters

- `--source` - Source campaign ID to clone
- `--target-folder` - Target folder/program ID
- `--name` - Name for the cloned campaign
- `--batch` - Enable batch mode for multiple clones

## Why Clone?

**Cloning is the primary method** for creating functional campaigns via API because:

- Smart List triggers cannot be created via API
- Flow steps cannot be created via API
- Only name and description can be modified after creation

Clone from templates to get fully-functional campaigns with triggers and flows.

## Wizard Steps

### Step 1: Source Selection
- Search existing campaigns
- Browse template folder
- View campaign details before cloning

### Step 2: Target Location
- Select target program or folder
- Validate write permissions
- Check for name collisions

### Step 3: Customization
- Set new campaign name
- Update description
- Configure token overrides (if applicable)

### Step 4: Validation
- Verify source exists and is accessible
- Check target folder permissions
- Detect name collisions
- Preview what will be cloned

### Step 5: Execution
- Clone campaign
- Verify creation
- Optional: Activate immediately

## Example Session

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔄 CLONE CAMPAIGN WIZARD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Step 1: Source Selection

Available Templates:
┌─────┬────────────────────────────────┬──────────┬───────────────┐
│ ID  │ Name                           │ Type     │ Requestable   │
├─────┼────────────────────────────────┼──────────┼───────────────┤
│ 1001│ Template - Welcome Series      │ Trigger  │ No            │
│ 1002│ Template - Form Response       │ Trigger  │ No            │
│ 1003│ Template - API Triggered       │ Trigger  │ Yes           │
│ 1004│ Template - Scoring Campaign    │ Trigger  │ No            │
│ 1005│ Template - Scheduled Batch     │ Batch    │ No            │
└─────┴────────────────────────────────┴──────────┴───────────────┘

Selected: Template - Welcome Series (ID: 1001)

Source Details:
  Type: Trigger Campaign
  Has Triggers: Yes
    - Fills Out Form (Any form)
  Has Filters: Yes
    - Email Address is not empty
  Requestable: No

## Step 2: Target Location

Target: Q1 2026 Marketing Program (ID: 2000)
Type: Program

✅ Target folder exists
✅ Write permission verified

## Step 3: Customization

Campaign Name: Q1 2026 Welcome Series
Description: Welcome campaign for Q1 2026 leads

Token Overrides Available:
  - {{my.WelcomeEmail}} - Currently: Email 5678
  - {{my.FollowupDelay}} - Currently: 3 days

Update tokens? [Yes/No]: No (use program defaults)

## Step 4: Validation

Pre-Clone Checks:
✅ Source campaign exists (ID: 1001)
✅ Target folder exists (ID: 2000)
✅ No name collision detected
✅ Clone permission verified

What Will Be Cloned:
┌───────────────────────────┬─────────────────────────────────┐
│ Component                 │ Status                          │
├───────────────────────────┼─────────────────────────────────┤
│ Smart List (triggers)     │ ✅ Will be copied               │
│ Smart List (filters)      │ ✅ Will be copied               │
│ Flow steps                │ ✅ Will be copied               │
│ Qualification rules       │ ✅ Will be copied               │
│ Communication limits      │ ✅ Will be copied               │
│ Status                    │ ⚠️ Will be INACTIVE            │
└───────────────────────────┴─────────────────────────────────┘

## Step 5: Execution

Cloning campaign...

✅ Clone successful!

New Campaign:
  ID: 3045
  Name: Q1 2026 Welcome Series
  Status: Inactive
  Smart List ID: 6001
  Flow ID: 6101

Next Steps:
  [Activate Now] [View in Marketo] [Done]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Batch Mode

Clone multiple campaigns at once:

```
/clone-campaign-wizard --batch
```

### Batch Example
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔄 BATCH CLONE WIZARD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Sources to Clone:
1. Template - Welcome Series (ID: 1001)
2. Template - Form Response (ID: 1002)
3. Template - Scoring Campaign (ID: 1004)

Target Program: Q1 2026 Program (ID: 2000)

Name Prefix: Q1 2026 -

Preview:
  1001 → "Q1 2026 - Welcome Series"
  1002 → "Q1 2026 - Form Response"
  1004 → "Q1 2026 - Scoring Campaign"

Proceed? [Yes/No]: Yes

Cloning...
  [1/3] Template - Welcome Series → ✅ ID: 3045
  [2/3] Template - Form Response → ✅ ID: 3046
  [3/3] Template - Scoring Campaign → ✅ ID: 3047

Summary:
  Total: 3
  Succeeded: 3
  Failed: 0

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Cloning Considerations

### What Gets Cloned
| Component | Cloned? | Notes |
|-----------|---------|-------|
| Smart List triggers | Yes | Full copy |
| Smart List filters | Yes | Full copy |
| Flow steps | Yes | All steps |
| Qualification rules | Yes | Same settings |
| Communication limits | Yes | Same settings |
| Name | No | Must provide new |
| Status | No | Always Inactive |

### What Needs Attention
- **Tokens**: New campaign uses target program's tokens
- **Asset References**: Emails/LPs still reference source program
- **Status**: Always starts inactive - must activate manually

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| 610: Not found | Source doesn't exist | Verify campaign ID |
| 710: Invalid folder | Target folder issue | Check folder ID/type |
| 711: Name exists | Duplicate name | Use unique name |
| 709: Permission | Access denied | Check workspace access |

## Template Management

### Recommended Template Structure
```
Marketing Programs/
└── _Templates/
    ├── Template - Welcome Series
    ├── Template - Form Response
    ├── Template - API Triggered (Requestable)
    ├── Template - Scoring Campaign
    ├── Template - Status Change
    └── Template - Scheduled Batch
```

### Template Best Practices
1. Use naming convention: `Template - [Purpose]`
2. Design flows with token placeholders
3. Set appropriate qualification rules
4. Document required tokens

## Related Agent

This command uses: `marketo-smart-campaign-api-specialist`

## Related Commands

- `/smart-campaign-api` - API reference
- `/create-smart-campaign` - Create from scratch (design-focused)
- `/marketo-preflight campaign-activate` - Pre-activation checks

## Runbook Reference

For detailed clone documentation:
- `docs/runbooks/smart-campaigns/07-clone-operations.md`
- `docs/runbooks/smart-campaigns/10-smart-list-flow-limitations.md`
