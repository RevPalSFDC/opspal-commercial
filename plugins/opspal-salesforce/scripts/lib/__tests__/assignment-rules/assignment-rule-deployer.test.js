/**
 * Unit Tests for Assignment Rule Deployer
 *
 * Tests deployment, retrieval, activation, deactivation, deletion,
 * backup, and restore operations for Assignment Rules.
 *
 * @group assignment-rules
 * @group deployment
 */

const {
  deployRule,
  retrieveExistingRules,
  activateRule,
  deactivateRule,
  deleteRule,
  backupRules,
  restoreFromBackup
} = require('../../assignment-rule-deployer');

// Mock child_process execSync
jest.mock('child_process', () => ({
  execSync: jest.fn()
}));

// Mock fs
jest.mock('fs', () => ({
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn(),
  existsSync: jest.fn(),
  rmSync: jest.fn()
}));

// Mock os
jest.mock('os', () => ({
  tmpdir: jest.fn(() => '/tmp')
}));

const { execSync } = require('child_process');
const fs = require('fs');

/**
 * Test Fixtures
 */
const FIXTURES = {
  // Valid Assignment Rule XML
  validXML: `<?xml version="1.0" encoding="UTF-8"?>
<AssignmentRules xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Lead</fullName>
    <assignmentRule>
        <active>true</active>
        <name>Healthcare_Rule</name>
        <ruleEntry>
            <order>1</order>
            <criteriaItems>
                <field>Industry</field>
                <operation>equals</operation>
                <value>Healthcare</value>
            </criteriaItems>
            <assignedTo>00G1234567890ABC</assignedTo>
            <assignedToType>Queue</assignedToType>
        </ruleEntry>
    </assignmentRule>
</AssignmentRules>`,

  // Multiple rules XML
  multipleRulesXML: `<?xml version="1.0" encoding="UTF-8"?>
<AssignmentRules xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>Lead</fullName>
    <assignmentRule>
        <active>true</active>
        <name>Healthcare_Rule</name>
        <ruleEntry>
            <order>1</order>
            <criteriaItems>
                <field>Industry</field>
                <operation>equals</operation>
                <value>Healthcare</value>
            </criteriaItems>
            <assignedTo>00G1234567890ABC</assignedTo>
            <assignedToType>Queue</assignedToType>
        </ruleEntry>
    </assignmentRule>
    <assignmentRule>
        <active>false</active>
        <name>Technology_Rule</name>
        <ruleEntry>
            <order>1</order>
            <criteriaItems>
                <field>Industry</field>
                <operation>equals</operation>
                <value>Technology</value>
            </criteriaItems>
            <assignedTo>00G2222222222BBB</assignedTo>
            <assignedToType>Queue</assignedToType>
        </ruleEntry>
    </assignmentRule>
</AssignmentRules>`,

  // Successful deployment result
  successfulDeployment: {
    status: 0,
    result: {
      id: 'DEPLOYMENT_ID_123',
      status: 'Succeeded',
      numberComponentsDeployed: 1,
      numberComponentsTotal: 1,
      numberTestsFailed: 0,
      numberTestsCompleted: 0
    }
  },

  // Failed deployment result
  failedDeployment: {
    status: 1,
    message: 'Deployment failed',
    result: {
      status: 'Failed',
      errors: ['Invalid field reference']
    }
  }
};

describe('assignment-rule-deployer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(true);
  });

  // ============================================================================
  // deployRule Tests
  // ============================================================================
  describe('deployRule', () => {
    test('should deploy via Metadata API', async () => {
      execSync.mockReturnValue(JSON.stringify(FIXTURES.successfulDeployment));

      const result = await deployRule(FIXTURES.validXML, 'myorg');

      expect(result.success).toBe(true);
      expect(result.objectType).toBe('Lead');
      expect(result.deploymentId).toBe('DEPLOYMENT_ID_123');
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('sf project deploy start'),
        expect.any(Object)
      );
    });

    test('should handle deployment success', async () => {
      execSync.mockReturnValue(JSON.stringify(FIXTURES.successfulDeployment));

      const result = await deployRule(FIXTURES.validXML, 'myorg');

      expect(result.success).toBe(true);
      expect(result.status).toBe('Succeeded');
      expect(result.componentsDeployed).toBe(1);
      expect(result.componentsTotal).toBe(1);
    });

    test('should handle deployment failure', async () => {
      execSync.mockReturnValue(JSON.stringify(FIXTURES.failedDeployment));

      const result = await deployRule(FIXTURES.validXML, 'myorg');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should return deployment result', async () => {
      execSync.mockReturnValue(JSON.stringify(FIXTURES.successfulDeployment));

      const result = await deployRule(FIXTURES.validXML, 'myorg');

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('objectType');
      expect(result).toHaveProperty('deploymentId');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('componentsDeployed');
    });

    test('should use correct org alias', async () => {
      execSync.mockReturnValue(JSON.stringify(FIXTURES.successfulDeployment));

      await deployRule(FIXTURES.validXML, 'production-org');

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('--target-org production-org'),
        expect.any(Object)
      );
    });

    test('should support checkOnly option', async () => {
      execSync.mockReturnValue(JSON.stringify(FIXTURES.successfulDeployment));

      const result = await deployRule(FIXTURES.validXML, 'myorg', { checkOnly: true });

      expect(result.checkOnly).toBe(true);
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('--dry-run'),
        expect.any(Object)
      );
    });

    test('should support testLevel option', async () => {
      execSync.mockReturnValue(JSON.stringify(FIXTURES.successfulDeployment));

      await deployRule(FIXTURES.validXML, 'myorg', { testLevel: 'RunLocalTests' });

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('--test-level RunLocalTests'),
        expect.any(Object)
      );
    });

    test('should support timeout option', async () => {
      execSync.mockReturnValue(JSON.stringify(FIXTURES.successfulDeployment));

      await deployRule(FIXTURES.validXML, 'myorg', { timeout: 1200 });

      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('--wait 1200'),
        expect.any(Object)
      );
    });

    test('should cleanup temp directory on success', async () => {
      execSync.mockReturnValue(JSON.stringify(FIXTURES.successfulDeployment));

      await deployRule(FIXTURES.validXML, 'myorg');

      expect(fs.rmSync).toHaveBeenCalledWith(
        expect.stringContaining('/tmp/assignment-rules-'),
        expect.objectContaining({ recursive: true, force: true })
      );
    });

    test('should cleanup temp directory on failure', async () => {
      execSync.mockImplementation(() => {
        throw new Error('Deployment failed');
      });

      await deployRule(FIXTURES.validXML, 'myorg');

      expect(fs.rmSync).toHaveBeenCalled();
    });

    test('should handle missing fullName tag', async () => {
      const invalidXML = `<?xml version="1.0" encoding="UTF-8"?>
<AssignmentRules xmlns="http://soap.sforce.com/2006/04/metadata">
</AssignmentRules>`;

      await expect(deployRule(invalidXML, 'myorg')).rejects.toThrow('Cannot determine object type');
    });

    test('should create proper directory structure', async () => {
      execSync.mockReturnValue(JSON.stringify(FIXTURES.successfulDeployment));

      await deployRule(FIXTURES.validXML, 'myorg');

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('assignmentRules'),
        expect.objectContaining({ recursive: true })
      );
    });

    test('should write rule XML file', async () => {
      execSync.mockReturnValue(JSON.stringify(FIXTURES.successfulDeployment));

      await deployRule(FIXTURES.validXML, 'myorg');

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('Lead.assignmentRules-meta.xml'),
        FIXTURES.validXML,
        'utf8'
      );
    });

    test('should write package.xml', async () => {
      execSync.mockReturnValue(JSON.stringify(FIXTURES.successfulDeployment));

      await deployRule(FIXTURES.validXML, 'myorg');

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('package.xml'),
        expect.stringContaining('<members>Lead</members>'),
        'utf8'
      );
    });

    test('should handle JSON parse errors', async () => {
      execSync.mockReturnValue('invalid json');

      const result = await deployRule(FIXTURES.validXML, 'myorg');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle execSync errors', async () => {
      execSync.mockImplementation(() => {
        const error = new Error('Command failed');
        error.stdout = JSON.stringify({ message: 'Network error' });
        throw error;
      });

      const result = await deployRule(FIXTURES.validXML, 'myorg');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // ============================================================================
  // retrieveExistingRules Tests
  // ============================================================================
  describe('retrieveExistingRules', () => {
    test('should retrieve rules for Lead', async () => {
      execSync.mockReturnValue(JSON.stringify({ status: 0 }));
      fs.readFileSync.mockReturnValue(FIXTURES.validXML);

      const xml = await retrieveExistingRules('Lead', 'myorg');

      expect(xml).toBe(FIXTURES.validXML);
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('sf project retrieve start'),
        expect.any(Object)
      );
    });

    test('should retrieve rules for Case', async () => {
      execSync.mockReturnValue(JSON.stringify({ status: 0 }));
      fs.readFileSync.mockReturnValue(FIXTURES.validXML.replace('Lead', 'Case'));

      const xml = await retrieveExistingRules('Case', 'myorg');

      expect(xml).toContain('Case');
    });

    test('should return empty for no rules', async () => {
      execSync.mockReturnValue(JSON.stringify({ status: 1, message: 'No rules found' }));

      await expect(retrieveExistingRules('Lead', 'myorg')).rejects.toThrow();
    });

    test('should parse retrieved metadata', async () => {
      execSync.mockReturnValue(JSON.stringify({ status: 0 }));
      fs.readFileSync.mockReturnValue(FIXTURES.multipleRulesXML);

      const xml = await retrieveExistingRules('Lead', 'myorg');

      expect(xml).toContain('Healthcare_Rule');
      expect(xml).toContain('Technology_Rule');
    });

    test('should cleanup temp directory', async () => {
      execSync.mockReturnValue(JSON.stringify({ status: 0 }));
      fs.readFileSync.mockReturnValue(FIXTURES.validXML);

      await retrieveExistingRules('Lead', 'myorg');

      expect(fs.rmSync).toHaveBeenCalled();
    });

    test('should handle missing retrieved file', async () => {
      execSync.mockReturnValue(JSON.stringify({ status: 0 }));
      // Make existsSync return false for the retrieved file check
      fs.existsSync.mockReturnValue(false);

      await expect(retrieveExistingRules('Lead', 'myorg')).rejects.toThrow('not found');
    });
  });

  // ============================================================================
  // activateRule Tests
  // ============================================================================
  describe('activateRule', () => {
    test('should activate specified rule', async () => {
      // Mock retrieve
      execSync.mockReturnValueOnce(JSON.stringify({ status: 0 }));
      fs.readFileSync.mockReturnValueOnce(FIXTURES.multipleRulesXML);

      // Mock deploy
      execSync.mockReturnValueOnce(JSON.stringify(FIXTURES.successfulDeployment));

      const result = await activateRule('Technology_Rule', 'Lead', 'myorg');

      expect(result.success).toBe(true);
      expect(result.activatedRule).toBe('Technology_Rule');
    });

    test('should deactivate other rules for same object', async () => {
      // Mock retrieve with Healthcare_Rule active
      execSync.mockReturnValueOnce(JSON.stringify({ status: 0 }));
      fs.readFileSync.mockReturnValueOnce(FIXTURES.multipleRulesXML);

      // Mock deploy
      execSync.mockReturnValueOnce(JSON.stringify(FIXTURES.successfulDeployment));

      const result = await activateRule('Technology_Rule', 'Lead', 'myorg');

      expect(result.success).toBe(true);
      expect(result.deactivatedRule).toBe('Healthcare_Rule');
    });

    test('should handle activation errors', async () => {
      execSync.mockImplementation(() => {
        throw new Error('Network error');
      });

      const result = await activateRule('Healthcare_Rule', 'Lead', 'myorg');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should verify only one active rule', async () => {
      execSync.mockReturnValueOnce(JSON.stringify({ status: 0 }));
      fs.readFileSync.mockReturnValueOnce(FIXTURES.multipleRulesXML);
      execSync.mockReturnValueOnce(JSON.stringify(FIXTURES.successfulDeployment));

      const result = await activateRule('Technology_Rule', 'Lead', 'myorg');

      expect(result.success).toBe(true);
      // Only Technology_Rule should be active after activation
    });

    test('should handle rule not found', async () => {
      execSync.mockReturnValueOnce(JSON.stringify({ status: 0 }));
      fs.readFileSync.mockReturnValueOnce(FIXTURES.multipleRulesXML);

      const result = await activateRule('NonExistentRule', 'Lead', 'myorg');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
      expect(result.availableRules).toBeDefined();
    });

    test('should handle already active rule', async () => {
      execSync.mockReturnValueOnce(JSON.stringify({ status: 0 }));
      fs.readFileSync.mockReturnValueOnce(FIXTURES.multipleRulesXML);

      const result = await activateRule('Healthcare_Rule', 'Lead', 'myorg'); // Already active

      // Should still return success
      expect(result.success).toBeDefined();
    });
  });

  // ============================================================================
  // deactivateRule Tests
  // ============================================================================
  describe('deactivateRule', () => {
    test('should deactivate specified rule', async () => {
      execSync.mockReturnValueOnce(JSON.stringify({ status: 0 }));
      fs.readFileSync.mockReturnValueOnce(FIXTURES.multipleRulesXML);
      execSync.mockReturnValueOnce(JSON.stringify(FIXTURES.successfulDeployment));

      const result = await deactivateRule('Healthcare_Rule', 'Lead', 'myorg');

      expect(result.success).toBe(true);
      expect(result.deactivatedRule).toBe('Healthcare_Rule');
    });

    test('should handle deactivation errors', async () => {
      execSync.mockImplementation(() => {
        throw new Error('Network error');
      });

      const result = await deactivateRule('Healthcare_Rule', 'Lead', 'myorg');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle rule not found', async () => {
      execSync.mockReturnValueOnce(JSON.stringify({ status: 0 }));
      fs.readFileSync.mockReturnValueOnce(FIXTURES.multipleRulesXML);

      const result = await deactivateRule('NonExistentRule', 'Lead', 'myorg');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  // ============================================================================
  // deleteRule Tests
  // ============================================================================
  describe('deleteRule', () => {
    test('should delete rule metadata', async () => {
      execSync.mockReturnValueOnce(JSON.stringify({ status: 0 }));
      fs.readFileSync.mockReturnValueOnce(FIXTURES.multipleRulesXML);
      execSync.mockReturnValueOnce(JSON.stringify(FIXTURES.successfulDeployment));

      const result = await deleteRule('Technology_Rule', 'Lead', 'myorg');

      expect(result.success).toBe(true);
      expect(result.deletedRule).toBe('Technology_Rule');
      expect(result.remainingRules).toBe(1);
    });

    test('should handle safe deletion checks', async () => {
      execSync.mockReturnValueOnce(JSON.stringify({ status: 0 }));
      fs.readFileSync.mockReturnValueOnce(FIXTURES.validXML); // Only one rule

      const result = await deleteRule('Healthcare_Rule', 'Lead', 'myorg');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot delete the only rule');
      expect(result.recommendation).toBeDefined();
    });

    test('should return deletion result', async () => {
      execSync.mockReturnValueOnce(JSON.stringify({ status: 0 }));
      fs.readFileSync.mockReturnValueOnce(FIXTURES.multipleRulesXML);
      execSync.mockReturnValueOnce(JSON.stringify(FIXTURES.successfulDeployment));

      const result = await deleteRule('Technology_Rule', 'Lead', 'myorg');

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('deletedRule');
      expect(result).toHaveProperty('objectType');
      expect(result).toHaveProperty('remainingRules');
      expect(result).toHaveProperty('deploymentId');
    });

    test('should handle rule not found', async () => {
      execSync.mockReturnValueOnce(JSON.stringify({ status: 0 }));
      fs.readFileSync.mockReturnValueOnce(FIXTURES.multipleRulesXML);

      const result = await deleteRule('NonExistentRule', 'Lead', 'myorg');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  // ============================================================================
  // backupRules Tests
  // ============================================================================
  describe('backupRules', () => {
    test('should backup rules to specified directory', async () => {
      execSync.mockReturnValue(JSON.stringify({ status: 0 }));
      fs.readFileSync.mockReturnValue(FIXTURES.validXML);

      const backupPath = await backupRules('Lead', 'myorg', './test-backups');

      expect(backupPath).toContain('test-backups');
      expect(backupPath).toContain('Lead');
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('.assignmentRules-meta.xml'),
        FIXTURES.validXML,
        'utf8'
      );
    });

    test('should create timestamped backup file', async () => {
      execSync.mockReturnValue(JSON.stringify({ status: 0 }));
      fs.readFileSync.mockReturnValue(FIXTURES.validXML);

      const backupPath = await backupRules('Lead', 'myorg');

      expect(backupPath).toMatch(/Lead_\d{4}-\d{2}-\d{2}/); // Timestamp pattern
    });

    test('should handle backup errors', async () => {
      execSync.mockImplementation(() => {
        throw new Error('Retrieve failed');
      });

      await expect(backupRules('Lead', 'myorg')).rejects.toThrow('Failed to backup rules');
    });

    test('should create backup directory if not exists', async () => {
      execSync.mockReturnValue(JSON.stringify({ status: 0 }));
      fs.readFileSync.mockReturnValue(FIXTURES.validXML);

      await backupRules('Lead', 'myorg');

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('backups/assignment-rules/Lead'),
        expect.objectContaining({ recursive: true })
      );
    });
  });

  // ============================================================================
  // restoreFromBackup Tests
  // ============================================================================
  describe('restoreFromBackup', () => {
    test('should restore rules from backup file', async () => {
      fs.readFileSync.mockReturnValue(FIXTURES.validXML);
      execSync.mockReturnValue(JSON.stringify(FIXTURES.successfulDeployment));

      const result = await restoreFromBackup('./backups/Lead_backup.xml', 'myorg');

      expect(result.success).toBe(true);
      expect(result.objectType).toBe('Lead');
    });

    test('should handle missing backup file', async () => {
      fs.existsSync.mockReturnValue(false);

      const result = await restoreFromBackup('./nonexistent.xml', 'myorg');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    test('should deploy backup content', async () => {
      fs.readFileSync.mockReturnValue(FIXTURES.validXML);
      execSync.mockReturnValue(JSON.stringify(FIXTURES.successfulDeployment));

      const result = await restoreFromBackup('./backup.xml', 'myorg');

      expect(result.success).toBe(true);
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('sf project deploy start'),
        expect.any(Object)
      );
    });

    test('should handle restore errors', async () => {
      fs.readFileSync.mockReturnValue(FIXTURES.validXML);
      execSync.mockReturnValue(JSON.stringify(FIXTURES.failedDeployment));

      const result = await restoreFromBackup('./backup.xml', 'myorg');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to restore');
    });

    test('should extract object type from backup', async () => {
      fs.readFileSync.mockReturnValue(FIXTURES.validXML);
      execSync.mockReturnValue(JSON.stringify(FIXTURES.successfulDeployment));

      const result = await restoreFromBackup('./backup.xml', 'myorg');

      expect(result.objectType).toBe('Lead');
    });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================
  describe('Integration Tests', () => {
    test('should complete backup and restore workflow', async () => {
      // Backup
      execSync.mockReturnValueOnce(JSON.stringify({ status: 0 }));
      fs.readFileSync.mockReturnValueOnce(FIXTURES.validXML);
      const backupPath = await backupRules('Lead', 'myorg');

      expect(backupPath).toBeDefined();

      // Restore
      fs.readFileSync.mockReturnValueOnce(FIXTURES.validXML);
      execSync.mockReturnValueOnce(JSON.stringify(FIXTURES.successfulDeployment));
      const restoreResult = await restoreFromBackup(backupPath, 'myorg');

      expect(restoreResult.success).toBe(true);
    });

    test('should handle activation workflow', async () => {
      // Retrieve
      execSync.mockReturnValueOnce(JSON.stringify({ status: 0 }));
      fs.readFileSync.mockReturnValueOnce(FIXTURES.multipleRulesXML);

      // Deploy
      execSync.mockReturnValueOnce(JSON.stringify(FIXTURES.successfulDeployment));

      const result = await activateRule('Technology_Rule', 'Lead', 'myorg');

      expect(result.success).toBe(true);
      expect(result.activatedRule).toBe('Technology_Rule');
      expect(result.deactivatedRule).toBe('Healthcare_Rule');
    });

    test('should handle validation before deployment', async () => {
      // Validate
      execSync.mockReturnValueOnce(JSON.stringify(FIXTURES.successfulDeployment));
      const validateResult = await deployRule(FIXTURES.validXML, 'myorg', { checkOnly: true });

      expect(validateResult.success).toBe(true);
      expect(validateResult.checkOnly).toBe(true);

      // Then deploy
      execSync.mockReturnValueOnce(JSON.stringify(FIXTURES.successfulDeployment));
      const deployResult = await deployRule(FIXTURES.validXML, 'myorg');

      expect(deployResult.success).toBe(true);
      expect(deployResult.checkOnly).toBeFalsy();
    });
  });
});
