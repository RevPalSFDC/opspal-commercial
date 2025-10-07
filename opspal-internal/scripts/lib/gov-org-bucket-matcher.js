#!/usr/bin/env node

/**
 * Government Organization Bucket Matcher
 *
 * Matches organizations to canonical government buckets using keywords, domain patterns,
 * and title analysis. Handles disambiguation and aliases.
 *
 * @module gov-org-bucket-matcher
 */

const fs = require('fs');
const path = require('path');

class GovOrgBucketMatcher {
  constructor() {
    // Load bucket definitions
    const bucketsPath = path.join(__dirname, '../../config/gov-org-buckets.json');
    this.buckets = JSON.parse(fs.readFileSync(bucketsPath, 'utf8'));

    // Load domain patterns
    const domainsPath = path.join(__dirname, '../../config/gov-domain-patterns.json');
    this.domainPatterns = JSON.parse(fs.readFileSync(domainsPath, 'utf8'));
  }

  /**
   * Match normalized data to a bucket
   * @param {Object} normalized - Normalized input data
   * @param {Object} input - Original input data
   * @returns {Object} Classification result
   */
  match(normalized, input) {
    // Quick match: high-confidence domains
    const quickMatch = this.tryQuickMatch(normalized, input);
    if (quickMatch && quickMatch.confidence >= 0.85) {
      return quickMatch;
    }

    // Score each bucket
    const scores = this.scoreBuckets(normalized, input);

    // Get best match
    const best = scores.reduce((max, curr) =>
      curr.score > max.score ? curr : max
    );

    // Build classification result
    return {
      bucket: best.bucket,
      confidence: best.score,
      rationale: this.buildRationale(best, normalized, input),
      notes: best.notes || '',
      scoringDetails: best.details
    };
  }

  /**
   * Try quick high-confidence matches
   */
  tryQuickMatch(normalized, input) {
    const domain = normalized.email_domain;
    if (!domain) return null;

    const quickRules = this.domainPatterns.quick_classification_rules.high_confidence_domains;

    // Check exact domain matches
    for (const [domainPattern, rule] of Object.entries(quickRules)) {
      if (domainPattern === domain || domain.endsWith(domainPattern)) {
        return {
          bucket: rule.bucket,
          confidence: rule.confidence,
          rationale: `High-confidence match based on email domain ${domain}. ${rule.notes || ''}`,
          notes: rule.notes || '',
          matchType: 'quick_domain'
        };
      }
    }

    // Check keyword + domain combinations
    const combos = this.domainPatterns.quick_classification_rules.keyword_domain_combinations;
    for (const combo of combos) {
      const titleLower = (input.title || '').toLowerCase();
      const domainMatch = domain.includes(combo.domain.replace(/\./g, ''));

      if (domainMatch && combo.title.some(kw => titleLower.includes(kw))) {
        return {
          bucket: combo.bucket,
          confidence: combo.confidence,
          rationale: `Domain pattern '${combo.domain}' and title keyword match`,
          notes: 'Quick classification based on domain + title',
          matchType: 'quick_combo'
        };
      }
    }

    return null;
  }

  /**
   * Score all buckets against the input
   */
  scoreBuckets(normalized, input) {
    const scores = [];

    for (const [bucketName, bucketDef] of Object.entries(this.buckets.buckets)) {
      const score = this.scoreBucket(bucketName, bucketDef, normalized, input);
      scores.push({
        bucket: bucketName,
        score: score.total,
        details: score,
        notes: score.notes
      });
    }

    return scores.sort((a, b) => b.score - a.score);
  }

  /**
   * Score a single bucket
   */
  scoreBucket(bucketName, bucketDef, normalized, input) {
    const score = {
      titleScore: 0,
      domainScore: 0,
      keywordScore: 0,
      organizationScore: 0,
      total: 0,
      notes: []
    };

    // Title scoring
    if (input.title && bucketDef.titlePatterns) {
      const titleLower = input.title.toLowerCase();
      for (const pattern of bucketDef.titlePatterns) {
        if (titleLower.includes(pattern.toLowerCase())) {
          score.titleScore += 0.3;
          score.notes.push(`Title contains: "${pattern}"`);
        }
      }
    }

    // Domain scoring
    if (normalized.email_domain && bucketDef.domainPatterns) {
      const domain = normalized.email_domain;
      for (const pattern of bucketDef.domainPatterns) {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(domain)) {
          score.domainScore += 0.25;
          score.notes.push(`Domain matches pattern: ${pattern}`);
        }
      }
    }

    // Keyword scoring (company name)
    if (input.company && bucketDef.keywords) {
      const companyLower = input.company.toLowerCase();
      for (const keyword of bucketDef.keywords) {
        if (companyLower.includes(keyword.toLowerCase())) {
          score.keywordScore += 0.2;
          score.notes.push(`Company contains: "${keyword}"`);
        }
      }
    }

    // Organization type scoring
    if (normalized.organization_type !== 'unknown') {
      const orgTypeBonus = this.getOrgTypeBonus(bucketName, normalized.organization_type);
      score.organizationScore = orgTypeBonus;
      if (orgTypeBonus > 0) {
        score.notes.push(`Org type "${normalized.organization_type}" matches bucket`);
      }
    }

    // Calculate total (capped at 1.0)
    score.total = Math.min(
      1.0,
      score.titleScore + score.domainScore + score.keywordScore + score.organizationScore
    );

    // Apply disambiguation penalties/bonuses
    score.total = this.applyDisambiguation(score.total, bucketName, normalized, input);

    return score;
  }

  /**
   * Get bonus score for matching organization type
   */
  getOrgTypeBonus(bucketName, orgType) {
    const mapping = {
      federal: ['FEMA', 'FEMA Regional Office', 'DHS Sub-Agency', 'Federal Protective Service', 'U.S. Marshals Service'],
      state: ['Highway Patrol', 'State Police', 'Bureau of Investigation / State Investigative Divisions',
              'State Attorney General\'s Office (AGO)', 'Department of Transportation (DOT)',
              'State Office of Emergency Management (State OEM)', 'Conservation Agencies',
              'Commercial Vehicle Enforcement'],
      county: ['County Sheriff', 'District Attorney', 'County Prosecutors', 'Commonwealth Attorney',
               'County Fire Department', 'County EMS'],
      city: ['Local Law Enforcement', 'Municipal Fire Department', 'City/County EM Office'],
      university: ['University Police'],
      hospital: ['Hospital EMS Divisions'],
      authority: ['Highway Authority', 'Ports Authority'],
      not_gov: ['Not Applicable']
    };

    for (const [type, buckets] of Object.entries(mapping)) {
      if (type === orgType && buckets.includes(bucketName)) {
        return 0.15;
      }
    }

    return 0;
  }

  /**
   * Apply disambiguation rules
   */
  applyDisambiguation(score, bucketName, normalized, input) {
    const rules = this.buckets.disambiguation_rules;

    // State Police vs Highway Patrol
    if ((bucketName === 'State Police' || bucketName === 'Highway Patrol') &&
        normalized.jurisdiction) {
      const state = this.extractState(normalized.jurisdiction);
      const stateRule = rules.state_police_vs_highway_patrol.examples[state];

      if (stateRule) {
        if (stateRule.includes('Highway Patrol') && bucketName === 'Highway Patrol') {
          score *= 1.2; // Boost Highway Patrol
        } else if (stateRule.includes('State Police') && bucketName === 'State Police') {
          score *= 1.2; // Boost State Police
        }
      }
    }

    // District Attorney variants
    if (['District Attorney', 'County Prosecutors', 'Commonwealth Attorney'].includes(bucketName)) {
      const state = this.extractState(normalized.jurisdiction);
      const daRule = rules.district_attorney_variants.by_state[state];

      if (daRule && daRule.includes('Commonwealth') && bucketName === 'Commonwealth Attorney') {
        score *= 1.3; // Strong boost for Commonwealth states
      } else if (daRule && daRule === 'County Prosecutor' && bucketName === 'County Prosecutors') {
        score *= 1.3;
      }
    }

    // FEMA vs FEMA Regional
    if (bucketName === 'FEMA Regional Office') {
      const hasRegion = (input.company || '').toLowerCase().includes('region') ||
                        (input.title || '').toLowerCase().includes('region');
      if (hasRegion) {
        score *= 1.4; // Strong boost if "Region" mentioned
      } else {
        score *= 0.5; // Penalize if no "Region"
      }
    } else if (bucketName === 'FEMA') {
      const hasRegion = (input.company || '').toLowerCase().includes('region');
      if (hasRegion) {
        score *= 0.6; // Penalize HQ if "Region" mentioned
      }
    }

    // Contractor detection
    if (bucketName === 'Not Applicable') {
      const signals = rules.contractor_detection.signals;
      const company = (input.company || '').toLowerCase();
      const domain = normalized.email_domain || '';

      let contractorSignals = 0;

      // Check company name
      if (/\b(llc|inc|consulting|solutions|services)\b/i.test(company)) {
        contractorSignals++;
      }

      // Check domain
      if (/\.(com|net|io|co)$/.test(domain)) {
        contractorSignals++;
      }

      // Check title
      if (/\b(consultant|contractor|vendor)\b/i.test(input.title || '')) {
        contractorSignals++;
      }

      // Boost "Not Applicable" if multiple contractor signals
      if (contractorSignals >= 2) {
        score *= 1.5;
      }
    }

    return Math.min(1.0, score);
  }

  /**
   * Extract state from jurisdiction string
   */
  extractState(jurisdiction) {
    if (!jurisdiction) return null;

    const stateMatch = jurisdiction.match(/\b([A-Z]{2})\b|California|Texas|New York|Florida|Pennsylvania|Virginia|Kentucky|Massachusetts/);
    return stateMatch ? stateMatch[0] : null;
  }

  /**
   * Build rationale text
   */
  buildRationale(bestMatch, normalized, input) {
    const parts = [];

    // Add match type
    if (bestMatch.matchType) {
      parts.push(`Quick ${bestMatch.matchType} classification.`);
    }

    // Add key signals
    const details = bestMatch.details || bestMatch;
    if (details.titleScore > 0) {
      parts.push(`Title matches bucket patterns.`);
    }
    if (details.domainScore > 0) {
      parts.push(`Email domain aligns with ${bestMatch.bucket}.`);
    }
    if (details.keywordScore > 0) {
      parts.push(`Company name contains relevant keywords.`);
    }
    if (details.organizationScore > 0) {
      parts.push(`Organization type (${normalized.organization_type}) matches.`);
    }

    // Add confidence note
    if (bestMatch.score >= 0.8) {
      parts.push('High confidence based on multiple confirming signals.');
    } else if (bestMatch.score >= 0.5) {
      parts.push('Medium confidence, recommend verification.');
    } else {
      parts.push('Low confidence, requires additional research.');
    }

    return parts.join(' ');
  }

  /**
   * Batch match multiple inputs
   */
  matchBatch(normalizedBatch) {
    return normalizedBatch.map(item => ({
      input: item.input,
      normalized: item.normalized,
      classification: this.match(item.normalized, item.input)
    }));
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: gov-org-bucket-matcher.js <normalized-input.json>');
    console.log('  or pipe JSON via stdin');
    console.log('\nExpects normalized input with fields:');
    console.log('  - organization_name, organization_type, jurisdiction, email_domain');
    process.exit(1);
  }

  const matcher = new GovOrgBucketMatcher();

  // Read from file or stdin
  const inputFile = args[0];
  let input;

  if (inputFile === '-' || !process.stdin.isTTY) {
    // Read from stdin
    const chunks = [];
    process.stdin.on('data', chunk => chunks.push(chunk));
    process.stdin.on('end', () => {
      input = JSON.parse(Buffer.concat(chunks).toString());
      processInput(input);
    });
  } else {
    // Read from file
    input = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
    processInput(input);
  }

  function processInput(input) {
    let result;

    if (Array.isArray(input)) {
      result = matcher.matchBatch(input);
    } else if (input.normalized && input.input) {
      // Single normalized input
      result = matcher.match(input.normalized, input.input);
    } else {
      console.error('Error: Input must be normalized data or batch of normalized data');
      process.exit(1);
    }

    console.log(JSON.stringify(result, null, 2));
  }
}

module.exports = GovOrgBucketMatcher;
