# Project Intake Troubleshooting

Common issues and solutions for the project intake workflow.

## Validation Errors

### "Required section missing"

**Error**: `Required section "projectIdentity" is missing`

**Cause**: JSON export doesn't include all required sections.

**Solution**:
1. Return to intake form
2. Ensure all tabs with asterisks (*) are filled
3. Re-export JSON

### "Circular dependency detected"

**Error**: `Circular dependency detected: A → B → C → A`

**Cause**: Dependencies form a cycle where A depends on B, B depends on C, and C depends on A.

**Solution**:
1. Review dependency graph in validation output
2. Identify which dependency can be broken or made non-blocking
3. Update the dependency to remove the cycle
4. Re-run validation

### "Invalid date range"

**Error**: `Start date must be before end date`

**Cause**: `targetStartDate` is after `targetEndDate`.

**Solution**:
1. Check date format (YYYY-MM-DD)
2. Verify dates are in correct order
3. Update dates in form and re-export

### "Milestone outside project range"

**Error**: `Milestone "Phase 1 Complete" date is outside project date range`

**Cause**: A milestone date is before start date or after end date.

**Solution**:
1. Review all milestone dates
2. Ensure each milestone is within start-end range
3. Adjust project dates if milestones are correct

---

## Form Issues

### Form won't export JSON

**Symptoms**: Export button doesn't work or produces empty file.

**Solutions**:
1. Check browser console for JavaScript errors (F12)
2. Ensure all required fields have values (red asterisks)
3. Try a different browser (Chrome recommended)
4. Save draft first, then export

### Form data not saving

**Symptoms**: Filled data disappears on refresh.

**Solutions**:
1. Use "Save Draft" button before closing
2. Check browser localStorage isn't disabled
3. Export JSON immediately after completion

### Unicode/encoding issues

**Symptoms**: Special characters appear garbled in JSON.

**Solutions**:
1. Ensure file is saved as UTF-8
2. Avoid copy-pasting from Word (use plain text)
3. Remove or escape special characters manually

---

## Context Gathering Issues

### "Salesforce org not connected"

**Symptoms**: Context gathering skips Salesforce data.

**Solutions**:
1. Verify org alias: `sf org list`
2. Authenticate: `sf org login web --alias [alias]`
3. Check org alias in intake data matches authenticated alias

### "Asana authentication failed"

**Symptoms**: Asana context gathering fails.

**Solutions**:
1. Check `ASANA_ACCESS_TOKEN` environment variable
2. Verify token hasn't expired
3. Re-authenticate via Asana developer console

### "No related runbooks found"

**Symptoms**: Context shows empty runbook array.

**Solutions**:
1. Verify runbook search path is correct
2. Check project type keywords match runbook naming
3. This is often acceptable for new project types

---

## Runbook Generation Issues

### "Runbook template not found"

**Symptoms**: Generation fails with template error.

**Solutions**:
1. Check `templates/intake/intake-runbook.md` exists
2. Verify plugin installation is complete
3. Run `/checkdependencies --fix`

### "Runbook missing sections"

**Symptoms**: Generated runbook has empty sections.

**Solutions**:
1. Review validation warnings for missing data
2. Improve completeness score (aim for 80%+)
3. Add missing optional sections to intake data

---

## Asana Integration Issues

### "Workspace not found"

**Symptoms**: Asana project creation fails with workspace error.

**Solutions**:
1. List workspaces: Run `mcp__asana__asana_list_workspaces`
2. Verify workspace ID in intake settings
3. Check Asana token has workspace access

### "Rate limit exceeded"

**Symptoms**: Task creation fails after several tasks.

**Solutions**:
1. Wait 60 seconds and retry
2. For large projects, use `--batch-size 10` option
3. Split into multiple intake runs if >50 requirements

### "Project created but tasks failed"

**Symptoms**: Asana shows empty project.

**Solutions**:
1. Check `.intake/asana-mapping.json` for error details
2. Re-run with `--skip-project-creation` to only create tasks
3. Manually check Asana API permissions

---

## Completeness Issues

### Score below 80%

**Common Gaps**:
| Missing Section | Impact on Score |
|-----------------|-----------------|
| Success metrics | -10-15% |
| Out-of-scope items | -5-10% |
| Risks | -5-10% |
| Dependencies | -5-10% |
| Technical requirements | -5% |

**Quick Fixes**:
1. Add at least 2 success metrics with targets
2. Document at least 3 out-of-scope items
3. Identify at least 2 risks with mitigations

### "Ready for handoff: false"

**Causes**:
1. Validation errors exist (must fix)
2. High-severity warnings present
3. Completeness score < 80%

**Solutions**:
1. Fix all validation errors first
2. Address high-severity warnings
3. Improve completeness to 80%+

---

## Recovery Procedures

### Start Over with Fresh Form

```bash
# Delete existing files
rm ./intake-form.html ./intake-data.json
rm -rf ./.intake/

# Generate fresh form
/intake-generate-form

# Re-fill and export
```

### Validate Without Creating

```bash
# Run validation only
/intake --validate ./intake-data.json

# Review errors and warnings
# Fix in form, re-export, repeat
```

### Resume Interrupted Workflow

```bash
# Check existing state
ls .intake/

# If validation.json exists, skip validation
/intake --form-data ./intake-data.json --skip-validation

# If asana-mapping.json exists, skip project creation
/intake --form-data ./intake-data.json --skip-asana
```

---

## Getting Help

If issues persist:

1. Run `/reflect` to capture the issue
2. Include validation output in reflection
3. Check `~/.claude/logs/` for detailed errors
4. Review agent logs for API failures
