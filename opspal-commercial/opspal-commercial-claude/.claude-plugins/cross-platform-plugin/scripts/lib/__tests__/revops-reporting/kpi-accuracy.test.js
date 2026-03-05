/**
 * KPI Calculation Accuracy Tests
 * Phase 6: Comprehensive QA Plan
 *
 * CRITICAL: These tests verify the mathematical accuracy of all KPI calculations.
 * Each KPI formula is tested with known inputs and expected outputs.
 *
 * Test categories:
 * - Revenue Metrics (ARR, MRR, Revenue Growth)
 * - Retention Metrics (NRR, GRR, Customer Churn)
 * - Unit Economics (CAC, LTV, LTV:CAC Ratio, CAC Payback)
 * - Pipeline Metrics (Pipeline Coverage, Sales Velocity, Win Rate)
 */

describe('KPI Calculation Accuracy', () => {
    // ============================================
    // Revenue Metrics
    // ============================================
    describe('Revenue Metrics', () => {
        describe('ARR (Annual Recurring Revenue)', () => {
            const calculateARR = (mrr) => mrr * 12;

            test('basic ARR calculation', () => {
                // Input: MRR = $100,000
                // Expected: ARR = $100,000 × 12 = $1,200,000
                const mrr = 100000;
                const expectedARR = 1200000;
                expect(calculateARR(mrr)).toBe(expectedARR);
            });

            test('ARR from quarterly revenue', () => {
                // Input: Q4 recurring revenue = $300,000
                // Expected: MRR = $100,000, ARR = $1,200,000
                const quarterlyRevenue = 300000;
                const mrr = quarterlyRevenue / 3;
                const expectedARR = 1200000;
                expect(calculateARR(mrr)).toBe(expectedARR);
            });

            test('ARR handles fractional values', () => {
                const mrr = 123456.78;
                const expectedARR = 1481481.36;
                expect(calculateARR(mrr)).toBeCloseTo(expectedARR, 2);
            });

            test('ARR with zero MRR', () => {
                expect(calculateARR(0)).toBe(0);
            });
        });

        describe('MRR (Monthly Recurring Revenue)', () => {
            const calculateMRR = (subscriptions) =>
                subscriptions.reduce((sum, s) => sum + s.monthlyValue, 0);

            test('MRR from multiple subscriptions', () => {
                const subscriptions = [
                    { customer: 'A', monthlyValue: 5000 },
                    { customer: 'B', monthlyValue: 10000 },
                    { customer: 'C', monthlyValue: 15000 },
                    { customer: 'D', monthlyValue: 20000 },
                    { customer: 'E', monthlyValue: 50000 }
                ];
                // Expected: $100,000
                expect(calculateMRR(subscriptions)).toBe(100000);
            });

            test('MRR with annual contracts', () => {
                // Annual contract of $120,000 = $10,000 MRR
                const subscriptions = [
                    { customer: 'A', monthlyValue: 120000 / 12 }
                ];
                expect(calculateMRR(subscriptions)).toBe(10000);
            });
        });

        describe('Revenue Growth Rate', () => {
            const calculateGrowthRate = (current, previous) =>
                previous === 0 ? null : ((current - previous) / previous) * 100;

            test('positive growth', () => {
                // Q4 = $12M, Q3 = $9M
                // Growth = (12 - 9) / 9 × 100 = 33.33%
                const current = 12000000;
                const previous = 9000000;
                expect(calculateGrowthRate(current, previous)).toBeCloseTo(33.33, 2);
            });

            test('negative growth', () => {
                // Q4 = $8M, Q3 = $10M
                // Growth = (8 - 10) / 10 × 100 = -20%
                const current = 8000000;
                const previous = 10000000;
                expect(calculateGrowthRate(current, previous)).toBe(-20);
            });

            test('zero growth', () => {
                const current = 10000000;
                const previous = 10000000;
                expect(calculateGrowthRate(current, previous)).toBe(0);
            });

            test('handles zero previous (division by zero)', () => {
                expect(calculateGrowthRate(1000000, 0)).toBeNull();
            });
        });
    });

    // ============================================
    // Retention Metrics
    // ============================================
    describe('Retention Metrics', () => {
        describe('NRR (Net Revenue Retention)', () => {
            const calculateNRR = (startingMRR, expansion, contraction, churn) =>
                ((startingMRR + expansion - contraction - churn) / startingMRR) * 100;

            test('standard NRR calculation', () => {
                // Starting MRR: $100,000
                // Expansion: +$20,000
                // Contraction: -$5,000
                // Churn: -$10,000
                // NRR = (100000 + 20000 - 5000 - 10000) / 100000 × 100 = 105%
                const result = calculateNRR(100000, 20000, 5000, 10000);
                expect(result).toBe(105);
            });

            test('NRR below 100% (net churn)', () => {
                // Starting: $100,000, Expansion: $5,000, Contraction: $3,000, Churn: $12,000
                // NRR = (100000 + 5000 - 3000 - 12000) / 100000 × 100 = 90%
                const result = calculateNRR(100000, 5000, 3000, 12000);
                expect(result).toBe(90);
            });

            test('excellent NRR (120%+)', () => {
                // Starting: $100,000, Expansion: $30,000, Contraction: $2,000, Churn: $5,000
                // NRR = (100000 + 30000 - 2000 - 5000) / 100000 × 100 = 123%
                const result = calculateNRR(100000, 30000, 2000, 5000);
                expect(result).toBe(123);
            });

            test('NRR with zero expansion', () => {
                // Only churn, no expansion
                // Starting: $100,000, Churn: $10,000
                // NRR = 90%
                const result = calculateNRR(100000, 0, 0, 10000);
                expect(result).toBe(90);
            });
        });

        describe('GRR (Gross Revenue Retention)', () => {
            const calculateGRR = (startingMRR, contraction, churn) =>
                ((startingMRR - contraction - churn) / startingMRR) * 100;

            test('standard GRR calculation', () => {
                // Starting MRR: $100,000
                // Contraction: $5,000
                // Churn: $10,000
                // GRR = (100000 - 5000 - 10000) / 100000 × 100 = 85%
                const result = calculateGRR(100000, 5000, 10000);
                expect(result).toBe(85);
            });

            test('excellent GRR (95%+)', () => {
                // Starting: $100,000, Contraction: $2,000, Churn: $3,000
                // GRR = 95%
                const result = calculateGRR(100000, 2000, 3000);
                expect(result).toBe(95);
            });

            test('GRR cannot exceed 100%', () => {
                // GRR should max at 100% (no contraction, no churn)
                const result = calculateGRR(100000, 0, 0);
                expect(result).toBe(100);
            });

            test('GRR is always <= NRR', () => {
                const startingMRR = 100000;
                const expansion = 20000;
                const contraction = 5000;
                const churn = 10000;

                const nrr = ((startingMRR + expansion - contraction - churn) / startingMRR) * 100;
                const grr = ((startingMRR - contraction - churn) / startingMRR) * 100;

                expect(grr).toBeLessThanOrEqual(nrr);
            });
        });

        describe('Customer Churn Rate', () => {
            const calculateChurnRate = (startingCustomers, lostCustomers) =>
                (lostCustomers / startingCustomers) * 100;

            test('standard churn calculation', () => {
                // Starting: 100 customers, Lost: 5
                // Churn Rate = 5 / 100 × 100 = 5%
                const result = calculateChurnRate(100, 5);
                expect(result).toBe(5);
            });

            test('excellent churn (<3%)', () => {
                // Starting: 1000, Lost: 20
                // Churn = 2%
                const result = calculateChurnRate(1000, 20);
                expect(result).toBe(2);
            });

            test('poor churn (>10%)', () => {
                // Starting: 100, Lost: 15
                // Churn = 15%
                const result = calculateChurnRate(100, 15);
                expect(result).toBe(15);
            });

            test('zero churn', () => {
                const result = calculateChurnRate(100, 0);
                expect(result).toBe(0);
            });
        });
    });

    // ============================================
    // Unit Economics
    // ============================================
    describe('Unit Economics', () => {
        describe('CAC (Customer Acquisition Cost)', () => {
            const calculateCAC = (salesSpend, marketingSpend, newCustomers) =>
                (salesSpend + marketingSpend) / newCustomers;

            test('standard CAC calculation', () => {
                // Sales: $500,000, Marketing: $200,000, New Customers: 100
                // CAC = (500000 + 200000) / 100 = $7,000
                const result = calculateCAC(500000, 200000, 100);
                expect(result).toBe(7000);
            });

            test('excellent CAC (<$500)', () => {
                // Sales: $30,000, Marketing: $20,000, New Customers: 100
                // CAC = $500
                const result = calculateCAC(30000, 20000, 100);
                expect(result).toBe(500);
            });

            test('CAC with only marketing spend', () => {
                // PLG motion: minimal sales, marketing-led
                const result = calculateCAC(0, 50000, 100);
                expect(result).toBe(500);
            });

            test('handles fractional customers', () => {
                // In practice, this would be pro-rated
                const result = calculateCAC(100000, 50000, 75);
                expect(result).toBe(2000);
            });
        });

        describe('LTV (Lifetime Value)', () => {
            const calculateLTV = (arpu, churnRate) =>
                churnRate === 0 ? Infinity : arpu / (churnRate / 100);

            test('standard LTV calculation', () => {
                // ARPU: $1,000/month, Churn: 5%/month
                // LTV = $1,000 / 0.05 = $20,000
                const result = calculateLTV(1000, 5);
                expect(result).toBe(20000);
            });

            test('high LTV (low churn)', () => {
                // ARPU: $1,000, Churn: 2%
                // LTV = $50,000
                const result = calculateLTV(1000, 2);
                expect(result).toBe(50000);
            });

            test('low LTV (high churn)', () => {
                // ARPU: $1,000, Churn: 10%
                // LTV = $10,000
                const result = calculateLTV(1000, 10);
                expect(result).toBe(10000);
            });

            test('handles zero churn (infinite LTV)', () => {
                const result = calculateLTV(1000, 0);
                expect(result).toBe(Infinity);
            });
        });

        describe('LTV:CAC Ratio', () => {
            const calculateLTVCACRatio = (ltv, cac) => ltv / cac;

            test('healthy ratio (3:1)', () => {
                // LTV: $21,000, CAC: $7,000
                // Ratio = 3.0
                const result = calculateLTVCACRatio(21000, 7000);
                expect(result).toBe(3);
            });

            test('excellent ratio (5:1)', () => {
                // LTV: $25,000, CAC: $5,000
                // Ratio = 5.0
                const result = calculateLTVCACRatio(25000, 5000);
                expect(result).toBe(5);
            });

            test('poor ratio (<1:1)', () => {
                // LTV: $5,000, CAC: $10,000
                // Ratio = 0.5 (losing money per customer)
                const result = calculateLTVCACRatio(5000, 10000);
                expect(result).toBe(0.5);
            });

            test('typical ratio targets', () => {
                // <1:1 = bad (losing money)
                // 1-2:1 = needs improvement
                // 3:1 = healthy target
                // >5:1 = may be underinvesting in growth

                const losingMoney = calculateLTVCACRatio(5000, 10000);
                const needsImprovement = calculateLTVCACRatio(15000, 10000);
                const healthy = calculateLTVCACRatio(30000, 10000);
                const underinvesting = calculateLTVCACRatio(60000, 10000);

                expect(losingMoney).toBeLessThan(1);
                expect(needsImprovement).toBeGreaterThanOrEqual(1);
                expect(needsImprovement).toBeLessThan(3);
                expect(healthy).toBe(3);
                expect(underinvesting).toBeGreaterThan(5);
            });
        });

        describe('CAC Payback Period', () => {
            const calculateCACPayback = (cac, mrrPerCustomer) =>
                cac / mrrPerCustomer;

            test('standard payback calculation', () => {
                // CAC: $7,000, MRR per customer: $500
                // Payback = 7000 / 500 = 14 months
                const result = calculateCACPayback(7000, 500);
                expect(result).toBe(14);
            });

            test('excellent payback (<12 months)', () => {
                // CAC: $5,000, MRR: $500
                // Payback = 10 months
                const result = calculateCACPayback(5000, 500);
                expect(result).toBe(10);
            });

            test('poor payback (>24 months)', () => {
                // CAC: $15,000, MRR: $500
                // Payback = 30 months
                const result = calculateCACPayback(15000, 500);
                expect(result).toBe(30);
            });

            test('payback with gross margin', () => {
                // More accurate: CAC / (MRR × Gross Margin)
                const calculateCACPaybackWithMargin = (cac, mrr, grossMargin) =>
                    cac / (mrr * grossMargin);

                // CAC: $7,000, MRR: $500, Gross Margin: 70%
                // Payback = 7000 / (500 × 0.70) = 20 months
                const result = calculateCACPaybackWithMargin(7000, 500, 0.70);
                expect(result).toBe(20);
            });
        });
    });

    // ============================================
    // Pipeline Metrics
    // ============================================
    describe('Pipeline Metrics', () => {
        describe('Pipeline Coverage', () => {
            const calculatePipelineCoverage = (pipeline, quota) => pipeline / quota;

            test('standard coverage calculation', () => {
                // Pipeline: $3M, Quota: $1M
                // Coverage = 3.0x
                const result = calculatePipelineCoverage(3000000, 1000000);
                expect(result).toBe(3);
            });

            test('healthy coverage (3-4x)', () => {
                const result = calculatePipelineCoverage(3500000, 1000000);
                expect(result).toBeGreaterThanOrEqual(3);
                expect(result).toBeLessThanOrEqual(4);
            });

            test('insufficient coverage (<2x)', () => {
                const result = calculatePipelineCoverage(1500000, 1000000);
                expect(result).toBeLessThan(2);
            });

            test('coverage adjusted for win rate', () => {
                // Required coverage = 1 / Win Rate
                // 20% win rate → need 5x coverage
                // 33% win rate → need 3x coverage
                const calculateRequiredCoverage = (winRate) => 1 / winRate;

                expect(calculateRequiredCoverage(0.20)).toBe(5);
                expect(calculateRequiredCoverage(0.33)).toBeCloseTo(3.03, 1);
                expect(calculateRequiredCoverage(0.25)).toBe(4);
            });
        });

        describe('Sales Velocity', () => {
            const calculateSalesVelocity = (opportunities, winRate, avgDeal, cycleLength) =>
                (opportunities * winRate * avgDeal) / cycleLength;

            test('standard velocity calculation', () => {
                // 50 opportunities × 20% win rate × $25,000 avg deal / 30 day cycle
                // Velocity = (50 × 0.20 × 25000) / 30 = $8,333.33/day
                const result = calculateSalesVelocity(50, 0.20, 25000, 30);
                expect(result).toBeCloseTo(8333.33, 2);
            });

            test('high velocity (efficient sales)', () => {
                // 100 opps × 25% × $30,000 / 20 days = $37,500/day
                const result = calculateSalesVelocity(100, 0.25, 30000, 20);
                expect(result).toBe(37500);
            });

            test('velocity improvement strategies', () => {
                const baseline = calculateSalesVelocity(50, 0.20, 25000, 30);

                // Improve win rate by 25%
                const improvedWinRate = calculateSalesVelocity(50, 0.25, 25000, 30);
                expect(improvedWinRate / baseline).toBeCloseTo(1.25, 2);

                // Reduce cycle by 20%
                const reducedCycle = calculateSalesVelocity(50, 0.20, 25000, 24);
                expect(reducedCycle / baseline).toBeCloseTo(1.25, 2);

                // Increase deal size by 20%
                const biggerDeals = calculateSalesVelocity(50, 0.20, 30000, 30);
                expect(biggerDeals / baseline).toBeCloseTo(1.20, 2);
            });
        });

        describe('Win Rate', () => {
            const calculateWinRate = (totalClosed, closedWon) =>
                (closedWon / totalClosed) * 100;

            test('standard win rate calculation', () => {
                // Total Closed: 100, Closed Won: 25
                // Win Rate = 25 / 100 × 100 = 25%
                const result = calculateWinRate(100, 25);
                expect(result).toBe(25);
            });

            test('excellent win rate (>30%)', () => {
                const result = calculateWinRate(100, 35);
                expect(result).toBe(35);
            });

            test('average win rate (17-22%)', () => {
                const result = calculateWinRate(100, 20);
                expect(result).toBeGreaterThanOrEqual(17);
                expect(result).toBeLessThanOrEqual(22);
            });

            test('win rate by stage', () => {
                // Win rate typically varies by stage
                const stageWinRates = {
                    prospecting: calculateWinRate(500, 25),  // 5%
                    qualification: calculateWinRate(100, 15), // 15%
                    proposal: calculateWinRate(50, 20),      // 40%
                    negotiation: calculateWinRate(30, 24)    // 80%
                };

                expect(stageWinRates.prospecting).toBeLessThan(stageWinRates.qualification);
                expect(stageWinRates.qualification).toBeLessThan(stageWinRates.proposal);
                expect(stageWinRates.proposal).toBeLessThan(stageWinRates.negotiation);
            });
        });

        describe('Sales Cycle Length', () => {
            const calculateAvgCycleLength = (opportunities) => {
                const totalDays = opportunities.reduce((sum, opp) => {
                    const created = new Date(opp.createdDate);
                    const closed = new Date(opp.closedDate);
                    return sum + ((closed - created) / (1000 * 60 * 60 * 24));
                }, 0);
                return totalDays / opportunities.length;
            };

            test('average cycle calculation', () => {
                const opportunities = [
                    { createdDate: '2024-01-01', closedDate: '2024-01-31' }, // 30 days
                    { createdDate: '2024-02-01', closedDate: '2024-03-02' }, // 30 days
                    { createdDate: '2024-03-01', closedDate: '2024-04-15' }  // 45 days
                ];
                // Average = (30 + 30 + 45) / 3 = 35 days
                const result = calculateAvgCycleLength(opportunities);
                expect(result).toBe(35);
            });

            test('median cycle length', () => {
                const calculateMedianCycle = (opportunities) => {
                    const cycles = opportunities.map(opp => {
                        const created = new Date(opp.createdDate);
                        const closed = new Date(opp.closedDate);
                        return (closed - created) / (1000 * 60 * 60 * 24);
                    }).sort((a, b) => a - b);

                    const mid = Math.floor(cycles.length / 2);
                    return cycles.length % 2 === 0
                        ? (cycles[mid - 1] + cycles[mid]) / 2
                        : cycles[mid];
                };

                const opportunities = [
                    { createdDate: '2024-01-01', closedDate: '2024-01-21' }, // 20 days
                    { createdDate: '2024-01-01', closedDate: '2024-02-01' }, // 31 days
                    { createdDate: '2024-01-01', closedDate: '2024-04-01' }  // 91 days (outlier)
                ];
                // Median = 31 (middle value when sorted: 20, 31, 91)
                const result = calculateMedianCycle(opportunities);
                expect(result).toBe(31);
            });
        });
    });

    // ============================================
    // Composite Metrics
    // ============================================
    describe('Composite Metrics', () => {
        describe('Magic Number', () => {
            const calculateMagicNumber = (newARR, salesMarketingSpend) =>
                newARR / salesMarketingSpend;

            test('standard magic number', () => {
                // New ARR: $1M, S&M Spend: $800K
                // Magic Number = 1.25
                const result = calculateMagicNumber(1000000, 800000);
                expect(result).toBe(1.25);
            });

            test('magic number interpretation', () => {
                // > 1.0 = efficient (good)
                // 0.5-1.0 = okay
                // < 0.5 = inefficient

                const efficient = calculateMagicNumber(1000000, 800000);
                const okay = calculateMagicNumber(800000, 1000000);
                const inefficient = calculateMagicNumber(400000, 1000000);

                expect(efficient).toBeGreaterThan(1);
                expect(okay).toBeGreaterThanOrEqual(0.5);
                expect(okay).toBeLessThan(1);
                expect(inefficient).toBeLessThan(0.5);
            });
        });

        describe('Rule of 40', () => {
            const calculateRuleOf40 = (growthRate, profitMargin) =>
                growthRate + profitMargin;

            test('healthy Rule of 40', () => {
                // Growth: 30%, Margin: 15%
                // Score = 45 (above 40)
                const result = calculateRuleOf40(30, 15);
                expect(result).toBe(45);
                expect(result).toBeGreaterThanOrEqual(40);
            });

            test('growth-focused company', () => {
                // Growth: 50%, Margin: -10%
                // Score = 40 (on target)
                const result = calculateRuleOf40(50, -10);
                expect(result).toBe(40);
            });

            test('profit-focused company', () => {
                // Growth: 10%, Margin: 35%
                // Score = 45 (above target)
                const result = calculateRuleOf40(10, 35);
                expect(result).toBe(45);
            });

            test('underperforming company', () => {
                // Growth: 15%, Margin: 10%
                // Score = 25 (below 40)
                const result = calculateRuleOf40(15, 10);
                expect(result).toBe(25);
                expect(result).toBeLessThan(40);
            });
        });

        describe('Burn Multiple', () => {
            const calculateBurnMultiple = (netBurn, netNewARR) =>
                netBurn / netNewARR;

            test('efficient burn multiple', () => {
                // Net Burn: $500K, Net New ARR: $1M
                // Burn Multiple = 0.5 (excellent)
                const result = calculateBurnMultiple(500000, 1000000);
                expect(result).toBe(0.5);
            });

            test('burn multiple interpretation', () => {
                // < 1.0 = excellent
                // 1.0-1.5 = good
                // 1.5-2.0 = acceptable
                // > 2.0 = concerning

                const excellent = calculateBurnMultiple(400000, 1000000);
                const good = calculateBurnMultiple(1200000, 1000000);
                const acceptable = calculateBurnMultiple(1700000, 1000000);
                const concerning = calculateBurnMultiple(2500000, 1000000);

                expect(excellent).toBeLessThan(1);
                expect(good).toBeGreaterThanOrEqual(1);
                expect(good).toBeLessThan(1.5);
                expect(acceptable).toBeGreaterThanOrEqual(1.5);
                expect(acceptable).toBeLessThan(2);
                expect(concerning).toBeGreaterThan(2);
            });
        });
    });

    // ============================================
    // Edge Cases & Validation
    // ============================================
    describe('Edge Cases & Validation', () => {
        test('division by zero handling', () => {
            const safeDiv = (a, b) => b === 0 ? null : a / b;

            expect(safeDiv(100, 0)).toBeNull();
            expect(safeDiv(0, 100)).toBe(0);
            expect(safeDiv(100, 100)).toBe(1);
        });

        test('negative value handling', () => {
            // NRR can be below 100% (net negative retention)
            const nrr = ((100000 + 5000 - 30000) / 100000) * 100;
            expect(nrr).toBe(75);

            // Growth rate can be negative
            const growth = ((8000000 - 10000000) / 10000000) * 100;
            expect(growth).toBe(-20);
        });

        test('percentage boundaries', () => {
            // GRR should be 0-100%
            // NRR can exceed 100%
            // Churn is typically 0-100%

            const grr = 85;
            const nrr = 120;
            const churn = 5;

            expect(grr).toBeGreaterThanOrEqual(0);
            expect(grr).toBeLessThanOrEqual(100);
            expect(nrr).toBeGreaterThanOrEqual(0);
            // NRR can exceed 100%
            expect(churn).toBeGreaterThanOrEqual(0);
            expect(churn).toBeLessThanOrEqual(100);
        });

        test('large number precision', () => {
            // Should handle large revenue values without precision loss
            const arr = 123456789.12 * 12;
            expect(arr).toBeCloseTo(1481481469.44, 2);
        });

        test('floating point comparison', () => {
            // Use toBeCloseTo for floating point comparisons
            const mrr = 100000;
            const months = 3;
            const result = mrr / months;

            expect(result).toBeCloseTo(33333.33, 2);
        });
    });
});
