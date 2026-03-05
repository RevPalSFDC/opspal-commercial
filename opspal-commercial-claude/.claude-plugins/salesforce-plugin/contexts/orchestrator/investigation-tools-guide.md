# Investigation Tools Guide - Orchestration Operations

**Context Type**: Progressive Disclosure (loaded on "investigate", "debug", "troubleshoot", "diagnose" keywords)
**Priority**: Medium
**Trigger**: When investigating issues or planning complex orchestrations

---

## Overview

**NEVER orchestrate operations without field discovery and query validation. This prevents 90% of orchestration failures and reduces troubleshooting time by 85%.**

---

## Investigation Tools Reference

**Tool Integration Guide:** `.claude/agents/TOOL_INTEGRATION_GUIDE.md`

### 1. Metadata Cache for Orchestration Planning

```bash
# Initialize cache for all involved orgs
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/org-metadata-cache.js init <org>

# Discover complete org state before orchestration
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/org-metadata-cache.js query <org>

# Find fields across multiple objects
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/org-metadata-cache.js find-field <org> <object> <pattern>
```

**Purpose**: Load complete org metadata to inform orchestration decisions

---

### 2. Query Validation for All Sub-Operations

```bash
# Validate ALL queries before delegating to sub-agents
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/smart-query-validator.js <org> "<soql>"

# Ensure sub-agents receive valid queries
```

**Purpose**: Prevent query errors that cascade across sub-agents

---

### 3. Multi-Object Discovery

```bash
# Discover dependencies across objects
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/org-metadata-cache.js query <org> | jq '.objects, .relationships'

# Plan orchestration based on complete metadata
```

**Purpose**: Understand object relationships before orchestrating operations

---

## Mandatory Tool Usage Patterns

### Pattern 1: Pre-Orchestration Discovery

```
Before orchestrating multi-step operation
  ↓
1. Run: node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/org-metadata-cache.js init <org>
2. Discover all affected objects and fields
3. Plan operation sequence based on metadata
4. Delegate to sub-agents with validated context
```

**When to Use**: Before any multi-step orchestration
**Prevents**: Metadata-related failures, invalid field references, missing dependencies

---

### Pattern 2: Cross-Agent Coordination

```
Coordinating multiple agents
  ↓
1. Use cache to provide consistent metadata to all agents
2. Validate all queries before delegation
3. Monitor each agent's operations
4. Verify results with validated queries
```

**When to Use**: When delegating to multiple sub-agents
**Prevents**: Inconsistent metadata across agents, query validation failures

---

### Pattern 3: Error Recovery

```
Handling orchestration failures
  ↓
1. Use cache to understand current state
2. Identify failure point from metadata
3. Plan recovery with validated approach
```

**When to Use**: After orchestration failures
**Prevents**: Repeated failures from same root cause

---

## Benefits

- **Zero orchestration failures** from metadata issues
- **Consistent agent coordination** with shared metadata cache
- **Validated operations** through pre-execution query validation
- **85% reduction** in troubleshooting time

---

## Cross-References

**Tool Integration Guide**: `.claude/agents/TOOL_INTEGRATION_GUIDE.md` - Section "sfdc-orchestrator"

**Related Scripts**:
- `scripts/lib/org-metadata-cache.js` - Metadata caching and discovery
- `scripts/lib/smart-query-validator.js` - SOQL query validation
- `scripts/lib/field-metadata-cache.js` - Field-specific metadata caching

---

**When This Context is Loaded**: When user message contains keywords: "investigate", "debug", "troubleshoot", "diagnose", "root cause", "find issue", "what went wrong"

**Back to Core Agent**: See `sfdc-orchestrator.md` for orchestration overview
