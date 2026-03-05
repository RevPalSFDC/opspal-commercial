#!/usr/bin/env node

/**
 * Report Version Manager
 *
 * Purpose: Track report history and compare changes over time.
 * Maintains version history, generates diffs, and tracks KPI trends across versions.
 *
 * Usage:
 *   const { ReportVersionManager } = require('./report-version-manager');
 *
 *   const manager = new ReportVersionManager({ storagePath: './report-versions' });
 *   await manager.saveVersion('arr-report', reportData, { author: 'claude' });
 *   const comparison = await manager.compareVersions('arr-report', 'v1', 'v2');
 *
 * @module report-version-manager
 * @version 1.0.0
 * @created 2025-12-14
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Report Version Manager
 */
class ReportVersionManager {
    /**
     * Initialize report version manager
     *
     * @param {Object} config - Configuration options
     * @param {string} [config.storagePath='./report-versions'] - Path to store versions
     * @param {number} [config.maxVersions=50] - Maximum versions to keep per report
     */
    constructor(config = {}) {
        this.storagePath = config.storagePath ?? './report-versions';
        this.maxVersions = config.maxVersions ?? 50;
        this.indexFile = path.join(this.storagePath, 'index.json');

        // Ensure storage directory exists
        if (!fs.existsSync(this.storagePath)) {
            fs.mkdirSync(this.storagePath, { recursive: true });
        }

        this.index = this._loadIndex();
    }

    /**
     * Save a new version of a report
     *
     * @param {string} reportId - Report identifier
     * @param {Object} data - Report data
     * @param {Object} [metadata] - Version metadata
     * @param {string} [metadata.author] - Author/source of version
     * @param {string} [metadata.description] - Version description
     * @param {Array<string>} [metadata.tags] - Version tags
     * @returns {Object} Save result
     */
    saveVersion(reportId, data, metadata = {}) {
        const timestamp = new Date().toISOString();
        const versionNumber = this._getNextVersion(reportId);
        const versionId = `v${versionNumber}`;
        const contentHash = this._hashContent(data);

        // Check if content has changed from last version
        const lastVersion = this._getLastVersion(reportId);
        if (lastVersion && lastVersion.contentHash === contentHash) {
            return {
                success: true,
                skipped: true,
                reason: 'No changes detected from previous version',
                lastVersion: lastVersion.versionId
            };
        }

        // Create version entry
        const version = {
            versionId,
            versionNumber,
            reportId,
            timestamp,
            contentHash,
            metadata: {
                author: metadata.author ?? 'system',
                description: metadata.description ?? `Version ${versionNumber}`,
                tags: metadata.tags ?? [],
                ...metadata
            },
            stats: this._calculateStats(data)
        };

        // Save data file
        const reportDir = path.join(this.storagePath, reportId);
        if (!fs.existsSync(reportDir)) {
            fs.mkdirSync(reportDir, { recursive: true });
        }

        const dataFile = path.join(reportDir, `${versionId}.json`);
        fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf8');

        // Update index
        if (!this.index.reports[reportId]) {
            this.index.reports[reportId] = {
                created: timestamp,
                versions: []
            };
        }

        this.index.reports[reportId].versions.push(version);
        this.index.reports[reportId].latestVersion = versionId;
        this.index.reports[reportId].updated = timestamp;

        // Prune old versions if needed
        this._pruneVersions(reportId);

        this._saveIndex();

        return {
            success: true,
            reportId,
            versionId,
            versionNumber,
            timestamp,
            contentHash
        };
    }

    /**
     * Get a specific version of a report
     *
     * @param {string} reportId - Report identifier
     * @param {string} [version='latest'] - Version ID or 'latest'
     * @returns {Object} Version data
     */
    getVersion(reportId, version = 'latest') {
        const reportInfo = this.index.reports[reportId];

        if (!reportInfo) {
            return { success: false, error: `Report not found: ${reportId}` };
        }

        const versionId = version === 'latest'
            ? reportInfo.latestVersion
            : version;

        const versionInfo = reportInfo.versions.find(v => v.versionId === versionId);

        if (!versionInfo) {
            return { success: false, error: `Version not found: ${versionId}` };
        }

        const dataFile = path.join(this.storagePath, reportId, `${versionId}.json`);

        if (!fs.existsSync(dataFile)) {
            return { success: false, error: 'Version data file not found' };
        }

        const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));

        return {
            success: true,
            ...versionInfo,
            data
        };
    }

    /**
     * List all versions of a report
     *
     * @param {string} reportId - Report identifier
     * @param {Object} [options] - Options
     * @param {number} [options.limit] - Maximum versions to return
     * @param {boolean} [options.includeStats=true] - Include stats in response
     * @returns {Object} Version list
     */
    listVersions(reportId, options = {}) {
        const { limit, includeStats = true } = options;
        const reportInfo = this.index.reports[reportId];

        if (!reportInfo) {
            return { success: false, error: `Report not found: ${reportId}` };
        }

        let versions = [...reportInfo.versions].reverse(); // Most recent first

        if (limit) {
            versions = versions.slice(0, limit);
        }

        if (!includeStats) {
            versions = versions.map(v => ({
                versionId: v.versionId,
                timestamp: v.timestamp,
                metadata: v.metadata
            }));
        }

        return {
            success: true,
            reportId,
            totalVersions: reportInfo.versions.length,
            latestVersion: reportInfo.latestVersion,
            versions
        };
    }

    /**
     * Compare two versions of a report
     *
     * @param {string} reportId - Report identifier
     * @param {string} version1 - First version ID
     * @param {string} version2 - Second version ID
     * @returns {Object} Comparison result
     */
    compareVersions(reportId, version1, version2) {
        const v1 = this.getVersion(reportId, version1);
        const v2 = this.getVersion(reportId, version2);

        if (!v1.success) return v1;
        if (!v2.success) return v2;

        const diff = this._generateDiff(v1.data, v2.data);
        const statsComparison = this._compareStats(v1.stats, v2.stats);

        return {
            success: true,
            reportId,
            version1: {
                versionId: v1.versionId,
                timestamp: v1.timestamp,
                stats: v1.stats
            },
            version2: {
                versionId: v2.versionId,
                timestamp: v2.timestamp,
                stats: v2.stats
            },
            diff,
            statsComparison,
            summary: this._generateComparisonSummary(diff, statsComparison)
        };
    }

    /**
     * Get KPI trend across versions
     *
     * @param {string} reportId - Report identifier
     * @param {string} kpiPath - Path to KPI value (e.g., 'metrics.ARR')
     * @param {number} [versionCount=10] - Number of versions to include
     * @returns {Object} KPI trend data
     */
    getKPITrend(reportId, kpiPath, versionCount = 10) {
        const reportInfo = this.index.reports[reportId];

        if (!reportInfo) {
            return { success: false, error: `Report not found: ${reportId}` };
        }

        const versions = reportInfo.versions.slice(-versionCount);
        const trend = [];

        for (const version of versions) {
            const versionData = this.getVersion(reportId, version.versionId);

            if (versionData.success) {
                const value = this._getValueByPath(versionData.data, kpiPath);

                trend.push({
                    versionId: version.versionId,
                    timestamp: version.timestamp,
                    value,
                    valid: value !== undefined
                });
            }
        }

        // Calculate trend statistics
        const validValues = trend.filter(t => t.valid).map(t => t.value);

        return {
            success: true,
            reportId,
            kpiPath,
            versionCount: trend.length,
            trend,
            statistics: validValues.length > 0 ? {
                min: Math.min(...validValues),
                max: Math.max(...validValues),
                average: validValues.reduce((a, b) => a + b, 0) / validValues.length,
                change: validValues.length > 1
                    ? ((validValues[validValues.length - 1] - validValues[0]) / validValues[0]) * 100
                    : 0
            } : null
        };
    }

    /**
     * Get change history for a report
     *
     * @param {string} reportId - Report identifier
     * @param {Object} [options] - Options
     * @param {number} [options.limit=20] - Maximum entries
     * @returns {Object} Change history
     */
    getChangeHistory(reportId, options = {}) {
        const { limit = 20 } = options;
        const reportInfo = this.index.reports[reportId];

        if (!reportInfo) {
            return { success: false, error: `Report not found: ${reportId}` };
        }

        const versions = reportInfo.versions.slice(-limit - 1);
        const changes = [];

        for (let i = 1; i < versions.length; i++) {
            const prevVersion = versions[i - 1];
            const currVersion = versions[i];

            const comparison = this.compareVersions(reportId, prevVersion.versionId, currVersion.versionId);

            if (comparison.success) {
                changes.push({
                    from: prevVersion.versionId,
                    to: currVersion.versionId,
                    timestamp: currVersion.timestamp,
                    author: currVersion.metadata.author,
                    description: currVersion.metadata.description,
                    summary: comparison.summary,
                    changeCount: comparison.diff?.changed?.length ?? 0
                });
            }
        }

        return {
            success: true,
            reportId,
            changeCount: changes.length,
            changes: changes.reverse() // Most recent first
        };
    }

    /**
     * Generate comparison report in markdown
     *
     * @param {Object} comparison - Comparison result from compareVersions
     * @returns {string} Markdown report
     */
    generateComparisonReport(comparison) {
        if (!comparison.success) {
            return `Error: ${comparison.error}`;
        }

        let md = `# Report Comparison: ${comparison.reportId}\n\n`;
        md += `**Comparing:** ${comparison.version1.versionId} → ${comparison.version2.versionId}\n\n`;

        // Timestamps
        md += `| Version | Timestamp |\n`;
        md += `|---------|----------|\n`;
        md += `| ${comparison.version1.versionId} | ${comparison.version1.timestamp} |\n`;
        md += `| ${comparison.version2.versionId} | ${comparison.version2.timestamp} |\n\n`;

        // Summary
        md += `## Summary\n\n`;
        md += comparison.summary + '\n\n';

        // Stats comparison
        if (comparison.statsComparison) {
            md += `## Statistics Changes\n\n`;
            md += `| Metric | Old | New | Change |\n`;
            md += `|--------|-----|-----|--------|\n`;

            for (const [key, stat] of Object.entries(comparison.statsComparison)) {
                if (stat.changed) {
                    const sign = stat.change > 0 ? '+' : '';
                    md += `| ${key} | ${stat.old} | ${stat.new} | ${sign}${stat.change} |\n`;
                }
            }

            md += '\n';
        }

        // Detailed changes
        if (comparison.diff?.changed?.length > 0) {
            md += `## Changed Fields (${comparison.diff.changed.length})\n\n`;

            comparison.diff.changed.slice(0, 20).forEach(change => {
                md += `- **${change.path}**: ${JSON.stringify(change.old)} → ${JSON.stringify(change.new)}\n`;
            });

            if (comparison.diff.changed.length > 20) {
                md += `\n_...and ${comparison.diff.changed.length - 20} more changes_\n`;
            }
        }

        return md;
    }

    /**
     * Export version history to file
     *
     * @param {string} reportId - Report identifier
     * @param {string} [outputPath] - Output file path
     * @returns {Object} Export result
     */
    exportVersionHistory(reportId, outputPath = null) {
        const history = this.listVersions(reportId);

        if (!history.success) {
            return history;
        }

        const output = outputPath ?? `${reportId}-version-history.json`;
        fs.writeFileSync(output, JSON.stringify(history, null, 2), 'utf8');

        return {
            success: true,
            path: output,
            versionCount: history.totalVersions
        };
    }

    /**
     * Delete old versions
     *
     * @param {string} reportId - Report identifier
     * @param {number} keepCount - Number of versions to keep
     * @returns {Object} Cleanup result
     */
    cleanupVersions(reportId, keepCount) {
        const reportInfo = this.index.reports[reportId];

        if (!reportInfo) {
            return { success: false, error: `Report not found: ${reportId}` };
        }

        const toDelete = reportInfo.versions.slice(0, -keepCount);
        let deleted = 0;

        toDelete.forEach(version => {
            const dataFile = path.join(this.storagePath, reportId, `${version.versionId}.json`);
            if (fs.existsSync(dataFile)) {
                fs.unlinkSync(dataFile);
                deleted++;
            }
        });

        reportInfo.versions = reportInfo.versions.slice(-keepCount);
        this._saveIndex();

        return {
            success: true,
            deleted,
            remaining: reportInfo.versions.length
        };
    }

    // ==================== Private Methods ====================

    /**
     * Load version index
     * @private
     */
    _loadIndex() {
        if (fs.existsSync(this.indexFile)) {
            return JSON.parse(fs.readFileSync(this.indexFile, 'utf8'));
        }

        return { reports: {} };
    }

    /**
     * Save version index
     * @private
     */
    _saveIndex() {
        fs.writeFileSync(this.indexFile, JSON.stringify(this.index, null, 2), 'utf8');
    }

    /**
     * Get next version number
     * @private
     */
    _getNextVersion(reportId) {
        const reportInfo = this.index.reports[reportId];

        if (!reportInfo || reportInfo.versions.length === 0) {
            return 1;
        }

        const lastVersion = reportInfo.versions[reportInfo.versions.length - 1];
        return lastVersion.versionNumber + 1;
    }

    /**
     * Get last version info
     * @private
     */
    _getLastVersion(reportId) {
        const reportInfo = this.index.reports[reportId];

        if (!reportInfo || reportInfo.versions.length === 0) {
            return null;
        }

        return reportInfo.versions[reportInfo.versions.length - 1];
    }

    /**
     * Hash content for change detection
     * @private
     */
    _hashContent(data) {
        const content = JSON.stringify(data);
        return crypto.createHash('sha256').update(content).digest('hex').slice(0, 12);
    }

    /**
     * Calculate report statistics
     * @private
     */
    _calculateStats(data) {
        const stats = {};

        if (Array.isArray(data)) {
            stats.recordCount = data.length;
        } else if (typeof data === 'object' && data !== null) {
            stats.fieldCount = Object.keys(data).length;

            // Check for common structures
            if (data.kpis) stats.kpiCount = Object.keys(data.kpis).length;
            if (data.records) stats.recordCount = data.records.length;
            if (data.metrics) stats.metricCount = Object.keys(data.metrics).length;
        }

        return stats;
    }

    /**
     * Generate diff between two data objects
     * @private
     */
    _generateDiff(data1, data2, path = '') {
        const diff = { added: [], removed: [], changed: [] };

        const keys1 = new Set(Object.keys(data1 || {}));
        const keys2 = new Set(Object.keys(data2 || {}));

        // Added keys
        for (const key of keys2) {
            if (!keys1.has(key)) {
                diff.added.push({ path: path ? `${path}.${key}` : key, value: data2[key] });
            }
        }

        // Removed keys
        for (const key of keys1) {
            if (!keys2.has(key)) {
                diff.removed.push({ path: path ? `${path}.${key}` : key, value: data1[key] });
            }
        }

        // Changed keys
        for (const key of keys1) {
            if (keys2.has(key)) {
                const fullPath = path ? `${path}.${key}` : key;
                const val1 = data1[key];
                const val2 = data2[key];

                if (typeof val1 === 'object' && typeof val2 === 'object' && val1 !== null && val2 !== null) {
                    if (!Array.isArray(val1) && !Array.isArray(val2)) {
                        const nestedDiff = this._generateDiff(val1, val2, fullPath);
                        diff.added.push(...nestedDiff.added);
                        diff.removed.push(...nestedDiff.removed);
                        diff.changed.push(...nestedDiff.changed);
                    } else if (JSON.stringify(val1) !== JSON.stringify(val2)) {
                        diff.changed.push({ path: fullPath, old: val1, new: val2 });
                    }
                } else if (val1 !== val2) {
                    diff.changed.push({ path: fullPath, old: val1, new: val2 });
                }
            }
        }

        return diff;
    }

    /**
     * Compare statistics between versions
     * @private
     */
    _compareStats(stats1, stats2) {
        const comparison = {};

        const allKeys = new Set([...Object.keys(stats1 || {}), ...Object.keys(stats2 || {})]);

        for (const key of allKeys) {
            const old = stats1?.[key];
            const newVal = stats2?.[key];

            comparison[key] = {
                old,
                new: newVal,
                changed: old !== newVal,
                change: typeof old === 'number' && typeof newVal === 'number' ? newVal - old : null
            };
        }

        return comparison;
    }

    /**
     * Generate comparison summary
     * @private
     */
    _generateComparisonSummary(diff, statsComparison) {
        const parts = [];

        const totalChanges = diff.added.length + diff.removed.length + diff.changed.length;
        parts.push(`${totalChanges} total changes`);

        if (diff.added.length > 0) parts.push(`${diff.added.length} added`);
        if (diff.removed.length > 0) parts.push(`${diff.removed.length} removed`);
        if (diff.changed.length > 0) parts.push(`${diff.changed.length} modified`);

        // Stat changes
        for (const [key, stat] of Object.entries(statsComparison || {})) {
            if (stat.changed && typeof stat.change === 'number') {
                const sign = stat.change > 0 ? '+' : '';
                parts.push(`${key}: ${sign}${stat.change}`);
            }
        }

        return parts.join(', ');
    }

    /**
     * Get value by dot-notation path
     * @private
     */
    _getValueByPath(obj, path) {
        return path.split('.').reduce((current, key) =>
            current && current[key] !== undefined ? current[key] : undefined, obj);
    }

    /**
     * Prune old versions to stay under limit
     * @private
     */
    _pruneVersions(reportId) {
        const reportInfo = this.index.reports[reportId];

        if (reportInfo.versions.length <= this.maxVersions) {
            return;
        }

        const toRemove = reportInfo.versions.length - this.maxVersions;
        const removedVersions = reportInfo.versions.splice(0, toRemove);

        removedVersions.forEach(version => {
            const dataFile = path.join(this.storagePath, reportId, `${version.versionId}.json`);
            if (fs.existsSync(dataFile)) {
                fs.unlinkSync(dataFile);
            }
        });
    }
}

/**
 * Command-line interface
 */
async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help')) {
        console.log(`
Report Version Manager

Usage:
  node report-version-manager.js <command> [options]

Commands:
  save <reportId> <dataPath>    Save a new version
  get <reportId> [version]      Get a version (default: latest)
  list <reportId>               List all versions
  compare <reportId> <v1> <v2>  Compare two versions
  trend <reportId> <kpiPath>    Get KPI trend across versions
  history <reportId>            Get change history
  cleanup <reportId> <keep>     Delete old versions

Options:
  --storage <path>     Storage directory (default: ./report-versions)
  --output <path>      Output file path
  --format <type>      Output format: json, markdown
  --help               Show this help message

Examples:
  node report-version-manager.js save arr-report ./report.json
  node report-version-manager.js get arr-report v5
  node report-version-manager.js compare arr-report v5 v6 --format markdown
  node report-version-manager.js trend arr-report metrics.ARR
        `);
        process.exit(0);
    }

    try {
        const storagePath = args.includes('--storage') ? args[args.indexOf('--storage') + 1] : './report-versions';
        const outputPath = args.includes('--output') ? args[args.indexOf('--output') + 1] : null;
        const format = args.includes('--format') ? args[args.indexOf('--format') + 1] : 'json';

        const manager = new ReportVersionManager({ storagePath });
        const command = args[0];

        switch (command) {
            case 'save': {
                const reportId = args[1];
                const dataPath = args[2];

                if (!reportId || !dataPath) {
                    console.error('Usage: save <reportId> <dataPath>');
                    process.exit(1);
                }

                const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
                const result = manager.saveVersion(reportId, data);

                console.log(JSON.stringify(result, null, 2));
                break;
            }

            case 'get': {
                const reportId = args[1];
                const version = args[2] ?? 'latest';

                const result = manager.getVersion(reportId, version);
                console.log(JSON.stringify(result, null, 2));
                break;
            }

            case 'list': {
                const reportId = args[1];
                const result = manager.listVersions(reportId);
                console.log(JSON.stringify(result, null, 2));
                break;
            }

            case 'compare': {
                const reportId = args[1];
                const v1 = args[2];
                const v2 = args[3];

                if (!reportId || !v1 || !v2) {
                    console.error('Usage: compare <reportId> <v1> <v2>');
                    process.exit(1);
                }

                const result = manager.compareVersions(reportId, v1, v2);

                if (format === 'markdown') {
                    console.log(manager.generateComparisonReport(result));
                } else {
                    console.log(JSON.stringify(result, null, 2));
                }
                break;
            }

            case 'trend': {
                const reportId = args[1];
                const kpiPath = args[2];

                if (!reportId || !kpiPath) {
                    console.error('Usage: trend <reportId> <kpiPath>');
                    process.exit(1);
                }

                const result = manager.getKPITrend(reportId, kpiPath);
                console.log(JSON.stringify(result, null, 2));
                break;
            }

            case 'history': {
                const reportId = args[1];
                const result = manager.getChangeHistory(reportId);
                console.log(JSON.stringify(result, null, 2));
                break;
            }

            case 'cleanup': {
                const reportId = args[1];
                const keep = parseInt(args[2] ?? '10');

                const result = manager.cleanupVersions(reportId, keep);
                console.log(JSON.stringify(result, null, 2));
                break;
            }

            default:
                console.error(`Unknown command: ${command}`);
                process.exit(1);
        }

    } catch (error) {
        console.error('\nError:');
        console.error(error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { ReportVersionManager };
