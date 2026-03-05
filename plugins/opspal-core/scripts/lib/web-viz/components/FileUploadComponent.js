/**
 * File Upload Component for Web Visualizations
 *
 * Drag-and-drop file upload with support for JSON, CSV, and XLSX formats.
 * Parses uploaded files and emits events with parsed data.
 *
 * @module web-viz/components/FileUploadComponent
 * @version 1.0.0
 */

const BaseComponent = require('./BaseComponent');

class FileUploadComponent extends BaseComponent {
  /**
   * Create a file upload component
   * @param {string} id - Component ID
   * @param {Object} options - Component options
   * @param {string[]} options.accept - Accepted file types ['.json', '.csv', '.xlsx']
   * @param {number} options.maxSize - Max file size in bytes (default 5MB)
   * @param {string} options.onUpload - Callback function name for upload events
   * @param {boolean} options.multiple - Allow multiple files (default false)
   * @param {string} options.parseAs - Expected data type: 'plan', 'tiers', 'roles', 'spifs', 'clawbacks'
   * @param {Object} options.columnMapping - CSV column mapping { csvColumn: schemaField }
   */
  constructor(id, options = {}) {
    super('fileUpload', { id, ...options });

    if (this.position.colspan == null) {
      this.position.colspan = 12;
    }

    this.config = {
      accept: options.accept || ['.json', '.csv', '.xlsx'],
      maxSize: options.maxSize || 5 * 1024 * 1024, // 5MB default
      maxSizeLabel: options.maxSizeLabel || '5MB',
      onUpload: options.onUpload || null,
      multiple: options.multiple || false,
      parseAs: options.parseAs || 'plan',
      columnMapping: options.columnMapping || null,
      dropzoneText: options.dropzoneText || 'Drag & drop a file here',
      dropzoneHint: options.dropzoneHint || 'or click to browse',
      showPreview: options.showPreview !== false,
      ...options.config
    };

    // Track uploaded file info
    this.uploadedFile = null;
    this.parsedData = null;
    this.parseError = null;
  }

  /**
   * Generate HTML for the file upload component
   * @returns {string} HTML string
   */
  generateHTML() {
    const acceptStr = this.config.accept.join(',');
    const acceptDisplay = this.config.accept.map(ext => ext.toUpperCase().replace('.', '')).join(', ');

    return `
<div class="viz-component file-upload-component component-${this.id}"
     id="component-${this.id}"
     data-component-id="${this.id}"
     data-component-type="fileUpload">

  ${this.title ? `
  <div class="component-header">
    <h3 class="component-title">${this._escapeHtml(this.title)}</h3>
    ${this.description ? `<p class="component-description">${this._escapeHtml(this.description)}</p>` : ''}
  </div>
  ` : ''}

  <div class="component-body">
    <div class="upload-dropzone" id="${this.id}-dropzone" data-component="${this.id}">
      <div class="dropzone-content">
        <span class="upload-icon">📤</span>
        <p class="dropzone-text">${this._escapeHtml(this.config.dropzoneText)}</p>
        <p class="dropzone-hint">${this._escapeHtml(this.config.dropzoneHint)} (${acceptDisplay})</p>
        <p class="dropzone-size-hint">Max size: ${this.config.maxSizeLabel}</p>
      </div>
      <input type="file"
             id="${this.id}-input"
             accept="${acceptStr}"
             ${this.config.multiple ? 'multiple' : ''}
             hidden>
    </div>

    <div class="upload-preview" id="${this.id}-preview" hidden>
      <div class="file-info">
        <span class="file-icon">📄</span>
        <span class="file-name" id="${this.id}-filename"></span>
        <span class="file-size" id="${this.id}-filesize"></span>
      </div>
      <div class="file-actions">
        <button type="button" class="btn-remove" id="${this.id}-remove" title="Remove file">✕</button>
      </div>
    </div>

    <div class="upload-progress" id="${this.id}-progress" hidden>
      <div class="progress-bar">
        <div class="progress-fill" id="${this.id}-progress-fill"></div>
      </div>
      <span class="progress-text" id="${this.id}-progress-text">Parsing...</span>
    </div>

    <div class="upload-error" id="${this.id}-error" hidden>
      <span class="error-icon">⚠️</span>
      <span class="error-message" id="${this.id}-error-msg"></span>
    </div>

    <div class="upload-success" id="${this.id}-success" hidden>
      <span class="success-icon">✅</span>
      <span class="success-message" id="${this.id}-success-msg"></span>
    </div>
  </div>
</div>`;
  }

  /**
   * Generate CSS for the file upload component
   * @returns {string} CSS string
   */
  generateCSS() {
    return `
${super.generateCSS()}

/* File Upload Component Styles */
.file-upload-component {
  background: var(--neutral-100, #ffffff);
  border-radius: var(--radius-lg, 12px);
  padding: var(--space-24, 24px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0,0,0,0.1));
}

.upload-dropzone {
  border: 2px dashed var(--neutral-60, #d1d5db);
  border-radius: var(--radius-md, 8px);
  padding: var(--space-32, 32px) var(--space-24, 24px);
  text-align: center;
  cursor: pointer;
  transition: all 200ms ease;
  background: var(--neutral-98, #fafafa);
}

.upload-dropzone:hover,
.upload-dropzone.dragover {
  border-color: var(--brand-grape, #5F3B8C);
  background: rgba(95, 59, 140, 0.05);
}

.upload-dropzone.dragover {
  transform: scale(1.01);
}

.dropzone-content {
  pointer-events: none;
}

.upload-icon {
  font-size: 48px;
  display: block;
  margin-bottom: var(--space-16, 16px);
  opacity: 0.8;
}

.dropzone-text {
  font-size: 16px;
  font-weight: 500;
  color: var(--brand-indigo, #3E4A61);
  margin: 0 0 var(--space-8, 8px);
}

.dropzone-hint,
.dropzone-size-hint {
  font-size: 13px;
  color: var(--neutral-50, #6b7280);
  margin: 0;
}

.dropzone-size-hint {
  margin-top: var(--space-8, 8px);
  font-size: 12px;
}

/* File Preview */
.upload-preview {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-16, 16px);
  background: var(--neutral-98, #fafafa);
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--neutral-80, #e5e7eb);
}

.file-info {
  display: flex;
  align-items: center;
  gap: var(--space-12, 12px);
}

.file-icon {
  font-size: 24px;
}

.file-name {
  font-weight: 500;
  color: var(--brand-indigo, #3E4A61);
}

.file-size {
  font-size: 13px;
  color: var(--neutral-50, #6b7280);
}

.btn-remove {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  padding: var(--space-8, 8px);
  border-radius: var(--radius-sm, 4px);
  color: var(--neutral-50, #6b7280);
  transition: all 150ms ease;
}

.btn-remove:hover {
  background: var(--error-bg, #fef2f2);
  color: var(--error, #ef4444);
}

/* Progress */
.upload-progress {
  margin-top: var(--space-16, 16px);
}

.progress-bar {
  height: 8px;
  background: var(--neutral-90, #e5e7eb);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--brand-grape, #5F3B8C);
  width: 0%;
  transition: width 200ms ease;
}

.progress-text {
  display: block;
  text-align: center;
  margin-top: var(--space-8, 8px);
  font-size: 13px;
  color: var(--neutral-50, #6b7280);
}

/* Error & Success Messages */
.upload-error,
.upload-success {
  display: flex;
  align-items: center;
  gap: var(--space-8, 8px);
  padding: var(--space-12, 12px) var(--space-16, 16px);
  border-radius: var(--radius-md, 8px);
  margin-top: var(--space-16, 16px);
}

.upload-error {
  background: var(--error-bg, #fef2f2);
  color: var(--error, #ef4444);
}

.upload-success {
  background: var(--success-bg, #f0fdf4);
  color: var(--success, #22c55e);
}

.error-icon,
.success-icon {
  font-size: 18px;
}

.error-message,
.success-message {
  font-size: 14px;
}
`;
  }

  /**
   * Generate client-side JavaScript for file handling
   * @returns {string} JavaScript string
   */
  generateJS() {
    const componentId = this.id;
    const config = JSON.stringify(this.config);

    return `
(function() {
  const componentId = '${componentId}';
  const config = ${config};

  // Get DOM elements
  const dropzone = document.getElementById(componentId + '-dropzone');
  const fileInput = document.getElementById(componentId + '-input');
  const preview = document.getElementById(componentId + '-preview');
  const filename = document.getElementById(componentId + '-filename');
  const filesize = document.getElementById(componentId + '-filesize');
  const removeBtn = document.getElementById(componentId + '-remove');
  const progress = document.getElementById(componentId + '-progress');
  const progressFill = document.getElementById(componentId + '-progress-fill');
  const progressText = document.getElementById(componentId + '-progress-text');
  const errorDiv = document.getElementById(componentId + '-error');
  const errorMsg = document.getElementById(componentId + '-error-msg');
  const successDiv = document.getElementById(componentId + '-success');
  const successMsg = document.getElementById(componentId + '-success-msg');

  // Store component state globally
  window.VIZ_FILE_UPLOADS = window.VIZ_FILE_UPLOADS || {};
  window.VIZ_FILE_UPLOADS[componentId] = {
    file: null,
    parsedData: null,
    getParsedData: function() { return this.parsedData; },
    clear: function() { clearUpload(); }
  };

  // Utility functions
  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function showError(message) {
    errorMsg.textContent = message;
    errorDiv.hidden = false;
    successDiv.hidden = true;
    progress.hidden = true;
  }

  function showSuccess(message) {
    successMsg.textContent = message;
    successDiv.hidden = false;
    errorDiv.hidden = true;
    progress.hidden = true;
  }

  function hideMessages() {
    errorDiv.hidden = true;
    successDiv.hidden = true;
  }

  function showProgress(percent, text) {
    progress.hidden = false;
    progressFill.style.width = percent + '%';
    progressText.textContent = text || 'Processing...';
  }

  function clearUpload() {
    fileInput.value = '';
    preview.hidden = true;
    dropzone.hidden = false;
    hideMessages();
    window.VIZ_FILE_UPLOADS[componentId].file = null;
    window.VIZ_FILE_UPLOADS[componentId].parsedData = null;
  }

  // Parse JSON file
  function parseJSON(content) {
    try {
      return JSON.parse(content);
    } catch (e) {
      throw new Error('Invalid JSON format: ' + e.message);
    }
  }

  // Parse CSV file
  function parseCSV(content) {
    const lines = content.trim().split(/\\r?\\n/);
    if (lines.length < 2) {
      throw new Error('CSV must have a header row and at least one data row');
    }

    // Parse header
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ''));

    // Parse rows
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      if (values.length !== headers.length) continue;

      const row = {};
      headers.forEach((h, idx) => {
        let val = values[idx];
        // Try to parse as number
        const num = parseFloat(val);
        if (!isNaN(num) && val !== '') {
          val = num;
        }
        row[h] = val;
      });
      rows.push(row);
    }

    // Apply column mapping if provided
    if (config.columnMapping) {
      return rows.map(row => {
        const mapped = {};
        for (const [csvCol, schemaField] of Object.entries(config.columnMapping)) {
          if (row[csvCol.toLowerCase()] !== undefined) {
            mapped[schemaField] = row[csvCol.toLowerCase()];
          }
        }
        return mapped;
      });
    }

    return rows;
  }

  // Parse XLSX file (requires SheetJS)
  function parseXLSX(arrayBuffer) {
    if (typeof XLSX === 'undefined') {
      throw new Error('XLSX library not loaded. Add SheetJS CDN to use Excel files.');
    }

    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(firstSheet);

    // Normalize column names
    return data.map(row => {
      const normalized = {};
      for (const [key, value] of Object.entries(row)) {
        const normalizedKey = key.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        normalized[normalizedKey] = value;
      }
      return normalized;
    });
  }

  // Main file handler
  async function handleFile(file) {
    hideMessages();

    // Validate file type
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!config.accept.includes(ext)) {
      showError('Invalid file type. Accepted: ' + config.accept.join(', '));
      return;
    }

    // Validate file size
    if (file.size > config.maxSize) {
      showError('File too large. Maximum size: ' + config.maxSizeLabel);
      return;
    }

    // Show preview
    filename.textContent = file.name;
    filesize.textContent = formatFileSize(file.size);
    dropzone.hidden = true;
    preview.hidden = false;

    // Show progress
    showProgress(10, 'Reading file...');

    try {
      let parsedData;

      if (ext === '.json') {
        showProgress(30, 'Parsing JSON...');
        const content = await file.text();
        parsedData = parseJSON(content);
      } else if (ext === '.csv') {
        showProgress(30, 'Parsing CSV...');
        const content = await file.text();
        parsedData = parseCSV(content);
      } else if (ext === '.xlsx' || ext === '.xls') {
        showProgress(30, 'Parsing Excel...');
        const buffer = await file.arrayBuffer();
        parsedData = parseXLSX(buffer);
      }

      showProgress(80, 'Validating...');

      // Store parsed data
      window.VIZ_FILE_UPLOADS[componentId].file = file;
      window.VIZ_FILE_UPLOADS[componentId].parsedData = parsedData;

      showProgress(100, 'Complete!');

      // Determine success message
      let recordCount = Array.isArray(parsedData) ? parsedData.length : 1;
      let dataType = config.parseAs || 'records';
      showSuccess('Loaded ' + recordCount + ' ' + dataType + ' from ' + file.name);

      // Emit custom event
      const event = new CustomEvent('file-upload', {
        detail: {
          componentId: componentId,
          file: file,
          data: parsedData,
          parseAs: config.parseAs
        },
        bubbles: true
      });
      document.getElementById('component-' + componentId).dispatchEvent(event);

      // Call callback if specified
      if (config.onUpload && typeof window[config.onUpload] === 'function') {
        window[config.onUpload](parsedData, file, componentId);
      }

    } catch (e) {
      showError('Parse error: ' + e.message);
      clearUpload();
    }
  }

  // Event listeners
  dropzone.addEventListener('click', () => fileInput.click());

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove('dragover');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  });

  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearUpload();

    // Emit clear event
    const event = new CustomEvent('file-clear', {
      detail: { componentId: componentId },
      bubbles: true
    });
    document.getElementById('component-' + componentId).dispatchEvent(event);
  });
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
   * Validate component (file uploads don't require data)
   * @returns {Object} { valid: boolean, errors: string[] }
   */
  validate() {
    const errors = [];
    if (!this.id) errors.push('Component ID is required');
    return { valid: errors.length === 0, errors };
  }
}

module.exports = FileUploadComponent;
