/**
 * Slider Component
 *
 * Interactive range slider for numeric input with real-time updates.
 * Supports currency, percent, and number formatting.
 *
 * @module web-viz/components/SliderComponent
 * @version 1.0.0
 */

const BaseComponent = require('./BaseComponent');

class SliderComponent extends BaseComponent {
  /**
   * Create a slider component
   * @param {Object} options - Slider options
   */
  constructor(options = {}) {
    super('slider', options);

    this.config = {
      min: options.config?.min ?? 0,
      max: options.config?.max ?? 100,
      step: options.config?.step ?? 1,
      defaultValue: options.config?.defaultValue ?? 50,
      format: options.config?.format || 'number', // 'number', 'currency', 'percent'
      prefix: options.config?.prefix || '',
      suffix: options.config?.suffix || '',
      showTicks: options.config?.showTicks ?? false,
      tickInterval: options.config?.tickInterval || 10,
      showMinMax: options.config?.showMinMax ?? true,
      showCurrentValue: options.config?.showCurrentValue ?? true,
      label: options.config?.label || options.title || '',
      onChange: options.config?.onChange || null, // Callback function name
      disabled: options.config?.disabled ?? false,
      ...options.config
    };

    // Current value state
    this.data = {
      value: this.config.defaultValue
    };
  }

  /**
   * Set the current value
   * @param {number} value
   * @returns {SliderComponent}
   */
  setValue(value) {
    const clampedValue = Math.max(this.config.min, Math.min(this.config.max, value));
    this.data = { value: clampedValue };
    this.updated = new Date().toISOString();
    return this;
  }

  /**
   * Get formatted value string
   * @param {number} value
   * @returns {string}
   */
  formatValue(value) {
    let formatted;

    switch (this.config.format) {
      case 'currency':
        formatted = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0
        }).format(value);
        break;
      case 'percent':
        formatted = `${value}%`;
        break;
      default:
        formatted = value.toLocaleString();
    }

    return `${this.config.prefix}${formatted}${this.config.suffix}`;
  }

  /**
   * Generate HTML for this slider
   * @returns {string}
   */
  generateHTML() {
    const ticksHtml = this.config.showTicks ? this._generateTicks() : '';

    return `
<div class="viz-component viz-slider component-${this.id}" data-component-id="${this.id}" data-component-type="slider">
  <div class="component-header">
    ${this.config.label ? `<label class="slider-label" for="${this.id}-input">${this._escapeHtml(this.config.label)}</label>` : ''}
    ${this.description ? `<p class="component-description">${this._escapeHtml(this.description)}</p>` : ''}
  </div>

  <div class="component-content">
    <div class="slider-container">
      ${this.config.showMinMax ? `<span class="slider-min">${this.formatValue(this.config.min)}</span>` : ''}

      <div class="slider-track-wrapper">
        <input type="range"
               id="${this.id}-input"
               class="slider-input"
               min="${this.config.min}"
               max="${this.config.max}"
               step="${this.config.step}"
               value="${this.data.value}"
               ${this.config.disabled ? 'disabled' : ''}
        />
        ${ticksHtml}
      </div>

      ${this.config.showMinMax ? `<span class="slider-max">${this.formatValue(this.config.max)}</span>` : ''}
    </div>

    ${this.config.showCurrentValue ? `
    <div class="slider-value-display">
      <span id="${this.id}-value" class="slider-value">${this.formatValue(this.data.value)}</span>
    </div>
    ` : ''}
  </div>
</div>`;
  }

  /**
   * Generate tick marks HTML
   * @private
   */
  _generateTicks() {
    const ticks = [];
    const interval = this.config.tickInterval;
    const min = this.config.min;
    const max = this.config.max;

    for (let val = min; val <= max; val += interval) {
      const percent = ((val - min) / (max - min)) * 100;
      ticks.push(`<div class="slider-tick" style="left: ${percent}%"></div>`);
    }

    return `<div class="slider-ticks">${ticks.join('')}</div>`;
  }

  /**
   * Generate CSS for this slider
   * @returns {string}
   */
  generateCSS() {
    return `
${super.generateCSS()}

.component-${this.id} .slider-container {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-sm) 0;
}

.component-${this.id} .slider-label {
  font-weight: 600;
  font-size: 14px;
  color: var(--color-text);
  display: block;
  margin-bottom: var(--spacing-sm);
}

.component-${this.id} .slider-track-wrapper {
  flex: 1;
  position: relative;
}

.component-${this.id} .slider-input {
  width: 100%;
  height: 8px;
  -webkit-appearance: none;
  appearance: none;
  background: linear-gradient(to right, var(--color-primary) 0%, var(--color-primary) var(--slider-progress, 50%), var(--color-surface) var(--slider-progress, 50%), var(--color-surface) 100%);
  border-radius: var(--radius-sm);
  outline: none;
  cursor: pointer;
}

.component-${this.id} .slider-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.component-${this.id} .slider-input::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--color-primary);
  cursor: pointer;
  border: 2px solid white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  transition: transform 0.15s ease;
}

.component-${this.id} .slider-input::-webkit-slider-thumb:hover {
  transform: scale(1.1);
}

.component-${this.id} .slider-input::-moz-range-thumb {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--color-primary);
  cursor: pointer;
  border: 2px solid white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.component-${this.id} .slider-min,
.component-${this.id} .slider-max {
  font-size: 12px;
  color: var(--color-text-muted);
  min-width: 50px;
  text-align: center;
}

.component-${this.id} .slider-ticks {
  position: absolute;
  width: 100%;
  height: 8px;
  top: 100%;
  pointer-events: none;
}

.component-${this.id} .slider-tick {
  position: absolute;
  width: 2px;
  height: 6px;
  background: var(--color-text-muted);
  transform: translateX(-50%);
  margin-top: 4px;
}

.component-${this.id} .slider-value-display {
  text-align: center;
  margin-top: var(--spacing-md);
}

.component-${this.id} .slider-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-primary);
}
`;
  }

  /**
   * Generate JavaScript for this slider
   * @returns {string}
   */
  generateJS() {
    const format = this.config.format;
    const prefix = this.config.prefix;
    const suffix = this.config.suffix;
    const onChange = this.config.onChange;

    return `
(function() {
  const sliderId = '${this.id}';
  const slider = document.getElementById(sliderId + '-input');
  const valueDisplay = document.getElementById(sliderId + '-value');
  if (!slider) return;

  const min = ${this.config.min};
  const max = ${this.config.max};
  const format = '${format}';
  const prefix = '${prefix}';
  const suffix = '${suffix}';

  function formatValue(value) {
    let formatted;
    const num = parseFloat(value);

    switch (format) {
      case 'currency':
        formatted = '$' + num.toLocaleString();
        break;
      case 'percent':
        formatted = num + '%';
        break;
      default:
        formatted = num.toLocaleString();
    }

    return prefix + formatted + suffix;
  }

  function updateSlider(value) {
    const progress = ((value - min) / (max - min)) * 100;
    slider.style.setProperty('--slider-progress', progress + '%');

    if (valueDisplay) {
      valueDisplay.textContent = formatValue(value);
    }
  }

  // Initial update
  updateSlider(slider.value);

  // Handle input changes
  slider.addEventListener('input', function(e) {
    const value = parseFloat(e.target.value);
    updateSlider(value);

    // Emit custom event for other components to listen
    const event = new CustomEvent('slider-change', {
      detail: { componentId: sliderId, value: value },
      bubbles: true
    });
    slider.dispatchEvent(event);

    // Call registered callback if any
    ${onChange ? `if (typeof window['${onChange}'] === 'function') { window['${onChange}'](value, sliderId); }` : ''}
  });

  // Store reference
  window.VIZ_SLIDERS = window.VIZ_SLIDERS || {};
  window.VIZ_SLIDERS[sliderId] = {
    getValue: () => parseFloat(slider.value),
    setValue: (val) => {
      slider.value = val;
      updateSlider(val);
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
   * Validate slider is ready to render
   * @returns {Object}
   */
  validate() {
    const base = super.validate();

    // Slider doesn't require data like other components
    base.errors = base.errors.filter(e => !e.includes('data is required'));

    if (this.config.min >= this.config.max) {
      base.errors.push('Slider min must be less than max');
      base.valid = false;
    }

    if (this.config.step <= 0) {
      base.errors.push('Slider step must be positive');
      base.valid = false;
    }

    return base;
  }

  /**
   * Create from serialized state
   * @param {Object} json
   * @returns {SliderComponent}
   */
  static deserialize(json) {
    const component = new SliderComponent({
      id: json.id,
      title: json.title,
      description: json.description,
      position: json.position,
      config: json.config,
      filters: json.filters
    });
    component.data = json.data;
    component.created = json.created;
    component.updated = json.updated;
    return component;
  }
}

module.exports = SliderComponent;
