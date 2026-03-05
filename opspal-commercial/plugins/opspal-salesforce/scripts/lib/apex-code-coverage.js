#!/usr/bin/env node

/**
 * Apex Code Coverage Snapshot (v3.28.2)
 *
 * Retrieves code coverage percentages for all Apex classes and triggers
 * using ApexCodeCoverageAggregate from Tooling API.
 *
 * Pure Tooling API; no UI scraping required.
 *
 * @version 1.0.0
 * @date 2025-10-22
 */

const { execSync } = require('child_process');

class ApexCodeCoverage {
  constructor(orgAlias) {
    this.orgAlias = orgAlias;
    this.coverageById = new Map();
  }

  /**
   * Execute Tooling API SOQL query
   * @param {string} soql - SOQL query
   * @returns {Array} Query results
   */
  query(soql) {
    const cmd = `sf data query --use-tooling-api --json -o ${this.orgAlias} --query "${soql.replace(/\n/g,' ')}"`;
    try {
      const output = execSync(cmd, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
      const parsed = JSON.parse(output);
      return parsed.result?.records || [];
    } catch (error) {
      console.warn(`  ⚠️  Code coverage query failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Retrieve code coverage for all classes and triggers
   * @returns {Promise<Map>} Map of ApexClassOrTriggerId -> coverage %
   */
  async retrieve() {
    console.log('  🔄 Retrieving code coverage from ApexCodeCoverageAggregate...');

    const coverage = this.query(`
      SELECT ApexClassOrTriggerId, NumLinesCovered, NumLinesUncovered
      FROM ApexCodeCoverageAggregate
    `);

    console.log(`  ✅ Retrieved coverage for ${coverage.length} classes/triggers`);

    // Index by class/trigger ID; compute %
    coverage.forEach(r => {
      const total = r.NumLinesCovered + r.NumLinesUncovered;
      const pct = total ? Math.round(100 * r.NumLinesCovered / total) : 0;
      this.coverageById.set(r.ApexClassOrTriggerId, pct);
    });

    return this.coverageById;
  }

  /**
   * Get coverage percentage for a specific class/trigger
   * @param {string} apexId - ApexClass or ApexTrigger ID
   * @returns {number|null} Coverage percentage (0-100) or null if not found
   */
  getCoverage(apexId) {
    return this.coverageById.get(apexId) ?? null;
  }

  /**
   * Get coverage statistics
   * @returns {Object} Stats object with counts and averages
   */
  getStats() {
    if (this.coverageById.size === 0) {
      return {
        total: 0,
        covered: 0,
        notCovered: 0,
        avgCoverage: 0,
        minCoverage: 0,
        maxCoverage: 0
      };
    }

    const coverages = Array.from(this.coverageById.values());
    const covered = coverages.filter(c => c >= 75).length;
    const notCovered = coverages.filter(c => c === 0).length;
    const sum = coverages.reduce((a, b) => a + b, 0);

    return {
      total: coverages.length,
      covered: covered,
      notCovered: notCovered,
      avgCoverage: Math.round(sum / coverages.length),
      minCoverage: Math.min(...coverages),
      maxCoverage: Math.max(...coverages)
    };
  }
}

module.exports = ApexCodeCoverage;

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: node apex-code-coverage.js <org-alias>');
    console.log('');
    console.log('Example:');
    console.log('  node apex-code-coverage.js gamma-corp');
    process.exit(1);
  }

  const orgAlias = args[0];

  (async () => {
    const coverage = new ApexCodeCoverage(orgAlias);
    await coverage.retrieve();

    const stats = coverage.getStats();

    console.log('\n=== Code Coverage Statistics ===\n');
    console.log(`Total Classes/Triggers: ${stats.total}`);
    console.log(`≥75% Coverage: ${stats.covered} (${Math.round(100*stats.covered/stats.total)}%)`);
    console.log(`0% Coverage: ${stats.notCovered} (${Math.round(100*stats.notCovered/stats.total)}%)`);
    console.log(`Average Coverage: ${stats.avgCoverage}%`);
    console.log(`Range: ${stats.minCoverage}% - ${stats.maxCoverage}%`);
    console.log('');
  })();
}
