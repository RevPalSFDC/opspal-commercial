# Picklist Dependency Quick Reference

**One-page cheat sheet for common operations**

---

## 📋 Common Commands

### Analyze Existing Dependency
```bash
node scripts/lib/picklist-describer.js dependency <object> <dependent-field> <controlling-field>
```

### Create New Dependency
```javascript
const { PicklistDependencyManager } = require('./scripts/lib/picklist-dependency-manager');
const manager = new PicklistDependencyManager({ org: 'myorg' });

await manager.createDependency({
    objectName: 'Account',
    controllingFieldApiName: 'Industry',
    dependentFieldApiName: 'Account_Type__c',
    dependencyMatrix: {
        'Technology': ['SaaS', 'Hardware'],
        'Finance': ['Banking', 'Insurance']
    },
    recordTypes: 'all'
});
```

### Validate Before Deployment
```javascript
const { PicklistDependencyValidator } = require('./scripts/lib/picklist-dependency-validator');
const validator = new PicklistDependencyValidator({ org: 'myorg' });

const validation = await validator.validateBeforeDeployment({
    objectName, controllingFieldApiName, dependentFieldApiName, dependencyMatrix
});

if (!validation.canProceed) {
    console.error(validation.errors);
}
```

### Create Global Value Set
```javascript
const { GlobalValueSetManager } = require('./scripts/lib/global-value-set-manager');
const gvsManager = new GlobalValueSetManager({ org: 'myorg' });

await gvsManager.createGlobalValueSet({
    fullName: 'Industries',
    masterLabel: 'Industries',
    values: [
        { fullName: 'Technology', label: 'Technology', isActive: true }
    ]
});
```

---

## 🎯 Decision Matrix

| Need | Library | API Method |
|------|---------|------------|
| **Create GVS** | `GlobalValueSetManager` | Tooling API |
| **Create Dependency** | `PicklistDependencyManager` | Metadata API |
| **Validate Config** | `PicklistDependencyValidator` | SOQL |
| **Update Record Types** | `UnifiedPicklistManager` | Metadata API |

---

## ✅ Pre-Deployment Checklist

- [ ] Both fields exist on object
- [ ] Both fields are picklist/multipicklist type
- [ ] All controlling values exist in controlling field
- [ ] All dependent values exist in dependent field
- [ ] No orphaned values in dependency matrix
- [ ] No circular dependencies
- [ ] Global Value Sets created (if using them)
- [ ] Validated via `PicklistDependencyValidator`
- [ ] Tested in sandbox first

---

## 🚫 Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| **"Controlling field reference not found"** | `controllingField` not set | Use `PicklistDependencyManager` |
| **"Values not visible"** | Record types not updated | Use `verifyAndFix()` |
| **"Circular dependency"** | A controls B, B controls A | Break circular reference |
| **"GVS not found"** | Referenced GVS doesn't exist | Create GVS first |

---

## 📊 Dependency Matrix Patterns

### Pattern 1: Simple 1-to-Many
```javascript
{
    'Technology': ['SaaS', 'Hardware', 'Software'],
    'Finance': ['Banking', 'Insurance']
}
```

### Pattern 2: Overlapping (Valid!)
```javascript
{
    'Technology': ['Enterprise', 'SMB', 'Startup'],
    'Finance': ['Enterprise', 'SMB', 'Investment']
    // 'Enterprise' and 'SMB' map to multiple controlling values
}
```

### Pattern 3: Exclusive
```javascript
{
    'North America': ['USA', 'Canada', 'Mexico'],
    'Europe': ['UK', 'Germany', 'France']
    // No overlap - each dependent value is exclusive
}
```

---

## 🔧 Validation Checks

### Pre-Deployment (`validateBeforeDeployment`)
- ✅ Fields exist
- ✅ Field types compatible
- ✅ Controlling values exist
- ✅ Dependent values exist
- ✅ No circular dependencies
- ✅ Matrix completeness
- ✅ Record types exist

### Post-Deployment (`verifyDependencyDeployment`)
- ✅ Dependent field marked as dependent
- ✅ Controlling field reference correct
- ✅ Dependency functional

---

## 🎬 Complete Workflow (7 Steps)

```javascript
// 1. Plan & gather info
const config = {
    objectName: 'Account',
    controllingFieldApiName: 'Industry',
    dependentFieldApiName: 'Account_Type__c',
    dependencyMatrix: { /* ... */ }
};

// 2. Create Global Value Sets (if needed)
await gvsManager.createGlobalValueSet({ /* ... */ });

// 3. Validate configuration
const validation = await validator.validateBeforeDeployment(config);
if (!validation.canProceed) throw new Error('Invalid');

// 4. Ensure controlling field has values
await picklistMgr.updatePicklistAcrossRecordTypes({ /* ... */ });

// 5. Create dependency
const result = await depManager.createDependency(config);

// 6. Verify deployment
const verify = await validator.verifyDependencyDeployment({ /* ... */ });

// 7. Enable values on record types (automatic in step 5)
// Done!
```

---

## 📖 File Locations

### Core Libraries
- `scripts/lib/picklist-dependency-manager.js`
- `scripts/lib/global-value-set-manager.js`
- `scripts/lib/picklist-dependency-validator.js`

### Supporting Libraries
- `scripts/lib/unified-picklist-manager.js`
- `scripts/lib/picklist-describer.js`

### Documentation
- `docs/API_METHOD_SELECTION_GUIDE.md` - API selection framework
- `docs/PICKLIST_DEPENDENCY_PLAYBOOK.md` - Complete user guide
- `docs/GLOBAL_VALUE_SET_GUIDE.md` - GVS reference
- `PICKLIST_DEPENDENCY_IMPLEMENTATION.md` - Implementation summary

### Agents
- `agents/sfdc-field-analyzer.md` - Field analysis with dependencies
- `agents/sfdc-metadata-manager.md` - Deployment protocol
- `agents/sfdc-dependency-analyzer.md` - Dependency mapping

---

## ⚡ Performance Tips

| Operation | Time | Optimization |
|-----------|------|--------------|
| **Simple dependency** | 2-3 min | Use `validateBeforeDeploy: true` |
| **Complex dependency** | 5-8 min | Batch operations when possible |
| **With GVS** | +2 min/GVS | Create GVS first, then fields |
| **Validation** | 20-40 sec | Cache metadata between operations |

---

## 🔑 Key Concepts

**controllingField**: Attribute that references the controlling field
**valueSettings**: Array that defines the dependency matrix
**dependencyMatrix**: Object mapping controlling values to dependent values
**orphaned values**: Dependent values with no controlling value mappings
**circular dependency**: A controls B, B controls A (not allowed)
**Global Value Set**: Reusable picklist value collection

---

## 💡 Best Practices

1. **Always validate** before deployment
2. **Test in sandbox** first (dependencies are complex)
3. **Use atomic deployments** (field + record types together)
4. **Document business logic** in dependency matrix
5. **Check for circular dependencies** with validator
6. **Monitor for orphaned values** (validator warns)
7. **Back up metadata** before modifications (automatic)

---

## 📞 Need Help?

- **Read**: `docs/PICKLIST_DEPENDENCY_PLAYBOOK.md`
- **Check**: `docs/API_METHOD_SELECTION_GUIDE.md`
- **Review**: `PICKLIST_DEPENDENCY_IMPLEMENTATION.md`
- **Test**: Start with sandbox, simple 2→4 value dependency

---

**Version**: 1.0.0 | **Last Updated**: October 2025
