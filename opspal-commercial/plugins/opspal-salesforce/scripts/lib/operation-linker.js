#!/usr/bin/env node

/**
 * Operation Linker - Cross-Day Integration Discovery
 *
 * Tracks Salesforce operations and auto-discovers related work from prior days.
 * Solves the "missing advocate integration" error from 2025-10-03.
 *
 * Key Features:
 * - Operation metadata tracking
 * - Dependency graph building
 * - Related operation discovery
 * - Auto-suggestion of integrations
 *
 * Example:
 * Day 1: Advocate mapping → Records operation with outputs
 * Day 2: Renewal import → Auto-detects advocate mapping, suggests integration
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { PathResolver } = require('./multi-path-resolver');

class OperationLinker {
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.options = {
            maxDaysBack: options.maxDaysBack || 7,
            registryPath: options.registryPath || this.getRegistryPath(),
            ...options
        };

        this.registry = this.loadRegistry();
    }

    /**
     * Get registry path for operation tracking
     * Quick Win: Uses PathResolver for flexible instance directory discovery
     */
    getRegistryPath() {
        // Store in instance directory if available
        const cwd = process.cwd();
        const instanceMatch = cwd.match(/(instances\/[^\/]+)/);

        if (instanceMatch) {
            return path.join(instanceMatch[1], '.operation-registry.json');
        }

        // Quick Win: Use PathResolver to find instance directory
        const resolver = new PathResolver({ verbose: false, throwOnNotFound: false });
        const instanceDir = resolver.findInstancePath(this.orgAlias, {
            platform: 'salesforce',
            fromDirectory: path.join(__dirname, '../..')
        });

        if (instanceDir) {
            return path.join(instanceDir, '.operation-registry.json');
        }

        // Fallback to org-specific registry for backwards compatibility
        return path.join(__dirname, `../../instances/${this.orgAlias}/.operation-registry.json`);
    }

    /**
     * Load operation registry
     */
    loadRegistry() {
        if (!fs.existsSync(this.options.registryPath)) {
            return { operations: [], lastUpdated: null };
        }

        try {
            return JSON.parse(fs.readFileSync(this.options.registryPath, 'utf8'));
        } catch (error) {
            console.warn(`Warning: Could not load operation registry: ${error.message}`);
            return { operations: [], lastUpdated: null };
        }
    }

    /**
     * Save operation registry
     */
    saveRegistry() {
        fs.mkdirSync(path.dirname(this.options.registryPath), { recursive: true });
        fs.writeFileSync(
            this.options.registryPath,
            JSON.stringify(this.registry, null, 2)
        );
    }

    /**
     * Record a new operation
     *
     * @param {Object} metadata - Operation metadata
     * @param {string} metadata.type - Operation type (e.g., 'advocate-mapping', 'renewal-import')
     * @param {string} metadata.description - Human-readable description
     * @param {string[]} metadata.outputs - Output file paths
     * @param {Object} metadata.stats - Statistics (record counts, etc.)
     * @param {Object} metadata.config - Operation configuration
     * @returns {Object} Recorded operation
     */
    recordOperation(metadata) {
        const operation = {
            id: this.generateOperationId(metadata.type),
            type: metadata.type,
            description: metadata.description,
            timestamp: new Date().toISOString(),
            orgAlias: this.orgAlias,
            outputs: metadata.outputs || [],
            stats: metadata.stats || {},
            config: metadata.config || {},
            relatedTo: metadata.relatedTo || [],
            tags: metadata.tags || []
        };

        this.registry.operations.push(operation);
        this.registry.lastUpdated = operation.timestamp;
        this.saveRegistry();

        return operation;
    }

    /**
     * Find related operations for a given operation type
     *
     * @param {string} operationType - Type of operation to find related work for
     * @param {Object} options - Search options
     * @returns {Array} Related operations with relevance scores
     */
    findRelatedOperations(operationType, options = {}) {
        const maxAge = options.maxDaysBack || this.options.maxDaysBack;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - maxAge);

        // Get recent operations
        const recentOps = this.registry.operations.filter(op => {
            const opDate = new Date(op.timestamp);
            return opDate >= cutoffDate && op.orgAlias === this.orgAlias;
        });

        // Define relationship patterns
        const relationships = this.getRelationshipPatterns();
        const targetRelationships = relationships[operationType] || [];

        // Score and rank related operations
        const related = recentOps
            .map(op => {
                const relevance = this.calculateRelevance(op, operationType, targetRelationships);
                return { operation: op, relevance };
            })
            .filter(({ relevance }) => relevance > 0)
            .sort((a, b) => b.relevance - a.relevance);

        return related;
    }

    /**
     * Get relationship patterns between operation types
     */
    getRelationshipPatterns() {
        return {
            'renewal-import': {
                'advocate-mapping': {
                    score: 10,
                    description: 'Advocate assignments can be integrated into renewal import',
                    integration: 'advocateAssignment',
                    filePattern: /advocate.*\.json$/
                },
                'account-enrichment': {
                    score: 8,
                    description: 'Account metadata useful for opportunity naming',
                    integration: 'accountLookup',
                    filePattern: /account.*\.json$/
                },
                'csv-enrichment': {
                    score: 9,
                    description: 'Enriched CSV with Account IDs ready for import',
                    integration: 'enrichedCsv',
                    filePattern: /enriched.*\.csv$/
                }
            },
            'opportunity-cleanup': {
                'renewal-import': {
                    score: 7,
                    description: 'Recent renewal import may need cleanup',
                    integration: 'sourceData',
                    filePattern: /renewal.*\.csv$/
                }
            },
            'owner-reassignment': {
                'advocate-mapping': {
                    score: 10,
                    description: 'Advocate mappings available for owner updates',
                    integration: 'ownerMapping',
                    filePattern: /advocate.*\.json$/
                },
                'renewal-import': {
                    score: 8,
                    description: 'Recent renewals may need owner updates',
                    integration: 'targetRecords',
                    filePattern: /success.*\.csv$/
                }
            }
        };
    }

    /**
     * Calculate relevance score for an operation
     */
    calculateRelevance(operation, targetType, relationships) {
        let score = 0;

        // Check if operation type matches any relationship
        for (const [relatedType, config] of Object.entries(relationships)) {
            if (operation.type === relatedType) {
                score += config.score;

                // Bonus for matching output files
                if (config.filePattern) {
                    const hasMatchingOutput = operation.outputs.some(output =>
                        config.filePattern.test(path.basename(output))
                    );
                    if (hasMatchingOutput) {
                        score += 5;
                    }
                }

                // Bonus for recent operations (decay over time)
                const ageInDays = this.getAgeInDays(operation.timestamp);
                const recencyBonus = Math.max(0, 5 - ageInDays);
                score += recencyBonus;

                // Bonus for large datasets
                if (operation.stats.recordCount > 100) {
                    score += 2;
                }
            }
        }

        return score;
    }

    /**
     * Get operation age in days
     */
    getAgeInDays(timestamp) {
        const opDate = new Date(timestamp);
        const now = new Date();
        const diffMs = now - opDate;
        return Math.floor(diffMs / (1000 * 60 * 60 * 24));
    }

    /**
     * Generate operation ID
     */
    generateOperationId(type) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const random = Math.random().toString(36).substring(2, 6);
        return `${type}-${timestamp}-${random}`;
    }

    /**
     * Discover and suggest integrations for current operation
     *
     * @param {string} operationType - Current operation type
     * @param {Object} options - Discovery options
     * @returns {Object} Integration suggestions
     */
    discoverIntegrations(operationType, options = {}) {
        console.log(`\n🔍 Discovering integrations for ${operationType}...\n`);

        const related = this.findRelatedOperations(operationType, options);

        if (related.length === 0) {
            console.log('   No related operations found\n');
            return { suggestions: [], related: [] };
        }

        const relationships = this.getRelationshipPatterns();
        const suggestions = [];

        for (const { operation, relevance } of related) {
            const relationshipConfig = relationships[operationType]?.[operation.type];

            if (relationshipConfig && relevance >= 5) {
                const suggestion = {
                    operation: operation,
                    relevance: relevance,
                    integrationType: relationshipConfig.integration,
                    description: relationshipConfig.description,
                    files: this.findIntegrationFiles(operation, relationshipConfig)
                };

                suggestions.push(suggestion);

                // Display suggestion
                const ageInDays = this.getAgeInDays(operation.timestamp);
                console.log(`   🔗 ${operation.type} (${ageInDays} days ago) - Relevance: ${relevance}`);
                console.log(`      ${relationshipConfig.description}`);
                if (suggestion.files.length > 0) {
                    console.log(`      Files: ${suggestion.files.join(', ')}`);
                }
                console.log();
            }
        }

        if (suggestions.length === 0) {
            console.log('   No high-relevance integrations found\n');
        }

        return { suggestions, related };
    }

    /**
     * Find integration files from operation
     */
    findIntegrationFiles(operation, relationshipConfig) {
        if (!relationshipConfig.filePattern) {
            return operation.outputs || [];
        }

        return (operation.outputs || []).filter(output =>
            relationshipConfig.filePattern.test(path.basename(output))
        );
    }

    /**
     * Link current operation to related operations
     *
     * @param {string} currentOpId - Current operation ID
     * @param {string[]} relatedOpIds - Related operation IDs
     */
    linkOperations(currentOpId, relatedOpIds) {
        const currentOp = this.registry.operations.find(op => op.id === currentOpId);
        if (!currentOp) {
            throw new Error(`Operation not found: ${currentOpId}`);
        }

        currentOp.relatedTo = [...new Set([...(currentOp.relatedTo || []), ...relatedOpIds])];
        this.saveRegistry();
    }

    /**
     * Get operation by ID
     */
    getOperation(operationId) {
        return this.registry.operations.find(op => op.id === operationId);
    }

    /**
     * Get all operations of a specific type
     */
    getOperationsByType(type) {
        return this.registry.operations.filter(op =>
            op.type === type && op.orgAlias === this.orgAlias
        );
    }

    /**
     * Clean old operations from registry
     */
    cleanRegistry(daysToKeep = 30) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

        const before = this.registry.operations.length;
        this.registry.operations = this.registry.operations.filter(op => {
            const opDate = new Date(op.timestamp);
            return opDate >= cutoffDate;
        });

        const removed = before - this.registry.operations.length;
        if (removed > 0) {
            this.saveRegistry();
            console.log(`Cleaned ${removed} operations older than ${daysToKeep} days`);
        }

        return removed;
    }

    /**
     * Export operation graph for visualization
     */
    exportGraph() {
        const nodes = this.registry.operations.map(op => ({
            id: op.id,
            label: `${op.type}\n${new Date(op.timestamp).toLocaleDateString()}`,
            type: op.type,
            timestamp: op.timestamp
        }));

        const edges = [];
        this.registry.operations.forEach(op => {
            (op.relatedTo || []).forEach(relatedId => {
                edges.push({
                    from: op.id,
                    to: relatedId,
                    label: 'related'
                });
            });
        });

        return { nodes, edges };
    }
}

// CLI Interface
if (require.main === module) {
    const command = process.argv[2];
    const orgAlias = process.env.SF_TARGET_ORG || process.argv[3];

    if (!orgAlias && command !== 'help') {
        console.error('Error: SF_TARGET_ORG not set and no org alias provided');
        process.exit(1);
    }

    const linker = new OperationLinker(orgAlias);

    switch (command) {
        case 'record': {
            const metadata = JSON.parse(process.argv[4] || '{}');
            const operation = linker.recordOperation(metadata);
            console.log(JSON.stringify(operation, null, 2));
            break;
        }

        case 'discover': {
            const operationType = process.argv[4];
            if (!operationType) {
                console.error('Usage: operation-linker.js discover <org> <operation-type>');
                process.exit(1);
            }
            const result = linker.discoverIntegrations(operationType);
            console.log(JSON.stringify(result, null, 2));
            break;
        }

        case 'list': {
            const type = process.argv[4];
            const operations = type
                ? linker.getOperationsByType(type)
                : linker.registry.operations.filter(op => op.orgAlias === orgAlias);

            console.log(JSON.stringify(operations, null, 2));
            break;
        }

        case 'link': {
            const currentId = process.argv[4];
            const relatedIds = process.argv.slice(5);
            linker.linkOperations(currentId, relatedIds);
            console.log(`Linked ${currentId} to ${relatedIds.length} operations`);
            break;
        }

        case 'clean': {
            const days = parseInt(process.argv[4] || '30');
            linker.cleanRegistry(days);
            break;
        }

        case 'graph': {
            const graph = linker.exportGraph();
            console.log(JSON.stringify(graph, null, 2));
            break;
        }

        case 'help':
        default:
            console.log(`
Operation Linker - Cross-Day Integration Discovery

Usage:
  node operation-linker.js record <org> '<metadata-json>'
  node operation-linker.js discover <org> <operation-type>
  node operation-linker.js list <org> [type]
  node operation-linker.js link <org> <current-op-id> <related-op-id>...
  node operation-linker.js clean <org> [days-to-keep]
  node operation-linker.js graph <org>

Examples:
  # Record advocate mapping operation
  node operation-linker.js record acme-production '{"type":"advocate-mapping","outputs":["advocate-analysis.json"],"stats":{"recordCount":134}}'

  # Discover integrations for renewal import
  node operation-linker.js discover acme-production renewal-import

  # List all operations
  node operation-linker.js list acme-production

  # List only renewal imports
  node operation-linker.js list acme-production renewal-import

  # Link renewal import to advocate mapping
  node operation-linker.js link acme-production renewal-import-2025-10-03-a3f4 advocate-mapping-2025-10-02-b7k9

  # Clean operations older than 30 days
  node operation-linker.js clean acme-production 30

  # Export operation graph
  node operation-linker.js graph acme-production
            `);
    }
}

module.exports = { OperationLinker };
