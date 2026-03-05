---
description: Analyze agent quality with scoring across prompt engineering, tools, and docs
argument-hint: "<agent-name|--all> [--plugin <name>] [--format json|markdown]"
---

# Analyze Agent Quality

Analyze agent prompt engineering, tool usage, documentation quality, and best practices compliance with detailed scoring and improvement recommendations.

## Task

You are analyzing agent quality to identify improvements across multiple dimensions:
- **Prompt Engineering** (30% weight): Clarity, completeness, actionability, examples
- **Tool Selection** (25% weight): Appropriate tools, security, justification
- **Documentation** (20% weight): Description quality, frontmatter completeness
- **Structure** (15% weight): Required sections, organization, flow
- **Best Practices** (10% weight): Naming conventions, security, standards compliance

## Quick Start

### Analyze a Single Agent

```bash
# Interactive analysis (invokes agent-quality-analyzer)
User: "Analyze the quality of the sfdc-metadata-manager agent"

# Or use the script directly
node .claude-plugins/developer-tools-plugin/scripts/analyze-agent-quality.js \
  .claude-plugins/salesforce-plugin/agents/sfdc-metadata-manager.md
```

### Analyze All Agents in a Plugin

```bash
# Interactive
User: "Analyze all agents in the salesforce-plugin"

# Or use the script
node .claude-plugins/developer-tools-plugin/scripts/analyze-agent-quality.js \
  --plugin salesforce-plugin
```

### Analyze Entire Marketplace

```bash
# Get comprehensive quality report
node .claude-plugins/developer-tools-plugin/scripts/analyze-agent-quality.js --all
```

## Script Options

```bash
# Basic analysis (markdown report)
node analyze-agent-quality.js <agent-file>

# JSON output
node analyze-agent-quality.js <agent-file> --json

# Score only (for CI/CD)
node analyze-agent-quality.js <agent-file> --score-only

# Threshold check (exits with error if below threshold)
node analyze-agent-quality.js <agent-file> --threshold 70

# Analyze plugin
node analyze-agent-quality.js --plugin <plugin-name>

# Analyze all
node analyze-agent-quality.js --all --json > quality-report.json
```

## Analysis Categories

### 1. Prompt Engineering (30%)

**Assesses:**
- **Clarity** (0-25 points): Specific language, action verbs, minimal vagueness
- **Completeness** (0-25 points): Coverage of responsibilities, no significant gaps
- **Actionability** (0-25 points): Clear steps, numbered workflows, bullet points
- **Examples** (0-25 points): Code blocks, usage examples, before/after comparisons

**Quality Indicators:**
- ✅ Clear, specific language with action verbs
- ✅ Comprehensive coverage of agent responsibilities
- ✅ Step-by-step workflows for common tasks
- ✅ Multiple code examples demonstrating usage

### 2. Tool Selection (25%)

**Assesses:**
- Appropriate tool count (6-8 tools ideal, 8+ may indicate bloat)
- Tool justification (each tool mentioned in content)
- Security (no excessive permissions)
- Completeness (tools match described functionality)

**Tool Categories:**
- File Read: Read, Glob, Grep
- File Write: Write, Edit
- Execution: Bash
- Workflow: TodoWrite, Task, ExitPlanMode
- External: WebFetch, WebSearch

**Red Flags:**
- ❌ Bash + all file tools (potential over-privilege)
- ❌ 8+ tools for simple agent
- ❌ Tools not mentioned in agent content
- ❌ Invalid or non-existent tools

### 3. Documentation (20%)

**Assesses:**
- **Description length**: 50+ chars ideal, 30+ good, 20+ minimum
- **Description specificity**: Action-oriented vs vague ("helps with tasks")
- **Frontmatter completeness**: name, model, description, tools all present
- **YAML validity**: Proper syntax, no parsing errors

**Required Fields:**
```yaml
---
name: agent-name          # Must match filename
model: sonnet             # Valid model
description: ...          # 50+ chars, specific
tools: Read, Write, ...   # Appropriate tools
---
```

### 4. Structure (15%)

**Required Sections:**
- Opening statement: "You are responsible for..."
- ## Core Responsibilities
- ## Best Practices
- ## Common Tasks
- ## Troubleshooting
- Closing reminder: "Remember:..."

**Quality Indicators:**
- ✅ All required sections present
- ✅ Logical flow and organization
- ✅ Clear section headers (##)
- ✅ Substantive content (not just placeholders)

### 5. Best Practices (10%)

**Checks:**
- Naming convention: lowercase-hyphen format
- No hard-coded paths (/Users/, /home/, C:\)
- Security: API keys use environment variables
- No anti-patterns detected

## Anti-Pattern Detection

The analyzer detects these common issues:

### Vague Description
- **Problem**: "General purpose agent", "Helps with tasks"
- **Impact**: Poor discoverability, unclear invocation
- **Fix**: Use specific, action-oriented description

### Tool Bloat
- **Problem**: 8+ tools, unnecessary Bash access
- **Impact**: Security risk, unclear scope
- **Fix**: Reduce to essential tools, follow Least Privilege

### Monolithic Agent
- **Problem**: 15+ responsibilities, trying to do everything
- **Impact**: Difficult to maintain, tool bloat
- **Fix**: Split into focused, single-responsibility agents

### Missing Error Handling
- **Problem**: No Troubleshooting section, no error guidance
- **Impact**: Poor user experience when things fail
- **Fix**: Add comprehensive troubleshooting section

### Hard-Coded Assumptions
- **Problem**: Specific paths, URLs, IDs in prompts
- **Impact**: Breaks in other environments
- **Fix**: Use environment-agnostic guidance

### Poor Structure
- **Problem**: Missing sections, disorganized content
- **Impact**: Hard to read and maintain
- **Fix**: Follow Agent Writing Guide template

## Output Format

### Markdown Report

```markdown
# Agent Quality Analysis: agent-name

**Plugin**: plugin-name
**Analysis Date**: 2025-10-10T12:00:00.000Z
**Overall Score**: 88/100 (B+)

## Summary
Very good agent quality with strong documentation and structure...

## Category Scores

### Prompt Engineering: 85/100 (Very Good)
**Issues**:
- [MEDIUM] Insufficient examples provided

**Recommendations**:
1. Add code examples for complex workflows

### Tool Selection: 90/100 (Excellent)
**Current Tools**: Read, Write, Grep, TodoWrite
**Appropriate**: All tools justified
**Recommendations**: None

### Documentation: 85/100 (Very Good)
**Description Quality**: Good (45 chars)
**Recommendations**:
1. Expand description to 50+ characters

## Anti-Patterns Detected
None

## Improvement Roadmap

### Priority 1 (Critical - Fix Immediately)
None

### Priority 2 (High - Fix Soon)
None

### Priority 3 (Medium - Improve Quality)
1. **Insufficient examples**: Add 2-3 code examples

## References
- [Agent Writing Guide](../../../docs/AGENT_WRITING_GUIDE.md)
- [Plugin Quality Standards](../../../docs/PLUGIN_QUALITY_STANDARDS.md)
```

### JSON Output

```json
{
  "agentName": "agent-name",
  "pluginName": "plugin-name",
  "overallScore": 88,
  "grade": "B+",
  "categoryScores": {
    "promptEngineering": 85,
    "toolSelection": 90,
    "documentation": 85,
    "structure": 90,
    "bestPractices": 95
  },
  "issues": [
    {
      "severity": "medium",
      "category": "promptEngineering",
      "message": "Insufficient examples provided"
    }
  ],
  "recommendations": [...],
  "antiPatterns": []
}
```

## Use Cases

### Pre-Commit Quality Check

```bash
#!/bin/bash
# .claude-plugins/my-plugin/hooks/pre-commit-quality.sh

for agent in agents/*.md; do
  score=$(node ../developer-tools-plugin/scripts/analyze-agent-quality.js "$agent" --score-only)
  if [ "$score" -lt 70 ]; then
    echo "❌ $agent scored $score (below 70 threshold)"
    exit 1
  fi
done

echo "✅ All agents meet quality threshold"
```

### CI/CD Pipeline

```yaml
# .github/workflows/quality.yml
- name: Agent Quality Check
  run: |
    node .claude-plugins/developer-tools-plugin/scripts/analyze-agent-quality.js \
      --plugin my-plugin \
      --threshold 70 \
      --json > quality-report.json
```

### Plugin Review

```bash
# Get comprehensive plugin report
node analyze-agent-quality.js --plugin salesforce-plugin > salesforce-quality.md

# Compare plugins
node analyze-agent-quality.js --all --json | jq '.[] | {name, score: .overallScore}'
```

## Quality Grades

| Score | Grade | Meaning |
|-------|-------|---------|
| 90-100 | A+ | Excellent - marketplace featured |
| 80-89 | A | Very Good - marketplace recommended |
| 70-79 | B | Good - marketplace approved |
| 60-69 | C | Acceptable - marketplace listed |
| 50-59 | D | Needs Improvement - not listed |
| 0-49 | F | Poor - rejected |

## Next Steps

After analyzing an agent:

1. **Review Issues**: Address critical and high-priority issues first
2. **Apply Fixes**: Use recommendations to improve agent quality
3. **Re-Analyze**: Run analysis again to verify improvements
4. **Update Docs**: Reflect changes in plugin documentation
5. **Commit**: Commit improvements with quality score in message

## References

- [Agent Writing Guide](../../../docs/AGENT_WRITING_GUIDE.md) - Complete agent development guide
- [Plugin Quality Standards](../../../docs/PLUGIN_QUALITY_STANDARDS.md) - Quality benchmarks
- [agent-quality-analyzer Agent](../agents/agent-quality-analyzer.md) - Interactive analysis

---

**Agent Quality Analyzer v2.0.0** - Comprehensive quality assessment for OpsPal Plugin Marketplace
