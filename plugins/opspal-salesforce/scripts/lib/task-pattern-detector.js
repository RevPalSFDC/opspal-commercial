#!/usr/bin/env node

/**
 * Task Pattern Detector
 *
 * Analyzes user task descriptions to automatically detect:
 * 1. Operation type (query/update/delete/merge/deploy/etc.)
 * 2. Complexity score (0.0 - 1.0)
 * 3. Recommended agent
 * 4. Confidence level
 *
 * Based on: Session reflection 2025-10-06
 * Purpose: Prevent "spinning cycles" by immediately routing to appropriate agents
 *
 * Usage:
 *   node task-pattern-detector.js "Update Booked ARR for 184 renewals"
 *
 * Returns JSON:
 *   {
 *     "operation_type": "bulk_update",
 *     "complexity_score": 0.7,
 *     "recommended_agent": "sfdc-data-operations",
 *     "confidence_level": 95,
 *     "reasoning": "Detected bulk update pattern with 184 records...",
 *     "keywords_matched": ["update", "184", "renewal"],
 *     "risk_level": "high"
 *   }
 */

const fs = require('fs');
const path = require('path');

// Agent pattern definitions (synced with pre-task-hook.sh)
const AGENT_PATTERNS = {
    // Data Operations
    'bulk_update': {
        patterns: [
            /update.*based on/i,
            /set.*to.*for/i,
            /calculate.*from/i,
            /sync.*with/i,
            /copy.*to.*field/i,
            /populate.*field/i,
            /fill.*field/i,
            /update.*\d{2,}.*record/i,
            /update.*renewal/i,
            /update.*opportunit/i
        ],
        agent: 'sfdc-data-operations',
        base_complexity: 0.6,
        risk_level: 'high'
    },

    'data_import': {
        patterns: [
            /import.*csv/i,
            /bulk.*insert/i,
            /load.*data/i,
            /import.*from/i,
            /upload.*records/i
        ],
        agent: 'sfdc-data-operations',
        base_complexity: 0.7,
        risk_level: 'high'
    },

    'data_export': {
        patterns: [
            /export.*to.*csv/i,
            /extract.*data/i,
            /download.*records/i,
            /query.*and.*save/i
        ],
        agent: 'sfdc-data-operations',
        base_complexity: 0.3,
        risk_level: 'low'
    },

    // Deployment Operations
    'production_deploy': {
        patterns: [
            /deploy.*production/i,
            /production.*deploy/i,
            /release.*production/i,
            /push.*production/i
        ],
        agent: 'release-coordinator',
        base_complexity: 0.9,
        risk_level: 'critical'
    },

    'metadata_deploy': {
        patterns: [
            /deploy.*metadata/i,
            /deploy.*field/i,
            /deploy.*object/i,
            /create.*field/i,
            /create.*object/i
        ],
        agent: 'sfdc-metadata-manager',
        base_complexity: 0.6,
        risk_level: 'medium'
    },

    // Merge/Consolidation Operations
    'merge_operation': {
        patterns: [
            /merge.*field/i,
            /consolidate.*object/i,
            /combine.*into/i,
            /merge.*duplicate/i
        ],
        agent: 'sfdc-merge-orchestrator',
        base_complexity: 0.8,
        risk_level: 'high'
    },

    // Conflict Resolution
    'conflict_resolution': {
        patterns: [
            /conflict/i,
            /failed.*deploy/i,
            /deployment.*error/i,
            /mismatch/i,
            /incompatible/i
        ],
        agent: 'sfdc-conflict-resolver',
        base_complexity: 0.7,
        risk_level: 'high'
    },

    // Security/Permissions
    'permission_change': {
        patterns: [
            /permission.*set/i,
            /profile.*update/i,
            /security.*change/i,
            /access.*control/i,
            /grant.*access/i
        ],
        agent: 'sfdc-permission-orchestrator',
        base_complexity: 0.6,
        risk_level: 'high'
    },

    // Automation
    'flow_creation': {
        patterns: [
            /create.*flow/i,
            /new.*workflow/i,
            /automation/i,
            /process.*builder/i
        ],
        agent: 'sfdc-automation-builder',
        base_complexity: 0.7,
        risk_level: 'medium'
    },

    // Reporting
    'report_creation': {
        patterns: [
            /create.*report/i,
            /new.*dashboard/i,
            /analytics/i,
            /build.*report/i
        ],
        agent: 'sfdc-reports-dashboards',
        base_complexity: 0.5,
        risk_level: 'low'
    },

    // Assessment/Audit
    'revops_audit': {
        patterns: [
            /revops.*audit/i,
            /assessment/i,
            /cpq.*assess/i,
            /analyze.*org/i,
            /health.*check/i
        ],
        agent: 'sfdc-revops-auditor',
        base_complexity: 0.8,
        risk_level: 'low'
    },

    // Planning
    'complex_planning': {
        patterns: [
            /plan.*implementation/i,
            /design.*solution/i,
            /architecture/i,
            /strategy/i,
            /roadmap/i
        ],
        agent: 'sfdc-planner',
        base_complexity: 0.5,
        risk_level: 'low'
    }
};

/**
 * Detect operation type from task description
 */
function detectOperationType(taskDescription) {
    const matches = [];

    for (const [opType, config] of Object.entries(AGENT_PATTERNS)) {
        for (const pattern of config.patterns) {
            if (pattern.test(taskDescription)) {
                matches.push({
                    operation_type: opType,
                    agent: config.agent,
                    base_complexity: config.base_complexity,
                    risk_level: config.risk_level,
                    pattern_matched: pattern.toString()
                });
                break; // Only count first match per operation type
            }
        }
    }

    return matches;
}

/**
 * Calculate complexity score based on various factors
 */
function calculateComplexity(taskDescription, operationType) {
    let complexity = operationType ? operationType.base_complexity : 0.3;

    // Factor 1: Record count mentioned
    const recordCountMatch = taskDescription.match(/(\d+)\s*(record|row|opportunit|account|contact)/i);
    if (recordCountMatch) {
        const count = parseInt(recordCountMatch[1]);
        if (count > 1000) complexity += 0.2;
        else if (count > 100) complexity += 0.15;
        else if (count > 10) complexity += 0.1;
    }

    // Factor 2: Multiple objects mentioned
    const objectMentions = (taskDescription.match(/\b(account|contact|opportunity|lead|case|custom object)\b/gi) || []).length;
    if (objectMentions > 3) complexity += 0.15;
    else if (objectMentions > 1) complexity += 0.1;

    // Factor 3: Complex keywords
    const complexKeywords = ['migration', 'integration', 'sync', 'merge', 'consolidate', 'transform'];
    const complexMatches = complexKeywords.filter(kw =>
        new RegExp(`\\b${kw}\\b`, 'i').test(taskDescription)
    ).length;
    complexity += (complexMatches * 0.1);

    // Factor 4: Production environment
    if (/production|prod|live/i.test(taskDescription)) {
        complexity += 0.15;
    }

    // Cap at 1.0
    return Math.min(complexity, 1.0);
}

/**
 * Extract keywords from task description
 */
function extractKeywords(taskDescription) {
    const keywords = [];

    // Extract action verbs
    const actionVerbs = ['update', 'create', 'delete', 'merge', 'deploy', 'import', 'export', 'sync', 'calculate', 'set', 'populate'];
    actionVerbs.forEach(verb => {
        if (new RegExp(`\\b${verb}\\b`, 'i').test(taskDescription)) {
            keywords.push(verb.toLowerCase());
        }
    });

    // Extract numbers (record counts)
    const numbers = taskDescription.match(/\b\d+\b/g);
    if (numbers) {
        keywords.push(...numbers);
    }

    // Extract object names
    const objects = taskDescription.match(/\b(account|contact|opportunity|lead|case|renewal|quote)\b/gi);
    if (objects) {
        keywords.push(...objects.map(o => o.toLowerCase()));
    }

    return [...new Set(keywords)]; // Remove duplicates
}

/**
 * Calculate confidence level based on pattern matches
 */
function calculateConfidence(matches, taskDescription) {
    if (matches.length === 0) return 0;

    let confidence = 50; // Base confidence

    // Multiple pattern matches increase confidence
    if (matches.length > 1) confidence += 20;

    // Specific numbers mentioned increase confidence
    if (/\d+\s*(record|row)/i.test(taskDescription)) confidence += 15;

    // Field names mentioned increase confidence
    if (/\b\w+__c\b/.test(taskDescription)) confidence += 10;

    // Object names mentioned increase confidence
    if (/\b(opportunity|account|contact|lead)\b/i.test(taskDescription)) confidence += 5;

    return Math.min(confidence, 100);
}

/**
 * Generate reasoning for the recommendation
 */
function generateReasoning(match, complexity, keywords) {
    const reasons = [];

    reasons.push(`Detected ${match.operation_type.replace('_', ' ')} pattern`);

    if (keywords.some(k => !isNaN(k) && parseInt(k) > 10)) {
        const count = keywords.find(k => !isNaN(k));
        reasons.push(`bulk operation affecting ${count}+ records`);
    }

    if (complexity > 0.7) {
        reasons.push('high complexity task');
    }

    if (match.risk_level === 'critical' || match.risk_level === 'high') {
        reasons.push(`${match.risk_level} risk level requires agent`);
    }

    return reasons.join(', ');
}

/**
 * Main analysis function
 */
function analyzeTask(taskDescription) {
    const matches = detectOperationType(taskDescription);

    if (matches.length === 0) {
        return {
            operation_type: 'unknown',
            complexity_score: 0.3,
            recommended_agent: null,
            confidence_level: 0,
            reasoning: 'No specific pattern detected, consider using principal-engineer for general tasks',
            keywords_matched: extractKeywords(taskDescription),
            risk_level: 'unknown',
            suggestion: 'Use principal-engineer or sfdc-orchestrator for complex multi-step tasks'
        };
    }

    // Use the first (highest priority) match
    const primaryMatch = matches[0];
    const complexity = calculateComplexity(taskDescription, primaryMatch);
    const keywords = extractKeywords(taskDescription);
    const confidence = calculateConfidence(matches, taskDescription);
    const reasoning = generateReasoning(primaryMatch, complexity, keywords);

    return {
        operation_type: primaryMatch.operation_type,
        complexity_score: parseFloat(complexity.toFixed(2)),
        recommended_agent: primaryMatch.agent,
        confidence_level: confidence,
        reasoning: reasoning,
        keywords_matched: keywords,
        risk_level: primaryMatch.risk_level,
        alternative_agents: matches.slice(1).map(m => m.agent)
    };
}

/**
 * CLI Interface
 */
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.error('Usage: node task-pattern-detector.js "<task description>"');
        console.error('\nExample:');
        console.error('  node task-pattern-detector.js "Update Booked ARR for 184 renewals"');
        process.exit(1);
    }

    const taskDescription = args.join(' ');
    const result = analyzeTask(taskDescription);

    console.log(JSON.stringify(result, null, 2));
}

module.exports = { analyzeTask, AGENT_PATTERNS };
