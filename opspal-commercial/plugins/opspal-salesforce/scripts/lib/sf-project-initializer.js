#!/usr/bin/env node

/**
 * Salesforce Project Initializer
 *
 * Ensures proper Salesforce CLI project structure for any operation
 * Handles temporary projects, metadata retrieval, and project validation
 *
 * Common Issues Solved:
 * - InvalidProjectWorkspaceError: Directory doesn't contain valid Salesforce project
 * - MissingPackageDirectoryError: Package directories don't exist
 * - Project structure inconsistencies
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class SfProjectInitializer {
    constructor(options = {}) {
        this.defaultApiVersion = options.apiVersion || '62.0';
        this.defaultNamespace = options.namespace || '';
        this.enableLogging = options.enableLogging !== false;
    }

    /**
     * Initialize or validate Salesforce project in a directory
     */
    initializeProject(projectPath, projectName = 'TempProject', options = {}) {
        const fullPath = path.resolve(projectPath);

        if (this.enableLogging) {
            console.log(`\n📁 Initializing Salesforce project at: ${fullPath}`);
        }

        // Create directory if it doesn't exist
        if (!fs.existsSync(fullPath)) {
            fs.mkdirSync(fullPath, { recursive: true });
            if (this.enableLogging) {
                console.log('  ✅ Created project directory');
            }
        }

        // Check if valid Salesforce project already exists
        const projectFile = path.join(fullPath, 'sfdx-project.json');
        if (fs.existsSync(projectFile)) {
            if (this.validateProject(fullPath)) {
                if (this.enableLogging) {
                    console.log('  ✅ Valid Salesforce project already exists');
                }
                return fullPath;
            } else {
                if (this.enableLogging) {
                    console.log('  ⚠️ Existing project is invalid, reinitializing...');
                }
            }
        }

        // Create Salesforce CLI project config (sfdx-project.json)
        const projectConfig = this.generateProjectConfig(projectName, options);
        fs.writeFileSync(projectFile, JSON.stringify(projectConfig, null, 2));
        if (this.enableLogging) {
            console.log('  ✅ Created project config');
        }

        // Create package directories
        projectConfig.packageDirectories.forEach(dir => {
            const dirPath = path.join(fullPath, dir.path);
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });

                // Create standard subdirectories for force-app
                if (dir.path === 'force-app' || dir.default) {
                    this.createStandardDirectories(dirPath);
                }
            }
        });

        if (this.enableLogging) {
            console.log('  ✅ Created package directories');
        }

        // Create .forceignore if it doesn't exist
        const forceIgnorePath = path.join(fullPath, '.forceignore');
        if (!fs.existsSync(forceIgnorePath)) {
            fs.writeFileSync(forceIgnorePath, this.getDefaultForceIgnore());
            if (this.enableLogging) {
                console.log('  ✅ Created .forceignore');
            }
        }

        // Create config directory
        const configPath = path.join(fullPath, 'config');
        if (!fs.existsSync(configPath)) {
            fs.mkdirSync(configPath, { recursive: true });

            // Create project-scratch-def.json
            const scratchDefPath = path.join(configPath, 'project-scratch-def.json');
            fs.writeFileSync(scratchDefPath, JSON.stringify(this.getDefaultScratchDef(), null, 2));
        }

        if (this.enableLogging) {
            console.log('  ✅ Salesforce project initialization complete');
        }

        return fullPath;
    }

    /**
     * Generate project configuration
     */
    generateProjectConfig(projectName, options = {}) {
        return {
            packageDirectories: [
                {
                    path: 'force-app',
                    default: true,
                    package: options.packageName,
                    versionName: options.versionName || 'ver 0.1',
                    versionNumber: options.versionNumber || '0.1.0.NEXT'
                }
            ],
            name: projectName,
            namespace: options.namespace || this.defaultNamespace,
            sfdcLoginUrl: options.loginUrl || 'https://login.salesforce.com',
            sourceApiVersion: options.apiVersion || this.defaultApiVersion
        };
    }

    /**
     * Create standard Salesforce metadata directories
     */
    createStandardDirectories(basePath) {
        const mainPath = path.join(basePath, 'main', 'default');

        const standardDirs = [
            'applications',
            'aura',
            'classes',
            'components',
            'contentassets',
            'dashboards',
            'datacategorygroups',
            'duplicateRules',
            'email',
            'flows',
            'groups',
            'homePageComponents',
            'homePageLayouts',
            'labels',
            'layouts',
            'letterhead',
            'lwc',
            'matchingRules',
            'namedCredentials',
            'objects',
            'objectTranslations',
            'pages',
            'pathAssistants',
            'permissionsets',
            'profiles',
            'queues',
            'quickActions',
            'remoteSiteSettings',
            'reports',
            'reportTypes',
            'roles',
            'settings',
            'sharingRules',
            'staticresources',
            'tabs',
            'triggers',
            'weblinks',
            'workflows'
        ];

        standardDirs.forEach(dir => {
            const dirPath = path.join(mainPath, dir);
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }
        });
    }

    /**
     * Validate existing project
     */
    validateProject(projectPath) {
        try {
            const projectFile = path.join(projectPath, 'sfdx-project.json');

            // Check if project file exists
            if (!fs.existsSync(projectFile)) {
                return false;
            }

            // Parse and validate JSON
            const config = JSON.parse(fs.readFileSync(projectFile, 'utf-8'));

            // Check required fields
            if (!config.packageDirectories || !Array.isArray(config.packageDirectories)) {
                return false;
            }

            // Check if package directories exist
            for (const dir of config.packageDirectories) {
                const dirPath = path.join(projectPath, dir.path);
                if (!fs.existsSync(dirPath)) {
                    return false;
                }
            }

            return true;

        } catch (error) {
            if (this.enableLogging) {
                console.error('  ❌ Project validation failed:', error.message);
            }
            return false;
        }
    }

    /**
     * Get default .forceignore content
     */
    getDefaultForceIgnore() {
        return `# List files or directories below to ignore them when running source operations

package.xml

# LWC configuration files
**/jsconfig.json
**/.eslintrc.json

# LWC Jest
**/__tests__/**

# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Dependency directories
node_modules/

# Salesforce cache
.sf/
.localdevserver/
deploy-options.json

# Editor directories and files
.idea
.vscode
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

# MacOS specific files
.DS_Store`;
    }

    /**
     * Get default scratch org definition
     */
    getDefaultScratchDef() {
        return {
            orgName: 'Demo Company',
            edition: 'Developer',
            features: ['EnableSetPasswordInApi'],
            settings: {
                lightningExperienceSettings: {
                    enableS1DesktopEnabled: true
                },
                mobileSettings: {
                    enableS1EncryptedStoragePref2: false
                }
            }
        };
    }

    /**
     * Create a temporary project for metadata operations
     */
    createTempProject(operation = 'metadata-operation') {
        const timestamp = Date.now();
        const tempDir = path.join('/tmp', `sf-temp-${operation}-${timestamp}`);

        return this.initializeProject(tempDir, `Temp-${operation}`, {
            packageName: `temp_${operation}`,
            versionName: 'Temporary',
            versionNumber: '0.0.0.NEXT'
        });
    }

    /**
     * Ensure project context for CLI commands
     */
    ensureProjectContext(targetPath = null) {
        // If no target path, use current directory
        const projectPath = targetPath || process.cwd();

        // Check if we're in a valid Salesforce project
        if (this.validateProject(projectPath)) {
            return projectPath;
        }

        // Check parent directories (up to 5 levels)
        let currentPath = projectPath;
        for (let i = 0; i < 5; i++) {
            const parentPath = path.dirname(currentPath);
            if (parentPath === currentPath) break; // Reached root

            if (this.validateProject(parentPath)) {
                if (this.enableLogging) {
                    console.log(`  📍 Found Salesforce project in parent: ${parentPath}`);
                }
                return parentPath;
            }
            currentPath = parentPath;
        }

        // No valid project found, initialize in current directory
        if (this.enableLogging) {
            console.log('  ⚠️ No Salesforce project found, initializing...');
        }

        return this.initializeProject(projectPath, path.basename(projectPath));
    }

    /**
     * Fix common project issues
     */
    fixProjectIssues(projectPath) {
        const issues = [];
        const fixes = [];

        try {
            const projectFile = path.join(projectPath, 'sfdx-project.json');
            const config = JSON.parse(fs.readFileSync(projectFile, 'utf-8'));

            // Fix missing directories
            config.packageDirectories.forEach(dir => {
                const dirPath = path.join(projectPath, dir.path);
                if (!fs.existsSync(dirPath)) {
                    fs.mkdirSync(dirPath, { recursive: true });
                    this.createStandardDirectories(dirPath);
                    fixes.push(`Created missing directory: ${dir.path}`);
                }
            });

            // Fix missing API version
            if (!config.sourceApiVersion) {
                config.sourceApiVersion = this.defaultApiVersion;
                fs.writeFileSync(projectFile, JSON.stringify(config, null, 2));
                fixes.push(`Added missing API version: ${this.defaultApiVersion}`);
            }

            // Fix missing .forceignore
            const forceIgnorePath = path.join(projectPath, '.forceignore');
            if (!fs.existsSync(forceIgnorePath)) {
                fs.writeFileSync(forceIgnorePath, this.getDefaultForceIgnore());
                fixes.push('Created missing .forceignore file');
            }

            if (this.enableLogging && fixes.length > 0) {
                console.log('\n🔧 Fixed project issues:');
                fixes.forEach(fix => console.log(`  ✅ ${fix}`));
            }

            return { success: true, fixes, issues };

        } catch (error) {
            issues.push(`Failed to fix project: ${error.message}`);
            return { success: false, fixes, issues };
        }
    }

    /**
     * Clean up temporary projects
     */
    cleanupTempProjects(olderThanHours = 24) {
        const tempDir = '/tmp';
        const cutoffTime = Date.now() - (olderThanHours * 3600000);
        let cleaned = 0;

        try {
            const files = fs.readdirSync(tempDir);

            files.forEach(file => {
                if (file.startsWith('sf-temp-')) {
                    const fullPath = path.join(tempDir, file);
                    const stats = fs.statSync(fullPath);

                    if (stats.isDirectory() && stats.mtimeMs < cutoffTime) {
                        fs.rmSync(fullPath, { recursive: true, force: true });
                        cleaned++;
                    }
                }
            });

            if (this.enableLogging && cleaned > 0) {
                console.log(`🧹 Cleaned up ${cleaned} old temporary Salesforce projects`);
            }

        } catch (error) {
            console.error('Failed to cleanup temp projects:', error.message);
        }

        return cleaned;
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log(`
Salesforce Project Initializer

Usage: node sf-project-initializer.js <command> [options]

Commands:
  init <path>         Initialize Salesforce project at path
  validate <path>     Validate existing project
  fix <path>          Fix common project issues
  temp <operation>    Create temporary project
  cleanup             Clean up old temp projects

Examples:
  node sf-project-initializer.js init /tmp/my-project
  node sf-project-initializer.js validate .
  node sf-project-initializer.js fix /tmp/broken-project
  node sf-project-initializer.js temp dashboard-migration
  node sf-project-initializer.js cleanup
        `);
        process.exit(0);
    }

    const initializer = new SfProjectInitializer();
    const command = args[0];

    switch (command) {
        case 'init':
            const initPath = args[1] || '.';
            const projectPath = initializer.initializeProject(initPath);
            console.log(`✅ Project initialized at: ${projectPath}`);
            break;

        case 'validate':
            const validatePath = args[1] || '.';
            const isValid = initializer.validateProject(path.resolve(validatePath));
            console.log(`Project at ${validatePath}: ${isValid ? '✅ Valid' : '❌ Invalid'}`);
            process.exit(isValid ? 0 : 1);
            break;

        case 'fix':
            const fixPath = args[1] || '.';
            const result = initializer.fixProjectIssues(path.resolve(fixPath));
            process.exit(result.success ? 0 : 1);
            break;

        case 'temp':
            const operation = args[1] || 'temp-operation';
            const tempPath = initializer.createTempProject(operation);
            console.log(`✅ Temporary project created at: ${tempPath}`);
            break;

        case 'cleanup':
            const hours = parseInt(args[1]) || 24;
            const cleaned = initializer.cleanupTempProjects(hours);
            console.log(`✅ Cleaned up ${cleaned} projects older than ${hours} hours`);
            break;

        default:
            console.error(`❌ Unknown command: ${command}`);
            process.exit(1);
    }
}

module.exports = SfProjectInitializer;
