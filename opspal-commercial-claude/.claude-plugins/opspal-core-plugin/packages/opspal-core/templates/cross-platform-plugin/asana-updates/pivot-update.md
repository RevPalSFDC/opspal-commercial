# Pivot Update Template

**Purpose**: Notify stakeholders of significant plan changes or scope adjustments
**Target Length**: 80-120 words
**When to Use**: When original approach won't work and plan must change

---

## Template

```markdown
**⚠️ PIVOT** - [Task Name]

**Original Plan:**
- [What was planned]

**Issue Discovered:**
- [What went wrong or what was discovered]

**New Approach:**
- [How we're pivoting]
- [Expected outcome with this approach]

**Impact:**
- Timeline: [Change in timeline]
- Scope: [Change in scope]

**Approval Needed:** [Yes/No]
```

---

## Example 1: Technical Constraint Discovered

```markdown
**⚠️ PIVOT** - Salesforce Flow Migration

**Original Plan:**
- Migrate 15 Process Builders to Flows via automated conversion

**Issue Discovered:**
- Automated conversion tool doesn't support cross-object field updates (8 of 15 use this)

**New Approach:**
- Manual conversion for 8 complex processes with cross-object updates
- Automated conversion for remaining 7 simple processes
- Add comprehensive testing phase

**Impact:**
- Timeline: +3 days (from 5 days to 8 days)
- Scope: Unchanged (all 15 still migrated)

**Approval Needed:** Yes (timeline extension)
```

**Word Count**: 91 words ✅

---

## Example 2: Data Quality Issue

```markdown
**⚠️ PIVOT** - Account Deduplication

**Original Plan:**
- Automated merge of 1,200 duplicate accounts using fuzzy matching

**Issue Discovered:**
- 40% of duplicates have conflicting ownership (different AEs)
- Auto-merge would cause territory disputes

**New Approach:**
- Phase 1: Auto-merge 720 clear duplicates (same owner)
- Phase 2: Manual review queue for 480 conflicting records
- Territory manager approval workflow

**Impact:**
- Timeline: +5 days (ownership resolution)
- Scope: Reduced initial batch, added approval workflow

**Approval Needed:** Yes (phased approach)
```

**Word Count**: 93 words ✅

---

## Example 3: Scope Reduction

```markdown
**⚠️ PIVOT** - CPQ Product Rules Cleanup

**Original Plan:**
- Consolidate 50 product rules into 20 optimized rules

**Issue Discovered:**
- 15 rules tied to active promotional campaigns ending next quarter
- Consolidation now would break campaign tracking

**New Approach:**
- Consolidate 35 non-campaign rules immediately
- Schedule campaign-tied rules for Q1 2026 cleanup
- Document consolidation plan for future reference

**Impact:**
- Timeline: Unchanged (reduced scope)
- Scope: 35 rules now, 15 deferred to Q1

**Approval Needed:** No (reduced scope, lower risk)
```

**Word Count**: 89 words ✅

---

## Best Practices

1. **Be Transparent**: Clearly state what's changing and why
2. **Provide Rationale**: Explain the issue that necessitates the pivot
3. **Quantify Impact**: Specific timeline and scope changes
4. **Seek Approval**: Make it clear if stakeholder sign-off needed
5. **Stay Solution-Focused**: Lead with the new plan, not just the problem

---

## Anti-Patterns

❌ **Burying the Lede**: Wait until end to mention the pivot
✅ **Clear Signal**: Start with "⚠️ PIVOT" so it's unmissable

❌ **Vague Impact**: "Will take a bit longer"
✅ **Specific Impact**: "Timeline: +3 days (from 5 to 8)"

❌ **No Alternatives**: Just list problems without solutions
✅ **Solution-Oriented**: New approach with expected outcome

❌ **Hiding Approval Needs**: Assume approval or move forward without asking
✅ **Explicit Request**: "Approval Needed: Yes (timeline extension)"
