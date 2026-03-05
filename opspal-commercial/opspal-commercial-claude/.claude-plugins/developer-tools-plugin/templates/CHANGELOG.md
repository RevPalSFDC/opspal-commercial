# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- New features that have been added

### Changed
- Changes in existing functionality

### Deprecated
- Soon-to-be removed features

### Removed
- Removed features

### Fixed
- Bug fixes

### Security
- Security fixes and improvements

---

## [{VERSION}] - {YYYY-MM-DD}

### Added
- {Detailed description of new feature}
- {Another new feature}

**Impact**: {Who benefits and how}

**Migration**: {Steps to adopt if needed}

**Example**:
```bash
{Usage example}
```

### Changed
- {What changed in existing functionality}

**Breaking Change**: {Yes/No - if Yes, explain}

**Migration**: {How to update existing code/config}

### Deprecated
- **{feature}**: Will be removed in {version}. Use {alternative} instead.

**Migration Timeline**:
- {version}: Deprecation warning added
- {version}: Compatibility layer provided
- {version}: Feature removed

### Removed
- **{feature}**: {Why it was removed}

**Alternative**: Use {new-feature} instead

**Migration**:
```bash
# Old way (removed)
{old-command}

# New way
{new-command}
```

### Fixed
- **Issue**: {What was broken}
- **Symptom**: {User-visible behavior}
- **Fix**: {What was changed}
- **Impact**: {Who was affected}

### Security
- **Vulnerability**: {CVE or description}
- **Severity**: {Critical/High/Medium/Low}
- **Fix**: {What was changed}
- **Action Required**: {What users need to do}

---

## [{PREVIOUS_VERSION}] - {YYYY-MM-DD}

{Repeat structure above}

---

## Version History Summary

| Version | Date | Type | Highlights |
|---------|------|------|------------|
| {VERSION} | {DATE} | {Major/Minor/Patch} | {Brief 1-line summary} |
| {VERSION} | {DATE} | {Major/Minor/Patch} | {Brief 1-line summary} |

---

## Upgrade Path

### From {OLD_VERSION} to {NEW_VERSION}

1. **Backup**: {What to backup before upgrading}
2. **Breaking Changes**: {List of breaking changes}
3. **Migration Steps**:
   ```bash
   {Step-by-step migration commands}
   ```
4. **Verification**:
   ```bash
   {How to verify upgrade succeeded}
   ```
5. **Rollback** (if needed):
   ```bash
   {How to rollback to previous version}
   ```

---

## Contributing

When adding entries to this changelog:

1. **Add to Unreleased section first**
2. **Use present tense** ("Add feature" not "Added feature")
3. **Include impact statement** (who benefits, how much time saved, etc.)
4. **Provide examples** for new features and breaking changes
5. **Link to issues/PRs** when applicable: `(#123)`, `[#123](url)`
6. **Document migrations** for breaking changes
7. **Move to versioned section** when releasing

## Changelog Types

- **Added**: New features, commands, agents, scripts
- **Changed**: Modifications to existing functionality
- **Deprecated**: Features being phased out (but still work)
- **Removed**: Features that no longer exist
- **Fixed**: Bug fixes
- **Security**: Security-related fixes

## Impact Statements

Every significant change should include an impact statement:

- **Time Saved**: "Reduces audit time from 2 hours to 15 minutes"
- **Cost Savings**: "Eliminates $5,000/year in manual work"
- **Quality**: "Prevents 80% of deployment failures"
- **User Experience**: "Reduces steps from 10 to 3"

---

**Note**: Documentation-only changes should be noted in the documentation section of each release, but typically don't warrant a version bump unless they're substantial improvements to USAGE.md or other user-facing docs.
