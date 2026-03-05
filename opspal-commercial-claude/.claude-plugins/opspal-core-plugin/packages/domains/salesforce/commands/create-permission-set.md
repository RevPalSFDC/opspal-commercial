---
name: create-permission-set
description: Interactive wizard to create permission sets from templates with complexity tracking and segmentation support
category: Security & Permissions
version: 1.0.0
tags: [permission-set, security, fls, object-permissions, wizard, templates]
---

# Create Permission Set Command

Launch the interactive permission set creation wizard to generate production-ready permission sets with automatic complexity tracking and two-tier architecture support.

## What This Command Does

This command provides a guided, step-by-step wizard that:

1. **Discovers** available permission set templates (10 templates across 3 categories)
2. **Guides** you through configuration (objects, fields, system permissions)
3. **Generates** permission set XML with proper structure
4. **Validates** against Salesforce schema and best practices
5. **Tracks complexity** in real-time with recommendations
6. **Deploys** to your Salesforce org (optional)
7. **Documents** in Living Runbook System

## Usage

```bash
/create-permission-set
```

Or with parameters:
```bash
/create-permission-set --name Sales_Manager --template sales-user
```

## Interactive Wizard Flow

The wizard will guide you through these steps:

### Step 1: Permission Set Name and Type

- Enter the API name (e.g., Sales_Manager, Support_Agent)
- Validates naming conventions
- Choose tier: Tier 1 (Foundational) or Tier 2 (Composed/Role-Based)

### Step 2: Template Selection

- Browse 10 templates across 3 categories:
  - **Basic** (2): read-only-base, standard-user
  - **Role-Based** (2): sales-user, service-agent
  - **Specialized** (1): api-integration
- View template description and included permissions
- Select template to use or start from scratch

### Step 3: Metadata Configuration

- Label (human-readable name)
- Description (purpose and use case)
- License type (if needed)

### Step 4: Object Permissions

- Select objects to include
- Configure CRUD permissions (Create, Read, Edit, Delete)
- Set ViewAllRecords/ModifyAllRecords (with warnings)
- Real-time complexity tracking

### Step 5: Field Permissions (FLS)

- Select fields for included objects
- Configure Read/Edit access
- Security classification prompts for sensitive fields
- Complexity tracking continues

### Step 6: System Permissions

- Select system permissions (API Enabled, ViewAllData, etc.)
- High-risk permission warnings (ModifyAllData, ViewAllData)
- Approval requirements flagged

### Step 7: Additional Permissions

- Application visibility
- Apex class access
- Visualforce page access
- Custom permissions
- Record type visibility
- Layout assignments
- Tab settings

### Step 8: Complexity Review

- Overall complexity score (0.0-1.0)
- Breakdown by permission type
- Rating (Simple, Moderate, Complex)
- Recommendations (direct deploy, segmented, refactor to two-tier)

### Step 9: Validation

- Schema compliance check
- Object/field existence verification
- CRUD consistency validation
- FLS dependency validation
- Best practices review

### Step 10: Deployment (Optional)

- Save files to force-app/main/default
- Deploy to target org
- Verify deployment success
- Test with assignment to test user

## Examples

### Example 1: Create Basic Read-Only Permission Set

```bash
/create-permission-set

# Wizard prompts:
Name: Reporting_Analyst_Read
Tier: 1 (Foundational)
Template: read-only-base
Objects: Account, Contact, Opportunity, Lead, Case (all Read-only)
System Permissions: ApiEnabled, RunReports
Deploy Now? Yes

# Output:
✅ Created Reporting_Analyst_Read.permissionset-meta.xml
✅ Complexity: 0.25 (Simple)
✅ Deployed to dev-org
✅ Validation: PASSED
```

### Example 2: Create Role-Based Permission Set

```bash
/create-permission-set --template sales-user

# Wizard prompts:
Name: Sales_Representative
Label: Sales Representative
Description: Standard sales rep access to accounts, opportunities, leads
Customize Objects? Yes
  - Account: CRED ✓
  - Opportunity: CRED ✓
  - Lead: CRED ✓
  - Quote: CRE ✓
System Permissions: ApiEnabled, ConvertLeads
Deploy Now? No

# Output:
✅ Created Sales_Representative.permissionset-meta.xml
✅ Complexity: 0.45 (Moderate)
📁 Saved to force-app/main/default/permissionsets/
💡 Tip: Consider pairing with role hierarchy for team visibility
```

### Example 3: Create Complex Composed Permission Set (Tier 2)

```bash
/create-permission-set --tier 2

# Wizard prompts:
Name: Sales_Manager
Tier: 2 (Composed)
Base Permission Sets:
  - Standard_Account_Edit ✓
  - Standard_Opportunity_Edit ✓
  - Standard_Lead_Edit ✓
Additional Permissions:
  - Task (CR)
  - Event (CR)
  - System: ViewAllData (view only)

# Complexity Check:
Current: 0.68 (Moderate, approaching Complex threshold)
Recommendation: Acceptable for Tier 2 composed set

Deploy Now? Yes

# Output:
✅ Validated Tier 1 dependencies
✅ Created Sales_Manager.permissionset-meta.xml
✅ Complexity: 0.68 (Moderate)
✅ Deployed to dev-org
✅ Two-tier architecture maintained
```

### Example 4: Use Segmented Approach (High Complexity)

```bash
/create-permission-set

# Wizard prompts:
Name: Enterprise_Admin
Objects: 20 objects with CRED
System Permissions: ViewAllData, ModifyAllData

# Complexity Alert:
⚠️  Complexity: 0.85 (Complex)
🚨 RECOMMENDATION: Use segmented approach

Would you like to use segmentation? Yes

# Segmentation Workflow:
Starting Segment 1: Metadata
  Name: Enterprise_Admin ✓
  Label: Enterprise Administrator ✓
  Description: ... ✓
Segment 1 Complete (Complexity: 0.00)

Starting Segment 2: Object Permissions
  Adding Account (CRED) ... Complexity: 0.05
  Adding Opportunity (CRED) ... Complexity: 0.10
  ... (18 more objects)
  Segment 2 Complete (Complexity: 0.50)

Starting Segment 3: System Permissions
  ⚠️  ModifyAllData requires security team approval
  Document justification: [user enters justification]
  Segment 3 Complete (Complexity: 0.70)

Final Complexity: 0.70 (Complex, but segmented)
✅ All segments validated
✅ Ready for deployment
```

## Generated File Structure

```
force-app/main/default/
├── permissionsets/
│   └── PermissionSetName.permissionset-meta.xml
└── [metadata files]
```

## Two-Tier Architecture

### Tier 1: Foundational Permission Sets

**Purpose**: Object-specific CRUD and FLS

**Naming**: `<SecurityLevel>_<Object>_<AccessType>`

**Examples**:
- `Standard_Account_Read`
- `Standard_Account_Edit`
- `Restricted_Opportunity_View`
- `Sensitive_Contact_Edit`

**Benefits**:
- Reusable across roles
- Consistent access patterns
- Easy to maintain
- Clear audit trail

### Tier 2: Composed/Role-Based Permission Sets

**Purpose**: Business role definitions

**Naming**: `<Role>_<Department>` or `<Role>_<Function>`

**Examples**:
- `Sales_Manager`
- `Support_Agent`
- `Finance_Analyst`
- `Marketing_Admin`

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

## Complexity Tracking

### Complexity Calculation

```
Score = (objects × 0.05) + (fields × 0.02) + (system perms × 0.10) +
        (apps × 0.05) + (Apex classes × 0.03) + (VF pages × 0.03) +
        (custom perms × 0.10) + (record types × 0.05) +
        (layouts × 0.02) + (tabs × 0.02)
```

### Complexity Thresholds

- **0.0-0.3 (Simple)**: Straightforward permission set, direct deployment recommended
- **0.3-0.7 (Moderate)**: Consider segmented approach, review for optimization
- **0.7-1.0 (Complex)**: STRONGLY recommend two-tier architecture or segmentation

### Real-Time Feedback

```
Current Complexity: ██████░░░░ 0.65 (Moderate)

Breakdown:
- Object Permissions: 10 objects × 0.05 = 0.50
- Field Permissions: 25 fields × 0.02 = 0.50 (capped at 0.30)
- System Permissions: 2 perms × 0.10 = 0.20

⚠️ Approaching Complex threshold (0.70)
💡 Recommendation: Consider splitting into Tier 1 foundational sets
```

## Best Practices Validation

### Automatic Checks

**Metadata Segment**:
- ✅ Name follows convention
- ✅ Label is human-readable (max 80 chars)
- ✅ Description is comprehensive

**Object Permissions Segment**:
- ✅ CRUD consistency (if C/U/D, then R required)
- ✅ ViewAllRecords/ModifyAllRecords used sparingly
- ✅ Parent-child object access is consistent

**Field Permissions Segment**:
- ✅ Object permission exists for every field
- ✅ Read required for Edit
- ✅ Sensitive fields flagged for review

**System Permissions Segment**:
- ✅ High-risk permissions flagged (ModifyAllData, ViewAllData)
- ✅ API Access granted appropriately
- ✅ Custom permissions have clear purpose

### Anti-Pattern Detection

**1. Permission Bloat**:
```
❌ DETECTED: 25 object permissions in single set
💡 RECOMMENDATION: Split into Tier 1 foundational sets
```

**2. Overly Permissive**:
```
❌ DETECTED: ModifyAllData granted without justification
🚨 CRITICAL: Requires security team approval
```

**3. Inconsistent FLS**:
```
❌ DETECTED: Edit access on Account but read-only on Opportunity (child)
💡 RECOMMENDATION: Grant consistent access across related objects
```

**4. Missing Dependencies**:
```
❌ DETECTED: Field permission without object permission
🔧 FIX: Add Account (Read) object permission
```

## Command Options

```bash
/create-permission-set [OPTIONS]

Options:
  --name <name>              Permission set API name
  --label <label>            Human-readable label
  --description <desc>       Description
  --template <name>          Template name (read-only-base, sales-user, etc.)
  --tier <1|2>              Permission set tier (1=foundational, 2=composed)
  --objects <list>           Objects with CRUD (format: Object:CRUD,...)
  --fields <list>            Fields with access (format: Object.Field:Access,...)
  --system-perms <list>      System permissions
  --apps <list>              Applications to grant access
  --output <directory>       Output directory (default: force-app/main/default)
  --deploy                   Deploy immediately after generation
  --segmented                Use segmented approach
  --skip-validation          Skip validation checks
  --api-version <version>    API version (default: 62.0)
  --help                     Show this help message
```

## Template Registry

View all available templates:
```bash
/create-permission-set --list-templates
```

Output shows:
```
Basic (2 templates):
  - read-only-base: Read-only access to standard objects
  - standard-user: Standard CRUD access for typical users

Role-Based (2 templates):
  - sales-user: Sales Cloud comprehensive access
  - service-agent: Service Cloud comprehensive access

Specialized (1 template):
  - api-integration: API-only integration user access
```

## Security Considerations

### High-Risk Permissions

These permissions require additional justification and approval:

- **ModifyAllData**: Unrestricted data modification (bypasses sharing rules)
- **ViewAllData**: Unrestricted data access (bypasses sharing rules)
- **ManageUsers**: User management capabilities
- **ModifyMetadata**: Metadata modification capabilities
- **EditReadOnlyFields**: Override read-only field protection

**Approval Process**:
1. Submit access request with business justification
2. Security team review
3. Manager approval
4. Document in permission set description
5. Time-limited access (review every 90 days)

### Sensitive Fields

Prompts for justification when accessing:
- PII (SSN, Date of Birth, Passport)
- Financial (Bank Account, Credit Card, Salary)
- Health (Medical Records, Insurance)
- Confidential (Performance Reviews, Background Checks)

## Integration with Other Tools

### Living Runbook System

**Automatic Documentation**:
- Permission set creation logged
- Access patterns tracked
- Common permission combinations recorded
- Best practices synthesized

### Order of Operations Library

**Permission Set Dependencies**:
```json
{
  "operation": "create_permission_set",
  "dependencies": {
    "before": ["object_creation", "field_creation"],
    "after": ["profile_update", "user_assignment"],
    "parallel": ["other_permission_sets"]
  }
}
```

### Segmentation Support

For complex permission sets (complexity ≥ 0.7):
```bash
# Start segment
/permission-segment-start Sales_Manager --segment-type metadata

# Complete segment
/permission-segment-complete Sales_Manager --segment-type metadata

# List segments
/permission-segment-list Sales_Manager

# Deploy when all complete
/permission-segment-deploy Sales_Manager
```

## Troubleshooting

### "Permission set name already exists"

```
Error: Duplicate permission set name: Sales_Manager

Solution:
1. Check for existing permission set in org
2. Rename your new permission set
3. Or merge with existing set
```

### "Object not found in target org"

```
Error: Object 'CustomObject__c' does not exist

Solution:
1. Verify object API name (check for __c suffix)
2. Ensure object is deployed to target org
3. Remove invalid object from permission set
```

### "Field permission without object permission"

```
Error: Cannot grant field access without object access

Solution:
1. Add object permission (minimum Read access)
2. Or remove field permission
```

### "Complexity too high"

```
Warning: Complexity 0.85 exceeds recommended threshold

Solution:
1. Use segmented approach (wizard will offer)
2. Or refactor to two-tier architecture
3. Or continue with explicit justification
```

## Performance Considerations

### Deployment Times

- **Simple** (0.0-0.3): 5-10 seconds
- **Moderate** (0.3-0.7): 15-30 seconds
- **Complex** (0.7-1.0): 30-60 seconds

### Best Practices

- Start with templates (faster, validated)
- Use segmentation for complex sets
- Deploy Tier 1 sets in parallel
- Deploy Tier 2 sets after Tier 1
- Test in sandbox before production

## Related Commands

- `/assess-permissions` - Permission set fragmentation analysis
- `/permission-segment-start` - Start segmented creation
- `/permission-segment-complete` - Complete segment
- `/permission-segment-list` - List all segments

## Related Agents

- `permission-orchestrator` - Master orchestrator for permission operations
- `permission-segmentation-specialist` - Guided segmentation for complex sets
- `sfdc-security-admin` - Profile and role management
- `sfdc-state-discovery` - Org state analysis

## Additional Resources

- **Templates**: `.claude-plugins/opspal-core-plugin/packages/domains/salesforce/templates/permission-sets/`
- **Scripts**: `.claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/lib/permission-*.js`
- **Living Runbook**: `docs/runbooks/permission-sets/`
- **Salesforce Docs**: [Permission Sets Developer Guide](https://developer.salesforce.com/docs/atlas.en-us.securityImplGuide.meta/securityImplGuide/perm_sets_overview.htm)

---

**Note**: This command uses the permission set template library and segmentation system created in Phase 3. All templates are production-ready and follow Salesforce security best practices.
