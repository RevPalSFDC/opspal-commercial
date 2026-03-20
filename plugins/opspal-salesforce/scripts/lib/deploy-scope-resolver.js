'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_DEPLOY_DIR = 'force-app/main/default';
const SOURCE_DIR_FLAGS = new Set(['--source-dir', '-d', '--sourcepath', '-p']);
const MANIFEST_FLAGS = new Set(['--manifest', '-x']);
const METADATA_FLAGS = new Set(['--metadata', '-m']);
const TARGET_ORG_FLAGS = new Set(['--target-org', '-o', '--targetusername', '-u']);
const IGNORED_DIRS = new Set([
  '.git',
  '.hg',
  '.svn',
  '.cache',
  '.claude',
  'backups',
  'coverage',
  'node_modules',
  'output',
  'reports',
  'temp'
]);

function tokenizeCommand(command) {
  const tokens = [];
  let current = '';
  let quote = null;
  let escaped = false;

  for (const char of String(command || '')) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\' && quote !== '\'') {
      escaped = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === '\'') {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (escaped) {
    current += '\\';
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

function splitCsv(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeSlashPath(value) {
  return String(value || '').split(path.sep).join('/');
}

function isEnvAssignment(token) {
  return /^[A-Za-z_][A-Za-z0-9_]*=.*/.test(token);
}

function parseDeploymentCommand(command) {
  const tokens = tokenizeCommand(command);
  const envAssignments = {};
  let index = 0;

  if (tokens[index] === 'env') {
    index += 1;
  }

  while (index < tokens.length && isEnvAssignment(tokens[index])) {
    const token = tokens[index];
    const equalsIndex = token.indexOf('=');
    envAssignments[token.slice(0, equalsIndex)] = token.slice(equalsIndex + 1);
    index += 1;
  }

  const sfIndex = tokens.indexOf('sf', index);
  if (sfIndex === -1) {
    return {
      command: String(command || ''),
      tokens,
      envAssignments,
      isDeployCommand: false,
      sourceDirs: [],
      manifests: [],
      metadata: [],
      targetOrg: ''
    };
  }

  const isDeployCommand =
    tokens[sfIndex + 1] === 'project' &&
    tokens[sfIndex + 2] === 'deploy';

  const parsed = {
    command: String(command || ''),
    tokens,
    envAssignments,
    isDeployCommand,
    sourceDirs: [],
    manifests: [],
    metadata: [],
    targetOrg: ''
  };

  if (!isDeployCommand) {
    return parsed;
  }

  for (let tokenIndex = sfIndex + 3; tokenIndex < tokens.length; tokenIndex += 1) {
    const token = tokens[tokenIndex];

    if (SOURCE_DIR_FLAGS.has(token)) {
      const next = tokens[tokenIndex + 1];
      if (next) {
        parsed.sourceDirs.push(...splitCsv(next));
        tokenIndex += 1;
      }
      continue;
    }

    const sourceMatch = token.match(/^(?:--source-dir|--sourcepath|-d|-p)=(.+)$/);
    if (sourceMatch) {
      parsed.sourceDirs.push(...splitCsv(sourceMatch[1]));
      continue;
    }

    if (MANIFEST_FLAGS.has(token)) {
      const next = tokens[tokenIndex + 1];
      if (next) {
        parsed.manifests.push(next);
        tokenIndex += 1;
      }
      continue;
    }

    const manifestMatch = token.match(/^(?:--manifest|-x)=(.+)$/);
    if (manifestMatch) {
      parsed.manifests.push(manifestMatch[1]);
      continue;
    }

    if (METADATA_FLAGS.has(token)) {
      const next = tokens[tokenIndex + 1];
      if (next) {
        parsed.metadata.push(...splitCsv(next));
        tokenIndex += 1;
      }
      continue;
    }

    const metadataMatch = token.match(/^(?:--metadata|-m)=(.+)$/);
    if (metadataMatch) {
      parsed.metadata.push(...splitCsv(metadataMatch[1]));
      continue;
    }

    if (TARGET_ORG_FLAGS.has(token)) {
      const next = tokens[tokenIndex + 1];
      if (next) {
        parsed.targetOrg = next;
        tokenIndex += 1;
      }
      continue;
    }

    const targetOrgMatch = token.match(/^(?:--target-org|-o|--targetusername|-u)=(.+)$/);
    if (targetOrgMatch) {
      parsed.targetOrg = targetOrgMatch[1];
    }
  }

  return parsed;
}

function resolvePath(cwd, candidate) {
  if (!candidate) {
    return '';
  }
  return path.resolve(cwd, candidate);
}

function walkFiles(rootPath, results = []) {
  if (!fs.existsSync(rootPath)) {
    return results;
  }

  const stat = fs.statSync(rootPath);
  if (stat.isFile()) {
    results.push(rootPath);
    return results;
  }

  if (!stat.isDirectory()) {
    return results;
  }

  const entries = fs.readdirSync(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) {
        continue;
      }
      walkFiles(path.join(rootPath, entry.name), results);
      continue;
    }

    if (entry.isFile()) {
      results.push(path.join(rootPath, entry.name));
    }
  }

  return results;
}

function parseManifest(manifestPath) {
  if (!manifestPath || !fs.existsSync(manifestPath)) {
    return [];
  }

  const content = fs.readFileSync(manifestPath, 'utf8');
  const blocks = [...content.matchAll(/<types>([\s\S]*?)<\/types>/g)];

  return blocks
    .map((match) => {
      const body = match[1];
      const typeNameMatch = body.match(/<name>([^<]+)<\/name>/);
      if (!typeNameMatch) {
        return null;
      }

      const members = [...body.matchAll(/<members>([^<]+)<\/members>/g)]
        .map((memberMatch) => memberMatch[1].trim())
        .filter(Boolean);

      return {
        typeName: typeNameMatch[1].trim(),
        members
      };
    })
    .filter(Boolean);
}

function buildProjectFileIndex(cwd) {
  return walkFiles(cwd, []).map((filePath) => ({
    absolutePath: filePath,
    relativePath: normalizeSlashPath(path.relative(cwd, filePath))
  }));
}

function findMatchesByPredicate(projectFiles, predicate) {
  return projectFiles
    .filter((entry) => predicate(entry.relativePath))
    .map((entry) => entry.absolutePath);
}

function resolveMetadataMember(cwd, projectFiles, typeName, member) {
  const normalizedType = String(typeName || '').trim().toLowerCase();
  const normalizedMember = String(member || '').trim();
  const wildcard = normalizedMember === '*';

  if (!normalizedType) {
    return [];
  }

  if (normalizedType === 'flow') {
    if (wildcard) {
      return findMatchesByPredicate(projectFiles, (relativePath) => relativePath.endsWith('.flow-meta.xml'));
    }
    return findMatchesByPredicate(
      projectFiles,
      (relativePath) => relativePath.endsWith(`/flows/${normalizedMember}.flow-meta.xml`)
    );
  }

  if (normalizedType === 'layout') {
    if (wildcard) {
      return findMatchesByPredicate(projectFiles, (relativePath) => relativePath.endsWith('.layout-meta.xml'));
    }
    return findMatchesByPredicate(
      projectFiles,
      (relativePath) => relativePath.endsWith(`/layouts/${normalizedMember}.layout-meta.xml`)
    );
  }

  if (normalizedType === 'report') {
    if (wildcard) {
      return findMatchesByPredicate(projectFiles, (relativePath) => relativePath.endsWith('.report-meta.xml'));
    }
    if (normalizedMember.includes('/')) {
      return findMatchesByPredicate(
        projectFiles,
        (relativePath) => relativePath.endsWith(`/reports/${normalizedMember}.report-meta.xml`)
      );
    }
    return findMatchesByPredicate(
      projectFiles,
      (relativePath) => relativePath.endsWith(`/${normalizedMember}.report-meta.xml`)
    );
  }

  if (normalizedType === 'dashboard') {
    if (wildcard) {
      return findMatchesByPredicate(projectFiles, (relativePath) => relativePath.endsWith('.dashboard-meta.xml'));
    }
    if (normalizedMember.includes('/')) {
      return findMatchesByPredicate(
        projectFiles,
        (relativePath) => relativePath.endsWith(`/dashboards/${normalizedMember}.dashboard-meta.xml`)
      );
    }
    return findMatchesByPredicate(
      projectFiles,
      (relativePath) => relativePath.endsWith(`/${normalizedMember}.dashboard-meta.xml`)
    );
  }

  if (normalizedType === 'quickaction' || normalizedType === 'globalquickaction') {
    if (wildcard) {
      return findMatchesByPredicate(projectFiles, (relativePath) => relativePath.endsWith('.quickAction-meta.xml'));
    }

    if (normalizedMember.includes('.')) {
      const [objectName, quickActionName] = normalizedMember.split('.', 2);
      return findMatchesByPredicate(
        projectFiles,
        (relativePath) =>
          relativePath.endsWith(`/objects/${objectName}/quickActions/${quickActionName}.quickAction-meta.xml`)
      );
    }

    return findMatchesByPredicate(
      projectFiles,
      (relativePath) => relativePath.endsWith(`/quickActions/${normalizedMember}.quickAction-meta.xml`)
    );
  }

  if (normalizedType === 'customfield') {
    if (wildcard) {
      return findMatchesByPredicate(projectFiles, (relativePath) => relativePath.endsWith('.field-meta.xml'));
    }
    if (normalizedMember.includes('.')) {
      const [objectName, fieldName] = normalizedMember.split('.', 2);
      return findMatchesByPredicate(
        projectFiles,
        (relativePath) => relativePath.endsWith(`/objects/${objectName}/fields/${fieldName}.field-meta.xml`)
      );
    }
  }

  if (normalizedType === 'recordtype') {
    if (wildcard) {
      return findMatchesByPredicate(projectFiles, (relativePath) => relativePath.endsWith('.recordType-meta.xml'));
    }
    if (normalizedMember.includes('.')) {
      const [objectName, recordTypeName] = normalizedMember.split('.', 2);
      return findMatchesByPredicate(
        projectFiles,
        (relativePath) => relativePath.endsWith(`/objects/${objectName}/recordTypes/${recordTypeName}.recordType-meta.xml`)
      );
    }
  }

  if (normalizedType === 'customobject') {
    if (wildcard) {
      const objectDirs = new Set();
      projectFiles.forEach((entry) => {
        const match = entry.relativePath.match(/(^|\/)objects\/([^/]+)\//);
        if (match) {
          objectDirs.add(path.resolve(cwd, `objects/${match[2]}`));
        }
      });
      return Array.from(objectDirs).filter((entryPath) => fs.existsSync(entryPath));
    }

    const objectDirMatches = findMatchesByPredicate(
      projectFiles,
      (relativePath) => relativePath.includes(`/objects/${normalizedMember}/`)
    );
    if (objectDirMatches.length > 0) {
      return [path.resolve(cwd, `objects/${normalizedMember}`)];
    }
  }

  if (normalizedType === 'permissionset') {
    if (wildcard) {
      return findMatchesByPredicate(projectFiles, (relativePath) => relativePath.endsWith('.permissionset-meta.xml'));
    }
    return findMatchesByPredicate(
      projectFiles,
      (relativePath) => relativePath.endsWith(`/permissionsets/${normalizedMember}.permissionset-meta.xml`)
    );
  }

  if (normalizedType === 'profile') {
    if (wildcard) {
      return findMatchesByPredicate(projectFiles, (relativePath) => relativePath.endsWith('.profile-meta.xml'));
    }
    return findMatchesByPredicate(
      projectFiles,
      (relativePath) => relativePath.endsWith(`/profiles/${normalizedMember}.profile-meta.xml`)
    );
  }

  if (normalizedType === 'flexipage') {
    if (wildcard) {
      return findMatchesByPredicate(projectFiles, (relativePath) => relativePath.endsWith('.flexipage-meta.xml'));
    }
    return findMatchesByPredicate(
      projectFiles,
      (relativePath) => relativePath.endsWith(`/flexipages/${normalizedMember}.flexipage-meta.xml`)
    );
  }

  if (normalizedType === 'apexclass') {
    if (wildcard) {
      return findMatchesByPredicate(projectFiles, (relativePath) => relativePath.endsWith('.cls'));
    }
    return findMatchesByPredicate(
      projectFiles,
      (relativePath) => relativePath.endsWith(`/classes/${normalizedMember}.cls`)
    );
  }

  if (normalizedType === 'apextrigger') {
    if (wildcard) {
      return findMatchesByPredicate(projectFiles, (relativePath) => relativePath.endsWith('.trigger'));
    }
    return findMatchesByPredicate(
      projectFiles,
      (relativePath) => relativePath.endsWith(`/triggers/${normalizedMember}.trigger`)
    );
  }

  if (normalizedType === 'custommetadata') {
    if (wildcard) {
      return findMatchesByPredicate(projectFiles, (relativePath) => relativePath.endsWith('.md-meta.xml'));
    }
    return findMatchesByPredicate(
      projectFiles,
      (relativePath) => relativePath.endsWith(`/customMetadata/${normalizedMember}.md-meta.xml`)
    );
  }

  return [];
}

function uniquePaths(paths) {
  return Array.from(new Set(paths.filter(Boolean)));
}

function collectSelectedPaths(parsedCommand, cwd) {
  const warnings = [];
  const selectedPaths = [];
  let usedDefaultScope = false;

  if (parsedCommand.sourceDirs.length > 0) {
    parsedCommand.sourceDirs.forEach((sourceDir) => {
      const resolvedPath = resolvePath(cwd, sourceDir);
      if (fs.existsSync(resolvedPath)) {
        selectedPaths.push(resolvedPath);
      } else {
        warnings.push(`Source path not found: ${sourceDir}`);
      }
    });

    return {
      selectedPaths: uniquePaths(selectedPaths),
      warnings,
      usedDefaultScope
    };
  }

  if (parsedCommand.manifests.length > 0 || parsedCommand.metadata.length > 0) {
    const projectFiles = buildProjectFileIndex(cwd);
    const metadataSelections = [];

    parsedCommand.manifests.forEach((manifestCandidate) => {
      const manifestPath = resolvePath(cwd, manifestCandidate);
      if (!fs.existsSync(manifestPath)) {
        warnings.push(`Manifest not found: ${manifestCandidate}`);
        return;
      }

      const types = parseManifest(manifestPath);
      types.forEach((typeEntry) => {
        typeEntry.members.forEach((member) => {
          const matches = resolveMetadataMember(cwd, projectFiles, typeEntry.typeName, member);
          if (matches.length === 0) {
            warnings.push(`No local files matched manifest entry ${typeEntry.typeName}:${member}`);
            return;
          }
          metadataSelections.push(...matches);
        });
      });
    });

    parsedCommand.metadata.forEach((metadataEntry) => {
      const [typeName, ...memberParts] = metadataEntry.split(':');
      const member = memberParts.join(':');
      const matches = resolveMetadataMember(cwd, projectFiles, typeName, member || '*');
      if (matches.length === 0) {
        warnings.push(`No local files matched metadata selector ${metadataEntry}`);
        return;
      }
      metadataSelections.push(...matches);
    });

    return {
      selectedPaths: uniquePaths(metadataSelections),
      warnings,
      usedDefaultScope
    };
  }

  const envDefault = parsedCommand.envAssignments.SF_DEPLOY_DIR || process.env.SF_DEPLOY_DIR || DEFAULT_DEPLOY_DIR;
  const defaultScopePath = resolvePath(cwd, envDefault);
  if (fs.existsSync(defaultScopePath)) {
    selectedPaths.push(defaultScopePath);
    usedDefaultScope = true;
  } else {
    warnings.push(`Default deploy scope not found: ${envDefault}`);
  }

  return {
    selectedPaths: uniquePaths(selectedPaths),
    warnings,
    usedDefaultScope
  };
}

function collectScopeFiles(selectedPaths) {
  const files = [];
  selectedPaths.forEach((selectedPath) => {
    walkFiles(selectedPath, files);
  });
  return uniquePaths(files);
}

function copySelectedPath(selectedPath, scopeRoot, cwd) {
  let relativePath = path.relative(cwd, selectedPath);
  if (!relativePath || relativePath.startsWith('..')) {
    relativePath = path.basename(selectedPath);
  }

  const destinationPath = path.join(scopeRoot, relativePath);
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.cpSync(selectedPath, destinationPath, { recursive: true });
}

function isDeployRootPath(selectedPath) {
  const normalized = normalizeSlashPath(selectedPath);
  return normalized.endsWith('/force-app') ||
    normalized.endsWith('/force-app/main/default') ||
    normalized.endsWith('/src');
}

function createScopeRoot(selectedPaths, cwd) {
  if (selectedPaths.length === 0) {
    return {
      scopeRoot: '',
      cleanupRequired: false
    };
  }

  if (selectedPaths.length === 1) {
    const selectedPath = selectedPaths[0];
    if (
      fs.existsSync(selectedPath) &&
      fs.statSync(selectedPath).isDirectory() &&
      isDeployRootPath(selectedPath)
    ) {
      return {
        scopeRoot: selectedPath,
        cleanupRequired: false
      };
    }
  }

  const scopeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opspal-deploy-scope-'));
  selectedPaths.forEach((selectedPath) => copySelectedPath(selectedPath, scopeRoot, cwd));
  return {
    scopeRoot,
    cleanupRequired: true
  };
}

function analyzeDeploymentScope(command, cwd = process.cwd(), options = {}) {
  const parsedCommand = parseDeploymentCommand(command);
  const resolvedCwd = path.resolve(cwd || process.cwd());
  const selected = collectSelectedPaths(parsedCommand, resolvedCwd);
  const allFiles = collectScopeFiles(selected.selectedPaths);
  const flowFiles = allFiles.filter((filePath) => filePath.endsWith('.flow-meta.xml'));
  const reportFiles = allFiles.filter((filePath) => filePath.endsWith('.report-meta.xml'));
  const dashboardFiles = allFiles.filter((filePath) => filePath.endsWith('.dashboard-meta.xml'));

  const result = {
    ...parsedCommand,
    cwd: resolvedCwd,
    targetOrg: parsedCommand.targetOrg || parsedCommand.envAssignments.SF_TARGET_ORG || process.env.SF_TARGET_ORG || '',
    selectedPaths: selected.selectedPaths,
    warnings: selected.warnings,
    usedDefaultScope: selected.usedDefaultScope,
    flowFiles,
    reportFiles,
    dashboardFiles,
    scopeRoot: '',
    cleanupRequired: false
  };

  if (options.stage === true) {
    const staged = createScopeRoot(selected.selectedPaths, resolvedCwd);
    result.scopeRoot = staged.scopeRoot;
    result.cleanupRequired = staged.cleanupRequired;
  }

  return result;
}

function parseCliArgs(argv) {
  const args = {
    mode: 'analyze',
    command: '',
    cwd: process.cwd(),
    stage: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === 'analyze' || token === 'stage') {
      args.mode = token;
      args.stage = token === 'stage';
      continue;
    }

    if (token === '--command' && argv[index + 1]) {
      args.command = argv[index + 1];
      index += 1;
      continue;
    }

    if (token.startsWith('--command=')) {
      args.command = token.slice('--command='.length);
      continue;
    }

    if (token === '--cwd' && argv[index + 1]) {
      args.cwd = argv[index + 1];
      index += 1;
      continue;
    }

    if (token.startsWith('--cwd=')) {
      args.cwd = token.slice('--cwd='.length);
      continue;
    }

    if (token === '--stage') {
      args.stage = true;
    }
  }

  return args;
}

if (require.main === module) {
  try {
    const cliArgs = parseCliArgs(process.argv.slice(2));
    const result = analyzeDeploymentScope(cliArgs.command, cliArgs.cwd, { stage: cliArgs.stage });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  analyzeDeploymentScope,
  parseDeploymentCommand,
  tokenizeCommand
};
