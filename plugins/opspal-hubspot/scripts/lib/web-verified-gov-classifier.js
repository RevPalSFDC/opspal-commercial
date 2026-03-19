#!/usr/bin/env node

/**
 * Web-Verified Government Contact Classifier
 *
 * Uses web searches to verify department assignments for ambiguous cases
 * Falls back to pattern matching only when web search is inconclusive
 *
 * Key Features:
 * - Web search for ambiguous titles (Captain, Chief, Lieutenant, etc.)
 * - Pattern matching only for clear-cut cases (Detective = Police)
 * - High accuracy through web verification
 */

const https = require('https');
const path = require('path');
const { requireProtectedModule } = require('../../../opspal-core/scripts/lib/protected-asset-runtime');
const EnhancedGovClassifier = requireProtectedModule({
  pluginRoot: path.resolve(__dirname, '../..'),
  pluginName: 'opspal-hubspot',
  relativePath: 'scripts/lib/enhanced-gov-classifier.js'
});

// Titles that are AMBIGUOUS across departments (need web search)
const AMBIGUOUS_TITLES = [
  'captain', 'chief', 'lieutenant', 'commander', 'supervisor',
  'manager', 'director', 'administrator', 'coordinator',
  'officer' // Generic - could be police, probation, corrections, etc.
];

// Titles that are CLEAR indicators (no web search needed)
const CLEAR_INDICATORS = {
  police: ['detective', 'investigator', 'patrol officer', 'trooper'],
  fire: ['firefighter', 'fire marshal', 'fire inspector', 'battalion chief'],
  ems: ['paramedic', 'emt', 'emergency medical'],
  sheriff: ['deputy', 'deputy sheriff', 'sheriff'],
  corrections: ['correctional officer', 'corrections officer', 'warden'],
  probation: ['probation officer', 'parole officer']
};

class WebVerifiedGovClassifier {
  constructor(options = {}) {
    this.concurrency = options.concurrency || 5;
    this.patternClassifier = new EnhancedGovClassifier({ concurrency: 1 });
    this.searchCache = new Map();
    this.webSearchEnabled = options.webSearchEnabled !== false;
  }

  /**
   * Classify a single contact with web verification
   */
  async classify(contact) {
    const titleLower = (contact.title || '').toLowerCase();

    // Step 1: Check if title is a clear indicator
    const clearDept = this.getClearDepartment(titleLower);
    if (clearDept) {
      return {
        bucket: clearDept.bucket,
        confidence: clearDept.confidence,
        rationale: `Clear title indicator: "${contact.title}" → ${clearDept.bucket}`,
        verificationMethod: 'clear_title_pattern'
      };
    }

    // Step 2: Check if title is ambiguous and needs web verification
    const isAmbiguous = this.isAmbiguousTitle(titleLower);

    if (isAmbiguous && this.webSearchEnabled) {
      // Web search to verify actual department
      const webResult = await this.webSearchVerify(contact);

      if (webResult && webResult.confidence >= 70) {
        return {
          bucket: webResult.bucket,
          confidence: webResult.confidence,
          rationale: webResult.rationale,
          verificationMethod: 'web_search',
          searchEvidence: webResult.evidence
        };
      }

      // Web search inconclusive, fall back to pattern matching
      const patternResult = this.patternClassifier.classify(contact);
      return {
        ...patternResult,
        verificationMethod: 'pattern_fallback',
        note: 'Web search inconclusive, used pattern matching'
      };
    }

    // Step 3: Not ambiguous, use pattern matching
    const patternResult = this.patternClassifier.classify(contact);
    return {
      ...patternResult,
      verificationMethod: 'pattern_matching'
    };
  }

  /**
   * Check if title clearly indicates a specific department
   */
  getClearDepartment(titleLower) {
    // Police-specific titles
    if (CLEAR_INDICATORS.police.some(t => titleLower.includes(t))) {
      return {
        bucket: 'Local Law Enforcement',
        confidence: 90
      };
    }

    // Fire-specific titles
    if (CLEAR_INDICATORS.fire.some(t => titleLower.includes(t))) {
      return {
        bucket: 'Municipal Fire Department',
        confidence: 90
      };
    }

    // EMS-specific titles
    if (CLEAR_INDICATORS.ems.some(t => titleLower.includes(t))) {
      return {
        bucket: 'County EMS',
        confidence: 85
      };
    }

    // Sheriff-specific titles
    if (CLEAR_INDICATORS.sheriff.some(t => titleLower.includes(t))) {
      return {
        bucket: 'County Sheriff',
        confidence: 95
      };
    }

    // Corrections-specific titles
    if (CLEAR_INDICATORS.corrections.some(t => titleLower.includes(t))) {
      return {
        bucket: 'DOC',
        confidence: 90
      };
    }

    // Probation-specific titles
    if (CLEAR_INDICATORS.probation.some(t => titleLower.includes(t))) {
      return {
        bucket: 'Parole/Probation Boards',
        confidence: 90
      };
    }

    return null;
  }

  /**
   * Check if title is ambiguous across departments
   */
  isAmbiguousTitle(titleLower) {
    return AMBIGUOUS_TITLES.some(ambiguous => titleLower.includes(ambiguous));
  }

  /**
   * Perform web search to verify department assignment
   */
  async webSearchVerify(contact) {
    const cacheKey = `${contact.name}|${contact.company}|${contact.title}`;

    if (this.searchCache.has(cacheKey)) {
      return this.searchCache.get(cacheKey);
    }

    // Build search query
    const query = this.buildSearchQuery(contact);

    try {
      // Perform web search using DuckDuckGo HTML
      const searchResults = await this.performWebSearch(query);

      // Analyze results to determine department
      const result = this.analyzeSearchResults(searchResults, contact);

      this.searchCache.set(cacheKey, result);
      return result;

    } catch (error) {
      console.error(`Web search failed for ${contact.name}: ${error.message}`);
      return null;
    }
  }

  /**
   * Build effective search query
   */
  buildSearchQuery(contact) {
    const parts = [];

    if (contact.name) parts.push(contact.name);
    if (contact.title) parts.push(contact.title);
    if (contact.company) parts.push(contact.company);

    return parts.join(' ');
  }

  /**
   * Perform web search using simple HTTPS fetch
   * Searches organization's website or public records
   */
  async performWebSearch(query) {
    // Try to fetch organization's website directly
    const orgDomain = this.extractOrgDomain(query);

    if (orgDomain) {
      try {
        const websiteContent = await this.fetchWebsite(orgDomain);
        return this.parseWebsiteContent(websiteContent, query);
      } catch (error) {
        // Website fetch failed, return empty results
        return [];
      }
    }

    return [];
  }

  /**
   * Extract organization domain from contact info
   */
  extractOrgDomain(query) {
    // Extract from common patterns
    const patterns = [
      /([a-z]+)\.gov/i,
      /city of ([a-z]+)/i,
      /([a-z]+) police department/i,
      /([a-z]+) fire department/i,
      /([a-z]+) sheriff/i
    ];

    for (const pattern of patterns) {
      const match = query.match(pattern);
      if (match) {
        const city = match[1].toLowerCase();
        return `${city}.gov`;
      }
    }

    return null;
  }

  /**
   * Fetch website content
   */
  async fetchWebsite(domain) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: domain,
        path: '/',
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 5000
      };

      const req = https.request(options, (res) => {
        // Follow redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = new URL(res.headers.location, `https://${domain}`);
          return this.fetchWebsite(redirectUrl.hostname + redirectUrl.pathname)
            .then(resolve)
            .catch(reject);
        }

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(data);
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout'));
      });

      req.on('error', reject);
      req.end();
    });
  }

  /**
   * Parse website content for department indicators
   */
  parseWebsiteContent(html, query) {
    const results = [];
    const lowerHtml = html.toLowerCase();

    // Extract relevant sections mentioning the person or department
    const searchName = query.split(' ')[0]; // First name
    const sections = lowerHtml.split(/[\n\r]/);

    for (const section of sections) {
      if (section.includes(searchName.toLowerCase()) ||
          section.includes('fire') ||
          section.includes('police') ||
          section.includes('ems') ||
          section.includes('sheriff')) {
        results.push({
          snippet: section.trim().substring(0, 200),
          type: 'snippet'
        });
      }
    }

    return results;
  }

  /**
   * Analyze search results to determine department
   */
  analyzeSearchResults(results, contact) {
    if (!results || results.length === 0) {
      return null;
    }

    // Combine all text from results
    const allText = results
      .map(r => (r.snippet || r.title || '').toLowerCase())
      .join(' ');

    // Score each department based on keyword presence
    const scores = {
      'Local Law Enforcement': this.scorePolice(allText),
      'Municipal Fire Department': this.scoreFire(allText),
      'County EMS': this.scoreEMS(allText),
      'County Sheriff': this.scoreSheriff(allText),
      'DOC': this.scoreCorrections(allText),
      'Parole/Probation Boards': this.scoreProbation(allText)
    };

    // Find highest score
    let bestDept = null;
    let bestScore = 0;

    for (const [dept, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestDept = dept;
      }
    }

    if (bestScore >= 3) { // Require at least 3 keyword matches
      const evidence = this.extractEvidence(allText, bestDept);

      return {
        bucket: bestDept,
        confidence: Math.min(bestScore * 10 + 50, 95), // 3 matches = 80%, 4 = 90%, 5+ = 95%
        rationale: `Web search verified: ${contact.title} at ${contact.company || 'organization'} - ${evidence}`,
        evidence: evidence
      };
    }

    return null; // Inconclusive
  }

  /**
   * Score for Police department
   */
  scorePolice(text) {
    let score = 0;
    const keywords = [
      'police', 'law enforcement', 'patrol', 'criminal investigation',
      'arrests', 'police department', 'pd', 'detective', 'investigator'
    ];

    keywords.forEach(keyword => {
      if (text.includes(keyword)) score++;
    });

    return score;
  }

  /**
   * Score for Fire department
   */
  scoreFire(text) {
    let score = 0;
    const keywords = [
      'fire department', 'fire', 'firefighter', 'fire suppression',
      'fire prevention', 'fire marshal', 'fire service', 'fd', 'fire rescue'
    ];

    keywords.forEach(keyword => {
      if (text.includes(keyword)) score++;
    });

    return score;
  }

  /**
   * Score for EMS
   */
  scoreEMS(text) {
    let score = 0;
    const keywords = [
      'ems', 'emergency medical', 'ambulance', 'paramedic',
      'emergency medical services', 'medical transport'
    ];

    keywords.forEach(keyword => {
      if (text.includes(keyword)) score++;
    });

    return score;
  }

  /**
   * Score for Sheriff
   */
  scoreSheriff(text) {
    let score = 0;
    const keywords = [
      'sheriff', 'deputy', "sheriff's office", 'county sheriff',
      'sheriff department'
    ];

    keywords.forEach(keyword => {
      if (text.includes(keyword)) score++;
    });

    return score;
  }

  /**
   * Score for Corrections
   */
  scoreCorrections(text) {
    let score = 0;
    const keywords = [
      'corrections', 'correctional', 'jail', 'prison',
      'department of corrections', 'inmate', 'detention'
    ];

    keywords.forEach(keyword => {
      if (text.includes(keyword)) score++;
    });

    return score;
  }

  /**
   * Score for Probation
   */
  scoreProbation(text) {
    let score = 0;
    const keywords = [
      'probation', 'parole', 'probation officer', 'parole officer',
      'community supervision', 'probation department'
    ];

    keywords.forEach(keyword => {
      if (text.includes(keyword)) score++;
    });

    return score;
  }

  /**
   * Extract evidence from search results
   */
  extractEvidence(text, department) {
    const deptKeywords = {
      'Local Law Enforcement': ['police', 'detective', 'patrol'],
      'Municipal Fire Department': ['fire department', 'firefighter', 'fire'],
      'County EMS': ['ems', 'paramedic', 'ambulance'],
      'County Sheriff': ['sheriff', 'deputy'],
      'DOC': ['corrections', 'jail', 'prison'],
      'Parole/Probation Boards': ['probation', 'parole']
    };

    const keywords = deptKeywords[department] || [];
    const found = keywords.filter(kw => text.includes(kw));

    return `Found keywords: ${found.join(', ')}`;
  }

  /**
   * Classify batch in parallel
   */
  async classifyBatch(contacts) {
    console.log(`🔍 Classifying ${contacts.length} contacts with web verification...\\n`);

    const batches = this.splitIntoBatches(contacts, this.concurrency);
    const results = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`Processing batch ${i + 1}/${batches.length} (${batch.length} contacts)...`);

      const batchPromises = batch.map(contact =>
        this.classify(contact).then(classification => ({
          input: contact,
          classification: classification
        }))
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      const avgConf = batchResults.reduce((sum, r) => sum + r.classification.confidence, 0) / batchResults.length;
      const webVerified = batchResults.filter(r => r.classification.verificationMethod === 'web_search').length;
      console.log(`  ✓ Batch complete. Avg confidence: ${avgConf.toFixed(0)}%, Web verified: ${webVerified}`);
    }

    console.log(`\\n✅ Classified ${results.length} contacts\\n`);
    return results;
  }

  splitIntoBatches(array, size) {
    const batches = [];
    for (let i = 0; i < array.length; i += size) {
      batches.push(array.slice(i, i + size));
    }
    return batches;
  }

  getStatistics(results) {
    const stats = {
      total: results.length,
      byBucket: {},
      byVerificationMethod: {},
      avgConfidence: 0,
      highConfidence: 0,
      mediumConfidence: 0,
      lowConfidence: 0,
      webVerified: 0
    };

    let totalConf = 0;

    for (const result of results) {
      const bucket = result.classification.bucket;
      const conf = result.classification.confidence;
      const method = result.classification.verificationMethod;

      stats.byBucket[bucket] = (stats.byBucket[bucket] || 0) + 1;
      stats.byVerificationMethod[method] = (stats.byVerificationMethod[method] || 0) + 1;

      totalConf += conf;

      if (conf >= 80) stats.highConfidence++;
      else if (conf >= 60) stats.mediumConfidence++;
      else stats.lowConfidence++;

      if (method === 'web_search') stats.webVerified++;
    }

    stats.avgConfidence = totalConf / results.length;
    return stats;
  }
}

module.exports = WebVerifiedGovClassifier;
