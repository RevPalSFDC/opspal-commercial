/**
 * Gauge Component
 *
 * Renders SVG-based semicircle gauges for displaying scores, percentages,
 * and quota attainment. Supports color thresholds, labels, and animations.
 *
 * @module web-viz/components/GaugeComponent
 * @version 1.0.0
 *
 * @example
 * const dashboard = viz.dashboard('Data Quality');
 *
 * dashboard.addGauge('quality-score', {
 *   title: 'Overall Data Quality',
 *   min: 0,
 *   max: 100,
 *   thresholds: [
 *     { value: 60, color: '#EF4444', label: 'Poor' },
 *     { value: 80, color: '#F59E0B', label: 'Fair' },
 *     { value: 100, color: '#22C55E', label: 'Good' }
 *   ]
 * });
 * dashboard.setData('quality-score', { value: 85 });
 */

const BaseComponent = require('./BaseComponent');

class GaugeComponent extends BaseComponent {
  /**
   * Create a GaugeComponent
   * @param {Object} options - Component options
   */
  constructor(options = {}) {
    super('gauge', options);

    if (this.position.colspan == null) {
      this.position.colspan = 4;
    }

    // Default configuration
    this.config = {
      min: 0,
      max: 100,
      thresholds: [
        { value: 60, color: '#EF4444', label: 'Poor' },
        { value: 80, color: '#F59E0B', label: 'Fair' },
        { value: 100, color: '#22C55E', label: 'Good' }
      ],
      showValue: true,
      showLabel: true,
      showThresholdLabels: false,
      valueFormat: options.config?.valueFormat || options.config?.format || 'number', // number, percent, currency
      valueSuffix: '',
      valuePrefix: '',
      arcWidth: 20,
      arcPadding: 2,
      startAngle: -135,
      endAngle: 135,
      size: 200,
      animate: true,
      animationDuration: 1000,
      backgroundColor: '#E5E7EB',
      ...options.config
    };
  }

  /**
   * Set data for the gauge
   * @param {Object|number} data - Gauge value or object with value property
   * @param {Object} metadata - Data source metadata
   */
  setData(data, metadata = {}) {
    if (typeof data === 'number') {
      this.data = { value: data };
    } else {
      this.data = data;
    }

    // Calculate percentage and get threshold color
    const value = this.data.value || 0;
    const percentage = this.getPercentage(value);
    const threshold = this.getThreshold(value);

    this.data = {
      ...this.data,
      percentage,
      threshold,
      color: threshold?.color || this.config.thresholds[this.config.thresholds.length - 1]?.color || '#22C55E'
    };

    this.dataSource = {
      type: metadata.type || 'provided',
      ...metadata
    };
  }

  /**
   * Calculate percentage based on min/max
   * @param {number} value - Current value
   * @returns {number} Percentage (0-100)
   */
  getPercentage(value) {
    const { min, max } = this.config;
    const clamped = Math.max(min, Math.min(max, value));
    return ((clamped - min) / (max - min)) * 100;
  }

  /**
   * Get threshold for current value
   * @param {number} value - Current value
   * @returns {Object|null} Matching threshold
   */
  getThreshold(value) {
    const { thresholds } = this.config;
    if (!thresholds || thresholds.length === 0) return null;

    // Sort thresholds by value ascending
    const sorted = [...thresholds].sort((a, b) => a.value - b.value);

    for (const threshold of sorted) {
      if (value <= threshold.value) {
        return threshold;
      }
    }

    // Value exceeds all thresholds, return the last one
    return sorted[sorted.length - 1];
  }

  /**
   * Format value for display
   * @param {number} value - Value to format
   * @returns {string} Formatted value
   */
  formatValue(value) {
    const { valueFormat, valuePrefix, valueSuffix } = this.config;

    let formatted;
    switch (valueFormat) {
      case 'percent':
        formatted = `${Math.round(value)}%`;
        break;
      case 'currency':
        formatted = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0
        }).format(value);
        break;
      case 'number':
      default:
        if (value >= 1000000) {
          formatted = `${(value / 1000000).toFixed(1)}M`;
        } else if (value >= 1000) {
          formatted = `${(value / 1000).toFixed(1)}K`;
        } else {
          formatted = Math.round(value).toString();
        }
    }

    return `${valuePrefix}${formatted}${valueSuffix}`;
  }

  /**
   * Generate SVG arc path
   * @param {number} startAngle - Start angle in degrees
   * @param {number} endAngle - End angle in degrees
   * @param {number} radius - Arc radius
   * @param {number} centerX - Center X coordinate
   * @param {number} centerY - Center Y coordinate
   * @returns {string} SVG path d attribute
   */
  generateArcPath(startAngle, endAngle, radius, centerX, centerY) {
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;

    const x1 = centerX + radius * Math.cos(startRad);
    const y1 = centerY + radius * Math.sin(startRad);
    const x2 = centerX + radius * Math.cos(endRad);
    const y2 = centerY + radius * Math.sin(endRad);

    const largeArc = endAngle - startAngle > 180 ? 1 : 0;

    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
  }

  /**
   * Generate HTML for the component
   * @returns {string} HTML string
   */
  generateHTML() {
    const value = this.data?.value || 0;
    const percentage = this.data?.percentage || 0;
    const color = this.data?.color || '#22C55E';
    const threshold = this.data?.threshold;

    const {
      size,
      arcWidth,
      startAngle,
      endAngle,
      backgroundColor,
      showValue,
      showLabel,
      showThresholdLabels,
      thresholds,
      animate,
      animationDuration
    } = this.config;

    const svgHeight = size * 0.65;
    const centerX = size / 2;
    const centerY = svgHeight * 0.75;  // Position arc center lower in the viewBox
    const radius = (size - arcWidth) / 2;

    // Calculate value arc end angle
    const totalAngle = endAngle - startAngle;
    const valueAngle = startAngle + (totalAngle * percentage) / 100;

    const containerId = `gauge-${this.id}`;

    // Generate threshold arc segments
    let thresholdArcs = '';
    if (showThresholdLabels && thresholds.length > 0) {
      const sortedThresholds = [...thresholds].sort((a, b) => a.value - b.value);
      let prevAngle = startAngle;

      for (let i = 0; i < sortedThresholds.length; i++) {
        const t = sortedThresholds[i];
        const tPercentage = this.getPercentage(t.value);
        const tAngle = startAngle + (totalAngle * tPercentage) / 100;

        thresholdArcs += `
          <path
            class="gauge-threshold-segment"
            d="${this.generateArcPath(prevAngle, tAngle, radius - arcWidth - 5, centerX, centerY)}"
            fill="none"
            stroke="${t.color}"
            stroke-width="3"
            stroke-opacity="0.3"
          />
        `;
        prevAngle = tAngle;
      }
    }

    return `
      <div class="viz-component gauge-component component-${this.id}" id="component-${this.id}">
        <div class="component-header">
          <h3 class="component-title">${this.title || 'Gauge'}</h3>
          ${this.description ? `<p class="component-description">${this.description}</p>` : ''}
        </div>
        <div class="component-body">
          <div class="gauge-container" id="${containerId}" style="display: flex; flex-direction: column; align-items: center;">
            <svg width="${size}" height="${size * 0.65}" viewBox="0 0 ${size} ${size * 0.65}" style="overflow: visible;">
              <!-- Background arc -->
              <path
                class="gauge-background"
                d="${this.generateArcPath(startAngle, endAngle, radius, centerX, centerY)}"
                fill="none"
                stroke="${backgroundColor}"
                stroke-width="${arcWidth}"
                stroke-linecap="round"
              />

              <!-- Threshold segments (if enabled) -->
              ${thresholdArcs}

              <!-- Value arc -->
              <path
                class="gauge-value"
                id="gauge-value-${this.id}"
                d="${this.generateArcPath(startAngle, valueAngle, radius, centerX, centerY)}"
                fill="none"
                stroke="${color}"
                stroke-width="${arcWidth}"
                stroke-linecap="round"
                ${animate ? `style="stroke-dasharray: 1000; stroke-dashoffset: 1000; animation: gauge-fill-${this.id} ${animationDuration}ms ease-out forwards;"` : ''}
              />

              <!-- Value text -->
              ${showValue ? `
                <text
                  x="${centerX}"
                  y="${centerY - 18}"
                  text-anchor="middle"
                  dominant-baseline="middle"
                  class="gauge-value-text"
                  style="font-size: ${size * 0.15}px; font-weight: bold; fill: ${color};"
                >
                  ${this.formatValue(value)}
                </text>
              ` : ''}

              <!-- Label text -->
              ${showLabel && threshold?.label ? `
                <text
                  x="${centerX}"
                  y="${centerY + 8}"
                  text-anchor="middle"
                  dominant-baseline="middle"
                  class="gauge-label-text"
                  style="font-size: ${size * 0.08}px; fill: #64748B;"
                >
                  ${threshold.label}
                </text>
              ` : ''}

              <!-- Min/Max labels -->
              <text
                x="${centerX - radius + 10}"
                y="${centerY + 15}"
                text-anchor="start"
                class="gauge-minmax-text"
                style="font-size: ${size * 0.06}px; fill: #94A3B8;"
              >
                ${this.config.min}
              </text>
              <text
                x="${centerX + radius - 10}"
                y="${centerY + 15}"
                text-anchor="end"
                class="gauge-minmax-text"
                style="font-size: ${size * 0.06}px; fill: #94A3B8;"
              >
                ${this.config.max}
              </text>
            </svg>

            <!-- Threshold legend (optional) -->
            ${showThresholdLabels ? `
              <div class="gauge-legend" style="display: flex; gap: 12px; margin-top: 8px; font-size: 11px;">
                ${thresholds.map(t => `
                  <div style="display: flex; align-items: center; gap: 4px;">
                    <span style="width: 8px; height: 8px; background: ${t.color}; border-radius: 50%;"></span>
                    <span style="color: #64748B;">${t.label || ''}</span>
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>
        </div>
        <div class="component-footer">
          <span>${this.formatValue(value)} of ${this.config.max}</span>
        </div>
      </div>

      ${animate ? `
        <style>
          @keyframes gauge-fill-${this.id} {
            to {
              stroke-dashoffset: 0;
            }
          }
        </style>
      ` : ''}
    `;
  }

  /**
   * Render HTML (alias for generateHTML)
   * @returns {string}
   */
  render() {
    return this.generateHTML();
  }

  /**
   * Generate component-specific CSS
   * @returns {string}
   */
  generateCSS() {
    return `
${super.generateCSS()}

      .gauge-component {
        text-align: center;
      }

      .gauge-component .component-body {
        display: flex;
        justify-content: center;
        padding: 16px;
      }

      .gauge-container svg {
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
      }

      .gauge-value-text {
        font-family: var(--font-mono, 'JetBrains Mono', monospace);
      }

      .gauge-label-text {
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .gauge-legend {
        flex-wrap: wrap;
        justify-content: center;
      }
    `;
  }

  /**
   * Generate JavaScript for this gauge
   * @returns {string}
   */
  generateJS() {
    const value = this.data?.value || 0;
    return `
(function() {
  const componentId = '${this.id}';
  const config = ${JSON.stringify(this.config)};
  const container = document.getElementById('component-${this.id}');
  if (!container) return;

  const valueArc = document.getElementById('gauge-value-${this.id}');
  const valueText = container.querySelector('.gauge-value-text');
  const labelText = container.querySelector('.gauge-label-text');
  const footerText = container.querySelector('.component-footer span');
  const svgHeight = config.size * 0.65;
  const centerX = config.size / 2;
  const centerY = svgHeight * 0.75;
  const radius = (config.size - config.arcWidth) / 2;
  const totalAngle = config.endAngle - config.startAngle;

  let currentValue = ${value};

  function getPercentage(val) {
    const clamped = Math.max(config.min, Math.min(config.max, val));
    return ((clamped - config.min) / (config.max - config.min)) * 100;
  }

  function getThreshold(val) {
    const thresholds = (config.thresholds || []).slice().sort((a, b) => a.value - b.value);
    for (const threshold of thresholds) {
      if (val <= threshold.value) return threshold;
    }
    return thresholds[thresholds.length - 1] || null;
  }

  function formatValue(val) {
    switch (config.valueFormat) {
      case 'percent':
        return Math.round(val) + '%';
      case 'currency':
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0
        }).format(val);
      default:
        if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
        if (val >= 1000) return (val / 1000).toFixed(1) + 'K';
        return Math.round(val).toString();
    }
  }

  function generateArcPath(startAngle, endAngle, r, cx, cy) {
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;
    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return 'M ' + x1 + ' ' + y1 + ' A ' + r + ' ' + r + ' 0 ' + largeArc + ' 1 ' + x2 + ' ' + y2;
  }

  function updateGauge(val) {
    if (val === null || val === undefined) val = 0;
    currentValue = val;
    const percentage = getPercentage(val);
    const threshold = getThreshold(val);
    const color = (threshold && threshold.color) || '#22C55E';
    const valueAngle = config.startAngle + (totalAngle * percentage) / 100;

    if (valueArc) {
      valueArc.setAttribute('d', generateArcPath(config.startAngle, valueAngle, radius, centerX, centerY));
      valueArc.setAttribute('stroke', color);
    }
    if (valueText) {
      valueText.textContent = formatValue(val);
      valueText.setAttribute('fill', color);
    }
    if (labelText && threshold && threshold.label) {
      labelText.textContent = threshold.label;
    }
    if (footerText) {
      footerText.textContent = percentage.toFixed(0) + '% of ' + config.max;
    }
  }

  updateGauge(currentValue);

  window.VIZ_GAUGES = window.VIZ_GAUGES || {};
  window.VIZ_GAUGES[componentId] = {
    setValue: updateGauge,
    getValue: function() { return currentValue; }
  };

  window.VIZ_COMPONENTS = window.VIZ_COMPONENTS || {};
  window.VIZ_COMPONENTS[componentId] = {
    type: 'gauge',
    setData: function(data) {
      const val = typeof data === 'number' ? data : (data && data.value);
      updateGauge(val || 0);
    },
    getData: function() {
      return { value: currentValue };
    }
  };
})();
`;
  }

  /**
   * Serialize component for state management
   * @returns {Object}
   */
  serialize() {
    return {
      ...super.serialize(),
      value: this.data?.value,
      percentage: this.data?.percentage,
      threshold: this.data?.threshold
    };
  }

  /**
   * Validate component configuration
   * @returns {{valid: boolean, errors: Array<string>}}
   */
  validate() {
    const errors = [];

    if (this.config.min >= this.config.max) {
      errors.push('min must be less than max');
    }

    if (!this.config.thresholds || this.config.thresholds.length === 0) {
      errors.push('At least one threshold is required');
    }

    for (const threshold of this.config.thresholds || []) {
      if (typeof threshold.value !== 'number') {
        errors.push('Each threshold must have a numeric value');
      }
      if (!threshold.color) {
        errors.push('Each threshold must have a color');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = GaugeComponent;
