/**
 * Editable Table Component for Web Visualizations
 *
 * Interactive table with add, edit, delete, and reorder capabilities.
 * Used for editing tiers, roles, SPIFs, clawbacks in compensation plans.
 *
 * @module web-viz/components/EditableTableComponent
 * @version 1.0.0
 */

const BaseComponent = require('./BaseComponent');

class EditableTableComponent extends BaseComponent {
  /**
   * Create an editable table component
   * @param {string} id - Component ID
   * @param {Object} options - Component options
   * @param {Array} options.columns - Column definitions [{ key, label, type, width?, required?, min?, max?, options?, default? }]
   * @param {Array} options.rows - Initial row data
   * @param {string} options.addRowLabel - Label for add row button
   * @param {boolean} options.allowDelete - Allow row deletion (default true)
   * @param {boolean} options.allowReorder - Allow row reordering (default true)
   * @param {string} options.rowIdField - Field to use as row ID (default '_id')
   * @param {number} options.maxRows - Maximum number of rows (default unlimited)
   * @param {number} options.minRows - Minimum number of rows (default 0)
   * @param {string} options.onRowChange - Callback function name for row changes
   */
  constructor(id, options = {}) {
    super('editableTable', { id, ...options });

    if (this.position.colspan == null) {
      this.position.colspan = 12;
    }

    const normalizedColumns = (options.columns || []).map(col => ({
      ...col,
      key: col.key || col.field,
      label: col.label || col.header || col.key || col.field,
      type: col.type || col.format || 'text'
    }));

    this.config = {
      columns: normalizedColumns,
      addRowLabel: options.addRowLabel || '+ Add Row',
      allowDelete: options.allowDelete !== false,
      allowReorder: options.allowReorder !== false,
      rowIdField: options.rowIdField || '_id',
      maxRows: options.maxRows || Infinity,
      minRows: options.minRows || 0,
      onRowChange: options.onRowChange || null,
      emptyMessage: options.emptyMessage || 'No data. Click the button below to add a row.',
      confirmDelete: options.confirmDelete !== false,
      ...options.config
    };

    // Initialize rows with IDs if not present
    this.data = (options.rows || []).map((row, idx) => ({
      ...row,
      [this.config.rowIdField]: row[this.config.rowIdField] || `row_${Date.now()}_${idx}`
    }));
  }

  /**
   * Set rows for the table
   * @param {Array} rows
   * @param {Object} metadata
   * @returns {EditableTableComponent}
   */
  setData(rows, metadata = {}) {
    if (!Array.isArray(rows)) {
      throw new Error('Editable table data must be an array');
    }

    this.data = rows.map((row, idx) => ({
      ...row,
      [this.config.rowIdField]: row[this.config.rowIdField] || `row_${Date.now()}_${idx}`
    }));

    return super.setData(this.data, metadata);
  }

  /**
   * Generate HTML for the editable table component
   * @returns {string} HTML string
   */
  generateHTML() {
    const { columns, addRowLabel, allowDelete, allowReorder, emptyMessage } = this.config;

    // Build column headers
    const headers = columns.map(col => {
      const styles = [];
      if (col.width) styles.push(`width: ${col.width};`);
      if (col.align) styles.push(`text-align: ${col.align};`);
      const styleAttr = styles.length > 0 ? ` style="${styles.join(' ')}"` : '';
      return `<th class="col-${col.key}"${styleAttr}>${this._escapeHtml(col.label)}</th>`;
    }).join('');

    // Actions column header
    const actionsHeader = (allowDelete || allowReorder) ?
      '<th class="col-actions">Actions</th>' : '';

    // Build rows
    const rows = this.data.map((row, idx) => this._generateRowHTML(row, idx)).join('');

    return `
<div class="viz-component editable-table-component component-${this.id}"
     id="component-${this.id}"
     data-component-id="${this.id}"
     data-component-type="editableTable">

  ${this.title ? `
  <div class="component-header">
    <h3 class="component-title">${this._escapeHtml(this.title)}</h3>
    ${this.description ? `<p class="component-description">${this._escapeHtml(this.description)}</p>` : ''}
  </div>
  ` : ''}

  <div class="component-body">
    <div class="table-wrapper">
      <table class="editable-table" id="${this.id}-table">
        <thead>
          <tr>
            ${headers}
            ${actionsHeader}
          </tr>
        </thead>
        <tbody id="${this.id}-tbody">
          ${rows || `<tr class="empty-row"><td colspan="${columns.length + (allowDelete || allowReorder ? 1 : 0)}">${this._escapeHtml(emptyMessage)}</td></tr>`}
        </tbody>
      </table>
    </div>

    <div class="table-footer">
      <button type="button"
              class="btn-add-row"
              id="${this.id}-add-row"
              ${this.data.length >= this.config.maxRows ? 'disabled' : ''}>
        ${this._escapeHtml(addRowLabel)}
      </button>
      <span class="row-count" id="${this.id}-row-count">
        ${this.data.length} row${this.data.length !== 1 ? 's' : ''}
      </span>
    </div>

    <div class="table-validation-errors" id="${this.id}-errors" hidden></div>
  </div>
</div>`;
  }

  /**
   * Generate HTML for a single row
   * @private
   */
  _generateRowHTML(row, index) {
    const { columns, allowDelete, allowReorder, rowIdField } = this.config;
    const rowId = row[rowIdField];

    const cells = columns.map(col => {
      const value = row[col.key] !== undefined ? row[col.key] : (col.default || '');
      return this._generateCellHTML(col, value, rowId);
    }).join('');

    const actionButtons = [];
    if (allowReorder) {
      actionButtons.push(`
        <button type="button" class="btn-row-action btn-move-up" data-action="move-up" title="Move Up" ${index === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" class="btn-row-action btn-move-down" data-action="move-down" title="Move Down">↓</button>
      `);
    }
    if (allowDelete) {
      actionButtons.push(`
        <button type="button" class="btn-row-action btn-delete" data-action="delete" title="Delete">🗑️</button>
      `);
    }

    const actionsCell = actionButtons.length > 0 ?
      `<td class="cell-actions">${actionButtons.join('')}</td>` : '';

    return `
      <tr class="data-row" data-row-id="${rowId}" data-row-index="${index}">
        ${cells}
        ${actionsCell}
      </tr>
    `;
  }

  /**
   * Generate HTML for a single cell
   * @private
   */
  _generateCellHTML(column, value, rowId) {
    const { key, type, required, min, max, step, options, placeholder } = column;
    const inputId = `${this.id}-${rowId}-${key}`;
    const requiredAttr = required ? 'required' : '';
    const placeholderAttr = placeholder ? `placeholder="${this._escapeHtml(placeholder)}"` : '';

    let input;
    switch (type) {
      case 'number':
      case 'currency':
      case 'percent':
        const minAttr = min !== undefined ? `min="${min}"` : '';
        const maxAttr = max !== undefined ? `max="${max}"` : '';
        const stepAttr = step !== undefined ? `step="${step}"` : 'step="any"';
        const prefix = type === 'currency' ? '<span class="input-prefix">$</span>' : '';
        const suffix = type === 'percent' ? '<span class="input-suffix">%</span>' : '';
        input = `
          <div class="input-wrapper ${type}">
            ${prefix}
            <input type="number"
                   id="${inputId}"
                   data-field="${key}"
                   value="${value}"
                   ${minAttr} ${maxAttr} ${stepAttr}
                   ${requiredAttr} ${placeholderAttr}
                   class="cell-input input-${type}">
            ${suffix}
          </div>
        `;
        break;

      case 'color':
        input = `
          <input type="color"
                 id="${inputId}"
                 data-field="${key}"
                 value="${value}"
                 ${requiredAttr}
                 class="cell-input input-color">
        `;
        break;

      case 'select':
        const optionsHtml = (options || []).map(opt => {
          const optValue = typeof opt === 'object' ? opt.value : opt;
          const optLabel = typeof opt === 'object' ? opt.label : opt;
          const selected = optValue === value ? 'selected' : '';
          return `<option value="${this._escapeHtml(optValue)}" ${selected}>${this._escapeHtml(optLabel)}</option>`;
        }).join('');
        input = `
          <select id="${inputId}"
                  data-field="${key}"
                  ${requiredAttr}
                  class="cell-input input-select">
            <option value="">Select...</option>
            ${optionsHtml}
          </select>
        `;
        break;

      case 'checkbox':
        input = `
          <input type="checkbox"
                 id="${inputId}"
                 data-field="${key}"
                 ${value ? 'checked' : ''}
                 class="cell-input input-checkbox">
        `;
        break;

      case 'date':
        input = `
          <input type="date"
                 id="${inputId}"
                 data-field="${key}"
                 value="${value}"
                 ${requiredAttr}
                 class="cell-input input-date">
        `;
        break;

      case 'text':
      default:
        input = `
          <input type="text"
                 id="${inputId}"
                 data-field="${key}"
                 value="${this._escapeHtml(value)}"
                 ${requiredAttr} ${placeholderAttr}
                 class="cell-input input-text">
        `;
    }

    return `<td class="cell-${key}" data-column="${key}">${input}</td>`;
  }

  /**
   * Generate CSS for the editable table component
   * @returns {string} CSS string
   */
  generateCSS() {
    return `
${super.generateCSS()}

/* Editable Table Component Styles */
.editable-table-component {
  background: var(--neutral-100, #ffffff);
  border-radius: var(--radius-lg, 12px);
  padding: var(--space-24, 24px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0,0,0,0.1));
}

.table-wrapper {
  overflow-x: auto;
  margin: 0 -4px;
  padding: 0 4px;
}

.editable-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.editable-table th,
.editable-table td {
  padding: var(--space-12, 12px) var(--space-8, 8px);
  text-align: left;
  border-bottom: 1px solid var(--neutral-90, #e5e7eb);
}

.editable-table th {
  font-weight: 600;
  color: var(--brand-indigo, #3E4A61);
  background: var(--neutral-98, #fafafa);
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.editable-table tbody tr:hover {
  background: rgba(95, 59, 140, 0.03);
}

.editable-table tbody tr.dragging {
  opacity: 0.5;
  background: var(--brand-grape-light, #f3e8ff);
}

.empty-row td {
  text-align: center;
  color: var(--neutral-50, #6b7280);
  font-style: italic;
  padding: var(--space-24, 24px);
}

/* Cell Inputs */
.cell-input {
  width: 100%;
  padding: var(--space-8, 8px) var(--space-12, 12px);
  border: 1px solid var(--neutral-80, #e5e7eb);
  border-radius: var(--radius-sm, 4px);
  font-size: 14px;
  color: var(--brand-indigo, #3E4A61);
  background: var(--neutral-100, #ffffff);
  transition: border-color 150ms ease, box-shadow 150ms ease;
}

.cell-input:focus {
  outline: none;
  border-color: var(--brand-grape, #5F3B8C);
  box-shadow: 0 0 0 3px rgba(95, 59, 140, 0.1);
}

.cell-input:invalid {
  border-color: var(--error, #ef4444);
}

.input-wrapper {
  display: flex;
  align-items: center;
  gap: 4px;
}

.input-wrapper.currency .cell-input,
.input-wrapper.percent .cell-input {
  text-align: right;
}

.input-prefix,
.input-suffix {
  color: var(--neutral-50, #6b7280);
  font-size: 13px;
}

.input-number,
.input-currency,
.input-percent {
  width: 100px;
}

.input-checkbox {
  width: auto;
  cursor: pointer;
}

.input-select {
  cursor: pointer;
}

/* Action Buttons */
.cell-actions {
  white-space: nowrap;
  width: 100px;
}

.btn-row-action {
  background: none;
  border: none;
  padding: var(--space-4, 4px) var(--space-8, 8px);
  cursor: pointer;
  font-size: 14px;
  border-radius: var(--radius-sm, 4px);
  transition: all 150ms ease;
  color: var(--neutral-50, #6b7280);
}

.btn-row-action:hover:not(:disabled) {
  background: var(--neutral-95, #f3f4f6);
}

.btn-row-action:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.btn-delete:hover:not(:disabled) {
  background: var(--error-bg, #fef2f2);
  color: var(--error, #ef4444);
}

.btn-move-up:hover:not(:disabled),
.btn-move-down:hover:not(:disabled) {
  background: var(--brand-grape-light, #f3e8ff);
  color: var(--brand-grape, #5F3B8C);
}

/* Footer */
.table-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: var(--space-16, 16px);
  padding-top: var(--space-16, 16px);
  border-top: 1px solid var(--neutral-90, #e5e7eb);
}

.btn-add-row {
  background: var(--brand-grape, #5F3B8C);
  color: var(--neutral-100, #ffffff);
  border: none;
  padding: var(--space-10, 10px) var(--space-16, 16px);
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease;
}

.btn-add-row:hover:not(:disabled) {
  background: var(--brand-grape-dark, #4a2d6e);
}

.btn-add-row:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.row-count {
  font-size: 13px;
  color: var(--neutral-50, #6b7280);
}

/* Validation Errors */
.table-validation-errors {
  margin-top: var(--space-12, 12px);
  padding: var(--space-12, 12px);
  background: var(--error-bg, #fef2f2);
  border-radius: var(--radius-md, 8px);
  color: var(--error, #ef4444);
  font-size: 13px;
}

.table-validation-errors ul {
  margin: 0;
  padding-left: var(--space-16, 16px);
}
`;
  }

  /**
   * Generate client-side JavaScript for table interactivity
   * @returns {string} JavaScript string
   */
  generateJS() {
    const componentId = this.id;
    const config = JSON.stringify(this.config);
    const initialData = JSON.stringify(this.data);

    return `
(function() {
  const componentId = '${componentId}';
  const config = ${config};
  let rows = ${initialData};

  // Get DOM elements
  const tbody = document.getElementById(componentId + '-tbody');
  const addBtn = document.getElementById(componentId + '-add-row');
  const rowCountEl = document.getElementById(componentId + '-row-count');
  const errorsEl = document.getElementById(componentId + '-errors');

  // Store component state globally
  window.VIZ_EDITABLE_TABLES = window.VIZ_EDITABLE_TABLES || {};
  window.VIZ_EDITABLE_TABLES[componentId] = {
    getRows: function() { return JSON.parse(JSON.stringify(rows)); },
    setRows: function(newRows) { rows = newRows; rerender(); },
    addRow: function(data) { addRow(data); },
    deleteRow: function(rowId) { deleteRow(rowId); },
    validate: function() { return validateAll(); }
  };

  // Generate unique row ID
  function generateRowId() {
    return 'row_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  // Update row count display
  function updateRowCount() {
    rowCountEl.textContent = rows.length + ' row' + (rows.length !== 1 ? 's' : '');
    addBtn.disabled = rows.length >= config.maxRows;
  }

  // Emit change event
  function emitChange(action, rowId, rowData) {
    const event = new CustomEvent('table-change', {
      detail: {
        componentId: componentId,
        action: action, // 'add', 'edit', 'delete', 'reorder'
        rowId: rowId,
        rowData: rowData,
        allRows: JSON.parse(JSON.stringify(rows))
      },
      bubbles: true
    });
    document.getElementById('component-' + componentId).dispatchEvent(event);

    // Call callback if specified
    if (config.onRowChange && typeof window[config.onRowChange] === 'function') {
      window[config.onRowChange](action, rowId, rowData, rows);
    }
  }

  // Create cell input HTML
  function createCellInput(column, value, rowId) {
    const inputId = componentId + '-' + rowId + '-' + column.key;
    const required = column.required ? 'required' : '';
    const placeholder = column.placeholder ? 'placeholder="' + column.placeholder + '"' : '';

    switch (column.type) {
      case 'number':
      case 'currency':
      case 'percent':
        const min = column.min !== undefined ? 'min="' + column.min + '"' : '';
        const max = column.max !== undefined ? 'max="' + column.max + '"' : '';
        const step = column.step !== undefined ? 'step="' + column.step + '"' : 'step="any"';
        const prefix = column.type === 'currency' ? '<span class="input-prefix">$</span>' : '';
        const suffix = column.type === 'percent' ? '<span class="input-suffix">%</span>' : '';
        return '<div class="input-wrapper ' + column.type + '">' +
               prefix +
               '<input type="number" id="' + inputId + '" data-field="' + column.key + '" value="' + (value || '') + '" ' +
               min + ' ' + max + ' ' + step + ' ' + required + ' ' + placeholder + ' class="cell-input input-' + column.type + '">' +
               suffix + '</div>';

      case 'select':
        let optionsHtml = '<option value="">Select...</option>';
        (column.options || []).forEach(function(opt) {
          const optValue = typeof opt === 'object' ? opt.value : opt;
          const optLabel = typeof opt === 'object' ? opt.label : opt;
          const selected = optValue == value ? 'selected' : '';
          optionsHtml += '<option value="' + optValue + '" ' + selected + '>' + optLabel + '</option>';
        });
        return '<select id="' + inputId + '" data-field="' + column.key + '" ' + required + ' class="cell-input input-select">' + optionsHtml + '</select>';

      case 'checkbox':
        return '<input type="checkbox" id="' + inputId + '" data-field="' + column.key + '" ' + (value ? 'checked' : '') + ' class="cell-input input-checkbox">';

      case 'date':
        return '<input type="date" id="' + inputId + '" data-field="' + column.key + '" value="' + (value || '') + '" ' + required + ' class="cell-input input-date">';

      default:
        return '<input type="text" id="' + inputId + '" data-field="' + column.key + '" value="' + (value || '').toString().replace(/"/g, '&quot;') + '" ' + required + ' ' + placeholder + ' class="cell-input input-text">';
    }
  }

  // Create row HTML
  function createRowHTML(row, index) {
    const rowId = row[config.rowIdField];
    let cells = '';

    config.columns.forEach(function(col) {
      const value = row[col.key] !== undefined ? row[col.key] : (col.default || '');
      cells += '<td class="cell-' + col.key + '" data-column="' + col.key + '">' + createCellInput(col, value, rowId) + '</td>';
    });

    let actions = '';
    if (config.allowReorder) {
      actions += '<button type="button" class="btn-row-action btn-move-up" data-action="move-up" title="Move Up" ' + (index === 0 ? 'disabled' : '') + '>↑</button>';
      actions += '<button type="button" class="btn-row-action btn-move-down" data-action="move-down" title="Move Down" ' + (index === rows.length - 1 ? 'disabled' : '') + '>↓</button>';
    }
    if (config.allowDelete) {
      actions += '<button type="button" class="btn-row-action btn-delete" data-action="delete" title="Delete">🗑️</button>';
    }

    if (actions) {
      cells += '<td class="cell-actions">' + actions + '</td>';
    }

    return '<tr class="data-row" data-row-id="' + rowId + '" data-row-index="' + index + '">' + cells + '</tr>';
  }

  // Rerender table
  function rerender() {
    if (rows.length === 0) {
      const colCount = config.columns.length + ((config.allowDelete || config.allowReorder) ? 1 : 0);
      tbody.innerHTML = '<tr class="empty-row"><td colspan="' + colCount + '">' + config.emptyMessage + '</td></tr>';
    } else {
      tbody.innerHTML = rows.map(function(row, idx) { return createRowHTML(row, idx); }).join('');
    }
    updateRowCount();
    attachRowListeners();
  }

  // Add new row
  function addRow(initialData) {
    if (rows.length >= config.maxRows) return;

    const newRow = { [config.rowIdField]: generateRowId() };
    config.columns.forEach(function(col) {
      newRow[col.key] = initialData && initialData[col.key] !== undefined ? initialData[col.key] : (col.default || '');
    });

    rows.push(newRow);
    rerender();
    emitChange('add', newRow[config.rowIdField], newRow);

    // Focus first input in new row
    const lastRow = tbody.lastElementChild;
    if (lastRow) {
      const firstInput = lastRow.querySelector('input, select');
      if (firstInput) firstInput.focus();
    }
  }

  // Delete row
  function deleteRow(rowId) {
    if (rows.length <= config.minRows) return;

    const index = rows.findIndex(function(r) { return r[config.rowIdField] === rowId; });
    if (index === -1) return;

    const deletedRow = rows[index];
    rows.splice(index, 1);
    rerender();
    emitChange('delete', rowId, deletedRow);
  }

  // Move row
  function moveRow(rowId, direction) {
    const index = rows.findIndex(function(r) { return r[config.rowIdField] === rowId; });
    if (index === -1) return;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= rows.length) return;

    const row = rows.splice(index, 1)[0];
    rows.splice(newIndex, 0, row);
    rerender();
    emitChange('reorder', rowId, { fromIndex: index, toIndex: newIndex });
  }

  // Handle cell value change
  function handleCellChange(rowId, field, value, inputType) {
    const row = rows.find(function(r) { return r[config.rowIdField] === rowId; });
    if (!row) return;

    // Convert value based on type
    const column = config.columns.find(function(c) { return c.key === field; });
    if (column) {
      if (column.type === 'number' || column.type === 'currency' || column.type === 'percent') {
        value = value === '' ? null : parseFloat(value);
      } else if (column.type === 'checkbox') {
        value = !!value;
      }
    }

    row[field] = value;
    emitChange('edit', rowId, row);
  }

  // Validate all rows
  function validateAll() {
    const errors = [];

    rows.forEach(function(row, index) {
      config.columns.forEach(function(col) {
        if (col.required && (row[col.key] === undefined || row[col.key] === '' || row[col.key] === null)) {
          errors.push('Row ' + (index + 1) + ': ' + col.label + ' is required');
        }
        if (col.min !== undefined && row[col.key] < col.min) {
          errors.push('Row ' + (index + 1) + ': ' + col.label + ' must be at least ' + col.min);
        }
        if (col.max !== undefined && row[col.key] > col.max) {
          errors.push('Row ' + (index + 1) + ': ' + col.label + ' must be at most ' + col.max);
        }
      });
    });

    if (errors.length > 0) {
      errorsEl.innerHTML = '<ul>' + errors.map(function(e) { return '<li>' + e + '</li>'; }).join('') + '</ul>';
      errorsEl.hidden = false;
    } else {
      errorsEl.hidden = true;
    }

    return { valid: errors.length === 0, errors: errors };
  }

  // Attach event listeners to rows
  function attachRowListeners() {
    // Input change listeners
    tbody.querySelectorAll('.cell-input').forEach(function(input) {
      input.addEventListener('change', function(e) {
        const rowId = e.target.closest('tr').dataset.rowId;
        const field = e.target.dataset.field;
        const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        handleCellChange(rowId, field, value, e.target.type);
      });

      // Also listen to blur for text/number inputs
      if (input.type === 'text' || input.type === 'number') {
        input.addEventListener('blur', function(e) {
          const rowId = e.target.closest('tr').dataset.rowId;
          const field = e.target.dataset.field;
          handleCellChange(rowId, field, e.target.value, e.target.type);
        });
      }
    });

    // Action button listeners
    tbody.querySelectorAll('.btn-row-action').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        const rowId = e.target.closest('tr').dataset.rowId;
        const action = e.target.dataset.action;

        switch (action) {
          case 'delete':
            if (config.confirmDelete) {
              if (confirm('Are you sure you want to delete this row?')) {
                deleteRow(rowId);
              }
            } else {
              deleteRow(rowId);
            }
            break;
          case 'move-up':
            moveRow(rowId, 'up');
            break;
          case 'move-down':
            moveRow(rowId, 'down');
            break;
        }
      });
    });
  }

  // Add row button listener
  addBtn.addEventListener('click', function() {
    addRow();
  });

  // Initial setup
  attachRowListeners();
  updateRowCount();
})();
`;
  }

  /**
   * Escape HTML special characters
   * @private
   */
  _escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Validate component
   * @returns {Object} { valid: boolean, errors: string[] }
   */
  validate() {
    const errors = [];
    if (!this.id) errors.push('Component ID is required');
    if (!this.config.columns || this.config.columns.length === 0) {
      errors.push('At least one column is required');
    }
    return { valid: errors.length === 0, errors };
  }
}

module.exports = EditableTableComponent;
