/**
 * Dashboard Scope Detector
 *
 * Detects whether Salesforce dashboard operations should target
 * Lightning Dashboards or Classic Analytics based on org configuration.
 *
 * Related reflections: b3a45c7f
 * ROI: $1,500/yr
 *
 * @module dashboard-scope-detector
 */

const { execSync } = require('child_process');

// Dashboard type identifiers
const DASHBOARD_TYPES = {
  LIGHTNING: 'lightning',
  CLASSIC: 'classic',
  CRM_ANALYTICS: 'crm_analytics',
  TABLEAU: 'tableau'
};

// Metadata API names by type
const METADATA_TYPES = {
  [DASHBOARD_TYPES.LIGHTNING]: 'Dashboard',
  [DASHBOARD_TYPES.CLASSIC]: 'Dashboard',
  [DASHBOARD_TYPES.CRM_ANALYTICS]: 'WaveAnalyticsAsset',
  [DASHBOARD_TYPES.TABLEAU]: 'TableauConnectedApp'
};

/**
 * Query org for dashboard capabilities
 * @param {string} orgAlias - Salesforce org alias
 * @returns {Object} Capability detection result
 */
function detectDashboardCapabilities(orgAlias) {
  const result = {
    orgAlias,
    timestamp: new Date().toISOString(),
    capabilities: {
      lightning: false,
      classic: false,
      crmAnalytics: false,
      tableau: false
    },
    defaultType: null,
    error: null
  };

  try {
    // Check for Lightning Experience enablement
    const leResult = execSync(
      `sf data query --query "SELECT Name, NamespacePrefix FROM LightningExperienceTheme LIMIT 1" --target-org ${orgAlias} --json`,
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
    );
    const leResponse = JSON.parse(leResult);
    if (leResponse.result?.records?.length > 0) {
      result.capabilities.lightning = true;
    }
  } catch (err) {
    // LightningExperienceTheme not accessible - check org preferences
  }

  try {
    // Check for classic dashboards
    const classicResult = execSync(
      `sf data query --query "SELECT COUNT() FROM Dashboard" --target-org ${orgAlias} --json`,
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
    );
    const classicResponse = JSON.parse(classicResult);
    if (classicResponse.result?.totalSize > 0) {
      result.capabilities.classic = true;
    }
  } catch (err) {
    // Dashboard not accessible
  }

  try {
    // Check for CRM Analytics (formerly Wave Analytics/Einstein Analytics)
    const crmResult = execSync(
      `sf data query --query "SELECT Id FROM WaveAutoInstallRequest LIMIT 1" --target-org ${orgAlias} --json`,
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
    );
    const crmResponse = JSON.parse(crmResult);
    result.capabilities.crmAnalytics = true;
  } catch (err) {
    // CRM Analytics not enabled - that's fine
  }

  // Determine default type
  if (result.capabilities.lightning) {
    result.defaultType = DASHBOARD_TYPES.LIGHTNING;
  } else if (result.capabilities.classic) {
    result.defaultType = DASHBOARD_TYPES.CLASSIC;
  }

  return result;
}

/**
 * Detect dashboard type from API response
 * @param {Object} dashboard - Dashboard object from API
 * @returns {Object} Type detection result
 */
function detectDashboardType(dashboard) {
  const result = {
    id: dashboard.Id,
    name: dashboard.DeveloperName || dashboard.Name,
    type: DASHBOARD_TYPES.CLASSIC,
    indicators: [],
    executionType: dashboard.Type || null,
    isDynamic: false
  };

  // Dynamic/static classification must use Dashboard.Type, not RunningUser fields.
  if (dashboard.Type === 'LoggedInUser') {
    result.isDynamic = true;
    result.indicators.push('Type=LoggedInUser (dynamic dashboard)');
  } else if (dashboard.Type === 'SpecifiedUser') {
    result.indicators.push('Type=SpecifiedUser (static dashboard)');
  } else if (dashboard.Type) {
    result.indicators.push(`Type=${dashboard.Type}`);
  }

  // Check for Lightning-specific properties
  if (dashboard.DashboardComponents) {
    result.type = DASHBOARD_TYPES.LIGHTNING;
    result.indicators.push('Has DashboardComponents (Lightning format)');
  }

  if (dashboard.FolderId) {
    result.indicators.push(`Folder: ${dashboard.FolderId}`);
  }

  // Check for CRM Analytics indicators
  if (dashboard.WaveDatasetId || dashboard.WaveLensId) {
    result.type = DASHBOARD_TYPES.CRM_ANALYTICS;
    result.indicators.push('Wave/CRM Analytics dataset reference');
  }

  // Check metadata type
  if (dashboard.type === 'analytics__dashboard') {
    result.type = DASHBOARD_TYPES.CRM_ANALYTICS;
    result.indicators.push('Analytics dashboard type');
  }

  return result;
}

/**
 * Query dashboards with type detection
 * @param {string} orgAlias - Salesforce org alias
 * @param {Object} options - Query options
 * @returns {Object} Dashboards with type information
 */
function queryDashboardsWithType(orgAlias, options = {}) {
  const result = {
    orgAlias,
    timestamp: new Date().toISOString(),
    dashboards: [],
    summary: {
      lightning: 0,
      classic: 0,
      crmAnalytics: 0,
      total: 0
    },
    error: null
  };

  try {
    // Query standard dashboards
    let query = 'SELECT Id, DeveloperName, FolderName, Title, Type, CreatedDate, LastModifiedDate FROM Dashboard';

    if (options.folder) {
      query += ` WHERE FolderName = '${options.folder}'`;
    }

    if (options.limit) {
      query += ` LIMIT ${options.limit}`;
    }

    const output = execSync(
      `sf data query --query "${query}" --target-org ${orgAlias} --json`,
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
    );

    const response = JSON.parse(output);

    if (response.result?.records) {
      for (const dashboard of response.result.records) {
        const typeInfo = detectDashboardType(dashboard);
        result.dashboards.push({
          ...typeInfo,
          folder: dashboard.FolderName,
          title: dashboard.Title,
          createdDate: dashboard.CreatedDate,
          lastModifiedDate: dashboard.LastModifiedDate
        });

        result.summary[typeInfo.type]++;
        result.summary.total++;
      }
    }
  } catch (err) {
    result.error = err.message;
  }

  // Try to query CRM Analytics dashboards separately
  try {
    const analyticsOutput = execSync(
      `sf data query --query "SELECT Id, Name, DeveloperName FROM analytics__dashboard LIMIT 100" --target-org ${orgAlias} --json`,
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
    );

    const analyticsResponse = JSON.parse(analyticsOutput);
    if (analyticsResponse.result?.records) {
      for (const dashboard of analyticsResponse.result.records) {
        result.dashboards.push({
          id: dashboard.Id,
          name: dashboard.DeveloperName || dashboard.Name,
          type: DASHBOARD_TYPES.CRM_ANALYTICS,
          indicators: ['CRM Analytics dashboard']
        });
        result.summary.crmAnalytics++;
        result.summary.total++;
      }
    }
  } catch (err) {
    // CRM Analytics not available - that's fine
  }

  return result;
}

/**
 * Get correct API and metadata approach for dashboard type
 * @param {string} dashboardType - Type of dashboard
 * @returns {Object} API guidance
 */
function getApiGuidance(dashboardType) {
  const guidance = {
    type: dashboardType,
    metadataType: null,
    apiEndpoint: null,
    commands: [],
    notes: []
  };

  switch (dashboardType) {
    case DASHBOARD_TYPES.LIGHTNING:
    case DASHBOARD_TYPES.CLASSIC:
      guidance.metadataType = 'Dashboard';
      guidance.apiEndpoint = '/services/data/vXX.0/analytics/dashboards';
      guidance.commands = [
        'sf project retrieve start --metadata Dashboard',
        'sf data query --query "SELECT Id FROM Dashboard"'
      ];
      guidance.notes = [
        'Lightning and Classic use the same metadata type',
        'Lightning dashboards have DashboardComponents in XML',
        'Use Analytics API for runtime operations'
      ];
      break;

    case DASHBOARD_TYPES.CRM_ANALYTICS:
      guidance.metadataType = 'WaveApplication,WaveDashboard,WaveDataset';
      guidance.apiEndpoint = '/services/data/vXX.0/wave/dashboards';
      guidance.commands = [
        'sf project retrieve start --metadata WaveDashboard',
        'sf analytics dashboard list'
      ];
      guidance.notes = [
        'CRM Analytics (Einstein Analytics) uses Wave API',
        'Dashboards are part of Applications',
        'Requires separate permissions'
      ];
      break;

    case DASHBOARD_TYPES.TABLEAU:
      guidance.metadataType = 'TableauConnectedApp';
      guidance.apiEndpoint = 'External (Tableau Server)';
      guidance.commands = [
        'Tableau REST API required',
        'sf data query to get connection info'
      ];
      guidance.notes = [
        'Tableau CRM is managed externally',
        'Salesforce connection provides data only',
        'Use Tableau REST API for dashboard operations'
      ];
      break;
  }

  return guidance;
}

/**
 * Recommend dashboard approach for a given operation
 * @param {string} orgAlias - Salesforce org alias
 * @param {string} operation - Type of operation (create, update, query, deploy)
 * @returns {Object} Recommended approach
 */
function recommendApproach(orgAlias, operation) {
  const result = {
    orgAlias,
    operation,
    capabilities: null,
    recommendation: null,
    alternativeApproaches: []
  };

  // Detect capabilities
  result.capabilities = detectDashboardCapabilities(orgAlias);

  // Make recommendation based on operation and capabilities
  if (operation === 'create') {
    if (result.capabilities.capabilities.lightning) {
      result.recommendation = {
        type: DASHBOARD_TYPES.LIGHTNING,
        reason: 'Lightning Experience enabled - use Lightning dashboards for best UX',
        approach: 'Use sf project deploy with Dashboard metadata'
      };
    } else {
      result.recommendation = {
        type: DASHBOARD_TYPES.CLASSIC,
        reason: 'Classic only - use Classic dashboard format',
        approach: 'Use sf project deploy with Dashboard metadata'
      };
    }
  } else if (operation === 'query') {
    result.recommendation = {
      type: 'both',
      reason: 'Query both Lightning and Classic dashboards',
      approach: 'Use sf data query on Dashboard object'
    };

    if (result.capabilities.capabilities.crmAnalytics) {
      result.alternativeApproaches.push({
        type: DASHBOARD_TYPES.CRM_ANALYTICS,
        reason: 'CRM Analytics also available',
        approach: 'Use Wave API for analytics dashboards'
      });
    }
  } else if (operation === 'deploy') {
    result.recommendation = {
      type: DASHBOARD_TYPES.LIGHTNING,
      reason: 'Deploy using Metadata API',
      approach: 'sf project deploy start --metadata Dashboard:DashboardName'
    };
  }

  return result;
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'detect':
      if (!args[1]) {
        console.error('Usage: dashboard-scope-detector.js detect <org-alias>');
        process.exit(1);
      }
      const capabilities = detectDashboardCapabilities(args[1]);
      console.log(JSON.stringify(capabilities, null, 2));
      break;

    case 'query':
      if (!args[1]) {
        console.error('Usage: dashboard-scope-detector.js query <org-alias> [--folder <name>] [--limit <n>]');
        process.exit(1);
      }
      const folderIdx = args.indexOf('--folder');
      const limitIdx = args.indexOf('--limit');
      const queryOptions = {
        folder: folderIdx > 0 ? args[folderIdx + 1] : null,
        limit: limitIdx > 0 ? parseInt(args[limitIdx + 1]) : 100
      };
      const dashboards = queryDashboardsWithType(args[1], queryOptions);
      console.log(JSON.stringify(dashboards, null, 2));
      break;

    case 'guidance':
      if (!args[1]) {
        console.error('Usage: dashboard-scope-detector.js guidance <type>');
        console.log('Types: lightning, classic, crm_analytics, tableau');
        process.exit(1);
      }
      const guidance = getApiGuidance(args[1]);
      console.log(JSON.stringify(guidance, null, 2));
      break;

    case 'recommend':
      if (!args[1] || !args[2]) {
        console.error('Usage: dashboard-scope-detector.js recommend <org-alias> <operation>');
        console.log('Operations: create, update, query, deploy');
        process.exit(1);
      }
      const recommendation = recommendApproach(args[1], args[2]);
      console.log(JSON.stringify(recommendation, null, 2));
      break;

    default:
      console.log(`Dashboard Scope Detector

Usage:
  dashboard-scope-detector.js detect <org>                  Detect dashboard capabilities
  dashboard-scope-detector.js query <org> [options]         Query dashboards with type info
  dashboard-scope-detector.js guidance <type>               Get API guidance for type
  dashboard-scope-detector.js recommend <org> <operation>   Get recommended approach

Dashboard Types:
  lightning     - Lightning Experience dashboards
  classic       - Classic Analytics dashboards
  crm_analytics - CRM Analytics (Wave/Einstein)
  tableau       - Tableau CRM

Operations for recommend:
  create, update, query, deploy

Options for query:
  --folder <name>  Filter by folder name
  --limit <n>      Limit results (default: 100)

Examples:
  # Detect org capabilities
  node dashboard-scope-detector.js detect my-org

  # Query dashboards
  node dashboard-scope-detector.js query my-org --limit 50

  # Get API guidance
  node dashboard-scope-detector.js guidance crm_analytics

  # Get recommendation
  node dashboard-scope-detector.js recommend my-org create
`);
  }
}

module.exports = {
  DASHBOARD_TYPES,
  METADATA_TYPES,
  detectDashboardCapabilities,
  detectDashboardType,
  queryDashboardsWithType,
  getApiGuidance,
  recommendApproach
};
