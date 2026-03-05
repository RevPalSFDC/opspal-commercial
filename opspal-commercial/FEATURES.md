# OpsPal Platform Features

**Version**: 2.0
**Last Updated**: February 2026

## Overview

OpsPal is a comprehensive AI-powered operations toolkit providing 270 specialized agents, 1732 automation scripts, and 234 commands across Salesforce, HubSpot, Marketo, and cross-platform operations. This document outlines what the platform can do for your team.

**Quick Stats**:
- 🤖 **270 Specialized Agents** - Domain experts for every task
- 📜 **1732 Automation Scripts** - Battle-tested JavaScript libraries
- ⚡ **234 Slash Commands** - One-command complex operations
- 🔗 **8 Modular Plugins** - Install only what you need
- 🎯 **Zero-Config Intelligence** - Agents discover org state dynamically

---

## Table of Contents

1. [Claude Code 2.1.0 Integration](#claude-code-210-integration) 🆕
2. [Cross-Platform Features](#cross-platform-features)
3. [Salesforce Features](#salesforce-features)
4. [HubSpot Features](#hubspot-features)
5. [Getting Started](#getting-started)
6. [Use Case Examples](#use-case-examples)

---

## Claude Code 2.1.0 Integration

### 🎉 Latest Features (January 2026)

**Complete integration with Claude Code 2.1.0 best practices across all 270 agents**

#### Hook System - Automatic Post-Execution Actions

**Stop Hooks** - Execute after agent completion:
- **Assessment Agents (4 agents with 11 Stop hooks)**:
  - `sfdc-revops-auditor` - Auto-generates executive summary with health scores
  - `sfdc-cpq-assessor` - Creates utilization scorecard with keep/optimize/remove recommendations
  - `sfdc-automation-auditor` - Generates conflict detection summary with migration recommendations
  - `sfdc-architecture-auditor` - Packages architecture audit deliverables (ADRs, health reports, diagrams)
  - `sfdc-quality-auditor` - Consolidates quality audit outputs into executive PDF

**Features**:
- Automatic executive summary generation
- Artifact packaging into timestamped archives
- Asana status updates with findings and scores
- All hooks run once per session (`once: true`)

**PreToolUse Hooks** - Validate before execution:
- **Deployment Agents (2 agents with 5 PreToolUse hooks)**:
  - `sfdc-data-export-manager` - Validates export parameters (record count, field count, memory limits)
  - `sfdc-layout-deployer` - Pre-deployment validation (metadata syntax, field references, production backup check)

**Features**:
- Memory limit validation to prevent OOM errors
- Layout metadata syntax validation
- Production backup verification before deployments
- Export size checks with streaming recommendations

**Hook Scripts Created**:
- `revops-summary-consolidator.js` - RevOps health score calculation
- `cpq-scorecard-generator.js` - CPQ utilization analysis with recommendations
- `automation-audit-summary.js` - Automation conflict detection
- `package-architecture-audit.sh` - Architecture deliverable packaging
- `quality-audit-summary-generator.js` - Quality audit consolidation
- `package-audit-deliverables.sh` - General audit artifact packaging
- `asana-status-updater.js` - Automatic Asana task updates

**Validator Scripts**:
- `export-parameter-validator.js` - Export size and memory validation
- `export-size-checker.js` - Streaming mode recommendations
- `layout-metadata-validator.js` - Layout XML validation
- `production-backup-checker.sh` - Backup verification for production
- `profile-assignment-validator.js` - Permission set assignment validation

**Total**: 6 assessment agents, 16 hooks, 12 scripts (~3,500 lines of code)

#### Skills with Forked Context - State Persistence

**8 skills enhanced with `context: fork` for isolated execution with state persistence**:

**Assessment Skills**:
- `cpq-assessment` - Multi-phase CPQ analysis with state checkpoints
- `automation-audit-framework` - Cascade mapping with conflict matrix persistence
- `revops-assessment-framework` - Statistical analysis with org context preservation
- `performance-optimization-guide` - Baseline metrics tracking across optimization phases

**Deployment Skills** (agent routing only):
- `deployment-validation-framework` → `sfdc-deployment-manager`
- `metadata-dependency-patterns` → `sfdc-dependency-analyzer`
- `sales-funnel-diagnostic` → `unified-reporting-aggregator`
- `implementation-planning-framework` → `intelligent-intake-orchestrator`

**Security & Workflow Skills**:
- `security-governance-framework` - Security audit with violation tracking
- `hubspot-workflow-patterns` - Complex workflow design with branch logic persistence

**Benefits**:
- State persists across execution phases
- Checkpoint system enables resume after interruption
- Explicit agent routing reduces confusion
- Isolated execution prevents context pollution

#### YAML Syntax Migration

**120 files converted to Claude Code 2.1.0 YAML list syntax**:
- Converted: `tools: Read, Write, Bash` → `tools:\n  - Read\n  - Write\n  - Bash`
- Plugins updated: gtm-planning (7), data-hygiene (2), developer-tools (14), cross-platform (19), salesforce (75), hubspot (2), monday (1)
- Result: 100% compliance with 2.1.0 best practices

**Verification**: All 270 agents load successfully with new syntax

---

## Cross-Platform Features

### 🎯 GTM Annual Planning (gtm-planning-plugin)

**7 specialized agents for strategic planning**

#### Territory Design & Management
- **gtm-territory-designer**: Create balanced sales territories
  - Geographic territory mapping
  - Account-based territory assignment
  - Territory balancing by revenue/potential
  - Rep capacity and coverage analysis

#### Quota & Capacity Planning
- **gtm-quota-capacity**: Model quota distribution and capacity
  - Bottom-up vs top-down quota modeling
  - Rep capacity analysis (meetings, demos, deals)
  - Quota attainment forecasting
  - Hiring plan optimization

#### Compensation Planning
- **gtm-comp-planner**: Design sales compensation plans
  - Commission structure modeling
  - Accelerator and multiplier design
  - SPIFFs and bonuses planning
  - OTE (On-Target Earnings) analysis

#### Attribution Governance
- **gtm-attribution-governance**: Multi-touch attribution framework
  - First-touch, last-touch, multi-touch models
  - Channel attribution reporting
  - Campaign ROI measurement
  - Attribution model validation

**Use Case**: "Plan FY26 territories with 20 new reps, model quota distribution, and design compensation plan with accelerators at 110%"

---

### 🔄 Cross-Platform Instance Management (opspal-core)

**6 agents for multi-environment operations**

#### Instance Management
- **platform-instance-manager**: Switch between Salesforce orgs and HubSpot portals
  - List all available instances (SFDC orgs, HubSpot portals)
  - Switch active instance with one command
  - Store instance credentials securely
  - Track instance-specific configurations

- **instance-deployer**: Deploy configurations across instances
  - Sandbox → Production promotion
  - Multi-org deployment orchestration
  - Environment-specific configuration

- **instance-sync**: Keep instances synchronized
  - Data sync between environments
  - Metadata comparison and migration
  - Configuration drift detection

#### Asana Integration
- **asana-task-manager**: Project management integration
  - Create tasks from conversation
  - Update task status and comments
  - Link tasks to Salesforce/HubSpot records
  - Track implementation progress

**Commands**:
- `/asana-link` - Link current work to Asana task
- `/asana-update` - Update task with progress notes

**Use Case**: "Switch to production Salesforce org, sync metadata from staging, create Asana task to track deployment"

---

### 🛠️ Developer & Quality Tools (developer-tools-plugin)

**3 agents + comprehensive testing libraries**

#### Plugin Lifecycle Management
- **plugin-documenter**: Auto-generate plugin documentation
  - README generation from metadata
  - USAGE guide creation
  - API documentation extraction

- **plugin-publisher**: Version management and releases
  - Semantic version bumping (major.minor.patch)
  - Changelog generation from git commits
  - Release coordination and tagging

- **plugin-catalog-manager**: Marketplace catalog maintenance
  - Searchable plugin catalog (JSON/MD/CSV)
  - Quality scores for agents
  - Dependency tracking

#### Quality Analysis
- **Quality Analyzer Library** (94.52% test coverage)
  - 0-100 quality scoring for agents
  - Frontmatter completeness checks
  - Prompt engineering evaluation
  - Documentation quality assessment

**Use Case**: "Analyze quality of all Salesforce agents, generate catalog with scores, bump version to 3.10.0"

---

### 📊 Reflection & Improvement System

**Continuous improvement powered by user feedback**

#### How It Works
1. **User submits feedback** via `/reflect` command after any session
2. **Structured analysis** categorizes errors, feedback, and friction points
3. **Cohort detection** groups related issues by root cause
4. **Fix plans generated** with 5-Why analysis and alternatives
5. **Asana tasks created** for implementation tracking

#### Reflection Taxonomy
- **Errors**: Agent routing, path placement, org discovery, automation
- **User Feedback**: Explicit suggestions and pain points
- **Blockers**: Environment, dependencies, permissions
- **Friction**: Inefficiencies and manual steps

**Commands**:
- `/reflect` (in any plugin) - Submit session reflection

**Use Case**: "After deployment session with conflicts, run /reflect to document issues and generate improvement tasks"

---

## Salesforce Features

### 📦 Plugin Overview
- **53 Specialized Agents**
- **313+ JavaScript Libraries**
- **18 Slash Commands**
- **5+ Validation Hooks**

---

### 🎯 Core Orchestration

#### sfdc-orchestrator
**Master coordinator for complex multi-agent Salesforce operations**

**Capabilities**:
- Coordinate multi-domain projects (metadata + security + data)
- Delegate to specialist agents automatically
- Manage phased deployments with validation gates
- Handle dependency orchestration

**Use Case**: "Run comprehensive RevOps assessment including automation audit, security review, and data quality analysis"

#### sfdc-planner
**Strategic planning for Salesforce implementations**

**Capabilities**:
- Unknown scope planning
- Multi-phase deployment strategies
- Complexity assessment and breakdown
- Risk analysis and mitigation planning

**Use Case**: "Plan migration of legacy opportunity management to Salesforce CPQ"

---

### 🛠️ Metadata Management

#### Complete Object & Field Management
- **sfdc-metadata-manager**: Deploy objects, fields, validation rules
  - FLS-aware atomic deployment (prevents permission overwrites)
  - Rollback package generation
  - Multi-object dependency resolution

- **sfdc-metadata-analyzer**: Analyze org metadata without hardcoded assumptions
  - Extract complete validation rule formulas
  - Generate field requirement matrices across layouts
  - Dynamic discovery (no hardcoded object/field names)
  - Remediation plan generation

- **sfdc-field-analyzer**: Deep field analysis
  - Field usage tracking across org
  - Unused field identification
  - Field dependency mapping
  - Field impact analysis for deletions

#### Deployment Management
- **sfdc-deployment-manager**: Phased production deployments
  - Pre-deployment validation
  - Multi-package orchestration
  - Automatic rollback package creation
  - Post-deployment verification

- **sfdc-conflict-resolver**: Fix deployment failures
  - Field history tracking limit detection (max 20/object)
  - Picklist formula validation (TEXT() vs ISBLANK())
  - Object relationship mismatch resolution
  - QuoteLineItem vs OpportunityLineItem detection

**Key Innovation**: **FLS-Aware Atomic Deployment**
- Field + permissions deployed in single transaction
- Prevents 40% of deployment failures
- Eliminates permission overwrites
- Success rate: 60% → 100%

---

### 🔒 Security & Compliance

#### Complete Security Management
- **sfdc-security-admin**: Profiles, permission sets, FLS, sharing rules
  - Field-level security configuration
  - Permission set creation and assignment
  - Sharing rule management
  - Security audit reports

- **sfdc-compliance-officer**: Security and compliance auditing
  - SOC2, GDPR, HIPAA compliance checks
  - Security posture assessment
  - Gap analysis and remediation plans
  - Compliance tracking and reporting

#### Specialized Security Agents
- Einstein security configuration
- Data classification management
- Shield platform encryption
- Event monitoring setup

**Pre-Deployment Validation**: **sfdc-pre-deployment-validator.js**
- Prevents 80% of deployment failures
- Checks field history limits, formula syntax, relationships
- Validates governor limits before deploy
- Required for all production deployments

---

### 📊 Data Operations

#### Bulk Data Management
- **sfdc-data-operations**: Import, export, transform, deduplicate
  - Bulk API for datasets >200 records
  - Data validation before import
  - Error logging with detailed reporting
  - Relationship preservation during operations

- **sfdc-data-generator**: Test data generation
  - Realistic test data for sandboxes
  - Load testing datasets
  - Demo data creation
  - Related records with proper relationships

#### CSV & Data Enrichment
- **sfdc-csv-enrichment**: Enhance CSV data before import
  - External data enrichment (Clearbit, ZoomInfo)
  - Data cleansing and normalization
  - Missing field inference
  - Validation and error correction

#### Deduplication
- **sfdc-dedup-safety-copilot**: Safe record merging
  - Duplicate detection algorithms
  - Merge decision matrix
  - Data loss prevention
  - Audit trail of merge operations

**Commands**:
- `/dedup` - Find and merge duplicate records
  - Smart matching algorithms
  - Preview before merge
  - Rollback capability

---

### 💰 CPQ & RevOps

#### CPQ Assessments
- **sfdc-cpq-assessor**: Comprehensive CPQ health assessment
  - Pricing rules analysis
  - Product rules evaluation
  - Quote template assessment
  - CPQ automation audit
  - Quote-to-cash process review

- **sfdc-cpq-specialist**: CPQ configuration and optimization
  - Price book management
  - Product bundle configuration
  - Discount schedule setup
  - Approval process design

**Command**: `/cpq-preflight` - Pre-assessment validation
- Checks CPQ package installation
- Validates data model setup
- Identifies configuration gaps

#### RevOps Auditing
- **sfdc-revops-auditor**: Revenue operations assessment
  - Sales cycle efficiency analysis
  - Revenue leakage identification
  - Forecast accuracy review
  - Opportunity management audit
  - Sales process optimization

- **sfdc-revops-coordinator**: RevOps project coordination
  - Cross-functional alignment
  - Process standardization
  - KPI definition and tracking
  - Revenue operations roadmap

**Use Case**: "Run CPQ assessment for production org, identify pricing rule conflicts, generate optimization plan"

---

### 🤖 Automation Management

#### Automation Auditing (v2.0 - October 2025)
- **sfdc-automation-auditor**: Industry-leading automation analysis

**New Capabilities** (v2.0):
1. **Field-Level Write Collision Analysis**
   - Shows WHAT each automation writes to conflicting fields
   - Parses Apex code, Flow metadata, Workflow rules
   - Identifies exact conflicting values and formulas

2. **Data Corruption Risk Scoring**
   - 0-100 quantified risk score with severity levels
   - Factors: competing writes, value conflicts, write type diversity
   - Prioritizes fixes by corruption severity

3. **Execution Order Phase Analysis**
   - Phase-by-phase breakdown (beforeInsert, afterUpdate, etc.)
   - Ordered vs unordered automation detection
   - Consolidation roadmap generation

4. **Governor Limit Projections**
   - DML, SOQL, CPU, Heap usage forecasting
   - Single record + bulk (200 records) projections
   - Scale failure prediction

**Reports Generated**:
- `automation-inventory.json` - Complete automation catalog
- `automation-conflicts-report.md` - Conflicts with risk scores
- `Field_Write_Collisions.csv` - Field-level write details
- `Execution_Order_Analysis.md` - Phase breakdown + roadmap
- `Governor_Limit_Projections.csv` - Performance forecasts
- `Data_Corruption_Risk_Matrix.csv` - Risk-ranked fields

**Command**: `/audit-automation` - One-command comprehensive audit
- Analyzes all automation (Flow, Apex, Process Builder, Workflow)
- Generates all reports above
- Provides remediation plan

#### Automation Building
- **sfdc-automation-builder**: Create and modify automation
  - Flow creation from requirements
  - Process Builder → Flow migration
  - Apex trigger development
  - Workflow rule modernization

**Command**: `/activate-flows` - Safely activate Flows
- Validates Flow logic before activation
- Checks for conflicts
- Verifies test coverage

**Use Case**: "Audit all Account automation, identify write conflicts on Owner field, generate consolidation plan"

---

### 🧪 Development

#### Apex Development
- **sfdc-apex-developer**: Apex trigger, class, and test development
  - Apex best practices enforcement
  - Comprehensive test coverage generation
  - Error handling and logging implementation
  - Code optimization and refactoring

- **sfdc-apex**: Advanced Apex operations
  - Batch Apex for large datasets
  - Scheduled Apex for automation
  - Queueable Apex for async operations
  - Platform events and change data capture

#### Lightning Development
- **sfdc-lightning-developer**: Lightning Components (LWC + Aura)
  - LWC component creation
  - Aura → LWC migration
  - Component testing (Jest)
  - Lightning Data Service integration

**Command**: `/validate-lwc` - Validate Lightning Web Components
- ESLint validation
- Jest test execution
- Salesforce DX deployment check

#### UI Customization
- **sfdc-ui-customizer**: Page layouts, Lightning pages, record types
  - Page layout optimization
  - Lightning page builder automation
  - Record type configuration
  - Dynamic forms setup

**Command**: `/sfpageaudit` - Audit Lightning Page field usage
- Analyzes which fields appear on Lightning pages
- Identifies unused fields on layouts
- Suggests layout optimization

---

### 📈 Reports & Dashboards

#### Complete Reporting Framework
- **sfdc-reports-dashboards**: Master reporting agent
  - Report creation from requirements
  - Dashboard design and deployment
  - Report type management
  - Folder organization

- **sfdc-report-designer**: Custom report creation
  - Matrix, summary, tabular report types
  - Cross-object reporting
  - Filters and grouping
  - Formulas and bucketing

- **sfdc-dashboard-designer**: Dashboard creation
  - Component layout optimization
  - Data source configuration
  - Running user setup
  - Mobile dashboard design

#### Report Template System
- **sfdc-report-template-deployer**: Deploy pre-built report templates
  - Library of 20+ standard report templates
  - One-command deployment
  - Automatic report type creation
  - Custom field mapping

**Command**: `/deploy-report-template` - Deploy report from template library
- Sales pipeline reports
- Activity reports
- Opportunity forecasting
- Lead conversion tracking

#### Dashboard Migration & Analysis
- **sfdc-dashboard-migrator**: Migrate dashboards between orgs
  - Cross-org dashboard migration
  - Data source remapping
  - Component compatibility checking

- **sfdc-dashboard-analyzer**: Dashboard performance analysis
  - Load time optimization
  - Data source efficiency
  - Component usage tracking

**Use Case**: "Deploy 5 standard sales reports, create executive dashboard with pipeline and forecast components"

---

### 🔍 Discovery & Analysis

#### Org Discovery
- **sfdc-discovery**: Read-only org analysis
  - Complete metadata inventory
  - Configuration documentation
  - Customization analysis
  - No-modification guarantee

- **sfdc-state-discovery**: Dynamic org state analysis
  - Real-time org configuration
  - Field history tracking status
  - Object relationships mapping
  - Automation inventory

#### Object & Field Analysis
- **sfdc-object-auditor**: Deep object analysis
  - Record count and growth trends
  - Storage utilization
  - Relationship complexity
  - Performance optimization recommendations

**Use Case**: "Analyze production org, document all custom objects, identify unused fields, generate cleanup plan"

---

### 🚀 Specialized Operations

#### Sales Operations
- **sfdc-sales-operations**: Sales team enablement
  - Territory management
  - Opportunity pipeline optimization
  - Sales process automation
  - Forecasting setup

#### Service Cloud
- **sfdc-service-cloud-admin**: Service Cloud configuration
  - Case management setup
  - Omni-channel routing
  - Knowledge base configuration
  - Service console customization

#### Integration
- **sfdc-integration-specialist**: External system integration
  - REST/SOAP API integration
  - Middleware configuration
  - Platform events setup
  - Webhook management

#### Performance Optimization
- **sfdc-performance-optimizer**: Org performance tuning
  - SOQL query optimization
  - Governor limit reduction
  - Bulk API implementation
  - Indexing recommendations

#### Dependency Analysis
- **sfdc-dependency-analyzer**: Metadata dependency mapping
  - Field dependency chains
  - Cross-object dependencies
  - Circular reference detection
  - Safe deletion analysis

---

### 📋 Salesforce Commands Quick Reference

| Command | Purpose | Example |
|---------|---------|---------|
| `/reflect` | Session reflection & feedback | After any session |
| `/cpq-preflight` | Pre-CPQ assessment validation | Before CPQ audit |
| `/audit-automation` | Comprehensive automation audit | Quarterly automation review |
| `/activate-flows` | Safely activate Flows | After Flow development |
| `/validate-lwc` | Validate Lightning Web Components | Before LWC deployment |
| `/sfpageaudit` | Audit Lightning Page fields | Layout optimization |
| `/deploy-report-template` | Deploy report from template | Standard report setup |
| `/dedup` | Deduplicate Salesforce records | Data cleanup |
| `/qa-review` | Quality review of changes | Pre-deployment |
| `/qa-execute` | Execute QA test plan | Post-deployment |
| `/checkdependencies` | Verify plugin dependencies | After installation |
| `/initialize` | Initialize project structure | New project setup |
| `/suggest-agent` | Get agent recommendation | Unknown task domain |
| `/asana-link` | Link work to Asana task | Project tracking |
| `/asana-update` | Update Asana with progress | Status updates |

---

## HubSpot Features

### 📦 Plugin Overview
- **4 Specialized Plugins** (Core, Marketing & Sales, Analytics & Governance, Integrations)
- **71 Specialized Agents**
- **199+ JavaScript Libraries**
- **19 Slash Commands**
- **7+ Validation Hooks**

---

### 🎯 HubSpot Core Operations (hubspot-core-plugin)

**13 agents for foundational HubSpot operations**

#### Orchestration
- **hubspot-orchestrator**: Master coordinator for complex HubSpot operations
  - Multi-domain project coordination
  - Workflow + data + property operations
  - Large-scale portal transformations

- **hubspot-autonomous-operations**: Long-running autonomous operations
  - Multi-phase data migrations
  - Complex workflow rollouts
  - Phased implementations with checkpoints

#### Workflow Management
- **hubspot-workflow-builder**: Create and modify workflows
  - Workflow creation from requirements
  - Action and branch configuration
  - Enrollment trigger setup
  - Error handling implementation

- **hubspot-workflow-auditor**: Audit workflow health
  - Performance analysis
  - Conflict detection (enrollment overlap, action conflicts)
  - Inactive workflow identification
  - Optimization recommendations

- **hubspot-workflow**: General workflow operations
  - Activate/deactivate workflows
  - Update enrollment triggers
  - Modify timing and delays
  - **NEVER modifies data** (logic only)

#### Data Operations
- **hubspot-data-operations-manager**: Orchestrate complex data operations
  - Multi-step data transformations
  - Large-scale migrations
  - Data enrichment workflows
  - Data quality initiatives

- **hubspot-data**: Property management and backfills
  - Create/modify properties
  - Bulk property updates
  - Data backfills
  - **NEVER touches workflow logic** (data only)

#### Contact & Company Management
- **hubspot-contact-manager**: Contact operations
  - Create/update contacts
  - Segment and list management
  - Duplicate merging
  - CSV imports with validation

#### Pipeline & Deal Management
- **hubspot-pipeline-manager**: Pipeline and deal stage configuration
  - Create/modify pipelines
  - Deal stage management
  - Probability and forecast categories
  - Stage automation setup
  - Required properties per stage

#### Property Management
- **hubspot-property-manager**: Custom property creation and management
  - Create properties (text, number, dropdown, etc.)
  - Modify property types and options
  - Property group organization
  - Calculated property configuration

#### API & Integration
- **hubspot-api**: Webhooks and external integrations
  - Webhook configuration
  - API integration setup
  - OAuth connection management
  - **Never stores secrets in repo**

#### Administration
- **hubspot-admin-specialist**: Portal-level administration
  - Portal settings configuration
  - User permission management
  - Team and assignment setup
  - Company-wide defaults

---

### 📈 HubSpot Marketing & Sales (hubspot-marketing-sales-plugin)

**10 agents for marketing automation and sales enablement**

#### Marketing Automation
- **hubspot-marketing-automation**: Marketing workflow orchestration
  - Campaign workflows
  - Lead nurturing sequences
  - Marketing automation setup
  - A/B testing configuration

- **hubspot-email-campaign-manager**: Email campaign management
  - Email template creation
  - Campaign scheduling
  - Personalization and segmentation
  - Performance tracking

#### Lead Scoring & SDR Operations
- **hubspot-lead-scoring-specialist**: MQL/SQL scoring
  - Scoring model design
  - Behavioral and demographic scoring
  - Score threshold optimization
  - Lead quality analysis

- **hubspot-sdr-operations**: SDR workflow automation
  - Lead assignment automation
  - Cadence management
  - Activity tracking
  - SDR performance reporting

#### Territory & Revenue Management
- **hubspot-territory-manager**: Territory planning and assignment
  - Territory definition
  - Account assignment rules
  - Territory balancing
  - Coverage analysis

- **hubspot-revenue-intelligence**: Revenue analytics
  - Deal forecasting
  - Win/loss analysis
  - Sales velocity tracking
  - Revenue attribution

- **hubspot-ai-revenue-intelligence**: AI-powered revenue insights
  - Predictive deal scoring
  - Churn risk identification
  - Revenue trend forecasting
  - Anomaly detection

#### Renewals & Conversation Intelligence
- **hubspot-renewals-specialist**: Renewal automation
  - Renewal opportunity creation
  - Renewal workflows
  - Churn prevention automation
  - Expansion opportunity tracking

- **hubspot-conversation-intelligence**: Sales conversation analysis
  - Call recording analysis
  - Talk-to-listen ratio tracking
  - Key phrase identification
  - Coaching recommendations

#### Product-Led Growth
- **hubspot-plg-foundation**: PLG strategy implementation
  - Product-qualified lead (PQL) scoring
  - In-app engagement tracking
  - Trial-to-paid conversion workflows
  - Product usage analytics

---

### 📊 HubSpot Analytics & Governance (hubspot-analytics-governance-plugin)

**8 agents for reporting, analytics, and data quality**

#### Analytics & Reporting
- **hubspot-analytics-reporter**: Analytics dashboards
  - Custom dashboard creation
  - Marketing analytics
  - Sales performance reports
  - Revenue reporting

- **hubspot-reporting-builder**: Custom report creation
  - Single object reports
  - Cross-object reporting
  - Funnel reports
  - Custom metrics and calculations

- **hubspot-attribution-analyst**: Attribution modeling
  - First-touch, last-touch attribution
  - Multi-touch attribution models
  - Channel attribution analysis
  - Campaign ROI measurement

#### Data Quality & Hygiene
- **hubspot-data-hygiene-specialist**: Data cleanup and quality
  - Duplicate detection and merging
  - Data standardization
  - Missing data identification
  - Data quality scoring

- **hubspot-web-enricher**: Company data enrichment
  - Website scraping for company data
  - Clearbit/ZoomInfo integration
  - Firmographic enrichment
  - Technographic data collection

#### Governance & Compliance
- **hubspot-governance-enforcer**: Compliance and standards
  - Naming convention enforcement
  - Property standardization
  - Workflow approval processes
  - Audit trail maintenance

- **hubspot-adoption-tracker**: User adoption monitoring
  - Feature usage tracking
  - User activity analysis
  - Training gap identification
  - ROI measurement

#### Portal Assessment
- **hubspot-assessment-analyzer**: Comprehensive portal audits
  - Configuration health check
  - Best practices compliance
  - Performance optimization
  - Gap analysis and recommendations

---

### 🔌 HubSpot Integrations (hubspot-integrations-plugin)

**5 agents + 4 commands for external integrations**

#### Salesforce Integration
- **hubspot-sfdc-sync-scraper**: Salesforce sync analysis
  - Sync configuration audit
  - Field mapping analysis
  - Sync error detection
  - Performance optimization

**Commands**:
- `/hssfdc-scrape` - Scrape Salesforce sync settings
- `/hssfdc-analyze` - Analyze sync health and conflicts
- `/hssfdc-validate` - Validate field mappings
- `/hssfdc-session-check` - Check sync session status

#### Payment Integration
- **hubspot-stripe-connector**: Stripe payment integration
  - Payment tracking
  - Subscription management
  - Revenue recognition
  - Payment webhook handling

#### Content & Commerce
- **hubspot-cms-content-manager**: CMS and content management
  - Page creation and editing
  - Blog management
  - Landing page optimization
  - SEO configuration

- **hubspot-commerce-manager**: Commerce Hub operations
  - Product catalog management
  - Quote creation
  - Payment processing
  - Order management

#### Service Hub
- **hubspot-service-hub-manager**: Service Hub configuration
  - Ticket management setup
  - Knowledge base creation
  - Customer portal configuration
  - SLA management

---

### 📋 HubSpot Commands Quick Reference

| Command | Purpose | Plugin |
|---------|---------|--------|
| `/reflect` | Session reflection & feedback | All |
| `/hsdedup` | Deduplicate HubSpot records | Core |
| `/hsenrich` | Enrich records with external data | Core |
| `/hsmerge` | Merge duplicate records | Core |
| `/newhs` | Create new portal configuration | Core |
| `/hssfdc-scrape` | Scrape SFDC sync settings | Integrations |
| `/hssfdc-analyze` | Analyze SFDC sync health | Integrations |
| `/hssfdc-validate` | Validate SFDC field mappings | Integrations |
| `/hssfdc-session-check` | Check SFDC sync session | Integrations |
| `/checkdependencies` | Verify plugin dependencies | Core |
| `/initialize` | Initialize project structure | Core |

---

## Getting Started

### Installation

```bash
# 1. Add the marketplace (one-time setup)
/plugin marketplace add RevPalSFDC/opspal-plugin-internal-marketplace

# 2. Install plugins you need
/plugin install opspal-salesforce@revpal-internal-plugins
/plugin install hubspot-core-plugin@revpal-internal-plugins
/plugin install opspal-gtm-planning@revpal-internal-plugins
/plugin install opspal-core@revpal-internal-plugins

# 3. Verify installation
/plugin list
/agents
```

### Authentication

**Salesforce**:
```bash
sf org login web --alias myorg
export SF_TARGET_ORG=myorg
```

**HubSpot**:
```bash
export HUBSPOT_API_KEY='your-private-app-token'
export HUBSPOT_PORTAL_ID='12345678'
```

### First Operations

**Salesforce Example**:
```bash
# Via Claude conversation:
"Audit all automation on Account object for conflicts"
# Automatically invokes sfdc-automation-auditor
# Generates comprehensive conflict report
```

**HubSpot Example**:
```bash
# Via Claude conversation:
"Create lead nurture workflow with 3 emails over 2 weeks"
# Automatically invokes hubspot-workflow-builder
# Creates complete workflow with enrollment and actions
```

---

## Use Case Examples

### Use Case 1: Complete CPQ Assessment

**Scenario**: Audit Salesforce CPQ configuration for optimization opportunities

**Workflow**:
1. User: "Run CPQ assessment for production org"
2. System invokes: `sfdc-cpq-assessor`
3. Agent analyzes:
   - Pricing rules (complexity, conflicts)
   - Product rules (dependencies, performance)
   - Quote templates (field usage, automation)
   - Approval processes (bottlenecks, SLA compliance)
4. Generates comprehensive report with:
   - Executive summary with health score
   - Section-by-section analysis
   - Actionable recommendations
   - Implementation roadmap

**Output**: 15-page CPQ assessment with 12 optimization recommendations

---

### Use Case 2: Automation Conflict Resolution

**Scenario**: Multiple automations updating same field causing data corruption

**Workflow**:
1. User: "Audit all automation on Opportunity object"
2. System invokes: `sfdc-automation-auditor`
3. Agent detects:
   - 3 Flows, 2 Apex triggers, 1 Process Builder updating `Stage`
   - Field write collision risk score: 85 (CRITICAL)
   - Governor limit projection: 78% CPU in bulk operations
4. Generates:
   - Field-level write collision details
   - Execution order phase analysis
   - Consolidation roadmap (merge into single Flow)
   - Rollback plan

**Output**: Consolidation plan reducing 6 automations to 1 Flow, risk score: 85 → 15

---

### Use Case 3: HubSpot Lead Nurture Campaign

**Scenario**: Set up automated lead nurturing with email sequence

**Workflow**:
1. User: "Create lead nurture workflow:
   - Enroll leads when lifecycle stage = Lead
   - Send welcome email after 1 day
   - Send feature highlights after 4 days
   - Send case study after 7 days
   - Notify sales if any email clicked"
2. System invokes: `hubspot-workflow-builder`
3. Agent creates:
   - Enrollment trigger (lifecycle = Lead)
   - Email sequence with delays
   - Branch logic for click tracking
   - Sales notification action
4. Validates workflow logic
5. Activates workflow

**Output**: Live workflow nurturing 2,500+ leads/month

---

### Use Case 4: Territory Planning for FY26

**Scenario**: Design sales territories for 20 new reps

**Workflow**:
1. User: "Plan FY26 territories with 20 new reps across US East, West, Central regions"
2. System invokes: `gtm-territory-designer`
3. Agent analyzes:
   - Current account distribution
   - Revenue by geography
   - Rep capacity and coverage gaps
4. Generates:
   - Territory boundaries with account assignments
   - Revenue balance analysis (target: ±10% variance)
   - Rep capacity modeling (meetings, demos, deals)
   - Hiring plan with ramp timeline

**Output**: 20 balanced territories with $12M average opportunity

---

### Use Case 5: Cross-Platform Data Sync

**Scenario**: Synchronize Salesforce and HubSpot contact data

**Workflow**:
1. User: "Audit Salesforce-HubSpot sync for field mapping issues"
2. System invokes: `hubspot-sfdc-sync-scraper`
3. Agent analyzes:
   - Current field mappings (120 fields syncing)
   - Sync errors (15 fields failing)
   - Bidirectional sync conflicts (3 fields)
4. Generates:
   - Field mapping matrix
   - Error resolution plan
   - Conflict resolution recommendations
5. User confirms fixes
6. System applies corrections

**Output**: Sync success rate: 87.5% → 100%

---

### Use Case 6: Salesforce → HubSpot Migration

**Scenario**: Migrate 50,000 leads from Salesforce to HubSpot

**Workflow**:
1. User: "Export Salesforce leads and import to HubSpot with enrichment"
2. System invokes:
   - `sfdc-data-operations` (export 50K leads to CSV)
   - `hubspot-data-operations-manager` (import workflow)
3. HubSpot agent:
   - Validates CSV format (required fields, data types)
   - Imports via bulk API (batches of 1000)
   - Deduplicates by email (identifies 2,500 duplicates)
   - Enriches with Clearbit company data
   - Assigns lifecycle stages based on data completeness
4. Generates migration report:
   - 50,000 records exported
   - 47,500 unique records imported
   - 2,500 duplicates merged
   - 45,000 enriched with company data
   - 40,000 assigned lifecycle stages

**Output**: Complete migration with 95% data quality, zero downtime

---

## Key Differentiators

### 🎯 Zero-Config Intelligence
- **Agents discover org state dynamically** - No hardcoded metadata
- Query actual fields, objects, relationships before operations
- Prevents "object not found" errors from org customizations

### ⚡ FLS-Aware Atomic Deployment
- **Field + permissions in single transaction** - Prevents overwrites
- Success rate improvement: 60% → 100%
- Eliminates 40% of deployment failures

### 🛡️ Pre-Deployment Validation
- **Prevents 80% of deployment failures** before they happen
- Checks field history limits, formula syntax, relationships
- Governor limit pre-validation
- Required for production deployments

### 🤖 Automation Conflict Detection v2.0
- **Industry-leading automation analysis**
- Field-level write collision details (shows exact conflicting values)
- 0-100 data corruption risk scoring
- Governor limit projections (single + bulk operations)
- Execution order phase analysis with consolidation roadmap

### 📊 Continuous Improvement via Reflection
- **Learn from every session** with `/reflect` command
- Cohort detection groups related issues
- 5-Why root cause analysis
- Automated improvement task generation

### 🔄 Separation of Concerns (HubSpot)
- **workflow agents = logic only** (no data modification)
- **data agents = data only** (no workflow changes)
- Prevents accidental workflow data mixing
- Clear agent responsibility boundaries

---

## Support & Documentation

### Plugin-Specific Documentation
- **Salesforce**: `.claude-plugins/opspal-salesforce/.claude-plugin/USAGE.md`
- **HubSpot Core**: `.claude-plugins/hubspot-core-plugin/.claude-plugin/USAGE.md`
- **Other Plugins**: Check `.claude-plugin/USAGE.md` in each plugin directory

### Getting Help
- **List agents**: `/agents` or `/agents | grep [keyword]`
- **Check dependencies**: `/checkdependencies`
- **Suggest agent**: `/suggest-agent` - Get recommendation for task
- **Submit feedback**: `/reflect` - Document issues and improvements

### Resources
- **GitHub Repository**: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace
- **Issue Tracker**: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/issues
- **Full Documentation**: README.md in each plugin directory

---

## Claude Code 2.1.0 Integration (NEW)

### Enhanced Permission Syntax

**Wildcard Bash Permissions** (v2.1.0+)
Supports wildcards at any position for flexible command matching:

```yaml
# Suffix wildcard - any npm command
- Bash(npm *)

# Prefix wildcard - any install command
- Bash(* install)

# Middle wildcard - git operations on main branch
- Bash(git * main)
```

**See full documentation:** `docs/routing-help.md#wildcard-bash-permission-patterns`

**YAML-Style Tool Lists** (v2.1.0+)
Cleaner frontmatter syntax for agents and skills:

```yaml
# Old syntax (still supported)
tools: Read, Write, Bash(git:*)

# New syntax (recommended)
tools:
  - Read
  - Write
  - Bash(git:*)
```

**Benefits:**
- Easier to read and maintain
- Better version control diffs
- Consistent with disallowedTools format
- IDE syntax highlighting support

**Migration Tool:** Use `detect-old-allowed-tools-syntax.js` to find and convert old syntax automatically.

---

### Agent Hooks Integration

**Hooks in Agent Frontmatter** (v2.1.0+)
Agents can now define lifecycle hooks directly:

```yaml
---
name: example-agent
hooks:
  - name: pre-validation
    type: PreToolUse
    command: node scripts/validate-input.js
    once: false
  - name: post-cleanup
    type: PostToolUse
    command: node scripts/cleanup-temp.js
    once: false
  - name: session-summary
    type: Stop
    command: node scripts/generate-summary.js
    once: true
---
```

**Hook Types:**
- **PreToolUse**: Validate inputs before tool execution
- **PostToolUse**: Verify outputs or cleanup after execution
- **Stop**: Generate summaries or reports when agent completes
- **SubagentStop**: Track when sub-agents finish
- **SessionStart**: Initialize resources when agent starts
- **SessionEnd**: Final cleanup and reporting

**Use Cases:**
- Deployment agents: Pre-deployment validation hooks
- Data agents: Post-operation integrity checks
- Assessment agents: Generate summary reports on completion
- Quality agents: Track metrics and trends

**once: true Configuration:**
Hooks marked with `once: true` execute only once per session:

```yaml
hooks:
  - name: initialize-cache
    type: SessionStart
    command: node scripts/init-cache.js
    once: true  # Only runs on first invocation
```

---

### Skills Enhancement

**Forked Execution Context** (v2.1.0+)
Skills can run in isolated sub-agent context:

```yaml
---
name: data-migration-skill
context: fork  # Runs in separate agent process
agent: opspal-salesforce:sfdc-data-operations
---
```

**Benefits:**
- Isolated tool permissions
- Separate error handling
- Independent execution state
- Better resource management

**Agent Specification** (v2.1.0+)
Skills can specify which agent executes them:

```yaml
---
name: cpq-assessment-skill
agent: opspal-salesforce:sfdc-cpq-assessor
skills:
  - /skills/cpq-preflight.md
  - /skills/cpq-validation.md
---
```

**Use Cases:**
- Complex skills that need specialist agents
- Skills with specific tool requirements
- Multi-step workflows with different agent needs
- Skills that should always use specific models

---

### Commands Integration

**Hooks in Commands** (v2.1.0+)
Slash commands can define hooks for validation and cleanup:

```yaml
---
description: Deploy Salesforce metadata with validation
hooks:
  - name: pre-deploy-validation
    type: PreToolUse
    command: node scripts/sfdc-pre-deployment-validator.js
  - name: post-deploy-verification
    type: PostToolUse
    command: node scripts/verify-deployment.js
---
```

**Skills in Commands** (v2.1.0+)
Commands can auto-load required skills:

```yaml
---
description: Run comprehensive CPQ assessment
skills:
  - /skills/cpq-preflight.md
  - /skills/cpq-validation.md
  - /skills/cpq-reporting.md
agent: opspal-salesforce:sfdc-cpq-assessor
---
```

---

### Disabling Specific Agents

**Agent Permission Control** (v2.1.0+)
Can now disable agents using Task tool syntax:

```json
{
  "permissions": {
    "deniedTools": [
      "Task(legacy-agent)",
      "Task(experimental-agent)"
    ]
  }
}
```

**Use Cases:**
- Disable deprecated agents during migration
- Prevent accidental use of experimental features
- Environment-specific agent restrictions
- Debug issues by isolating problematic agents

---

### Migration Utilities

**Syntax Checker Tool**
Automated detection and conversion of old syntax:

```bash
# Check all plugins for old syntax
node dev-tools/developer-tools-plugin/scripts/detect-old-allowed-tools-syntax.js

# Check specific plugin
node dev-tools/developer-tools-plugin/scripts/detect-old-allowed-tools-syntax.js \
  --plugin salesforce-plugin

# Auto-convert with preview
node dev-tools/developer-tools-plugin/scripts/detect-old-allowed-tools-syntax.js \
  --fix --dry-run

# Auto-convert and apply changes
node dev-tools/developer-tools-plugin/scripts/detect-old-allowed-tools-syntax.js \
  --fix
```

**Output Formats:**
- Console output (default)
- JSON report: `--json`
- CSV report: `--csv`
- Verbose mode: `--verbose`

---

### Implementation Roadmap

**Phase 1 (Completed):**
- ✅ Update routing-help.md with wildcard examples
- ✅ Create syntax checker script with unit tests
- ✅ Document new features in FEATURES.md

**Phase 2 (Planned):**
- Add hooks to critical agents (deployment, data, quality)
- Convert all tools: to YAML syntax (bulk conversion)
- Review skills for context: fork opportunities

**Phase 3 (Future):**
- Add agent: field to skills that manually route
- Implement prompt/agent hook types in plugins
- Leverage plugin hook architecture for custom workflows

---

## Version Information

- **Salesforce Plugin**: v3.9.1
- **HubSpot Core Plugin**: v1.0.0
- **HubSpot Marketing & Sales Plugin**: v1.0.0
- **HubSpot Analytics & Governance Plugin**: v1.0.0
- **HubSpot Integrations Plugin**: v1.0.0
- **GTM Planning Plugin**: v1.5.0
- **OpsPal Core**: v1.1.1
- **Developer Tools Plugin**: v2.2.0

**Last Updated**: October 17, 2025
