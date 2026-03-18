---
description: Interactive wizard for creating validation rules using templates or custom formulas
argument-hint: "[--template <id>] [--object <name>] [--custom] [--formula <formula>] [--target-org <alias>]"
---

# Create Validation Rule Command

**Command**: `/create-validation-rule`

**Purpose**: Interactive wizard for creating validation rules using templates or custom formulas

---

## Command Modes

### Mode 1: Interactive Template Selection

```bash
/create-validation-rule
```

Launches interactive wizard:
1. Select object
2. Browse/search templates
3. Choose template
4. Fill in parameters
5. Preview formula and error message
6. Validate complexity
7. Run impact analysis
8. Deploy to sandbox/production

### Mode 2: Direct Template Application

```bash
/create-validation-rule --template <template-id> --object <object> [options]
```

Apply template directly with command-line parameters.

### Mode 3: Custom Formula

```bash
/create-validation-rule --custom --object <object> --formula "<formula>"
```

Create validation rule with custom formula (no template).

---

## Usage Examples

### Example 1: Interactive Mode (Recommended for Beginners)

```bash
/create-validation-rule
```

**Wizard Flow**:
```
┌─────────────────────────────────────────────────┐
│ Validation Rule Creation Wizard                │
└─────────────────────────────────────────────────┘

Step 1/7: Select Object
> Opportunity

Step 2/7: Choose Creation Method
1. Browse templates (recommended)
2. Search templates by keyword
3. Custom formula (advanced)
> 1

Step 3/7: Select Template Category
1. Required Field (5 templates)
2. Data Format (5 templates)
3. Business Logic (5 templates)
4. Cross-Object (5 templates)
5. Date/Time (5 templates)
6. Security/Compliance (5 templates)
> 1

Step 4/7: Select Template
1. ⭐ Conditional Required Field (Popular)
   Require field when another field has specific value
2. Stage-Specific Required Fields
   Require multiple fields at specific stages
3. Record Type Required Fields
   Require fields for specific record types
> 1

Step 5/7: Fill in Template Parameters

Trigger Condition:
  Description: Condition that triggers the requirement
  Example: ISPICKVAL(StageName, "Closed Won")
  Your value: ISPICKVAL(StageName, "Closed Won")

Required Field:
  Description: Field to make required
  Example: CloseDate
  Your value: CloseDate

Field Label:
  Description: User-friendly field name
  Example: Close Date
  Your value: Close Date

...

Step 6/7: Preview & Validate

Name: Require_Close_Date_When_Closed_Won
Formula:
  AND(
    ISPICKVAL(StageName, "Closed Won"),
    ISNULL(CloseDate)
  )

Error Message:
  Close Date is required when Stage is Closed Won.

Complexity Score: 18 (Simple) ✓
Formula Length: 58 characters ✓
Anti-Patterns: None detected ✓

Impact Analysis: Running query against production...
  Total Records: 10,000
  Violating Records: 12 (0.12%)
  Risk Level: LOW ✓

Step 7/7: Deploy

Deploy to:
1. Sandbox (test first - recommended)
2. Production (direct deploy)
3. Save as inactive (staged deployment)
> 1

Deploying to sandbox 'dev'...
✓ Validation successful
✓ Deployment successful
✓ Rule active

Next Steps:
- Test rule with sample records
- Run full test suite
- Deploy to production when ready
```

### Example 2: Direct Template Application

```bash
/create-validation-rule \
  --template conditional-required \
  --object Opportunity \
  --name Require_Close_Date_When_Closed_Won \
  --params '{
    "TRIGGER_CONDITION": "ISPICKVAL(StageName, \"Closed Won\")",
    "REQUIRED_FIELD": "CloseDate",
    "FIELD_LABEL": "Close Date",
    "TRIGGER_FIELD_LABEL": "Stage",
    "TRIGGER_VALUE": "Closed Won"
  }' \
  --target-org dev \
  --active
```

**Output**:
```
✓ Template loaded: conditional-required
✓ Parameters validated
✓ Formula generated: AND(ISPICKVAL(StageName, "Closed Won"), ISNULL(CloseDate))
✓ Complexity score: 18 (Simple)
✓ Impact analysis: 12/10000 records (0.12%)
✓ Deploying to sandbox 'dev'...
✓ Deployment successful

Validation Rule: Require_Close_Date_When_Closed_Won
Status: Active
Object: Opportunity
Org: dev
```

### Example 3: Search and Apply Template

```bash
/create-validation-rule --search "discount"
```

**Output**:
```
Search Results for "discount":

1. discount-threshold (Business Logic)
   Enforce maximum discount percentage threshold
   Complexity: 16 | Popularity: ⭐⭐⭐⭐⭐

2. threshold-based-required (Required Field)
   Require fields when value exceeds threshold
   Complexity: 24 | Popularity: ⭐⭐⭐⭐

Select template (1-2) or press Enter to cancel: 1

Template: discount-threshold
Description: Enforce maximum discount percentage threshold per business policy

Apply this template? (y/n): y

[Launches interactive parameter wizard...]
```

### Example 4: Custom Formula

```bash
/create-validation-rule \
  --custom \
  --object Opportunity \
  --name Custom_Amount_Validation \
  --formula "AND(Amount > 1000000, ISBLANK(Executive_Sponsor__c))" \
  --error-message "Executive Sponsor required for opportunities over $1M" \
  --target-org dev
```

**Output**:
```
✓ Formula syntax valid
✓ Fields exist in Opportunity object
⚠️ Complexity score: 22 (Medium)
⚠️ Recommendation: Consider using threshold-based-required template
✓ Impact analysis: 8/10000 records (0.08%)
✓ Deploying to sandbox 'dev'...
✓ Deployment successful
```

---

## Command Options

### Template Selection Options

| Option | Description | Example |
|--------|-------------|---------|
| `--template <id>` | Apply specific template by ID | `--template conditional-required` |
| `--search <keyword>` | Search templates by keyword | `--search "email"` |
| `--category <cat>` | Filter by category | `--category required-field` |
| `--list` | List all available templates | `--list` |
| `--show <id>` | Show template details | `--show discount-threshold` |

### Rule Configuration Options

| Option | Description | Example |
|--------|-------------|---------|
| `--object <obj>` | Target object API name | `--object Opportunity` |
| `--name <name>` | Validation rule name | `--name My_Rule` |
| `--description <desc>` | Rule description | `--description "Require fields"` |
| `--params <json>` | Template parameters (JSON) | `--params '{...}'` |
| `--formula <formula>` | Custom formula (no template) | `--formula "AND(...)"` |
| `--error-message <msg>` | Custom error message | `--error-message "..."` |

### Deployment Options

| Option | Description | Example |
|--------|-------------|---------|
| `--target-org <org>` | Target org alias | `--target-org production` |
| `--active` | Deploy as active (default: inactive) | `--active` |
| `--staged` | Staged deployment with grace period | `--staged --grace-days 7` |
| `--dry-run` | Validate without deploying | `--dry-run` |
| `--skip-impact` | Skip impact analysis (not recommended) | `--skip-impact` |

### Validation Options

| Option | Description | Example |
|--------|-------------|---------|
| `--validate-only` | Validate formula without deploying | `--validate-only` |
| `--check-complexity` | Calculate complexity score only | `--check-complexity` |
| `--suggest-segmentation` | Get segmentation recommendations | `--suggest-segmentation` |

---

## Template Management Commands

### List All Templates

```bash
/create-validation-rule --list
```

**Output**:
```
Available Validation Rule Templates (30 total):

REQUIRED FIELD (5 templates)
  1. conditional-required ⭐⭐⭐⭐⭐
     Require field when another field has specific value
     Complexity: 20 | Uses: 1,247

  2. stage-specific-required ⭐⭐⭐⭐
     Require multiple fields at specific stages
     Complexity: 25 | Uses: 892

DATA FORMAT (5 templates)
  3. email-format ⭐⭐⭐⭐⭐
     Validate email address format
     Complexity: 18 | Uses: 892

[...more templates...]

Use --show <id> to view template details
Use --search <keyword> to search templates
```

### Show Template Details

```bash
/create-validation-rule --show conditional-required
```

**Output**:
```
Template: conditional-required
Name: Conditional Required Field
Category: Required Field
Version: 1.0.0
Complexity: 20 (Simple)
Popularity: ⭐⭐⭐⭐⭐ (95/100)
Uses: 1,247 times

Description:
  Require a field when another field has a specific value.
  Most common validation pattern.

Formula:
  AND(
    [TRIGGER_CONDITION],
    ISBLANK([REQUIRED_FIELD])
  )

Parameters:
  - TRIGGER_CONDITION: Condition that triggers the requirement
  - REQUIRED_FIELD: Field to make required
  - FIELD_LABEL: User-friendly field name
  - TRIGGER_FIELD_LABEL: User-friendly trigger field name
  - TRIGGER_VALUE: Value that triggers requirement

Examples:
  1. Opportunity Close Date Required
     Object: Opportunity
     Use: Require Close Date when Closed Won

  2. Case Closure Reason Required
     Object: Case
     Use: Require Closure Reason when Closed

Best Practices:
  - Use ISNULL() for date/number fields
  - Use ISPICKVAL() for picklist fields
  - Always provide clear error message
  - Test with all trigger values

Related Templates:
  - stage-specific-required
  - threshold-based-required
  - record-type-required

Use --template conditional-required to apply this template
```

### Search Templates

```bash
/create-validation-rule --search "date" --category date-time
```

**Output**:
```
Search Results: "date" in category "date-time"

1. date-comparison ⭐⭐⭐⭐⭐ (85/100)
   Compare two date fields (start before end)
   Complexity: 22 | Uses: 712

2. date-in-past ⭐⭐⭐⭐ (78/100)
   Prevent dates in the past
   Complexity: 15 | Uses: 654

3. date-in-future ⭐⭐⭐⭐ (80/100)
   Prevent dates in the future
   Complexity: 15 | Uses: 698

Use --show <id> to view details or --template <id> to apply
```

---

## Validation and Testing

### Validate Formula Only

```bash
/create-validation-rule \
  --validate-only \
  --object Opportunity \
  --formula "AND(ISPICKVAL(StageName, 'Closed Won'), ISNULL(CloseDate))"
```

**Output**:
```
Formula Validation Results:

✓ Syntax: Valid
✓ Fields: All fields exist in Opportunity
✓ Picklist handling: Correct (using ISPICKVAL)
✓ Null checks: Appropriate
✓ Complexity: 18 (Simple)
✓ Length: 58 characters (Good)
✓ Nesting depth: 2 levels (Good)
✓ Anti-patterns: None detected

Recommendations:
  ✓ Formula is ready for deployment
  ✓ No optimization needed
```

### Check Complexity

```bash
/create-validation-rule \
  --check-complexity \
  --formula "AND(OR(AND(...), OR(...)), NOT(...))"
```

**Output**:
```
Complexity Analysis:

Score: 72 (Complex)
Length: 450 characters
Nesting depth: 5 levels
Field count: 12
Cross-object refs: 3

⚠️ RECOMMENDATION: Segment this formula

Suggested segments:
  1. Trigger Context (40 chars, score 20)
  2. Required Fields (120 chars, score 28)
  3. Account Validation (100 chars, score 24)

Use --suggest-segmentation for detailed breakdown
```

### Impact Analysis

```bash
/create-validation-rule \
  --impact-analysis \
  --object Opportunity \
  --formula "AND(ISPICKVAL(StageName, 'Closed Won'), ISNULL(CloseDate))" \
  --target-org production
```

**Output**:
```
Impact Analysis Results:

Target Org: production
Object: Opportunity
Formula: AND(ISPICKVAL(StageName, "Closed Won"), ISNULL(CloseDate))

Total Records: 10,000
Violating Records: 12
Violation Rate: 0.12%
Risk Level: LOW ✓

Violating Records Breakdown:
  Stage = Closed Won, CloseDate = NULL: 12 records

Affected Users:
  john.smith@company.com: 5 records
  jane.doe@company.com: 4 records
  bob.jones@company.com: 3 records

Recommended Action:
  ✓ Safe to deploy active immediately
  ✓ Notify affected users (3 people)
  ✓ Provide list of 12 records needing attention

Export violating records:
  sf data query --query "SELECT Id, Name, ... WHERE ..." --result-format csv
```

---

## Deployment Strategies

### Strategy 1: Direct Deployment (Low Risk)

```bash
/create-validation-rule \
  --template conditional-required \
  --object Opportunity \
  --params '{...}' \
  --target-org production \
  --active
```

**When to use**: Violation rate <1%, low-traffic object

### Strategy 2: Staged Deployment (Medium Risk)

```bash
/create-validation-rule \
  --template conditional-required \
  --object Opportunity \
  --params '{...}' \
  --target-org production \
  --staged \
  --grace-days 7
```

**Process**:
1. Deploy inactive
2. Email users with 7-day grace period
3. Activate after 7 days
4. Monitor error frequency

**When to use**: Violation rate 1-5%, medium-traffic object

### Strategy 3: Profile-Filtered Rollout (High Risk)

```bash
/create-validation-rule \
  --template conditional-required \
  --object Opportunity \
  --params '{...}' \
  --add-profile-bypass "Sales User" \
  --target-org production \
  --active
```

**Process**:
1. Deploy with bypass for most users
2. Test with pilot group (no bypass)
3. Remove bypasses incrementally
4. Full rollout after validation

**When to use**: Violation rate 5-10%, high-traffic object

---

## Advanced Features

### Segmentation Suggestions

```bash
/create-validation-rule \
  --suggest-segmentation \
  --formula "[complex 450-char formula]"
```

**Output**:
```
Segmentation Recommendations:

Current Formula:
  Complexity: 75 (Complex)
  Length: 450 characters
  Recommendation: Break into 3 segments

Segment 1: Trigger Context
  Name: My_Rule_01_Trigger
  Formula: AND(RecordType = "Enterprise", Stage = "Closed Won")
  Complexity: 24 (Simple)

Segment 2: Required Fields
  Name: My_Rule_02_Required_Fields
  Formula: OR(ISBLANK(Field1), ISBLANK(Field2), ...)
  Complexity: 28 (Simple)

Segment 3: Account Validation
  Name: My_Rule_03_Account
  Formula: AND(NOT(ISBLANK(Account.Id)), Account.Type = "Customer")
  Complexity: 23 (Simple)

Total Improvement: 75 → avg 25 (67% reduction)

Apply segmentation? (y/n):
```

### Batch Creation

```bash
/create-validation-rule --batch rules.json
```

**File format** (`rules.json`):
```json
[
  {
    "template": "conditional-required",
    "object": "Opportunity",
    "name": "Require_Close_Date",
    "params": {...}
  },
  {
    "template": "discount-threshold",
    "object": "Opportunity",
    "name": "Discount_Limit",
    "params": {...}
  }
]
```

**Output**:
```
Batch Validation Rule Creation:

Processing 2 rules...

1/2: Require_Close_Date
  ✓ Template applied
  ✓ Complexity: 18 (Simple)
  ✓ Deployed to dev

2/2: Discount_Limit
  ✓ Template applied
  ✓ Complexity: 16 (Simple)
  ✓ Deployed to dev

Summary:
  Total: 2 rules
  Successful: 2
  Failed: 0
  Avg complexity: 17
```

---

## Integration with Agents

This command automatically invokes:
- **validation-rule-orchestrator** - For complex deployments
- **validation-rule-segmentation-specialist** - For formula segmentation
- **validation-rule-complexity-calculator** - For complexity analysis

Example:
```bash
# This command internally uses:
# 1. Complexity calculator to assess formula
# 2. Segmentation specialist if complexity >60
# 3. Orchestrator for deployment with governance
/create-validation-rule --template conditional-required ...
```

---

## Troubleshooting

### Error: "Template not found"

```bash
/create-validation-rule --list
# Find correct template ID

/create-validation-rule --search "keyword"
# Search for template
```

### Error: "Invalid formula syntax"

```bash
/create-validation-rule --validate-only --formula "..."
# Validate formula syntax before deploying
```

### Error: "Field does not exist"

```bash
sf sobject describe Opportunity | jq '.fields[].name'
# List all available fields
```

### Error: "Deployment failed"

```bash
# Check deployment status
sf project deploy report --job-id <id>

# Run pre-deployment validation
node scripts/lib/deployment-source-validator.js validate-source ./force-app
```

---

## Related Commands

- `/audit-automation` - Audit existing validation rules
- `/sfdc-discovery` - Discover org configuration
- `/validate-approval-framework` - Validate approval processes

---

## Documentation

- **Runbook 2**: [Designing for Scenarios](../docs/runbooks/validation-rule-management/02-designing-validation-rules-for-scenarios.md)
- **Runbook 5**: [Testing and Deployment](../docs/runbooks/validation-rule-management/05-testing-and-deployment.md)
- **Templates**: [Template Library](../templates/validation-rules/README.md)

---

Using the appropriate sub-agents, runbooks, and tools, create, validate, and deploy validation rules using production-ready templates or custom formulas with comprehensive testing and impact analysis.
