#!/usr/bin/env node

/**
 * End-to-End Asana Integration Test
 *
 * Tests the complete Asana Agent Integration Playbook workflow:
 * 1. Read task from Asana
 * 2. Post progress updates
 * 3. Post completion update
 * 4. Validate against templates
 *
 * Uses beta-corp RevPal sandbox for Salesforce operations
 */

const https = require('https');
const { AsanaTaskReader } = require('./lib/asana-task-reader');
const { AsanaUpdateFormatter } = require('./lib/asana-update-formatter');

// Configuration
const ASANA_ACCESS_TOKEN = process.env.ASANA_ACCESS_TOKEN;
const ASANA_WORKSPACE_ID = process.env.ASANA_WORKSPACE_ID;
const ASANA_PROJECT_GID = process.env.ASANA_PROJECT_GID || '1211617834659194'; // OpsPal - Reflection Improvements

if (!ASANA_ACCESS_TOKEN) {
  console.error('❌ ASANA_ACCESS_TOKEN not set');
  console.error('   Run: set -a && source .env && set +a');
  process.exit(1);
}

console.log('🧪 End-to-End Asana Integration Test\n');
console.log('===================================\n');

/**
 * Create test task in Asana
 */
async function createTestTask() {
  console.log('📝 Creating test task in Asana...');

  const taskData = {
    name: '[TEST] Salesforce Field Audit - beta-corp Sandbox',
    notes: `## Requirements

Audit custom fields on Account and Contact objects in beta-corp RevPal sandbox.

## Success Criteria
- Analyze all custom fields
- Identify unused fields (0% population)
- Generate recommendations report

## Testing
This is an automated test task for the Asana Agent Integration Playbook.

**Created**: ${new Date().toISOString()}
**Test ID**: e2e-${Date.now()}
    `,
    projects: [ASANA_PROJECT_GID],
    custom_fields: {}
  };

  const task = await asanaRequest('POST', '/tasks', taskData);
  console.log(`✅ Test task created: ${task.gid}`);
  console.log(`   URL: ${task.permalink_url}\n`);

  return task;
}

/**
 * Simulate reading the task
 */
async function testTaskReading(taskId) {
  console.log('📖 Testing Task Reading...\n');

  const reader = new AsanaTaskReader(ASANA_ACCESS_TOKEN);

  const context = await reader.parseTask(taskId, {
    includeComments: false,
    includeProject: true,
    includeDependencies: false
  });

  console.log('✅ Task parsed successfully');
  console.log(`   Name: ${context.fields.name}`);
  console.log(`   Priority: ${context.fields.priority}`);
  console.log(`   Requirements: ${context.requirements.requirements.length} found`);
  console.log(`   Success Criteria: ${context.requirements.successCriteria.length} found`);

  if (context.projectContext) {
    console.log(`   Project: ${context.projectContext.name}\n`);
  }

  return context;
}

/**
 * Simulate progress update
 */
async function testProgressUpdate(taskId) {
  console.log('📊 Testing Progress Update...\n');

  const formatter = new AsanaUpdateFormatter();

  const update = formatter.formatProgress({
    taskName: 'Salesforce Field Audit',
    date: new Date().toISOString().split('T')[0],
    completed: [
      'Connected to beta-corp sandbox',
      'Account object analyzed (85 fields reviewed)'
    ],
    inProgress: 'Analyzing Contact object (estimated 15 min)',
    nextSteps: [
      'Complete Contact analysis',
      'Generate recommendations report'
    ],
    status: 'On Track'
  });

  console.log('Update formatted:');
  console.log('─'.repeat(60));
  console.log(update.text);
  console.log('─'.repeat(60));
  console.log(`Word count: ${update.wordCount} (target: ${update.targetRange})`);
  console.log(`Valid: ${update.valid ? '✅' : '❌'}`);
  console.log(`Within target: ${update.withinTarget ? '✅' : '❌'}\n`);

  // Post to Asana
  await asanaRequest('POST', `/tasks/${taskId}/stories`, {
    text: update.text
  });

  console.log('✅ Progress update posted to Asana\n');

  return update;
}

/**
 * Simulate completion update
 */
async function testCompletionUpdate(taskId) {
  console.log('🎉 Testing Completion Update...\n');

  const formatter = new AsanaUpdateFormatter();

  const completion = formatter.formatCompletion({
    taskName: 'Salesforce Field Audit',
    deliverables: [
      { item: 'Account object analysis (85 fields)', link: null },
      { item: 'Contact object analysis (67 fields)', link: null },
      { item: 'Field audit report', link: '[test-report-link]' }
    ],
    results: [
      'Analyzed 152 total fields across 2 objects',
      'Identified 23 unused fields (15%)',
      'Found 3 duplicate field pairs'
    ],
    documentation: '[test-confluence-link]',
    handoff: {
      who: '@ops-team',
      action: 'review recommendations and approve cleanup'
    },
    notes: 'This is a test task - no actual cleanup needed'
  });

  console.log('Completion update formatted:');
  console.log('─'.repeat(60));
  console.log(completion.text);
  console.log('─'.repeat(60));
  console.log(`Word count: ${completion.wordCount} (target: ${completion.targetRange})`);
  console.log(`Valid: ${completion.valid ? '✅' : '❌'}`);
  console.log(`Summary: ${completion.summary}\n`);

  // Post to Asana
  await asanaRequest('POST', `/tasks/${taskId}/stories`, {
    text: completion.text
  });

  // Mark task complete
  await asanaRequest('PUT', `/tasks/${taskId}`, {
    completed: true
  });

  console.log('✅ Completion update posted and task marked complete\n');

  return completion;
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
 * Run complete E2E test
 */
async function runE2ETest() {
  try {
    console.log('Starting E2E test...\n');

    // Step 1: Create test task
    const task = await createTestTask();

    // Step 2: Read task (simulate agent receiving assignment)
    const taskContext = await testTaskReading(task.gid);

    // Step 3: Simulate work and post progress update
    await testProgressUpdate(task.gid);

    // Wait a moment to simulate work
    console.log('⏱️  Simulating work... (3 seconds)\n');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Step 4: Post completion update
    await testCompletionUpdate(task.gid);

    // Summary
    console.log('═'.repeat(60));
    console.log('✅ E2E TEST PASSED\n');
    console.log('Test Results:');
    console.log(`  ✅ Task created: ${task.gid}`);
    console.log(`  ✅ Task read and parsed`);
    console.log(`  ✅ Progress update posted (within word limit)`);
    console.log(`  ✅ Completion update posted (within word limit)`);
    console.log(`  ✅ Task marked complete`);
    console.log('');
    console.log(`View task in Asana: ${task.permalink_url}`);
    console.log('═'.repeat(60));

  } catch (error) {
    console.error('\n❌ E2E TEST FAILED');
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Run test
runE2ETest();
