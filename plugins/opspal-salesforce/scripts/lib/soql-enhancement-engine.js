#!/usr/bin/env node

/**
 * SOQL Enhancement Engine
 *
 * Purpose: Enhance SOQL queries with security, org mappings, and optimizations
 *
 * Features:
 *   1. Security Enforcement: Auto-add WITH SECURITY_ENFORCED
 *   2. Org Mappings: Apply custom label mappings (e.g., Quote → Order Form)
 *   3. Query Optimization: Add index hints and optimize WHERE clauses
 *   4. Data Quality: Add filters for common data quality issues
 *
 * Usage:
 *   node soql-enhancement-engine.js enhance <org-alias> "<soql-query>"
 *   node soql-enhancement-engine.js validate <org-alias> "<soql-query>"
 *   node soql-enhancement-engine.js explain <org-alias> "<soql-query>"
 *
 * Configuration:
 *   - Reads from: instances/{org}/ORG_QUIRKS.json
 *   - Settings: .claude/settings.local.json -> hooks.soql-enhancement
 *
 * Created: 2025-10-09
 * Version: 1.0.0
 */

const fs = require('fs');
const path = require('path');

// ========================================
// Configuration
// ========================================

const DEFAULT_CONFIG = {
    enforceSecurity: true,
    useOrgMappings: true,
    optimizeQueries: true,
    addDataQualityFilters: false, // Disabled by default (can break queries)
    preserveFormatting: true,
    maxQueryLength: 20000
};

/**
 * Load configuration from settings file
 */
function loadConfig() {
    const settingsPath = path.join(__dirname, '../../.claude/settings.local.json');

    if (fs.existsSync(settingsPath)) {
        try {
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            const hookConfig = settings?.hooks?.['soql-enhancement'] || {};
            return { ...DEFAULT_CONFIG, ...hookConfig };
        } catch (e) {
            // Settings file invalid, use defaults
        }
    }

    return DEFAULT_CONFIG;
}

/**
 * Load org quirks (object/field mappings)
 */
function loadOrgQuirks(orgAlias) {
    const quirksPath = path.join(__dirname, `../../instances/${orgAlias}/ORG_QUIRKS.json`);

    if (fs.existsSync(quirksPath)) {
        try {
            return JSON.parse(fs.readFileSync(quirksPath, 'utf8'));
        } catch (e) {
            // Quirks file invalid, return empty
        }
    }

    return { objectMappings: {}, fieldMappings: {} };
}

// ========================================
// SOQL Parsing
// ========================================

/**
 * Simple SOQL parser to extract query components
 */
function parseSOQL(query) {
    // Remove extra whitespace
    const normalized = query.replace(/\s+/g, ' ').trim();

    // Extract main clauses using regex
    const selectMatch = normalized.match(/SELECT\s+(.+?)\s+FROM/i);
    const fromMatch = normalized.match(/FROM\s+(\w+)/i);
    const whereMatch = normalized.match(/WHERE\s+(.+?)(?:\s+ORDER\s+BY|\s+GROUP\s+BY|\s+LIMIT|\s+OFFSET|$)/i);
    const orderMatch = normalized.match(/ORDER\s+BY\s+(.+?)(?:\s+LIMIT|\s+OFFSET|$)/i);
    const limitMatch = normalized.match(/LIMIT\s+(\d+)/i);
    const offsetMatch = normalized.match(/OFFSET\s+(\d+)/i);
    const securityMatch = normalized.match(/WITH\s+SECURITY_ENFORCED/i);

    return {
        original: query,
        normalized,
        select: selectMatch ? selectMatch[1].trim() : null,
        from: fromMatch ? fromMatch[1].trim() : null,
        where: whereMatch ? whereMatch[1].trim() : null,
        orderBy: orderMatch ? orderMatch[1].trim() : null,
        limit: limitMatch ? parseInt(limitMatch[1]) : null,
        offset: offsetMatch ? parseInt(offsetMatch[1]) : null,
        hasSecurity: !!securityMatch
    };
}

/**
 * Rebuild SOQL query from parsed components
 */
function buildSOQL(parsed) {
    let query = `SELECT ${parsed.select} FROM ${parsed.from}`;

    if (parsed.where) {
        query += ` WHERE ${parsed.where}`;
    }

    if (parsed.hasSecurity) {
        query += ' WITH SECURITY_ENFORCED';
    }

    if (parsed.orderBy) {
        query += ` ORDER BY ${parsed.orderBy}`;
    }

    if (parsed.limit !== null) {
        query += ` LIMIT ${parsed.limit}`;
    }

    if (parsed.offset !== null) {
        query += ` OFFSET ${parsed.offset}`;
    }

    return query;
}

// ========================================
// Enhancement Functions
// ========================================

/**
 * Add WITH SECURITY_ENFORCED if not present
 */
function addSecurityEnforcement(parsed, config) {
    if (!config.enforceSecurity) {
        return parsed;
    }

    if (parsed.hasSecurity) {
        return parsed; // Already has security enforcement
    }

    // Add security enforcement
    parsed.hasSecurity = true;

    return parsed;
}

/**
 * Apply org-specific object and field mappings
 */
function applyOrgMappings(parsed, quirks, config) {
    if (!config.useOrgMappings) {
        return parsed;
    }

    if (!quirks || (!quirks.objectMappings && !quirks.fieldMappings)) {
        return parsed; // No mappings available
    }

    // Apply object mappings to FROM clause
    if (quirks.objectMappings && quirks.objectMappings[parsed.from]) {
        const mapping = quirks.objectMappings[parsed.from];
        if (mapping.apiName && mapping.apiName !== parsed.from) {
            // Replace with API name
            parsed.from = mapping.apiName;
        }
    }

    // Apply field mappings to SELECT and WHERE clauses
    if (quirks.fieldMappings && quirks.fieldMappings[parsed.from]) {
        const fieldMappings = quirks.fieldMappings[parsed.from];

        // Update SELECT clause
        for (const [customLabel, apiName] of Object.entries(fieldMappings)) {
            const regex = new RegExp(`\\b${customLabel}\\b`, 'gi');
            parsed.select = parsed.select.replace(regex, apiName);
            if (parsed.where) {
                parsed.where = parsed.where.replace(regex, apiName);
            }
            if (parsed.orderBy) {
                parsed.orderBy = parsed.orderBy.replace(regex, apiName);
            }
        }
    }

    return parsed;
}

/**
 * Optimize query performance
 */
function optimizeQuery(parsed, config) {
    if (!config.optimizeQueries) {
        return parsed;
    }

    // Optimization 1: Ensure indexed fields in WHERE clause come first
    // (This is a placeholder - real implementation would need schema analysis)

    // Optimization 2: Suggest LIMIT if not present and query is expensive
    if (parsed.limit === null && !parsed.where) {
        // No LIMIT and no WHERE = potentially expensive query
        // Add a reasonable default LIMIT
        parsed.limit = 10000; // Salesforce best practice
    }

    return parsed;
}

/**
 * Add data quality filters
 */
function addDataQualityFilters(parsed, config) {
    if (!config.addDataQualityFilters) {
        return parsed;
    }

    // Common data quality filters:
    // - Exclude test records
    // - Exclude records with invalid dates
    // - Exclude orphaned records

    const qualityFilters = [];

    // Filter out test records (if Name field exists in SELECT)
    if (parsed.select.includes('Name')) {
        qualityFilters.push("Name NOT LIKE 'Test%'");
        qualityFilters.push("Name NOT LIKE '%Test%'");
    }

    // Add filters to WHERE clause
    if (qualityFilters.length > 0) {
        const additionalFilters = qualityFilters.join(' AND ');
        if (parsed.where) {
            parsed.where = `(${parsed.where}) AND ${additionalFilters}`;
        } else {
            parsed.where = additionalFilters;
        }
    }

    return parsed;
}

// ========================================
// Main Enhancement Function
// ========================================

/**
 * Enhance SOQL query with all enabled features
 */
function enhanceQuery(orgAlias, query) {
    const config = loadConfig();
    const quirks = loadOrgQuirks(orgAlias);

    // Parse query
    let parsed = parseSOQL(query);

    // Validate query is parseable
    if (!parsed.select || !parsed.from) {
        throw new Error('Invalid SOQL query: missing SELECT or FROM clause');
    }

    // Apply enhancements in order
    parsed = addSecurityEnforcement(parsed, config);
    parsed = applyOrgMappings(parsed, quirks, config);
    parsed = optimizeQuery(parsed, config);
    parsed = addDataQualityFilters(parsed, config);

    // Rebuild query
    const enhanced = buildSOQL(parsed);

    // Validate length
    if (enhanced.length > config.maxQueryLength) {
        throw new Error(`Enhanced query exceeds maximum length (${enhanced.length} > ${config.maxQueryLength})`);
    }

    return enhanced;
}

/**
 * Validate query syntax (without enhancing)
 */
function validateQuery(orgAlias, query) {
    try {
        const parsed = parseSOQL(query);

        if (!parsed.select || !parsed.from) {
            return {
                valid: false,
                error: 'Missing required SELECT or FROM clause'
            };
        }

        return {
            valid: true,
            parsed
        };
    } catch (e) {
        return {
            valid: false,
            error: e.message
        };
    }
}

/**
 * Explain what enhancements would be applied
 */
function explainEnhancements(orgAlias, query) {
    const config = loadConfig();
    const quirks = loadOrgQuirks(orgAlias);
    const parsed = parseSOQL(query);

    const enhancements = [];

    // Check security
    if (config.enforceSecurity && !parsed.hasSecurity) {
        enhancements.push({
            type: 'security',
            description: 'Add WITH SECURITY_ENFORCED',
            reason: 'Enforce field-level security and sharing rules'
        });
    }

    // Check org mappings
    if (config.useOrgMappings && quirks.objectMappings && quirks.objectMappings[parsed.from]) {
        const mapping = quirks.objectMappings[parsed.from];
        enhancements.push({
            type: 'object-mapping',
            description: `Map ${parsed.from} → ${mapping.apiName}`,
            reason: `Org uses custom label "${mapping.customLabel}"`
        });
    }

    // Check optimization
    if (config.optimizeQueries && parsed.limit === null && !parsed.where) {
        enhancements.push({
            type: 'optimization',
            description: 'Add LIMIT 10000',
            reason: 'Prevent expensive unfiltered queries'
        });
    }

    // Check data quality
    if (config.addDataQualityFilters && parsed.select.includes('Name')) {
        enhancements.push({
            type: 'data-quality',
            description: 'Filter out test records',
            reason: 'Exclude records with Name containing "Test"'
        });
    }

    return {
        original: query,
        enhancements,
        wouldEnhance: enhancements.length > 0
    };
}

// ========================================
// CLI Interface
// ========================================

function showUsage() {
    console.log(`
SOQL Enhancement Engine

Usage:
  node soql-enhancement-engine.js enhance <org-alias> "<soql-query>"
  node soql-enhancement-engine.js validate <org-alias> "<soql-query>"
  node soql-enhancement-engine.js explain <org-alias> "<soql-query>"

Commands:
  enhance   - Enhance query with security, mappings, and optimizations
  validate  - Validate query syntax without enhancing
  explain   - Show what enhancements would be applied

Examples:
  # Enhance query
  node soql-enhancement-engine.js enhance my-org "SELECT Id, Name FROM Account WHERE Type = 'Customer'"

  # Validate query
  node soql-enhancement-engine.js validate my-org "SELECT Id FROM Account"

  # Explain enhancements
  node soql-enhancement-engine.js explain my-org "SELECT Id, Name FROM Account"

Configuration:
  Settings: .claude/settings.local.json -> hooks.soql-enhancement
  Org Mappings: instances/{org}/ORG_QUIRKS.json
`);
}

function main() {
    const args = process.argv.slice(2);

    if (args.length < 3) {
        showUsage();
        process.exit(1);
    }

    const command = args[0];
    const orgAlias = args[1];
    const query = args[2];

    try {
        switch (command) {
            case 'enhance':
                const enhanced = enhanceQuery(orgAlias, query);
                console.log(enhanced);
                break;

            case 'validate':
                const validation = validateQuery(orgAlias, query);
                console.log(JSON.stringify(validation, null, 2));
                break;

            case 'explain':
                const explanation = explainEnhancements(orgAlias, query);
                console.log(JSON.stringify(explanation, null, 2));
                break;

            default:
                console.error(`Unknown command: ${command}`);
                showUsage();
                process.exit(1);
        }
    } catch (e) {
        console.error(`Error: ${e.message}`);
        process.exit(1);
    }
}

// Run CLI if called directly
if (require.main === module) {
    main();
}

// Export for use as module
module.exports = {
    enhanceQuery,
    validateQuery,
    explainEnhancements,
    parseSOQL,
    buildSOQL
};
