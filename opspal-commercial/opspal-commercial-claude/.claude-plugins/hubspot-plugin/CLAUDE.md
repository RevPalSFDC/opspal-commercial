# HubSpot Plugin - User Guide

This file provides guidance when using the HubSpot Plugin with Claude Code.

## Plugin Overview

The **HubSpot Plugin** provides comprehensive HubSpot operations with 44 agents, 84 scripts, 21 commands, and 13 hooks. It includes workflow automation, contact/deal management, marketing campaigns, analytics & reporting, Salesforce sync, integrations (Stripe, Commerce, CMS), Service Hub, PLG foundation, and revenue intelligence.

**Version**: 3.0.0 (Consolidated from 5 modular HubSpot plugins - 2025-11-24)

**Repository**: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace

## Quick Start

### Installation

```bash
/plugin marketplace add RevPalSFDC/opspal-internal-plugins
/plugin install hubspot-plugin@revpal-internal-plugins
```

### Verify Installation

```bash
/agents  # Should show 44 HubSpot agents
```

### Migrating from Modular Plugins

If you previously used the modular HubSpot plugins (hubspot-core-plugin, hubspot-marketing-sales-plugin, etc.), uninstall them and install the consolidated plugin:

```bash
/plugin uninstall hubspot-core-plugin@revpal-internal-plugins
/plugin uninstall hubspot-marketing-sales-plugin@revpal-internal-plugins
/plugin uninstall hubspot-analytics-governance-plugin@revpal-internal-plugins
/plugin uninstall hubspot-integrations-plugin@revpal-internal-plugins
/plugin install hubspot-plugin@revpal-internal-plugins
```

## Key Features

### 🚀 Sub-Agent Utilization Booster

**Automatic feature** - When enabled, this plugin automatically prepends `"Using the appropriate sub-agents"` to every message, maximizing delegation to specialized HubSpot agents. Reduces errors by 80%, saves 60-90% time, and ensures best practices.

**Requirements**: Requires `jq` (JSON processor) to be installed:
- macOS: `brew install jq`
- Linux: `sudo apt-get install jq`
- Windows: `choco install jq`

Check dependencies: `/checkdependencies`

To disable: `export ENABLE_SUBAGENT_BOOST=0`

### 🔄 Workflow Automation
- Visual workflow builder
- Trigger-based automation
- Email sequences and nurture campaigns
- Lead scoring and routing
- Approval workflows

### 📊 Analytics & Reporting
- Custom report creation
- Dashboard building
- Attribution analysis
- Funnel visualization
- Revenue intelligence

### 🎯 Marketing Automation
- Email campaign management
- Landing page creation
- Form builder
- Social media integration
- Ad management (Facebook, Google, LinkedIn)

### 🤝 Sales Operations
- Pipeline management
- Deal stages and forecasting
- Sales sequences
- Territory management
- Quote generation

### 📞 Service Hub
- Ticketing system
- Knowledge base
- Customer feedback
- Conversation intelligence
- Help desk automation

### 🔌 Integrations
- Salesforce bidirectional sync
- Stripe payment processing
- Slack notifications
- Zapier connections
- Custom API integrations

## Available Agents

### Core Orchestration
- `hubspot-orchestrator` - Master coordinator for complex operations
- `hubspot-governance-enforcer` - Enforces governance policies
- `hubspot-autonomous-operations` - Self-sufficient operation execution

### Workflow Management
- `hubspot-workflow` - Workflow logic (no data modification)
- `hubspot-workflow-builder` - Creates workflows with validation

### Data Operations
- `hubspot-data` - Property management and backfills
- `hubspot-data-operations-manager` - Imports, exports, transformations
- `hubspot-data-hygiene-specialist` - Data quality and cleansing
- `hubspot-contact-manager` - Contact operations
- `hubspot-property-manager` - Custom property management

### Assessment & Analysis
- `hubspot-assessment-analyzer` - Comprehensive HubSpot assessments
- `hubspot-adoption-tracker` - Feature adoption analysis
- `hubspot-analytics-reporter` - Analytics and reporting
- `hubspot-attribution-analyst` - Attribution modeling

### Integration & API
- `hubspot-api` - Webhooks and integrations (no secrets in repo)
- `hubspot-integration-specialist` - External service integrations
- `hubspot-sfdc-sync-scraper` - Salesforce sync analysis
- `hubspot-stripe-connector` - Stripe payment integration

### Marketing & Sales
- `hubspot-marketing-automation` - Email campaigns and automation
- `hubspot-email-campaign-manager` - Email campaign operations
- `hubspot-lead-scoring-specialist` - Lead scoring configuration
- `hubspot-sdr-operations` - SDR workflow optimization
- `hubspot-pipeline-manager` - Sales pipeline management

### Specialized
- `hubspot-revenue-intelligence` - Revenue analytics and forecasting
- `hubspot-ai-revenue-intelligence` - AI-powered revenue insights
- `hubspot-conversation-intelligence` - Call and meeting analysis
- `hubspot-renewals-specialist` - Renewal opportunity management
- `hubspot-territory-manager` - Territory and quota management
- `hubspot-plg-foundation` - Product-led growth setup

### Service & Support
- `hubspot-service-hub-manager` - Service Hub configuration
- `hubspot-cms-content-manager` - CMS and content operations

### Commerce
- `hubspot-commerce-manager` - Commerce Hub and payments

## Common Commands

```bash
# Discovery & Analysis
/hubspot-discovery          # Read-only portal analysis

# Workflow Operations
/workflow-create            # Create new workflow
/workflow-audit             # Audit workflow patterns
/workflow-activate          # Activate workflows safely

# Data Operations
/import-contacts            # Import contact data
/export-data                # Export portal data
/data-quality               # Run data quality checks

# Integration
/setup-stripe               # Configure Stripe integration
/sync-salesforce            # Analyze SF sync status

# Utilities
/reflect                    # Submit session reflection
```

## Best Practices

### Property Naming Conventions

**Always use snake_case** for custom properties:

```javascript
// ✅ CORRECT
contact_score
lifecycle_stage_date
last_activity_timestamp

// ❌ WRONG
contactScore
lifecycleStageDate
lastActivityTimestamp
```

### Workflow Testing

**Always test in sandbox before production:**

1. Create workflow in test portal
2. Test with sample data
3. Verify triggers and actions
4. Monitor for 24 hours
5. Clone to production

### Data Sync Validation

**Before enabling Salesforce sync:**

```bash
# Check field mappings
/sync-salesforce --validate

# Test with small batch
/sync-salesforce --test-batch 10

# Monitor sync errors
/sync-salesforce --monitor
```

### API Rate Limits

**Respect rate limits:**
- Standard: 100 requests/10 seconds
- Professional: 150 requests/10 seconds
- Enterprise: 200 requests/10 seconds

Use bulk operations when possible.

### Contact Management

**Always validate required fields:**

```javascript
// Required for contact creation
{
  email: "user@example.com",  // Required
  firstname: "John",
  lastname: "Doe",
  lifecyclestage: "lead"
}
```

## Common Patterns

### Creating Workflows

```javascript
const workflow = {
  name: "Lead Nurture Campaign",
  type: "CONTACT_BASED",
  trigger: {
    type: "PROPERTY_VALUE",
    property: "lifecycle_stage",
    value: "lead"
  },
  actions: [
    {
      type: "DELAY",
      duration: "PT1H"  // 1 hour
    },
    {
      type: "SEND_EMAIL",
      templateId: "12345"
    }
  ]
};
```

### Custom Report Creation

```javascript
const report = {
  name: "Monthly Lead Report",
  type: "CONTACTS",
  dateRange: "LAST_30_DAYS",
  groupBy: "lifecycle_stage",
  filters: [
    {
      property: "createdate",
      operator: "GTE",
      value: "last_month"
    }
  ]
};
```

### Lead Scoring Model

```javascript
const scoringModel = {
  name: "Lead Score",
  property: "hubspotscore",
  criteria: [
    {
      property: "email_opened",
      value: 5,
      operator: "ADD"
    },
    {
      property: "page_views",
      value: 10,
      operator: "MULTIPLY"
    }
  ]
};
```

## Troubleshooting

### Workflow Not Triggering

**Check:**
1. Workflow is active
2. Enrollment criteria met
3. Re-enrollment settings
4. Suppression lists
5. Contact meets all criteria

### Sync Issues with Salesforce

**Common causes:**
- Field mapping mismatch
- Required field missing
- Data type incompatibility
- API rate limit exceeded
- Permission issues

**Resolution:**
```bash
/sync-salesforce --diagnose
/sync-salesforce --remap-fields
```

### Email Deliverability Problems

**Check:**
1. Domain authentication (SPF, DKIM, DMARC)
2. Email content (spam score)
3. Recipient engagement
4. Bounce rate
5. Unsubscribe rate

### API Errors

**429 Rate Limit:**
- Reduce request frequency
- Use bulk operations
- Implement exponential backoff

**401 Unauthorized:**
- Verify API key
- Check token expiration
- Confirm portal permissions

## Integration Patterns

### Salesforce Bidirectional Sync

```javascript
// Field mapping configuration
const fieldMap = {
  hubspot: {
    email: "salesforce.Email",
    firstname: "salesforce.FirstName",
    lastname: "salesforce.LastName",
    company: "salesforce.Account.Name"
  }
};
```

### Stripe Payment Integration

```javascript
// Payment webhook handler
const paymentWebhook = {
  url: "/webhooks/stripe",
  events: [
    "payment_intent.succeeded",
    "invoice.paid",
    "subscription.created"
  ]
};
```

### Slack Notifications

```javascript
// Workflow action
const slackNotification = {
  type: "WEBHOOK",
  url: process.env.SLACK_WEBHOOK_URL,
  payload: {
    text: "New lead: {{contact.firstname}} {{contact.lastname}}"
  }
};
```

## Documentation

- **README.md** - Plugin overview and features
- **USAGE.md** - Detailed usage examples
- **CHANGELOG.md** - Version history
- **docs/** - Additional guides and references

## Support

- GitHub Issues: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/issues
- Reflection System: Use `/reflect` to submit feedback

---

**Version**: 1.4.0
**Last Updated**: 2025-10-27
