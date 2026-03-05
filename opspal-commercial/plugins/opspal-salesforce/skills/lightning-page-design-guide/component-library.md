# Lightning Component Library

## Overview

This reference covers standard Lightning components available for Record Pages in Lightning App Builder. Use this guide to select appropriate components for your Lightning Record Page design.

---

## Header Region Components

### Highlights Panel

**Component Name:** `flexipage:highlightsPanel`

**Purpose:** Displays key fields from the Compact Layout at the top of the page.

**Configuration Options:**
- None (uses assigned Compact Layout automatically)

**Best Practices:**
- Always include in header region
- Ensure Compact Layout is configured with 4-5 key fields
- Include actionable fields (Phone, Email) for one-click actions

---

### Path

**Component Name:** `flexipage:pathAssistant`

**Purpose:** Visual indicator of record stages/processes.

**Prerequisites:**
- Path must be configured for the object in Setup
- Sales Path or custom Path enabled

**Configuration Options:**
- Automatically shows configured path

**Best For:**
- Opportunities (Sales Path)
- Leads (Lead conversion path)
- Custom objects with stage progressions

---

## Record Detail Components

### Record Detail (Full Page Layout)

**Component Name:** `force:recordDetail`

**Purpose:** Displays all fields from the assigned Page Layout.

**Configuration Options:**
- None (uses Profile's assigned Page Layout)

**When to Use:**
- Quick implementation using existing Classic layouts
- Don't need Dynamic Forms features

**Limitations:**
- Cannot control individual field visibility on Lightning page
- Must modify Classic Page Layout for field changes

---

### Field Section (Dynamic Forms)

**Component Name:** `flexipage:fieldSection`

**Purpose:** Display specific fields with granular control.

**Prerequisites:**
- Dynamic Forms enabled for the object (if standard object)
- Or use fieldInstance pattern for compatibility

**Configuration Options:**
- Section label
- Field selection
- Columns (1 or 2)
- Visibility rules

**When to Use:**
- Need per-field or per-section visibility
- Want field control without Classic layout dependency

---

## Navigation Components

### Tabs

**Component Name:** `flexipage:tabset`

**Purpose:** Organize content into clickable tabs.

**Configuration Options:**
- Tab labels
- Tab contents (drag components into tabs)
- Default tab selection

**Common Tab Configurations:**

| Tab | Contents |
|-----|----------|
| Details | Record Detail or Field Sections |
| Related | Related Lists |
| Activity | Activities timeline |
| Chatter | Chatter feed |

**Best Practices:**
- Limit to 4-5 tabs maximum
- Put most-used content in leftmost tabs
- Use descriptive, short tab names

---

### Accordion

**Component Name:** `flexipage:accordion`

**Purpose:** Collapsible sections for dense information.

**Configuration Options:**
- Section titles
- Allow multiple open (true/false)

**When to Use:**
- Many sections of information
- Want to reduce scrolling
- Information hierarchy is clear

**When NOT to Use:**
- Users need to see multiple sections simultaneously
- Few sections (use tabs or direct display instead)

---

## Related Record Components

### Related Lists

**Component Name:** `force:relatedListContainer`

**Purpose:** Display all related lists for the record.

**Configuration Options:**
- None (shows all available related lists)

**Limitations:**
- All-or-nothing display
- Cannot select specific lists in this component

---

### Related List - Single

**Component Name:** `force:relatedListSingleContainer`

**Purpose:** Display one specific related list.

**Configuration Options:**
- Related list selection
- Number of records to display

**When to Use:**
- Highlight a key relationship (e.g., Open Cases on Account)
- Place specific related list in a prominent position
- Customize placement (sidebar, specific tab)

---

### Related List Quick Links

**Component Name:** `flexipage:relatedListQuickLinks`

**Purpose:** Clickable links to related lists (doesn't show data inline).

**When to Use:**
- Many related lists, limited space
- Navigation-focused interface
- Performance optimization (no data loaded until clicked)

---

### Related Record

**Component Name:** `flexipage:relatedRecord`

**Purpose:** Display details from a related (lookup/master-detail) record.

**Configuration Options:**
- Lookup field to show
- Display style (full detail or compact)

**Examples:**
- Show Account details on Contact page
- Show Primary Contact on Opportunity

---

## Activity & Collaboration Components

### Activities

**Component Name:** `runtime_sales_activities:activityPanel`

**Purpose:** Timeline showing Tasks, Events, Calls, Emails.

**Configuration Options:**
- None (automatic based on activity settings)

**Best Practices:**
- Include on records where activity tracking matters
- Place in sidebar or dedicated tab
- Works best in standard view, not mobile

---

### Chatter

**Component Name:** `force:chatterFeed`

**Purpose:** Collaboration feed for the record.

**Configuration Options:**
- Feed type (Record feed)

**When to Include:**
- Team collaboration is important
- Comments/updates need visibility
- @mentions are used for communication

---

### Chatter Publisher

**Component Name:** `chatter:publisher`

**Purpose:** Post to Chatter (separate from feed).

**When to Use:**
- Encourage posting without scrolling to feed
- Place prominently for active collaboration

---

## Utility Components

### Rich Text

**Component Name:** `flexipage:richText`

**Purpose:** Display static HTML/text content.

**Use Cases:**
- Instructions for users
- Warnings or compliance notices
- Links to resources

**Example Content:**
```html
<p><strong>Instructions:</strong></p>
<ul>
<li>Update Stage when deal progresses</li>
<li>Log all customer calls</li>
</ul>
```

---

### Report Chart

**Component Name:** `flexipage:reportChart`

**Purpose:** Display a report chart filtered to the current record.

**Prerequisites:**
- Report must exist with a filter for the record
- Report must have a chart

**Configuration Options:**
- Report selection
- Filter field (to filter by current record)

**Performance Note:** Each chart requires a report API call. Limit to 1-2 per page.

---

### Visualforce

**Component Name:** `force:visualforcePage`

**Purpose:** Embed a Visualforce page.

**Configuration Options:**
- Visualforce page selection
- Height
- Show label

**When to Use:**
- Legacy functionality in VF
- Complex custom UI not feasible in LWC
- Third-party VF integrations

---

### Custom Lightning Component

**Component Name:** (your custom component name)

**Purpose:** Add custom functionality via LWC or Aura.

**Prerequisites:**
- Component must be exposed for Lightning pages
- Must be deployed to org

**Configuration:**
- Component-specific properties

---

## Specialized Components

### Knowledge

**Component Name:** `knowledge:articleList`

**Purpose:** Show related Knowledge articles.

**Prerequisites:**
- Knowledge enabled in org
- Article assignment configured

**Best For:**
- Case pages
- Support agent interfaces

---

### Quick Actions

**Component Name:** Included in Highlights Panel

**Configuration:**
- Via Object's Page Layout (Quick Action section)
- Or Publisher Actions

**Note:** Quick Actions appear in the Highlights Panel action menu.

---

## Component Placement Guidelines

### Recommended Layout Pattern

```
┌─────────────────────────────────────────────────────┐
│ HEADER: Highlights Panel + Path (if applicable)     │
├─────────────────────────────────────────────────────┤
│                    │                                │
│   MAIN REGION      │       SIDEBAR                 │
│                    │                                │
│   - Tabs           │   - Activities                │
│     - Details      │   - Related Record            │
│     - Related      │   - Chatter (optional)        │
│     - Custom       │   - Rich Text (tips)          │
│                    │                                │
│                    │                                │
└─────────────────────────────────────────────────────┘
```

### Component Priority by Object

| Object | Must Have | Should Have | Nice to Have |
|--------|-----------|-------------|--------------|
| Account | Highlights, Related Lists, Tabs | Activities | Report Chart, Chatter |
| Contact | Highlights, Record Detail | Activities, Related | Chatter |
| Opportunity | Highlights, Path, Record Detail | Related, Activities | Report Chart |
| Case | Highlights, Knowledge, Related | Activities | Chatter, Rich Text |
| Lead | Highlights, Path, Record Detail | Activities | Conversion panel |
