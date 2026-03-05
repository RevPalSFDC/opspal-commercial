/**
 * KPI Card Component
 *
 * Single metric display with optional trend indicator and comparison.
 *
 * @module web-viz/components/KPICardComponent
 * @version 1.0.0
 */

const BaseComponent = require('./BaseComponent');

// Load defaults
let defaults;
try {
  defaults = require('../../../config/web-viz-defaults.json');
} catch {
  defaults = { kpi: {}, theme: {} };
}

class KPICardComponent extends BaseComponent {
  /**
   * Create a KPI card component
   * @param {Object} options - KPI options
   */
  constructor(options = {}) {
    super('kpi', options);

    // Default to smaller grid span for KPI cards
    if (!options.position?.colspan) {
      this.position.colspan = 3;
    }

    // KPI-specific configuration
    this.config = {
      format: options.config?.format || 'number', // number, currency, percent, custom
      showTrend: options.config?.showTrend !== false,
      trendField: options.config?.trendField || 'trend',
      valueField: options.config?.valueField || 'value',
      targetField: options.config?.targetField || 'target',
      prefix: options.config?.prefix || '',
      suffix: options.config?.suffix || '',
      decimals: options.config?.decimals ?? 0,
      currency: options.config?.currency || 'USD',
      icon: options.config?.icon || null,
      color: options.config?.color || null,
      ...options.config
    };
  }

  /**
   * Format types
   */
  static FORMAT_TYPES = ['number', 'currency', 'percent', 'custom'];

  /**
   * Set KPI data
   * @param {Object} data - KPI data { value, trend, target, ... }
   * @param {Object} metadata - Data source metadata
   * @returns {KPICardComponent}
   */
  setData(data, metadata = {}) {
    // Handle single value
    if (typeof data === 'number') {
      this.data = { value: data };
    } else if (typeof data === 'object') {
      this.data = data;
    } else {
      throw new Error('KPI data must be a number or object');
    }

    return super.setData(this.data, metadata);
  }

  /**
   * Get the main KPI value
   * @returns {number|null}
   */
  getValue() {
    if (!this.data) return null;
    return this.data[this.config.valueField] ?? this.data.value ?? null;
  }

  /**
   * Get the trend value
   * @returns {number|null}
   */
  getTrend() {
    if (!this.data || !this.config.showTrend) return null;
    return this.data[this.config.trendField] ?? this.data.trend ?? null;
  }

  /**
   * Get the target value
   * @returns {number|null}
   */
  getTarget() {
    if (!this.data) return null;
    return this.data[this.config.targetField] ?? this.data.target ?? null;
  }

  /**
   * Format the main value
   * @returns {string}
   */
  formatValue() {
    const value = this.getValue();
    if (value === null || value === undefined) return '-';

    let formatted;
    switch (this.config.format) {
      case 'currency':
        formatted = this._formatCurrency(value);
        break;
      case 'percent':
        formatted = this._formatPercent(value);
        break;
      case 'custom':
        formatted = this.config.prefix + this._formatNumber(value) + this.config.suffix;
        break;
      default:
        formatted = this._formatNumber(value);
    }

    return formatted;
  }

  /**
   * Format as currency
   * @private
   */
  _formatCurrency(value) {
    const num = parseFloat(value);
    if (isNaN(num)) return value;

    // Skip abbreviation if noAbbreviate is true
    if (!this.config.noAbbreviate) {
      // Abbreviate large numbers
      if (Math.abs(num) >= 1e9) {
        return '$' + (num / 1e9).toFixed(1) + 'B';
      }
      if (Math.abs(num) >= 1e6) {
        return '$' + (num / 1e6).toFixed(1) + 'M';
      }
      if (Math.abs(num) >= 1e3) {
        return '$' + (num / 1e3).toFixed(1) + 'K';
      }
    }

    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: this.config.currency || 'USD',
      minimumFractionDigits: this.config.decimals || 0,
      maximumFractionDigits: this.config.decimals || 0
    }).format(num);
  }

  /**
   * Format as percentage
   * @private
   */
  _formatPercent(value) {
    const num = parseFloat(value);
    if (isNaN(num)) return value;
    return num.toFixed(this.config.decimals || 1) + '%';
  }

  /**
   * Format number with abbreviations
   * @private
   */
  _formatNumber(value) {
    const num = parseFloat(value);
    if (isNaN(num)) return value;

    // Skip abbreviation if noAbbreviate is true
    if (!this.config.noAbbreviate) {
      if (Math.abs(num) >= 1e9) {
        return (num / 1e9).toFixed(1) + 'B';
      }
      if (Math.abs(num) >= 1e6) {
        return (num / 1e6).toFixed(1) + 'M';
      }
      if (Math.abs(num) >= 1e3) {
        return (num / 1e3).toFixed(1) + 'K';
      }
    }

    return num.toLocaleString(undefined, {
      minimumFractionDigits: this.config.decimals || 0,
      maximumFractionDigits: this.config.decimals || 0
    });
  }

  /**
   * Get trend status
   * @returns {Object} { direction, class, icon }
   */
  getTrendStatus() {
    const trend = this.getTrend();
    if (trend === null || trend === undefined) {
      return { direction: 'neutral', class: 'neutral', icon: '—' };
    }

    if (trend > 0) {
      return { direction: 'up', class: 'positive', icon: '↑' };
    } else if (trend < 0) {
      return { direction: 'down', class: 'negative', icon: '↓' };
    }
    return { direction: 'flat', class: 'neutral', icon: '→' };
  }

  /**
   * Get color based on value or config
   * @returns {string}
   */
  getColor() {
    if (this.config.color) return this.config.color;

    const target = this.getTarget();
    const value = this.getValue();
    const colors = defaults.theme?.colors || {};

    if (target !== null && value !== null) {
      const ratio = value / target;
      if (ratio >= 1) return colors.success || '#22C55E';
      if (ratio >= 0.8) return colors.warning || '#F59E0B';
      return colors.danger || '#EF4444';
    }

    return colors.primary || '#5F3B8C';
  }

  /**
   * Generate HTML for this KPI card
   * @returns {string}
   */
  generateHTML() {
    const validation = this.validate();
    if (!validation.valid) {
      return `<div class="component-error">KPI Error: ${validation.errors.join(', ')}</div>`;
    }

    const value = this.formatValue();
    const trend = this.getTrend();
    const trendStatus = this.getTrendStatus();
    const target = this.getTarget();
    const color = this.getColor();

    return `
<div class="viz-component viz-kpi component-${this.id}" data-component-id="${this.id}" data-component-type="kpi" style="--kpi-color: ${color}">
  <div class="component-header">
    <h3 class="component-title">${this._escapeHtml(this.title)}</h3>
    ${this.description ? `<p class="component-description">${this._escapeHtml(this.description)}</p>` : ''}
  </div>
  <div class="component-content kpi-content">
    ${this.config.icon ? `<div class="kpi-icon">${this.config.icon}</div>` : ''}
    <div class="kpi-value" style="color: ${color}">${value}</div>
    ${this.config.showTrend && trend !== null ? `
    <div class="kpi-trend ${trendStatus.class}">
      <span class="trend-icon">${trendStatus.icon}</span>
      <span class="trend-value">${Math.abs(trend).toFixed(1)}%</span>
      <span class="trend-label">${this.config.trendLabel || 'vs prior'}</span>
    </div>
    ` : ''}
    ${target !== null ? `
    <div class="kpi-target">
      <span class="target-label">Target:</span>
      <span class="target-value">${this._formatNumber(target)}</span>
    </div>
    ` : ''}
  </div>
</div>`;
  }

  /**
   * Generate CSS for this KPI card
   * @returns {string}
   */
  generateCSS() {
    return `
${super.generateCSS()}

.component-${this.id} .kpi-content {
  min-height: auto;
  padding: var(--spacing-sm) 0;
}

.component-${this.id} .kpi-icon {
  font-size: 24px;
  margin-bottom: var(--spacing-sm);
  opacity: 0.8;
}

.component-${this.id} .kpi-value {
  font-family: var(--font-heading);
  font-size: 32px;
  font-weight: 700;
  line-height: 1.2;
  color: var(--kpi-color, var(--color-primary));
}

.component-${this.id} .kpi-trend {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  margin-top: var(--spacing-sm);
  font-size: 13px;
  font-weight: 500;
}

.component-${this.id} .kpi-trend.positive {
  color: var(--color-success);
}

.component-${this.id} .kpi-trend.negative {
  color: var(--color-danger);
}

.component-${this.id} .kpi-trend.neutral {
  color: var(--color-text-muted);
}

.component-${this.id} .trend-icon {
  font-size: 14px;
}

.component-${this.id} .trend-label {
  color: var(--color-text-muted);
  font-weight: 400;
}

.component-${this.id} .kpi-target {
  margin-top: var(--spacing-sm);
  font-size: 12px;
  color: var(--color-text-muted);
}

.component-${this.id} .target-value {
  font-weight: 500;
  color: var(--color-text);
}
`;
  }

  /**
   * Generate JavaScript for this KPI card (minimal - mostly static)
   * @returns {string}
   */
  generateJS() {
    return `
(function() {
  // Store reference for updates
  window.VIZ_KPIS = window.VIZ_KPIS || {};
  window.VIZ_KPIS['${this.id}'] = {
    data: ${JSON.stringify(this.data)},
    config: ${JSON.stringify(this.config)},
    update: function(newData) {
      // Update KPI value dynamically
      const el = document.querySelector('[data-component-id="${this.id}"]');
      if (!el) return;

      const data = typeof newData === 'number' ? { value: newData } : (newData || {});
      const valueEl = el.querySelector('.kpi-value');
      const trendEl = el.querySelector('.kpi-trend');
      const trendValueEl = el.querySelector('.trend-value');
      const trendLabelEl = el.querySelector('.trend-label');
      const targetEl = el.querySelector('.target-value');

      if (valueEl && data.value !== undefined) {
        valueEl.textContent = this.formatValue(data.value);
        const color = this.getColor(data.value, data.target);
        valueEl.style.color = color;
        el.style.setProperty('--kpi-color', color);
      }

      if (trendEl && data.trend !== undefined) {
        const status = this.getTrendStatus(data.trend);
        trendEl.classList.remove('positive', 'negative', 'neutral');
        trendEl.classList.add(status.class);
        const trendIcon = trendEl.querySelector('.trend-icon');
        if (trendIcon) trendIcon.textContent = status.icon;
        if (trendValueEl) trendValueEl.textContent = Math.abs(data.trend).toFixed(1) + '%';
        if (trendLabelEl) trendLabelEl.textContent = this.config.trendLabel || 'vs prior';
      }

      if (targetEl && data.target !== undefined) {
        targetEl.textContent = this.formatNumber(data.target);
      }
    },
    formatValue: function(value) {
      const config = this.config;
      if (config.format === 'currency') {
        return '$' + value.toLocaleString();
      }
      if (config.format === 'percent') {
        return value.toFixed(1) + '%';
      }
      return value.toLocaleString();
    },
    formatNumber: function(value) {
      return value.toLocaleString();
    },
    getTrendStatus: function(trend) {
      if (trend > 0) return { class: 'positive', icon: '↑' };
      if (trend < 0) return { class: 'negative', icon: '↓' };
      return { class: 'neutral', icon: '→' };
    },
    getColor: function(value, target) {
      if (this.config.color) return this.config.color;
      if (target !== null && target !== undefined && value !== null && value !== undefined) {
        const ratio = value / target;
        if (ratio >= 1) return '#22C55E';
        if (ratio >= 0.8) return '#F59E0B';
        return '#EF4444';
      }
      return '#5F3B8C';
    }
  };

  window.VIZ_COMPONENTS = window.VIZ_COMPONENTS || {};
  window.VIZ_COMPONENTS['${this.id}'] = {
    type: 'kpi',
    setData: function(newData) {
      window.VIZ_KPIS['${this.id}'].update(newData);
    },
    getData: function() {
      return window.VIZ_KPIS['${this.id}'].data;
    }
  };
})();
`;
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
   * Validate KPI is ready to render
   * @returns {Object}
   */
  validate() {
    const base = super.validate();

    if (this.data && typeof this.data !== 'object') {
      base.errors.push('KPI data must be an object');
      base.valid = false;
    }

    if (!KPICardComponent.FORMAT_TYPES.includes(this.config.format)) {
      base.errors.push(`Unsupported format: ${this.config.format}`);
      base.valid = false;
    }

    return base;
  }

  /**
   * Create from serialized state
   * @param {Object} json - Serialized KPI
   * @returns {KPICardComponent}
   */
  static deserialize(json) {
    const component = new KPICardComponent({
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

module.exports = KPICardComponent;
