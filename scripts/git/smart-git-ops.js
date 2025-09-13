#!/usr/bin/env node

/**
 * Smart Git Operations Wrapper
 * Intelligent Git operations with automatic staging, commit message generation, and error handling
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const gitContext = require('./git-context');

// Configuration
const COMMIT_TYPES = {
    feat: 'A new feature',
    fix: 'A bug fix',
    docs: 'Documentation only changes',
    style: 'Changes that do not affect code meaning',
    refactor: 'Code change that neither fixes a bug nor adds a feature',
    perf: 'Performance improvement',
    test: 'Adding or updating tests',
    build: 'Changes to build system or dependencies',
    ci: 'Changes to CI configuration',
    chore: 'Other changes that don\'t modify src or test files'
};

/**
 * Execute Git command with error handling
 */
function execGit(command, options = {}) {
    const cwd = options.cwd || gitContext.findGitRoot() || process.cwd();
    
    try {
        const result = execSync(`git ${command}`, {
            cwd,
            encoding: 'utf8',
            ...options
        });
        return { success: true, output: result.trim() };
    } catch (error) {
        return {
            success: false,
            error: error.message,
            stderr: error.stderr ? error.stderr.toString() : ''
        };
    }
}

/**
 * Intelligently stage related files
 */
function smartStage(files = [], options = {}) {
    const { autoRelated = true, pattern } = options;
    const gitRoot = gitContext.findGitRoot();
    
    if (!gitRoot) {
        return { success: false, error: 'Not in a Git repository' };
    }
    
    const stagedFiles = new Set();
    const errors = [];
    
    // If no files specified, check for unstaged changes
    if (files.length === 0) {
        const statusResult = execGit('status --porcelain');
        
        if (!statusResult.success || !statusResult.output) {
            return { success: false, error: 'No changes to stage' };
        }
        
        // Parse unstaged files
        const lines = statusResult.output.split('\n');
        for (const line of lines) {
            const match = line.match(/^[ ?][ ?]\s+(.+)$/);
            if (match) {
                files.push(match[1]);
            }
        }
    }
    
    // Stage specified files
    for (const file of files) {
        const result = execGit(`add "${file}"`);
        
        if (result.success) {
            stagedFiles.add(file);
            
            // Auto-stage related files if enabled
            if (autoRelated) {
                const related = findRelatedFiles(file, gitRoot);
                for (const relatedFile of related) {
                    const relResult = execGit(`add "${relatedFile}"`);
                    if (relResult.success) {
                        stagedFiles.add(relatedFile);
                    }
                }
            }
        } else {
            errors.push(`Failed to stage ${file}: ${result.error}`);
        }
    }
    
    // Apply pattern if specified
    if (pattern) {
        const patternResult = execGit(`add "${pattern}"`);
        if (patternResult.success) {
            const addedFiles = execGit('diff --cached --name-only').output?.split('\n') || [];
            addedFiles.forEach(f => stagedFiles.add(f));
        }
    }
    
    return {
        success: errors.length === 0,
        stagedFiles: Array.from(stagedFiles),
        errors
    };
}

/**
 * Find related files (e.g., test files, documentation)
 */
function findRelatedFiles(file, gitRoot) {
    const related = [];
    const basename = path.basename(file, path.extname(file));
    const dir = path.dirname(file);
    
    // Common patterns for related files
    const patterns = [
        `${basename}.test.*`,
        `${basename}.spec.*`,
        `test_${basename}.*`,
        `${basename}.md`,
        `README.md`
    ];
    
    // Check for related files
    for (const pattern of patterns) {
        const searchPath = path.join(gitRoot, dir, pattern);
        const matches = execGit(`ls-files "${searchPath}" 2>/dev/null`);
        
        if (matches.success && matches.output) {
            related.push(...matches.output.split('\n').filter(f => f));
        }
    }
    
    return related;
}

/**
 * Generate commit message from changes
 */
function generateCommitMessage(options = {}) {
    const { type = 'feat', scope, breaking = false } = options;
    
    // Get staged changes
    const diffResult = execGit('diff --cached --stat');
    
    if (!diffResult.success || !diffResult.output) {
        return null;
    }
    
    // Analyze changes
    const files = [];
    const lines = diffResult.output.split('\n');
    
    for (const line of lines) {
        const match = line.match(/^\s*(.+?)\s+\|/);
        if (match) {
            files.push(match[1]);
        }
    }
    
    if (files.length === 0) {
        return null;
    }
    
    // Determine scope from file paths
    let detectedScope = scope;
    if (!detectedScope) {
        const commonDir = findCommonDirectory(files);
        if (commonDir && commonDir !== '.') {
            detectedScope = commonDir.split('/')[0];
        }
    }
    
    // Generate description from file changes
    let description = '';
    
    if (files.length === 1) {
        const file = files[0];
        const basename = path.basename(file, path.extname(file));
        
        if (type === 'feat') {
            description = `add ${basename} functionality`;
        } else if (type === 'fix') {
            description = `fix issue in ${basename}`;
        } else if (type === 'docs') {
            description = `update ${basename} documentation`;
        } else {
            description = `update ${basename}`;
        }
    } else {
        const components = [...new Set(files.map(f => f.split('/')[0]))];
        
        if (components.length === 1) {
            description = `update ${components[0]} module`;
        } else {
            description = `update multiple components`;
        }
    }
    
    // Build commit message
    let message = type;
    
    if (detectedScope) {
        message += `(${detectedScope})`;
    }
    
    if (breaking) {
        message += '!';
    }
    
    message += `: ${description}`;
    
    // Add body with file list if many files
    if (files.length > 3) {
        message += '\n\nAffected files:\n';
        files.forEach(f => {
            message += `- ${f}\n`;
        });
    }
    
    // Add co-author if specified
    if (options.coAuthor) {
        message += `\n\nCo-Authored-By: ${options.coAuthor}`;
    }
    
    // Add Claude signature
    message += '\n\n🤖 Generated with [Claude Code](https://claude.ai/code)\n\n';
    message += 'Co-Authored-By: Claude <noreply@anthropic.com>';
    
    return message;
}

/**
 * Find common directory from file paths
 */
function findCommonDirectory(files) {
    if (files.length === 0) return '.';
    if (files.length === 1) return path.dirname(files[0]);
    
    const dirs = files.map(f => path.dirname(f).split('/'));
    const common = [];
    
    for (let i = 0; i < dirs[0].length; i++) {
        const segment = dirs[0][i];
        
        if (dirs.every(d => d[i] === segment)) {
            common.push(segment);
        } else {
            break;
        }
    }
    
    return common.join('/') || '.';
}

/**
 * Smart commit with automatic message generation
 */
function smartCommit(options = {}) {
    const gitRoot = gitContext.findGitRoot();
    
    if (!gitRoot) {
        return { success: false, error: 'Not in a Git repository' };
    }
    
    // Check for staged changes
    const stagedResult = execGit('diff --cached --stat');
    
    if (!stagedResult.success || !stagedResult.output) {
        // Try to stage changes if none are staged
        const stageResult = smartStage();
        
        if (!stageResult.success) {
            return { success: false, error: 'No changes to commit' };
        }
    }
    
    // Generate or use provided message
    let message = options.message;
    
    if (!message) {
        message = generateCommitMessage(options);
        
        if (!message) {
            return { success: false, error: 'Could not generate commit message' };
        }
    }
    
    // Create commit
    const commitResult = execGit(`commit -m "${message.replace(/"/g, '\\"')}"`);
    
    return commitResult;
}

/**
 * Smart push with retry logic
 */
async function smartPush(options = {}) {
    const { branch, remote = 'origin', force = false, retries = 3 } = options;
    const gitRoot = gitContext.findGitRoot();
    
    if (!gitRoot) {
        return { success: false, error: 'Not in a Git repository' };
    }
    
    // Get current branch if not specified
    let targetBranch = branch;
    if (!targetBranch) {
        const branchResult = execGit('branch --show-current');
        
        if (!branchResult.success || !branchResult.output) {
            return { success: false, error: 'Could not determine current branch' };
        }
        
        targetBranch = branchResult.output;
    }
    
    // Check if remote exists
    const remoteResult = execGit(`remote get-url ${remote}`);
    
    if (!remoteResult.success) {
        return { success: false, error: `Remote '${remote}' not configured` };
    }
    
    // Attempt push with retry logic
    let attempt = 0;
    let lastError = '';
    
    while (attempt < retries) {
        const pushCommand = force ? 
            `push ${remote} ${targetBranch} --force-with-lease` :
            `push ${remote} ${targetBranch}`;
        
        const pushResult = execGit(pushCommand);
        
        if (pushResult.success) {
            return { success: true, output: pushResult.output };
        }
        
        lastError = pushResult.error;
        
        // Check if error is recoverable
        if (pushResult.stderr?.includes('rejected')) {
            // Try to pull and merge/rebase
            if (!force) {
                const pullResult = execGit(`pull ${remote} ${targetBranch} --rebase`);
                
                if (!pullResult.success) {
                    return { 
                        success: false, 
                        error: 'Push rejected and automatic rebase failed',
                        suggestion: 'Manual intervention required'
                    };
                }
                
                // Retry push after rebase
                attempt++;
                continue;
            }
        }
        
        // For other errors, retry with delay
        attempt++;
        
        if (attempt < retries) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
    }
    
    return { 
        success: false, 
        error: `Push failed after ${retries} attempts: ${lastError}` 
    };
}

/**
 * Interactive CLI interface
 */
function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'help';
    
    switch (command) {
        case 'stage':
            const files = args.slice(1);
            const stageResult = smartStage(files);
            
            if (stageResult.success) {
                console.log(`✅ Staged ${stageResult.stagedFiles.length} files`);
                stageResult.stagedFiles.forEach(f => console.log(`  + ${f}`));
            } else {
                console.error('❌ Staging failed:');
                stageResult.errors.forEach(e => console.error(`  ${e}`));
                process.exit(1);
            }
            break;
            
        case 'commit':
            const type = args.find(a => a.startsWith('--type='))?.split('=')[1] || 'feat';
            const scope = args.find(a => a.startsWith('--scope='))?.split('=')[1];
            const message = args.find(a => a.startsWith('--message='))?.split('=')[1];
            
            const commitResult = smartCommit({ type, scope, message });
            
            if (commitResult.success) {
                console.log('✅ Commit created successfully');
                console.log(commitResult.output);
            } else {
                console.error(`❌ Commit failed: ${commitResult.error}`);
                process.exit(1);
            }
            break;
            
        case 'push':
            const branch = args.find(a => a.startsWith('--branch='))?.split('=')[1];
            const remote = args.find(a => a.startsWith('--remote='))?.split('=')[1];
            const force = args.includes('--force');
            
            smartPush({ branch, remote, force }).then(pushResult => {
                if (pushResult.success) {
                    console.log('✅ Push successful');
                    console.log(pushResult.output);
                } else {
                    console.error(`❌ Push failed: ${pushResult.error}`);
                    if (pushResult.suggestion) {
                        console.log(`💡 Suggestion: ${pushResult.suggestion}`);
                    }
                    process.exit(1);
                }
            });
            break;
            
        case 'auto':
            // Full automatic workflow
            console.log('🤖 Running automatic Git workflow...\n');
            
            const autoStage = smartStage();
            if (!autoStage.success) {
                console.error('❌ No changes to commit');
                process.exit(0);
            }
            
            console.log(`✅ Staged ${autoStage.stagedFiles.length} files`);
            
            const autoCommit = smartCommit({ type: 'feat' });
            if (!autoCommit.success) {
                console.error(`❌ Commit failed: ${autoCommit.error}`);
                process.exit(1);
            }
            
            console.log('✅ Commit created');
            
            smartPush({}).then(autoPush => {
                if (autoPush.success) {
                    console.log('✅ Pushed to remote');
                } else {
                    console.log(`⚠️  Push failed: ${autoPush.error}`);
                    console.log('Run "git push" manually when ready');
                }
            });
            break;
            
        default:
            console.log(`
Smart Git Operations Wrapper

Usage: node smart-git-ops.js [command] [options]

Commands:
  stage [files...]     Intelligently stage files and related changes
  commit              Create commit with auto-generated message
  push                Push changes with retry logic
  auto                Run full automatic workflow

Options:
  --type=<type>       Commit type (feat, fix, docs, etc.)
  --scope=<scope>     Commit scope
  --message=<msg>     Custom commit message
  --branch=<branch>   Target branch for push
  --remote=<remote>   Remote name (default: origin)
  --force             Force push

Examples:
  node smart-git-ops.js stage
  node smart-git-ops.js commit --type=fix --scope=auth
  node smart-git-ops.js push --branch=main
  node smart-git-ops.js auto
            `);
    }
}

// Export functions for use by other scripts
module.exports = {
    execGit,
    smartStage,
    smartCommit,
    smartPush,
    generateCommitMessage,
    findRelatedFiles
};

// Run if executed directly
if (require.main === module) {
    main();
}