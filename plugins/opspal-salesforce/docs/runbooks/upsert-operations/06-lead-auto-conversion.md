# 06 - Lead Auto-Conversion

Automated Lead conversion with match-then-convert workflow, duplicate prevention, and Campaign history preservation.

## Lead Conversion Overview

Lead conversion transforms a Lead record into:
- **Contact** - The person
- **Account** - The company (optional, can use existing)
- **Opportunity** - The deal (optional)

### Conversion Decision Tree

```
Lead Qualifies for Conversion?
        │
        ▼
   ┌────┴────┐
   │   YES   │────────────────────────────────────┐
   └────┬────┘                                    │
        │                                         │
        ▼                                         │
Find Matching Account                             │
        │                                         │
   ┌────┴────┐                                    │
   │  FOUND  │                                    │
   └────┬────┘                                    │
        │                                         │
        ▼                                         │
Find Matching Contact (under Account)             │
        │                                         │
   ┌────┴────┬────────────────┐                   │
   │  FOUND  │    NOT FOUND   │                   │
   └────┬────┘    └────┬──────┘                   │
        │              │                          │
        ▼              ▼                          │
   Convert to     Convert to                      │
   Existing       Existing Account,               │
   Account/       Create Contact                  │
   Contact                                        │
        │              │                          │
        └──────┬───────┘                          │
               │                                  │
               ▼                                  │
┌────────────────────────────────────────────────┐
│  NO Account Found                              │
│  ├── Create Account                            │
│  └── Create Contact                            │
└────────────────────────────────────────────────┘
               │
               ▼
   ┌────┴────┐
   │   NO    │ (Lead doesn't qualify)
   └────┬────┘
        │
        ▼
Keep as Lead → Enrich → Nurture
```

## Conversion Criteria

### Default Qualification Criteria

```json
{
  "conversionCriteria": [
    {
      "name": "Sales Qualified Lead",
      "conditions": [
        { "field": "Status", "operator": "equals", "value": "Qualified" }
      ],
      "createOpportunity": true,
      "opportunityName": "{Company} - New Business"
    },
    {
      "name": "Marketing Qualified Lead",
      "conditions": [
        { "field": "Status", "operator": "equals", "value": "Marketing Qualified" },
        { "field": "Lead_Score__c", "operator": ">=", "value": 50 }
      ],
      "createOpportunity": false
    },
    {
      "name": "High Value Lead",
      "conditions": [
        { "field": "AnnualRevenue", "operator": ">=", "value": 1000000 }
      ],
      "createOpportunity": true,
      "opportunityStage": "Qualification"
    }
  ]
}
```

### Evaluating Conversion Readiness

```javascript
const evaluateConversionCriteria = (lead, criteria) => {
    for (const rule of criteria) {
        const allConditionsMet = rule.conditions.every(condition => {
            const fieldValue = lead[condition.field];

            switch (condition.operator) {
                case 'equals':
                    return fieldValue === condition.value;
                case 'not_equals':
                    return fieldValue !== condition.value;
                case '>=':
                    return fieldValue >= condition.value;
                case '<=':
                    return fieldValue <= condition.value;
                case 'in':
                    return condition.value.includes(fieldValue);
                case 'not_null':
                    return fieldValue != null;
                default:
                    return false;
            }
        });

        if (allConditionsMet) {
            return {
                qualifies: true,
                rule: rule.name,
                createOpportunity: rule.createOpportunity,
                opportunityName: rule.opportunityName,
                opportunityStage: rule.opportunityStage
            };
        }
    }

    return { qualifies: false };
};
```

## Pre-Conversion Diagnostics

Run diagnostics before conversion to identify blockers:

```javascript
const diagnoseConversionReadiness = async (leadId) => {
    const lead = await queryLead(leadId);

    const diagnosis = {
        leadId,
        leadName: `${lead.FirstName || ''} ${lead.LastName}`.trim(),
        company: lead.Company,
        status: lead.Status,
        readiness: 'READY',
        blockers: [],
        warnings: [],
        fieldChecks: [],
        accountMatches: [],
        contactMatches: [],
        campaigns: []
    };

    // Check if already converted
    if (lead.IsConverted) {
        diagnosis.readiness = 'BLOCKED';
        diagnosis.blockers.push({
            type: 'ALREADY_CONVERTED',
            message: 'Lead has already been converted',
            convertedDate: lead.ConvertedDate
        });
        return diagnosis;
    }

    // Check required fields
    const requiredFields = ['LastName', 'Company'];
    for (const field of requiredFields) {
        const hasValue = !!lead[field];
        diagnosis.fieldChecks.push({
            field,
            status: hasValue ? '✓' : '✗',
            value: lead[field] || null
        });

        if (!hasValue) {
            diagnosis.readiness = 'BLOCKED';
            diagnosis.blockers.push({
                type: 'REQUIRED_FIELD_MISSING',
                field,
                message: `Required field '${field}' is missing`
            });
        }
    }

    // Find potential Account matches
    diagnosis.accountMatches = await findMatchingAccounts(lead);

    if (diagnosis.accountMatches.length > 1) {
        diagnosis.warnings.push({
            type: 'MULTIPLE_ACCOUNT_MATCHES',
            message: 'Multiple potential Account matches found',
            accounts: diagnosis.accountMatches,
            recommendation: 'Review and select correct Account'
        });

        if (diagnosis.readiness === 'READY') {
            diagnosis.readiness = 'WARNINGS';
        }
    }

    // Check for existing Contact with same email
    if (lead.Email) {
        diagnosis.contactMatches = await findMatchingContacts(lead.Email);

        if (diagnosis.contactMatches.length > 0) {
            diagnosis.warnings.push({
                type: 'EXISTING_CONTACT',
                message: 'Contact with same email already exists',
                contacts: diagnosis.contactMatches,
                recommendation: 'Update existing Contact instead or merge after conversion'
            });

            if (diagnosis.readiness === 'READY') {
                diagnosis.readiness = 'WARNINGS';
            }
        }
    }

    // Get Campaign memberships
    diagnosis.campaigns = await getCampaignMemberships(leadId);

    return diagnosis;
};
```

### Diagnostic Output

```
Lead Conversion Diagnosis (00QABC123)
═══════════════════════════════════════════════════════

Lead: John Doe (john@acme.com)
Company: Acme Corporation
Status: Marketing Qualified

Conversion Readiness: ⚠ WARNINGS

Blockers (0):
  None detected

Warnings (2):
  ⚠ Account Match: Multiple potential matches found
    • Acme Corp (001ABC) - 85% confidence
    • ACME Inc (001DEF) - 72% confidence
    Recommendation: Review and select correct Account

  ⚠ Existing Contact: Contact with same email exists
    • Jane Doe (003XYZ) on Account 001ABC
    Recommendation: Update existing Contact instead

Required Fields Check:
  ✓ LastName: Doe
  ✓ Company: Acme Corporation
  ✓ Status: Marketing Qualified

Campaign Memberships (3):
  • Spring 2026 Campaign (Responded)
  • Product Webinar (Attended)
  • Newsletter (Subscribed)
  → All campaigns will transfer to Contact
```

## Match-Then-Convert Workflow

### Core Conversion Function

```javascript
const convertLead = async (leadId, options = {}) => {
    const result = {
        success: false,
        leadId,
        accountId: null,
        contactId: null,
        opportunityId: null,
        actions: [],
        errors: []
    };

    try {
        // Step 1: Get Lead details
        const lead = await queryLead(leadId);

        if (lead.IsConverted) {
            throw new Error('Lead is already converted');
        }

        // Step 2: Find or create Account
        let accountId = options.accountId;

        if (!accountId) {
            const matchedAccount = await findBestAccountMatch(lead);

            if (matchedAccount && matchedAccount.confidence >= 0.85) {
                accountId = matchedAccount.Id;
                result.actions.push({
                    type: 'ACCOUNT_MATCHED',
                    accountId,
                    accountName: matchedAccount.Name,
                    confidence: matchedAccount.confidence
                });
            } else if (options.createAccount !== false) {
                // Create new Account
                const accountData = mapLeadToAccount(lead);
                const newAccount = await createRecord('Account', accountData);
                accountId = newAccount.id;
                result.actions.push({
                    type: 'ACCOUNT_CREATED',
                    accountId
                });
            }
        }

        // Step 3: Check for existing Contact
        let contactId = null;
        const existingContact = await findExistingContact(lead.Email, accountId);

        if (existingContact && options.preventDuplicates !== false) {
            if (options.updateExistingContact) {
                // Update existing Contact with Lead data
                const updateData = mapLeadToContact(lead);
                await updateRecord('Contact', existingContact.Id, updateData);
                contactId = existingContact.Id;
                result.actions.push({
                    type: 'CONTACT_UPDATED',
                    contactId,
                    reason: 'Existing Contact found'
                });
            } else {
                // Skip Contact creation, convert to existing
                contactId = existingContact.Id;
                result.actions.push({
                    type: 'CONTACT_EXISTING',
                    contactId,
                    warning: 'Used existing Contact - consider merging'
                });
            }
        }

        // Step 4: Build conversion request
        const conversionData = {
            leadId,
            accountId,
            contactId,
            convertedStatus: options.convertedStatus || 'Closed - Converted',
            doNotCreateOpportunity: !options.createOpportunity
        };

        if (options.createOpportunity) {
            conversionData.opportunityName = options.opportunityName
                || `${lead.Company} - New Business`;
        }

        if (options.ownerId) {
            conversionData.ownerId = options.ownerId;
        }

        // Step 5: Execute conversion via API
        const conversionResult = await executeLeadConversion(conversionData);

        result.success = true;
        result.accountId = conversionResult.accountId;
        result.contactId = conversionResult.contactId;
        result.opportunityId = conversionResult.opportunityId;

        result.actions.push({
            type: 'LEAD_CONVERTED',
            accountId: result.accountId,
            contactId: result.contactId,
            opportunityId: result.opportunityId
        });

        // Step 6: Post-conversion tasks

        // Create Contact Role if Opportunity created
        if (result.opportunityId && options.contactRole) {
            await createContactRole(
                result.opportunityId,
                result.contactId,
                options.contactRole
            );
            result.actions.push({
                type: 'CONTACT_ROLE_CREATED',
                role: options.contactRole
            });
        }

        // Verify Campaign history transferred
        const campaignCount = await verifyCampaignTransfer(leadId, result.contactId);
        result.actions.push({
            type: 'CAMPAIGNS_TRANSFERRED',
            count: campaignCount
        });

    } catch (error) {
        result.success = false;
        result.errors.push({
            type: 'CONVERSION_ERROR',
            message: error.message
        });
    }

    return result;
};
```

### Salesforce Lead Conversion API

```javascript
const executeLeadConversion = async (conversionData) => {
    // Using sfdx/sf CLI
    const cmd = `sf data convert lead \
        --id ${conversionData.leadId} \
        ${conversionData.accountId ? `--account-id ${conversionData.accountId}` : ''} \
        ${conversionData.contactId ? `--contact-id ${conversionData.contactId}` : ''} \
        --converted-status "${conversionData.convertedStatus}" \
        ${conversionData.doNotCreateOpportunity ? '--do-not-create-opportunity' : ''} \
        ${conversionData.opportunityName ? `--opportunity-name "${conversionData.opportunityName}"` : ''} \
        --json`;

    const result = await executeCommand(cmd);
    return JSON.parse(result);
};

// Alternative: Using Apex/REST API
const executeLeadConversionApex = async (conversionData) => {
    const apex = `
        Database.LeadConvert lc = new Database.LeadConvert();
        lc.setLeadId('${conversionData.leadId}');
        ${conversionData.accountId ? `lc.setAccountId('${conversionData.accountId}');` : ''}
        ${conversionData.contactId ? `lc.setContactId('${conversionData.contactId}');` : ''}
        lc.setConvertedStatus('${conversionData.convertedStatus}');
        lc.setDoNotCreateOpportunity(${conversionData.doNotCreateOpportunity});
        ${conversionData.opportunityName ? `lc.setOpportunityName('${conversionData.opportunityName}');` : ''}
        ${conversionData.ownerId ? `lc.setOwnerId('${conversionData.ownerId}');` : ''}

        Database.LeadConvertResult lcr = Database.convertLead(lc);
        System.debug(JSON.serialize(lcr));
    `;

    return await executeAnonymousApex(apex);
};
```

## Duplicate Contact Prevention

### Strategy 1: Convert to Existing Contact

```javascript
const findExistingContact = async (email, accountId) => {
    if (!email) return null;

    let query = `
        SELECT Id, Name, Email, AccountId
        FROM Contact
        WHERE Email = '${email.toLowerCase()}'
    `;

    if (accountId) {
        query += ` AND AccountId = '${accountId}'`;
    }

    query += ' LIMIT 1';

    const contacts = await executeQuery(query);
    return contacts[0] || null;
};
```

### Strategy 2: Merge After Conversion

```javascript
const mergeAfterConversion = async (oldContactId, newContactId) => {
    // Use sfdc-dedup-safety-copilot for safe merge
    return await Task({
        subagent_type: 'opspal-salesforce:sfdc-dedup-safety-copilot',
        prompt: `Merge Contact ${newContactId} into ${oldContactId} as survivor`
    });
};
```

### Strategy 3: Update Existing Contact

```javascript
const updateExistingContact = async (contactId, leadData) => {
    const updateFields = {};

    // Only update null/empty fields on existing Contact
    const existingContact = await queryContact(contactId);
    const mappedData = mapLeadToContact(leadData);

    for (const [field, value] of Object.entries(mappedData)) {
        if (value && !existingContact[field]) {
            updateFields[field] = value;
        }
    }

    if (Object.keys(updateFields).length > 0) {
        await updateRecord('Contact', contactId, updateFields);
    }

    return { contactId, fieldsUpdated: Object.keys(updateFields) };
};
```

## Campaign History Preservation

Campaign memberships automatically transfer during standard Lead conversion. Verify transfer:

```javascript
const verifyCampaignTransfer = async (leadId, contactId) => {
    // Get original Lead campaigns
    const leadCampaigns = await executeQuery(`
        SELECT CampaignId, Status
        FROM CampaignMember
        WHERE LeadId = '${leadId}'
    `);

    // Verify Contact has matching campaigns
    const contactCampaigns = await executeQuery(`
        SELECT CampaignId, Status
        FROM CampaignMember
        WHERE ContactId = '${contactId}'
    `);

    const contactCampaignIds = new Set(contactCampaigns.map(c => c.CampaignId));

    const missing = leadCampaigns.filter(lc =>
        !contactCampaignIds.has(lc.CampaignId)
    );

    if (missing.length > 0) {
        // Manually create missing campaign memberships
        for (const campaign of missing) {
            await createRecord('CampaignMember', {
                CampaignId: campaign.CampaignId,
                ContactId: contactId,
                Status: campaign.Status
            });
        }
    }

    return leadCampaigns.length;
};
```

## Batch Conversion

```javascript
const batchConvertLeads = async (criteria, options = {}) => {
    const batchSize = options.batchSize || 50;
    const dryRun = options.dryRun || false;

    // Query leads matching criteria
    const leads = await queryLeads(criteria, batchSize);

    const results = {
        total: leads.length,
        converted: 0,
        skipped: 0,
        failed: 0,
        details: []
    };

    for (const lead of leads) {
        try {
            // Check conversion readiness
            const diagnosis = await diagnoseConversionReadiness(lead.Id);

            if (diagnosis.readiness === 'BLOCKED') {
                results.skipped++;
                results.details.push({
                    leadId: lead.Id,
                    status: 'SKIPPED',
                    reason: diagnosis.blockers[0]?.message
                });
                continue;
            }

            if (dryRun) {
                results.details.push({
                    leadId: lead.Id,
                    status: 'WOULD_CONVERT',
                    diagnosis
                });
                continue;
            }

            // Execute conversion
            const conversionResult = await convertLead(lead.Id, {
                createOpportunity: options.createOpportunity,
                preventDuplicates: options.preventDuplicates,
                contactRole: options.contactRole || 'Decision Maker'
            });

            if (conversionResult.success) {
                results.converted++;
                results.details.push({
                    leadId: lead.Id,
                    status: 'CONVERTED',
                    accountId: conversionResult.accountId,
                    contactId: conversionResult.contactId,
                    opportunityId: conversionResult.opportunityId
                });
            } else {
                results.failed++;
                results.details.push({
                    leadId: lead.Id,
                    status: 'FAILED',
                    errors: conversionResult.errors
                });
            }

        } catch (error) {
            results.failed++;
            results.details.push({
                leadId: lead.Id,
                status: 'ERROR',
                error: error.message
            });
        }
    }

    return results;
};
```

## Configuration

**Location:** `instances/{org}/lead-conversion-rules.json`

```json
{
  "conversionCriteria": [
    {
      "name": "Qualified Lead",
      "conditions": [
        { "field": "Status", "operator": "equals", "value": "Qualified" }
      ],
      "createOpportunity": true,
      "opportunityName": "{Company} - New Business",
      "opportunityStage": "Qualification"
    }
  ],
  "accountMatching": {
    "strategy": "domain-first",
    "createIfNoMatch": true,
    "confidenceThreshold": 0.85
  },
  "contactMatching": {
    "preventDuplicates": true,
    "updateExistingContact": false,
    "mergeAfterConversion": false
  },
  "ownershipRules": {
    "useAccountOwner": true,
    "fallbackToLeadOwner": true
  },
  "postConversion": {
    "createContactRole": true,
    "defaultContactRole": "Decision Maker",
    "verifyCampaignTransfer": true,
    "notifyOwner": true
  }
}
```

## Output Format

```json
{
  "conversionResults": {
    "summary": {
      "total": 50,
      "converted": 42,
      "skipped": 5,
      "failed": 3
    },
    "converted": [
      {
        "leadId": "00QABC123",
        "leadName": "John Doe",
        "accountId": "001XYZ789",
        "accountAction": "MATCHED_EXISTING",
        "contactId": "003NEW456",
        "contactAction": "CREATED",
        "opportunityId": "006OPP123",
        "opportunityName": "Acme - New Business",
        "contactRole": "Decision Maker",
        "campaignsTransferred": 3
      }
    ],
    "skipped": [
      {
        "leadId": "00QSKIP01",
        "reason": "Existing Contact found",
        "existingContactId": "003EXIST01"
      }
    ],
    "failed": [
      {
        "leadId": "00QFAIL01",
        "error": "VALIDATION_RULE_VIOLATION",
        "message": "Required field Budget__c is missing"
      }
    ]
  }
}
```

## Best Practices

1. **Always Run Diagnostics** - Check conversion readiness before converting
2. **Prevent Duplicates** - Check for existing Contacts before conversion
3. **Preserve Campaign History** - Verify all campaigns transferred
4. **Test in Sandbox** - Always test batch conversions in sandbox first
5. **Document Account Matching** - Keep clear records of why Accounts were matched

## Related Sections

- [02 - Matching Strategies](02-matching-strategies.md)
- [04 - Ownership Routing](04-ownership-routing.md)
- [07 - Error Handling](07-error-handling.md)

---
Next: [07 - Error Handling](07-error-handling.md)
