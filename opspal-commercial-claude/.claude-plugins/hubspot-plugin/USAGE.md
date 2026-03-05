# HubSpot Plugin - Usage Guide

**Version**: 3.0.0
**Last Updated**: 2025-11-24

## Quick Start

```bash
# Install
/plugin marketplace add RevPalSFDC/opspal-plugin-internal-marketplace
/plugin install hubspot-plugin@revpal-internal-plugins

# Verify
/agents | grep hubspot
```

## Core Agent Categories

| Category | Key Agents | Use When |
|----------|-----------|----------|
| **Orchestration** | `hubspot-workflow-orchestrator` | Complex multi-step operations |
| **Workflows** | `hubspot-workflow-builder`, `hubspot-workflow-analyst` | Workflow creation/analysis |
| **Contacts** | `hubspot-contact-manager`, `hubspot-contact-segmentation` | Contact operations |
| **Deals** | `hubspot-deal-pipeline-manager` | Pipeline management |
| **Marketing** | `hubspot-marketing-automation`, `hubspot-campaign-manager` | Marketing ops |
| **Analytics** | `hubspot-analytics-expert`, `hubspot-revenue-intelligence` | Reporting, insights |
| **Integrations** | `hubspot-integration-specialist`, `hubspot-stripe-sync` | External systems |
| **Governance** | `hubspot-property-governance`, `hubspot-data-quality` | Standards, cleanup |

## Common Workflows

### Create Workflow

```
User: "Create nurture workflow for trial users"

→ Routes to hubspot-workflow-builder
→ Creates:
   - Enrollment triggers
   - Email sequences
   - Branching logic
   - Goal completion
```

### Analyze Contacts

```
User: "Segment contacts by engagement score"

→ Routes to hubspot-contact-segmentation
→ Provides:
   - Engagement tiers
   - Active lists
   - Segment recommendations
```

### Manage Pipelines

```
User: "Set up sales pipeline with 6 stages"

→ Routes to hubspot-deal-pipeline-manager
→ Creates:
   - Pipeline structure
   - Stage definitions
   - Required properties
   - Automation triggers
```

### Marketing Campaign

```
User: "Create email campaign for product launch"

→ Routes to hubspot-campaign-manager
→ Configures:
   - Campaign structure
   - Email sequences
   - Landing pages
   - UTM tracking
```

### Integration Setup

```
User: "Set up Stripe sync for subscription data"

→ Routes to hubspot-stripe-sync
→ Configures:
   - Webhook endpoints
   - Property mappings
   - Sync rules
```

## Essential Commands

```bash
# Workflow Operations
/hubspot-workflow create "Workflow Name"
/hubspot-workflow analyze [workflow-id]
/hubspot-workflow optimize

# Contact Operations
/hubspot-contacts segment --criteria "engagement"
/hubspot-contacts cleanup --dry-run
/hubspot-contacts enrich

# Analytics
/hubspot-analytics report --type "funnel"
/hubspot-analytics dashboard --kpis "MQL,SQL,Revenue"

# Property Management
/hubspot-properties audit
/hubspot-properties cleanup --unused

# Integration
/hubspot-integrate stripe
/hubspot-integrate salesforce

# Quality
/reflect                    # Submit session reflection
```

## Plugin Features

### SEO Site Audit

**Comprehensive website analysis:**

```bash
# Full site audit
node .claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/seo/seo-site-auditor.js https://example.com

# Output includes:
# - Technical SEO issues
# - Content optimization
# - Page speed metrics
# - Mobile friendliness
```

### Geo Location Enhancement

**Contact/Company location enrichment:**

```bash
# Enrich contacts with geo data
node .claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/lib/geo-location-enricher.js --object contacts --batch 100
```

### Content Optimization

**AI-powered content analysis:**

```bash
# Analyze page content
node .claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/lib/seo-content-optimizer.js https://example.com/page
```

## Data Operations

### Property Best Practices

| Type | Naming | Example |
|------|--------|---------|
| Contact | snake_case | `lead_score_mql` |
| Company | snake_case | `annual_revenue_tier` |
| Deal | snake_case | `expected_close_date` |
| Custom | prefix + snake | `revpal_engagement_score` |

### API Rate Limits

- **Standard**: 100 requests/10 seconds
- **Burst**: 150 requests/10 seconds (temporary)
- **Daily**: 500,000 requests (Enterprise)

### Bulk Operations

```javascript
// Batch contacts (max 100 per request)
const contacts = await hubspot.crm.contacts.batchApi.create({
  inputs: contactsArray
});

// Async for large volumes
const job = await hubspot.crm.contacts.batchApi.archive({
  inputs: idsArray
});
```

## Integration Patterns

### Salesforce Sync

```
HubSpot Contact ↔ Salesforce Lead/Contact
HubSpot Company ↔ Salesforce Account
HubSpot Deal ↔ Salesforce Opportunity
```

**Sync Direction**: Configurable (HubSpot → SF, SF → HubSpot, Bidirectional)

### Stripe Integration

```
Stripe Customer → HubSpot Contact
Stripe Subscription → HubSpot Deal + Properties
Stripe Invoice → HubSpot Timeline Event
```

### Webhook Handling

```javascript
// Verify signature
const isValid = hubspot.webhooks.validateSignature(
  signature,
  body,
  clientSecret
);
```

## Troubleshooting

### Workflow Not Triggering

**Check**:
1. Enrollment triggers configured
2. Contact meets criteria
3. Workflow is active
4. Contact not already enrolled

### API Rate Limit

**Fix**: Implement exponential backoff:
```javascript
const delay = Math.pow(2, retryCount) * 1000;
await sleep(delay);
```

### Property Not Found

**Check**:
1. Property exists in HubSpot
2. Using correct internal name (not label)
3. Object type matches (contact vs company)

### Contact Not Syncing

**Check**:
1. Sync settings enabled
2. Required fields populated
3. No sync errors in HubSpot logs
4. Salesforce user has permissions

## Environment Variables

```bash
# Required
export HUBSPOT_PRIVATE_APP_TOKEN="pat-xxx"
export HUBSPOT_PORTAL_ID="12345678"

# Optional
export HUBSPOT_API_TIMEOUT=30000
export HUBSPOT_RATE_LIMIT=100
```

## Migration from Legacy Plugins

**hubspot-plugin v3.0.0** consolidates:
- hubspot-core-plugin
- hubspot-marketing-sales-plugin
- hubspot-analytics-governance-plugin
- hubspot-integrations-plugin

**No action needed** - all agents available in consolidated plugin.

---

**Full Documentation**: See CLAUDE.md for comprehensive feature documentation.
