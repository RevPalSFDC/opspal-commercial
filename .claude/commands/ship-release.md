---
description: Execute full release workflow with automated validation, tagging, and notifications
allowed-tools: Bash, Read, Write, Task, TodoWrite, Grep
---

# Ship Release Command

Orchestrates the complete release process including validation, tagging, GitHub release creation, and Slack notifications.

## What This Command Does

1. **Pre-Release Validation**:
   - Runs test suite (`npm test`)
   - Performs linting (`npm run lint`)
   - Type checking (`npm run typecheck`)
   - Verifies git status is clean

2. **Version Management**:
   - Determines appropriate version bump (major/minor/patch)
   - Updates package.json version
   - Generates or updates CHANGELOG.md
   - Creates git tag with semantic version

3. **Release Publication**:
   - Creates GitHub release with notes
   - Attaches relevant artifacts
   - Publishes to npm (if applicable)
   - Updates documentation

4. **Notifications**:
   - Sends Slack notification with release details
   - Updates team dashboards
   - Triggers downstream deployments
   - Notifies stakeholders

5. **Post-Release**:
   - Monitors deployment metrics
   - Validates production health
   - Creates rollback plan
   - Documents release

## Usage

### Basic Release
```bash
/ship-release
```
Automatically determines version and executes standard release.

### Specific Version Release
```bash
/ship-release --version=2.1.0
```
Uses specified version number.

### Project-Specific Release
```bash
/ship-release --project=ClaudeSFDC
```
Releases a specific sub-project.

### Options
- `--version`: Specify exact version (e.g., 2.1.0)
- `--project`: Target project (ClaudeSFDC, ClaudeHubSpot, main)
- `--skip-tests`: Skip test execution (not recommended)
- `--skip-slack`: Skip Slack notification
- `--hotfix`: Fast-track hotfix release
- `--dry-run`: Preview without executing

## Release Process

### 1. Preparation Phase
```bash
# Check current version
current_version=$(jq -r .version package.json)

# Analyze commits since last release
git log --oneline HEAD...v$current_version

# Determine version bump
# MAJOR: Breaking changes
# MINOR: New features
# PATCH: Bug fixes
```

### 2. Validation Phase
```bash
# Run all tests
npm test
npm run test:integration

# Lint and type check
npm run lint
npm run typecheck

# Security audit
npm audit
```

### 3. Release Creation
```bash
# Update version
npm version $new_version

# Create tag
git tag -a v$new_version -m "Release v$new_version"

# Push to remote
git push origin main --tags

# Create GitHub release
gh release create v$new_version \
  --title "Release v$new_version" \
  --notes-file CHANGELOG.md
```

### 4. Notification
```bash
# Send Slack notification
node scripts/send-slack-notification.js $new_version $project

# Update status dashboards
curl -X POST $DASHBOARD_WEBHOOK \
  -d "{\"version\": \"$new_version\", \"status\": \"released\"}"
```

## Delegation to Agents

The ship-release command delegates to:
- `release-coordinator`: Orchestrates the release process
- `claudesfdc`: Handles Salesforce deployments
- `claudehubspot`: Manages HubSpot updates
- `quality-auditor`: Validates release quality

## Quality Gates

Release blocked if:
- ❌ Tests failing
- ❌ Lint errors present
- ❌ Type errors detected
- ❌ Security vulnerabilities (high/critical)
- ❌ Uncommitted changes
- ❌ No CHANGELOG entry

## Rollback Procedure

If issues detected post-release:
```bash
# Revert to previous version
git revert HEAD
git tag -f v$current_version
git push --force-with-lease origin v$current_version

# Notify team
echo "⚠️ Rollback initiated for v$new_version" | \
  curl -X POST $SLACK_WEBHOOK

# Re-deploy previous version
./scripts/deploy.sh v$previous_version
```

## Environment Requirements

Required environment variables:
```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/XXX
GITHUB_TOKEN=ghp_xxx
NPM_TOKEN=npm_xxx  # If publishing to npm
```

## Project Configurations

### ClaudeSFDC
- Validates Salesforce metadata
- Runs APEX tests
- Deploys to sandbox first
- Requires 75% code coverage

### ClaudeHubSpot
- Validates workflow configurations
- Tests API integrations
- Updates portal settings
- Verifies webhook endpoints

### Main (RevPal Agents)
- Updates all agent configurations
- Syncs documentation
- Validates MCP servers
- Tests command availability

## Important Notes

- Always run from project root directory
- Ensure clean git working directory
- Verify environment variables are set
- Test in staging before production
- Document all release decisions
- Maintain rollback capability
- Monitor post-release metrics