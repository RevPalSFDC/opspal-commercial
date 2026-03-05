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

const { execSafe } = require('./lib/child_process_safe');
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
            picklistFormulas: true,
            reportSyntax: true,
            apiLimitations: true,
            permissionSetFieldAccess: true
        };
        
        // Load API limitation mappings
        this.reportMappings = require('../config/report-mappings.json');
        this.fieldMappings = require('../config/field-mappings.json');

        this.fieldMetadataCache = new Map();
        this.objectFieldIndexCache = new Map();
    }

    /**
     * Main validation entry point
     */
    async validate(deploymentPath) {
        console.log('🔍 Starting Salesforce Pre-Deployment Validation...\n');
        
        // 1. Check field history tracking limits
        if (this.checks.fieldHistoryTracking) {
            await this.checkFieldHistoryLimits(deploymentPath);
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
        
        // 6. Validate report syntax
        if (this.checks.reportSyntax) {
            await this.validateReportSyntax(deploymentPath);
        }
        
        // 7. Validate permission set field permissions for unsupported relationships
        if (this.checks.permissionSetFieldAccess) {
            await this.validatePermissionSetFieldPermissions(deploymentPath);
        }

        // 8. Check API limitations
        if (this.checks.apiLimitations) {
            await this.checkAPILimitations(deploymentPath);
        }

        // Report results
        this.reportResults();
        
        return this.errors.length === 0;
    }

    /**
     * Check field history tracking limits (max 20 fields per object)
     */
    async checkFieldHistoryLimits(deploymentPath) {
        console.log('📊 Checking field history tracking limits...');

        try {
            const scanPath = deploymentPath || process.cwd();
            const fieldFiles = this.findFiles(scanPath, '.field-meta.xml');

            const trackedFieldFiles = fieldFiles.filter(file => {
                try {
                    const contents = fs.readFileSync(file, 'utf8');
                    return contents.includes('<trackHistory>true</trackHistory>');
                } catch (error) {
                    return false;
                }
            });

            if (trackedFieldFiles.length === 0) {
                console.log('No tracked field changes detected in deployment path.');
                return;
            }

            const fieldsByObject = new Map();

            trackedFieldFiles.forEach(filePath => {
                const match = filePath.match(/[/\\]objects[/\\]([^/\\]+)[/\\]fields[/\\]([^/\\]+)\.field-meta\.xml$/);
                if (!match) return;
                const objectName = match[1];
                const fieldName = match[2];

                if (!fieldsByObject.has(objectName)) {
                    fieldsByObject.set(objectName, new Set());
                }
                fieldsByObject.get(objectName).add(fieldName);
            });

            for (const [objectName, fieldSet] of fieldsByObject.entries()) {
                const fieldNames = Array.from(fieldSet);
                let newTrackedFields = 0;

                for (const fieldName of fieldNames) {
                    const safeFieldName = fieldName.replace(/'/g, "\\'");
                    const safeObjectName = objectName.replace(/'/g, "\\'");
                    const fieldQuery = `SELECT IsFieldHistoryTracked FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '${safeObjectName}' AND QualifiedApiName = '${safeObjectName}.${safeFieldName}'`;

                    try {
                        const { stdout } = await execSafe(
                            `sf data query --query "${fieldQuery}" --use-tooling-api --json -o ${this.orgAlias}`,
                            { timeout: 20000 }
                        );
                        const fieldData = JSON.parse(stdout);
                        const isTracked = fieldData.result?.records?.[0]?.IsFieldHistoryTracked === true;

                        if (!isTracked) {
                            newTrackedFields += 1;
                        }
                    } catch (error) {
                        newTrackedFields += 1;
                    }
                }

                const countQuery = `SELECT COUNT() FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = '${objectName}' AND IsFieldHistoryTracked = true`;
                const { stdout } = await execSafe(
                    `sf data query --query "${countQuery}" --use-tooling-api --json -o ${this.orgAlias}`,
                    { timeout: 20000 }
                );
                const countData = JSON.parse(stdout);
                const currentCount = countData.result?.totalSize || 0;

                if (newTrackedFields === 0) {
                    if (currentCount >= 20) {
                        this.warnings.push({
                            type: 'FIELD_HISTORY_WARNING',
                            object: objectName,
                            message: `Object ${objectName} is at field history limit (${currentCount}/20) but deployment adds no new tracked fields`,
                            severity: 'WARNING'
                        });
                    } else if (currentCount >= 15) {
                        this.warnings.push({
                            type: 'FIELD_HISTORY_WARNING',
                            object: objectName,
                            message: `Object ${objectName} has ${currentCount}/20 tracked fields`,
                            severity: 'WARNING'
                        });
                    }
                    continue;
                }

                const totalAfterDeploy = currentCount + newTrackedFields;

                if (totalAfterDeploy > 20) {
                    this.errors.push({
                        type: 'FIELD_HISTORY_LIMIT',
                        object: objectName,
                        message: `Object ${objectName} would exceed field history limit (${totalAfterDeploy}/20)`,
                        severity: 'ERROR'
                    });
                } else if (totalAfterDeploy >= 20) {
                    this.warnings.push({
                        type: 'FIELD_HISTORY_WARNING',
                        object: objectName,
                        message: `Object ${objectName} will reach field history limit (${totalAfterDeploy}/20) after deployment`,
                        severity: 'WARNING'
                    });
                }
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
            
            const { stdout } = await execSafe(`sf data query --query "${query}" --use-tooling-api --json -o ${this.orgAlias}`, { timeout: 20000 });
            const data = JSON.parse(stdout);
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
            const { stdout } = await execSafe(`sf project deploy start --source-dir ${apexPath} --check-only --json -o ${this.orgAlias}`, { timeout: 600000 });
            const data = JSON.parse(stdout);
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
                const errorData = JSON.parse(error?.stdout || '{}');
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
            const { stdout } = await execSafe(`sf limits api display --json -o ${this.orgAlias}`, { timeout: 20000 });
            const data = JSON.parse(stdout);
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
     * Validate report syntax
     */
    async validateReportSyntax(deploymentPath) {
        console.log('📊 Validating report syntax...');
        
        if (!deploymentPath || !fs.existsSync(deploymentPath)) {
            console.log('  ⚠️ No deployment path specified for report validation\n');
            return;
        }
        
        try {
            // Find report files
            const reportFiles = this.findFiles(deploymentPath, '.report-meta.xml');
            
            for (const file of reportFiles) {
                const content = fs.readFileSync(file, 'utf-8');
                
                // Check report type
                const reportTypeMatch = content.match(/<reportType>([^<]+)<\/reportType>/);
                if (reportTypeMatch) {
                    const reportType = reportTypeMatch[1];
                    
                    // Check against blocked types
                    if (this.reportMappings.blockedReportTypes.types.includes(reportType)) {
                        this.errors.push({
                            type: 'BLOCKED_REPORT_TYPE',
                            file: file,
                            message: `Report type '${reportType}' cannot be created via API. Use UI or SOQL alternative.`,
                            severity: 'ERROR'
                        });
                    }
                    
                    // Check for incorrect naming
                    const correctName = this.reportMappings.uiToApiMappings.mappings[reportType];
                    if (correctName) {
                        this.warnings.push({
                            type: 'REPORT_TYPE_NAME',
                            file: file,
                            message: `Report type '${reportType}' should be '${correctName}'`,
                            severity: 'WARNING'
                        });
                    }
                }
                
                // Check date filters
                const dateFilters = content.match(/<interval>([^<]+)<\/interval>/g);
                if (dateFilters) {
                    dateFilters.forEach(filter => {
                        const interval = filter.match(/<interval>([^<]+)<\/interval>/)[1];
                        const correctFormat = this.reportMappings.dateFilterMappings.invalid[interval];
                        if (correctFormat) {
                            this.errors.push({
                                type: 'INVALID_DATE_FILTER',
                                file: file,
                                message: `Invalid date filter '${interval}'. Use '${correctFormat}' instead.`,
                                severity: 'ERROR'
                            });
                        }
                    });
                }
            }
            
            console.log(`  ✅ Validated ${reportFiles.length} report files\n`);
            
        } catch (error) {
            console.log(`  ❌ Report validation error: ${error.message}\n`);
        }
    }
    
    /**
     * Check for API limitations
     */
    async checkAPILimitations(deploymentPath) {
        console.log('🚫 Checking for API limitations...');
        
        if (this.errors.some(e => e.type === 'BLOCKED_REPORT_TYPE')) {
            this.warnings.push({
                type: 'API_LIMITATION_DETECTED',
                message: 'Deployment contains components blocked by Salesforce API. Consider using workarounds:',
                suggestions: [
                    '1. Use SOQL queries instead: node scripts/soql-report-converter.js',
                    '2. Create manually through UI',
                    '3. See docs/SALESFORCE_API_LIMITATIONS.md for complete guide'
                ],
                severity: 'WARNING'
            });
        }
        
        console.log('  ✅ API limitation check complete\n');
    }

    /**
     * Validate permission sets to ensure they do not grant access to master-detail fields
     */
    async validatePermissionSetFieldPermissions(deploymentPath) {
        console.log('🛡️ Checking permission sets for restricted fields...');

        const permDir = path.join(deploymentPath, 'force-app/main/default/permissionsets');
        if (!fs.existsSync(permDir)) {
            console.log('  ⚠️ No permission sets directory found\n');
            return;
        }

        const permFiles = this.findFiles(permDir, '.permissionset-meta.xml');
        if (permFiles.length === 0) {
            console.log('  ⚠️ No permission set files detected\n');
            return;
        }

        const unresolvedCustomFields = new Set();

        permFiles.forEach(file => {
            const content = fs.readFileSync(file, 'utf-8');
            const permSetLabel = this.extractXmlValue(content, 'label') || path.basename(file, '.permissionset-meta.xml');
            const seenFields = new Set();
            const fieldBlocks = content.match(/<fieldPermissions>[\s\S]*?<\/fieldPermissions>/g) || [];

            fieldBlocks.forEach(block => {
                const fieldMatch = block.match(/<field>([^<]+)<\/field>/);
                if (!fieldMatch) {
                    return;
                }

                const fullField = fieldMatch[1].trim();
                if (seenFields.has(fullField)) {
                    return;
                }
                seenFields.add(fullField);

                const dotIndex = fullField.indexOf('.');
                if (dotIndex === -1) {
                    return;
                }

                const objectApiName = fullField.substring(0, dotIndex);
                const fieldApiName = fullField.substring(dotIndex + 1);

                const metadata = this.lookupFieldMetadata(objectApiName, fieldApiName, deploymentPath);
                if (metadata && metadata.type === 'MasterDetail') {
                    const sourceDetail = metadata.source ? this.formatMetadataSource(metadata.source, deploymentPath) : '';
                    this.errors.push({
                        type: 'MASTER_DETAIL_FIELD_PERMISSION',
                        message: `Permission set '${permSetLabel}' grants field-level access to ${fullField}, a master-detail field. Salesforce blocks deploying fieldPermissions for master-detail relationships${sourceDetail ? ` (definition: ${sourceDetail})` : ''}. Remove this entry to avoid deployment failure.`,
                        file: file,
                        severity: 'ERROR'
                    });
                } else if (!metadata && fieldApiName.endsWith('__c')) {
                    unresolvedCustomFields.add(fullField);
                }
            });
        });

        if (unresolvedCustomFields.size > 0) {
            this.warnings.push({
                type: 'PERMISSION_SET_METADATA_GAP',
                message: `Unable to locate metadata for custom fields referenced in permission sets: ${Array.from(unresolvedCustomFields).join(', ')}. Confirm these fields are not master-detail relationships before deployment.`,
                severity: 'WARNING'
            });
        }

        console.log('  ✅ Permission set validation complete\n');
    }

    /**
     * Find field metadata for a given object + field combination
     */
    lookupFieldMetadata(objectApiName, fieldApiName, deploymentPath) {
        const cacheKey = `${objectApiName}.${fieldApiName}`;
        if (this.fieldMetadataCache.has(cacheKey)) {
            return this.fieldMetadataCache.get(cacheKey);
        }

        const metadataDirs = [
            path.join(deploymentPath, 'force-app', 'main', 'default', 'objects'),
            path.join(deploymentPath, 'mdapi-convert', 'objects')
        ];

        for (const baseDir of metadataDirs) {
            if (!fs.existsSync(baseDir)) {
                continue;
            }

            const directFieldPath = path.join(baseDir, objectApiName, 'fields', `${fieldApiName}.field-meta.xml`);
            if (fs.existsSync(directFieldPath)) {
                const metadata = this.parseFieldMetadataFile(directFieldPath);
                this.fieldMetadataCache.set(cacheKey, metadata);
                return metadata;
            }

            const objectFilePath = path.join(baseDir, `${objectApiName}.object`);
            if (fs.existsSync(objectFilePath)) {
                const metadata = this.getFieldMetadataFromObjectFile(objectFilePath, fieldApiName);
                if (metadata) {
                    this.fieldMetadataCache.set(cacheKey, metadata);
                    return metadata;
                }
            }
        }

        this.fieldMetadataCache.set(cacheKey, null);
        return null;
    }

    /**
     * Parse standalone field metadata file
     */
    parseFieldMetadataFile(filePath) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const type = this.extractXmlValue(content, 'type');
        const requiredValue = this.extractXmlValue(content, 'required');
        return {
            type: type || null,
            required: requiredValue === 'true',
            source: filePath
        };
    }

    /**
     * Retrieve field metadata from an object definition file
     */
    getFieldMetadataFromObjectFile(filePath, fieldApiName) {
        if (!this.objectFieldIndexCache.has(filePath)) {
            const content = fs.readFileSync(filePath, 'utf-8');
            const matches = content.match(/<fields>[\s\S]*?<\/fields>/g) || [];
            const index = {};

            matches.forEach(block => {
                const name = this.extractXmlValue(block, 'fullName');
                if (!name) {
                    return;
                }

                const type = this.extractXmlValue(block, 'type');
                const requiredValue = this.extractXmlValue(block, 'required');
                index[name] = {
                    type: type || null,
                    required: requiredValue === 'true',
                    source: `${filePath}#${name}`
                };
            });

            this.objectFieldIndexCache.set(filePath, index);
        }

        const objectIndex = this.objectFieldIndexCache.get(filePath);
        return objectIndex[fieldApiName] || null;
    }

    /**
     * Helper to extract simple XML values
     */
    extractXmlValue(xml, tag) {
        const regex = new RegExp(`<${tag}>([^<]+)<\\/${tag}>`);
        const match = xml.match(regex);
        return match ? match[1].trim() : null;
    }

    /**
     * Format metadata source details for display
     */
    formatMetadataSource(source, deploymentPath) {
        const [rawPath, anchor] = source.split('#');
        const relativePath = path.relative(deploymentPath, rawPath);
        return anchor ? `${relativePath}#${anchor}` : relativePath;
    }
    
    /**
     * Find files with specific extension
     */
    findFiles(dir, ext) {
        const files = [];
        
        if (!fs.existsSync(dir)) {
            return files;
        }
        
        const items = fs.readdirSync(dir);
        items.forEach(item => {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
                files.push(...this.findFiles(fullPath, ext));
            } else if (item.endsWith(ext)) {
                files.push(fullPath);
            }
        });
        
        return files;
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
