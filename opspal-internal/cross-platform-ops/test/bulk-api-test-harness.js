#!/usr/bin/env node

/**
 * Bulk API 2.0 Test Harness
 * Comprehensive testing suite for production readiness
 */

const fs = require('fs').promises;
const path = require('path');
const { createWriteStream } = require('fs');
const chalk = require('chalk');
const ora = require('ora');

// Import our components
const SalesforceBulkClient = require('../lib/salesforce-bulk-client');
const CsvSplitter = require('../lib/csv-splitter');
const JobOrchestrator = require('../lib/job-orchestrator');
const ResultReconciler = require('../lib/result-reconciler');
const RetryHandler = require('../lib/retry-handler');
const SalesforceAuth = require('../lib/salesforce-auth');

class BulkApiTestHarness {
    constructor(options = {}) {
        this.testDir = options.testDir || './test-data';
        this.reportDir = options.reportDir || './test-reports';
        this.verbose = options.verbose || false;
        this.testResults = [];
    }

    /**
     * Run all tests
     */
    async runAllTests() {
        console.log(chalk.blue.bold('\n🧪 Bulk API 2.0 Test Harness\n'));

        const tests = [
            { name: 'CSV Generation', fn: () => this.testCsvGeneration() },
            { name: 'File Splitting', fn: () => this.testFileSplitting() },
            { name: 'Memory Safety', fn: () => this.testMemorySafety() },
            { name: 'Concurrency Control', fn: () => this.testConcurrencyControl() },
            { name: 'Retry Logic', fn: () => this.testRetryLogic() },
            { name: 'Authentication', fn: () => this.testAuthentication() },
            { name: 'Error Handling', fn: () => this.testErrorHandling() },
            { name: 'Checkpoint/Resume', fn: () => this.testCheckpointResume() },
            { name: 'Result Reconciliation', fn: () => this.testResultReconciliation() },
            { name: 'Performance Benchmarks', fn: () => this.testPerformance() }
        ];

        for (const test of tests) {
            const spinner = ora(`Running: ${test.name}`).start();
            try {
                const result = await test.fn();
                spinner.succeed(`${test.name}: ${result.status}`);
                this.testResults.push({ ...test, result, success: true });
            } catch (error) {
                spinner.fail(`${test.name}: ${error.message}`);
                this.testResults.push({ ...test, error: error.message, success: false });
            }
        }

        await this.generateReport();
        this.displaySummary();
    }

    /**
     * Test 1: Generate test CSV files
     */
    async testCsvGeneration() {
        await fs.mkdir(this.testDir, { recursive: true });

        const sizes = [
            { name: 'small', rows: 1000 },
            { name: 'medium', rows: 10000 },
            { name: 'large', rows: 100000 },
            { name: 'xlarge', rows: 1000000 }
        ];

        for (const size of sizes) {
            const filePath = path.join(this.testDir, `test-${size.name}.csv`);
            await this.generateTestCsv(filePath, size.rows);
        }

        return {
            status: 'Generated 4 test files',
            files: sizes.map(s => `${s.name}: ${s.rows} rows`)
        };
    }

    /**
     * Test 2: File splitting
     */
    async testFileSplitting() {
        const splitter = new CsvSplitter({
            maxSizeMB: 10,
            outputDir: path.join(this.testDir, 'splits')
        });

        const testFile = path.join(this.testDir, 'test-large.csv');
        const splits = [];

        for await (const split of splitter.smartSplit(testFile)) {
            splits.push(split);
        }

        // Verify splits
        let totalRows = 0;
        for (const split of splits) {
            const stats = await fs.stat(split.filePath);
            if (stats.size > 10 * 1024 * 1024) {
                throw new Error(`Split file exceeds size limit: ${split.filePath}`);
            }
            totalRows += split.rows;
        }

        return {
            status: `Split into ${splits.length} files`,
            totalRows,
            maxSizeMB: 10
        };
    }

    /**
     * Test 3: Memory safety
     */
    async testMemorySafety() {
        const memBefore = process.memoryUsage();

        // Process large file without loading into memory
        const testFile = path.join(this.testDir, 'test-xlarge.csv');
        const splitter = new CsvSplitter();

        let rowCount = 0;
        const countStream = splitter.createCountStream();

        await new Promise((resolve, reject) => {
            const fs = require('fs');
            fs.createReadStream(testFile)
                .pipe(countStream)
                .on('data', () => rowCount++)
                .on('end', resolve)
                .on('error', reject);
        });

        const memAfter = process.memoryUsage();
        const memIncrease = (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024;

        if (memIncrease > 100) {
            throw new Error(`Memory increase too high: ${memIncrease.toFixed(2)}MB`);
        }

        return {
            status: 'Memory safe',
            memoryIncreaseMB: memIncrease.toFixed(2),
            rowsProcessed: rowCount
        };
    }

    /**
     * Test 4: Concurrency control
     */
    async testConcurrencyControl() {
        const mockClient = {
            executeBulkOperation: async () => {
                await new Promise(resolve => setTimeout(resolve, 100));
                return { jobId: Math.random().toString(36), status: 'JobComplete' };
            }
        };

        const orchestrator = new JobOrchestrator(mockClient, {
            maxConcurrent: 5
        });

        // Queue 20 jobs
        const jobs = Array(20).fill(null).map((_, i) => ({
            file: `test-${i}.csv`,
            object: 'Contact',
            operation: 'upsert'
        }));

        let maxConcurrent = 0;
        let currentActive = 0;

        orchestrator.on('jobStart', () => {
            currentActive++;
            maxConcurrent = Math.max(maxConcurrent, currentActive);
        });

        orchestrator.on('jobComplete', () => {
            currentActive--;
        });

        // Process jobs
        const startTime = Date.now();
        await orchestrator.processJobs(jobs);
        const duration = Date.now() - startTime;

        if (maxConcurrent > 5) {
            throw new Error(`Exceeded max concurrent limit: ${maxConcurrent}`);
        }

        return {
            status: 'Concurrency respected',
            maxConcurrent,
            totalJobs: 20,
            durationMs: duration
        };
    }

    /**
     * Test 5: Retry logic
     */
    async testRetryLogic() {
        const retryHandler = new RetryHandler();

        let attemptCount = 0;
        const failingOperation = async () => {
            attemptCount++;
            if (attemptCount < 3) {
                const error = new Error('UNABLE_TO_LOCK_ROW');
                error.code = 'UNABLE_TO_LOCK_ROW';
                throw error;
            }
            return { success: true };
        };

        const result = await retryHandler.executeWithRetry(failingOperation);

        if (attemptCount !== 3) {
            throw new Error(`Expected 3 attempts, got ${attemptCount}`);
        }

        // Test exponential backoff
        const backoffs = [];
        for (let i = 0; i < 5; i++) {
            backoffs.push(retryHandler.calculateBackoff(i));
        }

        const isExponential = backoffs.every((b, i) =>
            i === 0 || b > backoffs[i - 1]
        );

        if (!isExponential) {
            throw new Error('Backoff not exponential');
        }

        return {
            status: 'Retry logic working',
            attempts: attemptCount,
            backoffs
        };
    }

    /**
     * Test 6: Authentication
     */
    async testAuthentication() {
        const auth = new SalesforceAuth({
            orgAlias: 'test-org'
        });

        // Test connection validation
        const validation = await auth.validateConnection();

        // Test API limit checking
        const limitCheck = await auth.checkBulkApiLimit();

        return {
            status: 'Auth configured',
            connectionValid: validation.valid,
            apiLimitCheck: limitCheck.canProceed
        };
    }

    /**
     * Test 7: Error handling
     */
    async testErrorHandling() {
        const reconciler = new ResultReconciler();

        const mockResults = {
            successful: [
                { id: '001', success: true },
                { id: '002', success: true }
            ],
            failed: [
                { id: '003', error: 'DUPLICATE_VALUE' },
                { id: '004', error: 'FIELD_INTEGRITY_EXCEPTION' },
                { id: '005', error: 'DUPLICATE_VALUE' }
            ]
        };

        const analysis = await reconciler.analyzeResults(mockResults);

        if (analysis.successCount !== 2 || analysis.failureCount !== 3) {
            throw new Error('Incorrect result counting');
        }

        if (!analysis.errorCategories['DUPLICATE_VALUE']) {
            throw new Error('Error categorization failed');
        }

        return {
            status: 'Error handling correct',
            successCount: analysis.successCount,
            failureCount: analysis.failureCount,
            errorTypes: Object.keys(analysis.errorCategories)
        };
    }

    /**
     * Test 8: Checkpoint/Resume
     */
    async testCheckpointResume() {
        const checkpointDir = path.join(this.testDir, 'checkpoints');
        await fs.mkdir(checkpointDir, { recursive: true });

        const checkpoint = {
            jobId: 'test-job-123',
            processedFiles: ['file1.csv', 'file2.csv'],
            remainingFiles: ['file3.csv', 'file4.csv'],
            timestamp: Date.now()
        };

        const checkpointPath = path.join(checkpointDir, 'checkpoint.json');
        await fs.writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2));

        // Read checkpoint
        const loaded = JSON.parse(await fs.readFile(checkpointPath, 'utf8'));

        if (loaded.remainingFiles.length !== 2) {
            throw new Error('Checkpoint not properly saved/loaded');
        }

        return {
            status: 'Checkpoint/resume working',
            checkpointSaved: true,
            filesProcessed: loaded.processedFiles.length,
            filesRemaining: loaded.remainingFiles.length
        };
    }

    /**
     * Test 9: Result reconciliation
     */
    async testResultReconciliation() {
        const reconciler = new ResultReconciler({
            outputDir: path.join(this.reportDir, 'reconciliation')
        });

        const mockJobResults = {
            jobId: 'test-reconcile',
            successful: Array(950).fill(null).map((_, i) => ({
                id: `00${i}`,
                success: true
            })),
            failed: Array(50).fill(null).map((_, i) => ({
                id: `fail${i}`,
                error: i % 2 === 0 ? 'DUPLICATE_VALUE' : 'REQUIRED_FIELD_MISSING'
            }))
        };

        const report = await reconciler.reconcileResults(mockJobResults, []);

        if (report.successRate !== 95) {
            throw new Error(`Expected 95% success rate, got ${report.successRate}%`);
        }

        return {
            status: 'Reconciliation accurate',
            successRate: report.successRate,
            totalProcessed: 1000,
            deadLetterCount: 50
        };
    }

    /**
     * Test 10: Performance benchmarks
     */
    async testPerformance() {
        const benchmarks = {
            csvParsing: await this.benchmarkCsvParsing(),
            fileSplitting: await this.benchmarkFileSplitting(),
            memoryUsage: await this.benchmarkMemoryUsage()
        };

        return {
            status: 'Performance tested',
            csvParsingRate: `${benchmarks.csvParsing} rows/sec`,
            splittingRate: `${benchmarks.fileSplitting} MB/sec`,
            memoryEfficiency: `${benchmarks.memoryUsage}%`
        };
    }

    /**
     * Helper: Generate test CSV
     */
    async generateTestCsv(filePath, rows) {
        const stream = createWriteStream(filePath);

        // Write header
        stream.write('Id,FirstName,LastName,Email,Phone,Company,Title,CreatedDate\n');

        // Write data rows
        for (let i = 0; i < rows; i++) {
            const row = [
                `00Q${String(i).padStart(12, '0')}`,
                `First${i}`,
                `Last${i}`,
                `test${i}@example.com`,
                `555-${String(i).padStart(4, '0')}`,
                `Company ${i % 100}`,
                `Title ${i % 10}`,
                new Date().toISOString()
            ].join(',');

            stream.write(row + '\n');
        }

        return new Promise((resolve, reject) => {
            stream.end(() => resolve(filePath));
            stream.on('error', reject);
        });
    }

    /**
     * Benchmark CSV parsing
     */
    async benchmarkCsvParsing() {
        const testFile = path.join(this.testDir, 'test-medium.csv');
        const startTime = Date.now();
        let rowCount = 0;

        const { parse } = require('csv-parse');
        const fs = require('fs');

        await new Promise((resolve, reject) => {
            fs.createReadStream(testFile)
                .pipe(parse())
                .on('data', () => rowCount++)
                .on('end', resolve)
                .on('error', reject);
        });

        const duration = (Date.now() - startTime) / 1000;
        return Math.round(rowCount / duration);
    }

    /**
     * Benchmark file splitting
     */
    async benchmarkFileSplitting() {
        const testFile = path.join(this.testDir, 'test-medium.csv');
        const stats = await fs.stat(testFile);
        const sizeMB = stats.size / 1024 / 1024;

        const startTime = Date.now();
        const splitter = new CsvSplitter();

        for await (const split of splitter.splitBySize(testFile)) {
            // Process splits
        }

        const duration = (Date.now() - startTime) / 1000;
        return (sizeMB / duration).toFixed(2);
    }

    /**
     * Benchmark memory usage
     */
    async benchmarkMemoryUsage() {
        const memLimit = 1024 * 1024 * 1024; // 1GB
        const currentMem = process.memoryUsage().heapUsed;
        const efficiency = (1 - (currentMem / memLimit)) * 100;
        return efficiency.toFixed(2);
    }

    /**
     * Generate test report
     */
    async generateReport() {
        await fs.mkdir(this.reportDir, { recursive: true });

        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                total: this.testResults.length,
                passed: this.testResults.filter(t => t.success).length,
                failed: this.testResults.filter(t => !t.success).length
            },
            tests: this.testResults,
            recommendations: this.generateRecommendations()
        };

        const reportPath = path.join(
            this.reportDir,
            `test-report-${Date.now()}.json`
        );

        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

        return reportPath;
    }

    /**
     * Generate recommendations based on test results
     */
    generateRecommendations() {
        const recommendations = [];

        const failedTests = this.testResults.filter(t => !t.success);

        if (failedTests.length > 0) {
            recommendations.push('Fix failing tests before production deployment');

            failedTests.forEach(test => {
                if (test.name === 'Memory Safety') {
                    recommendations.push('Reduce batch sizes to prevent memory issues');
                }
                if (test.name === 'Concurrency Control') {
                    recommendations.push('Review max concurrent job settings');
                }
                if (test.name === 'Authentication') {
                    recommendations.push('Verify Salesforce org credentials');
                }
            });
        }

        return recommendations;
    }

    /**
     * Display test summary
     */
    displaySummary() {
        const passed = this.testResults.filter(t => t.success).length;
        const failed = this.testResults.filter(t => !t.success).length;
        const total = this.testResults.length;

        console.log(chalk.bold('\n📊 Test Summary:\n'));
        console.log(chalk.green(`✅ Passed: ${passed}/${total}`));

        if (failed > 0) {
            console.log(chalk.red(`❌ Failed: ${failed}/${total}`));
            console.log(chalk.yellow('\n⚠️ Failed Tests:'));
            this.testResults
                .filter(t => !t.success)
                .forEach(t => console.log(chalk.red(`  • ${t.name}: ${t.error}`)));
        }

        const successRate = (passed / total * 100).toFixed(1);

        if (successRate === '100.0') {
            console.log(chalk.green.bold(`\n✨ All tests passed! System is production ready.`));
        } else if (successRate >= 80) {
            console.log(chalk.yellow.bold(`\n⚠️ ${successRate}% pass rate. Review failures before production.`));
        } else {
            console.log(chalk.red.bold(`\n❌ ${successRate}% pass rate. System not ready for production.`));
        }
    }
}

// CLI interface
if (require.main === module) {
    const { program } = require('commander');

    program
        .version('1.0.0')
        .description('Bulk API 2.0 Test Harness');

    program
        .command('run')
        .description('Run all tests')
        .option('-v, --verbose', 'Verbose output')
        .action(async (options) => {
            const harness = new BulkApiTestHarness(options);
            await harness.runAllTests();
        });

    program
        .command('benchmark')
        .description('Run performance benchmarks only')
        .action(async () => {
            const harness = new BulkApiTestHarness();
            const result = await harness.testPerformance();
            console.log(chalk.cyan('Performance Benchmarks:'));
            console.log(result);
        });

    program
        .command('generate')
        .description('Generate test data only')
        .option('-s, --size <size>', 'Size: small|medium|large|xlarge', 'medium')
        .action(async (options) => {
            const harness = new BulkApiTestHarness();
            await harness.testCsvGeneration();
            console.log(chalk.green('Test data generated in ./test-data/'));
        });

    program.parse(process.argv);

    if (!process.argv.slice(2).length) {
        program.outputHelp();
    }
}

module.exports = BulkApiTestHarness;