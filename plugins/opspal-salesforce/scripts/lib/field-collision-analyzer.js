#!/usr/bin/env node

/**
 * Field Collision Analyzer
 *
 * Analyzes field-level automation collisions to provide actionable intelligence:
 * - Ranks collisions by business impact
 * - Generates detailed remediation plans
 * - Provides field-level context and affected automations
 *
 * Purpose: Transform raw conflict data into prioritized, actionable insights
 *
 * @version 1.0.0
 * @date 2025-10-20
 */

const fs = require('fs');
const path = require('path');
const ExecutionOrderResolver = require('./execution-order-resolver');

class FieldCollisionAnalyzer {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.executionOrderResolver = new ExecutionOrderResolver();

        // Severity weights for prioritization
        this.severityWeights = {
            'CRITICAL': 100,
            'HIGH': 50,
            'MEDIUM': 20,
            'LOW': 5
        };

        // Field criticality scores (common Salesforce fields)
        this.fieldCriticalityMap = {
            'OwnerId': 50,
            'RecordTypeId': 45,
            'AccountId': 40,
            'ContactId': 40,
            'OpportunityId': 40,
            'Amount': 35,
            'CloseDate': 35,
            'StageName': 35,
            'Status': 30,
            'Type': 25,
            'Email': 30,
            'Phone': 25,
            'BillingStreet': 20,
            'BillingCity': 20,
            'BillingState': 20,
            'BillingPostalCode': 20,
            'BillingCountry': 20
        };

        // Implementation complexity factors
        this.complexityFactors = {
            'WRITE_WRITE': 30, // High complexity - requires careful consolidation
            'READ_WRITE': 20,  // Medium complexity - sequencing or consolidation
            'READ_WRITE_SINGLE': 10, // Low complexity - refactor single automation
            'READ_READ': 5,    // Very low complexity - documentation only
            'UNKNOWN': 25      // Medium-high - requires investigation
        };
    }

    /**
     * Analyze field collisions from conflicts data
     * @param {Array} conflicts - Array of conflict objects from audit
     * @param {Object} options - Analysis options
     * @returns {Object} Analysis results
     */
    analyzeCollisions(conflicts, options = {}) {
        const fieldCollisions = this.extractFieldCollisions(conflicts);
        const rankedCollisions = this.rankCollisionsByImpact(fieldCollisions);
        const topCollisions = rankedCollisions.slice(0, options.limit || 10);

        return {
            totalCollisions: fieldCollisions.length,
            criticalCollisions: fieldCollisions.filter(c => c.severity === 'CRITICAL').length,
            highCollisions: fieldCollisions.filter(c => c.severity === 'HIGH').length,
            topCollisions,
            allCollisions: rankedCollisions
        };
    }

    /**
     * Extract field collision conflicts from all conflicts
     * @param {Array} conflicts - All conflicts
     * @returns {Array} Field collision conflicts only
     */
    extractFieldCollisions(conflicts) {
        return conflicts.filter(c =>
            c.rule === 'FIELD_WRITE_COLLISION' && c.collisionCategory
        );
    }

    /**
     * Rank collisions by business impact
     * @param {Array} collisions - Field collisions
     * @returns {Array} Ranked collisions with priority scores
     */
    rankCollisionsByImpact(collisions) {
        return collisions
            .map(collision => {
                const score = this.calculatePriorityScore(collision);
                const finalWriterDetermination = this.determineFinalWriter(collision);
                return {
                    ...collision,
                    priorityScore: score,
                    finalWriterDetermination,
                    ranking: null // Will be set after sorting
                };
            })
            .sort((a, b) => b.priorityScore - a.priorityScore)
            .map((collision, index) => ({
                ...collision,
                ranking: index + 1
            }));
    }

    /**
     * Determine final writer for a collision (v3.29.0)
     * @param {Object} collision - Collision object with writers
     * @returns {Object} Final writer determination
     */
    determineFinalWriter(collision) {
        if (!collision.writers || collision.writers.length === 0) {
            return null;
        }

        // Map collision writers to format expected by ExecutionOrderResolver
        const writerObjects = collision.writers.map(writer => ({
            automationName: writer.sourceName || writer.automationName,
            automationType: writer.sourceType || writer.type,
            timing: writer.timing,
            triggerOrder: writer.triggerOrder || writer.TriggerOrder || null
        }));

        const collisionForResolver = {
            writers: writerObjects
        };

        return this.executionOrderResolver.determineFinalWriter(collisionForResolver);
    }

    /**
     * Calculate priority score for a collision
     * @param {Object} collision - Collision object
     * @returns {number} Priority score
     */
    calculatePriorityScore(collision) {
        const category = collision.collisionCategory;
        const field = collision.field;

        // Extract field name from full path (e.g., "Account.BillingCity" -> "BillingCity")
        const fieldName = field ? field.split('.').pop() : '';

        // Component 1: Severity weight (100 for CRITICAL, 50 for HIGH, etc.)
        const severityScore = this.severityWeights[category.severity] || 0;

        // Component 2: Automation count (10 points per automation involved)
        const automationCount = collision.involved ? collision.involved.length : 0;
        const automationScore = automationCount * 10;

        // Component 3: Field criticality (based on field importance)
        const criticalityScore = this.getFieldCriticality(fieldName, collision.object);

        // Component 4: Business process impact (based on object)
        const processImpactScore = this.getBusinessProcessImpact(collision.object);

        // Component 5: Implementation complexity (negative - higher complexity reduces priority)
        const complexityPenalty = this.complexityFactors[category.collisionType] || 0;

        // Total score
        const totalScore = severityScore + automationScore + criticalityScore + processImpactScore - complexityPenalty;

        if (this.verbose) {
            console.log(`Scoring ${collision.conflictId}:`);
            console.log(`  Severity: ${severityScore}`);
            console.log(`  Automations: ${automationScore}`);
            console.log(`  Criticality: ${criticalityScore}`);
            console.log(`  Process Impact: ${processImpactScore}`);
            console.log(`  Complexity Penalty: -${complexityPenalty}`);
            console.log(`  TOTAL: ${totalScore}`);
        }

        return totalScore;
    }

    /**
     * Get field criticality score
     * @param {string} fieldName - Field API name
     * @param {string} objectName - Object API name
     * @returns {number} Criticality score
     */
    getFieldCriticality(fieldName, objectName) {
        // Check exact match in criticality map
        if (this.fieldCriticalityMap[fieldName]) {
            return this.fieldCriticalityMap[fieldName];
        }

        // Heuristic: ID fields are critical
        if (fieldName.endsWith('Id')) return 30;

        // Heuristic: Name fields are important
        if (fieldName === 'Name') return 25;

        // Heuristic: Date fields are moderately important
        if (fieldName.includes('Date')) return 20;

        // Heuristic: Currency/number fields are important
        if (fieldName.includes('Amount') || fieldName.includes('Price') || fieldName.includes('Value')) return 25;

        // Default: moderate importance
        return 15;
    }

    /**
     * Get business process impact score based on object
     * @param {string} objectName - Salesforce object name
     * @returns {number} Business process impact score
     */
    getBusinessProcessImpact(objectName) {
        // Core revenue objects
        if (['Account', 'Opportunity', 'Quote__c', 'SBQQ__Quote__c', 'Contract'].includes(objectName)) {
            return 50;
        }

        // Lead generation / marketing
        if (['Lead', 'Campaign', 'CampaignMember'].includes(objectName)) {
            return 40;
        }

        // Customer support
        if (['Case', 'Contact'].includes(objectName)) {
            return 35;
        }

        // Operations
        if (['Task', 'Event', 'User'].includes(objectName)) {
            return 25;
        }

        // Custom objects (moderate impact assumed)
        if (objectName.endsWith('__c')) {
            return 30;
        }

        // Default
        return 20;
    }

    /**
     * Generate detailed field collision report
     * @param {Object} collision - Collision object with analysis
     * @returns {Object} Detailed report
     */
    generateCollisionReport(collision) {
        const category = collision.collisionCategory;
        const field = collision.field;
        const fieldName = field ? field.split('.').pop() : 'Unknown';

        return {
            id: collision.conflictId,
            ranking: collision.ranking,
            priorityScore: collision.priorityScore,
            title: `${category.severity}: ${collision.object}.${fieldName} ${category.collisionType}`,

            // Field details
            field: {
                fullPath: field,
                fieldName,
                object: collision.object
            },

            // Collision details
            collision: {
                type: category.collisionType,
                severity: category.severity,
                writeCount: category.writeCount,
                readCount: category.readCount,
                operationBreakdown: category.operationBreakdown || []
            },

            // Business context
            businessContext: {
                affectedProcesses: this.getAffectedProcesses(collision.object),
                userImpact: this.getUserImpact(category.severity, collision.object),
                riskLevel: category.severity
            },

            // Remediation
            remediation: {
                approach: this.getRemediationApproach(category.collisionType),
                steps: collision.recommendation?.steps || [],
                estimatedEffort: collision.recommendation?.estimatedTime || 'Unknown',
                complexity: collision.recommendation?.complexity || 'MEDIUM',
                successCriteria: this.getSuccessCriteria(collision)
            }
        };
    }

    /**
     * Get affected business processes for an object
     * @param {string} objectName - Salesforce object
     * @returns {Array} Affected processes
     */
    getAffectedProcesses(objectName) {
        const processMap = {
            'Account': ['Lead to Account Conversion', 'Account Management', 'Revenue Reporting'],
            'Opportunity': ['Sales Pipeline', 'Revenue Forecasting', 'Renewal Management'],
            'Lead': ['Lead Capture', 'Lead Qualification', 'Lead Assignment'],
            'Contact': ['Contact Management', 'Email Communications', 'Activity Tracking'],
            'Case': ['Customer Support', 'Case Routing', 'SLA Management'],
            'Campaign': ['Marketing Campaigns', 'Lead Generation', 'ROI Tracking'],
            'CampaignMember': ['Campaign Response', 'Lead Nurturing', 'Attribution'],
            'Contract': ['Contract Management', 'Renewal Tracking', 'Subscription Management'],
            'Quote__c': ['Quote Generation', 'Pricing', 'Approval Workflows'],
            'SBQQ__Quote__c': ['CPQ Quote Generation', 'Pricing', 'Approval Workflows']
        };

        return processMap[objectName] || ['General Operations'];
    }

    /**
     * Get user impact description
     * @param {string} severity - Severity level
     * @param {string} objectName - Object name
     * @returns {string} User impact description
     */
    getUserImpact(severity, objectName) {
        if (severity === 'CRITICAL') {
            return `CRITICAL: Data corruption risk. Users may see inconsistent field values on ${objectName} records. High risk of incorrect business decisions.`;
        } else if (severity === 'HIGH') {
            return `HIGH: Race conditions may cause unexpected field values. Users may experience intermittent data inconsistencies on ${objectName} records.`;
        } else if (severity === 'MEDIUM') {
            return `MEDIUM: Potential for complexity and maintenance issues. May cause confusion for admins modifying ${objectName} automations.`;
        } else {
            return `LOW: Minimal user impact. Primarily a code quality and maintainability concern for ${objectName}.`;
        }
    }

    /**
     * Get remediation approach for collision type
     * @param {string} collisionType - Type of collision
     * @returns {string} Remediation approach
     */
    getRemediationApproach(collisionType) {
        const approaches = {
            'WRITE_WRITE': 'CONSOLIDATE: Merge all write operations into single automation to ensure deterministic execution',
            'READ_WRITE': 'SEQUENCE: Ensure write operations complete before read operations, or consolidate into single automation',
            'READ_WRITE_SINGLE': 'REFACTOR: Simplify single automation to separate read and write concerns',
            'READ_READ': 'DOCUMENT: Add comments explaining read logic; consider consolidation for maintainability',
            'UNKNOWN': 'INVESTIGATE: Manual analysis required to determine safe remediation approach'
        };

        return approaches[collisionType] || 'Review and determine appropriate remediation strategy';
    }

    /**
     * Get success criteria for collision remediation
     * @param {Object} collision - Collision object
     * @returns {Array} Success criteria
     */
    getSuccessCriteria(collision) {
        const field = collision.field;
        const category = collision.collisionCategory;

        const baseCriteria = [
            `Only one automation writes to ${field}`,
            `Field value is deterministic and predictable`,
            `All existing test cases pass`,
            `Manual testing confirms field behavior is correct`
        ];

        if (category.collisionType === 'WRITE_WRITE') {
            baseCriteria.push('Performance testing shows no regression (bulk operations with 200 records)');
            baseCriteria.push('All business logic from original automations preserved');
        }

        if (category.severity === 'CRITICAL') {
            baseCriteria.push('Stakeholder sign-off obtained before production deployment');
        }

        return baseCriteria;
    }
}

module.exports = FieldCollisionAnalyzer;

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage: node field-collision-analyzer.js <conflicts-json-file> [--verbose] [--limit N]');
        console.log('');
        console.log('Analyzes field collisions and ranks by business impact.');
        console.log('');
        console.log('Example:');
        console.log('  node field-collision-analyzer.js ./findings/Conflicts.json --limit 10');
        process.exit(1);
    }

    const conflictsFile = args[0];
    const verbose = args.includes('--verbose');
    const limitIndex = args.indexOf('--limit');
    const limit = limitIndex !== -1 && args[limitIndex + 1] ? parseInt(args[limitIndex + 1]) : 10;

    if (!fs.existsSync(conflictsFile)) {
        console.error(`Error: File not found: ${conflictsFile}`);
        process.exit(1);
    }

    const conflicts = JSON.parse(fs.readFileSync(conflictsFile, 'utf8'));
    const analyzer = new FieldCollisionAnalyzer({ verbose });

    const analysis = analyzer.analyzeCollisions(conflicts, { limit });

    console.log('\n=== Field Collision Analysis ===\n');
    console.log(`Total Field Collisions: ${analysis.totalCollisions}`);
    console.log(`  CRITICAL: ${analysis.criticalCollisions}`);
    console.log(`  HIGH: ${analysis.highCollisions}`);
    console.log('');
    console.log(`Top ${limit} Collisions by Business Impact:`);
    console.log('');

    analysis.topCollisions.forEach(collision => {
        const report = analyzer.generateCollisionReport(collision);
        console.log(`${report.ranking}. ${report.title}`);
        console.log(`   Priority Score: ${report.priorityScore}`);
        console.log(`   Field: ${report.field.fullPath}`);
        console.log(`   Automations: ${report.collision.operationBreakdown.length}`);
        console.log(`   Impact: ${report.businessContext.userImpact.split('.')[0]}`);
        console.log('');
    });
}
