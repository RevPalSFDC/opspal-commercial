---
name: compact-layout-guide
description: Salesforce Compact Layout design and management. Use when selecting fields for the highlights panel, creating visual indicators, or deploying compact layouts via CLI/API. Covers mobile optimization and record type assignments.
allowed-tools: Read, Grep, Glob, Bash
---

# Compact Layout Guide

## When to Use This Skill

Activate this skill when the user:
- Selects fields for compact layouts (highlights panel)
- Creates visual indicators for opt-out flags or status
- Configures compact layouts for mobile apps
- Deploys compact layout changes via CLI
- Assigns compact layouts to record types

## What is a Compact Layout?

A Compact Layout defines the key fields shown in:
- **Lightning Experience:** Highlights panel (top card of record)
- **Salesforce Mobile App:** Record summary card
- **Lookups:** Hover/popup preview
- **Related Lists:** Record preview

It's the "business card" of a record - showing the most critical information at a glance.

---

## Field Selection Principles

### The 4-5 Field Rule

Compact layouts display approximately 4-5 fields (varies by screen size). Choose wisely:

**Selection Criteria:**

1. **Identification** - Fields that uniquely identify the record
2. **Status/State** - Current stage, status, or condition
3. **Actionable** - Fields enabling quick actions (Phone, Email)
4. **Compliance** - Visual indicators for restrictions
5. **Context** - Key relationships (Account, Owner)

### Priority Framework

When selecting fields, score each candidate:

| Criterion | Weight | Question |
|-----------|--------|----------|
| Identification | 30% | Does this help identify the record? |
| Actionability | 25% | Can users take action from this field? |
| Frequency | 20% | How often do users need this info? |
| Decision Impact | 15% | Does this influence user decisions? |
| Uniqueness | 10% | Does it show something not obvious from Name? |

---

## Object-Specific Recommendations

### Account

**Recommended Fields (4):**
1. **Phone** - Enable one-click calling
2. **Industry** - Quick categorization
3. **Owner** - Know who to contact
4. **Rating** or **Type** - Priority/categorization

**Rationale:** Phone enables immediate action; Industry/Rating provide quick context without opening the full record.

---

### Contact

**Recommended Fields (4-5):**
1. **Phone** - Enable calling
2. **Email** - Enable emailing
3. **Account** - Context
4. **DoNotCall Indicator** - Compliance visibility
5. **EmailOptOut Indicator** - Email compliance

**Rationale:** Contact methods are essential for quick action. Opt-out indicators prevent compliance violations.

---

### Opportunity

**Recommended Fields (4):**
1. **Amount** - Deal size at a glance
2. **Close Date** - Urgency indicator
3. **Stage** - Current status
4. **Account** - Customer context

**Rationale:** These four fields summarize the deal's value, timing, and status without opening the record.

---

### Lead

**Recommended Fields (4):**
1. **Company** - Organization context
2. **Status** - Current lead status
3. **Phone** - Enable calling
4. **Rating** - Lead quality indicator

---

### Case

**Recommended Fields (4):**
1. **Priority** - Urgency level
2. **Status** - Current state
3. **Contact** - Who reported
4. **Account** - Customer context

---

### Quote

**Recommended Fields (4):**
1. **Status** - Approval state
2. **Grand Total** / **Total Price** - Deal value
3. **Expiration Date** - Urgency indicator
4. **Opportunity** - Deal context

---

### Quote Line Item

**Recommended Fields (3):**
1. **Product** - What's being quoted
2. **Quantity** - How many
3. **Total Price** - Line total

---

## Visual Indicators

### Why Use Indicators?

Formula fields with images or icons can convey status information visually in the compact layout. This is especially powerful for:
- Opt-out flags (Do Not Call, Email Opt Out)
- Priority indicators
- Health scores
- Compliance status

### Creating Indicator Fields

#### Do Not Call Indicator

**Field Name:** `DoNotCall_Indicator__c`
**Type:** Formula (Text)
**Formula:**
```
IF(DoNotCall,
   IMAGE("/img/samples/flag_red.gif", "Do Not Call", 16, 16),
   IMAGE("/img/samples/flag_green.gif", "OK to Call", 16, 16)
)
```

**Display:** Red flag (do not call) or Green flag (OK to call)

---

#### Email Opt-Out Indicator

**Field Name:** `EmailOptOut_Indicator__c`
**Type:** Formula (Text)
**Formula:**
```
IF(HasOptedOutOfEmail,
   IMAGE("/img/samples/flag_red.gif", "Email Opt Out", 16, 16),
   IMAGE("/img/samples/flag_green.gif", "OK to Email", 16, 16)
)
```

---

#### Combined Contact Status

**Field Name:** `Contact_Status_Icons__c`
**Type:** Formula (Text)
**Formula:**
```
"Call: " & IF(DoNotCall,
   IMAGE("/img/samples/flag_red.gif", "No", 12, 12),
   IMAGE("/img/samples/flag_green.gif", "Yes", 12, 12)) &
" Email: " & IF(HasOptedOutOfEmail,
   IMAGE("/img/samples/flag_red.gif", "No", 12, 12),
   IMAGE("/img/samples/flag_green.gif", "Yes", 12, 12))
```

---

#### Priority Indicator (for any object with priority)

**Field Name:** `Priority_Indicator__c`
**Type:** Formula (Text)
**Formula:**
```
CASE(Priority,
   "High", IMAGE("/img/samples/color_red.gif", "High Priority", 12, 12),
   "Medium", IMAGE("/img/samples/color_yellow.gif", "Medium Priority", 12, 12),
   "Low", IMAGE("/img/samples/color_green.gif", "Low Priority", 12, 12),
   ""
)
```

---

### Indicator Best Practices

1. **Keep icons small** (12-16px) - Compact layouts have limited space
2. **Use consistent colors** - Red for warnings, Green for OK, Yellow for caution
3. **Include alt text** - For accessibility
4. **Test in mobile** - Icons render differently on mobile

---

## CLI Operations

### Retrieve Compact Layout

```bash
# Single compact layout
sf project retrieve start -m "CompactLayout:Account.Account_Compact_Layout"

# All compact layouts for an object
sf project retrieve start -m "CompactLayout:Account.*"

# All compact layouts in org
sf project retrieve start -m CompactLayout
```

### Deploy Compact Layout

```bash
# Single layout
sf project deploy start -m "CompactLayout:Account.Account_Compact_Layout"

# With object (for assignment)
sf project deploy start -m "CompactLayout:Account.Account_Compact,CustomObject:Account"
```

---

## XML Structure

### Compact Layout File

**Location:** `compactLayouts/Object.LayoutName.compactLayout-meta.xml`

**Structure:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<CompactLayout xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Account_Compact</fullName>
    <label>Account Compact Layout</label>
    <fields>Phone</fields>
    <fields>Industry</fields>
    <fields>OwnerId</fields>
    <fields>Rating</fields>
</CompactLayout>
```

### Field Order

Fields appear in the order listed in the XML. Put most important fields first.

---

## Assignment

### Default Compact Layout

Set in the CustomObject metadata:

```xml
<CustomObject>
    <compactLayoutAssignment>Account_Compact</compactLayoutAssignment>
</CustomObject>
```

### Record Type-Specific Assignment

```xml
<CustomObject>
    <compactLayoutAssignment>Account_Compact</compactLayoutAssignment>
    <recordTypes>
        <fullName>Enterprise</fullName>
        <compactLayoutAssignment>Enterprise_Compact</compactLayoutAssignment>
    </recordTypes>
</CustomObject>
```

### Deploying Assignments

Include CustomObject when deploying:
```bash
sf project deploy start -m "CompactLayout:Account.Account_Compact,CustomObject:Account"
```

---

## Limitations

1. **Maximum 10 fields** - Hard limit, but display shows ~5
2. **No buttons/actions** - Compact layout is view-only (actions come from Highlights Panel)
3. **Limited field types** - Some complex fields don't render well
4. **Image size limits** - Formula images have size constraints

---

## Reference Documentation

For detailed guidance, see:
- `field-selection.md` - Field selection by object
- `indicator-patterns.md` - Visual indicator formulas
