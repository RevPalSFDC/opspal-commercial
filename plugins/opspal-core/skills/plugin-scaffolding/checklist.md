# New Component Checklist

## Creating a New Agent

### Pre-Creation
- [ ] Identify the specific purpose (narrow focus)
- [ ] Define capability boundaries
- [ ] List required tools
- [ ] Determine routing keywords
- [ ] Check for existing agents with similar purpose

### File Creation
- [ ] Create `agents/{agent-name}.md`
- [ ] Add YAML frontmatter with required fields
- [ ] Include "Purpose" section
- [ ] Include "Capability Boundaries" section
- [ ] Include "When to Use a Different Agent" section
- [ ] Add example usage

### Post-Creation
- [ ] Test agent discovery: `/agents`
- [ ] Test routing: Ask a question with trigger keywords
- [ ] Update CLAUDE.md if agent changes plugin capabilities
- [ ] Add to plugin.json description if significant

---

## Creating a New Hook

### Pre-Creation
- [ ] Determine hook type (UserPromptSubmit, PostToolUse, etc.)
- [ ] Define triggering conditions
- [ ] Plan output format (systemMessage, blockExecution)
- [ ] Check for conflicts with existing hooks

### File Creation
- [ ] Create `hooks/{hook-name}.sh`
- [ ] Make executable: `chmod +x hooks/{hook-name}.sh`
- [ ] Add shebang: `#!/bin/bash`
- [ ] Set `set -euo pipefail`
- [ ] Source error handler if available
- [ ] Add dependency checks
- [ ] Implement main logic
- [ ] Output valid JSON

### Configuration
- [ ] Add to `.claude-plugin/hooks.json`
- [ ] Set appropriate timeout
- [ ] Add matcher pattern
- [ ] Add description

### Post-Creation
- [ ] Test hook execution manually
- [ ] Verify JSON output is valid
- [ ] Check hook appears in diagnostics
- [ ] Test with real prompts

---

## Creating a New Command

### Pre-Creation
- [ ] Define clear purpose
- [ ] Determine required arguments
- [ ] Plan expected output
- [ ] Check for naming conflicts

### File Creation
- [ ] Create `commands/{command-name}.md`
- [ ] Add YAML frontmatter (name, description, argument-hint)
- [ ] Write usage section
- [ ] Document options
- [ ] Add examples
- [ ] Write prompt body (instructions for Claude)

### Post-Creation
- [ ] Test command invocation: `/{command-name}`
- [ ] Verify arguments work correctly
- [ ] Check command appears in listings
- [ ] Update CLAUDE.md "Common Commands" section

---

## Creating a New Script

### Pre-Creation
- [ ] Define module purpose
- [ ] Plan exported functions
- [ ] Determine dependencies
- [ ] Design CLI interface (if needed)

### File Creation
- [ ] Create `scripts/lib/{script-name}.js`
- [ ] Add JSDoc header with @fileoverview
- [ ] Define configuration constants
- [ ] Create JSDoc typedefs
- [ ] Implement core functions with JSDoc
- [ ] Add CLI handler if needed
- [ ] Export functions via module.exports

### Post-Creation
- [ ] Test as module: `require('./script-name')`
- [ ] Test CLI if applicable: `node scripts/lib/script-name.js help`
- [ ] Verify no syntax errors: `node --check scripts/lib/script-name.js`
- [ ] Add to agent instructions if agents should use it

---

## Creating a New Skill

### Pre-Creation
- [ ] Define specific capability (one skill = one capability)
- [ ] Write clear description for discovery
- [ ] Determine allowed-tools restrictions
- [ ] Plan supporting documentation

### File Creation
- [ ] Create `skills/{skill-name}/` directory
- [ ] Create `SKILL.md` with YAML frontmatter
- [ ] Use lowercase-hyphen naming
- [ ] Write "When to Use This Skill" section
- [ ] Create supporting .md files

### Post-Creation
- [ ] Verify Claude activates skill on relevant prompts
- [ ] Test allowed-tools restrictions
- [ ] Check skill appears in discovery

---

## Quality Checks

### Agent Quality
```bash
node scripts/lib/quality-analyzer.js agents/{agent-name}.md
```

### Hook Syntax
```bash
bash -n hooks/{hook-name}.sh
```

### Script Syntax
```bash
node --check scripts/lib/{script-name}.js
```

### Plugin Validation
```bash
claude plugin validate .claude-plugin/plugin.json
```

---

## Documentation Updates

### For Agents
- [ ] Update CLAUDE.md "Available Agents" if significant
- [ ] Add routing guidance to parent CLAUDE.md
- [ ] Update README.md feature list

### For Hooks
- [ ] Document in CLAUDE.md if user-facing behavior
- [ ] Add to HOOK_ARCHITECTURE.md if complex

### For Commands
- [ ] Add to CLAUDE.md "Common Commands"
- [ ] Include in README.md command list

### For Scripts
- [ ] Add usage to relevant agent instructions
- [ ] Document in CLAUDE.md if user-callable

---

## Version Management

After adding significant components:

1. Update `plugin.json` version (semantic versioning)
2. Update `plugin.json` description if capabilities changed
3. Add entry to `CHANGELOG.md`
4. Update feature counts in README.md

### Version Bump Rules

| Change | Bump |
|--------|------|
| New agent | Minor |
| New hook | Minor |
| New command | Minor |
| New script | Patch |
| Bug fix | Patch |
| Breaking change | Major |
