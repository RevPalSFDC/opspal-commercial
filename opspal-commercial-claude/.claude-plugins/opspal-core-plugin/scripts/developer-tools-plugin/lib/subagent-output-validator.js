#!/usr/bin/env node

/**
 * Sub-Agent Output Validator CLI
 * Command-line interface for validating sub-agent outputs
 *
 * Part of: Sub-Agent Verification Layer Implementation
 * ROI: $8,000/year | Effort: 12 hours | Payback: 4 weeks
 */

const fs = require('fs');
const path = require('path');

// Import verification modules
const verifier = require('./subagent-verifier');
const enforcer = require('./json-output-enforcer');

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    agentName: null,
    outputFile: null,
    reportFile: null,
    strict: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--agent':
        config.agentName = args[++i];
        break;
      case '--output':
        config.outputFile = args[++i];
        break;
      case '--report':
        config.reportFile = args[++i];
        break;
      case '--strict':
        config.strict = true;
        break;
      case '--help':
      case '-h':
        config.help = true;
        break;
    }
  }

  return config;
}

/**
 * Print usage information
 */
function printUsage() {
  console.log('Sub-Agent Output Validator');
  console.log('');
  console.log('Usage: subagent-output-validator.js --agent <name> --output <file> [options]');
  console.log('');
  console.log('Options:');
  console.log('  --agent <name>     Agent name (required)');
  console.log('  --output <file>    Path to agent output file (required)');
  console.log('  --report <file>    Path to save verification report (optional)');
  console.log('  --strict           Enable strict mode (fail on warnings)');
  console.log('  --help, -h         Show this help message');
  console.log('');
  console.log('Examples:');
  console.log('  # Validate agent output');
  console.log('  node subagent-output-validator.js --agent sfdc-state-discovery \\');
  console.log('    --output ./output.json');
  console.log('');
  console.log('  # Validate with report');
  console.log('  node subagent-output-validator.js --agent sfdc-state-discovery \\');
  console.log('    --output ./output.json --report ./report.json');
  console.log('');
  console.log('  # Strict mode (fail on warnings)');
  console.log('  node subagent-output-validator.js --agent sfdc-state-discovery \\');
  console.log('    --output ./output.json --strict');
}

/**
 * Main validation function
 */
async function validateOutput(config) {
  const { agentName, outputFile, reportFile, strict } = config;

  // Read output file
  let rawOutput;
  try {
    rawOutput = fs.readFileSync(outputFile, 'utf-8');
  } catch (error) {
    console.error(`❌ Failed to read output file: ${error.message}`);
    process.exit(1);
  }

  // Step 1: Parse JSON output
  console.log('Step 1/3: Parsing JSON output...');
  const parseResult = enforcer.parseSubAgentOutput(rawOutput, {
    agentName,
    expectWrappedJSON: true,
    fallbackToExtraction: true,
    strict: false
  });

  if (!parseResult.success) {
    console.error('\n❌ Failed to parse output as JSON');
    console.error('Errors:', parseResult.errors.join(', '));

    if (reportFile) {
      const report = {
        timestamp: new Date().toISOString(),
        agentName,
        success: false,
        errors: parseResult.errors,
        rawOutput: parseResult.rawOutput
      };
      fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
      console.log(`\n📋 Report saved: ${reportFile}`);
    }

    process.exit(1);
  }

  console.log('   ✅ Successfully parsed JSON');
  console.log(`   Method: ${parseResult.method}`);

  // Step 2: Validate JSON compliance
  console.log('\nStep 2/3: Validating JSON compliance...');
  const complianceResult = enforcer.validateCompliance(parseResult.data);

  if (!complianceResult.compliant) {
    console.warn('   ⚠️  Compliance issues found:');
    complianceResult.issues.forEach(issue => {
      console.warn(`      - ${issue}`);
    });

    if (strict) {
      console.error('\n❌ Strict mode: Compliance issues treated as errors');

      if (reportFile) {
        const report = {
          timestamp: new Date().toISOString(),
          agentName,
          success: false,
          compliant: false,
          complianceIssues: complianceResult.issues,
          data: parseResult.data
        };
        fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
      }

      process.exit(1);
    }
  } else {
    console.log('   ✅ JSON is compliant');
  }

  // Step 3: Verify output for hallucinations
  console.log('\nStep 3/3: Verifying output for hallucinations...');

  const verificationResult = verifier.verifyOutput({
    agentName,
    output: parseResult.data,
    expectedSchema: null,  // Could be loaded from schema registry
    contextData: {},       // Could be loaded from execution context
    verificationRules: [], // Could be loaded from agent config
    options: {
      strictMode: strict,
      requireDataSourceLabel: true,
      skipQueryCheck: false
    }
  });

  if (!verificationResult.valid) {
    console.error('\n❌ Verification failed');
    console.error(`   Errors: ${verificationResult.errors.length}`);
    console.error(`   Warnings: ${verificationResult.warnings.length}`);

    if (reportFile) {
      verifier.createReport(verificationResult, reportFile);
    }

    if (strict) {
      process.exit(1);
    } else {
      console.warn('\n⚠️  Verification issues found but not blocking (non-strict mode)');
    }
  } else {
    console.log('   ✅ Verification passed');
    console.log(`   Confidence: ${Math.round(verificationResult.confidenceScore * 100)}%`);
  }

  // Generate final report
  if (reportFile) {
    const report = {
      timestamp: new Date().toISOString(),
      agentName,
      success: true,
      parsed: true,
      parseMethod: parseResult.method,
      compliant: complianceResult.compliant,
      complianceIssues: complianceResult.issues,
      verified: verificationResult.valid,
      confidenceScore: verificationResult.confidenceScore,
      errors: verificationResult.errors,
      warnings: verificationResult.warnings,
      summary: verificationResult.summary,
      data: parseResult.data
    };

    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.log(`\n📋 Verification report saved: ${reportFile}`);
  }

  // Summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Validation complete');
  console.log(`   Agent: ${agentName}`);
  console.log(`   Parsed: Yes (${parseResult.method})`);
  console.log(`   Compliant: ${complianceResult.compliant ? 'Yes' : 'No'}`);
  console.log(`   Verified: ${verificationResult.valid ? 'Yes' : 'No'}`);
  console.log(`   Confidence: ${Math.round(verificationResult.confidenceScore * 100)}%`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Exit with appropriate code
  const hasErrors = !parseResult.success || !verificationResult.valid;
  const hasIssues = !complianceResult.compliant || verificationResult.warnings.length > 0;

  if (hasErrors) {
    process.exit(1);
  } else if (strict && hasIssues) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

// Main execution
const config = parseArgs();

if (config.help) {
  printUsage();
  process.exit(0);
}

if (!config.agentName || !config.outputFile) {
  console.error('❌ Missing required arguments');
  console.error('');
  printUsage();
  process.exit(1);
}

validateOutput(config);
