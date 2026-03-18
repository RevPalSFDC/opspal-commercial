# Plugin Development Standards

**Version**: 1.2.0
**Last Updated**: 2026-01-18
**Maintained By**: RevPal Engineering

This document defines the authoritative standards for developing, maintaining, and validating plugins in the OpsPal Plugin Marketplace. All plugins MUST adhere to these standards.

---

## Table of Contents

1. [Component Requirements](#1-component-requirements)
2. [YAML Frontmatter Specifications](#2-yaml-frontmatter-specifications)
3. [Naming Conventions](#3-naming-conventions)
4. [Directory Structure](#4-directory-structure)
5. [Quality Gates](#5-quality-gates)
6. [Validation Commands](#6-validation-commands)
7. [Common Mistakes](#7-common-mistakes)
8. [Integration Patterns](#8-integration-patterns)
9. [GSD Workflow for Plugin Development](#9-gsd-workflow-for-plugin-development)
10. [Maintenance & Updates](#10-maintenance--updates)

---

## 1. Component Requirements

### 1.1 Plugin Manifest (`plugin.json`)

Every plugin MUST have a valid `plugin.json` in `.claude-plugin/`:

```json
{
  "name": "plugin-name",
  "version": "1.0.0",
  "description": "Brief description of the plugin",
  "author": "RevPal Engineering",
  "repository": "https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace",
  "license": "MIT",
  "claude_code_version": ">=1.0.0",
  "dependencies": {},
  "agents": ["agents/*.md"],
  "hooks": {
    "pre-tool-call": ["hooks/pre-tool-call.sh"],
    "post-tool-call": ["hooks/post-tool-call.sh"]
  },
  "commands": ["commands/*.md"],
  "skills": ["skills/*.md"],
  "scripts": {
    "validate": "node scripts/validate.js",
    "test": "npm test"
  }
}
```

**Required fields**: `name`, `version`, `description`
**Recommended fields**: `author`, `repository`, `claude_code_version`

### 1.2 Commands

Commands are slash-executable prompts that appear in Claude Code's command palette.

**Location**: `.claude-plugins/<plugin>/commands/<name>.md`

**Requirements**:
- MUST have YAML frontmatter with `description`
- SHOULD have `argument-hint` if arguments are accepted
- MUST contain implementation instructions

### 1.3 Agents

Agents are specialized AI assistants with defined tools and behaviors.

**Location**: `.claude-plugins/<plugin>/agents/<name>.md`

**Requirements**:
- MUST have YAML frontmatter with required fields
- MUST define `tools` array
- SHOULD include usage examples

### 1.4 Skills

Skills provide contextual knowledge and patterns.

**Location**: `.claude-plugins/<plugin>/skills/<name>.md`

**Requirements**:
- MUST have YAML frontmatter with `description`
- MUST contain structured knowledge content

### 1.5 Hooks

Hooks execute shell commands at specific lifecycle points.

**Location**: `.claude-plugins/<plugin>/hooks/<name>.sh`

**Requirements**:
- MUST be executable (`chmod +x`)
- MUST use standardized exit codes (0-7)
- SHOULD source error-handler.sh

### 1.6 Scripts

Utility scripts for automation and validation.

**Location**: `.claude-plugins/<plugin>/scripts/lib/<name>.js`

**Requirements**:
- MUST include JSDoc documentation
- MUST export functions for reuse
- SHOULD have a CLI interface

---

## 2. YAML Frontmatter Specifications

### 2.1 Commands Frontmatter

**REQUIRED** - Every command file MUST start with:

```yaml
---
description: Brief description of what the command does (max 120 chars)
argument-hint: "[--flag <value>] [positional-arg]"
---
```

**Fields**:
| Field | Required | Description |
|-------|----------|-------------|
| `description` | YES | Short description shown in command palette |
| `argument-hint` | NO* | Hint for arguments (*REQUIRED if command accepts arguments) |

**Examples**:

```yaml
# Simple command (no arguments)
---
description: Run comprehensive Flow diagnostic workflows combining preflight, execution, and coverage analysis
---

# Command with arguments
---
description: Execute complete Company/Account deduplication workflow between HubSpot and Salesforce
argument-hint: "[--config <path>] [--output-dir <path>] [--resume <session>]"
---

# Command with positional arguments
---
description: Analyze Lightning Pages and Classic Layouts for quality, performance, and UX optimization opportunities
argument-hint: "[object-name] [--org <alias>] [--format <json|text>]"
---
```

### 2.2 Agent Frontmatter

```yaml
---
name: agent-name
description: What this agent does
model: sonnet
tools:
  - Read
  - Write
  - Bash
  - mcp__salesforce__*
allowed_tools:
  - Read
  - Write
blocked_tools:
  - dangerous_tool
tags:
  - salesforce
  - automation
---
```

**Fields**:
| Field | Required | Description |
|-------|----------|-------------|
| `name` | YES | Unique agent identifier (lowercase-hyphen) |
| `description` | YES | Agent purpose and capabilities |
| `model` | NO | AI model (default: sonnet) |
| `tools` | YES | Array of tools agent can use |
| `allowed_tools` | NO | Whitelist of allowed tools |
| `blocked_tools` | NO | Blacklist of blocked tools |
| `tags` | NO | Categorization tags |

### 2.3 Skills Frontmatter

```yaml
---
name: skill-name
description: What knowledge this skill provides
tags:
  - salesforce
  - deployment
---
```

**Fields**:
| Field | Required | Description |
|-------|----------|-------------|
| `name` | YES | Unique skill identifier |
| `description` | YES | Skill purpose and content summary |
| `tags` | NO | Categorization tags |

---

## 3. Naming Conventions

### 3.1 File Names

| Component | Convention | Example |
|-----------|------------|---------|
| Commands | `kebab-case.md` | `create-validation-rule.md` |
| Agents | `kebab-case.md` | `sfdc-cpq-assessor.md` |
| Skills | `kebab-case.md` | `deployment-validation-framework.md` |
| Hooks | `kebab-case.sh` | `pre-task-context-loader.sh` |
| Scripts | `kebab-case.js` | `query-lint.js` |
| Directories | `kebab-case` | `scripts/lib/` |

### 3.2 Agent Names

**Format**: `[platform-prefix]-[domain]-[function]`

| Platform | Prefix | Example |
|----------|--------|---------|
| Salesforce | `sfdc-` | `sfdc-cpq-assessor` |
| HubSpot | `hubspot-` | `hubspot-workflow-builder` |
| Cross-platform | None | `diagram-generator` |

### 3.3 Command Names

**Format**: `verb-noun` or `noun-verb`

Good examples:
- `create-validation-rule`
- `deploy-layout`
- `flow-diagnose`
- `audit-automation`

### 3.4 Hook Names

**Format**: `[lifecycle]-[domain]-[action].sh`

| Lifecycle | Example |
|-----------|---------|
| `pre-tool-call` | `pre-task-agent-validator.sh` |
| `post-tool-call` | `post-reflect-strategy-update.sh` |
| `session-start` | `session-start-agent-reminder.sh` |

---

## 4. Directory Structure

### 4.1 Standard Plugin Structure

```
.claude-plugins/<plugin-name>/
├── .claude-plugin/
│   └── plugin.json           # Plugin manifest (REQUIRED)
├── agents/                   # Agent definitions
│   ├── agent-one.md
│   └── agent-two.md
├── commands/                 # Slash commands
│   ├── command-one.md
│   └── command-two.md
├── skills/                   # Skill files
│   └── skill-one.md
├── hooks/                    # Lifecycle hooks
│   ├── lib/
│   │   └── error-handler.sh  # Shared hook utilities
│   ├── pre-hook.sh
│   └── post-hook.sh
├── scripts/                  # Utility scripts
│   ├── lib/
│   │   └── utility.js
│   └── qa/
│       └── validation.js
├── docs/                     # Documentation
│   └── GUIDE.md
├── CLAUDE.md                 # Plugin user guide
├── README.md                 # Plugin overview
├── USAGE.md                  # Quick start guide
└── CHANGELOG.md              # Version history
```

### 4.2 Required Files

| File | Purpose |
|------|---------|
| `.claude-plugin/plugin.json` | Plugin manifest |
| `CLAUDE.md` | User guidance for Claude |
| `README.md` | Plugin overview and installation |

### 4.3 Recommended Files

| File | Purpose |
|------|---------|
| `USAGE.md` | Quick start examples |
| `CHANGELOG.md` | Version history |
| `docs/` directory | Extended documentation |

---

## 5. Quality Gates

### 5.1 Pre-Commit Checklist

Before committing any plugin changes:

- [ ] All commands have YAML frontmatter with `description`
- [ ] All agents have required frontmatter fields
- [ ] All hooks are executable (`chmod +x`)
- [ ] Hook syntax is valid (`bash -n <hook>`)
- [ ] Scripts have JSDoc documentation
- [ ] `plugin.json` version is updated
- [ ] Tests pass (if applicable)
- [ ] No secrets or credentials in code

### 5.2 Command Validation

```bash
# Check all commands have frontmatter
for f in .claude-plugins/*/commands/*.md; do
  head -1 "$f" | grep -q "^---$" || echo "Missing frontmatter: $f"
done
```

### 5.3 Hook Validation

```bash
# Validate hook syntax
for hook in .claude-plugins/*/hooks/*.sh; do
  bash -n "$hook" || echo "Syntax error: $hook"
done

# Check executability
for hook in .claude-plugins/*/hooks/*.sh; do
  [ -x "$hook" ] || echo "Not executable: $hook"
done
```

### 5.4 Agent Validation

```bash
# Check agent frontmatter
for agent in .claude-plugins/*/agents/*.md; do
  head -1 "$agent" | grep -q "^---$" || echo "Missing frontmatter: $agent"
done
```

---

## 6. Validation Commands

### 6.1 Plugin Validation Script

```bash
# Validate single plugin
node .claude-plugins/developer-tools-plugin/scripts/lib/validate-plugin.js \
  --plugin salesforce-plugin

# Validate all plugins
.claude-plugins/developer-tools-plugin/scripts/validate-all-plugins.sh
```

### 6.2 Quality Analysis

```bash
# Run quality analyzer
node .claude-plugins/developer-tools-plugin/scripts/lib/quality-analyzer.js \
  --plugin salesforce-plugin

# Generate quality report
/quality-check --plugin salesforce-plugin
```

### 6.3 SOQL Validation (Salesforce)

```bash
# Lint SOQL queries
node "${OPSPAL_SALESFORCE_ROOT}/scripts/qa/query-lint.js"
```

### 6.4 Agent Discovery Test

```bash
# Verify agents are discoverable
/agents | grep <agent-name>
```

### 6.5 Command Discovery Test

```bash
# Verify commands appear in help
# Type / in Claude Code and search for command
```

---

## 7. Common Mistakes

### 7.1 Missing Command Frontmatter

**Symptom**: Command doesn't appear in Claude Code command palette

**Cause**: Missing or malformed YAML frontmatter

**Fix**: Add proper frontmatter:
```yaml
---
description: What this command does
argument-hint: "[--flag <value>]"
---
```

**Prevention**: Run frontmatter validation before commit

### 7.2 Non-Executable Hooks

**Symptom**: Hook doesn't execute, silent failure

**Cause**: Missing execute permission

**Fix**: `chmod +x <hook>.sh`

**Prevention**: Add chmod to hook creation workflow

### 7.3 Invalid Hook Syntax

**Symptom**: Hook crashes with bash error

**Cause**: Syntax error in shell script

**Fix**: Run `bash -n <hook>.sh` to identify errors

**Prevention**: Validate syntax before commit

### 7.4 Missing Agent Tools

**Symptom**: Agent can't perform expected operations

**Cause**: Required tools not in frontmatter `tools` array

**Fix**: Add missing tools to frontmatter

### 7.5 Cross-Plugin Dependencies

**Symptom**: Plugin fails when another plugin not installed

**Cause**: Importing code from another plugin

**Fix**:
- Copy shared code locally, OR
- Publish as npm package, OR
- Move to opspal-core

### 7.6 Secrets in Code

**Symptom**: Credentials exposed in repository

**Cause**: Hardcoded API keys, tokens, passwords

**Fix**:
- Remove from code immediately
- Use environment variables
- Rotate compromised credentials

**Prevention**: Pre-commit hook scanning for secrets

### 7.7 Version Not Updated

**Symptom**: Changes not recognized as new version

**Cause**: Forgot to update `plugin.json` version

**Fix**: Update version following semver:
- PATCH: Bug fixes
- MINOR: New features
- MAJOR: Breaking changes

---

## 8. Integration Patterns

### 8.1 Assignment Rules Integration Pattern

**Purpose**: Guide agents that handle record routing or automation to properly integrate with Salesforce Assignment Rules

**When to Use**:
- Agent handles record assignment or routing
- Agent works with Lead or Case objects
- Agent creates/modifies automation that affects owner assignment
- Agent performs org-wide automation audits

#### Applicability Check

```javascript
// Check if Assignment Rules apply
if (objectType === 'Lead' || objectType === 'Case') {
  if (requiresRuleModification || requiresConflictCheck) {
    // Use Assignment Rules integration pattern
  }
}
```

#### Integration Components

**Required Components for Assignment Rules Integration**:

| Component | Location | Purpose |
|-----------|----------|---------|
| **Orchestrator Agent** | `sfdc-assignment-rules-manager.md` | Master coordinator for all Assignment Rules operations |
| **Skill Document** | `skills/assignment-rules-framework/SKILL.md` | 7-phase methodology, templates, API reference |
| **Conflict Rules** | `skills/assignment-rules-framework/conflict-detection-rules.md` | 8 conflict patterns (9-16) specific to Assignment Rules |
| **Scripts (7)** | `scripts/lib/assignment-rule-*.js` | Parser, validator, overlap detector, deployer, evaluator |
| **Validators (2)** | `scripts/lib/validators/assignment-rule-validator.js` | 20-point pre-deployment validation |
| **Templates** | `skills/assignment-rules-framework/template-library.json` | 6 pre-built templates for common patterns |

#### Delegation Pattern

**When to Delegate to assignment-rules-manager**:

```markdown
## Delegation Decision Tree

### Check 1: Does task involve Assignment Rules?
- Creating new Assignment Rule → ✅ Delegate
- Modifying existing Assignment Rule → ✅ Delegate
- Auditing automation conflicts → ✅ Delegate (if conflicts found)
- Simple owner/queue change (no rule modification) → ❌ Handle directly

### Check 2: Which object?
- Lead → ✅ Assignment Rules supported
- Case → ✅ Assignment Rules supported
- Account → ❌ Use Territory2 (sfdc-territory-assignment)
- Contact → ❌ Use custom Apex solution
- Other → ❌ Not supported by native Assignment Rules

### Check 3: Complexity level?
- Simple (1-2 entries, no conflicts) → Direct execution or delegate
- Medium (3-10 entries, minor conflicts) → Delegate recommended
- Complex (>10 entries, conflicts, circular routing) → ✅ Delegate REQUIRED
```

**Agent Integration Example** (`sfdc-sales-operations.md`):

```markdown
## Assignment Rule Integration (v3.62.0)

### When to Delegate to assignment-rules-manager

**Delegate for these operations:**
- ✅ Creating new Assignment Rules
- ✅ Modifying Assignment Rule criteria or order
- ✅ Changing Assignment Rule assignees
- ✅ Activating/deactivating Assignment Rules
- ✅ Deploying Assignment Rules to sandbox/production

**Handle directly:**
- ✅ Simple owner field updates (no rule change)
- ✅ Queue membership changes
- ✅ Territory assignment (Account objects)

### Delegation Code Pattern

```javascript
// Check if Assignment Rule modification needed
const requiresRuleModification = (
  userRequest.includes('assignment rule') ||
  userRequest.includes('lead routing') ||
  userRequest.includes('case routing')
);

if (requiresRuleModification && (object === 'Lead' || object === 'Case')) {
  // Delegate to assignment-rules-manager
  return Task({
    subagent_type: 'sfdc-assignment-rules-manager',
    prompt: `${userRequest} for ${object} in org ${orgAlias}`
  });
}
```

### Integration with sfdc-assignment-rules-manager

**assignment-rules-manager provides:**
- 7-phase workflow (Discovery → Documentation)
- 30-point pre-deployment validation
- 8 conflict detection patterns
- Template library (6 pre-built templates)
- Automated testing and verification
- Rollback procedures

**Coordination agents:**
- **sfdc-automation-auditor** - Detects conflicts with Assignment Rules (patterns 9-16)
- **sfdc-deployment-manager** - Runs 30-point validation before deployment
- **sfdc-sales-operations** - Delegates complex routing to assignment-rules-manager
```

#### Conflict Detection Integration

**Coordination with sfdc-automation-auditor** (v3.62.0):

```markdown
## Assignment Rules Conflict Detection

### 8 New Conflict Patterns (9-16)

| Pattern | Type | Severity | Description |
|---------|------|----------|-------------|
| 9 | Overlapping Assignment Criteria | Critical | Multiple rules match same record |
| 10 | Assignment Rule vs Flow | High | Flow and rule both assign owner |
| 11 | Assignment Rule vs Trigger | High | Trigger assigns before/after rule |
| 12 | Circular Assignment Routing | Critical | Assignment creates loop |
| 13 | Territory vs Assignment | Medium | Territory conflicts with owner rule |
| 14 | Queue Membership Access | High | Queue member lacks object access |
| 15 | Record Type Mismatch | Medium | Rule doesn't account for record types |
| 16 | Field Dependency | Critical | Criteria field doesn't exist |

### Integration in Automation Audit

**When sfdc-automation-auditor runs:**
1. Include Assignment Rules in automation inventory
2. Check for conflicts with Flows, Triggers, Process Builder
3. If conflicts detected → Delegate to sfdc-assignment-rules-manager for detailed analysis
4. Include Assignment Rules in cascade diagrams
5. Apply risk scores (Assignment Rule conflicts = HIGH severity)

**Delegation Pattern:**
```javascript
// Check if task involves Assignment Rules
if (userRequest.includes('assignment rule')) {
  // Delegate to assignment-rules-manager for detailed analysis
  await Task({
    subagent_type: 'sfdc-assignment-rules-manager',
    prompt: `Analyze assignment rules for ${org}: ${userRequest}`
  });
}
```
```

#### Deployment Validation Integration

**Enhanced Validator** (`sfdc-deployment-manager.md`):

```markdown
## Assignment Rules Pre-Deployment Checks (v3.62.0)

**30-point validation** (base 20 + Assignment Rules 10):

### Assignment Rule-Specific Checks (21-30)

21. **Assignment Rule Structure** - Valid XML, required fields
22. **Assignee Existence** - User/Queue/Group exists
23. **Assignee Access** - Assignee can access object (Edit permission)
24. **Field References** - Criteria fields exist on object
25. **Operator Compatibility** - Field type supports operator
26. **Activation Conflict** - Only one active rule per object
27. **Order Conflicts** - No duplicate orderNumbers
28. **Circular Routing** - No User → Queue → User loops
29. **Email Template** - Template exists if notification enabled
30. **Rule Entry Limit** - Not exceeding 3000 entries (warn at 300)

### Pre-Deployment Workflow

```bash
# Gate 0.5: Assignment Rule Validation (NEW)
if [ -d "force-app/main/default/assignmentRules" ]; then
    echo "🔒 Gate 0.5: Validating Assignment Rules..."
    for rule_file in force-app/main/default/assignmentRules/*.assignmentRules-meta.xml; do
        node scripts/lib/validators/assignment-rule-validator.js <org> "$rule_file"
    done
fi
```
```

#### Script Library Integration

**Available Scripts** (for agent use):

```javascript
// Parse Assignment Rule XML
const parser = require('./scripts/lib/assignment-rule-parser');
const ruleData = parser.parseRuleMetadata(xmlString);

// Validate assignees
const validator = require('./scripts/lib/assignee-validator');
const isValid = await validator.validateUser(userId);

// Detect conflicts
const detector = require('./scripts/lib/assignment-rule-overlap-detector');
const conflicts = detector.detectOverlappingRules(ruleEntries);

// Evaluate criteria
const evaluator = require('./scripts/lib/criteria-evaluator');
const match = evaluator.findMatchingRule(ruleEntries, recordData);

// Deploy rule
const deployer = require('./scripts/lib/assignment-rule-deployer');
await deployer.deployRule(ruleXML, orgAlias);

// Pre-deployment validation
const ruleValidator = require('./scripts/lib/validators/assignment-rule-validator');
const validationResult = await ruleValidator.validatePreDeployment(ruleXML, orgAlias);

// Access validation
const accessValidator = require('./scripts/lib/validators/assignee-access-validator');
const accessReport = await accessValidator.auditAccessLevels(assignmentRule);
```

#### Skill Loading Pattern

**Automatic Skill Context Loading**:

```markdown
## Assignment Rules Framework Skill

**Load automatically when:**
- User mentions "assignment rule", "lead routing", "case routing"
- Agent handles Lead or Case assignment operations
- Conflict detection needed for automation audit

**Skill Location**: `.claude-plugins/opspal-salesforce/skills/assignment-rules-framework/SKILL.md`

**Key Sections**:
1. **7-Phase Methodology** - Discovery through Documentation
2. **API Reference** - SOAP, REST, Metadata, Tooling API
3. **Conflict Detection Rules** - 8 patterns specific to Assignment Rules
4. **Template Library** - 6 pre-built templates
5. **CLI Commands** - All Salesforce CLI operations
6. **Troubleshooting** - Common issues and resolutions
7. **Best Practices** - 10 core principles
8. **Limitations & Workarounds** - Platform constraints

**Agent Loading Pattern**:
```
Always consult: `.claude-plugins/opspal-salesforce/skills/assignment-rules-framework/SKILL.md`

Key sections:
- 7-Phase Methodology
- Conflict Detection Rules (8 core conflicts)
- Templates (Lead, Case)
- CLI Commands
- API Reference (SOAP, REST, Metadata)
- Troubleshooting
```
```

#### Benefits of Assignment Rules Integration

| Benefit | Impact | Measurement |
|---------|--------|-------------|
| **Prevents Deployment Failures** | 80% reduction | 30-point pre-deployment validation |
| **Conflict Detection** | Early detection | 8 conflict patterns (9-16) identified |
| **Faster Implementation** | 60% time savings | 7-phase methodology + templates |
| **Reduced Errors** | 40-80% error reduction | Automated validation and testing |
| **Institutional Knowledge** | Reusable patterns | Template library + skill documentation |
| **Consistent Approach** | Standardized process | Orchestrator pattern + delegation matrix |

#### Agent Checklist for Integration

When creating/modifying agents that handle record assignment:

- [ ] Check if Assignment Rules apply (Lead/Case only)
- [ ] Coordinate with sfdc-assignment-rules-manager for metadata changes
- [ ] Use assignee-validator.js for access verification
- [ ] Integrate with sfdc-automation-auditor for conflict detection
- [ ] Load assignment-rules-framework skill for context
- [ ] Use delegation pattern for complex operations
- [ ] Run pre-deployment validation (30 checks)
- [ ] Test with sample records before production
- [ ] Document in org runbook after deployment

#### Documentation Requirements

**When adding Assignment Rules capability to an agent:**

1. **Agent Metadata** - Update frontmatter with dependencies:
   ```yaml
   dependencies:
     - sfdc-assignment-rules-manager
     - sfdc-automation-auditor (if conflict detection)
     - sfdc-deployment-manager (if production deployment)
   ```

2. **Agent Documentation** - Add integration section:
   ```markdown
   ## Assignment Rules Integration

   ### When to Delegate
   [Delegation decision tree]

   ### Script Usage
   [Examples of using assignment-rule-*.js scripts]

   ### Skill Reference
   [Link to assignment-rules-framework/SKILL.md]
   ```

3. **Tests** - Add routing tests:
   - Agent discovery test (`/agents assignment`)
   - Delegation test (verify Task calls)
   - Integration test (end-to-end workflow)

#### Reference Implementation

**Complete Example**: See `sfdc-sales-operations.md` (lines 190-365) for gold standard Assignment Rules integration:
- Delegation decision tree
- Code patterns
- Integration documentation
- Benefits of delegation
- Coordination with assignment-rules-manager

**Files to Reference**:
- Agent: `.claude-plugins/opspal-salesforce/agents/sfdc-assignment-rules-manager.md`
- Skill: `.claude-plugins/opspal-salesforce/skills/assignment-rules-framework/SKILL.md`
- Scripts: `.claude-plugins/opspal-salesforce/scripts/lib/assignment-rule-*.js`
- Validators: `.claude-plugins/opspal-salesforce/scripts/lib/validators/assignment-rule-*.js`
- Tests: `.claude-plugins/opspal-salesforce/scripts/lib/__tests__/assignment-rules/`

---

## 9. GSD Workflow for Plugin Development

The GSD (Get Shit Done) framework provides a context-aware, phase-based methodology for building high-quality plugins. This workflow is implemented in the developer-tools-plugin.

### 9.1 Overview

GSD addresses the unique challenges of maintaining quality across long development sessions and complex multi-component plugins.

**Core Principles:**
1. **Context Engineering** - Strategic management of Claude's context to maintain quality
2. **Phase-Based Development** - Structured workflow from discovery to verification
3. **Fresh Context Pattern** - Spawn subagents for complex work to prevent degradation
4. **Persistent State** - State files survive context compaction and session restarts
5. **Goal-Backward Design** - Define success before implementation

### 9.2 Context Quality Zones

Context fill percentage directly impacts output quality:

| Zone | Fill % | Quality | Recommendation |
|------|--------|---------|----------------|
| **PEAK** | 0-30% | Excellent | Complex components, architectural work |
| **GOOD** | 30-50% | Good | Standard development, most tasks |
| **DEGRADING** | 50-70% | Declining | Simple tasks only, consider fresh agent |
| **POOR** | 70%+ | Poor | Pause and spawn fresh agent |

**When to spawn a fresh agent:**
- Context reaches 50%+ for complex components
- Working on agents (high token cost)
- Architectural decisions needed
- Quality issues observed

### 9.3 Development Workflow

```
Discovery → Planning → Execution → Verification → Milestone
    ↑                                                  |
    └──────────────── Gap Closure ←────────────────────┘
```

**Discovery Protocol Levels:**

| Level | When | Time | Output |
|-------|------|------|--------|
| **0: Skip** | Established pattern exists | 0 min | Direct reference |
| **1: Quick** | Single question/clarification | 5-15 min | Answer + source |
| **2: Standard** | Multiple approaches | 1-3 hr | DISCOVERY.md |
| **3: Deep Dive** | Architectural/high-risk | 1+ day | POC + options |

### 9.4 Commands

| Command | Purpose |
|---------|---------|
| `/plugin-dev:new-plugin` | Start new plugin with discovery |
| `/plugin-dev:plan-component` | Plan specific component |
| `/plugin-dev:execute-component` | Execute planned task |
| `/plugin-dev:verify-component` | Verify against quality gates |
| `/plugin-dev:milestone` | Complete version milestone |
| `/plugin-dev:pause` | Pause with state capture |
| `/plugin-dev:resume` | Resume from state file |
| `/plugin-dev:progress` | Show progress report |

### 9.5 Agents

| Agent | Purpose |
|-------|---------|
| `plugin-context-engineer` | Monitor context quality |
| `plugin-phase-planner` | Create development plans |
| `plugin-phase-executor` | Execute planned tasks |
| `plugin-verifier` | Quality gate verification |
| `plugin-researcher` | Discovery research |

### 9.6 State Management

The `PLUGIN_STATE.md` file persists development state across sessions:

```markdown
## Session Info
- Plugin: my-plugin
- Last Updated: 2025-01-15 14:30:00
- Estimated Context: ~45%
- Status: active

## Current Task
- Name: Create data-validator agent
- Status: in_progress

## Next Tasks (Queue)
1. Create data-transformer command
2. Final verification pass
```

### 9.7 Best Practices

1. **Start complex work in PEAK zone** (0-30% context)
2. **Verify after each component** - Don't batch failures
3. **Use atomic git commits** - One commit per component
4. **Never commit in POOR zone** - Quality risk

**Documentation:** See `docs/GSD_FOR_PLUGIN_DEVELOPMENT.md` in developer-tools-plugin for complete methodology.

---

## 10. Maintenance & Updates

### 10.1 Keeping This Document Current

This document MUST be updated when:

1. **New component types** are added to the plugin system
2. **Frontmatter requirements** change
3. **Validation tools** are added or modified
4. **Common mistakes** are discovered and resolved
5. **Naming conventions** are standardized
6. **Integration patterns** are established for new features

### 10.2 Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.2.0 | 2026-01-18 | Added GSD Workflow for Plugin Development (Section 9) |
| 1.1.0 | 2025-12-15 | Added Assignment Rules Integration Pattern (Section 8) |
| 1.0.0 | 2025-12-13 | Initial comprehensive standards document |

### 10.3 Automated Standards Enforcement

Future improvements planned:

- [ ] Pre-commit hooks for frontmatter validation
- [ ] CI/CD pipeline validation
- [ ] Automated version bumping
- [ ] Standards compliance scoring
- [ ] Integration pattern validation

### 10.4 Contributing to Standards

To propose changes to these standards:

1. Create an issue describing the proposed change
2. Discuss with team for consensus
3. Update this document
4. Update validation scripts if needed
5. Communicate changes to all plugin developers

### 10.5 Plugin Component Inventory

**Current inventory (as of 2025-12-13)**:

| Plugin | Agents | Commands | Skills | Hooks | Scripts |
|--------|--------|----------|--------|-------|---------|
| salesforce-plugin | 74 | 41 | 16 | 26 | 470 |
| hubspot-plugin | 44 | 21 | 0 | 12 | 85 |
| opspal-core | 14 | 16 | 0 | 17 | 88 |
| developer-tools-plugin | 17 | 9 | 0 | 2 | 35 |
| gtm-planning-plugin | 7 | 0 | 0 | 0 | 0 |
| data-hygiene-plugin | 1 | 1 | 0 | 0 | 12 |
| ai-consult-plugin | 1 | 0 | 0 | 1 | 4 |

**Total**: 158 agents, 88 commands, 16 skills, 58 hooks, 694 scripts

---

## Quick Reference Card

### Command Frontmatter Template

```yaml
---
description: Brief description (max 120 chars)
argument-hint: "[--flag <value>] [positional]"
---
```

### Agent Frontmatter Template

```yaml
---
name: agent-name
description: What this agent does
tools:
  - Read
  - Write
  - Bash
---
```

### Skill Frontmatter Template

```yaml
---
name: skill-name
description: What knowledge this skill provides
---
```

### Pre-Commit Validation

```bash
# Quick validation
for f in .claude-plugins/*/commands/*.md; do
  head -1 "$f" | grep -q "^---$" || echo "FAIL: $f"
done
```

---

**Document Owner**: RevPal Engineering
**Review Cycle**: Monthly or upon significant changes
**Last Review**: 2025-12-13
