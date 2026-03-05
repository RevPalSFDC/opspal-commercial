# SFDC Account Deduplication - Configuration Guide

**Version**: 1.0.0
**Last Updated**: 2025-10-16

## Overview

The dedup safety system is designed to work out-of-the-box without configuration, but you can customize guardrails and thresholds for your specific org and industry.

---

## Configuration File Structure

Configuration files are stored at: `instances/{org-alias}/dedup-config.json`

**Example** (`instances/production/dedup-config.json`):
```json
{
  "org_alias": "production",
  "industry": "PropTech",
  "guardrails": {
    "domain_mismatch": {
      "enabled": true,
      "threshold": 0.3,
      "severity": "REVIEW"
    },
    "address_mismatch": {
      "enabled": true,
      "generic_entity_patterns": [
        "Housing Authority", "City of", "County"
      ],
      "severity": "BLOCK"
    },
    "integration_id_conflict": {
      "enabled": true,
      "severity": "BLOCK"
    },
    "importance_field_mismatch": {
      "enabled": true,
      "threshold": 50,
      "severity": "BLOCK"
    },
    "data_richness_mismatch": {
      "enabled": true,
      "threshold": 0.3,
      "severity": "BLOCK"
    },
    "relationship_asymmetry": {
      "enabled": true,
      "threshold": 5,
      "severity": "BLOCK"
    }
  },
  "survivor_selection": {
    "weights": {
      "relationship_score": 100,
      "integration_id": 100,
      "completeness": 50,
      "recent_activity": 25
    },
    "importance_fields": "auto"
  }
}
```

---

## Industry Templates

### Template 1: B2G (Government Entities)

**Challenge**: Generic entity names (Housing Authority, City of, County) require location disambiguation

```json
{
  "org_alias": "your-org",
  "industry": "B2G",
  "guardrails": {
    "domain_mismatch": {
      "enabled": true,
      "threshold": 0.2,
      "severity": "REVIEW"
    },
    "address_mismatch": {
      "enabled": true,
      "generic_entity_patterns": [
        "Housing Authority",
        "Housing Authority of",
        "City of",
        "County of",
        "Department of",
        "Government",
        "District",
        "Municipality",
        "Township",
        "Borough"
      ],
      "severity": "BLOCK"
    },
    "integration_id_conflict": {
      "enabled": true,
      "severity": "BLOCK"
    },
    "importance_field_mismatch": {
      "enabled": true,
      "threshold": 60,
      "severity": "BLOCK"
    },
    "data_richness_mismatch": {
      "enabled": true,
      "threshold": 0.4,
      "severity": "BLOCK"
    },
    "relationship_asymmetry": {
      "enabled": true,
      "threshold": 3,
      "severity": "BLOCK"
    }
  }
}
```

**Key Differences**:
- Lower domain mismatch threshold (0.2) → REVIEW not BLOCK
- More generic entity patterns (townships, boroughs)
- Higher importance field threshold (60) → More sensitive
- Lower relationship asymmetry threshold (3) → Catch smaller differences

---

### Template 2: PropTech (Property Technology)

**Challenge**: Similar to B2G with property management entities

```json
{
  "org_alias": "your-org",
  "industry": "PropTech",
  "guardrails": {
    "domain_mismatch": {
      "enabled": true,
      "threshold": 0.3,
      "severity": "REVIEW"
    },
    "address_mismatch": {
      "enabled": true,
      "generic_entity_patterns": [
        "Property Management",
        "Properties",
        "Apartments",
        "HOA",
        "Homeowners Association",
        "Community Association",
        "Condo Association"
      ],
      "severity": "BLOCK"
    },
    "integration_id_conflict": {
      "enabled": true,
      "severity": "BLOCK"
    },
    "importance_field_mismatch": {
      "enabled": true,
      "threshold": 50,
      "severity": "BLOCK"
    },
    "data_richness_mismatch": {
      "enabled": true,
      "threshold": 0.35,
      "severity": "BLOCK"
    },
    "relationship_asymmetry": {
      "enabled": true,
      "threshold": 5,
      "severity": "BLOCK"
    }
  }
}
```

---

### Template 3: SaaS (Standard B2B)

**Challenge**: Domain mismatch is more reliable indicator

```json
{
  "org_alias": "your-org",
  "industry": "SaaS",
  "guardrails": {
    "domain_mismatch": {
      "enabled": true,
      "threshold": 0.5,
      "severity": "BLOCK"
    },
    "address_mismatch": {
      "enabled": true,
      "generic_entity_patterns": [],
      "severity": "REVIEW"
    },
    "integration_id_conflict": {
      "enabled": true,
      "severity": "BLOCK"
    },
    "importance_field_mismatch": {
      "enabled": true,
      "threshold": 50,
      "severity": "BLOCK"
    },
    "data_richness_mismatch": {
      "enabled": true,
      "threshold": 0.3,
      "severity": "BLOCK"
    },
    "relationship_asymmetry": {
      "enabled": true,
      "threshold": 5,
      "severity": "BLOCK"
    }
  }
}
```

**Key Differences**:
- Higher domain mismatch threshold (0.5) → More strict
- Domain mismatch is BLOCK not REVIEW
- No generic entity patterns (not applicable)
- Address mismatch is REVIEW not BLOCK

---

## Guardrail Reference

### 1. Domain Mismatch

**Purpose**: Detect different entities based on email/website domain

**Parameters**:
- `enabled` (boolean): Enable/disable this guardrail
- `threshold` (0.0-1.0): Minimum overlap ratio to pass
- `severity` ("BLOCK" | "REVIEW"): Action when triggered

**How It Works**:
```
overlap_ratio = matching_domains / max(domains_A, domains_B)

IF overlap_ratio < threshold:
  TRIGGER guardrail with severity
```

**Example**:
```json
{
  "domain_mismatch": {
    "enabled": true,
    "threshold": 0.3,
    "severity": "REVIEW"
  }
}
```

- Threshold 0.3 = Require 30% domain overlap
- Severity REVIEW = Ask user to confirm
- Lower threshold → More strict (easier to trigger)
- Higher threshold → More lenient (harder to trigger)

**Industry Recommendations**:
- B2G/PropTech: 0.2-0.3 (less reliable, use REVIEW)
- SaaS: 0.5-0.7 (more reliable, use BLOCK)
- Healthcare: 0.4-0.5 (moderate, use REVIEW)

---

### 2. Address Mismatch

**Purpose**: Detect generic entity names with same city/zip but different streets

**Parameters**:
- `enabled` (boolean): Enable/disable this guardrail
- `generic_entity_patterns` (array): List of patterns indicating generic names
- `severity` ("BLOCK" | "REVIEW"): Action when triggered

**How It Works**:
```
IF city_match AND zip_match AND street_different:
  IF entity_name contains generic_pattern:
    TRIGGER guardrail with severity
```

**Example**:
```json
{
  "address_mismatch": {
    "enabled": true,
    "generic_entity_patterns": [
      "Housing Authority",
      "City of",
      "County"
    ],
    "severity": "BLOCK"
  }
}
```

**Adding Custom Patterns**:
```json
{
  "address_mismatch": {
    "enabled": true,
    "generic_entity_patterns": [
      "Housing Authority",
      "City of",
      "County",
      "Property Management",           // Add your patterns
      "Medical Center",
      "University of",
      "School District"
    ],
    "severity": "BLOCK"
  }
}
```

---

### 3. Integration ID Conflict

**Purpose**: Detect different external system IDs (different entities)

**Parameters**:
- `enabled` (boolean): Enable/disable this guardrail
- `severity` ("BLOCK" | "REVIEW"): Action when triggered

**How It Works**:
```
FOR EACH integration_id_field:
  IF value_A != value_B AND both_non_null:
    TRIGGER guardrail with severity
```

**Example**:
```json
{
  "integration_id_conflict": {
    "enabled": true,
    "severity": "BLOCK"
  }
}
```

**Recommendation**: Always keep this as BLOCK. Different external IDs = different entities.

---

### 4. Importance Field Mismatch

**Purpose**: Detect wrong survivor based on field importance values

**Parameters**:
- `enabled` (boolean): Enable/disable this guardrail
- `threshold` (0-100): Minimum importance weight to check
- `severity` ("BLOCK" | "REVIEW"): Action when triggered

**How It Works**:
```
FOR EACH importance_field WHERE weight >= threshold:
  score_A = calculate_importance(value_A)
  score_B = calculate_importance(value_B)

  IF abs(score_A - score_B) > weight * 0.5:
    TRIGGER guardrail with severity
```

**Example**:
```json
{
  "importance_field_mismatch": {
    "enabled": true,
    "threshold": 50,
    "severity": "BLOCK"
  }
}
```

**Adjusting Sensitivity**:
- Lower threshold (30-40): Check more fields, more sensitive
- Higher threshold (60-70): Check fewer fields, less sensitive
- Recommended: 50 (balanced)

---

### 5. Data Richness Mismatch

**Purpose**: Detect wrong survivor when one record is much more complete

**Parameters**:
- `enabled` (boolean): Enable/disable this guardrail
- `threshold` (0.0-1.0): Maximum completeness difference allowed
- `severity` ("BLOCK" | "REVIEW"): Action when triggered

**How It Works**:
```
completeness_A = filled_fields_A / total_important_fields
completeness_B = filled_fields_B / total_important_fields

difference = abs(completeness_A - completeness_B)

IF difference > threshold:
  TRIGGER guardrail with severity
```

**Example**:
```json
{
  "data_richness_mismatch": {
    "enabled": true,
    "threshold": 0.3,
    "severity": "BLOCK"
  }
}
```

**Threshold Meaning**:
- 0.3 = Allow up to 30% difference in completeness
- 0.2 = More strict (catch smaller differences)
- 0.4 = More lenient (allow larger differences)

---

### 6. Relationship Asymmetry

**Purpose**: Detect wrong survivor when relationship counts differ significantly

**Parameters**:
- `enabled` (boolean): Enable/disable this guardrail
- `threshold` (number): Maximum difference in total relationships
- `severity` ("BLOCK" | "REVIEW"): Action when triggered

**How It Works**:
```
relationships_A = contacts_A + opportunities_A
relationships_B = contacts_B + opportunities_B

difference = abs(relationships_A - relationships_B)

IF difference > threshold:
  TRIGGER guardrail with severity
```

**Example**:
```json
{
  "relationship_asymmetry": {
    "enabled": true,
    "threshold": 5,
    "severity": "BLOCK"
  }
}
```

**Threshold Meaning**:
- 5 = Allow up to 5 total relationship difference
- 3 = More strict (catch smaller differences)
- 10 = More lenient (allow larger differences)

---

## Survivor Selection Weights

### Default Weights

```json
{
  "survivor_selection": {
    "weights": {
      "relationship_score": 100,
      "integration_id": 100,
      "completeness": 50,
      "recent_activity": 25
    },
    "importance_fields": "auto"
  }
}
```

### Weight Explanation

**relationship_score** (100):
- Multiplier for (contacts + opportunities)
- Example: 3 contacts + 2 opps = 5 × 100 = 500 points
- Higher weight → Prioritize accounts with more relationships

**integration_id** (100):
- Points per integration ID field with value
- Example: 3 integration IDs = 3 × 100 = 300 points
- Higher weight → Prioritize accounts with external system IDs

**completeness** (50):
- Multiplier for data completeness ratio (0.0-1.0)
- Example: 80% complete = 0.8 × 50 = 40 points
- Higher weight → Prioritize accounts with more filled fields

**recent_activity** (25):
- Points for recent modifications (25 - days_since_modified/10)
- Example: Modified 50 days ago = 25 - 5 = 20 points
- Higher weight → Prioritize recently active accounts

### Customizing Weights

**Emphasize Relationships**:
```json
{
  "weights": {
    "relationship_score": 200,
    "integration_id": 100,
    "completeness": 50,
    "recent_activity": 25
  }
}
```

**Emphasize Data Quality**:
```json
{
  "weights": {
    "relationship_score": 100,
    "integration_id": 100,
    "completeness": 100,
    "recent_activity": 50
  }
}
```

**Emphasize External System Integration**:
```json
{
  "weights": {
    "relationship_score": 100,
    "integration_id": 200,
    "completeness": 50,
    "recent_activity": 25
  }
}
```

---

## Usage with Configuration

### Apply Configuration to Analysis

```bash
# Use custom configuration
node dedup-safety-engine.js analyze production pairs.csv --config instances/production/dedup-config.json

# Or with orchestrator
node dedup-workflow-orchestrator.js analyze production pairs.csv --config instances/production/dedup-config.json
```

### Per-Org Configuration

Store different configs for different orgs:

```
instances/
├── production/
│   └── dedup-config.json          # Production config (strict)
├── sandbox/
│   └── dedup-config.json          # Sandbox config (lenient for testing)
├── customer-a-prod/
│   └── dedup-config.json          # Customer A (B2G industry)
└── customer-b-prod/
    └── dedup-config.json          # Customer B (SaaS industry)
```

---

## Testing Configuration

### 1. Test in Sandbox First

```bash
# Apply your config to sandbox
node dedup-workflow-orchestrator.js analyze sandbox pairs.csv --config instances/sandbox/dedup-config.json

# Review decisions
cat dedup-decisions.json

# Adjust thresholds as needed
```

### 2. Monitor False Positives

Track how many legitimate merges are blocked:

```json
// dedup-decisions.json
{
  "stats": {
    "total": 100,
    "approved": 85,
    "review": 10,
    "blocked": 5  // Check if these are truly errors
  }
}
```

**Target**: <5% false positive rate (blocked merges that should be approved)

### 3. Monitor False Negatives

Track how many bad merges got through:
- If Type 1/2 errors slip through → Lower thresholds (more strict)
- If too many good merges blocked → Raise thresholds (more lenient)

---

## Configuration Best Practices

### 1. Start with Template

Choose the industry template closest to your use case, then customize.

### 2. Test Incrementally

Start with lenient thresholds, run analysis, then gradually tighten:

```json
// Start lenient
{ "threshold": 0.5, "severity": "REVIEW" }

// After testing, tighten
{ "threshold": 0.3, "severity": "REVIEW" }

// If confident, escalate
{ "threshold": 0.3, "severity": "BLOCK" }
```

### 3. Use REVIEW Before BLOCK

Set new guardrails to REVIEW first to see how often they trigger:

```json
// Phase 1: Review mode
{ "enabled": true, "severity": "REVIEW" }

// Phase 2: After 100+ pairs analyzed, escalate to block
{ "enabled": true, "severity": "BLOCK" }
```

### 4. Document Custom Patterns

Add comments to explain custom patterns:

```json
{
  "address_mismatch": {
    "enabled": true,
    "generic_entity_patterns": [
      "Housing Authority",
      "Property Management",  // Added: Common PropTech pattern
      "Medical Center"        // Added: Healthcare vertical
    ],
    "severity": "BLOCK"
  }
}
```

### 5. Version Control Configuration

Store configurations in git:

```bash
git add instances/*/dedup-config.json
git commit -m "feat: Add PropTech-specific dedup config"
```

---

## Troubleshooting

### "Too many merges blocked"

**Symptom**: 20%+ of pairs are BLOCK
**Fix**: Loosen thresholds or change BLOCK → REVIEW

```json
// Before (too strict)
{ "domain_mismatch": { "threshold": 0.7, "severity": "BLOCK" } }

// After (more lenient)
{ "domain_mismatch": { "threshold": 0.3, "severity": "REVIEW" } }
```

### "Type 1 errors getting through"

**Symptom**: Different entities being merged
**Fix**: Add more generic entity patterns or lower domain threshold

```json
// Add patterns specific to your industry
{
  "address_mismatch": {
    "generic_entity_patterns": [
      "Housing Authority",
      "Your Industry Pattern 1",
      "Your Industry Pattern 2"
    ]
  }
}
```

### "Type 2 errors getting through"

**Symptom**: Wrong survivor being selected
**Fix**: Lower importance field or data richness thresholds

```json
// Before (too lenient)
{ "importance_field_mismatch": { "threshold": 70 } }

// After (more sensitive)
{ "importance_field_mismatch": { "threshold": 50 } }
```

---

## Reference

### Complete Configuration Schema

```json
{
  "org_alias": "string",
  "industry": "string",
  "guardrails": {
    "domain_mismatch": {
      "enabled": boolean,
      "threshold": number (0.0-1.0),
      "severity": "BLOCK" | "REVIEW"
    },
    "address_mismatch": {
      "enabled": boolean,
      "generic_entity_patterns": string[],
      "severity": "BLOCK" | "REVIEW"
    },
    "integration_id_conflict": {
      "enabled": boolean,
      "severity": "BLOCK" | "REVIEW"
    },
    "importance_field_mismatch": {
      "enabled": boolean,
      "threshold": number (0-100),
      "severity": "BLOCK" | "REVIEW"
    },
    "data_richness_mismatch": {
      "enabled": boolean,
      "threshold": number (0.0-1.0),
      "severity": "BLOCK" | "REVIEW"
    },
    "relationship_asymmetry": {
      "enabled": boolean,
      "threshold": number,
      "severity": "BLOCK" | "REVIEW"
    }
  },
  "survivor_selection": {
    "weights": {
      "relationship_score": number,
      "integration_id": number,
      "completeness": number,
      "recent_activity": number
    },
    "importance_fields": "auto"
  }
}
```

---

**Version**: 1.0.0
**Last Updated**: 2025-10-16
**Maintained By**: RevPal Engineering
