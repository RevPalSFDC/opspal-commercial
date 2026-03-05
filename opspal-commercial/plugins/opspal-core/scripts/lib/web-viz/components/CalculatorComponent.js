/**
 * Calculator Component
 *
 * Compound component combining multiple inputs with real-time calculated outputs.
 * Perfect for commission calculators, deal simulators, and what-if analysis.
 *
 * @module web-viz/components/CalculatorComponent
 * @version 1.0.0
 */

const BaseComponent = require('./BaseComponent');

class CalculatorComponent extends BaseComponent {
  /**
   * Create a calculator component
   * @param {Object} options - Calculator options
   */
  constructor(options = {}) {
    super('calculator', options);

    this.config = {
      inputs: options.config?.inputs || [], // Array of input definitions
      outputs: options.config?.outputs || [], // Array of output definitions
      calculate: options.config?.calculate || null, // Calculation function name
      calculateFormula: options.config?.calculateFormula || null, // Simple formula string
      layout: options.config?.layout || 'vertical', // 'vertical', 'horizontal', 'grid'
      columns: options.config?.columns || 2, // For grid layout
      showHeader: options.config?.showHeader ?? true,
      showDivider: options.config?.showDivider ?? true,
      autoCalculate: options.config?.autoCalculate ?? true,
      onChange: options.config?.onChange || null,
      label: options.config?.label || options.title || '',
      helpText: options.config?.helpText || '',
      theme: options.config?.theme || 'default', // 'default', 'compact', 'card'
      ...options.config
    };

    // Initialize data with default values from inputs
    this.data = {
      inputs: {},
      outputs: {}
    };

    // Set default input values
    for (const input of this.config.inputs) {
      this.data.inputs[input.id] = input.defaultValue ?? this._getDefaultForType(input.type);
    }

    // Initialize empty outputs
    for (const output of this.config.outputs) {
      this.data.outputs[output.id] = null;
    }
  }

  /**
   * Get default value for input type
   * @private
   */
  _getDefaultForType(type) {
    switch (type) {
      case 'number':
      case 'currency':
      case 'percent':
      case 'slider':
        return 0;
      case 'dropdown':
        return null;
      case 'date':
        return null;
      case 'checkbox':
        return false;
      default:
        return '';
    }
  }

  /**
   * Set input value
   * @param {string} inputId
   * @param {*} value
   * @returns {CalculatorComponent}
   */
  setInput(inputId, value) {
    this.data.inputs[inputId] = value;
    this.updated = new Date().toISOString();
    return this;
  }

  /**
   * Get input value
   * @param {string} inputId
   * @returns {*}
   */
  getInput(inputId) {
    return this.data.inputs[inputId];
  }

  /**
   * Set output value
   * @param {string} outputId
   * @param {*} value
   * @returns {CalculatorComponent}
   */
  setOutput(outputId, value) {
    this.data.outputs[outputId] = value;
    return this;
  }

  /**
   * Set all outputs
   * @param {Object} outputs
   * @returns {CalculatorComponent}
   */
  setOutputs(outputs) {
    this.data.outputs = { ...this.data.outputs, ...outputs };
    return this;
  }

  /**
   * Format value based on output type
   * @param {*} value
   * @param {Object} output - Output definition
   * @returns {string}
   */
  formatOutput(value, output) {
    if (value === null || value === undefined) {
      return output.placeholder || '-';
    }

    switch (output.format) {
      case 'currency':
        return new Intl.NumberFormat(output.locale || 'en-US', {
          style: 'currency',
          currency: output.currency || 'USD',
          minimumFractionDigits: output.decimals ?? 0,
          maximumFractionDigits: output.decimals ?? 0
        }).format(value);

      case 'percent':
        return new Intl.NumberFormat(output.locale || 'en-US', {
          style: 'percent',
          minimumFractionDigits: output.decimals ?? 1,
          maximumFractionDigits: output.decimals ?? 1
        }).format(value / 100);

      case 'number':
        return new Intl.NumberFormat(output.locale || 'en-US', {
          minimumFractionDigits: output.decimals ?? 0,
          maximumFractionDigits: output.decimals ?? 2
        }).format(value);

      case 'text':
      default:
        return String(value);
    }
  }

  /**
   * Generate HTML for an input field
   * @private
   */
  _generateInputHTML(input) {
    const inputId = `${this.id}-input-${input.id}`;
    const value = this.data.inputs[input.id];

    switch (input.type) {
      case 'number':
      case 'currency':
      case 'percent':
        return `
        <div class="calc-field" data-input-id="${input.id}">
          <label class="calc-label" for="${inputId}">${this._escapeHtml(input.label)}</label>
          <div class="calc-input-wrapper">
            ${input.type === 'currency' ? '<span class="input-prefix">$</span>' : ''}
            <input type="text"
                   inputmode="decimal"
                   id="${inputId}"
                   class="calc-input calc-input-${input.type}"
                   value="${value}"
                   placeholder="${input.placeholder || ''}"
                   ${input.disabled ? 'disabled' : ''}
            />
            ${input.type === 'percent' ? '<span class="input-suffix">%</span>' : ''}
          </div>
          ${input.helpText ? `<span class="calc-help">${this._escapeHtml(input.helpText)}</span>` : ''}
        </div>`;

      case 'slider':
        const min = input.min ?? 0;
        const max = input.max ?? 100;
        const step = input.step ?? 1;
        return `
        <div class="calc-field calc-field-slider" data-input-id="${input.id}">
          <div class="calc-slider-header">
            <label class="calc-label" for="${inputId}">${this._escapeHtml(input.label)}</label>
            <span class="calc-slider-value" id="${inputId}-value">${value}${input.suffix || ''}</span>
          </div>
          <input type="range"
                 id="${inputId}"
                 class="calc-input calc-slider"
                 min="${min}"
                 max="${max}"
                 step="${step}"
                 value="${value}"
                 ${input.disabled ? 'disabled' : ''}
          />
          <div class="calc-slider-range">
            <span>${min}${input.suffix || ''}</span>
            <span>${max}${input.suffix || ''}</span>
          </div>
        </div>`;

      case 'dropdown':
        const options = input.options || [];
        return `
        <div class="calc-field" data-input-id="${input.id}">
          <label class="calc-label" for="${inputId}">${this._escapeHtml(input.label)}</label>
          <select id="${inputId}" class="calc-input calc-select" ${input.disabled ? 'disabled' : ''}>
            ${input.placeholder ? `<option value="">${this._escapeHtml(input.placeholder)}</option>` : ''}
            ${options.map(opt => `
              <option value="${this._escapeHtml(opt.value)}" ${value === opt.value ? 'selected' : ''}>
                ${this._escapeHtml(opt.label)}
              </option>
            `).join('')}
          </select>
        </div>`;

      case 'checkbox':
        return `
        <div class="calc-field calc-field-checkbox" data-input-id="${input.id}">
          <label class="calc-checkbox-label">
            <input type="checkbox"
                   id="${inputId}"
                   class="calc-checkbox"
                   ${value ? 'checked' : ''}
                   ${input.disabled ? 'disabled' : ''}
            />
            <span class="calc-checkbox-text">${this._escapeHtml(input.label)}</span>
          </label>
        </div>`;

      default:
        return `
        <div class="calc-field" data-input-id="${input.id}">
          <label class="calc-label" for="${inputId}">${this._escapeHtml(input.label)}</label>
          <input type="text"
                 id="${inputId}"
                 class="calc-input"
                 value="${value}"
                 placeholder="${input.placeholder || ''}"
                 ${input.disabled ? 'disabled' : ''}
          />
        </div>`;
    }
  }

  /**
   * Generate HTML for an output field
   * @private
   */
  _generateOutputHTML(output) {
    const outputId = `${this.id}-output-${output.id}`;
    const value = this.data.outputs[output.id];
    const formatted = this.formatOutput(value, output);

    const sizeClass = output.size === 'large' ? 'output-large' : (output.size === 'small' ? 'output-small' : '');
    const highlightClass = output.highlight ? `highlight-${output.highlight}` : '';

    return `
    <div class="calc-output ${sizeClass} ${highlightClass}" data-output-id="${output.id}">
      <span class="calc-output-label">${this._escapeHtml(output.label)}</span>
      <span class="calc-output-value" id="${outputId}">${formatted}</span>
      ${output.sublabel ? `<span class="calc-output-sublabel">${this._escapeHtml(output.sublabel)}</span>` : ''}
    </div>`;
  }

  /**
   * Generate HTML for this calculator
   * @returns {string}
   */
  generateHTML() {
    const layoutClass = `layout-${this.config.layout}`;
    const themeClass = `theme-${this.config.theme}`;

    const inputsHTML = this.config.inputs.map(input => this._generateInputHTML(input)).join('');
    const outputsHTML = this.config.outputs.map(output => this._generateOutputHTML(output)).join('');

    return `
<div class="viz-component viz-calculator component-${this.id} ${layoutClass} ${themeClass}"
     data-component-id="${this.id}"
     data-component-type="calculator">
  ${this.config.showHeader && this.config.label ? `
  <div class="component-header">
    <h3 class="calc-title">${this._escapeHtml(this.config.label)}</h3>
    ${this.description ? `<p class="component-description">${this._escapeHtml(this.description)}</p>` : ''}
  </div>
  ` : ''}

  <div class="component-content">
    <div class="calc-inputs" ${this.config.layout === 'grid' ? `style="--columns: ${this.config.columns}"` : ''}>
      ${inputsHTML}
    </div>

    ${this.config.showDivider ? '<div class="calc-divider"></div>' : ''}

    <div class="calc-outputs">
      ${outputsHTML}
    </div>
  </div>

  ${this.config.helpText ? `
  <div class="calc-footer">
    <p class="calc-help-text">${this._escapeHtml(this.config.helpText)}</p>
  </div>
  ` : ''}
</div>`;
  }

  /**
   * Generate CSS for this calculator
   * @returns {string}
   */
  generateCSS() {
    return `
${super.generateCSS()}

.component-${this.id} {
  background: white;
  border: 1px solid var(--color-border, #E5E7EB);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.component-${this.id}.theme-card {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.component-${this.id} .component-header {
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: 1px solid var(--color-border, #E5E7EB);
  background: var(--color-surface);
}

.component-${this.id} .calc-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
}

.component-${this.id} .component-content {
  padding: var(--spacing-lg);
}

/* Inputs Section */
.component-${this.id} .calc-inputs {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.component-${this.id}.layout-horizontal .calc-inputs {
  flex-direction: row;
  flex-wrap: wrap;
}

.component-${this.id}.layout-horizontal .calc-field {
  flex: 1;
  min-width: 150px;
}

.component-${this.id}.layout-grid .calc-inputs {
  display: grid;
  grid-template-columns: repeat(var(--columns, 2), 1fr);
  gap: var(--spacing-md);
}

.component-${this.id} .calc-field {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.component-${this.id} .calc-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-muted);
}

.component-${this.id} .calc-input-wrapper {
  display: flex;
  align-items: center;
  border: 1px solid var(--color-border, #E5E7EB);
  border-radius: var(--radius-md);
  overflow: hidden;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.component-${this.id} .calc-input-wrapper:focus-within {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.component-${this.id} .input-prefix,
.component-${this.id} .input-suffix {
  padding: 0 var(--spacing-sm);
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-size: 14px;
  height: 100%;
  display: flex;
  align-items: center;
}

.component-${this.id} .calc-input {
  flex: 1;
  padding: var(--spacing-sm) var(--spacing-md);
  border: none;
  font-size: 16px;
  font-weight: 500;
  color: var(--color-text);
  outline: none;
  min-width: 0;
}

.component-${this.id} .calc-input::placeholder {
  color: var(--color-text-muted);
  font-weight: 400;
}

.component-${this.id} .calc-select {
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--color-border, #E5E7EB);
  border-radius: var(--radius-md);
  font-size: 14px;
  color: var(--color-text);
  background: white;
  cursor: pointer;
}

.component-${this.id} .calc-select:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  outline: none;
}

/* Slider Input */
.component-${this.id} .calc-field-slider {
  padding: var(--spacing-sm) 0;
}

.component-${this.id} .calc-slider-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-sm);
}

.component-${this.id} .calc-slider-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-primary);
}

.component-${this.id} .calc-slider {
  width: 100%;
  height: 8px;
  -webkit-appearance: none;
  appearance: none;
  background: var(--color-surface);
  border-radius: var(--radius-sm);
  outline: none;
}

.component-${this.id} .calc-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--color-primary);
  cursor: pointer;
  border: 2px solid white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.component-${this.id} .calc-slider-range {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--color-text-muted);
  margin-top: var(--spacing-xs);
}

/* Checkbox */
.component-${this.id} .calc-checkbox-label {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  cursor: pointer;
}

.component-${this.id} .calc-checkbox {
  width: 18px;
  height: 18px;
  accent-color: var(--color-primary);
}

.component-${this.id} .calc-checkbox-text {
  font-size: 14px;
  color: var(--color-text);
}

/* Divider */
.component-${this.id} .calc-divider {
  height: 1px;
  background: var(--color-border, #E5E7EB);
  margin: var(--spacing-lg) 0;
}

/* Outputs Section */
.component-${this.id} .calc-outputs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-md);
}

.component-${this.id} .calc-output {
  flex: 1;
  min-width: 120px;
  padding: var(--spacing-md);
  background: var(--color-surface);
  border-radius: var(--radius-md);
  text-align: center;
}

.component-${this.id} .calc-output.output-large {
  flex: 100%;
  padding: var(--spacing-lg);
}

.component-${this.id} .calc-output.output-small {
  min-width: 80px;
  padding: var(--spacing-sm);
}

.component-${this.id} .calc-output-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: var(--spacing-xs);
}

.component-${this.id} .calc-output-value {
  display: block;
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text);
}

.component-${this.id} .calc-output.output-large .calc-output-value {
  font-size: 36px;
}

.component-${this.id} .calc-output.output-small .calc-output-value {
  font-size: 18px;
}

.component-${this.id} .calc-output-sublabel {
  display: block;
  font-size: 11px;
  color: var(--color-text-muted);
  margin-top: var(--spacing-xs);
}

/* Highlight colors */
.component-${this.id} .calc-output.highlight-primary {
  background: rgba(59, 130, 246, 0.1);
}

.component-${this.id} .calc-output.highlight-primary .calc-output-value {
  color: var(--color-primary);
}

.component-${this.id} .calc-output.highlight-success {
  background: rgba(34, 197, 94, 0.1);
}

.component-${this.id} .calc-output.highlight-success .calc-output-value {
  color: var(--color-success, #22C55E);
}

.component-${this.id} .calc-output.highlight-warning {
  background: rgba(245, 158, 11, 0.1);
}

.component-${this.id} .calc-output.highlight-warning .calc-output-value {
  color: var(--color-warning, #F59E0B);
}

.component-${this.id} .calc-output.highlight-danger {
  background: rgba(239, 68, 68, 0.1);
}

.component-${this.id} .calc-output.highlight-danger .calc-output-value {
  color: var(--color-danger, #EF4444);
}

/* Footer */
.component-${this.id} .calc-footer {
  padding: var(--spacing-sm) var(--spacing-lg);
  border-top: 1px solid var(--color-border, #E5E7EB);
  background: var(--color-surface);
}

.component-${this.id} .calc-help-text {
  font-size: 12px;
  color: var(--color-text-muted);
  margin: 0;
}

.component-${this.id} .calc-help {
  font-size: 11px;
  color: var(--color-text-muted);
}

/* Compact theme */
.component-${this.id}.theme-compact .component-content {
  padding: var(--spacing-md);
}

.component-${this.id}.theme-compact .calc-output {
  padding: var(--spacing-sm);
}

.component-${this.id}.theme-compact .calc-output-value {
  font-size: 18px;
}
`;
  }

  /**
   * Generate JavaScript for this calculator
   * @returns {string}
   */
  generateJS() {
    const calculate = this.config.calculate;
    const calculateFormula = this.config.calculateFormula;
    const onChange = this.config.onChange;
    const autoCalculate = this.config.autoCalculate;

    return `
(function() {
  const calcId = '${this.id}';
  const container = document.querySelector('.component-' + calcId);
  if (!container) return;

  const inputs = ${JSON.stringify(this.config.inputs)};
  const outputs = ${JSON.stringify(this.config.outputs)};

  let values = ${JSON.stringify(this.data.inputs)};

  function getInputElement(inputId) {
    return document.getElementById(calcId + '-input-' + inputId);
  }

  function getOutputElement(outputId) {
    return document.getElementById(calcId + '-output-' + outputId);
  }

  function parseInputValue(value, type) {
    switch (type) {
      case 'number':
      case 'currency':
      case 'percent':
      case 'slider':
        return parseFloat(String(value).replace(/[^0-9.-]/g, '')) || 0;
      case 'checkbox':
        return !!value;
      default:
        return value;
    }
  }

  function formatOutput(value, output) {
    if (value === null || value === undefined) {
      return output.placeholder || '-';
    }

    switch (output.format) {
      case 'currency':
        return new Intl.NumberFormat(output.locale || 'en-US', {
          style: 'currency',
          currency: output.currency || 'USD',
          minimumFractionDigits: output.decimals ?? 0,
          maximumFractionDigits: output.decimals ?? 0
        }).format(value);
      case 'percent':
        return new Intl.NumberFormat(output.locale || 'en-US', {
          style: 'percent',
          minimumFractionDigits: output.decimals ?? 1,
          maximumFractionDigits: output.decimals ?? 1
        }).format(value / 100);
      case 'number':
        return new Intl.NumberFormat(output.locale || 'en-US', {
          minimumFractionDigits: output.decimals ?? 0,
          maximumFractionDigits: output.decimals ?? 2
        }).format(value);
      default:
        return String(value);
    }
  }

  function calculate() {
    let results = {};

    ${calculate ? `
    // Use custom calculation function
    if (typeof window['${calculate}'] === 'function') {
      results = window['${calculate}'](values, outputs) || {};
    }
    ` : calculateFormula ? `
    // Use simple formula
    try {
      const formula = '${calculateFormula}';
      // Create function context with input values
      const fn = new Function(...Object.keys(values), 'return ' + formula);
      const result = fn(...Object.values(values));
      results = { result };
    } catch (e) {
      console.error('Calculator formula error:', e);
    }
    ` : `
    // Default: pass through values
    results = { ...values };
    `}

    // Update output displays
    outputs.forEach(output => {
      const el = getOutputElement(output.id);
      if (el) {
        const value = results[output.id] !== undefined ? results[output.id] : results.result;
        el.textContent = formatOutput(value, output);
      }
    });

    // Emit change event
    const event = new CustomEvent('calculator-change', {
      detail: { componentId: calcId, inputs: values, outputs: results },
      bubbles: true
    });
    container.dispatchEvent(event);

    ${onChange ? `
    if (typeof window['${onChange}'] === 'function') {
      window['${onChange}'](values, results, calcId);
    }
    ` : ''}

    return results;
  }

  // Set up input handlers
  inputs.forEach(input => {
    const el = getInputElement(input.id);
    if (!el) return;

    const eventType = input.type === 'slider' ? 'input' :
                      input.type === 'dropdown' ? 'change' :
                      input.type === 'checkbox' ? 'change' : 'input';

    el.addEventListener(eventType, function(e) {
      let value;

      if (input.type === 'checkbox') {
        value = e.target.checked;
      } else if (input.type === 'slider') {
        value = parseFloat(e.target.value);
        // Update slider value display
        const valueEl = document.getElementById(calcId + '-input-' + input.id + '-value');
        if (valueEl) {
          valueEl.textContent = value + (input.suffix || '');
        }
      } else if (input.type === 'dropdown') {
        value = e.target.value;
      } else {
        value = parseInputValue(e.target.value, input.type);
      }

      values[input.id] = value;

      ${autoCalculate ? 'calculate();' : ''}
    });

    // Handle blur for number inputs (format display)
    if (['number', 'currency', 'percent'].includes(input.type)) {
      el.addEventListener('blur', function(e) {
        const value = parseInputValue(e.target.value, input.type);
        values[input.id] = value;
        ${autoCalculate ? 'calculate();' : ''}
      });
    }
  });

  // Initial calculation
  ${autoCalculate ? 'calculate();' : ''}

  // Store reference
  window.VIZ_CALCULATORS = window.VIZ_CALCULATORS || {};
  window.VIZ_CALCULATORS[calcId] = {
    getInputs: () => ({ ...values }),
    setInput: (id, value) => {
      values[id] = value;
      const el = getInputElement(id);
      if (el) el.value = value;
      ${autoCalculate ? 'calculate();' : ''}
    },
    setInputs: (newValues) => {
      Object.assign(values, newValues);
      Object.keys(newValues).forEach(id => {
        const el = getInputElement(id);
        if (el) el.value = newValues[id];
      });
      ${autoCalculate ? 'calculate();' : ''}
    },
    calculate: calculate,
    getOutputs: () => {
      const result = {};
      outputs.forEach(o => {
        const el = getOutputElement(o.id);
        result[o.id] = el ? el.textContent : null;
      });
      return result;
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
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Validate calculator is ready to render
   * @returns {Object}
   */
  validate() {
    const base = super.validate();

    // Calculator doesn't require data like other components
    base.errors = base.errors.filter(e => !e.includes('data is required'));

    if (!this.config.inputs || this.config.inputs.length === 0) {
      base.errors.push('Calculator requires at least one input');
      base.valid = false;
    }

    if (!this.config.outputs || this.config.outputs.length === 0) {
      base.errors.push('Calculator requires at least one output');
      base.valid = false;
    }

    // Validate inputs have required fields
    for (const input of this.config.inputs) {
      if (!input.id) {
        base.errors.push('Each calculator input must have an id');
        base.valid = false;
      }
      if (!input.type) {
        base.errors.push(`Calculator input "${input.id}" must have a type`);
        base.valid = false;
      }
    }

    // Validate outputs have required fields
    for (const output of this.config.outputs) {
      if (!output.id) {
        base.errors.push('Each calculator output must have an id');
        base.valid = false;
      }
    }

    return base;
  }

  /**
   * Create from serialized state
   * @param {Object} json
   * @returns {CalculatorComponent}
   */
  static deserialize(json) {
    const component = new CalculatorComponent({
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

module.exports = CalculatorComponent;
