---
description: Interactive wizard to set up MQL qualification and sales handoff workflows
argument-hint: "[--threshold=N] [--assignment=round-robin|territory|account]"
---

# Configure MQL Handoff Wizard

Interactive wizard to set up MQL qualification and sales handoff workflows in Marketo.

## Usage

```
/configure-mql-handoff [--threshold=N] [--assignment=round-robin|territory|account]
```

## Parameters

- `--threshold` - MQL score threshold (or `behavior:50,demographic:40` format)
- `--assignment` - Lead assignment method:
  - `round-robin` - Equal distribution among sales reps
  - `territory` - Geographic/segment-based routing
  - `account` - Account-based assignment

## Wizard Steps

### Step 1: MQL Criteria Definition
- Score threshold configuration
- Required field validation
- Exclusion criteria

### Step 2: Salesforce Sync Configuration
- Sync trigger setup
- Field mapping verification
- Lead/Contact conversion settings

### Step 3: Lead Assignment Method
- Assignment method selection
- Queue/rep configuration
- Fallback rules

### Step 4: Sales Notification Setup
- Alert email configuration
- Interesting moment logging
- High-value lead special handling

### Step 5: SLA Configuration
- First contact SLA
- Escalation thresholds
- Manager notification

### Step 6: Recycle Workflow
- Sales rejection handling
- Score reset rules
- Re-nurture configuration

### Step 7: Activation
- Pre-flight validation
- Campaign activation
- Testing recommendations

## Example Session

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🤝 CONFIGURE MQL HANDOFF WIZARD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Step 1: MQL Criteria Definition

Score Thresholds:
├── Behavior Score >= 50
├── Demographic Score >= 40
└── Trigger: Score change reaches threshold

Required Fields:
├── ✅ Email Address (validated)
├── ✅ First Name
├── ✅ Last Name
├── ✅ Company
├── ⚠️ Phone Number (recommended)
└── ⚠️ Job Title (recommended)

Exclusions:
├── Member of list: Competitors
├── Unsubscribed = True
├── Lead Status = Customer
├── Lead Status = Disqualified
└── MQL Date in past 30 days (cooling off)

## Step 2: Salesforce Sync

Sync Configuration:
├── Trigger: On MQL qualification
├── Action: Create or Update Lead
├── Priority: High
└── Sync wait: 5 minutes (allow data enrichment)

Field Mapping Verification:
✅ Email → Email
✅ First Name → FirstName
✅ Last Name → LastName
✅ Company → Company
✅ Phone → Phone
✅ Job Title → Title
✅ Lead Score → Lead_Score__c
✅ Behavior Score → Behavior_Score__c
✅ Demographic Score → Demographic_Score__c
✅ MQL Date → MQL_Date__c

## Step 3: Lead Assignment Method

Selected Method: Round Robin

Round Robin Configuration:
├── Assignment Rule: Sales Round Robin
├── Users: 5 active sales reps
├── Working Hours: 9 AM - 6 PM EST
└── Fallback: New Lead Queue

Assignment Rule Members:
├── John Smith (john@company.com)
├── Jane Doe (jane@company.com)
├── Mike Johnson (mike@company.com)
├── Sarah Williams (sarah@company.com)
└── Tom Brown (tom@company.com)

## Step 4: Sales Notification Setup

Alert Configuration:
├── Send To: {{lead.Lead Owner Email Address}}
├── Subject: 🔥 New MQL: {{lead.First Name}} at {{lead.Company}}
├── Include: Lead details, score, activities
└── Link: Direct to SFDC record

Alert Content:
┌────────────────────────────────────────────────────┐
│ NEW MARKETING QUALIFIED LEAD                       │
│                                                    │
│ Contact: Jane Smith, VP Marketing                  │
│ Company: Acme Corp                                 │
│ Email: jane.smith@acme.com                         │
│ Phone: (555) 123-4567                              │
│                                                    │
│ Lead Score: 95 (Behavior: 55, Demographic: 40)     │
│ MQL Date: December 5, 2025                         │
│                                                    │
│ Recent Activities:                                 │
│ • Visited pricing page (3x)                        │
│ • Downloaded ROI calculator                        │
│ • Attended product webinar                         │
│                                                    │
│ [View in Salesforce] [View in Marketo]             │
└────────────────────────────────────────────────────┘

High-Value Lead Handling (Score > 80):
├── CC: Sales Manager
├── Priority: High
└── Subject prefix: 🎯 HIGH-VALUE MQL

## Step 5: SLA Configuration

SLA Tiers:
├── Hot Lead (Score > 80): 1 hour first contact
├── Standard MQL: 4 hours first contact
└── Recycled Lead: 24 hours first contact

Warning Alert:
├── Timing: At SLA threshold
├── Send To: Lead Owner
└── Subject: ⚠️ SLA Warning: Follow up required

Escalation Alert:
├── Timing: 24 hours after MQL
├── Send To: Sales Manager
├── CC: Marketing Ops
└── Subject: 🚨 SLA BREACH: Immediate attention needed

## Step 6: Recycle Workflow

Rejection Triggers:
├── SFDC Lead Status = Recycled
├── SFDC Lead Status = Rejected
└── SFDC Lead Status = Disqualified

Recycle Actions:
├── Reset Behavior Score to 0
├── Update Lead Status = Nurture
├── Update Lifecycle Stage = Known
├── Wait 30 days (cooling off)
└── Add to Re-engagement nurture stream

Interesting Moment:
└── "Recycled from MQL - returned to nurture"

## Step 7: Activation

Pre-Flight Validation:
✅ MQL trigger campaign configured
✅ SFDC sync enabled
✅ Assignment rule exists
✅ Alert email template ready
✅ SLA fields created
✅ Recycle campaign configured

Campaign Summary:
├── MQL Qualification Trigger
├── Sync Lead to SFDC
├── Assign Lead Owner
├── Sales Alert - New MQL
├── SLA Warning - 4 Hour
├── SLA Escalation Alert
└── MQL Recycle - Sales Rejected

Ready to activate?
[Activate All] [Save Draft] [Cancel]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ MQL HANDOFF CONFIGURED

Program: MQL Handoff Operations
Campaigns: 7 activated
Assignment: Round Robin (5 reps)
SLA: 4-hour standard, 24-hour escalation

Testing Recommendations:
1. Create test lead with score >= 90
2. Verify SFDC sync completes
3. Confirm assignment works
4. Check alert email delivered
5. Test SLA warning (set shorter interval)
6. Test recycle workflow

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Assignment Method Comparison

| Method | Best For | Complexity |
|--------|----------|------------|
| Round Robin | Equal workload distribution | Low |
| Territory | Regional sales teams | Medium |
| Account-Based | Named account strategy | High |
| Queue | Central distribution | Low |

## Related Agent

This command uses: `marketo-mql-handoff-orchestrator`

## Related Commands

- `/create-scoring-model` - Set up lead scoring first
- `/monitor-sync` - Monitor SFDC sync status
- `/marketo-preflight handoff` - Validate handoff config

## Related Runbook

See `docs/runbooks/leads/mql-handoff-workflow.md` for complete operational procedures.
