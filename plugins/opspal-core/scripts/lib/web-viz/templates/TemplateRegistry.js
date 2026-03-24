/**
 * Template Registry
 *
 * Manages discovery, validation, and retrieval of dashboard templates.
 * Templates are JSON files that define pre-configured dashboard layouts
 * optimized for specific RevOps use cases.
 *
 * @module web-viz/templates/TemplateRegistry
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

class TemplateRegistry {
  /**
   * Create a TemplateRegistry
   * @param {Object} options - Configuration options
   */
  constructor(options = {}) {
    this.options = {
      configPath: options.configPath || path.join(__dirname, '../../../../config/web-viz-templates.json'),
      templatesDir: options.templatesDir || path.join(__dirname, '../../../../templates/web-viz'),
      ...options
    };

    this.templates = new Map();
    this.loaded = false;
    // Optional customization resolver for template overrides
    this.resolver = options.resolver || null;
  }

  /**
   * Load template registry from config file
   * @returns {Promise<void>}
   */
  async load() {
    if (this.loaded) return;

    try {
      const configData = await fs.promises.readFile(this.options.configPath, 'utf8');
      const config = JSON.parse(configData);

      for (const template of config.templates || []) {
        this.templates.set(template.id, {
          ...template,
          fullPath: path.join(this.options.templatesDir, path.basename(template.file))
        });
      }

      this.loaded = true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Config file doesn't exist yet - start with empty registry
        this.loaded = true;
      } else {
        throw new Error(`Failed to load template registry: ${error.message}`);
      }
    }
  }

  /**
   * Get all available templates
   * @returns {Array<Object>} List of template metadata
   */
  list() {
    return Array.from(this.templates.values()).map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      platforms: t.platforms,
      keywords: t.keywords
    }));
  }

  /**
   * Get templates filtered by category
   * @param {string} category - Category to filter by
   * @returns {Array<Object>} Matching templates
   */
  listByCategory(category) {
    return this.list().filter(t => t.category === category);
  }

  /**
   * Get templates filtered by platform
   * @param {string} platform - Platform to filter by (salesforce, hubspot)
   * @returns {Array<Object>} Matching templates
   */
  listByPlatform(platform) {
    return this.list().filter(t => t.platforms?.includes(platform));
  }

  /**
   * Search templates by keyword
   * @param {string} query - Search query
   * @returns {Array<Object>} Matching templates
   */
  search(query) {
    const queryLower = query.toLowerCase();
    return this.list().filter(t => {
      const searchText = [
        t.id,
        t.name,
        t.description,
        ...(t.keywords || [])
      ].join(' ').toLowerCase();
      return searchText.includes(queryLower);
    });
  }

  /**
   * Get template metadata by ID
   * @param {string} templateId - Template identifier
   * @returns {Object|null} Template metadata or null if not found
   */
  get(templateId) {
    return this.templates.get(templateId) || null;
  }

  /**
   * Check if template exists
   * @param {string} templateId - Template identifier
   * @returns {boolean}
   */
  has(templateId) {
    return this.templates.has(templateId);
  }

  /**
   * Load and return full template spec
   * @param {string} templateId - Template identifier
   * @returns {Promise<Object>} Full template specification
   */
  async loadTemplate(templateId) {
    // Check customization resolver first for template override
    if (this.resolver) {
      try {
        const resolved = await this.resolver.resolveTemplate(templateId, 'web-viz');
        if (resolved?.content && resolved.record?.source_type === 'custom') {
          const template = typeof resolved.content === 'string'
            ? JSON.parse(resolved.content)
            : resolved.content;
          this.validateTemplate(template);
          return { id: templateId, spec: template, source: 'custom' };
        }
      } catch {
        // Resolver failed — fall through to packaged file
      }
    }

    const meta = this.get(templateId);
    if (!meta) {
      throw new Error(`Template not found: ${templateId}`);
    }

    try {
      const templateData = await fs.promises.readFile(meta.fullPath, 'utf8');
      const template = JSON.parse(templateData);

      // Validate template structure
      this.validateTemplate(template);

      return {
        ...meta,
        spec: template
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Template file not found: ${meta.fullPath}`);
      }
      throw new Error(`Failed to load template ${templateId}: ${error.message}`);
    }
  }

  /**
   * Validate template specification
   * @param {Object} template - Template spec to validate
   * @throws {Error} If template is invalid
   */
  validateTemplate(template) {
    const required = ['id', 'name', 'components'];
    for (const field of required) {
      if (!template[field]) {
        throw new Error(`Template missing required field: ${field}`);
      }
    }

    if (!Array.isArray(template.components) || template.components.length === 0) {
      throw new Error('Template must have at least one component');
    }

    // Validate each component
    for (const component of template.components) {
      this.validateComponent(component);
    }

    return true;
  }

  /**
   * Validate component specification
   * @param {Object} component - Component spec to validate
   * @throws {Error} If component is invalid
   */
  validateComponent(component) {
    const required = ['id', 'type', 'title'];
    for (const field of required) {
      if (!component[field]) {
        throw new Error(`Component missing required field: ${field}`);
      }
    }

    const validTypes = [
      'kpi',
      'chart',
      'table',
      'map',
      'flowDiagram',
      'gauge',
      'calculator',
      'slider',
      'number-input',
      'dropdown',
      'date-picker',
      'editableTable',
      'fileUpload',
      'planBuilder'
    ];
    if (!validTypes.includes(component.type)) {
      throw new Error(`Invalid component type: ${component.type}. Valid types: ${validTypes.join(', ')}`);
    }

    if (component.type === 'chart') {
      const chartType = component.config?.chartType || component.config?.type;
      const validChartTypes = [
        'bar',
        'line',
        'pie',
        'doughnut',
        'scatter',
        'radar',
        'polarArea',
        'bubble',
        'combo',
        'funnel'
      ];
      if (chartType && !validChartTypes.includes(chartType)) {
        throw new Error(`Invalid chart type: ${chartType}. Valid types: ${validChartTypes.join(', ')}`);
      }
    }

    return true;
  }

  /**
   * Register a new template
   * @param {Object} templateMeta - Template metadata
   */
  register(templateMeta) {
    if (!templateMeta.id) {
      throw new Error('Template must have an id');
    }
    this.templates.set(templateMeta.id, {
      ...templateMeta,
      fullPath: templateMeta.fullPath || path.join(this.options.templatesDir, `${templateMeta.id}.json`)
    });
  }

  /**
   * Get template categories
   * @returns {Array<string>} Unique categories
   */
  getCategories() {
    const categories = new Set();
    for (const template of this.templates.values()) {
      if (template.category) {
        categories.add(template.category);
      }
    }
    return Array.from(categories);
  }

  /**
   * Get all supported platforms
   * @returns {Array<string>} Unique platforms
   */
  getPlatforms() {
    const platforms = new Set();
    for (const template of this.templates.values()) {
      for (const platform of template.platforms || []) {
        platforms.add(platform);
      }
    }
    return Array.from(platforms);
  }

  /**
   * Get summary statistics
   * @returns {Object} Registry statistics
   */
  getStats() {
    const byCategory = {};
    const byPlatform = {};

    for (const template of this.templates.values()) {
      // Count by category
      const cat = template.category || 'uncategorized';
      byCategory[cat] = (byCategory[cat] || 0) + 1;

      // Count by platform
      for (const platform of template.platforms || []) {
        byPlatform[platform] = (byPlatform[platform] || 0) + 1;
      }
    }

    return {
      total: this.templates.size,
      byCategory,
      byPlatform,
      categories: this.getCategories(),
      platforms: this.getPlatforms()
    };
  }
}

// Singleton instance
let instance = null;

/**
 * Get singleton registry instance
 * @param {Object} options - Options for new instance
 * @returns {TemplateRegistry}
 */
function getRegistry(options = {}) {
  if (!instance) {
    instance = new TemplateRegistry(options);
  }
  return instance;
}

module.exports = { TemplateRegistry, getRegistry };
