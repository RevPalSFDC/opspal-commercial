# Validation Rule Troubleshooting Guide

Common issues and solutions when creating or managing validation rules.

## Quick Diagnosis

| Symptom | Likely Cause | Solution |
|---------|--------------|----------|
| Rule not firing | Inactive or wrong object | Check Active status, verify object |
| Always firing | Logic error (AND vs OR) | Review formula logic |
| Error on picklist | ISBLANK on picklist | Use TEXT(field) = "" |
| Circular dependency | Cross-object reference loop | Restructure formula |
| Performance issues | Complex formula | Simplify or split rule |
| Deployment failure | Missing dependencies | Check referenced fields |

---

## Formula Errors

### "Field Does Not Exist"

**Symptom**: Error message indicates field not found.

**Causes**:
1. Typo in field API name
2. Field on wrong object
3. Field deleted after rule creation
4. Missing relationship prefix

**Solutions**:
```javascript
// ❌ Wrong - missing __c suffix
ISBLANK(CustomField)

// ✅ Correct
ISBLANK(CustomField__c)

// ❌ Wrong - missing relationship
ISBLANK(Account.Custom_Field__c)

// ✅ Correct - lookup uses __r
ISBLANK(Account__r.Custom_Field__c)
```

### "Invalid Field for ISBLANK"

**Symptom**: ISBLANK doesn't work as expected on picklist.

**Cause**: ISBLANK() doesn't work on picklist fields.

**Solution**:
```javascript
// ❌ WRONG - never use on picklist
ISBLANK(Status__c)
ISNULL(Status__c)

// ✅ CORRECT - use TEXT() or ISPICKVAL()
TEXT(Status__c) = ""
ISPICKVAL(Status__c, "")
```

### "Compiled formula too big"

**Symptom**: Formula exceeds 5000 character limit.

**Solutions**:

1. **Split into multiple rules**:
```javascript
// Rule 1: Basic validation
AND(
  ISPICKVAL(Status, "Active"),
  ISBLANK(Required_Field__c)
)

// Rule 2: Complex validation (separate)
AND(
  ISPICKVAL(Type, "Enterprise"),
  Amount < 50000
)
```

2. **Simplify logic**:
```javascript
// ❌ Verbose
AND(
  NOT(ISBLANK(Field1__c)),
  NOT(ISBLANK(Field2__c)),
  NOT(ISBLANK(Field3__c))
)

// ✅ Compact with OR and NOT
NOT(OR(
  ISBLANK(Field1__c),
  ISBLANK(Field2__c),
  ISBLANK(Field3__c)
))
```

3. **Use helper formula field**:
   - Create formula field for complex calculations
   - Reference formula field in validation rule

### "REGEX Pattern Error"

**Symptom**: REGEX function returns error.

**Causes**:
1. Unescaped special characters
2. Invalid regex syntax
3. Backslash escaping issues

**Solutions**:
```javascript
// ❌ Wrong - unescaped special chars
REGEX(Phone, "^\d{3}.\d{4}$")

// ✅ Correct - double escape backslash
REGEX(Phone, "^\\d{3}\\.\\d{4}$")

// Special characters requiring escape: . * + ? ^ $ { } [ ] \ | ( )
```

---

## Logic Errors

### Rule Always Fires

**Symptom**: Every save triggers validation error.

**Cause**: Logic is inverted or overly broad.

**Debug Steps**:
1. Check AND vs OR usage
2. Verify NOT placement
3. Test with specific values

```javascript
// ❌ Wrong - fires when ANY field is blank
AND(
  ISBLANK(Field1__c),
  ISBLANK(Field2__c)
)
// This fires when BOTH are blank, not when one is blank

// ✅ Correct - require at least one field
AND(
  ISBLANK(Field1__c),
  ISBLANK(Field2__c)
)
// Error message: "At least one of Field1 or Field2 is required"

// For "one OR the other required":
OR(
  ISBLANK(Field1__c),
  ISBLANK(Field2__c)
)
// This is wrong if you want to require at least one

// ✅ Correct - require at least one
AND(
  ISBLANK(Field1__c),
  ISBLANK(Field2__c)
)
```

### Rule Never Fires

**Symptom**: Validation never triggers even with invalid data.

**Debug Checklist**:
1. Is rule Active?
2. Correct object?
3. Record type scope correct?
4. Formula logic correct?

```javascript
// ❌ Wrong - conditions conflict
AND(
  ISPICKVAL(Status, "Open"),
  ISPICKVAL(Status, "Closed")
)
// Can never be true - Status can't be both

// ✅ Correct - use OR for multiple values
OR(
  ISPICKVAL(Status, "Open"),
  ISPICKVAL(Status, "Closed")
)
```

### Conditional Logic Issues

**Symptom**: Rule fires at wrong times.

```javascript
// ❌ Wrong - always validates Amount
AND(
  ISPICKVAL(Type, "Enterprise"),
  Amount < 50000
)
// If Type is NOT Enterprise and Amount is 40000, rule fires!

// ✅ Correct - only validate when Type is Enterprise
AND(
  ISPICKVAL(Type, "Enterprise"),
  Amount < 50000
)
// Wait, this IS correct. If Type is "SMB", first condition is false,
// so whole AND is false, rule doesn't fire.

// The issue is when you want:
// "If Enterprise, amount must be >= 50000"
// But ALSO: "If not Enterprise, no restriction"

// This formula is actually CORRECT for that case!
```

---

## Cross-Object Issues

### "Relationship Not Found"

**Symptom**: Cross-object reference fails.

**Solutions**:
```javascript
// For standard relationships, check name:
// Account (on Contact) → Account.Field
// Contact (on Case) → Contact.Field

// For custom lookups, use __r suffix:
// Custom_Lookup__c → Custom_Lookup__r.Field

// Master-detail relationships follow same pattern
```

### "Cannot Access Field Through Relationship"

**Symptom**: Parent field not accessible.

**Causes**:
1. Field not visible to running user
2. Relationship not established
3. Multiple levels not supported

**Limits**:
- Max 10 levels of relationship
- Some fields not accessible (encrypted, certain system fields)

### Circular Reference Error

**Symptom**: Deployment fails with circular reference.

**Cause**: Rule A references object B which has rule referencing object A.

**Solution**: Restructure to avoid circular dependencies.

---

## Deployment Issues

### "Dependent Field Missing"

**Symptom**: Cannot deploy to target org.

**Solution**:
1. Ensure all referenced fields exist in target
2. Deploy fields before validation rule
3. Check API names match exactly

### "Active Rule Causes Failures"

**Symptom**: Existing data violates new rule.

**Solutions**:

1. **Run impact analysis first**:
```bash
node scripts/lib/validation-rule-impact-analyzer.js \
  --rule "Amount > 0" \
  --object Opportunity \
  --org my-org
```

2. **Deploy as inactive**:
   - Deploy rule with Active = false
   - Fix data issues
   - Activate rule

3. **Add bypass condition**:
```javascript
AND(
  NOT($Permission.Bypass_Validation),
  /* original formula */
  ISBLANK(Required_Field__c)
)
```

### "Test Coverage Failure"

**Symptom**: Tests fail after adding validation rule.

**Solutions**:
1. Update test data to pass validation
2. Add bypass permission to test user
3. Use Test.startTest() context appropriately

---

## Performance Issues

### Slow Page Loads

**Symptom**: Record pages load slowly after adding rules.

**Causes**:
1. Too many complex rules on object
2. Cross-object references causing queries
3. Recursive validation triggers

**Solutions**:
1. Consolidate rules where possible
2. Cache cross-object values in formula fields
3. Simplify complex formulas

### Governor Limit Errors

**Symptom**: "Too many SOQL queries" or similar.

**Cause**: Validation rules don't cause SOQL, but triggers running after validation might.

**Debug**: Check Apex triggers running on same object.

---

## Debugging Techniques

### Formula Test Tool

Use the formula editor's "Check Syntax" button for immediate feedback.

### Debug Logging

```javascript
// Add temporary debug field to see intermediate values
// Create formula field: Debug_Info__c
IF(
  ISPICKVAL(Status, "Active"),
  "Status is Active",
  "Status is " & TEXT(Status)
)
```

### Incremental Testing

1. Start with simplest possible formula
2. Add conditions one at a time
3. Test after each addition
4. Identify exact point of failure

### Use Developer Console

1. Open Debug > Open Execute Anonymous Window
2. Create test record programmatically
3. Check debug logs for validation details

```apex
// Test validation in Anonymous Apex
Account a = new Account(
    Name = 'Test',
    Industry = null  // Should trigger validation
);
try {
    insert a;
    System.debug('Insert succeeded - validation did not fire');
} catch (DmlException e) {
    System.debug('Validation fired: ' + e.getMessage());
}
```

---

## Common Scenarios

### Bypass for System Integration

```javascript
// Allow integration user to bypass
AND(
  NOT($User.Username = "integration@company.com"),
  /* original formula */
)

// Or use custom permission
AND(
  NOT($Permission.Integration_Bypass),
  /* original formula */
)
```

### Different Rules by Record Type

```javascript
// Enterprise-specific rule
AND(
  RecordType.DeveloperName = "Enterprise",
  ISBLANK(Enterprise_Contact__c)
)

// Standard rule (all other record types)
AND(
  RecordType.DeveloperName <> "Enterprise",
  ISBLANK(Standard_Contact__c)
)
```

### Time-Based Activation

```javascript
// Only enforce after go-live date
AND(
  TODAY() >= DATE(2025, 7, 1),
  /* original formula */
)
```

### Graceful Deprecation

```javascript
// Warning period before enforcement
AND(
  TODAY() >= DATE(2025, 6, 1),  // Warning starts
  TODAY() < DATE(2025, 7, 1),   // Enforcement starts
  /* condition */
)
// Error: "Starting July 1st, this field will be required."
```

---

## Support Resources

### Documentation
- [Salesforce Formula Reference](https://help.salesforce.com/s/articleView?id=sf.customize_functions.htm)
- [Validation Rules Best Practices](https://help.salesforce.com/s/articleView?id=sf.fields_about_field_validation.htm)

### Commands
```bash
# Run impact analysis
/create-validation-rule --impact-analysis

# View existing rules
sf data query --query "SELECT Id, ValidationName, ErrorConditionFormula FROM ValidationRule WHERE EntityDefinition.DeveloperName = 'Account'" --use-tooling-api

# Check formula syntax
/create-validation-rule --validate-formula "ISBLANK(Name)"
```
