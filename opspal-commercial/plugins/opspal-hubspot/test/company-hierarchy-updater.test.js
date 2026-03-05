/**
 * Test Suite: Company Hierarchy Updater
 *
 * Tests the company hierarchy maintenance during merge operations.
 * Re-parents child companies when duplicate is a parent company.
 *
 * CRITICAL: Companies can have parent-child relationships.
 * If we archive a parent company, child companies become orphaned.
 *
 * Coverage Target: >90%
 * Priority: Tier 1 (HIGH - Parent-child relationships)
 */

const {
  updateChildCompanies,
  validateNoOrphanedChildren,
  findChildCompanies,
  updateParentCompany,
  detectHierarchyLoop
} = require('../scripts/lib/company-hierarchy-updater');

describe('CompanyHierarchyUpdater', () => {
  let mockHubspotClient;

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    mockHubspotClient = {
      crm: {
        companies: {
          searchApi: {
            doSearch: jest.fn()
          },
          basicApi: {
            update: jest.fn(),
            getById: jest.fn()
          }
        }
      }
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('findChildCompanies()', () => {
    it('should find child companies by parent ID', async () => {
      mockHubspotClient.crm.companies.searchApi.doSearch.mockResolvedValue({
        results: [
          { id: 'child-1', properties: { name: 'Child Company 1' } },
          { id: 'child-2', properties: { name: 'Child Company 2' } }
        ]
      });

      const children = await findChildCompanies(mockHubspotClient, 'parent-123');

      expect(mockHubspotClient.crm.companies.searchApi.doSearch).toHaveBeenCalledWith({
        filterGroups: [{
          filters: [{
            propertyName: 'hs_parent_company_id',
            operator: 'EQ',
            value: 'parent-123'
          }]
        }],
        properties: expect.arrayContaining(['name', 'domain', 'hs_parent_company_id']),
        limit: 100
      });

      expect(children).toHaveLength(2);
      expect(children[0].id).toBe('child-1');
    });

    it('should return empty array when no children found', async () => {
      mockHubspotClient.crm.companies.searchApi.doSearch.mockResolvedValue({
        results: []
      });

      const children = await findChildCompanies(mockHubspotClient, 'parent-123');

      expect(children).toEqual([]);
    });

    it('should return empty array on 404 error', async () => {
      const error = new Error('Not found');
      error.code = 404;
      mockHubspotClient.crm.companies.searchApi.doSearch.mockRejectedValue(error);

      const children = await findChildCompanies(mockHubspotClient, 'parent-123');

      expect(children).toEqual([]);
    });

    it('should return empty array on 404 statusCode', async () => {
      const error = new Error('Not found');
      error.statusCode = 404;
      mockHubspotClient.crm.companies.searchApi.doSearch.mockRejectedValue(error);

      const children = await findChildCompanies(mockHubspotClient, 'parent-123');

      expect(children).toEqual([]);
    });

    it('should throw on other errors', async () => {
      const error = new Error('API error');
      error.code = 500;
      mockHubspotClient.crm.companies.searchApi.doSearch.mockRejectedValue(error);

      await expect(findChildCompanies(mockHubspotClient, 'parent-123'))
        .rejects.toThrow('API error');
    });

    it('should handle null results', async () => {
      mockHubspotClient.crm.companies.searchApi.doSearch.mockResolvedValue({});

      const children = await findChildCompanies(mockHubspotClient, 'parent-123');

      expect(children).toEqual([]);
    });
  });

  describe('updateParentCompany()', () => {
    it('should update parent company ID', async () => {
      mockHubspotClient.crm.companies.basicApi.update.mockResolvedValue({});

      const result = await updateParentCompany(mockHubspotClient, 'child-1', 'new-parent-123');

      expect(mockHubspotClient.crm.companies.basicApi.update).toHaveBeenCalledWith(
        'child-1',
        { properties: { hs_parent_company_id: 'new-parent-123' } }
      );

      expect(result.success).toBe(true);
      expect(result.childCompanyId).toBe('child-1');
      expect(result.newParentCompanyId).toBe('new-parent-123');
    });

    it('should skip API call in dry-run mode', async () => {
      const result = await updateParentCompany(mockHubspotClient, 'child-1', 'new-parent', true);

      expect(mockHubspotClient.crm.companies.basicApi.update).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
    });

    it('should handle API errors gracefully', async () => {
      mockHubspotClient.crm.companies.basicApi.update.mockRejectedValue(
        new Error('Update failed')
      );

      const result = await updateParentCompany(mockHubspotClient, 'child-1', 'new-parent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Update failed');
    });

    it('should convert parent ID to string', async () => {
      mockHubspotClient.crm.companies.basicApi.update.mockResolvedValue({});

      await updateParentCompany(mockHubspotClient, 'child-1', 12345);

      expect(mockHubspotClient.crm.companies.basicApi.update).toHaveBeenCalledWith(
        'child-1',
        { properties: { hs_parent_company_id: '12345' } }
      );
    });
  });

  describe('updateChildCompanies()', () => {
    const master = {
      id: 'master-1',
      properties: { name: 'Master Company' }
    };

    it('should return success with no updates when duplicates have no children', async () => {
      const duplicates = [{
        id: 'dup-1',
        properties: { name: 'Duplicate 1', hs_num_child_companies: '0' }
      }];

      const result = await updateChildCompanies(mockHubspotClient, master, duplicates);

      expect(result.status).toBe('success');
      expect(result.totalUpdates).toBe(0);
      expect(result.message).toBe('No child companies to update');
    });

    it('should find and re-parent child companies', async () => {
      const duplicates = [{
        id: 'dup-1',
        properties: { name: 'Duplicate 1', hs_num_child_companies: '2' }
      }];

      mockHubspotClient.crm.companies.searchApi.doSearch.mockResolvedValue({
        results: [
          { id: 'child-1', properties: { name: 'Child 1' } },
          { id: 'child-2', properties: { name: 'Child 2' } }
        ]
      });

      mockHubspotClient.crm.companies.basicApi.update.mockResolvedValue({});

      const result = await updateChildCompanies(mockHubspotClient, master, duplicates);

      expect(result.status).toBe('success');
      expect(result.totalUpdates).toBe(2);
      expect(result.successfulUpdates).toBe(2);
    });

    it('should return dry_run status in dry-run mode', async () => {
      const duplicates = [{
        id: 'dup-1',
        properties: { name: 'Duplicate 1', hs_num_child_companies: '1' }
      }];

      mockHubspotClient.crm.companies.searchApi.doSearch.mockResolvedValue({
        results: [{ id: 'child-1', properties: { name: 'Child 1' } }]
      });

      const result = await updateChildCompanies(mockHubspotClient, master, duplicates, { dryRun: true });

      expect(result.status).toBe('dry_run');
      expect(result.dryRun).toBe(true);
      expect(result.plannedUpdates).toHaveLength(1);
      expect(mockHubspotClient.crm.companies.basicApi.update).not.toHaveBeenCalled();
    });

    it('should handle partial failures', async () => {
      const duplicates = [{
        id: 'dup-1',
        properties: { name: 'Duplicate 1', hs_num_child_companies: '2' }
      }];

      mockHubspotClient.crm.companies.searchApi.doSearch.mockResolvedValue({
        results: [
          { id: 'child-1', properties: { name: 'Child 1' } },
          { id: 'child-2', properties: { name: 'Child 2' } }
        ]
      });

      mockHubspotClient.crm.companies.basicApi.update
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('Update failed'));

      const result = await updateChildCompanies(mockHubspotClient, master, duplicates);

      expect(result.status).toBe('partial_success');
      expect(result.successfulUpdates).toBe(1);
      expect(result.failedUpdates).toBe(1);
    });

    it('should handle missing hs_num_child_companies property', async () => {
      const duplicates = [{
        id: 'dup-1',
        properties: { name: 'Duplicate 1' } // No hs_num_child_companies
      }];

      const result = await updateChildCompanies(mockHubspotClient, master, duplicates);

      expect(result.totalUpdates).toBe(0);
    });

    it('should handle search returning no results despite count', async () => {
      const duplicates = [{
        id: 'dup-1',
        properties: { name: 'Duplicate 1', hs_num_child_companies: '5' }
      }];

      mockHubspotClient.crm.companies.searchApi.doSearch.mockResolvedValue({
        results: []
      });

      const result = await updateChildCompanies(mockHubspotClient, master, duplicates);

      expect(result.totalUpdates).toBe(0);
    });
  });

  describe('validateNoOrphanedChildren()', () => {
    it('should pass when no children point to duplicates', async () => {
      const duplicates = [{ id: 'dup-1' }];

      mockHubspotClient.crm.companies.searchApi.doSearch.mockResolvedValue({
        results: []
      });

      const result = await validateNoOrphanedChildren(mockHubspotClient, duplicates);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail when children still point to duplicates', async () => {
      const duplicates = [{ id: 'dup-1' }];

      mockHubspotClient.crm.companies.searchApi.doSearch.mockResolvedValue({
        results: [
          { id: 'orphan-1', properties: { name: 'Orphan 1' } }
        ]
      });

      const result = await validateNoOrphanedChildren(mockHubspotClient, duplicates);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('1 child companies still point to archived parent');
    });

    it('should check all duplicates', async () => {
      const duplicates = [
        { id: 'dup-1' },
        { id: 'dup-2' }
      ];

      mockHubspotClient.crm.companies.searchApi.doSearch.mockResolvedValue({
        results: []
      });

      await validateNoOrphanedChildren(mockHubspotClient, duplicates);

      expect(mockHubspotClient.crm.companies.searchApi.doSearch).toHaveBeenCalledTimes(2);
    });
  });

  describe('detectHierarchyLoop()', () => {
    it('should detect loop when setting parent that is a child', async () => {
      // Company A wants to set Company B as parent
      // But Company B has Company A as its parent = loop

      mockHubspotClient.crm.companies.basicApi.getById
        .mockResolvedValueOnce({
          properties: { hs_parent_company_id: 'company-a' }
        });

      const hasLoop = await detectHierarchyLoop(mockHubspotClient, 'company-a', 'company-b');

      expect(hasLoop).toBe(true);
    });

    it('should not detect loop for valid hierarchy', async () => {
      mockHubspotClient.crm.companies.basicApi.getById
        .mockResolvedValueOnce({
          properties: { hs_parent_company_id: 'grandparent-1' }
        })
        .mockResolvedValueOnce({
          properties: { hs_parent_company_id: null }
        });

      const hasLoop = await detectHierarchyLoop(mockHubspotClient, 'company-a', 'company-b');

      expect(hasLoop).toBe(false);
    });

    it('should handle max depth limit', async () => {
      // Create a chain longer than max depth
      mockHubspotClient.crm.companies.basicApi.getById
        .mockResolvedValue({
          properties: { hs_parent_company_id: 'next-parent' }
        });

      const hasLoop = await detectHierarchyLoop(mockHubspotClient, 'company-a', 'company-b', 5);

      // Should return false because it hit max depth before finding loop
      expect(hasLoop).toBe(false);
      expect(mockHubspotClient.crm.companies.basicApi.getById).toHaveBeenCalledTimes(5);
    });

    it('should handle API errors gracefully', async () => {
      mockHubspotClient.crm.companies.basicApi.getById
        .mockRejectedValue(new Error('Not found'));

      const hasLoop = await detectHierarchyLoop(mockHubspotClient, 'company-a', 'company-b');

      expect(hasLoop).toBe(false);
    });

    it('should handle null parent ID', async () => {
      mockHubspotClient.crm.companies.basicApi.getById
        .mockResolvedValue({
          properties: { hs_parent_company_id: null }
        });

      const hasLoop = await detectHierarchyLoop(mockHubspotClient, 'company-a', 'company-b');

      expect(hasLoop).toBe(false);
    });

    it('should compare IDs as strings', async () => {
      mockHubspotClient.crm.companies.basicApi.getById
        .mockResolvedValueOnce({
          properties: { hs_parent_company_id: '123' } // String
        });

      const hasLoop = await detectHierarchyLoop(mockHubspotClient, 123, 'company-b'); // Number

      expect(hasLoop).toBe(true);
    });
  });

  describe('Integration scenarios', () => {
    it('should re-parent multiple children from multiple duplicates', async () => {
      const master = {
        id: 'master-1',
        properties: { name: 'Master Corp' }
      };

      const duplicates = [
        { id: 'dup-1', properties: { name: 'Dup 1', hs_num_child_companies: '1' } },
        { id: 'dup-2', properties: { name: 'Dup 2', hs_num_child_companies: '2' } }
      ];

      mockHubspotClient.crm.companies.searchApi.doSearch
        .mockResolvedValueOnce({
          results: [{ id: 'child-1', properties: { name: 'Child from Dup 1' } }]
        })
        .mockResolvedValueOnce({
          results: [
            { id: 'child-2', properties: { name: 'Child from Dup 2' } },
            { id: 'child-3', properties: { name: 'Child from Dup 2 - 2' } }
          ]
        });

      mockHubspotClient.crm.companies.basicApi.update.mockResolvedValue({});

      const result = await updateChildCompanies(mockHubspotClient, master, duplicates);

      expect(result.totalUpdates).toBe(3);
      expect(result.successfulUpdates).toBe(3);
    });
  });
});
