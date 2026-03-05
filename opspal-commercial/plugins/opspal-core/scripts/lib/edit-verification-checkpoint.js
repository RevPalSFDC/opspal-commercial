#!/usr/bin/env node

/**
 * Edit Verification Checkpoint
 *
 * Verifies multi-file edit operations to ensure completeness before claiming success.
 * Addresses data-quality cohort (12 reflections, $18K ROI) where incomplete edits occurred.
 *
 * Usage:
 *   const { EditVerificationCheckpoint } = require('./edit-verification-checkpoint');
 *
 *   const verifier = new EditVerificationCheckpoint();
 *   const result = await verifier.verifyMultiFileEdit({
 *     searchPattern: 'Van Metre',
 *     replacementPattern: 'NewClient',
 *     files: ['/path/to/file1.js', '/path/to/file2.md'],
 *     expectedOccurrences: 15
 *   });
 *
 * @module edit-verification-checkpoint
 * @version 1.0.0
 * @created 2025-11-10
 * @addresses Cohort #3 - Data Quality Issues ($18k ROI)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class EditVerificationCheckpoint {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.stopOnIncomplete = options.stopOnIncomplete !== false; // Default: true

        this.stats = {
            totalVerifications: 0,
            completeEdits: 0,
            incompleteEdits: 0,
            averageCompletionRate: 0
        };
    }

    /**
     * Verify multi-file edit operation
     *
     * @param {Object} editContext - Edit operation context
     * @param {string} editContext.searchPattern - What was searched for
     * @param {string} editContext.replacementPattern - What was replaced with
     * @param {string[]} editContext.files - Files that were edited
     * @param {number} [editContext.expectedOccurrences] - Expected number of replacements
     * @param {boolean} [editContext.strictMode] - Fail if ANY occurrence missed
     * @returns {Promise<Object>} Verification result
     */
    async verifyMultiFileEdit(editContext) {
        this.stats.totalVerifications++;

        const result = {
            complete: false,
            timestamp: new Date().toISOString(),
            searchPattern: editContext.searchPattern,
            replacementPattern: editContext.replacementPattern,
            filesEdited: editContext.files || [],
            filesAnalyzed: 0,
            occurrencesFound: 0,
            occurrencesExpected: editContext.expectedOccurrences,
            missingOccurrences: [],
            completionRate: 0,
            message: '',
            recommendations: []
        };

        if (this.verbose) {
            console.log(`\n🔍 [Edit Verifier] Verifying multi-file edit...`);
            console.log(`   Pattern: "${editContext.searchPattern}" → "${editContext.replacementPattern}"`);
            console.log(`   Files edited: ${result.filesEdited.length}`);
            if (result.occurrencesExpected) {
                console.log(`   Expected occurrences: ${result.occurrencesExpected}`);
            }
        }

        // Step 1: Scan edited files for remaining old pattern
        const scanResults = await this.scanForPattern(
            editContext.searchPattern,
            editContext.files
        );

        result.occurrencesFound = scanResults.totalOccurrences;
        result.missingOccurrences = scanResults.occurrences;
        result.filesAnalyzed = scanResults.filesScanned;

        // Step 2: Calculate completion rate
        if (result.occurrencesExpected) {
            const replacedCount = result.occurrencesExpected - result.occurrencesFound;
            result.completionRate = (replacedCount / result.occurrencesExpected) * 100;
        } else {
            // If no expected count, check if zero occurrences remain
            result.completionRate = result.occurrencesFound === 0 ? 100 : 0;
        }

        // Step 3: Determine if edit is complete
        if (editContext.strictMode) {
            // Strict mode: Must have ZERO remaining occurrences
            result.complete = result.occurrencesFound === 0;
        } else {
            // Lenient mode: >= 90% completion rate
            result.complete = result.completionRate >= 90;
        }

        // Step 4: Generate message and recommendations
        if (result.complete) {
            result.message = `✅ Edit verification passed - ${result.completionRate.toFixed(1)}% complete`;
            this.stats.completeEdits++;
        } else {
            result.message = `❌ Edit verification failed - ${result.completionRate.toFixed(1)}% complete (${result.occurrencesFound} occurrences remain)`;
            result.recommendations = this.generateRecommendations(result);
            this.stats.incompleteEdits++;
        }

        // Update statistics
        this.updateAverageCompletionRate(result.completionRate);

        if (this.verbose) {
            this.printVerificationResult(result);
        }

        return result;
    }

    /**
     * Scan files for pattern occurrences
     *
     * @param {string} pattern - Pattern to search for
     * @param {string[]} files - Files to scan
     * @returns {Promise<Object>} Scan results
     */
    async scanForPattern(pattern, files) {
        const results = {
            totalOccurrences: 0,
            occurrences: [],
            filesScanned: 0
        };

        for (const filePath of files) {
            if (!fs.existsSync(filePath)) {
                if (this.verbose) {
                    console.log(`   ⚠️  File not found: ${filePath}`);
                }
                continue;
            }

            results.filesScanned++;

            try {
                // Use grep to find occurrences (faster than reading files)
                const grepCmd = `grep -n "${pattern}" "${filePath}" 2>/dev/null || true`;
                const output = execSync(grepCmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });

                if (output.trim()) {
                    const lines = output.trim().split('\n');
                    for (const line of lines) {
                        const [lineNumber, ...contentParts] = line.split(':');
                        const content = contentParts.join(':').trim();

                        results.totalOccurrences++;
                        results.occurrences.push({
                            file: filePath,
                            line: parseInt(lineNumber),
                            content: content.substring(0, 100) // Truncate long lines
                        });
                    }
                }
            } catch (error) {
                if (this.verbose) {
                    console.log(`   ⚠️  Error scanning ${filePath}: ${error.message}`);
                }
            }
        }

        return results;
    }

    /**
     * Verify single file edit
     *
     * @param {string} filePath - File to verify
     * @param {string} oldPattern - Old pattern
     * @param {string} newPattern - New pattern
     * @param {number} expectedCount - Expected replacements
     * @returns {Promise<Object>} Verification result
     */
    async verifySingleFileEdit(filePath, oldPattern, newPattern, expectedCount) {
        const result = {
            complete: false,
            file: filePath,
            oldPattern: oldPattern,
            newPattern: newPattern,
            expectedCount: expectedCount,
            remainingOccurrences: 0,
            newPatternCount: 0,
            message: ''
        };

        if (!fs.existsSync(filePath)) {
            result.message = `File not found: ${filePath}`;
            return result;
        }

        // Count remaining old pattern occurrences
        const oldScan = await this.scanForPattern(oldPattern, [filePath]);
        result.remainingOccurrences = oldScan.totalOccurrences;

        // Count new pattern occurrences
        const newScan = await this.scanForPattern(newPattern, [filePath]);
        result.newPatternCount = newScan.totalOccurrences;

        // Verify replacement was successful
        if (result.remainingOccurrences === 0 && result.newPatternCount >= expectedCount) {
            result.complete = true;
            result.message = `✅ Verification passed - All ${expectedCount} occurrences replaced`;
        } else {
            result.complete = false;
            result.message = `❌ Verification failed - ${result.remainingOccurrences} old occurrences remain, ${result.newPatternCount}/${expectedCount} new occurrences found`;
        }

        return result;
    }

    /**
     * Verify batch edit across multiple files
     *
     * @param {Object[]} edits - Array of edit operations
     * @returns {Promise<Object>} Batch verification result
     */
    async verifyBatchEdit(edits) {
        const results = {
            totalEdits: edits.length,
            completeEdits: 0,
            incompleteEdits: 0,
            failedEdits: [],
            overallComplete: false,
            message: ''
        };

        for (const edit of edits) {
            const result = await this.verifyMultiFileEdit(edit);

            if (result.complete) {
                results.completeEdits++;
            } else {
                results.incompleteEdits++;
                results.failedEdits.push({
                    pattern: edit.searchPattern,
                    files: edit.files,
                    completionRate: result.completionRate,
                    remainingOccurrences: result.occurrencesFound
                });
            }
        }

        results.overallComplete = results.incompleteEdits === 0;
        results.message = results.overallComplete
            ? `✅ All ${results.totalEdits} edits verified successfully`
            : `❌ ${results.incompleteEdits}/${results.totalEdits} edits incomplete`;

        return results;
    }

    /**
     * Generate recommendations for incomplete edits
     *
     * @param {Object} verificationResult - Verification result
     * @returns {string[]} Recommendations
     */
    generateRecommendations(verificationResult) {
        const recommendations = [];

        if (verificationResult.occurrencesFound > 0) {
            recommendations.push(
                `Found ${verificationResult.occurrencesFound} remaining occurrences of "${verificationResult.searchPattern}" in:`
            );

            // Group by file
            const byFile = {};
            for (const occurrence of verificationResult.missingOccurrences) {
                if (!byFile[occurrence.file]) {
                    byFile[occurrence.file] = [];
                }
                byFile[occurrence.file].push(occurrence);
            }

            for (const [file, occurrences] of Object.entries(byFile)) {
                recommendations.push(`  - ${file}: ${occurrences.length} occurrence(s) at line(s) ${occurrences.map(o => o.line).join(', ')}`);
            }

            recommendations.push('');
            recommendations.push('Action required: Complete the replacements in the files above');
        }

        if (verificationResult.completionRate < 100 && verificationResult.completionRate > 0) {
            recommendations.push(
                `Completion rate is ${verificationResult.completionRate.toFixed(1)}%. Review all files to ensure edit consistency.`
            );
        }

        return recommendations;
    }

    /**
     * Update average completion rate statistic
     *
     * @param {number} completionRate - Latest completion rate
     */
    updateAverageCompletionRate(completionRate) {
        const totalVerifications = this.stats.totalVerifications;
        const previousAverage = this.stats.averageCompletionRate;

        // Calculate new average
        this.stats.averageCompletionRate =
            ((previousAverage * (totalVerifications - 1)) + completionRate) / totalVerifications;
    }

    /**
     * Print verification result to console
     *
     * @param {Object} result - Verification result
     */
    printVerificationResult(result) {
        console.log('');
        console.log('═══════════════════════════════════════════════════════');
        console.log('📊 Edit Verification Result');
        console.log('═══════════════════════════════════════════════════════');
        console.log(`Status: ${result.complete ? '✅ COMPLETE' : '❌ INCOMPLETE'}`);
        console.log(`Completion Rate: ${result.completionRate.toFixed(1)}%`);
        console.log(`Files Analyzed: ${result.filesAnalyzed}`);
        console.log(`Remaining Occurrences: ${result.occurrencesFound}`);

        if (result.occurrencesExpected) {
            console.log(`Expected Replacements: ${result.occurrencesExpected}`);
            console.log(`Actual Replacements: ${result.occurrencesExpected - result.occurrencesFound}`);
        }

        if (!result.complete && result.recommendations.length > 0) {
            console.log('');
            console.log('💡 Recommendations:');
            for (const rec of result.recommendations) {
                console.log(`   ${rec}`);
            }
        }

        console.log('═══════════════════════════════════════════════════════');
        console.log('');
    }

    /**
     * Get verification statistics
     *
     * @returns {Object} Statistics
     */
    getStats() {
        return {
            ...this.stats,
            successRate: this.stats.totalVerifications > 0
                ? ((this.stats.completeEdits / this.stats.totalVerifications) * 100).toFixed(1) + '%'
                : 'N/A'
        };
    }
}

// ============================================================================
// CLI Interface
// ============================================================================

if (require.main === module) {
    const command = process.argv[2];

    if (command === 'verify') {
        const searchPattern = process.argv[3];
        const replacementPattern = process.argv[4];
        const filesArg = process.argv[5];
        const expectedOccurrences = process.argv[6] ? parseInt(process.argv[6]) : undefined;

        if (!searchPattern || !replacementPattern || !filesArg) {
            console.log(`
Edit Verification Checkpoint

Usage:
  node edit-verification-checkpoint.js verify <searchPattern> <replacementPattern> <files> [expectedCount]

Arguments:
  searchPattern        Pattern that was replaced (old text)
  replacementPattern   Pattern that replaced it (new text)
  files                Comma-separated list of files that were edited
  expectedCount        Optional: Expected number of replacements

Examples:
  node edit-verification-checkpoint.js verify "Van Metre" "NewClient" "file1.js,file2.md" 15
  node edit-verification-checkpoint.js verify "oldVar" "newVar" "src/**/*.js"

Exit Codes:
  0 = Verification passed
  1 = Verification failed (incomplete edit)
            `);
            process.exit(1);
        }

        const files = filesArg.split(',').map(f => f.trim());

        const verifier = new EditVerificationCheckpoint({ verbose: true });
        verifier.verifyMultiFileEdit({
            searchPattern,
            replacementPattern,
            files,
            expectedOccurrences,
            strictMode: false
        }).then(result => {
            process.exit(result.complete ? 0 : 1);
        }).catch(error => {
            console.error('Verification error:', error);
            process.exit(1);
        });

    } else {
        console.log('Unknown command. Use "verify" to verify edits.');
        process.exit(1);
    }
}

module.exports = { EditVerificationCheckpoint };
