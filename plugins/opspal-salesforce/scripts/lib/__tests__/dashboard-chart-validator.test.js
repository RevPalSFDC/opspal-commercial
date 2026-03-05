/**
 * Tests for Dashboard Chart Validator
 *
 * @module dashboard-chart-validator.test
 * @created 2026-01-21
 * @reflection 13c9b2ca-2b30-4703-bc49-b13a57b5fab1
 */

const { DashboardChartValidator } = require('../dashboard-chart-validator');
const fs = require('fs');
const path = require('path');

// Mock fs module
jest.mock('fs');
jest.mock('child_process');

describe('DashboardChartValidator', () => {
    let validator;

    beforeEach(() => {
        validator = new DashboardChartValidator({ verbose: false });
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        test('should initialize with default options', () => {
            const v = new DashboardChartValidator();
            expect(v.orgAlias).toBeNull();
            expect(v.verbose).toBe(false);
            expect(v.autoFix).toBe(false);
        });

        test('should accept custom options', () => {
            const v = new DashboardChartValidator({
                orgAlias: 'myOrg',
                verbose: true,
                autoFix: true
            });
            expect(v.orgAlias).toBe('myOrg');
            expect(v.verbose).toBe(true);
            expect(v.autoFix).toBe(true);
        });

        test('should initialize stats', () => {
            expect(validator.stats).toEqual({
                dashboardsScanned: 0,
                componentsChecked: 0,
                issuesFound: 0,
                issuesFixed: 0,
                passed: 0
            });
        });
    });

    describe('parseComponent', () => {
        test('should parse bar chart component with useReportChart=true', () => {
            const xml = `
                <componentType>Bar</componentType>
                <report>MyReport</report>
                <useReportChart>true</useReportChart>
            `;
            const result = validator.parseComponent(xml, 0);

            expect(result.type).toBe('Bar');
            expect(result.reportName).toBe('MyReport');
            expect(result.useReportChart).toBe(true);
            expect(result.hasChartSummary).toBe(false);
        });

        test('should parse component with useReportChart=false and inline config', () => {
            const xml = `
                <componentType>Column</componentType>
                <report>MyReport</report>
                <useReportChart>false</useReportChart>
                <chartSummary>
                    <aggregate>Sum</aggregate>
                    <axisBinding>y</axisBinding>
                    <column>Amount</column>
                </chartSummary>
                <groupingColumn>StageName</groupingColumn>
            `;
            const result = validator.parseComponent(xml, 0);

            expect(result.type).toBe('Column');
            expect(result.useReportChart).toBe(false);
            expect(result.hasChartSummary).toBe(true);
            expect(result.hasGroupingColumn).toBe(true);
        });

        test('should return null for non-chart components', () => {
            const xml = `
                <componentType>Table</componentType>
                <report>MyReport</report>
            `;
            const result = validator.parseComponent(xml, 0);
            expect(result).toBeNull();
        });

        test('should handle missing useReportChart (defaults to false)', () => {
            const xml = `
                <componentType>Pie</componentType>
                <report>MyReport</report>
            `;
            const result = validator.parseComponent(xml, 0);

            expect(result.type).toBe('Pie');
            expect(result.useReportChart).toBe(false);
        });

        test('should detect autoselectColumnsFromReport setting', () => {
            const xml = `
                <componentType>Line</componentType>
                <report>MyReport</report>
                <useReportChart>false</useReportChart>
                <autoselectColumnsFromReport>true</autoselectColumnsFromReport>
            `;
            const result = validator.parseComponent(xml, 0);

            expect(result.autoSelect).toBe(true);
        });

        test('should handle all chart types', () => {
            const chartTypes = [
                'Bar', 'BarGrouped', 'BarStacked', 'BarStacked100',
                'Column', 'ColumnGrouped', 'ColumnStacked', 'ColumnStacked100',
                'Line', 'LineGrouped', 'LineCumulative',
                'Pie', 'Donut', 'Funnel', 'Scatter'
            ];

            for (const chartType of chartTypes) {
                const xml = `<componentType>${chartType}</componentType><report>Test</report>`;
                const result = validator.parseComponent(xml, 0);
                expect(result).not.toBeNull();
                expect(result.type).toBe(chartType);
            }
        });
    });

    describe('parseDashboard', () => {
        test('should parse dashboard with grid components', () => {
            const dashboardContent = `
<?xml version="1.0" encoding="UTF-8"?>
<Dashboard xmlns="http://soap.sforce.com/2006/04/metadata">
    <dashboardGridComponents>
        <componentType>Bar</componentType>
        <report>SalesReport</report>
        <useReportChart>true</useReportChart>
    </dashboardGridComponents>
    <dashboardGridComponents>
        <componentType>Pie</componentType>
        <report>PipelineReport</report>
        <useReportChart>false</useReportChart>
        <chartSummary>
            <aggregate>Sum</aggregate>
        </chartSummary>
    </dashboardGridComponents>
</Dashboard>`;

            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(dashboardContent);

            const result = validator.parseDashboard('/path/to/dashboard.dashboard-meta.xml');

            expect(result.components.length).toBe(2);
            expect(result.components[0].type).toBe('Bar');
            expect(result.components[1].type).toBe('Pie');
        });

        test('should parse legacy dashboard sections', () => {
            const dashboardContent = `
<?xml version="1.0" encoding="UTF-8"?>
<Dashboard xmlns="http://soap.sforce.com/2006/04/metadata">
    <dashboardSections>
        <dashboardComponent>
            <componentType>Column</componentType>
            <report>LegacyReport</report>
        </dashboardComponent>
    </dashboardSections>
</Dashboard>`;

            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(dashboardContent);

            const result = validator.parseDashboard('/path/to/dashboard.dashboard-meta.xml');

            expect(result.components.length).toBe(1);
            expect(result.components[0].type).toBe('Column');
        });

        test('should throw error if file not found', () => {
            fs.existsSync.mockReturnValue(false);

            expect(() => {
                validator.parseDashboard('/nonexistent/path.xml');
            }).toThrow('Dashboard file not found');
        });
    });

    describe('validateComponent', () => {
        test('should return error when useReportChart=true but report has no chart', async () => {
            const v = new DashboardChartValidator({ orgAlias: 'testOrg' });
            // Mock report check to return false (no chart)
            v.checkReportHasChart = jest.fn().mockResolvedValue(false);

            const component = {
                type: 'Bar',
                reportName: 'NoChartReport',
                useReportChart: true,
                hasChartSummary: false,
                hasGroupingColumn: false
            };

            const issue = await v.validateComponent(component, 'TestDashboard');

            expect(issue).not.toBeNull();
            expect(issue.type).toBe('MISSING_REPORT_CHART');
            expect(issue.severity).toBe('ERROR');
            expect(issue.message).toContain('has no chart defined');
        });

        test('should return null when useReportChart=true and report has chart', async () => {
            const v = new DashboardChartValidator({ orgAlias: 'testOrg' });
            v.checkReportHasChart = jest.fn().mockResolvedValue(true);

            const component = {
                type: 'Bar',
                reportName: 'HasChartReport',
                useReportChart: true
            };

            const issue = await v.validateComponent(component, 'TestDashboard');

            expect(issue).toBeNull();
            // Note: stats.passed is incremented in validateDashboard, not validateComponent
            // Direct validateComponent calls don't update stats
        });

        test('should return warning when useReportChart=false but no chartSummary', async () => {
            const component = {
                type: 'Column',
                reportName: 'MyReport',
                useReportChart: false,
                hasChartSummary: false,
                hasGroupingColumn: false,
                autoSelect: false
            };

            const issue = await validator.validateComponent(component, 'TestDashboard');

            expect(issue).not.toBeNull();
            expect(issue.type).toBe('MISSING_INLINE_CONFIG');
            expect(issue.severity).toBe('WARNING');
        });

        test('should return warning when missing groupingColumn and autoSelect=false', async () => {
            const component = {
                type: 'Pie',
                reportName: 'MyReport',
                useReportChart: false,
                hasChartSummary: true,
                hasGroupingColumn: false,
                autoSelect: false
            };

            const issue = await validator.validateComponent(component, 'TestDashboard');

            expect(issue).not.toBeNull();
            expect(issue.type).toBe('MISSING_GROUPING');
            expect(issue.severity).toBe('WARNING');
        });

        test('should pass when useReportChart=false with proper inline config', async () => {
            const component = {
                type: 'Donut',
                reportName: 'MyReport',
                useReportChart: false,
                hasChartSummary: true,
                hasGroupingColumn: true,
                autoSelect: false
            };

            const issue = await validator.validateComponent(component, 'TestDashboard');

            expect(issue).toBeNull();
        });

        test('should pass when hasChartSummary and autoSelect=true', async () => {
            const component = {
                type: 'Line',
                reportName: 'MyReport',
                useReportChart: false,
                hasChartSummary: true,
                hasGroupingColumn: false,
                autoSelect: true
            };

            const issue = await validator.validateComponent(component, 'TestDashboard');

            expect(issue).toBeNull();
        });

        test('should return warning when cannot verify report chart (no org)', async () => {
            // No org alias set
            const v = new DashboardChartValidator();

            const component = {
                type: 'Bar',
                reportName: 'UnverifiableReport',
                useReportChart: true
            };

            const issue = await v.validateComponent(component, 'TestDashboard');

            expect(issue).not.toBeNull();
            expect(issue.type).toBe('UNVERIFIED_REPORT_CHART');
            expect(issue.severity).toBe('WARNING');
        });
    });

    describe('findDashboards', () => {
        test('should find all dashboard files in directory', () => {
            fs.existsSync.mockReturnValue(true);
            fs.readdirSync.mockImplementation((dir) => {
                if (dir === '/dashboards') {
                    return [
                        { name: 'Dashboard1.dashboard-meta.xml', isDirectory: () => false },
                        { name: 'Dashboard2.dashboard-meta.xml', isDirectory: () => false },
                        { name: 'other.xml', isDirectory: () => false },
                        { name: 'subfolder', isDirectory: () => true }
                    ];
                }
                if (dir === '/dashboards/subfolder') {
                    return [
                        { name: 'Dashboard3.dashboard-meta.xml', isDirectory: () => false }
                    ];
                }
                return [];
            });

            const dashboards = validator.findDashboards('/dashboards');

            expect(dashboards).toHaveLength(3);
            expect(dashboards).toContain('/dashboards/Dashboard1.dashboard-meta.xml');
            expect(dashboards).toContain('/dashboards/Dashboard2.dashboard-meta.xml');
            expect(dashboards).toContain('/dashboards/subfolder/Dashboard3.dashboard-meta.xml');
        });

        test('should return empty array for non-existent directory', () => {
            fs.existsSync.mockReturnValue(false);

            const dashboards = validator.findDashboards('/nonexistent');

            expect(dashboards).toHaveLength(0);
        });
    });

    describe('generateReport', () => {
        test('should generate summary report with errors', () => {
            validator.stats = {
                dashboardsScanned: 2,
                componentsChecked: 5,
                issuesFound: 2,
                issuesFixed: 0,
                passed: 3
            };

            const results = [
                {
                    dashboard: 'Dashboard1',
                    issues: [
                        { type: 'MISSING_REPORT_CHART', severity: 'ERROR', component: 'Bar', report: 'Report1', message: 'Test error', recommendation: 'Fix it' }
                    ]
                },
                {
                    dashboard: 'Dashboard2',
                    issues: [
                        { type: 'MISSING_INLINE_CONFIG', severity: 'WARNING', component: 'Column', message: 'Test warning' }
                    ]
                }
            ];

            // Capture console output
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            const report = validator.generateReport(results);

            expect(report.success).toBe(false);
            expect(report.errors).toHaveLength(1);
            expect(report.warnings).toHaveLength(1);

            consoleSpy.mockRestore();
        });

        test('should indicate success when no errors', () => {
            validator.stats = {
                dashboardsScanned: 1,
                componentsChecked: 3,
                issuesFound: 0,
                issuesFixed: 0,
                passed: 3
            };

            const results = [{ dashboard: 'Dashboard1', issues: [] }];

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            const report = validator.generateReport(results);

            expect(report.success).toBe(true);
            expect(report.errors).toHaveLength(0);
            expect(report.warnings).toHaveLength(0);

            consoleSpy.mockRestore();
        });
    });

    describe('checkReportHasChart', () => {
        test('should return null when no org alias provided', async () => {
            const result = await validator.checkReportHasChart('SomeReport');
            expect(result).toBeNull();
        });

        test('should cache results', async () => {
            const v = new DashboardChartValidator({ orgAlias: 'testOrg' });
            v.reportChartCache.set('CachedReport', true);

            const result = await v.checkReportHasChart('CachedReport');

            expect(result).toBe(true);
        });
    });

    describe('fixIssues', () => {
        test('should switch useReportChart to false when fixing', async () => {
            const dashboard = {
                filePath: '/path/to/dashboard.xml',
                content: '<useReportChart>true</useReportChart>'
            };

            const issues = [{
                type: 'MISSING_REPORT_CHART',
                fix: { action: 'SWITCH_TO_INLINE', useReportChart: false }
            }];

            fs.copyFileSync = jest.fn();
            fs.writeFileSync = jest.fn();

            const v = new DashboardChartValidator({ autoFix: true });
            await v.fixIssues(dashboard, issues);

            expect(fs.writeFileSync).toHaveBeenCalled();
            const writtenContent = fs.writeFileSync.mock.calls[0][1];
            expect(writtenContent).toContain('<useReportChart>false</useReportChart>');
            expect(v.stats.issuesFixed).toBe(1);
        });

        test('should create backup before modifying', async () => {
            const dashboard = {
                filePath: '/path/to/dashboard.xml',
                content: '<useReportChart>true</useReportChart>'
            };

            const issues = [{
                type: 'MISSING_REPORT_CHART',
                fix: { action: 'SWITCH_TO_INLINE' }
            }];

            fs.copyFileSync = jest.fn();
            fs.writeFileSync = jest.fn();

            const v = new DashboardChartValidator({ autoFix: true });
            await v.fixIssues(dashboard, issues);

            expect(fs.copyFileSync).toHaveBeenCalledWith(
                '/path/to/dashboard.xml',
                '/path/to/dashboard.xml.backup'
            );
        });
    });
});

describe('Integration Scenarios', () => {
    test('should correctly identify the exact issue from reflection', () => {
        // This is the exact scenario from reflection 13c9b2ca-2b30-4703-bc49-b13a57b5fab1:
        // Dashboard with useReportChart=true but source report has no <chart> element

        const validator = new DashboardChartValidator({ verbose: false });

        // Simulate the problematic component
        const componentXml = `
            <componentType>BarStacked</componentType>
            <report>Pipeline_Maturity_Comparison_Report</report>
            <useReportChart>true</useReportChart>
        `;

        const component = validator.parseComponent(componentXml, 0);

        expect(component.type).toBe('BarStacked');
        expect(component.useReportChart).toBe(true);
        expect(component.hasChartSummary).toBe(false);

        // This component WILL fail if the report doesn't have a chart defined
        // The fix is to set useReportChart=false and add inline chartSummary
    });

    test('should validate properly configured inline chart', () => {
        const validator = new DashboardChartValidator({ verbose: false });

        // Proper inline configuration that won't fail
        const goodComponentXml = `
            <componentType>BarStacked</componentType>
            <report>Pipeline_Maturity_Comparison_Report</report>
            <useReportChart>false</useReportChart>
            <autoselectColumnsFromReport>false</autoselectColumnsFromReport>
            <chartSummary>
                <aggregate>Sum</aggregate>
                <axisBinding>y</axisBinding>
                <column>Amount</column>
            </chartSummary>
            <groupingColumn>StageName</groupingColumn>
        `;

        const component = validator.parseComponent(goodComponentXml, 0);

        expect(component.type).toBe('BarStacked');
        expect(component.useReportChart).toBe(false);
        expect(component.hasChartSummary).toBe(true);
        expect(component.hasGroupingColumn).toBe(true);
    });
});
