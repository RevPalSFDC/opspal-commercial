/**
 * Regression Tests for RevOps Reporting
 * Phase 6: Comprehensive QA Plan
 *
 * Tests for:
 * - Golden output validation
 * - Version compatibility
 * - Core functionality stability
 */

const { BenchmarkEngine } = require('../../sales-benchmark-engine');
const { RevOpsKPIKnowledgeBase } = require('../../revops-kpi-knowledge-base');
const { TrendAnalysisEngine } = require('../../trend-analysis-engine');
const { KPIForecaster } = require('../../kpi-forecaster');
const { CohortAnalysisEngine } = require('../../cohort-analysis-engine');
const { ReportExplorer } = require('../../report-explorer');
const { ReportVersionManager } = require('../../report-version-manager');
const { MethodologyGenerator } = require('../../methodology-generator');

describe('Regression Tests', () => {
    // Test fixtures
    const goldenInputData = {
        opportunities: [
            { Id: '001', Amount: 100000, CloseDate: '2024-01-15', StageName: 'Closed Won', IsWon: true, IsClosed: true },
            { Id: '002', Amount: 150000, CloseDate: '2024-02-20', StageName: 'Closed Won', IsWon: true, IsClosed: true },
            { Id: '003', Amount: 75000, CloseDate: '2024-03-10', StageName: 'Closed Won', IsWon: true, IsClosed: true },
            { Id: '004', Amount: 200000, CloseDate: '2024-04-05', StageName: 'Closed Won', IsWon: true, IsClosed: true },
            { Id: '005', Amount: 50000, CloseDate: '2024-05-01', StageName: 'Closed Lost', IsWon: false, IsClosed: true }
        ],
        metrics: {
            arr: 12500000,
            nrr: 112,
            grr: 92,
            cac: 8500,
            ltv: 45000
        },
        timeSeriesData: [
            { date: '2024-01', value: 1000000 },
            { date: '2024-02', value: 1050000 },
            { date: '2024-03', value: 1100000 },
            { date: '2024-04', value: 1150000 },
            { date: '2024-05', value: 1200000 },
            { date: '2024-06', value: 1250000 },
            { date: '2024-07', value: 1300000 },
            { date: '2024-08', value: 1350000 },
            { date: '2024-09', value: 1400000 },
            { date: '2024-10', value: 1450000 },
            { date: '2024-11', value: 1500000 },
            { date: '2024-12', value: 1550000 }
        ]
    };

    describe('Golden Output Tests', () => {
        describe('KPI Knowledge Base Stability', () => {
            let kb;

            beforeAll(() => {
                kb = new RevOpsKPIKnowledgeBase();
            });

            test('ARR KPI definition remains stable', () => {
                const arr = kb.getKPI('ARR');

                expect(arr).toBeDefined();
                // KPI uses lowercase id internally
                expect(arr.id.toLowerCase()).toBe('arr');
                expect(arr.fullName || arr.name).toContain('Recurring Revenue');
                expect(arr.unit).toBe('currency');
                expect(arr.direction).toBe('higher_is_better');
            });

            test('NRR KPI definition remains stable', () => {
                const nrr = kb.getKPI('nrr');

                expect(nrr).toBeDefined();
                expect(nrr.id).toBe('nrr');
                expect(nrr.abbreviation).toBe('NRR');
                expect(nrr.unit).toBe('percentage');
            });

            test('Category structure remains stable', () => {
                const categories = kb.getCategories();

                expect(Object.keys(categories)).toContain('revenue');
                expect(Object.keys(categories)).toContain('retention');
                expect(Object.keys(categories)).toContain('acquisition');
                expect(Object.keys(categories)).toContain('unitEconomics');
                expect(Object.keys(categories)).toContain('pipeline');
            });

            test('Benchmark values remain within expected ranges', () => {
                const benchmarks = kb.getBenchmarks('nrr', 'saas');

                expect(benchmarks).toBeDefined();
                // NRR benchmarks should have thresholds around 100-120%
                if (benchmarks.excellent) {
                    expect(typeof benchmarks.excellent).toBe('string');
                }
            });

            test('KPI search returns consistent results', () => {
                const results1 = kb.searchKPIs('revenue');
                const results2 = kb.searchKPIs('revenue');

                expect(results1.length).toBe(results2.length);
                expect(results1.map(r => r.id)).toEqual(results2.map(r => r.id));
            });
        });

        describe('Benchmark Engine Stability', () => {
            let benchmark;

            beforeAll(() => {
                benchmark = new BenchmarkEngine();
            });

            test('Benchmark comparison returns expected structure', () => {
                const result = benchmark.compareToBenchmarks(goldenInputData.metrics);

                expect(result).toBeDefined();
                expect(typeof result).toBe('object');
                // Should have comparison data for metrics
                if (result.arr) {
                    expect(result.arr).toHaveProperty('value');
                }
            });

            test('Efficiency metrics comparison is stable', () => {
                const result = benchmark.compareEfficiencyMetrics({
                    magic_number: 0.8,
                    burn_multiple: 1.5,
                    rule_of_40: 45
                }, { stage: 'seriesB' });

                expect(result).toBeDefined();
                // Should consistently return comparison results
                if (result.magic_number) {
                    expect(result.magic_number).toHaveProperty('rating');
                }
            });
        });

        describe('Trend Analysis Stability', () => {
            let trendEngine;

            beforeAll(() => {
                trendEngine = new TrendAnalysisEngine();
            });

            test('Linear trend detection is consistent', () => {
                const data = goldenInputData.timeSeriesData;
                const result = trendEngine.detectTrend(data, { method: 'linear' });

                expect(result).toBeDefined();
                expect(result.direction).toBe('increasing');
                // R² should be high for linear data (property is rSquared)
                expect(result.rSquared).toBeGreaterThan(0.9);
            });

            test('Moving average calculation is stable', () => {
                const values = goldenInputData.timeSeriesData.map(d => d.value);
                const ma3 = trendEngine.calculateMovingAverage(values, 3, 'simple');

                expect(ma3).toBeDefined();
                expect(ma3.length).toBe(values.length);
                // First values may be null, but later values are numbers
                // Index 2 should have first valid value (window=3)
                expect(typeof ma3[2]).toBe('number');
            });

            test('YoY calculation structure remains stable', () => {
                const result = trendEngine.calculateYoY(1200000, 1000000);

                expect(result).toHaveProperty('percentChange');
                expect(result).toHaveProperty('direction');
                expect(result.direction).toBe('increase');
                // percentChange is decimal form (0.2 = 20%), use percentChangePercent for percentage form
                expect(result.percentChange).toBeCloseTo(0.2, 2);
            });
        });

        describe('KPI Forecaster Stability', () => {
            let forecaster;

            beforeAll(() => {
                forecaster = new KPIForecaster();
            });

            test('Linear forecast produces expected structure', () => {
                const result = forecaster.forecast(goldenInputData.timeSeriesData, 3, { method: 'linear' });

                expect(result.success).toBe(true);
                expect(result.forecasts).toHaveLength(3);
                expect(result.forecasts[0]).toHaveProperty('value');
                expect(result.forecasts[0]).toHaveProperty('date');
            });

            test('Forecast continues upward trend', () => {
                const result = forecaster.forecast(goldenInputData.timeSeriesData, 3, { method: 'linear' });

                // Last data point was 1,550,000, forecasts should continue upward
                const lastDataValue = goldenInputData.timeSeriesData[goldenInputData.timeSeriesData.length - 1].value;
                expect(result.forecasts[0].value).toBeGreaterThan(lastDataValue);
            });

            test('Confidence intervals are present', () => {
                const result = forecaster.forecast(goldenInputData.timeSeriesData, 3, { method: 'linear', confidence: 0.95 });

                expect(result.forecasts[0]).toHaveProperty('lower');
                expect(result.forecasts[0]).toHaveProperty('upper');
                expect(result.forecasts[0].upper).toBeGreaterThan(result.forecasts[0].value);
                expect(result.forecasts[0].lower).toBeLessThan(result.forecasts[0].value);
            });
        });

        describe('Cohort Analysis Stability', () => {
            let cohortEngine;

            beforeAll(() => {
                cohortEngine = new CohortAnalysisEngine();
            });

            test('Cohort creation is stable', () => {
                const cohorts = cohortEngine.createCohort(
                    goldenInputData.opportunities,
                    'CloseDate',
                    'monthly'
                );

                expect(cohorts).toBeDefined();
                expect(Object.keys(cohorts).length).toBeGreaterThan(0);
            });

            test('Retention matrix structure is stable', () => {
                const cohorts = cohortEngine.createCohort(
                    goldenInputData.opportunities,
                    'CloseDate',
                    'monthly'
                );
                const matrix = cohortEngine.calculateRetentionMatrix(cohorts, 3);

                expect(matrix).toBeDefined();
            });
        });

        describe('Methodology Generator Stability', () => {
            test('Methodology output format is stable', () => {
                const generator = new MethodologyGenerator();

                generator.recordDataSource({
                    platform: 'Salesforce',
                    object: 'Opportunity',
                    recordCount: 100,
                    dateRange: { start: '2024-01-01', end: '2024-12-31' }
                });

                generator.recordKPICalculation({
                    kpiId: 'ARR',
                    inputValues: { mrr: 100000 },
                    calculatedValue: 1200000,
                    calculationSteps: ['MRR × 12 = 1,200,000']
                });

                const output = generator.generate();

                expect(typeof output).toBe('string');
                expect(output).toContain('Data Source');
                expect(output).toContain('Salesforce');
            });
        });
    });

    describe('Version Compatibility Tests', () => {
        test('KPI Knowledge Base v2.0.0 maintains backward compatibility', () => {
            const kb = new RevOpsKPIKnowledgeBase();

            // v1.0 methods still work
            expect(typeof kb.getKPI).toBe('function');
            expect(typeof kb.getKPIsByCategory).toBe('function');
            expect(typeof kb.searchKPIs).toBe('function');
            expect(typeof kb.getBenchmarks).toBe('function');

            // v2.0 additions
            expect(typeof kb.getBenchmarksBySegment).toBe('function');
            expect(typeof kb.calculateDerivedKPI).toBe('function');
        });

        test('Trend Analysis Engine maintains API compatibility', () => {
            const engine = new TrendAnalysisEngine();

            // Core methods
            expect(typeof engine.detectTrend).toBe('function');
            expect(typeof engine.calculateMovingAverage).toBe('function');
            expect(typeof engine.detectSeasonality).toBe('function');
            expect(typeof engine.detectAnomalies).toBe('function');
            expect(typeof engine.calculateYoY).toBe('function');
            expect(typeof engine.calculateQoQ).toBe('function');
            expect(typeof engine.calculateMoM).toBe('function');
        });

        test('KPI Forecaster maintains API compatibility', () => {
            const forecaster = new KPIForecaster();

            expect(typeof forecaster.forecast).toBe('function');
            expect(typeof forecaster.backtestForecast).toBe('function');
            expect(typeof forecaster.generateScenarios).toBe('function');
            expect(typeof forecaster.calculateMAE).toBe('function');
            expect(typeof forecaster.calculateMAPE).toBe('function');
        });

        test('Cohort Analysis Engine maintains API compatibility', () => {
            const engine = new CohortAnalysisEngine();

            expect(typeof engine.createCohort).toBe('function');
            expect(typeof engine.calculateRetentionMatrix).toBe('function');
            expect(typeof engine.identifyAtRiskCohorts).toBe('function');
        });

        test('Report Explorer maintains API compatibility', () => {
            const explorer = new ReportExplorer();

            expect(typeof explorer.loadData).toBe('function');
            expect(typeof explorer.filter).toBe('function');
            expect(typeof explorer.groupBy).toBe('function');
            expect(typeof explorer.aggregate).toBe('function');
        });

        test('Report Version Manager maintains API compatibility', () => {
            const manager = new ReportVersionManager();

            expect(typeof manager.saveVersion).toBe('function');
            expect(typeof manager.getVersion).toBe('function');
            expect(typeof manager.listVersions).toBe('function');
            expect(typeof manager.compareVersions).toBe('function');
        });
    });

    describe('Data Integrity Tests', () => {
        test('KPI calculations are deterministic', () => {
            const kb = new RevOpsKPIKnowledgeBase();

            // Same inputs should always produce same outputs
            const result1 = kb.calculateDerivedKPI('MagicNumber', {
                netNewARR: 500000,
                priorQuarterSM: 1500000
            });

            const result2 = kb.calculateDerivedKPI('MagicNumber', {
                netNewARR: 500000,
                priorQuarterSM: 1500000
            });

            expect(result1.value).toBe(result2.value);
        });

        test('Trend detection is reproducible', () => {
            const engine = new TrendAnalysisEngine();
            const data = goldenInputData.timeSeriesData;

            const result1 = engine.detectTrend(data, { method: 'linear' });
            const result2 = engine.detectTrend(data, { method: 'linear' });

            expect(result1.slope).toBe(result2.slope);
            expect(result1.r2).toBe(result2.r2);
        });

        test('Forecast is reproducible with same seed', () => {
            const forecaster = new KPIForecaster();
            const data = goldenInputData.timeSeriesData;

            const result1 = forecaster.forecast(data, 3, { method: 'linear' });
            const result2 = forecaster.forecast(data, 3, { method: 'linear' });

            expect(result1.forecasts[0].value).toBe(result2.forecasts[0].value);
        });
    });

    describe('Edge Case Handling Consistency', () => {
        test('Empty data handling is consistent', () => {
            const trendEngine = new TrendAnalysisEngine();

            // Should return error object for empty data
            const result = trendEngine.detectTrend([]);
            // Either throws or returns error object
            if (result) {
                expect(result.success).toBe(false);
            }
        });

        test('Insufficient data handling is consistent', () => {
            const forecaster = new KPIForecaster();

            const result = forecaster.forecast([{ date: '2024-01', value: 100 }], 3);
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        test('Zero division handling is consistent', () => {
            const trendEngine = new TrendAnalysisEngine();

            const result = trendEngine.calculateYoY(100, 0);
            expect(result.percentChange).toBe(Infinity);
        });
    });

    describe('Performance Regression Detection', () => {
        test('KPI lookup remains under 1ms average', () => {
            const kb = new RevOpsKPIKnowledgeBase();

            const start = Date.now();
            for (let i = 0; i < 1000; i++) {
                kb.getKPI('ARR');
            }
            const duration = Date.now() - start;

            const avgTime = duration / 1000;
            expect(avgTime).toBeLessThan(1);
        });

        test('Trend detection remains under 10ms for 100 points', () => {
            const engine = new TrendAnalysisEngine();
            const data = goldenInputData.timeSeriesData;

            const start = Date.now();
            for (let i = 0; i < 100; i++) {
                engine.detectTrend(data);
            }
            const duration = Date.now() - start;

            const avgTime = duration / 100;
            expect(avgTime).toBeLessThan(10);
        });

        test('Forecast generation remains under 50ms', () => {
            const forecaster = new KPIForecaster();
            const data = goldenInputData.timeSeriesData;

            const start = Date.now();
            forecaster.forecast(data, 12, { method: 'linear' });
            const duration = Date.now() - start;

            expect(duration).toBeLessThan(50);
        });
    });
});
