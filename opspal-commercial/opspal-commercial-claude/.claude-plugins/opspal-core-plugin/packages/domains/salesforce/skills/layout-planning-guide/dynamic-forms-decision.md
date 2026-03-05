# Dynamic Forms vs fieldInstance Pattern Decision Guide

## Overview

Salesforce offers two approaches for organizing fields on Lightning Record Pages:

1. **Dynamic Forms** - Native Salesforce feature (when available)
2. **fieldInstance Pattern** - Universal approach using explicit field references

This guide helps you choose the right approach for your implementation.

---

## Quick Decision Matrix

| Criterion | Use Dynamic Forms | Use fieldInstance Pattern |
|-----------|-------------------|---------------------------|
| Org Edition | Enterprise, Unlimited, Developer | ALL editions (including Professional) |
| Object Type | Supported standard + custom | ALL objects |
| Visibility Rules | Per-field visibility needed | Section-level visibility sufficient |
| Performance | High-traffic pages | Standard traffic |
| Compatibility | Can accept feature limitations | Maximum compatibility required |
| Maintenance | Point-and-click preferred | Code-based deployment preferred |

---

## Complete Decision Tree

```
START: Choosing Layout Approach
│
├─ Q1: What Salesforce edition is the target org?
│  ├─ Professional Edition
│  │  └─ → USE fieldInstance Pattern (Dynamic Forms not available)
│  │
│  └─ Enterprise, Unlimited, or Developer Edition
│     └─ Continue to Q2
│
├─ Q2: Is the object supported for Dynamic Forms?
│  │
│  │  Supported Standard Objects (as of Winter '25):
│  │  - Account, Contact, Lead, Opportunity, Case
│  │  - Quote, Contract, Order, Order Item
│  │  - User, Campaign, Event, Task
│  │  - Product, Price Book Entry
│  │
│  │  NOT Supported:
│  │  - Person Accounts (limited), Activities
│  │  - Setup objects, Knowledge, Service Console-specific
│  │
│  ├─ Custom Object → Dynamic Forms supported
│  ├─ Standard Object (supported) → Continue to Q3
│  └─ Standard Object (not supported)
│     └─ → USE fieldInstance Pattern
│
├─ Q3: Do you need field-level visibility rules?
│  │
│  │  Field-level visibility = showing/hiding INDIVIDUAL fields based on:
│  │  - Record type
│  │  - Profile/Permission
│  │  - Field values (filter conditions)
│  │
│  ├─ YES - Need per-field conditional visibility
│  │  └─ → PREFER Dynamic Forms (simpler to configure)
│  │
│  └─ NO - Section-level visibility is sufficient
│     └─ Continue to Q4
│
├─ Q4: Is this a high-traffic, performance-critical page?
│  │
│  │  High traffic indicators:
│  │  - >1000 page views/day for this record type
│  │  - Users complain about page load time
│  │  - Complex page with many components
│  │
│  ├─ YES - Performance is critical
│  │  └─ → PREFER Dynamic Forms (loads only visible fields)
│  │
│  └─ NO - Standard traffic patterns
│     └─ Continue to Q5
│
├─ Q5: What is your deployment and maintenance preference?
│  │
│  ├─ Point-and-click / Admin-managed
│  │  └─ → PREFER Dynamic Forms (easier UI-based changes)
│  │
│  └─ Code-based / DevOps pipeline
│     └─ Continue to Q6
│
├─ Q6: Do you need maximum cross-org compatibility?
│  │
│  │  Consider:
│  │  - Will this layout be deployed to multiple orgs?
│  │  - Are target orgs on different editions?
│  │  - Is ISV packaging involved?
│  │
│  ├─ YES - Need to deploy across different orgs/editions
│  │  └─ → USE fieldInstance Pattern (universal compatibility)
│  │
│  └─ NO - Single org or known compatible orgs
│     └─ → Either approach works, consider maintenance preference
│
└─ DEFAULT RECOMMENDATION:
   fieldInstance Pattern
   (Predictable behavior, explicit control, universal compatibility)
```

---

## Dynamic Forms: Details

### What It Is

Dynamic Forms is a Salesforce feature that lets you:
- Place individual fields anywhere on a Lightning Record Page
- Set visibility rules on each field (not just sections)
- Migrate from page layout sections to granular field placement

### Prerequisites

1. **Edition**: Enterprise, Unlimited, or Developer
2. **Object**: Custom objects or supported standard objects
3. **Lightning Experience**: Required (not Classic)
4. **Migration**: Existing layouts can be "upgraded" to Dynamic Forms

### How to Enable

In Lightning App Builder:
1. Open the Lightning Record Page
2. Click on Record Detail component
3. Click "Upgrade Now" (if available)
4. Choose which sections to migrate

### Benefits

- **Field-level visibility**: Show/hide individual fields based on conditions
- **Performance**: Only visible fields are loaded (faster for complex pages)
- **Flexibility**: Place fields in any region, not just Record Detail
- **Point-and-click**: Configure visibility in the UI

### Limitations

- Not available in Professional Edition
- Not all standard objects supported
- Some complex visibility logic still requires formulas
- Metadata structure differs (may complicate CI/CD)

---

## fieldInstance Pattern: Details

### What It Is

The fieldInstance pattern is a metadata structure where fields are explicitly referenced within the FlexiPage XML using `<fieldInstance>` elements wrapped in a proper facet hierarchy.

### Structure Overview

```xml
<flexiPageRegions>
    <regionContent>
        <componentInstance>
            <componentName>flexipage:fieldSection</componentName>
            <componentInstanceProperties>
                <name>fields</name>
                <value>fieldFacetId1,fieldFacetId2</value>
            </componentInstanceProperties>
        </componentInstance>
    </regionContent>
</flexiPageRegions>

<facets>
    <facetId>fieldFacetId1</facetId>
    <fieldInstance>
        <fieldItem>Account.Name</fieldItem>
    </fieldInstance>
</facets>
```

### Benefits

- **Universal compatibility**: Works in ALL Salesforce editions
- **No special permissions**: No feature enablement required
- **Explicit control**: Clear, reviewable metadata
- **CI/CD friendly**: Consistent structure for deployment pipelines
- **No migration needed**: Just deploy the FlexiPage

### When to Use

- Deploying to multiple orgs with varying editions
- ISV packaging
- Maximum compatibility requirements
- Prefer code-based deployment over UI configuration
- Working with objects not supported by Dynamic Forms

---

## Hybrid Approach

In some scenarios, you can combine approaches:

1. **Primary layout**: Use fieldInstance pattern for baseline compatibility
2. **Profile-specific pages**: Use Dynamic Forms for specific high-touch profiles
3. **Gradual migration**: Start with fieldInstance, upgrade specific objects later

### Implementation Pattern

```
Org Setup:
├─ Default Lightning Pages (fieldInstance)
│  └─ All profiles see these by default
│
└─ Dynamic Forms Pages (where beneficial)
   └─ Assigned to specific apps/profiles/record types
```

---

## Migration Considerations

### From Classic Page Layout to Lightning

**Option A: Keep Classic Layout + Record Detail component**
- Fastest implementation
- Uses existing Classic layout in Lightning
- Limited Lightning-specific features

**Option B: fieldInstance Pattern**
- Full Lightning experience
- Maximum compatibility
- Explicit field control

**Option C: Dynamic Forms**
- Modern approach (where available)
- Best performance
- Most flexibility

### Decision Factors for Migration

| Factor | Classic→fieldInstance | Classic→Dynamic Forms |
|--------|----------------------|----------------------|
| Effort | Medium | Medium-High |
| Edition support | All | Enterprise+ only |
| Field visibility | Section-level | Field-level |
| Ongoing maintenance | Code-based | UI-based |
| CI/CD compatibility | High | Medium |

---

## Recommendation Summary

| Scenario | Recommended Approach |
|----------|---------------------|
| Multi-org deployment | fieldInstance Pattern |
| ISV/AppExchange app | fieldInstance Pattern |
| Professional Edition org | fieldInstance Pattern |
| Single Enterprise+ org | Either (evaluate needs) |
| Complex visibility requirements | Dynamic Forms |
| Performance-critical pages | Dynamic Forms |
| Unknown target org edition | fieldInstance Pattern |
| **DEFAULT** | **fieldInstance Pattern** |

---

## Quick Reference Commands

### Check if Dynamic Forms is Available

```bash
# Check org edition
sf org display --target-org [alias]

# Check object support (via Tooling API)
sf data query --query "SELECT DurableId, QualifiedApiName, IsDynamicFormsEnabled
  FROM EntityDefinition
  WHERE QualifiedApiName = 'Account'" --use-tooling-api
```

### Generate Layout Using fieldInstance

```bash
# Use layout generator command
/design-layout --object Account --persona sales-rep --org myorg
```

### Check Existing Layout Approach

```bash
# Retrieve and inspect FlexiPage
sf project retrieve start -m "FlexiPage:Account_Record_Page"
# Look for <fieldInstance> elements vs force:recordFieldSection
```
