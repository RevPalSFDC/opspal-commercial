#!/usr/bin/env node

/**
 * Environment Configuration Validator
 *
 * Validates operations against environment-specific configurations to prevent
 * hardcoded assumptions that cause failures (addresses reflection cohorts 2, 6).
 *
 * Prevents errors like:
 * - Using hs_salesforce_id when portal uses revpal_sfdc_id
 * - Deploying reports before report folders in Salesforce
 * - Querying non-existent properties or fields
 *
 * Usage:
 *   node env-config-validator.js validate-property hubspot eta-corp hs_salesforce_id
 *   node env-config-validator.js validate-deployment-order salesforce gamma-corp reports
 *   node env-config-validator.js load hubspot eta-corp
 *   node env-config-validator.js generate hubspot eta-corp
 *
 * Configuration Format (instances/{platform}/{instance}/ENV_CONFIG.json):
 * {
 *   "hubspot": {
 *     "portalId": "12345678",
 *     "syncProperties": {
 *       "salesforceId": "revpal_sfdc_id",
 *       "accountId": "custom_account_link"
 *     },
 *     "customObjectTypes": {
 *       "deals": "0-1",
 *       "companies": "0-2"
 *     }
 *   },
 *   "salesforce": {
 *     "orgId": "00D...",
 *     "deploymentOrder": {
 *       "reportFolders": "before_reports",
 *       "flows": "after_layouts",
 *       "customMetadata": "before_flows"
 *     },
 *     "labelCustomizations": {
 *       "SBQQ__Quote__c": "Order Form",
 *       "SBQQ__QuoteLine__c": "Order Line"
 *     }
 *   }
 * }
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ============================================================================
// Path Resolution (Enhanced for config/env cohort - 4 reflections)
// ============================================================================

/**
 * Load path resolution config from JSON file
 */
let pathConfig = null;
try {
  const configPath = path.join(__dirname, '../../config/path-resolution-config.json');
  if (fs.existsSync(configPath)) {
    pathConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch (e) {
  // Use defaults if config not available
}

/**
 * Path resolution patterns to try (in order of priority)
 * Addresses config/env cohort: plugin paths vs project paths
 *
 * IMPORTANT: Use 'project-platform' as default - it's most explicit
 */
const PATH_PATTERNS = pathConfig?.patterns?.map(p => ({
  name: p.name,
  template: p.template,
  recommended: p.recommended || false
})) || [
  // Pattern 1: Environment override (highest priority)
  { name: 'env-override', template: '{INSTANCE_PATH}', recommended: false },
  // Pattern 2: Project-level platform-prefixed paths (RECOMMENDED)
  { name: 'project-platform', template: 'instances/{platform}/{instance}', recommended: true },
  // Pattern 3: Project-level simple paths
  { name: 'project-simple', template: 'instances/{instance}', recommended: false },
  // Pattern 4: Plugin-relative paths
  { name: 'plugin-instances', template: '.claude-plugins/{plugin}/instances/{instance}', recommended: false }
];

/**
 * Get directories to exclude from instance detection
 */
const EXCLUDED_DIRECTORIES = pathConfig?.excluded_directories || [
  'lib', 'scripts', 'agents', 'hooks', 'config', 'docs', 'templates',
  'test', 'tests', '.claude', '.claude-plugins', 'node_modules', '.git'
];

/**
 * Resolve path for an instance directory with fallback
 * Tries multiple path conventions and returns the first valid one
 *
 * @param {string} platform - Platform name (salesforce, hubspot)
 * @param {string} instance - Instance/org name
 * @param {string} [customPath] - Optional custom path override
 * @returns {Object} Resolution result with path and pattern used
 */
function resolveInstancePath(platform, instance, customPath = null) {
  // If custom path provided, use it directly
  if (customPath && fs.existsSync(customPath)) {
    return {
      resolved: true,
      path: customPath,
      pattern: 'custom',
      message: `Using custom path: ${customPath}`
    };
  }

  // Try each path pattern in order
  const triedPaths = [];
  const cwd = process.cwd();
  const projectDir = process.env.CLAUDE_PROJECT_DIR || cwd;
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || path.join(cwd, '.claude-plugins', 'opspal-core');

  for (const pattern of PATH_PATTERNS) {
    let resolvedPath = pattern.template
      .replace('{platform}', platform)
      .replace('{instance}', instance)
      .replace('{CLAUDE_PROJECT_DIR}', projectDir)
      .replace('{CLAUDE_PLUGIN_ROOT}', pluginRoot);

    // If not absolute, make it relative to cwd
    if (!path.isAbsolute(resolvedPath)) {
      resolvedPath = path.join(cwd, resolvedPath);
    }

    triedPaths.push({ pattern: pattern.name, path: resolvedPath });

    if (fs.existsSync(resolvedPath)) {
      return {
        resolved: true,
        path: resolvedPath,
        pattern: pattern.name,
        message: `Found at ${resolvedPath} (${pattern.name} pattern)`
      };
    }
  }

  // No path found - return with clear guidance
  const recommendedPath = path.join(cwd, 'instances', platform, instance);
  const errorMessage = pathConfig?.error_messages?.not_found ||
    `Instance directory not found. Tried ${triedPaths.length} path patterns.`;

  return {
    resolved: false,
    path: null,
    pattern: null,
    triedPaths: triedPaths,
    message: errorMessage.replace('{platform}', platform).replace('{instance}', instance),
    recommendation: `RECOMMENDED: Create at instances/${platform}/${instance}/`,
    suggestion: `mkdir -p instances/${platform}/${instance}`,
    recommendedPath: recommendedPath
  };
}

/**
 * Auto-detect environment from directory structure
 * Returns context about the execution environment
 */
function detectEnvironment() {
  const cwd = process.cwd();

  const env = {
    cwd: cwd,
    isPlugin: fs.existsSync(path.join(cwd, '.claude-plugin')),
    isProject: fs.existsSync(path.join(cwd, '.claude')) || fs.existsSync(path.join(cwd, 'CLAUDE.md')),
    hasProjectInstances: fs.existsSync(path.join(cwd, 'instances')),
    hasPluginInstances: fs.existsSync(path.join(cwd, '.claude-plugins', 'salesforce-plugin', 'instances')) ||
                        fs.existsSync(path.join(cwd, '.claude-plugins', 'hubspot-plugin', 'instances')),
    CLAUDE_PROJECT_DIR: process.env.CLAUDE_PROJECT_DIR || null,
    CLAUDE_PLUGIN_ROOT: process.env.CLAUDE_PLUGIN_ROOT || null
  };

  // Determine primary context
  if (env.isProject && env.hasProjectInstances) {
    env.context = 'project';
    env.instancesRoot = path.join(cwd, 'instances');
  } else if (env.isPlugin) {
    env.context = 'plugin';
    env.instancesRoot = path.join(cwd, 'instances');
  } else if (env.CLAUDE_PLUGIN_ROOT) {
    env.context = 'marketplace-plugin';
    env.instancesRoot = path.join(env.CLAUDE_PLUGIN_ROOT, 'instances');
  } else {
    env.context = 'unknown';
    env.instancesRoot = path.join(cwd, 'instances');
  }

  return env;
}

// ============================================================================
// Configuration Loading (Enhanced with path resolution)
// ============================================================================

/**
 * Load environment configuration for a specific instance
 * Now uses intelligent path resolution with fallback
 */
function loadEnvConfig(platform, instance, customPath = null) {
  // First, resolve the instance directory
  const resolution = resolveInstancePath(platform, instance, customPath);

  if (!resolution.resolved) {
    return {
      exists: false,
      path: null,
      config: null,
      resolution: resolution,
      message: resolution.message,
      suggestion: resolution.suggestion
    };
  }

  // Now look for ENV_CONFIG.json in the resolved path
  const configPath = path.join(resolution.path, 'ENV_CONFIG.json');

  if (!fs.existsSync(configPath)) {
    return {
      exists: false,
      path: configPath,
      instancePath: resolution.path,
      resolution: resolution,
      config: null,
      message: `Instance directory found at ${resolution.path}, but no ENV_CONFIG.json. Run generate command to create it.`
    };
  }

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return {
      exists: true,
      path: configPath,
      instancePath: resolution.path,
      resolution: resolution,
      config: config[platform] || {},
      fullConfig: config
    };
  } catch (error) {
    return {
      exists: true,
      path: configPath,
      instancePath: resolution.path,
      resolution: resolution,
      config: null,
      error: error.message
    };
  }
}

// ============================================================================
// HubSpot Configuration Detection
// ============================================================================

/**
 * Detect HubSpot portal-specific configuration
 */
async function detectHubSpotConfig(portalId) {
  console.log(`🔍 Detecting HubSpot configuration for portal ${portalId}...`);

  const config = {
    hubspot: {
      portalId: portalId,
      syncProperties: {},
      customObjectTypes: {},
      detectedAt: new Date().toISOString()
    }
  };

  // Detect Salesforce sync properties
  console.log('  → Detecting Salesforce sync properties...');
  const syncProps = detectSalesforceSyncProperties(portalId);
  if (syncProps) {
    config.hubspot.syncProperties = syncProps;
    console.log(`    ✅ Found ${Object.keys(syncProps).length} sync properties`);
  }

  // Detect custom object types
  console.log('  → Detecting custom object types...');
  const customObjects = detectCustomObjectTypes(portalId);
  if (customObjects) {
    config.hubspot.customObjectTypes = customObjects;
    console.log(`    ✅ Found ${Object.keys(customObjects).length} custom object types`);
  }

  return config;
}

/**
 * Detect which property is used for Salesforce ID sync
 */
function detectSalesforceSyncProperties(portalId) {
  const candidates = [
    'hs_salesforce_id',
    'revpal_sfdc_id',
    'salesforce_id',
    'sfdc_id',
    'salesforce_account_id',
    'sf_account_id'
  ];

  // Note: This would need actual HubSpot API integration
  // For now, return structure for manual population
  const detected = {};

  console.log('    ℹ️  Manual detection required - check HubSpot UI for:');
  candidates.forEach(prop => {
    console.log(`      - ${prop}`);
  });

  // Return structure with placeholders
  detected.salesforceId = 'MANUAL_CHECK_REQUIRED';
  detected.accountId = 'MANUAL_CHECK_REQUIRED';

  return detected;
}

/**
 * Detect custom object type IDs
 */
function detectCustomObjectTypes(portalId) {
  // Note: This would need actual HubSpot API integration
  console.log('    ℹ️  Manual detection required - check HubSpot UI for custom objects');

  return {
    // Placeholder structure
    'MANUAL_CHECK': 'REQUIRED'
  };
}

// ============================================================================
// Salesforce Configuration Detection (extends org-quirks-detector)
// ============================================================================

/**
 * Detect Salesforce org-specific configuration
 */
function detectSalesforceConfig(orgAlias) {
  console.log(`🔍 Detecting Salesforce configuration for ${orgAlias}...`);

  const config = {
    salesforce: {
      orgId: getOrgId(orgAlias),
      deploymentOrder: detectDeploymentOrder(orgAlias),
      labelCustomizations: detectLabelCustomizations(orgAlias),
      detectedAt: new Date().toISOString()
    }
  };

  return config;
}

/**
 * Get Salesforce org ID
 */
function getOrgId(orgAlias) {
  try {
    const result = execSync(
      `sf org display --target-org ${orgAlias} --json`,
      { encoding: 'utf8' }
    );
    const data = JSON.parse(result);
    return data.result.id || 'unknown';
  } catch (error) {
    console.error(`  ❌ Failed to get org ID: ${error.message}`);
    return 'unknown';
  }
}

/**
 * Detect deployment order requirements
 */
function detectDeploymentOrder(orgAlias) {
  console.log('  → Detecting deployment order requirements...');

  // Standard Salesforce deployment order
  const order = {
    customMetadata: 'before_flows',
    reportFolders: 'before_reports',
    flows: 'after_layouts',
    customSettings: 'before_all',
    profiles: 'after_objects',
    permissionSets: 'after_objects'
  };

  console.log(`    ✅ Standard deployment order rules applied`);
  return order;
}

/**
 * Detect label customizations (leverages org-quirks-detector logic)
 */
function detectLabelCustomizations(orgAlias) {
  console.log('  → Detecting label customizations...');

  const query = `
    SELECT QualifiedApiName, Label
    FROM EntityDefinition
    WHERE NamespacePrefix != null
    LIMIT 100
  `.replace(/\s+/g, ' ').trim();

  try {
    const result = execSync(
      `sf data query --query "${query}" --target-org ${orgAlias} --json`,
      { encoding: 'utf8' }
    );
    const data = JSON.parse(result);

    const customizations = {};
    if (data.result && data.result.records) {
      data.result.records.forEach(obj => {
        customizations[obj.QualifiedApiName] = obj.Label;
      });
      console.log(`    ✅ Found ${Object.keys(customizations).length} objects`);
    }

    return customizations;
  } catch (error) {
    console.error(`    ⚠️  Failed to detect labels: ${error.message}`);
    return {};
  }
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate HubSpot property exists in configuration
 */
function validateHubSpotProperty(instance, propertyName) {
  const envConfig = loadEnvConfig('hubspot', instance);

  if (!envConfig.exists) {
    return {
      valid: 'unknown',
      message: envConfig.message,
      recommendation: 'Generate ENV_CONFIG.json first'
    };
  }

  const syncProps = envConfig.config.syncProperties || {};

  // Check if property is in known sync properties
  const knownProperty = Object.values(syncProps).includes(propertyName);

  if (knownProperty) {
    return {
      valid: true,
      message: `Property '${propertyName}' is configured in ENV_CONFIG.json`,
      actualProperty: propertyName
    };
  }

  // Check if user might be using wrong property name
  const correctProperty = Object.keys(syncProps).find(key =>
    propertyName.includes(key) || key.includes(propertyName)
  );

  if (correctProperty) {
    return {
      valid: false,
      message: `Property '${propertyName}' not found. Did you mean '${syncProps[correctProperty]}'?`,
      expectedProperty: syncProps[correctProperty],
      actualProperty: propertyName,
      recommendation: `Use '${syncProps[correctProperty]}' instead of '${propertyName}'`
    };
  }

  return {
    valid: 'unknown',
    message: `Property '${propertyName}' not in ENV_CONFIG.json. May need manual verification.`,
    recommendation: 'Check HubSpot portal and update ENV_CONFIG.json'
  };
}

/**
 * Validate Salesforce deployment order
 */
function validateDeploymentOrder(instance, metadataType) {
  const envConfig = loadEnvConfig('salesforce', instance);

  if (!envConfig.exists) {
    return {
      valid: 'unknown',
      message: envConfig.message,
      recommendation: 'Generate ENV_CONFIG.json first'
    };
  }

  const deployOrder = envConfig.config.deploymentOrder || {};
  const rule = deployOrder[metadataType];

  if (!rule) {
    return {
      valid: 'unknown',
      message: `No deployment order rule defined for '${metadataType}'`,
      recommendation: 'Standard deployment order applies'
    };
  }

  return {
    valid: true,
    message: `Deployment order rule: ${metadataType} should deploy ${rule}`,
    rule: rule,
    recommendation: getDeploymentOrderRecommendation(metadataType, rule)
  };
}

/**
 * Get deployment order recommendation
 */
function getDeploymentOrderRecommendation(metadataType, rule) {
  const [timing, dependency] = rule.split('_');

  if (timing === 'before') {
    return `Deploy ${metadataType} before deploying ${dependency}`;
  } else if (timing === 'after') {
    return `Deploy ${dependency} before deploying ${metadataType}`;
  }

  return `Standard deployment order applies`;
}

/**
 * Validate Salesforce object label
 */
function validateSalesforceLabel(instance, apiName, expectedLabel) {
  const envConfig = loadEnvConfig('salesforce', instance);

  if (!envConfig.exists) {
    return {
      valid: 'unknown',
      message: envConfig.message
    };
  }

  const labels = envConfig.config.labelCustomizations || {};
  const actualLabel = labels[apiName];

  if (!actualLabel) {
    return {
      valid: 'unknown',
      message: `Object '${apiName}' not in ENV_CONFIG.json`,
      recommendation: 'May use standard label or need manual check'
    };
  }

  if (actualLabel === expectedLabel) {
    return {
      valid: true,
      message: `Label matches: '${actualLabel}'`,
      actualLabel: actualLabel
    };
  }

  return {
    valid: false,
    message: `Label mismatch: expected '${expectedLabel}', actual '${actualLabel}'`,
    expectedLabel: expectedLabel,
    actualLabel: actualLabel,
    recommendation: `Use '${actualLabel}' instead of '${expectedLabel}'`
  };
}

// ============================================================================
// Generation Functions
// ============================================================================

/**
 * Generate ENV_CONFIG.json for an instance
 */
async function generateEnvConfig(platform, instance) {
  console.log(`\n📝 Generating ENV_CONFIG.json for ${platform}/${instance}...\n`);

  let config = {};

  if (platform === 'hubspot') {
    // For HubSpot, need portal ID
    console.log('HubSpot portal ID required (check .env or HubSpot dashboard)');
    const portalId = process.env.HUBSPOT_PORTAL_ID || 'MANUAL_ENTRY_REQUIRED';
    config = await detectHubSpotConfig(portalId);
  } else if (platform === 'salesforce') {
    config = detectSalesforceConfig(instance);
  } else {
    console.error(`❌ Unsupported platform: ${platform}`);
    return;
  }

  // Ensure directory exists
  const instanceDir = path.join(process.cwd(), 'instances', platform, instance);
  if (!fs.existsSync(instanceDir)) {
    fs.mkdirSync(instanceDir, { recursive: true });
  }

  // Write configuration
  const configPath = path.join(instanceDir, 'ENV_CONFIG.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  console.log(`\n✅ Configuration written to ${configPath}`);
  console.log(`\nℹ️  Review and update manual entries marked as 'MANUAL_CHECK_REQUIRED'\n`);

  return config;
}

// ============================================================================
// CLI Interface
// ============================================================================

const command = process.argv[2];
const platform = process.argv[3];
const instance = process.argv[4];
const param = process.argv[5];

if (command === 'validate-property') {
  if (platform !== 'hubspot') {
    console.error('❌ validate-property only supports HubSpot');
    process.exit(1);
  }

  const result = validateHubSpotProperty(instance, param);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.valid === false ? 1 : 0);

} else if (command === 'validate-deployment-order') {
  if (platform !== 'salesforce') {
    console.error('❌ validate-deployment-order only supports Salesforce');
    process.exit(1);
  }

  const result = validateDeploymentOrder(instance, param);
  console.log(JSON.stringify(result, null, 2));

} else if (command === 'validate-label') {
  if (platform !== 'salesforce') {
    console.error('❌ validate-label only supports Salesforce');
    process.exit(1);
  }

  const expectedLabel = process.argv[6];
  const result = validateSalesforceLabel(instance, param, expectedLabel);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.valid === false ? 1 : 0);

} else if (command === 'load') {
  const envConfig = loadEnvConfig(platform, instance);
  console.log(JSON.stringify(envConfig, null, 2));

} else if (command === 'generate') {
  generateEnvConfig(platform, instance);

} else {
  console.log(`
Environment Configuration Validator

Usage:
  node env-config-validator.js <command> <platform> <instance> [params]

Commands:
  generate <platform> <instance>
    Generate ENV_CONFIG.json by detecting environment configuration

  load <platform> <instance>
    Load and display current ENV_CONFIG.json

  validate-property hubspot <instance> <propertyName>
    Validate HubSpot property exists in configuration

  validate-deployment-order salesforce <instance> <metadataType>
    Validate Salesforce deployment order requirements

  validate-label salesforce <instance> <apiName> <expectedLabel>
    Validate Salesforce object label customization

Examples:
  node env-config-validator.js generate salesforce gamma-corp
  node env-config-validator.js generate hubspot eta-corp
  node env-config-validator.js validate-property hubspot eta-corp hs_salesforce_id
  node env-config-validator.js validate-deployment-order salesforce gamma-corp reports
  node env-config-validator.js validate-label salesforce gamma-corp SBQQ__Quote__c Quote
  `);
}

module.exports = {
  // Path Resolution (config/env cohort)
  resolveInstancePath,
  detectEnvironment,
  PATH_PATTERNS,

  // Configuration Loading
  loadEnvConfig,
  generateEnvConfig,

  // Platform Detection
  detectHubSpotConfig,
  detectSalesforceConfig,

  // Validation Functions
  validateHubSpotProperty,
  validateDeploymentOrder,
  validateSalesforceLabel
};
