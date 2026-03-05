---
name: intake-generate-form
description: Generate an HTML intake form for project specifications
argument-hint: "[--output <path>] [--project-type <type>]"
stage: ready
---

# Intake Form Generator Command

Generates a self-contained HTML intake form that users can open in their browser to fill out project specifications.

## Usage

```
/intake-generate-form [--output <path>] [--project-type <type>]
```

## Options

- `--output <path>` - Output file path (default: ./intake-form.html)
- `--project-type <type>` - Pre-select project type in form (optional)

## Project Types

Available project types for `--project-type`:

| Value | Label |
|-------|-------|
| `salesforce-implementation` | Salesforce Implementation |
| `hubspot-implementation` | HubSpot Implementation |
| `cross-platform-integration` | Cross-Platform Integration |
| `data-migration` | Data Migration |
| `automation-build` | Automation Build |
| `reporting-analytics` | Reporting & Analytics |
| `cpq-configuration` | CPQ Configuration |
| `custom-development` | Custom Development |
| `process-optimization` | Process Optimization |
| `security-audit` | Security Audit |

## Example

```bash
# Generate default form
/intake-generate-form

# Specify output location
/intake-generate-form --output ./project-setup/intake-form.html

# Pre-select project type
/intake-generate-form --project-type salesforce-implementation
```

## Generated Form Features

The generated HTML form is **completely self-contained** with embedded CSS and JavaScript:

### Visual Features
- Collapsible sections with completion indicators
- Progress bar showing overall completion %
- Required field markers
- Inline validation messages
- Responsive design (works on mobile)
- Professional styling

### Functional Features
- **Save Draft** - Saves to browser localStorage
- **Load Draft** - Restores previously saved data
- **Clear All** - Resets form to empty state
- **Export JSON** - Downloads form data as JSON file
- **Real-time validation** - Shows errors as you type
- **Conditional fields** - Shows/hides based on answers

### Form Sections

1. **Project Identity** (Required)
   - Project name
   - Project type (dropdown)
   - Priority level
   - Owner information
   - Additional stakeholders

2. **Goals & Objectives** (Required)
   - Business objective (text area)
   - Success metrics (dynamic list)
   - Expected user impact

3. **Project Scope** (Required)
   - In-scope items (dynamic list)
   - Out-of-scope items (dynamic list)
   - Assumptions (with validation checkbox)
   - Constraints

4. **Data Sources**
   - Primary sources (type, direction, volume)
   - Integrations
   - Existing automations

5. **Timeline & Budget** (Required)
   - Target start date
   - Target end date
   - Milestones (dynamic list)
   - Hard deadline checkbox + reason
   - Budget range
   - Budget flexibility

6. **Dependencies & Risks**
   - Dependencies (type, status, blocking flag)
   - Risks (impact, probability, mitigation)

7. **Technical Requirements**
   - Platform selection
   - Salesforce org details (conditional)
   - HubSpot portal details (conditional)
   - Complexity assessment

8. **Approval & Sign-off**
   - Required approvers
   - Communication plan
   - Additional notes

## Conditional Logic

The form shows/hides fields based on answers:

| Condition | Shows Field |
|-----------|-------------|
| Hard deadline = Yes | Deadline reason |
| Platform includes Salesforce | Salesforce org details |
| Platform includes HubSpot | HubSpot portal details |
| Project type = CPQ/SF Implementation | CPQ installed checkbox |

## How Users Complete the Form

1. **Open in browser** - Double-click the HTML file or drag to browser
2. **Fill sections** - Complete each collapsible section
3. **Save draft** - Click "Save Draft" to store progress
4. **Export JSON** - Click "Export JSON" when complete

The exported JSON file is used with `/intake --form-data`:

```bash
/intake --form-data ./intake-data.json
```

## Generated File

Example path: `./intake-form.html`

The file is approximately 50-100KB and includes:
- Embedded CSS (no external stylesheets)
- Embedded JavaScript (no external scripts)
- JSON schema for validation
- All form logic

## Implementation

This command uses:
- `scripts/lib/intake/intake-form-generator.js` - Main generator
- `scripts/lib/intake/intake-schema.js` - Schema definitions
- `templates/intake/intake-schema.json` - Client schema reference

### Direct Script Usage

```bash
# Via Node.js
node scripts/lib/intake/intake-form-generator.js --output ./intake-form.html
```

### Programmatic Usage

```javascript
const { IntakeFormGenerator } = require('./scripts/lib/intake/intake-form-generator');

const generator = new IntakeFormGenerator({
  title: 'Custom Project Intake'
});

const html = generator.generate();
fs.writeFileSync('./intake-form.html', html);
```

## Workflow Integration

Typical workflow:

```
1. /intake-generate-form --output ./intake-form.html
   → Creates intake-form.html

2. User opens HTML in browser, fills out, clicks "Export JSON"
   → Creates intake-data.json

3. /intake --form-data ./intake-data.json
   → Validates, gathers context, generates runbook, creates Asana project
```

## Related Commands

- `/intake` - Full intake workflow (includes form generation)
- `/asana-link` - Link project to Asana

## See Also

- Agent: `intelligent-intake-orchestrator`
- Schema: `templates/intake/intake-schema.json`
- Validator: `scripts/lib/intake/intake-validator.js`
