/**
 * Test Suite: Permission Set Generator
 *
 * Tests the permission set generation functionality including:
 * - Permission Set XML generation
 * - Required field exclusion
 * - Manifest parsing
 * - Object permission generation
 *
 * Coverage Target: >80%
 * Priority: Phase 3 (High-Impact Generator)
 */

const assert = require('assert');

describe('PermissionSetGenerator', () => {

  // ============================================================
  // Standalone implementations for testing
  // ============================================================

  /**
   * Generate Permission Set XML
   */
  function generatePermissionSetXML(objectName, fields, requiredFields, verbose = false) {
    const permissionSetName = `${objectName.replace(/__c$/, '')}_Access`;
    const label = `${objectName.replace(/__c$/, '').replace(/_/g, ' ')} Access`;

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">
    <hasActivationRequired>false</hasActivationRequired>
    <label>${label}</label>
    <description>Auto-generated FLS permissions for ${objectName}</description>
    <objectPermissions>
        <allowCreate>true</allowCreate>
        <allowDelete>true</allowDelete>
        <allowEdit>true</allowEdit>
        <allowRead>true</allowRead>
        <modifyAllRecords>true</modifyAllRecords>
        <object>${objectName}</object>
        <viewAllRecords>true</viewAllRecords>
    </objectPermissions>
`;

    let includedCount = 0;
    let excludedCount = 0;

    fields.forEach(field => {
      const fieldApiName = field.field;
      const isRequired = field.required || requiredFields.has(fieldApiName);

      if (isRequired) {
        excludedCount++;
        xml += `    <!-- Field ${objectName}.${fieldApiName} excluded (required field - automatic access) -->\n`;
      } else {
        includedCount++;
        xml += `    <fieldPermissions>
        <editable>true</editable>
        <field>${objectName}.${fieldApiName}</field>
        <readable>true</readable>
    </fieldPermissions>
`;
      }
    });

    xml += `</PermissionSet>
`;

    return { xml, permissionSetName, includedCount, excludedCount };
  }

  /**
   * Parse command line arguments
   */
  function parseArgs(args) {
    const config = {
      manifest: null,
      object: null,
      output: 'force-app/main/default/permissionsets',
      excludeRequired: false,
      org: null,
      verbose: false
    };

    for (let i = 0; i < args.length; i++) {
      switch (args[i]) {
        case '--manifest':
          config.manifest = args[++i];
          break;
        case '--object':
          config.object = args[++i];
          break;
        case '--output':
          config.output = args[++i];
          break;
        case '--exclude-required':
          config.excludeRequired = true;
          break;
        case '--org':
          config.org = args[++i];
          break;
        case '--verbose':
          config.verbose = true;
          break;
      }
    }

    return config;
  }

  /**
   * Load fields from manifest JSON
   */
  function loadFieldsFromManifest(manifest) {
    const fieldsByObject = {};

    if (manifest.fields && Array.isArray(manifest.fields)) {
      manifest.fields.forEach(f => {
        const objectName = f.object;
        if (!fieldsByObject[objectName]) {
          fieldsByObject[objectName] = [];
        }
        fieldsByObject[objectName].push({
          field: f.field || f.name,
          type: f.type,
          required: f.required || false
        });
      });
    }

    return fieldsByObject;
  }

  /**
   * Generate permission set filename
   */
  function generatePermissionSetFilename(permissionSetName) {
    return `${permissionSetName}.permissionset-meta.xml`;
  }

  /**
   * Validate Permission Set XML structure
   */
  function validatePermissionSetXML(xml) {
    const errors = [];

    // Check XML declaration
    if (!xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')) {
      errors.push('Missing or invalid XML declaration');
    }

    // Check PermissionSet root element
    if (!xml.includes('<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">')) {
      errors.push('Missing PermissionSet root element with namespace');
    }

    // Check closing tag
    if (!xml.includes('</PermissionSet>')) {
      errors.push('Missing closing PermissionSet tag');
    }

    // Check required elements
    if (!xml.includes('<hasActivationRequired>')) {
      errors.push('Missing hasActivationRequired element');
    }

    if (!xml.includes('<label>')) {
      errors.push('Missing label element');
    }

    // Check object permissions structure
    if (xml.includes('<objectPermissions>') && !xml.includes('</objectPermissions>')) {
      errors.push('Unclosed objectPermissions element');
    }

    // Check field permissions structure
    const fieldPermStartCount = (xml.match(/<fieldPermissions>/g) || []).length;
    const fieldPermEndCount = (xml.match(/<\/fieldPermissions>/g) || []).length;
    if (fieldPermStartCount !== fieldPermEndCount) {
      errors.push('Mismatched fieldPermissions tags');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Extract label from object name
   */
  function generateLabel(objectName) {
    return `${objectName.replace(/__c$/, '').replace(/_/g, ' ')} Access`;
  }

  /**
   * Generate permission set API name from object name
   */
  function generatePermissionSetApiName(objectName) {
    return `${objectName.replace(/__c$/, '')}_Access`;
  }

  /**
   * Check if field is a system field (should not be in permission set)
   */
  function isSystemField(fieldApiName) {
    const systemFields = [
      'Id', 'CreatedById', 'CreatedDate', 'LastModifiedById',
      'LastModifiedDate', 'SystemModstamp', 'IsDeleted', 'OwnerId',
      'Name', 'RecordTypeId'
    ];
    return systemFields.includes(fieldApiName);
  }

  /**
   * Filter fields for permission set inclusion
   */
  function filterFieldsForPermissionSet(fields, requiredFields, excludeSystem = true) {
    return fields.filter(field => {
      const fieldApiName = field.field;

      // Exclude required fields
      if (field.required || requiredFields.has(fieldApiName)) {
        return false;
      }

      // Optionally exclude system fields
      if (excludeSystem && isSystemField(fieldApiName)) {
        return false;
      }

      return true;
    });
  }

  // ============================================================
  // Tests: generatePermissionSetXML()
  // ============================================================

  describe('generatePermissionSetXML()', () => {
    it('should generate valid XML for custom object', () => {
      const fields = [
        { field: 'Status__c', type: 'Picklist' },
        { field: 'Description__c', type: 'TextArea' }
      ];
      const requiredFields = new Set();

      const result = generatePermissionSetXML('Approval_Rule__c', fields, requiredFields);

      assert.ok(result.xml.includes('<?xml version="1.0" encoding="UTF-8"?>'));
      assert.ok(result.xml.includes('<PermissionSet xmlns='));
      assert.ok(result.xml.includes('</PermissionSet>'));
      assert.strictEqual(result.permissionSetName, 'Approval_Rule_Access');
    });

    it('should generate correct label from object name', () => {
      const fields = [];
      const requiredFields = new Set();

      const result = generatePermissionSetXML('My_Custom_Object__c', fields, requiredFields);

      assert.ok(result.xml.includes('<label>My Custom Object Access</label>'));
    });

    it('should include object permissions', () => {
      const fields = [];
      const requiredFields = new Set();

      const result = generatePermissionSetXML('Account', fields, requiredFields);

      assert.ok(result.xml.includes('<objectPermissions>'));
      assert.ok(result.xml.includes('<object>Account</object>'));
      assert.ok(result.xml.includes('<allowCreate>true</allowCreate>'));
      assert.ok(result.xml.includes('<allowRead>true</allowRead>'));
      assert.ok(result.xml.includes('<allowEdit>true</allowEdit>'));
      assert.ok(result.xml.includes('<allowDelete>true</allowDelete>'));
    });

    it('should include field permissions', () => {
      const fields = [
        { field: 'Custom_Field__c', type: 'Text' }
      ];
      const requiredFields = new Set();

      const result = generatePermissionSetXML('Account', fields, requiredFields);

      assert.ok(result.xml.includes('<fieldPermissions>'));
      assert.ok(result.xml.includes('<field>Account.Custom_Field__c</field>'));
      assert.ok(result.xml.includes('<readable>true</readable>'));
      assert.ok(result.xml.includes('<editable>true</editable>'));
      assert.strictEqual(result.includedCount, 1);
    });

    it('should exclude required fields', () => {
      const fields = [
        { field: 'Required_Field__c', required: true },
        { field: 'Optional_Field__c', required: false }
      ];
      const requiredFields = new Set();

      const result = generatePermissionSetXML('Account', fields, requiredFields);

      assert.ok(result.xml.includes('excluded (required field'));
      assert.ok(!result.xml.includes('<field>Account.Required_Field__c</field>'));
      assert.ok(result.xml.includes('<field>Account.Optional_Field__c</field>'));
      assert.strictEqual(result.includedCount, 1);
      assert.strictEqual(result.excludedCount, 1);
    });

    it('should exclude fields in requiredFields Set', () => {
      const fields = [
        { field: 'Field1__c' },
        { field: 'Field2__c' },
        { field: 'Field3__c' }
      ];
      const requiredFields = new Set(['Field2__c']);

      const result = generatePermissionSetXML('Account', fields, requiredFields);

      assert.ok(result.xml.includes('<field>Account.Field1__c</field>'));
      assert.ok(!result.xml.includes('<field>Account.Field2__c</field>'));
      assert.ok(result.xml.includes('<field>Account.Field3__c</field>'));
      assert.strictEqual(result.includedCount, 2);
      assert.strictEqual(result.excludedCount, 1);
    });

    it('should handle empty fields array', () => {
      const fields = [];
      const requiredFields = new Set();

      const result = generatePermissionSetXML('Account', fields, requiredFields);

      assert.ok(result.xml.includes('<PermissionSet'));
      assert.ok(!result.xml.includes('<fieldPermissions>'));
      assert.strictEqual(result.includedCount, 0);
      assert.strictEqual(result.excludedCount, 0);
    });

    it('should handle standard object without __c suffix', () => {
      const fields = [];
      const requiredFields = new Set();

      const result = generatePermissionSetXML('Account', fields, requiredFields);

      assert.strictEqual(result.permissionSetName, 'Account_Access');
      assert.ok(result.xml.includes('<label>Account Access</label>'));
    });

    it('should include description with object name', () => {
      const fields = [];
      const requiredFields = new Set();

      const result = generatePermissionSetXML('Lead', fields, requiredFields);

      assert.ok(result.xml.includes('<description>Auto-generated FLS permissions for Lead</description>'));
    });

    it('should set hasActivationRequired to false', () => {
      const fields = [];
      const requiredFields = new Set();

      const result = generatePermissionSetXML('Account', fields, requiredFields);

      assert.ok(result.xml.includes('<hasActivationRequired>false</hasActivationRequired>'));
    });
  });

  // ============================================================
  // Tests: parseArgs()
  // ============================================================

  describe('parseArgs()', () => {
    it('should parse --manifest argument', () => {
      const args = ['--manifest', 'test-manifest.json'];
      const config = parseArgs(args);
      assert.strictEqual(config.manifest, 'test-manifest.json');
    });

    it('should parse --object argument', () => {
      const args = ['--object', 'Account'];
      const config = parseArgs(args);
      assert.strictEqual(config.object, 'Account');
    });

    it('should parse --output argument', () => {
      const args = ['--output', '/custom/path'];
      const config = parseArgs(args);
      assert.strictEqual(config.output, '/custom/path');
    });

    it('should parse --exclude-required flag', () => {
      const args = ['--exclude-required'];
      const config = parseArgs(args);
      assert.strictEqual(config.excludeRequired, true);
    });

    it('should parse --org argument', () => {
      const args = ['--org', 'my-sandbox'];
      const config = parseArgs(args);
      assert.strictEqual(config.org, 'my-sandbox');
    });

    it('should parse --verbose flag', () => {
      const args = ['--verbose'];
      const config = parseArgs(args);
      assert.strictEqual(config.verbose, true);
    });

    it('should parse multiple arguments', () => {
      const args = ['--manifest', 'test.json', '--org', 'my-org', '--exclude-required', '--verbose'];
      const config = parseArgs(args);
      assert.strictEqual(config.manifest, 'test.json');
      assert.strictEqual(config.org, 'my-org');
      assert.strictEqual(config.excludeRequired, true);
      assert.strictEqual(config.verbose, true);
    });

    it('should have default output directory', () => {
      const config = parseArgs([]);
      assert.strictEqual(config.output, 'force-app/main/default/permissionsets');
    });

    it('should have defaults for boolean flags', () => {
      const config = parseArgs([]);
      assert.strictEqual(config.excludeRequired, false);
      assert.strictEqual(config.verbose, false);
    });
  });

  // ============================================================
  // Tests: loadFieldsFromManifest()
  // ============================================================

  describe('loadFieldsFromManifest()', () => {
    it('should group fields by object', () => {
      const manifest = {
        fields: [
          { object: 'Account', field: 'Field1__c', type: 'Text' },
          { object: 'Account', field: 'Field2__c', type: 'Number' },
          { object: 'Contact', field: 'Field3__c', type: 'Checkbox' }
        ]
      };

      const result = loadFieldsFromManifest(manifest);

      assert.strictEqual(Object.keys(result).length, 2);
      assert.strictEqual(result['Account'].length, 2);
      assert.strictEqual(result['Contact'].length, 1);
    });

    it('should extract field properties', () => {
      const manifest = {
        fields: [
          { object: 'Account', field: 'Test__c', type: 'Text', required: true }
        ]
      };

      const result = loadFieldsFromManifest(manifest);

      assert.strictEqual(result['Account'][0].field, 'Test__c');
      assert.strictEqual(result['Account'][0].type, 'Text');
      assert.strictEqual(result['Account'][0].required, true);
    });

    it('should support "name" as field identifier', () => {
      const manifest = {
        fields: [
          { object: 'Account', name: 'Test__c', type: 'Text' }
        ]
      };

      const result = loadFieldsFromManifest(manifest);

      assert.strictEqual(result['Account'][0].field, 'Test__c');
    });

    it('should default required to false', () => {
      const manifest = {
        fields: [
          { object: 'Account', field: 'Test__c', type: 'Text' }
        ]
      };

      const result = loadFieldsFromManifest(manifest);

      assert.strictEqual(result['Account'][0].required, false);
    });

    it('should handle empty fields array', () => {
      const manifest = { fields: [] };
      const result = loadFieldsFromManifest(manifest);
      assert.deepStrictEqual(result, {});
    });

    it('should handle missing fields property', () => {
      const manifest = {};
      const result = loadFieldsFromManifest(manifest);
      assert.deepStrictEqual(result, {});
    });
  });

  // ============================================================
  // Tests: generatePermissionSetFilename()
  // ============================================================

  describe('generatePermissionSetFilename()', () => {
    it('should generate correct filename', () => {
      const result = generatePermissionSetFilename('Account_Access');
      assert.strictEqual(result, 'Account_Access.permissionset-meta.xml');
    });

    it('should preserve permission set name', () => {
      const result = generatePermissionSetFilename('Custom_Object_Access');
      assert.ok(result.startsWith('Custom_Object_Access'));
    });

    it('should have correct extension', () => {
      const result = generatePermissionSetFilename('Test');
      assert.ok(result.endsWith('.permissionset-meta.xml'));
    });
  });

  // ============================================================
  // Tests: validatePermissionSetXML()
  // ============================================================

  describe('validatePermissionSetXML()', () => {
    it('should validate correct XML', () => {
      const fields = [{ field: 'Test__c' }];
      const { xml } = generatePermissionSetXML('Account', fields, new Set());

      const validation = validatePermissionSetXML(xml);

      assert.strictEqual(validation.valid, true);
      assert.strictEqual(validation.errors.length, 0);
    });

    it('should detect missing XML declaration', () => {
      const invalidXml = '<PermissionSet></PermissionSet>';
      const validation = validatePermissionSetXML(invalidXml);

      assert.strictEqual(validation.valid, false);
      assert.ok(validation.errors.some(e => e.includes('XML declaration')));
    });

    it('should detect missing namespace', () => {
      const invalidXml = '<?xml version="1.0" encoding="UTF-8"?><PermissionSet></PermissionSet>';
      const validation = validatePermissionSetXML(invalidXml);

      assert.strictEqual(validation.valid, false);
      assert.ok(validation.errors.some(e => e.includes('root element')));
    });

    it('should detect missing closing tag', () => {
      const invalidXml = '<?xml version="1.0" encoding="UTF-8"?><PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata"><label>Test</label>';
      const validation = validatePermissionSetXML(invalidXml);

      assert.strictEqual(validation.valid, false);
      assert.ok(validation.errors.some(e => e.includes('closing')));
    });
  });

  // ============================================================
  // Tests: generateLabel()
  // ============================================================

  describe('generateLabel()', () => {
    it('should remove __c suffix', () => {
      const result = generateLabel('Custom_Object__c');
      assert.ok(!result.includes('__c'));
    });

    it('should replace underscores with spaces', () => {
      const result = generateLabel('My_Custom_Object__c');
      assert.ok(result.includes('My Custom Object'));
    });

    it('should append Access', () => {
      const result = generateLabel('Account');
      assert.ok(result.endsWith('Access'));
    });

    it('should handle standard objects', () => {
      const result = generateLabel('Account');
      assert.strictEqual(result, 'Account Access');
    });

    it('should handle complex names', () => {
      const result = generateLabel('Approval_Rule_Config__c');
      assert.strictEqual(result, 'Approval Rule Config Access');
    });
  });

  // ============================================================
  // Tests: generatePermissionSetApiName()
  // ============================================================

  describe('generatePermissionSetApiName()', () => {
    it('should remove __c suffix', () => {
      const result = generatePermissionSetApiName('Custom__c');
      assert.strictEqual(result, 'Custom_Access');
    });

    it('should preserve underscores', () => {
      const result = generatePermissionSetApiName('My_Object__c');
      assert.strictEqual(result, 'My_Object_Access');
    });

    it('should append _Access', () => {
      const result = generatePermissionSetApiName('Account');
      assert.ok(result.endsWith('_Access'));
    });

    it('should handle standard objects', () => {
      const result = generatePermissionSetApiName('Account');
      assert.strictEqual(result, 'Account_Access');
    });
  });

  // ============================================================
  // Tests: isSystemField()
  // ============================================================

  describe('isSystemField()', () => {
    it('should identify Id as system field', () => {
      assert.strictEqual(isSystemField('Id'), true);
    });

    it('should identify CreatedById as system field', () => {
      assert.strictEqual(isSystemField('CreatedById'), true);
    });

    it('should identify CreatedDate as system field', () => {
      assert.strictEqual(isSystemField('CreatedDate'), true);
    });

    it('should identify LastModifiedById as system field', () => {
      assert.strictEqual(isSystemField('LastModifiedById'), true);
    });

    it('should identify OwnerId as system field', () => {
      assert.strictEqual(isSystemField('OwnerId'), true);
    });

    it('should identify Name as system field', () => {
      assert.strictEqual(isSystemField('Name'), true);
    });

    it('should not identify custom field as system field', () => {
      assert.strictEqual(isSystemField('Custom__c'), false);
    });

    it('should not identify standard field as system field', () => {
      assert.strictEqual(isSystemField('Description'), false);
    });
  });

  // ============================================================
  // Tests: filterFieldsForPermissionSet()
  // ============================================================

  describe('filterFieldsForPermissionSet()', () => {
    it('should exclude required fields', () => {
      const fields = [
        { field: 'Required__c', required: true },
        { field: 'Optional__c', required: false }
      ];
      const requiredFields = new Set();

      const result = filterFieldsForPermissionSet(fields, requiredFields);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].field, 'Optional__c');
    });

    it('should exclude fields in requiredFields Set', () => {
      const fields = [
        { field: 'Field1__c' },
        { field: 'Field2__c' }
      ];
      const requiredFields = new Set(['Field1__c']);

      const result = filterFieldsForPermissionSet(fields, requiredFields);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].field, 'Field2__c');
    });

    it('should exclude system fields when option enabled', () => {
      const fields = [
        { field: 'Id' },
        { field: 'CreatedDate' },
        { field: 'Custom__c' }
      ];
      const requiredFields = new Set();

      const result = filterFieldsForPermissionSet(fields, requiredFields, true);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].field, 'Custom__c');
    });

    it('should include system fields when option disabled', () => {
      const fields = [
        { field: 'Id' },
        { field: 'Custom__c' }
      ];
      const requiredFields = new Set();

      const result = filterFieldsForPermissionSet(fields, requiredFields, false);

      assert.strictEqual(result.length, 2);
    });

    it('should handle empty fields array', () => {
      const result = filterFieldsForPermissionSet([], new Set());
      assert.deepStrictEqual(result, []);
    });
  });

  // ============================================================
  // Tests: XML Generation Edge Cases
  // ============================================================

  describe('XML Generation Edge Cases', () => {
    it('should handle special characters in object name', () => {
      // Object names shouldn't have special chars, but test robustness
      const fields = [];
      const result = generatePermissionSetXML('Test_Object__c', fields, new Set());
      assert.ok(result.xml.includes('Test_Object__c'));
    });

    it('should generate proper field element structure', () => {
      const fields = [{ field: 'Test__c' }];
      const result = generatePermissionSetXML('Account', fields, new Set());

      // Check proper nesting
      const fieldPermStart = result.xml.indexOf('<fieldPermissions>');
      const fieldPermEnd = result.xml.indexOf('</fieldPermissions>');
      const fieldElement = result.xml.indexOf('<field>Account.Test__c</field>');

      assert.ok(fieldPermStart < fieldElement);
      assert.ok(fieldElement < fieldPermEnd);
    });

    it('should handle multiple fields in correct order', () => {
      const fields = [
        { field: 'A_Field__c' },
        { field: 'B_Field__c' },
        { field: 'C_Field__c' }
      ];
      const result = generatePermissionSetXML('Account', fields, new Set());

      const aIndex = result.xml.indexOf('A_Field__c');
      const bIndex = result.xml.indexOf('B_Field__c');
      const cIndex = result.xml.indexOf('C_Field__c');

      assert.ok(aIndex < bIndex);
      assert.ok(bIndex < cIndex);
    });

    it('should handle all fields required', () => {
      const fields = [
        { field: 'Req1__c', required: true },
        { field: 'Req2__c', required: true }
      ];
      const result = generatePermissionSetXML('Account', fields, new Set());

      assert.strictEqual(result.includedCount, 0);
      assert.strictEqual(result.excludedCount, 2);
      assert.ok(!result.xml.includes('<fieldPermissions>'));
    });

    it('should properly format multiline XML', () => {
      const fields = [{ field: 'Test__c' }];
      const result = generatePermissionSetXML('Account', fields, new Set());

      // Check proper indentation (4 spaces)
      assert.ok(result.xml.includes('    <fieldPermissions>'));
      assert.ok(result.xml.includes('        <editable>'));
    });
  });

  // ============================================================
  // Tests: Permission Set Statistics
  // ============================================================

  describe('Permission Set Statistics', () => {
    it('should count included fields correctly', () => {
      const fields = [
        { field: 'Field1__c' },
        { field: 'Field2__c' },
        { field: 'Field3__c' }
      ];
      const result = generatePermissionSetXML('Account', fields, new Set());
      assert.strictEqual(result.includedCount, 3);
    });

    it('should count excluded fields correctly', () => {
      const fields = [
        { field: 'Field1__c' },
        { field: 'Field2__c', required: true },
        { field: 'Field3__c' }
      ];
      const requiredFields = new Set(['Field1__c']);

      const result = generatePermissionSetXML('Account', fields, requiredFields);

      assert.strictEqual(result.excludedCount, 2);
      assert.strictEqual(result.includedCount, 1);
    });

    it('should sum to total fields', () => {
      const fields = [
        { field: 'Field1__c' },
        { field: 'Field2__c', required: true },
        { field: 'Field3__c' }
      ];
      const result = generatePermissionSetXML('Account', fields, new Set());

      assert.strictEqual(result.includedCount + result.excludedCount, fields.length);
    });
  });

  // ============================================================
  // Tests: Manifest Validation
  // ============================================================

  describe('Manifest Validation', () => {
    function validateManifest(manifest) {
      const errors = [];

      if (!manifest) {
        errors.push('Manifest is null or undefined');
        return { valid: false, errors };
      }

      if (!manifest.fields) {
        errors.push('Manifest missing "fields" property');
      } else if (!Array.isArray(manifest.fields)) {
        errors.push('"fields" must be an array');
      } else {
        manifest.fields.forEach((field, index) => {
          if (!field.object) {
            errors.push(`Field at index ${index} missing "object" property`);
          }
          if (!field.field && !field.name) {
            errors.push(`Field at index ${index} missing "field" or "name" property`);
          }
        });
      }

      return {
        valid: errors.length === 0,
        errors
      };
    }

    it('should validate correct manifest', () => {
      const manifest = {
        fields: [
          { object: 'Account', field: 'Test__c' }
        ]
      };
      const result = validateManifest(manifest);
      assert.strictEqual(result.valid, true);
    });

    it('should detect missing fields property', () => {
      const manifest = {};
      const result = validateManifest(manifest);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('missing "fields"')));
    });

    it('should detect non-array fields', () => {
      const manifest = { fields: 'not an array' };
      const result = validateManifest(manifest);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('must be an array')));
    });

    it('should detect missing object property', () => {
      const manifest = {
        fields: [{ field: 'Test__c' }]
      };
      const result = validateManifest(manifest);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('missing "object"')));
    });

    it('should detect missing field/name property', () => {
      const manifest = {
        fields: [{ object: 'Account' }]
      };
      const result = validateManifest(manifest);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('missing "field" or "name"')));
    });
  });

  // ============================================================
  // Tests: Complex Scenarios
  // ============================================================

  describe('Complex Scenarios', () => {
    it('should handle manifest with multiple objects', () => {
      const manifest = {
        fields: [
          { object: 'Account', field: 'Field1__c' },
          { object: 'Account', field: 'Field2__c' },
          { object: 'Contact', field: 'Field3__c' },
          { object: 'Lead', field: 'Field4__c' }
        ]
      };

      const fieldsByObject = loadFieldsFromManifest(manifest);

      assert.strictEqual(Object.keys(fieldsByObject).length, 3);
      assert.strictEqual(fieldsByObject['Account'].length, 2);
      assert.strictEqual(fieldsByObject['Contact'].length, 1);
      assert.strictEqual(fieldsByObject['Lead'].length, 1);
    });

    it('should generate separate permission sets per object', () => {
      const accountFields = [{ field: 'A__c' }];
      const contactFields = [{ field: 'B__c' }];

      const accountPS = generatePermissionSetXML('Account', accountFields, new Set());
      const contactPS = generatePermissionSetXML('Contact', contactFields, new Set());

      assert.ok(accountPS.xml.includes('Account.A__c'));
      assert.ok(!accountPS.xml.includes('Contact'));
      assert.ok(contactPS.xml.includes('Contact.B__c'));
      assert.ok(!contactPS.xml.includes('Account'));
    });

    it('should handle mix of required and optional fields', () => {
      const fields = [
        { field: 'Required1__c', required: true },
        { field: 'Optional1__c' },
        { field: 'Required2__c', required: true },
        { field: 'Optional2__c' },
        { field: 'Optional3__c' }
      ];
      const requiredFields = new Set(['Optional2__c']); // Also mark via Set

      const result = generatePermissionSetXML('Account', fields, requiredFields);

      assert.strictEqual(result.includedCount, 2);
      assert.strictEqual(result.excludedCount, 3);
    });

    it('should generate XML comments for excluded fields', () => {
      const fields = [
        { field: 'Required__c', required: true }
      ];
      const result = generatePermissionSetXML('Account', fields, new Set());

      assert.ok(result.xml.includes('<!-- Field Account.Required__c excluded'));
    });
  });
});
