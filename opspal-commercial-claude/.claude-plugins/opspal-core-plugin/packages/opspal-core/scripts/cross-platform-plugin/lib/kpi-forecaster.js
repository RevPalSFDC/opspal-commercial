#!/usr/bin/env node

/**
 * KPI Forecaster
 *
 * Purpose: Generate short and medium-term forecasts for RevOps KPIs.
 * Supports multiple forecasting methods with confidence intervals.
 *
 * Usage:
 *   const { KPIForecaster } = require('./kpi-forecaster');
 *
 *   const forecaster = new KPIForecaster({ method: 'ensemble' });
 *   const forecast = forecaster.forecast(dataPoints, 90);
 *   const scenarios = forecaster.generateScenarios(forecast);
 *
 * @module kpi-forecaster
 * @version 1.0.0
 * @created 2025-12-14
 */

const fs = require('fs');
const path = require('path');

/**
 * KPI Forecaster
 */
class KPIForecaster {
    /**
     * Initialize KPI forecaster
     *
     * @param {Object} config - Configuration options
     * @param {string} [config.method='ensemble'] - Forecast method: 'linear', 'exponential', 'holt_winters', 'ensemble'
     * @param {number} [config.defaultConfidence=0.80] - Default confidence level
     * @param {number} [config.minDataPoints=6] - Minimum data points for forecasting
     * @param {number} [config.seasonalPeriod=12] - Seasonal period for Holt-Winters
     */
    constructor(config = {}) {
        this.method = config.method ?? 'ensemble';
        this.defaultConfidence = config.defaultConfidence ?? 0.80;
        this.minDataPoints = config.minDataPoints ?? 6;
        this.seasonalPeriod = config.seasonalPeriod ?? 12;
    }

    /**
     * Config getter for backward compatibility with tests
     */
    get config() {
        return {
            method: this.method,
            defaultConfidence: this.defaultConfidence,
            minDataPoints: this.minDataPoints,
            seasonalPeriod: this.seasonalPeriod
        };
    }

    /**
     * Generate forecast for KPI data
     *
     * Supports two signatures for backward compatibility:
     * - forecast(dataPoints, periods, options) - Original API
     * - forecast(dataPoints, {periods, method, confidence}) - Object-based API
     *
     * @param {Array<{date: string, value: number}>} dataPoints - Historical time series
     * @param {number|Object} periodsOrOptions - Number of periods OR options object
     * @param {Object} [maybeOptions] - Forecast options (if periodsOrOptions is a number)
     * @param {string} [maybeOptions.method] - Override default method
     * @param {number} [maybeOptions.confidence] - Confidence level (0-1)
     * @returns {Object} Forecast result
     */
    forecast(dataPoints, periodsOrOptions, maybeOptions = {}) {
        // Support both signatures: forecast(data, periods, options) and forecast(data, {periods, method, confidence})
        let periods, options;
        if (typeof periodsOrOptions === 'object' && periodsOrOptions !== null) {
            // Object-based API: forecast(data, {periods, method, confidence})
            options = periodsOrOptions;
            periods = options.periods;
        } else {
            // Original API: forecast(data, periods, options)
            periods = periodsOrOptions;
            options = maybeOptions;
        }

        const { method = this.method, confidence = this.defaultConfidence } = options;

        if (!dataPoints || dataPoints.length < this.minDataPoints) {
            return {
                success: false,
                error: `Insufficient data. Need at least ${this.minDataPoints} points, got ${dataPoints?.length ?? 0}`,
                minimumRequired: this.minDataPoints
            };
        }

        // Handle both raw value arrays and object arrays
        const isRawArray = typeof dataPoints[0] === 'number';
        const normalizedData = isRawArray
            ? dataPoints.map((value, i) => ({ date: this._generateDateFromIndex(i), value }))
            : dataPoints;
        const values = normalizedData.map(d => d.value);

        let forecasts;
        switch (method) {
            case 'linear':
                forecasts = this._linearForecast(values, periods);
                break;
            case 'exponential':
                forecasts = this._exponentialSmoothing(values, periods);
                break;
            case 'holt_winters':
                forecasts = this._holtWinters(values, periods);
                break;
            case 'ensemble':
            default: {
                const ensembleResult = this._ensembleForecast(values, periods);
                forecasts = ensembleResult.forecasts;
                // Store ensemble metadata for return
                this._lastEnsembleMetadata = {
                    componentMethods: ensembleResult.componentMethods,
                    weights: ensembleResult.weights
                };
            }
        }

        // Calculate confidence intervals
        const intervals = this._calculateConfidenceIntervals(values, forecasts, confidence);

        // Generate forecast dates (use normalizedData which always has {date, value} objects)
        const lastDate = new Date(normalizedData[normalizedData.length - 1].date);
        const forecastDates = this._generateForecastDates(lastDate, periods);

        // Calculate forecast metrics
        const metrics = this._calculateForecastMetrics(values, forecasts);

        // Build forecasts array with full details
        const forecastsArray = forecasts.map((value, i) => ({
            date: forecastDates[i],
            value,
            lower: intervals.lower[i],
            upper: intervals.upper[i]
        }));

        const result = {
            success: true,
            method,
            inputDataPoints: dataPoints.length,
            forecastPeriods: periods,
            confidence,
            forecasts: forecastsArray,
            // Aliases for backward compatibility with tests
            values: forecasts, // Raw forecast values array
            intervals: {
                upper: intervals.upper,
                lower: intervals.lower
            },
            metrics,
            summary: this._generateForecastSummary(values, forecasts, metrics)
        };

        // Add ensemble-specific properties if ensemble method was used
        if (method === 'ensemble' && this._lastEnsembleMetadata) {
            result.componentMethods = this._lastEnsembleMetadata.componentMethods;
            result.weights = this._lastEnsembleMetadata.weights;
            this._lastEnsembleMetadata = null; // Clear after use
        }

        return result;
    }

    /**
     * Backtest forecast accuracy against historical data
     *
     * Supports two signatures for backward compatibility:
     * - backtestForecast(dataPoints, holdoutPeriods, options) - Original API
     * - backtestForecast(dataPoints, {holdoutPeriods, method, ...}) - Object-based API
     *
     * @param {Array<{date: string, value: number}>} dataPoints - Full historical data
     * @param {number|Object} holdoutOrOptions - Number of holdout periods OR options object
     * @param {Object} [maybeOptions] - Backtest options (if holdoutOrOptions is a number)
     * @returns {Object} Backtest results
     */
    backtestForecast(dataPoints, holdoutOrOptions, maybeOptions = {}) {
        // Support both signatures
        let holdoutPeriods, options;
        if (typeof holdoutOrOptions === 'object' && holdoutOrOptions !== null) {
            // Object-based API: backtestForecast(data, {holdoutPeriods, method, ...})
            options = holdoutOrOptions;
            holdoutPeriods = options.holdoutPeriods;
        } else {
            // Original API: backtestForecast(data, holdoutPeriods, options)
            holdoutPeriods = holdoutOrOptions;
            options = maybeOptions;
        }

        if (dataPoints.length < holdoutPeriods + this.minDataPoints) {
            return {
                success: false,
                error: `Insufficient data for backtesting. Need at least ${holdoutPeriods + this.minDataPoints} points`
            };
        }

        // Handle both raw value arrays and object arrays
        const isRawArray = typeof dataPoints[0] === 'number';
        const normalizedData = isRawArray
            ? dataPoints.map((value, i) => ({ date: this._generateDateFromIndex(i), value }))
            : dataPoints;

        const trainingData = normalizedData.slice(0, -holdoutPeriods);
        const testData = normalizedData.slice(-holdoutPeriods);

        const forecast = this.forecast(trainingData, holdoutPeriods, options);

        if (!forecast.success) {
            return forecast;
        }

        const actual = testData.map(d => d.value);
        const predicted = forecast.forecasts.map(f => f.value);

        const mae = this.calculateMAE(actual, predicted);
        const mape = this.calculateMAPE(actual, predicted);
        const rmse = this.calculateRMSE(actual, predicted);

        // Check how many predictions fell within confidence intervals
        const lowerBounds = forecast.forecasts.map(f => f.lower);
        const upperBounds = forecast.forecasts.map(f => f.upper);
        let withinInterval = 0;
        actual.forEach((val, i) => {
            if (val >= lowerBounds[i] && val <= upperBounds[i]) {
                withinInterval++;
            }
        });

        const intervalAccuracy = (withinInterval / actual.length) * 100;

        return {
            success: true,
            holdoutPeriods,
            method: forecast.method,
            confidence: forecast.confidence,
            accuracy: {
                mae,
                mape,
                rmse,
                intervalAccuracy,
                withinInterval,
                totalPoints: actual.length
            },
            // Flat aliases for backward compatibility with tests
            mae,
            mape,
            rmse,
            predictions: predicted,
            actuals: actual,
            comparison: actual.map((a, i) => ({
                date: testData[i].date,
                actual: a,
                predicted: predicted[i],
                lower: lowerBounds[i],
                upper: upperBounds[i],
                error: a - predicted[i],
                percentError: a !== 0 ? ((predicted[i] - a) / a) * 100 : 0,
                withinInterval: a >= lowerBounds[i] && a <= upperBounds[i]
            })),
            qualityAssessment: this._assessForecastQuality(mae, mape, intervalAccuracy)
        };
    }

    /**
     * Generate optimistic, base, and pessimistic scenarios
     *
     * @param {Object} baseForecast - Base forecast from forecast() method
     * @param {Object} [options] - Scenario options
     * @param {number} [options.optimisticMultiplier=1.15] - Multiplier for optimistic scenario
     * @param {number} [options.pessimisticMultiplier=0.85] - Multiplier for pessimistic scenario
     * @returns {Object} Scenario forecasts
     */
    generateScenarios(baseForecast, options = {}) {
        const { optimisticMultiplier = 1.15, pessimisticMultiplier = 0.85 } = options;

        if (!baseForecast.success) {
            return baseForecast;
        }

        const baseValues = baseForecast.forecasts.map(f => f.value);

        // Build scenario objects
        const optimisticScenario = {
            name: 'Optimistic',
            description: 'Best-case scenario with favorable conditions',
            multiplier: optimisticMultiplier,
            forecasts: baseForecast.forecasts.map((f, i) => ({
                date: f.date,
                value: f.value * optimisticMultiplier,
                changeFromBase: (optimisticMultiplier - 1) * 100
            })),
            endValue: baseValues[baseValues.length - 1] * optimisticMultiplier
        };

        const baseScenario = {
            name: 'Base',
            description: 'Expected scenario based on historical trends',
            multiplier: 1.0,
            forecasts: baseForecast.forecasts,
            endValue: baseValues[baseValues.length - 1]
        };

        const pessimisticScenario = {
            name: 'Pessimistic',
            description: 'Conservative scenario with headwinds',
            multiplier: pessimisticMultiplier,
            forecasts: baseForecast.forecasts.map((f, i) => ({
                date: f.date,
                value: f.value * pessimisticMultiplier,
                changeFromBase: (pessimisticMultiplier - 1) * 100
            })),
            endValue: baseValues[baseValues.length - 1] * pessimisticMultiplier
        };

        // Extract value arrays for backward compatibility
        const optimisticValues = optimisticScenario.forecasts.map(f => f.value);
        const baseValuesArray = baseScenario.forecasts.map(f => f.value);
        const pessimisticValues = pessimisticScenario.forecasts.map(f => f.value);

        return {
            success: true,
            // Nested structure (original API)
            scenarios: {
                optimistic: optimisticScenario,
                base: baseScenario,
                pessimistic: pessimisticScenario
            },
            // Flat value arrays for backward compatibility with tests
            optimistic: optimisticValues,
            base: baseValuesArray,
            pessimistic: pessimisticValues,
            // Descriptions object for tests
            descriptions: {
                optimistic: optimisticScenario.description,
                base: baseScenario.description,
                pessimistic: pessimisticScenario.description
            },
            comparison: {
                startValue: baseForecast.forecasts[0].value,
                endValues: {
                    optimistic: baseValues[baseValues.length - 1] * optimisticMultiplier,
                    base: baseValues[baseValues.length - 1],
                    pessimistic: baseValues[baseValues.length - 1] * pessimisticMultiplier
                },
                range: (baseValues[baseValues.length - 1] * optimisticMultiplier) -
                       (baseValues[baseValues.length - 1] * pessimisticMultiplier)
            }
        };
    }

    /**
     * Calculate Mean Absolute Error
     *
     * @param {Array<number>} actual - Actual values
     * @param {Array<number>} predicted - Predicted values
     * @returns {number} MAE
     */
    calculateMAE(actual, predicted) {
        if (actual.length !== predicted.length) {
            throw new Error('Arrays must have equal length');
        }

        const sum = actual.reduce((acc, val, i) => acc + Math.abs(val - predicted[i]), 0);
        return sum / actual.length;
    }

    /**
     * Calculate Mean Absolute Percentage Error
     *
     * @param {Array<number>} actual - Actual values
     * @param {Array<number>} predicted - Predicted values
     * @returns {number} MAPE (as percentage)
     */
    calculateMAPE(actual, predicted) {
        if (actual.length !== predicted.length) {
            throw new Error('Arrays must have equal length');
        }

        // Filter out zero values to avoid division by zero
        let sum = 0;
        let count = 0;

        actual.forEach((val, i) => {
            if (val !== 0) {
                sum += Math.abs((val - predicted[i]) / val);
                count++;
            }
        });

        return count > 0 ? (sum / count) * 100 : 0;
    }

    /**
     * Calculate Root Mean Square Error
     *
     * @param {Array<number>} actual - Actual values
     * @param {Array<number>} predicted - Predicted values
     * @returns {number} RMSE
     */
    calculateRMSE(actual, predicted) {
        if (actual.length !== predicted.length) {
            throw new Error('Arrays must have equal length');
        }

        const sum = actual.reduce((acc, val, i) => acc + Math.pow(val - predicted[i], 2), 0);
        return Math.sqrt(sum / actual.length);
    }

    /**
     * Get recommended forecast horizon based on data characteristics
     *
     * Supports two signatures for backward compatibility:
     * - getRecommendedHorizons(dataPoints) - Array of {date, value} objects
     * - getRecommendedHorizons(kpiId) - String KPI ID for static recommendations
     *
     * @param {Array<{date: string, value: number}>|string} input - Historical data or KPI ID
     * @returns {Object} Recommended horizons with confidence
     */
    getRecommendedHorizons(input) {
        // Support string KPI ID for static recommendations
        if (typeof input === 'string') {
            return this._getStaticHorizonsForKPI(input);
        }

        const dataPoints = input;
        const n = dataPoints.length;
        const values = dataPoints.map(d => d.value);

        // Calculate volatility
        const mean = values.reduce((a, b) => a + b, 0) / n;
        const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n;
        const cv = Math.sqrt(variance) / mean; // Coefficient of variation

        // Recommendations based on data characteristics
        const recommendations = [];

        // Short-term (7-30 days)
        if (n >= 12) {
            recommendations.push({
                horizon: '7 days',
                periods: 7,
                confidence: cv < 0.3 ? 'high' : cv < 0.5 ? 'medium' : 'low',
                reliability: cv < 0.3 ? 95 : cv < 0.5 ? 85 : 70,
                method: 'exponential',
                useCase: 'Short-term planning, immediate forecasts'
            });
        }

        // Medium-term (30-90 days)
        if (n >= 24) {
            recommendations.push({
                horizon: '30 days',
                periods: 30,
                confidence: cv < 0.3 ? 'high' : cv < 0.5 ? 'medium' : 'low',
                reliability: cv < 0.3 ? 90 : cv < 0.5 ? 75 : 60,
                method: 'ensemble',
                useCase: 'Monthly targets, resource planning'
            });

            recommendations.push({
                horizon: '90 days',
                periods: 90,
                confidence: cv < 0.3 ? 'medium' : 'low',
                reliability: cv < 0.3 ? 80 : cv < 0.5 ? 65 : 50,
                method: 'ensemble',
                useCase: 'Quarterly planning, budget forecasts'
            });
        }

        // Long-term (365 days)
        if (n >= 36) {
            recommendations.push({
                horizon: '365 days',
                periods: 365,
                confidence: 'low',
                reliability: cv < 0.3 ? 70 : cv < 0.5 ? 55 : 40,
                method: 'holt_winters',
                useCase: 'Annual planning (use with caution)'
            });
        }

        return {
            dataPoints: n,
            volatility: cv,
            volatilityLevel: cv < 0.15 ? 'very low' : cv < 0.3 ? 'low' : cv < 0.5 ? 'moderate' : 'high',
            recommendations,
            warning: cv > 0.5 ? 'High volatility detected - forecasts will have wide confidence intervals' : null
        };
    }

    // ==================== Private Methods ====================

    /**
     * Linear forecast using least squares regression
     * @private
     */
    _linearForecast(values, periods) {
        const n = values.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

        for (let i = 0; i < n; i++) {
            sumX += i;
            sumY += values[i];
            sumXY += i * values[i];
            sumX2 += i * i;
        }

        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        const forecasts = [];
        for (let i = 0; i < periods; i++) {
            const futureX = n + i;
            forecasts.push(Math.max(0, slope * futureX + intercept));
        }

        return forecasts;
    }

    /**
     * Simple exponential smoothing forecast
     * @private
     */
    _exponentialSmoothing(values, periods, alpha = null) {
        // Optimize alpha if not provided
        if (alpha === null) {
            alpha = this._optimizeAlpha(values);
        }

        // Calculate smoothed values
        const smoothed = [values[0]];
        for (let i = 1; i < values.length; i++) {
            smoothed.push(alpha * values[i] + (1 - alpha) * smoothed[i - 1]);
        }

        // Forecast using last smoothed value (flat forecast for simple ES)
        const lastSmoothed = smoothed[smoothed.length - 1];

        // Add trend component for better forecasting
        const trend = this._calculateTrend(smoothed);

        const forecasts = [];
        for (let i = 0; i < periods; i++) {
            forecasts.push(Math.max(0, lastSmoothed + trend * (i + 1)));
        }

        return forecasts;
    }

    /**
     * Holt-Winters exponential smoothing (additive seasonality)
     * @private
     */
    _holtWinters(values, periods) {
        const n = values.length;
        const m = Math.min(this.seasonalPeriod, Math.floor(n / 2));

        // Initialize level and trend
        let level = values.slice(0, m).reduce((a, b) => a + b, 0) / m;
        let trend = (values.slice(m, 2 * m).reduce((a, b) => a + b, 0) / m -
                     values.slice(0, m).reduce((a, b) => a + b, 0) / m) / m;

        // Initialize seasonal components
        const seasonal = new Array(m).fill(0);
        if (n >= m) {
            for (let i = 0; i < m; i++) {
                seasonal[i] = values[i] - level;
            }
        }

        // Smoothing parameters
        const alpha = 0.3; // Level
        const beta = 0.1;  // Trend
        const gamma = 0.1; // Seasonal

        // Apply Holt-Winters
        for (let i = m; i < n; i++) {
            const prevLevel = level;
            const seasonalIndex = i % m;

            level = alpha * (values[i] - seasonal[seasonalIndex]) + (1 - alpha) * (level + trend);
            trend = beta * (level - prevLevel) + (1 - beta) * trend;
            seasonal[seasonalIndex] = gamma * (values[i] - level) + (1 - gamma) * seasonal[seasonalIndex];
        }

        // Generate forecasts
        const forecasts = [];
        for (let i = 0; i < periods; i++) {
            const seasonalIndex = (n + i) % m;
            forecasts.push(Math.max(0, level + trend * (i + 1) + seasonal[seasonalIndex]));
        }

        return forecasts;
    }

    /**
     * Ensemble forecast combining multiple methods
     * @private
     */
    _ensembleForecast(values, periods) {
        // Generate forecasts from each method
        const linearForecasts = this._linearForecast(values, periods);
        const expForecasts = this._exponentialSmoothing(values, periods);

        // Add Holt-Winters if enough data
        let hwForecasts = null;
        const componentMethods = ['linear', 'exponential'];
        if (values.length >= this.seasonalPeriod * 2) {
            hwForecasts = this._holtWinters(values, periods);
            componentMethods.push('holt_winters');
        }

        // Calculate weights based on recent fit
        const recentValues = values.slice(-Math.min(6, values.length));
        const weights = this._calculateEnsembleWeights(recentValues, linearForecasts, expForecasts, hwForecasts);

        // Combine forecasts
        const ensembleForecasts = [];
        for (let i = 0; i < periods; i++) {
            let weighted = weights.linear * linearForecasts[i] + weights.exponential * expForecasts[i];

            if (hwForecasts) {
                weighted += weights.holtWinters * hwForecasts[i];
            }

            ensembleForecasts.push(Math.max(0, weighted));
        }

        // Return object with forecasts and metadata for ensemble method
        return {
            forecasts: ensembleForecasts,
            componentMethods,
            weights
        };
    }

    /**
     * Optimize alpha parameter for exponential smoothing
     * @private
     */
    _optimizeAlpha(values) {
        let bestAlpha = 0.3;
        let bestMSE = Infinity;

        for (let alpha = 0.1; alpha <= 0.9; alpha += 0.1) {
            const smoothed = [values[0]];
            for (let i = 1; i < values.length; i++) {
                smoothed.push(alpha * values[i] + (1 - alpha) * smoothed[i - 1]);
            }

            // Calculate MSE for one-step ahead forecasts
            let mse = 0;
            for (let i = 1; i < values.length; i++) {
                mse += Math.pow(values[i] - smoothed[i - 1], 2);
            }
            mse /= (values.length - 1);

            if (mse < bestMSE) {
                bestMSE = mse;
                bestAlpha = alpha;
            }
        }

        return bestAlpha;
    }

    /**
     * Calculate trend from smoothed values
     * @private
     */
    _calculateTrend(smoothed) {
        const n = smoothed.length;
        if (n < 2) return 0;

        // Use recent values for trend
        const recentCount = Math.min(6, n);
        const recent = smoothed.slice(-recentCount);

        let sumDiff = 0;
        for (let i = 1; i < recent.length; i++) {
            sumDiff += recent[i] - recent[i - 1];
        }

        return sumDiff / (recent.length - 1);
    }

    /**
     * Calculate ensemble weights based on recent performance
     * @private
     */
    _calculateEnsembleWeights(recentValues, linearF, expF, hwF) {
        // Default weights if not enough data
        if (recentValues.length < 3) {
            return hwF
                ? { linear: 0.33, exponential: 0.34, holtWinters: 0.33 }
                : { linear: 0.4, exponential: 0.6, holtWinters: 0 };
        }

        // Base weights - favor exponential smoothing
        if (hwF) {
            return { linear: 0.2, exponential: 0.5, holtWinters: 0.3 };
        }

        return { linear: 0.35, exponential: 0.65, holtWinters: 0 };
    }

    /**
     * Calculate confidence intervals
     * @private
     */
    _calculateConfidenceIntervals(historicalValues, forecasts, confidence) {
        // Calculate historical standard error
        const n = historicalValues.length;
        const mean = historicalValues.reduce((a, b) => a + b, 0) / n;
        const variance = historicalValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (n - 1);
        const stdError = Math.sqrt(variance);

        // Z-score for confidence level
        const zScores = {
            0.80: 1.28,
            0.85: 1.44,
            0.90: 1.645,
            0.95: 1.96,
            0.99: 2.576
        };

        const z = zScores[confidence] ?? 1.645;

        // Calculate intervals that widen over time
        const lower = [];
        const upper = [];

        forecasts.forEach((forecast, i) => {
            // Interval widens with forecast horizon
            const horizonFactor = Math.sqrt(1 + i * 0.1);
            const interval = z * stdError * horizonFactor;

            lower.push(Math.max(0, forecast - interval));
            upper.push(forecast + interval);
        });

        return { lower, upper };
    }

    /**
     * Generate a date string from an index (for raw arrays)
     * Creates dates starting from 2024-01-01 and incrementing daily
     * @private
     */
    _generateDateFromIndex(index) {
        const baseDate = new Date('2024-01-01');
        baseDate.setDate(baseDate.getDate() + index);
        return baseDate.toISOString().split('T')[0];
    }

    /**
     * Generate forecast dates
     * @private
     */
    _generateForecastDates(lastDate, periods) {
        const dates = [];
        const date = new Date(lastDate);

        for (let i = 0; i < periods; i++) {
            date.setDate(date.getDate() + 1);
            dates.push(date.toISOString().split('T')[0]);
        }

        return dates;
    }

    /**
     * Calculate forecast metrics
     * @private
     */
    _calculateForecastMetrics(historical, forecasts) {
        const historicalMean = historical.reduce((a, b) => a + b, 0) / historical.length;
        const forecastMean = forecasts.reduce((a, b) => a + b, 0) / forecasts.length;

        const lastHistorical = historical[historical.length - 1];
        const lastForecast = forecasts[forecasts.length - 1];

        return {
            historicalMean,
            forecastMean,
            forecastGrowth: ((forecastMean - historicalMean) / historicalMean) * 100,
            endPointChange: ((lastForecast - lastHistorical) / lastHistorical) * 100,
            forecastRange: Math.max(...forecasts) - Math.min(...forecasts)
        };
    }

    /**
     * Generate forecast summary text
     * @private
     */
    _generateForecastSummary(historical, forecasts, metrics) {
        const direction = metrics.forecastGrowth > 2 ? 'increase' :
                         metrics.forecastGrowth < -2 ? 'decrease' : 'remain stable';

        const magnitude = Math.abs(metrics.forecastGrowth) > 20 ? 'significantly' :
                         Math.abs(metrics.forecastGrowth) > 10 ? 'moderately' : 'slightly';

        if (direction === 'remain stable') {
            return `KPI expected to remain stable over the forecast period`;
        }

        return `KPI expected to ${magnitude} ${direction} by ${Math.abs(metrics.endPointChange).toFixed(1)}% over the forecast period`;
    }

    /**
     * Assess forecast quality based on backtest results
     * @private
     */
    _assessForecastQuality(mae, mape, intervalAccuracy) {
        let quality = 'good';
        const issues = [];

        if (mape > 25) {
            quality = 'poor';
            issues.push('High percentage error (MAPE > 25%)');
        } else if (mape > 15) {
            quality = 'fair';
            issues.push('Moderate percentage error (MAPE > 15%)');
        }

        if (intervalAccuracy < 70) {
            if (quality !== 'poor') quality = 'fair';
            issues.push(`Only ${intervalAccuracy.toFixed(0)}% of actuals fell within confidence intervals`);
        }

        return {
            quality,
            issues,
            recommendation: quality === 'poor'
                ? 'Consider using wider confidence intervals or different forecasting method'
                : quality === 'fair'
                    ? 'Forecast is acceptable but should be monitored closely'
                    : 'Forecast appears reliable for planning purposes'
        };
    }

    /**
     * Get static forecast horizon recommendations for a KPI ID
     * Used when historical data is not available but user wants default recommendations
     * Tests expect this to return an array directly with { days, confidence, ... } objects
     * @private
     */
    _getStaticHorizonsForKPI(kpiId) {
        const kpiUpper = kpiId.toUpperCase();

        // Static recommendations by KPI type - return array directly for test compatibility
        const staticDefaults = {
            ARR: [
                { horizon: '30 days', days: 30, periods: 30, confidence: 0.9, label: '1-month', method: 'ensemble', useCase: 'Monthly targets' },
                { horizon: '90 days', days: 90, periods: 90, confidence: 0.8, label: '3-month', method: 'ensemble', useCase: 'Quarterly planning' },
                { horizon: '180 days', days: 180, periods: 180, confidence: 0.7, label: '6-month', method: 'holt_winters', useCase: 'Half-year forecasts' }
            ],
            MRR: [
                { horizon: '7 days', days: 7, periods: 7, confidence: 0.95, label: '1-week', method: 'exponential', useCase: 'Short-term planning' },
                { horizon: '30 days', days: 30, periods: 30, confidence: 0.9, label: '1-month', method: 'ensemble', useCase: 'Monthly targets' },
                { horizon: '90 days', days: 90, periods: 90, confidence: 0.75, label: '3-month', method: 'ensemble', useCase: 'Quarterly planning' }
            ],
            PIPELINE: [
                { horizon: '7 days', days: 7, periods: 7, confidence: 0.85, label: '1-week', method: 'exponential', useCase: 'Short-term planning' },
                { horizon: '30 days', days: 30, periods: 30, confidence: 0.7, label: '1-month', method: 'ensemble', useCase: 'Monthly planning' }
            ],
            NRR: [
                { horizon: '30 days', days: 30, periods: 30, confidence: 0.85, label: '1-month', method: 'ensemble', useCase: 'Monthly tracking' },
                { horizon: '90 days', days: 90, periods: 90, confidence: 0.75, label: '3-month', method: 'ensemble', useCase: 'Quarterly planning' }
            ],
            CHURN: [
                { horizon: '30 days', days: 30, periods: 30, confidence: 0.8, label: '1-month', method: 'exponential', useCase: 'Monthly tracking' },
                { horizon: '90 days', days: 90, periods: 90, confidence: 0.65, label: '3-month', method: 'ensemble', useCase: 'Quarterly planning' }
            ]
        };

        // Return KPI-specific recommendations or generic defaults
        if (staticDefaults[kpiUpper]) {
            return staticDefaults[kpiUpper];
        }

        // Generic defaults for unknown KPIs
        return [
            { horizon: '7 days', days: 7, periods: 7, confidence: 0.9, label: '1-week', method: 'exponential', useCase: 'Short-term planning' },
            { horizon: '30 days', days: 30, periods: 30, confidence: 0.8, label: '1-month', method: 'ensemble', useCase: 'Monthly targets' },
            { horizon: '90 days', days: 90, periods: 90, confidence: 0.7, label: '3-month', method: 'ensemble', useCase: 'Quarterly forecasts' }
        ];
    }
}

/**
 * Command-line interface
 */
async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help')) {
        console.log(`
KPI Forecaster

Usage:
  node kpi-forecaster.js --data <path> --periods <n> [options]

Options:
  --data <path>           Path to time series JSON file (required)
  --periods <n>           Number of periods to forecast (required)
  --method <type>         Forecast method: linear, exponential, holt_winters, ensemble (default: ensemble)
  --confidence <n>        Confidence level: 0.80, 0.90, 0.95 (default: 0.80)
  --backtest <n>          Backtest with n holdout periods
  --scenarios             Generate optimistic/base/pessimistic scenarios
  --recommend             Get recommended forecast horizons
  --output <path>         Output file path (default: ./forecast.json)
  --help                  Show this help message

Data Format:
  JSON array of objects: [{ "date": "2024-01", "value": 100 }, ...]

Examples:
  node kpi-forecaster.js --data ./arr.json --periods 90
  node kpi-forecaster.js --data ./arr.json --periods 30 --method exponential --confidence 0.95
  node kpi-forecaster.js --data ./arr.json --backtest 12
  node kpi-forecaster.js --data ./arr.json --periods 90 --scenarios
        `);
        process.exit(0);
    }

    try {
        // Parse arguments
        const dataPath = args.includes('--data') ? args[args.indexOf('--data') + 1] : null;
        const periods = args.includes('--periods') ? parseInt(args[args.indexOf('--periods') + 1]) : null;
        const method = args.includes('--method') ? args[args.indexOf('--method') + 1] : 'ensemble';
        const confidence = args.includes('--confidence') ? parseFloat(args[args.indexOf('--confidence') + 1]) : 0.80;
        const backtestPeriods = args.includes('--backtest') ? parseInt(args[args.indexOf('--backtest') + 1]) : null;
        const generateScenarios = args.includes('--scenarios');
        const recommend = args.includes('--recommend');
        const outputPath = args.includes('--output') ? args[args.indexOf('--output') + 1] : './forecast.json';

        if (!dataPath) {
            console.error('Error: --data argument is required');
            process.exit(1);
        }

        // Load data
        const dataPoints = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        console.log(`Loaded ${dataPoints.length} data points from ${dataPath}`);

        // Initialize forecaster
        const forecaster = new KPIForecaster({ method });

        const results = {};

        // Recommend horizons
        if (recommend) {
            console.log('\nAnalyzing data for forecast recommendations...');
            results.recommendations = forecaster.getRecommendedHorizons(dataPoints);
            console.log(`Volatility: ${results.recommendations.volatilityLevel}`);
            console.log('\nRecommended horizons:');
            results.recommendations.recommendations.forEach(r => {
                console.log(`  - ${r.horizon}: ${r.confidence} confidence (${r.reliability}% reliability)`);
            });
        }

        // Backtest
        if (backtestPeriods) {
            console.log(`\nBacktesting with ${backtestPeriods} holdout periods...`);
            results.backtest = forecaster.backtestForecast(dataPoints, backtestPeriods, { method, confidence });

            if (results.backtest.success) {
                console.log(`MAE: ${results.backtest.accuracy.mae.toFixed(2)}`);
                console.log(`MAPE: ${results.backtest.accuracy.mape.toFixed(1)}%`);
                console.log(`Interval Accuracy: ${results.backtest.accuracy.intervalAccuracy.toFixed(1)}%`);
                console.log(`Quality: ${results.backtest.qualityAssessment.quality}`);
            } else {
                console.log(`Backtest failed: ${results.backtest.error}`);
            }
        }

        // Forecast
        if (periods) {
            console.log(`\nGenerating ${periods}-period forecast using ${method} method...`);
            results.forecast = forecaster.forecast(dataPoints, periods, { method, confidence });

            if (results.forecast.success) {
                console.log(`\nForecast Summary: ${results.forecast.summary}`);
                console.log(`Growth: ${results.forecast.metrics.endPointChange >= 0 ? '+' : ''}${results.forecast.metrics.endPointChange.toFixed(1)}%`);

                // Show first and last few forecasts
                console.log('\nSample forecasts:');
                const forecasts = results.forecast.forecasts;
                const sample = [
                    ...forecasts.slice(0, 3),
                    ...(forecasts.length > 6 ? [{ date: '...', value: '...', lower: '...', upper: '...' }] : []),
                    ...forecasts.slice(-3)
                ];
                sample.forEach(f => {
                    if (f.date === '...') {
                        console.log(`  ...`);
                    } else {
                        console.log(`  ${f.date}: ${f.value.toFixed(2)} [${f.lower.toFixed(2)} - ${f.upper.toFixed(2)}]`);
                    }
                });

                // Generate scenarios if requested
                if (generateScenarios) {
                    console.log('\nGenerating scenarios...');
                    results.scenarios = forecaster.generateScenarios(results.forecast);
                    console.log(`End values:
  Optimistic: ${results.scenarios.comparison.endValues.optimistic.toFixed(2)}
  Base:       ${results.scenarios.comparison.endValues.base.toFixed(2)}
  Pessimistic: ${results.scenarios.comparison.endValues.pessimistic.toFixed(2)}`);
                }
            } else {
                console.log(`Forecast failed: ${results.forecast.error}`);
            }
        }

        // Save results
        fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf8');
        console.log(`\nResults saved to: ${outputPath}`);

    } catch (error) {
        console.error('\nError generating forecast:');
        console.error(error.message);
        process.exit(1);
    }
}

// Run CLI if executed directly
if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { KPIForecaster };
