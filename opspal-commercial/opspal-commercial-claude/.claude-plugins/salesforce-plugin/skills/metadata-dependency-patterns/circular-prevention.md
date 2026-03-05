# Circular Dependency Prevention

## What Are Circular Dependencies?

A circular dependency occurs when:
- Component A depends on Component B
- Component B depends on Component C
- Component C depends on Component A

This creates deployment failures because no component can be deployed first.

## Common Circular Patterns

### 1. Field-to-Field Formulas
```
❌ CIRCULAR:
Account.Total__c = SUM(Opportunity.Amount)
Opportunity.Account_Total__c = Account.Total__c
Account.Opportunity_Count__c = COUNT(Opportunity WHERE Account_Total__c > 0)
```

### 2. Flow-to-Flow References
```
❌ CIRCULAR:
Flow A calls Flow B (via Subflow)
Flow B calls Flow C (via Subflow)
Flow C calls Flow A (via Subflow)
```

### 3. Validation-to-Formula
```
❌ CIRCULAR:
Validation Rule checks Formula Field
Formula Field references field updated by Flow
Flow triggers based on Validation Rule outcome
```

## Detection Strategy

### Dependency Graph Analysis
```javascript
function detectCircular(dependencies, visited = new Set(), path = []) {
    for (const dep of dependencies) {
        if (path.includes(dep.name)) {
            return {
                isCircular: true,
                cycle: [...path.slice(path.indexOf(dep.name)), dep.name]
            };
        }

        if (!visited.has(dep.name)) {
            visited.add(dep.name);
            path.push(dep.name);

            const childResult = detectCircular(dep.children, visited, path);
            if (childResult.isCircular) return childResult;

            path.pop();
        }
    }

    return { isCircular: false };
}
```

### Pre-Deployment Check
```bash
# Analyze deployment package for circular refs
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/deployment-source-validator.js \
  --check-circular \
  ./force-app/main/default
```

## Resolution Patterns

### Pattern 1: Break with Async
```
Convert synchronous dependency to async:
- Use Platform Events instead of direct reference
- Use Scheduled Flow instead of immediate trigger
- Use Future method to break chain
```

### Pattern 2: Introduce Intermediate
```
Add intermediate object/field:
A → B → C → A  (circular)
A → X → B → C  (X stores A's value, breaks cycle)
```

### Pattern 3: Batch Calculation
```
Instead of real-time formula:
- Use scheduled batch job to calculate
- Store result in non-formula field
- Breaks formula dependency chain
```

### Pattern 4: Deployment Sequencing
```
Deploy in phases:
Phase 1: Deploy A without B reference
Phase 2: Deploy B (now A exists)
Phase 3: Update A to add B reference
```

## Best Practices

### 1. Design First
- Map dependencies before building
- Use ERD diagrams
- Identify potential cycles early

### 2. Unidirectional Flows
- Data should flow one direction
- Avoid bidirectional references
- Use rollup summaries instead of formulas

### 3. Regular Audits
```bash
# Weekly circular dependency check
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/metadata-dependency-analyzer.js \
  --org <org> \
  --check-all-circular \
  --report weekly-circular-check.json
```

### 4. Documentation
- Document intentional dependencies
- Flag acceptable cycles with justification
- Track resolution for future reference
