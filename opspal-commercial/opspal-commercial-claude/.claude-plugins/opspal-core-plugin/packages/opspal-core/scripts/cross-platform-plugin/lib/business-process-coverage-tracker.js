#!/usr/bin/env node

/**
 * Business Process Coverage Tracker
 *
 * Tracks which business processes have been tested, validated, and covered
 * by automated tests, manual QA, or user acceptance testing.
 *
 * Features:
 * - Track coverage by process (Lead-to-Cash, Quote-to-Order, etc.)
 * - Identify untested business scenarios
 * - Generate coverage heatmaps
 * - Link tests to business processes
 * - Calculate coverage percentages
 *
 * Usage:
 *   const tracker = new BusinessProcessCoverageTracker({ dbPath: './coverage.db' });
 *   await tracker.recordCoverage('Lead-to-Cash', 'Lead Creation', 'automated', 'passed');
 *   const heatmap = await tracker.generateHeatmap('Lead-to-Cash');
 *
 * @module business-process-coverage-tracker
 * @version 1.0.0
 * @created 2025-10-26
 * @addresses Reflection Cohort - Business Process Test Gaps ($96k annual ROI)
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

class BusinessProcessCoverageTracker {
    constructor(options = {}) {
        this.dbPath = options.dbPath || path.join(process.cwd(), '.claude', 'process-coverage.db');
        this.verbose = options.verbose || false;

        this.db = null;

        // Ensure database directory exists
        const dbDir = path.dirname(this.dbPath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }

        // Common business processes
        this.processTemplates = {
            'Lead-to-Cash': [
                'Lead Creation', 'Lead Qualification', 'Lead Conversion',
                'Opportunity Creation', 'Quote Generation', 'Quote Approval',
                'Contract Creation', 'Order Fulfillment', 'Invoice Generation', 'Payment Collection'
            ],
            'Quote-to-Order': [
                'Quote Request', 'Quote Configuration', 'Pricing Calculation',
                'Discount Application', 'Quote Approval', 'Quote Acceptance',
                'Order Creation', 'Order Processing'
            ],
            'Customer Onboarding': [
                'Account Creation', 'Contact Creation', 'Contract Setup',
                'System Provisioning', 'User Training', 'Go-Live Support'
            ],
            'Renewal Management': [
                'Renewal Identification', 'Renewal Quoting', 'Renewal Negotiation',
                'Renewal Approval', 'Contract Renewal', 'Subscription Update'
            ],
            'Case Management': [
                'Case Creation', 'Case Assignment', 'Case Investigation',
                'Case Resolution', 'Case Closure', 'Feedback Collection'
            ]
        };

        this.stats = {
            totalProcesses: 0,
            coveredProcesses: 0,
            totalScenarios: 0,
            coveredScenarios: 0,
            coverageByType: {}
        };
    }

    /**
     * Initialize database
     */
    async initialize() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    return reject(err);
                }

                this.db.serialize(() => {
                    // Process definitions
                    this.db.run(`
                        CREATE TABLE IF NOT EXISTS business_processes (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            process_name TEXT NOT NULL,
                            scenario_name TEXT NOT NULL,
                            description TEXT,
                            criticality TEXT DEFAULT 'medium',
                            frequency TEXT DEFAULT 'monthly',
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            UNIQUE(process_name, scenario_name)
                        )
                    `, (err) => {
                        if (err) return reject(err);
                    });

                    // Coverage records
                    this.db.run(`
                        CREATE TABLE IF NOT EXISTS coverage_records (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            process_id INTEGER NOT NULL,
                            coverage_type TEXT NOT NULL,
                            test_name TEXT,
                            test_result TEXT,
                            coverage_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                            notes TEXT,
                            FOREIGN KEY (process_id) REFERENCES business_processes(id)
                        )
                    `, (err) => {
                        if (err) return reject(err);
                        resolve();
                    });
                });
            });
        });
    }

    /**
     * Record coverage for a business process scenario
     */
    async recordCoverage(processName, scenarioName, coverageType, testResult, options = {}) {
        if (!this.db) {
            await this.initialize();
        }

        const {
            testName = null,
            notes = null,
            description = null,
            criticality = 'medium',
            frequency = 'monthly'
        } = options;

        // Ensure process/scenario exists
        const processId = await this.ensureProcessExists(processName, scenarioName, {
            description,
            criticality,
            frequency
        });

        // Record coverage
        return new Promise((resolve, reject) => {
            this.db.run(`
                INSERT INTO coverage_records (process_id, coverage_type, test_name, test_result, notes)
                VALUES (?, ?, ?, ?, ?)
            `, [processId, coverageType, testName, testResult, notes], function(err) {
                if (err) {
                    return reject(err);
                }

                resolve(this.lastID);
            });
        });
    }

    /**
     * Ensure process/scenario exists in database
     */
    async ensureProcessExists(processName, scenarioName, options = {}) {
        return new Promise((resolve, reject) => {
            // Check if exists
            this.db.get(`
                SELECT id FROM business_processes
                WHERE process_name = ? AND scenario_name = ?
            `, [processName, scenarioName], (err, row) => {
                if (err) {
                    return reject(err);
                }

                if (row) {
                    return resolve(row.id);
                }

                // Insert if doesn't exist
                this.db.run(`
                    INSERT INTO business_processes (process_name, scenario_name, description, criticality, frequency)
                    VALUES (?, ?, ?, ?, ?)
                `, [processName, scenarioName, options.description, options.criticality, options.frequency], function(err) {
                    if (err) {
                        return reject(err);
                    }

                    resolve(this.lastID);
                });
            });
        });
    }

    /**
     * Generate coverage heatmap for a process
     */
    async generateHeatmap(processName = null) {
        if (!this.db) {
            await this.initialize();
        }

        let query = `
            SELECT
                bp.process_name,
                bp.scenario_name,
                bp.criticality,
                bp.frequency,
                COUNT(DISTINCT cr.coverage_type) as coverage_types,
                GROUP_CONCAT(DISTINCT cr.coverage_type) as covered_by,
                MAX(cr.coverage_date) as last_covered,
                SUM(CASE WHEN cr.test_result = 'passed' THEN 1 ELSE 0 END) as passed_tests,
                SUM(CASE WHEN cr.test_result = 'failed' THEN 1 ELSE 0 END) as failed_tests,
                COUNT(cr.id) as total_coverage_records
            FROM business_processes bp
            LEFT JOIN coverage_records cr ON bp.id = cr.process_id
        `;

        const params = [];

        if (processName) {
            query += ' WHERE bp.process_name = ?';
            params.push(processName);
        }

        query += ' GROUP BY bp.id, bp.process_name, bp.scenario_name';
        query += ' ORDER BY bp.process_name, bp.scenario_name';

        return new Promise((resolve, reject) => {
            this.db.all(query, params, (err, rows) => {
                if (err) {
                    return reject(err);
                }

                // Calculate coverage scores
                const heatmap = rows.map(row => ({
                    process: row.process_name,
                    scenario: row.scenario_name,
                    criticality: row.criticality,
                    frequency: row.frequency,
                    coverageScore: this.calculateCoverageScore(row),
                    coverageTypes: row.coverage_types || 0,
                    coveredBy: row.covered_by ? row.covered_by.split(',') : [],
                    lastCovered: row.last_covered,
                    passedTests: row.passed_tests || 0,
                    failedTests: row.failed_tests || 0,
                    totalRecords: row.total_coverage_records || 0,
                    status: this.determineCoverageStatus(row)
                }));

                resolve(heatmap);
            });
        });
    }

    /**
     * Calculate coverage score (0-100)
     */
    calculateCoverageScore(row) {
        const coverageTypes = row.coverage_types || 0;
        const passedTests = row.passed_tests || 0;
        const failedTests = row.failed_tests || 0;
        const totalTests = passedTests + failedTests;

        // Coverage type score (max 50 points)
        // 0 types = 0, 1 type = 25, 2 types = 40, 3+ types = 50
        let typeScore = 0;
        if (coverageTypes === 1) typeScore = 25;
        else if (coverageTypes === 2) typeScore = 40;
        else if (coverageTypes >= 3) typeScore = 50;

        // Test success score (max 50 points)
        let successScore = 0;
        if (totalTests > 0) {
            successScore = (passedTests / totalTests) * 50;
        }

        return Math.round(typeScore + successScore);
    }

    /**
     * Determine coverage status
     */
    determineCoverageStatus(row) {
        const coverageTypes = row.coverage_types || 0;
        const failedTests = row.failed_tests || 0;

        if (coverageTypes === 0) return 'untested';
        if (failedTests > 0) return 'failing';
        if (coverageTypes >= 3) return 'excellent';
        if (coverageTypes >= 2) return 'good';
        return 'minimal';
    }

    /**
     * Get coverage summary
     */
    async getCoverageSummary() {
        if (!this.db) {
            await this.initialize();
        }

        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT
                    bp.process_name,
                    COUNT(DISTINCT bp.id) as total_scenarios,
                    COUNT(DISTINCT CASE WHEN cr.id IS NOT NULL THEN bp.id END) as covered_scenarios,
                    COUNT(DISTINCT cr.coverage_type) as coverage_types_used,
                    AVG(CASE WHEN cr.test_result = 'passed' THEN 100 ELSE 0 END) as success_rate
                FROM business_processes bp
                LEFT JOIN coverage_records cr ON bp.id = cr.process_id
                GROUP BY bp.process_name
                ORDER BY covered_scenarios DESC, bp.process_name
            `, [], (err, rows) => {
                if (err) {
                    return reject(err);
                }

                const summary = rows.map(row => ({
                    process: row.process_name,
                    totalScenarios: row.total_scenarios,
                    coveredScenarios: row.covered_scenarios,
                    coveragePercent: row.total_scenarios > 0
                        ? Math.round((row.covered_scenarios / row.total_scenarios) * 100)
                        : 0,
                    successRate: Math.round(row.success_rate),
                    coverageTypes: row.coverage_types_used
                }));

                resolve(summary);
            });
        });
    }

    /**
     * Identify coverage gaps
     */
    async identifyGaps(options = {}) {
        const {
            minCoverageScore = 50,
            includeCriticality = null
        } = options;

        const heatmap = await this.generateHeatmap();

        const gaps = heatmap.filter(item => {
            // Filter by coverage score
            if (item.coverageScore < minCoverageScore) {
                // Filter by criticality if specified
                if (includeCriticality && item.criticality !== includeCriticality) {
                    return false;
                }
                return true;
            }
            return false;
        });

        // Sort by criticality and coverage score
        gaps.sort((a, b) => {
            const criticalityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
            const aCrit = criticalityOrder[a.criticality] || 4;
            const bCrit = criticalityOrder[b.criticality] || 4;

            if (aCrit !== bCrit) return aCrit - bCrit;
            return a.coverageScore - b.coverageScore;
        });

        return gaps;
    }

    /**
     * Initialize common business processes
     */
    async initializeCommonProcesses() {
        if (!this.db) {
            await this.initialize();
        }

        for (const [processName, scenarios] of Object.entries(this.processTemplates)) {
            for (const scenarioName of scenarios) {
                await this.ensureProcessExists(processName, scenarioName, {
                    criticality: 'medium',
                    frequency: 'monthly'
                });
            }
        }
    }

    /**
     * Get statistics
     */
    async getStats() {
        if (!this.db) {
            await this.initialize();
        }

        return new Promise((resolve, reject) => {
            this.db.get(`
                SELECT
                    COUNT(DISTINCT bp.process_name) as total_processes,
                    COUNT(DISTINCT bp.id) as total_scenarios,
                    COUNT(DISTINCT CASE WHEN cr.id IS NOT NULL THEN bp.id END) as covered_scenarios,
                    COUNT(cr.id) as total_coverage_records
                FROM business_processes bp
                LEFT JOIN coverage_records cr ON bp.id = cr.process_id
            `, [], (err, row) => {
                if (err) {
                    return reject(err);
                }

                const coveragePercent = row.total_scenarios > 0
                    ? Math.round((row.covered_scenarios / row.total_scenarios) * 100)
                    : 0;

                resolve({
                    totalProcesses: row.total_processes,
                    totalScenarios: row.total_scenarios,
                    coveredScenarios: row.covered_scenarios,
                    uncoveredScenarios: row.total_scenarios - row.covered_scenarios,
                    coveragePercent,
                    totalCoverageRecords: row.total_coverage_records
                });
            });
        });
    }

    /**
     * Close database connection
     */
    async close() {
        if (this.db) {
            return new Promise((resolve, reject) => {
                this.db.close((err) => {
                    if (err) {
                        return reject(err);
                    }

                    resolve();
                });
            });
        }
    }
}

module.exports = BusinessProcessCoverageTracker;

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    const tracker = new BusinessProcessCoverageTracker({ verbose: true });

    (async () => {
        try {
            await tracker.initialize();

            switch (command) {
                case 'record':
                    // node business-process-coverage-tracker.js record <process> <scenario> <type> <result>
                    const [, processName, scenarioName, coverageType, testResult] = args;
                    await tracker.recordCoverage(processName, scenarioName, coverageType, testResult);
                    console.log('✅ Coverage recorded');
                    break;

                case 'heatmap':
                    // node business-process-coverage-tracker.js heatmap [process]
                    const heatmapProcess = args[1];
                    const heatmap = await tracker.generateHeatmap(heatmapProcess);
                    console.log('\n📊 Coverage Heatmap:\n');
                    console.table(heatmap);
                    break;

                case 'summary':
                    // node business-process-coverage-tracker.js summary
                    const summary = await tracker.getCoverageSummary();
                    console.log('\n📈 Coverage Summary:\n');
                    console.table(summary);
                    break;

                case 'gaps':
                    // node business-process-coverage-tracker.js gaps
                    const gaps = await tracker.identifyGaps({ minCoverageScore: 50 });
                    console.log('\n🔍 Coverage Gaps:\n');
                    console.table(gaps);
                    break;

                case 'init':
                    // node business-process-coverage-tracker.js init
                    await tracker.initializeCommonProcesses();
                    console.log('✅ Common business processes initialized');
                    break;

                case 'stats':
                    // node business-process-coverage-tracker.js stats
                    const stats = await tracker.getStats();
                    console.log('\n📊 Statistics:\n');
                    console.log(JSON.stringify(stats, null, 2));
                    break;

                default:
                    console.log('Usage:');
                    console.log('  record <process> <scenario> <type> <result>');
                    console.log('  heatmap [process]');
                    console.log('  summary');
                    console.log('  gaps');
                    console.log('  init');
                    console.log('  stats');
                    process.exit(1);
            }

            await tracker.close();
            process.exit(0);

        } catch (error) {
            console.error('❌ Error:', error.message);
            console.error(error.stack);
            await tracker.close();
            process.exit(1);
        }
    })();
}
