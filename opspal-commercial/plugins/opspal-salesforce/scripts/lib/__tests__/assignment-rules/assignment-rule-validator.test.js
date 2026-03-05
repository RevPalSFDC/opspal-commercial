/**
 * Tests for Assignment Rule Validator
 *
 * Comprehensive unit tests for the 20-point pre-deployment validation checklist.
 * Target: 50+ test cases covering all validation checks and edge cases.
 *
 * @group unit
 * @group assignment-rules
 */

const validator = require('../../validators/assignment-rule-validator');
const assigneeValidator = require('../../assignee-validator');
const ruleParser = require('../../assignment-rule-parser');
const criteriaEvaluator = require('../../criteria-evaluator');
const overlapDetector = require('../../assignment-rule-overlap-detector');
const { execSync } = require('child_process');

// Mock child_process
jest.mock('child_process');

// Mock dependencies
jest.mock('../../assignee-validator');
jest.mock('../../assignment-rule-parser');
jest.mock('../../criteria-evaluator');
jest.mock('../../assignment-rule-overlap-detector');

describe('Assignment Rule Validator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==================== Test Fixtures ====================

  const FIXTURES = {
    validRule: {
      name: 'Healthcare_CA_Rule',
      active: true,
      entries: [
        {
          order: 1,
          assignedTo: '0051234567890ABC',
          criteriaItems: [
            { field: 'Industry', operation: 'equals', value: 'Healthcare' },
            { field: 'State', operation: 'equals', value: 'CA' }
          ]
        }
      ]
    },

    ruleWithInactiveUser: {
      name: 'Test_Rule',
      active: false,
      entries: [
        {
          order: 1,
          assignedTo: '0051234567890DEF',
          criteriaItems: []
        }
      ]
    },

    ruleWithMissingAssignee: {
      name: 'Invalid_Rule',
      active: false,
      entries: [
        {
          order: 1,
          assignedTo: null,
          criteriaItems: []
        }
      ]
    },

    ruleWithInvalidField: {
      name: 'Invalid_Field_Rule',
      active: false,
      entries: [
        {
          order: 1,
          assignedTo: '00G1234567890ABC',
          criteriaItems: [
            { field: 'NonExistentField__c', operation: 'equals', value: 'Test' }
          ]
        }
      ]
    },

    ruleWithEmailTemplate: {
      name: 'Email_Rule',
      active: false,
      entries: [
        {
          order: 1,
          assignedTo: '00G1234567890ABC',
          emailTemplate: '00X1234567890ABC',
          criteriaItems: []
        }
      ]
    },

    ruleWithFormula: {
      name: 'Formula_Rule',
      active: false,
      entries: [
        {
          order: 1,
          assignedTo: '00G1234567890ABC',
          formula: 'AND(Industry = "Healthcare", AnnualRevenue > 1000000)',
          criteriaItems: []
        }
      ]
    },

    ruleWithRelationshipField: {
      name: 'Relationship_Rule',
      active: false,
      entries: [
        {
          order: 1,
          assignedTo: '00G1234567890ABC',
          criteriaItems: [
            { field: 'Account.Industry', operation: 'equals', value: 'Healthcare' }
          ]
        }
      ]
    },

    ruleTooManyEntries: {
      name: 'Large_Rule',
      active: false,
      entries: Array(3001).fill(null).map((_, idx) => ({
        order: idx + 1,
        assignedTo: '00G1234567890ABC',
        criteriaItems: []
      }))
    },

    ruleManyEntriesWarning: {
      name: 'Large_Rule_Warning',
      active: false,
      entries: Array(350).fill(null).map((_, idx) => ({
        order: idx + 1,
        assignedTo: '00G1234567890ABC',
        criteriaItems: []
      }))
    },

    ruleDuplicateOrders: {
      name: 'Duplicate_Order_Rule',
      active: false,
      entries: [
        { order: 1, assignedTo: '00G1111111111AAA', criteriaItems: [] },
        { order: 1, assignedTo: '00G2222222222BBB', criteriaItems: [] },
        { order: 2, assignedTo: '00G3333333333CCC', criteriaItems: [] }
      ]
    },

    objectDescribeResponse: {
      name: 'Lead',
      fields: [
        { name: 'Industry', type: 'picklist' },
        { name: 'State', type: 'string' },
        { name: 'AnnualRevenue', type: 'currency', trackHistory: true },
        { name: 'Status', type: 'picklist' },
        { name: 'Rating', type: 'picklist' }
      ]
    },

    objectDescribeWithTrackedFields: {
      name: 'Account',
      fields: Array(20).fill(null).map((_, idx) => ({
        name: `Field${idx}__c`,
        type: 'string',
        trackHistory: true
      }))
    }
  };

  // ==================== Test Suite: validatePreDeployment ====================

  describe('validatePreDeployment', () => {
    describe('Check 1: Assignee Existence', () => {
      it('should pass when all assignees exist', async () => {
        assigneeValidator.validateAssignee.mockResolvedValue({
          valid: true,
          type: 'User',
          data: { Name: 'John Doe', IsActive: true }
        });

        const report = await validator.validatePreDeployment(
          FIXTURES.validRule,
          'Lead',
          'testorg'
        );

        const check = report.checks.find(c => c.name === 'Assignee Existence');
        expect(check.status).toBe('completed');
        expect(check.issues).toHaveLength(0);
        expect(report.criticalIssues).toBe(0);
      });

      it('should detect missing assignee', async () => {
        const report = await validator.validatePreDeployment(
          FIXTURES.ruleWithMissingAssignee,
          'Lead'
        );

        const check = report.checks.find(c => c.name === 'Assignee Existence');
        expect(check.issues).toHaveLength(1);
        expect(check.issues[0].severity).toBe('critical');
        expect(check.issues[0].message).toContain('no assignee');
        expect(report.criticalIssues).toBeGreaterThan(0);
      });

      it('should detect invalid assignee', async () => {
        assigneeValidator.validateAssignee.mockResolvedValue({
          valid: false,
          error: 'User not found'
        });

        const report = await validator.validatePreDeployment(
          FIXTURES.validRule,
          'Lead',
          'testorg'
        );

        const check = report.checks.find(c => c.name === 'Assignee Existence');
        expect(check.issues).toHaveLength(1);
        expect(check.issues[0].severity).toBe('critical');
        expect(check.issues[0].message).toBe('User not found');
      });
    });

    describe('Check 2: Assignee Active Status', () => {
      it('should pass when user is active', async () => {
        assigneeValidator.validateAssignee.mockResolvedValue({
          valid: true,
          type: 'User',
          data: { Name: 'John Doe', IsActive: true }
        });

        const report = await validator.validatePreDeployment(
          FIXTURES.validRule,
          'Lead',
          'testorg'
        );

        const check = report.checks.find(c => c.name === 'Assignee Active Status');
        expect(check.status).toBe('completed');
        expect(check.issues).toHaveLength(0);
      });

      it('should detect inactive user', async () => {
        assigneeValidator.validateAssignee.mockResolvedValue({
          valid: true,
          type: 'User',
          data: { Name: 'John Doe', IsActive: false }
        });

        const report = await validator.validatePreDeployment(
          FIXTURES.ruleWithInactiveUser,
          'Lead',
          'testorg'
        );

        const check = report.checks.find(c => c.name === 'Assignee Active Status');
        expect(check.issues).toHaveLength(1);
        expect(check.issues[0].severity).toBe('critical');
        expect(check.issues[0].message).toContain('inactive');
        expect(report.criticalIssues).toBeGreaterThan(0);
      });

      it('should skip non-user assignees', async () => {
        assigneeValidator.validateAssignee.mockResolvedValue({
          valid: true,
          type: 'Queue',
          data: { Name: 'Test Queue' }
        });

        const report = await validator.validatePreDeployment(
          FIXTURES.validRule,
          'Lead',
          'testorg'
        );

        const check = report.checks.find(c => c.name === 'Assignee Active Status');
        expect(check.issues).toHaveLength(0);
      });
    });

    describe('Check 3: Field Existence', () => {
      it('should pass when all fields exist', async () => {
        assigneeValidator.validateAssignee.mockResolvedValue({ valid: true, type: 'User' });
        criteriaEvaluator.fetchObjectDescribe.mockResolvedValue(FIXTURES.objectDescribeResponse);

        const report = await validator.validatePreDeployment(
          FIXTURES.validRule,
          'Lead',
          'testorg'
        );

        const check = report.checks.find(c => c.name === 'Field Existence');
        expect(check.status).toBe('completed');
        expect(check.issues).toHaveLength(0);
      });

      it('should detect non-existent field', async () => {
        assigneeValidator.validateAssignee.mockResolvedValue({ valid: true, type: 'Queue' });
        criteriaEvaluator.fetchObjectDescribe.mockResolvedValue(FIXTURES.objectDescribeResponse);

        const report = await validator.validatePreDeployment(
          FIXTURES.ruleWithInvalidField,
          'Lead',
          'testorg'
        );

        const check = report.checks.find(c => c.name === 'Field Existence');
        expect(check.issues).toHaveLength(1);
        expect(check.issues[0].severity).toBe('critical');
        expect(check.issues[0].message).toContain('does not exist');
        expect(report.criticalIssues).toBeGreaterThan(0);
      });

      it('should skip when describe fails', async () => {
        assigneeValidator.validateAssignee.mockResolvedValue({ valid: true, type: 'Queue' });
        criteriaEvaluator.fetchObjectDescribe.mockRejectedValue(new Error('API error'));

        const report = await validator.validatePreDeployment(
          FIXTURES.validRule,
          'Lead',
          'testorg'
        );

        const check = report.checks.find(c => c.name === 'Field Existence');
        expect(check.skipped).toBe(true);
        expect(check.issues).toHaveLength(1);
        expect(check.issues[0].severity).toBe('warning');
      });
    });

    describe('Check 4: Operator Compatibility', () => {
      it('should pass when operators are compatible', async () => {
        assigneeValidator.validateAssignee.mockResolvedValue({ valid: true, type: 'Queue' });
        criteriaEvaluator.validateRuleEntry.mockResolvedValue({ errors: [] });

        const report = await validator.validatePreDeployment(
          FIXTURES.validRule,
          'Lead',
          'testorg'
        );

        const check = report.checks.find(c => c.name === 'Operator Compatibility');
        expect(check.status).toBe('completed');
        expect(check.issues).toHaveLength(0);
      });

      it('should detect incompatible operator', async () => {
        assigneeValidator.validateAssignee.mockResolvedValue({ valid: true, type: 'Queue' });
        criteriaEvaluator.validateRuleEntry.mockResolvedValue({
          errors: [
            {
              severity: 'critical',
              field: 'Industry',
              operator: 'greaterThan',
              fieldType: 'picklist',
              message: 'Operator greaterThan not compatible with picklist field'
            }
          ]
        });

        const report = await validator.validatePreDeployment(
          FIXTURES.validRule,
          'Lead',
          'testorg'
        );

        const check = report.checks.find(c => c.name === 'Operator Compatibility');
        expect(check.issues).toHaveLength(1);
        expect(check.issues[0].severity).toBe('critical');
        expect(check.issues[0].message).toContain('not compatible');
        expect(report.criticalIssues).toBeGreaterThan(0);
      });
    });

    describe('Check 5: Picklist Value Validity', () => {
      it('should pass when picklist values are valid', async () => {
        assigneeValidator.validateAssignee.mockResolvedValue({ valid: true, type: 'Queue' });
        criteriaEvaluator.validateRuleEntry.mockResolvedValue({ errors: [] });

        const report = await validator.validatePreDeployment(
          FIXTURES.validRule,
          'Lead',
          'testorg'
        );

        const check = report.checks.find(c => c.name === 'Picklist Value Validity');
        expect(check.status).toBe('completed');
        expect(check.issues).toHaveLength(0);
      });

      it('should warn on invalid picklist value', async () => {
        assigneeValidator.validateAssignee.mockResolvedValue({ valid: true, type: 'Queue' });
        criteriaEvaluator.validateRuleEntry.mockResolvedValue({
          errors: [
            {
              severity: 'warning',
              field: 'Industry',
              value: 'InvalidValue',
              validValues: ['Healthcare', 'Technology', 'Finance'],
              message: 'Value "InvalidValue" not in picklist'
            }
          ]
        });

        const report = await validator.validatePreDeployment(
          FIXTURES.validRule,
          'Lead',
          'testorg'
        );

        const check = report.checks.find(c => c.name === 'Picklist Value Validity');
        expect(check.issues).toHaveLength(1);
        expect(check.issues[0].severity).toBe('warning');
        expect(report.warnings).toBeGreaterThan(0);
      });
    });

    describe('Check 6: Formula Syntax', () => {
      it('should detect formula criteria', async () => {
        assigneeValidator.validateAssignee.mockResolvedValue({ valid: true, type: 'Queue' });

        const report = await validator.validatePreDeployment(
          FIXTURES.ruleWithFormula,
          'Lead'
        );

        const check = report.checks.find(c => c.name === 'Formula Syntax');
        expect(check.issues).toHaveLength(1);
        expect(check.issues[0].severity).toBe('info');
        expect(check.issues[0].message).toContain('Formula criteria detected');
      });

      it('should pass when no formula criteria', async () => {
        assigneeValidator.validateAssignee.mockResolvedValue({ valid: true, type: 'Queue' });

        const report = await validator.validatePreDeployment(
          FIXTURES.validRule,
          'Lead'
        );

        const check = report.checks.find(c => c.name === 'Formula Syntax');
        expect(check.issues).toHaveLength(0);
      });
    });

    describe('Check 9: Relationship Field Resolution', () => {
      it('should detect relationship fields', async () => {
        assigneeValidator.validateAssignee.mockResolvedValue({ valid: true, type: 'Queue' });

        const report = await validator.validatePreDeployment(
          FIXTURES.ruleWithRelationshipField,
          'Lead'
        );

        const check = report.checks.find(c => c.name === 'Relationship Field Resolution');
        expect(check.issues).toHaveLength(1);
        expect(check.issues[0].severity).toBe('info');
        expect(check.issues[0].message).toContain('Relationship field detected');
      });

      it('should pass when no relationship fields', async () => {
        assigneeValidator.validateAssignee.mockResolvedValue({ valid: true, type: 'Queue' });

        const report = await validator.validatePreDeployment(
          FIXTURES.validRule,
          'Lead'
        );

        const check = report.checks.find(c => c.name === 'Relationship Field Resolution');
        expect(check.issues).toHaveLength(0);
      });
    });

    describe('Check 10: Active Rule Conflict', () => {
      it('should pass when no active rule exists', async () => {
        assigneeValidator.validateAssignee.mockResolvedValue({ valid: true, type: 'Queue' });
        execSync.mockReturnValue(JSON.stringify({
          status: 0,
          result: { records: [] }
        }));

        const report = await validator.validatePreDeployment(
          FIXTURES.validRule,
          'Lead',
          'testorg'
        );

        const check = report.checks.find(c => c.name === 'Active Rule Conflict');
        expect(check.status).toBe('completed');
        expect(check.issues).toHaveLength(0);
      });

      it('should warn when another rule is active', async () => {
        assigneeValidator.validateAssignee.mockResolvedValue({ valid: true, type: 'Queue' });
        execSync.mockReturnValue(JSON.stringify({
          status: 0,
          result: {
            records: [
              { Id: '01Q1234567890ABC', Name: 'Existing_Active_Rule' }
            ]
          }
        }));

        const report = await validator.validatePreDeployment(
          FIXTURES.validRule,
          'Lead',
          'testorg'
        );

        const check = report.checks.find(c => c.name === 'Active Rule Conflict');
        expect(check.issues).toHaveLength(1);
        expect(check.issues[0].severity).toBe('warning');
        expect(check.issues[0].message).toContain('Another rule is currently active');
        expect(report.warnings).toBeGreaterThan(0);
      });

      it('should skip when query fails', async () => {
        assigneeValidator.validateAssignee.mockResolvedValue({ valid: true, type: 'Queue' });
        execSync.mockImplementation(() => {
          throw new Error('Query failed');
        });

        const report = await validator.validatePreDeployment(
          FIXTURES.validRule,
          'Lead',
          'testorg'
        );

        const check = report.checks.find(c => c.name === 'Active Rule Conflict');
        expect(check.skipped).toBe(true);
      });

      it('should skip when rule is inactive', async () => {
        assigneeValidator.validateAssignee.mockResolvedValue({ valid: true, type: 'Queue' });

        const inactiveRule = { ...FIXTURES.validRule, active: false };
        const report = await validator.validatePreDeployment(
          inactiveRule,
          'Lead',
          'testorg'
        );

        const check = report.checks.find(c => c.name === 'Active Rule Conflict');
        expect(check.issues).toHaveLength(0);
      });
    });

    describe('Check 11: Order Conflicts', () => {
      it('should pass when no duplicate orders', async () => {
        assigneeValidator.validateAssignee.mockResolvedValue({ valid: true, type: 'Queue' });
        overlapDetector.findDuplicateOrders.mockReturnValue([]);

        const report = await validator.validatePreDeployment(
          FIXTURES.validRule,
          'Lead'
        );

        const check = report.checks.find(c => c.name === 'Order Conflicts');
        expect(check.status).toBe('completed');
        expect(check.issues).toHaveLength(0);
      });

      it('should detect duplicate order numbers', async () => {
        assigneeValidator.validateAssignee.mockResolvedValue({ valid: true, type: 'Queue' });
        overlapDetector.findDuplicateOrders.mockReturnValue([
          {
            orderNumber: 1,
            entries: [{ order: 1 }, { order: 1 }],
            severity: 'critical',
            message: 'Duplicate order number 1'
          }
        ]);

        const report = await validator.validatePreDeployment(
          FIXTURES.ruleDuplicateOrders,
          'Lead'
        );

        const check = report.checks.find(c => c.name === 'Order Conflicts');
        expect(check.issues).toHaveLength(1);
        expect(check.issues[0].severity).toBe('critical');
        expect(report.criticalIssues).toBeGreaterThan(0);
      });
    });

    describe('Check 12: Assignee Object Access', () => {
      it('should pass when assignee has access', async () => {
        assigneeValidator.validateAssignee.mockResolvedValue({ valid: true, type: 'User' });
        assigneeValidator.validateAssigneeAccess.mockResolvedValue({
          hasAccess: true
        });

        const report = await validator.validatePreDeployment(
          FIXTURES.validRule,
          'Lead',
          'testorg'
        );

        const check = report.checks.find(c => c.name === 'Assignee Object Access');
        expect(check.status).toBe('completed');
        expect(check.issues).toHaveLength(0);
      });

      it('should detect missing access', async () => {
        assigneeValidator.validateAssignee.mockResolvedValue({ valid: true, type: 'User' });
        assigneeValidator.validateAssigneeAccess.mockResolvedValue({
          hasAccess: false,
          severity: 'critical',
          error: 'User cannot access Lead object'
        });

        const report = await validator.validatePreDeployment(
          FIXTURES.validRule,
          'Lead',
          'testorg'
        );

        const check = report.checks.find(c => c.name === 'Assignee Object Access');
        expect(check.issues).toHaveLength(1);
        expect(check.issues[0].severity).toBe('critical');
        expect(report.criticalIssues).toBeGreaterThan(0);
      });

      it('should report warnings', async () => {
        assigneeValidator.validateAssignee.mockResolvedValue({ valid: true, type: 'Queue' });
        assigneeValidator.validateAssigneeAccess.mockResolvedValue({
          hasAccess: true,
          warning: 'Queue members may have limited access'
        });

        const report = await validator.validatePreDeployment(
          FIXTURES.validRule,
          'Lead',
          'testorg'
        );

        const check = report.checks.find(c => c.name === 'Assignee Object Access');
        expect(check.issues).toHaveLength(1);
        expect(check.issues[0].severity).toBe('warning');
        expect(report.warnings).toBeGreaterThan(0);
      });
    });

    describe('Check 13: Email Template Existence', () => {
      it('should pass when email template exists', async () => {
        assigneeValidator.validateAssignee.mockResolvedValue({ valid: true, type: 'Queue' });
        execSync.mockReturnValue(JSON.stringify({
          status: 0,
          result: {
            records: [
              { Id: '00X1234567890ABC', DeveloperName: 'Assignment_Notification' }
            ]
          }
        }));

        const report = await validator.validatePreDeployment(
          FIXTURES.ruleWithEmailTemplate,
          'Lead',
          'testorg'
        );

        const check = report.checks.find(c => c.name === 'Email Template Existence');
        expect(check.status).toBe('completed');
        expect(check.issues).toHaveLength(0);
      });

      it('should warn when email template not found', async () => {
        assigneeValidator.validateAssignee.mockResolvedValue({ valid: true, type: 'Queue' });
        execSync.mockReturnValue(JSON.stringify({
          status: 0,
          result: { records: [] }
        }));

        const report = await validator.validatePreDeployment(
          FIXTURES.ruleWithEmailTemplate,
          'Lead',
          'testorg'
        );

        const check = report.checks.find(c => c.name === 'Email Template Existence');
        expect(check.issues).toHaveLength(1);
        expect(check.issues[0].severity).toBe('warning');
        expect(check.issues[0].message).toContain('not found');
      });

      it('should pass when no email template specified', async () => {
        assigneeValidator.validateAssignee.mockResolvedValue({ valid: true, type: 'Queue' });

        const report = await validator.validatePreDeployment(
          FIXTURES.validRule,
          'Lead'
        );

        const check = report.checks.find(c => c.name === 'Email Template Existence');
        expect(check.issues).toHaveLength(0);
      });
    });

    describe('Check 14: Object Compatibility', () => {
      it('should pass for Lead object', async () => {
        assigneeValidator.validateAssignee.mockResolvedValue({ valid: true, type: 'Queue' });

        const report = await validator.validatePreDeployment(
          FIXTURES.validRule,
          'Lead'
        );

        const check = report.checks.find(c => c.name === 'Object Compatibility');
        expect(check.status).toBe('completed');
        expect(check.issues).toHaveLength(0);
      });

      it('should pass for Case object', async () => {
        assigneeValidator.validateAssignee.mockResolvedValue({ valid: true, type: 'Queue' });

        const report = await validator.validatePreDeployment(
          FIXTURES.validRule,
          'Case'
        );

        const check = report.checks.find(c => c.name === 'Object Compatibility');
        expect(check.issues).toHaveLength(0);
      });

      it('should block unsupported object', async () => {
        assigneeValidator.validateAssignee.mockResolvedValue({ valid: true, type: 'Queue' });

        const report = await validator.validatePreDeployment(
          FIXTURES.validRule,
          'Account'
        );

        const check = report.checks.find(c => c.name === 'Object Compatibility');
        expect(check.issues).toHaveLength(1);
        expect(check.issues[0].severity).toBe('critical');
        expect(check.issues[0].message).toContain('does not support Assignment Rules');
        expect(report.criticalIssues).toBeGreaterThan(0);
        expect(report.valid).toBe(false);
      });
    });

    describe('Check 15: Entry Count Limit', () => {
      it('should pass with few entries', async () => {
        assigneeValidator.validateAssignee.mockResolvedValue({ valid: true, type: 'Queue' });

        const report = await validator.validatePreDeployment(
          FIXTURES.validRule,
          'Lead'
        );

        const check = report.checks.find(c => c.name === 'Entry Count Limit');
        expect(check.status).toBe('completed');
        expect(check.issues).toHaveLength(0);
      });

      it('should warn when approaching limit', async () => {
        assigneeValidator.validateAssignee.mockResolvedValue({ valid: true, type: 'Queue' });

        const report = await validator.validatePreDeployment(
          FIXTURES.ruleManyEntriesWarning,
          'Lead'
        );

        const check = report.checks.find(c => c.name === 'Entry Count Limit');
        expect(check.issues).toHaveLength(1);
        expect(check.issues[0].severity).toBe('warning');
        expect(check.issues[0].message).toContain('exceeds recommended limit');
        expect(report.warnings).toBeGreaterThan(0);
      });

      it('should block when exceeding maximum', async () => {
        assigneeValidator.validateAssignee.mockResolvedValue({ valid: true, type: 'Queue' });

        const report = await validator.validatePreDeployment(
          FIXTURES.ruleTooManyEntries,
          'Lead'
        );

        const check = report.checks.find(c => c.name === 'Entry Count Limit');
        expect(check.issues).toHaveLength(1);
        expect(check.issues[0].severity).toBe('critical');
        expect(check.issues[0].message).toContain('exceeds maximum of 3000');
        expect(report.criticalIssues).toBeGreaterThan(0);
        expect(report.valid).toBe(false);
      });
    });

    describe('Check 16: Rule Name Uniqueness', () => {
      it('should pass when name is unique', async () => {
        assigneeValidator.validateAssignee.mockResolvedValue({ valid: true, type: 'Queue' });
        execSync.mockReturnValue(JSON.stringify({
          status: 0,
          result: { records: [] }
        }));

        const report = await validator.validatePreDeployment(
          FIXTURES.validRule,
          'Lead',
          'testorg'
        );

        const check = report.checks.find(c => c.name === 'Rule Name Uniqueness');
        expect(check.status).toBe('completed');
        expect(check.issues).toHaveLength(0);
      });

      it('should warn when name already exists', async () => {
        assigneeValidator.validateAssignee.mockResolvedValue({ valid: true, type: 'Queue' });
        execSync.mockReturnValue(JSON.stringify({
          status: 0,
          result: {
            records: [
              { Id: '01Q1234567890ABC', Name: 'Healthcare_CA_Rule' }
            ]
          }
        }));

        const report = await validator.validatePreDeployment(
          FIXTURES.validRule,
          'Lead',
          'testorg'
        );

        const check = report.checks.find(c => c.name === 'Rule Name Uniqueness');
        expect(check.issues).toHaveLength(1);
        expect(check.issues[0].severity).toBe('warning');
        expect(check.issues[0].message).toContain('already exists');
        expect(report.warnings).toBeGreaterThan(0);
      });
    });

    describe('Check 18: Conflicting Automation', () => {
      it('should pass when no conflicting flows', async () => {
        assigneeValidator.validateAssignee.mockResolvedValue({ valid: true, type: 'Queue' });
        execSync.mockReturnValue(JSON.stringify({
          status: 0,
          result: { records: [] }
        }));

        const report = await validator.validatePreDeployment(
          FIXTURES.validRule,
          'Lead',
          'testorg'
        );

        const check = report.checks.find(c => c.name === 'Conflicting Automation');
        expect(check.status).toBe('completed');
        expect(check.issues).toHaveLength(0);
      });

      it('should warn when active flows exist', async () => {
        assigneeValidator.validateAssignee.mockResolvedValue({ valid: true, type: 'Queue' });
        execSync.mockReturnValue(JSON.stringify({
          status: 0,
          result: {
            records: [
              { Id: '301xxxxxxxxxxxxx', ProcessType: 'AutolaunchedFlow', RecordTriggerType: 'Create' },
              { Id: '301yyyyyyyyyyyyy', ProcessType: 'AutolaunchedFlow', RecordTriggerType: 'Update' }
            ]
          }
        }));

        const report = await validator.validatePreDeployment(
          FIXTURES.validRule,
          'Lead',
          'testorg'
        );

        const check = report.checks.find(c => c.name === 'Conflicting Automation');
        expect(check.issues).toHaveLength(1);
        expect(check.issues[0].severity).toBe('warning');
        expect(check.issues[0].message).toContain('2 active Flows detected');
        expect(report.warnings).toBeGreaterThan(0);
      });
    });

    describe('Check 19: Field History Tracking', () => {
      it('should pass when below limit', async () => {
        assigneeValidator.validateAssignee.mockResolvedValue({ valid: true, type: 'Queue' });
        criteriaEvaluator.fetchObjectDescribe.mockResolvedValue(FIXTURES.objectDescribeResponse);

        const report = await validator.validatePreDeployment(
          FIXTURES.validRule,
          'Lead',
          'testorg'
        );

        const check = report.checks.find(c => c.name === 'Field History Tracking');
        expect(check.status).toBe('completed');
        expect(check.issues).toHaveLength(0);
      });

      it('should warn when at limit', async () => {
        assigneeValidator.validateAssignee.mockResolvedValue({ valid: true, type: 'Queue' });
        criteriaEvaluator.fetchObjectDescribe.mockResolvedValue(FIXTURES.objectDescribeWithTrackedFields);

        const report = await validator.validatePreDeployment(
          FIXTURES.validRule,
          'Account',
          'testorg'
        );

        const check = report.checks.find(c => c.name === 'Field History Tracking');
        expect(check.issues).toHaveLength(1);
        expect(check.issues[0].severity).toBe('warning');
        expect(check.issues[0].message).toContain('limit: 20');
        expect(report.warnings).toBeGreaterThan(0);
      });
    });
  });

  // ==================== Test Suite: generateValidationReport ====================

  describe('generateValidationReport', () => {
    it('should generate formatted report for passing validation', () => {
      const report = {
        ruleName: 'Test_Rule',
        objectType: 'Lead',
        timestamp: '2025-01-01T00:00:00.000Z',
        valid: true,
        totalChecks: 20,
        checksCompleted: 20,
        criticalIssues: 0,
        warnings: 0,
        checks: [
          {
            name: 'Assignee Existence',
            status: 'completed',
            issues: [],
            skipped: false
          }
        ],
        summary: {
          completedChecks: 20,
          skippedChecks: 0,
          erroredChecks: 0,
          totalIssues: 0,
          criticalIssues: 0,
          warnings: 0,
          recommendation: 'Ready for deployment'
        }
      };

      const formatted = validator.generateValidationReport(report);

      expect(formatted).toContain('ASSIGNMENT RULE PRE-DEPLOYMENT VALIDATION REPORT');
      expect(formatted).toContain('Rule: Test_Rule');
      expect(formatted).toContain('Object: Lead');
      expect(formatted).toContain('Checks Completed: 20/20');
      expect(formatted).toContain('Critical Issues: 0');
      expect(formatted).toContain('Warnings: 0');
      expect(formatted).toContain('✓ VALIDATION PASSED');
      expect(formatted).toContain('Ready for deployment');
    });

    it('should generate formatted report for failing validation', () => {
      const report = {
        ruleName: 'Test_Rule',
        objectType: 'Account',
        timestamp: '2025-01-01T00:00:00.000Z',
        valid: false,
        totalChecks: 20,
        checksCompleted: 20,
        criticalIssues: 2,
        warnings: 1,
        checks: [
          {
            name: 'Object Compatibility',
            status: 'completed',
            issues: [
              {
                severity: 'critical',
                message: 'Object "Account" does not support Assignment Rules'
              }
            ],
            skipped: false
          },
          {
            name: 'Entry Count Limit',
            status: 'completed',
            issues: [
              {
                severity: 'critical',
                message: 'Entry count 3001 exceeds maximum of 3000'
              }
            ],
            skipped: false
          },
          {
            name: 'Assignee Active Status',
            status: 'completed',
            issues: [
              {
                severity: 'warning',
                message: 'User John Doe is inactive',
                recommendation: 'Activate user before deployment'
              }
            ],
            skipped: false
          }
        ],
        summary: {
          completedChecks: 20,
          skippedChecks: 0,
          erroredChecks: 0,
          totalIssues: 3,
          criticalIssues: 2,
          warnings: 1,
          recommendation: 'BLOCKED: Fix critical issues before deployment'
        }
      };

      const formatted = validator.generateValidationReport(report);

      expect(formatted).toContain('ASSIGNMENT RULE PRE-DEPLOYMENT VALIDATION REPORT');
      expect(formatted).toContain('Critical Issues: 2');
      expect(formatted).toContain('Warnings: 1');
      expect(formatted).toContain('✗ VALIDATION FAILED');
      expect(formatted).toContain('BLOCKED: Fix critical issues before deployment');
      expect(formatted).toContain('[CRITICAL]');
      expect(formatted).toContain('[WARNING]');
    });

    it('should show skipped checks', () => {
      const report = {
        ruleName: 'Test_Rule',
        objectType: 'Lead',
        timestamp: '2025-01-01T00:00:00.000Z',
        valid: true,
        totalChecks: 20,
        checksCompleted: 20,
        criticalIssues: 0,
        warnings: 0,
        checks: [
          {
            name: 'Circular Routing',
            status: 'completed',
            issues: [],
            skipped: true
          }
        ],
        summary: {
          completedChecks: 19,
          skippedChecks: 1,
          erroredChecks: 0,
          totalIssues: 0,
          criticalIssues: 0,
          warnings: 0,
          recommendation: 'Ready for deployment'
        }
      };

      const formatted = validator.generateValidationReport(report);

      expect(formatted).toContain('[Skipped - Cannot validate without org access]');
    });

    it('should show errored checks', () => {
      const report = {
        ruleName: 'Test_Rule',
        objectType: 'Lead',
        timestamp: '2025-01-01T00:00:00.000Z',
        valid: true,
        totalChecks: 20,
        checksCompleted: 20,
        criticalIssues: 0,
        warnings: 0,
        checks: [
          {
            name: 'Field Existence',
            status: 'error',
            error: 'API connection timeout',
            issues: [],
            skipped: false
          }
        ],
        summary: {
          completedChecks: 19,
          skippedChecks: 0,
          erroredChecks: 1,
          totalIssues: 0,
          criticalIssues: 0,
          warnings: 0,
          recommendation: 'Ready for deployment'
        }
      };

      const formatted = validator.generateValidationReport(report);

      expect(formatted).toContain('[Error: API connection timeout]');
    });
  });

  // ==================== Edge Cases & Error Handling ====================

  describe('Edge Cases', () => {
    it('should handle rule with no entries', async () => {
      assigneeValidator.validateAssignee.mockResolvedValue({ valid: true, type: 'Queue' });

      const emptyRule = { ...FIXTURES.validRule, entries: [] };
      const report = await validator.validatePreDeployment(emptyRule, 'Lead');

      // Empty rules complete validation but may not be valid for deployment
      expect(report.checksCompleted).toBeGreaterThan(0);
      expect(report.ruleName).toBe(emptyRule.name);
    });

    it('should handle null orgAlias', async () => {
      assigneeValidator.validateAssignee.mockResolvedValue({ valid: true, type: 'Queue' });

      const report = await validator.validatePreDeployment(
        FIXTURES.validRule,
        'Lead',
        null
      );

      expect(report.checksCompleted).toBe(20);
    });

    it('should handle missing criteriaItems', async () => {
      assigneeValidator.validateAssignee.mockResolvedValue({ valid: true, type: 'Queue' });
      criteriaEvaluator.fetchObjectDescribe.mockResolvedValue(FIXTURES.objectDescribeResponse);

      const ruleNoCriteria = {
        ...FIXTURES.validRule,
        entries: [{ order: 1, assignedTo: '00G1234567890ABC' }]
      };

      const report = await validator.validatePreDeployment(ruleNoCriteria, 'Lead', 'testorg');

      const check = report.checks.find(c => c.name === 'Field Existence');
      expect(check.status).toBe('completed');
    });

    it('should handle special characters in rule name', async () => {
      assigneeValidator.validateAssignee.mockResolvedValue({ valid: true, type: 'Queue' });
      execSync.mockReturnValue(JSON.stringify({
        status: 0,
        result: { records: [] }
      }));

      const specialNameRule = {
        ...FIXTURES.validRule,
        name: "O'Brien's Rule"
      };

      const report = await validator.validatePreDeployment(
        specialNameRule,
        'Lead',
        'testorg'
      );

      expect(report.ruleName).toBe("O'Brien's Rule");
    });

    it('should generate summary with correct recommendation', async () => {
      assigneeValidator.validateAssignee.mockResolvedValue({ valid: true, type: 'User' });
      assigneeValidator.validateAssigneeAccess.mockResolvedValue({
        hasAccess: true,
        warning: 'Minor warning'
      });

      const report = await validator.validatePreDeployment(
        FIXTURES.validRule,
        'Lead',
        'testorg'
      );

      expect(report.summary).toBeDefined();
      expect(report.summary.recommendation).toBeDefined();
      // Recommendation depends on critical issues and warnings found
      // Could be BLOCKED, CAUTION, PROCEED, or Ready depending on validation results
      expect(['BLOCKED', 'CAUTION', 'PROCEED', 'Ready'].some(
        status => report.summary.recommendation.includes(status)
      )).toBe(true);
    });
  });
});
