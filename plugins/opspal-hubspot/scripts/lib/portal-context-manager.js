#!/usr/bin/env node

/**
 * HubSpot Portal Context Manager
 *
 * Persists and retrieves portal-level context across assessments to prevent
 * re-analyzing the same areas and maintain institutional knowledge.
 *
 * Supports dual-path resolution:
 * - New: orgs/{org}/platforms/hubspot/{instance}
 * - Legacy: portals/{portalName} or instances/hubspot/{portalName}
 *
 * Adapted from SFDC org-context-manager.js
 *
 * Usage:
 *   node scripts/lib/portal-context-manager.js load <portal-name>
 *   node scripts/lib/portal-context-manager.js update <portal-name> --assessment <path>
 *   node scripts/lib/portal-context-manager.js cross-reference <portal-name>
 *   node scripts/lib/portal-context-manager.js summary <portal-name>
 *   node scripts/lib/portal-context-manager.js resolve <portal-name> [--org <org>]
 *   node scripts/lib/portal-context-manager.js migrate <portal-name> --org <org> [--instance <name>]
 */

const fs = require('fs');
const path = require('path');

const PLATFORM = 'hubspot';
const CONTEXT_FILE = 'PORTAL_CONTEXT.json';
const SUMMARY_FILE = 'PORTAL_SUMMARY.md';

// Try to load PathResolver from opspal-core
let PathResolver;
try {
    PathResolver = require('../../../opspal-core/scripts/lib/path-resolver').PathResolver;
} catch (e) {
    PathResolver = null;
}

// Try to load MetadataLoader from opspal-core
let MetadataLoader;
try {
    MetadataLoader = require('../../../opspal-core/scripts/lib/metadata-loader').MetadataLoader;
} catch (e) {
    MetadataLoader = null;
}

/**
 * Resolve portal path with dual-path support
 *
 * Priority:
 * 1. Environment variable override (INSTANCE_PATH)
 * 2. Org-centric: orgs/{org}/platforms/hubspot/{instance}
 * 3. Legacy plugin portals: {pluginRoot}/portals/{portalName}
 * 4. Legacy instances: instances/hubspot/{portalName}
 * 5. Legacy simple: instances/{portalName}
 *
 * @param {string} portalName - Portal name or ID
 * @param {Object} [options] - Resolution options
 * @returns {Object} Resolution result
 */
function resolvePortalPath(portalName, options = {}) {
    const basePath = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
    const pluginRoot = path.join(basePath, '.claude-plugins', 'hubspot-plugin');
    const { org, instance, preferLegacy } = options;

    // Check environment override
    const envPath = process.env.INSTANCE_PATH;
    if (envPath && fs.existsSync(envPath)) {
        return { path: envPath, structure: 'env-override', found: true };
    }

    const candidates = [];
    const effectiveOrg = org || process.env.ORG_SLUG || process.env.CLIENT_ORG;
    const effectiveInstance = instance || portalName;

    // Priority 1: Org-centric (if org provided)
    if (effectiveOrg && !preferLegacy) {
        candidates.push({
            path: path.join(basePath, 'orgs', effectiveOrg, 'platforms', PLATFORM, effectiveInstance),
            structure: 'org-centric',
            org: effectiveOrg,
            instance: effectiveInstance
        });
    }

    // Priority 2: Legacy plugin portals directory
    candidates.push({
        path: path.join(pluginRoot, 'portals', portalName),
        structure: 'legacy-plugin-portals',
        instance: portalName
    });

    // Priority 3: Legacy instances/hubspot pattern
    candidates.push({
        path: path.join(basePath, 'instances', PLATFORM, portalName),
        structure: 'legacy-platform',
        instance: portalName
    });

    // Priority 4: Legacy simple instances pattern
    candidates.push({
        path: path.join(basePath, 'instances', portalName),
        structure: 'legacy-simple',
        instance: portalName
    });

    // Find first existing path
    for (const candidate of candidates) {
        if (fs.existsSync(candidate.path)) {
            return { ...candidate, found: true };
        }
    }

    // Not found - return first candidate (preferred structure)
    return { ...candidates[0], found: false };
}

class PortalContextManager {
    constructor(portalName, options = {}) {
        this.portalName = portalName;
        this.options = options;

        // Use dual-path resolution
        const resolution = resolvePortalPath(portalName, options);
        this.resolution = resolution;
        this.portalDir = resolution.path;

        // Context path depends on structure
        if (resolution.structure === 'org-centric') {
            this.contextPath = path.join(this.portalDir, 'configs', CONTEXT_FILE);
        } else {
            this.contextPath = path.join(this.portalDir, CONTEXT_FILE);
        }

        this.context = this.loadContext();
    }

    loadContext() {
        if (fs.existsSync(this.contextPath)) {
            console.log(`📂 Loading context from ${this.contextPath}`);
            console.log(`   Structure: ${this.resolution.structure}`);
            const context = JSON.parse(fs.readFileSync(this.contextPath, 'utf8'));

            // Add resolution metadata
            context._resolution = {
                path: this.resolution.path,
                structure: this.resolution.structure,
                org: this.resolution.org || null,
                instance: this.resolution.instance || this.portalName
            };

            return context;
        }

        console.log(`📂 No existing context found for ${this.portalName}, returning empty context`);
        console.log(`   Path checked: ${this.contextPath}`);
        console.log(`   Resolution: ${this.resolution.structure} (found: ${this.resolution.found})`);

        // Initialize new context
        return {
            portalName: this.portalName,
            assessments: [],
            configurations: {},
            integrations: [],
            dataQualityHistory: [],
            workflowPatterns: [],
            propertyChanges: [],
            lastUpdated: new Date().toISOString(),
            metadata: {
                totalAssessments: 0,
                firstAssessment: null,
                lastAssessment: null
            },
            _resolution: {
                path: this.resolution.path,
                structure: this.resolution.structure,
                org: this.resolution.org || null,
                instance: this.resolution.instance || this.portalName
            }
        };
    }

    saveContext() {
        // Ensure directory exists
        const contextDir = path.dirname(this.contextPath);
        if (!fs.existsSync(contextDir)) {
            fs.mkdirSync(contextDir, { recursive: true });
        }

        this.context.lastUpdated = new Date().toISOString();

        // Update resolution metadata
        this.context._resolution = {
            path: this.resolution.path,
            structure: this.resolution.structure,
            org: this.resolution.org || null,
            instance: this.resolution.instance || this.portalName
        };

        fs.writeFileSync(this.contextPath, JSON.stringify(this.context, null, 2));
        console.log(`✅ Context saved to: ${this.contextPath}`);
        console.log(`   Structure: ${this.resolution.structure}`);
    }

    addAssessment(assessmentData) {
        const assessment = {
            id: `assessment-${Date.now()}`,
            date: new Date().toISOString(),
            type: assessmentData.type || 'general',
            framework: assessmentData.framework || 'unknown',
            scope: assessmentData.scope || [],
            findings: assessmentData.findings || [],
            recommendations: assessmentData.recommendations || [],
            path: assessmentData.path || null,
            status: assessmentData.status || 'completed'
        };

        this.context.assessments.push(assessment);
        this.context.metadata.totalAssessments = this.context.assessments.length;

        if (!this.context.metadata.firstAssessment) {
            this.context.metadata.firstAssessment = assessment.date;
        }
        this.context.metadata.lastAssessment = assessment.date;

        console.log(`✅ Added assessment: ${assessment.type} (${assessment.framework})`);
        return assessment;
    }

    updateFromAssessmentFile(assessmentPath) {
        if (!fs.existsSync(assessmentPath)) {
            throw new Error(`Assessment file not found: ${assessmentPath}`);
        }

        const assessmentData = JSON.parse(fs.readFileSync(assessmentPath, 'utf8'));
        this.addAssessment({
            ...assessmentData,
            path: assessmentPath
        });

        this.saveContext();
    }

    crossReferenceAssessments() {
        console.log('\n🔍 Cross-Referencing Assessments');
        console.log('=================================\n');

        const scopeMap = {};
        this.context.assessments.forEach(assessment => {
            assessment.scope.forEach(area => {
                if (!scopeMap[area]) {
                    scopeMap[area] = [];
                }
                scopeMap[area].push({
                    date: assessment.date,
                    type: assessment.type,
                    id: assessment.id
                });
            });
        });

        // Find overlapping areas
        const overlaps = Object.entries(scopeMap)
            .filter(([, assessments]) => assessments.length > 1)
            .map(([area, assessments]) => ({
                area,
                count: assessments.length,
                assessments
            }));

        if (overlaps.length > 0) {
            console.log('📊 Overlapping Assessment Areas:\n');
            overlaps.forEach(overlap => {
                console.log(`  ${overlap.area} (${overlap.count} assessments)`);
                overlap.assessments.forEach(a => {
                    console.log(`    - ${a.type} on ${a.date.split('T')[0]}`);
                });
                console.log('');
            });
        } else {
            console.log('No overlapping assessment areas found.');
        }

        return overlaps;
    }

    generateSummary() {
        const summary = {
            portal: this.portalName,
            totalAssessments: this.context.metadata.totalAssessments,
            assessmentTypes: {},
            frameworks: {},
            recentFindings: [],
            recommendationThemes: {}
        };

        // Count assessment types
        this.context.assessments.forEach(assessment => {
            summary.assessmentTypes[assessment.type] = (summary.assessmentTypes[assessment.type] || 0) + 1;
            summary.frameworks[assessment.framework] = (summary.frameworks[assessment.framework] || 0) + 1;

            // Collect recent findings
            if (assessment.findings) {
                assessment.findings.forEach(finding => {
                    summary.recentFindings.push({
                        date: assessment.date,
                        type: assessment.type,
                        finding: finding
                    });
                });
            }

            // Track recommendation themes
            if (assessment.recommendations) {
                assessment.recommendations.forEach(rec => {
                    const theme = this.categorizeRecommendation(rec);
                    summary.recommendationThemes[theme] = (summary.recommendationThemes[theme] || 0) + 1;
                });
            }
        });

        // Sort recent findings by date (most recent first)
        summary.recentFindings.sort((a, b) => new Date(b.date) - new Date(a.date));
        summary.recentFindings = summary.recentFindings.slice(0, 10);

        return summary;
    }

    categorizeRecommendation(recommendation) {
        const recLower = recommendation.toLowerCase();
        if (recLower.includes('data quality') || recLower.includes('cleanup')) return 'Data Quality';
        if (recLower.includes('workflow') || recLower.includes('automation')) return 'Automation';
        if (recLower.includes('integration')) return 'Integration';
        if (recLower.includes('property') || recLower.includes('field')) return 'Data Model';
        if (recLower.includes('reporting') || recLower.includes('dashboard')) return 'Analytics';
        if (recLower.includes('process')) return 'Process';
        return 'Other';
    }

    printSummary() {
        const summary = this.generateSummary();

        console.log('\n📊 Portal Assessment Summary');
        console.log('============================\n');
        console.log(`Portal: ${summary.portal}`);
        console.log(`Total Assessments: ${summary.totalAssessments}\n`);

        console.log('Assessment Types:');
        Object.entries(summary.assessmentTypes).forEach(([type, count]) => {
            console.log(`  - ${type}: ${count}`);
        });

        console.log('\nFrameworks Used:');
        Object.entries(summary.frameworks).forEach(([framework, count]) => {
            console.log(`  - ${framework}: ${count}`);
        });

        console.log('\nRecommendation Themes:');
        Object.entries(summary.recommendationThemes)
            .sort(([, a], [, b]) => b - a)
            .forEach(([theme, count]) => {
                console.log(`  - ${theme}: ${count}`);
            });

        if (summary.recentFindings.length > 0) {
            console.log('\nRecent Findings (Top 5):');
            summary.recentFindings.slice(0, 5).forEach((item, i) => {
                console.log(`  ${i + 1}. [${item.type}] ${item.finding.substring(0, 80)}...`);
            });
        }
    }

    saveSummary() {
        // For org-centric paths, save to configs/
        let summaryPath;
        if (this.resolution.structure === 'org-centric') {
            summaryPath = path.join(this.portalDir, 'configs', SUMMARY_FILE);
        } else {
            summaryPath = path.join(this.portalDir, SUMMARY_FILE);
        }

        // Ensure directory exists
        const summaryDir = path.dirname(summaryPath);
        if (!fs.existsSync(summaryDir)) {
            fs.mkdirSync(summaryDir, { recursive: true });
        }

        const summary = this.generateSummary();

        const lines = [];
        lines.push(`# Portal Assessment Summary: ${summary.portal}`);
        lines.push(`**Generated:** ${new Date().toISOString()}`);
        lines.push(`**Total Assessments:** ${summary.totalAssessments}\n`);

        lines.push('## Assessment Types');
        Object.entries(summary.assessmentTypes).forEach(([type, count]) => {
            lines.push(`- **${type}**: ${count}`);
        });

        lines.push('\n## Frameworks Used');
        Object.entries(summary.frameworks).forEach(([framework, count]) => {
            lines.push(`- **${framework}**: ${count}`);
        });

        lines.push('\n## Recommendation Themes');
        Object.entries(summary.recommendationThemes)
            .sort(([, a], [, b]) => b - a)
            .forEach(([theme, count]) => {
                lines.push(`- **${theme}**: ${count}`);
            });

        if (summary.recentFindings.length > 0) {
            lines.push('\n## Recent Findings');
            summary.recentFindings.forEach((item, i) => {
                lines.push(`${i + 1}. **[${item.type}]** ${item.finding}`);
            });
        }

        fs.writeFileSync(summaryPath, lines.join('\n'));
        console.log(`\n✅ Summary saved to: ${summaryPath}`);
    }

    /**
     * Migrate context to org-centric structure
     *
     * @param {string} targetOrg - Target org slug
     * @param {string} [targetInstance] - Target instance name (defaults to portalName)
     * @param {Object} [options] - Migration options
     * @returns {Object} Migration result
     */
    migrateToOrgCentric(targetOrg, targetInstance = null, options = {}) {
        const { dryRun = false } = options;

        console.log(`🚀 Migrating context for ${this.portalName} → ${targetOrg}/${targetInstance || this.portalName}`);

        // Prepare target path
        const basePath = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
        const targetPath = path.join(
            basePath,
            'orgs',
            targetOrg,
            'platforms',
            PLATFORM,
            targetInstance || this.portalName
        );

        console.log(`   Source: ${this.resolution.path}`);
        console.log(`   Target: ${targetPath}`);

        if (dryRun) {
            console.log(`   [DRY RUN] Would migrate ${this.context.assessments.length} assessments`);
            return {
                success: true,
                dryRun: true,
                sourcePath: this.resolution.path,
                targetPath: targetPath,
                assessmentCount: this.context.assessments.length
            };
        }

        // Create target directory structure
        const configsDir = path.join(targetPath, 'configs');
        if (!fs.existsSync(configsDir)) {
            fs.mkdirSync(configsDir, { recursive: true });
        }

        // Update context with new metadata
        const migratedContext = { ...this.context };
        migratedContext.org = targetOrg;
        migratedContext.instance = targetInstance || this.portalName;
        migratedContext.platform = PLATFORM;
        migratedContext._migration = {
            migrated_at: new Date().toISOString(),
            source_path: this.resolution.path,
            source_structure: this.resolution.structure
        };

        // Remove old resolution metadata
        delete migratedContext._resolution;

        // Save to new location
        const newContextPath = path.join(configsDir, CONTEXT_FILE);
        fs.writeFileSync(newContextPath, JSON.stringify(migratedContext, null, 2));
        console.log(`✅ Context migrated to ${newContextPath}`);

        return {
            success: true,
            sourcePath: this.resolution.path,
            targetPath: newContextPath,
            assessmentCount: this.context.assessments.length
        };
    }

    /**
     * Enrich context with YAML metadata (if available)
     *
     * @returns {Promise<Object>} Enriched context
     */
    async enrichWithMetadata() {
        if (!MetadataLoader) {
            return this.context;
        }

        const loader = new MetadataLoader();

        if (this.resolution.structure === 'org-centric' && this.resolution.org) {
            const enriched = await loader.enrichContextWithMetadata(
                this.context,
                this.resolution.org,
                PLATFORM,
                this.resolution.instance || this.portalName
            );
            return enriched;
        }

        return this.context;
    }

    exportContext() {
        console.log(JSON.stringify(this.context, null, 2));
    }

    getAssessmentsByType(type) {
        return this.context.assessments.filter(a => a.type === type);
    }

    getRecentAssessments(limit = 5) {
        return this.context.assessments
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, limit);
    }
}

/**
 * Parse CLI arguments for options
 * @private
 */
function parseOptions(args) {
    const options = {};

    const orgIndex = args.indexOf('--org');
    if (orgIndex !== -1 && args[orgIndex + 1]) {
        options.org = args[orgIndex + 1];
    }

    const instanceIndex = args.indexOf('--instance');
    if (instanceIndex !== -1 && args[instanceIndex + 1]) {
        options.instance = args[instanceIndex + 1];
    }

    options.preferLegacy = args.includes('--legacy');
    options.dryRun = args.includes('--dry-run');

    return options;
}

// CLI Interface
function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    const portalName = args[1];

    if (!command || !portalName) {
        console.log('Usage:');
        console.log('  node portal-context-manager.js load <portal-name> [--org <org>]');
        console.log('  node portal-context-manager.js update <portal-name> --assessment <path> [--org <org>]');
        console.log('  node portal-context-manager.js cross-reference <portal-name> [--org <org>]');
        console.log('  node portal-context-manager.js summary <portal-name> [--org <org>]');
        console.log('  node portal-context-manager.js export <portal-name> [--org <org>]');
        console.log('  node portal-context-manager.js resolve <portal-name> [--org <org>]');
        console.log('  node portal-context-manager.js migrate <portal-name> --org <org> [--instance <name>] [--dry-run]');
        console.log('');
        console.log('Options:');
        console.log('  --org <slug>        Org slug for org-centric resolution');
        console.log('  --instance <name>   Instance name (defaults to portal-name)');
        console.log('  --legacy            Prefer legacy paths');
        console.log('  --dry-run           Show what would happen without making changes');
        console.log('');
        console.log('Examples:');
        console.log('  node portal-context-manager.js load my-portal');
        console.log('  node portal-context-manager.js load production --org acme');
        console.log('  node portal-context-manager.js resolve my-portal');
        console.log('  node portal-context-manager.js migrate my-portal --org acme --instance production --dry-run');
        process.exit(1);
    }

    const options = parseOptions(args);
    const manager = new PortalContextManager(portalName, options);

    try {
        switch (command) {
            case 'load':
                manager.exportContext();
                break;

            case 'resolve': {
                const resolution = resolvePortalPath(portalName, options);
                console.log(`\n📍 Path Resolution for "${portalName}":\n`);
                console.log(`   Path:      ${resolution.path}`);
                console.log(`   Structure: ${resolution.structure}`);
                console.log(`   Found:     ${resolution.found ? 'Yes' : 'No'}`);
                if (resolution.org) {
                    console.log(`   Org:       ${resolution.org}`);
                }
                console.log(`   Instance:  ${resolution.instance || portalName}`);
                console.log('');
                break;
            }

            case 'migrate': {
                if (!options.org) {
                    console.error('❌ --org flag required for migration');
                    process.exit(1);
                }
                const result = manager.migrateToOrgCentric(options.org, options.instance, options);
                if (!result.success) {
                    console.error(`❌ Migration failed`);
                    process.exit(1);
                }
                break;
            }

            case 'update': {
                const assessmentPath = args[args.indexOf('--assessment') + 1];
                if (!assessmentPath) {
                    console.error('❌ --assessment <path> required');
                    process.exit(1);
                }
                manager.updateFromAssessmentFile(assessmentPath);
                break;
            }

            case 'cross-reference':
                manager.crossReferenceAssessments();
                break;

            case 'summary':
                manager.printSummary();
                manager.saveSummary();
                break;

            case 'export':
                manager.exportContext();
                break;

            default:
                console.error(`Unknown command: ${command}`);
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

module.exports = {
    PortalContextManager,
    resolvePortalPath,
    PLATFORM,
    CONTEXT_FILE,
    SUMMARY_FILE
};
