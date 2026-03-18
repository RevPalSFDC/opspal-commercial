#!/usr/bin/env node

/**
 * SEO AEO Optimizer
 *
 * Optimizes content for Answer Engine Optimization (AEO) including:
 * - Featured snippet opportunities
 * - People Also Ask (PAA) questions
 * - Answer quality scoring
 * - Schema.org recommendations
 * - Snippet format optimization
 *
 * Part of Phase 3: Content Optimization & AEO
 *
 * Usage:
 *   node seo-aeo-optimizer.js <url-or-file> --keyword "target keyword"
 *   node seo-aeo-optimizer.js ./content.md --format markdown --analyze-paa
 *   node seo-aeo-optimizer.js https://example.com --output aeo-report.json
 */

const fs = require('fs');
const path = require('path');
const { URL } = require('url');

class SEOAEOOptimizer {
  constructor(options = {}) {
    this.options = {
      minAnswerLength: 40,
      maxAnswerLength: 300,
      minQualityScore: 5,
      ...options
    };

    // Common question patterns for PAA detection
    this.questionPatterns = [
      /^(what|how|why|when|where|who|which|whose)\s/i,
      /^(can|could|should|would|will|do|does|did|is|are|was|were)\s/i,
      /\?$/
    ];

    // Answer format patterns
    this.answerFormats = {
      paragraph: {
        pattern: /^[A-Z][^.!?]*[.!?]\s+[A-Z]/m,
        minWords: 40,
        maxWords: 60
      },
      list: {
        pattern: /^(\d+\.|[-*•])\s/m,
        minItems: 3,
        maxItems: 10
      },
      table: {
        pattern: /<table|^\|.*\|$/m,
        minColumns: 2,
        minRows: 3
      },
      definition: {
        pattern: /^[A-Z][^.!?]+(is|are|refers to|means|describes)/i,
        minWords: 20,
        maxWords: 50
      }
    };

    // Schema.org types for different content patterns
    this.schemaTypes = {
      'how-to': 'HowTo',
      'faq': 'FAQPage',
      'qa': 'QAPage',
      'article': 'Article',
      'definition': 'DefinedTerm',
      'recipe': 'Recipe',
      'video': 'VideoObject'
    };
  }

  /**
   * Analyze content for AEO opportunities
   */
  async analyzeContent(input, options = {}) {
    const {
      format = 'html',
      targetKeyword = '',
      analyzePAA = false,
      includeSchema = true
    } = options;

    console.log('🎯 Analyzing content for AEO opportunities...');

    // Extract content based on format
    let content, metadata;
    if (this.isUrl(input)) {
      ({ content, metadata } = await this.fetchContent(input));
    } else {
      ({ content, metadata } = await this.readFile(input, format));
    }

    const extracted = this.extractTextElements(content, format);

    // Analyze snippet opportunities
    const snippetOpportunities = this.analyzeSnippetOpportunities(
      extracted,
      targetKeyword
    );

    // Analyze PAA questions if requested
    let paaQuestions = [];
    if (analyzePAA) {
      paaQuestions = this.analyzePAAQuestions(extracted);
    }

    // Generate schema recommendations
    let schemaRecommendations = [];
    if (includeSchema) {
      schemaRecommendations = this.generateSchemaRecommendations(
        extracted,
        snippetOpportunities
      );
    }

    // Calculate overall AEO score
    const aeoScore = this.calculateAEOScore(
      snippetOpportunities,
      paaQuestions,
      extracted
    );

    return {
      url: input,
      targetKeyword,
      aeoScore,
      snippetOpportunities,
      paaQuestions,
      schemaRecommendations,
      summary: this.generateSummary(snippetOpportunities, paaQuestions, aeoScore)
    };
  }

  /**
   * Analyze featured snippet opportunities
   */
  analyzeSnippetOpportunities(extracted, targetKeyword) {
    const opportunities = [];

    // Analyze paragraph snippets
    const paragraphOpps = this.analyzeParagraphSnippets(extracted, targetKeyword);
    opportunities.push(...paragraphOpps);

    // Analyze list snippets
    const listOpps = this.analyzeListSnippets(extracted, targetKeyword);
    opportunities.push(...listOpps);

    // Analyze table snippets
    const tableOpps = this.analyzeTableSnippets(extracted, targetKeyword);
    opportunities.push(...tableOpps);

    // Analyze definition snippets
    const definitionOpps = this.analyzeDefinitionSnippets(extracted, targetKeyword);
    opportunities.push(...definitionOpps);

    // Analyze how-to snippets
    const howToOpps = this.analyzeHowToSnippets(extracted, targetKeyword);
    opportunities.push(...howToOpps);

    // Sort by opportunity score (highest first)
    return opportunities.sort((a, b) => b.opportunity - a.opportunity);
  }

  /**
   * Analyze paragraph snippet opportunities
   */
  analyzeParagraphSnippets(extracted, targetKeyword) {
    const opportunities = [];
    const { paragraphs, headings } = extracted;

    // Look for question headings with direct answers
    headings.forEach(heading => {
      if (this.isQuestion(heading.text)) {
        // Find paragraphs immediately following this heading
        const answerParagraphs = this.findAnswerParagraphs(
          paragraphs,
          heading.position
        );

        if (answerParagraphs.length > 0) {
          const answer = answerParagraphs[0];
          const wordCount = this.countWords(answer);

          opportunities.push({
            type: 'paragraph',
            keyword: this.extractKeyword(heading.text, targetKeyword),
            question: heading.text,
            currentFormat: wordCount >= 40 && wordCount <= 60 ? 'paragraph' : 'long_paragraph',
            recommendedFormat: 'concise_paragraph',
            opportunity: this.scoreOpportunity({
              hasQuestion: true,
              hasDirectAnswer: true,
              wordCount,
              targetLength: 50,
              keywordMatch: this.matchesKeyword(heading.text, targetKeyword)
            }),
            currentAnswer: this.truncate(answer, 200),
            suggestedAnswer: this.optimizeParagraphAnswer(answer, targetKeyword),
            schemaRecommendation: 'FAQPage',
            improvements: this.generateParagraphImprovements(answer, wordCount)
          });
        }
      }
    });

    return opportunities;
  }

  /**
   * Analyze list snippet opportunities
   */
  analyzeListSnippets(extracted, targetKeyword) {
    const opportunities = [];
    const { lists, headings } = extracted;

    // Look for how-to or numbered list patterns
    headings.forEach(heading => {
      if (this.isHowToQuestion(heading.text) || this.isListQuestion(heading.text)) {
        // Find lists following this heading
        const relevantLists = this.findRelevantLists(lists, heading.position);

        if (relevantLists.length > 0) {
          const list = relevantLists[0];
          const itemCount = list.items.length;

          opportunities.push({
            type: 'list',
            keyword: this.extractKeyword(heading.text, targetKeyword),
            question: heading.text,
            currentFormat: list.ordered ? 'numbered_list' : 'bullet_list',
            recommendedFormat: this.isHowToQuestion(heading.text) ? 'numbered_list' : 'bullet_list',
            opportunity: this.scoreOpportunity({
              hasQuestion: true,
              hasStructuredAnswer: true,
              itemCount,
              targetItemCount: 5,
              keywordMatch: this.matchesKeyword(heading.text, targetKeyword),
              isHowTo: this.isHowToQuestion(heading.text)
            }),
            currentAnswer: `${itemCount} items in ${list.ordered ? 'numbered' : 'bullet'} list`,
            suggestedAnswer: this.optimizeListAnswer(list, targetKeyword),
            schemaRecommendation: this.isHowToQuestion(heading.text) ? 'HowTo' : 'FAQPage',
            improvements: this.generateListImprovements(list)
          });
        }
      }
    });

    return opportunities;
  }

  /**
   * Analyze table snippet opportunities
   */
  analyzeTableSnippets(extracted, targetKeyword) {
    const opportunities = [];
    const { tables, headings } = extracted;

    // Look for comparison or data-heavy questions
    headings.forEach(heading => {
      if (this.isComparisonQuestion(heading.text)) {
        const relevantTables = this.findRelevantTables(tables, heading.position);

        if (relevantTables.length > 0) {
          const table = relevantTables[0];

          opportunities.push({
            type: 'table',
            keyword: this.extractKeyword(heading.text, targetKeyword),
            question: heading.text,
            currentFormat: 'table',
            recommendedFormat: 'comparison_table',
            opportunity: this.scoreOpportunity({
              hasQuestion: true,
              hasTableAnswer: true,
              rowCount: table.rows.length,
              columnCount: table.columns.length,
              keywordMatch: this.matchesKeyword(heading.text, targetKeyword)
            }),
            currentAnswer: `${table.rows.length}x${table.columns.length} table`,
            suggestedAnswer: this.optimizeTableAnswer(table, targetKeyword),
            schemaRecommendation: 'FAQPage',
            improvements: this.generateTableImprovements(table)
          });
        }
      }
    });

    return opportunities;
  }

  /**
   * Analyze definition snippet opportunities
   */
  analyzeDefinitionSnippets(extracted, targetKeyword) {
    const opportunities = [];
    const { paragraphs, headings } = extracted;

    // Look for "what is" questions
    headings.forEach(heading => {
      if (this.isDefinitionQuestion(heading.text)) {
        const answerParagraphs = this.findAnswerParagraphs(paragraphs, heading.position);

        if (answerParagraphs.length > 0) {
          const answer = answerParagraphs[0];
          const isDefinition = this.hasDefinitionPattern(answer);

          if (isDefinition) {
            opportunities.push({
              type: 'definition',
              keyword: this.extractKeyword(heading.text, targetKeyword),
              question: heading.text,
              currentFormat: 'definition',
              recommendedFormat: 'concise_definition',
              opportunity: this.scoreOpportunity({
                hasQuestion: true,
                hasDefinition: true,
                isConcise: this.countWords(answer) <= 50,
                keywordMatch: this.matchesKeyword(heading.text, targetKeyword)
              }),
              currentAnswer: this.truncate(answer, 200),
              suggestedAnswer: this.optimizeDefinitionAnswer(answer, targetKeyword),
              schemaRecommendation: 'DefinedTerm',
              improvements: this.generateDefinitionImprovements(answer)
            });
          }
        }
      }
    });

    return opportunities;
  }

  /**
   * Analyze how-to snippet opportunities
   */
  analyzeHowToSnippets(extracted, targetKeyword) {
    const opportunities = [];
    const { headings, lists, paragraphs } = extracted;

    headings.forEach(heading => {
      if (this.isHowToQuestion(heading.text)) {
        const hasNumberedList = this.findRelevantLists(lists, heading.position).some(l => l.ordered);
        const hasParagraphs = this.findAnswerParagraphs(paragraphs, heading.position).length > 0;

        if (hasNumberedList || hasParagraphs) {
          opportunities.push({
            type: 'how-to',
            keyword: this.extractKeyword(heading.text, targetKeyword),
            question: heading.text,
            currentFormat: hasNumberedList ? 'numbered_steps' : 'paragraph_steps',
            recommendedFormat: 'numbered_steps_with_schema',
            opportunity: this.scoreOpportunity({
              hasQuestion: true,
              hasSteps: hasNumberedList,
              keywordMatch: this.matchesKeyword(heading.text, targetKeyword),
              isHowTo: true
            }),
            currentAnswer: hasNumberedList ? 'Has numbered steps' : 'Steps in paragraph format',
            suggestedAnswer: 'Add HowTo schema markup for better visibility',
            schemaRecommendation: 'HowTo',
            improvements: this.generateHowToImprovements(hasNumberedList)
          });
        }
      }
    });

    return opportunities;
  }

  /**
   * Analyze People Also Ask (PAA) questions
   */
  analyzePAAQuestions(extracted) {
    const paaQuestions = [];
    const { headings, paragraphs } = extracted;

    // Extract all questions from headings
    const questions = headings
      .filter(h => this.isQuestion(h.text))
      .map(h => h.text);

    // Analyze each question
    questions.forEach(question => {
      const heading = headings.find(h => h.text === question);
      const answerParagraphs = this.findAnswerParagraphs(paragraphs, heading.position);
      const hasAnswer = answerParagraphs.length > 0;

      if (hasAnswer) {
        const answer = answerParagraphs[0];
        const quality = this.scoreAnswerQuality(answer, question);

        paaQuestions.push({
          question,
          answered: true,
          quality,
          answerLength: this.countWords(answer),
          answerPreview: this.truncate(answer, 150),
          improvements: this.generateAnswerImprovements(answer, question, quality)
        });
      } else {
        paaQuestions.push({
          question,
          answered: false,
          quality: 0,
          improvements: ['Add a direct answer to this question']
        });
      }
    });

    return paaQuestions;
  }

  /**
   * Generate schema recommendations
   */
  generateSchemaRecommendations(extracted, snippetOpportunities) {
    const recommendations = [];
    const schemaTypes = new Set();

    // Recommend schemas based on snippet opportunities
    snippetOpportunities.forEach(opp => {
      if (opp.schemaRecommendation && !schemaTypes.has(opp.schemaRecommendation)) {
        schemaTypes.add(opp.schemaRecommendation);

        recommendations.push({
          type: opp.schemaRecommendation,
          reason: `Recommended for ${opp.type} snippet optimization`,
          priority: opp.opportunity >= 7 ? 'high' : 'medium',
          implementation: this.getSchemaImplementation(opp.schemaRecommendation),
          benefit: this.getSchemaBenefit(opp.schemaRecommendation)
        });
      }
    });

    return recommendations;
  }

  /**
   * Calculate overall AEO score (0-100)
   */
  calculateAEOScore(snippetOpportunities, paaQuestions, extracted) {
    let score = 0;
    let maxScore = 100;

    // Snippet opportunities (50 points)
    const avgOpportunity = snippetOpportunities.length > 0
      ? snippetOpportunities.reduce((sum, o) => sum + o.opportunity, 0) / snippetOpportunities.length
      : 0;
    score += (avgOpportunity / 10) * 50;

    // PAA question coverage (30 points)
    const answeredQuestions = paaQuestions.filter(q => q.answered).length;
    const avgQuality = paaQuestions.length > 0
      ? paaQuestions.filter(q => q.answered).reduce((sum, q) => sum + q.quality, 0) / Math.max(answeredQuestions, 1)
      : 0;
    score += (avgQuality / 10) * 30;

    // Content structure (20 points)
    const hasLists = extracted.lists.length > 0;
    const hasTables = extracted.tables.length > 0;
    const hasQuestions = extracted.headings.some(h => this.isQuestion(h.text));

    if (hasLists) score += 7;
    if (hasTables) score += 7;
    if (hasQuestions) score += 6;

    return Math.round(Math.min(score, maxScore));
  }

  /**
   * Generate summary
   */
  generateSummary(snippetOpportunities, paaQuestions, aeoScore) {
    const highOpportunities = snippetOpportunities.filter(o => o.opportunity >= 7).length;
    const mediumOpportunities = snippetOpportunities.filter(o => o.opportunity >= 5 && o.opportunity < 7).length;
    const answeredQuestions = paaQuestions.filter(q => q.answered).length;
    const unansweredQuestions = paaQuestions.filter(q => !q.answered).length;

    return {
      aeoScore,
      grade: this.scoreToGrade(aeoScore),
      totalOpportunities: snippetOpportunities.length,
      highOpportunities,
      mediumOpportunities,
      questionsAnswered: answeredQuestions,
      questionsUnanswered: unansweredQuestions,
      topOpportunity: snippetOpportunities[0] || null
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Extract text elements from content
   */
  extractTextElements(content, format) {
    const elements = {
      headings: [],
      paragraphs: [],
      lists: [],
      tables: [],
      questions: []
    };

    if (format === 'html') {
      elements.headings = this.extractHeadingsFromHTML(content);
      elements.paragraphs = this.extractParagraphsFromHTML(content);
      elements.lists = this.extractListsFromHTML(content);
      elements.tables = this.extractTablesFromHTML(content);
    } else if (format === 'markdown') {
      elements.headings = this.extractHeadingsFromMarkdown(content);
      elements.paragraphs = this.extractParagraphsFromMarkdown(content);
      elements.lists = this.extractListsFromMarkdown(content);
      elements.tables = this.extractTablesFromMarkdown(content);
    } else {
      // Plain text
      elements.paragraphs = content.split('\n\n').filter(p => p.trim());
    }

    return elements;
  }

  extractHeadingsFromHTML(html) {
    const headings = [];
    const headingRegex = /<h([1-6])[^>]*>(.*?)<\/h\1>/gi;
    let match;
    let position = 0;

    while ((match = headingRegex.exec(html)) !== null) {
      headings.push({
        level: parseInt(match[1]),
        text: this.stripHTML(match[2]),
        position: position++
      });
    }

    return headings;
  }

  extractParagraphsFromHTML(html) {
    const paragraphs = [];
    const paragraphRegex = /<p[^>]*>(.*?)<\/p>/gi;
    let match;

    while ((match = paragraphRegex.exec(html)) !== null) {
      const text = this.stripHTML(match[1]).trim();
      if (text) {
        paragraphs.push(text);
      }
    }

    return paragraphs;
  }

  extractListsFromHTML(html) {
    const lists = [];
    const listRegex = /<(ul|ol)[^>]*>(.*?)<\/\1>/gis;
    let match;
    let position = 0;

    while ((match = listRegex.exec(html)) !== null) {
      const ordered = match[1] === 'ol';
      const items = [];
      const itemRegex = /<li[^>]*>(.*?)<\/li>/gi;
      let itemMatch;

      while ((itemMatch = itemRegex.exec(match[2])) !== null) {
        items.push(this.stripHTML(itemMatch[1]).trim());
      }

      if (items.length > 0) {
        lists.push({
          ordered,
          items,
          position: position++
        });
      }
    }

    return lists;
  }

  extractTablesFromHTML(html) {
    const tables = [];
    const tableRegex = /<table[^>]*>(.*?)<\/table>/gis;
    let match;
    let position = 0;

    while ((match = tableRegex.exec(html)) !== null) {
      const rows = [];
      const rowRegex = /<tr[^>]*>(.*?)<\/tr>/gis;
      let rowMatch;

      while ((rowMatch = rowRegex.exec(match[1])) !== null) {
        const cells = [];
        const cellRegex = /<t[hd][^>]*>(.*?)<\/t[hd]>/gi;
        let cellMatch;

        while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
          cells.push(this.stripHTML(cellMatch[1]).trim());
        }

        if (cells.length > 0) {
          rows.push(cells);
        }
      }

      if (rows.length > 0) {
        tables.push({
          rows,
          columns: rows[0] || [],
          position: position++
        });
      }
    }

    return tables;
  }

  extractHeadingsFromMarkdown(markdown) {
    const headings = [];
    const lines = markdown.split('\n');
    let position = 0;

    lines.forEach(line => {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        headings.push({
          level: match[1].length,
          text: match[2].trim(),
          position: position++
        });
      }
    });

    return headings;
  }

  extractParagraphsFromMarkdown(markdown) {
    return markdown
      .split(/\n\n+/)
      .map(p => p.trim())
      .filter(p => p && !p.match(/^#{1,6}\s/) && !p.match(/^[-*\d+.]\s/));
  }

  extractListsFromMarkdown(markdown) {
    const lists = [];
    const blocks = markdown.split(/\n\n+/);
    let position = 0;

    blocks.forEach(block => {
      const lines = block.split('\n');
      const items = [];
      let ordered = false;

      lines.forEach(line => {
        const numberedMatch = line.match(/^\d+\.\s+(.+)$/);
        const bulletMatch = line.match(/^[-*]\s+(.+)$/);

        if (numberedMatch) {
          ordered = true;
          items.push(numberedMatch[1].trim());
        } else if (bulletMatch) {
          items.push(bulletMatch[1].trim());
        }
      });

      if (items.length > 0) {
        lists.push({ ordered, items, position: position++ });
      }
    });

    return lists;
  }

  extractTablesFromMarkdown(markdown) {
    const tables = [];
    const blocks = markdown.split(/\n\n+/);
    let position = 0;

    blocks.forEach(block => {
      const lines = block.split('\n').filter(l => l.trim().startsWith('|'));
      if (lines.length >= 2) {
        const rows = lines
          .map(line => line.split('|').slice(1, -1).map(cell => cell.trim()))
          .filter((row, i) => i !== 1); // Skip separator row

        if (rows.length > 0) {
          tables.push({
            rows,
            columns: rows[0],
            position: position++
          });
        }
      }
    });

    return tables;
  }

  /**
   * Question detection helpers
   */
  isQuestion(text) {
    return this.questionPatterns.some(pattern => pattern.test(text));
  }

  isHowToQuestion(text) {
    return /^how\s+(to|do|can)/i.test(text);
  }

  isListQuestion(text) {
    return /(what are|which|list of|types of|ways to|steps)/i.test(text);
  }

  isComparisonQuestion(text) {
    return /(compare|comparison|vs|versus|difference|best)/i.test(text);
  }

  isDefinitionQuestion(text) {
    return /^what\s+(is|are|does|means)/i.test(text);
  }

  hasDefinitionPattern(text) {
    return /^[A-Z][^.!?]+(is|are|refers to|means|describes)/i.test(text);
  }

  /**
   * Content finding helpers
   */
  findAnswerParagraphs(paragraphs, headingPosition) {
    // Find paragraphs that appear after this heading
    // In a real implementation, we'd track paragraph positions
    return paragraphs.slice(0, 3); // Return first 3 paragraphs as approximation
  }

  findRelevantLists(lists, headingPosition) {
    // Find lists near this heading position
    return lists.filter(list => Math.abs(list.position - headingPosition) <= 2);
  }

  findRelevantTables(tables, headingPosition) {
    return tables.filter(table => Math.abs(table.position - headingPosition) <= 2);
  }

  /**
   * Scoring helpers
   */
  scoreOpportunity(factors) {
    let score = 0;

    if (factors.hasQuestion) score += 2;
    if (factors.hasDirectAnswer) score += 2;
    if (factors.hasStructuredAnswer) score += 2;
    if (factors.hasTableAnswer) score += 2;
    if (factors.hasDefinition) score += 2;
    if (factors.hasSteps) score += 1;
    if (factors.keywordMatch) score += 2;
    if (factors.isHowTo) score += 1;

    // Word count scoring
    if (factors.wordCount && factors.targetLength) {
      const diff = Math.abs(factors.wordCount - factors.targetLength);
      if (diff < 10) score += 1;
    }

    // Item count scoring
    if (factors.itemCount && factors.targetItemCount) {
      const diff = Math.abs(factors.itemCount - factors.targetItemCount);
      if (diff < 3) score += 1;
    }

    // Conciseness bonus
    if (factors.isConcise) score += 1;

    return Math.min(score, 10);
  }

  scoreAnswerQuality(answer, question) {
    let score = 5; // Base score

    const wordCount = this.countWords(answer);

    // Length scoring
    if (wordCount >= 40 && wordCount <= 100) score += 2;
    else if (wordCount >= 100 && wordCount <= 200) score += 1;
    else if (wordCount > 300) score -= 1;

    // Direct answer scoring
    if (this.hasDirectAnswer(answer, question)) score += 2;

    // Clarity scoring
    if (this.isClearAnswer(answer)) score += 1;

    return Math.min(Math.max(score, 0), 10);
  }

  hasDirectAnswer(answer, question) {
    // Check if answer directly addresses the question
    const questionWords = question.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const answerLower = answer.toLowerCase();
    const matches = questionWords.filter(word => answerLower.includes(word)).length;
    return matches >= questionWords.length * 0.5;
  }

  isClearAnswer(answer) {
    // Check for clear, well-structured answer
    return /^[A-Z]/.test(answer) && /[.!?]$/.test(answer);
  }

  /**
   * Optimization helpers
   */
  optimizeParagraphAnswer(answer, targetKeyword) {
    const words = this.countWords(answer);
    if (words <= 60) {
      return 'Current answer is well-optimized for featured snippets';
    }
    return `Shorten answer to 40-60 words. Current: ${words} words. Focus on direct answer to question.`;
  }

  optimizeListAnswer(list, targetKeyword) {
    const itemCount = list.items.length;
    if (itemCount >= 3 && itemCount <= 10) {
      return `Current list format (${itemCount} items) is good for featured snippets`;
    }
    return `Optimize list to 3-10 items. Current: ${itemCount} items.`;
  }

  optimizeTableAnswer(table, targetKeyword) {
    const rows = table.rows.length;
    const cols = table.columns.length;

    if (rows >= 3 && cols >= 2) {
      return `Table format (${rows}x${cols}) is suitable for featured snippets`;
    }
    return `Ensure table has at least 3 rows and 2 columns for better snippet visibility`;
  }

  optimizeDefinitionAnswer(answer, targetKeyword) {
    const words = this.countWords(answer);
    if (words <= 50 && this.hasDefinitionPattern(answer)) {
      return 'Definition format is well-optimized';
    }
    return 'Create concise 20-50 word definition starting with "[Term] is/are/refers to..."';
  }

  /**
   * Improvement generation
   */
  generateParagraphImprovements(answer, wordCount) {
    const improvements = [];

    if (wordCount > 60) {
      improvements.push('Shorten answer to 40-60 words for optimal snippet length');
    }
    if (wordCount < 40) {
      improvements.push('Expand answer to at least 40 words for completeness');
    }
    if (!this.hasDirectAnswer(answer, '')) {
      improvements.push('Start with a direct answer before providing details');
    }

    return improvements;
  }

  generateListImprovements(list) {
    const improvements = [];

    if (list.items.length > 10) {
      improvements.push('Reduce list to 3-10 items for better snippet capture');
    }
    if (list.items.length < 3) {
      improvements.push('Expand list to at least 3 items');
    }
    if (!list.ordered && this.shouldBeOrdered(list)) {
      improvements.push('Convert to numbered list for step-by-step content');
    }

    return improvements;
  }

  generateTableImprovements(table) {
    const improvements = [];

    if (table.rows.length < 3) {
      improvements.push('Add more rows to table (minimum 3 for snippets)');
    }
    if (table.columns.length < 2) {
      improvements.push('Ensure table has at least 2 columns');
    }

    return improvements;
  }

  generateDefinitionImprovements(answer) {
    const improvements = [];

    if (!this.hasDefinitionPattern(answer)) {
      improvements.push('Restructure as clear definition: "[Term] is/are/refers to..."');
    }
    if (this.countWords(answer) > 50) {
      improvements.push('Shorten definition to 20-50 words');
    }

    return improvements;
  }

  generateHowToImprovements(hasNumberedList) {
    const improvements = [];

    if (!hasNumberedList) {
      improvements.push('Convert steps to numbered list format');
    }
    improvements.push('Add HowTo schema markup for enhanced SERP visibility');
    improvements.push('Include time estimates for each step if applicable');

    return improvements;
  }

  generateAnswerImprovements(answer, question, quality) {
    const improvements = [];

    if (quality < 5) {
      improvements.push('Improve answer quality and relevance to question');
    }
    if (quality >= 5 && quality < 7) {
      improvements.push('Enhance answer with more specific details');
    }
    if (!this.hasDirectAnswer(answer, question)) {
      improvements.push('Provide more direct answer to the specific question');
    }

    return improvements;
  }

  shouldBeOrdered(list) {
    // Check if list items suggest sequential steps
    const sequentialWords = ['first', 'second', 'third', 'then', 'next', 'finally', 'step'];
    return list.items.some(item =>
      sequentialWords.some(word => item.toLowerCase().includes(word))
    );
  }

  /**
   * Schema helpers
   */
  getSchemaImplementation(schemaType) {
    const implementations = {
      'HowTo': 'Add HowTo schema with step-by-step instructions',
      'FAQPage': 'Add FAQPage schema for question-answer pairs',
      'QAPage': 'Add QAPage schema for single Q&A',
      'Article': 'Add Article schema with author and publish date',
      'DefinedTerm': 'Add DefinedTerm schema for glossary terms'
    };
    return implementations[schemaType] || 'See Schema.org documentation';
  }

  getSchemaBenefit(schemaType) {
    const benefits = {
      'HowTo': 'Eligible for step-by-step rich results',
      'FAQPage': 'Shows expandable FAQ accordion in search results',
      'QAPage': 'Enhanced question visibility in search',
      'Article': 'Shows article metadata in search results',
      'DefinedTerm': 'Eligible for definition rich snippets'
    };
    return benefits[schemaType] || 'Improved search visibility';
  }

  /**
   * Utility helpers
   */
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
      content: '<html><body><h1>Sample</h1><p>Content</p></body></html>',
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

  stripHTML(html) {
    return html.replace(/<[^>]*>/g, '').trim();
  }

  countWords(text) {
    return text.split(/\s+/).filter(w => w.length > 0).length;
  }

  truncate(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  extractKeyword(text, targetKeyword) {
    if (targetKeyword && text.toLowerCase().includes(targetKeyword.toLowerCase())) {
      return targetKeyword;
    }
    // Extract main keywords from question
    const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    return words.slice(0, 3).join(' ');
  }

  matchesKeyword(text, targetKeyword) {
    if (!targetKeyword) return false;
    return text.toLowerCase().includes(targetKeyword.toLowerCase());
  }

  scoreToGrade(score) {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }
}

// ============================================================================
// CLI Interface
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
SEO AEO Optimizer - Optimize content for Answer Engine Optimization

Usage:
  node seo-aeo-optimizer.js <url-or-file> [options]

Options:
  --keyword <keyword>      Target keyword for optimization
  --format <format>        Input format: html, markdown, text (default: html)
  --analyze-paa            Include People Also Ask analysis
  --no-schema              Skip schema recommendations
  --output <file>          Save results to JSON file
  --help                   Show this help message

Examples:
  node seo-aeo-optimizer.js https://example.com/page --keyword "seo tools"
  node seo-aeo-optimizer.js ./content.md --format markdown --analyze-paa
  node seo-aeo-optimizer.js ./article.html --output aeo-report.json

Featured Snippet Types:
  - Paragraph snippets (40-60 words)
  - List snippets (3-10 items)
  - Table snippets (comparison data)
  - Definition snippets (concise definitions)
  - How-to snippets (step-by-step)
    `);
    process.exit(0);
  }

  const input = args[0];
  const options = {
    targetKeyword: '',
    format: 'html',
    analyzePAA: false,
    includeSchema: true,
    outputFile: null
  };

  // Parse command-line arguments
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--keyword' && args[i + 1]) {
      options.targetKeyword = args[i + 1];
      i++;
    } else if (args[i] === '--format' && args[i + 1]) {
      options.format = args[i + 1];
      i++;
    } else if (args[i] === '--analyze-paa') {
      options.analyzePAA = true;
    } else if (args[i] === '--no-schema') {
      options.includeSchema = false;
    } else if (args[i] === '--output' && args[i + 1]) {
      options.outputFile = args[i + 1];
      i++;
    }
  }

  // Validate format parameter
  const validFormats = ['html', 'markdown', 'text'];
  if (!validFormats.includes(options.format)) {
    console.error(`❌ Error: Invalid format '${options.format}'. Must be one of: ${validFormats.join(', ')}`);
    process.exit(1);
  }

  const optimizer = new SEOAEOOptimizer();

  try {
    const result = await optimizer.analyzeContent(input, options);

    // Save to file if specified
    if (options.outputFile) {
      fs.writeFileSync(options.outputFile, JSON.stringify(result, null, 2));
      console.log(`\n📄 Results saved to: ${options.outputFile}`);
    }

    // Display summary
    console.log('\n' + '='.repeat(60));
    console.log('SEO AEO OPTIMIZATION REPORT');
    console.log('='.repeat(60));
    console.log(`\nOverall AEO Score: ${result.aeoScore}/100 (${result.summary.grade})`);
    console.log(`\nSnippet Opportunities: ${result.summary.totalOpportunities}`);
    console.log(`  High Priority: ${result.summary.highOpportunities}`);
    console.log(`  Medium Priority: ${result.summary.mediumOpportunities}`);

    if (result.paaQuestions.length > 0) {
      console.log(`\nPAA Questions:`);
      console.log(`  Answered: ${result.summary.questionsAnswered}`);
      console.log(`  Unanswered: ${result.summary.questionsUnanswered}`);
    }

    if (result.summary.topOpportunity) {
      console.log(`\n🎯 Top Opportunity:`);
      console.log(`  Type: ${result.summary.topOpportunity.type}`);
      console.log(`  Keyword: ${result.summary.topOpportunity.keyword}`);
      console.log(`  Score: ${result.summary.topOpportunity.opportunity}/10`);
    }

    if (result.schemaRecommendations.length > 0) {
      console.log(`\n📋 Schema Recommendations:`);
      result.schemaRecommendations.forEach(schema => {
        console.log(`  - ${schema.type} (${schema.priority} priority)`);
      });
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

module.exports = SEOAEOOptimizer;
