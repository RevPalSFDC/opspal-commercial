#!/usr/bin/env node

/**
 * Domain Detector
 *
 * Automatically detects the industry domain of input data by analyzing
 * keywords, field names, and entity types. Used to select appropriate
 * abbreviation dictionaries for matching operations.
 *
 * Detection Strategies:
 * 1. Keyword scoring - Count domain-specific keywords in data
 * 2. Entity type matching - Check Salesforce/HubSpot object types
 * 3. Field pattern matching - Look for domain-specific field names
 * 4. User hints - Explicit [DOMAIN: x] flags
 *
 * Usage:
 *   const { DomainDetector } = require('./domain-detector');
 *   const detector = new DomainDetector();
 *
 *   // Detect from text
 *   const result = detector.detect('ABC Property Management HOA');
 *
 *   // Detect from data records
 *   const result = detector.detectFromRecords(records, { fieldNames: ['Account', 'Type'] });
 *
 *   // Detect from CSV headers
 *   const result = detector.detectFromHeaders(['TenantName', 'UnitNumber', 'RentAmount']);
 */

'use strict';

const { DomainDictionaryLoader } = require('./domain-dictionary-loader');

class DomainDetector {
  constructor(options = {}) {
    this.loader = options.loader || new DomainDictionaryLoader();
    this.minimumConfidence = options.minimumConfidence || 0.3;
    this.detectionPatterns = null;

    // Weight factors for different evidence types
    this.weights = {
      keyword: options.keywordWeight || 1.0,
      entityType: options.entityTypeWeight || 2.0,
      fieldPattern: options.fieldPatternWeight || 1.5,
      userHint: options.userHintWeight || 10.0, // User hints are highly trusted
      abbreviationMatch: options.abbreviationWeight || 1.5
    };
  }

  /**
   * Load detection patterns from all domains
   * @private
   */
  _loadPatterns() {
    if (!this.detectionPatterns) {
      this.detectionPatterns = this.loader.getAllDetectionPatterns();
    }
    return this.detectionPatterns;
  }

  /**
   * Extract user hint from text (e.g., "[DOMAIN: healthcare]")
   * @param {string} text - Input text
   * @returns {string|null} Domain hint or null
   */
  extractUserHint(text) {
    if (!text) return null;

    // Match [DOMAIN: x] or [domain: x] or [Domain: x]
    const hintMatch = text.match(/\[DOMAIN:\s*([a-zA-Z-]+)\]/i);
    if (hintMatch) {
      const hint = hintMatch[1].toLowerCase();
      // Verify it's a valid domain
      if (this.loader.exists(hint)) {
        return hint;
      }
    }

    return null;
  }

  /**
   * Detect domain from text content
   * @param {string} text - Text to analyze
   * @param {Object} options - Detection options
   * @returns {Object} Detection result
   */
  detect(text, options = {}) {
    if (!text || typeof text !== 'string') {
      return this._buildResult(null, 0, []);
    }

    // Check for user hint first
    const userHint = this.extractUserHint(text);
    if (userHint) {
      return this._buildResult(userHint, 1.0, [{
        type: 'userHint',
        value: userHint,
        weight: this.weights.userHint
      }]);
    }

    const patterns = this._loadPatterns();
    const scores = {};
    const evidence = {};

    // Normalize text for matching
    const normalizedText = text.toLowerCase();
    const words = normalizedText.split(/\s+/);

    // Score each domain
    for (const [domain, domainPatterns] of Object.entries(patterns)) {
      scores[domain] = 0;
      evidence[domain] = [];

      // Keyword matching
      if (domainPatterns.keywords) {
        for (const keyword of domainPatterns.keywords) {
          const keywordLower = keyword.toLowerCase();
          const regex = new RegExp(`\\b${this._escapeRegex(keywordLower)}\\b`, 'gi');
          const matches = normalizedText.match(regex);
          if (matches) {
            const count = matches.length;
            const score = count * this.weights.keyword;
            scores[domain] += score;
            evidence[domain].push({
              type: 'keyword',
              value: keyword,
              count,
              score
            });
          }
        }
      }

      // Check for abbreviation matches
      const abbreviations = this.loader.getAbbreviations(domain);
      for (const abbrev of Object.keys(abbreviations)) {
        const abbrevRegex = new RegExp(`\\b${this._escapeRegex(abbrev)}\\b`, 'g');
        if (abbrevRegex.test(text)) {
          const score = this.weights.abbreviationMatch;
          scores[domain] += score;
          evidence[domain].push({
            type: 'abbreviation',
            value: abbrev,
            expansion: abbreviations[abbrev],
            score
          });
        }
      }
    }

    // Calculate confidences
    const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
    const confidences = {};

    if (totalScore > 0) {
      for (const domain of Object.keys(scores)) {
        confidences[domain] = scores[domain] / totalScore;
      }
    }

    // Find best match
    let bestDomain = null;
    let bestConfidence = 0;

    for (const [domain, confidence] of Object.entries(confidences)) {
      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestDomain = domain;
      }
    }

    // Only return if above minimum confidence
    if (bestConfidence < this.minimumConfidence) {
      return this._buildResult(null, 0, [], confidences);
    }

    return this._buildResult(
      bestDomain,
      bestConfidence,
      evidence[bestDomain] || [],
      confidences
    );
  }

  /**
   * Detect domain from data records
   * @param {Array} records - Array of record objects
   * @param {Object} options - Options
   * @returns {Object} Detection result
   */
  detectFromRecords(records, options = {}) {
    if (!records || !Array.isArray(records) || records.length === 0) {
      return this._buildResult(null, 0, []);
    }

    const patterns = this._loadPatterns();
    const scores = {};
    const evidence = {};

    // Initialize scores
    for (const domain of Object.keys(patterns)) {
      scores[domain] = 0;
      evidence[domain] = [];
    }

    // Get field names from first record
    const fieldNames = Object.keys(records[0]);

    // Check field patterns
    for (const [domain, domainPatterns] of Object.entries(patterns)) {
      if (domainPatterns.fieldPatterns) {
        for (const pattern of domainPatterns.fieldPatterns) {
          const patternLower = pattern.toLowerCase();
          for (const fieldName of fieldNames) {
            if (fieldName.toLowerCase().includes(patternLower)) {
              const score = this.weights.fieldPattern;
              scores[domain] += score;
              evidence[domain].push({
                type: 'fieldPattern',
                pattern,
                matchedField: fieldName,
                score
              });
            }
          }
        }
      }
    }

    // Concatenate record values and detect keywords
    const textContent = records.slice(0, 100).map(r => {
      return Object.values(r)
        .filter(v => typeof v === 'string')
        .join(' ');
    }).join(' ');

    // Combine with text detection
    const textResult = this.detect(textContent);

    // Merge scores
    for (const [domain, textEvidence] of Object.entries(textResult.allScores || {})) {
      scores[domain] = (scores[domain] || 0) + (textEvidence * 10); // Scale text scores
    }

    // Merge evidence
    if (textResult.evidence && textResult.detectedDomain) {
      evidence[textResult.detectedDomain] = [
        ...(evidence[textResult.detectedDomain] || []),
        ...textResult.evidence
      ];
    }

    // Calculate final confidences
    const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
    const confidences = {};

    if (totalScore > 0) {
      for (const domain of Object.keys(scores)) {
        confidences[domain] = scores[domain] / totalScore;
      }
    }

    // Find best match
    let bestDomain = null;
    let bestConfidence = 0;

    for (const [domain, confidence] of Object.entries(confidences)) {
      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestDomain = domain;
      }
    }

    if (bestConfidence < this.minimumConfidence) {
      return this._buildResult(null, 0, [], confidences);
    }

    return this._buildResult(
      bestDomain,
      bestConfidence,
      evidence[bestDomain] || [],
      confidences
    );
  }

  /**
   * Detect domain from CSV/file headers
   * @param {string[]} headers - Array of header names
   * @returns {Object} Detection result
   */
  detectFromHeaders(headers) {
    if (!headers || !Array.isArray(headers) || headers.length === 0) {
      return this._buildResult(null, 0, []);
    }

    const patterns = this._loadPatterns();
    const scores = {};
    const evidence = {};

    for (const [domain, domainPatterns] of Object.entries(patterns)) {
      scores[domain] = 0;
      evidence[domain] = [];

      if (domainPatterns.fieldPatterns) {
        for (const pattern of domainPatterns.fieldPatterns) {
          const patternLower = pattern.toLowerCase();
          for (const header of headers) {
            if (header.toLowerCase().includes(patternLower)) {
              const score = this.weights.fieldPattern;
              scores[domain] += score;
              evidence[domain].push({
                type: 'headerMatch',
                pattern,
                matchedHeader: header,
                score
              });
            }
          }
        }
      }

      // Also check keywords in header names
      if (domainPatterns.keywords) {
        for (const keyword of domainPatterns.keywords) {
          const keywordLower = keyword.toLowerCase();
          for (const header of headers) {
            if (header.toLowerCase().includes(keywordLower)) {
              const score = this.weights.keyword * 0.5; // Lower weight for header keyword match
              scores[domain] += score;
              evidence[domain].push({
                type: 'headerKeyword',
                keyword,
                matchedHeader: header,
                score
              });
            }
          }
        }
      }
    }

    // Calculate confidences
    const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
    const confidences = {};

    if (totalScore > 0) {
      for (const domain of Object.keys(scores)) {
        confidences[domain] = scores[domain] / totalScore;
      }
    }

    // Find best match
    let bestDomain = null;
    let bestConfidence = 0;

    for (const [domain, confidence] of Object.entries(confidences)) {
      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestDomain = domain;
      }
    }

    if (bestConfidence < this.minimumConfidence) {
      return this._buildResult(null, 0, [], confidences);
    }

    return this._buildResult(
      bestDomain,
      bestConfidence,
      evidence[bestDomain] || [],
      confidences
    );
  }

  /**
   * Detect domain from Salesforce/HubSpot entity type
   * @param {string} entityType - Object/entity type name
   * @returns {Object} Detection result
   */
  detectFromEntityType(entityType) {
    if (!entityType) {
      return this._buildResult(null, 0, []);
    }

    const patterns = this._loadPatterns();
    const scores = {};
    const evidence = {};

    const entityTypeLower = entityType.toLowerCase();

    for (const [domain, domainPatterns] of Object.entries(patterns)) {
      scores[domain] = 0;
      evidence[domain] = [];

      if (domainPatterns.entityTypes) {
        for (const type of domainPatterns.entityTypes) {
          if (entityTypeLower.includes(type.toLowerCase())) {
            const score = this.weights.entityType;
            scores[domain] += score;
            evidence[domain].push({
              type: 'entityType',
              pattern: type,
              matchedEntity: entityType,
              score
            });
          }
        }
      }
    }

    // Calculate confidences
    const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
    const confidences = {};

    if (totalScore > 0) {
      for (const domain of Object.keys(scores)) {
        confidences[domain] = scores[domain] / totalScore;
      }
    }

    // Find best match
    let bestDomain = null;
    let bestConfidence = 0;

    for (const [domain, confidence] of Object.entries(confidences)) {
      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestDomain = domain;
      }
    }

    if (bestConfidence < this.minimumConfidence) {
      return this._buildResult(null, 0, [], confidences);
    }

    return this._buildResult(
      bestDomain,
      bestConfidence,
      evidence[bestDomain] || [],
      confidences
    );
  }

  /**
   * Build detection result object
   * @private
   */
  _buildResult(detectedDomain, confidence, evidence, allScores = {}) {
    const alternativeDomains = [];

    // Build alternatives list
    for (const [domain, score] of Object.entries(allScores)) {
      if (domain !== detectedDomain && score > 0.1) {
        alternativeDomains.push({
          domain,
          confidence: score
        });
      }
    }

    // Sort alternatives by confidence
    alternativeDomains.sort((a, b) => b.confidence - a.confidence);

    return {
      detectedDomain,
      confidence: Math.round(confidence * 100) / 100,
      evidence,
      alternativeDomains: alternativeDomains.slice(0, 3),
      allScores
    };
  }

  /**
   * Escape regex special characters
   * @private
   */
  _escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

// Export for CommonJS
module.exports = { DomainDetector };

// CLI Usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const detector = new DomainDetector();

  if (args.length === 0) {
    console.log(`
Domain Detector CLI

Usage:
  node domain-detector.js detect "<text>"             Detect domain from text
  node domain-detector.js headers "<header1,header2>" Detect from CSV headers
  node domain-detector.js file <path.csv>             Detect from CSV file

Examples:
  node domain-detector.js detect "ABC Property Management HOA fees"
  node domain-detector.js detect "San Diego Police Department PD"
  node domain-detector.js detect "[DOMAIN: financial] Bank of America"
  node domain-detector.js headers "TenantName,UnitNumber,RentAmount,LeaseStart"
  node domain-detector.js headers "Account,Opportunity,AUM,NAV"
`);
    process.exit(0);
  }

  if (args[0] === 'detect' && args[1]) {
    const text = args.slice(1).join(' ');
    const result = detector.detect(text);

    console.log('\n--- Domain Detection Result ---');
    console.log(`Input: "${text}"`);
    console.log(`Detected Domain: ${result.detectedDomain || 'none'}`);
    console.log(`Confidence: ${(result.confidence * 100).toFixed(1)}%`);

    if (result.evidence.length > 0) {
      console.log('\nEvidence:');
      result.evidence.forEach(e => {
        console.log(`  - ${e.type}: "${e.value || e.pattern}" (score: ${e.score?.toFixed(2) || e.count})`);
      });
    }

    if (result.alternativeDomains.length > 0) {
      console.log('\nAlternative domains:');
      result.alternativeDomains.forEach(a => {
        console.log(`  - ${a.domain}: ${(a.confidence * 100).toFixed(1)}%`);
      });
    }
    console.log('');

  } else if (args[0] === 'headers' && args[1]) {
    const headers = args[1].split(',').map(h => h.trim());
    const result = detector.detectFromHeaders(headers);

    console.log('\n--- Header Detection Result ---');
    console.log(`Headers: ${headers.join(', ')}`);
    console.log(`Detected Domain: ${result.detectedDomain || 'none'}`);
    console.log(`Confidence: ${(result.confidence * 100).toFixed(1)}%`);

    if (result.evidence.length > 0) {
      console.log('\nEvidence:');
      result.evidence.forEach(e => {
        console.log(`  - ${e.type}: "${e.pattern}" matched "${e.matchedHeader}"`);
      });
    }
    console.log('');

  } else if (args[0] === 'file' && args[1]) {
    const fs = require('fs');
    const filePath = args[1];

    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      process.exit(1);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

    const result = detector.detectFromHeaders(headers);

    console.log('\n--- File Detection Result ---');
    console.log(`File: ${filePath}`);
    console.log(`Headers: ${headers.slice(0, 5).join(', ')}${headers.length > 5 ? '...' : ''}`);
    console.log(`Detected Domain: ${result.detectedDomain || 'none'}`);
    console.log(`Confidence: ${(result.confidence * 100).toFixed(1)}%`);
    console.log('');

  } else {
    console.error('Invalid command. Run without arguments for help.');
    process.exit(1);
  }
}
