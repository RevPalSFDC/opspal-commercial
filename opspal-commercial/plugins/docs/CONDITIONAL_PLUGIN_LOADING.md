# Conditional Plugin/Skill Loading Strategy

**Date**: 2026-01-05
**Status**: Proposed
**Goal**: Reduce baseline context from 134k → <60k tokens by loading only relevant plugins/skills per task

## Problem Statement

**Current Behavior**:
- All 9 plugins loaded unconditionally
- All 206 skills loaded on every invocation
- **Baseline context**: 110-134k tokens (55-67% of limit) in fresh conversation
- **Skills alone**: ~69k tokens (35% of limit)

**Impact**:
- Only 66-90k tokens available for actual work (33-45% of limit)
- Context exhaustion on complex tasks
- Slow performance due to large context processing

## Solution: Context-Aware Lazy Loading

### Approach

Instead of loading all plugins/skills upfront, **detect task context** and load only relevant resources:

1. **Parse user intent** from task description
2. **Extract keywords** (platform, operation, domain)
3. **Score plugin/skill relevance**
4. **Load only high-scoring resources**

### Implementation Architecture

```
User Task
    ↓
Keyword Extraction
    ↓
Relevance Scoring
    ↓
Plugin Selection (top N plugins)
    ↓
Skill Filtering (top M skills per plugin)
    ↓
Dynamic Loading
    ↓
Execute Task
```

---

## Keyword Detection Matrix

| Keyword Category | Keywords | Loads Plugin(s) | Loads Skills |
|------------------|----------|-----------------|--------------|
| **Salesforce** | salesforce, sfdc, apex, lightning, cpq, revops, opportunity, lead, account | salesforce-plugin | cpq, revops, automation, data-ops |
| **HubSpot** | hubspot, hs, workflow, deal, contact, company, cms | hubspot-plugin | workflow, data, seo, automation |
| **Cross-Platform** | diagram, flowchart, erd, pdf, report, dashboard, sync, integration | opspal-core | diagram, pdf, task-graph, solution |
| **Marketo** | marketo, mql, nurture, scoring, program, email | marketo-plugin | All marketo skills |
| **Data Operations** | import, export, csv, bulk, migrate, deduplicate, enrich | salesforce-plugin, hubspot-plugin, data-hygiene-plugin | data-import, data-export, dedup |
| **Monday.com** | monday, board, item, file, catalog | monday-plugin | All monday skills |
| **GTM Planning** | go-to-market, gtm, launch, strategy | gtm-planning-plugin | All gtm skills |
| **AI Consulting** | ai, consult, strategy, assessment | ai-consult-plugin | All ai-consult skills |
| **Developer Tools** | plugin, agent, quality, validate | developer-tools-plugin | Development skills |

---

## Loading Strategy

### Tier 1: Always Load (Core - ~40k tokens)
**Plugins**:
- salesforce-plugin (baseline: top 15 skills)
- hubspot-plugin (baseline: top 10 skills)
- opspal-core (baseline: top 10 skills)

**Rationale**: Most common tasks involve these platforms

---

### Tier 2: Conditional Load Based on Keywords (~20-30k tokens)
**If keywords match**:
- marketo-plugin → Load when "marketo", "mql", "nurture" detected
- monday-plugin → Load when "monday", "board" detected
- gtm-planning-plugin → Load when "gtm", "launch" detected
- ai-consult-plugin → Load when "ai", "consult" detected
- data-hygiene-plugin → Load when "deduplicate", "enrich" detected

**Rationale**: These are specialized, less-frequent use cases

---

### Tier 3: Lazy Load Additional Skills (~0-10k tokens)
**After initial plugin load**:
- If task requires specialized skills (e.g., "CPQ pricing audit"), load additional salesforce-plugin CPQ skills
- If task involves diagrams, load additional cross-platform diagram templates

**Rationale**: Most tasks don't need ALL skills from a plugin

---

## Implementation Steps

### Phase 1: Keyword Extraction (Week 1)

**Create**: `scripts/lib/task-keyword-extractor.js`
```javascript
class TaskKeywordExtractor {
  constructor(taskDescription) {
    this.text = taskDescription.toLowerCase();
    this.keywords = {
      platforms: [],
      operations: [],
      domains: []
    };
  }

  extract() {
    this.extractPlatforms();
    this.extractOperations();
    this.extractDomains();
    return this.keywords;
  }

  extractPlatforms() {
    const platformMap = {
      salesforce: ['salesforce', 'sfdc', 'apex', 'lightning'],
      hubspot: ['hubspot', 'hs'],
      marketo: ['marketo'],
      monday: ['monday'],
      'cross-platform': ['diagram', 'flowchart', 'pdf', 'report']
    };

    for (const [platform, keywords] of Object.entries(platformMap)) {
      if (keywords.some(kw => this.text.includes(kw))) {
        this.keywords.platforms.push(platform);
      }
    }
  }

  extractOperations() {
    const operations = ['import', 'export', 'audit', 'deploy', 'analyze', 'optimize'];
    this.keywords.operations = operations.filter(op => this.text.includes(op));
  }

  extractDomains() {
    const domains = ['cpq', 'revops', 'workflow', 'data', 'territory', 'flow'];
    this.keywords.domains = domains.filter(d => this.text.includes(d));
  }
}

module.exports = { TaskKeywordExtractor };
```

---

### Phase 2: Plugin Selector (Week 1)

**Create**: `scripts/lib/plugin-selector.js`
```javascript
const { TaskKeywordExtractor } = require('./task-keyword-extractor');

class PluginSelector {
  constructor(taskDescription) {
    this.extractor = new TaskKeywordExtractor(taskDescription);
    this.keywords = this.extractor.extract();
    this.plugins = [];
  }

  selectPlugins() {
    // Tier 1: Always load core plugins (with baseline skills)
    this.plugins = ['salesforce-plugin', 'hubspot-plugin', 'opspal-core'];

    // Tier 2: Conditional load based on keywords
    if (this.keywords.platforms.includes('marketo')) {
      this.plugins.push('marketo-plugin');
    }
    if (this.keywords.platforms.includes('monday')) {
      this.plugins.push('monday-plugin');
    }
    if (this.keywords.operations.includes('deduplicate') || this.keywords.operations.includes('enrich')) {
      this.plugins.push('data-hygiene-plugin');
    }
    if (this.text.includes('gtm') || this.text.includes('launch') || this.text.includes('go-to-market')) {
      this.plugins.push('gtm-planning-plugin');
    }
    if (this.text.includes('ai ') || this.text.includes('consult')) {
      this.plugins.push('ai-consult-plugin');
    }

    return this.plugins;
  }

  getSkillFilter() {
    return {
      platforms: this.keywords.platforms,
      operations: this.keywords.operations,
      domains: this.keywords.domains
    };
  }
}

module.exports = { PluginSelector };
```

---

### Phase 3: Skill Filter (Week 2)

**Create**: `scripts/lib/skill-filter.js`
```javascript
class SkillFilter {
  constructor(pluginName, keywords) {
    this.pluginName = pluginName;
    this.keywords = keywords;
    this.skills = [];
  }

  filterSkills(allSkills) {
    // Score each skill based on keyword relevance
    const scored = allSkills.map(skill => ({
      skill,
      score: this.calculateRelevance(skill)
    }));

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Return top N skills (N varies by plugin)
    const topN = this.getTopNForPlugin(this.pluginName);
    return scored.slice(0, topN).map(s => s.skill);
  }

  calculateRelevance(skill) {
    let score = 0;
    const skillText = (skill.name + ' ' + skill.description).toLowerCase();

    // Platform match: +100
    if (this.keywords.platforms.some(p => skillText.includes(p))) score += 100;

    // Operation match: +50
    if (this.keywords.operations.some(op => skillText.includes(op))) score += 50;

    // Domain match: +30
    if (this.keywords.domains.some(d => skillText.includes(d))) score += 30;

    // Usage frequency: +20 (if available)
    if (skill.usageCount > 10) score += 20;

    return score;
  }

  getTopNForPlugin(pluginName) {
    const baselineSkillCounts = {
      'salesforce-plugin': 15,   // Top 15 of 68
      'hubspot-plugin': 10,       // Top 10 of 27
      'opspal-core': 10, // Top 10 of 74
      'marketo-plugin': 19,       // All skills (small plugin)
      'monday-plugin': 1,         // All skills (tiny plugin)
      'gtm-planning-plugin': 2,   // All skills (tiny plugin)
      'ai-consult-plugin': 2,     // All skills (tiny plugin)
      'data-hygiene-plugin': 2    // All skills (tiny plugin)
    };
    return baselineSkillCounts[pluginName] || 5;
  }
}

module.exports = { SkillFilter };
```

---

### Phase 4: Integration with Claude Code (Week 2)

**Hook Point**: Pre-skill-load hook

**Create**: `.claude/hooks/pre-skill-load.sh`
```bash
#!/bin/bash
# Conditionally loads plugins/skills based on task context

TASK_DESC="$1"

# Run plugin selector
SELECTED_PLUGINS=$(node scripts/lib/plugin-selector.js "$TASK_DESC")

# Export for Claude Code to use
export LOAD_PLUGINS="$SELECTED_PLUGINS"

echo "📦 Loading plugins: $SELECTED_PLUGINS"
```

**Integration**: Requires Claude Code core modification to:
1. Call pre-skill-load hook with task description
2. Respect $LOAD_PLUGINS environment variable
3. Filter skills based on relevance scoring

---

## Expected Token Savings

### Baseline (Current)
- All plugins loaded: 206 skills = ~69k tokens
- Total baseline: 134k tokens (67% of limit)

### After Tier 1 (Always Load Core)
- 3 plugins (salesforce, hubspot, cross-platform)
- Top 35 skills (15+10+10) = ~11,725 tokens
- **Savings**: ~57k tokens (83% reduction in skill context)
- **New baseline**: ~77k tokens (38% of limit)

### After Tier 2 (Conditional Load)
- Average task: 3-4 plugins, 40-50 skills = ~13,400-16,750 tokens
- **New baseline**: ~79-82k tokens (40% of limit)

### After Tier 3 (Lazy Load)
- Specialized tasks: Load additional 10-15 skills = +3,350-5,025 tokens
- **New baseline**: ~82-87k tokens (41-44% of limit)

**Target**: **<80k baseline tokens** (down from 134k, 40% reduction)

---

## Monitoring & Validation

### Metrics to Track
1. **Baseline context usage** (fresh conversation)
   - Target: <80k tokens (40% of limit)
2. **Skill load accuracy** (relevant skills loaded?)
   - Target: >90% relevance
3. **Skill load completeness** (all needed skills loaded?)
   - Target: <5% miss rate
4. **Performance** (skill filtering time)
   - Target: <200ms overhead

### Validation Tests
```bash
# Test 1: Salesforce CPQ task
node scripts/test-plugin-selector.js "Run CPQ assessment for eta-corp"
# Expected: salesforce-plugin, opspal-core
# Skills: cpq-preflight, cpq-assessment, diagram

# Test 2: HubSpot workflow task
node scripts/test-plugin-selector.js "Create workflow to send email on deal close"
# Expected: hubspot-plugin
# Skills: workflow-builder, email-campaign

# Test 3: Cross-platform report
node scripts/test-plugin-selector.js "Generate executive dashboard with SF and HS data"
# Expected: salesforce-plugin, hubspot-plugin, opspal-core
# Skills: data-export, reporting, diagram, pdf

# Test 4: Marketo scoring
node scripts/test-plugin-selector.js "Set up lead scoring model in Marketo"
# Expected: marketo-plugin
# Skills: create-scoring-model, marketo-instance
```

---

## Rollback Plan

If conditional loading causes issues:
1. Increase Tier 1 skill counts (15/10/10 → 25/15/15)
2. Lower relevance score threshold (load more skills)
3. Disable conditional loading (revert to current behavior)

**Rollback trigger**: >10% miss rate (needed skills not loaded)

---

## Next Steps

1. ✅ **Week 1**: Implement keyword extraction and plugin selector
2. ⏱️ **Week 2**: Implement skill filter and integrate with Claude Code
3. ⏱️ **Week 3**: Test with 50 real-world tasks, measure accuracy
4. ⏱️ **Week 4**: Fine-tune thresholds, document learnings
5. ⏱️ **Week 5**: Roll out to team with monitoring

---

**Last Updated**: 2026-01-05
**Status**: Ready for implementation
**Owner**: RevPal Engineering
