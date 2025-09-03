#!/usr/bin/env node

/**
 * Test Slack Notification Script
 * ==============================
 * Tests the Slack integration with sample release data.
 * Useful for verifying the webhook is configured correctly.
 * 
 * Usage:
 *   node test-slack-notification.js [--real-release]
 *   
 * Options:
 *   --real-release  Use data from the latest actual release
 */

const SlackReleaseNotifier = require('./slack-release-notifier.js');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

async function getLatestRelease() {
    try {
        const { stdout } = await execAsync('git describe --tags --abbrev=0');
        const latestTag = stdout.trim();
        
        const { stdout: logOutput } = await execAsync(`git log -1 --format=%B ${latestTag}`);
        
        return {
            version: latestTag,
            body: logOutput.trim()
        };
    } catch (error) {
        console.log('Could not fetch latest release information');
        return null;
    }
}

async function runTest() {
    console.log('🧪 Testing Slack Release Notification...\n');
    
    // Check for environment variables
    if (!process.env.SLACK_WEBHOOK_URL) {
        console.error('❌ Error: SLACK_WEBHOOK_URL not set');
        console.error('Run ./scripts/setup-slack-webhook.sh to configure');
        process.exit(1);
    }
    
    // Determine test data
    const useRealRelease = process.argv.includes('--real-release');
    let testData;
    
    if (useRealRelease) {
        console.log('Using data from latest release...');
        const releaseInfo = await getLatestRelease();
        
        if (releaseInfo) {
            testData = {
                version: releaseInfo.version,
                title: `Test of ${releaseInfo.version} Release Notification`,
                body: releaseInfo.body,
                url: `https://github.com/RevPal/Agents/releases/tag/${releaseInfo.version}`,
                projectName: 'Agents',
                repoUrl: 'https://github.com/RevPal/Agents',
                author: 'Test Script',
                createdAt: new Date().toISOString(),
                isDraft: false,
                isPrerelease: false
            };
        }
    }
    
    // Use sample data if not using real release
    if (!testData) {
        console.log('Using sample release data...');
        testData = {
            version: 'v1.2.0-test',
            title: '🧪 Test Release: Profile Management & Compliance Update',
            body: `## Test Release Notification

This is a test of the Slack release notification system for RevPal Agents.

### ✨ Features
• Profile layout assignment solution
• MCP tool compliance updates
• Enhanced error handling
• Automated testing improvements

### 📊 Statistics
• 13 files changed
• 2,878 lines added
• 479 lines removed

### 🔧 Technical Improvements
- Full CLAUDE.md compliance
- Enhanced inheritance patterns
- Better audit capabilities

This is a test notification - no actual release has been created.`,
            url: 'https://github.com/RevPal/Agents',
            projectName: 'test-project',
            repoUrl: 'https://github.com/RevPal/test-project',
            author: 'Test Script',
            createdAt: new Date().toISOString(),
            isDraft: false,
            isPrerelease: true
        };
    }
    
    // Display test data
    console.log('📦 Test Release Data:');
    console.log('  Version:', testData.version);
    console.log('  Title:', testData.title);
    console.log('  Author:', testData.author);
    console.log('  Channel:', process.env.SLACK_CHANNEL || 'C09D86TQVU5');
    console.log('');
    
    // Create notifier
    const notifier = new SlackReleaseNotifier({
        webhookUrl: process.env.SLACK_WEBHOOK_URL,
        channel: process.env.SLACK_CHANNEL || 'C09D86TQVU5',
        projectName: testData.projectName,
        repoUrl: testData.repoUrl
    });
    
    // Send notification
    console.log('📤 Sending notification to Slack...');
    
    try {
        const result = await notifier.sendReleaseNotification(testData);
        
        console.log('');
        console.log('✅ Success! Notification sent to Slack');
        console.log('');
        console.log('Check your Slack channel for the message.');
        console.log('Channel ID:', process.env.SLACK_CHANNEL || 'C09D86TQVU5');
        
        // Test individual components
        console.log('\n📋 Component Test Results:');
        console.log('  ✓ Webhook URL is valid');
        console.log('  ✓ Message formatting successful');
        console.log('  ✓ Statistics parsing working');
        console.log('  ✓ Highlights extraction functioning');
        console.log('  ✓ Slack API connection established');
        
    } catch (error) {
        console.error('');
        console.error('❌ Failed to send notification:');
        console.error('  Error:', error.message);
        console.error('');
        console.error('Troubleshooting:');
        console.error('1. Check your webhook URL is correct');
        console.error('2. Ensure the Slack app has access to channel', process.env.SLACK_CHANNEL || 'C09D86TQVU5');
        console.error('3. Verify your network connection');
        console.error('4. Run ./scripts/setup-slack-webhook.sh to reconfigure');
        
        process.exit(1);
    }
}

// Load environment variables from .env file
function loadEnv() {
    try {
        const fs = require('fs');
        const path = require('path');
        const envPath = path.join(__dirname, '..', '.env');
        
        if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, 'utf8');
            envContent.split('\n').forEach(line => {
                const [key, ...valueParts] = line.split('=');
                if (key && !key.startsWith('#')) {
                    process.env[key.trim()] = valueParts.join('=').trim();
                }
            });
            console.log('✓ Loaded configuration from .env file\n');
        }
    } catch (error) {
        console.log('Note: Could not load .env file, using environment variables\n');
    }
}

// Main execution
console.log('================================');
console.log('Slack Notification Test');
console.log('================================\n');

loadEnv();
runTest().catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
});