#!/usr/bin/env node

/**
 * Create Asana tasks from fix plans
 * Reads fix-plans JSON and creates human-readable Asana tasks
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Load configuration
const asanaLinksPath = path.join(__dirname, '..', '.asana-links.json');
const asanaLinks = JSON.parse(fs.readFileSync(asanaLinksPath, 'utf8'));

const ASANA_ACCESS_TOKEN = process.env.ASANA_ACCESS_TOKEN;
const PROJECT_GID = asanaLinks.projects.find(p => p.primary).gid;
const WORKSPACE_ID = asanaLinks.workspace_id;

if (!ASANA_ACCESS_TOKEN) {
  console.error('❌ Error: ASANA_ACCESS_TOKEN environment variable not set');
  process.exit(1);
}

/**
 * Make Asana API request
 */
function asanaRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'app.asana.com',
      port: 443,
      path: `/api/1.0${path}`,
      method: method,
      headers: {
        'Authorization': `Bearer ${ASANA_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed.data);
          } else {
            reject(new Error(`Asana API error (${res.statusCode}): ${JSON.stringify(parsed)}`));
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${responseData}`));
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify({ data }));
    }

    req.end();
  });
}

/**
 * Calculate due date based on effort hours
 */
function calculateDueDate(effortHours) {
  const today = new Date();
  let daysToAdd;

  if (effortHours < 8) {
    daysToAdd = 14; // 2 weeks
  } else if (effortHours < 16) {
    daysToAdd = 28; // 4 weeks
  } else {
    daysToAdd = 42; // 6 weeks
  }

  const dueDate = new Date(today);
  dueDate.setDate(dueDate.getDate() + daysToAdd);

  // Format as YYYY-MM-DD
  return dueDate.toISOString().split('T')[0];
}

/**
 * Map priority to Asana
 */
function mapPriority(priority) {
  const mapping = {
    'P0': 'High',
    'P1': 'High',
    'P2': 'Medium',
    'P3': 'Low'
  };
  return mapping[priority] || 'Medium';
}

/**
 * Get action verb based on solution type
 */
function getActionVerb(solutionType) {
  const verbs = {
    'agent_update': 'Update',
    'automation_enhancement': 'Fix',
    'prompt_improvement': 'Improve',
    'playbook_creation': 'Create',
    'documentation': 'Document',
    'architecture': 'Refactor'
  };
  return verbs[solutionType] || 'Resolve';
}

/**
 * Build task title
 */
function buildTaskTitle(fixPlan) {
  const actionVerb = getActionVerb(fixPlan.solution.type);
  const summary = fixPlan.solution.title || fixPlan.root_cause_analysis.primary_cause.substring(0, 80);
  return `[Reflection] ${actionVerb} ${summary}`;
}

/**
 * Build task description
 */
function buildTaskDescription(fixPlan) {
  const rca = fixPlan.root_cause_analysis;
  const solution = fixPlan.solution;
  const alternatives = fixPlan.alternatives_considered || [];

  // Estimate time wasted
  const timeWastedEstimate = fixPlan.roi_calculation?.time_saved_per_occurrence || 2;
  const frequency = fixPlan.roi_calculation?.occurrences_per_month || 5;

  let description = `## 🔴 The Issue(s)
${rca.primary_cause}

- **Observed in:** 1 reflection
- **Frequency:** Approximately ${frequency} times per month
- **User impact:** ${timeWastedEstimate} hours wasted per occurrence due to trial-and-error development

## 🔬 Root Cause Analysis
**Primary cause:** ${rca.primary_cause}

**Contributing factors:**
${rca.contributing_factors.map(f => `- ${f}`).join('\n')}

**Why it wasn't caught:**
${rca.safeguard_gaps.map(g => `- ${g}`).join('\n')}

## 📊 The Impact
- **Time wasted:** ${timeWastedEstimate} hours per occurrence
- **Annual ROI of fix:** $${fixPlan.expected_roi_annual.toLocaleString()}
- **Affected users:** Plugin developers and end users experiencing workflow friction
- **Severity:** ${fixPlan.priority}
- **Related reflections:** 1

## ✅ The Solution
${solution.description}

**Components affected:**
${solution.components_affected.map(c => `- ${c}`).join('\n')}

## 🤔 Alternative Solutions Considered
`;

  alternatives.forEach((alt, i) => {
    description += `
${i + 1}. **${alt.title}**
   - **Pros:** ${alt.pros.join(', ')}
   - **Cons:** ${alt.cons.join(', ')}
   - **Effort:** ${alt.estimated_effort_hours} hours
   - **Expected ROI:** $${alt.expected_roi_annual.toLocaleString()}
   - **Why not chosen:** ${alt.why_not_chosen}
`;
  });

  description += `
## 📎 Related Reflections
- Reflection ID: ${fixPlan.reflection_id}
- Issue ID: ${fixPlan.issue_id}
- Created: ${fixPlan.created_at}

## 🎯 Success Criteria
${fixPlan.success_criteria.map(c => `- ${c}`).join('\n')}

---

**ROI Details:**
- Implementation effort: ${fixPlan.estimated_effort_hours} hours
- Annual value: $${fixPlan.roi_calculation?.annual_value?.toLocaleString() || 'N/A'}
- Payback period: ${fixPlan.payback_period_days} days
- Success probability: ${(fixPlan.success_probability * 100).toFixed(0)}%
`;

  return description;
}

/**
 * Create Asana task
 */
async function createAsanaTask(fixPlan) {
  const title = buildTaskTitle(fixPlan);
  const description = buildTaskDescription(fixPlan);
  const priority = mapPriority(fixPlan.priority);
  const dueDate = calculateDueDate(fixPlan.estimated_effort_hours);

  console.log(`\n📝 Creating task: ${title}`);
  console.log(`   Priority: ${priority}, Due: ${dueDate}`);

  const taskData = {
    name: title,
    notes: description,
    projects: [PROJECT_GID],
    due_on: dueDate,
    workspace: WORKSPACE_ID
  };

  try {
    const task = await asanaRequest('POST', '/tasks', taskData);
    console.log(`✅ Created task: ${task.gid}`);
    console.log(`   URL: ${task.permalink_url || `https://app.asana.com/0/${PROJECT_GID}/${task.gid}`}`);

    return {
      fix_plan_id: fixPlan.fix_plan_id,
      issue_id: fixPlan.issue_id,
      task_id: task.gid,
      task_url: task.permalink_url || `https://app.asana.com/0/${PROJECT_GID}/${task.gid}`,
      title: title,
      priority: priority,
      due_date: dueDate,
      created_at: new Date().toISOString()
    };
  } catch (error) {
    console.error(`❌ Failed to create task: ${error.message}`);
    return {
      fix_plan_id: fixPlan.fix_plan_id,
      issue_id: fixPlan.issue_id,
      error: error.message
    };
  }
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node create-asana-tasks-from-fix-plans.js <fix-plans-file.json>');
    process.exit(1);
  }

  const fixPlansFile = args[0];
  if (!fs.existsSync(fixPlansFile)) {
    console.error(`❌ Error: Fix plans file not found: ${fixPlansFile}`);
    process.exit(1);
  }

  console.log('🚀 Creating Asana tasks from fix plans...');
  console.log(`   Fix plans: ${fixPlansFile}`);
  console.log(`   Project: ${asanaLinks.projects.find(p => p.primary).name} (${PROJECT_GID})`);

  const fixPlansData = JSON.parse(fs.readFileSync(fixPlansFile, 'utf8'));
  const fixPlans = fixPlansData.fix_plans;

  console.log(`\n📋 Found ${fixPlans.length} fix plans to process`);

  const results = [];
  const errors = [];

  for (const fixPlan of fixPlans) {
    try {
      const result = await createAsanaTask(fixPlan);
      if (result.error) {
        errors.push(result);
      } else {
        results.push(result);
      }
    } catch (error) {
      console.error(`❌ Unexpected error processing ${fixPlan.issue_id}: ${error.message}`);
      errors.push({
        fix_plan_id: fixPlan.fix_plan_id,
        issue_id: fixPlan.issue_id,
        error: error.message
      });
    }
  }

  // Save results
  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
  const outputFile = path.join(__dirname, '..', 'reports', `asana-tasks-${timestamp}.json`);

  const output = {
    tasks_created: results.length,
    project_id: PROJECT_GID,
    project_url: asanaLinks.projects.find(p => p.primary).permalink_url,
    tasks: results,
    errors: errors,
    created_at: new Date().toISOString()
  };

  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
  console.log(`\n📊 Summary:`);
  console.log(`   Tasks created: ${results.length}`);
  console.log(`   Errors: ${errors.length}`);
  console.log(`   Results saved to: ${outputFile}`);

  if (results.length > 0) {
    console.log(`\n🔗 View tasks in Asana:`);
    console.log(`   ${asanaLinks.projects.find(p => p.primary).permalink_url}`);
  }
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
