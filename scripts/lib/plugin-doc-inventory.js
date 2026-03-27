'use strict';

const fs = require('fs');
const path = require('path');

const MARKETPLACE_NAME = 'opspal-commercial';
const MARKETPLACE_REPOSITORY = 'https://github.com/RevPalSFDC/opspal-commercial';
const MARKETPLACE_REPOSITORY_SLUG = 'RevPalSFDC/opspal-commercial';
const MARKETPLACE_OWNER = {
  name: 'RevPal Engineering',
  email: 'engineering@gorevpal.com'
};

function readJson(filePath, { optional = false } = {}) {
  if (!fs.existsSync(filePath)) {
    if (optional) {
      return null;
    }
    throw new Error(`Missing JSON file: ${filePath}`);
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid JSON in ${filePath}: ${error.message}`);
  }
}

function countFiles(dirPath, filter) {
  if (!fs.existsSync(dirPath)) {
    return 0;
  }

  return fs.readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && filter(entry.name))
    .length;
}

function countPluginFiles(pluginRoot) {
  return {
    agents: countFiles(path.join(pluginRoot, 'agents'), (name) => name.endsWith('.md')),
    commands: countFiles(path.join(pluginRoot, 'commands'), (name) => name.endsWith('.md')),
    hooks: countFiles(path.join(pluginRoot, 'hooks'), (name) => name.endsWith('.sh') || name.endsWith('.js')),
    skills: countFiles(path.join(pluginRoot, 'skills'), (name) => name.endsWith('.md'))
  };
}

function normalizeLifecycle(lifecycle = {}) {
  return {
    status: lifecycle.status || null,
    owner: lifecycle.owner || null,
    stability: lifecycle.stability || null,
    last_reviewed_at: lifecycle.last_reviewed_at || null,
    deprecation_date: lifecycle.deprecation_date || null,
    replaced_by: lifecycle.replaced_by || null
  };
}

function isPluginDirectory(pluginsRoot, entry) {
  if (!entry.isDirectory() || entry.name.startsWith('.') || !entry.name.startsWith('opspal-')) {
    return false;
  }

  return fs.existsSync(path.join(pluginsRoot, entry.name, '.claude-plugin', 'plugin.json'));
}

function collectPluginInventory(repoRoot = path.resolve(__dirname, '..', '..')) {
  const pluginsRoot = path.join(repoRoot, 'plugins');
  const generatedAt = new Date().toISOString();
  const generatedDate = generatedAt.slice(0, 10);

  const pluginDirs = fs.readdirSync(pluginsRoot, { withFileTypes: true })
    .filter((entry) => isPluginDirectory(pluginsRoot, entry))
    .map((entry) => entry.name)
    .sort();

  const plugins = pluginDirs.map((dirName) => {
    const pluginRoot = path.join(pluginsRoot, dirName);
    const manifest = readJson(path.join(pluginRoot, '.claude-plugin', 'plugin.json'));
    const lifecycle = normalizeLifecycle(
      readJson(path.join(pluginRoot, '.claude-plugin', 'lifecycle.json'), { optional: true }) || {}
    );
    const counts = countPluginFiles(pluginRoot);

    return {
      dirName,
      name: manifest.name || dirName,
      version: manifest.version || 'unknown',
      description: manifest.description || '',
      source: `./plugins/${dirName}`,
      counts,
      lifecycle,
      deprecated: lifecycle.status === 'deprecated'
    };
  });

  const totals = plugins.reduce((accumulator, plugin) => {
    accumulator.plugins += 1;
    accumulator.agents += plugin.counts.agents;
    accumulator.commands += plugin.counts.commands;
    accumulator.hooks += plugin.counts.hooks;
    accumulator.skills += plugin.counts.skills;
    return accumulator;
  }, { plugins: 0, agents: 0, commands: 0, hooks: 0, skills: 0 });

  return {
    repoRoot,
    generatedAt,
    generatedDate,
    marketplace: {
      name: MARKETPLACE_NAME,
      repository: MARKETPLACE_REPOSITORY,
      repositorySlug: MARKETPLACE_REPOSITORY_SLUG,
      owner: MARKETPLACE_OWNER
    },
    totals,
    plugins
  };
}

module.exports = {
  MARKETPLACE_NAME,
  MARKETPLACE_OWNER,
  MARKETPLACE_REPOSITORY,
  MARKETPLACE_REPOSITORY_SLUG,
  collectPluginInventory,
  isPluginDirectory
};
