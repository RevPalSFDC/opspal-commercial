---
description: Interactive wizard to create Marketo smart campaigns with best practices
argument-hint: "[--type=trigger|batch|request] [--program=id]"
---

# Create Smart Campaign Wizard

Interactive wizard to create Marketo smart campaigns with best practices guidance.

## Usage

```
/create-smart-campaign [--type=trigger|batch|request] [--program=id]
```

## Parameters

- `--type` - Campaign type:
  - `trigger` - Event-driven campaign (runs when triggered)
  - `batch` - Scheduled campaign (runs on schedule)
  - `request` - API/flow-triggered campaign
- `--program` - Parent program ID (optional)

## Wizard Steps

### Step 1: Basic Information
- Campaign name (following naming conventions)
- Description and purpose
- Parent program selection
- Folder location

### Important API Limitation
Smart List triggers/filters and Flow steps **cannot be created or modified via API**.
This wizard produces a validated configuration and then either:
- **Clones a template** (recommended for API workflows), or
- **Provides UI steps** to build the Smart List/Flow manually.

### Step 2: Smart List Configuration
For **Trigger Campaigns**:
- Select trigger type(s)
- Configure trigger constraints
- Add qualification filters

For **Batch Campaigns**:
- Define lead selection criteria
- Configure filters and segments
- Set qualification rules

### Step 3: Flow Steps
- Add flow actions
- Configure choice steps
- Set wait steps (if needed)
- Configure tokens

### Step 4: Validation & Review
- Pre-activation checks
- Conflict detection
- Volume estimation
- Best practices review

### Step 5: Activation (Optional)
- Activate immediately or save as draft
- Schedule (for batch campaigns)

## Example Session

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔧 CREATE SMART CAMPAIGN WIZARD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Step 1: Basic Information

Campaign Type: trigger
Campaign Name: 2025-12 Welcome Series - Step 1
Description: Sends welcome email when lead fills demo request form
Program: Demo Request Program (ID: 1234)

✅ Name follows convention: [Date] [Type] - [Step]

## API Limitation Note
Smart Lists and Flow steps are not configurable via REST.
Recommended path: clone from a template with this logic.

## Step 2: Smart List

Triggers:
  1. Fills Out Form
     - Form: Demo Request Form
     - Constraint: None

Filters:
  1. Lead Status not in: Disqualified, Customer
  2. Email Address is not empty

Qualification Rules:
  - Each lead can run through: Once
  - First run: Immediately

## Step 3: Flow Steps

1. Wait: 5 minutes
   Reason: Allow form data to sync

2. Send Email: Welcome - Demo Request
   Email ID: 5678

3. Change Data Value
   Field: Lead Status
   New Value: Engaged

4. Add to List: Demo Requesters
   List ID: 9012

## Step 4: Validation

✅ All referenced emails are approved
✅ No trigger conflicts detected
✅ Smart list has appropriate filters
⚠️ Estimated volume: ~50 leads/day

Best Practices Check:
✅ Single responsibility (one purpose)
✅ Clear naming convention
✅ Appropriate wait before email
✅ Data tracking included

## Step 5: Execution

Choose execution path:
[Clone Template] [Open UI Steps] [Cancel]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Common Triggers

| Trigger | Use Case |
|---------|----------|
| Fills Out Form | Form submission response |
| Visits Web Page | Web behavior tracking |
| Clicks Link in Email | Email engagement |
| Data Value Changes | Field change automation |
| Added to List | List-based workflows |
| Score is Changed | Score threshold actions |
| Program Status Changed | Program progression |

## Best Practices

1. **Naming**: Use `[Date] [Type] - [Description]` format
2. **Filters**: Always add qualification filters to triggers
3. **Wait Steps**: Add 5-minute wait before sending emails
4. **Single Purpose**: One campaign = one business purpose
5. **Testing**: Test in sandbox before production activation

## Related Agent

This command uses: `marketo-campaign-builder`

## Related Commands

- `/marketo-preflight campaign-activate` - Validate before activation
- `/marketo-audit --focus=campaigns` - Audit existing campaigns
- `/clone-campaign-wizard` - Clone a template campaign (recommended)
