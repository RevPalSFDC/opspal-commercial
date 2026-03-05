/**
 * Performance Tests for RevOps Reporting
 * Phase 6: Comprehensive QA Plan
 *
 * Tests performance benchmarks for:
 * - Large dataset handling
 * - Calculation speed
 * - Memory efficiency
 */

const { BenchmarkEngine } = require('../../sales-benchmark-engine');
const { RevOpsKPIKnowledgeBase } = require('../../revops-kpi-knowledge-base');
const { TrendAnalysisEngine } = require('../../trend-analysis-engine');
const { KPIForecaster } = require('../../kpi-forecaster');
const { CohortAnalysisEngine } = require('../../cohort-analysis-engine');

describe('Performance Tests', () => {
    // Generate large datasets for testing
    function generateTimeSeriesData(count) {
        const data = [];
        const baseDate = new Date('2023-01-01');
        let value = 1000000; // $1M starting value

        for (let i = 0; i < count; i++) {
            const date = new Date(baseDate);
            date.setDate(date.getDate() + i);

            // Add some randomness with trend
            value = value * (1 + (Math.random() * 0.1 - 0.03));

            data.push({
                date: date.toISOString().split('T')[0],
                value: Math.round(value),
                period: `M${Math.floor(i / 30) + 1}`
            });
        }
        return data;
    }

    function generateOpportunities(count) {
        const opportunities = [];
        const stages = ['Prospecting', 'Qualification', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost'];
        const segments = ['Enterprise', 'Mid-Market', 'SMB'];

        for (let i = 0; i < count; i++) {
            const closeDate = new Date('2024-01-01');
            closeDate.setDate(closeDate.getDate() + Math.floor(Math.random() * 365));

            const stage = stages[Math.floor(Math.random() * stages.length)];
            const isWon = stage === 'Closed Won';
            const isClosed = stage.startsWith('Closed');

            opportunities.push({
                Id: `006${String(i).padStart(12, '0')}`,
                Amount: Math.floor(Math.random() * 500000) + 10000,
                CloseDate: closeDate.toISOString().split('T')[0],
                StageName: stage,
                IsWon: isWon,
                IsClosed: isClosed,
                Segment__c: segments[Math.floor(Math.random() * segments.length)],
                CreatedDate: new Date(closeDate.getTime() - Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString()
            });
        }
        return opportunities;
    }

    describe('Benchmark Engine Performance', () => {
        let benchmark;

        beforeAll(() => {
            benchmark = new BenchmarkEngine();
        });

        test('should initialize benchmark engine in < 100ms', () => {
            const start = Date.now();
            new BenchmarkEngine();
            const duration = Date.now() - start;

            expect(duration).toBeLessThan(100);
        });

        test('should compare 1000 metrics in < 500ms', () => {
            const metrics = [];
            for (let i = 0; i < 1000; i++) {
                metrics.push({
                    arr: 10000000 + Math.random() * 5000000,
                    nrr: 95 + Math.random() * 20,
                    grr: 85 + Math.random() * 10,
                    cac: 5000 + Math.random() * 10000
                });
            }

            const start = Date.now();
            for (const metric of metrics) {
                benchmark.compareToBenchmarks(metric);
            }
            const duration = Date.now() - start;

            expect(duration).toBeLessThan(500);
        });

        test('should handle efficiency metrics comparison for 1000 orgs in < 1s', () => {
            const start = Date.now();

            for (let i = 0; i < 1000; i++) {
                benchmark.compareEfficiencyMetrics({
                    magic_number: 0.5 + Math.random() * 1,
                    burn_multiple: 1 + Math.random() * 3,
                    rule_of_40: 20 + Math.random() * 40
                }, { stage: 'seriesB' });
            }

            const duration = Date.now() - start;
            expect(duration).toBeLessThan(1000);
        });
    });

    describe('KPI Knowledge Base Performance', () => {
        let kb;

        beforeAll(() => {
            kb = new RevOpsKPIKnowledgeBase();
        });

        test('should initialize knowledge base in < 200ms', () => {
            const start = Date.now();
            new RevOpsKPIKnowledgeBase();
            const duration = Date.now() - start;

            expect(duration).toBeLessThan(200);
        });

        test('should retrieve 10000 KPIs in < 500ms', () => {
            // Collect all KPI IDs using getCategories + getKPIsByCategory
            const categories = kb.getCategories();
            const kpiIds = [];
            for (const categoryId of Object.keys(categories)) {
                const categoryKpis = kb.getKPIsByCategory(categoryId);
                kpiIds.push(...categoryKpis.map(k => k.id));
            }

            const start = Date.now();
            for (let i = 0; i < 10000; i++) {
                const randomId = kpiIds[Math.floor(Math.random() * kpiIds.length)];
                kb.getKPI(randomId);
            }
            const duration = Date.now() - start;

            expect(duration).toBeLessThan(500);
        });

        test('should recommend KPIs for 1000 goals in < 300ms', () => {
            const goals = ['revenue', 'retention', 'efficiency', 'pipeline', 'growth'];

            const start = Date.now();
            for (let i = 0; i < 1000; i++) {
                const goal = goals[Math.floor(Math.random() * goals.length)];
                kb.recommendKPIsForGoal(goal);
            }
            const duration = Date.now() - start;

            expect(duration).toBeLessThan(300);
        });
    });

    describe('Trend Analysis Performance', () => {
        let trendEngine;

        beforeAll(() => {
            trendEngine = new TrendAnalysisEngine();
        });

        test('should analyze trend on 365 data points in < 200ms', () => {
            const data = generateTimeSeriesData(365);

            const start = Date.now();
            const result = trendEngine.detectTrend(data.map(d => d.value));
            const duration = Date.now() - start;

            expect(duration).toBeLessThan(200);
            expect(result).toBeDefined();
        });

        test('should calculate moving averages for 1000 points in < 100ms', () => {
            const data = generateTimeSeriesData(1000);
            const values = data.map(d => d.value);

            const start = Date.now();
            trendEngine.calculateMovingAverage(values, 7);
            trendEngine.calculateMovingAverage(values, 30);
            trendEngine.calculateMovingAverage(values, 90);
            const duration = Date.now() - start;

            expect(duration).toBeLessThan(100);
        });

        test('should detect anomalies in 1000 points in < 500ms', () => {
            const data = generateTimeSeriesData(1000);

            // Add some anomalies directly to the data objects
            data[250].value *= 2;
            data[500].value *= 0.3;
            data[750].value *= 1.8;

            const start = Date.now();
            const result = trendEngine.detectAnomalies(data);
            const duration = Date.now() - start;

            expect(duration).toBeLessThan(500);
            expect(result.anomalies.length).toBeGreaterThan(0);
        });

        test('should perform YoY comparison for 24 months in < 50ms', () => {
            const currentYear = generateTimeSeriesData(365).map(d => d.value);
            const previousYear = generateTimeSeriesData(365).map(d => d.value);

            const start = Date.now();
            const result = trendEngine.calculateYoY(
                currentYear.reduce((a, b) => a + b, 0),
                previousYear.reduce((a, b) => a + b, 0)
            );
            const duration = Date.now() - start;

            expect(duration).toBeLessThan(50);
            expect(result).toBeDefined();
            expect(typeof result.percentChange).toBe('number');
        });
    });

    describe('KPI Forecaster Performance', () => {
        let forecaster;

        beforeAll(() => {
            forecaster = new KPIForecaster();
        });

        test('should generate 90-day forecast from 365 days data in < 500ms', () => {
            const data = generateTimeSeriesData(365);

            const start = Date.now();
            const result = forecaster.forecast(data, 90, { method: 'linear' });
            const duration = Date.now() - start;

            expect(duration).toBeLessThan(500);
            expect(result.success).toBe(true);
            expect(result.forecasts.length).toBe(90);
        });

        test('should backtest forecast accuracy in < 1s', () => {
            const data = generateTimeSeriesData(365);

            const start = Date.now();
            // Use backtestForecast which handles train/test split internally
            const result = forecaster.backtestForecast(data, 65, { method: 'linear' });
            const duration = Date.now() - start;

            expect(duration).toBeLessThan(1000);
            expect(result.success).toBe(true);
        });

        test('should generate ensemble forecast in < 2s', () => {
            const data = generateTimeSeriesData(365);

            const start = Date.now();
            const result = forecaster.forecast(data, 30, { method: 'ensemble' });
            const duration = Date.now() - start;

            expect(duration).toBeLessThan(2000);
            expect(result.success).toBe(true);
        });
    });

    describe('Cohort Analysis Performance', () => {
        let cohortEngine;

        beforeAll(() => {
            cohortEngine = new CohortAnalysisEngine();
        });

        test('should analyze 10000 records cohorts in < 2s', () => {
            const opportunities = generateOpportunities(10000);

            const start = Date.now();
            const cohorts = cohortEngine.createCohort(opportunities, 'CloseDate', 'monthly');
            const duration = Date.now() - start;

            expect(duration).toBeLessThan(2000);
            expect(cohorts).toBeDefined();
        });

        test('should calculate retention matrix for 12 months in < 1s', () => {
            const opportunities = generateOpportunities(5000);
            const cohorts = cohortEngine.createCohort(opportunities, 'CloseDate', 'monthly');

            const start = Date.now();
            const matrix = cohortEngine.calculateRetentionMatrix(cohorts, 12);
            const duration = Date.now() - start;

            expect(duration).toBeLessThan(1000);
            expect(matrix).toBeDefined();
        });

        test('should identify at-risk cohorts in < 500ms', () => {
            const opportunities = generateOpportunities(5000);
            const cohorts = cohortEngine.createCohort(opportunities, 'CloseDate', 'monthly');
            const retentionMatrix = cohortEngine.calculateRetentionMatrix(cohorts, 6);

            const start = Date.now();
            const atRisk = cohortEngine.identifyAtRiskCohorts(retentionMatrix);
            const duration = Date.now() - start;

            expect(duration).toBeLessThan(500);
            expect(atRisk).toBeDefined();
        });
    });

    describe('Large Dataset Handling', () => {
        test('should handle 50000 opportunities without memory issues', () => {
            const initialMemory = process.memoryUsage().heapUsed;

            const opportunities = generateOpportunities(50000);

            const afterGeneration = process.memoryUsage().heapUsed;
            const memoryIncrease = (afterGeneration - initialMemory) / 1024 / 1024; // MB

            // Should use less than 100MB for 50K records
            expect(memoryIncrease).toBeLessThan(100);
            expect(opportunities.length).toBe(50000);
        });

        test('should process 100000 time series points efficiently', () => {
            const initialMemory = process.memoryUsage().heapUsed;

            const data = generateTimeSeriesData(100000);

            const afterGeneration = process.memoryUsage().heapUsed;
            const memoryIncrease = (afterGeneration - initialMemory) / 1024 / 1024; // MB

            // Should use less than 50MB for 100K points
            expect(memoryIncrease).toBeLessThan(50);
            expect(data.length).toBe(100000);
        });
    });

    describe('Concurrent Operations', () => {
        test('should handle 10 concurrent benchmark comparisons', async () => {
            const benchmark = new BenchmarkEngine();

            const operations = [];
            for (let i = 0; i < 10; i++) {
                operations.push(
                    new Promise(resolve => {
                        const result = benchmark.compareToBenchmarks({
                            arr: 10000000 + i * 1000000,
                            nrr: 100 + i,
                            grr: 90 + i / 2
                        });
                        resolve(result);
                    })
                );
            }

            const start = Date.now();
            const results = await Promise.all(operations);
            const duration = Date.now() - start;

            expect(duration).toBeLessThan(200);
            expect(results.length).toBe(10);
            expect(results.every(r => r !== null)).toBe(true);
        });

        test('should handle 10 concurrent KPI lookups', async () => {
            const kb = new RevOpsKPIKnowledgeBase();
            const kpiIds = ['arr', 'nrr', 'grr', 'cac', 'ltv', 'MagicNumber', 'BurnMultiple'];

            const operations = kpiIds.map(id =>
                new Promise(resolve => {
                    const result = kb.getKPI(id);
                    resolve(result);
                })
            );

            const start = Date.now();
            const results = await Promise.all(operations);
            const duration = Date.now() - start;

            expect(duration).toBeLessThan(100);
            expect(results.filter(r => r !== null).length).toBeGreaterThan(0);
        });
    });

    describe('Regression Performance Baselines', () => {
        // These tests establish performance baselines for regression detection

        test('baseline: benchmark comparison should complete in < 10ms', () => {
            const benchmark = new BenchmarkEngine();

            const iterations = 100;
            const start = Date.now();

            for (let i = 0; i < iterations; i++) {
                benchmark.compareToBenchmarks({
                    arr: 12500000,
                    nrr: 112,
                    grr: 92
                });
            }

            const duration = Date.now() - start;
            const avgTime = duration / iterations;

            expect(avgTime).toBeLessThan(10);
        });

        test('baseline: KPI retrieval should complete in < 1ms', () => {
            const kb = new RevOpsKPIKnowledgeBase();

            const iterations = 1000;
            const start = Date.now();

            for (let i = 0; i < iterations; i++) {
                kb.getKPI('arr');
            }

            const duration = Date.now() - start;
            const avgTime = duration / iterations;

            expect(avgTime).toBeLessThan(1);
        });

        test('baseline: trend detection should complete in < 5ms per 100 points', () => {
            const trendEngine = new TrendAnalysisEngine();
            const data = generateTimeSeriesData(100).map(d => d.value);

            const iterations = 100;
            const start = Date.now();

            for (let i = 0; i < iterations; i++) {
                trendEngine.detectTrend(data);
            }

            const duration = Date.now() - start;
            const avgTime = duration / iterations;

            expect(avgTime).toBeLessThan(5);
        });
    });
});
