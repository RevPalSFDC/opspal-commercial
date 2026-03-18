#!/usr/bin/env node

/**
 * Pipeline Result Reconciler
 *
 * Merges parallel sub-agent ResultBundles from platform queries,
 * performs entity matching across platforms, and produces gap analysis.
 *
 * @module pipeline-result-reconciler
 * @version 1.0.0
 * @since 2026-02-08
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.resolve(__dirname, '../../../config/pipeline-config.json');

class PipelineResultReconciler {
  constructor(options = {}) {
    this.config = this._loadConfig();
    this.matchField = options.matchField || this.config.reconciliation?.matchFields?.primary || 'email';
    this.freshnessThresholdDays = this.config.reconciliation?.freshnessThreshold?.days || 30;
  }

  /**
   * Reconcile results from multiple platforms
   *
   * @param {Object} platformResults - Map of platform -> array of entity records
   *   Example: { salesforce: [{Id, Email, Name, OwnerId}], hubspot: [{vid, email, company}] }
   * @returns {Object} Reconciliation results with gaps and mismatches
   */
  reconcile(platformResults) {
    const platforms = Object.keys(platformResults);
    if (platforms.length < 2) {
      return {
        error: true,
        message: 'Need at least 2 platforms to reconcile',
        platforms,
      };
    }

    // Build entity index by match field (email)
    const entityIndex = {};

    for (const [platform, records] of Object.entries(platformResults)) {
      for (const record of records) {
        const matchValue = this._extractMatchValue(record, platform);
        if (!matchValue) continue;

        const key = matchValue.toLowerCase().trim();
        if (!entityIndex[key]) {
          entityIndex[key] = { matchValue: key, platforms: {} };
        }
        entityIndex[key].platforms[platform] = record;
      }
    }

    // Analyze gaps
    const gaps = [];
    const matched = [];
    const ownershipMismatches = [];
    const staleRecords = [];

    for (const [key, entity] of Object.entries(entityIndex)) {
      const presentIn = Object.keys(entity.platforms);
      const missingFrom = platforms.filter(p => !presentIn.includes(p));

      if (missingFrom.length > 0) {
        gaps.push({
          type: 'exists_in_a_not_b',
          matchValue: key,
          presentIn,
          missingFrom,
          record: entity.platforms[presentIn[0]],
        });
      }

      if (presentIn.length >= 2) {
        matched.push({
          matchValue: key,
          platforms: presentIn,
          records: entity.platforms,
        });

        // Check ownership mismatches
        const owners = {};
        for (const p of presentIn) {
          const owner = this._extractOwner(entity.platforms[p], p);
          if (owner) owners[p] = owner;
        }
        if (Object.keys(owners).length >= 2) {
          const ownerValues = Object.values(owners);
          const allSame = ownerValues.every(o => o === ownerValues[0]);
          if (!allSame) {
            ownershipMismatches.push({
              type: 'ownership_mismatch',
              matchValue: key,
              owners,
            });
          }
        }

        // Check freshness
        for (const p of presentIn) {
          const lastMod = this._extractLastModified(entity.platforms[p], p);
          if (lastMod) {
            const daysSince = (Date.now() - new Date(lastMod).getTime()) / (1000 * 60 * 60 * 24);
            if (daysSince > this.freshnessThresholdDays) {
              staleRecords.push({
                type: 'data_freshness',
                matchValue: key,
                platform: p,
                lastModified: lastMod,
                daysSince: Math.round(daysSince),
              });
            }
          }
        }
      }
    }

    // Summary counts
    const platformCounts = {};
    for (const p of platforms) {
      platformCounts[p] = platformResults[p].length;
    }

    return {
      error: false,
      summary: {
        totalEntities: Object.keys(entityIndex).length,
        matchedAcrossPlatforms: matched.length,
        gapCount: gaps.length,
        ownershipMismatches: ownershipMismatches.length,
        staleRecords: staleRecords.length,
        platformCounts,
      },
      gaps,
      ownershipMismatches,
      staleRecords,
      matched: matched.slice(0, 10), // Sample only
    };
  }

  /**
   * Format reconciliation results as markdown report
   */
  formatReport(results) {
    if (results.error) return `Error: ${results.message}`;

    const lines = [];
    lines.push('## Cross-Platform Reconciliation Report');
    lines.push('');
    lines.push(`**Generated:** ${new Date().toISOString()}`);
    lines.push('');

    // Summary
    lines.push('### Summary');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| Total unique entities | ${results.summary.totalEntities} |`);
    lines.push(`| Matched across platforms | ${results.summary.matchedAcrossPlatforms} |`);
    lines.push(`| Gap count (missing from 1+ platform) | ${results.summary.gapCount} |`);
    lines.push(`| Ownership mismatches | ${results.summary.ownershipMismatches} |`);
    lines.push(`| Stale records (>${this.freshnessThresholdDays}d) | ${results.summary.staleRecords} |`);
    lines.push('');

    // Platform counts
    lines.push('### Platform Record Counts');
    lines.push('');
    lines.push('| Platform | Records |');
    lines.push('|----------|---------|');
    for (const [p, count] of Object.entries(results.summary.platformCounts)) {
      lines.push(`| ${p} | ${count} |`);
    }
    lines.push('');

    // Gaps
    if (results.gaps.length > 0) {
      lines.push('### Gap Analysis');
      lines.push('');
      lines.push(`Found **${results.gaps.length}** entities present in one platform but missing from another.`);
      lines.push('');
      lines.push('| Entity | Present In | Missing From |');
      lines.push('|--------|-----------|--------------|');
      for (const gap of results.gaps.slice(0, 20)) {
        lines.push(`| ${gap.matchValue} | ${gap.presentIn.join(', ')} | ${gap.missingFrom.join(', ')} |`);
      }
      if (results.gaps.length > 20) {
        lines.push(`| ... | +${results.gaps.length - 20} more | |`);
      }
      lines.push('');
    }

    // Ownership mismatches
    if (results.ownershipMismatches.length > 0) {
      lines.push('### Ownership Mismatches');
      lines.push('');
      lines.push('| Entity | ' + Object.keys(results.ownershipMismatches[0]?.owners || {}).join(' | ') + ' |');
      lines.push('|--------|' + Object.keys(results.ownershipMismatches[0]?.owners || {}).map(() => '---').join('|') + '|');
      for (const m of results.ownershipMismatches.slice(0, 15)) {
        lines.push(`| ${m.matchValue} | ${Object.values(m.owners).join(' | ')} |`);
      }
      lines.push('');
    }

    // Stale records
    if (results.staleRecords.length > 0) {
      lines.push('### Stale Records');
      lines.push('');
      lines.push('| Entity | Platform | Last Modified | Days Since |');
      lines.push('|--------|----------|---------------|------------|');
      for (const s of results.staleRecords.slice(0, 15)) {
        lines.push(`| ${s.matchValue} | ${s.platform} | ${s.lastModified} | ${s.daysSince} |`);
      }
      lines.push('');
    }

    // Recommendations
    lines.push('### Recommendations');
    lines.push('');
    if (results.gaps.length > 0) {
      lines.push(`1. **Resolve ${results.gaps.length} gaps** - Sync missing records across platforms`);
    }
    if (results.ownershipMismatches.length > 0) {
      lines.push(`2. **Fix ${results.ownershipMismatches.length} ownership mismatches** - Align record owners`);
    }
    if (results.staleRecords.length > 0) {
      lines.push(`3. **Update ${results.staleRecords.length} stale records** - Records unchanged for >${this.freshnessThresholdDays} days`);
    }

    return lines.join('\n');
  }

  _extractMatchValue(record, platform) {
    const keys = ['email', 'Email', 'EMAIL', 'properties.email', 'name', 'Name'];
    for (const key of keys) {
      if (key.includes('.')) {
        const parts = key.split('.');
        let val = record;
        for (const p of parts) { val = val?.[p]; }
        if (val) return String(val);
      }
      if (record[key]) return String(record[key]);
    }
    return null;
  }

  _extractOwner(record, platform) {
    const keys = ['OwnerId', 'Owner', 'owner', 'hubspot_owner_id', 'assignee', 'Assignee'];
    for (const key of keys) {
      if (record[key]) return String(record[key]);
    }
    return null;
  }

  _extractLastModified(record, platform) {
    const keys = ['LastModifiedDate', 'lastmodifieddate', 'hs_lastmodifieddate', 'modified_at', 'updatedAt'];
    for (const key of keys) {
      if (record[key]) return String(record[key]);
    }
    return null;
  }

  _loadConfig() {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch {
      return { reconciliation: {}, output: {} };
    }
  }
}

module.exports = { PipelineResultReconciler };

// CLI
if (require.main === module) {
  console.log('Pipeline Result Reconciler');
  console.log('Usage: require and call reconcile() with platform result maps');
  console.log('Example:');
  console.log('  const { PipelineResultReconciler } = require("./pipeline-result-reconciler");');
  console.log('  const reconciler = new PipelineResultReconciler();');
  console.log('  const results = reconciler.reconcile({ salesforce: [...], hubspot: [...] });');
}
