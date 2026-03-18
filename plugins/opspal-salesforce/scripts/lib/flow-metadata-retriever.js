#!/usr/bin/env node

/**
 * Flow Metadata Retriever
 *
 * Robust flow retrieval with automatic fallback from Tooling API to Metadata API
 * Eliminates "0 flows vs unavailable" ambiguity by providing clear error tracking
 *
 * Primary Path: FlowDefinitionView query (Tooling API)
 * Fallback Path: Metadata API retrieve + XML parsing
 *
 * Usage:
 *   const retriever = new FlowMetadataRetriever(orgAlias);
 *   const flows = await retriever.getAllFlows();
 *
 * @version 1.0.0
 * @date 2025-10-20
 */

const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const FlowXMLParser = require('./flow-xml-parser');
const PackageXMLGenerator = require('./package-xml-generator');

class FlowMetadataRetriever {
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.verbose = options.verbose || false;
        this.tempDir = path.join(__dirname, '..', '..', '.flow-metadata-temp', orgAlias);
        this.xmlParser = new FlowXMLParser({ verbose: this.verbose });
        this.packageGenerator = new PackageXMLGenerator();

        this.retrievalLog = {
            method: null, // 'tooling_api' or 'metadata_api'
            success: false,
            flowCount: 0,
            errors: [],
            warnings: []
        };
    }

    /**
     * Get all flows with automatic fallback strategy
     * @param {Object} options - Retrieval options
     * @returns {Promise<Array>} Array of flow objects
     */
    async getAllFlows(options = {}) {
        const activeOnly = options.activeOnly !== false;
        const excludeManaged = options.excludeManaged || false;

        try {
            // PRIMARY PATH: Try Tooling API query first
            if (this.verbose) {
                console.log('📊 Attempting FlowDefinitionView query (Tooling API)...');
            }

            const flows = await this.queryFlowsViaTooling(activeOnly, excludeManaged);

            this.retrievalLog.method = 'tooling_api';
            this.retrievalLog.success = true;
            this.retrievalLog.flowCount = flows.length;

            if (this.verbose) {
                console.log(`   ✓ FlowDefinitionView query succeeded: ${flows.length} flows`);
            }

            return flows;

        } catch (toolingError) {
            // FALLBACK PATH: Use Metadata API retrieval
            this.retrievalLog.errors.push({
                phase: 'tooling_api',
                error: toolingError.message
            });

            if (this.verbose) {
                console.warn(`   ⚠️  FlowDefinitionView query failed: ${toolingError.message}`);
                console.log('   📥 Falling back to Metadata API retrieval...');
            }

            try {
                const flows = await this.retrieveFlowsViaMetadata(activeOnly, excludeManaged);

                this.retrievalLog.method = 'metadata_api';
                this.retrievalLog.success = true;
                this.retrievalLog.flowCount = flows.length;
                this.retrievalLog.warnings.push(
                    'FlowDefinitionView unavailable - used Metadata API fallback'
                );

                if (this.verbose) {
                    console.log(`   ✓ Metadata API retrieval succeeded: ${flows.length} flows`);
                }

                return flows;

            } catch (metadataError) {
                this.retrievalLog.errors.push({
                    phase: 'metadata_api',
                    error: metadataError.message
                });

                this.retrievalLog.success = false;

                // Both methods failed - throw comprehensive error
                throw new Error(
                    `Flow retrieval failed via both methods:\n` +
                    `  Tooling API: ${toolingError.message}\n` +
                    `  Metadata API: ${metadataError.message}`
                );
            }
        }
    }

    /**
     * Query flows using Tooling API (FlowDefinitionView)
     * @param {boolean} activeOnly - Only return active flows
     * @param {boolean} excludeManaged - Exclude managed package flows
     * @returns {Promise<Array>} Flow records
     */
    async queryFlowsViaTooling(activeOnly = true, excludeManaged = false) {
        // Build WHERE clause
        const whereClauses = [];
        if (activeOnly) {
            whereClauses.push('IsActive = true');
        }
        if (excludeManaged) {
            whereClauses.push('NamespacePrefix = null');
        }
        const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        const query = `
            SELECT DurableId, ActiveVersionId, LatestVersionId,
                   ProcessType, DeveloperName, NamespacePrefix,
                   LastModifiedDate,
                   TriggerObjectOrEvent.QualifiedApiName,
                   TriggerType, RecordTriggerType, TriggerOrder
            FROM FlowDefinitionView
            ${whereClause}
            ORDER BY ProcessType, DeveloperName
            LIMIT 2000
        `;

        const cmd = `sf data query --query "${query.replace(/\s+/g, ' ').trim()}" --use-tooling-api --json --target-org ${this.orgAlias}`;

        try {
            const result = JSON.parse(execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }));

            if (result.status !== 0) {
                throw new Error(result.message || 'Query failed with non-zero status');
            }

            return result.result?.records || [];

        } catch (error) {
            // Parse error message for common API issues
            if (error.message.includes('sObject type') || error.message.includes('not supported')) {
                throw new Error('FlowDefinitionView not available in this org (API limitation)');
            }
            throw error;
        }
    }

    /**
     * Retrieve flows via Metadata API and parse XML
     * @param {boolean} activeOnly - Only return active flows
     * @param {boolean} excludeManaged - Exclude managed package flows
     * @returns {Promise<Array>} Parsed flow records
     */
    async retrieveFlowsViaMetadata(activeOnly = true, excludeManaged = false) {
        await this.ensureTempDirectory();

        // Step 1: Create minimal Salesforce project config (sfdx-project.json) required by sf CLI
        const projectConfig = {
            packageDirectories: [{ path: '.', default: true }],
            namespace: '',
            sfdcLoginUrl: 'https://login.salesforce.com',
            sourceApiVersion: '62.0'
        };
        const projectConfigPath = path.join(this.tempDir, 'sfdx-project.json');
        await fs.writeFile(projectConfigPath, JSON.stringify(projectConfig, null, 2));

        // Step 2: Generate package.xml for flows
        const packageXml = this.packageGenerator.generateForFlows();
        const packagePath = path.join(this.tempDir, 'package.xml');
        await fs.writeFile(packagePath, packageXml);

        // Step 3: Retrieve metadata using sf CLI
        const retrieveCmd = `sf project retrieve start --manifest package.xml --target-org ${this.orgAlias} --json`;

        try {
            const result = JSON.parse(execSync(retrieveCmd, {
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'pipe'],
                cwd: this.tempDir  // CRITICAL: Run from tempDir so sf finds the project config
            }));

            if (result.status !== 0) {
                throw new Error(result.message || 'Metadata retrieve failed');
            }

            // Step 4: Find flows directory
            const flowsDir = await this.findFlowsDirectory();

            if (!flowsDir) {
                throw new Error('No flows found in retrieved metadata');
            }

            // Step 5: Parse flow XML files
            const flows = await this.xmlParser.parseFlowDirectory(flowsDir);

            // Step 6: Filter flows based on options
            let filteredFlows = flows;
            if (activeOnly) {
                filteredFlows = filteredFlows.filter(f => f.IsActive);
            }
            if (excludeManaged) {
                // Filter out flows with NamespacePrefix (managed packages)
                filteredFlows = filteredFlows.filter(f => !f.NamespacePrefix || f.NamespacePrefix === null);
            }

            // Step 7: Convert to query-compatible format
            return this.xmlParser.toQueryCompatibleFormat(filteredFlows);

        } finally {
            // Cleanup temp files
            await this.cleanup();
        }
    }

    /**
     * Find flows directory in retrieved metadata
     * @returns {Promise<string|null>} Path to flows directory
     */
    async findFlowsDirectory() {
        const possiblePaths = [
            path.join(this.tempDir, 'main', 'default', 'flows'),  // Source format when run with cwd
            path.join(this.tempDir, 'force-app', 'main', 'default', 'flows'),
            path.join(this.tempDir, 'flows'),
            path.join(this.tempDir, 'src', 'flows')
        ];

        for (const dir of possiblePaths) {
            try {
                await fs.access(dir);
                return dir;
            } catch {
                continue;
            }
        }

        return null;
    }

    /**
     * Batch retrieve all Flow metadata using -m Flag (v3.28.0)
     * This is ~10x faster than retrieving flows individually
     * @returns {Promise<Array>} Parsed flow records with full metadata
     */
    async retrieveAllFlowsViaMetadataAPI() {
        await this.ensureTempDirectory();

        if (this.verbose) {
            console.log('📥 Batch retrieving all Flow metadata (API v62.0)...');
        }

        // Step 1: Create minimal project config with API v62.0 (ensures filterFormula presence)
        const projectConfig = {
            packageDirectories: [{ path: '.', default: true }],
            namespace: '',
            sfdcLoginUrl: 'https://login.salesforce.com',
            sourceApiVersion: '62.0'
        };
        const projectConfigPath = path.join(this.tempDir, 'sfdx-project.json');
        await fs.writeFile(projectConfigPath, JSON.stringify(projectConfig, null, 2));

        // Step 2: Retrieve all flows using -m Flow (wildcard)
        const retrieveCmd = `sf project retrieve start -m Flow --api-version 62.0 --target-org ${this.orgAlias} --json`;

        try {
            if (this.verbose) {
                console.log(`   Running: ${retrieveCmd}`);
            }

            const result = JSON.parse(execSync(retrieveCmd, {
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'pipe'],
                cwd: this.tempDir,
                maxBuffer: 50 * 1024 * 1024  // 50MB buffer for large metadata
            }));

            if (result.status !== 0) {
                throw new Error(result.message || 'Batch Flow retrieve failed');
            }

            if (this.verbose) {
                console.log(`   ✓ Retrieve succeeded`);
            }

            // Step 3: Find flows directory
            const flowsDir = await this.findFlowsDirectory();

            if (!flowsDir) {
                // No flows in org - return empty array (not an error)
                if (this.verbose) {
                    console.warn('   ⚠️  No flows found in org');
                }
                return [];
            }

            // Step 4: Parse all flow XML files
            const flows = await this.xmlParser.parseFlowDirectory(flowsDir);

            if (this.verbose) {
                console.log(`   ✓ Parsed ${flows.length} flow metadata files`);
            }

            this.retrievalLog.method = 'metadata_api_batch';
            this.retrievalLog.success = true;
            this.retrievalLog.flowCount = flows.length;

            return flows;

        } catch (error) {
            this.retrievalLog.errors.push({
                phase: 'metadata_api_batch',
                error: error.message
            });

            this.retrievalLog.success = false;

            throw new Error(`Batch Flow retrieval failed: ${error.message}`);
        } finally {
            // Cleanup temp files
            await this.cleanup();
        }
    }

    /**
     * Ensure temp directory exists
     */
    async ensureTempDirectory() {
        await fs.mkdir(this.tempDir, { recursive: true });
    }

    /**
     * Clean up temporary files
     */
    async cleanup() {
        try {
            await fs.rm(this.tempDir, { recursive: true, force: true });
        } catch (error) {
            // Ignore cleanup errors
            if (this.verbose) {
                console.warn(`   Warning: Failed to cleanup temp directory: ${error.message}`);
            }
        }
    }

    /**
     * Get retrieval log for audit tracking
     * @returns {Object} Retrieval log
     */
    getRetrievalLog() {
        return { ...this.retrievalLog };
    }
}

module.exports = FlowMetadataRetriever;

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage: node flow-metadata-retriever.js <org-alias> [--all] [--verbose]');
        console.log('');
        console.log('Retrieves flows with automatic Tooling API → Metadata API fallback.');
        console.log('');
        console.log('Options:');
        console.log('  --all       Include inactive flows (default: active only)');
        console.log('  --verbose   Show detailed retrieval progress');
        console.log('');
        console.log('Example:');
        console.log('  node flow-metadata-retriever.js gamma-corp --verbose');
        process.exit(1);
    }

    const orgAlias = args[0];
    const activeOnly = !args.includes('--all');
    const verbose = args.includes('--verbose');

    (async () => {
        try {
            const retriever = new FlowMetadataRetriever(orgAlias, { verbose });
            const flows = await retriever.getAllFlows({ activeOnly });
            const log = retriever.getRetrievalLog();

            console.log(JSON.stringify(flows, null, 2));
            console.log(`\n✓ Retrieved ${flows.length} flows via ${log.method}`);

            if (log.warnings.length > 0) {
                console.log('\nWarnings:');
                log.warnings.forEach(w => console.log(`  ⚠️  ${w}`));
            }

        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    })();
}
