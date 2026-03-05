/**
 * Unit tests for MethodologyGenerator
 * Phase 6: Comprehensive QA Plan
 *
 * Tests methodology appendix generation including:
 * - Data source recording
 * - KPI calculation documentation
 * - Query logging
 * - Assumptions and exclusions
 * - Multiple output formats (markdown, JSON, HTML)
 */

const path = require('path');
const fs = require('fs');

// Mock the MethodologyGenerator class
const {
    MethodologyGenerator,
    createStandardGenerator,
    generateQuickSummary
} = require('../../methodology-generator');

describe('MethodologyGenerator', () => {
    let generator;

    beforeEach(async () => {
        generator = new MethodologyGenerator({
            includeQueries: true,
            includeBenchmarks: true,
            outputFormat: 'markdown'
        });
        try {
            await generator.initialize();
        } catch (e) {
            // Mock KB if initialization fails
            generator.kb = {
                getFormulaDocumentation: (id) => ({
                    name: id,
                    formula: 'test formula',
                    unit: 'currency',
                    formulaDetailed: 'detailed formula'
                }),
                getBenchmarkSources: () => ['Test Benchmark Source 2024']
            };
        }
    });

    afterEach(() => {
        generator = null;
    });

    // ============================================
    // Initialization Tests
    // ============================================
    describe('Initialization', () => {
        test('should create instance with default options', () => {
            const gen = new MethodologyGenerator();
            expect(gen).toBeInstanceOf(MethodologyGenerator);
            expect(gen.options.outputFormat).toBe('markdown');
            expect(gen.options.includeQueries).toBe(true);
            expect(gen.options.includeBenchmarks).toBe(true);
        });

        test('should accept custom options', () => {
            const gen = new MethodologyGenerator({
                includeQueries: false,
                includeBenchmarks: false,
                outputFormat: 'json'
            });
            expect(gen.options.includeQueries).toBe(false);
            expect(gen.options.includeBenchmarks).toBe(false);
            expect(gen.options.outputFormat).toBe('json');
        });

        test('should initialize with empty metadata', () => {
            expect(generator.metadata.dataSources).toEqual([]);
            expect(generator.metadata.kpis).toEqual([]);
            expect(generator.metadata.queries).toEqual([]);
            expect(generator.metadata.assumptions).toEqual([]);
            expect(generator.metadata.exclusions).toEqual([]);
            expect(generator.metadata.benchmarkSources).toEqual([]);
        });
    });

    // ============================================
    // Data Source Recording Tests
    // ============================================
    describe('recordDataSource()', () => {
        test('should record Salesforce data source', () => {
            generator.recordDataSource({
                platform: 'Salesforce',
                object: 'Opportunity',
                fields: ['Amount', 'CloseDate', 'StageName'],
                recordCount: 2500,
                dateRange: { start: '2024-01-01', end: '2024-12-31' },
                filter: 'IsWon = true'
            });

            expect(generator.metadata.dataSources).toHaveLength(1);
            expect(generator.metadata.dataSources[0].platform).toBe('Salesforce');
            expect(generator.metadata.dataSources[0].object).toBe('Opportunity');
            expect(generator.metadata.dataSources[0].recordCount).toBe(2500);
        });

        test('should record HubSpot data source', () => {
            generator.recordDataSource({
                platform: 'HubSpot',
                object: 'deals',
                fields: ['amount', 'closedate', 'dealstage'],
                recordCount: 1500,
                dateRange: { start: '2024-01-01', end: '2024-12-31' }
            });

            expect(generator.metadata.dataSources).toHaveLength(1);
            expect(generator.metadata.dataSources[0].platform).toBe('HubSpot');
        });

        test('should auto-add timestamp', () => {
            generator.recordDataSource({
                platform: 'Salesforce',
                object: 'Account',
                recordCount: 500
            });

            expect(generator.metadata.dataSources[0].queryTimestamp).toBeDefined();
        });

        test('should record multiple data sources', () => {
            generator.recordDataSource({ platform: 'Salesforce', object: 'Opportunity', recordCount: 1000 });
            generator.recordDataSource({ platform: 'Salesforce', object: 'Account', recordCount: 500 });
            generator.recordDataSource({ platform: 'HubSpot', object: 'deals', recordCount: 800 });

            expect(generator.metadata.dataSources).toHaveLength(3);
        });

        test('should handle optional fields', () => {
            generator.recordDataSource({
                platform: 'Salesforce',
                object: 'Lead'
            });

            const source = generator.metadata.dataSources[0];
            expect(source.fields).toEqual([]);
            expect(source.recordCount).toBeUndefined();
        });

        test('should include notes if provided', () => {
            generator.recordDataSource({
                platform: 'Salesforce',
                object: 'Opportunity',
                recordCount: 100,
                notes: 'Filtered to active accounts only'
            });

            expect(generator.metadata.dataSources[0].notes).toBe('Filtered to active accounts only');
        });
    });

    // ============================================
    // KPI Calculation Recording Tests
    // ============================================
    describe('recordKPICalculation()', () => {
        test('should record KPI calculation', () => {
            generator.recordKPICalculation({
                kpiId: 'ARR',
                inputValues: { MRR: 100000 },
                calculatedValue: 1200000,
                unit: 'currency'
            });

            expect(generator.metadata.kpis).toHaveLength(1);
            expect(generator.metadata.kpis[0].id).toBe('ARR');
            expect(generator.metadata.kpis[0].calculatedValue).toBe(1200000);
        });

        test('should record calculation steps', () => {
            generator.recordKPICalculation({
                kpiId: 'NRR',
                inputValues: {
                    startingMRR: 100000,
                    expansion: 20000,
                    contraction: 5000,
                    churn: 10000
                },
                calculatedValue: 105,
                calculationSteps: [
                    'Starting MRR: $100,000',
                    'Expansion: +$20,000',
                    'Contraction: -$5,000',
                    'Churn: -$10,000',
                    'NRR = (100000 + 20000 - 5000 - 10000) / 100000 × 100 = 105%'
                ]
            });

            expect(generator.metadata.kpis[0].calculationSteps).toHaveLength(5);
        });

        test('should include notes', () => {
            generator.recordKPICalculation({
                kpiId: 'CAC',
                calculatedValue: 5000,
                notes: 'Marketing spend allocated at 60/40 ratio'
            });

            expect(generator.metadata.kpis[0].notes).toBe('Marketing spend allocated at 60/40 ratio');
        });

        test('should handle missing input values', () => {
            generator.recordKPICalculation({
                kpiId: 'WinRate',
                calculatedValue: 25
            });

            expect(generator.metadata.kpis[0].inputValues).toEqual({});
        });
    });

    // ============================================
    // Query Recording Tests
    // ============================================
    describe('recordQuery()', () => {
        test('should record SOQL query', () => {
            generator.recordQuery({
                platform: 'Salesforce',
                queryType: 'SOQL',
                query: 'SELECT Amount FROM Opportunity WHERE IsWon = true',
                purpose: 'Retrieve closed-won opportunities',
                recordsReturned: 2500,
                executionTime: 1500
            });

            expect(generator.metadata.queries).toHaveLength(1);
            expect(generator.metadata.queries[0].queryType).toBe('SOQL');
            expect(generator.metadata.queries[0].recordsReturned).toBe(2500);
        });

        test('should record HubSpot API query', () => {
            generator.recordQuery({
                platform: 'HubSpot',
                queryType: 'HubSpot API',
                query: 'GET /crm/v3/objects/deals',
                purpose: 'Retrieve all deals',
                recordsReturned: 1000
            });

            expect(generator.metadata.queries[0].platform).toBe('HubSpot');
        });

        test('should auto-add timestamp', () => {
            generator.recordQuery({
                platform: 'Salesforce',
                query: 'SELECT Id FROM Account'
            });

            expect(generator.metadata.queries[0].timestamp).toBeDefined();
        });

        test('should default queryType to SOQL', () => {
            generator.recordQuery({
                platform: 'Salesforce',
                query: 'SELECT Id FROM Lead'
            });

            expect(generator.metadata.queries[0].queryType).toBe('SOQL');
        });
    });

    // ============================================
    // Assumption Recording Tests
    // ============================================
    describe('recordAssumption()', () => {
        test('should record assumption with rationale', () => {
            generator.recordAssumption(
                'Currency values are in USD',
                'All monetary values converted for consistency'
            );

            expect(generator.metadata.assumptions).toHaveLength(1);
            expect(generator.metadata.assumptions[0].assumption).toBe('Currency values are in USD');
            expect(generator.metadata.assumptions[0].rationale).toBe('All monetary values converted for consistency');
        });

        test('should record assumption without rationale', () => {
            generator.recordAssumption('Fiscal year aligns with calendar year');

            expect(generator.metadata.assumptions[0].rationale).toBeNull();
        });

        test('should add timestamp', () => {
            generator.recordAssumption('Test assumption');
            expect(generator.metadata.assumptions[0].timestamp).toBeDefined();
        });

        test('should allow multiple assumptions', () => {
            generator.recordAssumption('Assumption 1');
            generator.recordAssumption('Assumption 2');
            generator.recordAssumption('Assumption 3');

            expect(generator.metadata.assumptions).toHaveLength(3);
        });
    });

    // ============================================
    // Exclusion Recording Tests
    // ============================================
    describe('recordExclusion()', () => {
        test('should record exclusion with reason', () => {
            generator.recordExclusion(
                'Test opportunities',
                'Not representative of actual business'
            );

            expect(generator.metadata.exclusions).toHaveLength(1);
            expect(generator.metadata.exclusions[0].exclusion).toBe('Test opportunities');
            expect(generator.metadata.exclusions[0].reason).toBe('Not representative of actual business');
        });

        test('should record exclusion without reason', () => {
            generator.recordExclusion('Internal transactions');

            expect(generator.metadata.exclusions[0].reason).toBeNull();
        });

        test('should add timestamp', () => {
            generator.recordExclusion('Test exclusion');
            expect(generator.metadata.exclusions[0].timestamp).toBeDefined();
        });
    });

    // ============================================
    // Benchmark Source Recording Tests
    // ============================================
    describe('recordBenchmarkSource()', () => {
        test('should record benchmark source', () => {
            generator.recordBenchmarkSource('KeyBanc 2024 SaaS Survey');

            expect(generator.metadata.benchmarkSources).toHaveLength(1);
            expect(generator.metadata.benchmarkSources[0]).toBe('KeyBanc 2024 SaaS Survey');
        });

        test('should not duplicate sources', () => {
            generator.recordBenchmarkSource('Source A');
            generator.recordBenchmarkSource('Source A');
            generator.recordBenchmarkSource('Source A');

            expect(generator.metadata.benchmarkSources).toHaveLength(1);
        });

        test('should allow multiple unique sources', () => {
            generator.recordBenchmarkSource('Source A');
            generator.recordBenchmarkSource('Source B');
            generator.recordBenchmarkSource('Source C');

            expect(generator.metadata.benchmarkSources).toHaveLength(3);
        });
    });

    // ============================================
    // Markdown Generation Tests
    // ============================================
    describe('generate() - Markdown', () => {
        beforeEach(() => {
            generator.options.outputFormat = 'markdown';
            setupTestData(generator);
        });

        test('should generate markdown with header', () => {
            const output = generator.generate({});
            expect(output).toContain('# Appendix: Report Methodology');
        });

        test('should include data sources section', () => {
            const output = generator.generate({});
            expect(output).toContain('## Data Sources');
            expect(output).toContain('Salesforce - Opportunity');
            expect(output).toContain('**Records Retrieved**');
        });

        test('should include metrics section', () => {
            const output = generator.generate({});
            expect(output).toContain('## Metrics & Formulas');
            expect(output).toContain('**Formula**');
        });

        test('should include assumptions section', () => {
            const output = generator.generate({});
            expect(output).toContain('## Assumptions');
            expect(output).toContain('Currency values are in USD');
        });

        test('should include exclusions section', () => {
            const output = generator.generate({});
            expect(output).toContain('## Data Exclusions');
            expect(output).toContain('Test records');
        });

        test('should include queries when enabled', () => {
            generator.options.includeQueries = true;
            const output = generator.generate({});
            expect(output).toContain('## Query Reference');
            expect(output).toContain('```sql');
        });

        test('should exclude queries when disabled', () => {
            generator.options.includeQueries = false;
            const output = generator.generate({});
            expect(output).not.toContain('## Query Reference');
        });

        test('should include benchmark sources when enabled', () => {
            generator.options.includeBenchmarks = true;
            const output = generator.generate({});
            expect(output).toContain('## Benchmark Sources');
        });

        test('should include disclaimer', () => {
            const output = generator.generate({});
            expect(output).toContain('## Disclaimer');
            expect(output).toContain('OpsPal by RevPal');
        });

        test('should include report title in context', () => {
            const output = generator.generate({ reportTitle: 'Q4 2024 ARR Report' });
            expect(output).toContain('Q4 2024 ARR Report');
        });

        test('should format date ranges', () => {
            const output = generator.generate({});
            expect(output).toContain('2024-01-01 to 2024-12-31');
        });
    });

    // ============================================
    // JSON Generation Tests
    // ============================================
    describe('generate() - JSON', () => {
        beforeEach(() => {
            generator.options.outputFormat = 'json';
            setupTestData(generator);
        });

        test('should generate valid JSON', () => {
            const output = generator.generate({});
            expect(() => JSON.parse(output)).not.toThrow();
        });

        test('should include all sections in JSON', () => {
            const output = generator.generate({ reportTitle: 'Test Report' });
            const parsed = JSON.parse(output);

            expect(parsed.generatedAt).toBeDefined();
            expect(parsed.reportContext.reportTitle).toBe('Test Report');
            expect(parsed.dataSources).toHaveLength(1);
            expect(parsed.kpis).toHaveLength(1);
            expect(parsed.assumptions).toHaveLength(1);
            expect(parsed.exclusions).toHaveLength(1);
        });

        test('should exclude queries when disabled', () => {
            generator.options.includeQueries = false;
            const output = generator.generate({});
            const parsed = JSON.parse(output);

            expect(parsed.queries).toBeUndefined();
        });

        test('should include queries when enabled', () => {
            generator.options.includeQueries = true;
            const output = generator.generate({});
            const parsed = JSON.parse(output);

            expect(parsed.queries).toBeDefined();
            expect(parsed.queries).toHaveLength(1);
        });
    });

    // ============================================
    // HTML Generation Tests
    // ============================================
    describe('generate() - HTML', () => {
        beforeEach(() => {
            generator.options.outputFormat = 'html';
            setupTestData(generator);
        });

        test('should generate valid HTML structure', () => {
            const output = generator.generate({});
            expect(output).toContain('<!DOCTYPE html>');
            expect(output).toContain('<html>');
            expect(output).toContain('</html>');
            expect(output).toContain('<head>');
            expect(output).toContain('<body>');
        });

        test('should include styles', () => {
            const output = generator.generate({});
            expect(output).toContain('<style>');
            expect(output).toContain('font-family');
        });

        test('should convert markdown headers to HTML', () => {
            const output = generator.generate({});
            expect(output).toContain('<h1>');
            expect(output).toContain('<h2>');
        });

        test('should include title in HTML', () => {
            const output = generator.generate({});
            expect(output).toContain('<title>Report Methodology</title>');
        });
    });

    // ============================================
    // Value Formatting Tests
    // ============================================
    describe('_formatValue()', () => {
        test('should format currency values', () => {
            const result = generator._formatValue(1234567, 'currency');
            expect(result).toBe('$1,234,567');
        });

        test('should format percentage values', () => {
            const result = generator._formatValue(105.5, 'percentage');
            expect(result).toBe('105.5%');
        });

        test('should format ratio values', () => {
            const result = generator._formatValue(3.5, 'ratio');
            expect(result).toBe('3.50:1');
        });

        test('should format days', () => {
            const result = generator._formatValue(45.7, 'days');
            expect(result).toBe('46 days');
        });

        test('should format months', () => {
            const result = generator._formatValue(12.5, 'months');
            expect(result).toBe('12.5 months');
        });

        test('should format currency per day', () => {
            const result = generator._formatValue(5000, 'currency_per_day');
            expect(result).toBe('$5,000/day');
        });

        test('should handle null values', () => {
            const result = generator._formatValue(null, 'currency');
            expect(result).toBe('N/A');
        });

        test('should handle undefined values', () => {
            const result = generator._formatValue(undefined, 'currency');
            expect(result).toBe('N/A');
        });

        test('should handle unknown units', () => {
            const result = generator._formatValue(100, 'unknown');
            expect(result).toBe('100');
        });
    });

    // ============================================
    // Reset Tests
    // ============================================
    describe('reset()', () => {
        test('should clear all metadata', () => {
            setupTestData(generator);

            generator.reset();

            expect(generator.metadata.dataSources).toEqual([]);
            expect(generator.metadata.kpis).toEqual([]);
            expect(generator.metadata.queries).toEqual([]);
            expect(generator.metadata.assumptions).toEqual([]);
            expect(generator.metadata.exclusions).toEqual([]);
            expect(generator.metadata.benchmarkSources).toEqual([]);
        });
    });

    // ============================================
    // File Save Tests
    // ============================================
    describe('saveToFile()', () => {
        const testOutputPath = '/tmp/test-methodology.md';

        afterEach(() => {
            // Cleanup test file
            try {
                fs.unlinkSync(testOutputPath);
            } catch (e) {
                // File may not exist
            }
        });

        test('should save markdown to file', () => {
            setupTestData(generator);
            const result = generator.saveToFile(testOutputPath, {});

            expect(result).toBe(testOutputPath);
            expect(fs.existsSync(testOutputPath)).toBe(true);
        });

        test('should save correct content', () => {
            setupTestData(generator);
            generator.saveToFile(testOutputPath, { reportTitle: 'Test' });

            const content = fs.readFileSync(testOutputPath, 'utf8');
            expect(content).toContain('# Appendix: Report Methodology');
        });
    });

    // ============================================
    // Helper Function Tests
    // ============================================
    describe('createStandardGenerator()', () => {
        test('should create generator with standard assumptions', async () => {
            const standardGen = createStandardGenerator();

            expect(standardGen.metadata.assumptions.length).toBeGreaterThan(0);
            expect(standardGen.metadata.assumptions.some(
                a => a.assumption.includes('USD')
            )).toBe(true);
        });

        test('should accept custom options', async () => {
            const standardGen = createStandardGenerator({ outputFormat: 'json' });

            expect(standardGen.options.outputFormat).toBe('json');
        });
    });

    describe('generateQuickSummary()', () => {
        test('should generate brief summary', () => {
            const kpis = [
                { name: 'ARR', formula: 'MRR × 12' },
                { name: 'NRR', formula: '(Start + Expansion - Churn) / Start' }
            ];
            const dataSources = [
                { platform: 'Salesforce', object: 'Opportunity', recordCount: 1000 },
                { platform: 'HubSpot', object: 'deals', recordCount: 500 }
            ];

            const summary = generateQuickSummary(kpis, dataSources);

            expect(summary).toContain('**Data Sources**');
            expect(summary).toContain('Salesforce Opportunity');
            expect(summary).toContain('**Metrics Calculated**');
            expect(summary).toContain('ARR');
        });

        test('should handle empty inputs', () => {
            const summary = generateQuickSummary([], []);

            expect(summary).toContain('**Data Sources**');
            expect(summary).toContain('**Metrics Calculated**');
        });
    });

    // ============================================
    // Edge Cases
    // ============================================
    describe('Edge Cases', () => {
        test('should handle generation with no data', () => {
            const output = generator.generate({});

            expect(output).toContain('# Appendix: Report Methodology');
            expect(output).toContain('## Disclaimer');
        });

        test('should handle special characters in assumptions', () => {
            generator.recordAssumption(
                "O'Reilly's data was filtered using \"special\" criteria",
                'Special chars: <>&'
            );

            const output = generator.generate({});
            expect(output).toContain("O'Reilly");
        });

        test('should handle very long queries', () => {
            const longQuery = 'SELECT ' + Array(100).fill('Field__c').join(', ') + ' FROM Opportunity';
            generator.recordQuery({
                platform: 'Salesforce',
                query: longQuery,
                recordsReturned: 1000
            });

            const output = generator.generate({});
            expect(output).toContain('```sql');
        });

        test('should handle large record counts', () => {
            generator.recordDataSource({
                platform: 'Salesforce',
                object: 'Opportunity',
                recordCount: 1000000000
            });

            const output = generator.generate({});
            expect(output).toContain('1,000,000,000');
        });

        test('should handle missing date range', () => {
            generator.recordDataSource({
                platform: 'Salesforce',
                object: 'Account',
                recordCount: 100
            });

            const output = generator.generate({});
            expect(output).not.toContain('**Date Range**');
        });

        test('should handle zero record count', () => {
            generator.recordDataSource({
                platform: 'Salesforce',
                object: 'Lead',
                recordCount: 0
            });

            const output = generator.generate({});
            expect(output).toContain('0');
        });
    });

    // ============================================
    // Integration Tests
    // ============================================
    describe('Integration', () => {
        test('should generate complete methodology for typical report', () => {
            // Simulate a typical report workflow
            generator.recordDataSource({
                platform: 'Salesforce',
                object: 'Opportunity',
                fields: ['Amount', 'CloseDate', 'Type', 'StageName'],
                recordCount: 2847,
                dateRange: { start: '2024-10-01', end: '2024-12-31' },
                filter: 'IsWon = true'
            });

            generator.recordDataSource({
                platform: 'Salesforce',
                object: 'Account',
                fields: ['Id', 'Name', 'Type'],
                recordCount: 523
            });

            generator.recordKPICalculation({
                kpiId: 'ARR',
                inputValues: { MRR: 350000 },
                calculatedValue: 4200000,
                unit: 'currency',
                calculationSteps: [
                    'Sum Opportunity.Amount for renewals',
                    'Calculate MRR = Total / 3 months',
                    'ARR = MRR × 12'
                ]
            });

            generator.recordKPICalculation({
                kpiId: 'NRR',
                inputValues: {
                    startingMRR: 320000,
                    expansion: 45000,
                    contraction: 8000,
                    churn: 22000
                },
                calculatedValue: 104.7,
                unit: 'percentage'
            });

            generator.recordAssumption('Currency values are in USD');
            generator.recordAssumption('Fiscal calendar matches standard calendar');
            generator.recordExclusion('Test opportunities', 'Not representative of actual business');

            generator.recordQuery({
                platform: 'Salesforce',
                queryType: 'SOQL',
                query: 'SELECT Amount FROM Opportunity WHERE IsWon = true',
                purpose: 'Retrieve closed-won opportunities',
                recordsReturned: 2847,
                executionTime: 1250
            });

            generator.recordBenchmarkSource('KeyBanc 2024 SaaS Survey');
            generator.recordBenchmarkSource('OpenView Partners');

            const output = generator.generate({
                reportTitle: 'Q4 2024 Revenue Analysis',
                author: 'RevOps Team'
            });

            // Verify completeness
            expect(output).toContain('Q4 2024 Revenue Analysis');
            expect(output).toContain('Data Sources');
            expect(output).toContain('Metrics & Formulas');
            expect(output).toContain('Assumptions');
            expect(output).toContain('Data Exclusions');
            expect(output).toContain('Query Reference');
            expect(output).toContain('Benchmark Sources');
            expect(output).toContain('Disclaimer');
        });
    });
});

// ============================================
// Helper Functions
// ============================================

function setupTestData(generator) {
    generator.recordDataSource({
        platform: 'Salesforce',
        object: 'Opportunity',
        fields: ['Amount', 'CloseDate'],
        recordCount: 1000,
        dateRange: { start: '2024-01-01', end: '2024-12-31' },
        filter: 'IsWon = true'
    });

    generator.recordKPICalculation({
        kpiId: 'ARR',
        inputValues: { MRR: 100000 },
        calculatedValue: 1200000,
        unit: 'currency'
    });

    generator.recordAssumption('Currency values are in USD', 'For consistency');
    generator.recordExclusion('Test records', 'Not actual business');

    generator.recordQuery({
        platform: 'Salesforce',
        queryType: 'SOQL',
        query: 'SELECT Amount FROM Opportunity WHERE IsWon = true',
        purpose: 'Get revenue',
        recordsReturned: 1000
    });

    generator.recordBenchmarkSource('Test Benchmark 2024');
}
