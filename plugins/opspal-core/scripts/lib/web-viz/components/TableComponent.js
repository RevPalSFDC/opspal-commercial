/**
 * Table Component
 *
 * Data table component with sorting, filtering, and pagination.
 * Pure HTML/CSS/JS implementation (no external dependencies).
 *
 * @module web-viz/components/TableComponent
 * @version 1.0.0
 */

const BaseComponent = require('./BaseComponent');

// Load defaults
let defaults;
try {
  defaults = require('../../../config/web-viz-defaults.json');
} catch {
  defaults = { table: {} };
}

class TableComponent extends BaseComponent {
  /**
   * Create a table component
   * @param {Object} options - Table options
   */
  constructor(options = {}) {
    super('table', options);

    // Table-specific configuration
    this.config = {
      columns: options.config?.columns || [],
      sortable: options.config?.sortable !== false,
      filterable: options.config?.filterable || false,
      pagination: options.config?.pagination !== false,
      pageSize: options.config?.pageSize || defaults.table?.pageSize || 25,
      striped: options.config?.striped !== false,
      hover: options.config?.hover !== false,
      compact: options.config?.compact || false,
      ...options.config
    };

    // Table state
    this.tableState = {
      sortColumn: null,
      sortDirection: 'asc',
      currentPage: 1,
      filterText: ''
    };
  }

  /**
   * Set table data
   * @param {Array} data - Array of row objects
   * @param {Object} metadata - Data source metadata
   * @returns {TableComponent}
   */
  setData(data, metadata = {}) {
    if (!Array.isArray(data)) {
      throw new Error('Table data must be an array');
    }

    this.data = data;

    // Auto-detect columns if not specified
    if (this.config.columns.length === 0 && data.length > 0) {
      this.config.columns = Object.keys(data[0]).map(key => ({
        field: key,
        header: this._formatHeader(key),
        sortable: this.config.sortable
      }));
    }

    this.config.columns = this.config.columns.map(col => ({
      ...col,
      type: col.type || col.format
    }));

    return super.setData(data, metadata);
  }

  /**
   * Format field name as human-readable Title Case header
   * Converts camelCase, snake_case, and kebab-case to "Title Case"
   * Preserves acronyms (QTD, API, etc.)
   * @private
   * @param {string} field - Field name to format
   * @returns {string} Human-readable title
   */
  _formatHeader(field) {
    return field
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
   * Get display header for a column
   * Supports both 'label' (from templates) and 'header' properties
   * Falls back to formatted field name
   * @private
   * @param {Object} col - Column configuration
   * @returns {string} Display header
   */
  _getColumnHeader(col) {
    return col.label || col.header || this._formatHeader(col.field);
  }

  /**
   * Get column style attribute
   * @private
   */
  _getColumnStyle(col) {
    const styles = [];
    if (col.width) styles.push(`width: ${col.width}`);
    if (col.align) styles.push(`text-align: ${col.align}`);
    return styles.length > 0 ? ` style="${styles.join('; ')}"` : '';
  }

  /**
   * Get highlight color for a row
   * @private
   */
  _getRowHighlightColor(row) {
    const highlight = this.config.rowHighlight;
    if (!highlight || !highlight.field) return null;
    const value = row[highlight.field];

    if (highlight.values && Object.prototype.hasOwnProperty.call(highlight.values, value)) {
      return highlight.values[value];
    }

    if (Array.isArray(highlight.thresholds)) {
      const numeric = parseFloat(value);
      if (Number.isNaN(numeric)) return null;
      const sorted = [...highlight.thresholds].sort((a, b) => a.value - b.value);
      let color = null;
      for (const threshold of sorted) {
        if (numeric >= threshold.value) {
          color = threshold.color;
        }
      }
      return color;
    }

    return null;
  }

  /**
   * Get visible columns
   * @returns {Array}
   */
  getColumns() {
    return this.config.columns.filter(col => col.visible !== false);
  }

  /**
   * Get formatted cell value
   * @param {*} value - Cell value
   * @param {Object} column - Column config
   * @returns {string}
   */
  formatCell(value, column) {
    if (value === null || value === undefined) {
      return '<span class="null-value">-</span>';
    }

    // Apply column formatter
    if (column.formatter) {
      return column.formatter(value);
    }

    // Type-based formatting
    switch (column.type) {
      case 'currency':
        return this._formatCurrency(value, column.decimals);
      case 'percent':
        return this._formatPercent(value, column.decimals);
      case 'number':
        return this._formatNumber(value, column.decimals);
      case 'date':
        return this._formatDate(value);
      case 'boolean':
        return value ? 'Yes' : 'No';
      default:
        return this._escapeHtml(String(value));
    }
  }

  /**
   * Format as currency
   * @private
   */
  _formatCurrency(value, decimals = 0) {
    const num = parseFloat(value);
    if (isNaN(num)) return value;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(num);
  }

  /**
   * Format as percentage
   * @private
   */
  _formatPercent(value, decimals = 1) {
    const num = parseFloat(value);
    if (isNaN(num)) return value;
    return num.toFixed(decimals) + '%';
  }

  /**
   * Format number
   * @private
   */
  _formatNumber(value, decimals = 0) {
    const num = parseFloat(value);
    if (isNaN(num)) return value;
    return num.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  /**
   * Format date
   * @private
   */
  _formatDate(value) {
    try {
      const date = new Date(value);
      return date.toLocaleDateString();
    } catch {
      return value;
    }
  }

  /**
   * Generate HTML for this table
   * @returns {string}
   */
  generateHTML() {
    const validation = this.validate();
    if (!validation.valid) {
      return `<div class="component-error">Table Error: ${validation.errors.join(', ')}</div>`;
    }

    const columns = this.getColumns();
    const pageSize = this.config.pageSize;
    const totalPages = Math.ceil(this.data.length / pageSize);

    return `
<div class="viz-component viz-table component-${this.id}" data-component-id="${this.id}" data-component-type="table">
  <div class="component-header">
    <h3 class="component-title">${this._escapeHtml(this.title)}</h3>
    ${this.description ? `<p class="component-description">${this._escapeHtml(this.description)}</p>` : ''}
  </div>

  ${this.config.filterable ? `
  <div class="table-filter">
    <input type="text" id="${this.id}-filter" placeholder="Filter..." class="filter-input" />
  </div>
  ` : ''}

  <div class="component-content">
    <div class="table-wrapper">
      <table id="${this.id}-table" class="${this.config.striped ? 'striped' : ''} ${this.config.compact ? 'compact' : ''}">
        <thead>
          <tr>
${columns.map((col, i) => `            <th data-column="${i}" data-field="${col.field}" class="${col.sortable !== false ? 'sortable' : ''}"${this._getColumnStyle(col)}>
              ${this._escapeHtml(this._getColumnHeader(col))}
              ${col.sortable !== false ? '<span class="sort-indicator"></span>' : ''}
            </th>`).join('\n')}
          </tr>
        </thead>
        <tbody>
${this._generateRows(columns, 0, pageSize)}
        </tbody>
      </table>
    </div>
  </div>

  ${this.config.pagination && this.data.length > pageSize ? `
  <div class="table-pagination">
    <div class="pagination-info">
      Showing <span id="${this.id}-start">1</span>-<span id="${this.id}-end">${Math.min(pageSize, this.data.length)}</span> of ${this.data.length}
    </div>
    <div class="pagination-controls">
      <button class="pagination-btn" data-action="first" title="First">&laquo;</button>
      <button class="pagination-btn" data-action="prev" title="Previous">&lsaquo;</button>
      <span class="pagination-page">Page <span id="${this.id}-page">1</span> of ${totalPages}</span>
      <button class="pagination-btn" data-action="next" title="Next">&rsaquo;</button>
      <button class="pagination-btn" data-action="last" title="Last">&raquo;</button>
    </div>
  </div>
  ` : ''}

  ${this.dataSource ? `
  <div class="component-footer">
    <span class="data-info">${this.dataSource.recordCount || 0} records</span>
    <span class="data-source">${this.dataSource.type || 'data'}</span>
  </div>
  ` : ''}
</div>`;
  }

  /**
   * Generate table rows HTML
   * @private
   */
  _generateRows(columns, start, count) {
    const rows = this.data.slice(start, start + count);
    return rows.map((row, i) => {
      const highlight = this._getRowHighlightColor(row);
      const rowStyle = highlight ? ` style="background-color: ${highlight};"` : '';
      return `          <tr data-row-index="${start + i}"${rowStyle}>
${columns.map(col => `            <td data-field="${col.field}"${this._getColumnStyle(col)}>${this.formatCell(row[col.field], col)}</td>`).join('\n')}
          </tr>`;
    }).join('\n');
  }

  /**
   * Generate CSS for this table
   * @returns {string}
   */
  generateCSS() {
    return `
${super.generateCSS()}

.component-${this.id} .table-wrapper {
  overflow-x: auto;
}

.component-${this.id} .table-filter {
  margin-bottom: var(--spacing-md);
}

.component-${this.id} .filter-input {
  width: 100%;
  max-width: 300px;
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--color-surface);
  border-radius: var(--radius-md);
  font-size: 13px;
}

.component-${this.id} .filter-input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.component-${this.id} .null-value {
  color: var(--color-text-muted);
  font-style: italic;
}
`;
  }

  /**
   * Generate JavaScript for this table
   * @returns {string}
   */
  generateJS() {
    const columns = this.getColumns();
    const pageSize = this.config.pageSize;
    const totalRows = this.data.length;

    return `
(function() {
  const tableId = '${this.id}';
  const tableEl = document.getElementById(tableId + '-table');
  const containerEl = document.querySelector('[data-component-id="' + tableId + '"]');
  if (!tableEl || !containerEl) return;

  // Table data and state
  let allData = ${JSON.stringify(this.data)};
  const columns = ${JSON.stringify(columns)};
  const pageSize = ${pageSize};
  const rowHighlight = ${JSON.stringify(this.config.rowHighlight || null)};
  let currentPage = 1;
  let sortColumn = null;
  let sortDirection = 'asc';
  let filteredData = [...allData];

  // Store reference
  window.VIZ_TABLES = window.VIZ_TABLES || {};
  window.VIZ_TABLES[tableId] = {
    data: allData,
    columns: columns,
    refresh: renderTable,
    setData: function(newData) {
      allData = Array.isArray(newData) ? newData : [];
      filteredData = [...allData];
      currentPage = 1;
      renderTable();
    },
    getData: function() {
      return allData;
    }
  };

  window.VIZ_COMPONENTS = window.VIZ_COMPONENTS || {};
  window.VIZ_COMPONENTS[tableId] = {
    type: 'table',
    setData: window.VIZ_TABLES[tableId].setData,
    getData: window.VIZ_TABLES[tableId].getData,
    refresh: window.VIZ_TABLES[tableId].refresh
  };

  // Sort functionality
  ${this.config.sortable ? `
  tableEl.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', function() {
      const colIndex = parseInt(this.dataset.column);
      const field = this.dataset.field;

      // Toggle direction or set new column
      if (sortColumn === colIndex) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        sortColumn = colIndex;
        sortDirection = 'asc';
      }

      // Update header styles
      tableEl.querySelectorAll('th').forEach(h => h.classList.remove('sorted', 'asc', 'desc'));
      this.classList.add('sorted', sortDirection);
      this.querySelector('.sort-indicator').textContent = sortDirection === 'asc' ? ' \\u25B2' : ' \\u25BC';

      // Sort data
      filteredData.sort((a, b) => {
        let aVal = a[field];
        let bVal = b[field];

        // Handle null/undefined
        if (aVal == null) return 1;
        if (bVal == null) return -1;

        // Numeric comparison
        const aNum = parseFloat(String(aVal).replace(/[^0-9.-]/g, ''));
        const bNum = parseFloat(String(bVal).replace(/[^0-9.-]/g, ''));
        if (!isNaN(aNum) && !isNaN(bNum)) {
          return sortDirection === 'asc' ? aNum - bNum : bNum - aNum;
        }

        // String comparison
        return sortDirection === 'asc'
          ? String(aVal).localeCompare(String(bVal))
          : String(bVal).localeCompare(String(aVal));
      });

      currentPage = 1;
      renderTable();
    });
  });
  ` : ''}

  // Filter functionality
  ${this.config.filterable ? `
  const filterInput = document.getElementById(tableId + '-filter');
  if (filterInput) {
    filterInput.addEventListener('input', function() {
      const filterText = this.value.toLowerCase();

      filteredData = allData.filter(row => {
        return columns.some(col => {
          const value = row[col.field];
          return value != null && String(value).toLowerCase().includes(filterText);
        });
      });

      currentPage = 1;
      renderTable();
    });
  }
  ` : ''}

  // Pagination functionality
  ${this.config.pagination && totalRows > pageSize ? `
  containerEl.querySelectorAll('.pagination-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const totalPages = Math.ceil(filteredData.length / pageSize);
      const action = this.dataset.action;

      switch (action) {
        case 'first': currentPage = 1; break;
        case 'prev': currentPage = Math.max(1, currentPage - 1); break;
        case 'next': currentPage = Math.min(totalPages, currentPage + 1); break;
        case 'last': currentPage = totalPages; break;
      }

      renderTable();
    });
  });
  ` : ''}

  // Render table
  function renderTable() {
    const tbody = tableEl.querySelector('tbody');
    const start = (currentPage - 1) * pageSize;
    const end = Math.min(start + pageSize, filteredData.length);
    const pageData = filteredData.slice(start, end);

    // Update rows
    tbody.innerHTML = pageData.map((row, i) => {
      const highlight = getRowHighlight(row);
      const rowStyle = highlight ? ' style="background-color: ' + highlight + ';"' : '';
      return '<tr data-row-index="' + (start + i) + '"' + rowStyle + '>' +
        columns.map(col => {
          const value = row[col.field];
          const formatted = formatCell(value, col);
          const style = getColumnStyle(col);
          return '<td data-field="' + col.field + '"' + style + '>' + formatted + '</td>';
        }).join('') +
        '</tr>';
    }).join('');

    // Update pagination info
    ${this.config.pagination && totalRows > pageSize ? `
    const totalPages = Math.ceil(filteredData.length / pageSize);
    document.getElementById(tableId + '-start').textContent = filteredData.length > 0 ? start + 1 : 0;
    document.getElementById(tableId + '-end').textContent = end;
    document.getElementById(tableId + '-page').textContent = currentPage;

    // Update button states
    containerEl.querySelector('[data-action="first"]').disabled = currentPage === 1;
    containerEl.querySelector('[data-action="prev"]').disabled = currentPage === 1;
    containerEl.querySelector('[data-action="next"]').disabled = currentPage >= totalPages;
    containerEl.querySelector('[data-action="last"]').disabled = currentPage >= totalPages;
    ` : ''}
  }

  // Cell formatter
  function formatCell(value, column) {
    if (value == null) return '<span class="null-value">-</span>';

    switch (column.type) {
      case 'currency':
        const num = parseFloat(value);
        return isNaN(num)
          ? value
          : num.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: column.decimals || 0, maximumFractionDigits: column.decimals || 0 });
      case 'percent':
        return parseFloat(value).toFixed(column.decimals || 1) + '%';
      case 'number':
        return parseFloat(value).toLocaleString(undefined, { minimumFractionDigits: column.decimals || 0, maximumFractionDigits: column.decimals || 0 });
      case 'date':
        try { return new Date(value).toLocaleDateString(); } catch { return value; }
      case 'boolean':
        return value ? 'Yes' : 'No';
      default:
        return escapeHtml(String(value));
    }
  }

  function getColumnStyle(col) {
    const styles = [];
    if (col.width) styles.push('width: ' + col.width);
    if (col.align) styles.push('text-align: ' + col.align);
    return styles.length > 0 ? ' style="' + styles.join('; ') + '"' : '';
  }

  function getRowHighlight(row) {
    if (!rowHighlight || !rowHighlight.field) return null;
    const value = row[rowHighlight.field];

    if (rowHighlight.values && Object.prototype.hasOwnProperty.call(rowHighlight.values, value)) {
      return rowHighlight.values[value];
    }

    if (Array.isArray(rowHighlight.thresholds)) {
      const numeric = parseFloat(value);
      if (isNaN(numeric)) return null;
      const sorted = rowHighlight.thresholds.slice().sort((a, b) => a.value - b.value);
      let color = null;
      sorted.forEach(threshold => {
        if (numeric >= threshold.value) {
          color = threshold.color;
        }
      });
      return color;
    }

    return null;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Initial render
  renderTable();
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
   * Validate table is ready to render
   * @returns {Object}
   */
  validate() {
    const base = super.validate();

    if (this.data && !Array.isArray(this.data)) {
      base.errors.push('Table data must be an array');
      base.valid = false;
    }

    return base;
  }

  /**
   * Create from serialized state
   * @param {Object} json - Serialized table
   * @returns {TableComponent}
   */
  static deserialize(json) {
    const component = new TableComponent({
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

module.exports = TableComponent;
