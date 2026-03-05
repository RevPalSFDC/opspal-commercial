#!/usr/bin/env node

/**
 * MCP Validation Framework
 * 
 * Comprehensive validation framework for all Salesforce MCP operations
 * to prevent false positive success messages and ensure reliable operations.
 */

const { execSync } = require('child_process');

class MCPValidationFramework {
    constructor(options = {}) {
        this.options = {
            timeout: options.timeout || 15000,
            retryAttempts: options.retryAttempts || 2,
            logLevel: options.logLevel || 'info',
            ...options
        };
        
        this.validationCache = new Map();
        this.operationHistory = [];
    }

    /**
     * Main validation method for any MCP operation
     */
    async validateOperation(operationType, mcpResponse, verificationQuery, expectedResult = {}) {
        const operationId = this.generateOperationId();
        const startTime = Date.now();
        
        try {
            console.log(`🔍 [${operationId}] Starting validation for ${operationType}`);
            
            // Step 1: Validate MCP Response Structure
            this.validateMCPResponse(mcpResponse, operationType);
            
            // Step 2: Verify Salesforce ID Format
            this.validateSalesforceId(mcpResponse.id, operationType);
            
            // Step 3: Verify Actual Creation/Update in Salesforce
            const salesforceResult = await this.verifySalesforceOperation(
                verificationQuery, 
                mcpResponse.id, 
                operationType
            );
            
            // Step 4: Validate Expected Properties
            this.validateExpectedProperties(salesforceResult, expectedResult, operationType);
            
            const duration = Date.now() - startTime;
            
            console.log(`✅ [${operationId}] Validation successful for ${operationType} (${duration}ms)`);
            
            // Record successful operation
            this.recordOperation(operationId, operationType, true, duration, mcpResponse.id);
            
            return {
                success: true,
                operationId,
                salesforceId: mcpResponse.id,
                verifiedObject: salesforceResult,
                duration,
                message: `${operationType} successfully validated and confirmed in Salesforce`
            };
            
        } catch (error) {
            const duration = Date.now() - startTime;
            console.error(`❌ [${operationId}] Validation failed for ${operationType}: ${error.message}`);
            
            // Record failed operation
            this.recordOperation(operationId, operationType, false, duration, null, error.message);
            
            throw new ValidationError(operationType, error.message, operationId);
        }
    }

    /**
     * Validate MCP response structure and content
     */
    validateMCPResponse(response, operationType) {
        if (!response) {
            throw new Error(`${operationType} failed: No response received from MCP server`);
        }
        
        if (typeof response !== 'object') {
            throw new Error(`${operationType} failed: Invalid response format (expected object, got ${typeof response})`);
        }
        
        if (response.success !== true) {
            if (response.error) {
                throw new Error(`${operationType} failed: ${response.error}`);
            } else if (response.message) {
                throw new Error(`${operationType} failed: ${response.message}`);
            } else {
                throw new Error(`${operationType} failed: Operation did not complete successfully`);
            }
        }
        
        if (!response.id) {
            throw new Error(`${operationType} claimed success but returned no Salesforce ID`);
        }
    }

    /**
     * Validate Salesforce ID format
     */
    validateSalesforceId(id, operationType) {
        if (typeof id !== 'string') {
            throw new Error(`${operationType} returned invalid ID type: expected string, got ${typeof id}`);
        }
        
        // Salesforce ID format: 15 or 18 characters, alphanumeric
        const salesforceIdPattern = /^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/;
        
        if (!salesforceIdPattern.test(id)) {
            throw new Error(`${operationType} returned invalid Salesforce ID format: ${id}`);
        }
        
        // Additional format validation based on object type
        this.validateObjectSpecificId(id, operationType);
    }

    /**
     * Validate ID format for specific object types
     */
    validateObjectSpecificId(id, operationType) {
        const objectPrefixes = {
            'Report': '00O',
            'Dashboard': '01Z',
            'Folder': '00l',
            'Account': '001',
            'Contact': '003',
            'Lead': '00Q',
            'Opportunity': '006',
            'Contract': '800'
        };
        
        // Extract object type from operation
        const objectType = this.extractObjectType(operationType);
        
        if (objectType && objectPrefixes[objectType]) {
            const expectedPrefix = objectPrefixes[objectType];
            if (!id.startsWith(expectedPrefix)) {
                throw new Error(`${operationType} returned ID with incorrect prefix: expected ${expectedPrefix}*, got ${id}`);
            }
        }
    }

    /**
     * Verify the operation actually succeeded in Salesforce
     */
    async verifySalesforceOperation(verificationQuery, expectedId, operationType) {
        try {
            const result = await this.executeSalesforceQuery(verificationQuery);
            
            if (!result || result.totalSize === 0) {
                throw new Error(`${operationType} claimed success but object with ID ${expectedId} not found in Salesforce`);
            }
            
            const record = result.records[0];
            
            if (record.Id !== expectedId) {
                throw new Error(`${operationType} ID mismatch: expected ${expectedId}, found ${record.Id}`);
            }
            
            return record;
            
        } catch (error) {
            if (error.message.includes('not found in Salesforce')) {
                throw error; // Re-throw validation errors
            } else {
                throw new Error(`${operationType} verification failed: Unable to query Salesforce: ${error.message}`);
            }
        }
    }

    /**
     * Execute Salesforce query with error handling
     */
    async executeSalesforceQuery(query) {
        try {
            const result = execSync(`sf data query --query "${query}" --json`, {
                encoding: 'utf8',
                timeout: this.options.timeout
            });
            
            return JSON.parse(result).result;
            
        } catch (error) {
            if (error.stderr) {
                const errorMessage = error.stderr.toString();
                if (errorMessage.includes('INVALID_FIELD')) {
                    throw new Error('Invalid field in query - check field API names and permissions');
                } else if (errorMessage.includes('INVALID_TYPE')) {
                    throw new Error('Invalid object in query - check object API name and access permissions');
                } else if (errorMessage.includes('INSUFFICIENT_ACCESS')) {
                    throw new Error('Insufficient access to execute query - check user permissions');
                }
            }
            
            throw new Error(`Query execution failed: ${error.message}`);
        }
    }

    /**
     * Validate expected properties of the created/updated object
     */
    validateExpectedProperties(salesforceObject, expectedProperties, operationType) {
        if (!expectedProperties || Object.keys(expectedProperties).length === 0) {
            return; // No specific properties to validate
        }
        
        for (const [property, expectedValue] of Object.entries(expectedProperties)) {
            const actualValue = salesforceObject[property];
            
            if (expectedValue !== null && actualValue !== expectedValue) {
                throw new Error(`${operationType} property mismatch: ${property} expected '${expectedValue}', got '${actualValue}'`);
            }
            
            if (expectedValue === null && actualValue === null) {
                throw new Error(`${operationType} required property '${property}' is null`);
            }
        }
    }

    /**
     * Generate unique operation ID for tracking
     */
    generateOperationId() {
        return `OP_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    }

    /**
     * Extract object type from operation name
     */
    extractObjectType(operationType) {
        const operationMap = {
            'create_report': 'Report',
            'update_report': 'Report',
            'create_dashboard': 'Dashboard',
            'update_dashboard': 'Dashboard',
            'create_folder': 'Folder',
            'create_account': 'Account',
            'create_contact': 'Contact',
            'create_lead': 'Lead',
            'create_opportunity': 'Opportunity',
            'create_contract': 'Contract'
        };
        
        const normalizedOperation = operationType.toLowerCase().replace(/\s+/g, '_');
        
        return operationMap[normalizedOperation] || null;
    }

    /**
     * Record operation for auditing and analysis
     */
    recordOperation(operationId, operationType, success, duration, salesforceId = null, error = null) {
        const record = {
            operationId,
            operationType,
            success,
            duration,
            salesforceId,
            error,
            timestamp: new Date().toISOString()
        };
        
        this.operationHistory.push(record);
        
        // Keep only last 1000 operations to prevent memory issues
        if (this.operationHistory.length > 1000) {
            this.operationHistory = this.operationHistory.slice(-1000);
        }
    }

    /**
     * Get operation statistics
     */
    getOperationStats() {
        const total = this.operationHistory.length;
        const successful = this.operationHistory.filter(op => op.success).length;
        const failed = total - successful;
        
        const avgDuration = this.operationHistory.reduce((sum, op) => sum + op.duration, 0) / total;
        
        const operationTypes = {};
        this.operationHistory.forEach(op => {
            if (!operationTypes[op.operationType]) {
                operationTypes[op.operationType] = { total: 0, successful: 0, failed: 0 };
            }
            operationTypes[op.operationType].total++;
            if (op.success) {
                operationTypes[op.operationType].successful++;
            } else {
                operationTypes[op.operationType].failed++;
            }
        });
        
        return {
            total,
            successful,
            failed,
            successRate: total > 0 ? ((successful / total) * 100).toFixed(2) + '%' : '0%',
            averageDuration: Math.round(avgDuration) + 'ms',
            operationTypes
        };
    }

    /**
     * Generate validation report
     */
    generateValidationReport() {
        const stats = this.getOperationStats();
        const recentFailures = this.operationHistory
            .filter(op => !op.success)
            .slice(-10) // Last 10 failures
            .map(op => ({
                operationType: op.operationType,
                error: op.error,
                timestamp: op.timestamp
            }));
        
        return {
            timestamp: new Date().toISOString(),
            statistics: stats,
            recentFailures,
            recommendations: this.generateRecommendations(stats, recentFailures)
        };
    }

    /**
     * Generate recommendations based on operation history
     */
    generateRecommendations(stats, recentFailures) {
        const recommendations = [];
        
        const successRate = parseFloat(stats.successRate.replace('%', ''));
        
        if (successRate < 90) {
            recommendations.push('Success rate is below 90% - investigate common failure patterns');
        }
        
        if (recentFailures.length > 5) {
            recommendations.push('High recent failure rate - check Salesforce connectivity and permissions');
        }
        
        const commonErrors = {};
        recentFailures.forEach(failure => {
            const errorKey = failure.error.split(':')[0]; // First part of error message
            commonErrors[errorKey] = (commonErrors[errorKey] || 0) + 1;
        });
        
        Object.entries(commonErrors).forEach(([errorType, count]) => {
            if (count >= 3) {
                recommendations.push(`Recurring error pattern detected: ${errorType} (${count} occurrences)`);
            }
        });
        
        if (recommendations.length === 0) {
            recommendations.push('Validation framework operating normally');
        }
        
        return recommendations;
    }
}

/**
 * Custom validation error class
 */
class ValidationError extends Error {
    constructor(operationType, message, operationId) {
        super(message);
        this.name = 'ValidationError';
        this.operationType = operationType;
        this.operationId = operationId;
    }
}

/**
 * Pre-built validation configurations for common operations
 */
const ValidationConfigs = {
    CREATE_REPORT: {
        verificationQuery: (id) => `SELECT Id, Name, DeveloperName, CreatedDate FROM Report WHERE Id = '${id}'`,
        expectedProperties: { Id: null, Name: null }
    },
    
    CREATE_DASHBOARD: {
        verificationQuery: (id) => `SELECT Id, Title, DeveloperName, CreatedDate FROM Dashboard WHERE Id = '${id}'`,
        expectedProperties: { Id: null, Title: null }
    },
    
    CREATE_FOLDER: {
        verificationQuery: (id) => `SELECT Id, Name, Type, CreatedDate FROM Folder WHERE Id = '${id}'`,
        expectedProperties: { Id: null, Name: null }
    }
};

module.exports = {
    MCPValidationFramework,
    ValidationError,
    ValidationConfigs
};

// Example usage if run directly
if (require.main === module) {
    const framework = new MCPValidationFramework();
    
    // Example validation
    const exampleMCPResponse = {
        success: true,
        id: '00O5f000003kXYZ12'
    };
    
    framework.validateOperation(
        'create_report',
        exampleMCPResponse,
        `SELECT Id, Name FROM Report WHERE Id = '${exampleMCPResponse.id}'`,
        { Name: 'Test Report' }
    ).then(result => {
        console.log('✅ Validation example completed:', result);
    }).catch(error => {
        console.error('❌ Validation example failed:', error.message);
    });
}