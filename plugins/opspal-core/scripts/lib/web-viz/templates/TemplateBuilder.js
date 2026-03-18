/**
 * Template Builder
 *
 * Instantiates dashboard templates with data bindings, customizations,
 * and demo data support. Converts template specs into fully configured
 * dashboards ready for HTML generation.
 *
 * @module web-viz/templates/TemplateBuilder
 * @version 1.0.0
 *
 * @example
 * const { TemplateBuilder } = require('./templates/TemplateBuilder');
 *
 * const builder = new TemplateBuilder('sales-pipeline');
 * await builder.loadTemplate();
 * builder.setFilters({ timePeriod: 'this-quarter' });
 * builder.useDemo(true);
 * const dashboard = await builder.build();
 * await dashboard.generateStaticHTML('/tmp/pipeline.html');
 */

const fs = require('fs');
const path = require('path');
const { getRegistry } = require('./TemplateRegistry');

class TemplateBuilder {
  /**
   * Create a TemplateBuilder
   * @param {string} templateId - Template identifier
   * @param {Object} options - Configuration options
   */
  constructor(templateId, options = {}) {
    this.templateId = templateId;
    this.options = {
      platform: options.platform || 'salesforce',
      orgAlias: options.orgAlias || null,
      theme: options.theme || 'revpal',
      demoDataDir: options.demoDataDir || path.join(__dirname, '../../../../templates/web-viz/demo-data'),
      ...options
    };

    this.template = null;
    this.filters = {};
    this.overrides = {};
    this.usesDemoData = false;
    this.customData = new Map();
    this.demoData = null;
  }

  /**
   * Load template from registry
   * @returns {Promise<TemplateBuilder>} This builder for chaining
   */
  async loadTemplate() {
    const registry = getRegistry();
    await registry.load();

    this.template = await registry.loadTemplate(this.templateId);

    // Check platform compatibility
    if (this.template.platforms && !this.template.platforms.includes(this.options.platform)) {
      throw new Error(
        `Template '${this.templateId}' does not support platform '${this.options.platform}'. ` +
        `Supported: ${this.template.platforms.join(', ')}`
      );
    }

    return this;
  }

  /**
   * Enable demo data mode
   * @param {boolean} enabled - Whether to use demo data
   * @returns {TemplateBuilder} This builder for chaining
   */
  useDemo(enabled = true) {
    this.usesDemoData = enabled;
    return this;
  }

  /**
   * Set global filters
   * @param {Object} filters - Filter key-value pairs
   * @returns {TemplateBuilder} This builder for chaining
   */
  setFilters(filters) {
    this.filters = { ...this.filters, ...filters };
    return this;
  }

  /**
   * Set a specific filter
   * @param {string} filterId - Filter identifier
   * @param {*} value - Filter value
   * @returns {TemplateBuilder} This builder for chaining
   */
  setFilter(filterId, value) {
    this.filters[filterId] = value;
    return this;
  }

  /**
   * Set theme
   * @param {string} theme - Theme name
   * @returns {TemplateBuilder} This builder for chaining
   */
  setTheme(theme) {
    this.options.theme = theme;
    return this;
  }

  /**
   * Set platform
   * @param {string} platform - Platform name (salesforce, hubspot)
   * @returns {TemplateBuilder} This builder for chaining
   */
  setPlatform(platform) {
    this.options.platform = platform;
    return this;
  }

  /**
   * Set org alias for live data
   * @param {string} orgAlias - Salesforce org alias
   * @returns {TemplateBuilder} This builder for chaining
   */
  setOrg(orgAlias) {
    this.options.orgAlias = orgAlias;
    return this;
  }

  /**
   * Override component configuration
   * @param {string} componentId - Component identifier
   * @param {Object} config - Configuration overrides
   * @returns {TemplateBuilder} This builder for chaining
   */
  overrideComponent(componentId, config) {
    this.overrides[componentId] = { ...this.overrides[componentId], ...config };
    return this;
  }

  /**
   * Set custom data for a component
   * @param {string} componentId - Component identifier
   * @param {*} data - Component data
   * @returns {TemplateBuilder} This builder for chaining
   */
  setComponentData(componentId, data) {
    this.customData.set(componentId, data);
    return this;
  }

  /**
   * Load demo data for template
   * @returns {Promise<Object>} Demo data keyed by component ID
   */
  async loadDemoData() {
    const demoFile = path.join(this.options.demoDataDir, `${this.templateId}-demo.json`);

    try {
      const data = await fs.promises.readFile(demoFile, 'utf8');
      this.demoData = JSON.parse(data);
      return this.demoData;
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.warn(`Demo data not found for template '${this.templateId}': ${demoFile}`);
        return {};
      }
      throw error;
    }
  }

  /**
   * Fetch live data for a component's data binding
   * @param {Object} binding - Data binding specification
   * @returns {Promise<*>} Fetched data
   */
  async fetchLiveData(binding) {
    const resolved = this._resolveBinding(binding);
    if (!resolved) {
      return null;
    }

    const platform = resolved.source || this.options.platform;

    if (platform === 'salesforce') {
      return this.fetchSalesforceData(resolved);
    } else if (platform === 'hubspot') {
      return this.fetchHubSpotData(resolved);
    } else if (platform === 'static') {
      return resolved.data || null;
    } else if (platform === 'local') {
      if (resolved.field) {
        return this.resolvePath(this.demoData || {}, resolved.field);
      }
      if (resolved.local?.data !== undefined) {
        return resolved.local.data;
      }
      return null;
    } else if (platform === 'calculated') {
      console.warn(`Calculated bindings are evaluated in the browser runtime: ${resolved.query || resolved.queryId || 'unknown'}`);
      return null;
    }

    throw new Error(`Unsupported data source: ${platform}`);
  }

  /**
   * Fetch data from Salesforce
   * @param {Object} binding - Data binding with query spec
   * @returns {Promise<*>} Query results
   */
  async fetchSalesforceData(binding) {
    // Try to load Salesforce bindings
    let SalesforceBindings;
    try {
      SalesforceBindings = require('./data-bindings/SalesforceBindings');
    } catch (error) {
      throw new Error('Salesforce bindings not available. Use demo data or install bindings.');
    }

    const bindings = new SalesforceBindings(this.options.orgAlias);
    return bindings.executeBinding(binding, this.filters);
  }

  /**
   * Fetch data from HubSpot
   * @param {Object} binding - Data binding with query spec
   * @returns {Promise<*>} Query results
   */
  async fetchHubSpotData(binding) {
    // Try to load HubSpot bindings
    let HubSpotBindings;
    try {
      HubSpotBindings = require('./data-bindings/HubSpotBindings');
    } catch (error) {
      throw new Error('HubSpot bindings not available. Use demo data or install bindings.');
    }

    const bindings = new HubSpotBindings();
    return bindings.executeBinding(binding, this.filters);
  }

  /**
   * Resolve dot notation path to get nested value
   * @param {Object} obj - Object to traverse
   * @param {string} path - Dot notation path (e.g., "kpis.totalPipeline")
   * @returns {*} Value at path or undefined
   */
  resolvePath(obj, path) {
    if (!path || !obj) return undefined;
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
  }

  /**
   * Populate data for all components
   * @returns {Promise<Map>} Component data map
   */
  async populateData() {
    const componentData = new Map();

    if (this.usesDemoData) {
      // Load demo data
      const demoData = await this.loadDemoData();

      for (const component of this.template.spec.components) {
        if (this.customData.has(component.id)) {
          componentData.set(component.id, this.customData.get(component.id));
        } else if (component.demoData) {
          // Resolve dot notation path from component.demoData
          const data = this.resolvePath(demoData, component.demoData);
          if (data !== undefined) {
            componentData.set(component.id, data);
          }
        } else if (demoData[component.id]) {
          // Fallback: try component ID directly
          componentData.set(component.id, demoData[component.id]);
        }
      }
    } else {
      // Fetch live data
      for (const component of this.template.spec.components) {
        if (this.customData.has(component.id)) {
          componentData.set(component.id, this.customData.get(component.id));
        } else if (component.dataBinding) {
          try {
            const data = await this.fetchLiveData(component.dataBinding);
            componentData.set(component.id, data);
          } catch (error) {
            console.warn(`Failed to fetch data for ${component.id}: ${error.message}`);
            componentData.set(component.id, null);
          }
        }
      }
    }

    return componentData;
  }

  /**
   * Resolve data binding spec from template registry
   * @param {Object} binding - Binding definition from component
   * @returns {Object|null}
   */
  _resolveBinding(binding) {
    if (!binding) return null;
    const queryId = binding.query || binding.queryId;
    const spec = queryId && this.template?.spec?.dataBindings
      ? this.template.spec.dataBindings[queryId]
      : null;
    if (spec) {
      return { ...spec, ...binding };
    }
    return binding;
  }

  /**
   * Build dashboard from template
   * @returns {Promise<Object>} DashboardBuilder instance
   */
  async build() {
    if (!this.template) {
      await this.loadTemplate();
    }

    // Get the WebVizGenerator
    const WebVizGenerator = require('../WebVizGenerator');
    const viz = new WebVizGenerator({
      theme: this.options.theme
    });

    // Create dashboard
    const dashboardConfig = {
      description: this.template.spec.description,
      theme: this.options.theme,
      layout: this.template.spec.layout,
      themeConfig: this.template.spec.theme || {}
    };

    const dashboard = await viz.dashboard(
      this.template.spec.name || this.template.name,
      dashboardConfig
    ).init();

    // Populate data
    const componentData = await this.populateData();

    // Runtime config for local bindings
    dashboard.runtimeConfig = await this._buildRuntimeConfig();

    // Add components
    for (const component of this.template.spec.components) {
      const overrides = this.overrides[component.id] || {};
      const config = { ...component.config, ...overrides };
      const position = component.position || {};

      // Add component based on type
      switch (component.type) {
        case 'kpi':
          dashboard.addKPI(component.id, {
            title: component.title,
            ...config,
            position: { colspan: position.colspan || 3, ...position }
          });
          break;

        case 'chart':
          dashboard.addChart(component.id, {
            title: component.title,
            type: config.chartType || 'bar',
            ...config,
            position: { colspan: position.colspan || 6, ...position }
          });
          break;

        case 'table':
          if (config.editable) {
            dashboard.addEditableTable(component.id, {
              title: component.title,
              ...config,
              position: { colspan: position.colspan || 12, ...position },
              rows: componentData.get(component.id) || config.rows || []
            });
          } else {
            dashboard.addTable(component.id, {
              title: component.title,
              ...config,
              position: { colspan: position.colspan || 12, ...position }
            });
          }
          break;

        case 'map':
          dashboard.addMap(component.id, {
            title: component.title,
            mapType: config.mapType || 'markers',
            ...config,
            position: { colspan: position.colspan || 8, ...position }
          });
          break;

        case 'flowDiagram':
          dashboard.addFlowDiagram(component.id, {
            title: component.title,
            diagramType: config.diagramType || 'flowchart',
            ...config,
            position: { colspan: position.colspan || 8, ...position }
          });
          break;

        case 'gauge':
          // Gauge component - falls back to KPI if not available
          try {
            dashboard.addGauge(component.id, {
              title: component.title,
              ...config,
              position: { colspan: position.colspan || 4, ...position }
            });
          } catch (error) {
            // Fall back to KPI display
            dashboard.addKPI(component.id, {
              title: component.title,
              ...config,
              position: { colspan: position.colspan || 4, ...position }
            });
          }
          break;

        case 'calculator':
          dashboard.addCalculator(component.id, {
            title: component.title,
            ...config,
            position: { colspan: position.colspan || 6, ...position }
          });
          break;

        case 'editableTable':
          dashboard.addEditableTable(component.id, {
            title: component.title,
            ...config,
            position: { colspan: position.colspan || 12, ...position },
            rows: componentData.get(component.id) || config.rows || []
          });
          break;

        case 'fileUpload':
          dashboard.addFileUpload(component.id, {
            title: component.title,
            ...config,
            position: { colspan: position.colspan || 12, ...position }
          });
          break;

        case 'planBuilder':
          dashboard.addPlanBuilder(component.id, {
            title: component.title,
            ...config,
            position: { colspan: position.colspan || 12, ...position }
          });
          break;

        case 'slider':
          dashboard.addSlider(component.id, {
            title: component.title,
            ...config,
            position: { colspan: position.colspan || 4, ...position }
          });
          break;

        case 'dropdown':
          dashboard.addDropdown(component.id, {
            title: component.title,
            ...config,
            position: { colspan: position.colspan || 3, ...position }
          });
          break;

        case 'number-input':
          dashboard.addNumberInput(component.id, {
            title: component.title,
            ...config,
            position: { colspan: position.colspan || 3, ...position }
          });
          break;

        case 'date-picker':
          dashboard.addDatePicker(component.id, {
            title: component.title,
            ...config,
            position: { colspan: position.colspan || 3, ...position }
          });
          break;

        default:
          console.warn(`Unknown component type: ${component.type}`);
      }

      // Set data for component
      const data = componentData.get(component.id);
      if (data !== undefined) {
        dashboard.setData(component.id, data);
      }
    }

    return dashboard;
  }

  /**
   * Build and generate static HTML
   * @param {string} outputPath - Output file path
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Generation result
   */
  async buildAndGenerate(outputPath, options = {}) {
    const dashboard = await this.build();
    return dashboard.generateStaticHTML(outputPath, options);
  }

  /**
   * Build runtime config for local bindings/callbacks
   * @returns {Promise<Object>}
   */
  async _buildRuntimeConfig() {
    if (!this.template) {
      return {};
    }

    if (this.usesDemoData && !this.demoData) {
      await this.loadDemoData();
    }

    return {
      templateId: this.templateId,
      templateName: this.template.name,
      components: (this.template.spec.components || []).map(component => ({
        id: component.id,
        type: component.type,
        dataBinding: component.dataBinding || null,
        demoData: component.demoData || null
      })),
      dataBindings: this.template.spec.dataBindings || {},
      callbacks: this.template.spec.callbacks || {},
      filters: this.filters,
      localData: this.usesDemoData ? (this.demoData || {}) : {},
      usesDemoData: this.usesDemoData
    };
  }

  /**
   * Get template info
   * @returns {Object} Template metadata
   */
  getInfo() {
    if (!this.template) {
      return { id: this.templateId, loaded: false };
    }

    return {
      id: this.templateId,
      name: this.template.name,
      description: this.template.description,
      category: this.template.category,
      platforms: this.template.platforms,
      componentCount: this.template.spec?.components?.length || 0,
      filters: this.filters,
      usesDemoData: this.usesDemoData,
      loaded: true
    };
  }

  /**
   * Get component list from template
   * @returns {Array<Object>} Component summaries
   */
  getComponents() {
    if (!this.template?.spec?.components) {
      return [];
    }

    return this.template.spec.components.map(c => ({
      id: c.id,
      type: c.type,
      title: c.title,
      hasDataBinding: !!c.dataBinding
    }));
  }
}

module.exports = { TemplateBuilder };
