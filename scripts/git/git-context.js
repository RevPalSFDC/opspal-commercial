#!/usr/bin/env node

/**
 * Git Context Awareness Utility
 * Automatically detects and manages repository context for Git operations
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Find the Git repository root from a given path
 */
function findGitRoot(startPath = process.cwd()) {
    let currentPath = path.resolve(startPath);
    
    while (currentPath !== path.dirname(currentPath)) {
        const gitPath = path.join(currentPath, '.git');
        
        if (fs.existsSync(gitPath)) {
            return currentPath;
        }
        
        currentPath = path.dirname(currentPath);
    }
    
    return null;
}

/**
 * Get repository information
 */
function getRepoInfo(repoPath) {
    if (!repoPath) return null;
    
    const info = {
        root: repoPath,
        name: path.basename(repoPath),
        branch: null,
        remote: null,
        remoteUrl: null,
        isClean: true,
        hasStaged: false,
        hasUntracked: false,
        isDetached: false
    };
    
    try {
        // Get current branch
        const branchCmd = execSync('git symbolic-ref --short HEAD 2>/dev/null', {
            cwd: repoPath,
            encoding: 'utf8'
        }).trim();
        
        info.branch = branchCmd || null;
        
        if (!info.branch) {
            // Check if in detached HEAD state
            const headCmd = execSync('git rev-parse --short HEAD', {
                cwd: repoPath,
                encoding: 'utf8'
            }).trim();
            
            info.branch = headCmd;
            info.isDetached = true;
        }
        
        // Get remote information
        const remoteCmd = execSync('git remote -v 2>/dev/null', {
            cwd: repoPath,
            encoding: 'utf8'
        }).trim();
        
        if (remoteCmd) {
            const lines = remoteCmd.split('\n');
            const remoteLine = lines.find(line => line.includes('(fetch)'));
            
            if (remoteLine) {
                const match = remoteLine.match(/^(\S+)\s+(\S+)\s+/);
                if (match) {
                    info.remote = match[1];
                    info.remoteUrl = match[2];
                }
            }
        }
        
        // Check repository status
        const statusCmd = execSync('git status --porcelain 2>/dev/null', {
            cwd: repoPath,
            encoding: 'utf8'
        }).trim();
        
        if (statusCmd) {
            info.isClean = false;
            const lines = statusCmd.split('\n');
            
            for (const line of lines) {
                if (line.startsWith('??')) {
                    info.hasUntracked = true;
                } else if (line.match(/^[AM]/)) {
                    info.hasStaged = true;
                }
            }
        }
        
    } catch (error) {
        // Git command failed, return what we have
    }
    
    return info;
}

/**
 * Map a file path to its repository
 */
function mapFileToRepo(filePath) {
    const absolutePath = path.resolve(filePath);
    const gitRoot = findGitRoot(path.dirname(absolutePath));
    
    if (!gitRoot) {
        return {
            file: absolutePath,
            repository: null,
            relativePath: null,
            error: 'Not in a Git repository'
        };
    }
    
    return {
        file: absolutePath,
        repository: gitRoot,
        relativePath: path.relative(gitRoot, absolutePath),
        repoInfo: getRepoInfo(gitRoot)
    };
}

/**
 * Group files by their repositories
 */
function groupFilesByRepo(filePaths) {
    const repoMap = new Map();
    const orphanFiles = [];
    
    for (const filePath of filePaths) {
        const mapping = mapFileToRepo(filePath);
        
        if (mapping.repository) {
            if (!repoMap.has(mapping.repository)) {
                repoMap.set(mapping.repository, {
                    root: mapping.repository,
                    info: mapping.repoInfo,
                    files: []
                });
            }
            
            repoMap.get(mapping.repository).files.push({
                absolute: mapping.file,
                relative: mapping.relativePath
            });
        } else {
            orphanFiles.push({
                file: mapping.file,
                error: mapping.error
            });
        }
    }
    
    return {
        repositories: Array.from(repoMap.values()),
        orphanFiles
    };
}

/**
 * Suggest the correct repository for an operation
 */
function suggestRepository(context) {
    const { operation, files, currentDir } = context;
    
    // If files are provided, group them by repository
    if (files && files.length > 0) {
        const grouped = groupFilesByRepo(files);
        
        if (grouped.repositories.length === 1) {
            // All files in same repository
            return {
                suggested: grouped.repositories[0].root,
                reason: 'All files belong to this repository',
                confidence: 'high'
            };
        } else if (grouped.repositories.length > 1) {
            // Files span multiple repositories
            return {
                suggested: null,
                reason: 'Files span multiple repositories',
                repositories: grouped.repositories.map(r => r.root),
                confidence: 'none',
                warning: 'Operation affects multiple repositories'
            };
        }
    }
    
    // Check current directory
    const currentRepo = findGitRoot(currentDir || process.cwd());
    
    if (currentRepo) {
        return {
            suggested: currentRepo,
            reason: 'Current directory is in this repository',
            confidence: 'medium'
        };
    }
    
    // No clear suggestion
    return {
        suggested: null,
        reason: 'No Git repository detected',
        confidence: 'none'
    };
}

/**
 * Validate repository for operation
 */
function validateRepoForOperation(repoPath, operation) {
    const validation = {
        valid: true,
        warnings: [],
        errors: []
    };
    
    const info = getRepoInfo(repoPath);
    
    if (!info) {
        validation.valid = false;
        validation.errors.push('Not a valid Git repository');
        return validation;
    }
    
    // Check for various conditions based on operation
    switch (operation) {
        case 'commit':
            if (!info.hasStaged && !info.hasUntracked) {
                validation.warnings.push('No changes to commit');
            }
            break;
            
        case 'push':
            if (!info.remote) {
                validation.valid = false;
                validation.errors.push('No remote configured');
            }
            if (!info.isClean) {
                validation.warnings.push('Repository has uncommitted changes');
            }
            break;
            
        case 'pull':
            if (!info.remote) {
                validation.valid = false;
                validation.errors.push('No remote configured');
            }
            if (!info.isClean) {
                validation.warnings.push('Repository has uncommitted changes - may cause conflicts');
            }
            break;
            
        case 'release':
            if (!info.isClean) {
                validation.valid = false;
                validation.errors.push('Repository must be clean for release');
            }
            if (!info.remote) {
                validation.valid = false;
                validation.errors.push('No remote configured for release');
            }
            break;
    }
    
    return validation;
}

/**
 * Get repository context summary
 */
function getContextSummary() {
    const cwd = process.cwd();
    const gitRoot = findGitRoot(cwd);
    
    if (!gitRoot) {
        return {
            inRepo: false,
            currentDirectory: cwd,
            message: 'Not in a Git repository'
        };
    }
    
    const info = getRepoInfo(gitRoot);
    const relativePath = path.relative(gitRoot, cwd);
    
    return {
        inRepo: true,
        currentDirectory: cwd,
        repository: {
            root: gitRoot,
            name: info.name,
            branch: info.branch,
            remote: info.remote,
            remoteUrl: info.remoteUrl,
            isClean: info.isClean,
            isDetached: info.isDetached
        },
        relativePath: relativePath || '.',
        summary: `In ${info.name} repository on branch ${info.branch}${info.isClean ? '' : ' (uncommitted changes)'}`
    };
}

/**
 * CLI interface
 */
function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'summary';
    
    switch (command) {
        case 'summary':
            const summary = getContextSummary();
            console.log(JSON.stringify(summary, null, 2));
            break;
            
        case 'root':
            const root = findGitRoot();
            if (root) {
                console.log(root);
            } else {
                console.error('Not in a Git repository');
                process.exit(1);
            }
            break;
            
        case 'info':
            const repoPath = findGitRoot();
            if (repoPath) {
                const info = getRepoInfo(repoPath);
                console.log(JSON.stringify(info, null, 2));
            } else {
                console.error('Not in a Git repository');
                process.exit(1);
            }
            break;
            
        case 'validate':
            const operation = args[1] || 'commit';
            const repo = findGitRoot();
            if (repo) {
                const validation = validateRepoForOperation(repo, operation);
                console.log(JSON.stringify(validation, null, 2));
                
                if (!validation.valid) {
                    process.exit(1);
                }
            } else {
                console.error('Not in a Git repository');
                process.exit(1);
            }
            break;
            
        case 'map':
            const files = args.slice(1);
            if (files.length === 0) {
                console.error('Usage: git-context map <file1> [file2] ...');
                process.exit(1);
            }
            
            const grouped = groupFilesByRepo(files);
            console.log(JSON.stringify(grouped, null, 2));
            break;
            
        default:
            console.log(`
Git Context Awareness Utility

Usage: node git-context.js [command] [options]

Commands:
  summary   Show current repository context (default)
  root      Show repository root directory
  info      Show detailed repository information
  validate  Validate repository for operation
  map       Map files to their repositories

Examples:
  node git-context.js summary
  node git-context.js validate push
  node git-context.js map file1.js file2.py
            `);
    }
}

// Export functions for use by other scripts
module.exports = {
    findGitRoot,
    getRepoInfo,
    mapFileToRepo,
    groupFilesByRepo,
    suggestRepository,
    validateRepoForOperation,
    getContextSummary
};

// Run if executed directly
if (require.main === module) {
    main();
}