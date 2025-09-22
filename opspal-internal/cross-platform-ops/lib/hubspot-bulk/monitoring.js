/**
 * Real-time monitoring dashboard for HubSpot bulk operations
 */

const EventEmitter = require('events');
const chalk = require('chalk');
const Table = require('cli-table3');

class BulkOperationMonitor extends EventEmitter {
    constructor() {
        super();
        this.operations = new Map();
        this.metrics = {
            totalImports: 0,
            totalExports: 0,
            totalRows: 0,
            failedRows: 0,
            bytesProcessed: 0,
            startTime: Date.now()
        };
        this.isInteractive = process.stdout.isTTY;
    }

    /**
     * Track a new operation
     */
    trackOperation(id, type, metadata = {}) {
        const operation = {
            id,
            type,
            status: 'INITIALIZING',
            startTime: Date.now(),
            metadata,
            progress: {
                processed: 0,
                total: metadata.totalRows || 0,
                failed: 0,
                percentage: 0
            },
            performance: {
                rowsPerSecond: 0,
                bytesPerSecond: 0,
                estimatedTimeRemaining: null
            }
        };

        this.operations.set(id, operation);

        if (type === 'import') {
            this.metrics.totalImports++;
        } else if (type === 'export') {
            this.metrics.totalExports++;
        }

        this.emit('operation:start', operation);
        return operation;
    }

    /**
     * Update operation progress
     */
    updateProgress(id, update) {
        const operation = this.operations.get(id);
        if (!operation) return;

        // Update progress
        if (update.processed !== undefined) {
            operation.progress.processed = update.processed;
        }
        if (update.failed !== undefined) {
            operation.progress.failed = update.failed;
            this.metrics.failedRows += update.failed;
        }
        if (update.total !== undefined) {
            operation.progress.total = update.total;
        }

        // Calculate percentage
        if (operation.progress.total > 0) {
            operation.progress.percentage = Math.round(
                (operation.progress.processed / operation.progress.total) * 100
            );
        }

        // Update status
        if (update.status) {
            operation.status = update.status;
        }

        // Calculate performance metrics
        const elapsed = Date.now() - operation.startTime;
        if (elapsed > 0 && operation.progress.processed > 0) {
            operation.performance.rowsPerSecond = Math.round(
                (operation.progress.processed / elapsed) * 1000
            );

            if (operation.performance.rowsPerSecond > 0) {
                const remaining = operation.progress.total - operation.progress.processed;
                operation.performance.estimatedTimeRemaining = Math.round(
                    remaining / operation.performance.rowsPerSecond
                );
            }
        }

        this.emit('operation:progress', operation);
    }

    /**
     * Complete an operation
     */
    completeOperation(id, result = {}) {
        const operation = this.operations.get(id);
        if (!operation) return;

        operation.status = result.success ? 'COMPLETED' : 'FAILED';
        operation.endTime = Date.now();
        operation.duration = operation.endTime - operation.startTime;
        operation.result = result;

        // Update global metrics
        this.metrics.totalRows += operation.progress.processed;

        this.emit('operation:complete', operation);
    }

    /**
     * Display dashboard
     */
    displayDashboard() {
        if (!this.isInteractive) {
            return this.getTextSummary();
        }

        console.clear();
        console.log(chalk.bold.cyan('\n📊 HubSpot Bulk Operations Dashboard\n'));

        // Overall metrics
        const overallTable = new Table({
            head: ['Metric', 'Value'],
            colWidths: [30, 40]
        });

        const runtime = Math.round((Date.now() - this.metrics.startTime) / 1000);
        overallTable.push(
            ['Runtime', `${this.formatDuration(runtime)}`],
            ['Total Imports', this.metrics.totalImports],
            ['Total Exports', this.metrics.totalExports],
            ['Total Rows Processed', this.metrics.totalRows.toLocaleString()],
            ['Failed Rows', this.metrics.failedRows.toLocaleString()],
            ['Success Rate', `${this.getSuccessRate()}%`]
        );

        console.log(overallTable.toString());

        // Active operations
        if (this.operations.size > 0) {
            console.log(chalk.bold.cyan('\n🔄 Active Operations:\n'));

            const opsTable = new Table({
                head: ['ID', 'Type', 'Status', 'Progress', 'Speed', 'ETA'],
                colWidths: [20, 10, 15, 20, 15, 15]
            });

            for (const [id, op] of this.operations) {
                if (op.status === 'COMPLETED' || op.status === 'FAILED') continue;

                const progressBar = this.createProgressBar(op.progress.percentage);
                const speed = `${op.performance.rowsPerSecond}/s`;
                const eta = op.performance.estimatedTimeRemaining
                    ? this.formatDuration(op.performance.estimatedTimeRemaining)
                    : 'N/A';

                opsTable.push([
                    id.substring(0, 18) + '...',
                    op.type,
                    this.colorizeStatus(op.status),
                    progressBar,
                    speed,
                    eta
                ]);
            }

            console.log(opsTable.toString());
        }

        // Recent completions
        const completed = Array.from(this.operations.values())
            .filter(op => op.status === 'COMPLETED' || op.status === 'FAILED')
            .slice(-5);

        if (completed.length > 0) {
            console.log(chalk.bold.cyan('\n✅ Recent Completions:\n'));

            const completedTable = new Table({
                head: ['ID', 'Type', 'Status', 'Rows', 'Duration'],
                colWidths: [20, 10, 15, 20, 15]
            });

            for (const op of completed) {
                completedTable.push([
                    op.id.substring(0, 18) + '...',
                    op.type,
                    this.colorizeStatus(op.status),
                    op.progress.processed.toLocaleString(),
                    this.formatDuration(Math.round(op.duration / 1000))
                ]);
            }

            console.log(completedTable.toString());
        }

        // Refresh indicator
        console.log(chalk.gray('\n↻ Dashboard refreshes every 5 seconds...'));
    }

    /**
     * Get text summary for non-interactive mode
     */
    getTextSummary() {
        const lines = [];
        lines.push('HubSpot Bulk Operations Summary');
        lines.push('================================');
        lines.push(`Total Imports: ${this.metrics.totalImports}`);
        lines.push(`Total Exports: ${this.metrics.totalExports}`);
        lines.push(`Total Rows: ${this.metrics.totalRows.toLocaleString()}`);
        lines.push(`Failed Rows: ${this.metrics.failedRows.toLocaleString()}`);
        lines.push(`Success Rate: ${this.getSuccessRate()}%`);

        for (const [id, op] of this.operations) {
            lines.push(`\n${op.type.toUpperCase()} ${id}:`);
            lines.push(`  Status: ${op.status}`);
            lines.push(`  Progress: ${op.progress.processed}/${op.progress.total}`);
            if (op.progress.failed > 0) {
                lines.push(`  Failed: ${op.progress.failed}`);
            }
        }

        return lines.join('\n');
    }

    /**
     * Export metrics as JSON
     */
    exportMetrics() {
        const operations = Array.from(this.operations.values()).map(op => ({
            id: op.id,
            type: op.type,
            status: op.status,
            processed: op.progress.processed,
            total: op.progress.total,
            failed: op.progress.failed,
            duration: op.duration || (Date.now() - op.startTime),
            performance: op.performance
        }));

        return {
            timestamp: new Date().toISOString(),
            runtime: Date.now() - this.metrics.startTime,
            metrics: this.metrics,
            operations,
            summary: {
                successRate: this.getSuccessRate(),
                averageSpeed: this.getAverageSpeed(),
                totalDuration: this.formatDuration(
                    Math.round((Date.now() - this.metrics.startTime) / 1000)
                )
            }
        };
    }

    // Helper methods

    createProgressBar(percentage) {
        const width = 15;
        const filled = Math.round((width * percentage) / 100);
        const empty = width - filled;

        const bar = chalk.green('█').repeat(filled) + chalk.gray('░').repeat(empty);
        return `${bar} ${percentage}%`;
    }

    colorizeStatus(status) {
        const colors = {
            'INITIALIZING': chalk.gray,
            'PROCESSING': chalk.yellow,
            'COMPLETED': chalk.green,
            'FAILED': chalk.red,
            'CANCELED': chalk.red
        };

        return (colors[status] || chalk.white)(status);
    }

    formatDuration(seconds) {
        if (seconds < 60) return `${seconds}s`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
        return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
    }

    getSuccessRate() {
        if (this.metrics.totalRows === 0) return 100;
        return Math.round(
            ((this.metrics.totalRows - this.metrics.failedRows) / this.metrics.totalRows) * 100
        );
    }

    getAverageSpeed() {
        const elapsed = (Date.now() - this.metrics.startTime) / 1000;
        if (elapsed === 0) return 0;
        return Math.round(this.metrics.totalRows / elapsed);
    }

    /**
     * Start auto-refresh for interactive dashboard
     */
    startAutoRefresh(interval = 5000) {
        if (!this.isInteractive) return;

        this.refreshInterval = setInterval(() => {
            this.displayDashboard();
        }, interval);

        // Initial display
        this.displayDashboard();
    }

    /**
     * Stop auto-refresh
     */
    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }
}

// Singleton instance
let monitorInstance = null;

function getMonitor() {
    if (!monitorInstance) {
        monitorInstance = new BulkOperationMonitor();
    }
    return monitorInstance;
}

module.exports = { BulkOperationMonitor, getMonitor };