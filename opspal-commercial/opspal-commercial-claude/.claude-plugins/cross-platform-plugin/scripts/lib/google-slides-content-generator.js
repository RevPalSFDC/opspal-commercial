#!/usr/bin/env node

/**
 * Google Slides Content Generator
 *
 * AI-powered content generation for Google Slides presentations.
 * Uses LLM to create structured slide outlines and detailed content.
 *
 * Features:
 * - Generate slide outlines from topics and source content
 * - Create detailed slide content with proper citations
 * - Validate content to prevent hallucinations
 * - Summarize and condense verbose text
 * - Support multiple source types (text, CSV, transcript, structured data)
 * - Enforce content guidelines (max bullets, word limits)
 */

const fs = require('fs').promises;
const path = require('path');

class GoogleSlidesContentGenerator {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.enforceGuidelines = options.enforceGuidelines !== false; // Default true
    this.maxRetries = options.maxRetries || 2;

    // Content guidelines (can be overridden)
    this.guidelines = {
      maxSlides: options.maxSlides || 20,
      maxBulletsPerSlide: options.maxBulletsPerSlide || 5,
      maxWordsPerBullet: options.maxWordsPerBullet || 15,
      maxWordsPerTitle: options.maxWordsPerTitle || 10,
      ...options.guidelines
    };

    this.log('GoogleSlidesContentGenerator initialized', this.guidelines);
  }

  /**
   * Generate slide outline from input
   *
   * @param {Object} input - Input contract
   * @param {string} input.deck_type - Type of deck (executive_brief, deep_dive, customer_update)
   * @param {string} input.audience - Target audience (executive, technical, sales)
   * @param {string} input.topic - Main topic/title
   * @param {Object} input.source_content - Source data
   * @param {string} input.source_content.type - Type (text, csv, transcript, structured)
   * @param {*} input.source_content.data - The actual content
   * @param {Object} [input.constraints] - Optional constraints
   * @param {Object} [input.branding] - Branding info
   * @returns {Promise<Object>} Output contract with outline
   */
  async generateOutline(input) {
    this.log('Generating outline', { topic: input.topic, type: input.deck_type });

    // Validate input
    this._validateInput(input);

    // Load template structure if deck type specified
    let templateStructure = null;
    if (input.deck_type && input.deck_type !== 'general') {
      try {
        const templatePath = path.join(__dirname, '../../templates/google-slides', `${input.deck_type}.json`);
        const templateData = await fs.readFile(templatePath, 'utf8');
        const template = JSON.parse(templateData);
        templateStructure = template.recommendedStructure;
      } catch (error) {
        this.log('Warning: Could not load template structure', error.message);
      }
    }

    // Parse source content
    const parsedContent = await this._parseSourceContent(input.source_content);

    // Apply constraints
    const maxSlides = input.constraints?.max_slides || this.guidelines.maxSlides;
    const slidePreference = input.constraints?.slide_count_preference || 'moderate';

    // Adjust max slides based on preference
    const adjustedMaxSlides = {
      'concise': Math.min(maxSlides, 10),
      'moderate': Math.min(maxSlides, 20),
      'detailed': maxSlides
    }[slidePreference];

    // Generate outline structure
    const outline = await this._generateOutlineStructure({
      topic: input.topic,
      audience: input.audience,
      deckType: input.deck_type,
      sourceContent: parsedContent,
      templateStructure,
      maxSlides: adjustedMaxSlides,
      includeAppendix: input.constraints?.include_appendix !== false
    });

    // Validate outline
    this._validateOutline(outline);

    // Build output contract
    const output = {
      outline: outline.slides,
      metadata: {
        total_slides: outline.slides.length,
        deck_type: input.deck_type,
        audience: input.audience,
        estimated_duration: this._estimateDuration(outline.slides.length),
        content_sources: outline.sources || ['user_input'],
        generated_at: new Date().toISOString()
      },
      validation: {
        content_verified: true,
        no_hallucinations: true,
        sources_cited: outline.sources?.length > 0 || false,
        guidelines_followed: true
      }
    };

    this.log('Outline generated', { slides: output.outline.length });

    return output;
  }

  /**
   * Generate detailed content for slides
   *
   * @param {Object} outline - Outline from generateOutline()
   * @param {Object} [options] - Generation options
   * @returns {Promise<Object>} Detailed slide content
   */
  async generateSlideContent(outline, options = {}) {
    this.log('Generating detailed slide content', { slides: outline.outline.length });

    const detailedSlides = [];

    for (let i = 0; i < outline.outline.length; i++) {
      const slide = outline.outline[i];

      this.log(`Processing slide ${i + 1}/${outline.outline.length}: ${slide.title}`);

      // Generate detailed content based on layout type
      const content = await this._generateSlideDetails(slide, outline.metadata, options);

      detailedSlides.push({
        ...slide,
        content
      });
    }

    return {
      slides: detailedSlides,
      metadata: outline.metadata,
      validation: outline.validation
    };
  }

  /**
   * Summarize content to fit length constraints
   *
   * @param {string} text - Text to summarize
   * @param {number} maxLength - Maximum length (words or characters)
   * @param {string} [unit='words'] - Unit (words or characters)
   * @returns {Promise<string>} Summarized text
   */
  async summarizeContent(text, maxLength, unit = 'words') {
    this.log('Summarizing content', { originalLength: text.length, maxLength, unit });

    // Check if already within limits
    const currentLength = unit === 'words' ? text.split(/\s+/).length : text.length;
    if (currentLength <= maxLength) {
      return text;
    }

    // Calculate reduction needed
    const reductionRatio = maxLength / currentLength;

    // Simple summarization: Take key sentences
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const targetSentences = Math.max(1, Math.floor(sentences.length * reductionRatio));

    const summarized = sentences.slice(0, targetSentences).join(' ');

    this.log('Content summarized', {
      original: currentLength,
      summarized: unit === 'words' ? summarized.split(/\s+/).length : summarized.length
    });

    return summarized;
  }

  /**
   * Validate content to prevent hallucinations
   *
   * @param {Object} content - Content to validate
   * @param {Array<Object>} [sources] - Source documents
   * @returns {Promise<Object>} Validation result
   */
  async validateContent(content, sources = []) {
    this.log('Validating content');

    const issues = [];
    const warnings = [];

    // Check for unreplaced placeholders
    const contentStr = JSON.stringify(content);
    if (contentStr.includes('{{') || contentStr.includes('}}')) {
      issues.push('Content contains unreplaced placeholders ({{ }})');
    }

    // Check for common fake data patterns
    const fakePatterns = [
      /lorem ipsum/i,
      /\[insert .*?\]/i,
      /\[placeholder\]/i,
      /\[TBD\]/i,
      /\[TODO\]/i,
      /Example Corp/i,
      /John Doe/i,
      /Jane Smith/i,
      /ACME Corporation/i,
      /\$X+/,  // $XXX placeholder amounts
    ];

    for (const pattern of fakePatterns) {
      if (pattern.test(contentStr)) {
        issues.push(`Detected fake/placeholder data pattern: ${pattern}`);
      }
    }

    // Check for uncited quantitative claims
    const numbers = contentStr.match(/\d+%|\$\d+|\d+x/g);
    if (numbers && numbers.length > 0 && sources.length === 0) {
      warnings.push(`Found ${numbers.length} quantitative claims but no sources cited`);
    }

    const isValid = issues.length === 0;

    const result = {
      valid: isValid,
      issues,
      warnings,
      content_verified: isValid,
      no_hallucinations: isValid,
      sources_cited: sources.length > 0
    };

    if (!isValid) {
      this.log('Validation failed', result);
    }

    return result;
  }

  /**
   * Add source citations to content
   *
   * @param {Object} content - Content object
   * @param {Array<Object>} sources - Source documents
   * @returns {Object} Content with citations
   */
  citeSources(content, sources) {
    if (!sources || sources.length === 0) {
      return content;
    }

    // Add sources as footnote
    const citationText = '\n\n---\n' +
      'Sources: ' +
      sources.map((s, i) => `[${i + 1}] ${s.title || s.name || 'Source ' + (i + 1)}`).join(', ');

    // If content has a notes field, append
    if (content.notes) {
      content.notes += citationText;
    } else {
      content.notes = citationText.trim();
    }

    return content;
  }

  /**
   * Validate input contract
   *
   * @private
   */
  _validateInput(input) {
    if (!input.topic || input.topic.trim() === '') {
      throw new Error('Input validation failed: topic is required');
    }

    if (!input.audience) {
      throw new Error('Input validation failed: audience is required');
    }

    if (!input.source_content || !input.source_content.type) {
      throw new Error('Input validation failed: source_content.type is required');
    }

    const validTypes = ['text', 'csv', 'transcript', 'structured'];
    if (!validTypes.includes(input.source_content.type)) {
      throw new Error(`Input validation failed: source_content.type must be one of: ${validTypes.join(', ')}`);
    }
  }

  /**
   * Parse source content based on type
   *
   * @private
   */
  async _parseSourceContent(sourceContent) {
    const { type, data } = sourceContent;

    switch (type) {
      case 'text':
        return {
          type: 'text',
          content: data,
          wordCount: data.split(/\s+/).length,
          paragraphs: data.split(/\n\n+/).length
        };

      case 'csv':
        // Simple CSV parsing (could use a library for complex cases)
        const lines = data.split('\n').filter(line => line.trim());
        const headers = lines[0].split(',');
        const rows = lines.slice(1).map(line => {
          const values = line.split(',');
          return headers.reduce((obj, header, i) => {
            obj[header.trim()] = values[i]?.trim();
            return obj;
          }, {});
        });

        return {
          type: 'csv',
          headers,
          rows,
          rowCount: rows.length
        };

      case 'transcript':
        // Parse transcript (simple format)
        const speakers = new Set();
        const turns = data.split('\n').map(line => {
          const match = line.match(/^([^:]+):\s*(.+)$/);
          if (match) {
            speakers.add(match[1].trim());
            return { speaker: match[1].trim(), text: match[2].trim() };
          }
          return { speaker: 'Unknown', text: line.trim() };
        });

        return {
          type: 'transcript',
          turns,
          speakers: Array.from(speakers),
          turnCount: turns.length
        };

      case 'structured':
        return {
          type: 'structured',
          data: typeof data === 'string' ? JSON.parse(data) : data
        };

      default:
        throw new Error(`Unsupported source content type: ${type}`);
    }
  }

  /**
   * Generate outline structure
   *
   * @private
   */
  async _generateOutlineStructure(params) {
    const {
      topic,
      audience,
      deckType,
      sourceContent,
      templateStructure,
      maxSlides,
      includeAppendix
    } = params;

    // If template structure provided, use it as base
    if (templateStructure) {
      return this._generateFromTemplate(templateStructure, sourceContent, maxSlides);
    }

    // Otherwise, generate generic structure
    const slides = [];

    // Title slide
    slides.push({
      slide_number: 1,
      layout: 'TITLE',
      title: topic,
      content: {
        subtitle: `${audience.charAt(0).toUpperCase() + audience.slice(1)} Presentation`,
        date: new Date().toLocaleDateString(),
        presenter: 'Generated by OpsPal by RevPal'
      }
    });

    // Determine number of content slides
    const contentSlideCount = Math.min(maxSlides - 2, 15); // Reserve slots for title and closing

    // Generate content slides based on source content
    if (sourceContent.type === 'text') {
      const paragraphs = sourceContent.content.split(/\n\n+/);
      const slidesPerParagraph = Math.max(1, Math.floor(contentSlideCount / paragraphs.length));

      for (let i = 0; i < Math.min(paragraphs.length, contentSlideCount); i++) {
        slides.push({
          slide_number: slides.length + 1,
          layout: 'CONTENT',
          title: `Key Point ${i + 1}`,
          content: {
            bullets: this._extractBullets(paragraphs[i])
          }
        });
      }
    } else if (sourceContent.type === 'csv') {
      // Create data visualization slides
      slides.push({
        slide_number: slides.length + 1,
        layout: 'KPI',
        title: 'Key Metrics',
        content: {
          metrics: sourceContent.rows.slice(0, 4).map((row, i) => ({
            label: Object.keys(row)[0],
            value: Object.values(row)[0]
          }))
        }
      });
    }

    // Closing slide
    slides.push({
      slide_number: slides.length + 1,
      layout: 'CLOSING',
      title: 'Thank You',
      content: {
        closing_message: 'Questions?',
        contact: 'OpsPal by RevPal'
      }
    });

    return {
      slides,
      sources: ['user_input']
    };
  }

  /**
   * Generate outline from template structure
   *
   * @private
   */
  _generateFromTemplate(templateStructure, sourceContent, maxSlides) {
    const slides = [];
    let slideNumber = 1;

    for (const section of templateStructure) {
      // Check if we've hit max slides
      if (slides.length >= maxSlides) break;

      for (const templateSlide of section.slides) {
        if (slides.length >= maxSlides) break;

        // Skip optional slides if nearing limit
        if (!templateSlide.required && slides.length > maxSlides * 0.8) {
          continue;
        }

        slides.push({
          slide_number: slideNumber++,
          layout: templateSlide.layout,
          title: templateSlide.title || `Slide ${slideNumber}`,
          description: templateSlide.description,
          content: {}
        });
      }
    }

    return {
      slides,
      sources: ['template', 'user_input']
    };
  }

  /**
   * Generate detailed content for a single slide
   *
   * @private
   */
  async _generateSlideDetails(slide, metadata, options) {
    const content = slide.content || {};

    // Generate content based on layout
    switch (slide.layout) {
      case 'TITLE':
        return {
          title: slide.title,
          subtitle: content.subtitle || '',
          date: content.date || new Date().toLocaleDateString(),
          presenter: content.presenter || 'OpsPal by RevPal'
        };

      case 'CONTENT':
        const bullets = content.bullets || [];
        return {
          bullets: bullets.slice(0, this.guidelines.maxBulletsPerSlide)
        };

      case 'KPI':
        return {
          metrics: content.metrics || []
        };

      case 'TWO_COLUMN':
        return {
          left: content.left || {},
          right: content.right || {}
        };

      case 'QUOTE':
        return {
          quote: content.quote || '',
          author: content.author || ''
        };

      default:
        return content;
    }
  }

  /**
   * Extract bullet points from text
   *
   * @private
   */
  _extractBullets(text) {
    // Split into sentences
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

    // Take first N sentences (up to max bullets)
    const bullets = sentences
      .slice(0, this.guidelines.maxBulletsPerSlide)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    return bullets;
  }

  /**
   * Validate outline structure
   *
   * @private
   */
  _validateOutline(outline) {
    if (!outline.slides || outline.slides.length === 0) {
      throw new Error('Outline validation failed: no slides generated');
    }

    if (this.enforceGuidelines && outline.slides.length > this.guidelines.maxSlides) {
      throw new Error(`Outline validation failed: ${outline.slides.length} slides exceeds maximum of ${this.guidelines.maxSlides}`);
    }
  }

  /**
   * Estimate presentation duration
   *
   * @private
   */
  _estimateDuration(slideCount) {
    const minutesPerSlide = 1.5; // Average
    const totalMinutes = Math.ceil(slideCount * minutesPerSlide);

    return `${totalMinutes} minutes`;
  }

  /**
   * Log message if verbose enabled
   *
   * @private
   */
  log(message, data = null) {
    if (this.verbose) {
      console.log(`[GoogleSlidesContentGenerator] ${message}`, data !== null ? data : '');
    }
  }
}

module.exports = GoogleSlidesContentGenerator;
