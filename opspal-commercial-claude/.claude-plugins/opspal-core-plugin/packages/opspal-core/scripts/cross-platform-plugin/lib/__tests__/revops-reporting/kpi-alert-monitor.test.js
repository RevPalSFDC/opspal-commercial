/**
 * KPI Alert Monitor - Unit Tests
 *
 * Tests for kpi-alert-monitor.js
 * Phase 6: Comprehensive QA Plan
 *
 * @version 1.0.0
 */

const { KPIAlertMonitor } = require('../../kpi-alert-monitor');

describe('KPIAlertMonitor', () => {
    let monitor;

    beforeEach(() => {
        monitor = new KPIAlertMonitor();
    });

    describe('Initialization', () => {
        test('should initialize with default config', () => {
            expect(monitor).toBeDefined();
            expect(monitor.thresholds).toBeDefined();
            expect(monitor.alertHistory).toBeDefined();
            expect(monitor.cooldowns).toBeDefined();
        });

        test('should accept custom config', () => {
            const customMonitor = new KPIAlertMonitor({
                thresholds: { TEST: { type: 'static', value: 100 } },
                slackWebhook: 'https://hooks.slack.test/test'
            });
            // Implementation stores properties directly on instance, not in config object
            expect(customMonitor.thresholds.TEST).toBeDefined();
            expect(customMonitor.slackWebhook).toBe('https://hooks.slack.test/test');
        });
    });

    describe('setThreshold()', () => {
        test('should set static threshold', () => {
            // Implementation signature: setThreshold(kpiId, type, value, severity)
            monitor.setThreshold('NRR', 'min', 100, 'critical');

            // thresholds is a plain object, not Map
            expect(monitor.thresholds['NRR']).toBeDefined();
            expect(monitor.thresholds['NRR'].thresholdType).toBe('min');
            expect(monitor.thresholds['NRR'].value).toBe(100);
            expect(monitor.thresholds['NRR'].severity).toBe('critical');
        });

        test('should allow setting different threshold types', () => {
            monitor.setThreshold('ARR', 'max', 15000000, 'warning');

            expect(monitor.thresholds['ARR'].thresholdType).toBe('max');
        });

        test('should allow range thresholds', () => {
            monitor.setThreshold('WIN_RATE', 'range', { min: 15, max: 50 }, 'warning');

            expect(monitor.thresholds['WIN_RATE'].thresholdType).toBe('range');
            expect(monitor.thresholds['WIN_RATE'].value.min).toBe(15);
            expect(monitor.thresholds['WIN_RATE'].value.max).toBe(50);
        });
    });

    describe('setDynamicThreshold()', () => {
        test('should set dynamic threshold', () => {
            // Implementation signature: setDynamicThreshold(kpiId, deviationPercent, severity)
            monitor.setDynamicThreshold('ARR', 20, 'warning');

            const threshold = monitor.thresholds['ARR'];
            expect(threshold).toBeDefined();
            expect(threshold.type).toBe('dynamic');
            expect(threshold.deviationPercent).toBe(20);
            expect(threshold.severity).toBe('warning');
        });
    });

    describe('setTrendThreshold()', () => {
        test('should set trend threshold', () => {
            // Implementation signature: setTrendThreshold(kpiId, trendDirection, periods, severity)
            monitor.setTrendThreshold('GROWTH_RATE', 'decreasing', 3, 'warning');

            const threshold = monitor.thresholds['GROWTH_RATE'];
            expect(threshold).toBeDefined();
            expect(threshold.type).toBe('trend');
            expect(threshold.trendDirection).toBe('decreasing');
            expect(threshold.periods).toBe(3);
        });
    });

    describe('evaluateKPI()', () => {
        beforeEach(() => {
            // Set up test thresholds with actual implementation signature
            monitor.setThreshold('NRR', 'min', 100, 'critical');
            monitor.setThreshold('ARR', 'max', 15000000, 'info');
            monitor.setThreshold('WIN_RATE', 'min', 15, 'warning');
        });

        test('should trigger alert when value below minimum threshold', () => {
            const result = monitor.evaluateKPI('NRR', 97.5);

            expect(result).toBeDefined();
            // Implementation uses 'alert' boolean, not 'triggered'
            expect(result.alert).toBe(true);
            expect(result.severity).toBe('critical');
            expect(result.breach.actual).toBe(97.5);
            expect(result.breach.threshold).toBe(100);
        });

        test('should not trigger alert when value meets threshold', () => {
            const result = monitor.evaluateKPI('NRR', 105);

            expect(result.alert).toBe(false);
        });

        test('should trigger alert when value exceeds maximum threshold', () => {
            const result = monitor.evaluateKPI('ARR', 16000000);

            expect(result.alert).toBe(true);
        });

        test('should not trigger for value exactly at minimum threshold', () => {
            const result = monitor.evaluateKPI('WIN_RATE', 15);

            // 15 is not < 15, so should not trigger
            expect(result.alert).toBe(false);
        });

        test('should return no alert for KPI with no threshold', () => {
            const result = monitor.evaluateKPI('UNKNOWN_KPI', 100);

            // Implementation returns object with alert: false, not null
            expect(result.alert).toBe(false);
            expect(result.reason).toContain('No threshold configured');
        });

        test('should include timestamp in result', () => {
            const result = monitor.evaluateKPI('NRR', 97.5);

            expect(result.timestamp).toBeDefined();
        });
    });

    describe('evaluateKPI() with Dynamic Thresholds', () => {
        beforeEach(() => {
            monitor.setDynamicThreshold('ARR', 20, 'warning');
        });

        test('should trigger for value outside dynamic threshold', () => {
            // Historical data with consistent values around 10M
            const historicalData = [10000000, 10100000, 9900000, 10050000, 9950000, 10000000];
            // Anomaly value way outside normal range (50% above baseline)
            const result = monitor.evaluateKPI('ARR', 15000000, historicalData);

            expect(result.alert).toBe(true);
        });

        test('should not trigger for value within dynamic threshold', () => {
            const historicalData = [10000000, 10100000, 9900000, 10050000, 9950000, 10000000];
            // Value within 20% of baseline
            const result = monitor.evaluateKPI('ARR', 10200000, historicalData);

            expect(result.alert).toBe(false);
        });

        test('should require minimum historical data', () => {
            // Less than 3 data points
            const result = monitor.evaluateKPI('ARR', 15000000, [10000000, 10100000]);

            expect(result.alert).toBe(false);
            expect(result.reason).toContain('Insufficient');
        });
    });

    describe('evaluateKPI() with Trend Thresholds', () => {
        beforeEach(() => {
            monitor.setTrendThreshold('GROWTH_RATE', 'decreasing', 3, 'warning');
        });

        test('should trigger for consecutive declining periods', () => {
            // 3 consecutive decreases
            const historicalData = [25, 22, 19];
            const result = monitor.evaluateKPI('GROWTH_RATE', 16, historicalData);

            expect(result.alert).toBe(true);
        });

        test('should not trigger for non-consecutive declines', () => {
            // Not consecutive - has an increase in the middle
            const historicalData = [25, 22, 24];
            const result = monitor.evaluateKPI('GROWTH_RATE', 21, historicalData);

            expect(result.alert).toBe(false);
        });
    });

    describe('evaluateAllKPIs()', () => {
        beforeEach(() => {
            monitor.setThreshold('NRR', 'min', 100, 'critical');
            monitor.setThreshold('WIN_RATE', 'min', 15, 'warning');
            monitor.setThreshold('CAC', 'max', 50000, 'warning');
        });

        test('should evaluate all KPIs and return results object', () => {
            const kpiValues = {
                NRR: 95,      // Should trigger (below min)
                WIN_RATE: 20, // Should not trigger
                CAC: 45000    // Should not trigger
            };

            const result = monitor.evaluateAllKPIs(kpiValues);

            // Implementation returns object with alerts array
            expect(result.alerts).toHaveLength(1);
            expect(result.alerts[0].kpiId).toBe('NRR');
            expect(result.alertsTriggered).toBe(1);
            expect(result.kpisEvaluated).toBe(3);
        });

        test('should return multiple alerts when multiple thresholds breached', () => {
            const kpiValues = {
                NRR: 95,       // Should trigger
                WIN_RATE: 10,  // Should trigger
                CAC: 60000     // Should trigger
            };

            const result = monitor.evaluateAllKPIs(kpiValues);

            expect(result.alerts).toHaveLength(3);
            expect(result.alertsTriggered).toBe(3);
        });

        test('should return empty alerts array when no thresholds breached', () => {
            const kpiValues = {
                NRR: 110,
                WIN_RATE: 25,
                CAC: 30000
            };

            const result = monitor.evaluateAllKPIs(kpiValues);

            expect(result.alerts).toHaveLength(0);
            expect(result.alertsTriggered).toBe(0);
        });

        test('should sort alerts by severity', () => {
            const kpiValues = {
                NRR: 95,       // critical
                WIN_RATE: 10,  // warning
                CAC: 60000     // warning
            };

            const result = monitor.evaluateAllKPIs(kpiValues);

            // Critical should be first
            expect(result.alerts[0].severity).toBe('critical');
        });
    });

    describe('generateAlert()', () => {
        test('should generate alert object', () => {
            const breach = {
                type: 'below_minimum',
                threshold: 100,
                actual: 95,
                severity: 'critical'
            };

            const alert = monitor.generateAlert('NRR', breach, { previousValue: 102 });

            expect(alert).toBeDefined();
            expect(alert.id).toContain('alert_NRR_');
            expect(alert.kpiId).toBe('NRR');
            expect(alert.breach).toEqual(breach);
            expect(alert.context.previousValue).toBe(102);
            expect(alert.timestamp).toBeDefined();
        });
    });

    describe('notify()', () => {
        test('should send notification to console by default', async () => {
            const alert = {
                id: 'alert_NRR_123',
                kpiId: 'NRR',
                severity: 'critical',
                breach: { actual: 95, threshold: 100 },
                channels: ['console']
            };

            const result = await monitor.notify(alert);

            expect(result).toBeDefined();
            expect(result.alertId).toBe('alert_NRR_123');
            expect(result.channels.console).toBeDefined();
        });

        test('should respect cooldown', async () => {
            const alert = {
                id: 'alert_NRR_123',
                kpiId: 'NRR',
                severity: 'critical',
                breach: { actual: 95, threshold: 100 },
                channels: ['console']
            };

            // First notification
            await monitor.notify(alert);

            // Second notification immediately
            const result = await monitor.notify(alert);

            expect(result.skipped).toBe(true);
            expect(result.reason).toContain('Cooldown');
        });
    });

    describe('createDigest()', () => {
        beforeEach(() => {
            // Add some alerts to history
            monitor.setThreshold('NRR', 'min', 100, 'critical');
            monitor.setThreshold('WIN_RATE', 'min', 15, 'warning');

            // Trigger alerts to populate alertHistory
            monitor.evaluateKPI('NRR', 95);
            monitor.evaluateKPI('WIN_RATE', 10);
        });

        test('should create daily digest', () => {
            // Implementation uses alertHistory internally
            const digest = monitor.createDigest('daily');

            expect(digest).toBeDefined();
            expect(digest.period).toBe('daily');
            expect(digest.totalAlerts).toBe(2);
            expect(digest.bySeverity.critical).toBe(1);
            expect(digest.bySeverity.warning).toBe(1);
        });

        test('should create weekly digest', () => {
            const digest = monitor.createDigest('weekly');

            expect(digest.period).toBe('weekly');
        });

        test('should handle empty alertHistory', () => {
            const freshMonitor = new KPIAlertMonitor();
            const digest = freshMonitor.createDigest('daily');

            expect(digest.totalAlerts).toBe(0);
        });
    });

    describe('getAlertHistory()', () => {
        beforeEach(() => {
            monitor.setThreshold('NRR', 'min', 100, 'critical');
            monitor.setThreshold('WIN_RATE', 'min', 15, 'warning');

            monitor.evaluateKPI('NRR', 95);
            monitor.evaluateKPI('WIN_RATE', 10);
            monitor.evaluateKPI('NRR', 92);
        });

        test('should return all alert history', () => {
            const history = monitor.getAlertHistory();

            expect(history).toHaveLength(3);
        });

        test('should filter by kpiId', () => {
            const history = monitor.getAlertHistory({ kpiId: 'NRR' });

            expect(history).toHaveLength(2);
            history.forEach(h => expect(h.kpiId).toBe('NRR'));
        });

        test('should filter by severity', () => {
            const history = monitor.getAlertHistory({ severity: 'warning' });

            expect(history).toHaveLength(1);
        });

        test('should limit results', () => {
            const history = monitor.getAlertHistory({ limit: 2 });

            expect(history).toHaveLength(2);
        });
    });

    describe('Edge Cases', () => {
        beforeEach(() => {
            monitor.setThreshold('TEST', 'min', 100, 'warning');
        });

        test('should handle null KPI value', () => {
            const result = monitor.evaluateKPI('TEST', null);

            // Implementation still processes - compare null < 100 = true
            expect(result).toBeDefined();
        });

        test('should handle undefined KPI value', () => {
            const result = monitor.evaluateKPI('TEST', undefined);

            expect(result).toBeDefined();
        });

        test('should handle NaN KPI value', () => {
            const result = monitor.evaluateKPI('TEST', NaN);

            expect(result).toBeDefined();
            // NaN < 100 is false in JavaScript
            expect(result.alert).toBe(false);
        });

        test('should handle boundary value exactly at threshold', () => {
            const result = monitor.evaluateKPI('TEST', 100);

            // 100 is not < 100, so should not trigger
            expect(result.alert).toBe(false);
        });

        test('should handle very large numbers', () => {
            monitor.setThreshold('BIG', 'max', 1e15, 'warning');
            const result = monitor.evaluateKPI('BIG', 1e16);

            expect(result.alert).toBe(true);
        });

        test('should handle negative numbers', () => {
            monitor.setThreshold('NEGATIVE', 'min', 0, 'warning');
            const result = monitor.evaluateKPI('NEGATIVE', -100);

            expect(result.alert).toBe(true);
        });
    });
});
