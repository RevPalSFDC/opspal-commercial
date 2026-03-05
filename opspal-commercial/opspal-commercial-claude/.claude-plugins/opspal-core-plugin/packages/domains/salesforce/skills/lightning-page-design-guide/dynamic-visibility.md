# Dynamic Visibility Rules

## Overview

Dynamic visibility allows showing or hiding components, sections, and fields on Lightning Record Pages based on conditions. This enables persona-based experiences without creating multiple pages.

---

## Visibility Levels

### Component Visibility

**Applies to:** Any component on the Lightning page

**How to Set:**
1. Select component in App Builder
2. Click "Set Component Visibility"
3. Add filter conditions

**Behavior:** Entire component shows or hides based on conditions.

---

### Field Section Visibility (Dynamic Forms)

**Applies to:** Field Section components when using Dynamic Forms

**How to Set:**
1. Select Field Section component
2. Click component visibility icon
3. Add filter conditions

**Behavior:** Entire section (including all fields) shows or hides.

---

### Field-Level Visibility (Dynamic Forms)

**Applies to:** Individual fields within Field Sections

**How to Set:**
1. Select specific field in Field Section
2. Click visibility icon next to field
3. Add filter conditions

**Behavior:** Individual field shows or hides while section remains visible.

---

## Filter Types

### User-Based Filters

**Profile:**
```
Object: User
Field: Profile > Name
Operator: Equals / Not Equal / Contains
Value: "Sales User"
```

**Role:**
```
Object: User
Field: Role > Name
Operator: Equals
Value: "VP Sales"
```

**Permission:**
```
Object: User
Field: [Custom Permission Name]
Operator: Is True
```

**License:**
```
Object: User
Field: UserType
Operator: Equals
Value: "Standard"
```

---

### Record-Based Filters

**Record Type:**
```
Object: Record
Field: Record Type > Name
Operator: Equals
Value: "Enterprise"
```

**Field Value (Text):**
```
Object: Record
Field: Status
Operator: Equals
Value: "Active"
```

**Field Value (Picklist):**
```
Object: Record
Field: Stage
Operator: Equals
Value: "Closed Won"
```

**Field Value (Checkbox):**
```
Object: Record
Field: Is_VIP__c
Operator: Is True
```

**Field Value (Lookup):**
```
Object: Record
Field: Account > Type
Operator: Equals
Value: "Customer"
```

---

### Device-Based Filters

**Form Factor:**
```
Object: Device
Field: Form Factor
Operator: Equals
Value: "Large" (desktop) / "Small" (phone)
```

---

## Condition Logic

### Single Condition

Show component when one condition is met:
```
Profile = "Sales User"
```

### Multiple Conditions (AND)

Show when ALL conditions are met:
```
Profile = "Sales User" AND
Stage = "Negotiation" AND
Amount > 100000
```

### Multiple Conditions (OR)

Show when ANY condition is met:
```
Profile = "Sales User" OR
Profile = "Sales Manager"
```

### Mixed Logic (AND/OR)

Combine AND and OR:
```
(Profile = "Sales User" OR Profile = "Sales Manager") AND
Stage = "Negotiation"
```

---

## Common Visibility Patterns

### Pattern 1: Profile-Based Components

**Use Case:** Show different components to sales vs support users.

**Implementation:**
- Component A: Sales Dashboard Chart
  - Visibility: Profile = "Sales User" OR "Sales Manager"
- Component B: Case History
  - Visibility: Profile = "Support User" OR "Support Manager"

---

### Pattern 2: Record Type-Based Sections

**Use Case:** Show different field sections for Enterprise vs SMB accounts.

**Implementation:**
- Section "Enterprise Info"
  - Fields: Contract Terms, SLA Level, Executive Sponsor
  - Visibility: Record Type = "Enterprise"
- Section "SMB Info"
  - Fields: Self-Service Enabled, Trial Expiration
  - Visibility: Record Type = "SMB"

---

### Pattern 3: Stage-Based Fields

**Use Case:** Show relevant fields based on Opportunity stage.

**Implementation:**
- Section "Discovery Fields"
  - Visibility: Stage IN (Qualification, Discovery)
- Section "Proposal Fields"
  - Visibility: Stage IN (Proposal, Negotiation)
- Section "Closed Fields"
  - Visibility: Stage IN (Closed Won, Closed Lost)

---

### Pattern 4: VIP Customer Experience

**Use Case:** Show special components for high-value customers.

**Implementation:**
- Component "VIP Service Panel"
  - Visibility: Is_VIP__c = True OR Annual_Revenue__c > 1000000

---

### Pattern 5: Mobile-Optimized View

**Use Case:** Show simplified layout on mobile devices.

**Implementation:**
- Component "Desktop Dashboard" (complex charts)
  - Visibility: Device Form Factor = "Large"
- Component "Mobile Summary" (simple metrics)
  - Visibility: Device Form Factor = "Small"

---

### Pattern 6: Permission-Based Sensitive Data

**Use Case:** Show sensitive fields only to users with permission.

**Implementation:**
- Section "Financial Details"
  - Fields: Discount %, Margin, Cost
  - Visibility: User has Custom Permission "View_Financial_Data"

---

## Best Practices

### 1. Default to Visible

Configure visibility rules for components that should be HIDDEN in certain scenarios, not the other way around. This ensures users don't accidentally miss content.

### 2. Keep Rules Simple

Complex visibility rules are hard to maintain. If you need many conditions, consider:
- Creating separate Lightning pages instead
- Using custom permissions to simplify profile checks

### 3. Document Your Rules

Create a reference document showing:
| Component | Visibility Rule | Reason |
|-----------|-----------------|--------|
| Financial Section | Permission: View_Financial | Restricted data |
| Enterprise Fields | RecordType: Enterprise | Type-specific |

### 4. Test All Scenarios

Before activating, test the page as users with different:
- Profiles
- Record types
- Field values
- Devices (desktop and mobile)

### 5. Use Consistent Patterns

If showing "Sales Info" to sales profiles on Account, use the same pattern on Contact, Opportunity, etc. Users expect consistency.

---

## Visibility in FlexiPage Metadata

When you set visibility rules, they're stored in the FlexiPage XML:

```xml
<componentInstanceProperties>
    <name>visibilityRule</name>
    <value>{
        "criteria": [{
            "operator": "EQUALS",
            "leftValue": "{!Record.RecordType.Name}",
            "rightValue": "Enterprise"
        }],
        "criteriaLogic": "AND"
    }</value>
</componentInstanceProperties>
```

### Deploying Visibility Rules

Visibility rules are part of the FlexiPage and deploy automatically when you deploy the page:

```bash
sf project deploy start -m "FlexiPage:Account_Record_Page"
```

---

## Troubleshooting

### Component Not Showing

1. **Check visibility rule:** May be too restrictive
2. **Check permissions:** User may lack object/field access
3. **Check record type:** Visibility may be record-type specific
4. **Check profile:** Visibility may exclude user's profile

### Component Showing When Shouldn't

1. **Check condition logic:** AND vs OR may be wrong
2. **Check operator:** "Equals" vs "Not Equal"
3. **Check spelling:** Value must match exactly

### Testing Visibility

Use App Builder's preview:
1. Click "Preview" in App Builder
2. Select "Preview as..." different profiles
3. Verify component visibility

Or use actual testing:
1. Log in as test user
2. Or use "Login As" feature
3. Navigate to record
4. Verify expected components appear

---

## Limitations

1. **No formula conditions:** Can't use formulas in visibility rules
2. **Limited operators:** Basic comparison only
3. **No cross-object deep traversal:** Limited lookup depth
4. **Some components don't support visibility:** Check component documentation
5. **Performance:** Many visibility rules can slow page evaluation (minimal impact but worth noting)
