# Requirements Gathering Template

**Purpose:** Standardize proactive requirements gathering before creating user-facing deliverables

**Problem Solved:** Prevents rework due to missing requirements, deliverable format mismatches, and unmet user expectations (Reflection Cohort #1, P3 issue)

**Success Pattern:** Based on HiveMQ inventory generation success (Reflection 894217fb-2629-4d13-85e6-ae3185b5e557)
- Used AskUserQuestion with 4 multi-option questions
- Gathered ALL requirements before implementation
- Result: Zero rework, perfect deliverable match, 15-minute completion

**ROI:** Prevents 2+ hours/month of rework from requirement gaps = $7,200/year

---

## When to Use This Template

**Use AskUserQuestion BEFORE creating deliverables for:**
- ✅ Inventory generation (reports, dashboards, workflows, etc.)
- ✅ Audit reports and assessments
- ✅ Data exports and backups
- ✅ Documentation generation
- ✅ Recommendation reports
- ✅ Analysis and diagnostics

**DO NOT use for:**
- ❌ Internal processing scripts (no user-facing output)
- ❌ Validation checks (deterministic logic)
- ❌ Metadata queries (standard output format)

---

## Standard Requirements Gathering Templates

### Template 1: Inventory Generation

**Use for:** Reports, dashboards, workflows, objects, field inventories

```javascript
const questions = [
  {
    question: "What output format(s) would you like for the inventory?",
    header: "Output Format",
    multiSelect: true,
    options: [
      {
        label: "Excel Workbook",
        description: "Comprehensive workbook with multiple sheets for different aspects (recommended for business users)"
      },
      {
        label: "CSV Files",
        description: "Individual CSV files for each data type (recommended for technical users or imports)"
      },
      {
        label: "JSON",
        description: "Structured JSON for programmatic access or API integration"
      },
      {
        label: "Markdown Report",
        description: "Human-readable text format with tables and summaries"
      }
    ]
  },
  {
    question: "How should URLs be handled in the inventory?",
    header: "URL Handling",
    multiSelect: false,
    options: [
      {
        label: "Auto-detect instance URL",
        description: "Automatically extract from connected org and generate clickable URLs"
      },
      {
        label: "Include IDs only",
        description: "Just show Salesforce/HubSpot IDs without full URLs"
      },
      {
        label: "Skip URLs",
        description: "Don't include any URLs or IDs in output"
      }
    ]
  },
  {
    question: "What level of detail should recommendations include?",
    header: "Recommendations",
    multiSelect: false,
    options: [
      {
        label: "Detailed + Summary",
        description: "Full cleanup recommendations with priority levels PLUS executive summary"
      },
      {
        label: "Summary Only",
        description: "High-level summary with counts and quick wins"
      },
      {
        label: "Detailed Only",
        description: "Granular item-by-item recommendations without summary"
      },
      {
        label: "None",
        description: "Just inventory data without any recommendations"
      }
    ]
  },
  {
    question: "What additional fields should be included?",
    header: "Enrichment",
    multiSelect: true,
    options: [
      {
        label: "Last Modified / Last Run",
        description: "Include timestamps showing when items were last used"
      },
      {
        label: "Owner Information",
        description: "Include created by and modified by user details"
      },
      {
        label: "Dependencies",
        description: "Map relationships between items (e.g., reports used in dashboards)"
      },
      {
        label: "Risk Assessment",
        description: "Tag items with risk levels (HIGH/MEDIUM/LOW) for cleanup decisions"
      }
    ]
  }
];
```

**Expected Output:** User preferences clearly captured before ANY code generation

---

### Template 2: Audit Reports

**Use for:** Security audits, compliance assessments, org health checks

```javascript
const questions = [
  {
    question: "What is the primary audience for this audit report?",
    header: "Audience",
    multiSelect: false,
    options: [
      {
        label: "Executive/Business",
        description: "Focus on business impact, ROI, and high-level recommendations"
      },
      {
        label: "Technical/Admin",
        description: "Include technical details, configuration specifics, and implementation steps"
      },
      {
        label: "Compliance/Security",
        description: "Emphasize risks, violations, and remediation actions"
      },
      {
        label: "Mixed Audience",
        description: "Include executive summary + technical appendix"
      }
    ]
  },
  {
    question: "How should findings be prioritized?",
    header: "Prioritization",
    multiSelect: false,
    options: [
      {
        label: "Risk Level (P0-P3)",
        description: "Categorize by severity: Critical, High, Medium, Low"
      },
      {
        label: "Business Impact",
        description: "Prioritize by revenue impact, user experience, or strategic importance"
      },
      {
        label: "Effort to Fix",
        description: "Quick wins first, then medium effort, then long-term projects"
      },
      {
        label: "Compliance Requirements",
        description: "Regulatory must-haves first, then best practices"
      }
    ]
  },
  {
    question: "Should the report include implementation guidance?",
    header: "Implementation",
    multiSelect: true,
    options: [
      {
        label: "Step-by-step Remediation",
        description: "Detailed instructions for fixing each issue"
      },
      {
        label: "Code Samples",
        description: "Example validation rules, formulas, or configuration snippets"
      },
      {
        label: "Timeline Estimates",
        description: "Estimated effort (hours/days) for each remediation"
      },
      {
        label: "Recommendations Only",
        description: "What to fix without how-to instructions"
      }
    ]
  }
];
```

---

### Template 3: Data Export / Backup

**Use for:** Backup operations, data migrations, export tasks

```javascript
const questions = [
  {
    question: "What is the intended use of this data export?",
    header: "Export Purpose",
    multiSelect: false,
    options: [
      {
        label: "Safety Backup",
        description: "Pre-deployment safety net for rollback (minimal field set, fast export)"
      },
      {
        label: "Data Migration",
        description: "Full data export for org-to-org migration (all fields, relationships)"
      },
      {
        label: "Analysis/Reporting",
        description: "Data extract for analytics or external reporting (selected fields)"
      },
      {
        label: "Archival",
        description: "Long-term storage for compliance (comprehensive, with metadata)"
      }
    ]
  },
  {
    question: "Should the export use intelligent field selection or export all fields?",
    header: "Field Selection",
    multiSelect: false,
    options: [
      {
        label: "Intelligent (Recommended)",
        description: "Auto-select critical fields based on metadata (system, revenue, IDs, required) - 70-90% reduction"
      },
      {
        label: "All Fields",
        description: "Export FIELDS(ALL) - may hit memory limits on large objects (>200 fields)"
      },
      {
        label: "Custom Field List",
        description: "Specify exact fields to export (I'll provide the list)"
      }
    ]
  },
  {
    question: "What export format is preferred?",
    header: "Export Format",
    multiSelect: false,
    options: [
      {
        label: "CSV (Recommended for large objects)",
        description: "Efficient for >200 fields or >10K records, handles compound fields"
      },
      {
        label: "JSON",
        description: "Better for complex relationships, may hit memory limits on large datasets"
      },
      {
        label: "Both CSV and JSON",
        description: "Export both formats for flexibility"
      }
    ]
  }
];
```

---

### Template 4: Documentation Generation

**Use for:** README files, user guides, technical documentation

```javascript
const questions = [
  {
    question: "What level of technical detail should the documentation include?",
    header: "Detail Level",
    multiSelect: false,
    options: [
      {
        label: "Beginner-Friendly",
        description: "Explain concepts, avoid jargon, include context and why"
      },
      {
        label: "Intermediate",
        description: "Assume basic knowledge, focus on how-to and configuration"
      },
      {
        label: "Advanced/Technical",
        description: "Deep technical details, architecture, edge cases, troubleshooting"
      }
    ]
  },
  {
    question: "Should the documentation include code examples?",
    header: "Code Examples",
    multiSelect: true,
    options: [
      {
        label: "Usage Examples",
        description: "Copy-paste ready examples for common use cases"
      },
      {
        label: "Configuration Samples",
        description: "Example JSON/YAML/config files"
      },
      {
        label: "Troubleshooting Guide",
        description: "Common errors and how to fix them"
      },
      {
        label: "API Reference",
        description: "Function signatures, parameters, return values"
      }
    ]
  }
];
```

---

## Integration with Agents

### Add to Agent Backstory

```markdown
## Requirements Gathering (MANDATORY)

Before creating any user-facing deliverable (inventory, report, export, documentation):

1. **Check for template:** Use requirements gathering template from developer-tools-plugin
2. **Use AskUserQuestion:** Present template questions to user
3. **Capture preferences:** Record user selections in session notes
4. **Validate understanding:** Confirm preferences before implementation
5. **Only then proceed:** Start code generation with confirmed requirements

**Success Pattern (HiveMQ Inventory - Reflection 894217fb):**
- Asked 4 questions about format, URLs, recommendations, enrichment
- Gathered ALL preferences upfront
- Result: Zero rework, perfect deliverable, 15-minute completion

**Failure Pattern (Avoid):**
- Assume default format/preferences
- Create deliverable without confirmation
- Result: Rework required, user frustration, wasted time
```

### Example Usage in Agent

```markdown
You are sfdc-inventory-generator. When user requests an inventory:

**Step 1: Requirements Gathering (DO THIS FIRST)**
Load template: `developer-tools-plugin/templates/requirements-gathering-template.md` Section "Inventory Generation"

Use AskUserQuestion with the 4 standard questions:
1. Output format
2. URL handling
3. Recommendation detail level
4. Additional enrichment fields

**Step 2: Validate Understanding**
Confirm preferences with user before generating ANY code

**Step 3: Generate Inventory**
Use confirmed preferences to generate the exact deliverable user expects

**This prevents rework and ensures satisfaction on first delivery.**
```

---

## Success Criteria

**Adoption Rate:**
- ✅ 100% of deliverable tasks use requirements gathering template
- ✅ Measured via spot-check of 5 random deliverables/week

**Quality Improvement:**
- ✅ Zero "rework due to missing requirements" issues in next 30 days
- ✅ User feedback includes "got exactly what I needed" or similar

**Time Savings:**
- ✅ Prevents 2-4 hours/month of rework (P3 issue recurrence)
- ✅ ROI: $7,200/year

---

## Template Maintenance

**When to Update:**
- New deliverable type introduced (add new template section)
- User feedback reveals missing question dimension
- Success pattern identified in reflections

**Owner:** Developer Tools Plugin maintainer

**Version:** 1.0.0
**Last Updated:** 2025-10-18
**Based on:** Reflection Cohort #1 Analysis (P0/P3 issues)
