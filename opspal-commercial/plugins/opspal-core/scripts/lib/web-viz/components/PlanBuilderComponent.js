/**
 * Plan Builder Component
 *
 * Orchestrates the compensation plan builder interface with:
 * - File upload for plan imports (JSON/CSV/XLSX)
 * - Editable tables for tiers, roles, SPIFs, clawbacks
 * - Live preview with charts
 * - Save/load via localStorage (browser-only mode)
 * - Export to JSON/CSV/XLSX
 *
 * @module web-viz/components/PlanBuilderComponent
 * @version 1.0.0
 */

const BaseComponent = require('./BaseComponent');

class PlanBuilderComponent extends BaseComponent {
  /**
   * Create a plan builder component
   * @param {string} id - Component ID
   * @param {Object} options - Component options
   */
  constructor(id, options = {}) {
    super('planBuilder', { id, ...options });

    if (this.position.colspan == null) {
      this.position.colspan = 12;
    }

    this.config = {
      // Storage configuration
      localStoragePrefix: options.localStoragePrefix || 'compPlan_',
      draftKey: options.draftKey || 'compPlanDraft',
      autoSave: options.autoSave !== false,
      autoSaveDebounce: options.autoSaveDebounce || 1000,

      // UI configuration
      showPreview: options.showPreview !== false,
      showImport: options.showImport !== false,
      showExport: options.showExport !== false,
      collapsibleSections: options.collapsibleSections !== false,

      // Default plan structure
      defaultPlan: options.defaultPlan || {
        id: '',
        name: '',
        version: '1.0.0',
        status: 'draft',
        effectivePeriod: {
          fiscalYear: new Date().getFullYear() + 1,
          startDate: '',
          endDate: ''
        },
        tiers: [],
        roles: [],
        spifs: [],
        clawbacks: [],
        cap: { enabled: false, maxMultiplierOfOTE: 2.0 }
      },

      // Table column definitions
      tierColumns: options.tierColumns || [
        { key: 'name', label: 'Tier Name', type: 'text', required: true, width: '25%' },
        { key: 'minAttainment', label: 'Min %', type: 'percent', required: true, min: 0, max: 999, width: '15%' },
        { key: 'maxAttainment', label: 'Max %', type: 'percent', required: true, min: 0, max: 999, width: '15%' },
        { key: 'rate', label: 'Rate %', type: 'percent', required: true, min: 0, max: 100, width: '15%' },
        { key: 'description', label: 'Description', type: 'text', width: '30%' }
      ],

      roleColumns: options.roleColumns || [
        { key: 'roleId', label: 'Role ID', type: 'text', required: true, width: '15%' },
        { key: 'roleName', label: 'Role Name', type: 'text', required: true, width: '20%' },
        { key: 'ote', label: 'OTE', type: 'currency', required: true, min: 0, width: '15%' },
        { key: 'baseSalary', label: 'Base', type: 'currency', min: 0, width: '15%' },
        { key: 'targetCommission', label: 'Target Comm.', type: 'currency', min: 0, width: '15%' },
        { key: 'quotaAmount', label: 'Quota', type: 'currency', required: true, min: 0, width: '20%' }
      ],

      spifColumns: options.spifColumns || [
        { key: 'name', label: 'SPIF Name', type: 'text', required: true, width: '25%' },
        { key: 'bonusAmount', label: 'Bonus', type: 'currency', min: 0, width: '15%' },
        { key: 'bonusPercent', label: 'Bonus %', type: 'percent', min: 0, max: 100, width: '12%' },
        { key: 'startDate', label: 'Start Date', type: 'date', required: true, width: '16%' },
        { key: 'endDate', label: 'End Date', type: 'date', required: true, width: '16%' },
        { key: 'eligibilityCriteria', label: 'Criteria', type: 'text', width: '16%' }
      ],

      clawbackColumns: options.clawbackColumns || [
        { key: 'name', label: 'Rule Name', type: 'text', required: true, width: '30%' },
        { key: 'clawbackPeriodDays', label: 'Period (Days)', type: 'number', required: true, min: 0, max: 365, width: '20%' },
        { key: 'clawbackPercent', label: 'Clawback %', type: 'percent', required: true, min: 0, max: 100, width: '20%' },
        { key: 'triggerCondition', label: 'Trigger', type: 'text', width: '30%' }
      ],

      // Chart configuration for preview
      chartColors: options.chartColors || {
        primary: '#5F3B8C',
        secondary: '#3E4A61',
        accent: '#E99560',
        background: '#EAE4DC'
      },

      // Callbacks
      onPlanChange: options.onPlanChange || null,
      onSave: options.onSave || null,
      onExport: options.onExport || null,

      ...options.config
    };

    // Initialize with default or provided plan
    this.data = options.plan || { ...this.config.defaultPlan };
  }

  /**
   * Generate component HTML
   * @returns {string}
   */
  generateHTML() {
    const cfg = this.config;
    const plan = this.data;

    return `
<div class="viz-component plan-builder-component component-${this.id}" id="${this.id}" data-component-id="${this.id}" data-component-type="planBuilder">
  <!-- Header with controls -->
  <div class="plan-builder-header">
    <div class="plan-builder-title">
      <h2>Compensation Plan Builder</h2>
      <span class="plan-status" data-status="${plan.status || 'draft'}">${this._capitalizeFirst(plan.status || 'draft')}</span>
    </div>
    <div class="plan-builder-controls">
      <select id="${this.id}-plan-selector" class="plan-selector" title="Select Plan">
        <option value="">New Plan</option>
      </select>
      ${cfg.showImport ? `
      <button class="btn-import" id="${this.id}-btn-import" title="Import Plan">
        <span class="btn-icon">📤</span> Import
      </button>
      ` : ''}
      ${cfg.showExport ? `
      <div class="export-dropdown">
        <button class="btn-export" id="${this.id}-btn-export" title="Export Plan">
          <span class="btn-icon">📥</span> Export <span class="dropdown-arrow">▼</span>
        </button>
        <div class="export-menu" id="${this.id}-export-menu">
          <button data-format="json">Export as JSON</button>
          <button data-format="csv">Export as CSV</button>
          <button data-format="xlsx">Export as Excel</button>
        </div>
      </div>
      ` : ''}
      <button class="btn-save" id="${this.id}-btn-save" title="Save Plan">
        <span class="btn-icon">💾</span> Save
      </button>
    </div>
  </div>

  <!-- Import modal -->
  <div class="import-modal" id="${this.id}-import-modal" hidden>
    <div class="modal-overlay"></div>
    <div class="modal-content">
      <div class="modal-header">
        <h3>Import Compensation Plan</h3>
        <button class="modal-close" id="${this.id}-modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="upload-dropzone" id="${this.id}-dropzone">
          <span class="upload-icon">📄</span>
          <p>Drag & drop a compensation plan file here</p>
          <p class="upload-hint">Supported formats: JSON, CSV, XLSX (max 5MB)</p>
          <input type="file" id="${this.id}-file-input" accept=".json,.csv,.xlsx" hidden>
          <button class="btn-browse" id="${this.id}-btn-browse">Browse Files</button>
        </div>
        <div class="upload-preview" id="${this.id}-upload-preview" hidden>
          <div class="file-info">
            <span class="file-icon">📄</span>
            <span class="file-name"></span>
            <span class="file-size"></span>
            <button class="btn-remove-file" title="Remove">✕</button>
          </div>
          <div class="import-preview-data"></div>
        </div>
        <div class="upload-error" id="${this.id}-upload-error" hidden></div>
      </div>
      <div class="modal-footer">
        <button class="btn-cancel" id="${this.id}-btn-cancel">Cancel</button>
        <button class="btn-confirm-import" id="${this.id}-btn-confirm-import" disabled>Import</button>
      </div>
    </div>
  </div>

  <!-- Main content: 2-column layout -->
  <div class="plan-builder-content">
    <!-- Edit Panel (Left) -->
    <div class="edit-panel">
      <!-- Plan Details Section -->
      <div class="section ${cfg.collapsibleSections ? 'collapsible' : ''}" data-section="details">
        <div class="section-header">
          <h3><span class="section-icon">📋</span> Plan Details</h3>
          ${cfg.collapsibleSections ? '<span class="collapse-toggle">▼</span>' : ''}
        </div>
        <div class="section-content">
          <div class="form-row">
            <div class="form-group">
              <label for="${this.id}-plan-id">Plan ID</label>
              <input type="text" id="${this.id}-plan-id" value="${plan.id || ''}" placeholder="e.g., fy26-ae-standard">
            </div>
            <div class="form-group">
              <label for="${this.id}-plan-name">Plan Name</label>
              <input type="text" id="${this.id}-plan-name" value="${plan.name || ''}" placeholder="e.g., FY26 AE Standard Plan">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="${this.id}-plan-version">Version</label>
              <input type="text" id="${this.id}-plan-version" value="${plan.version || '1.0.0'}" placeholder="1.0.0">
            </div>
            <div class="form-group">
              <label for="${this.id}-plan-status">Status</label>
              <select id="${this.id}-plan-status">
                <option value="draft" ${plan.status === 'draft' ? 'selected' : ''}>Draft</option>
                <option value="active" ${plan.status === 'active' ? 'selected' : ''}>Active</option>
                <option value="archived" ${plan.status === 'archived' ? 'selected' : ''}>Archived</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="${this.id}-fiscal-year">Fiscal Year</label>
              <input type="number" id="${this.id}-fiscal-year" value="${plan.effectivePeriod?.fiscalYear || new Date().getFullYear() + 1}" min="2020" max="2050">
            </div>
            <div class="form-group">
              <label for="${this.id}-start-date">Start Date</label>
              <input type="date" id="${this.id}-start-date" value="${plan.effectivePeriod?.startDate || ''}">
            </div>
            <div class="form-group">
              <label for="${this.id}-end-date">End Date</label>
              <input type="date" id="${this.id}-end-date" value="${plan.effectivePeriod?.endDate || ''}">
            </div>
          </div>
        </div>
      </div>

      <!-- Commission Tiers Section -->
      <div class="section ${cfg.collapsibleSections ? 'collapsible' : ''}" data-section="tiers">
        <div class="section-header">
          <h3><span class="section-icon">📊</span> Commission Tiers</h3>
          ${cfg.collapsibleSections ? '<span class="collapse-toggle">▼</span>' : ''}
        </div>
        <div class="section-content">
          <div class="editable-table" id="${this.id}-tiers-table"></div>
        </div>
      </div>

      <!-- Roles & Quotas Section -->
      <div class="section ${cfg.collapsibleSections ? 'collapsible' : ''}" data-section="roles">
        <div class="section-header">
          <h3><span class="section-icon">👥</span> Roles & Quotas</h3>
          ${cfg.collapsibleSections ? '<span class="collapse-toggle">▼</span>' : ''}
        </div>
        <div class="section-content">
          <div class="editable-table" id="${this.id}-roles-table"></div>
        </div>
      </div>

      <!-- SPIFs Section -->
      <div class="section ${cfg.collapsibleSections ? 'collapsible' : ''}" data-section="spifs">
        <div class="section-header">
          <h3><span class="section-icon">🎯</span> SPIFs</h3>
          ${cfg.collapsibleSections ? '<span class="collapse-toggle">▼</span>' : ''}
        </div>
        <div class="section-content">
          <div class="editable-table" id="${this.id}-spifs-table"></div>
        </div>
      </div>

      <!-- Clawbacks Section -->
      <div class="section ${cfg.collapsibleSections ? 'collapsible' : ''}" data-section="clawbacks">
        <div class="section-header">
          <h3><span class="section-icon">⚠️</span> Clawbacks</h3>
          ${cfg.collapsibleSections ? '<span class="collapse-toggle">▼</span>' : ''}
        </div>
        <div class="section-content">
          <div class="editable-table" id="${this.id}-clawbacks-table"></div>
        </div>
      </div>

      <!-- Cap Configuration Section -->
      <div class="section ${cfg.collapsibleSections ? 'collapsible' : ''}" data-section="cap">
        <div class="section-header">
          <h3><span class="section-icon">🔒</span> Commission Cap</h3>
          ${cfg.collapsibleSections ? '<span class="collapse-toggle">▼</span>' : ''}
        </div>
        <div class="section-content">
          <div class="form-row">
            <div class="form-group checkbox-group">
              <label>
                <input type="checkbox" id="${this.id}-cap-enabled" ${plan.cap?.enabled ? 'checked' : ''}>
                Enable Commission Cap
              </label>
            </div>
          </div>
          <div class="cap-settings" id="${this.id}-cap-settings" ${!plan.cap?.enabled ? 'hidden' : ''}>
            <div class="form-row">
              <div class="form-group">
                <label for="${this.id}-cap-multiplier">Max Multiplier of OTE</label>
                <input type="number" id="${this.id}-cap-multiplier" value="${plan.cap?.maxMultiplierOfOTE || 2}" step="0.1" min="1" max="10">
              </div>
              <div class="form-group">
                <label for="${this.id}-cap-absolute">Or Absolute Max ($)</label>
                <input type="number" id="${this.id}-cap-absolute" value="${plan.cap?.absoluteMax || ''}" min="0" placeholder="Optional">
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Preview Panel (Right) -->
    ${cfg.showPreview ? `
    <div class="preview-panel">
      <div class="preview-header">
        <h3><span class="preview-icon">👁️</span> Live Preview</h3>
        <span class="preview-hint">Updates as you edit</span>
      </div>
      <div class="preview-content">
        <!-- Tier Rates Chart -->
        <div class="preview-card">
          <h4>Commission Rates by Tier</h4>
          <div class="chart-container">
            <canvas id="${this.id}-chart-tiers"></canvas>
          </div>
        </div>

        <!-- Pay Mix Chart -->
        <div class="preview-card">
          <h4>Pay Mix by Role</h4>
          <div class="chart-container">
            <canvas id="${this.id}-chart-paymix"></canvas>
          </div>
        </div>

        <!-- KPI Summary -->
        <div class="preview-kpis">
          <div class="preview-kpi">
            <span class="kpi-value" id="${this.id}-kpi-roles">${plan.roles?.length || 0}</span>
            <span class="kpi-label">Roles</span>
          </div>
          <div class="preview-kpi">
            <span class="kpi-value" id="${this.id}-kpi-tiers">${plan.tiers?.length || 0}</span>
            <span class="kpi-label">Tiers</span>
          </div>
          <div class="preview-kpi">
            <span class="kpi-value" id="${this.id}-kpi-spifs">${plan.spifs?.length || 0}</span>
            <span class="kpi-label">SPIFs</span>
          </div>
          <div class="preview-kpi">
            <span class="kpi-value" id="${this.id}-kpi-clawbacks">${plan.clawbacks?.length || 0}</span>
            <span class="kpi-label">Clawbacks</span>
          </div>
        </div>

        <!-- Validation Status -->
        <div class="validation-panel" id="${this.id}-validation-panel">
          <h4>Validation</h4>
          <div class="validation-messages" id="${this.id}-validation-messages">
            <p class="validation-pending">Edit the plan to see validation results</p>
          </div>
        </div>
      </div>
    </div>
    ` : ''}
  </div>

  <!-- Auto-save indicator -->
  <div class="auto-save-indicator" id="${this.id}-autosave" hidden>
    <span class="save-icon">💾</span>
    <span class="save-text">Draft saved</span>
  </div>
</div>
    `;
  }

  /**
   * Generate component CSS
   * @returns {string}
   */
  generateCSS() {
    const colors = this.config.chartColors;

    return `
${super.generateCSS()}

/* Plan Builder Component Styles */
.plan-builder-component {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  background: #f8f9fa;
  border-radius: 8px;
  overflow: hidden;
}

/* Header */
.plan-builder-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: ${colors.primary};
  color: white;
}

.plan-builder-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.plan-builder-title h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.plan-status {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
}

.plan-status[data-status="draft"] {
  background: rgba(255, 255, 255, 0.2);
}

.plan-status[data-status="active"] {
  background: #28a745;
}

.plan-status[data-status="archived"] {
  background: #6c757d;
}

.plan-builder-controls {
  display: flex;
  gap: 12px;
  align-items: center;
}

.plan-selector {
  padding: 8px 12px;
  border: none;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.9);
  color: ${colors.secondary};
  font-size: 14px;
  cursor: pointer;
}

.btn-import, .btn-export, .btn-save {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-import {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.btn-import:hover {
  background: rgba(255, 255, 255, 0.3);
}

.btn-export {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.btn-export:hover {
  background: rgba(255, 255, 255, 0.3);
}

.btn-save {
  background: ${colors.accent};
  color: white;
}

.btn-save:hover {
  opacity: 0.9;
}

.btn-icon {
  font-size: 16px;
}

/* Export dropdown */
.export-dropdown {
  position: relative;
}

.export-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  background: white;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  display: none;
  z-index: 100;
  overflow: hidden;
}

.export-dropdown:hover .export-menu,
.export-menu:hover {
  display: block;
}

.export-menu button {
  display: block;
  width: 100%;
  padding: 10px 16px;
  border: none;
  background: none;
  text-align: left;
  font-size: 14px;
  color: ${colors.secondary};
  cursor: pointer;
}

.export-menu button:hover {
  background: #f5f5f5;
}

.dropdown-arrow {
  font-size: 10px;
  margin-left: 4px;
}

/* Modal */
.import-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.import-modal[hidden] {
  display: none;
}

.modal-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
}

.modal-content {
  position: relative;
  width: 90%;
  max-width: 560px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #eee;
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
  color: ${colors.secondary};
}

.modal-close {
  width: 32px;
  height: 32px;
  border: none;
  background: none;
  font-size: 20px;
  color: #999;
  cursor: pointer;
  border-radius: 6px;
}

.modal-close:hover {
  background: #f5f5f5;
  color: #666;
}

.modal-body {
  padding: 20px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid #eee;
}

.btn-cancel, .btn-confirm-import {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.btn-cancel {
  background: #f5f5f5;
  color: #666;
}

.btn-cancel:hover {
  background: #eee;
}

.btn-confirm-import {
  background: ${colors.primary};
  color: white;
}

.btn-confirm-import:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-confirm-import:not(:disabled):hover {
  opacity: 0.9;
}

/* Upload dropzone in modal */
.upload-dropzone {
  border: 2px dashed #ddd;
  border-radius: 12px;
  padding: 40px 20px;
  text-align: center;
  transition: all 0.2s;
}

.upload-dropzone.drag-over {
  border-color: ${colors.primary};
  background: rgba(95, 59, 140, 0.05);
}

.upload-dropzone .upload-icon {
  font-size: 48px;
  display: block;
  margin-bottom: 12px;
}

.upload-dropzone p {
  margin: 8px 0;
  color: #666;
}

.upload-dropzone .upload-hint {
  font-size: 13px;
  color: #999;
}

.btn-browse {
  margin-top: 16px;
  padding: 10px 24px;
  border: 1px solid ${colors.primary};
  background: white;
  color: ${colors.primary};
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.btn-browse:hover {
  background: ${colors.primary};
  color: white;
}

.upload-preview {
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
}

.file-info {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.file-icon {
  font-size: 24px;
}

.file-name {
  flex: 1;
  font-weight: 500;
  color: ${colors.secondary};
}

.file-size {
  font-size: 13px;
  color: #999;
}

.btn-remove-file {
  width: 28px;
  height: 28px;
  border: none;
  background: #eee;
  border-radius: 4px;
  cursor: pointer;
}

.btn-remove-file:hover {
  background: #ddd;
}

.import-preview-data {
  font-size: 13px;
  color: #666;
  padding: 12px;
  background: white;
  border-radius: 6px;
  max-height: 200px;
  overflow-y: auto;
}

.upload-error {
  padding: 12px 16px;
  background: #fff5f5;
  border: 1px solid #fed7d7;
  border-radius: 6px;
  color: #c53030;
  font-size: 14px;
  margin-top: 12px;
}

/* Main content */
.plan-builder-content {
  display: grid;
  grid-template-columns: 1fr 400px;
  gap: 0;
  min-height: 600px;
}

@media (max-width: 1024px) {
  .plan-builder-content {
    grid-template-columns: 1fr;
  }
  .preview-panel {
    display: none;
  }
}

/* Edit panel */
.edit-panel {
  padding: 20px;
  overflow-y: auto;
  max-height: calc(100vh - 200px);
}

/* Sections */
.section {
  background: white;
  border-radius: 8px;
  margin-bottom: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid #eee;
  cursor: pointer;
}

.section.collapsible .section-header:hover {
  background: #fafafa;
}

.section-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: ${colors.secondary};
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-icon {
  font-size: 16px;
}

.collapse-toggle {
  font-size: 12px;
  color: #999;
  transition: transform 0.2s;
}

.section.collapsed .collapse-toggle {
  transform: rotate(-90deg);
}

.section.collapsed .section-content {
  display: none;
}

.section-content {
  padding: 16px;
}

/* Form elements */
.form-row {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}

.form-row:last-child {
  margin-bottom: 0;
}

.form-group {
  flex: 1;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 500;
  color: #555;
}

.form-group input[type="text"],
.form-group input[type="number"],
.form-group input[type="date"],
.form-group select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  color: ${colors.secondary};
  transition: border-color 0.2s;
}

.form-group input:focus,
.form-group select:focus {
  outline: none;
  border-color: ${colors.primary};
}

.checkbox-group label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  cursor: pointer;
}

.checkbox-group input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: ${colors.primary};
}

.cap-settings[hidden] {
  display: none;
}

/* Editable tables container */
.editable-table {
  overflow-x: auto;
}

/* Preview panel */
.preview-panel {
  background: white;
  border-left: 1px solid #eee;
  display: flex;
  flex-direction: column;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid #eee;
}

.preview-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: ${colors.secondary};
  display: flex;
  align-items: center;
  gap: 8px;
}

.preview-icon {
  font-size: 16px;
}

.preview-hint {
  font-size: 12px;
  color: #999;
}

.preview-content {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
}

.preview-card {
  background: #fafafa;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}

.preview-card h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 500;
  color: #666;
}

.preview-card canvas {
  width: 100% !important;
  max-height: 200px !important;
}

.chart-container {
  position: relative;
  height: 200px;
  width: 100%;
}

/* Preview KPIs */
.preview-kpis {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.preview-kpi {
  background: #fafafa;
  border-radius: 8px;
  padding: 16px;
  text-align: center;
}

.preview-kpi .kpi-value {
  display: block;
  font-size: 28px;
  font-weight: 700;
  color: ${colors.primary};
}

.preview-kpi .kpi-label {
  font-size: 12px;
  color: #999;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Validation panel */
.validation-panel {
  background: #fafafa;
  border-radius: 8px;
  padding: 16px;
}

.validation-panel h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 500;
  color: #666;
}

.validation-messages {
  font-size: 13px;
}

.validation-pending {
  color: #999;
  font-style: italic;
}

.validation-error {
  color: #c53030;
  margin: 6px 0;
  padding-left: 20px;
  position: relative;
}

.validation-error::before {
  content: '❌';
  position: absolute;
  left: 0;
  font-size: 12px;
}

.validation-warning {
  color: #c27803;
  margin: 6px 0;
  padding-left: 20px;
  position: relative;
}

.validation-warning::before {
  content: '⚠️';
  position: absolute;
  left: 0;
  font-size: 12px;
}

.validation-success {
  color: #2f855a;
  margin: 6px 0;
  padding-left: 20px;
  position: relative;
}

.validation-success::before {
  content: '✅';
  position: absolute;
  left: 0;
  font-size: 12px;
}

/* Auto-save indicator */
.auto-save-indicator {
  position: fixed;
  bottom: 20px;
  right: 20px;
  background: ${colors.secondary};
  color: white;
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  animation: fadeIn 0.3s, fadeOut 0.3s 2s forwards;
}

.auto-save-indicator[hidden] {
  display: none;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes fadeOut {
  from { opacity: 1; }
  to { opacity: 0; }
}
    `;
  }

  /**
   * Generate client-side JavaScript
   * @returns {string}
   */
  generateJS() {
    const cfg = this.config;
    const plan = this.data;

    return `
(function() {
  // Configuration
  const componentId = '${this.id}';
  const config = ${JSON.stringify(cfg)};
  const initialPlan = ${JSON.stringify(plan)};

  // Global state
  window.VIZ_PLAN_BUILDERS = window.VIZ_PLAN_BUILDERS || {};

  // Initialize state
  const state = {
    plan: JSON.parse(JSON.stringify(initialPlan)),
    pendingFile: null,
    isDirty: false,
    autoSaveTimer: null,
    charts: {}
  };

  window.VIZ_PLAN_BUILDERS[componentId] = state;

  // DOM elements
  const component = document.getElementById(componentId);
  const planSelector = document.getElementById(componentId + '-plan-selector');
  const importModal = document.getElementById(componentId + '-import-modal');
  const dropzone = document.getElementById(componentId + '-dropzone');
  const fileInput = document.getElementById(componentId + '-file-input');
  const uploadPreview = document.getElementById(componentId + '-upload-preview');
  const uploadError = document.getElementById(componentId + '-upload-error');
  const confirmImportBtn = document.getElementById(componentId + '-btn-confirm-import');
  const autosaveIndicator = document.getElementById(componentId + '-autosave');

  // ========================================
  // Plan State Management
  // ========================================

  function getCurrentPlan() {
    return JSON.parse(JSON.stringify(state.plan));
  }

  function updatePlan(updates) {
    state.plan = { ...state.plan, ...updates };
    state.isDirty = true;
    updatePreview();
    triggerAutoSave();

    if (config.onPlanChange && typeof window[config.onPlanChange] === 'function') {
      window[config.onPlanChange](getCurrentPlan());
    }
  }

  function updatePlanField(path, value) {
    const parts = path.split('.');
    let obj = state.plan;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!obj[parts[i]]) obj[parts[i]] = {};
      obj = obj[parts[i]];
    }
    obj[parts[parts.length - 1]] = value;
    state.isDirty = true;
    updatePreview();
    triggerAutoSave();
  }

  function loadPlanIntoForm(plan) {
    state.plan = JSON.parse(JSON.stringify(plan));

    // Update form fields
    document.getElementById(componentId + '-plan-id').value = plan.id || '';
    document.getElementById(componentId + '-plan-name').value = plan.name || '';
    document.getElementById(componentId + '-plan-version').value = plan.version || '1.0.0';
    document.getElementById(componentId + '-plan-status').value = plan.status || 'draft';
    document.getElementById(componentId + '-fiscal-year').value = plan.effectivePeriod?.fiscalYear || '';
    document.getElementById(componentId + '-start-date').value = plan.effectivePeriod?.startDate || '';
    document.getElementById(componentId + '-end-date').value = plan.effectivePeriod?.endDate || '';

    // Update cap settings
    const capEnabled = document.getElementById(componentId + '-cap-enabled');
    const capSettings = document.getElementById(componentId + '-cap-settings');
    capEnabled.checked = plan.cap?.enabled || false;
    capSettings.hidden = !capEnabled.checked;
    document.getElementById(componentId + '-cap-multiplier').value = plan.cap?.maxMultiplierOfOTE || 2;
    document.getElementById(componentId + '-cap-absolute').value = plan.cap?.absoluteMax || '';

    // Update editable tables
    if (window.VIZ_EDITABLE_TABLES) {
      const tiersTable = window.VIZ_EDITABLE_TABLES[componentId + '-tiers-table'];
      const rolesTable = window.VIZ_EDITABLE_TABLES[componentId + '-roles-table'];
      const spifsTable = window.VIZ_EDITABLE_TABLES[componentId + '-spifs-table'];
      const clawbacksTable = window.VIZ_EDITABLE_TABLES[componentId + '-clawbacks-table'];

      if (tiersTable) tiersTable.setRows(plan.tiers || []);
      if (rolesTable) rolesTable.setRows(plan.roles || []);
      if (spifsTable) spifsTable.setRows(plan.spifs || []);
      if (clawbacksTable) clawbacksTable.setRows(plan.clawbacks || []);
    }

    // Update status badge
    const statusBadge = component.querySelector('.plan-status');
    if (statusBadge) {
      statusBadge.dataset.status = plan.status || 'draft';
      statusBadge.textContent = (plan.status || 'draft').charAt(0).toUpperCase() + (plan.status || 'draft').slice(1);
    }

    state.isDirty = false;
    updatePreview();
  }

  // ========================================
  // File Import/Export
  // ========================================

  function parseFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      const ext = file.name.split('.').pop().toLowerCase();

      reader.onload = function(e) {
        try {
          let result;

          if (ext === 'json') {
            result = JSON.parse(e.target.result);
          } else if (ext === 'csv') {
            result = parseCSV(e.target.result);
          } else if (ext === 'xlsx') {
            if (typeof XLSX === 'undefined') {
              reject(new Error('Excel support not loaded. Include xlsx.js library.'));
              return;
            }
            const workbook = XLSX.read(e.target.result, { type: 'array' });
            result = parseExcel(workbook);
          } else {
            reject(new Error('Unsupported file format: ' + ext));
            return;
          }

          resolve({ data: result, format: ext, filename: file.name });
        } catch (err) {
          reject(err);
        }
      };

      reader.onerror = () => reject(new Error('Failed to read file'));

      if (ext === 'xlsx') {
        reader.readAsArrayBuffer(file);
      } else {
        reader.readAsText(file);
      }
    });
  }

  function parseCSV(content) {
    const lines = content.trim().split(/\\r?\\n/);
    if (lines.length < 2) {
      return { tiers: [] };
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const row = {};
      headers.forEach((h, idx) => {
        let val = values[idx] || '';
        const num = parseFloat(val);
        if (!isNaN(num) && val !== '') val = num;
        row[h] = val;
      });
      rows.push(row);
    }

    // Detect if this is tiers, roles, etc. based on headers
    if (headers.includes('minattainment') || headers.includes('maxattainment') || headers.includes('rate')) {
      return {
        tiers: rows.map(r => ({
          name: r.name || r.tiername || '',
          minAttainment: r.minattainment || r.min || 0,
          maxAttainment: r.maxattainment || r.max || 100,
          rate: r.rate || r.commissionrate || 0,
          description: r.description || ''
        }))
      };
    } else if (headers.includes('ote') || headers.includes('quotaamount') || headers.includes('basesalary')) {
      return {
        roles: rows.map(r => ({
          roleId: r.roleid || r.id || '',
          roleName: r.rolename || r.name || '',
          ote: r.ote || 0,
          baseSalary: r.basesalary || r.base || 0,
          targetCommission: r.targetcommission || r.commission || 0,
          quotaAmount: r.quotaamount || r.quota || 0
        }))
      };
    }

    return { rawData: rows };
  }

  function parseExcel(workbook) {
    const result = {};

    workbook.SheetNames.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet);
      const name = sheetName.toLowerCase();

      if (name.includes('tier')) {
        result.tiers = data.map(r => ({
          name: r.Name || r['Tier Name'] || '',
          minAttainment: r['Min %'] || r.MinAttainment || 0,
          maxAttainment: r['Max %'] || r.MaxAttainment || 100,
          rate: r['Rate %'] || r.Rate || 0,
          description: r.Description || ''
        }));
      } else if (name.includes('role')) {
        result.roles = data.map(r => ({
          roleId: r.RoleId || r.ID || '',
          roleName: r.RoleName || r.Name || '',
          ote: r.OTE || 0,
          baseSalary: r.BaseSalary || r.Base || 0,
          targetCommission: r.TargetCommission || r.Commission || 0,
          quotaAmount: r.QuotaAmount || r.Quota || 0
        }));
      } else if (name.includes('spif')) {
        result.spifs = data;
      } else if (name.includes('clawback')) {
        result.clawbacks = data;
      }
    });

    // If only one sheet and no specific type detected, try to auto-detect
    if (Object.keys(result).length === 0 && workbook.SheetNames.length > 0) {
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(sheet);
      if (data.length > 0) {
        const firstRow = data[0];
        const keys = Object.keys(firstRow).map(k => k.toLowerCase());

        if (keys.some(k => k.includes('attainment') || k.includes('rate'))) {
          result.tiers = data;
        } else if (keys.some(k => k.includes('ote') || k.includes('quota'))) {
          result.roles = data;
        } else {
          result.rawData = data;
        }
      }
    }

    return result;
  }

  function exportPlan(format) {
    const plan = getCurrentPlan();
    let content, filename, mimeType;

    if (format === 'json') {
      content = JSON.stringify(plan, null, 2);
      filename = (plan.id || 'comp-plan') + '.json';
      mimeType = 'application/json';
    } else if (format === 'csv') {
      // Export tiers as CSV
      const headers = ['Name', 'Min %', 'Max %', 'Rate %', 'Description'];
      const rows = (plan.tiers || []).map(t => [
        t.name,
        t.minAttainment,
        t.maxAttainment,
        t.rate,
        t.description || ''
      ]);
      content = [headers.join(','), ...rows.map(r => r.join(','))].join('\\n');
      filename = (plan.id || 'comp-plan') + '-tiers.csv';
      mimeType = 'text/csv';
    } else if (format === 'xlsx') {
      if (typeof XLSX === 'undefined') {
        alert('Excel export requires xlsx.js library');
        return;
      }

      const workbook = XLSX.utils.book_new();

      // Add Tiers sheet
      if (plan.tiers?.length) {
        const tiersData = plan.tiers.map(t => ({
          'Name': t.name,
          'Min %': t.minAttainment,
          'Max %': t.maxAttainment,
          'Rate %': t.rate,
          'Description': t.description || ''
        }));
        const tiersSheet = XLSX.utils.json_to_sheet(tiersData);
        XLSX.utils.book_append_sheet(workbook, tiersSheet, 'Tiers');
      }

      // Add Roles sheet
      if (plan.roles?.length) {
        const rolesData = plan.roles.map(r => ({
          'Role ID': r.roleId,
          'Role Name': r.roleName,
          'OTE': r.ote,
          'Base Salary': r.baseSalary,
          'Target Commission': r.targetCommission,
          'Quota': r.quotaAmount
        }));
        const rolesSheet = XLSX.utils.json_to_sheet(rolesData);
        XLSX.utils.book_append_sheet(workbook, rolesSheet, 'Roles');
      }

      // Add SPIFs sheet
      if (plan.spifs?.length) {
        const spifsSheet = XLSX.utils.json_to_sheet(plan.spifs);
        XLSX.utils.book_append_sheet(workbook, spifsSheet, 'SPIFs');
      }

      // Add Clawbacks sheet
      if (plan.clawbacks?.length) {
        const clawbacksSheet = XLSX.utils.json_to_sheet(plan.clawbacks);
        XLSX.utils.book_append_sheet(workbook, clawbacksSheet, 'Clawbacks');
      }

      XLSX.writeFile(workbook, (plan.id || 'comp-plan') + '.xlsx');
      return;
    }

    // Download file
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ========================================
  // LocalStorage Persistence
  // ========================================

  function saveDraft() {
    const plan = getCurrentPlan();
    localStorage.setItem(config.draftKey, JSON.stringify(plan));
    localStorage.setItem(config.draftKey + '_timestamp', Date.now().toString());

    // Show auto-save indicator
    autosaveIndicator.hidden = false;
    setTimeout(() => { autosaveIndicator.hidden = true; }, 2500);
  }

  function loadDraft() {
    const draft = localStorage.getItem(config.draftKey);
    if (draft) {
      try {
        return JSON.parse(draft);
      } catch (e) {
        console.warn('Failed to parse draft:', e);
      }
    }
    return null;
  }

  function savePlanToStorage(plan) {
    const key = config.localStoragePrefix + plan.id;
    localStorage.setItem(key, JSON.stringify(plan));
    updatePlanSelector();
  }

  function loadPlanFromStorage(planId) {
    const key = config.localStoragePrefix + planId;
    const planJson = localStorage.getItem(key);
    if (planJson) {
      try {
        return JSON.parse(planJson);
      } catch (e) {
        console.warn('Failed to parse plan:', e);
      }
    }
    return null;
  }

  function listSavedPlans() {
    const plans = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(config.localStoragePrefix)) {
        const planJson = localStorage.getItem(key);
        try {
          const plan = JSON.parse(planJson);
          plans.push({
            id: plan.id,
            name: plan.name,
            status: plan.status,
            version: plan.version
          });
        } catch (e) { /* ignore invalid entries */ }
      }
    }
    return plans;
  }

  function updatePlanSelector() {
    const plans = listSavedPlans();
    planSelector.innerHTML = '<option value="">New Plan</option>';
    plans.forEach(p => {
      const option = document.createElement('option');
      option.value = p.id;
      option.textContent = p.name || p.id;
      planSelector.appendChild(option);
    });
  }

  function triggerAutoSave() {
    if (!config.autoSave) return;

    if (state.autoSaveTimer) {
      clearTimeout(state.autoSaveTimer);
    }

    state.autoSaveTimer = setTimeout(() => {
      saveDraft();
    }, config.autoSaveDebounce);
  }

  // ========================================
  // Preview Updates
  // ========================================

  function updatePreview() {
    updateKPIs();
    updateCharts();
    updateValidation();
  }

  function updateKPIs() {
    const plan = state.plan;
    document.getElementById(componentId + '-kpi-roles').textContent = (plan.roles || []).length;
    document.getElementById(componentId + '-kpi-tiers').textContent = (plan.tiers || []).length;
    document.getElementById(componentId + '-kpi-spifs').textContent = (plan.spifs || []).length;
    document.getElementById(componentId + '-kpi-clawbacks').textContent = (plan.clawbacks || []).length;
  }

  function updateCharts() {
    const plan = state.plan;
    const colors = config.chartColors;

    // Tier rates chart
    const tiersCanvas = document.getElementById(componentId + '-chart-tiers');
    if (tiersCanvas && typeof Chart !== 'undefined') {
      const tiers = plan.tiers || [];

      if (state.charts.tiers) {
        state.charts.tiers.destroy();
      }

      state.charts.tiers = new Chart(tiersCanvas, {
        type: 'bar',
        data: {
          labels: tiers.map(t => t.name || 'Unnamed'),
          datasets: [{
            label: 'Commission Rate %',
            data: tiers.map(t => (t.rate || 0) * (t.rate > 1 ? 1 : 100)),
            backgroundColor: tiers.map((_, i) => {
              const hue = 250 - (i * 30);
              return 'hsl(' + hue + ', 50%, 50%)';
            }),
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: false }
          },
          scales: {
            y: {
              beginAtZero: true,
              title: { display: true, text: 'Rate %' }
            }
          }
        }
      });
    }

    // Pay mix chart
    const paymixCanvas = document.getElementById(componentId + '-chart-paymix');
    if (paymixCanvas && typeof Chart !== 'undefined') {
      const roles = plan.roles || [];

      if (state.charts.paymix) {
        state.charts.paymix.destroy();
      }

      state.charts.paymix = new Chart(paymixCanvas, {
        type: 'bar',
        data: {
          labels: roles.map(r => r.roleName || r.roleId || 'Role'),
          datasets: [
            {
              label: 'Base Salary',
              data: roles.map(r => r.baseSalary || 0),
              backgroundColor: colors.primary
            },
            {
              label: 'Target Commission',
              data: roles.map(r => r.targetCommission || 0),
              backgroundColor: colors.accent
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { position: 'bottom' }
          },
          scales: {
            x: { stacked: true },
            y: {
              stacked: true,
              title: { display: true, text: 'Amount ($)' }
            }
          }
        }
      });
    }
  }

  function updateValidation() {
    const plan = state.plan;
    const messagesEl = document.getElementById(componentId + '-validation-messages');
    const errors = [];
    const warnings = [];

    // Validate required fields
    if (!plan.id) errors.push('Plan ID is required');
    if (!plan.name) errors.push('Plan Name is required');
    if (!plan.tiers || plan.tiers.length === 0) errors.push('At least one tier is required');
    if (!plan.roles || plan.roles.length === 0) errors.push('At least one role is required');

    // Validate tiers
    if (plan.tiers) {
      const sorted = [...plan.tiers].sort((a, b) => (a.minAttainment || 0) - (b.minAttainment || 0));
      for (let i = 0; i < sorted.length; i++) {
        const tier = sorted[i];
        if (!tier.name) errors.push('Tier ' + (i + 1) + ': Name is required');
        if (tier.minAttainment === undefined) errors.push('Tier "' + (tier.name || i + 1) + '": Min % is required');
        if (tier.maxAttainment === undefined) errors.push('Tier "' + (tier.name || i + 1) + '": Max % is required');
        if (tier.rate === undefined) errors.push('Tier "' + (tier.name || i + 1) + '": Rate is required');

        if (i > 0 && sorted[i - 1].maxAttainment > tier.minAttainment) {
          warnings.push('Tier overlap between "' + sorted[i - 1].name + '" and "' + tier.name + '"');
        }
      }
    }

    // Validate roles
    if (plan.roles) {
      plan.roles.forEach((role, i) => {
        if (!role.roleId) errors.push('Role ' + (i + 1) + ': Role ID is required');
        if (!role.ote || role.ote <= 0) warnings.push('Role "' + (role.roleId || i + 1) + '": OTE should be > 0');
        if (!role.quotaAmount || role.quotaAmount <= 0) warnings.push('Role "' + (role.roleId || i + 1) + '": Quota should be > 0');

        if (role.baseSalary && role.targetCommission && role.ote) {
          const sum = role.baseSalary + role.targetCommission;
          if (Math.abs(sum - role.ote) > 1) {
            warnings.push('Role "' + role.roleId + '": Base + Commission (' + sum + ') ≠ OTE (' + role.ote + ')');
          }
        }
      });
    }

    // Display messages
    messagesEl.innerHTML = '';

    if (errors.length === 0 && warnings.length === 0) {
      messagesEl.innerHTML = '<p class="validation-success">Plan is valid and ready to save</p>';
    } else {
      errors.forEach(msg => {
        const p = document.createElement('p');
        p.className = 'validation-error';
        p.textContent = msg;
        messagesEl.appendChild(p);
      });
      warnings.forEach(msg => {
        const p = document.createElement('p');
        p.className = 'validation-warning';
        p.textContent = msg;
        messagesEl.appendChild(p);
      });
    }
  }

  // ========================================
  // Event Handlers
  // ========================================

  // Plan selector change
  planSelector.addEventListener('change', function() {
    const planId = this.value;
    if (planId) {
      const plan = loadPlanFromStorage(planId);
      if (plan) {
        loadPlanIntoForm(plan);
      }
    } else {
      loadPlanIntoForm(config.defaultPlan);
    }
  });

  // Import button
  document.getElementById(componentId + '-btn-import')?.addEventListener('click', function() {
    importModal.hidden = false;
    state.pendingFile = null;
    uploadPreview.hidden = true;
    uploadError.hidden = true;
    confirmImportBtn.disabled = true;
  });

  // Modal close
  document.getElementById(componentId + '-modal-close')?.addEventListener('click', function() {
    importModal.hidden = true;
  });

  document.getElementById(componentId + '-btn-cancel')?.addEventListener('click', function() {
    importModal.hidden = true;
  });

  // Overlay click
  importModal?.querySelector('.modal-overlay')?.addEventListener('click', function() {
    importModal.hidden = true;
  });

  // Browse button
  document.getElementById(componentId + '-btn-browse')?.addEventListener('click', function() {
    fileInput.click();
  });

  // Drag and drop
  dropzone?.addEventListener('dragover', function(e) {
    e.preventDefault();
    dropzone.classList.add('drag-over');
  });

  dropzone?.addEventListener('dragleave', function() {
    dropzone.classList.remove('drag-over');
  });

  dropzone?.addEventListener('drop', function(e) {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  });

  // File input change
  fileInput?.addEventListener('change', function() {
    if (this.files.length > 0) {
      handleFileSelect(this.files[0]);
    }
  });

  function handleFileSelect(file) {
    // Validate file size
    if (file.size > 5 * 1024 * 1024) {
      uploadError.textContent = 'File is too large. Maximum size is 5MB.';
      uploadError.hidden = false;
      uploadPreview.hidden = true;
      return;
    }

    // Validate file type
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['json', 'csv', 'xlsx'].includes(ext)) {
      uploadError.textContent = 'Unsupported file type. Please use JSON, CSV, or XLSX.';
      uploadError.hidden = false;
      uploadPreview.hidden = true;
      return;
    }

    uploadError.hidden = true;

    // Parse file
    parseFile(file).then(result => {
      state.pendingFile = result;

      // Show preview
      uploadPreview.hidden = false;
      uploadPreview.querySelector('.file-name').textContent = file.name;
      uploadPreview.querySelector('.file-size').textContent = formatFileSize(file.size);

      // Show preview data
      const previewData = uploadPreview.querySelector('.import-preview-data');
      let previewHtml = '';

      if (result.data.tiers?.length) {
        previewHtml += '<strong>Tiers:</strong> ' + result.data.tiers.length + ' found<br>';
      }
      if (result.data.roles?.length) {
        previewHtml += '<strong>Roles:</strong> ' + result.data.roles.length + ' found<br>';
      }
      if (result.data.spifs?.length) {
        previewHtml += '<strong>SPIFs:</strong> ' + result.data.spifs.length + ' found<br>';
      }
      if (result.data.clawbacks?.length) {
        previewHtml += '<strong>Clawbacks:</strong> ' + result.data.clawbacks.length + ' found<br>';
      }
      if (result.data.id) {
        previewHtml += '<strong>Plan ID:</strong> ' + result.data.id + '<br>';
      }
      if (result.data.name) {
        previewHtml += '<strong>Plan Name:</strong> ' + result.data.name + '<br>';
      }

      previewData.innerHTML = previewHtml || 'File parsed successfully';
      confirmImportBtn.disabled = false;
    }).catch(err => {
      uploadError.textContent = 'Failed to parse file: ' + err.message;
      uploadError.hidden = false;
      uploadPreview.hidden = true;
      confirmImportBtn.disabled = true;
    });
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  // Remove file
  uploadPreview?.querySelector('.btn-remove-file')?.addEventListener('click', function() {
    state.pendingFile = null;
    uploadPreview.hidden = true;
    confirmImportBtn.disabled = true;
    fileInput.value = '';
  });

  // Confirm import
  confirmImportBtn?.addEventListener('click', function() {
    if (state.pendingFile) {
      const importedData = state.pendingFile.data;

      // Merge imported data with current plan
      const newPlan = { ...state.plan };

      if (importedData.id) newPlan.id = importedData.id;
      if (importedData.name) newPlan.name = importedData.name;
      if (importedData.version) newPlan.version = importedData.version;
      if (importedData.status) newPlan.status = importedData.status;
      if (importedData.effectivePeriod) newPlan.effectivePeriod = importedData.effectivePeriod;
      if (importedData.tiers) newPlan.tiers = importedData.tiers;
      if (importedData.roles) newPlan.roles = importedData.roles;
      if (importedData.spifs) newPlan.spifs = importedData.spifs;
      if (importedData.clawbacks) newPlan.clawbacks = importedData.clawbacks;
      if (importedData.cap) newPlan.cap = importedData.cap;

      loadPlanIntoForm(newPlan);
      importModal.hidden = true;
      state.pendingFile = null;
    }
  });

  // Export buttons
  document.querySelectorAll('#' + componentId + '-export-menu button').forEach(btn => {
    btn.addEventListener('click', function() {
      exportPlan(this.dataset.format);
    });
  });

  // Save button
  document.getElementById(componentId + '-btn-save')?.addEventListener('click', function() {
    const plan = getCurrentPlan();

    if (!plan.id) {
      alert('Please enter a Plan ID before saving');
      return;
    }

    savePlanToStorage(plan);
    state.isDirty = false;

    // Update selector
    planSelector.value = plan.id;

    if (config.onSave && typeof window[config.onSave] === 'function') {
      window[config.onSave](plan);
    }

    alert('Plan saved successfully!');
  });

  // Section collapsing
  component.querySelectorAll('.section.collapsible .section-header').forEach(header => {
    header.addEventListener('click', function() {
      const section = this.parentElement;
      section.classList.toggle('collapsed');
    });
  });

  // Form field changes
  document.getElementById(componentId + '-plan-id')?.addEventListener('input', function() {
    updatePlanField('id', this.value);
  });

  document.getElementById(componentId + '-plan-name')?.addEventListener('input', function() {
    updatePlanField('name', this.value);
  });

  document.getElementById(componentId + '-plan-version')?.addEventListener('input', function() {
    updatePlanField('version', this.value);
  });

  document.getElementById(componentId + '-plan-status')?.addEventListener('change', function() {
    updatePlanField('status', this.value);
    const statusBadge = component.querySelector('.plan-status');
    if (statusBadge) {
      statusBadge.dataset.status = this.value;
      statusBadge.textContent = this.value.charAt(0).toUpperCase() + this.value.slice(1);
    }
  });

  document.getElementById(componentId + '-fiscal-year')?.addEventListener('input', function() {
    updatePlanField('effectivePeriod.fiscalYear', parseInt(this.value) || null);
  });

  document.getElementById(componentId + '-start-date')?.addEventListener('input', function() {
    updatePlanField('effectivePeriod.startDate', this.value);
  });

  document.getElementById(componentId + '-end-date')?.addEventListener('input', function() {
    updatePlanField('effectivePeriod.endDate', this.value);
  });

  // Cap settings
  document.getElementById(componentId + '-cap-enabled')?.addEventListener('change', function() {
    const capSettings = document.getElementById(componentId + '-cap-settings');
    capSettings.hidden = !this.checked;
    updatePlanField('cap.enabled', this.checked);
  });

  document.getElementById(componentId + '-cap-multiplier')?.addEventListener('input', function() {
    updatePlanField('cap.maxMultiplierOfOTE', parseFloat(this.value) || 2);
  });

  document.getElementById(componentId + '-cap-absolute')?.addEventListener('input', function() {
    const val = this.value ? parseFloat(this.value) : null;
    updatePlanField('cap.absoluteMax', val);
  });

  // Listen for table changes
  component.addEventListener('table-change', function(e) {
    const tableId = e.detail.tableId;
    const rows = e.detail.rows;

    if (tableId.includes('tiers')) {
      state.plan.tiers = rows;
    } else if (tableId.includes('roles')) {
      state.plan.roles = rows;
    } else if (tableId.includes('spifs')) {
      state.plan.spifs = rows;
    } else if (tableId.includes('clawbacks')) {
      state.plan.clawbacks = rows;
    }

    state.isDirty = true;
    updatePreview();
    triggerAutoSave();
  });

  // ========================================
  // Initialize
  // ========================================

  function init() {
    // Update plan selector with saved plans
    updatePlanSelector();

    // Check for draft
    const draft = loadDraft();
    if (draft) {
      const timestamp = localStorage.getItem(config.draftKey + '_timestamp');
      if (timestamp) {
        const draftAge = Date.now() - parseInt(timestamp);
        if (draftAge < 24 * 60 * 60 * 1000) { // Less than 24 hours old
          if (confirm('You have an unsaved draft from ' + new Date(parseInt(timestamp)).toLocaleString() + '. Would you like to restore it?')) {
            loadPlanIntoForm(draft);
            return;
          }
        }
      }
    }

    // Initialize with default or provided plan
    updatePreview();
  }

  // Expose methods
  window.VIZ_PLAN_BUILDERS[componentId] = {
    ...state,
    getCurrentPlan,
    loadPlan: loadPlanIntoForm,
    savePlan: function() { document.getElementById(componentId + '-btn-save')?.click(); },
    exportPlan,
    listPlans: listSavedPlans,
    updatePreview
  };

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
    `;
  }

  /**
   * Capitalize first letter
   * @private
   */
  _capitalizeFirst(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
  }

  /**
   * Validate component
   * @returns {Object}
   */
  validate() {
    const errors = [];

    if (!this.id) errors.push('Component ID is required');
    if (!this.type) errors.push('Component type is required');

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = PlanBuilderComponent;
