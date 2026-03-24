#!/usr/bin/env node

/**
 * Resolver Factory
 *
 * Provides a lazily-initialized, cached ResourceResolver for use by
 * generation entry points (PDFGenerator, PptxGenerator, etc.).
 *
 * Usage:
 *   const { getResolver } = require('./customization/resolver-factory');
 *   const resolver = await getResolver();
 *   const generator = new PDFGenerator({ resolver });
 *
 * The resolver is created once and cached for the process lifetime.
 * It reads from ~/.claude/opspal/customizations/ and orgs/<org>/customizations/.
 *
 * @version 1.0.0
 */

'use strict';

const path = require('path');

let _cachedResolver = null;
let _initPromise = null;

/**
 * Get (or create) the singleton ResourceResolver for the current process.
 *
 * @param {Object} [options]
 * @param {string} [options.pluginRoot] - Override plugin root
 * @param {string} [options.orgSlug] - Override org slug
 * @returns {Promise<import('./resource-resolver').ResourceResolver|null>}
 */
async function getResolver(options = {}) {
  if (_cachedResolver) return _cachedResolver;

  // Prevent concurrent initialization
  if (_initPromise) return _initPromise;

  _initPromise = _initResolverSafe(options);
  try {
    _cachedResolver = await _initPromise;
    return _cachedResolver;
  } finally {
    _initPromise = null;
  }
}

/**
 * Initialize the resolver, returning null on any failure.
 * Generation must never fail because the customization layer is unavailable.
 */
async function _initResolverSafe(options) {
  try {
    const { createCustomizationLayer } = require('./index');

    const pluginRoot = options.pluginRoot
      || process.env.CLAUDE_PLUGIN_ROOT
      || path.resolve(__dirname, '../../..');

    const layer = await createCustomizationLayer({
      pluginRoot,
      orgSlug: options.orgSlug || process.env.ORG_SLUG || null
    });

    return layer.resolver;
  } catch {
    // Customization layer unavailable — return null so callers
    // proceed with packaged defaults (the resolver parameter is optional)
    return null;
  }
}

/**
 * Reset the cached resolver (used in testing)
 */
function resetResolver() {
  _cachedResolver = null;
  _initPromise = null;
}

module.exports = { getResolver, resetResolver };
