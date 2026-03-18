/**
 * Web Visualization Generator
 *
 * Dynamic web dashboard generation for OpsPal plugins.
 * Supports charts, tables, maps with conversational updates.
 *
 * @module web-viz
 * @version 1.0.0
 *
 * @example
 * const { WebVizGenerator, StateManager } = require('./web-viz');
 *
 * // Create a new dashboard
 * const viz = new WebVizGenerator({ theme: 'revpal' });
 * const dashboard = await viz.dashboard('Sales Dashboard').init();
 *
 * // Add components
 * dashboard
 *   .addChart('revenue', { type: 'bar', title: 'Revenue by Region' })
 *   .setData('revenue', salesData, { type: 'salesforce', query: 'SELECT...' })
 *   .addTable('deals', { title: 'Open Opportunities' })
 *   .setData('deals', dealsData);
 *
 * // Generate static HTML
 * await dashboard.generateStaticHTML('./output/dashboard.html');
 *
 * // Or start dev server for live updates
 * await dashboard.serve({ port: 3847 });
 */

const WebVizGenerator = require('./WebVizGenerator');
const StateManager = require('./StateManager');
const BaseComponent = require('./components/BaseComponent');

// Lazy-load components to avoid circular dependencies
const components = {
  get ChartComponent() {
    return require('./components/ChartComponent');
  },
  get TableComponent() {
    return require('./components/TableComponent');
  },
  get MapComponent() {
    return require('./components/MapComponent');
  },
  get KPICardComponent() {
    return require('./components/KPICardComponent');
  },
  get FlowDiagramComponent() {
    return require('./components/FlowDiagramComponent');
  },
  get GaugeComponent() {
    return require('./components/GaugeComponent');
  },
  // Interactive input components for compensation calculators
  get SliderComponent() {
    return require('./components/SliderComponent');
  },
  get NumberInputComponent() {
    return require('./components/NumberInputComponent');
  },
  get DropdownComponent() {
    return require('./components/DropdownComponent');
  },
  get DatePickerComponent() {
    return require('./components/DatePickerComponent');
  },
  get CalculatorComponent() {
    return require('./components/CalculatorComponent');
  },
  // Plan builder components (Phase 6)
  get FileUploadComponent() {
    return require('./components/FileUploadComponent');
  },
  get EditableTableComponent() {
    return require('./components/EditableTableComponent');
  },
  get PlanBuilderComponent() {
    return require('./components/PlanBuilderComponent');
  }
};

// Lazy-load adapters
const adapters = {
  get SalesforceAdapter() {
    return require('./adapters/SalesforceAdapter');
  },
  get HubSpotAdapter() {
    return require('./adapters/HubSpotAdapter');
  },
  get FileAdapter() {
    return require('./adapters/FileAdapter');
  }
};

// Lazy-load server
const server = {
  get DevServer() {
    return require('./server/DevServer');
  }
};

// Lazy-load output generators
const output = {
  get StaticHtmlGenerator() {
    return require('./output/StaticHtmlGenerator');
  }
};

// Lazy-load template system
const templates = {
  get TemplateBuilder() {
    return require('./templates/TemplateBuilder').TemplateBuilder;
  },
  get TemplateRegistry() {
    return require('./templates/TemplateRegistry').TemplateRegistry;
  },
  get getRegistry() {
    return require('./templates/TemplateRegistry').getRegistry;
  },
  get SalesforceBindings() {
    return require('./templates/data-bindings/SalesforceBindings');
  },
  get HubSpotBindings() {
    return require('./templates/data-bindings/HubSpotBindings');
  }
};

/**
 * Create a quick chart visualization
 * @param {Object} options - Chart options
 * @returns {Promise<string>} Generated HTML path
 */
async function quickChart(options) {
  const {
    title,
    type = 'bar',
    data,
    labels,
    outputPath,
    theme = 'revpal'
  } = options;

  const viz = new WebVizGenerator({ theme });
  const dashboard = await viz.dashboard(title).init();

  dashboard.addChart('main', {
    type,
    title,
    position: { colspan: 12 }
  });

  dashboard.setData('main', {
    labels,
    datasets: [{
      label: title,
      data,
      backgroundColor: viz.options.theme?.chartColors || ['#5F3B8C']
    }]
  });

  return dashboard.generateStaticHTML(outputPath);
}

/**
 * Create a quick table visualization
 * @param {Object} options - Table options
 * @returns {Promise<string>} Generated HTML path
 */
async function quickTable(options) {
  const {
    title,
    data,
    columns,
    outputPath,
    theme = 'revpal'
  } = options;

  const viz = new WebVizGenerator({ theme });
  const dashboard = await viz.dashboard(title).init();

  dashboard.addTable('main', {
    title,
    columns: columns || (data.length > 0 ? Object.keys(data[0]) : []),
    position: { colspan: 12 }
  });

  dashboard.setData('main', data);

  return dashboard.generateStaticHTML(outputPath);
}

/**
 * Load configuration defaults
 * @returns {Object} Default configuration
 */
function getDefaults() {
  try {
    return require('../../../config/web-viz-defaults.json');
  } catch {
    return {};
  }
}

/**
 * Create dashboard from template
 * @param {string} templateId - Template identifier
 * @param {Object} options - Template options
 * @returns {Promise<Object>} TemplateBuilder instance
 */
async function fromTemplate(templateId, options = {}) {
  const { TemplateBuilder } = templates;
  const builder = new TemplateBuilder(templateId, options);
  await builder.loadTemplate();
  return builder;
}

/**
 * List available templates
 * @returns {Promise<Array>} Template list
 */
async function listTemplates() {
  const { getRegistry } = templates;
  const registry = getRegistry();
  await registry.load();
  return registry.list();
}

module.exports = {
  // Main classes
  WebVizGenerator,
  StateManager,
  BaseComponent,

  // Components (lazy-loaded)
  components,

  // Adapters (lazy-loaded)
  adapters,

  // Server (lazy-loaded)
  server,

  // Output generators (lazy-loaded)
  output,

  // Template system (lazy-loaded)
  templates,

  // Quick helpers
  quickChart,
  quickTable,
  getDefaults,

  // Template helpers
  fromTemplate,
  listTemplates,

  // Default export
  default: WebVizGenerator
};
