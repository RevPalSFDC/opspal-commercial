/**
 * Tests for Data Health Reporter
 */

'use strict';

const { DataHealthReporter, REPORT_TYPES, REPORT_FORMATS, HEALTH_GRADES } = require('../../governance/data-health-reporter');

describe('DataHealthReporter', () => {
    let reporter;

    beforeEach(() => {
        reporter = new DataHealthReporter({
            orgName: 'Test Org'
        });
    });

    describe('generateScorecard', () => {
        it('should generate scorecard with all dimensions', () => {
            const data = {
                fieldAnalysis: {
                    email: { metrics: { populationRate: 0.95, stalenessRate: 0.05 } },
                    phone: { metrics: { populationRate: 0.80, stalenessRate: 0.10 } }
                },
                anomalies: [],
                totalRecords: 1000
            };

            const scorecard = reporter.generateScorecard(data);

            expect(scorecard.type).toBe(REPORT_TYPES.SCORECARD);
            expect(scorecard.summary.overallScore).toBeDefined();
            expect(scorecard.summary.grade).toBeDefined();
            expect(scorecard.dimensions.population).toBeDefined();
            expect(scorecard.dimensions.staleness).toBeDefined();
            expect(scorecard.dimensions.anomalies).toBeDefined();
            expect(scorecard.dimensions.compliance).toBeDefined();
            expect(scorecard.dimensions.consistency).toBeDefined();
        });

        it('should calculate correct grade for score', () => {
            const data = {
                fieldAnalysis: {
                    email: { metrics: { populationRate: 0.95, stalenessRate: 0.02 } }
                },
                totalRecords: 100
            };

            const scorecard = reporter.generateScorecard(data);

            // High population, low staleness should result in good grade
            expect(['A', 'B', 'C']).toContain(scorecard.summary.grade);
        });

        it('should identify top issues', () => {
            const data = {
                fieldAnalysis: {
                    email: { metrics: { populationRate: 0.40, stalenessRate: 0.60 } }
                },
                anomalies: [
                    { severity: 'high', type: 'role_mismatch' }
                ],
                totalRecords: 100
            };

            const scorecard = reporter.generateScorecard(data);

            expect(scorecard.topIssues.length).toBeGreaterThan(0);
            expect(scorecard.topIssues[0].priority).toBeDefined();
            expect(scorecard.topIssues[0].recommendation).toBeDefined();
        });

        it('should include quick wins', () => {
            const data = {
                fieldAnalysis: {
                    email: { metrics: { populationRate: 0.70, stalenessRate: 0.30 } }
                },
                totalRecords: 100
            };

            const scorecard = reporter.generateScorecard(data);

            expect(scorecard.quickWins).toBeDefined();
            expect(Array.isArray(scorecard.quickWins)).toBe(true);
        });
    });

    describe('generateDetailedReport', () => {
        it('should include all sections', () => {
            const data = {
                fieldAnalysis: {
                    email: { metrics: { populationRate: 0.90, stalenessRate: 0.10 } }
                },
                anomalies: [],
                totalRecords: 100
            };

            const report = reporter.generateDetailedReport(data);

            expect(report.type).toBe(REPORT_TYPES.DETAILED);
            expect(report.fieldAnalysis).toBeDefined();
            expect(report.anomalyBreakdown).toBeDefined();
            expect(report.complianceStatus).toBeDefined();
            expect(report.recommendations).toBeDefined();
            expect(report.metadata).toBeDefined();
        });

        it('should generate recommendations based on issues', () => {
            const data = {
                fieldAnalysis: {
                    email: { metrics: { populationRate: 0.50, stalenessRate: 0.40 } }
                },
                totalRecords: 100
            };

            const report = reporter.generateDetailedReport(data);

            expect(report.recommendations.length).toBeGreaterThan(0);
            expect(report.recommendations[0].steps).toBeDefined();
        });
    });

    describe('generateExecutiveSummary', () => {
        it('should provide BLUF summary', () => {
            const data = {
                fieldAnalysis: {
                    email: { metrics: { populationRate: 0.85, stalenessRate: 0.15 } }
                },
                totalRecords: 100
            };

            const summary = reporter.generateExecutiveSummary(data);

            expect(summary.type).toBe(REPORT_TYPES.EXECUTIVE);
            expect(summary.bottomLine).toBeDefined();
            expect(summary.keyMetrics).toBeDefined();
            expect(summary.statusIndicators).toBeDefined();
            expect(summary.priorityActions).toBeDefined();
        });

        it('should limit priority actions to 3', () => {
            const data = {
                fieldAnalysis: {
                    email: { metrics: { populationRate: 0.30, stalenessRate: 0.50 } },
                    phone: { metrics: { populationRate: 0.20, stalenessRate: 0.60 } }
                },
                anomalies: [
                    { severity: 'high' },
                    { severity: 'high' },
                    { severity: 'high' }
                ],
                totalRecords: 100
            };

            const summary = reporter.generateExecutiveSummary(data);

            expect(summary.priorityActions.length).toBeLessThanOrEqual(3);
        });
    });

    describe('formatReport', () => {
        it('should format as JSON by default', () => {
            const report = { type: 'test', value: 123 };

            const formatted = reporter.formatReport(report);

            expect(() => JSON.parse(formatted)).not.toThrow();
        });

        it('should format as Markdown', () => {
            const data = {
                fieldAnalysis: {
                    email: { metrics: { populationRate: 0.90, stalenessRate: 0.10 } }
                },
                totalRecords: 100
            };

            const report = reporter.generateScorecard(data);
            const markdown = reporter.formatReport(report, REPORT_FORMATS.MARKDOWN);

            expect(markdown).toContain('# Data Quality Health Report');
            expect(markdown).toContain('## Summary');
        });

        it('should format as CSV', () => {
            const data = {
                fieldAnalysis: {
                    email: { metrics: { populationRate: 0.90, stalenessRate: 0.10 } }
                },
                totalRecords: 100
            };

            const report = reporter.generateScorecard(data);
            const csv = reporter.formatReport(report, REPORT_FORMATS.CSV);

            expect(csv).toContain('dimension,score,status');
        });
    });

    describe('trend analysis', () => {
        it('should track history for trend analysis', () => {
            const data = {
                fieldAnalysis: {
                    email: { metrics: { populationRate: 0.85, stalenessRate: 0.15 } }
                },
                totalRecords: 100
            };

            // Generate multiple scorecards
            reporter.generateScorecard(data);
            reporter.generateScorecard(data);
            reporter.generateScorecard(data);

            const report = reporter.generateDetailedReport(data);

            // Should have some trend data after multiple reports
            expect(report.trends).toBeDefined();
        });

        it('should calculate improving/declining/stable trend', () => {
            // Create reporter with some history
            const reporter = new DataHealthReporter();

            // Simulate history
            reporter._history = [
                { date: '2024-01-01', overallScore: 70 },
                { date: '2024-01-02', overallScore: 72 },
                { date: '2024-01-03', overallScore: 75 }
            ];

            const trend = reporter._calculateTrend(80);

            expect(trend).toBe('improving');
        });
    });

    describe('HEALTH_GRADES', () => {
        it('should have all grade definitions', () => {
            expect(HEALTH_GRADES.A).toBeDefined();
            expect(HEALTH_GRADES.B).toBeDefined();
            expect(HEALTH_GRADES.C).toBeDefined();
            expect(HEALTH_GRADES.D).toBeDefined();
            expect(HEALTH_GRADES.F).toBeDefined();
        });

        it('should have correct min thresholds', () => {
            expect(HEALTH_GRADES.A.min).toBe(90);
            expect(HEALTH_GRADES.B.min).toBe(80);
            expect(HEALTH_GRADES.C.min).toBe(70);
            expect(HEALTH_GRADES.D.min).toBe(60);
            expect(HEALTH_GRADES.F.min).toBe(0);
        });
    });
});
