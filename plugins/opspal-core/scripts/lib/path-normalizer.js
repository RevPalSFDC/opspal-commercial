#!/usr/bin/env node

/**
 * Path Normalizer
 *
 * Transforms legacy paths to the current org-centric schema.
 * Works with fix plans, reflections, and any configuration objects
 * that contain file paths.
 *
 * Transformation Rules:
 *   instances/salesforce/{org}/...  → orgs/{org}/platforms/salesforce/default/...
 *   instances/{platform}/{org}/...  → orgs/{org}/platforms/{platform}/default/...
 *   opspal-internal/SFDC/...        → plugins/opspal-salesforce/...
 *   opspal-internal/HS/...          → plugins/opspal-hubspot/...
 *
 * Usage:
 *   const { normalizePath, normalizeFixPlan, normalizeObject } = require('./path-normalizer');
 *
 *   // Single path
 *   const newPath = normalizePath('instances/salesforce/acme/reports');
 *
 *   // Full fix plan
 *   const normalizedPlan = normalizeFixPlan(fixPlan, 'acme');
 *
 *   // Any object with paths
 *   const normalizedObj = normalizeObject(obj, ['path', 'file', 'outputDir']);
 *
 * @version 1.0.0
 */

const { validatePathSchema, PATH_SCHEMAS } = require('./path-schema-validator');

// =============================================================================
// Transformation Rules
// =============================================================================

/**
 * Ordered list of transformation rules
 * Each rule has: pattern (RegExp), transform (function)
 */
const TRANSFORMATION_RULES = [
    // Rule 1: instances/{platform}/{org}/... → orgs/{org}/platforms/{platform}/default/...
    {
        name: 'legacy-platform-first',
        pattern: /^instances\/(salesforce|hubspot|marketo)\/([^/]+)(\/.*)?$/i,
        transform: (match) => {
            const platform = match[1].toLowerCase();
            const org = match[2];
            const remainder = match[3] || '';
            return `orgs/${org}/platforms/${platform}/default${remainder}`;
        }
    },

    // Rule 2: instances/{org}/... (no platform) → orgs/{org}/platforms/salesforce/default/...
    // Assumes Salesforce as default platform when not specified
    {
        name: 'legacy-simple',
        pattern: /^instances\/([^/]+)(\/.*)?$/i,
        transform: (match) => {
            const org = match[1];
            const remainder = match[2] || '';
            // Skip if org looks like a platform name
            if (['salesforce', 'hubspot', 'marketo', 'sfdc', 'hs'].includes(org.toLowerCase())) {
                return null; // Let another rule handle it
            }
            return `orgs/${org}/platforms/salesforce/default${remainder}`;
        }
    },

    // Rule 3: opspal-internal/SFDC/instances/{org}/... → orgs/{org}/platforms/salesforce/default/...
    {
        name: 'internal-sfdc-instances',
        pattern: /^opspal-internal\/SFDC\/instances\/([^/]+)(\/.*)?$/i,
        transform: (match) => {
            const org = match[1];
            const remainder = match[2] || '';
            return `orgs/${org}/platforms/salesforce/default${remainder}`;
        }
    },

    // Rule 4: opspal-internal/SFDC/scripts/... → plugins/opspal-salesforce/scripts/...
    {
        name: 'internal-sfdc-scripts',
        pattern: /^opspal-internal\/SFDC\/(scripts|hooks|agents|templates)(\/.*)?$/i,
        transform: (match) => {
            const subdir = match[1].toLowerCase();
            const remainder = match[2] || '';
            return `plugins/opspal-salesforce/${subdir}${remainder}`;
        }
    },

    // Rule 5: opspal-internal/HS/instances/{org}/... → orgs/{org}/platforms/hubspot/default/...
    {
        name: 'internal-hs-instances',
        pattern: /^opspal-internal\/HS\/instances\/([^/]+)(\/.*)?$/i,
        transform: (match) => {
            const org = match[1];
            const remainder = match[2] || '';
            return `orgs/${org}/platforms/hubspot/default${remainder}`;
        }
    },

    // Rule 6: opspal-internal/HS/scripts/... → plugins/opspal-hubspot/scripts/...
    {
        name: 'internal-hs-scripts',
        pattern: /^opspal-internal\/HS\/(scripts|hooks|agents|templates)(\/.*)?$/i,
        transform: (match) => {
            const subdir = match[1].toLowerCase();
            const remainder = match[2] || '';
            return `plugins/opspal-hubspot/${subdir}${remainder}`;
        }
    },

    // Rule 7: opspal-internal/.claude/... → .claude/... (project root)
    {
        name: 'internal-claude-dir',
        pattern: /^opspal-internal\/\.claude(\/.*)?$/i,
        transform: (match) => {
            const remainder = match[1] || '';
            return `.claude${remainder}`;
        }
    },

    // Rule 8: Generic opspal-internal/{other}/... handling
    {
        name: 'internal-other',
        pattern: /^opspal-internal\/([^/]+)(\/.*)?$/i,
        transform: (match) => {
            const subdir = match[1];
            const remainder = match[2] || '';

            // Map known subdirectories
            const subdirMap = {
                'SFDC': 'plugins/opspal-salesforce',
                'HS': 'plugins/opspal-hubspot',
                'cross-platform-ops': 'plugins/cross-platform-plugin'
            };

            const mapped = subdirMap[subdir];
            if (mapped) {
                return `${mapped}${remainder}`;
            }

            // Unknown subdirectory - prefix with plugins/opspal-core
            return `plugins/opspal-core/${subdir}${remainder}`;
        }
    }
];

// =============================================================================
// Core Normalization Functions
// =============================================================================

/**
 * Normalize a single path to the current schema
 *
 * @param {string} pathString - Path to normalize
 * @param {Object} [options] - Options
 * @param {string} [options.orgSlug] - Org context for ambiguous paths
 * @param {boolean} [options.verbose] - Log transformations
 * @returns {string} Normalized path (original if no transformation needed)
 */
function normalizePath(pathString, options = {}) {
    if (!pathString || typeof pathString !== 'string') {
        return pathString;
    }

    // Normalize separators
    let normalized = pathString
        .replace(/\\/g, '/')
        .replace(/^\/+/, '')
        .replace(/\/+$/, '');

    // Check if transformation needed
    const validation = validatePathSchema(normalized);
    if (validation.valid) {
        return pathString; // Already valid, preserve original
    }

    // Try each transformation rule
    for (const rule of TRANSFORMATION_RULES) {
        const match = normalized.match(rule.pattern);
        if (match) {
            const transformed = rule.transform(match);
            if (transformed !== null) {
                if (options.verbose) {
                    console.log(`  [${rule.name}] ${pathString} → ${transformed}`);
                }
                return transformed;
            }
        }
    }

    // If we have a suggested path from validation, use it
    if (validation.suggested) {
        if (options.verbose) {
            console.log(`  [validator-suggestion] ${pathString} → ${validation.suggested}`);
        }
        return validation.suggested;
    }

    // No transformation applicable
    return pathString;
}

/**
 * Normalize all paths in a fix plan
 *
 * @param {Object} fixPlan - Fix plan object
 * @param {string} [orgSlug] - Org context
 * @param {Object} [options] - Options
 * @returns {Object} Result with normalized plan and metadata
 */
function normalizeFixPlan(fixPlan, orgSlug = null, options = {}) {
    const transformations = [];
    const warnings = [];

    // Deep clone
    const normalized = JSON.parse(JSON.stringify(fixPlan));

    // Helper to track transformations
    const trackNormalize = (original, field) => {
        if (!original) return original;

        const transformed = normalizePath(original, { ...options, verbose: false });
        if (transformed !== original) {
            transformations.push({
                field,
                original,
                transformed
            });
            if (options.verbose) {
                console.log(`  ${field}: ${original} → ${transformed}`);
            }
        }
        return transformed;
    };

    // Normalize solution.components_affected
    if (normalized.solution?.components_affected) {
        normalized.solution.components_affected = normalized.solution.components_affected.map((comp, i) => {
            if (comp.path) {
                comp.path = trackNormalize(comp.path, `solution.components_affected[${i}].path`);
            }
            if (comp.file) {
                comp.file = trackNormalize(comp.file, `solution.components_affected[${i}].file`);
            }
            return comp;
        });
    }

    // Normalize solution.files
    if (normalized.solution?.files) {
        normalized.solution.files = normalized.solution.files.map((file, i) => {
            if (file.path) {
                file.path = trackNormalize(file.path, `solution.files[${i}].path`);
            }
            return file;
        });
    }

    // Normalize debugging_playbook.path
    if (normalized.debugging_playbook?.path) {
        normalized.debugging_playbook.path = trackNormalize(
            normalized.debugging_playbook.path,
            'debugging_playbook.path'
        );
    }

    // Normalize root_cause_analysis paths
    if (normalized.root_cause_analysis?.evidence_paths) {
        normalized.root_cause_analysis.evidence_paths = normalized.root_cause_analysis.evidence_paths.map((p, i) =>
            trackNormalize(p, `root_cause_analysis.evidence_paths[${i}]`)
        );
    }

    // Add metadata
    if (transformations.length > 0) {
        normalized._pathNormalization = {
            normalized: true,
            timestamp: new Date().toISOString(),
            orgContext: orgSlug,
            transformationCount: transformations.length
        };
    }

    return {
        normalized,
        transformations,
        transformationCount: transformations.length,
        warnings
    };
}

/**
 * Normalize paths in an arbitrary object by field names
 *
 * @param {Object} obj - Object to normalize
 * @param {string[]} pathFields - Field names that contain paths
 * @param {Object} [options] - Options
 * @returns {Object} Normalized object
 */
function normalizeObject(obj, pathFields = ['path', 'file', 'outputDir'], options = {}) {
    if (!obj || typeof obj !== 'object') {
        return obj;
    }

    const normalize = (value, key) => {
        if (typeof value === 'string' && pathFields.includes(key)) {
            return normalizePath(value, options);
        }
        if (Array.isArray(value)) {
            return value.map((item, i) => {
                if (typeof item === 'string' && pathFields.includes(key)) {
                    return normalizePath(item, options);
                }
                if (typeof item === 'object') {
                    return normalizeObject(item, pathFields, options);
                }
                return item;
            });
        }
        if (typeof value === 'object' && value !== null) {
            return normalizeObject(value, pathFields, options);
        }
        return value;
    };

    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        result[key] = normalize(value, key);
    }

    return result;
}

/**
 * Normalize paths in an array of fix plans
 *
 * @param {Object[]} fixPlans - Array of fix plans
 * @param {string} [orgSlug] - Org context
 * @param {Object} [options] - Options
 * @returns {Object} Result with normalized plans and aggregate metadata
 */
function normalizeFixPlans(fixPlans, orgSlug = null, options = {}) {
    const allTransformations = [];
    const allWarnings = [];

    const normalizedPlans = fixPlans.map((plan, i) => {
        const result = normalizeFixPlan(plan, orgSlug, options);

        // Prefix transformations with plan index
        result.transformations.forEach(t => {
            t.planIndex = i;
            allTransformations.push(t);
        });

        allWarnings.push(...result.warnings);

        return result.normalized;
    });

    return {
        normalizedPlans,
        transformations: allTransformations,
        totalTransformations: allTransformations.length,
        warnings: allWarnings
    };
}

/**
 * Check if path uses deprecated schema (quick check)
 *
 * @param {string} pathString - Path to check
 * @returns {boolean} True if deprecated
 */
function isDeprecatedPath(pathString) {
    const validation = validatePathSchema(pathString);
    return !validation.valid;
}

/**
 * Get transformation rule that would apply to a path
 *
 * @param {string} pathString - Path to check
 * @returns {Object|null} Rule info or null if no transformation needed
 */
function getApplicableRule(pathString) {
    if (!pathString || typeof pathString !== 'string') {
        return null;
    }

    const normalized = pathString
        .replace(/\\/g, '/')
        .replace(/^\/+/, '')
        .replace(/\/+$/, '');

    for (const rule of TRANSFORMATION_RULES) {
        const match = normalized.match(rule.pattern);
        if (match) {
            const transformed = rule.transform(match);
            if (transformed !== null) {
                return {
                    name: rule.name,
                    pattern: rule.pattern.toString(),
                    original: pathString,
                    transformed
                };
            }
        }
    }

    return null;
}

// =============================================================================
// CLI
// =============================================================================

function printUsage() {
    console.log(`
Path Normalizer

Usage:
  node path-normalizer.js normalize <path>
  node path-normalizer.js normalize-plan <fix-plan.json> [--output <file>]
  node path-normalizer.js check <path>
  node path-normalizer.js list-rules

Commands:
  normalize <path>            Transform a single path to current schema
  normalize-plan <file>       Normalize all paths in a fix plan JSON file
  check <path>                Check which rule would apply to a path
  list-rules                  List all transformation rules

Options:
  --output <file>             Write normalized plan to file (default: stdout)
  --verbose                   Show transformation details

Examples:
  node path-normalizer.js normalize "instances/salesforce/acme/reports"
  node path-normalizer.js normalize-plan ./fix-plan.json --output ./normalized.json
  node path-normalizer.js check "opspal-internal/SFDC/scripts/lib/foo.js"
  node path-normalizer.js list-rules
`);
}

if (require.main === module) {
    const fs = require('fs');
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        printUsage();
        process.exit(0);
    }

    const verbose = args.includes('--verbose');
    const outputIndex = args.indexOf('--output');
    const outputFile = outputIndex >= 0 ? args[outputIndex + 1] : null;

    const command = args[0];

    switch (command) {
        case 'normalize': {
            const pathToNormalize = args[1];
            if (!pathToNormalize) {
                console.error('Error: Path required');
                process.exit(1);
            }

            const result = normalizePath(pathToNormalize, { verbose: true });
            console.log(`\nOriginal:   ${pathToNormalize}`);
            console.log(`Normalized: ${result}`);

            if (result === pathToNormalize) {
                console.log(`\n(No transformation needed)`);
            }
            break;
        }

        case 'normalize-plan': {
            const planFile = args[1];
            if (!planFile) {
                console.error('Error: Fix plan file required');
                process.exit(1);
            }

            if (!fs.existsSync(planFile)) {
                console.error(`Error: File not found: ${planFile}`);
                process.exit(1);
            }

            const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
            const result = normalizeFixPlan(plan, null, { verbose });

            console.log(`\nTransformations applied: ${result.transformationCount}`);

            if (result.transformations.length > 0 && verbose) {
                console.log('\nTransformations:');
                result.transformations.forEach(t => {
                    console.log(`  ${t.field}:`);
                    console.log(`    ${t.original} → ${t.transformed}`);
                });
            }

            const output = JSON.stringify(result.normalized, null, 2);

            if (outputFile) {
                fs.writeFileSync(outputFile, output);
                console.log(`\nNormalized plan written to: ${outputFile}`);
            } else {
                console.log('\nNormalized plan:');
                console.log(output);
            }
            break;
        }

        case 'check': {
            const pathToCheck = args[1];
            if (!pathToCheck) {
                console.error('Error: Path required');
                process.exit(1);
            }

            const rule = getApplicableRule(pathToCheck);
            if (rule) {
                console.log(`\nPath: ${pathToCheck}`);
                console.log(`\nApplicable rule: ${rule.name}`);
                console.log(`Pattern: ${rule.pattern}`);
                console.log(`Transformed: ${rule.transformed}`);
            } else {
                console.log(`\nPath: ${pathToCheck}`);
                console.log(`\nNo transformation rule applies (path is valid or unknown schema)`);
            }
            break;
        }

        case 'list-rules': {
            console.log('\nTransformation Rules (in order of application):\n');
            TRANSFORMATION_RULES.forEach((rule, i) => {
                console.log(`${i + 1}. ${rule.name}`);
                console.log(`   Pattern: ${rule.pattern}`);
                console.log('');
            });
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
    normalizePath,
    normalizeFixPlan,
    normalizeFixPlans,
    normalizeObject,
    isDeprecatedPath,
    getApplicableRule,
    TRANSFORMATION_RULES
};
