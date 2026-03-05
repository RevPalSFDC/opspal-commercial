#!/usr/bin/env node

/**
 * HubSpot Portal Quirks Detector
 *
 * Auto-detects portal-specific customizations and naming conventions to prevent
 * "I can't find that property/object" issues.
 *
 * Adapted from SFDC org-quirks-detector.js
 *
 * Usage:
 *   node scripts/lib/portal-quirks-detector.js generate-docs <portal-name>
 *   node scripts/lib/portal-quirks-detector.js detect <portal-name>
 *   node scripts/lib/portal-quirks-detector.js quick-ref <portal-name>
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { DataAccessError } = require('../../../../opspal-core/cross-platform-plugin/scripts/lib/data-access-error');

class PortalQuirksDetector {
    constructor(portalName) {
        this.portalName = portalName;
        this.portalsDir = path.join(__dirname, '../../portals');
        this.portalConfig = this.loadPortalConfig();
        this.quirks = {
            customProperties: {},
            namingPatterns: [],
            workflowPatterns: [],
            integrations: [],
            apiLimits: {},
            detectedAt: new Date().toISOString()
        };
    }

    loadPortalConfig() {
        const configPath = path.join(this.portalsDir, 'config.json');
        if (!fs.existsSync(configPath)) {
            throw new Error(`Portal config not found at ${configPath}`);
        }
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const portal = config.portals[this.portalName];
        if (!portal) {
            throw new Error(`Portal '${this.portalName}' not found in config`);
        }
        return portal;
    }

    async detectQuirks() {
        console.log(`🔍 Detecting quirks for portal: ${this.portalName}`);

        try {
            await this.detectCustomProperties();
            await this.detectNamingPatterns();
            await this.detectWorkflowPatterns();
            await this.detectIntegrations();
            await this.detectApiLimits();

            console.log('✅ Quirks detection complete');
            return this.quirks;
        } catch (error) {
            console.error('❌ Error detecting quirks:', error.message);
            throw error;
        }
    }

    async detectCustomProperties() {
        console.log('  📋 Detecting custom properties...');

        // Detect custom contact properties
        const contactProps = await this.queryProperties('contacts');
        this.quirks.customProperties.contacts = this.analyzeProperties(contactProps);

        // Detect custom company properties
        const companyProps = await this.queryProperties('companies');
        this.quirks.customProperties.companies = this.analyzeProperties(companyProps);

        // Detect custom deal properties
        const dealProps = await this.queryProperties('deals');
        this.quirks.customProperties.deals = this.analyzeProperties(dealProps);

        console.log(`     Found ${Object.keys(this.quirks.customProperties).length} object types with custom properties`);
    }

    async queryProperties(objectType) {
        // Fail-fast: Throw error instead of returning empty data
        // This enforces the No-Mocks policy and prevents agents from making
        // incorrect decisions based on "no properties exist"
        throw new DataAccessError(
            'HubSpot_Properties_API',
            'queryProperties not yet implemented - requires HubSpot Properties API integration',
            {
                objectType,
                status: 'not_implemented',
                recommendation: 'Implement HubSpot API call using @hubspot/api-client or HubSpot CLI',
                tracking_issue: 'https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/issues/TBD'
            }
        );
    }

    analyzeProperties(properties) {
        const analysis = {
            custom: [],
            nonStandardNaming: [],
            calculated: [],
            total: properties.length
        };

        properties.forEach(prop => {
            // Detect custom properties (non-HubSpot standard)
            if (prop.name && !this.isStandardProperty(prop.name)) {
                analysis.custom.push({
                    name: prop.name,
                    label: prop.label,
                    type: prop.type,
                    description: prop.description
                });
            }

            // Detect non-standard naming (e.g., not snake_case)
            if (prop.name && !this.isStandardNaming(prop.name)) {
                analysis.nonStandardNaming.push({
                    name: prop.name,
                    pattern: this.detectNamingPattern(prop.name)
                });
            }

            // Detect calculated/formula properties
            if (prop.calculated || prop.calculationFormula) {
                analysis.calculated.push({
                    name: prop.name,
                    formula: prop.calculationFormula
                });
            }
        });

        return analysis;
    }

    isStandardProperty(name) {
        // Common HubSpot standard properties
        const standardProps = [
            'firstname', 'lastname', 'email', 'phone', 'company', 'website',
            'address', 'city', 'state', 'zip', 'country',
            'hs_object_id', 'createdate', 'lastmodifieddate', 'hs_lead_status',
            'lifecyclestage', 'name', 'domain', 'industry', 'annualrevenue',
            'dealname', 'dealstage', 'amount', 'closedate', 'pipeline'
        ];
        return standardProps.includes(name.toLowerCase());
    }

    isStandardNaming(name) {
        // Check if follows snake_case pattern
        return /^[a-z][a-z0-9_]*$/.test(name);
    }

    detectNamingPattern(name) {
        if (/^[a-z][a-zA-Z0-9]*$/.test(name)) return 'camelCase';
        if (/^[A-Z][a-zA-Z0-9]*$/.test(name)) return 'PascalCase';
        if (/^[a-z][a-z0-9_]*$/.test(name)) return 'snake_case';
        if (/^[A-Z][A-Z0-9_]*$/.test(name)) return 'SCREAMING_SNAKE_CASE';
        return 'mixed/custom';
    }

    async detectNamingPatterns() {
        console.log('  🏷️  Detecting naming patterns...');

        // Analyze custom properties for common patterns
        const allProps = [
            ...this.quirks.customProperties.contacts?.custom || [],
            ...this.quirks.customProperties.companies?.custom || [],
            ...this.quirks.customProperties.deals?.custom || []
        ];

        const patterns = {};
        allProps.forEach(prop => {
            const pattern = this.detectNamingPattern(prop.name);
            patterns[pattern] = (patterns[pattern] || 0) + 1;
        });

        this.quirks.namingPatterns = Object.entries(patterns).map(([pattern, count]) => ({
            pattern,
            count,
            percentage: ((count / allProps.length) * 100).toFixed(1)
        }));

        console.log(`     Found ${this.quirks.namingPatterns.length} naming patterns`);
    }

    async detectWorkflowPatterns() {
        console.log('  ⚙️  Detecting workflow patterns...');

        // ENHANCEMENT: Workflow pattern detection not yet implemented
        // Would analyze:
        // - Number of workflows per object type
        // - Common trigger types
        // - Workflow naming conventions
        // Tracking: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/issues/TBD

        this.quirks.workflowPatterns = {
            not_implemented: true,
            note: 'Workflow pattern detection requires HubSpot Workflows API integration'
        };

        console.log('     Workflow pattern detection not yet implemented (enhancement)');
    }

    async detectIntegrations() {
        console.log('  🔌 Detecting integrations...');

        // ENHANCEMENT: Integration detection not yet implemented
        // Would analyze:
        // - Salesforce sync configuration
        // - Email integrations (Gmail, Outlook, etc.)
        // - Custom webhooks and connected apps
        // Tracking: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/issues/TBD

        this.quirks.integrations = {
            not_implemented: true,
            note: 'Integration detection requires HubSpot Integrations API'
        };

        console.log('     Integration detection not yet implemented (enhancement)');
    }

    async detectApiLimits() {
        console.log('  📊 Detecting API limits and usage...');

        // ENHANCEMENT: Real-time API usage detection not yet implemented
        // Would query HubSpot API for actual current usage
        // Tracking: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace/issues/TBD

        this.quirks.apiLimits = {
            not_implemented: true,
            note: 'API usage detection requires HubSpot Usage API integration',
            defaults: {
                daily: { limit: 500000, used: 0, remaining: 500000 },
                concurrent: { limit: 10, used: 0 },
                burst: { limit: 100, used: 0 }
            }
        };

        console.log('     API limit detection not yet implemented (showing defaults only)');
    }

    saveQuirks() {
        const outputDir = path.join(this.portalsDir, this.portalName);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const quirksPath = path.join(outputDir, 'PORTAL_QUIRKS.json');
        fs.writeFileSync(quirksPath, JSON.stringify(this.quirks, null, 2));
        console.log(`\n✅ Saved quirks to: ${quirksPath}`);

        return quirksPath;
    }

    generateQuickReference() {
        const lines = [];
        lines.push('# Portal Quick Reference');
        lines.push(`**Portal:** ${this.portalName}`);
        lines.push(`**Generated:** ${new Date().toISOString()}`);
        lines.push('');

        // Custom Properties Summary
        lines.push('## Custom Properties');
        Object.entries(this.quirks.customProperties).forEach(([objectType, props]) => {
            if (props.custom && props.custom.length > 0) {
                lines.push(`\n### ${objectType} (${props.custom.length} custom)`);
                props.custom.slice(0, 10).forEach(prop => {
                    lines.push(`- **${prop.name}** (${prop.type}) - ${prop.label || 'No label'}`);
                });
                if (props.custom.length > 10) {
                    lines.push(`- ... and ${props.custom.length - 10} more`);
                }
            }
        });

        // Naming Patterns
        if (this.quirks.namingPatterns.length > 0) {
            lines.push('\n## Naming Patterns');
            this.quirks.namingPatterns.forEach(pattern => {
                lines.push(`- **${pattern.pattern}**: ${pattern.count} properties (${pattern.percentage}%)`);
            });
        }

        return lines.join('\n');
    }

    saveQuickReference() {
        const outputDir = path.join(this.portalsDir, this.portalName);
        const refPath = path.join(outputDir, 'QUICK_REFERENCE.md');
        const content = this.generateQuickReference();
        fs.writeFileSync(refPath, content);
        console.log(`✅ Saved quick reference to: ${refPath}`);
        return refPath;
    }

    generateObjectMappings() {
        const mappings = [];
        mappings.push('# Object and Property Mappings');
        mappings.push(`Portal: ${this.portalName}\n`);

        Object.entries(this.quirks.customProperties).forEach(([objectType, props]) => {
            mappings.push(`\n## ${objectType.toUpperCase()}`);
            if (props.nonStandardNaming && props.nonStandardNaming.length > 0) {
                mappings.push('Non-standard naming detected:');
                props.nonStandardNaming.forEach(prop => {
                    mappings.push(`  ${prop.name} (${prop.pattern})`);
                });
            } else {
                mappings.push('  All properties follow standard naming');
            }
        });

        return mappings.join('\n');
    }

    saveObjectMappings() {
        const outputDir = path.join(this.portalsDir, this.portalName);
        const mappingsPath = path.join(outputDir, 'OBJECT_MAPPINGS.txt');
        const content = this.generateObjectMappings();
        fs.writeFileSync(mappingsPath, content);
        console.log(`✅ Saved object mappings to: ${mappingsPath}`);
        return mappingsPath;
    }
}

// CLI Interface
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    const portalName = args[1];

    if (!command || !portalName) {
        console.log('Usage:');
        console.log('  node portal-quirks-detector.js generate-docs <portal-name>');
        console.log('  node portal-quirks-detector.js detect <portal-name>');
        console.log('  node portal-quirks-detector.js quick-ref <portal-name>');
        process.exit(1);
    }

    const detector = new PortalQuirksDetector(portalName);

    try {
        switch (command) {
            case 'generate-docs':
                await detector.detectQuirks();
                detector.saveQuirks();
                detector.saveQuickReference();
                detector.saveObjectMappings();
                console.log('\n🎉 Documentation generation complete!');
                break;

            case 'detect':
                const quirks = await detector.detectQuirks();
                detector.saveQuirks();
                console.log('\n📋 Quirks:', JSON.stringify(quirks, null, 2));
                break;

            case 'quick-ref':
                await detector.detectQuirks();
                console.log('\n' + detector.generateQuickReference());
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

module.exports = { PortalQuirksDetector };
