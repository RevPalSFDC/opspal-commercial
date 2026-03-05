/**
 * Test Suite: Safe Query Executor
 *
 * Tests the null-safe wrappers and validation for Salesforce query execution.
 * Prevents common errors from null child relationships and malformed SOQL.
 *
 * Coverage Target: >90%
 * Priority: Tier 1 (Critical - Called by 40+ scripts)
 */

const assert = require('assert');

// Import the module under test
const {
  safeChildRecords,
  safeFieldValue,
  validateSOQL,
  cleanSOQL,
  hasRecords,
  getRecordCount
} = require('../scripts/lib/safe-query-executor');

describe('SafeQueryExecutor', () => {
  describe('safeChildRecords()', () => {
    describe('null/undefined handling', () => {
      it('should return empty array for null input', () => {
        const result = safeChildRecords(null);
        assert.deepStrictEqual(result, []);
      });

      it('should return empty array for undefined input', () => {
        const result = safeChildRecords(undefined);
        assert.deepStrictEqual(result, []);
      });

      it('should return custom default value when provided', () => {
        const defaultVal = [{ id: 'default' }];
        const result = safeChildRecords(null, defaultVal);
        assert.deepStrictEqual(result, defaultVal);
      });
    });

    describe('array input handling', () => {
      it('should return array as-is when input is already array', () => {
        const input = [{ Id: '001' }, { Id: '002' }];
        const result = safeChildRecords(input);
        assert.deepStrictEqual(result, input);
      });

      it('should return empty array input as-is', () => {
        const input = [];
        const result = safeChildRecords(input);
        assert.deepStrictEqual(result, input);
      });
    });

    describe('relationship object handling', () => {
      it('should extract records array from relationship object', () => {
        const relationshipObject = {
          totalSize: 2,
          done: true,
          records: [{ Id: '001' }, { Id: '002' }]
        };
        const result = safeChildRecords(relationshipObject);
        assert.deepStrictEqual(result, [{ Id: '001' }, { Id: '002' }]);
      });

      it('should return empty array for relationship with null records', () => {
        const relationshipObject = {
          totalSize: 0,
          done: true,
          records: null
        };
        const result = safeChildRecords(relationshipObject);
        assert.deepStrictEqual(result, []);
      });

      it('should return default for relationship with non-array records', () => {
        const relationshipObject = {
          records: 'not an array'
        };
        const result = safeChildRecords(relationshipObject);
        assert.deepStrictEqual(result, []);
      });

      it('should return default for object without records property', () => {
        const relationshipObject = {
          totalSize: 0,
          done: true
        };
        const result = safeChildRecords(relationshipObject);
        assert.deepStrictEqual(result, []);
      });
    });

    describe('real-world CPQ patterns', () => {
      it('should safely access SBQQ__PriceConditions__r', () => {
        // Simulate a price rule with child conditions
        const priceRule = {
          Id: 'a0x000000FAKE',
          Name: 'Test Price Rule',
          SBQQ__PriceConditions__r: {
            records: [
              { Id: 'cond1', SBQQ__Field__c: 'Amount' },
              { Id: 'cond2', SBQQ__Field__c: 'Quantity' }
            ]
          }
        };

        const conditions = safeChildRecords(priceRule.SBQQ__PriceConditions__r);
        assert.strictEqual(conditions.length, 2);
        assert.strictEqual(conditions[0].SBQQ__Field__c, 'Amount');
      });

      it('should safely handle null child relationship on CPQ object', () => {
        const priceRule = {
          Id: 'a0x000000FAKE',
          Name: 'Test Price Rule',
          SBQQ__PriceConditions__r: null
        };

        const conditions = safeChildRecords(priceRule.SBQQ__PriceConditions__r);
        assert.deepStrictEqual(conditions, []);
      });
    });
  });

  describe('safeFieldValue()', () => {
    describe('null/undefined handling', () => {
      it('should return default for null object', () => {
        const result = safeFieldValue(null, 'Field');
        assert.strictEqual(result, null);
      });

      it('should return default for undefined object', () => {
        const result = safeFieldValue(undefined, 'Field');
        assert.strictEqual(result, null);
      });

      it('should return default for null path', () => {
        const result = safeFieldValue({ Field: 'value' }, null);
        assert.strictEqual(result, null);
      });

      it('should return custom default when provided', () => {
        const result = safeFieldValue(null, 'Field', 'custom');
        assert.strictEqual(result, 'custom');
      });
    });

    describe('simple field access', () => {
      it('should access direct field value', () => {
        const obj = { Name: 'Test Account', Type: 'Customer' };
        const result = safeFieldValue(obj, 'Name');
        assert.strictEqual(result, 'Test Account');
      });

      it('should return null for missing field', () => {
        const obj = { Name: 'Test' };
        const result = safeFieldValue(obj, 'MissingField');
        assert.strictEqual(result, null);
      });
    });

    describe('nested field access', () => {
      it('should access nested field value', () => {
        const obj = {
          Account: {
            Owner: {
              Name: 'John Doe'
            }
          }
        };
        const result = safeFieldValue(obj, 'Account.Owner.Name');
        assert.strictEqual(result, 'John Doe');
      });

      it('should return default for missing intermediate field', () => {
        const obj = {
          Account: null
        };
        const result = safeFieldValue(obj, 'Account.Owner.Name', 'Unknown');
        assert.strictEqual(result, 'Unknown');
      });

      it('should return default for partially missing path', () => {
        const obj = {
          Account: {
            Owner: null
          }
        };
        const result = safeFieldValue(obj, 'Account.Owner.Name');
        assert.strictEqual(result, null);
      });

      it('should handle deep nesting', () => {
        const obj = {
          Level1: {
            Level2: {
              Level3: {
                Level4: {
                  Value: 'deep'
                }
              }
            }
          }
        };
        const result = safeFieldValue(obj, 'Level1.Level2.Level3.Level4.Value');
        assert.strictEqual(result, 'deep');
      });
    });

    describe('edge cases', () => {
      it('should handle empty string path', () => {
        const obj = { Field: 'value' };
        const result = safeFieldValue(obj, '');
        assert.strictEqual(result, null);
      });

      it('should handle field with falsy value (0)', () => {
        const obj = { Count: 0 };
        const result = safeFieldValue(obj, 'Count', 'default');
        assert.strictEqual(result, 0);
      });

      it('should handle field with falsy value (empty string)', () => {
        const obj = { Name: '' };
        const result = safeFieldValue(obj, 'Name', 'default');
        assert.strictEqual(result, '');
      });

      it('should handle field with falsy value (false)', () => {
        const obj = { IsActive: false };
        const result = safeFieldValue(obj, 'IsActive', true);
        assert.strictEqual(result, false);
      });
    });
  });

  describe('validateSOQL()', () => {
    describe('valid queries', () => {
      it('should validate simple SELECT query', () => {
        const query = 'SELECT Id, Name FROM Account';
        const result = validateSOQL(query);
        assert.strictEqual(result.valid, true);
        assert.deepStrictEqual(result.errors, []);
      });

      it('should validate query with WHERE clause', () => {
        const query = 'SELECT Id FROM Account WHERE Type = \'Customer\'';
        const result = validateSOQL(query);
        assert.strictEqual(result.valid, true);
      });

      it('should validate query with ORDER BY', () => {
        const query = 'SELECT Id FROM Account ORDER BY Name ASC';
        const result = validateSOQL(query);
        assert.strictEqual(result.valid, true);
      });

      it('should validate query with LIMIT', () => {
        const query = 'SELECT Id FROM Account LIMIT 100';
        const result = validateSOQL(query);
        assert.strictEqual(result.valid, true);
      });

      it('should validate query with subquery', () => {
        const query = 'SELECT Id, (SELECT Id, Name FROM Contacts) FROM Account';
        const result = validateSOQL(query);
        assert.strictEqual(result.valid, true);
      });

      it('should validate complex query with multiple clauses', () => {
        const query = `
          SELECT Id, Name, Type,
            (SELECT Id, Email FROM Contacts WHERE Email != null)
          FROM Account
          WHERE Type = 'Customer'
          ORDER BY Name
          LIMIT 50
        `;
        const result = validateSOQL(query);
        assert.strictEqual(result.valid, true);
      });
    });

    describe('invalid queries', () => {
      it('should detect trailing comma in SELECT clause', () => {
        const query = 'SELECT Id, Name, FROM Account';
        const result = validateSOQL(query);
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('trailing comma')));
      });

      it('should detect consecutive commas in SELECT', () => {
        const query = 'SELECT Id,, Name FROM Account';
        const result = validateSOQL(query);
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('consecutive commas') || e.includes('empty items')));
      });

      it('should detect dangling AND at end of WHERE', () => {
        const query = 'SELECT Id FROM Account WHERE Type = \'Customer\' AND';
        const result = validateSOQL(query);
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('dangling AND/OR')));
      });

      it('should detect dangling OR at end of WHERE', () => {
        const query = 'SELECT Id FROM Account WHERE Type = \'Customer\' OR';
        const result = validateSOQL(query);
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('dangling AND/OR')));
      });

      it('should detect WHERE starting with AND', () => {
        const query = 'SELECT Id FROM Account WHERE AND Type = \'Customer\'';
        const result = validateSOQL(query);
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('starts with AND/OR')));
      });

      it('should detect empty subquery SELECT', () => {
        const query = 'SELECT Id, (SELECT FROM Contacts) FROM Account';
        const result = validateSOQL(query);
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('empty SELECT')));
      });

      it('should detect unbalanced parentheses (more open)', () => {
        const query = 'SELECT Id FROM Account WHERE (Type = \'Customer\'';
        const result = validateSOQL(query);
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('Unbalanced parentheses')));
      });

      it('should detect unbalanced parentheses (more close)', () => {
        const query = 'SELECT Id FROM Account WHERE Type = \'Customer\')';
        const result = validateSOQL(query);
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('Unbalanced parentheses')));
      });

      it('should detect missing SELECT...FROM structure', () => {
        const query = 'Id, Name Account';
        const result = validateSOQL(query);
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('missing required SELECT...FROM')));
      });
    });

    describe('null/undefined input', () => {
      it('should return invalid for null query', () => {
        const result = validateSOQL(null);
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('non-empty string')));
      });

      it('should return invalid for undefined query', () => {
        const result = validateSOQL(undefined);
        assert.strictEqual(result.valid, false);
      });

      it('should return invalid for empty string', () => {
        const result = validateSOQL('');
        assert.strictEqual(result.valid, false);
      });

      it('should return invalid for non-string input', () => {
        const result = validateSOQL(123);
        assert.strictEqual(result.valid, false);
      });
    });
  });

  describe('cleanSOQL()', () => {
    it('should remove trailing comma before FROM', () => {
      const dirty = 'SELECT Id, Name, FROM Account';
      const clean = cleanSOQL(dirty);
      assert.ok(!clean.includes(', FROM'));
      assert.ok(clean.includes('FROM Account'));
    });

    it('should remove double commas', () => {
      const dirty = 'SELECT Id,, Name FROM Account';
      const clean = cleanSOQL(dirty);
      assert.ok(!clean.includes(',,'));
    });

    it('should remove trailing AND before ORDER', () => {
      const dirty = 'SELECT Id FROM Account WHERE Type = \'Customer\' AND ORDER BY Name';
      const clean = cleanSOQL(dirty);
      assert.ok(!clean.includes('AND ORDER'));
      assert.ok(clean.includes('ORDER BY'));
    });

    it('should normalize whitespace', () => {
      const dirty = 'SELECT   Id,    Name   FROM   Account';
      const clean = cleanSOQL(dirty);
      assert.ok(!clean.includes('   '));
    });

    it('should handle multiline query', () => {
      const dirty = `
        SELECT
          Id,
          Name,
        FROM Account
      `;
      const clean = cleanSOQL(dirty);
      assert.ok(!clean.includes(', FROM'));
    });
  });

  describe('hasRecords()', () => {
    it('should return true for result with records', () => {
      const result = { records: [{ Id: '001' }] };
      assert.strictEqual(hasRecords(result), true);
    });

    it('should return false for empty records array', () => {
      const result = { records: [] };
      assert.strictEqual(hasRecords(result), false);
    });

    it('should return falsy for null result', () => {
      // hasRecords returns falsy value (null/undefined/false) for invalid input
      assert.ok(!hasRecords(null));
    });

    it('should return falsy for undefined result', () => {
      assert.ok(!hasRecords(undefined));
    });

    it('should return falsy for result without records property', () => {
      const result = { data: [{ Id: '001' }] };
      assert.ok(!hasRecords(result));
    });

    it('should return falsy for null records', () => {
      const result = { records: null };
      assert.ok(!hasRecords(result));
    });
  });

  describe('getRecordCount()', () => {
    it('should return correct count for records array', () => {
      const result = { records: [{ Id: '001' }, { Id: '002' }, { Id: '003' }] };
      assert.strictEqual(getRecordCount(result), 3);
    });

    it('should return 0 for empty records array', () => {
      const result = { records: [] };
      assert.strictEqual(getRecordCount(result), 0);
    });

    it('should return 0 for null result', () => {
      assert.strictEqual(getRecordCount(null), 0);
    });

    it('should return 0 for undefined result', () => {
      assert.strictEqual(getRecordCount(undefined), 0);
    });

    it('should return 0 for null records', () => {
      const result = { records: null };
      assert.strictEqual(getRecordCount(result), 0);
    });

    it('should return 0 for non-array records', () => {
      const result = { records: 'not an array' };
      assert.strictEqual(getRecordCount(result), 0);
    });
  });

  describe('Integration Scenarios', () => {
    describe('CPQ Query Pattern', () => {
      it('should safely extract price conditions from nested query result', () => {
        // Simulate typical CPQ query result with child relationships
        const queryResult = {
          records: [
            {
              Id: 'rule1',
              Name: 'Volume Discount',
              SBQQ__PriceConditions__r: {
                totalSize: 2,
                done: true,
                records: [
                  { Id: 'cond1', SBQQ__Field__c: 'SBQQ__Quantity__c', SBQQ__Operator__c: 'greater than' },
                  { Id: 'cond2', SBQQ__Field__c: 'SBQQ__Quantity__c', SBQQ__Operator__c: 'less than' }
                ]
              }
            },
            {
              Id: 'rule2',
              Name: 'Partner Discount',
              SBQQ__PriceConditions__r: null // No conditions
            }
          ]
        };

        // Process each rule safely
        let totalConditions = 0;
        queryResult.records.forEach(rule => {
          const conditions = safeChildRecords(rule.SBQQ__PriceConditions__r);
          totalConditions += conditions.length;
        });

        assert.strictEqual(totalConditions, 2);
      });
    });

    describe('RevOps Query Pattern', () => {
      it('should safely access nested owner information', () => {
        const opportunities = [
          {
            Id: 'opp1',
            Name: 'Big Deal',
            Owner: {
              Name: 'John Doe',
              Email: 'john@example.com'
            }
          },
          {
            Id: 'opp2',
            Name: 'Orphaned Opp',
            Owner: null // No owner assigned
          }
        ];

        const ownerNames = opportunities.map(opp =>
          safeFieldValue(opp, 'Owner.Name', 'Unassigned')
        );

        assert.deepStrictEqual(ownerNames, ['John Doe', 'Unassigned']);
      });
    });
  });
});
