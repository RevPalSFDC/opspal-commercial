#!/usr/bin/env node

/**
 * PDF Capability Checker
 *
 * Pre-flight check for PDF generation capabilities. Run this BEFORE attempting
 * PDF generation to know what will work and what fallbacks will be used.
 *
 * Problem Solved (Reflection Cohort: PDF Generation & Mermaid Diagrams):
 *   Agents were attempting PDF generation without knowing what tools were
 *   available, leading to failures or unexpected fallbacks. This utility
 *   provides upfront capability detection.
 *
 * Capabilities Checked:
 *   - PDF generation (md-to-pdf, puppeteer, pandoc)
 *   - Mermaid rendering (mmdc, puppeteer)
 *   - Image processing (sharp, imagemagick)
 *   - Template processing (ejs, handlebars)
 *
 * Usage:
 *   const { checkCapabilities, canGeneratePDF } = require('./pdf-capability-checker');
 *
 *   // Quick check
 *   if (await canGeneratePDF()) {
 *     // Proceed with PDF generation
 *   }
 *
 *   // Full capability report
 *   const caps = await checkCapabilities();
 *   console.log(caps.summary);
 *
 * @module pdf-capability-checker
 * @version 1.0.0
 * @created 2025-11-27
 * @source Reflection Cohort - PDF Generation & Mermaid Diagrams
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// =============================================================================
// Capability Definitions
// =============================================================================

const CAPABILITIES = {
    // PDF Generation Methods
    pdfGeneration: {
        'md-to-pdf': {
            type: 'npm',
            check: 'md-to-pdf',
            description: 'Markdown to PDF converter (recommended)',
            installCmd: 'npm install md-to-pdf'
        },
        'puppeteer': {
            type: 'npm',
            check: 'puppeteer',
            description: 'Headless Chrome for PDF generation',
            installCmd: 'npm install puppeteer'
        },
        'pandoc': {
            type: 'cli',
            check: 'pandoc --version',
            description: 'Universal document converter',
            installCmd: 'brew install pandoc  # or apt-get install pandoc'
        },
        'wkhtmltopdf': {
            type: 'cli',
            check: 'wkhtmltopdf --version',
            description: 'HTML to PDF converter',
            installCmd: 'brew install wkhtmltopdf  # or apt-get install wkhtmltopdf'
        }
    },

    // Mermaid Rendering Methods
    mermaidRendering: {
        'mmdc': {
            type: 'cli',
            check: 'mmdc --version',
            description: 'Mermaid CLI (best quality)',
            installCmd: 'npm install -g @mermaid-js/mermaid-cli'
        },
        'puppeteer': {
            type: 'npm',
            check: 'puppeteer',
            description: 'Puppeteer-based rendering',
            installCmd: 'npm install puppeteer'
        }
    },

    // Image Processing
    imageProcessing: {
        'sharp': {
            type: 'npm',
            check: 'sharp',
            description: 'High-performance image processing',
            installCmd: 'npm install sharp'
        },
        'imagemagick': {
            type: 'cli',
            check: 'convert --version',
            description: 'ImageMagick for image manipulation',
            installCmd: 'brew install imagemagick  # or apt-get install imagemagick'
        }
    },

    // Template Processing
    templateProcessing: {
        'ejs': {
            type: 'npm',
            check: 'ejs',
            description: 'Embedded JavaScript templates',
            installCmd: 'npm install ejs'
        },
        'handlebars': {
            type: 'npm',
            check: 'handlebars',
            description: 'Handlebars templates',
            installCmd: 'npm install handlebars'
        }
    }
};

// =============================================================================
// Capability Checking Functions
// =============================================================================

/**
 * Check if an npm package is available
 * @param {string} packageName - Package to check
 * @returns {Promise<boolean>} True if available
 */
async function checkNpmPackage(packageName) {
    try {
        require.resolve(packageName);
        return true;
    } catch {
        return false;
    }
}

/**
 * Check if a CLI command is available
 * @param {string} command - Command to check
 * @returns {Promise<boolean>} True if available
 */
async function checkCliCommand(command) {
    try {
        await execAsync(command, { timeout: 5000 });
        return true;
    } catch {
        return false;
    }
}

/**
 * Check a single capability
 * @param {Object} capability - Capability definition
 * @returns {Promise<boolean>} True if available
 */
async function checkSingleCapability(capability) {
    if (capability.type === 'npm') {
        return await checkNpmPackage(capability.check);
    } else if (capability.type === 'cli') {
        return await checkCliCommand(capability.check);
    }
    return false;
}

/**
 * Check all capabilities in a category
 * @param {Object} category - Category of capabilities
 * @returns {Promise<Object>} Results for each capability
 */
async function checkCategory(category) {
    const results = {};
    for (const [name, capability] of Object.entries(category)) {
        results[name] = {
            available: await checkSingleCapability(capability),
            description: capability.description,
            installCmd: capability.installCmd
        };
    }
    return results;
}

/**
 * Check all PDF generation capabilities
 * @returns {Promise<Object>} Full capability report
 */
async function checkCapabilities() {
    const results = {
        timestamp: new Date().toISOString(),
        categories: {},
        summary: null,
        recommendations: []
    };

    // Check all categories
    for (const [categoryName, category] of Object.entries(CAPABILITIES)) {
        results.categories[categoryName] = await checkCategory(category);
    }

    // Determine best available options
    const pdfMethods = results.categories.pdfGeneration;
    const mermaidMethods = results.categories.mermaidRendering;

    // Find best PDF method
    let bestPdfMethod = null;
    for (const [name, result] of Object.entries(pdfMethods)) {
        if (result.available) {
            bestPdfMethod = name;
            break;
        }
    }

    // Find best Mermaid method
    let bestMermaidMethod = null;
    for (const [name, result] of Object.entries(mermaidMethods)) {
        if (result.available) {
            bestMermaidMethod = name;
            break;
        }
    }

    // Build summary
    results.summary = {
        canGeneratePDF: bestPdfMethod !== null,
        canRenderMermaid: bestMermaidMethod !== null,
        bestPdfMethod: bestPdfMethod || 'none',
        bestMermaidMethod: bestMermaidMethod || 'placeholder',
        score: calculateScore(results.categories)
    };

    // Generate recommendations
    if (!bestPdfMethod) {
        results.recommendations.push({
            priority: 'high',
            message: 'No PDF generation tool available',
            action: 'Install md-to-pdf: npm install md-to-pdf'
        });
    }

    if (!bestMermaidMethod) {
        results.recommendations.push({
            priority: 'medium',
            message: 'No Mermaid rendering tool available (will use placeholders)',
            action: 'Install mmdc: npm install -g @mermaid-js/mermaid-cli'
        });
    }

    return results;
}

/**
 * Calculate capability score (0-100)
 * @param {Object} categories - Checked categories
 * @returns {number} Score
 */
function calculateScore(categories) {
    let available = 0;
    let total = 0;

    for (const category of Object.values(categories)) {
        for (const result of Object.values(category)) {
            total++;
            if (result.available) available++;
        }
    }

    return total > 0 ? Math.round((available / total) * 100) : 0;
}

/**
 * Quick check: Can we generate PDFs?
 * @returns {Promise<boolean>} True if PDF generation is possible
 */
async function canGeneratePDF() {
    const methods = CAPABILITIES.pdfGeneration;
    for (const capability of Object.values(methods)) {
        if (await checkSingleCapability(capability)) {
            return true;
        }
    }
    return false;
}

/**
 * Quick check: Can we render Mermaid diagrams?
 * @returns {Promise<boolean>} True if Mermaid rendering is possible (not just placeholder)
 */
async function canRenderMermaid() {
    const methods = CAPABILITIES.mermaidRendering;
    for (const capability of Object.values(methods)) {
        if (await checkSingleCapability(capability)) {
            return true;
        }
    }
    return false;
}

/**
 * Get installation instructions for missing capabilities
 * @returns {Promise<string[]>} Array of installation commands
 */
async function getMissingInstallCommands() {
    const commands = [];
    const caps = await checkCapabilities();

    for (const category of Object.values(caps.categories)) {
        for (const [name, result] of Object.entries(category)) {
            if (!result.available) {
                commands.push(`# ${name}: ${result.description}`);
                commands.push(result.installCmd);
                commands.push('');
            }
        }
    }

    return commands;
}

/**
 * Run pre-flight check and return formatted report
 * @param {Object} options - Options
 * @param {boolean} options.verbose - Include full details
 * @param {boolean} options.json - Return JSON instead of formatted string
 * @returns {Promise<string|Object>} Formatted report or JSON
 */
async function runPreflightCheck(options = {}) {
    const caps = await checkCapabilities();

    if (options.json) {
        return caps;
    }

    // Format human-readable report
    let report = '';
    report += '╔══════════════════════════════════════════════════════════════╗\n';
    report += '║           PDF Generation Capability Check                     ║\n';
    report += '╚══════════════════════════════════════════════════════════════╝\n\n';

    report += `Score: ${caps.summary.score}%\n\n`;

    // Summary
    report += '📋 Summary:\n';
    report += `   PDF Generation: ${caps.summary.canGeneratePDF ? '✅ Available' : '❌ Not available'}\n`;
    report += `   Best PDF Method: ${caps.summary.bestPdfMethod}\n`;
    report += `   Mermaid Rendering: ${caps.summary.canRenderMermaid ? '✅ Available' : '⚠️ Placeholders only'}\n`;
    report += `   Best Mermaid Method: ${caps.summary.bestMermaidMethod}\n\n`;

    // Detailed breakdown (if verbose)
    if (options.verbose) {
        for (const [categoryName, category] of Object.entries(caps.categories)) {
            const label = categoryName.replace(/([A-Z])/g, ' $1').trim();
            report += `📦 ${label}:\n`;

            for (const [name, result] of Object.entries(category)) {
                const status = result.available ? '✅' : '❌';
                report += `   ${status} ${name}: ${result.description}\n`;
            }
            report += '\n';
        }
    }

    // Recommendations
    if (caps.recommendations.length > 0) {
        report += '💡 Recommendations:\n';
        for (const rec of caps.recommendations) {
            const icon = rec.priority === 'high' ? '🔴' : '🟡';
            report += `   ${icon} ${rec.message}\n`;
            report += `      → ${rec.action}\n`;
        }
        report += '\n';
    }

    // Footer
    report += '─'.repeat(60) + '\n';
    report += `Checked at: ${caps.timestamp}\n`;

    return report;
}

// =============================================================================
// CLI Interface
// =============================================================================

if (require.main === module) {
    const args = process.argv.slice(2);

    const options = {
        verbose: args.includes('-v') || args.includes('--verbose'),
        json: args.includes('--json'),
        help: args.includes('-h') || args.includes('--help')
    };

    if (options.help) {
        console.log(`
PDF Capability Checker

Pre-flight check for PDF generation capabilities.

Usage:
  node pdf-capability-checker.js [options]

Options:
  -v, --verbose    Show detailed breakdown of all capabilities
  --json           Output as JSON
  -h, --help       Show this help message

Examples:
  # Quick check
  node pdf-capability-checker.js

  # Detailed check
  node pdf-capability-checker.js --verbose

  # JSON output for scripting
  node pdf-capability-checker.js --json
        `);
        process.exit(0);
    }

    (async () => {
        try {
            const result = await runPreflightCheck(options);

            if (options.json) {
                console.log(JSON.stringify(result, null, 2));
            } else {
                console.log(result);
            }

            // Exit with error code if PDF generation not available
            const caps = await checkCapabilities();
            process.exit(caps.summary.canGeneratePDF ? 0 : 1);

        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    })();
}

module.exports = {
    checkCapabilities,
    canGeneratePDF,
    canRenderMermaid,
    getMissingInstallCommands,
    runPreflightCheck,
    CAPABILITIES
};
