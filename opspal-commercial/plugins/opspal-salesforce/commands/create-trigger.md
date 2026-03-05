---
name: create-trigger
description: Interactive wizard to create Apex triggers from templates with test classes
argument-hint: "--object Account --template cascade-update"
category: Development
version: 1.0.0
tags: [trigger, apex, wizard, templates, testing]
---

# Create Trigger Command

Launch the interactive trigger creation wizard to generate production-ready Apex triggers from templates.

## What This Command Does

This command provides a guided, step-by-step wizard that:

1. **Discovers** available trigger templates (32 templates across 7 categories)
2. **Guides** you through configuration (object, events, fields, logic)
3. **Generates** trigger and handler class with your business logic
4. **Creates** comprehensive test class with multiple scenarios
5. **Validates** code before deployment
6. **Deploys** to your Salesforce org (optional)

## Usage

```bash
/create-trigger
```

Or with parameters:
```bash
/create-trigger --object Account --template cascade-update
```

## Interactive Wizard Flow

The wizard will guide you through these steps:

### Step 1: Object Selection
- Enter the API name of the Salesforce object (e.g., Account, Opportunity, CustomObject__c)
- Validates object exists in your org
- Shows object metadata (fields, record types, relationships)

### Step 2: Template Selection
- Browse 32 templates across 7 categories:
  - **Basic** (5): all-events, before-insert, before-update, after-insert, after-update
  - **Data Validation** (4): field-validation, cross-object-validation, duplicate-prevention, conditional-validation
  - **Data Enrichment** (4): calculated-fields, address-standardization, default-values, parent-field-copy
  - **Related Records** (4): create-child-records, cascade-update, rollup-summary, parent-update
  - **Integration** (3): platform-event-publish, queueable-processing, batch-processing
  - **Audit/Logging** (3): field-history-tracking, change-log, audit-trail
  - **Business Logic** (5): owner-cascade, stage-automation, notification-sending, task-creation, sharing-rules
- View template description and example code
- Select template to use

### Step 3: Configuration
Based on selected template, configure:
- **Trigger Events**: Which events to handle (before/after insert/update/delete/undelete)
- **Fields**: Which fields to track/calculate/validate
- **Child Objects**: Related objects to cascade/rollup
- **Conditions**: When logic should execute
- **Custom Settings**: Values specific to your use case

### Step 4: Code Generation
- Generates trigger file with routing logic
- Generates handler class with your configuration
- Generates test class with multiple test methods
- Shows preview of generated code
- Allows editing before saving

### Step 5: Validation
- Validates Apex syntax
- Checks governor limit patterns
- Verifies test class completeness
- Estimates code coverage

### Step 6: Deployment (Optional)
- Saves files to force-app/main/default
- Deploys to target org
- Runs test class
- Shows deployment results

## Examples

### Example 1: Create Validation Trigger
```bash
/create-trigger

# Wizard prompts:
Object API Name: Opportunity
Template: field-validation
Fields to Validate: Amount, CloseDate, StageName
Validation Rules: Amount > 0, CloseDate in future, StageName required
Deploy Now? Yes

# Output:
✅ Created OpportunityTrigger.trigger
✅ Created OpportunityTriggerHandler.cls
✅ Created OpportunityTriggerHandlerTest.cls
✅ Deployed to dev-org
✅ Tests passed: 95% coverage
```

### Example 2: Create Cascade Trigger
```bash
/create-trigger --object Account --template cascade-update

# Wizard prompts:
Cascade Field Changes: Status__c, Owner
Child Objects: Opportunity, Case, Contact
Access Level: Edit
Deploy Now? No

# Output:
✅ Created AccountTrigger.trigger
✅ Created AccountTriggerHandler.cls
✅ Created AccountTriggerHandlerTest.cls
📁 Saved to force-app/main/default/triggers/
```

### Example 3: Create Rollup Summary Trigger
```bash
/create-trigger

Object: Opportunity
Template: rollup-summary
Parent Object: Account
Rollup Fields: Amount (SUM), Count (COUNT), CloseDate (MIN/MAX)
Filter: StageName = 'Closed Won'

# Output:
✅ Generated trigger with 3 rollup calculations
✅ Test class includes bulk testing (200+ records)
✅ Optimized for single SOQL query with aggregations
```

## Generated File Structure

```
force-app/main/default/
├── triggers/
│   └── ObjectNameTrigger.trigger
├── classes/
│   ├── ObjectNameTriggerHandler.cls
│   ├── ObjectNameTriggerHandler.cls-meta.xml
│   ├── ObjectNameTriggerHandlerTest.cls
│   └── ObjectNameTriggerHandlerTest.cls-meta.xml
└── [metadata files]
```

## Code Quality Features

### Automatic Optimizations
- ✅ Bulkification (processes 200+ records efficiently)
- ✅ Single SOQL queries per object type
- ✅ Single DML operations per object type
- ✅ Recursion prevention (static flags + processed ID sets)
- ✅ Governor limit monitoring
- ✅ Error handling with try/catch

### Test Class Features
- ✅ @testSetup with reusable data
- ✅ Test all trigger events (insert/update/delete/undelete)
- ✅ Bulk testing (200+ records)
- ✅ Negative testing (validation errors)
- ✅ Governor limit assertions
- ✅ 75%+ code coverage guaranteed

### Best Practices Included
- ✅ Handler pattern (separates logic from trigger)
- ✅ Recursion prevention
- ✅ Comprehensive inline documentation
- ✅ Customization checklists
- ✅ Field-level security checks
- ✅ Record type handling

## Command Options

```bash
/create-trigger [OPTIONS]

Options:
  --object <name>          Object API name (e.g., Account, CustomObject__c)
  --template <name>        Template name (e.g., cascade-update, field-validation)
  --category <category>    Filter templates by category
  --list-templates         Show all available templates
  --output <directory>     Output directory (default: force-app/main/default)
  --deploy                 Deploy immediately after generation
  --test-only              Generate test class only
  --skip-tests             Skip test class generation
  --api-version <version>  API version (default: 62.0)
  --help                   Show this help message
```

## Template Registry

View all available templates:
```bash
/create-trigger --list-templates
```

Output shows:
```
Basic (5 templates):
  - all-events-template: Handle all trigger events
  - before-insert-template: Before insert logic
  - before-update-template: Before update logic
  - after-insert-template: After insert logic
  - after-update-template: After update logic

Data Validation (4 templates):
  - field-validation: Validate field values
  - cross-object-validation: Validate across objects
  - duplicate-prevention: Prevent duplicate records
  - conditional-validation: Complex validation rules

[... more categories ...]
```

Filter by category:
```bash
/create-trigger --category "Data Validation" --list-templates
```

## Advanced Features

### Custom Template Variables
Replace template placeholders during generation:
- `{{OBJECT_NAME}}` → Your object name
- `{{FIELDS_TO_TRACK}}` → Your field list
- `{{CHILD_OBJECTS}}` → Your related objects
- `{{VALIDATION_RULES}}` → Your custom rules

### Multi-Template Combining
Combine multiple templates into one handler:
```bash
/create-trigger --object Account --combine

# Select templates to combine:
☑ cascade-update (parent-child updates)
☑ field-validation (amount must be positive)
☑ notification-sending (high-value alerts)

# Generates single handler with all logic
```

### Code Review Mode
Review generated code before saving:
```bash
/create-trigger --review

# Shows:
- Line-by-line diff
- Complexity analysis
- Governor limit estimates
- Security scan results
- Approve/Edit/Cancel options
```

## Troubleshooting

### Object Not Found
```
Error: Object 'CustomObj__c' not found
Solution: Verify object API name includes __c suffix
```

### Template Not Found
```
Error: Template 'invalid-template' does not exist
Solution: Run --list-templates to see available options
```

### Deployment Failed
```
Error: Deployment failed - Invalid syntax
Solution: Run validation first, check error details
```

### Test Coverage Low
```
Warning: Test coverage 70% (need 75%)
Solution: Add more test methods for uncovered logic
```

## Integration with Other Tools

### With Trigger Segmentation
```bash
# Start new segment
/opspal-salesforce:trigger-segment-start cascade-update

# Generate code
/create-trigger --object Account --template cascade-update

# Complete segment
/opspal-salesforce:trigger-segment-complete
```

### With Validation Rules
```bash
# Check existing validation rules
# (avoid duplicating logic in trigger)
sf data query --query "SELECT Id, ValidationName FROM ValidationRule WHERE EntityDefinition.QualifiedApiName = 'Account'"

# Create trigger with complementary logic
/create-trigger --object Account
```

### With Living Runbook System
```bash
# Generate trigger
/create-trigger --object Account --template owner-cascade

# Document in runbook
# Automatically added to:
# docs/runbooks/triggers/account-owner-cascade.md
```

## Performance Considerations

### Governor Limits
All templates optimized to stay within limits:
- SOQL Queries: < 10 per trigger (limit: 100)
- DML Statements: < 5 per trigger (limit: 150)
- DML Rows: Handles 10,000 records per transaction
- CPU Time: < 2,000ms per trigger (limit: 10,000ms)
- Heap Size: < 2MB per trigger (limit: 6MB)

### Bulk Testing
All test classes include bulk testing:
- 200 record inserts
- 200 record updates
- 200 record deletes
- Verifies limits not exceeded

### Async Processing
Templates include async patterns when appropriate:
- @future for callouts
- Queueable for chaining
- Batch for large data volumes
- Platform events for decoupling

## Best Practices

### Before Creating Trigger
1. ✅ Check if trigger already exists on object
2. ✅ Review existing validation rules
3. ✅ Consider workflow rules and process builder
4. ✅ Plan for governor limits
5. ✅ Document trigger purpose and logic

### After Creating Trigger
1. ✅ Run all tests in org
2. ✅ Verify code coverage >= 75%
3. ✅ Test in sandbox before production
4. ✅ Monitor governor limits
5. ✅ Update Living Runbook documentation

### Naming Conventions
- Trigger: `ObjectNameTrigger.trigger`
- Handler: `ObjectNameTriggerHandler.cls`
- Test: `ObjectNameTriggerHandlerTest.cls`

## Security Considerations

### Field-Level Security
Templates include FLS checks:
```apex
if (!Schema.sObjectType.ObjectName.fields.FieldName__c.isUpdateable()) {
    // Skip field update
}
```

### Record-Level Security
Templates respect sharing rules:
```apex
// Query with user mode (respects sharing)
List<ObjectName> records = [SELECT Id FROM ObjectName];

// Update with user mode
Database.update(records, false); // AllowPartialSuccess
```

### CRUD Checks
Templates include CRUD validation:
```apex
if (!Schema.sObjectType.ObjectName.isCreateable()) {
    throw new SecurityException('No create permission');
}
```

## Related Commands

- `/opspal-salesforce:trigger-segment-start` - Start segmented trigger development
- `/opspal-salesforce:trigger-segment-complete` - Complete trigger segment
- `/opspal-salesforce:flow-diagnose` - Alternative to triggers (declarative)
- `/opspal-salesforce:validate-lwc` - If creating LWC with trigger

## Additional Resources

- **Templates**: `.claude-plugins/opspal-salesforce/templates/triggers/`
- **Examples**: `.claude-plugins/opspal-salesforce/docs/trigger-examples/`
- **Living Runbook**: `docs/runbooks/triggers/`
- **Salesforce Docs**: [Apex Triggers Developer Guide](https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_triggers.htm)

---

**Note**: This command uses the trigger template library created in Phase 2.5. All 32 templates are production-ready and follow Salesforce best practices.
