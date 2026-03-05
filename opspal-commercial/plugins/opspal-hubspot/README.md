# Hubspot Plugin

Comprehensive HubSpot operations with 54 agents, 91 scripts, 32 commands. Features: workflow automation, contact/deal management, marketing campaigns, CMS blog management, HubDB tables, serverless functions, **Developer Platform apps (app cards, settings components, marketplace submission)**, **Imports V3 API (multi-file imports, associations, marketing flags)**, **Goals & Quotas API (sales goals, quota tracking, attainment reporting)**, **Automation Actions V4 API (custom workflow actions, action functions, callback management)**, analytics & reporting, Salesforce sync, integrations (Stripe, Commerce, CMS), Service Hub, PLG foundation, revenue intelligence. v3.6.0: Added Automation Actions V4 API support.

## Overview

Comprehensive HubSpot operations with 54 agents, 91 scripts, 32 commands. Features: workflow automation, contact/deal management, marketing campaigns, CMS, HubDB, Developer Platform apps, Imports V3 API, Goals & Quotas API, and Automation Actions V4 API.

This plugin provides 54 agents, 91 scripts, 32 commands.

## Quick Start

### Installation

```bash
/plugin install opspal-hubspot@revpal-internal-plugins
```

### Verify Installation

```bash
/agents  # Should show 51 hubspot-plugin agents
```

### Your First Task

Try asking for help with hubspot-admin-specialist:
```
User: "Help me a specialized hubspot agent focused on portal administration, user management,"
```

## Data Quality Runbook Series 📚

**Production-ready operational runbooks for HubSpot data quality management** (NEW in v3.0.0)

The plugin includes **5 comprehensive runbooks** (~50,000 words) providing operational guidance for all data quality operations:

1. **Property Validation Fundamentals** - Field-level validation, conditional required fields, cross-platform validation
2. **Property Population Monitoring** - Completeness scoring, fill rate monitoring, remediation workflows
3. **Integration Health Checks** - Salesforce/Stripe/native integration monitoring, SLO model, circuit breakers
4. **Data Enrichment Strategies** - Multi-source enrichment, mastering policy, credits governance, GDPR gating
5. **Duplicate Detection & Deduplication** - Canonical selection, merge operations, Salesforce constraints

**Quick Access**:
```bash
# View all runbooks
ls docs/runbooks/data-quality/

# Read specific runbook
cat docs/runbooks/data-quality/01-property-validation-fundamentals.md

# Quick routing guide
cat docs/runbooks/RUNBOOK_ROUTING_GUIDE.md
```

**Integrated with Agents**: All 5 runbooks are automatically referenced by relevant agents (hubspot-data-hygiene-specialist, hubspot-property-manager, hubspot-workflow-builder, etc.)

**Documentation**: See `docs/runbooks/data-quality/README.md` for complete series overview

---

## Developer Platform Apps 🆕

**Build custom HubSpot apps with React-based UI components** (NEW in v3.4.0)

Complete support for HubSpot's Developer Platform including:
- **App Cards** - UI components for CRM records, preview panels, help desk, sales workspace
- **Settings Components** - Configuration pages with Panel/Tabs/Accordion/Modal layouts
- **`hs project` Workflow** - Full CLI integration for app development lifecycle
- **Marketplace Submission** - Validation and submission guidance

**Quick Commands**:
```bash
/hs-app-create              # Initialize new HubSpot app
/hs-app-card-add            # Add app card to project
/hs-settings-add            # Add settings component
/hs-app-deploy              # Deploy to HubSpot
/hs-app-validate            # Validate for marketplace
```

**New Agents**:
- `hubspot-app-developer` - Master orchestrator for app development
- `hubspot-app-card-builder` - Creates React-based app cards
- `hubspot-settings-builder` - Builds settings configuration pages

**Documentation**: See `skills/hubspot-developer-platform/SKILL.md` for complete guide

---

## Imports V3 API 🆕

**Advanced data import with full V3 API capabilities** (NEW in v3.4.0)

Enhanced import features:
- **Multi-file imports** - Import contacts and companies with automatic associations
- **Marketing flags** - Mark contacts as marketing-eligible during import
- **Auto-create lists** - Create static lists from imported contacts
- **Column mapping** - Full control over column-to-property mapping
- **Error retrieval** - Fetch detailed error information for failed rows

**Quick Command**:
```bash
/hs-import-advanced                     # Interactive import wizard
/hs-import-advanced --type=multi-file   # Multi-file with associations
```

**Documentation**: See `commands/hs-import-advanced.md` for complete reference

---

## Goals & Quotas API (NEW)

**Sales goal targets and quota management via Goal Targets V3 API** (NEW in v3.5.0)

Complete support for HubSpot's Goal Targets V3 API including:
- **Goal Retrieval** - List all goals, get by ID, search with filters
- **Quota Tracking** - Calculate attainment percentages and remaining targets
- **Status Assessment** - ACHIEVED, ON_TRACK, AT_RISK, BEHIND, MISSED
- **User Goals** - Filter goals by HubSpot user ID
- **Period Filtering** - Get goals by quarter or custom date range

**Quick Commands**:
```bash
/hs-goals                   # List active sales goals
/hs-goals --user <id>       # Goals for specific user
/hs-goals --period Q1       # Goals for Q1
/hs-goals --id <goal-id>    # Specific goal details
```

**New Agent**:
- `hubspot-goals-manager` - Sales goals and quota tracking specialist

**Documentation**: See `skills/hubspot-goals-quotas/SKILL.md` for complete guide

---

## Automation Actions V4 API 🆕

**Create custom workflow actions that integrate external services** (NEW in v3.6.0)

Complete support for HubSpot's Automation Actions V4 API including:
- **Custom Action Definitions** - Create actions that appear in the workflow editor
- **Input/Output Fields** - Configure what data users provide and what your action returns
- **Action Functions** - PRE_ACTION_EXECUTION, PRE_FETCH_OPTIONS, POST_FETCH_OPTIONS
- **External Options** - Dynamic dropdown options from external APIs
- **Async Execution** - BLOCK state with callback completion for long-running operations
- **Multi-language Labels** - Support for 14 languages

**Quick Commands**:
```bash
/hs-action-create           # Create custom workflow action
/hs-action-list             # List custom actions
/hs-action-add-function     # Add function to action
/hs-callback-complete       # Complete async callback
```

**New Agents**:
- `hubspot-custom-action-builder` - Creates custom workflow actions with V4 API
- `hubspot-callback-orchestrator` - Manages async callback state and completion

**New Scripts**:
- `scripts/lib/automation-actions-v4-wrapper.js` - V4 API wrapper
- `scripts/lib/callback-state-manager.js` - Callback state management

**Documentation**: See `skills/hubspot-automation-actions/SKILL.md` for complete guide

---

## Features

### Agents
- **hubspot-admin-specialist**: A specialized HubSpot agent focused on portal administration, user management,
- **HubSpot Adoption Tracker**: Platform adoption specialist for user activity monitoring, feature adoption metrics, training effectiveness, and ROI measurement
- **HubSpot AI Revenue Intelligence**: AI-powered revenue forecasting, deal intelligence, predictive analytics, and autonomous optimization
- **hubspot-analytics-reporter**: Generates comprehensive analytics, reports, and insights across all HubSpot hubs with AI-powered analysis
- **hubspot-api**: HubSpot integrations, webhooks, and API keys/secrets plumbing. Use for inbound/outbound events and Slack integration touchpoints.
- **hubspot-assessment-analyzer**: Performs comprehensive HubSpot RevOps assessments using statistically-driven methodologies to identify automation gaps, attribution issues, adoption patterns, and integration health.
- **hubspot-attribution-analyst**: A specialized HubSpot agent focused on attribution modeling, multi-touch attribution analysis,
- **HubSpot Autonomous Operations**: Self-operating system for automated decision-making, process optimization, and intelligent workflow orchestration
- **hubspot-cms-content-manager**: Comprehensive HubSpot CMS Hub management specialist handling website pages, blog posts, landing pages, templates, modules, and content optimization with SEO, personalization, and multi-language support. Now includes full CMS Pages API capabilities for programmatic page management with delegation to specialized page publisher.
- **hubspot-cms-page-publisher**: Specialized agent for HubSpot CMS page lifecycle management including creation, updating, cloning, deletion, and publishing workflows (draft vs. live, scheduled vs. immediate)
- **hubspot-commerce-manager**: Comprehensive HubSpot Commerce Hub management specialist handling product catalogs, pricing strategies, quotes, payments, invoicing, and e-commerce operations with full commerce lifecycle support
- **hubspot-contact-manager**: Manages HubSpot contacts, lists, contact properties, and segmentation with comprehensive CRUD operations and data quality enforcement
- **hubspot-content-automation-agent**: Automatically generates AI-optimized content including TL;DR sections, answer blocks, and FAQ sections using the SEO Content Optimizer
- **HubSpot Conversation Intelligence**: AI-powered conversation analysis for calls, emails, and meetings with insights extraction and coaching
- **hubspot-data-hygiene-specialist**: Advanced data cleansing, standardization, and quality enforcement specialist for HubSpot data. Focuses on comprehensive data hygiene operations including duplicate detection, format standardization, data enrichment, automated cleanup workflows, and Salesforce sync-aware merge operations.
- **hubspot-data-operations-manager**: Enterprise-grade data operations specialist for HubSpot handling bulk imports, exports, transformations, migrations, data quality management, and cross-object synchronization with advanced ETL capabilities
- **hubspot-data**: Contact/company property and data hygiene operations in HubSpot. Not for workflows or external integrations.
- **hubspot-email-campaign-manager**: Manages email campaigns, templates, sequences, and marketing communications with advanced personalization and optimization
- **HubSpot Governance Enforcer**: Enterprise governance specialist for data quality, compliance, permissions, audit trails, and change management
- **hubspot-goals-manager**: Sales goals and quota tracking via Goal Targets V3 API including attainment reporting, progress monitoring, and status assessment
- **hubspot-integration-specialist**: Manages webhooks, API integrations, custom apps, and third-party connections for HubSpot ecosystem
- **hubspot-lead-scoring-specialist**: A specialized HubSpot agent focused on developing, implementing, and optimizing
- **hubspot-marketing-automation**: Creates and manages HubSpot workflows, email automation, lead scoring, and behavioral triggers for sophisticated marketing automation
- **hubspot-orchestrator**: Coordinates complex multi-step HubSpot operations across different domains, manages dependencies, and orchestrates other specialized HubSpot agents
- **hubspot-pipeline-manager**: Manages HubSpot deal pipelines, sales processes, forecasting, and revenue operations
- **HubSpot PLG Foundation**: Product-led growth specialist for PQL scoring, usage-based triggers, freemium conversion, and self-serve optimization
- **hubspot-property-manager**: Comprehensive HubSpot property management specialist handling custom object creation, calculated properties, property dependencies, rollup configurations, and advanced data model visualization with enterprise-scale architecture planning.
- **HubSpot Renewals Specialist**: Specialized agent for managing renewal pipelines, churn prevention, contract tracking, and renewal forecasting
- **hubspot-reporting-builder**: A specialized HubSpot agent focused on creating custom reports, dashboards,
- **hubspot-revenue-intelligence**: Advanced revenue operations intelligence specialist providing deal health scoring, predictive forecasting, pipeline velocity analysis, risk assessment, win/loss analytics, and comprehensive sales cycle optimization with machine learning-powered insights.
- **hubspot-schema-automation-agent**: Automatically generates and validates JSON-LD schema markup for AI search optimization using the SEO Schema Generator
- **HubSpot SDR Operations**: Advanced SDR operations specialist for outbound sequences, territory management, lead routing, and cadence optimization
- **hubspot-seo-competitor-analyzer**: Analyzes competitor websites and identifies content gaps and opportunities through SERP analysis, competitive benchmarking, and strategic recommendations
- **hubspot-seo-content-optimizer**: Orchestrator agent for comprehensive SEO content optimization and Answer Engine Optimization (AEO). Analyzes existing content quality, identifies AEO opportunities, generates content recommendations, and creates detailed content briefs. Integrates Phase 1 (crawling), Phase 2 (competitive intelligence), and Phase 3 (content optimization) capabilities.
- **hubspot-seo-deployment-agent**: Orchestrates complete AI search optimization deployment to HubSpot with backup and rollback capability using the SEO HubSpot Deployer
- **hubspot-seo-optimizer**: Comprehensive SEO content optimization agent for HubSpot CMS. Provides keyword research, content optimization, technical SEO audits, competitive SERP analysis, and topic cluster generation using Claude AI and free web research tools.
- **hubspot-seo-site-crawler**: Comprehensive website crawler for full-site SEO analysis. Parses sitemaps, performs batch page analysis (50+ pages), detects broken links, calculates technical health scores, identifies redirect chains, and audits image optimization. Integrates with SEO/AEO/GEO optimization runbooks.
- **HubSpot Service Hub Manager**: Comprehensive Service Hub management specialist for tickets, SLAs, customer health, and support operations
- **hubspot-sfdc-sync-scraper**: Scrapes HubSpot Salesforce connector settings via browser automation (settings not available via API)
- **HubSpot Stripe Connector**: Manages bidirectional sync between Stripe and HubSpot for subscription data, payments, and revenue tracking
- **hubspot-territory-manager**: A specialized HubSpot agent focused on territory planning, account segmentation,
- **hubspot-web-enricher**: Enriches HubSpot company data using web search and intelligent website analysis without requiring API keys
- **hubspot-workflow-auditor**: Verifies workflow API operations succeeded correctly with evidence-based validation, detecting silent failures and providing actionable remediation
- **hubspot-workflow-builder**: Creates and manages complex HubSpot workflows with AI-powered automation, cross-hub orchestration, and advanced branching logic
- **hubspot-workflow**: Create, change, and validate HubSpot workflows only. Use for automation and enrollment logic; not for data fixes or webhooks.
- **hubspot-app-developer**: Master orchestrator for HubSpot app development lifecycle including app cards, settings components, and marketplace submission
- **hubspot-app-card-builder**: Creates React-based app cards for CRM records, preview panels, help desk, and sales workspace using HubSpot UI SDK
- **hubspot-settings-builder**: Builds settings configuration pages with Panel, Tabs, Accordion, and Modal layouts
- **hubspot-custom-action-builder**: Creates custom workflow actions via Automation Actions V4 API with input/output fields, action functions, and execution rules
- **hubspot-callback-orchestrator**: Manages async workflow callback execution with BLOCK state handling, expiration tracking, and completion

### Commands
- **/ai-search-optimize**: # AI Search Optimize Command
- **/analyze-competitor**: # Analyze Competitor Command
- **/checkdependencies**: # Check Plugin Dependencies
- **/cms-audit-pages**: # Audit CMS Pages
- **/cms-create-page**: # Create CMS Page
- **/cms-publish-page**: # Publish CMS Page
- **/deploy-ai-seo**: # Deploy AI SEO Command
- **/hsdedup**: # HubSpot Company Deduplication
- **/hsenrich**: # HubSpot Field Enrichment Command
- **/hsmerge**: # HubSpot Merge Strategy Selector
- **/hssfdc-analyze**: Analyze the Salesforce sync field mappings for the current HubSpot portal.
- **/hssfdc-scrape**: Scrape Salesforce sync settings for the specified portal using browser automation.
- **/hssfdc-session-check**: Test HubSpot browser session health for a portal. Validates both file age and actual integrations page access.
- **/hssfdc-validate**: Validate SFDC field mapping CSV files without re-scraping. Checks field counts, sync rules, and required fields.
- **/initialize**: # Initialize Project
- **/newhs**: # 🚀 Create New HubSpot Environment & Project
- **/optimize-content**: # Optimize Content Command
- **/reflect**: # Session Reflection & Improvement Analysis
- **/seo-audit**: # SEO Audit Command
- **/seo-broken-links**: # SEO Broken Links Command
- **/topic-cluster**: # Topic Cluster Command
- **/hs-app-create**: Initialize new HubSpot app project with interactive wizard
- **/hs-app-card-add**: Add app card to existing HubSpot app project
- **/hs-settings-add**: Add settings component to HubSpot app project
- **/hs-app-deploy**: Deploy HubSpot app to portal with validation
- **/hs-app-validate**: Validate HubSpot app for standard or marketplace requirements
- **/hs-import-advanced**: Advanced HubSpot data import with full V3 API features
- **/hs-goals**: List and display sales goals, quotas, and attainment status
- **/hs-action-create**: Create custom HubSpot workflow action with interactive wizard
- **/hs-action-list**: List all custom workflow actions for an app
- **/hs-action-add-function**: Add serverless function to existing custom action
- **/hs-callback-complete**: Complete a pending workflow callback with output fields


## Agents

### hubspot-admin-specialist
**Description:** A specialized HubSpot agent focused on portal administration, user management,

**Tools:** Not specified

---

### HubSpot Adoption Tracker
**Description:** Platform adoption specialist for user activity monitoring, feature adoption metrics, training effectiveness, and ROI measurement

**Tools:** Not specified

---

### HubSpot AI Revenue Intelligence
**Description:** AI-powered revenue forecasting, deal intelligence, predictive analytics, and autonomous optimization

**Tools:** Not specified

---

### hubspot-analytics-reporter
**Description:** Generates comprehensive analytics, reports, and insights across all HubSpot hubs with AI-powered analysis

**Tools:** Not specified

---

### hubspot-api
**Description:** HubSpot integrations, webhooks, and API keys/secrets plumbing. Use for inbound/outbound events and Slack integration touchpoints.

**Tools:** Not specified

---

### hubspot-assessment-analyzer
**Description:** Performs comprehensive HubSpot RevOps assessments using statistically-driven methodologies to identify automation gaps, attribution issues, adoption patterns, and integration health.

**Tools:** Not specified

---

### hubspot-attribution-analyst
**Description:** A specialized HubSpot agent focused on attribution modeling, multi-touch attribution analysis,

**Tools:** [mcp__hubspot-v4__search_with_total, mcp__hubspot-v4__get_total_count, mcp__hubspot-enhanced-v3__hubspot_search, mcp__hubspot-enhanced-v3__hubspot_get, Read, Write, TodoWrite, Grep, Task]

---

### HubSpot Autonomous Operations
**Description:** Self-operating system for automated decision-making, process optimization, and intelligent workflow orchestration

**Tools:** Not specified

---

### hubspot-cms-content-manager
**Description:** Comprehensive HubSpot CMS Hub management specialist handling website pages, blog posts, landing pages, templates, modules, and content optimization with SEO, personalization, and multi-language support. Now includes full CMS Pages API capabilities for programmatic page management with delegation to specialized page publisher.

**Tools:** Not specified

---

### hubspot-cms-page-publisher
**Description:** Specialized agent for HubSpot CMS page lifecycle management including creation, updating, cloning, deletion, and publishing workflows (draft vs. live, scheduled vs. immediate)

**Tools:** Not specified

---

### hubspot-commerce-manager
**Description:** Comprehensive HubSpot Commerce Hub management specialist handling product catalogs, pricing strategies, quotes, payments, invoicing, and e-commerce operations with full commerce lifecycle support

**Tools:** Not specified

---

### hubspot-contact-manager
**Description:** Manages HubSpot contacts, lists, contact properties, and segmentation with comprehensive CRUD operations and data quality enforcement

**Tools:** Not specified

---

### hubspot-content-automation-agent
**Description:** Automatically generates AI-optimized content including TL;DR sections, answer blocks, and FAQ sections using the SEO Content Optimizer

**Tools:** Not specified

---

### HubSpot Conversation Intelligence
**Description:** AI-powered conversation analysis for calls, emails, and meetings with insights extraction and coaching

**Tools:** Not specified

---

### hubspot-data-hygiene-specialist
**Description:** Advanced data cleansing, standardization, and quality enforcement specialist for HubSpot data. Focuses on comprehensive data hygiene operations including duplicate detection, format standardization, data enrichment, automated cleanup workflows, and Salesforce sync-aware merge operations.

**Tools:** Not specified

---

### hubspot-data-operations-manager
**Description:** Enterprise-grade data operations specialist for HubSpot handling bulk imports, exports, transformations, migrations, data quality management, and cross-object synchronization with advanced ETL capabilities

**Tools:** Not specified

---

### hubspot-data
**Description:** Contact/company property and data hygiene operations in HubSpot. Not for workflows or external integrations.

**Tools:** Not specified

---

### hubspot-email-campaign-manager
**Description:** Manages email campaigns, templates, sequences, and marketing communications with advanced personalization and optimization

**Tools:** [mcp__hubspot-enhanced-v3__hubspot_search, mcp__hubspot-enhanced-v3__hubspot_create, mcp__hubspot-enhanced-v3__hubspot_update, mcp__hubspot-enhanced-v3__hubspot_batch_upsert, mcp__context7__*, Read, Write, TodoWrite, Grep, Task]

---

### HubSpot Governance Enforcer
**Description:** Enterprise governance specialist for data quality, compliance, permissions, audit trails, and change management

**Tools:** Not specified

---

### hubspot-integration-specialist
**Description:** Manages webhooks, API integrations, custom apps, and third-party connections for HubSpot ecosystem

**Tools:** [mcp__hubspot-v4__webhook_process, mcp__hubspot-v4__webhook_status, mcp__hubspot-v4__validate_scopes, mcp__hubspot-enhanced-v3__hubspot_associate, mcp__context7__*, Read, Write, TodoWrite, Grep, Bash, WebFetch]

---

### hubspot-lead-scoring-specialist
**Description:** A specialized HubSpot agent focused on developing, implementing, and optimizing

**Tools:** [mcp__hubspot-enhanced-v3__hubspot_search, mcp__hubspot-enhanced-v3__hubspot_update, mcp__hubspot-enhanced-v3__hubspot_batch_upsert, mcp__hubspot-v4__workflow_enumerate, mcp__hubspot-v4__workflow_hydrate, Read, Write, TodoWrite, Grep, Task]

---

### hubspot-marketing-automation
**Description:** Creates and manages HubSpot workflows, email automation, lead scoring, and behavioral triggers for sophisticated marketing automation

**Tools:** Not specified

---

### hubspot-orchestrator
**Description:** Coordinates complex multi-step HubSpot operations across different domains, manages dependencies, and orchestrates other specialized HubSpot agents

**Tools:** Not specified

---

### hubspot-pipeline-manager
**Description:** Manages HubSpot deal pipelines, sales processes, forecasting, and revenue operations

**Tools:** [mcp__hubspot-enhanced-v3__hubspot_search, mcp__hubspot-enhanced-v3__hubspot_get, mcp__hubspot-enhanced-v3__hubspot_create, mcp__hubspot-enhanced-v3__hubspot_update, mcp__hubspot-v4__search_with_total, Read, Write, TodoWrite, Grep, Task]

---

### HubSpot PLG Foundation
**Description:** Product-led growth specialist for PQL scoring, usage-based triggers, freemium conversion, and self-serve optimization

**Tools:** Not specified

---

### hubspot-property-manager
**Description:** Comprehensive HubSpot property management specialist handling custom object creation, calculated properties, property dependencies, rollup configurations, and advanced data model visualization with enterprise-scale architecture planning.

**Tools:** Not specified

---

### HubSpot Renewals Specialist
**Description:** Specialized agent for managing renewal pipelines, churn prevention, contract tracking, and renewal forecasting

**Tools:** Not specified

---

### hubspot-reporting-builder
**Description:** A specialized HubSpot agent focused on creating custom reports, dashboards,

**Tools:** Not specified

---

### hubspot-revenue-intelligence
**Description:** Advanced revenue operations intelligence specialist providing deal health scoring, predictive forecasting, pipeline velocity analysis, risk assessment, win/loss analytics, and comprehensive sales cycle optimization with machine learning-powered insights.

**Tools:** Not specified

---

### hubspot-schema-automation-agent
**Description:** Automatically generates and validates JSON-LD schema markup for AI search optimization using the SEO Schema Generator

**Tools:** Not specified

---

### HubSpot SDR Operations
**Description:** Advanced SDR operations specialist for outbound sequences, territory management, lead routing, and cadence optimization

**Tools:** Not specified

---

### hubspot-seo-competitor-analyzer
**Description:** Analyzes competitor websites and identifies content gaps and opportunities through SERP analysis, competitive benchmarking, and strategic recommendations

**Tools:** Task, Read, Write, Bash, WebSearch, WebFetch

---

### hubspot-seo-content-optimizer
**Description:** Orchestrator agent for comprehensive SEO content optimization and Answer Engine Optimization (AEO). Analyzes existing content quality, identifies AEO opportunities, generates content recommendations, and creates detailed content briefs. Integrates Phase 1 (crawling), Phase 2 (competitive intelligence), and Phase 3 (content optimization) capabilities.

**Tools:** Not specified

---

### hubspot-seo-deployment-agent
**Description:** Orchestrates complete AI search optimization deployment to HubSpot with backup and rollback capability using the SEO HubSpot Deployer

**Tools:** Not specified

---

### hubspot-seo-optimizer
**Description:** Comprehensive SEO content optimization agent for HubSpot CMS. Provides keyword research, content optimization, technical SEO audits, competitive SERP analysis, and topic cluster generation using Claude AI and free web research tools.

**Tools:** Not specified

---

### hubspot-seo-site-crawler
**Description:** Comprehensive website crawler for full-site SEO analysis. Parses sitemaps, performs batch page analysis (50+ pages), detects broken links, calculates technical health scores, identifies redirect chains, and audits image optimization. Integrates with SEO/AEO/GEO optimization runbooks.

**Tools:** Not specified

---

### HubSpot Service Hub Manager
**Description:** Comprehensive Service Hub management specialist for tickets, SLAs, customer health, and support operations

**Tools:** Not specified

---

### hubspot-sfdc-sync-scraper
**Description:** Scrapes HubSpot Salesforce connector settings via browser automation (settings not available via API)

**Tools:** Not specified

---

### HubSpot Stripe Connector
**Description:** Manages bidirectional sync between Stripe and HubSpot for subscription data, payments, and revenue tracking

**Tools:** Not specified

---

### hubspot-territory-manager
**Description:** A specialized HubSpot agent focused on territory planning, account segmentation,

**Tools:** [mcp__hubspot-enhanced-v3__hubspot_search, mcp__hubspot-enhanced-v3__hubspot_update, mcp__hubspot-enhanced-v3__hubspot_batch_upsert, mcp__hubspot-enhanced-v3__hubspot_associate, Read, Write, TodoWrite, Grep, Task]

---

### hubspot-web-enricher
**Description:** Enriches HubSpot company data using web search and intelligent website analysis without requiring API keys

**Tools:** Not specified

---

### hubspot-workflow-auditor
**Description:** Verifies workflow API operations succeeded correctly with evidence-based validation, detecting silent failures and providing actionable remediation

**Tools:** [mcp__hubspot-v4__workflow_get_all, mcp__hubspot-v4__workflow_hydrate, Read, Write, Bash, Grep]

---

### hubspot-workflow-builder
**Description:** Creates and manages complex HubSpot workflows with AI-powered automation, cross-hub orchestration, and advanced branching logic

**Tools:** [mcp__hubspot-v4__workflow_enumerate, mcp__hubspot-v4__workflow_hydrate, mcp__hubspot-v4__workflow_get_all, mcp__hubspot-v4__callback_complete, mcp__hubspot-v4__callback_auto_complete, mcp__hubspot-enhanced-v3__hubspot_search, mcp__context7__*, Read, Write, TodoWrite, Grep, Task]

---

### hubspot-workflow
**Description:** Create, change, and validate HubSpot workflows only. Use for automation and enrollment logic; not for data fixes or webhooks.

**Tools:** Not specified

---


## Commands

### /ai-search-optimize
# AI Search Optimize Command

See [commands/ai-search-optimize.md](./commands/ai-search-optimize.md) for detailed usage.

---

### /analyze-competitor
# Analyze Competitor Command

See [commands/analyze-competitor.md](./commands/analyze-competitor.md) for detailed usage.

---

### /checkdependencies
# Check Plugin Dependencies

See [commands/checkdependencies.md](./commands/checkdependencies.md) for detailed usage.

---

### /cms-audit-pages
# Audit CMS Pages

See [commands/cms-audit-pages.md](./commands/cms-audit-pages.md) for detailed usage.

---

### /cms-create-page
# Create CMS Page

See [commands/cms-create-page.md](./commands/cms-create-page.md) for detailed usage.

---

### /cms-publish-page
# Publish CMS Page

See [commands/cms-publish-page.md](./commands/cms-publish-page.md) for detailed usage.

---

### /deploy-ai-seo
# Deploy AI SEO Command

See [commands/deploy-ai-seo.md](./commands/deploy-ai-seo.md) for detailed usage.

---

### /hsdedup
# HubSpot Company Deduplication

See [commands/hsdedup.md](./commands/hsdedup.md) for detailed usage.

---

### /hsenrich
# HubSpot Field Enrichment Command

See [commands/hsenrich.md](./commands/hsenrich.md) for detailed usage.

---

### /hsmerge
# HubSpot Merge Strategy Selector

See [commands/hsmerge.md](./commands/hsmerge.md) for detailed usage.

---

### /hssfdc-analyze
Analyze the Salesforce sync field mappings for the current HubSpot portal.

See [commands/hssfdc-analyze.md](./commands/hssfdc-analyze.md) for detailed usage.

---

### /hssfdc-scrape
Scrape Salesforce sync settings for the specified portal using browser automation.

See [commands/hssfdc-scrape.md](./commands/hssfdc-scrape.md) for detailed usage.

---

### /hssfdc-session-check
Test HubSpot browser session health for a portal. Validates both file age and actual integrations page access.

See [commands/hssfdc-session-check.md](./commands/hssfdc-session-check.md) for detailed usage.

---

### /hssfdc-validate
Validate SFDC field mapping CSV files without re-scraping. Checks field counts, sync rules, and required fields.

See [commands/hssfdc-validate.md](./commands/hssfdc-validate.md) for detailed usage.

---

### /initialize
# Initialize Project

See [commands/initialize.md](./commands/initialize.md) for detailed usage.

---

### /newhs
# 🚀 Create New HubSpot Environment & Project

See [commands/newhs.md](./commands/newhs.md) for detailed usage.

---

### /optimize-content
# Optimize Content Command

See [commands/optimize-content.md](./commands/optimize-content.md) for detailed usage.

---

### /reflect
# Session Reflection & Improvement Analysis

See [commands/reflect.md](./commands/reflect.md) for detailed usage.

---

### /seo-audit
# SEO Audit Command

See [commands/seo-audit.md](./commands/seo-audit.md) for detailed usage.

---

### /seo-broken-links
# SEO Broken Links Command

See [commands/seo-broken-links.md](./commands/seo-broken-links.md) for detailed usage.

---

### /topic-cluster
# Topic Cluster Command

See [commands/topic-cluster.md](./commands/topic-cluster.md) for detailed usage.

---

## Dependencies

### Required CLI Tools

- **node** >=18.0.0
  - Node.js runtime for development tools
  - Check: `node --version`
  - Install: https://nodejs.org/



## Documentation

### Plugin-Specific
- [CHANGELOG](./CHANGELOG.md) - Version history
- [Agents](./agents/) - Agent source files
- [Scripts](./scripts/) - Utility scripts
- [Commands](./commands/) - Slash commands

### General Documentation
- [Plugin Development Guide](../../docs/PLUGIN_DEVELOPMENT_GUIDE.md)
- [Agent Writing Guide](../../docs/AGENT_WRITING_GUIDE.md)
- [Plugin Quality Standards](../../docs/PLUGIN_QUALITY_STANDARDS.md)


## Troubleshooting

See individual agent documentation for specific troubleshooting guidance.

Common issues:
- Installation problems: Verify all dependencies are installed
- Agent not discovered: Run `/agents` to verify installation
- Permission errors: Check file permissions on scripts

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.

## Version History

See [CHANGELOG.md](./CHANGELOG.md) for detailed version history.

## License

MIT License - see repository LICENSE file

## Support

- **Documentation**: See `/docs` directory
- **Issues**: GitHub Issues
- **Repository**: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace

---

**Hubspot Plugin v3.6.0** - Built by RevPal Engineering
