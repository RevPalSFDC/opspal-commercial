---
description: Interactive wizard to configure Marketo program to Salesforce campaign sync
argument-hint: "[--program=id] [--campaign=id] [--direction=bidirectional|marketo-to-sfdc|sfdc-to-marketo]"
---

# Sync Program to SFDC Wizard

Interactive wizard to configure Marketo program to Salesforce campaign synchronization.

## Usage

```
/sync-program-to-sfdc [--program=id] [--campaign=id] [--direction=bidirectional|marketo-to-sfdc|sfdc-to-marketo]
```

## Parameters

- `--program` - Marketo program ID
- `--campaign` - Salesforce campaign ID (or `new` to create)
- `--direction` - Sync direction:
  - `bidirectional` - Two-way sync (default)
  - `marketo-to-sfdc` - Marketo → Salesforce only
  - `sfdc-to-marketo` - Salesforce → Marketo only

## Wizard Steps

### Step 1: Program Selection
- Select Marketo program
- View program type and channel
- Review program statuses

### Step 2: Salesforce Campaign
- Select existing SFDC campaign or create new
- Review/configure campaign member statuses
- Set parent campaign (optional)

### Step 3: Status Mapping
- Map Marketo statuses to SFDC statuses
- Configure success indicators
- Set default status

### Step 4: Sync Configuration
- Select sync direction
- Configure sync behavior
- Set new lead creation rules

### Step 5: Validation & Activation
- Pre-sync validation
- Test with sample member
- Activate sync

## Example Session

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔄 SYNC PROGRAM TO SFDC WIZARD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Step 1: Program Selection

Marketo Program:
├── Name: 2025-01 Product Launch Webinar
├── ID: 1234
├── Type: Event
├── Channel: Webinar
└── Current Members: 245

Program Statuses:
├── Not in Program (Step 0)
├── Invited (Step 10)
├── Registered (Step 20) ✓ Success
├── Attended (Step 30) ✓ Success
├── No Show (Step 40)
└── Attended On-Demand (Step 50) ✓ Success

## Step 2: Salesforce Campaign

Option Selected: Link to Existing Campaign

Salesforce Campaign:
├── Name: 2025-01 Product Launch Webinar
├── ID: 7014x00000ABC123
├── Type: Webinar
├── Status: In Progress
├── Current Members: 0

Campaign Member Statuses in SFDC:
├── Sent
├── Responded
├── Attended ✓ Responded
├── No Show
└── Attended On-Demand ✓ Responded

⚠️ Note: SFDC campaign statuses should match Marketo program statuses

## Step 3: Status Mapping

Marketo Status → SFDC Status:
┌────────────────────────────────────────────────────────┐
│ Marketo                  SFDC              Success     │
├────────────────────────────────────────────────────────┤
│ Not in Program      →    (no sync)         -          │
│ Invited             →    Sent              -          │
│ Registered          →    Responded         ✓          │
│ Attended            →    Attended          ✓          │
│ No Show             →    No Show           -          │
│ Attended On-Demand  →    Attended On-Dem   ✓          │
└────────────────────────────────────────────────────────┘

Default Status for New Members: Sent

Mapping Notes:
✅ All Marketo statuses have SFDC equivalents
✅ Success states align correctly
⚠️ "Attended On-Demand" truncated in SFDC (18 char limit)

## Step 4: Sync Configuration

Sync Direction: Bidirectional

Marketo → SFDC:
├── When: Program status changes
├── Action: Update SFDC campaign member status
└── Create Lead: If not in SFDC

SFDC → Marketo:
├── When: Campaign member status changes
├── Action: Update Marketo program status
└── Add to Program: If not already member

New Lead Creation (if lead not in SFDC):
├── Create as: Lead
├── Lead Source: Program name
├── Owner: Queue (New Leads)
└── Sync immediately: Yes

## Step 5: Validation & Activation

Pre-Sync Validation:
✅ Marketo program accessible
✅ SFDC campaign accessible
✅ User has SFDC sync permissions
✅ Status mappings complete
✅ No circular sync risk

Sync Preview:
├── Current Marketo members: 245
├── Current SFDC members: 0
├── Members to sync: 245
└── Estimated sync time: 2-3 minutes

Test Sync (Optional):
Test with lead: john.doe@example.com (ID: 5678)
├── Current Marketo status: Registered
├── Expected SFDC status: Responded
[Run Test Sync] [Skip Test]

Ready to activate?
[Activate Sync] [Save for Later] [Cancel]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ PROGRAM-TO-CAMPAIGN SYNC ACTIVATED

Sync Configuration:
├── Marketo Program: 2025-01 Product Launch Webinar (1234)
├── SFDC Campaign: 2025-01 Product Launch Webinar (7014x00000ABC123)
├── Direction: Bidirectional
└── Status: Active

Initial Sync:
├── Members synced: 245
├── New SFDC members created: 12
├── Errors: 0
└── Sync completed: 2 minutes 34 seconds

Monitoring:
├── View in Marketo: Program > Setup > Salesforce Campaign Sync
├── View in SFDC: Campaign > Campaign Members
└── Sync errors: Program > Activity Log

Next Steps:
1. Verify sample members synced correctly
2. Check SFDC campaign member list
3. Monitor for sync errors
4. Test status change propagation

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Status Mapping Best Practices

### Common Webinar Mapping
| Marketo | SFDC | Notes |
|---------|------|-------|
| Invited | Sent | Initial invite |
| Registered | Responded | Confirmed interest |
| Attended | Attended | Success state |
| No Show | No Show | Did not attend |

### Common Event Mapping
| Marketo | SFDC | Notes |
|---------|------|-------|
| Invited | Sent | Initial invite |
| RSVP Yes | Responded | Confirmed |
| RSVP No | Not Responded | Declined |
| Attended | Attended | Success state |

### Common Content Mapping
| Marketo | SFDC | Notes |
|---------|------|-------|
| Targeted | Sent | In target list |
| Engaged | Responded | Interacted |
| Success | Converted | Downloaded/completed |

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Sync not starting | Permission issue | Check SFDC sync user permissions |
| Status not updating | Mapping missing | Add missing status mapping |
| Duplicate members | Multiple syncs | Check for duplicate campaigns |
| Slow sync | Large volume | Sync in batches |

### Sync Errors

Check for errors in:
1. Marketo: Program > Activity Log
2. SFDC: Setup > Jobs > Apex Jobs
3. Marketo Admin: Integration > Salesforce > Sync Errors

## Related Agent

This command uses: `marketo-sfdc-sync-specialist`

## Related Commands

- `/monitor-sync` - Real-time sync monitoring
- `/launch-webinar` - Full webinar setup including sync
- `/marketo-preflight sync` - Validate sync configuration

## Related Runbook

See `docs/runbooks/integrations/program-sfdc-campaign-sync.md` for complete operational procedures.
