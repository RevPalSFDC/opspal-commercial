# Production Deployment Rules

## 🚨 CRITICAL RULE: ABSOLUTELY NO TESTING IN PRODUCTION - EVER

**NEVER deploy test code, test layouts, test metadata, or experimental changes to production environments.**

### Production Environment Detection

Before ANY deployment, verify the target org type:

```bash
# Check if org is sandbox
sf data query --query "SELECT IsSandbox FROM Organization" --target-org <alias>

# If IsSandbox = false → STOP - This is PRODUCTION
```

### Approved Sandbox Aliases

**ONLY deploy test code to these orgs**:
- ✅ `PEREGRINE_SANDBOX` - Peregrine staging sandbox
- ✅ `rentable-sandbox` - Rentable sandbox
- ✅ `wedgewood-uat` - Wedgewood UAT sandbox
- ✅ `bluerabbit2021-revpal` - Blue Rabbit sandbox

**NEVER deploy test code to these orgs**:
- ❌ `peregrine-main` - Peregrine PRODUCTION
- ❌ `rentable-production` - Rentable PRODUCTION
- ❌ `wedgewood-production` - Wedgewood PRODUCTION
- ❌ Any org where `IsSandbox = false`

### Deployment Pre-Flight Checklist

**Before ANY deployment, answer these questions:**

1. ✅ Is this org a SANDBOX? (verify `IsSandbox = true`)
2. ✅ Is this change FULLY TESTED and PRODUCTION READY?
3. ✅ Do I have APPROVAL to deploy to this org?
4. ✅ Do I have a ROLLBACK PLAN if something fails?

**If ANY answer is NO → DO NOT DEPLOY**

### What Constitutes "Testing"

**Never deploy to production**:
- ❌ Experimental layouts or page layouts
- ❌ Test FlexiPages or CompactLayouts
- ❌ Proof-of-concept code
- ❌ Incomplete features or work-in-progress
- ❌ Debug logging or temporary fixes
- ❌ Unapproved metadata changes

**Production deployments require**:
- ✅ Full testing in sandbox
- ✅ User acceptance testing (UAT) completion
- ✅ Formal approval from stakeholder
- ✅ Documented deployment plan
- ✅ Rollback plan ready
- ✅ Change control ticket (if applicable)

### Incident Response: Accidental Production Deployment

**If test code is accidentally deployed to production:**

1. **IMMEDIATELY notify stakeholders** - Don't hide mistakes
2. **Assess impact** - Is anything activated/visible to users?
3. **Delete test metadata** - Remove from production ASAP
4. **Verify no side effects** - Check for broken dependencies
5. **Document incident** - What happened, why, how to prevent

**Example deletion commands**:
```bash
# Delete FlexiPage
sf project delete source --metadata FlexiPage:<DeveloperName> --target-org <prod-alias> --no-prompt

# Delete CompactLayout
sf project delete source --metadata CompactLayout:<DeveloperName> --target-org <prod-alias> --no-prompt
```

### Historical Incidents

**Incident #1: 2025-10-18 - Phase 2 Layout Deployment**
- **What**: Deployed test Contact layouts to `peregrine-main` (production)
- **Impact**: None - layouts not activated, not visible to users
- **Root Cause**: Confused `peregrine-main` with `PEREGRINE_SANDBOX`
- **Resolution**: Redeployed to correct sandbox, provided deletion commands for production
- **Prevention**: Created this document, added pre-flight checks to deployment workflow

### Enforcement

**This rule is ABSOLUTE and NON-NEGOTIABLE.**

Violations will result in:
1. Immediate incident documentation
2. Mandatory root cause analysis
3. Additional safeguards added to prevent recurrence
4. Review of deployment permissions

### Safe Testing Workflow

**Correct workflow for testing**:

```
1. Develop locally
   ↓
2. Deploy to SANDBOX (verify IsSandbox = true)
   ↓
3. Test thoroughly in SANDBOX
   ↓
4. Get UAT approval in SANDBOX
   ↓
5. Create production-ready package
   ↓
6. Get stakeholder approval
   ↓
7. Deploy to PRODUCTION (with rollback plan)
```

**NEVER skip steps 2-6 by deploying directly to production.**

---

**Created**: 2025-10-18
**Last Updated**: 2025-10-18
**Reason**: Prevent accidental production deployments during testing
