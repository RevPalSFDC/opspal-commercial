# Developer Tools Plugin

> **⚠️ INTERNAL USE ONLY - NOT FOR DISTRIBUTION**
>
> This plugin is **gitignored** and used exclusively for plugin marketplace development and maintenance.
>
> **NEVER place user-facing features in this plugin.** User-facing features belong in distributable plugins:
> - `.claude-plugins/salesforce-plugin/` - Salesforce user features
> - `.claude-plugins/hubspot-core-plugin/` - HubSpot user features
> - `.claude-plugins/cross-platform-plugin/` - Cross-platform user features
>
> **Why this matters**: Fresh git clones won't have developer-tools-plugin → user installs will fail.
>
> **See**: [CLAUDE.md - Pre-Development Decision Tree](../../CLAUDE.md#pre-development-decision-tree) for choosing correct plugin location.

Complete plugin lifecycle management - scaffolding, validation, quality analysis, documentation generation, testing, and publishing tools for OpsPal Plugin Marketplace. Includes environment loading framework and JSONB submission utilities.

## Overview

Complete plugin lifecycle management - scaffolding, validation, quality analysis, documentation generation, testing, and publishing tools for OpsPal Plugin Marketplace. Includes environment loading framework and JSONB submission utilities.

This plugin provides 13 agents, 12 scripts, 9 commands.

## Quick Start

### Installation

```bash
/plugin install developer-tools-plugin@revpal-internal-plugins
```

### Verify Installation

```bash
/agents  # Should show 13 developer-tools-plugin agents
```

### Your First Task

Try asking for help with agent-developer:
```
User: "Help me creates new specialized sub-agents, extends existing agent capabilities, and develops agent interaction patterns for the salesforce project"
```

## Features

### Agents
- **agent-developer**: Creates new specialized sub-agents, extends existing agent capabilities, and develops agent interaction patterns for the Salesforce project
- **agent-quality-analyzer**: Analyzes agent quality including prompt engineering, tool usage, documentation, and best practices compliance with detailed scoring and improvement recommendations
- **agent-tester**: Comprehensive testing and validation system for sub-agents with advanced process validation, end-to-end testing, automated test generation, and error pattern analysis integration
- **plugin-catalog-manager**: Generates comprehensive marketplace catalogs with searchable plugin and agent directories, capability matrices, coverage analysis, and statistics
- **plugin-dependency-tracker**: Tracks and validates cross-plugin dependencies, detects circular dependencies, checks version compatibility, and analyzes breaking change impact
- **plugin-documenter**: Automatically generates comprehensive README files and documentation for plugins by extracting metadata from plugin.json, agents, scripts, and commands
- **plugin-integration-tester**: Runs comprehensive integration tests for plugin installation, agent discovery, functionality validation, and dependency checking with automated test reporting
- **plugin-publisher**: Manages plugin versioning, release preparation, git tagging, and marketplace publishing with automated changelog generation and pre-release validation
- **plugin-release-manager**: Manages plugin releases with version updates, git tagging, GitHub releases, CHANGELOG updates, and Slack notifications for the OpsPal Plugin Marketplace
- **plugin-scaffolder**: Automates creation of new plugins with proper structure, manifests, templates, and boilerplate code for rapid plugin development
- **plugin-test-generator**: Generates comprehensive test suites for plugins by auto-detecting testable functions, creating test scaffolding, and setting up test infrastructure with coverage reporting
- **plugin-validator**: Comprehensive validation of plugin structure, naming conventions, manifests, and marketplace standards with detailed compliance reporting
- **project-maintainer**: Maintains and manages the Salesforce sub-agent project itself, including agent updates, documentation, configuration management, and project health monitoring

### Scripts
- **analyze-agent-quality.js**: Agent Quality Analyzer
- **analyze-dependencies.js**: analyze-dependencies.js
- **announce-marketplace.js**: No description available
- **build-marketplace-catalog.js**: Marketplace Catalog Builder CLI
- **generate-readme.js**: README Generator CLI
- **generate-test-suite.js**: generate-test-suite.js
- **scaffold-plugin.js**: Plugin Scaffolding Script
- **send-plugin-release-notification.js**: No description available
- **test-plugin-installation.js**: Plugin Integration Tester
- **test-slack-simple.js**: No description available
- **validate-plugin.js**: Plugin Validation Script
- **version-manager.js**: Version Manager CLI

### Commands
- **/agent-quality**: # Analyze Agent Quality
- **/plugin-catalog**: # Generate Plugin Catalog
- **/plugin-deps**: # Analyze Plugin Dependencies
- **/plugin-generate-tests**: # Generate Plugin Test Suite
- **/plugin-publish**: # Publish Plugin Version
- **/plugin-release**: No description available
- **/plugin-scaffold**: # Scaffold New Plugin
- **/plugin-test**: # Test Plugin Integration
- **/plugin-validate**: # Validate Plugin Quality


## Agents

### agent-developer
**Description:** Creates new specialized sub-agents, extends existing agent capabilities, and develops agent interaction patterns for the Salesforce project

**Tools:** Read, Write, Grep, Glob, TodoWrite, Task

---

### agent-quality-analyzer
**Description:** Analyzes agent quality including prompt engineering, tool usage, documentation, and best practices compliance with detailed scoring and improvement recommendations

**Tools:** Read, Grep, Glob, TodoWrite, Bash

---

### agent-tester
**Description:** Comprehensive testing and validation system for sub-agents with advanced process validation, end-to-end testing, automated test generation, and error pattern analysis integration

**Tools:** Task, Read, Write, Grep, TodoWrite, Bash

---

### plugin-catalog-manager
**Description:** Generates comprehensive marketplace catalogs with searchable plugin and agent directories, capability matrices, coverage analysis, and statistics

**Tools:** Read, Grep, Glob, TodoWrite, Bash

---

### plugin-dependency-tracker
**Description:** Tracks and validates cross-plugin dependencies, detects circular dependencies, checks version compatibility, and analyzes breaking change impact

**Tools:** Not specified

---

### plugin-documenter
**Description:** Automatically generates comprehensive README files and documentation for plugins by extracting metadata from plugin.json, agents, scripts, and commands

**Tools:** Read, Write, Glob, Grep, TodoWrite, Bash

---

### plugin-integration-tester
**Description:** Runs comprehensive integration tests for plugin installation, agent discovery, functionality validation, and dependency checking with automated test reporting

**Tools:** Read, Write, Grep, Glob, TodoWrite, Bash

---

### plugin-publisher
**Description:** Manages plugin versioning, release preparation, git tagging, and marketplace publishing with automated changelog generation and pre-release validation

**Tools:** Read, Write, Edit, Grep, Glob, TodoWrite, Bash

---

### plugin-release-manager
**Description:** Manages plugin releases with version updates, git tagging, GitHub releases, CHANGELOG updates, and Slack notifications for the OpsPal Plugin Marketplace

**Tools:** Read, Write, Edit, Grep, Glob, TodoWrite, Bash

---

### plugin-scaffolder
**Description:** Automates creation of new plugins with proper structure, manifests, templates, and boilerplate code for rapid plugin development

**Tools:** Read, Write, Grep, Glob, TodoWrite, Bash

---

### plugin-test-generator
**Description:** Generates comprehensive test suites for plugins by auto-detecting testable functions, creating test scaffolding, and setting up test infrastructure with coverage reporting

**Tools:** Not specified

---

### plugin-validator
**Description:** Comprehensive validation of plugin structure, naming conventions, manifests, and marketplace standards with detailed compliance reporting

**Tools:** Read, Grep, Glob, TodoWrite, Bash

---

### project-maintainer
**Description:** Maintains and manages the Salesforce sub-agent project itself, including agent updates, documentation, configuration management, and project health monitoring

**Tools:** Read, Write, Grep, Glob, TodoWrite, Task

---


## Scripts

### analyze-agent-quality.js
**Purpose:** Agent Quality Analyzer

**Usage:**
```bash
node .claude-plugins/developer-tools-plugin/scripts/analyze-agent-quality.js
```

---

### analyze-dependencies.js
**Purpose:** analyze-dependencies.js

**Usage:**
```bash
node .claude-plugins/developer-tools-plugin/scripts/analyze-dependencies.js
```

---

### announce-marketplace.js
**Purpose:** No description available

**Usage:**
```bash
node .claude-plugins/developer-tools-plugin/scripts/announce-marketplace.js
```

---

### build-marketplace-catalog.js
**Purpose:** Marketplace Catalog Builder CLI

**Usage:**
```bash
node .claude-plugins/developer-tools-plugin/scripts/build-marketplace-catalog.js
```

---

### generate-readme.js
**Purpose:** README Generator CLI

**Usage:**
```bash
node .claude-plugins/developer-tools-plugin/scripts/generate-readme.js
```

---

### generate-test-suite.js
**Purpose:** generate-test-suite.js

**Usage:**
```bash
node .claude-plugins/developer-tools-plugin/scripts/generate-test-suite.js
```

---

### scaffold-plugin.js
**Purpose:** Plugin Scaffolding Script

**Usage:**
```bash
node .claude-plugins/developer-tools-plugin/scripts/scaffold-plugin.js
```

---

### send-plugin-release-notification.js
**Purpose:** No description available

**Usage:**
```bash
node .claude-plugins/developer-tools-plugin/scripts/send-plugin-release-notification.js
```

---

### test-plugin-installation.js
**Purpose:** Plugin Integration Tester

**Usage:**
```bash
node .claude-plugins/developer-tools-plugin/scripts/test-plugin-installation.js
```

---

### test-slack-simple.js
**Purpose:** No description available

**Usage:**
```bash
node .claude-plugins/developer-tools-plugin/scripts/test-slack-simple.js
```

---

### validate-plugin.js
**Purpose:** Plugin Validation Script

**Usage:**
```bash
node .claude-plugins/developer-tools-plugin/scripts/validate-plugin.js
```

---

### version-manager.js
**Purpose:** Version Manager CLI

**Usage:**
```bash
node .claude-plugins/developer-tools-plugin/scripts/version-manager.js
```

---


## Commands

### /agent-quality
# Analyze Agent Quality

See [commands/agent-quality.md](./commands/agent-quality.md) for detailed usage.

---

### /plugin-catalog
# Generate Plugin Catalog

See [commands/plugin-catalog.md](./commands/plugin-catalog.md) for detailed usage.

---

### /plugin-deps
# Analyze Plugin Dependencies

See [commands/plugin-deps.md](./commands/plugin-deps.md) for detailed usage.

---

### /plugin-generate-tests
# Generate Plugin Test Suite

See [commands/plugin-generate-tests.md](./commands/plugin-generate-tests.md) for detailed usage.

---

### /plugin-publish
# Publish Plugin Version

See [commands/plugin-publish.md](./commands/plugin-publish.md) for detailed usage.

---

### /plugin-release
No description available

See [commands/plugin-release.md](./commands/plugin-release.md) for detailed usage.

---

### /plugin-scaffold
# Scaffold New Plugin

See [commands/plugin-scaffold.md](./commands/plugin-scaffold.md) for detailed usage.

---

### /plugin-test
# Test Plugin Integration

See [commands/plugin-test.md](./commands/plugin-test.md) for detailed usage.

---

### /plugin-validate
# Validate Plugin Quality

See [commands/plugin-validate.md](./commands/plugin-validate.md) for detailed usage.

---

## Dependencies

### Required CLI Tools

- **node** >=18.0.0
  - Node.js runtime for development tools
  - Check: `node --version`
  - Install: https://nodejs.org/



## Documentation

### Plugin-Specific
- [CHANGELOG](./CHANGELOG.md) - Version history
- [Agents](./agents/) - Agent source files
- [Scripts](./scripts/) - Utility scripts
- [Commands](./commands/) - Slash commands

### General Documentation
- [Plugin Development Guide](../../docs/PLUGIN_DEVELOPMENT_GUIDE.md)
- [Agent Writing Guide](../../docs/AGENT_WRITING_GUIDE.md)
- [Plugin Quality Standards](../../docs/PLUGIN_QUALITY_STANDARDS.md)


## Troubleshooting

See individual agent documentation for specific troubleshooting guidance.

Common issues:
- Installation problems: Verify all dependencies are installed
- Agent not discovered: Run `/agents` to verify installation
- Permission errors: Check file permissions on scripts

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.

## Version History

See [CHANGELOG.md](./CHANGELOG.md) for detailed version history.

## License

MIT License - see repository LICENSE file

## Support

- **Documentation**: See `/docs` directory
- **Issues**: GitHub Issues
- **Repository**: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace

---

**Developer Tools Plugin v2.2.0** - Built by RevPal Engineering
