# Progressive Disclosure Replication Guide

**Version**: 1.0.0
**Date**: 2025-10-30
**Status**: Validated with sfdc-orchestrator (47.8% reduction, 40.7% avg savings)

---

## Overview

This guide provides a step-by-step process for applying progressive disclosure optimization to large agents (>1,500 lines). The pattern has been validated with `sfdc-orchestrator`, achieving:

- **47.8% base agent reduction** (2,030 → 1,060 lines)
- **40.7% weighted average token savings** (18,270 → 10,829 tokens)
- **100% detection accuracy** in testing
- **0% false positive rate**

---

## When to Use This Pattern

### Good Candidates ✅

Apply progressive disclosure when the agent has:
- **Size**: >1,500 lines (>13,500 tokens)
- **Clear sections**: Well-defined, extractable content blocks
- **Usage patterns**: Not all content needed for every request
- **Edge-case content**: Advanced patterns used <30% of the time

### Poor Candidates ❌

Do NOT use progressive disclosure when:
- **Size**: <1,000 lines (optimization overhead not worth it)
- **Highly coupled**: Content is tightly interconnected
- **Uniform usage**: All content needed for most requests
- **Core functionality**: Content defines essential behavior

---

## Phase 1: Analysis (Week 1)

### Step 1.1: Measure Baseline

```bash
# Count lines in agent file
wc -l agents/your-agent.md

# Estimate tokens (rough: 1 line ≈ 9 tokens)
LINES=$(wc -l < agents/your-agent.md)
TOKENS=$((LINES * 9))
echo "Estimated tokens: $TOKENS"
```

**Target**: Identify agents >1,500 lines for optimization.

---

### Step 1.2: Identify Extractable Sections

**Criteria for extraction**:
1. **Self-contained**: Section makes sense in isolation
2. **Keyword-triggerable**: Clear keywords/patterns to detect usage
3. **Low frequency**: Used in <30% of requests
4. **Substantial size**: >100 lines to justify extraction overhead

**Example analysis** (from sfdc-orchestrator):

| Section | Lines | Frequency | Extractable? | Reason |
|---------|-------|-----------|--------------|--------|
| Bulk Operations | 216 | <10% | ✅ Yes | Self-contained, clear keywords |
| Investigation Tools | 72 | ~25% | ✅ Yes | Debug-specific |
| Pre-Flight Validation | 145 | ~40% | ✅ Yes | Automation-specific |
| FLS Bundling | 217 | <15% | ✅ Yes | Field deployment-specific |
| Error Recovery | 152 | <20% | ✅ Yes | Error handling-specific |
| Core Orchestration | 800 | 100% | ❌ No | Used in every request |

**Tools to help**:
```bash
# Find section headers
grep "^## " agents/your-agent.md

# Count lines per section
awk '/^## Section Name/,/^## / {count++} END {print count}' agents/your-agent.md
```

---

### Step 1.3: Estimate Token Savings

**Formula**:
```
Potential Savings = Σ (SectionSize × (1 - UsageFrequency))

Where:
  SectionSize = tokens in section
  UsageFrequency = % of requests that need this section (0.0 to 1.0)
```

**Example**:
```
Bulk Operations: 216 lines × 9 = 1,944 tokens × (1 - 0.10) = 1,750 tokens saved
Investigation:    72 lines × 9 = 648 tokens × (1 - 0.25) = 486 tokens saved
Pre-Flight:      145 lines × 9 = 1,305 tokens × (1 - 0.40) = 783 tokens saved
...
Total potential savings: ~7,500 tokens (40% of original)
```

**Decision point**: Proceed if potential savings >30%.

---

## Phase 2: Implementation (Week 2, Days 1-3)

### Step 2.1: Create Context Directory Structure

```bash
# Create contexts directory
mkdir -p contexts/your-agent/

# Create keyword mapping config
touch contexts/keyword-mapping.json
```

**Directory structure**:
```
.claude-plugins/your-plugin/
├── agents/
│   └── your-agent.md (will be reduced)
├── contexts/
│   ├── keyword-mapping.json (configuration)
│   └── your-agent/
│       ├── section-1.md (extracted content)
│       ├── section-2.md (extracted content)
│       └── section-3.md (extracted content)
└── scripts/
    └── lib/
        ├── keyword-detector.js (copied from salesforce-plugin)
        └── context-injector.js (copied from salesforce-plugin)
```

---

### Step 2.2: Extract Sections to Context Files

**Template for context file**:

```markdown
# [Section Name] - Detailed Guide

**Context Type**: Progressive Disclosure (loaded on [keywords])
**Priority**: [High|Medium|Low]
**Trigger**: When [describe scenario]

---

## Overview

[Brief description of what this context provides]

---

## [Section Content]

[Full extracted content from agent]

---

**When This Context is Loaded**: When user message contains keywords: [list]

**Back to Core Agent**: See `your-agent.md` for overview

**Related Scripts**: [list any related scripts]
```

**Example**:
```markdown
# Bulk Operations for Orchestration - Detailed Guide

**Context Type**: Progressive Disclosure (loaded on "bulk", "batch", "parallel" keywords)
**Priority**: High
**Trigger**: When orchestrating multiple sub-agents or large datasets

---

## Overview

**CRITICAL**: Bulk operations achieve 3-4x faster orchestration through parallelization...

[Full content...]
```

---

### Step 2.3: Replace with Summaries in Base Agent

**Summary template** (30-50 lines):

```markdown
## [Section Name] (Summary)

**CRITICAL**: [One-sentence key message]

### Key Decision: When to Use [Pattern]
- [Decision criterion 1]
- [Decision criterion 2]

### [2-3 Core Concepts] (Summary)
1. **[Concept 1]**: [Brief description]
2. **[Concept 2]**: [Brief description]
3. **[Concept 3]**: [Brief description]

### Code Example (Summary)
```[language]
// Minimal illustrative example
[Key pattern code]
```

### Performance/Impact
- **[Metric 1]**: [Value]
- **[Metric 2]**: [Value]

### 📄 Detailed Guide
**For complete [topic] with [details]**, see: `contexts/your-agent/section-name.md`

**Trigger Keywords**: "[keyword1]", "[keyword2]", "[keyword3]"

**Related Scripts**: `[script1]`, `[script2]`
```

**Guidelines**:
- **Length**: 30-50 lines (enough to route correctly)
- **Decision criteria**: Clear "when to use" logic
- **Code**: Minimal example showing pattern
- **Metrics**: Impact/performance numbers
- **Reference**: Clear path to full context

---

### Step 2.4: Create Keyword Mapping Configuration

**Template**:

```json
{
  "$schema": "keyword-mapping-schema-v1.0",
  "version": "1.0.0",
  "description": "Keyword mapping for progressive disclosure",
  "agent": "your-agent",
  "contexts": {
    "section-name": {
      "priority": "high",
      "contextFile": "your-agent/section-name.md",
      "keywords": [
        "keyword1",
        "keyword2",
        "keyword3"
      ],
      "intentPatterns": [
        "regex-pattern-1",
        "regex-pattern-2"
      ],
      "description": "Brief description of what this context provides"
    }
  },
  "rules": {
    "maxContextsPerRequest": 8,
    "minKeywordMatches": 1,
    "priorityWeighting": {
      "high": 3,
      "medium": 2,
      "low": 1
    },
    "injectionOrder": "priority-desc",
    "fallbackBehavior": "none"
  }
}
```

**Priority guidelines**:
- **High**: Critical functionality, prevents errors (FLS bundling, validation)
- **Medium**: Helpful patterns, improves efficiency (investigation tools)
- **Low**: Optional features, quality-of-life (time tracking)

**Keyword selection**:
- **Specific terms**: "FLS", "field deployment", "bulk operation"
- **Action verbs**: "deploy", "validate", "debug"
- **Common phrases**: "create field", "parallel agents"

**Intent patterns** (regex):
- **More specific than keywords**: `(create|deploy|add).*(custom )?field`
- **Capture user intent**: `(coordinate|orchestrate).*(multiple|many).*agents?`
- **Worth 2x keywords**: More accurate matching

---

### Step 2.5: Validate Cross-References

**Checklist**:
- [ ] All summaries reference correct context files
- [ ] All context file paths exist and are valid
- [ ] All trigger keywords documented in keyword-mapping.json
- [ ] All related scripts referenced correctly
- [ ] No broken internal links between sections

**Validation script**:
```bash
#!/bin/bash
# validate-contexts.sh

AGENT_FILE="agents/your-agent.md"
CONTEXTS_DIR="contexts/your-agent"

# Check all context references exist
grep -o 'contexts/your-agent/[^)]*\.md' "$AGENT_FILE" | while read ref; do
  if [ ! -f "$ref" ]; then
    echo "❌ Missing context file: $ref"
  else
    echo "✅ Found: $ref"
  fi
done

# Check all contexts have summaries
for context in "$CONTEXTS_DIR"/*.md; do
  BASENAME=$(basename "$context" .md)
  if ! grep -q "$BASENAME (Summary)" "$AGENT_FILE"; then
    echo "⚠️  No summary found for: $BASENAME"
  fi
done
```

---

## Phase 3: Testing & Validation (Week 2, Days 4-5)

### Step 3.1: Copy Detection Infrastructure

**Copy these files from salesforce-plugin**:
```bash
# Copy keyword detector
cp salesforce-plugin/scripts/lib/keyword-detector.js your-plugin/scripts/lib/

# Copy context injector
cp salesforce-plugin/scripts/lib/context-injector.js your-plugin/scripts/lib/

# Copy test suite template
cp salesforce-plugin/scripts/test-progressive-disclosure.sh your-plugin/scripts/
```

**Modify for your agent**:
```bash
# Update paths in test script
sed -i 's/salesforce-plugin/your-plugin/g' your-plugin/scripts/test-progressive-disclosure.sh

# Update agent name
sed -i 's/sfdc-orchestrator/your-agent/g' your-plugin/scripts/test-progressive-disclosure.sh
```

---

### Step 3.2: Create Test Scenarios

**Test matrix**:

| Scenario | Prompt | Expected Contexts | Purpose |
|----------|--------|-------------------|---------|
| Core functionality | "[basic operation]" | 0-1 contexts | Baseline |
| Specific feature 1 | "[feature 1 keywords]" | Context 1 | Feature detection |
| Specific feature 2 | "[feature 2 keywords]" | Context 2 | Feature detection |
| Complex operation | "[multiple keywords]" | 2-3 contexts | Multi-context |
| Simple query | "[unrelated query]" | 0 contexts | False positive check |

**Example test scenarios**:
```bash
# Test 1: Core functionality
node keyword-detector.js "Standard deployment to sandbox"
# Expected: 0-1 contexts

# Test 2: Specific feature (FLS)
node keyword-detector.js "Deploy custom field with FLS permissions"
# Expected: fls-bundling-enforcement context

# Test 3: Complex operation
node keyword-detector.js "Debug failed bulk deployment with validation errors"
# Expected: 3-4 contexts (error-recovery, bulk-operations, validation)

# Test 4: False positive check
node keyword-detector.js "Query Account records"
# Expected: 0 contexts
```

---

### Step 3.3: Measure Token Savings

**Script to measure**:
```bash
#!/bin/bash
# measure-token-savings.sh

AGENT_FILE="agents/your-agent.md"
CONTEXTS_DIR="contexts/your-agent"

# Measure base agent
BASE_LINES=$(wc -l < "$AGENT_FILE")
BASE_TOKENS=$((BASE_LINES * 9))

echo "Base agent: $BASE_LINES lines (~$BASE_TOKENS tokens)"
echo ""

# Measure each context
TOTAL_CONTEXT_LINES=0
for context in "$CONTEXTS_DIR"/*.md; do
  LINES=$(wc -l < "$context")
  TOKENS=$((LINES * 9))
  TOTAL_CONTEXT_LINES=$((TOTAL_CONTEXT_LINES + LINES))
  printf "  %-40s %4d lines (~%5d tokens)\n" "$(basename "$context")" "$LINES" "$TOKENS"
done

TOTAL_CONTEXT_TOKENS=$((TOTAL_CONTEXT_LINES * 9))
echo ""
echo "Total contexts: $TOTAL_CONTEXT_LINES lines (~$TOTAL_CONTEXT_TOKENS tokens)"
echo ""

# Calculate scenarios
echo "Token usage by scenario:"
echo "  Simple (0 contexts, 70%): $BASE_TOKENS tokens"
echo "  Moderate (2 contexts, 20%): $((BASE_TOKENS + 2 * 2000)) tokens"
echo "  Complex (4 contexts, 10%): $((BASE_TOKENS + 4 * 2000)) tokens"
echo ""

# Weighted average
WEIGHTED=$((BASE_TOKENS * 70 / 100 + (BASE_TOKENS + 4000) * 20 / 100 + (BASE_TOKENS + 8000) * 10 / 100))
echo "Weighted average: $WEIGHTED tokens"
```

---

### Step 3.4: Validate Accuracy

**Success criteria**:
- ✅ **Detection accuracy**: >95% (test prompts match expected contexts)
- ✅ **False positive rate**: <5% (simple queries don't load unnecessary contexts)
- ✅ **Priority ordering**: High-priority contexts ranked first
- ✅ **Token savings**: >30% weighted average

**If tests fail**:
1. **Low detection accuracy**: Add more keywords/patterns to keyword-mapping.json
2. **High false positives**: Make keywords more specific, increase minKeywordMatches
3. **Wrong priority**: Adjust priority weighting or context priorities
4. **Low token savings**: Extract more sections or choose different sections

---

## Phase 4: Refinement

### Keyword Tuning

**If over-matching** (too many contexts loaded):
```json
{
  "rules": {
    "minKeywordMatches": 2,  // Increase from 1
    "maxContextsPerRequest": 4  // Decrease from 8
  }
}
```

**If under-matching** (missing relevant contexts):
```json
{
  "contexts": {
    "your-context": {
      "keywords": [
        "existing-keyword",
        "new-synonym1",
        "new-synonym2",
        "related-term"
      ],
      "intentPatterns": [
        "new-pattern-to-catch-more-cases"
      ]
    }
  }
}
```

---

### Summary Quality Check

**Good summary example**:
```markdown
## Advanced Pattern (Summary)

**CRITICAL**: Use this pattern for X operations

### When to Use
- Multiple agents needed (>3)
- Independent operations
- Performance critical

### Core Pattern
```javascript
// Parallel execution
await Promise.all(tasks.map(task => execute(task)));
```

### Impact
- **3-4x faster** than sequential
- **95% reliability** with validation

### 📄 Detailed Guide
See `contexts/agent/advanced-pattern.md`
```

**Poor summary example**:
```markdown
## Advanced Pattern

See the context file for details.
```
❌ **Problem**: No decision criteria, no code example, no metrics

---

## Common Pitfalls

### 1. Extracting Core Functionality ❌

**Wrong**:
```
Extract "Basic Orchestration Pattern" (used in 100% of requests)
```

**Right**:
```
Extract "Advanced Parallel Pattern" (used in <20% of requests)
```

---

### 2. Summaries Too Short ❌

**Wrong** (10 lines):
```markdown
## Feature (Summary)
Use this for advanced operations.
See context file.
```

**Right** (35 lines):
```markdown
## Feature (Summary)

### When to Use
- [Clear criteria]

### Core Concepts
1. [Concept]
2. [Concept]

### Code Example
[Minimal code]

### Impact
[Metrics]

### Detailed Guide
[Reference]
```

---

### 3. No False Positive Testing ❌

**Wrong**:
```bash
# Only test feature-specific prompts
test "Deploy field"
test "Bulk operation"
```

**Right**:
```bash
# Test feature-specific AND simple prompts
test "Deploy field"
test "Bulk operation"
test "Simple query"  # Should load 0 contexts
```

---

## Success Metrics

### Target Metrics (from sfdc-orchestrator validation)

| Metric | Target | Achieved | Status |
|--------|--------|----------|--------|
| **Base agent reduction** | 40-50% | 47.8% | ✅ |
| **Weighted avg savings** | >30% | 40.7% | ✅ |
| **Detection accuracy** | >95% | 100% | ✅ |
| **False positive rate** | <5% | 0% | ✅ |
| **Test success rate** | >90% | 100% | ✅ |

---

## Phase 2 Candidate Analysis

### Top Candidates for Next Optimization

Based on size and usage patterns:

1. **sfdc-metadata-manager** (2,760 lines)
   - **Potential savings**: ~45% (9 domains identified)
   - **Complexity**: High (tight coupling between domains)
   - **Recommendation**: Phase 2, Week 1

2. **sfdc-data-operations** (2,619 lines)
   - **Potential savings**: ~40% (6 domains identified)
   - **Complexity**: Medium (clearer domain boundaries)
   - **Recommendation**: Phase 2, Week 2

3. **hubspot-orchestrator** (1,800 lines)
   - **Potential savings**: ~35%
   - **Complexity**: Medium
   - **Recommendation**: Phase 2, Week 3

---

## Checklist

Use this checklist to track progress:

**Week 1: Analysis**
- [ ] Measured baseline (lines and tokens)
- [ ] Identified extractable sections (>100 lines each)
- [ ] Estimated token savings (>30% potential)
- [ ] Documented analysis in markdown file

**Week 2, Days 1-2: Extraction**
- [ ] Created contexts directory structure
- [ ] Extracted 3-5 sections to context files
- [ ] Added context headers and metadata
- [ ] Created keyword-mapping.json

**Week 2, Day 3: Optimization**
- [ ] Replaced extracted sections with summaries
- [ ] Validated all cross-references
- [ ] Measured actual line/token reduction
- [ ] Documented Day 3 progress

**Week 2, Day 4: Infrastructure**
- [ ] Copied keyword-detector.js
- [ ] Copied context-injector.js
- [ ] Created test suite with 5+ scenarios
- [ ] Ran all tests successfully

**Week 2, Day 5: Validation**
- [ ] Measured token savings (actual vs estimated)
- [ ] Validated detection accuracy (>95%)
- [ ] Checked false positive rate (<5%)
- [ ] Documented final results

---

## Support & Resources

### Reference Implementation

**Agent**: `salesforce-plugin/agents/sfdc-orchestrator.md`
- Original: 2,030 lines
- Optimized: 1,060 lines
- Savings: 47.8% reduction, 40.7% avg savings

**Infrastructure**:
- `scripts/lib/keyword-detector.js` (191 lines)
- `scripts/lib/context-injector.js` (182 lines)
- `scripts/test-progressive-disclosure.sh` (292 lines)

### Documentation

- **Week 1 Analysis**: `docs/sfdc-orchestrator-analysis.md`
- **Day-by-day progress**: `docs/week-2-day-{1-5}-complete.md`
- **This guide**: `docs/PROGRESSIVE_DISCLOSURE_REPLICATION_GUIDE.md`

---

## FAQ

**Q: How long does this process take?**
A: 5-7 days for first agent, 3-4 days for subsequent agents

**Q: What if token savings are <30%?**
A: Don't proceed - overhead not worth the complexity. Consider other optimizations.

**Q: Can I extract smaller sections (<100 lines)?**
A: Yes, but overhead may not be worth it. Prefer extracting larger, self-contained sections.

**Q: What if sections are tightly coupled?**
A: Either extract together as one large context, or don't extract at all. Avoid breaking dependencies.

**Q: How do I know if keywords are too broad?**
A: Test with simple queries - if they load contexts unnecessarily, keywords are too broad.

---

## Version History

- **v1.0.0** (2025-10-30): Initial version based on sfdc-orchestrator optimization
  - Validated with 47.8% reduction, 40.7% savings
  - 100% test success rate
  - Ready for replication

---

**Maintained by**: Agent Optimization Team
**Last Updated**: 2025-10-30
