#!/usr/bin/env node

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { logRoutingEvent } = require('./routing-metrics');

const DEFAULT_REGISTRY_PATH = path.join(__dirname, '..', '..', 'config', 'override-registry.json');
const DEFAULT_REASON_ENV_VAR = 'OVERRIDE_REASON';
const DEFAULT_APPROVER_ENV_VAR = 'OVERRIDE_APPROVER';

function readJsonFile(filePath, fallbackValue) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallbackValue;
  }
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempFile = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tempFile, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tempFile, filePath);
}

function sanitizeSessionId(sessionId) {
  return String(sessionId || 'default')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .slice(0, 120);
}

function firstWritableDir(candidates) {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    try {
      fs.mkdirSync(candidate, { recursive: true });
      fs.accessSync(candidate, fs.constants.W_OK);
      return candidate;
    } catch {
      continue;
    }
  }

  return null;
}

function resolveAuditDirectory(options = {}) {
  const homeDir = options.homeDir || process.env.HOME || os.homedir();
  const projectDir = options.projectDir || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const tempDir = options.tempDir || process.env.TMPDIR || os.tmpdir();

  return firstWritableDir([
    path.join(homeDir, '.claude', 'logs', 'override-audits'),
    path.join(projectDir, '.claude', 'logs', 'override-audits'),
    path.join(tempDir, '.claude', 'logs', 'override-audits')
  ]);
}

function getSessionAuditPath(options = {}) {
  const sessionId = sanitizeSessionId(options.sessionId || process.env.CLAUDE_SESSION_ID || 'default');
  const auditDir = resolveAuditDirectory(options);

  if (!auditDir) {
    return null;
  }

  return path.join(auditDir, `${sessionId}.json`);
}

function loadOverrideRegistry(options = {}) {
  const registryPath = options.registryPath || DEFAULT_REGISTRY_PATH;
  const registry = readJsonFile(registryPath, { version: '0.0.0', overrides: [] });

  if (!Array.isArray(registry.overrides)) {
    return {
      version: registry.version || '0.0.0',
      description: registry.description || '',
      overrides: []
    };
  }

  return registry;
}

function getOverrideValues(entry) {
  if (Array.isArray(entry.bypass_values) && entry.bypass_values.length > 0) {
    return entry.bypass_values.map((value) => String(value));
  }

  if (entry.bypass_value !== undefined) {
    return [String(entry.bypass_value)];
  }

  return null;
}

function matchesTruthyValue(value) {
  return /^(1|true|yes)$/i.test(String(value || ''));
}

function isOverrideActive(entry, env = process.env) {
  const currentValue = env[entry.env_var];

  if (currentValue === undefined || currentValue === '') {
    return false;
  }

  const bypassValues = getOverrideValues(entry);
  if (bypassValues) {
    return bypassValues.includes(String(currentValue));
  }

  if (entry.match === 'truthy' || entry.match === undefined) {
    return matchesTruthyValue(currentValue);
  }

  if (entry.match === 'set') {
    return true;
  }

  return false;
}

function getReasonValue(entry, env = process.env) {
  const reasonEnvVar = entry.reason_env_var || DEFAULT_REASON_ENV_VAR;
  const reason = env[reasonEnvVar];

  return typeof reason === 'string' && reason.trim() ? reason.trim() : '';
}

function getApproverValue(entry, env = process.env) {
  const approverEnvVar = entry.approver_env_var || DEFAULT_APPROVER_ENV_VAR;
  const approver = env[approverEnvVar];

  return typeof approver === 'string' && approver.trim() ? approver.trim() : '';
}

function buildWarningMessage(override) {
  return `${override.envVar}=${override.currentValue} is active without ${override.reasonEnvVar}`;
}

function summarizeOverrides(activeOverrides, warnings) {
  const byScope = {};
  const bySeverity = {};

  for (const override of activeOverrides) {
    byScope[override.scope] = (byScope[override.scope] || 0) + 1;
    bySeverity[override.severity] = (bySeverity[override.severity] || 0) + 1;
  }

  const activeCount = activeOverrides.length;
  const warningCount = warnings.length;
  const criticalOverrides = activeOverrides.filter((override) => override.severity === 'CRITICAL');
  const criticalSummary = criticalOverrides.length > 0
    ? criticalOverrides.map((override) => override.message).join('; ')
    : null;

  const logLine = activeCount > 0
    ? `${activeCount} active override(s); scopes=${Object.keys(byScope).sort().join(',') || 'none'}; warnings=${warningCount}`
    : '0 active override(s)';

  return {
    activeCount,
    warningCount,
    byScope,
    bySeverity,
    criticalSummary,
    logLine
  };
}

function getActiveOverrides(options = {}) {
  const env = options.env || process.env;
  const sessionId = sanitizeSessionId(options.sessionId || env.CLAUDE_SESSION_ID || 'default');
  const registry = options.registry || loadOverrideRegistry(options);
  const recordedAt = new Date().toISOString();

  const activeOverrides = registry.overrides
    .filter((entry) => isOverrideActive(entry, env))
    .map((entry) => {
      const currentValue = String(env[entry.env_var]);
      const reasonEnvVar = entry.reason_env_var || DEFAULT_REASON_ENV_VAR;
      const reason = getReasonValue(entry, env);
      const approver = getApproverValue(entry, env);
      const reasonPresent = reason.length > 0;

      return {
        id: entry.id,
        envVar: entry.env_var,
        currentValue,
        scope: entry.scope || 'global',
        severity: String(entry.severity || 'MEDIUM').toUpperCase(),
        auditRequired: entry.audit_required !== false,
        reasonRequired: entry.reason_required === true,
        reasonEnvVar,
        reason,
        reasonPresent,
        approver,
        description: entry.description || '',
        risk: entry.risk || '',
        message: `${entry.env_var}=${currentValue} active - ${entry.risk || entry.description || 'override active'}`
      };
    });

  const warnings = activeOverrides
    .filter((override) => override.reasonRequired && !override.reasonPresent)
    .map((override) => ({
      code: 'OVERRIDE_REASON_MISSING',
      severity: override.severity === 'CRITICAL' ? 'HIGH' : override.severity,
      overrideId: override.id,
      envVar: override.envVar,
      message: buildWarningMessage(override)
    }));

  return {
    timestamp: recordedAt,
    sessionId,
    registryVersion: registry.version || '0.0.0',
    activeOverrides,
    warnings,
    summary: summarizeOverrides(activeOverrides, warnings)
  };
}

function createOverrideMetricEvent(type, audit, override, warning) {
  return {
    type,
    source: 'override_registry',
    sessionId: audit.sessionId,
    override: {
      id: override.id,
      envVar: override.envVar,
      value: override.currentValue,
      scope: override.scope,
      severity: override.severity,
      auditRequired: override.auditRequired,
      reasonRequired: override.reasonRequired,
      reasonPresent: override.reasonPresent
    },
    warning: warning || undefined
  };
}

function logOverrideAuditEvents(audit) {
  const loggedEvents = [];

  for (const override of audit.activeOverrides) {
    loggedEvents.push(logRoutingEvent(createOverrideMetricEvent('override_audit', audit, override)));
  }

  for (const warning of audit.warnings) {
    const relatedOverride = audit.activeOverrides.find((override) => override.id === warning.overrideId);

    if (relatedOverride) {
      loggedEvents.push(logRoutingEvent(createOverrideMetricEvent('override_warning', audit, relatedOverride, warning)));
    }
  }

  return loggedEvents;
}

function recordSessionOverrideAudit(options = {}) {
  const audit = getActiveOverrides(options);
  const auditPath = getSessionAuditPath(options);

  if (!auditPath) {
    return {
      ...audit,
      auditFile: null,
      auditWriteError: 'No writable audit directory available',
      loggedEvents: []
    };
  }

  const storedAudit = {
    ...audit,
    auditFile: auditPath,
    updatedAt: new Date().toISOString()
  };

  try {
    writeJsonAtomic(auditPath, storedAudit);
  } catch (error) {
    storedAudit.auditWriteError = error.message;
  }

  try {
    storedAudit.loggedEvents = logOverrideAuditEvents(storedAudit);
  } catch (error) {
    storedAudit.metricsLogError = error.message;
    storedAudit.loggedEvents = [];
  }

  return storedAudit;
}

function readSessionOverrideAudit(options = {}) {
  const auditPath = getSessionAuditPath(options);

  if (!auditPath || !fs.existsSync(auditPath)) {
    return {
      timestamp: new Date().toISOString(),
      sessionId: sanitizeSessionId(options.sessionId || process.env.CLAUDE_SESSION_ID || 'default'),
      registryVersion: loadOverrideRegistry(options).version || '0.0.0',
      activeOverrides: [],
      warnings: [],
      summary: summarizeOverrides([], []),
      auditFile: auditPath
    };
  }

  const audit = readJsonFile(auditPath, null);
  if (!audit) {
    return {
      timestamp: new Date().toISOString(),
      sessionId: sanitizeSessionId(options.sessionId || process.env.CLAUDE_SESSION_ID || 'default'),
      registryVersion: loadOverrideRegistry(options).version || '0.0.0',
      activeOverrides: [],
      warnings: [],
      summary: summarizeOverrides([], []),
      auditFile: auditPath,
      auditReadError: 'Failed to parse session override audit'
    };
  }

  return audit;
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'inspect';
  const jsonOutput = args.includes('--json');

  let result;

  switch (command) {
    case 'inspect':
      result = getActiveOverrides();
      break;
    case 'record':
      result = recordSessionOverrideAudit();
      break;
    case 'read-session':
      result = readSessionOverrideAudit();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }

  if (jsonOutput) {
    printJson(result);
    return;
  }

  printJson(result);
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_REGISTRY_PATH,
  DEFAULT_REASON_ENV_VAR,
  loadOverrideRegistry,
  isOverrideActive,
  getActiveOverrides,
  getSessionAuditPath,
  recordSessionOverrideAudit,
  readSessionOverrideAudit,
  resolveAuditDirectory,
  sanitizeSessionId
};
