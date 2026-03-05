'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RUNTIME_PLUGINS_ROOT = path.join(REPO_ROOT, 'plugins');
const DEVTOOLS_PLUGIN_ROOT = path.join(REPO_ROOT, 'dev-tools', 'developer-tools-plugin');
const LIFECYCLE_METADATA_FILENAME = 'lifecycle.json';

const SCRIPT_EXTENSIONS = new Set(['.js', '.cjs', '.mjs', '.sh', '.py', '.ts']);
const SCRIPT_EXCLUDED_DIRS = new Set([
  '__tests__',
  'node_modules',
  'coverage',
  '.git',
  '.cache',
  '.temp',
  'dist',
  'build'
]);

function isPluginDir(pluginPath) {
  return fs.existsSync(path.join(pluginPath, '.claude-plugin', 'plugin.json'));
}

function classifyPluginStatus(manifest = {}) {
  const explicit = collapseWhitespace(
    manifest.status || manifest.lifecycle_status || manifest.lifecycleStatus || ''
  ).toLowerCase();
  if (['active', 'experimental', 'deprecated'].includes(explicit)) {
    return explicit;
  }

  if (manifest.deprecated === true) return 'deprecated';
  if (manifest.experimental === true) return 'experimental';

  const text = (manifest.description || '').toUpperCase();
  if (text.includes('DEPRECATED')) return 'deprecated';
  if (text.includes('EXPERIMENTAL')) return 'experimental';
  return 'active';
}

function discoverRuntimePluginPaths() {
  const discovered = [];
  if (!fs.existsSync(RUNTIME_PLUGINS_ROOT)) return discovered;

  const entries = fs.readdirSync(RUNTIME_PLUGINS_ROOT, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const candidate = path.join(RUNTIME_PLUGINS_ROOT, entry.name);
    if (!isPluginDir(candidate)) continue;
    discovered.push(candidate);
  }

  return discovered.sort((a, b) => a.localeCompare(b));
}

function extractFrontmatterBlock(content) {
  if (!content.startsWith('---\n')) return null;
  const endIndex = content.indexOf('\n---\n', 4);
  if (endIndex === -1) return null;

  return {
    block: content.slice(4, endIndex),
    endOffset: endIndex + 5
  };
}

function stripQuotes(value) {
  const trimmed = (value || '').trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function collapseWhitespace(value) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function parseBlockScalar(lines, startIndex, folded) {
  const collected = [];
  let i = startIndex;

  while (i < lines.length) {
    const line = lines[i];
    const isTopLevelKey = /^[A-Za-z0-9_-]+:\s*/.test(line);

    if (isTopLevelKey) break;

    collected.push(line.replace(/^\s{2}/, ''));
    i += 1;
  }

  if (folded) {
    return {
      value: collapseWhitespace(collected.join(' ')),
      nextIndex: i
    };
  }

  return {
    value: collected.join('\n').trim(),
    nextIndex: i
  };
}

function parseArray(lines, startIndex) {
  const items = [];
  let i = startIndex;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    const isTopLevelKey = /^[A-Za-z0-9_-]+:\s*/.test(line);
    if (isTopLevelKey) break;

    const arrayMatch = line.match(/^\s*-\s+(.*)$/);
    if (!arrayMatch) break;

    items.push(stripQuotes(arrayMatch[1]));
    i += 1;
  }

  return { items, nextIndex: i };
}

function parseFrontmatter(content) {
  const frontmatter = extractFrontmatterBlock(content);
  if (!frontmatter) return null;

  const lines = frontmatter.block.split('\n');
  const parsed = {};

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) {
      i += 1;
      continue;
    }

    const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!keyMatch) {
      i += 1;
      continue;
    }

    const key = keyMatch[1].trim();
    const rawValue = keyMatch[2] || '';

    if (rawValue === '|' || rawValue === '>') {
      const block = parseBlockScalar(lines, i + 1, rawValue === '>');
      parsed[key] = block.value;
      i = block.nextIndex;
      continue;
    }

    if (!rawValue.trim()) {
      const array = parseArray(lines, i + 1);
      if (array.items.length > 0) {
        parsed[key] = array.items;
        i = array.nextIndex;
        continue;
      }

      parsed[key] = '';
      i += 1;
      continue;
    }

    parsed[key] = stripQuotes(rawValue);
    i += 1;
  }

  return parsed;
}

function stripFrontmatter(content) {
  const frontmatter = extractFrontmatterBlock(content);
  if (!frontmatter) return content;
  return content.slice(frontmatter.endOffset);
}

function firstParagraph(content) {
  const body = stripFrontmatter(content)
    .replace(/\r\n/g, '\n')
    .split('\n');

  const collected = [];
  for (const line of body) {
    const trimmed = line.trim();

    if (!trimmed) {
      if (collected.length > 0) break;
      continue;
    }

    if (trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('```')) {
      if (collected.length > 0) break;
      continue;
    }

    collected.push(trimmed);
  }

  return collapseWhitespace(collected.join(' '));
}

function normalizeDescription(frontmatterDescription, content) {
  if (Array.isArray(frontmatterDescription)) {
    const joined = collapseWhitespace(frontmatterDescription.join(' '));
    if (joined) return joined;
  }

  const fromFrontmatter = collapseWhitespace(frontmatterDescription || '');
  if (fromFrontmatter && fromFrontmatter !== '|' && fromFrontmatter !== '>') {
    return fromFrontmatter;
  }

  return firstParagraph(content);
}

function collectFilesRecursively(rootDir, shouldInclude, shouldSkipDir = () => false) {
  const results = [];

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (!shouldSkipDir(entry.name, fullPath)) {
          walk(fullPath);
        }
        continue;
      }

      if (entry.isFile() && shouldInclude(entry.name, fullPath)) {
        results.push(fullPath);
      }
    }
  }

  if (fs.existsSync(rootDir)) {
    walk(rootDir);
  }

  return results;
}

function readMarkdownEntry(filePath, baseDir, fallbackName) {
  let content = '';
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (_) {
    return null;
  }

  const frontmatter = parseFrontmatter(content);
  const name = collapseWhitespace((frontmatter?.name || fallbackName || path.basename(filePath, '.md')).trim());
  const description = normalizeDescription(frontmatter?.description, content);

  return {
    name,
    description,
    file: path.relative(baseDir, filePath),
    frontmatter,
    sourcePath: path.relative(REPO_ROOT, filePath)
  };
}

function scanAgentFiles(dir) {
  const markdownFiles = collectFilesRecursively(
    dir,
    (name) => name.endsWith('.md') && name !== '.gitkeep',
    (dirname) => dirname === 'shared'
  );

  const agents = [];
  for (const filePath of markdownFiles) {
    const entry = readMarkdownEntry(filePath, dir);
    if (!entry) continue;
    agents.push(entry);
  }

  return agents.sort((a, b) => a.name.localeCompare(b.name));
}

function scanCommandFiles(dir) {
  const markdownFiles = collectFilesRecursively(
    dir,
    (name) => name.endsWith('.md') && name !== '.gitkeep'
  );

  const commands = [];
  for (const filePath of markdownFiles) {
    const fallbackName = path
      .relative(dir, filePath)
      .replace(/\.md$/i, '')
      .split(path.sep)
      .join('/');
    const entry = readMarkdownEntry(filePath, dir, fallbackName);
    if (!entry) continue;

    commands.push(entry);
  }

  return commands.sort((a, b) => a.name.localeCompare(b.name));
}

function scanSkillFiles(dir) {
  const skills = [];

  if (!fs.existsSync(dir)) return skills;

  const skillEntryFiles = collectFilesRecursively(
    dir,
    (name, fullPath) => {
      if (name === 'SKILL.md') return true;

      // Support top-level skill markdown entries (e.g. monday-data-patterns.md)
      if (name.endsWith('.md') && path.dirname(fullPath) === dir) {
        return true;
      }

      return false;
    }
  );

  for (const filePath of skillEntryFiles) {
    const fallbackName = path.basename(filePath) === 'SKILL.md'
      ? path.basename(path.dirname(filePath))
      : path.basename(filePath, '.md');

    const entry = readMarkdownEntry(filePath, dir, fallbackName);
    if (!entry) continue;
    skills.push(entry);
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

function scanHookFiles(dir) {
  const hookFiles = collectFilesRecursively(
    dir,
    (name) => name.endsWith('.sh') && name !== '.gitkeep'
  );

  const hooks = [];
  for (const filePath of hookFiles) {
    let content = '';
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (_) {
      continue;
    }

    let description = '';
    for (const line of content.split('\n')) {
      if (!line.startsWith('#') || line.startsWith('#!')) continue;
      const comment = line.replace(/^#\s*/, '').trim();
      if (!comment) continue;
      if (/^[=\\-_*#]+$/.test(comment)) continue;
      description = comment;
      break;
    }

    hooks.push({
      name: path.basename(filePath, '.sh'),
      file: path.relative(dir, filePath),
      description,
      sourcePath: path.relative(REPO_ROOT, filePath)
    });
  }

  return hooks.sort((a, b) => a.name.localeCompare(b.name));
}

function scanScriptFiles(dir) {
  const scriptFiles = collectFilesRecursively(
    dir,
    (name) => SCRIPT_EXTENSIONS.has(path.extname(name)),
    (dirname) => SCRIPT_EXCLUDED_DIRS.has(dirname)
  );

  const scripts = [];
  for (const filePath of scriptFiles) {
    const rel = path.relative(dir, filePath);
    const ext = path.extname(rel);

    scripts.push({
      name: path.basename(rel, ext),
      file: rel,
      extension: ext,
      sourcePath: path.relative(REPO_ROOT, filePath)
    });
  }

  return scripts.sort((a, b) => a.file.localeCompare(b.file));
}

function scanPlugin(pluginPath) {
  const manifestPath = path.join(pluginPath, '.claude-plugin', 'plugin.json');
  if (!fs.existsSync(manifestPath)) return null;
  const lifecyclePath = path.join(pluginPath, '.claude-plugin', LIFECYCLE_METADATA_FILENAME);

  let manifest = {};
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    console.warn(`Warning: Could not parse manifest ${manifestPath}: ${error.message}`);
  }

  let lifecycle = {};
  if (fs.existsSync(lifecyclePath)) {
    try {
      lifecycle = JSON.parse(fs.readFileSync(lifecyclePath, 'utf8'));
    } catch (error) {
      console.warn(`Warning: Could not parse lifecycle metadata ${lifecyclePath}: ${error.message}`);
    }
  }

  const manifestStatus = collapseWhitespace(
    lifecycle.status ||
    lifecycle.lifecycle_status ||
    lifecycle.lifecycleStatus ||
    manifest.status ||
    manifest.lifecycle_status ||
    manifest.lifecycleStatus ||
    ''
  );
  const owner = collapseWhitespace(
    lifecycle.owner ||
    lifecycle.maintainer ||
    manifest.owner ||
    manifest.maintainer ||
    ''
  );
  const stability = collapseWhitespace(
    lifecycle.stability ||
    lifecycle.lifecycle ||
    manifest.stability ||
    manifest.lifecycle ||
    ''
  );
  const lastReviewedAt = collapseWhitespace(
    lifecycle.last_reviewed_at ||
    lifecycle.lastReviewedAt ||
    manifest.last_reviewed_at ||
    manifest.lastReviewedAt ||
    ''
  );
  const deprecationDate = collapseWhitespace(
    lifecycle.deprecation_date ||
    lifecycle.deprecationDate ||
    manifest.deprecation_date ||
    manifest.deprecationDate ||
    ''
  );
  const replacedBy = collapseWhitespace(
    lifecycle.replaced_by ||
    lifecycle.replacedBy ||
    manifest.replaced_by ||
    manifest.replacedBy ||
    ''
  );
  const classificationManifest = {
    ...manifest,
    status: manifestStatus || manifest.status,
    lifecycle_status: manifestStatus || manifest.lifecycle_status,
    lifecycleStatus: manifestStatus || manifest.lifecycleStatus
  };

  const pluginData = {
    name: manifest.name || path.basename(pluginPath),
    description: manifest.description || '',
    version: manifest.version || 'unknown',
    status: classifyPluginStatus(classificationManifest),
    manifestStatus: manifestStatus.toLowerCase(),
    owner,
    stability,
    lastReviewedAt,
    deprecationDate,
    replacedBy,
    path: path.relative(REPO_ROOT, pluginPath),
    manifestPath: path.relative(REPO_ROOT, manifestPath),
    lifecyclePath: fs.existsSync(lifecyclePath) ? path.relative(REPO_ROOT, lifecyclePath) : null,
    agents: [],
    commands: [],
    skills: [],
    hooks: [],
    scripts: []
  };

  const agentsDir = path.join(pluginPath, 'agents');
  const commandsDir = path.join(pluginPath, 'commands');
  const skillsDir = path.join(pluginPath, 'skills');
  const hooksDir = path.join(pluginPath, 'hooks');
  const scriptsDir = path.join(pluginPath, 'scripts');

  if (fs.existsSync(agentsDir)) {
    pluginData.agents = scanAgentFiles(agentsDir);
  }
  if (fs.existsSync(commandsDir)) {
    pluginData.commands = scanCommandFiles(commandsDir);
  }
  if (fs.existsSync(skillsDir)) {
    pluginData.skills = scanSkillFiles(skillsDir);
  }
  if (fs.existsSync(hooksDir)) {
    pluginData.hooks = scanHookFiles(hooksDir);
  }
  if (fs.existsSync(scriptsDir)) {
    pluginData.scripts = scanScriptFiles(scriptsDir);
  }

  return pluginData;
}

function isGitTracked(repoRelativePath) {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', repoRelativePath], {
      cwd: REPO_ROOT,
      stdio: 'ignore'
    });
    return true;
  } catch (_) {
    return false;
  }
}

function collectInventory() {
  const inventory = {
    plugins: [],
    totals: {
      plugins: 0,
      agents: 0,
      commands: 0,
      skills: 0,
      hooks: 0,
      scripts: 0
    }
  };

  const pluginPaths = discoverRuntimePluginPaths();
  for (const pluginPath of pluginPaths) {
    const pluginData = scanPlugin(pluginPath);
    if (!pluginData) continue;

    inventory.plugins.push(pluginData);
    inventory.totals.plugins += 1;
    inventory.totals.agents += pluginData.agents.length;
    inventory.totals.commands += pluginData.commands.length;
    inventory.totals.skills += pluginData.skills.length;
    inventory.totals.hooks += pluginData.hooks.length;
    inventory.totals.scripts += pluginData.scripts.length;
  }

  inventory.plugins.sort((a, b) => a.name.localeCompare(b.name));
  return inventory;
}

function collectDevtoolsInventory() {
  if (!isPluginDir(DEVTOOLS_PLUGIN_ROOT)) {
    return null;
  }

  // Keep generated docs deterministic across machines and CI by ignoring
  // local-only devtools plugins that are not tracked in git.
  const devtoolsManifest = path.join(DEVTOOLS_PLUGIN_ROOT, '.claude-plugin', 'plugin.json');
  const manifestRelativePath = path.relative(REPO_ROOT, devtoolsManifest);
  const allowUntracked = process.env.OPSPAL_INCLUDE_UNTRACKED_DEVTOOLS === '1';

  if (!allowUntracked && !isGitTracked(manifestRelativePath)) {
    return null;
  }

  return scanPlugin(DEVTOOLS_PLUGIN_ROOT);
}

function truncate(text, max = 100) {
  const value = collapseWhitespace(text || '');
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3)}...`;
}

function commandDisplayName(name) {
  if (!name) return '/unknown';
  return name.startsWith('/') ? name : `/${name}`;
}

function isRedirectOrDeprecatedDescription(description) {
  const text = (description || '').toUpperCase();
  return text.includes('REDIRECT') || text.includes('DEPRECATED');
}

module.exports = {
  REPO_ROOT,
  DEVTOOLS_PLUGIN_ROOT,
  collectInventory,
  collectDevtoolsInventory,
  commandDisplayName,
  truncate,
  parseFrontmatter,
  stripFrontmatter,
  collapseWhitespace,
  discoverRuntimePluginPaths,
  isPluginDir,
  isRedirectOrDeprecatedDescription
};
