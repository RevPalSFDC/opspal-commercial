#!/usr/bin/env node

/**
 * Multi-Repository Manager
 * Discovers and manages multiple Git repositories in the RevPal Agents project
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const PROJECT_ROOT = path.join(__dirname, '..', '..');
const REPO_STATUS_FILE = path.join(PROJECT_ROOT, '.repo-status.json');

// Color codes for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    blue: '\x1b[36m',
    gray: '\x1b[90m'
};

// Helper functions
function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
    console.log(`${colors.green}[✓]${colors.reset} ${message}`);
}

function logWarning(message) {
    console.log(`${colors.yellow}[⚠]${colors.reset} ${message}`);
}

function logError(message) {
    console.log(`${colors.red}[✗]${colors.reset} ${message}`);
}

function logInfo(message) {
    console.log(`${colors.blue}[i]${colors.reset} ${message}`);
}

/**
 * Execute Git command in a specific directory
 */
function execGitCommand(command, repoPath) {
    try {
        const result = execSync(`git ${command}`, {
            cwd: repoPath,
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe']
        });
        return { success: true, output: result.trim() };
    } catch (error) {
        return { 
            success: false, 
            error: error.stderr ? error.stderr.toString().trim() : error.message 
        };
    }
}

/**
 * Discover all Git repositories
 */
function discoverRepositories(searchPath = PROJECT_ROOT) {
    const repositories = [];
    
    function scanDirectory(dir) {
        try {
            const items = fs.readdirSync(dir, { withFileTypes: true });
            
            for (const item of items) {
                const fullPath = path.join(dir, item.name);
                
                // Skip common directories to ignore
                if (['node_modules', 'dist', 'build', '.venv', '__pycache__'].includes(item.name)) {
                    continue;
                }
                
                if (item.isDirectory()) {
                    // Check if it's a Git repository
                    const gitPath = path.join(fullPath, '.git');
                    if (fs.existsSync(gitPath)) {
                        repositories.push(fullPath);
                        // Don't scan subdirectories of Git repos
                        continue;
                    }
                    
                    // Recursively scan subdirectories
                    if (!item.name.startsWith('.')) {
                        scanDirectory(fullPath);
                    }
                }
            }
        } catch (error) {
            // Ignore permission errors
        }
    }
    
    scanDirectory(searchPath);
    return repositories;
}

/**
 * Get repository status
 */
function getRepositoryStatus(repoPath) {
    const status = {
        path: repoPath,
        name: path.basename(repoPath),
        relativePath: path.relative(PROJECT_ROOT, repoPath),
        branch: 'unknown',
        remotes: [],
        hasChanges: false,
        hasUntracked: false,
        hasStaged: false,
        ahead: 0,
        behind: 0,
        lastCommit: null,
        error: null
    };
    
    // Get current branch
    const branchResult = execGitCommand('branch --show-current', repoPath);
    if (branchResult.success) {
        status.branch = branchResult.output || 'detached';
    }
    
    // Get remotes
    const remotesResult = execGitCommand('remote -v', repoPath);
    if (remotesResult.success && remotesResult.output) {
        const remoteLines = remotesResult.output.split('\n');
        const remoteMap = new Map();
        
        for (const line of remoteLines) {
            const match = line.match(/^(\S+)\s+(\S+)\s+\((\w+)\)/);
            if (match) {
                const [, name, url, type] = match;
                if (!remoteMap.has(name)) {
                    remoteMap.set(name, { name, url });
                }
            }
        }
        
        status.remotes = Array.from(remoteMap.values());
    }
    
    // Check for changes
    const statusResult = execGitCommand('status --porcelain', repoPath);
    if (statusResult.success && statusResult.output) {
        const lines = statusResult.output.split('\n').filter(l => l);
        
        for (const line of lines) {
            if (line.startsWith('??')) {
                status.hasUntracked = true;
            } else if (line.match(/^[AM]/)) {
                status.hasStaged = true;
            } else {
                status.hasChanges = true;
            }
        }
    }
    
    // Get ahead/behind count
    if (status.remotes.length > 0 && status.branch !== 'detached') {
        const trackingResult = execGitCommand(
            `rev-list --left-right --count origin/${status.branch}...HEAD 2>/dev/null`,
            repoPath
        );
        
        if (trackingResult.success) {
            const [behind, ahead] = trackingResult.output.split('\t').map(n => parseInt(n) || 0);
            status.behind = behind;
            status.ahead = ahead;
        }
    }
    
    // Get last commit
    const lastCommitResult = execGitCommand('log -1 --format="%h %s (%ar)"', repoPath);
    if (lastCommitResult.success) {
        status.lastCommit = lastCommitResult.output;
    }
    
    return status;
}

/**
 * Display repository status dashboard
 */
function displayDashboard(repositories) {
    log('\n========================================', 'bright');
    log('Multi-Repository Status Dashboard', 'bright');
    log('========================================\n', 'bright');
    
    for (const repo of repositories) {
        const status = getRepositoryStatus(repo);
        
        // Repository header
        log(`📁 ${status.name}`, 'bright');
        console.log(`   Path: ${colors.gray}${status.relativePath}${colors.reset}`);
        
        // Branch and remote info
        const branchColor = status.branch === 'main' || status.branch === 'master' ? 'green' : 'yellow';
        console.log(`   Branch: ${colors[branchColor]}${status.branch}${colors.reset}`);
        
        if (status.remotes.length > 0) {
            console.log(`   Remote: ${status.remotes[0].url}`);
        } else {
            console.log(`   Remote: ${colors.yellow}No remote configured${colors.reset}`);
        }
        
        // Status indicators
        const statusIcons = [];
        if (status.hasStaged) statusIcons.push(`${colors.green}●${colors.reset} staged`);
        if (status.hasChanges) statusIcons.push(`${colors.yellow}●${colors.reset} modified`);
        if (status.hasUntracked) statusIcons.push(`${colors.red}●${colors.reset} untracked`);
        
        if (statusIcons.length > 0) {
            console.log(`   Status: ${statusIcons.join(' ')}`);
        } else {
            console.log(`   Status: ${colors.green}✓ clean${colors.reset}`);
        }
        
        // Sync status
        if (status.ahead > 0 || status.behind > 0) {
            const syncStatus = [];
            if (status.ahead > 0) syncStatus.push(`${colors.green}↑${status.ahead}${colors.reset}`);
            if (status.behind > 0) syncStatus.push(`${colors.red}↓${status.behind}${colors.reset}`);
            console.log(`   Sync: ${syncStatus.join(' ')}`);
        }
        
        // Last commit
        if (status.lastCommit) {
            console.log(`   Last commit: ${colors.gray}${status.lastCommit}${colors.reset}`);
        }
        
        console.log();
    }
}

/**
 * Perform operation on all repositories
 */
async function performBulkOperation(repositories, operation) {
    log(`\nPerforming "${operation}" on all repositories...`, 'blue');
    
    const results = [];
    
    for (const repo of repositories) {
        const repoName = path.basename(repo);
        process.stdout.write(`   ${repoName}... `);
        
        const result = execGitCommand(operation, repo);
        
        if (result.success) {
            console.log(colors.green + '✓' + colors.reset);
            if (result.output) {
                console.log(`     ${colors.gray}${result.output}${colors.reset}`);
            }
        } else {
            console.log(colors.red + '✗' + colors.reset);
            console.log(`     ${colors.red}${result.error}${colors.reset}`);
        }
        
        results.push({ repo, ...result });
    }
    
    return results;
}

/**
 * Interactive repository selector
 */
function selectRepository(repositories) {
    console.log('\nSelect a repository:');
    repositories.forEach((repo, index) => {
        const name = path.basename(repo);
        const relative = path.relative(PROJECT_ROOT, repo);
        console.log(`  ${index + 1}. ${name} (${relative})`);
    });
    
    // In a real implementation, this would read user input
    // For now, return the first repository
    return repositories[0];
}

/**
 * Save repository status to file
 */
function saveStatus(repositories) {
    const statusData = {
        timestamp: new Date().toISOString(),
        repositories: repositories.map(repo => getRepositoryStatus(repo))
    };
    
    fs.writeFileSync(REPO_STATUS_FILE, JSON.stringify(statusData, null, 2));
    logSuccess(`Repository status saved to ${path.relative(PROJECT_ROOT, REPO_STATUS_FILE)}`);
}

/**
 * Main execution
 */
function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'status';
    
    // Discover repositories
    const repositories = discoverRepositories();
    
    if (repositories.length === 0) {
        logError('No Git repositories found');
        process.exit(1);
    }
    
    logInfo(`Found ${repositories.length} Git repositories\n`);
    
    switch (command) {
        case 'status':
            displayDashboard(repositories);
            break;
            
        case 'fetch':
            performBulkOperation(repositories, 'fetch --all');
            break;
            
        case 'pull':
            performBulkOperation(repositories, 'pull');
            break;
            
        case 'branch':
            performBulkOperation(repositories, 'branch -v');
            break;
            
        case 'save':
            saveStatus(repositories);
            break;
            
        case 'clean':
            performBulkOperation(repositories, 'clean -fd');
            break;
            
        default:
            if (command.startsWith('git ')) {
                // Execute custom git command
                performBulkOperation(repositories, command.substring(4));
            } else {
                console.log(`
Multi-Repository Manager

Usage: node multi-repo-manager.js [command]

Commands:
  status    Show status of all repositories (default)
  fetch     Fetch updates from all remotes
  pull      Pull updates for all repositories
  branch    Show branches for all repositories
  save      Save repository status to file
  clean     Clean untracked files from all repositories
  
You can also run any git command:
  node multi-repo-manager.js "git log -1"
                `);
            }
    }
}

// Export functions for use by other scripts
module.exports = {
    discoverRepositories,
    getRepositoryStatus,
    performBulkOperation,
    execGitCommand
};

// Run if executed directly
if (require.main === module) {
    main();
}