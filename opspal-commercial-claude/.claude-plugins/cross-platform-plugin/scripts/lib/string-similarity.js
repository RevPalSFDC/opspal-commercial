/**
 * String Similarity Algorithms
 *
 * Provides various string comparison and phonetic encoding algorithms
 * for fuzzy matching in the RevOps Data Quality System.
 *
 * @module string-similarity
 */

'use strict';

/**
 * Calculate Levenshtein distance (edit distance) between two strings
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} The minimum number of edits to transform str1 into str2
 */
function levenshtein(str1, str2) {
  if (!str1) return str2 ? str2.length : 0;
  if (!str2) return str1.length;

  const len1 = str1.length;
  const len2 = str2.length;

  // Use two-row optimization for memory efficiency
  let prevRow = Array(len2 + 1).fill(0).map((_, i) => i);
  let currRow = Array(len2 + 1).fill(0);

  for (let i = 1; i <= len1; i++) {
    currRow[0] = i;

    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j] + 1,      // deletion
        currRow[j - 1] + 1,  // insertion
        prevRow[j - 1] + cost // substitution
      );
    }

    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[len2];
}

/**
 * Calculate Levenshtein similarity as a ratio (0-1)
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Similarity ratio between 0 and 1
 */
function levenshteinSimilarity(str1, str2) {
  if (!str1 && !str2) return 1;
  if (!str1 || !str2) return 0;

  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1;

  const distance = levenshtein(str1, str2);
  return 1 - (distance / maxLen);
}

/**
 * Calculate Jaro similarity between two strings
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Jaro similarity (0-1)
 */
function jaro(str1, str2) {
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 1;

  const len1 = str1.length;
  const len2 = str2.length;

  // Maximum distance for matching characters
  const matchDistance = Math.floor(Math.max(len1, len2) / 2) - 1;

  const str1Matches = Array(len1).fill(false);
  const str2Matches = Array(len2).fill(false);

  let matches = 0;
  let transpositions = 0;

  // Find matching characters
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

  return (
    (matches / len1 +
      matches / len2 +
      (matches - transpositions / 2) / matches) / 3
  );
}

/**
 * Calculate Jaro-Winkler similarity between two strings
 * Gives higher scores to strings that match from the beginning
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @param {Object} [options] - Configuration options
 * @param {number} [options.prefixScale=0.1] - Scaling factor for common prefix (max 0.25)
 * @param {number} [options.prefixLength=4] - Maximum prefix length to consider
 * @returns {number} Jaro-Winkler similarity (0-1)
 */
function jaroWinkler(str1, str2, options = {}) {
  const { prefixScale = 0.1, prefixLength = 4 } = options;

  if (!str1 || !str2) return 0;
  if (str1 === str2) return 1;

  const jaroSim = jaro(str1, str2);

  // Calculate common prefix length (up to prefixLength characters)
  let prefix = 0;
  const minLen = Math.min(str1.length, str2.length, prefixLength);
  for (let i = 0; i < minLen; i++) {
    if (str1[i] === str2[i]) {
      prefix++;
    } else {
      break;
    }
  }

  // Apply Winkler modification
  return jaroSim + (prefix * prefixScale * (1 - jaroSim));
}

/**
 * Generate Soundex phonetic code for a string
 * @param {string} str - Input string
 * @returns {string} 4-character Soundex code
 */
function soundex(str) {
  if (!str) return '0000';

  const s = str.toUpperCase().replace(/[^A-Z]/g, '');
  if (!s) return '0000';

  const codes = {
    B: '1', F: '1', P: '1', V: '1',
    C: '2', G: '2', J: '2', K: '2', Q: '2', S: '2', X: '2', Z: '2',
    D: '3', T: '3',
    L: '4',
    M: '5', N: '5',
    R: '6'
  };

  let result = s[0];
  let prevCode = codes[s[0]] || '0';

  for (let i = 1; i < s.length && result.length < 4; i++) {
    const code = codes[s[i]] || '0';
    if (code !== '0' && code !== prevCode) {
      result += code;
    }
    prevCode = code;
  }

  return result.padEnd(4, '0');
}

/**
 * Generate Double Metaphone phonetic codes for a string
 * Returns both primary and alternate encodings
 * @param {string} str - Input string
 * @returns {Object} Object with primary and alternate codes
 */
function doubleMetaphone(str) {
  if (!str) return { primary: '', alternate: '' };

  const word = str.toUpperCase().replace(/[^A-Z]/g, '');
  if (!word) return { primary: '', alternate: '' };

  let primary = '';
  let alternate = '';
  let index = 0;
  const length = word.length;
  const last = length - 1;

  // Helper functions
  const charAt = (i) => (i >= 0 && i < length) ? word[i] : '';
  const stringAt = (start, len, ...strings) => {
    const sub = word.slice(start, start + len);
    return strings.includes(sub);
  };

  // Skip initial sounds in some cases
  if (stringAt(0, 2, 'GN', 'KN', 'PN', 'WR', 'PS')) {
    index++;
  }

  // Handle initial X
  if (charAt(0) === 'X') {
    primary += 'S';
    alternate += 'S';
    index++;
  }

  // Main encoding loop (simplified version)
  while (index < length && (primary.length < 4 || alternate.length < 4)) {
    const char = charAt(index);

    switch (char) {
      case 'A':
      case 'E':
      case 'I':
      case 'O':
      case 'U':
      case 'Y':
        if (index === 0) {
          primary += 'A';
          alternate += 'A';
        }
        index++;
        break;

      case 'B':
        primary += 'P';
        alternate += 'P';
        index += charAt(index + 1) === 'B' ? 2 : 1;
        break;

      case 'C':
        if (stringAt(index, 2, 'CH')) {
          primary += 'X';
          alternate += 'X';
          index += 2;
        } else if (stringAt(index, 2, 'CI', 'CE', 'CY')) {
          primary += 'S';
          alternate += 'S';
          index += 1;
        } else {
          primary += 'K';
          alternate += 'K';
          index += stringAt(index, 2, 'CC', 'CK', 'CQ') ? 2 : 1;
        }
        break;

      case 'D':
        if (stringAt(index, 2, 'DG')) {
          if (stringAt(index + 2, 1, 'I', 'E', 'Y')) {
            primary += 'J';
            alternate += 'J';
            index += 3;
          } else {
            primary += 'TK';
            alternate += 'TK';
            index += 2;
          }
        } else {
          primary += 'T';
          alternate += 'T';
          index += stringAt(index, 2, 'DT', 'DD') ? 2 : 1;
        }
        break;

      case 'F':
        primary += 'F';
        alternate += 'F';
        index += charAt(index + 1) === 'F' ? 2 : 1;
        break;

      case 'G':
        if (charAt(index + 1) === 'H') {
          if (index > 0 && !'AEIOU'.includes(charAt(index - 1))) {
            index += 2;
          } else {
            primary += 'K';
            alternate += 'K';
            index += 2;
          }
        } else if (stringAt(index, 2, 'GN')) {
          primary += 'N';
          alternate += 'KN';
          index += 2;
        } else if (stringAt(index + 1, 1, 'I', 'E', 'Y')) {
          primary += 'J';
          alternate += 'K';
          index += 2;
        } else {
          primary += 'K';
          alternate += 'K';
          index += charAt(index + 1) === 'G' ? 2 : 1;
        }
        break;

      case 'H':
        if ('AEIOU'.includes(charAt(index + 1)) && (index === 0 || 'AEIOU'.includes(charAt(index - 1)))) {
          primary += 'H';
          alternate += 'H';
          index += 2;
        } else {
          index++;
        }
        break;

      case 'J':
        primary += 'J';
        alternate += 'J';
        index += charAt(index + 1) === 'J' ? 2 : 1;
        break;

      case 'K':
        primary += 'K';
        alternate += 'K';
        index += charAt(index + 1) === 'K' ? 2 : 1;
        break;

      case 'L':
        primary += 'L';
        alternate += 'L';
        index += charAt(index + 1) === 'L' ? 2 : 1;
        break;

      case 'M':
        primary += 'M';
        alternate += 'M';
        index += charAt(index + 1) === 'M' ? 2 : 1;
        break;

      case 'N':
        primary += 'N';
        alternate += 'N';
        index += charAt(index + 1) === 'N' ? 2 : 1;
        break;

      case 'P':
        if (charAt(index + 1) === 'H') {
          primary += 'F';
          alternate += 'F';
          index += 2;
        } else {
          primary += 'P';
          alternate += 'P';
          index += stringAt(index, 2, 'PP', 'PB') ? 2 : 1;
        }
        break;

      case 'Q':
        primary += 'K';
        alternate += 'K';
        index += charAt(index + 1) === 'Q' ? 2 : 1;
        break;

      case 'R':
        primary += 'R';
        alternate += 'R';
        index += charAt(index + 1) === 'R' ? 2 : 1;
        break;

      case 'S':
        if (stringAt(index, 2, 'SH')) {
          primary += 'X';
          alternate += 'X';
          index += 2;
        } else if (stringAt(index, 3, 'SIO', 'SIA')) {
          primary += 'X';
          alternate += 'S';
          index += 3;
        } else {
          primary += 'S';
          alternate += 'S';
          index += stringAt(index, 2, 'SS', 'SC') ? 2 : 1;
        }
        break;

      case 'T':
        if (stringAt(index, 2, 'TH')) {
          primary += '0';
          alternate += 'T';
          index += 2;
        } else if (stringAt(index, 3, 'TIO', 'TIA')) {
          primary += 'X';
          alternate += 'X';
          index += 3;
        } else {
          primary += 'T';
          alternate += 'T';
          index += stringAt(index, 2, 'TT', 'TD') ? 2 : 1;
        }
        break;

      case 'V':
        primary += 'F';
        alternate += 'F';
        index += charAt(index + 1) === 'V' ? 2 : 1;
        break;

      case 'W':
        if (charAt(index + 1) === 'R') {
          primary += 'R';
          alternate += 'R';
          index += 2;
        } else if (index === 0 && 'AEIOU'.includes(charAt(index + 1))) {
          primary += 'A';
          alternate += 'F';
          index++;
        } else {
          index++;
        }
        break;

      case 'X':
        primary += 'KS';
        alternate += 'KS';
        index += stringAt(index, 2, 'XX') ? 2 : 1;
        break;

      case 'Z':
        primary += 'S';
        alternate += 'S';
        index += charAt(index + 1) === 'Z' ? 2 : 1;
        break;

      default:
        index++;
    }
  }

  return {
    primary: primary.slice(0, 4),
    alternate: alternate.slice(0, 4)
  };
}

/**
 * Calculate Dice coefficient (bigram similarity) between two strings
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Dice coefficient (0-1)
 */
function diceCoefficient(str1, str2) {
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 1;

  if (str1.length < 2 || str2.length < 2) {
    return str1 === str2 ? 1 : 0;
  }

  // Generate bigrams
  const bigrams1 = new Set();
  const bigrams2 = new Set();

  for (let i = 0; i < str1.length - 1; i++) {
    bigrams1.add(str1.slice(i, i + 2).toLowerCase());
  }
  for (let i = 0; i < str2.length - 1; i++) {
    bigrams2.add(str2.slice(i, i + 2).toLowerCase());
  }

  // Count intersection
  let intersection = 0;
  for (const bigram of bigrams1) {
    if (bigrams2.has(bigram)) {
      intersection++;
    }
  }

  return (2 * intersection) / (bigrams1.size + bigrams2.size);
}

/**
 * Calculate N-gram similarity between two strings
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @param {number} [n=2] - N-gram size
 * @returns {number} N-gram similarity (0-1)
 */
function ngramSimilarity(str1, str2, n = 2) {
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 1;

  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();

  if (s1.length < n || s2.length < n) {
    return s1 === s2 ? 1 : 0;
  }

  const ngrams1 = new Map();
  const ngrams2 = new Map();

  // Generate n-grams with counts
  for (let i = 0; i <= s1.length - n; i++) {
    const gram = s1.slice(i, i + n);
    ngrams1.set(gram, (ngrams1.get(gram) || 0) + 1);
  }
  for (let i = 0; i <= s2.length - n; i++) {
    const gram = s2.slice(i, i + n);
    ngrams2.set(gram, (ngrams2.get(gram) || 0) + 1);
  }

  // Calculate intersection
  let intersection = 0;
  for (const [gram, count] of ngrams1) {
    if (ngrams2.has(gram)) {
      intersection += Math.min(count, ngrams2.get(gram));
    }
  }

  const total1 = Array.from(ngrams1.values()).reduce((a, b) => a + b, 0);
  const total2 = Array.from(ngrams2.values()).reduce((a, b) => a + b, 0);

  return (2 * intersection) / (total1 + total2);
}

/**
 * Calculate longest common subsequence length
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Length of longest common subsequence
 */
function longestCommonSubsequence(str1, str2) {
  if (!str1 || !str2) return 0;

  const len1 = str1.length;
  const len2 = str2.length;

  // Use two-row optimization
  let prevRow = Array(len2 + 1).fill(0);
  let currRow = Array(len2 + 1).fill(0);

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        currRow[j] = prevRow[j - 1] + 1;
      } else {
        currRow[j] = Math.max(prevRow[j], currRow[j - 1]);
      }
    }
    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[len2];
}

/**
 * Calculate LCS-based similarity
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} LCS similarity (0-1)
 */
function lcsSimilarity(str1, str2) {
  if (!str1 && !str2) return 1;
  if (!str1 || !str2) return 0;

  const lcs = longestCommonSubsequence(str1, str2);
  return (2 * lcs) / (str1.length + str2.length);
}

/**
 * Calculate a composite similarity score using multiple algorithms
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @param {Object} [options] - Configuration options
 * @param {Object} [options.weights] - Weights for each algorithm
 * @returns {Object} Composite score with individual algorithm scores
 */
function compositeSimilarity(str1, str2, options = {}) {
  const weights = {
    jaroWinkler: 0.35,
    levenshtein: 0.25,
    dice: 0.20,
    phonetic: 0.20,
    ...options.weights
  };

  const s1 = (str1 || '').toLowerCase().trim();
  const s2 = (str2 || '').toLowerCase().trim();

  // Calculate individual scores
  const scores = {
    jaroWinkler: jaroWinkler(s1, s2),
    levenshtein: levenshteinSimilarity(s1, s2),
    dice: diceCoefficient(s1, s2),
    phonetic: 0
  };

  // Phonetic similarity (average of soundex and metaphone match)
  const soundexMatch = soundex(s1) === soundex(s2) ? 1 : 0;
  const meta1 = doubleMetaphone(s1);
  const meta2 = doubleMetaphone(s2);
  const metaphoneMatch = (
    (meta1.primary === meta2.primary ? 1 : 0) +
    (meta1.alternate === meta2.alternate ? 0.5 : 0) +
    (meta1.primary === meta2.alternate ? 0.5 : 0) +
    (meta1.alternate === meta2.primary ? 0.5 : 0)
  ) / 3;
  scores.phonetic = (soundexMatch + metaphoneMatch) / 2;

  // Calculate weighted composite
  let composite = 0;
  let totalWeight = 0;
  for (const [algo, weight] of Object.entries(weights)) {
    if (scores[algo] !== undefined) {
      composite += scores[algo] * weight;
      totalWeight += weight;
    }
  }
  scores.composite = totalWeight > 0 ? composite / totalWeight : 0;

  return scores;
}

/**
 * Check if two strings are phonetically similar
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {boolean}
 */
function isPhoneticMatch(str1, str2) {
  if (!str1 || !str2) return false;
  if (str1 === str2) return true;

  // Check Soundex
  if (soundex(str1) === soundex(str2)) return true;

  // Check Double Metaphone
  const meta1 = doubleMetaphone(str1);
  const meta2 = doubleMetaphone(str2);

  return (
    meta1.primary === meta2.primary ||
    meta1.primary === meta2.alternate ||
    meta1.alternate === meta2.primary ||
    meta1.alternate === meta2.alternate
  );
}

/**
 * Normalize a string for comparison (lowercase, remove punctuation, collapse whitespace)
 * @param {string} str - Input string
 * @returns {string} Normalized string
 */
function normalizeForComparison(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate token-based similarity (good for company names)
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Token similarity (0-1)
 */
function tokenSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;

  const tokens1 = new Set(normalizeForComparison(str1).split(' ').filter(t => t.length > 1));
  const tokens2 = new Set(normalizeForComparison(str2).split(' ').filter(t => t.length > 1));

  if (tokens1.size === 0 && tokens2.size === 0) return 1;
  if (tokens1.size === 0 || tokens2.size === 0) return 0;

  let intersection = 0;
  for (const token of tokens1) {
    if (tokens2.has(token)) {
      intersection++;
    }
  }

  // Jaccard similarity
  const union = tokens1.size + tokens2.size - intersection;
  return union > 0 ? intersection / union : 0;
}

module.exports = {
  // Distance/similarity functions
  levenshtein,
  levenshteinSimilarity,
  jaro,
  jaroWinkler,
  diceCoefficient,
  ngramSimilarity,
  longestCommonSubsequence,
  lcsSimilarity,
  tokenSimilarity,
  compositeSimilarity,

  // Phonetic functions
  soundex,
  doubleMetaphone,
  isPhoneticMatch,

  // Utility functions
  normalizeForComparison
};
