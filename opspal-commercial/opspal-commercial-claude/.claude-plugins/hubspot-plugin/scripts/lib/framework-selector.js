#!/usr/bin/env node

/**
 * HubSpot Framework Selector
 *
 * Recommends and confirms assessment frameworks based on portal history to prevent
 * framework confusion and ensure consistent assessment approaches.
 *
 * Adapted from SFDC framework-selector.js
 *
 * Usage:
 *   node scripts/lib/framework-selector.js recommend <portal-name> --type <assessment-type>
 *   node scripts/lib/framework-selector.js record <portal-name> --type <type> --framework <name>
 *   node scripts/lib/framework-selector.js list
 */

const fs = require('fs');
const path = require('path');

class FrameworkSelector {
    constructor() {
        this.configPath = path.join(__dirname, '../../.claude/framework-history.json');
        this.frameworksPath = path.join(__dirname, '../../templates/frameworks');
        this.history = this.loadHistory();
        this.frameworks = this.loadFrameworks();
    }

    loadHistory() {
        if (fs.existsSync(this.configPath)) {
            return JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
        }

        return {
            byPortal: {},
            byType: {},
            lastUpdated: new Date().toISOString()
        };
    }

    saveHistory() {
        const dir = path.dirname(this.configPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        this.history.lastUpdated = new Date().toISOString();
        fs.writeFileSync(this.configPath, JSON.stringify(this.history, null, 2));
    }

    loadFrameworks() {
        // Available assessment frameworks
        return {
            'revops-comprehensive': {
                name: 'RevOps Comprehensive Assessment',
                types: ['revops', 'operations', 'revenue-operations'],
                description: 'Complete revenue operations assessment covering pipeline, forecasting, data quality',
                benchmarks: true,
                duration: '2-3 days',
                deliverables: ['Executive summary', 'Detailed findings', 'Remediation plan']
            },
            'marketing-automation': {
                name: 'Marketing Automation Assessment',
                types: ['marketing', 'automation', 'campaigns'],
                description: 'Marketing automation, workflow efficiency, email performance',
                benchmarks: true,
                duration: '1-2 days',
                deliverables: ['Automation audit', 'Workflow optimization', 'Email performance']
            },
            'data-quality': {
                name: 'Data Quality & Hygiene Assessment',
                types: ['data-quality', 'data-hygiene', 'cleanup'],
                description: 'Data integrity, deduplication, standardization',
                benchmarks: false,
                duration: '1 day',
                deliverables: ['Data quality score', 'Cleanup plan', 'Automation recommendations']
            },
            'sales-enablement': {
                name: 'Sales Enablement Assessment',
                types: ['sales', 'enablement', 'pipeline'],
                description: 'Sales process, pipeline management, forecasting accuracy',
                benchmarks: true,
                duration: '1-2 days',
                deliverables: ['Process audit', 'Pipeline health', 'Forecast accuracy']
            },
            'integration-health': {
                name: 'Integration Health Check',
                types: ['integration', 'sync', 'api'],
                description: 'Integration status, sync quality, API health',
                benchmarks: false,
                duration: '0.5-1 day',
                deliverables: ['Integration inventory', 'Sync status', 'Error analysis']
            },
            'lead-management': {
                name: 'Lead Management Assessment',
                types: ['lead-management', 'scoring', 'routing'],
                description: 'Lead scoring, routing, conversion optimization',
                benchmarks: true,
                duration: '1 day',
                deliverables: ['Scoring model audit', 'Routing analysis', 'Conversion funnel']
            },
            'reporting-analytics': {
                name: 'Reporting & Analytics Assessment',
                types: ['reporting', 'analytics', 'dashboards'],
                description: 'Report quality, dashboard usage, attribution',
                benchmarks: true,
                duration: '1 day',
                deliverables: ['Report inventory', 'Usage analysis', 'Attribution review']
            }
        };
    }

    recommend(portalName, assessmentType) {
        console.log(`\n🎯 Framework Recommendation for ${portalName}`);
        console.log(`Assessment Type: ${assessmentType}\n`);

        // Check portal history
        const portalHistory = this.history.byPortal[portalName] || {};
        const typeHistory = this.history.byType[assessmentType] || {};

        // Find matching frameworks
        const matchingFrameworks = Object.entries(this.frameworks)
            .filter(([, framework]) => framework.types.includes(assessmentType))
            .map(([id, framework]) => ({
                id,
                ...framework,
                usedBefore: portalHistory[id] ? true : false,
                lastUsed: portalHistory[id] ? portalHistory[id].lastUsed : null,
                timesUsed: portalHistory[id] ? portalHistory[id].count : 0
            }))
            .sort((a, b) => b.timesUsed - a.timesUsed);

        if (matchingFrameworks.length === 0) {
            console.log('❌ No frameworks found for this assessment type');
            console.log('Available types:', Object.keys(this.frameworks).join(', '));
            return null;
        }

        const recommended = matchingFrameworks[0];

        console.log('✅ Recommended Framework:', recommended.name);
        console.log(`   ID: ${recommended.id}`);
        console.log(`   Description: ${recommended.description}`);
        console.log(`   Duration: ${recommended.duration}`);
        console.log(`   Benchmarks: ${recommended.benchmarks ? 'Yes' : 'No'}`);

        if (recommended.usedBefore) {
            console.log(`   📊 Used before: ${recommended.timesUsed} times`);
            console.log(`   Last used: ${recommended.lastUsed}`);
        } else {
            console.log('   📝 First time using this framework for this portal');
        }

        if (matchingFrameworks.length > 1) {
            console.log('\n📋 Alternatives:');
            matchingFrameworks.slice(1).forEach(fw => {
                console.log(`   - ${fw.name} (${fw.id})`);
                if (fw.usedBefore) {
                    console.log(`     Used ${fw.timesUsed} times, last on ${fw.lastUsed}`);
                }
            });
        }

        console.log('\n📦 Deliverables:');
        recommended.deliverables.forEach(d => console.log(`   - ${d}`));

        return recommended;
    }

    recordUsage(portalName, assessmentType, frameworkId) {
        const framework = this.frameworks[frameworkId];
        if (!framework) {
            throw new Error(`Unknown framework: ${frameworkId}`);
        }

        // Update portal history
        if (!this.history.byPortal[portalName]) {
            this.history.byPortal[portalName] = {};
        }
        if (!this.history.byPortal[portalName][frameworkId]) {
            this.history.byPortal[portalName][frameworkId] = {
                count: 0,
                firstUsed: new Date().toISOString(),
                lastUsed: null
            };
        }
        this.history.byPortal[portalName][frameworkId].count++;
        this.history.byPortal[portalName][frameworkId].lastUsed = new Date().toISOString();

        // Update type history
        if (!this.history.byType[assessmentType]) {
            this.history.byType[assessmentType] = {};
        }
        if (!this.history.byType[assessmentType][frameworkId]) {
            this.history.byType[assessmentType][frameworkId] = 0;
        }
        this.history.byType[assessmentType][frameworkId]++;

        this.saveHistory();

        console.log(`✅ Recorded usage of ${framework.name} for ${portalName}`);
        console.log(`   Total uses: ${this.history.byPortal[portalName][frameworkId].count}`);
    }

    listFrameworks() {
        console.log('\n📚 Available Assessment Frameworks\n');

        Object.entries(this.frameworks).forEach(([id, framework]) => {
            console.log(`${framework.name} (${id})`);
            console.log(`  Types: ${framework.types.join(', ')}`);
            console.log(`  Duration: ${framework.duration}`);
            console.log(`  Benchmarks: ${framework.benchmarks ? 'Yes' : 'No'}`);
            console.log('');
        });
    }

    getPortalHistory(portalName) {
        return this.history.byPortal[portalName] || {};
    }

    getTypeStats(assessmentType) {
        return this.history.byType[assessmentType] || {};
    }
}

// CLI Interface
function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    const selector = new FrameworkSelector();

    try {
        switch (command) {
            case 'recommend': {
                const portalName = args[1];
                const typeIndex = args.indexOf('--type');
                const assessmentType = typeIndex !== -1 ? args[typeIndex + 1] : null;

                if (!portalName || !assessmentType) {
                    console.error('Usage: recommend <portal-name> --type <assessment-type>');
                    process.exit(1);
                }

                selector.recommend(portalName, assessmentType);
                break;
            }

            case 'record': {
                const portalName = args[1];
                const typeIndex = args.indexOf('--type');
                const frameworkIndex = args.indexOf('--framework');
                const assessmentType = typeIndex !== -1 ? args[typeIndex + 1] : null;
                const frameworkId = frameworkIndex !== -1 ? args[frameworkIndex + 1] : null;

                if (!portalName || !assessmentType || !frameworkId) {
                    console.error('Usage: record <portal-name> --type <type> --framework <framework-id>');
                    process.exit(1);
                }

                selector.recordUsage(portalName, assessmentType, frameworkId);
                break;
            }

            case 'list':
                selector.listFrameworks();
                break;

            case 'history': {
                const portalName = args[1];
                if (!portalName) {
                    console.error('Usage: history <portal-name>');
                    process.exit(1);
                }

                const history = selector.getPortalHistory(portalName);
                console.log(JSON.stringify(history, null, 2));
                break;
            }

            default:
                console.log('Usage:');
                console.log('  node framework-selector.js recommend <portal-name> --type <assessment-type>');
                console.log('  node framework-selector.js record <portal-name> --type <type> --framework <id>');
                console.log('  node framework-selector.js list');
                console.log('  node framework-selector.js history <portal-name>');
                process.exit(1);
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { FrameworkSelector };
