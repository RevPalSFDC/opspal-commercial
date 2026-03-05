# Week 2 Implementation Plan: Context-Based Skill Filtering

**Date**: 2026-01-05
**Status**: Planning Complete, Ready for Implementation
**Goal**: Reduce baseline context from ~75k → ~54-64k tokens

## Week 1 Achievements ✅

- ✅ Plugin selector implemented (100% test pass rate, 85.7% avg savings)
- ✅ Hooks created (context safeguard, batch pattern recommendations)
- ✅ Documentation updated (routing rules, best practices)
- ✅ Test suite validated (21/21 tests passing)

**Current State**: Plugin-level filtering complete (~59k token savings)

---

## Week 2 Objectives

### Primary Goal
Implement **skill-level filtering** within selected plugins to load only relevant skills per task.

### Target Metrics
- **Baseline context**: 75k → **54-64k tokens** (20-30k additional savings)
- **Skills loaded per task**: 29 avg → **15-25** (40-50% reduction)
- **Detection accuracy**: >90% relevance
- **Miss rate**: <5% (needed skills not loaded)

---

## Architecture Overview

```
User Task Description
    ↓
[Week 1: Plugin Selector]  ← COMPLETE
    ↓
Selected Plugins (1-4 plugins)
    ↓
[Week 2: Skill Filter]  ← THIS WEEK
    ↓
Filtered Skills (15-25 skills per task)
    ↓
Claude Code (load only filtered skills)
```

---

## Implementation Components

### 1. Skill Metadata Collection

**Purpose**: Gather all skill/command metadata from plugins

**Script**: `scripts/lib/skill-metadata-collector.js`

**What it does**:
- Scans `.claude-plugins/*/commands/*.md`
- Scans `.claude-plugins/*/skills/*/SKILL.md`
- Extracts: name, description, plugin, keywords
- Generates: `scripts/lib/skill-metadata.json`

**Output Format**:
```json
{
  "salesforce-plugin": [
    {
      "name": "cpq-preflight",
      "description": "Run comprehensive pre-flight validation before CPQ assessments",
      "path": ".claude-plugins/opspal-salesforce/commands/cpq-preflight.md",
      "keywords": ["cpq", "quote", "pricing", "validate", "preflight"]
    },
    ...
  ],
  ...
}
```

---

### 2. Skill Filter Class

**Purpose**: Score and filter skills based on task relevance

**Script**: `scripts/lib/skill-filter.js`

**Algorithm**:
```javascript
calculateRelevance(skill, taskKeywords) {
  score = 0;

  // Exact platform match: +100
  if (skill.plugin matches taskKeywords.platforms) score += 100;

  // Operation match: +50
  if (skill.keywords overlap taskKeywords.operations) score += 50;

  // Domain match: +30
  if (skill.keywords overlap taskKeywords.domains) score += 30;

  // Task word match: +10 per match (max +20)
  score += min(countMatchingWords(skill, task) * 10, 20);

  // Usage frequency bonus: +20 (if tracked)
  if (skill.usageCount > 10) score += 20;

  return score;
}
```

**Thresholds**:
- Score >= 50: Load skill
- Score >= 100: High priority
- Score < 50: Skip skill

---

### 3. Integration Point

**Where**: Claude Code skill loading mechanism

**Hook**: `.claude/hooks/pre-skill-load.sh` (new)

**Process**:
```bash
#!/bin/bash
# Called by Claude Code before loading skills

TASK_DESC="$1"

# Step 1: Select plugins
PLUGINS=$(node scripts/lib/plugin-selector.js "$TASK_DESC" --json)

# Step 2: Filter skills within selected plugins
FILTERED_SKILLS=$(node scripts/lib/skill-filter.js "$TASK_DESC" --plugins "$PLUGINS" --json)

# Step 3: Export for Claude Code
export LOAD_SKILLS="$FILTERED_SKILLS"

echo "📦 Loading $SKILL_COUNT skills from $PLUGIN_COUNT plugins"
```

**Note**: Requires Claude Code core modification to call hook and respect $LOAD_SKILLS

---

## Implementation Steps

### Day 1-2: Skill Metadata Collection

**Tasks**:
1. ✅ Create `skill-metadata-collector.js`
2. ✅ Scan all plugins for skills/commands
3. ✅ Extract metadata (name, description, keywords)
4. ✅ Generate `skill-metadata.json`
5. ✅ Validate completeness (all 206 skills captured)

**Deliverable**: `scripts/lib/skill-metadata.json`

---

### Day 3-4: Skill Filter Implementation

**Tasks**:
1. ✅ Create `skill-filter.js` class
2. ✅ Implement relevance scoring algorithm
3. ✅ Add keyword matching logic
4. ✅ Integrate with `PluginSelector`
5. ✅ Handle edge cases (zero matches, high scores)

**Deliverable**: `scripts/lib/skill-filter.js`

---

### Day 5-6: Testing & Validation

**Tasks**:
1. ✅ Test with 20 sample tasks across platforms
2. ✅ Measure token savings (target: 20-30k additional)
3. ✅ Validate relevance (>90% relevant skills loaded)
4. ✅ Check miss rate (<5% needed skills missing)
5. ✅ Benchmark performance (<50ms overhead)

**Deliverable**: `scripts/test-skill-filter.js` + results

---

### Day 7: Documentation & Review

**Tasks**:
1. ✅ Document skill filtering algorithm
2. ✅ Update `CONDITIONAL_PLUGIN_LOADING.md`
3. ✅ Create usage guide for teams
4. ✅ Prepare Week 3 handoff

**Deliverable**: Documentation updates

---

## Expected Token Savings Breakdown

### Current State (After Week 1)
- **Baseline**: ~75k tokens
- **Plugins loaded**: 1-4 (avg 2.1)
- **Skills loaded**: 29 avg (from selected plugins)

### After Week 2 (Skill Filtering)
- **Baseline**: ~54-64k tokens
- **Plugins loaded**: 1-4 (same)
- **Skills loaded**: 15-25 (filtered by relevance)

### Calculation
```
Current: 29 skills × 335 tokens/skill = 9,715 tokens
Target:  20 skills × 335 tokens/skill = 6,700 tokens
Savings: 9,715 - 6,700 = 3,015 tokens per task

But with better targeting:
- Simple tasks: 12 skills → 4,020 tokens
- Complex tasks: 30 skills → 10,050 tokens
Average: 18 skills × 335 = 6,030 tokens

Total additional savings: ~3,685 tokens (38% reduction in skills)
```

---

## Test Cases for Week 2

### Category 1: Simple Platform-Specific Tasks (expect 12-15 skills)

1. "Import leads to Salesforce"
   - Expected: SF data-import skills only
   - Skills: 12-15

2. "Create HubSpot workflow"
   - Expected: HS workflow skills only
   - Skills: 10-12

3. "Generate PDF report"
   - Expected: Cross-platform PDF skills only
   - Skills: 8-10

---

### Category 2: Specialized Domain Tasks (expect 15-20 skills)

4. "Run CPQ assessment"
   - Expected: SF CPQ + Cross-platform reporting
   - Skills: 18-20

5. "Audit RevOps pipeline"
   - Expected: SF RevOps + reporting/analysis
   - Skills: 15-18

6. "Configure lead scoring"
   - Expected: HS/Marketo scoring skills
   - Skills: 12-15

---

### Category 3: Multi-Platform Tasks (expect 25-30 skills)

7. "Sync data between Salesforce and HubSpot"
   - Expected: SF data + HS data + Cross sync
   - Skills: 28-30

8. "Generate executive dashboard with SF and HS data"
   - Expected: SF reporting + HS reporting + Cross dashboard
   - Skills: 30-35

9. "Deduplicate contacts across all systems"
   - Expected: SF data + HS data + Cross dedup + Data hygiene
   - Skills: 25-28

---

### Category 4: Edge Cases (expect variable)

10. "Help me with this project"
    - Expected: Core skills from 3 platforms
    - Skills: 20-25

---

## Success Criteria

### Must Have (Week 2)
- ✅ Skill metadata collected (all 206 skills)
- ✅ Skill filter implemented and tested
- ✅ Token savings validated (>3k additional)
- ✅ Relevance validated (>90%)
- ✅ Performance acceptable (<50ms)

### Nice to Have
- ⏱️ Usage tracking integration (defer to Week 3)
- ⏱️ Skill recommendation system (defer to Week 3)
- ⏱️ Dynamic threshold adjustment (defer to Week 3)

---

## Risk Mitigation

### Risk 1: Too Few Skills Loaded (High Miss Rate)

**Mitigation**:
- Set minimum skills per plugin (e.g., 10 skills minimum)
- Lower relevance threshold if <10 skills match
- Fallback to top N most-used skills

### Risk 2: Relevance Scoring Inaccurate

**Mitigation**:
- Test with diverse tasks (20+ samples)
- Adjust scoring weights based on results
- Allow manual threshold tuning

### Risk 3: Performance Overhead

**Mitigation**:
- Cache skill metadata (load once)
- Optimize keyword matching (use Sets)
- Profile and optimize bottlenecks

---

## Integration Requirements

### Claude Code Core Changes Required

1. **Pre-Skill-Load Hook**
   - Call `.claude/hooks/pre-skill-load.sh` before loading skills
   - Pass task description as argument
   - Respect `$LOAD_SKILLS` environment variable

2. **Conditional Skill Loading**
   - Parse filtered skill list from hook
   - Load only specified skills (not all from plugin)
   - Handle missing skills gracefully

3. **Monitoring/Logging**
   - Log which skills were loaded
   - Track miss rate (skills requested but not loaded)
   - Report token savings per task

**Timeline**: Requires coordination with Claude Code team

---

## Rollback Plan

If Week 2 implementation causes issues:

1. **Disable skill filtering**: Set all topN to plugin max
2. **Increase thresholds**: Lower min score to 30
3. **Revert to plugin-level only**: Skip skill filtering, keep plugin filtering

**Rollback triggers**:
- Miss rate >10%
- Performance degradation >100ms
- User complaints about missing functionality

---

## Week 3 Preview

After Week 2 completes:

1. **Usage-Based Prioritization**
   - Track which skills are actually used
   - Create "hot path" (top 50 most-used)
   - Lazy-load "cold path" (remaining skills)

2. **Agent-Scoped MCP Loading**
   - Implement conditional Playwright MCP loading
   - Save additional 16.5k tokens (8.2%)

3. **Progressive Disclosure (Part 1)**
   - Apply to sfdc-metadata-manager
   - Apply to sfdc-data-operations
   - Save ~4-5k tokens

---

## Deliverables Checklist

- [ ] `scripts/lib/skill-metadata-collector.js`
- [ ] `scripts/lib/skill-metadata.json` (generated)
- [ ] `scripts/lib/skill-filter.js`
- [ ] `scripts/test-skill-filter.js`
- [ ] `.claude/hooks/pre-skill-load.sh` (stub for Claude Code integration)
- [ ] `docs/SKILL_FILTER_TEST_RESULTS.md`
- [ ] Updated `docs/CONDITIONAL_PLUGIN_LOADING.md`

---

**Last Updated**: 2026-01-05
**Status**: Ready to begin Day 1
**Owner**: RevPal Engineering
