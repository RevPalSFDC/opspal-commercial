#!/usr/bin/env node

/**
 * Salesforce CLI Command Auto-Corrector
 *
 * Automatically corrects common Salesforce CLI command errors before execution.
 *
 * Correction Rules:
 * 1. INVALID_FIELD - ApiName → DeveloperName on FlowVersionView
 * 2. INVALID_FIELD - Name → QualifiedApiName on FieldDefinition
 * 3. MALFORMED_QUERY - Mixed LIKE/= operators → Consistent operators
 * 4. INVALID_TYPE - Missing --use-tooling-api → Add flag
 * 5. LINE_ENDING_ISSUE - CRLF → LF in CSV files
 *
 * Usage:
 *   const corrector = new SFCommandAutoCorrector();
 *   const result = await corrector.correct(parsedCommand, errors);
 *   if (result.success) {
 *     execSync(result.correctedCommand);
 *   }
 *
 * @module sf-command-auto-corrector
 * @version 1.0.0
 * @created 2025-10-24
 */

const fs = require('fs');
const path = require('path');

/**
 * Auto-corrector class
 */
class SFCommandAutoCorrector {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.stats = {
            totalCorrections: 0,
            byType: {}
        };
    }

    /**
     * Correct errors in command
     *
     * @param {Object} parsed - Parsed command object
     * @param {Array} errors - Array of error objects
     * @returns {Promise<Object>} Correction result
     */
    async correct(parsed, errors) {
        const result = {
            success: false,
            correctedCommand: parsed.original,
            corrections: [],
            unfixableErrors: []
        };

        if (errors.length === 0) {
            result.success = true;
            return result;
        }

        let currentCommand = parsed.original;

        // Apply corrections for each error
        for (const error of errors) {
            if (!error.autoFixable) {
                result.unfixableErrors.push(error);
                continue;
            }

            try {
                const correction = await this.correctError(error, currentCommand, parsed);

                if (correction.success) {
                    currentCommand = correction.correctedCommand;
                    result.corrections.push({
                        errorType: error.type,
                        description: correction.description,
                        before: parsed.original,
                        after: correction.correctedCommand
                    });

                    // Update statistics
                    this.stats.totalCorrections++;
                    this.stats.byType[error.type] = (this.stats.byType[error.type] || 0) + 1;

                    if (this.verbose) {
                        console.log(`✅ Corrected ${error.type}: ${correction.description}`);
                    }
                } else {
                    result.unfixableErrors.push(error);
                }
            } catch (err) {
                if (this.verbose) {
                    console.warn(`❌ Failed to correct ${error.type}:`, err.message);
                }
                result.unfixableErrors.push(error);
            }
        }

        result.correctedCommand = currentCommand;
        result.success = result.unfixableErrors.length === 0;

        return result;
    }

    /**
     * Correct a single error
     *
     * @param {Object} error - Error object
     * @param {string} command - Current command string
     * @param {Object} parsed - Parsed command object
     * @returns {Promise<Object>} Correction result
     */
    async correctError(error, command, parsed) {
        switch (error.type) {
            case 'INVALID_FIELD':
                return this.correctInvalidField(error, command, parsed);

            case 'MALFORMED_QUERY':
                return this.correctMalformedQuery(error, command, parsed);

            case 'INVALID_TYPE':
                return this.correctInvalidType(error, command, parsed);

            case 'LINE_ENDING_ISSUE':
                return this.correctLineEndings(error, command, parsed);

            default:
                return {
                    success: false,
                    message: `No correction rule for ${error.type}`
                };
        }
    }

    /**
     * Correct INVALID_FIELD errors
     *
     * @param {Object} error - Error object
     * @param {string} command - Command string
     * @param {Object} parsed - Parsed command
     * @returns {Object} Correction result
     */
    correctInvalidField(error, command, parsed) {
        // Rule 1: ApiName → DeveloperName on FlowVersionView
        if (error.field === 'ApiName' && error.object === 'FlowVersionView') {
            const correctedQuery = parsed.query.replace(/\bApiName\b/g, 'DeveloperName');
            const correctedCommand = command.replace(parsed.query, correctedQuery);

            return {
                success: true,
                correctedCommand,
                description: 'Changed ApiName to DeveloperName on FlowVersionView'
            };
        }

        // Rule 2: Name → QualifiedApiName on FieldDefinition
        if (error.field === 'Name' && error.object === 'FieldDefinition') {
            // More complex: need to handle SELECT Name or SELECT ..., Name, ...
            const correctedQuery = parsed.query
                .replace(/SELECT\s+Name\s+FROM/i, 'SELECT QualifiedApiName, Label FROM')
                .replace(/SELECT\s+([^,]+,\s*)*Name(\s*,|FROM)/i, (match) => {
                    return match.replace(/\bName\b/, 'QualifiedApiName, Label');
                });

            const correctedCommand = command.replace(parsed.query, correctedQuery);

            return {
                success: true,
                correctedCommand,
                description: 'Changed Name to QualifiedApiName, Label on FieldDefinition'
            };
        }

        return {
            success: false,
            message: `No correction rule for field ${error.field} on ${error.object}`
        };
    }

    /**
     * Correct MALFORMED_QUERY errors (mixed operators)
     *
     * @param {Object} error - Error object
     * @param {string} command - Command string
     * @param {Object} parsed - Parsed command
     * @returns {Object} Correction result
     */
    correctMalformedQuery(error, command, parsed) {
        // Strategy: Convert all OR conditions to use LIKE operator
        // This is the most flexible solution (LIKE works for exact matches too)

        // Extract WHERE clause
        const whereMatch = parsed.query.match(/WHERE\s+(.*?)(?:ORDER BY|GROUP BY|LIMIT|$)/i);
        if (!whereMatch) {
            return {
                success: false,
                message: 'Could not extract WHERE clause'
            };
        }

        let whereClause = whereMatch[1];

        // Convert = to LIKE for consistency in OR chains
        // Pattern: field = 'value' OR ... LIKE ...
        // Solution: field LIKE 'value' OR ... LIKE ...

        // Split by OR
        const orParts = whereClause.split(/\s+OR\s+/i);

        // Check if we have both = and LIKE
        const hasEquals = orParts.some(part => /\s=\s*'/.test(part));
        const hasLike = orParts.some(part => /\sLIKE\s+'/i.test(part));

        if (hasEquals && hasLike) {
            // Convert all = to LIKE
            const correctedParts = orParts.map(part => {
                // Replace field = 'value' with field LIKE 'value'
                return part.replace(/(\w+)\s*=\s*'([^']+)'/g, "$1 LIKE '$2'");
            });

            const correctedWhereClause = correctedParts.join(' OR ');
            const correctedQuery = parsed.query.replace(whereClause, correctedWhereClause);
            const correctedCommand = command.replace(parsed.query, correctedQuery);

            return {
                success: true,
                correctedCommand,
                description: 'Changed = operators to LIKE for consistency in OR conditions'
            };
        }

        return {
            success: false,
            message: 'No mixed operators found to correct'
        };
    }

    /**
     * Correct INVALID_TYPE errors (missing Tooling API flag)
     *
     * @param {Object} error - Error object
     * @param {string} command - Command string
     * @param {Object} parsed - Parsed command
     * @returns {Object} Correction result
     */
    correctInvalidType(error, command, parsed) {
        // Add --use-tooling-api flag if not present
        if (command.includes('--use-tooling-api')) {
            return {
                success: false,
                message: '--use-tooling-api already present'
            };
        }

        // Insert before --json if present, otherwise at end
        let correctedCommand;
        if (command.includes('--json')) {
            correctedCommand = command.replace('--json', '--use-tooling-api --json');
        } else if (command.includes('--target-org')) {
            // Insert after --target-org value
            correctedCommand = command.replace(/(--target-org\s+\S+)/, '$1 --use-tooling-api');
        } else {
            // Append to end
            correctedCommand = command.trim() + ' --use-tooling-api';
        }

        return {
            success: true,
            correctedCommand,
            description: 'Added --use-tooling-api flag for Tooling API object'
        };
    }

    /**
     * Correct LINE_ENDING_ISSUE errors (CSV CRLF → LF)
     *
     * @param {Object} error - Error object
     * @param {string} command - Command string
     * @param {Object} parsed - Parsed command
     * @returns {Promise<Object>} Correction result
     */
    async correctLineEndings(error, command, parsed) {
        const csvFile = error.path;

        if (!csvFile || !fs.existsSync(csvFile)) {
            return {
                success: false,
                message: 'CSV file not found'
            };
        }

        try {
            // Read file
            const content = fs.readFileSync(csvFile, 'utf8');

            // Convert CRLF to LF
            const correctedContent = content.replace(/\r\n/g, '\n');

            // Write back (create backup first)
            const backupPath = csvFile + '.bak';
            fs.copyFileSync(csvFile, backupPath);
            fs.writeFileSync(csvFile, correctedContent, 'utf8');

            if (this.verbose) {
                console.log(`📝 Backup created: ${backupPath}`);
            }

            return {
                success: true,
                correctedCommand: command, // Command unchanged, file fixed
                description: `Converted CSV line endings from CRLF to LF (backup: ${backupPath})`
            };
        } catch (err) {
            return {
                success: false,
                message: `Failed to correct line endings: ${err.message}`
            };
        }
    }

    /**
     * Get correction statistics
     *
     * @returns {Object} Statistics
     */
    getStats() {
        return { ...this.stats };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            totalCorrections: 0,
            byType: {}
        };
    }
}

// ============================================================================
// CLI Interface
// ============================================================================

if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        console.log(`
Salesforce CLI Command Auto-Corrector

Usage:
  node sf-command-auto-corrector.js test <error-type>
  node sf-command-auto-corrector.js stats

Test Examples:
  # Test ApiName correction
  node sf-command-auto-corrector.js test invalid-field

  # Test operator consistency
  node sf-command-auto-corrector.js test malformed-query

  # Test Tooling API flag
  node sf-command-auto-corrector.js test invalid-type

  # Show statistics
  node sf-command-auto-corrector.js stats
        `);
        process.exit(0);
    }

    const command = args[0];
    const corrector = new SFCommandAutoCorrector({ verbose: true });

    (async () => {
        if (command === 'test') {
            const errorType = args[1];

            // Test data
            const tests = {
                'invalid-field': {
                    parsed: {
                        original: 'sf data query --query "SELECT ApiName FROM FlowVersionView" --json',
                        query: 'SELECT ApiName FROM FlowVersionView'
                    },
                    errors: [{
                        type: 'INVALID_FIELD',
                        field: 'ApiName',
                        object: 'FlowVersionView',
                        autoFixable: true
                    }]
                },
                'malformed-query': {
                    parsed: {
                        original: 'sf data query --query "SELECT Id FROM Opportunity WHERE Type = \'Renewal\' OR Type LIKE \'%Amend%\'" --json',
                        query: 'SELECT Id FROM Opportunity WHERE Type = \'Renewal\' OR Type LIKE \'%Amend%\''
                    },
                    errors: [{
                        type: 'MALFORMED_QUERY',
                        autoFixable: true
                    }]
                },
                'invalid-type': {
                    parsed: {
                        original: 'sf data query --query "SELECT ApiName FROM FlowDefinitionView" --target-org my-org --json',
                        query: 'SELECT ApiName FROM FlowDefinitionView'
                    },
                    errors: [{
                        type: 'INVALID_TYPE',
                        autoFixable: true
                    }]
                }
            };

            const testData = tests[errorType];
            if (!testData) {
                console.error(`Unknown error type: ${errorType}`);
                console.error(`Available types: ${Object.keys(tests).join(', ')}`);
                process.exit(1);
            }

            console.log('\n📝 Testing Auto-Correction\n');
            console.log(`Error Type: ${errorType}`);
            console.log(`Original: ${testData.parsed.original}`);

            const result = await corrector.correct(testData.parsed, testData.errors);

            console.log(`\n✅ Correction Result:`);
            console.log(`Success: ${result.success}`);
            console.log(`Corrected: ${result.correctedCommand}`);
            console.log(`Corrections Applied: ${result.corrections.length}`);

            if (result.corrections.length > 0) {
                console.log(`\nDetails:`);
                result.corrections.forEach((corr, idx) => {
                    console.log(`  ${idx + 1}. ${corr.description}`);
                });
            }

            if (result.unfixableErrors.length > 0) {
                console.log(`\n❌ Unfixable Errors: ${result.unfixableErrors.length}`);
            }

        } else if (command === 'stats') {
            const stats = corrector.getStats();
            console.log('\n📊 Auto-Correction Statistics:\n');
            console.log(`Total Corrections: ${stats.totalCorrections}`);
            console.log(`\nBy Type:`);
            Object.entries(stats.byType).forEach(([type, count]) => {
                console.log(`  ${type}: ${count}`);
            });
        } else {
            console.error(`Unknown command: ${command}`);
            process.exit(1);
        }

        process.exit(0);
    })();
}

module.exports = SFCommandAutoCorrector;
