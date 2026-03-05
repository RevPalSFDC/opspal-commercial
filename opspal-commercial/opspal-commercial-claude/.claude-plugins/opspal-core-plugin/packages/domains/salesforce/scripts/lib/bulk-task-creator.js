#!/usr/bin/env node

/**
 * Bulk Task Creator - Enhanced Instance-agnostic solution for creating Tasks in Salesforce
 *
 * Features:
 * - Handles line ending issues with multiple creation strategies
 * - Duplicate prevention with hash-based tracking
 * - Date validation and auto-correction
 * - Intelligent task assignment across team members
 * - Rollback capability for failed operations
 * - Comprehensive validation before creation
 *
 * Version: 2.0.0
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Import enhancement modules
const TaskDuplicatePreventer = require('./task-duplicate-preventer');
const TaskAssignmentOptimizer = require('./task-assignment-optimizer');
const TaskValidationRules = require('./task-validation-rules');
const BulkOperationRollback = require('./bulk-operation-rollback');

class BulkTaskCreator {
    constructor(targetOrg, options = {}) {
        this.targetOrg = targetOrg;
        this.tempDir = options.tempDir || '/tmp/bulk-tasks';
        this.ensureTempDir();

        // Initialize enhancement modules
        this.duplicatePreventer = new TaskDuplicatePreventer(targetOrg, options);
        this.assignmentOptimizer = new TaskAssignmentOptimizer(targetOrg, options);
        this.validator = new TaskValidationRules(targetOrg, options);
        this.rollbackManager = new BulkOperationRollback(targetOrg, options);

        // Configuration
        this.enableValidation = options.enableValidation !== false;
        this.enableDuplicateCheck = options.enableDuplicateCheck !== false;
        this.enableAssignmentOptimization = options.enableAssignmentOptimization !== false;
        this.enableRollback = options.enableRollback !== false;
        this.autoFix = options.autoFix || false;
    }

    ensureTempDir() {
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    /**
     * Create tasks using the most reliable method based on volume
     * Enhanced with validation, duplicate checking, and rollback support
     */
    async createTasks(csvFile, options = {}) {
        const { method = 'auto', batchSize = 200 } = options;

        console.log(`\n📋 Processing task creation from: ${csvFile}`);
        console.log('🔧 Enhanced features enabled:');
        console.log(`  - Validation: ${this.enableValidation ? '✅' : '❌'}`);
        console.log(`  - Duplicate Check: ${this.enableDuplicateCheck ? '✅' : '❌'}`);
        console.log(`  - Assignment Optimization: ${this.enableAssignmentOptimization ? '✅' : '❌'}`);
        console.log(`  - Rollback Support: ${this.enableRollback ? '✅' : '❌'}`);

        // Read and validate CSV
        let tasks = await this.readCSV(csvFile);
        console.log(`✅ Loaded ${tasks.length} tasks from CSV`);

        // Step 1: Validation
        if (this.enableValidation) {
            const validationResults = await this.validator.validateTasks(tasks);

            if (validationResults.invalid.length > 0) {
                if (this.autoFix) {
                    console.log('\n🔧 Attempting to auto-fix validation issues...');
                    const fixedTasks = await this.validator.autoFixTasks(tasks, validationResults);
                    tasks = [...validationResults.valid.map(v => v.task), ...fixedTasks];
                } else {
                    console.error(`\n❌ ${validationResults.invalid.length} tasks failed validation`);
                    console.log('Use --auto-fix option to attempt automatic correction');

                    if (!options.force) {
                        throw new Error('Validation failed. Use --force to proceed with valid tasks only');
                    }

                    // Proceed with valid tasks only
                    tasks = validationResults.valid.map(v => v.task);
                    console.log(`Proceeding with ${tasks.length} valid tasks`);
                }
            }
        }

        // Step 2: Duplicate Prevention
        if (this.enableDuplicateCheck) {
            const deduplicationResult = await this.duplicatePreventer.deduplicateTasks(tasks);
            tasks = deduplicationResult.tasks;

            if (deduplicationResult.summary.removed > 0) {
                console.log(`\n📋 Removed ${deduplicationResult.summary.removed} duplicates`);
                console.log(`  Proceeding with ${tasks.length} unique tasks`);
            }
        }

        // Step 3: Assignment Optimization
        if (this.enableAssignmentOptimization) {
            tasks = await this.assignmentOptimizer.optimizeAssignments(tasks, {
                useAccountTeams: options.useAccountTeams !== false,
                strategy: options.assignmentStrategy || 'balanced'
            });
        }

        // Step 4: Begin Transaction (if rollback enabled)
        let transactionId = null;
        if (this.enableRollback) {
            transactionId = await this.rollbackManager.beginTransaction('create_tasks', tasks);
        }

        // Determine best creation method
        let createMethod = method;
        if (method === 'auto') {
            createMethod = tasks.length > 50 ? 'bulk' : 'individual';
        }

        console.log(`\n🚀 Using ${createMethod} creation method for ${tasks.length} tasks`);

        try {
            let result;

            switch(createMethod) {
                case 'bulk':
                    result = await this.createTasksBulk(tasks);
                    break;
                case 'batch':
                    result = await this.createTasksBatch(tasks, batchSize);
                    break;
                case 'individual':
                    result = await this.createTasksIndividual(tasks);
                    break;
                default:
                    throw new Error(`Unknown method: ${createMethod}`);
            }

            // Record successful creation in duplicate preventer
            if (this.enableDuplicateCheck && result.success) {
                const sessionId = this.duplicatePreventer.generateSessionId();

                // Extract created IDs from result
                let createdIds = [];
                if (result.results && Array.isArray(result.results)) {
                    result.results.forEach((r, i) => {
                        if (r.success && r.id) {
                            this.duplicatePreventer.recordCreation(tasks[i], r.id);
                            createdIds.push(r.id);
                        }
                    });
                }

                this.duplicatePreventer.recordBulkSession(sessionId, tasks, result.results || []);
            }

            // Commit transaction if rollback enabled
            if (this.enableRollback && transactionId) {
                this.rollbackManager.commitTransaction(transactionId, {
                    created: result.createdIds || [],
                    success: result.success,
                    count: result.count || tasks.length
                });
            }

            return result;

        } catch (error) {
            console.error('❌ Primary method failed:', error.message);

            // Attempt rollback if enabled
            if (this.enableRollback && transactionId) {
                console.log('\n⏮️ Attempting rollback...');
                try {
                    await this.rollbackManager.rollbackTransaction(transactionId, error.message);
                    console.log('✅ Rollback completed');
                } catch (rollbackError) {
                    console.error('❌ Rollback failed:', rollbackError.message);
                }
            }

            // Fallback strategy
            console.log('🔄 Attempting fallback method...');

            if (createMethod === 'bulk') {
                console.log('Falling back to batch method...');
                return await this.createTasksBatch(tasks, 50);
            } else {
                console.log('Falling back to individual method...');
                return await this.createTasksIndividual(tasks.slice(0, 10));
            }
        }
    }

    /**
     * Read CSV file and parse tasks
     */
    async readCSV(csvFile) {
        const content = fs.readFileSync(csvFile, 'utf-8');
        const lines = content.split(/\r?\n/).filter(line => line.trim());

        if (lines.length < 2) {
            throw new Error('CSV file must have header and at least one data row');
        }

        const headers = lines[0].split(',').map(h => h.trim());
        const tasks = [];

        for (let i = 1; i < lines.length; i++) {
            const values = this.parseCSVLine(lines[i]);
            const task = {};

            headers.forEach((header, index) => {
                if (values[index] !== undefined) {
                    task[header] = values[index];
                }
            });

            if (Object.keys(task).length > 0) {
                tasks.push(task);
            }
        }

        return tasks;
    }

    /**
     * Parse CSV line handling quoted values
     */
    parseCSVLine(line) {
        const values = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }

        if (current) {
            values.push(current.trim());
        }

        return values;
    }

    /**
     * Method 1: Bulk API with proper line endings
     */
    async createTasksBulk(tasks) {
        console.log('\n📦 Preparing bulk import...');

        // Prepare CSV with CRLF line endings for Salesforce
        const csvFile = path.join(this.tempDir, 'tasks_bulk.csv');
        const headers = Object.keys(tasks[0]);

        let csvContent = headers.join(',') + '\r\n';

        tasks.forEach(task => {
            const values = headers.map(h => {
                const value = task[h] || '';
                // Quote values containing commas or quotes
                if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                    return `"${value.replace(/"/g, '""')}"`;
                }
                return value;
            });
            csvContent += values.join(',') + '\r\n';
        });

        // Write with CRLF line endings
        fs.writeFileSync(csvFile, csvContent, { encoding: 'utf-8' });

        console.log('📝 Created bulk CSV file with CRLF line endings');

        try {
            // Use bulk API
            const cmd = `sf data import bulk --sobject Task --file "${csvFile}" --wait 60 --target-org ${this.targetOrg}`;
            console.log('🚀 Executing bulk import...');

            const result = execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });

            // Parse result for job ID and status
            const jobIdMatch = result.match(/job-id[:\s]+([a-zA-Z0-9]+)/i);
            if (jobIdMatch) {
                console.log(`✅ Bulk job created: ${jobIdMatch[1]}`);

                // Check job status
                const statusCmd = `sf data bulk results --job-id ${jobIdMatch[1]} --target-org ${this.targetOrg}`;
                try {
                    const statusResult = execSync(statusCmd, { encoding: 'utf-8' });
                    console.log('📊 Job results:', statusResult);
                } catch (e) {
                    console.log('⚠️ Could not fetch job results, but job may have succeeded');
                }
            }

            return { success: true, method: 'bulk', count: tasks.length };

        } catch (error) {
            console.error('❌ Bulk import failed:', error.message);
            throw error;
        }
    }

    /**
     * Method 2: Batch creation using JSON tree format
     */
    async createTasksBatch(tasks, batchSize = 200) {
        console.log(`\n📦 Creating tasks in batches of ${batchSize}...`);

        const results = [];

        for (let i = 0; i < tasks.length; i += batchSize) {
            const batch = tasks.slice(i, i + batchSize);
            console.log(`\n🔄 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(tasks.length/batchSize)}`);

            // Create JSON tree format
            const jsonFile = path.join(this.tempDir, `tasks_batch_${i}.json`);
            const jsonData = {
                records: batch.map(task => ({
                    attributes: {
                        type: "Task",
                        referenceId: `TaskRef${i + batch.indexOf(task)}`
                    },
                    ...task
                }))
            };

            fs.writeFileSync(jsonFile, JSON.stringify(jsonData, null, 2));

            try {
                const cmd = `sf data import tree --files "${jsonFile}" --target-org ${this.targetOrg}`;
                const result = execSync(cmd, { encoding: 'utf-8' });

                console.log(`✅ Batch ${Math.floor(i/batchSize) + 1} created successfully`);
                results.push({ batch: i/batchSize + 1, success: true, count: batch.length });

            } catch (error) {
                console.error(`❌ Batch ${Math.floor(i/batchSize) + 1} failed:`, error.message);
                results.push({ batch: i/batchSize + 1, success: false, error: error.message });
            }
        }

        const successCount = results.filter(r => r.success).reduce((sum, r) => sum + r.count, 0);
        console.log(`\n✅ Created ${successCount}/${tasks.length} tasks`);

        return { success: successCount > 0, method: 'batch', results };
    }

    /**
     * Method 3: Individual creation (fallback for small volumes or testing)
     */
    async createTasksIndividual(tasks) {
        console.log(`\n🔄 Creating ${tasks.length} tasks individually...`);

        const results = [];
        let successCount = 0;

        for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i];
            process.stdout.write(`\rProcessing task ${i + 1}/${tasks.length}...`);

            try {
                // Build command with field values (properly formatted for sf cli)
                const fields = Object.entries(task)
                    .map(([key, value]) => {
                        // Escape quotes and handle special characters
                        const escapedValue = value.replace(/'/g, "\\'");
                        return `${key}='${escapedValue}'`;
                    })
                    .join(' ');

                const cmd = `sf data create record --sobject Task --values "${fields}" --target-org ${this.targetOrg}`;
                const result = execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' });

                // Check for successful creation (look for ID pattern or success message)
                const idMatch = result.match(/([a-zA-Z0-9]{15,18})/);
                const successMatch = result.match(/Successfully created/i);

                if (idMatch || successMatch) {
                    const id = idMatch ? idMatch[1] : 'created';
                    results.push({ success: true, id: id });
                    successCount++;
                } else {
                    throw new Error('No success indicator found in output');
                }

            } catch (error) {
                results.push({ success: false, error: error.message });
            }
        }

        console.log(`\n✅ Created ${successCount}/${tasks.length} tasks`);

        return { success: successCount > 0, method: 'individual', results };
    }

    /**
     * Verify created tasks
     */
    async verifyTasks(criteria) {
        console.log('\n🔍 Verifying created tasks...');

        const { ownerId, subject, createdDate } = criteria;

        let query = 'SELECT Id, Subject, OwnerId, CreatedDate FROM Task WHERE';
        const conditions = [];

        if (ownerId) conditions.push(`OwnerId = '${ownerId}'`);
        if (subject) conditions.push(`Subject LIKE '%${subject}%'`);
        if (createdDate) conditions.push(`CreatedDate = TODAY`);

        query += ' ' + conditions.join(' AND ');
        query += ' ORDER BY CreatedDate DESC LIMIT 10';

        try {
            const cmd = `sf data query --query "${query}" --target-org ${this.targetOrg} --json`;
            const result = JSON.parse(execSync(cmd, { encoding: 'utf-8' }));

            if (result.result && result.result.records) {
                console.log(`✅ Found ${result.result.totalSize} matching tasks`);
                return result.result.records;
            }

        } catch (error) {
            console.error('❌ Verification failed:', error.message);
        }

        return [];
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log(`
Bulk Task Creator v2.0 - Enhanced with validation, duplicate prevention, and rollback

Usage: node bulk-task-creator.js <csv-file> <target-org> [options]

Options:
  --method <auto|bulk|batch|individual>  Creation method (default: auto)
  --batch-size <number>                   Batch size for batch method (default: 200)
  --verify                                Verify created tasks after creation

Enhanced Features:
  --no-validation                         Skip validation checks
  --no-duplicate-check                    Skip duplicate checking
  --no-assignment-optimization            Skip assignment optimization
  --no-rollback                           Disable rollback support
  --auto-fix                              Automatically fix validation issues
  --force                                 Continue with valid tasks even if some fail
  --assignment-strategy <strategy>        Assignment strategy (balanced|round-robin|workload|role-based)
  --use-account-teams                     Use Account Teams for assignment
  --allow-past-dates                      Allow tasks with past due dates
  --default-owner <user-id>               Default owner for tasks without assignment

Examples:
  # Basic usage with all enhancements
  node bulk-task-creator.js tasks.csv myorg

  # Force bulk method with auto-fix
  node bulk-task-creator.js tasks.csv myorg --method bulk --auto-fix

  # Optimize assignments using Account Teams
  node bulk-task-creator.js tasks.csv myorg --use-account-teams --assignment-strategy balanced

  # Skip duplicate checking for speed
  node bulk-task-creator.js tasks.csv myorg --no-duplicate-check

  # Allow past dates and continue on validation failures
  node bulk-task-creator.js tasks.csv myorg --allow-past-dates --force
        `);
        process.exit(1);
    }

    const csvFile = args[0];
    const targetOrg = args[1];

    // Parse options
    const options = {};
    const creatorOptions = {};

    for (let i = 2; i < args.length; i++) {
        switch(args[i]) {
            case '--method':
                options.method = args[++i];
                break;
            case '--batch-size':
                options.batchSize = parseInt(args[++i]);
                break;
            case '--verify':
                options.verify = true;
                break;
            case '--no-validation':
                creatorOptions.enableValidation = false;
                break;
            case '--no-duplicate-check':
                creatorOptions.enableDuplicateCheck = false;
                break;
            case '--no-assignment-optimization':
                creatorOptions.enableAssignmentOptimization = false;
                break;
            case '--no-rollback':
                creatorOptions.enableRollback = false;
                break;
            case '--auto-fix':
                creatorOptions.autoFix = true;
                options.autoFix = true;
                break;
            case '--force':
                options.force = true;
                break;
            case '--assignment-strategy':
                options.assignmentStrategy = args[++i];
                creatorOptions.strategy = options.assignmentStrategy;
                break;
            case '--use-account-teams':
                options.useAccountTeams = true;
                break;
            case '--allow-past-dates':
                creatorOptions.allowPastDates = true;
                break;
            case '--default-owner':
                creatorOptions.defaultOwnerId = args[++i];
                break;
        }
    }

    const creator = new BulkTaskCreator(targetOrg, creatorOptions);

    creator.createTasks(csvFile, options)
        .then(result => {
            console.log('\n✨ Task creation completed:');
            console.log(`  Method used: ${result.method}`);
            console.log(`  Success: ${result.success ? '✅' : '❌'}`);

            if (result.count !== undefined) {
                console.log(`  Tasks created: ${result.count}`);
            }

            if (result.results && Array.isArray(result.results)) {
                const successful = result.results.filter(r => r.success).length;
                const failed = result.results.filter(r => !r.success).length;
                console.log(`  Results: ${successful} succeeded, ${failed} failed`);
            }

            if (options.verify) {
                return creator.verifyTasks({});
            }
        })
        .then(verified => {
            if (verified) {
                console.log('✅ Verification complete');
            }
            process.exit(0);
        })
        .catch(error => {
            console.error('\n❌ Fatal error:', error.message);
            console.error('Stack trace:', error.stack);
            process.exit(1);
        });
}

module.exports = BulkTaskCreator;