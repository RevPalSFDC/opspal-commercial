---
name: uat-build
description: Interactively build UAT test cases through guided questions
argument-hint: "[--output <path>] [--platform salesforce|hubspot] [--format csv|json]"
stage: ready
---

# UAT Test Case Builder

Build UAT test cases interactively through guided questions. Creates test cases compatible with `/uat-run`.

## Usage

```
/uat-build [--output <path>] [--platform salesforce|hubspot] [--format csv|json]
```

## Options

- `--output <path>` - Output file path (default: ./uat-test-case.json)
- `--platform <platform>` - Target platform: salesforce (default) or hubspot
- `--format <format>` - Output format: json (default) or csv

## Workflow

This command guides you through building a complete UAT test case:

### Step 1: Epic Selection
Choose or specify the Epic this test belongs to:
- CPQ Workflow
- Lead Management
- Account Management
- Custom epic name

### Step 2: User Story
Describe the user story being tested (e.g., "As a sales rep, I want to create quotes quickly")

### Step 3: Build Test Steps
For each step, you'll select:
1. **Action** - What the step does (Create, Update, Verify, Navigate, etc.)
2. **Object** - Which Salesforce/HubSpot object
3. **Expected Outcome** - What should happen (Success, Field match, Blocked, etc.)
4. **Precondition** - Optional conditions that must be met first

### Step 4: Review & Export
Review your complete test case and export to JSON or CSV format.

## Example Session

```
/uat-build --platform salesforce

> What Epic does this test belong to?
  [x] CPQ Workflow

> What platform are you testing?
  [x] Salesforce

> Step 1: What action should this step perform?
  [x] Navigate

> Which Salesforce object?
  [x] Account

> What is the expected outcome?
  [x] Success

> Add another step?
  [x] Add Another Step

> Step 2: What action should this step perform?
  [x] Create Record

> Which Salesforce object?
  [x] Opportunity

...

Generated test case saved to: ./uat-test-case.json
```

## Output Formats

### JSON Output

```json
{
  "epic": "CPQ Workflow",
  "userStory": "As a sales rep, I want to create quotes quickly",
  "acceptanceCriteria": "Given an Account, When creating a quote, Then quote is linked",
  "scenario": "From Account -> Create Opportunity -> Create Quote -> Verify Quote linked",
  "steps": [
    {
      "stepNumber": 1,
      "raw": "From Account",
      "action": "navigate",
      "object": "Account",
      "expectedOutcome": "success"
    },
    {
      "stepNumber": 2,
      "raw": "Create Opportunity",
      "action": "create",
      "object": "Opportunity",
      "expectedOutcome": "success"
    }
  ],
  "metadata": {
    "platform": "salesforce",
    "createdAt": "2025-01-15T10:00:00.000Z",
    "stepCount": 4
  }
}
```

### CSV Output

```csv
Epic,User Story,Acceptance Criteria,Test Scenarios,Result,Pass/Fail,Test Record URL,Tester Comments
CPQ Workflow,"As a sales rep, I want to create quotes quickly",Given...,From Account -> Create Opp -> Create Quote -> Verify,,,,
```

## Integration with /uat-run

Test cases created with `/uat-build` can be executed directly:

```bash
# Build a test case
/uat-build --output my-test.json

# Run the test case
/uat-run my-test.json --platform salesforce --org my-sandbox
```

## Implementation Notes

This command uses the `UATTestCaseBuilder` class from `scripts/lib/uat-test-case-builder.js`.

The builder generates questions compatible with Claude's `AskUserQuestion` tool, enabling:
- Structured multi-choice questions
- Optional custom input
- Step-by-step workflow
- Review before export

## Related Commands

- `/uat-run` - Execute UAT test cases
- `/reflect` - Submit session feedback

## See Also

- UAT Framework documentation in `scripts/lib/`
- Test fixtures in `scripts/lib/__fixtures__/`
