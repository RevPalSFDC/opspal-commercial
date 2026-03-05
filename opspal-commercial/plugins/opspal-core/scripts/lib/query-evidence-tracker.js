#!/usr/bin/env node
/**
 * Query Evidence Tracker
 *
 * Tracks all live queries made during a Claude session to provide evidence
 * that agents are validating against target systems rather than relying on
 * local documentation.
 *
 * Usage:
 *   node query-evidence-tracker.js log <platform> <query-type> <target> [--session-id <id>]
 *   node query-evidence-tracker.js check <platform> <object> [--ttl <seconds>]
 *   node query-evidence-tracker.js report [--session-id <id>]
 *   node query-evidence-tracker.js clear [--session-id <id>]
 *
 * Platforms: salesforce, hubspot, marketo
 *
 * Examples:
 *   # Log a Salesforce query
 *   node query-evidence-tracker.js log salesforce sobject-describe Account
 *
 *   # Check if Account was queried within TTL
 *   node query-evidence-tracker.js check salesforce Account --ttl 300
 *
 *   # Get full evidence report
 *   node query-evidence-tracker.js report
 *
 * Environment:
 *   QUERY_EVIDENCE_TTL_SECONDS - Default TTL (default: 300 = 5 minutes)
 *   CLAUDE_SESSION_ID - Session identifier
 *
 * @version 1.0.0
 * @date 2026-01-09
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Configuration
const DEFAULT_TTL_SECONDS = parseInt(process.env.QUERY_EVIDENCE_TTL_SECONDS || '300', 10);
const SESSION_DIR = path.join(os.tmpdir(), 'claude-query-evidence');
const SESSION_ID = process.env.CLAUDE_SESSION_ID || 'default';

/**
 * Query types by platform
 */
const QUERY_TYPES = {
    salesforce: {
        'sobject-describe': { category: 'object', extractsFields: true },
        'data-query': { category: 'record', extractsFields: false },
        'tooling-query': { category: 'metadata', extractsFields: false },
        'metadata-describe': { category: 'metadata', extractsFields: false },
        'mcp-object-list': { category: 'object', extractsFields: false },
        'mcp-field-list': { category: 'field', extractsFields: true },
        'mcp-flow-list': { category: 'flow', extractsFields: false },
        'mcp-validation-list': { category: 'validation', extractsFields: false }
    },
    hubspot: {
        'property-list': { category: 'property', extractsFields: true },
        'object-schema': { category: 'object', extractsFields: true },
        'workflow-list': { category: 'workflow', extractsFields: false },
        'portal-info': { category: 'portal', extractsFields: false },
        'mcp-properties': { category: 'property', extractsFields: true },
        'mcp-objects': { category: 'object', extractsFields: false }
    },
    marketo: {
        'describe-lead': { category: 'lead', extractsFields: true },
        'describe-activity': { category: 'activity', extractsFields: false },
        'list-programs': { category: 'program', extractsFields: false },
        'list-campaigns': { category: 'campaign', extractsFields: false },
        'mcp-lead-describe': { category: 'lead', extractsFields: true }
    }
};

/**
 * Ensure session directory exists
 */
function ensureSessionDir() {
    const sessionPath = path.join(SESSION_DIR, SESSION_ID);
    if (!fs.existsSync(sessionPath)) {
        fs.mkdirSync(sessionPath, { recursive: true });
    }
    return sessionPath;
}

/**
 * Get evidence file path
 */
function getEvidenceFilePath() {
    const sessionPath = ensureSessionDir();
    return path.join(sessionPath, 'query-evidence.json');
}

/**
 * Load existing evidence
 */
function loadEvidence() {
    const filePath = getEvidenceFilePath();
    if (fs.existsSync(filePath)) {
        try {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (e) {
            return createEmptyEvidence();
        }
    }
    return createEmptyEvidence();
}

/**
 * Create empty evidence structure
 */
function createEmptyEvidence() {
    return {
        sessionId: SESSION_ID,
        created: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        platforms: {
            salesforce: { queries: [], objects: {}, fields: {} },
            hubspot: { queries: [], objects: {}, properties: {} },
            marketo: { queries: [], objects: {}, fields: {} }
        },
        summary: {
            totalQueries: 0,
            byPlatform: { salesforce: 0, hubspot: 0, marketo: 0 },
            byType: {}
        }
    };
}

/**
 * Save evidence to file
 */
function saveEvidence(evidence) {
    const filePath = getEvidenceFilePath();
    evidence.lastUpdated = new Date().toISOString();
    fs.writeFileSync(filePath, JSON.stringify(evidence, null, 2));
}

/**
 * Log a query
 */
function logQuery(platform, queryType, target, details = {}) {
    if (!QUERY_TYPES[platform]) {
        console.error(`Unknown platform: ${platform}`);
        process.exit(1);
    }

    const evidence = loadEvidence();
    const timestamp = new Date().toISOString();

    const queryRecord = {
        timestamp,
        type: queryType,
        target,
        details,
        ttlExpires: new Date(Date.now() + DEFAULT_TTL_SECONDS * 1000).toISOString()
    };

    // Add to queries list
    evidence.platforms[platform].queries.push(queryRecord);

    // Track objects/fields queried
    if (target) {
        const targetKey = target.toLowerCase();

        // Track object
        if (!evidence.platforms[platform].objects[targetKey]) {
            evidence.platforms[platform].objects[targetKey] = {
                firstQueried: timestamp,
                lastQueried: timestamp,
                queryCount: 0,
                queryTypes: []
            };
        }

        const objRecord = evidence.platforms[platform].objects[targetKey];
        objRecord.lastQueried = timestamp;
        objRecord.queryCount++;
        if (!objRecord.queryTypes.includes(queryType)) {
            objRecord.queryTypes.push(queryType);
        }

        // Track fields if provided
        if (details.fields && Array.isArray(details.fields)) {
            const fieldsKey = platform === 'hubspot' ? 'properties' : 'fields';
            details.fields.forEach(field => {
                const fieldKey = `${targetKey}.${field.toLowerCase()}`;
                if (!evidence.platforms[platform][fieldsKey][fieldKey]) {
                    evidence.platforms[platform][fieldsKey][fieldKey] = {
                        firstQueried: timestamp,
                        lastQueried: timestamp,
                        queryCount: 0
                    };
                }
                evidence.platforms[platform][fieldsKey][fieldKey].lastQueried = timestamp;
                evidence.platforms[platform][fieldsKey][fieldKey].queryCount++;
            });
        }
    }

    // Update summary
    evidence.summary.totalQueries++;
    evidence.summary.byPlatform[platform]++;
    evidence.summary.byType[queryType] = (evidence.summary.byType[queryType] || 0) + 1;

    saveEvidence(evidence);

    console.log(JSON.stringify({
        status: 'logged',
        platform,
        queryType,
        target,
        timestamp,
        sessionId: SESSION_ID
    }));
}

/**
 * Check if object/field was queried within TTL
 */
function checkEvidence(platform, target, ttlSeconds = DEFAULT_TTL_SECONDS) {
    const evidence = loadEvidence();
    const now = Date.now();
    const cutoff = now - (ttlSeconds * 1000);

    if (!evidence.platforms[platform]) {
        return outputCheck(false, platform, target, 'Platform not found');
    }

    const targetKey = target.toLowerCase();

    // Check object-level evidence
    const objRecord = evidence.platforms[platform].objects[targetKey];
    if (objRecord) {
        const lastQueried = new Date(objRecord.lastQueried).getTime();
        if (lastQueried >= cutoff) {
            return outputCheck(true, platform, target, 'Object queried within TTL', {
                lastQueried: objRecord.lastQueried,
                queryCount: objRecord.queryCount,
                queryTypes: objRecord.queryTypes,
                ageSeconds: Math.round((now - lastQueried) / 1000)
            });
        }
    }

    // Check if it's a field reference (Object.Field format)
    if (target.includes('.')) {
        const fieldsKey = platform === 'hubspot' ? 'properties' : 'fields';
        const fieldRecord = evidence.platforms[platform][fieldsKey][targetKey];
        if (fieldRecord) {
            const lastQueried = new Date(fieldRecord.lastQueried).getTime();
            if (lastQueried >= cutoff) {
                return outputCheck(true, platform, target, 'Field queried within TTL', {
                    lastQueried: fieldRecord.lastQueried,
                    queryCount: fieldRecord.queryCount,
                    ageSeconds: Math.round((now - lastQueried) / 1000)
                });
            }
        }
    }

    // Check recent queries for partial matches
    const recentQueries = evidence.platforms[platform].queries.filter(q => {
        const qTime = new Date(q.timestamp).getTime();
        return qTime >= cutoff && q.target && q.target.toLowerCase().includes(targetKey);
    });

    if (recentQueries.length > 0) {
        return outputCheck(true, platform, target, 'Related query found within TTL', {
            matchingQueries: recentQueries.length,
            mostRecent: recentQueries[recentQueries.length - 1]
        });
    }

    return outputCheck(false, platform, target, 'No evidence found within TTL', {
        ttlSeconds,
        suggestion: getSuggestion(platform, target)
    });
}

/**
 * Output check result
 */
function outputCheck(hasEvidence, platform, target, reason, details = {}) {
    const result = {
        hasEvidence,
        platform,
        target,
        reason,
        ...details,
        checkedAt: new Date().toISOString(),
        sessionId: SESSION_ID
    };
    console.log(JSON.stringify(result));
    process.exit(hasEvidence ? 0 : 1);
}

/**
 * Get suggestion for how to query an object
 */
function getSuggestion(platform, target) {
    const suggestions = {
        salesforce: `Run: sf sobject describe ${target} --target-org <org>`,
        hubspot: `Use: hubspot-discovery agent or GET /crm/v3/objects/${target}`,
        marketo: `Use: marketo-instance-discovery agent or describe API`
    };
    return suggestions[platform] || 'Query the target system directly';
}

/**
 * Generate evidence report
 */
function generateReport() {
    const evidence = loadEvidence();
    const now = Date.now();
    const cutoff = now - (DEFAULT_TTL_SECONDS * 1000);

    const report = {
        sessionId: SESSION_ID,
        generated: new Date().toISOString(),
        ttlSeconds: DEFAULT_TTL_SECONDS,
        summary: evidence.summary,
        validEvidence: {
            salesforce: { objects: [], count: 0 },
            hubspot: { objects: [], count: 0 },
            marketo: { objects: [], count: 0 }
        },
        expiredEvidence: {
            salesforce: { objects: [], count: 0 },
            hubspot: { objects: [], count: 0 },
            marketo: { objects: [], count: 0 }
        }
    };

    // Categorize evidence by validity
    ['salesforce', 'hubspot', 'marketo'].forEach(platform => {
        Object.entries(evidence.platforms[platform].objects).forEach(([obj, record]) => {
            const lastQueried = new Date(record.lastQueried).getTime();
            const isValid = lastQueried >= cutoff;
            const category = isValid ? 'validEvidence' : 'expiredEvidence';

            report[category][platform].objects.push({
                name: obj,
                lastQueried: record.lastQueried,
                ageSeconds: Math.round((now - lastQueried) / 1000),
                queryCount: record.queryCount,
                queryTypes: record.queryTypes
            });
            report[category][platform].count++;
        });
    });

    console.log(JSON.stringify(report, null, 2));
}

/**
 * Clear evidence for session
 */
function clearEvidence() {
    const filePath = getEvidenceFilePath();
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
    console.log(JSON.stringify({
        status: 'cleared',
        sessionId: SESSION_ID,
        timestamp: new Date().toISOString()
    }));
}

/**
 * Main CLI handler
 */
function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    // Handle --session-id flag
    const sessionIdIndex = args.indexOf('--session-id');
    if (sessionIdIndex !== -1 && args[sessionIdIndex + 1]) {
        process.env.CLAUDE_SESSION_ID = args[sessionIdIndex + 1];
    }

    // Handle --ttl flag
    let ttl = DEFAULT_TTL_SECONDS;
    const ttlIndex = args.indexOf('--ttl');
    if (ttlIndex !== -1 && args[ttlIndex + 1]) {
        ttl = parseInt(args[ttlIndex + 1], 10);
    }

    switch (command) {
        case 'log':
            if (args.length < 4) {
                console.error('Usage: log <platform> <query-type> <target> [--details <json>]');
                process.exit(1);
            }
            const detailsIndex = args.indexOf('--details');
            const details = detailsIndex !== -1 ? JSON.parse(args[detailsIndex + 1]) : {};
            logQuery(args[1], args[2], args[3], details);
            break;

        case 'check':
            if (args.length < 3) {
                console.error('Usage: check <platform> <target> [--ttl <seconds>]');
                process.exit(1);
            }
            checkEvidence(args[1], args[2], ttl);
            break;

        case 'report':
            generateReport();
            break;

        case 'clear':
            clearEvidence();
            break;

        default:
            console.error(`
Query Evidence Tracker - Track live queries for org validation enforcement

Commands:
  log <platform> <query-type> <target>  Log a query execution
  check <platform> <target>             Check if target was queried within TTL
  report                                Generate evidence report
  clear                                 Clear session evidence

Platforms: salesforce, hubspot, marketo

Options:
  --session-id <id>   Use specific session ID
  --ttl <seconds>     TTL for evidence validity (default: ${DEFAULT_TTL_SECONDS})
  --details <json>    Additional query details (for log command)

Environment:
  QUERY_EVIDENCE_TTL_SECONDS   Default TTL (current: ${DEFAULT_TTL_SECONDS})
  CLAUDE_SESSION_ID            Session identifier
`);
            process.exit(1);
    }
}

main();
