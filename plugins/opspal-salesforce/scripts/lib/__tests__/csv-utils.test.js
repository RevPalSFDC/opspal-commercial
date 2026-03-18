const fs = require('fs');
const os = require('os');
const path = require('path');

const { normalizeCsvForBulkApi } = require('../csv-utils');
const { assessWritePath } = require('../file-write-safeguard');

describe('csv-utils write safeguards', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'csv-utils-test-'));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('flags mounted Windows paths as Excel lock risks', () => {
    const assessment = assessWritePath('/mnt/c/Users/test/report.csv');

    expect(assessment.mountedWindowsPath).toBe(true);
    expect(assessment.excelLockRisk).toBe(true);
  });

  it('falls back to a temp artifact when a CSV write is locked', async () => {
    const inputPath = path.join(tempDir, 'input.csv');
    const outputPath = path.join(tempDir, 'locked-output.csv');
    fs.writeFileSync(inputPath, 'Name\r\nAcme Corp\r\n', 'utf8');

    const realWriteFileSync = fs.writeFileSync.bind(fs);
    jest.spyOn(fs, 'writeFileSync').mockImplementation((targetPath, content, encoding) => {
      if (targetPath === outputPath) {
        const error = new Error('Permission denied - file is locked');
        error.code = 'EACCES';
        throw error;
      }

      return realWriteFileSync(targetPath, content, encoding);
    });

    const result = await normalizeCsvForBulkApi(inputPath, { output: outputPath });

    expect(result.writeResult.usedFallback).toBe(true);
    expect(result.outputPath).not.toBe(outputPath);
    expect(fs.existsSync(result.outputPath)).toBe(true);
    expect(result.message).toContain('fallback');
  });
});
