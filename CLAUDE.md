# RevPal Agent System - Project Memory

## Project Overview
This is the RevPal Agent System, a comprehensive Claude Code configuration for managing multi-platform releases across Salesforce, HubSpot, and custom applications. The system uses specialized subagents for platform-specific operations and a principal engineer agent for orchestration.

## Critical Rules & Conventions

### 🎯 AGENT DISCOVERY & ROUTING - ALWAYS CHECK FIRST

**IMPORTANT**: Before attempting any task, ALWAYS check if a specialized agent exists for it:

#### Quick Agent Reference Table
| Task Pattern | Use Agent | Keywords/Triggers |
|-------------|-----------|-------------------|
| Release/Deploy | `release-coordinator` | "release", "deploy", "tag", "production", "merge to main" |
| Multi-repo work | `project-orchestrator` | "across repos", "ClaudeSFDC and ClaudeHubSpot", "coordinate" |
| Cross-platform orchestration | `unified-orchestrator` (opspal-internal) | "both platforms", "coordinate SF and HS", "multi-platform" |
| Cross-platform reporting | `unified-reporting-aggregator` (opspal-internal) | "unified dashboard", "combined metrics", "executive report" |
| Cross-platform data quality | `unified-data-quality-validator` (opspal-internal) | "data consistency", "sync quality", "validation across platforms" |
| Instance management | `platform-instance-manager` (opspal-internal) | "switch environment", "manage instances", "all platforms" |
| SF/HS sync | `sfdc-hubspot-bridge` (opspal-internal) | "bidirectional sync", "data bridge", "SF to HS" |
| SF conflicts | `sfdc-conflict-resolver` (in opspal-internal/SFDC) | "deployment failed", "conflict", "field mismatch" |
| SF merge | `sfdc-merge-orchestrator` (in opspal-internal/SFDC) | "merge fields", "consolidate objects", "combine" |
| Complex planning | `sequential-planner` | "complex", "unknown scope", "needs planning", [SEQUENTIAL] |
| Quality review | `quality-control-analyzer` | "recurring issue", "Claude keeps", "friction" |
| Google Drive | `gdrive-*` agents | "document", "template", "report export", "Google" |
| Agent issues | `router-doctor`, `mcp-guardian` | "agent not found", "tool mismatch", "MCP error" |

#### Proactive Agent Usage Rules
**USE AGENTS PROACTIVELY** for these scenarios:
1. **After git merge to main** → Immediately invoke `release-coordinator`
2. **Before any production deploy** → Always use `release-coordinator`
3. **When task spans multiple repos** → Start with `project-orchestrator`
4. **After significant development** → Run `quality-control-analyzer`
5. **When encountering repeated errors** → Use `quality-control-analyzer`
6. **For complex unknown-scope tasks** → Engage `sequential-planner`

### Original Routing & Delegation Rules

- Use **release-coordinator** for any tagged release or cross-platform change; it delegates to others.
- Use **hubspot-workflow** for workflow logic; **do not** modify data there.
- Use **hubspot-data** for properties/backfills; **do not** alter workflows there.
- Use **hubspot-api** for webhooks/integrations; never store secrets in repo.
- Use **sfdc-metadata** for metadata packaging/deploys; **do not** write APEX here.
- Use **sfdc-apex** for APEX code/tests; hand off deploy to sfdc-metadata.
- Use **sfdc-discovery** for read-only org analysis; propose changes, don't apply.

General:
- Reference shared standards via @imports to keep agent backstories short.
- Prefer least-privilege tool sets; request escalation if needed.

### 📋 Agent Discovery Prompt Template

**USE THIS MENTAL CHECKLIST** before starting any task:

```
1. Does this task match any keyword in the Agent Reference Table? → Use that agent
2. Is this a release/deployment task? → Use release-coordinator
3. Does this involve multiple repositories? → Use project-orchestrator
4. Is the task complexity unknown or very high? → Use sequential-planner
5. Am I seeing repeated issues or patterns? → Use quality-control-analyzer
6. Does this involve Salesforce metadata conflicts? → Use sfdc-conflict-resolver (in opspal-internal/SFDC)
7. Does this involve merging SF objects/fields? → Use sfdc-merge-orchestrator (in opspal-internal/SFDC)
8. Does this involve Google Drive operations? → Use gdrive-* agents
9. Is there an agent configuration issue? → Use router-doctor or mcp-guardian
```

**Note**: Salesforce-specific agents (sfdc-*) are located in `opspal-internal/SFDC/.claude/agents/`

**If answering YES to any above → STOP and use the Task tool with that agent FIRST**

### 🧠 Complexity-Based Routing (Sequential Thinking MCP)

The system uses **automatic complexity assessment** to determine when to engage Sequential Thinking MCP:

#### Always Use Sequential Thinking (HIGH Complexity > 0.7):
**Automatic Triggers:**
- Cross-platform releases involving 3+ systems → `sequential-planner`
- Salesforce metadata deployments with 10+ objects → `sequential-planner` 
- Circular dependency resolution → `sfdc-dependency-analyzer` → `sequential-planner`
- Production deployments with breaking changes → `sequential-planner`
- Multi-stage data migrations (>10,000 records) → `sequential-planner`
- Full org metadata comparisons → `sfdc-state-discovery` → `sequential-planner`

**Example**: "Migrate all customer data from legacy system to Salesforce and HubSpot"
→ Automatically triggers sequential-planner due to multi-platform, high-volume migration

#### Conditional Sequential Thinking (MEDIUM Complexity 0.3-0.7):
**Evaluate These Factors:**
- 3-10 object modifications → Check for dependencies first
- Workflow creation with 5+ steps → Assess branching logic
- Permission restructuring → Consider impact radius
- Integration setup → Evaluate external systems

**Decision Criteria for Sequential:**
- ✅ Unknown full scope → Use sequential-planner
- ✅ Production environment → Use sequential-planner
- ✅ Needs rollback plan → Use sequential-planner
- ❌ Well-defined scope → Direct execution
- ❌ Sandbox only → Direct execution

**Example**: "Create a new approval workflow with 7 steps"
→ If production: use sequential-planner
→ If sandbox with clear requirements: direct execution

#### Direct Execution (SIMPLE Complexity < 0.3):
**Skip Sequential for These:**
- Single field creation → Direct SFDC agent
- Basic SOQL queries → Direct query
- Documentation updates → Direct edit
- Single record operations → Direct operation
- Configuration changes → Direct update
- Simple picklist updates → Direct modification

**Example**: "Add a new checkbox field to Account"
→ Direct execution with sfdc-metadata agent

#### User Control Flags:
- `[PLAN_CAREFULLY]` or `[SEQUENTIAL]` - **Force Sequential Thinking** regardless of complexity
- `[QUICK_MODE]` or `[DIRECT]` - **Skip Sequential Thinking** (use with caution)
- `[COMPLEX]` - Hint that task is more complex than it appears
- `[SIMPLE]` - Hint that task is simpler than it appears

**Flag Examples:**
```
User: "[SEQUENTIAL] Update the email field" 
→ Forces sequential-planner even for simple task

User: "[DIRECT] Deploy these 15 objects"
→ Skips sequential-planner despite high count
```

### 🔗 Agent Chaining & Workflows

#### Common Agent Workflows

**Release Workflow Chain:**
```
1. release-coordinator (orchestrates) →
   2a. sfdc-state-discovery (analyze current state) →
   2b. sfdc-conflict-resolver (resolve conflicts) →
   2c. sfdc-metadata deployment agents →
   3. hubspot-* agents (platform updates) →
   4. quality-control-analyzer (post-release review)
```

**Complex Merge Workflow:**
```
1. sfdc-dependency-analyzer (map dependencies) →
   2. sequential-planner (create merge plan) →
   3. sfdc-merge-orchestrator (execute merge) →
   4. sfdc-state-discovery (verify results)
```

**Quality Improvement Workflow:**
```
1. quality-control-analyzer (identify patterns) →
   2. docs-keeper (update documentation) →
   3. claude-compliance-enforcer (validate changes)
```

#### Agent Handoff Patterns
- **Orchestrator → Specialist**: project-orchestrator delegates to platform-specific agents
- **Discovery → Action**: sfdc-state-discovery findings trigger sfdc-conflict-resolver
- **Analysis → Planning**: sfdc-dependency-analyzer feeds into sequential-planner
- **Action → Verification**: Any modification agent should trigger state-discovery

### Routing & Delegation (Coordinator)

- Use **project-orchestrator** for multi-repo planning; it delegates work.
- Use **project-auditor** to assess a specific project path (writes report in ./reports).
- Use **agent-auditor** only when auditing the current directory.
- Use **patch-smith** to generate patch bundles (./reports/patches); never writes into children.
- Use **mcp-guardian** to validate tool ↔ MCP server alignment.
- Use **router-doctor** to find project vs user-scope agent collisions.
- Use **docs-keeper** to propose documentation and roster updates (diffs only).

### Agent Organization Structure

#### Unified Cross-Platform Agents (NEW)
Located in `opspal-internal/.claude/agents/`, these agents work across all platforms:
- **unified-orchestrator** - Master orchestrator for cross-platform operations
- **unified-reporting-aggregator** - Combines analytics from all platforms
- **unified-data-quality-validator** - Validates data consistency across systems
- **platform-instance-manager** - Manages instances/environments for all platforms
- **sfdc-hubspot-bridge** - Bidirectional sync between Salesforce and HubSpot

#### Platform-Specific Agents
- **Salesforce**: `opspal-internal/SFDC/.claude/agents/` - SF-specific operations
- **HubSpot**: `opspal-internal/HS/.claude/agents/` - HS-specific operations
- **Cross-Platform Ops**: `opspal-internal/cross-platform-ops/.claude/agents/` - Bulk operations

### Agent Naming Convention
- **Format**: lowercase-hyphen naming (e.g., `release-coordinator`, not `release_coordinator`)
- **Location**: Project agents in `.claude/agents/`, platform agents in `opspal-internal/*/`, user-wide in `~/.claude/agents/`
- **Extension**: Always `.md` with YAML frontmatter
- **Unified agents**: Prefix with `unified-` for cross-platform agents
- **Platform agents**: Prefix with platform identifier (e.g., `sfdc-`, `hubspot-`)

### Configuration Hierarchy
1. Project scope takes precedence over user scope
2. Settings precedence: Enterprise > CLI flags > `.claude/settings.local.json` > `.claude/settings.json` > `~/.claude/settings.json`
3. MCP servers: Project scope (`.mcp.json`) for shared tools, local scope for personal tools

### Release Workflow Standards
1. **Pre-release Checklist**:
   - All tests passing (`npm test`, `npm run test:integration`)
   - Linting clean (`npm run lint`, `npm run typecheck`)
   - Documentation updated
   - Migration scripts tested (if applicable)
   - Feature flags configured (if applicable)

2. **Release Process**:
   - Tag format: `v{MAJOR}.{MINOR}.{PATCH}` (e.g., v2.1.0)
   - Always create from main/master branch
   - Include comprehensive release notes
   - Notify via Slack webhook after tagging
   - Update dependent projects

3. **Post-release Verification**:
   - Salesforce: Verify metadata deployment
   - HubSpot: Confirm workflow activation
   - Application: Check health endpoints
   - Documentation: Ensure public docs updated

## Platform-Specific Guidelines

### Salesforce (ClaudeSFDC)

#### 🔴 MANDATORY Pre-Deployment Validation (Prevents 80% of Deployment Failures)
```bash
# Run BEFORE every deployment - NO EXCEPTIONS
node opspal-internal/SFDC/scripts/sfdc-pre-deployment-validator.js [org-alias] [deployment-path]
```

**Critical Validation Checks:**
1. **Field History Tracking Limits** (Max 20 fields/object - HARD LIMIT)
   - Query current count before adding tracked fields
   - Deployment WILL FAIL if limit exceeded
   
2. **Picklist Formula Validation** (40% of formula errors)
   - NEVER use `ISBLANK()` on picklist fields → Use `TEXT(field) = ""`
   - NEVER use `ISNULL()` on picklist fields → Use `TEXT(field) = ""`
   
3. **Object Relationship Verification** (20% of requirement errors)
   - ALWAYS confirm: QuoteLineItem vs OpportunityLineItem
   - Verify parent-child relationships exist
   - Check object accessibility in target org

4. **Governor Limit Pre-checks**
   - Field history tracking (20 per object)
   - Validation rules (500 per object)
   - Apex code coverage (75% minimum)

#### Standard Discovery & Deployment Process
- **🚨 ENVIRONMENT-FIRST DISCOVERY**: ALWAYS query the Salesforce org directly before ANY operation
  - Query Lightning Pages: `sf data query --query "SELECT DeveloperName FROM FlexiPage WHERE EntityDefinitionId = '[Object]'" --use-tooling-api`
  - Query Page Layouts: `sf data query --query "SELECT Name FROM Layout WHERE TableEnumOrId = '[Object]'" --use-tooling-api`
  - Check Fields: `sf sobject describe [Object] | jq '.fields[].name'`
  - NEVER rely on local files alone to understand org state
- **Instance-Agnostic Metadata Framework**: All SFDC agents now use zero-hardcoded metadata retrieval
  - Validation Rules: Complete formulas via individual Metadata queries or package.xml retrieval
  - Flows: Entry criteria and trigger types through metadata API
  - Layouts: Field requirements matrix across all record types
  - Profiles: App visibility and record type access analysis
  - Dynamic Discovery: No hardcoded object/field/record type names
- **Metadata Management**: Always use `sf project deploy` with proper package.xml
- **Org Types**: Distinguish between sandbox/production deployments
- **Testing**: Run Apex tests for production deployments
- **Permissions**: Verify profile/permission set updates
- **API Version**: Maintain consistency across metadata (currently v62.0)

#### Migration QA Requirements
- Use template: `templates/salesforce-migration-qa-checklist.md`
- Document ALL assumptions about object relationships
- Get user confirmation on primary objects BEFORE implementation
- Keep rollback scripts ready for every deployment

### HubSpot (ClaudeHubSpot)
- **Property Naming**: Use snake_case for custom properties
- **Workflows**: Test in sandbox before production
- **API Limits**: Respect rate limits (100 requests/10 seconds)
- **Data Sync**: Verify bidirectional sync configurations
- **Contact Management**: Always validate required fields

### Application Code
- **Testing**: Maintain >80% code coverage
- **Dependencies**: Use exact versions in production
- **Environment Variables**: Never commit secrets
- **Logging**: Use structured logging with correlation IDs
- **Error Handling**: Implement circuit breakers for external services

## Subagent Responsibilities

### release-coordinator
- Orchestrates end-to-end release process
- Delegates platform-specific tasks to specialized agents
- Enforces release checklists
- Generates release summaries for stakeholder approval

### claudesfdc
- Manages Salesforce metadata deployments
- Handles org-specific configurations
- Validates APEX code and tests
- Manages permission sets and profiles

### sfdc-metadata-analyzer
- Comprehensive metadata analysis without hardcoded values
- Extracts validation rule formulas and flow entry criteria
- Generates field requirement matrices across layouts
- Creates remediation plans for metadata issues

### sfdc-remediation-executor
- Executes remediation plans from metadata analysis
- Implements phased fixes with rollback capability
- Consolidates flows and standardizes layouts
- Updates validation rules and profile access

### sfdc-quality-auditor
- Continuous quality auditing of Salesforce metadata
- Performs health checks and drift detection
- Validates best practices and security compliance
- Generates quality scores and trend analysis

### claudehubspot
- Configures HubSpot workflows and properties
- Manages API integrations
- Validates data sync configurations
- Handles portal-specific settings


## Environment Configuration

### Required Environment Variables
```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/XXX  # For notifications
SALESFORCE_ORG_ALIAS=production                          # Default SF org
HUBSPOT_PORTAL_ID=12345678                              # HubSpot account
NODE_ENV=production                                      # Environment setting
```

### Optional Configuration
```bash
CLAUDE_CODE_SUBAGENT_MODEL=sonnet    # Stabilize subagent model
USE_BUILTIN_RIPGREP=0                # Use system ripgrep
ENABLE_MODEL_PROXY=false             # Model proxy for multi-model support
```

## Commands & Shortcuts

### Essential Commands
- `/bootstrap` - Initialize or repair project configuration
- `/ship-release` - Execute full release workflow
- `/status` - Check system health and configuration
- `/agents` - List available agents and their status
- `/mcp` - Show MCP server configurations

### Git Operations
- Always pull latest before major operations
- Use conventional commits: `feat:`, `fix:`, `docs:`, `chore:`
- Create feature branches from main/master
- Squash commits when merging to main

## Error Recovery Procedures

### Agent Discovery Issues
1. Run `claude doctor` to check system health
2. Verify ripgrep installation: `which rg`
3. Check agent files exist: `ls -la .claude/agents/`
4. Run `/bootstrap` to recreate missing components

### Slack Notification Failures
1. Verify webhook URL: `echo $SLACK_WEBHOOK_URL`
2. Test webhook: `npm run test:slack`
3. Check hook configuration: `cat .claude/hooks/notify_slack.sh`
4. Review notification logs in `.claude/logs/`

### MCP Server Issues
1. List current servers: `claude mcp list`
2. Restart problematic server: `claude mcp restart <name>`
3. Check server logs: `claude mcp logs <name>`
4. Re-add if necessary: `claude mcp add --scope project <name>`

## Testing Protocols

### Pre-commit Tests
```bash
npm run test          # Unit tests
npm run lint          # Code linting
npm run typecheck     # Type checking
npm run test:e2e      # End-to-end tests
```

### Integration Tests
```bash
npm run test:salesforce    # Salesforce integration
npm run test:hubspot       # HubSpot integration
npm run test:integration   # All integrations
```

## Security Guidelines

### Never Commit
- API keys, tokens, or credentials
- `.env` files with sensitive data
- Customer data or PII
- Internal URLs or endpoints

### Always Encrypt
- Configuration files with secrets
- Database connection strings
- Third-party service credentials
- Webhook URLs and tokens

## Monitoring & Observability

### Health Checks
- Application: `/health` endpoint
- Salesforce: Org limits API
- HubSpot: Portal health API
- Infrastructure: CloudWatch/Datadog

### Alert Thresholds
- Error rate > 1% - Warning
- Error rate > 5% - Critical
- Response time > 2s - Warning
- Response time > 5s - Critical

## Documentation Standards

### Code Documentation
- JSDoc for all public functions
- README in each major directory
- Architecture Decision Records (ADRs) for major changes
- API documentation with examples

### User Documentation
- Step-by-step guides for common tasks
- Troubleshooting guides with solutions
- Video tutorials for complex workflows
- FAQ section maintained quarterly

## Version Management

### Semantic Versioning
- MAJOR: Breaking changes
- MINOR: New features (backward compatible)
- PATCH: Bug fixes (backward compatible)

### Version Sync
- Keep package.json, git tags, and releases in sync
- Update CHANGELOG.md with each release
- Tag Docker images with version numbers
- Update documentation version references

## Team Collaboration

### Code Review Standards
- All code requires peer review
- Security review for authentication changes
- Performance review for database changes
- Documentation review for API changes

### Communication Channels
- Slack: #releases for announcements
- Email: engineering@company.com for critical issues
- Jira: Track all feature work
- Confluence: Maintain runbooks

## Data Integrity Protocol

### 🚨 CRITICAL: Sub-Agent Data Integrity Requirements

**MANDATORY**: All sub-agents MUST follow these data integrity rules to prevent fake data generation.

#### Core Principles
1. **NEVER generate synthetic data** without explicit "SIMULATED DATA" labeling
2. **ALWAYS fail explicitly** when queries cannot be executed
3. **MUST include query metadata** in all data outputs
4. **REQUIRED data source transparency** - every data point must be labeled

#### Pre-Execution Validation
Before any data operation:
```bash
# Run preflight validation
node scripts/preflight-data-validator.js salesforce

# Quick CI/CD check
node scripts/preflight-data-validator.js quick
```

#### Query Execution Requirements
All queries must use the Safe Query Executor:
```javascript
const { SafeQueryExecutor } = require('./scripts/lib/safe-query-executor');
const executor = new SafeQueryExecutor({ enforceRealData: true });
// Will throw error if query fails - never returns fake data
```

#### Data Source Labels (MANDATORY)
- ✅ **VERIFIED**: Live data from actual query
- ⚠️ **SIMULATED**: Explicitly requested example data
- ❌ **FAILED**: Query attempted but failed
- ❓ **UNKNOWN**: Source cannot be determined

#### Post-Execution Validation
Automatic validation hook checks for:
- Generic naming patterns (Lead 1, Opportunity 23)
- Round percentages (15%, 30%, 45%)
- Fake Salesforce IDs (00Q000000000000045)
- Missing query execution evidence

#### Monitoring & Detection
```bash
# Real-time monitoring
node scripts/subagent-error-monitor.js start [agent-name]

# Analyze output for fake data
node scripts/subagent-query-verifier.js analyze [output-file]

# Generate verification report
node scripts/subagent-query-verifier.js report
```

#### Compliance Enforcement
- First violation: Warning with education
- Second violation: Agent disabled pending fix
- Third violation: Complete rewrite required

See `.claude/agents/DATA_SOURCE_REQUIREMENTS.md` for complete requirements.

## Import References
- Salesforce Configuration: @import opspal-internal/SFDC/CLAUDE.md
- HubSpot Configuration: @import opspal-internal/HS/CLAUDE.md
- Release Workflow: @import docs/RELEASE_WORKFLOW.md
- Git Standards: @import docs/GIT_WORKFLOW_OPTIMIZATION.md
- **Agent Usage Examples**: @import .claude/AGENT_USAGE_EXAMPLES.md
- **Agent Organization Pattern**: @import docs/AGENT_ORGANIZATION_PATTERN.md
- **Data Integrity Requirements**: @import .claude/agents/DATA_SOURCE_REQUIREMENTS.md

## Maintenance Schedule

### Daily
- Check error logs
- Verify backup completion
- Review security alerts

### Weekly
- Update dependencies
- Run full test suite
- Review performance metrics

### Monthly
- Security audit
- Documentation review
- Dependency updates
- Team retrospective

---
Last Updated: 2025-09-04
Maintained by: Principal Engineer Agent System