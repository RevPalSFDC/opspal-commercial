/**
 * Tests for User Reports Extractor
 *
 * Tests the template generation and anonymization logic without
 * requiring a live Salesforce connection.
 */

const UserReportsExtractor = require('../user-reports-extractor');

describe('UserReportsExtractor', () => {
    let extractor;

    beforeEach(() => {
        // Create extractor without initializing (no SF connection needed for these tests)
        extractor = new UserReportsExtractor('test-org', {
            pluginRoot: '/tmp/test',
            instancesDir: '/tmp/test/instances',
            templatesDir: '/tmp/test/templates'
        });
    });

    describe('generateTemplateId', () => {
        it('should generate anonymized template ID', () => {
            const result = extractor.generateTemplateId('RC Pipeline Coverage', 'sales');
            expect(result).not.toContain('rc');
            expect(result).toContain('bp-');
            expect(result).toContain('sales');
        });

        it('should remove personal initials prefix', () => {
            const result = extractor.generateTemplateId('rc-my-pipeline-report', 'sales');
            expect(result).not.toContain('rc-');
            expect(result).toStartWith('bp-');
        });

        it('should remove fiscal year suffixes', () => {
            const result = extractor.generateTemplateId('Pipeline Report FY2024', 'sales');
            expect(result).not.toContain('fy2024');
            expect(result).not.toContain('2024');
        });

        it('should handle already function-prefixed names', () => {
            const result = extractor.generateTemplateId('sales-pipeline-health', 'sales');
            expect(result).toStartWith('bp-');
        });

        it('should truncate long names', () => {
            const longName = 'This is a very long report name that should be truncated because it exceeds the maximum length';
            const result = extractor.generateTemplateId(longName, 'sales');
            expect(result.length).toBeLessThanOrEqual(50);
        });
    });

    describe('isStandardField', () => {
        it('should recognize standard opportunity fields', () => {
            expect(extractor.isStandardField('Amount')).toBe(true);
            expect(extractor.isStandardField('AMOUNT')).toBe(true);
            expect(extractor.isStandardField('StageName')).toBe(true);
            expect(extractor.isStandardField('CloseDate')).toBe(true);
        });

        it('should recognize custom fields', () => {
            expect(extractor.isStandardField('Custom_Field__c')).toBe(false);
            expect(extractor.isStandardField('SBQQ__NetAmount__c')).toBe(false);
        });

        it('should handle relationship fields', () => {
            expect(extractor.isStandardField('Account.Name')).toBe(true);
            expect(extractor.isStandardField('Custom__c.Name')).toBe(false);
        });
    });

    describe('anonymizeFilterValue', () => {
        it('should keep relative date values', () => {
            expect(extractor.anonymizeFilterValue('THIS_FISCAL_QUARTER')).toBe('THIS_FISCAL_QUARTER');
            expect(extractor.anonymizeFilterValue('LAST_N_DAYS:30')).toBe('LAST_N_DAYS:30');
            expect(extractor.anonymizeFilterValue('NEXT_MONTH')).toBe('NEXT_MONTH');
        });

        it('should keep boolean values', () => {
            expect(extractor.anonymizeFilterValue('true')).toBe('true');
            expect(extractor.anonymizeFilterValue('false')).toBe('false');
        });

        it('should anonymize specific values', () => {
            expect(extractor.anonymizeFilterValue('Acme Corp')).toBe('{CUSTOMIZE}');
            expect(extractor.anonymizeFilterValue('12345')).toBe('{CUSTOMIZE}');
        });

        it('should handle null/undefined', () => {
            expect(extractor.anonymizeFilterValue(null)).toBe(null);
            expect(extractor.anonymizeFilterValue(undefined)).toBe(undefined);
        });
    });

    describe('analyzeReport', () => {
        it('should categorize sales reports correctly', () => {
            const mockReport = {
                Id: '00O123',
                Name: 'Pipeline Coverage Report',
                fullMetadata: {
                    reportMetadata: {
                        reportType: { type: 'Opportunity' },
                        reportFormat: 'SUMMARY',
                        detailColumns: ['AMOUNT', 'STAGE_NAME'],
                        groupingsDown: [{ name: 'OWNER_NAME' }],
                        reportFilters: [],
                        aggregates: [{ name: 'AMOUNT' }]
                    }
                }
            };

            const analysis = extractor.analyzeReport(mockReport);

            expect(analysis.function).toBe('sales');
            expect(analysis.templateId).toContain('bp-');
            expect(analysis.templateId).toContain('pipeline');
            expect(analysis.portabilityScore).toBeGreaterThan(0.5);
        });

        it('should categorize marketing reports correctly', () => {
            const mockReport = {
                Id: '00O456',
                Name: 'MQL Conversion Funnel',
                fullMetadata: {
                    reportMetadata: {
                        reportType: { type: 'LeadList' },
                        reportFormat: 'SUMMARY',
                        detailColumns: ['LEAD_SOURCE', 'STATUS'],
                        groupingsDown: [],
                        reportFilters: [],
                        aggregates: []
                    }
                }
            };

            const analysis = extractor.analyzeReport(mockReport);

            expect(analysis.function).toBe('marketing');
        });

        it('should categorize customer success reports correctly', () => {
            const mockReport = {
                Id: '00O789',
                Name: 'Renewal Pipeline Health',
                fullMetadata: {
                    reportMetadata: {
                        reportType: { type: 'Opportunity' },
                        reportFormat: 'SUMMARY',
                        detailColumns: ['AMOUNT'],
                        groupingsDown: [],
                        reportFilters: [],
                        aggregates: []
                    }
                }
            };

            const analysis = extractor.analyzeReport(mockReport);

            expect(analysis.function).toBe('customer-success');
        });

        it('should calculate portability score correctly', () => {
            const mockReport = {
                Id: '00O123',
                Name: 'Mixed Fields Report',
                fullMetadata: {
                    reportMetadata: {
                        reportType: { type: 'Opportunity' },
                        reportFormat: 'TABULAR',
                        detailColumns: ['AMOUNT', 'Custom_Field__c', 'STAGE_NAME', 'Another_Custom__c'],
                        groupingsDown: [],
                        reportFilters: [],
                        aggregates: []
                    }
                }
            };

            const analysis = extractor.analyzeReport(mockReport);

            // 2 standard fields out of 4 = 50% portability
            expect(analysis.portabilityScore).toBe(0.5);
            expect(analysis.fields.standard).toBe(2);
            expect(analysis.fields.custom).toBe(2);
        });
    });

    describe('createTemplate', () => {
        it('should create anonymized template', () => {
            const analysis = {
                originalId: '00O123',
                originalName: 'RC Pipeline Coverage',
                templateId: 'bp-sales-pipeline-coverage',
                function: 'sales',
                audience: 'executive',
                reportType: 'Opportunity',
                reportFormat: 'SUMMARY',
                fields: {
                    total: 5,
                    standard: 4,
                    custom: 1,
                    list: ['AMOUNT', 'STAGE_NAME', 'CLOSE_DATE', 'OWNER_NAME', 'Custom__c']
                },
                portabilityScore: 0.8,
                customFieldsNeedingFallback: ['Custom__c'],
                groupings: { down: ['OWNER_NAME'], across: [] },
                filters: [],
                aggregates: [{ name: 'AMOUNT' }],
                chart: null,
                metadata: {
                    detailColumns: ['AMOUNT', 'STAGE_NAME']
                }
            };

            const template = extractor.createTemplate(analysis);

            // Check anonymization
            expect(JSON.stringify(template)).not.toContain('RC');
            expect(JSON.stringify(template)).not.toContain('Rachel');

            // Check structure
            expect(template.templateMetadata.templateId).toBe('bp-sales-pipeline-coverage');
            expect(template.templateMetadata.function).toBe('sales');
            expect(template.templateMetadata.level).toBe('executive');

            // Check variations exist
            expect(template.variations.availableVariations).toContain('standard');
            expect(template.variations.availableVariations).toContain('simple');

            // Check org adaptation
            expect(template.orgAdaptation.minimumFidelity).toBe(0.7);
        });

        it('should add CPQ variation for amount-related reports', () => {
            const analysis = {
                originalId: '00O123',
                originalName: 'Revenue Report',
                templateId: 'bp-sales-revenue',
                function: 'sales',
                audience: 'executive',
                reportType: 'Opportunity',
                reportFormat: 'SUMMARY',
                fields: {
                    total: 2,
                    standard: 2,
                    custom: 0,
                    list: ['AMOUNT', 'REVENUE']
                },
                portabilityScore: 1.0,
                customFieldsNeedingFallback: [],
                groupings: { down: [], across: [] },
                filters: [],
                aggregates: [],
                chart: null,
                metadata: {}
            };

            const template = extractor.createTemplate(analysis);

            expect(template.variations.availableVariations).toContain('cpq');
            expect(template.variations.variationOverrides.cpq.fieldSubstitutions).toBeDefined();
        });

        it('should add enterprise variation for executive reports', () => {
            const analysis = {
                originalId: '00O123',
                originalName: 'Executive Dashboard',
                templateId: 'bp-sales-executive',
                function: 'sales',
                audience: 'executive',
                reportType: 'Opportunity',
                reportFormat: 'SUMMARY',
                fields: {
                    total: 1,
                    standard: 1,
                    custom: 0,
                    list: ['STAGE_NAME']
                },
                portabilityScore: 1.0,
                customFieldsNeedingFallback: [],
                groupings: { down: [], across: [] },
                filters: [],
                aggregates: [],
                chart: null,
                metadata: {}
            };

            const template = extractor.createTemplate(analysis);

            expect(template.variations.availableVariations).toContain('enterprise');
        });
    });

    describe('validateTemplate', () => {
        it('should pass validation for proper templates', () => {
            const validTemplate = {
                templateMetadata: {
                    templateId: 'bp-sales-pipeline',
                    templateName: 'Best Practice: Sales Pipeline'
                },
                reportMetadata: {
                    reportType: 'Opportunity'
                }
            };

            const result = extractor.validateTemplate(validTemplate);
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should fail validation for missing templateId', () => {
            const invalidTemplate = {
                templateMetadata: {
                    templateName: 'Missing ID'
                },
                reportMetadata: {
                    reportType: 'Opportunity'
                }
            };

            const result = extractor.validateTemplate(invalidTemplate);
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Missing templateMetadata.templateId');
        });

        it('should fail validation for personal names in content', () => {
            const templateWithPersonalInfo = {
                templateMetadata: {
                    templateId: 'bp-test',
                    templateName: 'Rachel Chu Pipeline Report'
                },
                reportMetadata: {
                    reportType: 'Opportunity'
                }
            };

            const result = extractor.validateTemplate(templateWithPersonalInfo);
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('sensitive'))).toBe(true);
        });

        it('should fail validation for rc- prefix (personal initials)', () => {
            const templateWithInitials = {
                templateMetadata: {
                    templateId: 'rc-pipeline-report',
                    templateName: 'Pipeline Report'
                },
                reportMetadata: {
                    reportType: 'Opportunity'
                }
            };

            const result = extractor.validateTemplate(templateWithInitials);
            expect(result.valid).toBe(false);
        });
    });

    describe('generateTags', () => {
        it('should include function and audience tags', () => {
            const analysis = {
                function: 'sales',
                audience: 'executive',
                reportFormat: 'SUMMARY',
                portabilityScore: 0.95,
                fields: { list: ['AMOUNT', 'STAGE_NAME'] }
            };

            const tags = extractor.generateTags(analysis);

            expect(tags).toContain('best-practice');
            expect(tags).toContain('sales');
            expect(tags).toContain('executive');
            expect(tags).toContain('summary');
            expect(tags).toContain('highly-portable');
        });

        it('should add revenue tag for amount fields', () => {
            const analysis = {
                function: 'sales',
                audience: 'manager',
                reportFormat: 'TABULAR',
                portabilityScore: 0.7,
                fields: { list: ['AMOUNT', 'REVENUE'] }
            };

            const tags = extractor.generateTags(analysis);

            expect(tags).toContain('revenue');
        });

        it('should not duplicate tags', () => {
            const analysis = {
                function: 'sales',
                audience: 'executive',
                reportFormat: 'SUMMARY',
                portabilityScore: 0.5,
                fields: { list: ['AMOUNT'] }
            };

            const tags = extractor.generateTags(analysis);
            const uniqueTags = [...new Set(tags)];

            expect(tags.length).toBe(uniqueTags.length);
        });
    });
});

// Custom Jest matchers
expect.extend({
    toStartWith(received, expected) {
        const pass = received.startsWith(expected);
        return {
            message: () => `expected ${received} to start with ${expected}`,
            pass
        };
    }
});
