# Usage Investigation Results
**Date**: 2025-12-11
**Duration**: Day 1 Morning (4 hours)

## Executive Summary

Investigation reveals **higher usage than expected** for most incomplete features. Several features previously thought to be non-functional are actually in active use or have significant infrastructure in place.

---

## Detailed Findings

### 1. Asana Integration

**Metrics:**
- 253 agent references
- 1 `.asana-links.json` file (root directory)
- Dedicated `asana-task-manager` agent with full MCP integration

**Status:** **✅ FUNCTIONAL via MCP tools**

**Analysis:**
- **Misconception**: `project-connect.js` has `TODO: Add Asana search via MCP when available` with hardcoded `{ exists: false }`
- **Reality**: This is only the *automatic project discovery* feature that's not implemented
- **Actual Asana integration works** via `mcp_asana_*` tools (list_workspaces, search_projects, create_task, update_task, etc.)
- **Manual Asana linking is fully functional** and being used

**Decision:** ✅ **NO ACTION NEEDED**
- The TODO in `project-connect.js:268` is misleading - it's for auto-discovery only
- Core Asana functionality works fine via MCP
- Recommend updating TODO comment to clarify it's only auto-discovery that's missing

---

### 2. Email Alerting in Monitoring Scripts

**Metrics:**
- 291 agent references to monitoring
- 1 monitoring config file (`.claude-plugins/opspal-salesforce/scripts/monitoring/monitoring-config.json`)
- 4 scheduled monitoring jobs configured
- Email alerting enabled in config (`"enabled": true`)

**Status:** ⚠️ **CONFIGURED BUT NOT IMPLEMENTED**

**Analysis:**
- Config exists with SMTP settings (localhost:25)
- Recipients configured (devteam@company.com, admin@company.com)
- 4 monitoring scripts reference email alerts
- **Implementation is stubbed**: Line 348 in `monitoring-utils.js` shows commented-out `execAsync(mailCommand)`
- Scripts prepare `mailx` commands but don't execute them

**Decision:** 🔧 **FIX REQUIRED** (12 hours)
- Monitoring is actively used (291 references)
- Email config is in place
- Just need to uncomment/implement actual sending
- Alternative: Replace with Slack webhook (already configured but disabled)

**Recommended Fix:**
```javascript
// Option A: Enable mailx (2 hours)
await execAsync(mailCommand);

// Option B: Replace with Slack webhook (4 hours)
if (config.monitoring.alerting.slack.enabled) {
    await this.sendSlackAlert(subject, body);
}

// Option C: Use nodemailer (6 hours)
const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransporter(emailConfig.smtpConfig);
await transporter.sendMail({ from, to, subject, text: body });
```

---

### 3. Safe Update Rollback

**Metrics:**
- 5 agent references

**Status:** 📉 **LOW USAGE**

**Analysis:**
- Only 5 references across all agents
- Feature appears to be rarely used
- `safe-update.sh` lines 337-340 have rollback TODOs

**Decision:** 📋 **DOCUMENT AS FUTURE** (2 hours)
- Low usage doesn't justify 16-hour implementation
- Document the limitation and rollback procedure
- Add to Phase 3 backlog for future implementation

---

### 4. OOO Dependency Enforcer

**Metrics:**
- 58 references across JavaScript and Markdown files

**Status:** ⚠️ **MEDIUM USAGE** - Higher than expected

**Analysis:**
- Originally thought to be test-only
- 58 references suggest it's used in validation workflows
- All 6 core methods are stubbed (return placeholders)
- Located: `.claude-plugins/opspal-salesforce/scripts/lib/ooo-dependency-enforcer.js`

**Decision:** 🔍 **INVESTIGATE FURTHER**
- Need to check if references are actual usage or just imports
- If actually used: Complete implementation (32 hours)
- If just imported but not called: Remove or document as future

**Next Steps:**
```bash
# Check if methods are actually called
grep -r "checkFlowFieldReferences\|checkPicklistDependencies" .claude-plugins --include="*.js"
```

---

### 5. Flow Validator

**Metrics:**
- 34 agent references

**Status:** ✅ **HIGH USAGE** - Core system (as expected)

**Analysis:**
- Core validation system used by multiple agents
- Graph traversal TODO (line 1633) is in critical path
- Used in pre-deployment hooks

**Decision:** 🎯 **HIGHEST PRIORITY** (12 hours)
- Critical for preventing flow deployment failures
- Proceed as planned in Week 1 (Days 3-5)

---

### 6. Wire Test Reporter

**Metrics:**
- 28 files found (not just 1 reference)

**Status:** ⚠️ **MEDIUM USAGE** - Higher than expected

**Analysis:**
- Original audit found 1 reference, but 28 files exist
- May be used in UAT testing framework
- Located: `.claude-plugins/opspal-core/scripts/lib/wire-test-reporter.js`

**Decision:** 📋 **DEFER TO PHASE 3** (24 hours)
- Not critical for immediate timeline
- Add to backlog for Week 3+

---

## Updated Decision Matrix

| Feature | Actual Usage | Recommendation | Effort | Timeline |
|---------|-------------|----------------|--------|----------|
| Asana integration | ✅ HIGH | **No action** (works via MCP) | 0 hours | N/A |
| Email alerting | ⚠️ HIGH | **Fix** (uncomment send) | 2-12 hours | Day 2 |
| Safe update rollback | 📉 LOW | **Document future** | 2 hours | Day 2 |
| OOO enforcer | ⚠️ MEDIUM | **Investigate usage** | TBD | Day 2 |
| Flow validator | ✅ HIGH | **Proceed as planned** | 12 hours | Days 3-5 |
| Wire test reporter | ⚠️ MEDIUM | **Defer to Phase 3** | 24 hours | Week 3+ |

---

## Revised Timeline Impact

### Original Plan (56 hours):
- Day 1 AM: Investigation ✅
- Day 1 PM: NO_MOCKS fixes (4 hours)
- Day 2 AM: Critical blocker decisions (4 hours)
- Day 2 PM: Flow field validation (6 hours)
- Days 3-5: Flow validator graph traversal (12 hours)
- Days 6-7: Contact merge circular detection (12 hours)

### Revised Plan (52-62 hours):
- Day 1 AM: Investigation ✅ COMPLETE
- Day 1 PM: NO_MOCKS fixes (4 hours) - No change
- Day 2 AM: OOO enforcer investigation (2 hours) + Decisions (2 hours)
- Day 2 PM: Email alerting fix (2-12 hours) OR Flow field validation (6 hours)
- Days 3-5: Flow validator graph traversal (12 hours) - No change
- Days 6-7: Contact merge circular detection (12 hours) - No change

**Key Changes:**
1. ✅ Asana integration removed from work (0 hours saved)
2. ➕ Email alerting added to work (2-12 hours depending on approach)
3. ➕ OOO enforcer investigation added (2 hours)
4. Safe update documented as future (2 hours instead of 16 hours = 14 hours saved)

**Net Impact:** -2 to +8 hours depending on email alerting approach

---

## Recommendations

### Immediate (Day 1 Afternoon):
1. ✅ Proceed with NO_MOCKS violations fix (4 hours)
2. Update `project-connect.js` TODO comment to clarify Asana works via MCP (15 minutes)

### Day 2 Morning:
1. Run OOO enforcer usage analysis (2 hours)
2. Make decision: Fix email alerting or document as future (2 hours)

### Day 2 Afternoon:
- **Option A**: Implement email alerting (simple mailx uncomment - 2 hours)
- **Option B**: Integrate flow field validation (6 hours)
- **Option C**: Do both if email fix is quick (8 hours total)

### Days 3-7:
- Proceed with flow validator and circular detection as planned

---

## Files to Update Based on Investigation

### Immediate Updates:
1. `.claude-plugins/opspal-core/scripts/project-connect.js:268`
   - Update comment to clarify Asana MCP integration works

2. `.claude-plugins/opspal-salesforce/scripts/monitoring/monitoring-utils.js:348`
   - Uncomment email sending OR integrate Slack

3. `.claude-plugins/opspal-salesforce/scripts/lib/safe-update.sh:337-340`
   - Add documentation about manual rollback

### Investigation Needed:
1. `.claude-plugins/opspal-salesforce/scripts/lib/ooo-dependency-enforcer.js`
   - Check actual method call usage

---

## Success Metrics

✅ **Investigation Complete**
- All 6 features analyzed
- Usage patterns documented
- Decision matrix created
- Timeline impact assessed

**Next Steps:**
1. Mark investigation todo as complete
2. Start NO_MOCKS violations fix
3. Run OOO enforcer usage analysis tomorrow morning
