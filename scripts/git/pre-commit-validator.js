#!/usr/bin/env node

/**
 * Pre-commit Validator
 * Validates commits before they are made to prevent common issues
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const gitContext = require('./git-context');

// Configuration
const VALIDATION_RULES = {
    commitMessage: {
        enabled: true,
        pattern: /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore)(\(.+\))?!?: .{3,}/,
        maxLength: 72,
        requireBody: false
    },
    files: {
        maxSize: 10 * 1024 * 1024, // 10MB
        forbiddenPatterns: [
            /\.env$/,
            /\.pem$/,
            /\.key$/,
            /\.p12$/,
            /password/i,
            /secret/i,
            /token/i,
            /credential/i
        ],
        requireTests: false
    },
    code: {
        noConsoleLog: false,
        noDebugger: true,
        noTodo: false,
        noHardcodedCredentials: true
    },
    repository: {
        requireCleanWorkdir: false,
        requireUpToDate: false,
        allowedBranches: null // null means all branches allowed
    }
};

// Sensitive data patterns
const SENSITIVE_PATTERNS = [
    /(?:api[_-]?key|apikey)\s*[:=]\s*['"][^'"]{10,}['"]/gi,
    /(?:secret|password|passwd|pwd)\s*[:=]\s*['"][^'"]+['"]/gi,
    /(?:token|auth)\s*[:=]\s*['"][^'"]{20,}['"]/gi,
    /BEGIN\s+(?:RSA|DSA|EC|OPENSSH)\s+PRIVATE\s+KEY/gi,
    /[a-zA-Z0-9+/]{40,}={0,2}/g, // Base64 encoded strings
    /(?:ghp|gho|ghs|ghr)_[a-zA-Z0-9]{36}/g, // GitHub tokens
    /sk-[a-zA-Z0-9]{48}/g, // OpenAI API keys
    /xox[baprs]-[a-zA-Z0-9-]+/g, // Slack tokens
];

/**
 * Validate commit message
 */
function validateCommitMessage(message, rules = VALIDATION_RULES.commitMessage) {
    const validation = {
        valid: true,
        errors: [],
        warnings: []
    };
    
    if (!rules.enabled) return validation;
    
    // Check pattern
    if (rules.pattern && !rules.pattern.test(message)) {
        validation.valid = false;
        validation.errors.push(
            'Commit message must follow conventional format: type(scope): description'
        );
    }
    
    // Check length
    const firstLine = message.split('\n')[0];
    if (rules.maxLength && firstLine.length > rules.maxLength) {
        validation.warnings.push(
            `First line of commit message is ${firstLine.length} characters (max: ${rules.maxLength})`
        );
    }
    
    // Check for body if required
    if (rules.requireBody && !message.includes('\n\n')) {
        validation.warnings.push('Commit message should include a body');
    }
    
    return validation;
}

/**
 * Validate staged files
 */
function validateStagedFiles(rules = VALIDATION_RULES.files) {
    const validation = {
        valid: true,
        errors: [],
        warnings: [],
        files: []
    };
    
    const gitRoot = gitContext.findGitRoot();
    if (!gitRoot) {
        validation.valid = false;
        validation.errors.push('Not in a Git repository');
        return validation;
    }
    
    // Get staged files
    try {
        const staged = execSync('git diff --cached --name-only', {
            cwd: gitRoot,
            encoding: 'utf8'
        }).trim().split('\n').filter(f => f);
        
        for (const file of staged) {
            const filePath = path.join(gitRoot, file);
            const fileValidation = {
                file,
                issues: []
            };
            
            // Check file existence
            if (!fs.existsSync(filePath)) {
                continue; // File was deleted
            }
            
            const stats = fs.statSync(filePath);
            
            // Check file size
            if (stats.size > rules.maxSize) {
                fileValidation.issues.push(
                    `File too large: ${(stats.size / 1024 / 1024).toFixed(2)}MB`
                );
                validation.valid = false;
            }
            
            // Check forbidden patterns
            for (const pattern of rules.forbiddenPatterns) {
                if (pattern.test(file)) {
                    fileValidation.issues.push(
                        `Filename matches forbidden pattern: ${pattern}`
                    );
                    validation.valid = false;
                }
            }
            
            // Check file contents for sensitive data
            if (stats.size < 1024 * 1024) { // Only check files < 1MB
                try {
                    const content = fs.readFileSync(filePath, 'utf8');
                    const sensitiveData = checkForSensitiveData(content);
                    
                    if (sensitiveData.found) {
                        fileValidation.issues.push(
                            `Potential sensitive data: ${sensitiveData.types.join(', ')}`
                        );
                        validation.valid = false;
                    }
                } catch (e) {
                    // Binary file or read error, skip content check
                }
            }
            
            if (fileValidation.issues.length > 0) {
                validation.files.push(fileValidation);
                validation.errors.push(`${file}: ${fileValidation.issues.join('; ')}`);
            }
        }
        
        // Check for test files if required
        if (rules.requireTests) {
            const hasTests = staged.some(f => 
                f.includes('test') || f.includes('spec') || f.includes('__tests__')
            );
            
            const hasCode = staged.some(f => 
                f.endsWith('.js') || f.endsWith('.ts') || 
                f.endsWith('.py') || f.endsWith('.java')
            );
            
            if (hasCode && !hasTests) {
                validation.warnings.push(
                    'Code changes detected but no test files included'
                );
            }
        }
        
    } catch (error) {
        validation.valid = false;
        validation.errors.push(`Failed to get staged files: ${error.message}`);
    }
    
    return validation;
}

/**
 * Check for sensitive data in content
 */
function checkForSensitiveData(content) {
    const result = {
        found: false,
        types: []
    };
    
    for (const pattern of SENSITIVE_PATTERNS) {
        if (pattern.test(content)) {
            result.found = true;
            
            if (pattern.source.includes('api')) {
                result.types.push('API key');
            } else if (pattern.source.includes('password')) {
                result.types.push('Password');
            } else if (pattern.source.includes('token')) {
                result.types.push('Token');
            } else if (pattern.source.includes('PRIVATE')) {
                result.types.push('Private key');
            } else if (pattern.source.includes('ghp')) {
                result.types.push('GitHub token');
            } else if (pattern.source.includes('sk-')) {
                result.types.push('OpenAI key');
            } else if (pattern.source.includes('xox')) {
                result.types.push('Slack token');
            } else {
                result.types.push('Encoded data');
            }
        }
    }
    
    // Remove duplicates
    result.types = [...new Set(result.types)];
    
    return result;
}

/**
 * Validate code quality
 */
function validateCodeQuality(rules = VALIDATION_RULES.code) {
    const validation = {
        valid: true,
        errors: [],
        warnings: []
    };
    
    const gitRoot = gitContext.findGitRoot();
    if (!gitRoot) return validation;
    
    try {
        // Get staged code files
        const staged = execSync('git diff --cached --name-only', {
            cwd: gitRoot,
            encoding: 'utf8'
        }).trim().split('\n').filter(f => f);
        
        const codeFiles = staged.filter(f => 
            f.endsWith('.js') || f.endsWith('.ts') || 
            f.endsWith('.jsx') || f.endsWith('.tsx')
        );
        
        for (const file of codeFiles) {
            const filePath = path.join(gitRoot, file);
            
            if (!fs.existsSync(filePath)) continue;
            
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                
                // Check for console.log
                if (rules.noConsoleLog && /console\.(log|debug|info)/.test(content)) {
                    validation.warnings.push(`${file}: Contains console.log statements`);
                }
                
                // Check for debugger
                if (rules.noDebugger && /\bdebugger\b/.test(content)) {
                    validation.errors.push(`${file}: Contains debugger statement`);
                    validation.valid = false;
                }
                
                // Check for TODO comments
                if (rules.noTodo && /\/\/\s*TODO|\/\*\s*TODO/.test(content)) {
                    validation.warnings.push(`${file}: Contains TODO comments`);
                }
                
                // Check for hardcoded credentials
                if (rules.noHardcodedCredentials) {
                    const hardcodedCreds = content.match(
                        /(?:password|token|secret|api_key)\s*=\s*['"][^'"]+['"]/gi
                    );
                    
                    if (hardcodedCreds) {
                        validation.errors.push(
                            `${file}: Possible hardcoded credentials found`
                        );
                        validation.valid = false;
                    }
                }
                
            } catch (e) {
                // Error reading file, skip
            }
        }
        
    } catch (error) {
        // Error getting staged files
    }
    
    return validation;
}

/**
 * Validate repository state
 */
function validateRepositoryState(rules = VALIDATION_RULES.repository) {
    const validation = {
        valid: true,
        errors: [],
        warnings: []
    };
    
    const gitRoot = gitContext.findGitRoot();
    if (!gitRoot) {
        validation.valid = false;
        validation.errors.push('Not in a Git repository');
        return validation;
    }
    
    const repoInfo = gitContext.getRepoInfo(gitRoot);
    
    // Check clean working directory
    if (rules.requireCleanWorkdir && !repoInfo.isClean) {
        validation.warnings.push(
            'Working directory has uncommitted changes'
        );
    }
    
    // Check if up to date with remote
    if (rules.requireUpToDate && repoInfo.remote) {
        try {
            execSync('git fetch', { cwd: gitRoot });
            
            const behind = execSync(
                `git rev-list --count HEAD..origin/${repoInfo.branch}`,
                { cwd: gitRoot, encoding: 'utf8' }
            ).trim();
            
            if (parseInt(behind) > 0) {
                validation.warnings.push(
                    `Branch is ${behind} commits behind origin/${repoInfo.branch}`
                );
            }
        } catch (e) {
            // Unable to check remote status
        }
    }
    
    // Check allowed branches
    if (rules.allowedBranches && rules.allowedBranches.length > 0) {
        if (!rules.allowedBranches.includes(repoInfo.branch)) {
            validation.errors.push(
                `Commits not allowed on branch '${repoInfo.branch}'. ` +
                `Allowed branches: ${rules.allowedBranches.join(', ')}`
            );
            validation.valid = false;
        }
    }
    
    return validation;
}

/**
 * Run all validations
 */
function runValidations(options = {}) {
    const results = {
        overall: true,
        validations: {}
    };
    
    // Run individual validations
    if (options.message) {
        results.validations.commitMessage = validateCommitMessage(options.message);
        results.overall = results.overall && results.validations.commitMessage.valid;
    }
    
    results.validations.files = validateStagedFiles();
    results.overall = results.overall && results.validations.files.valid;
    
    results.validations.code = validateCodeQuality();
    results.overall = results.overall && results.validations.code.valid;
    
    results.validations.repository = validateRepositoryState();
    results.overall = results.overall && results.validations.repository.valid;
    
    return results;
}

/**
 * Display validation results
 */
function displayResults(results) {
    console.log('\n=== Pre-commit Validation Results ===\n');
    
    let hasErrors = false;
    let hasWarnings = false;
    
    for (const [name, validation] of Object.entries(results.validations)) {
        if (validation.errors.length > 0) {
            console.log(`❌ ${name}:`);
            validation.errors.forEach(e => console.log(`   ${e}`));
            hasErrors = true;
        } else if (validation.warnings.length > 0) {
            console.log(`⚠️  ${name}:`);
            validation.warnings.forEach(w => console.log(`   ${w}`));
            hasWarnings = true;
        } else {
            console.log(`✅ ${name}: Passed`);
        }
    }
    
    console.log('\n' + '='.repeat(40));
    
    if (!results.overall) {
        console.log('\n❌ Validation FAILED - Commit blocked\n');
    } else if (hasWarnings) {
        console.log('\n⚠️  Validation passed with warnings\n');
    } else {
        console.log('\n✅ All validations PASSED\n');
    }
}

/**
 * CLI interface
 */
function main() {
    const args = process.argv.slice(2);
    
    // Parse options
    const options = {
        message: args.find(a => a.startsWith('--message='))?.split('=')[1],
        autoFix: args.includes('--fix'),
        quiet: args.includes('--quiet')
    };
    
    // Run validations
    const results = runValidations(options);
    
    // Display results unless quiet mode
    if (!options.quiet) {
        displayResults(results);
    } else {
        // In quiet mode, just output JSON
        console.log(JSON.stringify(results, null, 2));
    }
    
    // Exit with appropriate code
    process.exit(results.overall ? 0 : 1);
}

// Export functions for use by other scripts
module.exports = {
    validateCommitMessage,
    validateStagedFiles,
    validateCodeQuality,
    validateRepositoryState,
    runValidations,
    checkForSensitiveData
};

// Run if executed directly
if (require.main === module) {
    main();
}