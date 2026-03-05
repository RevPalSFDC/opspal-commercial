# Object-Specific Layout Templates

## Overview

Object-specific templates define field arrangements, sections, components, and related lists optimized for particular Salesforce objects. These templates complement persona templates by providing object-specific best practices.

## Available Templates

### Opportunity Templates (3)

#### sales-cloud-default.json
**Use Case**: Standard Salesforce Opportunity without CPQ

**Fields**:
- Primary: Name, Account, Amount, CloseDate, Stage, Probability
- Additional: Type, LeadSource, NextStep, Description, ForecastCategory

**Components**: Highlights Panel, Path, Activities, Contact Roles, Quotes

**Target Personas**: sales-rep, sales-manager

---

### Account Templates (1)

#### default.json
**Use Case**: Standard Account for all use cases

**Fields**:
- Primary: Name, Type, Industry, Revenue, Employees
- Contact: Phone, Website, Billing/Shipping Address
- Additional: Parent, Source, SLA, Description

**Components**: Highlights Panel, Activities, Contacts, Opportunities, Cases

**Target Personas**: sales-rep, sales-manager, executive, support-agent

---

### Case Templates (1)

#### service-cloud-default.json
**Use Case**: Service Cloud case management with SLA tracking

**Fields**:
- Primary: CaseNumber, Subject, Status, Priority, Type, Reason
- Customer: Account, Contact, Supplied Contact Info
- SLA: SlaStartDate, SlaExitDate, IsEscalated

**Components**: Highlights Panel, Knowledge Articles, Activities, Emails

**Target Personas**: support-agent, support-manager

**Special Features**:
- Conditional SLA section (shows only when SLA active)
- Knowledge article recommendations

---

### Lead Templates (1)

#### default.json
**Use Case**: Lead qualification and conversion

**Fields**:
- Primary: Name, Company, Title, Email, Phone, Status, Rating
- Address: Full address fields
- Qualification: Industry, Revenue, Employees

**Components**: Highlights Panel, Path, Activities, Campaign History

**Target Personas**: sales-rep, sales-manager

---

### Contact Templates (1)

#### default.json
**Use Case**: Relationship management and stakeholder tracking

**Fields**:
- Primary: Name, Account, Title, Department, Email, Phone
- Hierarchy: ReportsTo
- Additional: Address, Birthdate, LeadSource

**Components**: Highlights Panel, Activities, Opportunities, Cases

**Target Personas**: sales-rep, sales-manager, support-agent

---

## Template Structure

Each object template contains:

```json
{
  "object": "Opportunity",
  "template": "sales-cloud-default",
  "label": "Sales Cloud - Standard Opportunity",
  "description": "...",
  "targetPersonas": ["sales-rep", "sales-manager"],
  "sections": [
    {
      "label": "Section Name",
      "order": 1,
      "fields": ["Field1", "Field2"],
      "columns": 2
    }
  ],
  "compactLayoutFields": ["Field1", "Field2", "Field3"],
  "components": {
    "header": [...],
    "main": [...],
    "sidebar": [...]
  },
  "relatedLists": [...],
  "conditionalVisibility": [...]
}
```

## Usage

### With Template Engine

```bash
node scripts/lib/layout-template-engine.js my-org Opportunity sales-rep \
  --object-template sales-cloud-default \
  --persona-template sales-rep
```

The engine will:
1. Load object template (sales-cloud-default.json)
2. Load persona template (sales-rep.json)
3. Merge field priorities from both
4. Generate optimized FlexiPage metadata

### Priority Resolution

When both object and persona templates specify field priorities:

1. **Object template takes precedence** for field inclusion and section assignment
2. **Persona template takes precedence** for component selection and layout characteristics
3. **Field scores** are calculated from both (persona priority + object-specific context)

## Creating New Templates

### 1. Identify Use Case

Define:
- Object and variant (e.g., Opportunity in CPQ vs standard Sales Cloud)
- Target personas (who uses this layout?)
- Required fields (what data is essential?)
- Key components (Path, Knowledge, etc.)

### 2. Define Sections

Group fields logically:
- **Primary section**: 8-10 most critical fields
- **Additional sections**: 10-15 fields each
- **Conditional sections**: Show based on field values or profile

### 3. Select Components

Choose appropriate components:
- **Header**: Highlights Panel, Path (if status/stage object)
- **Main**: Field Sections, Activities, Chatter
- **Sidebar**: Related lists (3-5 max)

### 4. Define Related Lists

Prioritize by frequency of use:
- **Must-have**: Core relationships (Contact Roles for Opp, Contacts for Account)
- **Nice-to-have**: Secondary (Campaign History, Notes)

### 5. Add Conditional Visibility

Define rules for context-specific sections:
```json
"conditionalVisibility": [
  {
    "section": "SLA Information",
    "condition": "SlaStartDate != null",
    "description": "Show SLA fields only when case is under SLA"
  }
]
```

### 6. Test Template

```bash
# Generate layout
node layout-template-engine.js sandbox {Object} {persona} \
  --object-template {template-name} \
  --verbose

# Validate quality
node layout-analyzer.js sandbox {Object}
```

Target score: 85+ (B or better)

## Best Practices

### Field Selection

- ✅ Include all required fields
- ✅ Prioritize fields with >80% fill rate
- ✅ Group related fields together
- ❌ Don't exceed 100 fields on default layouts
- ❌ Don't include deprecated or rarely-used fields

### Section Design

- ✅ 3-6 sections optimal
- ✅ 8-15 fields per section
- ✅ Clear, descriptive section labels
- ❌ Don't create >8 sections (too many tabs)
- ❌ Don't mix unrelated fields in one section

### Component Placement

- ✅ Highlights Panel in header (always)
- ✅ Path component for objects with status/stage
- ✅ Activities in main region
- ✅ Related lists in sidebar
- ❌ Don't overload with >15 total components

### Related Lists

- ✅ Limit to 5-7 related lists
- ✅ Prioritize by user workflow
- ✅ Use Quick Links for low-priority lists
- ❌ Don't show all possible related lists

## Version History

### v1.0.0 (2025-10-18)
- Initial release with 5 object templates
- Opportunity: sales-cloud-default
- Account: default
- Case: service-cloud-default
- Lead: default
- Contact: default

---

**Maintained By**: RevPal Engineering
**Last Updated**: 2025-10-18
