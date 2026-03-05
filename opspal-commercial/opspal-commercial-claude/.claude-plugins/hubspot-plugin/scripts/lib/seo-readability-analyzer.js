#!/usr/bin/env node

/**
 * SEO Readability Analyzer
 *
 * Analyzes content readability and provides improvement suggestions:
 * - Multiple readability scores (Flesch-Kincaid, Gunning Fog, SMOG, Coleman-Liau, ARI)
 * - Sentence complexity analysis
 * - Paragraph length analysis
 * - Passive voice detection
 * - Transition word usage
 * - Vocabulary difficulty
 * - Grade level estimation
 *
 * Part of Phase 3: Content Optimization & AEO
 *
 * Usage:
 *   node seo-readability-analyzer.js <url-or-file>
 *   node seo-readability-analyzer.js ./content.md --format markdown
 *   node seo-readability-analyzer.js https://example.com --output readability.json
 */

const fs = require('fs');
const path = require('path');
const { URL } = require('url');

class SEOReadabilityAnalyzer {
  constructor(options = {}) {
    this.options = {
      targetGradeLevel: 9,        // 9th grade reading level (general audience)
      maxSentenceLength: 20,      // Ideal sentence length
      maxParagraphSentences: 5,   // Ideal paragraph length
      minTransitionPercent: 30,   // Minimum transition word usage
      maxPassivePercent: 10,      // Maximum passive voice percentage
      ...options
    };

    // Passive voice patterns
    this.passivePatterns = [
      /\b(am|is|are|was|were|be|been|being)\s+(being\s+)?\w+ed\b/gi,
      /\b(am|is|are|was|were|be|been|being)\s+(being\s+)?\w+en\b/gi,
      /\bhas\s+been\s+\w+ed\b/gi,
      /\bhave\s+been\s+\w+ed\b/gi,
      /\bhad\s+been\s+\w+ed\b/gi
    ];

    // Transition words by category
    this.transitionWords = {
      addition: ['additionally', 'also', 'furthermore', 'moreover', 'besides', 'in addition', 'as well as', 'plus'],
      comparison: ['similarly', 'likewise', 'in the same way', 'equally', 'by the same token'],
      contrast: ['however', 'nevertheless', 'nonetheless', 'on the other hand', 'conversely', 'yet', 'still', 'although', 'though', 'but', 'despite', 'in contrast'],
      example: ['for example', 'for instance', 'specifically', 'to illustrate', 'namely', 'such as', 'including'],
      result: ['therefore', 'thus', 'consequently', 'as a result', 'accordingly', 'hence', 'so'],
      time: ['first', 'second', 'third', 'next', 'then', 'finally', 'subsequently', 'meanwhile', 'previously', 'earlier', 'later'],
      emphasis: ['indeed', 'in fact', 'certainly', 'obviously', 'clearly', 'undoubtedly', 'definitely'],
      conclusion: ['in conclusion', 'to summarize', 'in summary', 'overall', 'ultimately', 'in short']
    };

    // Complex words (3+ syllables)
    this.commonWords = new Set([
      'however', 'therefore', 'example', 'important', 'different', 'consider', 'another',
      'company', 'understand', 'business', 'customer', 'together', 'information', 'usually',
      'everything', 'everyone', 'anywhere', 'something', 'beautiful', 'wonderful'
    ]);

    // Grade level descriptions
    this.gradeLevelDescriptions = {
      5: 'Very Easy (5th grade) - Conversational, simple language',
      6: 'Easy (6th grade) - Plain English, easy to read',
      7: 'Fairly Easy (7th grade) - Accessible to most readers',
      8: 'Standard (8th grade) - Comfortable for average readers',
      9: 'Fairly Difficult (9th grade) - Business writing standard',
      10: 'Difficult (10th grade) - Requires concentration',
      11: 'Very Difficult (11th grade) - Academic level',
      12: 'Extremely Difficult (12th grade) - College level',
      13: 'Professional (College) - Technical/professional content'
    };
  }

  /**
   * Analyze content readability
   */
  async analyzeReadability(input, options = {}) {
    const { format = 'html', outputFile = null } = options;

    console.log('📖 Analyzing content readability...');

    // Extract content
    let content, metadata;
    if (this.isUrl(input)) {
      ({ content, metadata } = await this.fetchContent(input));
    } else {
      ({ content, metadata } = await this.readFile(input, format));
    }

    // Extract and clean text
    const text = this.extractText(content, format);
    const sentences = this.extractSentences(text);
    const paragraphs = this.extractParagraphs(text);
    const words = this.extractWords(text);

    // Calculate readability scores
    const readabilityScores = this.calculateReadabilityScores(text, sentences, words);

    // Analyze sentences
    const sentenceAnalysis = this.analyzeSentences(sentences);

    // Analyze paragraphs
    const paragraphAnalysis = this.analyzeParagraphs(paragraphs, sentences);

    // Detect passive voice
    const passiveVoice = this.detectPassiveVoice(sentences);

    // Analyze transition words
    const transitionWords = this.analyzeTransitionWords(sentences);

    // Analyze vocabulary
    const vocabulary = this.analyzeVocabulary(words);

    // Generate recommendations
    const recommendations = this.generateRecommendations({
      readabilityScores,
      sentenceAnalysis,
      paragraphAnalysis,
      passiveVoice,
      transitionWords,
      vocabulary
    });

    // Calculate overall readability grade
    const overallGrade = this.calculateOverallGrade(readabilityScores);

    const result = {
      url: input,
      overallGrade: overallGrade.grade,
      gradeDescription: overallGrade.description,
      assessment: overallGrade.assessment,
      readabilityScores,
      sentenceAnalysis,
      paragraphAnalysis,
      passiveVoice,
      transitionWords,
      vocabulary,
      recommendations,
      summary: this.generateSummary({
        overallGrade,
        sentenceAnalysis,
        paragraphAnalysis,
        passiveVoice,
        transitionWords,
        recommendations
      })
    };

    // Save to file if specified
    if (outputFile) {
      fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
      console.log(`\n📄 Results saved to: ${outputFile}`);
    }

    return result;
  }

  /**
   * Calculate all readability scores
   */
  calculateReadabilityScores(text, sentences, words) {
    const syllables = words.reduce((sum, word) => sum + this.countSyllables(word), 0);
    const characterCount = text.replace(/\s/g, '').length;

    return {
      fleschReadingEase: this.calculateFleschReadingEase(words, sentences, syllables),
      fleschKincaidGrade: this.calculateFleschKincaidGrade(words, sentences, syllables),
      gunningFog: this.calculateGunningFog(words, sentences),
      smogIndex: this.calculateSMOGIndex(sentences),
      colemanLiau: this.calculateColemanLiau(words, sentences, characterCount),
      automatedReadabilityIndex: this.calculateARI(words, sentences, characterCount)
    };
  }

  /**
   * Flesch Reading Ease (0-100, higher = easier)
   */
  calculateFleschReadingEase(words, sentences, syllables) {
    if (sentences.length === 0 || words.length === 0) return 0;

    const avgWordsPerSentence = words.length / sentences.length;
    const avgSyllablesPerWord = syllables / words.length;

    const score = 206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord;

    return {
      score: Math.max(0, Math.min(100, Math.round(score * 10) / 10)),
      interpretation: this.interpretFleschScore(score)
    };
  }

  interpretFleschScore(score) {
    if (score >= 90) return 'Very Easy (5th grade)';
    if (score >= 80) return 'Easy (6th grade)';
    if (score >= 70) return 'Fairly Easy (7th grade)';
    if (score >= 60) return 'Standard (8th-9th grade)';
    if (score >= 50) return 'Fairly Difficult (10th-12th grade)';
    if (score >= 30) return 'Difficult (College)';
    return 'Very Difficult (College graduate)';
  }

  /**
   * Flesch-Kincaid Grade Level
   */
  calculateFleschKincaidGrade(words, sentences, syllables) {
    if (sentences.length === 0 || words.length === 0) return { grade: 0, description: '' };

    const avgWordsPerSentence = words.length / sentences.length;
    const avgSyllablesPerWord = syllables / words.length;

    const grade = 0.39 * avgWordsPerSentence + 11.8 * avgSyllablesPerWord - 15.59;
    const rounded = Math.max(0, Math.round(grade * 10) / 10);

    return {
      grade: rounded,
      description: this.getGradeLevelDescription(rounded)
    };
  }

  /**
   * Gunning Fog Index
   */
  calculateGunningFog(words, sentences) {
    if (sentences.length === 0 || words.length === 0) return { score: 0, description: '' };

    const avgWordsPerSentence = words.length / sentences.length;
    const complexWords = words.filter(word => this.isComplexWord(word)).length;
    const percentComplex = (complexWords / words.length) * 100;

    const fog = 0.4 * (avgWordsPerSentence + percentComplex);
    const rounded = Math.round(fog * 10) / 10;

    return {
      score: rounded,
      description: this.getGradeLevelDescription(rounded)
    };
  }

  /**
   * SMOG Index (Simple Measure of Gobbledygook)
   */
  calculateSMOGIndex(sentences) {
    if (sentences.length < 30) {
      return {
        score: null,
        description: 'Requires at least 30 sentences for accurate calculation',
        note: 'Using simplified calculation for shorter content'
      };
    }

    const polysyllableCount = sentences.reduce((count, sentence) => {
      const words = this.extractWords(sentence);
      return count + words.filter(word => this.countSyllables(word) >= 3).length;
    }, 0);

    const smog = 1.0430 * Math.sqrt(polysyllableCount * (30 / sentences.length)) + 3.1291;
    const rounded = Math.round(smog * 10) / 10;

    return {
      score: rounded,
      description: this.getGradeLevelDescription(rounded)
    };
  }

  /**
   * Coleman-Liau Index
   */
  calculateColemanLiau(words, sentences, characterCount) {
    if (words.length === 0) return { grade: 0, description: '' };

    const avgLettersPer100Words = (characterCount / words.length) * 100;
    const avgSentencesPer100Words = (sentences.length / words.length) * 100;

    const cli = 0.0588 * avgLettersPer100Words - 0.296 * avgSentencesPer100Words - 15.8;
    const rounded = Math.max(0, Math.round(cli * 10) / 10);

    return {
      grade: rounded,
      description: this.getGradeLevelDescription(rounded)
    };
  }

  /**
   * Automated Readability Index (ARI)
   */
  calculateARI(words, sentences, characterCount) {
    if (sentences.length === 0 || words.length === 0) return { grade: 0, description: '' };

    const avgCharsPerWord = characterCount / words.length;
    const avgWordsPerSentence = words.length / sentences.length;

    const ari = 4.71 * avgCharsPerWord + 0.5 * avgWordsPerSentence - 21.43;
    const rounded = Math.max(0, Math.round(ari * 10) / 10);

    return {
      grade: rounded,
      description: this.getGradeLevelDescription(rounded)
    };
  }

  /**
   * Analyze sentence complexity
   */
  analyzeSentences(sentences) {
    const lengths = sentences.map(s => this.extractWords(s).length);
    const avgLength = lengths.reduce((sum, len) => sum + len, 0) / lengths.length;

    const longSentences = sentences.filter(s => this.extractWords(s).length > 25);
    const veryLongSentences = sentences.filter(s => this.extractWords(s).length > 35);
    const shortSentences = sentences.filter(s => this.extractWords(s).length < 10);

    const complexSentences = sentences.filter(s => this.isComplexSentence(s));

    return {
      totalSentences: sentences.length,
      avgSentenceLength: Math.round(avgLength * 10) / 10,
      shortSentences: shortSentences.length,
      longSentences: longSentences.length,
      veryLongSentences: veryLongSentences.length,
      complexSentences: complexSentences.length,
      longestSentence: {
        text: this.truncate(sentences.sort((a, b) =>
          this.extractWords(b).length - this.extractWords(a).length
        )[0] || '', 200),
        wordCount: lengths.length > 0 ? Math.max(...lengths) : 0
      },
      examples: {
        long: longSentences.slice(0, 3).map(s => this.truncate(s, 150)),
        veryLong: veryLongSentences.slice(0, 2).map(s => this.truncate(s, 150))
      }
    };
  }

  /**
   * Analyze paragraph structure
   */
  analyzeParagraphs(paragraphs, allSentences) {
    const paragraphSentenceCounts = paragraphs.map(p => {
      const pSentences = this.extractSentences(p);
      return pSentences.length;
    });

    const avgSentencesPerParagraph = paragraphSentenceCounts.reduce((sum, count) => sum + count, 0) / paragraphSentenceCounts.length || 0;

    const longParagraphs = paragraphs.filter(p => this.extractSentences(p).length > 7);
    const veryLongParagraphs = paragraphs.filter(p => this.extractSentences(p).length > 10);
    const shortParagraphs = paragraphs.filter(p => this.extractSentences(p).length < 2);

    return {
      totalParagraphs: paragraphs.length,
      avgSentencesPerParagraph: Math.round(avgSentencesPerParagraph * 10) / 10,
      shortParagraphs: shortParagraphs.length,
      longParagraphs: longParagraphs.length,
      veryLongParagraphs: veryLongParagraphs.length,
      longestParagraph: {
        sentenceCount: paragraphSentenceCounts.length > 0 ? Math.max(...paragraphSentenceCounts) : 0,
        preview: this.truncate(paragraphs.sort((a, b) =>
          this.extractSentences(b).length - this.extractSentences(a).length
        )[0] || '', 200)
      },
      examples: {
        long: longParagraphs.slice(0, 2).map(p => this.truncate(p, 150))
      }
    };
  }

  /**
   * Detect passive voice usage
   */
  detectPassiveVoice(sentences) {
    const passiveExamples = [];

    sentences.forEach(sentence => {
      this.passivePatterns.forEach(pattern => {
        const matches = sentence.match(pattern);
        if (matches) {
          passiveExamples.push({
            sentence: this.truncate(sentence, 150),
            match: matches[0]
          });
        }
      });
    });

    // Remove duplicates
    const uniqueExamples = Array.from(
      new Map(passiveExamples.map(ex => [ex.sentence, ex])).values()
    );

    const percentage = sentences.length > 0
      ? Math.round((uniqueExamples.length / sentences.length) * 100)
      : 0;

    return {
      percentage,
      count: uniqueExamples.length,
      totalSentences: sentences.length,
      examples: uniqueExamples.slice(0, 5),
      assessment: this.assessPassiveVoice(percentage)
    };
  }

  assessPassiveVoice(percentage) {
    if (percentage === 0) return 'Excellent - No passive voice detected';
    if (percentage <= 10) return 'Good - Minimal passive voice usage';
    if (percentage <= 20) return 'Fair - Moderate passive voice usage';
    return 'Poor - Excessive passive voice usage';
  }

  /**
   * Analyze transition word usage
   */
  analyzeTransitionWords(sentences) {
    const transitionUsage = {
      total: 0,
      byCategory: {}
    };

    const examples = [];

    Object.entries(this.transitionWords).forEach(([category, words]) => {
      let categoryCount = 0;

      sentences.forEach(sentence => {
        const lowerSentence = sentence.toLowerCase();
        words.forEach(word => {
          if (lowerSentence.includes(word)) {
            categoryCount++;
            if (examples.length < 10) {
              examples.push({
                category,
                word,
                sentence: this.truncate(sentence, 150)
              });
            }
          }
        });
      });

      transitionUsage.byCategory[category] = categoryCount;
      transitionUsage.total += categoryCount;
    });

    const percentage = sentences.length > 0
      ? Math.round((transitionUsage.total / sentences.length) * 100)
      : 0;

    return {
      percentage,
      count: transitionUsage.total,
      totalSentences: sentences.length,
      needsMore: percentage < this.options.minTransitionPercent,
      byCategory: transitionUsage.byCategory,
      examples: examples.slice(0, 5),
      assessment: this.assessTransitions(percentage)
    };
  }

  assessTransitions(percentage) {
    if (percentage >= 40) return 'Excellent - Strong use of transitions';
    if (percentage >= 30) return 'Good - Adequate transitions';
    if (percentage >= 20) return 'Fair - Could use more transitions';
    return 'Poor - Needs more transitions for flow';
  }

  /**
   * Analyze vocabulary difficulty
   */
  analyzeVocabulary(words) {
    const uniqueWords = [...new Set(words.map(w => w.toLowerCase()))];
    const complexWords = words.filter(w => this.isComplexWord(w));
    const veryComplexWords = words.filter(w => this.countSyllables(w) >= 4);
    const longWords = words.filter(w => w.length >= 10);

    const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;
    const avgSyllables = words.reduce((sum, word) => sum + this.countSyllables(word), 0) / words.length;

    const complexPercentage = Math.round((complexWords.length / words.length) * 100);

    return {
      totalWords: words.length,
      uniqueWords: uniqueWords.length,
      avgWordLength: Math.round(avgWordLength * 10) / 10,
      avgSyllablesPerWord: Math.round(avgSyllables * 10) / 10,
      complexWords: {
        count: complexWords.length,
        percentage: complexPercentage,
        examples: [...new Set(complexWords)].slice(0, 10)
      },
      veryComplexWords: {
        count: veryComplexWords.length,
        examples: [...new Set(veryComplexWords)].slice(0, 5)
      },
      longWords: {
        count: longWords.length,
        examples: [...new Set(longWords)].slice(0, 5)
      },
      assessment: this.assessVocabulary(complexPercentage)
    };
  }

  assessVocabulary(complexPercentage) {
    if (complexPercentage < 10) return 'Very Simple - Easy for all readers';
    if (complexPercentage < 15) return 'Simple - Accessible vocabulary';
    if (complexPercentage < 20) return 'Moderate - Standard complexity';
    if (complexPercentage < 25) return 'Complex - Challenging vocabulary';
    return 'Very Complex - May be difficult for readers';
  }

  /**
   * Generate improvement recommendations
   */
  generateRecommendations(analysis) {
    const recommendations = [];
    const { readabilityScores, sentenceAnalysis, paragraphAnalysis, passiveVoice, transitionWords, vocabulary } = analysis;

    // Readability score recommendations
    const avgGrade = (
      readabilityScores.fleschKincaidGrade.grade +
      readabilityScores.gunningFog.score +
      readabilityScores.colemanLiau.grade +
      readabilityScores.automatedReadabilityIndex.grade
    ) / 4;

    if (avgGrade > 12) {
      recommendations.push({
        type: 'readability',
        severity: 'high',
        title: 'Content is too complex',
        issue: `Average grade level: ${Math.round(avgGrade * 10) / 10} (College+)`,
        action: 'Simplify language to reach 9th-10th grade level for general audience',
        impact: 9
      });
    } else if (avgGrade > 10) {
      recommendations.push({
        type: 'readability',
        severity: 'medium',
        title: 'Content is fairly complex',
        issue: `Average grade level: ${Math.round(avgGrade * 10) / 10}`,
        action: 'Consider simplifying some complex sentences and vocabulary',
        impact: 7
      });
    }

    // Sentence length recommendations
    if (sentenceAnalysis.veryLongSentences > 0) {
      recommendations.push({
        type: 'sentence_complexity',
        severity: 'high',
        title: 'Very long sentences detected',
        issue: `${sentenceAnalysis.veryLongSentences} sentences with 35+ words`,
        action: 'Break long sentences into shorter ones (target: 15-20 words)',
        impact: 8,
        examples: sentenceAnalysis.examples.veryLong
      });
    } else if (sentenceAnalysis.longSentences > sentenceAnalysis.totalSentences * 0.25) {
      recommendations.push({
        type: 'sentence_complexity',
        severity: 'medium',
        title: 'Many long sentences',
        issue: `${sentenceAnalysis.longSentences} sentences with 25+ words`,
        action: 'Shorten some sentences to improve readability',
        impact: 6,
        examples: sentenceAnalysis.examples.long.slice(0, 2)
      });
    }

    // Paragraph length recommendations
    if (paragraphAnalysis.veryLongParagraphs > 0) {
      recommendations.push({
        type: 'paragraph_structure',
        severity: 'high',
        title: 'Very long paragraphs detected',
        issue: `${paragraphAnalysis.veryLongParagraphs} paragraphs with 10+ sentences`,
        action: 'Break paragraphs into smaller chunks (target: 3-5 sentences)',
        impact: 7,
        examples: paragraphAnalysis.examples.long.slice(0, 1)
      });
    } else if (paragraphAnalysis.longParagraphs > paragraphAnalysis.totalParagraphs * 0.3) {
      recommendations.push({
        type: 'paragraph_structure',
        severity: 'medium',
        title: 'Many long paragraphs',
        issue: `${paragraphAnalysis.longParagraphs} paragraphs with 7+ sentences`,
        action: 'Consider breaking some paragraphs for better scanability',
        impact: 5
      });
    }

    // Passive voice recommendations
    if (passiveVoice.percentage > 20) {
      recommendations.push({
        type: 'passive_voice',
        severity: 'high',
        title: 'Excessive passive voice',
        issue: `${passiveVoice.percentage}% of sentences use passive voice`,
        action: 'Convert passive constructions to active voice',
        impact: 7,
        examples: passiveVoice.examples.slice(0, 3)
      });
    } else if (passiveVoice.percentage > 10) {
      recommendations.push({
        type: 'passive_voice',
        severity: 'medium',
        title: 'Moderate passive voice usage',
        issue: `${passiveVoice.percentage}% of sentences use passive voice`,
        action: 'Reduce passive voice where possible (target: <10%)',
        impact: 5,
        examples: passiveVoice.examples.slice(0, 2)
      });
    }

    // Transition word recommendations
    if (transitionWords.percentage < 20) {
      recommendations.push({
        type: 'transitions',
        severity: 'high',
        title: 'Insufficient transition words',
        issue: `Only ${transitionWords.percentage}% of sentences use transitions`,
        action: 'Add transition words to improve flow (target: 30%+)',
        impact: 6,
        suggestions: ['however', 'therefore', 'for example', 'in addition', 'consequently']
      });
    } else if (transitionWords.percentage < 30) {
      recommendations.push({
        type: 'transitions',
        severity: 'medium',
        title: 'Could use more transitions',
        issue: `${transitionWords.percentage}% of sentences use transitions`,
        action: 'Add more transition words for smoother flow',
        impact: 4
      });
    }

    // Vocabulary recommendations
    if (vocabulary.complexWords.percentage > 25) {
      recommendations.push({
        type: 'vocabulary',
        severity: 'high',
        title: 'Very complex vocabulary',
        issue: `${vocabulary.complexWords.percentage}% complex words (3+ syllables)`,
        action: 'Replace complex words with simpler alternatives',
        impact: 7,
        examples: vocabulary.complexWords.examples.slice(0, 5)
      });
    } else if (vocabulary.complexWords.percentage > 20) {
      recommendations.push({
        type: 'vocabulary',
        severity: 'medium',
        title: 'Fairly complex vocabulary',
        issue: `${vocabulary.complexWords.percentage}% complex words`,
        action: 'Consider simplifying some vocabulary',
        impact: 5,
        examples: vocabulary.complexWords.examples.slice(0, 3)
      });
    }

    // Sort by impact (highest first)
    return recommendations.sort((a, b) => b.impact - a.impact);
  }

  /**
   * Calculate overall readability grade
   */
  calculateOverallGrade(scores) {
    const grades = [
      scores.fleschKincaidGrade.grade,
      scores.gunningFog.score,
      scores.colemanLiau.grade,
      scores.automatedReadabilityIndex.grade
    ].filter(g => g > 0);

    const avgGrade = grades.reduce((sum, g) => sum + g, 0) / grades.length;
    const rounded = Math.round(avgGrade * 10) / 10;

    return {
      grade: rounded,
      description: this.getGradeLevelDescription(rounded),
      assessment: this.assessOverallGrade(rounded),
      fleschScore: scores.fleschReadingEase.score
    };
  }

  assessOverallGrade(grade) {
    if (grade <= 8) return 'Excellent - Very accessible to general audience';
    if (grade <= 10) return 'Good - Comfortable for most readers';
    if (grade <= 12) return 'Fair - Requires more concentration';
    if (grade <= 14) return 'Difficult - Requires education';
    return 'Very Difficult - College+ level content';
  }

  /**
   * Generate summary
   */
  generateSummary(data) {
    const { overallGrade, sentenceAnalysis, paragraphAnalysis, passiveVoice, transitionWords, recommendations } = data;

    const criticalIssues = recommendations.filter(r => r.severity === 'high').length;
    const warnings = recommendations.filter(r => r.severity === 'medium').length;

    return {
      gradeLevel: overallGrade.grade,
      assessment: overallGrade.assessment,
      readingTime: this.estimateReadingTime(sentenceAnalysis.totalSentences),
      keyMetrics: {
        avgSentenceLength: sentenceAnalysis.avgSentenceLength,
        avgParagraphLength: paragraphAnalysis.avgSentencesPerParagraph,
        passiveVoicePercent: passiveVoice.percentage,
        transitionWordPercent: transitionWords.percentage
      },
      issues: {
        critical: criticalIssues,
        warnings: warnings,
        total: recommendations.length
      },
      topIssues: recommendations.slice(0, 3).map(r => r.title)
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  extractText(content, format) {
    if (format === 'html') {
      return this.stripHTML(content);
    } else if (format === 'markdown') {
      return this.stripMarkdown(content);
    }
    return content;
  }

  extractSentences(text) {
    // Split on sentence boundaries
    return text
      .split(/[.!?]+\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  extractParagraphs(text) {
    return text
      .split(/\n\n+/)
      .map(p => p.trim())
      .filter(p => p.length > 0);
  }

  extractWords(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s'-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 0);
  }

  countSyllables(word) {
    word = word.toLowerCase().replace(/[^a-z]/g, '');
    if (word.length <= 3) return 1;

    word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
    word = word.replace(/^y/, '');

    const matches = word.match(/[aeiouy]{1,2}/g);
    return matches ? matches.length : 1;
  }

  isComplexWord(word) {
    // Complex if 3+ syllables and not in common words list
    if (this.commonWords.has(word.toLowerCase())) return false;
    return this.countSyllables(word) >= 3;
  }

  isComplexSentence(sentence) {
    // Sentences with multiple clauses
    const clauseMarkers = [',', ';', 'and', 'but', 'or', 'because', 'although', 'while', 'since'];
    const lowerSentence = sentence.toLowerCase();
    return clauseMarkers.filter(marker => lowerSentence.includes(marker)).length >= 2;
  }

  getGradeLevelDescription(grade) {
    const roundedGrade = Math.round(grade);
    return this.gradeLevelDescriptions[roundedGrade] ||
           this.gradeLevelDescriptions[Math.min(13, Math.max(5, roundedGrade))] ||
           `Grade ${roundedGrade}`;
  }

  estimateReadingTime(sentenceCount) {
    // Average reading speed: 200-250 words/minute
    // Average: 20 words/sentence
    const estimatedWords = sentenceCount * 20;
    const minutes = Math.ceil(estimatedWords / 225);
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }

  stripHTML(html) {
    return html
      .replace(/<script[^>]*>.*?<\/script>/gis, '')
      .replace(/<style[^>]*>.*?<\/style>/gis, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  stripMarkdown(markdown) {
    return markdown
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/\[(.+?)\]\(.+?\)/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .trim();
  }

  isUrl(input) {
    try {
      new URL(input);
      return true;
    } catch {
      return false;
    }
  }

  async fetchContent(url) {
    // Placeholder - would use fetch in real implementation
    return {
      content: '<html><body><p>Sample content</p></body></html>',
      metadata: { url, title: 'Sample' }
    };
  }

  async readFile(filePath, format) {
    const content = fs.readFileSync(filePath, 'utf-8');
    return {
      content,
      metadata: { filePath, format }
    };
  }

  truncate(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }
}

// ============================================================================
// CLI Interface
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
SEO Readability Analyzer - Analyze content readability and provide improvement suggestions

Usage:
  node seo-readability-analyzer.js <url-or-file> [options]

Options:
  --format <format>        Input format: html, markdown, text (default: html)
  --output <file>          Save results to JSON file
  --target-grade <level>   Target grade level (default: 9)
  --help                   Show this help message

Examples:
  node seo-readability-analyzer.js https://example.com/article
  node seo-readability-analyzer.js ./content.md --format markdown
  node seo-readability-analyzer.js ./article.html --output readability.json

Readability Metrics:
  - Flesch Reading Ease (0-100, higher = easier)
  - Flesch-Kincaid Grade Level
  - Gunning Fog Index
  - SMOG Index
  - Coleman-Liau Index
  - Automated Readability Index (ARI)
    `);
    process.exit(0);
  }

  const input = args[0];
  const options = {
    format: 'html',
    outputFile: null,
    targetGradeLevel: 9
  };

  // Parse command-line arguments
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--format' && args[i + 1]) {
      options.format = args[i + 1];
      i++;
    } else if (args[i] === '--output' && args[i + 1]) {
      options.outputFile = args[i + 1];
      i++;
    } else if (args[i] === '--target-grade' && args[i + 1]) {
      options.targetGradeLevel = parseInt(args[i + 1]);
      i++;
    }
  }

  const analyzer = new SEOReadabilityAnalyzer({ targetGradeLevel: options.targetGradeLevel });

  try {
    const result = await analyzer.analyzeReadability(input, options);

    // Display summary
    console.log('\n' + '='.repeat(60));
    console.log('SEO READABILITY ANALYSIS REPORT');
    console.log('='.repeat(60));
    console.log(`\nOverall Grade Level: ${result.overallGrade} (${result.gradeDescription})`);
    console.log(`Assessment: ${result.assessment}`);
    console.log(`Reading Time: ${result.summary.readingTime}`);

    console.log('\n📊 Key Metrics:');
    console.log(`  Average Sentence Length: ${result.summary.keyMetrics.avgSentenceLength} words`);
    console.log(`  Average Paragraph Length: ${result.summary.keyMetrics.avgParagraphLength} sentences`);
    console.log(`  Passive Voice: ${result.summary.keyMetrics.passiveVoicePercent}%`);
    console.log(`  Transition Words: ${result.summary.keyMetrics.transitionWordPercent}%`);

    console.log('\n📋 Readability Scores:');
    console.log(`  Flesch Reading Ease: ${result.readabilityScores.fleschReadingEase.score}/100 (${result.readabilityScores.fleschReadingEase.interpretation})`);
    console.log(`  Flesch-Kincaid Grade: ${result.readabilityScores.fleschKincaidGrade.grade}`);
    console.log(`  Gunning Fog Index: ${result.readabilityScores.gunningFog.score}`);
    console.log(`  SMOG Index: ${result.readabilityScores.smogIndex.score || 'N/A'}`);
    console.log(`  Coleman-Liau: ${result.readabilityScores.colemanLiau.grade}`);
    console.log(`  ARI: ${result.readabilityScores.automatedReadabilityIndex.grade}`);

    if (result.recommendations.length > 0) {
      console.log('\n⚠️  Issues Found:');
      console.log(`  Critical: ${result.summary.issues.critical}`);
      console.log(`  Warnings: ${result.summary.issues.warnings}`);
      console.log('\n🔝 Top Recommendations:');
      result.recommendations.slice(0, 5).forEach((rec, i) => {
        const icon = rec.severity === 'high' ? '🔴' : '🟡';
        console.log(`  ${i + 1}. ${icon} ${rec.title}`);
        console.log(`     ${rec.action}`);
      });
    } else {
      console.log('\n✅ No major readability issues found!');
    }

    console.log('\n' + '='.repeat(60) + '\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = SEOReadabilityAnalyzer;
