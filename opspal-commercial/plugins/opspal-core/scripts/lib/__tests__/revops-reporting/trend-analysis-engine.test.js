/**
 * Trend Analysis Engine - Unit Tests
 *
 * Tests for trend-analysis-engine.js
 * Phase 6: Comprehensive QA Plan
 *
 * @version 1.0.0
 */

const path = require('path');
const { TrendAnalysisEngine } = require('../../trend-analysis-engine');

// Load fixtures
const timeSeriesData = require('./fixtures/time-series-data.json');

describe('TrendAnalysisEngine', () => {
    let engine;

    beforeEach(() => {
        engine = new TrendAnalysisEngine();
    });

    describe('Initialization', () => {
        test('should initialize with default config', () => {
            expect(engine).toBeDefined();
            expect(engine.config).toBeDefined();
        });

        test('should accept custom config', () => {
            const customEngine = new TrendAnalysisEngine({
                minDataPoints: 5,
                defaultWindow: 5
            });
            expect(customEngine.config.minDataPoints).toBe(5);
        });
    });

    describe('detectTrend()', () => {
        test('should detect linear increasing trend', () => {
            const data = timeSeriesData.arrMonthly.data.map(d => d.value);
            const result = engine.detectTrend(data, { method: 'linear' });

            expect(result).toBeDefined();
            expect(result.type).toBe('linear');
            expect(result.direction).toBe('increasing');
            expect(result.slope).toBeGreaterThan(0);
            expect(result.r2).toBeGreaterThan(0.9);
        });

        test('should detect trend with auto method selection', () => {
            const data = timeSeriesData.arrMonthly.data.map(d => d.value);
            const result = engine.detectTrend(data, { method: 'auto' });

            expect(result).toBeDefined();
            expect(['linear', 'exponential', 'polynomial']).toContain(result.type);
            expect(result.direction).toBe('increasing');
        });

        test('should return volatile for unstable data', () => {
            const data = timeSeriesData.winRateVolatile.data.map(d => d.value);
            const result = engine.detectTrend(data, { method: 'auto' });

            expect(result).toBeDefined();
            // High variance data should have lower R²
            expect(result.r2).toBeLessThan(0.5);
        });

        test('should return error for insufficient data', () => {
            const result = engine.detectTrend([100, 200], { method: 'linear' });

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        test('should handle decreasing trend', () => {
            const decreasingData = [1000, 950, 900, 850, 800, 750, 700];
            const result = engine.detectTrend(decreasingData, { method: 'linear' });

            expect(result.direction).toBe('decreasing');
            expect(result.slope).toBeLessThan(0);
        });
    });

    describe('calculateMovingAverage()', () => {
        test('should calculate SMA correctly', () => {
            const data = [100, 200, 300, 400, 500];
            const result = engine.calculateMovingAverage(data, 3, 'sma');

            // Returns null-padded array (same length as input)
            expect(result).toHaveLength(5);
            expect(result[0]).toBe(null); // Not enough data for first point
            expect(result[1]).toBe(null); // Not enough data for second point
            expect(result[2]).toBe(200); // (100+200+300)/3
            expect(result[3]).toBe(300); // (200+300+400)/3
            expect(result[4]).toBe(400); // (300+400+500)/3
        });

        test('should calculate EMA correctly', () => {
            const data = [100, 200, 300, 400, 500];
            const result = engine.calculateMovingAverage(data, 3, 'ema');

            expect(result).toBeDefined();
            expect(result.length).toBeGreaterThan(0);
            // EMA should give more weight to recent values
            expect(result[result.length - 1]).toBeGreaterThan(300);
        });

        test('should calculate WMA correctly', () => {
            const data = [100, 200, 300, 400, 500];
            const result = engine.calculateMovingAverage(data, 3, 'wma');

            expect(result).toBeDefined();
            // WMA also weights recent values more heavily
            expect(result[result.length - 1]).toBeGreaterThan(380);
        });

        test('should throw error for invalid window size', () => {
            expect(() => {
                engine.calculateMovingAverage([100, 200], 5, 'sma');
            }).toThrow();
        });
    });

    describe('detectSeasonality()', () => {
        test('should detect quarterly seasonality', () => {
            const data = timeSeriesData.nrrQuarterly.data.map(d => d.value);
            const result = engine.detectSeasonality(data, 'quarterly');

            expect(result).toBeDefined();
            expect(result.detected).toBe(true);
            expect(result.period).toBe('quarterly');
        });

        test('should return no seasonality for random data', () => {
            const randomData = Array.from({ length: 12 }, () =>
                Math.random() * 100 + 50
            );
            const result = engine.detectSeasonality(randomData, 'monthly');

            // Random data should have weak seasonality
            expect(result.strength).toBeLessThan(0.5);
        });

        test('should handle insufficient data gracefully', () => {
            const result = engine.detectSeasonality([100, 200, 300], 'quarterly');

            expect(result.detected).toBe(false);
            expect(result.reason).toContain('insufficient');
        });
    });

    describe('detectAnomalies()', () => {
        test('should detect spike anomaly with z-score method', () => {
            const data = timeSeriesData.pipelineWithAnomaly.data.map(d => d.value);
            const result = engine.detectAnomalies(data, {
                method: 'zscore',
                sensitivity: 2.0
            });

            expect(result).toBeDefined();
            expect(result.success).toBe(true);
            expect(result.anomalies.length).toBeGreaterThan(0);

            // July (index 6) should be flagged as anomaly
            const julyAnomaly = result.anomalies.find(a => a.index === 6);
            expect(julyAnomaly).toBeDefined();
            expect(julyAnomaly.type).toBe('high');
        });

        test('should detect anomalies with IQR method', () => {
            const data = timeSeriesData.pipelineWithAnomaly.data.map(d => d.value);
            const result = engine.detectAnomalies(data, {
                method: 'iqr',
                sensitivity: 1.5
            });

            expect(result).toBeDefined();
            expect(result.success).toBe(true);
            expect(result.anomalies.length).toBeGreaterThan(0);
        });

        test('should detect anomalies with MAD method', () => {
            const data = timeSeriesData.pipelineWithAnomaly.data.map(d => d.value);
            const result = engine.detectAnomalies(data, {
                method: 'mad',
                sensitivity: 2.5
            });

            expect(result).toBeDefined();
        });

        test('should return empty array for clean data', () => {
            const cleanData = [100, 102, 98, 101, 99, 103, 97, 100];
            const result = engine.detectAnomalies(cleanData, {
                method: 'zscore',
                sensitivity: 2.0
            });

            expect(result.success).toBe(true);
            expect(result.anomalies).toHaveLength(0);
        });
    });

    describe('Period Comparisons', () => {
        describe('calculateYoY()', () => {
            test('should calculate year-over-year change correctly', () => {
                const current = 12000000;
                const previous = 9360000;
                const result = engine.calculateYoY(current, previous);

                expect(result).toBeDefined();
                expect(result.absoluteChange).toBe(2640000);
                expect(result.percentChange).toBeCloseTo(0.282, 2); // 28.2%
                expect(result.direction).toBe('increase');
            });

            test('should handle decrease', () => {
                const result = engine.calculateYoY(80, 100);

                expect(result.percentChange).toBe(-0.2);
                expect(result.direction).toBe('decrease');
            });

            test('should handle zero previous value', () => {
                const result = engine.calculateYoY(100, 0);

                expect(result.percentChange).toBe(Infinity);
            });
        });

        describe('calculateQoQ()', () => {
            test('should calculate quarter-over-quarter change', () => {
                const result = engine.calculateQoQ(3000000, 2800000);

                expect(result.percentChange).toBeCloseTo(0.0714, 3);
                expect(result.direction).toBe('increase');
            });
        });

        describe('calculateMoM()', () => {
            test('should calculate month-over-month change', () => {
                const result = engine.calculateMoM(12000000, 11600000);

                expect(result.percentChange).toBeCloseTo(0.0345, 3);
                expect(result.direction).toBe('increase');
            });
        });
    });

    describe('identifyCorrelation()', () => {
        test('should identify positive correlation', () => {
            const data1 = [100, 110, 120, 130, 140, 150];
            const data2 = [50, 55, 60, 65, 70, 75];
            const result = engine.identifyCorrelation(data1, data2);

            expect(result).toBeDefined();
            expect(result.coefficient).toBeCloseTo(1.0, 1);
            // Perfect correlation (1.0) returns 'very strong', not just 'strong'
            expect(['strong', 'very strong']).toContain(result.strength);
            expect(result.direction).toBe('positive');
        });

        test('should identify negative correlation', () => {
            const data1 = [100, 110, 120, 130, 140, 150];
            const data2 = [75, 70, 65, 60, 55, 50];
            const result = engine.identifyCorrelation(data1, data2);

            expect(result.coefficient).toBeCloseTo(-1.0, 1);
            expect(result.direction).toBe('negative');
        });

        test('should identify weak correlation', () => {
            const data1 = [100, 110, 90, 130, 80, 150];
            const data2 = [50, 70, 45, 55, 80, 60];
            const result = engine.identifyCorrelation(data1, data2);

            expect(Math.abs(result.coefficient)).toBeLessThan(0.5);
            expect(result.strength).toBe('weak');
        });

        test('should throw error for mismatched array lengths', () => {
            expect(() => {
                engine.identifyCorrelation([1, 2, 3], [1, 2]);
            }).toThrow();
        });
    });

    describe('detectAcceleration()', () => {
        test('should detect growth acceleration', () => {
            // Growth rates increasing
            const data = [100, 110, 125, 145, 175, 220];
            const result = engine.detectAcceleration(data);

            expect(result).toBeDefined();
            expect(result.status).toBe('accelerating');
            expect(result.rate).toBeGreaterThan(0);
        });

        test('should detect growth deceleration', () => {
            // Growth rates decreasing
            const data = [100, 150, 185, 210, 225, 235];
            const result = engine.detectAcceleration(data);

            expect(result.status).toBe('decelerating');
        });

        test('should detect stable growth', () => {
            // Constant absolute growth rate (not compound)
            // +10 each period = truly stable linear growth
            const data = [100, 110, 120, 130, 140, 150];
            const result = engine.detectAcceleration(data);

            expect(result.status).toBe('stable');
        });
    });

    describe('findInflectionPoints()', () => {
        test('should find inflection points in data', () => {
            // Data that goes up, then down
            const data = [100, 120, 140, 150, 145, 130, 110];
            const result = engine.findInflectionPoints(data);

            expect(result).toBeDefined();
            expect(result.length).toBeGreaterThan(0);

            // Should find the peak
            const peak = result.find(p => p.type === 'peak');
            expect(peak).toBeDefined();
        });

        test('should handle monotonic data', () => {
            const data = [100, 110, 120, 130, 140, 150];
            const result = engine.findInflectionPoints(data);

            expect(result).toHaveLength(0);
        });
    });

    describe('generateTrendSummary()', () => {
        test('should generate human-readable summary', () => {
            const analysis = {
                kpis: [
                    {
                        id: 'ARR',
                        name: 'Annual Recurring Revenue',
                        current: 12000000,
                        trend: { type: 'linear', direction: 'increasing', strength: 'strong' },
                        yoyChange: { percentChange: 0.28 }
                    }
                ],
                period: 'Q4 2024'
            };

            const result = engine.generateTrendSummary(analysis);

            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
            expect(result).toContain('ARR');
            expect(result).toContain('increasing');
        });

        test('should include recommendations for concerning trends', () => {
            const analysis = {
                kpis: [
                    {
                        id: 'NRR',
                        name: 'Net Revenue Retention',
                        current: 95,
                        trend: { type: 'linear', direction: 'decreasing', strength: 'moderate' },
                        yoyChange: { percentChange: -0.05 }
                    }
                ],
                period: 'Q4 2024'
            };

            const result = engine.generateTrendSummary(analysis);

            expect(result).toContain('attention');
        });
    });

    describe('Edge Cases', () => {
        test('should handle empty array', () => {
            // Implementation returns error object instead of throwing
            const result = engine.detectTrend([]);
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        test('should handle array with one element', () => {
            // Implementation returns error object instead of throwing
            const result = engine.detectTrend([100]);
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        test('should handle negative values', () => {
            const data = [-100, -90, -80, -70, -60, -50];
            const result = engine.detectTrend(data);

            expect(result.direction).toBe('increasing'); // Getting less negative
        });

        test('should handle all same values', () => {
            const data = [100, 100, 100, 100, 100];
            const result = engine.detectTrend(data);

            expect(result.direction).toBe('stable');
            expect(result.slope).toBeCloseTo(0, 5);
        });

        test('should handle very large values', () => {
            const data = [1e12, 1.1e12, 1.2e12, 1.3e12, 1.4e12];
            const result = engine.detectTrend(data);

            expect(result).toBeDefined();
            expect(result.direction).toBe('increasing');
        });

        test('should handle decimal values', () => {
            // Use data with slope > 0.01 threshold to be detected as increasing
            const data = [0.1, 0.2, 0.3, 0.4, 0.5];
            const result = engine.detectTrend(data);

            expect(result.direction).toBe('increasing');
        });
    });
});
