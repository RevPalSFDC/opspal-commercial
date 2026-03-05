/**
 * KPI Forecaster - Unit Tests
 *
 * Tests for kpi-forecaster.js
 * Phase 6: Comprehensive QA Plan
 *
 * @version 1.0.0
 */

const { KPIForecaster } = require('../../kpi-forecaster');

// Load fixtures
const timeSeriesData = require('./fixtures/time-series-data.json');

describe('KPIForecaster', () => {
    let forecaster;

    beforeEach(() => {
        forecaster = new KPIForecaster();
    });

    describe('Initialization', () => {
        test('should initialize with default config', () => {
            expect(forecaster).toBeDefined();
            expect(forecaster.config).toBeDefined();
        });

        test('should accept custom config', () => {
            const customForecaster = new KPIForecaster({
                defaultConfidence: 0.9,
                minDataPoints: 5
            });
            expect(customForecaster.config.defaultConfidence).toBe(0.9);
        });
    });

    describe('forecast()', () => {
        describe('Linear Forecasting', () => {
            test('should generate linear forecast', () => {
                const data = timeSeriesData.forecastValidation.trainingData.map(d => d.value);
                const result = forecaster.forecast(data, {
                    periods: 4,
                    method: 'linear',
                    confidence: 0.95
                });

                expect(result).toBeDefined();
                expect(result.values).toHaveLength(4);
                expect(result.method).toBe('linear');
                expect(result.confidence).toBe(0.95);
            });

            test('should forecast increasing values for upward trend', () => {
                const data = [100, 110, 120, 130, 140, 150, 160, 170];
                const result = forecaster.forecast(data, {
                    periods: 3,
                    method: 'linear'
                });

                // Each forecasted value should be higher than the last data point
                expect(result.values[0]).toBeGreaterThan(170);
                expect(result.values[1]).toBeGreaterThan(result.values[0]);
                expect(result.values[2]).toBeGreaterThan(result.values[1]);
            });

            test('should include confidence intervals', () => {
                const data = [100, 110, 120, 130, 140, 150, 160, 170];
                const result = forecaster.forecast(data, {
                    periods: 3,
                    method: 'linear',
                    confidence: 0.95
                });

                expect(result.intervals).toBeDefined();
                expect(result.intervals.upper).toHaveLength(3);
                expect(result.intervals.lower).toHaveLength(3);

                // Upper bound should be higher than forecast
                result.values.forEach((val, i) => {
                    expect(result.intervals.upper[i]).toBeGreaterThan(val);
                    expect(result.intervals.lower[i]).toBeLessThan(val);
                });
            });
        });

        describe('Exponential Forecasting', () => {
            test('should generate exponential forecast', () => {
                const data = [100, 112, 125, 140, 157, 176, 197, 220];
                const result = forecaster.forecast(data, {
                    periods: 3,
                    method: 'exponential'
                });

                expect(result).toBeDefined();
                expect(result.method).toBe('exponential');
                expect(result.values).toHaveLength(3);
            });

            test('should handle exponential growth correctly', () => {
                // 10% growth rate
                const data = [100, 110, 121, 133.1, 146.4, 161.1, 177.2, 194.9];
                const result = forecaster.forecast(data, {
                    periods: 2,
                    method: 'exponential'
                });

                // Should continue exponential pattern
                expect(result.values[0]).toBeGreaterThan(200);
            });
        });

        describe('Holt-Winters Forecasting', () => {
            test('should generate Holt-Winters forecast', () => {
                const data = timeSeriesData.arrMonthly.data.map(d => d.value);
                const result = forecaster.forecast(data, {
                    periods: 3,
                    method: 'holt_winters'
                });

                expect(result).toBeDefined();
                expect(result.method).toBe('holt_winters');
                expect(result.values).toHaveLength(3);
            });

            test('should handle seasonal data', () => {
                // Quarterly data with Q4 peaks
                const data = [100, 95, 90, 120, 105, 100, 95, 125, 110, 105, 100, 130];
                const result = forecaster.forecast(data, {
                    periods: 4,
                    method: 'holt_winters',
                    seasonalPeriod: 4
                });

                expect(result.values).toHaveLength(4);
            });
        });

        describe('Ensemble Forecasting', () => {
            test('should generate ensemble forecast', () => {
                const data = timeSeriesData.arrMonthly.data.map(d => d.value);
                const result = forecaster.forecast(data, {
                    periods: 3,
                    method: 'ensemble'
                });

                expect(result).toBeDefined();
                expect(result.method).toBe('ensemble');
                expect(result.componentMethods).toBeDefined();
            });

            test('should combine multiple methods', () => {
                const data = [100, 110, 120, 130, 140, 150, 160, 170];
                const result = forecaster.forecast(data, {
                    periods: 3,
                    method: 'ensemble'
                });

                // Ensemble should have component weights
                expect(result.weights).toBeDefined();
            });
        });

        describe('Error Handling', () => {
            test('should return error for insufficient data', () => {
                const result = forecaster.forecast([100, 200], { periods: 3 });

                expect(result.success).toBe(false);
                expect(result.error).toBeDefined();
            });

            test('should return error for invalid method', () => {
                const result = forecaster.forecast([100, 110, 120, 130, 140], {
                    periods: 3,
                    method: 'invalid_method'
                });

                expect(result.success).toBe(false);
                expect(result.error).toBeDefined();
            });

            test('should return error for zero or negative periods', () => {
                const result = forecaster.forecast([100, 110, 120, 130, 140], { periods: 0 });

                expect(result.success).toBe(false);
                expect(result.error).toBeDefined();
            });
        });
    });

    describe('backtestForecast()', () => {
        test('should perform backtest with holdout', () => {
            const data = timeSeriesData.forecastValidation.trainingData.map(d => d.value)
                .concat(timeSeriesData.forecastValidation.validationData.map(d => d.value));

            const result = forecaster.backtestForecast(data, {
                holdoutPeriods: 4,
                method: 'linear'
            });

            expect(result).toBeDefined();
            expect(result.mae).toBeDefined();
            expect(result.mape).toBeDefined();
            expect(result.rmse).toBeDefined();
            expect(result.predictions).toHaveLength(4);
            expect(result.actuals).toHaveLength(4);
        });

        test('should calculate MAE correctly', () => {
            const data = [100, 105, 110, 115, 120, 125, 130, 135, 140, 145];
            const result = forecaster.backtestForecast(data, {
                holdoutPeriods: 2,
                method: 'linear'
            });

            // MAE should be reasonable for linear data
            expect(result.mae).toBeLessThan(10);
        });

        test('should calculate MAPE correctly', () => {
            const data = [100, 105, 110, 115, 120, 125, 130, 135, 140, 145];
            const result = forecaster.backtestForecast(data, {
                holdoutPeriods: 2,
                method: 'linear'
            });

            // MAPE should be a percentage (decimal form)
            expect(result.mape).toBeGreaterThanOrEqual(0);
            expect(result.mape).toBeLessThan(1); // Less than 100% error
        });

        test('should calculate RMSE correctly', () => {
            const data = [100, 105, 110, 115, 120, 125, 130, 135, 140, 145];
            const result = forecaster.backtestForecast(data, {
                holdoutPeriods: 2,
                method: 'linear'
            });

            // RMSE should be >= MAE
            expect(result.rmse).toBeGreaterThanOrEqual(result.mae);
        });
    });

    describe('generateScenarios()', () => {
        test('should generate optimistic, base, and pessimistic scenarios', () => {
            const data = [100, 110, 120, 130, 140, 150, 160, 170];
            const forecast = forecaster.forecast(data, { periods: 3, method: 'linear' });
            const scenarios = forecaster.generateScenarios(forecast, {
                optimisticMultiplier: 1.2,
                pessimisticMultiplier: 0.8
            });

            expect(scenarios).toBeDefined();
            expect(scenarios.optimistic).toBeDefined();
            expect(scenarios.base).toBeDefined();
            expect(scenarios.pessimistic).toBeDefined();
        });

        test('should have optimistic > base > pessimistic', () => {
            const data = [100, 110, 120, 130, 140, 150, 160, 170];
            const forecast = forecaster.forecast(data, { periods: 3, method: 'linear' });
            const scenarios = forecaster.generateScenarios(forecast);

            scenarios.base.forEach((val, i) => {
                expect(scenarios.optimistic[i]).toBeGreaterThan(val);
                expect(scenarios.pessimistic[i]).toBeLessThan(val);
            });
        });

        test('should include descriptions for each scenario', () => {
            const data = [100, 110, 120, 130, 140, 150, 160, 170];
            const forecast = forecaster.forecast(data, { periods: 3, method: 'linear' });
            const scenarios = forecaster.generateScenarios(forecast);

            expect(scenarios.descriptions).toBeDefined();
            expect(scenarios.descriptions.optimistic).toBeDefined();
            expect(scenarios.descriptions.pessimistic).toBeDefined();
        });
    });

    describe('calculateMAE()', () => {
        test('should calculate Mean Absolute Error', () => {
            const actual = [100, 110, 120, 130];
            const predicted = [102, 108, 122, 128];

            const mae = forecaster.calculateMAE(actual, predicted);

            // |100-102| + |110-108| + |120-122| + |130-128| = 2+2+2+2 = 8 / 4 = 2
            expect(mae).toBe(2);
        });

        test('should return 0 for perfect predictions', () => {
            const actual = [100, 110, 120];
            const predicted = [100, 110, 120];

            expect(forecaster.calculateMAE(actual, predicted)).toBe(0);
        });
    });

    describe('calculateMAPE()', () => {
        test('should calculate Mean Absolute Percentage Error', () => {
            const actual = [100, 200, 300, 400];
            const predicted = [110, 190, 310, 390];

            const mape = forecaster.calculateMAPE(actual, predicted);

            // (10/100 + 10/200 + 10/300 + 10/400) / 4 = 0.0521 = 5.21%
            // Implementation returns percentage form
            expect(mape).toBeCloseTo(5.21, 1);
        });

        test('should handle zero actual values', () => {
            const actual = [0, 100, 200];
            const predicted = [5, 110, 190];

            // Should skip zero values or handle gracefully
            const mape = forecaster.calculateMAPE(actual, predicted);
            expect(isFinite(mape)).toBe(true);
        });
    });

    describe('calculateRMSE()', () => {
        test('should calculate Root Mean Square Error', () => {
            const actual = [100, 110, 120, 130];
            const predicted = [102, 108, 122, 128];

            const rmse = forecaster.calculateRMSE(actual, predicted);

            // sqrt((4 + 4 + 4 + 4) / 4) = sqrt(4) = 2
            expect(rmse).toBe(2);
        });

        test('should return 0 for perfect predictions', () => {
            const actual = [100, 110, 120];
            const predicted = [100, 110, 120];

            expect(forecaster.calculateRMSE(actual, predicted)).toBe(0);
        });
    });

    describe('getRecommendedHorizons()', () => {
        test('should return recommended horizons for ARR', () => {
            const horizons = forecaster.getRecommendedHorizons('ARR');

            expect(horizons).toBeDefined();
            expect(Array.isArray(horizons)).toBe(true);
            expect(horizons.length).toBeGreaterThan(0);

            horizons.forEach(h => {
                expect(h.days).toBeDefined();
                expect(h.confidence).toBeDefined();
                expect(h.confidence).toBeGreaterThan(0);
                expect(h.confidence).toBeLessThanOrEqual(1);
            });
        });

        test('should return different horizons for different KPIs', () => {
            const arrHorizons = forecaster.getRecommendedHorizons('ARR');
            const pipelineHorizons = forecaster.getRecommendedHorizons('PIPELINE');

            // Pipeline is more volatile, so should have shorter horizons
            expect(pipelineHorizons[0].days).toBeLessThanOrEqual(arrHorizons[0].days);
        });

        test('should return default horizons for unknown KPI', () => {
            const horizons = forecaster.getRecommendedHorizons('UNKNOWN_KPI');

            expect(horizons).toBeDefined();
            expect(horizons.length).toBeGreaterThan(0);
        });
    });

    describe('Edge Cases', () => {
        test('should handle constant values', () => {
            const data = [100, 100, 100, 100, 100, 100, 100, 100];
            const result = forecaster.forecast(data, {
                periods: 3,
                method: 'linear'
            });

            // Forecast should be approximately 100
            result.values.forEach(v => {
                expect(v).toBeCloseTo(100, 0);
            });
        });

        test('should handle very small values', () => {
            const data = [0.001, 0.002, 0.003, 0.004, 0.005, 0.006, 0.007, 0.008];
            const result = forecaster.forecast(data, {
                periods: 2,
                method: 'linear'
            });

            expect(result.values[0]).toBeGreaterThan(0.008);
        });

        test('should handle very large values', () => {
            const data = [1e12, 1.1e12, 1.2e12, 1.3e12, 1.4e12, 1.5e12, 1.6e12, 1.7e12];
            const result = forecaster.forecast(data, {
                periods: 2,
                method: 'linear'
            });

            expect(result.values[0]).toBeGreaterThan(1.7e12);
        });

        test('should handle decreasing trend', () => {
            const data = [170, 160, 150, 140, 130, 120, 110, 100];
            const result = forecaster.forecast(data, {
                periods: 3,
                method: 'linear'
            });

            // Forecast should continue decreasing
            expect(result.values[0]).toBeLessThan(100);
        });
    });
});
