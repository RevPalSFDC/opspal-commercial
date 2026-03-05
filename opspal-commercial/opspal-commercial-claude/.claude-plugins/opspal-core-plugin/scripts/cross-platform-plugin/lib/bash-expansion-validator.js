#!/usr/bin/env node

/**
 * Bash Expansion Validator
 *
 * Pre-parses bash commands to detect potential expansion issues:
 * - Undefined variable references
 * - Unquoted variable expansions
 * - Glob patterns in dangerous contexts
 * - Command substitution with undefined vars
 *
 * @version 1.0.0
 * @date 2025-12-19
 *
 * Addresses: config/env cohort (bash expansion failures)
 */

const fs = require('fs');
const path = require('path');

class BashExpansionValidator {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.strictMode = options.strictMode !== false;

        // Known environment variables (baseline)
        this.knownEnvVars = new Set([
            // System
            'HOME', 'USER', 'PATH', 'PWD', 'SHELL', 'TERM', 'LANG',
            'TMPDIR', 'TEMP', 'TMP',
            // Claude/Plugin
            'CLAUDE_PLUGIN_ROOT', 'NODE_ENV', 'CLAUDE_PROJECT_ROOT',
            // Common
            'DEBUG', 'VERBOSE', 'CI', 'GITHUB_ACTIONS',
            // Salesforce
            'SALESFORCE_ORG_ALIAS', 'SF_TARGET_ORG', 'SFDX_DEFAULTUSERNAME',
            'SF_API_VERSION', 'SALESFORCE_INSTANCE_URL', 'SALESFORCE_ACCESS_TOKEN',
            // HubSpot
            'HUBSPOT_PRIVATE_APP_TOKEN', 'HUBSPOT_ACCESS_TOKEN', 'HUBSPOT_PORTAL_ID',
            // Marketo
            'MARKETO_CLIENT_ID', 'MARKETO_CLIENT_SECRET', 'MARKETO_BASE_URL',
            // Integrations
            'ASANA_ACCESS_TOKEN', 'ASANA_WORKSPACE_ID', 'ASANA_PROJECT_GID',
            'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY',
            'SLACK_WEBHOOK_URL',
            // Plugin config
            'ENABLE_SUBAGENT_BOOST', 'ENABLE_AGENT_BLOCKING', 'ROUTING_VERBOSE',
            'ENABLE_AUTO_ROUTING', 'ROUTING_CONFIDENCE_THRESHOLD', 'COMPLEXITY_THRESHOLD',
            'ENV_VALIDATION_STRICT', 'ENV_VALIDATION_ENABLED', 'ENV_CONFIG_VERBOSE'
        ]);

        // Patterns that indicate variable usage
        this.variablePatterns = {
            simpleVar: /\$([A-Za-z_][A-Za-z0-9_]*)/g,           // $VAR
            bracedVar: /\$\{([A-Za-z_][A-Za-z0-9_]*)([^}]*)?\}/g, // ${VAR} or ${VAR:-default}
            commandSub: /\$\(([^)]+)\)/g,                        // $(command)
            backtickSub: /`([^`]+)`/g,                           // `command`
            arithmetic: /\$\(\(([^)]+)\)\)/g                     // $((expr))
        };

        // Dangerous patterns
        this.dangerousPatterns = {
            // Unquoted variable that could be empty or contain spaces
            unquotedExpansion: /(?<!["\'])(\$[A-Za-z_][A-Za-z0-9_]*|\$\{[^}]+\})(?!["\'])/g,

            // Glob patterns that might expand unexpectedly
            dangerousGlob: /(?<!["\'])(\*|\?|\[[^\]]+\])(?!["\'])/g,

            // rm with wildcards (very dangerous)
            rmWildcard: /rm\s+(-[rf]+\s+)*[^|;]*\*/g,

            // Unprotected eval
            evalUsage: /\beval\s+/g,

            // Unquoted command substitution in assignment
            unquotedCommandSub: /[A-Za-z_][A-Za-z0-9_]*=\$\([^)]+\)(?!\s*;?\s*$)/g
        };

        // Safe patterns (these are OK)
        this.safePatterns = {
            // Variable with default value
            withDefault: /\$\{[^}]+:-[^}]*\}/,
            // Variable in double quotes
            quotedVar: /"[^"]*\$[^"]*"/,
            // Array access
            arrayAccess: /\$\{[A-Za-z_][A-Za-z0-9_]*\[@?\]\}/
        };
    }

    /**
     * Validate a bash command for expansion issues
     * @param {string} command - Bash command to validate
     * @param {Object} context - Additional context (available vars, etc.)
     * @returns {Object} Validation result
     */
    validate(command, context = {}) {
        const result = {
            valid: true,
            errors: [],
            warnings: [],
            suggestions: [],
            variablesUsed: [],
            expansions: {
                variables: [],
                commands: [],
                globs: []
            }
        };

        if (!command || typeof command !== 'string') {
            result.valid = false;
            result.errors.push('Command must be a non-empty string');
            return result;
        }

        // Add context-provided vars to known vars
        const knownVars = new Set([
            ...this.knownEnvVars,
            ...(context.availableVars || [])
        ]);

        // Also add vars from current environment
        for (const key of Object.keys(process.env)) {
            knownVars.add(key);
        }

        // Extract and validate variable references
        this._extractVariables(command, result, knownVars);

        // Check for dangerous patterns
        this._checkDangerousPatterns(command, result);

        // Check for unquoted expansions that should be quoted
        this._checkUnquotedExpansions(command, result);

        // Check command substitutions
        this._checkCommandSubstitutions(command, result, knownVars);

        // Final validation status
        result.valid = result.errors.length === 0;

        return result;
    }

    /**
     * Extract and validate variable references
     */
    _extractVariables(command, result, knownVars) {
        // Simple $VAR patterns
        let match;
        const simpleRegex = new RegExp(this.variablePatterns.simpleVar);
        while ((match = simpleRegex.exec(command)) !== null) {
            const varName = match[1];
            result.variablesUsed.push(varName);
            result.expansions.variables.push({
                name: varName,
                position: match.index,
                type: 'simple'
            });

            if (!knownVars.has(varName)) {
                // Check if it's a common typo
                const similar = this._findSimilarVar(varName, knownVars);
                if (similar) {
                    result.warnings.push(
                        `Variable $${varName} not found. Did you mean $${similar}?`
                    );
                } else {
                    result.warnings.push(
                        `Variable $${varName} may not be defined`
                    );
                }
            }
        }

        // Braced ${VAR} patterns
        const bracedRegex = new RegExp(this.variablePatterns.bracedVar);
        while ((match = bracedRegex.exec(command)) !== null) {
            const varName = match[1];
            const modifier = match[2] || '';

            result.variablesUsed.push(varName);
            result.expansions.variables.push({
                name: varName,
                position: match.index,
                type: 'braced',
                hasDefault: modifier.includes(':-') || modifier.includes(':=')
            });

            // Don't warn if there's a default value
            if (!knownVars.has(varName) && !modifier.includes(':-') && !modifier.includes(':=')) {
                result.warnings.push(
                    `Variable \${${varName}} may not be defined. Consider using \${${varName}:-default}`
                );
            }
        }
    }

    /**
     * Check for dangerous patterns
     */
    _checkDangerousPatterns(command, result) {
        // Check for rm with wildcards
        if (this.dangerousPatterns.rmWildcard.test(command)) {
            result.warnings.push(
                'rm command with wildcard detected. Ensure path is validated before execution.'
            );
            result.suggestions.push(
                'Consider using: rm -i (interactive) or validate path first'
            );
        }

        // Check for eval usage
        if (this.dangerousPatterns.evalUsage.test(command)) {
            result.warnings.push(
                'eval usage detected. This can be dangerous with user input.'
            );
        }

        // Check for dangerous globs outside quotes
        let globMatch;
        const globRegex = new RegExp(this.dangerousPatterns.dangerousGlob);
        while ((globMatch = globRegex.exec(command)) !== null) {
            // Check if this is inside quotes (simplified check)
            const beforeMatch = command.substring(0, globMatch.index);
            const singleQuotes = (beforeMatch.match(/'/g) || []).length;
            const doubleQuotes = (beforeMatch.match(/"/g) || []).length;

            // If odd number of quotes, we're inside a quoted string
            if (singleQuotes % 2 === 0 && doubleQuotes % 2 === 0) {
                result.expansions.globs.push({
                    pattern: globMatch[0],
                    position: globMatch.index
                });
            }
        }
    }

    /**
     * Check for unquoted expansions that should be quoted
     */
    _checkUnquotedExpansions(command, result) {
        // Find variable usages that aren't in quotes
        const unquotedRegex = new RegExp(this.dangerousPatterns.unquotedExpansion);
        let match;

        while ((match = unquotedRegex.exec(command)) !== null) {
            const expansion = match[1];

            // Skip if it's in a safe context (array access, with default, etc.)
            if (this.safePatterns.withDefault.test(expansion)) {
                continue;
            }

            // Check surrounding context
            const beforeMatch = command.substring(0, match.index);
            const afterMatch = command.substring(match.index + match[0].length);

            // Check if inside [[...]] or ((...))
            const inTestBracket = /\[\[.*$/.test(beforeMatch) && /^.*\]\]/.test(afterMatch);
            const inArithmetic = /\(\(.*$/.test(beforeMatch) && /^.*\)\)/.test(afterMatch);

            if (!inTestBracket && !inArithmetic) {
                // This expansion could be problematic if value contains spaces
                result.suggestions.push(
                    `Consider quoting ${expansion} as "${expansion}" to handle spaces/special chars`
                );
            }
        }
    }

    /**
     * Check command substitutions for issues
     */
    _checkCommandSubstitutions(command, result, knownVars) {
        // Check $(command) substitutions
        let match;
        const cmdSubRegex = new RegExp(this.variablePatterns.commandSub);

        while ((match = cmdSubRegex.exec(command)) !== null) {
            const innerCommand = match[1];

            result.expansions.commands.push({
                command: innerCommand,
                position: match.index
            });

            // Recursively validate inner command
            const innerResult = this.validate(innerCommand, { availableVars: [...knownVars] });

            // Propagate warnings from inner command
            for (const warning of innerResult.warnings) {
                result.warnings.push(`In command substitution: ${warning}`);
            }
        }

        // Check backtick substitutions (legacy)
        const backtickRegex = new RegExp(this.variablePatterns.backtickSub);
        while ((match = backtickRegex.exec(command)) !== null) {
            result.suggestions.push(
                `Consider using $(${match[1]}) instead of backticks for better readability`
            );
        }
    }

    /**
     * Find similar variable name (for typo detection)
     */
    _findSimilarVar(varName, knownVars) {
        const threshold = 2; // Levenshtein distance threshold

        for (const known of knownVars) {
            if (this._levenshteinDistance(varName.toLowerCase(), known.toLowerCase()) <= threshold) {
                return known;
            }
        }
        return null;
    }

    /**
     * Calculate Levenshtein distance between two strings
     */
    _levenshteinDistance(a, b) {
        const matrix = [];

        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }

        return matrix[b.length][a.length];
    }

    /**
     * Suggest safe version of command
     * @param {string} command - Original command
     * @returns {string} Safer version with proper quoting
     */
    makeSafe(command) {
        let safe = command;

        // Quote unquoted variable expansions
        safe = safe.replace(
            /(?<!["\'])(\$[A-Za-z_][A-Za-z0-9_]*)(?!["\'])/g,
            '"$1"'
        );

        // Quote unquoted brace expansions (but not those with defaults)
        safe = safe.replace(
            /(?<!["\'])(\$\{[A-Za-z_][A-Za-z0-9_]*\})(?!["\'])/g,
            '"$1"'
        );

        // Replace backticks with $()
        safe = safe.replace(/`([^`]+)`/g, '$($1)');

        return safe;
    }

    /**
     * Validate a script file
     * @param {string} filePath - Path to bash script
     * @returns {Object} Validation result with line-by-line issues
     */
    validateFile(filePath) {
        const result = {
            valid: true,
            filePath,
            lineIssues: [],
            summary: {
                errors: 0,
                warnings: 0,
                suggestions: 0
            }
        };

        if (!fs.existsSync(filePath)) {
            result.valid = false;
            result.lineIssues.push({
                line: 0,
                errors: [`File not found: ${filePath}`],
                warnings: [],
                suggestions: []
            });
            return result;
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNum = i + 1;

            // Skip comments and empty lines
            if (line.trim().startsWith('#') || line.trim() === '') {
                continue;
            }

            const lineResult = this.validate(line);

            if (lineResult.errors.length > 0 || lineResult.warnings.length > 0 ||
                lineResult.suggestions.length > 0) {

                result.lineIssues.push({
                    line: lineNum,
                    content: line.substring(0, 80) + (line.length > 80 ? '...' : ''),
                    errors: lineResult.errors,
                    warnings: lineResult.warnings,
                    suggestions: lineResult.suggestions
                });

                result.summary.errors += lineResult.errors.length;
                result.summary.warnings += lineResult.warnings.length;
                result.summary.suggestions += lineResult.suggestions.length;
            }
        }

        result.valid = result.summary.errors === 0;
        return result;
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    const validator = new BashExpansionValidator({ verbose: true });

    switch (command) {
        case 'validate':
            const cmdToValidate = args.slice(1).join(' ');
            if (!cmdToValidate) {
                console.error('Usage: bash-expansion-validator validate "command"');
                process.exit(1);
            }
            const result = validator.validate(cmdToValidate);
            console.log(JSON.stringify(result, null, 2));
            process.exit(result.valid ? 0 : 1);
            break;

        case 'validate-file':
            const filePath = args[1];
            if (!filePath) {
                console.error('Usage: bash-expansion-validator validate-file <script.sh>');
                process.exit(1);
            }
            const fileResult = validator.validateFile(filePath);
            console.log(JSON.stringify(fileResult, null, 2));
            process.exit(fileResult.valid ? 0 : 1);
            break;

        case 'make-safe':
            const unsafeCmd = args.slice(1).join(' ');
            if (!unsafeCmd) {
                console.error('Usage: bash-expansion-validator make-safe "command"');
                process.exit(1);
            }
            const safeCmd = validator.makeSafe(unsafeCmd);
            console.log(safeCmd);
            break;

        default:
            console.log(`
Bash Expansion Validator - Detect bash expansion issues

Usage:
  bash-expansion-validator validate "command"        Validate a bash command
  bash-expansion-validator validate-file <script>   Validate a bash script file
  bash-expansion-validator make-safe "command"      Output safer version of command

Examples:
  bash-expansion-validator validate 'echo $UNDEFINED_VAR'
  bash-expansion-validator validate-file ./script.sh
  bash-expansion-validator make-safe 'echo $VAR without quotes'

Checks:
  - Undefined variable references
  - Unquoted variable expansions
  - Dangerous glob patterns
  - rm with wildcards
  - eval usage
  - Command substitution issues
            `);
    }
}

module.exports = { BashExpansionValidator };
