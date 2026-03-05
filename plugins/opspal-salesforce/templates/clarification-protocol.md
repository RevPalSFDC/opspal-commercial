# Expectation Clarification Protocol

**Purpose**: Prevent "automated solution" overselling by analyzing feasibility first

**Problem Solved** (39 reflections):
- Agents claim "built and deployed" when manual UI steps required
- Missing orchestrator detection for complex multi-step tasks
- Unclear scope interpretation leading to incorrect implementations
- No clarification on data attribution methods or calculation approaches

**ROI**: Prevents 39 expectation mismatches, $5,400/year

---

## When to Use This Protocol (AUTO-TRIGGERED)

This protocol **MUST** be triggered when user request involves:

1. **Automation Keywords**
   - "build", "create", "automate", "deploy", "implement"
   - Combined with: "flow", "trigger", "workflow", "process"

2. **Ambiguous Scope**
   - "for the opp goals" (which goals?)
   - "update the report" (which sections?)
   - "regenerate" (which components?)

3. **Data Attribution/Ownership**
   - "attribute to", "owned by", "assigned to"
   - "current", "original", "historical"

4. **Multi-Step Indicators**
   - "then", "after", "before", "depends on"
   - Numbered lists (1., 2., 3.)
   - "phases", "steps", "stages"

5. **Report/Analysis Modifications**
   - "add column", "calculate", "measure"
   - "compare", "analyze", "report on"

6. **Field Value Manipulation** (NEW - prevents prefix/suffix ambiguity)
   - "append", "prepend", "prefix", "suffix"
   - "add to field", "concatenate", "merge values"
   - "rename", "update name", "add account name"

---

## Protocol Steps

### Step 1: Pause and Analyze Feasibility

**Before accepting request, perform feasibility analysis:**

```markdown
## Internal Feasibility Check (Show user)

Analyzing request: "[User's request in their words]"

### Components Involved
- [ ] Salesforce Objects: [List objects]
- [ ] Fields: [List fields]
- [ ] Automation Type: [Flow/Trigger/Apex/Manual]
- [ ] UI Components: [Screen flows, pages, etc.]

### Automation Capabilities Assessment

✅ **Can Automate** (via Metadata API):
- Flow logic (conditions, assignments, loops)
- Field formulas and validation rules
- Record creation/updates
- Email alerts
- [Specific automatable components...]

⚠️ **Requires Manual UI Work** (Metadata API limitations):
- Screen flow components (multi-select checkboxes, data tables)
- Quick Action input variable mappings
- Flow activation (for security)
- Field Permission grants (when Profile already has access)
- [Specific UI-only components...]

❌ **Cannot Automate**:
- Manual testing/validation
- User acceptance testing
- Production deployment approval
- [Specific non-automatable steps...]

### Effort Breakdown

| Phase | Automation | Manual | Total |
|-------|------------|--------|-------|
| Development | 15 min | 0 min | 15 min |
| UI Configuration | 0 min | 10 min | 10 min |
| Testing | 5 min | 10 min | 15 min |
| Deployment | 2 min | 3 min | 5 min |
| **Total** | **22 min** | **23 min** | **45 min** |

**Automation Coverage**: 49% automated, 51% manual
```

### Step 2: Present Automation Breakdown to User

**Template:**

````markdown
Based on my analysis, here's what I can and cannot automate for this request:

## Automation Breakdown

### ✅ I Can Automate (60% of work)
1. **Flow Logic** - Create flow with all conditions and assignments (15 minutes)
2. **Field Formulas** - Create calculated fields (5 minutes)
3. **Test Deployment** - Deploy to sandbox (2 minutes)

**Estimated Automated Time**: 22 minutes

### ⚠️ Requires Your Help (40% of work)
1. **Screen Components** - Multi-select checkboxes must be configured in Flow Builder UI (10 minutes)
2. **Flow Activation** - You'll need to activate the flow manually for security (2 minutes)
3. **User Acceptance Testing** - Test with real data scenarios (10 minutes)

**Estimated Manual Time**: 22 minutes

### ❌ Cannot Automate
- Production deployment approval (requires review)

---

## Proposed Approach

**Option 1: Partial Automation** (Recommended)
- I'll create the flow structure with all logic
- Provide step-by-step instructions for UI configuration
- You complete the manual steps

**Option 2: Fully Manual**
- I'll provide detailed implementation guide
- You build it in Flow Builder UI
- Useful if you want to learn the process

**Option 3: Defer to Specialist**
- This task requires [specific expertise]
- Recommend invoking [specific agent] for optimal results

---

**Which approach would you prefer?**
````

### Step 3: Get Explicit User Confirmation

**DO NOT proceed until user responds with:**
- ✅ "Yes, proceed with Option 1"
- ✅ "Option 2 sounds better"
- ✅ "Go ahead with partial automation"

**DO NOT assume:**
- ❌ Silence means yes
- ❌ "Sounds good" means proceed (clarify which option)
- ❌ User understands manual steps required

---

## Scope Clarification Templates

### Template D: Metric Semantics Clarification

**Trigger**: Report or dashboard request involving revenue metrics (pipeline, bookings, ARR, ACV, TCV, win rate, sales cycle)

```markdown
## Metric Semantics Clarification Needed

To ensure this report is accurate, I need to confirm field conventions:

### Question 1: Metric Variant
Which metric definition should I use?
- [ ] Pipeline (ARR)
- [ ] Pipeline (TCV)
- [ ] Bookings (TCV)
- [ ] Bookings (ACV)
- [ ] Revenue (Recognized Schedule)
- [ ] ARR (Subscription)
- [ ] ACV (Contract)
- [ ] TCV (Contract)
- [ ] Win Rate (Count)
- [ ] Win Rate (Value)
- [ ] Sales Cycle Length (Won)

### Question 2: Amount Field
Which field represents the deal value for this metric?
- [ ] Standard Amount
- [ ] Custom field (name?)
- [ ] Derived from products/schedules

### Question 3: Time Field
Which date should be used for time filters?
- [ ] CloseDate
- [ ] CreatedDate
- [ ] Revenue/Schedule date
- [ ] Custom date field

Once confirmed, I will persist this mapping for the org and log it to the runbook.
```

### Template A: Data Attribution Clarification

**Trigger**: Request mentions "attribute", "owned by", "assigned to", "current"

```markdown
## Scope Clarification Needed

I want to make sure I understand your data attribution requirements:

### Question 1: Attribution Method
Which value should I use for [Field Name]?

**Option A: Current Owner/Assignee**
- Uses: Current value in Salesforce as of today
- Example: Opportunity currently owned by "John Smith"
- Use when: You want to measure current state

**Option B: Original Creator/Assignee**
- Uses: Historical value from creation date
- Example: Opportunity originally created by "Jane Doe"
- Use when: You want to measure who initiated the record

**Option C: Activity-Based Attribution**
- Uses: Person with most activity on the record
- Example: Person with most emails/calls/meetings
- Use when: You want to measure engagement

**Which attribution method should I use?** (A/B/C or describe custom)

### Question 2: Scope
Should this apply to:
- [ ] All records in the report
- [ ] Only specific sections (which ones?)
- [ ] New calculation column (preserve existing)

### Question 3: Validation
Here's an example calculation with your approach:

| Record | Current Owner | Original Creator | Calculated Value |
|--------|---------------|------------------|------------------|
| Opp-001 | John Smith | Jane Doe | [Show result] |

**Is this what you expect?** (Yes/No/Modify)
```

### Template B: Multi-Step Orchestration Detection

**Trigger**: Request has 3+ distinct steps or dependency chain

```markdown
## Complex Task Detected - Orchestration Recommended

Your request involves **[N] interconnected steps**:

1. [Step 1 description]
2. [Step 2 description - depends on Step 1]
3. [Step 3 description - depends on Step 2]
4. [...]

### Orchestration Analysis

**Dependencies**:
- Step 2 requires: Output from Step 1
- Step 3 requires: Validation from Step 2
- Step 4 requires: All previous steps complete

**Risk without Orchestration**: High
- If Step 2 fails, Step 3 may use stale data
- Manual coordination required between steps
- Error recovery is manual

### Recommended Approach

**Option 1: Use Orchestration Agent** (Recommended for complexity)
- Invoke `sfdc-orchestrator` to coordinate all steps
- Automatic error handling and rollback
- Progress tracking and reporting
- **Estimated Time**: [Time] with orchestration

**Option 2: Manual Step-by-Step** (If you prefer control)
- I'll guide you through each step sequentially
- You run each step and confirm before next
- More control but slower
- **Estimated Time**: [Time] with manual coordination

**Which approach would you prefer?**
```

### Template C: Report Modification Clarification

**Trigger**: Request mentions "update report", "add column", "calculate", "regenerate"

```markdown
## Report Modification Clarification

I want to ensure I'm modifying the correct parts of your report:

### Question 1: Scope
Which sections should I update?

- [ ] Entire report (all tables and calculations)
- [ ] Specific section: [Section name]
- [ ] Only new columns (preserve existing)

### Question 2: Calculation Method
For the new calculation, should I use:

**Option A: Verified Data Only**
- Uses: Actual SFDC values when available
- Falls back to: NULL or 0 when missing
- Pro: 100% accurate where data exists
- Con: May show NULL for incomplete records

**Option B: Calculated Estimates**
- Uses: Derived formulas when actual data missing
- Falls back to: Estimation based on available fields
- Pro: Complete coverage (no NULLs)
- Con: Mixed actual + calculated values

**Option C: Hybrid with Labels**
- Uses: Actual data when available
- Shows: "✓ Verified" vs "* Calculated" labels
- Pro: Clear data source transparency
- Con: Requires documentation in report

**Which method should I use?** (A/B/C)

### Question 3: Preview
Here's a preview of one row with your selected method:

| Field | Value | Source |
|-------|-------|--------|
| SFDC Amount | $50,000 | ✓ Verified |
| Calculated Value | $45,000 | * Estimated |
| [Your new column] | [Preview value] | [Source] |

**Does this match your expectation?** (Yes/No)
```

### Template E: Field Value Manipulation Clarification

**Trigger**: Request mentions "append", "prepend", "prefix", "suffix", "add to field", "concatenate", "merge values"

**Root Cause** (4 reflections, Feb 2026): "Append Account Names" was ambiguous - agent interpreted as suffix when user meant prefix. Caused incorrect Opportunity Name CSV generation.

```markdown
## Field Value Manipulation Clarification Needed

Your request involves modifying field values. To prevent errors, I need to confirm the operation:

### Question 1: Position
Where should the new value be placed relative to the existing value?

**Option A: Prefix (Before)**
- Result: `{new_value}{separator}{existing_value}`
- Example: "Acme Corp" + "Renewal 2026" → "Acme Corp - Renewal 2026"

**Option B: Suffix (After)**
- Result: `{existing_value}{separator}{new_value}`
- Example: "Renewal 2026" + "Acme Corp" → "Renewal 2026 - Acme Corp"

**Option C: Replace**
- Result: `{new_value}` (overwrites existing)
- Example: "Renewal 2026" → "Acme Corp - Renewal 2026"

**Which position?** (A/B/C)

### Question 2: Separator
What character should go between the values?
- [ ] Space: " "
- [ ] Dash: " - "
- [ ] Colon: ": "
- [ ] None (direct concatenation)
- [ ] Custom: ___

### Question 3: Preview
Here's a preview with your selected options applied to sample records:

| Record | Current Value | New Input | Result |
|--------|--------------|-----------|--------|
| Record-001 | [existing] | [new] | [preview] |
| Record-002 | [existing] | [new] | [preview] |

**Does this match your expectation?** (Yes/No)
```

**IMPORTANT**: The word "append" is AMBIGUOUS. Never assume it means suffix.
- When user says "append X to Y" → ALWAYS ask: "Should X go BEFORE or AFTER Y?"
- When user says "add X" → ALWAYS ask: "As a prefix (beginning) or suffix (end)?"

---

## Integration with Agents

### sfdc-automation-builder.md

Add to agent prompt:

```markdown
## MANDATORY: Pre-Execution Protocol

Before accepting any automation request, you MUST:

1. **Import Clarification Protocol**
   ```
   @import ../templates/clarification-protocol.md
   ```

2. **Trigger Feasibility Analysis**
   - If request includes automation keywords → Run Step 1 (Feasibility Check)
   - If request involves 3+ steps → Use Template B (Orchestration Detection)
   - If request is ambiguous → Use appropriate Template (A, B, or C)

3. **Present Breakdown**
   - Always show automation percentage
   - Always list manual steps required
   - Always provide effort estimates

4. **Get Explicit Confirmation**
   - Wait for user to select option
   - Do NOT proceed without confirmation

**NEVER say "I'll build and deploy" without completing this protocol first.**
```

### sfdc-data-operations.md

Add to agent prompt:

```markdown
## MANDATORY: Data Attribution Clarification

Before executing any data operation involving attribution/ownership:

1. **Import Clarification Protocol**
   ```
   @import ../templates/clarification-protocol.md
   ```

2. **Use Template A** (Data Attribution Clarification)
   - Present all attribution options
   - Show example calculation
   - Get explicit user choice

**NEVER assume attribution method without clarification.**
```

### sfdc-enrichment-manager.md / sfdc-upsert-orchestrator.md

Add to agent prompt:

```markdown
## MANDATORY: Field Value Manipulation Clarification

Before executing any operation that modifies existing field values (append, prepend, concatenate, rename):

1. **Import Clarification Protocol**
   ```
   @import ../templates/clarification-protocol.md
   ```

2. **Use Template E** (Field Value Manipulation Clarification)
   - Clarify position: PREFIX (before) or SUFFIX (after)
   - Clarify separator character
   - Show preview with sample records

**NEVER use the word "append" without clarifying prefix vs suffix.**
**NEVER assume position - ALWAYS ask.**
```

### sfdc-reports-dashboards.md

Add to agent prompt:

```markdown
## MANDATORY: Report Modification Clarification

Before modifying any report/dashboard:

1. **Import Clarification Protocol**
   ```
   @import ../templates/clarification-protocol.md
   ```

2. **Use Template C** (Report Modification Clarification)
   - Clarify scope (entire report vs specific sections)
   - Clarify calculation method (verified vs calculated vs hybrid)
   - Show preview of changes

**NEVER modify reports without clarification and preview approval.**
```

---

## Example Usage

### Example 1: Automation Request

**User**: "Create a flow that auto-creates contracts when an opportunity closes"

**Agent Response** (using this protocol):

```markdown
## Automation Feasibility Analysis

I can help create this flow! Let me break down what's involved:

### ✅ I Can Automate (75%)
1. Flow trigger on Opportunity.StageName = "Closed Won"
2. Contract record creation with field mappings
3. Field assignments from Opportunity to Contract
4. Sandbox deployment

**Automated Time**: 20 minutes

### ⚠️ Requires Manual Work (25%)
1. Flow activation (you'll click "Activate" button - 1 minute)
2. Test with real Opportunity data (10 minutes)
3. Production deployment approval (5 minutes)

**Manual Time**: 16 minutes

---

**Total Effort**: 36 minutes (75% automated)

**Proceed with Option 1 (Partial Automation)?**
```

### Example 2: Ambiguous Request

**User**: "Update the scorecard to attribute opportunities to the original CSM"

**Agent Response** (using Template A):

```markdown
## Scope Clarification Needed

I want to clarify your attribution requirements:

### Question 1: Which "Original CSM" do you mean?

**Option A: Opportunity Owner at Creation**
- Uses: User who created the Opportunity record
- Example: Jane Doe created Opp-001 on Jan 1

**Option B: Account CSM at Opp Creation**
- Uses: CSM assigned to parent Account when Opp was created
- Example: John Smith was Account CSM on Jan 1

**Option C: First CSM with Activity**
- Uses: First CSM to log a call/email/meeting
- Example: Sarah Johnson logged first call on Jan 5

**Which definition should I use?** (A/B/C)

### Question 2: Should I update...
- [ ] Only the CSM Attribution column
- [ ] All scorecard calculations
- [ ] Create new column (preserve existing)

### Question 3: Preview
Here's what one row would look like with Option A:

| Opportunity | Current Owner | Original Creator | CSM Attribution |
|-------------|---------------|------------------|-----------------|
| Opp-001 | John Smith | Jane Doe | Jane Doe |

**Is this correct?** (Yes/No)
```

---

## Success Metrics

**Track post-implementation (30 days):**

| Metric | Baseline | Target |
|--------|----------|--------|
| "What did you mean?" questions | 4/month | < 1/month |
| Automation re-work | 3/month | 0/month |
| User satisfaction with clarity | N/A | > 90% |
| Manual steps discovered late | 2/month | 0/month |

**Expected Outcomes**:
- 75% reduction in clarification requests
- 100% elimination of "I thought you said you'd build it" issues
- 90%+ user satisfaction with expectation setting

---

## Maintenance

**Review quarterly**:
- Add new ambiguous patterns as discovered
- Update templates based on user feedback
- Refine effort estimation accuracy

**Last Updated**: 2025-10-31
**Status**: ✅ Ready for Integration
