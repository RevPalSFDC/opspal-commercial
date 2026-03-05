#!/usr/bin/env node

/**
 * Project Structure Validator Module
 * Add to any script to enforce project organization requirements
 *
 * Usage:
 * const { requireProjectStructure } = require('./lib/require-project-structure');
 * requireProjectStructure(); // Will exit if not in project directory
 */

const fs = require('fs');
const path = require('path');

// Colors for terminal output
const colors = {
    RED: '\x1b[31m',
    GREEN: '\x1b[32m',
    YELLOW: '\x1b[33m',
    BLUE: '\x1b[34m',
    BOLD: '\x1b[1m',
    RESET: '\x1b[0m'
};

/**
 * Check if current directory is a project directory
 */
function isProjectDirectory() {
    return fs.existsSync('config/project.json');
}

/**
 * Get project information
 */
function getProjectInfo() {
    try {
        if (fs.existsSync('config/project.json')) {
            const config = JSON.parse(fs.readFileSync('config/project.json', 'utf8'));
            return config;
        }
    } catch (error) {
        // Silent fail - will be handled by caller
    }
    return null;
}

/**
 * Display error message and instructions
 */
function displayProjectRequired() {
    console.error(`
${colors.RED}╔════════════════════════════════════════════════════════════╗
║         ⚠️  PROJECT STRUCTURE REQUIRED ⚠️                    ║
╚════════════════════════════════════════════════════════════╝${colors.RESET}

${colors.YELLOW}This operation requires a proper project structure to:${colors.RESET}
  • Organize files systematically
  • Track progress with TodoWrite
  • Prevent scattered files in root directory
  • Maintain consistent naming conventions

${colors.GREEN}To fix this, run:${colors.RESET}
  ${colors.BLUE}./scripts/init-project.sh "project-name" "org-alias" --type [type]${colors.RESET}

${colors.YELLOW}Available project types:${colors.RESET}
  • data-cleanup    - For data cleanup operations
  • deployment      - For metadata deployments
  • analysis        - For data analysis projects
  • report-creation - For report/dashboard creation

${colors.YELLOW}Example:${colors.RESET}
  ${colors.BLUE}./scripts/init-project.sh "contact-update" "production" --type data-cleanup${colors.RESET}

${colors.YELLOW}After creating the project:${colors.RESET}
  1. cd into the project directory
  2. Run this script again from within the project
  3. Use TodoWrite to track your progress

${colors.RED}This requirement prevents the organizational issues that
occurred during the delta-corp contact cleanup project.${colors.RESET}
`);
}

/**
 * Main validation function
 * @param {Object} options - Configuration options
 * @param {boolean} options.silent - Don't display error messages
 * @param {boolean} options.allowBypass - Allow bypass with environment variable
 * @returns {boolean} - True if in project directory, false otherwise
 */
function requireProjectStructure(options = {}) {
    const { silent = false, allowBypass = false } = options;

    // Check for bypass flag (use sparingly!)
    if (allowBypass && process.env.SKIP_PROJECT_CHECK === '1') {
        if (!silent) {
            console.warn(`${colors.YELLOW}⚠️  Project structure check bypassed (NOT RECOMMENDED)${colors.RESET}`);
        }
        return true;
    }

    // Check if in project directory
    if (isProjectDirectory()) {
        const projectInfo = getProjectInfo();
        if (projectInfo && !silent) {
            console.log(`${colors.GREEN}✓ Project structure detected: ${projectInfo.projectName}${colors.RESET}`);
        }
        return true;
    }

    // Not in project directory
    if (!silent) {
        displayProjectRequired();
    }

    // Exit the process
    process.exit(1);
}

/**
 * Validate file naming convention
 * @param {string} filePath - Path to file to validate
 * @param {string} type - Type of file (script, data, report)
 * @returns {Object} - Validation result
 */
function validateFileName(filePath, type) {
    const fileName = path.basename(filePath);
    const patterns = {
        script: /^\d{2}-[a-z-]+\.(js|sh)$/,
        data: /^[a-z-]+-\d{4}-\d{2}-\d{2}-[a-z]+\.(json|csv|xml)$/,
        report: /^[A-Z]+_[A-Z_]+_\d{4}-\d{2}-\d{2}\.md$/
    };

    const pattern = patterns[type];
    if (!pattern) {
        return { valid: false, error: 'Unknown file type' };
    }

    if (!pattern.test(fileName)) {
        return {
            valid: false,
            error: `File name doesn't match ${type} convention`,
            expected: getExpectedPattern(type),
            actual: fileName
        };
    }

    return { valid: true };
}

/**
 * Get expected pattern description
 */
function getExpectedPattern(type) {
    const patterns = {
        script: '{number}-{action}-{target}.js',
        data: '{content}-{date}-{status}.{ext}',
        report: '{TYPE}_{SUBJECT}_{DATE}.md'
    };
    return patterns[type] || 'Unknown pattern';
}

/**
 * Create a properly named file path
 * @param {string} action - Action being performed
 * @param {string} target - Target of the action
 * @param {string} type - Type of file (script, data, report)
 * @returns {string} - Properly formatted file path
 */
function createFileName(action, target, type = 'script') {
    const date = new Date().toISOString().split('T')[0];

    switch (type) {
        case 'script':
            // Find next available number
            const scriptsDir = 'scripts';
            let number = 1;
            if (fs.existsSync(scriptsDir)) {
                const files = fs.readdirSync(scriptsDir);
                const numbers = files
                    .map(f => parseInt(f.split('-')[0]))
                    .filter(n => !isNaN(n));
                if (numbers.length > 0) {
                    number = Math.max(...numbers) + 1;
                }
            }
            return `${String(number).padStart(2, '0')}-${action}-${target}.js`;

        case 'data':
            return `${target}-${date}-${action}.csv`;

        case 'report':
            return `${action.toUpperCase()}_${target.toUpperCase()}_${date}.md`;

        default:
            throw new Error(`Unknown file type: ${type}`);
    }
}

/**
 * Ensure directory exists in project structure
 * @param {string} directory - Directory to ensure exists
 */
function ensureProjectDirectory(directory) {
    if (!isProjectDirectory()) {
        throw new Error('Not in a project directory');
    }

    const fullPath = path.join(process.cwd(), directory);
    if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
        console.log(`${colors.GREEN}Created directory: ${directory}${colors.RESET}`);
    }
}

// Export for use in other scripts
module.exports = {
    requireProjectStructure,
    isProjectDirectory,
    getProjectInfo,
    validateFileName,
    createFileName,
    ensureProjectDirectory,
    colors
};

// If run directly, validate current directory
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args[0] === '--check') {
        // Just check, don't exit
        const inProject = isProjectDirectory();
        if (inProject) {
            const info = getProjectInfo();
            console.log(`${colors.GREEN}✓ In project: ${info.projectName}${colors.RESET}`);
            process.exit(0);
        } else {
            console.log(`${colors.RED}✗ Not in a project directory${colors.RESET}`);
            process.exit(1);
        }
    } else {
        // Normal validation
        requireProjectStructure();
    }
}