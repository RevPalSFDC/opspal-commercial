#!/usr/bin/env node
require('dotenv').config();
const asana = require('asana');

const WORKSPACE_ID = 'REDACTED_WORKSPACE_ID';
const TASK_GIDS = [
  '1211517473355085',
  '1211517323835456',
  '1211517688229481',
  '1211517683705077',
  '1211517323626939'
];
const ASSIGNEE_EMAIL = 'team@gorevpal.com';

async function updateTaskAssignees() {
  console.log('🔄 Updating Task Assignees');
  console.log('=' .repeat(80));

  const client = asana.Client.create({
    defaultHeaders: { 'asana-enable': 'new_user_task_lists' }
  }).useAccessToken(process.env.ASANA_ACCESS_TOKEN);

  try {
    // Find user by email
    console.log(`🔍 Searching for user: ${ASSIGNEE_EMAIL}...`);
    const users = await client.users.findByWorkspace(WORKSPACE_ID);
    const user = users.data.find(u => u.email === ASSIGNEE_EMAIL);

    if (!user) {
      console.error(`❌ User not found: ${ASSIGNEE_EMAIL}`);
      console.log('Available users:');
      users.data.forEach(u => console.log(`   - ${u.name} (${u.email})`));
      process.exit(1);
    }

    console.log(`✅ Found user: ${user.name} (${user.gid})`);
    console.log('');

    // Update each task
    for (const taskGid of TASK_GIDS) {
      try {
        const task = await client.tasks.findById(taskGid);
        console.log(`📝 Updating task: ${task.name}...`);

        await client.tasks.update(taskGid, {
          assignee: user.gid
        });

        console.log(`✅ Assigned to ${user.name}`);
      } catch (error) {
        console.error(`❌ Failed to update task ${taskGid}:`, error.message);
      }
    }

    console.log('');
    console.log('=' .repeat(80));
    console.log('✅ All tasks updated successfully!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

updateTaskAssignees();
