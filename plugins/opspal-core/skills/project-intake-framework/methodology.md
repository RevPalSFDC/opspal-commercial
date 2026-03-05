# Project Intake Methodology

Complete guide to the 6-phase project intake workflow.

## Phase 1: Form Generation

Generate an HTML intake form for browser-based completion.

### Usage
```bash
/intake-generate-form --output ./intake-form.html
/intake-generate-form --project-type salesforce --output ./sf-intake.html
```

### Form Features
- Self-contained HTML (no external dependencies)
- Client-side validation
- Save/load draft capability
- Export to JSON button

### Customization Options
| Option | Description |
|--------|-------------|
| `--project-type` | Pre-fill type dropdown (salesforce, hubspot, both, custom) |
| `--output` | Output file path (default: ./intake-form.html) |
| `--include-optional` | Show all optional sections expanded |

---

## Phase 2: Data Collection

Receive JSON export from completed intake form.

### Expected Format
```json
{
  "projectIdentity": {
    "projectName": "CPQ Implementation",
    "projectType": "salesforce",
    "projectOwner": {
      "name": "Jane Smith",
      "email": "jane@company.com"
    },
    "priority": "high"
  },
  "goalsObjectives": {
    "businessObjective": "Implement CPQ to standardize pricing...",
    "successMetrics": [
      { "metric": "Quote generation time", "target": "< 5 minutes", "baseline": "45 minutes" }
    ]
  },
  // ... additional sections
}
```

### Common Issues
- JSON syntax errors from manual editing
- Encoding issues from non-ASCII characters
- File path issues on Windows vs Mac/Linux

---

## Phase 3: Validation

Run comprehensive validation pipeline.

### Validation Pipeline Order
1. Schema compliance (structure, types)
2. Required fields check
3. Consistency checks (dates, budget vs scope)
4. Circular dependency detection
5. Completeness analysis
6. Assumption validation markers
7. Contradiction detection

### Circular Dependency Algorithm

```javascript
// DFS-based cycle detection
function detectCircularDependencies(dependencies) {
  const visited = new Set();
  const inStack = new Set();

  for (const node of Object.keys(dependencies)) {
    if (hasCycle(node, dependencies, visited, inStack)) {
      return true; // Circular dependency found
    }
  }
  return false;
}
```

### Validation Result Structure
```json
{
  "valid": false,
  "errors": [
    { "type": "required", "field": "scope.inScope", "message": "..." }
  ],
  "warnings": [
    { "type": "completeness", "field": "risks", "severity": "medium" }
  ],
  "completenessScore": 75,
  "readyForHandoff": false,
  "summary": {
    "errorCount": 1,
    "warningCount": 3,
    "sectionsComplete": 6,
    "criticalGaps": ["inScope items"]
  }
}
```

---

## Phase 4: Context Gathering

Automatically gather context from connected systems.

### Context Sources

| Source | Data Gathered |
|--------|--------------|
| **Salesforce** | Org metadata, object counts, CPQ detection, custom objects |
| **Asana** | Similar projects, historical tasks, template structures |
| **Runbooks** | Related runbooks by project type, lessons learned |

### Context Gathering Code
```javascript
const { IntakeDataGatherer } = require('./scripts/lib/intake/intake-data-gatherer');
const gatherer = new IntakeDataGatherer();

const context = await gatherer.gatherContext(intakeData, {
  salesforceOrgAlias: 'production',
  asanaProjectId: '12345',
  runbookSearchDepth: 3
});
```

### Output Structure
```json
{
  "salesforce": {
    "orgInfo": { "alias": "production", "edition": "Enterprise" },
    "objectCounts": { "Account": 50000, "Opportunity": 25000 },
    "cpqDetected": true
  },
  "asana": {
    "similarProjects": ["CPQ Phase 1", "CPQ Optimization"],
    "taskPatterns": ["Planning", "Requirements", "Implementation", "Testing"]
  },
  "runbooks": {
    "related": ["cpq-implementation-runbook.md", "pricing-setup-guide.md"]
  }
}
```

---

## Phase 5: Runbook Generation

Generate PROJECT_RUNBOOK.md from validated data and context.

### Runbook Sections
1. **Overview** - Project identity, objectives, timeline
2. **Success Metrics** - Targets and baselines
3. **Scope** - In-scope, out-of-scope, assumptions
4. **Requirements** - Extracted requirements with IDs
5. **Dependencies** - Dependency map with blocking flags
6. **Risks** - Risk register with mitigations
7. **Technical Details** - Platform configurations
8. **Contacts** - Owner and stakeholders
9. **Communication Plan** - Cadence and channels

### Runbook Template Variables
| Variable | Source |
|----------|--------|
| `{{projectName}}` | projectIdentity.projectName |
| `{{objectives}}` | goalsObjectives.businessObjective |
| `{{startDate}}` | timelineBudget.targetStartDate |
| `{{requirements}}` | Extracted from scope.inScope |

---

## Phase 6: Asana Project Creation

Create structured Asana project with requirement tasks.

### Project Structure
```
Project: {projectName}
├── Section: Planning
│   ├── Review requirements
│   ├── Validate assumptions
│   └── Finalize scope
├── Section: Requirements
│   ├── [REQ-001] {requirement 1}
│   ├── [REQ-002] {requirement 2}
│   └── ...
├── Section: Implementation
│   └── (Tasks added during dev)
├── Section: Testing
│   └── (UAT tasks)
└── Section: Deployment
    └── (Deployment tasks)
```

### Task Format
```markdown
**[REQ-001]** Create custom object for subscription tracking

**Type:** Data
**Priority:** High
**Dependencies:** None

**Description:**
Create custom object for tracking customer subscriptions...

**Acceptance Criteria:**
- [ ] Object created with proper API name
- [ ] All required fields created
- [ ] Page layout configured
```

### API Considerations
- Asana rate limit: 150 requests/minute
- Use batching for large requirement lists
- Create sections before tasks
- Track task GIDs for dependency linking

---

## Handoff Checklist

Before marking intake complete:

- [ ] Validation passes (no errors)
- [ ] Completeness score >= 80%
- [ ] PROJECT_RUNBOOK.md generated and reviewed
- [ ] Asana project created with all requirement tasks
- [ ] Dependencies documented and linking verified
- [ ] Risks identified with mitigation strategies
- [ ] Success metrics are measurable and agreed upon
- [ ] Communication plan established
- [ ] All stakeholders notified
