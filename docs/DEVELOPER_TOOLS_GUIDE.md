# Developer Tools Guide

**Status**: Internal Infrastructure
**Location**: `dev-tools/developer-tools-plugin/` (gitignored)
**Last Updated**: 2026-02-11

## Overview

The **developer-tools-plugin** contains internal infrastructure for maintaining the plugin marketplace. These tools are gitignored and used only by plugin developers, not end users.

**Purpose**: Provide tested libraries and automation for:
- Plugin quality analysis
- Marketplace catalog generation
- Version management and publishing
- README generation
- Plugin validation
- Schema migrations

## 🎯 When to Use Developer Tools

**ALWAYS check this table before starting any development task:**

| Task Pattern | Use This Tool | Command/Agent | Why |
|--------------|---------------|---------------|-----|
| **Analyze agent quality** | Quality Analyzer | `node analyze-agent-quality.js <path>` | Get objective quality scores (0-100) |
| **Generate marketplace catalog** | Catalog Builder | `node build-marketplace-catalog.js` | Create searchable JSON/MD/CSV catalog |
| **Bump plugin version** | Version Manager | `node version-manager.js --plugin <name> --bump <type>` | Semantic versioning with changelog |
| **Generate plugin README** | README Generator | `node generate-readme.js --plugin <name>` | Auto-generate from manifest + agents |
| **Validate plugin manifest** | Plugin Validator | `claude plugin validate <path>` | Ensure manifest is valid |
| **Migrate Supabase schema** | Schema Migrator | `supabase-schema-manager` agent | Execute DDL with rollback |
| **Track plugin dependencies** | Dependency Tracker | `plugin-dependency-tracker` agent | Map inter-plugin dependencies |
| **Generate test suite** | Test Generator | `plugin-test-generator` agent | Scaffold tests for agents |

## 📚 Core Libraries (Phase 2 Complete)

All developer tools use these **tested, production-ready libraries**:

### 1. quality-analyzer.js (P1 Priority)

- **Test Coverage**: 33 tests, 94.52% statement coverage
- **Purpose**: Comprehensive agent quality scoring (0-100 points)
- **Scoring Categories**:
  - Frontmatter completeness: 10 points
  - Prompt engineering: 30 points (clarity, completeness, actionability)
  - Tool usage: 20 points (appropriateness, justification)
  - Documentation: 25 points (completeness, quality)
  - Examples: 10 points (code blocks, usage)
  - Troubleshooting: 5 points (section presence)
- **Grade Mapping**: A+ (90-100), A (85-89), A- (80-84), B+, B, B-, C+, C, C-, D, F
- **Used By**: `analyze-agent-quality.js`, `catalog-builder.js`

### 2. readme-generator.js

- **Test Coverage**: 29 tests, 58.45% statement coverage
- **Purpose**: Auto-generate plugin READMEs from metadata
- **Features**: Frontmatter parsing, JSDoc extraction, command docs, consistent formatting
- **Used By**: `generate-readme.js` CLI, `plugin-documenter` agent

### 3. plugin-publisher.js

- **Test Coverage**: 61 tests, 98.21% statement coverage, 100% function coverage
- **Purpose**: Semantic version management and publishing
- **Features**: Version parsing/comparison/bumping, changelog generation, conventional commits
- **Used By**: `version-manager.js` CLI, `plugin-publisher` agent

### 4. catalog-builder.js

- **Test Coverage**: 52 tests, 95.02% statement coverage (now with quality integration)
- **Purpose**: Marketplace catalog with search/filter capabilities
- **Features**: Plugin discovery, metadata extraction, JSON/MD/CSV output, quality scores
- **Used By**: `build-marketplace-catalog.js` CLI, `plugin-catalog-manager` agent

**Total**: 175 tests, 87.30% average coverage across 4 core libraries

## 🤖 Developer Agents

**Location**: `dev-tools/developer-tools-plugin/agents/`

### plugin-documenter

- **Purpose**: Generate and update plugin documentation
- **Tools**: Read, Write, Bash, Glob, Grep
- **Library**: readme-generator.js
- **Use When**: Creating/updating plugin READMEs

### plugin-publisher

- **Purpose**: Version management and release coordination
- **Tools**: Read, Write, Edit, Bash
- **Library**: plugin-publisher.js
- **Use When**: Bumping versions, generating changelogs, creating releases

### plugin-catalog-manager

- **Purpose**: Build and maintain marketplace catalog
- **Tools**: Read, Write, Bash, Glob
- **Library**: catalog-builder.js
- **Use When**: Updating marketplace catalog, generating plugin lists

### plugin-dependency-tracker

- **Purpose**: Analyze and track inter-plugin dependencies
- **Tools**: Read, Grep, Glob
- **Use When**: Understanding dependency graphs, preventing circular deps

### plugin-test-generator

- **Purpose**: Scaffold test suites for agents and scripts
- **Tools**: Read, Write, Bash
- **Use When**: Creating new tests, ensuring coverage

### supabase-schema-manager

- **Purpose**: Execute Supabase DDL operations with rollback
- **Tools**: Read, Write, Bash
- **Library**: supabase-schema-migrator.js
- **Use When**: Adding columns, creating indexes, altering tables

## 💻 CLI Commands

**Location**: `dev-tools/developer-tools-plugin/scripts/`

### Quality Analysis

```bash
node dev-tools/developer-tools-plugin/scripts/analyze-agent-quality.js \
  --agent <path> \
  --output json|markdown \
  --threshold 70
```

### Catalog Generation

```bash
node dev-tools/developer-tools-plugin/scripts/build-marketplace-catalog.js \
  --output json|markdown|csv \
  --domain salesforce|hubspot|developer \
  --search <keyword>
```

### Version Management

```bash
node dev-tools/developer-tools-plugin/scripts/version-manager.js \
  --plugin <name> \
  --bump major|minor|patch \
  --prerelease alpha|beta|rc \
  --dry-run
```

### README Generation

```bash
node dev-tools/developer-tools-plugin/scripts/generate-readme.js \
  --plugin <name> \
  --output <path> \
  --all  # Generate for all plugins
```

### Dependency Analysis

```bash
node dev-tools/developer-tools-plugin/scripts/analyze-dependencies.js \
  --plugin <name> \
  --output json|markdown
```

### Test Generation

```bash
node dev-tools/developer-tools-plugin/scripts/generate-test-suite.js \
  --plugin <name> \
  --type agent|script|command
```

### Executive Gap Analysis (Maintainer-Only)

This workflow is internal planning infrastructure for suite maintainers.
It is not part of runtime end-user command routing.

```bash
# Generate executive AI leverage + feature gap artifacts
npm run exec:generate

# Validate generated artifacts and contracts
# (fails if README/FEATURES headline metrics drift from docs/PLUGIN_SUITE_CATALOG.json)
npm run exec:validate

# CI sequence (generate + validate)
npm run exec:ci
```

Generated outputs:
- `reports/exec/opspal-capability-vs-ai-maturity.md`
- `reports/exec/opspal-mandatory-route-approval-governance.json`
- `reports/exec/opspal-mandatory-route-approval-governance.md`
- `reports/exec/opspal-unified-next-best-action-queue.json`
- `reports/exec/opspal-unified-next-best-action-queue.md`
- `reports/exec/opspal-command-telemetry-adoption-pack.json`
- `reports/exec/opspal-command-telemetry-adoption-pack.md`
- `reports/exec/opspal-manual-review-reduction-pack.json`
- `reports/exec/opspal-manual-review-reduction-pack.md`
- `reports/exec/opspal-data-hygiene-sunset-pack.json`
- `reports/exec/opspal-data-hygiene-sunset-pack.md`
- `reports/exec/opspal-monday-graduation-readiness.json`
- `reports/exec/opspal-monday-graduation-readiness.md`
- `reports/exec/opspal-cross-model-consultation-expansion.json`
- `reports/exec/opspal-cross-model-consultation-expansion.md`
- `reports/exec/opspal-forecast-simulation-standardization.json`
- `reports/exec/opspal-forecast-simulation-standardization.md`
- `reports/exec/opspal-initiative-roi-instrumentation.json`
- `reports/exec/opspal-initiative-roi-instrumentation.md`
- `reports/exec/opspal-gap-priority-matrix.csv`
- `reports/exec/opspal-90-day-initiatives.md`
- `reports/exec/opspal-90-day-execution-board.md`
- `reports/exec/strategy-dashboard-ai-gaps.json`
- `reports/exec/strategy-dashboard-feature-gaps.json`
- `reports/exec/strategy-dashboard-portfolio.json`
- `reports/exec/strategy-dashboard-portfolio.md`
- `docs/contracts/opspal-capability-contract.schema.json`
- `docs/contracts/opspal-opportunity-scoring-contract.schema.json`
- `docs/contracts/opspal-command-telemetry-contract.schema.json`

### Copilot Approval Queue (Maintainer-Only)

Use this workflow to enforce explicit human approvals for production-impacting recommendations.

```bash
# Queue command entrypoint
npm run copilot:approval -- --help

# Submit recommendation payload
npm run copilot:approval -- submit --input .temp/approval-request.json

# List pending approvals
npm run copilot:approval -- list --status pending

# Record decision
npm run copilot:approval -- decide \
  --id <request_id> \
  --decision approve \
  --by "<approver>" \
  --role "<role>" \
  --reason "<why>"
```

References:
- `docs/COPILOT_APPROVAL_QUEUE.md`
- `docs/contracts/opspal-copilot-approval-request.schema.json`

### Next-Best-Action Generation (Maintainer-Only)

Generate a ranked, cross-plugin remediation queue and ready-to-submit approval payloads.

```bash
# Generate ranked actions + approval payloads
npm run next-actions:generate

# Optional: auto-submit top approval-required actions to queue
node scripts/generate-next-best-actions.js --submit --top 5
```

Outputs:
- `reports/exec/opspal-next-best-actions.json`
- `reports/exec/opspal-next-best-actions.md`
- `reports/exec/approval-payloads/*.json`
- `docs/contracts/opspal-next-best-action.schema.json`
- `state/next-action-triage-telemetry.ndjson` (shadow-mode triage distribution telemetry)

Behavior:
- Shadow-mode triage labels are added to each action: `auto_route`, `assisted_review`, `manual_review`.
- Triage is non-blocking in this phase and does not change approval or promotion routing behavior.

### Approved Action Promotion (Maintainer-Only)

Promote approved queue requests into execution-ready work items for handoff, without mutating queue state.

```bash
# Read-only preview (no file writes)
npm run next-actions:promote -- --dry-run

# Export approved work items
npm run next-actions:promote

# Export filtered slice
npm run next-actions:promote -- --status approved --top 10
```

Outputs:
- `reports/exec/runtime/opspal-approved-work-items.json`
- `reports/exec/runtime/opspal-approved-work-items.md`
- `reports/exec/runtime/opspal-approved-work-items.csv`
- `state/command-telemetry.ndjson` (command telemetry envelopes from maintainer command scripts)

Telemetry behavior:
- Enabled by default for `copilot:approval`, `next-actions:generate`, `next-actions:promote`, `exec:generate`, and `exec:validate`.
- Set `OPSPAL_COMMAND_TELEMETRY_ENABLED=0` to disable local telemetry logging.

### Supabase Security Remediation (Tracked Dev Tool)

```bash
bash scripts/lib/fix-reflection-status-history-rls.sh
```

Use this when Supabase lint reports:
- `rls_disabled_in_public` on `public.reflection_status_history`

## 🔍 Pre-Task Developer Checklist

**Before starting ANY development task, ask these questions:**

1. **Is this a quality/analysis task?**
   - ✅ Use `quality-analyzer` library or `analyze-agent-quality.js`
   - Provides objective scores, identifies issues, generates recommendations

2. **Is this a catalog/search task?**
   - ✅ Use `catalog-builder` library or `build-marketplace-catalog.js`
   - Provides searchable JSON/MD/CSV, includes quality scores

3. **Is this a versioning/release task?**
   - ✅ Use `plugin-publisher` library or `version-manager.js`
   - Handles semantic versioning, changelog generation, conventional commits

4. **Is this a documentation task?**
   - ✅ Use `readme-generator` library or `generate-readme.js`
   - Auto-generates from manifest, agents, scripts, commands

5. **Is this a dependency/architecture task?**
   - ✅ Use `plugin-dependency-tracker` agent or `analyze-dependencies.js`
   - Maps dependencies, detects circular refs

6. **Is this a schema migration task?**
   - ✅ Use `supabase-schema-manager` agent or `supabase-schema-migrator.js`
   - Provides rollback capability, migration history

## 📊 Quality Standards

All agents and scripts in marketplace plugins should aim for:

- **Quality Score**: 70+ (B- or higher)
- **Test Coverage**: 80%+ statement coverage
- **Documentation**: Complete frontmatter + examples + troubleshooting
- **Tool Usage**: Justified and appropriate for task

### Tracking Quality

```bash
# Analyze all agents in a plugin
node dev-tools/developer-tools-plugin/scripts/analyze-agent-quality.js \
  --plugin salesforce-plugin \
  --output markdown > QUALITY_REPORT.md

# Check overall marketplace quality
node dev-tools/developer-tools-plugin/scripts/build-marketplace-catalog.js \
  --output json | jq '.summary.quality'
```

## 🚀 Integration with User-Facing Plugins

Developer tools are **separate from user-facing plugins**:

- ❌ **NOT distributed** to end users
- ❌ **NOT committed** to git
- ✅ **Used locally** by plugin developers
- ✅ **Referenced in** CLAUDE.md for discoverability

When building user-facing plugins (salesforce-plugin, hubspot-plugin, etc.), use these tools to ensure quality and consistency.

---

# Common Developer Operations

## Adding a New Plugin

1. **Create plugin directory**: `.claude-plugins/new-plugin/`
2. **Create structure**:
   ```
   new-plugin/
   ├── .claude-plugin/
   │   └── plugin.json          # Manifest with version, dependencies
   ├── agents/                   # Agent .md files
   ├── commands/                 # Slash command .md files
   ├── hooks/                    # Hook .sh scripts
   ├── scripts/lib/              # JavaScript utilities
   └── README.md                 # Plugin documentation
   ```
3. **Add to marketplace catalog**: `.claude-plugin/marketplace.json`
4. **Test installation**: `/plugin install new-plugin@revpal-internal-plugins`
5. **Document in README.md**
6. **Commit and push**

## Adding /reflect to a New Plugin

**Files to copy** from salesforce-plugin or opspal-hubspot:

1. `commands/reflect.md` - Adapt taxonomy for platform
2. `scripts/lib/submit-reflection.js` - Platform-agnostic (copy as-is)
3. `scripts/lib/query-reflections.js` - Platform-agnostic (copy as-is)
4. `hooks/post-reflect.sh` - Platform-agnostic (copy as-is)
5. Update plugin README with /reflect documentation

## Querying Reflections

```bash
# Recent reflections
SUPABASE_URL=https://REDACTED_SUPABASE_PROJECT.supabase.co \
SUPABASE_ANON_KEY=REDACTED_SUPABASE_ANON_KEY \
node .claude-plugins/opspal-salesforce/scripts/lib/query-reflections.js recent

# Search by keyword
node .claude-plugins/opspal-salesforce/scripts/lib/query-reflections.js search "automation"

# Top issues
node .claude-plugins/opspal-salesforce/scripts/lib/query-reflections.js topIssues

# My org's reflections
node .claude-plugins/opspal-salesforce/scripts/lib/query-reflections.js myOrg delta-corp
```

## Processing Reflections (Internal)

```bash
# Run the full workflow
/processreflections

# Output:
# 1. Fetches open reflections from Supabase
# 2. Detects cohorts by pattern matching
# 3. Generates fix plans with RCA
# 4. Creates Asana tasks
# 5. Updates reflection statuses
# 6. Sends Slack notification
```

## Best Practices

### Version Management

- Follow semantic versioning: MAJOR.MINOR.PATCH
- Use conventional commits: `feat:`, `fix:`, `docs:`, `chore:`
- Update CHANGELOG.md with each release
- Test locally before publishing

### Testing

- Maintain 80%+ test coverage
- Run test suite before commits
- Use test generators for new components
- Document test requirements

### Documentation

- Generate READMEs using readme-generator
- Include usage examples
- Document breaking changes
- Keep USAGE.md files updated

### Quality Control

- Run quality analyzer before releases
- Address issues with scores below 70
- Review agent frontmatter completeness
- Validate tool usage appropriateness

---

## New Validation & Automation Tools (2026-01)

### Pre-Commit Validation

A comprehensive pre-commit hook that enforces plugin standards:

```bash
# Install the hook
ln -sf $(pwd)/dev-tools/developer-tools-plugin/hooks/pre-commit-plugin-validator.sh .git/hooks/pre-commit
```

**Validates:**
- YAML frontmatter syntax and required fields
- Tool names against known valid tools
- Trigger keyword conflicts between agents
- Hook executability and bash syntax
- JavaScript syntax and security patterns

### New Validation Scripts

| Script | Purpose | Key Features |
|--------|---------|--------------|
| `frontmatter-validator.js` | Validate YAML frontmatter | Schema-based validation, field type checking |
| `tool-name-validator.js` | Validate tool references | Typo detection, suggestions, MCP pattern support |
| `trigger-keyword-registry.js` | Keyword conflict detection | Conflict resolution, suggestions |
| `quality-dashboard.js` | Quality dashboard with trends | Historical tracking, grade distribution |
| `routing-conflict-detector.js` | Routing issue detection | Protected keywords, ambiguity detection |
| `check-all-dependencies.js` | Cross-plugin dependencies | Version mismatches, circular imports |

### Usage Examples

#### Validate Frontmatter
```bash
# Validate all agents
node scripts/lib/frontmatter-validator.js --type agents

# Single plugin, strict mode
node scripts/lib/frontmatter-validator.js --plugin salesforce-plugin --strict
```

#### Check Tool Names
```bash
# Validate tool references
node scripts/lib/tool-name-validator.js

# List all valid tools
node scripts/lib/tool-name-validator.js --list
```

#### Quality Dashboard
```bash
# Generate dashboard with trends
node scripts/lib/quality-dashboard.js --trend

# Set custom threshold
node scripts/lib/quality-dashboard.js --threshold 80
```

#### Check Routing Conflicts
```bash
# Full analysis with resolutions
node scripts/lib/routing-conflict-detector.js --resolve

# Check specific agent
node scripts/lib/trigger-keyword-registry.js --check sfdc-cpq-assessor
```

#### Cross-Plugin Dependencies
```bash
# Check all dependencies
node scripts/lib/check-all-dependencies.js

# Auto-fix missing packages
node scripts/lib/check-all-dependencies.js --fix
```

### Manifest Generation

Auto-generate documentation from source:

```bash
# Canonical generator (CI source of truth)
npm run docs:generate

# Preview changes without writing
node scripts/generate-plugin-suite-docs.js --dry-run

# Update specific target
node scripts/generate-plugin-suite-docs.js --target agents

# Local devtools wrapper (if developer-tools-plugin is present locally)
node dev-tools/developer-tools-plugin/scripts/generate-manifests.js --target agents
```

### Configuration Files

New config files for enhanced scaffolding:

| File | Purpose |
|------|---------|
| `config/agent-templates.json` | Templates for orchestrator, assessor, validator, etc. |
| `config/tool-presets.json` | Tool combinations for different agent types |

### New Agent

- **dependency-manager**: Cross-plugin dependency management, version mismatch detection, circular import detection
