#!/usr/bin/env node
/**
 * Package Verification
 *
 * Verifies managed package installation before attempting namespace-specific queries.
 * Prevents confusing NULL results when package is not installed vs query errors.
 *
 * Addresses error E005: "Missing Package Installation Verification"
 *
 * @module package-verification
 * @version 1.0.0
 * @created 2025-10-03
 */

const { execSync } = require('child_process');

/**
 * Well-known Salesforce packages
 */
const KNOWN_PACKAGES = {
  SBQQ: {
    namespace: 'SBQQ',
    name: 'Salesforce CPQ',
    objects: ['SBQQ__Quote__c', 'SBQQ__Subscription__c', 'SBQQ__QuoteLine__c'],
    minComponentCount: 200 // CPQ has 268+ objects/classes
  },
  FSL: {
    namespace: 'FSL',
    name: 'Field Service Lightning',
    objects: ['FSL__Service_Appointment__c'],
    minComponentCount: 50
  },
  et4ae5: {
    namespace: 'et4ae5',
    name: 'Marketing Cloud',
    objects: [],
    minComponentCount: 20
  }
};

/**
 * Verify if a managed package is installed
 *
 * @param {string} namespace - Package namespace (e.g., 'SBQQ')
 * @param {string} orgAlias - Salesforce org alias
 * @returns {Object} Verification result
 */
function verifyPackageInstalled(namespace, orgAlias) {
  try {
    // Method 1: Check ApexClass for namespace
    const classQuery = `SELECT NamespacePrefix, COUNT(Id) class_count FROM ApexClass WHERE NamespacePrefix = '${namespace}' GROUP BY NamespacePrefix`;
    const classResult = execSync(
      `sf data query --query "${classQuery}" --use-tooling-api -o ${orgAlias} --json`,
      { encoding: 'utf-8' }
    );

    const classParsed = JSON.parse(classResult);

    if (classParsed.status === 0 && classParsed.result.records.length > 0) {
      const componentCount = classParsed.result.records[0].class_count;

      return {
        installed: true,
        namespace,
        method: 'ApexClass query',
        componentCount,
        orgAlias,
        packageInfo: KNOWN_PACKAGES[namespace] || null
      };
    }

    // Method 2: Try querying a known object from the package
    const packageInfo = KNOWN_PACKAGES[namespace];
    if (packageInfo && packageInfo.objects.length > 0) {
      const testObject = packageInfo.objects[0];
      const objectQuery = `SELECT COUNT() FROM ${testObject}`;

      try {
        const objectResult = execSync(
          `sf data query --query "${objectQuery}" -o ${orgAlias} --json`,
          { encoding: 'utf-8' }
        );

        const objectParsed = JSON.parse(objectResult);

        if (objectParsed.status === 0) {
          return {
            installed: true,
            namespace,
            method: 'Object query',
            testObject,
            orgAlias,
            packageInfo
          };
        }
      } catch (error) {
        // Object query failed - package likely not installed
      }
    }

    // Package not found
    return {
      installed: false,
      namespace,
      orgAlias,
      message: `Package with namespace '${namespace}' not found in org`,
      recommendation: packageInfo
        ? `Expected to find ${packageInfo.name}. Verify package installation.`
        : 'Verify namespace spelling and package installation.'
    };

  } catch (error) {
    return {
      installed: false,
      namespace,
      orgAlias,
      error: error.message,
      message: 'Error during package verification'
    };
  }
}

/**
 * Get list of all installed packages
 *
 * @param {string} orgAlias - Salesforce org alias
 * @returns {Array} List of installed packages
 */
function listInstalledPackages(orgAlias) {
  try {
    const query = 'SELECT NamespacePrefix, COUNT(Id) component_count FROM ApexClass WHERE NamespacePrefix != null GROUP BY NamespacePrefix ORDER BY COUNT(Id) DESC';
    const result = execSync(
      `sf data query --query "${query}" --use-tooling-api -o ${orgAlias} --json`,
      { encoding: 'utf-8' }
    );

    const parsed = JSON.parse(result);

    if (parsed.status !== 0) {
      return {
        success: false,
        error: 'Query execution failed',
        orgAlias
      };
    }

    const packages = parsed.result.records.map(record => {
      const namespace = record.NamespacePrefix;
      const knownPackage = KNOWN_PACKAGES[namespace];

      return {
        namespace,
        componentCount: record.component_count,
        knownPackage: knownPackage ? knownPackage.name : null
      };
    });

    return {
      success: true,
      orgAlias,
      packages,
      totalPackages: packages.length
    };

  } catch (error) {
    return {
      success: false,
      error: error.message,
      orgAlias
    };
  }
}

/**
 * Verify CPQ installation (convenience method)
 *
 * @param {string} orgAlias - Salesforce org alias
 * @returns {Object} CPQ verification result
 */
function verifyCPQInstalled(orgAlias) {
  const result = verifyPackageInstalled('SBQQ', orgAlias);

  if (result.installed) {
    result.cpqReady = true;
    result.message = `Salesforce CPQ is installed with ${result.componentCount} components.`;
  } else {
    result.cpqReady = false;
    result.message = 'Salesforce CPQ is NOT installed in this org.';
    result.recommendation = 'CPQ assessment cannot proceed without CPQ package.';
  }

  return result;
}

/**
 * Pre-flight check for CPQ assessment
 *
 * Comprehensive check before starting CPQ assessment
 *
 * @param {string} orgAlias - Salesforce org alias
 * @returns {Object} Pre-flight result
 */
function cpqAssessmentPreFlight(orgAlias) {
  const checks = {
    orgConnection: false,
    cpqInstalled: false,
    cpqObjectsAccessible: false,
    nativeQuotingAvailable: false
  };

  const issues = [];
  const warnings = [];

  try {
    // Check 1: Org connection
    const orgDisplay = execSync(`sf org display -o ${orgAlias} --json`, { encoding: 'utf-8' });
    const orgParsed = JSON.parse(orgDisplay);

    if (orgParsed.status === 0) {
      checks.orgConnection = true;
    } else {
      issues.push({
        check: 'orgConnection',
        message: 'Cannot connect to org',
        severity: 'blocking'
      });
      return { proceed: false, checks, issues };
    }

    // Check 2: CPQ Installation
    const cpqCheck = verifyCPQInstalled(orgAlias);
    checks.cpqInstalled = cpqCheck.installed;

    if (!cpqCheck.installed) {
      issues.push({
        check: 'cpqInstalled',
        message: 'Salesforce CPQ package not installed',
        severity: 'blocking',
        recommendation: 'CPQ assessment cannot proceed without CPQ package installed'
      });
      return { proceed: false, checks, issues };
    }

    // Check 3: CPQ Objects Accessible
    try {
      const testQuery = 'SELECT COUNT(Id) cnt FROM SBQQ__Quote__c LIMIT 1';
      execSync(`sf data query --query "${testQuery}" -o ${orgAlias} --json`, { encoding: 'utf-8' });
      checks.cpqObjectsAccessible = true;
    } catch (error) {
      issues.push({
        check: 'cpqObjectsAccessible',
        message: 'Cannot query CPQ objects (permissions issue)',
        severity: 'blocking',
        recommendation: 'Verify user has CPQ object permissions'
      });
      return { proceed: false, checks, issues };
    }

    // Check 4: Native Quoting (warning only if not accessible)
    try {
      const quoteQuery = 'SELECT COUNT(Id) cnt FROM Quote LIMIT 1';
      execSync(`sf data query --query "${quoteQuery}" -o ${orgAlias} --json`, { encoding: 'utf-8' });
      checks.nativeQuotingAvailable = true;
    } catch (error) {
      warnings.push({
        check: 'nativeQuotingAvailable',
        message: 'Cannot query native Quote object',
        severity: 'warning',
        impact: 'Dual-system analysis will be limited'
      });
    }

    return {
      proceed: true,
      checks,
      issues,
      warnings,
      message: 'All pre-flight checks passed. Ready for CPQ assessment.',
      orgAlias
    };

  } catch (error) {
    issues.push({
      check: 'preFlight',
      message: `Pre-flight check failed: ${error.message}`,
      severity: 'blocking'
    });

    return {
      proceed: false,
      checks,
      issues,
      orgAlias
    };
  }
}

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'verify') {
    const namespace = args[1];
    const orgAlias = args[2];

    if (!namespace || !orgAlias) {
      console.error('Usage: package-verification.js verify <namespace> <org-alias>');
      process.exit(1);
    }

    const result = verifyPackageInstalled(namespace, orgAlias);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.installed ? 0 : 1);
  }

  if (command === 'verify-cpq') {
    const orgAlias = args[1];

    if (!orgAlias) {
      console.error('Usage: package-verification.js verify-cpq <org-alias>');
      process.exit(1);
    }

    const result = verifyCPQInstalled(orgAlias);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.installed ? 0 : 1);
  }

  if (command === 'list') {
    const orgAlias = args[1];

    if (!orgAlias) {
      console.error('Usage: package-verification.js list <org-alias>');
      process.exit(1);
    }

    const result = listInstalledPackages(orgAlias);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  }

  if (command === 'cpq-preflight') {
    const orgAlias = args[1];

    if (!orgAlias) {
      console.error('Usage: package-verification.js cpq-preflight <org-alias>');
      process.exit(1);
    }

    const result = cpqAssessmentPreFlight(orgAlias);

    if (!result.proceed) {
      console.error('\n🚨 PRE-FLIGHT CHECK FAILED\n');
      result.issues.forEach((issue, idx) => {
        console.error(`${idx + 1}. ${issue.message} (${issue.severity})`);
        if (issue.recommendation) {
          console.error(`   → ${issue.recommendation}`);
        }
      });
      console.error('\n❌ Cannot proceed with CPQ assessment\n');
    } else {
      console.log('\n✅ PRE-FLIGHT CHECK PASSED\n');
      console.log('All systems ready for CPQ assessment');

      if (result.warnings.length > 0) {
        console.log('\nWarnings:');
        result.warnings.forEach((warning, idx) => {
          console.log(`${idx + 1}. ${warning.message}`);
        });
      }
    }

    console.log(JSON.stringify(result, null, 2));
    process.exit(result.proceed ? 0 : 1);
  }

  console.error('Usage:');
  console.error('  package-verification.js verify <namespace> <org-alias>');
  console.error('  package-verification.js verify-cpq <org-alias>');
  console.error('  package-verification.js list <org-alias>');
  console.error('  package-verification.js cpq-preflight <org-alias>');
  process.exit(1);
}

module.exports = {
  verifyPackageInstalled,
  verifyCPQInstalled,
  listInstalledPackages,
  cpqAssessmentPreFlight,
  KNOWN_PACKAGES
};
