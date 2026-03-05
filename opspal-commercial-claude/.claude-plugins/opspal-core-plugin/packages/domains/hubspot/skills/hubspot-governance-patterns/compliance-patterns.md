# Compliance Patterns

## GDPR Compliance

### Data Subject Rights Implementation

#### Right to Access (Article 15)
```javascript
// Workflow: GDPR Data Access Request
const accessRequestWorkflow = {
  name: 'WF_GDPR_AccessRequest_v1',
  trigger: 'form_submission',
  form: 'gdpr_data_access_request',
  actions: [
    {
      type: 'create_task',
      assignTo: 'privacy_team',
      title: 'GDPR Access Request - {{contact.email}}',
      dueDate: '+30days',
      priority: 'high'
    },
    {
      type: 'send_email',
      template: 'gdpr_access_acknowledgment',
      delay: '0'
    },
    {
      type: 'set_property',
      property: 'gdpr_access_requested',
      value: 'true'
    },
    {
      type: 'set_property',
      property: 'gdpr_request_date',
      value: '{{current_date}}'
    }
  ]
};
```

#### Right to Erasure (Article 17)
```javascript
// Workflow: GDPR Deletion Request
const deletionRequestWorkflow = {
  name: 'WF_GDPR_DeletionRequest_v1',
  trigger: 'form_submission',
  form: 'gdpr_deletion_request',
  actions: [
    {
      type: 'create_task',
      assignTo: 'privacy_team',
      title: 'GDPR Deletion Request - {{contact.email}}',
      dueDate: '+30days',
      priority: 'high',
      body: 'Verify identity before proceeding. Check for legal holds.'
    },
    {
      type: 'send_email',
      template: 'gdpr_deletion_acknowledgment'
    },
    {
      type: 'add_to_list',
      list: 'GDPR_Deletion_Pending'
    }
  ]
};
```

### Consent Management

#### Consent Collection
```javascript
const consentProperties = [
  {
    name: 'gdpr_consent_marketing',
    type: 'enumeration',
    options: ['opted_in', 'opted_out', 'not_set'],
    description: 'Marketing communications consent'
  },
  {
    name: 'gdpr_consent_date',
    type: 'datetime',
    description: 'Date consent was given/withdrawn'
  },
  {
    name: 'gdpr_consent_source',
    type: 'string',
    description: 'Source of consent (form, verbal, etc.)'
  },
  {
    name: 'gdpr_legal_basis',
    type: 'enumeration',
    options: ['consent', 'contract', 'legitimate_interest', 'legal_obligation'],
    description: 'Legal basis for processing'
  }
];
```

#### Consent Validation Workflow
```yaml
Workflow: GDPR Consent Validation
Trigger: Contact enrollment (all new contacts)
Conditions:
  - gdpr_consent_marketing IS UNKNOWN
Actions:
  1. Delay 24 hours
  2. If still unknown:
     - Send consent request email
     - Set reminder task
  3. After 7 days if still unknown:
     - Add to suppression list
     - Set gdpr_consent_marketing = opted_out
```

### Data Retention

#### Retention Policies
```javascript
const retentionPolicies = {
  contacts: {
    inactive: {
      period: '36_months',
      action: 'anonymize',
      condition: 'no_activity_and_no_deals'
    },
    bounced: {
      period: '12_months',
      action: 'delete',
      condition: 'hard_bounce'
    }
  },
  deals: {
    closed_lost: {
      period: '24_months',
      action: 'archive',
      condition: 'closed_lost'
    }
  },
  activities: {
    emails: {
      period: '36_months',
      action: 'anonymize'
    },
    calls: {
      period: '24_months',
      action: 'delete'
    }
  }
};
```

## CCPA Compliance

### Do Not Sell Implementation

```javascript
// CCPA Do Not Sell workflow
const ccpaDoNotSellWorkflow = {
  name: 'WF_CCPA_DoNotSell_v1',
  trigger: 'form_submission',
  form: 'ccpa_opt_out',
  actions: [
    {
      type: 'set_property',
      property: 'ccpa_do_not_sell',
      value: 'true'
    },
    {
      type: 'set_property',
      property: 'ccpa_opt_out_date',
      value: '{{current_date}}'
    },
    {
      type: 'remove_from_list',
      list: 'Third_Party_Data_Sharing'
    },
    {
      type: 'send_email',
      template: 'ccpa_opt_out_confirmation'
    }
  ]
};
```

### CCPA Required Properties
```javascript
const ccpaProperties = [
  {
    name: 'ccpa_do_not_sell',
    type: 'bool',
    description: 'CCPA Do Not Sell preference'
  },
  {
    name: 'ccpa_opt_out_date',
    type: 'datetime',
    description: 'Date of CCPA opt-out'
  },
  {
    name: 'ccpa_disclosure_date',
    type: 'datetime',
    description: 'Last privacy disclosure provided'
  },
  {
    name: 'california_resident',
    type: 'bool',
    description: 'California residency status'
  }
];
```

## CAN-SPAM Compliance

### Email Compliance Checklist
```
Required Elements:
[ ] Clear "From" name and email
[ ] Accurate subject line (no deception)
[ ] Physical mailing address included
[ ] Unsubscribe link visible and functional
[ ] Opt-out honored within 10 business days
[ ] Commercial intent disclosed (if applicable)
```

### Unsubscribe Handling
```yaml
Workflow: Unsubscribe Processing
Trigger: Email unsubscribe action
Actions:
  1. Set email_unsubscribed = true
  2. Set unsubscribe_date = current_date
  3. Remove from all marketing lists
  4. Exclude from future email workflows
  5. Send confirmation (optional)
Note: Process must complete within 10 business days
```

## Compliance Audit Checklist

### Monthly Compliance Review
```
GDPR:
[ ] Review pending access requests (must complete in 30 days)
[ ] Review pending deletion requests (must complete in 30 days)
[ ] Verify consent records are current
[ ] Check data retention compliance
[ ] Review third-party data sharing agreements

CCPA:
[ ] Process Do Not Sell requests (45-day window)
[ ] Update data inventory if changed
[ ] Verify disclosure documents current

CAN-SPAM:
[ ] Audit unsubscribe processing time
[ ] Verify physical address in all emails
[ ] Check for deceptive subject lines
[ ] Review suppression list accuracy
```

### Compliance Documentation
```
Required Records:
- Data processing agreements (DPAs)
- Privacy impact assessments (PIAs)
- Consent audit logs
- Access/deletion request logs
- Training completion records
- Incident response procedures
- Third-party vendor assessments
```

## Compliance Monitoring

### Alerts and Notifications
```javascript
const complianceAlerts = [
  {
    condition: 'gdpr_request_overdue',
    threshold: 'request_date + 25 days',
    action: 'alert_privacy_team',
    severity: 'high'
  },
  {
    condition: 'consent_gap',
    threshold: 'contacts_without_consent > 1000',
    action: 'alert_marketing_ops',
    severity: 'medium'
  },
  {
    condition: 'retention_violation',
    threshold: 'inactive_contacts > retention_period',
    action: 'trigger_cleanup_workflow',
    severity: 'medium'
  }
];
```

### Compliance Dashboard KPIs
| KPI | Target | Alert Threshold |
|-----|--------|-----------------|
| GDPR requests processed on time | 100% | <95% |
| Consent coverage | >95% | <90% |
| Unsubscribe processing time | <24h | >48h |
| Data retention compliance | 100% | Any violation |
| Privacy training completion | 100% | <100% |
