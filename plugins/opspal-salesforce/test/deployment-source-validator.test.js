/**
 * Test Suite: Deployment Source Validator
 *
 * Tests validation of deployment sources to prevent ComponentSetError failures.
 * This validator blocks deployment failures BEFORE they happen.
 *
 * Validates:
 * - Source directories exist and contain metadata
 * - package.xml references valid files
 * - Metadata types are correctly formatted
 * - Required Salesforce project config exists
 *
 * Coverage Target: >80%
 * Priority: Tier 1 (Critical - Prevents Deploy Failures)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DeploymentSourceValidator = require('../scripts/lib/deployment-source-validator');

describe('DeploymentSourceValidator', () => {
  let validator;
  let tempDir;

  beforeEach(() => {
    validator = new DeploymentSourceValidator({ verbose: false });
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-test-'));
  });

  afterEach(() => {
    // Cleanup temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // Helper to create temp directory structure
  function createDirStructure(basePath, structure) {
    for (const [name, content] of Object.entries(structure)) {
      const itemPath = path.join(basePath, name);
      if (typeof content === 'object' && content !== null && !Buffer.isBuffer(content)) {
        fs.mkdirSync(itemPath, { recursive: true });
        createDirStructure(itemPath, content);
      } else {
        fs.mkdirSync(path.dirname(itemPath), { recursive: true });
        fs.writeFileSync(itemPath, content || '');
      }
    }
  }

  describe('Constructor', () => {
    it('should initialize with default options', () => {
      const v = new DeploymentSourceValidator();
      assert.strictEqual(v.verbose, false);
      assert.strictEqual(v.projectRoot, process.cwd());
    });

    it('should accept custom options', () => {
      const v = new DeploymentSourceValidator({
        verbose: true,
        projectRoot: '/custom/path'
      });
      assert.strictEqual(v.verbose, true);
      assert.strictEqual(v.projectRoot, '/custom/path');
    });
  });

  describe('validateSourceDir()', () => {
    describe('path validation', () => {
      it('should fail when path does not exist', async () => {
        const result = await validator.validateSourceDir('/nonexistent/path');
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('does not exist')));
      });

      it('should fail when path is a file, not directory', async () => {
        const filePath = path.join(tempDir, 'test-file.txt');
        fs.writeFileSync(filePath, 'content');

        const result = await validator.validateSourceDir(filePath);
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('not a directory')));
      });

      it('should handle relative paths', async () => {
        // Create valid source structure
        createDirStructure(tempDir, {
          'force-app': {
            'main': {
              'default': {
                'classes': {
                  'MyClass.cls': 'public class MyClass {}'
                }
              }
            }
          },
          'sfdx-project.json': '{}'
        });

        const v = new DeploymentSourceValidator({
          projectRoot: tempDir,
          verbose: false
        });

        const result = await v.validateSourceDir('force-app');
        assert.strictEqual(result.valid, true);
      });

      it('should handle absolute paths', async () => {
        createDirStructure(tempDir, {
          'force-app': {
            'main': {
              'default': {
                'triggers': {
                  'MyTrigger.trigger': 'trigger MyTrigger on Account {}'
                }
              }
            }
          }
        });

        const result = await validator.validateSourceDir(tempDir);
        assert.strictEqual(result.valid, true);
      });
    });

    describe('metadata structure validation', () => {
      it('should fail when no source-formatted metadata found', async () => {
        // Create empty directory
        fs.mkdirSync(path.join(tempDir, 'empty'), { recursive: true });

        const result = await validator.validateSourceDir(path.join(tempDir, 'empty'));
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('No source-formatted metadata')));
      });

      it('should fail when metadata directory is empty', async () => {
        // Create structure with empty metadata directories
        createDirStructure(tempDir, {
          'force-app': {
            'main': {
              'default': {
                'classes': {} // Empty
              }
            }
          }
        });

        const result = await validator.validateSourceDir(tempDir);
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('no deployable metadata')));
      });

      it('should pass with valid classes directory', async () => {
        createDirStructure(tempDir, {
          'force-app': {
            'main': {
              'default': {
                'classes': {
                  'TestClass.cls': 'public class TestClass {}',
                  'TestClass.cls-meta.xml': '<ApexClass/>'
                }
              }
            }
          }
        });

        const result = await validator.validateSourceDir(tempDir);
        assert.strictEqual(result.valid, true);
        assert.strictEqual(result.metadata.found, true);
        assert.ok(result.metadata.types.some(t => t.type === 'ApexClass'));
      });

      it('should pass with valid triggers directory', async () => {
        createDirStructure(tempDir, {
          'force-app': {
            'main': {
              'default': {
                'triggers': {
                  'TestTrigger.trigger': 'trigger Test on Account {}'
                }
              }
            }
          }
        });

        const result = await validator.validateSourceDir(tempDir);
        assert.strictEqual(result.valid, true);
        assert.ok(result.metadata.types.some(t => t.type === 'ApexTrigger'));
      });

      it('should pass with valid flows directory', async () => {
        createDirStructure(tempDir, {
          'force-app': {
            'main': {
              'default': {
                'flows': {
                  'TestFlow.flow-meta.xml': '<Flow/>'
                }
              }
            }
          }
        });

        const result = await validator.validateSourceDir(tempDir);
        assert.strictEqual(result.valid, true);
        assert.ok(result.metadata.types.some(t => t.type === 'Flow'));
      });

      it('should warn when validating an object leaf directory', async () => {
        createDirStructure(tempDir, {
          'force-app': {
            'main': {
              'default': {
                'objects': {
                  'Opportunity': {
                    'recordTypes': {
                      'Enterprise.recordType-meta.xml': '<RecordType/>'
                    }
                  }
                }
              }
            }
          }
        });

        const result = await validator.validateSourceDir(
          path.join(tempDir, 'force-app/main/default/objects/Opportunity/recordTypes')
        );

        assert.strictEqual(result.valid, true);
        assert.ok(result.warnings.some(w => w.includes('objects/Opportunity/')));
      });

      it('should not warn when validating an object root directory', async () => {
        createDirStructure(tempDir, {
          'force-app': {
            'main': {
              'default': {
                'objects': {
                  'Opportunity': {
                    'fields': {
                      'Stage__c.field-meta.xml': '<CustomField/>'
                    },
                    'recordTypes': {
                      'Enterprise.recordType-meta.xml': '<RecordType/>'
                    }
                  }
                }
              }
            }
          }
        });

        const result = await validator.validateSourceDir(
          path.join(tempDir, 'force-app/main/default/objects/Opportunity')
        );

        assert.strictEqual(result.valid, true);
        assert.strictEqual(result.warnings.some(w => w.includes('Object deployment path is scoped to a leaf directory')), false);
      });

      it('should detect multiple metadata types', async () => {
        createDirStructure(tempDir, {
          'force-app': {
            'main': {
              'default': {
                'classes': { 'Class1.cls': '' },
                'triggers': { 'Trigger1.trigger': '' },
                'flows': { 'Flow1.flow-meta.xml': '' },
                'permissionsets': { 'PermSet1.permissionset-meta.xml': '' }
              }
            }
          }
        });

        const result = await validator.validateSourceDir(tempDir);
        assert.strictEqual(result.valid, true);
        assert.strictEqual(result.metadata.types.length, 4);
      });
    });

    describe('project config validation', () => {
      it('should warn when sfdx-project.json is missing', async () => {
        createDirStructure(tempDir, {
          'force-app': {
            'main': {
              'default': {
                'classes': { 'Test.cls': '' }
              }
            }
          }
          // No sfdx-project.json
        });

        const result = await validator.validateSourceDir(tempDir);
        assert.strictEqual(result.valid, true); // Still valid, just warns
        assert.ok(result.warnings.some(w => w.includes('sfdx-project.json')));
      });

      it('should not warn when sfdx-project.json exists', async () => {
        createDirStructure(tempDir, {
          'force-app': {
            'main': {
              'default': {
                'classes': { 'Test.cls': '' }
              }
            }
          },
          'sfdx-project.json': '{"packageDirectories": []}'
        });

        const result = await validator.validateSourceDir(tempDir);
        assert.strictEqual(result.valid, true);
        assert.ok(!result.warnings.some(w => w.includes('sfdx-project.json')));
      });
    });
  });

  describe('validateManifest()', () => {
    describe('file validation', () => {
      it('should fail when manifest file does not exist', async () => {
        const result = await validator.validateManifest('/nonexistent/package.xml');
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('Manifest file not found')));
      });

      it('should fail for invalid XML format', async () => {
        const manifestPath = path.join(tempDir, 'package.xml');
        fs.writeFileSync(manifestPath, 'not xml content');

        const result = await validator.validateManifest(manifestPath);
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('Invalid package.xml format')));
      });

      it('should fail when no types defined', async () => {
        const manifestPath = path.join(tempDir, 'package.xml');
        fs.writeFileSync(manifestPath, `<?xml version="1.0"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
  <version>62.0</version>
</Package>`);

        const result = await validator.validateManifest(manifestPath);
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('No metadata types defined')));
      });

      it('should fail when no members defined', async () => {
        const manifestPath = path.join(tempDir, 'package.xml');
        fs.writeFileSync(manifestPath, `<?xml version="1.0"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
  <types>
    <name>ApexClass</name>
  </types>
  <version>62.0</version>
</Package>`);

        const result = await validator.validateManifest(manifestPath);
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('No members defined')));
      });
    });

    describe('valid manifests', () => {
      it('should pass for valid manifest with single type', async () => {
        const manifestPath = path.join(tempDir, 'package.xml');
        fs.writeFileSync(manifestPath, `<?xml version="1.0"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
  <types>
    <members>MyClass</members>
    <name>ApexClass</name>
  </types>
  <version>62.0</version>
</Package>`);

        const result = await validator.validateManifest(manifestPath);
        assert.strictEqual(result.valid, true);
        assert.strictEqual(result.members.total, 1);
        assert.ok(result.members.types.includes('ApexClass'));
      });

      it('should pass for manifest with multiple types and members', async () => {
        const manifestPath = path.join(tempDir, 'package.xml');
        fs.writeFileSync(manifestPath, `<?xml version="1.0"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
  <types>
    <members>Class1</members>
    <members>Class2</members>
    <name>ApexClass</name>
  </types>
  <types>
    <members>Trigger1</members>
    <name>ApexTrigger</name>
  </types>
  <types>
    <members>Flow1</members>
    <members>Flow2</members>
    <members>Flow3</members>
    <name>Flow</name>
  </types>
  <version>62.0</version>
</Package>`);

        const result = await validator.validateManifest(manifestPath);
        assert.strictEqual(result.valid, true);
        assert.strictEqual(result.members.total, 6);
        assert.strictEqual(result.members.types.length, 3);
        assert.ok(result.members.types.includes('ApexClass'));
        assert.ok(result.members.types.includes('ApexTrigger'));
        assert.ok(result.members.types.includes('Flow'));
      });

      it('should handle wildcard members', async () => {
        const manifestPath = path.join(tempDir, 'package.xml');
        fs.writeFileSync(manifestPath, `<?xml version="1.0"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
  <types>
    <members>*</members>
    <name>ApexClass</name>
  </types>
  <version>62.0</version>
</Package>`);

        const result = await validator.validateManifest(manifestPath);
        assert.strictEqual(result.valid, true);
        assert.strictEqual(result.members.total, 1);
      });
    });
  });

  describe('validateMetadata()', () => {
    describe('spec format validation', () => {
      it('should fail for invalid spec format (no colon)', async () => {
        const result = await validator.validateMetadata('ApexClass', 'my-org');
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('Invalid metadata spec format')));
      });

      it('should fail for empty type', async () => {
        const result = await validator.validateMetadata(':MyClass', 'my-org');
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('Invalid metadata spec format')));
      });

      it('should fail for empty name', async () => {
        const result = await validator.validateMetadata('ApexClass:', 'my-org');
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('Invalid metadata spec format')));
      });
    });

    describe('unsupported types', () => {
      it('should warn but pass for unsupported metadata types', async () => {
        const result = await validator.validateMetadata('UnsupportedType:SomeName', 'my-org');
        assert.strictEqual(result.valid, true);
        assert.ok(result.warnings.some(w => w.includes('Cannot verify')));
      });
    });
  });

  describe('findMetadataRoot()', () => {
    it('should find standard force-app/main/default structure', async () => {
      createDirStructure(tempDir, {
        'force-app': {
          'main': {
            'default': {
              'classes': { 'Test.cls': '' }
            }
          }
        }
      });

      const root = await validator.findMetadataRoot(tempDir);
      assert.ok(root);
      assert.ok(root.includes('default'));
    });

    it('should find main/default structure', async () => {
      const mainDir = path.join(tempDir, 'main');
      createDirStructure(mainDir, {
        'default': {
          'classes': { 'Test.cls': '' }
        }
      });

      const root = await validator.findMetadataRoot(mainDir);
      assert.ok(root);
    });

    it('should find default structure directly', async () => {
      const defaultDir = path.join(tempDir, 'default');
      createDirStructure(defaultDir, {
        'classes': { 'Test.cls': '' }
      });

      const root = await validator.findMetadataRoot(defaultDir);
      assert.ok(root);
    });

    it('should return null when no metadata found', async () => {
      fs.mkdirSync(path.join(tempDir, 'empty'), { recursive: true });

      const root = await validator.findMetadataRoot(path.join(tempDir, 'empty'));
      assert.strictEqual(root, null);
    });
  });

  describe('scanMetadataTypes()', () => {
    it('should scan all metadata type folders', async () => {
      const metadataRoot = path.join(tempDir, 'default');
      createDirStructure(metadataRoot, {
        'classes': { 'Class1.cls': '', 'Class2.cls': '' },
        'triggers': { 'Trigger1.trigger': '' },
        'flows': { 'Flow1.flow-meta.xml': '' },
        'objects': { 'Account': {} },
        'layouts': { 'Account-Layout.layout-meta.xml': '' },
        'permissionsets': { 'Admin.permissionset-meta.xml': '' },
        'profiles': { 'Admin.profile-meta.xml': '' }
      });

      const types = await validator.scanMetadataTypes(metadataRoot);

      assert.ok(types.length >= 7);
      assert.ok(types.some(t => t.type === 'ApexClass' && t.count === 2));
      assert.ok(types.some(t => t.type === 'ApexTrigger' && t.count === 1));
      assert.ok(types.some(t => t.type === 'Flow'));
      assert.ok(types.some(t => t.type === 'PermissionSet'));
    });

    it('should skip empty folders', async () => {
      const metadataRoot = path.join(tempDir, 'default');
      createDirStructure(metadataRoot, {
        'classes': { 'Class1.cls': '' },
        'triggers': {} // Empty
      });

      const types = await validator.scanMetadataTypes(metadataRoot);

      assert.ok(types.some(t => t.type === 'ApexClass'));
      assert.ok(!types.some(t => t.type === 'ApexTrigger'));
    });
  });

  describe('getMetadataQuery()', () => {
    it('should return query for ApexClass', () => {
      const query = validator.getMetadataQuery('ApexClass', 'MyClass');
      assert.ok(query.includes('ApexClass'));
      assert.ok(query.includes('MyClass'));
    });

    it('should return query for ApexTrigger', () => {
      const query = validator.getMetadataQuery('ApexTrigger', 'MyTrigger');
      assert.ok(query.includes('ApexTrigger'));
      assert.ok(query.includes('MyTrigger'));
    });

    it('should return query for Flow', () => {
      const query = validator.getMetadataQuery('Flow', 'MyFlow');
      assert.ok(query.includes('FlowDefinitionView'));
      assert.ok(query.includes('MyFlow'));
    });

    it('should return null for unsupported type', () => {
      const query = validator.getMetadataQuery('UnsupportedType', 'Name');
      assert.strictEqual(query, null);
    });
  });

  describe('generateErrorGuidance() - Static Method', () => {
    it('should generate helpful error guidance', () => {
      const guidance = DeploymentSourceValidator.generateErrorGuidance('/test/path');

      assert.ok(guidance.includes('/test/path'));
      assert.ok(guidance.includes('Common Solutions'));
      assert.ok(guidance.includes('force-app'));
      assert.ok(guidance.includes('sfdx-project.json'));
      assert.ok(guidance.includes('Required Structure'));
    });

    it('should include verification commands', () => {
      const guidance = DeploymentSourceValidator.generateErrorGuidance('./force-app');

      assert.ok(guidance.includes('ls -la'));
      assert.ok(guidance.includes('--metadata-dir'));
    });
  });

  describe('Integration Scenarios', () => {
    it('should validate complete project structure', async () => {
      // Create complete Salesforce project
      createDirStructure(tempDir, {
        'force-app': {
          'main': {
            'default': {
              'classes': {
                'AccountHandler.cls': 'public class AccountHandler {}',
                'AccountHandler.cls-meta.xml': '<ApexClass/>'
              },
              'triggers': {
                'AccountTrigger.trigger': 'trigger AccountTrigger on Account {}',
                'AccountTrigger.trigger-meta.xml': '<ApexTrigger/>'
              },
              'flows': {
                'AccountProcess.flow-meta.xml': '<Flow/>'
              },
              'permissionsets': {
                'Sales_User.permissionset-meta.xml': '<PermissionSet/>'
              }
            }
          }
        },
        'manifest': {
          'package.xml': `<?xml version="1.0"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
  <types>
    <members>AccountHandler</members>
    <name>ApexClass</name>
  </types>
  <types>
    <members>AccountTrigger</members>
    <name>ApexTrigger</name>
  </types>
  <types>
    <members>AccountProcess</members>
    <name>Flow</name>
  </types>
  <version>62.0</version>
</Package>`
        },
        'sfdx-project.json': JSON.stringify({
          packageDirectories: [{ path: 'force-app', default: true }],
          namespace: '',
          sfdcLoginUrl: 'https://login.salesforce.com',
          sourceApiVersion: '62.0'
        })
      });

      // Validate source
      const sourceResult = await validator.validateSourceDir(tempDir);
      assert.strictEqual(sourceResult.valid, true);
      assert.strictEqual(sourceResult.metadata.types.length, 4);

      // Validate manifest
      const manifestResult = await validator.validateManifest(
        path.join(tempDir, 'manifest', 'package.xml')
      );
      assert.strictEqual(manifestResult.valid, true);
      assert.strictEqual(manifestResult.members.total, 3);
    });

    it('should fail incomplete project structure', async () => {
      // Create incomplete project (missing metadata type folders)
      createDirStructure(tempDir, {
        'force-app': {
          'main': {
            'default': {} // Empty - no metadata folders
          }
        },
        'sfdx-project.json': '{}'
      });

      const result = await validator.validateSourceDir(tempDir);
      assert.strictEqual(result.valid, false);
      // Empty default folder has no metadata type folders, so we get this error
      assert.ok(result.errors.some(e => e.includes('No source-formatted metadata')));
    });
  });
});

describe('metadata folder registry', () => {
  it('registry includes folders previously missing (reflection 28462039)', () => {
    const { METADATA_FOLDERS, ROOT_DETECTION_FOLDERS } = require('../scripts/lib/sf-metadata-folders');
    const required = [
      'standardValueSets', 'reports', 'dashboards', 'customLabels',
      'staticresources', 'recordTypes', 'globalValueSets',
      'customPermissions', 'emailTemplates', 'approvalProcesses',
      'workflows', 'assignmentRules', 'quickActions', 'applications',
      'connectedApps', 'escalationRules', 'queues'
    ];
    for (const folder of required) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(METADATA_FOLDERS, folder),
        `METADATA_FOLDERS missing key: ${folder}`
      );
      assert.ok(
        ROOT_DETECTION_FOLDERS.has(folder),
        `ROOT_DETECTION_FOLDERS missing: ${folder}`
      );
    }
  });
});

describe('findMetadataRoot + scanMetadataTypes — expanded folder recognition', () => {
  let validator;
  let tempDir;

  beforeEach(() => {
    validator = new DeploymentSourceValidator({ verbose: false });
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-expanded-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function createDirStructure(basePath, structure) {
    for (const [name, content] of Object.entries(structure)) {
      const itemPath = path.join(basePath, name);
      if (typeof content === 'object' && content !== null && !Buffer.isBuffer(content)) {
        fs.mkdirSync(itemPath, { recursive: true });
        createDirStructure(itemPath, content);
      } else {
        fs.mkdirSync(path.dirname(itemPath), { recursive: true });
        fs.writeFileSync(itemPath, content || '');
      }
    }
  }

  it('recognizes a metadata root containing only standardValueSets/', async () => {
    createDirStructure(tempDir, {
      'force-app': {
        'main': {
          'default': {
            'standardValueSets': {
              'LeadSource.standardValueSet-meta.xml': '<StandardValueSet/>'
            }
          }
        }
      }
    });

    const result = await validator.validateSourceDir(tempDir);
    assert.strictEqual(result.valid, true, `Expected valid but got errors: ${JSON.stringify(result.errors)}`);
    assert.ok(
      result.metadata.types.some(t => t.folder === 'standardValueSets'),
      'Expected standardValueSets in detected types'
    );
  });

  it('recognizes a metadata root containing only reports/', async () => {
    createDirStructure(tempDir, {
      'force-app': {
        'main': {
          'default': {
            'reports': {
              'MyFolder': {
                'MyReport.report-meta.xml': '<Report/>'
              }
            }
          }
        }
      }
    });

    const result = await validator.validateSourceDir(tempDir);
    assert.strictEqual(result.valid, true, `Expected valid but got errors: ${JSON.stringify(result.errors)}`);
    assert.ok(
      result.metadata.types.some(t => t.folder === 'reports'),
      'Expected reports in detected types'
    );
  });
});
