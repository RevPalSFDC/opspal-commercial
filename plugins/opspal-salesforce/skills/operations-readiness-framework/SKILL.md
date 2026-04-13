---
name: operations-readiness-framework
description: Salesforce operational readiness baseline combining environment configuration and data-quality health checks. Use when preparing execution environments, MCP contexts, and pre-assessment data quality controls.
allowed-tools:
  - Read
  - Grep
  - Glob
---

# Operations Readiness Framework

## When to Use This Skill

Use this skill when:
- Preparing to run an assessment, audit, or bulk operation against a Salesforce org
- Verifying that MCP tools and sf CLI are authenticated and targeting the correct org
- Checking API limits and storage capacity before large data operations
- Running pre-flight environment checks before cross-platform operations
- Validating that required dependencies (jq, node, sf CLI) are available

**Not for**: Deployment validation (use `deployment-validation-framework`), quality gate enforcement (use `salesforce-deployment-quality-gates-framework`), or org context detection in hooks (use `salesforce-org-context-detection-framework`).

## Readiness Checklist

| Check | Command | Pass Criteria |
|-------|---------|---------------|
| **Org Authentication** | `sf org display --target-org <org> --json` | Returns valid access token |
| **Org Type Detection** | `sf data query --query "SELECT IsSandbox, OrganizationType, InstanceName FROM Organization" --target-org <org>` | Correct environment identified |
| **API Limits** | `sf org list limits --target-org <org> --json` | DailyApiRequests remaining > 10% |
| **Storage Capacity** | Check `DataStorageMB` and `FileStorageMB` from limits | Sufficient for planned operation |
| **sf CLI Version** | `sf version --json` | v2.x or higher |
| **Node.js Version** | `node --version` | v22+ |
| **jq Available** | `jq --version` | Installed (required for routing hooks) |
| **MCP Tools** | Check MCP tool availability via tool listing | Required tools respond |

## Workflow

### Step 1: Validate Environment

```bash
# Verify org connection and identity
sf org display --target-org <org> --json

# Check org type (affects test requirements and deployment behavior)
sf data query --query "SELECT IsSandbox, OrganizationType, InstanceName, Name FROM Organization" --target-org <org>
```

### Step 2: Check API and Storage Limits

```bash
# Get current API usage
sf org list limits --target-org <org> --json | jq '.result[] | select(.name == "DailyApiRequests" or .name == "DataStorageMB" or .name == "FileStorageMB")'
```

| Limit | Warning Threshold | Block Threshold |
|-------|-------------------|-----------------|
| DailyApiRequests | <20% remaining | <5% remaining |
| DataStorageMB | <10% remaining | <2% remaining |
| SingleEmail | <100 remaining | 0 remaining |

### Step 3: Validate Data Quality Baseline

```bash
# Quick record count sanity check
sf data query --query "SELECT COUNT() FROM Account" --target-org <org>
sf data query --query "SELECT COUNT() FROM Opportunity WHERE IsClosed = false" --target-org <org>

# Check for common data quality issues
/data-health  # OpsPal data health scorecard
```

### Step 4: Gate Decision

If any readiness check fails:
- **Warning threshold**: Log warning, allow operation with advisory
- **Block threshold**: Prevent operation, require explicit override or remediation

## Routing Boundaries

Use this skill for environment and data-quality readiness.
Use domain-specific implementation skills (upsert, triggers, flows) for execution details.

## References

- [environment setup](./environment-setup.md)
- [mcp multi-context](./mcp-multi-context.md)
- [data quality health checks](./data-quality-health-checks.md)
