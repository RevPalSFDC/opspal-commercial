# Documentation Style Guide

**Purpose**: Ensure consistent, clear, and user-friendly documentation across all commands and agents

**Last Updated**: 2025-10-13

---

## Core Principles

### 1. Lead with Action
**DO**: Start with what the user can do immediately
```markdown
## Usage
```bash
/reflect
```
```

**DON'T**: Bury the command in paragraphs of explanation
```markdown
## Usage
This command is designed to analyze your session and create a reflection.
To use it, you need to first ensure that... [10 paragraphs later] `/reflect`
```

### 2. Separate Optional from Required

**DO**: Clearly distinguish configuration from execution requirements
```markdown
## Prerequisites

### Configuration (Optional)
These improve functionality but are NOT required:
- `SLACK_WEBHOOK_URL` - Enables Slack notifications
  - Impact if not set: No Slack notifications, command still works

### Execution Required
These are MANDATORY:
- ✅ Active Supabase connection
  - Verify: Run `echo $SUPABASE_URL`
  - Fix: Set `SUPABASE_URL` in `.env`
```

**DON'T**: Mix optional and required without distinction
```markdown
## Prerequisites
- SLACK_WEBHOOK_URL
- SUPABASE_URL
- ASANA_TOKEN (optional)
```

### 3. Show Expected Outputs

**DO**: Provide exact examples of success and failure
```markdown
## Expected Output

### Success
```
✅ Reflection submitted (ID: 1234)
📊 Saved to: .claude/SESSION_REFLECTION_2025-10-13.json
```

### Failure
```
❌ Failed to connect to Supabase
Error: ECONNREFUSED
```
**Fix**: Check `SUPABASE_URL` is set correctly
```

**DON'T**: Leave users guessing what success looks like
```markdown
## Usage
Run the command and it will work if configured correctly.
```

### 4. Provide Decision Guidance

**DO**: Help users choose the right command/agent
```markdown
## When to Use This Command

Use `/reflect` when:
- ✅ You've completed a development session
- ✅ You encountered errors worth documenting
- ✅ You discovered patterns or friction points

Use `/processreflections` instead when:
- ❌ You want to analyze multiple reflections
- ❌ You're reviewing team feedback
```

**DON'T**: Assume users know when to use what
```markdown
## Overview
This command reflects on sessions.
```

---

## Required Sections

### For Commands

#### 1. Purpose (REQUIRED)
- What the command does (1 sentence)
- When to use it (2-3 scenarios)
- When NOT to use it (1-2 anti-patterns)

#### 2. Prerequisites (REQUIRED)
- **Configuration (Optional)** subsection
  - Environment variables with impact if not set
- **Execution Required** subsection
  - Mandatory requirements with verification commands

#### 3. Usage (REQUIRED)
- Basic usage with code block
- What happens (numbered steps)
- Options/flags explanation

#### 4. Examples (REQUIRED)
- At least 2 real-world examples
- Each with:
  - Scenario description
  - Exact command
  - Expected output
  - Explanation

#### 5. Expected Output (REQUIRED)
- Success output (exact copy-paste)
- Warnings output (if applicable)
- Failure output (most common errors)

#### 6. Troubleshooting (RECOMMENDED)
- Top 3-5 common issues
- Symptoms → Cause → Solution format
- Verification steps

#### 7. Decision Tree (RECOMMENDED)
- Visual decision flow
- Clear branching logic
- Links to alternative commands

### For Agents

#### 1. Overview (REQUIRED)
- Agent purpose (1-2 sentences)
- When to invoke this agent
- Key capabilities

#### 2. Tools Available (REQUIRED)
- List of tools agent can use
- Brief explanation of each

#### 3. When to Use This Agent (RECOMMENDED)
- Specific scenarios
- Triggers or keywords
- Alternative agents for related tasks

#### 4. Example Workflow (RECOMMENDED)
- Step-by-step example invocation
- Expected behavior
- Sample output

---

## Style Conventions

### Headings

**Hierarchy**:
```markdown
# Title (H1 - Only once at top)
## Section (H2 - Main sections)
### Subsection (H3 - Supporting details)
#### Detail (H4 - Rarely needed)
```

**DO NOT skip levels** (# followed by ### is wrong)

### Code Blocks

**Always specify language**:
```markdown
```bash
/command-name
```

```javascript
const result = await fn();
```
```

**NOT**:
````
```
/command-name
```
````

### Lists

**Use checkmarks for requirements**:
```markdown
✅ REQUIRED: Thing that must exist
⚠️  OPTIONAL: Thing that improves experience
❌ NOT NEEDED: Common misconception
```

**Use numbers for sequences**:
```markdown
1. First step
2. Second step
3. Final step
```

**Use bullets for non-sequential items**:
```markdown
- Option A
- Option B
- Option C
```

### Emphasis

**Bold** for UI elements, commands, or critical terms:
- Click **Save**
- Run **`/reflect`**
- The **data_source** field

**Italic** for emphasis within sentences:
- This is *important* to understand
- Not typically used in technical docs

**Code** for variables, paths, values:
- Set `SUPABASE_URL` to `https://...`
- Check `.claude/settings.json`

### Links

**DO**: Use descriptive link text
```markdown
See the [Supabase Reflection System documentation](../SUPABASE_REFLECTION_SYSTEM.md)
```

**DON'T**: Use generic link text
```markdown
See [here](../SUPABASE_REFLECTION_SYSTEM.md)
```

---

## Clarity Checklist

Before marking documentation complete, verify:

- [ ] **Can a new user understand the purpose in < 30 seconds?**
- [ ] **Are required vs optional prerequisites clearly separated?**
- [ ] **Is there at least one complete usage example?**
- [ ] **Is the expected output shown (success and failure)?**
- [ ] **Are common errors documented with solutions?**
- [ ] **Would someone know when to use THIS vs alternatives?**
- [ ] **Are all code blocks language-specified?**
- [ ] **Are placeholders explained (e.g., `{org-alias}` means...)?**
- [ ] **Is there a way to verify success?**
- [ ] **Are there decision trees or "when to use" guidance?**

---

## Examples of Good Documentation

### Example 1: Clear Prerequisites

```markdown
## Prerequisites

### Configuration (Optional)
**These improve functionality but are NOT required for basic operation**:

- **`SLACK_WEBHOOK_URL`** - Enables Slack notifications after reflection submission
  - Default: None
  - Impact if not set: Reflection still submits to Supabase, but no Slack notification sent
  - How to set: Add to `.env` file

### Execution Required
**These are MANDATORY before running the command**:

- **✅ Supabase Connection** - Must be configured for reflection storage
  - Verify: `echo $SUPABASE_URL` (should return URL)
  - Fix if missing:
    ```bash
    export SUPABASE_URL=https://REDACTED_SUPABASE_PROJECT.supabase.co
    export SUPABASE_ANON_KEY=sb_publishable_...
    ```
```

### Example 2: Complete Example with Output

```markdown
### Example 1: Basic Reflection After Session

**Scenario**: You've completed a Salesforce metadata deployment session and encountered 2 errors

**Command**:
```bash
/reflect
```

**Expected Output**:
```
Analyzing session for errors and patterns...

Found 2 errors:
  1. Field history tracking limit exceeded
  2. Invalid picklist formula

Generated reflection playbook (24 patterns detected)
✅ Reflection submitted (ID: 1234)
📊 Saved to: .claude/SESSION_REFLECTION_2025-10-13.json
```

**What this means**:
- Your session has been analyzed
- 2 errors were detected and documented
- 24 best practice patterns were evaluated
- Reflection stored in Supabase (ID: 1234)
- Local copy saved for reference
```

### Example 3: Decision Tree

```markdown
## When to Use /reflect

```
Start Here
  ↓
Did your session involve actual development work?
  ├─ YES → Did you encounter errors or friction?
  │         ├─ YES → Run /reflect ✅
  │         └─ NO → Optional but recommended for positive feedback
  │
  └─ NO → Was this just exploration/learning?
            ├─ YES → Skip reflection (not needed for read-only sessions)
            └─ NO → Run /reflect if you have feedback
```

**Key Decision Factors**:
- ✅ **USE** after: Deployments, implementations, debugging sessions
- ⚠️  **OPTIONAL** after: Successful deployments with no issues
- ❌ **SKIP** after: Read-only exploration, documentation review
```

---

## Anti-Patterns to Avoid

### ❌ Walls of Text
```markdown
## Usage

This command is designed to analyze your session and create a comprehensive
reflection document that captures errors, patterns, and feedback. It works by
examining the session history, applying pattern matching algorithms, and then
generating a structured JSON output that is submitted to Supabase. The process
typically takes 30-60 seconds depending on session length. Before using this
command you should ensure that your Supabase connection is configured correctly
and that you have the necessary environment variables set. Once the command
completes you will see a confirmation message...
```

**Fix**: Break into sections, use lists, show examples

### ❌ Ambiguous Prerequisites
```markdown
## Prerequisites
- Supabase configured
- Optional: Slack webhook
```

**Fix**: Separate optional from required, explain impact

### ❌ No Expected Output
```markdown
## Usage
Run `/command` and it will work if everything is set up correctly.
```

**Fix**: Show exact success and failure outputs

### ❌ Missing Examples
```markdown
## Syntax
`/command [options]`

See documentation for details.
```

**Fix**: Add 2-3 real-world examples with scenarios

### ❌ Unexplained Placeholders
```markdown
```bash
node script.js {org-alias} {path}
```
```

**Fix**: Explain what placeholders mean and provide examples

---

## Documentation Quality Metrics

### Target Scores (Measured by `documentation-validator.js`)

- **Completeness**: ≥ 90/100 (all required sections present)
- **Clarity**: ≥ 85/100 (examples, outputs, decision trees present)
- **Consistency**: ≥ 90/100 (follows style guide)
- **Accuracy**: 100/100 (no broken links, valid code examples)

### How Scores are Calculated

**Completeness** (30% weight):
- Required sections present: 100%
- Missing 1 section: 85%
- Missing 2+ sections: <70%

**Clarity** (40% weight):
- Code examples: +10 points each (max 40)
- Expected outputs: +30 points
- Decision guidance: +30 points

**Consistency** (20% weight):
- Starts at 100
- -10 points per heading level skip
- -10 points per style violation

**Accuracy** (10% weight):
- No issues: 100
- Has issues: 70

**Overall Score**: Weighted average of above

---

## Validation

### CLI Validation Tool

```bash
# Validate a command doc
node scripts/lib/documentation-validator.js commands/reflect.md --type command

# Validate an agent doc
node scripts/lib/documentation-validator.js agents/my-agent.md --type agent

# Strict mode (warnings become errors)
node scripts/lib/documentation-validator.js commands/reflect.md --strict

# Minimum score requirement
node scripts/lib/documentation-validator.js commands/reflect.md --min-score 85
```

### Integration with Git Hooks

Add to `.git/hooks/pre-commit`:
```bash
# Validate modified documentation files
git diff --cached --name-only | grep -E '\.(md)$' | while read file; do
  if [[ $file == *"commands/"* ]]; then
    node scripts/lib/documentation-validator.js "$file" --type command || exit 1
  elif [[ $file == *"agents/"* ]]; then
    node scripts/lib/documentation-validator.js "$file" --type agent || exit 1
  fi
done
```

---

## Quick Reference Card

### Command Documentation Checklist

```
[ ] Purpose section (what, when, when not)
[ ] Prerequisites (separated: optional vs required)
[ ] Usage (basic + options)
[ ] 2+ Examples (scenario, command, output, explanation)
[ ] Expected Output (success + failure)
[ ] Troubleshooting (top 3-5 issues)
[ ] Decision tree or "When to use"
[ ] All code blocks language-specified
[ ] Placeholders explained
[ ] Success verification method
```

### Agent Documentation Checklist

```
[ ] Overview (purpose, when to use, capabilities)
[ ] Tools Available (list + brief explanation)
[ ] When to Use This Agent (scenarios, triggers)
[ ] Example Workflow (step-by-step with output)
[ ] All code blocks language-specified
[ ] Related agents mentioned
```

---

## Continuous Improvement

Documentation should evolve based on:
- User feedback via `/reflect`
- Common support questions
- Observed confusion patterns
- New features or changes

**Review Cycle**: Quarterly review of all documentation for:
- Accuracy (outdated information)
- Completeness (new sections needed)
- Clarity (user feedback incorporated)

---

**Questions?** Submit feedback via `/reflect` with category "documentation"
