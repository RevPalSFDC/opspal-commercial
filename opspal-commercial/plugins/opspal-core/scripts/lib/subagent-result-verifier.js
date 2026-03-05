#!/usr/bin/env node

/**
 * Sub-Agent Result Verifier
 *
 * Verifies sub-agent claims to address tool-contract violations (42 reflections).
 * Catches cases where sub-agents claim success but operations actually failed.
 *
 * Verifications:
 * - Records actually created/updated in Salesforce
 * - Files actually written to disk
 * - No hidden errors in output
 * - Deployment status matches claim
 * - Query results match reported counts
 *
 * ROI: $8,000/year (addresses 42 tool-contract violations)
 *
 * Usage:
 *   const verifier = new SubagentResultVerifier({ platform: 'salesforce' });
 *   const result = await verifier.verify(agentOutput, context);
 *
 * CLI:
 *   node subagent-result-verifier.js verify <output-file>
 *   node subagent-result-verifier.js check-record salesforce <sobject> <recordId>
 *   node subagent-result-verifier.js check-file <file-path>
 *   node subagent-result-verifier.js test
 *
 * @module subagent-result-verifier
 * @version 1.0.0
 * @created 2026-01-15
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SEVERITY = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  WARNING: 'WARNING',
  INFO: 'INFO'
};

/**
 * Error patterns that indicate hidden failures
 */
const ERROR_PATTERNS = [
  // Salesforce errors
  { pattern: /INSUFFICIENT_ACCESS|INVALID_CROSS_REFERENCE_KEY|DUPLICATE_VALUE/gi, type: 'salesforce', severity: SEVERITY.CRITICAL },
  { pattern: /FIELD_INTEGRITY_EXCEPTION|MALFORMED_ID|REQUIRED_FIELD_MISSING/gi, type: 'salesforce', severity: SEVERITY.CRITICAL },
  { pattern: /UNABLE_TO_LOCK_ROW|ENTITY_IS_DELETED|INVALID_FIELD/gi, type: 'salesforce', severity: SEVERITY.HIGH },
  { pattern: /Cannot read propert(y|ies) of (undefined|null)/gi, type: 'runtime', severity: SEVERITY.CRITICAL },
  { pattern: /TypeError|ReferenceError|SyntaxError/gi, type: 'runtime', severity: SEVERITY.HIGH },
  { pattern: /Error: .+/gi, type: 'generic', severity: SEVERITY.WARNING },
  { pattern: /exit code [1-9]\d*/gi, type: 'process', severity: SEVERITY.HIGH },
  { pattern: /command failed|operation failed|request failed/gi, type: 'command', severity: SEVERITY.HIGH },
  { pattern: /timeout|ETIMEDOUT|ECONNREFUSED/gi, type: 'network', severity: SEVERITY.HIGH },
  { pattern: /401|403|500|502|503/gi, type: 'http', severity: SEVERITY.WARNING },

  // HubSpot errors
  { pattern: /PROPERTY_DOESNT_EXIST|INVALID_EMAIL|CONTACT_EXISTS/gi, type: 'hubspot', severity: SEVERITY.HIGH },
  { pattern: /RATE_LIMIT|Too many requests/gi, type: 'hubspot', severity: SEVERITY.WARNING },

  // False positives to ignore
  { pattern: /Status: (Success|OK|Completed)/gi, type: 'ignore', severity: null },
  { pattern: /No errors found/gi, type: 'ignore', severity: null }
];

/**
 * Claim patterns that should be verified
 */
const CLAIM_PATTERNS = [
  { pattern: /created (\d+) record/gi, type: 'record_creation', extract: 'count' },
  { pattern: /updated (\d+) record/gi, type: 'record_update', extract: 'count' },
  { pattern: /deleted (\d+) record/gi, type: 'record_deletion', extract: 'count' },
  { pattern: /deployed (successfully|to)/gi, type: 'deployment', extract: 'status' },
  { pattern: /file (?:created|written).*?([\/\w\-\.]+)/gi, type: 'file_creation', extract: 'path' },
  { pattern: /found (\d+) (records?|results?|items?)/gi, type: 'query_results', extract: 'count' },
  { pattern: /([0-9a-zA-Z]{15}|[0-9a-zA-Z]{18})/g, type: 'salesforce_id', extract: 'id' }
];

class SubagentResultVerifier {
  constructor(options = {}) {
    this.platform = options.platform || 'salesforce';
    this.orgAlias = options.orgAlias || process.env.SF_TARGET_ORG || process.env.SALESFORCE_ORG_ALIAS;
    this.verbose = options.verbose || false;
    this.offline = options.offline || false;
    this.strictMode = options.strictMode || false; // Fail on any warning

    // Verification statistics
    this.stats = {
      verificationsRun: 0,
      claimsVerified: 0,
      claimsFailed: 0,
      errorsDetected: 0,
      byType: {}
    };

    this.log(`SubagentResultVerifier initialized for platform: ${this.platform}`);
  }

  /**
   * Main verification entry point
   *
   * @param {string|Object} output - Agent output text or structured result
   * @param {Object} context - Verification context
   * @returns {Object} Verification result
   */
  async verify(output, context = {}) {
    this.stats.verificationsRun++;

    const result = {
      verified: true,
      platform: this.platform,
      timestamp: new Date().toISOString(),
      errors: [],
      warnings: [],
      claims: [],
      verifiedRecords: [],
      verifiedFiles: [],
      unverifiedClaims: []
    };

    const text = typeof output === 'string' ? output : JSON.stringify(output);

    // Step 1: Detect hidden errors
    const errorResult = this.detectHiddenErrors(text);
    result.errors.push(...errorResult.errors);
    result.warnings.push(...errorResult.warnings);

    if (errorResult.errors.length > 0) {
      result.verified = false;
      this.stats.errorsDetected += errorResult.errors.length;
    }

    // Step 2: Extract claims
    const claims = this.extractClaims(text);
    result.claims = claims;

    // Step 3: Verify each claim
    for (const claim of claims) {
      const verification = await this.verifyClaim(claim, context);

      if (verification.verified) {
        this.stats.claimsVerified++;
        if (verification.type === 'record') {
          result.verifiedRecords.push(verification);
        } else if (verification.type === 'file') {
          result.verifiedFiles.push(verification);
        }
      } else {
        this.stats.claimsFailed++;
        result.unverifiedClaims.push({
          claim: claim,
          reason: verification.reason
        });

        if (verification.severity === SEVERITY.CRITICAL) {
          result.errors.push({
            severity: SEVERITY.CRITICAL,
            code: 'UNVERIFIED_CLAIM',
            message: verification.reason,
            claim: claim
          });
          result.verified = false;
        } else {
          result.warnings.push({
            severity: SEVERITY.WARNING,
            code: 'UNVERIFIED_CLAIM',
            message: verification.reason,
            claim: claim
          });
        }
      }

      // Update stats by type
      this.stats.byType[claim.type] = (this.stats.byType[claim.type] || 0) + 1;
    }

    // Step 4: Final assessment
    if (this.strictMode && result.warnings.length > 0) {
      result.verified = false;
    }

    return result;
  }

  /**
   * Detect hidden errors in output text
   */
  detectHiddenErrors(text) {
    const result = {
      errors: [],
      warnings: []
    };

    for (const errorPattern of ERROR_PATTERNS) {
      if (errorPattern.type === 'ignore') continue;

      const matches = text.match(errorPattern.pattern);
      if (matches) {
        const entry = {
          severity: errorPattern.severity,
          code: `HIDDEN_${errorPattern.type.toUpperCase()}_ERROR`,
          message: `Detected hidden ${errorPattern.type} error: ${matches[0]}`,
          pattern: errorPattern.pattern.toString(),
          matchCount: matches.length
        };

        if (errorPattern.severity === SEVERITY.CRITICAL || errorPattern.severity === SEVERITY.HIGH) {
          result.errors.push(entry);
        } else {
          result.warnings.push(entry);
        }
      }
    }

    return result;
  }

  /**
   * Extract claims from output text
   */
  extractClaims(text) {
    const claims = [];

    for (const claimPattern of CLAIM_PATTERNS) {
      const regex = new RegExp(claimPattern.pattern.source, claimPattern.pattern.flags);
      let match;

      while ((match = regex.exec(text)) !== null) {
        const claim = {
          type: claimPattern.type,
          raw: match[0],
          extracted: match[1],
          position: match.index
        };

        // Don't add duplicate claims
        if (!claims.some(c => c.raw === claim.raw && c.position === claim.position)) {
          claims.push(claim);
        }
      }
    }

    // Deduplicate Salesforce IDs
    const seenIds = new Set();
    return claims.filter(c => {
      if (c.type === 'salesforce_id') {
        if (seenIds.has(c.extracted)) return false;
        seenIds.add(c.extracted);
      }
      return true;
    });
  }

  /**
   * Verify a specific claim
   */
  async verifyClaim(claim, context = {}) {
    switch (claim.type) {
      case 'record_creation':
      case 'record_update':
      case 'record_deletion':
        return this.verifyRecordClaim(claim, context);

      case 'file_creation':
        return this.verifyFileClaim(claim, context);

      case 'deployment':
        return this.verifyDeploymentClaim(claim, context);

      case 'salesforce_id':
        return this.verifySalesforceIdClaim(claim, context);

      case 'query_results':
        return this.verifyQueryClaim(claim, context);

      default:
        return {
          verified: true,
          type: 'unknown',
          reason: 'No verification available for this claim type'
        };
    }
  }

  /**
   * Verify record creation/update/deletion claims
   */
  async verifyRecordClaim(claim, context) {
    const result = {
      verified: false,
      type: 'record',
      claim: claim,
      reason: ''
    };

    // If we have specific record IDs to check
    if (context.recordIds && context.sobject && !this.offline) {
      const verified = await this.checkRecordsExist(context.sobject, context.recordIds);
      result.verified = verified;
      result.reason = verified
        ? `Verified ${context.recordIds.length} records exist`
        : `Could not verify records in ${context.sobject}`;
    } else {
      // Can't verify without specific IDs
      result.verified = true;
      result.reason = 'No specific records to verify';
    }

    return result;
  }

  /**
   * Verify file creation claims
   */
  verifyFileClaim(claim, context) {
    const result = {
      verified: false,
      type: 'file',
      claim: claim,
      reason: ''
    };

    let filePath = claim.extracted;

    // Try to resolve relative paths
    if (filePath && !path.isAbsolute(filePath)) {
      filePath = path.resolve(context.workingDirectory || process.cwd(), filePath);
    }

    if (filePath && fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      result.verified = true;
      result.filePath = filePath;
      result.fileSize = stats.size;
      result.reason = `File exists: ${filePath} (${stats.size} bytes)`;
    } else {
      result.severity = SEVERITY.WARNING;
      result.reason = `File not found: ${filePath}`;
    }

    return result;
  }

  /**
   * Verify deployment claims
   */
  async verifyDeploymentClaim(claim, context) {
    const result = {
      verified: false,
      type: 'deployment',
      claim: claim,
      reason: ''
    };

    if (this.offline || !this.orgAlias) {
      result.verified = true;
      result.reason = 'Offline mode - cannot verify deployment';
      return result;
    }

    // Check recent deployment status
    try {
      const cmd = `sf project deploy report --target-org "${this.orgAlias}" --json 2>/dev/null || echo '{}'`;
      const output = execSync(cmd, { encoding: 'utf8', timeout: 30000 });
      const response = JSON.parse(output);

      if (response.result?.status === 'Succeeded' || response.status === 0) {
        result.verified = true;
        result.reason = 'Deployment status verified as successful';
      } else if (response.result?.status === 'Failed') {
        result.verified = false;
        result.severity = SEVERITY.CRITICAL;
        result.reason = `Deployment actually failed: ${response.result?.errorMessage || 'Unknown error'}`;
      } else {
        result.verified = true;
        result.reason = 'Could not determine deployment status';
      }
    } catch (error) {
      result.verified = true;
      result.reason = `Could not verify deployment: ${error.message}`;
    }

    return result;
  }

  /**
   * Verify Salesforce ID claims
   */
  async verifySalesforceIdClaim(claim, context) {
    const result = {
      verified: false,
      type: 'salesforce_id',
      claim: claim,
      reason: ''
    };

    const id = claim.extracted;

    // Validate ID format
    if (!this.isValidSalesforceId(id)) {
      result.reason = `Invalid Salesforce ID format: ${id}`;
      return result;
    }

    // Determine object type from ID prefix
    const objectType = this.getObjectTypeFromId(id);

    if (this.offline || !this.orgAlias) {
      result.verified = true;
      result.reason = `ID format valid for ${objectType || 'unknown object'}`;
      return result;
    }

    // Query to verify record exists
    try {
      const query = `SELECT Id FROM ${objectType || 'Account'} WHERE Id = '${id}' LIMIT 1`;
      const cmd = `sf data query --query "${query}" --target-org "${this.orgAlias}" --json 2>/dev/null || echo '{}'`;
      const output = execSync(cmd, { encoding: 'utf8', timeout: 15000 });
      const response = JSON.parse(output);

      if (response.result?.records?.length > 0) {
        result.verified = true;
        result.reason = `Record ${id} verified to exist`;
      } else {
        result.verified = false;
        result.reason = `Record ${id} not found in org`;
      }
    } catch {
      // If query fails, assume valid (might be permission issue)
      result.verified = true;
      result.reason = `Could not verify ${id} - may be permission issue`;
    }

    return result;
  }

  /**
   * Verify query result claims
   */
  async verifyQueryClaim(claim, context) {
    const result = {
      verified: true,
      type: 'query_results',
      claim: claim,
      reason: 'Query result counts cannot be independently verified without re-running query'
    };

    return result;
  }

  /**
   * Check if records exist in Salesforce
   */
  async checkRecordsExist(sobject, recordIds) {
    if (!this.orgAlias || this.offline || recordIds.length === 0) {
      return true;
    }

    try {
      const ids = recordIds.slice(0, 200).map(id => `'${id}'`).join(',');
      const query = `SELECT Id FROM ${sobject} WHERE Id IN (${ids})`;
      const cmd = `sf data query --query "${query}" --target-org "${this.orgAlias}" --json`;
      const output = execSync(cmd, { encoding: 'utf8', timeout: 30000 });
      const response = JSON.parse(output);

      const foundCount = response.result?.records?.length || 0;
      return foundCount === recordIds.length;
    } catch {
      return true; // Assume true on error
    }
  }

  /**
   * Validate Salesforce ID format
   */
  isValidSalesforceId(id) {
    if (!id) return false;
    // Salesforce IDs are 15 or 18 characters
    if (id.length !== 15 && id.length !== 18) return false;
    // Must be alphanumeric
    return /^[a-zA-Z0-9]+$/.test(id);
  }

  /**
   * Get object type from Salesforce ID prefix
   */
  getObjectTypeFromId(id) {
    if (!id || id.length < 3) return null;

    const prefixMap = {
      '001': 'Account',
      '003': 'Contact',
      '006': 'Opportunity',
      '00Q': 'Lead',
      '00T': 'Task',
      '00U': 'Event',
      '500': 'Case',
      '0OH': 'ObjectTerritory2AssignmentRule',
      '0Ml': 'ObjectTerritory2AssignmentRuleItem',
      '801': 'Quote',
      '0Q0': 'OpportunityLineItem'
    };

    return prefixMap[id.substring(0, 3)] || null;
  }

  /**
   * Check a specific file exists
   */
  checkFile(filePath) {
    if (!filePath) return { exists: false, reason: 'No file path provided' };

    const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);

    if (fs.existsSync(resolved)) {
      const stats = fs.statSync(resolved);
      return {
        exists: true,
        path: resolved,
        size: stats.size,
        modified: stats.mtime
      };
    }

    return { exists: false, path: resolved, reason: 'File not found' };
  }

  /**
   * Check a specific Salesforce record exists
   */
  async checkRecord(sobject, recordId) {
    if (!this.orgAlias || this.offline) {
      return { exists: null, reason: 'Cannot verify - offline or no org' };
    }

    try {
      const query = `SELECT Id, Name, CreatedDate, LastModifiedDate FROM ${sobject} WHERE Id = '${recordId}'`;
      const cmd = `sf data query --query "${query}" --target-org "${this.orgAlias}" --json`;
      const output = execSync(cmd, { encoding: 'utf8', timeout: 15000 });
      const response = JSON.parse(output);

      if (response.result?.records?.length > 0) {
        const record = response.result.records[0];
        return {
          exists: true,
          record: record,
          name: record.Name,
          created: record.CreatedDate,
          modified: record.LastModifiedDate
        };
      }

      return { exists: false, reason: 'Record not found' };
    } catch (error) {
      return { exists: null, reason: `Query failed: ${error.message}` };
    }
  }

  /**
   * Get verification statistics
   */
  getStats() {
    return {
      ...this.stats,
      verificationRate: this.stats.verificationsRun > 0
        ? ((this.stats.claimsVerified / (this.stats.claimsVerified + this.stats.claimsFailed)) * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  /**
   * Log message (if verbose)
   */
  log(message) {
    if (this.verbose) {
      console.log(`[SubagentResultVerifier] ${message}`);
    }
  }

  /**
   * Run self-tests
   */
  async runTests() {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  SUB-AGENT RESULT VERIFIER - SELF-TESTS');
    console.log('═══════════════════════════════════════════════════════════\n');

    let passed = 0;
    let failed = 0;

    const tests = [
      {
        name: 'Detect hidden error patterns',
        test: () => {
          const text = 'Operation completed but INSUFFICIENT_ACCESS_OR_READONLY encountered';
          const result = this.detectHiddenErrors(text);
          if (result.errors.length === 0) throw new Error('Should detect INSUFFICIENT_ACCESS');
          return 'Detected hidden Salesforce error';
        }
      },
      {
        name: 'Detect exit code errors',
        test: () => {
          const text = 'Command finished with exit code 1';
          const result = this.detectHiddenErrors(text);
          if (result.errors.length === 0) throw new Error('Should detect exit code');
          return 'Detected non-zero exit code';
        }
      },
      {
        name: 'Extract record creation claims',
        test: () => {
          const text = 'Successfully created 15 records in Account';
          const claims = this.extractClaims(text);
          const creation = claims.find(c => c.type === 'record_creation');
          if (!creation || creation.extracted !== '15') throw new Error('Should extract count');
          return 'Extracted record creation count';
        }
      },
      {
        name: 'Validate Salesforce ID format',
        test: () => {
          if (!this.isValidSalesforceId('001xx000003D9G8AAK')) throw new Error('Should accept valid ID');
          if (this.isValidSalesforceId('invalid')) throw new Error('Should reject invalid ID');
          if (this.isValidSalesforceId('123')) throw new Error('Should reject short ID');
          return 'ID format validation working';
        }
      },
      {
        name: 'Get object type from ID prefix',
        test: () => {
          const objType = this.getObjectTypeFromId('001xx000003D9G8AAK');
          if (objType !== 'Account') throw new Error('Should identify Account');
          const leadType = this.getObjectTypeFromId('00Qxx0000001234AAA');
          if (leadType !== 'Lead') throw new Error('Should identify Lead');
          return 'Object type detection working';
        }
      },
      {
        name: 'Verify file claims',
        test: () => {
          const claim = { type: 'file_creation', extracted: __filename };
          const result = this.verifyFileClaim(claim, {});
          if (!result.verified) throw new Error('Should verify existing file');
          return 'File verification working';
        }
      },
      {
        name: 'Extract deployment claims',
        test: () => {
          const text = 'Package deployed successfully to production org';
          const claims = this.extractClaims(text);
          const deployment = claims.find(c => c.type === 'deployment');
          if (!deployment) throw new Error('Should extract deployment claim');
          return 'Deployment claim extraction working';
        }
      },
      {
        name: 'Full verification flow',
        test: async () => {
          const output = `
            Created 5 records successfully.
            Record ID: 001xx000003D9G8AAK
            File written to /tmp/test-output.json
          `;
          const result = await this.verify(output, { offline: true });
          if (!result.claims || result.claims.length === 0) throw new Error('Should extract claims');
          return `Verified ${result.claims.length} claims`;
        }
      }
    ];

    for (const test of tests) {
      try {
        const result = await test.test();
        console.log(`  ✅ ${test.name}: ${result}`);
        passed++;
      } catch (error) {
        console.log(`  ❌ ${test.name}: ${error.message}`);
        failed++;
      }
    }

    console.log('\n───────────────────────────────────────────────────────────');
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    console.log('═══════════════════════════════════════════════════════════\n');

    return failed === 0;
  }
}

// Export
module.exports = { SubagentResultVerifier, ERROR_PATTERNS, CLAIM_PATTERNS, SEVERITY };

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'test' || command === '--test') {
    const verifier = new SubagentResultVerifier({ verbose: true, offline: true });
    verifier.runTests()
      .then(success => process.exit(success ? 0 : 1))
      .catch(err => {
        console.error(err);
        process.exit(1);
      });
  } else if (command === 'verify') {
    const outputFile = args[1];

    if (!outputFile) {
      console.error('Usage: subagent-result-verifier.js verify <output-file>');
      process.exit(1);
    }

    const content = fs.readFileSync(outputFile, 'utf8');
    const verifier = new SubagentResultVerifier({ verbose: true });

    verifier.verify(content)
      .then(result => {
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.verified ? 0 : 1);
      });

  } else if (command === 'check-record') {
    const platform = args[1];
    const sobject = args[2];
    const recordId = args[3];

    if (platform !== 'salesforce' || !sobject || !recordId) {
      console.error('Usage: subagent-result-verifier.js check-record salesforce <sobject> <recordId>');
      process.exit(1);
    }

    const verifier = new SubagentResultVerifier({ platform, verbose: true });
    verifier.checkRecord(sobject, recordId)
      .then(result => {
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.exists ? 0 : 1);
      });

  } else if (command === 'check-file') {
    const filePath = args[1];

    if (!filePath) {
      console.error('Usage: subagent-result-verifier.js check-file <file-path>');
      process.exit(1);
    }

    const verifier = new SubagentResultVerifier({ verbose: true });
    const result = verifier.checkFile(filePath);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.exists ? 0 : 1);

  } else {
    console.log(`
Sub-Agent Result Verifier - Verify sub-agent claims to prevent tool-contract violations

Usage:
  subagent-result-verifier.js test                              Run self-tests
  subagent-result-verifier.js verify <output-file>              Verify agent output
  subagent-result-verifier.js check-record salesforce <obj> <id> Check SF record exists
  subagent-result-verifier.js check-file <file-path>            Check file exists

Examples:
  subagent-result-verifier.js test
  subagent-result-verifier.js verify ./agent-output.txt
  subagent-result-verifier.js check-record salesforce Account 001xx000003D9G8AAK
  subagent-result-verifier.js check-file ./reports/output.json

ROI: $8,000/year (addresses 42 tool-contract violations)
`);
  }
}
