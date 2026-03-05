#!/usr/bin/env node

/**
 * HubSpot Task Domain Detector
 *
 * Auto-detects task domain from description using keyword scoring to prevent
 * wrong agent selection errors.
 *
 * Adapted from SFDC task-domain-detector.js
 *
 * Usage:
 *   node scripts/lib/task-domain-detector.js "Create workflow for lead nurturing"
 *   node scripts/lib/task-domain-detector.js "Import 500 contacts from CSV" --suggest-agent
 */

const fs = require('fs');
const path = require('path');

class TaskDomainDetector {
    constructor() {
        this.domains = {
            'workflow-automation': {
                keywords: ['workflow', 'automation', 'trigger', 'enroll', 'sequence', 'branch', 'delay', 'if/then', 'action'],
                weight: 1.0,
                agents: ['hubspot-workflow-builder', 'hubspot-marketing-automation', 'hubspot-orchestrator']
            },
            'contact-management': {
                keywords: ['contact', 'list', 'segmentation', 'import contacts', 'contact properties', 'merge contacts'],
                weight: 1.0,
                agents: ['hubspot-contact-manager', 'hubspot-data-operations-manager']
            },
            'data-operations': {
                keywords: ['import', 'export', 'bulk', 'migration', 'sync', 'data cleanup', 'deduplication', 'csv'],
                weight: 1.0,
                agents: ['hubspot-data-operations-manager', 'hubspot-data-hygiene-specialist']
            },
            'email-marketing': {
                keywords: ['email', 'campaign', 'template', 'newsletter', 'marketing email', 'broadcast'],
                weight: 1.0,
                agents: ['hubspot-email-campaign-manager', 'hubspot-marketing-automation']
            },
            'pipeline-sales': {
                keywords: ['pipeline', 'deal', 'stage', 'forecast', 'sales process', 'opportunity', 'quote'],
                weight: 1.0,
                agents: ['hubspot-pipeline-manager', 'hubspot-orchestrator']
            },
            'reporting-analytics': {
                keywords: ['report', 'dashboard', 'analytics', 'metrics', 'attribution', 'roi', 'performance'],
                weight: 1.0,
                agents: ['hubspot-analytics-reporter', 'hubspot-reporting-builder']
            },
            'integration-api': {
                keywords: ['integration', 'webhook', 'api', 'sync', 'salesforce', 'third-party', 'connector'],
                weight: 1.0,
                agents: ['hubspot-integration-specialist', 'sfdc-hubspot-bridge']
            },
            'property-management': {
                keywords: ['property', 'custom field', 'property group', 'field mapping', 'data model'],
                weight: 1.0,
                agents: ['hubspot-property-manager', 'hubspot-orchestrator']
            },
            'lead-scoring': {
                keywords: ['lead score', 'scoring', 'qualification', 'mql', 'sql', 'lead quality'],
                weight: 1.0,
                agents: ['hubspot-lead-scoring-specialist', 'hubspot-orchestrator']
            },
            'territory-management': {
                keywords: ['territory', 'assignment', 'routing', 'round robin', 'owner assignment'],
                weight: 1.0,
                agents: ['hubspot-territory-manager', 'hubspot-orchestrator']
            },
            'assessment-audit': {
                keywords: ['assessment', 'audit', 'review', 'analyze', 'evaluate', 'revops', 'health check'],
                weight: 1.0,
                agents: ['hubspot-assessment-analyzer', 'hubspot-orchestrator']
            },
            'cms-content': {
                keywords: ['cms', 'page', 'blog', 'landing page', 'content', 'website', 'seo'],
                weight: 1.0,
                agents: ['hubspot-cms-content-manager']
            },
            'service-tickets': {
                keywords: ['ticket', 'service', 'support', 'sla', 'customer service', 'help desk'],
                weight: 1.0,
                agents: ['hubspot-service-hub-manager']
            },
            'revenue-operations': {
                keywords: ['revenue', 'forecast', 'quota', 'capacity', 'deal health', 'pipeline coverage'],
                weight: 1.0,
                agents: ['hubspot-revenue-intelligence', 'hubspot-ai-revenue-intelligence']
            },
            'governance-compliance': {
                keywords: ['governance', 'compliance', 'audit trail', 'permissions', 'security', 'gdpr'],
                weight: 1.0,
                agents: ['hubspot-governance-enforcer', 'hubspot-admin-specialist']
            }
        };

        this.complexityIndicators = {
            high: ['complex', 'enterprise', 'migration', 'integration', 'multi-step', 'orchestrate'],
            medium: ['configure', 'setup', 'customize', 'automate'],
            low: ['create', 'update', 'add', 'modify', 'simple']
        };
    }

    detectDomain(taskDescription) {
        const description = taskDescription.toLowerCase();
        const scores = {};

        // Calculate scores for each domain
        Object.entries(this.domains).forEach(([domain, config]) => {
            let score = 0;
            config.keywords.forEach(keyword => {
                if (description.includes(keyword.toLowerCase())) {
                    score += config.weight;
                }
            });
            if (score > 0) {
                scores[domain] = {
                    score,
                    matchedKeywords: config.keywords.filter(kw =>
                        description.includes(kw.toLowerCase())
                    ),
                    suggestedAgents: config.agents
                };
            }
        });

        // Sort by score
        const sortedDomains = Object.entries(scores)
            .sort(([, a], [, b]) => b.score - a.score);

        return {
            primaryDomain: sortedDomains[0] ? sortedDomains[0][0] : 'general',
            confidence: sortedDomains[0] ? sortedDomains[0][1].score : 0,
            allMatches: sortedDomains,
            complexity: this.detectComplexity(description),
            suggestedAgent: sortedDomains[0] ? sortedDomains[0][1].suggestedAgents[0] : 'hubspot-orchestrator'
        };
    }

    detectComplexity(description) {
        if (this.complexityIndicators.high.some(ind => description.includes(ind))) {
            return 'high';
        }
        if (this.complexityIndicators.medium.some(ind => description.includes(ind))) {
            return 'medium';
        }
        return 'low';
    }

    suggestAgent(taskDescription, verbose = false) {
        const detection = this.detectDomain(taskDescription);

        if (verbose) {
            console.log('\n🎯 Task Domain Detection Results');
            console.log('================================\n');
            console.log(`Task: "${taskDescription}"\n`);
            console.log(`Primary Domain: ${detection.primaryDomain}`);
            console.log(`Complexity: ${detection.complexity}`);
            console.log(`Confidence: ${detection.confidence.toFixed(2)}\n`);

            if (detection.allMatches.length > 0) {
                console.log('Matched Domains:');
                detection.allMatches.forEach(([domain, info]) => {
                    console.log(`  - ${domain} (score: ${info.score})`);
                    console.log(`    Keywords: ${info.matchedKeywords.join(', ')}`);
                    console.log(`    Suggested: ${info.suggestedAgents[0]}`);
                });
            }

            console.log(`\n✅ Recommended Agent: ${detection.suggestedAgent}`);

            if (detection.complexity === 'high') {
                console.log('\n⚠️  HIGH COMPLEXITY detected - Consider using hubspot-orchestrator for coordination');
            }
        } else {
            console.log(detection.suggestedAgent);
        }

        return detection;
    }

    validateAgentSelection(taskDescription, proposedAgent) {
        const detection = this.detectDomain(taskDescription);
        const allSuggestedAgents = detection.allMatches.flatMap(([, info]) => info.suggestedAgents);

        const isValid = allSuggestedAgents.includes(proposedAgent) || proposedAgent === 'hubspot-orchestrator';

        return {
            isValid,
            detection,
            recommendation: detection.suggestedAgent,
            alternatives: allSuggestedAgents
        };
    }

    generateRoutingRules() {
        // Generate routing rules for agent-routing-rules.json
        const rules = {
            hubspot: {
                domains: {},
                mandatoryAgents: {
                    'production-deploy': ['hubspot-orchestrator', 'release-coordinator'],
                    'data-migration': ['hubspot-data-operations-manager'],
                    'bulk-import': ['hubspot-data-operations-manager'],
                    'workflow-creation': ['hubspot-workflow-builder', 'hubspot-marketing-automation'],
                    'integration-setup': ['hubspot-integration-specialist']
                }
            }
        };

        Object.entries(this.domains).forEach(([domain, config]) => {
            rules.hubspot.domains[domain] = {
                keywords: config.keywords,
                agents: config.agents,
                required: config.agents.includes('hubspot-orchestrator')
            };
        });

        return rules;
    }
}

// CLI Interface
function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage:');
        console.log('  node task-domain-detector.js "<task description>"');
        console.log('  node task-domain-detector.js "<task description>" --suggest-agent');
        console.log('  node task-domain-detector.js "<task description>" --validate <agent-name>');
        console.log('  node task-domain-detector.js --generate-rules');
        console.log('\nExamples:');
        console.log('  node task-domain-detector.js "Create workflow for lead nurturing"');
        console.log('  node task-domain-detector.js "Import contacts from CSV" --suggest-agent');
        process.exit(1);
    }

    const detector = new TaskDomainDetector();

    if (args[0] === '--generate-rules') {
        const rules = detector.generateRoutingRules();
        console.log(JSON.stringify(rules, null, 2));
        return;
    }

    const taskDescription = args[0];
    const flag = args[1];
    const agentName = args[2];

    if (flag === '--validate' && agentName) {
        const validation = detector.validateAgentSelection(taskDescription, agentName);
        console.log('\n🔍 Agent Validation Results');
        console.log('===========================\n');
        console.log(`Task: "${taskDescription}"`);
        console.log(`Proposed Agent: ${agentName}`);
        console.log(`Valid: ${validation.isValid ? '✅ YES' : '❌ NO'}\n`);

        if (!validation.isValid) {
            console.log(`❌ Recommended Agent: ${validation.recommendation}`);
            console.log(`   Alternatives: ${validation.alternatives.join(', ')}`);
        }

        process.exit(validation.isValid ? 0 : 1);
    } else if (flag === '--suggest-agent' || !flag) {
        detector.suggestAgent(taskDescription, true);
    } else {
        detector.suggestAgent(taskDescription, false);
    }
}

if (require.main === module) {
    main();
}

module.exports = { TaskDomainDetector };
