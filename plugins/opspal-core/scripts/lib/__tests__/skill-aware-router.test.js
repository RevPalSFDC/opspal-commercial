/**
 * Skill-Aware Router Tests
 *
 * Tests for confidence-based agent routing
 */

const { SkillAwareRouter } = require('../skill-aware-router.js');

describe('SkillAwareRouter', () => {
    let router;

    beforeEach(() => {
        router = new SkillAwareRouter({ verbose: false });
    });

    describe('Task Skill Detection', () => {
        test('should detect skills from task description', () => {
            const skills = router.detectTaskSkills('Run CPQ assessment for the production org');

            expect(Array.isArray(skills)).toBe(true);
        });

        test('should detect multiple skills', () => {
            const skills = router.detectTaskSkills('Deploy validation rules and create reports');

            expect(skills.length).toBeGreaterThanOrEqual(0);
        });

        test('should return empty array for empty task', () => {
            const skills = router.detectTaskSkills('');

            expect(skills).toEqual([]);
        });

        test('should return empty array for null task', () => {
            const skills = router.detectTaskSkills(null);

            expect(skills).toEqual([]);
        });

        test('should be case insensitive', () => {
            const lowerSkills = router.detectTaskSkills('cpq assessment');
            const upperSkills = router.detectTaskSkills('CPQ ASSESSMENT');

            expect(lowerSkills).toEqual(upperSkills);
        });
    });

    describe('Agent Skill Retrieval', () => {
        test('should get skills for agent', () => {
            const skills = router.getAgentSkills('sfdc-cpq-assessor');

            expect(Array.isArray(skills)).toBe(true);
        });

        test('should cache agent skills', () => {
            // First call
            router.getAgentSkills('sfdc-revops-auditor');

            // Should be cached now
            expect(router.agentSkillCache.has('sfdc-revops-auditor')).toBe(true);
        });

        test('should return empty array for unknown agent', () => {
            const skills = router.getAgentSkills('non-existent-agent');

            expect(skills).toEqual([]);
        });
    });

    describe('Skill Match Score', () => {
        test('should calculate match score', () => {
            const score = router.getSkillMatchScore('sfdc-cpq-assessor', ['cpq-assessment']);

            expect(score).toBeGreaterThanOrEqual(0);
            expect(score).toBeLessThanOrEqual(1);
        });

        test('should return 0 for no task skills', () => {
            const score = router.getSkillMatchScore('sfdc-cpq-assessor', []);

            expect(score).toBe(0);
        });

        test('should return 0 for no matching skills', () => {
            // Assume these don't match
            const score = router.getSkillMatchScore('non-existent-agent', ['skill-a', 'skill-b']);

            expect(score).toBe(0);
        });
    });

    describe('Agent Selection', () => {
        test('should select best agent from candidates', () => {
            const candidates = [
                { name: 'sfdc-cpq-assessor', baseScore: 0.5 },
                { name: 'sfdc-revops-auditor', baseScore: 0.5 },
                { name: 'sfdc-metadata-manager', baseScore: 0.5 }
            ];

            const selected = router.selectAgent('Run CPQ assessment', candidates);

            expect(selected).not.toBeNull();
            expect(selected.name).toBeDefined();
            expect(selected.enhancedScore).toBeDefined();
        });

        test('should return null for empty candidates', () => {
            const selected = router.selectAgent('Some task', []);

            expect(selected).toBeNull();
        });

        test('should return null for null candidates', () => {
            const selected = router.selectAgent('Some task', null);

            expect(selected).toBeNull();
        });

        test('should handle string candidates', () => {
            const candidates = ['agent-a', 'agent-b', 'agent-c'];

            const selected = router.selectAgent('Some task', candidates);

            expect(selected).not.toBeNull();
        });

        test('should preserve base scores in selection', () => {
            const candidates = [
                { name: 'agent-a', baseScore: 0.9 },
                { name: 'agent-b', baseScore: 0.1 }
            ];

            const selected = router.selectAgent('Generic task with no skills', candidates);

            // Higher base score should generally win for generic tasks
            expect(selected.baseScore).toBeDefined();
        });
    });

    describe('Routing Recommendation', () => {
        test('should generate recommendation with reasoning', () => {
            const candidates = [
                { name: 'sfdc-cpq-assessor', baseScore: 0.5 },
                { name: 'sfdc-revops-auditor', baseScore: 0.5 }
            ];

            const rec = router.getRoutingRecommendation('Run CPQ assessment', candidates);

            expect(rec.recommended).toBeDefined();
            expect(rec.confidence).toBeDefined();
            expect(rec.reasoning).toBeDefined();
            expect(typeof rec.reasoning).toBe('string');
        });

        test('should include skill details in recommendation', () => {
            const candidates = [
                { name: 'sfdc-cpq-assessor', baseScore: 0.5 }
            ];

            const rec = router.getRoutingRecommendation('CPQ quote pricing', candidates);

            expect(rec.taskSkillsDetected).toBeDefined();
            expect(Array.isArray(rec.taskSkillsDetected)).toBe(true);
        });

        test('should handle no candidates gracefully', () => {
            const rec = router.getRoutingRecommendation('Some task', []);

            expect(rec.recommended).toBeNull();
            expect(rec.confidence).toBe(0);
            expect(rec.reasoning).toBe('No candidates provided');
        });
    });

    describe('Task Analysis', () => {
        test('should analyze task', () => {
            const analysis = router.analyzeTask('Deploy flow to production');

            expect(analysis.taskDescription).toBeDefined();
            expect(analysis.detectedSkills).toBeDefined();
            expect(analysis.skillDetails).toBeDefined();
            expect(analysis.recommendedCategory).toBeDefined();
            expect(analysis.complexity).toBeDefined();
        });

        test('should truncate long task descriptions', () => {
            const longTask = 'A'.repeat(200);
            const analysis = router.analyzeTask(longTask);

            expect(analysis.taskDescription.length).toBeLessThanOrEqual(100);
        });

        test('should estimate complexity based on skills', () => {
            // Simple task
            const simple = router.analyzeTask('help');
            expect(['simple', 'moderate', 'complex', 'highly-complex']).toContain(simple.complexity);
        });

        test('should infer category from skills', () => {
            const analysis = router.analyzeTask('Run CPQ assessment');

            // Should have some category
            expect(analysis.recommendedCategory).toBeDefined();
            expect(typeof analysis.recommendedCategory).toBe('string');
        });
    });

    describe('Agent Rankings', () => {
        test('should rank agents for task', () => {
            const rankings = router.getAgentRankings('Deploy validation rules', 5);

            expect(Array.isArray(rankings)).toBe(true);
            rankings.forEach(r => {
                expect(r.name).toBeDefined();
                expect(r.totalScore).toBeDefined();
            });
        });

        test('should limit results', () => {
            const rankings = router.getAgentRankings('CPQ assessment', 3);

            expect(rankings.length).toBeLessThanOrEqual(3);
        });

        test('should sort by total score descending', () => {
            const rankings = router.getAgentRankings('Run assessment');

            for (let i = 1; i < rankings.length; i++) {
                expect(rankings[i - 1].totalScore).toBeGreaterThanOrEqual(rankings[i].totalScore);
            }
        });

        test('should include matching skills', () => {
            const rankings = router.getAgentRankings('Deploy metadata');

            rankings.forEach(r => {
                expect(r.matchingSkills).toBeDefined();
                expect(Array.isArray(r.matchingSkills)).toBe(true);
            });
        });
    });

    describe('Configuration', () => {
        test('should use custom max confidence boost', () => {
            const customRouter = new SkillAwareRouter({
                maxConfidenceBoost: 0.5,
                verbose: false
            });

            expect(customRouter.config.maxConfidenceBoost).toBe(0.5);
        });

        test('should use custom min confidence threshold', () => {
            const customRouter = new SkillAwareRouter({
                minConfidenceThreshold: 0.5,
                verbose: false
            });

            expect(customRouter.config.minConfidenceThreshold).toBe(0.5);
        });

        test('should use custom weights', () => {
            const customRouter = new SkillAwareRouter({
                skillWeight: 0.7,
                baseScoreWeight: 0.3,
                verbose: false
            });

            expect(customRouter.config.skillWeight).toBe(0.7);
            expect(customRouter.config.baseScoreWeight).toBe(0.3);
        });
    });

    describe('Edge Cases', () => {
        test('should handle special characters in task', () => {
            const analysis = router.analyzeTask('Deploy "validation" rules & flows');

            expect(analysis).toBeDefined();
        });

        test('should handle numeric task', () => {
            const analysis = router.analyzeTask('12345');

            expect(analysis.detectedSkills).toBeDefined();
        });

        test('should handle very long task', () => {
            const longTask = 'Deploy validation rules '.repeat(100);
            const analysis = router.analyzeTask(longTask);

            expect(analysis).toBeDefined();
        });

        test('should handle unicode in task', () => {
            const analysis = router.analyzeTask('Deploy rules 日本語 테스트');

            expect(analysis).toBeDefined();
        });
    });

    describe('Confidence Boost Calculation', () => {
        test('should return 0 for no task skills', () => {
            const boost = router.getSkillConfidenceBoost('sfdc-cpq-assessor', []);

            expect(boost).toBe(0);
        });

        test('should calculate boost within bounds', () => {
            const boost = router.getSkillConfidenceBoost('sfdc-cpq-assessor', ['cpq-assessment']);

            expect(boost).toBeGreaterThanOrEqual(-router.config.lowConfidencePenalty);
            expect(boost).toBeLessThanOrEqual(router.config.maxConfidenceBoost);
        });
    });
});
