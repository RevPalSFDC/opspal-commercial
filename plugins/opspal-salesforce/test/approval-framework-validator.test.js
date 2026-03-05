/**
 * Test Suite: Approval Framework Validator
 *
 * Tests pre-deployment validation for Salesforce custom approval frameworks.
 * Validates approval rule configuration, required fields, FLS, and field patterns.
 *
 * Coverage Target: >80%
 * Priority: Tier 2 (High-Impact Validator)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// Mock execSync before requiring the module
jest.mock('child_process', () => ({
  execSync: jest.fn()
}));

const ApprovalFrameworkValidator = require('../scripts/lib/approval-framework-validator');

describe('ApprovalFrameworkValidator', () => {
  let tempDir;
  const mockExecSync = require('child_process').execSync;

  beforeEach(() => {
    jest.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'approval-test-'));
    // Suppress console output during tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    jest.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with org alias', () => {
      const validator = new ApprovalFrameworkValidator('test-org');
      assert.strictEqual(validator.orgAlias, 'test-org');
      assert.strictEqual(validator.autoFix, false);
      assert.deepStrictEqual(validator.errors, []);
      assert.deepStrictEqual(validator.warnings, []);
    });

    it('should accept autoFix option', () => {
      const validator = new ApprovalFrameworkValidator('test-org', { fix: true });
      assert.strictEqual(validator.autoFix, true);
    });
  });

  describe('validateRuleApprover()', () => {
    let validator;

    beforeEach(() => {
      validator = new ApprovalFrameworkValidator('test-org');
    });

    it('should validate UserIdLiteral requires Approver_User__c', () => {
      const rule = {
        Approver_Type__c: 'UserIdLiteral',
        Approver_User__c: null
      };
      const issues = validator.validateRuleApprover(rule);
      assert.strictEqual(issues.length, 1);
      assert.ok(issues[0].includes('Approver_User__c is NULL'));
    });

    it('should pass UserIdLiteral with Approver_User__c populated', () => {
      const rule = {
        Approver_Type__c: 'UserIdLiteral',
        Approver_User__c: '005xxxx'
      };
      const issues = validator.validateRuleApprover(rule);
      assert.strictEqual(issues.length, 0);
    });

    it('should validate QueueIdLiteral requires Approver_Queue__c', () => {
      const rule = {
        Approver_Type__c: 'QueueIdLiteral',
        Approver_Queue__c: null
      };
      const issues = validator.validateRuleApprover(rule);
      assert.strictEqual(issues.length, 1);
      assert.ok(issues[0].includes('Approver_Queue__c is NULL'));
    });

    it('should pass QueueIdLiteral with Approver_Queue__c populated', () => {
      const rule = {
        Approver_Type__c: 'QueueIdLiteral',
        Approver_Queue__c: '00Gxxxx'
      };
      const issues = validator.validateRuleApprover(rule);
      assert.strictEqual(issues.length, 0);
    });

    it('should validate RoleIdLiteral requires Approver_Role__c', () => {
      const rule = {
        Approver_Type__c: 'RoleIdLiteral',
        Approver_Role__c: null
      };
      const issues = validator.validateRuleApprover(rule);
      assert.strictEqual(issues.length, 1);
      assert.ok(issues[0].includes('Approver_Role__c is NULL'));
    });

    it('should pass RoleIdLiteral with Approver_Role__c populated', () => {
      const rule = {
        Approver_Type__c: 'RoleIdLiteral',
        Approver_Role__c: '00Exxxx'
      };
      const issues = validator.validateRuleApprover(rule);
      assert.strictEqual(issues.length, 0);
    });

    it('should validate FieldValue requires Approver_Field__c', () => {
      const rule = {
        Approver_Type__c: 'FieldValue',
        Approver_Field__c: null
      };
      const issues = validator.validateRuleApprover(rule);
      assert.strictEqual(issues.length, 1);
      assert.ok(issues[0].includes('Approver_Field__c is NULL'));
    });

    it('should pass FieldValue with Approver_Field__c populated', () => {
      const rule = {
        Approver_Type__c: 'FieldValue',
        Approver_Field__c: 'OwnerId'
      };
      const issues = validator.validateRuleApprover(rule);
      assert.strictEqual(issues.length, 0);
    });

    it('should pass ManagerOfOwner without extra validation', () => {
      const rule = {
        Approver_Type__c: 'ManagerOfOwner'
      };
      const issues = validator.validateRuleApprover(rule);
      assert.strictEqual(issues.length, 0);
    });

    it('should pass ManagerOfOwner2Levels without extra validation', () => {
      const rule = {
        Approver_Type__c: 'ManagerOfOwner2Levels'
      };
      const issues = validator.validateRuleApprover(rule);
      assert.strictEqual(issues.length, 0);
    });

    it('should flag unknown approver types', () => {
      const rule = {
        Approver_Type__c: 'UnknownType'
      };
      const issues = validator.validateRuleApprover(rule);
      assert.strictEqual(issues.length, 1);
      assert.ok(issues[0].includes('Unknown Approver_Type__c'));
    });
  });

  describe('findApexFile()', () => {
    let validator;

    beforeEach(() => {
      validator = new ApprovalFrameworkValidator('test-org');
      process.chdir(tempDir);
    });

    afterEach(() => {
      process.chdir('/');
    });

    it('should find file in force-app/main/default/classes', () => {
      fs.mkdirSync(path.join(tempDir, 'force-app/main/default/classes'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'force-app/main/default/classes/ApprovalEngine.cls'), 'public class ApprovalEngine {}');

      const result = validator.findApexFile('ApprovalEngine.cls');
      assert.ok(result);
      assert.ok(result.includes('ApprovalEngine.cls'));
    });

    it('should find file in classes directory', () => {
      fs.mkdirSync(path.join(tempDir, 'classes'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'classes/ApprovalEngine.cls'), 'public class ApprovalEngine {}');

      const result = validator.findApexFile('ApprovalEngine.cls');
      assert.ok(result);
    });

    it('should find file in src/classes directory', () => {
      fs.mkdirSync(path.join(tempDir, 'src/classes'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, 'src/classes/ApprovalEngine.cls'), 'public class ApprovalEngine {}');

      const result = validator.findApexFile('ApprovalEngine.cls');
      assert.ok(result);
    });

    it('should return null when file not found', () => {
      const result = validator.findApexFile('NonExistent.cls');
      assert.strictEqual(result, null);
    });
  });

  describe('findPermissionSetFile()', () => {
    let validator;

    beforeEach(() => {
      validator = new ApprovalFrameworkValidator('test-org');
      process.chdir(tempDir);
    });

    afterEach(() => {
      process.chdir('/');
    });

    it('should find file in force-app/main/default/permissionsets', () => {
      fs.mkdirSync(path.join(tempDir, 'force-app/main/default/permissionsets'), { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, 'force-app/main/default/permissionsets/Approval_Framework_Access.permissionset-meta.xml'),
        '<PermissionSet/>'
      );

      const result = validator.findPermissionSetFile('Approval_Framework_Access');
      assert.ok(result);
      assert.ok(result.includes('Approval_Framework_Access.permissionset-meta.xml'));
    });

    it('should find file in metadata/permissionsets', () => {
      fs.mkdirSync(path.join(tempDir, 'metadata/permissionsets'), { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, 'metadata/permissionsets/Approval_Framework_Access.permissionset-meta.xml'),
        '<PermissionSet/>'
      );

      const result = validator.findPermissionSetFile('Approval_Framework_Access');
      assert.ok(result);
    });

    it('should return null when file not found', () => {
      const result = validator.findPermissionSetFile('NonExistent');
      assert.strictEqual(result, null);
    });
  });

  describe('getExitCode()', () => {
    let validator;

    beforeEach(() => {
      validator = new ApprovalFrameworkValidator('test-org');
    });

    it('should return 0 when no errors or warnings', () => {
      validator.errors = [];
      validator.warnings = [];
      const code = validator.getExitCode();
      assert.strictEqual(code, 0);
    });

    it('should return 1 when errors exist', () => {
      validator.errors = [{ message: 'Critical error' }];
      validator.warnings = [];
      const code = validator.getExitCode();
      assert.strictEqual(code, 1);
    });

    it('should return 2 when only warnings exist', () => {
      validator.errors = [];
      validator.warnings = [{ message: 'Warning' }];
      const code = validator.getExitCode();
      assert.strictEqual(code, 2);
    });

    it('should return 1 when both errors and warnings exist', () => {
      validator.errors = [{ message: 'Error' }];
      validator.warnings = [{ message: 'Warning' }];
      const code = validator.getExitCode();
      assert.strictEqual(code, 1);
    });
  });

  describe('validateApprovalRules()', () => {
    let validator;

    beforeEach(() => {
      validator = new ApprovalFrameworkValidator('test-org');
    });

    it('should warn when no active approval rules found', async () => {
      mockExecSync.mockReturnValue(JSON.stringify({
        status: 0,
        result: { records: [] }
      }));

      await validator.validateApprovalRules();

      assert.strictEqual(validator.warnings.length, 1);
      assert.ok(validator.warnings[0].message.includes('No active approval rules'));
    });

    it('should add errors for rules with missing approver config', async () => {
      mockExecSync.mockReturnValue(JSON.stringify({
        status: 0,
        result: {
          records: [
            {
              Rule_Name__c: 'Test Rule',
              Policy__c: 'Test Policy',
              Approver_Type__c: 'UserIdLiteral',
              Approver_User__c: null,
              Active__c: true
            }
          ]
        }
      }));

      await validator.validateApprovalRules();

      assert.strictEqual(validator.errors.length, 1);
      assert.strictEqual(validator.errors[0].check, 'Approval Rules');
      assert.strictEqual(validator.errors[0].rule, 'Test Rule');
    });

    it('should handle query failures gracefully', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Query failed');
      });

      await validator.validateApprovalRules();

      assert.strictEqual(validator.errors.length, 1);
      assert.ok(validator.errors[0].message.includes('Query failed'));
    });
  });

  describe('validateManagerAssignments()', () => {
    let validator;

    beforeEach(() => {
      validator = new ApprovalFrameworkValidator('test-org');
    });

    it('should pass when users have manager assignments', async () => {
      mockExecSync.mockReturnValue(JSON.stringify({
        status: 0,
        result: {
          records: [{ managerCount: 10 }]
        }
      }));

      await validator.validateManagerAssignments();

      assert.strictEqual(validator.errors.length, 0);
    });

    it('should add error when no users have managers', async () => {
      mockExecSync.mockReturnValue(JSON.stringify({
        status: 0,
        result: {
          records: [{ managerCount: 0 }]
        }
      }));

      await validator.validateManagerAssignments();

      assert.strictEqual(validator.errors.length, 1);
      assert.ok(validator.errors[0].message.includes('no active users have managers'));
    });

    it('should warn on query failure', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Connection failed');
      });

      await validator.validateManagerAssignments();

      assert.strictEqual(validator.warnings.length, 1);
      assert.ok(validator.warnings[0].message.includes('Could not verify'));
    });
  });

  describe('validatePermissionSetFLS()', () => {
    let validator;

    beforeEach(() => {
      validator = new ApprovalFrameworkValidator('test-org');
      process.chdir(tempDir);
    });

    afterEach(() => {
      process.chdir('/');
    });

    it('should add error when permission set file not found', async () => {
      await validator.validatePermissionSetFLS('NonExistent', 'Object__c.Field__c');

      assert.strictEqual(validator.errors.length, 1);
      assert.ok(validator.errors[0].message.includes('not found'));
    });

    it('should add error when FLS entry missing', async () => {
      fs.mkdirSync(path.join(tempDir, 'force-app/main/default/permissionsets'), { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, 'force-app/main/default/permissionsets/Test_PS.permissionset-meta.xml'),
        '<PermissionSet><label>Test</label></PermissionSet>'
      );

      await validator.validatePermissionSetFLS('Test_PS', 'Object__c.Field__c');

      assert.strictEqual(validator.errors.length, 1);
      assert.ok(validator.errors[0].message.includes('Missing FLS entry'));
    });

    it('should pass when FLS entry exists', async () => {
      fs.mkdirSync(path.join(tempDir, 'force-app/main/default/permissionsets'), { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, 'force-app/main/default/permissionsets/Test_PS.permissionset-meta.xml'),
        '<PermissionSet><fieldPermissions><field>Object__c.Field__c</field><editable>true</editable></fieldPermissions></PermissionSet>'
      );

      await validator.validatePermissionSetFLS('Test_PS', 'Object__c.Field__c');

      assert.strictEqual(validator.errors.length, 0);
    });
  });

  describe('validateObjectFieldPaths()', () => {
    let validator;

    beforeEach(() => {
      validator = new ApprovalFrameworkValidator('test-org');
      process.chdir(tempDir);
    });

    afterEach(() => {
      process.chdir('/');
    });

    it('should warn when ApprovalEngine.cls not found', async () => {
      await validator.validateObjectFieldPaths();

      assert.strictEqual(validator.warnings.length, 1);
      assert.ok(validator.warnings[0].message.includes('Could not find ApprovalEngine.cls'));
    });

    it('should add error when Quote handling is missing', async () => {
      fs.mkdirSync(path.join(tempDir, 'force-app/main/default/classes'), { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, 'force-app/main/default/classes/ApprovalEngine.cls'),
        'public class ApprovalEngine { // No Quote handling }'
      );

      await validator.validateObjectFieldPaths();

      assert.strictEqual(validator.errors.length, 1);
      assert.ok(validator.errors[0].message.includes('Quote object special handling'));
    });

    it('should pass when Quote handling is present', async () => {
      fs.mkdirSync(path.join(tempDir, 'force-app/main/default/classes'), { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, 'force-app/main/default/classes/ApprovalEngine.cls'),
        `public class ApprovalEngine {
          if (objectType == 'Quote') {
            String owner = Opportunity.OwnerId;
          }
        }`
      );

      await validator.validateObjectFieldPaths();

      assert.strictEqual(validator.errors.length, 0);
    });
  });

  describe('printReport()', () => {
    let validator;

    beforeEach(() => {
      validator = new ApprovalFrameworkValidator('test-org');
    });

    it('should print success message when no issues', () => {
      validator.errors = [];
      validator.warnings = [];
      validator.printReport();
      // Just verify it doesn't throw
      assert.ok(true);
    });

    it('should print errors when present', () => {
      validator.errors = [{
        check: 'Test',
        message: 'Test error',
        severity: 'CRITICAL'
      }];
      validator.printReport();
      assert.ok(true);
    });

    it('should print warnings when present', () => {
      validator.warnings = [{
        check: 'Test',
        message: 'Test warning',
        severity: 'WARNING'
      }];
      validator.printReport();
      assert.ok(true);
    });

    it('should print rule details when present', () => {
      validator.errors = [{
        check: 'Approval Rules',
        rule: 'TestRule',
        policy: 'TestPolicy',
        issues: ['Issue 1', 'Issue 2'],
        severity: 'CRITICAL'
      }];
      validator.printReport();
      assert.ok(true);
    });

    it('should print fix suggestions when present', () => {
      validator.errors = [{
        check: 'Test',
        message: 'Test error',
        fix: 'Fix suggestion',
        severity: 'CRITICAL'
      }];
      validator.printReport();
      assert.ok(true);
    });
  });

  describe('querySalesforce()', () => {
    let validator;

    beforeEach(() => {
      validator = new ApprovalFrameworkValidator('test-org');
    });

    it('should format query and return result', () => {
      mockExecSync.mockReturnValue(JSON.stringify({
        status: 0,
        result: {
          records: [{ Id: '001xxx', Name: 'Test' }]
        }
      }));

      const result = validator.querySalesforce('SELECT Id FROM Account');

      assert.ok(result.records);
      assert.strictEqual(result.records.length, 1);
    });

    it('should handle multi-line queries', () => {
      mockExecSync.mockReturnValue(JSON.stringify({
        status: 0,
        result: { records: [] }
      }));

      validator.querySalesforce(`
        SELECT Id, Name
        FROM Account
        WHERE Active__c = true
      `);

      // Verify execSync was called (multi-line collapsed)
      assert.ok(mockExecSync.mock.calls.length > 0);
    });
  });
});
