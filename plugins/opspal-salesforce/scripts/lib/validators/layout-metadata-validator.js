#!/usr/bin/env node

/**
 * Layout Metadata Validator
 *
 * Validates layout metadata (FlexiPage, Layout, CompactLayout) before deployment.
 *
 * Usage:
 *   node layout-metadata-validator.js <tool-input>
 *
 * Validates:
 *   - XML syntax
 *   - Required fields present
 *   - No invalid field references
 *   - Component compatibility
 */

const fs = require('fs');
const path = require('path');

function parseToolInput(input) {
    try {
        return JSON.parse(input);
    } catch (e) {
        // Extract file paths from bash command
        const pathMatch = input.match(/--source-dir\s+([^\s]+)/);
        if (pathMatch) {
            return { sourcePath: pathMatch[1] };
        }
        return { command: input };
    }
}

function findLayoutFiles(sourcePath) {
    if (!fs.existsSync(sourcePath)) {
        return [];
    }

    const layoutFiles = [];

    function scanDir(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                scanDir(fullPath);
            } else if (entry.name.match(/\.(flexipage|layout|compactLayout)-meta\.xml$/)) {
                layoutFiles.push(fullPath);
            }
        }
    }

    scanDir(sourcePath);
    return layoutFiles;
}

function validateLayoutXML(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const errors = [];
    const warnings = [];

    // Check for basic XML syntax issues
    if (!content.includes('<?xml')) {
        errors.push(`Missing XML declaration in ${path.basename(filePath)}`);
    }

    // Check for required FlexiPage elements
    if (filePath.includes('.flexipage-meta.xml')) {
        if (!content.includes('<flexiPageRegions>')) {
            errors.push('Missing <flexiPageRegions> in FlexiPage');
        }
        if (!content.includes('<type>')) {
            errors.push('Missing <type> in FlexiPage');
        }
    }

    // Check for invalid field references (common error)
    const fieldMatches = content.matchAll(/<field>([^<]+)<\/field>/g);
    for (const match of fieldMatches) {
        const fieldName = match[1];
        if (fieldName.includes(' ')) {
            errors.push(`Invalid field name with space: "${fieldName}"`);
        }
        if (!fieldName.match(/^[a-zA-Z0-9_]+$/)) {
            warnings.push(`Unusual field name: "${fieldName}"`);
        }
    }

    // Check for deprecated components
    if (content.includes('force:recordView')) {
        warnings.push('Deprecated component: force:recordView (use lightning:recordViewForm)');
    }

    return { errors, warnings };
}

function validateLayouts(toolInput) {
    const { sourcePath, command } = toolInput;

    if (!sourcePath && !command) {
        return {
            status: 'PASS',
            message: 'No source path found in tool input'
        };
    }

    const layoutFiles = findLayoutFiles(sourcePath || '.');

    if (layoutFiles.length === 0) {
        return {
            status: 'PASS',
            message: 'No layout files found in deployment'
        };
    }

    const allErrors = [];
    const allWarnings = [];

    for (const filePath of layoutFiles) {
        const { errors, warnings } = validateLayoutXML(filePath);
        allErrors.push(...errors.map(e => `${path.basename(filePath)}: ${e}`));
        allWarnings.push(...warnings.map(w => `${path.basename(filePath)}: ${w}`));
    }

    const status = allErrors.length > 0 ? 'FAIL' : allWarnings.length > 0 ? 'WARN' : 'PASS';

    return {
        status,
        filesValidated: layoutFiles.length,
        errors: allErrors,
        warnings: allWarnings
    };
}

// CLI execution
if (require.main === module) {
    const toolInput = process.argv[2];

    if (!toolInput || toolInput === '--help') {
        console.log(`
Layout Metadata Validator

Usage: node layout-metadata-validator.js <tool-input>

Validates layout metadata files before deployment.
`);
        process.exit(0);
    }

    const parsed = parseToolInput(toolInput);
    const result = validateLayouts(parsed);

    console.log(JSON.stringify(result, null, 2));

    // Exit with error if validation failed
    process.exit(result.status === 'FAIL' ? 1 : 0);
}

module.exports = { validateLayouts };
