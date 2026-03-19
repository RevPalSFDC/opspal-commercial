'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_MARKETPLACE_NAME = 'opspal-commercial';
const DEFAULT_MARKETPLACE_REPOSITORY_SLUG = 'RevPalSFDC/opspal-commercial';

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return null;
  }
}

function getClaudeRoots() {
  const roots = [path.join(os.homedir(), '.claude')];

  for (const envVar of ['CLAUDE_HOME', 'CLAUDE_CONFIG_DIR']) {
    const value = process.env[envVar];
    if (value && value.trim()) {
      roots.push(path.resolve(value.trim()));
    }
  }

  return [...new Set(roots.map((root) => path.resolve(root)))];
}

function findMarketplaceManifest(startDir) {
  if (!startDir) {
    return null;
  }

  let currentDir = path.resolve(startDir);
  while (true) {
    const manifestPath = path.join(currentDir, '.claude-plugin', 'marketplace.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = readJson(manifestPath);
      if (manifest) {
        return manifest;
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }
    currentDir = parentDir;
  }
}

function listMarketplaceNames(options = {}) {
  const pluginName = options.pluginName || 'opspal-core';
  const names = [];
  const push = (name) => {
    if (typeof name !== 'string') {
      return;
    }
    const trimmed = name.trim();
    if (!trimmed || names.includes(trimmed)) {
      return;
    }
    names.push(trimmed);
  };

  push(process.env.OPSPAL_MARKETPLACE_NAME);

  for (const startDir of [options.projectDir, options.scriptDir, process.env.CLAUDE_PLUGIN_ROOT]) {
    const manifest = findMarketplaceManifest(startDir);
    if (manifest?.name) {
      push(manifest.name);
    }
  }

  for (const claudeRoot of getClaudeRoots()) {
    const marketplacesRoot = path.join(claudeRoot, 'plugins', 'marketplaces');
    if (fs.existsSync(marketplacesRoot)) {
      for (const entry of fs.readdirSync(marketplacesRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) {
          continue;
        }

        const manifest = readJson(path.join(marketplacesRoot, entry.name, '.claude-plugin', 'marketplace.json'));
        if (manifest?.name) {
          push(manifest.name);
          continue;
        }

        if (fs.existsSync(path.join(marketplacesRoot, entry.name, 'plugins', pluginName))) {
          push(entry.name);
        }
      }
    }

    const cacheRoot = path.join(claudeRoot, 'plugins', 'cache');
    if (!fs.existsSync(cacheRoot)) {
      continue;
    }

    for (const entry of fs.readdirSync(cacheRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      if (fs.existsSync(path.join(cacheRoot, entry.name, pluginName))) {
        push(entry.name);
      }
    }
  }

  push(DEFAULT_MARKETPLACE_NAME);
  return names;
}

function resolveMarketplaceContext(options = {}) {
  const context = {
    name: listMarketplaceNames(options)[0] || DEFAULT_MARKETPLACE_NAME,
    repositorySlug: process.env.OPSPAL_MARKETPLACE_REPOSITORY_SLUG || DEFAULT_MARKETPLACE_REPOSITORY_SLUG
  };

  for (const startDir of [options.projectDir, options.scriptDir, process.env.CLAUDE_PLUGIN_ROOT]) {
    const manifest = findMarketplaceManifest(startDir);
    if (!manifest) {
      continue;
    }

    if (manifest.name) {
      context.name = manifest.name;
    }
    if (manifest.repository_slug) {
      context.repositorySlug = manifest.repository_slug;
    }
    break;
  }

  return context;
}

module.exports = {
  DEFAULT_MARKETPLACE_NAME,
  DEFAULT_MARKETPLACE_REPOSITORY_SLUG,
  getClaudeRoots,
  listMarketplaceNames,
  resolveMarketplaceContext
};
