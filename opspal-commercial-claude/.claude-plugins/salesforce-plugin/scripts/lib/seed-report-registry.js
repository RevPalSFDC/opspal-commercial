#!/usr/bin/env node

/**
 * Seed Report Registry
 * 
 * Manages a registry of known-good "seed" reports that can be cloned
 * for reliable report creation, especially for Activities reports.
 */

const fs = require('fs').promises;
const path = require('path');

class SeedReportRegistry {
    constructor(options = {}) {
        this.org = options.org || process.env.ORG;
        this.configFile = options.configFile || path.join(
            __dirname, 
            '../../config/seed-reports.json'
        );
        this.api = options.api; // ReportsRestAPI instance
        this.registry = null;
        this.autoDiscover = options.autoDiscover !== false;
    }

    /**
     * Initialize and load registry
     */
    async init() {
        await this.loadRegistry();
        
        if (this.autoDiscover && this.api) {
            await this.discoverSeeds();
        }
        
        return this;
    }

    /**
     * Load registry from file
     */
    async loadRegistry() {
        try {
            const data = await fs.readFile(this.configFile, 'utf8');
            this.registry = JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                // Create default registry
                this.registry = {
                    version: '1.0',
                    created: new Date().toISOString(),
                    global: {},
                    orgs: {}
                };
                await this.saveRegistry();
            } else {
                throw error;
            }
        }
        
        // Ensure org section exists
        if (!this.registry.orgs[this.org]) {
            this.registry.orgs[this.org] = {
                seeds: {},
                discovered: new Date().toISOString()
            };
        }
        
        return this.registry;
    }

    /**
     * Save registry to file
     */
    async saveRegistry() {
        const dir = path.dirname(this.configFile);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(
            this.configFile, 
            JSON.stringify(this.registry, null, 2)
        );
        return this.registry;
    }

    /**
     * Register a seed report
     */
    async registerSeed(templateKey, reportId, metadata = {}) {
        if (!this.registry) {
            await this.loadRegistry();
        }
        
        // Validate the report exists and is accessible
        if (this.api) {
            try {
                const endpoint = `/services/data/${this.api.apiVersion}/analytics/reports/${reportId}/describe`;
                const report = await this.api.apiRequest(endpoint);
                
                metadata.reportType = report.reportMetadata?.reportType?.type;
                metadata.format = report.reportMetadata?.reportFormat;
                metadata.name = report.reportMetadata?.name;
                metadata.verified = true;
                metadata.lastVerified = new Date().toISOString();
            } catch (error) {
                console.warn(`Unable to verify seed report ${reportId}: ${error.message}`);
                metadata.verified = false;
                metadata.error = error.message;
            }
        }
        
        // Store in both org-specific and global if it's a common type
        this.registry.orgs[this.org].seeds[templateKey] = {
            reportId,
            ...metadata,
            registered: new Date().toISOString()
        };
        
        // Add to global for common types
        const globalTypes = ['activities', 'opportunities', 'leads', 'contacts'];
        if (globalTypes.some(t => templateKey.toLowerCase().includes(t))) {
            if (!this.registry.global[templateKey]) {
                this.registry.global[templateKey] = [];
            }
            
            // Add if not already present
            const exists = this.registry.global[templateKey].find(
                s => s.reportId === reportId && s.org === this.org
            );
            
            if (!exists) {
                this.registry.global[templateKey].push({
                    reportId,
                    org: this.org,
                    reportType: metadata.reportType,
                    verified: metadata.verified
                });
            }
        }
        
        await this.saveRegistry();
        return this.registry.orgs[this.org].seeds[templateKey];
    }

    /**
     * Get seed report for template
     */
    async getSeed(templateKey) {
        if (!this.registry) {
            await this.loadRegistry();
        }
        
        // Check org-specific first
        const orgSeed = this.registry.orgs[this.org]?.seeds[templateKey];
        if (orgSeed && orgSeed.verified !== false) {
            return orgSeed;
        }
        
        // Check global registry
        const globalSeeds = this.registry.global[templateKey];
        if (globalSeeds && globalSeeds.length > 0) {
            // Prefer seeds from same org
            const samOrgSeed = globalSeeds.find(s => s.org === this.org);
            if (samOrgSeed) {
                return samOrgSeed;
            }
            
            // Return any verified seed
            return globalSeeds.find(s => s.verified !== false);
        }
        
        return null;
    }

    /**
     * Auto-discover seed reports from existing reports
     */
    async discoverSeeds() {
        if (!this.api) {
            throw new Error('API instance required for discovery');
        }
        
        console.log('🔍 Discovering seed reports...');
        
        try {
            // Get list of reports
            const endpoint = `/services/data/${this.api.apiVersion}/analytics/reports`;
            const reports = await this.api.apiRequest(endpoint);
            
            // Categorize reports by type
            const categories = {
                activities: ['task', 'event', 'activity', 'call', 'meeting'],
                opportunities: ['opportunity', 'pipeline', 'forecast'],
                leads: ['lead', 'prospect'],
                contacts: ['contact', 'person'],
                accounts: ['account', 'company'],
                cases: ['case', 'ticket', 'support']
            };
            
            const discovered = {};
            
            for (const [category, keywords] of Object.entries(categories)) {
                // Find reports matching keywords
                const matches = reports.filter(r => {
                    const name = (r.name || '').toLowerCase();
                    return keywords.some(k => name.includes(k));
                });
                
                if (matches.length > 0) {
                    // Prefer reports with certain patterns
                    const preferred = matches.find(r => 
                        r.name?.includes('Template') ||
                        r.name?.includes('Seed') ||
                        r.name?.includes('Master') ||
                        r.name?.includes('Base')
                    ) || matches[0];
                    
                    discovered[`${category}_seed`] = preferred.id;
                    
                    // Register the seed
                    await this.registerSeed(`${category}_seed`, preferred.id, {
                        discoveredFrom: preferred.name,
                        category
                    });
                    
                    console.log(`  ✓ Found ${category} seed: ${preferred.name}`);
                }
            }
            
            // Special discovery for Activities (most problematic)
            const activityReport = reports.find(r => {
                const name = (r.name || '').toLowerCase();
                return name.includes('activity') || 
                       name.includes('task') || 
                       name.includes('event');
            });
            
            if (activityReport) {
                await this.registerSeed('activities_master', activityReport.id, {
                    discoveredFrom: activityReport.name,
                    category: 'activities',
                    priority: 'high',
                    notes: 'Primary seed for Activities clone-and-patch'
                });
            }
            
            console.log(`✅ Discovered ${Object.keys(discovered).length} seed reports`);
            return discovered;
            
        } catch (error) {
            console.error('Failed to discover seeds:', error.message);
            return {};
        }
    }

    /**
     * Verify all registered seeds are still accessible
     */
    async verifySeeds() {
        if (!this.api) {
            throw new Error('API instance required for verification');
        }
        
        const results = {
            verified: [],
            failed: [],
            total: 0
        };
        
        // Verify org-specific seeds
        const orgSeeds = this.registry.orgs[this.org]?.seeds || {};
        
        for (const [key, seed] of Object.entries(orgSeeds)) {
            results.total++;
            
            try {
                const endpoint = `/services/data/${this.api.apiVersion}/analytics/reports/${seed.reportId}/describe`;
                await this.api.apiRequest(endpoint);
                
                seed.verified = true;
                seed.lastVerified = new Date().toISOString();
                delete seed.error;
                
                results.verified.push(key);
            } catch (error) {
                seed.verified = false;
                seed.error = error.message;
                seed.lastFailed = new Date().toISOString();
                
                results.failed.push({ key, error: error.message });
            }
        }
        
        await this.saveRegistry();
        
        console.log(`\n📊 Seed Verification Results:`);
        console.log(`  ✅ Verified: ${results.verified.length}/${results.total}`);
        if (results.failed.length > 0) {
            console.log(`  ❌ Failed: ${results.failed.length}`);
            results.failed.forEach(f => {
                console.log(`     - ${f.key}: ${f.error}`);
            });
        }
        
        return results;
    }

    /**
     * Get best seed for a report type
     */
    async getBestSeed(reportType) {
        // Map report types to seed categories
        const typeMap = {
            'Activity': 'activities_seed',
            'CaseActivity': 'activities_seed',
            'ContractActivity': 'activities_seed',
            'Task': 'activities_seed',
            'Event': 'activities_seed',
            'Opportunity': 'opportunities_seed',
            'LeadList': 'leads_seed',
            'ContactList': 'contacts_seed',
            'AccountList': 'accounts_seed',
            'CaseList': 'cases_seed'
        };
        
        const seedKey = typeMap[reportType];
        if (seedKey) {
            return await this.getSeed(seedKey);
        }
        
        // Try to find any seed with matching type
        const orgSeeds = this.registry.orgs[this.org]?.seeds || {};
        for (const [key, seed] of Object.entries(orgSeeds)) {
            if (seed.reportType === reportType && seed.verified !== false) {
                return seed;
            }
        }
        
        return null;
    }

    /**
     * Remove invalid seeds
     */
    async cleanInvalid() {
        const orgSeeds = this.registry.orgs[this.org]?.seeds || {};
        const removed = [];
        
        for (const [key, seed] of Object.entries(orgSeeds)) {
            if (seed.verified === false) {
                delete orgSeeds[key];
                removed.push(key);
            }
        }
        
        if (removed.length > 0) {
            await this.saveRegistry();
            console.log(`🧹 Removed ${removed.length} invalid seeds:`, removed);
        }
        
        return removed;
    }

    /**
     * Export registry for backup
     */
    async export() {
        const exportData = {
            ...this.registry,
            exported: new Date().toISOString(),
            org: this.org
        };
        
        const exportFile = path.join(
            path.dirname(this.configFile),
            `seed-reports-backup-${Date.now()}.json`
        );
        
        await fs.writeFile(exportFile, JSON.stringify(exportData, null, 2));
        return exportFile;
    }

    /**
     * CLI status display
     */
    displayStatus() {
        const orgSeeds = this.registry.orgs[this.org]?.seeds || {};
        const seedCount = Object.keys(orgSeeds).length;
        const verifiedCount = Object.values(orgSeeds).filter(s => s.verified).length;
        
        console.log('\n📚 Seed Report Registry Status');
        console.log('═'.repeat(50));
        console.log(`Org: ${this.org}`);
        console.log(`Total Seeds: ${seedCount}`);
        console.log(`Verified: ${verifiedCount}`);
        console.log(`Registry File: ${this.configFile}`);
        
        if (seedCount > 0) {
            console.log('\nRegistered Seeds:');
            for (const [key, seed] of Object.entries(orgSeeds)) {
                const status = seed.verified ? '✅' : '❌';
                console.log(`  ${status} ${key}: ${seed.reportId}`);
                if (seed.name) {
                    console.log(`     Name: ${seed.name}`);
                }
                if (seed.reportType) {
                    console.log(`     Type: ${seed.reportType}`);
                }
            }
        }
        
        const globalCount = Object.keys(this.registry.global).length;
        if (globalCount > 0) {
            console.log(`\nGlobal Templates: ${globalCount}`);
        }
    }
}

// CLI interface
async function main() {
    const command = process.argv[2];
    const org = process.env.ORG;
    
    if (!org) {
        console.error('❌ ORG environment variable not set');
        process.exit(1);
    }
    
    if (!command) {
        console.log(`
Seed Report Registry Manager

Usage:
  node seed-report-registry.js status              Show registry status
  node seed-report-registry.js discover            Auto-discover seed reports
  node seed-report-registry.js register <key> <id> Register a seed report
  node seed-report-registry.js get <key>           Get seed for template
  node seed-report-registry.js verify              Verify all seeds
  node seed-report-registry.js clean               Remove invalid seeds
  node seed-report-registry.js export              Export registry backup
  
Environment:
  ORG=${org}
`);
        return;
    }
    
    // Initialize registry (without API for CLI commands)
    const registry = new SeedReportRegistry({ org });
    await registry.init();
    
    switch (command) {
        case 'status':
            registry.displayStatus();
            break;
            
        case 'discover':
            // Need API for discovery
            const ReportsRestAPI = require('./reports-rest-api');
            const api = await ReportsRestAPI.fromSFAuth(org);
            registry.api = api;
            await registry.discoverSeeds();
            registry.displayStatus();
            break;
            
        case 'register':
            const key = process.argv[3];
            const reportId = process.argv[4];
            if (!key || !reportId) {
                console.error('Usage: register <key> <reportId>');
                process.exit(1);
            }
            await registry.registerSeed(key, reportId);
            console.log(`✅ Registered ${key} -> ${reportId}`);
            break;
            
        case 'get':
            const templateKey = process.argv[3];
            if (!templateKey) {
                console.error('Usage: get <templateKey>');
                process.exit(1);
            }
            const seed = await registry.getSeed(templateKey);
            if (seed) {
                console.log(JSON.stringify(seed, null, 2));
            } else {
                console.log(`No seed found for ${templateKey}`);
            }
            break;
            
        case 'verify':
            const ReportsAPI = require('./reports-rest-api');
            registry.api = await ReportsAPI.fromSFAuth(org);
            await registry.verifySeeds();
            break;
            
        case 'clean':
            const removed = await registry.cleanInvalid();
            console.log(`Removed ${removed.length} invalid seeds`);
            break;
            
        case 'export':
            const file = await registry.export();
            console.log(`✅ Exported to: ${file}`);
            break;
            
        default:
            console.error(`Unknown command: ${command}`);
            process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = SeedReportRegistry;