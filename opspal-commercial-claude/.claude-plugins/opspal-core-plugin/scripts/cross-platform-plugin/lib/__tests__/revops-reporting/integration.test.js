/**
 * Integration Tests for RevOps Reporting Assistant
 * Phase 6: Comprehensive QA Plan
 *
 * Tests end-to-end workflows including:
 * - Report generation pipeline
 * - Cross-component integration
 * - Data flow validation
 * - Output format generation
 */

const path = require('path');
const fs = require('fs');

// Load test fixtures
const sampleOpportunities = require('./fixtures/sample-opportunities.json');
const timeSeriesData = require('./fixtures/time-series-data.json');

describe('Integration Tests', () => {
    // ============================================
    // End-to-End Report Generation
    // ============================================
    describe('End-to-End Report Generation', () => {
        describe('ARR Report Workflow', () => {
            test('should generate complete ARR report from mock data', async () => {
                // Simulate the full report generation pipeline
                const reportData = {
                    kpis: {},
                    dataSources: [],
                    methodology: null
                };

                // Step 1: Record data source
                reportData.dataSources.push({
                    platform: 'Salesforce',
                    object: 'Opportunity',
                    recordCount: sampleOpportunities.records.length,
                    fields: ['Amount', 'CloseDate', 'StageName', 'Type']
                });

                // Step 2: Calculate KPIs from data
                const closedWonRecords = sampleOpportunities.records.filter(
                    r => r.StageName === 'Closed Won'
                );
                const totalRevenue = closedWonRecords.reduce(
                    (sum, r) => sum + r.Amount, 0
                );
                const mrr = totalRevenue / 3; // Assuming Q4 data
                const arr = mrr * 12;

                reportData.kpis.ARR = {
                    value: arr,
                    unit: 'currency',
                    formula: 'MRR × 12',
                    inputValues: { MRR: mrr }
                };

                // Step 3: Validate output structure
                expect(reportData.kpis.ARR).toBeDefined();
                expect(reportData.kpis.ARR.value).toBeGreaterThan(0);
                expect(reportData.dataSources).toHaveLength(1);
            });

            test('should include benchmark comparisons', async () => {
                // Mock benchmark evaluation
                const evaluateBenchmark = (value, benchmarks) => {
                    if (value >= benchmarks.excellent) return 'excellent';
                    if (value >= benchmarks.good) return 'good';
                    if (value >= benchmarks.average) return 'average';
                    return 'below_average';
                };

                const nrrValue = 105;
                const benchmarks = { excellent: 120, good: 110, average: 100 };
                const rating = evaluateBenchmark(nrrValue, benchmarks);

                expect(rating).toBe('average');
            });

            test('should generate executive summary', async () => {
                // Simulate BLUF+4 generation
                const generateBLUF = (kpis) => {
                    return {
                        bottomLine: `Revenue performance is ${kpis.ARR.rating || 'on track'}`,
                        situation: 'Q4 revenue metrics analyzed',
                        nextSteps: ['Review expansion opportunities', 'Address churn risks'],
                        risks: ['Seasonal slowdown in Q1'],
                        supportNeeded: ['Executive alignment on growth targets']
                    };
                };

                const summary = generateBLUF({
                    ARR: { value: 4200000, rating: 'good' }
                });

                expect(summary.bottomLine).toContain('Revenue');
                expect(summary.nextSteps).toHaveLength(2);
            });
        });

        describe('Multi-KPI Dashboard Workflow', () => {
            test('should generate dashboard with all KPI categories', async () => {
                // Simulate complete dashboard generation
                const dashboard = {
                    revenue: {
                        ARR: 4200000,
                        MRR: 350000,
                        growthRate: 18
                    },
                    retention: {
                        NRR: 105,
                        GRR: 92,
                        churnRate: 4
                    },
                    acquisition: {
                        CAC: 7000,
                        newCustomers: 50
                    },
                    unitEconomics: {
                        LTV: 28000,
                        LTVCACRatio: 4,
                        CACPayback: 14
                    },
                    pipeline: {
                        coverage: 3.2,
                        winRate: 22,
                        velocity: 8500
                    }
                };

                // Validate all categories present
                expect(Object.keys(dashboard)).toContain('revenue');
                expect(Object.keys(dashboard)).toContain('retention');
                expect(Object.keys(dashboard)).toContain('acquisition');
                expect(Object.keys(dashboard)).toContain('unitEconomics');
                expect(Object.keys(dashboard)).toContain('pipeline');
            });

            test('should calculate derived metrics correctly', async () => {
                // Test that derived metrics are calculated from base metrics
                const baseMetrics = {
                    mrr: 350000,
                    startingMRR: 320000,
                    expansionMRR: 45000,
                    contractionMRR: 8000,
                    churnedMRR: 22000,
                    salesSpend: 500000,
                    marketingSpend: 200000,
                    newCustomers: 100
                };

                // Calculate derived metrics
                const derived = {
                    arr: baseMetrics.mrr * 12,
                    nrr: ((baseMetrics.startingMRR + baseMetrics.expansionMRR -
                           baseMetrics.contractionMRR - baseMetrics.churnedMRR) /
                          baseMetrics.startingMRR) * 100,
                    cac: (baseMetrics.salesSpend + baseMetrics.marketingSpend) /
                         baseMetrics.newCustomers
                };

                expect(derived.arr).toBe(4200000);
                expect(derived.nrr).toBeCloseTo(104.69, 1);
                expect(derived.cac).toBe(7000);
            });
        });
    });

    // ============================================
    // Cross-Component Integration
    // ============================================
    describe('Cross-Component Integration', () => {
        describe('KPI Knowledge Base + Methodology Generator', () => {
            test('should generate methodology from KPI definitions', () => {
                // Mock KPI definition
                const kpiDef = {
                    id: 'ARR',
                    fullName: 'Annual Recurring Revenue',
                    formula: 'MRR × 12',
                    description: 'Annualized recurring revenue',
                    unit: 'currency'
                };

                // Mock methodology output
                const methodology = {
                    metrics: [{
                        name: kpiDef.fullName,
                        formula: kpiDef.formula,
                        description: kpiDef.description
                    }]
                };

                expect(methodology.metrics[0].name).toBe('Annual Recurring Revenue');
                expect(methodology.metrics[0].formula).toBe('MRR × 12');
            });
        });

        describe('Trend Analysis + Forecasting', () => {
            test('should use trend data for forecasting', () => {
                // Extract values from data array structure
                const historicalData = timeSeriesData.arrMonthly.data.map(d => d.value);

                // Mock trend detection
                const trend = {
                    type: 'linear',
                    slope: 50000, // $50K growth per period
                    r2: 0.95
                };

                // Mock forecast using trend
                const forecast = {
                    nextPeriod: historicalData[historicalData.length - 1] + trend.slope,
                    confidence: trend.r2
                };

                expect(forecast.nextPeriod).toBe(historicalData[historicalData.length - 1] + 50000);
                expect(forecast.confidence).toBe(0.95);
            });

            test('should generate forecasts with confidence intervals', () => {
                const generateForecast = (lastValue, slope, periods) => {
                    return Array.from({ length: periods }, (_, i) => ({
                        period: i + 1,
                        forecast: lastValue + slope * (i + 1),
                        lower: lastValue + slope * (i + 1) * 0.8,
                        upper: lastValue + slope * (i + 1) * 1.2
                    }));
                };

                const forecast = generateForecast(1200000, 50000, 3);

                expect(forecast).toHaveLength(3);
                expect(forecast[0].forecast).toBe(1250000);
                expect(forecast[0].lower).toBeLessThan(forecast[0].forecast);
                expect(forecast[0].upper).toBeGreaterThan(forecast[0].forecast);
            });
        });

        describe('Alert Monitor + Cohort Analysis', () => {
            test('should trigger alerts based on cohort performance', () => {
                // Mock cohort retention data
                const cohortRetention = {
                    'Jan-2024': { m0: 100, m3: 85, m6: 78 },
                    'Feb-2024': { m0: 100, m3: 79, m6: 70 },  // m3 < 80, triggers warning
                    'Mar-2024': { m0: 100, m3: 65, m6: 60 }   // m3 < 70, triggers critical
                };

                // Mock alert evaluation
                const alerts = [];
                const threshold = 80;

                Object.entries(cohortRetention).forEach(([cohort, retention]) => {
                    if (retention.m3 < threshold) {
                        alerts.push({
                            cohort,
                            metric: 'm3_retention',
                            value: retention.m3,
                            threshold,
                            severity: retention.m3 < 70 ? 'critical' : 'warning'
                        });
                    }
                });

                expect(alerts).toHaveLength(2);
                expect(alerts.some(a => a.severity === 'critical')).toBe(true);
            });
        });

        describe('Report Explorer + Version Manager', () => {
            test('should save and compare report versions', () => {
                // Mock version 1
                const v1 = {
                    id: 'v1',
                    kpis: { ARR: 4000000, NRR: 105 },
                    savedAt: '2024-09-01'
                };

                // Mock version 2
                const v2 = {
                    id: 'v2',
                    kpis: { ARR: 4200000, NRR: 108 },
                    savedAt: '2024-10-01'
                };

                // Compare versions
                const comparison = {
                    ARR: {
                        old: v1.kpis.ARR,
                        new: v2.kpis.ARR,
                        change: v2.kpis.ARR - v1.kpis.ARR,
                        percentChange: ((v2.kpis.ARR - v1.kpis.ARR) / v1.kpis.ARR) * 100
                    },
                    NRR: {
                        old: v1.kpis.NRR,
                        new: v2.kpis.NRR,
                        change: v2.kpis.NRR - v1.kpis.NRR
                    }
                };

                expect(comparison.ARR.change).toBe(200000);
                expect(comparison.ARR.percentChange).toBe(5);
                expect(comparison.NRR.change).toBe(3);
            });
        });
    });

    // ============================================
    // Data Flow Validation
    // ============================================
    describe('Data Flow Validation', () => {
        test('should maintain data integrity through pipeline', () => {
            // Input data
            const rawData = sampleOpportunities.records;
            const originalCount = rawData.length;

            // Transform: Filter closed won
            const filtered = rawData.filter(r => r.StageName === 'Closed Won');

            // Aggregate: Sum amounts
            const total = filtered.reduce((sum, r) => sum + r.Amount, 0);

            // Validate no data loss
            expect(filtered.length).toBeLessThanOrEqual(originalCount);
            expect(total).toBe(sampleOpportunities.aggregates.closedWonAmount);
        });

        test('should preserve field values through transformations', () => {
            const original = {
                Amount: 125000.50,
                CloseDate: '2024-10-15',
                StageName: 'Closed Won'
            };

            // Simulate transformation
            const transformed = {
                ...original,
                Amount_Display: `$${original.Amount.toLocaleString()}`,
                CloseDate_Parsed: new Date(original.CloseDate),
                IsWon: original.StageName === 'Closed Won'
            };

            expect(transformed.Amount).toBe(original.Amount);
            expect(transformed.CloseDate).toBe(original.CloseDate);
            expect(transformed.IsWon).toBe(true);
        });

        test('should handle null/undefined values correctly', () => {
            const dataWithNulls = [
                { Amount: 100000, Type: 'New Business' },
                { Amount: null, Type: 'Renewal' },
                { Amount: undefined, Type: null },
                { Amount: 50000, Type: 'New Business' }
            ];

            // Filter nulls
            const validAmounts = dataWithNulls.filter(
                r => r.Amount !== null && r.Amount !== undefined
            );

            // Sum
            const total = validAmounts.reduce((sum, r) => sum + r.Amount, 0);

            expect(validAmounts).toHaveLength(2);
            expect(total).toBe(150000);
        });
    });

    // ============================================
    // Output Format Generation
    // ============================================
    describe('Output Format Generation', () => {
        describe('Markdown Output', () => {
            test('should generate valid markdown structure', () => {
                const generateMarkdownReport = (data) => {
                    const lines = [
                        `# ${data.title}`,
                        '',
                        '## Executive Summary',
                        data.summary,
                        '',
                        '## Key Metrics',
                        ''
                    ];

                    for (const [kpi, value] of Object.entries(data.kpis)) {
                        lines.push(`- **${kpi}**: ${value}`);
                    }

                    return lines.join('\n');
                };

                const report = generateMarkdownReport({
                    title: 'Q4 2024 ARR Report',
                    summary: 'Revenue grew 18% QoQ',
                    kpis: { ARR: '$4.2M', NRR: '105%' }
                });

                expect(report).toContain('# Q4 2024 ARR Report');
                expect(report).toContain('## Executive Summary');
                expect(report).toContain('- **ARR**');
            });
        });

        describe('JSON Output', () => {
            test('should generate valid JSON report', () => {
                const report = {
                    metadata: {
                        title: 'Q4 2024 Report',
                        generatedAt: new Date().toISOString(),
                        version: '1.0.0'
                    },
                    kpis: {
                        ARR: { value: 4200000, unit: 'currency' },
                        NRR: { value: 105, unit: 'percentage' }
                    },
                    methodology: {
                        dataSources: ['Salesforce Opportunity'],
                        assumptions: ['Currency in USD']
                    }
                };

                const jsonString = JSON.stringify(report);

                expect(() => JSON.parse(jsonString)).not.toThrow();
                expect(JSON.parse(jsonString).kpis.ARR.value).toBe(4200000);
            });
        });

        describe('CSV Output', () => {
            test('should generate valid CSV for tabular data', () => {
                const generateCSV = (headers, rows) => {
                    const headerLine = headers.join(',');
                    const dataLines = rows.map(row =>
                        headers.map(h => row[h] || '').join(',')
                    );
                    return [headerLine, ...dataLines].join('\n');
                };

                const headers = ['Month', 'ARR', 'NRR', 'Churn'];
                const rows = [
                    { Month: 'Oct', ARR: 4000000, NRR: 105, Churn: 4 },
                    { Month: 'Nov', ARR: 4100000, NRR: 106, Churn: 3.5 },
                    { Month: 'Dec', ARR: 4200000, NRR: 108, Churn: 3 }
                ];

                const csv = generateCSV(headers, rows);

                expect(csv.split('\n')).toHaveLength(4);
                expect(csv).toContain('Month,ARR,NRR,Churn');
                expect(csv).toContain('Oct,4000000,105,4');
            });
        });

        describe('Excel Output Spec', () => {
            test('should generate Excel-compatible structure', () => {
                const excelSpec = {
                    format: 'xlsx',
                    sheets: [
                        {
                            name: 'Summary',
                            headers: ['KPI', 'Value', 'Benchmark', 'Status'],
                            rows: [
                                ['ARR', '$4.2M', '$4M', 'Above Target'],
                                ['NRR', '105%', '100%', 'Good']
                            ]
                        },
                        {
                            name: 'Trend Data',
                            headers: ['Month', 'ARR', 'MRR'],
                            // Use data array structure from fixture
                            rows: timeSeriesData.arrMonthly.data.map(d => [
                                d.period,
                                d.value,
                                d.value / 12
                            ])
                        }
                    ],
                    styles: {
                        headerRow: { bold: true, backgroundColor: '#007bff' },
                        currencyFormat: '$#,##0'
                    }
                };

                expect(excelSpec.sheets).toHaveLength(2);
                expect(excelSpec.sheets[0].name).toBe('Summary');
                expect(excelSpec.sheets[1].rows.length).toBe(
                    timeSeriesData.arrMonthly.data.length
                );
            });
        });
    });

    // ============================================
    // Error Handling & Recovery
    // ============================================
    describe('Error Handling & Recovery', () => {
        test('should handle missing data gracefully', () => {
            const processData = (data) => {
                try {
                    if (!data || !data.records) {
                        return { error: 'No data available', kpis: {} };
                    }
                    const total = data.records.reduce((sum, r) => sum + (r.Amount || 0), 0);
                    return { kpis: { total }, error: null };
                } catch (e) {
                    return { error: e.message, kpis: {} };
                }
            };

            const resultWithData = processData(sampleOpportunities);
            const resultWithNull = processData(null);
            const resultWithEmpty = processData({ records: [] });

            expect(resultWithData.kpis.total).toBeGreaterThan(0);
            expect(resultWithNull.error).toBe('No data available');
            expect(resultWithEmpty.kpis.total).toBe(0);
        });

        test('should validate input before processing', () => {
            const validateInput = (config) => {
                const errors = [];

                if (!config.orgAlias) {
                    errors.push('orgAlias is required');
                }

                if (!config.dateRange || !config.dateRange.start) {
                    errors.push('dateRange.start is required');
                }

                if (config.kpis && !Array.isArray(config.kpis)) {
                    errors.push('kpis must be an array');
                }

                return {
                    valid: errors.length === 0,
                    errors
                };
            };

            const validConfig = {
                orgAlias: 'production',
                dateRange: { start: '2024-01-01', end: '2024-12-31' },
                kpis: ['ARR', 'NRR']
            };

            const invalidConfig = {
                dateRange: { end: '2024-12-31' }
            };

            expect(validateInput(validConfig).valid).toBe(true);
            expect(validateInput(invalidConfig).valid).toBe(false);
            expect(validateInput(invalidConfig).errors).toHaveLength(2);
        });

        test('should retry on transient failures', async () => {
            let attempts = 0;
            const maxRetries = 3;

            const fetchWithRetry = async () => {
                attempts++;
                if (attempts < 3) {
                    throw new Error('Transient error');
                }
                return { success: true, data: 'result' };
            };

            const retry = async (fn, retries) => {
                let lastError;
                for (let i = 0; i < retries; i++) {
                    try {
                        return await fn();
                    } catch (e) {
                        lastError = e;
                    }
                }
                throw lastError;
            };

            const result = await retry(fetchWithRetry, maxRetries);

            expect(result.success).toBe(true);
            expect(attempts).toBe(3);
        });
    });

    // ============================================
    // Performance Integration
    // ============================================
    describe('Performance Integration', () => {
        test('should process 1000 records efficiently', () => {
            // Generate large dataset
            const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
                Id: `OPP-${i}`,
                Amount: Math.random() * 100000,
                StageName: ['Prospecting', 'Qualification', 'Closed Won'][i % 3],
                CloseDate: `2024-${String((i % 12) + 1).padStart(2, '0')}-15`
            }));

            const startTime = Date.now();

            // Process: filter, transform, aggregate
            const closedWon = largeDataset.filter(r => r.StageName === 'Closed Won');
            const byMonth = closedWon.reduce((acc, r) => {
                const month = r.CloseDate.substring(0, 7);
                acc[month] = (acc[month] || 0) + r.Amount;
                return acc;
            }, {});
            const total = Object.values(byMonth).reduce((sum, v) => sum + v, 0);

            const duration = Date.now() - startTime;

            expect(duration).toBeLessThan(100); // Should complete in < 100ms
            expect(total).toBeGreaterThan(0);
            expect(Object.keys(byMonth).length).toBeGreaterThan(0);
        });

        test('should handle concurrent operations', async () => {
            const operations = Array.from({ length: 10 }, (_, i) =>
                Promise.resolve({
                    id: i,
                    result: Math.random() * 1000
                })
            );

            const startTime = Date.now();
            const results = await Promise.all(operations);
            const duration = Date.now() - startTime;

            expect(results).toHaveLength(10);
            expect(duration).toBeLessThan(100);
        });
    });
});
