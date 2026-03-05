---
name: flow-scanner-integration
description: Flow Scanner Integration - Auto-fix, SARIF output, configuration-driven validation
allowed-tools: Read, Bash, Grep
---

# Flow Scanner Integration Skill

## When to Use This Skill

Use Flow Scanner Integration when:
- Validating Flows before deployment
- Cleaning up legacy Flows
- Batch-fixing common validation issues
- Generating SARIF reports for CI/CD
- Customizing validation rules per org

## Quick Reference

### Auto-Fix Patterns (8 total)

| Pattern | Command | Time Savings |
|---------|---------|--------------|
| Hard-coded IDs | `--auto-fix` | 5-10 min/Flow |
| Unused variables | `--auto-fix` | 2-5 min/Flow |
| Missing descriptions | `--auto-fix` | 1-2 min/Flow |
| Outdated API versions | `--auto-fix` | 1 min/Flow |
| Missing fault paths | `--auto-fix` | 5-10 min/Flow |
| Copy naming | `--auto-fix` | 2-3 min/Flow |
| Unconnected elements | `--auto-fix` | 3-5 min/Flow |
| Trigger order | `--auto-fix` | 1 min/Flow |

**Average time savings**: 20-45 minutes per Flow (70-80% reduction)

### Commands

```bash
# Auto-fix workflow
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-validator.js MyFlow.xml --auto-fix --dry-run  # Preview
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-validator.js MyFlow.xml --auto-fix            # Apply

# SARIF output
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-validator.js MyFlow.xml --sarif --output report.sarif

# Configuration
# Create .flow-validator.yml (see templates/.flow-validator.yml)
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-validator.js MyFlow.xml  # Auto-loads config
```

### Success Criteria

- ✅ Auto-fix reduces manual correction time by 70-80%
- ✅ SARIF reports integrate with GitHub Code Scanning
- ✅ Configuration files reduce false positives by 40-60%
- ✅ Validation overhead < 5%

## Capability Matrix

| Capability | Supported | Complexity | Notes |
|------------|-----------|------------|-------|
| Auto-fix hard-coded IDs | ✅ Yes | Low | Safe to apply |
| Auto-fix unused variables | ✅ Yes | Low | Safe to apply |
| Auto-fix missing fault paths | ✅ Yes | Medium | Review recommended |
| SARIF output | ✅ Yes | Low | Standard format |
| Configuration files | ✅ Yes | Medium | Org-specific rules |
| Exception management | ✅ Yes | Medium | Flow/global level |

## Performance Metrics

- **Configuration loading**: <100ms (one-time)
- **Auto-fix processing**: 200-500ms per Flow
- **SARIF export**: <50ms per Flow
- **Total overhead**: <5% of validation duration

## Common Patterns

### Pattern 1: Pre-Deployment Auto-Fix
```bash
# 1. Full validation
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-validator.js MyFlow.xml --checks all --best-practices

# 2. Auto-fix
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-validator.js MyFlow.xml --auto-fix

# 3. Final validation
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-validator.js MyFlow.fixed.xml --checks all
```

### Pattern 2: CI/CD Integration
```yaml
- name: Validate Flows
  run: node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-validator.js flows/*.xml --sarif --output report.sarif

- name: Upload SARIF
  uses: github/codeql-action/upload-sarif@v2
```

### Pattern 3: Legacy Flow Cleanup
```bash
# Preview fixes
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-validator.js LegacyFlow.xml --auto-fix --dry-run

# Apply fixes
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-validator.js LegacyFlow.xml --auto-fix

# Test in sandbox
```

### Pattern 4: Batch Auto-Fix
```bash
# Fix multiple Flows
for flow in flows/*.xml; do
  node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/flow-validator.js "$flow" --auto-fix
done
```

### Pattern 5: Configuration-Driven Validation
```yaml
# .flow-validator.yml
rules:
  HardcodedId:
    severity: warning
    auto-fix: true

  UnusedVariable:
    severity: warning
    auto-fix: true

exceptions:
  flows:
    Legacy_Account_Update:
      - HardcodedId  # Known business-critical ID
```

## 8 New Validation Rules (v3.56.0)

| Rule | Detection | Severity | Auto-Fix |
|------|-----------|----------|----------|
| **UnusedVariable** | Variable declared but never used | Warning | ✅ Remove |
| **UnconnectedElement** | Element not in Flow path (BFS check) | Error | ✅ Remove |
| **CopyAPIName** | API name starts with "Copy_of_" | Warning | ⚠️ Prompt |
| **RecursiveAfterUpdate** | After-update Flow updates same object | Error | ❌ No |
| **TriggerOrder** | Trigger order not optimal | Warning | ✅ Set to 1000 |
| **AutoLayout** | Auto-layout disabled | Note | ✅ Enable |
| **InactiveFlow** | Flow never activated (Draft/Obsolete) | Note | ❌ No |
| **UnsafeRunningContext** | "System Mode without Sharing" | Warning | ❌ No |

## Integration with Flow Development Lifecycle

### Development Stage
- **When**: Creating/modifying Flows
- **Use**: Auto-fix as final cleanup step before validation
- **Benefit**: Ensures current standards without manual review

### Validation Stage
- **When**: Before deployment to any environment
- **Use**: Full validation with auto-fix + configuration files
- **Benefit**: Catches issues early with org-specific rules

### Deployment Stage
- **When**: CI/CD pipeline execution
- **Use**: SARIF output for GitHub Code Scanning
- **Benefit**: Visual violations in PRs, automated checks

### Maintenance Stage
- **When**: Legacy Flow cleanup campaigns
- **Use**: Batch auto-fix across Flow library
- **Benefit**: 70-80% time savings on standardization

## Documentation

- **Comprehensive Guide**: `docs/FLOW_SCANNER_INTEGRATION.md` (600+ lines)
- **Quick Reference**: `docs/FLOW_SCANNER_QUICK_REFERENCE.md` (400+ lines)
- **Configuration Template**: `templates/.flow-validator.yml` (173 lines)
- **Runbook 4, Stage 12**: Auto-fix patterns and best practices
- **Runbook 3, Method 4**: Auto-fix as development method
- **Runbook 8**: Auto-fix in segment completion

## Related Skills

- **automation-building-patterns** - Includes auto-fix in capability matrix
- **deployment-validation-framework** - Uses auto-fix in pre-deployment validation
- **metadata-dependency-patterns** - Complements with dependency analysis

## Agent Integration

Agents that should use Flow Scanner Integration:
- `sfdc-automation-builder` - Gate 5: Auto-fix before deployment
- `flow-diagnostician` - Flow Scanner Integration section
- `flow-test-orchestrator` - Auto-fix before execution testing
- `flow-batch-operator` - Batch auto-fix operations
- `flow-template-specialist` - Auto-fix template-generated Flows
- `flow-segmentation-specialist` - Auto-fix after segment completion

## Version History

- **v3.56.0** (2025-12-07): Initial release
  - 8 auto-fix patterns implemented
  - SARIF output format added
  - Configuration-driven rules
  - Exception management system
  - 8 new validation rules
  - Performance: <5% overhead, 70-80% time savings
