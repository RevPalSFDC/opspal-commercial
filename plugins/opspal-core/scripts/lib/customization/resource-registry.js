#!/usr/bin/env node

/**
 * Resource Registry
 *
 * Reads packaged defaults from the plugin directory and builds an
 * in-memory catalog of all core resources with stable IDs, versions,
 * and checksums. This registry is read-only — it never writes.
 *
 * @version 1.0.0
 */

'use strict';

const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const crypto = require('crypto');

class ResourceRegistry {
  /**
   * @param {Object} options
   * @param {string} [options.pluginRoot] - Root of the opspal-core plugin
   */
  constructor(options = {}) {
    this.pluginRoot = options.pluginRoot || path.resolve(__dirname, '../../..');
    this.resources = new Map();
    this.loaded = false;
    this._pluginVersion = null;
  }

  /**
   * Lazy-load all packaged defaults
   */
  async load() {
    if (this.loaded) return;

    this._pluginVersion = await this._readPluginVersion();
    await this._loadBrandAssets();
    await this._loadPdfCovers();
    await this._loadCssThemes();
    await this._loadWebVizTemplates();
    await this._loadPptxTemplates();

    this.loaded = true;
  }

  /**
   * Get a resource record by ID
   * @param {string} resourceId
   * @returns {Promise<Object|null>}
   */
  async get(resourceId) {
    await this.load();
    return this.resources.get(resourceId) || null;
  }

  /**
   * Check if a resource exists
   * @param {string} resourceId
   * @returns {Promise<boolean>}
   */
  async has(resourceId) {
    await this.load();
    return this.resources.has(resourceId);
  }

  /**
   * List all resources, optionally filtered by type
   * @param {string} [resourceType] - brand_asset|template
   * @returns {Promise<Array<Object>>}
   */
  async list(resourceType) {
    await this.load();
    const all = Array.from(this.resources.values());
    if (resourceType) {
      return all.filter(r => r.resource_type === resourceType);
    }
    return all;
  }

  /**
   * Compute current checksum of a resource's backing file
   * @param {string} resourceId
   * @returns {Promise<string|null>}
   */
  async computeChecksum(resourceId) {
    await this.load();
    const resource = this.resources.get(resourceId);
    if (!resource) return null;

    if (resource._filePath) {
      return this._checksumFile(resource._filePath);
    }
    // Synthetic resource (e.g., color palette) — hash the content
    if (resource.content) {
      return this._checksumString(
        typeof resource.content === 'string' ? resource.content : JSON.stringify(resource.content)
      );
    }
    return null;
  }

  /**
   * Get the plugin version
   * @returns {string}
   */
  getPluginVersion() {
    return this._pluginVersion || 'unknown';
  }

  // ── Private loaders ───────────────────────────────────────────────

  async _readPluginVersion() {
    try {
      const manifestPath = path.join(this.pluginRoot, '.claude-plugin', 'plugin.json');
      const manifest = JSON.parse(await fsPromises.readFile(manifestPath, 'utf8'));
      return manifest.version || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  async _loadBrandAssets() {
    const registryPath = path.join(this.pluginRoot, 'config', 'master-template-registry.json');
    let registry;
    try {
      registry = JSON.parse(await fsPromises.readFile(registryPath, 'utf8'));
    } catch {
      return; // Registry not found — skip
    }

    const brandAssets = registry.brandAssets || {};

    // Color palette (synthetic — not file-backed)
    if (brandAssets.colors) {
      const content = JSON.stringify(brandAssets.colors);
      this._register({
        resource_id: 'brand:color-palette:default',
        resource_type: 'brand_asset',
        title: 'Default Color Palette',
        content: brandAssets.colors,
        checksum: this._checksumString(content),
        metadata: { subType: 'color-palette' }
      });
    }

    // Font set (synthetic)
    if (brandAssets.typography) {
      const content = JSON.stringify(brandAssets.typography);
      this._register({
        resource_id: 'brand:font-set:default',
        resource_type: 'brand_asset',
        title: 'Default Font Set',
        content: brandAssets.typography,
        checksum: this._checksumString(content),
        metadata: { subType: 'font-set' }
      });
    }

    // Logo files
    const logos = brandAssets.logos || {};
    const logoMap = {
      full: 'primary',
      icon: 'icon',
      favicon: 'favicon',
      export: 'export'
    };

    for (const [key, relPath] of Object.entries(logos)) {
      const variant = logoMap[key] || key;
      const filePath = path.join(this.pluginRoot, relPath);
      let checksum = null;
      try {
        checksum = await this._checksumFile(filePath);
      } catch {
        // File not found — register anyway with null checksum
      }

      this._register({
        resource_id: `brand:logo:${variant}`,
        resource_type: 'brand_asset',
        title: `Logo — ${variant}`,
        storage_uri: filePath,
        checksum,
        metadata: { subType: 'logo', variant },
        _filePath: filePath
      });
    }
  }

  async _loadPdfCovers() {
    const coversDir = path.join(this.pluginRoot, 'templates', 'pdf-covers');
    let files;
    try {
      files = await fsPromises.readdir(coversDir);
    } catch {
      return;
    }

    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const id = file.replace('.md', '');
      const filePath = path.join(coversDir, file);
      const checksum = await this._checksumFile(filePath);

      this._register({
        resource_id: `template:pdf-cover:${id}`,
        resource_type: 'template',
        title: `PDF Cover — ${id}`,
        storage_uri: filePath,
        checksum,
        metadata: { subType: 'pdf-cover', fileType: 'markdown' },
        _filePath: filePath
      });
    }
  }

  async _loadCssThemes() {
    // PDF themes
    const themesDir = path.join(this.pluginRoot, 'templates', 'pdf-styles', 'themes');
    await this._loadCssFromDir(themesDir, 'brand:css-theme');

    // Web-viz theme
    const webVizThemesDir = path.join(this.pluginRoot, 'templates', 'web-viz', 'themes');
    await this._loadCssFromDir(webVizThemesDir, 'brand:css-theme');
  }

  async _loadCssFromDir(dir, idPrefix) {
    let files;
    try {
      files = await fsPromises.readdir(dir);
    } catch {
      return;
    }

    for (const file of files) {
      if (!file.endsWith('.css')) continue;
      const themeId = file.replace('.css', '');
      const filePath = path.join(dir, file);
      const checksum = await this._checksumFile(filePath);

      // Don't double-register if already loaded (e.g., same name in different dirs)
      const resourceId = `${idPrefix}:${themeId}`;
      if (this.resources.has(resourceId)) continue;

      this._register({
        resource_id: resourceId,
        resource_type: 'template',
        title: `CSS Theme — ${themeId}`,
        storage_uri: filePath,
        checksum,
        metadata: { subType: 'css-theme', fileType: 'css' },
        _filePath: filePath
      });
    }
  }

  async _loadWebVizTemplates() {
    const configPath = path.join(this.pluginRoot, 'config', 'web-viz-templates.json');
    let config;
    try {
      config = JSON.parse(await fsPromises.readFile(configPath, 'utf8'));
    } catch {
      return;
    }

    const templatesDir = path.join(this.pluginRoot, 'templates', 'web-viz');

    for (const tmpl of config.templates || []) {
      const filePath = path.join(templatesDir, path.basename(tmpl.file));
      let checksum = null;
      try {
        checksum = await this._checksumFile(filePath);
      } catch {
        // File might not exist
      }

      this._register({
        resource_id: `template:web-viz:${tmpl.id}`,
        resource_type: 'template',
        title: tmpl.name || `Web Viz — ${tmpl.id}`,
        storage_uri: filePath,
        checksum,
        metadata: {
          subType: 'web-viz',
          fileType: 'json',
          category: tmpl.category,
          platforms: tmpl.platforms,
          keywords: tmpl.keywords
        },
        _filePath: filePath
      });
    }
  }

  async _loadPptxTemplates() {
    const manifestPath = path.join(this.pluginRoot, 'templates', 'powerpoint', 'manifest.json');
    let manifest;
    try {
      manifest = JSON.parse(await fsPromises.readFile(manifestPath, 'utf8'));
    } catch {
      return;
    }

    for (const tmpl of manifest.templates || []) {
      const filePath = path.join(this.pluginRoot, tmpl.path || tmpl.file);
      let checksum = null;
      try {
        checksum = await this._checksumFile(filePath);
      } catch {
        // File might not exist
      }

      const id = tmpl.id || path.basename(filePath, '.pptx');
      this._register({
        resource_id: `template:pptx:${id}`,
        resource_type: 'template',
        title: `PPTX Template — ${id}`,
        storage_uri: filePath,
        checksum,
        metadata: { subType: 'pptx', fileType: 'pptx' },
        _filePath: filePath
      });
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────

  _register(partial) {
    const record = {
      resource_id: partial.resource_id,
      resource_type: partial.resource_type,
      scope: 'global',
      source_type: 'core',
      source_resource_id: null,
      source_version: null,
      source_checksum: null,
      schema_version: '1',
      status: 'published',
      title: partial.title,
      content: partial.content || null,
      storage_uri: partial.storage_uri || null,
      metadata: partial.metadata || {},
      checksum: partial.checksum || null,
      created_by: 'opspal-core',
      updated_by: 'opspal-core',
      created_at: null,
      updated_at: null,
      // Internal — not persisted
      _filePath: partial._filePath || null,
      _pluginVersion: this._pluginVersion
    };

    this.resources.set(record.resource_id, record);
  }

  _checksumString(str) {
    return 'sha256:' + crypto.createHash('sha256').update(str, 'utf8').digest('hex');
  }

  async _checksumFile(filePath) {
    const content = await fsPromises.readFile(filePath);
    return 'sha256:' + crypto.createHash('sha256').update(content).digest('hex');
  }
}

module.exports = { ResourceRegistry };
