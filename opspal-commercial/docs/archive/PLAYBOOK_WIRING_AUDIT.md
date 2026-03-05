# Playbook Wiring Audit - Cross-Plugin Analysis

**Date**: 2025-01-06
**Scope**: All plugins (Salesforce, HubSpot, Cross-Platform)
**Status**: 🚨 Multiple Issues Found

## Executive Summary

**Found similar issues across all plugins:**
- ✅ Salesforce plugin: 5 playbooks registered, **1 missing**
- 🚨 HubSpot plugin: **No playbook registry exists** (14+ agents affected)
- 🚨 Cross-Platform plugin: **No playbook registry exists** (2+ agents affected)

**Total Impact**: 17+ agents using inconsistent playbook references

---

## Detailed Findings

### 1. Salesforce Plugin Issues

#### ✅ Currently Registered (5 playbooks)
1. `picklist_dependency` - ✅ Registered
2. `performance_optimization` - ✅ Registered
3. `safe_flow_deployment` - ✅ Registered (just added)
4. `flow_design_best_practices` - ✅ Registered (just added)
5. `flow_version_management` - ✅ Registered (just added)

#### ❌ Missing from Registry (1 playbook)

**`safe_record_creation` Playbook**
- **Location**: `.claude-plugins/opspal-salesforce/templates/playbooks/safe-record-creation/README.md`
- **Purpose**: 7-step safe record creation pattern (OOO D1 sequence)
- **Agents Using It**:
  1. `sfdc-cpq-specialist.md` (line 175)
  2. `sfdc-sales-operations.md` (line 122)
- **Reference Pattern**: Direct path reference `templates/playbooks/safe-record-creation/`
- **Issue**: Not in playbook-reference.yaml, so not consistently accessible

**Impact**:
- 2 agents have direct references (fragile, not standardized)
- Other agents that should use it may not know it exists

---

### 2. HubSpot Core Plugin Issues

#### 🚨 CRITICAL: No Playbook Registry Exists

**Missing Infrastructure**:
- ❌ No `agents/shared/` directory
- ❌ No `playbook-reference.yaml` file
- ❌ No centralized playbook management

#### Playbooks Found (2 playbooks)

**1. `BULK_OPERATIONS_PLAYBOOK.md`**
- **Location**: `.claude-plugins/hubspot-core-plugin/docs/BULK_OPERATIONS_PLAYBOOK.md`
- **Purpose**: Bulk operations standards for HubSpot API operations
- **Agents Using It** (14+ agents!):
  1. `hubspot-admin-specialist.md` (line 35)
  2. `hubspot-api.md` (line 26)
  3. `hubspot-autonomous-operations.md` (line 35)
  4. `hubspot-contact-manager.md` (line 36)
  5. `hubspot-data.md` (line 29)
  6. `hubspot-data-operations-manager.md` (line 40)
  7. `hubspot-integration-specialist.md` (line 27)
  8. `hubspot-orchestrator.md` (line 30)
  9. `hubspot-pipeline-manager.md` (line 24)
  10. `hubspot-property-manager.md` (line 34)
  11. `hubspot-seo-optimizer.md` (lines 39, 635)
  12. `hubspot-workflow-auditor.md` (line 30)
  13. `hubspot-workflow-builder.md` (line 23)
- **Reference Pattern**: Direct @import `../docs/BULK_OPERATIONS_PLAYBOOK.md`
- **Issue**: 14 agents with direct references - brittle if path changes

**2. `SEO_CONTENT_OPTIMIZATION_PLAYBOOK.md`**
- **Location**: `.claude-plugins/hubspot-core-plugin/docs/SEO_CONTENT_OPTIMIZATION_PLAYBOOK.md`
- **Purpose**: SEO content optimization strategies for HubSpot
- **Agents Using It** (1 agent):
  1. `hubspot-seo-optimizer.md` (lines 39, 632)
- **Reference Pattern**: Direct @import `../docs/SEO_CONTENT_OPTIMIZATION_PLAYBOOK.md`
- **Issue**: Not centrally managed

**Impact**:
- 14+ agents using fragile direct references
- No central discovery mechanism
- Path changes would break all references
- New agents may not discover playbooks

---

### 3. OpsPal Core Issues

#### 🚨 CRITICAL: No Playbook Registry Exists

**Missing Infrastructure**:
- ❌ No `agents/shared/` directory
- ❌ No `playbook-reference.yaml` file
- ❌ No centralized playbook management

#### Playbooks Found (1 playbook)

**`ASANA_AGENT_PLAYBOOK.md`**
- **Location**: `.claude-plugins/opspal-core/docs/ASANA_AGENT_PLAYBOOK.md`
- **Purpose**: Comprehensive Asana integration standards (task reading, updates, brevity)
- **Agents Using It** (2 agents):
  1. `asana-task-manager.md` (lines 104, 342)
  2. `implementation-planner.md` (lines 1305, 1602)
- **Reference Pattern**: Direct path reference `../docs/ASANA_AGENT_PLAYBOOK.md`
- **Issue**: Not in central registry

**Impact**:
- 2 agents with direct references
- Other agents that integrate with Asana may not know playbook exists
- Not documented in CLAUDE.md (though it IS documented in cross-platform CLAUDE.md)

---

## Comparison: Reference Patterns

### ✅ GOOD (Salesforce - after fix)
```yaml
# In playbook-reference.yaml
safe_flow_deployment:
  path: ../../templates/playbooks/safe-flow-deployment/README.md
  purpose: "5-step deployment pattern..."

# In agent
@import agents/shared/playbook-reference.yaml
```

### ❌ BAD (HubSpot - current)
```markdown
# In agent (14+ times!)
**ALL operations MUST follow:** @import ../docs/BULK_OPERATIONS_PLAYBOOK.md
```

### ❌ BAD (Cross-Platform - current)
```markdown
# In agent (2+ times!)
**Primary Documentation**: `../docs/ASANA_AGENT_PLAYBOOK.md`
```

---

## Recommendations

### Priority 1: Salesforce Plugin (Quick Fix)

**Add `safe_record_creation` to playbook-reference.yaml**

```yaml
safe_record_creation:
  path: ../../templates/playbooks/safe-record-creation/README.md
  purpose: |
    **7-Step Safe Record Creation Pattern (OOO D1)**
    Validates records before creation: Describe → Validation Rules → Record Types → FLS → Lookups → Create → Verify
  use_cases:
    - Production record creation
    - Complex validation rules
    - Record type requirements
    - Dependent picklist fields
    - Master-detail relationships
  key_features:
    - "Object introspection"
    - "Validation rule analysis"
    - "Record type resolution"
    - "FLS verification"
    - "Lookup resolution"
    - "Post-creation verification"
  mandatory_for:
    - Data creation agents
    - CPQ specialists
    - Sales operations agents
  tools_referenced:
    - ooo-write-operations.js
    - ooo-validation-rule-analyzer.js
  roi_metrics:
    prevents: "Validation rule violations, FLS errors, record type mismatches"
    time_saved: "20-40 hours/year"
    annual_value: "$3-6K"
  added: v3.42.0
```

**Update 2 agents**:
- `sfdc-cpq-specialist.md` - Change to @import reference
- `sfdc-sales-operations.md` - Change to @import reference

**Effort**: 30 minutes

---

### Priority 2: HubSpot Core Plugin (Major Work)

**1. Create Infrastructure**
```bash
mkdir -p .claude-plugins/hubspot-core-plugin/agents/shared
touch .claude-plugins/hubspot-core-plugin/agents/shared/playbook-reference.yaml
```

**2. Create playbook-reference.yaml**
```yaml
---
# HubSpot Core Plugin - Shared Playbook Reference
# Version: 1.0.0

playbooks:
  bulk_operations:
    path: ../../docs/BULK_OPERATIONS_PLAYBOOK.md
    purpose: |
      **Bulk Operations Standards for HubSpot API**
      Complete guide to batch processing, rate limiting, error handling, and performance optimization.
    use_cases:
      - Bulk contact imports
      - Mass property updates
      - Batch association creation
      - Large-scale data operations
    mandatory_for:
      - All data operation agents
      - All API interaction agents
      - Orchestration agents
    added: v1.2.0

  seo_content_optimization:
    path: ../../docs/SEO_CONTENT_OPTIMIZATION_PLAYBOOK.md
    purpose: |
      **SEO Content Optimization for HubSpot**
      Strategies for optimizing content, keywords, metadata, and performance in HubSpot CMS.
    use_cases:
      - Blog post optimization
      - Landing page SEO
      - Content strategy
      - Keyword research
    mandatory_for:
      - SEO optimizer agents
      - Content management agents
    added: v1.2.0

agent_categories:
  bulk_operations:
    agents:
      - hubspot-admin-specialist
      - hubspot-api
      - hubspot-autonomous-operations
      - hubspot-contact-manager
      - hubspot-data
      - hubspot-data-operations-manager
      - hubspot-integration-specialist
      - hubspot-orchestrator
      - hubspot-pipeline-manager
      - hubspot-property-manager
      - hubspot-workflow-auditor
      - hubspot-workflow-builder
    required_playbooks:
      - bulk_operations

  seo_operations:
    agents:
      - hubspot-seo-optimizer
    required_playbooks:
      - seo_content_optimization
      - bulk_operations

quick_reference:
  when_to_use:
    bulk_operations: "ANY HubSpot API operation (automatic, always reference)"
    seo_content_optimization: "SEO tasks, content optimization, keyword research"
```

**3. Update 14+ agents**
- Replace all `@import ../docs/BULK_OPERATIONS_PLAYBOOK.md` with `@import agents/shared/playbook-reference.yaml`
- Replace all `@import ../docs/SEO_CONTENT_OPTIMIZATION_PLAYBOOK.md` with `@import agents/shared/playbook-reference.yaml`

**Effort**: 2-3 hours

---

### Priority 3: OpsPal Core (Minor Work)

**1. Create Infrastructure**
```bash
mkdir -p .claude-plugins/opspal-core/agents/shared
touch .claude-plugins/opspal-core/agents/shared/playbook-reference.yaml
```

**2. Create playbook-reference.yaml**
```yaml
---
# OpsPal Core - Shared Playbook Reference
# Version: 1.0.0

playbooks:
  asana_integration:
    path: ../../docs/ASANA_AGENT_PLAYBOOK.md
    purpose: |
      **Comprehensive Asana Integration Standards**
      Complete guide to task reading, progress updates, brevity requirements, and structured formatting.
    use_cases:
      - Task creation and updates
      - Progress reporting
      - Blocker communication
      - Milestone tracking
    key_features:
      - "Standardized update templates"
      - "Brevity requirements (< 100 words)"
      - "Task reading patterns"
      - "Project-as-roadmap strategy"
    mandatory_for:
      - Asana task manager
      - Implementation planner
      - Any agent posting to Asana
    tools_referenced:
      - asana-task-reader.js
      - asana-update-formatter.js
      - asana-roadmap-manager.js
    added: v1.2.0

agent_categories:
  asana_operations:
    agents:
      - asana-task-manager
      - implementation-planner
    required_playbooks:
      - asana_integration

quick_reference:
  when_to_use:
    asana_integration: "ANY Asana task creation, update, or progress reporting"
```

**3. Update 2 agents**
- `asana-task-manager.md` - Replace direct references with @import
- `implementation-planner.md` - Replace direct references with @import

**Effort**: 1 hour

---

## Total Impact

### Before Fix
- ❌ Salesforce: 1 playbook not registered (2 agents affected)
- ❌ HubSpot: No registry (14+ agents affected)
- ❌ Cross-Platform: No registry (2 agents affected)
- ❌ **Total: 18+ agents with inconsistent playbook access**

### After Fix
- ✅ Salesforce: All 6 playbooks registered, standardized access
- ✅ HubSpot: Central registry with 2 playbooks, standardized access
- ✅ Cross-Platform: Central registry with 1 playbook, standardized access
- ✅ **All 18+ agents use consistent @import pattern**

### Benefits
1. **Single Source of Truth** - All playbooks centrally managed per plugin
2. **Easy Updates** - Change once, propagates to all agents
3. **Consistency** - All agents use same access pattern
4. **Discoverability** - New agents can find playbooks via registry
5. **Maintainability** - Path changes only require updating registry
6. **Documentation** - Quick reference shows when to use each playbook

---

## Implementation Timeline

| Priority | Plugin | Work | Effort | Agents Affected |
|----------|--------|------|--------|-----------------|
| P1 | Salesforce | Add 1 playbook to registry | 30 min | 2 agents |
| P2 | HubSpot | Create registry + update agents | 2-3 hrs | 14+ agents |
| P3 | Cross-Platform | Create registry + update agents | 1 hr | 2 agents |

**Total Effort**: ~4 hours
**Total Agents Fixed**: 18+ agents

---

## Next Steps

1. **Immediate**: Fix Salesforce `safe_record_creation` issue
2. **This week**: Create HubSpot playbook registry
3. **This week**: Create Cross-Platform playbook registry
4. **Follow-up**: Update all plugin CLAUDE.md files to document registries
5. **Future**: Consider cross-plugin playbook sharing mechanism

---

## Related Documents

- **Salesforce Playbook Registry**: `.claude-plugins/opspal-salesforce/agents/shared/playbook-reference.yaml`
- **Flow Playbook Wiring Complete**: `.claude-plugins/opspal-salesforce/FLOW_PLAYBOOK_WIRING_COMPLETE.md`
- **HubSpot CLAUDE.md**: `.claude-plugins/hubspot-core-plugin/CLAUDE.md`
- **Cross-Platform CLAUDE.md**: `.claude-plugins/opspal-core/CLAUDE.md`

---

**Analysis Complete**: ✅
**Ready for Implementation**: ✅
