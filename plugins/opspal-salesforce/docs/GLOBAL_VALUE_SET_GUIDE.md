# Global Value Set Management Guide
**Salesforce Global Picklists via Tooling API**

**Version**: 1.0.0
**Last Updated**: October 2025

---

## Table of Contents

1. [Introduction](#introduction)
2. [When to Use Global Value Sets](#when-to-use-global-value-sets)
3. [Creating Global Value Sets](#creating-global-value-sets)
4. [Modifying Global Value Sets](#modifying-global-value-sets)
5. [Using Global Value Sets with Dependencies](#using-global-value-sets-with-dependencies)
6. [Migration Strategies](#migration-strategies)
7. [Best Practices](#best-practices)
8. [API Reference](#api-reference)

---

## Introduction

### What Are Global Value Sets?

**Global Value Sets** (also called Global Picklists) are reusable picklist value collections that can be shared across multiple objects and fields in Salesforce. Instead of defining picklist values separately for each field, you define them once in a Global Value Set and reference that set from multiple fields.

**Example**:
- Create Global Value Set "Industries" with values: Technology, Finance, Healthcare
- Reference it from:
  - Account.Industry
  - Lead.Industry
  - Opportunity.Industry_Focus__c
  - Contact.Company_Industry__c

**Benefits**:
- **Centralized Management**: Update values in one place, all fields update
- **Consistency**: Same values across all objects (prevents "Tech" vs "Technology" issues)
- **Easier Maintenance**: Add/deactivate values globally
- **Translation Support**: Translate labels once, applies everywhere
- **Governance**: Single source of truth for standard values

---

## When to Use Global Value Sets

### Good Use Cases ✅

**1. Standard Classifications**
- Industries (Technology, Finance, Healthcare, etc.)
- Countries/Regions (standardized lists)
- Product Categories (Software, Hardware, Services)
- Account Stages (Prospect, Customer, Partner)
- Priority Levels (Critical, High, Medium, Low)

**2. Frequently Reused Values**
- Values used on 3+ objects
- Company-wide standards
- Regulatory compliance categories
- Status values (Active, Inactive, Suspended)

**3. Multi-Language Environments**
- Values need translation
- Global operations with local labels
- Multilingual support required

### Poor Use Cases ❌

**1. Object-Specific Values**
- Values unique to one object
- Highly specialized categories
- Rarely used or one-off fields

**2. Frequently Changing Values**
- Dynamic values that change often
- Context-specific choices
- User-customizable options

**3. Small, Simple Picklists**
- 2-3 values that won't be reused
- Quick prototypes or temporary fields

---

## Creating Global Value Sets

### Method 1: Via GlobalValueSetManager (Recommended)

```javascript
const { GlobalValueSetManager } = require('./scripts/lib/global-value-set-manager');

const manager = new GlobalValueSetManager({ org: 'myorg' });

// Create new Global Value Set
const result = await manager.createGlobalValueSet({
    fullName: 'Industries',              // API name (no spaces, alphanumeric + underscores)
    masterLabel: 'Industries',           // Display name
    description: 'Standard industry classifications for all objects',
    sorted: false,                       // true = alphabetical, false = custom order
    values: [
        {
            fullName: 'Technology',      // API name for value
            label: 'Technology',         // Display label
            isActive: true,              // Active = visible to users
            default: false,              // Default selection
            color: null                  // Optional color (for certain picklist types)
        },
        {
            fullName: 'Finance',
            label: 'Financial Services',
            isActive: true,
            default: false
        },
        {
            fullName: 'Healthcare',
            label: 'Healthcare & Life Sciences',
            isActive: true,
            default: false
        }
    ]
});

console.log('Created Global Value Set:', result.id);
```

---

### Method 2: Via Tooling API (Advanced)

**Direct Tooling API POST** (for advanced users):

```bash
# Create Global Value Set via Tooling API
sf data create record --sobject GlobalValueSet \
  --values "FullName=Industries Metadata={masterLabel:'Industries',customValue:[{fullName:'Technology',label:'Technology',isActive:true}]}" \
  --target-org myorg \
  --use-tooling-api
```

**Not recommended** - use `GlobalValueSetManager` instead for automatic error handling and validation.

---

## Modifying Global Value Sets

### Adding New Values

```javascript
const manager = new GlobalValueSetManager({ org: 'myorg' });

// Add values to existing Global Value Set
const result = await manager.addValuesToGlobalSet({
    fullName: 'Industries',
    valuesToAdd: [
        { fullName: 'Retail', label: 'Retail & E-Commerce', isActive: true },
        { fullName: 'Manufacturing', label: 'Manufacturing', isActive: true }
    ]
});

console.log(`Added ${result.valuesAdded} values`);
console.log(`Total values now: ${result.totalValues}`);
```

**Important**: `addValuesToGlobalSet()` automatically:
1. Fetches existing values
2. Merges with new values
3. Performs full replacement update (required by Tooling API)

---

### Updating Values (Full Replacement)

```javascript
const manager = new GlobalValueSetManager({ org: 'myorg' });

// Update Global Value Set (full replacement)
const result = await manager.updateGlobalValueSet({
    fullName: 'Industries',
    masterLabel: 'Industries (Updated)',
    description: 'Updated description',
    sorted: true,  // Change sort order
    values: [
        // MUST include ALL values (existing + new + modified)
        { fullName: 'Technology', label: 'Technology & Software', isActive: true },
        { fullName: 'Finance', label: 'Finance', isActive: true },
        { fullName: 'Healthcare', label: 'Healthcare', isActive: true },
        { fullName: 'Retail', label: 'Retail', isActive: true }
    ]
});
```

⚠️ **Warning**: `updateGlobalValueSet()` performs **full replacement**. Any values not included will be **lost**. Use `addValuesToGlobalSet()` for safer incremental updates.

---

### Deactivating Values

```javascript
const manager = new GlobalValueSetManager({ org: 'myorg' });

// Deactivate values (preserves historical data)
const result = await manager.deactivateGlobalSetValues({
    fullName: 'Industries',
    valuesToDeactivate: ['OldIndustry1', 'OldIndustry2']
});

console.log(`Deactivated ${result.valuesDeactivated} values`);
```

**Why Deactivate Instead of Delete**:
- Preserves historical records
- Prevents data loss
- Allows reactivation if needed
- Salesforce best practice

---

## Using Global Value Sets with Dependencies

### Complete Example: Dependency with Global Value Sets

```javascript
const { GlobalValueSetManager } = require('./scripts/lib/global-value-set-manager');
const { PicklistDependencyManager } = require('./scripts/lib/picklist-dependency-manager');

async function createDependencyWithGVS() {
    const orgAlias = 'myorg-sandbox';

    // Step 1: Create Global Value Sets
    const gvsManager = new GlobalValueSetManager({ org: orgAlias });

    // Controlling field GVS
    console.log('Creating Industries Global Value Set...');
    await gvsManager.createGlobalValueSet({
        fullName: 'Industries',
        masterLabel: 'Industries',
        description: 'Standard industry values',
        values: [
            { fullName: 'Technology', label: 'Technology' },
            { fullName: 'Finance', label: 'Finance' },
            { fullName: 'Healthcare', label: 'Healthcare' }
        ]
    });

    // Dependent field GVS
    console.log('Creating Account Types Global Value Set...');
    await gvsManager.createGlobalValueSet({
        fullName: 'AccountTypes',
        masterLabel: 'Account Types',
        description: 'Account type categories',
        values: [
            { fullName: 'SaaS', label: 'SaaS' },
            { fullName: 'Hardware', label: 'Hardware' },
            { fullName: 'Banking', label: 'Banking' },
            { fullName: 'Insurance', label: 'Insurance' },
            { fullName: 'Provider', label: 'Provider' }
        ]
    });

    // Step 2: Create fields referencing Global Value Sets
    // (Done via Metadata API - see separate workflow)

    // Step 3: Create dependency
    console.log('Creating dependency...');
    const depManager = new PicklistDependencyManager({ org: orgAlias });

    const result = await depManager.createDependency({
        objectName: 'Account',
        controllingFieldApiName: 'Industry',  // References 'Industries' GVS
        dependentFieldApiName: 'Account_Type__c',  // References 'AccountTypes' GVS
        dependencyMatrix: {
            'Technology': ['SaaS', 'Hardware'],
            'Finance': ['Banking', 'Insurance'],
            'Healthcare': ['Provider']
        },
        recordTypes: 'all'
    });

    console.log('✅ Complete! Deployment ID:', result.deploymentId);
}
```

---

## Migration Strategies

### Migrating from Field-Specific to Global Value Set

**Scenario**: You have Account.Industry with field-specific values, want to migrate to Global Value Set

**Steps**:

```javascript
const { GlobalValueSetManager } = require('./scripts/lib/global-value-set-manager');

async function migrateToGlobalValueSet() {
    const orgAlias = 'myorg-sandbox';

    // Step 1: Export current field values
    console.log('Step 1: Analyzing current field values...');
    const describeCommand = `sf sobject describe --sobject Account --target-org ${orgAlias} --json`;
    // Parse result to get current Industry values

    const currentValues = [
        { fullName: 'Technology', label: 'Technology' },
        { fullName: 'Finance', label: 'Finance' }
        // ... all current values
    ];

    // Step 2: Create Global Value Set with those values
    console.log('Step 2: Creating Global Value Set...');
    const gvsManager = new GlobalValueSetManager({ org: orgAlias });

    await gvsManager.createGlobalValueSet({
        fullName: 'Industries',
        masterLabel: 'Industries',
        description: 'Migrated from Account.Industry field-specific values',
        values: currentValues
    });

    // Step 3: Update field metadata to reference Global Value Set
    console.log('Step 3: Updating field to reference Global Value Set...');
    // This requires metadata deployment:
    // Change field XML from:
    //   <valueSet><valueSetDefinition>...</valueSetDefinition></valueSet>
    // To:
    //   <valueSet><valueSetName>Industries</valueSetName></valueSet>

    console.log('✅ Migration complete!');
    console.log('Note: Existing records are not affected');
    console.log('Note: Existing dependencies are preserved');
}
```

**Important**:
- Existing records keep their values
- Dependencies still work (controllingField references field name, not GVS)
- Translation data is preserved

---

## Best Practices

### 1. Naming Conventions

**Good Names**:
- `Industries` (clear, plural)
- `AccountTypes` (descriptive)
- `PriorityLevels` (specific)
- `ProductCategories` (unambiguous)

**Bad Names**:
- `Values` (too generic)
- `List1` (not descriptive)
- `Picklist` (ambiguous)
- `Stuff` (unprofessional)

**Pattern**: Use PascalCase (no spaces), plural form, descriptive

---

### 2. Value Naming

**Good Values**:
- `Technology` (clear)
- `SaaS` (industry standard acronym)
- `North_America` (underscore for multi-word)

**Bad Values**:
- `Tech` (ambiguous abbreviation)
- `Type 1` (not descriptive)
- `NA` (unclear acronym)

**Pattern**: Full words, industry-standard acronyms OK, underscores for spaces

---

### 3. Documentation

```javascript
// Document the purpose and usage
await gvsManager.createGlobalValueSet({
    fullName: 'Industries',
    masterLabel: 'Industries',
    description: 'Standard industry classifications. Used on Account, Lead, Opportunity. Based on NAICS codes. Updated quarterly.',
    values: [ /* ... */ ]
});
```

**Include in description**:
- Purpose of the value set
- Which objects/fields use it
- Update frequency
- Source of values (if applicable)

---

### 4. Version Control

**Track Global Value Set changes**:
- Store value list in version control
- Document when values are added/removed
- Track business justification for changes

```javascript
// Example: Track in changelog
/*
 * Industries Global Value Set - Changelog
 *
 * 2025-10-25: Added "Retail" (new market segment)
 * 2025-09-15: Deactivated "OldIndustry" (category retired)
 * 2025-08-01: Created initial set with 10 values
 */
```

---

### 5. Deactivate, Don't Delete

```javascript
// ✅ GOOD: Deactivate inactive values
await manager.deactivateGlobalSetValues({
    fullName: 'Industries',
    valuesToDeactivate: ['OldValue']
});

// ❌ BAD: Remove from value list entirely
// This loses historical data and can break reports
```

**Why**: Historical records preserve their values, reports continue to work, data integrity maintained

---

## Advanced Topics

### Global Value Sets in Managed Packages

**If distributing in managed packages**:
- Global Value Sets are versioned
- Can't remove values in newer versions (only deactivate)
- Subscribers can add their own values
- Use namespace prefix for API names

```javascript
await gvsManager.createGlobalValueSet({
    fullName: 'MyNamespace__Industries',  // Include namespace
    masterLabel: 'Industries',
    values: [ /* ... */ ]
});
```

---

### Performance Considerations

**Global Value Sets are fast**:
- Tooling API operations: 5-20 seconds
- No deployment wait time (unlike Metadata API)
- Changes apply immediately

**When you have many fields**:
- Updating a Global Value Set is faster than updating 10 individual fields
- Change propagates automatically to all referencing fields

---

### Limitations

1. **Full Replacement Required**:
   - Tooling API requires full metadata replacement
   - Can't do partial updates
   - Use `addValuesToGlobalSet()` which handles this automatically

2. **Can't Delete Values in Production**:
   - Can only deactivate
   - Deletion would affect historical records
   - Use isActive = false instead

3. **Translation Complexity**:
   - Translating Global Value Set affects all fields
   - Consider impact across all objects

---

## API Reference

### GlobalValueSetManager

#### createGlobalValueSet(params)

**Parameters**:
```javascript
{
    fullName: string,        // API name (required)
    masterLabel: string,     // Display label (required)
    description: string,     // Description (optional)
    sorted: boolean,         // Alphabetical sort (optional, default: false)
    values: Array<{          // Values (required)
        fullName: string,    // Value API name
        label: string,       // Value label
        isActive: boolean,   // Active flag (default: true)
        default: boolean,    // Default selection (default: false)
        color: string        // Color (optional, hex code)
    }>
}
```

**Returns**:
```javascript
{
    success: boolean,
    id: string,              // Global Value Set ID (0Nt prefix)
    fullName: string,
    masterLabel: string,
    valuesCreated: number
}
```

---

#### addValuesToGlobalSet(params)

**Parameters**:
```javascript
{
    fullName: string,        // Global Value Set API name (required)
    valuesToAdd: Array<{     // New values (required)
        fullName: string,
        label: string,
        isActive: boolean,
        default: boolean
    }>
}
```

**Returns**:
```javascript
{
    success: boolean,
    fullName: string,
    valuesAdded: number,     // Count of new values added
    totalValues: number,     // Total values in set after addition
    newValues: string[]      // API names of values added
}
```

---

#### updateGlobalValueSet(params)

**Parameters**:
```javascript
{
    fullName: string,        // Global Value Set API name (required)
    values: Array<Object>,   // COMPLETE list of values (required)
    masterLabel: string,     // Master label (required)
    description: string,     // Description (optional)
    sorted: boolean          // Sort flag (optional)
}
```

⚠️ **Warning**: This performs full replacement. Any values not included will be lost.

---

#### deactivateGlobalSetValues(params)

**Parameters**:
```javascript
{
    fullName: string,            // Global Value Set API name (required)
    valuesToDeactivate: string[] // Value API names to deactivate (required)
}
```

**Returns**:
```javascript
{
    success: boolean,
    fullName: string,
    valuesDeactivated: number,
    deactivatedValues: string[]
}
```

---

#### globalValueSetExists(fullName, orgAlias)

**Parameters**:
- `fullName` - Global Value Set API name
- `orgAlias` - Org alias

**Returns**: `boolean` (true if exists)

---

## Examples

### Example 1: Simple Global Value Set

```javascript
const { GlobalValueSetManager } = require('./scripts/lib/global-value-set-manager');

const manager = new GlobalValueSetManager({ org: 'myorg' });

// Create priority levels
await manager.createGlobalValueSet({
    fullName: 'PriorityLevels',
    masterLabel: 'Priority Levels',
    description: 'Standard priority classifications for Cases, Tasks, and Projects',
    sorted: false,  // Keep custom order (Critical first)
    values: [
        { fullName: 'Critical', label: 'Critical', isActive: true, color: '#FF0000' },
        { fullName: 'High', label: 'High', isActive: true, color: '#FFA500' },
        { fullName: 'Medium', label: 'Medium', isActive: true, default: true }, // Default
        { fullName: 'Low', label: 'Low', isActive: true, color: '#00FF00' }
    ]
});
```

---

### Example 2: Incremental Updates

```javascript
const manager = new GlobalValueSetManager({ org: 'myorg' });

// Year 1: Create initial set
await manager.createGlobalValueSet({
    fullName: 'ProductCategories',
    masterLabel: 'Product Categories',
    values: [
        { fullName: 'Software', label: 'Software' },
        { fullName: 'Hardware', label: 'Hardware' }
    ]
});

// Year 2: Add new category
await manager.addValuesToGlobalSet({
    fullName: 'ProductCategories',
    valuesToAdd: [
        { fullName: 'Services', label: 'Services' }
    ]
});
// Now has: Software, Hardware, Services

// Year 3: Retire old category
await manager.deactivateGlobalSetValues({
    fullName: 'ProductCategories',
    valuesToDeactivate: ['Hardware']
});
// Now has: Software (active), Hardware (inactive), Services (active)
```

---

### Example 3: Bulk Value Creation

```javascript
const manager = new GlobalValueSetManager({ org: 'myorg' });

// Create countries Global Value Set (195 values)
const countries = [
    'United States', 'Canada', 'Mexico',
    'United Kingdom', 'Germany', 'France',
    // ... 189 more countries
];

const countryValues = countries.map(country => ({
    fullName: country.replace(/\s+/g, '_'),  // "United States" → "United_States"
    label: country,
    isActive: true
}));

await manager.createGlobalValueSet({
    fullName: 'Countries',
    masterLabel: 'Countries',
    description: 'ISO country list',
    sorted: true,  // Alphabetical for easy scanning
    values: countryValues
});
```

---

## Troubleshooting

### Error: "Global Value Set already exists"

**Cause**: Trying to create a Global Value Set with a name that already exists

**Solution**:
```javascript
// Check if exists first
const exists = await manager.globalValueSetExists('Industries', orgAlias);

if (exists) {
    // Add values instead of creating
    await manager.addValuesToGlobalSet({
        fullName: 'Industries',
        valuesToAdd: newValues
    });
} else {
    // Create new
    await manager.createGlobalValueSet({
        fullName: 'Industries',
        values: newValues
    });
}
```

---

### Error: "Cannot reference Global Value Set in field"

**Cause**: Field metadata deployed before Global Value Set exists

**Solution**:
```javascript
// Create Global Value Set FIRST
await gvsManager.createGlobalValueSet({
    fullName: 'Industries',
    values: [ /* ... */ ]
});

// THEN create field that references it
// Deploy field metadata with:
// <valueSet>
//     <valueSetName>Industries</valueSetName>
// </valueSet>
```

**Order matters**: Global Value Sets → Fields → Dependencies → Record Types

---

## Summary

### When to Use Global Value Sets

**Use GVS when**:
- Values are reused across 3+ fields
- You need centralized management
- Values are company-wide standards
- Multi-language support needed

**Use field-specific when**:
- Values are object-specific
- Only used on 1-2 fields
- Highly specialized or temporary

### Key Takeaways

1. **Global Value Sets** = Centralized picklist value management
2. Use **Tooling API** for all Global Value Set operations
3. **Full replacement** required for updates (use our libraries!)
4. **Deactivate**, don't delete values
5. Create Global Value Sets **before** fields that reference them
6. Compatible with **dependencies** (works seamlessly)

---

**Version**: 1.0.0
**Maintained By**: Salesforce Plugin Team
**Last Updated**: October 2025
