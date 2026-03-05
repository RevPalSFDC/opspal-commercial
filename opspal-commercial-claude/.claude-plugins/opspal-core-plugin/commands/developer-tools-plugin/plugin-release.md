---
name: plugin-release
description: Release Plugin Version with Slack Notification
---

Release a plugin version with automated workflow:
- Version updates in plugin.json and marketplace.json
- CHANGELOG validation
- Git tagging and pushing
- GitHub release creation
- Slack team notification
- Marketplace catalog regeneration

Usage:
```bash
# Full automated release
/plugin-release salesforce-plugin v3.5.0

# Skip Slack notification
/plugin-release hubspot-plugin v1.1.0 --skip-slack

# Skip tests (not recommended)
/plugin-release developer-tools-plugin v2.1.0 --skip-tests

# Test workflow without GitHub
/plugin-release cross-platform-plugin v1.2.0 --skip-github
```

The command will:
1. ✅ Run pre-release validation tests
2. ✅ Update version in plugin.json
3. ✅ Update marketplace.json entry
4. ✅ Verify CHANGELOG.md has release notes
5. ✅ Regenerate marketplace catalog
6. ✅ Commit version updates
7. ✅ Create and push git tag
8. ✅ Create GitHub release with notes
9. ✅ Send Slack notification to team
10. ✅ Report success or errors

Release Tag Format: `{plugin-name}-v{version}`
Example: `salesforce-plugin-v3.5.0`

Prerequisites:
- CHANGELOG.md updated with release notes
- All tests passing
- SLACK_WEBHOOK_URL configured in .env (optional)
- GitHub CLI (`gh`) authenticated for releases

Troubleshooting:
- If tests fail, fix issues before releasing
- If tag exists, delete with: `git tag -d {plugin}-{version}`
- If Slack fails, notification is skipped (non-blocking)
- If GitHub fails, check: `gh auth status`

Examples:
```bash
# Release salesforce-plugin
/plugin-release salesforce-plugin v3.5.0

# Release with custom message
/plugin-release hubspot-plugin v1.1.0 --message="Added new workflow features"

# Test notification only (set --skip-github --skip-tests)
/plugin-release test-plugin v0.1.0 --skip-github --skip-tests
```
