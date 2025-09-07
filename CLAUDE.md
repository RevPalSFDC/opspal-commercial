# RevPal Agent System - Project Memory

## Project Overview
This is the RevPal Agent System, a comprehensive Claude Code configuration for managing multi-platform releases across Salesforce, HubSpot, and custom applications. The system uses specialized subagents for platform-specific operations and a principal engineer agent for orchestration.

## Critical Rules & Conventions

### Routing & Delegation Rules

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

### 🧠 Complexity-Based Routing (Sequential Thinking MCP)

The system now uses **automatic complexity assessment** to determine when to engage Sequential Thinking MCP:

#### Always Use Sequential Thinking (HIGH Complexity > 0.7):
- Cross-platform releases involving 3+ systems
- Salesforce metadata deployments with 10+ objects
- Circular dependency resolution
- Production deployments with breaking changes
- Multi-stage data migrations (>10,000 records)
- Full org metadata comparisons

#### Conditional Sequential Thinking (MEDIUM Complexity 0.3-0.7):
- 3-10 object modifications
- Workflow creation with 5+ steps
- Permission restructuring
- Integration setup
- Uses Sequential if: unknown scope, production impact, or rollback needed

#### Direct Execution (SIMPLE Complexity < 0.3):
- Single field creation
- Basic SOQL queries
- Documentation updates
- Single record operations
- Configuration changes

#### User Control Flags:
- `[PLAN_CAREFULLY]` or `[SEQUENTIAL]` - Force Sequential Thinking
- `[QUICK_MODE]` or `[DIRECT]` - Skip Sequential Thinking

### Routing & Delegation (Coordinator)

- Use **project-orchestrator** for multi-repo planning; it delegates work.
- Use **project-auditor** to assess a specific project path (writes report in ./reports).
- Use **agent-auditor** only when auditing the current directory.
- Use **patch-smith** to generate patch bundles (./reports/patches); never writes into children.
- Use **mcp-guardian** to validate tool ↔ MCP server alignment.
- Use **router-doctor** to find project vs user-scope agent collisions.
- Use **docs-keeper** to propose documentation and roster updates (diffs only).

### Agent Naming Convention
- **Format**: lowercase-hyphen naming (e.g., `release-coordinator`, not `release_coordinator`)
- **Location**: Project agents in `.claude/agents/`, user-wide in `~/.claude/agents/`
- **Extension**: Always `.md` with YAML frontmatter

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
node scripts/sfdc-pre-deployment-validator.js [org-alias] [deployment-path]
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

## Import References
- Salesforce Configuration: @import ClaudeSFDC/CLAUDE.md
- HubSpot Configuration: @import ClaudeHubSpot/CLAUDE.md  
- Release Workflow: @import documentation/RELEASE_WORKFLOW.md
- Git Standards: @import documentation/GIT_WORKFLOW_OPTIMIZATION.md

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