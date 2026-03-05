/**
 * Iterative Refiner - Post-Generation Verification and Refinement
 *
 * Uses initial output as input for follow-up verification.
 * Removes claims that cannot be cited back to source data.
 *
 * Per Anthropic Guidelines: "Use Claude's output as input for a follow-up
 * verification prompt that checks each claim against the source."
 *
 * @module iterative-refiner
 * @version 1.0.0
 * @created 2025-12-26
 */

const ResponseSanityChecker = require('./response-sanity-checker');

/**
 * Iterative Refiner for post-generation verification
 */
class IterativeRefiner {
  constructor(options = {}) {
    this.sanityChecker = new ResponseSanityChecker();
    this.maxIterations = options.maxIterations || 3;
    this.removalThreshold = options.removalThreshold || 0; // Remove if confidence below this
    this.verbose = options.verbose || false;
  }

  /**
   * Refine a response by verifying claims against sources
   *
   * @param {string} initialResponse - The response to refine
   * @param {Object} sources - Query results and source data
   * @param {Object} options - Refinement options
   * @returns {Object} Refined response with verification details
   */
  async refine(initialResponse, sources = {}, options = {}) {
    const iterations = [];
    let currentResponse = initialResponse;
    let iteration = 0;

    while (iteration < this.maxIterations) {
      iteration++;

      if (this.verbose) {
        console.log(`[IterativeRefiner] Iteration ${iteration}/${this.maxIterations}`);
      }

      // Extract claims from current response
      const claims = this.sanityChecker.extractClaimsFromText(currentResponse);

      if (this.verbose) {
        console.log(`[IterativeRefiner] Found ${claims.length} claims to verify`);
      }

      // Verify each claim against sources
      const verificationResults = this.verifyClaims(claims, sources);

      // Determine what to keep, modify, or remove
      const refinementPlan = this.createRefinementPlan(verificationResults);

      iterations.push({
        iteration,
        claims_found: claims.length,
        verified: refinementPlan.keep.length,
        unverified: refinementPlan.remove.length,
        modified: refinementPlan.modify.length
      });

      // If nothing to refine, we're done
      if (refinementPlan.remove.length === 0 && refinementPlan.modify.length === 0) {
        if (this.verbose) {
          console.log(`[IterativeRefiner] No refinements needed - all claims verified`);
        }
        break;
      }

      // Apply refinements
      currentResponse = this.applyRefinements(currentResponse, refinementPlan);
    }

    // Final verification
    const finalClaims = this.sanityChecker.extractClaimsFromText(currentResponse);
    const finalVerification = this.verifyClaims(finalClaims, sources);

    return {
      original_response: initialResponse,
      refined_response: currentResponse,
      iterations: iterations.length,
      iteration_details: iterations,
      final_verification: {
        total_claims: finalClaims.length,
        verified_claims: finalVerification.filter(v => v.verified).length,
        unverified_claims: finalVerification.filter(v => !v.verified).length,
        coverage_percent: finalClaims.length > 0
          ? (finalVerification.filter(v => v.verified).length / finalClaims.length * 100).toFixed(1)
          : 100
      },
      claims_removed: this.getClaimsRemoved(initialResponse, currentResponse),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Verify claims against source data
   */
  verifyClaims(claims, sources) {
    const results = [];

    for (const claim of claims) {
      const verification = this.verifySingleClaim(claim, sources);
      results.push({
        claim: claim.text,
        type: claim.type,
        value: claim.value,
        verified: verification.verified,
        confidence: verification.confidence,
        source_id: verification.source_id,
        source_value: verification.source_value,
        match_type: verification.match_type,
        reason: verification.reason
      });
    }

    return results;
  }

  /**
   * Verify a single claim against sources
   */
  verifySingleClaim(claim, sources) {
    // Check if sources is a flat object with query results
    const queryResults = this.extractQueryResults(sources);

    // Try to find matching value in any query result
    for (const [queryId, records] of Object.entries(queryResults)) {
      const match = this.findMatchInRecords(claim, records);

      if (match.found) {
        return {
          verified: true,
          confidence: match.confidence,
          source_id: queryId,
          source_value: match.value,
          match_type: match.type,
          reason: `Found in ${queryId}`
        };
      }
    }

    // Check if it's a calculation that can be derived
    const derivedMatch = this.checkDerivedValue(claim, queryResults);
    if (derivedMatch.found) {
      return {
        verified: true,
        confidence: derivedMatch.confidence,
        source_id: derivedMatch.source_ids.join(', '),
        source_value: derivedMatch.calculation,
        match_type: 'derived',
        reason: derivedMatch.reason
      };
    }

    return {
      verified: false,
      confidence: 0,
      source_id: null,
      source_value: null,
      match_type: 'none',
      reason: 'No matching source data found'
    };
  }

  /**
   * Extract query results from various source formats
   */
  extractQueryResults(sources) {
    if (!sources) return {};

    // If sources has a query_results property
    if (sources.query_results) return sources.query_results;

    // If sources is already keyed by query ID
    if (typeof sources === 'object') {
      const results = {};
      for (const [key, value] of Object.entries(sources)) {
        if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
          results[key] = Array.isArray(value) ? value : [value];
        }
      }
      return results;
    }

    return {};
  }

  /**
   * Find matching value in query records
   */
  findMatchInRecords(claim, records) {
    if (!Array.isArray(records)) records = [records];

    const claimValue = claim.value;

    for (const record of records) {
      if (typeof record !== 'object' || record === null) continue;

      // Search all fields in the record
      for (const [field, value] of Object.entries(record)) {
        const match = this.compareValues(claimValue, value, claim.type);
        if (match.matches) {
          return {
            found: true,
            value: value,
            field: field,
            confidence: match.confidence,
            type: match.type
          };
        }
      }
    }

    return { found: false };
  }

  /**
   * Compare a claim value to a source value
   */
  compareValues(claimValue, sourceValue, claimType) {
    if (claimValue === null || claimValue === undefined) {
      return { matches: false };
    }

    const claimStr = String(claimValue).toLowerCase().trim();
    const sourceStr = String(sourceValue).toLowerCase().trim();

    // Exact match
    if (claimStr === sourceStr) {
      return { matches: true, confidence: 1.0, type: 'exact' };
    }

    // Numeric comparison with tolerance
    const claimNum = this.parseNumericValue(claimValue);
    const sourceNum = this.parseNumericValue(sourceValue);

    if (claimNum !== null && sourceNum !== null) {
      const tolerance = claimType === 'percentage' ? 0.5 : sourceNum * 0.01;
      if (Math.abs(claimNum - sourceNum) <= tolerance) {
        return { matches: true, confidence: 0.95, type: 'numeric_match' };
      }

      // Check for rounded values
      if (Math.round(claimNum) === Math.round(sourceNum)) {
        return { matches: true, confidence: 0.85, type: 'rounded_match' };
      }
    }

    // String containment (for names, descriptions)
    if (claimType === 'attribution' || claimType === 'general') {
      if (sourceStr.includes(claimStr) || claimStr.includes(sourceStr)) {
        return { matches: true, confidence: 0.7, type: 'contains' };
      }
    }

    return { matches: false };
  }

  /**
   * Parse a numeric value from various formats
   */
  parseNumericValue(value) {
    if (typeof value === 'number') return value;
    if (!value) return null;

    const str = String(value);

    // Handle currency
    let num = str.replace(/[$,]/g, '');

    // Handle K/M/B suffixes
    if (/k$/i.test(num)) {
      num = parseFloat(num) * 1000;
    } else if (/m$/i.test(num)) {
      num = parseFloat(num) * 1000000;
    } else if (/b$/i.test(num)) {
      num = parseFloat(num) * 1000000000;
    } else {
      num = parseFloat(num.replace(/%/g, ''));
    }

    return isNaN(num) ? null : num;
  }

  /**
   * Check if claim can be derived from source data
   */
  checkDerivedValue(claim, queryResults) {
    // Common derivation patterns
    const derivations = [
      // Percentage calculation (X / Y * 100)
      {
        pattern: /(\d+(?:\.\d+)?)\s*%/,
        check: (value, results) => this.checkPercentageDerivation(value, results)
      },
      // Sum calculation
      {
        pattern: /total|sum|combined/i,
        check: (value, results) => this.checkSumDerivation(claim.value, results)
      },
      // Average calculation
      {
        pattern: /average|avg|mean/i,
        check: (value, results) => this.checkAverageDerivation(claim.value, results)
      }
    ];

    for (const derivation of derivations) {
      if (derivation.pattern.test(claim.text)) {
        const result = derivation.check(claim.value, queryResults);
        if (result.found) return result;
      }
    }

    return { found: false };
  }

  /**
   * Check if percentage can be derived from ratio
   */
  checkPercentageDerivation(claimPercent, queryResults) {
    const targetPercent = this.parseNumericValue(claimPercent);
    if (targetPercent === null) return { found: false };

    // Look for count fields that could form a ratio
    const allValues = [];
    for (const [queryId, records] of Object.entries(queryResults)) {
      for (const record of records) {
        for (const [field, value] of Object.entries(record)) {
          const num = this.parseNumericValue(value);
          if (num !== null && num > 0) {
            allValues.push({ queryId, field, value: num });
          }
        }
      }
    }

    // Try all pairs to find matching ratio
    for (let i = 0; i < allValues.length; i++) {
      for (let j = 0; j < allValues.length; j++) {
        if (i === j) continue;

        const ratio = (allValues[i].value / allValues[j].value) * 100;
        if (Math.abs(ratio - targetPercent) < 0.5) {
          return {
            found: true,
            confidence: 0.9,
            source_ids: [allValues[i].queryId, allValues[j].queryId],
            calculation: `${allValues[i].value} / ${allValues[j].value} * 100 = ${ratio.toFixed(1)}%`,
            reason: `Derived from ${allValues[i].field} / ${allValues[j].field}`
          };
        }
      }
    }

    return { found: false };
  }

  /**
   * Check if sum can be derived
   */
  checkSumDerivation(claimValue, queryResults) {
    const targetSum = this.parseNumericValue(claimValue);
    if (targetSum === null) return { found: false };

    // Collect all numeric values
    const values = [];
    for (const [queryId, records] of Object.entries(queryResults)) {
      for (const record of records) {
        for (const [field, value] of Object.entries(record)) {
          const num = this.parseNumericValue(value);
          if (num !== null) {
            values.push({ queryId, field, value: num });
          }
        }
      }
    }

    // Check if any subset sums to target (simple check for small sets)
    if (values.length <= 10) {
      for (let mask = 1; mask < (1 << values.length); mask++) {
        let sum = 0;
        const usedValues = [];
        for (let i = 0; i < values.length; i++) {
          if (mask & (1 << i)) {
            sum += values[i].value;
            usedValues.push(values[i]);
          }
        }

        const tolerance = targetSum * 0.01;
        if (Math.abs(sum - targetSum) <= tolerance) {
          return {
            found: true,
            confidence: 0.85,
            source_ids: [...new Set(usedValues.map(v => v.queryId))],
            calculation: usedValues.map(v => v.value).join(' + ') + ` = ${sum}`,
            reason: 'Sum derivation'
          };
        }
      }
    }

    return { found: false };
  }

  /**
   * Check if average can be derived
   */
  checkAverageDerivation(claimValue, queryResults) {
    const targetAvg = this.parseNumericValue(claimValue);
    if (targetAvg === null) return { found: false };

    for (const [queryId, records] of Object.entries(queryResults)) {
      if (!Array.isArray(records) || records.length < 2) continue;

      // Try averaging each numeric field
      const fields = Object.keys(records[0] || {});
      for (const field of fields) {
        const values = records
          .map(r => this.parseNumericValue(r[field]))
          .filter(v => v !== null);

        if (values.length > 0) {
          const avg = values.reduce((a, b) => a + b, 0) / values.length;
          const tolerance = targetAvg * 0.02;

          if (Math.abs(avg - targetAvg) <= tolerance) {
            return {
              found: true,
              confidence: 0.85,
              source_ids: [queryId],
              calculation: `avg(${field}) = ${avg.toFixed(2)}`,
              reason: `Average of ${field} from ${values.length} records`
            };
          }
        }
      }
    }

    return { found: false };
  }

  /**
   * Create refinement plan based on verification results
   */
  createRefinementPlan(verificationResults) {
    const keep = [];
    const remove = [];
    const modify = [];

    for (const result of verificationResults) {
      if (result.verified && result.confidence >= 0.7) {
        keep.push(result);
      } else if (result.verified && result.confidence >= 0.5) {
        modify.push({
          ...result,
          action: 'add_caveat',
          caveat: 'Low confidence - verify against source'
        });
      } else {
        remove.push(result);
      }
    }

    return { keep, remove, modify };
  }

  /**
   * Apply refinements to response
   */
  applyRefinements(response, plan) {
    let refined = response;

    // Remove unverified claims
    for (const claim of plan.remove) {
      // Find the sentence containing the claim
      const sentences = refined.split(/(?<=[.!?])\s+/);
      const filteredSentences = sentences.filter(sentence => {
        // Keep sentence if it doesn't contain the claim value
        return !this.sentenceContainsClaim(sentence, claim);
      });

      // Add note about removed content if significant
      if (sentences.length !== filteredSentences.length) {
        refined = filteredSentences.join(' ');
      }
    }

    // Add caveats to low-confidence claims
    for (const claim of plan.modify) {
      if (claim.action === 'add_caveat') {
        const claimText = claim.claim;
        if (refined.includes(claimText)) {
          refined = refined.replace(
            claimText,
            `${claimText} [Note: ${claim.caveat}]`
          );
        }
      }
    }

    return refined;
  }

  /**
   * Check if a sentence contains a specific claim
   */
  sentenceContainsClaim(sentence, claim) {
    if (!claim.value) return false;

    const claimStr = String(claim.value).toLowerCase();
    const sentenceLower = sentence.toLowerCase();

    // Check for exact value match
    if (sentenceLower.includes(claimStr)) return true;

    // Check for numeric equivalents
    const claimNum = this.parseNumericValue(claim.value);
    if (claimNum !== null) {
      // Look for similar numbers in sentence
      const numbers = sentence.match(/[\d,]+(?:\.\d+)?%?/g) || [];
      for (const num of numbers) {
        const parsedNum = this.parseNumericValue(num);
        if (parsedNum !== null && Math.abs(parsedNum - claimNum) < claimNum * 0.1) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get list of claims that were removed during refinement
   */
  getClaimsRemoved(original, refined) {
    const originalClaims = this.sanityChecker.extractClaimsFromText(original);
    const refinedClaims = this.sanityChecker.extractClaimsFromText(refined);

    const refinedValues = new Set(refinedClaims.map(c => String(c.value).toLowerCase()));

    return originalClaims
      .filter(c => !refinedValues.has(String(c.value).toLowerCase()))
      .map(c => ({
        claim: c.text,
        type: c.type,
        value: c.value,
        reason: 'Could not verify against source data'
      }));
  }

  /**
   * Generate verification prompt for external use
   * This can be passed to Claude for follow-up verification
   */
  generateVerificationPrompt(response, sources) {
    const claims = this.sanityChecker.extractClaimsFromText(response);

    return `
## Claim Verification Task

Below is a response containing ${claims.length} factual claims. For each claim, verify whether it can be supported by the provided source data.

### Response to Verify:
${response}

### Extracted Claims:
${claims.map((c, i) => `${i + 1}. [${c.type}] "${c.text}" (value: ${c.value})`).join('\n')}

### Source Data:
${JSON.stringify(sources, null, 2)}

### Instructions:
For each claim above, respond with:
1. Claim number
2. VERIFIED or UNVERIFIED
3. If VERIFIED: Source ID and exact matching value
4. If UNVERIFIED: Reason why (no match found, value differs, etc.)

### Output Format:
\`\`\`json
{
  "verifications": [
    {
      "claim_number": 1,
      "status": "VERIFIED|UNVERIFIED",
      "source_id": "query_001 or null",
      "source_value": "exact value or null",
      "reason": "explanation"
    }
  ]
}
\`\`\`
`;
  }
}

/**
 * Convenience function for quick refinement
 */
async function refineResponse(response, sources, options = {}) {
  const refiner = new IterativeRefiner(options);
  return refiner.refine(response, sources, options);
}

// CLI support
if (require.main === module) {
  const fs = require('fs');
  const args = process.argv.slice(2);

  if (args[0] === '--help' || args.length === 0) {
    console.log(`
Iterative Refiner - Post-Generation Verification

Usage:
  iterative-refiner.js refine <response.txt> <sources.json>
  iterative-refiner.js verify-prompt <response.txt> <sources.json>
  iterative-refiner.js extract-claims <response.txt>

Options:
  --verbose               Show detailed output
  --max-iterations <n>    Maximum refinement iterations (default: 3)

Examples:
  # Refine a response against source data
  iterative-refiner.js refine assessment.txt query-results.json

  # Generate verification prompt for Claude
  iterative-refiner.js verify-prompt assessment.txt query-results.json

  # Extract claims from response
  iterative-refiner.js extract-claims assessment.txt

Part of P3 Hallucination Prevention - refines responses by removing uncited claims.
    `);
    process.exit(0);
  }

  const command = args[0];
  const verbose = args.includes('--verbose');
  const maxIterIdx = args.indexOf('--max-iterations');
  const maxIterations = maxIterIdx >= 0 ? parseInt(args[maxIterIdx + 1]) : 3;

  const refiner = new IterativeRefiner({ verbose, maxIterations });

  if (command === 'refine') {
    const responseFile = args[1];
    const sourcesFile = args[2];

    if (!responseFile || !sourcesFile) {
      console.error('Usage: iterative-refiner.js refine <response.txt> <sources.json>');
      process.exit(1);
    }

    const response = fs.readFileSync(responseFile, 'utf8');
    const sources = JSON.parse(fs.readFileSync(sourcesFile, 'utf8'));

    refiner.refine(response, sources).then(result => {
      console.log(JSON.stringify(result, null, 2));
    });
  }

  if (command === 'verify-prompt') {
    const responseFile = args[1];
    const sourcesFile = args[2];

    if (!responseFile || !sourcesFile) {
      console.error('Usage: iterative-refiner.js verify-prompt <response.txt> <sources.json>');
      process.exit(1);
    }

    const response = fs.readFileSync(responseFile, 'utf8');
    const sources = JSON.parse(fs.readFileSync(sourcesFile, 'utf8'));

    const prompt = refiner.generateVerificationPrompt(response, sources);
    console.log(prompt);
  }

  if (command === 'extract-claims') {
    const responseFile = args[1];

    if (!responseFile) {
      console.error('Usage: iterative-refiner.js extract-claims <response.txt>');
      process.exit(1);
    }

    const response = fs.readFileSync(responseFile, 'utf8');
    const claims = refiner.sanityChecker.extractClaimsFromText(response);

    console.log(JSON.stringify({ total_claims: claims.length, claims }, null, 2));
  }
}

module.exports = { IterativeRefiner, refineResponse };
