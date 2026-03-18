#!/usr/bin/env node

/**
 * SF Auth Sync
 *
 * Ensures instance-local .sfdx auth files are present when HOME or
 * SF_CONFIG_DIR points at an instance folder. This avoids alias-not-found
 * errors when running sf commands from instance-scoped contexts.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_ENV_ALIASES = [
  'SFDC_INSTANCE',
  'SF_TARGET_ORG',
  'ORG',
  'SALESFORCE_ORG_ALIAS'
];

let cachedResult = null;

function getActualHomeDir() {
  try {
    return os.userInfo().homedir;
  } catch (error) {
    return os.homedir();
  }
}

function resolveGlobalSfdxDir() {
  const homeDir = getActualHomeDir();
  if (!homeDir) {
    return null;
  }
  return path.join(homeDir, '.sfdx');
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch (error) {
    return false;
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return null;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function loadAliasData(aliasPath) {
  const data = readJson(aliasPath);
  if (!data || typeof data !== 'object') {
    return {
      data: { orgs: {} },
      map: {},
      format: 'nested'
    };
  }

  if (data.orgs && typeof data.orgs === 'object') {
    return {
      data,
      map: data.orgs,
      format: 'nested'
    };
  }

  return {
    data,
    map: data,
    format: 'flat'
  };
}

function normalizeUrl(value) {
  if (!value) {
    return '';
  }
  return value.replace(/\/+$/, '').toLowerCase();
}

function parseInstanceEnv(filePath) {
  if (!fileExists(filePath)) {
    return {};
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const env = {};

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) {
      continue;
    }

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    value = value.replace(/^"|"$/g, '').replace(/^'|'$/g, '');

    if (key) {
      env[key] = value;
    }
  }

  return env;
}

function isSfdxProject(dir) {
  if (!dir) {
    return false;
  }
  return fileExists(path.join(dir, 'sfdx-project.json'));
}

function resolveInstanceRootFromCwd(startDir) {
  if (!startDir) {
    return null;
  }

  let current = path.resolve(startDir);

  while (true) {
    if (isSfdxProject(current) || fileExists(path.join(current, '.instance-env'))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return null;
}

function resolveInstanceRootFromConfig(instancesDir, orgAlias) {
  const configPath = path.join(instancesDir, 'config.json');
  const config = readJson(configPath);

  if (!config) {
    return null;
  }

  if (!orgAlias && config.currentInstance) {
    orgAlias = config.currentInstance;
  }

  if (orgAlias && config.instances && config.instances[orgAlias]) {
    const entry = config.instances[orgAlias];
    if (entry.directory) {
      const resolved = path.resolve(entry.directory);
      if (isSfdxProject(resolved)) {
        return resolved;
      }
    }
  }

  return null;
}

function resolveInstanceRoot({ instanceDir, cwd, orgAlias }) {
  const directCandidates = [
    instanceDir,
    process.env.INSTANCE_DIR,
    process.env.SFDC_INSTANCE_DIR
  ];

  for (const candidate of directCandidates) {
    if (!candidate) {
      continue;
    }
    const resolved = path.resolve(candidate);
    if (isSfdxProject(resolved)) {
      return resolved;
    }
  }

  if (process.env.HOME) {
    const homeDir = path.resolve(process.env.HOME);
    if (isSfdxProject(homeDir)) {
      return homeDir;
    }
  }

  const fromCwd = resolveInstanceRootFromCwd(cwd || process.cwd());
  if (fromCwd) {
    return fromCwd;
  }

  const envInstancesRoot = process.env.SFDC_INSTANCES_ROOT ||
    process.env.SFDC_INSTANCES_DIR ||
    process.env.INSTANCES_DIR;
  if (envInstancesRoot) {
    const resolvedRoot = path.resolve(envInstancesRoot);
    const configDir = ['salesforce', 'hubspot'].includes(path.basename(resolvedRoot))
      ? path.dirname(resolvedRoot)
      : resolvedRoot;
    const resolvedFromConfig = resolveInstanceRootFromConfig(configDir, orgAlias);
    if (resolvedFromConfig) {
      return resolvedFromConfig;
    }
    if (orgAlias) {
      const direct = path.join(resolvedRoot, orgAlias);
      if (isSfdxProject(direct)) {
        return direct;
      }
    }
  }

  if (!orgAlias) {
    return null;
  }

  const candidateRoots = new Set();
  if (process.env.PROJECT_ROOT) {
    candidateRoots.add(path.resolve(process.env.PROJECT_ROOT));
  }

  const pluginRoot = path.resolve(__dirname, '..', '..');
  const repoRoot = path.resolve(pluginRoot, '..', '..');

  candidateRoots.add(repoRoot);
  candidateRoots.add(path.resolve(repoRoot, '..', 'opspal-internal'));
  candidateRoots.add(path.resolve(repoRoot, '..'));

  for (const root of candidateRoots) {
    const sfdcRoots = [
      path.join(root, 'opspal-internal', 'SFDC'),
      path.join(root, 'SFDC')
    ];

    for (const sfdcRoot of sfdcRoots) {
      const instancesDir = path.join(sfdcRoot, 'instances');
      if (!fileExists(instancesDir)) {
        continue;
      }

      const resolvedFromConfig = resolveInstanceRootFromConfig(instancesDir, orgAlias);
      if (resolvedFromConfig) {
        return resolvedFromConfig;
      }

      const direct = path.join(instancesDir, orgAlias);
      if (isSfdxProject(direct)) {
        return direct;
      }
    }
  }

  return null;
}

function resolveAlias({ orgAlias, instanceDir }) {
  if (orgAlias) {
    return orgAlias;
  }

  for (const envVar of DEFAULT_ENV_ALIASES) {
    if (process.env[envVar]) {
      return process.env[envVar];
    }
  }

  if (instanceDir) {
    const envPath = path.join(instanceDir, '.instance-env');
    const instanceEnv = parseInstanceEnv(envPath);
    if (instanceEnv.SFDX_ALIAS) {
      return instanceEnv.SFDX_ALIAS;
    }
    if (instanceEnv.INSTANCE_NAME) {
      return instanceEnv.INSTANCE_NAME;
    }
  }

  if (instanceDir) {
    return path.basename(instanceDir);
  }

  return null;
}

function listAuthFiles(globalSfdxDir) {
  if (!globalSfdxDir || !fileExists(globalSfdxDir)) {
    return [];
  }

  const entries = fs.readdirSync(globalSfdxDir, { withFileTypes: true });
  return entries
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .filter(name => name.endsWith('.json'))
    .filter(name => name !== 'alias.json' && name !== 'key.json')
    .map(name => path.join(globalSfdxDir, name));
}

function findAuthMatch({ globalSfdxDir, alias, username, orgId, instanceUrl, verbose }) {
  const aliasPath = path.join(globalSfdxDir, 'alias.json');
  const aliasData = loadAliasData(aliasPath);
  const aliasMap = aliasData.map;

  if (!username && alias && aliasMap[alias]) {
    username = aliasMap[alias];
  }

  if (!username && alias && alias.includes('@')) {
    username = alias;
  }

  if (username) {
    const authPath = path.join(globalSfdxDir, `${username}.json`);
    if (fileExists(authPath)) {
      return { authPath, username, source: aliasMap[alias] ? 'alias' : 'username' };
    }
  }

  const normalizedInstanceUrl = normalizeUrl(instanceUrl);
  const candidates = [];

  for (const authPath of listAuthFiles(globalSfdxDir)) {
    const auth = readJson(authPath);
    if (!auth || typeof auth !== 'object') {
      continue;
    }

    if (orgId && auth.orgId && auth.orgId === orgId) {
      candidates.push({ authPath, auth, reason: 'orgId' });
      continue;
    }

    if (normalizedInstanceUrl && auth.instanceUrl) {
      const authUrl = normalizeUrl(auth.instanceUrl);
      if (authUrl === normalizedInstanceUrl) {
        candidates.push({ authPath, auth, reason: 'instanceUrl' });
      }
    }
  }

  if (candidates.length === 1) {
    const match = candidates[0];
    return {
      authPath: match.authPath,
      username: match.auth.username || username,
      source: match.reason
    };
  }

  if (candidates.length > 1) {
    const orgMatches = orgId
      ? candidates.filter(candidate => candidate.auth && candidate.auth.orgId === orgId)
      : [];

    if (orgMatches.length === 1) {
      const match = orgMatches[0];
      return {
        authPath: match.authPath,
        username: match.auth.username || username,
        source: 'orgId'
      };
    }

    const selected = candidates
      .map(candidate => {
        let mtime = 0;
        try {
          mtime = fs.statSync(candidate.authPath).mtimeMs;
        } catch (error) {
          mtime = 0;
        }
        return { ...candidate, mtime };
      })
      .sort((a, b) => b.mtime - a.mtime)[0];

    if (verbose) {
      console.warn('Multiple auth matches found; using the most recent.');
    }

    return {
      authPath: selected.authPath,
      username: selected.auth.username || username,
      source: 'recent'
    };
  }

  return null;
}

function ensureSfConfigDir(instanceDir, alias, result, verbose) {
  if (!instanceDir) {
    return;
  }

  const sfDir = path.join(instanceDir, '.sf');
  if (!fileExists(sfDir)) {
    fs.mkdirSync(sfDir, { recursive: true });
    result.createdSfDir = true;
  }

  const configPath = path.join(sfDir, 'config.json');
  const config = readJson(configPath) || {};

  if (alias && !config['target-org']) {
    config['target-org'] = alias;
    writeJson(configPath, config);
    result.updatedConfig = true;
  }

  if (!process.env.SF_CONFIG_DIR) {
    process.env.SF_CONFIG_DIR = sfDir;
  }
  if (!process.env.SFDX_CONFIG_DIR) {
    process.env.SFDX_CONFIG_DIR = sfDir;
  }

  if (verbose && result.updatedConfig) {
    console.log(`Set instance sf config target-org to ${alias}`);
  }
}

async function ensureSfAuth(options = {}) {
  const orgAlias = options.orgAlias || null;
  const cwd = options.cwd || process.cwd();
  const instanceDir = resolveInstanceRoot({
    instanceDir: options.instanceDir,
    cwd,
    orgAlias
  });
  const alias = resolveAlias({ orgAlias, instanceDir });

  if (cachedResult && cachedResult.alias === alias && cachedResult.instanceDir === instanceDir) {
    return cachedResult;
  }

  const result = {
    ok: false,
    alias,
    instanceDir,
    username: null,
    authCopied: false,
    keyCopied: false,
    aliasUpdated: false,
    createdSfDir: false,
    updatedConfig: false,
    warnings: []
  };

  if (!instanceDir) {
    result.warnings.push('No instance directory resolved.');
    cachedResult = result;
    return result;
  }

  if (!alias) {
    result.warnings.push('No org alias resolved.');
    cachedResult = result;
    return result;
  }

  try {
    const instanceEnv = parseInstanceEnv(path.join(instanceDir, '.instance-env'));
    let instanceUrl = instanceEnv.INSTANCE_URL || instanceEnv.INSTANCEURL || null;
    let orgId = instanceEnv.ORG_ID || instanceEnv.ORGID || null;

    const globalSfdxDir = resolveGlobalSfdxDir();
    if (!globalSfdxDir || !fileExists(globalSfdxDir)) {
      result.warnings.push('Global .sfdx directory not found.');
      cachedResult = result;
      return result;
    }

    const instanceSfdxDir = path.join(instanceDir, '.sfdx');
    if (!fileExists(instanceSfdxDir)) {
      fs.mkdirSync(instanceSfdxDir, { recursive: true });
    }

  const instanceAliasPath = path.join(instanceSfdxDir, 'alias.json');
  const instanceAliasData = loadAliasData(instanceAliasPath);
  const originalAliasFormat = instanceAliasData.format;
  if (instanceAliasData.format === 'flat') {
    instanceAliasData.data = { orgs: { ...instanceAliasData.map } };
    instanceAliasData.map = instanceAliasData.data.orgs;
    instanceAliasData.format = 'nested';
  }
  const instanceAliasMap = instanceAliasData.map;

    let username = instanceAliasMap[alias];
    if (!username && instanceEnv.USERNAME) {
      username = instanceEnv.USERNAME;
    }

    const parentConfig = readJson(path.join(path.dirname(instanceDir), 'config.json'));
    if (parentConfig && parentConfig.instances && parentConfig.instances[alias]) {
      const entry = parentConfig.instances[alias];
      if (!username && entry.username) {
        username = entry.username;
      }
      if (!orgId && entry.orgId) {
        orgId = entry.orgId;
      }
      if (!instanceUrl && entry.instanceUrl) {
        instanceUrl = entry.instanceUrl;
      }
    }

    const match = findAuthMatch({
      globalSfdxDir,
      alias,
      username,
      orgId,
      instanceUrl,
      verbose: options.verbose
    });

    if (!match) {
      result.warnings.push(`No auth match found for alias ${alias}.`);
      cachedResult = result;
      if (options.requireAuth) {
        throw new Error(`No SF auth found for ${alias}. Run: sf org login web --alias ${alias}`);
      }
      return result;
    }

    result.username = match.username || username;

    const authFileName = path.basename(match.authPath);
    const instanceAuthPath = path.join(instanceSfdxDir, authFileName);

    if (!fileExists(instanceAuthPath)) {
      fs.copyFileSync(match.authPath, instanceAuthPath);
      result.authCopied = true;
    }

    const globalKeyPath = path.join(globalSfdxDir, 'key.json');
    const instanceKeyPath = path.join(instanceSfdxDir, 'key.json');
    if (fileExists(globalKeyPath) && !fileExists(instanceKeyPath)) {
      fs.copyFileSync(globalKeyPath, instanceKeyPath);
      result.keyCopied = true;
    }

  let shouldWriteAliasFile = originalAliasFormat === 'flat';

  if (result.username && instanceAliasMap[alias] !== result.username) {
    instanceAliasMap[alias] = result.username;
    shouldWriteAliasFile = true;
    result.aliasUpdated = true;
  }

  if (shouldWriteAliasFile) {
    if (instanceAliasData.format === 'nested') {
      instanceAliasData.data.orgs = instanceAliasMap;
      writeJson(instanceAliasPath, instanceAliasData.data);
    } else {
      writeJson(instanceAliasPath, instanceAliasMap);
    }
    if (originalAliasFormat === 'flat' && !result.aliasUpdated) {
      result.aliasUpdated = true;
    }
  }

    ensureSfConfigDir(instanceDir, alias, result, options.verbose);

    result.ok = true;
    cachedResult = result;
    return result;
  } catch (error) {
    result.warnings.push(`SF auth sync failed: ${error.message}`);
    cachedResult = result;
    if (options.requireAuth) {
      throw error;
    }
    return result;
  }
}

module.exports = {
  ensureSfAuth,
  resolveInstanceRoot,
  resolveGlobalSfdxDir
};

if (require.main === module) {
  const args = process.argv.slice(2);
  const cli = {
    orgAlias: null,
    instanceDir: null,
    requireAuth: false,
    verbose: false,
    quiet: true
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case '--org':
      case '--alias':
      case '--target-org':
        cli.orgAlias = args[i + 1];
        i += 1;
        break;
      case '--instance-dir':
        cli.instanceDir = args[i + 1];
        i += 1;
        break;
      case '--require-auth':
        cli.requireAuth = true;
        break;
      case '--verbose':
        cli.verbose = true;
        cli.quiet = false;
        break;
      case '--quiet':
        cli.quiet = true;
        break;
      default:
        break;
    }
  }

  ensureSfAuth(cli)
    .then(result => {
      if (!cli.quiet) {
        console.log(JSON.stringify({
          ok: result.ok,
          alias: result.alias,
          instanceDir: result.instanceDir,
          username: result.username,
          authCopied: result.authCopied,
          keyCopied: result.keyCopied,
          aliasUpdated: result.aliasUpdated,
          warnings: result.warnings
        }, null, 2));
      }
      process.exit(result.ok ? 0 : (cli.requireAuth ? 1 : 0));
    })
    .catch(error => {
      if (!cli.quiet) {
        console.error(error.message);
      }
      process.exit(1);
    });
}
