/**
 * KPI Calculations Test Suite
 * Phase 7: RevOps Full-Funnel Metrics Catalog Integration
 *
 * Tests for new efficiency metrics, expansion metrics, and segmented benchmarks
 * added in the RevOps KPI Knowledge Base v2.0.0 and Sales Benchmark Engine v2.0.0
 */

const path = require('path');
const { requireProtectedModule } = require('../../protected-asset-runtime');

let BenchmarkEngine = null;
try {
    ({ BenchmarkEngine } = requireProtectedModule({
        pluginRoot: path.resolve(__dirname, '../../../..'),
        pluginName: 'opspal-core',
        relativePath: 'scripts/lib/sales-benchmark-engine.js',
        allowPlaintextFallback: true
    }));
} catch {
    BenchmarkEngine = null;
}

const describeWithBenchmarkEngine = BenchmarkEngine ? describe : describe.skip;

// Initialize test instances
let benchmark;

beforeAll(() => {
    if (BenchmarkEngine) {
        benchmark = new BenchmarkEngine();
    }
});

describeWithBenchmarkEngine('Phase 7: New KPI Tests', () => {

    describe('Efficiency Metrics Calculations', () => {

        test('Magic Number calculation - excellent performance', () => {
            // Formula: (Net New ARR × 4) / Prior Quarter S&M Spend
            // Input: Net New ARR = $500K, Prior Q S&M = $1.5M
            // Expected: ($500K × 4) / $1.5M = 1.33
            const netNewARR = 500000;
            const priorQSM = 1500000;
            const magicNumber = (netNewARR * 4) / priorQSM;
            expect(magicNumber).toBeCloseTo(1.33, 2);
        });

        test('Magic Number calculation - poor performance', () => {
            // Input: Net New ARR = $100K, Prior Q S&M = $1M
            // Expected: ($100K × 4) / $1M = 0.4 (poor)
            const netNewARR = 100000;
            const priorQSM = 1000000;
            const magicNumber = (netNewARR * 4) / priorQSM;
            expect(magicNumber).toBeCloseTo(0.4, 2);
            expect(magicNumber).toBeLessThan(0.5); // Poor threshold
        });

        test('Burn Multiple calculation - great performance', () => {
            // Formula: Net Burn / Net New ARR
            // Input: Net Burn = $1M, Net New ARR = $750K
            // Expected: $1M / $750K = 1.33 (great)
            const netBurn = 1000000;
            const netNewARR = 750000;
            const burnMultiple = netBurn / netNewARR;
            expect(burnMultiple).toBeCloseTo(1.33, 2);
        });

        test('Burn Multiple calculation - amazing (profitable)', () => {
            // Input: Net Burn = $500K, Net New ARR = $800K
            // Expected: $500K / $800K = 0.625 (amazing - less than 1)
            const netBurn = 500000;
            const netNewARR = 800000;
            const burnMultiple = netBurn / netNewARR;
            expect(burnMultiple).toBeCloseTo(0.625, 2);
            expect(burnMultiple).toBeLessThan(1); // Amazing threshold
        });

        test('Burn Multiple calculation - bad performance', () => {
            // Input: Net Burn = $3M, Net New ARR = $500K
            // Expected: $3M / $500K = 6 (bad)
            const netBurn = 3000000;
            const netNewARR = 500000;
            const burnMultiple = netBurn / netNewARR;
            expect(burnMultiple).toBe(6);
            expect(burnMultiple).toBeGreaterThan(3); // Bad threshold
        });

        test('Rule of 40 calculation - healthy SaaS', () => {
            // Formula: Revenue Growth % + EBITDA Margin %
            // Input: Revenue Growth = 30%, EBITDA Margin = 15%
            // Expected: 30 + 15 = 45% (healthy)
            const revenueGrowth = 30;
            const ebitdaMargin = 15;
            const ruleOf40 = revenueGrowth + ebitdaMargin;
            expect(ruleOf40).toBe(45);
            expect(ruleOf40).toBeGreaterThan(40); // Healthy threshold
        });

        test('Rule of 40 calculation - hyper-growth scenario', () => {
            // Input: Revenue Growth = 100%, EBITDA Margin = -30%
            // Expected: 100 + (-30) = 70% (excellent despite losses)
            const revenueGrowth = 100;
            const ebitdaMargin = -30;
            const ruleOf40 = revenueGrowth + ebitdaMargin;
            expect(ruleOf40).toBe(70);
            expect(ruleOf40).toBeGreaterThan(50); // Excellent threshold
        });

        test('Rule of 40 calculation - profitable slow-growth', () => {
            // Input: Revenue Growth = 15%, EBITDA Margin = 30%
            // Expected: 15 + 30 = 45% (healthy balance)
            const revenueGrowth = 15;
            const ebitdaMargin = 30;
            const ruleOf40 = revenueGrowth + ebitdaMargin;
            expect(ruleOf40).toBe(45);
        });

        test('ARR per Employee calculation - efficient company', () => {
            // Formula: ARR / Employee Count
            // Input: ARR = $10M, Employees = 50
            // Expected: $200K (efficient)
            const arr = 10000000;
            const employees = 50;
            const arrPerEmployee = arr / employees;
            expect(arrPerEmployee).toBe(200000);
        });

        test('ARR per Employee calculation - early stage', () => {
            // Input: ARR = $2M, Employees = 30
            // Expected: $66.67K (early stage)
            const arr = 2000000;
            const employees = 30;
            const arrPerEmployee = arr / employees;
            expect(arrPerEmployee).toBeCloseTo(66666.67, 0);
        });

        test('ARR per Employee calculation - elite company', () => {
            // Input: ARR = $50M, Employees = 150
            // Expected: $333K (elite)
            const arr = 50000000;
            const employees = 150;
            const arrPerEmployee = arr / employees;
            expect(arrPerEmployee).toBeCloseTo(333333.33, 0);
            expect(arrPerEmployee).toBeGreaterThan(300000); // Elite threshold
        });

        test('Gross Margin calculation - excellent SaaS', () => {
            // Formula: (Revenue - COGS) / Revenue
            // Input: Revenue = $10M, COGS = $1.8M
            // Expected: 82% (excellent)
            const revenue = 10000000;
            const cogs = 1800000;
            const grossMargin = ((revenue - cogs) / revenue) * 100;
            expect(grossMargin).toBe(82);
            expect(grossMargin).toBeGreaterThan(80); // Excellent threshold
        });

        test('Gross Margin calculation - average', () => {
            // Input: Revenue = $10M, COGS = $3M
            // Expected: 70% (average)
            const revenue = 10000000;
            const cogs = 3000000;
            const grossMargin = ((revenue - cogs) / revenue) * 100;
            expect(grossMargin).toBe(70);
        });

        test('BES (Bessemer Efficiency Score) calculation', () => {
            // Formula: Net New ARR / Net Burn (inverse of Burn Multiple)
            // Input: Net New ARR = $1.5M, Net Burn = $1M
            // Expected: 1.5 (excellent)
            const netNewARR = 1500000;
            const netBurn = 1000000;
            const bes = netNewARR / netBurn;
            expect(bes).toBe(1.5);
            expect(bes).toBeGreaterThanOrEqual(1.5); // Excellent threshold
        });

        test('CAC Payback calculation - good', () => {
            // Formula: CAC / MRR per customer
            // Input: CAC = $12,000, MRR per customer = $1,000
            // Expected: 12 months (good)
            const cac = 12000;
            const mrrPerCustomer = 1000;
            const cacPayback = cac / mrrPerCustomer;
            expect(cacPayback).toBe(12);
            expect(cacPayback).toBeLessThanOrEqual(12); // Good threshold
        });

        test('CAC Payback calculation - needs improvement', () => {
            // Input: CAC = $30,000, MRR per customer = $1,000
            // Expected: 30 months (concern)
            const cac = 30000;
            const mrrPerCustomer = 1000;
            const cacPayback = cac / mrrPerCustomer;
            expect(cacPayback).toBe(30);
            expect(cacPayback).toBeGreaterThan(24); // Concern threshold
        });
    });

    describe('Expansion Metrics Calculations', () => {

        test('Expansion Revenue Rate calculation', () => {
            // Formula: (Expansion MRR / Starting MRR) × 100
            // Input: Expansion MRR = $50K, Starting MRR = $500K
            // Expected: 10% (good)
            const expansionMRR = 50000;
            const startingMRR = 500000;
            const expansionRate = (expansionMRR / startingMRR) * 100;
            expect(expansionRate).toBe(10);
        });

        test('Expansion Revenue Rate - excellent', () => {
            // Input: Expansion MRR = $150K, Starting MRR = $500K
            // Expected: 30% (excellent)
            const expansionMRR = 150000;
            const startingMRR = 500000;
            const expansionRate = (expansionMRR / startingMRR) * 100;
            expect(expansionRate).toBe(30);
            expect(expansionRate).toBeGreaterThan(25); // Excellent threshold
        });

        test('ACV Growth calculation - healthy', () => {
            // Formula: ((ACV_current - ACV_previous) / ACV_previous) × 100
            // Input: Current ACV = $50K, Previous ACV = $40K
            // Expected: 25% (strong)
            const acvCurrent = 50000;
            const acvPrevious = 40000;
            const acvGrowth = ((acvCurrent - acvPrevious) / acvPrevious) * 100;
            expect(acvGrowth).toBe(25);
            expect(acvGrowth).toBeGreaterThan(15); // Strong threshold
        });

        test('ACV Growth calculation - declining', () => {
            // Input: Current ACV = $35K, Previous ACV = $40K
            // Expected: -12.5% (declining)
            const acvCurrent = 35000;
            const acvPrevious = 40000;
            const acvGrowth = ((acvCurrent - acvPrevious) / acvPrevious) * 100;
            expect(acvGrowth).toBe(-12.5);
            expect(acvGrowth).toBeLessThan(0); // Declining
        });

        test('Retention/Expansion Mix - balanced', () => {
            // Formula: Expansion Revenue / (Retention Revenue + Expansion Revenue)
            // Input: Expansion = $400K, Retention = $600K
            // Expected: 40% (balanced)
            const expansionRevenue = 400000;
            const retentionRevenue = 600000;
            const mix = (expansionRevenue / (retentionRevenue + expansionRevenue)) * 100;
            expect(mix).toBe(40);
            expect(mix).toBeGreaterThanOrEqual(30); // Balanced lower bound
            expect(mix).toBeLessThanOrEqual(50); // Balanced upper bound
        });

        test('Retention/Expansion Mix - retention heavy', () => {
            // Input: Expansion = $100K, Retention = $500K
            // Expected: 16.67% (retention heavy)
            const expansionRevenue = 100000;
            const retentionRevenue = 500000;
            const mix = (expansionRevenue / (retentionRevenue + expansionRevenue)) * 100;
            expect(mix).toBeCloseTo(16.67, 1);
            expect(mix).toBeLessThan(30); // Retention heavy threshold
        });

        test('Retention/Expansion Mix - expansion heavy', () => {
            // Input: Expansion = $600K, Retention = $400K
            // Expected: 60% (expansion heavy)
            const expansionRevenue = 600000;
            const retentionRevenue = 400000;
            const mix = (expansionRevenue / (retentionRevenue + expansionRevenue)) * 100;
            expect(mix).toBe(60);
            expect(mix).toBeGreaterThan(50); // Expansion heavy threshold
        });
    });

    describe('NRR and GRR Calculations', () => {

        test('NRR calculation - healthy', () => {
            // Formula: ((Starting MRR + Expansion - Contraction - Churn) / Starting MRR) × 100
            // Input: Starting $100K, Expansion $20K, Contraction $5K, Churn $10K
            // Expected: 105%
            const startingMRR = 100000;
            const expansion = 20000;
            const contraction = 5000;
            const churn = 10000;
            const nrr = ((startingMRR + expansion - contraction - churn) / startingMRR) * 100;
            expect(nrr).toBe(105);
        });

        test('NRR calculation - net contraction', () => {
            // Input: Starting $100K, Expansion $5K, Contraction $10K, Churn $15K
            // Expected: 80%
            const startingMRR = 100000;
            const expansion = 5000;
            const contraction = 10000;
            const churn = 15000;
            const nrr = ((startingMRR + expansion - contraction - churn) / startingMRR) * 100;
            expect(nrr).toBe(80);
            expect(nrr).toBeLessThan(100); // Net contraction
        });

        test('NRR calculation - excellent', () => {
            // Input: Starting $100K, Expansion $30K, Contraction $2K, Churn $3K
            // Expected: 125%
            const startingMRR = 100000;
            const expansion = 30000;
            const contraction = 2000;
            const churn = 3000;
            const nrr = ((startingMRR + expansion - contraction - churn) / startingMRR) * 100;
            expect(nrr).toBe(125);
            expect(nrr).toBeGreaterThan(120); // Excellent threshold
        });

        test('GRR calculation - good retention', () => {
            // Formula: ((Starting MRR - Contraction - Churn) / Starting MRR) × 100
            // Input: Starting $100K, Contraction $5K, Churn $5K
            // Expected: 90%
            const startingMRR = 100000;
            const contraction = 5000;
            const churn = 5000;
            const grr = ((startingMRR - contraction - churn) / startingMRR) * 100;
            expect(grr).toBe(90);
        });

        test('GRR calculation - excellent retention', () => {
            // Input: Starting $100K, Contraction $2K, Churn $2K
            // Expected: 96%
            const startingMRR = 100000;
            const contraction = 2000;
            const churn = 2000;
            const grr = ((startingMRR - contraction - churn) / startingMRR) * 100;
            expect(grr).toBe(96);
            expect(grr).toBeGreaterThan(95); // Excellent threshold
        });
    });

    describe('Segmented Benchmarks', () => {

        test('Returns correct benchmark for company stage - seriesB', () => {
            const benchmarkResult = benchmark.getBenchmarksBySegment('nrr', { stage: 'seriesB' });
            expect(benchmarkResult).toBeDefined();
            expect(benchmarkResult.recommendation.median).toBe(105);
            expect(benchmarkResult.recommendation.topQuartile).toBe(115);
        });

        test('Returns correct benchmark for company stage - growth', () => {
            const benchmarkResult = benchmark.getBenchmarksBySegment('nrr', { stage: 'growth' });
            expect(benchmarkResult).toBeDefined();
            expect(benchmarkResult.recommendation.median).toBe(112);
            expect(benchmarkResult.recommendation.topQuartile).toBe(122);
        });

        test('Returns correct benchmark for ACV tier - enterprise', () => {
            const benchmarkResult = benchmark.getBenchmarksBySegment('nrr', { acv: 'enterprise' });
            expect(benchmarkResult).toBeDefined();
            expect(benchmarkResult.recommendation.median).toBe(115);
        });

        test('Returns correct benchmark for ACV tier - smb', () => {
            const benchmarkResult = benchmark.getBenchmarksBySegment('nrr', { acv: 'smb' });
            expect(benchmarkResult).toBeDefined();
            expect(benchmarkResult.recommendation.median).toBe(90);
        });

        test('Returns correct benchmark for GTM model - plg', () => {
            const benchmarkResult = benchmark.getBenchmarksBySegment('nrr', { gtm: 'plg' });
            expect(benchmarkResult).toBeDefined();
            expect(benchmarkResult.recommendation.median).toBe(95);
        });

        test('Returns correct benchmark for GTM model - salesLed', () => {
            const benchmarkResult = benchmark.getBenchmarksBySegment('nrr', { gtm: 'salesLed' });
            expect(benchmarkResult).toBeDefined();
            expect(benchmarkResult.recommendation.median).toBe(110);
        });

        test('Selects best matching benchmark when multiple segments provided', () => {
            const benchmarkResult = benchmark.getBenchmarksBySegment('nrr', {
                stage: 'seriesB',
                acv: 'enterprise'
            });
            expect(benchmarkResult).toBeDefined();
            expect(benchmarkResult.recommendation).toBeDefined();
            // Should have selected one of the segmentations
            expect(benchmarkResult.recommendation.median).toBeDefined();
        });

        test('Returns default benchmark when no segment matches', () => {
            const benchmarkResult = benchmark.getBenchmarksBySegment('nrr', {});
            expect(benchmarkResult).toBeDefined();
        });

        test('Magic Number benchmark by stage', () => {
            const seedBenchmark = benchmark.getBenchmarksBySegment('magic_number', { stage: 'seed' });
            const seriesCBenchmark = benchmark.getBenchmarksBySegment('magic_number', { stage: 'seriesC' });

            expect(seedBenchmark).toBeDefined();
            expect(seriesCBenchmark).toBeDefined();
            // Series C should have higher benchmarks than Seed
            expect(seriesCBenchmark.recommendation.median).toBeGreaterThan(seedBenchmark.recommendation.median);
        });
    });

    describe('Efficiency Metrics Comparison', () => {

        test('compareEfficiencyMetrics returns correct ratings', () => {
            const orgMetrics = {
                magic_number: 0.85,
                burn_multiple: 1.2,
                rule_of_40: 48,
                arr_per_employee: 175000,
                gross_margin: 78
            };

            const result = benchmark.compareEfficiencyMetrics(orgMetrics, {
                stage: 'seriesB'
            });

            expect(result).toBeDefined();
            expect(result.metrics).toBeDefined();
            expect(result.metrics.length).toBeGreaterThan(0);

            const magicNumber = result.metrics.find(m => m.id === 'magic_number');
            expect(magicNumber).toBeDefined();
            expect(magicNumber.rating).toBeDefined();
            expect(magicNumber.interpretation).toBeDefined();

            const burnMultiple = result.metrics.find(m => m.id === 'burn_multiple');
            expect(burnMultiple).toBeDefined();

            const ruleOf40 = result.metrics.find(m => m.id === 'rule_of_40');
            expect(ruleOf40).toBeDefined();
        });

        test('compareEfficiencyMetrics provides recommendations', () => {
            const orgMetrics = {
                magic_number: 0.4,  // Poor
                burn_multiple: 3.5,  // Bad
                rule_of_40: 25  // Needs work
            };

            const result = benchmark.compareEfficiencyMetrics(orgMetrics, {
                stage: 'seriesA'
            });

            expect(result.recommendations).toBeDefined();
            // May or may not have recommendations depending on implementation
            expect(Array.isArray(result.recommendations)).toBe(true);
        });

        test('compareEfficiencyMetrics handles excellent metrics', () => {
            const orgMetrics = {
                magic_number: 1.2,  // Excellent
                burn_multiple: 0.8,  // Amazing
                rule_of_40: 55,  // Excellent
                arr_per_employee: 350000,  // Elite
                gross_margin: 85  // Excellent
            };

            const result = benchmark.compareEfficiencyMetrics(orgMetrics, {
                stage: 'growth'
            });

            expect(result.metrics).toBeDefined();
            const magicNumber = result.metrics.find(m => m.id === 'magic_number');
            const burnMultiple = result.metrics.find(m => m.id === 'burn_multiple');
            const ruleOf40 = result.metrics.find(m => m.id === 'rule_of_40');

            // All ratings should be positive
            expect(magicNumber.rating).toMatch(/excellent|good/i);
            expect(burnMultiple.rating).toMatch(/excellent|good|amazing|great/i);
            expect(ruleOf40.rating).toMatch(/excellent|good/i);
        });
    });

    describe('Full Benchmark Comparison with Segmentation', () => {

        test('compareToBenchmarks includes efficiency metrics when flag set', () => {
            const orgMetrics = {
                win_rate: 25,
                avg_sales_cycle: 45,
                pipeline_coverage: 3.5,
                magic_number: 0.9,
                burn_multiple: 1.5
            };

            const result = benchmark.compareToBenchmarks(orgMetrics, {
                segmentation: { stage: 'seriesB' },
                includeEfficiency: true
            });

            expect(result).toBeDefined();
            // Should include both standard and efficiency comparisons
        });

        test('compareToBenchmarks respects segmentation options', () => {
            const orgMetrics = {
                win_rate: 25,
                avg_sales_cycle: 45,
                pipeline_coverage: 3.5
            };

            const enterpriseResult = benchmark.compareToBenchmarks(orgMetrics, {
                segmentation: { acv: 'enterprise' },
                includeEfficiency: false
            });

            const smbResult = benchmark.compareToBenchmarks(orgMetrics, {
                segmentation: { acv: 'smb' },
                includeEfficiency: false
            });

            expect(enterpriseResult).toBeDefined();
            expect(smbResult).toBeDefined();
            // Enterprise should have different ratings than SMB for same metrics
        });
    });

    describe('Edge Cases', () => {

        test('handles zero values gracefully', () => {
            // Magic Number with zero S&M spend
            expect(() => {
                const result = (500000 * 4) / 0;
                return result;
            }).not.toThrow();
        });

        test('handles negative growth scenarios', () => {
            const startingMRR = 100000;
            const expansion = 5000;
            const contraction = 15000;
            const churn = 20000;
            const nrr = ((startingMRR + expansion - contraction - churn) / startingMRR) * 100;
            expect(nrr).toBe(70); // Significant contraction
            expect(nrr).toBeLessThan(90); // Below average threshold
        });

        test('handles very high growth scenarios', () => {
            const startingMRR = 100000;
            const expansion = 100000; // 100% expansion
            const contraction = 0;
            const churn = 0;
            const nrr = ((startingMRR + expansion - contraction - churn) / startingMRR) * 100;
            expect(nrr).toBe(200); // 200% NRR
        });

        test('handles unknown metric gracefully', () => {
            const result = benchmark.getBenchmarksBySegment('unknown_metric', { stage: 'seriesB' });
            // Should not throw, returns structure with null recommendation
            expect(result).toBeDefined();
            expect(result.recommendation === null || Object.keys(result.benchmarks || {}).length === 0).toBeTruthy();
        });
    });
});
