#!/usr/bin/env node

/**
 * Permission Set Complexity Calculator
 *
 * Calculates complexity score for permission sets based on:
 * - Object permissions (CRUD)
 * - Field permissions (FLS)
 * - System permissions
 * - Application visibility
 * - Apex/VF access
 * - Custom permissions
 * - Record type visibility
 * - Layout assignments
 * - Tab settings
 *
 * Complexity Score: 0.0 (simple) to 1.0 (complex)
 * Thresholds:
 * - 0.0-0.3: Simple (direct deployment)
 * - 0.3-0.7: Moderate (segmented approach)
 * - 0.7-1.0: Complex (phase-based deployment, consider refactoring)
 *
 * Usage:
 *   node permission-complexity-calculator.js calculate --permission-set ./permissionsets/Sales_Manager.permissionset-meta.xml
 *   node permission-complexity-calculator.js breakdown --permission-set ./permissionsets/Sales_Manager.permissionset-meta.xml
 *   node permission-complexity-calculator.js recommend --permission-set ./permissionsets/Sales_Manager.permissionset-meta.xml
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const { parseStringPromise } = require('xml2js');

// Complexity weights (sum to reasonable scale)
const COMPLEXITY_WEIGHTS = {
    objectPermissions: 0.05,        // Per object
    fieldPermissions: 0.02,         // Per field (capped per segment)
    systemPermissions: 0.10,        // Per system permission
    applicationVisibility: 0.05,    // Per app
    classAccesses: 0.03,            // Per Apex class
    pageAccesses: 0.03,             // Per VF page
    customPermissions: 0.10,        // Per custom permission
    recordTypeVisibilities: 0.05,   // Per record type
    layoutAssignments: 0.02,        // Per layout
    tabSettings: 0.02               // Per tab
};

// Segment caps (prevent single segment from dominating score)
const SEGMENT_CAPS = {
    fieldPermissions: 0.30  // Cap field permissions at 0.30 (15 fields max impact)
};

// Complexity thresholds
const THRESHOLDS = {
    simple: 0.30,
    moderate: 0.70
};

// High-risk system permissions
const HIGH_RISK_PERMISSIONS = [
    'ModifyAllData',
    'ViewAllData',
    'ManageUsers',
    'ModifyMetadata',
    'EditReadOnlyFields',
    'ManageRoles'
];

class PermissionComplexityCalculator {
    constructor() {
        this.breakdown = {};
        this.totalScore = 0;
        this.rating = '';
        this.recommendation = '';
        this.highRiskPermissions = [];
    }

    /**
     * Calculate complexity from XML file
     */
    async calculateFromFile(filePath) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`Permission set file not found: ${filePath}`);
        }

        const xmlContent = fs.readFileSync(filePath, 'utf-8');
        const permissionSet = await parseStringPromise(xmlContent);

        return this.calculate(permissionSet.PermissionSet);
    }

    /**
     * Calculate complexity from parsed permission set object
     */
    calculate(permissionSet) {
        this.breakdown = {
            objectPermissions: 0,
            fieldPermissions: 0,
            systemPermissions: 0,
            applicationVisibility: 0,
            classAccesses: 0,
            pageAccesses: 0,
            customPermissions: 0,
            recordTypeVisibilities: 0,
            layoutAssignments: 0,
            tabSettings: 0
        };

        // Count each permission type
        const counts = {
            objectPermissions: this._countArray(permissionSet.objectPermissions),
            fieldPermissions: this._countArray(permissionSet.fieldPermissions),
            systemPermissions: this._countArray(permissionSet.userPermissions),
            applicationVisibility: this._countArray(permissionSet.applicationVisibilities),
            classAccesses: this._countArray(permissionSet.classAccesses),
            pageAccesses: this._countArray(permissionSet.pageAccesses),
            customPermissions: this._countArray(permissionSet.customPermissions),
            recordTypeVisibilities: this._countArray(permissionSet.recordTypeVisibilities),
            layoutAssignments: this._countArray(permissionSet.layoutAssignments),
            tabSettings: this._countArray(permissionSet.tabSettings)
        };

        // Calculate weighted scores
        for (const [key, count] of Object.entries(counts)) {
            let score = count * COMPLEXITY_WEIGHTS[key];

            // Apply segment caps
            if (SEGMENT_CAPS[key]) {
                score = Math.min(score, SEGMENT_CAPS[key]);
            }

            this.breakdown[key] = score;
        }

        // Calculate total score
        this.totalScore = Object.values(this.breakdown).reduce((sum, val) => sum + val, 0);
        this.totalScore = Math.min(this.totalScore, 1.0); // Cap at 1.0

        // Determine rating
        if (this.totalScore < THRESHOLDS.simple) {
            this.rating = 'simple';
        } else if (this.totalScore < THRESHOLDS.moderate) {
            this.rating = 'moderate';
        } else {
            this.rating = 'complex';
        }

        // Generate recommendation
        this._generateRecommendation(counts);

        // Detect high-risk system permissions
        this._detectHighRiskPermissions(permissionSet.userPermissions);

        return {
            totalScore: this.totalScore,
            breakdown: this.breakdown,
            counts: counts,
            rating: this.rating,
            recommendation: this.recommendation,
            highRiskPermissions: this.highRiskPermissions
        };
    }

    /**
     * Count array elements (handle xml2js structure)
     */
    _countArray(arr) {
        if (!arr) return 0;
        if (Array.isArray(arr)) return arr.length;
        return 1; // Single element parsed as object
    }

    /**
     * Generate recommendation based on complexity
     */
    _generateRecommendation(counts) {
        const recommendations = [];

        if (this.rating === 'simple') {
            recommendations.push('This is a straightforward permission set suitable for direct deployment.');
        } else if (this.rating === 'moderate') {
            recommendations.push('Consider using segmented approach for better maintainability.');

            if (counts.objectPermissions > 10) {
                recommendations.push('High object count - consider splitting into foundational sets (Tier 1).');
            }
            if (counts.fieldPermissions > 20) {
                recommendations.push('High field count - review for necessary fields only.');
            }
        } else { // complex
            recommendations.push('⚠️ STRONGLY RECOMMEND: Refactor to two-tier architecture.');
            recommendations.push('Split into Tier 1 foundational sets + Tier 2 composed set.');

            if (counts.objectPermissions > 15) {
                recommendations.push('Extract object-specific permissions to Tier 1 sets.');
            }
            if (counts.systemPermissions > 5) {
                recommendations.push('Review system permissions for necessity.');
            }
        }

        this.recommendation = recommendations.join('\n');
    }

    /**
     * Detect high-risk system permissions
     */
    _detectHighRiskPermissions(userPermissions) {
        if (!userPermissions) return;

        const perms = Array.isArray(userPermissions) ? userPermissions : [userPermissions];

        this.highRiskPermissions = perms
            .filter(perm => {
                const name = perm.name ? perm.name[0] : '';
                const enabled = perm.enabled ? perm.enabled[0] === 'true' : false;
                return HIGH_RISK_PERMISSIONS.includes(name) && enabled;
            })
            .map(perm => perm.name[0]);
    }

    /**
     * Format breakdown for display
     */
    formatBreakdown(includeDetails = false) {
        const lines = [];

        lines.push(`\nPermission Set Complexity Analysis`);
        lines.push(`${'='.repeat(50)}`);
        lines.push(`Overall Score: ${this.totalScore.toFixed(2)} (${this.rating.toUpperCase()})`);
        lines.push(`Rating: ${this._getRatingEmoji()} ${this.rating.toUpperCase()}`);
        lines.push('');

        if (includeDetails) {
            lines.push('Breakdown by Type:');
            lines.push('-'.repeat(50));

            for (const [key, score] of Object.entries(this.breakdown)) {
                if (score > 0) {
                    const label = this._formatLabel(key);
                    const bar = this._generateBar(score);
                    lines.push(`${label.padEnd(25)} ${bar} ${score.toFixed(3)}`);
                }
            }
            lines.push('');
        }

        if (this.highRiskPermissions.length > 0) {
            lines.push('⚠️  High-Risk System Permissions Detected:');
            this.highRiskPermissions.forEach(perm => {
                lines.push(`   - ${perm}`);
            });
            lines.push('');
        }

        lines.push('Recommendation:');
        lines.push('-'.repeat(50));
        lines.push(this.recommendation);

        return lines.join('\n');
    }

    /**
     * Get rating emoji
     */
    _getRatingEmoji() {
        switch (this.rating) {
            case 'simple': return '✅';
            case 'moderate': return '⚠️';
            case 'complex': return '🚨';
            default: return '';
        }
    }

    /**
     * Format label for display
     */
    _formatLabel(key) {
        return key
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase())
            .trim();
    }

    /**
     * Generate progress bar
     */
    _generateBar(score, maxWidth = 20) {
        const filled = Math.round(score * maxWidth);
        return '█'.repeat(filled) + '░'.repeat(maxWidth - filled);
    }
}

/**
 * CLI Interface
 */
async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help')) {
        console.log(`
Permission Set Complexity Calculator

Usage:
  node permission-complexity-calculator.js <command> [options]

Commands:
  calculate       Calculate complexity score
  breakdown       Show detailed complexity breakdown
  recommend       Show recommendations based on complexity

Options:
  --permission-set <file>    Path to permission set XML file (required)
  --format <format>          Output format: text, json (default: text)
  --help                     Show this help message

Examples:
  # Calculate complexity
  node permission-complexity-calculator.js calculate --permission-set ./permissionsets/Sales_Manager.permissionset-meta.xml

  # Show detailed breakdown
  node permission-complexity-calculator.js breakdown --permission-set ./permissionsets/Sales_Manager.permissionset-meta.xml

  # Get recommendations
  node permission-complexity-calculator.js recommend --permission-set ./permissionsets/Sales_Manager.permissionset-meta.xml

  # JSON output
  node permission-complexity-calculator.js calculate --permission-set ./permissionsets/Sales_Manager.permissionset-meta.xml --format json
        `);
        process.exit(0);
    }

    const command = args[0];
    const permissionSetIndex = args.indexOf('--permission-set');
    const formatIndex = args.indexOf('--format');

    if (permissionSetIndex === -1 || !args[permissionSetIndex + 1]) {
        console.error('Error: --permission-set option is required');
        process.exit(1);
    }

    const permissionSetPath = args[permissionSetIndex + 1];
    const format = formatIndex !== -1 ? args[formatIndex + 1] : 'text';

    try {
        const calculator = new PermissionComplexityCalculator();
        const result = await calculator.calculateFromFile(permissionSetPath);

        if (format === 'json') {
            console.log(JSON.stringify(result, null, 2));
        } else {
            switch (command) {
                case 'calculate':
                    console.log(calculator.formatBreakdown(false));
                    break;
                case 'breakdown':
                    console.log(calculator.formatBreakdown(true));
                    break;
                case 'recommend':
                    console.log('\nRecommendations:');
                    console.log('='.repeat(50));
                    console.log(calculator.recommendation);
                    if (calculator.highRiskPermissions.length > 0) {
                        console.log('\n⚠️  High-Risk Permissions:');
                        calculator.highRiskPermissions.forEach(perm => {
                            console.log(`   - ${perm} (requires security team approval)`);
                        });
                    }
                    break;
                default:
                    console.error(`Unknown command: ${command}`);
                    console.error('Use --help to see available commands');
                    process.exit(1);
            }
        }

        process.exit(0);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

// Export for programmatic use
module.exports = PermissionComplexityCalculator;

// Run CLI if executed directly
if (require.main === module) {
    main().catch(error => {
        console.error(`Fatal error: ${error.message}`);
        process.exit(1);
    });
}
