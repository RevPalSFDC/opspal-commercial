---
description: Analyze plugin dependencies, detect conflicts, check version compatibility, and generate dependency graphs
allowed-tools: Read, Bash, TodoWrite
model: claude-sonnet-4-5-20250929
---

# Analyze Plugin Dependencies

Track and validate dependencies across the OpsPal Plugin Marketplace to prevent version conflicts, circular dependencies, and breaking changes.

## Usage

### Analyze Single Plugin

```
/plugin-deps salesforce-plugin
```

Shows:
- Direct dependencies with versions
- Optional dependencies
- Required MCP servers and CLI tools
- Plugins that depend on this one
- Dependency depth and risk score

### Analyze All Plugins

```
/plugin-deps --all
```

Generates marketplace-wide summary with total plugins, dependencies, and any detected issues.

### Check for Circular Dependencies

```
/plugin-deps --check-circular
```

Detects dependency cycles like: `plugin-a → plugin-b → plugin-c → plugin-a`

### Check Version Compatibility

```
/plugin-deps --check-compatibility
```

Finds version conflicts where plugins require incompatible versions of the same dependency.

### Generate Dependency Graph

```
/plugin-deps --graph --output=mermaid
```

Creates visual dependency graph in Mermaid format for documentation.

### Find Dependents

```
/plugin-deps --find-dependents developer-tools-plugin
```

Lists all plugins that depend on the specified plugin.

### Calculate Breaking Change Impact

```
/plugin-deps --impact developer-tools-plugin 3.0.0
```

Analyzes how many plugins would be affected by a breaking change to version 3.0.0.

## Output Formats

- `--output=text` - Human-readable text (default)
- `--output=json` - Structured JSON
- `--output=csv` - CSV for spreadsheets
- `--output=mermaid` - Mermaid diagram

## CI/CD Integration

Use `--strict` flag in CI/CD to fail if issues detected:

```bash
node scripts/analyze-dependencies.js --all --check-circular --check-compatibility --strict
```

Fails if:
- Circular dependencies found
- Version conflicts detected
- Required dependencies missing

---

**Agent**: plugin-dependency-tracker
**Script**: scripts/analyze-dependencies.js
