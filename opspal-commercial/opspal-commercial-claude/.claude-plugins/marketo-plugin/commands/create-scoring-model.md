---
description: Interactive wizard to design and implement lead scoring models in Marketo
argument-hint: "[--type=combined|behavioral|demographic] [--mql-threshold=N]"
---

# Create Scoring Model Wizard

Interactive wizard to design and implement lead scoring models in Marketo.

## Usage

```
/create-scoring-model [--type=combined|behavioral|demographic] [--mql-threshold=N]
```

## Parameters

- `--type` - Model type:
  - `combined` - Behavioral + demographic scoring (recommended)
  - `behavioral` - Behavior/engagement scoring only
  - `demographic` - Fit/demographic scoring only
- `--mql-threshold` - MQL qualification threshold (default: 90 combined, or 50 behavior + 40 demographic)

## Wizard Steps

### Step 1: Model Design
- Model type selection
- Score field configuration
- MQL threshold definition

### Step 2: ICP Definition
- Target job titles
- Target industries
- Company size preferences
- Geographic focus

### Step 3: Behavioral Scoring Rules
- Email engagement points
- Web activity points
- Form submission points
- Event attendance points

### Step 4: Demographic Scoring Rules
- Job title scoring matrix
- Industry scoring
- Company size scoring
- Geography scoring

### Step 5: Negative Scoring Rules
- Disqualification triggers
- Competitor exclusions
- Invalid data penalties

### Step 6: Score Decay Configuration
- Inactivity periods
- Decay amounts
- Reset conditions

### Step 7: Validation & Deployment
- Rule conflict check
- Coverage validation
- Campaign creation
- Activation

## Example Session

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 CREATE SCORING MODEL WIZARD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Step 1: Model Design

Model Type: Combined (Behavioral + Demographic)

Score Fields:
├── Behavior Score (custom field)
├── Demographic Score (custom field)
└── Lead Score (combined)

MQL Threshold:
├── Behavior Score >= 50
├── AND Demographic Score >= 40
└── Total potential: ~90 points minimum for MQL

## Step 2: ICP Definition

Target Personas:
├── Primary: VP/Director of Marketing
├── Secondary: Marketing Manager
└── Tertiary: CMO/CRO

Target Industries:
├── Primary: SaaS, Technology
├── Secondary: Financial Services, Healthcare
└── Excluded: Agencies, Consultants

Company Size:
├── Ideal: 100-5,000 employees
├── Secondary: 50-99 or 5,000+
└── Not a fit: < 50 employees

Geography:
├── Primary: United States, Canada
├── Secondary: UK, Germany, Australia
└── Restricted: Embargoed countries

## Step 3: Behavioral Scoring Rules

EMAIL ENGAGEMENT:
├── Opens email: +1 point
├── Clicks link in email: +3 points
├── Clicks 3+ links: +5 points
├── Unsubscribes: -50 points
└── Hard bounce: -25 points

WEB ACTIVITY:
├── Visits any page: +1 point
├── Visits pricing page: +10 points
├── Visits demo page: +15 points
├── Visits features page: +5 points
└── Visits careers page: -20 points

FORM ACTIVITY:
├── Contact form: +20 points
├── Demo request: +25 points
├── Content download: +10 points
├── Newsletter signup: +5 points
└── Free trial: +30 points

EVENTS:
├── Webinar registered: +15 points
├── Webinar attended: +25 points
├── Event attended: +25 points
└── Case study downloaded: +15 points

## Step 4: Demographic Scoring Rules

JOB TITLE:
├── C-Level (CEO, CMO, CRO): +15 points
├── VP/Vice President: +12 points
├── Director: +10 points
├── Manager: +7 points
├── Senior/Lead: +5 points
├── Student/Intern: -10 points
└── Consultant: -5 points

INDUSTRY:
├── SaaS/Technology: +10 points
├── Financial Services: +10 points
├── Healthcare: +8 points
├── Retail: +5 points
└── Other: 0 points

COMPANY SIZE:
├── 1,000+: +10 points
├── 100-999: +8 points
├── 50-99: +5 points
├── 20-49: +3 points
└── < 20: 0 points

GEOGRAPHY:
├── US/Canada: +5 points
├── UK/Germany/Australia: +3 points
└── Other: 0 points

## Step 5: Negative Scoring Rules

Disqualification:
├── Competitor email domain: -100 points
├── Personal email (gmail, etc.): -5 points
├── Spam complaint: -100 points
└── Marked as Do Not Contact: Block MQL

## Step 6: Score Decay Configuration

Inactivity Decay:
├── 30 days no activity: -5 points
├── 60 days no activity: -10 points
├── 90 days no activity: -15 points
└── 180 days no activity: -25 points

Running: Weekly batch campaigns

## Step 7: Validation

Model Analysis:
✅ No duplicate trigger conflicts
✅ All point values reasonable
✅ MQL threshold achievable
✅ Decay rules configured

Campaign Count:
├── Behavioral campaigns: 18
├── Demographic campaigns: 12
├── Decay campaigns: 4
└── Total: 34 campaigns

Score Distribution Estimate:
├── 0-20 points: ~40% of leads
├── 21-50 points: ~35% of leads
├── 51-80 points: ~20% of leads
└── 81+ points: ~5% of leads (MQL candidates)

Ready to deploy?
[Create All Campaigns] [Export Config] [Cancel]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ SCORING MODEL DEPLOYED

Program: Lead Scoring Operations
Total Campaigns: 34
Status: All campaigns activated

Generated Documentation:
├── Scoring Model Summary
├── Campaign Reference Guide
└── MQL Threshold Report

Next Steps:
1. Test with sample leads
2. Monitor score distribution
3. Review monthly for optimization

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Default Scoring Values

### Quick Setup Options

**Aggressive Scoring** (Lower MQL threshold):
- Behavior >= 40, Demographic >= 30
- More MQLs, higher volume for sales

**Conservative Scoring** (Higher MQL threshold):
- Behavior >= 60, Demographic >= 50
- Fewer MQLs, higher quality

**Balanced Scoring** (Default):
- Behavior >= 50, Demographic >= 40
- Standard B2B approach

## Related Agent

This command uses: `marketo-lead-scoring-architect`

## Related Commands

- `/configure-mql-handoff` - Set up MQL to sales handoff
- `/lead-quality-report` - Analyze lead database quality
- `/marketo-audit --focus=scoring` - Audit existing scoring

## Related Runbook

See `docs/runbooks/leads/lead-scoring-model-setup.md` for complete operational procedures.
