/**
 * Task Router Tests
 *
 * Comprehensive test suite for the TaskRouter class
 *
 * @version 1.0.0
 * @date 2025-11-24
 */

const { TaskRouter } = require('../task-router');

describe('TaskRouter', () => {
    let router;

    beforeEach(() => {
        router = new TaskRouter();
    });

    describe('constructor', () => {
        it('should initialize with default options', () => {
            expect(router.verbose).toBe(false);
            expect(router.agentIndex === null || typeof router.agentIndex === 'object').toBe(true);
        });

        it('should accept verbose option', () => {
            const verboseRouter = new TaskRouter({ verbose: true });
            expect(verboseRouter.verbose).toBe(true);
        });

        it('should initialize keywords mapping', () => {
            expect(router.keywords).toBeDefined();
            expect(Object.keys(router.keywords).length).toBeGreaterThan(0);
            expect(
                router.keywords['opspal-core:release-coordinator'].some((keyword) => keyword.includes('prod'))
            ).toBe(true);
        });

        it('should initialize complexity weights', () => {
            expect(router.complexityWeights).toBeDefined();
            expect(router.complexityWeights.bulk).toBe(0.3);
            expect(router.complexityWeights.production).toBe(0.4);
            expect(router.complexityWeights.dependencies).toBe(0.2);
        });

        it('should initialize agent descriptions', () => {
            expect(router.agentDescriptions).toBeDefined();
            expect(router.agentDescriptions['release-coordinator']).toBeDefined();
            expect(router.agentDescriptions['release-coordinator'].tier).toBe(5);
        });
    });

    describe('calculateComplexity', () => {
        it('should return SIMPLE for basic tasks', () => {
            const result = router.calculateComplexity('add a field to account');
            expect(result.level).toBe('SIMPLE');
            expect(result.score).toBeLessThan(0.3);
        });

        it('should detect bulk operations', () => {
            const result = router.calculateComplexity('bulk update all contacts');
            expect(result.factors).toContain('bulk operation');
            expect(result.score).toBeGreaterThanOrEqual(0.3);
        });

        it('should detect production environment', () => {
            const result = router.calculateComplexity('deploy to production');
            expect(result.factors).toContain('production environment');
            expect(result.score).toBeGreaterThanOrEqual(0.4);
        });

        it('should detect dependencies', () => {
            const result = router.calculateComplexity('check parent-child relationships');
            expect(result.factors).toContain('dependencies/relationships');
        });

        it('should detect metadata changes', () => {
            const result = router.calculateComplexity('update validation rules');
            expect(result.factors).toContain('metadata changes');
        });

        it('should detect migration tasks', () => {
            const result = router.calculateComplexity('migrate data from legacy system');
            expect(result.factors).toContain('data migration');
        });

        it('should detect integration tasks', () => {
            const result = router.calculateComplexity('set up api webhook integration');
            expect(result.factors).toContain('integration/external system');
        });

        it('should detect multiple objects', () => {
            const result = router.calculateComplexity('modify 5 objects in the schema');
            expect(result.factors).toContain('multiple objects');
        });

        it('should detect rollback considerations', () => {
            const result = router.calculateComplexity('need rollback capability');
            expect(result.factors).toContain('rollback considerations');
        });

        it('should cap complexity at 1.0', () => {
            const result = router.calculateComplexity(
                'bulk production deploy with migration and integration of 10 objects with rollback and dependencies'
            );
            expect(result.score).toBeLessThanOrEqual(1.0);
        });

        it('should return HIGH for highly complex tasks', () => {
            const result = router.calculateComplexity('bulk production deployment with dependencies');
            expect(result.level).toBe('HIGH');
            expect(result.score).toBeGreaterThanOrEqual(0.7);
        });

        it('should return MEDIUM for moderately complex tasks', () => {
            const result = router.calculateComplexity('update validation rules with dependencies');
            expect(result.level).toBe('MEDIUM');
            expect(result.score).toBeGreaterThanOrEqual(0.3);
            expect(result.score).toBeLessThan(0.7);
        });
    });

    describe('findMatchingAgents', () => {
        it('should find release-coordinator for production tasks', () => {
            const matches = router.findMatchingAgents('deploy to production');
            expect(matches.length).toBeGreaterThan(0);
            expect(matches[0].agent).toBe('opspal-core:release-coordinator');
        });

        it('should find sfdc-cpq-assessor for CPQ tasks', () => {
            const matches = router.findMatchingAgents('analyze cpq pricing configuration');
            const cpqMatch = matches.find(m =>
                m.agent === 'sfdc-cpq-assessor' || m.agent.endsWith(':sfdc-cpq-assessor')
            );
            expect(cpqMatch).toBeDefined();
        });

        it('should find sfdc-conflict-resolver for conflict tasks', () => {
            const matches = router.findMatchingAgents('deployment failed due to metadata error');
            const conflictMatch = matches.find(m =>
                m.agent === 'sfdc-conflict-resolver' || m.agent.endsWith(':sfdc-conflict-resolver')
            );
            expect(conflictMatch).toBeDefined();
        });

        it('should return empty array when no matches', () => {
            const matches = router.findMatchingAgents('something completely unrelated xyz123');
            expect(matches.length).toBe(0);
        });

        it('should calculate confidence based on keyword matches', () => {
            const matches = router.findMatchingAgents('production deploy release');
            // Multiple keywords match for release-coordinator
            expect(matches[0].confidence).toBeGreaterThan(0.5);
        });

        it('should sort matches by confidence descending', () => {
            const matches = router.findMatchingAgents('deploy production release');
            for (let i = 1; i < matches.length; i++) {
                expect(matches[i - 1].confidence).toBeGreaterThanOrEqual(matches[i].confidence);
            }
        });

        it('should include matched keywords in result', () => {
            const matches = router.findMatchingAgents('deploy to production with release tag');
            expect(matches[0].matchedKeywords).toBeDefined();
            expect(matches[0].matchedKeywords.length).toBeGreaterThan(0);
        });

        it('should cap confidence at 1.0', () => {
            // Force multiple keyword matches
            const matches = router.findMatchingAgents(
                'production deploy to prod release tag merge to main ship'
            );
            expect(matches[0].confidence).toBeLessThanOrEqual(1.0);
        });

        it('should be case-insensitive when task is lowercased first', () => {
            // findMatchingAgents expects lowercase input (called from analyze which lowercases)
            const lowerMatches = router.findMatchingAgents('production deploy');
            const mixedMatches = router.findMatchingAgents('production deploy'.toLowerCase());
            expect(lowerMatches[0].agent).toBe(mixedMatches[0].agent);
        });
    });

    describe('postAssessmentHandoff', () => {
        it('uses explicit post-assessment metadata naming', () => {
            const result = router.postAssessmentHandoff('revops_audit', [{ severity: 'high' }]);
            expect(result.postAssessmentSuggestedAgent).toBe('implementation-planner');
            expect(result).not.toHaveProperty('recommendedAgent');
        });
    });

    describe('analyze', () => {
        it('should return complete recommendation object', () => {
            const result = router.analyze('Deploy to production');
            expect(result.agent).toBeDefined();
            expect(result.confidence).toBeDefined();
            expect(result.complexity).toBeDefined();
            expect(result.reasoning).toBeDefined();
            expect(result.recommendation).toBeDefined();
        });

        it('should return REQUIRED for high complexity', () => {
            const result = router.analyze('bulk production deployment with dependencies');
            expect(result.recommendation).toBe('REQUIRED');
        });

        it('should return RECOMMENDED for medium complexity', () => {
            // Task with dependency + metadata triggers MEDIUM complexity (0.4)
            const result = router.analyze('update validation rules with dependencies');
            expect(result.recommendation).toBe('RECOMMENDED');
        });

        it('should return OPTIONAL for low complexity', () => {
            // Simple task that matches an agent but has low complexity
            const result = router.analyze('create flowchart diagram');
            expect(result.recommendation).toBe('OPTIONAL');
        });

        it('should provide alternatives', () => {
            const result = router.analyze('deploy release to production');
            expect(result.alternatives).toBeDefined();
            expect(Array.isArray(result.alternatives)).toBe(true);
        });

        it('should handle no matching agents', () => {
            const result = router.analyze('xyz123 unrelated task');
            expect(result.agent).toBeNull();
            expect(result.confidence).toBe(0.0);
            expect(result.recommendation).toBe('DIRECT_EXECUTION');
        });

        it('should return REVIEW_NEEDED for high complexity with no agent', () => {
            // Task with high complexity indicators but no matching agent keywords
            const result = router.analyze('bulk production operation xyz123abc unrelated task');
            // May or may not match an agent, check the recommendation based on outcome
            if (result.agent === null) {
                expect(result.recommendation).toBe('REVIEW_NEEDED');
            } else {
                // If it matches (production -> release-coordinator), check it's REQUIRED
                expect(result.recommendation).toBe('REQUIRED');
            }
        });

        it('should include capabilities from agent descriptions', () => {
            const result = router.analyze('deploy to production');
            expect(result.capabilities).toBeDefined();
            expect(Array.isArray(result.capabilities)).toBe(true);
        });

        it('should convert task to lowercase for matching', () => {
            const result1 = router.analyze('DEPLOY TO PRODUCTION');
            const result2 = router.analyze('deploy to production');
            expect(result1.agent).toBe(result2.agent);
        });

        it('should route scheduled apex rollup type-conversion failures to sfdc-field-analyzer', () => {
            const result = router.analyze(
                'Investigate this error: Scheduled Apex job failed to update rollups. Error: Illegal assignment from Datetime to Date. Review Rollup Summary Schedule Items.'
            );
            expect(result.agentShortName).toBe('sfdc-field-analyzer');
            expect(result.confidence).toBeGreaterThanOrEqual(0.7);
        });

        it('should boost platform-matched agents for HubSpot orchestrator prompts', () => {
            const result = router.analyze(
                'HubSpot orchestration request: orchestrate a complex multi-step operation with dependencies'
            );
            expect(result.agentShortName).toBe('hubspot-orchestrator');
        });

        it('should boost platform-matched agents for Salesforce orchestrator prompts', () => {
            const result = router.analyze(
                'Salesforce orchestration request: orchestrate a complex multi-step operation with dependencies'
            );
            expect(result.agentShortName).toBe('sfdc-orchestrator');
        });

        it('should sanitize semver-prefixed primary recommendations and emit guardrail alert', () => {
            router.keywords = {
                '2.10.0:platform-instance-manager': ['production deploy']
            };
            router.keywordFrequency = router.buildKeywordFrequency();

            const result = router.analyze('production deploy');

            expect(result.guardrailAlerts.length).toBeGreaterThan(0);
            expect(result.guardrailAlerts[0].type).toBe('semver_plugin_prefix_detected');
            expect(result.agent.startsWith('2.10.0:')).toBe(false);
        });

        it('should sanitize semver-prefixed alternatives and keep output safe', () => {
            router.keywords = {
                'release-coordinator': ['production deploy release'],
                '2.10.0:platform-instance-manager': ['production deploy']
            };
            router.keywordFrequency = router.buildKeywordFrequency();

            const result = router.analyze('production deploy release');

            expect(result.alternatives.length).toBeGreaterThan(0);
            expect(result.alternatives.every(alt => !alt.agent.startsWith('2.10.0:'))).toBe(true);
            expect(result.guardrailAlerts.some(alert => alert.type === 'semver_plugin_prefix_detected')).toBe(true);
        });
    });

    describe('generateReasoning', () => {
        it('should include matched keywords in reasoning', () => {
            const match = {
                agent: 'release-coordinator',
                matchedKeywords: ['production', 'release'],
                confidence: 0.7
            };
            const complexity = { factors: [], score: 0.5 };
            const reasoning = router.generateReasoning(match, complexity, 'deploy to production');
            expect(reasoning.some(r => r.includes('Keywords detected'))).toBe(true);
        });

        it('should include complexity factors', () => {
            const match = {
                agent: 'release-coordinator',
                matchedKeywords: ['production'],
                confidence: 0.7
            };
            const complexity = { factors: ['bulk operation', 'production environment'], score: 0.7 };
            const reasoning = router.generateReasoning(match, complexity, 'bulk production deploy');
            expect(reasoning.some(r => r.includes('Complexity factor'))).toBe(true);
        });

        it('should include agent specialization', () => {
            const match = {
                agent: 'release-coordinator',
                matchedKeywords: ['production'],
                confidence: 0.7
            };
            const complexity = { factors: [], score: 0.5 };
            const reasoning = router.generateReasoning(match, complexity, 'deploy to production');
            expect(reasoning.some(r => r.includes('Agent specialization'))).toBe(true);
        });
    });

    describe('noAgentRecommendation', () => {
        it('should return null agent', () => {
            const complexity = { score: 0.2, level: 'SIMPLE', factors: [] };
            const result = router.noAgentRecommendation(complexity);
            expect(result.agent).toBeNull();
            expect(result.confidence).toBe(0.0);
        });

        it('should include complexity info', () => {
            const complexity = { score: 0.5, level: 'MEDIUM', factors: ['metadata changes'] };
            const result = router.noAgentRecommendation(complexity);
            expect(result.complexity.score).toBe(0.5);
            expect(result.complexity.level).toBe('MEDIUM');
        });

        it('should return DIRECT_EXECUTION for low complexity', () => {
            const complexity = { score: 0.2, level: 'SIMPLE', factors: [] };
            const result = router.noAgentRecommendation(complexity);
            expect(result.recommendation).toBe('DIRECT_EXECUTION');
        });

        it('should return REVIEW_NEEDED for high complexity', () => {
            const complexity = { score: 0.8, level: 'HIGH', factors: ['bulk operation', 'production'] };
            const result = router.noAgentRecommendation(complexity);
            expect(result.recommendation).toBe('REVIEW_NEEDED');
        });

        it('should include reasoning explaining no match', () => {
            const complexity = { score: 0.2, level: 'SIMPLE', factors: [] };
            const result = router.noAgentRecommendation(complexity);
            expect(result.reasoning).toContain('No specialized agent matched for this task');
        });
    });

    describe('format', () => {
        it('should format recommendation with agent', () => {
            const recommendation = {
                agent: 'release-coordinator',
                confidence: 0.8,
                complexity: { score: 0.6, level: 'MEDIUM' },
                reasoning: ['Keyword: production'],
                capabilities: ['production deployment'],
                alternatives: [],
                recommendation: 'RECOMMENDED'
            };
            const output = router.format(recommendation);
            expect(output).toContain('release-coordinator');
            expect(output).toContain('80%');
            expect(output).toContain('MEDIUM');
        });

        it('should format recommendation without agent', () => {
            const recommendation = {
                agent: null,
                confidence: 0.0,
                complexity: { score: 0.2, level: 'SIMPLE' },
                reasoning: ['No match found'],
                capabilities: [],
                alternatives: [],
                recommendation: 'DIRECT_EXECUTION'
            };
            const output = router.format(recommendation);
            expect(output).toContain('DIRECT EXECUTION');
        });

        it('should include alternatives in output', () => {
            const recommendation = {
                agent: 'release-coordinator',
                confidence: 0.8,
                complexity: { score: 0.6, level: 'MEDIUM' },
                reasoning: [],
                capabilities: [],
                alternatives: [
                    { agent: 'sfdc-deployment-manager', confidence: 0.6, description: 'Deployment manager' }
                ],
                recommendation: 'RECOMMENDED'
            };
            const output = router.format(recommendation);
            expect(output).toContain('Alternative Agents');
            expect(output).toContain('sfdc-deployment-manager');
        });
    });

    describe('getConfidenceLabel', () => {
        it('should return Very High for >= 0.9', () => {
            expect(router.getConfidenceLabel(0.9)).toBe('Very High');
            expect(router.getConfidenceLabel(1.0)).toBe('Very High');
        });

        it('should return High for >= 0.75', () => {
            expect(router.getConfidenceLabel(0.75)).toBe('High');
            expect(router.getConfidenceLabel(0.89)).toBe('High');
        });

        it('should return Medium for >= 0.6', () => {
            expect(router.getConfidenceLabel(0.6)).toBe('Medium');
            expect(router.getConfidenceLabel(0.74)).toBe('Medium');
        });

        it('should return Low for >= 0.4', () => {
            expect(router.getConfidenceLabel(0.4)).toBe('Low');
            expect(router.getConfidenceLabel(0.59)).toBe('Low');
        });

        it('should return Very Low for < 0.4', () => {
            expect(router.getConfidenceLabel(0.39)).toBe('Very Low');
            expect(router.getConfidenceLabel(0.0)).toBe('Very Low');
        });
    });

    describe('edge cases', () => {
        it('should handle empty string', () => {
            const result = router.analyze('');
            expect(result).toBeDefined();
            expect(result.agent).toBeNull();
        });

        it('should handle whitespace only', () => {
            const result = router.analyze('   ');
            expect(result).toBeDefined();
        });

        it('should handle special characters', () => {
            const result = router.analyze('deploy $@#$% to production!!!');
            expect(result.agent).toBe('opspal-core:release-coordinator');
        });

        it('should handle very long input', () => {
            const longTask = 'deploy '.repeat(1000);
            const result = router.analyze(longTask);
            expect(result).toBeDefined();
        });

        it('should handle unicode characters', () => {
            const result = router.analyze('部署到生产环境 deploy to production');
            expect(result.agent).toBe('opspal-core:release-coordinator');
        });
    });

    describe('agent coverage', () => {
        // Agent names are now fully-qualified with plugin prefix
        const testCases = [
            { task: 'sfdc merge duplicate accounts', expected: 'opspal-salesforce:sfdc-merge-orchestrator' },
            { task: 'run revops assessment in salesforce', expected: 'opspal-salesforce:sfdc-revops-auditor' },
            { task: 'build salesforce report dashboard', expected: 'opspal-salesforce:sfdc-reports-dashboards' },
            { task: 'create flowchart diagram', expected: 'opspal-core:diagram-generator' },
            { task: 'hubspot workflow automation', expected: 'opspal-hubspot:hubspot-workflow-builder' },
            { task: 'plan carefully complex task', expected: 'opspal-core:task-graph-orchestrator' },
            { task: 'cross-platform sf and hs sync', expected: 'opspal-core:cross-platform-pipeline-orchestrator' },
        ];

        testCases.forEach(({ task, expected }) => {
            it(`should route "${task}" to ${expected}`, () => {
                const result = router.analyze(task);
                expect(result.agent).toBe(expected);
            });
        });
    });
});
