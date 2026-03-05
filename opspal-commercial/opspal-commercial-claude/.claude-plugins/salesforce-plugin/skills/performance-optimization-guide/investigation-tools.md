# Investigation Tools

## MANDATORY Pre-Analysis Pattern

**NEVER analyze performance without field discovery and validation. This prevents 90% of analysis failures.**

### 1. Metadata Cache

```bash
# Initialize cache (once per org)
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/org-metadata-cache.js init <org>

# Discover indexed fields for optimization
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/org-metadata-cache.js query <org> <object> | jq '.fields[] | select(.indexed == true)'

# Find fields to optimize queries
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/org-metadata-cache.js find-field <org> <object> <pattern>

# Get complete field metadata
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/org-metadata-cache.js query <org> <object> | jq '.fields[] | {name, type, length, indexed}'
```

### 2. Query Validation

```bash
# Validate ALL performance test queries
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/smart-query-validator.js <org> "<soql>"
```

### 3. Field Analysis

```bash
# Discover field types and sizes
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/org-metadata-cache.js query <org> <object> | jq '.fields[] | {name, type, length, indexed}'
```

## Investigation Patterns

### Pattern 1: Query Optimization
```
Optimizing slow queries
  ↓
1. Use cache to discover indexed fields
2. Rebuild query using optimal fields
3. Validate: node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/smart-query-validator.js <org> "<soql>"
4. Benchmark performance
```

### Pattern 2: Index Analysis
```
Analyzing index usage
  ↓
1. Discover all indexed fields from cache
2. Compare with actual query patterns
3. Recommend index improvements
```

### Pattern 3: Field Performance
```
Analyzing field performance
  ↓
1. Use cache to get field metadata
2. Identify large text fields, formulas
3. Plan optimization strategy
```

## Runbook Context Loading

**EVERY performance optimization MUST load runbook context:**

```bash
# Extract performance optimization context
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/runbook-context-extractor.js \
    --org <org-alias> \
    --operation-type performance \
    --format summary
```

### Historical Performance Issues to Check

- **Slow Queries**: Missing indexes, full table scans
- **Governor Limit Hits**: CPU time, heap size, SOQL limits
- **Storage Issues**: Large text fields, poor archival
- **Integration Slowness**: API inefficiency, serial processing
- **Dashboard Performance**: Complex reports, missing filters

## Performance Baseline

```javascript
// Establish baseline before optimization
const baseline = {
    avgQueryTime: 3500, // ms
    slowQueryThreshold: 2000, // ms
    apiCallUsage: 65, // percent
    cpuTimeUsage: 45, // percent
    heapSizeUsage: 30 // percent
};

// Set optimization goals based on baseline
const goals = {
    queryTimeReduction: baseline.avgQueryTime > 1000 ? '50%' : '25%',
    apiCallReduction: baseline.apiCallUsage > 70 ? '30%' : '15%',
    cpuTimeReduction: baseline.cpuTimeUsage > 60 ? '40%' : '20%'
};
```

## Confidence Scoring

```javascript
function calculateOptimizationConfidence(strategy, target, context) {
    const historicalData = context.optimizationHistory?.find(
        h => h.strategy === strategy && h.targetType === target.type
    );

    if (!historicalData) {
        return { confidence: 'MEDIUM', recommendation: 'Test in sandbox first' };
    }

    const successRate = historicalData.successCount / historicalData.totalAttempts;

    if (successRate >= 0.9) return { confidence: 'HIGH', recommendation: 'Proceed' };
    if (successRate >= 0.7) return { confidence: 'MEDIUM', recommendation: 'Test thoroughly' };
    return { confidence: 'LOW', recommendation: 'Consider alternatives' };
}
```
