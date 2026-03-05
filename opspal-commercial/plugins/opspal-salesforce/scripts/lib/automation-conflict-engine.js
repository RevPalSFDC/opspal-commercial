#!/usr/bin/env node

/**
 * Automation Conflict Engine
 *
 * Purpose: Detect conflicts and overlaps across all automation types using 8 core rules.
 *
 * Rules Implemented:
 * 1. MULTI_TRIGGER_SAME_EVENT - Multiple triggers on same object+event
 * 2. MULTI_FLOW_SAME_EVENT - Overlapping flows with trigger order issues
 * 3. FIELD_WRITE_COLLISION - Multiple automation writing same field
 * 4. REEVAL_LOOP - Workflow re-evaluation causing loops
 * 5. CYCLE_CASCADE - Cross-object circular updates
 * 6. ASYNC_COLLISION - Scheduled flows + async Apex conflicts
 * 7. UNDEFINED_FLOW_ORDER - Multiple flows without trigger order
 * 8. GOVERNOR_PRESSURE - Transaction path exceeding limits
 *
 * Usage:
 *   const engine = new AutomationConflictEngine(automations, graph);
 *   const conflicts = engine.detectAllConflicts();
 */

const AutomationDependencyGraph = require('./automation-dependency-graph');

class AutomationConflictEngine {
    constructor(automations, graph = null) {
        this.automations = automations || [];
        this.graph = graph || this.buildGraph(automations);
        this.conflicts = [];
    }

    /**
     * Build graph if not provided
     */
    buildGraph(automations) {
        const graph = new AutomationDependencyGraph();
        for (const automation of automations) {
            graph.addAutomation(automation);
        }
        return graph;
    }

    /**
     * Detect all conflicts (runs all 8 rules)
     */
    detectAllConflicts() {
        console.log('Running conflict detection rules...');

        this.conflicts = [];

        // Rule 1: Multiple triggers same event
        this.conflicts.push(...this.detectMultipleTriggers());

        // Rule 2: Flow overlaps
        this.conflicts.push(...this.detectFlowOverlaps());

        // Rule 3: Field write collisions
        this.conflicts.push(...this.detectFieldWriteCollisions());

        // Rule 4: Workflow re-eval loops
        this.conflicts.push(...this.detectReevalLoops());

        // Rule 5: Cross-object cascades
        this.conflicts.push(...this.detectCrossObjectCascades());

        // Rule 6: Async collisions
        this.conflicts.push(...this.detectAsyncCollisions());

        // Rule 7: Undefined flow order
        this.conflicts.push(...this.detectUndefinedFlowOrder());

        // Rule 8: Governor limit pressure
        this.conflicts.push(...this.detectGovernorPressure());

        console.log(`Found ${this.conflicts.length} conflict(s)`);
        return this.conflicts;
    }

    /**
     * Rule 1: Detect multiple triggers on same object+event
     * ENHANCED: Now includes detailed trigger analysis and consolidation roadmap
     */
    detectMultipleTriggers() {
        const conflicts = [];
        const triggersByObjectEvent = new Map();

        // Group triggers by object+event
        for (const auto of this.automations) {
            if (auto.type !== 'ApexTrigger') continue;

            for (const target of (auto.objectTargets || [])) {
                const obj = target.objectApiName;
                for (const event of (target.when || [])) {
                    const key = `${obj}:${event}`;
                    if (!triggersByObjectEvent.has(key)) {
                        triggersByObjectEvent.set(key, []);
                    }
                    triggersByObjectEvent.get(key).push(auto);
                }
            }
        }

        // Find conflicts
        for (const [key, triggers] of triggersByObjectEvent) {
            if (triggers.length > 1) {
                const [object, event] = key.split(':');

                // ENHANCED: Analyze trigger complexity and extract business logic
                const triggerAnalysis = this.analyzeTriggers(triggers, object, event);

                // ENHANCED: Calculate governor limit projections
                const governorProjections = this.calculateGovernorProjections(triggers);

                // NEW: Calculate severity with detailed rationale
                const severityResult = this.calculateSeverityWithRationale({
                    automationCount: triggers.length,
                    governorRisk: governorProjections.riskLevel,
                    hasExecutionOrder: false, // Apex triggers don't have explicit order
                    object: object
                }, 'MULTI_TRIGGER');

                conflicts.push({
                    conflictId: `MULTI_TRIGGER_${conflicts.length + 1}`,
                    severity: severityResult.severity,
                    severityRationale: severityResult.severityRationale,
                    rule: 'MULTI_TRIGGER_SAME_EVENT',
                    object: object,
                    event: event,
                    triggerCount: triggers.length,
                    involved: triggers.map(t => ({
                        type: t.type,
                        name: t.name,
                        id: t.id
                    })),
                    // ENHANCED: Detailed trigger analysis
                    triggerAnalysis: triggerAnalysis,
                    // ENHANCED: Governor limit projections
                    governorProjections: governorProjections,
                    evidence: `${triggers.length} triggers execute on ${object}.${event} with unknown order`,
                    impact: `${severityResult.severityRationale.impactSummary} ${governorProjections.riskSummary}`,
                    recommendation: {
                        priority: severityResult.severity,
                        action: 'CONSOLIDATE_TRIGGERS',
                        steps: [
                            'Create single Trigger with Handler pattern',
                            ...triggers.map((t, i) => `Migrate logic from ${t.name}`),
                            'Set execution order in Handler',
                            'Add recursion guards with static flags',
                            'Deploy, test with bulk data (200 records)',
                            'Deactivate old triggers'
                        ],
                        estimatedTime: this.estimateConsolidationTime(triggers.length),
                        complexity: triggers.length >= 7 ? 'HIGH' : triggers.length >= 4 ? 'MEDIUM' : 'LOW'
                    }
                });
            }
        }

        return conflicts;
    }

    /**
     * ENHANCED: Analyze triggers to extract business logic hints
     */
    analyzeTriggers(triggers, object, event) {
        return triggers.map(trigger => {
            const analysis = {
                name: trigger.name,
                type: trigger.type,
                operations: [],
                fieldsModified: [],
                externalCallouts: false,
                complexity: 'MEDIUM'
            };

            // Extract operations from trigger body if available
            if (trigger.body) {
                // Check for DML operations
                if (trigger.body.match(/\b(insert|update|delete|undelete)\s+/gi)) {
                    const dmlMatches = trigger.body.match(/\b(insert|update|delete|undelete)\s+/gi);
                    analysis.operations.push(`${dmlMatches.length} DML operation(s)`);
                }

                // Check for SOQL queries
                if (trigger.body.match(/\[\s*SELECT\s+/gi)) {
                    const soqlMatches = trigger.body.match(/\[\s*SELECT\s+/gi);
                    analysis.operations.push(`${soqlMatches.length} SOQL query(ies)`);
                }

                // Check for external callouts
                if (trigger.body.match(/\b(Http|Callout)\b/gi)) {
                    analysis.externalCallouts = true;
                    analysis.operations.push('External API callout(s)');
                }

                // Extract field assignments
                const fieldPattern = new RegExp(`${object}\\.(\\w+)\\s*=`, 'g');
                const fieldMatches = [...trigger.body.matchAll(fieldPattern)];
                if (fieldMatches.length > 0) {
                    analysis.fieldsModified = [...new Set(fieldMatches.map(m => m[1]))];
                }

                // Estimate complexity
                const bodyLength = trigger.body.length;
                if (bodyLength > 2000 || analysis.externalCallouts) {
                    analysis.complexity = 'HIGH';
                } else if (bodyLength < 500 && analysis.operations.length <= 2) {
                    analysis.complexity = 'LOW';
                }
            }

            return analysis;
        });
    }

    /**
     * ENHANCED: Calculate governor limit projections for trigger consolidation
     */
    calculateGovernorProjections(triggers) {
        let totalDML = 0;
        let totalSOQL = 0;
        let totalCPU = 0;
        let totalHeap = 0;

        // Estimate limits per trigger
        for (const trigger of triggers) {
            if (trigger.body) {
                // Count DML statements
                const dmlMatches = trigger.body.match(/\b(insert|update|delete|undelete)\s+/gi);
                totalDML += dmlMatches ? dmlMatches.length : 1;

                // Count SOQL queries
                const soqlMatches = trigger.body.match(/\[\s*SELECT\s+/gi);
                totalSOQL += soqlMatches ? soqlMatches.length : 1;

                // Estimate CPU time (rough estimate: 100ms per 1000 characters)
                totalCPU += Math.floor(trigger.body.length / 10);

                // Estimate heap (rough estimate: 0.01 MB per 1000 characters)
                totalHeap += trigger.body.length / 100000;
            } else {
                // Conservative estimates if body not available
                totalDML += 2;
                totalSOQL += 1;
                totalCPU += 500;
                totalHeap += 0.1;
            }
        }

        // Calculate bulk operation projections (200 record scenario)
        const bulkDML = totalDML * 200;
        const bulkSOQL = totalSOQL * 200;
        const bulkCPU = totalCPU * 200;
        const bulkHeap = totalHeap * 200;

        // Determine risk level
        let riskLevel = 'LOW';
        const risks = [];
        if (bulkDML > 10000) {
            riskLevel = 'HIGH';
            risks.push(`DML rows may exceed limit (${bulkDML} est. vs 10,000 limit)`);
        }
        if (totalSOQL > 50) {
            riskLevel = 'HIGH';
            risks.push(`SOQL queries may exceed limit (${totalSOQL} est. vs 100 limit)`);
        }
        if (bulkCPU > 8000) {
            riskLevel = 'MEDIUM';
            risks.push(`CPU time may approach limit (${bulkCPU}ms est. vs 10,000ms limit)`);
        }

        return {
            singleRecord: {
                dml: totalDML,
                soql: totalSOQL,
                cpu: totalCPU,
                heap: totalHeap.toFixed(2)
            },
            bulkOperation: {
                dmlRows: bulkDML,
                soql: totalSOQL,
                cpu: bulkCPU,
                heap: bulkHeap.toFixed(2)
            },
            riskLevel: riskLevel,
            risks: risks,
            riskSummary: risks.length > 0 ? risks.join('; ') : 'Governor limits within safe range'
        };
    }

    /**
     * ENHANCED: Estimate consolidation time based on trigger count
     */
    estimateConsolidationTime(triggerCount) {
        if (triggerCount >= 9) return '16-24 hours';
        if (triggerCount >= 7) return '12-16 hours';
        if (triggerCount >= 5) return '8-12 hours';
        if (triggerCount >= 3) return '4-8 hours';
        return '2-4 hours';
    }

    /**
     * NEW: Calculate severity with detailed rationale
     * @param {Object} factors - Risk factors for severity calculation
     * @param {String} conflictType - Type of conflict (MULTI_TRIGGER, FIELD_COLLISION, etc.)
     * @returns {Object} - Severity and detailed rationale
     */
    calculateSeverityWithRationale(factors, conflictType) {
        let score = 0;
        const reasons = [];
        const riskFactors = {};

        // Base score on conflict type
        switch (conflictType) {
            case 'MULTI_TRIGGER':
                // Factor 1: Trigger count (max 40 points)
                const triggerCount = factors.automationCount || 0;
                const triggerPoints = Math.min(triggerCount * 5, 40);
                score += triggerPoints;
                riskFactors.automationCount = triggerCount;
                if (triggerCount >= 7) {
                    reasons.push(`${triggerCount} triggers on same object+event (threshold: 7+ = CRITICAL)`);
                } else if (triggerCount >= 5) {
                    reasons.push(`${triggerCount} triggers on same object+event (threshold: 5-6 = HIGH)`);
                } else {
                    reasons.push(`${triggerCount} triggers on same object+event (threshold: 3-4 = MEDIUM)`);
                }

                // Factor 2: Governor limit risk (max 30 points)
                if (factors.governorRisk === 'HIGH') {
                    score += 30;
                    riskFactors.governorLimitRisk = 'HIGH';
                    reasons.push('Governor limit projection exceeds safe thresholds');
                } else if (factors.governorRisk === 'MEDIUM') {
                    score += 15;
                    riskFactors.governorLimitRisk = 'MEDIUM';
                    reasons.push('Governor limit projection approaching thresholds');
                }

                // Factor 3: Execution order (max 20 points)
                if (!factors.hasExecutionOrder) {
                    score += 20;
                    riskFactors.executionOrderDefined = false;
                    reasons.push('Undefined execution order creates race conditions');
                }

                // Factor 4: Business criticality (max 10 points)
                const criticalObjects = ['Opportunity', 'Account', 'Contract', 'Order', 'Quote'];
                if (criticalObjects.includes(factors.object)) {
                    score += 10;
                    riskFactors.businessCriticality = 'HIGH';
                    reasons.push(`Business-critical object (${factors.object}) with revenue/compliance impact`);
                }
                break;

            case 'FIELD_COLLISION':
                // Factor 1: Number of competing writes (max 40 points)
                const writerCount = factors.writerCount || 0;
                const writerPoints = Math.min(writerCount * 13, 40);
                score += writerPoints;
                riskFactors.writerCount = writerCount;
                reasons.push(`${writerCount} automations writing to same field`);

                // Factor 2: Conflicting write values (max 30 points)
                if (factors.conflictingValues && factors.uniqueValueCount > 1) {
                    score += 30;
                    riskFactors.valueConflict = true;
                    reasons.push(`${factors.uniqueValueCount} different values cause unpredictable results`);
                }

                // Factor 3: Write type diversity (max 20 points)
                if (factors.writeTypeDiversity > 2) {
                    score += 20;
                    riskFactors.writeTypeDiversity = factors.writeTypeDiversity;
                    reasons.push(`${factors.writeTypeDiversity} different automation types (Apex, Flow, Workflow) writing same field`);
                }

                // Factor 4: Formula vs literal conflicts (max 10 points)
                if (factors.hasFormulaLiteralConflict) {
                    score += 10;
                    riskFactors.formulaLiteralConflict = true;
                    reasons.push('Formula-based and literal value updates conflict');
                }
                break;

            case 'FLOW_OVERLAP':
                // Simpler scoring for flow overlaps
                score = factors.unorderedCount > 1 ? 65 : 40; // HIGH if multiple unordered
                riskFactors.unorderedFlows = factors.unorderedCount;
                reasons.push(`${factors.flowCount} flows on same trigger with ${factors.unorderedCount} unordered`);
                break;

            case 'REEVAL_LOOP':
                // Always HIGH for re-evaluation loops
                score = 65;
                riskFactors.reevaluationEnabled = true;
                reasons.push('Workflow re-evaluation enabled with other automations updating same object');
                if (factors.otherAutomationCount > 3) {
                    score += 10;
                    reasons.push(`${factors.otherAutomationCount} other automations increase loop risk`);
                }
                break;

            case 'CYCLE_CASCADE':
                // Always CRITICAL for circular dependencies
                score = 90;
                riskFactors.circularDependency = true;
                reasons.push('Circular automation chain causes infinite recursion');
                reasons.push(`Objects in cycle: ${factors.objects?.join(' → ')}`);
                break;

            case 'ASYNC_COLLISION':
                // MEDIUM by default for async collisions
                score = 45;
                riskFactors.asyncCount = factors.asyncCount;
                reasons.push(`${factors.asyncCount} async automations may cause timing-dependent behavior`);
                break;

            case 'UNDEFINED_ORDER':
                // MEDIUM for undefined order
                score = 40;
                riskFactors.unorderedCount = factors.unorderedCount;
                reasons.push(`${factors.unorderedCount} flows without trigger order`);
                break;

            case 'GOVERNOR_PRESSURE':
                // HIGH for governor limit pressure
                score = 70;
                riskFactors.governorMetrics = factors.metrics;
                if (factors.metrics?.totalDML > 100) {
                    reasons.push(`DML statements: ${factors.metrics.totalDML} (limit: 150)`);
                }
                if (factors.metrics?.totalSOQL > 50) {
                    reasons.push(`SOQL queries: ${factors.metrics.totalSOQL} (limit: 100)`);
                }
                if (factors.metrics?.totalRows > 8000) {
                    reasons.push(`DML rows: ${factors.metrics.totalRows} (limit: 10,000)`);
                }
                break;
        }

        // Determine severity level
        let severity = 'MEDIUM';
        let level = 'MODERATE';
        if (score >= 70) {
            severity = 'CRITICAL';
            level = 'SEVERE';
        } else if (score >= 50) {
            severity = 'HIGH';
            level = 'HIGH';
        } else if (score >= 30) {
            severity = 'MEDIUM';
            level = 'MODERATE';
        } else {
            severity = 'LOW';
            level = 'LOW';
        }

        return {
            severity: severity,
            severityRationale: {
                level: level,
                score: score,
                reasons: reasons,
                riskFactors: riskFactors,
                impactSummary: this.generateImpactSummary(severity, reasons, conflictType)
            }
        };
    }

    /**
     * Generate impact summary based on severity
     */
    generateImpactSummary(severity, reasons, conflictType) {
        const impactMap = {
            'CRITICAL': {
                'MULTI_TRIGGER': 'Transaction failure risk during bulk operations. Data corruption highly likely.',
                'FIELD_COLLISION': 'Severe data inconsistency. Last write wins with unpredictable results.',
                'CYCLE_CASCADE': 'System failure. Recursion until governor limits exhausted.',
                'default': 'Critical system risk. Immediate attention required.'
            },
            'HIGH': {
                'MULTI_TRIGGER': 'Data inconsistency likely. Bulk operations may fail.',
                'FIELD_COLLISION': 'Data corruption possible. Race conditions present.',
                'GOVERNOR_PRESSURE': 'Governor limit breaches likely in complex transactions.',
                'default': 'Significant risk of operational disruption.'
            },
            'MEDIUM': {
                'default': 'Moderate risk. Should be addressed in planned maintenance.'
            },
            'LOW': {
                'default': 'Low risk. Monitor and address when convenient.'
            }
        };

        const severityMap = impactMap[severity] || impactMap['MEDIUM'];
        return severityMap[conflictType] || severityMap['default'];
    }

    /**
     * Rule 2: Detect flow overlaps with trigger order issues
     */
    detectFlowOverlaps() {
        const conflicts = [];
        const flowsByObjectPhase = new Map();

        // Group flows by object+phase
        for (const auto of this.automations) {
            if (auto.type !== 'Flow' && auto.type !== 'ProcessBuilder') continue;
            if (auto.status !== 'Active') continue;

            for (const target of (auto.objectTargets || [])) {
                const obj = target.objectApiName;
                for (const event of (target.when || [])) {
                    const key = `${obj}:${event}`;
                    if (!flowsByObjectPhase.has(key)) {
                        flowsByObjectPhase.set(key, []);
                    }
                    flowsByObjectPhase.get(key).push(auto);
                }
            }
        }

        // Find conflicts
        for (const [key, flows] of flowsByObjectPhase) {
            if (flows.length > 1) {
                const [object, phase] = key.split(':');

                // Check for trigger order conflicts
                const unordered = flows.filter(f => !f.triggerOrder);
                const orderedButSame = this.findDuplicateTriggerOrders(flows);

                if (unordered.length > 1 || orderedButSame.length > 0) {
                    // NEW: Calculate severity with rationale
                    const severityResult = this.calculateSeverityWithRationale({
                        flowCount: flows.length,
                        unorderedCount: unordered.length
                    }, 'FLOW_OVERLAP');

                    conflicts.push({
                        conflictId: `MULTI_FLOW_${conflicts.length + 1}`,
                        severity: severityResult.severity,
                        severityRationale: severityResult.severityRationale,
                        rule: 'MULTI_FLOW_SAME_EVENT',
                        object: object,
                        phase: phase,
                        involved: flows.map(f => ({
                            type: f.type,
                            name: f.name,
                            id: f.id,
                            triggerOrder: f.triggerOrder || 'undefined'
                        })),
                        evidence: `${flows.length} flows on ${object}.${phase}, ${unordered.length} without order`,
                        impact: severityResult.severityRationale.impactSummary,
                        recommendation: {
                            priority: severityResult.severity,
                            action: 'SET_FLOW_ORDER_OR_CONSOLIDATE',
                            steps: [
                                'Review flow logic for each flow',
                                'Determine dependency order',
                                'Set Trigger Order metadata (100, 200, 300, etc.)',
                                'Test execution sequence',
                                'Consider consolidation if logic similar'
                            ],
                            estimatedTime: '2-4 hours',
                            complexity: 'MEDIUM'
                        }
                    });
                }
            }
        }

        return conflicts;
    }

    /**
     * Find duplicate trigger orders
     */
    findDuplicateTriggerOrders(flows) {
        const orderMap = new Map();
        for (const flow of flows) {
            if (flow.triggerOrder) {
                if (!orderMap.has(flow.triggerOrder)) {
                    orderMap.set(flow.triggerOrder, []);
                }
                orderMap.get(flow.triggerOrder).push(flow);
            }
        }

        const duplicates = [];
        for (const [order, flows] of orderMap) {
            if (flows.length > 1) {
                duplicates.push(...flows);
            }
        }
        return duplicates;
    }

    /**
     * Rule 3: Detect field write collisions
     * ENHANCED: Now includes detailed field-level analysis with business logic extraction
     */
    detectFieldWriteCollisions() {
        const conflicts = [];
        const writesByField = new Map();

        // Group automation by fields they write
        for (const auto of this.automations) {
            for (const write of (auto.writes || [])) {
                if (!writesByField.has(write)) {
                    writesByField.set(write, []);
                }
                writesByField.get(write).push(auto);
            }
        }

        // Find collisions (multiple automation writing same field)
        for (const [field, writers] of writesByField) {
            if (writers.length > 1) {
                const [object, fieldName] = field.split('.');

                // Check if they execute in same context
                const sameContext = this.checkSameExecutionContext(writers, object);

                if (sameContext) {
                    // TIER 2 ENHANCEMENT: Categorize collision type (WRITE-WRITE, READ-WRITE, etc.)
                    const collisionCategory = this.categorizeFieldCollision(writers, field);

                    // ENHANCED: Extract detailed field write information
                    const fieldWriteDetails = this.extractFieldWriteDetails(writers, field);

                    // ENHANCED: Calculate data corruption risk
                    const corruptionRisk = this.calculateCorruptionRisk(fieldWriteDetails);

                    // ENHANCED: Analyze execution order
                    const executionAnalysis = this.analyzeExecutionOrder(writers, object);

                    // TIER 2: Use collision category severity instead of calculated severity
                    // This gives priority to operation type (WRITE-WRITE = CRITICAL) over other factors
                    const severity = collisionCategory.severity;
                    const severityRationale = collisionCategory.severityJustification;

                    conflicts.push({
                        conflictId: `FIELD_COLLISION_${conflicts.length + 1}`,
                        severity: severity, // TIER 2: From collision categorization
                        severityRationale: severityRationale, // TIER 2: Operation-based justification
                        // TIER 2: Collision type classification
                        collisionType: collisionCategory.collisionType,
                        collisionCategory: collisionCategory, // Full categorization data
                        rule: 'FIELD_WRITE_COLLISION',
                        object: object,
                        field: fieldName,
                        involved: writers.map(w => ({
                            type: w.type,
                            name: w.name,
                            id: w.id
                        })),
                        // ENHANCED: Detailed field write information
                        fieldWriteDetails: fieldWriteDetails,
                        // ENHANCED: Data corruption risk analysis
                        corruptionRisk: corruptionRisk,
                        // ENHANCED: Execution order analysis
                        executionOrder: executionAnalysis,
                        evidence: `${writers.length} automation components access ${field} in same transaction (${collisionCategory.writeCount} write, ${collisionCategory.readCount} read)`,
                        impact: `${severityRationale} ${corruptionRisk.impactDescription}.`,
                        recommendation: {
                            priority: severity,
                            action: collisionCategory.collisionType === 'WRITE_WRITE' ?
                                'CRITICAL_CONSOLIDATE_WRITES' :
                                collisionCategory.collisionType === 'READ_WRITE' ?
                                'REVIEW_EXECUTION_ORDER' :
                                'REVIEW_COMPLEXITY',
                            steps: this.getRecommendationSteps(collisionCategory, fieldName),
                            estimatedTime: collisionCategory.collisionType === 'WRITE_WRITE' ? '4-6 hours' :
                                           collisionCategory.collisionType === 'READ_WRITE' ? '2-3 hours' : '1-2 hours',
                            complexity: collisionCategory.collisionType === 'WRITE_WRITE' ? 'HIGH' : 'MEDIUM'
                        }
                    });
                }
            }
        }

        return conflicts;
    }

    /**
     * TIER 2 ENHANCEMENT: Categorize field collision based on operation types
     * Uses fieldOperations to distinguish WRITE-WRITE, READ-WRITE, and READ-READ collisions
     */
    categorizeFieldCollision(automations, field) {
        const operationsByAutomation = new Map();

        // Extract field operations for each automation
        for (const auto of automations) {
            if (!auto.fieldOperations || auto.fieldOperations.length === 0) {
                // Fallback: if no fieldOperations, infer from writes array
                if (auto.writes && auto.writes.includes(field)) {
                    operationsByAutomation.set(auto, 'WRITE');
                } else if (auto.reads && auto.reads.includes(field)) {
                    operationsByAutomation.set(auto, 'READ');
                } else {
                    operationsByAutomation.set(auto, 'UNKNOWN');
                }
                continue;
            }

            // Find operation for this specific field
            const fieldOp = auto.fieldOperations.find(op => op.field === field);
            if (fieldOp) {
                operationsByAutomation.set(auto, fieldOp.operation); // READ, WRITE, or READ_WRITE
            } else {
                // Field might be in writes/reads but not in fieldOperations (backward compatibility)
                if (auto.writes && auto.writes.includes(field)) {
                    operationsByAutomation.set(auto, 'WRITE');
                } else if (auto.reads && auto.reads.includes(field)) {
                    operationsByAutomation.set(auto, 'READ');
                } else {
                    operationsByAutomation.set(auto, 'UNKNOWN');
                }
            }
        }

        // Count operation types
        const operations = Array.from(operationsByAutomation.values());
        const writeCount = operations.filter(op => op === 'WRITE').length;
        const readWriteCount = operations.filter(op => op === 'READ_WRITE').length;
        const readCount = operations.filter(op => op === 'READ').length;
        const totalWrites = writeCount + readWriteCount; // Both WRITE and READ_WRITE modify the field

        // Categorize collision type
        let collisionType;
        let severity;
        let severityJustification;

        if (totalWrites >= 2) {
            // Multiple automations writing to the same field
            collisionType = 'WRITE_WRITE';
            severity = 'CRITICAL';
            severityJustification = `${totalWrites} automations writing to ${field.split('.')[1]} creates data corruption risk. Last write wins, causing unpredictable field values.`;
        } else if (totalWrites === 1 && readCount >= 1) {
            // One writes while others read
            collisionType = 'READ_WRITE';
            severity = 'HIGH';
            severityJustification = `1 automation writing while ${readCount} read ${field.split('.')[1]} creates race condition risk. Read operations may get stale data.`;
        } else if (readWriteCount === 1 && readCount === 0 && writeCount === 0) {
            // Single automation both reads and writes (not really a collision)
            collisionType = 'READ_WRITE_SINGLE';
            severity = 'MEDIUM';
            severityJustification = `Single automation both reads and writes ${field.split('.')[1]}, increasing complexity but no actual collision.`;
        } else if (readCount >= 2 && totalWrites === 0) {
            // Multiple automations only reading
            collisionType = 'READ_READ';
            severity = 'LOW';
            severityJustification = `${readCount} automations reading ${field.split('.')[1]} is safe - no data conflicts.`;
        } else {
            // v3.26.0 PHASE 4: Enhanced UNKNOWN categorization with subtypes
            const unknownCount = operations.filter(op => op === 'UNKNOWN').length;
            const fieldName = field.split('.')[1];
            const isWildcard = fieldName === '*';

            if (isWildcard) {
                // Wildcard field - field detection failed completely
                collisionType = 'UNKNOWN_WILDCARD';
                severity = 'MEDIUM';
                severityJustification = `Cannot determine specific field being modified. Static analysis could not extract field names from complex Apex logic. Review trigger source code manually.`;
            } else if (unknownCount >= automations.length * 0.5) {
                // Majority of operations are UNKNOWN - insufficient data
                collisionType = 'UNKNOWN_INSUFFICIENT_DATA';
                severity = 'MEDIUM';
                severityJustification = `${unknownCount}/${automations.length} automations have unknown operations on ${fieldName}. Field may not be in writes/reads arrays. Verify field access in automation source code.`;
            } else {
                // Edge case - mixed operations with unusual pattern
                collisionType = 'UNKNOWN_EDGE_CASE';
                severity = 'MEDIUM';
                severityJustification = `Unusual collision pattern for ${fieldName}: ${writeCount} writes, ${readCount} reads, ${readWriteCount} read-writes, ${unknownCount} unknown. Review automation execution order.`;
            }
        }

        // Build detailed breakdown
        const operationBreakdown = Array.from(operationsByAutomation.entries()).map(([auto, op]) => ({
            automation: auto.name,
            type: auto.type,
            operation: op,
            context: auto.fieldOperations?.find(fo => fo.field === field)?.context || 'unknown'
        }));

        return {
            collisionType,
            severity,
            severityJustification,
            writeCount: totalWrites,
            readCount,
            readWriteCount,
            operationBreakdown
        };
    }

    /**
     * TIER 2 ENHANCEMENT: Get collision-type-specific recommendation steps
     * Returns tailored remediation steps based on collision category
     */
    getRecommendationSteps(collisionCategory, fieldName) {
        switch (collisionCategory.collisionType) {
            case 'WRITE_WRITE':
                return [
                    `CRITICAL: ${collisionCategory.writeCount} automations writing to ${fieldName} - data corruption risk`,
                    `Audit each automation to understand write logic`,
                    `Identify business requirements for ${fieldName}`,
                    `Consolidate ALL writes into single automation (preferably Flow or Apex)`,
                    `Add conditional logic to handle all scenarios in one place`,
                    `Test thoroughly with all edge cases`,
                    `Disable/remove redundant automations`,
                    `Document final ${fieldName} update logic for future reference`
                ];

            case 'READ_WRITE':
                return [
                    `Review execution order between reading and writing automations`,
                    `Ensure read operations get consistent data`,
                    `Consider using Trigger.old for read operations to avoid race conditions`,
                    `Document expected field value at time of read`,
                    `Test with concurrent updates if async processing involved`
                ];

            case 'READ_WRITE_SINGLE':
                return [
                    `Review automation complexity - both reading and writing same field`,
                    `Consider splitting into separate validation and update logic`,
                    `Document why field is both read and written`,
                    `Ensure no circular update loops`
                ];

            case 'READ_READ':
                return [
                    `No action required - multiple reads are safe`,
                    `Consider consolidating for code maintainability`,
                    `Document business logic for ${fieldName} reads`
                ];

            // v3.26.0 PHASE 4: Actionable recommendations for UNKNOWN subtypes
            case 'UNKNOWN_WILDCARD':
                return [
                    `⚠️ Field detection failed - wildcard collision detected`,
                    `Review Apex trigger/class source code manually for field writes`,
                    `Look for complex patterns: dynamic field names, map.put(), loops with field assignment`,
                    `Consider refactoring to simpler field assignment patterns`,
                    `Add code comments documenting which fields are modified`,
                    `If fields cannot be detected statically, document in trigger header comment`
                ];

            case 'UNKNOWN_INSUFFICIENT_DATA':
                return [
                    `⚠️ Field operations data missing for ${fieldName}`,
                    `Verify ${fieldName} exists in object schema`,
                    `Check if ${fieldName} is accessed via relationship (e.g., Account.Owner.Email)`,
                    `Review automation source code to confirm field is actually accessed`,
                    `Add explicit field to writes/reads arrays if needed`,
                    `Re-run audit after verifying field access patterns`
                ];

            case 'UNKNOWN_EDGE_CASE':
                return [
                    `⚠️ Unusual collision pattern detected for ${fieldName}`,
                    `Review execution order: check trigger order, flow activation order`,
                    `Identify if operations happen in same transaction or different contexts`,
                    `Document expected behavior when automations interact`,
                    `Consider consolidating automations if logic is related`,
                    `Add logging/debug statements to understand actual execution pattern`
                ];

            default:
                return [
                    `Manual review required for ${fieldName}`,
                    `Identify actual field access pattern`,
                    `Classify as READ, WRITE, or READ_WRITE`,
                    `Apply appropriate remediation strategy`
                ];
        }
    }

    /**
     * ENHANCED: Extract detailed field write information
     * Shows what each automation is trying to write to the field
     */
    extractFieldWriteDetails(writers, field) {
        return writers.map(automation => {
            const fieldWrite = {
                automationType: automation.type,
                automationName: automation.name,
                writeType: 'DIRECT', // Default
                writeValue: null,
                writeFormula: null,
                writeCondition: null,
                executionContext: null
            };

            // Extract write details based on automation type
            if (automation.type === 'ApexTrigger' || automation.type === 'ApexClass') {
                // For Apex, try to extract from body if available
                if (automation.body) {
                    const fieldPattern = new RegExp(`\\.${field.split('.')[1]}\\s*=\\s*([^;]+);`, 'g');
                    const matches = [...automation.body.matchAll(fieldPattern)];
                    if (matches.length > 0) {
                        fieldWrite.writeValue = matches.map(m => m[1].trim()).join('; OR ');
                        fieldWrite.writeType = 'APEX_ASSIGNMENT';
                    }
                }
            } else if (automation.type === 'Flow' || automation.type === 'ProcessBuilder') {
                // For Flows/PB, extract from assignments if available
                if (automation.assignments) {
                    const fieldAssignment = automation.assignments.find(a => a.field === field.split('.')[1]);
                    if (fieldAssignment) {
                        fieldWrite.writeValue = fieldAssignment.value || fieldAssignment.literalValue || 'DYNAMIC';
                        fieldWrite.writeFormula = fieldAssignment.formula || null;
                        fieldWrite.writeType = 'FLOW_ASSIGNMENT';
                    }
                }
            } else if (automation.type === 'WorkflowRule') {
                // For Workflow Rules, extract from field updates
                if (automation.fieldUpdates) {
                    const fieldUpdate = automation.fieldUpdates.find(fu => fu.field === field.split('.')[1]);
                    if (fieldUpdate) {
                        fieldWrite.writeValue = fieldUpdate.literalValue || fieldUpdate.name;
                        fieldWrite.writeFormula = fieldUpdate.formula || null;
                        fieldWrite.writeType = 'WORKFLOW_FIELD_UPDATE';
                    }
                }
            }

            // Extract execution context (when does it run?)
            if (automation.objectTargets && automation.objectTargets.length > 0) {
                const target = automation.objectTargets[0];
                if (target.when && target.when.length > 0) {
                    fieldWrite.executionContext = target.when.join(', ');
                }
            }

            return fieldWrite;
        });
    }

    /**
     * ENHANCED: Calculate data corruption risk for field collisions
     * Returns risk level and impact description
     */
    calculateCorruptionRisk(fieldWriteDetails) {
        let riskScore = 0;
        const factors = [];

        // Factor 1: Number of competing writes (max 40 points)
        const writerCount = fieldWriteDetails.length;
        riskScore += Math.min(writerCount * 10, 40);
        factors.push(`${writerCount} competing writes`);

        // Factor 2: Conflicting write values (max 30 points)
        const uniqueValues = new Set(fieldWriteDetails.map(fw => fw.writeValue).filter(v => v));
        if (uniqueValues.size > 1) {
            riskScore += 30;
            factors.push(`${uniqueValues.size} different values`);
        }

        // Factor 3: Write type diversity (max 20 points)
        const writeTypes = new Set(fieldWriteDetails.map(fw => fw.writeType));
        if (writeTypes.size > 2) {
            riskScore += 20;
            factors.push(`${writeTypes.size} different automation types`);
        }

        // Factor 4: Formula vs literal conflicts (max 10 points)
        const hasFormulas = fieldWriteDetails.some(fw => fw.writeFormula);
        const hasLiterals = fieldWriteDetails.some(fw => fw.writeValue && !fw.writeFormula);
        if (hasFormulas && hasLiterals) {
            riskScore += 10;
            factors.push('Formula vs literal conflict');
        }

        // Determine severity and risk level
        let severity = 'MEDIUM';
        let level = 'MODERATE';
        if (riskScore >= 70) {
            severity = 'CRITICAL';
            level = 'SEVERE';
        } else if (riskScore >= 50) {
            severity = 'HIGH';
            level = 'HIGH';
        } else if (riskScore < 30) {
            severity = 'MEDIUM';
            level = 'LOW';
        }

        return {
            severity: severity,
            level: level,
            score: riskScore,
            factors: factors,
            impactDescription: `${factors.join(', ')} cause unpredictable field values`
        };
    }

    /**
     * ENHANCED: Analyze execution order for field collisions
     * Determines current vs recommended execution order
     */
    analyzeExecutionOrder(writers, object) {
        const executionPhases = {
            beforeInsert: [],
            afterInsert: [],
            beforeUpdate: [],
            afterUpdate: [],
            beforeDelete: [],
            afterDelete: [],
            afterUndelete: [],
            async: []
        };

        // Group writers by execution phase
        for (const writer of writers) {
            if (writer.objectTargets) {
                for (const target of writer.objectTargets) {
                    if (target.objectApiName === object && target.when) {
                        for (const event of target.when) {
                            if (executionPhases[event]) {
                                executionPhases[event].push({
                                    name: writer.name,
                                    type: writer.type,
                                    order: writer.triggerOrder || null
                                });
                            }
                        }
                    }
                }
            }
        }

        // Analyze each phase
        const analysis = [];
        for (const [phase, phaseWriters] of Object.entries(executionPhases)) {
            if (phaseWriters.length > 1) {
                const orderedCount = phaseWriters.filter(w => w.order !== null).length;
                const unorderedCount = phaseWriters.length - orderedCount;

                analysis.push({
                    phase: phase,
                    writerCount: phaseWriters.length,
                    ordered: orderedCount,
                    unordered: unorderedCount,
                    writers: phaseWriters,
                    risk: unorderedCount > 0 ? 'HIGH' : 'MEDIUM',
                    recommendation: unorderedCount > 0
                        ? `Define explicit execution order for ${unorderedCount} unordered automation`
                        : 'Consolidate into single automation to eliminate race conditions'
                });
            }
        }

        return {
            hasOrderingIssues: analysis.some(a => a.unordered > 0),
            phaseAnalysis: analysis,
            overallRecommendation: analysis.length > 0
                ? 'Set explicit execution order or consolidate all field updates into single automation'
                : 'No ordering issues detected'
        };
    }

    /**
     * Check if automation execute in same context
     */
    checkSameExecutionContext(automations, object) {
        // Check if any automation trigger on same object
        const objectAutomation = automations.filter(a =>
            (a.objectTargets || []).some(t => t.objectApiName === object)
        );

        return objectAutomation.length > 1;
    }

    /**
     * Rule 4: Detect workflow re-evaluation loops
     */
    detectReevalLoops() {
        const conflicts = [];

        // Find workflows with re-eval enabled
        const reevalWorkflows = this.automations.filter(a =>
            a.type === 'WorkflowRule' &&
            a.recursionSettings?.includes('Re-evaluates')
        );

        for (const workflow of reevalWorkflows) {
            const object = workflow.objectTargets?.[0]?.objectApiName;
            if (!object) continue;

            // Find other automation that also update this object
            const otherAutomation = this.automations.filter(a =>
                a.id !== workflow.id &&
                (a.writes || []).some(w => w.startsWith(`${object}.`))
            );

            if (otherAutomation.length > 0) {
                // NEW: Calculate severity with rationale
                const severityResult = this.calculateSeverityWithRationale({
                    otherAutomationCount: otherAutomation.length
                }, 'REEVAL_LOOP');

                conflicts.push({
                    conflictId: `REEVAL_LOOP_${conflicts.length + 1}`,
                    severity: severityResult.severity,
                    severityRationale: severityResult.severityRationale,
                    rule: 'REEVAL_LOOP',
                    object: object,
                    involved: [workflow, ...otherAutomation].map(a => ({
                        type: a.type,
                        name: a.name,
                        id: a.id
                    })),
                    evidence: `Workflow re-evaluates on ${object} update, ${otherAutomation.length} other automation also update ${object}`,
                    impact: severityResult.severityRationale.impactSummary,
                    recommendation: {
                        priority: severityResult.severity,
                        action: 'REMOVE_REEVAL_OR_ADD_GUARDS',
                        steps: [
                            'Review workflow re-evaluation necessity',
                            'Remove re-eval flag if not needed',
                            'Add recursion guards with custom field',
                            'Add criteria to prevent re-triggering',
                            'Test with bulk updates (200 records)'
                        ],
                        estimatedTime: '1-2 hours',
                        complexity: 'MEDIUM'
                    }
                });
            }
        }

        return conflicts;
    }

    /**
     * Rule 5: Detect cross-object cascades
     */
    detectCrossObjectCascades() {
        const conflicts = [];
        const cycles = this.graph.detectCircularPaths();

        // Filter for cross-object cycles
        const crossObjectCycles = cycles.filter(cycle => {
            const objects = new Set();
            for (const node of cycle) {
                const automation = this.automations.find(a => a.id === node.id);
                if (automation) {
                    for (const target of (automation.objectTargets || [])) {
                        objects.add(target.objectApiName);
                    }
                }
            }
            return objects.size > 1; // Multiple objects in cycle
        });

        for (const cycle of crossObjectCycles) {
            const objects = new Set();
            const automationIds = cycle.map(n => n.id);

            for (const node of cycle) {
                const automation = this.automations.find(a => a.id === node.id);
                if (automation) {
                    for (const target of (automation.objectTargets || [])) {
                        objects.add(target.objectApiName);
                    }
                }
            }

            // NEW: Calculate severity with rationale
            const severityResult = this.calculateSeverityWithRationale({
                objects: Array.from(objects)
            }, 'CYCLE_CASCADE');

            conflicts.push({
                conflictId: `CYCLE_CASCADE_${conflicts.length + 1}`,
                severity: severityResult.severity,
                severityRationale: severityResult.severityRationale,
                rule: 'CYCLE_CASCADE',
                cycle: cycle.map(n => n.name).join(' → '),
                objects: Array.from(objects),
                involved: cycle.map(n => ({
                    type: n.type,
                    name: n.name,
                    id: n.id
                })),
                evidence: `Circular update chain: ${Array.from(objects).join(' → ')}`,
                impact: severityResult.severityRationale.impactSummary,
                recommendation: {
                    priority: severityResult.severity,
                    action: 'BREAK_CYCLE',
                    steps: [
                        'Map complete cycle path',
                        'Identify least critical link',
                        'Add conditional logic to break cycle',
                        'Use static flags to prevent recursion',
                        'Add @future or queueable to break synchronous chain',
                        'Test thoroughly with bulk data'
                    ],
                    estimatedTime: '4-6 hours',
                    complexity: 'HIGH'
                }
            });
        }

        return conflicts;
    }

    /**
     * Rule 6: Detect async collisions
     */
    detectAsyncCollisions() {
        const conflicts = [];
        const objectsWithAsync = new Map();

        // Find automation with scheduled/async behavior
        for (const auto of this.automations) {
            // Scheduled flows
            const hasScheduledPaths = (auto.riskSignals || []).some(s =>
                s.code === 'TIME_BASED_ACTIONS'
            );

            // Async Apex (future/queueable/batch)
            const isAsyncApex = auto.type === 'ApexClass' &&
                (auto.invokes || []).some(inv => inv.type === 'Queueable' || inv.type === 'Batch');

            if (hasScheduledPaths || isAsyncApex) {
                for (const target of (auto.objectTargets || [])) {
                    const obj = target.objectApiName;
                    if (!objectsWithAsync.has(obj)) {
                        objectsWithAsync.set(obj, []);
                    }
                    objectsWithAsync.get(obj).push({ ...auto, asyncType: hasScheduledPaths ? 'scheduled' : 'async' });
                }
            }
        }

        // Find collisions
        for (const [object, asyncAutomation] of objectsWithAsync) {
            if (asyncAutomation.length > 1) {
                // NEW: Calculate severity with rationale
                const severityResult = this.calculateSeverityWithRationale({
                    asyncCount: asyncAutomation.length
                }, 'ASYNC_COLLISION');

                conflicts.push({
                    conflictId: `ASYNC_COLLISION_${conflicts.length + 1}`,
                    severity: severityResult.severity,
                    severityRationale: severityResult.severityRationale,
                    rule: 'ASYNC_COLLISION',
                    object: object,
                    involved: asyncAutomation.map(a => ({
                        type: a.type,
                        name: a.name,
                        id: a.id,
                        asyncType: a.asyncType
                    })),
                    evidence: `${asyncAutomation.length} async automation update ${object} later`,
                    impact: severityResult.severityRationale.impactSummary,
                    recommendation: {
                        priority: severityResult.severity,
                        action: 'CONSOLIDATE_OR_SEQUENCE_ASYNC',
                        steps: [
                            'Review async logic overlap',
                            'Consolidate if same business purpose',
                            'Add locking mechanism if sequential needed',
                            'Document timing dependencies',
                            'Add monitoring for race conditions'
                        ],
                        estimatedTime: '2-3 hours',
                        complexity: 'MEDIUM'
                    }
                });
            }
        }

        return conflicts;
    }

    /**
     * Rule 7: Detect undefined flow order
     */
    detectUndefinedFlowOrder() {
        const conflicts = [];
        const flowsByObjectPhase = new Map();

        // Group flows by object+phase
        for (const auto of this.automations) {
            if (auto.type !== 'Flow') continue;
            if (auto.status !== 'Active') continue;

            for (const target of (auto.objectTargets || [])) {
                const obj = target.objectApiName;
                for (const event of (target.when || [])) {
                    const key = `${obj}:${event}`;
                    if (!flowsByObjectPhase.has(key)) {
                        flowsByObjectPhase.set(key, []);
                    }
                    flowsByObjectPhase.get(key).push(auto);
                }
            }
        }

        // Find flows without trigger order
        for (const [key, flows] of flowsByObjectPhase) {
            const unordered = flows.filter(f => !f.triggerOrder);

            if (unordered.length > 1) {
                const [object, phase] = key.split(':');

                // NEW: Calculate severity with rationale
                const severityResult = this.calculateSeverityWithRationale({
                    unorderedCount: unordered.length
                }, 'UNDEFINED_ORDER');

                conflicts.push({
                    conflictId: `UNDEFINED_ORDER_${conflicts.length + 1}`,
                    severity: severityResult.severity,
                    severityRationale: severityResult.severityRationale,
                    rule: 'UNDEFINED_FLOW_ORDER',
                    object: object,
                    phase: phase,
                    involved: unordered.map(f => ({
                        type: f.type,
                        name: f.name,
                        id: f.id
                    })),
                    evidence: `${unordered.length} flows on ${object}.${phase} without Trigger Order`,
                    impact: severityResult.severityRationale.impactSummary,
                    recommendation: {
                        priority: severityResult.severity,
                        action: 'SET_TRIGGER_ORDER',
                        steps: [
                            'Review each flow logic',
                            'Determine dependency order',
                            'Set Trigger Order: 100, 200, 300, etc.',
                            'Update flow metadata',
                            'Deploy and verify execution order'
                        ],
                        estimatedTime: '1-2 hours',
                        complexity: 'LOW'
                    }
                });
            }
        }

        return conflicts;
    }

    /**
     * Rule 8: Detect governor limit pressure
     */
    detectGovernorPressure() {
        const conflicts = [];

        // For each transaction path, calculate pressure
        const paths = this.graph.calculateExecutionPhases();

        for (const phase of paths) {
            if (phase.warning === 'Circular dependency detected') continue;

            let totalDML = 0;
            let totalSOQL = 0;
            let totalRows = 0;

            for (const node of phase.nodes) {
                const automation = this.automations.find(a => a.id === node.id);
                if (!automation) continue;

                totalDML += (automation.dml || []).length;
                totalSOQL += (automation.soql || []).length;
                totalRows += (automation.dml || []).reduce((sum, d) => sum + (d.approxRows || 1), 0);
            }

            const risks = [];
            if (totalDML > 100) risks.push(`DML: ${totalDML} statements (limit 150)`);
            if (totalSOQL > 50) risks.push(`SOQL: ${totalSOQL} queries (limit 100)`);
            if (totalRows > 8000) risks.push(`DML Rows: ${totalRows} (limit 10,000)`);

            if (risks.length > 0) {
                // NEW: Calculate severity with rationale
                const severityResult = this.calculateSeverityWithRationale({
                    metrics: { totalDML, totalSOQL, totalRows }
                }, 'GOVERNOR_PRESSURE');

                conflicts.push({
                    conflictId: `GOVERNOR_PRESSURE_${conflicts.length + 1}`,
                    severity: severityResult.severity,
                    severityRationale: severityResult.severityRationale,
                    rule: 'GOVERNOR_PRESSURE',
                    phase: phase.phase,
                    transactionPath: phase.nodes.map(n => n.name),
                    metrics: { totalDML, totalSOQL, totalRows },
                    involved: phase.nodes.map(n => ({
                        type: n.type,
                        name: n.name,
                        id: n.id
                    })),
                    evidence: risks.join(', '),
                    impact: severityResult.severityRationale.impactSummary,
                    recommendation: {
                        priority: severityResult.severity,
                        action: 'OPTIMIZE_OR_MOVE_ASYNC',
                        steps: [
                            'Optimize DML/SOQL with bulkification',
                            'Combine DML operations where possible',
                            'Move heavy operations to @future/queueable',
                            'Use platform events for decoupling',
                            'Add monitoring for limit consumption'
                        ],
                        estimatedTime: '3-5 hours',
                        complexity: 'HIGH'
                    }
                });
            }
        }

        return conflicts;
    }

    /**
     * Generate conflict report
     */
    generateReport() {
        return {
            timestamp: new Date().toISOString(),
            totalConflicts: this.conflicts.length,
            bySeverity: {
                CRITICAL: this.conflicts.filter(c => c.severity === 'CRITICAL').length,
                HIGH: this.conflicts.filter(c => c.severity === 'HIGH').length,
                MEDIUM: this.conflicts.filter(c => c.severity === 'MEDIUM').length,
                LOW: this.conflicts.filter(c => c.severity === 'LOW').length
            },
            byRule: this.conflicts.reduce((acc, c) => {
                acc[c.rule] = (acc[c.rule] || 0) + 1;
                return acc;
            }, {}),
            conflicts: this.conflicts
        };
    }
}

module.exports = AutomationConflictEngine;

// CLI Interface
if (require.main === module) {
    const fs = require('fs');
    const args = process.argv.slice(2);

    if (args.length < 1) {
        console.log(`
Automation Conflict Engine
==========================

Usage:
  node automation-conflict-engine.js <udm-file.json> [options]

Options:
  --output <file>     Write conflict report to file

Examples:
  node automation-conflict-engine.js automations.json
  node automation-conflict-engine.js automations.json --output conflicts.json
        `);
        process.exit(1);
    }

    try {
        const inputFile = args[0];
        const automations = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

        const engine = new AutomationConflictEngine(automations);
        const conflicts = engine.detectAllConflicts();
        const report = engine.generateReport();

        console.log('\nConflict Detection Summary:');
        console.log(`  Total Conflicts: ${report.totalConflicts}`);
        console.log(`  CRITICAL: ${report.bySeverity.CRITICAL}`);
        console.log(`  HIGH: ${report.bySeverity.HIGH}`);
        console.log(`  MEDIUM: ${report.bySeverity.MEDIUM}`);
        console.log(`  LOW: ${report.bySeverity.LOW}`);

        if (args.includes('--output')) {
            const outputFile = args[args.indexOf('--output') + 1];
            fs.writeFileSync(outputFile, JSON.stringify(report, null, 2));
            console.log(`\n✓ Conflict report written to: ${outputFile}`);
        } else {
            console.log('\n' + JSON.stringify(report, null, 2));
        }

    } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
        process.exit(1);
    }
}
