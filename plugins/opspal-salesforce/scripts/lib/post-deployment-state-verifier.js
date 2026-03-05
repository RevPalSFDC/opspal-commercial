#!/usr/bin/env node

/**
 * Post-Deployment State Verifier
 *
 * Retrieves deployed components from Salesforce org and compares them to local metadata files
 * to ensure deployed state matches requested configuration.
 *
 * Prevents silent failures where deployment succeeds but configuration doesn't match request.
 *
 * Usage:
 *   node scripts/lib/post-deployment-state-verifier.js <org-alias> <component-type> <component-name> [local-file-path]
 *
 * Examples:
 *   node scripts/lib/post-deployment-state-verifier.js delta-sandbox Profile Admin
 *   node scripts/lib/post-deployment-state-verifier.js delta-sandbox CustomTab Approval_Rule__c force-app/main/default/tabs/Approval_Rule__c.tab-meta.xml
 *   node scripts/lib/post-deployment-state-verifier.js delta-sandbox PermissionSet Advanced_Approvals_Tab_Access
 *
 * Exit Codes:
 *   0 - Verification passed (org state matches local file)
 *   1 - Verification failed (mismatch detected)
 *   2 - Error during verification (unable to retrieve or parse)
 *
 * @author RevPal Agent System
 * @version 1.0.0
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');

// ANSI color codes for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

/**
 * Supported component types and their metadata mappings
 */
const COMPONENT_TYPES = {
  Profile: {
    metadataType: 'Profile',
    extension: '.profile-meta.xml',
    defaultPath: 'force-app/main/default/profiles'
  },
  PermissionSet: {
    metadataType: 'PermissionSet',
    extension: '.permissionset-meta.xml',
    defaultPath: 'force-app/main/default/permissionsets'
  },
  CustomTab: {
    metadataType: 'CustomTab',
    extension: '.tab-meta.xml',
    defaultPath: 'force-app/main/default/tabs'
  },
  CustomApplication: {
    metadataType: 'CustomApplication',
    extension: '.app-meta.xml',
    defaultPath: 'force-app/main/default/applications'
  },
  CustomObject: {
    metadataType: 'CustomObject',
    extension: '.object-meta.xml',
    defaultPath: 'force-app/main/default/objects'
  },
  CustomField: {
    metadataType: 'CustomField',
    extension: '.field-meta.xml',
    defaultPath: 'force-app/main/default/objects'
  },
  Layout: {
    metadataType: 'Layout',
    extension: '.layout-meta.xml',
    defaultPath: 'force-app/main/default/layouts'
  }
};

/**
 * Critical fields to verify by component type
 * These are the fields most likely to cause user-facing issues if mismatched
 */
const CRITICAL_FIELDS = {
  Profile: {
    tabVisibilities: {
      path: ['Profile', 'tabVisibilities'],
      comparator: 'arrayOfObjects',
      keys: ['tab', 'visibility']
    },
    applicationVisibilities: {
      path: ['Profile', 'applicationVisibilities'],
      comparator: 'arrayOfObjects',
      keys: ['application', 'default', 'visible']
    }
  },
  PermissionSet: {
    tabSettings: {
      path: ['PermissionSet', 'tabSettings'],
      comparator: 'arrayOfObjects',
      keys: ['tab', 'visibility']
    },
    applicationVisibilities: {
      path: ['PermissionSet', 'applicationVisibilities'],
      comparator: 'arrayOfObjects',
      keys: ['application', 'default', 'visible']
    }
  },
  CustomTab: {
    customObject: {
      path: ['CustomTab', 'customObject'],
      comparator: 'string'
    },
    motif: {
      path: ['CustomTab', 'motif'],
      comparator: 'string'
    }
  },
  CustomApplication: {
    tabs: {
      path: ['CustomApplication', 'tabs'],
      comparator: 'array'
    }
  },
  Layout: {
    layoutSections: {
      path: ['Layout', 'layoutSections'],
      comparator: 'arrayOfObjects',
      keys: ['label']
    }
  }
};

class DeploymentVerifier {
  constructor(orgAlias, componentType, componentName, localFilePath) {
    this.orgAlias = orgAlias;
    this.componentType = componentType;
    this.componentName = componentName;
    this.localFilePath = localFilePath;
    this.errors = [];
    this.warnings = [];
  }

  /**
   * Main verification workflow
   */
  async verify() {
    try {
      console.log(`${colors.cyan}=== Post-Deployment Verification ===${colors.reset}`);
      console.log(`Org: ${this.orgAlias}`);
      console.log(`Component: ${this.componentType}:${this.componentName}`);
      console.log('');

      // Step 1: Determine local file path
      const localFile = this.resolveLocalFilePath();
      if (!localFile) {
        this.errors.push('Local metadata file not found or not specified');
        return this.reportResults();
      }

      // Step 2: Parse local metadata
      const localMetadata = await this.parseXmlFile(localFile);
      if (!localMetadata) {
        this.errors.push('Failed to parse local metadata file');
        return this.reportResults();
      }

      // Step 3: Retrieve org metadata
      const orgMetadata = await this.retrieveOrgMetadata();
      if (!orgMetadata) {
        this.errors.push('Failed to retrieve metadata from org');
        return this.reportResults();
      }

      // Step 4: Compare critical fields
      this.compareMetadata(localMetadata, orgMetadata);

      // Step 5: Report results
      return this.reportResults();

    } catch (error) {
      console.error(`${colors.red}Error during verification: ${error.message}${colors.reset}`);
      process.exit(2);
    }
  }

  /**
   * Resolve the local file path
   */
  resolveLocalFilePath() {
    if (this.localFilePath && fs.existsSync(this.localFilePath)) {
      console.log(`${colors.blue}Using specified file: ${this.localFilePath}${colors.reset}`);
      return this.localFilePath;
    }

    const componentConfig = COMPONENT_TYPES[this.componentType];
    if (!componentConfig) {
      console.error(`${colors.red}Unsupported component type: ${this.componentType}${colors.reset}`);
      return null;
    }

    // Try to find file in default location
    const defaultPath = path.join(
      componentConfig.defaultPath,
      `${this.componentName}${componentConfig.extension}`
    );

    if (fs.existsSync(defaultPath)) {
      console.log(`${colors.blue}Found file at default location: ${defaultPath}${colors.reset}`);
      return defaultPath;
    }

    // For CustomField, try object-specific path
    if (this.componentType === 'CustomField') {
      const parts = this.componentName.split('.');
      if (parts.length === 2) {
        const objectPath = path.join(
          'force-app/main/default/objects',
          parts[0],
          'fields',
          `${parts[1]}.field-meta.xml`
        );
        if (fs.existsSync(objectPath)) {
          console.log(`${colors.blue}Found field file: ${objectPath}${colors.reset}`);
          return objectPath;
        }
      }
    }

    console.warn(`${colors.yellow}Could not find local file for ${this.componentType}:${this.componentName}${colors.reset}`);
    return null;
  }

  /**
   * Parse XML metadata file
   */
  async parseXmlFile(filePath) {
    try {
      const xmlContent = fs.readFileSync(filePath, 'utf8');
      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await parser.parseStringPromise(xmlContent);
      return result;
    } catch (error) {
      console.error(`${colors.red}Failed to parse XML: ${error.message}${colors.reset}`);
      return null;
    }
  }

  /**
   * Retrieve metadata from Salesforce org
   */
  async retrieveOrgMetadata() {
    try {
      console.log(`${colors.blue}Retrieving ${this.componentType}:${this.componentName} from org...${colors.reset}`);

      const componentConfig = COMPONENT_TYPES[this.componentType];
      const retrieveDir = path.join('/tmp', `verify-${Date.now()}`);

      // Create temporary directory for retrieval
      fs.mkdirSync(retrieveDir, { recursive: true });

      // Build retrieve command
      const metadataArg = `${componentConfig.metadataType}:${this.componentName}`;
      const cmd = `sf project retrieve start --metadata "${metadataArg}" --target-org ${this.orgAlias} --target-metadata-dir ${retrieveDir} --json`;

      const result = execSync(cmd, { encoding: 'utf8' });
      const resultJson = JSON.parse(result);

      if (resultJson.status !== 0) {
        console.error(`${colors.red}Retrieve failed: ${resultJson.message || 'Unknown error'}${colors.reset}`);
        return null;
      }

      // Find the retrieved file
      const retrievedFile = this.findRetrievedFile(retrieveDir);
      if (!retrievedFile) {
        console.error(`${colors.red}Could not find retrieved file in ${retrieveDir}${colors.reset}`);
        return null;
      }

      const metadata = await this.parseXmlFile(retrievedFile);

      // Cleanup
      execSync(`rm -rf ${retrieveDir}`);

      return metadata;

    } catch (error) {
      console.error(`${colors.red}Failed to retrieve from org: ${error.message}${colors.reset}`);
      return null;
    }
  }

  /**
   * Find the retrieved metadata file
   */
  findRetrievedFile(baseDir) {
    const componentConfig = COMPONENT_TYPES[this.componentType];
    const extension = componentConfig.extension;

    // Recursively search for file with matching extension
    const findFile = (dir) => {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          const found = findFile(fullPath);
          if (found) return found;
        } else if (file.endsWith(extension) && file.includes(this.componentName)) {
          return fullPath;
        }
      }
      return null;
    };

    return findFile(baseDir);
  }

  /**
   * Compare local and org metadata
   */
  compareMetadata(localMetadata, orgMetadata) {
    const criticalFields = CRITICAL_FIELDS[this.componentType];

    if (!criticalFields) {
      console.log(`${colors.yellow}No critical fields defined for ${this.componentType}, performing basic comparison${colors.reset}`);
      this.basicComparison(localMetadata, orgMetadata);
      return;
    }

    console.log(`${colors.blue}Comparing critical fields...${colors.reset}`);

    for (const [fieldName, fieldConfig] of Object.entries(criticalFields)) {
      const localValue = this.getNestedValue(localMetadata, fieldConfig.path);
      const orgValue = this.getNestedValue(orgMetadata, fieldConfig.path);

      if (!this.compareValues(localValue, orgValue, fieldConfig.comparator, fieldConfig.keys)) {
        this.errors.push({
          field: fieldName,
          path: fieldConfig.path.join('.'),
          expected: localValue,
          actual: orgValue
        });
      }
    }
  }

  /**
   * Get nested value from object
   */
  getNestedValue(obj, path) {
    return path.reduce((acc, key) => (acc && acc[key] !== undefined) ? acc[key] : undefined, obj);
  }

  /**
   * Compare values based on comparator type
   */
  compareValues(local, org, comparator, keys) {
    if (comparator === 'string') {
      return local === org;
    }

    if (comparator === 'array') {
      if (!Array.isArray(local) || !Array.isArray(org)) {
        return local === org;
      }
      if (local.length !== org.length) return false;
      return local.every((item, index) => org.includes(item));
    }

    if (comparator === 'arrayOfObjects') {
      if (!Array.isArray(local) || !Array.isArray(org)) {
        return local === org;
      }

      // Ensure both arrays exist
      const localArray = Array.isArray(local) ? local : [];
      const orgArray = Array.isArray(org) ? org : [];

      // Compare each object in the array
      for (const localItem of localArray) {
        const matchingOrgItem = orgArray.find(orgItem => {
          return keys.every(key => localItem[key] === orgItem[key]);
        });

        if (!matchingOrgItem) {
          return false;
        }
      }

      return true;
    }

    return JSON.stringify(local) === JSON.stringify(org);
  }

  /**
   * Basic comparison for components without critical fields defined
   */
  basicComparison(localMetadata, orgMetadata) {
    const localStr = JSON.stringify(localMetadata, null, 2);
    const orgStr = JSON.stringify(orgMetadata, null, 2);

    if (localStr !== orgStr) {
      this.warnings.push('Metadata differs from org state (basic comparison)');
    }
  }

  /**
   * Report verification results
   */
  reportResults() {
    console.log('');
    console.log(`${colors.cyan}=== Verification Results ===${colors.reset}`);

    if (this.errors.length === 0 && this.warnings.length === 0) {
      console.log(`${colors.green}✓ PASSED: Org state matches local metadata${colors.reset}`);
      return 0;
    }

    if (this.errors.length > 0) {
      console.log(`${colors.red}✗ FAILED: ${this.errors.length} mismatch(es) detected${colors.reset}`);
      console.log('');
      this.errors.forEach((error, index) => {
        console.log(`${colors.red}Error ${index + 1}:${colors.reset}`);
        if (typeof error === 'string') {
          console.log(`  ${error}`);
        } else {
          console.log(`  Field: ${error.field}`);
          console.log(`  Path: ${error.path}`);
          console.log(`  Expected: ${JSON.stringify(error.expected, null, 2)}`);
          console.log(`  Actual: ${JSON.stringify(error.actual, null, 2)}`);
        }
        console.log('');
      });
      return 1;
    }

    if (this.warnings.length > 0) {
      console.log(`${colors.yellow}⚠ WARNING: ${this.warnings.length} warning(s) detected${colors.reset}`);
      console.log('');
      this.warnings.forEach((warning, index) => {
        console.log(`${colors.yellow}Warning ${index + 1}: ${warning}${colors.reset}`);
      });
      return 0;
    }
  }
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.log(`
Usage: node post-deployment-state-verifier.js <org-alias> <component-type> <component-name> [local-file-path]

Component Types: ${Object.keys(COMPONENT_TYPES).join(', ')}

Examples:
  node post-deployment-state-verifier.js delta-sandbox Profile Admin
  node post-deployment-state-verifier.js delta-sandbox CustomTab Approval_Rule__c
  node post-deployment-state-verifier.js delta-sandbox PermissionSet Advanced_Approvals_Tab_Access force-app/main/default/permissionsets/Advanced_Approvals_Tab_Access.permissionset-meta.xml
    `);
    process.exit(2);
  }

  const [orgAlias, componentType, componentName, localFilePath] = args;

  const verifier = new DeploymentVerifier(orgAlias, componentType, componentName, localFilePath);
  verifier.verify().then(exitCode => {
    process.exit(exitCode);
  });
}

module.exports = { DeploymentVerifier };
