#!/usr/bin/env node

/**
 * Government Organization Evidence Validator
 *
 * Validates URLs, checks source credibility, and ensures evidence quality
 * for government organization classifications.
 *
 * @module gov-org-evidence-validator
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

class GovOrgEvidenceValidator {
  constructor(options = {}) {
    this.timeout = options.timeout || 10000; // 10 second timeout
    this.userAgent = options.userAgent || 'GovOrgClassifier/1.0';
    this.maxRedirects = options.maxRedirects || 3;
  }

  /**
   * Validate a single evidence URL
   * @param {Object} evidence - Evidence object with url and why_relevant
   * @returns {Promise<Object>} Validation result
   */
  async validateEvidence(evidence) {
    if (!evidence.url || !evidence.why_relevant) {
      return {
        valid: false,
        error: 'Missing required fields (url or why_relevant)',
        credibilityScore: 0
      };
    }

    // Check URL format
    let parsedUrl;
    try {
      parsedUrl = new URL(evidence.url);
    } catch (e) {
      return {
        valid: false,
        error: 'Invalid URL format',
        credibilityScore: 0
      };
    }

    // Check URL accessibility (with timeout)
    const accessibilityCheck = await this.checkUrlAccessibility(evidence.url);

    // Calculate credibility score
    const credibilityScore = this.calculateCredibilityScore(parsedUrl, evidence);

    return {
      valid: accessibilityCheck.accessible,
      accessible: accessibilityCheck.accessible,
      statusCode: accessibilityCheck.statusCode,
      error: accessibilityCheck.error,
      credibilityScore,
      sourceType: this.classifySourceType(parsedUrl),
      ...evidence
    };
  }

  /**
   * Check if URL is accessible
   */
  checkUrlAccessibility(url) {
    return new Promise((resolve) => {
      const parsedUrl = new URL(url);
      const protocol = parsedUrl.protocol === 'https:' ? https : http;

      const options = {
        method: 'HEAD',
        timeout: this.timeout,
        headers: {
          'User-Agent': this.userAgent
        }
      };

      const req = protocol.request(url, options, (res) => {
        // Handle redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (this.redirectCount >= this.maxRedirects) {
            resolve({
              accessible: false,
              statusCode: res.statusCode,
              error: 'Too many redirects'
            });
            return;
          }

          this.redirectCount++;
          const redirectUrl = new URL(res.headers.location, url);
          this.checkUrlAccessibility(redirectUrl.href).then(resolve);
          return;
        }

        // Success if 2xx or 3xx status
        const accessible = res.statusCode >= 200 && res.statusCode < 400;

        resolve({
          accessible,
          statusCode: res.statusCode,
          error: accessible ? null : `HTTP ${res.statusCode}`
        });
      });

      req.on('error', (err) => {
        resolve({
          accessible: false,
          statusCode: null,
          error: err.message
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          accessible: false,
          statusCode: null,
          error: 'Request timeout'
        });
      });

      req.end();
    });
  }

  /**
   * Calculate credibility score for a source
   * @param {URL} parsedUrl - Parsed URL object
   * @param {Object} evidence - Evidence object
   * @returns {number} Score between 0 and 1
   */
  calculateCredibilityScore(parsedUrl, evidence) {
    let score = 0.5; // Base score

    // Domain-based scoring (highest priority)
    const hostname = parsedUrl.hostname.toLowerCase();

    // .gov domains (highest credibility)
    if (hostname.endsWith('.gov')) {
      score += 0.4;

      // Federal .gov gets extra boost
      if (!hostname.includes('.state.') && !hostname.includes('.county.') &&
          !hostname.includes('.city.')) {
        score += 0.05;
      }
    }

    // .us domains (high credibility)
    if (hostname.endsWith('.us')) {
      score += 0.35;
    }

    // .edu domains (high credibility for university classifications)
    if (hostname.endsWith('.edu')) {
      score += 0.3;
    }

    // State government sites
    if (hostname.match(/\.state\.[a-z]{2}\.(us|gov)$/)) {
      score += 0.35;
    }

    // County government sites
    if (hostname.match(/\.(county|co)\.[a-z]+\.(us|gov)$/)) {
      score += 0.35;
    }

    // City government sites
    if (hostname.match(/\.(city|ci)\.[a-z]+\.(us|gov)$/)) {
      score += 0.35;
    }

    // LinkedIn (moderate credibility, needs corroboration)
    if (hostname.includes('linkedin.com')) {
      score += 0.1; // Lower score, requires additional sources
    }

    // Reputable news sources
    const newsOutlets = [
      'nytimes.com', 'washingtonpost.com', 'reuters.com', 'apnews.com',
      'npr.org', 'bbc.com', 'cnn.com', 'foxnews.com', 'nbcnews.com',
      'cbsnews.com', 'abcnews.go.com', 'wsj.com', 'usatoday.com'
    ];
    if (newsOutlets.some(outlet => hostname.includes(outlet))) {
      score += 0.2;
    }

    // Press release services
    if (hostname.includes('prnewswire.com') || hostname.includes('businesswire.com')) {
      score += 0.15;
    }

    // Wikipedia (low-moderate credibility, good for quick checks)
    if (hostname.includes('wikipedia.org')) {
      score += 0.1;
    }

    // Content relevance boost
    const relevance = evidence.why_relevant.toLowerCase();
    if (relevance.includes('official') || relevance.includes('roster') ||
        relevance.includes('directory') || relevance.includes('staff list')) {
      score += 0.05;
    }

    // Cap at 1.0
    return Math.min(1.0, score);
  }

  /**
   * Classify source type
   */
  classifySourceType(parsedUrl) {
    const hostname = parsedUrl.hostname.toLowerCase();

    if (hostname.endsWith('.gov')) return 'government_official';
    if (hostname.endsWith('.us')) return 'government_official';
    if (hostname.endsWith('.edu')) return 'educational';
    if (hostname.includes('linkedin.com')) return 'professional_network';
    if (hostname.includes('wikipedia')) return 'encyclopedia';

    const newsOutlets = [
      'nytimes.com', 'washingtonpost.com', 'reuters.com', 'apnews.com',
      'npr.org', 'bbc.com', 'cnn.com', 'foxnews.com', 'nbcnews.com'
    ];
    if (newsOutlets.some(outlet => hostname.includes(outlet))) {
      return 'news_media';
    }

    if (hostname.includes('prnewswire.com') || hostname.includes('businesswire.com')) {
      return 'press_release';
    }

    return 'other';
  }

  /**
   * Validate evidence list meets quality standards
   * @param {Array} evidenceList - List of evidence objects
   * @returns {Object} Validation summary
   */
  async validateEvidenceList(evidenceList) {
    if (!evidenceList || !Array.isArray(evidenceList)) {
      return {
        valid: false,
        error: 'Evidence must be an array'
      };
    }

    // Check minimum count
    if (evidenceList.length < 2) {
      return {
        valid: false,
        error: 'Minimum 2 evidence sources required',
        count: evidenceList.length
      };
    }

    // Check maximum count
    if (evidenceList.length > 5) {
      return {
        valid: false,
        error: 'Maximum 5 evidence sources allowed',
        count: evidenceList.length
      };
    }

    // Validate each evidence
    const validations = await Promise.all(
      evidenceList.map(evidence => this.validateEvidence(evidence))
    );

    // Calculate aggregate scores
    const accessibleCount = validations.filter(v => v.accessible).length;
    const avgCredibility = validations.reduce((sum, v) => sum + v.credibilityScore, 0) / validations.length;

    // Check for diversity of sources
    const sourceTypes = new Set(validations.map(v => v.sourceType));
    const hasDiversity = sourceTypes.size >= 2;

    // Check for high-credibility sources
    const hasHighCredSource = validations.some(v => v.credibilityScore >= 0.8);

    // Determine overall validity
    const valid = accessibleCount >= 2 && avgCredibility >= 0.5 && hasHighCredSource;

    return {
      valid,
      count: evidenceList.length,
      accessibleCount,
      avgCredibility: Math.round(avgCredibility * 100) / 100,
      hasDiversity,
      hasHighCredSource,
      validations,
      recommendations: this.generateRecommendations(validations, {
        accessibleCount,
        avgCredibility,
        hasDiversity,
        hasHighCredSource
      })
    };
  }

  /**
   * Generate recommendations for improving evidence quality
   */
  generateRecommendations(validations, summary) {
    const recommendations = [];

    if (summary.accessibleCount < 2) {
      recommendations.push('Add more accessible sources (need at least 2)');
    }

    if (summary.avgCredibility < 0.5) {
      recommendations.push('Include more authoritative sources (.gov, .edu, .us domains)');
    }

    if (!summary.hasDiversity) {
      recommendations.push('Add diversity: use multiple source types (official sites, news, LinkedIn)');
    }

    if (!summary.hasHighCredSource) {
      recommendations.push('Include at least one high-credibility source (government/educational)');
    }

    // Check for too many LinkedIn-only sources
    const linkedinCount = validations.filter(v => v.sourceType === 'professional_network').length;
    if (linkedinCount >= validations.length / 2) {
      recommendations.push('Reduce reliance on LinkedIn; add official government sources');
    }

    // Check for inaccessible URLs
    const inaccessible = validations.filter(v => !v.accessible);
    if (inaccessible.length > 0) {
      recommendations.push(`Fix ${inaccessible.length} inaccessible URL(s)`);
    }

    return recommendations;
  }

  /**
   * Check if evidence list is sufficient for confidence level
   */
  isSufficientForConfidence(evidenceSummary, targetConfidence) {
    if (targetConfidence >= 0.8) {
      // High confidence requires strong evidence
      return (
        evidenceSummary.valid &&
        evidenceSummary.count >= 3 &&
        evidenceSummary.avgCredibility >= 0.7 &&
        evidenceSummary.hasHighCredSource &&
        evidenceSummary.hasDiversity
      );
    } else if (targetConfidence >= 0.5) {
      // Medium confidence requires moderate evidence
      return (
        evidenceSummary.valid &&
        evidenceSummary.count >= 2 &&
        evidenceSummary.avgCredibility >= 0.5
      );
    } else {
      // Low confidence accepts minimal evidence
      return evidenceSummary.count >= 1;
    }
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: gov-org-evidence-validator.js <evidence.json>');
    console.log('  or pipe JSON via stdin');
    console.log('\nExpects array of evidence objects with fields:');
    console.log('  - url (string)');
    console.log('  - why_relevant (string)');
    process.exit(1);
  }

  const validator = new GovOrgEvidenceValidator();

  // Read from file or stdin
  const inputFile = args[0];

  if (inputFile === '-' || !process.stdin.isTTY) {
    // Read from stdin
    const chunks = [];
    process.stdin.on('data', chunk => chunks.push(chunk));
    process.stdin.on('end', async () => {
      const input = JSON.parse(Buffer.concat(chunks).toString());
      await processInput(input);
    });
  } else {
    // Read from file
    const fs = require('fs');
    const input = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
    processInput(input);
  }

  async function processInput(input) {
    let result;

    if (Array.isArray(input)) {
      result = await validator.validateEvidenceList(input);
    } else {
      result = await validator.validateEvidence(input);
    }

    console.log(JSON.stringify(result, null, 2));
  }
}

module.exports = GovOrgEvidenceValidator;
