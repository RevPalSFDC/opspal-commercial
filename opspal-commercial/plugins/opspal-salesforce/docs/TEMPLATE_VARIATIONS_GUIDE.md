# Template Variations Guide

This guide explains how to use and create template variations for Salesforce dashboard and report templates. Variations enable context-aware deployment to any Salesforce instance without template duplication.

## Current Coverage

| Template Type | Count | Variations |
|---------------|-------|------------|
| Dashboard Templates | 18 | 76 definitions (4.2 avg) |
| Report Templates | 115 | 460+ definitions |
| **Total** | **133** | **100% coverage** |

### By Category

| Category | Dashboards | Reports | Variations |
|----------|------------|---------|------------|
| Sales (Executive) | 3 | 18 | simple, standard, cpq, enterprise |
| Sales (Manager) | 3 | 18 | simple, standard, cpq, enterprise, smb |
| Sales (Individual) | 3 | 21 | simple, standard, cpq, enterprise |
| Marketing | 4 | 23 | simple, standard, plg, abm |
| Customer Success | 5 | 35 | simple, standard, enterprise, high-touch |

## Overview

Template variations allow a single template to adapt to different:
- **Quoting systems** (native Quote, Salesforce CPQ/SBQQ, hybrid)
- **Complexity levels** (simple, standard, advanced)
- **GTM models** (field sales, inside sales, PLG, hybrid)
- **Company sizes** (enterprise, mid-market, SMB)

Instead of creating separate templates for each combination, variations use **metadata overlays** that modify the base template at deployment time.

## Quick Start

### Selecting a Variation

When deploying a template, specify the variation:

```bash
# Auto-detect variation based on org
node scripts/lib/report-template-deployer.js deploy revenue-performance --org my-org

# Explicitly specify variation
node scripts/lib/report-template-deployer.js deploy revenue-performance --org my-org --variation cpq

# Use simple variation for faster adoption
node scripts/lib/report-template-deployer.js deploy my-pipeline --org my-org --variation simple
```

### Variation Resolution Order

When no variation is explicitly specified:

1. **Explicit** - User specifies `--variation cpq`
2. **Org Profile** - Org-specific configuration in `instances/{org}/org-profile.json`
3. **Auto-detect** - System detects CPQ namespace and recommends variation

## Variation Dimensions

### Complexity

| Variation | Description | Use When |
|-----------|-------------|----------|
| `simple` | 4 key components, essential metrics only | New users, quick adoption, basic needs |
| `standard` | Full component set, balanced detail | Default for most orgs |
| `advanced` | All components + additional breakdowns | Power users, data-driven orgs |

### Quoting System

| Variation | Description | Auto-Detection |
|-----------|-------------|----------------|
| `native` | Standard Salesforce Quote object | No SBQQ__ objects found |
| `cpq` | Salesforce CPQ (SBQQ__) fields | SBQQ__Quote__c exists with data |
| `hybrid` | Both native and CPQ | Both systems have data |

### GTM Model

| Variation | Description | Key Adjustments |
|-----------|-------------|-----------------|
| `field-sales` | Traditional enterprise sales | Longer cycles, larger deals |
| `inside-sales` | High-velocity sales | Activity focus, faster cycles |
| `plg` | Product-led growth | Self-service, trial conversions |
| `hybrid` | Mixed motion | Balanced metrics |

### Company Size

| Variation | Description | Threshold Adjustments |
|-----------|-------------|----------------------|
| `enterprise` | Large deals, long cycles | Higher coverage (4x), stricter thresholds |
| `mid-market` | Medium complexity | Standard thresholds |
| `smb` | Fast cycles, volume | Lower coverage (2.5x), relaxed thresholds |

## CPQ Detection

The system automatically detects CPQ installations:

```bash
# Check your org's quoting system
node scripts/lib/cpq-detector.js my-org-alias
```

Output:
```
Detection Results:
──────────────────────────────────────────────────
  Quoting System:    CPQ
  CPQ Installed:     ✅ Yes
  CPQ Has Data:      ✅ Yes
  Native Quote:      ✅ Yes
  Native Has Data:   ❌ No
  CPQ Version:       234.0
  Namespaces:        SBQQ
  Detection Method:  query
──────────────────────────────────────────────────

📋 Recommendation:
   Use CPQ-specific templates and field mappings
   Fields: SBQQ__Quote__c, SBQQ__QuoteLine__c, etc.
```

## Field Mapping

### CPQ Field Substitutions

When CPQ is detected, these fields are automatically substituted:

| Native Field | CPQ Field |
|--------------|-----------|
| `Quote` | `SBQQ__Quote__c` |
| `Quote.TotalPrice` | `SBQQ__Quote__c.SBQQ__NetAmount__c` |
| `QuoteLineItem` | `SBQQ__QuoteLine__c` |
| `Amount` | `SBQQ__NetAmount__c` |
| `Discount` | `SBQQ__CustomerDiscount__c` |

Full mappings: `config/cpq-field-mappings.json`

### Field Fallback Chain

Each field has a fallback chain for resolution:

```json
{
  "Amount": {
    "patterns": ["Amount", "Deal_Value__c", "Pipeline_Value__c"],
    "cpqPatterns": ["SBQQ__NetAmount__c", "SBQQ__CustomerAmount__c"],
    "namespaceAware": true,
    "fallbackChain": [
      { "namespace": "SBQQ", "field": "SBQQ__NetAmount__c" },
      { "namespace": null, "field": "Amount" }
    ],
    "dataType": "currency"
  }
}
```

Resolution order:
1. Exact label match
2. Exact API token match
3. CPQ namespace match (if CPQ enabled)
4. Pattern match from fallback list
5. Fuzzy match (similarity > 0.8)

## Data Availability Tiers

Templates degrade gracefully based on available fields:

| Tier | Fidelity | Behavior |
|------|----------|----------|
| `complete` | ≥90% | All components enabled |
| `partial` | 70-90% | Essential components + fallbacks |
| `minimal` | 50-70% | Essential components only |

Example from `my-pipeline.json`:
```json
{
  "dataAvailabilityTiers": {
    "complete": {
      "minimumFidelity": 0.9,
      "components": "all"
    },
    "partial": {
      "minimumFidelity": 0.7,
      "enabledComponents": [
        "My Open Pipeline",
        "My Coverage Ratio",
        "My Pipeline by Stage",
        "My Top Priorities"
      ]
    },
    "minimal": {
      "minimumFidelity": 0.5,
      "enabledComponents": [
        "My Open Pipeline",
        "My Top Priorities"
      ]
    }
  }
}
```

## Creating Custom Variations

### 1. Add Variation to Template

Edit the template's `variations` section:

```json
{
  "variations": {
    "schemaVersion": "1.0",
    "baseTemplate": true,
    "availableVariations": ["simple", "standard", "cpq", "my-custom"],
    "defaultVariation": "standard",

    "variationOverrides": {
      "my-custom": {
        "description": "Custom variation for my use case",
        "componentOverrides": {
          "maxComponents": 5,
          "exclude": ["Pipeline Age Distribution"]
        },
        "fieldSubstitutions": {
          "Amount": "Custom_Amount__c"
        },
        "metricAdjustments": {
          "pipelineCoverage": {
            "target": "2.5x",
            "thresholds": {
              "green": ">=2.5x",
              "yellow": "2-2.5x",
              "red": "<2x"
            }
          }
        }
      }
    }
  }
}
```

### 2. Variation Override Types

#### Component Overrides
```json
{
  "componentOverrides": {
    "maxComponents": 4,
    "exclude": ["Component Title 1", "Component Title 2"],
    "include": ["Only These", "Components"]
  }
}
```

#### Field Substitutions
```json
{
  "fieldSubstitutions": {
    "Amount": "SBQQ__NetAmount__c",
    "Quote": "SBQQ__Quote__c"
  }
}
```

#### Filter Overrides
```json
{
  "filterOverrides": [
    {
      "field": "Type",
      "default": "Upgrade",
      "values": ["Upgrade", "Conversion", "Expansion"]
    }
  ]
}
```

#### Metric Adjustments
```json
{
  "metricAdjustments": {
    "coverageRatio": {
      "target": "3x",
      "thresholds": {
        "green": ">=3x",
        "yellow": "2-3x",
        "red": "<2x"
      }
    }
  }
}
```

#### Org Adaptation Overrides
```json
{
  "orgAdaptationOverrides": {
    "minimumFidelity": 0.5,
    "adaptationStrategy": "best-effort"
  }
}
```

### 3. Register in Dashboard Registry

Add your variation to `searchIndex.variations` in `dashboard-template-registry.json`:

```json
{
  "searchIndex": {
    "variations": {
      "my-custom": ["revenue-performance", "pipeline-health"]
    }
  }
}
```

### 4. Add Variation Profile (Optional)

For org-wide defaults:

```json
{
  "variationProfiles": {
    "my-custom-profile": {
      "description": "Custom org profile",
      "quotingSystem": "native",
      "companySize": "mid-market",
      "complexity": "standard",
      "applicableTemplates": ["revenue-performance", "my-pipeline"]
    }
  }
}
```

## Troubleshooting

### Field Resolution Failures

**Symptom:** "Field not found" errors during deployment

**Solutions:**
1. Check field exists in org:
   ```bash
   sf sobject describe Opportunity | jq '.fields[].name' | grep -i amount
   ```

2. Add custom pattern to template's `fieldFallbacks`:
   ```json
   {
     "Amount": {
       "patterns": ["Amount", "My_Custom_Amount__c"],
       "dataType": "currency"
     }
   }
   ```

3. Use explicit field substitution in variation override

### CPQ Detection Not Working

**Symptom:** CPQ installed but not detected

**Solutions:**
1. Verify SBQQ objects accessible:
   ```bash
   sf data query --query "SELECT COUNT() FROM SBQQ__Quote__c" --target-org my-org
   ```

2. Check user has CPQ permissions

3. Force CPQ variation:
   ```bash
   --variation cpq
   ```

### Component Count Mismatch

**Symptom:** "Simple" variation shows more components than expected

**Solutions:**
1. Verify `maxComponents` in variation override
2. Check `exclude` list matches component titles exactly
3. Review component position numbers

### Low Fidelity Score

**Symptom:** Template deploys with minimal components

**Solutions:**
1. Check required fields exist in org
2. Add field fallbacks for missing fields
3. Lower `minimumFidelity` threshold if appropriate

## Validation

### Run Variation Tests

```bash
# Unit tests for variation system
node scripts/test-variation-resolution.js

# Validate all templates with variations
node scripts/test-dashboard-templates.js --include-variations

# Variations only (skip other checks)
node scripts/test-dashboard-templates.js --variations-only --verbose
```

### Validate Specific Template

```bash
node scripts/test-dashboard-templates.js --template revenue-performance --include-variations
```

### Check Variation Schema

```bash
# Schema file
cat config/variation-schema.json

# Validate template against schema
node scripts/test-variation-resolution.js --filter templates
```

## Best Practices

### 1. Start with Standard Variation
- Use `standard` as default for most orgs
- Only switch to `simple` for new users or limited needs
- Use `advanced` only when requested

### 2. Let Auto-Detection Work
- Don't force variations unless necessary
- Trust CPQ detection for quoting system selection
- Override only when auto-detection fails

### 3. Test Before Deploying
- Run validation with `--include-variations`
- Check field resolution in sandbox first
- Verify component count matches expectations

### 4. Document Custom Variations
- Add description to every variation
- Explain use case in template comments
- Update this guide for org-specific variations

### 5. Maintain Field Fallbacks
- Add new custom fields to fallback patterns
- Keep CPQ patterns current with package updates
- Test field resolution after org changes

## Reference Files

| File | Purpose |
|------|---------|
| `config/variation-schema.json` | JSON Schema for validation |
| `config/cpq-field-mappings.json` | CPQ ↔ native field maps |
| `scripts/lib/variation-resolver.js` | Core variation logic |
| `scripts/lib/cpq-detector.js` | SBQQ namespace detection |
| `scripts/test-variation-resolution.js` | Variation test suite |
| `scripts/add-report-variations.js` | Batch add variations to reports |
| `templates/dashboards/dashboard-template-registry.json` | Template registry with variation support |

## Batch Update Reports

To add variations to new report templates:

```bash
# Update all categories
node scripts/add-report-variations.js

# Update specific category
node scripts/add-report-variations.js customer-success
node scripts/add-report-variations.js marketing
node scripts/add-report-variations.js sales-reps
node scripts/add-report-variations.js sales-managers
node scripts/add-report-variations.js sales-executive
```

The script:
- Adds `variations` and `orgAdaptation` sections
- Applies category-appropriate variation configurations
- Bumps template versions automatically
- Skips templates that already have variations

## Support

For issues with template variations:
1. Run validation tests to identify the problem
2. Check this troubleshooting guide
3. Review the variation schema
4. Submit feedback via `/reflect`
