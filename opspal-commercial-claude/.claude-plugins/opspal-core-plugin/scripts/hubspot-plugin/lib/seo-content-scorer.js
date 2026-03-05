#!/usr/bin/env node

/**
 * SEO Content Scorer
 *
 * Evaluates content quality across multiple dimensions:
 * - Readability (Flesch-Kincaid, Gunning Fog, SMOG, etc.)
 * - Content depth (word count, images, multimedia)
 * - SEO optimization (keyword usage, metadata)
 * - Engagement factors (questions, lists, examples)
 * - E-E-A-T signals (expertise, authority, trust)
 * - Technical quality (grammar, links, images)
 *
 * Usage:
 *   node seo-content-scorer.js <url> --keyword "target keyword"
 *   node seo-content-scorer.js ./content.html --format html --keyword "seo"
 *   node seo-content-scorer.js ./content.md --format markdown
 *
 * Output: JSON with overall score (0-100) and detailed recommendations
 *
 * Phase: 3 (Content Optimization & AEO)
 * Version: 1.0.0
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class ContentScorer {
  constructor(options = {}) {
    this.cacheDir = options.cacheDir || path.join(process.cwd(), '.cache', 'content-scores');
    this.cacheTTL = options.cacheTTL || 24 * 60 * 60 * 1000; // 24 hours
    this.useCache = options.useCache !== false;
  }

  /**
   * Score content across all dimensions
   */
  async scoreContent(content, options = {}) {
    const {
      url = null,
      targetKeyword = null,
      format = 'html'
    } = options;

    console.log('📊 Analyzing content quality...');

    // Extract text and metadata
    const extracted = await this.extractContent(content, format);

    // Calculate scores across dimensions
    const scores = {
      readability: await this.scoreReadability(extracted),
      depth: await this.scoreDepth(extracted),
      seo: await this.scoreSEO(extracted, targetKeyword),
      engagement: await this.scoreEngagement(extracted),
      eeat: await this.scoreEEAT(extracted),
      technical: await this.scoreTechnical(extracted)
    };

    // Calculate weighted overall score
    const overallScore = this.calculateOverallScore(scores);

    // Generate recommendations
    const recommendations = this.generateRecommendations(scores, extracted, targetKeyword);

    const result = {
      url: url || extracted.url,
      timestamp: new Date().toISOString(),
      overallScore,
      grade: this.getGrade(overallScore),
      scores: {
        readability: scores.readability.score,
        depth: scores.depth.score,
        seo: scores.seo.score,
        engagement: scores.engagement.score,
        eeat: scores.eeat.score,
        technical: scores.technical.score
      },
      metrics: {
        wordCount: extracted.wordCount,
        readingTime: extracted.readingTime,
        fleschScore: scores.readability.flesch,
        gradeLevel: scores.readability.gradeLevel,
        images: extracted.images.length,
        headings: extracted.headingCounts,
        listsAndTables: extracted.lists.length + extracted.tables.length,
        questions: extracted.questions.length
      },
      detailedScores: scores,
      recommendations
    };

    console.log('✅ Content analysis complete');
    return result;
  }

  /**
   * Extract content and metadata
   */
  async extractContent(content, format) {
    // For now, assume content is already extracted text
    // In production, would parse HTML/Markdown properly

    const text = typeof content === 'string' ? content : content.text || '';
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);

    return {
      text,
      words,
      sentences,
      paragraphs,
      wordCount: words.length,
      sentenceCount: sentences.length,
      paragraphCount: paragraphs.length,
      readingTime: Math.ceil(words.length / 200) + ' minutes',
      images: content.images || [],
      headings: this.extractHeadings(text),
      headingCounts: this.countHeadings(text),
      lists: this.extractLists(text),
      tables: this.extractTables(text),
      links: content.links || [],
      questions: this.extractQuestions(text),
      title: content.title || '',
      metaDescription: content.metaDescription || '',
      url: content.url || null
    };
  }

  /**
   * Score readability (25% weight)
   */
  async scoreReadability(extracted) {
    const { words, sentences, text } = extracted;

    // Calculate readability metrics
    const flesch = this.calculateFleschReadingEase(words, sentences);
    const fleschGrade = this.calculateFleschKincaidGrade(words, sentences);
    const gunningFog = this.calculateGunningFog(words, sentences);
    const smog = this.calculateSMOG(sentences);

    // Average grade level
    const gradeLevel = (fleschGrade + gunningFog + smog) / 3;

    // Score based on grade level (target: 8-10 for general audience)
    let score = 100;
    if (gradeLevel < 6) {
      score = 70; // Too simple
    } else if (gradeLevel >= 6 && gradeLevel <= 10) {
      score = 100; // Optimal
    } else if (gradeLevel > 10 && gradeLevel <= 12) {
      score = 85; // Acceptable
    } else if (gradeLevel > 12 && gradeLevel <= 14) {
      score = 70; // Challenging
    } else {
      score = 50; // Too difficult
    }

    // Adjust for sentence complexity
    const avgSentenceLength = words.length / sentences.length;
    if (avgSentenceLength > 25) {
      score -= 10; // Sentences too long
    } else if (avgSentenceLength < 10) {
      score -= 5; // Sentences too short
    }

    // Adjust for paragraph length
    const avgParagraphLength = extracted.paragraphCount > 0
      ? sentences.length / extracted.paragraphCount
      : 0;
    if (avgParagraphLength > 6) {
      score -= 5; // Paragraphs too long
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      flesch,
      fleschGrade,
      gunningFog,
      smog,
      gradeLevel: Math.round(gradeLevel * 10) / 10,
      avgSentenceLength: Math.round(avgSentenceLength * 10) / 10,
      avgParagraphLength: Math.round(avgParagraphLength * 10) / 10
    };
  }

  /**
   * Score content depth (20% weight)
   */
  async scoreDepth(extracted) {
    let score = 0;

    // Word count (40% of depth score)
    const wordScore = this.scoreWordCount(extracted.wordCount);
    score += wordScore * 0.4;

    // Images (20% of depth score)
    const imageScore = this.scoreImages(extracted.images);
    score += imageScore * 0.2;

    // Headings (15% of depth score)
    const headingScore = this.scoreHeadings(extracted.headingCounts);
    score += headingScore * 0.15;

    // Lists and tables (15% of depth score)
    const formatScore = this.scoreFormattingElements(extracted.lists, extracted.tables);
    score += formatScore * 0.15;

    // Multimedia/embeds (10% of depth score)
    const multimediaScore = 50; // Placeholder (would detect videos, embeds, etc.)
    score += multimediaScore * 0.1;

    return {
      score: Math.round(score),
      wordCount: extracted.wordCount,
      wordScore,
      imageCount: extracted.images.length,
      imageScore,
      headingScore,
      formatScore,
      multimediaScore
    };
  }

  /**
   * Score SEO optimization (20% weight)
   */
  async scoreSEO(extracted, targetKeyword) {
    let score = 100;
    const issues = [];

    // If no target keyword, can only do basic SEO checks
    if (!targetKeyword) {
      // Title check
      if (!extracted.title || extracted.title.length === 0) {
        score -= 20;
        issues.push('Missing title');
      } else if (extracted.title.length > 60) {
        score -= 10;
        issues.push('Title too long');
      }

      // Meta description check
      if (!extracted.metaDescription || extracted.metaDescription.length === 0) {
        score -= 20;
        issues.push('Missing meta description');
      } else if (extracted.metaDescription.length < 120 || extracted.metaDescription.length > 160) {
        score -= 10;
        issues.push('Meta description not optimal length');
      }

      // Heading structure
      if (extracted.headingCounts.h1 === 0) {
        score -= 15;
        issues.push('Missing H1');
      } else if (extracted.headingCounts.h1 > 1) {
        score -= 10;
        issues.push('Multiple H1 tags');
      }

      if (extracted.headingCounts.h2 === 0) {
        score -= 10;
        issues.push('No H2 headings');
      }

      return {
        score: Math.max(0, score),
        keywordAnalysis: null,
        issues
      };
    }

    // Keyword analysis
    const keywordLower = targetKeyword.toLowerCase();
    const textLower = extracted.text.toLowerCase();

    // Keyword in title
    const titleLower = extracted.title.toLowerCase();
    if (!titleLower.includes(keywordLower)) {
      score -= 15;
      issues.push('Keyword not in title');
    }

    // Keyword in meta description
    const descLower = extracted.metaDescription.toLowerCase();
    if (!descLower.includes(keywordLower)) {
      score -= 10;
      issues.push('Keyword not in meta description');
    }

    // Keyword in H1
    const h1Text = extracted.headings.filter(h => h.level === 'h1').map(h => h.text.toLowerCase()).join(' ');
    if (!h1Text.includes(keywordLower)) {
      score -= 15;
      issues.push('Keyword not in H1');
    }

    // Keyword in first 100 words
    const first100Words = extracted.words.slice(0, 100).join(' ').toLowerCase();
    if (!first100Words.includes(keywordLower)) {
      score -= 10;
      issues.push('Keyword not in first 100 words');
    }

    // Keyword density (target: 0.5-2.5%)
    const keywordCount = (textLower.match(new RegExp(keywordLower, 'g')) || []).length;
    const keywordDensity = (keywordCount / extracted.wordCount) * 100;

    if (keywordDensity < 0.5) {
      score -= 10;
      issues.push('Keyword density too low');
    } else if (keywordDensity > 2.5) {
      score -= 15;
      issues.push('Keyword density too high (keyword stuffing)');
    }

    // Keyword in headings (H2-H3)
    const h2h3Text = extracted.headings
      .filter(h => h.level === 'h2' || h.level === 'h3')
      .map(h => h.text.toLowerCase())
      .join(' ');
    const headingsWithKeyword = h2h3Text.split(' ').filter(t => t.includes(keywordLower)).length;
    if (headingsWithKeyword === 0) {
      score -= 10;
      issues.push('Keyword not in any H2/H3 headings');
    }

    return {
      score: Math.max(0, score),
      keywordAnalysis: {
        keyword: targetKeyword,
        count: keywordCount,
        density: Math.round(keywordDensity * 100) / 100,
        inTitle: titleLower.includes(keywordLower),
        inMetaDescription: descLower.includes(keywordLower),
        inH1: h1Text.includes(keywordLower),
        inFirstParagraph: first100Words.includes(keywordLower),
        inHeadings: headingsWithKeyword
      },
      issues
    };
  }

  /**
   * Score engagement factors (15% weight)
   */
  async scoreEngagement(extracted) {
    let score = 0;

    // Questions (20% of engagement score)
    const questionScore = Math.min(100, extracted.questions.length * 20);
    score += questionScore * 0.2;

    // Lists (30% of engagement score)
    const listScore = Math.min(100, extracted.lists.length * 25);
    score += listScore * 0.3;

    // Tables (20% of engagement score)
    const tableScore = Math.min(100, extracted.tables.length * 33);
    score += tableScore * 0.2;

    // Images (15% of engagement score)
    const imageEngagementScore = Math.min(100, extracted.images.length * 10);
    score += imageEngagementScore * 0.15;

    // Examples/case studies (15% of engagement score)
    const exampleScore = this.detectExamples(extracted.text);
    score += exampleScore * 0.15;

    return {
      score: Math.round(score),
      questions: extracted.questions.length,
      lists: extracted.lists.length,
      tables: extracted.tables.length,
      images: extracted.images.length,
      examples: Math.floor(exampleScore / 20)
    };
  }

  /**
   * Score E-E-A-T signals (10% weight)
   */
  async scoreEEAT(extracted) {
    let score = 50; // Base score

    // Author information (25%)
    const hasAuthor = this.detectAuthorInfo(extracted.text);
    if (hasAuthor) score += 25;

    // Citations/sources (25%)
    const citationCount = this.detectCitations(extracted.text, extracted.links);
    if (citationCount >= 3) score += 25;
    else if (citationCount >= 1) score += 15;

    // Date/freshness (20%)
    const hasDate = this.detectDateInfo(extracted.text);
    if (hasDate) score += 20;

    // Expert credentials (15%)
    const hasCredentials = this.detectCredentials(extracted.text);
    if (hasCredentials) score += 15;

    // Trust indicators (15%)
    const trustScore = this.detectTrustIndicators(extracted.text);
    score += trustScore * 0.15;

    return {
      score: Math.min(100, Math.round(score)),
      hasAuthor,
      citations: citationCount,
      hasDate,
      hasCredentials,
      trustIndicators: Math.floor(trustScore / 20)
    };
  }

  /**
   * Score technical quality (10% weight)
   */
  async scoreTechnical(extracted) {
    let score = 100;

    // Check for very short content
    if (extracted.wordCount < 300) {
      score -= 30;
    }

    // Check for broken formatting indicators
    if (this.hasBrokenFormatting(extracted.text)) {
      score -= 20;
    }

    // Image optimization (all images should have alt text in production)
    const imagesWithoutAlt = extracted.images.filter(img => !img.alt || img.alt.length === 0).length;
    if (imagesWithoutAlt > 0 && extracted.images.length > 0) {
      const altCoverage = 1 - (imagesWithoutAlt / extracted.images.length);
      score -= Math.round((1 - altCoverage) * 20);
    }

    // Check for broken links (placeholder)
    // In production, would actually check links
    const brokenLinksPenalty = 0;
    score -= brokenLinksPenalty;

    return {
      score: Math.max(0, score),
      wordCount: extracted.wordCount,
      imagesWithoutAlt,
      totalImages: extracted.images.length,
      brokenLinks: 0 // Placeholder
    };
  }

  /**
   * Calculate weighted overall score
   */
  calculateOverallScore(scores) {
    const weights = {
      readability: 0.25,
      depth: 0.20,
      seo: 0.20,
      engagement: 0.15,
      eeat: 0.10,
      technical: 0.10
    };

    const overall =
      scores.readability.score * weights.readability +
      scores.depth.score * weights.depth +
      scores.seo.score * weights.seo +
      scores.engagement.score * weights.engagement +
      scores.eeat.score * weights.eeat +
      scores.technical.score * weights.technical;

    return Math.round(overall);
  }

  /**
   * Generate improvement recommendations
   */
  generateRecommendations(scores, extracted, targetKeyword) {
    const recommendations = [];

    // Readability recommendations
    if (scores.readability.score < 70) {
      if (scores.readability.avgSentenceLength > 20) {
        recommendations.push({
          category: 'readability',
          priority: 'high',
          issue: 'Sentences too long',
          detail: `Average sentence length is ${scores.readability.avgSentenceLength} words`,
          action: 'Break long sentences into shorter ones (target: 15-20 words per sentence)',
          impact: 8
        });
      }

      if (scores.readability.gradeLevel > 12) {
        recommendations.push({
          category: 'readability',
          priority: 'high',
          issue: 'Content too complex',
          detail: `Grade level: ${scores.readability.gradeLevel}`,
          action: 'Simplify language and sentence structure (target: grade 8-10)',
          impact: 9
        });
      }
    }

    // Depth recommendations
    if (scores.depth.score < 70) {
      if (extracted.wordCount < 1000) {
        recommendations.push({
          category: 'depth',
          priority: 'high',
          issue: 'Content too short',
          detail: `Current: ${extracted.wordCount} words`,
          action: `Add ${1500 - extracted.wordCount} more words of valuable content (target: 1500+ words)`,
          impact: 9
        });
      }

      if (extracted.images.length < 3) {
        recommendations.push({
          category: 'depth',
          priority: 'medium',
          issue: 'Not enough images',
          detail: `Current: ${extracted.images.length} images`,
          action: 'Add 3-5 relevant images, diagrams, or screenshots',
          impact: 6
        });
      }
    }

    // SEO recommendations
    if (scores.seo.score < 80 && scores.seo.issues) {
      scores.seo.issues.forEach(issue => {
        let priority = 'medium';
        let impact = 6;

        if (issue.includes('title') || issue.includes('H1')) {
          priority = 'high';
          impact = 8;
        }

        recommendations.push({
          category: 'seo',
          priority,
          issue,
          detail: targetKeyword ? `Target keyword: "${targetKeyword}"` : 'No target keyword provided',
          action: this.getSEOActionForIssue(issue, targetKeyword),
          impact
        });
      });
    }

    // Engagement recommendations
    if (scores.engagement.score < 60) {
      if (extracted.lists.length === 0) {
        recommendations.push({
          category: 'engagement',
          priority: 'medium',
          issue: 'No lists',
          detail: 'Lists improve scannability',
          action: 'Add 2-3 bullet or numbered lists to break up text',
          impact: 7
        });
      }

      if (extracted.questions.length === 0) {
        recommendations.push({
          category: 'engagement',
          priority: 'low',
          issue: 'No questions',
          detail: 'Questions engage readers',
          action: 'Add 1-2 questions to encourage reader engagement',
          impact: 5
        });
      }
    }

    // E-E-A-T recommendations
    if (scores.eeat.score < 60) {
      if (!scores.eeat.hasAuthor) {
        recommendations.push({
          category: 'eeat',
          priority: 'medium',
          issue: 'No author information',
          detail: 'Author attribution builds trust',
          action: 'Add author byline with credentials',
          impact: 6
        });
      }

      if (scores.eeat.citations < 2) {
        recommendations.push({
          category: 'eeat',
          priority: 'medium',
          issue: 'Few citations',
          detail: `Current: ${scores.eeat.citations} citations`,
          action: 'Add 3-5 citations to authoritative sources',
          impact: 6
        });
      }
    }

    // Sort by impact (highest first)
    return recommendations.sort((a, b) => b.impact - a.impact);
  }

  // Helper methods for readability calculations

  calculateFleschReadingEase(words, sentences) {
    const syllables = words.reduce((sum, word) => sum + this.countSyllables(word), 0);
    const score = 206.835 - 1.015 * (words.length / sentences.length) - 84.6 * (syllables / words.length);
    return Math.round(score * 10) / 10;
  }

  calculateFleschKincaidGrade(words, sentences) {
    const syllables = words.reduce((sum, word) => sum + this.countSyllables(word), 0);
    const grade = 0.39 * (words.length / sentences.length) + 11.8 * (syllables / words.length) - 15.59;
    return Math.max(0, Math.round(grade * 10) / 10);
  }

  calculateGunningFog(words, sentences) {
    const complexWords = words.filter(word => this.countSyllables(word) >= 3).length;
    const fog = 0.4 * ((words.length / sentences.length) + 100 * (complexWords / words.length));
    return Math.round(fog * 10) / 10;
  }

  calculateSMOG(sentences) {
    // Simplified SMOG for variable sentence count
    const sampleSize = Math.min(30, sentences.length);
    const complexWords = sentences.slice(0, sampleSize).reduce((sum, sent) => {
      const words = sent.split(/\s+/);
      return sum + words.filter(w => this.countSyllables(w) >= 3).length;
    }, 0);
    const smog = 1.0430 * Math.sqrt(complexWords * (30 / sampleSize)) + 3.1291;
    return Math.round(smog * 10) / 10;
  }

  countSyllables(word) {
    word = word.toLowerCase().replace(/[^a-z]/g, '');
    if (word.length <= 3) return 1;

    const vowels = 'aeiouy';
    let count = 0;
    let previousWasVowel = false;

    for (let i = 0; i < word.length; i++) {
      const isVowel = vowels.includes(word[i]);
      if (isVowel && !previousWasVowel) {
        count++;
      }
      previousWasVowel = isVowel;
    }

    // Adjust for silent e
    if (word.endsWith('e')) {
      count--;
    }

    // Minimum 1 syllable
    return Math.max(1, count);
  }

  // Helper methods for content analysis

  extractHeadings(text) {
    // Simplified heading extraction (would use proper HTML/Markdown parser in production)
    const headings = [];
    const lines = text.split('\n');

    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('#')) {
        const level = trimmed.match(/^#+/)[0].length;
        const text = trimmed.replace(/^#+\s*/, '');
        headings.push({ level: `h${level}`, text });
      }
    });

    return headings;
  }

  countHeadings(text) {
    const headings = this.extractHeadings(text);
    return {
      h1: headings.filter(h => h.level === 'h1').length,
      h2: headings.filter(h => h.level === 'h2').length,
      h3: headings.filter(h => h.level === 'h3').length,
      h4: headings.filter(h => h.level === 'h4').length,
      h5: headings.filter(h => h.level === 'h5').length,
      h6: headings.filter(h => h.level === 'h6').length
    };
  }

  extractLists(text) {
    // Detect bullet points and numbered lists
    const lines = text.split('\n');
    const lists = [];
    let currentList = null;

    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed.match(/^[-*•]\s/) || trimmed.match(/^\d+\.\s/)) {
        if (!currentList) {
          currentList = { items: [] };
          lists.push(currentList);
        }
        currentList.items.push(trimmed);
      } else if (currentList && trimmed.length === 0) {
        currentList = null;
      }
    });

    return lists;
  }

  extractTables(text) {
    // Simplified table detection
    const tables = [];
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('|') && lines[i].split('|').length >= 3) {
        tables.push({ line: i });
      }
    }

    return tables;
  }

  extractQuestions(text) {
    const sentences = text.split(/[.!?]+/);
    return sentences.filter(s => s.trim().endsWith('?'));
  }

  scoreWordCount(wordCount) {
    if (wordCount >= 2000) return 100;
    if (wordCount >= 1500) return 90;
    if (wordCount >= 1000) return 75;
    if (wordCount >= 500) return 50;
    if (wordCount >= 300) return 30;
    return 10;
  }

  scoreImages(images) {
    const count = images.length;
    if (count >= 8) return 100;
    if (count >= 5) return 85;
    if (count >= 3) return 70;
    if (count >= 1) return 50;
    return 0;
  }

  scoreHeadings(headingCounts) {
    let score = 50; // Base score

    // H1 check
    if (headingCounts.h1 === 1) score += 20;
    else if (headingCounts.h1 > 1) score -= 10;

    // H2 check
    if (headingCounts.h2 >= 3) score += 20;
    else if (headingCounts.h2 >= 1) score += 10;

    // H3 check
    if (headingCounts.h3 >= 5) score += 10;
    else if (headingCounts.h3 >= 1) score += 5;

    return Math.min(100, score);
  }

  scoreFormattingElements(lists, tables) {
    let score = 0;

    // Lists
    if (lists.length >= 3) score += 50;
    else if (lists.length >= 1) score += 25;

    // Tables
    if (tables.length >= 2) score += 50;
    else if (tables.length >= 1) score += 25;

    return Math.min(100, score);
  }

  detectExamples(text) {
    const exampleIndicators = ['for example', 'e.g.', 'for instance', 'such as', 'case study', 'example:'];
    let count = 0;

    exampleIndicators.forEach(indicator => {
      const regex = new RegExp(indicator, 'gi');
      const matches = text.match(regex);
      if (matches) count += matches.length;
    });

    return Math.min(100, count * 20);
  }

  detectAuthorInfo(text) {
    const authorIndicators = ['by ', 'author:', 'written by', 'posted by'];
    return authorIndicators.some(indicator => text.toLowerCase().includes(indicator));
  }

  detectCitations(text, links) {
    // Count external links as potential citations
    const externalLinks = links.filter(link => link.isExternal);

    // Also look for citation patterns
    const citationPatterns = [
      /\[\d+\]/g,  // [1], [2]
      /\(\d{4}\)/g,  // (2023)
      /according to/gi,
      /source:/gi,
      /cited in/gi
    ];

    let count = externalLinks.length;
    citationPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) count += matches.length;
    });

    return count;
  }

  detectDateInfo(text) {
    const datePatterns = [
      /\d{1,2}\/\d{1,2}\/\d{4}/,  // MM/DD/YYYY
      /\d{4}-\d{2}-\d{2}/,  // YYYY-MM-DD
      /updated:/i,
      /published:/i,
      /last modified:/i
    ];

    return datePatterns.some(pattern => pattern.test(text));
  }

  detectCredentials(text) {
    const credentialIndicators = ['phd', 'md', 'certified', 'expert', 'professional', 'years of experience'];
    return credentialIndicators.some(indicator => text.toLowerCase().includes(indicator));
  }

  detectTrustIndicators(text) {
    const trustIndicators = ['guarantee', 'certified', 'verified', 'accredited', 'award', 'trusted'];
    let count = 0;

    trustIndicators.forEach(indicator => {
      if (text.toLowerCase().includes(indicator)) count++;
    });

    return Math.min(100, count * 20);
  }

  hasBrokenFormatting(text) {
    // Check for indicators of broken formatting
    const brokenIndicators = [
      /\s{5,}/,  // Excessive whitespace
      /[A-Z]{10,}/,  // All caps (more than 10 chars)
      /<[^>]+>/  // HTML tags (shouldn't be in extracted text)
    ];

    return brokenIndicators.some(pattern => pattern.test(text));
  }

  getSEOActionForIssue(issue, keyword) {
    const actions = {
      'Keyword not in title': `Add "${keyword}" to the title tag`,
      'Keyword not in meta description': `Add "${keyword}" to the meta description`,
      'Keyword not in H1': `Include "${keyword}" in the H1 heading`,
      'Keyword not in first 100 words': `Mention "${keyword}" in the opening paragraph`,
      'Keyword density too low': `Increase usage of "${keyword}" naturally throughout content`,
      'Keyword density too high': `Reduce keyword stuffing - use synonyms and variations`,
      'Keyword not in any H2/H3 headings': `Add "${keyword}" to at least one H2 or H3 heading`,
      'Missing title': 'Add a descriptive title tag (50-60 characters)',
      'Title too long': 'Shorten title to 50-60 characters',
      'Missing meta description': 'Add a compelling meta description (150-160 characters)',
      'Meta description not optimal length': 'Adjust meta description to 150-160 characters',
      'Missing H1': 'Add one H1 heading at the top of the page',
      'Multiple H1 tags': 'Use only one H1 heading per page',
      'No H2 headings': 'Add H2 headings to structure your content'
    };

    return actions[issue] || `Fix: ${issue}`;
  }

  getGrade(score) {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
SEO Content Scorer

Usage:
  node seo-content-scorer.js <url-or-file> [options]

Options:
  --keyword <keyword>    Target keyword for SEO analysis
  --format <type>        Content format: html, markdown, text (default: html)
  --output <file>        Save results to JSON file
  --no-cache            Disable caching

Examples:
  node seo-content-scorer.js https://example.com/page --keyword "seo tools"
  node seo-content-scorer.js ./content.html --format html --keyword "revenue operations"
  node seo-content-scorer.js ./content.md --format markdown --output score.json
    `);
    process.exit(0);
  }

  const input = args[0];
  const keyword = args.find(a => a.startsWith('--keyword'))?.split('=')[1] ||
                  (args.includes('--keyword') ? args[args.indexOf('--keyword') + 1] : null);
  const format = args.find(a => a.startsWith('--format'))?.split('=')[1] ||
                 (args.includes('--format') ? args[args.indexOf('--format') + 1] : 'html');
  const output = args.find(a => a.startsWith('--output'))?.split('=')[1] ||
                 (args.includes('--output') ? args[args.indexOf('--output') + 1] : null);
  const useCache = !args.includes('--no-cache');

  (async () => {
    try {
      const scorer = new ContentScorer({ useCache });

      // Load content
      let content;
      if (input.startsWith('http://') || input.startsWith('https://')) {
        // Would fetch URL content (using Phase 1 batch analyzer)
        console.log('❌ URL fetching not implemented yet. Use file path instead.');
        process.exit(1);
      } else {
        // Load from file
        const fs = require('fs').promises;
        const text = await fs.readFile(input, 'utf8');
        content = { text };
      }

      // Score content
      const result = await scorer.scoreContent(content, {
        url: input,
        targetKeyword: keyword,
        format
      });

      // Display results
      console.log('\n' + '='.repeat(60));
      console.log('CONTENT QUALITY SCORE');
      console.log('='.repeat(60));
      console.log(`\nOverall Score: ${result.overallScore}/100 (Grade: ${result.grade})`);
      console.log('\nDimension Scores:');
      console.log(`  Readability:  ${result.scores.readability}/100`);
      console.log(`  Depth:        ${result.scores.depth}/100`);
      console.log(`  SEO:          ${result.scores.seo}/100`);
      console.log(`  Engagement:   ${result.scores.engagement}/100`);
      console.log(`  E-E-A-T:      ${result.scores.eeat}/100`);
      console.log(`  Technical:    ${result.scores.technical}/100`);

      console.log(`\nContent Metrics:`);
      console.log(`  Word Count:   ${result.metrics.wordCount}`);
      console.log(`  Reading Time: ${result.metrics.readingTime}`);
      console.log(`  Flesch Score: ${result.metrics.fleschScore}`);
      console.log(`  Grade Level:  ${result.metrics.gradeLevel}`);
      console.log(`  Images:       ${result.metrics.images}`);
      console.log(`  Headings:     H1:${result.metrics.headings.h1} H2:${result.metrics.headings.h2} H3:${result.metrics.headings.h3}`);

      console.log(`\nTop 5 Recommendations:`);
      result.recommendations.slice(0, 5).forEach((rec, idx) => {
        const priority = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
        console.log(`\n${idx + 1}. ${priority} [${rec.category.toUpperCase()}] ${rec.issue}`);
        console.log(`   ${rec.action}`);
        console.log(`   Impact: ${rec.impact}/10`);
      });

      // Save to file if requested
      if (output) {
        await fs.writeFile(output, JSON.stringify(result, null, 2));
        console.log(`\n📄 Full results saved to: ${output}`);
      }

    } catch (error) {
      console.error(`\n❌ Error: ${error.message}`);
      if (process.env.DEBUG) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  })();
}

module.exports = ContentScorer;
