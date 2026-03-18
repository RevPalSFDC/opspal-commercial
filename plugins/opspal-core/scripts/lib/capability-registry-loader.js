#!/usr/bin/env node

/**
 * Capability Registry Loader
 *
 * Loads the diagnostic capability registry and validates that all required
 * capabilities are available for a given assessment type.
 *
 * QA-006: Ensures new diagnostics are auto-injected into assessments.
 *
 * @version 1.0.0
 * @date 2026-02-02
 */

const fs = require('fs');
const path = require('path');

// Default path to capability registry
const DEFAULT_REGISTRY_PATH = path.join(__dirname, '../../config/diagnostic-capability-registry.json');

/**
 * Load capability registry from file
 * @param {string} registryPath - Optional custom path
 * @returns {Object} Capability registry
 */
function loadRegistry(registryPath = null) {
    const filePath = registryPath || DEFAULT_REGISTRY_PATH;

    if (!fs.existsSync(filePath)) {
        throw new Error(`Capability registry not found: ${filePath}`);
    }

    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

/**
 * Get required capabilities for an assessment type
 * @param {Object} registry - Loaded registry
 * @param {string} assessmentType - Assessment type (e.g., 'revops-assessment')
 * @returns {Array} Required capabilities
 */
function getRequiredCapabilities(registry, assessmentType) {
    return registry.requiredCapabilities?.[assessmentType] || [];
}

/**
 * Get optional capabilities applicable to an assessment type
 * @param {Object} registry - Loaded registry
 * @param {string} assessmentType - Assessment type
 * @returns {Array} Optional capabilities
 */
function getOptionalCapabilities(registry, assessmentType) {
    const optional = registry.optionalCapabilities || {};
    return Object.entries(optional)
        .filter(([_, cap]) =>
            cap.applicableTo?.includes(assessmentType)
        )
        .map(([id, cap]) => ({ id, ...cap }));
}

/**
 * Check if a capability module is available
 * @param {Object} capability - Capability definition
 * @param {string} workspaceRoot - Workspace root directory
 * @returns {Object} Availability status
 */
function checkCapabilityAvailability(capability, workspaceRoot) {
    const modulePath = capability.modulePath
        ? path.join(workspaceRoot, capability.modulePath)
        : null;

    if (!modulePath || !fs.existsSync(modulePath)) {
        return {
            id: capability.id,
            status: 'missing',
            message: `Module not found: ${capability.modulePath || capability.module}`,
            required: capability.required
        };
    }

    // Check version if module has package.json or version comment
    let detectedVersion = null;
    try {
        const content = fs.readFileSync(modulePath, 'utf-8');
        const versionMatch = content.match(/@version\s+(\d+\.\d+\.\d+)/);
        if (versionMatch) {
            detectedVersion = versionMatch[1];
        }
    } catch {
        // Ignore version detection errors
    }

    // Simple version comparison
    if (capability.minVersion && detectedVersion) {
        const minParts = capability.minVersion.split('.').map(Number);
        const detectedParts = detectedVersion.split('.').map(Number);

        for (let i = 0; i < minParts.length; i++) {
            if ((detectedParts[i] || 0) < minParts[i]) {
                return {
                    id: capability.id,
                    status: 'outdated',
                    message: `Version ${detectedVersion} < required ${capability.minVersion}`,
                    detectedVersion,
                    minVersion: capability.minVersion,
                    required: capability.required
                };
            }
            if ((detectedParts[i] || 0) > minParts[i]) break;
        }
    }

    return {
        id: capability.id,
        status: 'available',
        message: 'Module available',
        modulePath,
        detectedVersion,
        required: capability.required
    };
}

/**
 * Validate all capabilities for an assessment type
 * @param {string} assessmentType - Assessment type
 * @param {Object} options - Options
 * @param {string} options.registryPath - Custom registry path
 * @param {string} options.workspaceRoot - Workspace root directory
 * @param {boolean} options.strict - Strict mode (fail on missing required)
 * @returns {Object} Validation result
 */
function validateCapabilities(assessmentType, options = {}) {
    const registry = loadRegistry(options.registryPath);
    const workspaceRoot = options.workspaceRoot || process.cwd();
    const strictMode = options.strict ?? (process.env.DATA_INTEGRITY_STRICT === '1');

    const required = getRequiredCapabilities(registry, assessmentType);
    const optional = getOptionalCapabilities(registry, assessmentType);

    const results = {
        assessmentType,
        strictMode,
        valid: true,
        missing: [],
        outdated: [],
        available: [],
        optional: []
    };

    // Check required capabilities
    for (const cap of required) {
        const status = checkCapabilityAvailability(cap, workspaceRoot);

        if (status.status === 'missing') {
            results.missing.push(status);
            if (cap.required) {
                results.valid = false;
            }
        } else if (status.status === 'outdated') {
            results.outdated.push(status);
            if (cap.required && strictMode) {
                results.valid = false;
            }
        } else {
            results.available.push(status);
        }
    }

    // Check optional capabilities
    for (const cap of optional) {
        const status = checkCapabilityAvailability(cap, workspaceRoot);
        results.optional.push(status);
    }

    // Generate summary
    results.summary = {
        requiredCount: required.length,
        availableCount: results.available.length,
        missingCount: results.missing.length,
        outdatedCount: results.outdated.length,
        optionalAvailable: results.optional.filter(o => o.status === 'available').length,
        optionalTotal: results.optional.length
    };

    return results;
}

/**
 * Get capability context for injection into assessment
 * @param {string} assessmentType - Assessment type
 * @param {Object} options - Options
 * @returns {Object} Capability context for assessment
 */
function getCapabilityContext(assessmentType, options = {}) {
    const validation = validateCapabilities(assessmentType, options);
    const registry = loadRegistry(options.registryPath);

    return {
        capabilities: {
            assessmentType,
            registryVersion: registry.version,
            validated: validation.valid,
            availableModules: validation.available.map(a => ({
                id: a.id,
                modulePath: a.modulePath,
                version: a.detectedVersion
            })),
            missingModules: validation.missing.map(m => m.id),
            optionalModules: validation.optional
                .filter(o => o.status === 'available')
                .map(o => ({ id: o.id, modulePath: o.modulePath })),
            summary: validation.summary
        }
    };
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    const usage = `
Capability Registry Loader

Usage:
  node capability-registry-loader.js validate <assessment-type> [--strict]
  node capability-registry-loader.js list <assessment-type>
  node capability-registry-loader.js context <assessment-type>
  node capability-registry-loader.js check <capability-id>

Commands:
  validate    Validate all capabilities for an assessment type
  list        List required and optional capabilities
  context     Get capability context for injection
  check       Check if a specific capability is available

Options:
  --strict    Enable strict mode (fail on any missing required capability)
  --json      Output as JSON

Assessment Types:
  revops-assessment
  cpq-assessment
  automation-audit
`;

    if (!command || command === '--help' || command === '-h') {
        console.log(usage);
        process.exit(0);
    }

    try {
        const assessmentType = args[1];
        const strictMode = args.includes('--strict');
        const jsonOutput = args.includes('--json');
        const workspaceRoot = process.env.CLAUDE_PLUGIN_ROOT
            ? path.join(process.env.CLAUDE_PLUGIN_ROOT, '..')
            : path.join(__dirname, '../../../..');

        switch (command) {
            case 'validate': {
                if (!assessmentType) {
                    console.error('Error: assessment-type required');
                    process.exit(1);
                }

                const result = validateCapabilities(assessmentType, {
                    workspaceRoot,
                    strict: strictMode
                });

                if (jsonOutput) {
                    console.log(JSON.stringify(result, null, 2));
                } else {
                    console.log(`\n🔍 Capability Validation: ${assessmentType}`);
                    console.log(`${'='.repeat(50)}`);
                    console.log(`Strict Mode: ${result.strictMode ? 'YES' : 'NO'}`);
                    console.log(`Valid: ${result.valid ? '✅ YES' : '❌ NO'}`);
                    console.log(`\nRequired: ${result.summary.requiredCount}`);
                    console.log(`  Available: ${result.summary.availableCount}`);
                    console.log(`  Missing: ${result.summary.missingCount}`);
                    console.log(`  Outdated: ${result.summary.outdatedCount}`);
                    console.log(`Optional: ${result.summary.optionalAvailable}/${result.summary.optionalTotal} available`);

                    if (result.missing.length > 0) {
                        console.log(`\n❌ Missing Capabilities:`);
                        result.missing.forEach(m => {
                            console.log(`   - ${m.id}: ${m.message}`);
                        });
                    }

                    if (result.outdated.length > 0) {
                        console.log(`\n⚠️  Outdated Capabilities:`);
                        result.outdated.forEach(o => {
                            console.log(`   - ${o.id}: ${o.message}`);
                        });
                    }
                }

                if (!result.valid) {
                    process.exit(1);
                }
                break;
            }

            case 'list': {
                if (!assessmentType) {
                    console.error('Error: assessment-type required');
                    process.exit(1);
                }

                const registry = loadRegistry();
                const required = getRequiredCapabilities(registry, assessmentType);
                const optional = getOptionalCapabilities(registry, assessmentType);

                if (jsonOutput) {
                    console.log(JSON.stringify({ required, optional }, null, 2));
                } else {
                    console.log(`\n📋 Capabilities for ${assessmentType}`);
                    console.log(`${'='.repeat(50)}`);

                    console.log(`\nRequired (${required.length}):`);
                    required.forEach(cap => {
                        const req = cap.required ? '🔴' : '🟡';
                        console.log(`  ${req} ${cap.id}`);
                        console.log(`     ${cap.description}`);
                        console.log(`     Module: ${cap.module}`);
                    });

                    console.log(`\nOptional (${optional.length}):`);
                    optional.forEach(cap => {
                        console.log(`  🟢 ${cap.id}`);
                        console.log(`     ${cap.description}`);
                    });
                }
                break;
            }

            case 'context': {
                if (!assessmentType) {
                    console.error('Error: assessment-type required');
                    process.exit(1);
                }

                const context = getCapabilityContext(assessmentType, {
                    workspaceRoot,
                    strict: strictMode
                });

                console.log(JSON.stringify(context, null, 2));
                break;
            }

            case 'check': {
                const capabilityId = args[1];
                if (!capabilityId) {
                    console.error('Error: capability-id required');
                    process.exit(1);
                }

                const registry = loadRegistry();
                let found = null;

                // Search in all assessment types
                for (const [type, caps] of Object.entries(registry.requiredCapabilities || {})) {
                    const cap = caps.find(c => c.id === capabilityId);
                    if (cap) {
                        found = { ...cap, assessmentType: type };
                        break;
                    }
                }

                if (!found) {
                    // Check optional
                    const optCap = registry.optionalCapabilities?.[capabilityId];
                    if (optCap) {
                        found = { id: capabilityId, ...optCap, optional: true };
                    }
                }

                if (!found) {
                    console.error(`Capability not found: ${capabilityId}`);
                    process.exit(1);
                }

                const status = checkCapabilityAvailability(found, workspaceRoot);

                if (jsonOutput) {
                    console.log(JSON.stringify({ capability: found, status }, null, 2));
                } else {
                    console.log(`\n🔧 Capability: ${capabilityId}`);
                    console.log(`${'='.repeat(50)}`);
                    console.log(`Description: ${found.description}`);
                    console.log(`Module: ${found.module}`);
                    console.log(`Status: ${status.status}`);
                    console.log(`Message: ${status.message}`);
                }

                if (status.status !== 'available') {
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
    loadRegistry,
    getRequiredCapabilities,
    getOptionalCapabilities,
    checkCapabilityAvailability,
    validateCapabilities,
    getCapabilityContext
};
