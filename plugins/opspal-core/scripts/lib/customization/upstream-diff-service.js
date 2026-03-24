#!/usr/bin/env node

/**
 * Upstream Diff Service
 *
 * Compares a custom resource to the current upstream default,
 * producing structured diff reports for review.
 *
 * @version 1.0.0
 */

'use strict';

const fs = require('fs').promises;

class UpstreamDiffService {
  /**
   * @param {Object} options
   * @param {import('./resource-registry').ResourceRegistry} options.registry
   */
  constructor(options = {}) {
    this.registry = options.registry;
  }

  /**
   * Generate a diff report between a custom resource and its upstream source.
   *
   * @param {Object} customRecord - The custom resource record
   * @returns {Promise<Object>} Diff report
   */
  async diff(customRecord) {
    if (!customRecord.source_resource_id) {
      return {
        resourceId: customRecord.resource_id,
        hasUpstream: false,
        hasChanges: false,
        message: 'No upstream source (original custom resource)'
      };
    }

    const upstreamRecord = await this.registry.get(customRecord.source_resource_id);
    if (!upstreamRecord) {
      return {
        resourceId: customRecord.resource_id,
        hasUpstream: false,
        hasChanges: true,
        message: 'Upstream source no longer exists'
      };
    }

    // Load upstream content
    const upstreamContent = await this._loadContent(upstreamRecord);
    const customContent = await this._loadContent(customRecord);

    if (upstreamContent === null || customContent === null) {
      return {
        resourceId: customRecord.resource_id,
        hasUpstream: true,
        hasChanges: customRecord.source_checksum !== upstreamRecord.checksum,
        upstreamVersion: upstreamRecord._pluginVersion,
        sourceVersion: customRecord.source_version,
        message: 'Cannot load content for comparison (binary resource or missing file)',
        diffType: 'checksum_only',
        upstreamChecksum: upstreamRecord.checksum,
        customSourceChecksum: customRecord.source_checksum
      };
    }

    const fileType = customRecord.metadata?.fileType || this._guessFileType(customRecord);

    let diffResult;
    if (fileType === 'css') {
      diffResult = this.diffCSS(customContent, upstreamContent);
    } else if (fileType === 'json') {
      const customObj = typeof customContent === 'string' ? JSON.parse(customContent) : customContent;
      const upstreamObj = typeof upstreamContent === 'string' ? JSON.parse(upstreamContent) : upstreamContent;
      diffResult = this.diffJSON(customObj, upstreamObj);
    } else {
      diffResult = this.diffText(
        typeof customContent === 'string' ? customContent : JSON.stringify(customContent, null, 2),
        typeof upstreamContent === 'string' ? upstreamContent : JSON.stringify(upstreamContent, null, 2)
      );
    }

    return {
      resourceId: customRecord.resource_id,
      hasUpstream: true,
      hasChanges: diffResult.hasChanges,
      upstreamVersion: upstreamRecord._pluginVersion,
      sourceVersion: customRecord.source_version,
      diffType: fileType,
      ...diffResult
    };
  }

  /**
   * Compare two CSS strings property-by-property
   * @param {string} customCss
   * @param {string} upstreamCss
   * @returns {Object}
   */
  diffCSS(customCss, upstreamCss) {
    const customProps = this._parseCSSProperties(customCss);
    const upstreamProps = this._parseCSSProperties(upstreamCss);

    const additions = [];
    const modifications = [];
    const deletions = [];

    for (const [key, value] of customProps) {
      if (!upstreamProps.has(key)) {
        additions.push({ property: key, value });
      } else if (upstreamProps.get(key) !== value) {
        modifications.push({ property: key, custom: value, upstream: upstreamProps.get(key) });
      }
    }

    for (const [key, value] of upstreamProps) {
      if (!customProps.has(key)) {
        deletions.push({ property: key, value });
      }
    }

    return {
      hasChanges: additions.length > 0 || modifications.length > 0 || deletions.length > 0,
      additions,
      modifications,
      deletions,
      summary: `${additions.length} added, ${modifications.length} modified, ${deletions.length} removed`
    };
  }

  /**
   * Deep-compare two JSON objects
   * @param {Object} customObj
   * @param {Object} upstreamObj
   * @returns {Object}
   */
  diffJSON(customObj, upstreamObj) {
    const changes = [];
    this._deepDiff(customObj, upstreamObj, '', changes);

    return {
      hasChanges: changes.length > 0,
      changes,
      summary: `${changes.length} field(s) changed`
    };
  }

  /**
   * Line-by-line unified diff
   * @param {string} customText
   * @param {string} upstreamText
   * @returns {Object}
   */
  diffText(customText, upstreamText) {
    const customLines = customText.split('\n');
    const upstreamLines = upstreamText.split('\n');

    const additions = [];
    const deletions = [];
    const maxLen = Math.max(customLines.length, upstreamLines.length);

    for (let i = 0; i < maxLen; i++) {
      const customLine = customLines[i];
      const upstreamLine = upstreamLines[i];

      if (customLine === undefined) {
        deletions.push({ line: i + 1, content: upstreamLine });
      } else if (upstreamLine === undefined) {
        additions.push({ line: i + 1, content: customLine });
      } else if (customLine !== upstreamLine) {
        deletions.push({ line: i + 1, content: upstreamLine });
        additions.push({ line: i + 1, content: customLine });
      }
    }

    return {
      hasChanges: additions.length > 0 || deletions.length > 0,
      additions,
      deletions,
      summary: `+${additions.length} / -${deletions.length} lines`
    };
  }

  // ── Private ────────────────────────────────────────────────────────

  async _loadContent(record) {
    if (record.content != null) {
      return record.content;
    }
    const filePath = record.storage_uri || record._filePath;
    if (!filePath) return null;

    try {
      return await fs.readFile(filePath, 'utf8');
    } catch {
      return null;
    }
  }

  _guessFileType(record) {
    const uri = record.storage_uri || record._filePath || '';
    if (uri.endsWith('.css')) return 'css';
    if (uri.endsWith('.json')) return 'json';
    if (uri.endsWith('.md')) return 'markdown';
    return 'text';
  }

  _parseCSSProperties(css) {
    const props = new Map();
    const regex = /([\w-]+)\s*:\s*([^;]+);/g;
    let match;
    while ((match = regex.exec(css)) !== null) {
      props.set(match[1].trim(), match[2].trim());
    }
    return props;
  }

  _deepDiff(custom, upstream, prefix, changes) {
    if (custom === upstream) return;

    if (typeof custom !== typeof upstream) {
      changes.push({ path: prefix || '(root)', type: 'type_changed', custom, upstream });
      return;
    }

    if (custom === null || upstream === null || typeof custom !== 'object') {
      if (custom !== upstream) {
        changes.push({ path: prefix || '(root)', type: 'value_changed', custom, upstream });
      }
      return;
    }

    if (Array.isArray(custom) !== Array.isArray(upstream)) {
      changes.push({ path: prefix || '(root)', type: 'type_changed', custom, upstream });
      return;
    }

    const allKeys = new Set([...Object.keys(custom), ...Object.keys(upstream)]);
    for (const key of allKeys) {
      const childPath = prefix ? `${prefix}.${key}` : key;
      if (!(key in custom)) {
        changes.push({ path: childPath, type: 'removed', upstream: upstream[key] });
      } else if (!(key in upstream)) {
        changes.push({ path: childPath, type: 'added', custom: custom[key] });
      } else {
        this._deepDiff(custom[key], upstream[key], childPath, changes);
      }
    }
  }
}

module.exports = { UpstreamDiffService };
