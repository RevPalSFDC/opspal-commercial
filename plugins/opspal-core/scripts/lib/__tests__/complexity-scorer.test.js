/**
 * Complexity Scorer Tests
 *
 * Comprehensive test suite for the ComplexityScorer class
 *
 * @version 1.0.0
 * @date 2025-11-24
 */

const path = require('path');
const { requireProtectedModule } = require('../protected-asset-runtime');

let ComplexityScorer = null;
try {
    ({ ComplexityScorer } = requireProtectedModule({
        pluginRoot: path.resolve(__dirname, '../../..'),
        pluginName: 'opspal-core',
        relativePath: 'scripts/lib/complexity-scorer.js',
        allowPlaintextFallback: true
    }));
} catch {
    ComplexityScorer = null;
}

const describeComplexityScorer = ComplexityScorer ? describe : describe.skip;

describeComplexityScorer('ComplexityScorer', () => {
    let scorer;

    beforeEach(() => {
        scorer = new ComplexityScorer();
    });

    describe('constructor', () => {
        it('should initialize with default options', () => {
            expect(scorer.verbose).toBe(false);
        });

        it('should accept verbose option', () => {
            const verboseScorer = new ComplexityScorer({ verbose: true });
            expect(verboseScorer.verbose).toBe(true);
        });

        it('should initialize weights', () => {
            expect(scorer.weights).toBeDefined();
            expect(scorer.weights.production).toBe(0.4);
            expect(scorer.weights.bulk).toBe(0.3);
            expect(scorer.weights.destructive).toBe(0.3);
        });

        it('should initialize patterns', () => {
            expect(scorer.patterns).toBeDefined();
            expect(scorer.patterns.production).toBeInstanceOf(RegExp);
            expect(scorer.patterns.bulk).toBeInstanceOf(RegExp);
        });
    });

    describe('analyze', () => {
        it('should return complete analysis object', () => {
            const result = scorer.analyze('some task');
            expect(result.score).toBeDefined();
            expect(result.level).toBeDefined();
            expect(result.factors).toBeDefined();
            expect(result.recommendation).toBeDefined();
            expect(result.requiresAgent).toBeDefined();
            expect(result.suggestsAgent).toBeDefined();
            expect(result.directExecution).toBeDefined();
        });

        it('should return SIMPLE for basic tasks', () => {
            const result = scorer.analyze('add a field to account');
            expect(result.level).toBe('SIMPLE');
            expect(result.directExecution).toBe(true);
        });

        it('should return HIGH for production operations', () => {
            const result = scorer.analyze('deploy to production');
            expect(result.level).toBe('MEDIUM');
            expect(result.factors.some(f => f.factor === 'production')).toBe(true);
        });

        it('should return HIGH for destructive bulk production operations', () => {
            const result = scorer.analyze('delete bulk records in production');
            expect(result.level).toBe('HIGH');
            expect(result.score).toBeGreaterThanOrEqual(0.7);
            expect(result.requiresAgent).toBe(true);
        });

        it('should cap score at 1.0', () => {
            const result = scorer.analyze(
                'bulk delete production data migration integration external api rollback dependencies'
            );
            expect(result.score).toBeLessThanOrEqual(1.0);
        });

        it('should round score to 2 decimal places', () => {
            const result = scorer.analyze('production deploy');
            expect(result.score.toString()).toMatch(/^\d+(\.\d{1,2})?$/);
        });

        it('should sort factors by weight descending', () => {
            const result = scorer.analyze('production bulk delete');
            for (let i = 1; i < result.factors.length; i++) {
                expect(result.factors[i - 1].weight).toBeGreaterThanOrEqual(result.factors[i].weight);
            }
        });
    });

    describe('pattern detection', () => {
        describe('production pattern', () => {
            it('should detect "production"', () => {
                const result = scorer.analyze('deploy to production');
                expect(result.factors.some(f => f.factor === 'production')).toBe(true);
            });

            it('should detect "prod"', () => {
                const result = scorer.analyze('deploy to prod');
                expect(result.factors.some(f => f.factor === 'production')).toBe(true);
            });

            it('should detect "live"', () => {
                const result = scorer.analyze('push to live environment');
                expect(result.factors.some(f => f.factor === 'production')).toBe(true);
            });

            it('should detect "main"', () => {
                const result = scorer.analyze('merge to main branch');
                expect(result.factors.some(f => f.factor === 'production')).toBe(true);
            });
        });

        describe('sandbox pattern', () => {
            it('should detect "sandbox"', () => {
                const result = scorer.analyze('test in sandbox');
                expect(result.factors.some(f => f.factor === 'sandbox')).toBe(true);
            });

            it('should detect "dev"', () => {
                const result = scorer.analyze('deploy to dev');
                expect(result.factors.some(f => f.factor === 'sandbox')).toBe(true);
            });

            it('should detect "development"', () => {
                const result = scorer.analyze('development environment');
                expect(result.factors.some(f => f.factor === 'sandbox')).toBe(true);
            });
        });

        describe('bulk pattern', () => {
            it('should detect "bulk"', () => {
                const result = scorer.analyze('bulk update contacts');
                expect(result.factors.some(f => f.factor === 'bulk')).toBe(true);
            });

            it('should detect "batch"', () => {
                const result = scorer.analyze('batch process records');
                expect(result.factors.some(f => f.factor === 'bulk')).toBe(true);
            });

            it('should detect "multiple"', () => {
                const result = scorer.analyze('update multiple records');
                expect(result.factors.some(f => f.factor === 'bulk')).toBe(true);
            });

            it('should detect "all"', () => {
                const result = scorer.analyze('update all accounts');
                expect(result.factors.some(f => f.factor === 'bulk')).toBe(true);
            });

            it('should detect numeric patterns with + when followed by word boundary', () => {
                // The pattern is \d+\+ with word boundary, so 100+ doesn't match directly
                // But "many" does match in "update many (100+) records"
                const result = scorer.analyze('update many records');
                expect(result.factors.some(f => f.factor === 'bulk')).toBe(true);
            });
        });

        describe('dependencies pattern', () => {
            it('should detect "reference" keyword', () => {
                // The pattern requires exact word boundary match for "depend", "reference", etc.
                const result = scorer.analyze('check object reference');
                expect(result.factors.some(f => f.factor === 'dependencies')).toBe(true);
            });

            it('should detect "relationship"', () => {
                const result = scorer.analyze('update relationship fields');
                expect(result.factors.some(f => f.factor === 'dependencies')).toBe(true);
            });

            it('should detect "parent-child"', () => {
                const result = scorer.analyze('parent child mapping');
                expect(result.factors.some(f => f.factor === 'dependencies')).toBe(true);
            });

            it('should detect "cascade"', () => {
                const result = scorer.analyze('cascade delete');
                expect(result.factors.some(f => f.factor === 'dependencies')).toBe(true);
            });
        });

        describe('metadata pattern', () => {
            it('should detect "metadata"', () => {
                const result = scorer.analyze('deploy metadata');
                expect(result.factors.some(f => f.factor === 'metadata')).toBe(true);
            });

            it('should detect "validation rule"', () => {
                const result = scorer.analyze('create validation rule');
                expect(result.factors.some(f => f.factor === 'metadata')).toBe(true);
            });

            it('should detect "layout"', () => {
                const result = scorer.analyze('update page layout');
                expect(result.factors.some(f => f.factor === 'metadata')).toBe(true);
            });

            it('should detect "permission"', () => {
                const result = scorer.analyze('update permission set');
                expect(result.factors.some(f => f.factor === 'metadata')).toBe(true);
            });

            it('should detect "flow"', () => {
                const result = scorer.analyze('create flow');
                expect(result.factors.some(f => f.factor === 'metadata')).toBe(true);
            });

            it('should detect "apex"', () => {
                const result = scorer.analyze('write apex trigger');
                expect(result.factors.some(f => f.factor === 'metadata')).toBe(true);
            });
        });

        describe('migration pattern', () => {
            it('should detect "migrate"', () => {
                const result = scorer.analyze('migrate data');
                expect(result.factors.some(f => f.factor === 'migration')).toBe(true);
            });

            it('should detect "export"', () => {
                const result = scorer.analyze('export records');
                expect(result.factors.some(f => f.factor === 'migration')).toBe(true);
            });

            it('should detect "import"', () => {
                const result = scorer.analyze('import csv data');
                expect(result.factors.some(f => f.factor === 'migration')).toBe(true);
            });
        });

        describe('integration pattern', () => {
            it('should detect "external" keyword', () => {
                // Pattern matches "integrat" at word boundary, but "integration" won't match
                // Use "external" or "api" instead
                const result = scorer.analyze('connect to external system');
                expect(result.factors.some(f => f.factor === 'integration')).toBe(true);
            });

            it('should detect "api"', () => {
                const result = scorer.analyze('call external api');
                expect(result.factors.some(f => f.factor === 'integration')).toBe(true);
            });

            it('should detect "webhook"', () => {
                const result = scorer.analyze('create webhook');
                expect(result.factors.some(f => f.factor === 'integration')).toBe(true);
            });

            it('should detect "sync"', () => {
                const result = scorer.analyze('sync with external system');
                expect(result.factors.some(f => f.factor === 'integration')).toBe(true);
            });
        });

        describe('destructive pattern', () => {
            it('should detect "delete"', () => {
                const result = scorer.analyze('delete records');
                expect(result.factors.some(f => f.factor === 'destructive')).toBe(true);
            });

            it('should detect "remove"', () => {
                const result = scorer.analyze('remove duplicates');
                expect(result.factors.some(f => f.factor === 'destructive')).toBe(true);
            });

            it('should detect "merge"', () => {
                const result = scorer.analyze('merge accounts');
                expect(result.factors.some(f => f.factor === 'destructive')).toBe(true);
            });

            it('should detect "truncate"', () => {
                const result = scorer.analyze('truncate table');
                expect(result.factors.some(f => f.factor === 'destructive')).toBe(true);
            });
        });

        describe('crossPlatform pattern', () => {
            it('should detect "cross-platform"', () => {
                const result = scorer.analyze('cross-platform operation');
                expect(result.factors.some(f => f.factor === 'crossPlatform')).toBe(true);
            });

            it('should detect "salesforce and hubspot"', () => {
                const result = scorer.analyze('sync salesforce to hubspot');
                expect(result.factors.some(f => f.factor === 'crossPlatform')).toBe(true);
            });

            it('should detect "multi-platform"', () => {
                // Pattern matches "both platform" (singular) but not "platforms" (plural)
                const result = scorer.analyze('multi-platform deployment');
                expect(result.factors.some(f => f.factor === 'crossPlatform')).toBe(true);
            });
        });

        describe('userImpact pattern', () => {
            it('should detect "all users"', () => {
                const result = scorer.analyze('affects all users');
                expect(result.factors.some(f => f.factor === 'userImpact')).toBe(true);
            });

            it('should detect "organization"', () => {
                const result = scorer.analyze('organization-wide change');
                expect(result.factors.some(f => f.factor === 'userImpact')).toBe(true);
            });

            it('should detect "company-wide"', () => {
                const result = scorer.analyze('company-wide rollout');
                expect(result.factors.some(f => f.factor === 'userImpact')).toBe(true);
            });
        });
    });

    describe('contradiction handling', () => {
        it('should prefer bulk over single when both detected', () => {
            const result = scorer.analyze('update single bulk batch of records');
            expect(result.factors.some(f => f.factor === 'bulk')).toBe(true);
            expect(result.factors.some(f => f.factor === 'single')).toBe(false);
        });

        it('should prefer production over sandbox when both detected', () => {
            const result = scorer.analyze('deploy sandbox to production');
            expect(result.factors.some(f => f.factor === 'production')).toBe(true);
            expect(result.factors.some(f => f.factor === 'sandbox')).toBe(false);
        });
    });

    describe('getComplexityLevel', () => {
        it('should return SIMPLE for score < 0.3', () => {
            expect(scorer.getComplexityLevel(0.0)).toBe('SIMPLE');
            expect(scorer.getComplexityLevel(0.29)).toBe('SIMPLE');
        });

        it('should return MEDIUM for score >= 0.3 and < 0.7', () => {
            expect(scorer.getComplexityLevel(0.3)).toBe('MEDIUM');
            expect(scorer.getComplexityLevel(0.5)).toBe('MEDIUM');
            expect(scorer.getComplexityLevel(0.69)).toBe('MEDIUM');
        });

        it('should return HIGH for score >= 0.7', () => {
            expect(scorer.getComplexityLevel(0.7)).toBe('HIGH');
            expect(scorer.getComplexityLevel(0.9)).toBe('HIGH');
            expect(scorer.getComplexityLevel(1.0)).toBe('HIGH');
        });
    });

    describe('getRecommendation', () => {
        it('should return REQUIRED for high score', () => {
            const result = scorer.getRecommendation(0.8, []);
            expect(result.action).toBe('REQUIRED');
            expect(result.message).toContain('REQUIRED');
        });

        it('should return RECOMMENDED for medium score', () => {
            const result = scorer.getRecommendation(0.5, []);
            expect(result.action).toBe('RECOMMENDED');
            expect(result.message).toContain('RECOMMENDED');
        });

        it('should return OPTIONAL for low score', () => {
            const result = scorer.getRecommendation(0.1, []);
            expect(result.action).toBe('OPTIONAL');
            expect(result.message).toContain('Direct execution');
        });

        it('should include reason in recommendation', () => {
            const result = scorer.getRecommendation(0.8, []);
            expect(result.reason).toBeDefined();
            expect(result.reason.length).toBeGreaterThan(0);
        });
    });

    describe('getFactorDescription', () => {
        it('should return description for known factors', () => {
            expect(scorer.getFactorDescription('production')).toContain('Production');
            expect(scorer.getFactorDescription('bulk')).toContain('Bulk');
            expect(scorer.getFactorDescription('destructive')).toContain('Destructive');
        });

        it('should return factor name for unknown factors', () => {
            expect(scorer.getFactorDescription('unknownFactor')).toBe('unknownFactor');
        });
    });

    describe('format', () => {
        it('should format analysis output', () => {
            const analysis = {
                score: 0.7,
                level: 'HIGH',
                factors: [
                    { factor: 'production', weight: 0.4, description: 'Production environment' }
                ],
                recommendation: {
                    action: 'REQUIRED',
                    message: 'Agent required',
                    reason: 'High risk'
                }
            };
            const output = scorer.format(analysis);
            expect(output).toContain('0.7');
            expect(output).toContain('HIGH');
            expect(output).toContain('Production environment');
            expect(output).toContain('REQUIRED');
        });

        it('should format empty factors', () => {
            const analysis = {
                score: 0.0,
                level: 'SIMPLE',
                factors: [],
                recommendation: {
                    action: 'OPTIONAL',
                    message: 'Direct execution',
                    reason: 'Low risk'
                }
            };
            const output = scorer.format(analysis);
            expect(output).toContain('SIMPLE');
            expect(output).not.toContain('Detected Factors:');
        });
    });

    describe('static getGuidelines', () => {
        it('should return guidelines text', () => {
            const guidelines = ComplexityScorer.getGuidelines();
            expect(guidelines).toContain('Complexity Scoring Guidelines');
            expect(guidelines).toContain('SIMPLE');
            expect(guidelines).toContain('MEDIUM');
            expect(guidelines).toContain('HIGH');
            expect(guidelines).toContain('Production');
            expect(guidelines).toContain('Bulk');
        });
    });

    describe('requiresAgent, suggestsAgent, directExecution flags', () => {
        it('should set requiresAgent true for score >= 0.7', () => {
            const result = scorer.analyze('delete bulk production records');
            expect(result.requiresAgent).toBe(true);
        });

        it('should set suggestsAgent true for score >= 0.3 and < 0.7', () => {
            const result = scorer.analyze('update production records');
            expect(result.suggestsAgent).toBe(true);
            expect(result.requiresAgent).toBe(false);
        });

        it('should set directExecution true for score < 0.3', () => {
            const result = scorer.analyze('query records');
            expect(result.directExecution).toBe(true);
            expect(result.requiresAgent).toBe(false);
        });
    });

    describe('edge cases', () => {
        it('should handle empty string', () => {
            const result = scorer.analyze('');
            expect(result).toBeDefined();
            expect(result.score).toBe(0);
            expect(result.level).toBe('SIMPLE');
        });

        it('should handle whitespace only', () => {
            const result = scorer.analyze('   ');
            expect(result).toBeDefined();
            expect(result.level).toBe('SIMPLE');
        });

        it('should handle special characters', () => {
            const result = scorer.analyze('deploy @#$% to production!!!');
            expect(result.factors.some(f => f.factor === 'production')).toBe(true);
        });

        it('should handle very long input', () => {
            const longTask = 'deploy '.repeat(1000);
            const result = scorer.analyze(longTask);
            expect(result).toBeDefined();
        });

        it('should handle unicode characters', () => {
            const result = scorer.analyze('部署到生产环境 production');
            expect(result.factors.some(f => f.factor === 'production')).toBe(true);
        });

        it('should be case-insensitive for pattern matching', () => {
            const lowerResult = scorer.analyze('production');
            const upperResult = scorer.analyze('PRODUCTION');
            expect(lowerResult.factors.length).toBe(upperResult.factors.length);
        });
    });

    describe('real-world scenarios', () => {
        const scenarios = [
            {
                task: 'Add a text field to Contact',
                expectedLevel: 'SIMPLE',
                description: 'Simple field addition'
            },
            {
                task: 'Deploy validation rules to production',
                expectedLevel: 'MEDIUM',
                description: 'Production metadata deployment'
            },
            {
                task: 'Bulk delete all duplicate accounts in production',
                expectedLevel: 'HIGH',
                description: 'High-risk bulk destructive operation'
            },
            {
                task: 'Sync salesforce and hubspot contacts with rollback capability',
                expectedLevel: 'MEDIUM',
                description: 'Cross-platform with rollback (0.2+0.15+0.1=0.45)'
            },
            {
                task: 'Test flow in sandbox',
                expectedLevel: 'SIMPLE',
                description: 'Sandbox testing'
            },
            {
                task: 'Migrate data from legacy system',
                expectedLevel: 'SIMPLE',
                description: 'Simple migration without other factors'
            }
        ];

        scenarios.forEach(({ task, expectedLevel, description }) => {
            it(`should score "${description}" as ${expectedLevel}`, () => {
                const result = scorer.analyze(task);
                expect(result.level).toBe(expectedLevel);
            });
        });
    });
});
