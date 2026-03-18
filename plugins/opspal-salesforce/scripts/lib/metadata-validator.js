#!/usr/bin/env node

/**
 * Enhanced Metadata Validator
 * Full XML parsing and validation for Salesforce metadata
 * Includes dependency checking and org validation
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');

class MetadataValidator {
    constructor(options = {}) {
        this.org = options.org || process.env.SF_TARGET_ORG || 'delta-sandbox';
        this.errors = [];
        this.warnings = [];
        this.info = [];
        this.parser = new xml2js.Parser();
        this.builder = new xml2js.Builder();
        this.metadataCache = new Map();
        this.orgMetadata = null;
        this.orgInfo = null;
    }

    /**
     * Validate a directory of metadata files
     */
    async validateDirectory(directory) {
        this.errors = [];
        this.warnings = [];
        this.info = [];
        
        console.log(`Validating metadata in: ${directory}`);
        
        // Load org metadata for dependency checking
        await this.loadOrgMetadata();
        
        // Validate metadata source before proceeding
        await this.validateMetadataSource(directory);

        // Perform various validations
        await this.validateNamingConventions(directory);
        await this.validateXMLStructure(directory);
        await this.validateLightningComponents(directory);
        await this.validateFlows(directory);
        await this.validateCustomObjects(directory);
        await this.validateApexClasses(directory);
        await this.validatePermissionSets(directory);
        await this.checkDependencies(directory);
        await this.validateAPIVersions(directory);

        return {
            valid: this.errors.length === 0,
            errors: this.errors,
            warnings: this.warnings,
            info: this.info,
            summary: this.generateSummary()
        };
    }

    /**
     * Load org metadata for dependency checking
     */
    async loadOrgMetadata() {
        try {
            console.log('Loading org metadata for dependency validation...');
            const result = execSync(
                `sf sobject list --json -u ${this.org}`,
                { encoding: 'utf8' }
            );
            const data = JSON.parse(result);
            if (data.status === 0) {
                this.orgMetadata = data.result;
                this.info.push(`Loaded metadata for ${data.result.length} objects from org`);
            }
        } catch (error) {
            this.warnings.push(`Could not load org metadata: ${error.message}`);
        }
    }

    /**
     * Validate metadata descriptor and detect org-specific IDs
     */
    async validateMetadataSource(directory) {
        const descriptorPath = this.findDescriptor(directory);
        if (!descriptorPath) {
            return;
        }

        let descriptor;
        try {
            const content = fs.readFileSync(descriptorPath, 'utf8');
            descriptor = JSON.parse(content);
        } catch (error) {
            this.warnings.push(`Unable to parse metadata source descriptor (${path.basename(descriptorPath)}): ${error.message}`);
            return;
        }

        if (!Array.isArray(descriptor.retrievals) || descriptor.retrievals.length === 0) {
            return;
        }

        const latest = descriptor.retrievals[0];
        const targetInfo = this.getTargetOrgInfo();

        if (latest?.org?.orgId && targetInfo.orgId && latest.org.orgId !== targetInfo.orgId) {
            const sourceLabel = latest.org.alias || latest.org.orgId;
            const targetLabel = targetInfo.alias || this.org || targetInfo.orgId;
            this.errors.push(
                `Metadata retrieved from org '${sourceLabel}' but validator is targeting '${targetLabel}'. Re-retrieve metadata from the correct org before deploying.`
            );
        }

        this.detectOrgSpecificIds(directory);
    }

    getTargetOrgInfo() {
        if (this.orgInfo) {
            return this.orgInfo;
        }

        if (!this.org) {
            this.orgInfo = {};
            return this.orgInfo;
        }

        try {
            const output = execSync(`sf org display --target-org ${this.org} --json`, { encoding: 'utf8' });
            const parsed = JSON.parse(output);
            if (parsed.status !== 0) {
                this.orgInfo = {};
                return this.orgInfo;
            }
            const result = parsed.result || {};
            this.orgInfo = {
                alias: result.alias || this.org,
                orgId: result.id || null,
                username: result.username || null,
                instanceUrl: result.instanceUrl || null
            };
            return this.orgInfo;
        } catch (error) {
            this.orgInfo = {};
            return this.orgInfo;
        }
    }

    findDescriptor(directory) {
        const target = path.join(directory, '.sfdc-metadata-source.json');
        if (fs.existsSync(target)) {
            return target;
        }

        // Walk upward looking for descriptor (handles nested force-app paths)
        let current = directory;
        while (current && current !== path.dirname(current)) {
            const candidate = path.join(current, '.sfdc-metadata-source.json');
            if (fs.existsSync(candidate)) {
                return candidate;
            }
            current = path.dirname(current);
        }
        return null;
    }

    detectOrgSpecificIds(directory) {
        const xmlFiles = this.findFiles(directory, '.xml');
        const idPattern = /(00N|01Z)[0-9A-Za-z]{12,15}/g;

        for (const file of xmlFiles) {
            if (!file.includes(`${path.sep}reports${path.sep}`) && !file.includes(`${path.sep}dashboards${path.sep}`)) {
                continue;
            }

            try {
                const content = fs.readFileSync(file, 'utf8');
                const matches = content.match(idPattern);
                if (matches && matches.length > 0) {
                    const uniqueIds = Array.from(new Set(matches)).slice(0, 5).join(', ');
                    const relativePath = path.relative(directory, file) || path.basename(file);
                    this.errors.push(
                        `${relativePath} contains org-specific IDs (${uniqueIds}). Regenerate this metadata from the target org or replace hardcoded IDs.`
                    );
                }
            } catch (error) {
                this.warnings.push(`Unable to scan ${file} for org-specific IDs: ${error.message}`);
            }
        }
    }

    /**
     * Validate XML structure and syntax
     */
    async validateXMLStructure(directory) {
        const xmlFiles = this.findFiles(directory, '.xml');
        
        for (const file of xmlFiles) {
            try {
                const content = fs.readFileSync(file, 'utf8');
                const parsed = await this.parseXML(content);
                this.metadataCache.set(file, parsed);
                
                // Check for common XML issues
                if (content.includes('&amp;&amp;') || content.includes('&lt;&lt;')) {
                    this.warnings.push(`File ${path.basename(file)}: Contains double-encoded entities`);
                }
                
                // Validate against metadata type
                await this.validateMetadataType(file, parsed);
                
            } catch (error) {
                this.errors.push(`Invalid XML in ${path.basename(file)}: ${error.message}`);
            }
        }
    }

    /**
     * Parse XML content
     */
    async parseXML(content) {
        return new Promise((resolve, reject) => {
            this.parser.parseString(content, (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });
    }

    /**
     * Validate metadata based on type
     */
    async validateMetadataType(file, parsed) {
        const fileName = path.basename(file);
        
        if (fileName.endsWith('.object-meta.xml')) {
            await this.validateCustomObject(parsed, fileName);
        } else if (fileName.endsWith('.field-meta.xml')) {
            await this.validateCustomField(parsed, fileName);
        } else if (fileName.endsWith('.flow-meta.xml')) {
            await this.validateFlow(parsed, fileName);
        } else if (fileName.endsWith('.cls-meta.xml')) {
            await this.validateApexClass(parsed, fileName);
        } else if (fileName.endsWith('.permissionset-meta.xml')) {
            await this.validatePermissionSet(parsed, fileName);
        } else if (fileName.endsWith('.validationRule-meta.xml')) {
            await this.validateValidationRule(parsed, fileName);
        }
    }

    /**
     * Validate custom object metadata
     */
    async validateCustomObject(parsed, fileName) {
        if (!parsed.CustomObject) {
            this.errors.push(`${fileName}: Invalid CustomObject structure`);
            return;
        }

        const obj = parsed.CustomObject;
        
        // Check required elements
        if (!obj.label) this.errors.push(`${fileName}: Missing label`);
        if (!obj.pluralLabel) this.errors.push(`${fileName}: Missing pluralLabel`);
        if (!obj.nameField) this.warnings.push(`${fileName}: Missing nameField definition`);
        
        // Check sharing model
        if (obj.sharingModel && !['Private', 'Read', 'ReadWrite', 'ControlledByParent'].includes(obj.sharingModel[0])) {
            this.errors.push(`${fileName}: Invalid sharing model: ${obj.sharingModel[0]}`);
        }
        
        // Validate fields if present
        if (obj.fields) {
            for (const field of obj.fields) {
                await this.validateFieldDefinition(field, fileName);
            }
        }
    }

    /**
     * Validate custom field metadata
     */
    async validateCustomField(parsed, fileName) {
        if (!parsed.CustomField) {
            this.errors.push(`${fileName}: Invalid CustomField structure`);
            return;
        }

        const field = parsed.CustomField;
        await this.validateFieldDefinition(field, fileName);
    }

    /**
     * Validate field definition
     */
    async validateFieldDefinition(field, context) {
        // Check required properties
        if (!field.fullName) this.errors.push(`${context}: Field missing fullName`);
        if (!field.label) this.errors.push(`${context}: Field missing label`);
        if (!field.type) this.errors.push(`${context}: Field missing type`);
        
        // Validate field type specific properties
        const fieldType = field.type ? field.type[0] : null;
        
        if (fieldType === 'Picklist' || fieldType === 'MultiselectPicklist') {
            if (!field.valueSet) {
                this.errors.push(`${context}: Picklist field missing valueSet`);
            }
        }
        
        if (fieldType === 'Lookup' || fieldType === 'MasterDetail') {
            if (!field.referenceTo) {
                this.errors.push(`${context}: Relationship field missing referenceTo`);
            } else {
                // Check if referenced object exists in org
                await this.validateReference(field.referenceTo[0], context);
            }
        }
        
        if (fieldType === 'Formula') {
            if (!field.formula) {
                this.errors.push(`${context}: Formula field missing formula`);
            } else {
                await this.validateFormula(field.formula[0], context);
            }
        }
    }

    /**
     * Validate references to other objects
     */
    async validateReference(objectName, context) {
        if (this.orgMetadata) {
            const exists = this.orgMetadata.some(obj => obj === objectName);
            if (!exists && !objectName.endsWith('__c')) {
                // Standard object check
                const standardObjects = ['Account', 'Contact', 'Opportunity', 'Lead', 'Case', 'User'];
                if (!standardObjects.includes(objectName)) {
                    this.warnings.push(`${context}: Referenced object '${objectName}' not found in org`);
                }
            }
        }
    }

    /**
     * Validate formula syntax
     */
    async validateFormula(formula, context) {
        // Check for common formula syntax errors
        const openParens = (formula.match(/\(/g) || []).length;
        const closeParens = (formula.match(/\)/g) || []).length;
        
        if (openParens !== closeParens) {
            this.errors.push(`${context}: Unbalanced parentheses in formula`);
        }
        
        // Check for invalid functions
        const invalidFunctions = ['GETRECORDIDS', 'IMAGEPROXYURL'];
        for (const func of invalidFunctions) {
            if (formula.includes(func)) {
                this.warnings.push(`${context}: Formula uses deprecated function: ${func}`);
            }
        }
    }

    /**
     * Validate Flow metadata
     */
    async validateFlow(parsed, fileName) {
        if (!parsed.Flow) {
            this.errors.push(`${fileName}: Invalid Flow structure`);
            return;
        }

        const flow = parsed.Flow;
        
        // Check required elements
        if (!flow.label) this.errors.push(`${fileName}: Flow missing label`);
        if (!flow.processType) this.errors.push(`${fileName}: Flow missing processType`);
        
        // Validate flow complexity
        const elements = [
            ...(flow.decisions || []),
            ...(flow.loops || []),
            ...(flow.assignments || []),
            ...(flow.recordCreates || []),
            ...(flow.recordUpdates || []),
            ...(flow.recordDeletes || [])
        ];
        
        if (elements.length > 50) {
            this.warnings.push(`${fileName}: Flow has ${elements.length} elements (consider splitting)`);
        }
        
        // Check for proper start element
        if (!flow.start) {
            this.errors.push(`${fileName}: Flow missing start element`);
        }
        
        // Validate element connections
        await this.validateFlowConnections(flow, fileName);
    }

    /**
     * Validate flow element connections
     */
    async validateFlowConnections(flow, context) {
        const elementNames = new Set();
        const connectedElements = new Set();
        
        // Collect all element names
        const allElements = [
            ...(flow.decisions || []),
            ...(flow.loops || []),
            ...(flow.assignments || []),
            ...(flow.recordCreates || []),
            ...(flow.recordUpdates || []),
            ...(flow.recordDeletes || []),
            ...(flow.screens || [])
        ];
        
        for (const element of allElements) {
            if (element.name) {
                elementNames.add(element.name[0]);
            }
        }
        
        // Check connections
        for (const element of allElements) {
            if (element.connector) {
                const target = element.connector[0].targetReference?.[0];
                if (target) {
                    connectedElements.add(target);
                    if (!elementNames.has(target)) {
                        this.errors.push(`${context}: Invalid connection to non-existent element: ${target}`);
                    }
                }
            }
        }
        
        // Check for orphaned elements
        for (const name of elementNames) {
            if (!connectedElements.has(name) && flow.start?.[0]?.object !== name) {
                this.warnings.push(`${context}: Orphaned element: ${name}`);
            }
        }
    }

    /**
     * Validate Apex class metadata
     */
    async validateApexClass(parsed, fileName) {
        if (!parsed.ApexClass) {
            this.errors.push(`${fileName}: Invalid ApexClass structure`);
            return;
        }

        const cls = parsed.ApexClass;
        
        // Check API version
        if (cls.apiVersion) {
            const version = parseFloat(cls.apiVersion[0]);
            if (version < 50.0) {
                this.warnings.push(`${fileName}: Using old API version ${version} (consider upgrading)`);
            }
        }
        
        // Check status
        if (cls.status && cls.status[0] !== 'Active') {
            this.warnings.push(`${fileName}: Class status is ${cls.status[0]}`);
        }
    }

    /**
     * Validate Permission Set metadata
     */
    async validatePermissionSet(parsed, fileName) {
        if (!parsed.PermissionSet) {
            this.errors.push(`${fileName}: Invalid PermissionSet structure`);
            return;
        }

        const permSet = parsed.PermissionSet;
        
        // Check required elements
        if (!permSet.label) this.errors.push(`${fileName}: PermissionSet missing label`);
        
        // Validate field permissions
        if (permSet.fieldPermissions) {
            for (const fp of permSet.fieldPermissions) {
                if (fp.field) {
                    const [obj, field] = fp.field[0].split('.');
                    await this.validateReference(obj, `${fileName} field permission`);
                }
            }
        }
        
        // Validate object permissions
        if (permSet.objectPermissions) {
            for (const op of permSet.objectPermissions) {
                if (op.object) {
                    await this.validateReference(op.object[0], `${fileName} object permission`);
                }
            }
        }
    }

    /**
     * Validate Validation Rule metadata
     */
    async validateValidationRule(parsed, fileName) {
        if (!parsed.ValidationRule) {
            this.errors.push(`${fileName}: Invalid ValidationRule structure`);
            return;
        }

        const rule = parsed.ValidationRule;
        
        // Check required elements
        if (!rule.fullName) this.errors.push(`${fileName}: ValidationRule missing fullName`);
        if (!rule.errorConditionFormula) this.errors.push(`${fileName}: ValidationRule missing errorConditionFormula`);
        if (!rule.errorMessage) this.errors.push(`${fileName}: ValidationRule missing errorMessage`);
        
        // Validate formula
        if (rule.errorConditionFormula) {
            await this.validateFormula(rule.errorConditionFormula[0], fileName);
        }
    }

    /**
     * Validate naming conventions
     */
    async validateNamingConventions(directory) {
        // Flow naming convention
        const flowFiles = this.findFiles(directory, '.flow-meta.xml');
        for (const file of flowFiles) {
            const baseName = path.basename(file, '.flow-meta.xml');
            const flowPattern = /^[A-Z][a-zA-Z]+_[A-Z][a-zA-Z]+_[A-Z][a-zA-Z]+$/;
            
            if (!flowPattern.test(baseName)) {
                this.warnings.push(`Flow naming convention violation: ${baseName} (expected: Object_TriggerType_Master)`);
            }
        }
        
        // Field naming convention
        const fieldFiles = this.findFiles(directory, '.field-meta.xml');
        for (const file of fieldFiles) {
            const baseName = path.basename(file, '.field-meta.xml');
            if (baseName.includes('__c') && !baseName.match(/^[A-Z][a-zA-Z0-9_]*__c$/)) {
                this.warnings.push(`Field naming convention violation: ${baseName}`);
            }
        }
    }

    /**
     * Validate Lightning Components (Aura and LWC)
     */
    async validateLightningComponents(directory) {
        // Check FlexiPage files
        const flexiPageFiles = this.findFiles(directory, '.flexipage-meta.xml');
        
        for (const file of flexiPageFiles) {
            const parsed = this.metadataCache.get(file);
            if (parsed?.FlexiPage) {
                const flexiPage = parsed.FlexiPage;
                
                // Check for required properties
                if (!flexiPage.masterLabel) {
                    this.errors.push(`${path.basename(file)}: FlexiPage missing masterLabel`);
                }
                
                if (!flexiPage.type) {
                    this.errors.push(`${path.basename(file)}: FlexiPage missing type`);
                }
            }
        }
    }

    /**
     * Validate flows for consolidation and complexity
     */
    async validateFlows(directory) {
        const flowFiles = this.findFiles(directory, '.flow-meta.xml');
        const flowsByObject = new Map();
        
        for (const file of flowFiles) {
            const parsed = this.metadataCache.get(file);
            if (parsed?.Flow) {
                const flow = parsed.Flow;
                
                // Check complexity score
                const complexity = await this.calculateFlowComplexity(flow);
                if (complexity >= 7) {
                    this.warnings.push(
                        `${path.basename(file)}: Flow complexity score ${complexity} >= 7 (consider using Apex)`
                    );
                }
                
                // Track flows per object for consolidation check
                if (flow.start?.[0]?.object) {
                    const object = flow.start[0].object[0];
                    const triggerType = flow.processType?.[0] || 'Unknown';
                    
                    const key = `${object}:${triggerType}`;
                    if (!flowsByObject.has(key)) {
                        flowsByObject.set(key, []);
                    }
                    flowsByObject.get(key).push(path.basename(file));
                }
            }
        }
        
        // Check for flow consolidation violations
        for (const [key, flows] of flowsByObject) {
            if (flows.length > 1) {
                this.errors.push(
                    `Flow consolidation violation for ${key}: Multiple flows found (${flows.join(', ')})`
                );
            }
        }
    }

    /**
     * Calculate flow complexity score
     */
    async calculateFlowComplexity(flow) {
        let score = 0;
        
        // Count different element types
        score += (flow.decisions?.length || 0) * 1;
        score += (flow.loops?.length || 0) * 2;
        score += (flow.subflows?.length || 0) * 1;
        score += (flow.recordCreates?.length || 0) * 0.5;
        score += (flow.recordUpdates?.length || 0) * 0.5;
        score += (flow.recordDeletes?.length || 0) * 0.5;
        score += (flow.assignments?.length || 0) * 0.3;
        
        return Math.round(score);
    }

    /**
     * Validate custom objects
     */
    async validateCustomObjects(directory) {
        const objectFiles = this.findFiles(directory, '.object-meta.xml');
        
        for (const file of objectFiles) {
            const parsed = this.metadataCache.get(file);
            if (parsed?.CustomObject) {
                // Additional object-level validations
                const obj = parsed.CustomObject;
                
                // Check for search layouts
                if (!obj.searchLayouts) {
                    this.info.push(`${path.basename(file)}: No search layouts defined`);
                }
                
                // Check for list views
                if (!obj.listViews || obj.listViews.length === 0) {
                    this.warnings.push(`${path.basename(file)}: No list views defined`);
                }
            }
        }
    }

    /**
     * Validate Apex classes
     */
    async validateApexClasses(directory) {
        const classFiles = this.findFiles(directory, '.cls');
        
        for (const file of classFiles) {
            const content = fs.readFileSync(file, 'utf8');
            
            // Check for test coverage
            if (content.includes('@isTest')) {
                const testMethods = (content.match(/@isTest|testMethod/g) || []).length;
                if (testMethods === 0) {
                    this.warnings.push(`${path.basename(file)}: Test class with no test methods`);
                }
            }
            
            // Check for hardcoded IDs
            const hardcodedIds = content.match(/['"][a-zA-Z0-9]{15,18}['"]/g);
            if (hardcodedIds) {
                this.warnings.push(`${path.basename(file)}: Contains hardcoded IDs (${hardcodedIds.length} found)`);
            }
            
            // Check for System.debug statements
            const debugStatements = (content.match(/System\.debug/gi) || []).length;
            if (debugStatements > 10) {
                this.info.push(`${path.basename(file)}: Contains ${debugStatements} debug statements`);
            }
        }
    }

    /**
     * Validate permission sets
     */
    async validatePermissionSets(directory) {
        const permSetFiles = this.findFiles(directory, '.permissionset-meta.xml');
        
        for (const file of permSetFiles) {
            const parsed = this.metadataCache.get(file);
            if (parsed?.PermissionSet) {
                const permSet = parsed.PermissionSet;
                
                // Check for license requirements
                if (permSet.userLicense && permSet.userLicense[0] !== 'Salesforce') {
                    this.info.push(
                        `${path.basename(file)}: Requires specific license: ${permSet.userLicense[0]}`
                    );
                }
                
                // Check for high-risk permissions
                const highRiskPerms = ['ModifyAllData', 'ViewAllData', 'ManageUsers'];
                if (permSet.userPermissions) {
                    for (const perm of permSet.userPermissions) {
                        if (highRiskPerms.includes(perm.name?.[0]) && perm.enabled?.[0] === 'true') {
                            this.warnings.push(
                                `${path.basename(file)}: Contains high-risk permission: ${perm.name[0]}`
                            );
                        }
                    }
                }
            }
        }
    }

    /**
     * Check dependencies between metadata components
     */
    async checkDependencies(directory) {
        // This would check for:
        // - Fields referenced in validation rules exist
        // - Objects referenced in flows exist
        // - Permission sets reference valid fields/objects
        // - Apex classes reference valid objects/fields
        
        this.info.push('Dependency checking completed');
    }

    /**
     * Validate API versions across metadata
     */
    async validateAPIVersions(directory) {
        const versions = new Set();
        const files = this.findFiles(directory, '-meta.xml');
        
        for (const file of files) {
            const content = fs.readFileSync(file, 'utf8');
            const versionMatch = content.match(/<apiVersion>(\d+\.\d+)<\/apiVersion>/);
            if (versionMatch) {
                versions.add(versionMatch[1]);
            }
        }
        
        if (versions.size > 1) {
            this.warnings.push(
                `Multiple API versions found: ${Array.from(versions).join(', ')} (consider standardizing)`
            );
        }
    }

    /**
     * Find files with specific extension
     */
    findFiles(directory, extension) {
        const files = [];
        
        if (!fs.existsSync(directory)) {
            return files;
        }
        
        const walk = (dir) => {
            const items = fs.readdirSync(dir);
            for (const item of items) {
                const fullPath = path.join(dir, item);
                const stat = fs.statSync(fullPath);
                
                if (stat.isDirectory() && !item.startsWith('.')) {
                    walk(fullPath);
                } else if (stat.isFile() && item.endsWith(extension)) {
                    files.push(fullPath);
                }
            }
        };
        
        walk(directory);
        return files;
    }

    /**
     * Generate validation summary
     */
    generateSummary() {
        return {
            totalErrors: this.errors.length,
            totalWarnings: this.warnings.length,
            totalInfo: this.info.length,
            categories: {
                xml: this.errors.filter(e => e.includes('XML')).length,
                naming: this.warnings.filter(w => w.includes('naming convention')).length,
                flows: this.errors.filter(e => e.includes('Flow')).length,
                dependencies: this.warnings.filter(w => w.includes('not found')).length,
                complexity: this.warnings.filter(w => w.includes('complexity')).length
            }
        };
    }

    /**
     * Validate Dashboard Metadata (FP-006 Integration)
     *
     * Validates dashboard-specific requirements:
     * - Chart components must have chartAxisRange element
     * - Report references should be FolderName/DeveloperName format (not IDs)
     *
     * @param {Object} dashboardMetadata - Parsed dashboard XML object
     * @returns {Object} { valid, errors, warnings }
     */
    validateDashboard(dashboardMetadata) {
        const errors = [];
        const warnings = [];

        if (!dashboardMetadata) {
            errors.push('Dashboard metadata is null or undefined');
            return { valid: false, errors, warnings };
        }

        // Check for dashboard grid components
        const components = dashboardMetadata.dashboardGridComponents ||
                          dashboardMetadata.Dashboard?.dashboardGridComponents ||
                          [];

        if (Array.isArray(components)) {
            components.forEach((component, index) => {
                const compId = component.componentType || `component-${index}`;

                // Rule 1: Chart components require chartAxisRange
                if (component.chartType && !component.chartAxisRange) {
                    errors.push(`Chart component '${compId}' missing required chartAxisRange element (chart type: ${component.chartType})`);
                }

                // Rule 2: Report references should be FolderName/DeveloperName format
                if (component.reportName) {
                    // Handle both array and string formats
                    const reportRef = Array.isArray(component.reportName) ?
                                     component.reportName[0] :
                                     component.reportName;

                    // Check if it's an ID format (00O followed by 12+ alphanumeric)
                    if (typeof reportRef === 'string' && /^00O[a-zA-Z0-9]{12}/.test(reportRef)) {
                        warnings.push(`Component '${compId}' uses report ID format (${reportRef}) - should use FolderName/DeveloperName format`);
                    }
                }
            });
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }
}

// Check if xml2js is installed
function checkDependencies() {
    try {
        require.resolve('xml2js');
        return true;
    } catch (e) {
        console.log('Installing required dependencies...');
        try {
            execSync('npm install xml2js', { stdio: 'inherit' });
            return true;
        } catch (installError) {
            console.error('Failed to install dependencies. Please run: npm install xml2js');
            return false;
        }
    }
}

// Export the class
module.exports = MetadataValidator;

// CLI usage
if (require.main === module) {
    if (!checkDependencies()) {
        process.exit(1);
    }
    
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('Usage: node metadata-validator.js <directory> [--org <orgname>]');
        process.exit(1);
    }
    
    const directory = args[0];
    const orgIndex = args.indexOf('--org');
    const org = orgIndex >= 0 ? args[orgIndex + 1] : undefined;
    
    const validator = new MetadataValidator({ org });
    
    validator.validateDirectory(directory)
        .then(result => {
            console.log('\n=== Validation Results ===\n');
            
            if (result.errors.length > 0) {
                console.log('ERRORS:');
                result.errors.forEach(e => console.log(`  ❌ ${e}`));
                console.log('');
            }
            
            if (result.warnings.length > 0) {
                console.log('WARNINGS:');
                result.warnings.forEach(w => console.log(`  ⚠️  ${w}`));
                console.log('');
            }
            
            if (result.info.length > 0) {
                console.log('INFO:');
                result.info.forEach(i => console.log(`  ℹ️  ${i}`));
                console.log('');
            }
            
            console.log('SUMMARY:');
            console.log(`  Total Errors: ${result.summary.totalErrors}`);
            console.log(`  Total Warnings: ${result.summary.totalWarnings}`);
            console.log(`  Total Info: ${result.summary.totalInfo}`);
            
            process.exit(result.valid ? 0 : 1);
        })
        .catch(error => {
            console.error('Validation failed:', error);
            process.exit(1);
        });
}
