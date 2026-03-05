/**
 * Tests for path-normalizer.js
 *
 * Tests the path transformation system that converts legacy paths
 * to the current org-centric schema.
 */

const {
    normalizePath,
    normalizeFixPlan,
    normalizeFixPlans,
    normalizeObject,
    isDeprecatedPath,
    getApplicableRule,
    TRANSFORMATION_RULES
} = require('../path-normalizer');

describe('path-normalizer', () => {
    describe('normalizePath', () => {
        describe('legacy-platform transformation', () => {
            test('transforms instances/salesforce/{org}/ to org-centric', () => {
                const result = normalizePath('instances/salesforce/acme/reports');
                expect(result).toBe('orgs/acme/platforms/salesforce/default/reports');
            });

            test('transforms instances/hubspot/{org}/ to org-centric', () => {
                const result = normalizePath('instances/hubspot/acme');
                expect(result).toBe('orgs/acme/platforms/hubspot/default');
            });

            test('transforms instances/marketo/{org}/ to org-centric', () => {
                const result = normalizePath('instances/marketo/acme/configs');
                expect(result).toBe('orgs/acme/platforms/marketo/default/configs');
            });

            test('preserves subdirectory structure', () => {
                const result = normalizePath('instances/salesforce/acme/reports/cpq/assessment.json');
                expect(result).toBe('orgs/acme/platforms/salesforce/default/reports/cpq/assessment.json');
            });
        });

        describe('legacy-simple transformation', () => {
            test('transforms instances/{org}/ to org-centric (defaults to salesforce)', () => {
                const result = normalizePath('instances/acme/configs');
                expect(result).toBe('orgs/acme/platforms/salesforce/default/configs');
            });

            test('does not transform if org name looks like a platform', () => {
                // This should be handled by legacy-platform rule first
                const result = normalizePath('instances/salesforce/acme');
                expect(result).toBe('orgs/acme/platforms/salesforce/default');
            });
        });

        describe('opspal-internal transformations', () => {
            test('transforms opspal-internal/SFDC/instances/ to org-centric', () => {
                const result = normalizePath('opspal-internal/SFDC/instances/acme/reports');
                expect(result).toBe('orgs/acme/platforms/salesforce/default/reports');
            });

            test('transforms opspal-internal/SFDC/scripts/ to plugin path', () => {
                const result = normalizePath('opspal-internal/SFDC/scripts/lib/foo.js');
                expect(result).toBe('plugins/opspal-salesforce/scripts/lib/foo.js');
            });

            test('transforms opspal-internal/HS/instances/ to org-centric', () => {
                const result = normalizePath('opspal-internal/HS/instances/acme');
                expect(result).toBe('orgs/acme/platforms/hubspot/default');
            });

            test('transforms opspal-internal/HS/scripts/ to plugin path', () => {
                const result = normalizePath('opspal-internal/HS/hooks/pre-task.sh');
                expect(result).toBe('plugins/opspal-hubspot/hooks/pre-task.sh');
            });

            test('transforms opspal-internal/.claude/ to project root', () => {
                const result = normalizePath('opspal-internal/.claude/settings.json');
                expect(result).toBe('.claude/settings.json');
            });
        });

        describe('already valid paths', () => {
            test('returns org-centric paths unchanged', () => {
                const path = 'orgs/acme/platforms/salesforce/production/reports';
                const result = normalizePath(path);
                expect(result).toBe(path);
            });

            test('returns plugin paths unchanged', () => {
                const path = 'plugins/opspal-core/scripts/lib/foo.js';
                const result = normalizePath(path);
                expect(result).toBe(path);
            });

            test('returns relative paths unchanged', () => {
                const path = './scripts/lib/foo.js';
                const result = normalizePath(path);
                expect(result).toBe(path);
            });
        });

        describe('edge cases', () => {
            test('handles null input', () => {
                expect(normalizePath(null)).toBe(null);
            });

            test('handles empty string', () => {
                expect(normalizePath('')).toBe('');
            });

            test('normalizes Windows-style separators', () => {
                const result = normalizePath('instances\\salesforce\\acme');
                expect(result).toBe('orgs/acme/platforms/salesforce/default');
            });
        });
    });

    describe('normalizeFixPlan', () => {
        test('normalizes all paths in a fix plan', () => {
            const fixPlan = {
                solution: {
                    components_affected: [
                        { path: 'instances/salesforce/acme/reports' },
                        { path: 'opspal-internal/SFDC/scripts/lib/foo.js' }
                    ],
                    files: [
                        { path: 'instances/hubspot/acme/config.json' }
                    ]
                },
                debugging_playbook: {
                    path: 'opspal-internal/SFDC/scripts/playbooks/debug.md'
                }
            };

            const result = normalizeFixPlan(fixPlan);

            expect(result.transformationCount).toBe(4);
            expect(result.normalized.solution.components_affected[0].path)
                .toBe('orgs/acme/platforms/salesforce/default/reports');
            expect(result.normalized.solution.components_affected[1].path)
                .toBe('plugins/opspal-salesforce/scripts/lib/foo.js');
            expect(result.normalized.solution.files[0].path)
                .toBe('orgs/acme/platforms/hubspot/default/config.json');
        });

        test('tracks transformation metadata', () => {
            const fixPlan = {
                solution: {
                    components_affected: [
                        { path: 'instances/salesforce/acme' }
                    ]
                }
            };

            const result = normalizeFixPlan(fixPlan);

            expect(result.transformations).toHaveLength(1);
            expect(result.transformations[0].original).toBe('instances/salesforce/acme');
            expect(result.transformations[0].transformed).toBe('orgs/acme/platforms/salesforce/default');
            expect(result.normalized._pathNormalization).toBeDefined();
            expect(result.normalized._pathNormalization.normalized).toBe(true);
        });

        test('handles fix plans with no deprecated paths', () => {
            const fixPlan = {
                solution: {
                    components_affected: [
                        { path: 'plugins/opspal-core/scripts/lib/foo.js' }
                    ]
                }
            };

            const result = normalizeFixPlan(fixPlan);

            expect(result.transformationCount).toBe(0);
            expect(result.normalized._pathNormalization).toBeUndefined();
        });
    });

    describe('normalizeFixPlans', () => {
        test('normalizes array of fix plans', () => {
            const fixPlans = [
                {
                    solution: {
                        components_affected: [{ path: 'instances/salesforce/acme' }]
                    }
                },
                {
                    solution: {
                        components_affected: [{ path: 'instances/hubspot/acme' }]
                    }
                }
            ];

            const result = normalizeFixPlans(fixPlans);

            expect(result.totalTransformations).toBe(2);
            expect(result.normalizedPlans).toHaveLength(2);
            expect(result.transformations[0].planIndex).toBe(0);
            expect(result.transformations[1].planIndex).toBe(1);
        });
    });

    describe('normalizeObject', () => {
        test('normalizes specified path fields recursively', () => {
            const obj = {
                name: 'test',
                path: 'instances/salesforce/acme',
                nested: {
                    file: 'instances/hubspot/acme/config.json',
                    outputDir: 'instances/marketo/acme/output'
                }
            };

            const result = normalizeObject(obj, ['path', 'file', 'outputDir']);

            expect(result.name).toBe('test');
            expect(result.path).toBe('orgs/acme/platforms/salesforce/default');
            expect(result.nested.file).toBe('orgs/acme/platforms/hubspot/default/config.json');
            expect(result.nested.outputDir).toBe('orgs/acme/platforms/marketo/default/output');
        });
    });

    describe('isDeprecatedPath', () => {
        test('returns true for deprecated paths', () => {
            expect(isDeprecatedPath('instances/salesforce/acme')).toBe(true);
            expect(isDeprecatedPath('opspal-internal/SFDC/instances/acme')).toBe(true);
        });

        test('returns false for valid paths', () => {
            expect(isDeprecatedPath('orgs/acme/platforms/salesforce/default')).toBe(false);
            expect(isDeprecatedPath('plugins/opspal-core/scripts/lib/foo.js')).toBe(false);
        });
    });

    describe('getApplicableRule', () => {
        test('returns rule info for deprecated paths', () => {
            const rule = getApplicableRule('instances/salesforce/acme');
            expect(rule).not.toBeNull();
            expect(rule.name).toBe('legacy-platform-first');
            expect(rule.transformed).toBe('orgs/acme/platforms/salesforce/default');
        });

        test('returns null for valid paths', () => {
            const rule = getApplicableRule('orgs/acme/platforms/salesforce/default');
            expect(rule).toBeNull();
        });
    });

    describe('TRANSFORMATION_RULES', () => {
        test('has expected rules in order', () => {
            expect(TRANSFORMATION_RULES.length).toBeGreaterThan(0);
            expect(TRANSFORMATION_RULES[0].name).toBe('legacy-platform-first');
        });
    });
});
