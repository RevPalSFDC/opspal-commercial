/**
 * Base Component for Web Visualizations
 *
 * Abstract base class that all visualization components extend.
 * Provides common interface for rendering, state management, and serialization.
 *
 * @module web-viz/components/BaseComponent
 * @version 1.0.0
 */

const crypto = require('crypto');

class BaseComponent {
  /**
   * Create a base component
   * @param {string} type - Component type (chart, table, map, kpi)
   * @param {Object} options - Component options
   */
  constructor(type, options = {}) {
    this.id = options.id || this._generateId(type);
    this.type = type;
    this.title = options.title || '';
    this.description = options.description || '';
    this.position = options.position || { row: 0, col: 0, colspan: 6, rowspan: 1 };
    this.created = new Date().toISOString();
    this.updated = this.created;

    this.data = null;
    this.config = options.config || {};
    this.filters = options.filters || [];
    this.state = {};

    // Data source tracking
    this.dataSource = null;
  }

  /**
   * Generate unique component ID
   * @private
   */
  _generateId(type) {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(3).toString('hex');
    return `${type}_${timestamp}_${random}`;
  }

  /**
   * Set component data
   * @param {Array|Object} data - Data to visualize
   * @param {Object} metadata - Data source metadata
   * @returns {BaseComponent} this for chaining
   */
  setData(data, metadata = {}) {
    this.data = data;
    this.dataSource = {
      type: metadata.type || 'unknown',
      query: metadata.query || null,
      fetchedAt: new Date().toISOString(),
      recordCount: Array.isArray(data) ? data.length : 1,
      ...metadata
    };
    this.updated = new Date().toISOString();
    return this;
  }

  /**
   * Update component data (partial update for conversational mode)
   * @param {Array|Object} data - New data
   * @returns {BaseComponent} this for chaining
   */
  updateData(data) {
    this.data = data;
    this.dataSource.fetchedAt = new Date().toISOString();
    this.dataSource.recordCount = Array.isArray(data) ? data.length : 1;
    this.updated = new Date().toISOString();
    return this;
  }

  /**
   * Apply filter to component
   * @param {Object} filter - Filter definition { field, op, value }
   * @returns {BaseComponent} this for chaining
   */
  addFilter(filter) {
    // Remove existing filter on same field
    this.filters = this.filters.filter(f => f.field !== filter.field);
    this.filters.push(filter);
    this.updated = new Date().toISOString();
    return this;
  }

  /**
   * Remove filter from component
   * @param {string} field - Field name to remove filter for
   * @returns {BaseComponent} this for chaining
   */
  removeFilter(field) {
    this.filters = this.filters.filter(f => f.field !== field);
    this.updated = new Date().toISOString();
    return this;
  }

  /**
   * Clear all filters
   * @returns {BaseComponent} this for chaining
   */
  clearFilters() {
    this.filters = [];
    this.updated = new Date().toISOString();
    return this;
  }

  /**
   * Update component configuration
   * @param {Object} config - Configuration updates (merged with existing)
   * @returns {BaseComponent} this for chaining
   */
  setConfig(config) {
    this.config = { ...this.config, ...config };
    this.updated = new Date().toISOString();
    return this;
  }

  /**
   * Set component position in layout
   * @param {Object} position - Position { row, col, colspan, rowspan }
   * @returns {BaseComponent} this for chaining
   */
  setPosition(position) {
    this.position = { ...this.position, ...position };
    this.updated = new Date().toISOString();
    return this;
  }

  /**
   * Generate HTML for this component
   * Must be implemented by subclasses
   * @returns {string} HTML string
   */
  generateHTML() {
    throw new Error('generateHTML() must be implemented by subclass');
  }

  /**
   * Generate CSS for this component
   * Can be overridden by subclasses for custom styles
   * @returns {string} CSS string
   */
  generateCSS() {
    const col = Number(this.position?.col);
    const row = Number(this.position?.row);
    const colspan = Number(this.position?.colspan || 6);
    const rowspan = Number(this.position?.rowspan || 1);
    const columnRule = col > 0 ? `grid-column: ${col} / span ${colspan};` : `grid-column: span ${colspan};`;
    const rowRule = row > 0 ? `grid-row: ${row} / span ${rowspan};` : `grid-row: span ${rowspan};`;

    return `
      .component-${this.id} {
        ${columnRule}
        ${rowRule}
      }
    `;
  }

  /**
   * Generate client-side JavaScript for this component
   * Must be implemented by subclasses that need interactivity
   * @returns {string} JavaScript string
   */
  generateJS() {
    return '';
  }

  /**
   * Get current component state
   * @returns {Object} Component state
   */
  getState() {
    return {
      id: this.id,
      type: this.type,
      title: this.title,
      description: this.description,
      position: this.position,
      config: this.config,
      filters: this.filters,
      dataSource: this.dataSource,
      data: this.data,
      created: this.created,
      updated: this.updated
    };
  }

  /**
   * Set component state (for restoration)
   * @param {Object} state - State to restore
   * @returns {BaseComponent} this for chaining
   */
  setState(state) {
    Object.assign(this, state);
    return this;
  }

  /**
   * Serialize component to JSON-compatible object
   * @returns {Object} Serialized component
   */
  serialize() {
    return {
      id: this.id,
      type: this.type,
      title: this.title,
      description: this.description,
      position: this.position,
      config: this.config,
      filters: this.filters,
      dataSource: this.dataSource,
      data: this.data,
      created: this.created,
      updated: this.updated
    };
  }

  /**
   * Create component from serialized state
   * @param {Object} json - Serialized component
   * @returns {BaseComponent} Restored component
   */
  static deserialize(json) {
    const component = new this(json.type, {
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

  /**
   * Validate component is ready to render
   * @returns {Object} { valid: boolean, errors: string[] }
   */
  validate() {
    const errors = [];

    if (!this.id) errors.push('Component ID is required');
    if (!this.type) errors.push('Component type is required');
    if (!this.data) errors.push('Component data is required');

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get summary string for this component
   * @returns {string} Summary
   */
  getSummary() {
    const recordCount = this.dataSource?.recordCount || 0;
    const filterCount = this.filters.length;
    return `[${this.id}] ${this.title || this.type} - ${recordCount} records${filterCount > 0 ? `, ${filterCount} filters` : ''}`;
  }
}

module.exports = BaseComponent;
