#!/usr/bin/env node

/**
 * Production Readiness Check
 *
 * Validates configuration, dependencies, and required files before production rollout.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { resolveProtectedAssetPath } = require('../../opspal-core/scripts/lib/protected-asset-runtime');

const args = process.argv.slice(2);
const options = {
  json: false,
  repoRoot: null,
  mode: 'production',
  skip: {
    jira: false,
    slack: false,
    supabase: false,
    sf: false
  }
};

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--json') options.json = true;
  if (arg === '--repo-root') options.repoRoot = args[++i];
  if (arg === '--mode') options.mode = (args[++i] || '').toLowerCase();
  if (arg === '--preprod') options.mode = 'preprod';
  if (arg === '--skip-jira') options.skip.jira = true;
  if (arg === '--skip-slack') options.skip.slack = true;
  if (arg === '--skip-supabase') options.skip.supabase = true;
  if (arg === '--skip-sf') options.skip.sf = true;
}

const pluginRoot = path.resolve(__dirname, '..');
const repoRoot = options.repoRoot ?
  path.resolve(options.repoRoot) :
  path.resolve(pluginRoot, '..', '..');

const results = [];
const summary = {
  pass: 0,
  warn: 0,
  fail: 0,
  manual: 0,
  blocked: 0
};

function record(status, label, detail) {
  results.push({ status, label, detail });
  if (summary[status] !== undefined) summary[status] += 1;
}

function checkFile(relativePath, label) {
  const fullPath = path.isAbsolute(relativePath) ? relativePath : path.resolve(pluginRoot, relativePath);
  if (fs.existsSync(fullPath)) {
    record('pass', label, relativePath);
  } else {
    record('fail', label, `Missing: ${relativePath}`);
  }
}

function checkDir(absolutePath, label) {
  if (fs.existsSync(absolutePath)) {
    record('pass', label, absolutePath);
  } else {
    record('warn', label, `Missing: ${absolutePath}`);
  }
}

function resolveEnvValue(name, aliases = []) {
  const primary = process.env[name];
  if (primary && primary.trim() !== '') {
    return { value: primary, source: name };
  }
  for (const alias of aliases) {
    const candidate = process.env[alias];
    if (candidate && candidate.trim() !== '') {
      return { value: candidate, source: alias };
    }
  }
  return { value: null, source: null };
}

function checkEnv(name, required, aliases = []) {
  const resolved = resolveEnvValue(name, aliases);
  if (resolved.value) {
    const detail = resolved.source === name ? 'set' : `set via ${resolved.source}`;
    record('pass', `Env ${name}`, detail);
  } else if (required) {
    if (options.mode === 'preprod') {
      record('blocked', `Env ${name}`, 'missing (preprod)');
    } else {
      record('fail', `Env ${name}`, 'missing');
    }
  } else {
    record('warn', `Env ${name}`, 'missing');
  }
}

function checkNodeVersion() {
  const [major] = process.versions.node.split('.').map(Number);
  if (major >= 18) {
    record('pass', 'Node.js version', process.versions.node);
  } else {
    record('fail', 'Node.js version', `Found ${process.versions.node}, require >= 18`);
  }
}

function checkSfCli() {
  if (options.skip.sf) {
    record('warn', 'Salesforce CLI', 'skipped');
    return;
  }
  try {
    const version = execSync('sf --version', { stdio: ['ignore', 'pipe', 'pipe'] })
      .toString()
      .trim();
    record('pass', 'Salesforce CLI', version || 'available');
  } catch (error) {
    const message = `${error.message || ''} ${error.stderr || ''}`.toLowerCase();
    if (message.includes('eacces') || message.includes('permission denied')) {
      try {
        const version = execSync('sf --version', {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env, HOME: repoRoot }
        }).toString().trim();
        record('pass', 'Salesforce CLI', version || 'available (HOME override)');
        return;
      } catch (retryError) {
        record('fail', 'Salesforce CLI', 'sf failed to run (permission)');
        return;
      }
    }
    record('fail', 'Salesforce CLI', 'sf not found in PATH');
  }
}

function checkRetentionEnv() {
  const days = process.env.AUDIT_RETENTION_DAYS;
  const years = process.env.AUDIT_RETENTION_YEARS;
  if ((days && days.trim() !== '') || (years && years.trim() !== '')) {
    record('pass', 'Audit retention policy', 'configured');
  } else if (options.mode === 'preprod') {
    record('blocked', 'Audit retention policy', 'missing (preprod)');
  } else {
    record('fail', 'Audit retention policy', 'set AUDIT_RETENTION_DAYS or AUDIT_RETENTION_YEARS');
  }
}

function checkManualChecklist() {
  const manualItems = [
    'Security team review completed',
    'Legal review of audit retention policies completed',
    'Monitoring tools configured (API usage, approvals, health checks)',
    'Support team briefed',
    'User communication sent',
    'Rollback tested in sandbox'
  ];

  manualItems.forEach(item => {
    record('manual', 'Manual confirmation required', item);
  });
}

checkNodeVersion();
checkSfCli();

checkFile('.claude-plugin/plugin.json', 'Plugin manifest');
checkFile('.claude-plugin/hooks.json', 'Hook registration');
checkFile('hooks/universal-agent-governance.sh', 'Governance hook');
checkFile('hooks/pre-deployment-comprehensive-validation.sh', 'Pre-deploy validation hook');
checkFile('hooks/pre-deploy-flow-validation.sh', 'Flow pre-deploy hook');
checkFile('scripts/lib/agent-action-audit-logger.js', 'Audit logger');
checkFile('scripts/lib/api-usage-monitor.js', 'API usage monitor');
checkFile('scripts/lib/approval-queue-monitor.js', 'Approval queue monitor');
checkFile('scripts/lib/human-in-the-loop-controller.js', 'Approval controller');
checkFile('scripts/install-claude-hooks.js', 'Hook installer');
checkFile(resolveProtectedAssetPath({
  pluginRoot,
  pluginName: 'opspal-salesforce',
  relativePath: 'config/agent-permission-matrix.json',
  allowPlaintextFallback: true
}) || 'config/agent-permission-matrix.json', 'Permission matrix');
checkFile('config/api-usage-config.json', 'API usage config');
checkFile('config/change-management-config.json', 'Change management config');

checkEnv('SF_ORG_ALIAS', true, ['SF_TARGET_ORG', 'SFDC_INSTANCE', 'ORG']);
checkEnv('SF_API_VERSION', true);
checkEnv('USER_EMAIL', true);
checkEnv('DEPLOYMENT_OPERATOR', true);
checkEnv('API_DAILY_LIMIT', true);
checkEnv('API_HOURLY_LIMIT', true);
checkEnv('APPROVAL_TIMEOUT_HOURS', true);
checkEnv('APPROVAL_SLACK_CHANNEL', true);
checkEnv('EMERGENCY_OVERRIDE_APPROVERS', true);
checkEnv('SLACK_WEBHOOK_URL', !options.skip.slack);
checkEnv('JIRA_URL', !options.skip.jira);
checkEnv('JIRA_EMAIL', !options.skip.jira);
checkEnv('JIRA_API_TOKEN', !options.skip.jira);
checkEnv('JIRA_PROJECT_KEY', !options.skip.jira);
checkEnv('SUPABASE_URL', !options.skip.supabase);
checkEnv('SUPABASE_SERVICE_ROLE_KEY', !options.skip.supabase);
checkRetentionEnv();

const auditLogPath = process.env.AUDIT_LOG_PATH ?
  (path.isAbsolute(process.env.AUDIT_LOG_PATH) ?
    process.env.AUDIT_LOG_PATH :
    path.resolve(repoRoot, process.env.AUDIT_LOG_PATH)) :
  path.join(repoRoot, '.claude', 'logs', 'agent-governance');

checkDir(auditLogPath, 'Audit log directory');
checkDir(path.join(repoRoot, '.claude', 'logs', 'api-usage'), 'API usage log directory');
checkDir(path.join(repoRoot, '.claude', 'logs', 'approvals'), 'Approval log directory');

checkManualChecklist();

const output = { summary, results };

if (options.json) {
  console.log(JSON.stringify(output, null, 2));
} else {
  console.log('Production Readiness Check');
  console.log('='.repeat(30));
  results.forEach(result => {
    const label = `${result.status.toUpperCase()}: ${result.label}`;
    console.log(`${label} - ${result.detail}`);
  });
  console.log('');
  console.log(`Summary: ${summary.pass} pass, ${summary.warn} warn, ${summary.fail} fail, ${summary.manual} manual, ${summary.blocked} blocked`);
}

process.exit(summary.fail > 0 ? 1 : 0);
