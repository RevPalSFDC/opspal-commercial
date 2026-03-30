# HubSpot Plugin - User Guide

This file provides guidance when using the HubSpot Plugin with Claude Code.

## Plugin Overview

The **HubSpot Plugin** provides comprehensive HubSpot operations with 51 agents, 88 scripts, 27 commands, and 13 hooks. It includes workflow automation, contact/deal management, marketing campaigns, CMS blog management, HubDB tables, serverless functions, **Developer Platform apps (app cards, settings components, marketplace submission)**, **Imports V3 API (multi-file imports, associations, marketing flags)**, analytics & reporting, Salesforce sync, integrations (Stripe, Commerce, CMS), Service Hub, PLG foundation, and revenue intelligence.

**Version**: 3.6.0 (Added centralized rate limit handling with adaptive throttling, circuit breaker - 2026-01-19)

**Repository**: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace

## Quick Start

### Installation

```bash
/plugin marketplace add RevPalSFDC/opspal-internal-plugins
/plugin install opspal-hubspot@revpal-internal-plugins
```

### Verify Installation

```bash
/agents  # Should show 48 HubSpot agents
```

### Migrating from Modular Plugins

If you previously used the modular HubSpot plugins (hubspot-core-plugin, hubspot-marketing-sales-plugin, etc.), uninstall them and install the consolidated plugin:

```bash
/plugin uninstall hubspot-core-plugin@revpal-internal-plugins
/plugin uninstall hubspot-marketing-sales-plugin@revpal-internal-plugins
/plugin uninstall hubspot-analytics-governance-plugin@revpal-internal-plugins
/plugin uninstall hubspot-integrations-plugin@revpal-internal-plugins
/plugin install opspal-hubspot@revpal-internal-plugins
```

## Key Features

### 🔐 Validation Framework (NEW)

**Comprehensive validation system preventing errors before HubSpot operations**

The Validation Framework provides automatic error prevention through 5 validation stages:

1. **Schema Validation** - Validates data structure against JSON schemas
2. **Parse Error Handling** - Auto-fixes JSON/XML/CSV parsing issues
3. **Data Quality** - Detects synthetic data and quality issues (4-layer scoring)
4. **Tool Contract** - Validates HubSpot API calls before execution
5. **Permission Validation** - Checks bulk operations and property access

**Automatic Hooks** (already enabled):
- `pre-reflection-submit.sh` - Validates reflections before submission
- `pre-tool-execution.sh` - Validates HubSpot MCP tool calls

**Quick Commands**:
```bash
# Generate validation dashboard
node ../opspal-core/scripts/lib/validation-dashboard-generator.js generate --days 30

# Test data quality validation
node ../salesforce-plugin/scripts/lib/enhanced-data-quality-framework.js validate \
  --query-result ./contacts.json

# Temporarily disable validation
export SKIP_VALIDATION=1              # All validation
export SKIP_TOOL_VALIDATION=1         # Tool validation only
```

**Documentation**: See `../../docs/VALIDATION_FRAMEWORK_GUIDE.md` for complete guide

**Performance**:
- <500ms total validation time
- <100ms data quality check
- 95%+ pass rate for legitimate operations

**Common Validations**:
- ✅ Property naming (enforces snake_case)
- ✅ Required fields for contact creation
- ✅ API rate limit checking (100/190/190/110 requests per 10s by tier)
- ✅ Workflow trigger validation
- ✅ Email template validation
- ✅ Synthetic data detection
- ✅ Bulk operation permission checks

### 🔧 MCP Server Version Guide

This plugin uses **two MCP servers** with different capabilities:

| Server | Use For |
|--------|---------|
| `hubspot-v4` | Workflows, sequences, webhooks, advanced search with counts |
| `hubspot-enhanced-v3` | CRUD operations, batch upsert, associations, governance |

**Quick Reference:**
- **Workflow/Automation** → `mcp__hubspot-v4__workflow_*`, `mcp__hubspot-v4__sequence_*`
- **Data/Records** → `mcp__hubspot-enhanced-v3__hubspot_search/create/update/delete`
- **Counts/Totals** → `mcp__hubspot-v4__search_with_total`, `mcp__hubspot-v4__get_total_count`
- **Governance** → `mcp__hubspot-enhanced-v3__hubspot_health_check`, `mcp__hubspot-enhanced-v3__hubspot_check_policy`

**Mixing versions is valid** when agents need both workflow and data capabilities.

**Full Documentation**: See `docs/MCP_VERSION_GUIDE.md` for complete decision matrix.

### ⚡ Rate Limit Handling (NEW - v3.5.0)

**Intelligent, coordinated rate limit management for HubSpot API operations**

The plugin now includes a centralized rate limit system that coordinates all API requests to prevent 429 errors and ensure reliable bulk operations.

#### HubSpot Rate Limits by Tier

| Tier | Per 10 Seconds | Per Day |
|------|----------------|---------|
| Free/Starter | 100/app | 250,000 |
| Professional | 190/app | 625,000 |
| Enterprise | 190/app | 1,000,000 |
| Public OAuth | 110/app (fixed) | N/A |

#### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `HubSpotRequestThrottle` | `scripts/lib/hubspot-request-throttle.js` | Centralized request coordination (singleton) |
| `hubspot-rate-limit-parser.js` | `scripts/lib/` | Parses X-HubSpot-RateLimit-* response headers |
| `HubSpotAPISafeguard` | `scripts/lib/hubspot-api-safeguard.js` | Tier-aware limits, exponential backoff |

#### Features

- **Global Request Coordination**: All batch wrappers share a singleton throttle
- **Adaptive Throttling**: Parses response headers to dynamically adjust delays
- **Circuit Breaker**: Opens after 3 consecutive 429 errors, auto-recovers after 60s
- **Tier Detection**: Auto-detects tier from response headers
- **Priority Queue**: High-priority requests can skip the queue

#### Usage

```javascript
// Automatic (batch wrappers use throttle by default)
const updater = new BatchUpdateWrapper(accessToken);
await updater.batchUpdate('contacts', records);

// Manual throttle control
const { getThrottle, throttledFetch } = require('./hubspot-request-throttle');
const throttle = getThrottle({ tier: 'starter', verbose: true });
const response = await throttle.enqueue(() => fetch(url, options));

// Check throttle status
console.log(throttle.getStatus());
```

#### Configuration

```bash
# Set tier (default: starter)
export HUBSPOT_TIER=professional

# Disable throttle for a wrapper (not recommended)
const updater = new BatchUpdateWrapper(accessToken, { useThrottle: false });
```

#### Response Headers Parsed

- `X-HubSpot-RateLimit-Max`: Requests allowed in window
- `X-HubSpot-RateLimit-Remaining`: Calls still available
- `X-HubSpot-RateLimit-Daily`: Total daily allowance
- `X-HubSpot-RateLimit-Daily-Remaining`: Daily calls left
- `Retry-After`: Seconds to wait (on 429)

#### Troubleshooting

**Still getting 429 errors?**
1. Check if multiple processes are running simultaneously
2. Verify tier is set correctly: `export HUBSPOT_TIER=professional`
3. Check throttle status: `node scripts/lib/hubspot-request-throttle.js --status`
4. Run tests: `node scripts/lib/hubspot-request-throttle.js --test`

**Circuit breaker stuck open?**
```javascript
const { getThrottle } = require('./hubspot-request-throttle');
getThrottle().resetCircuitBreaker();
```

### 🔄 Live-First Caching System (v3.7.0+)

**Comprehensive live-first caching** across all HubSpot cache systems. By default, all cache systems now query live HubSpot portals first, using cached data only as fallback on API failures. This prevents stale property definitions, missed new properties, and outdated SEO data.

**Architecture:**
- Query live API first (default behavior)
- Cache results for fallback use
- Use cached data only when API fails (with warning)
- Per-component environment variable control

**Global Control:**
```bash
# Disable live-first for all components (not recommended)
export GLOBAL_LIVE_FIRST=false
```

**Per-Component Environment Variables:**

| Variable | Default | Component | Risk if Disabled |
|----------|---------|-----------|------------------|
| `GLOBAL_LIVE_FIRST` | `true` | All caches | Stale data across all systems |
| `HS_PROPERTY_LIVE_FIRST` | `true` | Property Metadata | New properties not discovered |
| `HS_SEO_LIVE_FIRST` | `true` | All SEO caches | Broken links missed, rank changes missed |
| `CONTEXT_LIVE_FIRST` | `true` | Pre-task hooks | Portal context stale |
| `HS_WORKFLOW_LIVE_FIRST` | `true` | Workflow List Validation | List-workflow pairings not validated |

**SEO Cache Components:**

| Cache | TTL (Default) | Live-First Benefit |
|-------|---------------|-------------------|
| Sitemap Crawler | 7 days | Site changes detected immediately |
| Batch Analyzer | 7 days | Broken links caught in real-time |
| SERP Analyzer | 24 hours | Rank changes tracked accurately |
| Keyword Researcher | 7 days | Trends detected faster |
| Content Gap Analyzer | 7 days | Competitor changes caught |

**Fallback Behavior:**
When API calls fail in live-first mode:
1. Cache is used as fallback (if available)
2. Warning is logged with timestamp
3. Cache staleness is tracked

**Verification:**
```bash
# Check if live-first is active
echo $GLOBAL_LIVE_FIRST  # should be empty or "true"

# Force cache-first for testing (single run)
GLOBAL_LIVE_FIRST=false node scripts/lib/batch-property-metadata.js

# Check cache age for workflow lists
stat -c %Y .cache/lists.json  # Unix timestamp
```

### 🚀 Sub-Agent Utilization Booster

**Automatic feature** - When enabled, this plugin automatically prepends `"Using the appropriate sub-agents"` to every message, maximizing delegation to specialized HubSpot agents. Reduces errors by 80%, saves 60-90% time, and ensures best practices.

**Requirements**: Requires `jq` (JSON processor) to be installed:
- macOS: `brew install jq`
- Linux: `sudo apt-get install jq`
- Windows: `choco install jq`

Check dependencies: `/checkdependencies`

To disable: `export ENABLE_SUBAGENT_BOOST=0`

### 📚 Data Quality Runbook Series (NEW)

**Production-ready operational runbooks for HubSpot data quality management**

The **HubSpot Data Quality Runbook Series** provides comprehensive operational guidance for all data quality operations. All 5 runbooks are production-ready and integrated with RevPal agents.

**Runbooks Available**:
1. **Property Validation Fundamentals** - Field-level validation, conditional required fields, cross-platform validation
2. **Property Population Monitoring** - Completeness scoring, fill rate monitoring, remediation workflows
3. **Integration Health Checks** - Salesforce/Stripe/native integration monitoring, SLO model, circuit breakers
4. **Data Enrichment Strategies** - Multi-source enrichment, mastering policy, credits governance, GDPR gating
5. **Duplicate Detection & Deduplication** - Canonical selection, merge operations, Salesforce constraints

**Quick Access**:
```bash
# View runbook series
ls docs/runbooks/data-quality/

# Read specific runbook
cat docs/runbooks/data-quality/01-property-validation-fundamentals.md
```

**Agent Integration**:
All runbooks are automatically referenced by relevant agents:
- `hubspot-data-hygiene-specialist` - References all 5 runbooks
- `hubspot-property-manager` - References runbooks 01, 02, 04
- `hubspot-workflow-builder` - References runbooks 01, 02, 03, 04, 05
- `hubspot-integration-specialist` - References runbooks 03, 04, 05
- `hubspot-analytics-reporter` - References runbooks 02, 03, 04

**Series Statistics**:
- **~50,000 words** of implementation guidance
- **50 implementation patterns** with prerequisites, steps, validation
- **30+ code examples** with error handling
- **21 operational workflows** with checklists and rollback procedures
- **25 Mermaid diagrams** for visual reference
- **60+ best practices** for enterprise-grade operations

**Documentation**: See `docs/runbooks/data-quality/README.md` for complete series overview

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

### 🎯 Goals & Quotas (NEW)
- Sales goal targets retrieval via V3 API
- Quota attainment tracking and reporting
- Goal progress monitoring with status assessment
- User-specific and period-based goal queries
- Integration with revenue intelligence

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

## Agent Routing by Task Type

Use specialist agents for these patterns:

| Task Pattern | Agent |
|-------------|-------|
| Complex / multi-step / coordinate | `hubspot-orchestrator` |
| Workflow / automation / trigger | `hubspot-workflow-builder` |
| Contact / list / segment | `hubspot-contact-manager` |
| Pipeline / deal / forecast | `hubspot-pipeline-manager` |
| Property / field / custom field | `hubspot-property-manager` |
| Email / campaign / nurture | `hubspot-marketing-automation` |
| Report / dashboard / analytics | `hubspot-reporting-builder` |
| Clean / dedupe / quality | `hubspot-data-hygiene-specialist` |
| CMS / content / blog | `hubspot-cms-content-manager` |
| HubDB / dynamic content | `hubspot-cms-hubdb-manager` |

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
- `hubspot-goals-manager` - Sales goals and quota tracking (NEW)
- `hubspot-conversation-intelligence` - Call and meeting analysis
- `hubspot-renewals-specialist` - Renewal opportunity management
- `hubspot-territory-manager` - Territory and quota management
- `hubspot-plg-foundation` - Product-led growth setup

### Service & Support
- `hubspot-service-hub-manager` - Service Hub configuration
- `hubspot-cms-content-manager` - CMS and content operations

### CMS Website Build & Management (NEW)
- `hubspot-cms-theme-manager` - Theme selection, customization, CLI operations, serverless functions
- `hubspot-cms-form-manager` - Form CRUD, embedding, validation, GDPR consent
- `hubspot-cms-cta-manager` - CTA creation/styling via Playwright automation
- `hubspot-cms-redirect-manager` - URL redirects, 301s, site migrations
- `hubspot-cms-files-manager` - File uploads, CDN, image optimization

### Blog Management (NEW - 2026-01-18)
- `hubspot-cms-blog-post-manager` - Blog post CRUD, draft management, publishing, scheduling, revisions
- `hubspot-cms-blog-author-manager` - Author profiles, bio, avatar, social links, multi-language variants
- `hubspot-cms-domain-monitor` - Domain listing, health checks, HTTPS status, primary domain tracking

### HubDB & Dynamic Content (NEW - 2026-01-18)
- `hubspot-cms-hubdb-manager` - HubDB table/row CRUD, schema management, dynamic page generation, batch operations

### Commerce
- `hubspot-commerce-manager` - Commerce Hub and payments

### Developer Platform (NEW)
- `hubspot-app-developer` - Master orchestrator for HubSpot app development lifecycle
- `hubspot-app-card-builder` - Creates React-based app cards with UI SDK
- `hubspot-settings-builder` - Builds settings configuration pages

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
/hs-import-advanced         # Advanced V3 import with associations (NEW)

# CMS Website Operations
/cms-build-site             # Guided website build wizard
/cms-launch-site            # Pre-launch checklist and go-live

# Developer Platform (NEW)
/hs-app-create              # Initialize new HubSpot app
/hs-app-card-add            # Add app card to project
/hs-settings-add            # Add settings component
/hs-app-deploy              # Deploy app to portal
/hs-app-validate            # Validate for marketplace

# Goals & Quotas (NEW)
/hs-goals                   # List sales goals and quota status
/hs-goals --user <id>       # Goals for specific user
/hs-goals --period Q1       # Goals for specific quarter

# Integration
/setup-stripe               # Configure Stripe integration
/sync-salesforce            # Analyze SF sync status

# Utilities
/reflect                    # Submit session reflection
```

## CMS Website Build & Management (NEW)

### Overview

Complete HubSpot CMS website build, launch, and management capabilities including:
- Theme management via HubSpot CLI
- Serverless functions (Enterprise feature)
- HubDB tables for dynamic content
- Form creation and management
- CTA management (Playwright automation)
- URL redirect management
- File/media management
- Module templates (hero, team, pricing)

### Prerequisites

**HubSpot CLI** (required for theme operations):
```bash
npm install -g @hubspot/cli
hs auth  # Authenticate with your portal
```

### Quick Start

**Build a new website:**
```bash
/cms-build-site --type new --template corporate
```

**Launch existing site:**
```bash
/cms-launch-site --domain example.com
```

### CMS Runbooks

Comprehensive operational runbooks available:

| Runbook | Location | Use When |
|---------|----------|----------|
| Website Build | `docs/runbooks/cms/01-website-build.md` | Building new site or redesign |
| Site Launch | `docs/runbooks/cms/02-site-launch.md` | Pre-launch checklist and go-live |
| Post-Launch | `docs/runbooks/cms/03-post-launch.md` | Ongoing monitoring and maintenance |

### CMS Skills

CLI patterns and best practices:

| Skill | Location | Content |
|-------|----------|---------|
| CLI Overview | `skills/hubspot-cli-patterns/SKILL.md` | CLI vs API decision matrix |
| Theme Operations | `skills/hubspot-cli-patterns/theme-operations.md` | Theme CLI commands |
| File Operations | `skills/hubspot-cli-patterns/file-operations.md` | File management CLI |
| Auth Patterns | `skills/hubspot-cli-patterns/auth-patterns.md` | CI/CD authentication |
| Dev Workflow | `skills/hubspot-cli-patterns/dev-workflow.md` | Local development |

### CMS Agent Routing

| Task | Route To |
|------|----------|
| Theme/design/colors/fonts | `hubspot-cms-theme-manager` |
| **Serverless functions** | **`hubspot-cms-theme-manager`** |
| Form creation/embed | `hubspot-cms-form-manager` |
| CTA creation/styling | `hubspot-cms-cta-manager` |
| URL redirects/301s | `hubspot-cms-redirect-manager` |
| File uploads/CDN | `hubspot-cms-files-manager` |
| Page CRUD/publish | `hubspot-cms-page-publisher` |
| Content orchestration | `hubspot-cms-content-manager` |
| SEO validation | `hubspot-seo-optimizer` |
| **Blog post CRUD/publish/schedule** | **`hubspot-cms-blog-post-manager`** |
| **Blog author profiles** | **`hubspot-cms-blog-author-manager`** |
| **Domain health/status** | **`hubspot-cms-domain-monitor`** |
| **HubDB tables/rows/dynamic pages** | **`hubspot-cms-hubdb-manager`** |

## Developer Platform Apps (NEW - 2026-01-19)

### Overview

Complete HubSpot Developer Platform support for building custom apps including:
- **App Cards** - React-based UI components for CRM records, preview panels, help desk, sales workspace
- **Settings Components** - Configuration pages for app settings with Panel/Tabs/Accordion/Modal layouts
- **`hs project` Workflow** - Full CLI integration for create, dev, upload, deploy
- **Marketplace Submission** - Validation and submission guidance for HubSpot marketplace

### Prerequisites

**HubSpot CLI** (required for app development):
```bash
npm install -g @hubspot/cli
hs auth  # Authenticate with your portal
```

### Quick Start

**Create a new HubSpot app:**
```bash
/hs-app-create                         # Interactive wizard
/hs-app-create --template crm-card     # Start with CRM card template
```

**Add components to existing app:**
```bash
/hs-app-card-add                       # Add app card
/hs-settings-add                       # Add settings page
```

**Deploy and validate:**
```bash
/hs-app-validate                       # Run validation checks
/hs-app-validate --marketplace         # Full marketplace validation
/hs-app-deploy                         # Deploy to HubSpot
```

### Developer Platform Commands

| Command | Description |
|---------|-------------|
| `/hs-app-create` | Initialize new HubSpot app project |
| `/hs-app-card-add` | Add app card to existing project |
| `/hs-settings-add` | Add settings component |
| `/hs-app-deploy` | Deploy app to HubSpot portal |
| `/hs-app-validate` | Validate app for marketplace |

### Developer Platform Agents

| Agent | Use For |
|-------|---------|
| `hubspot-app-developer` | Master orchestrator for app development lifecycle |
| `hubspot-app-card-builder` | Creating React-based app cards with UI SDK |
| `hubspot-settings-builder` | Building settings configuration pages |

### App Card Types

| Type | Location | Use Case |
|------|----------|----------|
| `crm-record` | CRM record middle column | Display data, actions on records |
| `crm-sidebar` | CRM record right sidebar | Quick actions, related info |
| `preview-panel` | CRM preview panel | Record previews in lists |
| `help-desk` | Service Hub help desk | Ticket context, customer info |
| `sales-workspace` | Sales workspace | Deal intelligence, next actions |

### Developer Platform Skills

| Skill | Location | Content |
|-------|----------|---------|
| Overview | `skills/hubspot-developer-platform/SKILL.md` | Decision matrix, agent routing |
| App Cards | `skills/hubspot-developer-platform/app-cards.md` | UI components, serverless functions |
| Settings | `skills/hubspot-developer-platform/settings-components.md` | Form patterns, validation |
| CLI Reference | `skills/hubspot-developer-platform/project-commands.md` | Full `hs` command reference |
| Marketplace | `skills/hubspot-developer-platform/marketplace-submission.md` | Requirements, submission process |

### Templates Available

| Template | Location | Description |
|----------|----------|-------------|
| App Manifest | `templates/developer-platform/app-manifest.json` | Base app configuration |
| Package.json | `templates/developer-platform/package.json.template` | Dependencies and scripts |
| TypeScript | `templates/developer-platform/tsconfig.json.template` | TS configuration |

## Advanced Data Import (NEW - 2026-01-19)

### Overview

Enhanced CRM Imports V3 API support with advanced features:
- **Multi-file imports** - Import contacts and companies with automatic associations
- **Marketing flags** - Mark contacts as marketing-eligible during import
- **Auto-create lists** - Create static lists from imported contacts
- **Column mapping** - Full control over column-to-property mapping
- **Error retrieval** - Fetch detailed error information for failed rows

### Quick Start

```bash
/hs-import-advanced                          # Interactive wizard
/hs-import-advanced --file=contacts.csv      # Import from file
/hs-import-advanced --type=multi-file        # Multi-file import
```

### Import Types

| Type | Description |
|------|-------------|
| Simple | Basic single-object import (backward compatible) |
| Advanced | Full V3 features for single object (marketing flags, lists) |
| Multi-File | Multiple objects with cross-object associations |

### V3 API Features

| Feature | Description |
|---------|-------------|
| `marketableContactImport` | Mark imported contacts as marketing contacts |
| `createContactListFromImport` | Automatically create static list from imports |
| `dateFormat` | Support for MONTH_DAY_YEAR, DAY_MONTH_YEAR, YEAR_MONTH_DAY |
| `timeZone` | Specify timezone for timestamp fields |
| `columnMappings` | Full control over column-to-property mapping |

### Code Examples

**Advanced Import with Marketing Flags:**
```javascript
const { HubSpotImporter } = require('./scripts/lib/imports-api-wrapper');
const importer = new HubSpotImporter(apiKey);

await importer.importRecordsAdvanced({
  objectType: 'contacts',
  records: data,
  mode: 'UPSERT',
  marketableContactImport: true,
  createContactListFromImport: true,
  dateFormat: 'MONTH_DAY_YEAR',
  timeZone: 'America/New_York'
});
```

**Multi-File Import with Associations:**
```javascript
await importer.importMultiFile({
  files: [
    {
      objectType: 'contacts',
      records: contacts,
      isAssociationSource: true,
      commonColumn: 'email'
    },
    {
      objectType: 'companies',
      records: companies,
      associateWith: 'contacts',
      commonColumn: 'email'
    }
  ]
});
```

### Error Retrieval

```javascript
// Get errors after import
const errors = await importer.getImportErrors(importId);
errors.forEach(error => {
  console.log(`Row ${error.rowNumber}: ${error.errorMessage}`);
});
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

**Respect rate limits (canonical values from config/hubspot-rate-limits.json):**
- Free/Starter: 100 requests/10 seconds, 250K/day
- Professional: 190 requests/10 seconds, 625K/day
- Enterprise: 190 requests/10 seconds, 1M/day
- Public OAuth: 110 requests/10 seconds (fixed)

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

## Client-Centric Folder Migration

**Migrate HubSpot portal data to org-centric structure**

The plugin supports dual-path resolution for both legacy and client-centric folder structures.

### Path Resolution

```bash
# Resolve path for a portal (works with both structures)
node scripts/lib/portal-context-manager.js resolve <portal-name>

# Migrate context to org-centric structure
node scripts/lib/portal-context-manager.js migrate <portal-name> --org <org-slug>
```

### Supported Structures

| Structure | Path Pattern | Priority |
|-----------|--------------|----------|
| Org-Centric (New) | `orgs/{org}/platforms/hubspot/{portal}/` | 1 |
| Legacy Plugin Portals | `portals/{portal}/` | 2 |
| Legacy Platform | `instances/hubspot/{portal}/` | 3 |

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `ORG_SLUG` | Org identifier for org-centric paths |
| `HUBSPOT_PORTAL_ID` | HubSpot portal ID |
| `INSTANCE_PATH` | Direct path override |

### Full Migration

Use the opspal-core migration command:
```bash
/migrate-schema --dry-run  # Preview
/migrate-schema --only-org acme  # Migrate single org
```

**Full documentation**: See `skills/client-centric-migration/SKILL.md` in opspal-core

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

## Automation Actions V4 API (NEW)

### Overview

Create custom workflow actions that integrate external services into HubSpot workflows using the Automation Actions V4 API.

**Key Capabilities:**
- **Custom Action Definitions** - Define actions that appear in the workflow editor
- **Action Functions** - PRE_ACTION_EXECUTION, PRE_FETCH_OPTIONS, POST_FETCH_OPTIONS
- **External Options Fetching** - Dynamic dropdowns from external APIs
- **Async Execution** - BLOCK state with callback completion
- **Multi-language Labels** - Support for 14 languages

### Quick Commands

```bash
/hs-action-create               # Create custom action
/hs-action-list                 # List custom actions
/hs-action-add-function         # Add function to action
/hs-callback-complete           # Complete workflow callback
```

### New Agents

- `hubspot-custom-action-builder` - Creates custom workflow actions
- `hubspot-callback-orchestrator` - Manages async callback completion

### Creating a Custom Action

```javascript
const AutomationActionsV4Wrapper = require('./scripts/lib/automation-actions-v4-wrapper');

const wrapper = new AutomationActionsV4Wrapper(accessToken, appId);

const action = await wrapper.createAction({
  actionUrl: 'https://your-service.com/webhook',
  objectTypes: ['CONTACT', 'DEAL'],
  inputFields: [
    { name: 'email', type: 'string', required: true },
    { name: 'priority', type: 'enumeration', options: ['low', 'medium', 'high'] }
  ],
  outputFields: [
    { name: 'status', type: 'enumeration', options: ['success', 'failed'] }
  ],
  labels: {
    en: { actionName: 'My Custom Action' }
  }
});
```

### Async Callback Handling

```javascript
const CallbackStateManager = require('./scripts/lib/callback-state-manager');

const manager = new CallbackStateManager({ accessToken });

// Register callback from your webhook
manager.registerCallback({
  callbackId: 'callback-123',
  expirationDuration: 'P1D'
});

// Complete when ready
await manager.completeCallback('callback-123', {
  status: 'success'
});
```

### Documentation

- Skill: `skills/hubspot-automation-actions/SKILL.md`
- Agent: `agents/hubspot-custom-action-builder.md`
- Templates: `templates/automation-actions/`

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

**Version**: 3.6.0
**Last Updated**: 2026-01-19
