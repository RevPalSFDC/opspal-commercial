#!/usr/bin/env node

/**
 * SEO Content Optimizer (Phase 4)
 *
 * Automatically generates AI-optimized content including TL;DR sections,
 * answer blocks, and FAQ content for improved AI search visibility.
 *
 * Features:
 * - Auto-generate TL;DR sections (40-60 words)
 * - Extract and format answer blocks for AI extraction
 * - Create FAQ sections from content
 * - Generate question-answer pairs
 * - Add structured content markup
 * - Optimize for voice search
 * - Create citation-ready content
 *
 * Usage:
 *   node seo-content-optimizer.js https://example.com
 *   node seo-content-optimizer.js https://example.com --generate-all
 *   node seo-content-optimizer.js ./crawl.json --output optimized.json
 *   node seo-content-optimizer.js https://example.com --focus tldr,faq
 *
 * @version 1.0.0
 * @phase Phase 4.0 - AI Search Optimization
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const zlib = require('zlib');
const nlp = require('compromise');

class SEOContentOptimizer {
  constructor() {
    this.optimizationTypes = [
      'tldr',           // TL;DR sections
      'answerBlocks',   // 40-60 word answer blocks
      'faq',            // FAQ sections
      'qa',             // Question-answer pairs
      'citations',      // Citation readiness
      'voiceSearch'     // Voice search optimization
    ];

    // Word count targets
    this.targets = {
      tldr: { min: 40, max: 60 },
      answerBlock: { min: 40, max: 60 },
      faqAnswer: { min: 30, max: 80 }
    };
  }

  /**
   * Optimize content from URL
   */
  async optimizeFromURL(url, options = {}) {
    const results = {
      url,
      optimizedAt: new Date().toISOString(),
      optimizations: {},
      warnings: [],
      stats: {}
    };

    try {
      // Fetch page content
      const content = await this.fetchURL(url);

      // Extract existing content structure
      const structure = this.analyzeContentStructure(content);
      results.stats.originalStructure = structure;

      // Determine which optimizations to apply
      const focusAreas = options.focus
        ? options.focus.split(',').map(f => f.trim())
        : this.optimizationTypes;

      // Generate optimizations
      for (const type of focusAreas) {
        let optimization = null;

        switch (type) {
          case 'tldr':
            optimization = this.generateTLDR(content, structure);
            break;
          case 'answerBlocks':
            optimization = this.generateAnswerBlocks(content, structure);
            break;
          case 'faq':
            optimization = this.generateFAQ(content, structure);
            break;
          case 'qa':
            optimization = this.generateQA(content, structure);
            break;
          case 'citations':
            optimization = this.optimizeCitations(content, structure);
            break;
          case 'voiceSearch':
            optimization = this.optimizeVoiceSearch(content, structure);
            break;
        }

        if (optimization) {
          results.optimizations[type] = optimization;
        } else {
          results.warnings.push({
            type,
            message: `Could not generate ${type} optimization - insufficient content`
          });
        }
      }

      // Calculate improvement metrics
      results.stats.improvements = this.calculateImprovements(
        structure,
        results.optimizations
      );

      return results;

    } catch (error) {
      throw new Error(`Content optimization failed: ${error.message}`);
    }
  }

  /**
   * Optimize content from JSON crawl data
   */
  async optimizeFromJSON(jsonPath, options = {}) {
    const results = {
      source: jsonPath,
      optimizedAt: new Date().toISOString(),
      pages: []
    };

    try {
      const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

      // Process each page
      const pages = data.pages || [data];
      for (const page of pages) {
        const pageResults = await this.optimizeFromURL(page.url, options);
        results.pages.push(pageResults);
      }

      return results;

    } catch (error) {
      throw new Error(`JSON processing failed: ${error.message}`);
    }
  }

  /**
   * Analyze content structure
   */
  analyzeContentStructure(content) {
    // DEBUG: Log content stats
    if (process.env.DEBUG) {
      console.error(`DEBUG: analyzeContentStructure() received content of type: ${typeof content}, length: ${content ? content.length : 0}`);
      if (content && content.length > 0) {
        console.error(`DEBUG: First 300 chars: ${content.substring(0, 300)}`);
        const pTagCount = (content.match(/<p/gi) || []).length;
        console.error(`DEBUG: Raw <p tag count (simple regex): ${pTagCount}`);
      }
    }

    const structure = {
      title: null,
      headings: [],
      paragraphs: [],
      lists: [],
      questions: [],
      definitions: [],
      keyPoints: [],
      wordCount: 0,
      hasSchema: false,
      hasTLDR: false,
      hasFAQ: false
    };

    // Extract title
    const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i) ||
                      content.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (titleMatch) {
      structure.title = this.cleanText(titleMatch[1]);
    }

    // Extract headings
    const headingMatches = content.matchAll(/<h([2-6])[^>]*>([^<]+)<\/h\1>/gi);
    for (const match of headingMatches) {
      structure.headings.push({
        level: parseInt(match[1]),
        text: this.cleanText(match[2])
      });
    }

    // Extract paragraphs (Bug Fix: Capture content with nested HTML tags)
    const paragraphMatches = content.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi);
    let paragraphCount = 0;
    for (const match of paragraphMatches) {
      paragraphCount++;
      // Strip all HTML tags from captured content
      const rawText = match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      const text = this.cleanText(rawText);
      if (text.length > 20) { // Filter out very short paragraphs
        structure.paragraphs.push(text);
        structure.wordCount += this.countWords(text);
      }
    }

    // DEBUG: Log extraction results
    if (process.env.DEBUG) {
      console.error(`DEBUG: Found ${paragraphCount} <p> tags, extracted ${structure.paragraphs.length} paragraphs`);
      if (structure.paragraphs.length > 0) {
        console.error(`DEBUG: First paragraph (${structure.paragraphs[0].length} chars): ${structure.paragraphs[0].substring(0, 100)}`);
      }
    }

    // Extract lists (Bug Fix: Capture list items with nested HTML tags)
    const listMatches = content.matchAll(/<(?:ul|ol)[^>]*>([\s\S]*?)<\/(?:ul|ol)>/gi);
    for (const match of listMatches) {
      const items = [];
      const itemMatches = match[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi);
      for (const item of itemMatches) {
        // Strip all HTML tags from captured content
        const rawText = item[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
        const cleanedText = this.cleanText(rawText);
        if (cleanedText.length > 0) {
          items.push(cleanedText);
        }
      }
      if (items.length > 0) {
        structure.lists.push(items);
      }
    }

    // Detect questions (heading or paragraph ending with ?)
    for (const heading of structure.headings) {
      if (heading.text.includes('?')) {
        structure.questions.push(heading.text);
      }
    }
    for (const para of structure.paragraphs) {
      const questionMatch = para.match(/^([^.!]+\?)/);
      if (questionMatch) {
        structure.questions.push(questionMatch[1]);
      }
    }

    // Detect definitions (is/are patterns)
    for (const para of structure.paragraphs) {
      const defMatch = para.match(/^([A-Z][^.!?]+(?:is|are)[^.!?]+[.!?])/);
      if (defMatch) {
        structure.definitions.push(defMatch[1]);
      }
    }

    // Check for existing TL;DR
    structure.hasTLDR = /(?:TL;?DR|Summary|Key Takeaways?|At a Glance)/i.test(content);

    // Check for existing FAQ
    structure.hasFAQ = /(?:FAQ|Frequently Asked Questions)/i.test(content) ||
                       /(?:Q:|Question:).*?(?:A:|Answer:)/i.test(content);

    // Check for schema
    structure.hasSchema = /"@type"\s*:\s*"(?:FAQPage|Article|BlogPosting)"/i.test(content);

    return structure;
  }

  /**
   * Generate TL;DR section (40-60 words)
   */
  generateTLDR(content, structure) {
    // If already has TL;DR, skip
    if (structure.hasTLDR) {
      return {
        skipped: true,
        reason: 'Page already has TL;DR section'
      };
    }

    // Strategy: Extract key sentences from first 2-3 paragraphs
    const keyParagraphs = structure.paragraphs.slice(0, 3);

    if (keyParagraphs.length === 0) {
      return null;
    }

    // Extract first sentence from each paragraph
    const keySentences = keyParagraphs.map(p => {
      const sentences = p.split(/[.!?]+/);
      return sentences[0].trim();
    }).filter(s => s.length > 0);

    // Combine and trim to 40-60 words
    let tldr = keySentences.join('. ') + '.';
    tldr = this.trimToWordCount(tldr, this.targets.tldr.min, this.targets.tldr.max);

    // If we have title, incorporate it
    if (structure.title) {
      // Check if TL;DR already mentions the main topic from title
      const mainTopic = this.extractMainTopic(structure.title);
      if (mainTopic && !tldr.toLowerCase().includes(mainTopic.toLowerCase())) {
        tldr = `${mainTopic} ${tldr}`;
        tldr = this.trimToWordCount(tldr, this.targets.tldr.min, this.targets.tldr.max);
      }
    }

    return {
      text: tldr,
      wordCount: this.countWords(tldr),
      html: this.formatTLDRHTML(tldr),
      placement: 'After hero section, before main content',
      validation: this.validateTLDR(tldr)
    };
  }

  /**
   * Generate answer blocks (40-60 word answers)
   */
  generateAnswerBlocks(content, structure) {
    const blocks = [];

    // Strategy 1: Generate answers from headings (if they're questions)
    for (const heading of structure.headings) {
      if (heading.text.includes('?')) {
        const answer = this.generateAnswerForQuestion(
          heading.text,
          structure.paragraphs,
          structure
        );

        if (answer) {
          blocks.push({
            question: heading.text,
            answer: answer.text,
            wordCount: answer.wordCount,
            html: this.formatAnswerBlockHTML(heading.text, answer.text),
            confidence: answer.confidence
          });
        }
      }
    }

    // Strategy 2: Generate answers from detected questions
    for (const question of structure.questions) {
      // Skip if already handled in headings
      if (structure.headings.some(h => h.text === question)) {
        continue;
      }

      const answer = this.generateAnswerForQuestion(
        question,
        structure.paragraphs,
        structure
      );

      if (answer) {
        blocks.push({
          question,
          answer: answer.text,
          wordCount: answer.wordCount,
          html: this.formatAnswerBlockHTML(question, answer.text),
          confidence: answer.confidence
        });
      }
    }

    // Strategy 3: Generate implicit questions from definitions
    for (const definition of structure.definitions.slice(0, 3)) {
      const implicit = this.generateImplicitQuestion(definition);
      if (implicit) {
        // Use improved algorithm to generate expanded answer
        const answer = this.generateAnswerForQuestion(
          implicit.question,
          structure.paragraphs,
          structure
        );

        if (answer) {
          blocks.push({
            question: implicit.question,
            answer: answer.text,
            wordCount: answer.wordCount,
            html: this.formatAnswerBlockHTML(implicit.question, answer.text),
            confidence: answer.confidence,
            type: 'implicit'
          });
        }
      }
    }

    return {
      blocks,
      count: blocks.length,
      placement: 'Throughout content, near related sections',
      validation: blocks.map(b => this.validateAnswerBlock(b))
    };
  }

  /**
   * Generate FAQ section
   */
  /**
   * Generate FAQ with answer-question mapping & duplicate detection (Phase 4.1 Feature 2)
   */
  generateFAQ(content, structure) {
    // If already has FAQ, skip
    if (structure.hasFAQ) {
      return {
        skipped: true,
        reason: 'Page already has FAQ section'
      };
    }

    const faqItems = [];

    // Step 1: Collect questions from content (extracted) and generate contextual questions
    const extractedQuestions = [
      ...structure.headings.filter(h => h.text.includes('?')).map(h => ({
        text: h.text,
        source: 'extracted',
        confidence: 'high'
      })),
      ...structure.questions.map(q => ({
        text: q,
        source: 'extracted',
        confidence: 'high'
      }))
    ];

    const contextualQuestions = this.generateContextualQuestions(content, structure);

    // Combine and deduplicate questions
    const allQuestions = [...extractedQuestions, ...contextualQuestions];
    const uniqueQuestions = [];
    const seenQuestions = new Set();

    for (const q of allQuestions) {
      const normalized = q.text.toLowerCase().trim();
      if (!seenQuestions.has(normalized)) {
        seenQuestions.add(normalized);
        uniqueQuestions.push(q);
      }
    }

    // Step 2: For each question, find best matching answer using ranking
    for (const question of uniqueQuestions.slice(0, 15)) { // Process up to 15 questions
      if (faqItems.length >= 10) break; // Limit to 10 FAQ items

      // Generate answer candidates for this question
      const answer = this.generateAnswerForQuestion(
        question.text,
        structure.paragraphs,
        structure
      );

      if (!answer) continue;

      // Step 3: Check if answer is duplicate of existing answers
      if (this.isDuplicateAnswer(answer.text, faqItems, 0.8)) {
        continue; // Skip duplicate answers
      }

      // Step 4: Add unique answer
      faqItems.push({
        question: question.text,
        answer: answer.text,
        wordCount: answer.wordCount,
        confidence: answer.confidence,
        source: question.source,
        generated: question.source === 'generated'
      });
    }

    if (faqItems.length === 0) {
      return null;
    }

    // Calculate uniqueness metrics
    const extractedCount = faqItems.filter(item => item.source === 'extracted').length;
    const generatedCount = faqItems.filter(item => item.source === 'generated').length;
    const extractedPercentage = Math.round((extractedCount / faqItems.length) * 100);

    return {
      items: faqItems,
      count: faqItems.length,
      html: this.formatFAQHTML(faqItems),
      schema: this.generateFAQSchema(faqItems),
      placement: 'Before footer section',
      validation: this.validateFAQ(faqItems),
      metrics: {
        extractedQuestions: extractedCount,
        generatedQuestions: generatedCount,
        extractedPercentage,
        totalQuestions: faqItems.length,
        averageAnswerLength: Math.round(
          faqItems.reduce((sum, item) => sum + item.wordCount, 0) / faqItems.length
        )
      }
    };
  }

  /**
   * Generate Q&A pairs
   */
  generateQA(content, structure) {
    const pairs = [];

    // Extract existing Q&A patterns
    const qaPattern = /(?:Q:|Question:)\s*([^?]+\?)\s*(?:A:|Answer:)\s*([^<\n]+)/gi;
    let match;

    while ((match = qaPattern.exec(content)) !== null) {
      pairs.push({
        question: this.cleanText(match[1]),
        answer: this.cleanText(match[2]),
        wordCount: this.countWords(match[2]),
        source: 'existing'
      });
    }

    // Generate new Q&A pairs from content
    for (const heading of structure.headings) {
      if (heading.text.includes('?')) {
        const answer = this.generateAnswerForQuestion(
          heading.text,
          structure.paragraphs,
          structure
        );

        if (answer && !pairs.some(p => p.question === heading.text)) {
          pairs.push({
            question: heading.text,
            answer: answer.text,
            wordCount: answer.wordCount,
            source: 'generated',
            confidence: answer.confidence
          });
        }
      }
    }

    return {
      pairs,
      count: pairs.length,
      html: this.formatQAHTML(pairs),
      placement: 'Throughout content sections'
    };
  }

  /**
   * Optimize citations (add author, dates, sources)
   */
  optimizeCitations(content, structure) {
    const citations = {
      hasAuthor: false,
      hasPublishDate: false,
      hasUpdateDate: false,
      hasSources: false,
      recommendations: []
    };

    // Check for author
    const authorMatch = content.match(/(?:by|author:?)\s*<a[^>]*>([^<]+)<\/a>/i) ||
                       content.match(/<meta[^>]*name=["']author["'][^>]*content=["']([^"']+)["']/i);

    citations.hasAuthor = !!authorMatch;
    if (authorMatch) {
      citations.author = this.cleanText(authorMatch[1]);
    } else {
      citations.recommendations.push({
        type: 'author',
        priority: 'high',
        suggestion: 'Add author byline with Person schema',
        implementation: this.generateAuthorHTML()
      });
    }

    // Check for dates
    const datePublished = content.match(/<time[^>]*datetime=["']([^"']+)["']/i) ||
                         content.match(/<meta[^>]*property=["']article:published_time["'][^>]*content=["']([^"']+)["']/i);

    citations.hasPublishDate = !!datePublished;
    if (!datePublished) {
      citations.recommendations.push({
        type: 'publishDate',
        priority: 'high',
        suggestion: 'Add publish date with schema',
        implementation: this.generateDateHTML('published', new Date().toISOString().split('T')[0])
      });
    }

    const dateModified = content.match(/<meta[^>]*property=["']article:modified_time["'][^>]*content=["']([^"']+)["']/i);

    citations.hasUpdateDate = !!dateModified;
    if (!dateModified) {
      citations.recommendations.push({
        type: 'updateDate',
        priority: 'medium',
        suggestion: 'Add last updated date',
        implementation: this.generateDateHTML('modified', new Date().toISOString().split('T')[0])
      });
    }

    // Check for external sources/references
    const externalLinks = content.match(/<a[^>]*href=["']https?:\/\/(?!.*(?:example\.com))[^"']+["'][^>]*>/gi);
    citations.hasSources = !!(externalLinks && externalLinks.length > 0);

    if (!citations.hasSources) {
      citations.recommendations.push({
        type: 'sources',
        priority: 'low',
        suggestion: 'Add sources section with external references',
        implementation: this.generateSourcesHTML()
      });
    }

    return citations;
  }

  /**
   * Optimize for voice search
   */
  optimizeVoiceSearch(content, structure) {
    const optimization = {
      conversationalQuestions: [],
      speakableContent: [],
      localContext: null,
      actionSchema: null
    };

    // Generate conversational versions of questions
    for (const question of structure.questions.slice(0, 5)) {
      const conversational = this.makeConversational(question);
      optimization.conversationalQuestions.push({
        original: question,
        conversational,
        answer: this.generateAnswerForQuestion(question, structure.paragraphs, structure)
      });
    }

    // Identify speakable content (concise, clear answers)
    for (const para of structure.paragraphs) {
      const wordCount = this.countWords(para);
      if (wordCount >= 20 && wordCount <= 50 && this.isSpeakable(para)) {
        optimization.speakableContent.push({
          text: para,
          wordCount,
          html: this.formatSpeakableHTML(para)
        });
      }
    }

    // Generate SpeakableSpecification schema
    if (optimization.speakableContent.length > 0) {
      optimization.speakableSchema = this.generateSpeakableSchema(
        optimization.speakableContent
      );
    }

    return optimization;
  }

  /**
   * Generate answer for a question from content (Phase 4.1 - Enhanced Algorithm)
   *
   * Improvements:
   * - NLP-based sentence boundary detection using compromise library
   * - Context expansion to meet 40-60 word target
   * - Relevance scoring for better answer quality
   */
  generateAnswerForQuestion(question, paragraphs, structure) {
    // Extract key terms from question
    const keyTerms = this.extractKeyTerms(question);

    // Find and score relevant sentences across all paragraphs
    const sentenceCandidates = [];

    for (const para of paragraphs) {
      const doc = nlp(para);
      const sentences = doc.sentences().out('array');

      sentences.forEach((sentence, index) => {
        const relevanceScore = this.scoreAnswerRelevance(sentence, keyTerms, question);

        // Phase 4.2: Lowered threshold from 0.3 to 0.2 for better FAQ coverage
        if (relevanceScore > 0.2) {  // Minimum relevance threshold
          sentenceCandidates.push({
            text: sentence,
            score: relevanceScore,
            paragraph: para,
            paragraphIndex: paragraphs.indexOf(para),
            sentenceIndex: index,
            allSentences: sentences
          });
        }
      });
    }

    // Sort by relevance score
    sentenceCandidates.sort((a, b) => b.score - a.score);

    if (sentenceCandidates.length === 0) {
      // Phase 4.2: Enhanced fallback logic
      // Fallback 1: Use first definition
      if (structure.definitions.length > 0) {
        const def = structure.definitions[0];
        const defWordCount = this.countWords(def);
        if (defWordCount >= this.targets.answerBlock.min && defWordCount <= this.targets.answerBlock.max) {
          return {
            text: def,
            wordCount: defWordCount,
            confidence: 'low'
          };
        }
      }

      // Fallback 2: Use first paragraph if it mentions key terms
      if (paragraphs.length > 0) {
        for (const para of paragraphs.slice(0, 3)) {
          const lowerPara = para.toLowerCase();
          const hasKeyTerms = keyTerms.some(term => lowerPara.includes(term.toLowerCase()));
          if (hasKeyTerms) {
            const paraWordCount = this.countWords(para);
            if (paraWordCount >= this.targets.answerBlock.min && paraWordCount <= this.targets.answerBlock.max) {
              return {
                text: para,
                wordCount: paraWordCount,
                confidence: 'low'
              };
            }
          }
        }
      }

      return null;
    }

    // Take the best candidate and expand context
    const bestCandidate = sentenceCandidates[0];
    const expandedAnswer = this.expandAnswerWithContext(bestCandidate, this.targets.answerBlock.min, this.targets.answerBlock.max);

    // Phase 4.2: Check if answer was rejected due to insufficient context
    if (expandedAnswer.rejected) {
      // Try fallback to definitions if available
      if (structure.definitions.length > 0) {
        const def = structure.definitions[0];
        const defWordCount = this.countWords(def);
        if (defWordCount >= this.targets.answerBlock.min && defWordCount <= this.targets.answerBlock.max) {
          return {
            text: def,
            wordCount: defWordCount,
            confidence: 'low'
          };
        }
      }
      return null; // Reject answer
    }

    // Validate answer completeness
    const isComplete = this.hasCompleteAnswer(expandedAnswer.text);

    // Phase 4.2: Reject if not complete or still too short
    if (!isComplete || expandedAnswer.wordCount < this.targets.answerBlock.min) {
      return null;
    }

    return {
      text: expandedAnswer.text,
      wordCount: expandedAnswer.wordCount,
      confidence: expandedAnswer.wordCount >= this.targets.answerBlock.min && isComplete ? 'high' : 'medium'
    };
  }

  /**
   * Expand answer with surrounding context to meet word count target
   * Phase 4.2: More aggressive expansion + better trimming
   */
  expandAnswerWithContext(candidate, minWords, maxWords) {
    let answer = candidate.text;
    let wordCount = this.countWords(answer);

    // If already in target range, return as-is
    if (wordCount >= minWords && wordCount <= maxWords) {
      return { text: answer, wordCount };
    }

    // If too short, add surrounding sentences
    if (wordCount < minWords) {
      const sentences = candidate.allSentences;
      const startIndex = candidate.sentenceIndex;

      // Track which sentence indices have been added to prevent duplicates
      const addedIndices = new Set([startIndex]);

      // Track indices to add after and before
      let afterIndex = startIndex;
      let beforeIndex = startIndex;

      // Phase 4.2: More aggressive - add 2-3 sentences at a time
      // Strategy: Add batch of sentences alternating after/before until target reached
      let addAfter = true;
      let iterations = 0;
      const maxIterations = 20; // Safety limit

      while (wordCount < minWords && iterations < maxIterations && (beforeIndex > 0 || afterIndex < sentences.length - 1)) {
        iterations++;
        const sentencesAdded = [];

        // Add 2-3 sentences in current direction
        const batchSize = Math.min(3, Math.ceil((minWords - wordCount) / 15)); // Estimate ~15 words/sentence

        if (addAfter) {
          // Add up to batchSize sentences after
          for (let i = 0; i < batchSize && afterIndex < sentences.length - 1; i++) {
            afterIndex++;
            if (!addedIndices.has(afterIndex)) {
              const sentenceToAdd = sentences[afterIndex];
              answer += ' ' + sentenceToAdd;
              addedIndices.add(afterIndex);
              sentencesAdded.push(sentenceToAdd);
            }
          }
          addAfter = false;
        } else {
          // Add up to batchSize sentences before
          for (let i = 0; i < batchSize && beforeIndex > 0; i++) {
            beforeIndex--;
            if (!addedIndices.has(beforeIndex)) {
              const sentenceToAdd = sentences[beforeIndex];
              answer = sentenceToAdd + ' ' + answer;
              addedIndices.add(beforeIndex);
              sentencesAdded.push(sentenceToAdd);
            }
          }
          addAfter = true;
        }

        // No sentences were added this iteration
        if (sentencesAdded.length === 0) {
          break;
        }

        wordCount = this.countWords(answer);

        // Stop if we exceed max significantly
        if (wordCount > maxWords + 20) {
          break;
        }
      }

      // Phase 4.2: Reject if still too short after exhausting all context
      if (wordCount < minWords && beforeIndex === 0 && afterIndex === sentences.length - 1) {
        // Return with low word count - caller should handle rejection
        return { text: answer, wordCount, rejected: true, reason: 'insufficient_context' };
      }
    }

    // Phase 4.2: Better trimming by complete sentences
    if (wordCount > maxWords) {
      const trimmed = this.trimByCompleteSentences(answer, minWords, maxWords);
      answer = trimmed.text;
      wordCount = trimmed.wordCount;
    }

    return { text: answer, wordCount };
  }

  /**
   * Trim text by removing complete sentences from the end
   * Phase 4.2: Trim to complete sentences, targeting ~50 words (middle of range)
   */
  trimByCompleteSentences(text, minWords, maxWords) {
    const doc = nlp(text);
    const sentences = doc.sentences().out('array');

    if (sentences.length <= 1) {
      // Can't trim further, return as-is
      return { text, wordCount: this.countWords(text) };
    }

    // Target the middle of the range (~50 words for 40-60 range)
    const targetWords = Math.floor((minWords + maxWords) / 2);

    // Build answer from start, adding sentences until we reach target
    let trimmedAnswer = '';
    let currentWordCount = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const sentenceWords = this.countWords(sentence);

      // If adding this sentence keeps us under maxWords, add it
      if (currentWordCount + sentenceWords <= maxWords) {
        trimmedAnswer += (trimmedAnswer ? ' ' : '') + sentence;
        currentWordCount += sentenceWords;
      } else {
        // Would exceed maxWords, stop here
        break;
      }

      // If we've reached target, we can stop
      if (currentWordCount >= targetWords && currentWordCount <= maxWords) {
        break;
      }
    }

    // Ensure we have at least minWords
    if (currentWordCount < minWords && trimmedAnswer !== text) {
      // Trimming would make it too short, return original
      return { text, wordCount: this.countWords(text) };
    }

    return { text: trimmedAnswer, wordCount: currentWordCount };
  }

  /**
   * Score answer relevance to question
   * Returns 0.0 - 1.0 score based on:
   * - Keyword overlap (40%)
   * - Keyword proximity (30%)
   * - Answer completeness (30%)
   */
  scoreAnswerRelevance(sentence, keyTerms, question) {
    const lowerSentence = sentence.toLowerCase();
    const lowerQuestion = question.toLowerCase();

    // 1. Keyword Overlap Score (40%)
    const matchedTerms = keyTerms.filter(term =>
      lowerSentence.includes(term.toLowerCase())
    );
    const keywordScore = matchedTerms.length / Math.max(keyTerms.length, 1);

    // 2. Keyword Proximity Score (30%)
    // Check if keywords appear close together (within 5 words)
    let proximityScore = 0;
    if (matchedTerms.length >= 2) {
      const positions = matchedTerms.map(term => {
        const index = lowerSentence.indexOf(term.toLowerCase());
        return index >= 0 ? index : Infinity;
      });

      const minDistance = Math.min(...positions.slice(1).map((pos, i) =>
        Math.abs(pos - positions[i])
      ));

      proximityScore = minDistance < 50 ? 1.0 : (minDistance < 100 ? 0.5 : 0.2);
    }

    // 3. Completeness Score (30%)
    // Check if sentence contains definition patterns or explanatory words
    const completenessIndicators = [
      /\b(?:is|are|means|refers to|defined as|known as)\b/i,
      /\b(?:allows|enables|helps|provides|ensures|makes)\b/i,
      /\b(?:by|through|using|with|via)\b/i
    ];

    const completenessScore = completenessIndicators.filter(pattern =>
      pattern.test(sentence)
    ).length / completenessIndicators.length;

    // Weighted total
    return (keywordScore * 0.4) + (proximityScore * 0.3) + (completenessScore * 0.3);
  }

  /**
   * Check if answer is complete (not mid-sentence)
   * Bug Fix: Added detection for incomplete sentences ending with colons or list indicators
   */
  hasCompleteAnswer(text) {
    const trimmedText = text.trim();

    // Check if ends with sentence terminator
    if (!/[.!?]$/.test(trimmedText)) {
      return false;
    }

    // Bug Fix: Reject ONLY sentences that clearly introduce a list with colon
    // Must have colon immediately before the period (with optional space)
    // Example: "Best practices include the following:" or "such as:"
    const endsWithColonPeriod = /:\.?$/.test(trimmedText.replace(/\s+$/, ''));

    // Bug Fix: Only reject if it BOTH ends with colon AND has list indicator
    // This makes validation less strict - sentences need both conditions to be rejected
    if (endsWithColonPeriod) {
      const listIndicators = [
        /\b(?:include|includes|including)\s+(?:the\s+)?following\s*:\.?$/i,
        /\b(?:such as|like|for example)\s*:\.?$/i,
        /\b(?:are|is)\s+as\s+follows\s*:\.?$/i
      ];

      for (const pattern of listIndicators) {
        if (pattern.test(trimmedText)) {
          return false;  // Reject only if both colon AND list indicator present
        }
      }
    }

    // Check if contains at least one complete clause
    const doc = nlp(trimmedText);
    const sentences = doc.sentences().out('array');

    return sentences.length > 0 && sentences[0].length > 10;
  }

  /**
   * Generate implicit question from definition
   */
  generateImplicitQuestion(definition) {
    // Extract subject from definition (before "is" or "are")
    const match = definition.match(/^([^.!?]+?)\s+(?:is|are)\s+/i);
    if (!match) return null;

    const subject = match[1].trim();

    // Generate "What is X?" question
    return {
      question: `What is ${subject}?`,
      type: 'what'
    };
  }

  /**
   * Calculate Jaccard similarity between two texts (Phase 4.1 Feature 2)
   * Returns 0.0-1.0 where 1.0 means identical
   */
  calculateJaccardSimilarity(text1, text2) {
    const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 2));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Check if answer is duplicate or near-duplicate (Phase 4.1 Feature 2)
   */
  isDuplicateAnswer(newAnswer, existingItems, threshold = 0.8) {
    for (const item of existingItems) {
      const similarity = this.calculateJaccardSimilarity(newAnswer, item.answer);
      if (similarity > threshold) {
        return true;
      }
    }
    return false;
  }

  /**
   * Extract entity name (company/product) from content (Phase 4.1 Feature 2)
   */
  extractEntityName(structure) {
    if (!structure.title) return null;

    // Try to extract from title (usually first capitalized word/phrase)
    const titleWords = structure.title.split(/\s+/);

    // Look for capitalized words (likely proper nouns)
    const capitalizedWords = titleWords.filter(w => /^[A-Z][a-z]+/.test(w));

    if (capitalizedWords.length > 0) {
      // Return first 1-2 capitalized words
      return capitalizedWords.slice(0, 2).join(' ');
    }

    // Fallback: first 1-2 words of title
    return titleWords.slice(0, 2).join(' ');
  }

  /**
   * Extract services from content (Phase 4.1 Feature 2)
   */
  extractServices(structure) {
    const services = [];

    // Look for service indicators in headings and lists
    const servicePatterns = [
      /\b(?:offer|provide|deliver|include|feature|service|solution|product)\b/i
    ];

    // Check headings
    for (const heading of structure.headings) {
      if (servicePatterns.some(p => p.test(heading.text))) {
        // Extract items from nearby lists
        services.push(heading.text.replace(/^(?:Our|We|What)\s+/i, ''));
      }
    }

    // Extract from lists (often contain services)
    for (const list of structure.lists.slice(0, 3)) {
      for (const item of list) {
        if (item.length > 10 && item.length < 100) {
          services.push(item);
        }
      }
    }

    return services.slice(0, 5); // Limit to 5 services
  }

  /**
   * Extract benefits from content (Phase 4.1 Feature 2)
   */
  extractBenefits(content) {
    const benefits = [];

    // Look for benefit-indicating verbs
    const benefitPattern = /\b(?:optimize|improve|increase|enhance|reduce|save|boost|maximize|streamline|automate|simplify)\s+([a-z\s]{5,40})/gi;

    let match;
    while ((match = benefitPattern.exec(content)) !== null) {
      const benefit = match[0].trim();
      if (benefit.length > 10 && !benefits.includes(benefit)) {
        benefits.push(benefit);
      }
    }

    return benefits.slice(0, 5); // Limit to 5 benefits
  }

  /**
   * Generate contextual questions based on content (Phase 4.1 Feature 2)
   * Replaces template-based generateCommonQuestions()
   */
  generateContextualQuestions(content, structure) {
    const questions = [];

    // Extract content context
    const entityName = this.extractEntityName(structure);
    const services = this.extractServices(structure);
    const benefits = this.extractBenefits(content);

    // Only generate if content supports it
    if (entityName) {
      questions.push({
        text: `What is ${entityName}?`,
        source: 'generated',
        confidence: 'medium'
      });

      if (services.length > 0) {
        questions.push({
          text: `What does ${entityName} do?`,
          source: 'generated',
          confidence: 'medium'
        });
        questions.push({
          text: `What services does ${entityName} offer?`,
          source: 'generated',
          confidence: 'medium'
        });
      }

      if (benefits.length > 2) {
        questions.push({
          text: `What are the benefits of ${entityName}?`,
          source: 'generated',
          confidence: 'medium'
        });
        questions.push({
          text: `How can ${entityName} help?`,
          source: 'generated',
          confidence: 'medium'
        });
      }

      // Pricing question (common on SaaS sites)
      if (/\b(?:price|pricing|cost|plan|subscription)\b/i.test(content)) {
        questions.push({
          text: `How much does ${entityName} cost?`,
          source: 'generated',
          confidence: 'high'
        });
      }

      // Getting started question
      if (/\b(?:start|begin|setup|install|sign up|get started)\b/i.test(content)) {
        questions.push({
          text: `How do I get started with ${entityName}?`,
          source: 'generated',
          confidence: 'high'
        });
      }
    }

    return questions;
  }

  /**
   * Rank answer candidates by relevance (Phase 4.1 Feature 2)
   */
  rankAnswers(candidates, question, existingItems = []) {
    return candidates
      .map(candidate => ({
        ...candidate,
        score: this.calculateAnswerScore(candidate, question, existingItems)
      }))
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Calculate answer score based on relevance (Phase 4.1 Feature 2)
   */
  calculateAnswerScore(answer, question, existingItems = []) {
    // Keyword match (40%)
    const keyTerms = this.extractKeyTerms(question);
    const matchedTerms = keyTerms.filter(term =>
      answer.text.toLowerCase().includes(term.toLowerCase())
    );
    const keywordScore = matchedTerms.length / Math.max(keyTerms.length, 1);

    // Proximity score (30%) - keywords appear close together
    let proximityScore = 0;
    if (matchedTerms.length >= 2) {
      const positions = matchedTerms.map(term => {
        const index = answer.text.toLowerCase().indexOf(term.toLowerCase());
        return index >= 0 ? index : Infinity;
      });

      const minDistance = Math.min(...positions.slice(1).map((pos, i) =>
        Math.abs(pos - positions[i])
      ));

      proximityScore = minDistance < 50 ? 1.0 : (minDistance < 100 ? 0.5 : 0.2);
    }

    // Length score (20%) - prefer 30-80 words for FAQ
    const wordCount = this.countWords(answer.text);
    let lengthScore = 0;
    if (wordCount >= 30 && wordCount <= 80) {
      lengthScore = 1.0;
    } else if (wordCount >= 20 && wordCount < 30) {
      lengthScore = 0.7;
    } else if (wordCount > 80 && wordCount <= 100) {
      lengthScore = 0.7;
    } else if (wordCount > 100) {
      lengthScore = 0.4;
    }

    // Uniqueness bonus (10%) - not duplicate of existing answers
    const isDuplicate = this.isDuplicateAnswer(answer.text, existingItems, 0.8);
    const uniquenessBonus = isDuplicate ? 0 : 0.1;

    return (keywordScore * 0.4) + (proximityScore * 0.3) + (lengthScore * 0.2) + uniquenessBonus;
  }

  /**
   * Generate common questions based on content topic (DEPRECATED - Phase 4.0)
   * Replaced by generateContextualQuestions() in Phase 4.1 Feature 2
   */
  generateCommonQuestions(structure) {
    const questions = [];
    const title = structure.title || '';

    // Extract main topic from title
    const topic = this.extractMainTopic(title);

    if (topic) {
      questions.push(`What is ${topic}?`);
      questions.push(`How does ${topic} work?`);
      questions.push(`Why is ${topic} important?`);
      questions.push(`When should you use ${topic}?`);
      questions.push(`What are the benefits of ${topic}?`);
    }

    return questions;
  }

  /**
   * Extract main topic from title
   */
  extractMainTopic(title) {
    // Remove common prefixes/suffixes
    let topic = title
      .replace(/^(?:The|A|An)\s+/i, '')
      .replace(/\s*[\|\-\:].*/g, '')
      .trim();

    // Get first 2-4 words as topic
    const words = topic.split(/\s+/);
    return words.slice(0, Math.min(4, words.length)).join(' ');
  }

  /**
   * Extract key terms from question
   */
  extractKeyTerms(question) {
    // Remove question words and extract nouns/key terms
    const terms = question
      .replace(/^(?:what|how|why|when|where|who|which|whose|whom)\s+(?:is|are|does|do|did|can|could|should|would|will)\s+/i, '')
      .replace(/\?/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3 && !/^(?:the|and|but|for|with|from|this|that|these|those)$/i.test(w));

    return terms;
  }

  /**
   * Make question more conversational for voice search
   */
  makeConversational(question) {
    // Already conversational if starts with question word
    if (/^(?:what|how|why|when|where|who|which)/i.test(question)) {
      return question;
    }

    // Try to add question word
    if (/\bis\b/i.test(question)) {
      return `What ${question.toLowerCase()}`;
    }

    if (/\bdo\b/i.test(question)) {
      return `How ${question.toLowerCase()}`;
    }

    return question;
  }

  /**
   * Check if content is suitable for voice reading
   */
  isSpeakable(text) {
    // Avoid technical jargon, code, URLs
    if (/(?:https?:\/\/|www\.|<code|{|}|\[|\])/i.test(text)) {
      return false;
    }

    // Prefer complete sentences
    if (!text.match(/[.!?]$/)) {
      return false;
    }

    return true;
  }

  /**
   * Calculate improvement metrics
   */
  calculateImprovements(originalStructure, optimizations) {
    const improvements = {
      structuredContent: 0,
      answerBlocks: 0,
      citationReadiness: 0,
      overall: 0
    };

    // TL;DR adds structured content
    if (optimizations.tldr && !optimizations.tldr.skipped) {
      improvements.structuredContent += 20;
    }

    // Answer blocks add AI-extractable content
    if (optimizations.answerBlocks) {
      improvements.answerBlocks = Math.min(
        optimizations.answerBlocks.count * 5,
        40
      );
    }

    // FAQ adds structured Q&A
    if (optimizations.faq && !optimizations.faq.skipped) {
      improvements.structuredContent += 15;
      improvements.answerBlocks += 10;
    }

    // Citations add credibility
    if (optimizations.citations) {
      const missing = optimizations.citations.recommendations.length;
      improvements.citationReadiness = Math.max(0, 25 - (missing * 8));
    }

    // Calculate overall improvement
    improvements.overall = Math.round(
      (improvements.structuredContent +
       improvements.answerBlocks +
       improvements.citationReadiness) / 3
    );

    return improvements;
  }

  /**
   * Validation methods
   */
  validateTLDR(tldr) {
    const wordCount = this.countWords(tldr);
    const issues = [];

    if (wordCount < this.targets.tldr.min) {
      issues.push({ severity: 'warning', message: `TL;DR too short (${wordCount} words, target ${this.targets.tldr.min}-${this.targets.tldr.max})` });
    }

    if (wordCount > this.targets.tldr.max) {
      issues.push({ severity: 'warning', message: `TL;DR too long (${wordCount} words, target ${this.targets.tldr.min}-${this.targets.tldr.max})` });
    }

    return {
      isValid: issues.length === 0,
      issues
    };
  }

  validateAnswerBlock(block) {
    const issues = [];

    if (block.wordCount < this.targets.answerBlock.min) {
      issues.push({ severity: 'warning', message: `Answer too short (${block.wordCount} words)` });
    }

    if (block.wordCount > this.targets.answerBlock.max) {
      issues.push({ severity: 'warning', message: `Answer too long (${block.wordCount} words)` });
    }

    if (block.confidence === 'low') {
      issues.push({ severity: 'info', message: 'Low confidence answer, may need manual review' });
    }

    return {
      isValid: issues.length === 0,
      issues
    };
  }

  validateFAQ(items) {
    const issues = [];

    if (items.length < 3) {
      issues.push({ severity: 'warning', message: `Only ${items.length} FAQ items (recommend 5-10)` });
    }

    for (const item of items) {
      if (item.generated) {
        issues.push({ severity: 'info', message: `Generated question: "${item.question}" - may need review` });
      }
    }

    return {
      isValid: items.length >= 3,
      issues
    };
  }

  /**
   * HTML formatting methods
   */
  formatTLDRHTML(tldr) {
    return `
<!-- TL;DR Section (AI-Extractable) -->
<div class="tldr-section" style="background: #f5f5f5; padding: 20px; border-left: 4px solid #0066cc; margin: 20px 0;">
  <h2 style="margin-top: 0;">TL;DR</h2>
  <p><strong>${tldr}</strong></p>
</div>
`.trim();
  }

  formatAnswerBlockHTML(question, answer) {
    return `
<!-- Answer Block (40-60 words, AI-Extractable) -->
<div class="answer-block" style="background: #eef7ff; padding: 15px; border-radius: 8px; margin: 15px 0;">
  <p style="font-size: 18px; line-height: 1.6; margin: 0;">
    <strong>Q: ${question}</strong><br>
    A: ${answer}
  </p>
</div>
`.trim();
  }

  formatFAQHTML(items) {
    const faqItems = items.map(item => `
  <div class="faq-item">
    <h3>${item.question}</h3>
    <p>${item.answer}</p>
  </div>
`.trim()).join('\n');

    return `
<!-- FAQ Section -->
<div class="faq-section" style="background: #fff; padding: 30px; margin: 30px 0;">
  <h2>Frequently Asked Questions</h2>
${faqItems}
</div>
`.trim();
  }

  formatQAHTML(pairs) {
    const qaItems = pairs.map(pair => `
  <div class="qa-item">
    <p><strong>Q: ${pair.question}</strong></p>
    <p>A: ${pair.answer}</p>
  </div>
`.trim()).join('\n');

    return `
<!-- Q&A Section -->
<div class="qa-section">
${qaItems}
</div>
`.trim();
  }

  formatSpeakableHTML(text) {
    return `
<div itemscope itemtype="https://schema.org/SpeakableSpecification">
  <p itemprop="speakable">${text}</p>
</div>
`.trim();
  }

  generateAuthorHTML() {
    return `
<!-- Author Byline -->
<div class="author-byline" itemscope itemtype="https://schema.org/Person">
  <p>By <span itemprop="name">[Author Name]</span></p>
  <meta itemprop="jobTitle" content="[Job Title]">
</div>
`.trim();
  }

  generateDateHTML(type, date) {
    const label = type === 'published' ? 'Published' : 'Last Updated';
    const prop = type === 'published' ? 'datePublished' : 'dateModified';

    return `
<!-- ${label} Date -->
<div>
  <time datetime="${date}" itemprop="${prop}">${label}: ${date}</time>
</div>
`.trim();
  }

  generateSourcesHTML() {
    return `
<!-- Sources Section -->
<div class="sources-section">
  <h2>Sources</h2>
  <ol>
    <li><a href="[URL]" rel="nofollow">[Source Name]</a></li>
  </ol>
</div>
`.trim();
  }

  /**
   * Schema generation
   */
  generateFAQSchema(items) {
    return {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      'mainEntity': items.map(item => ({
        '@type': 'Question',
        'name': item.question,
        'acceptedAnswer': {
          '@type': 'Answer',
          'text': item.answer
        }
      }))
    };
  }

  generateSpeakableSchema(content) {
    return {
      '@context': 'https://schema.org',
      '@type': 'SpeakableSpecification',
      'cssSelector': ['.speakable', '[itemprop="speakable"]']
    };
  }

  /**
   * Utility methods
   */
  countWords(text) {
    return text.trim().split(/\s+/).length;
  }

  trimToWordCount(text, minWords, maxWords) {
    const words = text.split(/\s+/);

    if (words.length <= maxWords) {
      return text;
    }

    // Trim to maxWords but try to end at sentence boundary
    let trimmed = words.slice(0, maxWords).join(' ');
    const lastPeriod = trimmed.lastIndexOf('.');

    if (lastPeriod > 0 && lastPeriod > (trimmed.length * 0.7)) {
      trimmed = trimmed.substring(0, lastPeriod + 1);
    } else {
      trimmed += '...';
    }

    return trimmed;
  }

  cleanText(text) {
    return text
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Fetch URL with improved HTTP handling
   * Bug Fix: Added user agent, redirect following, and retry logic
   */
  async fetchURL(url, retries = 3, redirectCount = 0) {
    const maxRedirects = 5;

    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const protocol = parsedUrl.protocol === 'https:' ? https : http;

      // Add user agent to appear as a real browser
      const options = {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive'
        }
      };

      const req = protocol.get(url, options, (res) => {
        // Handle redirects (301, 302, 303, 307, 308)
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          if (redirectCount >= maxRedirects) {
            return reject(new Error(`Too many redirects (${maxRedirects})`));
          }

          const redirectUrl = res.headers.location;
          if (!redirectUrl) {
            return reject(new Error(`Redirect ${res.statusCode} without location header`));
          }

          // Resolve relative URLs
          const absoluteUrl = redirectUrl.startsWith('http')
            ? redirectUrl
            : new URL(redirectUrl, url).href;

          // Follow redirect recursively
          return this.fetchURL(absoluteUrl, retries, redirectCount + 1)
            .then(resolve)
            .catch(reject);
        }

        // Handle non-200 status codes
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }

        // Collect response data (Bug Fix: Handle gzip/deflate/brotli compression)
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          try {
            // Concatenate all chunks into a single buffer
            const buffer = Buffer.concat(chunks);
            const encoding = res.headers['content-encoding'];

            // Decompress based on content encoding
            if (encoding === 'gzip') {
              zlib.gunzip(buffer, (err, decompressed) => {
                if (err) return reject(new Error(`Gzip decompression failed: ${err.message}`));
                resolve(decompressed.toString('utf8'));
              });
            } else if (encoding === 'deflate') {
              zlib.inflate(buffer, (err, decompressed) => {
                if (err) return reject(new Error(`Deflate decompression failed: ${err.message}`));
                resolve(decompressed.toString('utf8'));
              });
            } else if (encoding === 'br') {
              zlib.brotliDecompress(buffer, (err, decompressed) => {
                if (err) return reject(new Error(`Brotli decompression failed: ${err.message}`));
                resolve(decompressed.toString('utf8'));
              });
            } else {
              // No compression or unrecognized encoding
              resolve(buffer.toString('utf8'));
            }
          } catch (err) {
            reject(new Error(`Response processing failed: ${err.message}`));
          }
        });
      });

      // Error handling with retry logic
      req.on('error', (err) => {
        if (retries > 0) {
          // Exponential backoff: wait 1s, 2s, 4s before retrying
          const delay = Math.pow(2, 3 - retries) * 1000;
          setTimeout(() => {
            this.fetchURL(url, retries - 1, redirectCount)
              .then(resolve)
              .catch(reject);
          }, delay);
        } else {
          reject(err);
        }
      });

      req.on('timeout', () => {
        req.destroy();

        if (retries > 0) {
          // Retry on timeout
          const delay = Math.pow(2, 3 - retries) * 1000;
          setTimeout(() => {
            this.fetchURL(url, retries - 1, redirectCount)
              .then(resolve)
              .catch(reject);
          }, delay);
        } else {
          reject(new Error('Request timeout after retries'));
        }
      });
    });
  }

  /**
   * Format output
   */
  formatOutput(results, format = 'text') {
    if (format === 'json') {
      return JSON.stringify(results, null, 2);
    }

    let output = '';
    output += '============================================================\n';
    output += 'CONTENT OPTIMIZATION REPORT\n';
    output += '============================================================\n\n';
    output += `URL: ${results.url}\n`;
    output += `Optimized: ${results.optimizedAt}\n\n`;

    output += '📊 Original Content Structure:\n';
    const struct = results.stats.originalStructure;
    output += `  - Word Count: ${struct.wordCount}\n`;
    output += `  - Headings: ${struct.headings.length}\n`;
    output += `  - Paragraphs: ${struct.paragraphs.length}\n`;
    output += `  - Questions Found: ${struct.questions.length}\n`;
    output += `  - Has TL;DR: ${struct.hasTLDR ? 'Yes' : 'No'}\n`;
    output += `  - Has FAQ: ${struct.hasFAQ ? 'Yes' : 'No'}\n\n`;

    // TL;DR
    if (results.optimizations.tldr) {
      const tldr = results.optimizations.tldr;
      if (tldr.skipped) {
        output += '⏭️  TL;DR: Skipped (already exists)\n\n';
      } else {
        output += '✅ TL;DR Generated:\n';
        output += `  Word Count: ${tldr.wordCount}\n`;
        output += `  Text: ${tldr.text}\n\n`;
        output += '  HTML Implementation:\n';
        output += tldr.html.split('\n').map(l => '  ' + l).join('\n') + '\n\n';
      }
    }

    // Answer Blocks
    if (results.optimizations.answerBlocks) {
      const blocks = results.optimizations.answerBlocks;
      output += `✅ Answer Blocks Generated: ${blocks.count}\n\n`;

      for (const block of blocks.blocks.slice(0, 3)) {
        output += `  Q: ${block.question}\n`;
        output += `  A: ${block.answer}\n`;
        output += `  (${block.wordCount} words, confidence: ${block.confidence})\n\n`;
      }

      if (blocks.blocks.length > 3) {
        output += `  ... and ${blocks.blocks.length - 3} more\n\n`;
      }
    }

    // FAQ
    if (results.optimizations.faq) {
      const faq = results.optimizations.faq;
      if (faq.skipped) {
        output += '⏭️  FAQ: Skipped (already exists)\n\n';
      } else {
        output += `✅ FAQ Generated: ${faq.count} items\n\n`;

        for (const item of faq.items.slice(0, 3)) {
          output += `  Q: ${item.question}\n`;
          output += `  A: ${item.answer}\n\n`;
        }

        if (faq.items.length > 3) {
          output += `  ... and ${faq.items.length - 3} more\n\n`;
        }
      }
    }

    // Improvements
    if (results.stats.improvements) {
      const imp = results.stats.improvements;
      output += '📈 Projected GEO Score Improvements:\n';
      output += `  - Structured Content: +${imp.structuredContent} points\n`;
      output += `  - Answer Blocks: +${imp.answerBlocks} points\n`;
      output += `  - Citation Readiness: +${imp.citationReadiness} points\n`;
      output += `  - Overall: +${imp.overall} points\n\n`;
    }

    // Warnings
    if (results.warnings.length > 0) {
      output += '⚠️  Warnings:\n';
      for (const warning of results.warnings) {
        output += `  - ${warning.type}: ${warning.message}\n`;
      }
    }

    return output;
  }
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.length === 0) {
    console.log(`
SEO Content Optimizer - Automatically generate AI-optimized content

Usage:
  node seo-content-optimizer.js <url> [options]
  node seo-content-optimizer.js <json-file> [options]

Options:
  --focus <types>         Comma-separated optimization types
                         (tldr,answerBlocks,faq,qa,citations,voiceSearch)
  --generate-all         Generate all optimizations
  --format <format>      Output format: text or json (default: text)
  --output <file>        Write output to file
  --help                 Show this help

Examples:
  node seo-content-optimizer.js https://example.com
  node seo-content-optimizer.js https://example.com --generate-all
  node seo-content-optimizer.js https://example.com --focus tldr,faq
  node seo-content-optimizer.js ./crawl.json --output optimized.json

Optimization Types:
  tldr          - Generate TL;DR section (40-60 words)
  answerBlocks  - Generate answer blocks for AI extraction
  faq           - Generate FAQ section with Q&A pairs
  qa            - Generate question-answer pairs
  citations     - Optimize citation readiness (author, dates)
  voiceSearch   - Optimize for voice search queries
    `);
    process.exit(0);
  }

  const optimizer = new SEOContentOptimizer();
  const input = args[0];

  const options = {
    focus: null,
    format: 'text',
    output: null
  };

  // Parse options
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--generate-all') {
      options.focus = 'tldr,answerBlocks,faq,qa,citations,voiceSearch';
    } else if (args[i].startsWith('--')) {
      const key = args[i].replace(/^--/, '');
      const value = args[i + 1];
      options[key] = value;
      i++;
    }
  }

  (async () => {
    try {
      let results;

      if (input.startsWith('http://') || input.startsWith('https://')) {
        results = await optimizer.optimizeFromURL(input, options);
      } else if (input.endsWith('.json')) {
        results = await optimizer.optimizeFromJSON(input, options);
      } else {
        throw new Error('Input must be a URL or JSON file path');
      }

      const output = optimizer.formatOutput(results, options.format);

      if (options.output) {
        fs.writeFileSync(options.output, output);
        console.log(`✅ Content optimized successfully: ${options.output}`);
      } else {
        console.log(output);
      }

    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
      process.exit(1);
    }
  })();
}

module.exports = SEOContentOptimizer;
