# Validation Rule Templates Library

**Version**: 1.0.0
**Last Updated**: 2025-11-23

## Overview

This library provides 30 production-ready validation rule templates across 6 categories. Each template includes formula patterns, error messages, test cases, and usage examples.

## Template Categories

| Category | Count | Description |
|----------|-------|-------------|
| **Required Field** | 5 | Conditional required field validation |
| **Data Format** | 5 | Email, phone, URL, date, numeric formats |
| **Business Logic** | 5 | Thresholds, approvals, calculations |
| **Cross-Object** | 5 | Parent/child relationship validation |
| **Date/Time** | 5 | Date ranges, comparisons, business hours |
| **Security/Compliance** | 5 | Profile restrictions, PII, audit trails |

**Total**: 30 templates

## Quick Start

### Using Templates via CLI (Coming in Phase 1.6)

```bash
# List all templates
validation-rule-template list

# Search templates
validation-rule-template search "required field"

# View template details
validation-rule-template show conditional-required

# Apply template
validation-rule-template apply conditional-required \
  --object Opportunity \
  --trigger-field StageName \
  --trigger-value "Closed Won" \
  --required-field CloseDate
```

### Using Templates via Agent

```bash
# Use validation-rule-orchestrator agent
"Create validation rule for Opportunity using the conditional-required template.
Require Close Date when Stage is Closed Won."
```

### Manual Template Usage

1. Browse templates in this directory
2. Find template matching your needs
3. Copy formula pattern
4. Replace placeholders with your fields
5. Customize error message
6. Test in sandbox
7. Deploy to production

## Template Structure

Each template file contains:

```json
{
  "id": "conditional-required",
  "name": "Conditional Required Field",
  "description": "Require field when another field has specific value",
  "category": "required-field",
  "complexity": 20,
  "formula": "AND([TRIGGER_CONDITION], ISBLANK([REQUIRED_FIELD]))",
  "errorMessage": "[FIELD_LABEL] is required when [TRIGGER_FIELD_LABEL] is [TRIGGER_VALUE].",
  "placeholders": {
    "TRIGGER_CONDITION": "Condition that triggers requirement",
    "REQUIRED_FIELD": "Field to make required",
    "FIELD_LABEL": "User-friendly field name",
    "TRIGGER_FIELD_LABEL": "User-friendly trigger field name",
    "TRIGGER_VALUE": "Value that triggers requirement"
  },
  "examples": [...],
  "testCases": [...],
  "relatedTemplates": [...]
}
```

## Template Categories

### 1. Required Field Templates

**Location**: `required-field/`

Templates for making fields conditionally required based on various criteria.

| Template | Use Case |
|----------|----------|
| `conditional-required` | Require field when another field has specific value |
| `stage-specific-required` | Require fields at specific stages |
| `record-type-required` | Require fields for specific record types |
| `role-based-required` | Require fields based on user role |
| `threshold-based-required` | Require fields when value exceeds threshold |

**Common Use Cases**:
- Close Date required when Opportunity is Closed Won
- Approval Number required for deals >$100K
- Executive Sponsor required for Enterprise opportunities

---

### 2. Data Format Templates

**Location**: `data-format/`

Templates for validating data formats and patterns.

| Template | Use Case |
|----------|----------|
| `email-format` | Validate email address format |
| `phone-format` | Validate phone number format |
| `url-format` | Validate URL format |
| `date-format` | Validate date ranges and formats |
| `numeric-format` | Validate numeric ranges and precision |

**Common Use Cases**:
- Email must contain @ and domain
- Phone must be 10 digits
- Website URL must start with http:// or https://

---

### 3. Business Logic Templates

**Location**: `business-logic/`

Templates for enforcing business rules and thresholds.

| Template | Use Case |
|----------|----------|
| `discount-threshold` | Enforce maximum discount percentage |
| `approval-required` | Require approval for specific scenarios |
| `date-range-validation` | Validate date ranges (start < end) |
| `calculated-field-validation` | Validate calculated fields match formula |
| `conditional-logic` | Complex conditional business logic |

**Common Use Cases**:
- Discount cannot exceed 15%
- Start Date must be before End Date
- Total Price must equal Quantity × Unit Price

---

### 4. Cross-Object Templates

**Location**: `cross-object/`

Templates for validating against parent/related records.

| Template | Use Case |
|----------|----------|
| `parent-industry-check` | Validate based on parent record industry |
| `parent-revenue-check` | Validate based on parent record revenue |
| `parent-status-check` | Validate based on parent record status |
| `child-record-count` | Validate based on number of child records |
| `multi-level-relationship` | Validate across multiple relationship levels |

**Common Use Cases**:
- Opportunity amount limited by Account revenue
- Quote requires Account to be Customer type
- Cannot delete Account with active contracts

---

### 5. Date/Time Templates

**Location**: `date-time/`

Templates for date and time validation.

| Template | Use Case |
|----------|----------|
| `date-in-past` | Prevent dates in the past |
| `date-in-future` | Prevent dates in the future |
| `date-range` | Validate date falls within range |
| `date-comparison` | Compare two date fields |
| `business-hours` | Validate within business hours |

**Common Use Cases**:
- Close Date cannot be in the future
- Contract Start Date cannot be in the past
- End Date must be after Start Date

---

### 6. Security/Compliance Templates

**Location**: `security-compliance/`

Templates for security and compliance requirements.

| Template | Use Case |
|----------|----------|
| `profile-based-restriction` | Restrict operations by profile |
| `pii-protection` | Protect personally identifiable information |
| `audit-trail-required` | Require audit fields for compliance |
| `data-classification` | Enforce data classification rules |
| `permission-based-bypass` | Allow bypass with custom permission |

**Common Use Cases**:
- Only admins can bypass validation
- PII fields require encryption flag
- Cancellation requires reason for audit
- Confidential data requires approval

---

## Finding the Right Template

### By Use Case

**"I need to make a field required"** → `required-field/conditional-required`

**"I need to validate email format"** → `data-format/email-format`

**"I need to enforce discount limit"** → `business-logic/discount-threshold`

**"I need to check parent record"** → `cross-object/parent-status-check`

**"I need to validate dates"** → `date-time/date-comparison`

**"I need profile-based bypass"** → `security-compliance/profile-based-restriction`

### By Object

**Opportunity**:
- `conditional-required` (Close Date when Closed Won)
- `discount-threshold` (Max discount percentage)
- `parent-revenue-check` (Amount limited by Account revenue)
- `date-comparison` (Close Date validation)

**Account**:
- `email-format` (Validate email addresses)
- `phone-format` (Validate phone numbers)
- `data-classification` (PII protection)

**Quote**:
- `approval-required` (Approval for high-value quotes)
- `calculated-field-validation` (Total matches line items)
- `parent-status-check` (Account must be Customer)

**Case**:
- `date-in-future` (Follow-up date validation)
- `audit-trail-required` (Cancellation reason)
- `business-hours` (Created within business hours)

### By Complexity

**Simple (Complexity 10-30)**:
- `conditional-required`
- `email-format`
- `phone-format`
- `date-in-past`
- `profile-based-restriction`

**Medium (Complexity 31-60)**:
- `discount-threshold`
- `date-range-validation`
- `parent-industry-check`
- `audit-trail-required`

**Complex (Complexity 61+)** - Consider segmentation:
- `multi-level-relationship`
- `conditional-logic`
- `child-record-count`

---

## Template Customization

### Basic Customization

1. **Replace Placeholders**

```javascript
// Template
AND([TRIGGER_CONDITION], ISBLANK([REQUIRED_FIELD]))

// Customized
AND(ISPICKVAL(StageName, "Closed Won"), ISBLANK(CloseDate))
```

2. **Update Error Message**

```
// Template
[FIELD_LABEL] is required when [TRIGGER_FIELD_LABEL] is [TRIGGER_VALUE].

// Customized
Close Date is required when Stage is Closed Won.
```

### Advanced Customization

**Add Additional Conditions**:

```javascript
// Template
AND([TRIGGER_CONDITION], ISBLANK([REQUIRED_FIELD]))

// Customized with additional conditions
AND(
  ISPICKVAL(StageName, "Closed Won"),
  Amount > 100000,              // Additional condition
  ISBLANK(CloseDate)
)
```

**Combine Multiple Templates**:

```javascript
// Combine conditional-required + discount-threshold
AND(
  OR(
    AND(ISPICKVAL(StageName, "Closed Won"), ISBLANK(CloseDate)),
    Discount_Percent__c > 0.15
  )
)
```

---

## Testing Templates

### Unit Testing

Each template includes test cases:

```json
"testCases": [
  {
    "name": "Should trigger validation",
    "input": { "StageName": "Closed Won", "CloseDate": null },
    "expected": "Validation error"
  },
  {
    "name": "Should pass validation",
    "input": { "StageName": "Closed Won", "CloseDate": "2025-11-23" },
    "expected": "Save successful"
  }
]
```

### Testing Process

1. Deploy template to sandbox
2. Run provided test cases
3. Test edge cases
4. Run impact analysis
5. Deploy to production

---

## Template Quality Standards

All templates meet these standards:

- ✅ **Complexity Score**: <60 (simple-medium complexity)
- ✅ **Formula Length**: <400 characters
- ✅ **Nesting Depth**: ≤4 levels
- ✅ **Error Message**: Clear, actionable, <255 characters
- ✅ **Null Checks**: All parent relationships null-checked
- ✅ **Picklist Handling**: TEXT() used for picklist blank checks
- ✅ **Test Cases**: Minimum 3 test cases provided
- ✅ **Documentation**: Complete usage examples

---

## Contributing Templates

To contribute a new template:

1. Create template JSON file
2. Follow template structure (see above)
3. Include complete test cases
4. Document placeholders
5. Provide usage examples
6. Test in sandbox
7. Submit for review

**Template Submission Checklist**:
- [ ] Template JSON complete
- [ ] Complexity score calculated
- [ ] Formula tested in sandbox
- [ ] Error message clear and actionable
- [ ] Test cases comprehensive
- [ ] Usage examples provided
- [ ] Related templates identified

---

## Template Versioning

Templates follow semantic versioning:

```
template-id@version

Examples:
conditional-required@1.0.0
email-format@1.1.0 (improved regex)
discount-threshold@2.0.0 (breaking change)
```

**Version History**: See `CHANGELOG.md` in each template directory

---

## Support

**Documentation**:
- Runbook 2: [Designing for Scenarios](../../docs/runbooks/validation-rule-management/02-designing-validation-rules-for-scenarios.md)
- Runbook 8: [Segmented Rule Building](../../docs/runbooks/validation-rule-management/08-segmented-rule-building.md)

**Tools**:
- `validation-rule-complexity-calculator.js` - Calculate template complexity
- `validation-rule-orchestrator` agent - Apply templates
- `validation-rule-segmentation-specialist` agent - Segment complex templates

**Issues**:
- Report issues via `/reflect` command
- GitHub: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/issues

---

**Version**: 1.0.0
**Last Updated**: 2025-11-23
**Total Templates**: 30
