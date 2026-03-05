# Permission Sets Quick Reference Guide

Quick reference for creating production-ready Salesforce permission sets with the Permission Sets Management System (v3.50.0).

## Command Quick Start

```bash
# Create permission set (interactive wizard)
/create-permission-set

# Or with parameters
/create-permission-set --name Sales_Manager --label "Sales Manager" --template sales-user --tier 2
```

## Templates (10 Available Across 3 Categories)

### Basic (2 templates)
- **read-only-base** - Read-only access to standard objects
  - Use case: Reporting analysts, external consultants
  - Objects: Account, Contact, Opportunity, Lead, Case (read-only)
  - System Permissions: ApiEnabled, RunReports

- **standard-user** - Standard CRUD access
  - Use case: Typical users needing basic access
  - Objects: Account, Contact, Opportunity, Lead (CRUD)
  - System Permissions: ApiEnabled, ConvertLeads

### Role-Based (2 templates)
- **sales-user** - Sales Cloud comprehensive access
  - Use case: Sales representatives
  - Objects: Account, Contact, Opportunity, Lead, Quote (CRUD)
  - System Permissions: ApiEnabled, ConvertLeads, ViewAllForecasts

- **service-agent** - Service Cloud comprehensive access
  - Use case: Customer support agents
  - Objects: Case, Contact, Account, Solution, Knowledge (CRUD)
  - System Permissions: ApiEnabled, ManageCases

### Specialized (1 template)
- **api-integration** - API-only integration user access
  - Use case: System integrations
  - System Permissions: ApiEnabled only (no UI access)
  - Security: OAuth 2.0 recommended, IP restrictions required

## Two-Tier Architecture

### Tier 1: Foundational Permission Sets
**Purpose**: Object-specific CRUD and FLS

**Naming Convention**: `<SecurityLevel>_<Object>_<AccessType>`

**Examples**:
- `Standard_Account_Read` - Read-only access to Account
- `Standard_Account_Edit` - Edit access to Account
- `Restricted_Opportunity_View` - Restricted view of Opportunity
- `Sensitive_Contact_Edit` - Edit access to Contact with PII

**Benefits**:
- Reusable across roles
- Consistent access patterns
- Easy to maintain
- Clear audit trail

### Tier 2: Composed/Role-Based Permission Sets
**Purpose**: Business role definitions

**Naming Convention**: `<Role>_<Department>` or `<Role>_<Function>`

**Examples**:
- `Sales_Manager` - Composes Standard_Account_Edit + Standard_Opportunity_Edit + Manager permissions
- `Support_Agent` - Composes Standard_Case_Edit + Standard_Contact_View + Support tools
- `Finance_Analyst` - Composes read-only access + reporting + financial data access
- `Marketing_Admin` - Composes Marketing Cloud access + Campaign management

**Benefits**:
- Business-aligned naming
- Composes Tier 1 sets
- Role-specific permissions
- Reduces duplication

### When to Use Which Tier

**Use Tier 1 when**:
- Creating foundational object access
- Defining standard FLS patterns
- Building reusable permission blocks
- Starting permission set library

**Use Tier 2 when**:
- Defining business roles
- Combining multiple Tier 1 sets
- Adding role-specific permissions
- Complexity > 0.7

## CRUD Notation

### Object Permissions

| Letter | Permission | Description |
|--------|-----------|-------------|
| **C** | Create | Can create new records |
| **R** | Read | Can view records (REQUIRED for C/E/D) |
| **E** (or U) | Edit/Update | Can edit existing records |
| **D** | Delete | Can delete records |
| **V** | ViewAllRecords | Can view all records (bypasses sharing) |
| **M** | ModifyAllRecords | Can modify all records (bypasses sharing) |

**Examples**:
- `CRED` - Full access (Create, Read, Edit, Delete)
- `R` - Read-only
- `RE` - Read and Edit
- `CRE` - Create, Read, Edit (no Delete)

### Field-Level Security (FLS)

| Letter | Permission | Description |
|--------|-----------|-------------|
| **R** | Readable | Can view field value |
| **E** | Editable | Can edit field value (R required) |

**Examples**:
- `RE` - Read and Edit
- `R` - Read-only

**FLS Rules**:
- Edit permission requires Read permission
- Object permission required for field permission
- Read permission on object doesn't grant field visibility

## Complexity Scoring (0.0-1.0)

### Formula

```
Score = (objects × 0.05) + (fields × 0.02) + (system_perms × 0.10) +
        (apps × 0.05) + (apex_classes × 0.03) + (vf_pages × 0.03) +
        (custom_perms × 0.10) + (record_types × 0.05) +
        (layouts × 0.02) + (tabs × 0.02)

Caps per segment:
- objectPermissions: 0.30 (max 6 objects without warning)
- fieldPermissions: 0.30 (max 15 fields without warning)
- userPermissions: 0.50 (max 5 system perms without warning)
```

### Thresholds

- **0.0-0.3 (Simple)**: Direct deployment recommended
  - 1-5 objects, few fields
  - 0-2 system permissions
  - Example: Read-only access to single object

- **0.3-0.7 (Moderate)**: Segmented approach recommended
  - 6-15 objects, moderate fields
  - 3-5 system permissions
  - Example: Standard sales user access

- **0.7-1.0 (Complex)**: Two-tier refactoring or segmentation specialist
  - 16+ objects, extensive fields
  - 6+ system permissions
  - Example: System administrator permissions

## Segment-by-Segment Workflow (11 Segments)

For complex permission sets (complexity ≥ 0.7), use segmented approach:

| Segment | Content | Validation |
|---------|---------|------------|
| 1. Metadata | API name, label, description, tier | Naming conventions, tier designation |
| 2. Object Permissions | CRUD permissions per object | CRUD consistency (R required for C/E/D) |
| 3. Field Permissions | FLS per field | Object permission exists, R required for E |
| 4. System Permissions | API, ViewAllData, etc. | High-risk permission warnings |
| 5. Application Visibility | App access, default app | App exists in org |
| 6. Apex Class Access | Apex class permissions | Class exists in org |
| 7. Visualforce Page Access | VF page permissions | Page exists in org |
| 8. Custom Permissions | Custom permission access | Custom permission exists |
| 9. Record Type Visibilities | Record type access, defaults | Record type exists |
| 10. Layout Assignments | Layout assignments per record type | Layout exists |
| 11. Tab Settings | Tab visibility | Tab exists |

## High-Risk System Permissions

These permissions require additional justification and approval:

| Permission | Risk Level | Impact | Approval Required |
|-----------|-----------|--------|-------------------|
| **ModifyAllData** | 🔴 Critical | Unrestricted data modification (bypasses all sharing rules) | Security team + Manager |
| **ViewAllData** | 🟠 High | Unrestricted data access (bypasses all sharing rules) | Security team + Manager |
| **ManageUsers** | 🟠 High | User management capabilities | Security team |
| **ModifyMetadata** | 🟠 High | Metadata modification capabilities | Architecture team |
| **EditReadOnlyFields** | 🟡 Medium | Override read-only field protection | Manager |
| **ViewSetup** | 🟡 Medium | View setup and configuration | Manager |

**Approval Process**:
1. Submit access request with business justification
2. Security team review
3. Manager approval
4. Document in permission set description
5. Time-limited access (review every 90 days)

## Anti-Patterns (5 Types)

### 1. Permission Bloat
**Problem**: 25+ object permissions in single set (complexity > 0.7)
**Detection**: Object count exceeds threshold
**Fix**: Split into Tier 1 foundational sets + Tier 2 composed set

### 2. Overly Permissive
**Problem**: ModifyAllData/ViewAllData granted without justification
**Detection**: High-risk permission detection
**Fix**: Document justification, get security team approval, or remove permission

### 3. Inconsistent FLS
**Problem**: Edit access on Account but read-only on Opportunity (child)
**Detection**: Parent-child relationship analysis
**Fix**: Grant consistent access across related objects

### 4. Missing Dependencies
**Problem**: Field permission without object permission
**Detection**: Object permission validation
**Fix**: Add object permission (minimum Read access)

### 5. Redundancy
**Problem**: Duplicate permissions across sets
**Detection**: Cross-set permission analysis
**Fix**: Consolidate into Tier 1 foundational sets

## Object Permission Examples

### Read-Only Access
```xml
<objectPermissions>
    <allowCreate>false</allowCreate>
    <allowDelete>false</allowDelete>
    <allowEdit>false</allowEdit>
    <allowRead>true</allowRead>
    <modifyAllRecords>false</modifyAllRecords>
    <object>Account</object>
    <viewAllRecords>false</viewAllRecords>
</objectPermissions>
```

### Full CRUD Access
```xml
<objectPermissions>
    <allowCreate>true</allowCreate>
    <allowDelete>true</allowDelete>
    <allowEdit>true</allowEdit>
    <allowRead>true</allowRead>
    <modifyAllRecords>false</modifyAllRecords>
    <object>Opportunity</object>
    <viewAllRecords>false</viewAllRecords>
</objectPermissions>
```

### View All + Modify All (High Risk)
```xml
<objectPermissions>
    <allowCreate>true</allowCreate>
    <allowDelete>true</allowDelete>
    <allowEdit>true</allowEdit>
    <allowRead>true</allowRead>
    <modifyAllRecords>true</modifyAllRecords>  <!-- ⚠️ Bypasses sharing -->
    <object>Account</object>
    <viewAllRecords>true</viewAllRecords>  <!-- ⚠️ Bypasses sharing -->
</objectPermissions>
```

## Field Permission Examples

### Read-Only Field
```xml
<fieldPermissions>
    <editable>false</editable>
    <field>Account.AnnualRevenue</field>
    <readable>true</readable>
</fieldPermissions>
```

### Editable Field
```xml
<fieldPermissions>
    <editable>true</editable>
    <field>Opportunity.Amount</field>
    <readable>true</readable>  <!-- Required for editable -->
</fieldPermissions>
```

## System Permission Examples

### Basic API Access
```xml
<userPermissions>
    <enabled>true</enabled>
    <name>ApiEnabled</name>
</userPermissions>
```

### High-Risk Permission with Justification
```xml
<!-- ⚠️ CRITICAL: Requires security team approval -->
<!-- Justification: ETL integration requires unrestricted access for nightly data sync -->
<!-- Approved by: Security Team (2025-01-15) -->
<!-- Review date: 2025-04-15 (90 days) -->
<userPermissions>
    <enabled>true</enabled>
    <name>ModifyAllData</name>
</userPermissions>
```

## CLI Commands

### Permission Batch Manager

```bash
# Create multiple permission sets from configuration
node scripts/lib/permission-batch-manager.js create --config batch-config.json

# Validate all permission sets (checks two-tier architecture)
node scripts/lib/permission-batch-manager.js validate --permission-sets ./force-app/main/default/permissionsets

# Deploy permission sets (Tier 1 first, then Tier 2)
node scripts/lib/permission-batch-manager.js deploy --org dev-org --permission-sets ./force-app/main/default/permissionsets

# Assign permission sets to users
node scripts/lib/permission-batch-manager.js assign --org dev-org --config assignments.json
```

### Permission Complexity Calculator

```bash
# Calculate complexity for a single permission set
node scripts/lib/permission-complexity-calculator.js calculate --file Sales_Manager.permissionset-meta.xml

# Get breakdown by permission type
node scripts/lib/permission-complexity-calculator.js breakdown --file Sales_Manager.permissionset-meta.xml

# Get recommendations
node scripts/lib/permission-complexity-calculator.js recommend --file Sales_Manager.permissionset-meta.xml
```

### Permission Creator

```bash
# Create from template
node scripts/lib/permission-creator.js from-template \
  --template sales-user \
  --name Sales_Representative \
  --output ./permissionsets

# Create from scratch
node scripts/lib/permission-creator.js create \
  --name Custom_Access \
  --label "Custom Access" \
  --description "Custom access for special use case" \
  --objects "Account:CRED,Opportunity:CRED" \
  --fields "Account.AnnualRevenue:RE" \
  --system-perms "ApiEnabled,ConvertLeads" \
  --output ./permissionsets
```

## Routing Decision Tree

```
Permission Set Creation Request
├─ Simple (< 0.3)?
│  ├─ YES → Use permission-creator.js directly
│  └─ NO → Continue
├─ Moderate (0.3-0.7)?
│  ├─ YES → Use /create-permission-set wizard (segmented)
│  └─ NO → Continue
└─ Complex (≥ 0.7)?
   └─ YES → Use two-tier refactoring or delegate to permission-segmentation-specialist
```

## Best Practices Checklist

- [ ] Naming follows conventions (Tier 1: `SecurityLevel_Object_AccessType`, Tier 2: `Role_Department`)
- [ ] Label is human-readable (max 80 characters)
- [ ] Description is comprehensive (explains purpose and use case)
- [ ] CRUD consistency maintained (Read required for Create/Edit/Delete)
- [ ] Field permissions have object permissions
- [ ] Read required for Edit on all field permissions
- [ ] High-risk permissions documented with justification
- [ ] Tier 2 sets have Tier 1 dependencies deployed
- [ ] Complexity < 0.7 (or two-tier architecture used)
- [ ] Tested in sandbox before production deployment
- [ ] Documented in org-specific runbook

## Common Errors & Solutions

### Error: "Permission set name already exists"
**Cause**: Duplicate permission set name
**Solution**: Check for existing permission set in org, rename, or merge

### Error: "Object not found in target org"
**Cause**: Object doesn't exist in org
**Solution**: Verify object API name, ensure object deployed, or remove from permission set

### Error: "Field permission without object permission"
**Cause**: Field permission granted without object access
**Solution**: Add object permission (minimum Read access)

### Error: "Invalid cross reference id"
**Cause**: Referenced metadata (app, class, page) doesn't exist
**Solution**: Deploy dependent metadata first, or remove invalid references

## Security Considerations

### Sensitive Field Classification

Prompt for justification when accessing:
- **PII**: SSN, Date of Birth, Passport, Driver's License
- **Financial**: Bank Account, Credit Card, Salary, Commission
- **Health**: Medical Records, Insurance, Health Conditions
- **Confidential**: Performance Reviews, Background Checks, Legal Documents

### Principle of Least Privilege

Grant minimum permissions needed:
1. Start with read-only access
2. Add edit access only where needed
3. Grant create/delete only for specific use cases
4. Avoid ViewAllRecords/ModifyAllRecords unless absolutely necessary
5. Document justification for all high-risk permissions

### Regular Review Schedule

- **Tier 1 sets**: Review annually
- **Tier 2 sets**: Review quarterly
- **High-risk permissions**: Review every 90 days
- **Integration user permissions**: Review with each integration change

## Integration with Living Runbook System

All permission set operations are automatically captured:

- **Captured Data**: Template used, tier, complexity score, anti-patterns detected, deployment outcome
- **Synthesis**: Common patterns, access requirements, fragmentation issues
- **Usage**: Future operations reference historical context for org-specific insights

## Related Documentation

- **Full Agent Documentation**: `agents/permission-orchestrator.md`, `agents/permission-segmentation-specialist.md`
- **Command Documentation**: `commands/create-permission-set.md`
- **Template Library**: `templates/permission-sets/`
- **Order of Operations**: `config/order-of-operations-v3.50.json`
- **Salesforce Docs**: [Permission Sets Developer Guide](https://developer.salesforce.com/docs/atlas.en-us.securityImplGuide.meta/securityImplGuide/perm_sets_overview.htm)

---

**Version**: 3.50.0
**Last Updated**: 2025-01-24
