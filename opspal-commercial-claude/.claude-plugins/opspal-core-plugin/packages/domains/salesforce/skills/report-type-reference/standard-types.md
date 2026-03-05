# Standard Report Types

## Core Business Objects

### Accounts
| Report Type | API Name | Use Case |
|-------------|----------|----------|
| Accounts | Account | Account listings |
| Accounts with Contacts | AccountContact | Account-contact relationships |
| Accounts with Opportunities | AccountOpportunity | Pipeline by account |
| Accounts with Cases | AccountCase | Support by account |

### Contacts
| Report Type | API Name | Use Case |
|-------------|----------|----------|
| Contacts | Contact | Contact listings |
| Contacts with Accounts | ContactAccount | Contact-account relationships |
| Contacts and Activities | ContactActivity | Engagement tracking |

### Opportunities
| Report Type | API Name | Use Case |
|-------------|----------|----------|
| Opportunities | Opportunity | Pipeline reports |
| Opportunities with Products | OpportunityProduct | Product mix analysis |
| Opportunities with Contact Roles | OpportunityContactRole | Stakeholder analysis |
| Opportunities with Competitors | OpportunityCompetitor | Competitive analysis |

### Leads
| Report Type | API Name | Use Case |
|-------------|----------|----------|
| Leads | Lead | Lead listings |
| Leads with Converted Lead Info | LeadConversion | Conversion analysis |

### Cases
| Report Type | API Name | Use Case |
|-------------|----------|----------|
| Cases | Case | Case listings |
| Cases with Solutions | CaseSolution | Resolution tracking |
| Cases with Articles | CaseArticle | Knowledge usage |

## Activity Report Types

### Tasks
| Report Type | API Name | Use Case |
|-------------|----------|----------|
| Tasks and Events | Activity | All activities |
| Open Activities | OpenActivity | Outstanding tasks |
| Activity History | ActivityHistory | Completed activities |

### Events
| Report Type | API Name | Use Case |
|-------------|----------|----------|
| Events Only | Event | Calendar analysis |
| Events with Invitees | EventAttendee | Meeting participants |

## Administrative Report Types

### Users
| Report Type | API Name | Use Case |
|-------------|----------|----------|
| Users | User | User listings |
| Active Users | ActiveUser | Active user analysis |
| Login History | LoginHistory | Security auditing |

### Campaigns
| Report Type | API Name | Use Case |
|-------------|----------|----------|
| Campaigns | Campaign | Campaign listings |
| Campaigns with Campaign Members | CampaignMember | Campaign performance |
| Campaign ROI | CampaignROI | ROI analysis |

## Discovery Pattern

### List All Report Types
```javascript
const reportTypes = await mcp_salesforce_report_type_list();

reportTypes.forEach(rt => {
    console.log(`${rt.label} (${rt.developerName})`);
});
```

### Describe Report Type
```javascript
const details = await mcp_salesforce_report_type_describe('OpportunityProduct');

console.log('Fields:', details.fields.map(f => f.name));
console.log('Sections:', details.sections);
```

## Runbook Context Integration

### Load Historical Usage
```javascript
const context = await loadRunbookContext({
    org: orgAlias,
    operationType: 'report_type'
});

if (context.reportTypeUsage) {
    console.log('Most used report types:');
    context.reportTypeUsage.topTypes.forEach(t => {
        console.log(`  ${t.name}: ${t.count} reports`);
    });
}
```

### Apply Historical Patterns
```javascript
function selectReportTypeWithHistory(baseObject, context) {
    const usagePatterns = context.reportTypeUsage?.[baseObject] || {};

    // Score based on historical usage
    return availableReportTypes
        .map(rt => ({
            reportType: rt,
            score: 50 + (usagePatterns[rt.developerName]?.count || 0) * 2
        }))
        .sort((a, b) => b.score - a.score)[0];
}
```
