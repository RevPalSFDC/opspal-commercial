# Smart List and Flow Limitations

## Overview

The Marketo REST API has significant limitations around Smart List and Flow configuration. Understanding these limitations is critical for designing effective automated campaign management.

## API Limitations Summary

| Component | Can Read? | Can Create/Modify? |
|-----------|-----------|-------------------|
| Campaign metadata (name, description) | ✅ Yes | ✅ Yes |
| Campaign folder/program | ✅ Yes | ❌ Create only |
| Smart List triggers | ✅ Yes (includeRules) | ❌ No |
| Smart List filters | ✅ Yes (includeRules) | ❌ No |
| Flow steps | ❌ No | ❌ No |
| Flow choices | ❌ No | ❌ No |
| Qualification rules | ✅ Yes (read only) | ❌ No |
| Communication limits | ✅ Yes (read only) | ❌ No |

## Smart List Limitations

### What You CAN Do

- ✅ Read trigger definitions (trigger type, constraints)
- ✅ Read filter definitions (filter type, conditions)
- ✅ Identify if campaign has "Campaign is Requested" trigger (`isRequestable`)
- ✅ Clone campaigns to copy Smart List configuration

### What You CANNOT Do

- ❌ Add triggers via API
- ❌ Remove triggers via API
- ❌ Modify trigger constraints
- ❌ Add filters via API
- ❌ Remove filters via API
- ❌ Modify filter conditions
- ❌ Change filter logic (AND/OR)

### Implications

1. **New campaigns are empty**: Creating via API produces a campaign with no triggers or filters
2. **Must use templates**: Clone from existing campaigns to get Smart List configuration
3. **Changes require UI**: Any Smart List modifications must be done in Marketo UI

## Flow Limitations

### What You CAN Do

- ✅ Clone campaigns to copy Flow configuration
- ✅ Override token values used in flow steps (via request/schedule)

### What You CANNOT Do

- ❌ Read flow steps via API
- ❌ Add flow steps via API
- ❌ Remove flow steps via API
- ❌ Modify flow step parameters
- ❌ Add choice steps via API
- ❌ Modify wait durations
- ❌ View flow logic structure

### Implications

1. **Cannot verify flow configuration** programmatically
2. **Cannot automate flow creation** - must pre-build templates
3. **flowId is opaque** - returned but not usable for queries

## Workarounds

### Strategy 1: Template-Based Cloning

**Recommended approach** for creating functional campaigns via API.

1. **Create Master Templates** in Marketo UI
   - Build complete campaigns with triggers and flows
   - Store in dedicated template folder
   - Use descriptive naming: `Template - Welcome Series`

2. **Clone via API** when needed
   ```javascript
   // Clone template to new program
   const campaign = await mcp__marketo__campaign_clone({
     campaignId: TEMPLATE_ID,
     name: "2026 Q1 Welcome Campaign",
     folder: { id: targetProgramId, type: "Program" }
   });
   ```

3. **Customize with Tokens** (see Strategy 2)

### Strategy 2: Token-Based Customization

Use My Tokens to make cloned campaigns configurable without modifying flows.

1. **Design Flow with Tokens**

   In Marketo UI, create flow steps that reference tokens:
   ```
   Send Email: {{my.EmailAssetId}}
   Wait: {{my.WaitDuration}} days
   Change Data Value: {{my.TargetField}} to {{my.NewValue}}
   ```

2. **Update Tokens via API**

   Use Program Tokens API to customize behavior:
   ```javascript
   // Update program tokens before activating campaign
   await updateProgramTokens(programId, {
     "my.EmailAssetId": "5678",
     "my.WaitDuration": "7",
     "my.TargetField": "Lead Status",
     "my.NewValue": "Engaged"
   });
   ```

3. **Override Tokens in Request/Schedule**

   Pass tokens when triggering campaign:
   ```javascript
   await mcp__marketo__campaign_request({
     campaignId: 2045,
     leads: [{ id: 12345 }],
     tokens: [
       { name: "{{my.CustomSubject}}", value: "Special offer just for you!" }
     ]
   });
   ```

### Strategy 3: Modular Campaign Design

Design multiple small campaigns that call each other.

1. **Create Atomic Campaigns**
   - Each campaign does one thing
   - Use "Request Campaign" flow steps to chain

2. **Example Structure**
   ```
   Main Campaign (Entry Point)
   ├── Smart List: Trigger condition
   └── Flow:
       ├── Request Campaign: Scoring Campaign
       ├── Request Campaign: Email Campaign
       └── Request Campaign: Notification Campaign

   Scoring Campaign (Requestable)
   ├── Smart List: Campaign is Requested
   └── Flow: Change Score +10

   Email Campaign (Requestable)
   ├── Smart List: Campaign is Requested
   └── Flow: Send Email {{my.EmailId}}
   ```

3. **Orchestrate via API**
   ```javascript
   // Trigger different campaigns based on logic
   if (shouldSendEmail) {
     await mcp__marketo__campaign_request({
       campaignId: EMAIL_CAMPAIGN_ID,
       leads: [{ id: leadId }]
     });
   }
   ```

### Strategy 4: External Orchestration

Use external logic for complex scenarios.

1. **Simple Flow in Marketo**
   - Campaigns only do basic actions
   - "Campaign is Requested" trigger only

2. **Complex Logic External**
   ```javascript
   // External system handles logic
   async function processLead(lead) {
     const score = await getLeadScore(lead.id);

     if (score > 100) {
       await mcp__marketo__campaign_request({
         campaignId: MQL_CAMPAIGN,
         leads: [{ id: lead.id }]
       });
     } else if (score > 50) {
       await mcp__marketo__campaign_request({
         campaignId: NURTURE_CAMPAIGN,
         leads: [{ id: lead.id }]
       });
     } else {
       await mcp__marketo__campaign_request({
         campaignId: COLD_LEAD_CAMPAIGN,
         leads: [{ id: lead.id }]
       });
     }
   }
   ```

## Qualification Rules Limitation

### Reading

Can read `qualificationRuleType` in campaign response:
- `"once"` - Lead can run through once
- `"every time"` - Unlimited runs
- Custom text for specific limits

### Modifying

**Cannot change via API**. Must configure in Marketo UI:
1. Open campaign > Schedule tab
2. Edit "Qualification Rules"
3. Select desired option

### Workaround

Clone from a template that already has the desired qualification rule set.

## Communication Limits Limitation

### Reading

Can read `isCommunicationLimitEnabled`:
- `true` - Campaign honors workspace communication limits
- `false` - Campaign ignores limits (trigger default)

### Modifying

**Cannot change via API**. Must configure in Marketo UI:
1. Open campaign > Schedule tab
2. Check/uncheck "Block non-operational emails"

### Workaround

Clone from a template with desired communication limit setting.

## Practical Workflow

### Creating a Functional Campaign via API

1. **Pre-work (One-time, in UI)**
   - Create template campaigns with all possible configurations
   - Design flows to use tokens for dynamic values
   - Set qualification rules and communication limits as needed

2. **API Workflow**
   ```javascript
   // 1. Clone from template
   const campaign = await mcp__marketo__campaign_clone({
     campaignId: WELCOME_TEMPLATE,
     name: "2026 Q1 Welcome",
     folder: { id: programId, type: "Program" }
   });

   // 2. Update program tokens for customization
   await updateProgramTokens(programId, {
     "my.WelcomeEmail": emailId,
     "my.ThankYouPage": landingPageUrl
   });

   // 3. Activate when ready
   await mcp__marketo__campaign_activate({
     campaignId: campaign.id
   });
   ```

## Template Library Recommendations

### Essential Templates

| Template | Triggers | Key Tokens |
|----------|----------|------------|
| Form Fill Response | Fills Out Form | `my.FormId`, `my.ResponseEmail` |
| Email Click Follow-up | Clicks Link in Email | `my.SourceEmail`, `my.FollowupEmail` |
| API Triggered - Email | Campaign is Requested | `my.EmailId`, `my.Subject` |
| API Triggered - Score | Campaign is Requested | `my.ScoreChange`, `my.Reason` |
| API Triggered - Status | Campaign is Requested | `my.NewStatus`, `my.NotifyCampaign` |
| Scheduled Batch | None (filters only) | `my.ListId`, `my.EmailId` |

### Template Management

```javascript
const TEMPLATE_REGISTRY = {
  formResponse: { id: 1001, tokens: ['my.FormId', 'my.ResponseEmail'] },
  emailClickFollowup: { id: 1002, tokens: ['my.SourceEmail', 'my.FollowupEmail'] },
  apiEmail: { id: 1003, tokens: ['my.EmailId', 'my.Subject'] },
  apiScore: { id: 1004, tokens: ['my.ScoreChange', 'my.Reason'] },
  apiStatus: { id: 1005, tokens: ['my.NewStatus', 'my.NotifyCampaign'] },
  scheduledBatch: { id: 1006, tokens: ['my.ListId', 'my.EmailId'] }
};

function getTemplate(type) {
  return TEMPLATE_REGISTRY[type];
}
```

## Summary

| Need | Solution |
|------|----------|
| Create campaign with triggers | Clone from template |
| Create campaign with flow | Clone from template |
| Modify trigger constraints | UI only |
| Modify flow steps | UI only |
| Customize campaign behavior | Use tokens |
| Complex conditional logic | External orchestration |
| Change qualification rules | Clone template with desired rules |

## Related Operations

- [04-create-operations](./04-create-operations.md) - Creates empty campaigns
- [07-clone-operations](./07-clone-operations.md) - Clone with logic
- [09-activation-execution](./09-activation-execution.md) - Token overrides in requests
