/**
 * Tests for path-schema-validator.js
 *
 * Tests the path schema detection and validation system that prevents
 * deprecated path schemas from appearing in generated plans.
 */

const {
    validatePathSchema,
    validateFixPlanPaths,
    needsTransformation,
    getSuggestedPath,
    PATH_SCHEMAS
} = require('../path-schema-validator');

describe('path-schema-validator', () => {
    describe('validatePathSchema', () => {
        describe('valid paths (current org-centric schema)', () => {
            test('validates orgs/{org}/platforms/{platform}/{instance}/ path', () => {
                const result = validatePathSchema('orgs/acme/platforms/salesforce/production');
                expect(result.valid).toBe(true);
                expect(result.schema).toBe('org-centric');
            });

            test('validates org-centric path with subdirectories', () => {
                const result = validatePathSchema('orgs/acme/platforms/salesforce/production/reports/cpq-assessment.json');
                expect(result.valid).toBe(true);
                expect(result.schema).toBe('org-centric');
            });

            test('validates plugin paths', () => {
                const result = validatePathSchema('plugins/opspal-salesforce/scripts/lib/foo.js');
                expect(result.valid).toBe(true);
                expect(result.schema).toBe('plugin-path');
            });

            test('validates component-relative paths', () => {
                const result = validatePathSchema('scripts/lib/my-script.js');
                expect(result.valid).toBe(true);
                expect(result.schema).toBe('component-relative');

                const result2 = validatePathSchema('./hooks/pre-task.sh');
                expect(result2.valid).toBe(true);
            });
        });

        describe('deprecated paths (legacy schemas)', () => {
            test('detects instances/salesforce/{org}/ as deprecated', () => {
                const result = validatePathSchema('instances/salesforce/acme/reports');
                expect(result.valid).toBe(false);
                expect(result.schema).toBe('legacy-platform');
                expect(result.suggested).toBe('orgs/acme/platforms/salesforce/default/reports');
            });

            test('detects instances/hubspot/{org}/ as deprecated', () => {
                const result = validatePathSchema('instances/hubspot/acme');
                expect(result.valid).toBe(false);
                expect(result.schema).toBe('legacy-platform');
                expect(result.suggested).toBe('orgs/acme/platforms/hubspot/default');
            });

            test('detects instances/{org}/ (simple) as deprecated', () => {
                const result = validatePathSchema('instances/acme/configs');
                expect(result.valid).toBe(false);
                expect(result.schema).toBe('legacy-simple');
                expect(result.suggested).toBe('orgs/acme/platforms/salesforce/default/configs');
            });

            test('detects opspal-internal/SFDC/ as deprecated', () => {
                const result = validatePathSchema('opspal-internal/SFDC/instances/acme');
                expect(result.valid).toBe(false);
                expect(result.schema).toBe('legacy-internal-sfdc');
                expect(result.suggested).toBe('orgs/acme/platforms/salesforce/default');
            });

            test('detects opspal-internal/HS/ as deprecated', () => {
                const result = validatePathSchema('opspal-internal/HS/instances/acme/reports');
                expect(result.valid).toBe(false);
                expect(result.schema).toBe('legacy-internal-hs');
                expect(result.suggested).toBe('orgs/acme/platforms/hubspot/default/reports');
            });

            test('includes warning message for deprecated paths', () => {
                const result = validatePathSchema('instances/salesforce/acme');
                expect(result.warning).toContain('Deprecated');
            });
        });

        describe('edge cases', () => {
            test('handles null input', () => {
                const result = validatePathSchema(null);
                expect(result.valid).toBe(true);
                expect(result.schema).toBe('unknown');
            });

            test('handles empty string', () => {
                const result = validatePathSchema('');
                expect(result.valid).toBe(true);
                expect(result.schema).toBe('unknown');
            });

            test('handles Windows-style paths', () => {
                const result = validatePathSchema('instances\\salesforce\\acme');
                expect(result.valid).toBe(false);
                expect(result.suggested).toBe('orgs/acme/platforms/salesforce/default');
            });

            test('handles leading/trailing slashes', () => {
                const result = validatePathSchema('/instances/salesforce/acme/');
                expect(result.valid).toBe(false);
                expect(result.suggested).toBe('orgs/acme/platforms/salesforce/default');
            });
        });
    });

    describe('validateFixPlanPaths', () => {
        test('validates fix plan with all valid paths', () => {
            const fixPlan = {
                solution: {
                    components_affected: [
                        { path: 'plugins/opspal-core/scripts/lib/foo.js' },
                        { path: 'orgs/acme/platforms/salesforce/default/config.json' }
                    ]
                }
            };

            const result = validateFixPlanPaths(fixPlan);
            expect(result.valid).toBe(true);
            expect(result.warnings).toHaveLength(0);
            expect(result.transformations).toHaveLength(0);
        });

        test('detects deprecated paths in components_affected', () => {
            const fixPlan = {
                solution: {
                    components_affected: [
                        { path: 'instances/salesforce/acme/reports' }
                    ]
                }
            };

            const result = validateFixPlanPaths(fixPlan);
            expect(result.valid).toBe(false);
            expect(result.warnings).toHaveLength(1);
            expect(result.transformations).toHaveLength(1);
            expect(result.normalizedPlan.solution.components_affected[0].path)
                .toBe('orgs/acme/platforms/salesforce/default/reports');
        });

        test('detects deprecated paths in solution.files', () => {
            const fixPlan = {
                solution: {
                    files: [
                        { path: 'opspal-internal/SFDC/instances/acme/config.json' }
                    ]
                }
            };

            const result = validateFixPlanPaths(fixPlan);
            expect(result.valid).toBe(false);
            expect(result.normalizedPlan.solution.files[0].path)
                .toBe('orgs/acme/platforms/salesforce/default/config.json');
        });

        test('detects deprecated paths in debugging_playbook', () => {
            const fixPlan = {
                debugging_playbook: {
                    path: 'opspal-internal/SFDC/scripts/playbooks/debug.md'
                }
            };

            const result = validateFixPlanPaths(fixPlan);
            expect(result.valid).toBe(false);
        });

        test('preserves original path in _originalPath', () => {
            const fixPlan = {
                solution: {
                    components_affected: [
                        { path: 'instances/salesforce/acme/reports' }
                    ]
                }
            };

            const result = validateFixPlanPaths(fixPlan);
            expect(result.normalizedPlan.solution.components_affected[0]._originalPath)
                .toBe('instances/salesforce/acme/reports');
        });
    });

    describe('needsTransformation', () => {
        test('returns true for deprecated paths', () => {
            expect(needsTransformation('instances/salesforce/acme')).toBe(true);
        });

        test('returns false for valid paths', () => {
            expect(needsTransformation('orgs/acme/platforms/salesforce/default')).toBe(false);
        });
    });

    describe('getSuggestedPath', () => {
        test('returns suggested path for deprecated paths', () => {
            const suggested = getSuggestedPath('instances/salesforce/acme');
            expect(suggested).toBe('orgs/acme/platforms/salesforce/default');
        });

        test('returns null for valid paths', () => {
            const suggested = getSuggestedPath('orgs/acme/platforms/salesforce/default');
            expect(suggested).toBeNull();
        });
    });

    describe('PATH_SCHEMAS', () => {
        test('has expected schema definitions', () => {
            expect(PATH_SCHEMAS).toHaveProperty('org-centric');
            expect(PATH_SCHEMAS).toHaveProperty('legacy-platform');
            expect(PATH_SCHEMAS).toHaveProperty('legacy-simple');
            expect(PATH_SCHEMAS['org-centric'].valid).toBe(true);
            expect(PATH_SCHEMAS['legacy-platform'].valid).toBe(false);
        });
    });
});
