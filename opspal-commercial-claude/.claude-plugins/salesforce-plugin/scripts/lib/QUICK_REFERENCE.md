# Investigation Tools - Quick Reference

## Most Common Commands

### Initialize Metadata Cache (Run First!)
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/org-metadata-cache.js init sample-org-production
```

### Diagnose Lead Conversion Issue
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/lead-conversion-diagnostics.js sample-org-production <lead-id>
```

### Execute Query Safely
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/smart-query-validator.js sample-org-production "SELECT Id, Name FROM Contact"
```

### Find Fields by Pattern
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/org-metadata-cache.js find-field sample-org-production Contact Practice
```

### Validate Query Without Executing
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/org-metadata-cache.js validate-query sample-org-production "SELECT Id, Name FROM Account"
```

---

## When to Use Each Tool

| Scenario | Tool | Command |
|----------|------|---------|
| Lead conversion fails | Lead Conversion Diagnostic | `node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/lead-conversion-diagnostics.js <org> <lead-id>` |
| Query fails with "no such column" | Smart Query Validator | `node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/smart-query-validator.js <org> "<soql>"` |
| Need to find field name | Metadata Cache | `node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/org-metadata-cache.js find-field <org> <object> <pattern>` |
| Check if query is valid | Metadata Cache | `node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/org-metadata-cache.js validate-query <org> "<soql>"` |
| Explore object metadata | Metadata Cache | `node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/org-metadata-cache.js query <org> <object>` |

---

## Typical Workflow

```bash
# 1. Initialize cache (first time only)
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/org-metadata-cache.js init sample-org-production

# 2. Find the field you need
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/org-metadata-cache.js find-field sample-org-production Contact Practice

# 3. Build and validate your query
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/smart-query-validator.js sample-org-production "SELECT Id, Practice_Portal_Role__c FROM Contact LIMIT 10"

# 4. If investigating a specific issue, use diagnostic
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/lead-conversion-diagnostics.js sample-org-production 00QUw00000SHtL2MAL
```

---

## Time Savings

| Task | Without Tools | With Tools | Savings |
|------|---------------|------------|---------|
| Lead conversion investigation | 30 min | 5 min | 83% |
| Field name lookup | 5 min | 10 sec | 97% |
| Query validation | 2 min | 5 sec | 96% |
| Object exploration | 10 min | 30 sec | 95% |

---

## Common Errors & Solutions

### "Cache not found"
```bash
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/org-metadata-cache.js init <org-alias>
```

### "Field does not exist"
```bash
# Find the correct field name
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/org-metadata-cache.js find-field <org> <object> <pattern>
```

### "Object does not exist"
```bash
# List all objects
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/org-metadata-cache.js query <org>
```

---

## Pro Tips

1. **Always initialize cache first** - saves time on every subsequent operation
2. **Refresh cache weekly** - keeps metadata current
3. **Use auto-correct feature** - let tools fix typos automatically
4. **Save diagnostic reports** - reference for future issues
5. **Explore before querying** - use cache to discover fields first

---

Full documentation: [docs/INVESTIGATION_TOOLS_GUIDE.md](../../docs/INVESTIGATION_TOOLS_GUIDE.md)