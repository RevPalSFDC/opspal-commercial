const ReportsUsageAnalyzer = require('../reports-usage-analyzer');
const { classifyDashboardExecutionType } = require('../reports-usage-analyzer');

describe('reports-usage-analyzer safeguards', () => {
  describe('classifyDashboardExecutionType', () => {
    test('identifies dynamic dashboards by Type=LoggedInUser', () => {
      const result = classifyDashboardExecutionType({
        Type: 'LoggedInUser',
        RunningUserId: '005xx0000012345'
      });

      expect(result.dashboardType).toBe('LoggedInUser');
      expect(result.isDynamic).toBe(true);
      expect(result.isStatic).toBe(false);
    });

    test('identifies static dashboards by Type=SpecifiedUser', () => {
      const result = classifyDashboardExecutionType({
        Type: 'SpecifiedUser',
        RunningUserId: '005xx0000099999'
      });

      expect(result.dashboardType).toBe('SpecifiedUser');
      expect(result.isDynamic).toBe(false);
      expect(result.isStatic).toBe(true);
    });
  });

  describe('classifyReportMetadataError', () => {
    test('adds private-folder guidance when report exists but REST returns NOT_FOUND', async () => {
      const analyzer = new ReportsUsageAnalyzer('test-org');
      jest.spyOn(analyzer, 'executeQuery').mockResolvedValue([
        { Id: '00Oxx0000012345', FolderName: 'My Personal Reports' }
      ]);

      const message = await analyzer.classifyReportMetadataError(
        { Id: '00Oxx0000012345' },
        new Error('NOT_FOUND')
      );

      expect(message).toContain('private/personal folder visibility');
      expect(message).toContain('My Personal Reports');
    });
  });
});
