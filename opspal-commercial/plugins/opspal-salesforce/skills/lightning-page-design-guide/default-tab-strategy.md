# Default Tab Strategy

## Overview

The default tab is the tab users see first when opening a record in Lightning Experience. Choosing the right default tab can save users one click per record view, which adds up to significant time savings.

---

## Decision Framework

### Primary Question

**What do users do MOST OFTEN when they open this type of record?**

| If users mostly... | Default to... |
|-------------------|---------------|
| View/edit fields | Details tab |
| View related records | Related tab |
| Check activities | Activity tab |
| Collaborate/comment | Chatter tab |

---

## Object-Specific Recommendations

### Account

**Recommended Default:** Related

**Rationale:**
- Account is a hub object - users typically navigate to Account to access Contacts, Opportunities, Cases
- Users viewing Account details can still click to Details tab (one extra click)
- But users wanting Contacts (most common) save a click

**Alternative:** Details - If your users primarily update Account fields rather than navigate to related records

---

### Contact

**Recommended Default:** Details

**Rationale:**
- Contact is primarily a data record (phone, email, address)
- Users often need to view or edit contact information
- Related records (Opportunities, Cases) are secondary

**Alternative:** Related - For support teams who primarily look at Case history

---

### Lead

**Recommended Default:** Details

**Rationale:**
- Lead qualification requires updating lead fields (Status, Rating)
- Users need to capture qualification data
- Once qualified, Lead is converted (no long-term related records)

**Alternative:** Activity - If your process emphasizes activity logging during qualification

---

### Opportunity

**Recommended Default:** Details

**Rationale:**
- Opportunity progression requires field updates (Stage, Amount, Close Date)
- Users frequently update Next Steps, Probability
- Deal management is field-centric

**Alternative:** Related - If users primarily manage Products/Quote Lines

---

### Case

**Recommended Default:** Related

**Rationale:**
- Support agents need context: Knowledge articles, related cases, activities
- Case resolution often requires reviewing related information
- Case fields are typically viewed rather than edited repeatedly

**Alternative:** Details - If your process emphasizes field updates and case routing

---

### Quote

**Recommended Default:** Details

**Rationale:**
- Quote creation/editing is field-focused
- Users need to see pricing, discount, status
- Quote Lines are important but accessed from Related tab

**Alternative:** Related - If users primarily work with Quote Lines

---

### Custom Objects

**Decision Process:**

1. **Identify primary action:** What do users DO on this record?
2. **Analyze workflow:** Where do they navigate after opening?
3. **Count clicks:** Which default saves the most clicks?

| Object Type | Typical Default | Reason |
|-------------|-----------------|--------|
| Master object (like Account) | Related | Users access children |
| Transaction object (like Order) | Details | Users update status |
| Detail object (like Line Item) | Details | Users edit quantities |
| Reference object (like Product) | Details | Users review info |

---

## Implementation

### Setting Default Tab in App Builder

1. Select the **Tabs** component on your Lightning Record Page
2. In the properties panel, find **Default Tab**
3. Select the tab name (e.g., "Details", "Related", "Activity")
4. Save and activate the page

### Default Tab in FlexiPage XML

```xml
<componentInstance>
    <componentName>flexipage:tabset</componentName>
    <componentInstanceProperties>
        <name>defaultTab</name>
        <value>Related</value>
    </componentInstanceProperties>
    <!-- Tab definitions... -->
</componentInstance>
```

---

## Profile-Specific Defaults

When different user groups need different defaults:

### Option 1: Visibility Rules on Tab Content

- Create one page with tabs
- Use visibility to show different content per profile
- Same default tab, different experience

### Option 2: Multiple Lightning Pages

- Create separate Lightning pages per audience
- Each page can have different default tab
- Assign by App + Profile

**Example:**
- "Account_Sales_Page" → Default: Details (sales edits fields)
- "Account_Support_Page" → Default: Related (support views Cases)

---

## Tab Order Best Practice

Regardless of which tab is default, maintain consistent tab ORDER:

**Recommended Order:**
1. Details
2. Related
3. Activity
4. Chatter (if used)
5. Custom tabs

**Why Consistency Matters:**
- Users learn muscle memory for tab positions
- Switching objects shouldn't require relearning
- Reduces cognitive load

Even if Default is "Related", keep it in position 2 (not moved to position 1).

---

## Special Considerations

### Mobile vs Desktop

- Mobile users may have different primary actions
- Consider creating mobile-specific pages with different defaults
- Use Device form factor visibility if needed

### New vs Existing Records

- New records always start on Details (to enter data)
- Default tab applies to viewing existing records
- This is expected behavior

### Console Apps

- In Lightning Console, default tab affects subtab behavior
- Test thoroughly in console if using split view

### Path Component

- If using Path on Opportunity/Lead, users may want Details to see Path + fields together
- Path appears in header, not in tabs, so this doesn't conflict

---

## Measuring Success

### Before Changing Default Tab

Record baseline:
- User satisfaction scores
- Time to complete common tasks
- Number of clicks per action

### After Changing Default Tab

Measure impact:
- Did task completion time decrease?
- Are users complaining about the change?
- Monitor support tickets about navigation

### Signs of Wrong Default

| Symptom | Possible Issue |
|---------|----------------|
| Users always immediately click another tab | Wrong default |
| Support tickets about "can't find X" | Default hides commonly needed info |
| Low engagement with default tab content | Users bypass it |

---

## Summary by Object

| Object | Recommended Default | Key Rationale |
|--------|---------------------|---------------|
| Account | Related | Hub object, users seek children |
| Contact | Details | Data object, users view/edit info |
| Lead | Details | Qualification requires field updates |
| Opportunity | Details | Deal progression is field-centric |
| Case | Related | Context (articles, history) matters |
| Quote | Details | Pricing review is primary action |
| Campaign | Details | Configuration is primary |
| Event | Details | Users update event info |
| Task | Details | Users update status/notes |

**Rule of Thumb:**
- **Hub objects** (Account, Parent records) → Related
- **Work objects** (Opportunity, Case, Lead) → Details or Related based on workflow
- **Reference objects** (Product, Price Book) → Details
- **Detail objects** (Line Items) → Details
