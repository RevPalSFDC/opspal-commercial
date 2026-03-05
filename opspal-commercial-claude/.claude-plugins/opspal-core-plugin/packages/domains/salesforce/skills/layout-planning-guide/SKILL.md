---
name: layout-planning-guide
description: Persona-based page layout planning for Salesforce. Use when designing layouts for different user roles, deciding field placement, or planning section organization. Provides decision frameworks for Classic Layouts, Lightning Record Pages, and Compact Layouts.
allowed-tools: Read, Grep, Glob
---

# Layout Planning Guide

## When to Use This Skill

Activate this skill when the user:
- Plans page layouts for different user personas
- Decides which fields to include on a layout
- Organizes fields into logical sections
- Chooses between Classic Layouts and Lightning Record Pages
- Selects fields for Compact Layouts (highlights panel)
- Needs guidance on consistent layout patterns across objects

## Core Principles

### 1. Remove Clutter First

**Before adding fields, identify and remove unused ones.**

Unused fields confuse users and create longer pages. Use tools like Salesforce Optimizer or Field Trip to find fields with no data.

**Decision Criteria:**
- Field has <5% population rate → Consider removing
- Field hasn't been updated in 6+ months → Consider removing
- Field is never included in reports → Consider removing
- Field duplicates another field's purpose → Remove the duplicate

### 2. Identify User Personas

**Match layout to user needs, not just field availability.**

| Persona | Primary Need | Layout Focus |
|---------|--------------|--------------|
| Sales Rep | Quick data entry, deal progression | Fields they update daily, Sales Path |
| Sales Manager | Pipeline visibility, coaching | Team metrics, forecast fields |
| Executive | Strategic summary | KPIs only, dashboard components |
| Support Agent | Case resolution | Contact methods, case history |
| Support Manager | SLA compliance, team performance | Metrics, escalation info |
| Marketing | Campaign attribution | Lead source, engagement fields |
| Customer Success | Account health, renewals | Health scores, usage metrics |

### 3. Group Fields Logically

**Organize by business context, not alphabetically.**

Common section patterns by object:

**Account:**
- Account Details (Name, Owner, Industry, Rating, Type)
- Address Information (Billing, Shipping)
- Additional Info (SLA, Source, Revenue)

**Contact:**
- Contact Details (Name, Title, Account, Phone, Email)
- Address (Mailing Address)
- Preferences (Do Not Call, Email Opt-Out)

**Opportunity:**
- Opportunity Details (Name, Stage, Amount, Close Date, Owner)
- Opportunity Information (Type, Lead Source, Campaign)
- Key Dates (Created, Last Activity)

**Quote:**
- Quote Details (Name, Opportunity, Account, Status)
- Pricing (Total, Discount, Tax, Grand Total)
- Addresses (Billing, Shipping)
- Terms (Expiration, Description)

**Quote Line Item:**
- Product Details (Product, Quantity, Unit Price)
- Pricing (Discount, Total Price)

## Dynamic Forms vs fieldInstance Pattern

**Decision Tree:**

```
Should I use Dynamic Forms?
│
├─ Is org on supported edition with Dynamic Forms enabled?
│  ├─ NO → Use fieldInstance pattern
│  └─ YES → Continue
│
├─ Is object supported? (Custom objects + select standard)
│  ├─ NO → Use fieldInstance pattern
│  └─ YES → Continue
│
├─ Do I need field-level visibility rules per profile/record type?
│  ├─ YES → Dynamic Forms recommended (simpler visibility)
│  └─ NO → Either approach works
│
├─ Is this a high-traffic, performance-critical page?
│  ├─ YES → Dynamic Forms (loads only visible fields)
│  └─ NO → Either approach works
│
└─ DEFAULT: fieldInstance pattern (maximum compatibility)
```

**fieldInstance Pattern Benefits:**
- Works in ALL Salesforce editions (Professional, Enterprise, Unlimited, Developer)
- No special permissions required
- Predictable behavior
- Explicit field control

**Dynamic Forms Benefits:**
- Simpler visibility rules (point-and-click)
- Better performance (only loads visible fields)
- Field-level granularity without multiple layouts

## Compact Layout Field Selection

**Choose 4-5 fields that enable quick identification and action.**

**Selection Criteria:**
1. **Identification** - Fields that uniquely identify the record
2. **Status** - Current state or stage
3. **Quick Action** - Fields that enable one-click actions (Phone, Email)
4. **Compliance** - Visual indicators for restrictions (Do Not Call)

**Object-Specific Recommendations:**

| Object | Recommended Compact Fields | Rationale |
|--------|---------------------------|-----------|
| Account | Phone, Industry, Owner, Rating | Enable calls, show categorization |
| Contact | Phone, Email, Account, DoNotCall indicator | Enable contact actions, show restrictions |
| Opportunity | Amount, Close Date, Stage, Account | Show deal summary |
| Quote | Status, Total Price, Expiration, Opportunity | Show approval state and urgency |
| Quote Line | Product, Quantity, Total Price | Show line summary |

**Visual Indicators:**
- Use formula fields with images/icons for opt-out flags
- Example: "Call?" indicator shows checkmark or X based on DoNotCall field
- Place indicators in compact layout for immediate visibility

## Default Tab Strategy

**Choose the landing tab based on user workflow.**

| Object | Recommended Default | Rationale |
|--------|---------------------|-----------|
| Account | Related | Users often need related Contacts, Opportunities, Cases |
| Contact | Details | Users typically view/edit contact information |
| Opportunity | Details | Users frequently update Stage, Amount, Close Date |
| Quote | Details | Users need to see pricing and status |
| Case | Related | Users often need related articles, activities |
| Lead | Details | Users qualifying leads need to update fields |

**Exception Rule:** If a specific persona primarily uses the Related tab, create a profile-specific Lightning page with that default.

## Consistency Guidelines

**Maintain patterns across objects for user familiarity.**

1. **Action Button Order** - Keep Edit as first action across all objects
2. **Tab Order** - Details, Related, Activity in consistent left-to-right order
3. **Section Naming** - Use similar names (e.g., "Additional Info" not "Other Details" on one object and "Extra Fields" on another)
4. **Compact Layout Position** - Keep critical fields in same relative positions

## Planning Output Checklist

Before implementing, document:

- [ ] Target persona(s) identified
- [ ] Fields to include (with section assignments)
- [ ] Fields to exclude (with rationale)
- [ ] Compact layout fields selected (4-5)
- [ ] Default landing tab chosen
- [ ] Related lists to include
- [ ] Visibility rules needed (if any)
- [ ] Layout pattern choice (Dynamic Forms vs fieldInstance)

## Reference Documentation

For detailed guidance, see:
- `persona-field-matrix.md` - Field × persona priority matrix
- `object-specific-guidance.md` - Detailed per-object recommendations
- `dynamic-forms-decision.md` - Complete Dynamic Forms evaluation guide
