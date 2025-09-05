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
- **🚨 ENVIRONMENT-FIRST DISCOVERY**: ALWAYS query the Salesforce org directly before ANY operation
  - Query Lightning Pages: `sf data query --query "SELECT DeveloperName FROM FlexiPage WHERE EntityDefinitionId = '[Object]'" --use-tooling-api`
  - Query Page Layouts: `sf data query --query "SELECT Name FROM Layout WHERE TableEnumOrId = '[Object]'" --use-tooling-api`
  - Check Fields: `sf sobject describe [Object] | jq '.fields[].name'`
  - NEVER rely on local files alone to understand org state
- **Metadata Management**: Always use `sf project deploy` with proper package.xml
- **Org Types**: Distinguish between sandbox/production deployments
- **Testing**: Run Apex tests for production deployments
- **Permissions**: Verify profile/permission set updates
- **API Version**: Maintain consistency across metadata (currently v62.0)

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