---
name: solution-validate
description: Validate solution template structure, parameters, and dependencies without deploying
argument-hint: "<solution-path> [--env <environment>] [--strict]"
---

# Solution Validate Command

Validate a solution template structure, parameters, dependencies, and templates without deploying.

## Usage

```bash
/solution-validate <solution-path> [options]
```

## Arguments

- `<solution-path>` - Path to solution directory or solution.json file

## Optional Parameters

- `--env <environment>` - Validate against specific environment profile
- `--strict` - Enable strict validation (fail on warnings)
- `--verbose` - Show detailed validation output
- `--format <format>` - Output format: text, json, markdown (default: text)

## Examples

### Basic Validation
```bash
/solution-validate ./solutions/templates/lead-management
```

### Validate Against Environment
```bash
/solution-validate ./solutions/templates/lead-management --env production
```

### Strict Mode
```bash
/solution-validate ./solutions/templates/lead-management --strict
```

### JSON Output
```bash
/solution-validate ./solutions/templates/lead-management --format json
```

## Validation Checks

### Schema Validation
- Manifest follows solution-schema.json
- Required fields present (name, version, description, components)
- Name format (lowercase-hyphenated)
- Version format (semantic versioning)

### Parameter Validation
- All parameters have type and description
- Required parameters have no default (or vice versa)
- Parameter types are valid
- No sensitive data in defaults

### Component Validation
- All components have id, type, template
- Component IDs are unique
- Template files exist
- Template syntax is valid
- Component types use `platform:metadataType` format

### Dependency Validation
- No circular dependencies
- All dependency references exist
- Dependency graph is valid DAG

### Template Validation
- Handlebars syntax is valid
- All variables have definitions
- Field references resolve
- No hardcoded IDs detected

## Output

### Text Format (default)
```
Validating solution: lead-management

Schema Validation
  ✓ Manifest structure valid
  ✓ Name format valid
  ✓ Version format valid (1.0.0)

Parameter Validation
  ✓ 5 parameters defined
  ✓ All parameters have type and description
  ⚠ Parameter 'threshold' has no description

Component Validation
  ✓ 3 components defined
  ✓ All template files exist
  ✓ Template syntax valid

Dependency Validation
  ✓ No circular dependencies
  ✓ 2 dependency relationships

Summary
  Errors: 0
  Warnings: 1
  Status: VALID (with warnings)
```

### JSON Format
```json
{
  "solution": "lead-management",
  "version": "1.0.0",
  "valid": true,
  "errors": [],
  "warnings": [
    {
      "type": "missing_description",
      "parameter": "threshold",
      "message": "Parameter 'threshold' has no description"
    }
  ],
  "metadata": {
    "componentCount": 3,
    "parameterCount": 5,
    "platforms": ["salesforce"],
    "complexity": 0.35
  }
}
```

## Exit Codes

- `0` - Validation passed
- `1` - Validation failed (errors)
- `2` - Validation passed with warnings (in strict mode)

## Related Commands

- `/solution-deploy` - Deploy validated solution
- `/solution-list` - List available solutions
- `/solution-package` - Package solution for distribution
