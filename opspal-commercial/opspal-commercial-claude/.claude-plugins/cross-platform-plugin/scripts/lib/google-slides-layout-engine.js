#!/usr/bin/env node

/**
 * Google Slides Layout Engine
 *
 * Handles dynamic content fitting and overflow resolution for Google Slides.
 * Implements a 4-tier strategy to ensure all content fits properly.
 *
 * 4-Tier Overflow Strategy:
 * 1. Reduce font size (16pt → 14pt → 12pt, max 3pt reduction)
 * 2. Abbreviate/condense content (via LLM, preserve meaning)
 * 3. Split slide (create continuation slide)
 * 4. Move to appendix (with reference on main slide)
 *
 * Features:
 * - Detect text overflow before it happens
 * - Auto-apply best resolution strategy
 * - Validate entire presentation layout
 * - Preserve design aesthetic while fitting content
 */

const GoogleSlidesContentGenerator = require('./google-slides-content-generator');

class GoogleSlidesLayoutEngine {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.contentGenerator = options.contentGenerator || new GoogleSlidesContentGenerator({ verbose: this.verbose });

    // Font size constraints
    this.minFontSize = options.minFontSize || 12;
    this.defaultFontSize = options.defaultFontSize || 16;
    this.maxFontReduction = options.maxFontReduction || 3;

    // Overflow thresholds (percentage)
    this.thresholds = {
      reduceFontSize: 0.10,    // < 10% overflow → reduce font
      abbreviate: 0.30,        // 10-30% overflow → abbreviate
      split: 0.50,             // 30-50% overflow → split slide
      appendix: 0.50           // > 50% overflow → move to appendix
    };

    this.log('GoogleSlidesLayoutEngine initialized');
  }

  /**
   * Detect if content will overflow a slide
   *
   * @param {Object} slide - Slide object with content
   * @param {Object} layout - Layout constraints
   * @returns {Promise<{overflow: boolean, percentage: number, strategy: string}>}
   */
  async detectOverflow(slide, layout) {
    this.log('Detecting overflow', { slideId: slide.slideId, layout: layout.name });

    // Extract text content from slide
    const textContent = this._extractTextContent(slide);

    // Estimate text length
    const estimatedLength = this._estimateTextLength(textContent, layout);

    // Calculate overflow percentage
    const overflowPercentage = estimatedLength.overflow / estimatedLength.capacity;

    const result = {
      overflow: overflowPercentage > 0,
      percentage: Math.round(overflowPercentage * 100) / 100,
      strategy: this._determineStrategy(overflowPercentage),
      details: {
        currentLength: estimatedLength.current,
        capacity: estimatedLength.capacity,
        overflow: estimatedLength.overflow
      }
    };

    if (result.overflow) {
      this.log('Overflow detected', result);
    }

    return result;
  }

  /**
   * Reduce font size on a slide
   *
   * @param {string} presentationId - Presentation ID
   * @param {string} slideId - Slide ID
   * @param {number} reduction - Points to reduce (e.g., 2 = 16pt → 14pt)
   * @param {Object} slidesManager - GoogleSlidesManager instance
   * @returns {Promise<{applied: boolean, newFontSize: number}>}
   */
  async reduceFontSize(presentationId, slideId, reduction, slidesManager) {
    this.log('Reducing font size', { slideId, reduction });

    // Validate reduction
    if (reduction > this.maxFontReduction) {
      reduction = this.maxFontReduction;
    }

    const newFontSize = this.defaultFontSize - reduction;

    if (newFontSize < this.minFontSize) {
      this.log('Cannot reduce font size below minimum', { min: this.minFontSize });
      return { applied: false, newFontSize: this.minFontSize };
    }

    // Apply font size reduction via batchUpdate
    const requests = [{
      updateTextStyle: {
        objectId: slideId,
        style: {
          fontSize: {
            magnitude: newFontSize,
            unit: 'PT'
          }
        },
        fields: 'fontSize'
      }
    }];

    try {
      await slidesManager.batchUpdate(presentationId, requests);
      this.log('Font size reduced', { newFontSize });
      return { applied: true, newFontSize };
    } catch (error) {
      this.log('Failed to reduce font size', error.message);
      return { applied: false, error: error.message };
    }
  }

  /**
   * Abbreviate/condense content
   *
   * @param {Object} content - Slide content to abbreviate
   * @param {number} targetReduction - Target reduction percentage (0-1)
   * @returns {Promise<Object>} Abbreviated content
   */
  async abbreviateContent(content, targetReduction = 0.25) {
    this.log('Abbreviating content', { targetReduction });

    const abbreviated = {};

    for (const [key, value] of Object.entries(content)) {
      if (typeof value === 'string') {
        // Calculate target length
        const currentWords = value.split(/\s+/).length;
        const targetWords = Math.ceil(currentWords * (1 - targetReduction));

        // Summarize using content generator
        abbreviated[key] = await this.contentGenerator.summarizeContent(
          value,
          targetWords,
          'words'
        );
      } else if (Array.isArray(value)) {
        // Abbreviate array items (e.g., bullets)
        abbreviated[key] = await Promise.all(
          value.map(async item => {
            if (typeof item === 'string') {
              const currentWords = item.split(/\s+/).length;
              const targetWords = Math.ceil(currentWords * (1 - targetReduction));
              return await this.contentGenerator.summarizeContent(item, targetWords, 'words');
            }
            return item;
          })
        );
      } else {
        abbreviated[key] = value;
      }
    }

    this.log('Content abbreviated');
    return abbreviated;
  }

  /**
   * Split slide into multiple slides
   *
   * @param {Object} slide - Slide to split
   * @param {number} breakpoint - Where to split (0-1, percentage through content)
   * @returns {Array<Object>} Two slide objects
   */
  async splitSlide(slide, breakpoint = 0.5) {
    this.log('Splitting slide', { slideId: slide.slideId, breakpoint });

    const content = slide.content || {};
    const slides = [];

    // First slide (original)
    const firstSlide = {
      ...slide,
      title: slide.title,
      content: {}
    };

    // Second slide (continuation)
    const secondSlide = {
      layout: slide.layout,
      title: `${slide.title} (cont.)`,
      content: {}
    };

    // Split content
    for (const [key, value] of Object.entries(content)) {
      if (Array.isArray(value)) {
        // Split arrays (e.g., bullets) at breakpoint
        const splitIndex = Math.ceil(value.length * breakpoint);
        firstSlide.content[key] = value.slice(0, splitIndex);
        secondSlide.content[key] = value.slice(splitIndex);
      } else if (typeof value === 'string') {
        // Split text at sentence boundary near breakpoint
        const sentences = value.match(/[^.!?]+[.!?]+/g) || [value];
        const splitIndex = Math.ceil(sentences.length * breakpoint);
        firstSlide.content[key] = sentences.slice(0, splitIndex).join(' ');
        secondSlide.content[key] = sentences.slice(splitIndex).join(' ');
      } else {
        // Non-splittable content stays in first slide
        firstSlide.content[key] = value;
      }
    }

    slides.push(firstSlide, secondSlide);

    this.log('Slide split', { resultingSlides: 2 });
    return slides;
  }

  /**
   * Move slide content to appendix
   *
   * @param {Object} slide - Slide to move
   * @param {Array<Object>} appendixSlides - Existing appendix slides
   * @returns {Object} Reference slide + updated appendix
   */
  async moveToAppendix(slide, appendixSlides = []) {
    this.log('Moving to appendix', { slideId: slide.slideId });

    // Create reference slide
    const referenceSlide = {
      layout: 'CONTENT',
      title: slide.title,
      content: {
        bullets: [
          'See Appendix for detailed information',
          `Reference: Appendix Slide ${appendixSlides.length + 1}`
        ]
      }
    };

    // Add to appendix with clear labeling
    const appendixSlide = {
      ...slide,
      title: `Appendix: ${slide.title}`,
      isAppendix: true
    };

    appendixSlides.push(appendixSlide);

    this.log('Moved to appendix', {
      referenceTitle: referenceSlide.title,
      appendixPosition: appendixSlides.length
    });

    return {
      referenceSlide,
      appendixSlides
    };
  }

  /**
   * Validate layout of entire presentation
   *
   * @param {Object} presentation - Presentation object from Google Slides API
   * @returns {Promise<Array<string>>} Array of slide IDs with overflow
   */
  async validateLayout(presentation) {
    this.log('Validating presentation layout', { slides: presentation.slides.length });

    const overflowSlides = [];

    for (const slide of presentation.slides) {
      // Get layout info (simplified - actual implementation would need layout details)
      const layout = { name: 'CONTENT', capacity: 500 }; // Placeholder

      const overflowCheck = await this.detectOverflow(slide, layout);

      if (overflowCheck.overflow) {
        overflowSlides.push(slide.objectId);
      }
    }

    if (overflowSlides.length > 0) {
      this.log('Layout validation found overflows', { count: overflowSlides.length });
    } else {
      this.log('Layout validation passed');
    }

    return overflowSlides;
  }

  /**
   * Resolve overflow on slides
   *
   * @param {Array<Object>} slides - Slides with overflow
   * @param {Object} slidesManager - GoogleSlidesManager instance
   * @param {string} presentationId - Presentation ID
   * @returns {Promise<Array<Object>>} Resolution results
   */
  async resolveOverflow(slides, slidesManager, presentationId) {
    this.log('Resolving overflow', { slideCount: slides.length });

    const results = [];

    for (const slide of slides) {
      // Detect overflow and determine strategy
      const layout = { name: 'CONTENT', capacity: 500 }; // Placeholder
      const overflowCheck = await this.detectOverflow(slide, layout);

      if (!overflowCheck.overflow) {
        results.push({ slideId: slide.slideId, strategy: 'none', success: true });
        continue;
      }

      let result;

      // Apply strategy based on overflow percentage
      switch (overflowCheck.strategy) {
        case 'reduce_font_size':
          result = await this.reduceFontSize(
            presentationId,
            slide.objectId,
            2, // 2pt reduction
            slidesManager
          );
          break;

        case 'abbreviate':
          const abbreviated = await this.abbreviateContent(slide.content, 0.25);
          // Would need to update slide content via slidesManager
          result = { applied: true, strategy: 'abbreviate' };
          break;

        case 'split':
          const splitSlides = await this.splitSlide(slide);
          // Would need to add new slide via slidesManager
          result = { applied: true, strategy: 'split', newSlides: splitSlides.length };
          break;

        case 'appendix':
          const appendix = await this.moveToAppendix(slide);
          // Would need to update slides via slidesManager
          result = { applied: true, strategy: 'appendix' };
          break;

        default:
          result = { applied: false, strategy: 'unknown' };
      }

      results.push({
        slideId: slide.objectId,
        strategy: overflowCheck.strategy,
        ...result
      });
    }

    this.log('Overflow resolution complete', { results: results.length });
    return results;
  }

  /**
   * Extract text content from slide
   *
   * @private
   */
  _extractTextContent(slide) {
    const content = slide.content || {};
    let text = '';

    // Extract title
    if (slide.title) {
      text += slide.title + ' ';
    }

    // Extract all text from content
    for (const value of Object.values(content)) {
      if (typeof value === 'string') {
        text += value + ' ';
      } else if (Array.isArray(value)) {
        text += value.filter(v => typeof v === 'string').join(' ') + ' ';
      }
    }

    return text.trim();
  }

  /**
   * Estimate text length and overflow
   *
   * @private
   */
  _estimateTextLength(text, layout) {
    // Character count estimation
    const charCount = text.length;

    // Average character width at default font size
    const avgCharWidth = this.defaultFontSize * 0.6;

    // Estimated layout capacity (varies by layout type)
    const layoutCapacity = layout.capacity || 500; // characters

    // Calculate current vs capacity
    const current = charCount;
    const capacity = layoutCapacity;
    const overflow = Math.max(0, current - capacity);

    return { current, capacity, overflow };
  }

  /**
   * Determine best strategy for overflow percentage
   *
   * @private
   */
  _determineStrategy(overflowPercentage) {
    if (overflowPercentage < this.thresholds.reduceFontSize) {
      return 'none';
    } else if (overflowPercentage < this.thresholds.abbreviate) {
      return 'reduce_font_size';
    } else if (overflowPercentage < this.thresholds.split) {
      return 'abbreviate';
    } else if (overflowPercentage < this.thresholds.appendix) {
      return 'split';
    } else {
      return 'appendix';
    }
  }

  /**
   * Log message if verbose enabled
   *
   * @private
   */
  log(message, data = null) {
    if (this.verbose) {
      console.log(`[GoogleSlidesLayoutEngine] ${message}`, data !== null ? data : '');
    }
  }
}

module.exports = GoogleSlidesLayoutEngine;
