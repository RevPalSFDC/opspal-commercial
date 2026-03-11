# Salesforce Plugin Usage Guide

**Version**: 3.11.0
**Last Updated**: 2025-10-18

## Overview

The Salesforce Plugin is a comprehensive toolkit for Salesforce operations, providing 49 specialized agents, 313+ scripts, and 13 commands covering metadata management, security, data operations, CPQ, RevOps, deployment automation, and usage analytics.

### System Architecture

For a comprehensive visual overview of the plugin architecture, see the **[System Architecture Diagram](../docs/SYSTEM_ARCHITECTURE_DIAGRAM.md)**. The diagram shows:
- Complete data flow from user input through validation hooks, orchestration, specialists, and execution
- All 10 agent categories with 57 specialized agents
- 364+ scripts organized into 11 functional libraries
- Parallel execution patterns for 10k+ bulk operations
- External integrations with Salesforce, Asana, Supabase, and Slack

## Quick Start

### Installation
```bash
/plugin marketplace add RevPalSFDC/opspal-plugin-internal-marketplace
/plugin install opspal-salesforce@revpal-internal-plugins
```

### First Steps
1. **Authenticate to Salesforce**:
   ```bash
   sf org login web --alias myorg
   export SFDX_DEFAULT_USERNAME=myorg
   ```

2. **Verify Installation**:
   ```bash
   /agents  # Check agents are available
   /check-deps  # Verify dependencies
   ```

3. **Test Connection**:
   ```bash
   sf org display
   ```

### Verify Installation
```bash
# Check agents are available
/agents | grep sfdc

# Verify dependencies
/check-deps

# Test org access
sf org display
```

## When to Use This Plugin

Use the Salesforce Plugin when you need to:
- Deploy or modify Salesforce metadata (objects, fields, validation rules)
- Manage security (profiles, permission sets, FLS, sharing rules)
- Perform bulk data operations (imports, exports, transformations)
- Run CPQ or RevOps assessments
- Resolve deployment conflicts
- Analyze automation health
- Develop and test Apex code
- Create or modify Flows
- Build reports and dashboards
- Audit report and dashboard usage patterns

**Do NOT use this plugin for**:
- HubSpot operations (use hubspot-plugin instead)
- Cross-platform data sync (use opspal-core)
- Non-Salesforce CRM systems

## Agent Reference

### 🎯 Core Orchestration Agents

#### sfdc-orchestrator
**Purpose**: Master orchestrator for complex multi-agent Salesforce operations

**When to Use**:
- Complex tasks spanning multiple domains (metadata + security + data)
- Assessments requiring coordination across multiple analysts
- Large-scale org transformations

**Example**:
```bash
# Via Claude Code conversation
"Run a comprehensive RevOps assessment for myorg including automation audit, security review, and data quality analysis"
```

**Common Patterns**:
- Delegates to specialist agents based on task domain
- Coordinates phased deployments with validation gates
- Manages dependencies between deployment steps

#### sfdc-planner
**Purpose**: Strategic planning for Salesforce implementations

**When to Use**:
- Unknown scope or complexity
- Need structured implementation plan
- Multi-phase deployment strategy required

**Example**:
```bash
"Plan migration of legacy opportunity management to CPQ"
```

### 🛠️ Metadata Management Agents

#### sfdc-metadata-manager
**Purpose**: Deploy and manage Salesforce metadata (objects, fields, rules)

**When to Use**:
- Deploy custom objects, fields, validation rules
- Update existing metadata
- Package metadata for deployment

**Example**:
```bash
"Deploy the Account_Extension__c custom object with FLS configuration"
```

**Common Patterns**:
- Always validates metadata before deployment
- Uses FLS-aware field deployer for atomic permissions
- Generates rollback package automatically

#### sfdc-metadata-analyzer
**Purpose**: Comprehensive metadata analysis without hardcoded assumptions

**When to Use**:
- Analyze org metadata structure
- Extract validation rule formulas
- Generate field requirement matrices
- Audit metadata quality

**Example**:
```bash
"Analyze all validation rules on Opportunity object and extract full formulas"
```

**Common Patterns**:
- Dynamic discovery (no hardcoded object/field names)
- Extracts complete metadata (not just names)
- Generates remediation plans for issues

### 🔒 Security & Compliance Agents

#### sfdc-security-admin
**Purpose**: Manage profiles, permission sets, FLS, sharing rules

**When to Use**:
- Configure field-level security
- Create or modify permission sets
- Audit security settings
- Manage sharing rules

**Example**:
```bash
"Grant read/write FLS on Revenue_Forecast__c to Sales_Manager permission set"
```

**Common Patterns**:
- Uses FLS-aware deployment (prevents overwrites)
- Validates permission set assignments
- Generates security audit reports

#### sfdc-compliance-officer
**Purpose**: Security and compliance auditing with remediation

**When to Use**:
- Audit org security posture
- Identify compliance gaps
- Generate remediation plans
- Track security improvements

**Example**:
```bash
"Run SOC2 compliance audit and generate remediation plan"
```

### 📊 Data Operations Agents

#### sfdc-data-operations
**Purpose**: Bulk data imports, exports, and transformations

**When to Use**:
- Import CSV data to Salesforce
- Export data for analysis
- Transform data between objects
- Deduplicate records

**Example**:
```bash
"Import this lead list and deduplicate by email"
```

**Common Patterns**:
- Validates data before import
- Uses Bulk API for large datasets
- Generates import logs with error details

#### sfdc-data-generator
**Purpose**: Generate realistic test data for sandboxes

**When to Use**:
- Populate sandbox with test data
- Create load testing datasets
- Generate sample records for demos

**Example**:
```bash
"Generate 1000 test accounts with related contacts and opportunities"
```

### 💰 CPQ & RevOps Agents

#### sfdc-cpq-assessor
**Purpose**: Comprehensive CPQ health assessment

**When to Use**:
- Audit CPQ configuration
- Identify CPQ optimization opportunities
- Assess quote-to-cash process health
- Document CPQ customizations

**Example**:
```bash
"Run CPQ assessment for production org"
```

**Common Patterns**:
- Generates multi-section assessment report
- Includes pricing rules, product rules, and quote templates
- Provides actionable recommendations

#### sfdc-revops-auditor
**Purpose**: Revenue operations auditing and optimization

**When to Use**:
- Audit revenue processes
- Analyze sales cycle efficiency
- Identify revenue leakage
- Optimize quote-to-cash flow

**Example**:
```bash
"Run RevOps audit focusing on opportunity management"
```

### 🤖 Automation Agents

#### sfdc-automation-auditor
**Purpose**: Audit automation health (Flows, Process Builder, Workflow, Apex)

**When to Use**:
- Identify automation conflicts
- Analyze automation performance
- Detect inactive automations
- Generate automation inventory

**Example**:
```bash
"Audit all automation on Account object for conflicts"
```

**Common Patterns**:
- Detects field write collisions
- Calculates governor limit projections
- Provides execution order analysis
- Generates data corruption risk scores

#### sfdc-automation-builder
**Purpose**: Create and modify Salesforce automation

**When to Use**:
- Build new Flows
- Modify existing automation
- Migrate Process Builder to Flow
- Create Apex triggers

**Example**:
```bash
"Create Flow to auto-create renewal opportunity 90 days before contract end"
```

### 📈 Analytics & Reporting Agents

#### sfdc-reports-usage-auditor
**Purpose**: Comprehensive usage audit for reports and dashboards over rolling 6-month window

**When to Use**:
- Identify stale reports and dashboards for cleanup
- Analyze department-level reporting coverage
- Detect filter compliance violations (missing date/owner filters)
- Find unused critical fields across all reports
- Prioritize report quality improvements based on usage

**Example**:
```bash
"Audit all reports and dashboards for the last 6 months in org 'production'"
```

**Common Patterns**:
- Detects 7,000+ reports with active vs stale breakdown (based on LastModifiedDate)
- Classifies reports by department (Sales, Marketing, Support, CS, Finance, Executive, Operations)
- Aggregates field usage across all reports (top/least used fields)
- Analyzes filter patterns (97%+ orgs missing date filters)
- Identifies gaps: teams without reporting, missing dashboards, unused critical fields

**Output**:
```
instances/{org}/reports-usage-audit-{date}/
├── AUDIT_REPORT.md              # Executive summary with recommendations
├── usage-stats.csv              # All reports with usage metrics
├── field-usage.csv              # Field frequency analysis
├── department-breakdown.csv     # Department summary
└── gaps.csv                     # Prioritized gaps (high/medium/low)
```

**Key Features**:
- **6-month rolling window**: Active = modified in last 6 months
- **Department classification**: Multi-factor scoring (40% folder, 30% fields, 20% owner, 10% report type)
- **Field usage aggregation**: 500+ unique fields with frequency counts
- **Filter compliance**: Best practice checks for date/owner filters
- **Gap detection**: 20+ gap types (high/medium/low priority)
- **Quality integration**: Combines usage metrics with existing report quality validators

**Performance**:
- Small orgs (<500 reports): <2 minutes
- Medium orgs (500-2,000 reports): 2-5 minutes
- Large orgs (2,000-10,000 reports): 5-10 minutes

**Known Limitations**:
- Uses `LastModifiedDate` as proxy for usage (LastRunDate/TimesRun not available via SOQL)
- Classification confidence scores low (0.05-0.08) without Owner metadata
- 3-5% metadata fetch failure rate (reports with deleted fields)

**Configuration**:
```javascript
// scripts/lib/reports-usage-analyzer.js
const CONFIG = {
    DEFAULT_WINDOW_MONTHS: 6,           // Adjust date window
    MAX_FIELD_METADATA_FETCHES: 200,    // API call limit
    INCLUDE_OWNER_METADATA: false        // Set true for +10-30 confidence (adds 30-60s)
};
```

**Troubleshooting**:
- **"maxBuffer exceeded"**: Already increased to 50MB (handles 10,000+ reports)
- **Low confidence scores**: Set `INCLUDE_OWNER_METADATA: true` in config
- **Metadata fetch failures**: Expected for 3-5% of reports (deleted fields)

See `REPORTS_USAGE_AUDITOR_LESSONS_LEARNED.md` for detailed testing results and recommendations.

### 🚀 Deployment Agents

#### sfdc-deployment-manager
**Purpose**: Manage phased deployments with validation

**When to Use**:
- Production deployments
- Multi-package deployments
- Deployments requiring validation gates
- Rollback capability needed

**Example**:
```bash
"Deploy metadata package with pre-validation and rollback"
```

**Common Patterns**:
- Runs pre-deployment validation
- Generates deployment plan
- Creates rollback package
- Validates post-deployment

#### sfdc-conflict-resolver
**Purpose**: Resolve deployment conflicts and metadata issues

**When to Use**:
- Deployment failed with conflicts
- Field history tracking limit exceeded
- Metadata validation errors
- Object relationship mismatches

**Example**:
```bash
"Deployment failed with field history tracking error, resolve conflicts"
```

**Common Patterns**:
- Queries org state before proposing fixes
- Provides multiple resolution options
- Validates fix before applying
- Documents resolution in logs

### 🧪 Development Agents

#### sfdc-apex-developer
**Purpose**: Develop, test, and deploy Apex code

**When to Use**:
- Write Apex triggers or classes
- Create test classes
- Debug Apex issues
- Optimize Apex performance

**Example**:
```bash
"Create Apex trigger to prevent duplicate accounts by email"
```

**Common Patterns**:
- Follows Apex best practices
- Generates comprehensive test coverage
- Includes error handling and logging
- Validates code before deployment

## Command Reference

### /reflect
**Purpose**: Analyze session for errors and generate improvement playbook

**Usage**:
```bash
/reflect
```

**Options**: None

**Examples**:
```bash
# After any Salesforce session
/reflect
```

**Output**:
- JSON reflection saved to `.claude/SESSION_REFLECTION_*.json`
- Automatically submitted to Supabase for trend analysis
- Error categorization and root cause analysis
- User feedback classification and linking
- Reusable playbook generation

### /check-deps
**Purpose**: Verify all plugin dependencies are installed

**Usage**:
```bash
/check-deps
```

**Output**:
- Status of all required dependencies
- Installation commands for missing tools
- Version verification

## Configuration

### Environment Variables
```bash
# Required for org access
export SFDX_DEFAULT_USERNAME=myorg-alias

# Optional: Reflection system integration
export SUPABASE_URL='https://<your-project-id>.supabase.co'
export SUPABASE_ANON_KEY='<your-anon-key>'
export USER_EMAIL='your-email@example.com'
```

### Plugin Settings
No plugin-specific settings file required. Configuration is managed via Salesforce CLI and environment variables.

## Common Workflows

### Workflow 1: Deploy New Custom Field with FLS
**Goal**: Add field to object and configure security atomically

**Steps**:
1. Request field deployment via Claude conversation
2. Agent uses FLS-aware deployer automatically
3. Field and permissions deployed in single transaction
4. Verification runs post-deployment

**Example**:
```bash
# Via Claude Code conversation
"Add Text field Revenue_Category__c to Opportunity with FLS for Sales_Manager permission set"

# Agent automatically:
# 1. Creates field metadata
# 2. Configures FLS in permission set
# 3. Deploys atomically (prevents overwrites)
# 4. Verifies deployment
```

### Workflow 2: Run Comprehensive Automation Audit
**Goal**: Identify automation conflicts and performance issues

**Steps**:
1. Invoke sfdc-automation-auditor
2. Agent inventories all automation
3. Detects conflicts (field writes, execution order)
4. Calculates risk scores and governor projections
5. Generates reports with remediation plan

**Example**:
```bash
# Via Claude Code conversation
"Run automation audit for production org"

# Outputs:
# - automation-inventory.json (all automations)
# - automation-conflicts-report.md (conflicts with risk scores)
# - Field_Write_Collisions.csv (field-level details)
# - Execution_Order_Analysis.md (phase-by-phase breakdown)
# - Governor_Limit_Projections.csv (performance estimates)
```

### Workflow 3: CPQ Health Assessment
**Goal**: Comprehensive CPQ configuration audit

**Steps**:
1. Invoke sfdc-cpq-assessor with org alias
2. Agent discovers CPQ components
3. Analyzes pricing rules, product rules, templates
4. Assesses quote-to-cash process
5. Generates multi-section report with recommendations

**Example**:
```bash
# Via Claude Code conversation
"Run CPQ assessment for myorg"

# Agent generates:
# - CPQ_ASSESSMENT_<org>_<date>.md
# - Sections: Executive Summary, Pricing Rules, Product Rules, Quote Templates, Recommendations
```

### Workflow 4: Resolve Deployment Conflict
**Goal**: Fix failed deployment due to org mismatch

**Steps**:
1. Deployment fails with error message
2. Invoke sfdc-conflict-resolver
3. Agent queries org state (fields, objects, relationships)
4. Identifies mismatch (e.g., field history limit, object reference)
5. Proposes resolution options
6. Applies fix and re-validates

**Example**:
```bash
# Via Claude Code conversation
"Deployment failed: Field history tracking limit exceeded on Account"

# Agent:
# 1. Queries current tracked fields: sf sobject describe Account
# 2. Identifies 20 fields already tracked (at limit)
# 3. Proposes: Remove tracking from least-used field
# 4. Shows which field to modify
# 5. Provides deployment command with fix
```

### Workflow 5: Audit Report and Dashboard Usage
**Goal**: Identify stale reports, missing coverage, and filter compliance violations

**Steps**:
1. Invoke sfdc-reports-usage-auditor with org alias
2. Agent collects 7,000+ reports via SOQL (LastModifiedDate, FolderName, OwnerId)
3. Fetches field metadata via Analytics API (200 active reports)
4. Classifies by department (8 departments with confidence scores)
5. Analyzes filter patterns (date/owner filter compliance)
6. Detects gaps (unused critical fields, stale inventory, missing dashboards)
7. Generates markdown report + 4 CSV exports

**Example**:
```bash
# Via Claude Code conversation
"Audit all reports and dashboards for the last 6 months in org 'production'"

# Agent generates (instances/production/reports-usage-audit-2025-10-18/):
# - AUDIT_REPORT.md: Executive summary with 20 prioritized gaps
#   - 7.3% active rate (559/7,690 reports)
#   - 97.9% missing date filters (190/194 reports)
#   - 11 unused critical fields (Amount, StageName, etc.)
#   - 7,131 stale reports (cleanup candidates)
# - usage-stats.csv: All reports with timesRun, lastRunDate, department
# - field-usage.csv: 516 unique fields with frequency counts
# - department-breakdown.csv: 8 departments with active/total counts
# - gaps.csv: 20 gaps with priority, description, recommendation
```

**Key Findings** (typical):
- **92%+ stale inventory**: Reports not modified in 6+ months
- **97%+ missing date filters**: Performance and usability risk
- **40-60% unknown department**: Reports in generic folders
- **10-15 unused critical fields**: Sales, Marketing, Support fields never used

**ROI**: 6-month audit in <10 minutes vs. hours of manual analysis.

### Workflow 6: Generate Marketing Contact Layout
**Goal**: Create persona-optimized Contact layout for marketing team tracking campaign attribution

**Steps**:
1. Invoke /design-layout or sfdc-layout-generator
2. Agent loads marketing persona template
3. Scores 145 Contact fields based on marketing priorities
4. Generates 5 sections with 25 fields (campaign focus)
5. Creates FlexiPage using fieldInstance pattern (v2.0)
6. Generates CompactLayout with 4 key marketing fields
7. Quality validation (target: 85+)
8. Saves deployment-ready metadata

**Example**:
```bash
# Via slash command
/design-layout --object Contact --persona marketing --org marketing-sandbox --verbose

# Or via Claude Code conversation
"Create a Contact layout for our marketing team focused on campaign attribution"

# Agent generates (instances/marketing-sandbox/generated-layouts/2025-10-18-*/):
# - Contact_marketing_FlexiPage.flexipage-meta.xml (25 fields)
#   - Section 1: Contact Essentials (Name, Email, Phone, LeadSource)
#   - Section 2: Marketing Status & Progression (Marketing_Stage__c, MQL dates)
#   - Section 3: Campaign Attribution (First/Last Touch campaigns)
#   - Section 4: Funnel Milestones (SQL, Customer dates)
#   - Section 5: Marketing Preferences (opt-outs, compliance)
# - Contact_marketing_CompactLayout.compactLayout-meta.xml (4 fields)
# - Contact_marketing_generation_summary.json
# - DEPLOYMENT_INSTRUCTIONS.md

# Quality Score: 87/100 (B+)
```

**Key Features**:
- **Pattern**: fieldInstance v2.0 (works in ALL orgs, no Dynamic Forms required)
- **Fields Included**: Marketing_Stage__c, Last_Touch_Campaign__c, Recent_MQL_Date__c, campaign members
- **Related Lists**: Campaign Members (first), Activities, Opportunities
- **Deployment**: Copy files + `sf project deploy start --source-dir force-app`

### Workflow 7: Generate Customer Success Account Layout
**Goal**: Create CSM-focused Account layout with health scores and renewal tracking

**Steps**:
1. Invoke /design-layout with customer-success persona
2. Agent scores Account fields for CSM priorities
3. Generates 5 sections with 30+ fields (health/renewal focus)
4. Creates fieldInstance pattern FlexiPage
5. Adds CSM-specific related lists (Cases, Contracts, Opportunities)
6. Quality validation and deployment instructions

**Example**:
```bash
# Via slash command
/design-layout --object Account --persona customer-success --org csm-sandbox

# Or via Claude Code conversation
"Generate an Account layout for our customer success managers"

# Agent generates (instances/csm-sandbox/generated-layouts/2025-10-18-*/):
# - Account_customer_success_FlexiPage.flexipage-meta.xml (30+ fields)
#   - Section 1: Account Information (Name, ARR__c, CSM_Owner__c)
#   - Section 2: Health & Risk (Health_Score__c, Risk_Level__c, NPS_Score__c)
#   - Section 3: Adoption & Usage (Product_Adoption_Score__c, Feature_Adoption__c)
#   - Section 4: Renewals & Contracts (Renewal_Date__c, Contract_Value__c)
#   - Section 5: Engagement History (Last_QBR_Date__c, Success_Plan_Status__c)
# - Account_customer_success_CompactLayout.compactLayout-meta.xml
# - DEPLOYMENT_INSTRUCTIONS.md

# Quality Score: 89/100 (B+)
```

**Key Features**:
- **Pattern**: fieldInstance v2.0 (maximum compatibility)
- **Fields Included**: Health_Score__c, Renewal_Date__c, ARR__c, Product_Adoption_Score__c
- **Related Lists**: Cases, Contracts, Opportunities (expansion), Activities
- **Use Case**: Perfect for CSM teams monitoring customer health and renewals

**Available Personas**:
| Persona | Best For | Key Fields |
|---------|----------|------------|
| **sales-rep** | Individual contributors managing deals | Amount, CloseDate, StageName |
| **sales-manager** | Pipeline and forecast management | Forecast, Territory, Team metrics |
| **executive** | High-level KPIs only | Revenue, Win Rate |
| **support-agent** | Case management and SLA tracking | Priority, Status, SLA fields |
| **support-manager** | Team performance and escalations | Case metrics, Team assignments |
| **marketing** | Campaign attribution and lead nurturing | Marketing_Stage__c, Campaigns, MQL dates |
| **customer-success** | Customer health and renewals | Health_Score__c, ARR__c, Renewal_Date__c |

**Pattern: fieldInstance v2.0.0**
- ✅ Works in ALL Salesforce editions (Professional, Enterprise, Unlimited, Developer)
- ✅ No Dynamic Forms permission required
- ✅ Explicit field control via `<fieldInstance>` elements
- ✅ Maximum deployment compatibility
- 📖 Complete pattern documentation: `docs/LAYOUT_PATTERNS.md`

## Best Practices

### ✅ DO
- **Always authenticate before operations**: `sf org login web --alias myorg`
- **Use FLS-aware field deployment**: Prevents permission overwrites (60% → 100% success)
- **Run pre-deployment validation**: Catches 80% of errors before deploy
- **Query org state first**: Agents discover actual org configuration (no hardcoded assumptions)
- **Use /reflect after sessions**: Improves plugin based on your feedback
- **Set SFDX_DEFAULT_USERNAME**: Prevents wrong-org operations
- **Verify dependencies**: Run `/check-deps` after installation
- **Use agents for complex tasks**: They handle multi-step workflows correctly

### 🚫 DON'T
- **Don't deploy to production without validation**: Use sfdc-deployment-manager for phased deploys
- **Don't bypass FLS configuration**: Use atomic field deployer (not manual field + FLS)
- **Don't ignore conflict warnings**: Resolve conflicts before proceeding
- **Don't skip test coverage**: Production requires 75% Apex coverage
- **Don't commit API credentials**: Use environment variables only
- **Don't assume field names**: Let agents discover actual object/field names
- **Don't skip rollback planning**: Generate rollback package before deploy

## Common Pitfalls

### Pitfall 1: Field History Tracking Limit Exceeded
**Symptom**: `Error: Maximum of 20 fields can be tracked per object`

**Cause**: Deploying field with history tracking when object already tracks 20 fields

**Solution**:
```bash
# Query current tracked fields
sf sobject describe Account --json | jq '.fields[] | select(.trackHistory==true) | .name'

# Remove tracking from least-used field before adding new one
```

**Prevention**: Use sfdc-conflict-resolver before deployment - it checks limits

### Pitfall 2: Picklist Formula Validation Error
**Symptom**: `Error: Function ISBLANK may not be used in this type of formula`

**Cause**: Using `ISBLANK()` on picklist fields (not supported)

**Solution**:
```bash
# ❌ Wrong
ISBLANK(Status__c)

# ✅ Correct
TEXT(Status__c) = ""
```

**Prevention**: Use sfdc-metadata-analyzer to validate formulas before deployment

### Pitfall 3: Permission Set Overwrites During Multi-Field Deployment
**Symptom**: FLS permissions lost after deploying multiple fields

**Cause**: Non-atomic FLS configuration (deploy field, then update permission set separately)

**Solution**:
```bash
# Use FLS-aware atomic deployer (automatic in v3.3.6+)
node scripts/lib/fls-aware-field-deployer.js Account \
  '{"fullName":"Field1__c","type":"Text","length":255}' \
  --org myorg
```

**Prevention**: Always use sfdc-metadata-manager agent (uses atomic deployer automatically)

### Pitfall 4: Wrong Object Reference in Relationships
**Symptom**: `Error: Object QuoteLineItem__c does not exist`

**Cause**: Assuming QuoteLineItem vs OpportunityLineItem (org-specific)

**Solution**:
```bash
# Query org to discover correct object
sf sobject list --sobject-type all | grep -i quote

# Use discovered object name in relationship
```

**Prevention**: Use agent-based operations (agents query org first)

## Troubleshooting

### Issue: "sf command not found"
**Error Message**:
```
bash: sf: command not found
```

**Diagnosis**:
1. Check if Salesforce CLI is installed: `which sf`
2. Verify Node.js is installed: `node --version`
3. Check PATH includes npm global bin

**Solution**:
```bash
# Install Salesforce CLI
npm install -g @salesforce/cli

# Verify installation
sf --version

# If PATH issue, add to shell profile
echo 'export PATH="$PATH:$(npm config get prefix)/bin"' >> ~/.bashrc
source ~/.bashrc
```

**Verification**:
```bash
sf --version  # Should show version number
```

### Issue: "jq command not found"
**Error Message**:
```
bash: jq: command not found
```

**Diagnosis**:
1. Check if jq is installed: `which jq`
2. Verify package manager availability

**Solution**:
```bash
# macOS
brew install jq

# Linux (Debian/Ubuntu)
sudo apt-get update && sudo apt-get install jq

# Linux (Red Hat/CentOS)
sudo yum install jq

# Windows (Chocolatey)
choco install jq
```

**Verification**:
```bash
jq --version  # Should show version number
echo '{"test":"value"}' | jq '.test'  # Should output: value
```

### Issue: Deployment Fails with "FIELD_INTEGRITY_EXCEPTION"
**Error Message**:
```
FIELD_INTEGRITY_EXCEPTION: Referenced object does not exist
```

**Diagnosis**:
1. Check target org has required parent objects
2. Verify field references use correct object names
3. Confirm relationship metadata is valid

**Solution**:
```bash
# Query org for object existence
sf sobject describe ParentObject__c

# If object missing, deploy parent first
# If object exists but name wrong, update metadata

# Use sfdc-conflict-resolver to diagnose
# Via Claude conversation:
"Deployment failed with FIELD_INTEGRITY_EXCEPTION, resolve conflict"
```

**Verification**:
```bash
# Verify parent object exists
sf sobject describe ParentObject__c

# Verify relationship field references correct object
cat force-app/main/default/objects/ChildObject__c/fields/Parent__c.field-meta.xml | grep referenceTo
```

## Integration with Other Plugins

### Works With
- **hubspot-core-plugin**: Data sync between Salesforce and HubSpot via opspal-core
- **opspal-core**: Unified operations spanning Salesforce and other platforms
- **gtm-planning-plugin**: GTM planning leverages Salesforce org data
- **developer-tools-plugin**: Quality analysis and version management for Salesforce plugin itself

### Conflicts With
- None known. Salesforce Plugin operates independently within Salesforce domain.

## Performance Considerations

- **Bulk API**: Used automatically for datasets >200 records (prevents governor limit issues)
- **Parallel Processing**: Automation auditor uses parallel queries for large orgs (5x faster)
- **Governor Limit Projections**: Automation auditor calculates DML, SOQL, CPU, Heap usage before deployment
- **Metadata Caching**: Agents cache org metadata to reduce API calls (refreshed per session)
- **FLS-Aware Deployment**: Atomic deployment prevents race conditions (eliminates 40% of deployment failures)

## Security Considerations

- **Never commit API credentials**: Use environment variables or Salesforce CLI auth
- **FLS validation**: All field deployments include permission set configuration
- **Sharing rule audits**: sfdc-security-admin audits sharing rule configurations
- **Permission set assignments**: Validated before and after deployment
- **Rollback packages**: Generated automatically for all production deployments
- **Audit logging**: All operations logged to `.claude/logs/` with org/user/timestamp

## Updates and Versioning

### Recent Changes
See [CHANGELOG.md](./CHANGELOG.md) for full history.

### Breaking Changes from Previous Versions
- **v3.3.6**: Removed `field-deployment-manager.js`, `auto-fls-configurator.js`, `post-field-deployment-validator.js`. All agents now use FLS-aware atomic deployer automatically. Manual scripts must update to use `fls-aware-field-deployer.js`.
- **v3.0.0**: Migrated to plugin architecture. All agents now in `.claude-plugins/opspal-salesforce/agents/`. Update `@import` references in CLAUDE.md.

### Deprecation Notices
- **manual field deployment**: Deprecated in v3.3.6. Use FLS-aware field deployer or sfdc-metadata-manager agent.
- **hardcoded metadata**: Deprecated in v3.0.0. All agents use dynamic org discovery.

## Additional Resources

- **README**: [README.md](../README.md) - Plugin overview and what's new
- **CHANGELOG**: [CHANGELOG.md](./CHANGELOG.md) - Version history
- **Salesforce CLI Reference**: https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_reference.meta/sfdx_cli_reference/
- **Support**: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/issues

## Feedback

Help us improve! Use the `/reflect` command after your session to provide feedback:
```bash
/reflect
```

Your feedback is automatically submitted to our improvement system and helps us prioritize fixes and enhancements.

---

**Need Help?**
- Check [Troubleshooting](#troubleshooting) section above
- Review [Common Pitfalls](#common-pitfalls)
- Run `/agents` to see available agents
- Use `/reflect` to report issues
