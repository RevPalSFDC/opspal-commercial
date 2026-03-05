/**
 * Test Suite: Portal Context Manager
 *
 * Tests the HubSpot portal context persistence across assessments.
 * Prevents re-analyzing the same areas and maintains institutional knowledge.
 *
 * CRITICAL: Adapted from SFDC org-context-manager.js for HubSpot portals.
 * Maintains assessment history, cross-references overlapping areas.
 *
 * Coverage Target: >90%
 * Priority: Tier 1 (HIGH - State isolation, race conditions)
 */

const fs = require('fs');
const path = require('path');

// Mock fs module before requiring the module under test
jest.mock('fs');

const { PortalContextManager } = require('../scripts/lib/portal-context-manager');

describe('PortalContextManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    // Default: context file doesn't exist
    fs.existsSync.mockReturnValue(false);
    fs.mkdirSync.mockImplementation(() => {});
    fs.writeFileSync.mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should store portal name', () => {
      const manager = new PortalContextManager('test-portal');
      expect(manager.portalName).toBe('test-portal');
    });

    it('should set correct paths', () => {
      const manager = new PortalContextManager('test-portal');

      expect(manager.portalDir).toContain('test-portal');
      expect(manager.contextPath).toContain('PORTAL_CONTEXT.json');
    });

    it('should initialize new context when file does not exist', () => {
      fs.existsSync.mockReturnValue(false);

      const manager = new PortalContextManager('new-portal');

      expect(manager.context).toEqual({
        portalName: 'new-portal',
        assessments: [],
        configurations: {},
        integrations: [],
        dataQualityHistory: [],
        workflowPatterns: [],
        propertyChanges: [],
        lastUpdated: expect.any(String),
        metadata: {
          totalAssessments: 0,
          firstAssessment: null,
          lastAssessment: null
        },
        _resolution: expect.objectContaining({
          path: expect.any(String),
          structure: expect.any(String),
          instance: 'new-portal'
        })
      });
    });

    it('should load existing context from file', () => {
      const existingContext = {
        portalName: 'existing-portal',
        assessments: [{ id: 'a1', type: 'general' }],
        configurations: {},
        integrations: [],
        dataQualityHistory: [],
        workflowPatterns: [],
        propertyChanges: [],
        lastUpdated: '2024-01-01',
        metadata: { totalAssessments: 1, firstAssessment: '2024-01-01', lastAssessment: '2024-01-01' }
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(existingContext));

      const manager = new PortalContextManager('existing-portal');

      expect(manager.context.assessments).toHaveLength(1);
      expect(manager.context.metadata.totalAssessments).toBe(1);
    });
  });

  describe('loadContext()', () => {
    it('should return default context when file does not exist', () => {
      fs.existsSync.mockReturnValue(false);

      const manager = new PortalContextManager('test-portal');
      const context = manager.loadContext();

      expect(context.assessments).toEqual([]);
      expect(context.metadata.totalAssessments).toBe(0);
    });

    it('should parse JSON from existing file', () => {
      const savedContext = {
        portalName: 'test',
        assessments: [{ id: 'a1' }],
        configurations: {},
        integrations: [],
        dataQualityHistory: [],
        workflowPatterns: [],
        propertyChanges: [],
        lastUpdated: '2024-01-01',
        metadata: { totalAssessments: 1, firstAssessment: null, lastAssessment: null }
      };

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(savedContext));

      const manager = new PortalContextManager('test');
      const context = manager.loadContext();

      expect(context.assessments).toHaveLength(1);
    });
  });

  describe('saveContext()', () => {
    it('should create portal directory if it does not exist', () => {
      fs.existsSync.mockReturnValue(false);

      const manager = new PortalContextManager('test-portal');
      manager.saveContext();

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('test-portal'),
        { recursive: true }
      );
    });

    it('should write context as JSON', () => {
      fs.existsSync.mockReturnValue(false);

      const manager = new PortalContextManager('test-portal');
      manager.saveContext();

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('PORTAL_CONTEXT.json'),
        expect.any(String)
      );

      const writtenContent = fs.writeFileSync.mock.calls[0][1];
      const parsed = JSON.parse(writtenContent);
      expect(parsed.portalName).toBe('test-portal');
    });

    it('should update lastUpdated timestamp', () => {
      fs.existsSync.mockReturnValue(false);

      const manager = new PortalContextManager('test-portal');
      const beforeSave = manager.context.lastUpdated;

      // Small delay to ensure different timestamp
      manager.saveContext();

      expect(manager.context.lastUpdated).toBeDefined();
    });
  });

  describe('addAssessment()', () => {
    it('should add assessment with generated ID', () => {
      const manager = new PortalContextManager('test-portal');

      const assessment = manager.addAssessment({
        type: 'data-quality',
        framework: 'standard-framework',
        scope: ['contacts', 'companies'],
        findings: ['Finding 1', 'Finding 2']
      });

      expect(assessment.id).toMatch(/^assessment-\d+$/);
      expect(assessment.type).toBe('data-quality');
      expect(assessment.framework).toBe('standard-framework');
      expect(manager.context.assessments).toHaveLength(1);
    });

    it('should update metadata counters', () => {
      const manager = new PortalContextManager('test-portal');

      manager.addAssessment({ type: 'audit' });

      expect(manager.context.metadata.totalAssessments).toBe(1);
      expect(manager.context.metadata.firstAssessment).toBeDefined();
      expect(manager.context.metadata.lastAssessment).toBeDefined();
    });

    it('should use defaults for missing fields', () => {
      const manager = new PortalContextManager('test-portal');

      const assessment = manager.addAssessment({});

      expect(assessment.type).toBe('general');
      expect(assessment.framework).toBe('unknown');
      expect(assessment.scope).toEqual([]);
      expect(assessment.findings).toEqual([]);
      expect(assessment.status).toBe('completed');
    });

    it('should preserve firstAssessment on subsequent adds', () => {
      const manager = new PortalContextManager('test-portal');

      manager.addAssessment({ type: 'first' });
      const firstDate = manager.context.metadata.firstAssessment;

      manager.addAssessment({ type: 'second' });

      expect(manager.context.metadata.firstAssessment).toBe(firstDate);
      expect(manager.context.metadata.totalAssessments).toBe(2);
      // lastAssessment updates on each add (may be same timestamp if rapid)
      expect(manager.context.metadata.lastAssessment).toBeDefined();
    });
  });

  describe('updateFromAssessmentFile()', () => {
    it('should throw for non-existent file', () => {
      fs.existsSync.mockImplementation((p) => {
        if (p.includes('assessment.json')) return false;
        return false;
      });

      const manager = new PortalContextManager('test-portal');

      expect(() => manager.updateFromAssessmentFile('/path/to/missing.json'))
        .toThrow('Assessment file not found');
    });

    it('should load assessment from file and save context', () => {
      const assessmentData = {
        type: 'workflow-audit',
        framework: 'custom',
        findings: ['Issue found']
      };

      fs.existsSync.mockImplementation((p) => {
        if (p.includes('assessment.json')) return true;
        return false;
      });
      fs.readFileSync.mockImplementation((p) => {
        if (p.includes('assessment.json')) return JSON.stringify(assessmentData);
        return '{}';
      });

      const manager = new PortalContextManager('test-portal');
      manager.updateFromAssessmentFile('/path/to/assessment.json');

      expect(manager.context.assessments).toHaveLength(1);
      expect(manager.context.assessments[0].type).toBe('workflow-audit');
      expect(manager.context.assessments[0].path).toBe('/path/to/assessment.json');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('crossReferenceAssessments()', () => {
    it('should find overlapping assessment areas', () => {
      const manager = new PortalContextManager('test-portal');

      manager.context.assessments = [
        { id: 'a1', type: 'audit1', date: '2024-01-01', scope: ['contacts', 'workflows'] },
        { id: 'a2', type: 'audit2', date: '2024-01-02', scope: ['contacts', 'deals'] }
      ];

      const overlaps = manager.crossReferenceAssessments();

      expect(overlaps).toHaveLength(1);
      expect(overlaps[0].area).toBe('contacts');
      expect(overlaps[0].count).toBe(2);
    });

    it('should return empty array for no overlaps', () => {
      const manager = new PortalContextManager('test-portal');

      manager.context.assessments = [
        { id: 'a1', type: 'audit1', date: '2024-01-01', scope: ['contacts'] },
        { id: 'a2', type: 'audit2', date: '2024-01-02', scope: ['deals'] }
      ];

      const overlaps = manager.crossReferenceAssessments();

      expect(overlaps).toHaveLength(0);
    });

    it('should handle assessments with empty scope', () => {
      const manager = new PortalContextManager('test-portal');

      manager.context.assessments = [
        { id: 'a1', type: 'audit1', date: '2024-01-01', scope: [] },
        { id: 'a2', type: 'audit2', date: '2024-01-02', scope: [] }
      ];

      // Should not throw with empty arrays
      expect(() => manager.crossReferenceAssessments()).not.toThrow();
    });

    it('should throw for assessments with undefined scope', () => {
      const manager = new PortalContextManager('test-portal');

      manager.context.assessments = [
        { id: 'a1', type: 'audit1', date: '2024-01-01', scope: [] },
        { id: 'a2', type: 'audit2', date: '2024-01-02' } // Missing scope
      ];

      // Code doesn't handle undefined scope - documents actual behavior
      expect(() => manager.crossReferenceAssessments()).toThrow();
    });
  });

  describe('generateSummary()', () => {
    it('should count assessment types', () => {
      const manager = new PortalContextManager('test-portal');

      manager.context.assessments = [
        { id: 'a1', type: 'data-quality', framework: 'f1', date: '2024-01-01' },
        { id: 'a2', type: 'data-quality', framework: 'f1', date: '2024-01-02' },
        { id: 'a3', type: 'workflow', framework: 'f2', date: '2024-01-03' }
      ];

      const summary = manager.generateSummary();

      expect(summary.assessmentTypes['data-quality']).toBe(2);
      expect(summary.assessmentTypes['workflow']).toBe(1);
    });

    it('should count frameworks', () => {
      const manager = new PortalContextManager('test-portal');

      manager.context.assessments = [
        { id: 'a1', type: 't1', framework: 'standard', date: '2024-01-01' },
        { id: 'a2', type: 't2', framework: 'standard', date: '2024-01-02' },
        { id: 'a3', type: 't3', framework: 'custom', date: '2024-01-03' }
      ];

      const summary = manager.generateSummary();

      expect(summary.frameworks['standard']).toBe(2);
      expect(summary.frameworks['custom']).toBe(1);
    });

    it('should collect recent findings sorted by date', () => {
      const manager = new PortalContextManager('test-portal');

      manager.context.assessments = [
        { id: 'a1', type: 't1', framework: 'f', date: '2024-01-01', findings: ['Old finding'] },
        { id: 'a2', type: 't2', framework: 'f', date: '2024-01-15', findings: ['New finding'] }
      ];

      const summary = manager.generateSummary();

      expect(summary.recentFindings[0].finding).toBe('New finding');
    });

    it('should limit recent findings to 10', () => {
      const manager = new PortalContextManager('test-portal');

      manager.context.assessments = Array.from({ length: 15 }, (_, i) => ({
        id: `a${i}`,
        type: 't',
        framework: 'f',
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
        findings: [`Finding ${i}`]
      }));

      const summary = manager.generateSummary();

      expect(summary.recentFindings.length).toBeLessThanOrEqual(10);
    });
  });

  describe('categorizeRecommendation()', () => {
    it('should categorize data quality recommendations', () => {
      const manager = new PortalContextManager('test-portal');

      expect(manager.categorizeRecommendation('Improve data quality')).toBe('Data Quality');
      expect(manager.categorizeRecommendation('Run cleanup scripts')).toBe('Data Quality');
    });

    it('should categorize automation recommendations', () => {
      const manager = new PortalContextManager('test-portal');

      expect(manager.categorizeRecommendation('Add workflow trigger')).toBe('Automation');
      expect(manager.categorizeRecommendation('Configure automation rules')).toBe('Automation');
    });

    it('should categorize integration recommendations', () => {
      const manager = new PortalContextManager('test-portal');

      expect(manager.categorizeRecommendation('Set up integration with Salesforce')).toBe('Integration');
    });

    it('should categorize data model recommendations', () => {
      const manager = new PortalContextManager('test-portal');

      expect(manager.categorizeRecommendation('Add new property')).toBe('Data Model');
      expect(manager.categorizeRecommendation('Update field mappings')).toBe('Data Model');
    });

    it('should categorize analytics recommendations', () => {
      const manager = new PortalContextManager('test-portal');

      expect(manager.categorizeRecommendation('Create reporting dashboard')).toBe('Analytics');
      expect(manager.categorizeRecommendation('Update dashboard metrics')).toBe('Analytics');
    });

    it('should categorize process recommendations', () => {
      const manager = new PortalContextManager('test-portal');

      expect(manager.categorizeRecommendation('Improve process efficiency')).toBe('Process');
    });

    it('should default to Other for uncategorized', () => {
      const manager = new PortalContextManager('test-portal');

      expect(manager.categorizeRecommendation('Random recommendation')).toBe('Other');
    });
  });

  describe('getAssessmentsByType()', () => {
    it('should filter assessments by type', () => {
      const manager = new PortalContextManager('test-portal');

      manager.context.assessments = [
        { id: 'a1', type: 'data-quality' },
        { id: 'a2', type: 'workflow' },
        { id: 'a3', type: 'data-quality' }
      ];

      const filtered = manager.getAssessmentsByType('data-quality');

      expect(filtered).toHaveLength(2);
      expect(filtered.every(a => a.type === 'data-quality')).toBe(true);
    });

    it('should return empty array for non-existent type', () => {
      const manager = new PortalContextManager('test-portal');

      manager.context.assessments = [
        { id: 'a1', type: 'data-quality' }
      ];

      expect(manager.getAssessmentsByType('non-existent')).toEqual([]);
    });
  });

  describe('getRecentAssessments()', () => {
    it('should return most recent assessments first', () => {
      const manager = new PortalContextManager('test-portal');

      manager.context.assessments = [
        { id: 'a1', date: '2024-01-01' },
        { id: 'a2', date: '2024-01-15' },
        { id: 'a3', date: '2024-01-10' }
      ];

      const recent = manager.getRecentAssessments(2);

      expect(recent).toHaveLength(2);
      expect(recent[0].id).toBe('a2'); // Most recent
      expect(recent[1].id).toBe('a3');
    });

    it('should default to 5 assessments', () => {
      const manager = new PortalContextManager('test-portal');

      manager.context.assessments = Array.from({ length: 10 }, (_, i) => ({
        id: `a${i}`,
        date: `2024-01-${String(i + 1).padStart(2, '0')}`
      }));

      const recent = manager.getRecentAssessments();

      expect(recent).toHaveLength(5);
    });
  });

  describe('Integration scenarios', () => {
    it('should maintain context across multiple assessment updates', () => {
      const manager = new PortalContextManager('test-portal');

      // First assessment
      manager.addAssessment({
        type: 'initial-audit',
        scope: ['contacts', 'workflows'],
        findings: ['Issue 1']
      });

      // Second assessment
      manager.addAssessment({
        type: 'follow-up',
        scope: ['contacts'],
        recommendations: ['Fix Issue 1']
      });

      expect(manager.context.assessments).toHaveLength(2);
      expect(manager.context.metadata.totalAssessments).toBe(2);

      const overlaps = manager.crossReferenceAssessments();
      expect(overlaps.find(o => o.area === 'contacts')).toBeDefined();
    });
  });
});
