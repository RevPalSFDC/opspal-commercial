/**
 * Sub-Agent Verification Layer
 * Validates sub-agent outputs to prevent hallucinations and ensure data quality
 *
 * Part of: Sub-Agent Verification Layer Implementation
 * ROI: $8,000/year | Effort: 12 hours | Payback: 4 weeks
 */

class SubAgentVerifier {
  /**
   * Verify sub-agent output for hallucinations and data quality
   * @param {Object} config - Verification configuration
   * @returns {Object} {valid: boolean, errors: string[], warnings: string[], verified: Object}
   */
  verifyOutput(config) {
    const {
      agentName,
      output,
      expectedSchema,
      contextData = {},
      verificationRules = [],
      options = {}
    } = config;

    const errors = [];
    const warnings = [];
    let verified = output;

    console.log(`\n🔍 Verifying Sub-Agent Output: ${agentName}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Step 1: Validate JSON structure
    console.log('Step 1/5: Validating JSON structure...');
    const structureResult = this.validateJSONStructure(output, expectedSchema);
    if (!structureResult.valid) {
      errors.push(...structureResult.errors);
      console.error(`   ❌ ${structureResult.errors.length} structure errors`);
    } else {
      console.log('   ✅ JSON structure valid');
    }

    // Step 2: Detect fake data patterns
    console.log('\nStep 2/5: Detecting fake data patterns...');
    const fakeDataResult = this.detectFakeData(output, options);
    if (fakeDataResult.detected) {
      if (options.strictMode) {
        errors.push(...fakeDataResult.issues);
        console.error(`   ❌ ${fakeDataResult.issues.length} fake data patterns detected`);
      } else {
        warnings.push(...fakeDataResult.issues);
        console.warn(`   ⚠️  ${fakeDataResult.issues.length} suspicious patterns found`);
      }
    } else {
      console.log('   ✅ No fake data patterns detected');
    }

    // Step 3: Verify data sources
    console.log('\nStep 3/5: Verifying data sources...');
    const sourceResult = this.verifyDataSources(output, contextData, options);
    if (!sourceResult.verified) {
      errors.push(...sourceResult.errors);
      warnings.push(...sourceResult.warnings);
      console.error(`   ❌ ${sourceResult.errors.length} data source errors`);
      if (sourceResult.warnings.length > 0) {
        console.warn(`   ⚠️  ${sourceResult.warnings.length} data source warnings`);
      }
    } else {
      console.log('   ✅ Data sources verified');
    }

    // Step 4: Apply custom verification rules
    if (verificationRules.length > 0) {
      console.log(`\nStep 4/5: Applying ${verificationRules.length} custom verification rules...`);
      const rulesResult = this.applyVerificationRules(output, verificationRules, contextData);
      errors.push(...rulesResult.errors);
      warnings.push(...rulesResult.warnings);

      if (rulesResult.errors.length > 0) {
        console.error(`   ❌ ${rulesResult.errors.length} rule violations`);
      } else {
        console.log('   ✅ All custom rules passed');
      }
    } else {
      console.log('\nStep 4/5: No custom verification rules');
    }

    // Step 5: Calculate confidence score
    console.log('\nStep 5/5: Calculating confidence score...');
    const confidenceScore = this.calculateConfidenceScore({
      structureValid: structureResult.valid,
      fakeDataDetected: fakeDataResult.detected,
      sourcesVerified: sourceResult.verified,
      rulesPassed: verificationRules.length === 0 || errors.length === 0,
      warningCount: warnings.length
    });
    console.log(`   Confidence: ${Math.round(confidenceScore * 100)}%`);

    const valid = errors.length === 0;

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    if (valid) {
      console.log('✅ Sub-agent output verification passed\n');
    } else {
      console.error('❌ Sub-agent output verification failed\n');
    }

    return {
      valid,
      errors,
      warnings,
      verified,
      agentName,
      confidenceScore,
      summary: {
        structureValid: structureResult.valid,
        fakeDataDetected: fakeDataResult.detected,
        sourcesVerified: sourceResult.verified,
        errorCount: errors.length,
        warningCount: warnings.length
      }
    };
  }

  /**
   * Validate JSON structure against expected schema
   */
  validateJSONStructure(output, expectedSchema) {
    const errors = [];

    if (!expectedSchema) {
      return { valid: true, errors: [] };
    }

    // Check for required fields
    if (expectedSchema.required) {
      expectedSchema.required.forEach(field => {
        if (!(field in output)) {
          errors.push(`Missing required field: ${field}`);
        }
      });
    }

    // Check field types
    if (expectedSchema.properties) {
      Object.keys(expectedSchema.properties).forEach(field => {
        if (field in output) {
          const expected = expectedSchema.properties[field].type;
          const actual = Array.isArray(output[field]) ? 'array' : typeof output[field];

          if (expected !== actual && output[field] !== null) {
            errors.push(`Field '${field}' should be ${expected}, got ${actual}`);
          }
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Detect fake/synthetic data patterns
   */
  detectFakeData(output, options = {}) {
    const issues = [];
    const suspicious = [];

    // Pattern 1: Generic names
    const genericNamePatterns = [
      /Lead \d+/, /Contact \d+/, /Account \d+/, /Company \d+/,
      /User \d+/, /Customer \d+/, /Opportunity \d+/,
      /Example Corp/i, /Test Company/i, /Sample Inc/i,
      /John Doe/i, /Jane Smith/i, /John Smith/i
    ];

    // Pattern 2: Round percentages (15%, 30%, 45%, etc.)
    const roundPercentagePattern = /(\d+)%/g;

    // Pattern 3: Fake Salesforce IDs (all zeros or sequential)
    const fakeSalesforceIdPattern = /^(00[0Q]){1}0+\d+$/;

    // Pattern 4: Example domains
    const exampleDomainPattern = /@(example|test|sample|demo)\.(com|org|net)/i;

    // Recursive check function
    const checkValue = (value, path = 'root') => {
      if (typeof value === 'string') {
        // Check generic names
        genericNamePatterns.forEach(pattern => {
          if (pattern.test(value)) {
            issues.push(`Suspicious generic name at ${path}: "${value}"`);
          }
        });

        // Check round percentages
        const percentMatches = value.matchAll(roundPercentagePattern);
        for (const match of percentMatches) {
          const num = parseInt(match[1]);
          if (num % 15 === 0 && num > 0) {
            suspicious.push(`Round percentage at ${path}: ${match[0]}`);
          }
        }

        // Check fake Salesforce IDs
        if (fakeSalesforceIdPattern.test(value)) {
          issues.push(`Suspicious Salesforce ID at ${path}: "${value}"`);
        }

        // Check example domains
        if (exampleDomainPattern.test(value)) {
          issues.push(`Example domain at ${path}: "${value}"`);
        }

      } else if (Array.isArray(value)) {
        value.forEach((item, idx) => {
          checkValue(item, `${path}[${idx}]`);
        });
      } else if (value !== null && typeof value === 'object') {
        Object.entries(value).forEach(([key, val]) => {
          checkValue(val, `${path}.${key}`);
        });
      }
    };

    checkValue(output);

    // Suspicious patterns are warnings, not errors
    if (suspicious.length > 0 && !options.ignoreWarnings) {
      suspicious.forEach(s => {
        issues.push(`Warning: ${s}`);
      });
    }

    return {
      detected: issues.length > 0,
      issues,
      summary: {
        genericNames: issues.filter(i => i.includes('generic name')).length,
        roundPercentages: suspicious.length,
        fakeIds: issues.filter(i => i.includes('Salesforce ID')).length,
        exampleDomains: issues.filter(i => i.includes('Example domain')).length
      }
    };
  }

  /**
   * Verify data sources with context
   */
  verifyDataSources(output, contextData, options = {}) {
    const errors = [];
    const warnings = [];

    // Check for data_source labels
    if (output.data_source) {
      const validSources = ['VERIFIED', 'SIMULATED', 'FAILED', 'UNKNOWN'];

      if (!validSources.includes(output.data_source)) {
        errors.push(`Invalid data_source: ${output.data_source}. Must be one of: ${validSources.join(', ')}`);
      }

      // SIMULATED data requires explicit labeling
      if (output.data_source === 'SIMULATED' && !output.simulated_warning) {
        warnings.push('SIMULATED data should include simulated_warning field');
      }

      // FAILED data should explain why
      if (output.data_source === 'FAILED' && !output.failure_reason) {
        errors.push('FAILED data_source must include failure_reason');
      }

      // VERIFIED data should have query evidence
      if (output.data_source === 'VERIFIED' && !output.query_executed && !options.skipQueryCheck) {
        warnings.push('VERIFIED data should include query_executed field for traceability');
      }
    } else if (options.requireDataSourceLabel) {
      errors.push('Missing required data_source label (VERIFIED, SIMULATED, FAILED, or UNKNOWN)');
    }

    // Cross-reference with context data
    if (contextData.expectedRecordCount && output.records) {
      const actualCount = Array.isArray(output.records) ? output.records.length : 0;
      if (actualCount === 0 && contextData.expectedRecordCount > 0) {
        warnings.push(`Expected ${contextData.expectedRecordCount} records but got ${actualCount}`);
      }
    }

    // Check for query execution evidence
    if (output.query_executed && contextData.availableObjects) {
      const queriedObject = this.extractObjectFromQuery(output.query_executed);
      if (queriedObject && !contextData.availableObjects.includes(queriedObject)) {
        errors.push(`Query references unavailable object: ${queriedObject}`);
      }
    }

    return {
      verified: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Extract object name from SOQL/SQL query
   */
  extractObjectFromQuery(query) {
    const fromMatch = query.match(/FROM\s+(\w+)/i);
    return fromMatch ? fromMatch[1] : null;
  }

  /**
   * Apply custom verification rules
   */
  applyVerificationRules(output, rules, contextData) {
    const errors = [];
    const warnings = [];

    rules.forEach((rule, idx) => {
      try {
        const result = rule.validator(output, contextData);

        if (result === false) {
          errors.push(rule.errorMessage || `Rule ${idx + 1} failed`);
        } else if (result && result.warning) {
          warnings.push(result.warning);
        }
      } catch (error) {
        errors.push(`Rule ${idx + 1} threw error: ${error.message}`);
      }
    });

    return { errors, warnings };
  }

  /**
   * Calculate confidence score (0.0 - 1.0)
   */
  calculateConfidenceScore(metrics) {
    let score = 1.0;

    // Structure validity (30%)
    if (!metrics.structureValid) {
      score -= 0.3;
    }

    // Fake data detection (40%)
    if (metrics.fakeDataDetected) {
      score -= 0.4;
    }

    // Source verification (20%)
    if (!metrics.sourcesVerified) {
      score -= 0.2;
    }

    // Custom rules (10%)
    if (!metrics.rulesPassed) {
      score -= 0.1;
    }

    // Warnings penalty (minor)
    score -= (metrics.warningCount * 0.02);

    return Math.max(0, score);
  }

  /**
   * Log verification result
   */
  logVerification(result) {
    console.log('\n📊 Verification Summary:');
    console.log(`  Agent: ${result.agentName}`);
    console.log(`  Valid: ${result.valid ? '✅ Yes' : '❌ No'}`);
    console.log(`  Confidence: ${Math.round(result.confidenceScore * 100)}%`);
    console.log(`  Errors: ${result.errorCount || result.errors.length}`);
    console.log(`  Warnings: ${result.warningCount || result.warnings.length}`);

    if (result.errors && result.errors.length > 0) {
      console.log('\n❌ Errors:');
      result.errors.forEach(err => console.log(`  - ${err}`));
    }

    if (result.warnings && result.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      result.warnings.forEach(warn => console.log(`  - ${warn}`));
    }

    if (result.summary) {
      console.log('\n📈 Details:');
      console.log(`  Structure Valid: ${result.summary.structureValid ? '✅' : '❌'}`);
      console.log(`  Fake Data: ${result.summary.fakeDataDetected ? '❌ Detected' : '✅ None'}`);
      console.log(`  Sources Verified: ${result.summary.sourcesVerified ? '✅' : '❌'}`);
    }
  }

  /**
   * Create verification report
   */
  createReport(result, outputPath) {
    const fs = require('fs');
    const path = require('path');

    const report = {
      timestamp: new Date().toISOString(),
      agentName: result.agentName,
      valid: result.valid,
      confidenceScore: result.confidenceScore,
      errors: result.errors,
      warnings: result.warnings,
      summary: result.summary,
      verified: result.verified
    };

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`\n📋 Verification report saved: ${outputPath}`);

    return report;
  }
}

module.exports = new SubAgentVerifier();
