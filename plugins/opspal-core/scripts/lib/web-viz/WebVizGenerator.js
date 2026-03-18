/**
 * Web Visualization Generator
 *
 * Main orchestrator for generating interactive web dashboards.
 * Uses Builder pattern for fluent API, supports static HTML and dev server modes.
 *
 * @module web-viz/WebVizGenerator
 * @version 1.0.0
 *
 * @example
 * const WebVizGenerator = require('./WebVizGenerator');
 * const viz = new WebVizGenerator({ theme: 'revpal' });
 *
 * const dashboard = viz.dashboard('Sales Pipeline')
 *   .addChart('revenue', { type: 'bar', title: 'Revenue by Region' })
 *   .addTable('deals', { title: 'Open Deals', sortable: true })
 *   .addKPI('total', { title: 'Total Pipeline', format: 'currency' });
 *
 * // Generate static HTML
 * await dashboard.generateStaticHTML('./output/dashboard.html');
 *
 * // Or start dev server
 * await dashboard.serve({ port: 3847 });
 */

const path = require('path');
const fs = require('fs').promises;
const StateManager = require('./StateManager');

// Load defaults
let defaults;
try {
  defaults = require('../../../config/web-viz-defaults.json');
} catch {
  defaults = {};
}

class WebVizGenerator {
  /**
   * Create a WebVizGenerator
   * @param {Object} options - Generator options
   */
  constructor(options = {}) {
    this.options = {
      theme: options.theme || defaults.theme?.name || 'revpal',
      outputDir: options.outputDir || defaults.output?.defaultDir || './dashboards',
      ...defaults,
      ...options
    };
  }

  /**
   * Create a new dashboard builder
   * @param {string} title - Dashboard title
   * @param {Object} config - Dashboard configuration
   * @returns {DashboardBuilder}
   */
  dashboard(title, config = {}) {
    return new DashboardBuilder(title, { ...this.options, ...config });
  }

  /**
   * Load an existing dashboard session
   * @param {string} sessionId - Session ID to load
   * @returns {Promise<DashboardBuilder>}
   */
  async loadDashboard(sessionId) {
    const stateManager = new StateManager(sessionId, {
      stateDir: this.options.outputDir
    });
    await stateManager.load();

    const builder = new DashboardBuilder(
      stateManager.state.metadata.title,
      { ...this.options, sessionId }
    );
    builder.stateManager = stateManager;

    return builder;
  }

  /**
   * List available dashboard sessions
   * @returns {Promise<Object[]>}
   */
  async listDashboards() {
    return StateManager.listSessions(this.options.outputDir);
  }

  /**
   * Get default configuration
   * @returns {Object}
   */
  getDefaults() {
    return { ...defaults };
  }
}

/**
 * Dashboard Builder - Fluent API for building dashboards
 */
class DashboardBuilder {
  /**
   * Create a dashboard builder
   * @param {string} title - Dashboard title
   * @param {Object} options - Builder options
   */
  constructor(title, options = {}) {
    this.title = title;
    this.options = options;
    this.runtimeConfig = options.runtimeConfig || null;

    // Initialize state manager
    this.stateManager = new StateManager(options.sessionId, {
      stateDir: options.outputDir || './dashboards',
      autoSave: options.autoSave !== false
    });

    // Component instances
    this.components = new Map();

    // Pending operations (for batch updates)
    this.pendingOps = [];
  }

  /**
   * Initialize the dashboard session
   * @returns {Promise<DashboardBuilder>}
   */
  async init() {
    await this.stateManager.initialize({
      title: this.title,
      theme: this.options.theme,
      description: this.options.description || ''
    });
    return this;
  }

  /**
   * Add a chart component
   * @param {string} id - Component ID
   * @param {Object} config - Chart configuration
   * @returns {DashboardBuilder}
   */
  addChart(id, config = {}) {
    const ChartComponent = require('./components/ChartComponent');
    const component = new ChartComponent({
      id,
      title: config.title || id,
      config: {
        chartType: config.type || config.chartType || 'bar',
        ...config
      },
      position: config.position
    });

    this.components.set(id, component);
    this.pendingOps.push({ type: 'add', componentId: id });

    return this;
  }

  /**
   * Add a table component
   * @param {string} id - Component ID
   * @param {Object} config - Table configuration
   * @returns {DashboardBuilder}
   */
  addTable(id, config = {}) {
    const TableComponent = require('./components/TableComponent');
    const component = new TableComponent({
      id,
      title: config.title || id,
      config: {
        columns: config.columns || [],
        sortable: config.sortable !== false,
        filterable: config.filterable !== false,
        pagination: config.pagination !== false,
        pageSize: config.pageSize || 25,
        ...config
      },
      position: config.position
    });

    this.components.set(id, component);
    this.pendingOps.push({ type: 'add', componentId: id });

    return this;
  }

  /**
   * Add an editable table component
   * @param {string} id - Component ID
   * @param {Object} config - Table configuration
   * @returns {DashboardBuilder}
   */
  addEditableTable(id, config = {}) {
    const EditableTableComponent = require('./components/EditableTableComponent');
    const component = new EditableTableComponent(id, {
      title: config.title || id,
      description: config.description || '',
      position: config.position,
      columns: config.columns || [],
      rows: config.rows || config.data || [],
      addRowLabel: config.addRowLabel || '+ Add Row',
      allowDelete: config.deleteRow !== false && config.allowDelete !== false,
      allowReorder: config.allowReorder !== false,
      onRowChange: config.onEdit || config.onRowChange || null,
      ...config
    });

    this.components.set(id, component);
    this.pendingOps.push({ type: 'add', componentId: id });

    return this;
  }

  /**
   * Add a file upload component
   * @param {string} id - Component ID
   * @param {Object} config - Upload configuration
   * @returns {DashboardBuilder}
   */
  addFileUpload(id, config = {}) {
    const FileUploadComponent = require('./components/FileUploadComponent');
    const component = new FileUploadComponent(id, {
      title: config.title || id,
      description: config.description || '',
      position: config.position,
      accept: config.accept,
      maxSize: config.maxSize,
      onUpload: config.onUpload || null,
      multiple: config.multiple || false,
      parseAs: config.parseAs || null,
      columnMapping: config.columnMapping || null,
      ...config
    });

    this.components.set(id, component);
    this.pendingOps.push({ type: 'add', componentId: id });

    return this;
  }

  /**
   * Add a compensation plan builder component
   * @param {string} id - Component ID
   * @param {Object} config - Builder configuration
   * @returns {DashboardBuilder}
   */
  addPlanBuilder(id, config = {}) {
    const PlanBuilderComponent = require('./components/PlanBuilderComponent');
    const component = new PlanBuilderComponent(id, {
      title: config.title || id,
      description: config.description || '',
      position: config.position,
      ...config
    });

    this.components.set(id, component);
    this.pendingOps.push({ type: 'add', componentId: id });

    return this;
  }

  /**
   * Add a map component
   * @param {string} id - Component ID
   * @param {Object} config - Map configuration
   * @returns {DashboardBuilder}
   */
  addMap(id, config = {}) {
    const MapComponent = require('./components/MapComponent');
    const component = new MapComponent({
      id,
      title: config.title || id,
      config: {
        mapType: config.mapType || 'markers',
        center: config.center || defaults.map?.center,
        zoom: config.zoom || defaults.map?.zoom,
        ...config
      },
      position: config.position
    });

    this.components.set(id, component);
    this.pendingOps.push({ type: 'add', componentId: id });

    return this;
  }

  /**
   * Add a KPI card component
   * @param {string} id - Component ID
   * @param {Object} config - KPI configuration
   * @returns {DashboardBuilder}
   */
  addKPI(id, config = {}) {
    const KPICardComponent = require('./components/KPICardComponent');
    const component = new KPICardComponent({
      id,
      title: config.title || id,
      config: {
        format: config.format || 'number',
        showTrend: config.showTrend !== false,
        ...config
      },
      position: config.position || { colspan: 3 }
    });

    this.components.set(id, component);
    this.pendingOps.push({ type: 'add', componentId: id });

    return this;
  }

  /**
   * Add a flow diagram component (Mermaid-based)
   * @param {string} id - Component ID
   * @param {Object} config - Flow diagram configuration
   * @returns {DashboardBuilder}
   */
  addFlowDiagram(id, config = {}) {
    const FlowDiagramComponent = require('./components/FlowDiagramComponent');
    const component = new FlowDiagramComponent({
      id,
      title: config.title || id,
      config: {
        diagramType: config.diagramType || 'flowchart',
        direction: config.direction || 'TB',
        theme: config.theme || 'default',
        showLegend: config.showLegend !== false,
        height: config.height || 400,
        interactive: config.interactive !== false,
        ...config
      },
      position: config.position
    });

    this.components.set(id, component);
    this.pendingOps.push({ type: 'add', componentId: id });

    return this;
  }

  /**
   * Add a gauge component (for scores, percentages, quota attainment)
   * @param {string} id - Component ID
   * @param {Object} config - Gauge configuration
   * @returns {DashboardBuilder}
   */
  addGauge(id, config = {}) {
    const GaugeComponent = require('./components/GaugeComponent');
    const component = new GaugeComponent({
      id,
      title: config.title || id,
      config: {
        min: config.min || 0,
        max: config.max || 100,
        thresholds: config.thresholds || [
          { value: 60, color: '#EF4444', label: 'Poor' },
          { value: 80, color: '#F59E0B', label: 'Fair' },
          { value: 100, color: '#22C55E', label: 'Good' }
        ],
        valueFormat: config.valueFormat || 'number',
        showValue: config.showValue !== false,
        showLabel: config.showLabel !== false,
        showThresholdLabels: config.showThresholdLabels || false,
        animate: config.animate !== false,
        size: config.size || 200,
        ...config
      },
      position: config.position || { colspan: 4 }
    });

    this.components.set(id, component);
    this.pendingOps.push({ type: 'add', componentId: id });

    return this;
  }

  /**
   * Add a calculator component
   * @param {string} id - Component ID
   * @param {Object} config - Calculator configuration
   * @returns {DashboardBuilder}
   */
  addCalculator(id, config = {}) {
    const CalculatorComponent = require('./components/CalculatorComponent');
    const component = new CalculatorComponent({
      id,
      title: config.title || id,
      config: {
        inputs: config.inputs || [],
        outputs: config.outputs || [],
        calculate: config.calculate,
        layout: config.layout || 'vertical',
        ...config
      },
      position: config.position || { colspan: 6 }
    });

    this.components.set(id, component);
    this.pendingOps.push({ type: 'add', componentId: id });

    return this;
  }

  /**
   * Add a slider component
   * @param {string} id - Component ID
   * @param {Object} config - Slider configuration
   * @returns {DashboardBuilder}
   */
  addSlider(id, config = {}) {
    const SliderComponent = require('./components/SliderComponent');
    const component = new SliderComponent({
      id,
      title: config.title || id,
      config: {
        min: config.min || 0,
        max: config.max || 100,
        ...config
      },
      position: config.position || { colspan: 4 }
    });

    this.components.set(id, component);
    this.pendingOps.push({ type: 'add', componentId: id });

    return this;
  }

  /**
   * Add a number input component
   * @param {string} id - Component ID
   * @param {Object} config - Input configuration
   * @returns {DashboardBuilder}
   */
  addNumberInput(id, config = {}) {
    const NumberInputComponent = require('./components/NumberInputComponent');
    const component = new NumberInputComponent({
      id,
      title: config.title || id,
      config: {
        format: config.format || 'number',
        ...config
      },
      position: config.position || { colspan: 3 }
    });

    this.components.set(id, component);
    this.pendingOps.push({ type: 'add', componentId: id });

    return this;
  }

  /**
   * Add a dropdown component
   * @param {string} id - Component ID
   * @param {Object} config - Dropdown configuration
   * @returns {DashboardBuilder}
   */
  addDropdown(id, config = {}) {
    const DropdownComponent = require('./components/DropdownComponent');
    const component = new DropdownComponent({
      id,
      title: config.title || id,
      config: {
        options: config.options || [],
        ...config
      },
      position: config.position || { colspan: 3 }
    });

    this.components.set(id, component);
    this.pendingOps.push({ type: 'add', componentId: id });

    return this;
  }

  /**
   * Add a date picker component
   * @param {string} id - Component ID
   * @param {Object} config - Date picker configuration
   * @returns {DashboardBuilder}
   */
  addDatePicker(id, config = {}) {
    const DatePickerComponent = require('./components/DatePickerComponent');
    const component = new DatePickerComponent({
      id,
      title: config.title || id,
      config: {
        format: config.format || 'YYYY-MM-DD',
        ...config
      },
      position: config.position || { colspan: 3 }
    });

    this.components.set(id, component);
    this.pendingOps.push({ type: 'add', componentId: id });

    return this;
  }

  /**
   * Set data for a component
   * @param {string} componentId - Component ID
   * @param {Array|Object} data - Data to visualize
   * @param {Object} metadata - Data source metadata
   * @returns {DashboardBuilder}
   */
  setData(componentId, data, metadata = {}) {
    const component = this.components.get(componentId);
    if (!component) {
      throw new Error(`Component not found: ${componentId}`);
    }

    component.setData(data, metadata);
    this.pendingOps.push({ type: 'update', componentId, field: 'data' });

    return this;
  }

  /**
   * Update component configuration
   * @param {string} componentId - Component ID
   * @param {Object} config - Configuration updates
   * @returns {DashboardBuilder}
   */
  updateConfig(componentId, config) {
    const component = this.components.get(componentId);
    if (!component) {
      throw new Error(`Component not found: ${componentId}`);
    }

    component.setConfig(config);
    this.pendingOps.push({ type: 'update', componentId, field: 'config' });

    return this;
  }

  /**
   * Add filter to a component
   * @param {string} componentId - Component ID
   * @param {Object} filter - Filter { field, op, value }
   * @returns {DashboardBuilder}
   */
  addFilter(componentId, filter) {
    const component = this.components.get(componentId);
    if (!component) {
      throw new Error(`Component not found: ${componentId}`);
    }

    component.addFilter(filter);
    this.pendingOps.push({ type: 'update', componentId, field: 'filter' });

    return this;
  }

  /**
   * Remove a component
   * @param {string} componentId - Component ID
   * @returns {DashboardBuilder}
   */
  removeComponent(componentId) {
    this.components.delete(componentId);
    this.stateManager.removeSection(componentId);
    this.pendingOps.push({ type: 'remove', componentId });

    return this;
  }

  /**
   * Get a component by ID
   * @param {string} componentId - Component ID
   * @returns {BaseComponent|null}
   */
  getComponent(componentId) {
    return this.components.get(componentId) || null;
  }

  /**
   * Get all components
   * @returns {Map}
   */
  getComponents() {
    return this.components;
  }

  /**
   * Sync components to state manager
   * @private
   */
  _syncState() {
    for (const [id, component] of this.components) {
      this.stateManager.addSection(component.serialize());
    }
  }

  /**
   * Record a conversation turn
   * @param {string} userQuery - User's request
   * @param {string} action - Action taken
   * @param {Object} changes - Changes made
   * @returns {DashboardBuilder}
   */
  recordTurn(userQuery, action, changes = {}) {
    this.stateManager.recordConversationTurn({
      userQuery,
      action,
      changes,
      affectedComponents: Object.keys(changes)
    });
    return this;
  }

  /**
   * Generate static HTML file
   * @param {string} outputPath - Output file path
   * @param {Object} options - Generation options
   * @param {boolean} options.serve - Auto-serve via HTTP and open browser (default: true)
   * @param {number} options.serverTimeout - Server auto-close timeout in ms (default: 300000)
   * @param {boolean} options.openBrowser - Open browser automatically (default: true)
   * @returns {Promise<string|Object>} Generated file path, or server info if serve=true
   */
  async generateStaticHTML(outputPath, options = {}) {
    const {
      serve = true,  // Default to serving via HTTP for seamless experience
      serverTimeout = 300000,  // 5 minutes
      openBrowser = true,
      ...generateOptions
    } = options;

    // Sync state
    this._syncState();
    this.stateManager.setMode('static');
    await this.stateManager.save();

    // Generate HTML
    const StaticHtmlGenerator = require('./output/StaticHtmlGenerator');
    const generator = new StaticHtmlGenerator(this.options);

    const html = await generator.generate({
      title: this.title,
      theme: this.options.theme,
      themeConfig: this.options.themeConfig || {},
      layout: this.options.layout,
      components: Array.from(this.components.values()),
      state: this.stateManager.getState(),
      runtime: options.runtime || this.runtimeConfig,
      ...generateOptions
    });

    // Resolve output path
    const finalPath = outputPath || path.join(
      this.stateManager.getSessionDir(),
      'dashboard.html'
    );

    await fs.mkdir(path.dirname(finalPath), { recursive: true });
    await fs.writeFile(finalPath, html, 'utf-8');

    // Auto-serve via HTTP to avoid file:// protocol issues
    if (serve) {
      try {
        const serverInfo = await StaticHtmlGenerator.serveAndOpen(finalPath, {
          timeout: serverTimeout,
          openBrowser
        });
        return {
          filePath: finalPath,
          url: serverInfo.url,
          port: serverInfo.port,
          close: serverInfo.close
        };
      } catch (err) {
        // Fallback to file path if server fails
        console.warn(`Could not start HTTP server: ${err.message}. Opening file directly.`);
        return finalPath;
      }
    }

    return finalPath;
  }

  /**
   * Start development server
   * @param {Object} options - Server options
   * @returns {Promise<Object>} Server info
   */
  async serve(options = {}) {
    // Sync state
    this._syncState();
    this.stateManager.setMode('dev-server');
    await this.stateManager.save();

    const DevServer = require('./server/DevServer');
    const server = new DevServer({
      port: options.port || defaults.server?.port || 3847,
      host: options.host || defaults.server?.host || 'localhost',
      openBrowser: options.openBrowser !== false,
      ...options
    });

    return server.start(this);
  }

  /**
   * Get pending operations (for dev server updates)
   * @returns {Object[]}
   */
  getPendingOps() {
    const ops = [...this.pendingOps];
    this.pendingOps = [];
    return ops;
  }

  /**
   * Get dashboard summary
   * @returns {Object}
   */
  getSummary() {
    return {
      sessionId: this.stateManager.sessionId,
      title: this.title,
      componentCount: this.components.size,
      components: Array.from(this.components.values()).map(c => ({
        id: c.id,
        type: c.type,
        title: c.title,
        hasData: !!c.data
      })),
      ...this.stateManager.getSummary()
    };
  }

  /**
   * List component references (for conversational display)
   * @returns {string[]}
   */
  listComponents() {
    return Array.from(this.components.values()).map((c, i) => {
      const dataStatus = c.data ? `${c.dataSource?.recordCount || 0} records` : 'no data';
      const filters = c.filters?.length ? `, ${c.filters.length} filters` : '';
      return `${i + 1}. [${c.id}] ${c.title} (${c.type}) - ${dataStatus}${filters}`;
    });
  }

  /**
   * Export dashboard state
   * @returns {Object}
   */
  exportState() {
    this._syncState();
    return this.stateManager.getState();
  }

  /**
   * Validate all components
   * @returns {Object} { valid: boolean, errors: Object }
   */
  validate() {
    const errors = {};
    let valid = true;

    for (const [id, component] of this.components) {
      const result = component.validate();
      if (!result.valid) {
        valid = false;
        errors[id] = result.errors;
      }
    }

    return { valid, errors };
  }
}

module.exports = WebVizGenerator;
module.exports.DashboardBuilder = DashboardBuilder;
