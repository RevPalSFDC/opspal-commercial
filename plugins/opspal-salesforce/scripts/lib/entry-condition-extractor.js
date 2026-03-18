#!/usr/bin/env node

/**
 * Entry Condition Extractor
 *
 * Extracts entry conditions from Apex triggers and Flow metadata.
 * Parses trigger code for entry condition patterns and Flow XML for entry criteria.
 *
 * Features:
 * - Apex trigger condition extraction (if statements, boolean flags)
 * - Flow entry criteria parsing (triggerType, recordTriggerType, filterLogic)
 * - Workflow entry condition formatting (already working - passthrough)
 * - Human-readable condition summaries
 *
 * @version 1.0.0
 * @date 2025-10-21
 */

const fs = require('fs');
const path = require('path');

class EntryConditionExtractor {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
    }

    /**
     * Extract entry conditions from Apex trigger source code
     * @param {string} sourceCode - Apex trigger body
     * @param {string} triggerName - Trigger name for context
     * @returns {string} Entry condition summary
     */
    extractApexTriggerConditions(sourceCode, triggerName = 'Unknown') {
        if (!sourceCode || typeof sourceCode !== 'string') {
            return 'Embedded in Code';
        }

        const conditions = [];

        // Pattern 1: Trigger.isInsert, Trigger.isUpdate, etc.
        const triggerEventPatterns = [
            /if\s*\(\s*Trigger\.isInsert\s*\)/gi,
            /if\s*\(\s*Trigger\.isUpdate\s*\)/gi,
            /if\s*\(\s*Trigger\.isDelete\s*\)/gi,
            /if\s*\(\s*Trigger\.isUndelete\s*\)/gi,
            /if\s*\(\s*Trigger\.isBefore\s*\)/gi,
            /if\s*\(\s*Trigger\.isAfter\s*\)/gi
        ];

        const events = new Set();
        triggerEventPatterns.forEach(pattern => {
            const matches = sourceCode.match(pattern);
            if (matches) {
                matches.forEach(match => {
                    const event = match.replace(/if\s*\(\s*Trigger\./gi, '').replace(/\s*\)/gi, '');
                    events.add(event);
                });
            }
        });

        if (events.size > 0) {
            conditions.push(`Event checks: ${Array.from(events).join(', ')}`);
        }

        // Pattern 2: RecordType checks
        const recordTypePattern = /if\s*\(\s*[a-zA-Z0-9_\.]+\.RecordType\.[a-zA-Z0-9_]+\s*[=!]=\s*['"][^'"]+['"]\s*\)/gi;
        const recordTypeMatches = sourceCode.match(recordTypePattern);
        if (recordTypeMatches && recordTypeMatches.length > 0) {
            conditions.push(`RecordType checks (${recordTypeMatches.length})`);
        }

        // Pattern 3: Field value checks (common patterns)
        const fieldCheckPatterns = [
            /if\s*\(\s*[a-zA-Z0-9_]+\.Status\s*[=!]=\s*['"][^'"]+['"]\s*\)/gi,
            /if\s*\(\s*[a-zA-Z0-9_]+\.Type\s*[=!]=\s*['"][^'"]+['"]\s*\)/gi,
            /if\s*\(\s*[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+__c\s*[=!]=\s*/gi
        ];

        let fieldCheckCount = 0;
        fieldCheckPatterns.forEach(pattern => {
            const matches = sourceCode.match(pattern);
            if (matches) {
                fieldCheckCount += matches.length;
            }
        });

        if (fieldCheckCount > 0) {
            conditions.push(`Field value checks (${fieldCheckCount})`);
        }

        // Pattern 4: Old vs New value comparisons
        const oldNewPattern = /if\s*\(\s*oldRecord\.[a-zA-Z0-9_]+\s*!=\s*newRecord\.[a-zA-Z0-9_]+\s*\)/gi;
        const oldNewMatches = sourceCode.match(oldNewPattern);
        if (oldNewMatches && oldNewMatches.length > 0) {
            conditions.push(`Field change detection (${oldNewMatches.length})`);
        }

        // Pattern 5: Helper class method calls (often contain entry logic)
        const helperPattern = /if\s*\(\s*[A-Z][a-zA-Z0-9_]*\.[a-zA-Z0-9_]+\([^)]*\)\s*\)/gi;
        const helperMatches = sourceCode.match(helperPattern);
        if (helperMatches && helperMatches.length > 0) {
            conditions.push(`Helper class checks (${helperMatches.length})`);
        }

        // Pattern 6: Simple boolean flag checks
        const booleanPattern = /if\s*\(\s*[a-zA-Z0-9_]+\s*\)/gi;
        const booleanMatches = sourceCode.match(booleanPattern);
        if (booleanMatches && booleanMatches.length > 5) {
            conditions.push(`Boolean flag checks (${booleanMatches.length})`);
        }

        // If we found any patterns, return them
        if (conditions.length > 0) {
            const summary = conditions.join('; ');
            if (this.verbose) {
                console.log(`  ✅ ${triggerName}: ${summary}`);
            }
            return summary;
        }

        // Fallback: count total if statements
        const totalIfStatements = (sourceCode.match(/\bif\s*\(/gi) || []).length;
        if (totalIfStatements > 0) {
            return `${totalIfStatements} conditional block(s) in code`;
        }

        return 'Embedded in Code';
    }

    /**
     * Extract entry conditions from Flow metadata
     * @param {Object} flowMetadata - Flow metadata object
     * @param {string} flowName - Flow name for context
     * @returns {string} Entry condition summary
     */
    extractFlowEntryConditions(flowMetadata, flowName = 'Unknown') {
        if (!flowMetadata || typeof flowMetadata !== 'object') {
            return 'Not Available';
        }

        const conditions = [];

        // Extract trigger type (for record-triggered flows)
        if (flowMetadata.triggerType) {
            conditions.push(`Trigger: ${this.formatTriggerType(flowMetadata.triggerType)}`);
        }

        // Extract record trigger type (Create, Update, Delete)
        if (flowMetadata.recordTriggerType) {
            conditions.push(`Event: ${flowMetadata.recordTriggerType}`);
        }

        // Extract entry criteria
        if (flowMetadata.entryCriteria) {
            if (typeof flowMetadata.entryCriteria === 'string') {
                conditions.push(`Criteria: ${flowMetadata.entryCriteria}`);
            } else if (flowMetadata.entryCriteria.formula) {
                conditions.push(`Formula: ${this.truncateFormula(flowMetadata.entryCriteria.formula)}`);
            }
        }

        // Extract filter logic if available
        if (flowMetadata.filterLogic) {
            conditions.push(`Filter: ${flowMetadata.filterLogic}`);
        }

        // If we found any conditions, return them
        if (conditions.length > 0) {
            const summary = conditions.join('; ');
            if (this.verbose) {
                console.log(`  ✅ ${flowName}: ${summary}`);
            }
            return summary;
        }

        // Check process type for context
        if (flowMetadata.processType) {
            const processType = flowMetadata.processType;
            if (processType === 'AutoLaunchedFlow') {
                return 'Auto-launched (no entry conditions)';
            } else if (processType === 'InvocableProcess') {
                return 'Invocable (called from other processes)';
            } else if (processType === 'Workflow') {
                return 'Workflow process';
            }
        }

        return 'Not Available';
    }

    /**
     * Extract entry conditions from Workflow metadata
     * @param {Object} workflowMetadata - Workflow metadata object
     * @param {string} workflowName - Workflow name for context
     * @returns {string} Entry condition summary
     */
    extractWorkflowEntryConditions(workflowMetadata, workflowName = 'Unknown') {
        if (!workflowMetadata || typeof workflowMetadata !== 'object') {
            return 'Not Available';
        }

        const conditions = [];

        // Workflow triggerType (already working in v3.26.0)
        if (workflowMetadata.triggerType) {
            conditions.push(this.formatTriggerType(workflowMetadata.triggerType));
        }

        // Formula criteria
        if (workflowMetadata.formula) {
            conditions.push(`Formula: ${this.truncateFormula(workflowMetadata.formula)}`);
        }

        // Criteria items
        if (workflowMetadata.criteriaItems && workflowMetadata.criteriaItems.length > 0) {
            conditions.push(`${workflowMetadata.criteriaItems.length} criteria rule(s)`);
        }

        if (conditions.length > 0) {
            return conditions.join('; ');
        }

        return 'Not Available';
    }

    /**
     * Format trigger type to human-readable form
     * @param {string} triggerType - Raw trigger type
     * @returns {string} Formatted trigger type
     */
    formatTriggerType(triggerType) {
        const formatMap = {
            'onCreateOnly': 'On Create',
            'onAllChanges': 'On Create/Update',
            'onCreateOrTriggeringUpdate': 'On Create or Specific Updates',
            'RecordBeforeSave': 'Before Save',
            'RecordAfterSave': 'After Save',
            'RecordBeforeDelete': 'Before Delete',
            'RecordAfterDelete': 'After Delete'
        };

        return formatMap[triggerType] || triggerType;
    }

    /**
     * Truncate long formulas for readability
     * @param {string} formula - Formula string
     * @param {number} maxLength - Maximum length
     * @returns {string} Truncated formula
     */
    truncateFormula(formula, maxLength = 100) {
        if (!formula || formula.length <= maxLength) {
            return formula;
        }

        return formula.substring(0, maxLength) + '...';
    }

    /**
     * Extract entry conditions based on automation type
     * @param {Object} automation - Automation object
     * @returns {string} Entry condition summary
     */
    extractEntryConditions(automation) {
        if (!automation || !automation.automationType) {
            return 'Not Available';
        }

        const type = automation.automationType;
        const name = automation.name || automation.DeveloperName || 'Unknown';

        switch (type) {
            case 'ApexTrigger':
                if (automation.body || automation.sourceCode) {
                    return this.extractApexTriggerConditions(automation.body || automation.sourceCode, name);
                }
                return 'Embedded in Code';

            case 'ApexClass':
                // Apex classes don't have entry conditions (they're invoked by other code)
                return 'N/A';

            case 'Flow':
                if (automation.metadata) {
                    return this.extractFlowEntryConditions(automation.metadata, name);
                }
                return 'Not Available';

            case 'Workflow':
            case 'WorkflowRule':
                if (automation.metadata) {
                    return this.extractWorkflowEntryConditions(automation.metadata, name);
                }
                return 'Not Available';

            default:
                if (this.verbose) {
                    console.log(`  ⚠️  Unsupported automation type for entry condition extraction: ${type}`);
                }
                return 'Not Available';
        }
    }
}

module.exports = EntryConditionExtractor;

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage: node entry-condition-extractor.js <type> <file> [--verbose]');
        console.log('');
        console.log('Extracts entry conditions from Salesforce automations.');
        console.log('');
        console.log('Arguments:');
        console.log('  type  - "trigger", "flow", or "workflow"');
        console.log('  file  - Path to automation file (Apex code or Flow JSON)');
        console.log('');
        console.log('Options:');
        console.log('  --verbose - Show detailed extraction information');
        console.log('');
        console.log('Example:');
        console.log('  node entry-condition-extractor.js trigger ./MyTrigger.trigger --verbose');
        console.log('  node entry-condition-extractor.js flow ./flow-metadata.json');
        process.exit(1);
    }

    const type = args[0].toLowerCase();
    const file = args[1];
    const verbose = args.includes('--verbose');

    if (!fs.existsSync(file)) {
        console.error(`Error: File not found: ${file}`);
        process.exit(1);
    }

    const extractor = new EntryConditionExtractor({ verbose });
    const content = fs.readFileSync(file, 'utf8');

    let result;
    if (type === 'trigger') {
        result = extractor.extractApexTriggerConditions(content, path.basename(file));
    } else if (type === 'flow') {
        try {
            const metadata = JSON.parse(content);
            result = extractor.extractFlowEntryConditions(metadata, path.basename(file));
        } catch (e) {
            console.error(`Error: Failed to parse JSON: ${e.message}`);
            process.exit(1);
        }
    } else if (type === 'workflow') {
        try {
            const metadata = JSON.parse(content);
            result = extractor.extractWorkflowEntryConditions(metadata, path.basename(file));
        } catch (e) {
            console.error(`Error: Failed to parse JSON: ${e.message}`);
            process.exit(1);
        }
    } else {
        console.error(`Error: Invalid type "${type}". Must be "trigger", "flow", or "workflow"`);
        process.exit(1);
    }

    console.log('\n=== Entry Condition Extraction Result ===\n');
    console.log(`Type: ${type}`);
    console.log(`File: ${path.basename(file)}`);
    console.log(`Entry Conditions: ${result}`);
    console.log('');
}
