#!/usr/bin/env node

/**
 * Create Asana tasks from fix plans
 * Uses Asana MCP tools to create tasks with human-readable format
 */

const fs = require('fs');
const path = require('path');

// Read fix plans
const fixPlansPath = path.join(__dirname, '../reports/fix-plans-20251014_202311.json');
const fixPlansData = JSON.parse(fs.readFileSync(fixPlansPath, 'utf8'));

// Read Asana config
const asanaConfigPath = path.join(__dirname, '../.asana-links.json');
const asanaConfig = JSON.parse(fs.readFileSync(asanaConfigPath, 'utf8'));

const projectGid = asanaConfig.projects.find(p => p.primary).gid;

// Helper to format date (days from now)
function formatDueDate(daysFromNow) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().split('T')[0];
}

// Helper to build task description
function buildTaskDescription(fixPlan) {
  const cohort = fixPlan.cohort_summary;
  const rca = fixPlan.root_cause_analysis;
  const solution = fixPlan.solution;
  const alternatives = fixPlan.alternatives_considered;

  // Build related reflections section
  const reflectionsText = fixPlan.cohort_summary.reflection_count > 0
    ? `${cohort.reflection_count} reflections in this cohort from ${cohort.affected_orgs.join(', ')}`
    : 'No specific reflections linked';

  return `## 🔴 The Issue(s)
${cohort.root_cause}

- **Observed in**: ${cohort.affected_orgs.join(', ')}
- **Frequency**: ${cohort.reflection_count} occurrences detected
- **User impact**: Repeated API failures, wasted time, potential data loss

## 🔬 Root Cause Analysis
**Primary cause:** ${rca.primary_cause}

**Contributing factors:**
${rca.contributing_factors.map(f => `- ${f}`).join('\n')}

**Why it wasn't caught:**
${rca.safeguard_gaps.map(g => `- ${g}`).join('\n')}

## 📊 The Impact
- **Time wasted**: ~${Math.round(fixPlan.estimated_effort_hours * 0.5)} hours/month across affected orgs
- **Annual ROI of fix**: $${fixPlan.expected_roi_annual.toLocaleString()}/year
- **Affected users**: ${cohort.affected_orgs.length} org(s)
- **Severity**: ${cohort.priority}
- **Reflections in cohort**: ${cohort.reflection_count}

## ✅ The Solution
${solution.description}

**Implementation phases:**
${solution.implementation_strategy.map((phase, i) => `${i + 1}. ${phase}`).join('\n')}

## 🤔 Alternative Solutions Considered

${alternatives.map((alt, i) => `### ${i + 1}. ${alt.title}
**Pros:**
${alt.pros.map(p => `- ${p}`).join('\n')}

**Cons:**
${alt.cons.map(c => `- ${c}`).join('\n')}

**Why not chosen:** ${alt.why_not_chosen}
`).join('\n')}

## 📎 Related Reflections
${reflectionsText}

## 🎯 Success Criteria
${fixPlan.success_criteria.map(c => `- ${c}`).join('\n')}

---

**Estimated effort:** ${fixPlan.estimated_effort_hours} hours
**Expected ROI:** $${fixPlan.expected_roi_annual.toLocaleString()}/year
**Success probability:** ${Math.round(fixPlan.success_probability * 100)}%
**Payback period:** ${fixPlan.payback_period_weeks} weeks`;
}

// Task specifications
const tasks = [
  {
    cohort_id: 'cohort-1760401249904-ye804v05y',
    name: '[Reflection Cohort] Implement HubSpot API Safeguard Library with Pre-Flight Validation',
    due_days: 7,
  },
  {
    cohort_id: 'cohort-1760401249905-pby8zxhdo',
    name: '[Reflection Cohort] Create Universal Schema Validator with Two-Phase Migration Pattern',
    due_days: 7,
  },
  {
    cohort_id: 'cohort-1760401249904-m5csbv8lw',
    name: '[Reflection Cohort] Clarify Mandatory vs Optional Distinction with Decision Tree',
    due_days: 5,
  },
  {
    cohort_id: 'cohort-1760401249905-080wdq2p3',
    name: '[Reflection Cohort] Implement Sub-Agent Verification Layer with Mandatory Post-Execution Validation',
    due_days: 7,
  },
];

// Build task payloads
const taskPayloads = tasks.map(task => {
  const fixPlan = fixPlansData.fix_plans.find(fp => fp.cohort_id === task.cohort_id);
  if (!fixPlan) {
    console.error(`Fix plan not found for cohort ${task.cohort_id}`);
    return null;
  }

  return {
    name: task.name,
    notes: buildTaskDescription(fixPlan),
    projects: [projectGid],
    due_on: formatDueDate(task.due_days),
    resource_subtype: 'default_task',
  };
}).filter(Boolean);

// Output task payloads
console.log(JSON.stringify(taskPayloads, null, 2));
