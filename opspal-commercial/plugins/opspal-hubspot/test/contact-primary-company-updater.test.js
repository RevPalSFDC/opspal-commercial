/**
 * Test Suite: Contact Primary Company Updater
 *
 * Tests the contact primary company management during merge operations.
 * Updates contacts where duplicate company is the primary company.
 *
 * CRITICAL: In HubSpot, contacts have a "primary company" stored in
 * the 'associatedcompanyid' property. If we archive a company that's
 * a contact's primary, we must update that reference.
 *
 * Coverage Target: >90%
 * Priority: Tier 1 (HIGH - Contact-company relationship integrity)
 */

const {
  updatePrimaryCompanyForContacts,
  validateNoPrimaryCompanyOrphans,
  findContactsWithPrimaryCompany,
  updateContactPrimaryCompany
} = require('../scripts/lib/contact-primary-company-updater');

describe('ContactPrimaryCompanyUpdater', () => {
  let mockHubspotClient;

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    mockHubspotClient = {
      crm: {
        contacts: {
          searchApi: {
            doSearch: jest.fn()
          },
          basicApi: {
            update: jest.fn()
          }
        }
      }
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('findContactsWithPrimaryCompany()', () => {
    it('should find contacts by associatedcompanyid', async () => {
      mockHubspotClient.crm.contacts.searchApi.doSearch.mockResolvedValue({
        results: [
          { id: 'contact-1', properties: { email: 'test1@example.com', firstname: 'Test', lastname: 'One' } },
          { id: 'contact-2', properties: { email: 'test2@example.com', firstname: 'Test', lastname: 'Two' } }
        ]
      });

      const contacts = await findContactsWithPrimaryCompany(mockHubspotClient, 'company-123');

      expect(mockHubspotClient.crm.contacts.searchApi.doSearch).toHaveBeenCalledWith({
        filterGroups: [{
          filters: [{
            propertyName: 'associatedcompanyid',
            operator: 'EQ',
            value: 'company-123'
          }]
        }],
        properties: expect.arrayContaining(['email', 'firstname', 'lastname', 'associatedcompanyid']),
        limit: 100
      });

      expect(contacts).toHaveLength(2);
      expect(contacts[0].id).toBe('contact-1');
    });

    it('should convert company ID to string', async () => {
      mockHubspotClient.crm.contacts.searchApi.doSearch.mockResolvedValue({ results: [] });

      await findContactsWithPrimaryCompany(mockHubspotClient, 12345);

      expect(mockHubspotClient.crm.contacts.searchApi.doSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          filterGroups: [{
            filters: [{
              propertyName: 'associatedcompanyid',
              operator: 'EQ',
              value: '12345'
            }]
          }]
        })
      );
    });

    it('should return empty array when no contacts found', async () => {
      mockHubspotClient.crm.contacts.searchApi.doSearch.mockResolvedValue({
        results: []
      });

      const contacts = await findContactsWithPrimaryCompany(mockHubspotClient, 'company-123');

      expect(contacts).toEqual([]);
    });

    it('should return empty array on 404 error code', async () => {
      const error = new Error('Not found');
      error.code = 404;
      mockHubspotClient.crm.contacts.searchApi.doSearch.mockRejectedValue(error);

      const contacts = await findContactsWithPrimaryCompany(mockHubspotClient, 'company-123');

      expect(contacts).toEqual([]);
    });

    it('should return empty array on 404 statusCode', async () => {
      const error = new Error('Not found');
      error.statusCode = 404;
      mockHubspotClient.crm.contacts.searchApi.doSearch.mockRejectedValue(error);

      const contacts = await findContactsWithPrimaryCompany(mockHubspotClient, 'company-123');

      expect(contacts).toEqual([]);
    });

    it('should throw on non-404 errors', async () => {
      const error = new Error('API error');
      error.code = 500;
      mockHubspotClient.crm.contacts.searchApi.doSearch.mockRejectedValue(error);

      await expect(findContactsWithPrimaryCompany(mockHubspotClient, 'company-123'))
        .rejects.toThrow('API error');
    });
  });

  describe('updateContactPrimaryCompany()', () => {
    it('should update contact associatedcompanyid', async () => {
      mockHubspotClient.crm.contacts.basicApi.update.mockResolvedValue({});

      const result = await updateContactPrimaryCompany(mockHubspotClient, 'contact-1', 'new-company-123');

      expect(mockHubspotClient.crm.contacts.basicApi.update).toHaveBeenCalledWith(
        'contact-1',
        { properties: { associatedcompanyid: 'new-company-123' } }
      );

      expect(result.success).toBe(true);
      expect(result.contactId).toBe('contact-1');
      expect(result.newPrimaryCompanyId).toBe('new-company-123');
    });

    it('should convert company ID to string', async () => {
      mockHubspotClient.crm.contacts.basicApi.update.mockResolvedValue({});

      await updateContactPrimaryCompany(mockHubspotClient, 'contact-1', 12345);

      expect(mockHubspotClient.crm.contacts.basicApi.update).toHaveBeenCalledWith(
        'contact-1',
        { properties: { associatedcompanyid: '12345' } }
      );
    });

    it('should skip API call in dry-run mode', async () => {
      const result = await updateContactPrimaryCompany(mockHubspotClient, 'contact-1', 'new-company', true);

      expect(mockHubspotClient.crm.contacts.basicApi.update).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.contactId).toBe('contact-1');
    });

    it('should handle API errors gracefully', async () => {
      mockHubspotClient.crm.contacts.basicApi.update.mockRejectedValue(
        new Error('Update failed')
      );

      const result = await updateContactPrimaryCompany(mockHubspotClient, 'contact-1', 'new-company');

      expect(result.success).toBe(false);
      expect(result.contactId).toBe('contact-1');
      expect(result.error).toBe('Update failed');
    });
  });

  describe('updatePrimaryCompanyForContacts()', () => {
    const master = {
      id: 'master-1',
      properties: { name: 'Master Company' }
    };

    it('should return success with no updates when duplicates have no contacts', async () => {
      const duplicates = [{
        id: 'dup-1',
        properties: { name: 'Duplicate 1' }
      }];

      mockHubspotClient.crm.contacts.searchApi.doSearch.mockResolvedValue({
        results: []
      });

      const result = await updatePrimaryCompanyForContacts(mockHubspotClient, master, duplicates);

      expect(result.status).toBe('success');
      expect(result.totalUpdates).toBe(0);
      expect(result.message).toBe('No contacts with duplicates as primary company');
    });

    it('should find and update contacts with duplicate as primary', async () => {
      const duplicates = [{
        id: 'dup-1',
        properties: { name: 'Duplicate 1' }
      }];

      mockHubspotClient.crm.contacts.searchApi.doSearch.mockResolvedValue({
        results: [
          { id: 'contact-1', properties: { email: 'test1@example.com', firstname: 'Test', lastname: 'One' } },
          { id: 'contact-2', properties: { email: 'test2@example.com', firstname: 'Test', lastname: 'Two' } }
        ]
      });

      mockHubspotClient.crm.contacts.basicApi.update.mockResolvedValue({});

      const result = await updatePrimaryCompanyForContacts(mockHubspotClient, master, duplicates);

      expect(result.status).toBe('success');
      expect(result.totalUpdates).toBe(2);
      expect(result.successfulUpdates).toBe(2);
    });

    it('should return dry_run status in dry-run mode', async () => {
      const duplicates = [{
        id: 'dup-1',
        properties: { name: 'Duplicate 1' }
      }];

      mockHubspotClient.crm.contacts.searchApi.doSearch.mockResolvedValue({
        results: [{ id: 'contact-1', properties: { email: 'test@example.com' } }]
      });

      const result = await updatePrimaryCompanyForContacts(mockHubspotClient, master, duplicates, { dryRun: true });

      expect(result.status).toBe('dry_run');
      expect(result.dryRun).toBe(true);
      expect(result.plannedUpdates).toHaveLength(1);
      expect(mockHubspotClient.crm.contacts.basicApi.update).not.toHaveBeenCalled();
    });

    it('should handle partial failures', async () => {
      const duplicates = [{
        id: 'dup-1',
        properties: { name: 'Duplicate 1' }
      }];

      mockHubspotClient.crm.contacts.searchApi.doSearch.mockResolvedValue({
        results: [
          { id: 'contact-1', properties: { email: 'test1@example.com' } },
          { id: 'contact-2', properties: { email: 'test2@example.com' } }
        ]
      });

      mockHubspotClient.crm.contacts.basicApi.update
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('Update failed'));

      const result = await updatePrimaryCompanyForContacts(mockHubspotClient, master, duplicates);

      expect(result.status).toBe('partial_success');
      expect(result.successfulUpdates).toBe(1);
      expect(result.failedUpdates).toBe(1);
    });

    it('should process multiple duplicates', async () => {
      const duplicates = [
        { id: 'dup-1', properties: { name: 'Duplicate 1' } },
        { id: 'dup-2', properties: { name: 'Duplicate 2' } }
      ];

      mockHubspotClient.crm.contacts.searchApi.doSearch
        .mockResolvedValueOnce({
          results: [{ id: 'contact-1', properties: { email: 'test1@example.com' } }]
        })
        .mockResolvedValueOnce({
          results: [{ id: 'contact-2', properties: { email: 'test2@example.com' } }]
        });

      mockHubspotClient.crm.contacts.basicApi.update.mockResolvedValue({});

      const result = await updatePrimaryCompanyForContacts(mockHubspotClient, master, duplicates);

      expect(result.totalUpdates).toBe(2);
      expect(mockHubspotClient.crm.contacts.searchApi.doSearch).toHaveBeenCalledTimes(2);
    });

    it('should handle missing email gracefully', async () => {
      const duplicates = [{
        id: 'dup-1',
        properties: { name: 'Duplicate 1' }
      }];

      mockHubspotClient.crm.contacts.searchApi.doSearch.mockResolvedValue({
        results: [{ id: 'contact-1', properties: { firstname: 'Test' } }] // No email
      });

      mockHubspotClient.crm.contacts.basicApi.update.mockResolvedValue({});

      const result = await updatePrimaryCompanyForContacts(mockHubspotClient, master, duplicates);

      expect(result.status).toBe('success');
      expect(result.totalUpdates).toBe(1);
    });

    it('should throw on search errors', async () => {
      const duplicates = [{
        id: 'dup-1',
        properties: { name: 'Duplicate 1' }
      }];

      const error = new Error('Search API error');
      error.code = 500;
      mockHubspotClient.crm.contacts.searchApi.doSearch.mockRejectedValue(error);

      await expect(updatePrimaryCompanyForContacts(mockHubspotClient, master, duplicates))
        .rejects.toThrow('Search API error');
    });
  });

  describe('validateNoPrimaryCompanyOrphans()', () => {
    it('should pass when no contacts point to duplicates', async () => {
      const duplicates = [{ id: 'dup-1' }];

      mockHubspotClient.crm.contacts.searchApi.doSearch.mockResolvedValue({
        results: []
      });

      const result = await validateNoPrimaryCompanyOrphans(mockHubspotClient, duplicates);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail when contacts still point to duplicates', async () => {
      const duplicates = [{ id: 'dup-1' }];

      mockHubspotClient.crm.contacts.searchApi.doSearch.mockResolvedValue({
        results: [
          { id: 'contact-1', properties: { email: 'orphan@example.com' } }
        ]
      });

      const result = await validateNoPrimaryCompanyOrphans(mockHubspotClient, duplicates);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('1 contacts still have archived company');
    });

    it('should check all duplicates', async () => {
      const duplicates = [
        { id: 'dup-1' },
        { id: 'dup-2' }
      ];

      mockHubspotClient.crm.contacts.searchApi.doSearch.mockResolvedValue({
        results: []
      });

      await validateNoPrimaryCompanyOrphans(mockHubspotClient, duplicates);

      expect(mockHubspotClient.crm.contacts.searchApi.doSearch).toHaveBeenCalledTimes(2);
    });

    it('should report multiple orphan groups', async () => {
      const duplicates = [
        { id: 'dup-1' },
        { id: 'dup-2' }
      ];

      mockHubspotClient.crm.contacts.searchApi.doSearch
        .mockResolvedValueOnce({
          results: [{ id: 'contact-1', properties: { email: 'orphan1@example.com' } }]
        })
        .mockResolvedValueOnce({
          results: [{ id: 'contact-2', properties: { email: 'orphan2@example.com' } }]
        });

      const result = await validateNoPrimaryCompanyOrphans(mockHubspotClient, duplicates);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
    });
  });

  describe('Integration scenarios', () => {
    it('should update contacts from multiple duplicates to master', async () => {
      const master = {
        id: 'master-1',
        properties: { name: 'Master Corp' }
      };

      const duplicates = [
        { id: 'dup-1', properties: { name: 'Dup 1' } },
        { id: 'dup-2', properties: { name: 'Dup 2' } }
      ];

      mockHubspotClient.crm.contacts.searchApi.doSearch
        .mockResolvedValueOnce({
          results: [
            { id: 'contact-1', properties: { email: 'user1@dup1.com', firstname: 'User', lastname: 'One' } }
          ]
        })
        .mockResolvedValueOnce({
          results: [
            { id: 'contact-2', properties: { email: 'user2@dup2.com', firstname: 'User', lastname: 'Two' } },
            { id: 'contact-3', properties: { email: 'user3@dup2.com', firstname: 'User', lastname: 'Three' } }
          ]
        });

      mockHubspotClient.crm.contacts.basicApi.update.mockResolvedValue({});

      const result = await updatePrimaryCompanyForContacts(mockHubspotClient, master, duplicates);

      expect(result.totalUpdates).toBe(3);
      expect(result.successfulUpdates).toBe(3);
      expect(mockHubspotClient.crm.contacts.basicApi.update).toHaveBeenCalledTimes(3);
    });
  });
});
