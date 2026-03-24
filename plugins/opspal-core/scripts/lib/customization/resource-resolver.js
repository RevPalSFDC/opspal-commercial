#!/usr/bin/env node

/**
 * Resource Resolver
 *
 * Central resolution engine. Resolves the effective resource using
 * override priority: tenant (org) > site (user-global) > global (packaged default).
 *
 * All consuming code (StyleManager, PDFGenerator, TemplateRegistry, PptxGenerator)
 * calls this instead of building __dirname-relative paths.
 *
 * @version 1.0.0
 */

'use strict';

const fs = require('fs').promises;
const path = require('path');

class ResourceResolver {
  /**
   * @param {Object} options
   * @param {import('./resource-registry').ResourceRegistry} options.registry
   * @param {import('./custom-resource-store').CustomResourceStore} options.store
   * @param {string} [options.orgSlug] - Current org for tenant resolution
   */
  constructor(options = {}) {
    this.registry = options.registry;
    this.store = options.store;
    this.orgSlug = options.orgSlug || process.env.ORG_SLUG || null;
    this._cache = new Map();
  }

  /**
   * Resolve the effective resource by ID
   *
   * Resolution order:
   *   1. tenant (org-level) custom record (published only)
   *   2. site (user-global) custom record (published only)
   *   3. global (packaged default from ResourceRegistry)
   *
   * @param {string} resourceId
   * @param {Object} [options]
   * @param {boolean} [options.raw] - Return record only, skip content loading
   * @returns {Promise<{record: Object, content: string|Object|null, filePath: string|null}|null>}
   */
  async resolve(resourceId, options = {}) {
    // Check in-process cache
    if (!options.raw && this._cache.has(resourceId)) {
      return this._cache.get(resourceId);
    }

    let result = null;

    // 1. Tenant scope
    if (this.orgSlug && this.store) {
      const record = await this.store.getRecord(resourceId, 'tenant');
      if (record && record.status === 'published') {
        result = await this._loadResult(record, options);
      }
    }

    // 2. Site scope
    if (!result && this.store) {
      const record = await this.store.getRecord(resourceId, 'site');
      if (record && record.status === 'published') {
        result = await this._loadResult(record, options);
      }
    }

    // 3. Global scope (packaged default)
    if (!result && this.registry) {
      const record = await this.registry.get(resourceId);
      if (record) {
        result = await this._loadResult(record, options);
      }
    }

    if (result && !options.raw) {
      this._cache.set(resourceId, result);
    }

    return result;
  }

  /**
   * Resolve a template resource
   * @param {string} templateId - e.g. 'salesforce-audit'
   * @param {string} type - 'pdf-cover'|'web-viz'|'pptx'|'flow'
   * @returns {Promise<{record: Object, content: string|null, filePath: string|null}|null>}
   */
  async resolveTemplate(templateId, type) {
    const resourceId = `template:${type}:${templateId}`;
    return this.resolve(resourceId);
  }

  /**
   * Resolve a brand asset
   * @param {string} assetId - e.g. 'primary', 'icon'
   * @returns {Promise<{record: Object, filePath: string|null}|null>}
   */
  async resolveBrandAsset(assetId) {
    const resourceId = `brand:logo:${assetId}`;
    return this.resolve(resourceId);
  }

  /**
   * Resolve the active CSS theme content
   * @param {string} themeId - e.g. 'revpal-brand'
   * @returns {Promise<string|null>} CSS string or null
   */
  async resolveCSSTheme(themeId) {
    const resourceId = `brand:css-theme:${themeId}`;
    const result = await this.resolve(resourceId);
    if (!result) return null;

    if (result.content && typeof result.content === 'string') {
      return result.content;
    }
    if (result.filePath) {
      try {
        return await fs.readFile(result.filePath, 'utf8');
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * Resolve the active color palette
   * @returns {Promise<Object|null>} Color object or null
   */
  async resolveColorPalette() {
    const result = await this.resolve('brand:color-palette:default');
    if (!result) return null;
    return result.content || result.record?.content || null;
  }

  /**
   * Resolve a logo file path
   * @param {string} variant - 'main'|'primary'|'icon'|'favicon'|'export'
   * @returns {Promise<string|null>} Absolute file path or null
   */
  async resolveLogoPath(variant) {
    const normalizedVariant = variant === 'main' ? 'primary' : variant;
    const result = await this.resolveBrandAsset(normalizedVariant);
    if (!result) return null;
    return result.filePath || result.record?.storage_uri || null;
  }

  /**
   * Resolve the active font set
   * @returns {Promise<Object|null>} Font config or null
   */
  async resolveFontSet() {
    const result = await this.resolve('brand:font-set:default');
    if (!result) return null;
    return result.content || result.record?.content || null;
  }

  /**
   * Invalidate the in-process cache (call after store writes)
   * @param {string} [resourceId] - Specific ID, or all if omitted
   */
  invalidateCache(resourceId) {
    if (resourceId) {
      this._cache.delete(resourceId);
    } else {
      this._cache.clear();
    }
  }

  // ── Private ────────────────────────────────────────────────────────

  /**
   * Load content/filePath from a record
   */
  async _loadResult(record, options = {}) {
    if (options.raw) {
      return { record, content: null, filePath: null };
    }

    let content = record.content || null;
    let filePath = record.storage_uri || record._filePath || null;

    // If content is null and we have a file path, try loading it
    if (!content && filePath) {
      try {
        const ext = path.extname(filePath).toLowerCase();
        const textExtensions = ['.md', '.css', '.json', '.html', '.txt', '.xml', '.yaml', '.yml'];
        if (textExtensions.includes(ext)) {
          content = await fs.readFile(filePath, 'utf8');
          // Parse JSON content
          if (ext === '.json') {
            try { content = JSON.parse(content); } catch { /* keep as string */ }
          }
        }
      } catch {
        // File not accessible — return filePath only
      }
    }

    return { record, content, filePath };
  }
}

module.exports = { ResourceResolver };
