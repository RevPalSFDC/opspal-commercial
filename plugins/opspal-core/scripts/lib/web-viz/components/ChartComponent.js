/**
 * Chart Component
 *
 * Chart.js-based visualization component supporting multiple chart types.
 * Supports: bar, line, pie, doughnut, scatter, radar, polarArea, bubble, combo, funnel.
 *
 * @module web-viz/components/ChartComponent
 * @version 1.0.0
 */

const BaseComponent = require('./BaseComponent');

// Load defaults
let defaults;
try {
  defaults = require('../../../config/web-viz-defaults.json');
} catch {
  defaults = { chart: {}, theme: {} };
}

class ChartComponent extends BaseComponent {
  /**
   * Create a chart component
   * @param {Object} options - Chart options
   */
  constructor(options = {}) {
    super('chart', options);

    const chartType = options.config?.chartType || options.config?.type || 'bar';

    // Chart-specific configuration
    this.config = {
      chartType,
      baseChartType: options.config?.baseChartType || (chartType === 'combo' ? 'bar' : chartType),
      responsive: options.config?.responsive !== false,
      maintainAspectRatio: options.config?.maintainAspectRatio !== false,
      ...defaults.chart?.defaults?.[(chartType === 'combo' || chartType === 'funnel') ? 'bar' : chartType],
      ...options.config
    };
  }

  /**
   * Supported chart types
   */
  static CHART_TYPES = [
    'bar', 'line', 'pie', 'doughnut', 'scatter',
    'radar', 'polarArea', 'bubble', 'combo', 'funnel'
  ];

  /**
   * Format field/key name as human-readable Title Case label
   * Converts camelCase, snake_case, and kebab-case to "Title Case"
   * Preserves acronyms (QTD, API, etc.)
   * @private
   * @param {string} text - Text to format
   * @returns {string} Human-readable title
   */
  _formatLabel(text) {
    if (!text || typeof text !== 'string') return text;
    return text
      // Insert space before uppercase letters, but keep consecutive uppercase together (acronyms)
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      // Insert space between acronym and following word (APIUser -> API User)
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      // Replace underscores and hyphens with spaces
      .replace(/[_-]/g, ' ')
      // Trim extra spaces and collapse multiple spaces
      .replace(/\s+/g, ' ')
      .trim()
      // Capitalize first letter of each word (Title Case)
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  /**
   * Set chart data in Chart.js format
   * @param {Object} data - Chart data { labels, datasets }
   * @param {Object} metadata - Data source metadata
   * @returns {ChartComponent}
   */
  setData(data, metadata = {}) {
    // Normalize data to Chart.js format
    if (Array.isArray(data)) {
      // Array of objects - auto-convert to labels/datasets
      this.data = this._normalizeArrayData(data);
    } else if (data.labels && data.datasets) {
      // Already in Chart.js format
      this.data = data;
    } else {
      // Object with key-value pairs
      this.data = this._normalizeObjectData(data);
    }

    // Apply default colors if not specified
    this._applyDefaultColors();

    return super.setData(this.data, metadata);
  }

  /**
   * Normalize array data to Chart.js format
   * @private
   */
  _normalizeArrayData(data) {
    if (data.length === 0) {
      return { labels: [], datasets: [] };
    }

    const keys = Object.keys(data[0]);
    const labelKey = this.config.labelField || keys[0];
    const valueKeys = this.config.valueFields || keys.filter(k => k !== labelKey);

    return {
      labels: data.map(row => row[labelKey]),
      datasets: valueKeys.map((key, i) => ({
        label: this.config.datasetLabels?.[i] || this._formatLabel(key),
        data: data.map(row => row[key])
      }))
    };
  }

  /**
   * Normalize object data to Chart.js format
   * @private
   */
  _normalizeObjectData(data) {
    return {
      labels: Object.keys(data).map(k => this._formatLabel(k)),
      datasets: [{
        label: this.title || 'Data',
        data: Object.values(data)
      }]
    };
  }

  /**
   * Apply default colors to datasets
   * @private
   */
  _applyDefaultColors() {
    const chartColors = defaults.theme?.chartColors || [
      '#5F3B8C', '#3E4A61', '#E99560', '#22C55E',
      '#3B82F6', '#F59E0B', '#EC4899', '#8B5CF6'
    ];

    if (this.data?.datasets) {
      this.data.datasets.forEach((dataset, i) => {
        const color = chartColors[i % chartColors.length];

        if (!dataset.backgroundColor) {
          if (['pie', 'doughnut', 'polarArea'].includes(this.config.chartType)) {
            // Multiple colors for slices
            dataset.backgroundColor = this.data.labels.map((_, j) =>
              chartColors[j % chartColors.length]
            );
          } else {
            dataset.backgroundColor = color;
          }
        }

        if (!dataset.borderColor) {
          dataset.borderColor = color;
        }
      });
    }
  }

  /**
   * Determine Chart.js render type
   * @private
   */
  _getRenderChartType() {
    if (this.config.chartType === 'combo') {
      return this.config.baseChartType || 'bar';
    }
    if (this.config.chartType === 'funnel') {
      return 'bar';
    }
    return this.config.chartType;
  }

  /**
   * Merge dataset configuration overrides
   * @private
   */
  _mergeDatasetConfig(data) {
    if (!data || !data.datasets || !Array.isArray(this.config.datasets)) {
      return data;
    }

    return {
      ...data,
      datasets: data.datasets.map((dataset, index) => {
        const overrides = this.config.datasets[index] || {};
        return { ...dataset, ...overrides };
      })
    };
  }

  /**
   * Build annotation config for chartjs-plugin-annotation
   * @private
   */
  _buildAnnotations(indexAxis) {
    const annotations = {};
    const defaultScaleId = indexAxis === 'y' ? 'x' : 'y';

    this.config.annotations.forEach((annotation, index) => {
      const id = annotation.id || `annotation-${index + 1}`;
      const value = annotation.value ?? annotation.position;
      const scaleId = annotation.axis || annotation.scaleId || defaultScaleId;

      const entry = {
        type: annotation.type || 'line',
        scaleID: scaleId,
        value: value,
        borderColor: annotation.color || '#94A3B8',
        borderWidth: annotation.width || 2
      };

      if (annotation.dash || annotation.style === 'dashed') {
        entry.borderDash = annotation.dash || [6, 6];
      }

      if (annotation.label) {
        entry.label = {
          display: true,
          content: annotation.label,
          position: annotation.labelPosition || 'end'
        };
      }

      annotations[id] = entry;
    });

    return annotations;
  }

  /**
   * Get Chart.js configuration object
   * @returns {Object}
   */
  getChartConfig() {
    const data = this._mergeDatasetConfig(this.data);
    const chartType = this._getRenderChartType();
    return {
      type: chartType,
      data,
      options: this._buildOptions(data)
    };
  }

  /**
   * Build Chart.js options object
   * @private
   */
  _buildOptions(data) {
    const options = {
      responsive: this.config.responsive,
      maintainAspectRatio: this.config.maintainAspectRatio,
      plugins: {
        legend: {
          position: this.config.legendPosition || 'bottom',
          display: this.config.showLegend !== false,
          labels: {
            boxWidth: 12,
            boxHeight: 12,
            padding: 16,
            font: {
              size: 13,
              family: "'Figtree', system-ui, sans-serif"
            },
            usePointStyle: true,
            pointStyle: 'circle'
          }
        },
        title: {
          display: false // We show title in HTML wrapper
        },
        tooltip: {
          enabled: this.config.showTooltip !== false
        }
      }
    };

    const indexAxis = this.config.indexAxis || (this.config.chartType === 'funnel' ? 'y' : null);
    if (indexAxis) {
      options.indexAxis = indexAxis;
    }

    // Add animation settings
    if (this.config.animation !== false) {
      options.animation = {
        duration: this.config.animationDuration || 400
      };
    } else {
      options.animation = false;
    }

    // Chart-type specific options
    if (['bar', 'line', 'scatter', 'combo', 'funnel'].includes(this.config.chartType)) {
      options.scales = this._buildScales(data, indexAxis);
    }

    if (this.config.stacked) {
      options.scales = options.scales || {};
      if (!options.scales.x) options.scales.x = {};
      if (!options.scales.y) options.scales.y = {};
      options.scales.x.stacked = true;
      options.scales.y.stacked = true;
    }

    if (this.config.valueFormat) {
      const formatter = this._getValueFormatter(this.config.valueFormat);
      options.plugins.tooltip = options.plugins.tooltip || {};
      options.plugins.tooltip.callbacks = {
        label: function(context) {
          const value = context.parsed?.y ?? context.parsed?.x ?? context.parsed;
          const label = context.dataset?.label ? context.dataset.label + ': ' : '';
          return label + formatter(value);
        }
      };
    }

    if (this.config.showValues) {
      const formatter = this._getValueFormatter(this.config.valueFormat || 'number');
      options.plugins.datalabels = {
        display: true,
        anchor: 'end',
        align: 'end',
        formatter: formatter
      };
    }

    if (Array.isArray(this.config.annotations) && this.config.annotations.length > 0) {
      options.plugins.annotation = {
        annotations: this._buildAnnotations(indexAxis)
      };
    }

    // Apply custom options
    if (this.config.chartOptions) {
      Object.assign(options, this.config.chartOptions);
    }

    return options;
  }

  /**
   * Build scales configuration
   * @private
   */
  _buildScales(data, indexAxis) {
    const scales = {
      x: {
        display: true,
        title: {
          display: !!this.config.xAxisLabel,
          text: this.config.xAxisLabel || ''
        }
      },
      y: {
        display: true,
        beginAtZero: this.config.beginAtZero !== false,
        title: {
          display: !!this.config.yAxisLabel,
          text: this.config.yAxisLabel || ''
        }
      }
    };

    // Format y-axis for currency/percent
    if (this.config.yAxisFormat) {
      scales.y.ticks = {
        callback: this._getTickFormatter(this.config.yAxisFormat)
      };
    }

    if (data?.datasets) {
      const yAxisIds = new Set();
      data.datasets.forEach(dataset => {
        if (dataset?.yAxisID && dataset.yAxisID !== 'y') {
          yAxisIds.add(dataset.yAxisID);
        }
      });

      for (const axisId of yAxisIds) {
        if (!scales[axisId]) {
          scales[axisId] = {
            position: 'right',
            grid: {
              drawOnChartArea: false
            }
          };
        }
      }
    }

    return scales;
  }

  /**
   * Get tick formatter function as string (for embedding in HTML)
   * @private
   */
  _getTickFormatter(format) {
    return this._getValueFormatter(format);
  }

  /**
   * Get value formatter function
   * @private
   */
  _getValueFormatter(format) {
    switch (format) {
      case 'currency-compact':
        return function(value) {
          return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(value);
        };
      case 'currency':
        return function(value) {
          return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
        };
      case 'percent':
        return function(value) {
          return value + '%';
        };
      case 'number':
      default:
        return function(value) {
          if (value === null || value === undefined) return '';
          return value.toLocaleString();
        };
    }
  }

  /**
   * Generate HTML for this chart
   * @returns {string}
   */
  generateHTML() {
    const validation = this.validate();
    if (!validation.valid) {
      return `<div class="component-error">Chart Error: ${validation.errors.join(', ')}</div>`;
    }

    return `
<div class="viz-component viz-chart component-${this.id}" data-component-id="${this.id}" data-component-type="chart" data-chart-type="${this.config.chartType}">
  <div class="component-header">
    <h3 class="component-title">${this._escapeHtml(this.title)}</h3>
    ${this.description ? `<p class="component-description">${this._escapeHtml(this.description)}</p>` : ''}
  </div>
  <div class="component-content">
    <div class="chart-container">
      <canvas id="${this.id}-canvas"></canvas>
    </div>
  </div>
  ${this.dataSource ? `
  <div class="component-footer">
    <span class="data-info">${this.dataSource.recordCount || 0} records</span>
    <span class="data-source">${this.dataSource.type || 'data'}</span>
  </div>
  ` : ''}
</div>`;
  }

  /**
   * Generate CSS for this chart
   * @returns {string}
   */
  generateCSS() {
    return `
${super.generateCSS()}

.component-${this.id} .component-content {
  position: relative;
  min-height: 300px;
}

.component-${this.id} canvas {
  max-width: 100%;
}
`;
  }

  /**
   * Generate JavaScript for this chart
   * @returns {string}
   */
  generateJS() {
    const config = this.getChartConfig();

    // Serialize config with function handling
    const configStr = this._serializeConfig(config);

    return `
(function() {
  const ctx = document.getElementById('${this.id}-canvas');
  if (!ctx) {
    console.error('Canvas not found: ${this.id}-canvas');
    return;
  }

  const config = ${configStr};

  const annotationPlugin = window.ChartAnnotation || window['chartjs-plugin-annotation'];
  if (annotationPlugin && !window.__vizChartAnnotationRegistered) {
    Chart.register(annotationPlugin);
    window.__vizChartAnnotationRegistered = true;
  }

  if (window.ChartDataLabels && !window.__vizChartDataLabelsRegistered) {
    Chart.register(window.ChartDataLabels);
    window.__vizChartDataLabelsRegistered = true;
  }

  // Create chart
  const chart = new Chart(ctx, config);
  window['chart_${this.id}'] = chart;

  // Store reference for updates
  window.VIZ_CHARTS = window.VIZ_CHARTS || {};
  window.VIZ_CHARTS['${this.id}'] = chart;

  window.VIZ_COMPONENTS = window.VIZ_COMPONENTS || {};
  window.VIZ_COMPONENTS['${this.id}'] = {
    type: 'chart',
    setData: function(newData) {
      chart.data = newData;
      chart.update();
    },
    getData: function() {
      return chart.data;
    },
    refresh: function() {
      chart.update();
    }
  };
})();
`;
  }

  /**
   * Serialize config to JSON, handling functions
   * @private
   */
  _serializeConfig(config) {
    return JSON.stringify(config, (key, value) => {
      if (typeof value === 'function') {
        return value.toString();
      }
      return value;
    }, 2).replace(/"(function[^"]+)"/g, (match, fn) => {
      // Unescape function strings
      return fn.replace(/\\n/g, '\n').replace(/\\"/g, '"');
    });
  }

  /**
   * Escape HTML entities
   * @private
   */
  _escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Validate chart is ready to render
   * @returns {Object}
   */
  validate() {
    const base = super.validate();

    if (!ChartComponent.CHART_TYPES.includes(this.config.chartType)) {
      base.errors.push(`Unsupported chart type: ${this.config.chartType}`);
      base.valid = false;
    }

    if (this.data && (!this.data.labels || !this.data.datasets)) {
      base.errors.push('Chart data must have labels and datasets');
      base.valid = false;
    }

    return base;
  }

  /**
   * Update chart data (for conversational updates)
   * @param {Object} newData - New chart data
   * @returns {ChartComponent}
   */
  updateData(newData) {
    if (Array.isArray(newData)) {
      this.data = this._normalizeArrayData(newData);
    } else {
      this.data = { ...this.data, ...newData };
    }
    this._applyDefaultColors();
    this.updated = new Date().toISOString();
    return this;
  }

  /**
   * Create from serialized state
   * @param {Object} json - Serialized chart
   * @returns {ChartComponent}
   */
  static deserialize(json) {
    const component = new ChartComponent({
      id: json.id,
      title: json.title,
      description: json.description,
      position: json.position,
      config: json.config,
      filters: json.filters
    });
    component.data = json.data;
    component.dataSource = json.dataSource;
    component.created = json.created;
    component.updated = json.updated;
    return component;
  }
}

module.exports = ChartComponent;
