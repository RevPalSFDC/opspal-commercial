/**
 * Reflection Skill Analyzer Tests
 *
 * Tests for auto-detection of skills from reflection data
 */

const { ReflectionSkillAnalyzer } = require('../reflection-skill-analyzer.js');

describe('ReflectionSkillAnalyzer', () => {
    let analyzer;

    beforeEach(() => {
        analyzer = new ReflectionSkillAnalyzer({ verbose: false });
    });

    describe('Basic Analysis', () => {
        test('should analyze empty reflection', () => {
            const reflection = { id: 'test-1', data: {} };
            const result = analyzer.analyzeReflection(reflection);

            expect(result.skills_used).toBeDefined();
            expect(Array.isArray(result.skills_used)).toBe(true);
            expect(result.skill_feedback).toBeDefined();
            expect(result.detection_metadata).toBeDefined();
        });

        test('should detect skills from focus_area', () => {
            const reflection = {
                id: 'test-2',
                focus_area: 'cpq-assessment',
                data: {}
            };

            const result = analyzer.analyzeReflection(reflection);

            expect(result.skills_used.length).toBeGreaterThan(0);
            expect(result.detection_metadata.detection_sources).toContain('focus_area');
        });

        test('should detect skills from summary', () => {
            const reflection = {
                id: 'test-3',
                data: {
                    summary: 'Deployed validation rules to production'
                }
            };

            const result = analyzer.analyzeReflection(reflection);

            expect(result.detection_metadata.detection_sources).toContain('summary');
        });
    });

    describe('Issue Detection', () => {
        test('should detect skills from issues', () => {
            const reflection = {
                id: 'test-4',
                data: {
                    issues_identified: [
                        {
                            taxonomy: 'data-quality',
                            priority: 'P1',
                            root_cause: 'Field validation failed'
                        }
                    ]
                }
            };

            const result = analyzer.analyzeReflection(reflection);

            expect(result.skills_used.length).toBeGreaterThan(0);
            expect(result.detection_metadata.detection_sources).toContain('issues');
        });

        test('should mark skills as failed when related issue found', () => {
            const reflection = {
                id: 'test-5',
                data: {
                    issues_identified: [
                        {
                            taxonomy: 'tool-contract',
                            priority: 'P0',
                            blast_radius: 'HIGH',
                            root_cause: 'Deployment validation failed'
                        }
                    ]
                }
            };

            const result = analyzer.analyzeReflection(reflection);

            // Find any skill marked as failed
            const failedSkills = Object.entries(result.skill_feedback)
                .filter(([_, feedback]) => feedback.success === false);

            expect(failedSkills.length).toBeGreaterThan(0);
        });

        test('should infer session failure from P0 issues', () => {
            const reflection = {
                id: 'test-6',
                data: {
                    summary: 'Attempted flow deployment',
                    issues_identified: [
                        { taxonomy: 'schema/parse', priority: 'P0' }
                    ]
                }
            };

            const result = analyzer.analyzeReflection(reflection);

            expect(result.detection_metadata.session_success_inferred).toBe(false);
        });

        test('should infer session success when no critical issues', () => {
            const reflection = {
                id: 'test-7',
                data: {
                    summary: 'Completed CPQ review',
                    issues_identified: [
                        { taxonomy: 'documentation-gap', priority: 'P3' }
                    ]
                }
            };

            const result = analyzer.analyzeReflection(reflection);

            expect(result.detection_metadata.session_success_inferred).toBe(true);
        });
    });

    describe('Taxonomy Mapping', () => {
        const taxonomyTests = [
            { taxonomy: 'agent_routing', expectedSkills: true },
            { taxonomy: 'tool-contract', expectedSkills: true },
            { taxonomy: 'data-quality', expectedSkills: true },
            { taxonomy: 'schema/parse', expectedSkills: true }
        ];

        taxonomyTests.forEach(({ taxonomy, expectedSkills }) => {
            test(`should detect skills from taxonomy: ${taxonomy}`, () => {
                const reflection = {
                    id: `test-taxonomy-${taxonomy}`,
                    data: {
                        issues_identified: [{ taxonomy, priority: 'P2' }]
                    }
                };

                const result = analyzer.analyzeReflection(reflection);

                if (expectedSkills) {
                    expect(result.skills_used.length).toBeGreaterThan(0);
                }
            });
        });
    });

    describe('Wiring Recommendations', () => {
        test('should detect skills from agent recommendations', () => {
            const reflection = {
                id: 'test-8',
                data: {
                    wiring_recommendations: {
                        agents: [
                            { name: 'sfdc-revops-auditor' },
                            { name: 'sfdc-cpq-assessor' }
                        ]
                    }
                }
            };

            const result = analyzer.analyzeReflection(reflection);

            expect(result.detection_metadata.detection_sources).toContain('wiring');
        });

        test('should detect skills from tool recommendations', () => {
            const reflection = {
                id: 'test-9',
                data: {
                    wiring_recommendations: {
                        tools: [
                            { name: 'deployment-validator', purpose: 'validate deployments' }
                        ]
                    }
                }
            };

            const result = analyzer.analyzeReflection(reflection);

            expect(result.detection_metadata.detection_sources).toContain('wiring');
        });
    });

    describe('Playbook Detection', () => {
        test('should detect skills from playbook', () => {
            const reflection = {
                id: 'test-10',
                data: {
                    playbook: [
                        {
                            name: 'CPQ Deployment Playbook',
                            steps: [
                                'Deploy pricing rules',
                                'Validate configuration',
                                'Test quote generation'
                            ]
                        }
                    ]
                }
            };

            const result = analyzer.analyzeReflection(reflection);

            expect(result.detection_metadata.detection_sources).toContain('playbook');
        });
    });

    describe('Outcome Inference', () => {
        test('should infer success from explicit outcome', () => {
            const reflection = {
                id: 'test-11',
                outcome: 'Successfully completed',
                data: { summary: 'Task done' }
            };

            const result = analyzer.analyzeReflection(reflection);

            expect(result.detection_metadata.session_success_inferred).toBe(true);
        });

        test('should infer failure from explicit outcome', () => {
            const reflection = {
                id: 'test-12',
                outcome: 'Failed with errors',
                data: { summary: 'Task failed' }
            };

            const result = analyzer.analyzeReflection(reflection);

            expect(result.detection_metadata.session_success_inferred).toBe(false);
        });

        test('should infer success when no issues', () => {
            const reflection = {
                id: 'test-13',
                data: {
                    summary: 'Completed successfully',
                    issues_identified: []
                }
            };

            const result = analyzer.analyzeReflection(reflection);

            expect(result.detection_metadata.session_success_inferred).toBe(true);
        });
    });

    describe('Skill Feedback Format', () => {
        test('should generate feedback matching schema', () => {
            const reflection = {
                id: 'test-14',
                focus_area: 'cpq-assessment',
                outcome: 'success',
                data: {}
            };

            const result = analyzer.analyzeReflection(reflection);

            for (const [skillId, feedback] of Object.entries(result.skill_feedback)) {
                expect(typeof feedback.success).toBe('boolean');
                expect(typeof feedback.inferred).toBe('boolean');
                // error_type should be null on success or string on failure
                if (feedback.success) {
                    expect(feedback.error_type).toBeNull();
                } else {
                    expect(typeof feedback.error_type).toBe('string');
                }
            }
        });
    });

    describe('Batch Analysis', () => {
        test('should analyze multiple reflections', () => {
            const reflections = [
                { id: 'batch-1', focus_area: 'cpq', data: {} },
                { id: 'batch-2', focus_area: 'revops', data: {} },
                { id: 'batch-3', focus_area: 'deployment', data: {} }
            ];

            const results = analyzer.analyzeMultiple(reflections);

            expect(results.length).toBe(3);
            results.forEach(result => {
                expect(result.reflection_id).toBeDefined();
                expect(result.skills_used).toBeDefined();
            });
        });
    });

    describe('Backfill Update Generation', () => {
        test('should generate update payload', () => {
            const reflection = {
                id: 'backfill-1',
                focus_area: 'cpq-assessment',
                skills_used: [], // Empty - needs backfill
                skill_feedback: {},
                data: { summary: 'CPQ review' }
            };

            const update = analyzer.generateBackfillUpdate(reflection);

            expect(update.id).toBe('backfill-1');
            expect(update.skills_used.length).toBeGreaterThan(0);
            expect(Object.keys(update.skill_feedback).length).toBeGreaterThan(0);
        });

        test('should merge with existing skills', () => {
            const reflection = {
                id: 'backfill-2',
                focus_area: 'deployment',
                skills_used: ['existing-skill'],
                skill_feedback: { 'existing-skill': { success: true, inferred: false } },
                data: {}
            };

            const update = analyzer.generateBackfillUpdate(reflection);

            expect(update.skills_used).toContain('existing-skill');
            expect(update.skill_feedback['existing-skill']).toBeDefined();
        });
    });

    describe('Summary Generation', () => {
        test('should generate summary statistics', () => {
            const analyses = [
                {
                    skills_used: ['skill-a', 'skill-b'],
                    skill_feedback: {
                        'skill-a': { success: true },
                        'skill-b': { success: false }
                    }
                },
                {
                    skills_used: ['skill-a', 'skill-c'],
                    skill_feedback: {
                        'skill-a': { success: true },
                        'skill-c': { success: true }
                    }
                }
            ];

            const summary = analyzer.generateSummary(analyses);

            expect(summary.totalReflectionsAnalyzed).toBe(2);
            expect(summary.uniqueSkillsDetected).toBe(3);
            expect(summary.topSkills).toBeDefined();
            expect(Array.isArray(summary.topSkills)).toBe(true);
        });

        test('should calculate success rates', () => {
            const analyses = [
                { skills_used: ['test'], skill_feedback: { 'test': { success: true } } },
                { skills_used: ['test'], skill_feedback: { 'test': { success: true } } },
                { skills_used: ['test'], skill_feedback: { 'test': { success: false } } }
            ];

            const summary = analyzer.generateSummary(analyses);

            const testSkill = summary.topSkills.find(s => s.skillId === 'test');
            expect(testSkill).toBeDefined();
            expect(testSkill.successRate).toBeCloseTo(2/3, 2);
        });
    });

    describe('Edge Cases', () => {
        test('should handle null data', () => {
            const reflection = { id: 'edge-1', data: null };

            expect(() => analyzer.analyzeReflection(reflection)).not.toThrow();
        });

        test('should handle undefined fields', () => {
            const reflection = {
                id: 'edge-2',
                focus_area: undefined,
                outcome: undefined,
                data: undefined
            };

            expect(() => analyzer.analyzeReflection(reflection)).not.toThrow();
        });

        test('should handle empty arrays', () => {
            const reflection = {
                id: 'edge-3',
                data: {
                    issues_identified: [],
                    playbook: [],
                    wiring_recommendations: { agents: [], tools: [] }
                }
            };

            const result = analyzer.analyzeReflection(reflection);
            expect(result.skills_used).toEqual([]);
        });

        test('should deduplicate detected skills', () => {
            const reflection = {
                id: 'edge-4',
                focus_area: 'cpq cpq cpq', // Repeated keyword
                data: {
                    summary: 'cpq cpq cpq'
                }
            };

            const result = analyzer.analyzeReflection(reflection);

            // Should not have duplicate skill IDs
            const uniqueSkills = new Set(result.skills_used);
            expect(uniqueSkills.size).toBe(result.skills_used.length);
        });
    });
});
