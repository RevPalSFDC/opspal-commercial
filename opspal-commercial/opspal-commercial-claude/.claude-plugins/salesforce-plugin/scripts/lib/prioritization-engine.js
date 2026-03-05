#!/usr/bin/env node

/**
 * Prioritization Engine
 *
 * Groups field collision conflicts into sprint-sized work units with capacity planning.
 * Uses intelligent grouping to batch related collisions and respect team velocity.
 *
 * Features:
 * - Sprint capacity modeling (velocity, points per sprint)
 * - CRITICAL-first prioritization
 * - Object-based grouping (fix all Account fields together)
 * - Dependency detection (Quote → QuoteLine ordering)
 * - Effort estimation based on complexity
 *
 * @version 1.0.0
 * @date 2025-10-20
 */

const fs = require('fs');
const path = require('path');

class PrioritizationEngine {
    constructor(options = {}) {
        this.verbose = options.verbose || false;

        // Sprint capacity configuration
        this.config = {
            sprintLengthWeeks: options.sprintLengthWeeks || 2,
            teamVelocity: options.teamVelocity || 40, // story points per sprint
            maxItemsPerSprint: options.maxItemsPerSprint || 8,
            bufferPercentage: options.bufferPercentage || 0.2 // 20% buffer for unknowns
        };

        // Effort estimation by collision type (in story points)
        this.effortMap = {
            'WRITE_WRITE': 8,        // High effort - requires careful consolidation
            'READ_WRITE': 5,         // Medium effort - sequencing or consolidation
            'READ_WRITE_SINGLE': 3,  // Low effort - refactor single automation
            'READ_READ': 2,          // Very low effort - documentation only
            'UNKNOWN': 5             // Medium effort - investigation required
        };

        // Object dependency chains (parent → children)
        this.dependencyChains = {
            'Account': ['Contact', 'Opportunity'],
            'Opportunity': ['OpportunityLineItem', 'Quote__c', 'SBQQ__Quote__c'],
            'Quote__c': ['QuoteLine__c'],
            'SBQQ__Quote__c': ['SBQQ__QuoteLine__c'],
            'Campaign': ['CampaignMember'],
            'Lead': [],
            'Case': ['CaseComment']
        };
    }

    /**
     * Prioritize collisions into sprint-sized work units
     * @param {Array} rankedCollisions - Collisions with priority scores (from FieldCollisionAnalyzer)
     * @returns {Object} Sprint plan with batched collisions
     */
    prioritizeIntoSprints(rankedCollisions) {
        if (!rankedCollisions || rankedCollisions.length === 0) {
            return { sprints: [], summary: this.generateEmptySummary() };
        }

        // Step 1: Estimate effort for each collision
        const collisionsWithEffort = this.estimateEffort(rankedCollisions);

        // Step 2: Group by object for better batching
        const objectGroups = this.groupByObject(collisionsWithEffort);

        // Step 3: Sort object groups by dependency order and priority
        const sortedGroups = this.sortByDependencies(objectGroups);

        // Step 4: Pack into sprints with capacity constraints
        const sprints = this.packIntoSprints(sortedGroups);

        // Step 5: Generate summary statistics
        const summary = this.generateSummary(sprints, collisionsWithEffort);

        return { sprints, summary };
    }

    /**
     * Estimate effort for each collision
     * @param {Array} collisions - Ranked collisions
     * @returns {Array} Collisions with effort estimates
     */
    estimateEffort(collisions) {
        return collisions.map(collision => {
            const collisionType = collision.collisionCategory?.collisionType || 'UNKNOWN';
            const baseEffort = this.effortMap[collisionType] || 5;

            // Adjust effort based on automation count
            const automationCount = collision.involved?.length || 1;
            const automationMultiplier = automationCount > 3 ? 1.5 : 1.0;

            // Adjust effort based on severity (CRITICAL gets extra testing time)
            const severityMultiplier = collision.severity === 'CRITICAL' ? 1.3 : 1.0;

            const totalEffort = Math.ceil(baseEffort * automationMultiplier * severityMultiplier);

            return {
                ...collision,
                estimatedEffort: totalEffort,
                effortBreakdown: {
                    base: baseEffort,
                    automationMultiplier,
                    severityMultiplier,
                    total: totalEffort
                }
            };
        });
    }

    /**
     * Group collisions by object
     * @param {Array} collisions - Collisions with effort
     * @returns {Object} Object groups
     */
    groupByObject(collisions) {
        const groups = {};

        collisions.forEach(collision => {
            const object = collision.object || 'Unknown';
            if (!groups[object]) {
                groups[object] = [];
            }
            groups[object].push(collision);
        });

        // Sort collisions within each group by priority score (descending)
        Object.keys(groups).forEach(object => {
            groups[object].sort((a, b) => b.priorityScore - a.priorityScore);
        });

        return groups;
    }

    /**
     * Sort object groups by dependencies and priority
     * @param {Object} objectGroups - Groups by object
     * @returns {Array} Sorted array of {object, collisions}
     */
    sortByDependencies(objectGroups) {
        const sorted = [];
        const processed = new Set();

        // Helper: Process object and its dependencies
        const processObject = (object) => {
            if (processed.has(object)) return;
            processed.add(object);

            // Process dependencies first (parent objects before children)
            const dependencies = this.getDependencies(object);
            dependencies.forEach(dep => {
                if (objectGroups[dep] && !processed.has(dep)) {
                    processObject(dep);
                }
            });

            // Add this object's collisions
            if (objectGroups[object]) {
                sorted.push({
                    object,
                    collisions: objectGroups[object],
                    totalEffort: objectGroups[object].reduce((sum, c) => sum + c.estimatedEffort, 0),
                    maxPriority: Math.max(...objectGroups[object].map(c => c.priorityScore))
                });
            }
        };

        // Process all objects, prioritizing those with CRITICAL collisions
        const criticalObjects = Object.keys(objectGroups)
            .filter(obj => objectGroups[obj].some(c => c.severity === 'CRITICAL'))
            .sort((a, b) => {
                const aMax = Math.max(...objectGroups[a].map(c => c.priorityScore));
                const bMax = Math.max(...objectGroups[b].map(c => c.priorityScore));
                return bMax - aMax;
            });

        const otherObjects = Object.keys(objectGroups)
            .filter(obj => !criticalObjects.includes(obj))
            .sort((a, b) => {
                const aMax = Math.max(...objectGroups[a].map(c => c.priorityScore));
                const bMax = Math.max(...objectGroups[b].map(c => c.priorityScore));
                return bMax - aMax;
            });

        // Process CRITICAL objects first
        criticalObjects.forEach(obj => processObject(obj));

        // Then process others
        otherObjects.forEach(obj => processObject(obj));

        return sorted;
    }

    /**
     * Get parent dependencies for an object
     * @param {string} object - Object name
     * @returns {Array} Parent objects
     */
    getDependencies(object) {
        // Find parent objects (objects that have this object as a child)
        const parents = [];
        Object.keys(this.dependencyChains).forEach(parent => {
            if (this.dependencyChains[parent].includes(object)) {
                parents.push(parent);
            }
        });
        return parents;
    }

    /**
     * Pack object groups into sprints with capacity constraints
     * @param {Array} sortedGroups - Sorted object groups
     * @returns {Array} Sprint plan
     */
    packIntoSprints(sortedGroups) {
        const sprints = [];
        let currentSprint = this.createEmptySprint(1);
        const availableCapacity = Math.floor(this.config.teamVelocity * (1 - this.config.bufferPercentage));

        sortedGroups.forEach(group => {
            const groupEffort = group.totalEffort;

            // Check if this group fits in current sprint
            if (currentSprint.totalEffort + groupEffort <= availableCapacity &&
                currentSprint.collisions.length + group.collisions.length <= this.config.maxItemsPerSprint) {
                // Add to current sprint
                currentSprint.collisions.push(...group.collisions);
                currentSprint.objects.add(group.object);
                currentSprint.totalEffort += groupEffort;
            } else {
                // Start new sprint
                sprints.push(this.finalizeSprint(currentSprint));
                currentSprint = this.createEmptySprint(sprints.length + 1);
                currentSprint.collisions.push(...group.collisions);
                currentSprint.objects.add(group.object);
                currentSprint.totalEffort += groupEffort;
            }
        });

        // Add final sprint if it has collisions
        if (currentSprint.collisions.length > 0) {
            sprints.push(this.finalizeSprint(currentSprint));
        }

        return sprints;
    }

    /**
     * Create empty sprint
     * @param {number} sprintNumber - Sprint number
     * @returns {Object} Empty sprint
     */
    createEmptySprint(sprintNumber) {
        return {
            sprintNumber,
            name: `Sprint ${sprintNumber}`,
            collisions: [],
            objects: new Set(),
            totalEffort: 0,
            capacityUtilization: 0,
            riskLevel: 'LOW'
        };
    }

    /**
     * Finalize sprint with metadata
     * @param {Object} sprint - Sprint to finalize
     * @returns {Object} Finalized sprint
     */
    finalizeSprint(sprint) {
        const availableCapacity = Math.floor(this.config.teamVelocity * (1 - this.config.bufferPercentage));

        return {
            ...sprint,
            objects: Array.from(sprint.objects),
            capacityUtilization: Math.round((sprint.totalEffort / availableCapacity) * 100),
            riskLevel: this.calculateSprintRisk(sprint),
            goals: this.generateSprintGoals(sprint),
            dependencies: this.identifySprintDependencies(sprint)
        };
    }

    /**
     * Calculate sprint risk level
     * @param {Object} sprint - Sprint
     * @returns {string} Risk level
     */
    calculateSprintRisk(sprint) {
        const criticalCount = sprint.collisions.filter(c => c.severity === 'CRITICAL').length;
        const highCount = sprint.collisions.filter(c => c.severity === 'HIGH').length;

        if (criticalCount >= 3 || sprint.capacityUtilization > 90) return 'HIGH';
        if (criticalCount >= 1 || highCount >= 3 || sprint.capacityUtilization > 75) return 'MEDIUM';
        return 'LOW';
    }

    /**
     * Generate sprint goals
     * @param {Object} sprint - Sprint
     * @returns {Array} Sprint goals
     */
    generateSprintGoals(sprint) {
        const goals = [];
        const criticalCount = sprint.collisions.filter(c => c.severity === 'CRITICAL').length;
        const objects = Array.from(sprint.objects);

        if (criticalCount > 0) {
            goals.push(`Resolve ${criticalCount} CRITICAL field collision(s) to prevent data corruption`);
        }

        if (objects.length === 1) {
            goals.push(`Complete field remediation for ${objects[0]} object`);
        } else if (objects.length > 1) {
            goals.push(`Remediate field collisions across ${objects.length} objects: ${objects.join(', ')}`);
        }

        goals.push(`Deliver ${sprint.totalEffort} story points of field collision fixes`);

        return goals;
    }

    /**
     * Identify sprint dependencies
     * @param {Object} sprint - Sprint
     * @returns {Array} Dependencies
     */
    identifySprintDependencies(sprint) {
        const dependencies = [];
        const objects = Array.from(sprint.objects);

        objects.forEach(obj => {
            const parents = this.getDependencies(obj);
            parents.forEach(parent => {
                if (!objects.includes(parent)) {
                    dependencies.push(`Depends on ${parent} collisions being resolved first`);
                }
            });
        });

        return dependencies;
    }

    /**
     * Generate summary statistics
     * @param {Array} sprints - Sprints
     * @param {Array} collisions - All collisions
     * @returns {Object} Summary
     */
    generateSummary(sprints, collisions) {
        const totalEffort = collisions.reduce((sum, c) => sum + c.estimatedEffort, 0);
        const totalSprints = sprints.length;
        const estimatedWeeks = totalSprints * this.config.sprintLengthWeeks;

        return {
            totalCollisions: collisions.length,
            criticalCollisions: collisions.filter(c => c.severity === 'CRITICAL').length,
            highCollisions: collisions.filter(c => c.severity === 'HIGH').length,
            mediumCollisions: collisions.filter(c => c.severity === 'MEDIUM').length,
            lowCollisions: collisions.filter(c => c.severity === 'LOW').length,
            totalEffort,
            averageEffortPerCollision: Math.round(totalEffort / collisions.length * 10) / 10,
            totalSprints,
            estimatedWeeks,
            estimatedMonths: Math.ceil(estimatedWeeks / 4),
            capacityUtilization: Math.round((totalEffort / (totalSprints * this.config.teamVelocity)) * 100),
            quickWins: this.identifyQuickWins(collisions)
        };
    }

    /**
     * Generate empty summary
     * @returns {Object} Empty summary
     */
    generateEmptySummary() {
        return {
            totalCollisions: 0,
            criticalCollisions: 0,
            highCollisions: 0,
            mediumCollisions: 0,
            lowCollisions: 0,
            totalEffort: 0,
            averageEffortPerCollision: 0,
            totalSprints: 0,
            estimatedWeeks: 0,
            estimatedMonths: 0,
            capacityUtilization: 0,
            quickWins: []
        };
    }

    /**
     * Identify quick wins (low effort, high impact)
     * @param {Array} collisions - All collisions
     * @returns {Array} Quick wins
     */
    identifyQuickWins(collisions) {
        return collisions
            .filter(c => c.estimatedEffort <= 3 && (c.severity === 'HIGH' || c.severity === 'CRITICAL'))
            .sort((a, b) => b.priorityScore - a.priorityScore)
            .slice(0, 5)
            .map(c => ({
                id: c.conflictId,
                field: c.field,
                object: c.object,
                severity: c.severity,
                effort: c.estimatedEffort,
                priorityScore: c.priorityScore
            }));
    }
}

module.exports = PrioritizationEngine;

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage: node prioritization-engine.js <analyzed-collisions-json> [--verbose]');
        console.log('');
        console.log('Prioritizes analyzed field collisions into sprint-sized work units.');
        console.log('');
        console.log('Example:');
        console.log('  node prioritization-engine.js analyzed-collisions.json --verbose');
        process.exit(1);
    }

    const inputFile = args[0];
    const verbose = args.includes('--verbose');

    if (!fs.existsSync(inputFile)) {
        console.error(`Error: File not found: ${inputFile}`);
        process.exit(1);
    }

    // Input should be analysis results from FieldCollisionAnalyzer
    const analysisResults = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
    const collisions = analysisResults.allCollisions || analysisResults.topCollisions || analysisResults;

    const engine = new PrioritizationEngine({ verbose });
    const sprintPlan = engine.prioritizeIntoSprints(collisions);

    console.log('\n=== Sprint Prioritization Plan ===\n');
    console.log(`Total Collisions: ${sprintPlan.summary.totalCollisions}`);
    console.log(`Total Effort: ${sprintPlan.summary.totalEffort} story points`);
    console.log(`Estimated Duration: ${sprintPlan.summary.estimatedWeeks} weeks (${sprintPlan.summary.totalSprints} sprints)`);
    console.log('');

    sprintPlan.sprints.forEach(sprint => {
        console.log(`${sprint.name} (Risk: ${sprint.riskLevel})`);
        console.log(`  Effort: ${sprint.totalEffort} points (${sprint.capacityUtilization}% capacity)`);
        console.log(`  Objects: ${sprint.objects.join(', ')}`);
        console.log(`  Collisions: ${sprint.collisions.length}`);
        console.log(`  Goals:`);
        sprint.goals.forEach(goal => console.log(`    - ${goal}`));
        console.log('');
    });

    if (sprintPlan.summary.quickWins.length > 0) {
        console.log('Quick Wins (Low Effort, High Impact):');
        sprintPlan.summary.quickWins.forEach((qw, i) => {
            console.log(`  ${i + 1}. ${qw.object}.${qw.field} - ${qw.severity} (${qw.effort} points)`);
        });
        console.log('');
    }

    // Write output
    const outputFile = inputFile.replace('.json', '-sprint-plan.json');
    fs.writeFileSync(outputFile, JSON.stringify(sprintPlan, null, 2));
    console.log(`Sprint plan written to: ${outputFile}`);
}
