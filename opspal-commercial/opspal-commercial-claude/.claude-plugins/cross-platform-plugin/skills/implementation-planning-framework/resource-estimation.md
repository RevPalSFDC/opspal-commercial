# Effort Estimation

## Estimation Formulas

### Story Points to Hours
```javascript
const storyPointMapping = {
  1: { hours: 2, description: 'Trivial task, no unknowns' },
  2: { hours: 4, description: 'Simple task, minimal complexity' },
  3: { hours: 8, description: 'Standard task, well understood' },
  5: { hours: 16, description: 'Moderate complexity, some unknowns' },
  8: { hours: 32, description: 'Complex task, significant effort' },
  13: { hours: 56, description: 'Very complex, many unknowns' },
  21: { hours: 80, description: 'Epic-level, should be broken down' }
};

function estimateHours(storyPoints) {
  return storyPointMapping[storyPoints]?.hours || storyPoints * 4;
}
```

### Task Complexity Estimation
```javascript
function estimateTaskComplexity(task) {
  let basePoints = 3; // Default moderate

  // Adjust for factors
  const factors = {
    newTechnology: 1.5,
    integration: 1.3,
    customCode: 1.4,
    dataVolume: 1.2,
    multipleStakeholders: 1.2,
    complianceRequired: 1.3,
    parallelDevelopment: 1.1
  };

  for (const [factor, multiplier] of Object.entries(factors)) {
    if (task.factors?.includes(factor)) {
      basePoints *= multiplier;
    }
  }

  // Round to nearest Fibonacci
  return nearestFibonacci(basePoints);
}

function nearestFibonacci(n) {
  const fib = [1, 2, 3, 5, 8, 13, 21];
  return fib.reduce((prev, curr) =>
    Math.abs(curr - n) < Math.abs(prev - n) ? curr : prev
  );
}
```

## Task Type Estimates

### Salesforce Tasks
| Task Type | Base Hours | Complexity Factor |
|-----------|------------|-------------------|
| Custom Field | 0.5 | 1.0 |
| Custom Object | 2-4 | 1.2 |
| Validation Rule | 1-2 | 1.1 |
| Workflow/Flow (Simple) | 2-4 | 1.0 |
| Workflow/Flow (Complex) | 8-16 | 1.5 |
| Apex Class | 4-16 | 1.4 |
| Apex Trigger | 4-8 | 1.3 |
| LWC Component | 8-24 | 1.5 |
| Report | 1-2 | 1.0 |
| Dashboard | 2-4 | 1.1 |
| Permission Set | 2-4 | 1.2 |

### HubSpot Tasks
| Task Type | Base Hours | Complexity Factor |
|-----------|------------|-------------------|
| Custom Property | 0.25 | 1.0 |
| Workflow (Simple) | 1-2 | 1.0 |
| Workflow (Complex) | 4-8 | 1.3 |
| Form | 1-2 | 1.1 |
| Email Template | 1-2 | 1.0 |
| Sequence | 2-4 | 1.2 |
| Report | 1-2 | 1.0 |
| Dashboard | 2-4 | 1.1 |
| List (Static) | 0.5 | 1.0 |
| List (Active) | 1-2 | 1.2 |

### Integration Tasks
| Task Type | Base Hours | Complexity Factor |
|-----------|------------|-------------------|
| API Authentication | 2-4 | 1.3 |
| Field Mapping | 2-8 | 1.2 |
| Data Transformation | 4-16 | 1.4 |
| Error Handling | 4-8 | 1.3 |
| Testing & Validation | 4-8 | 1.2 |
| Monitoring Setup | 2-4 | 1.1 |

## Project Estimation Templates

### Small Project (<40 hours)
```yaml
Discovery: 4 hours
  - Requirements gathering: 2h
  - Technical review: 2h

Development: 24 hours
  - Configuration: 16h
  - Testing: 8h

Deployment: 8 hours
  - Deployment: 4h
  - Documentation: 4h

Buffer: 4 hours (10%)

Total: 40 hours
```

### Medium Project (40-160 hours)
```yaml
Discovery: 16 hours
  - Requirements gathering: 8h
  - Solution design: 8h

Development: 80 hours
  - Environment setup: 8h
  - Core development: 56h
  - Unit testing: 16h

Testing: 32 hours
  - Integration testing: 16h
  - UAT: 16h

Deployment: 16 hours
  - Deployment: 8h
  - Training: 4h
  - Documentation: 4h

Buffer: 16 hours (10%)

Total: 160 hours
```

### Large Project (160+ hours)
```yaml
Discovery: 40 hours
  - Requirements: 16h
  - Design: 16h
  - Planning: 8h

Development: 200 hours
  - Phase 1: 80h
  - Phase 2: 80h
  - Phase 3: 40h

Testing: 80 hours
  - Unit testing: 24h
  - Integration: 24h
  - UAT: 24h
  - Performance: 8h

Deployment: 40 hours
  - Staged deployment: 24h
  - Training: 8h
  - Documentation: 8h

Buffer: 40 hours (10%)
PM Overhead: 40 hours (10%)

Total: 440 hours
```

## Resource Planning

### Team Composition
```javascript
const teamComposition = {
  small: {
    totalHours: '<40',
    roles: {
      developer: 1,
      qa: 0.5,
      pm: 0.25
    }
  },
  medium: {
    totalHours: '40-160',
    roles: {
      developer: 1-2,
      qa: 0.5,
      pm: 0.5,
      architect: 0.25
    }
  },
  large: {
    totalHours: '>160',
    roles: {
      developer: 2-4,
      qa: 1,
      pm: 1,
      architect: 0.5,
      techLead: 1
    }
  }
};
```

### Capacity Planning
```javascript
function calculateDuration(totalHours, teamSize, efficiency = 0.75) {
  const effectiveHours = teamSize * 8 * efficiency; // Per day
  const days = Math.ceil(totalHours / effectiveHours);
  const weeks = Math.ceil(days / 5);

  return {
    days,
    weeks,
    effectiveHoursPerDay: effectiveHours
  };
}

// Example:
// 160 hours, 2 developers, 75% efficiency
// = 160 / (2 * 8 * 0.75) = 160 / 12 = 14 days = 3 weeks
```

### Buffer Guidelines
| Project Type | Uncertainty | Buffer |
|--------------|-------------|--------|
| Repeat project | Low | 10% |
| Similar to past | Medium | 15% |
| New technology | High | 25% |
| New domain | High | 25% |
| Complex integration | High | 30% |
| First-of-kind | Very High | 40% |
