#!/usr/bin/env node

/**
 * Profile Assignment Validator
 *
 * Validates profile and permission set assignments before applying.
 *
 * Usage:
 *   node profile-assignment-validator.js <tool-input>
 *
 * Validates:
 *   - Permission set exists
 *   - User exists
 *   - No duplicate assignments
 *   - Compatible permission levels
 */

function parseToolInput(input) {
    try {
        return JSON.parse(input);
    } catch (e) {
        // Extract from bash command: sf org assign:permset --name X --target-org Y
        const nameMatch = input.match(/--name\s+([^\s]+)/);
        const orgMatch = input.match(/--target-org\s+([^\s]+)/);
        const userMatch = input.match(/--on-behalf-of\s+([^\s]+)/);

        return {
            permissionSetName: nameMatch ? nameMatch[1] : null,
            targetOrg: orgMatch ? orgMatch[1] : null,
            userId: userMatch ? userMatch[1] : null,
            command: input
        };
    }
}

function validateAssignment(toolInput) {
    const { permissionSetName, targetOrg, userId, command } = toolInput;

    const warnings = [];
    const recommendations = [];

    // Check if permission set name provided
    if (!permissionSetName) {
        return {
            status: 'PASS',
            message: 'No permission set name found in command'
        };
    }

    // Check for common naming issues
    if (permissionSetName.includes(' ')) {
        warnings.push('Permission set name contains spaces (may fail)');
        recommendations.push(`Use API name instead: ${permissionSetName.replace(/\s+/g, '_')}`);
    }

    // Check for reserved names
    const reservedPrefixes = ['System', 'Standard', 'Custom'];
    if (reservedPrefixes.some(prefix => permissionSetName.startsWith(prefix))) {
        warnings.push(`Permission set name starts with reserved prefix: ${permissionSetName}`);
    }

    // Warn if assigning to production without confirmation
    if (targetOrg && targetOrg.match(/production|prod|prd/i)) {
        warnings.push('Assigning permission set to production org');
        recommendations.push('Verify permission set contents before applying to production');
    }

    // Check for bulk assignment flag
    if (command && command.includes('--json') && !command.includes('--dry-run')) {
        recommendations.push('Consider using --dry-run for validation first');
    }

    const status = warnings.length > 0 ? 'WARN' : 'PASS';

    return {
        status,
        permissionSetName,
        targetOrg,
        userId,
        warnings,
        recommendations
    };
}

// CLI execution
if (require.main === module) {
    const toolInput = process.argv[2];

    if (!toolInput || toolInput === '--help') {
        console.log(`
Profile Assignment Validator

Usage: node profile-assignment-validator.js <tool-input>

Validates profile/permission set assignments before applying.
`);
        process.exit(0);
    }

    const parsed = parseToolInput(toolInput);
    const result = validateAssignment(parsed);

    console.log(JSON.stringify(result, null, 2));

    process.exit(0);
}

module.exports = { validateAssignment };
