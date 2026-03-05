/**
 * Smart Campaign Template Manager
 *
 * Manages campaign templates for cloning workflows. Templates are the
 * primary method for creating functional campaigns with triggers and
 * flows since those cannot be created via API.
 *
 * @module smart-campaign-template-manager
 * @version 1.0.0
 */

const fs = require('fs').promises;
const path = require('path');
const crudWrapper = require('./smart-campaign-crud-wrapper');

/**
 * Default template folder name
 */
const DEFAULT_TEMPLATE_FOLDER = '_Templates';

/**
 * Template registry file path (relative to instance context)
 */
const REGISTRY_FILE = 'campaign-template-registry.json';

/**
 * Template categories
 */
const TEMPLATE_CATEGORIES = {
  TRIGGER: 'trigger',
  BATCH: 'batch',
  NURTURE: 'nurture',
  SCORING: 'scoring',
  NOTIFICATION: 'notification',
  API_TRIGGERED: 'api_triggered',
};

/**
 * Default template definitions
 */
const DEFAULT_TEMPLATES = {
  formResponse: {
    name: 'Template - Form Response',
    category: TEMPLATE_CATEGORIES.TRIGGER,
    description: 'Responds to form submissions',
    tokens: ['my.FormId', 'my.ResponseEmail', 'my.ThankYouPage'],
  },
  emailClick: {
    name: 'Template - Email Click Follow-up',
    category: TEMPLATE_CATEGORIES.TRIGGER,
    description: 'Follow-up when link clicked in email',
    tokens: ['my.SourceEmail', 'my.FollowupEmail'],
  },
  apiTriggered: {
    name: 'Template - API Triggered',
    category: TEMPLATE_CATEGORIES.API_TRIGGERED,
    description: 'Campaign triggered via Request Campaign API',
    tokens: ['my.EmailId', 'my.Subject'],
  },
  scoring: {
    name: 'Template - Scoring Campaign',
    category: TEMPLATE_CATEGORIES.SCORING,
    description: 'Updates lead scores based on actions',
    tokens: ['my.ScoreChange', 'my.Reason'],
  },
  statusChange: {
    name: 'Template - Status Change',
    category: TEMPLATE_CATEGORIES.NOTIFICATION,
    description: 'Changes lead lifecycle status',
    tokens: ['my.NewStatus', 'my.NotifyCampaign'],
  },
  scheduledBatch: {
    name: 'Template - Scheduled Batch',
    category: TEMPLATE_CATEGORIES.BATCH,
    description: 'Batch campaign for scheduled sends',
    tokens: ['my.ListId', 'my.EmailId'],
  },
  nurtureEntry: {
    name: 'Template - Nurture Entry',
    category: TEMPLATE_CATEGORIES.NURTURE,
    description: 'Adds leads to engagement programs',
    tokens: ['my.ProgramId', 'my.StreamId'],
  },
  welcome: {
    name: 'Template - Welcome Series',
    category: TEMPLATE_CATEGORIES.TRIGGER,
    description: 'Welcome email series for new leads',
    tokens: ['my.WelcomeEmail', 'my.FollowupDelay'],
  },
};

/**
 * Template Manager class
 */
class TemplateManager {
  /**
   * Create a new TemplateManager
   * @param {Object} mcpClient - MCP client for API calls
   * @param {string} instancePath - Path to instance context directory
   */
  constructor(mcpClient, instancePath) {
    this.mcpClient = mcpClient;
    this.instancePath = instancePath;
    this.registry = null;
    this.templateFolderId = null;
  }

  /**
   * Initialize the template manager
   * @param {number} templateFolderId - ID of template folder in Marketo
   */
  async initialize(templateFolderId = null) {
    this.templateFolderId = templateFolderId;
    await this.loadRegistry();
  }

  /**
   * Load or create template registry
   */
  async loadRegistry() {
    const registryPath = path.join(this.instancePath, REGISTRY_FILE);

    try {
      const data = await fs.readFile(registryPath, 'utf8');
      this.registry = JSON.parse(data);
    } catch (error) {
      // Create default registry
      this.registry = {
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        templateFolderId: this.templateFolderId,
        templates: {},
        categories: TEMPLATE_CATEGORIES,
      };
      await this.saveRegistry();
    }
  }

  /**
   * Save template registry
   */
  async saveRegistry() {
    const registryPath = path.join(this.instancePath, REGISTRY_FILE);
    this.registry.lastUpdated = new Date().toISOString();
    await fs.writeFile(registryPath, JSON.stringify(this.registry, null, 2));
  }

  /**
   * Discover templates in Marketo folder
   * @param {number} folderId - Folder ID to scan
   * @returns {Promise<Array>} Discovered templates
   */
  async discoverTemplates(folderId = null) {
    const searchFolderId = folderId || this.templateFolderId;

    if (!searchFolderId) {
      throw new Error('No template folder ID specified');
    }

    const result = await this.mcpClient.campaign_list({
      folder: JSON.stringify({ id: searchFolderId, type: 'Folder' }),
    });

    if (!result.success) {
      throw new Error(`Failed to list templates: ${result.message}`);
    }

    const templates = result.campaigns || [];
    const discovered = [];

    for (const campaign of templates) {
      // Extract template info
      const templateInfo = {
        id: campaign.id,
        name: campaign.name,
        description: campaign.description || '',
        type: campaign.type,
        isRequestable: campaign.isRequestable,
        status: campaign.status,
        category: this.detectCategory(campaign),
        tokens: [],
        discoveredAt: new Date().toISOString(),
      };

      // Register in local registry
      const key = this.generateTemplateKey(campaign.name);
      this.registry.templates[key] = templateInfo;
      discovered.push(templateInfo);
    }

    await this.saveRegistry();

    return discovered;
  }

  /**
   * Detect template category from campaign properties
   */
  detectCategory(campaign) {
    const name = campaign.name.toLowerCase();

    if (campaign.isRequestable) return TEMPLATE_CATEGORIES.API_TRIGGERED;
    if (campaign.type === 'batch') return TEMPLATE_CATEGORIES.BATCH;
    if (name.includes('scoring') || name.includes('score')) return TEMPLATE_CATEGORIES.SCORING;
    if (name.includes('nurture') || name.includes('engagement')) return TEMPLATE_CATEGORIES.NURTURE;
    if (name.includes('notification') || name.includes('alert')) return TEMPLATE_CATEGORIES.NOTIFICATION;

    return TEMPLATE_CATEGORIES.TRIGGER;
  }

  /**
   * Generate template key from name
   */
  generateTemplateKey(name) {
    return name
      .toLowerCase()
      .replace(/^template\s*-?\s*/i, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  }

  /**
   * Get template by key
   * @param {string} key - Template key
   * @returns {Object|null} Template info
   */
  getTemplate(key) {
    return this.registry.templates[key] || null;
  }

  /**
   * Get template by ID
   * @param {number} templateId - Template campaign ID
   * @returns {Object|null} Template info
   */
  getTemplateById(templateId) {
    return Object.values(this.registry.templates).find(t => t.id === templateId) || null;
  }

  /**
   * List templates by category
   * @param {string} category - Template category
   * @returns {Array} Templates in category
   */
  listByCategory(category) {
    return Object.entries(this.registry.templates)
      .filter(([_, t]) => t.category === category)
      .map(([key, template]) => ({ key, ...template }));
  }

  /**
   * List all templates
   * @returns {Array} All templates
   */
  listAll() {
    return Object.entries(this.registry.templates)
      .map(([key, template]) => ({ key, ...template }));
  }

  /**
   * Clone from template
   * @param {string} templateKey - Template key or ID
   * @param {Object} options - Clone options
   * @returns {Promise<Object>} Cloned campaign
   */
  async cloneFromTemplate(templateKey, options) {
    const { name, folder, description, programId } = options;

    // Resolve template
    let template = this.getTemplate(templateKey);

    // Try by ID if not found by key
    if (!template && typeof templateKey === 'number') {
      template = this.getTemplateById(templateKey);
    }

    // Try to find by name pattern
    if (!template && typeof templateKey === 'string') {
      const matchingKey = Object.keys(this.registry.templates).find(
        k => k.includes(templateKey.toLowerCase())
      );
      if (matchingKey) {
        template = this.registry.templates[matchingKey];
      }
    }

    if (!template) {
      throw new Error(`Template not found: ${templateKey}`);
    }

    // Build folder target
    const targetFolder = folder || (programId ? { id: programId, type: 'Program' } : null);

    if (!targetFolder) {
      throw new Error('Target folder or programId is required');
    }

    // Clone using CRUD wrapper
    const result = await crudWrapper.cloneCampaign(this.mcpClient, {
      campaignId: template.id,
      name: name || `${template.name} - Clone`,
      folder: targetFolder,
      description: description || `Cloned from template: ${template.name}`,
    });

    if (result.success) {
      // Track clone in registry
      if (!this.registry.templates[templateKey]) {
        this.registry.templates[templateKey] = template;
      }
      this.registry.templates[templateKey].lastCloned = new Date().toISOString();
      this.registry.templates[templateKey].cloneCount =
        (this.registry.templates[templateKey].cloneCount || 0) + 1;
      await this.saveRegistry();
    }

    return result;
  }

  /**
   * Register a new template
   * @param {number} campaignId - Campaign ID to register as template
   * @param {Object} metadata - Template metadata
   * @returns {Promise<Object>} Registered template
   */
  async registerTemplate(campaignId, metadata = {}) {
    // Fetch campaign details
    const campaignResult = await crudWrapper.getCampaign(this.mcpClient, campaignId);

    if (!campaignResult.success) {
      throw new Error(`Failed to fetch campaign ${campaignId}: ${campaignResult.error?.message}`);
    }

    const campaign = campaignResult.data.campaign;

    const templateInfo = {
      id: campaign.id,
      name: campaign.name,
      description: metadata.description || campaign.description || '',
      type: campaign.type,
      isRequestable: campaign.isRequestable,
      category: metadata.category || this.detectCategory(campaign),
      tokens: metadata.tokens || [],
      registeredAt: new Date().toISOString(),
      custom: true,
    };

    const key = metadata.key || this.generateTemplateKey(campaign.name);
    this.registry.templates[key] = templateInfo;
    await this.saveRegistry();

    return { key, ...templateInfo };
  }

  /**
   * Remove a template from registry
   * @param {string} key - Template key
   * @returns {boolean} Success
   */
  async removeTemplate(key) {
    if (!this.registry.templates[key]) {
      return false;
    }

    delete this.registry.templates[key];
    await this.saveRegistry();
    return true;
  }

  /**
   * Get template suggestions based on use case
   * @param {string} useCase - Use case description
   * @returns {Array} Suggested templates
   */
  getSuggestions(useCase) {
    const lowerCase = useCase.toLowerCase();
    const suggestions = [];

    for (const [key, template] of Object.entries(this.registry.templates)) {
      let score = 0;

      // Score based on name match
      if (template.name.toLowerCase().includes(lowerCase)) {
        score += 10;
      }

      // Score based on category match
      if (template.category.toLowerCase().includes(lowerCase)) {
        score += 5;
      }

      // Score based on description match
      if (template.description?.toLowerCase().includes(lowerCase)) {
        score += 3;
      }

      // Score based on keyword matches
      const keywords = ['form', 'email', 'welcome', 'score', 'nurture', 'api', 'batch', 'trigger'];
      for (const keyword of keywords) {
        if (lowerCase.includes(keyword) && template.name.toLowerCase().includes(keyword)) {
          score += 5;
        }
      }

      if (score > 0) {
        suggestions.push({ key, score, ...template });
      }
    }

    return suggestions.sort((a, b) => b.score - a.score);
  }

  /**
   * Validate template is still valid in Marketo
   * @param {string} key - Template key
   * @returns {Promise<Object>} Validation result
   */
  async validateTemplate(key) {
    const template = this.getTemplate(key);

    if (!template) {
      return { valid: false, reason: 'Template not found in registry' };
    }

    const campaignResult = await crudWrapper.getCampaign(this.mcpClient, template.id);

    if (!campaignResult.success) {
      return {
        valid: false,
        reason: `Template no longer exists in Marketo: ${campaignResult.error?.message}`,
        templateId: template.id,
      };
    }

    const campaign = campaignResult.data.campaign;

    // Check if campaign was modified
    const lastUpdated = new Date(campaign.updatedAt);
    const registered = new Date(template.registeredAt || template.discoveredAt);

    return {
      valid: true,
      template,
      campaign,
      modified: lastUpdated > registered,
      lastUpdated: campaign.updatedAt,
    };
  }

  /**
   * Export registry to JSON
   * @returns {Object} Registry data
   */
  exportRegistry() {
    return {
      ...this.registry,
      exportedAt: new Date().toISOString(),
    };
  }

  /**
   * Import registry from JSON
   * @param {Object} data - Registry data
   * @param {boolean} merge - Merge with existing or replace
   */
  async importRegistry(data, merge = true) {
    if (merge) {
      this.registry.templates = {
        ...this.registry.templates,
        ...data.templates,
      };
    } else {
      this.registry = data;
    }

    this.registry.lastUpdated = new Date().toISOString();
    await this.saveRegistry();
  }
}

/**
 * Create a new TemplateManager instance
 */
function createTemplateManager(mcpClient, instancePath) {
  return new TemplateManager(mcpClient, instancePath);
}

module.exports = {
  TemplateManager,
  createTemplateManager,
  TEMPLATE_CATEGORIES,
  DEFAULT_TEMPLATES,
  DEFAULT_TEMPLATE_FOLDER,
};
