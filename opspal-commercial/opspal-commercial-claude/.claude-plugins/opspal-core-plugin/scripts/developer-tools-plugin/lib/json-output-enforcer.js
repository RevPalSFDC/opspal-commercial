/**
 * JSON Output Enforcer
 * Ensures sub-agents return structured JSON output
 *
 * Part of: Sub-Agent Verification Layer Implementation
 * ROI: $8,000/year | Effort: 12 hours | Payback: 4 weeks
 */

class JSONOutputEnforcer {
  /**
   * Parse and validate sub-agent text output as JSON
   * @param {string} rawOutput - Raw text output from sub-agent
   * @param {Object} options - Parsing options
   * @returns {Object} {success: boolean, data: Object, errors: string[]}
   */
  parseSubAgentOutput(rawOutput, options = {}) {
    const {
      agentName = 'unknown',
      expectWrappedJSON = true,
      fallbackToExtraction = true,
      strict = false
    } = options;

    console.log(`\n🔧 Parsing Sub-Agent Output: ${agentName}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const errors = [];

    // Attempt 1: Direct JSON parse
    console.log('Attempt 1: Direct JSON parse...');
    try {
      const data = JSON.parse(rawOutput);
      console.log('   ✅ Successfully parsed as direct JSON');
      return { success: true, data, errors, method: 'direct' };
    } catch (e) {
      console.log('   ⏭️  Not direct JSON, trying wrapped format...');
    }

    // Attempt 2: Extract from markdown code block
    if (expectWrappedJSON) {
      console.log('\nAttempt 2: Extract from markdown code block...');
      const extracted = this.extractJSONFromMarkdown(rawOutput);
      if (extracted) {
        try {
          const data = JSON.parse(extracted);
          console.log('   ✅ Successfully extracted and parsed JSON from code block');
          return { success: true, data, errors, method: 'markdown' };
        } catch (e) {
          errors.push(`Extracted JSON is invalid: ${e.message}`);
          console.log(`   ❌ Extracted but parse failed: ${e.message}`);
        }
      } else {
        console.log('   ⏭️  No JSON code block found');
      }
    }

    // Attempt 3: Extract any JSON object from text
    if (fallbackToExtraction) {
      console.log('\nAttempt 3: Extract any JSON from text...');
      const extracted = this.extractJSONFromText(rawOutput);
      if (extracted) {
        try {
          const data = JSON.parse(extracted);
          console.log('   ✅ Successfully extracted JSON from text');
          return { success: true, data, errors, method: 'extraction' };
        } catch (e) {
          errors.push(`Extracted JSON is invalid: ${e.message}`);
          console.log(`   ❌ Extraction failed: ${e.message}`);
        }
      } else {
        console.log('   ❌ No JSON found in text');
      }
    }

    // Attempt 4: Parse as line-delimited JSON
    console.log('\nAttempt 4: Try line-delimited JSON...');
    const lineJSON = this.parseLineDelimitedJSON(rawOutput);
    if (lineJSON) {
      console.log('   ✅ Parsed as line-delimited JSON');
      return { success: true, data: lineJSON, errors, method: 'line-delimited' };
    } else {
      console.log('   ❌ Not line-delimited JSON');
    }

    // All attempts failed
    errors.push('Unable to parse output as JSON');
    errors.push('Sub-agent must return valid JSON in response');

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ All JSON parsing attempts failed\n');

    if (strict) {
      throw new Error(`Sub-agent ${agentName} did not return valid JSON: ${errors.join('; ')}`);
    }

    return {
      success: false,
      data: null,
      errors,
      rawOutput: rawOutput.substring(0, 500) + (rawOutput.length > 500 ? '...' : '')
    };
  }

  /**
   * Extract JSON from markdown code block
   */
  extractJSONFromMarkdown(text) {
    // Match ```json ... ``` or ``` ... ``` with JSON content
    const patterns = [
      /```json\s*\n([\s\S]*?)\n```/,
      /```\s*\n(\{[\s\S]*?\})\s*\n```/,
      /```\s*\n(\[[\s\S]*?\])\s*\n```/
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return null;
  }

  /**
   * Extract any JSON object or array from text
   */
  extractJSONFromText(text) {
    // Find first occurrence of { ... } or [ ... ]
    // This is a simple heuristic - matches balanced braces/brackets

    let start = -1;
    let depth = 0;
    let char = null;

    // Find first { or [
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '{' || text[i] === '[') {
        start = i;
        char = text[i];
        depth = 1;
        break;
      }
    }

    if (start === -1) return null;

    const closeChar = char === '{' ? '}' : ']';

    // Find matching close brace/bracket
    for (let i = start + 1; i < text.length; i++) {
      if (text[i] === char) {
        depth++;
      } else if (text[i] === closeChar) {
        depth--;
        if (depth === 0) {
          return text.substring(start, i + 1);
        }
      }
    }

    return null;
  }

  /**
   * Parse line-delimited JSON (JSONL)
   */
  parseLineDelimitedJSON(text) {
    const lines = text.split('\n').filter(l => l.trim());

    if (lines.length === 0) return null;

    const parsed = [];

    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        parsed.push(obj);
      } catch (e) {
        // Not valid JSONL
        return null;
      }
    }

    return parsed.length === 1 ? parsed[0] : parsed;
  }

  /**
   * Enforce JSON output format in sub-agent prompt
   * @param {string} basePrompt - Base agent prompt
   * @param {Object} schema - Expected JSON schema
   * @returns {string} Enhanced prompt with JSON enforcement
   */
  enforceJSONInPrompt(basePrompt, schema = null) {
    const enforcement = `

## MANDATORY: Structured JSON Output

**CRITICAL**: You MUST return your response as valid JSON. No exceptions.

**Format Requirements:**
1. Wrap your JSON response in a markdown code block with \`\`\`json
2. Ensure all JSON is valid (no trailing commas, proper quotes)
3. Include ALL required fields
4. Do NOT include explanatory text outside the JSON block

${schema ? `**Expected Schema:**
\`\`\`json
${JSON.stringify(schema, null, 2)}
\`\`\`
` : ''}

**Example Format:**
\`\`\`json
{
  "field1": "value",
  "field2": 123,
  "data_source": "VERIFIED",
  "query_executed": "SELECT * FROM ..."
}
\`\`\`

**Data Source Labels (MANDATORY):**
Include a \`data_source\` field with one of:
- \`"VERIFIED"\` - Data from actual query execution
- \`"SIMULATED"\` - Example/mock data (include \`simulated_warning\`)
- \`"FAILED"\` - Query failed (include \`failure_reason\`)
- \`"UNKNOWN"\` - Source cannot be determined

**If you cannot execute a query**, return:
\`\`\`json
{
  "data_source": "FAILED",
  "failure_reason": "Could not connect to database",
  "attempted_query": "SELECT ...",
  "suggestion": "Run query manually via: sf data query ..."
}
\`\`\`

**DO NOT** generate fake data. If data is unavailable, mark it as SIMULATED or FAILED.
`;

    return basePrompt + enforcement;
  }

  /**
   * Validate sub-agent JSON compliance
   * @param {Object} output - Parsed JSON output
   * @returns {Object} {compliant: boolean, issues: string[]}
   */
  validateCompliance(output) {
    const issues = [];

    // Check for data_source label
    if (!output.data_source) {
      issues.push('Missing required data_source field (VERIFIED, SIMULATED, FAILED, or UNKNOWN)');
    } else {
      const validSources = ['VERIFIED', 'SIMULATED', 'FAILED', 'UNKNOWN'];
      if (!validSources.includes(output.data_source)) {
        issues.push(`Invalid data_source: ${output.data_source}. Must be one of: ${validSources.join(', ')}`);
      }

      // Check for required supporting fields
      if (output.data_source === 'SIMULATED' && !output.simulated_warning) {
        issues.push('SIMULATED data_source requires simulated_warning field');
      }

      if (output.data_source === 'FAILED' && !output.failure_reason) {
        issues.push('FAILED data_source requires failure_reason field');
      }

      if (output.data_source === 'VERIFIED' && !output.query_executed) {
        issues.push('VERIFIED data_source should include query_executed for traceability');
      }
    }

    return {
      compliant: issues.length === 0,
      issues
    };
  }

  /**
   * Create compliance report
   */
  generateComplianceReport(results) {
    const totalAgents = results.length;
    const compliantAgents = results.filter(r => r.compliant).length;
    const complianceRate = totalAgents > 0 ? (compliantAgents / totalAgents) * 100 : 0;

    const report = {
      timestamp: new Date().toISOString(),
      totalAgents,
      compliantAgents,
      complianceRate: Math.round(complianceRate),
      nonCompliantAgents: results.filter(r => !r.compliant),
      summary: {
        jsonParseable: results.filter(r => r.success).length,
        hasDataSourceLabel: results.filter(r => r.data?.data_source).length,
        verified: results.filter(r => r.data?.data_source === 'VERIFIED').length,
        simulated: results.filter(r => r.data?.data_source === 'SIMULATED').length,
        failed: results.filter(r => r.data?.data_source === 'FAILED').length
      }
    };

    console.log('\n📊 Sub-Agent JSON Compliance Report');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  Total Agents: ${totalAgents}`);
    console.log(`  Compliant: ${compliantAgents} (${report.complianceRate}%)`);
    console.log(`  JSON Parseable: ${report.summary.jsonParseable}`);
    console.log(`  With Data Source Labels: ${report.summary.hasDataSourceLabel}`);
    console.log('');
    console.log('  Data Sources:');
    console.log(`    VERIFIED: ${report.summary.verified}`);
    console.log(`    SIMULATED: ${report.summary.simulated}`);
    console.log(`    FAILED: ${report.summary.failed}`);

    if (report.nonCompliantAgents.length > 0) {
      console.log('\n  ❌ Non-Compliant Agents:');
      report.nonCompliantAgents.forEach(agent => {
        console.log(`    - ${agent.agentName}: ${agent.issues.join(', ')}`);
      });
    }

    return report;
  }

  /**
   * Wrap sub-agent execution with JSON enforcement
   */
  async wrapExecution(agentExecution, config) {
    const {
      agentName,
      expectedSchema = null,
      verifyOutput = true,
      saveReport = false,
      reportPath = null
    } = config;

    console.log(`\n▶️  Executing sub-agent: ${agentName}`);

    let rawOutput;
    try {
      rawOutput = await agentExecution();
    } catch (error) {
      console.error(`❌ Sub-agent execution failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
        agentName
      };
    }

    // Parse JSON output
    const parseResult = this.parseSubAgentOutput(rawOutput, {
      agentName,
      expectWrappedJSON: true,
      fallbackToExtraction: true,
      strict: false
    });

    if (!parseResult.success) {
      console.error('❌ Failed to parse sub-agent output as JSON');
      return {
        success: false,
        error: 'Output is not valid JSON',
        errors: parseResult.errors,
        agentName,
        rawOutput: parseResult.rawOutput
      };
    }

    // Validate compliance
    const complianceResult = this.validateCompliance(parseResult.data);
    if (!complianceResult.compliant) {
      console.warn('⚠️  Sub-agent output is not fully compliant');
      console.warn('   Issues:', complianceResult.issues.join(', '));
    }

    // Optional verification
    let verificationResult = null;
    if (verifyOutput) {
      const verifier = require('./subagent-verifier');
      verificationResult = verifier.verifyOutput({
        agentName,
        output: parseResult.data,
        expectedSchema,
        options: { strictMode: false }
      });

      if (!verificationResult.valid) {
        console.warn('⚠️  Sub-agent output verification found issues');
      }
    }

    // Save report if requested
    if (saveReport && reportPath) {
      const report = {
        agentName,
        timestamp: new Date().toISOString(),
        parsed: parseResult.success,
        compliant: complianceResult.compliant,
        verified: verificationResult?.valid,
        data: parseResult.data,
        errors: parseResult.errors,
        complianceIssues: complianceResult.issues,
        verificationSummary: verificationResult?.summary
      };

      const fs = require('fs');
      const path = require('path');
      const dir = path.dirname(reportPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      console.log(`\n📋 Execution report saved: ${reportPath}`);
    }

    return {
      success: true,
      data: parseResult.data,
      method: parseResult.method,
      compliant: complianceResult.compliant,
      complianceIssues: complianceResult.issues,
      verified: verificationResult?.valid,
      verificationSummary: verificationResult?.summary,
      agentName
    };
  }
}

module.exports = new JSONOutputEnforcer();
