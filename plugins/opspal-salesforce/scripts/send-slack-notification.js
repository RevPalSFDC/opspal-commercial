#!/usr/bin/env node

/**
 * Slack Release Notification Script v2.0
 * Sends formatted release announcements to Slack webhook with idempotency
 * 
 * Usage:
 *   node send-slack-notification.js <version> [options]
 * 
 * Options:
 *   --project=NAME       Project name (default: ClaudeSFDC)
 *   --dry-run           Preview message without sending
 *   --force             Force send even if already sent
 *   --channel=CHANNEL   Override default channel
 *   --template=TYPE     Message template (release|hotfix|security)
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Parse command line arguments
function parseArgs() {
    const args = {
        version: process.argv[2],
        project: 'ClaudeSFDC',
        dryRun: false,
        force: false,
        channel: null,
        template: 'release'
    };
    
    // Version is required
    if (!args.version) {
        console.error('❌ Error: Version is required');
        console.log('\nUsage: node send-slack-notification.js <version> [options]');
        console.log('\nOptions:');
        console.log('  --project=NAME      Project name (default: ClaudeSFDC)');
        console.log('  --dry-run          Preview message without sending');
        console.log('  --force            Force send even if already sent');
        console.log('  --channel=CHANNEL  Override default channel');
        console.log('  --template=TYPE    Message template (release|hotfix|security)');
        console.log('\nExample:');
        console.log('  node send-slack-notification.js v2.5.0 --project="ClaudeSFDC"');
        process.exit(1);
    }
    
    // Validate version format
    if (!args.version.match(/^v\d+\.\d+\.\d+$/)) {
        console.error(`❌ Error: Invalid version format '${args.version}'`);
        console.log('Version must be in format: vX.Y.Z (e.g., v2.5.0)');
        process.exit(1);
    }
    
    // Parse additional arguments
    for (let i = 3; i < process.argv.length; i++) {
        const arg = process.argv[i];
        
        if (arg === '--dry-run') {
            args.dryRun = true;
        } else if (arg === '--force') {
            args.force = true;
        } else if (arg.startsWith('--project=')) {
            args.project = arg.split('=')[1];
        } else if (arg.startsWith('--channel=')) {
            args.channel = arg.split('=')[1];
        } else if (arg.startsWith('--template=')) {
            args.template = arg.split('=')[1];
        }
    }
    
    return args;
}

// Load environment variables
function loadEnv() {
    // Try multiple .env locations
    const envPaths = [
        path.join(__dirname, '../.env'),
        path.join(__dirname, '../../.env'),
        path.join(__dirname, '../../../.env')
    ];
    
    for (const envPath of envPaths) {
        if (fs.existsSync(envPath)) {
            require('dotenv').config({ path: envPath });
            break;
        }
    }
    
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) {
        console.error('❌ SLACK_WEBHOOK_URL not configured in .env file');
        console.log('ℹ️  Add SLACK_WEBHOOK_URL=your-webhook-url to .env file');
        process.exit(1);
    }
    
    return webhookUrl;
}

// Check if notification was already sent (idempotency)
function checkIdempotency(version, project, force) {
    const notificationFile = path.join(__dirname, '.slack-notifications');
    
    if (force) {
        console.log('⚠️  Force flag set, bypassing idempotency check');
        return true;
    }
    
    if (!fs.existsSync(notificationFile)) {
        return true; // First notification ever
    }
    
    const notifications = fs.readFileSync(notificationFile, 'utf8')
        .split('\n')
        .filter(line => line.trim());
    
    const key = `${project}:${version}`;
    const alreadySent = notifications.some(line => line.startsWith(key));
    if (alreadySent) {
        console.log(`ℹ️  Notification for ${project} ${version} already sent`);
        console.log('Use --force to resend');
        return false;
    }
    
    return true;
}

// Record sent notification
function recordNotification(version, project) {
    const notificationFile = path.join(__dirname, '.slack-notifications');
    const key = `${project}:${version}`;
    const timestamp = new Date().toISOString();
    const entry = `${key}:${timestamp}\n`;
    
    fs.appendFileSync(notificationFile, entry);
}

// Load release notes if available
function loadReleaseNotes(version) {
    const releaseNotesPath = path.join(__dirname, `../RELEASE_NOTES_${version}.md`);

    if (!fs.existsSync(releaseNotesPath)) {
        return null;
    }

    const content = fs.readFileSync(releaseNotesPath, 'utf8');

    // Extract key information from release notes
    const highlights = {
        features: [],
        metrics: [],
        fixes: []
    };

    // Extract features (lines starting with - or •)
    const featureMatches = content.match(/^[•\-]\s+(.+)$/gm);
    if (featureMatches) {
        highlights.features = featureMatches.slice(0, 4).map(f => f.replace(/^[•\-]\s+/, ''));
    }

    // Extract metrics (percentages and numbers)
    const metricMatches = content.match(/(\d+%|\d+[kK]?\s+\w+)/g);
    if (metricMatches) {
        highlights.metrics = metricMatches.slice(0, 4);
    }

    return highlights;
}

// Parse git commits to generate patch notes
function generatePatchNotesFromGit(sinceTag = null) {
    const { execSync } = require('child_process');

    const patchNotes = {
        features: [],
        enhancements: [],
        fixes: [],
        misc: []
    };

    try {
        // Get commits since last tag or last 20 commits
        let gitCmd = 'git log --pretty=format:"%s" -n 50';
        if (sinceTag) {
            gitCmd = `git log ${sinceTag}..HEAD --pretty=format:"%s"`;
        }

        const commits = execSync(gitCmd, { encoding: 'utf8', cwd: process.cwd() })
            .split('\n')
            .filter(c => c.trim());

        for (const commit of commits) {
            const lowerCommit = commit.toLowerCase();

            // Skip merge commits, version bumps, and Co-Authored-By lines
            if (lowerCommit.startsWith('merge') ||
                lowerCommit.includes('bump version') ||
                lowerCommit.includes('co-authored-by')) {
                continue;
            }

            // Clean up commit message - remove scope and prefix
            const cleanCommitMsg = (msg, prefixes) => {
                let clean = msg;
                for (const prefix of prefixes) {
                    // Match "prefix(scope): " or "prefix: "
                    const regex = new RegExp(`^${prefix}(\\([^)]+\\))?:\\s*`, 'i');
                    clean = clean.replace(regex, '');
                }
                // Capitalize first letter
                return clean.charAt(0).toUpperCase() + clean.slice(1);
            };

            // Categorize based on conventional commit prefixes (strict prefix matching)
            if (lowerCommit.startsWith('feat:') || lowerCommit.startsWith('feat(')) {
                const cleanMsg = cleanCommitMsg(commit, ['feat']);
                if (cleanMsg && patchNotes.features.length < 5) {
                    patchNotes.features.push(cleanMsg);
                }
            } else if (lowerCommit.startsWith('fix:') || lowerCommit.startsWith('fix(')) {
                const cleanMsg = cleanCommitMsg(commit, ['fix']);
                if (cleanMsg && patchNotes.fixes.length < 5) {
                    patchNotes.fixes.push(cleanMsg);
                }
            } else if (lowerCommit.startsWith('perf:') || lowerCommit.startsWith('perf(') ||
                       lowerCommit.startsWith('refactor:') || lowerCommit.startsWith('refactor(') ||
                       lowerCommit.startsWith('improve') || lowerCommit.startsWith('enhance') ||
                       lowerCommit.startsWith('update:') || lowerCommit.startsWith('update(')) {
                const cleanMsg = cleanCommitMsg(commit, ['perf', 'refactor', 'improve', 'enhance', 'update']);
                if (cleanMsg && patchNotes.enhancements.length < 5) {
                    patchNotes.enhancements.push(cleanMsg);
                }
            } else if (lowerCommit.startsWith('docs:') || lowerCommit.startsWith('docs(') ||
                       lowerCommit.startsWith('chore:') || lowerCommit.startsWith('chore(') ||
                       lowerCommit.startsWith('test:') || lowerCommit.startsWith('test(') ||
                       lowerCommit.startsWith('ci:') || lowerCommit.startsWith('ci(') ||
                       lowerCommit.startsWith('style:') || lowerCommit.startsWith('style(') ||
                       lowerCommit.startsWith('build:') || lowerCommit.startsWith('build(')) {
                const cleanMsg = cleanCommitMsg(commit, ['docs', 'chore', 'test', 'ci', 'style', 'build']);
                if (cleanMsg && patchNotes.misc.length < 4) {
                    patchNotes.misc.push(cleanMsg);
                }
            }
            // Note: Uncategorized commits are now skipped to avoid noise
        }

        // Get stats
        let statsCmd = 'git diff --stat HEAD~10..HEAD 2>/dev/null | tail -1';
        if (sinceTag) {
            statsCmd = `git diff --stat ${sinceTag}..HEAD 2>/dev/null | tail -1`;
        }

        try {
            const stats = execSync(statsCmd, { encoding: 'utf8', cwd: process.cwd() }).trim();
            if (stats) {
                patchNotes.stats = stats;
            }
        } catch (e) {
            // Stats optional
        }

    } catch (error) {
        console.log('ℹ️  Could not parse git history:', error.message);
    }

    return patchNotes;
}

// Build Slack message based on version with patch notes
function buildMessage(args, releaseNotes) {
    const { version, project } = args;
    const releaseUrl = `https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/releases/tag/${version}`;

    // Parse version for proper comparisons
    const [major, minor, patch] = version.substring(1).split('.').map(Number);

    // Determine release type
    let releaseType = 'Patch Release';
    let emoji = '🔧';
    if (patch === 0) {
        if (minor === 0) {
            releaseType = 'Major Release';
            emoji = '🎉';
        } else {
            releaseType = 'Feature Release';
            emoji = '🚀';
        }
    }

    // Get the previous tag for comparison
    let previousTag = null;
    try {
        const { execSync } = require('child_process');
        const tags = execSync('git tag --sort=-version:refname | head -2', { encoding: 'utf8' })
            .split('\n')
            .filter(t => t.trim());
        if (tags.length >= 2) {
            previousTag = tags[1]; // Second most recent tag
        }
    } catch (e) {
        // Ignore, will use default
    }

    // Generate patch notes from git history
    const patchNotes = generatePatchNotesFromGit(previousTag);

    // Build message blocks
    const message = {
        blocks: [
            {
                type: "header",
                text: {
                    type: "plain_text",
                    text: `${emoji} ${project} ${releaseType} ${version}`,
                    emoji: true
                }
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*${project} ${version}* is now available!`
                }
            },
            {
                type: "divider"
            }
        ]
    };

    // Add New Features section
    if (patchNotes.features.length > 0) {
        message.blocks.push({
            type: "section",
            text: {
                type: "mrkdwn",
                text: `*🆕 New Features*\n${patchNotes.features.map(f => `• ${f}`).join('\n')}`
            }
        });
    }

    // Add Enhancements section
    if (patchNotes.enhancements.length > 0) {
        message.blocks.push({
            type: "section",
            text: {
                type: "mrkdwn",
                text: `*✨ Enhancements*\n${patchNotes.enhancements.map(e => `• ${e}`).join('\n')}`
            }
        });
    }

    // Add Fixes section
    if (patchNotes.fixes.length > 0) {
        message.blocks.push({
            type: "section",
            text: {
                type: "mrkdwn",
                text: `*🐛 Fixes*\n${patchNotes.fixes.map(f => `• ${f}`).join('\n')}`
            }
        });
    }

    // Add Misc section
    if (patchNotes.misc.length > 0) {
        message.blocks.push({
            type: "section",
            text: {
                type: "mrkdwn",
                text: `*📦 Misc*\n${patchNotes.misc.map(m => `• ${m}`).join('\n')}`
            }
        });
    }

    // If no categorized items found, use release notes or defaults
    if (patchNotes.features.length === 0 && patchNotes.enhancements.length === 0 &&
        patchNotes.fixes.length === 0 && patchNotes.misc.length === 0) {
        if (releaseNotes && releaseNotes.features.length > 0) {
            message.blocks.push({
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*✨ Highlights*\n${releaseNotes.features.map(f => `• ${f}`).join('\n')}`
                }
            });
        } else {
            message.blocks.push({
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*✨ Highlights*\n• Various improvements and updates\n• See release notes for details`
                }
            });
        }
    }

    // Add stats if available
    if (patchNotes.stats) {
        message.blocks.push({
            type: "context",
            elements: [
                {
                    type: "mrkdwn",
                    text: `📊 *Stats:* ${patchNotes.stats}`
                }
            ]
        });
    }

    // Add action buttons
    message.blocks.push(
        {
            type: "actions",
            elements: [
                {
                    type: "button",
                    text: {
                        type: "plain_text",
                        text: "View Release",
                        emoji: true
                    },
                    style: "primary",
                    url: releaseUrl
                },
                {
                    type: "button",
                    text: {
                        type: "plain_text",
                        text: "Full Changelog",
                        emoji: true
                    },
                    url: `https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/blob/main/CHANGELOG.md`
                }
            ]
        },
        {
            type: "context",
            elements: [
                {
                    type: "mrkdwn",
                    text: `🤖 Generated by Release Bot | 📅 ${new Date().toLocaleString()}`
                }
            ]
        }
    );

    // Override channel if specified
    if (args.channel) {
        message.channel = args.channel;
    }

    return message;
}

// Send message to Slack with retry logic
async function sendToSlack(webhookUrl, message, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const result = await sendRequest(webhookUrl, message);
            if (result.success) {
                return result;
            }
            
            if (attempt < retries) {
                console.log(`⚠️  Attempt ${attempt} failed, retrying...`);
                await sleep(1000 * attempt); // Exponential backoff
            }
        } catch (error) {
            if (attempt === retries) {
                throw error;
            }
        }
    }
}

// Actual HTTP request
function sendRequest(webhookUrl, payload) {
    return new Promise((resolve, reject) => {
        const url = new URL(webhookUrl);
        
        const options = {
            hostname: url.hostname,
            port: 443,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve({ success: true, statusCode: res.statusCode, data });
                } else {
                    resolve({ success: false, statusCode: res.statusCode, data });
                }
            });
        });
        
        req.on('error', (error) => {
            reject(error);
        });
        
        req.write(JSON.stringify(payload));
        req.end();
    });
}

// Sleep helper
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Main execution
async function main() {
    console.log('📬 Slack Release Notification Script v2.0\n');
    
    // Parse arguments
    const args = parseArgs();
    console.log(`📦 Project: ${args.project}`);
    console.log(`🏷️  Version: ${args.version}`);
    
    // Check idempotency
    if (!checkIdempotency(args.version, args.project, args.force)) {
        process.exit(0);
    }
    
    // Load environment
    const webhookUrl = loadEnv();
    
    // Load release notes
    console.log('📄 Loading release notes...');
    const releaseNotes = loadReleaseNotes(args.version);
    if (releaseNotes) {
        console.log('✅ Release notes loaded');
    } else {
        console.log('ℹ️  No release notes found, using default content');
    }
    
    // Build message
    const message = buildMessage(args, releaseNotes);
    
    // Dry run check
    if (args.dryRun) {
        console.log('\n🔍 DRY RUN - Message Preview:');
        console.log(JSON.stringify(message, null, 2));
        console.log('\n✅ Dry run complete (no message sent)');
        process.exit(0);
    }
    
    // Send notification
    console.log('📤 Sending notification to Slack...');
    
    try {
        const result = await sendToSlack(webhookUrl, message);
        
        if (result.success) {
            console.log('✅ Notification sent successfully!');
            console.log(`🔗 Release URL: https://github.com/RevPalSFDC/claude-sfdc/releases/tag/${args.version}`);
            
            // Record successful send
            recordNotification(args.version, args.project);
        } else {
            console.error(`❌ Failed to send notification. Status: ${result.statusCode}`);
            console.error(`Response: ${result.data}`);
            process.exit(1);
        }
    } catch (error) {
        console.error('❌ Error sending notification:', error.message);
        process.exit(1);
    }
}

// Run if executed directly
if (require.main === module) {
    main().catch(error => {
        console.error('❌ Unexpected error:', error);
        process.exit(1);
    });
}

// Export for testing
module.exports = {
    parseArgs,
    checkIdempotency,
    buildMessage,
    loadReleaseNotes,
    generatePatchNotesFromGit
};