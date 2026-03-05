#!/usr/bin/env node
/**
 * Response Synthesizer
 *
 * Synthesizes Claude and Gemini responses into a unified comparison.
 * Identifies agreement points, differences, and generates recommendations.
 *
 * @module response-synthesizer
 * @version 1.0.0
 */

/**
 * Main synthesis function - combines Claude and Gemini perspectives
 * @param {object} params - Synthesis parameters
 * @param {string} params.question - Original question/prompt
 * @param {string} params.claudePerspective - Claude's response
 * @param {object} params.geminiResponse - Parsed Gemini response
 * @param {object} [params.context] - Additional context (files, domain, etc.)
 * @returns {object} - Synthesized comparison
 */
function synthesizeResponses(params) {
  const {
    question,
    claudePerspective,
    geminiResponse,
    context = {}
  } = params;

  // Extract Gemini content
  const geminiContent = extractGeminiContent(geminiResponse);

  // Analyze the responses
  const analysis = analyzeResponses(claudePerspective, geminiContent);

  // Generate synthesis
  return {
    summary: {
      question: question,
      overallAlignment: analysis.alignmentScore,
      keyAgreements: analysis.agreements,
      keyDifferences: analysis.differences,
      recommendation: generateRecommendation(analysis)
    },
    perspectives: {
      claude: {
        content: claudePerspective,
        keyPoints: extractKeyPoints(claudePerspective)
      },
      gemini: {
        content: geminiContent,
        keyPoints: extractKeyPoints(geminiContent),
        model: geminiResponse.data?.modelVersion || 'gemini-2.5-pro'
      }
    },
    metadata: {
      synthesizedAt: new Date().toISOString(),
      context: context,
      analysisVersion: '1.0.0'
    }
  };
}

/**
 * Extract content from Gemini response object
 * @param {object} geminiResponse - Raw Gemini response
 * @returns {string} - Extracted text content
 */
function extractGeminiContent(geminiResponse) {
  // Handle null/undefined
  if (!geminiResponse) {
    return '';
  }

  // Handle different response structures
  if (typeof geminiResponse === 'string') {
    return geminiResponse;
  }

  // Handle our invoker's output format: { success, content, data: { response } }
  if (geminiResponse.content) {
    return geminiResponse.content;
  }

  // Handle direct CLI format: { response: "..." }
  if (geminiResponse.response) {
    return geminiResponse.response;
  }

  // Handle nested data from invoker
  if (geminiResponse.data) {
    // CLI format within data
    if (geminiResponse.data.response) {
      return geminiResponse.data.response;
    }
    // API format
    if (geminiResponse.data.candidates && geminiResponse.data.candidates[0]) {
      const candidate = geminiResponse.data.candidates[0];
      if (candidate.content && candidate.content.parts) {
        return candidate.content.parts.map(p => p.text || '').join('');
      }
    }
    if (geminiResponse.data.text) {
      return geminiResponse.data.text;
    }
  }

  if (geminiResponse.raw) {
    return geminiResponse.raw;
  }

  return JSON.stringify(geminiResponse);
}

/**
 * Analyze two responses for agreement and differences
 * @param {string} text1 - First response (Claude)
 * @param {string} text2 - Second response (Gemini)
 * @returns {object} - Analysis results
 */
function analyzeResponses(text1, text2) {
  const points1 = extractKeyPoints(text1);
  const points2 = extractKeyPoints(text2);

  const agreements = findAgreements(points1, points2);
  const differences = findDifferences(points1, points2);

  // Calculate alignment score using multiple strategies
  let alignmentScore;

  // Strategy 1: Point-based alignment (when we have structured points)
  const totalPoints = points1.length + points2.length;
  const pointBasedScore = totalPoints > 0
    ? Math.round((agreements.length * 2 / totalPoints) * 100)
    : 50;

  // Strategy 2: Full-text similarity (always calculated)
  const fullTextSimilarity = calculateSimilarity(text1, text2);
  const fullTextScore = Math.round(fullTextSimilarity * 100);

  // Strategy 3: Key concept overlap
  const concepts1 = extractKeyConcepts(text1);
  const concepts2 = extractKeyConcepts(text2);
  const conceptScore = concepts1.size > 0 || concepts2.size > 0
    ? Math.round(jaccardSimilarity(concepts1, concepts2) * 100)
    : fullTextScore;

  // Combine scores based on what data we have
  if (totalPoints >= 6 && agreements.length >= 2) {
    // Good structured data with actual matches - weight points more
    alignmentScore = Math.round(
      (pointBasedScore * 0.45) +
      (fullTextScore * 0.30) +
      (conceptScore * 0.25)
    );
  } else if (totalPoints >= 4 && agreements.length >= 1) {
    // Moderate structure with some matches
    alignmentScore = Math.round(
      (pointBasedScore * 0.30) +
      (fullTextScore * 0.40) +
      (conceptScore * 0.30)
    );
  } else {
    // Short responses or no point matches - rely on text and concepts
    // This handles most real-world AI comparison scenarios
    alignmentScore = Math.round(
      (fullTextScore * 0.50) +
      (conceptScore * 0.50)
    );
  }

  // Ensure score is in valid range
  alignmentScore = Math.max(0, Math.min(100, alignmentScore));

  return {
    agreements,
    differences,
    alignmentScore,
    claudePoints: points1,
    geminiPoints: points2,
    debug: {
      pointBasedScore,
      fullTextScore,
      conceptScore,
      totalPoints
    }
  };
}

/**
 * Extract key points from text response
 * @param {string} text - Response text
 * @returns {string[]} - Array of key points
 */
function extractKeyPoints(text) {
  if (!text) return [];

  const points = [];

  // Look for bullet points
  const bulletMatches = text.match(/^[\s]*[-*•]\s+(.+)$/gm);
  if (bulletMatches) {
    points.push(...bulletMatches.map(m => m.replace(/^[\s]*[-*•]\s+/, '').trim()));
  }

  // Look for numbered items
  const numberedMatches = text.match(/^[\s]*\d+[.)]\s+(.+)$/gm);
  if (numberedMatches) {
    points.push(...numberedMatches.map(m => m.replace(/^[\s]*\d+[.)]\s+/, '').trim()));
  }

  // Look for headers as key points
  const headerMatches = text.match(/^#+\s+(.+)$/gm);
  if (headerMatches) {
    points.push(...headerMatches.map(m => m.replace(/^#+\s+/, '').trim()));
  }

  // If no structured points found, extract sentences that look like key statements
  if (points.length === 0) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
    // Take first 5 meaningful sentences
    points.push(...sentences.slice(0, 5).map(s => s.trim()));
  }

  // Deduplicate and limit
  return [...new Set(points)].slice(0, 10);
}

/**
 * Find agreement points between two sets of key points
 * Uses adaptive thresholds based on concept overlap
 * @param {string[]} points1 - First set of points
 * @param {string[]} points2 - Second set of points
 * @returns {string[]} - Agreement points
 */
function findAgreements(points1, points2) {
  const agreements = [];
  const usedP2 = new Set();  // Track which p2 points are already matched

  for (const p1 of points1) {
    let bestMatch = null;
    let bestSimilarity = 0;

    for (const p2 of points2) {
      if (usedP2.has(p2)) continue;  // Skip already matched points

      // Calculate text similarity
      const textSimilarity = calculateSimilarity(p1.toLowerCase(), p2.toLowerCase());

      // Calculate concept overlap for adaptive threshold
      const concepts1 = extractKeyConcepts(p1);
      const concepts2 = extractKeyConcepts(p2);
      const conceptOverlap = concepts1.size > 0 && concepts2.size > 0
        ? jaccardSimilarity(concepts1, concepts2)
        : 0;

      // Adaptive threshold: lower if concepts overlap significantly
      // If both mention same technical concepts, we're more lenient on exact wording
      let threshold = 0.50;  // Default threshold
      if (conceptOverlap >= 0.5) {
        threshold = 0.30;  // Strong concept match - lower text threshold
      } else if (conceptOverlap >= 0.25) {
        threshold = 0.40;  // Moderate concept match
      }

      // Combined score favoring concept matches
      const combinedScore = (textSimilarity * 0.6) + (conceptOverlap * 0.4);

      if (textSimilarity > threshold || combinedScore > 0.45) {
        if (combinedScore > bestSimilarity) {
          bestSimilarity = combinedScore;
          bestMatch = { p2, textSimilarity, conceptOverlap, combinedScore };
        }
      }
    }

    if (bestMatch) {
      agreements.push({
        point: p1,
        similarity: Math.round(bestMatch.combinedScore * 100),
        matchedWith: bestMatch.p2
      });
      usedP2.add(bestMatch.p2);
    }
  }

  // Convert to simple strings for output
  return agreements.map(a => a.point);
}

/**
 * Find differences between two sets of key points
 * Uses same adaptive threshold logic as findAgreements
 * @param {string[]} points1 - First set of points (Claude)
 * @param {string[]} points2 - Second set of points (Gemini)
 * @returns {object[]} - Difference objects
 */
function findDifferences(points1, points2) {
  const differences = [];

  // Helper to check if a point has a match using adaptive threshold
  function hasAdaptiveMatch(point, otherPoints) {
    for (const other of otherPoints) {
      const textSimilarity = calculateSimilarity(point.toLowerCase(), other.toLowerCase());

      const concepts1 = extractKeyConcepts(point);
      const concepts2 = extractKeyConcepts(other);
      const conceptOverlap = concepts1.size > 0 && concepts2.size > 0
        ? jaccardSimilarity(concepts1, concepts2)
        : 0;

      let threshold = 0.50;
      if (conceptOverlap >= 0.5) threshold = 0.30;
      else if (conceptOverlap >= 0.25) threshold = 0.40;

      const combinedScore = (textSimilarity * 0.6) + (conceptOverlap * 0.4);

      if (textSimilarity > threshold || combinedScore > 0.45) {
        return true;
      }
    }
    return false;
  }

  // Points unique to Claude
  for (const p1 of points1) {
    if (!hasAdaptiveMatch(p1, points2)) {
      differences.push({
        source: 'Claude',
        point: p1,
        type: 'unique'
      });
    }
  }

  // Points unique to Gemini
  for (const p2 of points2) {
    if (!hasAdaptiveMatch(p2, points1)) {
      differences.push({
        source: 'Gemini',
        point: p2,
        type: 'unique'
      });
    }
  }

  return differences;
}

/**
 * Normalize text for comparison
 * - Lowercase
 * - Remove punctuation
 * - Basic stemming for common suffixes
 * @param {string} text - Text to normalize
 * @returns {string} - Normalized text
 */
function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')  // Remove punctuation
    .replace(/\s+/g, ' ')       // Normalize whitespace
    .trim();
}

/**
 * Basic stemming - remove common suffixes
 * @param {string} word - Word to stem
 * @returns {string} - Stemmed word
 */
function basicStem(word) {
  if (word.length < 4) return word;

  // Common suffix patterns
  const suffixes = [
    'ing', 'ed', 'er', 'est', 'ly', 'tion', 'sion',
    'ment', 'ness', 'able', 'ible', 'ful', 'less', 'ous', 's'
  ];

  for (const suffix of suffixes) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) {
      return word.slice(0, -suffix.length);
    }
  }
  return word;
}

/**
 * Extract meaningful tokens from text
 * @param {string} text - Text to tokenize
 * @param {boolean} stem - Whether to apply stemming
 * @returns {string[]} - Array of tokens
 */
function extractTokens(text, stem = true) {
  const normalized = normalizeText(text);
  const words = normalized.split(/\s+/).filter(w => w.length >= 2);

  // Common stop words to filter
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those', 'it',
    'its', 'you', 'your', 'we', 'our', 'they', 'their', 'i', 'my', 'me'
  ]);

  return words
    .filter(w => !stopWords.has(w))
    .map(w => stem ? basicStem(w) : w);
}

/**
 * Generate n-grams from tokens
 * @param {string[]} tokens - Array of tokens
 * @param {number} n - N-gram size
 * @returns {Set<string>} - Set of n-grams
 */
function generateNgrams(tokens, n) {
  const ngrams = new Set();
  for (let i = 0; i <= tokens.length - n; i++) {
    ngrams.add(tokens.slice(i, i + n).join(' '));
  }
  return ngrams;
}

/**
 * Calculate Jaccard similarity between two sets
 * @param {Set} set1 - First set
 * @param {Set} set2 - Second set
 * @returns {number} - Similarity score (0-1)
 */
function jaccardSimilarity(set1, set2) {
  if (set1.size === 0 && set2.size === 0) return 1;
  if (set1.size === 0 || set2.size === 0) return 0;

  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  return intersection.size / union.size;
}

/**
 * Extract key concepts (technical terms, numbers, proper patterns)
 * @param {string} text - Text to analyze
 * @returns {Set<string>} - Set of key concepts
 */
function extractKeyConcepts(text) {
  const concepts = new Set();
  // Normalize: lowercase and convert hyphens to spaces for better matching
  const normalized = text.toLowerCase().replace(/-/g, ' ');

  // Technical terms and patterns
  const techPatterns = [
    /\bredis\b/gi, /\bcach(?:e|ing|ed)?\b/gi, /\bttl\b/gi, /\btimeout\b/gi,
    /\bapi\b/gi, /\bdatabase\b/gi, /\bsql\b/gi, /\bjson\b/gi,
    /\bhttp[s]?\b/gi, /\brest\b/gi, /\bgraphql\b/gi,
    /\baws\b/gi, /\bazure\b/gi, /\bgcp\b/gi, /\bkubernetes\b/gi,
    /\bdocker\b/gi, /\bmicroservic\w*/gi, /\bmonolith\w*/gi,
    /\basync\w*/gi, /\bsync\w*/gi, /\bqueue\b/gi,
    /\bindex\w*/gi, /\bquery\w*/gi, /\boptimiz\w*/gi,
    /\bscal\w*/gi, /\bperform\w*/gi, /\blatenc\w*/gi,
    /\bjwt\b/gi, /\btoken\w*/gi, /\bauth\w*/gi, /\bsession\w*/gi,
    /\bserver\b/gi, /\bclient\b/gi, /\brefresh\b/gi, /\bexpir\w*/gi,
    /\b\d+\s*(?:hour|minute|second|day|week|month|year|ms|mb|gb|kb|tb)s?\b/gi,  // Time/size units
    /\b\d+%/g  // Percentages
  ];

  for (const pattern of techPatterns) {
    const matches = normalized.match(pattern);
    if (matches) {
      matches.forEach(m => {
        // Normalize the concept: remove extra spaces, stem
        const cleaned = m.toLowerCase().replace(/\s+/g, ' ').trim();
        // For time units, normalize to base form (e.g., "1 hour" and "1 hours" -> "1 hour")
        const normalizedConcept = cleaned.replace(/(\d+)\s*(hour|minute|second|day|week|month|year)s?/i, '$1 $2');
        concepts.add(normalizedConcept);
      });
    }
  }

  return concepts;
}

/**
 * Calculate multi-strategy similarity between two strings
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} - Similarity score (0-1)
 */
function calculateSimilarity(str1, str2) {
  // Handle empty strings
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 1;

  // Strategy 1: Word-level Jaccard (with stemming)
  const tokens1 = extractTokens(str1);
  const tokens2 = extractTokens(str2);
  const wordSim = jaccardSimilarity(new Set(tokens1), new Set(tokens2));

  // Strategy 2: Bigram overlap
  const bigrams1 = generateNgrams(tokens1, 2);
  const bigrams2 = generateNgrams(tokens2, 2);
  const bigramSim = jaccardSimilarity(bigrams1, bigrams2);

  // Strategy 3: Key concept matching (high weight)
  const concepts1 = extractKeyConcepts(str1);
  const concepts2 = extractKeyConcepts(str2);
  const conceptSim = concepts1.size > 0 || concepts2.size > 0
    ? jaccardSimilarity(concepts1, concepts2)
    : wordSim;  // Fall back to word similarity if no concepts

  // Strategy 4: Length-normalized character overlap (for short texts)
  const charSim = calculateCharOverlap(str1, str2);

  // Weighted combination
  // Concepts are most important, then words, then bigrams, then char overlap
  const weights = {
    concept: 0.35,
    word: 0.30,
    bigram: 0.20,
    char: 0.15
  };

  const combined =
    (conceptSim * weights.concept) +
    (wordSim * weights.word) +
    (bigramSim * weights.bigram) +
    (charSim * weights.char);

  return Math.min(1, combined);
}

/**
 * Calculate character-level overlap (for catching similar short phrases)
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} - Similarity score (0-1)
 */
function calculateCharOverlap(str1, str2) {
  const s1 = normalizeText(str1);
  const s2 = normalizeText(str2);

  // Generate character trigrams
  const trigrams1 = new Set();
  const trigrams2 = new Set();

  for (let i = 0; i <= s1.length - 3; i++) {
    trigrams1.add(s1.slice(i, i + 3));
  }
  for (let i = 0; i <= s2.length - 3; i++) {
    trigrams2.add(s2.slice(i, i + 3));
  }

  return jaccardSimilarity(trigrams1, trigrams2);
}

/**
 * Generate a recommendation based on analysis
 * @param {object} analysis - Analysis results
 * @returns {string} - Recommendation text
 */
function generateRecommendation(analysis) {
  const { alignmentScore, agreements, differences } = analysis;

  if (alignmentScore >= 80) {
    return `Strong agreement (${alignmentScore}%). Both models converge on the same key points. ` +
      `Confidence is high in the shared recommendations.`;
  }

  if (alignmentScore >= 50) {
    return `Moderate agreement (${alignmentScore}%). Models agree on core aspects but offer ` +
      `complementary perspectives. Consider combining insights from both for a comprehensive approach.`;
  }

  if (alignmentScore >= 30) {
    return `Partial agreement (${alignmentScore}%). Significant differences exist. ` +
      `Review unique insights from each model - Claude emphasizes ` +
      `${summarizeDifferences(differences, 'Claude')}, while Gemini focuses on ` +
      `${summarizeDifferences(differences, 'Gemini')}.`;
  }

  return `Low agreement (${alignmentScore}%). Models provide divergent perspectives. ` +
    `This may indicate the question has multiple valid approaches or requires clarification. ` +
    `Consider both viewpoints and select based on your specific context.`;
}

/**
 * Summarize differences from a specific source
 * @param {object[]} differences - Difference array
 * @param {string} source - Source to filter ('Claude' or 'Gemini')
 * @returns {string} - Summary string
 */
function summarizeDifferences(differences, source) {
  const sourceDiffs = differences.filter(d => d.source === source);
  if (sourceDiffs.length === 0) return 'similar points';

  // Take first 2 unique points
  const points = sourceDiffs.slice(0, 2).map(d => {
    // Truncate long points
    const point = d.point.length > 50 ? d.point.substring(0, 47) + '...' : d.point;
    return point;
  });

  return points.join(', ');
}

/**
 * Format synthesis for display
 * @param {object} synthesis - Synthesized response
 * @returns {string} - Formatted markdown
 */
function formatSynthesis(synthesis) {
  const { summary, perspectives, metadata } = synthesis;

  let output = `# Cross-Model Consultation Results\n\n`;
  output += `**Question:** ${summary.question}\n\n`;
  output += `**Overall Alignment:** ${summary.overallAlignment}%\n\n`;

  output += `## Recommendation\n\n`;
  output += `${summary.recommendation}\n\n`;

  if (summary.keyAgreements.length > 0) {
    output += `## Agreement Points\n\n`;
    summary.keyAgreements.forEach(point => {
      output += `- ${point}\n`;
    });
    output += `\n`;
  }

  if (summary.keyDifferences.length > 0) {
    output += `## Key Differences\n\n`;
    summary.keyDifferences.forEach(diff => {
      output += `- **${diff.source}:** ${diff.point}\n`;
    });
    output += `\n`;
  }

  output += `## Claude's Perspective\n\n`;
  output += `${perspectives.claude.content}\n\n`;

  output += `## Gemini's Perspective\n\n`;
  output += `*Model: ${perspectives.gemini.model}*\n\n`;
  output += `${perspectives.gemini.content}\n\n`;

  output += `---\n`;
  output += `*Synthesized at: ${metadata.synthesizedAt}*\n`;

  return output;
}

// Export functions
module.exports = {
  synthesizeResponses,
  extractKeyPoints,
  analyzeResponses,
  formatSynthesis,
  calculateSimilarity
};

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.length === 0) {
    console.log(`
Response Synthesizer

Usage:
  node response-synthesizer.js --claude "..." --gemini "..." --question "..."

Options:
  --claude TEXT      Claude's response
  --gemini TEXT      Gemini's response (or JSON)
  --question TEXT    Original question
  --format FORMAT    Output format (json, markdown)

Example:
  node response-synthesizer.js \\
    --question "How should I implement caching?" \\
    --claude "Use Redis for distributed caching..." \\
    --gemini "Consider in-memory caching first..."
`);
    process.exit(0);
  }

  // Parse arguments
  const getArg = (name) => {
    const idx = args.indexOf(`--${name}`);
    return idx !== -1 ? args[idx + 1] : null;
  };

  const question = getArg('question') || 'Consultation request';
  const claudeText = getArg('claude');
  const geminiText = getArg('gemini');
  const format = getArg('format') || 'markdown';

  if (!claudeText || !geminiText) {
    console.error('Error: --claude and --gemini are required');
    process.exit(1);
  }

  // Parse gemini as JSON if possible
  let geminiResponse;
  try {
    geminiResponse = JSON.parse(geminiText);
  } catch {
    geminiResponse = { content: geminiText };
  }

  // Synthesize
  const synthesis = synthesizeResponses({
    question,
    claudePerspective: claudeText,
    geminiResponse,
    context: { source: 'cli' }
  });

  // Output
  if (format === 'json') {
    console.log(JSON.stringify(synthesis, null, 2));
  } else {
    console.log(formatSynthesis(synthesis));
  }
}
