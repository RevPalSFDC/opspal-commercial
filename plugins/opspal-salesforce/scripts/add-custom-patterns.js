#!/usr/bin/env node

/**
 * Add Custom Error Patterns for Renewal Consolidation
 * 
 * Based on actual errors encountered during Cushman & Wakefield consolidation
 */

const ErrorRecoverySystem = require('./lib/error-recovery.js');
const fs = require('fs').promises;
const path = require('path');

(async () => {
    console.log('Adding custom error patterns from renewal consolidation experience...\n');
    
    const recovery = new ErrorRecoverySystem();
    
    // Pattern 1: Contract_Type__c picklist error
    recovery.registerPattern({
        id: 'CONTRACT_TYPE_RENEWAL',
        pattern: /bad value for restricted picklist field:.*Contract_Type__c.*value:.*Contracting_Entity/i,
        extractor: (error) => {
            const match = error.message.match(/value:\s*['"]([^'"]+)['"]/i);
            return { invalidValue: match ? match[1] : null };
        },
        resolver: async (context, error, extracted) => {
            console.log(`Fixing Contract_Type__c: '${extracted.invalidValue}' → 'Renewal'`);
            return {
                type: 'FIELD_UPDATE',
                action: 'replace_value',
                field: 'Contract_Type__c',
                oldValue: extracted.invalidValue,
                newValue: 'Renewal',
                confidence: 0.95,
                explanation: 'Contract_Type__c must be "Renewal" for renewal opportunities'
            };
        }
    });

    // Pattern 2: Who_Set_Meeting__c required field
    recovery.registerPattern({
        id: 'WHO_SET_MEETING_CSM',
        pattern: /Required fields are missing:.*Who_Set_Meeting__c/i,
        resolver: async (context, error) => {
            console.log('Adding required field: Who_Set_Meeting__c = "CSM"');
            return {
                type: 'ADD_FIELDS',
                action: 'add_required_fields',
                fields: {
                    'Who_Set_Meeting__c': {
                        defaultValue: 'CSM',
                        type: 'Picklist',
                        source: 'renewal_default'
                    }
                },
                confidence: 0.90,
                explanation: 'Who_Set_Meeting__c defaults to "CSM" for renewals'
            };
        }
    });

    // Pattern 3: Bulk operation timeout (109 records)
    recovery.registerPattern({
        id: 'BULK_ARCHIVE_TIMEOUT',
        pattern: /timeout.*archiv|operation.*timed out.*after.*records/i,
        resolver: async (context, error) => {
            const recordCount = context.data?.length || 100;
            const optimalBatchSize = recordCount > 100 ? 10 : 50;
            
            console.log(`Timeout detected. Reducing batch size to ${optimalBatchSize}`);
            return {
                type: 'RETRY_STRATEGY',
                action: 'reduce_batch_size',
                currentBatchSize: context.batchSize || 100,
                newBatchSize: optimalBatchSize,
                delay: 3000,
                useBackground: recordCount > 100,
                confidence: 0.95,
                explanation: `Archive operations >100 records need ${optimalBatchSize}-record batches`
            };
        }
    });

    // Pattern 4: Duplicate opportunity name
    recovery.registerPattern({
        id: 'DUPLICATE_RENEWAL_NAME',
        pattern: /duplicate value found.*Opportunity.*Name|unique constraint.*opportunity name/i,
        resolver: async (context, error) => {
            console.log('Making opportunity name unique with timestamp');
            return {
                type: 'MAKE_UNIQUE',
                action: 'append_timestamp',
                field: 'Name',
                suffix: `_${Date.now()}`,
                confidence: 0.90,
                explanation: 'Appending timestamp to make opportunity name unique'
            };
        }
    });

    // Pattern 5: Legacy field not writable
    recovery.registerPattern({
        id: 'LEGACY_FIELD_READONLY',
        pattern: /Field.*Legacy.*is not writeable|cannot.*update.*legacy.*field/i,
        resolver: async (context, error) => {
            console.log('Removing read-only legacy field from update');
            const fieldMatch = error.message.match(/Field\s+(\w+)/i);
            const field = fieldMatch ? fieldMatch[1] : 'Legacy_Field__c';
            
            return {
                type: 'REMOVE_FIELD',
                action: 'remove_invalid_field',
                field: field,
                confidence: 0.85,
                explanation: `Removing read-only field ${field} from operation`
            };
        }
    });

    // Pattern 6: Account relationship issue
    recovery.registerPattern({
        id: 'CUSHMAN_ACCOUNT_MERGE',
        pattern: /Cushman.*Wakefield.*account.*not found|multiple.*Cushman.*accounts/i,
        resolver: async (context, error) => {
            console.log('Handling Cushman & Wakefield account consolidation');
            return {
                type: 'FIELD_UPDATE',
                action: 'use_primary_account',
                field: 'AccountId',
                query: "SELECT Id FROM Account WHERE Name LIKE 'Cushman%' ORDER BY CreatedDate LIMIT 1",
                confidence: 0.80,
                explanation: 'Using primary Cushman & Wakefield account for consolidation'
            };
        }
    });

    // Pattern 7: Validation rule for archived opportunities
    recovery.registerPattern({
        id: 'ARCHIVE_VALIDATION_RULE',
        pattern: /validation.*fail.*archived.*opportunity|cannot.*archive.*opportunity.*validation/i,
        resolver: async (context, error) => {
            console.log('Handling archive validation rule');
            return {
                type: 'ADD_FIELDS',
                action: 'add_bypass_fields',
                fields: {
                    'Bypass_Validation__c': true,
                    'Archive_Reason__c': 'Legacy Renewal Consolidation',
                    'Archive_Date__c': new Date().toISOString().split('T')[0]
                },
                confidence: 0.75,
                explanation: 'Adding fields to bypass archive validation rule'
            };
        }
    });

    // Save patterns to file
    const patternsFile = path.join(__dirname, '../data/error-patterns.json');
    
    try {
        // Load existing patterns
        let existingPatterns = [];
        try {
            const data = await fs.readFile(patternsFile, 'utf8');
            existingPatterns = JSON.parse(data);
        } catch (e) {
            // File doesn't exist yet
        }

        // Get all patterns from recovery system
        const allPatterns = [];
        for (const [id, pattern] of recovery.errorPatterns) {
            allPatterns.push({
                id: pattern.id,
                pattern: pattern.pattern.source,
                hitCount: pattern.hitCount || 0,
                successCount: pattern.successCount || 0,
                lastUsed: pattern.lastUsed,
                description: pattern.explanation || `Pattern for ${id}`
            });
        }

        // Save updated patterns
        await fs.mkdir(path.dirname(patternsFile), { recursive: true });
        await fs.writeFile(patternsFile, JSON.stringify(allPatterns, null, 2));
        
        console.log(`\n✅ Successfully added ${allPatterns.length} error patterns`);
        console.log(`Patterns saved to: ${patternsFile}`);
        
        // Display pattern summary
        console.log('\nCustom Patterns Added:');
        console.log('  • CONTRACT_TYPE_RENEWAL - Fix Contract_Type__c picklist values');
        console.log('  • WHO_SET_MEETING_CSM - Add required Who_Set_Meeting__c field');
        console.log('  • BULK_ARCHIVE_TIMEOUT - Prevent timeout on 100+ records');
        console.log('  • DUPLICATE_RENEWAL_NAME - Handle duplicate opportunity names');
        console.log('  • LEGACY_FIELD_READONLY - Remove read-only fields');
        console.log('  • CUSHMAN_ACCOUNT_MERGE - Handle account consolidation');
        console.log('  • ARCHIVE_VALIDATION_RULE - Bypass validation rules');
        
    } catch (error) {
        console.error('Error saving patterns:', error.message);
    }
})();