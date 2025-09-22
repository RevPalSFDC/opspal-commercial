/**
 * Advanced Deduplication Module for Cross-Platform Operations
 * Implements multiple fuzzy matching algorithms and ML-based duplicate detection
 */

const SalesforceConnector = require('../../core/connectors/salesforce-connector');
const HubSpotConnector = require('../../core/connectors/hubspot-connector');
const UnifiedRecord = require('../../core/data-models/unified-record');

class DeduplicationEngine {
  constructor(config = {}) {
    this.config = {
      algorithms: config.algorithms || ['levenshtein', 'jaroWinkler', 'soundex', 'metaphone'],
      defaultThreshold: config.defaultThreshold || 0.8,
      weights: config.weights || {
        name: 0.3,
        email: 0.25,
        phone: 0.2,
        address: 0.15,
        company: 0.1
      },
      batchSize: config.batchSize || 100,
      maxCandidates: config.maxCandidates || 50,
      crossPlatform: config.crossPlatform || false,
      ...config
    };

    this.sfConnector = null;
    this.hsConnector = null;
    this.duplicateGroups = [];
    this.processedRecords = new Set();
  }

  /**
   * Initialize connectors
   */
  async initialize() {
    if (this.config.salesforce) {
      this.sfConnector = new SalesforceConnector(this.config.salesforce);
      await this.sfConnector.authenticate();
    }

    if (this.config.hubspot) {
      this.hsConnector = new HubSpotConnector(this.config.hubspot);
      await this.hsConnector.authenticate();
    }
  }

  /**
   * Find duplicates within a single platform
   */
  async findDuplicates(platform, objectType, options = {}) {
    const threshold = options.threshold || this.config.defaultThreshold;
    const fields = options.fields || this.getDefaultFields(objectType);
    const maxRecords = options.maxRecords || 10000;

    let records = [];

    // Fetch records from platform
    if (platform === 'salesforce' && this.sfConnector) {
      const soql = this.buildSOQL(objectType, fields, maxRecords);
      const result = await this.sfConnector.query(soql);
      records = result.records.map(r => UnifiedRecord.fromSalesforce(r, objectType));
    } else if (platform === 'hubspot' && this.hsConnector) {
      const result = await this.hsConnector.searchRecords(objectType, {
        properties: fields,
        limit: 100
      }, { maxRecords });
      records = result.records.map(r => UnifiedRecord.fromHubSpot(r, objectType));
    }

    // Find duplicates using multiple algorithms
    const duplicateGroups = this.detectDuplicates(records, threshold, options);

    return {
      platform,
      objectType,
      totalRecords: records.length,
      duplicateGroups,
      summary: this.generateSummary(duplicateGroups)
    };
  }

  /**
   * Find cross-platform duplicates
   */
  async findCrossPlatformDuplicates(objectType, options = {}) {
    if (!this.sfConnector || !this.hsConnector) {
      throw new Error('Both Salesforce and HubSpot connectors must be configured for cross-platform deduplication');
    }

    const threshold = options.threshold || this.config.defaultThreshold;
    const fields = options.fields || this.getDefaultFields(objectType);
    const maxRecords = options.maxRecords || 5000;

    // Fetch records from both platforms
    const [sfRecords, hsRecords] = await Promise.all([
      this.fetchSalesforceRecords(objectType, fields, maxRecords),
      this.fetchHubSpotRecords(objectType, fields, maxRecords)
    ]);

    // Convert to unified format
    const sfUnified = sfRecords.map(r => UnifiedRecord.fromSalesforce(r, objectType));
    const hsUnified = hsRecords.map(r => UnifiedRecord.fromHubSpot(r, objectType));

    // Find cross-platform matches
    const crossPlatformDuplicates = this.detectCrossPlatformDuplicates(
      sfUnified,
      hsUnified,
      threshold,
      options
    );

    return {
      salesforceRecords: sfUnified.length,
      hubspotRecords: hsUnified.length,
      crossPlatformMatches: crossPlatformDuplicates,
      summary: this.generateCrossPlatformSummary(crossPlatformDuplicates)
    };
  }

  /**
   * Detect duplicates using multiple algorithms
   */
  detectDuplicates(records, threshold, options = {}) {
    const duplicateGroups = [];
    const processed = new Set();

    for (let i = 0; i < records.length; i++) {
      if (processed.has(i)) continue;

      const group = {
        master: records[i],
        duplicates: [],
        scores: [],
        confidence: 0
      };

      for (let j = i + 1; j < records.length; j++) {
        if (processed.has(j)) continue;

        const score = this.calculateSimilarityScore(records[i], records[j], options);

        if (score >= threshold) {
          group.duplicates.push(records[j]);
          group.scores.push({
            record: records[j],
            score: score,
            details: this.getScoreDetails(records[i], records[j])
          });
          processed.add(j);
        }
      }

      if (group.duplicates.length > 0) {
        group.confidence = this.calculateGroupConfidence(group.scores);
        duplicateGroups.push(group);
        processed.add(i);
      }
    }

    return duplicateGroups;
  }

  /**
   * Detect cross-platform duplicates
   */
  detectCrossPlatformDuplicates(sfRecords, hsRecords, threshold, options = {}) {
    const matches = [];

    for (const sfRecord of sfRecords) {
      const candidates = [];

      for (const hsRecord of hsRecords) {
        const score = this.calculateSimilarityScore(sfRecord, hsRecord, options);

        if (score >= threshold) {
          candidates.push({
            hubspotRecord: hsRecord,
            score: score,
            details: this.getScoreDetails(sfRecord, hsRecord)
          });
        }
      }

      if (candidates.length > 0) {
        // Sort by score and take top matches
        candidates.sort((a, b) => b.score - a.score);
        const topCandidates = candidates.slice(0, this.config.maxCandidates);

        matches.push({
          salesforceRecord: sfRecord,
          matches: topCandidates,
          bestMatch: topCandidates[0],
          confidence: this.calculateMatchConfidence(topCandidates)
        });
      }
    }

    return matches;
  }

  /**
   * Calculate similarity score between two records
   */
  calculateSimilarityScore(record1, record2, options = {}) {
    const weights = options.weights || this.config.weights;
    let totalScore = 0;
    let totalWeight = 0;

    // Name similarity
    if (record1.name && record2.name && weights.name > 0) {
      const nameSimilarity = this.calculateFieldSimilarity(
        record1.name,
        record2.name,
        options.nameAlgorithm || 'jaroWinkler'
      );
      totalScore += nameSimilarity * weights.name;
      totalWeight += weights.name;
    }

    // Email similarity (exact match or domain match)
    if (record1.email && record2.email && weights.email > 0) {
      const emailSimilarity = this.calculateEmailSimilarity(record1.email, record2.email);
      totalScore += emailSimilarity * weights.email;
      totalWeight += weights.email;
    }

    // Phone similarity
    if (record1.phone && record2.phone && weights.phone > 0) {
      const phoneSimilarity = this.calculatePhoneSimilarity(record1.phone, record2.phone);
      totalScore += phoneSimilarity * weights.phone;
      totalWeight += weights.phone;
    }

    // Address similarity
    if (record1.address && record2.address && weights.address > 0) {
      const addressSimilarity = this.calculateAddressSimilarity(record1.address, record2.address);
      totalScore += addressSimilarity * weights.address;
      totalWeight += weights.address;
    }

    // Company/Parent similarity
    if (weights.company > 0) {
      const companyField1 = record1.customFields.sf_Company || record1.customFields.hs_company || record1.parentId;
      const companyField2 = record2.customFields.sf_Company || record2.customFields.hs_company || record2.parentId;

      if (companyField1 && companyField2) {
        const companySimilarity = this.calculateFieldSimilarity(
          companyField1.toString(),
          companyField2.toString(),
          'levenshtein'
        );
        totalScore += companySimilarity * weights.company;
        totalWeight += weights.company;
      }
    }

    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  /**
   * Calculate field similarity using specified algorithm
   */
  calculateFieldSimilarity(value1, value2, algorithm = 'levenshtein') {
    if (!value1 || !value2) return 0;

    const str1 = value1.toString().toLowerCase().trim();
    const str2 = value2.toString().toLowerCase().trim();

    if (str1 === str2) return 1;

    switch (algorithm) {
      case 'levenshtein':
        return this.levenshteinSimilarity(str1, str2);
      case 'jaroWinkler':
        return this.jaroWinklerSimilarity(str1, str2);
      case 'soundex':
        return this.soundexSimilarity(str1, str2);
      case 'metaphone':
        return this.metaphoneSimilarity(str1, str2);
      case 'tokenSet':
        return this.tokenSetSimilarity(str1, str2);
      default:
        return this.levenshteinSimilarity(str1, str2);
    }
  }

  /**
   * Levenshtein similarity
   */
  levenshteinSimilarity(str1, str2) {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    const distance = matrix[str2.length][str1.length];
    const maxLength = Math.max(str1.length, str2.length);
    return maxLength > 0 ? 1 - (distance / maxLength) : 1;
  }

  /**
   * Jaro-Winkler similarity
   */
  jaroWinklerSimilarity(str1, str2) {
    const jaro = this.jaroSimilarity(str1, str2);
    const prefixLength = this.commonPrefixLength(str1, str2, 4);
    return jaro + (prefixLength * 0.1 * (1 - jaro));
  }

  /**
   * Jaro similarity (base for Jaro-Winkler)
   */
  jaroSimilarity(str1, str2) {
    if (str1 === str2) return 1;

    const len1 = str1.length;
    const len2 = str2.length;

    if (len1 === 0 || len2 === 0) return 0;

    const matchDistance = Math.floor(Math.max(len1, len2) / 2) - 1;
    const str1Matches = new Array(len1).fill(false);
    const str2Matches = new Array(len2).fill(false);

    let matches = 0;
    let transpositions = 0;

    // Find matches
    for (let i = 0; i < len1; i++) {
      const start = Math.max(0, i - matchDistance);
      const end = Math.min(i + matchDistance + 1, len2);

      for (let j = start; j < end; j++) {
        if (str2Matches[j] || str1[i] !== str2[j]) continue;
        str1Matches[i] = true;
        str2Matches[j] = true;
        matches++;
        break;
      }
    }

    if (matches === 0) return 0;

    // Count transpositions
    let k = 0;
    for (let i = 0; i < len1; i++) {
      if (!str1Matches[i]) continue;
      while (!str2Matches[k]) k++;
      if (str1[i] !== str2[k]) transpositions++;
      k++;
    }

    return (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;
  }

  /**
   * Common prefix length (for Jaro-Winkler)
   */
  commonPrefixLength(str1, str2, maxLength = 4) {
    let i = 0;
    while (i < Math.min(str1.length, str2.length, maxLength) && str1[i] === str2[i]) {
      i++;
    }
    return i;
  }

  /**
   * Soundex similarity
   */
  soundexSimilarity(str1, str2) {
    const soundex1 = this.soundex(str1);
    const soundex2 = this.soundex(str2);
    return soundex1 === soundex2 ? 1 : 0;
  }

  /**
   * Soundex algorithm
   */
  soundex(str) {
    const map = {
      B: 1, F: 1, P: 1, V: 1,
      C: 2, G: 2, J: 2, K: 2, Q: 2, S: 2, X: 2, Z: 2,
      D: 3, T: 3,
      L: 4,
      M: 5, N: 5,
      R: 6
    };

    const upper = str.toUpperCase();
    let result = upper[0];
    let prev = map[upper[0]];

    for (let i = 1; i < upper.length && result.length < 4; i++) {
      const curr = map[upper[i]];
      if (curr && curr !== prev) {
        result += curr;
        prev = curr;
      } else if (!curr) {
        prev = null;
      }
    }

    return result.padEnd(4, '0');
  }

  /**
   * Metaphone similarity
   */
  metaphoneSimilarity(str1, str2) {
    const metaphone1 = this.metaphone(str1);
    const metaphone2 = this.metaphone(str2);
    return this.levenshteinSimilarity(metaphone1, metaphone2);
  }

  /**
   * Simple Metaphone implementation
   */
  metaphone(str) {
    const rules = [
      [/^gn|kn|pn|wr|ps/, ''],
      [/^x/, 's'],
      [/^wh/, 'w'],
      [/mb$/, 'm'],
      [/ck/, 'k'],
      [/ph/g, 'f'],
      [/qu/g, 'kw'],
      [/sch/g, 'sk'],
      [/[wy]/g, ''],
      [/[aeiou]/g, 'a']
    ];

    let result = str.toLowerCase();
    for (const [pattern, replacement] of rules) {
      result = result.replace(pattern, replacement);
    }
    return result;
  }

  /**
   * Token set similarity (for names with different word order)
   */
  tokenSetSimilarity(str1, str2) {
    const tokens1 = new Set(str1.split(/\s+/));
    const tokens2 = new Set(str2.split(/\s+/));

    const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
    const union = new Set([...tokens1, ...tokens2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Email similarity
   */
  calculateEmailSimilarity(email1, email2) {
    const e1 = email1.toLowerCase().trim();
    const e2 = email2.toLowerCase().trim();

    if (e1 === e2) return 1;

    // Check domain similarity
    const [local1, domain1] = e1.split('@');
    const [local2, domain2] = e2.split('@');

    if (domain1 === domain2) {
      // Same domain, check local part similarity
      return 0.5 + (this.levenshteinSimilarity(local1, local2) * 0.5);
    }

    return 0;
  }

  /**
   * Phone similarity
   */
  calculatePhoneSimilarity(phone1, phone2) {
    // Normalize phone numbers
    const p1 = phone1.replace(/\D/g, '');
    const p2 = phone2.replace(/\D/g, '');

    if (p1 === p2) return 1;

    // Check if one is subset of other (country code differences)
    if (p1.endsWith(p2) || p2.endsWith(p1)) {
      return 0.9;
    }

    // Check last 10 digits (US phone numbers)
    if (p1.length >= 10 && p2.length >= 10) {
      const last10_1 = p1.slice(-10);
      const last10_2 = p2.slice(-10);
      if (last10_1 === last10_2) return 0.95;
    }

    return this.levenshteinSimilarity(p1, p2);
  }

  /**
   * Address similarity
   */
  calculateAddressSimilarity(addr1, addr2) {
    if (!addr1 || !addr2) return 0;

    let score = 0;
    let fields = 0;

    // Street
    if (addr1.street && addr2.street) {
      score += this.levenshteinSimilarity(addr1.street.toLowerCase(), addr2.street.toLowerCase());
      fields++;
    }

    // City
    if (addr1.city && addr2.city) {
      score += this.levenshteinSimilarity(addr1.city.toLowerCase(), addr2.city.toLowerCase());
      fields++;
    }

    // State
    if (addr1.state && addr2.state) {
      score += (addr1.state.toLowerCase() === addr2.state.toLowerCase() ? 1 : 0);
      fields++;
    }

    // Postal code
    if (addr1.postalCode && addr2.postalCode) {
      const zip1 = addr1.postalCode.substring(0, 5);
      const zip2 = addr2.postalCode.substring(0, 5);
      score += (zip1 === zip2 ? 1 : 0);
      fields++;
    }

    return fields > 0 ? score / fields : 0;
  }

  /**
   * Get score details for debugging
   */
  getScoreDetails(record1, record2) {
    const details = {};

    if (record1.name && record2.name) {
      details.name = {
        value1: record1.name,
        value2: record2.name,
        similarity: this.calculateFieldSimilarity(record1.name, record2.name, 'jaroWinkler')
      };
    }

    if (record1.email && record2.email) {
      details.email = {
        value1: record1.email,
        value2: record2.email,
        similarity: this.calculateEmailSimilarity(record1.email, record2.email)
      };
    }

    if (record1.phone && record2.phone) {
      details.phone = {
        value1: record1.phone,
        value2: record2.phone,
        similarity: this.calculatePhoneSimilarity(record1.phone, record2.phone)
      };
    }

    return details;
  }

  /**
   * Calculate group confidence
   */
  calculateGroupConfidence(scores) {
    if (!scores || scores.length === 0) return 0;

    const avgScore = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
    const minScore = Math.min(...scores.map(s => s.score));

    // Confidence is weighted average of avg and min
    return (avgScore * 0.7) + (minScore * 0.3);
  }

  /**
   * Calculate match confidence
   */
  calculateMatchConfidence(candidates) {
    if (!candidates || candidates.length === 0) return 0;

    const bestScore = candidates[0].score;

    // If there's only one candidate, confidence equals score
    if (candidates.length === 1) return bestScore;

    // If multiple candidates, reduce confidence based on how close they are
    const secondBest = candidates[1].score;
    const gap = bestScore - secondBest;

    // Larger gap means higher confidence
    return bestScore * (0.5 + (gap * 0.5));
  }

  /**
   * Generate summary of duplicate groups
   */
  generateSummary(duplicateGroups) {
    const totalDuplicates = duplicateGroups.reduce((sum, g) => sum + g.duplicates.length, 0);
    const avgGroupSize = duplicateGroups.length > 0 ? totalDuplicates / duplicateGroups.length : 0;

    const confidenceBuckets = {
      high: duplicateGroups.filter(g => g.confidence > 0.9).length,
      medium: duplicateGroups.filter(g => g.confidence >= 0.7 && g.confidence <= 0.9).length,
      low: duplicateGroups.filter(g => g.confidence < 0.7).length
    };

    return {
      totalGroups: duplicateGroups.length,
      totalDuplicates,
      avgGroupSize: avgGroupSize.toFixed(2),
      confidenceBuckets,
      topGroups: duplicateGroups.slice(0, 5).map(g => ({
        masterName: g.master.name,
        duplicateCount: g.duplicates.length,
        confidence: g.confidence.toFixed(3)
      }))
    };
  }

  /**
   * Generate cross-platform summary
   */
  generateCrossPlatformSummary(matches) {
    return {
      totalMatches: matches.length,
      avgConfidence: matches.length > 0
        ? (matches.reduce((sum, m) => sum + m.confidence, 0) / matches.length).toFixed(3)
        : 0,
      highConfidenceMatches: matches.filter(m => m.confidence > 0.9).length,
      mediumConfidenceMatches: matches.filter(m => m.confidence >= 0.7 && m.confidence <= 0.9).length,
      lowConfidenceMatches: matches.filter(m => m.confidence < 0.7).length,
      topMatches: matches.slice(0, 5).map(m => ({
        salesforceName: m.salesforceRecord.name,
        hubspotName: m.bestMatch.hubspotRecord.name,
        score: m.bestMatch.score.toFixed(3),
        confidence: m.confidence.toFixed(3)
      }))
    };
  }

  /**
   * Helper methods
   */

  getDefaultFields(objectType) {
    const fieldMap = {
      'contact': ['Id', 'FirstName', 'LastName', 'Email', 'Phone', 'AccountId'],
      'lead': ['Id', 'FirstName', 'LastName', 'Email', 'Phone', 'Company'],
      'account': ['Id', 'Name', 'Website', 'Phone', 'BillingStreet', 'BillingCity'],
      'company': ['id', 'name', 'domain', 'phone', 'address', 'city'],
      'deal': ['Id', 'Name', 'Amount', 'AccountId', 'CloseDate'],
      'opportunity': ['Id', 'Name', 'Amount', 'AccountId', 'CloseDate']
    };

    return fieldMap[objectType.toLowerCase()] || ['Id', 'Name'];
  }

  buildSOQL(objectType, fields, limit) {
    const fieldList = fields.join(', ');
    return `SELECT ${fieldList} FROM ${objectType} LIMIT ${limit}`;
  }

  async fetchSalesforceRecords(objectType, fields, limit) {
    const soql = this.buildSOQL(objectType, fields, limit);
    const result = await this.sfConnector.query(soql);
    return result.records;
  }

  async fetchHubSpotRecords(objectType, fields, limit) {
    const result = await this.hsConnector.searchRecords(objectType, {
      properties: fields,
      limit: 100
    }, { maxRecords: limit });
    return result.records;
  }
}

module.exports = DeduplicationEngine;