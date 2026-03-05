---
description: Manage plugin versioning, git tagging, and marketplace publishing
argument-hint: "<plugin-name> --bump <patch|minor|major> [--tag] [--push]"
---

# Publish Plugin Version

Manage plugin versioning, release preparation, git tagging, and marketplace publishing with automated changelog generation and pre-release validation.

## Task

You are managing the complete plugin publishing lifecycle including version bumping, validation, documentation updates, git operations, and marketplace catalog synchronization.

## Quick Start

### Publish Patch Release (Bug Fix)

```bash
# Interactive (invokes plugin-publisher agent)
User: "Publish a patch release for my-plugin"

# Or use script directly
node .claude-plugins/opspal-core-plugin/packages/opspal-core/developer-tools-plugin/scripts/version-manager.js \
  --plugin my-plugin \
  --bump patch \
  --message "Bug fixes and improvements" \
  --push
```

### Publish Minor Release (New Features)

```bash
# Bump minor version
node .claude-plugins/opspal-core-plugin/packages/opspal-core/developer-tools-plugin/scripts/version-manager.js \
  --plugin my-plugin \
  --bump minor \
  --message "New features: agent-quality-analyzer, plugin-documenter" \
  --push
```

### Publish Major Release (Breaking Changes)

```bash
# Bump major version
node .claude-plugins/opspal-core-plugin/packages/opspal-core/developer-tools-plugin/scripts/version-manager.js \
  --plugin my-plugin \
  --bump major \
  --message "Breaking changes: removed deprecated APIs" \
  --push
```

## Script Options

```bash
# Version bumping
node version-manager.js --plugin <name> --bump <major|minor|patch>

# Set specific version
node version-manager.js --plugin <name> --version 2.0.0

# Pre-release versions
node version-manager.js --plugin <name> --prerelease alpha.1
node version-manager.js --plugin <name> --prerelease beta.1
node version-manager.js --plugin <name> --prerelease rc.1

# Promote pre-release to production
node version-manager.js --plugin <name> --promote

# Rollback to previous version
node version-manager.js --plugin <name> --rollback v1.2.0

# Options
--message <msg>      # Commit message
--push               # Push to remote automatically
--dry-run            # Preview changes without applying
--no-git             # Skip git operations
--no-changelog       # Skip CHANGELOG update
--force              # Force non-sequential version
```

## Automated Workflow

The version manager performs these steps automatically:

### 1. Version Validation
- Validates semantic versioning format (MAJOR.MINOR.PATCH)
- Ensures version sequence is valid (new > old)
- Checks for version conflicts

### 2. File Updates
Updates version across multiple files:
- ✅ `plugin.json` - Plugin version
- ✅ `marketplace.json` - Marketplace catalog entry
- ✅ `CHANGELOG.md` - Adds new version entry
- ✅ `README.md` - Updates version references

### 3. Git Operations
- Stages all changes
- Creates commit with conventional message
- Tags commit with version (v1.2.3)
- Optionally pushes to remote

### 4. Rollback Support
If any step fails:
- Automatically reverts file changes
- Deletes created tags
- Restores original state

## Semantic Versioning Rules

### MAJOR (X.0.0) - Breaking Changes
When to use:
- Removed agents or features
- Changed agent interfaces (tools, responsibilities)
- Incompatible dependency updates
- Changed command-line interfaces

Example:
```bash
node version-manager.js --plugin my-plugin --bump major \
  --message "BREAKING: Removed deprecated agents, changed tool requirements"
```

### MINOR (x.Y.0) - New Features
When to use:
- New agents added
- New features (backward compatible)
- New scripts or commands
- Enhanced functionality

Example:
```bash
node version-manager.js --plugin my-plugin --bump minor \
  --message "Added agent-quality-analyzer and plugin-documenter agents"
```

### PATCH (x.x.Z) - Bug Fixes
When to use:
- Bug fixes
- Documentation updates
- Performance improvements
- Security patches (non-breaking)

Example:
```bash
node version-manager.js --plugin my-plugin --bump patch \
  --message "Fixed validation issues, updated documentation"
```

## Pre-Release Versions

### Alpha (1.0.0-alpha.1)
Early development, incomplete features:
```bash
node version-manager.js --plugin my-plugin --prerelease alpha.1
```

### Beta (1.0.0-beta.1)
Feature-complete, testing phase:
```bash
node version-manager.js --plugin my-plugin --prerelease beta.1
```

### Release Candidate (1.0.0-rc.1)
Production-ready candidate:
```bash
node version-manager.js --plugin my-plugin --prerelease rc.1
```

### Promote to Production
```bash
node version-manager.js --plugin my-plugin --promote
# Converts 1.0.0-rc.1 → 1.0.0
```

## Pre-Release Checklist

Before publishing, ensure:

1. **Validation Passes**:
   ```bash
   /plugin-validate my-plugin
   ```

2. **Quality Scores Meet Threshold**:
   ```bash
   node scripts/analyze-agent-quality.js --plugin my-plugin --threshold 70
   ```

3. **Documentation Updated**:
   ```bash
   node scripts/generate-readme.js --plugin my-plugin
   ```

4. **Tests Pass** (if available):
   ```bash
   npm test
   ```

5. **Dependencies Met**:
   ```bash
   /check-deps
   ```

## CHANGELOG Format

Automated CHANGELOG entries follow Keep a Changelog format:

```markdown
## [2.1.0] - 2025-10-10

### Added
- New agent-quality-analyzer agent with 5-category scoring
- Automated README generation via plugin-documenter
- Pre-release version support (alpha, beta, rc)

### Changed
- Updated validation thresholds from 60 to 70
- Improved error messages in version-manager

### Fixed
- Resolved YAML parsing issue in agent-validator
- Fixed marketplace.json sync bug

### Security
- Updated dependency X to patch CVE-2025-1234
```

## Dry Run Mode

Preview changes before applying:

```bash
node version-manager.js --plugin my-plugin --bump minor --dry-run
```

Output:
```
Current version: 1.0.0
New version: 1.1.0

🏃 DRY RUN - No changes will be made

Changes that would be made:

1. plugin.json
   version: "1.0.0" → "1.1.0"

2. marketplace.json
   plugins[].version: "1.0.0" → "1.1.0"

3. CHANGELOG.md
   Add entry for [1.1.0]

4. README.md
   Update version references

5. Git operations
   - Stage changes
   - Commit: "chore: Release v1.1.0"
   - Tag: v1.1.0
```

## Rollback

If a release has issues, rollback to previous version:

```bash
# Rollback to specific tag
node version-manager.js --plugin my-plugin --rollback v1.2.0

# What it does:
# - Restores files from git tag
# - Updates plugin.json and marketplace.json
# - Does NOT delete the bad tag (manual cleanup)
```

## Integration Examples

### Pre-Commit Hook

```bash
#!/bin/bash
# .claude-plugins/my-plugin/hooks/pre-commit-version.sh

CHANGED=$(git diff --cached --name-only | grep "plugin.json")

if [ -n "$CHANGED" ]; then
  OLD_VERSION=$(git show HEAD:plugin.json | jq -r '.version')
  NEW_VERSION=$(jq -r '.version' plugin.json)

  if [ "$OLD_VERSION" = "$NEW_VERSION" ]; then
    echo "❌ plugin.json changed but version not bumped"
    echo "   Run: node scripts/version-manager.js --plugin $(basename $(pwd)) --bump [major|minor|patch]"
    exit 1
  fi
fi
```

### CI/CD Release Pipeline

```yaml
# .github/workflows/release.yml
name: Release Plugin

on:
  push:
    tags:
      - 'v*.*.*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Extract Plugin Name
        id: plugin
        run: echo "name=my-plugin" >> $GITHUB_OUTPUT

      - name: Validate Plugin
        run: |
          node scripts/validate-plugin.js ${{ steps.plugin.outputs.name }} --threshold 70

      - name: Check Quality
        run: |
          node scripts/analyze-agent-quality.js --plugin ${{ steps.plugin.outputs.name }} --threshold 70

      - name: Create Release
        uses: actions/create-release@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tag_name: ${{ github.ref }}
          release_name: Release ${{ github.ref }}
```

## Troubleshooting

### Issue: "Version not sequential"
**Problem**: Trying to set version lower than current

**Solution**:
```bash
# Check current version
jq '.version' .claude-plugins/my-plugin/plugin.json

# Use --force to override (careful!)
node version-manager.js --plugin my-plugin --version 1.0.0 --force
```

### Issue: "Git tag already exists"
**Problem**: Tag v1.2.0 already exists

**Solution**:
```bash
# Delete local tag
git tag -d v1.2.0

# Delete remote tag
git push origin :refs/tags/v1.2.0

# Re-run version manager
node version-manager.js --plugin my-plugin --bump patch
```

### Issue: Marketplace.json not updating
**Problem**: Marketplace still shows old version

**Solution**:
```bash
# Verify plugin name matches exactly
jq '.plugins[] | select(.name=="my-plugin") | .version' .claude-plugin/marketplace.json

# Check file permissions
ls -la .claude-plugin/marketplace.json

# Manually verify after running script
```

### Issue: CHANGELOG entry not generated
**Problem**: CHANGELOG.md doesn't have new entry

**Solution**:
```bash
# Ensure CHANGELOG.md exists
touch .claude-plugins/my-plugin/CHANGELOG.md

# Add header if new file
echo "# Changelog\n\nAll notable changes to this project will be documented in this file.\n" > CHANGELOG.md

# Re-run version manager
node version-manager.js --plugin my-plugin --bump patch
```

## Best Practices

1. **Always Dry Run First**: Use `--dry-run` to preview changes
2. **Validate Before Publishing**: Run validation and quality checks
3. **Write Clear Messages**: Use descriptive commit messages
4. **Test Pre-Releases**: Use alpha/beta/rc for major changes
5. **Document Breaking Changes**: Provide migration guides for major versions
6. **Keep CHANGELOG Updated**: Every release should have clear notes
7. **Tag Consistently**: Always use v prefix (v1.2.3)
8. **Push After Verification**: Review changes locally before `--push`

## Version History Tracking

### View Version Timeline

```bash
# Show all release tags
git tag -l --sort=-version:refname

# Show with dates
git tag -l --sort=-version:refname --format='%(refname:short) %(creatordate:short)'

# Count releases
git tag -l | grep -c '^v[0-9]'
```

### Compare Versions

```bash
# See changes between versions
git diff v1.0.0..v2.0.0 -- .claude-plugins/my-plugin

# See commit log
git log v1.0.0..v2.0.0 --oneline -- .claude-plugins/my-plugin
```

## References

- [Semantic Versioning Specification](https://semver.org/)
- [Keep a Changelog](https://keepachangelog.com/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [plugin-publisher Agent](../agents/plugin-publisher.md)

---

**Version Manager v2.0.0** - Automated plugin publishing for OpsPal Plugin Marketplace
