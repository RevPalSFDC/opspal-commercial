#!/usr/bin/env node

/**
 * Layout Metadata Service for Salesforce
 *
 * Provides comprehensive metadata operations for Lightning Pages, Classic Layouts, and Compact Layouts
 * Handles retrieval, analysis, and deployment of layout-related metadata
 *
 * Usage:
 *   const service = new LayoutMetadataService(orgAlias);
 *   await service.init();
 *
 *   // Retrieve Lightning Pages
 *   const flexiPages = await service.getFlexiPages('Opportunity');
 *
 *   // Retrieve Classic Layouts
 *   const layouts = await service.getLayouts('Opportunity');
 *
 *   // Retrieve Compact Layouts
 *   const compactLayouts = await service.getCompactLayouts('Opportunity');
 *
 * @version 1.0.0
 * @created 2025-10-18
 */

const { execSync } = require('child_process');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const xml2js = require('xml2js');
const { ensureSfAuth } = require('./sf-auth-sync');

class LayoutMetadataService {
    /**
     * Initialize Layout Metadata Service
     * @param {string} orgAlias - Salesforce org alias from sf CLI
     * @param {Object} options - Configuration options
     * @param {boolean} options.useCache - Enable caching (default: true)
     * @param {string} options.cacheDir - Custom cache directory
     */
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.useCache = options.useCache !== false;
        this.cacheDir = options.cacheDir || path.join(__dirname, '..', '..', '.metadata-cache', orgAlias, 'layouts');
        this.tempDir = path.join(__dirname, '..', '..', '.temp', 'layout-operations');
        this.parser = new xml2js.Parser();
        this.builder = new xml2js.Builder({
            xmldec: { version: '1.0', encoding: 'UTF-8' },
            renderOpts: { pretty: true, indent: '    ' }
        });
        this.cache = new Map();
    }

    /**
     * Initialize service and create required directories
     */
    async init() {
        await fs.mkdir(this.cacheDir, { recursive: true });
        await fs.mkdir(this.tempDir, { recursive: true });
        await ensureSfAuth({ orgAlias: this.orgAlias, verbose: false, requireAuth: true });
        await this.ensureTempProjectConfig();
        console.log(`✓ Layout Metadata Service initialized for org: ${this.orgAlias}`);
    }

    /**
     * Ensure a minimal Salesforce project config exists for sf CLI metadata retrieval.
     */
    async ensureTempProjectConfig() {
        const projectConfigPath = path.join(this.tempDir, 'sfdx-project.json');
        try {
            await fs.access(projectConfigPath);
            return;
        } catch (error) {
            // fallthrough to create
        }

        const projectConfig = {
            packageDirectories: [{ path: '.', default: true }],
            namespace: '',
            sfdcLoginUrl: 'https://login.salesforce.com',
            sourceApiVersion: '62.0'
        };
        await fs.writeFile(projectConfigPath, JSON.stringify(projectConfig, null, 2));
    }

    /**
     * Validate org connection
     * @returns {Promise<Object>} Org information
     * @throws {Error} If org is not authenticated
     */
    async validateOrgConnection() {
        try {
            const cmd = `sf org display --target-org ${this.orgAlias} --json`;
            const result = JSON.parse(execSync(cmd, { encoding: 'utf8' }));

            if (result.status !== 0 || !result.result) {
                throw new Error(`Org ${this.orgAlias} is not authenticated`);
            }

            return {
                orgId: result.result.id,
                instanceUrl: result.result.instanceUrl,
                username: result.result.username,
                connectedStatus: result.result.connectedStatus
            };
        } catch (error) {
            throw new Error(`Failed to validate org connection: ${error.message}`);
        }
    }

    /**
     * Get all Lightning Record Pages (FlexiPages) for an object
     * @param {string} objectName - Salesforce object API name (e.g., 'Opportunity')
     * @param {Object} options - Retrieval options
     * @param {boolean} options.forceRefresh - Bypass cache
     * @param {boolean} options.includeMetadata - Include full XML metadata
     * @returns {Promise<Array>} Array of FlexiPage definitions
     */
    async getFlexiPages(objectName, options = {}) {
        const cacheKey = `flexipage_${objectName}`;

        // Check cache
        if (this.useCache && !options.forceRefresh && this.cache.has(cacheKey)) {
            console.log(`📦 Using cached FlexiPages for ${objectName}`);
            return this.cache.get(cacheKey);
        }

        console.log(`📥 Retrieving FlexiPages for ${objectName}...`);

        try {
            // Step 1: Query for FlexiPage names
            const flexiPageList = await this.queryFlexiPages(objectName);

            if (flexiPageList.length === 0) {
                console.log(`⚠️  No FlexiPages found for ${objectName}`);
                return [];
            }

            console.log(`   Found ${flexiPageList.length} FlexiPage(s): ${flexiPageList.map(p => p.DeveloperName).join(', ')}`);

            // Step 2: Retrieve metadata for each FlexiPage
            const flexiPagesWithMetadata = [];

            if (options.includeMetadata) {
                for (const page of flexiPageList) {
                    try {
                        const metadata = await this.retrieveFlexiPageMetadata(page.DeveloperName);
                        flexiPagesWithMetadata.push({
                            ...page,
                            metadata: metadata
                        });
                    } catch (error) {
                        console.warn(`   ⚠️  Failed to retrieve metadata for ${page.DeveloperName}: ${error.message}`);
                        flexiPagesWithMetadata.push(page);
                    }
                }
            } else {
                flexiPagesWithMetadata.push(...flexiPageList);
            }

            // Cache results
            this.cache.set(cacheKey, flexiPagesWithMetadata);

            return flexiPagesWithMetadata;

        } catch (error) {
            console.error(`❌ Error retrieving FlexiPages for ${objectName}:`, error.message);
            throw error;
        }
    }

    /**
     * Query for FlexiPage records using Tooling API
     * @private
     */
    async queryFlexiPages(objectName) {
        const query = `SELECT Id, DeveloperName, MasterLabel, Type, EntityDefinitionId
                       FROM FlexiPage
                       WHERE Type = 'RecordPage' AND EntityDefinitionId = '${objectName}'`;

        const cmd = `sf data query --query "${query}" --use-tooling-api --json --target-org ${this.orgAlias}`;

        try {
            const result = JSON.parse(execSync(cmd, {
                encoding: 'utf8',
                maxBuffer: 10 * 1024 * 1024,
                cwd: this.tempDir
            }));

            if (result.status === 0 && result.result && result.result.records) {
                return result.result.records;
            }

            return [];
        } catch (error) {
            throw new Error(`FlexiPage query failed: ${error.message}`);
        }
    }

    /**
     * Retrieve FlexiPage metadata XML
     * @private
     */
    async retrieveFlexiPageMetadata(developerName) {
        const packageXml = this.buildPackageXml('FlexiPage', [developerName]);
        const packagePath = path.join(this.tempDir, `package_${developerName}.xml`);

        await fs.writeFile(packagePath, packageXml);

        const outputDir = path.join(this.tempDir, `retrieve_${developerName}`);

        const cmd = `sf project retrieve start --manifest ${packagePath} --output-dir ${outputDir} --target-org ${this.orgAlias} --json`;

        try {
            const result = JSON.parse(execSync(cmd, {
                encoding: 'utf8',
                maxBuffer: 10 * 1024 * 1024,
                cwd: this.tempDir
            }));

            if (result.status !== 0) {
                throw new Error(result.message || 'Retrieve failed');
            }

            // Read the retrieved XML
            const xmlPathCandidates = [
                path.join(outputDir, 'force-app', 'main', 'default', 'flexipages', `${developerName}.flexipage-meta.xml`),
                path.join(outputDir, 'main', 'default', 'flexipages', `${developerName}.flexipage-meta.xml`),
                path.join(outputDir, 'flexipages', `${developerName}.flexipage-meta.xml`)
            ];
            const xmlPath = xmlPathCandidates.find(candidate => fsSync.existsSync(candidate));
            if (!xmlPath) {
                throw new Error(`FlexiPage metadata not found in retrieve output for ${developerName}`);
            }
            const xmlContent = await fs.readFile(xmlPath, 'utf8');

            // Parse XML to JSON
            const parsed = await this.parser.parseStringPromise(xmlContent);

            // Cleanup
            await this.cleanup(outputDir);
            await this.cleanup(packagePath);

            return {
                xml: xmlContent,
                parsed: parsed
            };

        } catch (error) {
            throw new Error(`Failed to retrieve FlexiPage metadata: ${error.message}`);
        }
    }

    /**
     * Get Classic Layouts for an object
     * @param {string} objectName - Salesforce object API name
     * @param {Object} options - Retrieval options
     * @returns {Promise<Array>} Array of Layout definitions
     */
    async getLayouts(objectName, options = {}) {
        const cacheKey = `layout_${objectName}`;

        if (this.useCache && !options.forceRefresh && this.cache.has(cacheKey)) {
            console.log(`📦 Using cached Layouts for ${objectName}`);
            return this.cache.get(cacheKey);
        }

        console.log(`📥 Retrieving Layouts for ${objectName}...`);

        try {
            // Retrieve all layouts for the object using metadata API
            const packageXml = this.buildPackageXml('Layout', [`${objectName}-*`]);
            const packagePath = path.join(this.tempDir, `package_layout_${objectName}.xml`);

            await fs.writeFile(packagePath, packageXml);

            const outputDir = path.join(this.tempDir, `retrieve_layout_${objectName}`);

            const cmd = `sf project retrieve start --manifest ${packagePath} --output-dir ${outputDir} --target-org ${this.orgAlias} --json`;

            const result = JSON.parse(execSync(cmd, {
                encoding: 'utf8',
                maxBuffer: 10 * 1024 * 1024,
                cwd: this.tempDir
            }));

            if (result.status !== 0) {
                console.log(`⚠️  No Layouts found for ${objectName}`);
                return [];
            }

            // Read all layout XML files
            const layoutsDirCandidates = [
                path.join(outputDir, 'force-app', 'main', 'default', 'layouts'),
                path.join(outputDir, 'main', 'default', 'layouts'),
                path.join(outputDir, 'layouts')
            ];
            const layoutsDir = layoutsDirCandidates.find(candidate => fsSync.existsSync(candidate));

            try {
                if (!layoutsDir) {
                    throw new Error('Layouts directory not found in retrieve output');
                }
                const files = await fs.readdir(layoutsDir);
                const layoutFiles = files.filter(f => f.endsWith('.layout-meta.xml'));

                const layouts = [];

                for (const file of layoutFiles) {
                    const xmlPath = path.join(layoutsDir, file);
                    const xmlContent = await fs.readFile(xmlPath, 'utf8');
                    const parsed = await this.parser.parseStringPromise(xmlContent);

                    layouts.push({
                        name: file.replace('.layout-meta.xml', ''),
                        file: file,
                        xml: xmlContent,
                        parsed: parsed
                    });
                }

                console.log(`   Found ${layouts.length} Layout(s) for ${objectName}`);

                // Cleanup
                await this.cleanup(outputDir);
                await this.cleanup(packagePath);

                this.cache.set(cacheKey, layouts);

                return layouts;

            } catch (error) {
                // Directory doesn't exist - no layouts found
                console.log(`⚠️  No Layouts found for ${objectName}`);
                await this.cleanup(outputDir);
                await this.cleanup(packagePath);
                return [];
            }

        } catch (error) {
            console.warn(`⚠️  Failed to retrieve Layouts for ${objectName}: ${error.message}`);
            this.cache.set(cacheKey, []);
            return [];
        }
    }

    /**
     * Get Compact Layouts for an object
     * @param {string} objectName - Salesforce object API name
     * @param {Object} options - Retrieval options
     * @returns {Promise<Array>} Array of CompactLayout definitions
     */
    async getCompactLayouts(objectName, options = {}) {
        const cacheKey = `compactlayout_${objectName}`;

        if (this.useCache && !options.forceRefresh && this.cache.has(cacheKey)) {
            console.log(`📦 Using cached CompactLayouts for ${objectName}`);
            return this.cache.get(cacheKey);
        }

        console.log(`📥 Retrieving CompactLayouts for ${objectName}...`);

        try {
            // Query for CompactLayouts using Tooling API
            const query = `SELECT Id, DeveloperName, MasterLabel FROM CompactLayout WHERE SobjectType = '${objectName}'`;
            const cmd = `sf data query --query "${query}" --use-tooling-api --json --target-org ${this.orgAlias}`;
            let compactLayoutList = [];
            let queryError = null;

            try {
                const result = JSON.parse(execSync(cmd, {
                    encoding: 'utf8',
                    maxBuffer: 10 * 1024 * 1024,
                    cwd: this.tempDir
                }));

                if (result.status === 0 && result.result && result.result.records) {
                    compactLayoutList = result.result.records.map(record => ({
                        ...record,
                        Label: record.Label || record.MasterLabel || record.DeveloperName
                    }));
                } else if (result.status !== 0) {
                    queryError = new Error(result.message || 'Tooling query failed');
                }
            } catch (error) {
                queryError = error;
            }

            if (queryError) {
                console.warn(`⚠️  CompactLayout query failed for ${objectName}: ${queryError.message}`);
            }

            if (!options.includeMetadata) {
                if (compactLayoutList.length === 0) {
                    console.log(`⚠️  No CompactLayouts found for ${objectName}`);
                } else {
                    console.log(`   Found ${compactLayoutList.length} CompactLayout(s) for ${objectName}`);
                }
                this.cache.set(cacheKey, compactLayoutList);
                return compactLayoutList;
            }

            console.log(`   Found ${compactLayoutList.length} CompactLayout(s) for ${objectName}`);

            // Optionally retrieve full metadata
            const names = compactLayoutList.length > 0
                ? compactLayoutList.map(cl => `${objectName}.${cl.DeveloperName}`)
                : [`${objectName}.*`];
            const packageXml = this.buildPackageXml('CompactLayout', names);
            const packagePath = path.join(this.tempDir, `package_compactlayout_${objectName}.xml`);

            await fs.writeFile(packagePath, packageXml);

            const outputDir = path.join(this.tempDir, `retrieve_compactlayout_${objectName}`);

            try {
                const retrieveCmd = `sf project retrieve start --manifest ${packagePath} --output-dir ${outputDir} --target-org ${this.orgAlias} --json`;
                const retrieveResult = JSON.parse(execSync(retrieveCmd, {
                    encoding: 'utf8',
                    maxBuffer: 10 * 1024 * 1024,
                    cwd: this.tempDir
                }));

                if (retrieveResult.status !== 0) {
                    throw new Error(retrieveResult.message || 'CompactLayout retrieve failed');
                }

                const objectDirCandidates = [
                    path.join(outputDir, 'force-app', 'main', 'default', 'objects', objectName, 'compactLayouts'),
                    path.join(outputDir, 'main', 'default', 'objects', objectName, 'compactLayouts'),
                    path.join(outputDir, 'objects', objectName, 'compactLayouts'),
                    path.join(outputDir, 'force-app', 'main', 'default', 'compactLayouts'),
                    path.join(outputDir, 'main', 'default', 'compactLayouts'),
                    path.join(outputDir, 'compactLayouts')
                ];
                const objectDir = objectDirCandidates.find(candidate => fsSync.existsSync(candidate));

                if (!objectDir) {
                    throw new Error('CompactLayouts directory not found in retrieve output');
                }

                const files = await fs.readdir(objectDir);
                const xmlFiles = files.filter(f => f.endsWith('.compactLayout-meta.xml'));
                const compactLayoutMap = new Map(compactLayoutList.map(layout => [layout.DeveloperName, layout]));

                for (const file of xmlFiles) {
                    const xmlPath = path.join(objectDir, file);
                    const xmlContent = await fs.readFile(xmlPath, 'utf8');
                    const parsed = await this.parser.parseStringPromise(xmlContent);
                    const clDef = parsed.CompactLayout || {};
                    const fullName = Array.isArray(clDef.fullName) ? clDef.fullName[0] : clDef.fullName;
                    const label = (Array.isArray(clDef.label) ? clDef.label[0] : clDef.label)
                        || (Array.isArray(clDef.masterLabel) ? clDef.masterLabel[0] : clDef.masterLabel);
                    const fileBase = path.basename(file, '.compactLayout-meta.xml');
                    const inferredName = fullName || fileBase;
                    const developerName = inferredName.includes('.')
                        ? inferredName.split('.').slice(-1)[0]
                        : (fileBase.startsWith(`${objectName}.`)
                            ? fileBase.slice(objectName.length + 1)
                            : fileBase);

                    const existing = compactLayoutMap.get(developerName);
                    const target = existing || {
                        DeveloperName: developerName,
                        Label: label || developerName
                    };

                    target.Label = target.Label || label || developerName;
                    target.metadata = { xml: xmlContent, parsed };

                    compactLayoutMap.set(developerName, target);
                }

                compactLayoutList = Array.from(compactLayoutMap.values());
            } catch (error) {
                console.warn(`   ⚠️  Could not read CompactLayout metadata files: ${error.message}`);
            } finally {
                await this.cleanup(outputDir);
                await this.cleanup(packagePath);
            }

            this.cache.set(cacheKey, compactLayoutList);

            return compactLayoutList;

        } catch (error) {
            console.warn(`⚠️  Failed to retrieve CompactLayouts for ${objectName}: ${error.message}`);
            this.cache.set(cacheKey, []);
            return [];
        }
    }

    /**
     * Get all layout-related metadata for an object (comprehensive)
     * @param {string} objectName - Salesforce object API name
     * @param {Object} options - Retrieval options
     * @returns {Promise<Object>} All layout metadata (FlexiPages, Layouts, CompactLayouts)
     */
    async getAllLayoutMetadata(objectName, options = {}) {
        console.log(`📥 Retrieving all layout metadata for ${objectName}...`);

        const [flexiPages, layouts, compactLayouts] = await Promise.all([
            this.getFlexiPages(objectName, options),
            this.getLayouts(objectName, options),
            this.getCompactLayouts(objectName, options)
        ]);

        return {
            object: objectName,
            flexiPages: flexiPages,
            layouts: layouts,
            compactLayouts: compactLayouts,
            summary: {
                flexiPageCount: flexiPages.length,
                layoutCount: layouts.length,
                compactLayoutCount: compactLayouts.length,
                totalLayouts: flexiPages.length + layouts.length + compactLayouts.length
            }
        };
    }

    /**
     * Build package.xml for metadata retrieval
     * @private
     */
    buildPackageXml(metadataType, members) {
        const membersXml = members.map(m => `        <members>${m}</members>`).join('\n');

        return `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
${membersXml}
        <name>${metadataType}</name>
    </types>
    <version>62.0</version>
</Package>`;
    }

    /**
     * Clean up temporary files/directories
     * @private
     */
    async cleanup(pathToClean) {
        try {
            const stat = await fs.stat(pathToClean);
            if (stat.isDirectory()) {
                await fs.rm(pathToClean, { recursive: true, force: true });
            } else {
                await fs.unlink(pathToClean);
            }
        } catch (error) {
            // Ignore cleanup errors
        }
    }

    /**
     * Clear all caches
     */
    clearCache() {
        this.cache.clear();
        console.log('✓ Cache cleared');
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys())
        };
    }
}

module.exports = LayoutMetadataService;

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log(`
Usage: node layout-metadata-service.js <org-alias> <object-name> [options]

Options:
  --type flexipage|layout|compactlayout|all  Type of metadata to retrieve (default: all)
  --no-cache                                  Bypass cache
  --include-metadata                          Include full XML metadata

Examples:
  node layout-metadata-service.js my-org Opportunity
  node layout-metadata-service.js my-org Account --type flexipage --include-metadata
  node layout-metadata-service.js my-org Contact --type all --no-cache
        `);
        process.exit(1);
    }

    const orgAlias = args[0];
    const objectName = args[1];
    const type = args.find(a => a.startsWith('--type='))?.split('=')[1] || 'all';
    const useCache = !args.includes('--no-cache');
    const includeMetadata = args.includes('--include-metadata');

    (async () => {
        try {
            const service = new LayoutMetadataService(orgAlias, { useCache });
            await service.init();

            // Validate connection
            const orgInfo = await service.validateOrgConnection();
            console.log(`✓ Connected to: ${orgInfo.username} (${orgInfo.orgId})`);

            let result;

            switch (type) {
                case 'flexipage':
                    result = await service.getFlexiPages(objectName, { includeMetadata });
                    break;
                case 'layout':
                    result = await service.getLayouts(objectName, { includeMetadata });
                    break;
                case 'compactlayout':
                    result = await service.getCompactLayouts(objectName, { includeMetadata });
                    break;
                case 'all':
                default:
                    result = await service.getAllLayoutMetadata(objectName, { includeMetadata });
                    break;
            }

            console.log('\n📊 Results:');
            console.log(JSON.stringify(result, null, 2));

            console.log('\n✓ Complete');

        } catch (error) {
            console.error('❌ Error:', error.message);
            process.exit(1);
        }
    })();
}
