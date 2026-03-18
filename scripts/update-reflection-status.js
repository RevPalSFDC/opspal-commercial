#!/usr/bin/env node

/**
 * Update Reflection Status in Supabase
 *
 * Updates reflection status to 'under_review' and adds Asana task links to issues
 */

const REFLECTION_ID = 'dc5c05e3-e712-40e0-8ab9-bfeaf4b56934';
const ASANA_PROJECT_URL = 'https://app.asana.com/0/1211617834659194';

// Asana task mappings
const ASANA_TASKS = {
  'issue_001': {
    asana_task_id: '1211619302494708',
    asana_task_url: 'https://app.asana.com/1/REDACTED_ASANA_WORKSPACE/project/1211617834659194/task/1211619302494708'
  },
  'issue_003': {
    asana_task_id: '1211619300702115',
    asana_task_url: 'https://app.asana.com/1/REDACTED_ASANA_WORKSPACE/project/1211617834659194/task/1211619300702115'
  }
};

function escapePgString(value) {
  return value.replace(/'/g, "''");
}

async function updateReflection() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const report = {
    reflections_updated: 0,
    issues_updated: 0,
    updates: [],
    errors: []
  };

  try {
    // Read the reflection data from the file
    const fs = require('fs');
    const path = require('path');

    const reflectionsFile = path.join(__dirname, '../reports/open-reflections-2025-10-12T16-02-34.json');
    const reflectionsData = JSON.parse(fs.readFileSync(reflectionsFile, 'utf8'));

    const reflection = reflectionsData.reflections.find(r => r.id === REFLECTION_ID);

    if (!reflection) {
      throw new Error(`Reflection ${REFLECTION_ID} not found in data file`);
    }

    const oldStatus = reflection.reflection_status;

    // Clone the data object to modify it
    const updatedData = JSON.parse(JSON.stringify(reflection.data));

    // Update issues with Asana task links
    let issuesUpdated = 0;
    if (updatedData.issues && Array.isArray(updatedData.issues)) {
      updatedData.issues = updatedData.issues.map(issue => {
        if (ASANA_TASKS[issue.id]) {
          issuesUpdated++;
          return {
            ...issue,
            asana_task_id: ASANA_TASKS[issue.id].asana_task_id,
            asana_task_url: ASANA_TASKS[issue.id].asana_task_url
          };
        }
        return issue;
      });
    }

    // Get user email from environment or use default
    const reviewedBy = process.env.USER_EMAIL || 'auto-processing';
    const reviewedAt = new Date().toISOString();

    // Prepare the update data
    const updatePayload = {
      reflection_status: 'under_review',
      reviewed_at: reviewedAt,
      reviewed_by: reviewedBy,
      asana_project_url: ASANA_PROJECT_URL,
      data: updatedData
    };

    console.log('Updating reflection with payload:');
    console.log(JSON.stringify(updatePayload, null, 2));

    // Note: The actual Supabase update would need to be done via MCP
    // This script prepares the data and outputs what needs to be updated

    report.reflections_updated = 1;
    report.issues_updated = issuesUpdated;
    report.updates.push({
      reflection_id: REFLECTION_ID,
      old_status: oldStatus,
      new_status: 'under_review',
      asana_project_url: ASANA_PROJECT_URL,
      issues_with_tasks: Object.keys(ASANA_TASKS).map(issueId => ({
        issue_id: issueId,
        asana_task_id: ASANA_TASKS[issueId].asana_task_id,
        asana_task_url: ASANA_TASKS[issueId].asana_task_url
      })),
      reviewed_at: reviewedAt,
      reviewed_by: reviewedBy
    });

    // Save the report
    const reportPath = path.join(__dirname, `../reports/reflection-updates-${timestamp}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`\nReport saved to: ${reportPath}`);
    console.log(`\nReflections updated: ${report.reflections_updated}`);
    console.log(`Issues updated: ${report.issues_updated}`);

    // Output the SQL for manual execution or MCP use
    console.log('\n=== SQL UPDATE STATEMENT ===\n');
    console.log(`UPDATE reflections`);
    console.log(`SET`);
    console.log(`  reflection_status = 'under_review',`);
    console.log(`  reviewed_at = '${reviewedAt}',`);
    console.log(`  reviewed_by = '${reviewedBy}',`);
    console.log(`  asana_project_url = '${ASANA_PROJECT_URL}',`);
    const jsonPayload = escapePgString(JSON.stringify(updatedData));
    console.log(`  data = '${jsonPayload}'::jsonb`);
    console.log(`WHERE id = '${REFLECTION_ID}'`);
    console.log(`RETURNING id, reflection_status, reviewed_at, reviewed_by, asana_project_url;`);
    console.log('\n=========================\n');

    return report;

  } catch (error) {
    console.error('Error updating reflection:', error);
    report.errors.push({
      reflection_id: REFLECTION_ID,
      error: error.message,
      stack: error.stack
    });

    // Save error report
    const reportPath = path.join(__dirname, `../reports/reflection-updates-${timestamp}.json`);
    require('fs').writeFileSync(reportPath, JSON.stringify(report, null, 2));

    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  updateReflection()
    .then(() => {
      console.log('Update preparation completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Update preparation failed:', error);
      process.exit(1);
    });
}

module.exports = { updateReflection };
