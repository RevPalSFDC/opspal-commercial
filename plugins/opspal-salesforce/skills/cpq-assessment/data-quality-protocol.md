# Data Quality Protocol

## Mandatory Rules

> "You're supposed to let me know if there is an issue acquiring data, not jumping to conclusions like that"
> — User feedback that drove this protocol

### Core Principles

1. **ALWAYS** run data-quality-checkpoint before conclusions
2. **ALWAYS** perform time-series analysis for adoption patterns
3. **ALWAYS** cross-validate findings with user observations
4. **NEVER** conclude from NULL/missing data without user confirmation
5. **NEVER** assume historical data represents current state
6. **NEVER** skip recency analysis for "actively used" claims

---

## Pre-Conclusion Checkpoint

Before ANY analytical conclusion in reports:

```bash
# Run validation
node scripts/lib/data-quality-checkpoint.js check result.json
```

### Decision Tree

```
Data received → Run checkpoint
                    ↓
            Confidence ≥ 70%?
                    ↓
    YES → Proceed with analysis
    NO  → Surface to user
           ↓
    Get validation → Retry or document limitation
```

**Only proceed when confidence ≥ 70%**

---

## Time-Series Validation

Before concluding system is "actively used":

```bash
node scripts/lib/time-series-pattern-detector.js detect time-series.json
```

### Required Checks
- Recent activity (6mo) > 0
- Latest record < 30 days old
- Pattern must be: `active`, `growing`, or `stable`
- Pattern must NOT be: `abandoned` or `declining`

### Pattern Definitions

| Pattern | Recent 6mo | Latest Record | Trend |
|---------|------------|---------------|-------|
| `active` | > 0 | < 30 days | Stable/Growing |
| `growing` | > 0 | < 30 days | Upward |
| `stable` | > 0 | < 30 days | Flat |
| `declining` | > 0 | < 60 days | Downward |
| `abandoned` | = 0 | > 90 days | N/A |

---

## User Cross-Validation

When finding contradicts user observation:

1. **STOP** analysis immediately
2. **Surface** discrepancy with both perspectives
3. **Request** user validation
4. **Document** resolution

### Example Communication

```markdown
**Data Discrepancy Detected**

Our analysis shows: CPQ utilization at 15%
Your observation: "We use CPQ for all quotes"

Possible reasons:
1. Data query scope may be limited
2. Recent adoption not captured in historical metrics
3. Custom quote object being used instead

**Please clarify**: Are you seeing discrepancies in these numbers?
```

---

## Confidence Calculation

```javascript
function calculateConfidence(context, dataQuality) {
  let confidence = 70; // Base confidence

  // Factor 1: Historical assessment count
  if (context.totalOperations > 8) {
    confidence += 15; // Strong history
  } else if (context.totalOperations > 4) {
    confidence += 8;  // Moderate history
  }

  // Factor 2: Proven strategies available
  if (Object.keys(context.provenStrategies || {}).length > 2) {
    confidence += 10;
  }

  // Factor 3: Data completeness
  if (dataQuality.quoteDataComplete && dataQuality.productDataComplete) {
    confidence += 10;
  } else {
    confidence -= 15; // Incomplete data
  }

  // Factor 4: CPQ-specific patterns
  const cpqPatterns = Object.keys(context.objectPatterns || {})
    .filter(k => k.includes('SBQQ')).length;
  if (cpqPatterns > 2) {
    confidence += 5;
  }

  return Math.min(100, Math.max(0, confidence));
}
```

### Confidence Levels

| Level | Score | Meaning |
|-------|-------|---------|
| HIGH | 85%+ | Strong history, complete data |
| MEDIUM | 70-84% | Moderate history, minor gaps |
| LOW | < 70% | Limited history, significant gaps |

---

## Data Quality Checkpoint Tool

### Usage

```bash
node scripts/lib/data-quality-checkpoint.js check result.json
```

### Features
- Blocks conclusions on NULL/unexpected data
- Enforces confidence thresholds
- Generates user prompts for issues
- Validates expected data structure

### Configuration

```javascript
{
  confidenceThreshold: 70,    // Minimum to proceed
  nullHandling: 'block',      // 'block' | 'warn' | 'allow'
  requiredFields: ['totalRecords', 'recentRecords', 'latestDate'],
  maxDataAge: 30              // Days - warn if older
}
```

---

## Common Data Issues

### Issue 1: NULL Results

**Problem**: Query returns null or empty
**Action**: Surface to user, do not assume zero

```markdown
**Data Issue**: Query for active quotes returned NULL

This could mean:
- No quotes exist (unlikely)
- Query error occurred
- Permission issue
- Object not accessible

**Recommended action**: Verify with user before proceeding
```

### Issue 2: Stale Data

**Problem**: Latest record > 30 days old
**Action**: Clarify recency with user

```markdown
**Recency Warning**: Latest CPQ quote is 45 days old

Questions:
- Is this expected? (seasonal business?)
- Should we extend the analysis window?
- Is there a data sync issue?
```

### Issue 3: Conflicting Metrics

**Problem**: Different sources show different numbers
**Action**: Document both, seek clarification

```markdown
**Data Conflict Detected**

Source A (Direct Query): 150 active quotes
Source B (Dashboard): 175 active quotes

Possible causes:
- Different date ranges
- Filter differences
- Caching issues
- Permission-based visibility

**Please confirm**: Which number aligns with your expectations?
```

---

## Validation Scripts

### SOQL Pattern Validator

```bash
node scripts/lib/soql-pattern-validator.js validate "<soql>"
```

- Validates SOQL syntax before execution
- Prevents aggregate alias errors
- Provides recommended jq paths

### Time-Series Pattern Detector

```bash
node scripts/lib/time-series-pattern-detector.js detect data.json
```

- Detects active vs abandoned systems
- Identifies migration events
- Calculates adoption trends

### Dual-System Analyzer

```bash
node scripts/lib/dual-system-analyzer.js compare system-a.json system-b.json
```

- Compares two systems for migration detection
- Distinguishes parallel vs completed migration
- Generates relationship-based recommendations
