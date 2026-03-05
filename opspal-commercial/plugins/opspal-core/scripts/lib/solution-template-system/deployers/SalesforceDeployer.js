/**
 * SalesforceDeployer.js
 *
 * Salesforce metadata deployment adapter for the Solution Template System.
 * Handles deployment of flows, custom fields, validation rules, permission sets,
 * and other Salesforce metadata types.
 *
 * @module solution-template-system/deployers/SalesforceDeployer
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, exec } = require('child_process');

/**
 * Salesforce metadata deployer
 */
class SalesforceDeployer {
  constructor(options = {}) {
    this.options = {
      orgAlias: options.credentials?.orgAlias || process.env.SF_ORG_ALIAS,
      apiVersion: options.credentials?.apiVersion || '62.0',
      testLevel: options.defaults?.testLevel || 'NoTestRun',
      checkOnly: options.defaults?.checkOnly || false,
      waitTime: options.defaults?.waitTime || 30,
      ignoreWarnings: options.defaults?.ignoreWarnings || false,
      stagingDir: options.stagingDir || path.join(os.tmpdir(), 'sf-deployment'),
      verbose: options.verbose || false,
      ...options
    };

    // Metadata type mappings
    this.metadataTypes = {
      flow: { folder: 'flows', extension: '.flow-meta.xml' },
      customField: { folder: 'objects', extension: '.field-meta.xml', nested: true },
      validationRule: { folder: 'objects', extension: '.validationRule-meta.xml', nested: true },
      permissionSet: { folder: 'permissionsets', extension: '.permissionset-meta.xml' },
      profile: { folder: 'profiles', extension: '.profile-meta.xml' },
      layout: { folder: 'layouts', extension: '.layout-meta.xml' },
      customObject: { folder: 'objects', extension: '.object-meta.xml' },
      apexClass: { folder: 'classes', extension: '.cls' },
      apexTrigger: { folder: 'triggers', extension: '.trigger' },
      lightningComponentBundle: { folder: 'lwc', extension: '', isDir: true },
      flexipage: { folder: 'flexipages', extension: '.flexipage-meta.xml' },
      tab: { folder: 'tabs', extension: '.tab-meta.xml' },
      customLabel: { folder: 'labels', extension: '.labels-meta.xml' },
      emailTemplate: { folder: 'email', extension: '.email-meta.xml' },
      report: { folder: 'reports', extension: '.report-meta.xml' },
      dashboard: { folder: 'dashboards', extension: '.dashboard-meta.xml' }
    };
  }

  /**
   * Deploy a component to Salesforce
   * @param {Object} deployConfig - Deployment configuration
   * @returns {Object} Deployment result
   */
  async deploy(deployConfig) {
    const { component, metadataType, content, environment } = deployConfig;

    try {
      // Validate org connection
      await this.validateOrgConnection();

      // Prepare staging area
      const stagingPath = await this.prepareStaging(component, metadataType, content);

      // Generate package.xml
      const packageXmlPath = await this.generatePackageXml(
        stagingPath,
        component,
        metadataType
      );

      // Execute deployment
      const result = await this.executeDeploy(stagingPath);

      // Clean up staging
      await this.cleanupStaging(stagingPath);

      return {
        success: result.success,
        component: component.id,
        type: metadataType,
        deploymentId: result.deploymentId,
        details: result.details
      };
    } catch (error) {
      return {
        success: false,
        component: component.id,
        type: metadataType,
        error: error.message,
        stack: error.stack
      };
    }
  }

  /**
   * Validate Salesforce org connection
   */
  async validateOrgConnection() {
    if (!this.options.orgAlias) {
      throw new Error('No Salesforce org alias specified');
    }

    try {
      const result = execSync(
        `sf org display --target-org ${this.options.orgAlias} --json`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      );

      const parsed = JSON.parse(result);

      if (parsed.status !== 0) {
        throw new Error(`Org connection failed: ${parsed.message}`);
      }

      this.log(`Connected to org: ${parsed.result.username}`);
      return true;
    } catch (error) {
      throw new Error(`Failed to connect to Salesforce org: ${error.message}`);
    }
  }

  /**
   * Prepare staging directory with component files
   * @param {Object} component - Component to deploy
   * @param {string} metadataType - Salesforce metadata type
   * @param {string} content - Rendered template content
   * @returns {string} Path to staging directory
   */
  async prepareStaging(component, metadataType, content) {
    const timestamp = Date.now();
    const stagingPath = path.join(
      this.options.stagingDir,
      `${component.id}-${timestamp}`
    );

    // Create staging directory structure
    const srcPath = path.join(stagingPath, 'force-app', 'main', 'default');
    fs.mkdirSync(srcPath, { recursive: true });

    // Get metadata type info
    const typeInfo = this.metadataTypes[metadataType];

    if (!typeInfo) {
      throw new Error(`Unknown metadata type: ${metadataType}`);
    }

    // Create type-specific folder
    const typePath = path.join(srcPath, typeInfo.folder);
    fs.mkdirSync(typePath, { recursive: true });

    // Write component file
    let filePath;

    if (typeInfo.nested) {
      // Nested types (like fields, validation rules) go inside object folders
      const objectName = this.extractObjectName(component, content);
      const objectPath = path.join(typePath, objectName);
      fs.mkdirSync(objectPath, { recursive: true });

      if (metadataType === 'customField') {
        const fieldFolder = path.join(objectPath, 'fields');
        fs.mkdirSync(fieldFolder, { recursive: true });
        filePath = path.join(fieldFolder, `${component.id}${typeInfo.extension}`);
      } else if (metadataType === 'validationRule') {
        const ruleFolder = path.join(objectPath, 'validationRules');
        fs.mkdirSync(ruleFolder, { recursive: true });
        filePath = path.join(ruleFolder, `${component.id}${typeInfo.extension}`);
      }
    } else if (typeInfo.isDir) {
      // Bundle types (like LWC)
      const bundlePath = path.join(typePath, component.id);
      fs.mkdirSync(bundlePath, { recursive: true });
      // For LWC, content should be a JSON with multiple files
      const files = this.parseBundleContent(content);
      for (const [filename, fileContent] of Object.entries(files)) {
        fs.writeFileSync(path.join(bundlePath, filename), fileContent);
      }
      filePath = bundlePath;
    } else {
      // Standard flat files
      filePath = path.join(typePath, `${component.id}${typeInfo.extension}`);
      fs.writeFileSync(filePath, content);
    }

    if (!typeInfo.isDir) {
      fs.writeFileSync(filePath, content);
    }

    // Create sfdx-project.json
    const projectConfig = {
      packageDirectories: [{ path: 'force-app', default: true }],
      namespace: '',
      sfdcLoginUrl: 'https://login.salesforce.com',
      sourceApiVersion: this.options.apiVersion
    };

    fs.writeFileSync(
      path.join(stagingPath, 'sfdx-project.json'),
      JSON.stringify(projectConfig, null, 2)
    );

    this.log(`Prepared staging at: ${stagingPath}`);
    return stagingPath;
  }

  /**
   * Generate package.xml for deployment
   * @param {string} stagingPath - Staging directory path
   * @param {Object} component - Component being deployed
   * @param {string} metadataType - Metadata type
   * @returns {string} Path to package.xml
   */
  async generatePackageXml(stagingPath, component, metadataType) {
    const manifestPath = path.join(stagingPath, 'force-app', 'main', 'default');

    // Map internal type to Salesforce API type name
    const apiTypeName = this.getApiTypeName(metadataType);

    const packageXml = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>${component.id}</members>
        <name>${apiTypeName}</name>
    </types>
    <version>${this.options.apiVersion}</version>
</Package>`;

    const packagePath = path.join(stagingPath, 'manifest', 'package.xml');
    fs.mkdirSync(path.join(stagingPath, 'manifest'), { recursive: true });
    fs.writeFileSync(packagePath, packageXml);

    return packagePath;
  }

  /**
   * Execute the Salesforce deployment
   * @param {string} stagingPath - Staging directory path
   * @returns {Object} Deployment result
   */
  async executeDeploy(stagingPath) {
    const args = [
      'sf project deploy start',
      `--source-dir ${path.join(stagingPath, 'force-app')}`,
      `--target-org ${this.options.orgAlias}`,
      `--wait ${this.options.waitTime}`,
      `--test-level ${this.options.testLevel}`,
      '--json'
    ];

    if (this.options.checkOnly) {
      args.push('--check-only');
    }

    if (this.options.ignoreWarnings) {
      args.push('--ignore-warnings');
    }

    const command = args.join(' ');
    this.log(`Executing: ${command}`);

    return new Promise((resolve, reject) => {
      exec(command, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
        try {
          const result = JSON.parse(stdout || '{}');

          if (result.status === 0 || result.result?.status === 'Succeeded') {
            resolve({
              success: true,
              deploymentId: result.result?.id,
              details: {
                numberComponentsDeployed: result.result?.numberComponentsDeployed,
                numberComponentsTotal: result.result?.numberComponentsTotal,
                runTestsEnabled: result.result?.runTestsEnabled,
                testResults: result.result?.details?.runTestResult
              }
            });
          } else {
            const errorDetails = result.result?.details?.componentFailures || [];
            resolve({
              success: false,
              deploymentId: result.result?.id,
              error: errorDetails.map(f => f.problem).join('; ') || result.message,
              details: errorDetails
            });
          }
        } catch (parseError) {
          reject(new Error(`Failed to parse deployment result: ${parseError.message}`));
        }
      });
    });
  }

  /**
   * Clean up staging directory
   * @param {string} stagingPath - Staging directory path
   */
  async cleanupStaging(stagingPath) {
    if (fs.existsSync(stagingPath)) {
      fs.rmSync(stagingPath, { recursive: true, force: true });
      this.log(`Cleaned up staging: ${stagingPath}`);
    }
  }

  /**
   * Retrieve component from org (for checkpointing)
   * @param {Object} component - Component to retrieve
   * @param {string} metadataType - Metadata type
   * @returns {Object} Retrieved content
   */
  async retrieve(component, metadataType) {
    const apiTypeName = this.getApiTypeName(metadataType);
    const timestamp = Date.now();
    const retrievePath = path.join(
      this.options.stagingDir,
      `retrieve-${component.id}-${timestamp}`
    );

    fs.mkdirSync(retrievePath, { recursive: true });

    try {
      const command = [
        'sf project retrieve start',
        `--metadata "${apiTypeName}:${component.id}"`,
        `--target-org ${this.options.orgAlias}`,
        `--output-dir ${retrievePath}`,
        '--json'
      ].join(' ');

      const result = execSync(command, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });

      const parsed = JSON.parse(result);

      if (parsed.status === 0) {
        // Read retrieved content
        const typeInfo = this.metadataTypes[metadataType];
        const contentPath = path.join(
          retrievePath,
          'force-app',
          'main',
          'default',
          typeInfo.folder,
          `${component.id}${typeInfo.extension}`
        );

        if (fs.existsSync(contentPath)) {
          return {
            success: true,
            content: fs.readFileSync(contentPath, 'utf-8'),
            metadata: parsed.result
          };
        }
      }

      return {
        success: false,
        error: parsed.message || 'Retrieve failed'
      };
    } finally {
      // Clean up
      if (fs.existsSync(retrievePath)) {
        fs.rmSync(retrievePath, { recursive: true, force: true });
      }
    }
  }

  /**
   * Activate a flow after deployment
   * @param {string} flowName - Flow API name
   * @param {number} version - Flow version number (default: latest)
   * @returns {Object} Activation result
   */
  async activateFlow(flowName, version = null) {
    try {
      // Query for flow version
      const query = version
        ? `SELECT Id FROM FlowVersionView WHERE FlowDefinitionView.ApiName='${flowName}' AND VersionNumber=${version}`
        : `SELECT Id FROM FlowVersionView WHERE FlowDefinitionView.ApiName='${flowName}' ORDER BY VersionNumber DESC LIMIT 1`;

      const queryResult = execSync(
        `sf data query --query "${query}" --target-org ${this.options.orgAlias} --json`,
        { encoding: 'utf-8' }
      );

      const parsed = JSON.parse(queryResult);

      if (parsed.result?.records?.length === 0) {
        return {
          success: false,
          error: `Flow version not found: ${flowName}`
        };
      }

      const flowVersionId = parsed.result.records[0].Id;

      // Activate the flow (requires Tooling API)
      const activateCommand = [
        'sf data update record',
        '--sobject FlowDefinition',
        `--where "DeveloperName='${flowName}'"`,
        `--values "ActiveVersionId='${flowVersionId}'"`,
        `--target-org ${this.options.orgAlias}`,
        '--use-tooling-api',
        '--json'
      ].join(' ');

      const activateResult = execSync(activateCommand, { encoding: 'utf-8' });
      const activateParsed = JSON.parse(activateResult);

      return {
        success: activateParsed.status === 0,
        flowName,
        activatedVersion: flowVersionId
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Deactivate a flow (for rollback)
   * @param {string} flowName - Flow API name
   * @returns {Object} Deactivation result
   */
  async deactivateFlow(flowName) {
    try {
      const deactivateCommand = [
        'sf data update record',
        '--sobject FlowDefinition',
        `--where "DeveloperName='${flowName}'"`,
        `--values "ActiveVersionId=''"`,
        `--target-org ${this.options.orgAlias}`,
        '--use-tooling-api',
        '--json'
      ].join(' ');

      const result = execSync(deactivateCommand, { encoding: 'utf-8' });
      const parsed = JSON.parse(result);

      return {
        success: parsed.status === 0,
        flowName
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get Salesforce API type name from internal type
   * @param {string} metadataType - Internal metadata type
   * @returns {string} Salesforce API type name
   */
  getApiTypeName(metadataType) {
    const typeMapping = {
      flow: 'Flow',
      customField: 'CustomField',
      validationRule: 'ValidationRule',
      permissionSet: 'PermissionSet',
      profile: 'Profile',
      layout: 'Layout',
      customObject: 'CustomObject',
      apexClass: 'ApexClass',
      apexTrigger: 'ApexTrigger',
      lightningComponentBundle: 'LightningComponentBundle',
      flexipage: 'FlexiPage',
      tab: 'CustomTab',
      customLabel: 'CustomLabel',
      emailTemplate: 'EmailTemplate',
      report: 'Report',
      dashboard: 'Dashboard'
    };

    return typeMapping[metadataType] || metadataType;
  }

  /**
   * Extract object name from component or content
   * @param {Object} component - Component
   * @param {string} content - Template content
   * @returns {string} Object API name
   */
  extractObjectName(component, content) {
    // Try to get from component metadata
    if (component.objectName) {
      return component.objectName;
    }

    // Try to parse from content
    const objectMatch = content.match(/<fullName>(\w+)\.(\w+)<\/fullName>/);
    if (objectMatch) {
      return objectMatch[1];
    }

    // Try to extract from component ID (e.g., "Account.MyField__c")
    const idParts = component.id.split('.');
    if (idParts.length >= 2) {
      return idParts[0];
    }

    throw new Error(`Cannot determine object name for component: ${component.id}`);
  }

  /**
   * Parse bundle content (for LWC, etc.)
   * @param {string} content - JSON content with file map
   * @returns {Object} File map
   */
  parseBundleContent(content) {
    try {
      return JSON.parse(content);
    } catch {
      // If not JSON, treat as single file
      return { 'component.js': content };
    }
  }

  /**
   * Log message if verbose mode enabled
   * @param {...any} args - Log arguments
   */
  log(...args) {
    if (this.options.verbose) {
      console.log('[SalesforceDeployer]', ...args);
    }
  }
}

module.exports = SalesforceDeployer;
