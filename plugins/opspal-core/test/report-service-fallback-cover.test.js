const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('../scripts/lib/pdf-generator', () => {
  return jest.fn().mockImplementation(() => ({
    convertMarkdown: jest.fn().mockResolvedValue(undefined),
    collate: jest.fn().mockResolvedValue(undefined)
  }));
});

jest.mock('../scripts/lib/pdf-generation-helper', () => ({
  getRecommendedCoverTemplate: jest.fn((reportType) => {
    const value = String(reportType || '').toLowerCase();
    if (value.includes('security')) return 'security-audit';
    if (value.includes('data') || value.includes('quality')) return 'data-quality';
    if (value.includes('hubspot')) return 'hubspot-assessment';
    if (value.includes('salesforce') || value.includes('automation') || value.includes('audit')) return 'salesforce-audit';
    return 'default';
  }),
  generateWithRetry: jest.fn().mockResolvedValue({ pdfPath: '/tmp/fallback.pdf' })
}));

const PDFGenerator = require('../scripts/lib/pdf-generator');
const ReportService = require('../scripts/lib/report-service');

describe('ReportService fallback cover template selection', () => {
  let tmpDir;
  let service;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-service-test-'));
    service = new ReportService({
      baseOutputDir: tmpDir,
      registryPath: path.join(tmpDir, 'registry.json'),
      verbose: false
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('uses salesforce-audit cover for unknown Salesforce report types', async () => {
    await service.generate({
      type: 'custom-audit-workflow',
      platform: 'salesforce',
      org: 'acme',
      title: 'Custom Salesforce Audit',
      content: '# Example report',
      outputDir: tmpDir
    });

    const instance = PDFGenerator.mock.results[0].value;
    const options = instance.convertMarkdown.mock.calls[0][2];
    expect(options.coverTemplate).toBe('salesforce-audit');
  });

  it('uses data-quality cover for unknown Salesforce data-quality report types', async () => {
    await service.generate({
      type: 'custom-dedupe-analysis',
      platform: 'salesforce',
      org: 'acme',
      title: 'Data Quality Diagnostic',
      content: '# Data quality report',
      outputDir: tmpDir
    });

    const instance = PDFGenerator.mock.results[0].value;
    const options = instance.convertMarkdown.mock.calls[0][2];
    expect(options.coverTemplate).toBe('data-quality');
  });
});
