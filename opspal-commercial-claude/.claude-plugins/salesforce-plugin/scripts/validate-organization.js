#!/usr/bin/env node

/**
 * Organization Validation Script
 *
 * Checks for organizational violations in the SFDC directory:
 * - Files that should be in instances/{org-alias}/ directories
 * - Projects created in wrong locations
 * - Bulk operation results not properly organized
 *
 * Usage:
 *   node validate-organization.js              # Check and report
 *   node validate-organization.js --fix        # Suggest fix commands
 *   node validate-organization.js --strict     # Exit with error if violations found
 */

const fs = require('fs');
const path = require('path');

const SFDC_ROOT = path.join(__dirname, '..');
const INSTANCES_DIR = path.join(SFDC_ROOT, 'instances');

// Patterns that indicate instance-specific files
const VIOLATION_PATTERNS = [
    {
        pattern: /^750[A-Za-z0-9]{15}.*\.csv$/,
        description: 'Bulk operation result (should be in instances/{org}/bulk-operations/)',
        category: 'bulk-ops'
    },
    {
        pattern: /^account_query.*\.(md|txt|json)$/,
        description: 'Query result (should be in instances/{org}/queries/)',
        category: 'queries'
    },
    {
        pattern: /^.*-catalog.*$/,
        description: 'Instance catalog (should be in instances/{org}/docs/ or /projects/)',
        category: 'catalogs'
    },
    {
        pattern: /^.*-reassociation-.*$/,
        description: 'Project folder (should be in instances/{org}/projects/)',
        category: 'projects'
    },
    {
        pattern: /^.*-cleanup-\d{4}-\d{2}-\d{2}$/,
        description: 'Project folder (should be in instances/{org}/projects/)',
        category: 'projects'
    },
    {
        pattern: /^.*-deduplication-\d{4}-\d{2}-\d{2}$/,
        description: 'Project folder (should be in instances/{org}/projects/)',
        category: 'projects'
    }
];

// Files/folders that are allowed in SFDC root
const ALLOWED_IN_ROOT = [
    'node_modules', '.git', '.github', 'scripts', 'docs', 'agents',
    'templates', 'shared', 'instances', 'error-logging', 'tests',
    'package.json', 'package-lock.json', 'README.md', 'CLAUDE.md',
    'CHANGELOG.md', '.gitignore', '.mcp.json', 'sfdx-project.json',
    '.env', 'docker-compose.yml', 'Dockerfile', 'config', 'lib',
    'LICENSE', '.current-instance', 'mcp-extensions', 'mcp-tools',
    'mcp-gpt5-adapter', 'mcp-manager', 'migration-framework',
    'model-proxy', 'monitoring', 'planning', 'projects', 'schemas',
    'systemd', 'utils', 'tools', 'knowledge-base', 'forcepal',
    'TOOL_REFERENCE.md', 'AGENT_CATALOG.md', 'IMPLEMENTATION_SUMMARY.md',
    'ORGANIZATION_ENFORCEMENT_STRATEGY.md', 'ORGANIZATION_PROJECT_COMPLETION.md',
    'RELEASE_NOTES_v2.7.2.md', 'RELEASE_NOTES_v2.8.0.md', 'RELEASE_NOTES_v3.0.0.md',
    'REVOPS_NEXT_STEPS.md', 'ROLLOUT_PLAN.md', 'VALIDATION_QUICK_REFERENCE.md',
    'GEMINI.md', 'AGENT_FIX_QUICKSTART.md', 'AGENT_INTEGRATION_COMPLETE.md',
    'fix-organization.sh', 'setup-cron.sh', '.initialized', '.sf',
    '.temp', '.backup', '.config-backups', '.state', '.code', '.claude',
    'output', 'logs', 'manifest', 'retrieved', 'force-app', 'salesforce-projects',
    'archives', 'reports', 'runbooks'
];

class OrganizationValidator {
    constructor() {
        this.violations = [];
        this.stats = {
            total: 0,
            violations: 0,
            clean: 0
        };
    }

    async validate() {
        console.log('╔════════════════════════════════════════════════════════════╗');
        console.log('║         Organization Validation                            ║');
        console.log('╚════════════════════════════════════════════════════════════╝\n');

        const items = fs.readdirSync(SFDC_ROOT);

        for (const item of items) {
            // Skip hidden files and allowed items
            if (item.startsWith('.') || ALLOWED_IN_ROOT.includes(item)) {
                continue;
            }

            this.stats.total++;

            // Check against violation patterns
            const violation = this.checkViolation(item);
            if (violation) {
                this.violations.push(violation);
                this.stats.violations++;
            } else {
                this.stats.clean++;
            }
        }

        this.report();
    }

    checkViolation(item) {
        for (const rule of VIOLATION_PATTERNS) {
            if (rule.pattern.test(item)) {
                const fullPath = path.join(SFDC_ROOT, item);
                const stat = fs.statSync(fullPath);

                return {
                    item,
                    path: fullPath,
                    type: stat.isDirectory() ? 'directory' : 'file',
                    rule: rule.description,
                    category: rule.category,
                    suggestedLocation: this.getSuggestedLocation(item, rule.category)
                };
            }
        }
        return null;
    }

    getSuggestedLocation(item, category) {
        // Try to determine target instance from .current-instance
        let targetInstance = 'unknown-instance';
        const currentInstanceFile = path.join(SFDC_ROOT, '.current-instance');
        if (fs.existsSync(currentInstanceFile)) {
            targetInstance = fs.readFileSync(currentInstanceFile, 'utf-8').trim();
        }

        const locationMap = {
            'bulk-ops': `instances/${targetInstance}/bulk-operations/${item}`,
            'queries': `instances/${targetInstance}/queries/${item}`,
            'catalogs': `instances/${targetInstance}/docs/${item}`,
            'projects': `instances/${targetInstance}/projects/${item}`
        };

        return locationMap[category] || `instances/${targetInstance}/${item}`;
    }

    report() {
        console.log('📊 Scan Results:\n');
        console.log(`   Total items scanned: ${this.stats.total}`);
        console.log(`   Violations found: ${this.stats.violations}`);
        console.log(`   Clean items: ${this.stats.clean}\n`);

        if (this.violations.length === 0) {
            console.log('✅ No organizational violations found!\n');
            console.log('   All files are properly organized in instance directories.\n');
            return 0;
        }

        console.log('⚠️  Organizational Violations:\n');

        this.violations.forEach((v, idx) => {
            console.log(`${idx + 1}. ${v.item} (${v.type})`);
            console.log(`   Issue: ${v.rule}`);
            console.log(`   Should be: ${v.suggestedLocation}`);
            console.log(`   Fix: mv "${v.item}" "${v.suggestedLocation}"`);
            console.log('');
        });

        console.log('📋 Recommended Actions:\n');
        console.log('   1. Review each violation above');
        console.log('   2. Verify the suggested location is correct');
        console.log('   3. Run the mv commands to fix organization');
        console.log('   4. Re-run validation to confirm\n');

        console.log('💡 Prevention:\n');
        console.log('   - Always use: ./scripts/init-project.sh');
        console.log('   - Projects auto-created in: instances/{org-alias}/');
        console.log('   - Place bulk ops in: instances/{org}/bulk-operations/');
        console.log('   - Place queries in: instances/{org}/queries/\n');

        return this.violations.length;
    }
}

// Main execution
async function main() {
    const args = process.argv.slice(2);
    const strict = args.includes('--strict');

    const validator = new OrganizationValidator();
    const violationCount = await validator.validate();

    if (strict && violationCount > 0) {
        console.error('❌ Validation failed in strict mode\n');
        process.exit(1);
    }

    process.exit(0);
}

if (require.main === module) {
    main().catch(error => {
        console.error('Error during validation:', error);
        process.exit(1);
    });
}

module.exports = OrganizationValidator;
