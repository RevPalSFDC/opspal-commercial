#!/usr/bin/env node

/**
 * Trend Analysis Engine
 *
 * Purpose: Detect and analyze trends in RevOps KPI data over time.
 * Identifies patterns, seasonality, anomalies, and trend reversals.
 *
 * Usage:
 *   const { TrendAnalysisEngine } = require('./trend-analysis-engine');
 *
 *   const engine = new TrendAnalysisEngine({ sensitivity: 2.0 });
 *   const analysis = engine.analyzeTrend(dataPoints);
 *   const anomalies = engine.detectAnomalies(dataPoints);
 *
 * @module trend-analysis-engine
 * @version 1.0.0
 * @created 2025-12-14
 */

const fs = require('fs');
const path = require('path');

/**
 * Trend Analysis Engine
 */
class TrendAnalysisEngine {
    /**
     * Initialize trend analysis engine
     *
     * @param {Object} config - Configuration options
     * @param {number} [config.sensitivity=2.0] - Anomaly detection sensitivity (standard deviations)
     * @param {number} [config.minDataPoints=4] - Minimum data points for trend analysis
     * @param {number} [config.seasonalPeriod=12] - Default seasonal period (months)
     */
    constructor(config = {}) {
        this.sensitivity = config.sensitivity ?? 2.0;
        this.minDataPoints = config.minDataPoints ?? 4;
        this.seasonalPeriod = config.seasonalPeriod ?? 12;
        this.defaultWindow = config.defaultWindow ?? 3;
    }

    /**
     * Config getter for backward compatibility with tests
     * @returns {Object} Configuration object
     */
    get config() {
        return {
            sensitivity: this.sensitivity,
            minDataPoints: this.minDataPoints,
            seasonalPeriod: this.seasonalPeriod,
            defaultWindow: this.defaultWindow
        };
    }

    /**
     * Detect acceleration or deceleration in trend (public wrapper)
     *
     * @param {Array<number>} values - Data values
     * @returns {Object} Acceleration analysis with status and rate
     */
    detectAcceleration(values) {
        const result = this._detectAcceleration(values);
        // Map internal property names to test-expected names
        return {
            status: result.type,           // 'accelerating', 'decelerating', 'stable'
            type: result.type,             // Keep original for backward compatibility
            rate: result.magnitude,        // Alias magnitude as rate
            magnitude: result.magnitude    // Keep original
        };
    }

    /**
     * Find inflection points where trend reverses (public wrapper)
     *
     * @param {Array<{date: string, value: number}>|Array<number>} data - Time series data or values
     * @returns {Array<Object>} Array of inflection points
     */
    findInflectionPoints(data) {
        // Handle both array of objects and array of numbers
        const dataPoints = Array.isArray(data) && typeof data[0] === 'number'
            ? data.map((value, i) => ({ date: `point-${i}`, value }))
            : data;
        return this._findInflectionPoints(dataPoints);
    }

    /**
     * Detect trend type and direction from data points
     *
     * @param {Array<{date: string, value: number}>|Array<number>} dataPoints - Time series data or raw values
     * @param {Object} [options] - Analysis options
     * @param {string} [options.method='auto'] - Trend method: 'linear', 'exponential', 'auto'
     * @returns {Object} Trend analysis result
     */
    detectTrend(dataPoints, options = {}) {
        const { method = 'auto' } = options;

        if (!dataPoints || dataPoints.length < this.minDataPoints) {
            return {
                success: false,
                error: `Insufficient data points. Need at least ${this.minDataPoints}, got ${dataPoints?.length ?? 0}`
            };
        }

        // Handle both array of objects and array of numbers
        const isRawArray = typeof dataPoints[0] === 'number';
        const normalizedData = isRawArray
            ? dataPoints.map((value, i) => ({ date: `point-${i}`, value }))
            : dataPoints;
        const values = normalizedData.map(d => d.value);
        const n = values.length;

        // Calculate linear regression
        const linearFit = this._linearRegression(values);

        // Calculate exponential fit if all values positive
        let exponentialFit = null;
        if (values.every(v => v > 0)) {
            exponentialFit = this._exponentialRegression(values);
        }

        // Determine best fit
        let bestMethod = method;
        if (method === 'auto') {
            if (exponentialFit && exponentialFit.rSquared > linearFit.rSquared + 0.05) {
                bestMethod = 'exponential';
            } else {
                bestMethod = 'linear';
            }
        }

        const fit = bestMethod === 'exponential' ? exponentialFit : linearFit;

        // Determine trend direction
        let direction = 'stable';
        const threshold = 0.01; // 1% threshold for significance
        if (fit.slope > threshold) {
            direction = 'increasing';
        } else if (fit.slope < -threshold) {
            direction = 'decreasing';
        }

        // Calculate trend strength
        const strength = this._calculateTrendStrength(fit.rSquared, fit.slope, values);

        // Detect acceleration/deceleration
        const acceleration = this._detectAcceleration(values);

        // Find inflection points
        const inflectionPoints = this._findInflectionPoints(normalizedData);

        return {
            success: true,
            type: bestMethod,  // Alias for method (tests expect 'type')
            method: bestMethod,
            direction,
            strength,
            slope: fit.slope,
            intercept: fit.intercept,
            rSquared: fit.rSquared,
            r2: fit.rSquared,  // Alias for backward compatibility with tests
            acceleration,
            inflectionPoints,
            summary: this._generateTrendSummary(direction, strength, fit.slope, acceleration),
            dataPoints: n,
            startValue: values[0],
            endValue: values[n - 1],
            percentChange: ((values[n - 1] - values[0]) / values[0]) * 100
        };
    }

    /**
     * Calculate moving average
     *
     * @param {Array<number>} data - Data points
     * @param {number} window - Window size
     * @param {string} [type='simple'] - Moving average type: 'simple', 'exponential', 'weighted'
     * @returns {Array<number>} Moving average values
     */
    calculateMovingAverage(data, window, type = 'simple') {
        if (window > data.length) {
            throw new Error(`Window size ${window} is larger than data length ${data.length}`);
        }

        const result = [];

        // Normalize type aliases
        const normalizedType = type === 'sma' ? 'simple' :
                               type === 'ema' ? 'exponential' :
                               type === 'wma' ? 'weighted' : type;

        switch (normalizedType) {
            case 'exponential':
                return this._calculateEMA(data, window);

            case 'weighted':
                return this._calculateWMA(data, window);

            case 'simple':
            default:
                // Return null-padded array (same length as input)
                for (let i = 0; i < data.length; i++) {
                    if (i < window - 1) {
                        result.push(null);
                    } else {
                        const sum = data.slice(i - window + 1, i + 1).reduce((a, b) => a + b, 0);
                        result.push(sum / window);
                    }
                }
                return result;
        }
    }

    /**
     * Detect seasonality in data
     *
     * @param {Array<number>} data - Data points
     * @param {number|string} [period] - Expected period (number or string like 'quarterly')
     * @returns {Object} Seasonality analysis
     */
    detectSeasonality(data, period = null) {
        // Convert string period names to numeric values
        const periodMapping = {
            'monthly': 12,
            'quarterly': 4,
            'q': 4,
            'semi-annual': 6,
            'annual': 12,
            'yearly': 12
        };

        let numericPeriod = period;
        let requestedPeriodName = null;
        if (typeof period === 'string') {
            requestedPeriodName = period.toLowerCase();
            numericPeriod = periodMapping[requestedPeriodName] || parseInt(period, 10) || null;
        }

        // Minimum data required: 2 complete cycles for specific period, or 12 for auto-detect
        const minRequired = numericPeriod ? numericPeriod * 2 : 12;
        if (data.length < minRequired) {
            return {
                detected: false,
                reason: `insufficient data for seasonality detection (need ${minRequired}+ points)`,
                strength: 0
            };
        }

        const testPeriods = numericPeriod ? [numericPeriod] : [4, 6, 12]; // Quarterly, semi-annual, annual
        let bestPeriod = null;
        let bestScore = 0;

        for (const p of testPeriods) {
            if (data.length < p * 2) continue;

            const score = this._calculateSeasonalityScore(data, p);
            if (score > bestScore && score > 0.3) {
                bestScore = score;
                bestPeriod = p;
            }
        }

        if (!bestPeriod) {
            return {
                detected: false,
                reason: 'No significant seasonality detected',
                testedPeriods: testPeriods,
                strength: bestScore // Include strength even when not detected
            };
        }

        // Calculate seasonal indices
        const indices = this._calculateSeasonalIndices(data, bestPeriod);

        // Return period in string format if originally requested as string
        const periodValue = requestedPeriodName || this._getPeriodLabel(bestPeriod).toLowerCase();

        return {
            detected: true,
            period: periodValue,
            periodNumeric: bestPeriod,
            periodLabel: this._getPeriodLabel(bestPeriod),
            strength: bestScore,
            seasonalIndices: indices,
            peakIndex: indices.indexOf(Math.max(...indices)),
            troughIndex: indices.indexOf(Math.min(...indices))
        };
    }

    /**
     * Detect anomalies (statistical outliers) in data
     *
     * @param {Array<{date: string, value: number}>|Array<number>} dataPoints - Time series data or raw values
     * @param {Object} [options] - Detection options
     * @param {number} [options.sensitivity] - Override default sensitivity
     * @param {string} [options.method='zscore'] - Detection method: 'zscore', 'iqr', 'mad'
     * @returns {Object} Anomaly detection results
     */
    detectAnomalies(dataPoints, options = {}) {
        const { sensitivity = this.sensitivity, method = 'zscore' } = options;

        if (!dataPoints || dataPoints.length < 5) {
            return {
                success: false,
                error: 'Need at least 5 data points for anomaly detection',
                anomalies: []
            };
        }

        // Handle both array of objects and array of numbers
        const isRawArray = typeof dataPoints[0] === 'number';
        const normalizedData = isRawArray
            ? dataPoints.map((value, i) => ({ date: `point-${i}`, value }))
            : dataPoints;
        const values = normalizedData.map(d => d.value);
        let anomalies = [];

        switch (method) {
            case 'iqr':
                anomalies = this._detectAnomaliesIQR(normalizedData, values, sensitivity);
                break;
            case 'mad':
                anomalies = this._detectAnomaliesMAD(normalizedData, values, sensitivity);
                break;
            case 'zscore':
            default:
                anomalies = this._detectAnomaliesZScore(normalizedData, values, sensitivity);
        }

        return {
            success: true,
            method,
            sensitivity,
            totalPoints: normalizedData.length,
            anomalyCount: anomalies.length,
            anomalyRate: (anomalies.length / normalizedData.length) * 100,
            anomalies,
            statistics: this._calculateStatistics(values)
        };
    }

    /**
     * Calculate Year-over-Year change
     *
     * @param {number} current - Current period value
     * @param {number} previous - Previous year value
     * @returns {Object} YoY analysis
     */
    calculateYoY(current, previous) {
        if (previous === 0) {
            return {
                change: current > 0 ? Infinity : 0,
                absoluteChange: current > 0 ? Infinity : 0, // Alias for tests
                percentChange: current > 0 ? Infinity : 0,
                direction: current > 0 ? 'increase' : 'flat'
            };
        }

        const change = current - previous;
        const percentChangeDecimal = change / previous; // Decimal form (tests expect this)
        const percentChangePercent = percentChangeDecimal * 100; // Percentage form

        return {
            current,
            previous,
            change,
            absoluteChange: change, // Alias for tests
            percentChange: percentChangeDecimal, // Tests expect decimal (0.282, not 28.2)
            percentChangePercent, // Original percentage value
            direction: change > 0 ? 'increase' : change < 0 ? 'decrease' : 'flat',
            formatted: `${percentChangePercent >= 0 ? '+' : ''}${percentChangePercent.toFixed(1)}% YoY`
        };
    }

    /**
     * Calculate Quarter-over-Quarter change
     *
     * @param {number} current - Current quarter value
     * @param {number} previous - Previous quarter value
     * @returns {Object} QoQ analysis
     */
    calculateQoQ(current, previous) {
        const result = this.calculateYoY(current, previous);
        const pct = result.percentChangePercent ?? (result.percentChange * 100);
        result.formatted = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% QoQ`;
        return result;
    }

    /**
     * Calculate Month-over-Month change
     *
     * @param {number} current - Current month value
     * @param {number} previous - Previous month value
     * @returns {Object} MoM analysis
     */
    calculateMoM(current, previous) {
        const result = this.calculateYoY(current, previous);
        const pct = result.percentChangePercent ?? (result.percentChange * 100);
        result.formatted = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% MoM`;
        return result;
    }

    /**
     * Identify correlations between two KPIs
     *
     * @param {Array<number>} kpi1Data - First KPI time series
     * @param {Array<number>} kpi2Data - Second KPI time series
     * @returns {Object} Correlation analysis
     */
    identifyCorrelation(kpi1Data, kpi2Data) {
        if (kpi1Data.length !== kpi2Data.length) {
            throw new Error('Data series must have equal length');
        }

        if (kpi1Data.length < 5) {
            throw new Error('Need at least 5 data points for correlation analysis');
        }

        const correlation = this._pearsonCorrelation(kpi1Data, kpi2Data);
        const laggedCorrelations = this._calculateLaggedCorrelations(kpi1Data, kpi2Data, 3);

        let strength = 'weak';
        const absCorr = Math.abs(correlation);
        if (absCorr >= 0.8) strength = 'very strong';
        else if (absCorr >= 0.6) strength = 'strong';
        else if (absCorr >= 0.4) strength = 'moderate';

        return {
            success: true,
            correlation,
            coefficient: correlation, // Alias for tests
            strength,
            direction: correlation > 0 ? 'positive' : correlation < 0 ? 'negative' : 'none',
            laggedCorrelations,
            interpretation: this._interpretCorrelation(correlation, strength)
        };
    }

    /**
     * Generate natural language trend summary
     *
     * @param {Object} analysis - Trend analysis result
     * @returns {string} Natural language summary
     */
    generateTrendSummary(analysis) {
        // Handle multi-KPI analysis format
        if (analysis.kpis && Array.isArray(analysis.kpis)) {
            return this._generateMultiKPISummary(analysis);
        }

        // Handle single trend analysis format
        if (!analysis.success && analysis.success !== undefined) {
            return analysis.error;
        }

        const parts = [];

        // Direction and strength
        if (analysis.direction === 'increasing') {
            parts.push(`Showing ${analysis.strength} upward trend`);
        } else if (analysis.direction === 'decreasing') {
            parts.push(`Showing ${analysis.strength} downward trend`);
        } else {
            parts.push('Relatively stable');
        }

        // Percent change
        if (analysis.percentChange !== undefined) {
            const sign = analysis.percentChange >= 0 ? '+' : '';
            parts.push(`(${sign}${analysis.percentChange.toFixed(1)}% change)`);
        }

        // Acceleration
        if (analysis.acceleration) {
            if (analysis.acceleration.type === 'accelerating') {
                parts.push('with accelerating momentum');
            } else if (analysis.acceleration.type === 'decelerating') {
                parts.push('but momentum is slowing');
            }
        }

        // Fit quality
        if (analysis.rSquared >= 0.8) {
            parts.push('(high confidence)');
        } else if (analysis.rSquared < 0.5) {
            parts.push('(volatile pattern)');
        }

        return parts.join(' ');
    }

    /**
     * Generate summary for multi-KPI analysis
     * @private
     */
    _generateMultiKPISummary(analysis) {
        const summaries = [];

        for (const kpi of analysis.kpis) {
            const parts = [];
            parts.push(`${kpi.id || kpi.name}:`);

            if (kpi.trend) {
                const direction = kpi.trend.direction || 'stable';
                const strength = kpi.trend.strength || '';
                if (direction === 'increasing') {
                    parts.push(`${strength} increasing trend`);
                } else if (direction === 'decreasing') {
                    parts.push(`${strength} decreasing trend`);
                } else {
                    parts.push('stable');
                }
            }

            if (kpi.yoyChange && kpi.yoyChange.percentChange !== undefined) {
                const pct = (kpi.yoyChange.percentChange * 100).toFixed(1);
                const sign = kpi.yoyChange.percentChange >= 0 ? '+' : '';
                parts.push(`(${sign}${pct}% YoY)`);

                // Add attention flag for decreasing KPIs
                if (kpi.trend?.direction === 'decreasing') {
                    parts.push('- needs attention');
                }
            }

            summaries.push(parts.join(' '));
        }

        if (analysis.period) {
            summaries.unshift(`Analysis for ${analysis.period}:`);
        }

        return summaries.join('\n');
    }

    /**
     * Recommend actions based on trend analysis
     *
     * @param {Object} trendAnalysis - Trend analysis result
     * @param {string} kpiName - KPI being analyzed
     * @returns {Array<string>} Recommended actions
     */
    recommendActions(trendAnalysis, kpiName) {
        const actions = [];

        if (!trendAnalysis.success) {
            actions.push(`Collect more data for ${kpiName} trend analysis`);
            return actions;
        }

        const { direction, strength, acceleration, anomalies } = trendAnalysis;

        // Direction-based recommendations
        if (direction === 'decreasing' && (strength === 'strong' || strength === 'very strong')) {
            actions.push(`URGENT: Investigate declining ${kpiName} - root cause analysis needed`);
            actions.push(`Review recent changes that may have impacted ${kpiName}`);
        } else if (direction === 'decreasing') {
            actions.push(`Monitor ${kpiName} closely for continued decline`);
        } else if (direction === 'increasing' && strength === 'strong') {
            actions.push(`Document successful drivers of ${kpiName} improvement`);
            actions.push(`Consider increasing investment in programs driving ${kpiName}`);
        }

        // Acceleration-based recommendations
        if (acceleration?.type === 'decelerating' && direction === 'increasing') {
            actions.push(`Growth in ${kpiName} is slowing - review for sustainability`);
        } else if (acceleration?.type === 'accelerating' && direction === 'decreasing') {
            actions.push(`CRITICAL: Decline in ${kpiName} is accelerating - immediate action required`);
        }

        // Anomaly-based recommendations
        if (anomalies && anomalies.length > 0) {
            actions.push(`Investigate ${anomalies.length} anomalous data point(s) in ${kpiName}`);
        }

        return actions;
    }

    // ==================== Private Methods ====================

    /**
     * Linear regression using least squares
     * @private
     */
    _linearRegression(values) {
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

        // Calculate R-squared
        const yMean = sumY / n;
        let ssRes = 0, ssTot = 0;

        for (let i = 0; i < n; i++) {
            const predicted = slope * i + intercept;
            ssRes += Math.pow(values[i] - predicted, 2);
            ssTot += Math.pow(values[i] - yMean, 2);
        }

        const rSquared = ssTot === 0 ? 0 : 1 - (ssRes / ssTot);

        return { slope, intercept, rSquared };
    }

    /**
     * Exponential regression
     * @private
     */
    _exponentialRegression(values) {
        // Log-transform and apply linear regression
        const logValues = values.map(v => Math.log(v));
        const { slope, intercept, rSquared } = this._linearRegression(logValues);

        return {
            slope: Math.exp(slope) - 1, // Growth rate
            intercept: Math.exp(intercept),
            rSquared,
            growthRate: slope
        };
    }

    /**
     * Calculate trend strength based on R-squared and slope
     * @private
     */
    _calculateTrendStrength(rSquared, slope, values) {
        const absSlope = Math.abs(slope);
        const avgValue = values.reduce((a, b) => a + b, 0) / values.length;
        const normalizedSlope = avgValue !== 0 ? absSlope / avgValue : absSlope;

        if (rSquared >= 0.8 && normalizedSlope >= 0.05) return 'very strong';
        if (rSquared >= 0.6 && normalizedSlope >= 0.03) return 'strong';
        if (rSquared >= 0.4 && normalizedSlope >= 0.01) return 'moderate';
        if (rSquared >= 0.2) return 'weak';
        return 'negligible';
    }

    /**
     * Detect acceleration or deceleration in trend
     * @private
     */
    _detectAcceleration(values) {
        if (values.length < 6) {
            return { type: 'insufficient_data' };
        }

        const half = Math.floor(values.length / 2);
        const firstHalf = values.slice(0, half);
        const secondHalf = values.slice(half);

        const firstSlope = this._linearRegression(firstHalf).slope;
        const secondSlope = this._linearRegression(secondHalf).slope;

        const slopeDiff = secondSlope - firstSlope;
        const threshold = 0.005;

        if (slopeDiff > threshold) {
            return { type: 'accelerating', magnitude: slopeDiff };
        } else if (slopeDiff < -threshold) {
            return { type: 'decelerating', magnitude: slopeDiff };
        }

        return { type: 'stable', magnitude: slopeDiff };
    }

    /**
     * Find inflection points where trend reverses
     * @private
     */
    _findInflectionPoints(dataPoints) {
        const inflections = [];
        const values = dataPoints.map(d => d.value);
        const window = 3;

        if (values.length < 5) return inflections;

        const ma = this.calculateMovingAverage(values, window);
        // MA is now null-padded to match input length, so indices align directly

        for (let i = 1; i < ma.length - 1; i++) {
            // Skip if any MA values are null (from null-padded start)
            if (ma[i - 1] === null || ma[i] === null || ma[i + 1] === null) {
                continue;
            }

            const prevSlope = ma[i] - ma[i - 1];
            const nextSlope = ma[i + 1] - ma[i];

            // Sign change indicates inflection
            if ((prevSlope > 0 && nextSlope < 0) || (prevSlope < 0 && nextSlope > 0)) {
                inflections.push({
                    index: i,
                    date: dataPoints[i]?.date,
                    value: values[i],
                    type: prevSlope > 0 ? 'peak' : 'trough'
                });
            }
        }

        return inflections;
    }

    /**
     * Generate trend summary text
     * @private
     */
    _generateTrendSummary(direction, strength, slope, acceleration) {
        let summary = '';

        if (direction === 'increasing') {
            summary = `Upward trend (${strength})`;
        } else if (direction === 'decreasing') {
            summary = `Downward trend (${strength})`;
        } else {
            summary = 'Stable (no significant trend)';
        }

        if (acceleration.type === 'accelerating') {
            summary += ', accelerating';
        } else if (acceleration.type === 'decelerating') {
            summary += ', decelerating';
        }

        return summary;
    }

    /**
     * Calculate Exponential Moving Average
     * @private
     */
    _calculateEMA(data, window) {
        const k = 2 / (window + 1);
        const ema = [data[0]];

        for (let i = 1; i < data.length; i++) {
            ema.push(data[i] * k + ema[i - 1] * (1 - k));
        }

        return ema;
    }

    /**
     * Calculate Weighted Moving Average
     * @private
     */
    _calculateWMA(data, window) {
        const result = [];
        const weights = Array.from({ length: window }, (_, i) => i + 1);
        const weightSum = weights.reduce((a, b) => a + b, 0);

        for (let i = 0; i < data.length; i++) {
            if (i < window - 1) {
                result.push(null);
            } else {
                let weighted = 0;
                for (let j = 0; j < window; j++) {
                    weighted += data[i - window + 1 + j] * weights[j];
                }
                result.push(weighted / weightSum);
            }
        }

        return result;
    }

    /**
     * Calculate seasonality score using autocorrelation
     * @private
     */
    _calculateSeasonalityScore(data, period) {
        const n = data.length;
        if (n < period * 2) return 0;

        const mean = data.reduce((a, b) => a + b, 0) / n;
        let numerator = 0;
        let denominator = 0;

        for (let i = 0; i < n - period; i++) {
            numerator += (data[i] - mean) * (data[i + period] - mean);
        }

        for (let i = 0; i < n; i++) {
            denominator += Math.pow(data[i] - mean, 2);
        }

        return denominator === 0 ? 0 : numerator / denominator;
    }

    /**
     * Calculate seasonal indices
     * @private
     */
    _calculateSeasonalIndices(data, period) {
        const indices = new Array(period).fill(0);
        const counts = new Array(period).fill(0);

        for (let i = 0; i < data.length; i++) {
            const seasonIndex = i % period;
            indices[seasonIndex] += data[i];
            counts[seasonIndex]++;
        }

        const avgSeasonal = indices.map((sum, i) => counts[i] > 0 ? sum / counts[i] : 0);
        const overallMean = avgSeasonal.reduce((a, b) => a + b, 0) / period;

        return avgSeasonal.map(v => overallMean !== 0 ? v / overallMean : 1);
    }

    /**
     * Get human-readable period label
     * @private
     */
    _getPeriodLabel(period) {
        switch (period) {
            case 4: return 'quarterly';
            case 6: return 'semi-annual';
            case 12: return 'annual';
            default: return `${period}-period`;
        }
    }

    /**
     * Detect anomalies using Z-score method
     * @private
     */
    _detectAnomaliesZScore(dataPoints, values, sensitivity) {
        const stats = this._calculateStatistics(values);
        const anomalies = [];

        dataPoints.forEach((point, i) => {
            const zScore = stats.stdDev !== 0
                ? (point.value - stats.mean) / stats.stdDev
                : 0;

            if (Math.abs(zScore) > sensitivity) {
                anomalies.push({
                    index: i,
                    date: point.date,
                    value: point.value,
                    zScore,
                    type: zScore > 0 ? 'high' : 'low',
                    severity: Math.abs(zScore) > sensitivity * 1.5 ? 'severe' : 'moderate'
                });
            }
        });

        return anomalies;
    }

    /**
     * Detect anomalies using IQR method
     * @private
     */
    _detectAnomaliesIQR(dataPoints, values, sensitivity) {
        const sorted = [...values].sort((a, b) => a - b);
        const q1 = sorted[Math.floor(sorted.length * 0.25)];
        const q3 = sorted[Math.floor(sorted.length * 0.75)];
        const iqr = q3 - q1;

        const lowerBound = q1 - sensitivity * iqr;
        const upperBound = q3 + sensitivity * iqr;

        const anomalies = [];
        dataPoints.forEach((point, i) => {
            if (point.value < lowerBound || point.value > upperBound) {
                anomalies.push({
                    index: i,
                    date: point.date,
                    value: point.value,
                    lowerBound,
                    upperBound,
                    type: point.value < lowerBound ? 'low' : 'high',
                    severity: Math.abs(point.value - (point.value < lowerBound ? lowerBound : upperBound)) > iqr ? 'severe' : 'moderate'
                });
            }
        });

        return anomalies;
    }

    /**
     * Detect anomalies using MAD (Median Absolute Deviation)
     * @private
     */
    _detectAnomaliesMAD(dataPoints, values, sensitivity) {
        const sorted = [...values].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        const deviations = values.map(v => Math.abs(v - median));
        const sortedDeviations = [...deviations].sort((a, b) => a - b);
        const mad = sortedDeviations[Math.floor(sortedDeviations.length / 2)];

        const anomalies = [];
        const threshold = sensitivity * mad * 1.4826; // Scaling factor for normal distribution

        dataPoints.forEach((point, i) => {
            const deviation = Math.abs(point.value - median);
            if (deviation > threshold) {
                anomalies.push({
                    index: i,
                    date: point.date,
                    value: point.value,
                    deviation,
                    threshold,
                    type: point.value < median ? 'low' : 'high',
                    severity: deviation > threshold * 1.5 ? 'severe' : 'moderate'
                });
            }
        });

        return anomalies;
    }

    /**
     * Calculate basic statistics
     * @private
     */
    _calculateStatistics(values) {
        const n = values.length;
        const mean = values.reduce((a, b) => a + b, 0) / n;
        const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n;
        const stdDev = Math.sqrt(variance);

        const sorted = [...values].sort((a, b) => a - b);
        const median = sorted[Math.floor(n / 2)];
        const min = sorted[0];
        const max = sorted[n - 1];

        return { mean, median, stdDev, variance, min, max, count: n };
    }

    /**
     * Calculate Pearson correlation coefficient
     * @private
     */
    _pearsonCorrelation(x, y) {
        const n = x.length;
        const meanX = x.reduce((a, b) => a + b, 0) / n;
        const meanY = y.reduce((a, b) => a + b, 0) / n;

        let numerator = 0;
        let denomX = 0;
        let denomY = 0;

        for (let i = 0; i < n; i++) {
            const diffX = x[i] - meanX;
            const diffY = y[i] - meanY;
            numerator += diffX * diffY;
            denomX += diffX * diffX;
            denomY += diffY * diffY;
        }

        const denominator = Math.sqrt(denomX * denomY);
        return denominator === 0 ? 0 : numerator / denominator;
    }

    /**
     * Calculate lagged correlations
     * @private
     */
    _calculateLaggedCorrelations(x, y, maxLag) {
        const results = [];

        for (let lag = -maxLag; lag <= maxLag; lag++) {
            const x1 = lag >= 0 ? x.slice(0, x.length - lag) : x.slice(-lag);
            const y1 = lag >= 0 ? y.slice(lag) : y.slice(0, y.length + lag);

            if (x1.length >= 5) {
                results.push({
                    lag,
                    correlation: this._pearsonCorrelation(x1, y1)
                });
            }
        }

        return results;
    }

    /**
     * Interpret correlation result
     * @private
     */
    _interpretCorrelation(correlation, strength) {
        if (correlation > 0.8) {
            return 'Very strong positive relationship - KPIs move together consistently';
        } else if (correlation > 0.6) {
            return 'Strong positive relationship - KPIs tend to move in the same direction';
        } else if (correlation > 0.4) {
            return 'Moderate positive relationship - Some tendency to move together';
        } else if (correlation > 0.2) {
            return 'Weak positive relationship - Minor tendency to move together';
        } else if (correlation > -0.2) {
            return 'No significant relationship - KPIs move independently';
        } else if (correlation > -0.4) {
            return 'Weak negative relationship - Minor tendency to move opposite';
        } else if (correlation > -0.6) {
            return 'Moderate negative relationship - Some tendency to move opposite';
        } else if (correlation > -0.8) {
            return 'Strong negative relationship - KPIs tend to move in opposite directions';
        } else {
            return 'Very strong negative relationship - KPIs move opposite consistently';
        }
    }
}

/**
 * Command-line interface
 */
async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help')) {
        console.log(`
Trend Analysis Engine

Usage:
  node trend-analysis-engine.js --data <path> [options]

Options:
  --data <path>           Path to time series JSON file (required)
  --analyze               Perform trend analysis (default)
  --seasonality           Detect seasonality
  --anomalies             Detect anomalies
  --correlation <path>    Calculate correlation with another dataset
  --sensitivity <n>       Anomaly detection sensitivity (default: 2.0)
  --output <path>         Output file path (default: ./trend-analysis.json)
  --help                  Show this help message

Data Format:
  JSON array of objects: [{ "date": "2024-01", "value": 100 }, ...]

Examples:
  node trend-analysis-engine.js --data ./kpi-data.json --analyze
  node trend-analysis-engine.js --data ./kpi-data.json --anomalies --sensitivity 1.5
  node trend-analysis-engine.js --data ./arr.json --correlation ./nrr.json
        `);
        process.exit(0);
    }

    try {
        // Parse arguments
        const dataPath = args.includes('--data') ? args[args.indexOf('--data') + 1] : null;
        const doAnalyze = args.includes('--analyze') || (!args.includes('--seasonality') && !args.includes('--anomalies') && !args.includes('--correlation'));
        const doSeasonality = args.includes('--seasonality');
        const doAnomalies = args.includes('--anomalies');
        const correlationPath = args.includes('--correlation') ? args[args.indexOf('--correlation') + 1] : null;
        const sensitivity = args.includes('--sensitivity') ? parseFloat(args[args.indexOf('--sensitivity') + 1]) : 2.0;
        const outputPath = args.includes('--output') ? args[args.indexOf('--output') + 1] : './trend-analysis.json';

        if (!dataPath) {
            console.error('Error: --data argument is required');
            process.exit(1);
        }

        // Load data
        const dataPoints = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        console.log(`Loaded ${dataPoints.length} data points from ${dataPath}`);

        // Initialize engine
        const engine = new TrendAnalysisEngine({ sensitivity });

        const results = {};

        // Trend analysis
        if (doAnalyze) {
            console.log('\nPerforming trend analysis...');
            results.trend = engine.detectTrend(dataPoints);
            console.log(`Trend: ${results.trend.direction} (${results.trend.strength})`);
            console.log(`Summary: ${engine.generateTrendSummary(results.trend)}`);
        }

        // Seasonality detection
        if (doSeasonality) {
            console.log('\nDetecting seasonality...');
            const values = dataPoints.map(d => d.value);
            results.seasonality = engine.detectSeasonality(values);
            if (results.seasonality.detected) {
                console.log(`Seasonality: ${results.seasonality.periodLabel} (strength: ${results.seasonality.strength.toFixed(2)})`);
            } else {
                console.log('No significant seasonality detected');
            }
        }

        // Anomaly detection
        if (doAnomalies) {
            console.log('\nDetecting anomalies...');
            results.anomalies = engine.detectAnomalies(dataPoints, { sensitivity });
            console.log(`Found ${results.anomalies.anomalyCount} anomalies (${results.anomalies.anomalyRate.toFixed(1)}%)`);
            if (results.anomalies.anomalies.length > 0) {
                console.log('Anomalies:');
                results.anomalies.anomalies.forEach(a => {
                    console.log(`  - ${a.date}: ${a.value} (${a.type}, ${a.severity})`);
                });
            }
        }

        // Correlation analysis
        if (correlationPath) {
            console.log('\nCalculating correlation...');
            const correlationData = JSON.parse(fs.readFileSync(correlationPath, 'utf8'));
            const values1 = dataPoints.map(d => d.value);
            const values2 = correlationData.map(d => d.value);
            results.correlation = engine.identifyCorrelation(values1, values2);
            console.log(`Correlation: ${results.correlation.correlation.toFixed(3)} (${results.correlation.strength})`);
            console.log(`Interpretation: ${results.correlation.interpretation}`);
        }

        // Save results
        fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf8');
        console.log(`\nResults saved to: ${outputPath}`);

    } catch (error) {
        console.error('\nError analyzing trends:');
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

module.exports = { TrendAnalysisEngine };
