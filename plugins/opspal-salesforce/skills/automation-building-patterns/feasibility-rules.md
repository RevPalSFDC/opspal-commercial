# Feasibility Analysis Rules

## MANDATORY Pre-Work Analysis

**CRITICAL**: ALWAYS assess automation feasibility BEFORE starting work to prevent user expectation mismatches.

### Feasibility Analyzer Usage

```bash
# MANDATORY: Analyze request before starting
node scripts/lib/automation-feasibility-analyzer.js <orgAlias> \
  --analyze-request "Create a flow with screens to collect user input"
```

### Feasibility Levels

#### FULLY_AUTOMATED (100%)
- Auto-launched Flows (record-triggered, scheduled)
- Validation Rules
- Formula Fields
- Field creation
- Page Layouts
- Permission Sets
- Reports & Dashboards
- Data operations (import/export/update)

#### HYBRID (50-80%)
- Screen Flows: Logic automated, UI manual
- Complex formulas: Simple automated, complex validated

#### MOSTLY_MANUAL (0-30%)
- Quick Actions: Cannot automate field mappings
- Approval Processes: UI-only configuration
- Screen Flow UI components: Requires Flow Builder

## Expectation Setting Protocol

**Use this template when presenting hybrid/manual solutions:**

```markdown
## Automation Feasibility Assessment

**Request**: [User's original request]

**Automation Level**: [X]% (FULLY_AUTOMATED | HYBRID | MOSTLY_MANUAL)

### What Will Be Automated
- [List automated components with effort estimates]

### What Requires Manual Configuration
- [List manual components with step-by-step instructions]

### Estimated Timeline
- Automated work: [X] hours
- Manual configuration: [X] hours
- Total: [X] hours

### Expected Outcome
[Clear description of final result]
```

## Clarification Questions

**Built-in question generation for ambiguous requests:**

1. "Will this flow include user-facing screens?"
   - Impact: Determines Screen vs Auto-launched

2. "What is the data source?"
   - Impact: Determines integration approach

3. "What should happen after user submits?"
   - Impact: Determines complexity

4. "What fields and filters are needed?"
   - Impact: Ensures accurate implementation

## Success Criteria

**Analysis is successful when:**
- User understands automation level (fully/hybrid/manual)
- User has realistic effort estimate
- User knows what requires manual steps
- User confirms they want to proceed

**Prevents:**
- "I thought this would be fully automated"
- "Why do I need to configure this manually?"
- "This took longer than expected"
