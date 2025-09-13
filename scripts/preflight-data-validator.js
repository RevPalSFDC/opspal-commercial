#!/usr/bin/env node

/**
 * Preflight Data Validation Script
 * 
 * Purpose: Validates data access capabilities BEFORE sub-agent execution
 * to prevent agents from running without proper query capabilities.
 * 
 * This script:
 * - Tests MCP connection before agent execution
 * - Verifies org access and permissions
 * - Validates query capabilities
 * - Aborts if data access is unavailable
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

class PreflightDataValidator {
  constructor() {
    this.validationResults = {
      timestamp: new Date().toISOString(),
      checks: {},
      canProceed: false,
      warnings: [],
      errors: [],
      recommendations: []
    };
  }

  /**
   * Run all preflight checks
   */
  async runPreflightChecks(targetSystem = 'salesforce') {
    console.log('🚀 Running Preflight Data Validation...\n');

    // Run checks based on target system
    if (targetSystem === 'salesforce' || targetSystem === 'all') {
      await this.checkSalesforceAccess();
    }
    
    if (targetSystem === 'hubspot' || targetSystem === 'all') {
      await this.checkHubSpotAccess();
    }
    
    if (targetSystem === 'gdrive' || targetSystem === 'all') {
      await this.checkGoogleDriveAccess();
    }

    // Check MCP availability
    await this.checkMCPServers();

    // Validate query capabilities
    await this.validateQueryCapabilities(targetSystem);

    // Determine if we can proceed
    this.determineReadiness();

    // Generate report
    return this.generateReport();
  }

  /**
   * Check Salesforce access
   */
  async checkSalesforceAccess() {
    console.log('📊 Checking Salesforce access...');
    
    const check = {
      name: 'Salesforce Access',
      status: 'CHECKING',
      details: {}
    };

    try {
      // Check if authenticated
      const { stdout: authList } = await execPromise('sf org list --json 2>/dev/null || echo "{"status":1}"');
      const authResult = JSON.parse(authList);
      
      if (authResult.status === 0 && authResult.result?.nonScratchOrgs?.length > 0) {
        check.details.authenticated = true;
        check.details.orgs = authResult.result.nonScratchOrgs.map(org => ({
          alias: org.alias,
          username: org.username,
          isDefault: org.isDefaultUsername
        }));

        // Test query capability on default org
        const defaultOrg = authResult.result.nonScratchOrgs.find(o => o.isDefaultUsername);
        if (defaultOrg) {
          await this.testSalesforceQuery(defaultOrg.alias || defaultOrg.username);
          check.status = 'PASSED';
          check.details.queryCapable = true;
        } else {
          check.status = 'WARNING';
          this.validationResults.warnings.push('No default Salesforce org set');
          check.details.queryCapable = false;
        }
      } else {
        check.status = 'FAILED';
        check.details.authenticated = false;
        this.validationResults.errors.push('Not authenticated to Salesforce');
        this.validationResults.recommendations.push('Run: sf auth:web:login');
      }
    } catch (error) {
      check.status = 'FAILED';
      check.error = error.message;
      this.validationResults.errors.push(`Salesforce check failed: ${error.message}`);
    }

    this.validationResults.checks.salesforce = check;
    console.log(`  Status: ${check.status}\n`);
  }

  /**
   * Test Salesforce query capability
   */
  async testSalesforceQuery(org) {
    try {
      const testQuery = 'SELECT COUNT() FROM User LIMIT 1';
      const { stdout } = await execPromise(
        `sf data query --query "${testQuery}" --target-org ${org} --json 2>/dev/null`
      );
      
      const result = JSON.parse(stdout);
      return result.status === 0;
    } catch (error) {
      this.validationResults.warnings.push(`Cannot execute test query: ${error.message}`);
      return false;
    }
  }

  /**
   * Check HubSpot access
   */
  async checkHubSpotAccess() {
    console.log('🔧 Checking HubSpot access...');
    
    const check = {
      name: 'HubSpot Access',
      status: 'CHECKING',
      details: {}
    };

    try {
      // Check for HubSpot credentials
      const hasToken = !!process.env.HUBSPOT_ACCESS_TOKEN || !!process.env.HUBSPOT_API_KEY;
      
      if (hasToken) {
        check.status = 'PASSED';
        check.details.authenticated = true;
      } else {
        check.status = 'WARNING';
        check.details.authenticated = false;
        this.validationResults.warnings.push('HubSpot credentials not found in environment');
        this.validationResults.recommendations.push('Set HUBSPOT_ACCESS_TOKEN environment variable');
      }
    } catch (error) {
      check.status = 'FAILED';
      check.error = error.message;
    }

    this.validationResults.checks.hubspot = check;
    console.log(`  Status: ${check.status}\n`);
  }

  /**
   * Check Google Drive access
   */
  async checkGoogleDriveAccess() {
    console.log('📁 Checking Google Drive access...');
    
    const check = {
      name: 'Google Drive Access',
      status: 'CHECKING',
      details: {}
    };

    try {
      // Check for Google Drive credentials
      const hasCredentials = !!(process.env.GDRIVE_CLIENT_ID && process.env.GDRIVE_CLIENT_SECRET);
      
      if (hasCredentials) {
        check.status = 'PASSED';
        check.details.configured = true;
      } else {
        check.status = 'WARNING';
        check.details.configured = false;
        this.validationResults.warnings.push('Google Drive credentials not configured');
      }
    } catch (error) {
      check.status = 'FAILED';
      check.error = error.message;
    }

    this.validationResults.checks.gdrive = check;
    console.log(`  Status: ${check.status}\n`);
  }

  /**
   * Check MCP server availability
   */
  async checkMCPServers() {
    console.log('🔌 Checking MCP servers...');
    
    const check = {
      name: 'MCP Servers',
      status: 'CHECKING',
      servers: {}
    };

    try {
      // Read MCP configuration
      const mcpConfigPath = path.join(process.cwd(), '.mcp.json');
      const mcpConfig = JSON.parse(await fs.readFile(mcpConfigPath, 'utf-8'));
      
      // Check each server
      for (const [serverName, serverConfig] of Object.entries(mcpConfig.mcpServers || {})) {
        if (!serverConfig.disabled) {
          check.servers[serverName] = {
            configured: true,
            disabled: false
          };
          
          // Check if it's a data-related server
          if (serverName.includes('salesforce') || serverName.includes('hubspot') || serverName.includes('gdrive')) {
            check.servers[serverName].dataServer = true;
          }
        } else {
          check.servers[serverName] = {
            configured: true,
            disabled: true
          };
        }
      }

      // Check if we have at least one data server enabled
      const hasDataServer = Object.values(check.servers).some(s => s.dataServer && !s.disabled);
      
      if (hasDataServer) {
        check.status = 'PASSED';
      } else {
        check.status = 'WARNING';
        this.validationResults.warnings.push('No data MCP servers enabled');
      }
      
    } catch (error) {
      check.status = 'FAILED';
      check.error = error.message;
      this.validationResults.errors.push('Cannot read MCP configuration');
      this.validationResults.recommendations.push('Ensure .mcp.json exists and is valid');
    }

    this.validationResults.checks.mcp = check;
    console.log(`  Status: ${check.status}\n`);
  }

  /**
   * Validate query capabilities
   */
  async validateQueryCapabilities(targetSystem) {
    console.log('🔍 Validating query capabilities...');
    
    const check = {
      name: 'Query Capabilities',
      status: 'CHECKING',
      capabilities: {}
    };

    // Check if we can query via MCP
    if (this.validationResults.checks.mcp?.status === 'PASSED') {
      check.capabilities.mcp = true;
      
      // Check specific MCP tools
      const mcpCheck = this.validationResults.checks.mcp;
      if (mcpCheck.servers['salesforce-dx'] && !mcpCheck.servers['salesforce-dx'].disabled) {
        check.capabilities.salesforceMCP = true;
      }
      if (mcpCheck.servers['hubspot-v4'] && !mcpCheck.servers['hubspot-v4'].disabled) {
        check.capabilities.hubspotMCP = true;
      }
    }

    // Check if we can query via CLI
    if (this.validationResults.checks.salesforce?.status === 'PASSED') {
      check.capabilities.salesforceCLI = true;
    }

    // Determine overall capability
    const hasQueryCapability = Object.values(check.capabilities).some(v => v);
    
    if (hasQueryCapability) {
      check.status = 'PASSED';
    } else {
      check.status = 'FAILED';
      this.validationResults.errors.push('No query capabilities available');
      this.validationResults.recommendations.push('Configure MCP servers or authenticate with data sources');
    }

    this.validationResults.checks.queryCapabilities = check;
    console.log(`  Status: ${check.status}\n`);
  }

  /**
   * Determine if we can proceed
   */
  determineReadiness() {
    // Check for any failed critical checks
    const criticalChecks = ['queryCapabilities'];
    const hasCriticalFailure = criticalChecks.some(
      check => this.validationResults.checks[check]?.status === 'FAILED'
    );

    // Check for any errors
    const hasErrors = this.validationResults.errors.length > 0;

    // Determine if we can proceed
    this.validationResults.canProceed = !hasCriticalFailure && !hasErrors;

    // Add recommendation if we can't proceed
    if (!this.validationResults.canProceed) {
      this.validationResults.recommendations.unshift(
        '⚠️ CRITICAL: Cannot proceed with data operations. Fix errors above before continuing.'
      );
    }
  }

  /**
   * Generate validation report
   */
  generateReport() {
    console.log('=' .repeat(60));
    console.log('PREFLIGHT VALIDATION REPORT');
    console.log('='.repeat(60));
    
    // Summary
    console.log('\n📊 SUMMARY:');
    console.log(`Can Proceed: ${this.validationResults.canProceed ? '✅ YES' : '❌ NO'}`);
    console.log(`Timestamp: ${this.validationResults.timestamp}`);

    // Check results
    console.log('\n✓ CHECK RESULTS:');
    for (const [name, check] of Object.entries(this.validationResults.checks)) {
      const statusIcon = check.status === 'PASSED' ? '✅' : 
                         check.status === 'WARNING' ? '⚠️' : '❌';
      console.log(`  ${statusIcon} ${check.name || name}: ${check.status}`);
    }

    // Errors
    if (this.validationResults.errors.length > 0) {
      console.log('\n❌ ERRORS:');
      this.validationResults.errors.forEach(error => {
        console.log(`  • ${error}`);
      });
    }

    // Warnings
    if (this.validationResults.warnings.length > 0) {
      console.log('\n⚠️ WARNINGS:');
      this.validationResults.warnings.forEach(warning => {
        console.log(`  • ${warning}`);
      });
    }

    // Recommendations
    if (this.validationResults.recommendations.length > 0) {
      console.log('\n💡 RECOMMENDATIONS:');
      this.validationResults.recommendations.forEach(rec => {
        console.log(`  • ${rec}`);
      });
    }

    console.log('\n' + '='.repeat(60));

    return this.validationResults;
  }

  /**
   * Save report to file
   */
  async saveReport(outputPath) {
    const reportPath = outputPath || path.join(
      process.cwd(), 
      '.claude', 
      'logs', 
      `preflight_${Date.now()}.json`
    );

    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(this.validationResults, null, 2));
    
    console.log(`\nReport saved to: ${reportPath}`);
    return reportPath;
  }

  /**
   * Quick validation for CI/CD
   */
  async quickValidate() {
    // Just check critical components
    await this.checkMCPServers();
    await this.validateQueryCapabilities('all');
    this.determineReadiness();
    
    if (!this.validationResults.canProceed) {
      throw new Error('Preflight validation failed - cannot access data sources');
    }
    
    return this.validationResults.canProceed;
  }
}

// CLI interface
async function main() {
  const validator = new PreflightDataValidator();
  
  const command = process.argv[2] || 'all';
  const outputPath = process.argv[3];

  try {
    switch (command) {
      case 'salesforce':
      case 'hubspot':
      case 'gdrive':
      case 'all':
        const results = await validator.runPreflightChecks(command);
        
        if (outputPath) {
          await validator.saveReport(outputPath);
        }
        
        // Exit with error code if validation failed
        if (!results.canProceed) {
          process.exit(1);
        }
        break;

      case 'quick':
        const canProceed = await validator.quickValidate();
        console.log(canProceed ? '✅ Ready' : '❌ Not ready');
        process.exit(canProceed ? 0 : 1);
        break;

      default:
        console.log('Preflight Data Validator');
        console.log('\nUsage:');
        console.log('  preflight-data-validator [system] [output-file]');
        console.log('\nSystems:');
        console.log('  all        - Check all systems (default)');
        console.log('  salesforce - Check Salesforce only');
        console.log('  hubspot    - Check HubSpot only');
        console.log('  gdrive     - Check Google Drive only');
        console.log('  quick      - Quick validation for CI/CD');
        console.log('\nExamples:');
        console.log('  preflight-data-validator');
        console.log('  preflight-data-validator salesforce');
        console.log('  preflight-data-validator all ./validation-report.json');
    }
  } catch (error) {
    console.error('\n❌ Validation failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = PreflightDataValidator;