#!/usr/bin/env node

/**
 * Lifecycle Governance Loader
 *
 * Loads funnel stage definitions and validates org configuration against
 * lifecycle stage exit criteria. Provides Python-callable CLI interface.
 *
 * QA-004: Bridges lifecycle definitions to assessment output.
 *
 * @version 1.0.0
 * @date 2026-02-02
 */

const fs = require('fs');
const path = require('path');

// Default path to funnel stage definitions
const DEFAULT_DEFINITIONS_PATH = path.join(
    __dirname,
    '../../../opspal-core/config/funnel-stage-definitions.json'
);

/**
 * Load lifecycle stage definitions
 * @param {string} definitionsPath - Optional custom path to definitions file
 * @returns {Object} Lifecycle definitions
 */
function loadDefinitions(definitionsPath = null) {
    const filePath = definitionsPath || DEFAULT_DEFINITIONS_PATH;

    if (!fs.existsSync(filePath)) {
        throw new Error(`Lifecycle definitions not found: ${filePath}`);
    }

    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

/**
 * Get standard funnel stages
 * @param {Object} definitions - Loaded definitions
 * @returns {Array} Array of standard stage objects
 */
function getStandardStages(definitions) {
    return definitions.standardFunnelStages?.stages || [];
}

/**
 * Get platform-specific stage mapping
 * @param {Object} definitions - Loaded definitions
 * @param {string} platform - Platform name (salesforce, hubspot)
 * @returns {Object} Platform stage mapping
 */
function getPlatformMapping(definitions, platform) {
    return definitions.platformDefaults?.[platform] || null;
}

/**
 * Get stage exit criteria for governance validation
 * @param {Object} definitions - Loaded definitions
 * @param {string} platform - Platform name
 * @returns {Array} Exit criteria for each stage
 */
function getStageExitCriteria(definitions, platform) {
    const stages = getStandardStages(definitions);
    const platformMapping = getPlatformMapping(definitions, platform);

    if (!platformMapping) {
        return stages.map(stage => ({
            position: stage.position,
            name: stage.name,
            metrics: stage.metrics || [],
            exitCriteria: []
        }));
    }

    return stages.map(stage => {
        const stageKey = stage.name.toLowerCase().replace(/\s+/g, '_');
        const platformConfig = platformMapping.stageMapping?.[stageKey];

        return {
            position: stage.position,
            name: stage.name,
            description: stage.description,
            metrics: stage.metrics || [],
            exitCriteria: platformConfig ? [
                {
                    type: 'object_exists',
                    object: platformConfig.object,
                    filters: platformConfig.filters
                }
            ] : []
        };
    });
}

/**
 * Get data quality rules for lifecycle governance
 * @param {Object} definitions - Loaded definitions
 * @param {string} platform - Platform name
 * @returns {Object} Data quality rules
 */
function getDataQualityRules(definitions, platform) {
    const rules = definitions.dataQualityRules || {};
    return {
        requiredFields: rules.requiredFields?.[platform] || {},
        minimumRecords: rules.minimumRecords || {},
        minimumDateRange: rules.minimumDateRange || { days: 90 }
    };
}

/**
 * Get conversion calculation formulas
 * @param {Object} definitions - Loaded definitions
 * @returns {Object} Conversion formulas
 */
function getConversionFormulas(definitions) {
    return definitions.conversionCalculations?.formulas || {};
}

/**
 * Validate org has required fields for lifecycle tracking
 * @param {Object} orgMetadata - Org metadata (fields, objects)
 * @param {Object} definitions - Loaded definitions
 * @param {string} platform - Platform name
 * @returns {Object} Validation result with violations
 */
function validateLifecycleRequirements(orgMetadata, definitions, platform) {
    const violations = [];
    const rules = getDataQualityRules(definitions, platform);

    // Check required fields exist
    for (const [objectName, requiredFields] of Object.entries(rules.requiredFields)) {
        const objectFields = orgMetadata.objects?.[objectName]?.fields || [];
        const objectFieldNames = objectFields.map(f => f.name || f);

        for (const field of requiredFields) {
            if (!objectFieldNames.includes(field)) {
                violations.push({
                    type: 'MISSING_REQUIRED_FIELD',
                    severity: 'warn',
                    object: objectName,
                    field: field,
                    message: `Required field ${field} missing on ${objectName} for lifecycle tracking`
                });
            }
        }
    }

    return {
        isValid: violations.length === 0,
        violations,
        checkedObjects: Object.keys(rules.requiredFields),
        platform
    };
}

/**
 * Generate lifecycle governance section for assessment output
 * @param {Object} options - Options
 * @param {string} options.platform - Platform name (default: salesforce)
 * @param {string} options.definitionsPath - Optional custom definitions path
 * @param {Object} options.orgMetadata - Optional org metadata for validation
 * @returns {Object} Lifecycle governance section
 */
function generateGovernanceSection(options = {}) {
    const platform = options.platform || 'salesforce';
    const definitions = loadDefinitions(options.definitionsPath);

    const stages = getStageExitCriteria(definitions, platform);
    const formulas = getConversionFormulas(definitions);
    const dataQualityRules = getDataQualityRules(definitions, platform);

    const result = {
        lifecycle_governance: {
            version: definitions.version || '1.0.0',
            platform,
            stages_defined: stages.length,
            stages: stages.map(s => ({
                position: s.position,
                name: s.name,
                description: s.description,
                metrics: s.metrics,
                exit_criteria_count: s.exitCriteria.length
            })),
            conversion_formulas: Object.keys(formulas),
            data_quality_requirements: {
                minimum_date_range_days: dataQualityRules.minimumDateRange.days,
                minimum_record_counts: dataQualityRules.minimumRecords
            }
        }
    };

    // If org metadata provided, run validation
    if (options.orgMetadata) {
        const validation = validateLifecycleRequirements(
            options.orgMetadata,
            definitions,
            platform
        );
        result.lifecycle_governance.validation = validation;
        result.lifecycle_governance.compliant = validation.isValid;
    }

    return result;
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    const usage = `
Lifecycle Governance Loader

Usage:
  node lifecycle-governance-loader.js stages [--platform <name>]
  node lifecycle-governance-loader.js formulas
  node lifecycle-governance-loader.js governance [--platform <name>] [--json]
  node lifecycle-governance-loader.js validate <org-metadata.json> [--platform <name>]

Commands:
  stages      List standard funnel stages with exit criteria
  formulas    List conversion calculation formulas
  governance  Generate full governance section for assessment
  validate    Validate org metadata against lifecycle requirements

Options:
  --platform  Platform name: salesforce (default), hubspot
  --json      Output as JSON (default for governance command)
`;

    if (!command || command === '--help' || command === '-h') {
        console.log(usage);
        process.exit(0);
    }

    try {
        const definitions = loadDefinitions();
        const platformIdx = args.indexOf('--platform');
        const platform = platformIdx !== -1 ? args[platformIdx + 1] : 'salesforce';
        const jsonOutput = args.includes('--json');

        switch (command) {
            case 'stages': {
                const stages = getStageExitCriteria(definitions, platform);
                if (jsonOutput) {
                    console.log(JSON.stringify(stages, null, 2));
                } else {
                    console.log(`\n📊 Standard Funnel Stages (${platform})\n${'='.repeat(50)}`);
                    stages.forEach(s => {
                        console.log(`\n${s.position}. ${s.name}`);
                        console.log(`   ${s.description || 'No description'}`);
                        console.log(`   Metrics: ${s.metrics.join(', ') || 'None'}`);
                        console.log(`   Exit criteria: ${s.exitCriteria.length} defined`);
                    });
                }
                break;
            }

            case 'formulas': {
                const formulas = getConversionFormulas(definitions);
                if (jsonOutput) {
                    console.log(JSON.stringify(formulas, null, 2));
                } else {
                    console.log(`\n📈 Conversion Formulas\n${'='.repeat(50)}`);
                    for (const [name, formula] of Object.entries(formulas)) {
                        console.log(`\n${name}:`);
                        console.log(`  ${formula.numerator} / ${formula.denominator}`);
                        console.log(`  ${formula.description}`);
                    }
                }
                break;
            }

            case 'governance': {
                const section = generateGovernanceSection({ platform });
                console.log(JSON.stringify(section, null, 2));
                break;
            }

            case 'validate': {
                const metadataPath = args[1];
                if (!metadataPath) {
                    console.error('Error: org-metadata.json path required');
                    process.exit(1);
                }
                if (!fs.existsSync(metadataPath)) {
                    console.error(`Error: File not found: ${metadataPath}`);
                    process.exit(1);
                }

                const orgMetadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
                const section = generateGovernanceSection({
                    platform,
                    orgMetadata
                });

                console.log(JSON.stringify(section, null, 2));

                if (!section.lifecycle_governance.compliant) {
                    process.exit(1);
                }
                break;
            }

            default:
                console.error(`Unknown command: ${command}`);
                console.log(usage);
                process.exit(1);
        }
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

module.exports = {
    loadDefinitions,
    getStandardStages,
    getPlatformMapping,
    getStageExitCriteria,
    getDataQualityRules,
    getConversionFormulas,
    validateLifecycleRequirements,
    generateGovernanceSection
};
