# AskUserQuestion Tool - Implementation Guide

## Overview

This guide provides a step-by-step process for integrating the `AskUserQuestion` tool into slash commands to create interactive, guided workflows with improved UX and reduced errors.

**Reference Implementation**: `/dedup` command in salesforce-plugin (`.claude-plugins/opspal-salesforce/commands/dedup.md`)

---

## Table of Contents

1. [When to Use AskUserQuestion](#when-to-use-askuserquestion)
2. [Tool Capabilities and Limitations](#tool-capabilities-and-limitations)
3. [Implementation Steps](#implementation-steps)
4. [Design Patterns](#design-patterns)
5. [Code Examples](#code-examples)
6. [Testing Checklist](#testing-checklist)
7. [Common Pitfalls](#common-pitfalls)

---

## When to Use AskUserQuestion

### ✅ Good Use Cases

- **Multi-step workflows** with decision points
- **Destructive operations** requiring confirmation
- **Resource selection** (orgs, files, projects)
- **Configuration choices** with tradeoffs
- **Feature toggles** (what to include/exclude)
- **Safety confirmations** before execution
- **Alternative approaches** with pros/cons

### ❌ Not Suitable For

- **Single-parameter commands** (use command arguments)
- **Read-only operations** (no confirmation needed)
- **Fully automated workflows** (no human decision needed)
- **High-frequency commands** (would be annoying)

---

## Tool Capabilities and Limitations

### What AskUserQuestion Can Do

✅ Present 1-4 questions per invocation
✅ Support 2-4 options per question
✅ Multi-select mode (select multiple options)
✅ Auto-include "Other" option for custom input
✅ Display option descriptions (explain tradeoffs)
✅ Show header tags for context

### What AskUserQuestion Cannot Do

❌ Validate user input (you must validate in command logic)
❌ Show dynamic content (questions are static at call time)
❌ Conditionally show questions (all questions shown at once)
❌ Provide file pickers or complex UI
❌ Show more than 4 questions at once

### Design Workarounds

**For conditional questions**: Use multiple AskUserQuestion calls in sequence
**For validation**: Check answers and re-ask if invalid
**For many options**: Group into categories or use search pattern

---

## Implementation Steps

### Step 1: Analyze Current Command

1. **Read the existing command file**
   ```bash
   cat .claude-plugins/{plugin}/commands/{command}.md
   ```

2. **Identify decision points**
   - Where does the command ask for user input?
   - Where are there multiple approaches?
   - Where could wrong input cause errors?

3. **Map parameter dependencies**
   - What must be known first?
   - What choices depend on previous answers?
   - What can be asked in parallel?

### Step 2: Design Question Flow

1. **Create a question map**
   ```
   Q1: What do you want to do?
   ├─ Option A → Q2a: How should we do A?
   ├─ Option B → Q2b: How should we do B?
   └─ Help → Show documentation

   Q3: Confirm with summary
   ```

2. **Draft question text**
   - Keep questions under 80 characters
   - Use clear, specific language
   - Avoid technical jargon unless necessary

3. **Draft option labels and descriptions**
   - Labels: 1-5 words, action-oriented
   - Descriptions: Explain consequence/tradeoff
   - Use consistent tone across options

### Step 3: Update Command Frontmatter

Add these fields to the YAML frontmatter:

```yaml
---
name: command-name
description: Command description
arguments:
  - name: arg1  # Keep existing arguments for backward compatibility
    description: Description
    required: false  # Make optional if using interactive mode
# ... existing fields ...
---
```

**Note**: Arguments should remain optional if the command now supports interactive mode.

### Step 4: Add Interactive Mode Section

Add this section early in the command documentation:

```markdown
## Usage

### Interactive Mode (Recommended)
\`\`\`
/command-name
\`\`\`
When no arguments are provided, you'll get an interactive menu to guide you through the workflow.

### Direct Mode
\`\`\`
/command-name {arg1} {arg2}
\`\`\`
For automation or when you already know the parameters.

## Interactive Workflow

When you run \`/command-name\` without arguments, you'll be prompted with these menus:

### Step 1: [Question 1 Purpose]
Choose [what to do]:
- **[Option 1]** - [Description of what this does and why]
- **[Option 2]** - [Description of what this does and why]
- **[Option 3]** - [Description of what this does and why]

### Step 2: [Question 2 Purpose]
Based on your selection, you'll be asked for:
- **[Context-specific option]** - [Description]
\`\`\`

### Step 5: Add Implementation Instructions

Add this section for the agent executing the command:

```markdown
## Implementation Instructions for Claude

When this command is invoked:

1. **If no arguments provided** → Use \`AskUserQuestion\` tool to present interactive menu:

   **First Menu - [Purpose]:**
   \`\`\`
   Question: "[Clear question text]"
   Header: "[Short tag]"
   Options:
   - "[Option 1 label]" → Description: "[Explain consequence/tradeoff]"
   - "[Option 2 label]" → Description: "[Explain consequence/tradeoff]"
   - "[Option 3 label]" → Description: "[Explain consequence/tradeoff]"
   \`\`\`

2. **Based on answer to Question 1**, present follow-up menu:

   **For "[Option 1]" selection:**
   - Ask: "[Follow-up question]"
   - Options: "[Context-specific options]"
   - Execute: [What to do with this choice]

   **For "[Option 2]" selection:**
   - [Different follow-up flow]

3. **If arguments provided** → Parse and execute directly (backward compatibility)
\`\`\`

---

## Design Patterns

### Pattern 1: Progressive Disclosure

Start with simple top-level question, then drill down based on answer:

\`\`\`
Q1: "What would you like to do?"
  └─ Answer: "Analyze"
      └─ Q2: "How would you like to analyze?"
          └─ Answer: "Dry-run"
              └─ Q3: "Dry-run complete. Proceed with live?"
\`\`\`

**Benefits**: Reduces cognitive load, shows only relevant options

### Pattern 2: Safety Confirmation

Always confirm before destructive operations:

\`\`\`json
{
  "questions": [
    {
      "question": "⚠️  This will delete 52 duplicates. Proceed?",
      "header": "Confirm",
      "multiSelect": false,
      "options": [
        {
          "label": "Yes, proceed",
          "description": "Execute deduplication with validated settings"
        },
        {
          "label": "Show detailed plan",
          "description": "Review what will happen before confirming"
        },
        {
          "label": "Cancel",
          "description": "Abort operation without making changes"
        }
      ]
    }
  ]
}
\`\`\`

**Benefits**: Prevents accidental destructive actions, builds user confidence

### Pattern 3: Smart Defaults

Use multiSelect with recommended options pre-selected:

\`\`\`json
{
  "questions": [
    {
      "question": "What should we include in the release?",
      "header": "Release Options",
      "multiSelect": true,
      "options": [
        {
          "label": "Run tests",
          "description": "Execute test suite before releasing (recommended)"
        },
        {
          "label": "Create GitHub release",
          "description": "Create GitHub release with changelog"
        },
        {
          "label": "Send Slack notification",
          "description": "Notify team via Slack webhook"
        },
        {
          "label": "Skip validation",
          "description": "⚠️  Skip pre-release checks (not recommended)"
        }
      ]
    }
  ]
}
\`\`\`

**Note**: Instruct the agent to recommend options 1-3 by default.

### Pattern 4: Context-Aware Questions

Skip questions when answers are obvious from context:

\`\`\`
IF only 1 org authenticated:
  → Skip org selection, use that org
ELSE:
  → Ask which org to use

IF .asana-links.json doesn't exist:
  → Create new config
ELSE:
  → Ask: Add to existing or replace?
\`\`\`

**Benefits**: Reduces friction, feels smart

### Pattern 5: Help Always Available

Include help/documentation option in every menu:

\`\`\`json
{
  "options": [
    { "label": "Option 1", "description": "..." },
    { "label": "Option 2", "description": "..." },
    { "label": "Show help", "description": "View documentation and examples" }
  ]
}
\`\`\`

**Benefits**: Users never feel stuck

---

## Code Examples

### Example 1: Simple Action Selection

\`\`\`json
{
  "questions": [
    {
      "question": "What would you like to do with Account deduplication?",
      "header": "Action",
      "multiSelect": false,
      "options": [
        {
          "label": "Prepare org",
          "description": "Run validation, create backup, detect important fields (~5-10 min)"
        },
        {
          "label": "Analyze pairs",
          "description": "Detect Type 1/2 errors, generate merge decisions (~2-5 min)"
        },
        {
          "label": "Execute merges",
          "description": "Run parallel merge execution with native Salesforce merger"
        },
        {
          "label": "Show help",
          "description": "View complete documentation, examples, and troubleshooting"
        }
      ]
    }
  ]
}
\`\`\`

### Example 2: Multi-Question Sequential Flow

**First Question:**
\`\`\`json
{
  "questions": [
    {
      "question": "Which plugin are you releasing?",
      "header": "Plugin",
      "multiSelect": false,
      "options": [
        {
          "label": "salesforce-plugin",
          "description": "Current version: v3.7.4"
        },
        {
          "label": "hubspot-plugin",
          "description": "Current version: v1.2.0"
        },
        {
          "label": "developer-tools-plugin",
          "description": "Current version: v1.0.0"
        }
      ]
    }
  ]
}
\`\`\`

**Second Question (based on first answer):**
\`\`\`json
{
  "questions": [
    {
      "question": "What type of release is this for salesforce-plugin?",
      "header": "Release Type",
      "multiSelect": false,
      "options": [
        {
          "label": "Major (4.0.0)",
          "description": "Breaking changes - requires user migration"
        },
        {
          "label": "Minor (3.8.0)",
          "description": "New features - backward compatible"
        },
        {
          "label": "Patch (3.7.5)",
          "description": "Bug fixes only - backward compatible"
        }
      ]
    }
  ]
}
\`\`\`

### Example 3: Multi-Select with Toggles

\`\`\`json
{
  "questions": [
    {
      "question": "Which features should we include in the new plugin?",
      "header": "Features",
      "multiSelect": true,
      "options": [
        {
          "label": "Slash commands",
          "description": "Add /command interface for users (recommended)"
        },
        {
          "label": "Post-install hooks",
          "description": "Run setup scripts after plugin installation (recommended)"
        },
        {
          "label": "Pre-commit validation",
          "description": "Validate changes before git commits (optional)"
        },
        {
          "label": "Test suite",
          "description": "Include Jest test framework and sample tests (optional)"
        }
      ]
    }
  ]
}
\`\`\`

### Example 4: Safety Confirmation with Data Summary

\`\`\`json
{
  "questions": [
    {
      "question": "⚠️  Ready to migrate 427 contacts and 17 deals, then delete 3 duplicates?",
      "header": "Confirm",
      "multiSelect": false,
      "options": [
        {
          "label": "Yes, proceed",
          "description": "Execute deduplication with two-phase commit safety"
        },
        {
          "label": "Show detailed plan",
          "description": "Review which associations will move and to which companies"
        },
        {
          "label": "Cancel",
          "description": "Abort without making any changes"
        }
      ]
    }
  ]
}
\`\`\`

---

## Testing Checklist

### Before Committing

- [ ] **Happy path works**: Test full workflow with expected inputs
- [ ] **Cancellation works**: Test "Cancel" option at each step
- [ ] **Help option works**: Verify help displays documentation
- [ ] **Backward compatibility**: Direct mode with arguments still works
- [ ] **Edge cases handled**:
  - [ ] No resources available (e.g., no orgs authenticated)
  - [ ] Single resource available (skips selection)
  - [ ] Existing config file (handles merge/replace)
  - [ ] Invalid answers (re-prompts with guidance)

### User Experience Checks

- [ ] **Questions are clear**: No ambiguity in question text
- [ ] **Options are distinct**: No overlapping choices
- [ ] **Descriptions are helpful**: Explain consequences/tradeoffs
- [ ] **Labels are concise**: 1-5 words, action-oriented
- [ ] **Headers make sense**: Provide context at a glance
- [ ] **No more than 4 options per question** (including auto-added "Other")
- [ ] **No more than 4 questions per invocation**

### Error Handling

- [ ] **Validation errors**: Gracefully handle invalid selections
- [ ] **Missing resources**: Guide user to create/configure
- [ ] **Failed operations**: Provide rollback/retry options
- [ ] **Timeout scenarios**: Don't leave user hanging

---

## Common Pitfalls

### Pitfall 1: Too Many Options

**Problem**: 6+ options overwhelm the user

**Solution**: Group into categories or use hierarchical menus
- Bad: Show all 15 report templates in one question
- Good: Ask category first (Sales, Marketing, Executive), then show 3-4 templates

### Pitfall 2: Vague Descriptions

**Problem**: "Use this option for different behavior"

**Solution**: Explain consequences and tradeoffs
- Bad: "Standard mode" vs "Advanced mode"
- Good: "Standard (5 workers, 10s/pair)" vs "Maximum throughput (10 workers, requires good org performance)"

### Pitfall 3: Missing Context

**Problem**: User doesn't understand what the question is asking

**Solution**: Use descriptive headers and provide background
- Bad: "Which one?" (header: "Select")
- Good: "Which Salesforce org should we deploy to?" (header: "Target Org")

### Pitfall 4: No Escape Hatch

**Problem**: User can't cancel or get help

**Solution**: Always include Cancel/Help options
- Every destructive operation: Include "Cancel"
- Every complex choice: Include "Show help"

### Pitfall 5: Ignoring Backward Compatibility

**Problem**: Breaking existing automation that uses direct arguments

**Solution**: Support both interactive and direct modes
```
IF no arguments provided:
  → Interactive mode (AskUserQuestion)
ELSE:
  → Direct mode (parse arguments)
```

### Pitfall 6: Static Questions for Dynamic Data

**Problem**: Need to show list that changes (e.g., authenticated orgs)

**Solution**: Fetch data first, build options dynamically
```javascript
// Fetch orgs first
const orgs = await fetchOrgs();

// Build options dynamically
const options = orgs.map(org => ({
  label: org.alias,
  description: `${org.type} - ${org.username}`
}));

// Then use AskUserQuestion with built options
```

### Pitfall 7: Unclear Next Steps

**Problem**: User doesn't know what to do after answering

**Solution**: Provide clear confirmation and next steps
```
✅ Successfully deployed report to Production

📊 Report Details:
   Name: Team Performance Q4
   URL: https://...

💡 Next Steps:
   1. Open report in Salesforce to review
   2. Add to Team Performance dashboard
   3. Schedule daily email subscription
```

---

## Reference: /dedup Command

The `/dedup` command in salesforce-plugin is the gold standard implementation. Review it for:

- **Comprehensive workflow design** (lines 59-109)
- **Clear option descriptions** (lines 64-69)
- **Safety confirmation patterns** (lines 104-108)
- **Multi-stage question flow** (lines 71-109)
- **Help integration** (line 69)

**Location**: `.claude-plugins/opspal-salesforce/commands/dedup.md`

---

## Quick Reference Card

| Aspect | Best Practice | Example |
|--------|---------------|---------|
| **Question Text** | Under 80 chars, clear action | "What would you like to do with Account deduplication?" |
| **Header** | 1-3 words, context tag | "Action", "Target Org", "Confirm" |
| **Option Label** | 1-5 words, action-oriented | "Prepare org", "Execute merges", "Show help" |
| **Option Description** | Explain consequence/tradeoff | "Run validation, create backup (~5-10 min)" |
| **Questions Per Call** | 1-4 questions | Typically 1-2 for better UX |
| **Options Per Question** | 2-4 options | +1 auto-added "Other" option |
| **Confirmation Pattern** | ⚠️ emoji + data summary + options | "⚠️  Delete 52 duplicates? [Yes/Details/Cancel]" |
| **Help Option** | Include in all complex menus | "Show help" → View documentation |
| **Cancel Option** | Include in all destructive operations | "Cancel" → Abort without changes |

---

## Version History

- **v1.0.0** (2025-10-17) - Initial implementation guide
- Covers all design patterns and best practices
- Includes comprehensive examples and testing checklist

---

**Maintained By**: RevPal Engineering
**Reference**: `/dedup` command implementation
