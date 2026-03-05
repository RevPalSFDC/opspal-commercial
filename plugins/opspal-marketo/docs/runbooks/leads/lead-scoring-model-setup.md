# Lead Scoring Model Setup Runbook

## Purpose

Complete operational procedures for designing, implementing, and maintaining lead scoring models in Marketo.

## Overview

Lead scoring assigns numerical values to leads based on their attributes (demographic/firmographic fit) and behaviors (engagement). A well-designed model identifies Marketing Qualified Leads (MQLs) ready for sales outreach.

### Scoring Model Types

| Type | Description | Use Case |
|------|-------------|----------|
| **Combined** | Behavioral + Demographic | Most B2B scenarios (recommended) |
| **Behavioral Only** | Engagement actions only | Unknown/diverse ICP |
| **Demographic Only** | Fit criteria only | Target account lists |

---

## Phase 1: Scoring Model Design

### 1.1 Define Ideal Customer Profile (ICP)

#### Primary Target Personas
- [ ] **Job Titles**
  - Primary: ________________________
  - Secondary: ________________________
  - Tertiary: ________________________

- [ ] **Industries**
  - Primary: ________________________
  - Secondary: ________________________
  - Excluded: ________________________

- [ ] **Company Size**
  - Ideal: ___ to ___ employees
  - Secondary: ___ to ___ employees
  - Not a fit: < ___ employees

- [ ] **Geography**
  - Primary: ________________________
  - Secondary: ________________________
  - Restricted: ________________________

### 1.2 Define Behavioral Signals

Rate each behavior by buying intent (1-5):

| Behavior | Intent Signal | Proposed Points |
|----------|---------------|-----------------|
| Pricing page visit | 5 - High | +10 to +15 |
| Demo request | 5 - High | +20 to +25 |
| Contact form | 5 - High | +15 to +20 |
| Webinar attendance | 4 - Medium-High | +15 to +25 |
| Content download | 3 - Medium | +10 to +15 |
| Email clicks | 2 - Low-Medium | +3 to +5 |
| Email opens | 1 - Low | +1 to +3 |

### 1.3 Define MQL Threshold

Recommended thresholds:

| Model Type | MQL Threshold | Notes |
|------------|---------------|-------|
| **Combined** | Behavior >= 50 AND Demo >= 40 | Requires both engagement and fit |
| **Aggressive** | Behavior >= 40 AND Demo >= 30 | Higher volume, lower quality |
| **Conservative** | Behavior >= 60 AND Demo >= 50 | Lower volume, higher quality |

Selected threshold:
- [ ] Behavior Score >= ___
- [ ] Demographic Score >= ___
- [ ] Combined threshold: ___

---

## Phase 2: Program Setup

### 2.1 Create Scoring Operational Program

1. Marketing Activities > Operational > Scoring
2. Create program: `Scoring Operations - [Version]`
3. Program type: Default

Or use wizard:
```
/create-scoring-model --type=combined --mql-threshold=90
```

### 2.2 Folder Structure

Create organized folder hierarchy:

```
Scoring Operations
├── 01-Behavioral Scoring
│   ├── Email Engagement
│   ├── Web Activity
│   ├── Form Submissions
│   └── Events
├── 02-Demographic Scoring
│   ├── Job Title
│   ├── Industry
│   ├── Company Size
│   └── Geography
├── 03-Negative Scoring
│   ├── Disqualification
│   └── Decay
└── 04-MQL Triggers
    ├── MQL Qualification
    └── MQL Recycle
```

### 2.3 Score Field Setup

Ensure custom fields exist:

| Field | API Name | Type |
|-------|----------|------|
| Lead Score | LeadScore | Integer |
| Behavior Score | BehaviorScore__c | Integer |
| Demographic Score | DemographicScore__c | Integer |
| MQL Date | MQLDate__c | DateTime |
| Last Scoring Activity | LastScoringActivity__c | DateTime |

Verify with:
```javascript
mcp__marketo__lead_describe()
```

---

## Phase 3: Behavioral Scoring Implementation

### 3.1 Email Engagement Campaigns

#### Email Open Scoring
**Smart List:**
- Trigger: Opens Email
- Email: is any

**Flow:**
1. Change Score: +1
2. Change Data Value: Last Scoring Activity = {{system.dateTime}}

**Qualification:** Every time

---

#### Email Click Scoring
**Smart List:**
- Trigger: Clicks Link in Email
- Email: is any

**Flow:**
1. Change Score: +3
2. Change Data Value: Last Scoring Activity = {{system.dateTime}}

**Qualification:** Every time

---

#### Multiple Clicks (Engaged)
**Smart List:**
- Trigger: Clicks Link in Email
- Min Links Clicked: 3
- Timeframe: Past 7 days

**Flow:**
1. Change Score: +5 (bonus)

**Qualification:** Once per 7 days

---

### 3.2 Web Activity Campaigns

#### High-Value Page Visits
Create separate campaigns for each high-value page:

| Page Type | Points | Campaign Name |
|-----------|--------|---------------|
| Pricing | +10 | Web - Pricing Page Visit |
| Demo/Request | +15 | Web - Demo Page Visit |
| Features | +5 | Web - Features Page Visit |
| Case Studies | +7 | Web - Case Study View |
| Comparison | +8 | Web - Comparison Page Visit |

**Smart List (example for Pricing):**
- Trigger: Visits Web Page
- Web Page contains: /pricing

**Flow:**
1. Change Score: +10
2. Interesting Moment: "Visited pricing page"

**Qualification:** Once per day

---

#### Career Page (Negative)
**Smart List:**
- Trigger: Visits Web Page
- Web Page contains: /careers

**Flow:**
1. Change Score: -20
2. Add to List: Job Seekers (Exclude)

---

### 3.3 Form Submission Campaigns

| Form Type | Points | Campaign Name |
|-----------|--------|---------------|
| Demo Request | +25 | Form - Demo Request |
| Contact Form | +20 | Form - Contact Us |
| Content Download | +10 | Form - Content Download |
| Newsletter | +5 | Form - Newsletter Signup |
| Free Trial | +30 | Form - Free Trial |

**Smart List (example for Demo):**
- Trigger: Fills Out Form
- Form: Demo Request Form

**Flow:**
1. Change Score: +25
2. Change Program Status: MQL Check
3. Interesting Moment: "Requested a demo"

**Qualification:** Once (for high-intent forms)

---

### 3.4 Event Engagement Campaigns

| Event Action | Points | Campaign Name |
|--------------|--------|---------------|
| Webinar Registration | +15 | Event - Webinar Registered |
| Webinar Attendance | +25 | Event - Webinar Attended |
| Conference Attendance | +25 | Event - Conference Attended |
| Case Study Download | +15 | Event - Case Study Download |

**Smart List (Webinar Attended):**
- Trigger: Program Status is Changed
- New Status: Attended
- Program contains: Webinar

**Flow:**
1. Change Score: +25
2. Interesting Moment: "Attended webinar: {{Program.Name}}"

---

## Phase 4: Demographic Scoring Implementation

### 4.1 Job Title Scoring

**Campaign: Demo Score - Job Title**

**Smart List:**
- Data Value Changed
- Attribute: Job Title
- New Value: is not empty

**Flow:**
1. **Choice 1:** If Job Title contains "CEO,CMO,CRO,CFO"
   - Change Score: +15
2. **Choice 2:** If Job Title contains "VP,Vice President"
   - Change Score: +12
3. **Choice 3:** If Job Title contains "Director"
   - Change Score: +10
4. **Choice 4:** If Job Title contains "Manager"
   - Change Score: +7
5. **Choice 5:** If Job Title contains "Senior,Lead"
   - Change Score: +5
6. **Choice 6:** If Job Title contains "Student,Intern"
   - Change Score: -10
7. **Default:** No change

**Qualification:** Every time (triggers on update)

---

### 4.2 Industry Scoring

**Campaign: Demo Score - Industry**

**Smart List:**
- Data Value Changed
- Attribute: Industry
- New Value: is not empty

**Flow:**
1. **Choice 1:** If Industry is "Technology,SaaS,Software"
   - Change Score: +10
2. **Choice 2:** If Industry is "Financial Services,Banking"
   - Change Score: +10
3. **Choice 3:** If Industry is "Healthcare,Life Sciences"
   - Change Score: +8
4. **Choice 4:** If Industry is "Retail,E-commerce"
   - Change Score: +5
5. **Default:** Change Score: 0

---

### 4.3 Company Size Scoring

**Campaign: Demo Score - Company Size**

**Smart List:**
- Data Value Changed
- Attribute: Number of Employees
- New Value: is not empty

**Flow:**
1. **Choice 1:** If Number of Employees >= 1000
   - Change Score: +10
2. **Choice 2:** If Number of Employees >= 100
   - Change Score: +8
3. **Choice 3:** If Number of Employees >= 50
   - Change Score: +5
4. **Choice 4:** If Number of Employees >= 20
   - Change Score: +3
5. **Default:** Change Score: 0

---

### 4.4 Geography Scoring

**Campaign: Demo Score - Geography**

**Smart List:**
- Data Value Changed
- Attribute: Country
- New Value: is not empty

**Flow:**
1. **Choice 1:** If Country is "United States,Canada"
   - Change Score: +5
2. **Choice 2:** If Country is "United Kingdom,Germany,Australia"
   - Change Score: +3
3. **Default:** Change Score: 0

---

## Phase 5: Negative Scoring & Decay

### 5.1 Disqualification Triggers

#### Competitor Detection
**Smart List:**
- Trigger: Data Value Changed
- Attribute: Email Address
- New Value contains: [competitor domains]

**Flow:**
1. Change Score: -100
2. Change Data Value: Lead Status = Competitor
3. Add to List: Competitors (Exclude)

---

#### Personal Email Penalty
**Smart List:**
- Trigger: Data Value Changed
- Attribute: Email Address
- New Value contains: gmail.com,yahoo.com,hotmail.com

**Flow:**
1. Change Score: -5 (demographic)

---

#### Hard Bounce
**Smart List:**
- Trigger: Email Bounced
- Category: Hard

**Flow:**
1. Change Score: -25

---

#### Unsubscribe
**Smart List:**
- Trigger: Unsubscribes from Email

**Flow:**
1. Change Score: -50

---

### 5.2 Score Decay (Inactivity)

Create batch campaigns that run weekly:

#### 30-Day Inactivity
**Smart List:**
- Last Scoring Activity: before 30 days ago
- Lead Score: > 0

**Flow:**
1. Change Score: -5
2. Interesting Moment: "Score decay: 30-day inactivity"

**Schedule:** Weekly, Sunday 2 AM

---

#### 60-Day Inactivity
**Smart List:**
- Last Scoring Activity: before 60 days ago
- Lead Score: > 0

**Flow:**
1. Change Score: -10

**Schedule:** Weekly, Sunday 2 AM

---

#### 90-Day Inactivity
**Smart List:**
- Last Scoring Activity: before 90 days ago
- Lead Score: > 0

**Flow:**
1. Change Score: -15
2. Change Data Value: Lifecycle Stage = Dormant

**Schedule:** Weekly, Sunday 2 AM

---

## Phase 6: Validation & Testing

### 6.1 Model Validation

Run validation script:
```javascript
const validator = require('./scripts/lib/scoring-rule-generator');
validator.validateScoringModel(programId);
```

Checks performed:
- [ ] No conflicting triggers (same action, different points)
- [ ] All point values are integers
- [ ] No orphan campaigns
- [ ] Decay campaigns scheduled
- [ ] MQL threshold is achievable

### 6.2 Coverage Analysis

Verify scoring coverage:

| Category | Campaigns | Point Range |
|----------|-----------|-------------|
| Email Engagement | ___ | +1 to +5 |
| Web Activity | ___ | +5 to +15 |
| Form Submissions | ___ | +5 to +30 |
| Events | ___ | +15 to +25 |
| Demographics | ___ | +3 to +15 |
| Negative | ___ | -5 to -100 |
| Decay | ___ | -5 to -25 |

### 6.3 Test with Sample Leads

Create test scenarios:

| Scenario | Expected Score | Actual |
|----------|----------------|--------|
| VP Marketing, Tech, 500 employees | ~37 demo | ___ |
| Above + 3 email clicks | +9 behavior | ___ |
| Above + pricing page | +10 behavior | ___ |
| Above + demo request | +25 behavior (MQL!) | ___ |

Test command:
```
/marketo-preflight scoring-test --lead=[ID]
```

---

## Phase 7: Activation & Monitoring

### 7.1 Activation Order

1. **Demographic campaigns first** (batch, run once for existing leads)
2. **Behavioral trigger campaigns** (activate)
3. **Negative scoring campaigns** (activate)
4. **Decay campaigns** (schedule)
5. **MQL trigger** (activate last)

### 7.2 Score Distribution Monitoring

After 2 weeks, check distribution:

```javascript
mcp__marketo__lead_query({
  filterType: 'staticList',
  filterValues: ['All Leads'],
  fields: ['leadScore', 'behaviorScore', 'demographicScore']
})
```

Expected healthy distribution:
- 0-20 points: ~40% of leads
- 21-50 points: ~35% of leads
- 51-80 points: ~20% of leads
- 81+ points (MQL candidates): ~5% of leads

### 7.3 MQL Rate Monitoring

Track weekly:
- New MQLs generated
- MQL acceptance rate (sales)
- MQL rejection rate
- Average time to MQL

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Scores not changing | Campaign inactive | Verify activation status |
| Too many MQLs | Threshold too low | Raise threshold |
| Too few MQLs | Threshold too high | Lower threshold |
| Wrong score values | Flow step error | Review flow configuration |
| Decay not running | Batch not scheduled | Check schedule settings |

### Score Audit

Run monthly audit:
```
/marketo-audit --focus=scoring
```

Check for:
- Leads with score > 200 (score inflation)
- Leads with negative scores (over-penalized)
- Leads stuck at exact threshold (scoring gap)

---

## Quick Commands

```bash
# Create scoring model wizard
/create-scoring-model --type=combined --mql-threshold=90

# Test scoring on a lead
/marketo-preflight scoring-test --lead=12345

# Audit existing scoring
/marketo-audit --focus=scoring

# View lead score history
/marketo-logs --filter=score-change --lead=12345
```

---

## Related Resources

- **Agent**: `marketo-lead-scoring-architect`
- **Script**: `scripts/lib/scoring-rule-generator.js`
- **Command**: `/create-scoring-model`
- **Runbook**: `mql-handoff-workflow.md`

---

## Appendix: Default Scoring Matrix

### Behavioral Scoring Reference

| Category | Action | Points |
|----------|--------|--------|
| **Email** | Open | +1 |
| | Click | +3 |
| | Multiple clicks | +5 |
| | Unsubscribe | -50 |
| | Hard bounce | -25 |
| **Web** | Any page visit | +1 |
| | Features page | +5 |
| | Pricing page | +10 |
| | Demo page | +15 |
| | Careers page | -20 |
| **Forms** | Newsletter | +5 |
| | Content download | +10 |
| | Contact form | +20 |
| | Demo request | +25 |
| | Free trial | +30 |
| **Events** | Webinar registration | +15 |
| | Webinar attendance | +25 |
| | Conference attendance | +25 |

### Demographic Scoring Reference

| Category | Criteria | Points |
|----------|----------|--------|
| **Job Title** | C-Level | +15 |
| | VP | +12 |
| | Director | +10 |
| | Manager | +7 |
| | Senior/Lead | +5 |
| | Student/Intern | -10 |
| **Industry** | Primary target | +10 |
| | Secondary target | +5 |
| | Other | 0 |
| **Company Size** | 1,000+ | +10 |
| | 100-999 | +8 |
| | 50-99 | +5 |
| | 20-49 | +3 |
| | <20 | 0 |
| **Geography** | Primary market | +5 |
| | Secondary market | +3 |
| | Other | 0 |
