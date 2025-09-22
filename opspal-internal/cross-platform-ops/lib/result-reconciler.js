/**
 * Result Reconciler for Salesforce Bulk API 2.0
 * Handles success/failure analysis, dead-letter queuing, and reporting
 */

const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');

class ResultReconciler extends EventEmitter {
    constructor(options = {}) {
        super();
        this.outputDir = options.outputDir || './reports/reconciliation';
        this.generateReports = options.generateReports !== false;
        this.saveDeadLetter = options.saveDeadLetter !== false;
    }

    /**
     * Reconcile results from bulk operation
     */
    async reconcileResults(jobResults, originalData) {
        const reconciliation = {
            timestamp: new Date().toISOString(),
            summary: {
                totalSubmitted: originalData.length,
                totalProcessed: 0,
                successful: 0,
                failed: 0,
                unprocessed: 0
            },
            successfulRecords: [],
            failedRecords: [],
            unprocessedRecords: [],
            errorCategories: {},
            recommendations: []
        };

        // Process results
        if (jobResults.successful) {
            reconciliation.successfulRecords = jobResults.successful;
            reconciliation.summary.successful = jobResults.successful.length;
        }

        if (jobResults.failed) {
            reconciliation.failedRecords = jobResults.failed;
            reconciliation.summary.failed = jobResults.failed.length;
            this._categorizeErrors(reconciliation);
        }

        if (jobResults.unprocessed) {
            reconciliation.unprocessedRecords = jobResults.unprocessed;
            reconciliation.summary.unprocessed = jobResults.unprocessed.length;
        }

        reconciliation.summary.totalProcessed = 
            reconciliation.summary.successful + reconciliation.summary.failed;

        // Generate recommendations
        this._generateRecommendations(reconciliation);

        // Save reports
        if (this.generateReports) {
            await this._saveReports(reconciliation);
        }

        // Create dead-letter queue
        if (this.saveDeadLetter && reconciliation.failedRecords.length > 0) {
            await this._createDeadLetterQueue(reconciliation.failedRecords);
        }

        this.emit('reconciliationComplete', reconciliation);
        return reconciliation;
    }

    _categorizeErrors(reconciliation) {
        reconciliation.failedRecords.forEach(record => {
            const error = record.error || 'UNKNOWN_ERROR';
            if (!reconciliation.errorCategories[error]) {
                reconciliation.errorCategories[error] = {
                    count: 0,
                    examples: [],
                    records: []
                };
            }
            reconciliation.errorCategories[error].count++;
            reconciliation.errorCategories[error].records.push(record.Id);
            if (reconciliation.errorCategories[error].examples.length < 3) {
                reconciliation.errorCategories[error].examples.push(record);
            }
        });
    }

    _generateRecommendations(reconciliation) {
        Object.entries(reconciliation.errorCategories).forEach(([error, data]) => {
            if (error.includes('DUPLICATE')) {
                reconciliation.recommendations.push(
                    `Found ${data.count} duplicate errors. Consider deduplication before retry.`
                );
            }
            if (error.includes('REQUIRED_FIELD_MISSING')) {
                reconciliation.recommendations.push(
                    `${data.count} records missing required fields. Review data completeness.`
                );
            }
            if (error.includes('UNABLE_TO_LOCK_ROW')) {
                reconciliation.recommendations.push(
                    `${data.count} lock errors. Retry with smaller batch size or during off-hours.`
                );
            }
        });
    }

    async _saveReports(reconciliation) {
        await fs.mkdir(this.outputDir, { recursive: true });
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportPath = path.join(this.outputDir, `reconciliation_${timestamp}.json`);
        
        await fs.writeFile(reportPath, JSON.stringify(reconciliation, null, 2));
        
        this.emit('reportSaved', { path: reportPath });
        return reportPath;
    }

    async _createDeadLetterQueue(failedRecords) {
        const { stringify } = require('csv-stringify/sync');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const deadLetterPath = path.join(this.outputDir, `dead_letter_${timestamp}.csv`);
        
        const csv = stringify(failedRecords, { header: true });
        await fs.writeFile(deadLetterPath, csv);
        
        this.emit('deadLetterCreated', { 
            path: deadLetterPath, 
            count: failedRecords.length 
        });
        
        return deadLetterPath;
    }
}

module.exports = ResultReconciler;