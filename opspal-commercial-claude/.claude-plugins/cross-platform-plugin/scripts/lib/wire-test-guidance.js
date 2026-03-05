#!/usr/bin/env node
/**
 * Live Wire Sync Test - Guidance Rule Engine
 *
 * Purpose: Map test results to actionable guidance and recommendations.
 * Provides specific advice based on probe outcomes, collisions, and errors.
 *
 * Features:
 * - Symptom → advice mapping
 * - Prioritized recommendations
 * - Connector-specific guidance
 * - Collision resolution strategies
 * - Performance optimization tips
 *
 * Usage:
 *   const Guidance = require('./wire-test-guidance');
 *
 *   // Get guidance for probe results
 *   const advice = Guidance.getProbeGuidance(sfToHsResult, hsToSfResult);
 *
 *   // Get collision guidance
 *   const collisionAdvice = Guidance.getCollisionGuidance(collisions);
 */

class WireTestGuidance {
    /**
     * Get guidance based on probe results
     * @param {object} sfToHsResult - SF→HS probe result {status, lag_seconds}
     * @param {object} hsToSfResult - HS→SF probe result {status, lag_seconds}
     * @returns {Array<object>} Array of guidance items
     */
    static getProbeGuidance(sfToHsResult, hsToSfResult) {
        const guidance = [];

        const sfPassed = sfToHsResult.status === 'success';
        const hsPassed = hsToSfResult.status === 'success';

        // Both pass
        if (sfPassed && hsPassed) {
            guidance.push({
                severity: 'success',
                title: 'Bidirectional sync is working',
                message: `Both directions syncing successfully. SF→HS lag: ${sfToHsResult.lag_seconds}s, HS→SF lag: ${hsToSfResult.lag_seconds}s`,
                actions: this._getPerformanceActions(sfToHsResult, hsToSfResult)
            });
        }

        // SF→HS pass, HS→SF fail
        if (sfPassed && !hsPassed) {
            guidance.push({
                severity: 'error',
                title: 'HS→SF sync is broken',
                message: 'Changes in HubSpot are not propagating to Salesforce',
                root_causes: [
                    'HubSpot→Salesforce connector mapping not configured or disabled',
                    'Salesforce field Wire_Test_2__c not included in connector mapping',
                    'Field-level security blocking writes for integration user',
                    'Connector paused or error state',
                    'Wire_Test_Run_ID__c mapping missing (prevents correlation)'
                ],
                actions: [
                    {
                        priority: 1,
                        action: 'Verify HubSpot→Salesforce connector is active',
                        command: 'Check HubSpot connector settings → Operations → View sync activity'
                    },
                    {
                        priority: 2,
                        action: 'Confirm Wire_Test_2__c is mapped bidirectionally',
                        command: 'HubSpot connector → Field mappings → wire_test_2 ↔ Wire_Test_2__c'
                    },
                    {
                        priority: 3,
                        action: 'Verify Salesforce field-level security for integration user',
                        command: `sf data query --query "SELECT Field, PermissionsEdit FROM FieldPermissions WHERE SobjectType = 'Account' AND Field = 'Account.Wire_Test_2__c' AND Parent.Profile.Name = 'Integration User'" --use-tooling-api`
                    },
                    {
                        priority: 4,
                        action: 'Check connector error logs for failures',
                        command: 'HubSpot connector → View sync errors in last 24 hours'
                    },
                    {
                        priority: 5,
                        action: 'Verify Wire_Test_Run_ID__c and Wire_Test_Timestamp__c are mapped',
                        command: 'HubSpot connector → Ensure wire_test_run_id and wire_test_timestamp have bidirectional mapping'
                    }
                ]
            });
        }

        // SF→HS fail, HS→SF pass
        if (!sfPassed && hsPassed) {
            guidance.push({
                severity: 'error',
                title: 'SF→HS sync is broken',
                message: 'Changes in Salesforce are not propagating to HubSpot',
                root_causes: [
                    'Salesforce→HubSpot connector mapping not configured or disabled',
                    'HubSpot property wire_test_1 not included in connector mapping',
                    'HubSpot property permissions blocking writes',
                    'Connector paused or error state',
                    'Wire_Test_Run_ID__c mapping missing (prevents correlation)'
                ],
                actions: [
                    {
                        priority: 1,
                        action: 'Verify Salesforce→HubSpot connector direction is enabled',
                        command: 'Check HubSpot connector settings → Ensure SF→HS sync is active'
                    },
                    {
                        priority: 2,
                        action: 'Confirm Wire_Test_1__c is mapped bidirectionally',
                        command: 'HubSpot connector → Field mappings → Wire_Test_1__c ↔ wire_test_1'
                    },
                    {
                        priority: 3,
                        action: 'Verify HubSpot property permissions',
                        command: 'Check HubSpot property settings → wire_test_1 → Edit permissions for integration app'
                    },
                    {
                        priority: 4,
                        action: 'Check connector sync backlog',
                        command: 'HubSpot connector → View pending sync queue - large backlog causes delays'
                    },
                    {
                        priority: 5,
                        action: 'Verify Wire_Test_Run_ID__c and Wire_Test_Timestamp__c are mapped',
                        command: 'HubSpot connector → Ensure wire_test_run_id and wire_test_timestamp have bidirectional mapping'
                    }
                ]
            });
        }

        // Both fail
        if (!sfPassed && !hsPassed) {
            guidance.push({
                severity: 'critical',
                title: 'Bidirectional sync is completely broken',
                message: 'Neither direction is syncing - connector may be paused or misconfigured',
                root_causes: [
                    'Connector completely paused or disabled',
                    'Authentication failure (expired credentials)',
                    'Sync_Anchor__c / sync_anchor field mapping missing or broken',
                    'All wire test field mappings missing',
                    'API rate limits exceeded',
                    'Network connectivity issues between systems'
                ],
                actions: [
                    {
                        priority: 1,
                        action: 'Verify connector is active and not paused',
                        command: 'HubSpot connector → Check overall status and error count'
                    },
                    {
                        priority: 2,
                        action: 'Re-authenticate connector credentials',
                        command: 'HubSpot connector → Settings → Re-authorize Salesforce connection'
                    },
                    {
                        priority: 3,
                        action: 'Verify Sync_Anchor__c ↔ sync_anchor mapping exists',
                        command: 'HubSpot connector → Field mappings → Confirm bidirectional sync_anchor mapping'
                    },
                    {
                        priority: 4,
                        action: 'Check API rate limits on both platforms',
                        command: 'Salesforce: Setup → System Overview → API Usage; HubSpot: Settings → Account → API calls'
                    },
                    {
                        priority: 5,
                        action: 'Review connector logs for authentication or permission errors',
                        command: 'HubSpot connector → Error logs → Filter by last 1 hour'
                    }
                ]
            });
        }

        // Timeout-specific guidance
        if (sfToHsResult.status === 'timeout' || hsToSfResult.status === 'timeout') {
            const timeoutDirection = sfToHsResult.status === 'timeout' ? 'SF→HS' : 'HS→SF';
            guidance.push({
                severity: 'warning',
                title: `${timeoutDirection} sync timeout (exceeded SLA)`,
                message: `Sync is working but slower than expected. SLA: ${this._getSLA(sfToHsResult, hsToSfResult)}s`,
                root_causes: [
                    'Connector sync backlog (high volume)',
                    'Large number of pending operations in queue',
                    'Complex workflows or triggers causing delays',
                    'API rate limiting slowing sync',
                    'Network latency between systems'
                ],
                actions: [
                    {
                        priority: 1,
                        action: 'Increase SLA timeout for this org',
                        command: 'In config: sla_seconds: 480 (8 minutes) for high-volume orgs'
                    },
                    {
                        priority: 2,
                        action: 'Check connector sync queue size',
                        command: 'HubSpot connector → View pending operations count'
                    },
                    {
                        priority: 3,
                        action: 'Run test during off-peak hours',
                        command: 'Retry test when sync volume is lower (e.g., weekends, nights)'
                    },
                    {
                        priority: 4,
                        action: 'Review complex Salesforce/HubSpot workflows on these objects',
                        command: 'Check for long-running triggers, process builders, or workflow automations'
                    }
                ]
            });
        }

        return guidance;
    }

    /**
     * Get performance optimization actions
     * @private
     */
    static _getPerformanceActions(sfToHsResult, hsToSfResult) {
        const actions = [];

        const sfLag = sfToHsResult.lag_seconds || 0;
        const hsLag = hsToSfResult.lag_seconds || 0;
        const avgLag = (sfLag + hsLag) / 2;

        if (avgLag > 120) {
            actions.push({
                priority: 1,
                action: 'Sync lag is high (>2 minutes average)',
                command: 'Consider: reducing sync frequency, optimizing workflows, or upgrading connector plan'
            });
        } else if (avgLag > 60) {
            actions.push({
                priority: 2,
                action: 'Sync lag is moderate (>1 minute average)',
                command: 'Monitor: acceptable for most use cases, but watch for trends'
            });
        } else {
            actions.push({
                priority: 3,
                action: 'Sync performance is excellent (<1 minute)',
                command: 'No action needed - maintain current configuration'
            });
        }

        return actions;
    }

    /**
     * Get SLA from results
     * @private
     */
    static _getSLA(sfToHsResult, hsToSfResult) {
        return sfToHsResult.timeout_seconds || hsToSfResult.timeout_seconds || 240;
    }

    /**
     * Get collision resolution guidance
     * @param {object} collisions - Collision detection results
     * @returns {Array<object>}
     */
    static getCollisionGuidance(collisions) {
        const guidance = [];

        // One-to-many collisions
        if (collisions.one_to_many.length > 0) {
            collisions.one_to_many.forEach(collision => {
                guidance.push({
                    severity: 'warning',
                    title: `One-to-many collision detected (${collision.objectType})`,
                    message: `HubSpot record ${collision.hubspot_id} is linked to ${collision.count} Salesforce records`,
                    details: {
                        hubspot_id: collision.hubspot_id,
                        salesforce_ids: collision.salesforce_ids,
                        sync_anchors: collision.sync_anchors
                    },
                    root_causes: [
                        'Duplicate Salesforce records created before Sync Anchor implementation',
                        'Manual record creation in both systems without proper linking',
                        'Merge operation preserved HubSpot ID on multiple SF records',
                        'Connector created duplicates due to matching rule issues'
                    ],
                    actions: [
                        {
                            priority: 1,
                            action: 'Identify the canonical/winner Salesforce record',
                            command: `sf data query --query "SELECT Id, Name, CreatedDate, LastModifiedDate FROM ${collision.objectType} WHERE Id IN ('${collision.salesforce_ids.join("','")}')" --target-org <org>`
                        },
                        {
                            priority: 2,
                            action: 'Deduplicate Salesforce records (merge losers into winner)',
                            command: 'Use Salesforce merge functionality or dedup tool to consolidate records'
                        },
                        {
                            priority: 3,
                            action: 'After merge, update Former_SFDC_IDs__c on winner',
                            command: 'Append losing record IDs to Former_SFDC_IDs__c field for historical tracking'
                        },
                        {
                            priority: 4,
                            action: 'Verify winner has correct Sync_Anchor__c',
                            command: 'Ensure winner retains stable Sync Anchor - do NOT regenerate'
                        }
                    ]
                });
            });
        }

        // Many-to-one collisions
        if (collisions.many_to_one.length > 0) {
            collisions.many_to_one.forEach(collision => {
                guidance.push({
                    severity: 'warning',
                    title: `Many-to-one collision detected (${collision.objectType})`,
                    message: `Salesforce record ${collision.salesforce_id} is linked to ${collision.count} HubSpot records`,
                    details: {
                        salesforce_id: collision.salesforce_id,
                        hubspot_ids: collision.hubspot_ids,
                        sync_anchors: collision.sync_anchors
                    },
                    root_causes: [
                        'Duplicate HubSpot records created before sync_anchor implementation',
                        'Manual record creation without proper linking',
                        'HubSpot merge preserved Salesforce ID on multiple HS records'
                    ],
                    actions: [
                        {
                            priority: 1,
                            action: 'Identify the canonical/winner HubSpot record',
                            command: 'Review HubSpot records to determine most complete/recent'
                        },
                        {
                            priority: 2,
                            action: 'Deduplicate HubSpot records (merge losers into winner)',
                            command: 'Use HubSpot merge functionality to consolidate records'
                        },
                        {
                            priority: 3,
                            action: 'After merge, update former_hubspot_ids on winner',
                            command: 'Append losing record IDs to former_hubspot_ids property'
                        },
                        {
                            priority: 4,
                            action: 'Verify winner has correct sync_anchor',
                            command: 'Ensure winner retains stable sync_anchor - do NOT regenerate'
                        }
                    ]
                });
            });
        }

        // No collisions
        if (collisions.total === 0) {
            guidance.push({
                severity: 'success',
                title: 'No collisions detected',
                message: 'All records have 1:1 relationships between Salesforce and HubSpot',
                actions: []
            });
        }

        return guidance;
    }

    /**
     * Get comprehensive guidance for test run
     * @param {object} testResults - Complete test results
     * @returns {object}
     */
    static getComprehensiveGuidance(testResults) {
        const guidance = {
            summary: {
                overall_health: 'unknown',
                critical_issues: 0,
                warnings: 0,
                successes: 0
            },
            recommendations: [],
            next_steps: []
        };

        // Analyze probe results
        if (testResults.probes) {
            Object.values(testResults.probes).forEach(probe => {
                const probeGuidance = this.getProbeGuidance(
                    probe.sf_to_hs || { status: 'unknown' },
                    probe.hs_to_sf || { status: 'unknown' }
                );
                guidance.recommendations.push(...probeGuidance);
            });
        }

        // Analyze collisions
        if (testResults.collisions) {
            const collisionGuidance = this.getCollisionGuidance(testResults.collisions);
            guidance.recommendations.push(...collisionGuidance);
        }

        // Calculate severity counts
        guidance.recommendations.forEach(rec => {
            if (rec.severity === 'critical' || rec.severity === 'error') {
                guidance.summary.critical_issues++;
            } else if (rec.severity === 'warning') {
                guidance.summary.warnings++;
            } else if (rec.severity === 'success') {
                guidance.summary.successes++;
            }
        });

        // Determine overall health
        if (guidance.summary.critical_issues > 0) {
            guidance.summary.overall_health = 'critical';
        } else if (guidance.summary.warnings > 0) {
            guidance.summary.overall_health = 'warning';
        } else {
            guidance.summary.overall_health = 'healthy';
        }

        // Generate next steps
        guidance.next_steps = this._generateNextSteps(guidance.recommendations);

        return guidance;
    }

    /**
     * Generate prioritized next steps
     * @private
     */
    static _generateNextSteps(recommendations) {
        const steps = [];

        // Extract all actions from recommendations
        const allActions = [];
        recommendations.forEach(rec => {
            if (rec.actions) {
                rec.actions.forEach(action => {
                    allActions.push({
                        ...action,
                        severity: rec.severity,
                        title: rec.title
                    });
                });
            }
        });

        // Sort by severity then priority
        const severityOrder = { critical: 0, error: 1, warning: 2, success: 3 };
        allActions.sort((a, b) => {
            const severityCompare = severityOrder[a.severity] - severityOrder[b.severity];
            if (severityCompare !== 0) return severityCompare;
            return a.priority - b.priority;
        });

        // Take top 10 actions
        return allActions.slice(0, 10).map((action, index) => ({
            step: index + 1,
            priority: action.priority,
            severity: action.severity,
            action: action.action,
            command: action.command,
            related_to: action.title
        }));
    }
}

module.exports = WireTestGuidance;
