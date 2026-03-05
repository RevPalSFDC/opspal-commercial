#!/usr/bin/env node

/**
 * Deployment Wrapper Example - Shows how to integrate source validation
 *
 * This example demonstrates best practices for wrapping sf CLI deployment
 * commands with pre-flight validation using deployment-source-validator.js
 *
 * Key Features:
 * - Validates source directory before deployment
 * - Validates package.xml if used
 * - Validates metadata exists in org
 * - Provides clear error messages
 * - Supports dry-run mode
 *
 * Usage:
 *   node deployment-wrapper-example.js deploy --source-dir ./force-app --org my-org
 *   node deployment-wrapper-example.js validate-only --source-dir ./force-app --org my-org
 *   node deployment-wrapper-example.js deploy --manifest ./package.xml --org my-org
 *
 * @example
 * // Basic deployment with validation
 * const deployer = new DeploymentWrapper('my-org');
 * await deployer.deploy({ sourceDir: './force-app' });
 *
 * @example
 * // Validate without deploying
 * const deployer = new DeploymentWrapper('my-org');
 * await deployer.validateOnly({ sourceDir: './force-app' });
 *
 * @version 1.0.0
 * @created 2025-10-24
 */

const { execSync } = require('child_process');
const path = require('path');

// Import the deployment source validator
const DeploymentSourceValidator = require('./deployment-source-validator');

class DeploymentWrapper {
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.verbose = options.verbose !== false; // Default to verbose
        this.dryRun = options.dryRun || false;
        this.validator = new DeploymentSourceValidator({
            verbose: this.verbose,
            projectRoot: process.cwd()
        });
    }

    /**
     * Deploy metadata with pre-flight validation
     * @param {Object} options - Deployment options
     * @param {string} options.sourceDir - Source directory path
     * @param {string} options.manifest - Package.xml path (alternative to sourceDir)
     * @param {string} options.metadata - Metadata spec (Type:Name)
     * @param {number} options.wait - Wait time in minutes (default: 10)
     * @param {boolean} options.testLevel - Test level (NoTestRun, RunLocalTests, etc)
     * @returns {Promise<Object>} Deployment result
     */
    async deploy(options = {}) {
        const {
            sourceDir,
            manifest,
            metadata,
            wait = 10,
            testLevel = 'NoTestRun'
        } = options;

        try {
            // Phase 1: Pre-flight validation
            console.log('📋 Phase 1: Pre-flight Validation\n');

            if (sourceDir) {
                await this.validator.validateSourceDir(sourceDir);
                console.log('');
            } else if (manifest) {
                await this.validator.validateManifest(manifest);
                console.log('');
            } else if (metadata) {
                const result = await this.validator.validateMetadata(metadata, this.orgAlias);
                if (!result.valid && result.errors.length > 0) {
                    throw new Error(`Metadata validation failed: ${result.errors.join(', ')}`);
                }
                console.log('');
            } else {
                throw new Error('Must specify one of: sourceDir, manifest, or metadata');
            }

            // Phase 2: Build deployment command
            console.log('🚀 Phase 2: Building Deployment Command\n');

            let deployCmd = 'sf project deploy start';

            if (sourceDir) {
                deployCmd += ` --source-dir "${sourceDir}"`;
            } else if (manifest) {
                deployCmd += ` --manifest "${manifest}"`;
            } else if (metadata) {
                deployCmd += ` --metadata "${metadata}"`;
            }

            deployCmd += ` --target-org ${this.orgAlias}`;
            deployCmd += ` --wait ${wait}`;
            deployCmd += ` --test-level ${testLevel}`;
            deployCmd += ' --json';

            if (this.verbose) {
                console.log(`Command: ${deployCmd}\n`);
            }

            // Phase 3: Execute deployment
            if (this.dryRun) {
                console.log('🔍 DRY RUN MODE: Would execute deployment\n');
                return {
                    success: true,
                    dryRun: true,
                    command: deployCmd
                };
            }

            console.log('⏳ Phase 3: Executing Deployment\n');
            console.log('This may take several minutes...\n');

            const output = execSync(deployCmd, {
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'pipe']
            });

            const result = JSON.parse(output);

            // Phase 4: Report results
            console.log('📊 Phase 4: Deployment Results\n');

            if (result.status === 0) {
                console.log('✅ Deployment succeeded!\n');
                console.log(`Deploy ID: ${result.result?.id || 'N/A'}`);
                console.log(`Status: ${result.result?.status || 'N/A'}`);

                if (result.result?.deployedSource) {
                    console.log(`\nDeployed Components: ${result.result.deployedSource.length}`);
                }
            } else {
                console.error('❌ Deployment failed!\n');
                console.error(`Error: ${result.message || 'Unknown error'}`);

                if (result.result?.failures) {
                    console.error('\nFailures:');
                    result.result.failures.forEach((failure, idx) => {
                        console.error(`  ${idx + 1}. ${failure.fileName}: ${failure.problem}`);
                    });
                }

                throw new Error('Deployment failed');
            }

            return result;

        } catch (error) {
            console.error('\n❌ Deployment Error:');
            console.error(error.message);
            console.error('');

            // Provide helpful guidance
            if (error.message.includes('No source-backed components')) {
                console.error('💡 Tip: Run deployment source validator to diagnose:');
                console.error(`   node scripts/lib/deployment-source-validator.js validate-source ${sourceDir || manifest}`);
            } else if (error.message.includes('INVALID_FIELD')) {
                console.error('💡 Tip: Check SOQL queries with query linter:');
                console.error('   node scripts/qa/query-lint.js');
            }

            throw error;
        }
    }

    /**
     * Validate deployment without executing
     * Equivalent to --check-only flag
     */
    async validateOnly(options = {}) {
        console.log('🔍 Validation Mode - No deployment will occur\n');

        const {
            sourceDir,
            manifest,
            metadata
        } = options;

        // Run pre-flight validation
        if (sourceDir) {
            await this.validator.validateSourceDir(sourceDir);
        } else if (manifest) {
            await this.validator.validateManifest(manifest);
        } else if (metadata) {
            await this.validator.validateMetadata(metadata, this.orgAlias);
        } else {
            throw new Error('Must specify one of: sourceDir, manifest, or metadata');
        }

        // Run --check-only deployment
        let checkCmd = 'sf project deploy start --check-only';

        if (sourceDir) {
            checkCmd += ` --source-dir "${sourceDir}"`;
        } else if (manifest) {
            checkCmd += ` --manifest "${manifest}"`;
        } else if (metadata) {
            checkCmd += ` --metadata "${metadata}"`;
        }

        checkCmd += ` --target-org ${this.orgAlias}`;
        checkCmd += ' --json';

        console.log('\n⏳ Running validation deployment (--check-only)...\n');

        const output = execSync(checkCmd, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe']
        });

        const result = JSON.parse(output);

        if (result.status === 0) {
            console.log('✅ Validation passed - deployment would succeed\n');
        } else {
            console.error('❌ Validation failed - deployment would fail\n');
            throw new Error(result.message);
        }

        return result;
    }

    /**
     * Quick deploy from recent validation
     * @param {string} deployId - Validation deploy ID
     */
    async quickDeploy(deployId) {
        console.log(`🚀 Quick deploying validated deployment: ${deployId}\n`);

        const quickDeployCmd = `sf project deploy quick --job-id ${deployId} --target-org ${this.orgAlias} --json`;

        const output = execSync(quickDeployCmd, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe']
        });

        const result = JSON.parse(output);

        if (result.status === 0) {
            console.log('✅ Quick deploy succeeded!\n');
        } else {
            console.error('❌ Quick deploy failed\n');
            throw new Error(result.message);
        }

        return result;
    }
}

// ============================================================================
// CLI Interface
// ============================================================================

if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        console.log(`
Deployment Wrapper with Pre-Flight Validation

Usage:
  node deployment-wrapper-example.js <command> [options]

Commands:
  deploy              Deploy metadata with validation
  validate-only       Validate without deploying
  quick-deploy        Quick deploy from validation

Options:
  --source-dir <path>     Source directory to deploy
  --manifest <path>       Package.xml to deploy
  --metadata <spec>       Metadata type:name to deploy
  --org <alias>           Target org alias (required)
  --wait <minutes>        Wait time (default: 10)
  --test-level <level>    Test level (default: NoTestRun)
  --dry-run               Show what would be deployed without deploying
  --quiet                 Suppress verbose output

Examples:
  # Deploy source directory
  node deployment-wrapper-example.js deploy --source-dir ./force-app --org my-org

  # Validate without deploying
  node deployment-wrapper-example.js validate-only --source-dir ./force-app --org my-org

  # Deploy from package.xml
  node deployment-wrapper-example.js deploy --manifest ./package.xml --org my-org

  # Deploy specific metadata
  node deployment-wrapper-example.js deploy --metadata ApexClass:MyClass --org my-org

  # Dry run
  node deployment-wrapper-example.js deploy --source-dir ./force-app --org my-org --dry-run

  # Quick deploy after validation
  node deployment-wrapper-example.js quick-deploy --job-id 0Af... --org my-org
        `);
        process.exit(0);
    }

    // Parse command
    const command = args[0];
    const argMap = {};

    for (let i = 1; i < args.length; i += 2) {
        const key = args[i].replace('--', '');
        const value = args[i + 1];
        argMap[key] = value;
    }

    const orgAlias = argMap['org'];
    if (!orgAlias) {
        console.error('Error: --org is required');
        process.exit(1);
    }

    const deployer = new DeploymentWrapper(orgAlias, {
        verbose: !argMap['quiet'],
        dryRun: args.includes('--dry-run')
    });

    (async () => {
        try {
            switch (command) {
                case 'deploy':
                    await deployer.deploy({
                        sourceDir: argMap['source-dir'],
                        manifest: argMap['manifest'],
                        metadata: argMap['metadata'],
                        wait: parseInt(argMap['wait']) || 10,
                        testLevel: argMap['test-level'] || 'NoTestRun'
                    });
                    break;

                case 'validate-only':
                    await deployer.validateOnly({
                        sourceDir: argMap['source-dir'],
                        manifest: argMap['manifest'],
                        metadata: argMap['metadata']
                    });
                    break;

                case 'quick-deploy':
                    if (!argMap['job-id']) {
                        console.error('Error: --job-id is required for quick-deploy');
                        process.exit(1);
                    }
                    await deployer.quickDeploy(argMap['job-id']);
                    break;

                default:
                    console.error(`Unknown command: ${command}`);
                    console.error('Use --help for usage information');
                    process.exit(1);
            }

            process.exit(0);

        } catch (error) {
            console.error('\n💥 Deployment wrapper failed');
            console.error(error.message);
            process.exit(1);
        }
    })();
}

module.exports = DeploymentWrapper;
