#!/usr/bin/env node

/**
 * Google Slides Template Manager
 *
 * Manages presentation template library with metadata-driven selection.
 * Provides template discovery, selection, and validation.
 *
 * Features:
 * - Load template metadata from JSON files
 * - Select best template based on deck type and audience
 * - Get layout information by name
 * - Extract placeholder lists
 * - Validate template availability
 * - Support template inheritance
 */

const fs = require('fs').promises;
const path = require('path');

class GoogleSlidesTemplateManager {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.templatesDir = options.templatesDir ||
      path.join(__dirname, '../../templates/google-slides');

    // Cache for loaded templates
    this.templateCache = new Map();

    this.log('GoogleSlidesTemplateManager initialized', { templatesDir: this.templatesDir });
  }

  /**
   * Load template metadata from JSON file
   *
   * @param {string} templateName - Template name (e.g., 'revpal-master', 'executive-brief')
   * @returns {Promise<Object>} Template metadata
   */
  async loadTemplateMetadata(templateName) {
    this.log('Loading template metadata', { templateName });

    // Check cache first
    if (this.templateCache.has(templateName)) {
      this.log('Template loaded from cache', { templateName });
      return this.templateCache.get(templateName);
    }

    try {
      // Load from file
      const templatePath = path.join(this.templatesDir, `${templateName}.json`);
      const templateData = await fs.readFile(templatePath, 'utf8');
      const template = JSON.parse(templateData);

      // If template inherits from another, load parent first
      if (template.inheritsFrom) {
        const parentTemplate = await this.loadTemplateMetadata(template.inheritsFrom);

        // Merge with parent (child overrides parent)
        template.branding = { ...parentTemplate.branding, ...template.branding };
        template.layouts = template.layouts || parentTemplate.layouts;
        template.contentGuidelines = {
          ...parentTemplate.contentGuidelines,
          ...template.contentGuidelines
        };
      }

      // Cache it
      this.templateCache.set(templateName, template);

      this.log('Template loaded', { templateName });
      return template;

    } catch (error) {
      throw new Error(`Failed to load template '${templateName}': ${error.message}`);
    }
  }

  /**
   * Select best template based on deck type and audience
   *
   * @param {string} deckType - Type of deck (executive_brief, deep_dive, customer_update, general)
   * @param {string} audience - Target audience (executive, technical, sales, customer)
   * @returns {Promise<Object>} Selected template metadata
   */
  async selectTemplate(deckType, audience) {
    this.log('Selecting template', { deckType, audience });

    // Get all available templates
    const templates = await this.listTemplates();

    // Filter by deck type
    let candidates = templates.filter(t => t.deckType === deckType);

    // If no exact match, fallback to general or master
    if (candidates.length === 0) {
      candidates = templates.filter(t =>
        t.deckType === 'general' || t.name === 'RevPal Master Template'
      );
    }

    // Filter by audience if specified
    if (audience && candidates.length > 1) {
      const audienceMatches = candidates.filter(t =>
        t.targetAudience && t.targetAudience.includes(audience)
      );

      if (audienceMatches.length > 0) {
        candidates = audienceMatches;
      }
    }

    // Return first candidate or throw error
    if (candidates.length === 0) {
      throw new Error(`No template found for deckType='${deckType}', audience='${audience}'`);
    }

    const selected = candidates[0];

    this.log('Template selected', {
      name: selected.name,
      deckType: selected.deckType,
      audience: selected.targetAudience
    });

    return selected;
  }

  /**
   * Get layout by name from template
   *
   * @param {string} templateName - Template name
   * @param {string} layoutName - Layout name (e.g., 'TITLE', 'CONTENT', 'KPI')
   * @returns {Promise<Object>} Layout metadata
   */
  async getLayoutByName(templateName, layoutName) {
    this.log('Getting layout', { templateName, layoutName });

    const template = await this.loadTemplateMetadata(templateName);

    if (!template.layouts) {
      throw new Error(`Template '${templateName}' has no layouts defined`);
    }

    const layout = template.layouts.find(l => l.id === layoutName || l.name === layoutName);

    if (!layout) {
      throw new Error(`Layout '${layoutName}' not found in template '${templateName}'`);
    }

    return layout;
  }

  /**
   * Get all placeholders from a layout
   *
   * @param {Object} layout - Layout object
   * @returns {Array<string>} Array of placeholder tokens (e.g., ['{{title}}', '{{subtitle}}'])
   */
  getPlaceholders(layout) {
    return layout.placeholders || [];
  }

  /**
   * Validate that template exists and is accessible
   *
   * @param {string} templateId - Google Slides template ID
   * @param {Object} [slidesManager] - Optional GoogleSlidesManager instance for API check
   * @returns {Promise<{valid: boolean, error?: string}>}
   */
  async validateTemplate(templateId, slidesManager = null) {
    this.log('Validating template', { templateId });

    // Basic validation - check ID format
    if (!templateId || typeof templateId !== 'string') {
      return {
        valid: false,
        error: 'Template ID is required and must be a string'
      };
    }

    // If slidesManager provided, check via API
    if (slidesManager) {
      try {
        await slidesManager.getPresentation(templateId);
        return { valid: true };
      } catch (error) {
        return {
          valid: false,
          error: `Template not accessible: ${error.message}`
        };
      }
    }

    // Otherwise, just validate format
    const idPattern = /^[a-zA-Z0-9_-]+$/;
    if (!idPattern.test(templateId)) {
      return {
        valid: false,
        error: 'Invalid template ID format'
      };
    }

    return { valid: true };
  }

  /**
   * List all available templates
   *
   * @returns {Promise<Array<Object>>} Array of template metadata
   */
  async listTemplates() {
    this.log('Listing templates');

    try {
      // Read template directory
      const files = await fs.readdir(this.templatesDir);

      // Filter JSON files
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      // Load all templates
      const templates = await Promise.all(
        jsonFiles.map(async file => {
          const templateName = file.replace('.json', '');
          return await this.loadTemplateMetadata(templateName);
        })
      );

      this.log('Templates listed', { count: templates.length });
      return templates;

    } catch (error) {
      throw new Error(`Failed to list templates: ${error.message}`);
    }
  }

  /**
   * Get template by ID
   *
   * @param {string} templateId - Template ID to search for
   * @returns {Promise<Object|null>} Template metadata or null
   */
  async getTemplateById(templateId) {
    this.log('Getting template by ID', { templateId });

    const templates = await this.listTemplates();
    const template = templates.find(t => t.templateId === templateId);

    if (!template) {
      this.log('Template not found', { templateId });
      return null;
    }

    return template;
  }

  /**
   * Get recommended layouts for specific content types
   *
   * @param {string} contentType - Type of content (opening, metrics, comparison, etc.)
   * @param {string} [templateName='revpal-master'] - Template name
   * @returns {Promise<Array<Object>>} Array of recommended layouts
   */
  async getRecommendedLayouts(contentType, templateName = 'revpal-master') {
    this.log('Getting recommended layouts', { contentType, templateName });

    const template = await this.loadTemplateMetadata(templateName);

    if (!template.layouts) {
      return [];
    }

    // Filter layouts by recommendedFor
    const recommended = template.layouts.filter(layout =>
      layout.recommendedFor && layout.recommendedFor.includes(contentType)
    );

    return recommended;
  }

  /**
   * Get content guidelines from template
   *
   * @param {string} templateName - Template name
   * @returns {Promise<Object>} Content guidelines
   */
  async getContentGuidelines(templateName) {
    this.log('Getting content guidelines', { templateName });

    const template = await this.loadTemplateMetadata(templateName);

    return template.contentGuidelines || {
      maxBulletsPerSlide: 5,
      maxWordsPerBullet: 15,
      maxSlidesPerDeck: 50
    };
  }

  /**
   * Get branding specifications from template
   *
   * @param {string} templateName - Template name
   * @returns {Promise<Object>} Branding specifications
   */
  async getBrandingSpecs(templateName) {
    this.log('Getting branding specs', { templateName });

    const template = await this.loadTemplateMetadata(templateName);

    return template.branding || {
      primaryFont: 'Montserrat',
      bodyFont: 'Figtree',
      colors: {
        primary: '#5F3B8C',
        secondary: '#3E4A61',
        accent: '#E99560'
      }
    };
  }

  /**
   * Clear template cache
   */
  clearCache() {
    this.log('Clearing template cache');
    this.templateCache.clear();
  }

  /**
   * Get template cache statistics
   *
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    return {
      size: this.templateCache.size,
      templates: Array.from(this.templateCache.keys())
    };
  }

  /**
   * Log message if verbose enabled
   *
   * @private
   */
  log(message, data = null) {
    if (this.verbose) {
      console.log(`[GoogleSlidesTemplateManager] ${message}`, data !== null ? data : '');
    }
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log(`
Usage: node google-slides-template-manager.js <command> [options]

Commands:
  list                          List all available templates
  load <templateName>           Load template metadata
  select <deckType> <audience>  Select best template
  layout <templateName> <layoutName>  Get layout by name
  validate <templateId>         Validate template ID

Options:
  --verbose                     Enable verbose logging

Examples:
  # List templates
  node google-slides-template-manager.js list --verbose

  # Load template
  node google-slides-template-manager.js load revpal-master

  # Select template
  node google-slides-template-manager.js select executive_brief executive

  # Get layout
  node google-slides-template-manager.js layout revpal-master KPI
    `);
    process.exit(0);
  }

  const parseArgs = (args) => {
    const parsed = {};
    for (let i = 0; i < args.length; i++) {
      if (args[i].startsWith('--')) {
        parsed[args[i].substring(2)] = true;
      }
    }
    return parsed;
  };

  const options = parseArgs(args);
  const manager = new GoogleSlidesTemplateManager({
    verbose: options.verbose || false
  });

  (async () => {
    try {
      switch (command) {
        case 'list':
          const templates = await manager.listTemplates();
          console.log(JSON.stringify(templates, null, 2));
          break;

        case 'load':
          const template = await manager.loadTemplateMetadata(args[1]);
          console.log(JSON.stringify(template, null, 2));
          break;

        case 'select':
          const selected = await manager.selectTemplate(args[1], args[2]);
          console.log(JSON.stringify(selected, null, 2));
          break;

        case 'layout':
          const layout = await manager.getLayoutByName(args[1], args[2]);
          console.log(JSON.stringify(layout, null, 2));
          break;

        case 'validate':
          const validation = await manager.validateTemplate(args[1]);
          console.log(JSON.stringify(validation, null, 2));
          break;

        default:
          console.error(`Unknown command: ${command}`);
          process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = GoogleSlidesTemplateManager;
