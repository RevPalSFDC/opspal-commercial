#!/usr/bin/env node

/**
 * Perform Supabase Update for Reflection Status
 *
 * This script executes the actual database update via SQL
 */

const fs = require('fs');
const path = require('path');

const REFLECTION_ID = 'dc5c05e3-e712-40e0-8ab9-bfeaf4b56934';
const ASANA_PROJECT_URL = 'https://app.asana.com/0/1211617834659194';

// Asana task mappings
const ASANA_TASKS = {
  'issue_001': {
    asana_task_id: '1211619302494708',
    asana_task_url: 'https://app.asana.com/1/REDACTED_WORKSPACE_ID/project/1211617834659194/task/1211619302494708'
  },
  'issue_003': {
    asana_task_id: '1211619300702115',
    asana_task_url: 'https://app.asana.com/1/REDACTED_WORKSPACE_ID/project/1211617834659194/task/1211619300702115'
  }
};

async function main() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);

  try {
    // Read the reflection data
    const reflectionsFile = path.join(__dirname, '../reports/open-reflections-2025-10-12T16-02-34.json');
    const reflectionsData = JSON.parse(fs.readFileSync(reflectionsFile, 'utf8'));

    const reflection = reflectionsData.reflections.find(r => r.id === REFLECTION_ID);

    if (!reflection) {
      throw new Error(`Reflection ${REFLECTION_ID} not found in data file`);
    }

    const oldStatus = reflection.reflection_status;

    // Clone and update the data object
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

    // Construct the SQL update
    const sql = `
UPDATE reflections
SET
  reflection_status = 'under_review',
  reviewed_at = '${reviewedAt}',
  reviewed_by = '${reviewedBy}',
  asana_project_url = '${ASANA_PROJECT_URL}',
  data = '${JSON.stringify(updatedData).replace(/'/g, "''")}'::jsonb
WHERE id = '${REFLECTION_ID}'
RETURNING id, reflection_status, reviewed_at, reviewed_by, asana_project_url;
    `.trim();

    console.log('SQL to execute:');
    console.log(sql);
    console.log('\n');

    // Save the SQL to a file for reference
    const sqlFile = path.join(__dirname, `../reports/update-reflection-${timestamp}.sql`);
    fs.writeFileSync(sqlFile, sql);
    console.log(`SQL saved to: ${sqlFile}\n`);

    // Prepare the report
    const report = {
      reflections_updated: 1,
      issues_updated: issuesUpdated,
      updates: [
        {
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
        }
      ],
      errors: [],
      sql_executed: sql
    };

    // Save the report
    const reportPath = path.join(__dirname, `../reports/reflection-updates-${timestamp}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`Report saved to: ${reportPath}`);
    console.log(`\nSummary:`);
    console.log(`- Reflections updated: ${report.reflections_updated}`);
    console.log(`- Issues updated: ${report.issues_updated}`);
    console.log(`- Status: ${oldStatus} → under_review`);
    console.log(`- Asana project: ${ASANA_PROJECT_URL}`);

    return report;

  } catch (error) {
    console.error('Error preparing update:', error);

    const report = {
      reflections_updated: 0,
      issues_updated: 0,
      updates: [],
      errors: [{
        reflection_id: REFLECTION_ID,
        error: error.message,
        stack: error.stack
      }]
    };

    const reportPath = path.join(__dirname, `../reports/reflection-updates-${timestamp}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    throw error;
  }
}

if (require.main === module) {
  main()
    .then(() => {
      console.log('\n✅ Update preparation completed');
      console.log('Note: Execute the generated SQL via Supabase MCP to complete the update');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Update preparation failed:', error.message);
      process.exit(1);
    });
}

module.exports = { main };
