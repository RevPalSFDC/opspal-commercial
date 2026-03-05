# Phase 1 Effectiveness Monitoring Plan

**Purpose**: Track how well enhanced CLAUDE.md routing works without hook output
**Duration**: 2 weeks (2025-12-10 to 2025-12-24)
**Goal**: Gather data to guide Phase 2 implementation decisions

---

## What We're Monitoring

### Primary Metrics

**1. Agent Utilization Rate**
- **Definition**: % of BLOCKED operations that use correct specialist agent
- **Target**: ≥75%
- **How to measure**: Count Task tool invocations with BLOCKED operation keywords

**2. Routing Accuracy**
- **Definition**: % of agent selections that are correct for the task
- **Target**: ≥90%
- **How to measure**: Review task outcomes and user feedback

**3. Routing Failures**
- **Definition**: # of times Claude attempts direct execution for BLOCKED operations
- **Target**: <10%
- **How to measure**: Count BLOCKED keywords that don't result in Task tool

### Secondary Metrics

**4. User Intervention Rate**
- **Definition**: % of tasks requiring manual routing correction
- **Target**: <5%
- **How to measure**: Count user corrections or clarifications

**5. Keyword Coverage**
- **Definition**: % of specialist tasks that match a CLAUDE.md keyword
- **Target**: ≥85%
- **How to measure**: Review unmatched tasks, identify missing keywords

**6. False Positives**
- **Definition**: # of tasks incorrectly flagged as BLOCKED
- **Target**: <5%
- **How to measure**: Tasks Claude blocked but could handle directly

---

## Data Collection Methods

### Method 1: Manual Observation Log

**Create**: `.claude/logs/routing-observations.jsonl`

**Format**:
```jsonl
{"timestamp":"2025-12-10T19:00:00Z","user_request":"perform cpq audit","keywords_matched":["cpq","audit"],"agent_used":"opspal-salesforce:sfdc-cpq-assessor","correct":true,"notes":""}
{"timestamp":"2025-12-10T19:15:00Z","user_request":"add checkbox field","keywords_matched":[],"agent_used":null,"correct":true,"notes":"direct execution appropriate"}
{"timestamp":"2025-12-10T19:30:00Z","user_request":"create permission set","keywords_matched":["permission set"],"agent_used":null,"correct":false,"notes":"FAILURE - attempted direct execution"}
```

**Fields**:
- `timestamp`: ISO 8601 datetime
- `user_request`: User's original request (first 100 chars)
- `keywords_matched`: Array of CLAUDE.md keywords that matched
- `agent_used`: Agent invoked (null if direct execution)
- `correct`: Was the routing decision correct?
- `notes`: Any observations or issues

**Update frequency**: After each specialist task or routing decision

### Method 2: Periodic Review

**Schedule**: Every 3 days (2025-12-13, 12-16, 12-19, 12-22)

**Review checklist**:
- [ ] Read recent conversation history
- [ ] Identify specialist tasks
- [ ] Verify correct agent usage
- [ ] Note any routing failures
- [ ] Update observations log
- [ ] Calculate metrics

### Method 3: User Feedback Collection

**Ask users**:
1. "Did Claude use the right agent for your task?"
2. "Did you have to manually correct routing?"
3. "Were any tasks unnecessarily blocked?"
4. "Were any tasks that should have been blocked, not blocked?"

**Collection method**:
- End of session survey
- Ad-hoc feedback via `/reflect` command
- Observation during pair work

---

## Analysis Scripts

### Script 1: Calculate Metrics

**File**: `scripts/calculate-routing-metrics.js`

```javascript
#!/usr/bin/env node
/**
 * Calculate routing metrics from observation log
 * Usage: node scripts/calculate-routing-metrics.js [--days 7]
 */

const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(process.env.HOME, '.claude/logs/routing-observations.jsonl');
const DAYS = parseInt(process.argv[3]) || 7;

// Read log file
const logs = fs.readFileSync(LOG_FILE, 'utf8')
  .split('\n')
  .filter(line => line.trim())
  .map(line => JSON.parse(line));

// Filter to last N days
const cutoff = new Date();
cutoff.setDate(cutoff.getDate() - DAYS);
const recentLogs = logs.filter(log => new Date(log.timestamp) >= cutoff);

// Calculate metrics
const total = recentLogs.length;
const correctRouting = recentLogs.filter(log => log.correct).length;
const agentUsed = recentLogs.filter(log => log.agent_used !== null).length;
const blockedKeywords = recentLogs.filter(log => log.keywords_matched.length > 0);
const blockedWithAgent = blockedKeywords.filter(log => log.agent_used !== null).length;
const routingFailures = recentLogs.filter(log => !log.correct && log.keywords_matched.length > 0).length;

// Output report
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`📊 ROUTING METRICS (Last ${DAYS} days)`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log();
console.log(`Total Tasks: ${total}`);
console.log(`Agent Utilization: ${agentUsed}/${total} (${((agentUsed/total)*100).toFixed(1)}%)`);
console.log(`Routing Accuracy: ${correctRouting}/${total} (${((correctRouting/total)*100).toFixed(1)}%)`);
console.log();
console.log(`BLOCKED Operations: ${blockedKeywords.length}`);
console.log(`  → Used Agent: ${blockedWithAgent}/${blockedKeywords.length} (${((blockedWithAgent/blockedKeywords.length)*100).toFixed(1)}%)`);
console.log(`  → Failures: ${routingFailures} (${((routingFailures/blockedKeywords.length)*100).toFixed(1)}%)`);
console.log();

// Target comparison
const targets = {
  utilization: 75,
  accuracy: 90,
  failures: 10
};

const utilizationRate = (blockedWithAgent/blockedKeywords.length)*100;
const accuracyRate = (correctRouting/total)*100;
const failureRate = (routingFailures/blockedKeywords.length)*100;

console.log(`Status vs Targets:`);
console.log(`  Agent Utilization: ${utilizationRate.toFixed(1)}% ${utilizationRate >= targets.utilization ? '✅' : '❌'} (target: ≥${targets.utilization}%)`);
console.log(`  Routing Accuracy: ${accuracyRate.toFixed(1)}% ${accuracyRate >= targets.accuracy ? '✅' : '❌'} (target: ≥${targets.accuracy}%)`);
console.log(`  Failure Rate: ${failureRate.toFixed(1)}% ${failureRate <= targets.failures ? '✅' : '❌'} (target: ≤${targets.failures}%)`);
console.log();
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

// Exit with status
if (utilizationRate >= targets.utilization &&
    accuracyRate >= targets.accuracy &&
    failureRate <= targets.failures) {
  console.log(`✅ All targets met - Phase 1 is effective`);
  process.exit(0);
} else {
  console.log(`⚠️ Targets not met - Consider Phase 2 enhancements`);
  process.exit(1);
}
```

### Script 2: Identify Missing Keywords

**File**: `scripts/identify-missing-keywords.js`

```javascript
#!/usr/bin/env node
/**
 * Identify tasks that should have matched but didn't
 * Suggests new keywords to add to CLAUDE.md
 */

const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(process.env.HOME, '.claude/logs/routing-observations.jsonl');

// Read logs
const logs = fs.readFileSync(LOG_FILE, 'utf8')
  .split('\n')
  .filter(line => line.trim())
  .map(line => JSON.parse(line));

// Find unmatched specialist tasks
const unmatched = logs.filter(log =>
  log.agent_used !== null &&
  log.keywords_matched.length === 0
);

// Extract common patterns
const keywords = {};
unmatched.forEach(log => {
  const words = log.user_request.toLowerCase().split(/\s+/);
  words.forEach(word => {
    if (word.length > 3) {
      keywords[word] = (keywords[word] || 0) + 1;
    }
  });
});

// Sort by frequency
const sortedKeywords = Object.entries(keywords)
  .sort(([, a], [, b]) => b - a)
  .slice(0, 20);

console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`🔍 MISSING KEYWORDS ANALYSIS`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log();
console.log(`Unmatched Specialist Tasks: ${unmatched.length}`);
console.log();
console.log(`Top Candidate Keywords (by frequency):`);
sortedKeywords.forEach(([word, count]) => {
  console.log(`  "${word}" - appeared ${count} times`);
});
console.log();
console.log(`Suggested CLAUDE.md Updates:`);
console.log(`Add these keywords to relevant routing table entries:`);
sortedKeywords.slice(0, 10).forEach(([word]) => {
  console.log(`  - ${word}`);
});
console.log();
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
```

---

## Weekly Review Process

### Every Monday Morning

**1. Generate Metrics Report**
```bash
node scripts/calculate-routing-metrics.js --days 7
```

**2. Review Observations Log**
- Open `.claude/logs/routing-observations.jsonl`
- Read through entries
- Note patterns and trends

**3. Identify Issues**
- Missing keywords (run `identify-missing-keywords.js`)
- False positives (tasks incorrectly blocked)
- Routing failures (BLOCKED tasks attempted directly)

**4. Update CLAUDE.md**
- Add missing keywords
- Refine BLOCKED operations list
- Clarify complexity criteria
- Update examples

**5. Document Changes**
- Log changes in `MONITORING_LOG.md`
- Note reasons for changes
- Track effectiveness of changes

---

## Decision Criteria for Phase 2

### GREEN: Phase 1 Sufficient (Don't Implement Phase 2 Yet)
- ✅ Agent utilization ≥75%
- ✅ Routing accuracy ≥90%
- ✅ Failure rate ≤10%
- ✅ User satisfaction high
- ✅ Low maintenance burden

**Action**: Continue monitoring, minor CLAUDE.md refinements only

### YELLOW: Phase 2 Would Help (Implement Selected Components)
- ⚠️ Agent utilization 60-75%
- ⚠️ Routing accuracy 80-90%
- ⚠️ Failure rate 10-20%
- ⚠️ Some user confusion
- ⚠️ Moderate maintenance burden

**Action**: Implement Phase 2 high-priority items (slash commands)

### RED: Phase 2 Critical (Implement All Components)
- ❌ Agent utilization <60%
- ❌ Routing accuracy <80%
- ❌ Failure rate >20%
- ❌ User frustration evident
- ❌ High maintenance burden

**Action**: Full Phase 2 implementation ASAP

---

## Sample Monitoring Log

**File**: `docs/MONITORING_LOG.md`

```markdown
# Phase 1 Monitoring Log

## Week 1: 2025-12-10 to 2025-12-17

### Metrics
- Agent Utilization: 100% (1/1) ✅
- Routing Accuracy: 100% (1/1) ✅
- Routing Failures: 0% ✅

### Observations
- Single test case: "perform q2c audit"
- Successfully matched "cpq" and "audit" keywords
- Correctly used opspal-salesforce:sfdc-cpq-assessor
- Agent engaged without issues

### Changes Made
- None (baseline week)

### Notes
- Need more data points (only 1 task)
- Monitoring system in place
- Awaiting organic usage

---

## Week 2: 2025-12-17 to 2025-12-24

### Metrics
- Agent Utilization: TBD
- Routing Accuracy: TBD
- Routing Failures: TBD

### Observations
- [To be filled in during weekly review]

### Changes Made
- [To be documented]

### Notes
- [Observations and insights]
```

---

## Monitoring Checklist

### Daily (if active development)
- [ ] Check for new specialist tasks
- [ ] Verify agent usage
- [ ] Note any routing issues
- [ ] Update observations log

### Every 3 Days
- [ ] Run metrics calculation
- [ ] Review observation log
- [ ] Identify patterns
- [ ] Consider CLAUDE.md updates

### Weekly (Monday)
- [ ] Generate full metrics report
- [ ] Run missing keywords analysis
- [ ] Update CLAUDE.md if needed
- [ ] Document changes in monitoring log
- [ ] Assess if Phase 2 needed

### End of 2 Weeks (2025-12-24)
- [ ] Generate final Phase 1 report
- [ ] Calculate all metrics vs. targets
- [ ] Make Phase 2 go/no-go decision
- [ ] If go: Prioritize Phase 2 components
- [ ] Document learnings and recommendations

---

## Quick Start

### Setup (One-time)

1. **Create log directory**:
```bash
mkdir -p ~/.claude/logs
touch ~/.claude/logs/routing-observations.jsonl
```

2. **Create scripts directory**:
```bash
mkdir -p scripts
# Copy scripts from this document to:
# - scripts/calculate-routing-metrics.js
# - scripts/identify-missing-keywords.js
chmod +x scripts/*.js
```

3. **Initialize monitoring log**:
```bash
touch docs/MONITORING_LOG.md
# Copy template from this document
```

### Daily Usage

**After each specialist task:**
```bash
# Add entry to observations log
echo '{"timestamp":"'$(date -Iseconds)'","user_request":"[task]","keywords_matched":["keyword1"],"agent_used":"agent-name","correct":true,"notes":""}' >> ~/.claude/logs/routing-observations.jsonl
```

**Check metrics:**
```bash
node scripts/calculate-routing-metrics.js --days 7
```

---

## Success Criteria

### Phase 1 is "Successful" if:
- ✅ Agent utilization ≥75% after 2 weeks
- ✅ Routing accuracy ≥90% after 2 weeks
- ✅ Failure rate ≤10% after 2 weeks
- ✅ User feedback positive
- ✅ Low maintenance burden (<1 hour/week)

### Phase 1 is "Needs Enhancement" if:
- ⚠️ Any metric below target
- ⚠️ User confusion or frustration
- ⚠️ High maintenance burden
- ⚠️ Missing keywords frequent

**Decision**: Implement Phase 2 enhancements

---

## Files to Create

1. `.claude/logs/routing-observations.jsonl` - Observation log
2. `scripts/calculate-routing-metrics.js` - Metrics calculator
3. `scripts/identify-missing-keywords.js` - Keyword analyzer
4. `docs/MONITORING_LOG.md` - Weekly review log

---

**Status**: Ready to start monitoring
**Duration**: 2 weeks (2025-12-10 to 2025-12-24)
**Next Review**: 2025-12-13 (3 days)
**Final Decision**: 2025-12-24 (go/no-go on Phase 2)

**Last Updated**: 2025-12-10
**Version**: 1.0
