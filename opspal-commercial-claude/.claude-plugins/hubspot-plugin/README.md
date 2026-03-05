# Hubspot Plugin

Comprehensive HubSpot operations with 44 agents, 84 scripts, 21 commands. Features: workflow automation, contact/deal management, marketing campaigns, analytics & reporting, Salesforce sync, integrations (Stripe, Commerce, CMS), Service Hub, PLG foundation, revenue intelligence. v3.0.0: Consolidated from 5 modular HubSpot plugins into single comprehensive plugin.

## Overview

Comprehensive HubSpot operations with 44 agents, 84 scripts, 21 commands. Features: workflow automation, contact/deal management, marketing campaigns, analytics & reporting, Salesforce sync, integrations (Stripe, Commerce, CMS), Service Hub, PLG foundation, revenue intelligence. v3.0.0: Consolidated from 5 modular HubSpot plugins into single comprehensive plugin.

This plugin provides 44 agents, 0 scripts, 21 commands.

## Quick Start

### Installation

```bash
/plugin install hubspot-plugin@revpal-internal-plugins
```

### Verify Installation

```bash
/agents  # Should show 44 hubspot-plugin agents
```

### Your First Task

Try asking for help with hubspot-admin-specialist:
```
User: "Help me a specialized hubspot agent focused on portal administration, user management,"
```

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
- [Scripts](.claude-plugins/opspal-core-plugin/packages/domains/hubspot/scripts/) - Utility scripts
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

**Hubspot Plugin v3.0.0** - Built by RevPal Engineering
