/**
 * Test Suite: Salesforce-Aware Master Selector
 *
 * Tests the master company selection algorithm that prioritizes:
 * 1. Most recent successful Salesforce sync (PRIMARY)
 * 2. Association richness (contacts, deals, tickets)
 * 3. Data completeness
 * 4. Activity recency
 * 5. Creation date (oldest as tiebreaker)
 *
 * CRITICAL: This prevents selecting a company with broken SF sync as master
 * which would cause sync issues post-merge.
 *
 * Coverage Target: >90%
 * Priority: Tier 1 (HIGH - SF sync blocking rules)
 */

const {
  selectMaster,
  validateMasterSelection,
  getSalesforceSyncScore,
  getAssociationScore,
  getDataCompletenessScore,
  getActivityRecencyScore,
  getCreationDateScore
} = require('../scripts/lib/salesforce-aware-master-selector');

describe('SalesforceAwareMasterSelector', () => {
  describe('getSalesforceSyncScore()', () => {
    it('should return 0 for company without Salesforce ID', () => {
      const company = { properties: {} };
      expect(getSalesforceSyncScore(company)).toBe(0);
    });

    it('should return 0 for empty Salesforce ID', () => {
      const company = { properties: { hs_salesforce_object_id: '' } };
      expect(getSalesforceSyncScore(company)).toBe(0);
    });

    it('should return 0 for whitespace-only Salesforce ID', () => {
      const company = { properties: { hs_salesforce_object_id: '   ' } };
      expect(getSalesforceSyncScore(company)).toBe(0);
    });

    it('should return 1 for sync error status', () => {
      const company = {
        properties: {
          hs_salesforce_object_id: 'SF123',
          hs_salesforce_sync_status: 'error'
        }
      };
      expect(getSalesforceSyncScore(company)).toBe(1);
    });

    it('should return 1 for sync failed status', () => {
      const company = {
        properties: {
          hs_salesforce_object_id: 'SF123',
          hs_salesforce_sync_status: 'failed'
        }
      };
      expect(getSalesforceSyncScore(company)).toBe(1);
    });

    it('should return 50 for SF ID with no sync timestamp', () => {
      const company = {
        properties: {
          hs_salesforce_object_id: 'SF123'
        }
      };
      expect(getSalesforceSyncScore(company)).toBe(50);
    });

    it('should return high score for recent sync', () => {
      const company = {
        properties: {
          hs_salesforce_object_id: 'SF123',
          hs_salesforce_last_sync: new Date().toISOString()
        }
      };
      const score = getSalesforceSyncScore(company);
      expect(score).toBeGreaterThanOrEqual(99);
    });

    it('should return lower score for older sync', () => {
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

      const company = {
        properties: {
          hs_salesforce_object_id: 'SF123',
          hs_salesforce_last_sync: tenDaysAgo.toISOString()
        }
      };
      const score = getSalesforceSyncScore(company);
      expect(score).toBeLessThan(95);
      expect(score).toBeGreaterThanOrEqual(50);
    });

    it('should have minimum score of 50 for any successful sync', () => {
      const veryOld = new Date();
      veryOld.setFullYear(veryOld.getFullYear() - 1);

      const company = {
        properties: {
          hs_salesforce_object_id: 'SF123',
          hs_salesforce_last_sync: veryOld.toISOString()
        }
      };
      expect(getSalesforceSyncScore(company)).toBeGreaterThanOrEqual(50);
    });
  });

  describe('getAssociationScore()', () => {
    it('should return 0 for company with no associations', () => {
      const company = { properties: {} };
      expect(getAssociationScore(company)).toBe(0);
    });

    it('should weight contacts at 1x', () => {
      const company = {
        properties: {
          num_associated_contacts: '10',
          num_associated_deals: '0'
        }
      };
      const score = getAssociationScore(company);
      expect(score).toBe(5); // 10/200 * 100 = 5
    });

    it('should weight deals at 5x', () => {
      const company = {
        properties: {
          num_associated_contacts: '0',
          num_associated_deals: '10'
        }
      };
      const score = getAssociationScore(company);
      expect(score).toBe(25); // (10*5)/200 * 100 = 25
    });

    it('should combine weighted scores', () => {
      const company = {
        properties: {
          num_associated_contacts: '10',
          num_associated_deals: '10',
          num_notes: '20'
        }
      };
      const score = getAssociationScore(company);
      // (10 + 50 + 10) / 200 * 100 = 35
      expect(score).toBe(35);
    });

    it('should cap score at 100', () => {
      const company = {
        properties: {
          num_associated_contacts: '1000',
          num_associated_deals: '1000'
        }
      };
      expect(getAssociationScore(company)).toBe(100);
    });
  });

  describe('getDataCompletenessScore()', () => {
    it('should return 0 for company with no populated fields', () => {
      const company = { properties: {} };
      expect(getDataCompletenessScore(company)).toBe(0);
    });

    it('should score based on populated important fields', () => {
      const company = {
        properties: {
          phone: '555-1234',
          city: 'San Francisco',
          state: 'CA',
          country: 'USA',
          industry: 'Technology',
          domain: 'example.com'
        }
      };
      const score = getDataCompletenessScore(company);
      expect(score).toBe(50); // 6 out of 12 fields = 50%
    });

    it('should return 100 for fully populated company', () => {
      const company = {
        properties: {
          phone: '555-1234',
          city: 'San Francisco',
          state: 'CA',
          zip: '94102',
          country: 'USA',
          industry: 'Technology',
          numberofemployees: '100',
          annualrevenue: '1000000',
          description: 'A tech company',
          linkedin_company_page: 'https://linkedin.com/company/example',
          domain: 'example.com',
          website: 'https://example.com'
        }
      };
      expect(getDataCompletenessScore(company)).toBe(100);
    });

    it('should ignore empty strings', () => {
      const company = {
        properties: {
          phone: '',
          city: 'San Francisco'
        }
      };
      const score = getDataCompletenessScore(company);
      expect(score).toBeLessThan(20); // Only 1 field populated
    });

    it('should ignore whitespace-only values', () => {
      const company = {
        properties: {
          phone: '   ',
          city: 'San Francisco'
        }
      };
      const score = getDataCompletenessScore(company);
      expect(score).toBeLessThan(20);
    });
  });

  describe('getActivityRecencyScore()', () => {
    it('should return 0 for company with no activity dates', () => {
      const company = { properties: {} };
      expect(getActivityRecencyScore(company)).toBe(0);
    });

    it('should return high score for recent activity', () => {
      const company = {
        properties: {
          hs_lastmodifieddate: new Date().toISOString()
        }
      };
      const score = getActivityRecencyScore(company);
      expect(score).toBeGreaterThan(90);
    });

    it('should return lower score for older activity', () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const company = {
        properties: {
          hs_lastmodifieddate: thirtyDaysAgo.toISOString()
        }
      };
      const score = getActivityRecencyScore(company);
      expect(score).toBeLessThan(80);
    });

    it('should prefer notes_last_updated over hs_lastmodifieddate', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const company = {
        properties: {
          notes_last_updated: new Date().toISOString(),
          hs_lastmodifieddate: yesterday.toISOString()
        }
      };
      const score = getActivityRecencyScore(company);
      expect(score).toBeGreaterThan(95);
    });
  });

  describe('getCreationDateScore()', () => {
    it('should return 50 for single company', () => {
      const company = { properties: { createdate: '2024-01-01' } };
      const allCompanies = [company];

      expect(getCreationDateScore(company, allCompanies)).toBe(50);
    });

    it('should return 100 for oldest company', () => {
      const oldest = { properties: { createdate: '2020-01-01' } };
      const newest = { properties: { createdate: '2024-01-01' } };
      const allCompanies = [oldest, newest];

      expect(getCreationDateScore(oldest, allCompanies)).toBe(100);
    });

    it('should return 0 for newest company', () => {
      const oldest = { properties: { createdate: '2020-01-01' } };
      const newest = { properties: { createdate: '2024-01-01' } };
      const allCompanies = [oldest, newest];

      expect(getCreationDateScore(newest, allCompanies)).toBe(0);
    });

    it('should handle missing createdate', () => {
      const company = { properties: {} };
      const allCompanies = [company];

      // Should not throw
      expect(() => getCreationDateScore(company, allCompanies)).not.toThrow();
    });
  });

  describe('selectMaster()', () => {
    it('should throw for empty companies array', () => {
      expect(() => selectMaster({ companies: [] })).toThrow('No companies in duplicate group');
    });

    it('should throw for null companies', () => {
      expect(() => selectMaster({ companies: null })).toThrow();
    });

    it('should return single company as master', () => {
      const company = { id: 'c1', properties: { name: 'Solo Company' } };
      const result = selectMaster({ companies: [company] });

      expect(result.master).toBe(company);
      expect(result.reasoning).toBe('Only one company in group');
    });

    it('should prioritize company with Salesforce sync', () => {
      const withSync = {
        id: 'c1',
        properties: {
          name: 'With Sync',
          hs_salesforce_object_id: 'SF123',
          hs_salesforce_last_sync: new Date().toISOString()
        }
      };
      const withoutSync = {
        id: 'c2',
        properties: {
          name: 'Without Sync',
          num_associated_contacts: '100',
          num_associated_deals: '50'
        }
      };

      const result = selectMaster({ companies: [withSync, withoutSync] });

      expect(result.master.id).toBe('c1');
    });

    it('should include scores in result', () => {
      const company1 = { id: 'c1', properties: { name: 'Company 1' } };
      const company2 = { id: 'c2', properties: { name: 'Company 2' } };

      const result = selectMaster({ companies: [company1, company2] });

      expect(result.scores).toBeDefined();
      expect(result.scores).toHaveProperty('salesforceSync');
      expect(result.scores).toHaveProperty('associations');
      expect(result.scores).toHaveProperty('dataCompleteness');
    });

    it('should include alternatives in result', () => {
      const company1 = { id: 'c1', properties: { name: 'Company 1' } };
      const company2 = { id: 'c2', properties: { name: 'Company 2' } };
      const company3 = { id: 'c3', properties: { name: 'Company 3' } };

      const result = selectMaster({ companies: [company1, company2, company3] });

      expect(result.alternatives).toHaveLength(2);
      expect(result.alternatives[0]).toHaveProperty('companyId');
      expect(result.alternatives[0]).toHaveProperty('totalScore');
    });

    it('should break ties with creation date', () => {
      const older = {
        id: 'c1',
        properties: {
          name: 'Older Company',
          createdate: '2020-01-01'
        }
      };
      const newer = {
        id: 'c2',
        properties: {
          name: 'Newer Company',
          createdate: '2024-01-01'
        }
      };

      const result = selectMaster({ companies: [older, newer] });

      // Older should win as tiebreaker
      expect(result.master.id).toBe('c1');
    });
  });

  describe('validateMasterSelection()', () => {
    it('should pass for valid master', () => {
      const masterResult = {
        master: {
          id: 'c1',
          properties: {
            name: 'Valid Company',
            domain: 'example.com'
          }
        }
      };

      const duplicateGroup = {
        companies: [masterResult.master]
      };

      const result = validateMasterSelection(masterResult, duplicateGroup);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('should warn about Salesforce sync errors', () => {
      const masterResult = {
        master: {
          id: 'c1',
          properties: {
            name: 'Company',
            domain: 'example.com',
            hs_salesforce_sync_status: 'error'
          }
        }
      };

      const duplicateGroup = {
        companies: [masterResult.master]
      };

      const result = validateMasterSelection(masterResult, duplicateGroup);

      expect(result.valid).toBe(false);
      expect(result.warnings).toContain('Selected master has Salesforce sync errors');
    });

    it('should warn about missing critical fields', () => {
      const masterResult = {
        master: {
          id: 'c1',
          properties: {}
        }
      };

      const duplicateGroup = {
        companies: [masterResult.master]
      };

      const result = validateMasterSelection(masterResult, duplicateGroup);

      expect(result.valid).toBe(false);
      expect(result.warnings.some(w => w.includes('missing critical fields'))).toBe(true);
    });

    it('should warn when duplicate has significantly more associations', () => {
      const masterResult = {
        master: {
          id: 'c1',
          properties: {
            name: 'Master',
            domain: 'example.com',
            num_associated_contacts: '5',
            num_associated_deals: '2'
          }
        }
      };

      const duplicateWithMore = {
        id: 'c2',
        properties: {
          name: 'Duplicate',
          num_associated_contacts: '50',
          num_associated_deals: '20'
        }
      };

      const duplicateGroup = {
        companies: [masterResult.master, duplicateWithMore]
      };

      const result = validateMasterSelection(masterResult, duplicateGroup);

      expect(result.warnings.some(w => w.includes('significantly more associations'))).toBe(true);
    });
  });

  describe('Integration scenarios', () => {
    it('should select master based on weighted scoring', () => {
      const companies = [
        {
          id: 'c1',
          properties: {
            name: 'Company A',
            hs_salesforce_object_id: 'SF1',
            hs_salesforce_last_sync: new Date().toISOString(),
            num_associated_contacts: '5',
            num_associated_deals: '1',
            createdate: '2023-01-01'
          }
        },
        {
          id: 'c2',
          properties: {
            name: 'Company B',
            num_associated_contacts: '100',
            num_associated_deals: '50',
            phone: '555-1234',
            city: 'SF',
            state: 'CA',
            country: 'USA',
            industry: 'Tech',
            domain: 'example.com',
            createdate: '2020-01-01'
          }
        }
      ];

      const result = selectMaster({ companies });

      // Company A should win due to SF sync (50% weight)
      expect(result.master.id).toBe('c1');
      expect(result.totalScore).toBeDefined();
    });

    it('should prefer associations when no SF sync exists', () => {
      const companies = [
        {
          id: 'c1',
          properties: {
            name: 'Few Associations',
            num_associated_contacts: '1',
            num_associated_deals: '0'
          }
        },
        {
          id: 'c2',
          properties: {
            name: 'Many Associations',
            num_associated_contacts: '50',
            num_associated_deals: '20'
          }
        }
      ];

      const result = selectMaster({ companies });

      // Company B should win due to associations (25% weight)
      expect(result.master.id).toBe('c2');
    });
  });
});
