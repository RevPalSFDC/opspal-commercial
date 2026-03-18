---
name: generate-client-briefing
description: Generate executive briefing from client's NotebookLM knowledge base
argument-hint: "<org-alias> [type] [period]"
allowed_tools:
  - mcp__notebooklm__notebook_query
  - mcp__notebooklm__studio_briefing_create
  - mcp__asana__asana_create_task
  - Read
  - Write
  - Task
arguments:
  - name: org
    description: Client org alias (e.g., eta-corp, acme)
    required: true
  - name: type
    description: Briefing type (weekly, monthly, executive, custom)
    required: false
    default: weekly
  - name: period
    description: Time period to cover (e.g., "past 2 weeks", "Q4 2024")
    required: false
    default: past 2 weeks
---

# Generate Client Briefing

Generate an executive briefing document from a client's NotebookLM knowledge base.

## Usage

```
/generate-client-briefing <org-alias> [type] [period]
```

## Examples

```
/generate-client-briefing eta-corp
/generate-client-briefing acme weekly "past 2 weeks"
/generate-client-briefing acme-corp monthly "January 2025"
/generate-client-briefing gamma-corp executive "Q4 2024"
```

## Briefing Types

| Type | Focus | Length |
|------|-------|--------|
| **weekly** | Recent activity, immediate priorities | 1-2 pages |
| **monthly** | Progress summary, metrics, trends | 2-3 pages |
| **executive** | Strategic overview, ROI, recommendations | 3-4 pages |
| **custom** | User-defined focus areas | Variable |

## Workflow

1. **Load Notebook**: Find client's notebook from registry
2. **Query Context**: Ask NotebookLM focused questions based on briefing type
3. **Generate Content**: Use studio_briefing_create for professional formatting
4. **Save Draft**: Store in `instances/{org}/notebooklm/drafts/`
5. **Create Review Task**: Asana task for human approval
6. **Report Location**: Show draft path and review instructions

## Output Structure

### Weekly Briefing
```
# {Client} Weekly Briefing
## Week of {Date}

### Executive Summary
- Key accomplishments
- Current priorities
- Blockers/risks

### This Week's Activity
- Assessments completed
- Issues addressed
- Recommendations made

### Next Week's Focus
- Planned activities
- Pending decisions
- Required resources

### Metrics Snapshot
- Key KPIs
- Trend indicators
```

### Monthly Briefing
```
# {Client} Monthly Report
## {Month Year}

### Executive Summary
### Progress Against Goals
### Key Accomplishments
### Metrics & Trends
### Challenges & Solutions
### Recommendations
### Next Month's Priorities
```

### Executive Briefing
```
# {Client} Executive Overview
## {Period}

### Strategic Summary
### ROI Analysis
### Initiative Progress
### Risk Assessment
### Competitive Landscape
### Strategic Recommendations
### Investment Priorities
```

## File Output

```
instances/{org}/notebooklm/
├── drafts/
│   └── briefing-{date}.md         # Generated briefing
│   └── briefing-{date}.json       # Metadata
├── approved/
│   └── briefing-{date}.md         # After review
└── delivered/
    └── briefing-{date}.md         # Sent to client
```

## Review Process

After generation, an Asana task is created with:

**Title**: Review {Client} {Type} Briefing

**Description**:
```
A {type} briefing has been generated for {client}.

Draft location: instances/{org}/notebooklm/drafts/briefing-{date}.md

## Review Checklist
- [ ] Factual accuracy verified
- [ ] No sensitive internal details exposed
- [ ] Tone appropriate for client audience
- [ ] Recommendations align with current strategy
- [ ] Metrics and figures are current
- [ ] Action items are actionable

## Actions
- If APPROVED: Move to approved/ folder
- If EDITS NEEDED: Edit directly or regenerate
- If REJECTED: Delete draft, document reason
```

## Query Templates by Type

### Weekly
1. "Summarize all activity and changes from the past 2 weeks"
2. "What are the current top 3 priorities?"
3. "What blockers or risks were identified?"
4. "What recommendations were made?"

### Monthly
1. "Summarize progress and accomplishments this month"
2. "What metrics have changed and how?"
3. "What challenges were encountered and how were they addressed?"
4. "What are the recommendations for next month?"

### Executive
1. "Provide a strategic overview of the client's current state"
2. "What is the ROI of initiatives to date?"
3. "What are the key risks and mitigation strategies?"
4. "What strategic recommendations should be prioritized?"

## Error Handling

| Error | Resolution |
|-------|------------|
| Notebook not found | Run `/notebook-init {org}` first |
| Query budget exhausted | Wait until tomorrow or use cached data |
| Auth expired | Run setup-notebooklm-auth.sh |
| Generation failed | Retry or create manually from query results |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| NOTEBOOKLM_AUTO_SYNC | true | Auto-sync before briefing |
| ASANA_CREATE_REVIEW_TASK | true | Create Asana review task |
| BRIEFING_OUTPUT_FORMAT | markdown | Output format (markdown, html) |
