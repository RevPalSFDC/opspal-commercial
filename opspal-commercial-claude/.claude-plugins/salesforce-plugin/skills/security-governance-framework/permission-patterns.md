# Permission Set Design Patterns

## Two-Tier Architecture

### Tier 1: Foundational Permission Sets
Object-specific CRUD and FLS permissions.

**Naming Convention:**
```
<SecurityLevel>_<Object>_<AccessType>

Examples:
- Standard_Account_Edit
- Standard_Contact_View
- Premium_Opportunity_FullAccess
```

**Characteristics:**
- Reusable across roles
- Object-focused
- No system permissions
- Composable into Tier 2

### Tier 2: Composed Permission Sets
Business role definitions that compose Tier 1 sets.

**Naming Convention:**
```
<Role>_<Department>

Examples:
- Sales_Manager
- Support_Agent
- Marketing_Analyst
```

**Characteristics:**
- Role-focused
- Composes multiple Tier 1 sets
- Includes role-specific system permissions
- Assigned to users

## Permission Set Templates

### Basic Templates
1. **Read Only** - View access only
2. **Standard User** - Standard CRUD
3. **Power User** - Enhanced access

### Role-Based Templates
1. **Sales Rep** - Account, Contact, Opportunity access
2. **Sales Manager** - + Reports, Dashboards, Forecasts
3. **Support Agent** - Case, Knowledge, Service Console
4. **Marketing User** - Campaign, Lead, Email

### Specialized Templates
1. **Integration User** - API access, no UI
2. **Data Admin** - Import/Export capabilities
3. **Report Builder** - Report/Dashboard creation

## Complexity Calculation

```javascript
function calculateComplexity(permissionSet) {
    const score = (permissionSet.objects * 0.05) +
                  (permissionSet.fields * 0.02) +
                  (permissionSet.systemPerms * 0.10) +
                  (permissionSet.apps * 0.05) +
                  (permissionSet.apexClasses * 0.03) +
                  (permissionSet.vfPages * 0.03) +
                  (permissionSet.customPerms * 0.10) +
                  (permissionSet.recordTypes * 0.05) +
                  (permissionSet.layouts * 0.02) +
                  (permissionSet.tabs * 0.02);

    // Thresholds
    if (score < 0.3) return 'Simple';
    if (score < 0.7) return 'Moderate';
    return 'Complex';
}
```

## Routing Pattern

| Complexity | Score | Approach |
|------------|-------|----------|
| Simple | < 0.3 | Direct deployment |
| Moderate | 0.3-0.7 | Segmented approach |
| Complex | ≥ 0.7 | Two-tier refactoring or segmentation specialist |

## Anti-Patterns to Avoid

### 1. Permission Bloat
- Too many permissions in single set
- Solution: Break into Tier 1 components

### 2. Overly Permissive
- Granting more access than needed
- Solution: Principle of least privilege

### 3. Inconsistent FLS
- Mismatched field permissions
- Solution: Use templates

### 4. Missing Dependencies
- Object access without field access
- Solution: Validate before deploy

### 5. Redundancy
- Duplicate permissions across sets
- Solution: Use composition pattern

## Merge-Safe Operations

### Conflict Detection
```javascript
const conflictTypes = [
    'DUPLICATE_PERMISSION',
    'CONFLICTING_FLS',
    'INCOMPATIBLE_OBJECT_PERMS',
    'TAB_VISIBILITY_MISMATCH',
    'APP_ACCESS_CONFLICT',
    'SYSTEM_PERM_CONFLICT'
];

function detectConflicts(sourcePS, targetPS) {
    const conflicts = [];
    // Check each conflict type
    // Return list of conflicts with resolution options
    return conflicts;
}
```

### Idempotent Deployments
- Pre-deployment validation
- Conflict resolution before deploy
- Post-deployment verification
- Rollback capability
