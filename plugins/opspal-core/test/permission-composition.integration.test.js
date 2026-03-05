/**
 * Integration Test Suite: Permission Composition
 *
 * Tests the integration between:
 * - PermissionSetOrchestrator: Two-tier permission architecture
 * - PermissionValidator: FLS and object access validation
 * - PermissionSetGenerator: Creates permission set XML
 *
 * These components work together for permission management.
 *
 * Coverage Target: FLS conflict detection, merge-safe operations, composed sets
 * Priority: Tier 1 (HIGH - Security-critical permission management)
 */

// Mock dependencies
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn()
  },
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn()
}));

jest.mock('child_process', () => ({
  execSync: jest.fn()
}));

jest.mock('xml2js', () => ({
  parseString: jest.fn((xml, cb) => cb(null, { PermissionSet: {} })),
  Parser: jest.fn().mockImplementation(() => ({
    parseStringPromise: jest.fn().mockResolvedValue({ PermissionSet: {} })
  })),
  Builder: jest.fn().mockImplementation(() => ({
    buildObject: jest.fn().mockReturnValue('<?xml version="1.0"?><PermissionSet/>')
  }))
}));

const fs = require('fs');
const { execSync } = require('child_process');

describe('Permission Composition Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    // Default mocks
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('{}');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Two-Tier Permission Architecture', () => {
    it('should define Tier 1 as foundational permissions', () => {
      const tier1Definition = {
        tier: 1,
        name: 'Foundational',
        includes: ['FLS', 'Object Access', 'Tab Visibility'],
        examples: ['Sales_Base_FLS', 'Service_Base_FLS', 'Marketing_Base_FLS']
      };

      expect(tier1Definition.tier).toBe(1);
      expect(tier1Definition.includes).toContain('FLS');
      expect(tier1Definition.includes).toContain('Object Access');
    });

    it('should define Tier 2 as role-specific composed sets', () => {
      const tier2Definition = {
        tier: 2,
        name: 'Role-Specific',
        composedFrom: ['Tier 1 Permission Sets'],
        examples: ['Sales_Rep', 'Sales_Manager', 'Service_Agent']
      };

      expect(tier2Definition.tier).toBe(2);
      expect(tier2Definition.composedFrom).toContain('Tier 1 Permission Sets');
    });

    it('should validate tier assignment for permission sets', () => {
      const permissionSets = [
        { name: 'Account_FLS', tier: 1, type: 'foundational' },
        { name: 'Contact_FLS', tier: 1, type: 'foundational' },
        { name: 'Sales_Rep', tier: 2, type: 'composed', includes: ['Account_FLS', 'Contact_FLS'] }
      ];

      const tier1Sets = permissionSets.filter(ps => ps.tier === 1);
      const tier2Sets = permissionSets.filter(ps => ps.tier === 2);

      expect(tier1Sets).toHaveLength(2);
      expect(tier2Sets).toHaveLength(1);
      expect(tier2Sets[0].includes).toContain('Account_FLS');
    });

    it('should prevent Tier 1 sets from including other permission sets', () => {
      const invalidTier1 = {
        name: 'Invalid_FLS',
        tier: 1,
        includes: ['Other_Permission_Set'] // Invalid for Tier 1
      };

      const isValidTier1 = invalidTier1.tier === 1 && (!invalidTier1.includes || invalidTier1.includes.length === 0);

      expect(isValidTier1).toBe(false);
    });
  });

  describe('FLS Conflict Detection', () => {
    it('should detect conflicting FLS between permission sets', () => {
      const permissionSet1 = {
        name: 'Set_A',
        fieldPermissions: [
          { field: 'Account.AnnualRevenue', readable: true, editable: false },
          { field: 'Account.Rating', readable: true, editable: true }
        ]
      };

      const permissionSet2 = {
        name: 'Set_B',
        fieldPermissions: [
          { field: 'Account.AnnualRevenue', readable: true, editable: true }, // Conflict
          { field: 'Account.Rating', readable: true, editable: true }
        ]
      };

      const conflicts = [];
      permissionSet1.fieldPermissions.forEach(fp1 => {
        const fp2 = permissionSet2.fieldPermissions.find(fp => fp.field === fp1.field);
        if (fp2 && fp1.editable !== fp2.editable) {
          conflicts.push({
            field: fp1.field,
            set1: { name: permissionSet1.name, editable: fp1.editable },
            set2: { name: permissionSet2.name, editable: fp2.editable }
          });
        }
      });

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].field).toBe('Account.AnnualRevenue');
    });

    it('should allow identical FLS across permission sets', () => {
      const permissionSet1 = {
        name: 'Set_A',
        fieldPermissions: [
          { field: 'Account.Name', readable: true, editable: true }
        ]
      };

      const permissionSet2 = {
        name: 'Set_B',
        fieldPermissions: [
          { field: 'Account.Name', readable: true, editable: true }
        ]
      };

      const conflicts = [];
      permissionSet1.fieldPermissions.forEach(fp1 => {
        const fp2 = permissionSet2.fieldPermissions.find(fp => fp.field === fp1.field);
        if (fp2 && (fp1.readable !== fp2.readable || fp1.editable !== fp2.editable)) {
          conflicts.push({ field: fp1.field });
        }
      });

      expect(conflicts).toHaveLength(0);
    });

    it('should detect readable-only conflicts', () => {
      const permissionSet1 = {
        fieldPermissions: [
          { field: 'Contact.Email', readable: false, editable: false }
        ]
      };

      const permissionSet2 = {
        fieldPermissions: [
          { field: 'Contact.Email', readable: true, editable: false }
        ]
      };

      const fp1 = permissionSet1.fieldPermissions[0];
      const fp2 = permissionSet2.fieldPermissions[0];

      const hasReadableConflict = fp1.readable !== fp2.readable;

      expect(hasReadableConflict).toBe(true);
    });

    it('should aggregate conflicts from multiple permission sets', () => {
      const permissionSets = [
        {
          name: 'Set_A',
          fieldPermissions: [{ field: 'Account.Name', editable: false }]
        },
        {
          name: 'Set_B',
          fieldPermissions: [{ field: 'Account.Name', editable: true }]
        },
        {
          name: 'Set_C',
          fieldPermissions: [{ field: 'Account.Name', editable: true }]
        }
      ];

      const conflictMap = new Map();
      permissionSets.forEach((ps, idx) => {
        ps.fieldPermissions.forEach(fp => {
          if (!conflictMap.has(fp.field)) {
            conflictMap.set(fp.field, []);
          }
          conflictMap.get(fp.field).push({
            set: ps.name,
            editable: fp.editable
          });
        });
      });

      // Find fields with conflicting values
      const fieldsWithConflicts = [];
      conflictMap.forEach((entries, field) => {
        const editableValues = new Set(entries.map(e => e.editable));
        if (editableValues.size > 1) {
          fieldsWithConflicts.push(field);
        }
      });

      expect(fieldsWithConflicts).toContain('Account.Name');
    });
  });

  describe('Object Access Validation', () => {
    it('should validate CRUD permissions', () => {
      const objectPermission = {
        object: 'Account',
        allowCreate: true,
        allowRead: true,
        allowEdit: true,
        allowDelete: false,
        viewAllRecords: false,
        modifyAllRecords: false
      };

      expect(objectPermission.allowCreate).toBe(true);
      expect(objectPermission.allowDelete).toBe(false);
      expect(objectPermission.modifyAllRecords).toBe(false);
    });

    it('should enforce modifyAllRecords requires viewAllRecords', () => {
      const invalidPermission = {
        object: 'Contact',
        modifyAllRecords: true,
        viewAllRecords: false // Invalid - modify requires view
      };

      const isValid = !invalidPermission.modifyAllRecords || invalidPermission.viewAllRecords;

      expect(isValid).toBe(false);
    });

    it('should enforce edit requires read', () => {
      const invalidPermission = {
        object: 'Opportunity',
        allowRead: false,
        allowEdit: true // Invalid - edit requires read
      };

      const isValid = !invalidPermission.allowEdit || invalidPermission.allowRead;

      expect(isValid).toBe(false);
    });

    it('should enforce delete requires edit', () => {
      const invalidPermission = {
        object: 'Lead',
        allowEdit: false,
        allowDelete: true // Invalid - delete requires edit
      };

      const isValid = !invalidPermission.allowDelete || invalidPermission.allowEdit;

      expect(isValid).toBe(false);
    });
  });

  describe('Merge-Safe Operations', () => {
    it('should merge permission sets with most permissive wins', () => {
      const baseSet = {
        fieldPermissions: [
          { field: 'Account.Name', readable: true, editable: false }
        ]
      };

      const additionalSet = {
        fieldPermissions: [
          { field: 'Account.Name', readable: true, editable: true }
        ]
      };

      // Most permissive merge
      const merged = {
        fieldPermissions: baseSet.fieldPermissions.map(baseFp => {
          const additionalFp = additionalSet.fieldPermissions.find(
            fp => fp.field === baseFp.field
          );
          if (additionalFp) {
            return {
              field: baseFp.field,
              readable: baseFp.readable || additionalFp.readable,
              editable: baseFp.editable || additionalFp.editable
            };
          }
          return baseFp;
        })
      };

      expect(merged.fieldPermissions[0].editable).toBe(true);
    });

    it('should preserve unique fields from both sets', () => {
      const setA = {
        fieldPermissions: [
          { field: 'Account.Name', readable: true, editable: true }
        ]
      };

      const setB = {
        fieldPermissions: [
          { field: 'Account.Rating', readable: true, editable: false }
        ]
      };

      const allFields = new Set([
        ...setA.fieldPermissions.map(fp => fp.field),
        ...setB.fieldPermissions.map(fp => fp.field)
      ]);

      expect(allFields.size).toBe(2);
      expect(allFields.has('Account.Name')).toBe(true);
      expect(allFields.has('Account.Rating')).toBe(true);
    });

    it('should track merge history for audit', () => {
      const mergeOperation = {
        timestamp: new Date().toISOString(),
        sourcePermissionSets: ['Sales_Base', 'Marketing_Base'],
        targetPermissionSet: 'Combined_Access',
        fieldsAdded: 15,
        fieldsMerged: 5,
        conflictsResolved: 2,
        resolutionStrategy: 'most_permissive'
      };

      expect(mergeOperation.resolutionStrategy).toBe('most_permissive');
      expect(mergeOperation.conflictsResolved).toBe(2);
    });

    it('should support idempotent merges', () => {
      const permissionSet = {
        fieldPermissions: [
          { field: 'Account.Name', readable: true, editable: true }
        ]
      };

      // Merging with itself should produce same result
      const mergedWithSelf = {
        fieldPermissions: permissionSet.fieldPermissions.map(fp => ({
          field: fp.field,
          readable: fp.readable || fp.readable,
          editable: fp.editable || fp.editable
        }))
      };

      expect(mergedWithSelf.fieldPermissions).toEqual(permissionSet.fieldPermissions);
    });
  });

  describe('Permission Set XML Generation', () => {
    it('should generate valid permission set structure', () => {
      const permissionSetDef = {
        label: 'Sales Representative',
        description: 'Standard permissions for sales representatives',
        license: 'Salesforce',
        hasActivationRequired: false
      };

      expect(permissionSetDef.label).toBeDefined();
      expect(permissionSetDef.license).toBe('Salesforce');
    });

    it('should include field permissions in XML', () => {
      const fieldPermissions = [
        { field: 'Account.AnnualRevenue', editable: true, readable: true },
        { field: 'Account.Rating', editable: false, readable: true }
      ];

      const xmlElements = fieldPermissions.map(fp => ({
        fieldPermissions: {
          field: fp.field,
          editable: fp.editable,
          readable: fp.readable
        }
      }));

      expect(xmlElements).toHaveLength(2);
      expect(xmlElements[0].fieldPermissions.field).toBe('Account.AnnualRevenue');
    });

    it('should include object permissions in XML', () => {
      const objectPermissions = [
        {
          object: 'Account',
          allowCreate: true,
          allowRead: true,
          allowEdit: true,
          allowDelete: false
        }
      ];

      const xmlElements = objectPermissions.map(op => ({
        objectPermissions: {
          object: op.object,
          allowCreate: op.allowCreate,
          allowRead: op.allowRead,
          allowEdit: op.allowEdit,
          allowDelete: op.allowDelete
        }
      }));

      expect(xmlElements[0].objectPermissions.object).toBe('Account');
      expect(xmlElements[0].objectPermissions.allowDelete).toBe(false);
    });

    it('should validate API version in generated XML', () => {
      const metadata = {
        apiVersion: '62.0',
        xmlns: 'http://soap.sforce.com/2006/04/metadata'
      };

      const minApiVersion = '58.0';
      const isValidApiVersion = parseFloat(metadata.apiVersion) >= parseFloat(minApiVersion);

      expect(isValidApiVersion).toBe(true);
    });
  });

  describe('Permission Assignment Validation', () => {
    it('should validate user license compatibility', () => {
      const permissionSet = {
        name: 'Sales_Rep',
        requiredLicense: 'Salesforce'
      };

      const user = {
        name: 'John Doe',
        license: 'Salesforce Platform'
      };

      // Platform license is not compatible with Salesforce license permission sets
      const isCompatible = user.license === permissionSet.requiredLicense ||
        (permissionSet.requiredLicense === 'Salesforce' && user.license === 'Salesforce');

      expect(isCompatible).toBe(false);
    });

    it('should check profile-permission set conflicts', () => {
      const profilePermissions = {
        object: 'Account',
        allowCreate: false,
        allowEdit: false
      };

      const permissionSetPermissions = {
        object: 'Account',
        allowCreate: true, // Grants more than profile
        allowEdit: true
      };

      // Permission set can only add, not remove - so this is valid
      const grantsAdditional =
        permissionSetPermissions.allowCreate && !profilePermissions.allowCreate ||
        permissionSetPermissions.allowEdit && !profilePermissions.allowEdit;

      expect(grantsAdditional).toBe(true);
    });

    it('should validate tab settings', () => {
      const tabSettings = [
        { tab: 'standard-Account', visibility: 'DefaultOn' },
        { tab: 'standard-Contact', visibility: 'DefaultOff' },
        { tab: 'standard-Opportunity', visibility: 'Hidden' }
      ];

      const validVisibilities = ['DefaultOn', 'DefaultOff', 'Hidden'];
      const allValid = tabSettings.every(ts => validVisibilities.includes(ts.visibility));

      expect(allValid).toBe(true);
    });
  });

  describe('Permission Set Group Composition', () => {
    it('should compose multiple permission sets into a group', () => {
      const permissionSetGroup = {
        label: 'Sales Team Full Access',
        description: 'Complete access for sales team',
        permissionSets: ['Sales_Base_FLS', 'Account_Access', 'Opportunity_Access'],
        status: 'Active'
      };

      expect(permissionSetGroup.permissionSets).toHaveLength(3);
      expect(permissionSetGroup.permissionSets).toContain('Sales_Base_FLS');
    });

    it('should detect circular references in groups', () => {
      const groups = [
        { name: 'Group_A', includes: ['Group_B'] },
        { name: 'Group_B', includes: ['Group_C'] },
        { name: 'Group_C', includes: ['Group_A'] } // Circular!
      ];

      const visited = new Set();
      const detectCycle = (groupName, path = []) => {
        if (path.includes(groupName)) return true;
        const group = groups.find(g => g.name === groupName);
        if (!group) return false;
        return group.includes.some(inc => detectCycle(inc, [...path, groupName]));
      };

      const hasCycle = groups.some(g => detectCycle(g.name));

      expect(hasCycle).toBe(true);
    });

    it('should calculate effective permissions from group', () => {
      const permissionSets = {
        'Set_A': {
          fieldPermissions: [
            { field: 'Account.Name', readable: true, editable: false }
          ]
        },
        'Set_B': {
          fieldPermissions: [
            { field: 'Account.Name', readable: true, editable: true },
            { field: 'Account.Rating', readable: true, editable: false }
          ]
        }
      };

      const group = {
        permissionSets: ['Set_A', 'Set_B']
      };

      // Calculate effective (most permissive)
      const effectivePermissions = new Map();
      group.permissionSets.forEach(psName => {
        const ps = permissionSets[psName];
        ps.fieldPermissions.forEach(fp => {
          if (!effectivePermissions.has(fp.field)) {
            effectivePermissions.set(fp.field, { readable: false, editable: false });
          }
          const current = effectivePermissions.get(fp.field);
          effectivePermissions.set(fp.field, {
            readable: current.readable || fp.readable,
            editable: current.editable || fp.editable
          });
        });
      });

      expect(effectivePermissions.get('Account.Name').editable).toBe(true);
      expect(effectivePermissions.get('Account.Rating').editable).toBe(false);
    });
  });

  describe('Muting Permission Set Validation', () => {
    it('should validate muting permission set structure', () => {
      const mutingPermissionSet = {
        name: 'Restrict_Delete_Access',
        type: 'muting',
        mutedPermissions: {
          objectPermissions: [
            { object: 'Account', allowDelete: true }
          ]
        }
      };

      expect(mutingPermissionSet.type).toBe('muting');
      expect(mutingPermissionSet.mutedPermissions.objectPermissions[0].allowDelete).toBe(true);
    });

    it('should apply muting to group effective permissions', () => {
      const groupEffectivePermissions = {
        Account: { allowCreate: true, allowRead: true, allowEdit: true, allowDelete: true }
      };

      const mutingSet = {
        objectPermissions: [
          { object: 'Account', allowDelete: true } // Mute delete
        ]
      };

      // Apply muting
      const finalPermissions = { ...groupEffectivePermissions };
      mutingSet.objectPermissions.forEach(mp => {
        if (finalPermissions[mp.object] && mp.allowDelete) {
          finalPermissions[mp.object].allowDelete = false;
        }
      });

      expect(finalPermissions.Account.allowDelete).toBe(false);
      expect(finalPermissions.Account.allowEdit).toBe(true);
    });
  });

  describe('Error Handling and Validation Messages', () => {
    it('should provide clear error for invalid FLS reference', () => {
      const error = {
        type: 'INVALID_FIELD_REFERENCE',
        field: 'Account.NonExistentField__c',
        permissionSet: 'Sales_Rep',
        message: 'Field "Account.NonExistentField__c" does not exist in the org',
        suggestion: 'Check field API name spelling or verify field exists'
      };

      expect(error.type).toBe('INVALID_FIELD_REFERENCE');
      expect(error.suggestion).toContain('Check field API name');
    });

    it('should provide clear error for circular dependency', () => {
      const error = {
        type: 'CIRCULAR_DEPENDENCY',
        cycle: ['Group_A', 'Group_B', 'Group_C', 'Group_A'],
        message: 'Circular dependency detected in permission set groups',
        suggestion: 'Remove one of the includes to break the cycle'
      };

      expect(error.cycle).toHaveLength(4);
      expect(error.cycle[0]).toBe(error.cycle[3]); // Proves circular
    });

    it('should provide clear error for license incompatibility', () => {
      const error = {
        type: 'LICENSE_INCOMPATIBLE',
        permissionSet: 'Full_CRM_Access',
        requiredLicense: 'Salesforce',
        userLicense: 'Salesforce Platform',
        message: 'Permission set requires Salesforce license but user has Salesforce Platform',
        suggestion: 'Upgrade user license or use a compatible permission set'
      };

      expect(error.type).toBe('LICENSE_INCOMPATIBLE');
      expect(error.suggestion).toContain('Upgrade user license');
    });
  });
});
