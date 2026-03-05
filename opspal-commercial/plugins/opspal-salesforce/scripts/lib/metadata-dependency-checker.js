#!/usr/bin/env node

/**
 * Metadata Dependency Checker
 *
 * Validates that all referenced metadata components exist before deployment.
 * Prevents deployment failures from missing dependencies.
 *
 * Based on lessons learned from Issue #005: CustomApplication referencing non-existent FlexiPage
 *
 * Usage:
 *   node scripts/lib/metadata-dependency-checker.js <metadata-path> [org-alias]
 *   node scripts/lib/metadata-dependency-checker.js force-app/main/default/applications/MyApp.app-meta.xml myorg
 *   node scripts/lib/metadata-dependency-checker.js force-app/main/default --recursive myorg
 *
 * Exit codes:
 *   0 = All dependencies exist
 *   1 = Missing dependencies found
 *   2 = Usage error or missing files
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Dependency patterns for different metadata types
 * Format: { metadataType: { property: { type: 'MetadataType', query: 'soqlTemplate' } } }
 */
const DEPENDENCY_PATTERNS = {
    CustomApplication: {
        utilityBar: {
            type: 'FlexiPage',
            query: "SELECT Id, DeveloperName FROM FlexiPage WHERE DeveloperName = '{value}'"
        },
        tabs: {
            type: 'Tab',
            isArray: true,
            // Tabs can be standard-* or custom object tabs
            skipValidation: value => value.startsWith('standard-')
        }
    },
    QuickAction: {
        flowDefinition: {
            type: 'Flow',
            query: "SELECT Id, Definition.DeveloperName FROM Flow WHERE Definition.DeveloperName = '{value}' AND Status = 'Active'"
        }
    },
    FlexiPage: {
        sobjectType: {
            type: 'CustomObject',
            query: "SELECT QualifiedApiName FROM EntityDefinition WHERE QualifiedApiName = '{value}'"
        }
    },
    Layout: {
        // Layouts reference custom buttons, fields, etc.
        customButtons: {
            type: 'WebLink',
            isArray: true
        }
    },
    Flow: {
        // Flows can reference Apex classes, objects, fields
        apexClass: {
            type: 'ApexClass',
            query: "SELECT Id, Name FROM ApexClass WHERE Name = '{value}'"
        }
    }
};

class MetadataDependencyChecker {
    constructor(metadataPath, orgAlias = null) {
        this.metadataPath = metadataPath;
        this.orgAlias = orgAlias || process.env.SF_TARGET_ORG;
        this.errors = [];
        this.warnings = [];
        this.checkedDependencies = new Set();
    }

    /**
     * Main validation entry point
     */
    async validate() {
        console.log('🔍 Metadata Dependency Checker\n');

        if (!this.orgAlias) {
            this.addWarning('No org alias specified - dependency checking limited to local files only');
            console.log('💡 Provide org alias for complete validation: node metadata-dependency-checker.js <path> <org>\n');
        } else {
            console.log(`🎯 Target org: ${this.orgAlias}\n`);
        }

        if (!fs.existsSync(this.metadataPath)) {
            this.addError(`Metadata path not found: ${this.metadataPath}`);
            return this.getResults();
        }

        const stat = fs.statSync(this.metadataPath);
        const files = stat.isDirectory()
            ? this.findMetadataFiles(this.metadataPath)
            : [this.metadataPath];

        console.log(`📄 Checking ${files.length} metadata file(s)\n`);

        for (const file of files) {
            await this.checkFile(file);
        }

        return this.getResults();
    }

    /**
     * Find all metadata XML files in directory
     */
    findMetadataFiles(dir) {
        const files = [];
        const items = fs.readdirSync(dir);

        for (const item of items) {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
                files.push(...this.findMetadataFiles(fullPath));
            } else if (item.endsWith('-meta.xml')) {
                files.push(fullPath);
            }
        }

        return files;
    }

    /**
     * Check dependencies for a single file
     */
    async checkFile(filePath) {
        const fileName = path.basename(filePath);
        console.log(`  🔍 Checking ${fileName}...`);

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const metadataType = this.extractMetadataType(content);

            if (!metadataType) {
                console.log(`     ⚠️ Unknown metadata type\n`);
                return;
            }

            const dependencies = this.extractDependencies(content, metadataType);

            if (dependencies.length === 0) {
                console.log(`     ℹ️ No dependencies to check\n`);
                return;
            }

            console.log(`     Found ${dependencies.length} dependencies`);

            let missingCount = 0;
            for (const dep of dependencies) {
                const exists = await this.checkDependencyExists(dep, filePath);
                if (!exists) {
                    missingCount++;
                }
            }

            if (missingCount === 0) {
                console.log(`     ✅ All dependencies exist\n`);
            } else {
                console.log(`     ❌ ${missingCount} missing dependencies\n`);
            }

        } catch (error) {
            this.addError(`Failed to check ${fileName}: ${error.message}`, { file: filePath });
        }
    }

    /**
     * Extract metadata type from XML
     */
    extractMetadataType(content) {
        const typeMatch = content.match(/<(\w+)\s+xmlns/);
        return typeMatch ? typeMatch[1] : null;
    }

    /**
     * Extract dependencies from metadata content
     */
    extractDependencies(content, metadataType) {
        const dependencies = [];
        const patterns = DEPENDENCY_PATTERNS[metadataType];

        if (!patterns) {
            return dependencies;
        }

        for (const [property, config] of Object.entries(patterns)) {
            const regex = new RegExp(`<${property}>([^<]+)</${property}>`, 'g');
            let match;

            while ((match = regex.exec(content)) !== null) {
                const value = match[1].trim();

                // Skip if validation should be skipped
                if (config.skipValidation && config.skipValidation(value)) {
                    continue;
                }

                dependencies.push({
                    property,
                    value,
                    type: config.type,
                    query: config.query
                });
            }
        }

        return dependencies;
    }

    /**
     * Check if a dependency exists
     */
    async checkDependencyExists(dependency, sourceFile) {
        const cacheKey = `${dependency.type}:${dependency.value}`;

        // Skip if already checked
        if (this.checkedDependencies.has(cacheKey)) {
            return true;
        }

        // First check local files
        const localExists = this.checkLocalDependency(dependency);
        if (localExists) {
            this.checkedDependencies.add(cacheKey);
            return true;
        }

        // Then check org if available
        if (this.orgAlias && dependency.query) {
            const orgExists = await this.checkOrgDependency(dependency);
            if (orgExists) {
                this.checkedDependencies.add(cacheKey);
                return true;
            }
        }

        // Dependency not found
        this.addError(
            `Missing ${dependency.type}: ${dependency.value}`,
            {
                file: sourceFile,
                dependencyType: dependency.type,
                dependencyName: dependency.value,
                property: dependency.property,
                suggestion: `Create ${dependency.type} '${dependency.value}' or remove reference from ${path.basename(sourceFile)}`
            }
        );

        return false;
    }

    /**
     * Check if dependency exists in local files
     */
    checkLocalDependency(dependency) {
        // Map metadata type to directory and file pattern
        const typeMap = {
            FlexiPage: { dir: 'flexipages', ext: '.flexipage-meta.xml' },
            Flow: { dir: 'flows', ext: '.flow-meta.xml' },
            ApexClass: { dir: 'classes', ext: '.cls' },
            CustomObject: { dir: 'objects', ext: '.object-meta.xml' },
            WebLink: { dir: 'weblinks', ext: '.weblink-meta.xml' },
            Tab: { dir: 'tabs', ext: '.tab-meta.xml' }
        };

        const mapping = typeMap[dependency.type];
        if (!mapping) {
            return false;
        }

        // Build search paths from metadata path
        const basePath = this.metadataPath.includes('/applications/')
            ? path.dirname(this.metadataPath).replace('/applications', '')
            : path.dirname(this.metadataPath);

        // Look for file in common locations
        const possiblePaths = [
            // Relative to base path
            path.join(basePath, mapping.dir, dependency.value + mapping.ext),
            // Standard force-app structure
            path.join('force-app/main/default', mapping.dir, dependency.value + mapping.ext),
            // Current directory
            path.join(mapping.dir, dependency.value + mapping.ext),
            // Sibling to metadata path
            path.join(path.dirname(this.metadataPath), '..', mapping.dir, dependency.value + mapping.ext)
        ];

        for (const testPath of possiblePaths) {
            const resolvedPath = path.resolve(testPath);
            if (fs.existsSync(resolvedPath)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Check if dependency exists in org
     */
    async checkOrgDependency(dependency) {
        if (!dependency.query) {
            return false;
        }

        try {
            const query = dependency.query.replace('{value}', dependency.value);
            const result = execSync(
                `sf data query --query "${query}" --target-org ${this.orgAlias} --json`,
                { encoding: 'utf8' }
            );

            const data = JSON.parse(result);
            return data.result && data.result.records && data.result.records.length > 0;

        } catch (error) {
            // Query failed - dependency might not exist
            return false;
        }
    }

    /**
     * Add error to results
     */
    addError(message, details = {}) {
        this.errors.push({ message, ...details });
    }

    /**
     * Add warning to results
     */
    addWarning(message, details = {}) {
        this.warnings.push({ message, ...details });
    }

    /**
     * Get validation results
     */
    getResults() {
        const hasErrors = this.errors.length > 0;
        const hasWarnings = this.warnings.length > 0;

        console.log('═'.repeat(60));
        console.log('📋 DEPENDENCY CHECK RESULTS');
        console.log('═'.repeat(60) + '\n');

        if (hasErrors) {
            console.log('❌ MISSING DEPENDENCIES:\n');
            this.errors.forEach((err, i) => {
                console.log(`  ${i + 1}. ${err.message}`);
                if (err.file) {
                    console.log(`     Source: ${err.file}`);
                }
                if (err.property) {
                    console.log(`     Property: ${err.property}`);
                }
                if (err.suggestion) {
                    console.log(`     💡 ${err.suggestion}`);
                }
                console.log('');
            });
        }

        if (hasWarnings) {
            console.log('⚠️  WARNINGS:\n');
            this.warnings.forEach((warn, i) => {
                console.log(`  ${i + 1}. ${warn.message}`);
                console.log('');
            });
        }

        if (!hasErrors && !hasWarnings) {
            console.log('✅ All dependencies exist!\n');
        } else if (!hasErrors) {
            console.log('✅ All dependencies exist (warnings noted above)\n');
        } else {
            console.log(`\n❌ Validation FAILED: ${this.errors.length} missing dependencies\n`);
            console.log('⚠️  Fix missing dependencies before deployment to prevent failures\n');
        }

        return {
            success: !hasErrors,
            errors: this.errors,
            warnings: this.warnings
        };
    }
}

// CLI execution
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.error('Usage: node metadata-dependency-checker.js <metadata-path> [org-alias]');
        console.error('Example: node metadata-dependency-checker.js force-app/main/default/applications');
        console.error('Example: node metadata-dependency-checker.js force-app/main/default/applications myorg');
        process.exit(2);
    }

    const metadataPath = args[0];
    const orgAlias = args[1] || null;
    const checker = new MetadataDependencyChecker(metadataPath, orgAlias);

    checker.validate().then(result => {
        process.exit(result.success ? 0 : 1);
    }).catch(error => {
        console.error('Fatal error:', error.message);
        process.exit(2);
    });
}

module.exports = MetadataDependencyChecker;
