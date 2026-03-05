#!/usr/bin/env node

/**
 * User Expectation Tracker
 *
 * Tracks user preferences, corrections, and validation expectations across sessions.
 * Learns from user feedback to improve future outputs and prevent recurring issues.
 *
 * Features:
 * - Track user corrections (what was wrong, what was expected)
 * - Learn formatting preferences (date formats, naming conventions)
 * - Store validation requirements (required fields, quality standards)
 * - Cross-session persistence (SQLite database)
 * - Auto-validate against learned patterns
 *
 * Usage:
 *   const tracker = new UserExpectationTracker({ dbPath: './expectations.db' });
 *   await tracker.recordCorrection('cpq-assessment', 'date-format', 'Used MM/DD/YYYY, expected YYYY-MM-DD');
 *   const violations = await tracker.validate(output, 'cpq-assessment');
 *
 * Example Learning:
 *   User corrects: "Use snake_case for property names, not camelCase"
 *   Future validation: Check property naming convention
 *
 * @module user-expectation-tracker
 * @version 1.0.0
 * @created 2025-10-26
 * @addresses Reflection Cohort - User Preference Violations ($36k annual ROI)
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

class UserExpectationTracker {
    constructor(options = {}) {
        this.dbPath = options.dbPath || path.join(process.cwd(), '.claude', 'user-expectations.db');
        this.verbose = options.verbose || false;
        this.userEmail = options.userEmail || process.env.USER_EMAIL || 'unknown';

        this.db = null;

        // Ensure database directory exists
        const dbDir = path.dirname(this.dbPath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }

        this.stats = {
            totalCorrections: 0,
            totalValidations: 0,
            violationsFound: 0,
            categoriesByType: {}
        };
    }

    /**
     * Initialize database connection and create tables
     */
    async initialize() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    return reject(err);
                }

                // Create tables
                this.db.serialize(() => {
                    // Corrections table: Track user corrections
                    this.db.run(`
                        CREATE TABLE IF NOT EXISTS corrections (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            user_email TEXT NOT NULL,
                            context TEXT NOT NULL,
                            category TEXT NOT NULL,
                            what_was_wrong TEXT NOT NULL,
                            what_was_expected TEXT NOT NULL,
                            correction_type TEXT,
                            severity TEXT DEFAULT 'medium',
                            pattern TEXT,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                        )
                    `, (err) => {
                        if (err) return reject(err);
                    });

                    // Preferences table: Track user preferences
                    this.db.run(`
                        CREATE TABLE IF NOT EXISTS preferences (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            user_email TEXT NOT NULL,
                            context TEXT NOT NULL,
                            preference_key TEXT NOT NULL,
                            preference_value TEXT NOT NULL,
                            description TEXT,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            UNIQUE(user_email, context, preference_key)
                        )
                    `, (err) => {
                        if (err) return reject(err);
                    });

                    // Validation rules table: Learned validation rules
                    this.db.run(`
                        CREATE TABLE IF NOT EXISTS validation_rules (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            user_email TEXT NOT NULL,
                            context TEXT NOT NULL,
                            rule_type TEXT NOT NULL,
                            rule_pattern TEXT NOT NULL,
                            rule_description TEXT,
                            severity TEXT DEFAULT 'warning',
                            times_violated INTEGER DEFAULT 0,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            last_violated_at DATETIME
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
     * Record user correction
     *
     * @param {string} context - Context (e.g., 'cpq-assessment', 'revops-audit')
     * @param {string} category - Category (e.g., 'date-format', 'naming-convention')
     * @param {string} whatWasWrong - Description of what was wrong
     * @param {string} whatWasExpected - Description of what was expected
     * @param {Object} options - Additional options
     * @returns {Promise<number>} Correction ID
     */
    async recordCorrection(context, category, whatWasWrong, whatWasExpected, options = {}) {
        if (!this.db) {
            await this.initialize();
        }

        const {
            correctionType = 'format',
            severity = 'medium',
            pattern = null
        } = options;

        return new Promise((resolve, reject) => {
            const self = this;
            this.db.run(`
                INSERT INTO corrections (user_email, context, category, what_was_wrong, what_was_expected, correction_type, severity, pattern)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [this.userEmail, context, category, whatWasWrong, whatWasExpected, correctionType, severity, pattern], function(err) {
                if (err) {
                    return reject(err);
                }

                self.stats.totalCorrections++;
                resolve(this.lastID);
            });
        });
    }

    /**
     * Set user preference
     *
     * @param {string} context - Context
     * @param {string} key - Preference key
     * @param {string} value - Preference value
     * @param {string} description - Description
     * @returns {Promise<void>}
     */
    async setPreference(context, key, value, description = null) {
        if (!this.db) {
            await this.initialize();
        }

        return new Promise((resolve, reject) => {
            this.db.run(`
                INSERT OR REPLACE INTO preferences (user_email, context, preference_key, preference_value, description, updated_at)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `, [this.userEmail, context, key, value, description], function(err) {
                if (err) {
                    return reject(err);
                }

                resolve();
            });
        });
    }

    /**
     * Get user preference
     *
     * @param {string} context - Context
     * @param {string} key - Preference key
     * @returns {Promise<string|null>} Preference value or null
     */
    async getPreference(context, key) {
        if (!this.db) {
            await this.initialize();
        }

        return new Promise((resolve, reject) => {
            this.db.get(`
                SELECT preference_value
                FROM preferences
                WHERE user_email = ? AND context = ? AND preference_key = ?
            `, [this.userEmail, context, key], (err, row) => {
                if (err) {
                    return reject(err);
                }

                resolve(row ? row.preference_value : null);
            });
        });
    }

    /**
     * Add validation rule
     *
     * @param {string} context - Context
     * @param {string} ruleType - Rule type (e.g., 'date-format', 'naming-convention')
     * @param {string} pattern - Validation pattern (regex or description)
     * @param {Object} options - Additional options
     * @returns {Promise<number>} Rule ID
     */
    async addValidationRule(context, ruleType, pattern, options = {}) {
        if (!this.db) {
            await this.initialize();
        }

        const {
            description = null,
            severity = 'warning'
        } = options;

        return new Promise((resolve, reject) => {
            this.db.run(`
                INSERT INTO validation_rules (user_email, context, rule_type, rule_pattern, rule_description, severity)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [this.userEmail, context, ruleType, pattern, description, severity], function(err) {
                if (err) {
                    return reject(err);
                }

                resolve(this.lastID);
            });
        });
    }

    /**
     * Get validation rules for context
     *
     * @param {string} context - Context
     * @returns {Promise<Array>} Validation rules
     */
    async getValidationRules(context) {
        if (!this.db) {
            await this.initialize();
        }

        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT *
                FROM validation_rules
                WHERE user_email = ? AND (context = ? OR context = 'global')
                ORDER BY severity DESC, created_at DESC
            `, [this.userEmail, context], (err, rows) => {
                if (err) {
                    return reject(err);
                }

                resolve(rows || []);
            });
        });
    }

    /**
     * Validate output against learned expectations
     *
     * @param {Object|string} output - Output to validate
     * @param {string} context - Context
     * @returns {Promise<Object>} Validation result
     */
    async validate(output, context) {
        if (!this.db) {
            await this.initialize();
        }

        this.stats.totalValidations++;

        const result = {
            valid: true,
            violations: [],
            warnings: [],
            context: context
        };

        // Get validation rules
        const rules = await this.getValidationRules(context);

        // Get recent corrections for this context
        const corrections = await this.getRecentCorrections(context, 20);

        // Convert output to string for pattern matching
        const outputStr = typeof output === 'string' ? output : JSON.stringify(output, null, 2);

        // Validate against rules
        for (const rule of rules) {
            const violation = await this.checkRule(rule, outputStr, output);

            if (violation) {
                // Update rule violation count
                await this.recordRuleViolation(rule.id);

                this.stats.violationsFound++;

                if (rule.severity === 'error') {
                    result.valid = false;
                    result.violations.push(violation);
                } else {
                    result.warnings.push(violation);
                }
            }
        }

        // Check for patterns from recent corrections
        for (const correction of corrections) {
            if (correction.pattern) {
                try {
                    const regex = new RegExp(correction.pattern, 'gi');
                    const matches = outputStr.match(regex);

                    if (matches && matches.length > 0) {
                        result.warnings.push({
                            type: 'LEARNED_PATTERN',
                            category: correction.category,
                            message: `Output matches previously corrected pattern: ${correction.category}`,
                            details: {
                                correction: correction.what_was_expected,
                                matches: matches.slice(0, 3)
                            },
                            suggestion: `Review: ${correction.what_was_expected}`
                        });
                    }
                } catch (e) {
                    // Invalid regex, skip
                }
            }
        }

        return result;
    }

    /**
     * Check validation rule
     *
     * @param {Object} rule - Validation rule
     * @param {string} outputStr - Output as string
     * @param {Object} output - Original output
     * @returns {Promise<Object|null>} Violation or null
     */
    async checkRule(rule, outputStr, output) {
        switch (rule.rule_type) {
            case 'date-format':
                return this.checkDateFormat(rule, outputStr, output);

            case 'naming-convention':
                return this.checkNamingConvention(rule, outputStr, output);

            case 'required-field':
                return this.checkRequiredField(rule, output);

            case 'format-pattern':
                return this.checkFormatPattern(rule, outputStr);

            case 'value-range':
                return this.checkValueRange(rule, output);

            default:
                // Generic pattern check
                return this.checkGenericPattern(rule, outputStr);
        }
    }

    /**
     * Check date format rule
     */
    async checkDateFormat(rule, outputStr, output) {
        // Extract pattern from rule (e.g., "YYYY-MM-DD")
        const expectedFormat = rule.rule_pattern;

        // Check for common wrong formats
        const wrongFormats = {
            'MM/DD/YYYY': /\d{2}\/\d{2}\/\d{4}/g,
            'DD/MM/YYYY': /\d{2}\/\d{2}\/\d{4}/g,
            'MM-DD-YYYY': /\d{2}-\d{2}-\d{4}/g
        };

        for (const [format, regex] of Object.entries(wrongFormats)) {
            if (format !== expectedFormat) {
                const matches = outputStr.match(regex);
                if (matches) {
                    return {
                        type: 'DATE_FORMAT_VIOLATION',
                        ruleId: rule.id,
                        message: `Date format should be ${expectedFormat}, found ${format}`,
                        severity: rule.severity,
                        details: {
                            expectedFormat,
                            foundFormat: format,
                            examples: matches.slice(0, 3)
                        },
                        suggestion: rule.rule_description || `Use ${expectedFormat} format for dates`
                    };
                }
            }
        }

        return null;
    }

    /**
     * Check naming convention rule
     */
    async checkNamingConvention(rule, outputStr, output) {
        const convention = rule.rule_pattern; // e.g., "snake_case", "camelCase"

        let wrongPattern = null;
        let wrongExample = null;

        if (convention === 'snake_case') {
            // Check for camelCase
            const camelCaseRegex = /[a-z]+[A-Z][a-z]+/g;
            const matches = outputStr.match(camelCaseRegex);
            if (matches) {
                wrongPattern = 'camelCase';
                wrongExample = matches[0];
            }
        } else if (convention === 'camelCase') {
            // Check for snake_case
            const snakeCaseRegex = /[a-z]+_[a-z]+/g;
            const matches = outputStr.match(snakeCaseRegex);
            if (matches) {
                wrongPattern = 'snake_case';
                wrongExample = matches[0];
            }
        }

        if (wrongPattern) {
            return {
                type: 'NAMING_CONVENTION_VIOLATION',
                ruleId: rule.id,
                message: `Naming should use ${convention}, found ${wrongPattern}`,
                severity: rule.severity,
                details: {
                    expectedConvention: convention,
                    foundConvention: wrongPattern,
                    example: wrongExample
                },
                suggestion: rule.rule_description || `Use ${convention} for naming`
            };
        }

        return null;
    }

    /**
     * Check required field rule
     */
    async checkRequiredField(rule, output) {
        if (typeof output !== 'object') {
            return null;
        }

        const requiredField = rule.rule_pattern;

        if (!output[requiredField] && output[requiredField] !== 0 && output[requiredField] !== false) {
            return {
                type: 'REQUIRED_FIELD_MISSING',
                ruleId: rule.id,
                message: `Required field missing: ${requiredField}`,
                severity: rule.severity,
                details: {
                    field: requiredField
                },
                suggestion: rule.rule_description || `Add required field: ${requiredField}`
            };
        }

        return null;
    }

    /**
     * Check format pattern rule
     */
    async checkFormatPattern(rule, outputStr) {
        try {
            const regex = new RegExp(rule.rule_pattern, 'g');
            const matches = outputStr.match(regex);

            if (matches && matches.length > 0) {
                return {
                    type: 'FORMAT_PATTERN_VIOLATION',
                    ruleId: rule.id,
                    message: `Output matches disallowed pattern: ${rule.rule_type}`,
                    severity: rule.severity,
                    details: {
                        pattern: rule.rule_pattern,
                        matches: matches.slice(0, 3)
                    },
                    suggestion: rule.rule_description || 'Review pattern violations'
                };
            }
        } catch (e) {
            // Invalid regex
        }

        return null;
    }

    /**
     * Check value range rule
     */
    async checkValueRange(rule, output) {
        // Pattern: "field:min:max" (e.g., "score:0:100")
        const parts = rule.rule_pattern.split(':');
        if (parts.length !== 3) {
            return null;
        }

        const [field, min, max] = parts;
        const value = output[field];

        if (value !== undefined && value !== null) {
            const numValue = parseFloat(value);
            const numMin = parseFloat(min);
            const numMax = parseFloat(max);

            if (!isNaN(numValue) && !isNaN(numMin) && !isNaN(numMax)) {
                if (numValue < numMin || numValue > numMax) {
                    return {
                        type: 'VALUE_RANGE_VIOLATION',
                        ruleId: rule.id,
                        message: `Field ${field} value ${numValue} outside range [${numMin}, ${numMax}]`,
                        severity: rule.severity,
                        details: {
                            field,
                            value: numValue,
                            min: numMin,
                            max: numMax
                        },
                        suggestion: rule.rule_description || `Ensure ${field} is between ${numMin} and ${numMax}`
                    };
                }
            }
        }

        return null;
    }

    /**
     * Check generic pattern rule
     */
    async checkGenericPattern(rule, outputStr) {
        try {
            const regex = new RegExp(rule.rule_pattern, 'gi');
            const matches = outputStr.match(regex);

            if (matches && matches.length > 0) {
                return {
                    type: 'PATTERN_VIOLATION',
                    ruleId: rule.id,
                    message: `Output matches pattern: ${rule.rule_type}`,
                    severity: rule.severity,
                    details: {
                        pattern: rule.rule_pattern,
                        matches: matches.slice(0, 3)
                    },
                    suggestion: rule.rule_description || 'Review pattern violations'
                };
            }
        } catch (e) {
            // Invalid regex
        }

        return null;
    }

    /**
     * Record rule violation
     */
    async recordRuleViolation(ruleId) {
        return new Promise((resolve, reject) => {
            this.db.run(`
                UPDATE validation_rules
                SET times_violated = times_violated + 1,
                    last_violated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [ruleId], (err) => {
                if (err) {
                    return reject(err);
                }

                resolve();
            });
        });
    }

    /**
     * Get recent corrections for context
     *
     * @param {string} context - Context
     * @param {number} limit - Limit
     * @returns {Promise<Array>} Recent corrections
     */
    async getRecentCorrections(context, limit = 20) {
        if (!this.db) {
            await this.initialize();
        }

        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT *
                FROM corrections
                WHERE user_email = ? AND (context = ? OR context = 'global')
                ORDER BY created_at DESC
                LIMIT ?
            `, [this.userEmail, context, limit], (err, rows) => {
                if (err) {
                    return reject(err);
                }

                resolve(rows || []);
            });
        });
    }

    /**
     * Get correction summary
     *
     * @param {string} context - Context (optional)
     * @returns {Promise<Object>} Summary
     */
    async getCorrectionSummary(context = null) {
        if (!this.db) {
            await this.initialize();
        }

        return new Promise((resolve, reject) => {
            let query = `
                SELECT
                    category,
                    COUNT(*) as count,
                    MAX(created_at) as last_correction
                FROM corrections
                WHERE user_email = ?
            `;

            const params = [this.userEmail];

            if (context) {
                query += ' AND context = ?';
                params.push(context);
            }

            query += ' GROUP BY category ORDER BY count DESC';

            this.db.all(query, params, (err, rows) => {
                if (err) {
                    return reject(err);
                }

                resolve(rows || []);
            });
        });
    }

    /**
     * Get statistics
     */
    getStats() {
        return { ...this.stats };
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

module.exports = UserExpectationTracker;

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    const tracker = new UserExpectationTracker({ verbose: true });

    (async () => {
        try {
            await tracker.initialize();

            switch (command) {
                case 'add-correction':
                    // node user-expectation-tracker.js add-correction <context> <category> "<wrong>" "<expected>"
                    const [, context, category, wrong, expected] = args;
                    const id = await tracker.recordCorrection(context, category, wrong, expected);
                    console.log(`✅ Correction recorded (ID: ${id})`);
                    break;

                case 'add-rule':
                    // node user-expectation-tracker.js add-rule <context> <type> "<pattern>" "<description>"
                    const [, ctx, type, pattern, description] = args;
                    const ruleId = await tracker.addValidationRule(ctx, type, pattern, { description });
                    console.log(`✅ Validation rule added (ID: ${ruleId})`);
                    break;

                case 'summary':
                    // node user-expectation-tracker.js summary [context]
                    const summaryContext = args[1];
                    const summary = await tracker.getCorrectionSummary(summaryContext);
                    console.log('\n📊 Correction Summary:\n');
                    console.table(summary);
                    break;

                default:
                    console.log('Usage:');
                    console.log('  add-correction <context> <category> "<wrong>" "<expected>"');
                    console.log('  add-rule <context> <type> "<pattern>" "<description>"');
                    console.log('  summary [context]');
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
