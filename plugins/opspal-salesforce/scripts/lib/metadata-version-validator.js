#!/usr/bin/env node

/**
 * Metadata Version Validator
 *
 * Validates that metadata properties are compatible with the specified API version.
 * Prevents deployment failures from using properties that require higher API versions.
 *
 * Based on lessons learned from Issue #004: CustomTab mobileReady property not valid in v60.0
 *
 * Usage:
 *   node scripts/lib/metadata-version-validator.js <metadata-path> [api-version]
 *   node scripts/lib/metadata-version-validator.js force-app/main/default/tabs
 *   node scripts/lib/metadata-version-validator.js force-app/main/default/tabs 60.0
 *   node scripts/lib/metadata-version-validator.js force-app/main/default/tabs/MyTab.tab-meta.xml 60.0
 *
 * If api-version not specified, will try to find from package.xml or use default 60.0
 *
 * Exit codes:
 *   0 = All properties compatible with API version
 *   1 = Incompatible properties found
 *   2 = Usage error or missing files
 */

const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');

/**
 * Property compatibility matrix
 * Format: { metadataType: { propertyName: minApiVersion } }
 */
const PROPERTY_COMPATIBILITY = {
    CustomTab: {
        mobileReady: 61.0,
        hasSidebar: 30.0,
        swidth: 30.0
    },
    FlexiPage: {
        lightningPreview: 55.0,
        masterLabel: 38.0,
        platformActionList: 44.0
    },
    CustomApplication: {
        utilityBar: 38.0,
        workspaceMapping: 40.0,
        actionOverrides: 37.0
    },
    LightningComponentBundle: {
        isExposed: 45.0,
        masterLabel: 45.0,
        targetConfigs: 45.0,
        targets: 45.0
    },
    CustomObject: {
        deploymentStatus: 14.0,
        enableActivities: 14.0,
        enableBulkApi: 17.0,
        enableFeeds: 18.0,
        enableHistory: 14.0,
        enableReports: 14.0,
        enableSearch: 14.0,
        enableSharing: 14.0,
        enableStreamingApi: 24.0
    },
    CustomField: {
        caseSensitive: 14.0,
        externalId: 14.0,
        trackFeedHistory: 18.0,
        trackHistory: 14.0,
        trackTrending: 37.0,
        unique: 14.0
    },
    Layout: {
        platformActionList: 28.0,
        quickActionList: 28.0,
        relatedContent: 28.0
    },
    Profile: {
        custom: 14.0,
        userLicense: 14.0
    }
};

class MetadataVersionValidator {
    constructor(metadataPath, defaultApiVersion = null) {
        this.metadataPath = metadataPath;
        this.defaultApiVersion = defaultApiVersion;
        this.errors = [];
        this.warnings = [];
    }

    /**
     * Main validation entry point
     */
    async validate() {
        console.log('🔍 Metadata Version Validator\n');

        if (!fs.existsSync(this.metadataPath)) {
            this.addError(`Metadata path not found: ${this.metadataPath}`);
            return this.getResults();
        }

        // Try to find project API version if not provided
        if (!this.defaultApiVersion) {
            this.defaultApiVersion = this.findProjectApiVersion();
        }

        if (this.defaultApiVersion) {
            console.log(`🎯 Using API version: ${this.defaultApiVersion}\n`);
        }

        const stat = fs.statSync(this.metadataPath);
        const files = stat.isDirectory()
            ? this.findMetadataFiles(this.metadataPath)
            : [this.metadataPath];

        console.log(`📄 Validating ${files.length} metadata file(s)\n`);

        for (const file of files) {
            await this.validateFile(file);
        }

        return this.getResults();
    }

    /**
     * Try to find project API version from package.xml or manifest
     */
    findProjectApiVersion() {
        // Look for package.xml in common locations
        const packagePaths = [
            'package.xml',
            'manifest/package.xml',
            'force-app/main/default/package.xml',
            '../../../package.xml'
        ];

        for (const pkgPath of packagePaths) {
            const fullPath = path.resolve(this.metadataPath, pkgPath);
            if (fs.existsSync(fullPath)) {
                try {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    const versionMatch = content.match(/<version>([\d.]+)<\/version>/);
                    if (versionMatch) {
                        return parseFloat(versionMatch[1]);
                    }
                } catch (error) {
                    // Continue to next path
                }
            }
        }

        // Default to 60.0 if not found
        return 60.0;
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
     * Validate a single metadata file
     */
    async validateFile(filePath) {
        const fileName = path.basename(filePath);
        console.log(`  🔍 Validating ${fileName}...`);

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const parser = new xml2js.Parser();
            const result = await parser.parseStringPromise(content);

            // Extract metadata type from root element
            const metadataType = Object.keys(result)[0];
            const metadata = result[metadataType];

            // Extract API version from file or use default
            let apiVersion = this.extractApiVersion(content);
            if (!apiVersion) {
                apiVersion = this.defaultApiVersion;
                console.log(`     API Version: ${apiVersion} (default)`);
            } else {
                console.log(`     API Version: ${apiVersion}`);
            }

            // Validate properties against compatibility matrix
            this.validateProperties(metadataType, metadata, apiVersion, filePath);

        } catch (error) {
            this.addError(`Failed to parse ${fileName}: ${error.message}`, { file: filePath });
        }
    }

    /**
     * Extract API version from metadata file
     */
    extractApiVersion(content) {
        const versionMatch = content.match(/<apiVersion>([\d.]+)<\/apiVersion>/);
        return versionMatch ? parseFloat(versionMatch[1]) : null;
    }

    /**
     * Validate properties against compatibility matrix
     */
    validateProperties(metadataType, metadata, apiVersion, filePath) {
        const compatibility = PROPERTY_COMPATIBILITY[metadataType];
        if (!compatibility) {
            console.log(`     ℹ️ No version rules for ${metadataType}\n`);
            return;
        }

        const properties = this.flattenMetadata(metadata);
        let issuesFound = 0;

        for (const [property, value] of Object.entries(properties)) {
            const requiredVersion = compatibility[property];

            if (requiredVersion && apiVersion < requiredVersion) {
                this.addError(
                    `Property '${property}' requires API version ${requiredVersion}, but file uses ${apiVersion}`,
                    {
                        file: filePath,
                        property,
                        currentVersion: apiVersion,
                        requiredVersion,
                        suggestion: `Remove '${property}' property or upgrade API version to ${requiredVersion}`
                    }
                );
                issuesFound++;
            }
        }

        if (issuesFound === 0) {
            console.log(`     ✅ All properties compatible\n`);
        } else {
            console.log(`     ❌ ${issuesFound} incompatible properties\n`);
        }
    }

    /**
     * Flatten metadata object to property list
     */
    flattenMetadata(obj, prefix = '') {
        const properties = {};

        for (const key of Object.keys(obj)) {
            if (key === '$') continue; // Skip XML attributes

            const value = obj[key];
            const fullKey = prefix ? `${prefix}.${key}` : key;

            if (value && typeof value === 'object' && !Array.isArray(value)) {
                Object.assign(properties, this.flattenMetadata(value, fullKey));
            } else {
                properties[key] = value;
            }
        }

        return properties;
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
        console.log('📋 VALIDATION RESULTS');
        console.log('═'.repeat(60) + '\n');

        if (hasErrors) {
            console.log('❌ ERRORS:\n');
            this.errors.forEach((err, i) => {
                console.log(`  ${i + 1}. ${err.message}`);
                if (err.file) {
                    console.log(`     File: ${err.file}`);
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
                if (warn.file) {
                    console.log(`     File: ${warn.file}`);
                }
                console.log('');
            });
        }

        if (!hasErrors && !hasWarnings) {
            console.log('✅ All metadata properties are compatible with their API versions!\n');
        } else {
            console.log(`\n❌ Validation FAILED: ${this.errors.length} errors, ${this.warnings.length} warnings\n`);
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
        console.error('Usage: node metadata-version-validator.js <metadata-path> [api-version]');
        console.error('Example: node metadata-version-validator.js force-app/main/default/tabs');
        console.error('Example: node metadata-version-validator.js force-app/main/default/tabs 60.0');
        process.exit(2);
    }

    const metadataPath = args[0];
    const apiVersion = args[1] ? parseFloat(args[1]) : null;
    const validator = new MetadataVersionValidator(metadataPath, apiVersion);

    validator.validate().then(result => {
        process.exit(result.success ? 0 : 1);
    }).catch(error => {
        console.error('Fatal error:', error.message);
        process.exit(2);
    });
}

module.exports = MetadataVersionValidator;
