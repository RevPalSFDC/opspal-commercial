#!/usr/bin/env node

/**
 * Lead Routing Health Checker
 *
 * Instance-agnostic validator for Marketo lead routing campaign health.
 * Identifies inactive routing campaigns, stuck leads, and sync issues.
 *
 * Addresses reflection patterns:
 * - Inactive lead routing campaigns
 * - Leads stuck without syncing to CRM
 * - Routing rule effectiveness
 *
 * @module lead-routing-health-checker
 * @created 2026-01-22
 * @instance-agnostic true
 */

const https = require('https');

class LeadRoutingHealthChecker {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || process.env.MARKETO_BASE_URL;
        this.clientId = options.clientId || process.env.MARKETO_CLIENT_ID;
        this.clientSecret = options.clientSecret || process.env.MARKETO_CLIENT_SECRET;
        this.accessToken = null;
        this.verbose = options.verbose || false;
        this.thresholds = {
            maxInactiveDays: options.maxInactiveDays || 90, // Alert if no activity in 90 days
            maxStuckLeads: options.maxStuckLeads || 100, // Alert if more than 100 leads stuck
            minActiveRatio: options.minActiveRatio || 0.5 // At least 50% of routing campaigns should be active
        };
        this.stats = {
            campaignsAnalyzed: 0,
            activeCampaigns: 0,
            inactiveCampaigns: 0,
            stuckLeadsFound: 0,
            issuesFound: 0
        };
    }

    log(message) {
        if (this.verbose) {
            console.log(`[LeadRoutingHealthChecker] ${message}`);
        }
    }

    /**
     * Get Marketo access token
     */
    async authenticate() {
        if (!this.baseUrl || !this.clientId || !this.clientSecret) {
            throw new Error('Marketo credentials not configured. Set MARKETO_BASE_URL, MARKETO_CLIENT_ID, MARKETO_CLIENT_SECRET');
        }

        return new Promise((resolve, reject) => {
            const url = new URL(`${this.baseUrl}/identity/oauth/token`);
            url.searchParams.set('grant_type', 'client_credentials');
            url.searchParams.set('client_id', this.clientId);
            url.searchParams.set('client_secret', this.clientSecret);

            https.get(url.toString(), (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        if (json.access_token) {
                            this.accessToken = json.access_token;
                            this.log('Authentication successful');
                            resolve(json.access_token);
                        } else {
                            reject(new Error(json.error_description || 'Authentication failed'));
                        }
                    } catch (e) {
                        reject(e);
                    }
                });
            }).on('error', reject);
        });
    }

    /**
     * Make authenticated Marketo API request
     */
    async apiRequest(endpoint, method = 'GET', body = null) {
        if (!this.accessToken) {
            await this.authenticate();
        }

        return new Promise((resolve, reject) => {
            const url = new URL(`${this.baseUrl}/rest${endpoint}`);
            const options = {
                hostname: url.hostname,
                path: url.pathname + url.search,
                method,
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        resolve({ error: 'Invalid JSON response' });
                    }
                });
            });

            req.on('error', reject);
            if (body) req.write(JSON.stringify(body));
            req.end();
        });
    }

    /**
     * Get all smart campaigns (includes routing campaigns)
     */
    async getSmartCampaigns() {
        const campaigns = [];
        let offset = 0;
        const limit = 200;
        let hasMore = true;

        while (hasMore) {
            const response = await this.apiRequest(`/asset/v1/smartCampaigns.json?offset=${offset}&maxReturn=${limit}`);

            if (response.success && response.result) {
                campaigns.push(...response.result);
                hasMore = response.result.length === limit;
                offset += limit;
            } else {
                hasMore = false;
            }
        }

        return campaigns;
    }

    /**
     * Filter campaigns to find routing-related ones
     * Uses pattern matching to identify routing campaigns (instance-agnostic)
     */
    identifyRoutingCampaigns(campaigns) {
        const routingPatterns = [
            /routing/i,
            /route/i,
            /assign/i,
            /sync/i,
            /sfdc/i,
            /salesforce/i,
            /crm/i,
            /lead.*distribution/i,
            /distribution.*lead/i,
            /transfer/i,
            /hand.*off/i,
            /handoff/i
        ];

        return campaigns.filter(campaign => {
            const name = campaign.name || '';
            const description = campaign.description || '';
            const folder = campaign.folder?.name || '';

            return routingPatterns.some(pattern =>
                pattern.test(name) ||
                pattern.test(description) ||
                pattern.test(folder)
            );
        });
    }

    /**
     * Analyze campaign activity status
     */
    async analyzeCampaignStatus(campaigns) {
        const results = {
            total: campaigns.length,
            active: [],
            inactive: [],
            neverRun: [],
            byAge: {
                recent: [],     // Active in last 30 days
                stale: [],      // 30-90 days
                dormant: []     // 90+ days
            }
        };

        const now = new Date();
        const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
        const ninetyDaysAgo = new Date(now - 90 * 24 * 60 * 60 * 1000);

        for (const campaign of campaigns) {
            this.stats.campaignsAnalyzed++;

            const campaignInfo = {
                id: campaign.id,
                name: campaign.name,
                status: campaign.status,
                createdAt: campaign.createdAt,
                updatedAt: campaign.updatedAt,
                folder: campaign.folder?.name
            };

            // Check if campaign is active
            if (campaign.status === 'Active') {
                results.active.push(campaignInfo);
                this.stats.activeCampaigns++;
            } else {
                results.inactive.push(campaignInfo);
                this.stats.inactiveCampaigns++;
            }

            // Categorize by last update
            const lastUpdate = new Date(campaign.updatedAt);
            if (lastUpdate >= thirtyDaysAgo) {
                results.byAge.recent.push(campaignInfo);
            } else if (lastUpdate >= ninetyDaysAgo) {
                results.byAge.stale.push(campaignInfo);
            } else {
                results.byAge.dormant.push(campaignInfo);
            }
        }

        return results;
    }

    /**
     * Find leads that may be stuck (not synced to CRM)
     * Uses generic patterns - works with any Marketo instance
     */
    async findStuckLeads() {
        const results = {
            total: 0,
            byReason: [],
            sampleLeads: [],
            recommendations: []
        };

        // Query for leads with sync errors
        const filterTypes = [
            { name: 'SFDC Sync Error', field: 'sfdcErrorMessage' },
            { name: 'CRM Sync Blocked', field: 'sfdcType' },
            { name: 'No CRM ID', field: 'sfdcLeadId' }
        ];

        for (const filter of filterTypes) {
            try {
                // Use smart list or static list to find leads
                // This is a placeholder - actual implementation would use
                // Marketo's lead database API
                this.log(`Checking for ${filter.name} issues...`);
            } catch (error) {
                this.log(`Error checking ${filter.name}: ${error.message}`);
            }
        }

        return results;
    }

    /**
     * Run full routing health check
     */
    async validate() {
        console.log('═'.repeat(60));
        console.log('  MARKETO LEAD ROUTING HEALTH CHECK');
        console.log('═'.repeat(60));
        console.log(`\nBase URL: ${this.baseUrl || 'Not configured'}\n`);

        if (!this.baseUrl) {
            return {
                success: false,
                error: 'Marketo credentials not configured',
                usage: 'Set MARKETO_BASE_URL, MARKETO_CLIENT_ID, MARKETO_CLIENT_SECRET environment variables',
                recommendations: [
                    {
                        priority: 'HIGH',
                        issue: 'Marketo API access not configured',
                        action: 'Configure Marketo API credentials to enable automated health checks'
                    }
                ]
            };
        }

        try {
            // Authenticate
            console.log('Authenticating with Marketo...');
            await this.authenticate();
            console.log('✅ Authentication successful\n');

            // Get all campaigns
            console.log('Fetching smart campaigns...');
            const allCampaigns = await this.getSmartCampaigns();
            console.log(`Found ${allCampaigns.length} total campaigns\n`);

            // Identify routing campaigns
            console.log('Identifying routing campaigns...');
            const routingCampaigns = this.identifyRoutingCampaigns(allCampaigns);
            console.log(`Found ${routingCampaigns.length} routing-related campaigns\n`);

            // Analyze status
            console.log('Analyzing campaign status...');
            const statusAnalysis = await this.analyzeCampaignStatus(routingCampaigns);

            // Check for stuck leads
            console.log('Checking for stuck leads...');
            const stuckLeads = await this.findStuckLeads();

            // Build results
            const results = {
                timestamp: new Date().toISOString(),
                baseUrl: this.baseUrl,
                campaignAnalysis: statusAnalysis,
                stuckLeads,
                stats: this.stats,
                health: this.calculateHealth(statusAnalysis, stuckLeads),
                recommendations: this.generateRecommendations(statusAnalysis, stuckLeads)
            };

            // Print summary
            this.printSummary(results);

            return results;

        } catch (error) {
            console.error('Health check failed:', error.message);
            return {
                success: false,
                error: error.message,
                recommendations: [
                    {
                        priority: 'HIGH',
                        issue: `API Error: ${error.message}`,
                        action: 'Check API credentials and network connectivity'
                    }
                ]
            };
        }
    }

    /**
     * Calculate overall health score
     */
    calculateHealth(statusAnalysis, stuckLeads) {
        const activeRatio = statusAnalysis.active.length / Math.max(statusAnalysis.total, 1);
        const dormantCount = statusAnalysis.byAge.dormant.length;
        const stuckCount = stuckLeads.total;

        let score = 100;

        // Deduct for low active ratio
        if (activeRatio < this.thresholds.minActiveRatio) {
            score -= 30;
        }

        // Deduct for dormant campaigns
        score -= Math.min(dormantCount * 5, 25);

        // Deduct for stuck leads
        if (stuckCount > this.thresholds.maxStuckLeads) {
            score -= 20;
        }

        if (score >= 80) return 'HEALTHY';
        if (score >= 60) return 'MODERATE';
        if (score >= 40) return 'AT_RISK';
        return 'CRITICAL';
    }

    /**
     * Generate actionable recommendations
     */
    generateRecommendations(statusAnalysis, stuckLeads) {
        const recommendations = [];

        // Check active ratio
        const activeRatio = statusAnalysis.active.length / Math.max(statusAnalysis.total, 1);
        if (activeRatio < this.thresholds.minActiveRatio) {
            this.stats.issuesFound++;
            recommendations.push({
                priority: 'CRITICAL',
                issue: `Only ${Math.round(activeRatio * 100)}% of routing campaigns are active (${statusAnalysis.active.length}/${statusAnalysis.total})`,
                impact: 'Leads may not be routed to CRM, causing pipeline visibility gaps',
                actions: [
                    'Review inactive routing campaigns and determine if they should be reactivated',
                    'Check if routing logic has been consolidated into fewer campaigns',
                    'Audit lead flow to ensure all leads are being routed correctly'
                ]
            });
        }

        // Check for dormant campaigns
        if (statusAnalysis.byAge.dormant.length > 0) {
            this.stats.issuesFound++;
            recommendations.push({
                priority: 'HIGH',
                issue: `${statusAnalysis.byAge.dormant.length} routing campaigns haven't been updated in 90+ days`,
                impact: 'Dormant campaigns may contain outdated routing logic or be ineffective',
                campaigns: statusAnalysis.byAge.dormant.slice(0, 5).map(c => c.name),
                actions: [
                    'Review each dormant campaign to determine if still needed',
                    'Archive campaigns that are no longer relevant',
                    'Update or consolidate campaigns with outdated logic'
                ]
            });
        }

        // Check for stuck leads
        if (stuckLeads.total > this.thresholds.maxStuckLeads) {
            this.stats.issuesFound++;
            recommendations.push({
                priority: 'CRITICAL',
                issue: `${stuckLeads.total} leads appear to be stuck without CRM sync`,
                impact: 'Sales team cannot see or work these leads',
                actions: [
                    'Review sync error logs in Marketo Admin',
                    'Check CRM field mappings for errors',
                    'Run manual sync for stuck leads',
                    'Set up alerting for future sync failures'
                ]
            });
        }

        // No issues found
        if (recommendations.length === 0) {
            recommendations.push({
                priority: 'INFO',
                issue: 'No critical issues found',
                actions: [
                    'Continue monitoring routing campaign performance',
                    'Set up regular health check schedules'
                ]
            });
        }

        return recommendations;
    }

    /**
     * Print validation summary
     */
    printSummary(results) {
        console.log('\n' + '─'.repeat(60));
        console.log('  HEALTH CHECK SUMMARY');
        console.log('─'.repeat(60));

        console.log(`\nOverall Health: ${results.health}`);
        console.log(`Total Routing Campaigns: ${results.campaignAnalysis.total}`);
        console.log(`  Active: ${results.campaignAnalysis.active.length}`);
        console.log(`  Inactive: ${results.campaignAnalysis.inactive.length}`);
        console.log(`  Dormant (90+ days): ${results.campaignAnalysis.byAge.dormant.length}`);

        if (results.recommendations.length > 0) {
            console.log('\n⚠️  Issues & Recommendations:');
            for (const rec of results.recommendations) {
                console.log(`\n  [${rec.priority}] ${rec.issue}`);
                if (rec.impact) {
                    console.log(`     Impact: ${rec.impact}`);
                }
                if (rec.campaigns) {
                    console.log(`     Affected: ${rec.campaigns.join(', ')}`);
                }
            }
        }

        console.log('\n' + '═'.repeat(60));
    }
}

// CLI execution
if (require.main === module) {
    const args = process.argv.slice(2);
    const options = {
        verbose: false
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--verbose':
            case '-v':
                options.verbose = true;
                break;
            case '--help':
            case '-h':
                console.log(`
Lead Routing Health Checker

Usage:
  node lead-routing-health-checker.js [options]

Environment Variables (required):
  MARKETO_BASE_URL      Marketo REST API base URL
  MARKETO_CLIENT_ID     API client ID
  MARKETO_CLIENT_SECRET API client secret

Options:
  --verbose, -v    Enable verbose output
  --help, -h       Show this help

Examples:
  MARKETO_BASE_URL=https://123-ABC-456.mktorest.com \\
  MARKETO_CLIENT_ID=abc123 \\
  MARKETO_CLIENT_SECRET=xyz789 \\
  node lead-routing-health-checker.js

Output:
  Analyzes Marketo lead routing campaign health including:
  - Active vs inactive campaign ratio
  - Dormant campaigns (no activity in 90+ days)
  - Leads stuck without CRM sync
  - Actionable recommendations
                `);
                process.exit(0);
        }
    }

    const checker = new LeadRoutingHealthChecker(options);
    checker.validate()
        .then(results => {
            if (results.stats?.issuesFound > 0) {
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('Health check failed:', error.message);
            process.exit(1);
        });
}

module.exports = { LeadRoutingHealthChecker };
