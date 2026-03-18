#!/usr/bin/env node

/**
 * Path Helper Library
 * Instance-agnostic path resolution for Salesforce projects
 *
 * Features:
 * - Resolves project directories in instance structure
 * - Creates standard directory layouts
 * - Handles relative vs absolute paths
 * - Ensures consistent path resolution across execution contexts
 * - Prevents path doubling issues
 *
 * Usage:
 *   const { PathHelper } = require('./scripts/lib/path-helper');
 *
 *   // Initialize for project
 *   const paths = new PathHelper({ instanceAlias: 'myorg', projectName: 'my-project' });
 *
 *   // Get standard paths
 *   const dataFile = paths.data('accounts.csv');
 *   const script = paths.scripts('01-query.js');
 *   const report = paths.reports('SUMMARY.md');
 */

const path = require('path');
const fs = require('fs');

class PathHelper {
    constructor(options = {}) {
        this.instanceAlias = options.instanceAlias || null;
        this.projectName = options.projectName || null;
        this.baseDir = options.baseDir || process.cwd();

        // Standard directory names
        this.STANDARD_DIRS = {
            data: 'data',
            scripts: 'scripts',
            reports: 'reports',
            backups: 'backups',
            queries: 'queries',
            docs: 'docs'
        };

        // Determine project root
        this.projectRoot = this._resolveProjectRoot();
    }

    /**
     * Resolve project root directory
     * @returns {string} - Absolute path to project root
     */
    _resolveProjectRoot() {
        // If already in a project directory, use current working directory
        if (this._isProjectDirectory(this.baseDir)) {
            return this.baseDir;
        }

        // If instance and project specified, construct path
        if (this.instanceAlias && this.projectName) {
            return path.join(
                this.baseDir,
                'instances',
                this.instanceAlias,
                this.projectName
            );
        }

        // Default to current working directory
        return this.baseDir;
    }

    /**
     * Check if directory is a project directory
     * @param {string} dir - Directory to check
     * @returns {boolean}
     */
    _isProjectDirectory(dir) {
        // A project directory contains at least one standard subdirectory
        return Object.values(this.STANDARD_DIRS).some(subdir =>
            fs.existsSync(path.join(dir, subdir))
        );
    }

    /**
     * Ensure directory exists (create if needed)
     * @param {string} dirPath - Directory path
     */
    _ensureDir(dirPath) {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }

    /**
     * Get absolute path, handling both relative and absolute inputs
     * @param {string} inputPath - Input path (relative or absolute)
     * @param {string} base - Base directory for relative paths
     * @returns {string} - Absolute path
     */
    resolve(inputPath, base = null) {
        // If already absolute, return as-is
        if (path.isAbsolute(inputPath)) {
            return inputPath;
        }

        // Resolve relative to base (or project root)
        const baseDir = base || this.projectRoot;
        return path.resolve(baseDir, inputPath);
    }

    /**
     * Get path to data directory or file
     * @param {string} filename - Optional filename
     * @param {boolean} create - Create directory if not exists
     * @returns {string} - Path to data directory or file
     */
    data(filename = null, create = true) {
        const dataDir = path.join(this.projectRoot, this.STANDARD_DIRS.data);

        if (create) {
            this._ensureDir(dataDir);
        }

        return filename ? path.join(dataDir, filename) : dataDir;
    }

    /**
     * Get path to scripts directory or file
     * @param {string} filename - Optional filename
     * @param {boolean} create - Create directory if not exists
     * @returns {string} - Path to scripts directory or file
     */
    scripts(filename = null, create = true) {
        const scriptsDir = path.join(this.projectRoot, this.STANDARD_DIRS.scripts);

        if (create) {
            this._ensureDir(scriptsDir);
        }

        return filename ? path.join(scriptsDir, filename) : scriptsDir;
    }

    /**
     * Get path to reports directory or file
     * @param {string} filename - Optional filename
     * @param {boolean} create - Create directory if not exists
     * @returns {string} - Path to reports directory or file
     */
    reports(filename = null, create = true) {
        const reportsDir = path.join(this.projectRoot, this.STANDARD_DIRS.reports);

        if (create) {
            this._ensureDir(reportsDir);
        }

        return filename ? path.join(reportsDir, filename) : reportsDir;
    }

    /**
     * Get path to backups directory or file
     * @param {string} filename - Optional filename
     * @param {boolean} create - Create directory if not exists
     * @returns {string} - Path to backups directory or file
     */
    backups(filename = null, create = true) {
        const backupsDir = path.join(this.projectRoot, this.STANDARD_DIRS.backups);

        if (create) {
            this._ensureDir(backupsDir);
        }

        return filename ? path.join(backupsDir, filename) : backupsDir;
    }

    /**
     * Get path to queries directory or file
     * @param {string} filename - Optional filename
     * @param {boolean} create - Create directory if not exists
     * @returns {string} - Path to queries directory or file
     */
    queries(filename = null, create = true) {
        const queriesDir = path.join(this.projectRoot, this.STANDARD_DIRS.queries);

        if (create) {
            this._ensureDir(queriesDir);
        }

        return filename ? path.join(queriesDir, filename) : queriesDir;
    }

    /**
     * Get path to docs directory or file
     * @param {string} filename - Optional filename
     * @param {boolean} create - Create directory if not exists
     * @returns {string} - Path to docs directory or file
     */
    docs(filename = null, create = true) {
        const docsDir = path.join(this.projectRoot, this.STANDARD_DIRS.docs);

        if (create) {
            this._ensureDir(docsDir);
        }

        return filename ? path.join(docsDir, filename) : docsDir;
    }

    /**
     * Get path to instance directory
     * @param {string} instanceAlias - Instance alias (optional, uses this.instanceAlias if not provided)
     * @returns {string} - Path to instance directory
     */
    instanceDir(instanceAlias = null) {
        const alias = instanceAlias || this.instanceAlias;

        if (!alias) {
            throw new Error('Instance alias required');
        }

        // Find SFDC root (go up from baseDir until we find instances/)
        let current = this.baseDir;
        let instancesRoot = null;

        while (current !== path.dirname(current)) {
            const instancesPath = path.join(current, 'instances');
            if (fs.existsSync(instancesPath)) {
                instancesRoot = instancesPath;
                break;
            }
            current = path.dirname(current);
        }

        if (!instancesRoot) {
            throw new Error('Could not find instances directory');
        }

        return path.join(instancesRoot, alias);
    }

    /**
     * Get path to instance's bulk-operations directory
     * @param {string} instanceAlias - Instance alias
     * @returns {string} - Path to bulk-operations directory
     */
    instanceBulkOperations(instanceAlias = null) {
        const instancePath = this.instanceDir(instanceAlias);
        const bulkOpsDir = path.join(instancePath, 'bulk-operations');

        this._ensureDir(bulkOpsDir);
        return bulkOpsDir;
    }

    /**
     * Create complete project structure
     * @returns {Object} - Paths to all created directories
     */
    initializeProjectStructure() {
        const dirs = {
            root: this.projectRoot,
            data: this.data(),
            scripts: this.scripts(),
            reports: this.reports(),
            backups: this.backups(),
            queries: this.queries(),
            docs: this.docs()
        };

        return dirs;
    }

    /**
     * Get timestamped filename
     * @param {string} basename - Base filename (without extension)
     * @param {string} extension - File extension (with or without dot)
     * @param {Date} timestamp - Optional timestamp (default: now)
     * @returns {string} - Timestamped filename
     */
    timestampedFilename(basename, extension, timestamp = null) {
        const ts = timestamp || new Date();
        const dateStr = ts.toISOString().replace(/:/g, '-').replace(/\..+/, '');

        // Ensure extension has dot
        const ext = extension.startsWith('.') ? extension : `.${extension}`;

        return `${basename}-${dateStr}${ext}`;
    }

    /**
     * Find bulk operation result files
     * @param {string} jobId - Bulk job ID (e.g., 750xxx)
     * @param {string} instanceAlias - Instance alias
     * @returns {Object} - { success, failed, unprocessed } file paths
     */
    findBulkOperationFiles(jobId, instanceAlias = null) {
        const bulkOpsDir = this.instanceBulkOperations(instanceAlias);

        const patterns = {
            success: `${jobId}-success-records.csv`,
            failed: `${jobId}-failed-records.csv`,
            unprocessed: `${jobId}-unprocessed-records.csv`
        };

        const files = {};

        Object.entries(patterns).forEach(([type, filename]) => {
            const filepath = path.join(bulkOpsDir, filename);
            files[type] = fs.existsSync(filepath) ? filepath : null;
        });

        return files;
    }

    /**
     * Move bulk operation files to project backups
     * @param {string} jobId - Bulk job ID
     * @param {string} instanceAlias - Instance alias
     * @returns {Object} - Moved file paths
     */
    archiveBulkOperationFiles(jobId, instanceAlias = null) {
        const sourceFiles = this.findBulkOperationFiles(jobId, instanceAlias);
        const backupsDir = this.backups();
        const moved = {};

        Object.entries(sourceFiles).forEach(([type, sourcePath]) => {
            if (sourcePath && fs.existsSync(sourcePath)) {
                const filename = path.basename(sourcePath);
                const destPath = path.join(backupsDir, filename);

                fs.copyFileSync(sourcePath, destPath);
                moved[type] = destPath;
            }
        });

        return moved;
    }

    /**
     * Get relative path from project root
     * @param {string} absolutePath - Absolute path
     * @returns {string} - Relative path from project root
     */
    relative(absolutePath) {
        return path.relative(this.projectRoot, absolutePath);
    }

    /**
     * Get project info
     * @returns {Object} - Project information
     */
    getProjectInfo() {
        return {
            projectRoot: this.projectRoot,
            projectName: this.projectName,
            instanceAlias: this.instanceAlias,
            baseDir: this.baseDir,
            exists: fs.existsSync(this.projectRoot),
            directories: Object.keys(this.STANDARD_DIRS).reduce((acc, key) => {
                const dir = path.join(this.projectRoot, this.STANDARD_DIRS[key]);
                acc[key] = {
                    path: dir,
                    exists: fs.existsSync(dir)
                };
                return acc;
            }, {})
        };
    }

    /**
     * Validate project structure
     * @returns {Object} - Validation results
     */
    validateProjectStructure() {
        const info = this.getProjectInfo();
        const issues = [];
        const warnings = [];

        // Check if project root exists
        if (!info.exists) {
            issues.push(`Project root does not exist: ${info.projectRoot}`);
        }

        // Check for missing standard directories
        Object.entries(info.directories).forEach(([name, dir]) => {
            if (!dir.exists) {
                warnings.push(`Standard directory missing: ${name} (${dir.path})`);
            }
        });

        return {
            valid: issues.length === 0,
            issues,
            warnings,
            info
        };
    }
}

/**
 * Utility function to create PathHelper from current execution context
 * @returns {PathHelper}
 */
function createPathHelperFromContext() {
    const cwd = process.cwd();

    // Try to detect instance and project from current path
    const parts = cwd.split(path.sep);
    const instancesIndex = parts.indexOf('instances');

    if (instancesIndex !== -1 && parts.length > instancesIndex + 2) {
        const instanceAlias = parts[instancesIndex + 1];
        const projectName = parts[instancesIndex + 2];

        return new PathHelper({
            instanceAlias,
            projectName,
            baseDir: cwd
        });
    }

    // Fall back to simple PathHelper using cwd
    return new PathHelper({ baseDir: cwd });
}

// Export for CommonJS
module.exports = { PathHelper, createPathHelperFromContext };

// CLI Usage
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage: path-helper.js <command> [options]');
        console.log('\nCommands:');
        console.log('  info                      - Show project path information');
        console.log('  init <instance> <project> - Initialize project structure');
        console.log('  validate                  - Validate project structure');
        console.log('  find-bulk <job-id> <instance> - Find bulk operation files');
        console.log('\nExamples:');
        console.log('  path-helper.js info');
        console.log('  path-helper.js init myorg my-project');
        console.log('  path-helper.js validate');
        console.log('  path-helper.js find-bulk 750xxx myorg');
        process.exit(1);
    }

    const command = args[0];

    try {
        switch (command) {
            case 'info': {
                const paths = createPathHelperFromContext();
                const info = paths.getProjectInfo();

                console.log('\n=== Project Information ===\n');
                console.log(`Project Root: ${info.projectRoot}`);
                console.log(`Project Name: ${info.projectName || 'N/A'}`);
                console.log(`Instance: ${info.instanceAlias || 'N/A'}`);
                console.log(`Exists: ${info.exists ? '✓' : '✗'}`);
                console.log('\nDirectories:');

                Object.entries(info.directories).forEach(([name, dir]) => {
                    const status = dir.exists ? '✓' : '✗';
                    console.log(`  ${status} ${name}: ${dir.path}`);
                });

                break;
            }

            case 'init': {
                const [instanceAlias, projectName] = args.slice(1);

                if (!instanceAlias || !projectName) {
                    console.error('Error: init requires <instance> <project>');
                    process.exit(1);
                }

                const paths = new PathHelper({ instanceAlias, projectName });
                const dirs = paths.initializeProjectStructure();

                console.log('\n=== Project Structure Initialized ===\n');
                Object.entries(dirs).forEach(([name, dir]) => {
                    console.log(`✓ ${name}: ${dir}`);
                });

                break;
            }

            case 'validate': {
                const paths = createPathHelperFromContext();
                const validation = paths.validateProjectStructure();

                console.log('\n=== Project Structure Validation ===\n');
                console.log(`Status: ${validation.valid ? '✓ Valid' : '✗ Issues Found'}`);

                if (validation.issues.length > 0) {
                    console.log('\nIssues:');
                    validation.issues.forEach(issue => console.log(`  ✗ ${issue}`));
                }

                if (validation.warnings.length > 0) {
                    console.log('\nWarnings:');
                    validation.warnings.forEach(warning => console.log(`  ⚠ ${warning}`));
                }

                break;
            }

            case 'find-bulk': {
                const [jobId, instanceAlias] = args.slice(1);

                if (!jobId || !instanceAlias) {
                    console.error('Error: find-bulk requires <job-id> <instance>');
                    process.exit(1);
                }

                const paths = new PathHelper({ instanceAlias });
                const files = paths.findBulkOperationFiles(jobId, instanceAlias);

                console.log('\n=== Bulk Operation Files ===\n');
                console.log(`Job ID: ${jobId}`);

                Object.entries(files).forEach(([type, filepath]) => {
                    if (filepath) {
                        console.log(`  ✓ ${type}: ${filepath}`);
                    } else {
                        console.log(`  ✗ ${type}: Not found`);
                    }
                });

                break;
            }

            default:
                console.error(`Error: Unknown command: ${command}`);
                process.exit(1);
        }
    } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
    }
}
