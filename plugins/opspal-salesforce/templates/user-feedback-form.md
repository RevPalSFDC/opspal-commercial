# Validator User Feedback Form

**Validator**: {{validator_name}}
**Date**: {{timestamp}}
**Operation**: {{operation_type}}

---

## Quick Feedback (Required)

**1. Was the validation accurate?**
- [ ] Yes - The validation was correct
- [ ] No - False positive (blocked a valid operation)
- [ ] No - False negative (missed an actual error)
- [ ] Unsure

**2. Did this validation save you time?**
- [ ] Yes
- [ ] No

**If YES, approximately how much time?**
___ minutes

---

## Detailed Feedback (Optional)

**3. Overall satisfaction with this validation:**
☆☆☆☆☆ (1-5 stars)

**4. Additional comments:**

```
[Your feedback here]
```

---

## Validation Details

**Outcome**: {{outcome}}
**Errors Found**: {{errors_count}}
**Warnings Found**: {{warnings_count}}
**Execution Time**: {{execution_time}}ms

---

**Submit Feedback**:
```bash
node scripts/lib/validator-telemetry.js feedback {{validator_name}} {{timestamp}} \
  --accurate={{yes|no}} \
  --false-positive={{true|false}} \
  --false-negative={{true|false}} \
  --time-saved={{minutes}} \
  --satisfied={{1-5}} \
  --comments="Your comments here"
```

Or use the interactive feedback tool:
```bash
node scripts/submit-validator-feedback.js {{validator_name}} {{timestamp}}
```

---

**Thank you for helping improve the validation system!**
