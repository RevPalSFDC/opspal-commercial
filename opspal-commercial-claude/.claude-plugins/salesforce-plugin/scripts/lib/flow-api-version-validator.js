#!/usr/bin/env node

/**
 * Flow API Version Validator
 *
 * Validates Salesforce Flow metadata for API version compatibility.
 * Detects deprecated patterns and suggests/performs migrations.
 *
 * Key Checks:
 * - API version declared and appropriate
 * - No deprecated patterns for declared API version
 * - Patterns match API version requirements
 * - Auto-migration available for deprecated patterns
 *
 * Usage:
 *   const validator = new FlowAPIVersionValidator();
 *   const result = await validator.validate(flowXmlPath);
 *
 * @module flow-api-version-validator
 * @version 1.0.0
 * @created 2025-10-24
 * @addresses Cohort #3 - Flow API v65.0 Compatibility ($15k ROI)
 */

const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');

class FlowAPIVersionValidator {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.autoMigrate = options.autoMigrate || false;

        this.compatibilityConfig = this.loadConfig('flow-api-version-compatibility.json');
        this.deprecatedPatternsConfig = this.loadConfig('deprecated-flow-patterns.json');

        this.stats = {
            totalValidations: 0,
            passed: 0,
            failed: 0,
            deprecatedPatternsFound: 0,
            autoMigrated: 0
        };
    }

    /**
     * Load configuration file
     */
    loadConfig(filename) {
        try {
            const configPath = path.join(__dirname, '../../config', filename);
            if (fs.existsSync(configPath)) {
                return JSON.parse(fs.readFileSync(configPath, 'utf8'));
            }
        } catch (error) {
            if (this.verbose) {
                console.warn(`Warning: Could not load ${filename}: ${error.message}`);
            }
        }
        return {};
    }

    /**
     * Validate flow file for API version compatibility
     *
     * @param {string} flowXmlPath - Path to flow-meta.xml file
     * @returns {Object} Validation result
     */
    async validate(flowXmlPath) {
        this.stats.totalValidations++;

        const result = {
            valid: false,
            flowPath: flowXmlPath,
            flowName: path.basename(flowXmlPath, '.flow-meta.xml'),
            apiVersion: null,
            errors: [],
            warnings: [],
            deprecatedPatterns: [],
            migrationAvailable: false,
            timestamp: new Date().toISOString()
        };

        // Read and parse flow XML
        let flowContent, flowXml;
        try {
            flowContent = fs.readFileSync(flowXmlPath, 'utf8');
            flowXml = await xml2js.parseStringPromise(flowContent);
        } catch (error) {
            result.errors.push({
                type: 'PARSE_ERROR',
                message: `Failed to parse flow XML: ${error.message}`,
                severity: 'CRITICAL'
            });
            this.stats.failed++;
            return result;
        }

        // Extract API version
        const flow = flowXml.Flow || flowXml;
        result.apiVersion = this.extractAPIVersion(flow);

        if (!result.apiVersion) {
            result.warnings.push({
                type: 'MISSING_API_VERSION',
                message: 'No API version declared - recommend adding explicit version',
                severity: 'HIGH',
                suggestion: 'Add <apiVersion>66.0</apiVersion> to flow metadata'
            });
        }

        // Check for deprecated patterns
        const deprecatedPatterns = await this.findDeprecatedPatterns(flowContent, result.apiVersion);
        result.deprecatedPatterns = deprecatedPatterns;

        if (deprecatedPatterns.length > 0) {
            this.stats.deprecatedPatternsFound += deprecatedPatterns.length;

            for (const pattern of deprecatedPatterns) {
                result.errors.push({
                    type: 'DEPRECATED_PATTERN',
                    pattern: pattern.name,
                    message: pattern.message,
                    severity: pattern.severity,
                    migrationAvailable: pattern.auto_fixable
                });

                if (pattern.auto_fixable) {
                    result.migrationAvailable = true;
                }
            }
        }

        // Validate version-specific requirements
        if (result.apiVersion) {
            const versionErrors = this.validateVersionRequirements(flow, result.apiVersion);
            result.errors.push(...versionErrors);
        }

        // Determine overall validity
        const criticalErrors = result.errors.filter(e => e.severity === 'CRITICAL');
        result.valid = criticalErrors.length === 0;

        // Update stats
        if (result.valid) {
            this.stats.passed++;
        } else {
            this.stats.failed++;
        }

        return result;
    }

    /**
     * Extract API version from flow
     */
    extractAPIVersion(flow) {
        if (flow.apiVersion && flow.apiVersion[0]) {
            return parseFloat(flow.apiVersion[0]);
        }
        return null;
    }

    /**
     * Find deprecated patterns in flow XML
     */
    async findDeprecatedPatterns(flowContent, apiVersion) {
        const patterns = [];
        const deprecatedList = this.deprecatedPatternsConfig.patterns || [];

        for (const pattern of deprecatedList) {
            // Check if pattern applies to this API version
            if (apiVersion && this.isPatternDeprecatedForVersion(pattern, apiVersion)) {
                // Search for pattern in XML
                const regex = new RegExp(pattern.detection.xml_regex, 'gi');
                const matches = flowContent.match(regex);

                if (matches && matches.length > 0) {
                    patterns.push({
                        id: pattern.pattern_id,
                        name: pattern.name,
                        message: `Deprecated pattern found: ${pattern.description}`,
                        severity: pattern.severity,
                        deprecated_in: pattern.deprecated_in,
                        auto_fixable: pattern.migration?.auto_fixable || false,
                        migration_script: pattern.migration?.script,
                        occurrences: matches.length,
                        example_old: pattern.examples?.v64_pattern?.xml,
                        example_new: pattern.examples?.v65_pattern?.xml
                    });
                }
            }
        }

        return patterns;
    }

    /**
     * Check if pattern is deprecated for given API version
     */
    isPatternDeprecatedForVersion(pattern, apiVersion) {
        if (!pattern.deprecated_in) return false;

        const deprecatedVersion = parseFloat(pattern.deprecated_in.replace('v', ''));
        return apiVersion >= deprecatedVersion;
    }

    /**
     * Validate version-specific requirements
     */
    validateVersionRequirements(flow, apiVersion) {
        const errors = [];

        // v65.0+ specific checks
        if (apiVersion >= 65.0) {
            // Check for actionType='flow' in actionCalls
            const actionCalls = this.extractElements(flow, 'actionCalls');
            for (const actionCall of actionCalls) {
                if (actionCall.actionType && actionCall.actionType[0] === 'flow') {
                    errors.push({
                        type: 'INVALID_PATTERN',
                        message: 'actionType="flow" not supported in API v65.0+',
                        severity: 'CRITICAL',
                        element: 'actionCalls',
                        fix: 'Use subflows element instead'
                    });
                }
            }
        }

        return errors;
    }

    /**
     * Extract elements from flow by type
     */
    extractElements(flow, elementType) {
        const elements = [];

        const traverse = (obj) => {
            if (typeof obj !== 'object' || obj === null) return;

            if (obj[elementType]) {
                const items = Array.isArray(obj[elementType]) ? obj[elementType] : [obj[elementType]];
                elements.push(...items);
            }

            for (const key in obj) {
                if (typeof obj[key] === 'object') {
                    traverse(obj[key]);
                }
            }
        };

        traverse(flow);
        return elements;
    }

    /**
     * Get validation statistics
     */
    getStats() {
        return {
            ...this.stats,
            successRate: this.stats.totalValidations > 0
                ? (this.stats.passed / this.stats.totalValidations * 100).toFixed(1) + '%'
                : 'N/A'
        };
    }
}

// CLI usage
if (require.main === module) {
    const validator = new FlowAPIVersionValidator({ verbose: true });

    const command = process.argv[2];

    if (command === 'validate') {
        const flowPath = process.argv[3];

        if (!flowPath) {
            console.error('Usage: node flow-api-version-validator.js validate <flow-xml-path>');
            process.exit(1);
        }

        validator.validate(flowPath).then(result => {
            console.log('\n=== Flow API Version Validation ===\n');
            console.log(`Flow: ${result.flowName}`);
            console.log(`API Version: ${result.apiVersion || 'Not declared'}`);
            console.log(`Status: ${result.valid ? '✅ VALID' : '❌ INVALID'}`);

            if (result.warnings.length > 0) {
                console.log('\n--- Warnings ---');
                for (const warning of result.warnings) {
                    console.log(`⚠️  [${warning.type}] ${warning.message}`);
                    if (warning.suggestion) {
                        console.log(`   Suggestion: ${warning.suggestion}`);
                    }
                }
            }

            if (result.errors.length > 0) {
                console.log('\n--- Errors ---');
                for (const error of result.errors) {
                    console.log(`❌ [${error.type}] ${error.message}`);
                    if (error.fix) {
                        console.log(`   Fix: ${error.fix}`);
                    }
                }
            }

            if (result.deprecatedPatterns.length > 0) {
                console.log('\n--- Deprecated Patterns ---');
                for (const pattern of result.deprecatedPatterns) {
                    console.log(`\n🔴 ${pattern.name} (${pattern.occurrences} occurrence(s))`);
                    console.log(`   Deprecated in: ${pattern.deprecated_in}`);
                    console.log(`   ${pattern.message}`);
                    if (pattern.auto_fixable) {
                        console.log(`   ✅ Auto-migration available: ${pattern.migration_script}`);
                    }
                }
            }

            if (result.migrationAvailable) {
                console.log('\n--- Migration Available ---');
                console.log('✅ This flow can be automatically migrated');
                console.log('Run: node scripts/lib/flow-pattern-migrator.js migrate ' + flowPath);
            }

            console.log('\n--- Statistics ---');
            const stats = validator.getStats();
            console.log(`Total Validations: ${stats.totalValidations}`);
            console.log(`Success Rate: ${stats.successRate}`);

            process.exit(result.valid ? 0 : 1);
        }).catch(error => {
            console.error('Validation error:', error);
            process.exit(1);
        });

    } else {
        console.log('Flow API Version Validator');
        console.log('');
        console.log('Usage:');
        console.log('  node flow-api-version-validator.js validate <flow-xml-path>');
        console.log('');
        console.log('Example:');
        console.log('  node flow-api-version-validator.js validate force-app/main/default/flows/MyFlow.flow-meta.xml');
    }
}

module.exports = FlowAPIVersionValidator;
