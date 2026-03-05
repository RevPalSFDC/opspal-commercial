/**
 * Best-of-N Verifier - Multi-Run Consistency Verification
 *
 * Runs critical assessments/prompts multiple times and compares outputs
 * to detect inconsistencies and hallucinations.
 *
 * Per Anthropic Guidelines: "Run the same prompt multiple times and compare
 * outputs. Consistent claims across runs are more likely accurate."
 *
 * @module best-of-n-verifier
 * @version 1.0.0
 * @created 2025-12-26
 */

const ResponseSanityChecker = require('./response-sanity-checker');

/**
 * Best-of-N Verifier for multi-run consistency checking
 */
class BestOfNVerifier {
  constructor(options = {}) {
    this.n = options.n || 3; // Default to 3 runs
    this.consistencyThreshold = options.consistencyThreshold || 0.8; // 80% agreement
    this.sanityChecker = new ResponseSanityChecker();
    this.verbose = options.verbose || false;
  }

  /**
   * Run verification with multiple executions
   *
   * @param {Function} promptExecutor - Async function that executes the prompt and returns response
   * @param {Object} sources - Source data for claim verification
   * @param {number} n - Number of runs (overrides constructor default)
   * @returns {Object} Verification result with consistency analysis
   */
  async verify(promptExecutor, sources = {}, n = this.n) {
    const responses = [];
    const errors = [];

    if (this.verbose) {
      console.log(`[BestOfN] Starting ${n} verification runs...`);
    }

    // Execute prompt n times
    for (let i = 0; i < n; i++) {
      try {
        if (this.verbose) {
          console.log(`[BestOfN] Run ${i + 1}/${n}...`);
        }
        const response = await promptExecutor();
        responses.push({
          run: i + 1,
          response,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        errors.push({
          run: i + 1,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }

    if (responses.length < 2) {
      return {
        valid: false,
        reason: 'Insufficient successful runs for comparison',
        responses: responses.length,
        errors,
        recommendation: 'retry_with_more_runs'
      };
    }

    // Extract claims from each response
    const claimsPerRun = responses.map(r => ({
      run: r.run,
      claims: this.sanityChecker.extractClaimsFromText(r.response)
    }));

    // Compare claims across runs
    const consistencyAnalysis = this.analyzeConsistency(claimsPerRun, sources);

    return {
      valid: consistencyAnalysis.overallConsistency >= this.consistencyThreshold,
      runs_completed: responses.length,
      runs_failed: errors.length,
      overall_consistency: consistencyAnalysis.overallConsistency,
      threshold: this.consistencyThreshold,
      consistent_claims: consistencyAnalysis.consistentClaims,
      inconsistent_claims: consistencyAnalysis.inconsistentClaims,
      unique_to_single_run: consistencyAnalysis.uniqueClaims,
      recommendation: this.generateRecommendation(consistencyAnalysis),
      errors,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Analyze consistency across multiple runs
   */
  analyzeConsistency(claimsPerRun, sources) {
    const allClaims = new Map(); // claim_key -> { values: [], runs: [] }

    // Collect all claims across runs
    for (const { run, claims } of claimsPerRun) {
      for (const claim of claims) {
        const key = this.normalizeClaimKey(claim);

        if (!allClaims.has(key)) {
          allClaims.set(key, {
            type: claim.type,
            text: claim.text,
            values: [],
            runs: []
          });
        }

        const entry = allClaims.get(key);
        entry.values.push(claim.value);
        entry.runs.push(run);
      }
    }

    const totalRuns = claimsPerRun.length;
    const consistentClaims = [];
    const inconsistentClaims = [];
    const uniqueClaims = [];

    // Analyze each claim
    for (const [key, claimData] of allClaims) {
      const appearanceRate = claimData.runs.length / totalRuns;
      const valueConsistency = this.calculateValueConsistency(claimData.values);

      if (claimData.runs.length === 1) {
        // Only appeared in one run
        uniqueClaims.push({
          claim: claimData.text,
          type: claimData.type,
          appeared_in_run: claimData.runs[0],
          concern: 'May be hallucination - not reproducible'
        });
      } else if (valueConsistency >= this.consistencyThreshold) {
        // Consistent across runs
        consistentClaims.push({
          claim: claimData.text,
          type: claimData.type,
          appeared_in_runs: claimData.runs,
          values: claimData.values,
          consistency: valueConsistency,
          most_common_value: this.getMostCommonValue(claimData.values)
        });
      } else {
        // Inconsistent values across runs
        inconsistentClaims.push({
          claim: claimData.text,
          type: claimData.type,
          appeared_in_runs: claimData.runs,
          values: claimData.values,
          consistency: valueConsistency,
          concern: 'Values vary significantly across runs'
        });
      }
    }

    // Calculate overall consistency
    const totalClaims = allClaims.size;
    const consistentCount = consistentClaims.length;
    const overallConsistency = totalClaims > 0 ? consistentCount / totalClaims : 1;

    return {
      overallConsistency,
      totalClaims,
      consistentClaims,
      inconsistentClaims,
      uniqueClaims
    };
  }

  /**
   * Normalize a claim to a comparable key
   * Strips out numeric values so claims about the same metric are grouped together
   * e.g., "win rate 34%" and "win rate 28%" should have the same key
   */
  normalizeClaimKey(claim) {
    // Create a normalized key based on claim type and context (WITHOUT the numeric value)
    // This allows grouping "win rate 34%" with "win rate 28%" for comparison
    const baseText = claim.text
      .toLowerCase()
      .replace(/[\$,%]/g, '')                              // Remove currency/percent symbols
      .replace(/\d+(?:\.\d+)?(?:[kmb])?/gi, '')            // Remove numeric values
      .replace(/\b(thousand|million|billion)\b/gi, '')     // Remove number words
      .replace(/\s+/g, ' ')                                // Normalize whitespace
      .trim();

    return `${claim.type}:${baseText.substring(0, 50)}`;
  }

  /**
   * Calculate value consistency across runs
   */
  calculateValueConsistency(values) {
    if (values.length <= 1) return 1;

    // Normalize values for comparison
    const normalizedValues = values.map(v => this.normalizeValue(v));

    // Count how many match the most common value
    const valueCounts = {};
    for (const v of normalizedValues) {
      valueCounts[v] = (valueCounts[v] || 0) + 1;
    }

    const maxCount = Math.max(...Object.values(valueCounts));
    return maxCount / values.length;
  }

  /**
   * Normalize a value for comparison
   */
  normalizeValue(value) {
    if (value === null || value === undefined) return 'null';

    const str = String(value);

    // Handle percentages
    if (str.includes('%')) {
      const num = parseFloat(str);
      if (!isNaN(num)) return num.toFixed(1) + '%';
    }

    // Handle currency
    if (str.includes('$')) {
      const num = parseFloat(str.replace(/[$,KMB]/gi, ''));
      if (!isNaN(num)) {
        if (str.toLowerCase().includes('k')) return (num * 1000).toFixed(0);
        if (str.toLowerCase().includes('m')) return (num * 1000000).toFixed(0);
        if (str.toLowerCase().includes('b')) return (num * 1000000000).toFixed(0);
        return num.toFixed(0);
      }
    }

    // Handle plain numbers
    const num = parseFloat(str.replace(/,/g, ''));
    if (!isNaN(num)) return num.toFixed(2);

    return str.toLowerCase().trim();
  }

  /**
   * Get the most common value from a list
   */
  getMostCommonValue(values) {
    const counts = {};
    for (const v of values) {
      const normalized = this.normalizeValue(v);
      counts[normalized] = (counts[normalized] || 0) + 1;
    }

    let maxCount = 0;
    let mostCommon = values[0];
    for (const [v, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        mostCommon = values.find(val => this.normalizeValue(val) === v);
      }
    }

    return mostCommon;
  }

  /**
   * Generate recommendation based on consistency analysis
   */
  generateRecommendation(analysis) {
    const { overallConsistency, inconsistentClaims, uniqueClaims } = analysis;

    if (overallConsistency >= 0.95) {
      return {
        action: 'accept',
        reason: 'High consistency across runs - claims are reproducible'
      };
    }

    if (overallConsistency >= this.consistencyThreshold) {
      return {
        action: 'accept_with_review',
        reason: 'Acceptable consistency - review flagged claims',
        review_items: [
          ...inconsistentClaims.map(c => c.claim),
          ...uniqueClaims.map(c => c.claim)
        ]
      };
    }

    if (overallConsistency >= 0.5) {
      return {
        action: 'partial_accept',
        reason: 'Moderate consistency - only accept consistent claims',
        accept: analysis.consistentClaims.map(c => c.claim),
        reject: [
          ...inconsistentClaims.map(c => c.claim),
          ...uniqueClaims.map(c => c.claim)
        ]
      };
    }

    return {
      action: 'reject',
      reason: 'Low consistency - too many claims vary across runs',
      recommendation: 'Re-run with more specific constraints or different data'
    };
  }

  /**
   * Quick consistency check for a specific claim across multiple responses
   */
  checkClaimConsistency(claim, responses) {
    const claimType = this.identifyClaimType(claim);
    const occurrences = [];

    for (let i = 0; i < responses.length; i++) {
      const extracted = this.sanityChecker.extractClaimsFromText(responses[i]);
      const matching = extracted.find(e =>
        e.type === claimType &&
        this.normalizeClaimKey(e) === this.normalizeClaimKey({ type: claimType, text: claim })
      );

      if (matching) {
        occurrences.push({
          run: i + 1,
          value: matching.value
        });
      }
    }

    const consistency = this.calculateValueConsistency(occurrences.map(o => o.value));

    return {
      claim,
      found_in: occurrences.length,
      total_runs: responses.length,
      consistency,
      values: occurrences,
      verdict: occurrences.length === responses.length && consistency >= this.consistencyThreshold
        ? 'consistent'
        : occurrences.length === 0
          ? 'not_found'
          : 'inconsistent'
    };
  }

  /**
   * Identify claim type from text
   */
  identifyClaimType(claim) {
    if (/\$[\d,]+/.test(claim)) return 'currency';
    if (/\d+(?:\.\d+)?%/.test(claim)) return 'percentage';
    if (/\d+\s+(record|opportunit|lead|account|contact|deal)/i.test(claim)) return 'count';
    return 'general';
  }
}

/**
 * Convenience function for quick verification
 */
async function verifyWithBestOfN(promptExecutor, options = {}) {
  const verifier = new BestOfNVerifier(options);
  return verifier.verify(promptExecutor, options.sources || {}, options.n);
}

// CLI support
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args[0] === '--help' || args.length === 0) {
    console.log(`
Best-of-N Verifier - Multi-Run Consistency Verification

Usage:
  best-of-n-verifier.js compare <response1.txt> <response2.txt> [response3.txt...]
  best-of-n-verifier.js check-claim "<claim>" <response1.txt> <response2.txt> ...

Options:
  --threshold <0.0-1.0>   Consistency threshold (default: 0.8)
  --verbose               Show detailed output

Examples:
  # Compare 3 assessment runs
  best-of-n-verifier.js compare run1.txt run2.txt run3.txt

  # Check specific claim consistency
  best-of-n-verifier.js check-claim "win rate is 34%" run1.txt run2.txt run3.txt

Part of P3 Hallucination Prevention - detects inconsistent claims across runs.
    `);
    process.exit(0);
  }

  const fs = require('fs');
  const command = args[0];

  if (command === 'compare') {
    const files = args.slice(1).filter(a => !a.startsWith('--'));
    const verbose = args.includes('--verbose');
    const thresholdIdx = args.indexOf('--threshold');
    const threshold = thresholdIdx >= 0 ? parseFloat(args[thresholdIdx + 1]) : 0.8;

    const verifier = new BestOfNVerifier({ consistencyThreshold: threshold, verbose });

    // Load responses from files
    const responses = files.map(f => fs.readFileSync(f, 'utf8'));
    const claimsPerRun = responses.map((r, i) => ({
      run: i + 1,
      claims: verifier.sanityChecker.extractClaimsFromText(r)
    }));

    const analysis = verifier.analyzeConsistency(claimsPerRun, {});

    console.log(JSON.stringify({
      files_compared: files.length,
      overall_consistency: analysis.overallConsistency.toFixed(2),
      threshold,
      verdict: analysis.overallConsistency >= threshold ? 'PASS' : 'FAIL',
      consistent_claims: analysis.consistentClaims.length,
      inconsistent_claims: analysis.inconsistentClaims.length,
      unique_claims: analysis.uniqueClaims.length,
      recommendation: verifier.generateRecommendation(analysis),
      details: verbose ? analysis : undefined
    }, null, 2));
  }

  if (command === 'check-claim') {
    const claim = args[1];
    const files = args.slice(2).filter(a => !a.startsWith('--'));

    const verifier = new BestOfNVerifier();
    const responses = files.map(f => fs.readFileSync(f, 'utf8'));

    const result = verifier.checkClaimConsistency(claim, responses);
    console.log(JSON.stringify(result, null, 2));
  }
}

module.exports = { BestOfNVerifier, verifyWithBestOfN };
