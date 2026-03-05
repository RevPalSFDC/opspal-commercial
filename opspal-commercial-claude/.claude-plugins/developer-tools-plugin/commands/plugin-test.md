---
description: Run comprehensive integration tests for plugin installation and functionality
argument-hint: "<plugin-name> [--level all|1|2|3|4|5]"
---

# Test Plugin Integration

Run comprehensive integration tests for plugin installation, agent discovery, functionality validation, and dependency checking with automated reporting.

## Task

You are running integration tests across 5 levels to ensure plugins work correctly from installation through production usage.

## Quick Start

### Run Complete Test Suite

```bash
# Interactive (invokes plugin-integration-tester agent)
User: "Test the my-plugin plugin"

# Or use script directly
node .claude-plugins/developer-tools-plugin/scripts/test-plugin-installation.js \
  --plugin my-plugin \
  --level all
```

### Run Fast Tests Only

```bash
# Quick validation (Level 1-2, ~5 seconds)
node .claude-plugins/developer-tools-plugin/scripts/test-plugin-installation.js \
  --plugin my-plugin \
  --quick
```

### Run Before Release

```bash
# Full suite with quality threshold
node .claude-plugins/developer-tools-plugin/scripts/test-plugin-installation.js \
  --plugin my-plugin \
  --level all \
  --threshold 90 \
  --json > test-report.json
```

## Script Options

```bash
# Basic usage
node test-plugin-installation.js --plugin <name>

# Specific test levels (1-5, comma-separated)
node test-plugin-installation.js --plugin <name> --level 1,2,3

# All levels
node test-plugin-installation.js --plugin <name> --level all

# Quick mode (Level 1-2 only)
node test-plugin-installation.js --plugin <name> --quick

# Verbose output
node test-plugin-installation.js --plugin <name> --verbose

# JSON output
node test-plugin-installation.js --plugin <name> --json > report.json

# Set pass threshold
node test-plugin-installation.js --plugin <name> --threshold 90
```

## Test Levels

### Level 1: Structure Tests (Fast ~2s)
Basic file structure and naming validation:
- ✅ Plugin directory exists
- ✅ plugin.json exists and valid
- ✅ Required directories present (agents/, scripts/, commands/)
- ✅ Naming conventions followed (lowercase-hyphen-plugin)
- ✅ File permissions correct (scripts executable)
- ✅ No extraneous files (node_modules, .DS_Store)
- ✅ README.md exists
- ✅ .gitignore exists

**When to run**: Every commit, pre-commit hook

### Level 2: Discovery Tests (Fast ~3s)
Agent and command discovery:
- ✅ All agents discoverable
- ✅ Agent names unique (no duplicates)
- ✅ Agent naming conventions (lowercase-hyphen.md)
- ✅ Commands discoverable
- ✅ Scripts discoverable
- ✅ No naming conflicts with other plugins
- ✅ Marketplace integration (appears in marketplace.json)

**When to run**: Every commit, before push

### Level 3: Functionality Tests (Medium ~10s)
Basic functionality validation:
- ✅ Agent YAML frontmatter valid (all required fields)
- ✅ Agent descriptions present (20+ characters)
- ✅ Agent tools valid (only recognized tools)
- ✅ Scripts executable (chmod +x applied)
- ✅ Commands have documentation
- ✅ Dependencies declared in plugin.json

**When to run**: Before creating PR, daily builds

### Level 4: Integration Tests (Slow ~30s)
Full integration scenarios:
- ✅ Plugin validates successfully (via plugin-validator)
- ✅ Dependencies available (CLI tools, system packages)
- ✅ No circular dependencies

**When to run**: Before release, weekly regression

### Level 5: Regression Tests (Slow ~20s)
Historical compatibility:
- ✅ Historical scenarios still pass
- ✅ No breaking changes detected
- ✅ Migration paths work

**When to run**: Before major releases

## Output Format

### Console Output

```
🧪 Testing plugin: my-plugin v2.0.0

📋 Level 1: Structure Tests
  ✅ Plugin directory exists
  ✅ plugin.json exists
  ✅ plugin.json is valid JSON
  ✅ Required directories present
  ✅ Naming conventions followed
  ✅ File permissions correct
  ✅ No extraneous files
  ✅ README.md exists
  ⚠️  .gitignore not found
  8/9 tests passed (89%)

🔍 Level 2: Discovery Tests
    Found 5 agent(s)
    Found 6 command(s)
    Found 4 script(s)
  ✅ Agents discoverable
  ✅ Agent names unique
  ✅ Agent naming conventions
  ✅ Commands discoverable
  ✅ Scripts discoverable
  ✅ No naming conflicts
  ✅ Marketplace integration
  7/7 tests passed (100%)

⚙️  Level 3: Functionality Tests
  ✅ Agent YAML frontmatter valid
  ✅ Agent descriptions present
  ✅ Agent tools valid
  ✅ Scripts executable
  ✅ Commands have documentation
  ⚠️  No dependencies declared
  5/6 tests passed (83%)

🔗 Level 4: Integration Tests
  ✅ Plugin validates successfully
  ⚠️  Missing dependencies: jq
  ✅ No circular dependencies
  2/3 tests passed (67%)

🔄 Level 5: Regression Tests
    No historical scenarios defined
    Breaking change detection not implemented
  2/2 tests passed (100%)

============================================================
📊 Test Summary
============================================================
Plugin: my-plugin v2.0.0
Duration: 12.3s
Total tests: 27
Passed: 24 (89%)
Failed: 0
Warnings: 3

Results by Level:
  Level 1: ⚠️ 8/9 (89%)
  Level 2: ✅ 7/7 (100%)
  Level 3: ⚠️ 5/6 (83%)
  Level 4: ⚠️ 2/3 (67%)
  Level 5: ✅ 2/2 (100%)

⚠️  Warnings:
  1. .gitignore not found: .gitignore not found
  2. No dependencies declared: No dependencies declared
  3. Missing dependencies: jq

============================================================
✅ Overall: PASSED (89% >= 70%)
============================================================
```

### JSON Output

```json
{
  "plugin": "my-plugin",
  "version": "2.0.0",
  "timestamp": "2025-10-10T12:00:00.000Z",
  "duration": 12.3,
  "summary": {
    "total": 27,
    "passed": 24,
    "failed": 0,
    "warnings": 3,
    "passRate": 89
  },
  "levels": {
    "1": { "passed": 8, "total": 9, "passRate": 89 },
    "2": { "passed": 7, "total": 7, "passRate": 100 },
    "3": { "passed": 5, "total": 6, "passRate": 83 },
    "4": { "passed": 2, "total": 3, "passRate": 67 },
    "5": { "passed": 2, "total": 2, "passRate": 100 }
  },
  "tests": [...],
  "failures": [],
  "warnings": [
    {
      "name": ".gitignore not found",
      "level": 1,
      "status": "warning",
      "message": ".gitignore not found",
      "duration": 1
    }
  ]
}
```

## Use Cases

### Pre-Commit Testing

```bash
#!/bin/bash
# .claude-plugins/my-plugin/hooks/pre-commit-tests.sh

echo "Running pre-commit tests..."

node ../developer-tools-plugin/scripts/test-plugin-installation.js \
  --plugin $(basename $(pwd)) \
  --quick

if [ $? -ne 0 ]; then
  echo "❌ Tests failed"
  exit 1
fi

echo "✅ Tests passed"
```

### CI/CD Pipeline

```yaml
# .github/workflows/test.yml
name: Plugin Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Run Tests
        run: |
          node .claude-plugins/developer-tools-plugin/scripts/test-plugin-installation.js \
            --plugin my-plugin \
            --level all \
            --threshold 90 \
            --json > test-report.json

      - name: Upload Report
        uses: actions/upload-artifact@v2
        with:
          name: test-report
          path: test-report.json
```

### Pre-Release Validation

```bash
#!/bin/bash
# Pre-release validation script

PLUGIN=$1
THRESHOLD=90

echo "🧪 Running pre-release tests for $PLUGIN"

# Run full test suite
node scripts/test-plugin-installation.js \
  --plugin "$PLUGIN" \
  --level all \
  --threshold $THRESHOLD \
  --verbose

if [ $? -ne 0 ]; then
  echo "❌ Tests failed. Fix issues before releasing."
  exit 1
fi

echo "✅ All tests passed. Ready for release!"
```

## Test Categories

### Happy Path Tests
- Normal plugin installation
- Agent discovery and invocation
- Command execution
- Script running

### Error Handling Tests
- Invalid plugin structure
- Missing required files
- Invalid YAML frontmatter
- Circular dependencies

### Edge Cases
- Empty plugins (no agents)
- Very large plugins (100+ agents)
- Special characters in names
- Version conflicts

### Performance Tests
- Response time benchmarks
- Memory usage limits
- Concurrent agent invocation

## Quality Gates

### For Commits
- **Level 1-2 must pass 100%**
- No critical failures
- Duration < 10s

### For Pull Requests
- **Level 1-3 must pass ≥90%**
- No failed tests
- Warnings documented

### For Releases
- **Level 1-5 must pass ≥95%**
- All critical tests pass
- All warnings addressed or documented
- Performance benchmarks met

## Troubleshooting

### Issue: Tests timing out
**Problem**: Tests hang or exceed time limits

**Solution**:
```bash
# Increase timeout (not yet implemented in script)
# For now, check for:
# - Network issues with dependencies
# - Infinite loops in agent code
# - External services down
```

### Issue: Intermittent failures
**Problem**: Tests fail randomly, pass on retry

**Solution**:
- Check for race conditions
- Verify test isolation
- Review timing-dependent logic
- Run with `--verbose` to debug

### Issue: All discovery tests failing
**Problem**: No agents/commands found

**Solution**:
```bash
# Check directory structure
ls -la .claude-plugins/my-plugin/agents/

# Verify file naming
# Files must be lowercase-hyphen.md

# Check permissions
chmod +x .claude-plugins/my-plugin/scripts/*.js
```

### Issue: YAML frontmatter errors
**Problem**: Agent frontmatter validation fails

**Solution**:
```yaml
# Correct format:
---
name: agent-name
model: sonnet
description: Clear description (20+ chars)
tools: Read, Write, TodoWrite
---

# Common mistakes:
# - Missing closing ---
# - Incorrect indentation
# - Missing required fields
# - Invalid tool names
```

## Integration with Other Tools

### With Plugin Validator

```bash
# Run validation before testing
/plugin-validate my-plugin

# Then run tests
node scripts/test-plugin-installation.js --plugin my-plugin
```

### With Quality Analyzer

```bash
# Check quality scores
node scripts/analyze-agent-quality.js --plugin my-plugin --threshold 70

# Then run integration tests
node scripts/test-plugin-installation.js --plugin my-plugin --level all
```

### With Version Manager

```bash
# Test before releasing
node scripts/test-plugin-installation.js --plugin my-plugin --level all --threshold 95

# If passing, release
node scripts/version-manager.js --plugin my-plugin --bump minor --push
```

## Best Practices

1. **Test Early, Test Often**: Run quick tests on every commit
2. **Automate Everything**: Use pre-commit hooks and CI/CD
3. **Set Quality Gates**: Enforce minimum pass rates
4. **Fix Warnings**: Don't let warnings accumulate
5. **Monitor Trends**: Track test results over time
6. **Update Tests**: Keep tests in sync with code changes
7. **Document Failures**: Record known issues and workarounds
8. **Performance Matters**: Keep test suite fast (<30s for full suite)

## References

- [plugin-integration-tester Agent](../agents/plugin-integration-tester.md)
- [Plugin Quality Standards](../../../docs/PLUGIN_QUALITY_STANDARDS.md)
- [Plugin Development Guide](../../../docs/PLUGIN_DEVELOPMENT_GUIDE.md)

---

**Plugin Integration Tester v2.0.0** - Comprehensive testing for OpsPal Plugin Marketplace
