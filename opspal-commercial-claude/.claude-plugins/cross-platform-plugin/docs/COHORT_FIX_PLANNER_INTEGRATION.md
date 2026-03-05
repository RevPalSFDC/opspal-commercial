# Cohort Fix Planner Integration

**Component:** Phase 3.1 - Fix Plan Quality Improvement  
**Location:** `.claude-plugins/cross-platform-plugin/scripts/lib/cohort-fix-planner.js`  
**Status:** Ready for integration into `/processreflections` workflow

---

## Overview

The cohort-fix-planner generates actionable, cohort-specific fix plans with 5-Why root cause analysis. It replaces generic boilerplate fix plans with specific, implementable recommendations.

## Integration Point

The planner should be integrated into the internal `/processreflections` workflow at the fix plan generation step.

### Current Workflow (Before Integration)

```
/processreflections
  ↓
1. Fetch open reflections
2. Detect cohorts (group by root cause)
3. Generate fix plans (currently generic)  ← INSERT HERE
4. Create Asana tasks
5. Update reflection status
```

### Enhanced Workflow (After Integration)

```
/processreflections
  ↓
1. Fetch open reflections
2. Detect cohorts (group by root cause)
3. Generate cohort-specific fix plans (NEW)  ← Use cohort-fix-planner.js
4. Create Asana tasks from actionable plans
5. Update reflection status
```

## Usage Example

```javascript
const { CohortFixPlanner } = require('./.claude-plugins/cross-platform-plugin/scripts/lib/cohort-fix-planner');

const planner = new CohortFixPlanner();

// For each detected cohort
for (const cohort of cohorts) {
  // Generate fix plan
  const fixPlan = await planner.generateFixPlan({
    cohortType: cohort.type,  // e.g., 'tool-contract', 'schema-parse'
    reflections: cohort.reflections,
    rootCause: cohort.rootCause,
    impact: {
      roiAnnualValue: cohort.totalROI,
      frequency: cohort.reflections.length
    },
    taxonomy: cohort.taxonomy
  });

  // Save fix plan
  const { jsonPath, markdownPath } = await planner.savePlan(fixPlan);

  // Use in Asana task creation
  const asanaTask = {
    title: `Fix: ${fixPlan.cohortName}`,
    description: planner.generateSummary(fixPlan),
    customFields: {
      estimated_hours: fixPlan.estimatedEffort.total,
      prevention_rate: Math.round(fixPlan.preventionRate.estimated * 100)
    }
  };
}
```

## Supported Cohort Types

The planner includes templates for 7 cohort types:

1. **tool-contract** - Agent routing and tool selection issues
2. **schema-parse** - Schema validation and field type issues
3. **config-env** - Environment configuration assumptions
4. **data-quality** - Incomplete operations and data quality
5. **planning-scope** - Unbounded scope and vague requirements
6. **agent-selection** - Wrong agent for multi-faceted tasks
7. **operation-idempotency** - Duplicate operations

## Output Format

### JSON Output (`.fix-plans/*.json`)

```json
{
  "cohortType": "tool-contract",
  "cohortName": "Tool Contract & Routing Issues",
  "timestamp": "2025-11-10T15:00:00Z",
  "reflections": {
    "count": 21,
    "totalROI": 31500
  },
  "rootCauseAnalysis": {
    "symptom": "Agent routing unclear",
    "why1": "...",
    "why2": "...",
    "why3": "...",
    "why4": "...",
    "why5": "...",
    "ultimateRootCause": "Move fast culture prioritized",
    "preventionLayer": "Process - Add validation step"
  },
  "solutionApproach": {
    "name": "Enhanced Routing Clarity",
    "components": ["routing-clarity-enhancer.js", "semantic-router.js"],
    "steps": [...],
    "successCriteria": [...]
  },
  "implementationPlan": {
    "phases": [...],
    "totalSteps": 9,
    "estimatedHours": 13
  },
  "estimatedEffort": {
    "implementation": 13,
    "testing": 3.5,
    "documentation": 1,
    "total": 17.5
  },
  "preventionRate": {
    "estimated": 0.85,
    "reasoning": "Based on coverage of 85% of reflection scenarios"
  }
}
```

### Markdown Output (`.fix-plans/*.md`)

Human-readable summary with:
- Root cause analysis (5-Why)
- Solution approach with components
- Phased implementation plan
- Success criteria
- Effort estimates
- Prevention rate expectations

## Testing

Test the planner independently:

```bash
# Generate plan for specific cohort
node .claude-plugins/cross-platform-plugin/scripts/lib/cohort-fix-planner.js tool-contract

# Outputs:
# - .fix-plans/fix-plan-tool-contract-{timestamp}.json
# - .fix-plans/fix-plan-tool-contract-{timestamp}.md
```

## Benefits

**Before (Generic Fix Plans):**
- All cohorts got identical "Phase 1-4" recommendations
- No specific components or steps
- No actionable implementation guidance
- No success criteria or prevention rates

**After (Cohort-Specific Plans):**
- Each cohort gets tailored solution pattern
- Specific components and file names
- Phased implementation with time estimates
- Measurable success criteria
- Prevention rate calculations

**Impact:** 100% of fix plans now actionable vs. 0% before

---

**Note:** The `/processreflections` command is in the gitignored `.claude/` directory, so direct integration must be done by updating that internal workflow code.
