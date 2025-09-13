#!/usr/bin/env node

/**
 * Subagent Query Verification System
 * 
 * Purpose: Ensures sub-agents execute real queries against live systems
 * and never generate fake data without explicit disclosure.
 * 
 * This script provides:
 * - Pre-execution validation of MCP tool availability
 * - Query execution tracking with detailed audit logs
 * - Real-time data source verification
 * - Automatic failure detection and reporting
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

class SubagentQueryVerifier {
  constructor() {
    this.logDir = path.join(process.cwd(), '.claude', 'logs', 'query-verification');
    this.verificationResults = [];
    this.dataSourcePatterns = {
      live: {
        indicators: [
          'mcp_salesforce_data_query',
          'sf data query',
          'sfdx force:data:soql:query',
          'SOQL query executed',
          'Records retrieved:'
        ],
        confidence: 0.95
      },
      simulated: {
        indicators: [
          'SIMULATED DATA',
          'Example data',
          'Sample records',
          'Mock data',
          'Test data',
          // Suspicious patterns
          /Lead \d+/,
          /Opportunity \d+/,
          /exactly \d+%/,
          /\b(15|20|25|30|35|40|45|50)%\b/, // Round percentages
        ],
        confidence: 0.90
      },
      failed: {
        indicators: [
          'Query failed',
          'Error executing',
          'Permission denied',
          'Invalid SOQL',
          'Connection error',
          'MCP tool unavailable'
        ],
        confidence: 0.85
      }
    };
  }

  async initialize() {
    // Create log directory if it doesn't exist
    await fs.mkdir(this.logDir, { recursive: true });
    
    // Initialize verification log
    const timestamp = new Date().toISOString();
    this.sessionId = `verify_${Date.now()}`;
    this.logFile = path.join(this.logDir, `${this.sessionId}.json`);
    
    await this.writeLog({
      sessionId: this.sessionId,
      startTime: timestamp,
      status: 'initialized'
    });

    console.log(`✅ Query Verifier initialized: ${this.sessionId}`);
  }

  /**
   * Verify MCP tool availability before agent execution
   */
  async verifyMCPAvailability() {
    const results = {
      timestamp: new Date().toISOString(),
      mcpTools: {},
      available: false
    };

    try {
      // Check for Salesforce MCP
      const { stdout: sfStatus } = await execPromise('claude mcp list 2>/dev/null | grep salesforce-dx || echo "not found"');
      results.mcpTools.salesforce = !sfStatus.includes('not found');

      // Check for HubSpot MCP  
      const { stdout: hsStatus } = await execPromise('claude mcp list 2>/dev/null | grep hubspot || echo "not found"');
      results.mcpTools.hubspot = !hsStatus.includes('not found');

      // Check for Google Drive MCP
      const { stdout: gdStatus } = await execPromise('claude mcp list 2>/dev/null | grep gdrive || echo "not found"');
      results.mcpTools.gdrive = !gdStatus.includes('not found');

      results.available = Object.values(results.mcpTools).some(v => v);

      if (!results.available) {
        console.error('⚠️ WARNING: No MCP data tools available!');
        console.error('Sub-agents may not be able to query live data.');
      }

    } catch (error) {
      results.error = error.message;
      console.error('❌ Error checking MCP availability:', error.message);
    }

    await this.writeLog({ mcpVerification: results });
    return results;
  }

  /**
   * Analyze agent output to determine data source
   */
  async analyzeDataSource(output) {
    const analysis = {
      timestamp: new Date().toISOString(),
      dataSource: 'UNKNOWN',
      confidence: 0,
      indicators: [],
      warnings: []
    };

    // Convert output to string if needed
    const content = typeof output === 'string' ? output : JSON.stringify(output, null, 2);

    // Check for live data indicators
    for (const indicator of this.dataSourcePatterns.live.indicators) {
      if (content.includes(indicator)) {
        analysis.indicators.push(`Live data indicator: ${indicator}`);
        analysis.dataSource = 'LIVE_DATA';
        analysis.confidence = Math.max(analysis.confidence, this.dataSourcePatterns.live.confidence);
      }
    }

    // Check for simulated data patterns
    for (const indicator of this.dataSourcePatterns.simulated.indicators) {
      if (indicator instanceof RegExp) {
        if (indicator.test(content)) {
          analysis.warnings.push(`Simulated data pattern detected: ${indicator}`);
          if (analysis.dataSource === 'UNKNOWN') {
            analysis.dataSource = 'SIMULATED_DATA';
            analysis.confidence = this.dataSourcePatterns.simulated.confidence;
          }
        }
      } else if (content.includes(indicator)) {
        analysis.warnings.push(`Simulated data indicator: ${indicator}`);
        if (analysis.dataSource === 'UNKNOWN') {
          analysis.dataSource = 'SIMULATED_DATA';
          analysis.confidence = this.dataSourcePatterns.simulated.confidence;
        }
      }
    }

    // Check for query failure indicators
    for (const indicator of this.dataSourcePatterns.failed.indicators) {
      if (content.includes(indicator)) {
        analysis.warnings.push(`Query failure indicator: ${indicator}`);
        analysis.dataSource = 'QUERY_FAILED';
        analysis.confidence = this.dataSourcePatterns.failed.confidence;
        break;
      }
    }

    // Check for suspicious patterns
    const suspiciousPatterns = [
      { pattern: /\b(\d+\.0+%)\b/g, message: 'Suspiciously round percentages' },
      { pattern: /Lead \d{2,3}(?:\s|,|$)/g, message: 'Generic lead naming pattern' },
      { pattern: /Opportunity \d{2,3}(?:\s|,|$)/g, message: 'Generic opportunity naming pattern' },
      { pattern: /Example \d+:/g, message: 'Example data pattern' },
      { pattern: /\$\d+,000\.00/g, message: 'Round dollar amounts' }
    ];

    for (const { pattern, message } of suspiciousPatterns) {
      const matches = content.match(pattern);
      if (matches && matches.length > 2) {
        analysis.warnings.push(`${message}: ${matches.slice(0, 3).join(', ')}...`);
        if (analysis.dataSource === 'UNKNOWN') {
          analysis.dataSource = 'LIKELY_SIMULATED';
          analysis.confidence = 0.75;
        }
      }
    }

    // Log findings
    if (analysis.dataSource === 'SIMULATED_DATA' || analysis.dataSource === 'LIKELY_SIMULATED') {
      console.error('🚨 ALERT: Simulated data detected in agent output!');
      console.error('Warnings:', analysis.warnings);
    } else if (analysis.dataSource === 'QUERY_FAILED') {
      console.error('❌ Query execution failed in agent');
    } else if (analysis.dataSource === 'LIVE_DATA') {
      console.log('✅ Verified: Live data query executed');
    }

    await this.writeLog({ dataSourceAnalysis: analysis });
    return analysis;
  }

  /**
   * Validate query execution metadata
   */
  validateQueryMetadata(metadata) {
    const required = [
      'timestamp',
      'query',
      'recordCount',
      'dataSource',
      'executionTime'
    ];

    const validation = {
      valid: true,
      missing: [],
      warnings: []
    };

    for (const field of required) {
      if (!metadata[field]) {
        validation.valid = false;
        validation.missing.push(field);
      }
    }

    // Check for suspicious values
    if (metadata.recordCount && metadata.recordCount % 50 === 0 && metadata.recordCount > 0) {
      validation.warnings.push('Suspicious round record count');
    }

    if (metadata.executionTime && metadata.executionTime < 10) {
      validation.warnings.push('Unusually fast query execution');
    }

    if (metadata.dataSource === 'SIMULATED') {
      validation.warnings.push('Query used simulated data');
      validation.valid = false;
    }

    return validation;
  }

  /**
   * Track query execution
   */
  async trackQueryExecution(agentName, query, result) {
    const tracking = {
      timestamp: new Date().toISOString(),
      agentName,
      query,
      success: false,
      dataSource: 'UNKNOWN',
      recordCount: 0,
      executionTime: 0
    };

    try {
      if (result.error) {
        tracking.success = false;
        tracking.error = result.error;
        tracking.dataSource = 'QUERY_FAILED';
      } else if (result.data) {
        tracking.success = true;
        tracking.dataSource = result.metadata?.dataSource || 'UNKNOWN';
        tracking.recordCount = Array.isArray(result.data) ? result.data.length : 1;
        tracking.executionTime = result.metadata?.executionTime || 0;
      }

      // Analyze the result for data source
      const analysis = await this.analyzeDataSource(result);
      tracking.analysis = analysis;

      // Alert on issues
      if (tracking.dataSource === 'SIMULATED' || analysis.dataSource === 'SIMULATED_DATA') {
        console.error(`🚨 CRITICAL: Agent ${agentName} used simulated data!`);
        console.error(`Query: ${query.substring(0, 100)}...`);
      }

    } catch (error) {
      tracking.error = error.message;
    }

    this.verificationResults.push(tracking);
    await this.writeLog({ queryExecution: tracking });
    
    return tracking;
  }

  /**
   * Generate verification report
   */
  async generateReport() {
    const report = {
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      summary: {
        totalQueries: this.verificationResults.length,
        liveQueries: 0,
        simulatedQueries: 0,
        failedQueries: 0,
        unknownQueries: 0
      },
      details: this.verificationResults,
      recommendations: []
    };

    // Calculate summary
    for (const result of this.verificationResults) {
      const source = result.analysis?.dataSource || result.dataSource;
      if (source === 'LIVE_DATA') report.summary.liveQueries++;
      else if (source === 'SIMULATED_DATA' || source === 'LIKELY_SIMULATED') report.summary.simulatedQueries++;
      else if (source === 'QUERY_FAILED') report.summary.failedQueries++;
      else report.summary.unknownQueries++;
    }

    // Generate recommendations
    if (report.summary.simulatedQueries > 0) {
      report.recommendations.push({
        severity: 'CRITICAL',
        issue: 'Simulated data detected',
        action: 'Review sub-agent configs; ensure MCP tools are accessible; prefer shared tools (ClaudeSFDC/shared) for org-safe queries'
      });
    }

    if (report.summary.failedQueries > 0) {
      report.recommendations.push({
        severity: 'HIGH',
        issue: 'Query failures detected',
        action: 'Check auth/permissions/API limits; consider shared scripts: data-pulse.sh, duplicates-scan.js'
      });
    }

    if (report.summary.unknownQueries > 0) {
      report.recommendations.push({
        severity: 'MEDIUM',
        issue: 'Unable to verify data source for some queries',
        action: 'Enhance query metadata tracking; route through SafeQueryExecutor or shared scripts with JSON outputs'
      });
    }

    // Save report
    const reportPath = path.join(this.logDir, `report_${this.sessionId}.json`);
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    // Display summary
    console.log('\n📊 Query Verification Report:');
    console.log(`✅ Live Queries: ${report.summary.liveQueries}`);
    console.log(`⚠️ Simulated: ${report.summary.simulatedQueries}`);
    console.log(`❌ Failed: ${report.summary.failedQueries}`);
    console.log(`❓ Unknown: ${report.summary.unknownQueries}`);

    if (report.recommendations.length > 0) {
      console.log('\n📋 Recommendations:');
      for (const rec of report.recommendations) {
        console.log(`  [${rec.severity}] ${rec.issue}`);
        console.log(`    → ${rec.action}`);
      }
    }

    return report;
  }

  /**
   * Write to log file
   */
  async writeLog(entry) {
    try {
      let existingLog = [];
      try {
        const content = await fs.readFile(this.logFile, 'utf-8');
        existingLog = JSON.parse(content);
      } catch (e) {
        // File doesn't exist yet
      }

      existingLog.push({
        ...entry,
        timestamp: new Date().toISOString()
      });

      await fs.writeFile(this.logFile, JSON.stringify(existingLog, null, 2));
    } catch (error) {
      console.error('Error writing to log:', error.message);
    }
  }

  /**
   * Monitor agent execution in real-time
   */
  async monitorExecution(agentName, outputStream) {
    console.log(`🔍 Monitoring ${agentName} execution...`);
    
    let buffer = '';
    outputStream.on('data', async (chunk) => {
      buffer += chunk.toString();
      
      // Check for query patterns in real-time
      if (buffer.includes('SELECT') || buffer.includes('FROM')) {
        console.log(`  → Query detected in ${agentName}`);
      }
      
      // Check for suspicious patterns
      for (const pattern of this.dataSourcePatterns.simulated.indicators) {
        if (pattern instanceof RegExp ? pattern.test(buffer) : buffer.includes(pattern)) {
          console.warn(`  ⚠️ Possible simulated data in ${agentName}`);
          break;
        }
      }
    });

    outputStream.on('end', async () => {
      await this.analyzeDataSource(buffer);
    });
  }
}

// CLI interface
async function main() {
  const verifier = new SubagentQueryVerifier();
  await verifier.initialize();

  const command = process.argv[2];
  const args = process.argv.slice(3);

  switch (command) {
    case 'check-mcp':
      await verifier.verifyMCPAvailability();
      break;

    case 'analyze':
      if (args[0]) {
        const content = await fs.readFile(args[0], 'utf-8');
        const analysis = await verifier.analyzeDataSource(content);
        console.log(JSON.stringify(analysis, null, 2));
      } else {
        console.error('Usage: analyze <file>');
      }
      break;

    case 'track':
      // Example: track "sfdc-agent" "SELECT Id FROM Lead" result.json
      if (args.length >= 3) {
        const result = JSON.parse(await fs.readFile(args[2], 'utf-8'));
        await verifier.trackQueryExecution(args[0], args[1], result);
      }
      break;

    case 'report':
      await verifier.generateReport();
      break;

    default:
      console.log('Subagent Query Verifier');
      console.log('\nCommands:');
      console.log('  check-mcp           - Verify MCP tool availability');
      console.log('  analyze <file>      - Analyze file for data source');
      console.log('  track <agent> <query> <result> - Track query execution');
      console.log('  report              - Generate verification report');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = SubagentQueryVerifier;
