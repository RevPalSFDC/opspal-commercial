#!/usr/bin/env node

/**
 * Path Schema Validator
 *
 * Detects deprecated path schemas and suggests transformations to the
 * current org-centric schema. Prevents plans from being generated with
 * outdated paths that confuse users.
 *
 * Legacy schemas:
 *   - instances/{platform}/{org}/
 *   - instances/salesforce/{org}/
 *   - opspal-internal/SFDC/...
 *
 * Current schema:
 *   - orgs/{org}/platforms/{platform}/{instance}/
 *
 * Usage:
 *   const { validatePathSchema, validateFixPlanPaths } = require('./path-schema-validator');
 *
 *   // Validate a single path
 *   const result = validatePathSchema('instances/salesforce/acme/reports');
 *   // Returns: { valid: false, schema: 'legacy-platform', warning: '...', suggested: 'orgs/acme/platforms/salesforce/default/reports' }
 *
 *   // Validate all paths in a fix plan
 *   const planResult = validateFixPlanPaths(fixPlan);
 *   // Returns: { valid: boolean, warnings: string[], normalizedPlan: object }
 *
 * @version 1.0.0
 */

// =============================================================================
// Schema Patterns
// =============================================================================

/**
 * Path schema definitions with detection patterns and metadata
 */
const PATH_SCHEMAS = {
    // Current (valid) schema - orgs/{org}/platforms/{platform}/{instance}/
    'org-centric': {
        pattern: /^orgs\/([^/]+)\/platforms\/([^/]+)\/([^/]+)/,
        valid: true,
        description: 'Current org-centric schema'
    },

    // Legacy: instances/{platform}/{org}/
    'legacy-platform': {
        pattern: /^instances\/(salesforce|hubspot|marketo)\/([^/]+)/i,
        valid: false,
        description: 'Deprecated platform-first schema'
    },

    // Legacy: instances/{org}/ (no platform specified)
    'legacy-simple': {
        pattern: /^instances\/([^/]+)(?:\/|$)/,
        valid: false,
        description: 'Deprecated simple instance schema'
    },

    // Legacy: opspal-internal/SFDC/instances/...
    'legacy-internal-sfdc': {
        pattern: /^opspal-internal\/SFDC\/(?:instances\/)?([^/]+)/i,
        valid: false,
        description: 'Deprecated opspal-internal SFDC path'
    },

    // Legacy: opspal-internal/HS/instances/...
    'legacy-internal-hs': {
        pattern: /^opspal-internal\/HS\/(?:instances\/)?([^/]+)/i,
        valid: false,
        description: 'Deprecated opspal-internal HubSpot path'
    },

    // Legacy: opspal-internal/.claude/...
    'legacy-internal-claude': {
        pattern: /^opspal-internal\/\.claude(\/.*)?$/,
        valid: false,
        description: 'Deprecated opspal-internal .claude path'
    },

    // Plugin paths (always valid)
    'plugin-path': {
        pattern: /^plugins\/opspal-[^/]+\//,
        valid: true,
        description: 'Plugin path (no transformation needed)'
    },

    // Relative paths in components (valid)
    'component-relative': {
        pattern: /^(?:\.\/|scripts\/|templates\/|hooks\/|agents\/)/,
        valid: true,
        description: 'Component-relative path (no transformation needed)'
    }
};

// Platform name mappings for normalization
const PLATFORM_ALIASES = {
    'sfdc': 'salesforce',
    'sf': 'salesforce',
    'hs': 'hubspot',
    'mkto': 'marketo'
};

// =============================================================================
// Core Validation Functions
// =============================================================================

/**
 * Validate a single path string against known schemas
 *
 * @param {string} pathString - Path to validate
 * @returns {Object} Validation result:
 *   - valid: boolean - Whether path uses current schema
 *   - schema: string - Detected schema name
 *   - warning?: string - Warning message if deprecated
 *   - suggested?: string - Suggested corrected path
 *   - components?: object - Parsed path components
 */
function validatePathSchema(pathString) {
    if (!pathString || typeof pathString !== 'string') {
        return {
            valid: true,
            schema: 'unknown',
            components: null
        };
    }

    // Normalize path separators and remove leading/trailing slashes
    const normalizedPath = pathString
        .replace(/\\/g, '/')
        .replace(/^\/+/, '')
        .replace(/\/+$/, '');

    // Check each schema pattern
    for (const [schemaName, schemaConfig] of Object.entries(PATH_SCHEMAS)) {
        const match = normalizedPath.match(schemaConfig.pattern);

        if (match) {
            const result = {
                valid: schemaConfig.valid,
                schema: schemaName,
                description: schemaConfig.description,
                originalPath: pathString
            };

            if (!schemaConfig.valid) {
                // Parse components and generate suggestion
                const parsed = parseDeprecatedPath(normalizedPath, schemaName, match);
                result.warning = `Deprecated path schema: ${schemaConfig.description}`;
                result.suggested = parsed.suggested;
                result.components = parsed.components;
            } else {
                result.components = parseCurrentPath(normalizedPath, schemaName, match);
            }

            return result;
        }
    }

    // Unknown schema - assume valid (could be absolute path or external)
    return {
        valid: true,
        schema: 'unknown',
        originalPath: pathString,
        components: null
    };
}

/**
 * Parse deprecated path and generate suggestion
 */
function parseDeprecatedPath(path, schemaName, match) {
    const result = {
        components: {},
        suggested: path
    };

    switch (schemaName) {
        case 'legacy-platform': {
            // instances/{platform}/{org}/... → orgs/{org}/platforms/{platform}/default/...
            const platform = normalizePlatform(match[1]);
            const org = match[2];
            const remainder = path.substring(match[0].length).replace(/^\//, '');

            result.components = { org, platform, instance: 'default' };
            result.suggested = `orgs/${org}/platforms/${platform}/default${remainder ? '/' + remainder : ''}`;
            break;
        }

        case 'legacy-simple': {
            // instances/{org}/... → orgs/{org}/platforms/salesforce/default/...
            // Assume salesforce as default platform
            const org = match[1];
            const remainder = path.substring(match[0].length).replace(/^\//, '');

            result.components = { org, platform: 'salesforce', instance: 'default' };
            result.suggested = `orgs/${org}/platforms/salesforce/default${remainder ? '/' + remainder : ''}`;
            break;
        }

        case 'legacy-internal-sfdc': {
            // opspal-internal/SFDC/instances/{org}/... → orgs/{org}/platforms/salesforce/default/...
            const org = match[1];
            const remainder = path.substring(match[0].length).replace(/^\//, '');

            result.components = { org, platform: 'salesforce', instance: 'default' };
            result.suggested = `orgs/${org}/platforms/salesforce/default${remainder ? '/' + remainder : ''}`;
            break;
        }

        case 'legacy-internal-hs': {
            // opspal-internal/HS/instances/{org}/... → orgs/{org}/platforms/hubspot/default/...
            const org = match[1];
            const remainder = path.substring(match[0].length).replace(/^\//, '');

            result.components = { org, platform: 'hubspot', instance: 'default' };
            result.suggested = `orgs/${org}/platforms/hubspot/default${remainder ? '/' + remainder : ''}`;
            break;
        }

        case 'legacy-internal-claude': {
            // opspal-internal/.claude/... → .claude/...
            const remainder = match[1] || '';
            result.components = { type: 'claude-config' };
            result.suggested = `.claude${remainder}`;
            break;
        }
    }

    return result;
}

/**
 * Parse current (valid) path into components
 */
function parseCurrentPath(path, schemaName, match) {
    if (schemaName === 'org-centric') {
        return {
            org: match[1],
            platform: match[2],
            instance: match[3]
        };
    }
    return null;
}

/**
 * Normalize platform name to standard form
 */
function normalizePlatform(platform) {
    const lower = platform.toLowerCase();
    return PLATFORM_ALIASES[lower] || lower;
}

// =============================================================================
// Fix Plan Validation
// =============================================================================

/**
 * Validate all paths in a fix plan and return normalized version
 *
 * @param {Object} fixPlan - Fix plan object to validate
 * @param {string} [orgSlug] - Optional org slug for context
 * @returns {Object} Result:
 *   - valid: boolean - Whether all paths are valid
 *   - warnings: string[] - List of warnings
 *   - normalizedPlan: object - Fix plan with paths normalized
 *   - transformations: object[] - List of transformations applied
 */
function validateFixPlanPaths(fixPlan, orgSlug = null) {
    const warnings = [];
    const transformations = [];
    let valid = true;

    // Deep clone to avoid mutation
    const normalizedPlan = JSON.parse(JSON.stringify(fixPlan));

    // Check solution.components_affected paths
    if (normalizedPlan.solution?.components_affected) {
        normalizedPlan.solution.components_affected = normalizedPlan.solution.components_affected.map(component => {
            const pathField = component.path || component.file;
            if (pathField) {
                const validation = validatePathSchema(pathField);

                if (!validation.valid && validation.suggested) {
                    valid = false;
                    warnings.push(`Deprecated path in component: ${pathField} → ${validation.suggested}`);
                    transformations.push({
                        field: 'solution.components_affected[].path',
                        original: pathField,
                        transformed: validation.suggested,
                        schema: validation.schema
                    });

                    return {
                        ...component,
                        path: validation.suggested,
                        _originalPath: pathField
                    };
                }
            }
            return component;
        });
    }

    // Check solution.files paths
    if (normalizedPlan.solution?.files) {
        normalizedPlan.solution.files = normalizedPlan.solution.files.map(file => {
            if (file.path) {
                const validation = validatePathSchema(file.path);

                if (!validation.valid && validation.suggested) {
                    valid = false;
                    warnings.push(`Deprecated path in solution.files: ${file.path} → ${validation.suggested}`);
                    transformations.push({
                        field: 'solution.files[].path',
                        original: file.path,
                        transformed: validation.suggested,
                        schema: validation.schema
                    });

                    return {
                        ...file,
                        path: validation.suggested,
                        _originalPath: file.path
                    };
                }
            }
            return file;
        });
    }

    // Check debugging_playbook.path
    if (normalizedPlan.debugging_playbook?.path) {
        const validation = validatePathSchema(normalizedPlan.debugging_playbook.path);

        if (!validation.valid && validation.suggested) {
            valid = false;
            warnings.push(`Deprecated path in debugging_playbook: ${normalizedPlan.debugging_playbook.path} → ${validation.suggested}`);
            transformations.push({
                field: 'debugging_playbook.path',
                original: normalizedPlan.debugging_playbook.path,
                transformed: validation.suggested,
                schema: validation.schema
            });

            normalizedPlan.debugging_playbook._originalPath = normalizedPlan.debugging_playbook.path;
            normalizedPlan.debugging_playbook.path = validation.suggested;
        }
    }

    // Check root_cause_analysis paths if any
    if (normalizedPlan.root_cause_analysis?.evidence_paths) {
        normalizedPlan.root_cause_analysis.evidence_paths = normalizedPlan.root_cause_analysis.evidence_paths.map(evidencePath => {
            const validation = validatePathSchema(evidencePath);

            if (!validation.valid && validation.suggested) {
                valid = false;
                warnings.push(`Deprecated evidence path: ${evidencePath} → ${validation.suggested}`);
                transformations.push({
                    field: 'root_cause_analysis.evidence_paths[]',
                    original: evidencePath,
                    transformed: validation.suggested,
                    schema: validation.schema
                });

                return validation.suggested;
            }
            return evidencePath;
        });
    }

    return {
        valid,
        warnings,
        normalizedPlan,
        transformations
    };
}

/**
 * Check if a path needs transformation (quick check)
 *
 * @param {string} pathString - Path to check
 * @returns {boolean} True if path uses deprecated schema
 */
function needsTransformation(pathString) {
    const result = validatePathSchema(pathString);
    return !result.valid;
}

/**
 * Get suggested path transformation
 *
 * @param {string} pathString - Path to transform
 * @returns {string|null} Suggested path or null if no transformation needed
 */
function getSuggestedPath(pathString) {
    const result = validatePathSchema(pathString);
    return result.suggested || null;
}

// =============================================================================
// CLI
// =============================================================================

function printUsage() {
    console.log(`
Path Schema Validator

Usage:
  node path-schema-validator.js validate <path>
  node path-schema-validator.js check-plan <fix-plan.json>
  node path-schema-validator.js list-schemas

Commands:
  validate <path>         Validate a single path
  check-plan <file>       Check all paths in a fix plan JSON file
  list-schemas            List all supported path schemas

Examples:
  node path-schema-validator.js validate "instances/salesforce/acme/reports"
  node path-schema-validator.js check-plan ./fix-plan.json
  node path-schema-validator.js list-schemas
`);
}

if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        printUsage();
        process.exit(0);
    }

    const command = args[0];

    switch (command) {
        case 'validate': {
            const pathToValidate = args[1];
            if (!pathToValidate) {
                console.error('Error: Path required');
                process.exit(1);
            }

            const result = validatePathSchema(pathToValidate);
            console.log(JSON.stringify(result, null, 2));

            if (!result.valid) {
                console.log(`\nSuggested transformation:`);
                console.log(`  ${pathToValidate}`);
                console.log(`  → ${result.suggested}`);
            }
            break;
        }

        case 'check-plan': {
            const planFile = args[1];
            if (!planFile) {
                console.error('Error: Fix plan file required');
                process.exit(1);
            }

            const fs = require('fs');
            if (!fs.existsSync(planFile)) {
                console.error(`Error: File not found: ${planFile}`);
                process.exit(1);
            }

            const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
            const result = validateFixPlanPaths(plan);

            console.log(JSON.stringify(result, null, 2));

            if (!result.valid) {
                console.log(`\n${result.warnings.length} path(s) need transformation`);
                process.exit(1);
            } else {
                console.log(`\nAll paths valid`);
            }
            break;
        }

        case 'list-schemas': {
            console.log('\nSupported Path Schemas:\n');
            for (const [name, config] of Object.entries(PATH_SCHEMAS)) {
                const status = config.valid ? '✅ Valid' : '⚠️  Deprecated';
                console.log(`  ${name}`);
                console.log(`    ${status}: ${config.description}`);
                console.log(`    Pattern: ${config.pattern}`);
                console.log('');
            }
            break;
        }

        default:
            console.error(`Unknown command: ${command}`);
            printUsage();
            process.exit(1);
    }
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
    validatePathSchema,
    validateFixPlanPaths,
    needsTransformation,
    getSuggestedPath,
    PATH_SCHEMAS,
    PLATFORM_ALIASES
};
