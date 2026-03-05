# Runbook Framework Development Guide

This guide documents how to extend and maintain the Cross-Platform Runbook Framework.

## Architecture Overview

```
runbook-framework/
├── index.js                    # Main entry point, factory function
├── core/                       # Platform-agnostic components
│   ├── versioner.js           # Semantic versioning (MAJOR.MINOR.PATCH)
│   ├── renderer.js            # Template engine with Handlebars-like syntax
│   ├── differ.js              # Section-aware runbook comparison
│   └── feature-detector.js    # Platform-specific feature detection
├── adapters/                   # Platform-specific implementations
│   ├── base-adapter.js        # Abstract base class (interface)
│   ├── salesforce-adapter.js  # Salesforce implementation
│   └── hubspot-adapter.js     # HubSpot implementation
├── templates/                  # Markdown templates with partials
│   ├── shared/                # Cross-platform partials
│   ├── salesforce/            # SF-specific partials
│   └── hubspot/               # HS-specific partials
└── plugin-runbook-generator.js # NEW: Plugin documentation generator
```

## Quick Reference

### Creating a Runbook System

```javascript
const { createRunbookSystem } = require('./runbook-framework');

// Salesforce
const sf = createRunbookSystem('salesforce', { identifier: 'myOrg' });
const result = await sf.generate();

// HubSpot
const hs = createRunbookSystem('hubspot', { identifier: '12345678' });
const result = await hs.generate();
```

### Available Methods

| Method | Description |
|--------|-------------|
| `generate(options)` | Generate complete runbook with versioning |
| `view()` | Read current runbook content |
| `diff(from, to)` | Compare runbook versions |
| `listVersions()` | List all version history |

---

## Template Syntax

The renderer uses a Handlebars-like syntax:

### Variables
```markdown
{{variable}}
{{object.property}}
```

### Conditionals
```markdown
{{#if hasLeadLifecycle}}
## Lead Lifecycle
{{this content shows if hasLeadLifecycle is truthy}}
{{else}}
No lead lifecycle configured.
{{/if}}
```

### Loops
```markdown
{{#each objects}}
### {{this.name}}
- API Name: {{this.api_name}}
- Index: {{@index}}
{{/each}}
```

### Partials (Template Includes)
```markdown
{{> header}}
{{> data-model}}
{{> footer}}
```

### Truthy Values
- `false`, `null`, `undefined` → falsy
- Empty arrays `[]` → falsy
- Empty objects `{}` → falsy
- Empty strings `""` → falsy
- Everything else → truthy

---

## Adding New Templates

### 1. Create a Partial Template

Location: `templates/<platform>/<section-name>.md`

Example: `templates/salesforce/custom-section.md`
```markdown
## Custom Section

{{#if featureDetails.customSection}}
**Total Items:** {{featureDetails.customSection.totalItems}}

### Items

{{#each featureDetails.customSection.items}}
- {{this.name}}: {{this.description}}
{{/each}}
{{else}}
Custom section data not available.
{{/if}}
```

### 2. Update the Base Template

Edit `templates/<platform>/runbook-base.md`:
```markdown
{{#if hasCustomSection}}
{{> custom-section}}

---

{{/if}}
```

### 3. Add Feature Detection

Edit `core/feature-detector.js`, add to `detectFeatures()`:
```javascript
async detectCustomSection() {
  const result = this.executeSoqlQuery('SELECT COUNT() FROM CustomObject__c');
  const count = this.getRecordCount(result);

  return {
    hasCustomSection: count > 0,
    totalItems: count,
    items: [] // Populate as needed
  };
}
```

### 4. Update Adapter

Edit `adapters/salesforce-adapter.js`, add to `getPlatformSections()`:
```javascript
customSection: {
  title: 'Custom Section',
  description: 'Description of what this section covers',
  condition: 'hasCustomSection',
  subsections: ['items', 'details']
}
```

---

## Adding a New Platform Adapter

### 1. Create the Adapter

Create `adapters/<platform>-adapter.js`:

```javascript
const BaseAdapter = require('./base-adapter');
const { <Platform>FeatureDetector } = require('../core/feature-detector');

class <Platform>Adapter extends BaseAdapter {
  constructor(options = {}) {
    super('<platform>', options);
  }

  getPlatformDisplayName() {
    return '<Platform Name>';
  }

  getPlatformSections() {
    return {
      // Define conditional sections
    };
  }

  getTemplatePaths() {
    // Return template locations
  }

  async detectFeatures() {
    const detector = new <Platform>FeatureDetector(this);
    return detector.detectFeatures();
  }

  loadObservations() {
    // Load from instances/<platform>/<id>/observations/
  }

  async synthesizePlatformSpecifics(observations, reflections) {
    // Platform-specific synthesis logic
  }

  validatePlatformData(data) {
    // Validation logic
  }
}

module.exports = <Platform>Adapter;
```

### 2. Add Feature Detector

Edit `core/feature-detector.js`:

```javascript
class <Platform>FeatureDetector extends FeatureDetector {
  async detectFeatures() {
    return {
      hasFeatureA: false,
      hasFeatureB: false,
      featureDetails: {}
    };
  }
}
```

### 3. Register in Factory

Edit `index.js`:

```javascript
const ADAPTERS = {
  salesforce: () => require('./adapters/salesforce-adapter'),
  hubspot: () => require('./adapters/hubspot-adapter'),
  <platform>: () => require('./adapters/<platform>-adapter')
};
```

### 4. Create Templates

Create directory: `templates/<platform>/`

Required files:
- `runbook-base.md` - Main template
- Platform-specific partials

---

## Feature Detection Patterns

### Salesforce SOQL Pattern
```javascript
executeSoqlQuery(soql, options = {}) {
  try {
    const identifier = this.adapter.getInstanceIdentifier();
    let command = `sf data query --query "${soql}" --target-org ${identifier} --json`;

    if (options.toolingApi) {
      command += ' --use-tooling-api';
    }

    const result = execSync(command, { encoding: 'utf8', timeout: 60000 });
    return JSON.parse(result);
  } catch (err) {
    console.warn(`SOQL query failed: ${err.message}`);
    return null;
  }
}
```

### HubSpot API Pattern (MCP)
```javascript
// HubSpot detection requires MCP integration
// Placeholder until MCP tools are connected
executeHubSpotApi(endpoint, options = {}) {
  // Will use mcp__hubspot__* tools when available
  console.warn('HubSpot API detection requires MCP integration');
  return null;
}
```

---

## Versioning System

### Automatic Version Bumps

| Change Type | Bump | Trigger |
|-------------|------|---------|
| MAJOR | x.0.0 | 10+ objects changed, major structural reorg |
| MINOR | 0.x.0 | New sections, objects, workflows added |
| PATCH | 0.0.x | Content updates, same structure |

### Manual Version Control
```javascript
versioner.createSnapshot({
  version: '2.0.0',        // Explicit version
  bumpType: 'major',       // Force bump type
  notes: 'Major update',   // Version notes
  force: true              // Create even if no changes
});
```

---

## Best Practices

### Template Design
1. Always use conditional sections (`{{#if feature}}`)
2. Provide fallback content for missing data
3. Keep partials focused on single concerns
4. Use shared partials for cross-platform content

### Feature Detection
1. Handle query failures gracefully (return null/empty)
2. Use timeouts to prevent hanging
3. Cache results when possible
4. Log warnings, don't throw errors

### Adapter Implementation
1. Inherit from BaseAdapter
2. Implement all abstract methods
3. Use path-conventions.js patterns
4. Validate data before rendering

### Testing New Templates
```bash
# Test template rendering
node -e "
const { createRunbookSystem } = require('./runbook-framework');
const sf = createRunbookSystem('salesforce', { identifier: 'test' });
sf.generate().then(r => console.log(r)).catch(e => console.error(e));
"
```

---

## Common Issues

### Template Partial Not Found
```
Partial not found: custom-section
```
**Fix**: Ensure the partial file exists at `templates/<platform>/custom-section.md`

### Feature Detection Timeout
```
SOQL query failed: Command timed out
```
**Fix**: Increase timeout in `executeSoqlQuery()` or simplify query

### Undefined Variable in Template
```
{{featureDetails.nonExistent.property}}
```
**Fix**: Add conditional check: `{{#if featureDetails.nonExistent}}...{{/if}}`

---

## File Locations Reference

| Purpose | Location |
|---------|----------|
| Main entry | `index.js` |
| Versioning | `core/versioner.js` |
| Template engine | `core/renderer.js` |
| Diffing | `core/differ.js` |
| Feature detection | `core/feature-detector.js` |
| Base adapter | `adapters/base-adapter.js` |
| SF adapter | `adapters/salesforce-adapter.js` |
| HS adapter | `adapters/hubspot-adapter.js` |
| Shared templates | `templates/shared/*.md` |
| SF templates | `templates/salesforce/*.md` |
| HS templates | `templates/hubspot/*.md` |
| Plugin generator | `plugin-runbook-generator.js` |

---

## Related Documentation

- **Plugin CLAUDE.md**: Cross-platform plugin usage guide
- **Salesforce Plugin**: Existing runbook implementation patterns
- **Path Conventions**: `salesforce-plugin/scripts/lib/path-conventions.js`

---

*Last Updated: 2025-12-01*
*Framework Version: 1.0.0*
