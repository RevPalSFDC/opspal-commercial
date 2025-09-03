#!/usr/bin/env node

/**
 * Slack Release Notifier
 * ======================
 * Sends formatted release notifications to Slack when new releases are published.
 * Can be used with GitHub Actions or called directly.
 * 
 * Usage:
 *   node slack-release-notifier.js --version v1.1.1 --title "Release Title" --body "Release notes" --url "https://github.com/..."
 *   
 * Environment Variables Required:
 *   SLACK_WEBHOOK_URL - The incoming webhook URL for your Slack workspace
 *   SLACK_CHANNEL (optional) - Override default channel
 */

const https = require('https');
const { URL } = require('url');

class SlackReleaseNotifier {
    constructor(config = {}) {
        this.webhookUrl = config.webhookUrl || process.env.SLACK_WEBHOOK_URL;
        this.channel = config.channel || process.env.SLACK_CHANNEL;
        this.projectName = config.projectName || process.env.PROJECT_NAME || this.extractProjectName(config.url || config.repoUrl) || 'RevPal Agents';
        this.repoUrl = config.repoUrl || 'https://github.com/RevPal/Agents';
        
        if (!this.webhookUrl) {
            throw new Error('SLACK_WEBHOOK_URL is required. Please set it as an environment variable.');
        }
    }
    
    /**
     * Extract project name from GitHub URL
     */
    extractProjectName(url) {
        if (!url) return null;
        // Match GitHub repository URLs
        const match = url.match(/github\.com\/[^\/]+\/([^\/\?#]+)/);
        if (match) {
            // Return the repository name (without .git extension if present)
            return match[1].replace(/\.git$/, '');
        }
        return null;
    }
    
    /**
     * Get the appropriate documentation URL based on project
     */
    getDocumentationUrl() {
        // Different projects use different documentation paths
        const projectName = this.projectName.toLowerCase();
        
        if (projectName.includes('claude-sfdc') || projectName.includes('sfdc')) {
            // ClaudeSFDC uses /docs
            return `${this.repoUrl}/tree/main/docs`;
        } else if (projectName.includes('claude-hubspot') || projectName.includes('hubspot')) {
            // ClaudeHubSpot likely uses /docs too
            return `${this.repoUrl}/tree/main/docs`;
        } else {
            // Main Agents project uses /documentation
            return `${this.repoUrl}/tree/main/documentation`;
        }
    }
    
    /**
     * Send release notification to Slack
     */
    async sendReleaseNotification(releaseData) {
        const {
            version,
            title,
            body,
            url,
            author = 'Claude Code',
            createdAt = new Date().toISOString(),
            isDraft = false,
            isPrerelease = false
        } = releaseData;
        
        // Parse release body for statistics
        const stats = this.parseReleaseStats(body);
        const highlights = this.extractHighlights(body);
        
        // Build Slack message
        const message = this.buildSlackMessage({
            version,
            title,
            body,
            url,
            author,
            createdAt,
            isDraft,
            isPrerelease,
            stats,
            highlights
        });
        
        // Send to Slack
        return await this.sendToSlack(message);
    }
    
    /**
     * Build formatted Slack message
     */
    buildSlackMessage(data) {
        const {
            version,
            title,
            url,
            author,
            createdAt,
            isDraft,
            isPrerelease,
            stats,
            highlights
        } = data;
        
        // Determine emoji and color based on release type
        let emoji = '🚀';
        let color = 'good'; // green
        
        if (isDraft) {
            emoji = '📝';
            color = '#808080'; // gray
        } else if (isPrerelease) {
            emoji = '🔬';
            color = 'warning'; // yellow
        }
        
        // Build main message
        const mainText = `${emoji} *New Release Published: ${this.projectName} ${version}*`;
        
        // Build attachment blocks
        const blocks = [
            {
                type: 'header',
                text: {
                    type: 'plain_text',
                    text: `${emoji} ${this.projectName} ${version}`,
                    emoji: true
                }
            },
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*${title || `Release ${version}`}*`
                }
            }
        ];
        
        // Add highlights if available
        if (highlights.length > 0) {
            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: '*✨ Highlights:*\n' + highlights.map(h => `• ${h}`).join('\n')
                }
            });
        }
        
        // Add statistics if available
        if (stats.filesChanged || stats.additions || stats.deletions) {
            const statsParts = [];
            if (stats.filesChanged) statsParts.push(`📝 ${stats.filesChanged} files changed`);
            if (stats.additions) statsParts.push(`➕ ${stats.additions} additions`);
            if (stats.deletions) statsParts.push(`➖ ${stats.deletions} deletions`);
            
            blocks.push({
                type: 'context',
                elements: [{
                    type: 'mrkdwn',
                    text: statsParts.join('  |  ')
                }]
            });
        }
        
        // Add actions
        blocks.push({
            type: 'actions',
            elements: [
                {
                    type: 'button',
                    text: {
                        type: 'plain_text',
                        text: '📖 View Release',
                        emoji: true
                    },
                    url: url || `${this.repoUrl}/releases/tag/${version}`,
                    style: 'primary'
                },
                {
                    type: 'button',
                    text: {
                        type: 'plain_text',
                        text: '📚 Documentation',
                        emoji: true
                    },
                    url: this.getDocumentationUrl()
                },
                {
                    type: 'button',
                    text: {
                        type: 'plain_text',
                        text: '💻 Repository',
                        emoji: true
                    },
                    url: this.repoUrl
                }
            ]
        });
        
        // Add footer
        blocks.push({
            type: 'context',
            elements: [
                {
                    type: 'mrkdwn',
                    text: `Published by ${author} • ${this.formatDate(createdAt)}`
                }
            ]
        });
        
        // Build final message structure
        const message = {
            text: mainText,
            blocks,
            attachments: [{
                color,
                fallback: `${this.projectName} ${version} has been released`
            }]
        };
        
        // Add channel override if specified
        if (this.channel) {
            message.channel = this.channel;
        }
        
        return message;
    }
    
    /**
     * Parse release body for statistics
     */
    parseReleaseStats(body) {
        const stats = {};
        
        // Look for common patterns in release notes
        const filesMatch = body.match(/(\d+)\s+files?\s+changed/i);
        const additionsMatch = body.match(/(\d+)\s+(?:lines?\s+)?(?:additions?|added|insertions?)/i);
        const deletionsMatch = body.match(/(\d+)\s+(?:lines?\s+)?(?:deletions?|removed|deleted)/i);
        
        if (filesMatch) stats.filesChanged = filesMatch[1];
        if (additionsMatch) stats.additions = additionsMatch[1];
        if (deletionsMatch) stats.deletions = deletionsMatch[1];
        
        return stats;
    }
    
    /**
     * Extract highlights from release body
     */
    extractHighlights(body) {
        const highlights = [];
        
        // Look for feature lists with bullets or dashes
        const bulletPoints = body.match(/^[\*\-•]\s+(.+)$/gm) || [];
        
        // Take first 3-5 bullet points as highlights
        bulletPoints.slice(0, 4).forEach(point => {
            const cleaned = point.replace(/^[\*\-•]\s+/, '').trim();
            if (cleaned.length > 0 && cleaned.length < 100) {
                highlights.push(cleaned);
            }
        });
        
        // If no bullet points, look for "Features:" or "Highlights:" sections
        if (highlights.length === 0) {
            const featuresMatch = body.match(/(?:features?|highlights?):\s*\n((?:.*\n){1,5})/i);
            if (featuresMatch) {
                const lines = featuresMatch[1].split('\n')
                    .filter(line => line.trim())
                    .slice(0, 3)
                    .map(line => line.replace(/^[\*\-•\s]+/, '').trim());
                highlights.push(...lines);
            }
        }
        
        return highlights;
    }
    
    /**
     * Format date for display
     */
    formatDate(dateString) {
        const date = new Date(dateString);
        const options = {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
        };
        return date.toLocaleString('en-US', options);
    }
    
    /**
     * Send message to Slack webhook
     */
    async sendToSlack(message) {
        return new Promise((resolve, reject) => {
            const webhookUrl = new URL(this.webhookUrl);
            
            const options = {
                hostname: webhookUrl.hostname,
                path: webhookUrl.pathname,
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
                        resolve({ success: true, response: data });
                    } else {
                        reject(new Error(`Slack API error: ${res.statusCode} - ${data}`));
                    }
                });
            });
            
            req.on('error', (error) => {
                reject(error);
            });
            
            req.write(JSON.stringify(message));
            req.end();
        });
    }
}

// CLI execution
if (require.main === module) {
    const args = process.argv.slice(2);
    const params = {};
    
    // Parse command line arguments
    for (let i = 0; i < args.length; i += 2) {
        const key = args[i].replace(/^--/, '');
        const value = args[i + 1];
        params[key] = value;
    }
    
    // Validate required parameters
    if (!params.version) {
        console.error('Error: --version parameter is required');
        console.error('Usage: node slack-release-notifier.js --version v1.0.0 --title "Title" --body "Body" --url "URL"');
        process.exit(1);
    }
    
    // Create notifier instance
    const notifier = new SlackReleaseNotifier({
        projectName: params.projectName,
        url: params.url,
        repoUrl: params.repoUrl
    });
    
    // Send notification
    notifier.sendReleaseNotification({
        version: params.version,
        title: params.title || `Release ${params.version}`,
        body: params.body || '',
        url: params.url,
        author: params.author || process.env.GITHUB_ACTOR || 'Claude Code',
        createdAt: params.createdAt || new Date().toISOString(),
        isDraft: params.draft === 'true',
        isPrerelease: params.prerelease === 'true'
    })
    .then(result => {
        console.log('✅ Slack notification sent successfully!');
        process.exit(0);
    })
    .catch(error => {
        console.error('❌ Failed to send Slack notification:', error.message);
        process.exit(1);
    });
}

module.exports = SlackReleaseNotifier;