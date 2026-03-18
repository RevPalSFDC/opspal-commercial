# Plugin Development Guide

**Version**: 1.0.0
**Last Updated**: 2026-01-18
**Maintained By**: RevPal Engineering

This guide provides a task-oriented workflow for developing, maintaining, and enhancing plugins in the OpsPal Plugin Marketplace using the GSD (Get Shit Done) Framework.

---

## Document Scope

This guide is the **practical workflow manual** for plugin development. For **authoritative requirements** and **mandatory standards**, see [`docs/PLUGIN_DEVELOPMENT_STANDARDS.md`](./PLUGIN_DEVELOPMENT_STANDARDS.md).

| Use This Guide For | Use Standards For |
|--------------------|-------------------|
| Starting plugin work | Component requirements |
| Executing tasks step-by-step | Mandatory field definitions |
| Managing sessions (pause/resume) | Common mistakes to avoid |
| GSD methodology and context zones | Integration patterns |
| Complete templates and examples | Validation rules |

**Key Reference**: The Standards document is the authoritative source for naming conventions, frontmatter requirements, and quality gates. This guide provides the practical execution workflow that complements those standards.

---

## Table of Contents

1. [Quick Start](#1-quick-start)
2. [GSD Framework Overview](#2-gsd-framework-overview)
3. [Starting a New Plugin](#3-starting-a-new-plugin)
4. [Planning Phase](#4-planning-phase)
5. [Execution Phase](#5-execution-phase)
6. [Verification Phase](#6-verification-phase)
7. [Milestone & Release](#7-milestone--release)
8. [Session Management](#8-session-management)
9. [Component Reference](#9-component-reference)
10. [Troubleshooting](#10-troubleshooting)
11. [Quick Reference Cheatsheet](#11-quick-reference-cheatsheet)

---

## 1. Quick Start

### Prerequisites

- **Node.js**: 18+ (`node --version`)
- **jq**: JSON processor (`jq --version`)
- **Git**: Version control (`git --version`)
- **Claude Code**: Latest version

### Environment Verification

```bash
# Verify all prerequisites
node --version && jq --version && git --version

# Verify plugin loading
ls .claude-plugins/
```

### Repository Overview

| Metric | Count |
|--------|-------|
| Plugins | 9 |
| Agents | 221 |
| Commands | 154 |
| Hooks | 86 |

### GSD Commands at a Glance

| Command | Purpose |
|---------|---------|
| `/plugin-dev:new-plugin` | Start new plugin with discovery |
| `/plugin-dev:plan-component` | Plan specific component |
| `/plugin-dev:execute-component` | Execute planned task |
| `/plugin-dev:verify-component` | Run quality gates |
| `/plugin-dev:milestone` | Complete version bump |
| `/plugin-dev:pause` | Capture state for break |
| `/plugin-dev:resume` | Restore from state |
| `/plugin-dev:progress` | Show current progress |

### First Time Setup

```bash
# 1. Clone the repository
git clone https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace.git

# 2. Install dependencies
cd opspal-internal-plugins
npm install

# 3. Start a new plugin (recommended)
/plugin-dev:new-plugin
```

---

## 2. GSD Framework Overview

The GSD (Get Shit Done) Framework is the core methodology for plugin development. It manages **context as a finite resource** to maintain output quality across development sessions.

### Context Quality Zones

Claude's context window fills as you work. Quality degrades as context fills:

| Zone | Fill % | Quality | What to Do |
|------|--------|---------|------------|
| **PEAK** | 0-30% | Excellent | Complex architectural work, new agents |
| **GOOD** | 30-50% | Good | Standard development, commands, scripts |
| **DEGRADING** | 50-70% | Declining | Simple tasks only, finish current work |
| **POOR** | 70%+ | Poor | **Stop immediately**, spawn fresh agent |

### Quality Degradation Symptoms

Watch for these signs that context is degrading:
- Repeating instructions already given
- Missing requirements from earlier conversation
- Inconsistent naming or coding style
- Incomplete implementations
- Forgetting earlier context

### Development Cycle

```
Discovery → Planning → Execution → Verification → Milestone
    ↑                                                  |
    └──────────────── Gap Closure ←────────────────────┘
```

**Phase 1: Discovery** - Gather requirements, research existing patterns
**Phase 2: Planning** - Create task specifications with dependencies
**Phase 3: Execution** - Build components following the plan
**Phase 4: Verification** - Run quality gates, fix issues
**Phase 5: Milestone** - Version bump, changelog, release

### State Files

State persists across sessions via these files:

| File | Purpose |
|------|---------|
| `PLUGIN_STATE.md` | Current session state, progress, blockers |
| `PLUGIN_ROADMAP.md` | Phase-based development plan |
| `PLUGIN_REQUIREMENTS.md` | Requirements specification |
| `DISCOVERY.md` | Research findings |
| `COMPONENT_PLAN.md` | Task specifications |

### Fresh Context Pattern

When context exceeds 50%, spawn a fresh agent:

1. **Save state**: Update `PLUGIN_STATE.md` with current progress
2. **Prepare handoff**: Document what fresh agent needs
3. **Use Task tool**: Spawn `plugin-phase-executor` with state file path
4. **Continue**: Fresh agent reads state and continues

---

## 3. Starting a New Plugin

### Recommended: Use the Command

```bash
/plugin-dev:new-plugin
```

This interactive command:
1. Gathers requirements through questions
2. Assesses discovery depth needed
3. Creates plugin directory structure
4. Generates `PLUGIN_ROADMAP.md` with phases
5. Initializes `PLUGIN_STATE.md` for tracking

### Manual Creation

When you need more control:

```bash
# 1. Create plugin structure
mkdir -p .claude-plugins/my-plugin/{.claude-plugin,agents,commands,skills,hooks,scripts/lib,docs,templates}

# 2. Create plugin manifest
cat > .claude-plugins/my-plugin/.claude-plugin/plugin.json << 'EOF'
{
  "name": "my-plugin",
  "version": "0.1.0",
  "description": "Description of what this plugin does",
  "author": {
    "name": "RevPal Engineering",
    "email": "engineering@gorevpal.com"
  },
  "keywords": ["keyword1", "keyword2"],
  "repository": "https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace",
  "license": "MIT"
}
EOF

# 3. Create CLAUDE.md
cat > .claude-plugins/my-plugin/CLAUDE.md << 'EOF'
# My Plugin

Brief description of the plugin.

## Quick Start
...

## Commands
...

## Agents
...
EOF

# 4. Create README.md
cat > .claude-plugins/my-plugin/README.md << 'EOF'
# My Plugin

## Overview
...

## Installation
...

## Usage
...
EOF
```

### Directory Structure

```
.claude-plugins/my-plugin/
├── .claude-plugin/
│   ├── plugin.json          # Manifest (REQUIRED)
│   └── hooks.json           # Hook configuration
├── agents/                   # Agent definitions
├── commands/                 # Slash commands
├── skills/                   # Knowledge/methodology
├── hooks/                    # Bash hook scripts
├── scripts/
│   └── lib/                  # Utility libraries
├── docs/                     # Extended documentation
├── templates/                # Reusable templates
├── CLAUDE.md                 # User guidance (REQUIRED)
└── README.md                 # Overview (REQUIRED)
```

### Post-Creation Verification

```bash
# Validate the new plugin
node .claude-plugins/developer-tools-plugin/scripts/validate-plugin.js \
  --plugin my-plugin

# Check manifest schema
cat .claude-plugins/my-plugin/.claude-plugin/plugin.json | jq .
```

---

## 4. Planning Phase

### Using the Command

```bash
/plugin-dev:plan-component
```

This creates detailed task specifications for each component.

### Task Specification Format

Tasks use XML format for structured planning:

```xml
<task type="agent">
  <name>Create sfdc-my-feature agent</name>
  <phase>1</phase>
  <wave>1</wave>
  <files>agents/sfdc-my-feature.md</files>
  <dependencies>none</dependencies>
  <action>Create agent that handles feature X with tools Y and Z</action>
  <verify>grep -q "triggerKeywords" agents/sfdc-my-feature.md</verify>
  <done>
    - Agent file exists with valid frontmatter
    - Has trigger keywords defined
    - Quality score >= 80
  </done>
  <context_cost>medium (3000 tokens)</context_cost>
</task>
```

### Dependency Waves

Tasks are grouped by dependencies for efficient execution:

| Wave | Dependencies | Examples |
|------|--------------|----------|
| **Wave 1** | None | Manifest, README, independent agents |
| **Wave 2** | Wave 1 | Commands (may reference agents), dependent skills |
| **Wave 3** | Wave 2 | Integration tests, cross-component features |
| **Wave 4** | Wave 3 | Final polish, release preparation |

### Context Cost Estimation

Plan sessions to stay under 50% context:

| Component | Token Cost | Notes |
|-----------|------------|-------|
| Agent | 3000-5000 | Single agent with full sections |
| Command | 1500-3000 | Standard slash command |
| Skill | 2000-4000 | Documentation/patterns |
| Hook | 1000-2000 | Event handler |
| Script | 2000-5000 | Utility JavaScript |
| Template | 1000-2000 | Reusable structure |

**Complexity Multipliers:**
- Simple: 1.0x
- Standard: 1.5x
- Complex: 2.5x
- Cross-component: 3.0x

### Session Planning Example

```
Target: Keep session under 50% context (~100K tokens)

Session Plan:
- 3 small tasks (1500 each):     ~4.5K tokens, ~15% context
- 2 medium tasks (3000 each):    ~6K tokens, ~20% context
- Buffer for discussion:         ~3K tokens, ~10% context
─────────────────────────────────────────────────────────
Total estimate:                  ~13.5K tokens, ~45% context ✅
```

---

## 5. Execution Phase

### Using the Command

```bash
/plugin-dev:execute-component
```

This executes the next planned task with proper verification.

### Decision Matrix: Execute vs Spawn Fresh

| Condition | Execute Directly | Spawn Fresh Agent |
|-----------|------------------|-------------------|
| Context fill | < 50% | > 50% |
| Task complexity | Simple/Medium | Complex |
| Files involved | Single file | Multiple related files |
| Deep focus needed | No | Yes |

### Creating Agents

**Naming Convention:** `[platform-prefix]-[domain]-[function]`
- Salesforce: `sfdc-cpq-assessor`
- HubSpot: `hubspot-workflow-builder`
- Cross-platform: `diagram-generator`

**Required Frontmatter:**
```yaml
---
name: sfdc-my-feature
description: Handles X operations with Y capabilities
model: sonnet
tools:
  - Read
  - Write
  - Bash
  - Grep
  - Glob
  - TodoWrite
triggerKeywords:
  - my feature
  - feature x
  - handle x
---
```

**Quality Scoring Weights:**
| Category | Weight | Focus |
|----------|--------|-------|
| Prompt Engineering | 30% | Clear instructions, examples |
| Tool Selection | 25% | Least privilege, appropriate tools |
| Documentation | 20% | Usage examples, error handling |
| Structure | 15% | Proper sections, organization |
| Best Practices | 10% | Naming, patterns, conventions |

### Creating Commands

**Required Frontmatter:**
```yaml
---
description: Brief description (max 120 chars)
argument-hint: "[--flag <value>] [positional-arg]"
---
```

**Optional Fields:**
```yaml
---
description: Run validation checks
argument-hint: "[--all] [--strict] [plugin-name]"
allowed-tools:
  - Read
  - Write
  - Bash
thinking-mode: enabled
---
```

### Creating Hooks

**Make executable:**
```bash
chmod +x hooks/my-hook.sh
```

**Exit Codes:**
| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Misuse of command |
| 3 | Cannot execute |
| 4 | Validation failed |
| 5 | Configuration error |
| 6 | Dependency missing |
| 7 | Timeout |

### Creating Scripts

**Structure:**
```javascript
#!/usr/bin/env node
/**
 * @fileoverview Description of what this script does
 * @module scripts/lib/my-script
 */

/**
 * Main function description
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} Result object
 */
async function myFunction(options) {
  // Implementation
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  // Parse args and call myFunction
}

module.exports = { myFunction };
```

### Atomic Git Commits

After each component:
```bash
git add .
git commit -m "feat(my-plugin): add my-feature agent

- Handles X operations
- Includes trigger keywords for routing
- Quality score: 85/100"
```

---

## 6. Verification Phase

### Using the Command

```bash
/plugin-dev:verify-component
```

This runs all quality gates for the current component.

### Quality Gates by Component

**Agent Quality Gates:**
- [ ] Valid YAML frontmatter
- [ ] Required fields: name, description, tools
- [ ] Trigger keywords defined
- [ ] Clear system prompt
- [ ] Quality score ≥ 80

**Command Quality Gates:**
- [ ] Valid YAML frontmatter
- [ ] `description` field present
- [ ] `argument-hint` if arguments accepted
- [ ] Task/workflow section exists
- [ ] Usage examples provided

**Hook Quality Gates:**
- [ ] File is executable (`chmod +x`)
- [ ] Valid bash syntax (`bash -n`)
- [ ] Uses standard exit codes
- [ ] Sources error-handler.sh (if available)

**Script Quality Gates:**
- [ ] Valid Node.js syntax (`node --check`)
- [ ] Exports expected functions
- [ ] JSDoc documentation
- [ ] No runtime errors on import

### Validation Commands

```bash
# Validate entire plugin (80-point threshold)
node .claude-plugins/developer-tools-plugin/scripts/validate-plugin.js \
  --plugin my-plugin

# Analyze agent quality
node .claude-plugins/developer-tools-plugin/scripts/analyze-agent-quality.js \
  .claude-plugins/my-plugin/agents/my-agent.md

# Validate hook syntax
bash -n .claude-plugins/my-plugin/hooks/my-hook.sh

# Validate script syntax
node --check .claude-plugins/my-plugin/scripts/lib/my-script.js

# Validate all plugins
.claude-plugins/developer-tools-plugin/scripts/lib/validate-all-plugins.sh
```

### Fix-Verify-Commit Cycle

1. **Run verification** → Identify issues
2. **Fix issues** → Edit files
3. **Re-verify** → Confirm fixes
4. **Commit** → Atomic commit with fix description

---

## 7. Milestone & Release

### Using the Command

```bash
/plugin-dev:milestone patch "Fix validation bug"
/plugin-dev:milestone minor "Add new feature X"
/plugin-dev:milestone major "Breaking API change"
```

### Version Types

| Type | When to Use | Example |
|------|-------------|---------|
| **patch** | Bug fixes, minor updates | 1.0.0 → 1.0.1 |
| **minor** | New features, backward compatible | 1.0.1 → 1.1.0 |
| **major** | Breaking changes | 1.1.0 → 2.0.0 |

### What Gets Updated

1. **plugin.json** - Version field
2. **CHANGELOG.md** - New version entry
3. **README.md** - Regenerated with current stats
4. **Git tag** - Created with version number

### Manual Version Management

```bash
# Bump version
node .claude-plugins/developer-tools-plugin/scripts/version-manager.js \
  --plugin my-plugin \
  --bump patch

# Generate README
node .claude-plugins/developer-tools-plugin/scripts/generate-readme.js \
  --plugin my-plugin

# Create git tag
git tag -a v1.0.1 -m "Release v1.0.1: Fix validation bug"
git push origin v1.0.1
```

### Pre-Release Checklist

- [ ] All components verified
- [ ] No failing quality gates
- [ ] CHANGELOG updated
- [ ] README regenerated
- [ ] All tests passing
- [ ] Documentation reviewed

---

## 8. Session Management

### Pausing Work

```bash
/plugin-dev:pause
```

This saves:
- Current task and progress
- Completed tasks
- Key decisions made
- Pending decisions
- Blockers
- Context to remember

### Resuming Work

```bash
/plugin-dev:resume
```

This restores:
- Full state from `PLUGIN_STATE.md`
- Stashed work (if any)
- Shows next actions to take

### Checking Progress

```bash
/plugin-dev:progress
```

Shows:
- Current phase and task
- Estimated context fill
- Completed vs remaining tasks
- Any blockers

### Manual State Management

**Update PLUGIN_STATE.md:**
```markdown
# Plugin Development State

## Session Info
- Plugin: my-plugin
- Started: 2026-01-18T10:00:00Z
- Last Updated: 2026-01-18T14:30:00Z
- Estimated Context: ~35%
- Status: active

## Phase Progress
- Phase 1 (Foundation): Complete
- Phase 2 (Core Features): In Progress (60%)
- Phase 3 (Polish): Not Started

## Current Task
- Name: Create validation command
- Type: command
- Status: in_progress
- Progress: Frontmatter done, implementing workflow
- Files: commands/validate.md

## Next Tasks (Queue)
1. Add validation script
2. Create test suite
3. Update README

## Key Decisions Made
- Using Jest for testing (standard across plugins)
- Following existing validation patterns from salesforce-plugin

## Blockers
- None

## Context to Remember
- Validation should match pattern in salesforce-plugin
- Need both --all and --strict flags
```

### Handoff to Fresh Agent

When context > 50%:

```
State file: .claude-plugins/my-plugin/PLUGIN_STATE.md

Current task: Create validation command (60% complete)

Key context:
- Following pattern from salesforce-plugin validation
- Needs --all and --strict flags
- Should integrate with validate-plugin.js

Files to focus on:
- commands/validate.md (partial)
- scripts/lib/validate-plugin.js (reference)

Skip:
- Discovery (already complete)
- Phase 1 foundation (already solid)
```

---

## 9. Component Reference

### Agent Template

```yaml
---
name: platform-domain-function
description: Brief description of what this agent does and when to use it
model: sonnet
tools:
  - Read
  - Write
  - Bash
  - Grep
  - Glob
  - TodoWrite
  - Task
triggerKeywords:
  - primary keyword
  - alternate phrase
  - related term
---

# Agent Name

Brief overview of this agent's purpose and primary use cases.

## Core Responsibilities

1. **Primary function** - Description
2. **Secondary function** - Description
3. **Supporting function** - Description

## Capability Boundaries

### What This Agent DOES:
- Capability 1
- Capability 2

### What This Agent DOES NOT:
- Limitation 1 → Use `other-agent` instead
- Limitation 2 → Use `another-agent` instead

## Best Practices

1. **Practice 1** - Explanation
2. **Practice 2** - Explanation

## Common Tasks

### Task 1: Description

```bash
# Example command or workflow
```

### Task 2: Description

```bash
# Example command or workflow
```

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| Error 1 | Cause | Solution |
| Error 2 | Cause | Solution |

## Related Agents

- `related-agent-1` - For X operations
- `related-agent-2` - For Y operations
```

### Command Template

```yaml
---
description: Brief description of what this command does (max 120 chars)
argument-hint: "[--flag <value>] [positional-arg]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Grep
  - Glob
---

# Command Name

## Purpose

Brief description of what this command accomplishes.

## Usage

```bash
/plugin:command-name [options]
```

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `--flag` | Description | value |
| `positional` | Description | - |

## Workflow

1. **Step 1** - Description
2. **Step 2** - Description
3. **Step 3** - Description

## Examples

### Basic Usage

```bash
/plugin:command-name
```

### With Options

```bash
/plugin:command-name --flag value arg
```

## Output

Description of expected output format.

## Error Handling

- **Error 1**: Solution
- **Error 2**: Solution
```

### Hook Template

```bash
#!/bin/bash
# Hook: [event]-[domain]-[action].sh
#
# Triggered: [When this hook runs]
# Purpose: [What this hook accomplishes]
#
# Exit Codes:
#   0 - Success
#   1 - General error
#   4 - Validation failed
#   6 - Dependency missing

set -e

# Get plugin root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(dirname "$SCRIPT_DIR")}"

# Source error handler if available
if [ -f "$PLUGIN_ROOT/hooks/lib/error-handler.sh" ]; then
  source "$PLUGIN_ROOT/hooks/lib/error-handler.sh"
fi

# Check dependencies
check_dependency() {
  if ! command -v "$1" &> /dev/null; then
    echo "Error: $1 is required but not installed"
    exit 6
  fi
}

check_dependency jq
check_dependency node

# Main logic
main() {
  echo "Running hook..."

  # Implementation here

  echo "Hook completed successfully"
}

# Run main function
main "$@"
```

### hooks.json Configuration

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/hooks/pre-bash-validation.sh",
            "timeout": 5000,
            "description": "Validate bash commands before execution"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/hooks/post-write-validation.sh",
            "timeout": 10000,
            "description": "Validate written files"
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/hooks/session-init.sh",
            "timeout": 5000,
            "description": "Initialize session context"
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/hooks/prompt-validation.sh",
            "timeout": 3000,
            "description": "Validate user prompts"
          }
        ]
      }
    ]
  }
}
```

### Script Template

```javascript
#!/usr/bin/env node
/**
 * @fileoverview Description of what this script does
 * @module scripts/lib/my-script
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

/**
 * Configuration options for the script
 * @typedef {Object} Options
 * @property {string} input - Input file or directory path
 * @property {string} output - Output file path
 * @property {boolean} verbose - Enable verbose logging
 */

/**
 * Result object returned by main function
 * @typedef {Object} Result
 * @property {boolean} success - Whether operation succeeded
 * @property {string} message - Human-readable result message
 * @property {Object} data - Additional result data
 */

/**
 * Main processing function
 * @param {Options} options - Configuration options
 * @returns {Promise<Result>} Processing result
 * @throws {Error} If input validation fails
 */
async function processData(options) {
  const { input, output, verbose } = options;

  // Validate input
  if (!input) {
    throw new Error('Input path is required');
  }

  if (!fs.existsSync(input)) {
    throw new Error(`Input path does not exist: ${input}`);
  }

  if (verbose) {
    console.log(`Processing: ${input}`);
  }

  // Implementation here
  const result = {
    success: true,
    message: 'Processing completed successfully',
    data: {}
  };

  // Write output if specified
  if (output) {
    fs.writeFileSync(output, JSON.stringify(result.data, null, 2));
  }

  return result;
}

/**
 * Parse command line arguments
 * @param {string[]} args - Command line arguments
 * @returns {Options} Parsed options
 */
function parseArgs(args) {
  const options = {
    input: null,
    output: null,
    verbose: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--input':
      case '-i':
        options.input = args[++i];
        break;
      case '--output':
      case '-o':
        options.output = args[++i];
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--help':
      case '-h':
        console.log(`
Usage: my-script [options]

Options:
  -i, --input <path>    Input file or directory
  -o, --output <path>   Output file path
  -v, --verbose         Enable verbose logging
  -h, --help            Show this help message
        `);
        process.exit(0);
      default:
        if (!options.input && !args[i].startsWith('-')) {
          options.input = args[i];
        }
    }
  }

  return options;
}

// CLI interface
if (require.main === module) {
  const options = parseArgs(process.argv.slice(2));

  processData(options)
    .then(result => {
      console.log(result.message);
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    });
}

module.exports = { processData, parseArgs };
```

### Skill Template

```yaml
---
name: my-methodology
description: When to use this skill - knowledge about X patterns and best practices
allowed-tools:
  - Read
  - Grep
  - Glob
tags:
  - domain
  - pattern
---

# Methodology Name

## When to Use This Skill

Use this skill when:
- Situation 1
- Situation 2
- Situation 3

## Quick Reference

| Concept | Definition |
|---------|------------|
| Term 1 | Definition |
| Term 2 | Definition |

## Core Principles

### Principle 1: Name

Description of the principle and how to apply it.

**Example:**
```
Example code or configuration
```

### Principle 2: Name

Description of the principle and how to apply it.

## Patterns

### Pattern 1: Name

**When to use:** Situation description

**Implementation:**
```
Example implementation
```

**Benefits:**
- Benefit 1
- Benefit 2

### Pattern 2: Name

**When to use:** Situation description

**Implementation:**
```
Example implementation
```

## Anti-Patterns

### Anti-Pattern 1: Name

**Problem:** What goes wrong

**Solution:** How to fix it

## Related Skills

- `related-skill-1` - For X patterns
- `related-skill-2` - For Y patterns

## References

- [Reference 1](link)
- [Reference 2](link)
```

---

## 10. Troubleshooting

### Common Issues

| Issue | Symptoms | Solution |
|-------|----------|----------|
| **Plugin not loading** | Commands don't appear, agents not found | Validate manifest: `validate-plugin.js --plugin name` |
| **Agent not discovered** | Agent not in routing | Check `triggerKeywords` in frontmatter |
| **Hook not executing** | No effect on events | Check `chmod +x`, verify hooks.json wiring |
| **Command not appearing** | Not in palette | Verify `description` in frontmatter |
| **Validation failing** | Score below 80 | Run `analyze-agent-quality.js` for details |
| **Context degrading** | Repeated instructions, incomplete work | Check progress, spawn fresh agent |
| **State file missing** | Can't resume | Run `/plugin-dev:pause` before breaks |

### Context Degradation Recovery

1. **Recognize the signs:**
   - Repeating previous instructions
   - Missing requirements
   - Inconsistent output

2. **Save current state:**
   ```bash
   /plugin-dev:pause
   ```

3. **Spawn fresh agent:**
   - Use Task tool with `plugin-phase-executor`
   - Provide `PLUGIN_STATE.md` path

4. **Continue from state:**
   ```bash
   /plugin-dev:resume
   ```

### Hook Troubleshooting

```bash
# Check if hook is executable
ls -la .claude-plugins/my-plugin/hooks/

# Validate bash syntax
bash -n .claude-plugins/my-plugin/hooks/my-hook.sh

# Test hook manually
.claude-plugins/my-plugin/hooks/my-hook.sh

# Check hooks.json exists and is valid
cat .claude-plugins/my-plugin/.claude-plugin/hooks.json | jq .
```

### Validation Troubleshooting

```bash
# Full validation with details
node .claude-plugins/developer-tools-plugin/scripts/validate-plugin.js \
  --plugin my-plugin \
  --verbose

# Agent-specific analysis
node .claude-plugins/developer-tools-plugin/scripts/analyze-agent-quality.js \
  .claude-plugins/my-plugin/agents/my-agent.md \
  --detailed

# Check manifest schema
ajv validate \
  -s .claude-plugins/developer-tools-plugin/schemas/plugin-manifest.schema.json \
  -d .claude-plugins/my-plugin/.claude-plugin/plugin.json
```

### Further Help

- **Plugin Loading Issues**: See `docs/TROUBLESHOOTING_PLUGIN_LOADING.md`
- **Development Standards**: See `docs/PLUGIN_DEVELOPMENT_STANDARDS.md`
- **Manifest Schema**: See `PLUGIN_MANIFEST_SCHEMA.md`
- **Agent Routing**: See `docs/routing-help.md`

---

## 11. Quick Reference Cheatsheet

### Naming Conventions

| Component | Pattern | Example |
|-----------|---------|---------|
| Plugin | `kebab-case` | `my-plugin` |
| Agent | `[platform]-[domain]-[function]` | `sfdc-cpq-assessor` |
| Command | `kebab-case` | `validate-plugin` |
| Skill | `kebab-case` | `deployment-patterns` |
| Hook | `[event]-[domain]-[action].sh` | `pre-tool-validation.sh` |
| Script | `kebab-case.js` | `validate-plugin.js` |

### Context Quality Zones

| Zone | Fill | Action |
|------|------|--------|
| PEAK | 0-30% | Complex work |
| GOOD | 30-50% | Normal work |
| DEGRADING | 50-70% | Simple tasks |
| POOR | 70%+ | **STOP, spawn fresh** |

### GSD Commands

| Command | Purpose |
|---------|---------|
| `/plugin-dev:new-plugin` | Start new plugin |
| `/plugin-dev:plan-component` | Plan task |
| `/plugin-dev:execute-component` | Execute task |
| `/plugin-dev:verify-component` | Verify quality |
| `/plugin-dev:milestone` | Version bump |
| `/plugin-dev:pause` | Save state |
| `/plugin-dev:resume` | Restore state |
| `/plugin-dev:progress` | Show progress |

### Frontmatter Quick Reference

**Agent:**
```yaml
---
name: agent-name
description: What it does
model: sonnet
tools: [Read, Write, Bash, Grep, Glob, TodoWrite]
triggerKeywords: [keyword1, keyword2]
---
```

**Command:**
```yaml
---
description: Brief description (max 120 chars)
argument-hint: "[--flag <value>]"
---
```

**Skill:**
```yaml
---
name: skill-name
description: Knowledge about X
allowed-tools: [Read, Grep, Glob]
---
```

### Validation One-Liners

```bash
# Validate plugin
node .claude-plugins/developer-tools-plugin/scripts/validate-plugin.js --plugin NAME

# Analyze agent
node .claude-plugins/developer-tools-plugin/scripts/analyze-agent-quality.js PATH

# Check hook syntax
bash -n HOOK_PATH

# Check script syntax
node --check SCRIPT_PATH

# Validate all plugins
.claude-plugins/developer-tools-plugin/scripts/lib/validate-all-plugins.sh
```

### Quality Gates Summary

| Component | Required | Target Score |
|-----------|----------|--------------|
| Agent | frontmatter, tools, triggerKeywords | ≥ 80 |
| Command | description, (argument-hint if args) | Pass |
| Hook | executable, valid syntax | Pass |
| Script | valid syntax, exports | Pass |
| Plugin | all above + manifest | ≥ 80 |

### State File Locations

| File | Location |
|------|----------|
| Session State | `.claude-plugins/[plugin]/PLUGIN_STATE.md` |
| Roadmap | `.claude-plugins/[plugin]/PLUGIN_ROADMAP.md` |
| Requirements | `.claude-plugins/[plugin]/PLUGIN_REQUIREMENTS.md` |
| Discovery | `.claude-plugins/[plugin]/DISCOVERY.md` |
| Task Specs | `.claude-plugins/[plugin]/COMPONENT_PLAN.md` |

### Key Script Paths

| Script | Path |
|--------|------|
| Validate Plugin | `.claude-plugins/developer-tools-plugin/scripts/validate-plugin.js` |
| Analyze Agent | `.claude-plugins/developer-tools-plugin/scripts/analyze-agent-quality.js` |
| Version Manager | `.claude-plugins/developer-tools-plugin/scripts/version-manager.js` |
| Generate README | `.claude-plugins/developer-tools-plugin/scripts/generate-readme.js` |
| Build Catalog | `.claude-plugins/developer-tools-plugin/scripts/build-marketplace-catalog.js` |
| Scaffold Plugin | `.claude-plugins/developer-tools-plugin/scripts/scaffold-plugin.js` |

---

## Related Documentation

### Primary References

| Document | Location | Covers |
|----------|----------|--------|
| **Plugin Development Standards** | `docs/PLUGIN_DEVELOPMENT_STANDARDS.md` | Authoritative requirements, naming conventions, quality gates, common mistakes |
| **Manifest Schema** | `PLUGIN_MANIFEST_SCHEMA.md` | JSON schema validation for plugin.json |
| **Routing Guide** | `docs/routing-help.md` | Agent routing rules, blocked operations |

### Standards Cross-Reference

For authoritative guidance on specific topics, see these sections in `PLUGIN_DEVELOPMENT_STANDARDS.md`:

| Topic | Standards Section |
|-------|-------------------|
| Component Requirements | Section 1 |
| YAML Frontmatter Specs | Section 2 |
| Naming Conventions | Section 3 |
| Directory Structure | Section 4 |
| Quality Gates | Section 5 |
| Validation Commands | Section 6 |
| Common Mistakes | Section 7 |
| Integration Patterns | Section 8 |

### Additional Resources

- **GSD Methodology**: `.claude-plugins/developer-tools-plugin/docs/GSD_FOR_PLUGIN_DEVELOPMENT.md`
- **Troubleshooting**: `docs/TROUBLESHOOTING_PLUGIN_LOADING.md`
- **GSD Agents**: `.claude-plugins/developer-tools-plugin/agents/plugin-*.md`
- **GSD Commands**: `.claude-plugins/developer-tools-plugin/commands/plugin-dev/*.md`

---

*Last Updated: 2026-01-18*
