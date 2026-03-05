---
description: Interactive wizard for end-to-end program deployment from template
argument-hint: "[--template=id] [--name=string] [--folder=id]"
---

# Orchestrate Program Deployment

Interactive wizard for complete program deployment including cloning, token configuration, asset approval, and campaign activation.

## Usage

```
/orchestrate-program [--template=id] [--name=string] [--folder=id]
```

## Parameters

- `--template` - Source program template ID
- `--name` - New program name
- `--folder` - Target folder ID

## Wizard Steps

### Step 1: Template Selection
- Browse available program templates
- Show template details (assets, tokens, campaigns)
- Confirm selection

### Step 2: Program Configuration
- Program name (required)
- Description
- Target folder selection
- Tags and categories

### Step 3: Token Configuration
Display all template tokens with current placeholder values:
- Event/campaign name
- Date and time values
- URLs and links
- Speaker/presenter information
- Custom content tokens

### Step 4: Asset Review
Review all assets that will be cloned:
- Emails (count, names)
- Forms (count, names)
- Landing pages (count, names)
- Smart campaigns (trigger/batch)

### Step 5: Pre-flight Validation
Automated checks before execution:
- [ ] Template exists and accessible
- [ ] Target folder is type 'Folder'
- [ ] Program name is unique
- [ ] API quota sufficient
- [ ] All required tokens have values

### Step 6: Execution
Orchestrated deployment with real-time progress:

```
Phase 1: Cloning program...
  ✓ Program cloned: ID 2045

Phase 2: Configuring tokens...
  ✓ 8 tokens updated

Phase 3: Discovering assets...
  ✓ Found: 3 emails, 2 forms, 1 LP, 4 campaigns

Phase 4: Approving assets...
  ✓ Forms approved: 2/2
  ✓ Emails approved: 3/3
  ✓ Landing pages approved: 1/1

Phase 5: Activating campaigns...
  ✓ Triggers activated: 2/2
  ⏰ Batch campaigns: Ready for scheduling

Phase 6: Verification...
  ✓ All assets approved
  ✓ All triggers active
```

### Step 7: Post-Deployment Summary
- Program ID and URL
- Asset summary
- Campaign status
- Next steps (schedule batch, add leads)

## Deployment Modes

### Quick Deploy
- Clone and configure tokens only
- Skip asset approval (manual later)
- Fastest deployment

### Standard Deploy
- Full workflow with approvals
- Activate trigger campaigns
- Batch campaigns left for scheduling

### Full Launch
- Complete deployment
- All assets approved
- All campaigns activated
- Optional batch scheduling

## Error Recovery

### If Clone Fails
- Check template exists
- Verify folder permissions
- Unique program name required

### If Token Update Fails
- Verify token names match template
- Check value formats (dates, URLs)
- Retry with corrected values

### If Asset Approval Fails
- Show specific asset error
- Option to skip and continue
- Manual approval instructions

### If Campaign Activation Fails
- Check for missing triggers
- Verify smart list configuration
- Option to leave inactive

## Example Workflows

### Webinar Campaign Launch
```
/orchestrate-program --template=1001
> Name: Q1 Webinar - AI Marketing
> Folder: Q1 2026 Campaigns
> Tokens:
  - my.EventName: AI in Marketing 2026
  - my.EventDate: 2026-02-20
  - my.SpeakerName: Dr. Jane Smith
> Deploy mode: Standard
> Executing...
> ✅ Program ready: ID 2045
```

### Content Campaign
```
/orchestrate-program --template=2001
> Name: Ebook - Marketing Guide 2026
> Quick deploy mode selected
> ✅ Program cloned, tokens set
> Next: Run /marketo-preflight before activating
```

## Related Commands

- `/launch-webinar` - Webinar-specific wizard
- `/create-nurture-program` - Nurture program setup
- `/marketo-preflight` - Pre-activation validation
- `/bulk-export-wizard` - Export program members

## Agent Routing

This command uses:
- `marketo-automation-orchestrator` for full deployment
- `marketo-program-architect` for structure questions
- `marketo-email-specialist` for email configuration
