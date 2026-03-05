/**
 * Lead Duplicate Detector for Marketo
 *
 * Detects potential duplicate leads using various matching strategies:
 * - Email-based matching (primary)
 * - Company + Name matching (secondary)
 * - Phone number matching (tertiary)
 * - Fuzzy name matching with configurable threshold
 *
 * @module lead-dedup-detector
 * @version 1.0.0
 */

'use strict';

// Matching strategy configurations
const DEFAULT_CONFIG = {
  // Primary matching - exact email match
  emailMatch: {
    enabled: true,
    weight: 100,
    caseSensitive: false,
  },
  // Secondary matching - company + name
  companyNameMatch: {
    enabled: true,
    weight: 80,
    requireBoth: true,
  },
  // Tertiary matching - phone number
  phoneMatch: {
    enabled: true,
    weight: 70,
    normalizePhone: true,
  },
  // Fuzzy name matching
  fuzzyNameMatch: {
    enabled: true,
    weight: 60,
    threshold: 0.85, // 85% similarity required
  },
  // Overall duplicate threshold
  duplicateThreshold: 70, // Score >= 70 = likely duplicate
  possibleThreshold: 50,  // Score 50-69 = possible duplicate
};

/**
 * Normalize email for comparison
 * @param {string} email - Email address
 * @returns {string} Normalized email
 */
function normalizeEmail(email) {
  if (!email) return '';
  return email.toLowerCase().trim();
}

/**
 * Normalize phone number for comparison
 * @param {string} phone - Phone number
 * @returns {string} Normalized phone (digits only)
 */
function normalizePhone(phone) {
  if (!phone) return '';
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '');
  // Handle country codes - keep last 10 digits for US numbers
  if (digits.length > 10 && digits.startsWith('1')) {
    return digits.slice(-10);
  }
  return digits;
}

/**
 * Normalize name for comparison
 * @param {string} name - Name to normalize
 * @returns {string} Normalized name
 */
function normalizeName(name) {
  if (!name) return '';
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Calculate Levenshtein distance between two strings
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Edit distance
 */
function levenshteinDistance(str1, str2) {
  const m = str1.length;
  const n = str2.length;

  if (m === 0) return n;
  if (n === 0) return m;

  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,     // deletion
        dp[i][j - 1] + 1,     // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return dp[m][n];
}

/**
 * Calculate similarity ratio between two strings
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Similarity ratio (0-1)
 */
function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 1;

  const norm1 = normalizeName(str1);
  const norm2 = normalizeName(str2);

  if (norm1 === norm2) return 1;

  const maxLen = Math.max(norm1.length, norm2.length);
  if (maxLen === 0) return 0;

  const distance = levenshteinDistance(norm1, norm2);
  return 1 - (distance / maxLen);
}

/**
 * Compare two leads for potential duplicates
 * @param {Object} lead1 - First lead
 * @param {Object} lead2 - Second lead
 * @param {Object} config - Matching configuration
 * @returns {Object} Match result with score and reasons
 */
function compareLeads(lead1, lead2, config = DEFAULT_CONFIG) {
  const matchReasons = [];
  let totalScore = 0;
  let maxPossibleScore = 0;

  // Email matching
  if (config.emailMatch.enabled) {
    maxPossibleScore += config.emailMatch.weight;
    const email1 = normalizeEmail(lead1.email);
    const email2 = normalizeEmail(lead2.email);

    if (email1 && email2 && email1 === email2) {
      totalScore += config.emailMatch.weight;
      matchReasons.push({
        type: 'email',
        field: 'email',
        value: email1,
        score: config.emailMatch.weight,
      });
    }
  }

  // Company + Name matching
  if (config.companyNameMatch.enabled) {
    maxPossibleScore += config.companyNameMatch.weight;
    const company1 = normalizeName(lead1.company);
    const company2 = normalizeName(lead2.company);
    const name1 = normalizeName(`${lead1.firstName || ''} ${lead1.lastName || ''}`);
    const name2 = normalizeName(`${lead2.firstName || ''} ${lead2.lastName || ''}`);

    const companyMatch = company1 && company2 && company1 === company2;
    const nameMatch = name1 && name2 && name1 === name2;

    if (config.companyNameMatch.requireBoth) {
      if (companyMatch && nameMatch) {
        totalScore += config.companyNameMatch.weight;
        matchReasons.push({
          type: 'company_name',
          field: 'company + name',
          value: `${company1} / ${name1}`,
          score: config.companyNameMatch.weight,
        });
      }
    } else {
      if (companyMatch || nameMatch) {
        const partialScore = config.companyNameMatch.weight / 2;
        if (companyMatch) {
          totalScore += partialScore;
          matchReasons.push({ type: 'company', field: 'company', value: company1, score: partialScore });
        }
        if (nameMatch) {
          totalScore += partialScore;
          matchReasons.push({ type: 'name', field: 'name', value: name1, score: partialScore });
        }
      }
    }
  }

  // Phone matching
  if (config.phoneMatch.enabled) {
    maxPossibleScore += config.phoneMatch.weight;
    const phone1 = normalizePhone(lead1.phone);
    const phone2 = normalizePhone(lead2.phone);

    if (phone1 && phone2 && phone1.length >= 7 && phone1 === phone2) {
      totalScore += config.phoneMatch.weight;
      matchReasons.push({
        type: 'phone',
        field: 'phone',
        value: phone1,
        score: config.phoneMatch.weight,
      });
    }
  }

  // Fuzzy name matching (only if no exact name match)
  if (config.fuzzyNameMatch.enabled && !matchReasons.some(r => r.type === 'name' || r.type === 'company_name')) {
    maxPossibleScore += config.fuzzyNameMatch.weight;
    const name1 = normalizeName(`${lead1.firstName || ''} ${lead1.lastName || ''}`);
    const name2 = normalizeName(`${lead2.firstName || ''} ${lead2.lastName || ''}`);

    if (name1 && name2) {
      const similarity = calculateSimilarity(name1, name2);
      if (similarity >= config.fuzzyNameMatch.threshold) {
        const score = Math.round(config.fuzzyNameMatch.weight * similarity);
        totalScore += score;
        matchReasons.push({
          type: 'fuzzy_name',
          field: 'name (fuzzy)',
          value: `${name1} ≈ ${name2} (${Math.round(similarity * 100)}%)`,
          score,
        });
      }
    }
  }

  // Calculate final score as percentage
  const normalizedScore = maxPossibleScore > 0 ? Math.round((totalScore / maxPossibleScore) * 100) : 0;

  return {
    score: normalizedScore,
    rawScore: totalScore,
    maxScore: maxPossibleScore,
    matchReasons,
    isDuplicate: normalizedScore >= config.duplicateThreshold,
    isPossibleDuplicate: normalizedScore >= config.possibleThreshold && normalizedScore < config.duplicateThreshold,
  };
}

/**
 * Find duplicates for a single lead in a dataset
 * @param {Object} lead - Lead to check
 * @param {Array} existingLeads - Array of existing leads to check against
 * @param {Object} config - Matching configuration
 * @returns {Array} Array of duplicate matches with scores
 */
function findDuplicatesForLead(lead, existingLeads, config = DEFAULT_CONFIG) {
  const duplicates = [];

  for (const existing of existingLeads) {
    // Skip comparing to self
    if (lead.id && existing.id && lead.id === existing.id) continue;

    const result = compareLeads(lead, existing, config);

    if (result.isDuplicate || result.isPossibleDuplicate) {
      duplicates.push({
        matchedLead: existing,
        ...result,
      });
    }
  }

  // Sort by score descending
  duplicates.sort((a, b) => b.score - a.score);

  return duplicates;
}

/**
 * Find all duplicate clusters in a dataset
 * @param {Array} leads - Array of leads to analyze
 * @param {Object} config - Matching configuration
 * @returns {Object} Analysis results with clusters
 */
function findAllDuplicates(leads, config = DEFAULT_CONFIG) {
  const clusters = new Map(); // Map of lead ID to cluster ID
  const clusterDetails = [];  // Detailed cluster information
  let nextClusterId = 1;

  // Track which leads we've already clustered
  const clustered = new Set();

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    if (clustered.has(lead.id)) continue;

    // Find duplicates for this lead
    const remainingLeads = leads.slice(i + 1);
    const duplicates = findDuplicatesForLead(lead, remainingLeads, config);

    if (duplicates.length > 0) {
      const clusterId = nextClusterId++;
      const clusterMembers = [{ lead, isFirst: true }];

      clusters.set(lead.id, clusterId);
      clustered.add(lead.id);

      for (const dup of duplicates) {
        if (!clustered.has(dup.matchedLead.id)) {
          clusters.set(dup.matchedLead.id, clusterId);
          clustered.add(dup.matchedLead.id);
          clusterMembers.push({
            lead: dup.matchedLead,
            matchScore: dup.score,
            matchReasons: dup.matchReasons,
          });
        }
      }

      clusterDetails.push({
        clusterId,
        memberCount: clusterMembers.length,
        members: clusterMembers,
        highestScore: duplicates[0].score,
      });
    }
  }

  return {
    totalLeads: leads.length,
    duplicateClusters: clusterDetails.length,
    leadsInClusters: clustered.size,
    uniqueLeads: leads.length - clustered.size,
    duplicateRate: leads.length > 0 ? Math.round((clustered.size / leads.length) * 100) : 0,
    clusters: clusterDetails,
  };
}

/**
 * Generate a deduplication report
 * @param {Object} analysis - Analysis results from findAllDuplicates
 * @returns {string} Markdown formatted report
 */
function generateDedupReport(analysis) {
  const lines = [
    '# Lead Duplicate Analysis Report',
    '',
    '## Summary',
    '',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total Leads Analyzed | ${analysis.totalLeads} |`,
    `| Duplicate Clusters Found | ${analysis.duplicateClusters} |`,
    `| Leads in Clusters | ${analysis.leadsInClusters} |`,
    `| Unique Leads | ${analysis.uniqueLeads} |`,
    `| Duplicate Rate | ${analysis.duplicateRate}% |`,
    '',
  ];

  if (analysis.clusters.length > 0) {
    lines.push('## Duplicate Clusters');
    lines.push('');

    for (const cluster of analysis.clusters.slice(0, 20)) { // Top 20 clusters
      lines.push(`### Cluster ${cluster.clusterId} (${cluster.memberCount} leads, ${cluster.highestScore}% match)`);
      lines.push('');
      lines.push('| Lead ID | Email | Name | Company | Match Score |');
      lines.push('|---------|-------|------|---------|-------------|');

      for (const member of cluster.members) {
        const name = `${member.lead.firstName || ''} ${member.lead.lastName || ''}`.trim();
        lines.push(`| ${member.lead.id || 'N/A'} | ${member.lead.email || 'N/A'} | ${name || 'N/A'} | ${member.lead.company || 'N/A'} | ${member.matchScore || 'Primary'} |`);
      }
      lines.push('');
    }

    if (analysis.clusters.length > 20) {
      lines.push(`*...and ${analysis.clusters.length - 20} more clusters*`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

module.exports = {
  DEFAULT_CONFIG,
  normalizeEmail,
  normalizePhone,
  normalizeName,
  calculateSimilarity,
  compareLeads,
  findDuplicatesForLead,
  findAllDuplicates,
  generateDedupReport,
};
