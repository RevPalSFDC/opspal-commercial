# Changelog

All notable changes to the Marketo Plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.6.22] - 2026-03-23 (Hook Remediation + Agent Tool Fixes)

### Fixed — Hook Safety

- All 20 hooks: Normalized shebangs to `#!/usr/bin/env bash`
- 17 hooks: Added `set -euo pipefail` safety flags (2 lenient-mode hooks excluded by design)
- 11 hooks: Redirected cross-plugin sourcing to own `lib/error-handler.sh` first, core as fallback
- 9 PreToolUse hooks: Added `exec 3>&1 1>&2` stdout/stderr separation
- 7 blocking hooks: Converted from `exit $BLOCK_EXIT_CODE` to JSON `blockExecution` pattern
- 6 hooks: Added `command -v jq` dependency guards (from blocking pattern conversion)

### Fixed — Campaign Activation Validation

- Replaced stub `pre-campaign-activation.sh` (6 echo-only checks, no real validation) with real implementation
- New validation: campaignId format check, API rate limit check (blocks at 95% quota), deactivation cooldown enforcement (5min default)
- Re-registered in `hooks.json` with 10s timeout

### Fixed — Agent Tool Gaps

- `marketo-form-builder`: Added 6 form MCP tools (had zero — couldn't create forms)
- `marketo-landing-page-manager`: Added 4 landing page MCP tools (had zero — couldn't create pages)
- `marketo-campaign-builder`: Added `campaign_create` and `campaign_clone` tools
- `marketo-governance-enforcer`: Documented as advisory-only (approval authority has no approval power by design)

## [2.5.0] - 2026-01-13

### Added

#### Observability Layer - Claude-Powered Continuous Marketing Intelligence

**New Agents (3 agents)**
- `marketo-observability-orchestrator` - Master coordinator for continuous intelligence
  - Coordinates bulk extract jobs (leads, activities, program members)
  - Manages polling and download workflows with rate limiting
  - Routes to data normalization and Claude analysis
  - Maintains continuous intelligence feedback loop
- `marketo-data-normalizer` - Transform exports to AI-ready format (haiku model)
  - Parse CSV outputs from bulk exports
  - Extract nested JSON from activity attributes
  - Map activity type IDs to descriptive names
  - Generate aggregated metrics and summaries
- `marketo-intelligence-analyst` - Claude-powered analysis and recommendations (sonnet model)
  - Interpret activity patterns and engagement trends
  - Analyze campaign/program performance
  - Generate token/segmentation/flow recommendations
  - Identify anomalies and opportunities

**New Commands (4 slash commands)**
- `/observability-setup` - Configure observability layer for Marketo instance
  - Validate API credentials and permissions
  - Configure export schedules (leads, activities, program members)
  - Set up data storage and analysis triggers
- `/observability-dashboard` - Display current metrics and Claude insights
  - Last export timestamps and sizes
  - API quota usage (daily/rolling)
  - Recent recommendations and anomaly alerts
- `/extract-wizard` - Interactive wizard for bulk exports
  - Choose export type (leads, activities, program members)
  - Configure filters (date range, activity types, program ID)
  - Monitor job progress and download results
- `/analyze-performance` - Trigger Claude analysis on recent data
  - Performance, engagement, funnel, and anomaly analysis types
  - Auto-implement low-risk recommendations
  - Queue high-risk changes for approval

**New Hooks (4 hooks)**
- `pre-observability-extract.sh` - Validate before bulk extract jobs
  - Daily export quota availability (500 MB limit)
  - Concurrent job limits (2 running, 10 queued)
  - Date range validity (max 31 days)
- `post-extract-complete.sh` - Trigger normalization after export completes
  - Log export metrics (size, duration, record count)
  - Update quota tracking
  - Queue Claude analysis if thresholds met
- `observability-quota-monitor.sh` - Monitor and alert on quota usage
  - Track cumulative daily export size
  - Alert at 80% and 95% thresholds
  - Reset tracking at midnight UTC
- `pre-intelligence-analysis.sh` - Validate data freshness before analysis
  - Data age check (warn if > 24 hours old)
  - Minimum data volume validation
  - File integrity verification

**New Scripts (6 scripts in `scripts/lib/`)**
- `observability-scheduler.js` - Schedule recurring bulk export jobs
  - Cron-like scheduling (hourly, daily, weekly)
  - Staggered export timing to avoid quota exhaustion
  - Automatic retry on failure
- `bulk-extract-orchestrator.js` - Coordinate full extract lifecycle
  - Intelligent queuing (respect 2 concurrent limit)
  - Exponential backoff polling (60s minimum intervals)
  - Error recovery and retry logic
- `data-normalizer.js` - Transform raw CSV to structured JSON
  - CSV parsing with header mapping
  - Activity type ID to name mapping
  - Metric aggregation (engagement rates, conversion rates)
- `intelligence-aggregator.js` - Prepare data for Claude analysis
  - Generate campaign performance summaries
  - Identify statistical anomalies
  - Create Claude-optimized data packages
- `continuous-loop-manager.js` - Manage feedback loop
  - Track recommendation implementation status
  - Measure impact of applied changes
  - Log learning outcomes for future analysis
- `auto-implementer.js` - Execute low-risk changes automatically
  - Validate change against auto-implement rules
  - Execute token updates via Marketo API
  - Roll back if validation fails post-implementation

**New Runbooks (8 documents in `docs/runbooks/observability-layer/`)**
- `01-overview-architecture.md` - System design, data flow, prerequisites
- `02-bulk-export-automation.md` - Lead, activity, program member exports
- `03-queuing-polling-download.md` - Rate limits, quota management, error handling
- `04-data-normalization.md` - CSV parsing, schema design, incremental updates
- `05-claude-analysis-patterns.md` - Prompting strategies, interpretation patterns
- `06-recommendations-actions.md` - Token tweaks, segmentation, flow logic changes
- `07-storage-retention.md` - Data persistence, historical analysis
- `08-continuous-intelligence.md` - Feedback loop, monitoring, alerting

**New Skill Documentation (6 files in `skills/marketo-observability-layer/`)**
- `SKILL.md` - Overview with frontmatter, capability summary
- `bulk-extract-patterns.md` - API patterns for all three export types
- `data-normalization-patterns.md` - CSV parsing, JSON extraction, schema mapping
- `analysis-prompt-patterns.md` - Claude prompting templates for different analyses
- `recommendation-templates.md` - Templates for token, segment, flow recommendations
- `continuous-loop-patterns.md` - Scheduling, monitoring, feedback integration

### Changed
- Updated plugin version from 2.4.0 to 2.5.0
- Extended CLAUDE.md with 3 new agent routing entries for observability
- Added 6 new keywords to plugin manifest (observability, continuous-intelligence, marketing-analytics, ai-recommendations, bulk-extract, data-normalization)
- Increased agent count from 25 to 28
- Registered 4 new hooks in hooks.json

### Storage Structure
```
instances/{portal}/observability/
├── exports/
│   ├── leads/           # Normalized lead exports
│   ├── activities/      # Normalized activity logs
│   └── program-members/ # Normalized membership data
├── analysis/
│   ├── reports/         # Claude-generated analysis reports
│   └── recommendations/ # Tracked recommendations
├── metrics/
│   └── aggregations.json
└── history/
    └── feedback-loop.json
```

### Automation Rules
- **Auto-implement (no approval required)**:
  - Program token value updates
  - Wait step duration changes (< 50% adjustment)
  - Email subject line A/B tests (draft only)
- **Require approval**:
  - Flow step additions/removals
  - Segmentation rule changes
  - Smart list criteria modifications
  - Campaign activation/deactivation

---

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
