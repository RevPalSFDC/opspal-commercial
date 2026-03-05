#!/usr/bin/env node

/**
 * Salesforce ID Verification Utility
 * 
 * Provides comprehensive Salesforce ID validation and verification
 * to ensure created objects actually exist in Salesforce.
 */

const { execSafe } = require('./lib/child_process_safe');

class SalesforceIdVerifier {
    constructor() {
        // Salesforce object prefixes for ID validation
        this.objectPrefixes = {
            '001': 'Account',
            '003': 'Contact', 
            '005': 'User',
            '006': 'Opportunity',
            '00Q': 'Lead',
            '00O': 'Report',
            '01Z': 'Dashboard',
            '00l': 'Folder',
            '800': 'Contract',
            '012': 'CustomObject__c',
            '015': 'CampaignMember',
            '701': 'Campaign',
            '00G': 'Profile',
            '0PS': 'PermissionSet',
            '01N': 'CustomField',
            '01a': 'CustomApp',
            '02i': 'ValidationRule',
            '01H': 'Layout',
            '01I': 'RecordType',
            '300': 'Flow',
            '301': 'ProcessBuilder'
        };
        
        // Cache for object metadata to avoid repeated queries
        this.objectMetadataCache = new Map();
        this.verificationResults = [];
    }

    /**
     * Verify a Salesforce ID exists and return object details
     */
    async verifyId(salesforceId, expectedObjectType = null) {
        try {
            console.log(`🔍 Verifying Salesforce ID: ${salesforceId}`);
            
            // Step 1: Validate ID format
            this.validateIdFormat(salesforceId);
            
            // Step 2: Determine object type from ID
            const objectType = this.getObjectTypeFromId(salesforceId);
            
            // Step 3: Validate expected object type if provided
            if (expectedObjectType && objectType !== expectedObjectType) {
                throw new Error(`ID type mismatch: expected ${expectedObjectType}, but ID ${salesforceId} is for ${objectType}`);
            }
            
            // Step 4: Query Salesforce to verify existence
            const objectDetails = await this.queryObjectById(salesforceId, objectType);
            
            // Step 5: Verify object accessibility
            await this.verifyObjectAccess(salesforceId, objectType);
            
            const result = {
                success: true,
                id: salesforceId,
                objectType: objectType,
                exists: true,
                accessible: true,
                details: objectDetails,
                verificationTimestamp: new Date().toISOString()
            };
            
            console.log(`✅ ID verification successful: ${salesforceId} (${objectType})`);
            this.verificationResults.push(result);
            
            return result;
            
        } catch (error) {
            const result = {
                success: false,
                id: salesforceId,
                error: error.message,
                verificationTimestamp: new Date().toISOString()
            };
            
            console.error(`❌ ID verification failed: ${error.message}`);
            this.verificationResults.push(result);
            
            throw error;
        }
    }

    /**
     * Validate Salesforce ID format
     */
    validateIdFormat(id) {
        if (!id) {
            throw new Error('ID cannot be null or empty');
        }
        
        if (typeof id !== 'string') {
            throw new Error(`ID must be a string, got ${typeof id}`);
        }
        
        // Salesforce IDs are 15 or 18 characters, alphanumeric
        const salesforceIdPattern = /^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/;
        
        if (!salesforceIdPattern.test(id)) {
            throw new Error(`Invalid Salesforce ID format: ${id}`);
        }
        
        // Additional validation for case-sensitive 18-character IDs
        if (id.length === 18) {
            const base15 = id.substring(0, 15);
            const suffix = id.substring(15);
            
            // Validate suffix is properly derived from base15
            if (!this.isValidIdSuffix(base15, suffix)) {
                throw new Error(`Invalid 18-character ID checksum: ${id}`);
            }
        }
    }

    /**
     * Validate 18-character ID suffix
     */
    isValidIdSuffix(base15, suffix) {
        const caseSafeChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
        
        try {
            // Salesforce's case-safe ID algorithm
            let calculatedSuffix = '';
            
            for (let i = 0; i < 3; i++) {
                let flags = 0;
                
                for (let j = 0; j < 5; j++) {
                    const char = base15.charAt(i * 5 + j);
                    if (char >= 'A' && char <= 'Z') {
                        flags += 1 << j;
                    }
                }
                
                calculatedSuffix += caseSafeChars.charAt(flags);
            }
            
            return calculatedSuffix === suffix;
            
        } catch (error) {
            // If calculation fails, don't reject the ID
            return true;
        }
    }

    /**
     * Determine object type from ID prefix
     */
    getObjectTypeFromId(id) {
        const prefix3 = id.substring(0, 3);
        
        if (this.objectPrefixes[prefix3]) {
            return this.objectPrefixes[prefix3];
        }
        
        // Check for custom object patterns
        if (prefix3.match(/^01[A-Za-z0-9]$/)) {
            return 'Custom Object';
        }
        
        return 'Unknown Object Type';
    }

    /**
     * Query Salesforce to get object details
     */
    async queryObjectById(id, objectType) {
        try {
            let query = '';
            
            // Build appropriate query based on object type
            switch (objectType) {
                case 'Report':
                    query = `SELECT Id, Name, DeveloperName, Description, CreatedDate, LastModifiedDate, OwnerId FROM Report WHERE Id = '${id}'`;
                    break;
                
                case 'Dashboard':
                    query = `SELECT Id, Title, DeveloperName, Description, CreatedDate, LastModifiedDate, OwnerId FROM Dashboard WHERE Id = '${id}'`;
                    break;
                
                case 'Folder':
                    query = `SELECT Id, Name, DeveloperName, Type, AccessType, CreatedDate FROM Folder WHERE Id = '${id}'`;
                    break;
                
                case 'Account':
                    query = `SELECT Id, Name, Type, Industry, CreatedDate, LastModifiedDate, OwnerId FROM Account WHERE Id = '${id}'`;
                    break;
                
                case 'Contact':
                    query = `SELECT Id, Name, Email, AccountId, CreatedDate, LastModifiedDate, OwnerId FROM Contact WHERE Id = '${id}'`;
                    break;
                
                case 'Lead':
                    query = `SELECT Id, Name, Email, Company, Status, CreatedDate, LastModifiedDate, OwnerId FROM Lead WHERE Id = '${id}'`;
                    break;
                
                case 'Opportunity':
                    query = `SELECT Id, Name, AccountId, StageName, Amount, CloseDate, CreatedDate, OwnerId FROM Opportunity WHERE Id = '${id}'`;
                    break;
                
                case 'Contract':
                    query = `SELECT Id, ContractNumber, AccountId, Status, StartDate, ContractTerm, CreatedDate FROM Contract WHERE Id = '${id}'`;
                    break;
                
                default:
                    // Generic query for unknown object types
                    query = `SELECT Id, Name FROM ${objectType} WHERE Id = '${id}'`;
            }
            
            const result = await this.executeSalesforceQuery(query);
            
            if (!result || result.totalSize === 0) {
                throw new Error(`Object with ID ${id} not found in Salesforce`);
            }
            
            return result.records[0];
            
        } catch (error) {
            if (error.message.includes('INVALID_TYPE')) {
                throw new Error(`Object type ${objectType} not accessible or does not exist`);
            } else if (error.message.includes('INVALID_FIELD')) {
                // Fallback to basic query if specific fields aren't available
                const fallbackQuery = `SELECT Id FROM ${objectType} WHERE Id = '${id}'`;
                const result = await this.executeSalesforceQuery(fallbackQuery);
                
                if (!result || result.totalSize === 0) {
                    throw new Error(`Object with ID ${id} not found in Salesforce`);
                }
                
                return result.records[0];
            } else {
                throw new Error(`Failed to query object ${id}: ${error.message}`);
            }
        }
    }

    /**
     * Verify object accessibility for current user
     */
    async verifyObjectAccess(id, objectType) {
        try {
            // Try to access the object with current user context
            const accessQuery = `SELECT Id, Name FROM ${objectType} WHERE Id = '${id}'`;
            const result = await this.executeSalesforceQuery(accessQuery);
            
            if (!result || result.totalSize === 0) {
                throw new Error(`Object ${id} exists but is not accessible to current user`);
            }
            
            return true;
            
        } catch (error) {
            if (error.message.includes('INSUFFICIENT_ACCESS')) {
                throw new Error(`Insufficient permissions to access ${objectType} with ID ${id}`);
            } else {
                throw error;
            }
        }
    }

    /**
     * Execute Salesforce query with error handling
     */
    async executeSalesforceQuery(query) {
        try {
            const { stdout } = await execSafe(`sf data query --query "${query}" --json`, { timeout: 15000 });
            const parsed = JSON.parse(stdout || '{}');
            
            if (parsed.result) {
                return parsed.result;
            } else {
                throw new Error('Invalid query result format');
            }
            
        } catch (error) {
            if (error.stderr) {
                const errorMessage = error.stderr.toString();
                if (errorMessage.includes('INVALID_FIELD')) {
                    throw new Error('Invalid field in query - check field API names and permissions');
                } else if (errorMessage.includes('INVALID_TYPE')) {
                    throw new Error('Invalid object in query - check object API name and access permissions');
                } else if (errorMessage.includes('INSUFFICIENT_ACCESS')) {
                    throw new Error('Insufficient access to execute query - check user permissions');
                } else if (errorMessage.includes('REQUEST_LIMIT_EXCEEDED')) {
                    throw new Error('API request limit exceeded - try again later');
                }
            }
            
            throw new Error(`Query execution failed: ${error.message}`);
        }
    }

    /**
     * Batch verify multiple IDs
     */
    async batchVerifyIds(ids, expectedObjectTypes = {}) {
        const results = [];
        
        console.log(`🔍 Batch verifying ${ids.length} Salesforce IDs...`);
        
        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            const expectedType = expectedObjectTypes[id] || null;
            
            try {
                const result = await this.verifyId(id, expectedType);
                results.push(result);
            } catch (error) {
                results.push({
                    success: false,
                    id: id,
                    error: error.message,
                    verificationTimestamp: new Date().toISOString()
                });
            }
        }
        
        const successCount = results.filter(r => r.success).length;
        const failureCount = results.length - successCount;
        
        console.log(`✅ Batch verification complete: ${successCount} successful, ${failureCount} failed`);
        
        return {
            results,
            summary: {
                total: results.length,
                successful: successCount,
                failed: failureCount,
                successRate: ((successCount / results.length) * 100).toFixed(1) + '%'
            }
        };
    }

    /**
     * Generate verification report
     */
    generateVerificationReport() {
        const totalVerifications = this.verificationResults.length;
        const successful = this.verificationResults.filter(r => r.success).length;
        const failed = totalVerifications - successful;
        
        const objectTypeCounts = {};
        const errorCounts = {};
        
        this.verificationResults.forEach(result => {
            if (result.success && result.objectType) {
                objectTypeCounts[result.objectType] = (objectTypeCounts[result.objectType] || 0) + 1;
            } else if (result.error) {
                const errorType = result.error.split(':')[0];
                errorCounts[errorType] = (errorCounts[errorType] || 0) + 1;
            }
        });
        
        return {
            timestamp: new Date().toISOString(),
            summary: {
                totalVerifications,
                successful,
                failed,
                successRate: totalVerifications > 0 ? ((successful / totalVerifications) * 100).toFixed(1) + '%' : '0%'
            },
            objectTypeCounts,
            errorCounts,
            recentResults: this.verificationResults.slice(-10)
        };
    }
}

module.exports = SalesforceIdVerifier;

// Example usage if run directly
if (require.main === module) {
    const verifier = new SalesforceIdVerifier();
    
    // Example verification
    const testIds = [
        '00O5f000003kXYZ12', // Example Report ID
        '01Z5f000003kXYZ12', // Example Dashboard ID
        'invalid-id-format'   // Invalid ID for testing
    ];
    
    verifier.batchVerifyIds(testIds).then(results => {
        console.log('\n📊 VERIFICATION RESULTS:');
        console.log(JSON.stringify(results, null, 2));
        
        const report = verifier.generateVerificationReport();
        console.log('\n📋 VERIFICATION REPORT:');
        console.log(JSON.stringify(report, null, 2));
        
    }).catch(error => {
        console.error('❌ Batch verification failed:', error.message);
    });
}
