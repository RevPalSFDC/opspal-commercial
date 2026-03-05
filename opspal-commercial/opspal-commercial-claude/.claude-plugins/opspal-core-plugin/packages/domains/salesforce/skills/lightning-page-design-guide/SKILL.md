---
name: lightning-page-design-guide
description: Lightning Record Page design and deployment guidance. Use when building Lightning pages in App Builder, selecting page templates, adding components, configuring dynamic visibility, or deploying FlexiPages via CLI/API.
allowed-tools: Read, Grep, Glob, Bash
---

# Lightning Page Design Guide

## When to Use This Skill

Activate this skill when the user:
- Builds or modifies Lightning Record Pages
- Chooses page templates (1-column, 2-column, etc.)
- Selects and configures Lightning components
- Sets up dynamic visibility rules
- Decides on default landing tabs
- Deploys FlexiPages to other environments

## Lightning Page Basics

### What is a Lightning Record Page?

A Lightning Record Page (FlexiPage) is a customizable page layout for Lightning Experience that can include:
- Record fields (via Record Detail or Dynamic Forms)
- Standard components (Related Lists, Activities, Chatter)
- Custom components (LWC, Aura, Visualforce)
- Tabs and accordion navigation

### Key Differences from Classic Layouts

| Aspect | Classic Page Layout | Lightning Record Page |
|--------|---------------------|----------------------|
| Structure | Linear sections | Flexible regions |
| Components | Limited to related lists, buttons | Any Lightning component |
| Visibility | Per layout/profile | Per component rules |
| Tabs | Built-in (Details, Related) | Configurable tabs |
| Customization | Section + field | Component-level |

---

## Page Template Selection

### Available Templates

| Template | Best For | Structure |
|----------|----------|-----------|
| **Header and One Column** | Simple, mobile-first pages | Full-width content |
| **Header and Two Columns** | Standard record pages | 2/3 + 1/3 split |
| **Header and Three Columns** | Information-dense pages | Three equal columns |
| **Header, Subheader, and One Column** | Pages with key metrics | KPIs on top, content below |
| **Header and Two Columns (7/5)** | Balanced layout | Slight left emphasis |

### Selection Criteria

**Choose 1-Column when:**
- Mobile optimization is priority
- Content flows linearly
- Few related records to display

**Choose 2-Column when:**
- Standard record page experience
- Sidebar for supplementary info
- Need quick access to related lists

**Choose 3-Column when:**
- Dense information display
- Multiple data categories
- Executive dashboards

---

## Component Selection

### Header Region Components

Always include in header:
- **Highlights Panel** - Shows compact layout fields
- **Path** (if applicable) - Visual stage/process indicator

### Main Region Components

| Component | Purpose | When to Use |
|-----------|---------|-------------|
| **Record Detail** | Display fields from page layout | Standard field display |
| **Field Section** (Dynamic Forms) | Individual field control | Per-field visibility needed |
| **Tabs** | Organize content into tabs | Multiple content areas |
| **Accordion** | Collapsible sections | Information density |
| **Related Lists** | Show child records | Always (object dependent) |
| **Related List - Single** | One specific related list | Highlight important relationships |

### Sidebar Region Components

| Component | Purpose | When to Use |
|-----------|---------|-------------|
| **Activities** | Timeline of activities | User engagement tracking |
| **Chatter** | Feed and collaboration | Team communication |
| **Related Record** | Key related record detail | Show parent or key lookup |
| **Rich Text** | Static instructions | User guidance |
| **Report Chart** | Visual KPIs | Performance dashboards |

### Specialized Components

| Component | Purpose | When to Use |
|-----------|---------|-------------|
| **Knowledge** | Related articles | Support/service pages |
| **Case Comments** | Case-specific | Case object only |
| **Social Post** | Social monitoring | Social Studio integration |
| **Einstein** | AI recommendations | Einstein enabled orgs |

---

## Dynamic Visibility Rules

### Overview

Dynamic visibility shows/hides components based on:
- Record Type
- Profile
- Permission
- Field Values
- Device (desktop/phone)

### Configuration Levels

1. **Component-level** - Whole component shown/hidden
2. **Field Section-level** (Dynamic Forms) - Section shown/hidden
3. **Field-level** (Dynamic Forms) - Individual field shown/hidden

### Common Visibility Patterns

**By Profile:**
```
Filter: User > Profile > Name
Operator: Equals
Value: Sales User
```

**By Record Type:**
```
Filter: Record > Record Type > Name
Operator: Equals
Value: Enterprise
```

**By Field Value:**
```
Filter: Record > Stage
Operator: Equals
Value: Closed Won
```

**By Permission:**
```
Filter: User > Custom Permission
Operator: Is True
Value: View_Sensitive_Data
```

---

## Default Tab Strategy

### Choosing the Landing Tab

The default tab is what users see first when opening a record.

**Decision Framework:**

| Object Type | Recommended Default | Rationale |
|-------------|---------------------|-----------|
| Hub objects (Account) | Related | Users seek connected records |
| Process objects (Opportunity) | Details | Users update fields frequently |
| Detail objects (Contact, Lead) | Details | Users view/edit information |
| Support objects (Case) | Related | Users seek context (articles, history) |
| Custom objects | Evaluate workflow | Match primary user task |

### Setting Default Tab

In Lightning App Builder:
1. Select the Tabs component
2. In properties panel, find "Default Tab"
3. Choose the tab name (Details, Related, custom)

---

## Assignment Strategy

### Assignment Hierarchy

Lightning pages can be assigned at multiple levels (most specific wins):

1. **Org Default** - Fallback for all
2. **App Default** - Users in specific app
3. **App + Record Type** - Record type within app
4. **App + Record Type + Profile** - Most specific

### Best Practices

**Minimize Page Variations:**
- Use visibility rules instead of multiple pages
- Create new page only when component structure differs significantly

**Assignment Strategy by Scenario:**

| Scenario | Approach |
|----------|----------|
| Same components, different visibility | One page + visibility rules |
| Different components needed | Multiple pages |
| Different apps need different views | Per-app assignment |
| Single org, consistent experience | Org default only |

---

## Performance Considerations

### Page Load Optimization

1. **Limit component count** - Each component adds load time
2. **Use visibility rules** - Hidden components don't load
3. **Lazy load where possible** - Put heavy components in tabs
4. **Optimize related lists** - Limit columns and rows

### Heavy Components to Watch

| Component | Impact | Mitigation |
|-----------|--------|------------|
| Report Chart | API call per chart | Limit to 1-2, use tabs |
| Rich Analytics | Heavy rendering | Use only when needed |
| Custom LWC | Varies | Profile custom code |
| Many Related Lists | Multiple queries | Use Related List Quick Links |

### Mobile Optimization

- Test page on mobile view
- Keep critical info above the fold
- Reduce component count for mobile
- Use single-column layout for mobile-specific pages

---

## Implementation Workflow

### Step 1: Plan Layout

Use `layout-planning-guide` skill to determine:
- Target persona(s)
- Fields to include
- Components needed
- Visibility rules

### Step 2: Build in App Builder

1. Open Lightning App Builder
2. Select Record Page > Object
3. Choose template
4. Add components to regions
5. Configure each component
6. Set visibility rules
7. Save

### Step 3: Activate Page

1. Click Activation
2. Choose assignment level:
   - Org Default
   - App Default
   - App + Record Type + Profile
3. Confirm assignments

### Step 4: Deploy to Other Orgs

1. Retrieve FlexiPage:
   ```bash
   sf project retrieve start -m "FlexiPage:PageName"
   ```
2. Deploy to target:
   ```bash
   sf project deploy start -m "FlexiPage:PageName"
   ```
3. Include profiles/apps if needed:
   ```bash
   sf project deploy start -m "FlexiPage:PageName,Profile:SalesUser"
   ```

---

## Reference Documentation

For detailed guidance, see:
- `template-selection.md` - Detailed template comparison
- `component-library.md` - Complete component reference
- `dynamic-visibility.md` - Visibility rule patterns
- `default-tab-strategy.md` - Landing tab recommendations
