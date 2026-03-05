# HubSpot Bridge Setup Guide

## Purpose

Configure bidirectional data sync between Marketo and HubSpot.

## Overview

The Marketo-HubSpot bridge enables organizations using both platforms to:
- Sync contacts/leads between systems
- Route leads based on platform rules
- Consolidate engagement data
- Prevent duplicate records across platforms

## Architecture

```
┌─────────────────┐        Bridge Layer        ┌─────────────────┐
│     Marketo     │ ←─────────────────────────→│     HubSpot     │
│   (Leads)       │                            │   (Contacts)    │
│                 │    Field Mapping           │                 │
│   Programs      │    Sync Rules              │   Workflows     │
│   Campaigns     │    Duplicate Prevention    │   Sequences     │
│   Scoring       │                            │   Deals         │
└─────────────────┘                            └─────────────────┘
```

## Setup Steps

### Step 1: Define Sync Strategy

Determine your use case:

| Scenario | Primary Platform | Sync Direction |
|----------|------------------|----------------|
| Marketing in Marketo, Sales in HubSpot | Marketo | Marketo → HubSpot (MQLs) |
| Inbound via HubSpot, Nurture in Marketo | HubSpot | HubSpot → Marketo (Forms) |
| Unified reporting | Both | Bidirectional |

### Step 2: Field Mapping Configuration

Create field mapping file:
```
portals/{instance}/bridges/hubspot/field-mappings.json
```

**Standard Field Mappings**:
```json
{
  "fieldMappings": [
    {
      "marketo": "Email",
      "hubspot": "email",
      "direction": "bidirectional",
      "transform": null
    },
    {
      "marketo": "FirstName",
      "hubspot": "firstname",
      "direction": "bidirectional",
      "transform": null
    },
    {
      "marketo": "LastName",
      "hubspot": "lastname",
      "direction": "bidirectional",
      "transform": null
    },
    {
      "marketo": "Company",
      "hubspot": "company",
      "direction": "bidirectional",
      "transform": null
    },
    {
      "marketo": "Phone",
      "hubspot": "phone",
      "direction": "bidirectional",
      "transform": null
    },
    {
      "marketo": "LeadScore",
      "hubspot": "lead_score",
      "direction": "marketo_to_hubspot",
      "transform": null
    },
    {
      "marketo": "LeadSource",
      "hubspot": "leadsource",
      "direction": "bidirectional",
      "transform": "mapping"
    }
  ]
}
```

### Step 3: Sync Rules Configuration

Create sync rules file:
```
portals/{instance}/bridges/hubspot/sync-rules.json
```

**Example Rules**:
```json
{
  "marketoToHubspot": [
    {
      "name": "MQL Handoff",
      "trigger": "leadScore >= 100",
      "action": "createOrUpdate",
      "additionalFields": {
        "lifecyclestage": "marketingqualifiedlead",
        "lead_source_platform": "Marketo"
      }
    },
    {
      "name": "Demo Request",
      "trigger": "programMembership == 'Demo Request'",
      "action": "createOrUpdate",
      "additionalFields": {
        "demo_requested": true
      }
    }
  ],
  "hubspotToMarketo": [
    {
      "name": "Form Fill",
      "trigger": "formSubmission",
      "action": "createOrUpdate",
      "marketoProgram": "HubSpot-Leads",
      "leadSource": "HubSpot Form"
    },
    {
      "name": "Deal Stage Change",
      "trigger": "dealStageChange",
      "action": "updateStatus",
      "statusMapping": {
        "appointment scheduled": "SAL",
        "qualified to buy": "SQL",
        "closed won": "Customer",
        "closed lost": "Disqualified"
      }
    }
  ]
}
```

### Step 4: Duplicate Prevention

Configure matching rules:
```json
{
  "duplicatePrevention": {
    "primaryMatch": "email",
    "secondaryMatch": ["company", "lastName"],
    "tertiaryMatch": "phone",
    "conflictResolution": "mostRecent"
  }
}
```

### Step 5: Test Configuration

1. **Create test leads** in both systems
2. **Trigger sync** manually
3. **Verify field mapping** correct
4. **Check duplicate handling** working
5. **Validate status updates** flowing

## Sync Scenarios

### Scenario 1: MQL Handoff to HubSpot Sales

```javascript
// When Marketo lead reaches MQL threshold
// Create/update HubSpot contact for sales team

const syncConfig = {
  trigger: 'leadScore >= 100',
  action: 'hubspot.createOrUpdate',
  fieldMappings: {
    email: 'email',
    firstName: 'firstname',
    lastName: 'lastname',
    leadScore: 'lead_score',
    company: 'company'
  },
  additionalFields: {
    lifecyclestage: 'marketingqualifiedlead',
    lead_source: 'Marketo'
  }
};
```

### Scenario 2: HubSpot Form to Marketo Nurture

```javascript
// When HubSpot form submitted
// Create Marketo lead for nurture campaigns

const syncConfig = {
  trigger: 'formSubmission',
  action: 'marketo.createOrUpdate',
  fieldMappings: {
    email: 'Email',
    firstname: 'FirstName',
    lastname: 'LastName',
    company: 'Company'
  },
  marketoProgram: 'Nurture-Entry',
  leadSource: 'HubSpot Form'
};
```

### Scenario 3: Sales Feedback Loop

```javascript
// When HubSpot deal stage changes
// Update Marketo lead status for reporting

const syncConfig = {
  trigger: 'dealStageChange',
  action: 'marketo.updateStatus',
  stageMapping: {
    'appointment scheduled': 'SAL',
    'qualified to buy': 'SQL',
    'closed won': 'Customer',
    'closed lost': 'Disqualified'
  }
};
```

## Monitoring

### Daily Checks
- [ ] Sync jobs completing
- [ ] Error rate < 2%
- [ ] No duplicate alerts

### Weekly Checks
- [ ] Review sync volume
- [ ] Check field mapping accuracy
- [ ] Validate status sync

### Metrics to Track
| Metric | Target |
|--------|--------|
| Sync Success Rate | > 98% |
| Duplicate Rate | < 1% |
| Sync Latency | < 15 min |

## Troubleshooting

### Issue: Contact Not Syncing

1. Verify email address valid
2. Check field mapping complete
3. Review sync rule triggers
4. Check for duplicates

### Issue: Duplicate Created

1. Review matching configuration
2. Check primary match field populated
3. Verify matching rules order
4. Consider tighter matching criteria

### Issue: Field Not Updating

1. Verify field mapped
2. Check sync direction
3. Review field permissions
4. Validate transform rules

## Related Resources

- **Agent**: `marketo-hubspot-bridge`
- **Agent**: `hubspot-contact-manager` (HubSpot plugin)
- **Script**: Bridge configuration scripts
- **Storage**: `portals/{instance}/bridges/hubspot/`
