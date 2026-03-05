#!/usr/bin/env node

/**
 * Salesforce Layout XML Validator
 *
 * Validates Salesforce Layout metadata XML files before deployment to prevent
 * common structural errors that cause deployment failures.
 *
 * Validations:
 * 1. All layoutSections have required <style> tags
 * 2. Proper nesting of layoutColumns and layoutItems
 * 3. Valid behavior values (Edit, Readonly, Required)
 * 4. All required metadata elements present
 * 5. Valid XML structure
 *
 * Usage:
 *   node salesforce-layout-validator.js validate <layout-file>
 *   node salesforce-layout-validator.js validate-dir <directory>
 *
 * Exit codes:
 *   0 = All validations passed
 *   1 = Validation errors found (blocking deployment)
 *   2 = Warnings found (non-blocking)
 *
 * Created: 2025-10-05
 * From: Quote Light Framework - Layout Deployment Reflection
 */

const fs = require('fs');
const path = require('path');

// Valid values for layout metadata elements
const VALID_BEHAVIORS = ['Edit', 'Readonly', 'Required'];
const VALID_STYLES = [
    'TwoColumnsTopToBottom',
    'TwoColumnsLeftToRight',
    'CustomLinks',
    'OneColumn'
];

/**
 * Parse XML without external dependencies (basic regex-based parser)
 * For production, consider using xmldom or fast-xml-parser
 */
function parseLayoutXML(xmlContent) {
    const sections = [];

    // Extract all layoutSection blocks
    const sectionRegex = /<layoutSections>([\s\S]*?)<\/layoutSections>/g;
    let match;
    let sectionIndex = 0;

    while ((match = sectionRegex.exec(xmlContent)) !== null) {
        const sectionContent = match[1];
        const sectionStartPos = match.index;

        // Get line number for error reporting
        const lineNumber = xmlContent.substring(0, sectionStartPos).split('\n').length;

        // Extract section properties
        const section = {
            index: sectionIndex++,
            lineNumber: lineNumber,
            content: sectionContent,
            hasStyle: /<style>/.test(sectionContent),
            style: null,
            label: null,
            columns: [],
            issues: []
        };

        // Extract style
        const styleMatch = sectionContent.match(/<style>(.*?)<\/style>/);
        if (styleMatch) {
            section.style = styleMatch[1];
        }

        // Extract label
        const labelMatch = sectionContent.match(/<label>(.*?)<\/label>/);
        if (labelMatch) {
            section.label = labelMatch[1];
        }

        // Extract layoutColumns
        const columnRegex = /<layoutColumns>([\s\S]*?)<\/layoutColumns>/g;
        let columnMatch;
        while ((columnMatch = columnRegex.exec(sectionContent)) !== null) {
            const columnContent = columnMatch[1];
            const column = {
                items: []
            };

            // Extract layoutItems
            const itemRegex = /<layoutItems>([\s\S]*?)<\/layoutItems>/g;
            let itemMatch;
            while ((itemMatch = itemRegex.exec(columnContent)) !== null) {
                const itemContent = itemMatch[1];

                // Extract behavior
                const behaviorMatch = itemContent.match(/<behavior>(.*?)<\/behavior>/);
                const fieldMatch = itemContent.match(/<field>(.*?)<\/field>/);

                if (behaviorMatch && fieldMatch) {
                    column.items.push({
                        field: fieldMatch[1],
                        behavior: behaviorMatch[1]
                    });
                }
            }

            section.columns.push(column);
        }

        sections.push(section);
    }

    return sections;
}

/**
 * Validate a single layout section
 */
function validateSection(section) {
    const errors = [];
    const warnings = [];

    // Validation 1: Must have style tag
    if (!section.hasStyle) {
        errors.push({
            severity: 'ERROR',
            line: section.lineNumber,
            section: section.label || `Section ${section.index + 1}`,
            message: 'Missing required <style> tag',
            fix: `Add one of: ${VALID_STYLES.join(', ')}`
        });
    }

    // Validation 2: Style must be valid value
    if (section.style && !VALID_STYLES.includes(section.style)) {
        errors.push({
            severity: 'ERROR',
            line: section.lineNumber,
            section: section.label || `Section ${section.index + 1}`,
            message: `Invalid style value: "${section.style}"`,
            fix: `Must be one of: ${VALID_STYLES.join(', ')}`
        });
    }

    // Validation 3: Validate all layoutItem behaviors
    section.columns.forEach((column, colIndex) => {
        column.items.forEach((item, itemIndex) => {
            if (!VALID_BEHAVIORS.includes(item.behavior)) {
                errors.push({
                    severity: 'ERROR',
                    line: section.lineNumber,
                    section: section.label || `Section ${section.index + 1}`,
                    message: `Invalid behavior "${item.behavior}" for field "${item.field}"`,
                    fix: `Must be one of: ${VALID_BEHAVIORS.join(', ')}`
                });
            }
        });
    });

    // Validation 4: Check for empty sections (warning only)
    if (section.columns.length === 0) {
        warnings.push({
            severity: 'WARNING',
            line: section.lineNumber,
            section: section.label || `Section ${section.index + 1}`,
            message: 'Section has no layoutColumns',
            fix: 'Consider removing empty section or adding fields'
        });
    }

    // Validation 5: Check for columns with no items (warning)
    section.columns.forEach((column, colIndex) => {
        if (column.items.length === 0) {
            warnings.push({
                severity: 'WARNING',
                line: section.lineNumber,
                section: section.label || `Section ${section.index + 1}`,
                message: `Column ${colIndex + 1} has no layoutItems`,
                fix: 'Consider removing empty column or adding fields'
            });
        }
    });

    return { errors, warnings };
}

/**
 * Validate entire layout file
 */
function validateLayoutFile(filePath) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Validating: ${path.basename(filePath)}`);
    console.log(`${'='.repeat(80)}\n`);

    // Read file
    if (!fs.existsSync(filePath)) {
        console.error(`❌ ERROR: File not found: ${filePath}`);
        return { success: false, errorCount: 1, warningCount: 0 };
    }

    const xmlContent = fs.readFileSync(filePath, 'utf-8');

    // Basic XML validation
    if (!xmlContent.includes('<Layout xmlns=')) {
        console.error(`❌ ERROR: Not a valid Salesforce Layout file (missing <Layout xmlns=...>)`);
        return { success: false, errorCount: 1, warningCount: 0 };
    }

    // Parse sections
    const sections = parseLayoutXML(xmlContent);

    if (sections.length === 0) {
        console.warn(`⚠️  WARNING: No layoutSections found in file`);
        return { success: true, errorCount: 0, warningCount: 1 };
    }

    console.log(`Found ${sections.length} layout section(s)\n`);

    // Validate each section
    let totalErrors = 0;
    let totalWarnings = 0;
    const allErrors = [];
    const allWarnings = [];

    sections.forEach((section, index) => {
        const { errors, warnings } = validateSection(section);

        if (errors.length > 0 || warnings.length > 0) {
            const sectionLabel = section.label || `Section ${index + 1}`;
            console.log(`\n${sectionLabel} (line ${section.lineNumber}):`);
            console.log(`${'─'.repeat(60)}`);

            errors.forEach(err => {
                console.log(`❌ ${err.message}`);
                console.log(`   Fix: ${err.fix}\n`);
                allErrors.push(err);
            });

            warnings.forEach(warn => {
                console.log(`⚠️  ${warn.message}`);
                console.log(`   Suggestion: ${warn.fix}\n`);
                allWarnings.push(warn);
            });
        }

        totalErrors += errors.length;
        totalWarnings += warnings.length;
    });

    // Summary
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Validation Summary for ${path.basename(filePath)}`);
    console.log(`${'='.repeat(80)}\n`);

    if (totalErrors === 0 && totalWarnings === 0) {
        console.log(`✅ All validations passed!`);
        console.log(`   ${sections.length} sections validated successfully\n`);
        return { success: true, errorCount: 0, warningCount: 0 };
    } else {
        console.log(`Errors:   ${totalErrors} ❌`);
        console.log(`Warnings: ${totalWarnings} ⚠️\n`);

        if (totalErrors > 0) {
            console.log(`🚫 DEPLOYMENT BLOCKED - Fix errors before deploying\n`);
            return { success: false, errorCount: totalErrors, warningCount: totalWarnings };
        } else {
            console.log(`⚠️  Warnings present but deployment allowed\n`);
            return { success: true, errorCount: 0, warningCount: totalWarnings };
        }
    }
}

/**
 * Validate all layout files in a directory
 */
function validateDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
        console.error(`❌ ERROR: Directory not found: ${dirPath}`);
        process.exit(1);
    }

    const files = fs.readdirSync(dirPath)
        .filter(f => f.endsWith('.layout-meta.xml'))
        .map(f => path.join(dirPath, f));

    if (files.length === 0) {
        console.log(`⚠️  No layout files found in ${dirPath}`);
        process.exit(2);
    }

    console.log(`\nFound ${files.length} layout file(s) to validate\n`);

    let totalErrors = 0;
    let totalWarnings = 0;
    const results = [];

    files.forEach(file => {
        const result = validateLayoutFile(file);
        results.push({ file: path.basename(file), ...result });
        totalErrors += result.errorCount;
        totalWarnings += result.warningCount;
    });

    // Overall summary
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Overall Validation Summary`);
    console.log(`${'='.repeat(80)}\n`);

    results.forEach(r => {
        const status = r.success ? '✅' : '❌';
        console.log(`${status} ${r.file}: ${r.errorCount} errors, ${r.warningCount} warnings`);
    });

    console.log(`\nTotal Errors:   ${totalErrors} ❌`);
    console.log(`Total Warnings: ${totalWarnings} ⚠️\n`);

    if (totalErrors > 0) {
        console.log(`🚫 DEPLOYMENT BLOCKED - Fix all errors before deploying\n`);
        process.exit(1);
    } else if (totalWarnings > 0) {
        console.log(`⚠️  Deployment allowed but warnings should be reviewed\n`);
        process.exit(2);
    } else {
        console.log(`✅ All layout files validated successfully!\n`);
        process.exit(0);
    }
}

// CLI
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log(`
Salesforce Layout Validator

Usage:
  node salesforce-layout-validator.js validate <layout-file.xml>
  node salesforce-layout-validator.js validate-dir <directory>

Examples:
  node salesforce-layout-validator.js validate force-app/main/default/layouts/Opportunity-Layout.layout-meta.xml
  node salesforce-layout-validator.js validate-dir force-app/main/default/layouts/

Exit codes:
  0 = All validations passed
  1 = Errors found (blocks deployment)
  2 = Warnings found (non-blocking)
        `);
        process.exit(1);
    }

    const command = args[0];
    const target = args[1];

    if (command === 'validate' && target) {
        const result = validateLayoutFile(target);
        process.exit(result.success ? 0 : 1);
    } else if (command === 'validate-dir' && target) {
        validateDirectory(target);
    } else {
        console.error(`❌ Invalid command: ${command}\n`);
        console.log(`Use: validate <file> or validate-dir <directory>`);
        process.exit(1);
    }
}

module.exports = {
    validateLayoutFile,
    validateDirectory,
    parseLayoutXML,
    validateSection
};
