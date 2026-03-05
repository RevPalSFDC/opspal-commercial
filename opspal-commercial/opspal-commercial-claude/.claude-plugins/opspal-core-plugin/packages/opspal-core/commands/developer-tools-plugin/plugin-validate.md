---
description: Validate plugin structure, naming, manifests, and quality standards
argument-hint: "<plugin-directory> [--strict] [--fix]"
---

# Validate Plugin Quality

Comprehensive validation of plugin structure, naming, manifests, and quality standards.

## Task

You are validating a plugin to ensure it meets marketplace quality standards.

**Steps:**

1. **Run the plugin validator**:
   ```bash
   node .claude-plugins/opspal-core-plugin/packages/opspal-core/developer-tools-plugin/scripts/validate-plugin.js <plugin-directory>
   ```

2. **Review the validation report**:
   - Quality score (0-100)
   - Issues by severity (critical, high, medium, low)
   - Detailed remediation steps
   - Overall pass/fail status

3. **Fix issues**:
   - Start with critical issues (blockers)
   - Address high priority issues
   - Plan medium/low priority fixes

4. **Re-validate**:
   - Run validation again after fixes
   - Aim for quality score >= 80 (minimum)
   - Target 90+ for excellent quality

## Usage Examples

### Basic Validation

```bash
# Validate current plugin
node .claude-plugins/opspal-core-plugin/packages/opspal-core/developer-tools-plugin/scripts/validate-plugin.js .

# Validate specific plugin
node .claude-plugins/opspal-core-plugin/packages/opspal-core/developer-tools-plugin/scripts/validate-plugin.js .claude-plugins/opspal-core-plugin/packages/domains/salesforce
```

### JSON Output

For automation/CI/CD:

```bash
node .claude-plugins/opspal-core-plugin/packages/opspal-core/developer-tools-plugin/scripts/validate-plugin.js . --json
```

## Expected Output

```
🔍 Validating Plugin: salesforce-plugin

📊 Validation Summary:
   Plugin: salesforce-plugin
   Version: 3.2.0
   Quality Score: 92/100 (A)

📋 Issues Found (2):

🟡 MEDIUM:
   Script file uses underscore instead of hyphen
      File: scripts/my_script.js
      Fix: Rename to my-script.js

🔵 LOW:
   Description is too short (< 20 chars)
      File: agents/my-agent.md
      Suggestion: Provide a more detailed description

💡 Recommendation: Very good quality - ready for publishing

✅ Plugin validation PASSED
```

## Validation Categories

### 1. Structure Validation
- Required directories exist (.claude-plugin, agents, scripts, README.md)
- No extraneous files
- Proper organization

### 2. Manifest Validation
- All required fields present
- Valid semantic versioning
- Complete author information
- Proper dependency declarations

### 3. Naming Validation
- Plugin name follows convention (lowercase-hyphen-plugin)
- Agent names are consistent
- Script names follow standards

### 4. Agent Validation
- Valid YAML frontmatter
- Required fields present (name, description, tools)
- Valid tool declarations
- Adequate documentation

### 5. Documentation Validation
- README.md exists and complete
- Installation instructions
- Usage examples
- Troubleshooting section

## Quality Score

### Scoring Breakdown

- **95-100 (A+)**: Excellent - best practices followed
- **90-94 (A)**: Very good - ready for publishing
- **85-89 (B+)**: Good - minor improvements recommended
- **80-84 (B)**: Acceptable - fix medium priority issues
- **70-79 (C)**: Needs improvement
- **< 70**: Not ready for publishing

### Point Deductions

- **Critical issue**: -25 points each (blockers)
- **High priority**: -10 points each
- **Medium priority**: -5 points each
- **Low priority**: -2 points each

## Issue Severity Levels

### Critical (🔴) - Blockers
- Missing plugin.json
- Invalid plugin name format
- Missing required manifest fields
- Invalid YAML frontmatter in agents

### High Priority (🟠)
- Missing README.md
- Invalid version format
- Agent naming violations
- Missing author information

### Medium Priority (🟡)
- Script naming violations
- Missing optional sections
- Incomplete agent structure
- Missing .gitignore

### Low Priority (🔵)
- Short descriptions
- Missing optional fields
- Code style issues
- Missing examples

## Integration with CI/CD

### Pre-Commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

echo "Running plugin validation..."
node .claude-plugins/opspal-core-plugin/packages/opspal-core/developer-tools-plugin/scripts/validate-plugin.js .

if [ $? -ne 0 ]; then
  echo "❌ Validation failed. Fix issues before committing."
  exit 1
fi

echo "✅ Validation passed"
```

### GitHub Actions

```yaml
name: Plugin Validation
on: [push, pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Validate Plugin
        run: node scripts/validate-plugin.js .
      - name: Check Quality Score
        run: |
          SCORE=$(node scripts/validate-plugin.js . --json | jq '.qualityScore.score')
          if [ $SCORE -lt 80 ]; then
            echo "Quality score $SCORE is below minimum (80)"
            exit 1
          fi
```

## Troubleshooting

### Low Quality Score

**Symptom**: Score below 80

**Solution**:
1. Review detailed report for specific issues
2. Fix critical issues first (blockers)
3. Address high priority issues
4. Re-validate and iterate

### Invalid Plugin Name

**Symptom**: "Plugin name doesn't follow convention"

**Solution**:
- Must end with `-plugin`
- Use lowercase with hyphens only
- Example: `SalesforcePlugin` → `salesforce-plugin`

### Agent Validation Failures

**Symptom**: "Missing YAML frontmatter"

**Solution**:
- Add frontmatter to agent files:
  ```markdown
  ---
  name: agent-name
  description: Agent description (20+ chars)
  tools: Read, Write, TodoWrite
  ---
  ```

### Dependency Issues

**Symptom**: "CLI dependency missing check command"

**Solution**:
- Add check field to dependencies:
  ```json
  {
    "dependencies": {
      "cli": {
        "sf": {
          "version": ">=2.0.0",
          "check": "sf --version",
          "install": "npm install -g @salesforce/cli",
          "required": true
        }
      }
    }
  }
  ```

## Best Practices

1. **Validate early and often**
   - Before every commit
   - After adding new agents
   - Before publishing

2. **Target high quality**
   - Minimum: 80/100 (B)
   - Recommended: 90/100 (A)
   - Excellent: 95/100 (A+)

3. **Fix by priority**
   - Critical first (blockers)
   - High priority before publishing
   - Medium/low as time allows

4. **Automate validation**
   - Pre-commit hooks
   - CI/CD pipelines
   - Regular quality checks

## Notes

- Validation is required before publishing plugins
- Quality score >= 80 is minimum for marketplace
- Critical issues block publishing
- Reports are saved for tracking trends
- JSON output available for automation

Remember: High quality plugins provide better user experience and reduce support burden!
