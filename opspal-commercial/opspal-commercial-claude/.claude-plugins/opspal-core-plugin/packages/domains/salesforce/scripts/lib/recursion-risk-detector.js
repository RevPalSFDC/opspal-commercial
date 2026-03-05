#!/usr/bin/env node

/**
 * Recursion Risk Detector (v3.29.0)
 *
 * Purpose: Detect recursion and re-entry risks in Apex Triggers and Flows.
 *
 * Features:
 * - Detects Apex triggers without static recursion guards
 * - Flags triggers that update their own object without guards
 * - Detects Flows that update fields in their entry criteria (self-reinforcing)
 * - Identifies circular flow chains (Flow A → Flow B → Flow A)
 * - Classifies risk levels: HIGH, MEDIUM, LOW
 *
 * Apex Recursion Patterns:
 * - Safe: static Boolean hasRun = false; check at beginning
 * - Safe: static Set<Id> processedIds = new Set<Id>();
 * - RISK: No guard + updates own object
 * - RISK: No guard + calls methods that update own object
 *
 * Flow Recursion Patterns:
 * - RISK: Entry criteria includes "Status = 'New'" and flow sets Status = 'Processing'
 * - HIGH RISK: Entry criteria field is also updated by flow
 * - CRITICAL: Flow can re-trigger itself infinitely
 *
 * Usage:
 *   const detector = new RecursionRiskDetector();
 *   const apexRisk = detector.detectApexRecursion(trigger, triggerBody);
 *   const flowRisk = detector.detectFlowRecursion(flow, flowMetadata, fieldWrites);
 *
 * @version 1.0.0
 * @date 2025-10-22
 */

class RecursionRiskDetector {
    constructor() {
        this.RISK_LEVELS = {
            HIGH: 'HIGH',
            MEDIUM: 'MEDIUM',
            LOW: 'LOW',
            NONE: 'NONE'
        };

        // Common recursion guard patterns
        this.GUARD_PATTERNS = [
            /static\s+Boolean\s+\w+\s*=\s*false/i,           // static Boolean hasRun = false
            /static\s+Boolean\s+\w+\s*=\s*true/i,            // static Boolean processed = true
            /static\s+Set<Id>\s+\w+/i,                        // static Set<Id> processedIds
            /static\s+Map<Id,\s*\w+>\s+\w+/i,                // static Map<Id, ...> cache
            /TriggerRecursionHelper/i,                        // Custom helper class
            /RecursionBlocker/i                               // Custom blocker pattern
        ];

        // DML operation patterns (updates own object)
        this.DML_PATTERNS = [
            /update\s+\w+/i,
            /insert\s+\w+/i,
            /upsert\s+\w+/i,
            /Database\.update/i,
            /Database\.insert/i
        ];
    }

    /**
     * Detect recursion risk in Apex Trigger
     * @param {Object} trigger - ApexTrigger record
     * @param {string} triggerBody - Trigger source code
     * @returns {Object} Risk analysis
     */
    detectApexRecursion(trigger, triggerBody) {
        if (!triggerBody) {
            return {
                riskLevel: this.RISK_LEVELS.NONE,
                hasGuard: false,
                updatesOwnObject: false,
                reason: 'No trigger body available for analysis'
            };
        }

        // Check for recursion guards
        const hasGuard = this.hasRecursionGuard(triggerBody);

        // Check if trigger updates its own object
        const updatesOwnObject = this.updatesOwnObject(trigger, triggerBody);

        // Check for DML in loops (governor limit risk + recursion risk)
        const hasDMLInLoop = this.hasDMLInLoop(triggerBody);

        // Determine risk level
        let riskLevel = this.RISK_LEVELS.NONE;
        let reason = 'No recursion risk detected';

        if (updatesOwnObject && !hasGuard) {
            riskLevel = this.RISK_LEVELS.HIGH;
            reason = 'Trigger updates own object without recursion guard. Can cause infinite loops.';
        } else if (updatesOwnObject && hasGuard) {
            riskLevel = this.RISK_LEVELS.LOW;
            reason = 'Trigger updates own object but has recursion guard present.';
        } else if (!hasGuard && hasDMLInLoop) {
            riskLevel = this.RISK_LEVELS.MEDIUM;
            reason = 'No recursion guard and DML in loop detected. Potential bulk operation re-entry risk.';
        }

        return {
            triggerName: trigger.Name,
            triggerObject: trigger.TableEnumOrId,
            riskLevel,
            hasGuard,
            updatesOwnObject,
            hasDMLInLoop,
            reason,
            guardPattern: hasGuard ? this.identifyGuardPattern(triggerBody) : null,
            recommendation: this.generateApexRecommendation(riskLevel, updatesOwnObject, hasGuard)
        };
    }

    /**
     * Check if trigger has recursion guard
     * @param {string} triggerBody - Source code
     * @returns {boolean} True if guard found
     */
    hasRecursionGuard(triggerBody) {
        return this.GUARD_PATTERNS.some(pattern => pattern.test(triggerBody));
    }

    /**
     * Identify which guard pattern is used
     * @param {string} triggerBody - Source code
     * @returns {string|null} Guard pattern name
     */
    identifyGuardPattern(triggerBody) {
        if (/static\s+Boolean/i.test(triggerBody)) {
            return 'Static Boolean flag';
        }
        if (/static\s+Set<Id>/i.test(triggerBody)) {
            return 'Static Set<Id> tracker';
        }
        if (/static\s+Map<Id/i.test(triggerBody)) {
            return 'Static Map cache';
        }
        if (/TriggerRecursionHelper|RecursionBlocker/i.test(triggerBody)) {
            return 'Custom recursion helper class';
        }
        return 'Unknown pattern';
    }

    /**
     * Check if trigger updates its own object
     * @param {Object} trigger - Trigger record
     * @param {string} triggerBody - Source code
     * @returns {boolean} True if self-update detected
     */
    updatesOwnObject(trigger, triggerBody) {
        // Look for DML operations on Trigger.new or object-specific collections
        const dmlPatterns = [
            new RegExp(`update\\s+Trigger\\.new`, 'i'),
            new RegExp(`update\\s+\\w+List`, 'i'),
            new RegExp(`Database\\.update\\s*\\(\\s*Trigger\\.new`, 'i')
        ];

        return dmlPatterns.some(pattern => pattern.test(triggerBody));
    }

    /**
     * Check for DML in loops (recursion + governor risk)
     * @param {string} triggerBody - Source code
     * @returns {boolean} True if DML in loop detected
     */
    hasDMLInLoop(triggerBody) {
        // Simple pattern: for loop containing DML
        const dmlInLoopPattern = /for\s*\([^)]+\)\s*\{[^}]*(?:update|insert|delete|upsert|Database\.)/is;
        return dmlInLoopPattern.test(triggerBody);
    }

    /**
     * Detect recursion risk in Flow
     * @param {Object} flow - Flow record
     * @param {Object} flowMetadata - Flow XML metadata
     * @param {Array} fieldWrites - Field writes from this flow
     * @returns {Object} Risk analysis
     */
    detectFlowRecursion(flow, flowMetadata, fieldWrites = []) {
        if (!flowMetadata || !flowMetadata.start) {
            return {
                riskLevel: this.RISK_LEVELS.NONE,
                updatesCriteriaFields: false,
                reason: 'No flow metadata available for analysis'
            };
        }

        // Extract entry criteria fields
        const entryCriteriaFields = this.extractEntryCriteriaFields(flowMetadata);

        // Extract fields this flow writes
        const writtenFields = fieldWrites.map(w => w.field);

        // Check for overlap
        const overlap = entryCriteriaFields.filter(field => writtenFields.includes(field));

        // Check if flow updates its own trigger object
        const updatesOwnObject = this.flowUpdatesOwnObject(flow, flowMetadata, fieldWrites);

        // Determine risk level
        let riskLevel = this.RISK_LEVELS.NONE;
        let reason = 'No recursion risk detected';

        if (overlap.length > 0 && updatesOwnObject) {
            riskLevel = this.RISK_LEVELS.HIGH;
            reason = `Flow updates fields (${overlap.join(', ')}) that are in its entry criteria. Can cause infinite re-triggering.`;
        } else if (updatesOwnObject && writtenFields.length > 0) {
            riskLevel = this.RISK_LEVELS.MEDIUM;
            reason = 'Flow updates its trigger object but not entry criteria fields. Monitor for indirect re-trigger scenarios.';
        }

        return {
            flowName: flow.DeveloperName || flow.MasterLabel,
            flowType: flow.ProcessType,
            riskLevel,
            updatesCriteriaFields: overlap.length > 0,
            overlappingFields: overlap,
            entryCriteriaFields,
            writtenFields,
            reason,
            recommendation: this.generateFlowRecommendation(riskLevel, overlap)
        };
    }

    /**
     * Extract fields from flow entry criteria
     * @param {Object} flowMetadata - Flow XML metadata
     * @returns {Array} Field API names
     */
    extractEntryCriteriaFields(flowMetadata) {
        const fields = [];

        if (!flowMetadata.start || !flowMetadata.start.filters) {
            return fields;
        }

        const filters = Array.isArray(flowMetadata.start.filters) ?
            flowMetadata.start.filters : [flowMetadata.start.filters];

        filters.forEach(filter => {
            if (filter.field) {
                fields.push(filter.field);
            }
        });

        return fields;
    }

    /**
     * Check if flow updates its own trigger object
     * @param {Object} flow - Flow record
     * @param {Object} flowMetadata - Flow XML metadata
     * @param {Array} fieldWrites - Field writes
     * @returns {boolean} True if self-update
     */
    flowUpdatesOwnObject(flow, flowMetadata, fieldWrites) {
        const triggerObject = flowMetadata.start?.object;

        if (!triggerObject) {
            return false;
        }

        // Check if any field write targets the trigger object
        return fieldWrites.some(write => write.object === triggerObject);
    }

    /**
     * Detect circular flow chains (Flow A → B → A)
     * @param {Array} flowsWithCalls - Flows with subflow calls
     * @returns {Array} Circular chains detected
     */
    detectCircularFlowChains(flowsWithCalls) {
        const circularChains = [];
        const flowMap = new Map();

        // Build flow call graph
        flowsWithCalls.forEach(flow => {
            const calls = (flow.subflowCalls || []).map(call => call.targetFlow);
            flowMap.set(flow.name, calls);
        });

        // DFS to detect cycles
        flowsWithCalls.forEach(flow => {
            const visited = new Set();
            const recStack = [];

            const hasCycle = this.detectCycleDFS(flow.name, flowMap, visited, recStack);

            if (hasCycle) {
                circularChains.push({
                    chain: recStack.join(' → '),
                    flowCount: recStack.length,
                    riskLevel: this.RISK_LEVELS.HIGH
                });
            }
        });

        return circularChains;
    }

    /**
     * DFS to detect cycles in flow call graph
     * @param {string} flowName - Current flow
     * @param {Map} flowMap - Flow call graph
     * @param {Set} visited - Visited nodes
     * @param {Array} recStack - Recursion stack
     * @returns {boolean} True if cycle detected
     */
    detectCycleDFS(flowName, flowMap, visited, recStack) {
        if (recStack.includes(flowName)) {
            recStack.push(flowName); // Complete the cycle
            return true;
        }

        if (visited.has(flowName)) {
            return false;
        }

        visited.add(flowName);
        recStack.push(flowName);

        const calls = flowMap.get(flowName) || [];

        for (const calledFlow of calls) {
            if (this.detectCycleDFS(calledFlow, flowMap, visited, recStack)) {
                return true;
            }
        }

        recStack.pop();
        return false;
    }

    /**
     * Generate recommendation for Apex recursion risk
     * @param {string} riskLevel - Risk level
     * @param {boolean} updatesOwnObject - Self-update flag
     * @param {boolean} hasGuard - Guard present flag
     * @returns {string} Recommendation
     */
    generateApexRecommendation(riskLevel, updatesOwnObject, hasGuard) {
        if (riskLevel === this.RISK_LEVELS.HIGH) {
            return 'CRITICAL: Add static recursion guard immediately. Example: `static Boolean hasRun = false; if (hasRun) return; hasRun = true;`';
        }

        if (riskLevel === this.RISK_LEVELS.MEDIUM) {
            return 'Add recursion guard for safety. Use `static Set<Id> processedIds = new Set<Id>();` to track processed records.';
        }

        if (riskLevel === this.RISK_LEVELS.LOW) {
            return 'Verify recursion guard is correctly implemented and covers all re-entry paths.';
        }

        return 'No action required. Continue monitoring.';
    }

    /**
     * Generate recommendation for Flow recursion risk
     * @param {string} riskLevel - Risk level
     * @param {Array} overlappingFields - Fields causing risk
     * @returns {string} Recommendation
     */
    generateFlowRecommendation(riskLevel, overlappingFields) {
        if (riskLevel === this.RISK_LEVELS.HIGH) {
            return `CRITICAL: Flow updates entry criteria fields (${overlappingFields.join(', ')}). Remove these field updates or change entry criteria to prevent infinite loops.`;
        }

        if (riskLevel === this.RISK_LEVELS.MEDIUM) {
            return 'Review flow logic to ensure it cannot indirectly re-trigger itself. Consider adding "Already Updated" flag field.';
        }

        return 'No action required.';
    }

    /**
     * Generate recursion risk summary report
     * @param {Array} apexRisks - Apex recursion risks
     * @param {Array} flowRisks - Flow recursion risks
     * @param {Array} circularChains - Circular flow chains
     * @returns {Object} Summary statistics
     */
    generateSummary(apexRisks, flowRisks, circularChains = []) {
        return {
            apex: {
                total: apexRisks.length,
                high: apexRisks.filter(r => r.riskLevel === this.RISK_LEVELS.HIGH).length,
                medium: apexRisks.filter(r => r.riskLevel === this.RISK_LEVELS.MEDIUM).length,
                low: apexRisks.filter(r => r.riskLevel === this.RISK_LEVELS.LOW).length,
                withoutGuards: apexRisks.filter(r => !r.hasGuard).length,
                updatingOwnObject: apexRisks.filter(r => r.updatesOwnObject).length
            },
            flows: {
                total: flowRisks.length,
                high: flowRisks.filter(r => r.riskLevel === this.RISK_LEVELS.HIGH).length,
                medium: flowRisks.filter(r => r.riskLevel === this.RISK_LEVELS.MEDIUM).length,
                low: flowRisks.filter(r => r.riskLevel === this.RISK_LEVELS.LOW).length,
                updatingCriteriaFields: flowRisks.filter(r => r.updatesCriteriaFields).length
            },
            circularChains: {
                total: circularChains.length,
                chains: circularChains.map(c => c.chain)
            },
            overallRisk: this.calculateOverallRisk(apexRisks, flowRisks, circularChains)
        };
    }

    /**
     * Calculate overall recursion risk level
     * @param {Array} apexRisks - Apex risks
     * @param {Array} flowRisks - Flow risks
     * @param {Array} circularChains - Circular chains
     * @returns {string} Overall risk level
     */
    calculateOverallRisk(apexRisks, flowRisks, circularChains) {
        const highCount = [
            ...apexRisks.filter(r => r.riskLevel === this.RISK_LEVELS.HIGH),
            ...flowRisks.filter(r => r.riskLevel === this.RISK_LEVELS.HIGH),
            ...circularChains
        ].length;

        if (highCount > 0) {
            return this.RISK_LEVELS.HIGH;
        }

        const mediumCount = [
            ...apexRisks.filter(r => r.riskLevel === this.RISK_LEVELS.MEDIUM),
            ...flowRisks.filter(r => r.riskLevel === this.RISK_LEVELS.MEDIUM)
        ].length;

        if (mediumCount > 0) {
            return this.RISK_LEVELS.MEDIUM;
        }

        const lowCount = [
            ...apexRisks.filter(r => r.riskLevel === this.RISK_LEVELS.LOW),
            ...flowRisks.filter(r => r.riskLevel === this.RISK_LEVELS.LOW)
        ].length;

        if (lowCount > 0) {
            return this.RISK_LEVELS.LOW;
        }

        return this.RISK_LEVELS.NONE;
    }
}

module.exports = RecursionRiskDetector;
