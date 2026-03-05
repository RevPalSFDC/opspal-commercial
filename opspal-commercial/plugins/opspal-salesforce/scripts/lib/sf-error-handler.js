#!/usr/bin/env node
/**
 * sf-error-handler.js - Centralized Salesforce CLI Error Classification and Handling
 *
 * Provides:
 * - Error classification based on taxonomy
 * - Retry logic for transient errors
 * - Structured error logging
 * - Actionable suggestions for common errors
 *
 * Usage:
 *   const { SFErrorHandler } = require('./sf-error-handler');
 *   const handler = new SFErrorHandler();
 *   const result = await handler.executeWithRetry(command, args);
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Load error taxonomy
const TAXONOMY_PATH = path.join(__dirname, '..', '..', 'config', 'error-taxonomy.json');
let ERROR_TAXONOMY;

try {
    ERROR_TAXONOMY = JSON.parse(fs.readFileSync(TAXONOMY_PATH, 'utf8'));
} catch (e) {
    // Fallback minimal taxonomy if config not found
    ERROR_TAXONOMY = {
        exitCodes: {
            SUCCESS: 0,
            VALIDATION_ERROR: 1,
            TRANSIENT_ERROR: 3,
            UNKNOWN_ERROR: 99
        },
        categories: {
            TRANSIENT: { retry: true, maxAttempts: 3, patterns: ['ECONNRESET', 'timeout'] },
            VALIDATION: { retry: false, patterns: ['INVALID_FIELD', 'malformed'] }
        }
    };
}

/**
 * Exit codes for SF CLI operations
 */
const EXIT_CODES = ERROR_TAXONOMY.exitCodes;

/**
 * Error classification result
 */
class SFError {
    constructor(options = {}) {
        this.message = options.message || 'Unknown error';
        this.category = options.category || 'UNKNOWN';
        this.exitCode = options.exitCode || EXIT_CODES.UNKNOWN_ERROR;
        this.retryable = options.retryable || false;
        this.suggestion = options.suggestion || null;
        this.originalError = options.originalError || null;
        this.command = options.command || null;
        this.attemptNumber = options.attemptNumber || 1;
        this.timestamp = new Date().toISOString();
    }

    toJSON() {
        return {
            message: this.message,
            category: this.category,
            exitCode: this.exitCode,
            retryable: this.retryable,
            suggestion: this.suggestion,
            command: this.command,
            attemptNumber: this.attemptNumber,
            timestamp: this.timestamp
        };
    }

    toString() {
        let str = `[${this.category}] ${this.message}`;
        if (this.suggestion) {
            str += `\n  Suggestion: ${this.suggestion}`;
        }
        return str;
    }
}

/**
 * Main error handler class
 */
class SFErrorHandler {
    constructor(options = {}) {
        this.options = {
            logErrors: options.logErrors !== false,
            logFile: options.logFile || path.join(__dirname, '..', '..', 'logs', 'sf-errors.jsonl'),
            verbose: options.verbose || false,
            maxRetries: options.maxRetries || 3,
            ...options
        };

        this.categories = ERROR_TAXONOMY.categories;
        this.fallbackStrategies = ERROR_TAXONOMY.fallbackStrategies || {};

        // Ensure log directory exists
        if (this.options.logErrors) {
            const logDir = path.dirname(this.options.logFile);
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }
        }
    }

    /**
     * Classify an error message into a category
     * @param {string} errorMessage - The error message to classify
     * @param {number} exitCode - Optional exit code from the command
     * @returns {SFError} Classified error object
     */
    classifyError(errorMessage, exitCode = 1) {
        const message = String(errorMessage || '').toLowerCase();

        for (const [categoryName, config] of Object.entries(this.categories)) {
            for (const pattern of config.patterns || []) {
                const patternLower = pattern.toLowerCase();
                if (message.includes(patternLower) ||
                    new RegExp(patternLower, 'i').test(errorMessage)) {

                    // Find suggestion if available
                    let suggestion = null;
                    if (config.suggestions) {
                        for (const [trigger, sug] of Object.entries(config.suggestions)) {
                            if (message.includes(trigger.toLowerCase())) {
                                suggestion = sug;
                                break;
                            }
                        }
                    }

                    return new SFError({
                        message: errorMessage,
                        category: categoryName,
                        exitCode: config.exitCode || exitCode,
                        retryable: config.retry || false,
                        suggestion: suggestion
                    });
                }
            }
        }

        // Unknown error category
        return new SFError({
            message: errorMessage,
            category: 'UNKNOWN',
            exitCode: EXIT_CODES.UNKNOWN_ERROR,
            retryable: false
        });
    }

    /**
     * Calculate retry delay based on category config
     * @param {string} category - Error category
     * @param {number} attempt - Current attempt number
     * @returns {number} Delay in milliseconds
     */
    calculateRetryDelay(category, attempt) {
        const config = this.categories[category] || {};
        const baseDelay = config.baseDelay || 2000;
        const maxDelay = config.maxDelay || 30000;
        const backoff = config.backoff || 'exponential';

        let delay;
        switch (backoff) {
            case 'exponential':
                delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
                break;
            case 'linear':
                delay = Math.min(baseDelay * attempt, maxDelay);
                break;
            default:
                delay = baseDelay;
        }

        // Add jitter (±10%) to prevent thundering herd
        const jitter = delay * 0.1 * (Math.random() * 2 - 1);
        return Math.floor(delay + jitter);
    }

    /**
     * Execute a command with automatic retry for transient errors
     * @param {string} command - The SF CLI command
     * @param {string[]} args - Command arguments
     * @param {object} options - Execution options
     * @returns {Promise<{success: boolean, output: string, error: SFError|null}>}
     */
    async executeWithRetry(command, args = [], options = {}) {
        const maxAttempts = options.maxRetries || this.options.maxRetries;
        const fullCommand = [command, ...args].join(' ');

        let lastError = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                if (this.options.verbose) {
                    console.log(`[Attempt ${attempt}/${maxAttempts}] ${fullCommand}`);
                }

                const result = await this.executeCommand(command, args, options);

                if (result.success) {
                    return result;
                }

                // Classify the error
                const sfError = this.classifyError(result.stderr || result.stdout, result.exitCode);
                sfError.command = fullCommand;
                sfError.attemptNumber = attempt;

                lastError = sfError;

                // Log the error
                this.logError(sfError);

                // Check if retryable
                if (!sfError.retryable || attempt >= maxAttempts) {
                    return {
                        success: false,
                        output: result.stdout,
                        error: sfError
                    };
                }

                // Calculate and wait for retry
                const delay = this.calculateRetryDelay(sfError.category, attempt);
                if (this.options.verbose) {
                    console.log(`  Retryable error (${sfError.category}), waiting ${delay}ms...`);
                }
                await this.sleep(delay);

            } catch (error) {
                const sfError = this.classifyError(error.message, error.status || 1);
                sfError.command = fullCommand;
                sfError.attemptNumber = attempt;
                sfError.originalError = error;

                lastError = sfError;
                this.logError(sfError);

                if (!sfError.retryable || attempt >= maxAttempts) {
                    return {
                        success: false,
                        output: '',
                        error: sfError
                    };
                }

                const delay = this.calculateRetryDelay(sfError.category, attempt);
                await this.sleep(delay);
            }
        }

        return {
            success: false,
            output: '',
            error: lastError
        };
    }

    /**
     * Execute a single command
     * @param {string} command - Command to execute
     * @param {string[]} args - Arguments
     * @param {object} options - Options
     * @returns {Promise<{success: boolean, stdout: string, stderr: string, exitCode: number}>}
     */
    executeCommand(command, args = [], options = {}) {
        return new Promise((resolve) => {
            const fullArgs = args.slice();

            // Add --json flag if not present for parseable output
            if (!fullArgs.includes('--json') && !options.noJson) {
                fullArgs.push('--json');
            }

            const timeout = options.timeout || 120000;

            const proc = spawn(command, fullArgs, {
                shell: true,
                timeout: timeout,
                env: {
                    ...process.env,
                    SF_HIDE_RELEASE_NOTES: 'true',
                    SF_DISABLE_AUTOUPDATE: 'true',
                    SF_SKIP_NEW_VERSION_CHECK: 'true',
                    NODE_NO_WARNINGS: '1'
                }
            });

            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            proc.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            proc.on('close', (code) => {
                // Filter out update warnings from stderr
                stderr = this.filterWarnings(stderr);

                // Try to parse JSON output for better error messages
                let parsedOutput = null;
                try {
                    if (stdout.trim().startsWith('{')) {
                        parsedOutput = JSON.parse(stdout);
                        if (parsedOutput.status !== undefined && parsedOutput.status !== 0) {
                            code = parsedOutput.status;
                        }
                        if (parsedOutput.message && !stderr) {
                            stderr = parsedOutput.message;
                        }
                    }
                } catch (e) {
                    // Not JSON, that's fine
                }

                resolve({
                    success: code === 0,
                    stdout: stdout,
                    stderr: stderr,
                    exitCode: code,
                    parsed: parsedOutput
                });
            });

            proc.on('error', (error) => {
                resolve({
                    success: false,
                    stdout: '',
                    stderr: error.message,
                    exitCode: 1
                });
            });
        });
    }

    /**
     * Filter out SF CLI update warnings from stderr
     */
    filterWarnings(stderr) {
        if (!stderr) return '';

        return stderr
            .split('\n')
            .filter(line => {
                const lower = line.toLowerCase();
                return !lower.includes('update available') &&
                       !lower.includes('npm update') &&
                       !lower.includes('a new version of') &&
                       !lower.includes('@salesforce/cli update');
            })
            .join('\n')
            .trim();
    }

    /**
     * Log error to structured log file
     */
    logError(sfError) {
        if (!this.options.logErrors) return;

        try {
            const logEntry = {
                ...sfError.toJSON(),
                context: {
                    cwd: process.cwd(),
                    node_env: process.env.NODE_ENV,
                    sf_org: process.env.SF_TARGET_ORG || process.env.SFDC_INSTANCE
                }
            };

            fs.appendFileSync(
                this.options.logFile,
                JSON.stringify(logEntry) + '\n',
                'utf8'
            );
        } catch (e) {
            // Silent fail for logging
            if (this.options.verbose) {
                console.error('Failed to log error:', e.message);
            }
        }
    }

    /**
     * Get suggestion for an error
     */
    getSuggestion(errorMessage) {
        const sfError = this.classifyError(errorMessage);
        return sfError.suggestion;
    }

    /**
     * Get fallback API recommendation
     */
    getFallbackRecommendation(errorMessage, currentApi = 'REST') {
        for (const [name, strategy] of Object.entries(this.fallbackStrategies)) {
            for (const trigger of strategy.trigger || []) {
                if (errorMessage.includes(trigger)) {
                    return {
                        strategy: name,
                        recommendation: strategy.recommendation,
                        threshold: strategy.threshold
                    };
                }
            }
        }
        return null;
    }

    /**
     * Sleep helper
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get exit code for a category
     */
    getExitCode(category) {
        const config = this.categories[category];
        return config ? config.exitCode : EXIT_CODES.UNKNOWN_ERROR;
    }
}

/**
 * Convenience function for quick error classification
 */
function classifyError(errorMessage, exitCode = 1) {
    const handler = new SFErrorHandler({ logErrors: false });
    return handler.classifyError(errorMessage, exitCode);
}

/**
 * Convenience function for executing with retry
 */
async function executeWithRetry(command, args = [], options = {}) {
    const handler = new SFErrorHandler(options);
    return handler.executeWithRetry(command, args, options);
}

// Export for module usage
module.exports = {
    SFErrorHandler,
    SFError,
    EXIT_CODES,
    classifyError,
    executeWithRetry
};

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0 || args[0] === '--help') {
        console.log(`
sf-error-handler.js - Salesforce CLI Error Classification and Handling

Usage:
  node sf-error-handler.js classify "<error message>"
  node sf-error-handler.js execute <command> [args...]
  node sf-error-handler.js suggest "<error message>"
  node sf-error-handler.js fallback "<error message>"

Examples:
  node sf-error-handler.js classify "ECONNRESET: Connection reset"
  node sf-error-handler.js execute sf data query --query "SELECT Id FROM Account"
  node sf-error-handler.js suggest "No source-backed components present"
  node sf-error-handler.js fallback "REQUEST_LIMIT_EXCEEDED"

Options:
  --verbose    Show detailed output
  --no-log     Don't log errors to file
  --max-retries N   Maximum retry attempts (default: 3)
`);
        process.exit(0);
    }

    const handler = new SFErrorHandler({
        verbose: args.includes('--verbose'),
        logErrors: !args.includes('--no-log')
    });

    const command = args[0];

    switch (command) {
        case 'classify': {
            const message = args.slice(1).filter(a => !a.startsWith('--')).join(' ');
            const result = handler.classifyError(message);
            console.log(JSON.stringify(result.toJSON(), null, 2));
            break;
        }

        case 'execute': {
            const sfArgs = args.slice(1).filter(a => !a.startsWith('--'));
            const cmd = sfArgs[0];
            const cmdArgs = sfArgs.slice(1);

            handler.executeWithRetry(cmd, cmdArgs)
                .then(result => {
                    if (result.success) {
                        console.log(result.output);
                        process.exit(0);
                    } else {
                        console.error(result.error.toString());
                        process.exit(result.error.exitCode);
                    }
                });
            break;
        }

        case 'suggest': {
            const message = args.slice(1).filter(a => !a.startsWith('--')).join(' ');
            const suggestion = handler.getSuggestion(message);
            if (suggestion) {
                console.log(suggestion);
            } else {
                console.log('No specific suggestion available for this error.');
            }
            break;
        }

        case 'fallback': {
            const message = args.slice(1).filter(a => !a.startsWith('--')).join(' ');
            const fallback = handler.getFallbackRecommendation(message);
            if (fallback) {
                console.log(JSON.stringify(fallback, null, 2));
            } else {
                console.log('No fallback recommendation for this error.');
            }
            break;
        }

        default:
            console.error(`Unknown command: ${command}`);
            process.exit(1);
    }
}
