#!/usr/bin/env node
/**
 * Reflection Resolver
 *
 * Automatically resolves reflections when referenced in git commits.
 * Updates Supabase reflection status and linked Asana tasks.
 *
 * Usage:
 *   node reflection-resolver.js resolve <commit-hash>
 *   node reflection-resolver.js check <commit-message>
 *   node reflection-resolver.js status <reflection-id>
 *
 * Environment:
 *   SUPABASE_URL - Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY - Service role key for writes
 *   ASANA_ACCESS_TOKEN - Optional, for Asana updates
 */

const fs = require('fs');
const path = require('path');

// Load config
const CONFIG_PATH = path.join(__dirname, '../../config/feedback-loop-config.json');
let config = {};
try {
  config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
} catch (e) {
  config = { enabled: true, autoResolveOnCommit: true };
}

// Logging
const LOG_DIR = path.join(__dirname, '../../logs');
const LOG_FILE = path.join(LOG_DIR, 'feedback-loop.jsonl');

function log(level, message, data = {}) {
  if (!config.logging?.enabled) return;

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...data
  };

  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }

  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');

  if (process.env.VERBOSE || level === 'error') {
    console.log(`[${level.toUpperCase()}] ${message}`, data);
  }
}

// Extract reflection IDs from text
function extractReflectionIds(text) {
  const pattern = /REFL-([a-f0-9-]+)/gi;
  const matches = [];
  let match;

  while ((match = pattern.exec(text)) !== null) {
    matches.push(match[1]);
  }

  return [...new Set(matches)]; // Deduplicate
}

// Get Supabase client
async function getSupabaseClient() {
  // Try to use existing client
  const clientPath = path.join(__dirname, '../../../../.claude/scripts/lib/supabase-client.js');

  if (fs.existsSync(clientPath)) {
    const { getSupabaseClient } = require(clientPath);
    return getSupabaseClient('write');
  }

  // Fallback to direct initialization
  const { createClient } = require('@supabase/supabase-js');
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(url, key);
}

// Update reflection status
async function updateReflectionStatus(reflectionId, status, metadata = {}) {
  const client = await getSupabaseClient();

  const { data, error } = await client
    .from('reflections')
    .update({
      reflection_status: status,
      updated_at: new Date().toISOString(),
      resolution_metadata: metadata
    })
    .eq('id', reflectionId)
    .select();

  if (error) {
    log('error', `Failed to update reflection ${reflectionId}`, { error: error.message });
    throw error;
  }

  log('info', `Updated reflection ${reflectionId} to status: ${status}`, { reflectionId, status });
  return data?.[0];
}

// Get reflection details
async function getReflection(reflectionId) {
  const client = await getSupabaseClient();

  const { data, error } = await client
    .from('reflections')
    .select('*')
    .eq('id', reflectionId)
    .single();

  if (error) {
    log('error', `Failed to get reflection ${reflectionId}`, { error: error.message });
    return null;
  }

  return data;
}

// Update linked Asana task
async function updateAsanaTask(taskId, comment) {
  if (!config.asanaIntegration?.enabled) return null;
  if (!process.env.ASANA_ACCESS_TOKEN) {
    log('warn', 'ASANA_ACCESS_TOKEN not set, skipping Asana update');
    return null;
  }

  try {
    const response = await fetch(`https://app.asana.com/api/1.0/tasks/${taskId}/stories`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.ASANA_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        data: { text: comment }
      })
    });

    if (!response.ok) {
      throw new Error(`Asana API error: ${response.status}`);
    }

    log('info', `Updated Asana task ${taskId}`, { taskId });
    return await response.json();
  } catch (e) {
    log('error', `Failed to update Asana task ${taskId}`, { error: e.message });
    return null;
  }
}

// Resolve reflections from commit
async function resolveFromCommit(commitHash, commitMessage, branch = 'unknown') {
  if (!config.enabled || !config.autoResolveOnCommit) {
    log('info', 'Auto-resolve disabled in config');
    return { resolved: [], skipped: [], errors: [] };
  }

  const reflectionIds = extractReflectionIds(commitMessage);

  if (reflectionIds.length === 0) {
    log('info', 'No reflection IDs found in commit message');
    return { resolved: [], skipped: [], errors: [] };
  }

  if (reflectionIds.length > (config.validation?.maxReflectionsPerCommit || 10)) {
    log('warn', `Too many reflections in commit (${reflectionIds.length})`);
    return { resolved: [], skipped: reflectionIds, errors: ['Too many reflections'] };
  }

  const results = { resolved: [], skipped: [], errors: [] };

  for (const id of reflectionIds) {
    try {
      // Get current reflection
      const reflection = await getReflection(id);

      if (!reflection) {
        results.skipped.push({ id, reason: 'Reflection not found' });
        continue;
      }

      // Check if transition is allowed
      const allowedFrom = config.statusTransitions?.onCommit?.from || ['new', 'under_review', 'in_progress'];
      if (!allowedFrom.includes(reflection.reflection_status)) {
        results.skipped.push({ id, reason: `Status ${reflection.reflection_status} not in allowed transitions` });
        continue;
      }

      // Update reflection
      const newStatus = config.statusTransitions?.onCommit?.to || 'resolved';
      await updateReflectionStatus(id, newStatus, {
        resolvedBy: 'commit',
        commitHash,
        commitMessage: commitMessage.substring(0, 500),
        branch,
        resolvedAt: new Date().toISOString()
      });

      // Update Asana if linked
      if (reflection.asana_task_id && config.asanaIntegration?.updateOnResolve) {
        const comment = (config.asanaIntegration?.commentTemplate || 'Resolved via commit: {commitHash}')
          .replace('{commitHash}', commitHash)
          .replace('{commitMessage}', commitMessage.substring(0, 200))
          .replace('{branch}', branch);

        await updateAsanaTask(reflection.asana_task_id, comment);
      }

      results.resolved.push({ id, previousStatus: reflection.reflection_status });

    } catch (e) {
      results.errors.push({ id, error: e.message });
    }
  }

  log('info', 'Commit resolution complete', results);
  return results;
}

// CLI interface
async function main() {
  const [,, command, ...args] = process.argv;

  switch (command) {
    case 'resolve': {
      const commitHash = args[0];
      const commitMessage = args[1] || process.env.COMMIT_MESSAGE;
      const branch = args[2] || process.env.BRANCH || 'unknown';

      if (!commitHash) {
        console.error('Usage: reflection-resolver.js resolve <commit-hash> [commit-message] [branch]');
        process.exit(1);
      }

      const results = await resolveFromCommit(commitHash, commitMessage, branch);
      console.log(JSON.stringify(results, null, 2));
      break;
    }

    case 'check': {
      const text = args.join(' ') || process.env.COMMIT_MESSAGE;
      const ids = extractReflectionIds(text);
      console.log(JSON.stringify({ found: ids, count: ids.length }));
      break;
    }

    case 'status': {
      const id = args[0];
      if (!id) {
        console.error('Usage: reflection-resolver.js status <reflection-id>');
        process.exit(1);
      }

      const reflection = await getReflection(id);
      if (reflection) {
        console.log(JSON.stringify(reflection, null, 2));
      } else {
        console.error(`Reflection ${id} not found`);
        process.exit(1);
      }
      break;
    }

    default:
      console.log(`
Reflection Resolver - Auto-resolve reflections from commits

Commands:
  resolve <hash> [message] [branch]  - Resolve reflections in commit
  check <text>                       - Check text for reflection IDs
  status <id>                        - Get reflection status

Environment:
  SUPABASE_URL                 - Required for database access
  SUPABASE_SERVICE_ROLE_KEY    - Required for writes
  ASANA_ACCESS_TOKEN           - Optional for Asana updates
  VERBOSE=1                    - Enable verbose logging
`);
  }
}

// Exports for programmatic use
module.exports = {
  extractReflectionIds,
  resolveFromCommit,
  updateReflectionStatus,
  getReflection,
  updateAsanaTask
};

// Run CLI if executed directly
if (require.main === module) {
  main().catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
  });
}
