#!/usr/bin/env node

/**
 * Automated Dashboard Refresh System
 * Works with existing SF CLI OAuth - no JWT needed!
 * Schedules and monitors dashboard refreshes across all instances
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const execAsync = promisify(exec);
const ReportsAPIClass = require('./lib/reports-rest-api');

class DashboardRefreshSystem {
    constructor() {
        this.configFile = path.join(__dirname, '..', 'config', 'dashboard-refresh-config.json');
        this.logDir = path.join(__dirname, '..', 'logs', 'dashboard-refresh');
        this.config = {
            refreshInterval: 3600000, // 1 hour default
            maxConcurrent: 3,
            retryAttempts: 3,
            notifyOnError: true,
            dashboards: []
        };
        this.activeRefreshes = new Map();
        this.refreshHistory = [];
        this.loadConfig();
    }

    /**
     * Load configuration
     */
    async loadConfig() {
        try {
            const configData = await fs.readFile(this.configFile, 'utf8');
            this.config = { ...this.config, ...JSON.parse(configData) };
        } catch (error) {
            // Config doesn't exist yet, will create on save
            console.log('No existing config found, using defaults');
        }
        
        // Ensure log directory exists
        await fs.mkdir(this.logDir, { recursive: true });
    }

    /**
     * Save configuration
     */
    async saveConfig() {
        await fs.mkdir(path.dirname(this.configFile), { recursive: true });
        await fs.writeFile(this.configFile, JSON.stringify(this.config, null, 2));
    }

    /**
     * Get authenticated orgs from SF CLI
     */
    async getAuthenticatedOrgs() {
        try {
            const { stdout } = await execAsync('sf org list --json');
            const orgs = JSON.parse(stdout);
            
            const allOrgs = [
                ...(orgs.result.sandboxes || []),
                ...(orgs.result.nonScratchOrgs || []),
                ...(orgs.result.scratchOrgs || [])
            ];
            
            return allOrgs.map(org => ({
                alias: org.alias || org.username,
                username: org.username,
                instanceUrl: org.instanceUrl,
                isDefault: org.isDefaultUsername || false,
                orgId: org.orgId,
                expirationDate: org.expirationDate
            }));
        } catch (error) {
            console.error('Failed to get authenticated orgs:', error.message);
            return [];
        }
    }

    /**
     * Discover dashboards in an org
     */
    async discoverDashboards(orgAlias) {
        try {
            console.log(`Discovering dashboards in ${orgAlias}...`);
            
            const query = `
                SELECT Id, Title, DeveloperName, FolderName, 
                       Description, Type, LastModifiedDate,
                       RunningUser.Name, LastRefreshDate
                FROM Dashboard 
                ORDER BY FolderName, Title
            `;
            
            const { stdout } = await execAsync(
                `sf data query --query "${query}" --target-org ${orgAlias} --json`
            );
            
            const result = JSON.parse(stdout);
            
            if (!result.result || !result.result.records) {
                return [];
            }
            
            return result.result.records.map(dashboard => ({
                id: dashboard.Id,
                title: dashboard.Title,
                developerName: dashboard.DeveloperName,
                folder: dashboard.FolderName,
                description: dashboard.Description,
                type: dashboard.Type,
                lastModified: dashboard.LastModifiedDate,
                runningUser: dashboard.RunningUser?.Name,
                lastRefresh: dashboard.LastRefreshDate,
                org: orgAlias
            }));
        } catch (error) {
            console.error(`Failed to discover dashboards in ${orgAlias}:`, error.message);
            return [];
        }
    }

    /**
     * Add dashboard to refresh schedule
     */
    async addDashboard(orgAlias, dashboardId, options = {}) {
        const dashboard = {
            id: dashboardId,
            org: orgAlias,
            enabled: options.enabled !== false,
            interval: options.interval || this.config.refreshInterval,
            filters: options.filters || [],
            notifyOnComplete: options.notifyOnComplete || false,
            lastRefresh: null,
            nextRefresh: new Date(Date.now() + (options.interval || this.config.refreshInterval)),
            refreshCount: 0,
            errorCount: 0
        };
        
        // Check if already exists
        const existingIndex = this.config.dashboards.findIndex(
            d => d.id === dashboardId && d.org === orgAlias
        );
        
        if (existingIndex >= 0) {
            this.config.dashboards[existingIndex] = dashboard;
        } else {
            this.config.dashboards.push(dashboard);
        }
        
        await this.saveConfig();
        
        console.log(`Added dashboard ${dashboardId} from ${orgAlias} to refresh schedule`);
        
        // Start scheduling if not already running
        if (dashboard.enabled) {
            this.scheduleDashboard(dashboard);
        }
        
        return dashboard;
    }

    /**
     * Refresh a specific dashboard
     */
    async refreshDashboard(dashboard) {
        const startTime = Date.now();
        const refreshId = `${dashboard.org}_${dashboard.id}_${startTime}`;
        
        try {
            console.log(`Refreshing dashboard ${dashboard.id} in ${dashboard.org}...`);
            
            this.activeRefreshes.set(refreshId, {
                dashboard,
                startTime,
                status: 'running'
            });
            
            // Use the existing OAuth through SF CLI
            const { stdout: authStdout } = await execAsync(
                `sf org display --target-org ${dashboard.org} --json`
            );
            const authData = JSON.parse(authStdout);
            
            if (!authData.result || !authData.result.accessToken) {
                throw new Error('Failed to get access token from SF CLI');
            }
            
            const { accessToken, instanceUrl } = authData.result;
            
            // Call Salesforce REST API to refresh dashboard
            const https = require('https');
            const url = require('url');
            
            const parsedUrl = url.parse(instanceUrl);
            const apiPath = `/services/data/v64.0/analytics/dashboards/${dashboard.id}/refresh`;
            
            const refreshResult = await new Promise((resolve, reject) => {
                const options = {
                    hostname: parsedUrl.hostname,
                    port: 443,
                    path: apiPath,
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    }
                };
                
                const req = https.request(options, (res) => {
                    let data = '';
                    res.on('data', (chunk) => { data += chunk; });
                    res.on('end', () => {
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve({ success: true, data: data ? JSON.parse(data) : {} });
                        } else {
                            reject(new Error(`API Error (${res.statusCode}): ${data}`));
                        }
                    });
                });
                
                req.on('error', reject);
                
                // Send request body if we have filters
                if (dashboard.filters && dashboard.filters.length > 0) {
                    req.write(JSON.stringify({ filters: dashboard.filters }));
                }
                
                req.end();
            });
            
            const duration = Date.now() - startTime;
            
            // Update dashboard info
            dashboard.lastRefresh = new Date().toISOString();
            dashboard.nextRefresh = new Date(Date.now() + dashboard.interval);
            dashboard.refreshCount++;
            
            // Log success
            await this.logRefresh({
                refreshId,
                dashboard: dashboard.id,
                org: dashboard.org,
                status: 'success',
                duration,
                timestamp: new Date().toISOString()
            });
            
            this.activeRefreshes.delete(refreshId);
            
            console.log(`✓ Dashboard refresh complete in ${(duration / 1000).toFixed(2)}s`);
            
            return refreshResult;
            
        } catch (error) {
            dashboard.errorCount++;
            
            // Log error
            await this.logRefresh({
                refreshId,
                dashboard: dashboard.id,
                org: dashboard.org,
                status: 'error',
                error: error.message,
                timestamp: new Date().toISOString()
            });
            
            this.activeRefreshes.delete(refreshId);
            
            console.error(`✗ Dashboard refresh failed: ${error.message}`);
            
            // Retry logic
            if (dashboard.errorCount < this.config.retryAttempts) {
                console.log(`Retrying in 30 seconds... (attempt ${dashboard.errorCount}/${this.config.retryAttempts})`);
                setTimeout(() => this.refreshDashboard(dashboard), 30000);
            }
            
            throw error;
        }
    }

    /**
     * Optional: Clone and patch a dashboard (metric only) behind flag
     */
    async cloneAndPatchMetric({ orgAlias, templateDashboardId, folderId, metricReportId, name }) {
        if (process.env.DASHBOARD_EDIT_ENABLED !== 'true') {
            throw new Error('DASHBOARD_EDIT_ENABLED flag is not set');
        }
        const api = await ReportsAPIClass.fromSFAuth(orgAlias);
        const clone = await api.cloneDashboard(templateDashboardId, name || `Edited-${Date.now()}`, folderId);
        const payload = {
            components: [
                { componentId: 'm1', type: 'metric', header: 'Closed Won QTD', reportId: metricReportId, row: 0, column: 0, colspan: 4, rowspan: 2 }
            ]
        };
        await api.updateDashboard(clone.id, payload);
        return clone.id;
    }

    /**
     * Schedule dashboard refresh
     */
    scheduleDashboard(dashboard) {
        if (!dashboard.enabled) return;
        
        const timeUntilRefresh = new Date(dashboard.nextRefresh).getTime() - Date.now();
        
        if (timeUntilRefresh <= 0) {
            // Refresh immediately
            this.refreshDashboard(dashboard).catch(console.error);
        } else {
            // Schedule for later
            setTimeout(() => {
                this.refreshDashboard(dashboard)
                    .then(() => this.scheduleDashboard(dashboard))
                    .catch(console.error);
            }, Math.min(timeUntilRefresh, 2147483647)); // Max timeout value
        }
    }

    /**
     * Start refresh system
     */
    async start() {
        console.log('Starting Dashboard Refresh System...');
        
        await this.loadConfig();
        
        // Schedule all enabled dashboards
        this.config.dashboards
            .filter(d => d.enabled)
            .forEach(d => this.scheduleDashboard(d));
        
        console.log(`Scheduled ${this.config.dashboards.filter(d => d.enabled).length} dashboards for refresh`);
        
        // Start monitoring
        this.startMonitoring();
    }

    /**
     * Start monitoring system
     */
    startMonitoring() {
        // Status check every minute
        setInterval(() => {
            this.printStatus();
        }, 60000);
        
        // Save config every 5 minutes
        setInterval(() => {
            this.saveConfig().catch(console.error);
        }, 300000);
    }

    /**
     * Print current status
     */
    printStatus() {
        console.log('\n=== Dashboard Refresh Status ===');
        console.log(`Active Refreshes: ${this.activeRefreshes.size}`);
        console.log(`Scheduled Dashboards: ${this.config.dashboards.filter(d => d.enabled).length}`);
        
        // Show next refreshes
        const upcoming = this.config.dashboards
            .filter(d => d.enabled)
            .sort((a, b) => new Date(a.nextRefresh) - new Date(b.nextRefresh))
            .slice(0, 5);
        
        if (upcoming.length > 0) {
            console.log('\nNext Refreshes:');
            upcoming.forEach(d => {
                const timeUntil = new Date(d.nextRefresh) - new Date();
                const minutes = Math.floor(timeUntil / 60000);
                console.log(`  • ${d.org}/${d.id}: in ${minutes} minutes`);
            });
        }
        
        // Show recent errors
        const recentErrors = this.config.dashboards
            .filter(d => d.errorCount > 0)
            .slice(0, 3);
        
        if (recentErrors.length > 0) {
            console.log('\nRecent Errors:');
            recentErrors.forEach(d => {
                console.log(`  • ${d.org}/${d.id}: ${d.errorCount} errors`);
            });
        }
    }

    /**
     * Log refresh attempt
     */
    async logRefresh(entry) {
        const logFile = path.join(
            this.logDir,
            `refresh-${new Date().toISOString().split('T')[0]}.jsonl`
        );
        
        await fs.appendFile(logFile, JSON.stringify(entry) + '\n');
        
        // Keep in memory for recent history
        this.refreshHistory.push(entry);
        if (this.refreshHistory.length > 1000) {
            this.refreshHistory.shift();
        }
    }

    /**
     * Get refresh statistics
     */
    async getStatistics(orgAlias) {
        const stats = {
            total: 0,
            successful: 0,
            failed: 0,
            averageDuration: 0,
            dashboards: {}
        };
        
        // Read recent log files
        const files = await fs.readdir(this.logDir);
        const logFiles = files.filter(f => f.startsWith('refresh-')).slice(-7); // Last 7 days
        
        for (const file of logFiles) {
            const content = await fs.readFile(path.join(this.logDir, file), 'utf8');
            const lines = content.trim().split('\n');
            
            for (const line of lines) {
                try {
                    const entry = JSON.parse(line);
                    
                    if (orgAlias && entry.org !== orgAlias) continue;
                    
                    stats.total++;
                    
                    if (entry.status === 'success') {
                        stats.successful++;
                        stats.averageDuration += entry.duration || 0;
                    } else {
                        stats.failed++;
                    }
                    
                    // Per-dashboard stats
                    const key = `${entry.org}/${entry.dashboard}`;
                    if (!stats.dashboards[key]) {
                        stats.dashboards[key] = {
                            total: 0,
                            successful: 0,
                            failed: 0
                        };
                    }
                    
                    stats.dashboards[key].total++;
                    if (entry.status === 'success') {
                        stats.dashboards[key].successful++;
                    } else {
                        stats.dashboards[key].failed++;
                    }
                } catch (e) {
                    // Skip invalid lines
                }
            }
        }
        
        if (stats.successful > 0) {
            stats.averageDuration = Math.round(stats.averageDuration / stats.successful);
        }
        
        stats.successRate = stats.total > 0 
            ? ((stats.successful / stats.total) * 100).toFixed(1) + '%'
            : '0%';
        
        return stats;
    }

    /**
     * Interactive setup wizard
     */
    async setupWizard() {
        console.log('\n=== Dashboard Refresh Setup Wizard ===\n');
        
        // Get authenticated orgs
        const orgs = await this.getAuthenticatedOrgs();
        
        if (orgs.length === 0) {
            console.error('No authenticated orgs found. Please run: sf org login');
            return;
        }
        
        console.log('Found authenticated orgs:');
        orgs.forEach((org, index) => {
            console.log(`  ${index + 1}. ${org.alias} (${org.username})`);
        });
        
        // For each org, discover dashboards
        for (const org of orgs) {
            console.log(`\nDiscovering dashboards in ${org.alias}...`);
            const dashboards = await this.discoverDashboards(org.alias);
            
            if (dashboards.length === 0) {
                console.log('  No dashboards found');
                continue;
            }
            
            console.log(`  Found ${dashboards.length} dashboards`);
            
            // Show top dashboards
            const topDashboards = dashboards.slice(0, 5);
            topDashboards.forEach(d => {
                console.log(`    • ${d.title} (${d.folder})`);
            });
            
            if (dashboards.length > 5) {
                console.log(`    ... and ${dashboards.length - 5} more`);
            }
        }
        
        console.log('\nSetup complete! Configuration saved.');
        console.log('To add dashboards to refresh schedule, use:');
        console.log('  node dashboard-refresh-system.js add <org> <dashboardId>');
    }
}

// CLI Interface
if (require.main === module) {
    const system = new DashboardRefreshSystem();
    const args = process.argv.slice(2);
    const command = args[0];
    
    (async () => {
        try {
            switch (command) {
                case 'start':
                    await system.start();
                    // Keep process running
                    process.on('SIGINT', () => {
                        console.log('\nShutting down...');
                        process.exit(0);
                    });
                    break;
                
                case 'setup':
                    await system.setupWizard();
                    break;
                
                case 'discover':
                    const discoverOrg = args[1];
                    if (!discoverOrg) {
                        console.error('Usage: discover <org>');
                        process.exit(1);
                    }
                    const dashboards = await system.discoverDashboards(discoverOrg);
                    console.log(JSON.stringify(dashboards, null, 2));
                    break;
                
                case 'add':
                    const addOrg = args[1];
                    const dashboardId = args[2];
                    if (!addOrg || !dashboardId) {
                        console.error('Usage: add <org> <dashboardId> [--interval <ms>]');
                        process.exit(1);
                    }
                    
                    const interval = args.includes('--interval') 
                        ? parseInt(args[args.indexOf('--interval') + 1])
                        : undefined;
                    
                    await system.addDashboard(addOrg, dashboardId, { interval });
                    break;
                
                case 'list':
                    console.log('Scheduled Dashboards:');
                    system.config.dashboards.forEach(d => {
                        const status = d.enabled ? '✓' : '✗';
                        console.log(`  ${status} ${d.org}/${d.id} - Every ${d.interval / 60000} minutes`);
                    });
                    break;
                
                case 'stats':
                    const statsOrg = args[1];
                    const stats = await system.getStatistics(statsOrg);
                    console.log('Refresh Statistics:');
                    console.log(`  Total: ${stats.total}`);
                    console.log(`  Success Rate: ${stats.successRate}`);
                    console.log(`  Average Duration: ${stats.averageDuration}ms`);
                    break;
                
                case 'refresh':
                    const refreshOrg = args[1];
                    const refreshDashboard = args[2];
                    if (!refreshOrg || !refreshDashboard) {
                        console.error('Usage: refresh <org> <dashboardId>');
                        process.exit(1);
                    }
                    
                    await system.refreshDashboard({
                        org: refreshOrg,
                        id: refreshDashboard,
                        filters: []
                    });
                    break;

                case 'edit': {
                    if (process.env.DASHBOARD_EDIT_ENABLED !== 'true') {
                        console.error('Set DASHBOARD_EDIT_ENABLED=true to enable editing');
                        process.exit(1);
                    }
                    const org = args[1];
                    const templateId = args[2];
                    const folderId = args[3];
                    const metricReportId = args[4] || process.env.REPORT_ID_CW_SUM_QTD;
                    if (!org || !templateId || !folderId || !metricReportId) {
                        console.error('Usage: edit <org> <templateDashboardId> <folderId> [metricReportId]');
                        process.exit(1);
                    }
                    const newId = await system.cloneAndPatchMetric({ orgAlias: org, templateDashboardId: templateId, folderId, metricReportId });
                    console.log(`Cloned & patched dashboard: ${newId}`);
                    break;
                }
                
                default:
                    console.log(`
Dashboard Refresh System - Using SF CLI OAuth

Usage:
  node dashboard-refresh-system.js <command> [options]

Commands:
  setup              Interactive setup wizard
  start              Start the refresh system
  discover <org>     Discover dashboards in an org
  add <org> <id>     Add dashboard to refresh schedule
  list               List scheduled dashboards
  stats [org]        Show refresh statistics
  refresh <org> <id> Manually refresh a dashboard

Options:
  --interval <ms>    Refresh interval in milliseconds

Examples:
  node dashboard-refresh-system.js setup
  node dashboard-refresh-system.js discover delta-sandbox
  node dashboard-refresh-system.js add delta-sandbox 01Z5g00000ABCDE --interval 3600000
  node dashboard-refresh-system.js start

No JWT needed - uses your existing SF CLI authentication!
                    `);
            }
        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    })();
}

module.exports = DashboardRefreshSystem;
