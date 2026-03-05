/**
 * Number Input Component
 *
 * Interactive number input with currency, percent, and number formatting.
 * Supports increment/decrement buttons, validation, and real-time updates.
 *
 * @module web-viz/components/NumberInputComponent
 * @version 1.0.0
 */

const BaseComponent = require('./BaseComponent');

class NumberInputComponent extends BaseComponent {
  /**
   * Create a number input component
   * @param {Object} options - Input options
   */
  constructor(options = {}) {
    super('number-input', options);

    this.config = {
      min: options.config?.min ?? null,
      max: options.config?.max ?? null,
      step: options.config?.step ?? 1,
      defaultValue: options.config?.defaultValue ?? 0,
      format: options.config?.format || 'number', // 'number', 'currency', 'percent'
      currency: options.config?.currency || 'USD',
      locale: options.config?.locale || 'en-US',
      decimals: options.config?.decimals ?? 2,
      prefix: options.config?.prefix || '',
      suffix: options.config?.suffix || '',
      label: options.config?.label || options.title || '',
      placeholder: options.config?.placeholder || '',
      showButtons: options.config?.showButtons ?? true,
      buttonStep: options.config?.buttonStep || options.config?.step || 1,
      allowNegative: options.config?.allowNegative ?? false,
      required: options.config?.required ?? false,
      disabled: options.config?.disabled ?? false,
      onChange: options.config?.onChange || null,
      onValidate: options.config?.onValidate || null,
      helpText: options.config?.helpText || '',
      errorMessage: options.config?.errorMessage || '',
      size: options.config?.size || 'medium', // 'small', 'medium', 'large'
      ...options.config
    };

    // Current value state
    this.data = {
      value: this.config.defaultValue,
      isValid: true,
      errorMessage: ''
    };
  }

  /**
   * Set the current value
   * @param {number} value
   * @returns {NumberInputComponent}
   */
  setValue(value) {
    let clampedValue = value;

    if (this.config.min !== null && value < this.config.min) {
      clampedValue = this.config.min;
    }
    if (this.config.max !== null && value > this.config.max) {
      clampedValue = this.config.max;
    }

    this.data = {
      ...this.data,
      value: clampedValue,
      isValid: true,
      errorMessage: ''
    };
    this.updated = new Date().toISOString();
    return this;
  }

  /**
   * Get formatted value string
   * @param {number} value
   * @returns {string}
   */
  formatValue(value) {
    if (value === null || value === undefined || isNaN(value)) {
      return '';
    }

    let formatted;

    switch (this.config.format) {
      case 'currency':
        formatted = new Intl.NumberFormat(this.config.locale, {
          style: 'currency',
          currency: this.config.currency,
          minimumFractionDigits: this.config.decimals,
          maximumFractionDigits: this.config.decimals
        }).format(value);
        break;
      case 'percent':
        formatted = new Intl.NumberFormat(this.config.locale, {
          style: 'percent',
          minimumFractionDigits: this.config.decimals,
          maximumFractionDigits: this.config.decimals
        }).format(value / 100);
        break;
      default:
        formatted = new Intl.NumberFormat(this.config.locale, {
          minimumFractionDigits: 0,
          maximumFractionDigits: this.config.decimals
        }).format(value);
    }

    return `${this.config.prefix}${formatted}${this.config.suffix}`;
  }

  /**
   * Parse a formatted string back to number
   * @param {string} str
   * @returns {number}
   */
  parseValue(str) {
    if (!str) return 0;

    // Remove formatting characters
    let cleaned = str
      .replace(/[^0-9.-]/g, '')
      .replace(/,/g, '');

    // Handle percent input
    if (this.config.format === 'percent') {
      // If user types 50, they mean 50%
      cleaned = cleaned.replace(/%/g, '');
    }

    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }

  /**
   * Generate HTML for this input
   * @returns {string}
   */
  generateHTML() {
    const sizeClass = `size-${this.config.size}`;
    const hasError = !this.data.isValid && this.data.errorMessage;

    return `
<div class="viz-component viz-number-input component-${this.id} ${sizeClass} ${hasError ? 'has-error' : ''}"
     data-component-id="${this.id}"
     data-component-type="number-input">
  <div class="component-header">
    ${this.config.label ? `
    <label class="input-label" for="${this.id}-input">
      ${this._escapeHtml(this.config.label)}
      ${this.config.required ? '<span class="required-indicator">*</span>' : ''}
    </label>
    ` : ''}
    ${this.description ? `<p class="component-description">${this._escapeHtml(this.description)}</p>` : ''}
  </div>

  <div class="component-content">
    <div class="input-wrapper">
      ${this.config.showButtons ? `
      <button type="button"
              class="input-btn decrement-btn"
              id="${this.id}-decrement"
              ${this.config.disabled ? 'disabled' : ''}
              aria-label="Decrease value">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M3 8h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
      ` : ''}

      <div class="input-field-wrapper">
        ${this.config.format === 'currency' ? `<span class="input-prefix">$</span>` : ''}
        <input type="text"
               inputmode="decimal"
               id="${this.id}-input"
               class="input-field"
               value="${this.formatValue(this.data.value)}"
               placeholder="${this._escapeHtml(this.config.placeholder)}"
               ${this.config.disabled ? 'disabled' : ''}
               ${this.config.required ? 'required' : ''}
               aria-describedby="${this.id}-help ${this.id}-error"
        />
        ${this.config.format === 'percent' ? `<span class="input-suffix">%</span>` : ''}
      </div>

      ${this.config.showButtons ? `
      <button type="button"
              class="input-btn increment-btn"
              id="${this.id}-increment"
              ${this.config.disabled ? 'disabled' : ''}
              aria-label="Increase value">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
      ` : ''}
    </div>

    ${this.config.helpText ? `
    <p class="input-help" id="${this.id}-help">${this._escapeHtml(this.config.helpText)}</p>
    ` : ''}

    <p class="input-error" id="${this.id}-error" role="alert">
      ${hasError ? this._escapeHtml(this.data.errorMessage) : ''}
    </p>
  </div>
</div>`;
  }

  /**
   * Generate CSS for this input
   * @returns {string}
   */
  generateCSS() {
    return `
${super.generateCSS()}

.component-${this.id} .input-label {
  font-weight: 600;
  font-size: 14px;
  color: var(--color-text);
  display: block;
  margin-bottom: var(--spacing-sm);
}

.component-${this.id} .required-indicator {
  color: var(--color-danger, #EF4444);
  margin-left: 4px;
}

.component-${this.id} .input-wrapper {
  display: flex;
  align-items: stretch;
  gap: 0;
  border: 1px solid var(--color-border, #E5E7EB);
  border-radius: var(--radius-md);
  overflow: hidden;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.component-${this.id} .input-wrapper:focus-within {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.component-${this.id}.has-error .input-wrapper {
  border-color: var(--color-danger, #EF4444);
}

.component-${this.id} .input-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  background: var(--color-surface);
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.component-${this.id} .input-btn:hover:not(:disabled) {
  background: var(--color-surface-hover, #F3F4F6);
  color: var(--color-text);
}

.component-${this.id} .input-btn:active:not(:disabled) {
  background: var(--color-surface-active, #E5E7EB);
}

.component-${this.id} .input-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.component-${this.id} .decrement-btn {
  border-right: 1px solid var(--color-border, #E5E7EB);
}

.component-${this.id} .increment-btn {
  border-left: 1px solid var(--color-border, #E5E7EB);
}

.component-${this.id} .input-field-wrapper {
  display: flex;
  align-items: center;
  flex: 1;
  padding: 0 var(--spacing-sm);
  background: white;
}

.component-${this.id} .input-prefix,
.component-${this.id} .input-suffix {
  color: var(--color-text-muted);
  font-size: 14px;
  flex-shrink: 0;
}

.component-${this.id} .input-prefix {
  margin-right: var(--spacing-xs);
}

.component-${this.id} .input-suffix {
  margin-left: var(--spacing-xs);
}

.component-${this.id} .input-field {
  flex: 1;
  border: none;
  outline: none;
  font-size: 16px;
  font-weight: 500;
  color: var(--color-text);
  background: transparent;
  text-align: center;
  min-width: 0;
}

.component-${this.id} .input-field::placeholder {
  color: var(--color-text-muted);
  font-weight: 400;
}

.component-${this.id} .input-field:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Size variants */
.component-${this.id}.size-small .input-wrapper {
  height: 32px;
}

.component-${this.id}.size-small .input-btn {
  width: 32px;
}

.component-${this.id}.size-small .input-field {
  font-size: 14px;
}

.component-${this.id}.size-medium .input-wrapper {
  height: 40px;
}

.component-${this.id}.size-large .input-wrapper {
  height: 48px;
}

.component-${this.id}.size-large .input-btn {
  width: 48px;
}

.component-${this.id}.size-large .input-field {
  font-size: 18px;
}

.component-${this.id} .input-help {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-top: var(--spacing-xs);
  margin-bottom: 0;
}

.component-${this.id} .input-error {
  font-size: 12px;
  color: var(--color-danger, #EF4444);
  margin-top: var(--spacing-xs);
  margin-bottom: 0;
  min-height: 18px;
}
`;
  }

  /**
   * Generate JavaScript for this input
   * @returns {string}
   */
  generateJS() {
    const onChange = this.config.onChange;
    const onValidate = this.config.onValidate;

    return `
(function() {
  const inputId = '${this.id}';
  const input = document.getElementById(inputId + '-input');
  const decrementBtn = document.getElementById(inputId + '-decrement');
  const incrementBtn = document.getElementById(inputId + '-increment');
  const errorEl = document.getElementById(inputId + '-error');
  const wrapper = document.querySelector('.component-' + inputId);

  if (!input) return;

  const config = {
    min: ${this.config.min === null ? 'null' : this.config.min},
    max: ${this.config.max === null ? 'null' : this.config.max},
    step: ${this.config.step},
    buttonStep: ${this.config.buttonStep},
    format: '${this.config.format}',
    currency: '${this.config.currency}',
    locale: '${this.config.locale}',
    decimals: ${this.config.decimals},
    allowNegative: ${this.config.allowNegative}
  };

  let currentValue = ${this.data.value};

  function parseValue(str) {
    if (!str) return 0;
    const cleaned = str.replace(/[^0-9.-]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }

  function formatValue(value) {
    if (value === null || value === undefined || isNaN(value)) return '';

    switch (config.format) {
      case 'currency':
        return new Intl.NumberFormat(config.locale, {
          minimumFractionDigits: config.decimals,
          maximumFractionDigits: config.decimals
        }).format(value);
      case 'percent':
        return value.toFixed(config.decimals);
      default:
        return new Intl.NumberFormat(config.locale, {
          minimumFractionDigits: 0,
          maximumFractionDigits: config.decimals
        }).format(value);
    }
  }

  function clampValue(value) {
    if (!config.allowNegative && value < 0) value = 0;
    if (config.min !== null && value < config.min) value = config.min;
    if (config.max !== null && value > config.max) value = config.max;
    return value;
  }

  function validate(value) {
    let valid = true;
    let error = '';

    if (config.min !== null && value < config.min) {
      valid = false;
      error = 'Value must be at least ' + formatValue(config.min);
    } else if (config.max !== null && value > config.max) {
      valid = false;
      error = 'Value must be at most ' + formatValue(config.max);
    }

    ${onValidate ? `
    if (valid && typeof window['${onValidate}'] === 'function') {
      const customResult = window['${onValidate}'](value, inputId);
      if (customResult && !customResult.valid) {
        valid = false;
        error = customResult.message || 'Invalid value';
      }
    }
    ` : ''}

    return { valid, error };
  }

  function updateValue(newValue, skipFormat = false) {
    currentValue = clampValue(newValue);

    if (!skipFormat) {
      input.value = formatValue(currentValue);
    }

    const validation = validate(currentValue);

    if (validation.valid) {
      wrapper.classList.remove('has-error');
      errorEl.textContent = '';
    } else {
      wrapper.classList.add('has-error');
      errorEl.textContent = validation.error;
    }

    // Update button states
    if (decrementBtn) {
      decrementBtn.disabled = config.min !== null && currentValue <= config.min;
    }
    if (incrementBtn) {
      incrementBtn.disabled = config.max !== null && currentValue >= config.max;
    }

    // Emit change event
    const event = new CustomEvent('number-input-change', {
      detail: { componentId: inputId, value: currentValue, valid: validation.valid },
      bubbles: true
    });
    input.dispatchEvent(event);

    ${onChange ? `
    if (typeof window['${onChange}'] === 'function') {
      window['${onChange}'](currentValue, inputId, validation.valid);
    }
    ` : ''}
  }

  // Input event - parse on blur, allow free typing during input
  input.addEventListener('input', function(e) {
    // During typing, just track the raw value
  });

  input.addEventListener('blur', function(e) {
    const value = parseValue(e.target.value);
    updateValue(value);
  });

  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      const value = parseValue(e.target.value);
      updateValue(value);
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      updateValue(currentValue + config.step);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      updateValue(currentValue - config.step);
    }
  });

  // Button handlers
  if (decrementBtn) {
    decrementBtn.addEventListener('click', function() {
      updateValue(currentValue - config.buttonStep);
    });
  }

  if (incrementBtn) {
    incrementBtn.addEventListener('click', function() {
      updateValue(currentValue + config.buttonStep);
    });
  }

  // Initial format
  input.value = formatValue(currentValue);

  // Store reference
  window.VIZ_NUMBER_INPUTS = window.VIZ_NUMBER_INPUTS || {};
  window.VIZ_NUMBER_INPUTS[inputId] = {
    getValue: () => currentValue,
    setValue: (val) => updateValue(val),
    getFormatted: () => formatValue(currentValue),
    validate: () => validate(currentValue)
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
   * Validate input is ready to render
   * @returns {Object}
   */
  validate() {
    const base = super.validate();

    // Number input doesn't require data like other components
    base.errors = base.errors.filter(e => !e.includes('data is required'));

    if (this.config.min !== null && this.config.max !== null && this.config.min >= this.config.max) {
      base.errors.push('Number input min must be less than max');
      base.valid = false;
    }

    if (this.config.step <= 0) {
      base.errors.push('Number input step must be positive');
      base.valid = false;
    }

    return base;
  }

  /**
   * Create from serialized state
   * @param {Object} json
   * @returns {NumberInputComponent}
   */
  static deserialize(json) {
    const component = new NumberInputComponent({
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

module.exports = NumberInputComponent;
