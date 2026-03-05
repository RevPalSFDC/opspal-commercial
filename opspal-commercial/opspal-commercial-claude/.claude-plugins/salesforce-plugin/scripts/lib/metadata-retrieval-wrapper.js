#!/usr/bin/env node

/**
 * Metadata Retrieval Wrapper
 *
 * Robust wrapper for Salesforce metadata retrieval operations
 * Handles project initialization, error recovery, and common issues
 *
 * Features:
 * - Automatic project setup for retrieval
 * - Error handling and retry logic
 * - Support for various metadata types
 * - Dashboard migration support
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const SfProjectInitializer = require('./sf-project-initializer');

function getPlaybookVersion(playbookPath) {
    try {
        const repoRoot = path.resolve(__dirname, '..', '..');
        const output = execSync(`git -C "${repoRoot}" log -1 --pretty=format:%h -- "${playbookPath}"`, {
            stdio: ['ignore', 'pipe', 'ignore'],
        }).toString().trim();
        return output || 'untracked';
    } catch (error) {
        return 'unknown';
    }
}

function logPlaybookUsage(playbookPath) {
    const version = getPlaybookVersion(playbookPath);
    console.log(`📘 Playbook: ${playbookPath} (version: ${version})`);
}

class MetadataRetrievalWrapper {
    constructor(targetOrg, options = {}) {
        this.targetOrg = targetOrg;
        this.projectInitializer = new SfProjectInitializer(options);
        this.maxRetries = options.maxRetries || 3;
        this.enableLogging = options.enableLogging !== false;
        this.tempProjectRoot = options.tempProjectRoot || '/tmp';
        this.orgDescriptor = null;
    }

    /**
     * Retrieve metadata with automatic project setup
     */
    async retrieveMetadata(metadataType, metadataName, options = {}) {
        const startTime = Date.now();
        console.log(`\n📥 Retrieving ${metadataType}:${metadataName} from ${this.targetOrg}`);
        if (this.enableLogging && !options.suppressPlaybookLog) {
            logPlaybookUsage('docs/playbooks/metadata-retrieval.md');
        }

        // Determine output directory
        const outputDir = options.outputDir || this.getDefaultOutputDir(metadataType, metadataName);

        // Ensure we have a valid Salesforce project
        const projectPath = await this.ensureProjectForRetrieval(outputDir);

        // Build metadata specification
        const metadataSpec = this.buildMetadataSpec(metadataType, metadataName);

        // Attempt retrieval with retries
        let lastError = null;
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                if (attempt > 1) {
                    console.log(`  🔄 Retry attempt ${attempt}/${this.maxRetries}...`);
                }

                const result = await this.executeRetrieval(metadataSpec, projectPath, options);

                // Persist source descriptor for downstream validation
                this.writeSourceDescriptor(projectPath, metadataSpec);

                const duration = Date.now() - startTime;
                console.log(`  ✅ Retrieval successful (${duration}ms)`);

                return {
                    success: true,
                    projectPath: projectPath,
                    metadataPath: this.getMetadataPath(projectPath, metadataType, metadataName),
                    metadata: result,
                    duration: duration
                };

            } catch (error) {
                lastError = error;
                console.error(`  ❌ Attempt ${attempt} failed: ${error.message}`);

                // Try to fix common issues before retry
                if (attempt < this.maxRetries) {
                    await this.handleRetrievalError(error, projectPath);
                }
            }
        }

        // All retries failed
        throw new Error(`Failed to retrieve metadata after ${this.maxRetries} attempts: ${lastError.message}`);
    }

    /**
     * Ensure valid Salesforce project for retrieval
     */
    async ensureProjectForRetrieval(outputDir) {
        // If outputDir exists and is a valid project, use it
        if (fs.existsSync(outputDir)) {
            if (this.projectInitializer.validateProject(outputDir)) {
                console.log(`  📁 Using existing project at: ${outputDir}`);
                return outputDir;
            }

            // Try to fix existing project
            const fixResult = this.projectInitializer.fixProjectIssues(outputDir);
            if (fixResult.success) {
                console.log(`  🔧 Fixed existing project issues`);
                return outputDir;
            }
        }

        // Initialize new project
        console.log(`  📁 Initializing Salesforce project at: ${outputDir}`);
        return this.projectInitializer.initializeProject(outputDir, 'MetadataRetrieval', {
            apiVersion: '62.0'
        });
    }

    /**
     * Build metadata specification for retrieval
     */
    buildMetadataSpec(metadataType, metadataName) {
        // Handle special cases
        const specialCases = {
            'Dashboard': (name) => {
                // Dashboards might be in folders
                if (name.includes('/')) {
                    return `Dashboard:${name}`;
                }
                return `Dashboard:${name}`;
            },
            'Report': (name) => {
                // Reports might be in folders
                if (name.includes('/')) {
                    return `Report:${name}`;
                }
                return `Report:${name}`;
            },
            'EmailTemplate': (name) => {
                // Email templates are always in folders
                if (!name.includes('/')) {
                    return `EmailTemplate:*/${name}`;
                }
                return `EmailTemplate:${name}`;
            },
            'Document': (name) => {
                // Documents are in folders
                if (!name.includes('/')) {
                    return `Document:*/${name}`;
                }
                return `Document:${name}`;
            }
        };

        if (specialCases[metadataType]) {
            return specialCases[metadataType](metadataName);
        }

        // Default format
        return `${metadataType}:${metadataName}`;
    }

    /**
     * Execute metadata retrieval
     */
    async executeRetrieval(metadataSpec, projectPath, options = {}) {
        // Change to project directory for execution
        const originalDir = process.cwd();
        process.chdir(projectPath);

        try {
            // Build command
            let command = `sf project retrieve start`;
            command += ` --metadata "${metadataSpec}"`;
            command += ` --target-org ${this.targetOrg}`;

            // Add optional parameters
            if (options.wait !== false) {
                command += ` --wait ${options.wait || 10}`;
            }

            if (options.zipFile) {
                command += ` --zip-file-name "${options.zipFile}"`;
            }

            if (options.unzip !== false && !options.zipFile) {
                // Default behavior - retrieve and unzip
            }

            console.log(`  🚀 Executing: ${command.replace(this.targetOrg, '***')}`);

            // Execute retrieval
            const result = execSync(command, {
                encoding: 'utf-8',
                maxBuffer: 50 * 1024 * 1024 // 50MB buffer for large retrievals
            });

            // Parse result
            const retrievedFiles = this.parseRetrievalResult(result);

            return {
                success: true,
                files: retrievedFiles,
                output: result
            };

        } finally {
            // Restore original directory
            process.chdir(originalDir);
        }
    }

    /**
     * Retrieve org descriptor from Salesforce CLI
     */
    getOrgDescriptor() {
        if (this.orgDescriptor) {
            return this.orgDescriptor;
        }

        try {
            const output = execSync(`sf org display --target-org ${this.targetOrg} --json`, { encoding: 'utf8' });
            const parsed = JSON.parse(output);
            if (parsed.status !== 0) {
                this.orgDescriptor = { alias: this.targetOrg, error: parsed.message || 'Unable to read org info' };
                return this.orgDescriptor;
            }
            const result = parsed.result || {};
            this.orgDescriptor = {
                alias: result.alias || this.targetOrg,
                username: result.username || null,
                orgId: result.id || null,
                instanceUrl: result.instanceUrl || null
            };
            return this.orgDescriptor;
        } catch (error) {
            this.orgDescriptor = { alias: this.targetOrg, error: error.message };
            return this.orgDescriptor;
        }
    }

    /**
     * Write retrieval descriptor to project directory
     */
    writeSourceDescriptor(projectPath, metadataSpec) {
        try {
            const descriptor = this.getOrgDescriptor();
            if (!descriptor || descriptor.error) {
                return;
            }

            const descriptorPath = path.join(projectPath, '.sfdc-metadata-source.json');
            let existing = { version: 1, retrievals: [] };

            if (fs.existsSync(descriptorPath)) {
                try {
                    const content = fs.readFileSync(descriptorPath, 'utf8');
                    const parsed = JSON.parse(content);
                    existing = {
                        version: parsed.version || 1,
                        retrievals: Array.isArray(parsed.retrievals) ? parsed.retrievals : []
                    };
                } catch (_) {
                    existing = { version: 1, retrievals: [] };
                }
            }

            existing.retrievals.unshift({
                metadata: metadataSpec,
                org: descriptor,
                retrievedAt: new Date().toISOString()
            });

            existing.retrievals = existing.retrievals.slice(0, 20);

            fs.writeFileSync(descriptorPath, JSON.stringify(existing, null, 2));
        } catch (_) {
            // Descriptor writing is best-effort; ignore failures
        }
    }

    /**
     * Parse retrieval result to extract file information
     */
    parseRetrievalResult(output) {
        const files = [];

        // Look for file paths in output
        const lines = output.split('\n');
        lines.forEach(line => {
            // Match file paths (common patterns)
            const filePatterns = [
                /Retrieved Source.*?:\s+(.+)/,
                /Component.*?:\s+(.+)/,
                /File.*?:\s+(.+)/,
                /force-app.*?\/.+/
            ];

            for (const pattern of filePatterns) {
                const match = line.match(pattern);
                if (match) {
                    files.push(match[1] || match[0]);
                    break;
                }
            }
        });

        return files;
    }

    /**
     * Handle common retrieval errors
     */
    async handleRetrievalError(error, projectPath) {
        const errorMessage = error.message || error.toString();

        // Missing package directory
        if (errorMessage.includes('MissingPackageDirectoryError')) {
            console.log('  🔧 Fixing missing package directory...');
            const config = JSON.parse(fs.readFileSync(path.join(projectPath, 'sfdx-project.json'), 'utf-8'));

            config.packageDirectories.forEach(dir => {
                const dirPath = path.join(projectPath, dir.path);
                if (!fs.existsSync(dirPath)) {
                    fs.mkdirSync(dirPath, { recursive: true });
                }
            });
        }

        // Invalid project workspace
        if (errorMessage.includes('InvalidProjectWorkspaceError')) {
            console.log('  🔧 Reinitializing project...');
            this.projectInitializer.fixProjectIssues(projectPath);
        }

        // API version mismatch
        if (errorMessage.includes('API version')) {
            console.log('  🔧 Updating API version...');
            const configPath = path.join(projectPath, 'sfdx-project.json');
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            config.sourceApiVersion = '62.0';
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        }

        // Wait for a moment before retry
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    /**
     * Get default output directory for metadata type
     */
    getDefaultOutputDir(metadataType, metadataName) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        const safeName = metadataName.replace(/[^a-zA-Z0-9-_]/g, '_');

        return path.join(
            this.tempProjectRoot,
            `${metadataType.toLowerCase()}-${safeName}-${timestamp}`
        );
    }

    /**
     * Get path to retrieved metadata
     */
    getMetadataPath(projectPath, metadataType, metadataName) {
        // Map metadata types to directory structures
        const typeMapping = {
            'Dashboard': 'dashboards',
            'Report': 'reports',
            'Flow': 'flows',
            'ApexClass': 'classes',
            'ApexTrigger': 'triggers',
            'LightningComponentBundle': 'lwc',
            'AuraDefinitionBundle': 'aura',
            'CustomObject': 'objects',
            'Layout': 'layouts',
            'Profile': 'profiles',
            'PermissionSet': 'permissionsets',
            'EmailTemplate': 'email',
            'StaticResource': 'staticresources'
        };

        const metadataDir = typeMapping[metadataType] || metadataType.toLowerCase();

        return path.join(
            projectPath,
            'force-app',
            'main',
            'default',
            metadataDir
        );
    }

    /**
     * Retrieve dashboard with folder structure
     */
    async retrieveDashboard(dashboardId, options = {}) {
        console.log(`\n📊 Retrieving dashboard: ${dashboardId}`);

        // First, get dashboard metadata to understand structure
        const dashboardResult = await this.retrieveMetadata('Dashboard', dashboardId, options);

        // Check if dashboard has dependencies (reports, components)
        const dashboardPath = dashboardResult.metadataPath;
        const dependencies = await this.analyzeDashboardDependencies(dashboardPath, dashboardId);

        if (dependencies.reports.length > 0) {
            console.log(`\n📈 Retrieving ${dependencies.reports.length} dependent reports...`);

            for (const reportId of dependencies.reports) {
                try {
                    await this.retrieveMetadata('Report', reportId, {
                        outputDir: dashboardResult.projectPath
                    });
                } catch (error) {
                    console.warn(`  ⚠️ Could not retrieve report ${reportId}: ${error.message}`);
                }
            }
        }

        return {
            ...dashboardResult,
            dependencies: dependencies
        };
    }

    /**
     * Analyze dashboard dependencies
     */
    async analyzeDashboardDependencies(dashboardPath, dashboardId) {
        const dependencies = {
            reports: [],
            components: [],
            filters: []
        };

        try {
            // Find dashboard file
            const dashboardFile = this.findDashboardFile(dashboardPath, dashboardId);

            if (dashboardFile) {
                const content = fs.readFileSync(dashboardFile, 'utf-8');

                // Extract report IDs (common patterns in dashboard XML)
                const reportPattern = /<report>([^<]+)<\/report>/g;
                let match;
                while ((match = reportPattern.exec(content)) !== null) {
                    if (!dependencies.reports.includes(match[1])) {
                        dependencies.reports.push(match[1]);
                    }
                }

                // Extract component names
                const componentPattern = /<componentType>([^<]+)<\/componentType>/g;
                while ((match = componentPattern.exec(content)) !== null) {
                    if (!dependencies.components.includes(match[1])) {
                        dependencies.components.push(match[1]);
                    }
                }
            }

        } catch (error) {
            console.warn(`  ⚠️ Could not analyze dependencies: ${error.message}`);
        }

        return dependencies;
    }

    /**
     * Find dashboard file in directory
     */
    findDashboardFile(dashboardPath, dashboardId) {
        if (!fs.existsSync(dashboardPath)) {
            return null;
        }

        // Look for dashboard file
        const files = fs.readdirSync(dashboardPath, { recursive: true });

        for (const file of files) {
            if (file.endsWith('.dashboard-meta.xml') || file.endsWith('.dashboard')) {
                const fullPath = path.join(dashboardPath, file);
                const content = fs.readFileSync(fullPath, 'utf-8');

                // Check if this is the right dashboard
                if (content.includes(dashboardId) || file.includes(dashboardId)) {
                    return fullPath;
                }
            }
        }

        return null;
    }

    /**
     * Bulk retrieve multiple metadata components
     */
    async bulkRetrieve(metadataList, options = {}) {
        console.log(`\n📦 Bulk retrieving ${metadataList.length} components...`);

        const results = {
            successful: [],
            failed: [],
            projectPath: null
        };

        // Create single project for all retrievals
        const projectPath = await this.ensureProjectForRetrieval(
            options.outputDir || path.join(this.tempProjectRoot, `bulk-retrieve-${Date.now()}`)
        );
        results.projectPath = projectPath;

        // Process each metadata component
        for (const metadata of metadataList) {
            try {
                const result = await this.retrieveMetadata(
                    metadata.type,
                    metadata.name,
                    { ...options, outputDir: projectPath }
                );
                results.successful.push({
                    ...metadata,
                    result: result
                });
            } catch (error) {
                results.failed.push({
                    ...metadata,
                    error: error.message
                });
            }
        }

        console.log(`\n✅ Bulk retrieval complete:`);
        console.log(`  Successful: ${results.successful.length}`);
        console.log(`  Failed: ${results.failed.length}`);

        return results;
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 3) {
        console.log(`
Metadata Retrieval Wrapper

Usage: node metadata-retrieval-wrapper.js <org> <type> <name> [options]

Arguments:
  org     Target org alias
  type    Metadata type (Dashboard, Report, Flow, ApexClass, etc.)
  name    Metadata name or ID

Options:
  --output-dir <path>    Output directory (default: auto-generated in /tmp)
  --wait <seconds>       Wait time for retrieval (default: 10)
  --max-retries <n>      Maximum retry attempts (default: 3)

Examples:
  # Retrieve a dashboard
  node metadata-retrieval-wrapper.js myorg Dashboard "Sales_Dashboard"

  # Retrieve with folder
  node metadata-retrieval-wrapper.js myorg Dashboard "FolderName/Dashboard_Name"

  # Retrieve to specific directory
  node metadata-retrieval-wrapper.js myorg Report "MyReport" --output-dir ./reports

  # Retrieve dashboard with dependencies
  node metadata-retrieval-wrapper.js myorg Dashboard "CA/vIVoiiDIlxadRDUgnHSRFyvPrFrdyH"
        `);
        process.exit(1);
    }

    const [org, type, name] = args;
    const options = {};

    // Parse options
    for (let i = 3; i < args.length; i += 2) {
        const key = args[i].replace('--', '');
        const value = args[i + 1];
        options[key.replace(/-/g, '_')] = value;
    }

    const wrapper = new MetadataRetrievalWrapper(org, options);

    // Special handling for dashboards
    const promise = type.toLowerCase() === 'dashboard'
        ? wrapper.retrieveDashboard(name, options)
        : wrapper.retrieveMetadata(type, name, options);

    promise
        .then(result => {
            console.log('\n✨ Retrieval successful!');
            console.log(`  Project: ${result.projectPath}`);
            console.log(`  Metadata: ${result.metadataPath}`);

            if (result.dependencies) {
                console.log(`  Dependencies:`);
                console.log(`    Reports: ${result.dependencies.reports.length}`);
                console.log(`    Components: ${result.dependencies.components.length}`);
            }
        })
        .catch(error => {
            console.error('\n❌ Retrieval failed:', error.message);
            process.exit(1);
        });
}

module.exports = MetadataRetrievalWrapper;
