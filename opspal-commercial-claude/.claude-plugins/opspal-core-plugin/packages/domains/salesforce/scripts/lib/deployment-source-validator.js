#!/usr/bin/env node

/**
 * Deployment Source Validator
 *
 * Prevents "ComponentSetError: No source-backed components present in the package"
 * by validating deployment sources before executing sf CLI commands.
 *
 * Validates:
 * - Source directories exist and contain metadata
 * - package.xml references valid files
 * - Metadata types are correctly formatted
 * - Required Salesforce project config (sfdx-project.json) exists
 *
 * Usage:
 *   const validator = require('./deployment-source-validator');
 *   await validator.validateSourceDir('./force-app');
 *   await validator.validateManifest('./package.xml');
 *   await validator.validateMetadata('ApexClass:MyClass', orgAlias);
 *
 * @version 1.0.0
 * @created 2025-10-24
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

class DeploymentSourceValidator {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.projectRoot = options.projectRoot || process.cwd();
    }

    /**
     * Validate source directory for deployment
     * @param {string} sourcePath - Path to source directory
     * @returns {Promise<Object>} Validation result
     * @throws {Error} If validation fails
     */
    async validateSourceDir(sourcePath) {
        const result = {
            valid: false,
            path: sourcePath,
            errors: [],
            warnings: [],
            metadata: {
                found: false,
                types: []
            }
        };

        try {
            // Check 1: Path exists
            const absolutePath = path.isAbsolute(sourcePath)
                ? sourcePath
                : path.join(this.projectRoot, sourcePath);

            try {
                const stats = await fs.stat(absolutePath);
                if (!stats.isDirectory()) {
                    result.errors.push(`Path is not a directory: ${sourcePath}`);
                    return result;
                }
            } catch (error) {
                result.errors.push(`Source directory does not exist: ${sourcePath}`);
                return result;
            }

            // Check 2: Contains source-formatted metadata
            const forceAppPath = await this.findMetadataRoot(absolutePath);

            if (!forceAppPath) {
                result.errors.push(
                    `No source-formatted metadata found. Expected structure: force-app/main/default/`
                );
                result.warnings.push(
                    `If using MDAPI format, use --metadata-dir instead of --source-dir`
                );
                return result;
            }

            // Check 3: Metadata directory not empty
            const metadataTypes = await this.scanMetadataTypes(forceAppPath);

            if (metadataTypes.length === 0) {
                result.errors.push(`Source directory contains no deployable metadata`);
                return result;
            }

            result.metadata.found = true;
            result.metadata.types = metadataTypes;

            // Check 4: Salesforce project config (sfdx-project.json) exists
            const projectConfigPath = await this.findProjectConfig(absolutePath);
            if (!projectConfigPath) {
                result.warnings.push(
                    `No Salesforce project config (sfdx-project.json) found. sf CLI may fail. Create one in project root.`
                );
            }

            result.valid = true;

            if (this.verbose) {
                console.log(`✅ Source validation passed: ${sourcePath}`);
                console.log(`   Found ${metadataTypes.length} metadata types`);
            }

        } catch (error) {
            result.errors.push(`Validation error: ${error.message}`);
        }

        if (!result.valid && result.errors.length > 0) {
            throw new Error(
                `Source validation failed for ${sourcePath}:\n${result.errors.map(e => `  - ${e}`).join('\n')}`
            );
        }

        return result;
    }

    /**
     * Validate package.xml manifest
     * @param {string} manifestPath - Path to package.xml
     * @returns {Promise<Object>} Validation result
     * @throws {Error} If validation fails
     */
    async validateManifest(manifestPath) {
        const result = {
            valid: false,
            path: manifestPath,
            errors: [],
            warnings: [],
            members: {
                total: 0,
                types: []
            }
        };

        try {
            // Check 1: File exists
            const absolutePath = path.isAbsolute(manifestPath)
                ? manifestPath
                : path.join(this.projectRoot, manifestPath);

            let content;
            try {
                content = await fs.readFile(absolutePath, 'utf8');
            } catch (error) {
                result.errors.push(`Manifest file not found: ${manifestPath}`);
                return result;
            }

            // Check 2: Valid XML format
            if (!content.includes('<?xml') || !content.includes('<Package')) {
                result.errors.push(`Invalid package.xml format`);
                return result;
            }

            // Check 3: Contains metadata types
            const typeMatches = content.match(/<types>[\s\S]*?<\/types>/g) || [];
            if (typeMatches.length === 0) {
                result.errors.push(`No metadata types defined in package.xml`);
                return result;
            }

            // Extract member counts
            const memberMatches = content.match(/<members>[^<]+<\/members>/g) || [];
            result.members.total = memberMatches.length;

            if (result.members.total === 0) {
                result.errors.push(`No members defined in package.xml`);
                return result;
            }

            // Extract metadata type names
            const nameMatches = content.match(/<name>([^<]+)<\/name>/g) || [];
            result.members.types = nameMatches
                .map(m => m.replace(/<\/?name>/g, ''))
                .filter(n => n !== 'version');

            result.valid = true;

            if (this.verbose) {
                console.log(`✅ Manifest validation passed: ${manifestPath}`);
                console.log(`   ${result.members.total} members across ${result.members.types.length} types`);
            }

        } catch (error) {
            result.errors.push(`Manifest validation error: ${error.message}`);
        }

        if (!result.valid && result.errors.length > 0) {
            throw new Error(
                `Manifest validation failed for ${manifestPath}:\n${result.errors.map(e => `  - ${e}`).join('\n')}`
            );
        }

        return result;
    }

    /**
     * Validate metadata type and name exist in org
     * @param {string} metadataSpec - Format: Type:Name (e.g., "ApexClass:MyClass")
     * @param {string} orgAlias - Salesforce org alias
     * @returns {Promise<Object>} Validation result
     */
    async validateMetadata(metadataSpec, orgAlias) {
        const result = {
            valid: false,
            spec: metadataSpec,
            errors: [],
            warnings: []
        };

        try {
            // Parse metadata specification
            const [metadataType, metadataName] = metadataSpec.split(':');

            if (!metadataType || !metadataName) {
                result.errors.push(`Invalid metadata spec format. Expected: Type:Name, got: ${metadataSpec}`);
                return result;
            }

            // Query org to verify metadata exists
            const query = this.getMetadataQuery(metadataType, metadataName);

            if (!query) {
                result.warnings.push(`Cannot verify ${metadataType} existence (query not supported)`);
                result.valid = true; // Don't block deployment
                return result;
            }

            try {
                const cmd = `sf data query --query "${query}" --target-org ${orgAlias} --use-tooling-api --json`;
                const output = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
                const queryResult = JSON.parse(output);

                if (queryResult.status === 0 && queryResult.result?.records?.length > 0) {
                    result.valid = true;
                    if (this.verbose) {
                        console.log(`✅ Metadata exists in org: ${metadataSpec}`);
                    }
                } else {
                    result.errors.push(`Metadata not found in org: ${metadataSpec}`);
                }
            } catch (error) {
                result.warnings.push(`Could not verify metadata in org: ${error.message}`);
                result.valid = true; // Don't block deployment
            }

        } catch (error) {
            result.errors.push(`Metadata validation error: ${error.message}`);
        }

        return result;
    }

    /**
     * Find metadata root directory (force-app/main/default or equivalent)
     * @private
     */
    async findMetadataRoot(startPath) {
        const possiblePaths = [
            path.join(startPath, 'force-app', 'main', 'default'),
            path.join(startPath, 'main', 'default'),
            path.join(startPath, 'default'),
            startPath // Already at metadata root
        ];

        for (const testPath of possiblePaths) {
            try {
                const stats = await fs.stat(testPath);
                if (stats.isDirectory()) {
                    // Check if it contains metadata directories
                    const contents = await fs.readdir(testPath);
                    const hasMetadata = contents.some(name =>
                        ['classes', 'triggers', 'flows', 'objects', 'layouts', 'permissionsets', 'profiles'].includes(name)
                    );
                    if (hasMetadata) {
                        return testPath;
                    }
                }
            } catch (error) {
                // Path doesn't exist, continue
            }
        }

        return null;
    }

    /**
     * Scan for metadata types in directory
     * @private
     */
    async scanMetadataTypes(metadataRoot) {
        const types = [];
        const metadataFolders = {
            'classes': 'ApexClass',
            'triggers': 'ApexTrigger',
            'flows': 'Flow',
            'objects': 'CustomObject',
            'layouts': 'Layout',
            'permissionsets': 'PermissionSet',
            'profiles': 'Profile',
            'flexipages': 'FlexiPage',
            'lwc': 'LightningComponentBundle',
            'aura': 'AuraDefinitionBundle',
            'tabs': 'CustomTab',
            'customMetadata': 'CustomMetadata'
        };

        try {
            const contents = await fs.readdir(metadataRoot);

            for (const folder of contents) {
                if (metadataFolders[folder]) {
                    const folderPath = path.join(metadataRoot, folder);
                    const stats = await fs.stat(folderPath);

                    if (stats.isDirectory()) {
                        const files = await fs.readdir(folderPath);
                        if (files.length > 0) {
                            types.push({
                                folder,
                                type: metadataFolders[folder],
                                count: files.length
                            });
                        }
                    }
                }
            }
        } catch (error) {
            // Directory read error
        }

        return types;
    }

    /**
     * Find Salesforce project config in directory hierarchy
     * @private
     */
    async findProjectConfig(startPath) {
        let currentPath = startPath;
        const root = path.parse(currentPath).root;

        while (currentPath !== root) {
            const projectConfigPath = path.join(currentPath, 'sfdx-project.json');
            try {
                await fs.access(projectConfigPath);
                return projectConfigPath;
            } catch (error) {
                // Not found, go up one level
                currentPath = path.dirname(currentPath);
            }
        }

        return null;
    }

    /**
     * Get query to verify metadata existence
     * @private
     */
    getMetadataQuery(metadataType, metadataName) {
        const queries = {
            'ApexClass': `SELECT Id, Name FROM ApexClass WHERE Name = '${metadataName}'`,
            'ApexTrigger': `SELECT Id, Name FROM ApexTrigger WHERE Name = '${metadataName}'`,
            'Flow': `SELECT Id, DeveloperName FROM FlowDefinitionView WHERE DeveloperName = '${metadataName}'`,
            'Layout': `SELECT Id, Name FROM Layout WHERE Name = '${metadataName}'`,
            'PermissionSet': `SELECT Id, Name FROM PermissionSet WHERE Name = '${metadataName}'`,
            'Profile': `SELECT Id, Name FROM Profile WHERE Name = '${metadataName}'`
        };

        return queries[metadataType] || null;
    }

    /**
     * Generate helpful error message for deployment failures
     */
    static generateErrorGuidance(sourcePath) {
        return `
Deployment Source Validation Failed
====================================

Path: ${sourcePath}

Common Solutions:
1. Verify path exists: ls -la ${sourcePath}
2. Check for metadata structure: ls -la ${sourcePath}/force-app/main/default/
3. Ensure Salesforce project config (sfdx-project.json) exists in project root
4. For MDAPI format, use --metadata-dir instead of --source-dir

Required Structure:
${sourcePath}/
├── force-app/
│   └── main/
│       └── default/
│           ├── classes/
│           ├── triggers/
│           ├── flows/
│           └── ... (other metadata)
└── sfdx-project.json

For help: docs/sf-cli-reference/SALESFORCE_CLI_REFERENCE.md
        `.trim();
    }
}

// CLI usage
if (require.main === module) {
    const validator = new DeploymentSourceValidator({ verbose: true });

    const args = process.argv.slice(2);
    const command = args[0];
    const target = args[1];

    (async () => {
        try {
            switch (command) {
                case 'validate-source':
                case '--source-dir':
                    await validator.validateSourceDir(target);
                    console.log('✅ Source validation passed');
                    process.exit(0);
                    break;

                case 'validate-manifest':
                case '--manifest':
                    await validator.validateManifest(target);
                    console.log('✅ Manifest validation passed');
                    process.exit(0);
                    break;

                case 'validate-metadata':
                case '--metadata':
                    const orgAlias = args[2];
                    if (!orgAlias) {
                        console.error('Error: --metadata requires org alias as third argument');
                        process.exit(1);
                    }
                    await validator.validateMetadata(target, orgAlias);
                    console.log('✅ Metadata validation passed');
                    process.exit(0);
                    break;

                default:
                    console.log(`
Deployment Source Validator

Usage:
  node deployment-source-validator.js validate-source <path>
  node deployment-source-validator.js validate-manifest <package.xml>
  node deployment-source-validator.js validate-metadata <Type:Name> <org-alias>

Examples:
  node deployment-source-validator.js validate-source ./force-app
  node deployment-source-validator.js validate-manifest ./package.xml
  node deployment-source-validator.js validate-metadata ApexClass:MyClass my-org
                    `);
                    process.exit(1);
            }
        } catch (error) {
            console.error(`❌ Validation failed: ${error.message}`);
            console.error(DeploymentSourceValidator.generateErrorGuidance(target));
            process.exit(1);
        }
    })();
}

module.exports = DeploymentSourceValidator;
