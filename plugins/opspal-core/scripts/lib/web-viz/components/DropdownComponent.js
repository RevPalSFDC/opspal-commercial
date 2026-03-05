/**
 * Dropdown Component
 *
 * Interactive dropdown/select with search, single/multi-select support,
 * and customizable styling. Perfect for product selection, deal types, etc.
 *
 * @module web-viz/components/DropdownComponent
 * @version 1.0.0
 */

const BaseComponent = require('./BaseComponent');

class DropdownComponent extends BaseComponent {
  /**
   * Create a dropdown component
   * @param {Object} options - Dropdown options
   */
  constructor(options = {}) {
    super('dropdown', options);

    this.config = {
      options: options.config?.options || [], // [{value: 'x', label: 'X', disabled?: bool, group?: 'groupName'}]
      defaultValue: options.config?.defaultValue || null,
      defaultValues: options.config?.defaultValues || [], // For multi-select
      multiple: options.config?.multiple ?? false,
      searchable: options.config?.searchable ?? false,
      searchPlaceholder: options.config?.searchPlaceholder || 'Search...',
      placeholder: options.config?.placeholder || 'Select an option',
      label: options.config?.label || options.title || '',
      required: options.config?.required ?? false,
      disabled: options.config?.disabled ?? false,
      clearable: options.config?.clearable ?? true,
      maxHeight: options.config?.maxHeight || 300,
      grouped: options.config?.grouped ?? false,
      onChange: options.config?.onChange || null,
      size: options.config?.size || 'medium', // 'small', 'medium', 'large'
      helpText: options.config?.helpText || '',
      ...options.config
    };

    // Current selection state
    this.data = {
      selected: this.config.multiple
        ? this.config.defaultValues
        : this.config.defaultValue,
      isOpen: false,
      searchQuery: ''
    };
  }

  /**
   * Set the selected value(s)
   * @param {string|string[]} value
   * @returns {DropdownComponent}
   */
  setSelected(value) {
    if (this.config.multiple) {
      this.data.selected = Array.isArray(value) ? value : [value];
    } else {
      this.data.selected = value;
    }
    this.updated = new Date().toISOString();
    return this;
  }

  /**
   * Get option label by value
   * @param {string} value
   * @returns {string}
   */
  getLabel(value) {
    const option = this.config.options.find(o => o.value === value);
    return option ? option.label : value;
  }

  /**
   * Get grouped options
   * @returns {Object}
   */
  getGroupedOptions() {
    if (!this.config.grouped) {
      return { '': this.config.options };
    }

    const groups = {};
    for (const opt of this.config.options) {
      const groupName = opt.group || '';
      if (!groups[groupName]) {
        groups[groupName] = [];
      }
      groups[groupName].push(opt);
    }
    return groups;
  }

  /**
   * Generate HTML for this dropdown
   * @returns {string}
   */
  generateHTML() {
    const sizeClass = `size-${this.config.size}`;
    const selected = this.data.selected;
    const isMulti = this.config.multiple;

    // Generate display text
    let displayText;
    if (isMulti && Array.isArray(selected) && selected.length > 0) {
      displayText = selected.map(v => this.getLabel(v)).join(', ');
    } else if (!isMulti && selected) {
      displayText = this.getLabel(selected);
    } else {
      displayText = this.config.placeholder;
    }

    const hasSelection = isMulti
      ? (Array.isArray(selected) && selected.length > 0)
      : (selected !== null && selected !== undefined);

    return `
<div class="viz-component viz-dropdown component-${this.id} ${sizeClass}"
     data-component-id="${this.id}"
     data-component-type="dropdown">
  <div class="component-header">
    ${this.config.label ? `
    <label class="dropdown-label" for="${this.id}-trigger">
      ${this._escapeHtml(this.config.label)}
      ${this.config.required ? '<span class="required-indicator">*</span>' : ''}
    </label>
    ` : ''}
    ${this.description ? `<p class="component-description">${this._escapeHtml(this.description)}</p>` : ''}
  </div>

  <div class="component-content">
    <div class="dropdown-container" id="${this.id}-container">
      <button type="button"
              class="dropdown-trigger ${hasSelection ? 'has-selection' : ''}"
              id="${this.id}-trigger"
              ${this.config.disabled ? 'disabled' : ''}
              aria-haspopup="listbox"
              aria-expanded="false">
        <span class="dropdown-display">${this._escapeHtml(displayText)}</span>
        ${this.config.clearable && hasSelection ? `
        <button type="button"
                class="dropdown-clear"
                aria-label="Clear selection"
                onclick="event.stopPropagation();">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
        ` : ''}
        <svg class="dropdown-arrow" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

      <div class="dropdown-menu" id="${this.id}-menu" role="listbox" aria-labelledby="${this.id}-trigger">
        ${this.config.searchable ? `
        <div class="dropdown-search-wrapper">
          <input type="text"
                 class="dropdown-search"
                 id="${this.id}-search"
                 placeholder="${this._escapeHtml(this.config.searchPlaceholder)}"
                 autocomplete="off"
          />
        </div>
        ` : ''}
        <div class="dropdown-options" style="max-height: ${this.config.maxHeight}px">
          ${this._generateOptionsHTML()}
        </div>
      </div>
    </div>

    ${this.config.helpText ? `
    <p class="dropdown-help">${this._escapeHtml(this.config.helpText)}</p>
    ` : ''}
  </div>
</div>`;
  }

  /**
   * Generate options HTML (supports grouping)
   * @private
   */
  _generateOptionsHTML() {
    const groups = this.getGroupedOptions();
    const selected = this.data.selected;
    const isMulti = this.config.multiple;

    let html = '';

    for (const [groupName, options] of Object.entries(groups)) {
      if (groupName) {
        html += `<div class="dropdown-group-label">${this._escapeHtml(groupName)}</div>`;
      }

      for (const opt of options) {
        const isSelected = isMulti
          ? (Array.isArray(selected) && selected.includes(opt.value))
          : selected === opt.value;

        html += `
        <div class="dropdown-option ${isSelected ? 'selected' : ''} ${opt.disabled ? 'disabled' : ''}"
             data-value="${this._escapeHtml(opt.value)}"
             role="option"
             aria-selected="${isSelected}">
          ${isMulti ? `
          <span class="dropdown-checkbox">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
          ` : ''}
          <span class="dropdown-option-label">${this._escapeHtml(opt.label)}</span>
          ${opt.description ? `<span class="dropdown-option-desc">${this._escapeHtml(opt.description)}</span>` : ''}
        </div>`;
      }
    }

    return html;
  }

  /**
   * Generate CSS for this dropdown
   * @returns {string}
   */
  generateCSS() {
    return `
${super.generateCSS()}

.component-${this.id} .dropdown-label {
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

.component-${this.id} .dropdown-container {
  position: relative;
}

.component-${this.id} .dropdown-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  background: white;
  border: 1px solid var(--color-border, #E5E7EB);
  border-radius: var(--radius-md);
  font-size: 14px;
  color: var(--color-text-muted);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.component-${this.id} .dropdown-trigger:hover:not(:disabled) {
  border-color: var(--color-primary);
}

.component-${this.id} .dropdown-trigger:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.component-${this.id} .dropdown-trigger.has-selection {
  color: var(--color-text);
}

.component-${this.id} .dropdown-trigger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.component-${this.id} .dropdown-display {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.component-${this.id} .dropdown-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: background 0.15s ease, color 0.15s ease;
}

.component-${this.id} .dropdown-clear:hover {
  background: var(--color-surface);
  color: var(--color-text);
}

.component-${this.id} .dropdown-arrow {
  color: var(--color-text-muted);
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.component-${this.id} .dropdown-container.open .dropdown-arrow {
  transform: rotate(180deg);
}

.component-${this.id} .dropdown-menu {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 1000;
  margin-top: 4px;
  background: white;
  border: 1px solid var(--color-border, #E5E7EB);
  border-radius: var(--radius-md);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  opacity: 0;
  visibility: hidden;
  transform: translateY(-8px);
  transition: opacity 0.15s ease, transform 0.15s ease, visibility 0.15s;
}

.component-${this.id} .dropdown-container.open .dropdown-menu {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}

.component-${this.id} .dropdown-search-wrapper {
  padding: var(--spacing-sm);
  border-bottom: 1px solid var(--color-border, #E5E7EB);
}

.component-${this.id} .dropdown-search {
  width: 100%;
  padding: var(--spacing-xs) var(--spacing-sm);
  border: 1px solid var(--color-border, #E5E7EB);
  border-radius: var(--radius-sm);
  font-size: 14px;
  outline: none;
}

.component-${this.id} .dropdown-search:focus {
  border-color: var(--color-primary);
}

.component-${this.id} .dropdown-options {
  overflow-y: auto;
}

.component-${this.id} .dropdown-group-label {
  padding: var(--spacing-xs) var(--spacing-md);
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: var(--color-surface);
}

.component-${this.id} .dropdown-option {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  cursor: pointer;
  transition: background 0.1s ease;
}

.component-${this.id} .dropdown-option:hover:not(.disabled) {
  background: var(--color-surface-hover, #F3F4F6);
}

.component-${this.id} .dropdown-option.selected {
  background: rgba(59, 130, 246, 0.1);
  color: var(--color-primary);
}

.component-${this.id} .dropdown-option.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.component-${this.id} .dropdown-option.hidden {
  display: none;
}

.component-${this.id} .dropdown-checkbox {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: 2px solid var(--color-border, #E5E7EB);
  border-radius: 3px;
  flex-shrink: 0;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.component-${this.id} .dropdown-checkbox svg {
  opacity: 0;
  transition: opacity 0.15s ease;
}

.component-${this.id} .dropdown-option.selected .dropdown-checkbox {
  background: var(--color-primary);
  border-color: var(--color-primary);
}

.component-${this.id} .dropdown-option.selected .dropdown-checkbox svg {
  opacity: 1;
  color: white;
}

.component-${this.id} .dropdown-option-label {
  flex: 1;
}

.component-${this.id} .dropdown-option-desc {
  font-size: 12px;
  color: var(--color-text-muted);
}

.component-${this.id} .dropdown-help {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-top: var(--spacing-xs);
  margin-bottom: 0;
}

/* Size variants */
.component-${this.id}.size-small .dropdown-trigger {
  padding: 6px var(--spacing-sm);
  font-size: 13px;
}

.component-${this.id}.size-large .dropdown-trigger {
  padding: var(--spacing-md);
  font-size: 16px;
}
`;
  }

  /**
   * Generate JavaScript for this dropdown
   * @returns {string}
   */
  generateJS() {
    const onChange = this.config.onChange;
    const isMultiple = this.config.multiple;
    const searchable = this.config.searchable;
    const clearable = this.config.clearable;

    return `
(function() {
  const dropdownId = '${this.id}';
  const container = document.getElementById(dropdownId + '-container');
  const trigger = document.getElementById(dropdownId + '-trigger');
  const menu = document.getElementById(dropdownId + '-menu');
  const searchInput = document.getElementById(dropdownId + '-search');
  const displayEl = trigger.querySelector('.dropdown-display');
  const clearBtn = trigger.querySelector('.dropdown-clear');

  if (!container || !trigger || !menu) return;

  const config = {
    multiple: ${isMultiple},
    searchable: ${searchable},
    clearable: ${clearable},
    placeholder: '${this._escapeHtml(this.config.placeholder)}'
  };

  let selected = ${JSON.stringify(this.data.selected)};
  let isOpen = false;

  const options = ${JSON.stringify(this.config.options)};

  function getLabel(value) {
    const opt = options.find(o => o.value === value);
    return opt ? opt.label : value;
  }

  function updateDisplay() {
    let text;
    if (config.multiple && Array.isArray(selected) && selected.length > 0) {
      text = selected.map(v => getLabel(v)).join(', ');
    } else if (!config.multiple && selected) {
      text = getLabel(selected);
    } else {
      text = config.placeholder;
    }

    displayEl.textContent = text;

    const hasSelection = config.multiple
      ? (Array.isArray(selected) && selected.length > 0)
      : (selected !== null && selected !== undefined);

    trigger.classList.toggle('has-selection', hasSelection);

    // Update option styles
    const optionEls = menu.querySelectorAll('.dropdown-option');
    optionEls.forEach(el => {
      const value = el.dataset.value;
      const isSelected = config.multiple
        ? (Array.isArray(selected) && selected.includes(value))
        : selected === value;
      el.classList.toggle('selected', isSelected);
      el.setAttribute('aria-selected', isSelected);
    });
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    container.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
    if (searchInput) {
      searchInput.value = '';
      filterOptions('');
      setTimeout(() => searchInput.focus(), 50);
    }
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    container.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
  }

  function toggle() {
    if (isOpen) close();
    else open();
  }

  function selectValue(value) {
    if (config.multiple) {
      if (!Array.isArray(selected)) selected = [];
      const index = selected.indexOf(value);
      if (index === -1) {
        selected = [...selected, value];
      } else {
        selected = selected.filter(v => v !== value);
      }
    } else {
      selected = value;
      close();
    }

    updateDisplay();
    emitChange();
  }

  function clearSelection(e) {
    if (e) e.stopPropagation();
    selected = config.multiple ? [] : null;
    updateDisplay();
    emitChange();
  }

  function filterOptions(query) {
    const q = query.toLowerCase();
    const optionEls = menu.querySelectorAll('.dropdown-option');
    optionEls.forEach(el => {
      const label = el.querySelector('.dropdown-option-label').textContent.toLowerCase();
      const match = !q || label.includes(q);
      el.classList.toggle('hidden', !match);
    });
  }

  function emitChange() {
    const event = new CustomEvent('dropdown-change', {
      detail: { componentId: dropdownId, value: selected },
      bubbles: true
    });
    container.dispatchEvent(event);

    ${onChange ? `
    if (typeof window['${onChange}'] === 'function') {
      window['${onChange}'](selected, dropdownId);
    }
    ` : ''}
  }

  // Event handlers
  trigger.addEventListener('click', toggle);

  if (clearBtn) {
    clearBtn.addEventListener('click', clearSelection);
  }

  menu.addEventListener('click', function(e) {
    const option = e.target.closest('.dropdown-option');
    if (option && !option.classList.contains('disabled')) {
      selectValue(option.dataset.value);
    }
  });

  if (searchInput) {
    searchInput.addEventListener('input', function(e) {
      filterOptions(e.target.value);
    });

    searchInput.addEventListener('click', function(e) {
      e.stopPropagation();
    });
  }

  // Close on click outside
  document.addEventListener('click', function(e) {
    if (!container.contains(e.target)) {
      close();
    }
  });

  // Close on escape
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && isOpen) {
      close();
      trigger.focus();
    }
  });

  // Initial display
  updateDisplay();

  // Store reference
  window.VIZ_DROPDOWNS = window.VIZ_DROPDOWNS || {};
  window.VIZ_DROPDOWNS[dropdownId] = {
    getValue: () => selected,
    setValue: (val) => {
      selected = val;
      updateDisplay();
    },
    getOptions: () => options,
    open: open,
    close: close,
    clear: clearSelection
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
   * Validate dropdown is ready to render
   * @returns {Object}
   */
  validate() {
    const base = super.validate();

    // Dropdown doesn't require data like other components
    base.errors = base.errors.filter(e => !e.includes('data is required'));

    if (!this.config.options || this.config.options.length === 0) {
      base.errors.push('Dropdown requires at least one option');
      base.valid = false;
    }

    // Validate options have value and label
    for (const opt of this.config.options) {
      if (opt.value === undefined || opt.value === null) {
        base.errors.push('Each dropdown option must have a value');
        base.valid = false;
        break;
      }
    }

    return base;
  }

  /**
   * Create from serialized state
   * @param {Object} json
   * @returns {DropdownComponent}
   */
  static deserialize(json) {
    const component = new DropdownComponent({
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

module.exports = DropdownComponent;
