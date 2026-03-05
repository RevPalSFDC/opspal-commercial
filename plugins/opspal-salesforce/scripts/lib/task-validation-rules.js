#!/usr/bin/env node

/**
 * Task Validation Rules Module
 *
 * Comprehensive validation for tasks before creation:
 * - Date range validation (past/future dates)
 * - Owner validation and availability
 * - Required field checks
 * - Business rule validation
 * - Data type validation
 */

const { execSync } = require('child_process');
const moment = require('moment-timezone');

class TaskValidationRules {
    constructor(targetOrg, options = {}) {
        this.targetOrg = targetOrg;
        this.timezone = options.timezone || 'America/Los_Angeles';
        this.allowPastDates = options.allowPastDates || false;
        this.maxFutureDays = options.maxFutureDays || 365;
        this.requiredFields = options.requiredFields || ['Subject', 'OwnerId'];
        this.customRules = options.customRules || [];
        this.enableWarnings = options.enableWarnings !== false;

        // Initialize moment with timezone
        moment.tz.setDefault(this.timezone);
    }

    /**
     * Validate a batch of tasks
     */
    async validateTasks(tasks, options = {}) {
        console.log(`\n✅ Validating ${tasks.length} tasks...`);

        const validationResults = {
            valid: [],
            invalid: [],
            warnings: [],
            summary: {
                total: tasks.length,
                valid: 0,
                invalid: 0,
                warnings: 0,
                issues: {}
            }
        };

        // Run all validations on each task
        for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i];
            const taskValidation = await this.validateTask(task, i);

            if (taskValidation.isValid) {
                validationResults.valid.push({
                    task: task,
                    index: i,
                    warnings: taskValidation.warnings
                });
                validationResults.summary.valid++;
            } else {
                validationResults.invalid.push({
                    task: task,
                    index: i,
                    errors: taskValidation.errors,
                    warnings: taskValidation.warnings
                });
                validationResults.summary.invalid++;
            }

            // Track issue types
            taskValidation.errors.forEach(error => {
                const type = error.type || 'other';
                validationResults.summary.issues[type] =
                    (validationResults.summary.issues[type] || 0) + 1;
            });

            if (taskValidation.warnings.length > 0) {
                validationResults.warnings.push({
                    task: task,
                    index: i,
                    warnings: taskValidation.warnings
                });
                validationResults.summary.warnings++;
            }
        }

        // Display summary
        this.displayValidationSummary(validationResults);

        return validationResults;
    }

    /**
     * Validate individual task
     */
    async validateTask(task, index) {
        const validation = {
            isValid: true,
            errors: [],
            warnings: []
        };

        // 1. Required field validation
        this.validateRequiredFields(task, validation);

        // 2. Date validation
        this.validateDates(task, validation);

        // 3. Owner validation
        await this.validateOwner(task, validation);

        // 4. Related record validation
        if (task.WhatId || task.WhoId) {
            await this.validateRelatedRecords(task, validation);
        }

        // 5. Field length validation
        this.validateFieldLengths(task, validation);

        // 6. Picklist value validation
        await this.validatePicklistValues(task, validation);

        // 7. Custom business rules
        this.validateCustomRules(task, validation);

        // Determine overall validity
        validation.isValid = validation.errors.length === 0;

        return validation;
    }

    /**
     * Validate required fields
     */
    validateRequiredFields(task, validation) {
        this.requiredFields.forEach(field => {
            if (!task[field] || task[field].trim() === '') {
                validation.errors.push({
                    field: field,
                    type: 'required_field',
                    message: `Required field '${field}' is missing or empty`
                });
            }
        });
    }

    /**
     * Validate date fields
     */
    validateDates(task, validation) {
        if (task.ActivityDate) {
            const activityDate = moment(task.ActivityDate);
            const today = moment().startOf('day');

            // Check if date is valid
            if (!activityDate.isValid()) {
                validation.errors.push({
                    field: 'ActivityDate',
                    type: 'invalid_date',
                    message: `Invalid date format: ${task.ActivityDate}`
                });
                return;
            }

            // Check for past dates
            if (activityDate.isBefore(today)) {
                const daysPast = today.diff(activityDate, 'days');

                if (!this.allowPastDates) {
                    validation.errors.push({
                        field: 'ActivityDate',
                        type: 'past_date',
                        message: `Activity date is ${daysPast} days in the past`,
                        value: task.ActivityDate
                    });
                } else if (this.enableWarnings) {
                    validation.warnings.push({
                        field: 'ActivityDate',
                        type: 'past_date',
                        message: `Activity date is ${daysPast} days in the past - task will be overdue`,
                        value: task.ActivityDate
                    });
                }
            }

            // Check for far future dates
            const maxFutureDate = moment().add(this.maxFutureDays, 'days');
            if (activityDate.isAfter(maxFutureDate)) {
                const daysFuture = activityDate.diff(today, 'days');
                validation.warnings.push({
                    field: 'ActivityDate',
                    type: 'far_future_date',
                    message: `Activity date is ${daysFuture} days in the future`,
                    value: task.ActivityDate
                });
            }

            // Check for weekends (warning only)
            if (this.enableWarnings && (activityDate.day() === 0 || activityDate.day() === 6)) {
                validation.warnings.push({
                    field: 'ActivityDate',
                    type: 'weekend_date',
                    message: `Activity date falls on a ${activityDate.format('dddd')}`,
                    value: task.ActivityDate
                });
            }
        }

        // Validate ReminderDateTime if present
        if (task.ReminderDateTime) {
            const reminderDate = moment(task.ReminderDateTime);

            if (!reminderDate.isValid()) {
                validation.errors.push({
                    field: 'ReminderDateTime',
                    type: 'invalid_date',
                    message: `Invalid reminder date format: ${task.ReminderDateTime}`
                });
            } else if (reminderDate.isBefore(moment())) {
                validation.errors.push({
                    field: 'ReminderDateTime',
                    type: 'past_reminder',
                    message: 'Reminder date cannot be in the past'
                });
            }
        }
    }

    /**
     * Validate task owner
     */
    async validateOwner(task, validation) {
        if (!task.OwnerId) {
            return; // Already caught by required field check
        }

        try {
            const query = `
                SELECT Id, Name, IsActive, Email
                FROM User
                WHERE Id = '${task.OwnerId}'
            `;

            const cmd = `sf data query --query "${query}" --target-org ${this.targetOrg} --json 2>/dev/null`;
            const result = JSON.parse(execSync(cmd, { encoding: 'utf-8' }));

            if (!result.result || result.result.totalSize === 0) {
                validation.errors.push({
                    field: 'OwnerId',
                    type: 'invalid_owner',
                    message: `Owner ID '${task.OwnerId}' does not exist`,
                    value: task.OwnerId
                });
            } else {
                const user = result.result.records[0];

                // Check if user is active
                if (!user.IsActive) {
                    validation.errors.push({
                        field: 'OwnerId',
                        type: 'inactive_owner',
                        message: `Owner '${user.Name}' is inactive`,
                        value: task.OwnerId
                    });
                }
            }

        } catch (error) {
            validation.warnings.push({
                field: 'OwnerId',
                type: 'validation_error',
                message: `Could not validate owner: ${error.message}`
            });
        }
    }

    /**
     * Validate related records (WhatId and WhoId)
     */
    async validateRelatedRecords(task, validation) {
        // Validate WhatId (related to)
        if (task.WhatId) {
            const whatIdValid = await this.validateRecordId(task.WhatId, 'WhatId');
            if (!whatIdValid.isValid) {
                validation.errors.push({
                    field: 'WhatId',
                    type: 'invalid_related_record',
                    message: whatIdValid.message,
                    value: task.WhatId
                });
            }
        }

        // Validate WhoId (Name - Contact or Lead)
        if (task.WhoId) {
            const whoIdValid = await this.validateRecordId(task.WhoId, 'WhoId');
            if (!whoIdValid.isValid) {
                validation.errors.push({
                    field: 'WhoId',
                    type: 'invalid_related_record',
                    message: whoIdValid.message,
                    value: task.WhoId
                });
            }
        }
    }

    /**
     * Validate a record ID exists
     */
    async validateRecordId(recordId, fieldName) {
        try {
            // Determine object type from ID prefix
            const objectType = this.getObjectTypeFromId(recordId);

            if (!objectType) {
                return {
                    isValid: false,
                    message: `Invalid ID format for ${fieldName}`
                };
            }

            // Special validation for WhoId (must be Contact or Lead)
            if (fieldName === 'WhoId' && !['Contact', 'Lead'].includes(objectType)) {
                return {
                    isValid: false,
                    message: `WhoId must reference a Contact or Lead, not ${objectType}`
                };
            }

            // Check if record exists
            const query = `SELECT Id FROM ${objectType} WHERE Id = '${recordId}' LIMIT 1`;
            const cmd = `sf data query --query "${query}" --target-org ${this.targetOrg} --json 2>/dev/null`;
            const result = JSON.parse(execSync(cmd, { encoding: 'utf-8' }));

            if (result.result && result.result.totalSize > 0) {
                return { isValid: true };
            } else {
                return {
                    isValid: false,
                    message: `${objectType} record '${recordId}' does not exist`
                };
            }

        } catch (error) {
            return {
                isValid: false,
                message: `Could not validate ${fieldName}: ${error.message}`
            };
        }
    }

    /**
     * Get object type from Salesforce ID
     */
    getObjectTypeFromId(recordId) {
        if (!recordId || recordId.length < 3) return null;

        const prefix = recordId.substring(0, 3);

        // Common object prefixes
        const prefixMap = {
            '001': 'Account',
            '003': 'Contact',
            '005': 'User',
            '006': 'Opportunity',
            '00Q': 'Lead',
            '500': 'Case',
            '00U': 'Event',
            '00T': 'Task',
            '01t': 'Product2',
            'a00': 'Custom' // Generic custom object
        };

        return prefixMap[prefix] || null;
    }

    /**
     * Validate field lengths
     */
    validateFieldLengths(task, validation) {
        const fieldLimits = {
            Subject: 255,
            Description: 32000,
            Type: 40,
            Status: 40,
            Priority: 40
        };

        Object.entries(fieldLimits).forEach(([field, maxLength]) => {
            if (task[field] && task[field].length > maxLength) {
                validation.errors.push({
                    field: field,
                    type: 'field_too_long',
                    message: `${field} exceeds maximum length of ${maxLength} characters`,
                    actual: task[field].length,
                    max: maxLength
                });
            }
        });
    }

    /**
     * Validate picklist values
     */
    async validatePicklistValues(task, validation) {
        const picklistFields = ['Status', 'Priority', 'Type'];

        for (const field of picklistFields) {
            if (task[field]) {
                const validValues = await this.getPicklistValues('Task', field);

                if (validValues && !validValues.includes(task[field])) {
                    validation.errors.push({
                        field: field,
                        type: 'invalid_picklist_value',
                        message: `'${task[field]}' is not a valid value for ${field}`,
                        validValues: validValues.slice(0, 5) // Show first 5 valid values
                    });
                }
            }
        }
    }

    /**
     * Get valid picklist values for a field
     */
    async getPicklistValues(objectName, fieldName) {
        try {
            // Cache key
            const cacheKey = `${objectName}.${fieldName}`;

            // Check cache first (implement caching if needed)
            // For now, returning common default values
            const defaults = {
                'Task.Status': ['Not Started', 'In Progress', 'Completed', 'Waiting on someone else', 'Deferred'],
                'Task.Priority': ['High', 'Normal', 'Low'],
                'Task.Type': ['Call', 'Email', 'Meeting', 'Other', 'Task']
            };

            return defaults[cacheKey] || null;

        } catch (error) {
            console.warn(`⚠️ Could not fetch picklist values for ${objectName}.${fieldName}`);
            return null;
        }
    }

    /**
     * Validate custom business rules
     */
    validateCustomRules(task, validation) {
        this.customRules.forEach(rule => {
            try {
                const result = rule.validate(task);

                if (!result.isValid) {
                    validation.errors.push({
                        type: 'custom_rule',
                        rule: rule.name,
                        message: result.message || `Custom rule '${rule.name}' validation failed`
                    });
                }
            } catch (error) {
                validation.warnings.push({
                    type: 'rule_error',
                    rule: rule.name,
                    message: `Error executing custom rule: ${error.message}`
                });
            }
        });
    }

    /**
     * Display validation summary
     */
    displayValidationSummary(results) {
        console.log('\n📊 Validation Summary:');
        console.log(`  Total tasks: ${results.summary.total}`);
        console.log(`  ✅ Valid: ${results.summary.valid}`);
        console.log(`  ❌ Invalid: ${results.summary.invalid}`);
        console.log(`  ⚠️ Warnings: ${results.summary.warnings}`);

        if (Object.keys(results.summary.issues).length > 0) {
            console.log('\n  Issue breakdown:');
            Object.entries(results.summary.issues).forEach(([type, count]) => {
                console.log(`    ${type}: ${count}`);
            });
        }

        // Show sample errors
        if (results.invalid.length > 0) {
            console.log('\n  Sample errors (first 3):');
            results.invalid.slice(0, 3).forEach(item => {
                console.log(`    Task ${item.index + 1}:`);
                item.errors.slice(0, 2).forEach(error => {
                    console.log(`      - ${error.message}`);
                });
            });
        }

        // Show sample warnings
        if (results.warnings.length > 0 && this.enableWarnings) {
            console.log('\n  Sample warnings (first 3):');
            results.warnings.slice(0, 3).forEach(item => {
                console.log(`    Task ${item.index + 1}:`);
                item.warnings.slice(0, 2).forEach(warning => {
                    console.log(`      - ${warning.message}`);
                });
            });
        }
    }

    /**
     * Fix common validation issues automatically
     */
    async autoFixTasks(tasks, validationResults) {
        console.log('\n🔧 Attempting to auto-fix validation issues...');

        const fixed = [];
        let fixCount = 0;

        validationResults.invalid.forEach(item => {
            const task = { ...item.task };
            let wasFixed = false;

            item.errors.forEach(error => {
                // Auto-fix past dates by moving to today
                if (error.type === 'past_date' && this.allowPastDates) {
                    task.ActivityDate = moment().format('YYYY-MM-DD');
                    wasFixed = true;
                    fixCount++;
                }

                // Auto-truncate long fields
                if (error.type === 'field_too_long') {
                    task[error.field] = task[error.field].substring(0, error.max);
                    wasFixed = true;
                    fixCount++;
                }

                // Auto-correct invalid picklist values to defaults
                if (error.type === 'invalid_picklist_value') {
                    const defaults = {
                        Status: 'Not Started',
                        Priority: 'Normal',
                        Type: 'Task'
                    };
                    if (defaults[error.field]) {
                        task[error.field] = defaults[error.field];
                        wasFixed = true;
                        fixCount++;
                    }
                }
            });

            if (wasFixed) {
                fixed.push(task);
            }
        });

        console.log(`  Fixed ${fixCount} issues in ${fixed.length} tasks`);

        return fixed;
    }
}

// Export moment for convenience
TaskValidationRules.moment = moment;

// CLI interface for testing
if (require.main === module) {
    console.log(`
Task Validation Rules Module

Validates tasks before creation to prevent errors:
- Date validation (past/future)
- Owner existence and status
- Required field checking
- Field length validation
- Picklist value validation
- Custom business rules

Use this module to ensure data quality before bulk operations.
    `);
}

module.exports = TaskValidationRules;