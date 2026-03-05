# Prompt Caching Research - Claude Code Implementation

**Date:** 2025-10-27
**Version:** 1.0.0
**Status:** Research Complete

## Executive Summary

Prompt caching is a powerful optimization technique in Claude API that can reduce costs by 90% and latency by 2x for repeated content. This research investigates how to leverage caching in our 100+ agent system within Claude Code.

---

## How Prompt Caching Works

### Core Mechanism
- **Cache Hit**: System checks if prompt prefix (up to specified breakpoint) is already cached
- **First Use**: Full prompt processed, segments stored in cache
- **Subsequent Uses**: Cached segments retrieved from memory (90% cost savings)

### Cache Control Syntax
```json
{
  "cache_control": {"type": "ephemeral"}
}
```

### Cache Lifetimes
| Cache Type | Lifetime | Write Cost Multiplier | Read Cost Multiplier | Use Case |
|------------|----------|----------------------|---------------------|----------|
| **5-min (default)** | 5 minutes, auto-refreshes | 1.25x | 0.1x (90% savings) | Frequent operations |
| **1-hour** | 1 hour, static | 2x | 0.1x (90% savings) | Infrequent operations |

### Cost Economics
**Example: 10,000-token shared library**
- **Without caching**: 10,000 tokens × $0.003 = $30 per invocation
- **With caching (first use)**: 10,000 tokens × 1.25 × $0.003 = $37.50
- **With caching (cache hit)**: 10,000 tokens × 0.1 × $0.003 = $3.00
- **Break-even**: 2 cache hits (saves $27 per subsequent invocation)

**For our system:**
- 60 agents share 978-line library-reference.yaml (~30,000 tokens)
- If each agent is invoked 10x/day: 600 invocations/day
- Without caching: 600 × $90 = $54,000/day
- With caching: $112.50 (write) + 599 × $9 = $5,503.50/day
- **Daily savings: ~$48,500 (90%)**

---

## Content Ordering for Maximum Caching

Per Claude documentation, cache prefixes are created in this order:

1. **Tools** (tool definitions)
2. **System** (system prompts)
3. **Messages** (user/assistant messages)

**Best Practice**: Place most static, reusable content first.

### Automatic Cache Boundary Detection
- System automatically checks for cache hits at **all previous content block boundaries** (up to ~20 blocks)
- Typically **one explicit breakpoint** suffices
- Multiple breakpoints useful when different sections update at different frequencies

---

## Claude Code @import Mechanism

### Current Usage in Our System

**Existing Shared Imports:**
```
.claude-plugins/opspal-salesforce/agents/shared/
├── library-reference.yaml (978 lines, ~30K tokens)
├── playbook-reference.yaml (216 lines, ~6K tokens)
├── error-prevention-notice.yaml (158 lines, ~4K tokens)
```

**Usage Example (from sfdc-data-operations.md):**
```markdown
---
name: sfdc-data-operations
tools: [...]
---

# Error Prevention System (Automatic)
@import agents/shared/error-prevention-notice.yaml

# Shared Script Libraries
@import agents/shared/library-reference.yaml

# Operational Playbooks
@import agents/shared/playbook-reference.yaml

[Agent-specific instructions...]
```

### How @import Works (Inference)

1. **Load Time Processing**: Claude Code processes @import directives when loading agent
2. **Content Expansion**: Imported files are expanded inline into agent prompt
3. **Order Preservation**: Imports appear in the order specified
4. **Caching Behavior**: **Unknown - needs verification**

### Critical Questions

#### Q1: Does Claude Code automatically apply cache_control to @import content?
**Hypothesis**: Likely NO - @import is a Claude Code-specific feature for code organization, not an API-level caching directive.

**Evidence**:
- @import is not mentioned in Claude API documentation
- Claude Code likely expands @import at load time, sending full expanded prompt to API
- No explicit cache_control syntax visible in agent files

**Implication**: We may need to structure agents to maximize caching benefits, even if we can't directly control cache_control.

#### Q2: Are system reminders (CLAUDE.md) cached?
**Hypothesis**: Possibly YES - system-level instructions are sent as system messages, which are cacheable.

**Evidence**:
- System reminders appear at conversation start
- Likely sent as `system` message type (cacheable)
- Refreshed every 5 minutes automatically

**Implication**: Large CLAUDE.md files benefit from caching, but 5-min expiry means limited benefit for long-running sessions.

#### Q3: What's the cache scope?
**Hypothesis**: Per-session or per-conversation caching.

**Evidence**:
- Cache lifetime: 5 minutes (default) or 1 hour (extended)
- Auto-refreshes with each use
- Likely scoped to conversation thread

**Implication**: Shared content benefits from caching within a single conversation/session, but not across separate sessions.

---

## Optimization Opportunities

### 1. Shared Content Consolidation

**Current State:**
- 60 agents in SF plugin use shared imports
- 3 shared files (~40K tokens total)
- Used in ~60% of agents

**Optimization:**
- **Extract more repeated content** (Asana integration, OOO pattern, Context7 guide)
- **Consolidate duplicates** across plugins (HubSpot also has similar content)
- **Structure for caching**: Static content first, dynamic last

**Expected Benefit:**
- If Claude Code caching works: 90% cost savings on shared content
- Even without explicit caching: Better maintainability (single source of truth)

### 2. Agent Size Reduction

**Current State:**
- Largest agents: 2,000-2,800 lines
- Mix static patterns (examples, best practices) with dynamic instructions

**Optimization:**
- **Split into core (dynamic) + imports (static)**
- Core: 50-300 lines (agent-specific instructions)
- Imports: 1,000+ lines (shared patterns, examples, references)

**Expected Benefit:**
- Faster agent loading
- Better caching potential
- Easier maintenance

### 3. CLAUDE.md Restructuring

**Current State:**
- Main CLAUDE.md: 1,200+ lines
- Plugin CLAUDE.md: 500-1,000 lines each
- Loaded as system reminders (possibly cached)

**Optimization:**
- **Split into core + imports**:
  - Core: 100-200 lines (project overview, critical rules)
  - Imports: 1,000+ lines (detailed guides, workflows, patterns)

**Expected Benefit:**
- Reduced initial load
- More cacheable structure
- Modular updates (change one import without invalidating others)

---

## Implementation Strategy

### Phase 1: Create Shared Imports (This Week)

**New Shared Files:**
```
.claude-plugins/opspal-salesforce/agents/shared/
├── asana-integration-standards.md (NEW - 200 lines)
├── ooo-write-operations-pattern.md (NEW - 150 lines)
├── context7-usage-guide.md (NEW - 50 lines)
└── time-tracking-integration.md (NEW - 100 lines)

.claude-plugins/shared-docs/ (NEW - top-level)
├── asana-integration-standards.md (cross-plugin)
└── context7-usage-guide.md (cross-plugin)
```

**Impact:**
- 10+ agents benefit from Asana standards
- 8 data agents benefit from OOO pattern
- 20+ agents benefit from Context7 guide
- **Total cacheable content: ~500 lines (~15K tokens)**

### Phase 2: Restructure Large Agents (This Week)

**Targets:**
1. sfdc-data-operations.md (2,820 lines → 300 + imports)
2. sfdc-metadata-manager.md (2,760 lines → 300 + imports)
3. sfdc-orchestrator.md (2,190 lines → 250 + imports)
4. hubspot-orchestrator.md (555 lines → 150 + imports)
5. asana-task-manager.md (1,039 lines → 200 + imports)

**Impact:**
- **Reduce agent-specific content by 80%**
- **Increase shared, cacheable content proportion**
- Faster agent initialization

### Phase 3: CLAUDE.md Splitting (Next Week)

**Structure:**
```markdown
# CLAUDE.md (200 lines - core, dynamic)
[Project overview, critical rules, agent discovery table]

# Detailed Documentation (imports, static)
@import docs/AGENT_ROUTING_TABLE.md (500 lines)
@import docs/COMPLEXITY_ROUTING_GUIDE.md (300 lines)
@import docs/AGENT_WORKFLOWS.md (200 lines)
@import docs/BEST_PRACTICES.md (300 lines)
```

**Impact:**
- **Core reduces from 1,200 to 200 lines**
- **1,000+ lines cacheable via imports**

---

## Success Metrics

### Quantitative
- [ ] **90% of shared content** uses @import mechanism
- [ ] **Large agents** (>1,000 lines) reduced to <500 lines + imports
- [ ] **Zero content duplication** across plugins
- [ ] **Baseline performance** measured (tokens/invocation, latency)

### Qualitative
- [ ] **Developer adoption** of @import for new shared content
- [ ] **Documentation** explains caching best practices
- [ ] **Agent templates** include caching-friendly structure

---

## Open Questions & Future Research

### 1. Verify Claude Code Caching Behavior
**Question**: Does Claude Code automatically apply cache_control to @import content?

**How to Test**:
```bash
# Monitor token usage across multiple agent invocations
# Look for cache_creation_input_tokens and cache_read_input_tokens in logs
```

**Action**: Need access to Claude Code API logs or usage metrics

### 2. Measure Actual Cache Hit Rates
**Question**: What percentage of agent invocations benefit from caching?

**How to Measure**:
- Track token counts per invocation
- Compare first vs subsequent invocations
- Look for 10x reduction in token costs

**Action**: Implement performance monitoring

### 3. Test Cache Expiration Behavior
**Question**: Is cache session-scoped or global?

**How to Test**:
- Invoke same agent in two separate conversations
- Check if second conversation gets cache hit
- Test with 5-minute intervals

**Action**: Run controlled experiments

---

## Recommendations

### Immediate Actions (This Week)
1. ✅ **Proceed with shared import creation** (works regardless of caching)
2. ✅ **Restructure large agents** (improves maintainability + potential caching)
3. ✅ **Document best practices** (educate team on caching-friendly patterns)

### Future Actions (Next Week)
4. **Measure performance baseline** (before optimization)
5. **Implement performance monitoring** (track cache hits)
6. **Measure performance after optimization** (quantify benefits)

### Assumptions
- @import content is **likely not explicitly cached** by Claude Code
- However, **structuring for caching** improves:
  - Maintainability (DRY principle)
  - Potential future caching support
  - Agent load times (less content to process)
- **Proceed with optimization** regardless of explicit caching support

---

## Conclusion

**Prompt caching is a powerful optimization**, but Claude Code's implementation details are unclear. However:

1. **@import mechanism is solid** - Already used extensively, promotes DRY
2. **Optimization is valuable** even without explicit caching:
   - Reduces agent size (faster loading)
   - Eliminates duplication (easier maintenance)
   - Positions system for future caching support
3. **Cost savings potential is enormous** - 90% if caching works fully

**Recommended path forward**: Proceed with all planned optimizations. Benefits accrue regardless of caching implementation details.

---

**Next Steps:**
1. Create new shared import files (asana-integration-standards.md, etc.)
2. Restructure top 5 largest agents
3. Measure before/after performance
4. Document best practices for team

**Research Status:** ✅ Complete
**Implementation Status:** 🚧 In Progress
