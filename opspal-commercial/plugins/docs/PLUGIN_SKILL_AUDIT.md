# Plugin Skill/Command Audit

**Date**: 2026-01-05
**Purpose**: Identify token usage from skill/command files to optimize context window

## Summary

| Metric | Value |
|--------|-------|
| Total plugins | 9 |
| Total skills/commands | 206 |
| Estimated total tokens | ~69,000 tokens (35% of 200k limit) |
| Average tokens per skill | ~335 tokens |

## Breakdown by Plugin

| Plugin | Commands | Skills | Total | Est. Tokens | Status |
|--------|----------|--------|-------|-------------|--------|
| **opspal-core** | 68 | 6 | **74** | ~24,790 | ✅ ACTIVE |
| **salesforce-plugin** | 51 | 17 | **68** | ~22,780 | ✅ ACTIVE |
| **hubspot-plugin** | 21 | 6 | **27** | ~9,045 | ✅ ACTIVE |
| **marketo-plugin** | 16 | 3 | **19** | ~6,365 | ⚠️ DISABLE |
| **developer-tools-plugin** | 11 | 0 | **11** | ~3,685 | 🔧 INTERNAL (gitignored) |
| **monday-plugin** | 1 | 0 | **1** | ~335 | ⚠️ DISABLE |
| **gtm-planning-plugin** | 0 | 2 | **2** | ~670 | ⚠️ DISABLE |
| **data-hygiene-plugin** | 1 | 1 | **2** | ~670 | ⚠️ DISABLE |
| **ai-consult-plugin** | 2 | 0 | **2** | ~670 | ⚠️ DISABLE |
| **TOTAL** | **171** | **35** | **206** | **~69,010** | |

## Recommendations

### Immediate Actions (Week 1)

**Disable unused plugins** (saves ~8,040 tokens, 12% reduction):
- ❌ marketo-plugin (19 skills, ~6,365 tokens)
- ❌ gtm-planning-plugin (2 skills, ~670 tokens)
- ❌ monday-plugin (1 skill, ~335 tokens)
- ❌ ai-consult-plugin (2 skills, ~670 tokens)

**Total savings**: 24 skills = ~8,040 tokens

### Medium-term Actions (Weeks 2-3)

**Context-based skill filtering** for active plugins:
- Filter salesforce-plugin skills (68) → load ~20 relevant = save ~16,080 tokens
- Filter opspal-core skills (74) → load ~15 relevant = save ~19,765 tokens
- Filter hubspot-plugin skills (27) → load ~10 relevant = save ~5,695 tokens

**Total potential savings**: ~41,540 tokens (60% reduction from active plugins)

### Long-term Actions (Week 3+)

**Usage-based prioritization**:
1. Track skill invocation frequency
2. Create "hot path" (top 50 most-used skills)
3. Lazy-load "cold path" (remaining 156 skills)

**Expected additional savings**: ~40,000 tokens (58% reduction)

## Implementation Notes

### Plugin Disable Method

Create `.claude/settings.json`:
```json
{
  "plugins": {
    "disabled": [
      "marketo-plugin",
      "gtm-planning-plugin",
      "monday-plugin",
      "ai-consult-plugin",
      "data-hygiene-plugin"
    ]
  }
}
```

**Note**: data-hygiene-plugin added to disable list (2 skills, low usage, functionality covered by platform-specific agents)

### Context-Based Filtering Design

**Week 2 implementation**: `scripts/lib/skill-context-filter.js`

**Keyword extraction**:
- Platform: salesforce, hubspot, marketo, monday
- Operation: import, export, audit, deploy, analyze, optimize
- Domain: cpq, revops, workflow, data, territory, flow

**Relevance scoring**:
- Exact match: 100 points
- Partial match: 50 points
- Plugin match: 25 points
- Recent usage: +20 points
- Fallback: Load top 20 most-used if score < 50

## Success Metrics

**Baseline** (current):
- All plugins loaded: 206 skills = ~69,010 tokens (35% of limit)
- Fresh conversation starts at 110-134k tokens

**After Week 1** (disable unused):
- Active plugins only: 182 skills = ~60,970 tokens (30% of limit)
- Fresh conversation starts at 102-126k tokens (7-8% reduction)

**After Week 2-3** (context filtering):
- Dynamic loading: ~45-50 skills/task = ~15,075-16,750 tokens (8% of limit)
- Fresh conversation starts at 57-80k tokens (48-60% reduction)

**Target baseline**: **<60k tokens** (down from 134k, 55% reduction)

---

**Last Updated**: 2026-01-05
**Next Review**: After Week 2 implementation (context-based filtering)
