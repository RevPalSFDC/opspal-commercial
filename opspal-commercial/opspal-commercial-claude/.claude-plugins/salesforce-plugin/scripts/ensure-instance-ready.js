#!/usr/bin/env node

/**
 * Instance bootstrapper for Salesforce orgs.
 *
 * Ensures an instance directory exists with minimal config:
 * - sfdx-project.json
 * - .instance-env
 * - optional instances/config.json entry
 *
 * Designed to work across different workspace layouts without hardcoded paths.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { discoverInstances } = require('./lib/multi-path-resolver');
const { ensureSfAuth } = require('./lib/sf-auth-sync');

const DEFAULT_API_VERSION = '60.0';

const ENV_INSTANCE_ROOTS = [
  'SFDC_INSTANCES_ROOT',
  'SFDC_INSTANCES_DIR',
  'INSTANCES_DIR'
];

const ENV_ALIAS_KEYS = [
  'SFDC_INSTANCE',
  'SF_TARGET_ORG',
  'ORG',
  'SALESFORCE_ORG_ALIAS'
];

function fileExists(targetPath) {
  try {
    return fs.existsSync(targetPath);
  } catch (error) {
    return false;
  }
}

function ensureDir(targetPath) {
  if (!fileExists(targetPath)) {
    fs.mkdirSync(targetPath, { recursive: true });
  }
}

function readJson(targetPath) {
  try {
    return JSON.parse(fs.readFileSync(targetPath, 'utf8'));
  } catch (error) {
    return null;
  }
}

function writeJson(targetPath, data) {
  fs.writeFileSync(targetPath, JSON.stringify(data, null, 2), 'utf8');
}

function parseEnvFile(content) {
  const values = {};
  const lines = content.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const idx = line.indexOf('=');
    if (idx === -1) {
      continue;
    }
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    value = value.replace(/^"|"$/g, '').replace(/^'|'$/g, '');
    if (key) {
      values[key] = value;
    }
  }
  return values;
}

function renderEnvLine(key, value) {
  const safeValue = String(value).replace(/"/g, '\\"');
  return `${key}="${safeValue}"`;
}

function updateEnvFile(envPath, updates, options = {}) {
  const result = {
    created: false,
    updatedKeys: [],
    skippedKeys: []
  };

  if (!fileExists(envPath)) {
    const lines = [
      '# Instance environment configuration',
      `# Generated: ${new Date().toISOString()}`
    ];

    Object.entries(updates).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        lines.push(renderEnvLine(key, value));
        result.updatedKeys.push(key);
      }
    });

    fs.writeFileSync(envPath, `${lines.join('\n')}\n`, 'utf8');
    result.created = true;
    return result;
  }

  const content = fs.readFileSync(envPath, 'utf8');
  const existing = parseEnvFile(content);
  const additions = [];

  Object.entries(updates).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') {
      return;
    }
    const hasKey = Object.prototype.hasOwnProperty.call(existing, key);
    if (!hasKey) {
      additions.push(renderEnvLine(key, value));
      result.updatedKeys.push(key);
      return;
    }
    if (existing[key] !== String(value)) {
      result.skippedKeys.push(key);
    }
  });

  if (additions.length > 0) {
    const banner = `# Added by ensure-instance-ready.js (${new Date().toISOString()})`;
    const updatedContent = `${content.trimEnd()}\n\n${banner}\n${additions.join('\n')}\n`;
    fs.writeFileSync(envPath, updatedContent, 'utf8');
  }

  return result;
}

function getPluginRoot() {
  return path.resolve(__dirname, '..');
}

function getRepoRoot() {
  return path.resolve(getPluginRoot(), '..', '..');
}

function getEnvInstanceRoot() {
  for (const key of ENV_INSTANCE_ROOTS) {
    if (process.env[key]) {
      return process.env[key];
    }
  }
  return null;
}

function deriveInstancesRoot(instanceDir, platform) {
  if (!instanceDir) {
    return null;
  }
  const parts = path.resolve(instanceDir).split(path.sep);
  const instancesIndex = parts.lastIndexOf('instances');
  if (instancesIndex === -1) {
    return path.dirname(instanceDir);
  }

  const nextSegment = parts[instancesIndex + 1];
  if (platform && nextSegment === platform) {
    return parts.slice(0, instancesIndex + 2).join(path.sep);
  }
  if (nextSegment === 'salesforce' || nextSegment === 'hubspot') {
    return parts.slice(0, instancesIndex + 2).join(path.sep);
  }
  return parts.slice(0, instancesIndex + 1).join(path.sep);
}

function resolveConfigPath(instancesRoot) {
  if (!instancesRoot) {
    return null;
  }
  const base = path.basename(instancesRoot);
  if (base === 'salesforce' || base === 'hubspot') {
    return path.join(path.dirname(instancesRoot), 'config.json');
  }
  return path.join(instancesRoot, 'config.json');
}

function normalizeEnvironment(envValue, alias) {
  const raw = envValue ? envValue.toLowerCase() : '';
  if (raw) {
    if (['prod', 'production', 'main'].includes(raw)) {
      return 'production';
    }
    if (['sandbox', 'sbx', 'uat', 'dev', 'test', 'staging', 'stage'].includes(raw)) {
      return raw === 'sbx' ? 'sandbox' : raw;
    }
    return raw;
  }

  const lowerAlias = (alias || '').toLowerCase();
  if (/(sandbox|sbx|uat|dev|test|staging|stage)/.test(lowerAlias)) {
    if (lowerAlias.includes('uat')) {
      return 'uat';
    }
    if (lowerAlias.includes('dev')) {
      return 'dev';
    }
    if (lowerAlias.includes('staging') || lowerAlias.includes('stage')) {
      return 'staging';
    }
    return 'sandbox';
  }
  return 'production';
}

function resolveLoginUrl(loginUrl, environment, alias) {
  if (loginUrl) {
    return loginUrl;
  }
  const normalizedEnv = normalizeEnvironment(environment, alias);
  if (['sandbox', 'uat', 'dev', 'test', 'staging'].includes(normalizedEnv)) {
    return 'https://test.salesforce.com';
  }
  return 'https://login.salesforce.com';
}

function hasSfCli() {
  try {
    execSync('sf --version', { stdio: 'ignore' });
    return true;
  } catch (error) {
    return false;
  }
}

function fetchOrgInfo(alias) {
  if (!alias || !hasSfCli()) {
    return null;
  }

  try {
    const output = execSync(`sf org display --target-org "${alias}" --json`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
    const parsed = JSON.parse(output);
    if (parsed.status !== 0 || !parsed.result) {
      return null;
    }
    return {
      alias: parsed.result.alias || alias,
      username: parsed.result.username || null,
      orgId: parsed.result.id || null,
      instanceUrl: parsed.result.instanceUrl || null,
      apiVersion: parsed.result.apiVersion || null
    };
  } catch (error) {
    return null;
  }
}

function resolveInstanceRootFromArgs(alias, options) {
  if (options.instanceDir) {
    const resolved = path.resolve(options.instanceDir);
    return {
      instanceDir: resolved,
      instancesRoot: deriveInstancesRoot(resolved, 'salesforce'),
      source: 'instance-dir'
    };
  }

  const discovered = discoverInstances({ platform: 'salesforce', fromDirectory: options.fromDirectory });
  const directMatch = discovered.find(entry => entry.orgAlias === alias);
  if (directMatch) {
    return {
      instanceDir: directMatch.absolutePath,
      instancesRoot: deriveInstancesRoot(directMatch.absolutePath, 'salesforce'),
      source: 'discovery'
    };
  }

  return null;
}

function resolveInstancesRoot(options) {
  if (options.instancesRoot) {
    return path.resolve(options.instancesRoot);
  }

  const envRoot = getEnvInstanceRoot();
  if (envRoot) {
    return path.resolve(envRoot);
  }

  if (options.instanceDir) {
    return deriveInstancesRoot(options.instanceDir, 'salesforce');
  }

  const discovered = discoverInstances({ platform: 'salesforce', fromDirectory: options.fromDirectory });
  if (discovered.length > 0) {
    const preferred = selectPreferredRoot(discovered.map(entry => entry.absolutePath));
    if (preferred) {
      return preferred;
    }
  }

  const repoRoot = getRepoRoot();
  const candidates = buildDefaultRootCandidates(repoRoot, options.fromDirectory);
  for (const candidate of candidates) {
    if (fileExists(candidate)) {
      return candidate;
    }
  }

  return candidates[0] || null;
}

function selectPreferredRoot(instanceDirs) {
  const scored = [];

  instanceDirs.forEach(dir => {
    const root = deriveInstancesRoot(dir, 'salesforce');
    if (!root) {
      return;
    }
    const normalized = root.replace(/\\/g, '/');
    let score = 0;
    if (normalized.endsWith('opspal-internal/SFDC/instances')) {
      score = 4;
    } else if (normalized.endsWith('SFDC/instances')) {
      score = 3;
    } else if (normalized.endsWith('instances/salesforce')) {
      score = 2;
    } else if (normalized.endsWith('instances')) {
      score = 1;
    }
    scored.push({ root, score });
  });

  if (scored.length === 0) {
    return null;
  }

  scored.sort((a, b) => b.score - a.score);
  return scored[0].root;
}

function buildDefaultRootCandidates(repoRoot, cwd) {
  const bases = new Set();
  bases.add(path.resolve(cwd));
  bases.add(path.resolve(cwd, '..'));
  bases.add(path.resolve(repoRoot));
  bases.add(path.resolve(repoRoot, '..'));

  const candidates = [];
  for (const base of bases) {
    candidates.push(
      path.join(base, 'opspal-internal', 'SFDC', 'instances'),
      path.join(base, 'SFDC', 'instances'),
      path.join(base, 'instances', 'salesforce'),
      path.join(base, 'instances')
    );
  }

  return [...new Set(candidates)];
}

function updateInstancesConfig(configPath, alias, instanceDir, orgInfo, options) {
  if (!configPath) {
    return { updated: false, created: false };
  }

  let config = readJson(configPath);
  let created = false;

  if (!config) {
    config = {
      currentInstance: null,
      instances: {}
    };
    created = true;
  }

  if (!config.instances || typeof config.instances !== 'object') {
    config.instances = {};
  }

  const entry = config.instances[alias] || {};
  entry.alias = alias;
  entry.directory = instanceDir;

  if (orgInfo) {
    if (orgInfo.username) {
      entry.username = orgInfo.username;
    }
    if (orgInfo.orgId) {
      entry.orgId = orgInfo.orgId;
    }
    if (orgInfo.instanceUrl) {
      entry.instanceUrl = orgInfo.instanceUrl;
    }
    if (orgInfo.apiVersion) {
      entry.apiVersion = orgInfo.apiVersion;
    }
  }

  if (options.loginUrl) {
    entry.loginUrl = options.loginUrl;
  }

  if (options.environment) {
    entry.environment = options.environment;
  }

  config.instances[alias] = entry;

  if (options.setCurrent) {
    config.currentInstance = alias;
  }

  ensureDir(path.dirname(configPath));
  writeJson(configPath, config);

  return { updated: true, created };
}

function ensureSfdxProject(instanceDir, loginUrl, options) {
  const sfdxPath = path.join(instanceDir, 'sfdx-project.json');
  if (!fileExists(sfdxPath)) {
    const config = {
      packageDirectories: [
        { path: 'force-app', default: true }
      ],
      name: options.projectName || path.basename(instanceDir),
      namespace: '',
      sfdcLoginUrl: loginUrl,
      sourceApiVersion: DEFAULT_API_VERSION
    };
    writeJson(sfdxPath, config);
    return { created: true, updated: false };
  }

  const config = readJson(sfdxPath) || {};
  let updated = false;

  if (!config.sfdcLoginUrl && loginUrl) {
    config.sfdcLoginUrl = loginUrl;
    updated = true;
  }
  if (!config.sourceApiVersion) {
    config.sourceApiVersion = DEFAULT_API_VERSION;
    updated = true;
  }

  if (updated) {
    writeJson(sfdxPath, config);
  }

  return { created: false, updated };
}

function parseArgs(argv) {
  const options = {
    alias: null,
    instanceDir: null,
    instancesRoot: null,
    environment: null,
    loginUrl: null,
    create: false,
    writeConfig: true,
    setCurrent: false,
    printDir: false,
    printRoot: false,
    discover: false,
    json: false,
    verbose: false,
    projectName: null,
    fromDirectory: process.cwd(),
    help: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--org':
      case '--alias':
        options.alias = argv[i + 1];
        i += 1;
        break;
      case '--instance-dir':
        options.instanceDir = argv[i + 1];
        i += 1;
        break;
      case '--instances-root':
        options.instancesRoot = argv[i + 1];
        i += 1;
        break;
      case '--environment':
      case '--env':
        options.environment = argv[i + 1];
        i += 1;
        break;
      case '--login-url':
        options.loginUrl = argv[i + 1];
        i += 1;
        break;
      case '--create':
        options.create = true;
        break;
      case '--no-create':
        options.create = false;
        break;
      case '--no-write-config':
        options.writeConfig = false;
        break;
      case '--write-config':
        options.writeConfig = true;
        break;
      case '--set-current':
        options.setCurrent = true;
        break;
      case '--print-dir':
        options.printDir = true;
        break;
      case '--print-root':
        options.printRoot = true;
        break;
      case '--discover':
      case '--list':
        options.discover = true;
        break;
      case '--json':
        options.json = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--project-name':
        options.projectName = argv[i + 1];
        i += 1;
        break;
      case '--cwd':
        options.fromDirectory = argv[i + 1];
        i += 1;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        break;
    }
  }

  if (!options.alias) {
    for (const key of ENV_ALIAS_KEYS) {
      if (process.env[key]) {
        options.alias = process.env[key];
        break;
      }
    }
  }

  return options;
}

function showHelp() {
  console.log(`
Usage: node scripts/ensure-instance-ready.js --org <alias> [options]

Options:
  --instance-dir <path>     Explicit instance directory
  --instances-root <path>   Base instances directory (parent of alias folder)
  --environment <name>      Environment hint (production, sandbox, uat, dev)
  --login-url <url>         Login URL for sfdx-project.json
  --create                  Create instance directory if missing
  --no-create               Do not create if missing (default)
  --set-current             Update instances/config.json currentInstance
  --no-write-config         Skip instances/config.json updates
  --print-dir               Print resolved instance directory
  --print-root              Print resolved instances root
  --discover                List discovered instances
  --json                    Output JSON summary
  --verbose                 Verbose logging
`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    showHelp();
    return;
  }

  if (options.discover) {
    const instances = discoverInstances({ platform: 'salesforce', fromDirectory: options.fromDirectory });
    if (options.json) {
      console.log(JSON.stringify(instances, null, 2));
    } else {
      instances.forEach(instance => {
        console.log(`${instance.orgAlias}\t${instance.absolutePath}`);
      });
    }
    return;
  }

  if (options.printRoot) {
    const root = resolveInstancesRoot(options);
    if (root) {
      console.log(root);
      return;
    }
    process.exit(1);
  }

  if (!options.alias) {
    showHelp();
    process.exit(1);
  }

  const resolved = resolveInstanceRootFromArgs(options.alias, options);
  const instancesRoot = resolved ? resolved.instancesRoot : resolveInstancesRoot(options);

  let instanceDir = resolved ? resolved.instanceDir : null;
  if (!instanceDir && instancesRoot) {
    instanceDir = path.join(instancesRoot, options.alias);
  }

  if (!instanceDir) {
    if (options.printDir) {
      process.exit(1);
    }
    throw new Error('Unable to resolve instance directory.');
  }

  if (!fileExists(instanceDir)) {
    if (!options.create) {
      if (options.printDir) {
        process.exit(2);
      }
      throw new Error(`Instance not found: ${instanceDir}`);
    }
    ensureDir(instanceDir);
    ensureDir(path.join(instanceDir, 'force-app', 'main', 'default'));
  }

  const environment = normalizeEnvironment(options.environment, options.alias);
  const loginUrl = resolveLoginUrl(options.loginUrl, environment, options.alias);
  options.environment = environment;
  options.loginUrl = loginUrl;

  await ensureSfAuth({
    orgAlias: options.alias,
    instanceDir,
    requireAuth: false,
    verbose: options.verbose
  });

  const orgInfo = fetchOrgInfo(options.alias);
  const sfdxResult = ensureSfdxProject(instanceDir, loginUrl, options);

  const envUpdates = {
    INSTANCE_NAME: options.alias,
    SF_TARGET_ORG: options.alias,
    SFDX_ALIAS: options.alias,
    INSTANCE_TYPE: environment,
    LOGIN_URL: loginUrl,
    USERNAME: orgInfo ? orgInfo.username : null,
    ORG_ID: orgInfo ? orgInfo.orgId : null,
    INSTANCE_URL: orgInfo ? orgInfo.instanceUrl : null
  };
  const envResult = updateEnvFile(path.join(instanceDir, '.instance-env'), envUpdates);

  let configResult = { updated: false, created: false };
  if (options.writeConfig) {
    configResult = updateInstancesConfig(resolveConfigPath(instancesRoot), options.alias, instanceDir, orgInfo, options);
  }

  const summary = {
    alias: options.alias,
    instanceDir,
    instancesRoot,
    environment,
    loginUrl,
    authDetected: Boolean(orgInfo),
    createdInstance: !resolved && options.create,
    sfdxProject: sfdxResult,
    instanceEnv: envResult,
    config: configResult
  };

  if (options.printDir) {
    console.log(instanceDir);
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (options.verbose) {
    console.log(`Instance: ${options.alias}`);
    console.log(`Directory: ${instanceDir}`);
    console.log(`Instances root: ${instancesRoot || 'unknown'}`);
  }
}

main().catch(error => {
  if (error && error.message) {
    console.error(error.message);
  }
  process.exit(1);
});
