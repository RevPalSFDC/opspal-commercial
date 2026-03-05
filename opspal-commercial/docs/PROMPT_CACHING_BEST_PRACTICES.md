# Prompt Caching Best Practices
# Version: 1.0.0
# Last Updated: 2025-10-27

## Overview

This guide defines best practices for structuring agents and documentation to maximize prompt caching benefits in the OpsPal agent system.

---

## What is Prompt Caching?

Prompt caching is a Claude API feature that allows reusing static content prefixes across multiple API calls, resulting in:

- **90% cost reduction** on cached content (0.1x vs 1.0x token cost)
- **2x latency reduction** for agent initialization
- **Faster responses** when using shared documentation

**How it works:**
1. First request: Full prompt processed, segments cached (1.25x cost)
2. Subsequent requests: Cached segments retrieved from memory (0.1x cost)
3. Cache lifetime: 5 minutes (auto-refreshes with each use)

---

## Core Principles

### 1. Separate Static from Dynamic Content

**Static content** (cacheable):
- Shared patterns and examples
- Best practices and guidelines
- Reference documentation
- Tool usage instructions
- Error handling patterns

**Dynamic content** (not cacheable):
- Task-specific instructions
- User requirements
- Current context
- Real-time data

### 2. Structure for Maximum Reuse

**Order matters** - Claude API creates cache prefixes in this order:
1. Tools (tool definitions)
2. System messages (project instructions)
3. User/Assistant messages (conversation)

**Best practice**: Place most static, reusable content first (tools, system prompts).

### 3. Use @import for Shared Content

**Benefits:**
- Single source of truth (maintainability)
- Automatic caching potential
- Reduced agent file sizes
- Easier updates

**Pattern:**
```markdown
---
name: my-agent
---

# Core Instructions (Dynamic - 100-300 lines)
[Agent-specific task instructions]

# Shared Patterns (Static - via imports)
@import agents/shared/library-reference.yaml
@import agents/shared/playbook-reference.yaml
@import ../../shared-docs/asana-integration-standards.md
```

---

## Agent Structure Template

### Cache-Friendly Agent Structure

```markdown
---
name: agent-name
model: sonnet
description: Brief agent description
tools: [...]
---

# Core Capabilities (DYNAMIC - 50-150 lines)

You are a specialized agent responsible for [specific task].

## Primary Responsibilities
- [Specific responsibility 1]
- [Specific responsibility 2]
- [Specific responsibility 3]

## Task Approach
[Agent-specific task guidance - 50-100 words]

---

# Shared Patterns & Standards (CACHED via imports)

## Error Prevention
@import agents/shared/error-prevention-notice.yaml

## Script Libraries
@import agents/shared/library-reference.yaml

## Operational Playbooks
@import agents/shared/playbook-reference.yaml

## Cross-Platform Integration
@import ../../shared-docs/asana-integration-standards.md
@import ../../shared-docs/context7-usage-guide.md

---

# Examples & Reference (CACHED via imports)

[Minimal agent-specific examples if needed - 20-50 lines]

For complete examples, see shared documentation above.
```

**Benefits:**
- **Core capabilities**: 50-150 lines (agent-specific, changes occasionally)
- **Shared content**: 1,000+ lines (cached, rarely changes)
- **Total agent size**: 100-300 lines vs 2,000+ lines before

---

## When to Extract to Shared Import

### Extraction Criteria

Extract content to shared import if it meets **at least 2 of these criteria**:

| Criterion | Threshold | Example |
|-----------|-----------|---------|
| **Size** | > 100 lines | Asana integration standards (200 lines) |
| **Reuse** | Used by 3+ agents | OOO write operations (8 data agents) |
| **Stability** | Changes < 1x/week | Context7 usage guide (stable) |
| **Duplication** | Duplicated across plugins | Asana standards (SF, HS, Cross-platform) |

### What to Extract

**High-Priority Candidates:**
- ✅ Integration patterns (Asana, API, time tracking)
- ✅ Standard operating procedures (OOO, safe queries)
- ✅ Best practices and guidelines
- ✅ Error handling patterns
- ✅ Tool usage instructions
- ✅ Example code and templates

**Keep in Agent File:**
- ❌ Agent-specific task instructions
- ❌ Unique capabilities description
- ❌ Agent-specific tool configurations
- ❌ Task routing logic

---

## Shared Import Locations

### Plugin-Specific Shared Content

```
.claude-plugins/opspal-salesforce/agents/shared/
├── library-reference.yaml (978 lines)
├── playbook-reference.yaml (216 lines)
├── error-prevention-notice.yaml (158 lines)
└── ooo-write-operations-pattern.md (NEW - 150 lines)
```

**Usage**: `@import agents/shared/filename.yaml`

**When to use**: Salesforce-specific patterns, tools, playbooks

### Cross-Plugin Shared Content

```
.claude-plugins/shared-docs/
├── asana-integration-standards.md (200 lines)
├── context7-usage-guide.md (50 lines)
└── time-tracking-integration.md (100 lines)
```

**Usage**: `@import ../../shared-docs/filename.md`

**When to use**: Patterns used across multiple plugins (SF, HS, Cross-platform)

---

## Migration Checklist

### For Existing Large Agents (>1,000 lines)

**Step 1: Identify Cacheable Content**
- [ ] Read through agent file
- [ ] Highlight static sections (examples, patterns, best practices)
- [ ] Identify duplicate content across agents
- [ ] Mark agent-specific vs shared content

**Step 2: Extract to Shared Imports**
- [ ] Create new shared import file(s) or use existing
- [ ] Copy static content to shared file
- [ ] Add version header and usage instructions
- [ ] Test import path from agent location

**Step 3: Update Agent File**
- [ ] Replace static content with `@import` directive
- [ ] Keep agent-specific instructions (50-300 lines)
- [ ] Ensure @import directives are in logical order
- [ ] Test agent loads correctly

**Step 4: Verify**
- [ ] Agent file < 500 lines (ideal: < 300)
- [ ] Shared imports load correctly
- [ ] Agent behavior unchanged
- [ ] No content duplication

---

## Examples

### Example 1: Before & After (sfdc-data-operations)

**BEFORE (2,820 lines):**
```markdown
---
name: sfdc-data-operations
---

# Agent Instructions (100 lines)
[Agent-specific instructions]

# Order of Operations Pattern (150 lines)
[Detailed OOO pattern - DUPLICATED in 8 agents]

# Context7 Integration (50 lines)
[Context7 usage - DUPLICATED in 20+ agents]

# Shared Library Reference (978 lines)
[Already imported - GOOD]

# Examples (500 lines)
[Extensive examples - mostly generic]

# Best Practices (200 lines)
[Generic best practices - could be shared]

[... 800+ more lines ...]
```

**AFTER (300 lines):**
```markdown
---
name: sfdc-data-operations
---

# Core Capabilities (150 lines)
You are a specialized Salesforce data management expert...
[Agent-specific task guidance]

# Shared Patterns (CACHED via imports - 1,300+ lines)
@import agents/shared/error-prevention-notice.yaml
@import agents/shared/library-reference.yaml
@import agents/shared/playbook-reference.yaml
@import agents/shared/ooo-write-operations-pattern.md
@import ../../shared-docs/context7-usage-guide.md

# Examples (50 lines)
[Minimal agent-specific examples]

For complete OOO examples, see ooo-write-operations-pattern.md
For API patterns, see context7-usage-guide.md
```

**Result**:
- Agent size: 2,820 → 300 lines (89% reduction)
- Cached content: 1,300+ lines (reused across 8+ agents)
- Maintainability: Single source of truth for patterns

### Example 2: Creating New Cache-Friendly Agent

```markdown
---
name: new-agent
model: sonnet
description: Does something awesome
tools: mcp_salesforce_*, Read, Write
---

# Core Capabilities

You are responsible for [specific task].

## Approach
1. [Step 1 - agent-specific]
2. [Step 2 - agent-specific]
3. [Step 3 - agent-specific]

## Important Considerations
- [Consideration 1]
- [Consideration 2]

---

# Shared Standards

This agent follows standardized patterns:

@import agents/shared/error-prevention-notice.yaml
@import agents/shared/library-reference.yaml
@import ../../shared-docs/context7-usage-guide.md

[Optional: 20-50 lines of agent-specific examples]
```

**Benefits**:
- Clean, focused agent definition (< 200 lines)
- Leverages existing shared patterns (cached)
- Easy to maintain and update
- Consistent with other agents

---

## Measuring Success

### Quantitative Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| **Shared content usage** | > 90% of reusable content | Count lines in shared imports vs agent files |
| **Agent file size** | < 500 lines for large agents | `wc -l agent-name.md` |
| **Content duplication** | Zero across plugins | Search for duplicate patterns |
| **Import usage** | 100% of eligible agents | `grep -r "@import" .claude-plugins/` |

### Qualitative Metrics

- [ ] New agents automatically use shared imports
- [ ] Developers find shared content easily
- [ ] Updates to patterns propagate to all agents
- [ ] Agent behavior consistent across platform

---

## Common Patterns

### Pattern 1: API Integration Pattern

```markdown
# API Integration (CACHED)
@import ../../shared-docs/context7-usage-guide.md

Before generating ANY API code:
1. Check Context7 for current documentation
2. Verify endpoint patterns and versions
3. Generate code using validated patterns
```

### Pattern 2: Data Operations Pattern

```markdown
# Safe Data Operations (CACHED)
@import agents/shared/ooo-write-operations-pattern.md

For ALL record writes:
1. Use OOOWriteOperations.createRecordSafe()
2. Never retry on validation failure
3. Surface rule name/formula on error
```

### Pattern 3: Asana Integration Pattern

```markdown
# Asana Task Management (CACHED)
@import ../../shared-docs/asana-integration-standards.md
@import ../../shared-docs/time-tracking-integration.md

For long-running operations:
1. Start time tracking before work
2. Post progress updates (< 100 words)
3. Complete tracking with results
```

---

## Troubleshooting

### Issue: Import Path Not Found

**Symptom**: `@import` directive fails, content not loaded

**Solution**:
```bash
# Check import path relative to agent location
cd .claude-plugins/opspal-salesforce/agents/
ls -la shared/  # Verify file exists
ls -la ../../shared-docs/  # Verify cross-plugin path

# Test import
grep "@import" agent-name.md
```

### Issue: Content Not Updating After Import Change

**Symptom**: Changed shared import, but agent behavior unchanged

**Possible causes**:
1. **Cache not invalidated** - Wait 5+ minutes or restart Claude Code
2. **Wrong import path** - Verify relative path
3. **Multiple versions** - Check for duplicate files

### Issue: Agent File Still Too Large

**Symptom**: Agent > 500 lines after adding imports

**Solution**:
- Review remaining content
- Identify additional extractable patterns
- Create new shared import if content is reused
- Keep only truly agent-specific instructions

---

## Best Practices Summary

### ✅ DO

- **Use @import for shared content** (> 100 lines, 3+ agents, stable)
- **Keep agent files focused** (< 500 lines, ideally < 300)
- **Place static content first** (for caching)
- **Create cross-plugin shared-docs** for multi-platform patterns
- **Version shared imports** (track changes)
- **Test imports after creation** (verify load correctly)

### ❌ DON'T

- **Don't duplicate content** across agents (extract to shared)
- **Don't mix static and dynamic** (separate for caching)
- **Don't use generic filenames** (`utils.md` - be specific)
- **Don't forget version headers** (track changes over time)
- **Don't skip testing** (verify imports work before committing)

---

## Related Documentation

- **Prompt Caching Research**: `docs/PROMPT_CACHING_RESEARCH.md` - Technical background
- **Agent Organization Pattern**: `docs/AGENT_ORGANIZATION_PATTERN.md` - Agent structure guide
- **Shared Imports**:
  - Salesforce: `.claude-plugins/opspal-salesforce/agents/shared/`
  - Cross-plugin: `.claude-plugins/shared-docs/`

---

## Questions?

**How do I know if content should be extracted?**
- > 100 lines? → Consider extraction
- Used by 3+ agents? → Extract
- Duplicated? → Definitely extract
- Stable (changes < 1x/week)? → Good candidate

**Where should I put extracted content?**
- Platform-specific? → `.claude-plugins/{plugin}/agents/shared/`
- Cross-platform? → `.claude-plugins/shared-docs/`

**How do I test if caching is working?**
- Measure token usage (should drop 90% on cache hits)
- Monitor response latency (should improve 2x)
- Check if identical prompts get faster

---

## Version History

- **1.0.0** (2025-10-27): Initial best practices guide based on Anthropic documentation and system analysis
