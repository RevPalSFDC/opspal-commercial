#!/usr/bin/env node

/**
 * Create Asana Tasks from Fix Plans
 * Programmatically creates tasks in Asana project from prepared descriptions
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const ASANA_ACCESS_TOKEN = process.env.ASANA_ACCESS_TOKEN;
const ASANA_WORKSPACE_ID = process.env.ASANA_WORKSPACE_ID || 'REDACTED_ASANA_WORKSPACE';
const ASANA_PROJECT_GID = process.env.ASANA_PROJECT_GID || '1211617834659194';

if (!ASANA_ACCESS_TOKEN) {
  console.error('❌ ASANA_ACCESS_TOKEN environment variable not set');
  process.exit(1);
}

function asanaRequest(path, method, data) {
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
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(responseData));
        } else {
          reject(new Error(`Asana API error: ${res.statusCode} - ${responseData}`));
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function createTask(title, description, dueDate, priority) {
  console.log(`\n📝 Creating task: ${title}`);

  const taskData = {
    data: {
      name: title,
      notes: description,
      projects: [ASANA_PROJECT_GID],
      workspace: ASANA_WORKSPACE_ID,
      due_on: dueDate
    }
  };

  try {
    const response = await asanaRequest('/tasks', 'POST', taskData);
    const taskGid = response.data.gid;
    const taskUrl = `https://app.asana.com/0/${ASANA_PROJECT_GID}/${taskGid}`;

    console.log(`✅ Task created: ${taskGid}`);
    console.log(`   URL: ${taskUrl}`);

    return {
      success: true,
      gid: taskGid,
      url: taskUrl,
      title: title
    };
  } catch (error) {
    console.error(`❌ Failed to create task: ${error.message}`);
    return {
      success: false,
      error: error.message,
      title: title
    };
  }
}

async function main() {
  console.log('🚀 Creating Asana tasks from reflection cohorts...\n');

  // Read task descriptions
  const task1Path = path.join(__dirname, 'reports', 'asana-task-1-description.md');
  const task2Path = path.join(__dirname, 'reports', 'asana-task-2-description.md');

  if (!fs.existsSync(task1Path) || !fs.existsSync(task2Path)) {
    console.error('❌ Task description files not found');
    console.error(`   Expected: ${task1Path}`);
    console.error(`   Expected: ${task2Path}`);
    process.exit(1);
  }

  const task1Description = fs.readFileSync(task1Path, 'utf8');
  const task2Description = fs.readFileSync(task2Path, 'utf8');

  // Calculate due date (14 days from now)
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 14);
  const dueDateStr = dueDate.toISOString().split('T')[0]; // YYYY-MM-DD

  const results = [];

  // Create Task #1: Data Quality Validation
  const task1 = await createTask(
    '[Reflection Cohort] Implement Cursor-Based Pagination & Data Validation',
    task1Description,
    dueDateStr,
    'high'
  );
  results.push(task1);

  // Wait 1 second between requests
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Create Task #2: Process Management
  const task2 = await createTask(
    '[Reflection Cohort] Add Process Lock Manager & Progress Monitoring',
    task2Description,
    dueDateStr,
    'high'
  );
  results.push(task2);

  // Generate summary report
  console.log('\n\n📊 Summary:');
  console.log(`   Tasks created: ${results.filter(r => r.success).length}/${results.length}`);
  console.log(`   Project: OpsPal - Reflection Improvements`);
  console.log(`   URL: https://app.asana.com/0/${ASANA_PROJECT_GID}`);

  // Save results
  const report = {
    created_at: new Date().toISOString(),
    project_gid: ASANA_PROJECT_GID,
    workspace_id: ASANA_WORKSPACE_ID,
    due_date: dueDateStr,
    tasks: results
  };

  const reportPath = path.join(__dirname, 'reports', `asana-tasks-created-${new Date().toISOString().split('T')[0]}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`\n📄 Report saved: ${reportPath}`);

  // Update reflection with task URLs
  if (results.every(r => r.success)) {
    console.log('\n✅ All tasks created successfully!');
    console.log('\n📌 Next step: Update reflection with Asana task URLs');
    console.log(`   Task #1: ${results[0].url}`);
    console.log(`   Task #2: ${results[1].url}`);
  } else {
    console.error('\n⚠️  Some tasks failed to create. Check errors above.');
    process.exit(1);
  }
}

main();
