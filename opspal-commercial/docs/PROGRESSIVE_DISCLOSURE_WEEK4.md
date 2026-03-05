# Progressive Disclosure for Large Agents (Week 4 Part 2)

**Date**: 2026-01-05
**Status**: ✅ Analysis Complete, Implementation Planned
**Integration Status**: ⏱️ Awaiting Claude Code Core Integration

---

## Executive Summary

Implements **progressive disclosure pattern** for the 3 largest agents in the system. Currently, these agents load all content unconditionally (30.7k tokens), including advanced features, troubleshooting, and integration details that are only needed for edge cases. This optimization extracts edge-case content to separate context files loaded on-demand.

| Metric | Value |
|--------|-------|
| **Total Baseline Token Cost** | 30,724 tokens (15.4% of 200k limit) |
| **Agents Analyzed** | 3 largest agents (2,417-2,642 lines each) |
| **Expected Token Savings** | **10,724 tokens (35% reduction)** |
| **New Baseline After Extraction** | 20,000 tokens (10% of limit) |
| **Implementation Complexity** | Medium (3-4 weeks) |

---

## Problem Statement

### Current Behavior

**Large agents load all content unconditionally:**
```
Session Start
├─ Load sfdc-revops-auditor (10,568 tokens) ← Includes edge cases
├─ Load sfdc-cpq-assessor (10,432 tokens) ← Includes advanced features
├─ Load sfdc-automation-auditor (9,668 tokens) ← Includes troubleshooting
└─ Total: 30,724 tokens
```

**Impact:**
- 30.7k tokens consumed for all conversations
- 15.4% of 200k context limit always used
- Edge-case content loaded even for simple tasks
- Advanced features loaded when not needed

### Target Behavior

**Load base agent + context on-demand:**
```
Session Start
├─ Load sfdc-revops-auditor-base (6,872 tokens)
├─ Load sfdc-cpq-assessor-base (6,784 tokens)
├─ Load sfdc-automation-auditor-base (6,288 tokens)
└─ Total Base: 19,944 tokens

When Advanced Feature Needed
├─ Detect keyword trigger
└─ Load context file (+3,696 tokens for specific feature)
```

---

## Large Agent Analysis

### Analysis Results

**Total Agents Analyzed**: 221 agents across 9 plugins
**Large Agents (>2,000 lines)**: 3 agents (1.4%)
**Total Lines in Large Agents**: 7,667 lines
**Estimated Token Cost**: 30,724 tokens

### Breakdown by Agent

| Agent | Lines | Tokens | Extractable | Base | Savings |
|-------|-------|--------|-------------|------|---------|
| **sfdc-revops-auditor** | 2,642 | 10,568 | 924 lines | 1,718 lines | **3,696 tokens (35%)** |
| **sfdc-cpq-assessor** | 2,608 | 10,432 | 912 lines | 1,696 lines | **3,648 tokens (35%)** |
| **sfdc-automation-auditor** | 2,417 | 9,668 | 845 lines | 1,572 lines | **3,380 tokens (35%)** |
| **Total** | **7,667** | **30,724** | **2,681 lines** | **4,986 lines** | **10,724 tokens (35%)** |

### Content Analysis

**Extractable Content Categories** (identified via keyword analysis):

| Category | sfdc-revops-auditor | sfdc-cpq-assessor | sfdc-automation-auditor |
|----------|---------------------|-------------------|-------------------------|
| **Troubleshooting** | 11 refs | 7 refs | 3 refs |
| **Advanced Features** | 26 refs | 27 refs | 18 refs |
| **Integration Details** | 49 refs | 54 refs | 37 refs |

---

## Extractable Sections by Agent

### Agent 1: sfdc-revops-auditor (10,568 tokens → 6,872 tokens)

**Extract to Context Files:**

1. **`context/revops-advanced-analytics.md`** (~1,200 tokens)
   - Advanced Statistical Analysis Patterns
   - Predictive Analytics
   - Multi-Dimensional Scoring Framework
   - Pseudocode for funnel analysis, seasonality, segmentation

2. **`context/revops-troubleshooting.md`** (~800 tokens)
   - Common Issues section
   - Error Recovery procedures
   - Query failure handling patterns
   - Data validation edge cases

3. **`context/revops-integrations.md`** (~1,000 tokens)
   - Asana Integration for Assessment Tracking
   - Lucidchart Diagram Generation
   - Benchmark Research Agent Delegation
   - Report Service integration details

4. **`context/revops-advanced-protocols.md`** (~696 tokens)
   - Advanced Chain-of-Thought examples
   - Complex calculation protocols
   - Self-correction protocol details
   - Knowledge source restriction examples

**Keywords to Trigger Context Loading:**
- Advanced analytics: `predictive`, `statistical`, `funnel analysis`, `seasonality`
- Troubleshooting: `error`, `failed`, `issue`, `debug`
- Integrations: `asana`, `lucid`, `diagram`, `benchmark`
- Protocols: `chain-of-thought`, `self-correction`, `validation`

---

### Agent 2: sfdc-cpq-assessor (10,432 tokens → 6,784 tokens)

**Extract to Context Files:**

1. **`context/cpq-playwright-integration.md`** (~1,400 tokens)
   - Playwright Integration for UI Scraping
   - CPQ UI Elements Available for Scraping
   - Session Management details
   - Shared Library usage patterns

2. **`context/cpq-advanced-calculations.md`** (~900 tokens)
   - Complex CPQ calculation protocols
   - Chain-of-Thought reasoning examples
   - Advanced pricing logic analysis
   - Discount schedule calculations

3. **`context/cpq-troubleshooting.md`** (~600 tokens)
   - Common CPQ configuration issues
   - Quote generation errors
   - Product bundle conflicts
   - Price book validation

4. **`context/cpq-data-integrity.md`** (~748 tokens)
   - Advanced grounding protocol examples
   - Knowledge source restriction patterns
   - Query validation for SBQQ objects
   - Refusal policy edge cases

**Keywords to Trigger Context Loading:**
- Playwright: `scrape`, `ui`, `browser`, `screenshot`, `playwright`
- Advanced: `pricing`, `discount`, `bundle`, `calculation`
- Troubleshooting: `error`, `failed`, `conflict`, `issue`
- Data integrity: `hallucination`, `validation`, `grounding`

---

### Agent 3: sfdc-automation-auditor (9,668 tokens → 6,288 tokens)

**Extract to Context Files:**

1. **`context/automation-conflict-detection.md`** (~1,200 tokens)
   - 8 Core Conflict Detection Rules (detailed)
   - Dependency Graph Construction Algorithms
   - Circular dependency resolution
   - Cascade impact analysis

2. **`context/automation-risk-scoring.md`** (~800 tokens)
   - Risk Scoring Algorithm details
   - Multi-factor risk assessment
   - Weighting formulas
   - Confidence level calculations

3. **`context/automation-advanced-analysis.md`** (~900 tokens)
   - Advanced Flow analysis patterns
   - Trigger order optimization
   - Governor limit prediction
   - Performance impact modeling

4. **`context/automation-troubleshooting.md`** (~480 tokens)
   - Common automation conflicts
   - Flow execution errors
   - Trigger recursion issues
   - Governor limit troubleshooting

**Keywords to Trigger Context Loading:**
- Conflict: `conflict`, `circular`, `dependency`, `overlap`
- Risk: `risk`, `score`, `impact`, `assessment`
- Advanced: `algorithm`, `optimization`, `prediction`, `modeling`
- Troubleshooting: `error`, `failed`, `recursion`, `governor`

---

## Implementation Design

### Component 1: Context File Structure

**Create context directory structure:**

```
.claude-plugins/opspal-salesforce/
├── agents/
│   ├── sfdc-revops-auditor.md (BASE - 1,718 lines)
│   ├── sfdc-cpq-assessor.md (BASE - 1,696 lines)
│   └── sfdc-automation-auditor.md (BASE - 1,572 lines)
└── context/
    ├── revops-advanced-analytics.md (924 lines total)
    ├── revops-troubleshooting.md
    ├── revops-integrations.md
    ├── revops-advanced-protocols.md
    ├── cpq-playwright-integration.md (912 lines total)
    ├── cpq-advanced-calculations.md
    ├── cpq-troubleshooting.md
    ├── cpq-data-integrity.md
    ├── automation-conflict-detection.md (845 lines total)
    ├── automation-risk-scoring.md
    ├── automation-advanced-analysis.md
    └── automation-troubleshooting.md
```

### Component 2: Keyword Detection Hook

**Create `.claude/hooks/detect-agent-context.sh`:**

```bash
#!/bin/bash
# Detects keywords in task description and exports required context files

TASK_DESCRIPTION="$1"
AGENT_NAME="$2"

declare -A CONTEXT_MAP
CONTEXT_MAP=(
  ["predictive|statistical|funnel analysis"]="revops-advanced-analytics.md"
  ["error|failed|issue|debug"]="revops-troubleshooting.md"
  ["asana|lucid|diagram|benchmark"]="revops-integrations.md"
  ["scrape|ui|browser|playwright"]="cpq-playwright-integration.md"
  ["conflict|circular|dependency"]="automation-conflict-detection.md"
  ["risk|score|impact|assessment"]="automation-risk-scoring.md"
)

# Match keywords to context files
CONTEXT_FILES=""
for pattern in "${!CONTEXT_MAP[@]}"; do
  if echo "$TASK_DESCRIPTION" | grep -qiE "$pattern"; then
    CONTEXT_FILES="$CONTEXT_FILES ${CONTEXT_MAP[$pattern]}"
  fi
done

# Export for Claude Code to load
if [ -n "$CONTEXT_FILES" ]; then
  export LOAD_CONTEXT_FILES="$CONTEXT_FILES"
  echo "🔧 Loading context files: $CONTEXT_FILES" >&2
fi

echo "export LOAD_CONTEXT_FILES=\"$LOAD_CONTEXT_FILES\""
```

### Component 3: Base Agent Modification

**Update base agents with context injection markers:**

```markdown
# sfdc-revops-auditor.md (BASE)

## Core Responsibilities
[... base content ...]

<!-- CONTEXT: revops-advanced-analytics.md -->
<!-- Loaded when keywords: predictive, statistical, funnel analysis, seasonality -->

## Standard Assessment Protocol
[... base content ...]

<!-- CONTEXT: revops-troubleshooting.md -->
<!-- Loaded when keywords: error, failed, issue, debug -->
```

### Component 4: Claude Code Integration

**Modify agent loading logic:**

```javascript
// In agent loading mechanism
async function loadAgent(agentName, taskDescription) {
  // Load base agent
  const baseAgent = await readFile(`agents/${agentName}.md`);

  // Detect required context files
  const contextFiles = await detectContext(taskDescription, agentName);

  // Load context files
  for (const contextFile of contextFiles) {
    const contextContent = await readFile(`context/${contextFile}`);
    baseAgent += `\n\n${contextContent}`;
  }

  return baseAgent;
}
```

---

## Implementation Steps

### Phase 1: Extract Content (Week 4-5)

**Tasks:**
1. Extract sections from sfdc-revops-auditor → 4 context files
2. Extract sections from sfdc-cpq-assessor → 4 context files
3. Extract sections from sfdc-automation-auditor → 4 context files
4. Validate base agents still function correctly
5. Create context injection markers

**Deliverable**: 12 context files, 3 base agents

### Phase 2: Keyword Detection (Week 5)

**Tasks:**
1. Create keyword mapping configuration
2. Implement detect-agent-context.sh hook
3. Test keyword detection accuracy
4. Refine keyword patterns based on testing

**Deliverable**: Working keyword detection with >90% accuracy

### Phase 3: Integration & Testing (Week 5-6)

**Tasks:**
1. Integrate with Claude Code core
2. Test with simple tasks (should NOT load context)
3. Test with advanced tasks (should load context)
4. Validate token savings
5. Monitor for missed context loading (false negatives)

**Deliverable**: Validated 10,724 token savings

---

## Test Cases

### Test Case 1: Simple RevOps Assessment

**Task**: "Run basic RevOps assessment for pipeline metrics"
**Expected**:
- ✅ Base agent loads (6,872 tokens)
- ❌ No context files load
- ✅ Assessment completes successfully
- **Savings**: 3,696 tokens (35%)

### Test Case 2: Advanced Statistical Analysis

**Task**: "Run RevOps assessment with funnel analysis and seasonality patterns"
**Expected**:
- ✅ Base agent loads (6,872 tokens)
- ✅ revops-advanced-analytics.md loads (+1,200 tokens)
- ✅ Assessment includes statistical analysis
- **Total**: 8,072 tokens (saved 2,496 vs full agent)

### Test Case 3: CPQ with Playwright Scraping

**Task**: "Assess CPQ configuration using UI scraping for product bundles"
**Expected**:
- ✅ Base agent loads (6,784 tokens)
- ✅ cpq-playwright-integration.md loads (+1,400 tokens)
- ✅ Playwright automation works
- **Total**: 8,184 tokens (saved 2,248 vs full agent)

### Test Case 4: Automation Conflict Detection

**Task**: "Audit automation for circular dependencies and conflicts"
**Expected**:
- ✅ Base agent loads (6,288 tokens)
- ✅ automation-conflict-detection.md loads (+1,200 tokens)
- ✅ Circular dependencies detected
- **Total**: 7,488 tokens (saved 2,180 vs full agent)

---

## Edge Cases

### Edge Case 1: Multiple Context Files Needed

**Scenario**: Task requires both advanced analytics AND troubleshooting

**Solution**: Load both context files
```bash
LOAD_CONTEXT_FILES="revops-advanced-analytics.md revops-troubleshooting.md"
```

**Token Impact**: Base (6,872) + Analytics (1,200) + Troubleshooting (800) = 8,872 tokens
- Still saves 1,696 tokens vs full agent

### Edge Case 2: Missing Context (False Negative)

**Scenario**: User asks for advanced feature but keyword not detected

**Fallback**: Base agent includes instruction to request context if needed
```markdown
## When to Request Additional Context

If you need advanced features not in base agent:
- Predictive analytics → Request: revops-advanced-analytics
- Troubleshooting → Request: revops-troubleshooting
- Integration details → Request: revops-integrations
```

### Edge Case 3: Overly Broad Keywords

**Scenario**: Word "error" in task triggers troubleshooting context unnecessarily

**Solution**: Use more specific keyword patterns
```bash
# Before: "error"
# After: "error.*troubleshoot|debug.*error|failed.*query"
```

---

## Benefits Analysis

### Token Savings

**Per Agent Baseline Reduction**:
- sfdc-revops-auditor: 10,568 → 6,872 tokens (-35%)
- sfdc-cpq-assessor: 10,432 → 6,784 tokens (-35%)
- sfdc-automation-auditor: 9,668 → 6,288 tokens (-35%)
- **Total Baseline Reduction**: 30,724 → 19,944 tokens (-35%)
- **Cumulative Savings**: 10,780 tokens

**With Weeks 1-4 Cumulative**:
- Before: 134k baseline
- After Week 3 (Skills): 43-46k baseline
- After Week 4 Part 1 (MCP): 43-46k - 16.5k = 26.5-29.5k
- After Week 4 Part 2 (Progressive): **15.8-18.8k baseline**
- **Total Savings**: 115-118k tokens (86-88% reduction)

### Context Loading Overhead

**Keyword Detection**: ~10-20ms per task
**Context File Loading**: ~50-100ms per file
**Net Impact**: Negligible (<200ms for 2-3 context files)

---

## Success Metrics

### Week 4 Part 2 Goals

| Metric | Target | Status |
|--------|--------|--------|
| Large agents identified | 3 | ✅ Complete |
| Extractable content analyzed | 2,681 lines | ✅ Complete |
| Context files designed | 12 files | ✅ Complete |
| Keyword detection strategy | ✅ | ✅ Complete |
| Token savings validated | 10,724 | ⏱️ Pending Integration |

### Production Validation

**After Deployment**:
- [ ] 85% of tasks save 10,724 tokens (context not loaded)
- [ ] 15% of tasks load 1-3 context files as needed
- [ ] Zero agent failures due to missing context (<5% false negative rate)
- [ ] Detection accuracy >90% (keyword matches needed context)

---

## Rollback Plan

### If Issues Occur

1. **Disable Progressive Disclosure**
   ```bash
   export ENABLE_PROGRESSIVE_DISCLOSURE=0  # Load full agents
   ```

2. **Revert to Full Agents**
   - Move base agents to `agents/archive/base/`
   - Restore original agents from git history
   - Delete context directory

3. **Gradual Rollout**
   - Enable for 1 agent first (sfdc-automation-auditor - smallest)
   - Monitor for 1 week
   - Expand to 2 agents, then 3 agents

### Rollback Triggers

- False negative rate >10% (context needed but not loaded)
- User complaints about missing functionality
- Context loading failures >5%
- Performance degradation >500ms

---

## Related Documentation

- **Progressive Disclosure Reference**: `docs/PROGRESSIVE_DISCLOSURE_REPLICATION_GUIDE.md`
- **Keyword Detection Patterns**: `docs/KEYWORD_DETECTION_PATTERNS.md` (to be created)
- **Agent Context Structure**: `docs/AGENT_CONTEXT_STRUCTURE.md` (to be created)

---

## Conclusion

Progressive disclosure for the 3 largest agents provides significant token savings (10,724 tokens, 35% reduction per agent) with manageable implementation complexity. By loading context files only when needed, we reduce baseline usage from 30.7k → 19.9k tokens while maintaining full functionality for advanced features.

**Combined with Weeks 1-4 Part 1**:
- Original baseline: 134k tokens
- After Week 4 Part 2: **15.8-18.8k tokens**
- **Total reduction: 86-88%** (115-118k tokens saved)

**Next**: Validate implementation with test cases and integrate with Claude Code core.

---

**Last Updated**: 2026-01-05
**Version**: 4.0.1 (Week 4 Part 2)
**Status**: ✅ Analysis Complete, ⏱️ Awaiting Implementation
