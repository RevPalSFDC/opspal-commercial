# MQL Handoff Workflow Runbook

## Purpose

Complete operational procedures for automating the Marketing Qualified Lead (MQL) handoff process from Marketo to Salesforce sales teams.

## Overview

The MQL handoff workflow ensures qualified leads are automatically synced to Salesforce, assigned to the right sales rep, and tracked with SLAs for timely follow-up.

### Workflow Components

```
Lead Scoring → MQL Threshold → SFDC Sync → Lead Assignment → Sales Alert → SLA Monitoring → Recycle/Convert
```

---

## Phase 1: MQL Definition

### 1.1 MQL Criteria

Define what constitutes a Marketing Qualified Lead:

#### Score Threshold
- [ ] **Behavior Score**: >= ___
- [ ] **Demographic Score**: >= ___
- [ ] **Combined Score**: >= ___ (optional)

#### Required Fields
All required fields must be populated before MQL:

| Field | Required | Reason |
|-------|----------|--------|
| Email Address | Yes | Contact method |
| First Name | Yes | Personalization |
| Last Name | Yes | Personalization |
| Company | Yes | Account matching |
| Phone | Recommended | Outreach option |
| Job Title | Recommended | Qualification |

#### Exclusion Criteria
Leads meeting these criteria should NOT become MQL:

- [ ] **Competitors**: Email domain in competitor list
- [ ] **Existing Customers**: Account type = Customer
- [ ] **Unsubscribed**: Email status = Unsubscribed
- [ ] **Previously Disqualified**: Lead Status = Disqualified
- [ ] **Recent MQL**: MQL Date in past 30 days (cooling off)
- [ ] **Do Not Contact**: Data privacy flag = True

### 1.2 MQL Validation Checklist

Before a lead becomes MQL, verify:

- [ ] Score threshold met
- [ ] Required fields populated
- [ ] Not in exclusion lists
- [ ] Data quality acceptable
- [ ] SFDC ready (no sync blockers)

---

## Phase 2: Trigger Campaign Setup

### 2.1 Create MQL Trigger Campaign

**Campaign Name:** `MQL - Qualification Trigger`

**Location:** Scoring Operations > 04-MQL Triggers

**Smart List:**
```
Filter 1: Behavior Score >= [THRESHOLD]
Filter 2: Demographic Score >= [THRESHOLD]
Filter 3: Lead Status NOT Disqualified, Customer, Recycled
Filter 4: MQL Date is empty OR MQL Date before [30 days ago]
Filter 5: Email Address NOT contains [competitor domains]
Filter 6: Unsubscribed = False
```

**Qualification Rules:** Each lead can run once per 30 days

**Flow:**
```
1. Change Data Value: MQL Date = {{system.date}}
2. Change Data Value: Lifecycle Stage = MQL
3. Change Data Value: Lead Status = Marketing Qualified
4. Sync Lead to SFDC (if not synced)
5. Wait: 5 minutes (allow sync to complete)
6. Request Campaign: [Sales Alert Campaign]
7. Add Interesting Moment:
   - Type: Milestone
   - Description: "Achieved MQL status (Score: {{lead.Lead Score}})"
```

### 2.2 Data Enrichment (Optional)

If using enrichment service, add before SFDC sync:

**Flow Addition:**
```
4a. Call Webhook: [Enrichment Service]
4b. Wait: 2 minutes (enrichment processing)
```

---

## Phase 3: Salesforce Sync Configuration

### 3.1 Sync Prerequisites

Verify SFDC sync is properly configured:

- [ ] **Marketo Sync User**: Active in SFDC
- [ ] **Field Mappings**: Complete and current
- [ ] **Sync Rules**: Lead sync enabled
- [ ] **API Limits**: Sufficient capacity

Check sync status:
```
/monitor-sync --full
```

### 3.2 Required SFDC Fields

Ensure these fields exist and are mapped:

| Marketo Field | SFDC Field | Type |
|---------------|------------|------|
| Email Address | Email | Standard |
| First Name | FirstName | Standard |
| Last Name | LastName | Standard |
| Company | Company | Standard |
| Lead Score | Lead_Score__c | Custom |
| Behavior Score | Behavior_Score__c | Custom |
| Demographic Score | Demographic_Score__c | Custom |
| MQL Date | MQL_Date__c | Custom |
| Lifecycle Stage | Lifecycle_Stage__c | Custom |
| Lead Source | LeadSource | Standard |

Verify mappings:
```javascript
mcp__marketo__sync_field_mappings({ objectType: 'lead', includeCustom: true })
```

### 3.3 Sync Error Handling

Configure error handling for sync failures:

**Create Campaign:** `MQL - Sync Error Handler`

**Smart List:**
- Trigger: Lead Sync to SFDC Failed

**Flow:**
1. Send Alert: Marketing Ops - Sync Failure
2. Add to List: MQL Sync Errors
3. Wait: 1 hour
4. Sync Lead to SFDC (retry)

---

## Phase 4: Lead Assignment Configuration

### 4.1 Assignment Methods

Choose and configure assignment method:

#### Option A: Round Robin

**SFDC Configuration:**
1. Setup > Lead Assignment Rules
2. Create rule: "MQL Round Robin"
3. Add rule criteria: Lead Source = Marketo MQL
4. Configure assignment users

**Marketo Flow Addition:**
```
8. Change Data Value: Lead Assignment Queue = Round Robin
```

#### Option B: Territory-Based

**SFDC Configuration:**
1. Setup > Territory Management
2. Define territories by geography/industry
3. Assign users to territories

**Marketo Flow Addition:**
```
8. Change Data Value: Territory = {{lead.State}} or {{lead.Country}}
```

#### Option C: Account-Based

**For Named Accounts:**

**Smart List Addition:**
```
Filter: Company is in list [Named Accounts]
```

**Flow:**
```
8. Choice 1: If Company = "Acme Corp"
   - Change Lead Owner: John Smith
   Choice 2: If Company = "Beta Inc"
   - Change Lead Owner: Jane Doe
   Default: Use Round Robin
```

### 4.2 Fallback Assignment

Always configure fallback for unassigned leads:

**Smart List:**
- Lead Owner is empty
- MQL Date in past 24 hours

**Flow:**
1. Change Lead Owner: [Default Queue/User]
2. Send Alert: Unassigned MQL

---

## Phase 5: Sales Notification Setup

### 5.1 Alert Email Configuration

**Create Email:** `Sales Alert - New MQL`

**Subject:** `🔥 New MQL: {{lead.First Name}} at {{lead.Company}}`

**Content Template:**
```html
<h2>New Marketing Qualified Lead</h2>

<table>
  <tr><td><strong>Name:</strong></td><td>{{lead.First Name}} {{lead.Last Name}}</td></tr>
  <tr><td><strong>Title:</strong></td><td>{{lead.Job Title}}</td></tr>
  <tr><td><strong>Company:</strong></td><td>{{lead.Company}}</td></tr>
  <tr><td><strong>Email:</strong></td><td>{{lead.Email Address}}</td></tr>
  <tr><td><strong>Phone:</strong></td><td>{{lead.Phone Number}}</td></tr>
</table>

<h3>Lead Score: {{lead.Lead Score}}</h3>
<ul>
  <li>Behavior Score: {{lead.Behavior Score}}</li>
  <li>Demographic Score: {{lead.Demographic Score}}</li>
</ul>

<h3>Recent Activities</h3>
{{my.Recent Activities}}

<p>
  <a href="https://[instance].salesforce.com/{{lead.SFDC Lead Id}}">View in Salesforce</a> |
  <a href="https://[instance].marketo.com/leadDatabase/loadLeadDetail?leadId={{lead.Id}}">View in Marketo</a>
</p>
```

### 5.2 Sales Alert Campaign

**Campaign Name:** `MQL - Sales Alert Notification`

**Smart List:**
- Trigger: Campaign is Requested
- Source: MQL Qualification Trigger

**Flow:**
```
1. Send Alert:
   - To: {{lead.Lead Owner Email Address}}
   - Template: Sales Alert - New MQL

2. Choice: If Lead Score >= 80 (High Value)
   - Send Alert:
     - To: [Sales Manager Email]
     - Subject: "🎯 HIGH-VALUE MQL: {{lead.First Name}} at {{lead.Company}}"
```

### 5.3 Slack Notification (Optional)

Add webhook for Slack alerts:

**Flow Addition:**
```
3. Call Webhook: Slack - New MQL
   - URL: [Slack Webhook URL]
   - Payload: JSON with lead details
```

---

## Phase 6: SLA Monitoring

### 6.1 SLA Definitions

Define response time requirements:

| Lead Type | First Contact SLA | Escalation Trigger |
|-----------|-------------------|-------------------|
| High Value (Score > 80) | 1 hour | 2 hours |
| Standard MQL | 4 hours | 8 hours |
| Recycled Lead | 24 hours | 48 hours |

### 6.2 SLA Warning Campaign

**Campaign Name:** `MQL - SLA Warning Alert`

**Smart List:**
- MQL Date: after [SLA hours] ago
- SFDC Last Activity Date: is empty
- Lead Status: Marketing Qualified

**Flow:**
```
1. Send Alert:
   - To: {{lead.Lead Owner Email Address}}
   - Subject: "⚠️ SLA Warning: {{lead.First Name}} needs follow-up"

2. Add Interesting Moment:
   - Type: Milestone
   - Description: "SLA warning - approaching deadline"
```

**Schedule:** Run every 30 minutes

### 6.3 SLA Escalation Campaign

**Campaign Name:** `MQL - SLA Escalation Alert`

**Smart List:**
- MQL Date: before [Escalation hours] ago
- SFDC Last Activity Date: is empty
- Lead Status: Marketing Qualified
- NOT Already Escalated this week

**Flow:**
```
1. Send Alert:
   - To: [Sales Manager]
   - CC: [Marketing Ops]
   - Subject: "🚨 SLA BREACH: {{lead.Company}} - Immediate attention required"

2. Change Data Value: SLA Escalated = True

3. Add Interesting Moment:
   - Type: Alert
   - Description: "SLA BREACHED - Escalated to management"
```

**Schedule:** Run every hour

---

## Phase 7: Recycle Workflow

### 7.1 Rejection Triggers

Configure campaigns for sales rejection scenarios:

**Campaign Name:** `MQL - Recycle from Rejection`

**Smart List:**
- Data Value Changed
- Attribute: Lead Status (in SFDC)
- New Value: Recycled, Rejected, Disqualified

**Flow:**
```
1. Change Data Value: Lead Status = Nurture
2. Change Data Value: Lifecycle Stage = Known
3. Change Data Value: Behavior Score = 0 (reset)
4. Change Data Value: MQL Date = empty
5. Wait: 30 days (cooling off period)
6. Add to Engagement Program: Re-engagement Nurture

7. Add Interesting Moment:
   - Type: Milestone
   - Description: "Recycled from MQL - returned to nurture"
```

### 7.2 Rejection Reason Tracking

Track why leads are rejected:

| Rejection Reason | Action |
|------------------|--------|
| Not ready to buy | Re-nurture with educational content |
| Wrong contact | Request correct contact info |
| Budget constraints | Re-engage next quarter |
| Competitor chosen | Add to win-back campaign |
| Not a fit | Update scoring model |

**Create Field:** `MQL_Rejection_Reason__c` (Picklist)

**Flow Addition:**
```
8. Send Alert to Marketing:
   - Subject: "MQL Rejected: {{lead.MQL Rejection Reason}}"
```

### 7.3 Re-Qualification Rules

Configure how recycled leads can re-qualify:

- Minimum waiting period: 30 days
- Must reach threshold again
- Different qualifying activity than before

---

## Phase 8: Activation & Monitoring

### 8.1 Activation Checklist

Before activating the MQL handoff workflow:

- [ ] MQL criteria defined and documented
- [ ] SFDC sync verified working
- [ ] Assignment rules configured and tested
- [ ] Alert email approved and tested
- [ ] SLA campaigns scheduled
- [ ] Recycle workflow configured
- [ ] Test lead successfully processed

### 8.2 Activation Order

1. Sync Error Handler (activate)
2. Sales Alert Campaign (activate)
3. SLA Warning Campaign (schedule)
4. SLA Escalation Campaign (schedule)
5. Recycle Campaign (activate)
6. MQL Trigger Campaign (activate LAST)

### 8.3 Monitoring Dashboard

Track these metrics weekly:

| Metric | Target | Current |
|--------|--------|---------|
| New MQLs | ___ / week | |
| MQL to SQL Rate | > 25% | |
| Average Time to Follow-up | < 4 hours | |
| SLA Compliance Rate | > 90% | |
| Rejection Rate | < 30% | |

Run report:
```
/monitor-sync --metrics=mql
```

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Leads not becoming MQL | Threshold too high | Review score distribution |
| Sync failing | SFDC permissions | Check Marketo sync user |
| Alerts not sending | Email not approved | Approve alert email |
| Wrong owner assigned | Assignment rule error | Review SFDC rules |
| SLA alerts flooding | Short interval | Adjust schedule |

### Diagnostic Queries

Check MQL pipeline:
```javascript
mcp__marketo__lead_query({
  filterType: 'leadStatus',
  filterValues: ['Marketing Qualified'],
  fields: ['email', 'leadScore', 'mqlDate', 'leadOwner']
})
```

Check sync errors:
```javascript
mcp__marketo__sync_errors({ limit: 50, errorType: 'validation' })
```

---

## Quick Commands

```bash
# Configure MQL handoff wizard
/configure-mql-handoff --threshold=90 --assignment=round-robin

# Pre-flight validation
/marketo-preflight handoff --target=MQL_PROGRAM_ID

# Monitor sync status
/monitor-sync --full

# View MQL logs
/marketo-logs --filter=mql
```

---

## Related Resources

- **Agent**: `marketo-mql-handoff-orchestrator`
- **Script**: `scripts/lib/mql-handoff-configurator.js`
- **Command**: `/configure-mql-handoff`
- **Runbook**: `lead-scoring-model-setup.md`
- **Runbook**: `salesforce-sync-troubleshooting.md`

---

## Appendix: Field Reference

### Custom Fields for MQL Workflow

| Field | API Name | Type | Purpose |
|-------|----------|------|---------|
| MQL Date | MQLDate__c | DateTime | When lead became MQL |
| Lifecycle Stage | LifecycleStage__c | Picklist | Current stage |
| Lead Score | LeadScore | Integer | Total score |
| Behavior Score | BehaviorScore__c | Integer | Engagement score |
| Demographic Score | DemographicScore__c | Integer | Fit score |
| SLA Escalated | SLAEscalated__c | Boolean | Escalation flag |
| MQL Rejection Reason | MQLRejectionReason__c | Picklist | Why rejected |
| Last Scoring Activity | LastScoringActivity__c | DateTime | Score activity |

### Lifecycle Stage Values

| Stage | Description |
|-------|-------------|
| Unknown | New lead, no data |
| Known | Has email, basic info |
| Engaged | Active engagement |
| MQL | Marketing Qualified |
| SQL | Sales Qualified |
| Opportunity | In pipeline |
| Customer | Closed won |
| Disqualified | Not a fit |
| Recycled | Returned to nurture |
