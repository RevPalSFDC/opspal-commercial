---
description: Interactive wizard for end-to-end webinar campaign creation and launch
argument-hint: "[--template=id] [--date=YYYY-MM-DD] [--provider=zoom|gotowebinar|webex]"
---

# Launch Webinar Campaign Wizard

Interactive wizard for end-to-end webinar campaign creation and launch in Marketo.

## Usage

```
/launch-webinar [--template=id] [--date=YYYY-MM-DD] [--provider=zoom|gotowebinar|webex]
```

## Parameters

- `--template` - Webinar program template ID to clone
- `--date` - Webinar date (YYYY-MM-DD format)
- `--provider` - Webinar provider (zoom, gotowebinar, webex)

## Wizard Steps

### Step 1: Webinar Details
- Webinar title
- Date and time (with timezone)
- Duration
- Description
- Target audience

### Step 2: Program Setup
- Select/confirm template to clone
- Destination folder
- Program naming convention

### Step 3: Token Configuration
- Event name
- Date and time
- Join URL
- Host/presenter details
- Calendar link

### Step 4: Provider Integration
- Select webinar provider
- Enter event ID (from provider)
- Configure registration sync

### Step 5: Email Sequence Review
- Invitation email
- Confirmation email
- Reminder sequence (1 week, 1 day, 1 hour)
- Follow-up emails (attended/no-show)

### Step 6: Salesforce Sync
- Link to SFDC campaign
- Status mapping configuration
- Sync direction

### Step 7: Activation
- Pre-flight validation
- Campaign activation
- Schedule invitation send

## Example Session

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎥 LAUNCH WEBINAR CAMPAIGN WIZARD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Step 1: Webinar Details

Title: Industry Trends 2025 - What's Next for Marketing
Date: January 15, 2025
Time: 2:00 PM EST
Duration: 60 minutes
Description: Join our experts for insights on 2025 marketing trends

Target Audience:
- Marketing professionals
- CMOs and VPs of Marketing
- Digital marketing managers

## Step 2: Program Setup

Template: Webinar Master Template (ID: 1234)
Destination: Marketing Activities > 2025 Programs > Webinars
Program Name: 2025-01-15 Industry Trends Webinar

✅ Template found with all required assets:
   - 7 email templates
   - 2 landing pages
   - 1 registration form
   - 8 smart campaigns

## Step 3: Token Configuration

Tokens to update:
├── {{my.Webinar Title}} = "Industry Trends 2025"
├── {{my.Webinar Date}} = "January 15, 2025"
├── {{my.Webinar Time}} = "2:00 PM EST"
├── {{my.Webinar Timezone}} = "Eastern Time"
├── {{my.Duration}} = "60 minutes"
├── {{my.Host Name}} = "Jane Smith"
├── {{my.Host Title}} = "VP of Marketing"
└── {{my.Join URL}} = [Enter after provider setup]

## Step 4: Provider Integration

Provider: Zoom
Event ID: 123-456-789
Join URL: https://zoom.us/j/123456789

✅ Zoom integration configured
✅ Registration sync enabled
✅ Attendance tracking active

## Step 5: Email Sequence

| Email | Status | Scheduled |
|-------|--------|-----------|
| Invitation | Draft | Jan 1, 2025 |
| Confirmation | Ready | Triggered |
| Reminder - 1 Week | Ready | Jan 8, 2025 |
| Reminder - 1 Day | Ready | Jan 14, 2025 |
| Reminder - 1 Hour | Ready | Jan 15, 1:00 PM |
| Follow-up - Attended | Ready | Post-event |
| Follow-up - No Show | Ready | Post-event |

⚠️ Action needed: Approve invitation email after content update

## Step 6: Salesforce Sync

SFDC Campaign: 2025 Industry Trends Webinar (ID: 7014x00000ABC123)

Status Mapping:
├── Invited → Sent
├── Registered → Responded
├── Attended → Attended
├── No Show → No Show
└── Attended On-Demand → Attended On-Demand

✅ Bidirectional sync enabled

## Step 7: Activation

Pre-Flight Validation:
✅ All emails have approved status (or draft)
✅ Registration form working
✅ Landing page approved
✅ Provider integration active
✅ SFDC sync configured

Ready to activate?
[Activate All Campaigns] [Save & Review Later] [Cancel]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ WEBINAR PROGRAM CREATED

Program ID: 5678
Program Name: 2025-01-15 Industry Trends Webinar

Next Steps:
1. Update invitation email content
2. Approve all emails
3. Schedule invitation campaign send
4. Monitor registrations

Dashboard: [View Program] | [View in SFDC]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Checklist Generated

After running the wizard, you'll receive a pre-event checklist:

### 2 Weeks Before
- [ ] Invitation campaign scheduled
- [ ] Target audience finalized
- [ ] Email content approved

### 1 Week Before
- [ ] Monitor registration numbers
- [ ] First reminder scheduled
- [ ] Speaker confirmed

### 1 Day Before
- [ ] Final reminder scheduled
- [ ] Recording setup ready
- [ ] Technical check complete

### Day Of
- [ ] 1-hour reminder sent
- [ ] Attendance sync verified

### Post-Event
- [ ] Recording uploaded
- [ ] Follow-up emails triggered
- [ ] Lead routing active

## Related Agent

This command uses: `marketo-webinar-orchestrator`

## Related Commands

- `/marketo-preflight webinar` - Validate webinar setup
- `/monitor-sync --program=id` - Monitor SFDC sync status
- `/api-usage` - Check API limits during setup

## Related Runbook

See `docs/runbooks/programs/webinar-campaign-launch.md` for complete operational procedures.
