#!/usr/bin/env node

/**
 * Salesforce Pre-Deployment Validator
 * Prevents common deployment failures by checking limits and syntax before deployment
 * 
 * Based on lessons learned from ProductIntegration to Subscription migration:
 * - 40% Script Gaps: Validation rules, Apex syntax
 * - 40% Sub-agent Knowledge Gaps: SF limits, object relationships  
 * - 20% Requirements Gaps: Wrong object assumptions
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class SalesforcePreDeploymentValidator {
    constructor(orgAlias = 'production') {
        this.orgAlias = orgAlias;
        this.errors = [];
        this.warnings = [];
        this.checks = {
            fieldHistoryTracking: true,
            formulaSyntax: true,
            apexCompilation: true,
            objectRelationships: true,
            governorLimits: true,
            picklistFormulas: true
        };
    }

    /**
     * Main validation entry point
     */
    async validate(deploymentPath) {
        console.log('🔍 Starting Salesforce Pre-Deployment Validation...\n');
        
        // 1. Check field history tracking limits
        if (this.checks.fieldHistoryTracking) {
            await this.checkFieldHistoryLimits();
        }

        // 2. Validate formula syntax
        if (this.checks.formulaSyntax) {
            await this.validateFormulaSyntax(deploymentPath);
        }

        // 3. Check Apex compilation
        if (this.checks.apexCompilation) {
            await this.checkApexCompilation(deploymentPath);
        }

        // 4. Validate object relationships
        if (this.checks.objectRelationships) {
            await this.validateObjectRelationships(deploymentPath);
        }

        // 5. Check governor limits
        if (this.checks.governorLimits) {
            await this.checkGovernorLimits();
        }

        // Report results
        this.reportResults();
        
        return this.errors.length === 0;
    }

    /**
     * Check field history tracking limits (max 20 fields per object)
     */
    async checkFieldHistoryLimits() {
        console.log('📊 Checking field history tracking limits...');
        
        try {
            // Get all custom objects with history tracking
            const query = `SELECT EntityDefinitionId, COUNT(FieldDefinitionId) fieldCount 
                          FROM FieldHistoryArchive 
                          WHERE EntityDefinitionId LIKE '%__c' 
                          GROUP BY EntityDefinitionId 
                          HAVING COUNT(FieldDefinitionId) >= 15`;
            
            const result = execSync(
                `sf data query --query "${query}" --use-tooling-api --json -o ${this.orgAlias}`,
                { encoding: 'utf-8' }
            );
            
            const data = JSON.parse(result);
            
            if (data.result && data.result.records.length > 0) {
                data.result.records.forEach(record => {
                    if (record.fieldCount >= 20) {
                        this.errors.push({
                            type: 'FIELD_HISTORY_LIMIT',
                            object: record.EntityDefinitionId,
                            message: `Object ${record.EntityDefinitionId} has ${record.fieldCount}/20 tracked fields - LIMIT REACHED`,
                            severity: 'ERROR'
                        });
                    } else if (record.fieldCount >= 15) {
                        this.warnings.push({
                            type: 'FIELD_HISTORY_WARNING',
                            object: record.EntityDefinitionId,
                            message: `Object ${record.EntityDefinitionId} has ${record.fieldCount}/20 tracked fields - approaching limit`,
                            severity: 'WARNING'
                        });
                    }
                });
            }
        } catch (error) {
            console.error('Error checking field history limits:', error.message);
        }
    }

    /**
     * Validate formula syntax in validation rules and formula fields
     */
    async validateFormulaSyntax(deploymentPath) {
        console.log('🔤 Validating formula syntax...');
        
        const formulaErrors = [
            {
                pattern: /ISBLANK\s*\(\s*\w+__c\s*\)/g,
                check: async (match, filePath) => {
                    // Check if field is a picklist
                    const fieldName = match.match(/ISBLANK\s*\(\s*(\w+__c)\s*\)/)[1];
                    if (await this.isPicklistField(fieldName)) {
                        return {
                            type: 'PICKLIST_FORMULA_ERROR',
                            message: `ISBLANK() cannot be used on picklist field ${fieldName}. Use TEXT(${fieldName}) = "" instead`,
                            file: filePath,
                            severity: 'ERROR'
                        };
                    }
                    return null;
                }
            },
            {
                pattern: /ISNULL\s*\(\s*\w+__c\s*\)/g,
                check: async (match, filePath) => {
                    const fieldName = match.match(/ISNULL\s*\(\s*(\w+__c)\s*\)/)[1];
                    if (await this.isPicklistField(fieldName)) {
                        return {
                            type: 'PICKLIST_FORMULA_ERROR',
                            message: `ISNULL() cannot be used on picklist field ${fieldName}. Use TEXT(${fieldName}) = "" instead`,
                            file: filePath,
                            severity: 'ERROR'
                        };
                    }
                    return null;
                }
            }
        ];

        // Scan validation rules and formula fields
        const validationRulePath = path.join(deploymentPath, 'force-app/main/default/objects');
        if (fs.existsSync(validationRulePath)) {
            await this.scanForFormulaErrors(validationRulePath, formulaErrors);
        }
    }

    /**
     * Check if a field is a picklist type
     */
    async isPicklistField(fieldName) {
        try {
            const objectName = fieldName.split('__')[0] + '__c';
            const query = `SELECT DataType FROM FieldDefinition WHERE DeveloperName = '${fieldName.replace('__c', '')}' AND EntityDefinitionId = '${objectName}'`;
            
            const result = execSync(
                `sf data query --query "${query}" --use-tooling-api --json -o ${this.orgAlias}`,
                { encoding: 'utf-8' }
            );
            
            const data = JSON.parse(result);
            if (data.result && data.result.records.length > 0) {
                return data.result.records[0].DataType === 'Picklist' || 
                       data.result.records[0].DataType === 'MultiselectPicklist';
            }
        } catch (error) {
            // If we can't determine, assume it might be a picklist for safety
            return true;
        }
        return false;
    }

    /**
     * Scan files for formula errors
     */
    async scanForFormulaErrors(dirPath, formulaErrors) {
        const files = fs.readdirSync(dirPath, { withFileTypes: true });
        
        for (const file of files) {
            const fullPath = path.join(dirPath, file.name);
            
            if (file.isDirectory()) {
                await this.scanForFormulaErrors(fullPath, formulaErrors);
            } else if (file.name.endsWith('.xml')) {
                const content = fs.readFileSync(fullPath, 'utf-8');
                
                for (const errorDef of formulaErrors) {
                    const matches = content.match(errorDef.pattern);
                    if (matches) {
                        for (const match of matches) {
                            const error = await errorDef.check(match, fullPath);
                            if (error) {
                                this.errors.push(error);
                            }
                        }
                    }
                }
            }
        }
    }

    /**
     * Check Apex compilation
     */
    async checkApexCompilation(deploymentPath) {
        console.log('🔧 Checking Apex compilation...');
        
        const apexPath = path.join(deploymentPath, 'force-app/main/default/classes');
        if (!fs.existsSync(apexPath)) {
            return;
        }

        try {
            // Deploy with check-only flag
            const result = execSync(
                `sf project deploy start --source-dir ${apexPath} --check-only --json -o ${this.orgAlias}`,
                { encoding: 'utf-8' }
            );
            
            const data = JSON.parse(result);
            if (data.result && data.result.details && data.result.details.componentFailures) {
                data.result.details.componentFailures.forEach(failure => {
                    this.errors.push({
                        type: 'APEX_COMPILATION_ERROR',
                        message: failure.problem,
                        file: failure.fileName,
                        line: failure.lineNumber,
                        severity: 'ERROR'
                    });
                });
            }
        } catch (error) {
            // Parse error from failed deployment
            try {
                const errorData = JSON.parse(error.stdout || error.message);
                if (errorData.message) {
                    this.errors.push({
                        type: 'APEX_COMPILATION_ERROR',
                        message: errorData.message,
                        severity: 'ERROR'
                    });
                }
            } catch (parseError) {
                console.error('Error checking Apex compilation:', error.message);
            }
        }
    }

    /**
     * Validate object relationships
     */
    async validateObjectRelationships(deploymentPath) {
        console.log('🔗 Validating object relationships...');
        
        // Check for references to non-existent objects
        const flowPath = path.join(deploymentPath, 'force-app/main/default/flows');
        if (fs.existsSync(flowPath)) {
            const flows = fs.readdirSync(flowPath).filter(f => f.endsWith('.flow-meta.xml'));
            
            for (const flowFile of flows) {
                const content = fs.readFileSync(path.join(flowPath, flowFile), 'utf-8');
                
                // Check for OpportunityLineItem references when QuoteLineItem should be used
                if (content.includes('OpportunityLineItem') && !content.includes('QuoteLineItem')) {
                    this.warnings.push({
                        type: 'OBJECT_RELATIONSHIP_WARNING',
                        message: `Flow ${flowFile} references OpportunityLineItem. Verify if QuoteLineItem should be used instead.`,
                        file: flowFile,
                        severity: 'WARNING'
                    });
                }
            }
        }
    }

    /**
     * Check governor limits
     */
    async checkGovernorLimits() {
        console.log('⚡ Checking governor limits...');
        
        try {
            // Check org limits
            const result = execSync(
                `sf limits api display --json -o ${this.orgAlias}`,
                { encoding: 'utf-8' }
            );
            
            const data = JSON.parse(result);
            if (data.result) {
                // Check critical limits
                const criticalLimits = [
                    { name: 'DailyApiRequests', threshold: 0.9 },
                    { name: 'DailyAsyncApexExecutions', threshold: 0.9 },
                    { name: 'DataStorageMB', threshold: 0.95 }
                ];
                
                criticalLimits.forEach(limit => {
                    const limitData = data.result.find(l => l.name === limit.name);
                    if (limitData && limitData.max > 0) {
                        const usage = limitData.remaining / limitData.max;
                        if (usage < (1 - limit.threshold)) {
                            this.warnings.push({
                                type: 'GOVERNOR_LIMIT_WARNING',
                                message: `${limit.name} is at ${Math.round((1-usage) * 100)}% capacity`,
                                severity: 'WARNING'
                            });
                        }
                    }
                });
            }
        } catch (error) {
            console.error('Error checking governor limits:', error.message);
        }
    }

    /**
     * Report validation results
     */
    reportResults() {
        console.log('\n' + '='.repeat(60));
        console.log('VALIDATION RESULTS');
        console.log('='.repeat(60) + '\n');

        if (this.errors.length === 0 && this.warnings.length === 0) {
            console.log('✅ All validation checks passed!');
            return;
        }

        if (this.errors.length > 0) {
            console.log(`❌ Found ${this.errors.length} error(s):\n`);
            this.errors.forEach((error, index) => {
                console.log(`${index + 1}. [${error.type}] ${error.message}`);
                if (error.file) console.log(`   File: ${error.file}`);
                if (error.line) console.log(`   Line: ${error.line}`);
                console.log();
            });
        }

        if (this.warnings.length > 0) {
            console.log(`⚠️  Found ${this.warnings.length} warning(s):\n`);
            this.warnings.forEach((warning, index) => {
                console.log(`${index + 1}. [${warning.type}] ${warning.message}`);
                if (warning.file) console.log(`   File: ${warning.file}`);
                console.log();
            });
        }

        console.log('='.repeat(60));
        
        if (this.errors.length > 0) {
            console.log('\n🛑 Deployment blocked due to errors. Please fix all errors before deploying.');
            process.exit(1);
        }
    }
}

// CLI execution
if (require.main === module) {
    const validator = new SalesforcePreDeploymentValidator(process.argv[2] || 'production');
    const deploymentPath = process.argv[3] || process.cwd();
    
    validator.validate(deploymentPath).then(success => {
        if (!success) {
            process.exit(1);
        }
    }).catch(error => {
        console.error('Validation failed:', error);
        process.exit(1);
    });
}

module.exports = SalesforcePreDeploymentValidator;