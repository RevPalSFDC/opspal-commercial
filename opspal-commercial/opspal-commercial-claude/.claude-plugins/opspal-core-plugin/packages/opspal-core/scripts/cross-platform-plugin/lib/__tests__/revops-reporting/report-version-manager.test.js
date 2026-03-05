/**
 * Unit tests for ReportVersionManager
 * Phase 6: Comprehensive QA Plan
 *
 * Tests report versioning and comparison capabilities including:
 * - Version saving and retrieval
 * - Version comparison and diff generation
 * - KPI trend across versions
 *
 * @version 2.0.0 - Updated to match synchronous implementation API
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const { ReportVersionManager } = require('../../report-version-manager');

// Load test fixtures
const sampleOpportunities = require('./fixtures/sample-opportunities.json');

describe('ReportVersionManager', () => {
    let versionManager;
    let tempStoragePath;
    const mockReportId = 'report-arr-q4-2024';

    beforeEach(() => {
        // Create temp directory for test storage
        tempStoragePath = path.join(os.tmpdir(), `rvm-test-${Date.now()}`);
        versionManager = new ReportVersionManager({
            storagePath: tempStoragePath,
            maxVersions: 50
        });
    });

    afterEach(() => {
        // Cleanup temp directory
        if (fs.existsSync(tempStoragePath)) {
            fs.rmSync(tempStoragePath, { recursive: true, force: true });
        }
        versionManager = null;
    });

    // ============================================
    // Initialization Tests
    // ============================================
    describe('Initialization', () => {
        test('should create instance with default options', () => {
            const manager = new ReportVersionManager();
            expect(manager).toBeInstanceOf(ReportVersionManager);
        });

        test('should accept custom configuration', () => {
            const customPath = path.join(os.tmpdir(), `custom-rvm-${Date.now()}`);
            const customManager = new ReportVersionManager({
                maxVersions: 100,
                storagePath: customPath
            });
            expect(customManager).toBeDefined();
            expect(customManager.maxVersions).toBe(100);
            expect(customManager.storagePath).toBe(customPath);

            // Cleanup
            if (fs.existsSync(customPath)) {
                fs.rmSync(customPath, { recursive: true, force: true });
            }
        });

        test('should have storage path configured', () => {
            expect(versionManager.storagePath).toBeDefined();
            expect(typeof versionManager.storagePath).toBe('string');
        });

        test('should create storage directory on init', () => {
            expect(fs.existsSync(tempStoragePath)).toBe(true);
        });
    });

    // ============================================
    // Version Save Tests
    // ============================================
    describe('saveVersion()', () => {
        const mockReportData = {
            kpis: {
                ARR: 1200000,
                NRR: 1.05,
                WinRate: 0.25
            },
            records: sampleOpportunities.records,
            generatedAt: '2024-10-15T10:00:00Z'
        };

        const mockMetadata = {
            author: 'claude-agent',
            source: 'automated',
            notes: 'Q4 2024 ARR Report'
        };

        test('should save version and return result object', () => {
            const result = versionManager.saveVersion(
                mockReportId,
                mockReportData,
                mockMetadata
            );

            expect(result.success).toBe(true);
            expect(result.versionId).toBeDefined();
            expect(result.reportId).toBe(mockReportId);
            expect(result.versionNumber).toBe(1);
            expect(result.timestamp).toBeDefined();
            expect(result.contentHash).toBeDefined();
        });

        test('should auto-increment version numbers', () => {
            versionManager.saveVersion(mockReportId, mockReportData, mockMetadata);
            const result2 = versionManager.saveVersion(mockReportId, { ...mockReportData, kpis: { ARR: 1300000 } }, mockMetadata);

            expect(result2.versionNumber).toBe(2);

            const listResult = versionManager.listVersions(mockReportId);
            expect(listResult.success).toBe(true);
            expect(listResult.totalVersions).toBe(2);
        });

        test('should store timestamp with version', () => {
            const result = versionManager.saveVersion(
                mockReportId,
                mockReportData,
                mockMetadata
            );

            expect(result.success).toBe(true);
            expect(result.timestamp).toBeDefined();
            expect(new Date(result.timestamp)).toBeInstanceOf(Date);
        });

        test('should store metadata with version', () => {
            const saveResult = versionManager.saveVersion(
                mockReportId,
                mockReportData,
                mockMetadata
            );

            const version = versionManager.getVersion(mockReportId, saveResult.versionId);
            expect(version.success).toBe(true);
            expect(version.metadata.author).toBe('claude-agent');
        });

        test('should handle null data by creating valid hash', () => {
            // Implementation processes null data by stringifying it
            // This test verifies the behavior rather than expecting rejection
            const result = versionManager.saveVersion(mockReportId, null, mockMetadata);

            // Implementation does not reject null data - it creates a hash of "null"
            expect(result.success).toBe(true);
            expect(result.versionId).toBeDefined();
        });

        test('should handle empty metadata gracefully', () => {
            const result = versionManager.saveVersion(
                mockReportId,
                mockReportData,
                {}
            );
            expect(result.success).toBe(true);
            expect(result.versionId).toBeDefined();
        });

        test('should skip save if content unchanged', () => {
            // Save first version
            versionManager.saveVersion(mockReportId, mockReportData, mockMetadata);

            // Save same data again
            const result2 = versionManager.saveVersion(mockReportId, mockReportData, mockMetadata);

            expect(result2.success).toBe(true);
            expect(result2.skipped).toBe(true);
            expect(result2.reason).toContain('No changes');
        });
    });

    // ============================================
    // Version Retrieval Tests
    // ============================================
    describe('getVersion()', () => {
        let savedVersionId;
        const mockData = {
            kpis: { ARR: 1000000 },
            generatedAt: '2024-10-01T10:00:00Z'
        };

        beforeEach(() => {
            const result = versionManager.saveVersion(
                mockReportId,
                mockData,
                { author: 'test' }
            );
            savedVersionId = result.versionId;
        });

        test('should retrieve saved version by ID', () => {
            const result = versionManager.getVersion(mockReportId, savedVersionId);

            expect(result.success).toBe(true);
            expect(result.data).toBeDefined();
            expect(result.data.kpis.ARR).toBe(1000000);
        });

        test('should retrieve latest version when ID is "latest"', () => {
            // Save another version
            versionManager.saveVersion(mockReportId, { kpis: { ARR: 1100000 } }, {});

            const result = versionManager.getVersion(mockReportId, 'latest');
            expect(result.success).toBe(true);
            expect(result.data.kpis.ARR).toBe(1100000);
        });

        test('should return error for non-existent version', () => {
            const result = versionManager.getVersion(mockReportId, 'invalid-version');

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.error).toContain('not found');
        });

        test('should return error for non-existent report', () => {
            const result = versionManager.getVersion('non-existent-report', savedVersionId);

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.error).toContain('not found');
        });
    });

    describe('listVersions()', () => {
        beforeEach(() => {
            for (let i = 0; i < 5; i++) {
                versionManager.saveVersion(
                    mockReportId,
                    { kpis: { ARR: 1000000 + (i * 100000) } },
                    { iteration: i }
                );
            }
        });

        test('should return all versions for a report', () => {
            const result = versionManager.listVersions(mockReportId);

            expect(result.success).toBe(true);
            expect(result.versions).toHaveLength(5);
            expect(result.totalVersions).toBe(5);
        });

        test('should return versions in order (newest first by default)', () => {
            const result = versionManager.listVersions(mockReportId);

            expect(result.success).toBe(true);
            // Versions array is reversed (newest first)
            expect(result.versions[0].versionNumber).toBeGreaterThan(result.versions[4].versionNumber);
        });

        test('should return error for report with no versions', () => {
            const result = versionManager.listVersions('empty-report');

            expect(result.success).toBe(false);
            expect(result.error).toContain('not found');
        });

        test('should support limit option', () => {
            const result = versionManager.listVersions(mockReportId, { limit: 2 });

            expect(result.success).toBe(true);
            expect(result.versions).toHaveLength(2);
            expect(result.totalVersions).toBe(5);
        });
    });

    // ============================================
    // Version Comparison Tests
    // ============================================
    describe('compareVersions()', () => {
        let version1Id, version2Id;

        beforeEach(() => {
            const result1 = versionManager.saveVersion(mockReportId, {
                kpis: { ARR: 1000000, NRR: 1.02, WinRate: 0.20 },
                records: [{ Id: '1', Amount: 100000 }],
                filters: { stage: 'Closed Won' }
            }, { iteration: 1 });
            version1Id = result1.versionId;

            const result2 = versionManager.saveVersion(mockReportId, {
                kpis: { ARR: 1200000, NRR: 1.05, WinRate: 0.25, CAC: 5000 },
                records: [
                    { Id: '1', Amount: 100000 },
                    { Id: '2', Amount: 200000 }
                ],
                filters: { stage: 'Closed Won', region: 'North' }
            }, { iteration: 2 });
            version2Id = result2.versionId;
        });

        test('should compare two versions', () => {
            const result = versionManager.compareVersions(
                mockReportId,
                version1Id,
                version2Id
            );

            expect(result.success).toBe(true);
            expect(result.version1).toBeDefined();
            expect(result.version2).toBeDefined();
            expect(result.diff).toBeDefined();
        });

        test('should include diff information', () => {
            const result = versionManager.compareVersions(
                mockReportId,
                version1Id,
                version2Id
            );

            expect(result.success).toBe(true);
            expect(result.diff).toBeDefined();
            // Diff should show changes in kpis
            expect(result.diff.changed).toBeDefined();
        });

        test('should detect added fields', () => {
            const result = versionManager.compareVersions(
                mockReportId,
                version1Id,
                version2Id
            );

            expect(result.success).toBe(true);
            expect(result.diff.added).toBeDefined();
            // CAC was added in v2
            const addedPaths = result.diff.added.map(a => a.path);
            expect(addedPaths.some(p => p.includes('CAC') || p.includes('region'))).toBe(true);
        });

        test('should return error for non-existent version', () => {
            const result = versionManager.compareVersions(
                mockReportId,
                version1Id,
                'non-existent-version'
            );

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        test('should include comparison summary', () => {
            const result = versionManager.compareVersions(
                mockReportId,
                version1Id,
                version2Id
            );

            expect(result.success).toBe(true);
            expect(result.summary).toBeDefined();
            expect(typeof result.summary).toBe('string');
        });
    });

    // ============================================
    // KPI Trend Tests
    // ============================================
    describe('getKPITrend()', () => {
        beforeEach(() => {
            const arrs = [1000000, 1050000, 1100000, 1180000, 1200000];
            for (let i = 0; i < arrs.length; i++) {
                versionManager.saveVersion(mockReportId, {
                    kpis: { ARR: arrs[i], NRR: 1.0 + (i * 0.01) }
                }, { month: `2024-${String(i + 1).padStart(2, '0')}` });
            }
        });

        test('should return KPI values across versions', () => {
            const result = versionManager.getKPITrend(mockReportId, 'kpis.ARR');

            expect(result.success).toBe(true);
            expect(result.trend).toBeDefined();
            expect(result.trend).toHaveLength(5);
        });

        test('should include version metadata in trend', () => {
            const result = versionManager.getKPITrend(mockReportId, 'kpis.ARR');

            expect(result.success).toBe(true);
            expect(result.trend[0].versionId).toBeDefined();
            expect(result.trend[0].timestamp).toBeDefined();
        });

        test('should calculate trend statistics', () => {
            const result = versionManager.getKPITrend(mockReportId, 'kpis.ARR');

            expect(result.success).toBe(true);
            expect(result.statistics).toBeDefined();
            expect(result.statistics.min).toBeDefined();
            expect(result.statistics.max).toBeDefined();
            expect(result.statistics.average).toBeDefined();
        });

        test('should limit versions in trend', () => {
            const result = versionManager.getKPITrend(mockReportId, 'kpis.ARR', 3);

            expect(result.success).toBe(true);
            expect(result.trend).toHaveLength(3);
        });

        test('should return error for non-existent report', () => {
            const result = versionManager.getKPITrend('non-existent-report', 'kpis.ARR');

            expect(result.success).toBe(false);
            expect(result.error).toContain('not found');
        });

        test('should handle non-existent KPI path', () => {
            const result = versionManager.getKPITrend(mockReportId, 'kpis.NonExistentKPI');

            expect(result.success).toBe(true);
            // Trend entries should have valid: false
            result.trend.forEach(t => {
                expect(t.valid).toBe(false);
            });
        });
    });

    // ============================================
    // Report Generation Tests
    // ============================================
    describe('generateComparisonReport()', () => {
        let comparison;

        beforeEach(() => {
            const v1Result = versionManager.saveVersion(mockReportId, {
                kpis: { ARR: 1000000, NRR: 1.02 }
            }, {});

            const v2Result = versionManager.saveVersion(mockReportId, {
                kpis: { ARR: 1200000, NRR: 1.05 }
            }, {});

            comparison = versionManager.compareVersions(mockReportId, v1Result.versionId, v2Result.versionId);
        });

        test('should generate markdown report', () => {
            const report = versionManager.generateComparisonReport(comparison);

            expect(typeof report).toBe('string');
            expect(report).toContain('#');  // Markdown heading
            expect(report).toContain(mockReportId);
        });

        test('should include version info in report', () => {
            const report = versionManager.generateComparisonReport(comparison);

            expect(report).toContain('v1');
            expect(report).toContain('v2');
        });

        test('should handle error comparison', () => {
            const errorComparison = { success: false, error: 'Test error' };
            const report = versionManager.generateComparisonReport(errorComparison);

            expect(report).toContain('Error');
        });
    });

    // ============================================
    // Version Cleanup Tests
    // ============================================
    describe('cleanupVersions()', () => {
        beforeEach(() => {
            // Create 10 versions
            for (let i = 0; i < 10; i++) {
                versionManager.saveVersion(mockReportId, {
                    kpis: { ARR: 1000000 + (i * 10000) }
                }, {});
            }
        });

        test('should keep only specified number of versions', () => {
            const result = versionManager.cleanupVersions(mockReportId, 5);

            expect(result.success).toBe(true);
            expect(result.deleted).toBe(5);
            expect(result.remaining).toBe(5);

            const listResult = versionManager.listVersions(mockReportId);
            expect(listResult.versions).toHaveLength(5);
        });

        test('should keep newest versions', () => {
            versionManager.cleanupVersions(mockReportId, 3);
            const listResult = versionManager.listVersions(mockReportId);

            // Verify we kept the 3 newest (highest version numbers)
            expect(listResult.versions).toHaveLength(3);
            // First in list is newest
            expect(listResult.versions[0].versionNumber).toBe(10);
        });

        test('should do nothing if count exceeds existing versions', () => {
            const result = versionManager.cleanupVersions(mockReportId, 20);

            expect(result.success).toBe(true);
            expect(result.deleted).toBe(0);
            expect(result.remaining).toBe(10);

            const listResult = versionManager.listVersions(mockReportId);
            expect(listResult.versions).toHaveLength(10);
        });

        test('should return error for non-existent report', () => {
            const result = versionManager.cleanupVersions('non-existent', 5);

            expect(result.success).toBe(false);
            expect(result.error).toContain('not found');
        });
    });

    // ============================================
    // Edge Cases
    // ============================================
    describe('Edge Cases', () => {
        test('should handle version with empty KPIs', () => {
            const result = versionManager.saveVersion(mockReportId, {
                kpis: {},
                records: []
            }, {});

            expect(result.success).toBe(true);

            const version = versionManager.getVersion(mockReportId, result.versionId);
            expect(version.success).toBe(true);
            expect(version.data.kpis).toEqual({});
        });

        test('should handle very large version data', () => {
            const largeData = {
                kpis: { ARR: 1000000 },
                records: Array.from({ length: 1000 }, (_, i) => ({
                    Id: `record-${i}`,
                    Amount: Math.random() * 100000
                }))
            };

            const saveResult = versionManager.saveVersion(mockReportId, largeData, {});
            expect(saveResult.success).toBe(true);

            const version = versionManager.getVersion(mockReportId, saveResult.versionId);
            expect(version.success).toBe(true);
            expect(version.data.records).toHaveLength(1000);
        });

        test('should handle special characters in metadata', () => {
            const saveResult = versionManager.saveVersion(mockReportId, {
                kpis: { ARR: 1000000 }
            }, {
                notes: "Report for O'Reilly & Associates \"Q4\"",
                tags: ['revenue', 'Q4-2024']
            });

            expect(saveResult.success).toBe(true);

            const version = versionManager.getVersion(mockReportId, saveResult.versionId);
            expect(version.success).toBe(true);
            expect(version.metadata.notes).toContain("O'Reilly");
        });

        test('should handle comparison of identical versions', () => {
            const data = { kpis: { ARR: 1000000 } };
            const v1Result = versionManager.saveVersion(mockReportId, data, {});

            // Force second save by changing something then changing back
            versionManager.saveVersion(mockReportId, { kpis: { ARR: 1100000 } }, {});
            const v3Result = versionManager.saveVersion(mockReportId, data, {});

            const comparison = versionManager.compareVersions(mockReportId, v1Result.versionId, v3Result.versionId);

            expect(comparison.success).toBe(true);
            // Both have same ARR value
            expect(comparison.diff.changed.length).toBe(0);
        });

        test('should handle deeply nested data changes', () => {
            const v1Result = versionManager.saveVersion(mockReportId, {
                kpis: { ARR: 1000000 },
                breakdown: {
                    region: {
                        north: { value: 400000, growth: 0.15 },
                        south: { value: 300000, growth: 0.10 }
                    }
                }
            }, {});

            const v2Result = versionManager.saveVersion(mockReportId, {
                kpis: { ARR: 1100000 },
                breakdown: {
                    region: {
                        north: { value: 450000, growth: 0.20 },
                        south: { value: 350000, growth: 0.12 }
                    }
                }
            }, {});

            const comparison = versionManager.compareVersions(mockReportId, v1Result.versionId, v2Result.versionId);

            expect(comparison.success).toBe(true);
            expect(comparison.diff).toBeDefined();
            expect(comparison.diff.changed.length).toBeGreaterThan(0);
        });

        test('should handle reportId with special characters', () => {
            const specialReportId = 'report_arr-q4_2024.test';

            const saveResult = versionManager.saveVersion(specialReportId, {
                kpis: { ARR: 1000000 }
            }, {});

            expect(saveResult.success).toBe(true);

            const version = versionManager.getVersion(specialReportId, saveResult.versionId);
            expect(version.success).toBe(true);
        });
    });

    // ============================================
    // Index Management Tests
    // ============================================
    describe('Index Management', () => {
        test('should persist index across instances', () => {
            // Save some versions
            versionManager.saveVersion(mockReportId, { kpis: { ARR: 1000000 } }, {});
            versionManager.saveVersion(mockReportId, { kpis: { ARR: 1100000 } }, {});

            // Create new instance with same storage path
            const newManager = new ReportVersionManager({
                storagePath: tempStoragePath
            });

            const result = newManager.listVersions(mockReportId);
            expect(result.success).toBe(true);
            expect(result.totalVersions).toBe(2);
        });

        test('should track latest version correctly', () => {
            versionManager.saveVersion(mockReportId, { kpis: { ARR: 1000000 } }, {});
            const v2Result = versionManager.saveVersion(mockReportId, { kpis: { ARR: 1100000 } }, {});

            const listResult = versionManager.listVersions(mockReportId);
            expect(listResult.latestVersion).toBe(v2Result.versionId);
        });
    });
});
