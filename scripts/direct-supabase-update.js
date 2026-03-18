#!/usr/bin/env node

/**
 * Direct Supabase Update Script
 *
 * Executes the reflection status update using proper SQL with JSONB manipulation
 */

const fs = require('fs');
const path = require('path');

const REFLECTION_ID = 'dc5c05e3-e712-40e0-8ab9-bfeaf4b56934';
const ASANA_PROJECT_URL = 'https://app.asana.com/0/1211617834659194';

// Asana task mappings
const ASANA_TASK_UPDATES = [
  {
    issue_id: 'issue_001',
    asana_task_id: '1211619302494708',
    asana_task_url: 'https://app.asana.com/1/REDACTED_ASANA_WORKSPACE/project/1211617834659194/task/1211619302494708'
  },
  {
    issue_id: 'issue_003',
    asana_task_id: '1211619300702115',
    asana_task_url: 'https://app.asana.com/1/REDACTED_ASANA_WORKSPACE/project/1211617834659194/task/1211619300702115'
  }
];

async function main() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const reviewedBy = process.env.USER_EMAIL || 'chris@revpal.io';
  const reviewedAt = new Date().toISOString();

  try {
    console.log('Preparing Supabase update for reflection:', REFLECTION_ID);
    console.log('');

    // Build the JSONB update operations for each issue
    const jsonbUpdates = ASANA_TASK_UPDATES.map(task => {
      return `
  -- Update ${task.issue_id}
  UPDATE reflections
  SET data = jsonb_set(
    jsonb_set(
      data,
      '{issues}',
      (
        SELECT jsonb_agg(
          CASE
            WHEN issue->>'id' = '${task.issue_id}'
            THEN issue || '{"asana_task_id": "${task.asana_task_id}", "asana_task_url": "${task.asana_task_url}"}'::jsonb
            ELSE issue
          END
        )
        FROM jsonb_array_elements(data->'issues') AS issue
      )
    ),
    '{issues}',
    COALESCE(
      (
        SELECT jsonb_agg(
          CASE
            WHEN issue->>'id' = '${task.issue_id}'
            THEN issue || '{"asana_task_id": "${task.asana_task_id}", "asana_task_url": "${task.asana_task_url}"}'::jsonb
            ELSE issue
          END
        )
        FROM jsonb_array_elements(data->'issues') AS issue
      ),
      data->'issues'
    )
  )
  WHERE id = '${REFLECTION_ID}';
      `.trim();
    }).join('\n\n');

    // Main update SQL
    const mainUpdate = `
-- Update reflection status and metadata
UPDATE reflections
SET
  reflection_status = 'under_review',
  reviewed_at = '${reviewedAt}',
  reviewed_by = '${reviewedBy}',
  asana_project_url = '${ASANA_PROJECT_URL}'
WHERE id = '${REFLECTION_ID}'
RETURNING id, reflection_status, reviewed_at, reviewed_by, asana_project_url;
    `.trim();

    // Combine all SQL
    const fullSql = `
-- Start transaction
BEGIN;

${jsonbUpdates}

${mainUpdate}

-- Commit transaction
COMMIT;
    `.trim();

    console.log('Generated SQL:');
    console.log('='.repeat(80));
    console.log(fullSql);
    console.log('='.repeat(80));
    console.log('');

    // Save SQL to file
    const sqlFile = path.join(__dirname, `../reports/update-reflection-${timestamp}.sql`);
    fs.writeFileSync(sqlFile, fullSql);
    console.log(`✅ SQL saved to: ${sqlFile}`);
    console.log('');

    // Create a simpler version that updates the entire data field
    const reflectionsFile = path.join(__dirname, '../reports/open-reflections-2025-10-12T16-02-34.json');
    const reflectionsData = JSON.parse(fs.readFileSync(reflectionsFile, 'utf8'));
    const reflection = reflectionsData.reflections.find(r => r.id === REFLECTION_ID);

    if (!reflection) {
      throw new Error(`Reflection ${REFLECTION_ID} not found`);
    }

    // Update the data object
    const updatedData = JSON.parse(JSON.stringify(reflection.data));
    let issuesUpdated = 0;

    if (updatedData.issues && Array.isArray(updatedData.issues)) {
      updatedData.issues = updatedData.issues.map(issue => {
        const task = ASANA_TASK_UPDATES.find(t => t.issue_id === issue.id);
        if (task) {
          issuesUpdated++;
          return {
            ...issue,
            asana_task_id: task.asana_task_id,
            asana_task_url: task.asana_task_url
          };
        }
        return issue;
      });
    }

    // Create simple update SQL that replaces the entire data field
    const dataJson = JSON.stringify(updatedData);
    const escapedDataJson = dataJson.replace(/'/g, "''");

    const simpleUpdateSql = `
UPDATE reflections
SET
  reflection_status = 'under_review',
  reviewed_at = '${reviewedAt}',
  reviewed_by = '${reviewedBy}',
  asana_project_url = '${ASANA_PROJECT_URL}',
  data = '${escapedDataJson}'::jsonb
WHERE id = '${REFLECTION_ID}'
RETURNING id, reflection_status, reviewed_at, reviewed_by, asana_project_url;
    `.trim();

    const simpleSqlFile = path.join(__dirname, `../reports/update-reflection-simple-${timestamp}.sql`);
    fs.writeFileSync(simpleSqlFile, simpleUpdateSql);
    console.log(`✅ Simple SQL saved to: ${simpleSqlFile}`);
    console.log('');

    // Create report
    const report = {
      reflections_updated: 1,
      issues_updated: issuesUpdated,
      updates: [
        {
          reflection_id: REFLECTION_ID,
          old_status: reflection.reflection_status,
          new_status: 'under_review',
          asana_project_url: ASANA_PROJECT_URL,
          issues_with_tasks: ASANA_TASK_UPDATES.map(task => ({
            issue_id: task.issue_id,
            asana_task_id: task.asana_task_id,
            asana_task_url: task.asana_task_url
          })),
          reviewed_at: reviewedAt,
          reviewed_by: reviewedBy
        }
      ],
      errors: [],
      sql_files: {
        complex: sqlFile,
        simple: simpleSqlFile
      }
    };

    const reportPath = path.join(__dirname, `../reports/reflection-updates-${timestamp}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`✅ Report saved to: ${reportPath}`);
    console.log('');
    console.log('Summary:');
    console.log(`  Reflections to update: ${report.reflections_updated}`);
    console.log(`  Issues to update: ${report.issues_updated}`);
    console.log(`  Old status: ${reflection.reflection_status}`);
    console.log(`  New status: under_review`);
    console.log(`  Asana project: ${ASANA_PROJECT_URL}`);
    console.log('');
    console.log('Next steps:');
    console.log('  1. Execute the simple SQL via Supabase MCP or SQL client');
    console.log('  2. Verify the update succeeded');
    console.log('  3. Generate the summary report');

    return report;

  } catch (error) {
    console.error('❌ Error:', error.message);

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
      console.log('✅ Update preparation completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Update preparation failed');
      process.exit(1);
    });
}

module.exports = { main };
