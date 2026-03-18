---
description: Run comprehensive pre-flight validation before CPQ assessments
argument-hint: "[org-alias]"
---

# /cpq-preflight - CPQ Pre-Flight Validation

Run comprehensive pre-flight validation before executing CPQ product catalog or pricing rules assessments.

## Usage

```
/cpq-preflight [org-alias]
```

If no org alias provided, uses `$SF_TARGET_ORG`.

## What It Does

This command runs Phase 0 pre-flight validation:

1. **CPQ Package Detection** - Verifies SBQQ package is installed and accessible
2. **Field Validation** - Scans all SBQQ objects for field availability
3. **Relationship Mapping** - Maps actual child relationship names (prevents "Tiers__r" vs "DiscountTiers__r" errors)
4. **Org Quirks Detection** - Identifies renamed objects (e.g., "Quote" → "Order Form")
5. **Permission Check** - Verifies user has access to required CPQ objects

## Output

Generates a comprehensive pre-flight report:

- `data/preflight-validation.json` - Machine-readable validation results
- `reports/PRE_FLIGHT_CHECK.md` - Human-readable summary with recommendations

## Exit Codes

- `0` - All validations passed, safe to proceed
- `1` - Critical issues found (missing required fields/objects)
- `2` - Warnings found (optional fields missing, proceed with caution)

## Example Output

```
╔════════════════════════════════════════════════════════════╗
║  CPQ Pre-Flight Validation                                 ║
╚════════════════════════════════════════════════════════════╝

Org: eta-production

⏳ Step 1: Detecting CPQ package...
✅ CPQ Package detected: Version Winter '24

⏳ Step 2: Validating SBQQ object access...
✅ Product2: 70 fields accessible
✅ SBQQ__Quote__c: 145 fields accessible (renamed: "Order Form")
✅ SBQQ__QuoteLine__c: 98 fields accessible
...

⏳ Step 3: Mapping child relationships...
✅ SBQQ__DiscountSchedule__c.SBQQ__DiscountTiers__r → SBQQ__DiscountTier__c
✅ SBQQ__PriceRule__c.SBQQ__PriceConditions__r → SBQQ__PriceCondition__c
...

⏳ Step 4: Checking org quirks...
⚠️  Object renamed: SBQQ__Quote__c → "Order Form"
⚠️  Object renamed: SBQQ__QuoteLine__c → "Order Line"

📊 Summary:
   ✅ All critical fields available
   ⚠️  2 objects renamed (quirks detected)
   ✅ All relationships mapped
   ℹ️  3 optional fields missing (non-blocking)

✅ Pre-flight validation PASSED

💡 Recommendations:
   - Review ORG_QUIRKS.json for object name mappings
   - 3 optional fields unavailable (see report for details)
   - Ready to proceed with CPQ assessment

Report saved: reports/PRE_FLIGHT_CHECK.md
```

## When to Use

**Always run this before:**
- CPQ product catalog assessments
- Pricing rules analysis
- Discount schedule mappings
- Any multi-phase CPQ project

**Prevents common errors:**
- "Invalid field" errors from missing SBQQ fields
- "Invalid relationship" errors from wrong relationship names
- "Object not found" errors from renamed objects
- Permission denied errors

## Integration with Assessments

Pre-flight validation is automatically included when using:
- `sfdc-cpq-assessor` agent (runs Phase 0 automatically)
- CPQ assessment playbook templates

Or run manually:
```bash
/cpq-preflight myorg
```

Then review `reports/PRE_FLIGHT_CHECK.md` before proceeding.

## Troubleshooting

### "CPQ package not detected"
- Verify SBQQ package is installed: Check Setup → Installed Packages
- Check org authentication: `sf org display --target-org [org]`

### "Permission denied on SBQQ objects"
- Verify user has CPQ license assigned
- Check profile has Read access to SBQQ objects
- May need to log in with admin user

### "Critical fields missing"
- CPQ version may be older than expected
- Some CPQ features may not be licensed
- Review field-validation report for specific missing fields
- Consider using alternate assessment approach

## See Also

- Field validation utility: `scripts/lib/cpq-field-validator.js`
- Relationship resolver: `scripts/lib/relationship-name-resolver.js`
- Org quirks detection: `scripts/lib/org-quirks-detector.js`
- Full CPQ assessment: `templates/playbooks/cpq-assessment/`
