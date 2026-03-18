/**
 * Test Suite: Property Merge Engine
 *
 * Tests the HubSpot property merge engine that safely merges
 * properties from duplicate companies into a master record.
 *
 * CRITICAL: This engine handles irreversible merge operations.
 * Test coverage must verify:
 * - Empty property detection (null, undefined, "", [], 0)
 * - Master value preservation (never overwrite non-empty)
 * - Salesforce field protection (block all SFDC sync fields)
 * - System field protection (createdate, id, owner_id)
 * - Dry-run mode validation
 * - Edge cases (null master, all empty duplicates)
 *
 * Coverage Target: >90%
 * Priority: Tier 1 (CRITICAL - Data Loss Prevention)
 */

const {
  mergeProperties,
  validateMergeResults,
  applyPropertyUpdates,
  isPropertySafeToMerge,
  isPropertyEmpty,
  MERGE_SAFE_PROPERTIES,
  SALESFORCE_PROTECTED,
  SYSTEM_PROTECTED
} = require('../scripts/lib/property-merge-engine');

describe('PropertyMergeEngine', () => {
  // Helper to create mock company objects
  const createMockCompany = (id, properties, lastModified = '2024-01-15T10:00:00Z') => ({
    id,
    properties: {
      ...properties,
      hs_lastmodifieddate: lastModified
    }
  });

  describe('Constants', () => {
    describe('MERGE_SAFE_PROPERTIES', () => {
      it('should include standard contact information fields', () => {
        expect(MERGE_SAFE_PROPERTIES).toContain('phone');
        expect(MERGE_SAFE_PROPERTIES).toContain('city');
        expect(MERGE_SAFE_PROPERTIES).toContain('state');
        expect(MERGE_SAFE_PROPERTIES).toContain('zip');
        expect(MERGE_SAFE_PROPERTIES).toContain('country');
        expect(MERGE_SAFE_PROPERTIES).toContain('address');
      });

      it('should include company detail fields', () => {
        expect(MERGE_SAFE_PROPERTIES).toContain('industry');
        expect(MERGE_SAFE_PROPERTIES).toContain('numberofemployees');
        expect(MERGE_SAFE_PROPERTIES).toContain('annualrevenue');
        expect(MERGE_SAFE_PROPERTIES).toContain('description');
      });

      it('should include social media fields', () => {
        expect(MERGE_SAFE_PROPERTIES).toContain('linkedin_company_page');
        expect(MERGE_SAFE_PROPERTIES).toContain('twitterhandle');
        expect(MERGE_SAFE_PROPERTIES).toContain('facebook_company_page');
      });

      it('should include hierarchy fields', () => {
        expect(MERGE_SAFE_PROPERTIES).toContain('hs_parent_company_id');
        expect(MERGE_SAFE_PROPERTIES).toContain('hs_num_child_companies');
      });
    });

    describe('SALESFORCE_PROTECTED', () => {
      it('should include all Salesforce sync fields', () => {
        expect(SALESFORCE_PROTECTED).toContain('hs_salesforce_object_id');
        expect(SALESFORCE_PROTECTED).toContain('hs_salesforce_account_id');
        expect(SALESFORCE_PROTECTED).toContain('hs_salesforce_record_id');
        expect(SALESFORCE_PROTECTED).toContain('hs_salesforce_last_sync');
        expect(SALESFORCE_PROTECTED).toContain('hs_salesforce_sync_status');
        expect(SALESFORCE_PROTECTED).toContain('hs_salesforce_last_sync_error');
      });

      it('should have at least 6 protected Salesforce fields', () => {
        expect(SALESFORCE_PROTECTED.length).toBeGreaterThanOrEqual(6);
      });
    });

    describe('SYSTEM_PROTECTED', () => {
      it('should include core system fields', () => {
        expect(SYSTEM_PROTECTED).toContain('hs_object_id');
        expect(SYSTEM_PROTECTED).toContain('createdate');
        expect(SYSTEM_PROTECTED).toContain('hs_lastmodifieddate');
      });

      it('should include owner fields', () => {
        expect(SYSTEM_PROTECTED).toContain('hs_all_owner_ids');
        expect(SYSTEM_PROTECTED).toContain('hubspot_owner_id');
      });

      it('should include lifecycle stage', () => {
        expect(SYSTEM_PROTECTED).toContain('lifecyclestage');
      });
    });
  });

  describe('isPropertyEmpty()', () => {
    describe('null and undefined values', () => {
      it('should return true for null', () => {
        expect(isPropertyEmpty(null)).toBe(true);
      });

      it('should return true for undefined', () => {
        expect(isPropertyEmpty(undefined)).toBe(true);
      });
    });

    describe('string values', () => {
      it('should return true for empty string', () => {
        expect(isPropertyEmpty('')).toBe(true);
      });

      it('should return true for whitespace-only string', () => {
        expect(isPropertyEmpty('   ')).toBe(true);
        expect(isPropertyEmpty('\t')).toBe(true);
        expect(isPropertyEmpty('\n')).toBe(true);
      });

      it('should return false for non-empty string', () => {
        expect(isPropertyEmpty('test')).toBe(false);
        expect(isPropertyEmpty('  test  ')).toBe(false);
      });
    });

    describe('numeric values', () => {
      it('should return false for zero (0 is valid value)', () => {
        expect(isPropertyEmpty(0)).toBe(false);
      });

      it('should return false for positive numbers', () => {
        expect(isPropertyEmpty(1)).toBe(false);
        expect(isPropertyEmpty(100)).toBe(false);
        expect(isPropertyEmpty(99.99)).toBe(false);
      });

      it('should return false for negative numbers', () => {
        expect(isPropertyEmpty(-1)).toBe(false);
        expect(isPropertyEmpty(-100.5)).toBe(false);
      });
    });

    describe('array values', () => {
      it('should return true for empty array', () => {
        expect(isPropertyEmpty([])).toBe(true);
      });

      it('should return false for non-empty array', () => {
        expect(isPropertyEmpty([1])).toBe(false);
        expect(isPropertyEmpty(['a', 'b'])).toBe(false);
      });
    });

    describe('object values', () => {
      it('should return false for non-empty object', () => {
        expect(isPropertyEmpty({ key: 'value' })).toBe(false);
      });

      it('should return false for empty object (not considered empty)', () => {
        // Note: The implementation doesn't check for empty objects
        expect(isPropertyEmpty({})).toBe(false);
      });
    });

    describe('boolean values', () => {
      it('should return false for false (boolean false is valid)', () => {
        expect(isPropertyEmpty(false)).toBe(false);
      });

      it('should return false for true', () => {
        expect(isPropertyEmpty(true)).toBe(false);
      });
    });
  });

  describe('isPropertySafeToMerge()', () => {
    describe('Salesforce-protected fields', () => {
      it('should return false for hs_salesforce_object_id', () => {
        expect(isPropertySafeToMerge('hs_salesforce_object_id')).toBe(false);
      });

      it('should return false for hs_salesforce_account_id', () => {
        expect(isPropertySafeToMerge('hs_salesforce_account_id')).toBe(false);
      });

      it('should return false for hs_salesforce_sync_status', () => {
        expect(isPropertySafeToMerge('hs_salesforce_sync_status')).toBe(false);
      });

      it('should return false for all fields in SALESFORCE_PROTECTED', () => {
        SALESFORCE_PROTECTED.forEach(field => {
          expect(isPropertySafeToMerge(field)).toBe(false);
        });
      });
    });

    describe('salesforce_ prefix fields', () => {
      it('should return false for any field starting with salesforce_', () => {
        expect(isPropertySafeToMerge('salesforce_custom_field')).toBe(false);
        expect(isPropertySafeToMerge('salesforce_owner')).toBe(false);
        expect(isPropertySafeToMerge('salesforce_anything')).toBe(false);
      });
    });

    describe('system-protected fields', () => {
      it('should return false for hs_object_id', () => {
        expect(isPropertySafeToMerge('hs_object_id')).toBe(false);
      });

      it('should return false for createdate', () => {
        expect(isPropertySafeToMerge('createdate')).toBe(false);
      });

      it('should return false for hubspot_owner_id', () => {
        expect(isPropertySafeToMerge('hubspot_owner_id')).toBe(false);
      });

      it('should return false for lifecyclestage', () => {
        expect(isPropertySafeToMerge('lifecyclestage')).toBe(false);
      });

      it('should return false for all fields in SYSTEM_PROTECTED', () => {
        SYSTEM_PROTECTED.forEach(field => {
          expect(isPropertySafeToMerge(field)).toBe(false);
        });
      });
    });

    describe('allowlisted fields', () => {
      it('should return true for phone', () => {
        expect(isPropertySafeToMerge('phone')).toBe(true);
      });

      it('should return true for industry', () => {
        expect(isPropertySafeToMerge('industry')).toBe(true);
      });

      it('should return true for linkedin_company_page', () => {
        expect(isPropertySafeToMerge('linkedin_company_page')).toBe(true);
      });

      it('should return true for all fields in MERGE_SAFE_PROPERTIES', () => {
        MERGE_SAFE_PROPERTIES.forEach(field => {
          expect(isPropertySafeToMerge(field)).toBe(true);
        });
      });
    });

    describe('non-allowlisted fields', () => {
      it('should return false for random custom fields', () => {
        expect(isPropertySafeToMerge('random_custom_field')).toBe(false);
        expect(isPropertySafeToMerge('custom_property')).toBe(false);
      });

      it('should return false for unknown fields', () => {
        expect(isPropertySafeToMerge('unknown_field')).toBe(false);
        expect(isPropertySafeToMerge('some_new_property')).toBe(false);
      });
    });
  });

  describe('mergeProperties()', () => {
    describe('basic merge scenarios', () => {
      it('should fill empty master properties from duplicates', () => {
        const master = createMockCompany('master-1', {
          name: 'Master Corp',
          phone: ''
        });

        const duplicates = [
          createMockCompany('dup-1', {
            name: 'Duplicate Corp',
            phone: '555-1234'
          })
        ];

        const result = mergeProperties(master, duplicates);

        expect(result.propertiesToUpdate.phone).toBe('555-1234');
        expect(result.summary.propertiesMerged).toBe(1);
      });

      it('should never overwrite non-empty master values', () => {
        const master = createMockCompany('master-1', {
          name: 'Master Corp',
          phone: '555-MASTER',
          industry: 'Technology'
        });

        const duplicates = [
          createMockCompany('dup-1', {
            phone: '555-DUPLICATE',
            industry: 'Finance'
          })
        ];

        const result = mergeProperties(master, duplicates);

        expect(result.propertiesToUpdate.phone).toBeUndefined();
        expect(result.propertiesToUpdate.industry).toBeUndefined();
        expect(result.summary.propertiesMerged).toBe(0);
      });

      it('should merge multiple properties at once', () => {
        const master = createMockCompany('master-1', {
          name: 'Master Corp',
          phone: '',
          city: '',
          state: ''
        });

        const duplicates = [
          createMockCompany('dup-1', {
            phone: '555-1234',
            city: 'San Francisco',
            state: 'CA'
          })
        ];

        const result = mergeProperties(master, duplicates);

        expect(result.propertiesToUpdate.phone).toBe('555-1234');
        expect(result.propertiesToUpdate.city).toBe('San Francisco');
        expect(result.propertiesToUpdate.state).toBe('CA');
        expect(result.summary.propertiesMerged).toBe(3);
      });
    });

    describe('multiple duplicates', () => {
      it('should prefer most recently modified duplicate value', () => {
        const master = createMockCompany('master-1', {
          name: 'Master Corp',
          phone: ''
        });

        const duplicates = [
          createMockCompany('dup-1', { phone: '555-OLD' }, '2024-01-01T10:00:00Z'),
          createMockCompany('dup-2', { phone: '555-NEW' }, '2024-01-15T10:00:00Z'),
          createMockCompany('dup-3', { phone: '555-OLDER' }, '2023-12-01T10:00:00Z')
        ];

        const result = mergeProperties(master, duplicates);

        expect(result.propertiesToUpdate.phone).toBe('555-NEW');
      });

      it('should skip duplicates with empty values', () => {
        const master = createMockCompany('master-1', {
          name: 'Master Corp',
          phone: ''
        });

        const duplicates = [
          createMockCompany('dup-1', { phone: '' }, '2024-01-15T10:00:00Z'),
          createMockCompany('dup-2', { phone: null }, '2024-01-14T10:00:00Z'),
          createMockCompany('dup-3', { phone: '555-VALID' }, '2024-01-01T10:00:00Z')
        ];

        const result = mergeProperties(master, duplicates);

        expect(result.propertiesToUpdate.phone).toBe('555-VALID');
      });

      it('should handle case when all duplicates have empty values', () => {
        const master = createMockCompany('master-1', {
          name: 'Master Corp',
          phone: ''
        });

        const duplicates = [
          createMockCompany('dup-1', { phone: '' }),
          createMockCompany('dup-2', { phone: null }),
          createMockCompany('dup-3', { phone: undefined })
        ];

        const result = mergeProperties(master, duplicates);

        expect(result.propertiesToUpdate.phone).toBeUndefined();
      });
    });

    describe('property protection', () => {
      it('should never merge Salesforce-protected fields', () => {
        const master = createMockCompany('master-1', {
          name: 'Master Corp',
          hs_salesforce_object_id: ''
        });

        const duplicates = [
          createMockCompany('dup-1', {
            hs_salesforce_object_id: '001XXXXXXXXX'
          })
        ];

        const result = mergeProperties(master, duplicates);

        expect(result.propertiesToUpdate.hs_salesforce_object_id).toBeUndefined();
        expect(result.skippedProperties).toContainEqual({
          property: 'hs_salesforce_object_id',
          reason: 'Salesforce-protected field'
        });
      });

      it('should never merge system-protected fields', () => {
        const master = createMockCompany('master-1', {
          name: 'Master Corp',
          hubspot_owner_id: ''
        });

        const duplicates = [
          createMockCompany('dup-1', {
            hubspot_owner_id: '12345'
          })
        ];

        const result = mergeProperties(master, duplicates);

        expect(result.propertiesToUpdate.hubspot_owner_id).toBeUndefined();
        expect(result.skippedProperties).toContainEqual({
          property: 'hubspot_owner_id',
          reason: 'System-protected field'
        });
      });

      it('should skip fields starting with salesforce_', () => {
        const master = createMockCompany('master-1', {
          name: 'Master Corp',
          salesforce_custom_field: ''
        });

        const duplicates = [
          createMockCompany('dup-1', {
            salesforce_custom_field: 'custom value'
          })
        ];

        const result = mergeProperties(master, duplicates);

        expect(result.propertiesToUpdate.salesforce_custom_field).toBeUndefined();
        expect(result.skippedProperties).toContainEqual({
          property: 'salesforce_custom_field',
          reason: 'Salesforce-protected field'
        });
      });

      it('should skip non-allowlisted fields', () => {
        const master = createMockCompany('master-1', {
          name: 'Master Corp',
          random_custom_prop: ''
        });

        const duplicates = [
          createMockCompany('dup-1', {
            random_custom_prop: 'value'
          })
        ];

        const result = mergeProperties(master, duplicates);

        expect(result.propertiesToUpdate.random_custom_prop).toBeUndefined();
        expect(result.skippedProperties).toContainEqual({
          property: 'random_custom_prop',
          reason: 'Not in allowlist'
        });
      });
    });

    describe('dry-run mode', () => {
      it('should include dryRun flag in summary', () => {
        const master = createMockCompany('master-1', { phone: '' });
        const duplicates = [createMockCompany('dup-1', { phone: '555-1234' })];

        const result = mergeProperties(master, duplicates, { dryRun: true });

        expect(result.summary.dryRun).toBe(true);
      });

      it('should compute properties without dryRun flag if not specified', () => {
        const master = createMockCompany('master-1', { phone: '' });
        const duplicates = [createMockCompany('dup-1', { phone: '555-1234' })];

        const result = mergeProperties(master, duplicates);

        expect(result.summary.dryRun).toBe(false);
      });
    });

    describe('custom allowlist option', () => {
      it('should respect custom allowlist when provided', () => {
        const master = createMockCompany('master-1', {
          phone: '',
          city: '',
          state: ''
        });

        const duplicates = [
          createMockCompany('dup-1', {
            phone: '555-1234',
            city: 'San Francisco',
            state: 'CA'
          })
        ];

        const result = mergeProperties(master, duplicates, {
          allowlist: ['phone']
        });

        expect(result.propertiesToUpdate.phone).toBe('555-1234');
        expect(result.propertiesToUpdate.city).toBeUndefined();
        expect(result.propertiesToUpdate.state).toBeUndefined();
      });

      it('should skip properties not in custom allowlist', () => {
        const master = createMockCompany('master-1', { phone: '', city: '' });
        const duplicates = [createMockCompany('dup-1', { phone: '555-1234', city: 'NYC' })];

        const result = mergeProperties(master, duplicates, {
          allowlist: ['city']
        });

        expect(result.skippedProperties).toContainEqual({
          property: 'phone',
          reason: 'Not in custom allowlist'
        });
      });
    });

    describe('merge log tracking', () => {
      it('should create merge log entry for each merged property', () => {
        const master = createMockCompany('master-1', {
          name: 'Master Corp',
          phone: '',
          city: ''
        });

        const duplicates = [
          createMockCompany('dup-1', {
            name: 'Dup Corp',
            phone: '555-1234',
            city: 'San Francisco'
          })
        ];

        const result = mergeProperties(master, duplicates);

        expect(result.mergeLog.length).toBe(2);

        const phoneLog = result.mergeLog.find(l => l.property === 'phone');
        expect(phoneLog).toBeDefined();
        expect(phoneLog.oldValue).toBe('');
        expect(phoneLog.newValue).toBe('555-1234');
        expect(phoneLog.source).toBe('dup-1');
      });

      it('should include source company name in merge log', () => {
        const master = createMockCompany('master-1', { phone: '' });
        const duplicates = [
          createMockCompany('dup-1', { name: 'Duplicate Corp', phone: '555-1234' })
        ];

        const result = mergeProperties(master, duplicates);

        const phoneLog = result.mergeLog.find(l => l.property === 'phone');
        expect(phoneLog.sourceName).toBe('Duplicate Corp');
      });
    });

    describe('summary statistics', () => {
      it('should calculate correct total properties count', () => {
        const master = createMockCompany('master-1', { phone: '', city: '' });
        const duplicates = [createMockCompany('dup-1', { phone: '555', state: 'CA' })];

        const result = mergeProperties(master, duplicates);

        // phone, city, state, plus hs_lastmodifieddate
        expect(result.summary.totalProperties).toBeGreaterThanOrEqual(3);
      });

      it('should track properties merged correctly', () => {
        const master = createMockCompany('master-1', { phone: '', city: 'NYC' });
        const duplicates = [createMockCompany('dup-1', { phone: '555', city: 'SF' })];

        const result = mergeProperties(master, duplicates);

        // Only phone should be merged (city already has value)
        expect(result.summary.propertiesMerged).toBe(1);
      });

      it('should track skipped properties correctly', () => {
        const master = createMockCompany('master-1', {
          phone: '',
          hs_salesforce_object_id: '',
          random_field: ''
        });

        const duplicates = [
          createMockCompany('dup-1', {
            phone: '555',
            hs_salesforce_object_id: '001XXX',
            random_field: 'value'
          })
        ];

        const result = mergeProperties(master, duplicates);

        expect(result.skippedProperties.length).toBeGreaterThanOrEqual(2);
      });
    });

    describe('edge cases', () => {
      it('should handle empty duplicates array', () => {
        const master = createMockCompany('master-1', { phone: '' });

        const result = mergeProperties(master, []);

        expect(result.propertiesToUpdate).toEqual({});
        expect(result.summary.propertiesMerged).toBe(0);
      });

      it('should handle master with no properties', () => {
        const master = createMockCompany('master-1', {});
        const duplicates = [createMockCompany('dup-1', { phone: '555-1234' })];

        const result = mergeProperties(master, duplicates);

        expect(result.propertiesToUpdate.phone).toBe('555-1234');
      });

      it('should handle duplicates with no properties', () => {
        const master = createMockCompany('master-1', { phone: '' });
        const duplicates = [createMockCompany('dup-1', {})];

        const result = mergeProperties(master, duplicates);

        expect(result.summary.propertiesMerged).toBe(0);
      });
    });
  });

  describe('validateMergeResults()', () => {
    describe('valid merge results', () => {
      it('should return valid for normal merge results', () => {
        const master = createMockCompany('master-1', { phone: '' });
        const mergeResults = {
          propertiesToUpdate: { phone: '555-1234' },
          mergeLog: [{
            property: 'phone',
            oldValue: '',
            newValue: '555-1234',
            source: 'dup-1'
          }]
        };

        const validation = validateMergeResults(mergeResults, master);

        expect(validation.valid).toBe(true);
        expect(validation.errors.length).toBe(0);
      });
    });

    describe('protected field violations', () => {
      it('should return error if trying to update Salesforce-protected field', () => {
        const master = createMockCompany('master-1', {});
        const mergeResults = {
          propertiesToUpdate: {
            hs_salesforce_object_id: '001XXX'
          },
          mergeLog: []
        };

        const validation = validateMergeResults(mergeResults, master);

        expect(validation.valid).toBe(false);
        expect(validation.errors).toContain(
          'Attempting to update Salesforce-protected field: hs_salesforce_object_id'
        );
      });

      it('should return error for salesforce_ prefix fields', () => {
        const master = createMockCompany('master-1', {});
        const mergeResults = {
          propertiesToUpdate: {
            salesforce_custom_field: 'value'
          },
          mergeLog: []
        };

        const validation = validateMergeResults(mergeResults, master);

        expect(validation.valid).toBe(false);
        expect(validation.errors).toContain(
          'Attempting to update Salesforce-protected field: salesforce_custom_field'
        );
      });

      it('should return error for system-protected fields', () => {
        const master = createMockCompany('master-1', {});
        const mergeResults = {
          propertiesToUpdate: {
            hubspot_owner_id: '12345'
          },
          mergeLog: []
        };

        const validation = validateMergeResults(mergeResults, master);

        expect(validation.valid).toBe(false);
        expect(validation.errors).toContain(
          'Attempting to update system-protected field: hubspot_owner_id'
        );
      });

      it('should return multiple errors for multiple violations', () => {
        const master = createMockCompany('master-1', {});
        const mergeResults = {
          propertiesToUpdate: {
            hs_salesforce_object_id: '001XXX',
            hubspot_owner_id: '12345',
            createdate: '2024-01-01'
          },
          mergeLog: []
        };

        const validation = validateMergeResults(mergeResults, master);

        expect(validation.valid).toBe(false);
        expect(validation.errors.length).toBe(3);
      });
    });

    describe('overwrite warnings', () => {
      it('should warn when overwriting existing non-empty value', () => {
        const master = createMockCompany('master-1', { phone: '555-OLD' });
        const mergeResults = {
          propertiesToUpdate: { phone: '555-NEW' },
          mergeLog: [{
            property: 'phone',
            oldValue: '555-OLD',
            newValue: '555-NEW'
          }]
        };

        const validation = validateMergeResults(mergeResults, master);

        expect(validation.warnings.length).toBeGreaterThan(0);
        expect(validation.warnings[0]).toContain('Overwriting existing value');
      });

      it('should not warn when filling empty value', () => {
        const master = createMockCompany('master-1', { phone: '' });
        const mergeResults = {
          propertiesToUpdate: { phone: '555-NEW' },
          mergeLog: [{
            property: 'phone',
            oldValue: '',
            newValue: '555-NEW'
          }]
        };

        const validation = validateMergeResults(mergeResults, master);

        expect(validation.warnings.filter(w => w.includes('Overwriting'))).toHaveLength(0);
      });
    });

    describe('large update warnings', () => {
      it('should warn for more than 50 property updates', () => {
        const master = createMockCompany('master-1', {});
        const propertiesToUpdate = {};

        // Create 51 property updates
        for (let i = 0; i < 51; i++) {
          propertiesToUpdate[`prop_${i}`] = `value_${i}`;
        }

        const mergeResults = {
          propertiesToUpdate,
          mergeLog: []
        };

        const validation = validateMergeResults(mergeResults, master);

        expect(validation.warnings.some(w => w.includes('Large number'))).toBe(true);
      });

      it('should not warn for 50 or fewer property updates', () => {
        const master = createMockCompany('master-1', {});
        const propertiesToUpdate = {};

        for (let i = 0; i < 50; i++) {
          propertiesToUpdate[`prop_${i}`] = `value_${i}`;
        }

        const mergeResults = {
          propertiesToUpdate,
          mergeLog: []
        };

        const validation = validateMergeResults(mergeResults, master);

        expect(validation.warnings.some(w => w.includes('Large number'))).toBe(false);
      });
    });
  });

  describe('applyPropertyUpdates()', () => {
    let mockHubspotClient;

    beforeEach(() => {
      mockHubspotClient = {
        crm: {
          companies: {
            basicApi: {
              update: jest.fn()
            }
          }
        }
      };
    });

    describe('dry-run mode', () => {
      it('should not call API in dry-run mode', async () => {
        const result = await applyPropertyUpdates(
          mockHubspotClient,
          'master-1',
          { phone: '555-1234' },
          true // dryRun
        );

        expect(mockHubspotClient.crm.companies.basicApi.update).not.toHaveBeenCalled();
        expect(result.success).toBe(true);
        expect(result.dryRun).toBe(true);
      });

      it('should return correct update count in dry-run', async () => {
        const result = await applyPropertyUpdates(
          mockHubspotClient,
          'master-1',
          { phone: '555-1234', city: 'NYC' },
          true
        );

        expect(result.updateCount).toBe(2);
      });
    });

    describe('empty updates', () => {
      it('should return success with zero count for empty updates', async () => {
        const result = await applyPropertyUpdates(
          mockHubspotClient,
          'master-1',
          {},
          false
        );

        expect(result.success).toBe(true);
        expect(result.updateCount).toBe(0);
        expect(result.message).toBe('No properties to update');
        expect(mockHubspotClient.crm.companies.basicApi.update).not.toHaveBeenCalled();
      });
    });

    describe('successful updates', () => {
      it('should call HubSpot API with correct parameters', async () => {
        mockHubspotClient.crm.companies.basicApi.update.mockResolvedValue({});

        await applyPropertyUpdates(
          mockHubspotClient,
          'master-123',
          { phone: '555-1234', city: 'NYC' },
          false
        );

        expect(mockHubspotClient.crm.companies.basicApi.update).toHaveBeenCalledWith(
          'master-123',
          { properties: { phone: '555-1234', city: 'NYC' } }
        );
      });

      it('should return success with update count', async () => {
        mockHubspotClient.crm.companies.basicApi.update.mockResolvedValue({});

        const result = await applyPropertyUpdates(
          mockHubspotClient,
          'master-123',
          { phone: '555-1234', city: 'NYC' },
          false
        );

        expect(result.success).toBe(true);
        expect(result.updateCount).toBe(2);
        expect(result.updatedProperties).toEqual(['phone', 'city']);
      });
    });

    describe('API errors', () => {
      it('should return error result on API failure', async () => {
        mockHubspotClient.crm.companies.basicApi.update.mockRejectedValue(
          new Error('API rate limit exceeded')
        );

        const result = await applyPropertyUpdates(
          mockHubspotClient,
          'master-123',
          { phone: '555-1234' },
          false
        );

        expect(result.success).toBe(false);
        expect(result.error).toBe('API rate limit exceeded');
        expect(result.updateCount).toBe(0);
      });

      it('should handle network errors', async () => {
        mockHubspotClient.crm.companies.basicApi.update.mockRejectedValue(
          new Error('Network timeout')
        );

        const result = await applyPropertyUpdates(
          mockHubspotClient,
          'master-123',
          { phone: '555-1234' },
          false
        );

        expect(result.success).toBe(false);
        expect(result.error).toBe('Network timeout');
      });
    });
  });

  describe('Integration scenarios', () => {
    describe('full merge workflow', () => {
      it('should complete end-to-end merge with validation', () => {
        const master = createMockCompany('master-1', {
          name: 'Acme Corp',
          phone: '',
          city: '',
          industry: 'Technology'
        });

        const duplicates = [
          createMockCompany('dup-1', {
            name: 'Acme Corporation',
            phone: '555-1234',
            city: 'San Francisco',
            hs_salesforce_object_id: '001XXX'
          }, '2024-01-15T10:00:00Z'),
          createMockCompany('dup-2', {
            name: 'ACME Corp.',
            phone: '555-9999',
            city: 'New York',
            state: 'NY'
          }, '2024-01-10T10:00:00Z')
        ];

        // Step 1: Merge properties
        const mergeResult = mergeProperties(master, duplicates);

        // Step 2: Validate
        const validation = validateMergeResults(mergeResult, master);

        expect(validation.valid).toBe(true);

        // Phone should come from most recent duplicate (dup-1)
        expect(mergeResult.propertiesToUpdate.phone).toBe('555-1234');

        // City should come from most recent duplicate (dup-1)
        expect(mergeResult.propertiesToUpdate.city).toBe('San Francisco');

        // State should come from dup-2 (dup-1 doesn't have it)
        expect(mergeResult.propertiesToUpdate.state).toBe('NY');

        // Industry should NOT be updated (master has value)
        expect(mergeResult.propertiesToUpdate.industry).toBeUndefined();

        // Salesforce field should be skipped
        expect(mergeResult.propertiesToUpdate.hs_salesforce_object_id).toBeUndefined();
      });
    });

    describe('deduplication scenarios', () => {
      it('should handle typical deduplication case with partial data', () => {
        const master = createMockCompany('master-1', {
          name: 'RevPal Inc',
          phone: '555-0000',
          industry: '',
          city: '',
          state: ''
        });

        const duplicates = [
          createMockCompany('dup-1', {
            name: 'RevPal',
            phone: '',
            industry: 'Software',
            city: 'Austin',
            state: ''
          }),
          createMockCompany('dup-2', {
            name: 'Rev Pal Inc.',
            phone: '555-1111',
            industry: '',
            city: '',
            state: 'TX'
          })
        ];

        const result = mergeProperties(master, duplicates);

        // Phone kept from master (has value)
        expect(result.propertiesToUpdate.phone).toBeUndefined();

        // Industry from dup-1
        expect(result.propertiesToUpdate.industry).toBe('Software');

        // City from dup-1
        expect(result.propertiesToUpdate.city).toBe('Austin');

        // State from dup-2
        expect(result.propertiesToUpdate.state).toBe('TX');
      });
    });
  });
});
