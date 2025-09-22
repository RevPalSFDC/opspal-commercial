# Release Workflow Documentation

## Overview

This document describes the unified release management system for all projects in the RevPal Agents ecosystem, including ClaudeHubSpot, ClaudeSFDC, and the main Agents repository.

## Prerequisites

### Required Tools
- Git (configured with push access)
- GitHub CLI (`gh`) - authenticated
- Node.js 14+ 
- Bash shell

### Configuration
1. **Environment File**: Ensure `.env` exists with:
```bash
SLACK_WEBHOOK_URL=your-webhook-url
```

2. **GitHub Authentication**: 
```bash
gh auth login
```

## Release Process

### Quick Release (Recommended)

Use the unified release script for any project:

```bash
# For ClaudeHubSpot
./scripts/publish-release.sh --project=ClaudeHubSpot --version=v2.1.0

# For ClaudeSFDC
./scripts/publish-release.sh --project=ClaudeSFDC --version=v2.1.0

# For main Agents repository
./scripts/publish-release.sh --project=main --version=v2.1.0
```

This single command will:
1. ✅ Create and push git tag
2. ✅ Create GitHub release with notes
3. ✅ Send Slack notification
4. ✅ Validate changelog exists

### Manual Release Steps

If you prefer manual control:

#### 1. Update CHANGELOG.md
```markdown
## [2.1.0] - 2025-01-03

### Added
- New feature description

### Changed
- Updated functionality

### Fixed
- Bug fixes
```

#### 2. Create Git Tag
```bash
cd ProjectDirectory
git tag -a v2.1.0 -m "Release v2.1.0 - Brief description"
git push origin v2.1.0
```

#### 3. Create GitHub Release
```bash
gh release create v2.1.0 \
  --title "v2.1.0 - Feature Name" \
  --notes "Release notes content"
```

#### 4. Send Slack Notification
```bash
node scripts/send-slack-notification.js v2.1.0 "ProjectName"
```

## Using the Release Coordinator Agent

The release-coordinator agent can handle releases automatically:

```yaml
Task: release-coordinator
Description: "Publish v2.1.0 release for ClaudeHubSpot with Slack notification"
```

The agent will execute the unified release script and handle all steps.

## Slack Notifications

### Format
Notifications include:
- Version number and project name
- Key features or changes
- Quick start commands
- Links to GitHub releases
- Action buttons for quick access

### Testing Notifications
Test without creating a release:
```bash
# Test notification only
node scripts/send-slack-notification.js v2.1.0 "Test Project"

# Test workflow without GitHub
./scripts/publish-release.sh --project=ClaudeHubSpot --version=test-v1 --skip-github
```

### Customizing Messages
Edit the notification by passing custom version:
```bash
node scripts/send-slack-notification.js v3.0.0 "Custom Project Name"
```

## Command Options

### publish-release.sh Options
```bash
--project=NAME      # Required: ClaudeHubSpot, ClaudeSFDC, or main
--version=VERSION   # Required: Version tag (e.g., v2.1.0)
--message=MESSAGE   # Optional: Custom release message
--skip-slack        # Skip Slack notification
--skip-github       # Skip GitHub release creation
--help             # Show usage information
```

## Troubleshooting

### Common Issues

#### Slack Notification Not Sending
1. Check `.env` file exists with correct webhook URL
2. Verify webhook URL is valid and not expired
3. Test with: `curl -X POST -H 'Content-type: application/json' --data '{"text":"Test"}' YOUR_WEBHOOK_URL`

#### GitHub Release Fails
1. Ensure `gh` is authenticated: `gh auth status`
2. Verify you have push access to repository
3. Check if tag already exists: `git tag -l`

#### Script Not Found
1. Ensure you're in the Agents root directory
2. Check script permissions: `chmod +x scripts/*.sh`
3. Use relative path: `./scripts/publish-release.sh`

#### Tag Already Exists
1. Delete local tag: `git tag -d v2.1.0`
2. Delete remote tag: `git push origin :refs/tags/v2.1.0`
3. Recreate with new message

## Version Naming Convention

Follow semantic versioning:
- **Major (X.0.0)**: Breaking changes, major features
- **Minor (x.Y.0)**: New features, backward compatible
- **Patch (x.y.Z)**: Bug fixes, minor improvements

Examples:
- `v2.0.0` - Major feature (Multi-model AI)
- `v2.1.0` - New feature addition
- `v2.1.1` - Bug fix release

## Best Practices

1. **Always Update CHANGELOG**: Document changes before release
2. **Test First**: Use `--skip-github` to test notifications
3. **Consistent Messaging**: Use clear, descriptive release titles
4. **Semantic Versioning**: Follow version conventions
5. **Review Before Release**: Check git diff and status

## Integration with CI/CD

The release scripts can be integrated into GitHub Actions:

```yaml
- name: Publish Release
  run: |
    ./scripts/publish-release.sh \
      --project=${{ env.PROJECT }} \
      --version=${{ github.ref_name }}
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Security Notes

- **Never commit `.env` file** - It's in .gitignore
- **Use GitHub Secrets** for CI/CD webhook URLs
- **Rotate webhooks** periodically for security
- **Limit webhook permissions** to specific channels

## Quick Reference Card

```bash
# Release v2.1.0 for ClaudeHubSpot
./scripts/publish-release.sh --project=ClaudeHubSpot --version=v2.1.0

# Release without Slack
./scripts/publish-release.sh --project=ClaudeSFDC --version=v2.1.0 --skip-slack

# Test notification only
node scripts/send-slack-notification.js v2.1.0 "ClaudeHubSpot"

# Show help
./scripts/publish-release.sh --help
```

---

**Remember**: The v2.0.0 notification has already been sent. For future releases, use this documented workflow.