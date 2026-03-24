#!/usr/bin/env node

/**
 * Source Lineage Tracker
 *
 * Tracks the lineage of cloned resources and detects when the upstream
 * default has changed since the clone was made (drift detection).
 *
 * @version 1.0.0
 */

'use strict';

class SourceLineageTracker {
  /**
   * @param {Object} options
   * @param {import('./resource-registry').ResourceRegistry} options.registry
   * @param {import('./custom-resource-store').CustomResourceStore} options.store
   */
  constructor(options = {}) {
    this.registry = options.registry;
    this.store = options.store;
  }

  /**
   * Record lineage information when cloning a default resource.
   * Mutates the record in-place, adding source tracking fields.
   *
   * @param {Object} customRecord - The new custom record being created
   * @param {Object} sourceRecord - The packaged default being cloned
   * @returns {Object} The customRecord with lineage fields populated
   */
  async recordClone(customRecord, sourceRecord) {
    customRecord.source_resource_id = sourceRecord.resource_id;
    customRecord.source_version = sourceRecord._pluginVersion
      || this.registry?.getPluginVersion()
      || 'unknown';
    customRecord.source_checksum = sourceRecord.checksum || null;
    return customRecord;
  }

  /**
   * Check if the upstream default has changed since this resource was cloned.
   *
   * @param {Object} customRecord - A custom resource record with source lineage
   * @returns {Promise<{drifted: boolean, upstreamChecksum: string|null, customSourceChecksum: string|null, upstreamVersion: string|null, sourceVersion: string|null}>}
   */
  async checkDrift(customRecord) {
    if (!customRecord.source_resource_id) {
      return { drifted: false, upstreamChecksum: null, customSourceChecksum: null, upstreamVersion: null, sourceVersion: null };
    }

    const upstreamRecord = await this.registry.get(customRecord.source_resource_id);
    if (!upstreamRecord) {
      // Source resource no longer exists in the registry — it was removed upstream
      return {
        drifted: true,
        upstreamChecksum: null,
        customSourceChecksum: customRecord.source_checksum,
        upstreamVersion: null,
        sourceVersion: customRecord.source_version,
        reason: 'source_removed'
      };
    }

    const upstreamChecksum = await this.registry.computeChecksum(customRecord.source_resource_id);
    const upstreamVersion = upstreamRecord._pluginVersion || this.registry.getPluginVersion();

    // Drift if checksum changed OR version changed
    const checksumDrifted = customRecord.source_checksum
      && upstreamChecksum
      && customRecord.source_checksum !== upstreamChecksum;

    const versionDrifted = customRecord.source_version
      && upstreamVersion
      && customRecord.source_version !== upstreamVersion;

    return {
      drifted: !!(checksumDrifted || versionDrifted),
      upstreamChecksum,
      customSourceChecksum: customRecord.source_checksum,
      upstreamVersion,
      sourceVersion: customRecord.source_version,
      reason: checksumDrifted ? 'checksum_changed' : versionDrifted ? 'version_changed' : null
    };
  }

  /**
   * Find all custom resources where the upstream default has changed.
   *
   * @param {string} [scope] - site|tenant — if omitted, checks both
   * @returns {Promise<Array<{record: Object, drift: Object}>>}
   */
  async listDriftedResources(scope) {
    const scopes = scope ? [scope] : ['site', 'tenant'];
    const results = [];

    for (const s of scopes) {
      const records = await this.store.listRecords(s);
      for (const record of records) {
        if (!record.source_resource_id) continue;
        const drift = await this.checkDrift(record);
        if (drift.drifted) {
          results.push({ record, drift, scope: s });
        }
      }
    }

    return results;
  }
}

module.exports = { SourceLineageTracker };
