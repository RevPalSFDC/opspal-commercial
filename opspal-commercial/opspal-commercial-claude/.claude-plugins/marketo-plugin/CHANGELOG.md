# Changelog

All notable changes to the Marketo Plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] - 2025-12-05

### Added

#### New Workflow Orchestration Agents (3 agents)

**Marketing Operations Workflow Agents**
- `marketo-webinar-orchestrator` - End-to-end webinar campaign management
  - Program template cloning and token configuration
  - Email sequence setup (invite, confirmation, reminders, follow-up)
  - Webinar provider integration (Zoom/GoTo/Webex)
  - Program-to-SFDC campaign sync
  - Post-event automation (attended vs no-show paths)
- `marketo-lead-scoring-architect` - Lead scoring model design and implementation
  - Multi-dimensional scoring (behavioral + demographic)
  - Behavioral trigger campaigns (email, web, form, event)
  - Demographic batch campaigns (title, industry, size, geo)
  - Score decay for inactivity
  - MQL threshold configuration
- `marketo-mql-handoff-orchestrator` - MQL qualification and sales handoff automation
  - MQL trigger campaign with threshold logic
  - SFDC lead sync on qualification
  - Lead assignment (round-robin, territory, account-based)
  - Sales alert notifications
  - SLA monitoring and escalation
  - MQL recycle workflow

#### New Scripts (3 scripts)

**Workflow Automation Scripts**
- `webinar-program-builder.js` - Webinar program construction
  - `cloneWebinarTemplate()` - Clone program template
  - `updateProgramTokens()` - Set webinar details
  - `configureWebinarProvider()` - Link provider
  - `setupEmailSequence()` - Configure all emails
  - `linkToSalesforce()` - Sync to SFDC
  - `activateWebinarCampaigns()` - Activate triggers
- `scoring-rule-generator.js` - Lead scoring rule generation
  - `generateBehavioralCampaign()` - Create trigger campaigns
  - `generateDemographicCampaign()` - Create batch campaigns
  - `generateDecayCampaign()` - Create decay campaigns
  - `validateScoringModel()` - Check for conflicts
  - `generateScoringDocumentation()` - Export docs
- `mql-handoff-configurator.js` - MQL handoff configuration
  - `createMqlTrigger()` - Create MQL campaign
  - `configureLeadAssignment()` - Set up assignment
  - `createSalesAlert()` - Configure notification
  - `createSlaMonitor()` - SLA tracking
  - `createRecycleCampaign()` - Handle rejections

#### New MCP Tools (5 tools)

**Program Token Tools**
- `mcp__marketo__program_tokens_get` - Get all tokens for program
- `mcp__marketo__program_tokens_update` - Update multiple tokens at once

**Engagement Program Tools**
- `mcp__marketo__engagement_stream_add_content` - Add email to stream
- `mcp__marketo__engagement_stream_set_cadence` - Configure stream schedule
- `mcp__marketo__engagement_transition_rules` - Configure transition rules

#### New Commands (4 slash commands)

**Workflow Wizard Commands**
- `/launch-webinar` - Interactive webinar campaign wizard
  - Webinar details configuration
  - Provider integration
  - Email sequence setup
  - SFDC campaign linking
- `/create-scoring-model` - Lead scoring model wizard
  - Model type selection (combined/behavioral/demographic)
  - ICP definition
  - Scoring rules configuration
  - MQL threshold setting
- `/configure-mql-handoff` - MQL handoff wizard
  - MQL criteria definition
  - SFDC sync configuration
  - Assignment method selection
  - SLA configuration
- `/sync-program-to-sfdc` - Program-to-campaign sync wizard
  - Program selection
  - Campaign linking
  - Status mapping
  - Sync direction

#### New Runbooks (6 operational runbooks)

**Programs**
- `webinar-campaign-launch.md` - End-to-end webinar launch procedure
- `engagement-program-setup.md` - Engagement program configuration

**Leads**
- `lead-scoring-model-setup.md` - Scoring model implementation
- `mql-handoff-workflow.md` - MQL handoff procedures

**Email**
- `email-blast-execution.md` - One-time email send procedures

**Integrations**
- `program-sfdc-campaign-sync.md` - Program-to-campaign sync guide

### Changed
- Updated plugin version from 2.0.0 to 2.1.0
- Extended CLAUDE.md with 3 new agent routing entries
- Added 10 new keywords to plugin manifest
- Increased tool count from 30+ to 35+
- Increased agent count from 20 to 23

---

## [2.0.0] - 2025-12-05

### Added

#### New Agents (8 specialist agents)

**Assessor Agents (4)**
- `marketo-lead-quality-assessor` - Read-only lead database health analysis
  - Lead quality scoring (completeness, freshness, accuracy, engagement, scoring alignment)
  - Duplicate detection patterns
  - Stale lead identification (90+ days no activity)
  - Scoring model validation
- `marketo-program-roi-assessor` - Program effectiveness and ROI analysis
  - Multi-touch attribution models (first-touch, linear, U-shaped, W-shaped)
  - Cost per acquisition tracking
  - Channel effectiveness comparison
  - Program success rate analysis
- `marketo-automation-auditor` - Campaign dependency and conflict detection
  - Smart campaign cascade mapping
  - Trigger conflict identification
  - Circular dependency detection
  - Complexity scoring and recommendations
- `marketo-email-deliverability-auditor` - Email health and compliance auditing
  - Deliverability metrics analysis
  - Compliance checking (CAN-SPAM, GDPR, CASL)
  - Engagement trend monitoring
  - At-risk email identification

**Cross-Platform Bridge Agents (2)**
- `marketo-sfdc-sync-specialist` - Salesforce-Marketo sync management
  - Sync status monitoring
  - Field mapping validation
  - Sync error resolution playbooks
  - Custom object sync support
- `marketo-hubspot-bridge` - HubSpot-Marketo data bridging
  - Bidirectional contact/lead sync
  - Field mapping configuration
  - Duplicate prevention rules
  - Lead routing based on platform rules

**Governance & Performance Agents (2)**
- `marketo-governance-enforcer` - Tier-based approval workflows
  - 4-tier governance model (Tier 1-4 based on risk)
  - Audit trail generation
  - Compliance status tracking
  - Policy violation detection
- `marketo-performance-optimizer` - API and batch performance optimization
  - Rate limit management strategies
  - Batch operation optimization
  - API usage pattern analysis
  - Performance recommendations

#### New Scripts (12 scripts)

**Performance Scripts (3)**
- `batch-operation-wrapper.js` - Generic batch CRUD with parallelization (10-100x speedup)
- `rate-limit-manager.js` - Sliding window rate limiting (100 calls/20 seconds)
- `metadata-cache.js` - Lead schema caching with configurable TTL

**Data Quality Scripts (4)**
- `lead-dedup-detector.js` - Duplicate detection with fuzzy matching
- `lead-quality-scorer.js` - Comprehensive quality scoring algorithm
- `sync-health-checker.js` - Salesforce sync status validation
- `campaign-activation-validator.js` - Pre-activation validation checks

**Instance Management Scripts (3)**
- `instance-quirks-detector.js` - Auto-detect custom fields, channels, naming conventions
- `instance-context-manager.js` - Load/save instance context across assessments
- `assessment-history-tracker.js` - Track assessment history and trends

**Additional Scripts (2)**
- `bulk-lead-processor.js` - Chunked lead operations (300 per batch)
- `api-request-validator.js` - Pre-flight validation for API calls

#### New Hooks (6 hooks)

**PreToolUse Hooks (3)**
- `pre-campaign-activation.sh` - Validates campaigns before activation
  - Checks all referenced emails are approved
  - Verifies smart list has qualifying leads
  - Detects circular trigger dependencies
- `pre-bulk-operation.sh` - Validates bulk operations
  - Record count estimation and impact assessment
  - User confirmation for >1000 records
  - Blocks dangerous mass deletes
- `pre-lead-merge.sh` - Validates merge candidates
  - Ensures winner lead specified
  - Documents merge behavior

**PostToolUse Hooks (3)**
- `post-operation-verification.sh` - Verifies operation success
  - Captures success/error metrics
  - Logs operation timing
- `api-limit-monitor.sh` - Tracks API usage
  - Warns at 70% daily limit
  - Alerts at 85% threshold
- `sync-error-monitor.sh` - Monitors Salesforce sync errors
  - Categorizes errors by type
  - Provides resolution guidance

#### New Commands (9 slash commands)

**Assessment Commands (3)**
- `/marketo-audit` - Full instance audit
- `/marketo-preflight` - Pre-operation validation
- `/lead-quality-report` - Lead database health report

**Diagnostic Commands (3)**
- `/marketo-logs` - View activity logs with filtering
- `/monitor-sync` - Real-time Salesforce sync status
- `/api-usage` - API usage and rate limit tracking

**Creation Wizards (3)**
- `/create-smart-campaign` - Interactive campaign builder
- `/create-email-program` - Email program wizard
- `/create-nurture-program` - Engagement program wizard

#### New MCP Sync Tools (5 tools)
- `mcp__marketo__sync_status` - Get Salesforce sync status
- `mcp__marketo__sync_errors` - List recent sync errors
- `mcp__marketo__sync_field_mappings` - Get SFDC field mappings
- `mcp__marketo__sync_lead` - Force sync specific lead
- `mcp__marketo__sync_retry_errors` - Retry failed sync operations

#### Runbooks (8 operational runbooks)

**Lead Management**
- `lead-quality-maintenance.md` - Regular hygiene tasks
- `bulk-operations-guide.md` - Safe bulk operation patterns

**Campaign Operations**
- `campaign-activation-checklist.md` - Pre-activation validation
- `trigger-campaign-best-practices.md` - Trigger campaign guidelines

**Integrations**
- `salesforce-sync-troubleshooting.md` - Sync error resolution
- `hubspot-bridge-setup.md` - HubSpot bridge configuration

**Performance**
- `api-optimization-guide.md` - Rate limit management

**Assessments**
- `quarterly-audit-procedure.md` - Regular audit process

### Changed
- Updated MCP server from v1.0.0 to v2.0.0
- Extended plugin.json with PreToolUse and PostToolUse hooks
- Enhanced CLAUDE.md with new agent routing table
- Added 15+ new keywords to plugin manifest

### Infrastructure
- Assessment storage in `portals/{instance}/assessments/`
- Cross-instance comparison support
- Governance audit trail logging

---

## [1.0.0] - 2025-12-05

### Added

#### MCP Server (50+ tools)
- Dedicated MCP server for native Marketo API integration
- **Lead tools**: query, create, update, merge, describe, activities, partitions
- **Campaign tools**: list, get, activate, deactivate, schedule, request, types
- **Program tools**: list, get, create, clone, members, channels, tags
- **Email tools**: list, get, create, clone, approve, unapprove, send_sample, content, templates
- **Landing Page tools**: list, get, create, clone, approve, unapprove, content, templates, delete
- **Form tools**: list, get, create, clone, fields, add_field, approve, delete, submit, available_fields
- **Analytics tools**: program_report, email_report, lead_changes, activities, activity_types, smart_list_count, program_members, api_usage, api_errors, deleted_leads
- OAuth 2.0 authentication with automatic token refresh
- Resource providers for instance info and API limits

#### Agents (12 specialist agents)
- `marketo-orchestrator` - Master coordinator for complex operations
- `marketo-instance-discovery` - Read-only instance exploration
- `marketo-lead-manager` - Comprehensive lead management
- `marketo-campaign-builder` - Smart campaign creation and management
- `marketo-email-specialist` - Email templates, programs, A/B testing
- `marketo-program-architect` - Program structure, channels, costs, engagement
- `marketo-landing-page-manager` - LP creation, templates, SEO, forms
- `marketo-form-builder` - Form creation, fields, progressive profiling
- `marketo-analytics-assessor` - Comprehensive reporting and attribution
- `marketo-revenue-cycle-analyst` - Revenue cycle modeling, funnel analysis
- `marketo-data-operations` - Bulk import/export, list management
- `marketo-integration-specialist` - Webhooks, CRM sync, API integrations
- Shared library reference for cross-agent coordination

#### Scripts
- `marketo-auth-manager.js` - OAuth token management
- `add-instance-config.js` - Interactive instance setup

#### Hooks
- `session-start-marketo.sh` - Session initialization
- `post-instance-authentication.sh` - Auto-quirks detection
- Standardized error handler library

#### Commands
- `/marketo-auth` - Authentication configuration
- `/marketo-instance` - Instance management
- `/marketo-leads` - Lead operations

#### Documentation
- README.md with quick start guide
- CLAUDE.md with full agent routing table and MCP tools reference
- Runbook directory structure

### Infrastructure
- Multi-instance support via `portals/config.json`
- Token caching in `portals/.token-cache/`
- Instance-specific context storage
- Plugin manifest with 50+ keywords

---

## Roadmap

### [3.0.0] - Planned
- Real-time event streaming
- Advanced webhook handlers
- Machine learning-based lead scoring recommendations
- Cross-platform unified dashboards
- A/B test optimization agent
