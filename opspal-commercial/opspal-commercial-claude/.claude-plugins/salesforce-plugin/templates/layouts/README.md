# Salesforce Layout Templates

## Overview

This directory contains persona-based templates for generating optimized Salesforce Lightning Pages, Classic Layouts, and Compact Layouts. Templates are used by the **Layout Designer** feature to create user-centric, high-quality layouts tailored to specific roles and use cases.

## Directory Structure

```
templates/layouts/
├── personas/           # User persona templates
│   ├── sales-rep.json
│   ├── sales-manager.json
│   ├── executive.json
│   ├── support-agent.json
│   └── support-manager.json
├── objects/           # Object-specific templates (Phase 2)
└── rules/             # Field importance and visibility rules (Phase 2)
```

## Persona Templates

### Sales Personas

#### sales-rep.json
**Role**: Individual Contributor (IC) Seller

**Focus**: Personal quota attainment, deal management, daily priorities

**Layout Characteristics**:
- Field Count: 50-100 (optimal: 50)
- Section Count: 4-6 (optimal: 4)
- Components: Path, Activities, Highlights Panel, Chatter
- Related Lists: Max 5 (Open Tasks, Contacts, Activities, Notes, Files)

**Key Questions**:
- What do I need to do today?
- Am I on track to hit quota?
- Which deals should I prioritize?
- Who do I need to follow up with?

**Use When**:
- Creating layouts for sales reps, BDRs, account executives
- Profile names containing: "Sales User", "AE", "BDR", "SDR"

---

#### sales-manager.json
**Role**: Sales Team Manager / Director

**Focus**: Team performance, coaching, deal risk management, quota tracking

**Layout Characteristics**:
- Field Count: 75-125 (optimal: 75)
- Section Count: 5-7 (optimal: 5)
- Components: Highlights Panel, Path, Report Charts, Team-related lists
- Related Lists: Max 8 (Opportunities, Contacts, Team, Activities, Quotes)

**Key Questions**:
- Which reps need coaching this week?
- Are we on pace to hit team quota?
- Which deals are at risk?
- Where should I focus my time?

**Use When**:
- Creating layouts for sales managers, directors, VPs
- Profile names containing: "Sales Manager", "Director", "VP Sales"

---

#### executive.json
**Role**: C-Level / VP Executive

**Focus**: Strategic decisions, quarterly targets, board reporting

**Layout Characteristics**:
- Field Count: 40-75 (optimal: 40)
- Section Count: 3-5 (optimal: 3)
- Components: Highlights Panel, Dashboard Components, Report Charts
- Related Lists: Max 4 (Key Contacts, Major Opportunities, Strategic Initiatives)

**Key Questions**:
- Are we on track to hit quarterly revenue targets?
- Where are our pipeline gaps?
- How is team productivity trending?
- What's our forecast accuracy?

**Use When**:
- Creating layouts for executives, C-suite, board members
- Profile names containing: "Executive", "CEO", "CFO", "CRO", "VP"

---

### Support Personas

#### support-agent.json
**Role**: Customer Support Representative

**Focus**: Case resolution, SLA compliance, customer communication

**Layout Characteristics**:
- Field Count: 60-110 (optimal: 60)
- Section Count: 5-7 (optimal: 5)
- Components: Highlights Panel, Activities, Knowledge, Quick Text, Macros
- Related Lists: Max 7 (Related Cases, Assets, Contacts, Emails, Articles)

**Key Questions**:
- What cases need attention today?
- Am I meeting my SLA targets?
- What's the customer's history?
- Who can I escalate to?

**Use When**:
- Creating layouts for support agents, CSRs, service reps
- Profile names containing: "Support", "Service", "Agent", "CSR"

---

#### support-manager.json
**Role**: Support Team Manager / Service Manager

**Focus**: Team performance, SLA compliance, customer satisfaction, escalations

**Layout Characteristics**:
- Field Count: 80-130 (optimal: 80)
- Section Count: 6-8 (optimal: 6)
- Components: Highlights Panel, Report Charts, Dashboard Components
- Related Lists: Max 9 (Cases by Agent, Escalations, Assets, Entitlements)

**Key Questions**:
- Which agents need coaching?
- Are we meeting our SLA targets?
- Which customers are at risk?
- What are our trending issues?

**Use When**:
- Creating layouts for support managers, service directors
- Profile names containing: "Support Manager", "Service Manager", "Customer Success Manager"

---

## Template Structure

Each persona template is a JSON file with the following structure:

```json
{
  "persona": "sales-rep",
  "label": "Sales Representative",
  "description": "...",
  "role": "Individual Contributor",
  "decisionScope": "...",
  "keyQuestions": ["...", "..."],
  "layoutCharacteristics": {
    "fieldCount": { "optimal": 50, "max": 100 },
    "sectionCount": { "optimal": 4, "max": 6 },
    "components": {
      "required": ["..."],
      "recommended": ["..."],
      "avoid": ["..."]
    },
    "relatedLists": {
      "max": 5,
      "priority": ["..."]
    }
  },
  "fieldPriorities": {
    "opportunity": {
      "criticalFields": ["..."],
      "importantFields": ["..."],
      "contextualFields": ["..."]
    },
    "account": { "..." },
    "contact": { "..." }
  },
  "compactLayoutFields": {
    "opportunity": ["...", "..."],
    "account": ["...", "..."]
  },
  "conditionalVisibility": {
    "rules": [
      {
        "name": "...",
        "condition": "...",
        "action": "..."
      }
    ]
  },
  "mobile": {
    "optimized": true,
    "maxFieldsFirstScreen": 15,
    "priority": "..."
  },
  "bestPractices": {
    "useDynamicForms": true,
    "useHighlightsPanel": true,
    "usePathComponent": true,
    "maxComponentsPerPage": 15
  }
}
```

## Using Templates

### Phase 1: Analysis (Current)

Templates are used as **reference** for analyzing existing layouts:

```bash
# Analyze layout quality
/analyze-layout --object Opportunity --org production

# Compare against sales-rep persona template
# Score based on how well layout matches persona best practices
```

### Phase 2: Generation (Coming Soon)

Templates will be used to **generate** new layouts:

```bash
# Generate layout from template
/design-layout --object Opportunity --persona sales-rep --org sandbox

# AI will:
# 1. Load sales-rep.json template
# 2. Query org for available fields
# 3. Apply field priorities from template
# 4. Generate FlexiPage metadata
# 5. Create compact layout
# 6. Deploy to sandbox
```

## Field Priority Levels

### criticalFields
- **Always included** in layout
- Placed in first section
- Required for persona to do their job
- Examples: Name, Amount, CloseDate, Status

### importantFields
- **Usually included** in layout
- Placed in primary sections (not first)
- Provide important context
- Examples: Type, LeadSource, NextStep, Description

### contextualFields
- **Conditionally included** based on space
- May be placed in later sections or tabs
- Useful but not essential
- Examples: Campaign, CreatedDate, LastModifiedDate

### lowPriorityFields
- **Rarely included** in default view
- May be omitted entirely or shown conditionally
- Low usage or relevance to persona
- Examples: FiscalYear, FiscalQuarter, Internal IDs

## Conditional Visibility Rules

Templates define when fields/sections should appear dynamically:

```json
{
  "name": "Closed Won Reason",
  "condition": "StageName = 'Closed Won'",
  "action": "Show section 'Win Analysis'"
}
```

This ensures layouts show the right information at the right time, reducing clutter and improving UX.

## Mobile Optimization

Each template specifies mobile-specific guidelines:

- **maxFieldsFirstScreen**: Maximum fields visible without scrolling on mobile
- **priority**: Which fields/info to prioritize on mobile view
- **optimized**: Whether persona requires mobile-optimized layout

## Best Practices

### Choosing the Right Persona

| Scenario | Persona | Why |
|----------|---------|-----|
| Sales rep managing 50+ opportunities | sales-rep | Focus on deal details and next actions |
| Sales manager with 10 direct reports | sales-manager | Focus on team metrics and deal risk |
| CFO reviewing quarterly pipeline | executive | Focus on high-level metrics and trends |
| Support agent handling 20 cases/day | support-agent | Focus on SLA compliance and customer context |
| Support manager with 15 agents | support-manager | Focus on team performance and escalations |

### Extending Templates

To create a custom template:

1. Copy closest existing template
2. Modify `fieldPriorities` for your use case
3. Adjust `layoutCharacteristics` (field count, sections)
4. Update `conditionalVisibility` rules
5. Save to `personas/` directory
6. Test with `/design-layout --persona custom-persona`

### Template Quality Standards

All templates should:
- ✅ Define field priorities for at least 3 standard objects
- ✅ Specify optimal and max field/section counts
- ✅ List required, recommended, and avoid components
- ✅ Include at least 3 conditional visibility rules
- ✅ Define compact layout fields
- ✅ Provide mobile optimization guidelines

## Version History

### v1.0.0 (2025-10-18)
- Initial release with 5 persona templates
- Sales personas: sales-rep, sales-manager, executive
- Support personas: support-agent, support-manager
- Complete field priorities for Opportunity, Account, Contact, Lead, Case

---

## Related Documentation

- [Layout Designer Guide](../../docs/LAYOUT_DESIGNER_GUIDE.md) - Complete usage guide
- [Layout Quality Scoring](../../docs/LAYOUT_QUALITY_SCORING.md) - Quality methodology
- [Agent: sfdc-layout-analyzer](../../agents/sfdc-layout-analyzer.md) - Analysis agent
- [Command: /analyze-layout](../../commands/analyze-layout.md) - Analysis command

---

**Maintained By**: RevPal Engineering
**Last Updated**: 2025-10-18
