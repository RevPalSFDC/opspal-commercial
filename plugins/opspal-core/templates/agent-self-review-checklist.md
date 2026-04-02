# Agent Self-Review Checklist

**MANDATORY**: Complete before marking any task as complete.

## Pre-Completion Validation Protocol

### 1. Deliverable Check

- [ ] **All expected files exist** at the specified paths
- [ ] **File formats are valid** (JSON parseable, CSV well-formed, etc.)
- [ ] **Files are not empty** or contain only placeholders
- [ ] **No TODO/FIXME/PLACEHOLDER** markers remain in output

### 2. Requirements Alignment

- [ ] **Re-read the original request** - Does output match what was asked?
- [ ] **Compare against any examples** the user provided
- [ ] **Check for mentioned formats** - If user said "JSON + PDF", did I create both?
- [ ] **Verify scope** - Did I complete the full request or only part?

### 3. Quality Standards

- [ ] **Data is real, not synthetic** - No "John Doe", "test@example.com", etc.
- [ ] **Statistics are plausible** - No 99%+ or 0% without verification
- [ ] **Calculations are correct** - Spot-check key numbers
- [ ] **No truncation** - Full data included, not partial

### 4. Success Criteria Verification

For each success criterion mentioned or implied:

| Criterion | Status | Evidence |
|-----------|--------|----------|
| _[criterion 1]_ | ✅/❌ | _[how verified]_ |
| _[criterion 2]_ | ✅/❌ | _[how verified]_ |
| _[criterion 3]_ | ✅/❌ | _[how verified]_ |

### 5. User Expectation Alignment

- [ ] **Speed vs Quality** - Did I optimize for the right priority?
- [ ] **Completeness vs Speed** - If trade-off needed, did I confirm with user?
- [ ] **Previous preferences** - Did I apply any known user preferences?

---

## Red Flags - STOP and Re-Review

If ANY of these are true, DO NOT mark task complete:

⛔ **Files mentioned but not created**
⛔ **Placeholder text in deliverables**
⛔ **Output format doesn't match request**
⛔ **Success criteria not demonstrably met**
⛔ **Statistics that seem too good/bad to be true**
⛔ **User-provided example not followed**

---

## Quick Validation Commands

```bash
# Check deliverables exist and are valid
node ~/.claude/plugins/opspal-core@opspal-commercial/scripts/lib/agent-deliverable-validator.js <config.json>

# Validate completion
node ~/.claude/plugins/opspal-core@opspal-commercial/scripts/lib/agent-completion-validator.js <config.json>
```

---

## Example Config for Validation

```json
{
  "taskDescription": "Generate CPQ assessment with JSON report and PDF summary",
  "workingDirectory": "./reports/eta-corp/",
  "deliverables": [
    { "path": "cpq-assessment.json", "format": "json", "required": true },
    { "path": "summary.pdf", "format": "pdf", "required": true },
    { "path": "data-export.csv", "format": "csv", "required": false }
  ],
  "successCriteria": [
    "cpq-assessment.json created",
    "All validations passing",
    "No placeholder content"
  ]
}
```

---

## After Completion

If validation passes:
1. ✅ Mark task complete
2. ✅ Summarize what was delivered
3. ✅ Note any caveats or follow-up needed

If validation fails:
1. ❌ Fix identified issues first
2. ❌ Re-run validation
3. ❌ Only then mark complete

---

*This checklist prevents the #1 cause of user friction: declaring tasks complete prematurely.*
