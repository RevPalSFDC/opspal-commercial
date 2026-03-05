#!/usr/bin/env node

/**
 * Report Type Permission Analyzer
 *
 * Purpose: Analyzes Salesforce report types to identify ALL required object permissions.
 * This addresses the common issue where report types require Read on ALL objects the type
 * CAN query, not just objects used in the actual data.
 *
 * Example: CampaignWithCampaignMembers requires Lead Read even for Contact-only reports
 *
 * Detection Sources:
 * 1. Report Type metadata (describes all queryable objects)
 * 2. Object relationships (parent-child, lookup)
 * 3. Standard report type object mappings (built-in knowledge)
 *
 * Usage:
 *   node report-type-analyzer.js [options]
 *
 * Options:
 *   --report-type <name>   Analyze a specific report type
 *   --org <alias>          Target Salesforce org alias
 *   --validate             Validate current user has required permissions
 *   --permission-set <ps>  Check if permission set covers requirements
 *   --json                 Output as JSON
 *   --verbose              Show detailed analysis
 *
 * Exit Codes:
 *   0 - Analysis complete, all permissions available
 *   1 - Missing required permissions
 *   2 - Report type not found
 *   3 - Execution error
 *
 * @module report-type-analyzer
 * @version 1.0.0
 * @since 2025-12-05
 * @reflection-cohort schema/parse
 */

const { execSync } = require('child_process');

// =============================================================================
// Configuration
// =============================================================================

/**
 * Standard report type object mappings
 * These are Salesforce's built-in report types with their object requirements
 */
const STANDARD_REPORT_TYPES = {
  // Campaign report types
  'CampaignWithCampaignMembers': {
    primaryObject: 'Campaign',
    relatedObjects: ['CampaignMember', 'Lead', 'Contact'],
    requiredPermissions: {
      'Campaign': 'Read',
      'CampaignMember': 'Read',
      'Lead': 'Read',      // Required even if querying Contacts only!
      'Contact': 'Read',
    },
    notes: 'Lead Read is required even when only querying Contact-based members',
  },
  'CampaignWithInfluencedOpportunities': {
    primaryObject: 'Campaign',
    relatedObjects: ['Opportunity', 'CampaignInfluence'],
    requiredPermissions: {
      'Campaign': 'Read',
      'Opportunity': 'Read',
      'CampaignInfluence': 'Read',
    },
  },
  'CampaignMemberWithCampaign': {
    primaryObject: 'CampaignMember',
    relatedObjects: ['Campaign', 'Lead', 'Contact'],
    requiredPermissions: {
      'CampaignMember': 'Read',
      'Campaign': 'Read',
      'Lead': 'Read',
      'Contact': 'Read',
    },
    notes: 'Both Lead and Contact access required for member lookup',
  },

  // Opportunity report types
  'OpportunityProduct': {
    primaryObject: 'Opportunity',
    relatedObjects: ['OpportunityLineItem', 'Product2', 'PricebookEntry'],
    requiredPermissions: {
      'Opportunity': 'Read',
      'OpportunityLineItem': 'Read',
      'Product2': 'Read',
      'PricebookEntry': 'Read',
    },
  },
  'OpportunityWithContactRoles': {
    primaryObject: 'Opportunity',
    relatedObjects: ['OpportunityContactRole', 'Contact'],
    requiredPermissions: {
      'Opportunity': 'Read',
      'OpportunityContactRole': 'Read',
      'Contact': 'Read',
    },
  },
  'OpportunityHistory': {
    primaryObject: 'Opportunity',
    relatedObjects: ['OpportunityHistory', 'OpportunityFieldHistory'],
    requiredPermissions: {
      'Opportunity': 'Read',
      'OpportunityHistory': 'Read',
      'OpportunityFieldHistory': 'Read',
    },
  },

  // Account report types
  'AccountWithAccountTeam': {
    primaryObject: 'Account',
    relatedObjects: ['AccountTeamMember', 'User'],
    requiredPermissions: {
      'Account': 'Read',
      'AccountTeamMember': 'Read',
      'User': 'Read',
    },
  },
  'AccountWithPartners': {
    primaryObject: 'Account',
    relatedObjects: ['Partner'],
    requiredPermissions: {
      'Account': 'Read',
      'Partner': 'Read',
    },
  },

  // Case report types
  'CaseWithSolutions': {
    primaryObject: 'Case',
    relatedObjects: ['Solution', 'CaseSolution'],
    requiredPermissions: {
      'Case': 'Read',
      'Solution': 'Read',
      'CaseSolution': 'Read',
    },
  },
  'CaseWithArticles': {
    primaryObject: 'Case',
    relatedObjects: ['KnowledgeArticleVersion', 'CaseArticle'],
    requiredPermissions: {
      'Case': 'Read',
      'KnowledgeArticleVersion': 'Read',
      'CaseArticle': 'Read',
    },
  },

  // Lead report types
  'LeadWithConvertedInfo': {
    primaryObject: 'Lead',
    relatedObjects: ['Account', 'Contact', 'Opportunity'],
    requiredPermissions: {
      'Lead': 'Read',
      'Account': 'Read',
      'Contact': 'Read',
      'Opportunity': 'Read',
    },
    notes: 'Converted info requires access to conversion target objects',
  },

  // Quote report types
  'QuoteWithLineItems': {
    primaryObject: 'Quote',
    relatedObjects: ['QuoteLineItem', 'Product2', 'PricebookEntry'],
    requiredPermissions: {
      'Quote': 'Read',
      'QuoteLineItem': 'Read',
      'Product2': 'Read',
      'PricebookEntry': 'Read',
    },
  },

  // Contract report types
  'ContractWithHistory': {
    primaryObject: 'Contract',
    relatedObjects: ['ContractHistory'],
    requiredPermissions: {
      'Contract': 'Read',
      'ContractHistory': 'Read',
    },
  },

  // Activity report types
  'ActivityWithTask': {
    primaryObject: 'Task',
    relatedObjects: ['Account', 'Contact', 'Lead', 'Opportunity'],
    requiredPermissions: {
      'Task': 'Read',
      'Account': 'Read',
      'Contact': 'Read',
      'Lead': 'Read',
      'Opportunity': 'Read',
    },
    notes: 'Tasks can be related to multiple object types',
  },
  'ActivityWithEvent': {
    primaryObject: 'Event',
    relatedObjects: ['Account', 'Contact', 'Lead', 'Opportunity'],
    requiredPermissions: {
      'Event': 'Read',
      'Account': 'Read',
      'Contact': 'Read',
      'Lead': 'Read',
      'Opportunity': 'Read',
    },
    notes: 'Events can be related to multiple object types',
  },

  // User report types
  'UserWithRole': {
    primaryObject: 'User',
    relatedObjects: ['UserRole'],
    requiredPermissions: {
      'User': 'Read',
      'UserRole': 'Read',
    },
  },

  // Product report types
  'ProductWithPricebook': {
    primaryObject: 'Product2',
    relatedObjects: ['PricebookEntry', 'Pricebook2'],
    requiredPermissions: {
      'Product2': 'Read',
      'PricebookEntry': 'Read',
      'Pricebook2': 'Read',
    },
  },
};

// CPQ-specific report types (Salesforce CPQ / SBQQ)
const CPQ_REPORT_TYPES = {
  'SBQQ__QuoteWithLines': {
    primaryObject: 'SBQQ__Quote__c',
    relatedObjects: ['SBQQ__QuoteLine__c', 'Product2', 'SBQQ__ProductOption__c'],
    requiredPermissions: {
      'SBQQ__Quote__c': 'Read',
      'SBQQ__QuoteLine__c': 'Read',
      'Product2': 'Read',
      'SBQQ__ProductOption__c': 'Read',
    },
  },
  'SBQQ__ContractWithSubscriptions': {
    primaryObject: 'Contract',
    relatedObjects: ['SBQQ__Subscription__c', 'Product2'],
    requiredPermissions: {
      'Contract': 'Read',
      'SBQQ__Subscription__c': 'Read',
      'Product2': 'Read',
    },
  },
};

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Execute sf CLI command and parse JSON response
 */
function sfCommand(command, orgAlias, options = {}) {
  const fullCommand = orgAlias
    ? `sf ${command} --target-org "${orgAlias}" --json 2>/dev/null`
    : `sf ${command} --json 2>/dev/null`;

  try {
    const result = execSync(fullCommand, {
      encoding: 'utf8',
      timeout: options.timeout || 60000,
      maxBuffer: 10 * 1024 * 1024,
    });

    const data = JSON.parse(result);
    if (data.status === 0 || data.result) {
      return { success: true, result: data.result };
    }
    return { success: false, error: data.message || 'Unknown error' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Get all report types in the org
 */
function getReportTypes(orgAlias) {
  const result = sfCommand(
    'data query --query "SELECT Id, Name, DeveloperName, Description FROM ReportType WHERE IsActive = true ORDER BY Name" --use-tooling-api',
    orgAlias
  );

  if (result.success && result.result?.records) {
    return result.result.records;
  }

  return [];
}

/**
 * Get report type details including object relationships
 */
function getReportTypeDetails(reportTypeName, orgAlias) {
  // First try to get from Tooling API
  const result = sfCommand(
    `data query --query "SELECT Id, DeveloperName, BaseObject, DeploymentStatus, Description FROM ReportType WHERE DeveloperName = '${reportTypeName}'" --use-tooling-api`,
    orgAlias
  );

  if (result.success && result.result?.records?.length > 0) {
    return result.result.records[0];
  }

  // Try by Name
  const resultByName = sfCommand(
    `data query --query "SELECT Id, DeveloperName, BaseObject, DeploymentStatus, Description FROM ReportType WHERE Name = '${reportTypeName}'" --use-tooling-api`,
    orgAlias
  );

  if (resultByName.success && resultByName.result?.records?.length > 0) {
    return resultByName.result.records[0];
  }

  return null;
}

/**
 * Get object describe to understand relationships
 */
function getObjectDescribe(objectName, orgAlias) {
  const result = sfCommand(`sobject describe ${objectName}`, orgAlias);
  return result.success ? result.result : null;
}

/**
 * Get current user's object permissions
 */
function getUserObjectPermissions(orgAlias) {
  const result = sfCommand(
    'data query --query "SELECT SobjectType, PermissionsRead, PermissionsCreate, PermissionsEdit, PermissionsDelete FROM ObjectPermissions WHERE ParentId IN (SELECT PermissionSetId FROM PermissionSetAssignment WHERE AssigneeId = :UserInfo.getUserId())"',
    orgAlias
  );

  if (result.success && result.result?.records) {
    const permissions = {};
    for (const record of result.result.records) {
      permissions[record.SobjectType] = {
        read: record.PermissionsRead,
        create: record.PermissionsCreate,
        edit: record.PermissionsEdit,
        delete: record.PermissionsDelete,
      };
    }
    return permissions;
  }

  return {};
}

/**
 * Get permission set's object permissions
 */
function getPermissionSetObjectPermissions(permissionSetName, orgAlias) {
  const result = sfCommand(
    `data query --query "SELECT SobjectType, PermissionsRead, PermissionsCreate, PermissionsEdit, PermissionsDelete FROM ObjectPermissions WHERE Parent.Name = '${permissionSetName}'"`,
    orgAlias
  );

  if (result.success && result.result?.records) {
    const permissions = {};
    for (const record of result.result.records) {
      permissions[record.SobjectType] = {
        read: record.PermissionsRead,
        create: record.PermissionsCreate,
        edit: record.PermissionsEdit,
        delete: record.PermissionsDelete,
      };
    }
    return permissions;
  }

  return {};
}

// =============================================================================
// Analysis Functions
// =============================================================================

/**
 * Analyze a report type to determine all required permissions
 */
async function analyzeReportType(reportTypeName, orgAlias, options = {}) {
  const verbose = options.verbose || false;

  // Check if it's a known standard report type
  const allKnownTypes = { ...STANDARD_REPORT_TYPES, ...CPQ_REPORT_TYPES };
  const knownType = allKnownTypes[reportTypeName];

  if (knownType) {
    if (verbose) {
      console.log(`[INFO] Found in standard report type mappings`);
    }
    return {
      reportType: reportTypeName,
      source: 'standard_mapping',
      primaryObject: knownType.primaryObject,
      relatedObjects: knownType.relatedObjects,
      requiredPermissions: knownType.requiredPermissions,
      notes: knownType.notes || null,
      analysis: {
        type: 'standard',
        confidence: 'high',
      },
    };
  }

  // Query the org for report type details
  if (verbose) {
    console.log(`[INFO] Querying org for report type: ${reportTypeName}`);
  }

  const details = getReportTypeDetails(reportTypeName, orgAlias);
  if (!details) {
    return {
      reportType: reportTypeName,
      source: 'not_found',
      error: `Report type '${reportTypeName}' not found in org`,
      suggestions: [
        'Check the report type API name (DeveloperName)',
        'Verify the report type is active',
        'Ensure you have access to the report type',
      ],
    };
  }

  // Analyze based on base object
  const baseObject = details.BaseObject;
  const baseDescribe = getObjectDescribe(baseObject, orgAlias);

  const relatedObjects = [];
  const requiredPermissions = {};

  // Primary object always required
  requiredPermissions[baseObject] = 'Read';

  // Analyze child relationships
  if (baseDescribe?.childRelationships) {
    const relevantChildren = baseDescribe.childRelationships
      .filter(rel => rel.relationshipName && !rel.deprecatedAndHidden)
      .slice(0, 20); // Limit to avoid too many

    for (const rel of relevantChildren) {
      relatedObjects.push(rel.childSObject);
      requiredPermissions[rel.childSObject] = 'Read';
    }
  }

  // Analyze lookup/master-detail fields
  if (baseDescribe?.fields) {
    const referenceFields = baseDescribe.fields.filter(
      f => f.type === 'reference' && f.referenceTo?.length > 0
    );

    for (const field of referenceFields) {
      for (const refTo of field.referenceTo) {
        if (!relatedObjects.includes(refTo)) {
          relatedObjects.push(refTo);
          requiredPermissions[refTo] = 'Read';
        }
      }
    }
  }

  return {
    reportType: reportTypeName,
    source: 'org_analysis',
    primaryObject: baseObject,
    relatedObjects: relatedObjects,
    requiredPermissions: requiredPermissions,
    metadata: {
      description: details.Description,
      deploymentStatus: details.DeploymentStatus,
      developerId: details.Id,
    },
    analysis: {
      type: 'dynamic',
      confidence: 'medium',
      note: 'Analysis based on object relationships; may not capture all report type-specific requirements',
    },
  };
}

/**
 * Validate that permissions cover report type requirements
 */
function validatePermissions(requiredPermissions, actualPermissions) {
  const missing = [];
  const covered = [];

  for (const [objectName, requiredLevel] of Object.entries(requiredPermissions)) {
    const actual = actualPermissions[objectName];
    const hasRead = actual?.read === true;

    if (requiredLevel === 'Read' && hasRead) {
      covered.push({ object: objectName, required: requiredLevel, has: 'Read' });
    } else if (!hasRead) {
      missing.push({
        object: objectName,
        required: requiredLevel,
        has: actual ? 'None/Insufficient' : 'No Permission',
      });
    }
  }

  return {
    isValid: missing.length === 0,
    covered,
    missing,
    coveragePercent: Math.round((covered.length / (covered.length + missing.length)) * 100),
  };
}

/**
 * Generate permission set XML for missing permissions
 */
function generatePermissionSetXml(missing, permissionSetName = 'Report_Access') {
  const objectPermissions = missing.map(m => `
    <objectPermissions>
        <allowCreate>false</allowCreate>
        <allowDelete>false</allowDelete>
        <allowEdit>false</allowEdit>
        <allowRead>true</allowRead>
        <modifyAllRecords>false</modifyAllRecords>
        <object>${m.object}</object>
        <viewAllRecords>false</viewAllRecords>
    </objectPermissions>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">
    <label>${permissionSetName}</label>
    <description>Grants Read access to objects required for report type access</description>
    <hasActivationRequired>false</hasActivationRequired>
${objectPermissions}
</PermissionSet>`;
}

// =============================================================================
// CLI Interface
// =============================================================================

async function main() {
  const args = process.argv.slice(2);

  const options = {
    verbose: args.includes('--verbose') || args.includes('-v'),
    json: args.includes('--json'),
    validate: args.includes('--validate'),
    listStandard: args.includes('--list-standard'),
    listAll: args.includes('--list-all'),
    generateXml: args.includes('--generate-xml'),
  };

  // Parse named arguments
  const getArg = (name) => {
    const index = args.findIndex(a => a === `--${name}`);
    return index !== -1 && args[index + 1] ? args[index + 1] : null;
  };

  const reportType = getArg('report-type');
  const orgAlias = getArg('org');
  const permissionSet = getArg('permission-set');

  // List standard report types
  if (options.listStandard) {
    const allTypes = { ...STANDARD_REPORT_TYPES, ...CPQ_REPORT_TYPES };
    if (options.json) {
      console.log(JSON.stringify(allTypes, null, 2));
    } else {
      console.log('\n=== Standard Report Type Permission Requirements ===\n');
      for (const [name, config] of Object.entries(allTypes)) {
        console.log(`${name}:`);
        console.log(`  Primary: ${config.primaryObject}`);
        console.log(`  Related: ${config.relatedObjects.join(', ')}`);
        console.log(`  Required Permissions:`);
        for (const [obj, perm] of Object.entries(config.requiredPermissions)) {
          console.log(`    - ${obj}: ${perm}`);
        }
        if (config.notes) {
          console.log(`  Notes: ${config.notes}`);
        }
        console.log('');
      }
    }
    process.exit(0);
  }

  // List all report types in org
  if (options.listAll && orgAlias) {
    const reportTypes = getReportTypes(orgAlias);
    if (options.json) {
      console.log(JSON.stringify(reportTypes, null, 2));
    } else {
      console.log(`\n=== Report Types in ${orgAlias} ===\n`);
      for (const rt of reportTypes) {
        console.log(`${rt.DeveloperName}`);
        if (rt.Description) {
          console.log(`  Description: ${rt.Description}`);
        }
      }
      console.log(`\nTotal: ${reportTypes.length} report types`);
    }
    process.exit(0);
  }

  // Analyze specific report type
  if (reportType) {
    const analysis = await analyzeReportType(reportType, orgAlias, options);

    if (analysis.source === 'not_found') {
      if (options.json) {
        console.log(JSON.stringify(analysis, null, 2));
      } else {
        console.log(`\n[ERROR] ${analysis.error}`);
        console.log('\nSuggestions:');
        analysis.suggestions.forEach(s => console.log(`  - ${s}`));
      }
      process.exit(2);
    }

    // Validate permissions if requested
    let validation = null;
    if (options.validate && orgAlias) {
      if (options.verbose) {
        console.log('\n[INFO] Validating current user permissions...');
      }
      const userPerms = getUserObjectPermissions(orgAlias);
      validation = validatePermissions(analysis.requiredPermissions, userPerms);
    }

    // Check permission set if specified
    let permSetValidation = null;
    if (permissionSet && orgAlias) {
      if (options.verbose) {
        console.log(`\n[INFO] Checking permission set: ${permissionSet}...`);
      }
      const psPerms = getPermissionSetObjectPermissions(permissionSet, orgAlias);
      permSetValidation = validatePermissions(analysis.requiredPermissions, psPerms);
    }

    const result = {
      ...analysis,
      validation,
      permissionSetValidation: permSetValidation,
    };

    // Generate XML if requested and there are missing permissions
    if (options.generateXml && (validation?.missing?.length > 0 || permSetValidation?.missing?.length > 0)) {
      const missing = validation?.missing || permSetValidation?.missing || [];
      result.suggestedPermissionSetXml = generatePermissionSetXml(
        missing,
        `${reportType.replace(/[^a-zA-Z0-9]/g, '_')}_Access`
      );
    }

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`\n=== Report Type Analysis: ${reportType} ===`);
      console.log(`Source: ${analysis.source}`);
      console.log(`Primary Object: ${analysis.primaryObject}`);
      console.log(`\nRelated Objects: ${analysis.relatedObjects?.join(', ') || 'None'}`);

      console.log(`\nRequired Permissions:`);
      for (const [obj, perm] of Object.entries(analysis.requiredPermissions || {})) {
        console.log(`  - ${obj}: ${perm}`);
      }

      if (analysis.notes) {
        console.log(`\n[NOTE] ${analysis.notes}`);
      }

      if (validation) {
        console.log(`\n=== User Permission Validation ===`);
        console.log(`Status: ${validation.isValid ? 'VALID' : 'MISSING PERMISSIONS'}`);
        console.log(`Coverage: ${validation.coveragePercent}%`);

        if (validation.missing.length > 0) {
          console.log(`\nMissing Permissions:`);
          for (const m of validation.missing) {
            console.log(`  - ${m.object}: Need ${m.required}, Has ${m.has}`);
          }
        }
      }

      if (permSetValidation) {
        console.log(`\n=== Permission Set Validation: ${permissionSet} ===`);
        console.log(`Status: ${permSetValidation.isValid ? 'COVERS ALL' : 'MISSING COVERAGE'}`);
        console.log(`Coverage: ${permSetValidation.coveragePercent}%`);

        if (permSetValidation.missing.length > 0) {
          console.log(`\nMissing from Permission Set:`);
          for (const m of permSetValidation.missing) {
            console.log(`  - ${m.object}: Need ${m.required}`);
          }
        }
      }

      if (result.suggestedPermissionSetXml) {
        console.log(`\n=== Suggested Permission Set XML ===`);
        console.log(result.suggestedPermissionSetXml);
      }
    }

    // Exit code based on validation
    if (validation && !validation.isValid) {
      process.exit(1);
    }
    process.exit(0);
  }

  // Show help
  console.log(`
Report Type Permission Analyzer

Analyzes Salesforce report types to identify ALL required object permissions.

Usage:
  node report-type-analyzer.js [options]

Options:
  --report-type <name>   Analyze a specific report type
  --org <alias>          Target Salesforce org alias
  --validate             Validate current user has required permissions
  --permission-set <ps>  Check if permission set covers requirements
  --generate-xml         Generate permission set XML for missing permissions
  --list-standard        List known standard report type requirements
  --list-all             List all report types in the org (requires --org)
  --json                 Output as JSON
  --verbose              Show detailed analysis

Examples:
  # Analyze Campaign with Members report type
  node report-type-analyzer.js --report-type CampaignWithCampaignMembers

  # Validate user permissions for a report type
  node report-type-analyzer.js --report-type CampaignWithCampaignMembers --org myorg --validate

  # Check if permission set covers requirements
  node report-type-analyzer.js --report-type CampaignWithCampaignMembers --org myorg --permission-set Campaign_Read_Only_Access

  # Generate XML for missing permissions
  node report-type-analyzer.js --report-type CampaignWithCampaignMembers --org myorg --validate --generate-xml

  # List all known standard report type requirements
  node report-type-analyzer.js --list-standard
`);
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  analyzeReportType,
  validatePermissions,
  generatePermissionSetXml,
  getReportTypes,
  getReportTypeDetails,
  getUserObjectPermissions,
  getPermissionSetObjectPermissions,
  STANDARD_REPORT_TYPES,
  CPQ_REPORT_TYPES,
};

// Run CLI if executed directly
if (require.main === module) {
  main().catch(err => {
    console.error('Error:', err.message);
    process.exit(3);
  });
}
