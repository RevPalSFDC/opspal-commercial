#!/usr/bin/env node

/**
 * Report Format Selector
 *
 * Helps select the appropriate Salesforce report format based on requirements.
 * Analyzes use case, data volume, and feature needs to recommend TABULAR, SUMMARY, MATRIX, or JOINED.
 *
 * Usage:
 *   node report-format-selector.js --interactive
 *   node report-format-selector.js --analyze <requirements-json>
 *   node report-format-selector.js --row-estimate <org-alias> <object> [filters]
 *
 * @see ../docs/runbooks/report-api-development/01-report-formats-fundamentals.md
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ============================================================================
// FORMAT DEFINITIONS
// ============================================================================

const REPORT_FORMATS = {
    TABULAR: {
        name: 'TABULAR',
        description: 'Simple list report without groupings',
        rowLimit: 50000,
        features: {
            groupingsDown: false,
            groupingsAcross: false,
            aggregates: false,
            subtotals: false,
            grandTotal: false,
            crossBlockFormulas: false
        },
        useCases: [
            'Data exports',
            'Simple record lists',
            'Audit trails',
            'Contact/account lists',
            'Activity logs'
        ],
        bestWhen: [
            'You need complete raw data',
            'Row count may exceed 2,000',
            'No groupings or subtotals needed',
            'Exporting to Excel/CSV'
        ],
        avoidWhen: [
            'You need grouped data',
            'Subtotals are required',
            'Cross-tabulation analysis'
        ]
    },
    SUMMARY: {
        name: 'SUMMARY',
        description: 'Grouped report with subtotals (row groupings only)',
        rowLimit: 2000,
        rowLimitWarning: 'CRITICAL: 2,000-row HARD LIMIT with silent truncation!',
        features: {
            groupingsDown: true,
            maxGroupingsDown: 3,
            groupingsAcross: false,
            aggregates: true,
            subtotals: true,
            grandTotal: true,
            crossBlockFormulas: false
        },
        useCases: [
            'Pipeline by stage',
            'Revenue by region',
            'Leads by source',
            'Cases by priority',
            'Any grouped analysis'
        ],
        bestWhen: [
            'You need data grouped by categories',
            'Subtotals and aggregates are needed',
            'Row count is UNDER 2,000',
            'No column-based cross-tabulation needed'
        ],
        avoidWhen: [
            'Row count exceeds 2,000 (use TABULAR)',
            'You need column groupings (use MATRIX)',
            'Comparing different data sources (use JOINED)'
        ]
    },
    MATRIX: {
        name: 'MATRIX',
        description: 'Cross-tabulation with row AND column groupings',
        rowLimit: 2000,
        features: {
            groupingsDown: true,
            maxGroupingsDown: 3,
            groupingsAcross: true,
            maxGroupingsAcross: 2,
            aggregates: true,
            subtotals: true,
            grandTotal: true,
            crossBlockFormulas: false
        },
        useCases: [
            'Revenue by owner AND stage',
            'Pipeline by product AND quarter',
            'Cases by priority AND month',
            'Accounts by industry AND type',
            'Pivot table style analysis'
        ],
        bestWhen: [
            'You need two-dimensional grouping',
            'Cross-tabulation analysis required',
            'Comparing metrics across two dimensions',
            'Row count is UNDER 2,000'
        ],
        avoidWhen: [
            'Row count exceeds 2,000',
            'Single dimension grouping sufficient',
            'Comparing different report types (use JOINED)'
        ]
    },
    JOINED: {
        name: 'JOINED (MultiBlock)',
        description: 'Multiple data blocks with cross-block calculations',
        rowLimit: 2000,
        rowLimitNote: '2,000 rows PER BLOCK',
        features: {
            groupingsDown: true,
            maxGroupingsDown: 3,
            groupingsAcross: false,
            aggregates: true,
            subtotals: true,
            grandTotal: true,
            crossBlockFormulas: true,
            maxBlocks: 5
        },
        useCases: [
            'Year-over-year comparison',
            'Forecast vs actual',
            'Customer 360 view',
            'Pipeline vs closed',
            'Multi-object comparison'
        ],
        bestWhen: [
            'Comparing data from different report types',
            'Cross-block calculations needed',
            'YoY or period-over-period analysis',
            'Combining related but separate data'
        ],
        avoidWhen: [
            'Single data source is sufficient',
            'REST API creation needed (use Metadata API)',
            'Simple aggregations (use SUMMARY)'
        ],
        restrictions: [
            'Cannot be created via REST API (use Metadata API)',
            'Common grouping field required across blocks',
            'More complex to maintain'
        ]
    }
};

// ============================================================================
// FORMAT SELECTION LOGIC
// ============================================================================

/**
 * Analyze requirements and recommend format
 * @param {Object} requirements User requirements
 * @returns {Object} Recommendation with reasoning
 */
function analyzeRequirements(requirements) {
    const {
        needsGroupings = false,
        needsColumnGroupings = false,
        needsCrossBlockCalculations = false,
        needsMultipleDataSources = false,
        estimatedRowCount = 0,
        needsAggregates = false,
        needsSubtotals = false,
        needsCompleteData = false,
        needsExport = false
    } = requirements;

    const recommendations = [];
    const warnings = [];

    // Decision logic
    if (needsCrossBlockCalculations || needsMultipleDataSources) {
        recommendations.push({
            format: 'JOINED',
            score: 100,
            reason: 'Cross-block calculations or multiple data sources require JOINED format',
            note: 'Must use Metadata API for deployment'
        });
    }

    if (needsColumnGroupings) {
        const matrixScore = estimatedRowCount <= 2000 ? 90 : 40;
        recommendations.push({
            format: 'MATRIX',
            score: matrixScore,
            reason: 'Column groupings require MATRIX format',
            note: estimatedRowCount > 2000 ? 'WARNING: Row count exceeds MATRIX limit' : null
        });
    }

    if (needsGroupings && !needsColumnGroupings) {
        const summaryScore = estimatedRowCount <= 2000 ? 85 : 30;
        recommendations.push({
            format: 'SUMMARY',
            score: summaryScore,
            reason: 'Row groupings with subtotals use SUMMARY format',
            note: estimatedRowCount > 2000 ? 'CRITICAL: Row count exceeds 2,000 limit - data will be truncated!' : null
        });
    }

    if (!needsGroupings || needsCompleteData || needsExport) {
        const tabularScore = needsGroupings ? 50 : 95;
        recommendations.push({
            format: 'TABULAR',
            score: tabularScore,
            reason: needsGroupings
                ? 'TABULAR has 50K row limit but no groupings'
                : 'Simple list without groupings - TABULAR is ideal',
            note: needsGroupings ? 'Groupings will not be available' : null
        });
    }

    // Sort by score
    recommendations.sort((a, b) => b.score - a.score);

    // Add warnings for row count issues
    if (estimatedRowCount > 2000 && (needsGroupings || needsColumnGroupings)) {
        warnings.push({
            severity: 'critical',
            message: `Estimated ${estimatedRowCount} rows exceeds SUMMARY/MATRIX 2,000-row limit!`,
            suggestion: 'Add filters to reduce row count, or use TABULAR format for complete data'
        });
    }

    return {
        recommended: recommendations[0]?.format || 'TABULAR',
        recommendations,
        warnings,
        requirements
    };
}

/**
 * Interactive format selection wizard
 */
async function interactiveWizard() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const ask = (question) => new Promise(resolve => rl.question(question, resolve));

    console.log('\n' + '='.repeat(60));
    console.log('       SALESFORCE REPORT FORMAT SELECTION WIZARD');
    console.log('='.repeat(60) + '\n');

    const requirements = {};

    // Question 1: Groupings
    console.log('1. Do you need to group data into categories (e.g., by Stage, by Owner)?');
    const needsGroupings = (await ask('   [y/n]: ')).toLowerCase() === 'y';
    requirements.needsGroupings = needsGroupings;

    if (needsGroupings) {
        // Question 2: Column groupings
        console.log('\n2. Do you need TWO-dimensional grouping (rows AND columns)?');
        console.log('   Example: Revenue by Owner (rows) AND by Quarter (columns)');
        const needsColumnGroupings = (await ask('   [y/n]: ')).toLowerCase() === 'y';
        requirements.needsColumnGroupings = needsColumnGroupings;
    }

    // Question 3: Multiple data sources
    console.log('\n3. Do you need to compare data from DIFFERENT sources?');
    console.log('   Examples: Year-over-Year, Forecast vs Actual, Pipeline vs Closed');
    const needsMultipleDataSources = (await ask('   [y/n]: ')).toLowerCase() === 'y';
    requirements.needsMultipleDataSources = needsMultipleDataSources;

    if (needsMultipleDataSources) {
        // Question 4: Cross-block calculations
        console.log('\n4. Do you need calculations ACROSS these data sources?');
        console.log('   Example: Growth Rate = (This Year - Last Year) / Last Year');
        const needsCrossBlockCalculations = (await ask('   [y/n]: ')).toLowerCase() === 'y';
        requirements.needsCrossBlockCalculations = needsCrossBlockCalculations;
    }

    // Question 5: Row count estimate
    console.log('\n5. Approximately how many rows of data do you expect?');
    console.log('   (This is important for format selection)');
    const rowCountStr = await ask('   Enter number (or "unknown"): ');
    const estimatedRowCount = rowCountStr.toLowerCase() === 'unknown'
        ? 5000 // Assume large if unknown
        : parseInt(rowCountStr, 10) || 0;
    requirements.estimatedRowCount = estimatedRowCount;

    // Question 6: Complete data requirement
    console.log('\n6. Is it CRITICAL that you get 100% complete data (no truncation)?');
    const needsCompleteData = (await ask('   [y/n]: ')).toLowerCase() === 'y';
    requirements.needsCompleteData = needsCompleteData;

    // Question 7: Export
    console.log('\n7. Will this report primarily be used for data export?');
    const needsExport = (await ask('   [y/n]: ')).toLowerCase() === 'y';
    requirements.needsExport = needsExport;

    rl.close();

    // Analyze and display results
    console.log('\n' + '='.repeat(60));
    console.log('                    RECOMMENDATION');
    console.log('='.repeat(60) + '\n');

    const result = analyzeRequirements(requirements);

    console.log(`RECOMMENDED FORMAT: ${result.recommended}\n`);

    const formatInfo = REPORT_FORMATS[result.recommended];
    console.log(`Description: ${formatInfo.description}`);
    console.log(`Row Limit: ${formatInfo.rowLimit.toLocaleString()}`);

    if (formatInfo.rowLimitWarning) {
        console.log(`\n⚠️  ${formatInfo.rowLimitWarning}`);
    }

    // Show all recommendations with scores
    console.log('\n--- All Options Ranked ---\n');
    for (const rec of result.recommendations) {
        console.log(`${rec.format} (Score: ${rec.score})`);
        console.log(`  Reason: ${rec.reason}`);
        if (rec.note) {
            console.log(`  Note: ${rec.note}`);
        }
        console.log('');
    }

    // Show warnings
    if (result.warnings.length > 0) {
        console.log('--- WARNINGS ---\n');
        for (const warning of result.warnings) {
            console.log(`🔴 ${warning.message}`);
            console.log(`   → ${warning.suggestion}\n`);
        }
    }

    // Show format details
    console.log('\n--- Format Details ---\n');
    console.log(`Use Cases for ${result.recommended}:`);
    for (const useCase of formatInfo.useCases) {
        console.log(`  • ${useCase}`);
    }

    if (formatInfo.restrictions) {
        console.log(`\nRestrictions:`);
        for (const restriction of formatInfo.restrictions) {
            console.log(`  ⚠️ ${restriction}`);
        }
    }

    console.log('\n' + '='.repeat(60) + '\n');

    return result;
}

/**
 * Estimate row count from org data
 * @param {string} orgAlias Salesforce org alias
 * @param {string} objectName Object to query
 * @param {Array} filters Optional filters
 * @returns {Promise<Object>} Row count estimate
 */
async function estimateRowCount(orgAlias, objectName, filters = []) {
    console.log(`\nEstimating row count for ${objectName}...\n`);

    let query = `SELECT COUNT() FROM ${objectName}`;

    if (filters.length > 0) {
        const whereClause = filters.map(f =>
            `${f.field} ${f.operator} '${f.value}'`
        ).join(' AND ');
        query += ` WHERE ${whereClause}`;
    }

    try {
        const result = JSON.parse(execSync(
            `sf data query --query "${query}" --target-org ${orgAlias} --json`,
            { encoding: 'utf-8' }
        ));

        const count = result.result.totalSize;

        console.log(`Total rows: ${count.toLocaleString()}`);

        // Provide recommendations based on count
        const recommendations = [];

        if (count <= 2000) {
            recommendations.push('✅ Safe for SUMMARY or MATRIX format');
        } else if (count <= 10000) {
            recommendations.push('⚠️ Exceeds SUMMARY/MATRIX limit (2,000)');
            recommendations.push('   → Add filters to reduce below 2,000');
            recommendations.push('   → Or use TABULAR format for complete data');
        } else if (count <= 50000) {
            recommendations.push('⚠️ Large dataset - use TABULAR format only');
            recommendations.push('   → SUMMARY/MATRIX will truncate to 2,000 rows');
        } else {
            recommendations.push('🔴 Very large dataset - exceeds TABULAR limit too');
            recommendations.push('   → Must add filters to reduce data');
            recommendations.push('   → Consider async report execution');
        }

        for (const rec of recommendations) {
            console.log(rec);
        }

        return {
            object: objectName,
            count,
            recommendations,
            safeForSummary: count <= 2000,
            safeForTabular: count <= 50000
        };
    } catch (error) {
        console.error(`Error estimating row count: ${error.message}`);
        return null;
    }
}

/**
 * Get format comparison table
 * @returns {string} Formatted comparison table
 */
function getComparisonTable() {
    const headers = ['Feature', 'TABULAR', 'SUMMARY', 'MATRIX', 'JOINED'];
    const rows = [
        ['Row Limit', '50,000', '2,000 ⚠️', '2,000 ⚠️', '2,000/block'],
        ['Row Groupings', '❌', '✅ (max 3)', '✅ (max 3)', '✅ (max 3)'],
        ['Column Groupings', '❌', '❌', '✅ (max 2)', '❌'],
        ['Aggregates', '❌', '✅', '✅', '✅'],
        ['Subtotals', '❌', '✅', '✅', '✅'],
        ['Cross-Block Formulas', '❌', '❌', '❌', '✅'],
        ['Multiple Data Sources', '❌', '❌', '❌', '✅'],
        ['REST API Create', '✅', '✅', '✅', '❌'],
        ['Best For', 'Export/Lists', 'Grouped Data', 'Pivot Tables', 'Comparisons']
    ];

    // Calculate column widths
    const colWidths = headers.map((h, i) =>
        Math.max(h.length, ...rows.map(r => r[i].length))
    );

    // Build table
    let table = '\n';

    // Header
    table += '┌' + colWidths.map(w => '─'.repeat(w + 2)).join('┬') + '┐\n';
    table += '│' + headers.map((h, i) => ` ${h.padEnd(colWidths[i])} `).join('│') + '│\n';
    table += '├' + colWidths.map(w => '─'.repeat(w + 2)).join('┼') + '┤\n';

    // Data rows
    for (const row of rows) {
        table += '│' + row.map((cell, i) => ` ${cell.padEnd(colWidths[i])} `).join('│') + '│\n';
    }

    // Footer
    table += '└' + colWidths.map(w => '─'.repeat(w + 2)).join('┴') + '┘\n';

    return table;
}

// ============================================================================
// CLI
// ============================================================================

function printUsage() {
    console.log(`
Report Format Selector
======================

Helps select the appropriate Salesforce report format.

Usage:
  node report-format-selector.js --interactive
    Interactive wizard to determine best format

  node report-format-selector.js --analyze <json-file>
    Analyze requirements from JSON file

  node report-format-selector.js --estimate <org-alias> <object>
    Estimate row count for an object

  node report-format-selector.js --compare
    Show format comparison table

  node report-format-selector.js --info <format>
    Show detailed info about a format

Examples:
  node report-format-selector.js --interactive
  node report-format-selector.js --estimate sandbox Account
  node report-format-selector.js --info SUMMARY
  node report-format-selector.js --compare

Documentation:
  See: ../docs/runbooks/report-api-development/01-report-formats-fundamentals.md
`);
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args[0] === '--help') {
        printUsage();
        return;
    }

    const command = args[0];

    switch (command) {
        case '--interactive':
        case '-i':
            await interactiveWizard();
            break;

        case '--analyze':
            if (!args[1]) {
                console.error('Error: Please provide requirements JSON file');
                process.exit(1);
            }
            const requirements = JSON.parse(fs.readFileSync(args[1], 'utf-8'));
            const result = analyzeRequirements(requirements);
            console.log(JSON.stringify(result, null, 2));
            break;

        case '--estimate':
            if (!args[1] || !args[2]) {
                console.error('Error: Please provide org alias and object name');
                process.exit(1);
            }
            await estimateRowCount(args[1], args[2]);
            break;

        case '--compare':
            console.log(getComparisonTable());
            break;

        case '--info':
            if (!args[1]) {
                console.error('Error: Please provide format name (TABULAR, SUMMARY, MATRIX, JOINED)');
                process.exit(1);
            }
            const formatName = args[1].toUpperCase();
            const format = REPORT_FORMATS[formatName];
            if (!format) {
                console.error(`Unknown format: ${formatName}`);
                process.exit(1);
            }
            console.log(JSON.stringify(format, null, 2));
            break;

        default:
            console.error(`Unknown command: ${command}`);
            printUsage();
            process.exit(1);
    }
}

// Export for programmatic use
module.exports = {
    REPORT_FORMATS,
    analyzeRequirements,
    estimateRowCount,
    getComparisonTable
};

// Run if called directly
if (require.main === module) {
    main().catch(err => {
        console.error(err);
        process.exit(1);
    });
}
