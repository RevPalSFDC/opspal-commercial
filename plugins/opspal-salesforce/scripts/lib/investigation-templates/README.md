# Investigation Templates

Pre-built investigation workflows for common Salesforce issues.

## Available Templates

### 1. Lead Conversion Blocker
**Use when:** Lead conversion fails with validation or field errors

**Command:**
```bash
node investigation-templates/lead-conversion-blocker.js <org-alias> <lead-id>
```

**What it checks:**
- Lead record data and field values
- Contact required fields and defaults
- LeadConvertSettings field mappings
- Validation rules that might trigger
- RecordType mapping logic
- Picklist value compatibility

**Output:**
- Root cause identification
- Severity ranking of issues
- Specific remediation steps with time estimates
- Full diagnostic report saved to instance directory

---

### 2. Validation Rule Conflict (Coming Soon)
**Use when:** Record save fails due to validation rule

---

### 3. Field Mapping Gap (Coming Soon)
**Use when:** Data isn't transferring between objects as expected

---

### 4. Permission Issue (Coming Soon)
**Use when:** User can't access records or fields

---

## Creating Custom Templates

1. Create new file in this directory: `your-template-name.js`
2. Extend base investigation class (if available)
3. Implement diagnostic logic
4. Generate structured report
5. Save results to instance directory

## Template Structure

```javascript
class YourTemplate {
    constructor(orgAlias, ...params) {
        this.orgAlias = orgAlias;
        this.cache = new OrgMetadataCache(orgAlias);
    }

    async diagnose() {
        // Load metadata cache
        // Fetch relevant data
        // Run analysis
        // Generate report
    }

    generateReport() {
        // Output to console
        // Save to file
    }
}
```

## Best Practices

1. **Use Metadata Cache First**
   - Load cache before querying
   - Build cache if missing
   - Use cache for field validation

2. **Structured Output**
   - Clear severity levels (CRITICAL, HIGH, MEDIUM, LOW)
   - Ranked issues with root cause first
   - Specific solutions with time estimates

3. **Save Everything**
   - JSON report for programmatic access
   - Human-readable console output
   - Save to dated instance subdirectory

4. **Helpful Errors**
   - Suggest fixes when validation fails
   - Provide exact commands to run
   - Link to relevant documentation