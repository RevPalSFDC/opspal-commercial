#!/usr/bin/env node
/**
 * Project Intake Form Generator
 *
 * Generates a self-contained HTML intake form that users can fill in browser.
 * Features:
 * - Schema-driven form fields
 * - Collapsible sections with completion status
 * - Real-time client-side validation
 * - Conditional field visibility
 * - Progress tracking
 * - Save draft to localStorage
 * - Export to JSON file
 *
 * Usage:
 *   node intake-form-generator.js --output ./intake-form.html
 *   node intake-form-generator.js --project-type salesforce --output ./sf-intake.html
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const { intakeSchema, enums } = require('./intake-schema');

class IntakeFormGenerator {
  constructor(options = {}) {
    this.schema = intakeSchema;
    this.options = {
      projectType: options.projectType || null,
      includeOptionalSections: options.includeOptionalSections !== false,
      theme: options.theme || 'default',
      detectSalesforceOrgs: options.detectSalesforceOrgs !== false,
      ...options
    };

    // Detect Salesforce orgs if enabled
    this.salesforceOrgs = this.options.detectSalesforceOrgs ? this.detectSalesforceOrgs() : [];
  }

  /**
   * Detect locally configured Salesforce orgs
   */
  detectSalesforceOrgs() {
    try {
      const result = execSync('sf org list --json 2>/dev/null', {
        encoding: 'utf-8',
        timeout: 10000
      });
      const data = JSON.parse(result);
      const orgs = [];

      // Process sandbox orgs
      if (data.result?.sandboxes) {
        data.result.sandboxes.forEach(org => {
          orgs.push({
            alias: org.alias || org.username,
            username: org.username,
            type: 'sandbox',
            isDefault: org.isDefaultUsername || false
          });
        });
      }

      // Process non-scratch orgs (production, dev, etc.)
      if (data.result?.nonScratchOrgs) {
        data.result.nonScratchOrgs.forEach(org => {
          orgs.push({
            alias: org.alias || org.username,
            username: org.username,
            type: org.isSandbox ? 'sandbox' : 'production',
            isDefault: org.isDefaultUsername || false
          });
        });
      }

      // Process scratch orgs
      if (data.result?.scratchOrgs) {
        data.result.scratchOrgs.forEach(org => {
          orgs.push({
            alias: org.alias || org.username,
            username: org.username,
            type: 'scratch',
            isDefault: org.isDefaultUsername || false,
            expirationDate: org.expirationDate
          });
        });
      }

      // Sort: default first, then by alias
      orgs.sort((a, b) => {
        if (a.isDefault && !b.isDefault) return -1;
        if (!a.isDefault && b.isDefault) return 1;
        return (a.alias || '').localeCompare(b.alias || '');
      });

      return orgs;
    } catch (error) {
      // SF CLI not available or no orgs configured
      console.log('Note: Could not detect Salesforce orgs (sf cli may not be installed or no orgs configured)');
      return [];
    }
  }

  /**
   * Generate HTML options for Salesforce org dropdown
   */
  generateOrgOptions() {
    if (this.salesforceOrgs.length === 0) {
      return '<option value="" disabled>No orgs detected - select "Add New Org"</option>';
    }

    return this.salesforceOrgs.map(org => {
      const label = org.alias || org.username;
      const typeLabel = org.type.charAt(0).toUpperCase() + org.type.slice(1);
      const defaultBadge = org.isDefault ? ' (Default)' : '';
      const displayText = `${label} [${typeLabel}]${defaultBadge}`;

      return `<option value="${org.alias || org.username}" data-type="${org.type}" data-username="${org.username}">${displayText}</option>`;
    }).join('\n                                    ');
  }

  /**
   * Generate complete HTML form
   */
  generate() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OpsPal Project Intake Form</title>
    <style>
${this.getStyles()}
    </style>
</head>
<body>
    <div class="container">
        <header class="header">
            <h1>OpsPal Project Intake Form</h1>
            <p class="subtitle">Complete this form to submit a new project request</p>
            <div class="progress-container">
                <div class="progress-bar">
                    <div class="progress-fill" id="progressFill"></div>
                </div>
                <span class="progress-text" id="progressText">0% Complete</span>
            </div>
        </header>

        <form id="intakeForm" onsubmit="handleSubmit(event)">
${this.generateSections()}
        </form>

        <div class="actions">
            <div class="action-group-left">
                <button type="button" class="btn btn-secondary" onclick="saveDraft()">
                    <span class="btn-icon">&#128190;</span> Save Draft
                </button>
                <button type="button" class="btn btn-secondary" onclick="loadDraft()">
                    <span class="btn-icon">&#128194;</span> Load Draft
                </button>
                <button type="button" class="btn btn-secondary" onclick="importJSON()">
                    <span class="btn-icon">&#128194;</span> Import File
                </button>
                <input type="file" id="fileInput" accept=".json" style="display: none;" onchange="handleFileImport(event)">
            </div>
            <div class="action-group-right">
                <button type="button" class="btn btn-primary" onclick="exportJSON()">
                    <span class="btn-icon">&#128229;</span> Export JSON
                </button>
                <button type="submit" form="intakeForm" class="btn btn-success">
                    <span class="btn-icon">&#10004;</span> Submit Intake
                </button>
            </div>
        </div>

        <div class="validation-summary" id="validationSummary" style="display: none;">
            <h3>Validation Issues</h3>
            <ul id="validationErrors"></ul>
        </div>
    </div>

    <div class="toast" id="toast"></div>

    <script>
${this.getClientJS()}
    </script>
</body>
</html>`;
  }

  /**
   * Generate CSS styles - RevPal Brand Design System
   */
  getStyles() {
    return `
/* ============================================
   RevPal Design System - Project Intake Form
   ============================================ */

/* Import Google Fonts */
@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800&family=Figtree:wght@400;500;600&display=swap');

/* Reset & Box Sizing */
*, *::before, *::after {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

/* ============================================
   CSS Custom Properties - Brand Colors
   ============================================ */
:root {
    /* Brand Colors */
    --brand-grape: #5F3B8C;
    --brand-indigo: #3E4A61;
    --brand-apricot: #E99560;
    --brand-apricot-hover: #D88450;
    --brand-sand: #EAE4DC;
    --brand-green: #6FBF73;

    /* Neutral Scale */
    --neutral-100: #FFFFFF;
    --neutral-90: #F6F5F3;
    --neutral-80: #EAE4DC;
    --neutral-60: #C6C3BD;
    --neutral-20: #8A8A8A;
    --neutral-0: #000000;

    /* Semantic Colors */
    --color-primary: var(--brand-grape);
    --color-secondary: var(--brand-indigo);
    --color-accent: var(--brand-apricot);
    --color-accent-hover: var(--brand-apricot-hover);
    --color-success: var(--brand-green);
    --color-warning: #E9A860;
    --color-danger: #D86060;
    --color-danger-light: #FDEAEA;

    /* Text Colors */
    --text-primary: var(--brand-indigo);
    --text-secondary: var(--neutral-20);
    --text-light: var(--neutral-60);
    --text-on-dark: var(--neutral-100);
    --text-on-accent: var(--brand-indigo);

    /* Background Colors */
    --bg-page: var(--neutral-90);
    --bg-surface: var(--neutral-100);
    --bg-elevated: var(--neutral-100);
    --bg-muted: var(--brand-sand);

    /* Border Colors */
    --border-default: rgba(62, 74, 97, 0.2);
    --border-focus: var(--brand-grape);
    --border-error: var(--color-danger);

    /* Typography */
    --font-heading: "Montserrat", system-ui, sans-serif;
    --font-body: "Figtree", system-ui, sans-serif;

    /* Spacing Scale */
    --space-2: 2px;
    --space-4: 4px;
    --space-8: 8px;
    --space-12: 12px;
    --space-16: 16px;
    --space-24: 24px;
    --space-32: 32px;
    --space-48: 48px;
    --space-64: 64px;

    /* Shadows */
    --shadow-sm: 0 1px 2px rgba(62, 74, 97, 0.08);
    --shadow-md: 0 4px 12px rgba(62, 74, 97, 0.1);
    --shadow-lg: 0 8px 24px rgba(62, 74, 97, 0.12);
    --shadow-card-hover: 0 8px 24px rgba(95, 59, 140, 0.15);

    /* Border Radius */
    --radius-sm: 4px;
    --radius-md: 8px;
    --radius-lg: 12px;
    --radius-pill: 20px;

    /* Transitions */
    --transition-fast: 150ms ease;
    --transition-normal: 200ms ease;
    --transition-slow: 250ms ease;

    /* Layout */
    --max-content-width: 900px;
    --max-line-length: 75ch;
}

/* ============================================
   Base Typography
   ============================================ */
html {
    font-size: 16px;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
}

body {
    font-family: var(--font-body);
    font-size: 1rem;
    line-height: 1.5;
    color: var(--text-primary);
    background: var(--bg-page);
    min-height: 100vh;
    padding: var(--space-24);
}

h1, h2, h3, h4 {
    font-family: var(--font-heading);
    color: var(--text-primary);
    line-height: 1.2;
}

h1 { font-size: 2.25rem; font-weight: 800; }
h2 { font-size: 1.25rem; font-weight: 700; }
h3 { font-size: 1.125rem; font-weight: 600; }
h4 { font-size: 1rem; font-weight: 500; }

p, li {
    font-size: 1rem;
    line-height: 1.5;
    max-width: var(--max-line-length);
}

/* ============================================
   Layout Container
   ============================================ */
.container {
    max-width: var(--max-content-width);
    margin: 0 auto;
}

/* ============================================
   Header
   ============================================ */
.header {
    text-align: center;
    margin-bottom: var(--space-32);
    padding: var(--space-32) var(--space-24);
    background: linear-gradient(135deg, var(--brand-grape) 0%, var(--brand-indigo) 100%);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
}

.header h1 {
    font-size: 2.25rem;
    font-weight: 800;
    color: var(--text-on-dark);
    margin-bottom: var(--space-8);
    letter-spacing: -0.02em;
}

.header .subtitle {
    font-family: var(--font-body);
    font-size: 1.1rem;
    font-weight: 400;
    color: var(--text-on-dark);
    opacity: 0.9;
    margin-bottom: var(--space-24);
}

/* Progress Bar */
.progress-container {
    display: flex;
    align-items: center;
    gap: var(--space-16);
    max-width: 400px;
    margin: 0 auto;
}

.progress-bar {
    flex: 1;
    height: 8px;
    background: rgba(255,255,255,0.25);
    border-radius: var(--radius-pill);
    overflow: hidden;
}

.progress-fill {
    height: 100%;
    background: var(--brand-green);
    width: 0%;
    transition: width var(--transition-slow);
    border-radius: var(--radius-pill);
}

.progress-text {
    font-family: var(--font-heading);
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-on-dark);
    min-width: 100px;
    text-align: right;
}

/* ============================================
   Card / Section Styles
   ============================================ */
.section {
    background: var(--bg-surface);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-lg);
    margin-bottom: var(--space-16);
    box-shadow: var(--shadow-sm);
    overflow: hidden;
    transition: box-shadow var(--transition-normal), transform var(--transition-normal);
}

.section:hover {
    box-shadow: var(--shadow-card-hover);
    transform: translateY(-1px);
}

.section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-16) var(--space-24);
    background: var(--bg-muted);
    cursor: pointer;
    user-select: none;
    transition: background var(--transition-fast);
}

.section-header:hover {
    background: var(--brand-sand);
}

.section-title {
    display: flex;
    align-items: center;
    gap: var(--space-12);
}

.section-title h2 {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
}

.section-icon {
    font-size: 1.25rem;
    color: var(--brand-grape);
}

.section-status {
    display: flex;
    align-items: center;
    gap: var(--space-8);
}

/* Status Badges */
.status-badge {
    font-family: var(--font-heading);
    padding: var(--space-4) var(--space-12);
    border-radius: var(--radius-pill);
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.02em;
}

.status-incomplete {
    background: var(--color-danger-light);
    color: var(--color-danger);
}

.status-complete {
    background: rgba(111, 191, 115, 0.15);
    color: #4A8A4D;
}

.status-partial {
    background: rgba(233, 168, 96, 0.15);
    color: #B07A40;
}

.toggle-icon {
    font-size: 1rem;
    color: var(--text-secondary);
    transition: transform var(--transition-fast);
}

.section.collapsed .toggle-icon {
    transform: rotate(-90deg);
}

.section-content {
    padding: var(--space-24);
    border-top: 1px solid var(--border-default);
}

.section.collapsed .section-content {
    display: none;
}

/* ============================================
   Form Elements
   ============================================ */
.form-group {
    margin-bottom: var(--space-24);
}

.form-group:last-child {
    margin-bottom: 0;
}

.form-label {
    display: block;
    font-family: var(--font-heading);
    font-weight: 500;
    font-size: 0.875rem;
    margin-bottom: var(--space-8);
    color: var(--text-primary);
}

.form-label .required {
    color: var(--color-danger);
    margin-left: var(--space-2);
}

.form-help {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    margin-top: var(--space-4);
}

.form-input,
.form-select,
.form-textarea {
    width: 100%;
    padding: var(--space-12) var(--space-16);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    font-family: var(--font-body);
    font-size: 1rem;
    color: var(--text-primary);
    background: var(--bg-surface);
    transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.form-input::placeholder,
.form-textarea::placeholder {
    color: var(--text-light);
}

.form-input:focus,
.form-select:focus,
.form-textarea:focus {
    outline: none;
    border-color: var(--brand-grape);
    box-shadow: 0 0 0 3px rgba(95, 59, 140, 0.15);
}

.form-input.error,
.form-select.error,
.form-textarea.error {
    border-color: var(--color-danger);
    box-shadow: 0 0 0 3px rgba(216, 96, 96, 0.15);
}

.form-textarea {
    min-height: 100px;
    resize: vertical;
}

.form-checkbox-group {
    display: flex;
    align-items: center;
    gap: var(--space-8);
}

.form-checkbox {
    width: 18px;
    height: 18px;
    cursor: pointer;
    accent-color: var(--brand-grape);
}

.form-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: var(--space-16);
}

/* ============================================
   Repeating Fields
   ============================================ */
.repeating-field {
    background: var(--bg-muted);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    padding: var(--space-16);
    margin-bottom: var(--space-12);
}

.repeating-field-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-12);
}

.repeating-field-title {
    font-family: var(--font-heading);
    font-weight: 500;
    font-size: 0.875rem;
    color: var(--text-secondary);
}

.btn-remove {
    background: none;
    border: none;
    color: var(--color-danger);
    cursor: pointer;
    font-size: 1.25rem;
    padding: var(--space-4) var(--space-8);
    border-radius: var(--radius-sm);
    transition: background var(--transition-fast);
}

.btn-remove:hover {
    background: var(--color-danger-light);
}

.btn-add {
    display: inline-flex;
    align-items: center;
    gap: var(--space-8);
    padding: var(--space-8) var(--space-16);
    background: transparent;
    border: 2px dashed var(--border-default);
    border-radius: var(--radius-md);
    color: var(--text-secondary);
    font-family: var(--font-body);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all var(--transition-fast);
}

.btn-add:hover {
    border-color: var(--brand-grape);
    color: var(--brand-grape);
    background: rgba(95, 59, 140, 0.05);
}

/* ============================================
   Buttons
   ============================================ */
.actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-24);
    background: var(--bg-surface);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-sm);
    margin-top: var(--space-24);
}

.action-group-left,
.action-group-right {
    display: flex;
    gap: var(--space-12);
}

.btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-8);
    padding: var(--space-12) var(--space-24);
    border: none;
    border-radius: var(--radius-md);
    font-family: var(--font-heading);
    font-size: 0.9375rem;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--transition-fast);
    text-decoration: none;
}

.btn:focus {
    outline: none;
    box-shadow: 0 0 0 3px rgba(95, 59, 140, 0.25);
}

.btn-icon {
    font-size: 1rem;
}

/* Primary Button - Apricot CTA */
.btn-primary {
    background: var(--brand-apricot);
    color: var(--brand-indigo);
}

.btn-primary:hover {
    background: var(--brand-apricot-hover);
    transform: translateY(-1px);
    box-shadow: var(--shadow-md);
}

/* Secondary Button - Outlined Grape */
.btn-secondary {
    background: transparent;
    color: var(--brand-grape);
    border: 2px solid var(--brand-grape);
}

.btn-secondary:hover {
    background: rgba(95, 59, 140, 0.08);
}

/* Success Button */
.btn-success {
    background: var(--brand-green);
    color: var(--neutral-100);
}

.btn-success:hover {
    background: #5EAE62;
    transform: translateY(-1px);
    box-shadow: var(--shadow-md);
}

/* ============================================
   Validation Summary
   ============================================ */
.validation-summary {
    background: var(--color-danger-light);
    border: 1px solid rgba(216, 96, 96, 0.3);
    border-radius: var(--radius-lg);
    padding: var(--space-24);
    margin-top: var(--space-24);
}

.validation-summary h3 {
    font-family: var(--font-heading);
    color: var(--color-danger);
    margin-bottom: var(--space-12);
    font-size: 1rem;
}

.validation-summary ul {
    list-style: none;
    padding-left: 0;
}

.validation-summary li {
    padding: var(--space-8) 0;
    border-bottom: 1px solid rgba(216, 96, 96, 0.2);
    color: var(--color-danger);
    font-size: 0.9375rem;
}

.validation-summary li:last-child {
    border-bottom: none;
}

/* ============================================
   Toast Notifications
   ============================================ */
.toast {
    position: fixed;
    bottom: var(--space-24);
    right: var(--space-24);
    padding: var(--space-16) var(--space-24);
    background: var(--brand-indigo);
    color: var(--text-on-dark);
    font-family: var(--font-body);
    font-weight: 500;
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    opacity: 0;
    transform: translateY(var(--space-24));
    transition: all var(--transition-normal);
    z-index: 1000;
}

.toast.show {
    opacity: 1;
    transform: translateY(0);
}

.toast.success {
    background: var(--brand-green);
}

.toast.error {
    background: var(--color-danger);
}

/* ============================================
   Utility Classes
   ============================================ */
.hidden {
    display: none !important;
}

.conditional-field {
    transition: opacity var(--transition-fast), max-height var(--transition-normal);
}

.conditional-field.hidden {
    opacity: 0;
    max-height: 0;
    overflow: hidden;
    margin: 0;
    padding: 0;
}

/* Section Subheadings */
.section-content h3 {
    font-family: var(--font-heading);
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-secondary);
    margin: var(--space-24) 0 var(--space-16);
    text-transform: uppercase;
    letter-spacing: 0.03em;
}

.section-content h3:first-child {
    margin-top: 0;
}

.section-content h4 {
    font-family: var(--font-heading);
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: var(--space-12);
}

/* ============================================
   Responsive Design - Mobile First
   ============================================ */
@media (max-width: 768px) {
    body {
        padding: var(--space-16);
    }

    .header {
        padding: var(--space-24) var(--space-16);
    }

    .header h1 {
        font-size: 1.75rem;
    }

    .header .subtitle {
        font-size: 1rem;
    }

    .progress-container {
        flex-direction: column;
        gap: var(--space-8);
    }

    .progress-text {
        text-align: center;
    }

    .section-header {
        padding: var(--space-12) var(--space-16);
    }

    .section-content {
        padding: var(--space-16);
    }

    .actions {
        flex-direction: column;
        gap: var(--space-16);
        padding: var(--space-16);
    }

    .action-group-left,
    .action-group-right {
        width: 100%;
        flex-direction: column;
    }

    .btn {
        width: 100%;
        justify-content: center;
    }

    .form-row {
        grid-template-columns: 1fr;
    }
}

@media (max-width: 480px) {
    .header h1 {
        font-size: 1.5rem;
    }

    .section-title h2 {
        font-size: 0.9rem;
    }

    .status-badge {
        padding: var(--space-2) var(--space-8);
        font-size: 0.65rem;
    }
}

/* ============================================
   Focus States - Accessibility
   ============================================ */
:focus-visible {
    outline: 2px solid var(--brand-grape);
    outline-offset: 2px;
}

/* Ensure sufficient contrast for accessibility */
.form-help {
    color: #6B6B6B; /* WCAG AA compliant on white */
}

/* ============================================
   Attachment Dropzone
   ============================================ */
.attachment-dropzone {
    border: 2px dashed var(--border-default);
    border-radius: var(--radius-md);
    padding: var(--space-32);
    text-align: center;
    cursor: pointer;
    transition: all var(--transition-fast);
    background: var(--bg-muted);
}

.attachment-dropzone:hover,
.attachment-dropzone.dragover {
    border-color: var(--brand-grape);
    background: rgba(95, 59, 140, 0.05);
}

.dropzone-content {
    pointer-events: none;
}

.dropzone-icon {
    font-size: 2.5rem;
    display: block;
    margin-bottom: var(--space-12);
    opacity: 0.6;
}

.dropzone-content p {
    font-family: var(--font-heading);
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: var(--space-4);
}

.dropzone-hint {
    font-size: 0.8125rem;
    color: var(--text-secondary);
}

.attachment-list {
    margin-top: var(--space-16);
}

.attachment-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-12) var(--space-16);
    background: var(--bg-surface);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-8);
}

.attachment-info {
    display: flex;
    align-items: center;
    gap: var(--space-12);
    flex: 1;
    min-width: 0;
}

.attachment-icon {
    font-size: 1.5rem;
    flex-shrink: 0;
}

.attachment-details {
    min-width: 0;
}

.attachment-name {
    font-weight: 500;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.attachment-size {
    font-size: 0.8125rem;
    color: var(--text-secondary);
}

.attachment-remove {
    background: none;
    border: none;
    color: var(--color-danger);
    cursor: pointer;
    padding: var(--space-4) var(--space-8);
    border-radius: var(--radius-sm);
    font-size: 1.25rem;
    transition: background var(--transition-fast);
    flex-shrink: 0;
}

.attachment-remove:hover {
    background: var(--color-danger-light);
}

.attachment-error {
    color: var(--color-danger);
    font-size: 0.875rem;
    margin-top: var(--space-8);
}

/* ============================================
   Print Styles
   ============================================ */
@media print {
    body {
        background: white;
        padding: 0;
    }

    .header {
        background: none;
        color: var(--text-primary);
        box-shadow: none;
        border-bottom: 2px solid var(--brand-grape);
    }

    .header h1,
    .header .subtitle {
        color: var(--text-primary);
    }

    .actions,
    .btn-add,
    .btn-remove {
        display: none;
    }

    .section {
        break-inside: avoid;
        box-shadow: none;
        border: 1px solid var(--border-default);
    }

    .section.collapsed .section-content {
        display: block;
    }
}
`;
  }

  /**
   * Generate form sections HTML
   */
  generateSections() {
    const sections = [
      this.generateProjectIdentitySection(),
      this.generateGoalsSection(),
      this.generateScopeSection(),
      this.generateDataSourcesSection(),
      this.generateTimelineBudgetSection(),
      this.generateDependenciesRisksSection(),
      this.generateTechnicalRequirementsSection(),
      this.generateApprovalSection()
    ];

    return sections.join('\n');
  }

  generateProjectIdentitySection() {
    return `
            <section class="section" data-section="projectIdentity">
                <div class="section-header" onclick="toggleSection('projectIdentity')">
                    <div class="section-title">
                        <span class="section-icon">&#128193;</span>
                        <h2>Project Identity</h2>
                    </div>
                    <div class="section-status">
                        <span class="status-badge status-incomplete" id="projectIdentity-status">Incomplete</span>
                        <span class="toggle-icon">&#9660;</span>
                    </div>
                </div>
                <div class="section-content" id="projectIdentity-content">
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">Project Name <span class="required">*</span></label>
                            <input type="text" class="form-input" name="projectIdentity.projectName"
                                   placeholder="e.g., Sales Pipeline Dashboard" required>
                            <div class="form-help">Choose a clear, descriptive name</div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Project Code</label>
                            <input type="text" class="form-input" name="projectIdentity.projectCode"
                                   placeholder="e.g., PROJ-2024-001">
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Project Type <span class="required">*</span></label>
                        <select class="form-select" name="projectIdentity.projectType" required onchange="handleProjectTypeChange(this.value)">
                            <option value="">Select project type...</option>
                            ${enums.PROJECT_TYPES.map(t => `<option value="${t}">${this.formatLabel(t)}</option>`).join('')}
                        </select>
                    </div>

                    <h3 style="margin: 24px 0 16px; font-size: 1rem; color: var(--text-light);">Project Owner</h3>
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">Name <span class="required">*</span></label>
                            <input type="text" class="form-input" name="projectIdentity.projectOwner.name" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Email <span class="required">*</span></label>
                            <input type="email" class="form-input" name="projectIdentity.projectOwner.email" required>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">Role/Title</label>
                            <input type="text" class="form-input" name="projectIdentity.projectOwner.role">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Department</label>
                            <input type="text" class="form-input" name="projectIdentity.projectOwner.department">
                        </div>
                    </div>

                    <h3 style="margin: 24px 0 16px; font-size: 1rem; color: var(--text-light);">Additional Stakeholders</h3>
                    <div id="stakeholders-container"></div>
                    <button type="button" class="btn-add" onclick="addStakeholder()">
                        <span>+</span> Add Stakeholder
                    </button>
                </div>
            </section>`;
  }

  generateGoalsSection() {
    return `
            <section class="section collapsed" data-section="goalsObjectives">
                <div class="section-header" onclick="toggleSection('goalsObjectives')">
                    <div class="section-title">
                        <span class="section-icon">&#127919;</span>
                        <h2>Goals & Objectives</h2>
                    </div>
                    <div class="section-status">
                        <span class="status-badge status-incomplete" id="goalsObjectives-status">Incomplete</span>
                        <span class="toggle-icon">&#9660;</span>
                    </div>
                </div>
                <div class="section-content" id="goalsObjectives-content">
                    <div class="form-group">
                        <label class="form-label">Primary Business Objective <span class="required">*</span></label>
                        <textarea class="form-textarea" name="goalsObjectives.businessObjective"
                                  placeholder="What business problem does this project solve? Why is it needed?" required></textarea>
                        <div class="form-help">Be specific about the problem and its impact</div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Expected Outcome</label>
                        <textarea class="form-textarea" name="goalsObjectives.expectedOutcome"
                                  placeholder="Describe the ideal end state when this project is complete"></textarea>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Business Impact if Not Done</label>
                        <textarea class="form-textarea" name="goalsObjectives.businessImpact"
                                  placeholder="What happens if we don't do this project?"></textarea>
                    </div>

                    <h3 style="margin: 24px 0 16px; font-size: 1rem; color: var(--text-light);">Success Metrics <span class="required">*</span></h3>
                    <div id="successMetrics-container">
                        <div class="repeating-field" data-index="0">
                            <div class="repeating-field-header">
                                <span class="repeating-field-title">Metric #1</span>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label class="form-label">Metric Name <span class="required">*</span></label>
                                    <input type="text" class="form-input" name="goalsObjectives.successMetrics[0].metric"
                                           placeholder="e.g., Pipeline Visibility" required>
                                </div>
                                <div class="form-group">
                                    <label class="form-label">Current Value</label>
                                    <input type="text" class="form-input" name="goalsObjectives.successMetrics[0].currentValue"
                                           placeholder="e.g., 30%">
                                </div>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label class="form-label">Target Value</label>
                                    <input type="text" class="form-input" name="goalsObjectives.successMetrics[0].targetValue"
                                           placeholder="e.g., 80%">
                                </div>
                                <div class="form-group">
                                    <label class="form-label">How Measured</label>
                                    <input type="text" class="form-input" name="goalsObjectives.successMetrics[0].measurementMethod"
                                           placeholder="e.g., Dashboard report">
                                </div>
                            </div>
                        </div>
                    </div>
                    <button type="button" class="btn-add" onclick="addSuccessMetric()">
                        <span>+</span> Add Success Metric
                    </button>
                </div>
            </section>`;
  }

  generateScopeSection() {
    return `
            <section class="section collapsed" data-section="scope">
                <div class="section-header" onclick="toggleSection('scope')">
                    <div class="section-title">
                        <span class="section-icon">&#128203;</span>
                        <h2>Project Scope</h2>
                    </div>
                    <div class="section-status">
                        <span class="status-badge status-incomplete" id="scope-status">Incomplete</span>
                        <span class="toggle-icon">&#9660;</span>
                    </div>
                </div>
                <div class="section-content" id="scope-content">
                    <h3 style="margin-bottom: 16px; font-size: 1rem; color: var(--text-light);">In Scope <span class="required">*</span></h3>
                    <div id="inScope-container">
                        <div class="repeating-field" data-index="0">
                            <div class="repeating-field-header">
                                <span class="repeating-field-title">Feature #1</span>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label class="form-label">Feature/Deliverable <span class="required">*</span></label>
                                    <input type="text" class="form-input" name="scope.inScope[0].feature" required>
                                </div>
                                <div class="form-group">
                                    <label class="form-label">Priority</label>
                                    <select class="form-select" name="scope.inScope[0].priority">
                                        ${enums.PRIORITY_LEVELS.map(p => `<option value="${p}">${this.formatLabel(p)}</option>`).join('')}
                                    </select>
                                </div>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Description</label>
                                <textarea class="form-textarea" name="scope.inScope[0].description"
                                          placeholder="Detailed description of this feature"></textarea>
                            </div>
                        </div>
                    </div>
                    <button type="button" class="btn-add" onclick="addScopeItem()">
                        <span>+</span> Add Feature
                    </button>

                    <h3 style="margin: 24px 0 16px; font-size: 1rem; color: var(--text-light);">Out of Scope</h3>
                    <div class="form-group">
                        <textarea class="form-textarea" name="scope.outOfScope"
                                  placeholder="List items explicitly excluded from this project (one per line)"></textarea>
                        <div class="form-help">Prevents scope creep by documenting exclusions</div>
                    </div>

                    <h3 style="margin: 24px 0 16px; font-size: 1rem; color: var(--text-light);">Assumptions</h3>
                    <div id="assumptions-container"></div>
                    <button type="button" class="btn-add" onclick="addAssumption()">
                        <span>+</span> Add Assumption
                    </button>

                    <h3 style="margin: 24px 0 16px; font-size: 1rem; color: var(--text-light);">Constraints</h3>
                    <div class="form-group">
                        <textarea class="form-textarea" name="scope.constraints"
                                  placeholder="List any limitations or restrictions (one per line)"></textarea>
                    </div>
                </div>
            </section>`;
  }

  generateDataSourcesSection() {
    return `
            <section class="section collapsed" data-section="dataSources">
                <div class="section-header" onclick="toggleSection('dataSources')">
                    <div class="section-title">
                        <span class="section-icon">&#128451;</span>
                        <h2>Data Sources & Integrations</h2>
                    </div>
                    <div class="section-status">
                        <span class="status-badge status-incomplete" id="dataSources-status">Optional</span>
                        <span class="toggle-icon">&#9660;</span>
                    </div>
                </div>
                <div class="section-content" id="dataSources-content">
                    <h3 style="margin-bottom: 16px; font-size: 1rem; color: var(--text-light);">Primary Data Sources</h3>
                    <div id="dataSources-container"></div>
                    <button type="button" class="btn-add" onclick="addDataSource()">
                        <span>+</span> Add Data Source
                    </button>

                    <h3 style="margin: 24px 0 16px; font-size: 1rem; color: var(--text-light);">Integrations</h3>
                    <div id="integrations-container"></div>
                    <button type="button" class="btn-add" onclick="addIntegration()">
                        <span>+</span> Add Integration
                    </button>

                    <div class="form-group" style="margin-top: 24px;">
                        <label class="form-label">Existing Automations to Consider</label>
                        <textarea class="form-textarea" name="dataSources.existingAutomations"
                                  placeholder="List current workflows, flows, or processes that may be affected"></textarea>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Data Quality Notes</label>
                        <textarea class="form-textarea" name="dataSources.dataQualityNotes"
                                  placeholder="Known issues with data quality, completeness, etc."></textarea>
                    </div>
                </div>
            </section>`;
  }

  generateTimelineBudgetSection() {
    return `
            <section class="section collapsed" data-section="timelineBudget">
                <div class="section-header" onclick="toggleSection('timelineBudget')">
                    <div class="section-title">
                        <span class="section-icon">&#128197;</span>
                        <h2>Timeline & Budget</h2>
                    </div>
                    <div class="section-status">
                        <span class="status-badge status-incomplete" id="timelineBudget-status">Incomplete</span>
                        <span class="toggle-icon">&#9660;</span>
                    </div>
                </div>
                <div class="section-content" id="timelineBudget-content">
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">Target Start Date <span class="required">*</span></label>
                            <input type="date" class="form-input" name="timelineBudget.targetStartDate" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Target End Date <span class="required">*</span></label>
                            <input type="date" class="form-input" name="timelineBudget.targetEndDate" required>
                        </div>
                    </div>

                    <div class="form-group">
                        <div class="form-checkbox-group">
                            <input type="checkbox" class="form-checkbox" name="timelineBudget.hardDeadline"
                                   id="hardDeadline" onchange="toggleDeadlineReason()">
                            <label for="hardDeadline">This is a hard deadline (cannot be moved)</label>
                        </div>
                    </div>

                    <div class="form-group conditional-field hidden" id="deadlineReasonGroup">
                        <label class="form-label">Deadline Reason <span class="required">*</span></label>
                        <input type="text" class="form-input" name="timelineBudget.deadlineReason"
                               placeholder="e.g., Fiscal year end, product launch">
                    </div>

                    <h3 style="margin: 24px 0 16px; font-size: 1rem; color: var(--text-light);">Key Milestones</h3>
                    <div id="milestones-container"></div>
                    <button type="button" class="btn-add" onclick="addMilestone()">
                        <span>+</span> Add Milestone
                    </button>

                    <h3 style="margin: 24px 0 16px; font-size: 1rem; color: var(--text-light);">Budget</h3>
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">Budget Range</label>
                            <select class="form-select" name="timelineBudget.budgetRange">
                                <option value="">Select range...</option>
                                ${enums.BUDGET_RANGES.map(b => `<option value="${b}">${b}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Budget Flexibility</label>
                            <select class="form-select" name="timelineBudget.budgetFlexibility">
                                <option value="">Select flexibility...</option>
                                ${enums.BUDGET_FLEXIBILITY.map(b => `<option value="${b}">${this.formatLabel(b)}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Budget Notes</label>
                        <textarea class="form-textarea" name="timelineBudget.budgetNotes"
                                  placeholder="Any context about budget constraints or approvals"></textarea>
                    </div>
                </div>
            </section>`;
  }

  generateDependenciesRisksSection() {
    return `
            <section class="section collapsed" data-section="dependenciesRisks">
                <div class="section-header" onclick="toggleSection('dependenciesRisks')">
                    <div class="section-title">
                        <span class="section-icon">&#9888;</span>
                        <h2>Dependencies & Risks</h2>
                    </div>
                    <div class="section-status">
                        <span class="status-badge status-incomplete" id="dependenciesRisks-status">Optional</span>
                        <span class="toggle-icon">&#9660;</span>
                    </div>
                </div>
                <div class="section-content" id="dependenciesRisks-content">
                    <h3 style="margin-bottom: 16px; font-size: 1rem; color: var(--text-light);">Dependencies</h3>
                    <div id="dependencies-container"></div>
                    <button type="button" class="btn-add" onclick="addDependency()">
                        <span>+</span> Add Dependency
                    </button>

                    <h3 style="margin: 24px 0 16px; font-size: 1rem; color: var(--text-light);">Identified Risks</h3>
                    <div id="risks-container"></div>
                    <button type="button" class="btn-add" onclick="addRisk()">
                        <span>+</span> Add Risk
                    </button>

                    <div class="form-group" style="margin-top: 24px;">
                        <label class="form-label">Known Blockers</label>
                        <textarea class="form-textarea" name="dependenciesRisks.blockers"
                                  placeholder="Issues currently blocking progress (one per line)"></textarea>
                    </div>
                </div>
            </section>`;
  }

  generateTechnicalRequirementsSection() {
    return `
            <section class="section collapsed" data-section="technicalRequirements">
                <div class="section-header" onclick="toggleSection('technicalRequirements')">
                    <div class="section-title">
                        <span class="section-icon">&#9881;</span>
                        <h2>Technical Requirements</h2>
                    </div>
                    <div class="section-status">
                        <span class="status-badge status-incomplete" id="technicalRequirements-status">Optional</span>
                        <span class="toggle-icon">&#9660;</span>
                    </div>
                </div>
                <div class="section-content" id="technicalRequirements-content">
                    <div class="form-group">
                        <label class="form-label">Target Platforms</label>
                        <div class="form-checkbox-group" style="flex-wrap: wrap; gap: 16px;">
                            <label><input type="checkbox" name="technicalRequirements.platforms" value="salesforce" onchange="togglePlatformSection()"> Salesforce</label>
                            <label><input type="checkbox" name="technicalRequirements.platforms" value="hubspot" onchange="togglePlatformSection()"> HubSpot</label>
                            <label><input type="checkbox" name="technicalRequirements.platforms" value="marketo"> Marketo</label>
                            <label><input type="checkbox" name="technicalRequirements.platforms" value="monday"> Monday.com</label>
                            <label><input type="checkbox" name="technicalRequirements.platforms" value="custom"> Custom</label>
                        </div>
                    </div>

                    <div class="form-group conditional-field hidden" id="salesforceOrgGroup">
                        <h4 style="margin-bottom: 12px;">Salesforce Details</h4>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">Org Alias</label>
                                <select class="form-select" name="technicalRequirements.salesforceOrg.orgAlias" id="sfOrgSelect" onchange="handleOrgAliasChange(this.value)">
                                    <option value="">Select org...</option>
                                    ${this.generateOrgOptions()}
                                    <option value="__other__">+ Add New Org...</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Org Type</label>
                                <select class="form-select" name="technicalRequirements.salesforceOrg.orgType" id="sfOrgType">
                                    <option value="">Select type...</option>
                                    ${enums.SF_ORG_TYPES.map(t => `<option value="${t}">${this.formatLabel(t)}</option>`).join('')}
                                </select>
                            </div>
                        </div>
                        <div class="form-group conditional-field hidden" id="customOrgAliasGroup">
                            <label class="form-label">New Org Alias</label>
                            <input type="text" class="form-input" name="technicalRequirements.salesforceOrg.customOrgAlias" id="customOrgAlias"
                                   placeholder="e.g., my-sandbox">
                            <div class="form-help">Enter the alias for a Salesforce org not listed above. Run <code>sf org list</code> to see configured orgs.</div>
                        </div>
                        <div class="form-checkbox-group" style="flex-wrap: wrap; gap: 16px; margin-top: 12px;">
                            <label><input type="checkbox" name="technicalRequirements.salesforceOrg.hasApex" checked> Apex Development Allowed</label>
                            <label><input type="checkbox" name="technicalRequirements.salesforceOrg.hasCPQ"> CPQ Installed</label>
                            <label><input type="checkbox" name="technicalRequirements.salesforceOrg.hasExperience"> Experience Cloud</label>
                        </div>
                    </div>

                    <div class="form-group conditional-field hidden" id="hubspotPortalGroup">
                        <h4 style="margin-bottom: 12px;">HubSpot Details</h4>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">Portal ID</label>
                                <input type="text" class="form-input" name="technicalRequirements.hubspotPortal.portalId">
                            </div>
                            <div class="form-group">
                                <label class="form-label">Tier</label>
                                <select class="form-select" name="technicalRequirements.hubspotPortal.tier">
                                    <option value="">Select tier...</option>
                                    ${enums.HUBSPOT_TIERS.map(t => `<option value="${t}">${this.formatLabel(t)}</option>`).join('')}
                                </select>
                            </div>
                        </div>
                        <div class="form-checkbox-group" style="margin-top: 12px;">
                            <label><input type="checkbox" name="technicalRequirements.hubspotPortal.hasOperationsHub"> Operations Hub Enabled</label>
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Estimated Complexity</label>
                        <select class="form-select" name="technicalRequirements.complexity">
                            <option value="">Select complexity...</option>
                            ${enums.COMPLEXITY_LEVELS.map(c => `<option value="${c}">${this.formatLabel(c)}</option>`).join('')}
                        </select>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Security Requirements</label>
                        <textarea class="form-textarea" name="technicalRequirements.securityRequirements"
                                  placeholder="Compliance, access control, data privacy needs (one per line)"></textarea>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Performance Requirements</label>
                        <textarea class="form-textarea" name="technicalRequirements.performanceRequirements"
                                  placeholder="Speed, scalability, volume constraints (one per line)"></textarea>
                    </div>
                </div>
            </section>`;
  }

  generateApprovalSection() {
    return `
            <section class="section collapsed" data-section="approvalSignoff">
                <div class="section-header" onclick="toggleSection('approvalSignoff')">
                    <div class="section-title">
                        <span class="section-icon">&#10004;</span>
                        <h2>Approval & Sign-off</h2>
                    </div>
                    <div class="section-status">
                        <span class="status-badge status-incomplete" id="approvalSignoff-status">Optional</span>
                        <span class="toggle-icon">&#9660;</span>
                    </div>
                </div>
                <div class="section-content" id="approvalSignoff-content">
                    <h3 style="margin-bottom: 16px; font-size: 1rem; color: var(--text-light);">Required Approvers</h3>
                    <div id="approvers-container"></div>
                    <button type="button" class="btn-add" onclick="addApprover()">
                        <span>+</span> Add Approver
                    </button>

                    <h3 style="margin: 24px 0 16px; font-size: 1rem; color: var(--text-light);">Communication Plan</h3>
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">Preferred Channel</label>
                            <select class="form-select" name="approvalSignoff.communicationPlan.preferredChannel">
                                <option value="">Select channel...</option>
                                ${enums.COMMUNICATION_CHANNELS.map(c => `<option value="${c}">${this.formatLabel(c)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Update Frequency</label>
                            <select class="form-select" name="approvalSignoff.communicationPlan.updateFrequency">
                                <option value="">Select frequency...</option>
                                ${enums.UPDATE_FREQUENCIES.map(f => `<option value="${f}">${this.formatLabel(f)}</option>`).join('')}
                            </select>
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Escalation Path</label>
                        <input type="text" class="form-input" name="approvalSignoff.communicationPlan.escalationPath"
                               placeholder="Who to contact if issues arise">
                    </div>

                    <div class="form-group">
                        <label class="form-label">Additional Notes</label>
                        <textarea class="form-textarea" name="approvalSignoff.additionalNotes"
                                  placeholder="Anything else we should know?"></textarea>
                    </div>

                    <h3 style="margin: 24px 0 16px; font-size: 1rem; color: var(--text-light);">Attachments</h3>
                    <div class="form-group">
                        <div class="attachment-dropzone" id="attachmentDropzone" onclick="document.getElementById('attachmentInput').click()">
                            <input type="file" id="attachmentInput" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.txt,.csv,.json" style="display: none;" onchange="handleAttachments(event)">
                            <div class="dropzone-content">
                                <span class="dropzone-icon">&#128206;</span>
                                <p>Drop files here or click to browse</p>
                                <span class="dropzone-hint">PDF, Word, Excel, Images, CSV, JSON (max 5MB each)</span>
                            </div>
                        </div>
                        <div id="attachmentList" class="attachment-list"></div>
                    </div>
                </div>
            </section>`;
  }

  /**
   * Generate client-side JavaScript
   */
  getClientJS() {
    return `
// Form state
let formData = {};
let sectionStatus = {};

// Enums for repeating fields
const ENUMS = ${JSON.stringify(enums)};

// Initialize - handled by checkForExistingDraft() at end of script

function initializeForm() {
    // Set today's date as default request date
    const today = new Date().toISOString().split('T')[0];
    const requestDateField = document.querySelector('[name="projectIdentity.requestDate"]');
    if (requestDateField && !requestDateField.value) {
        requestDateField.value = today;
    }

    // Add input listeners for progress tracking
    document.querySelectorAll('input, select, textarea').forEach(el => {
        el.addEventListener('input', updateProgress);
        el.addEventListener('change', updateProgress);
    });
}

// Section toggle
function toggleSection(sectionId) {
    const section = document.querySelector(\`[data-section="\${sectionId}"]\`);
    section.classList.toggle('collapsed');
}

// Update progress bar
function updateProgress() {
    const requiredFields = document.querySelectorAll('[required]');
    let filled = 0;
    let total = requiredFields.length;

    requiredFields.forEach(field => {
        if (field.value && field.value.trim()) {
            filled++;
        }
    });

    const percentage = total > 0 ? Math.round((filled / total) * 100) : 0;
    document.getElementById('progressFill').style.width = percentage + '%';
    document.getElementById('progressText').textContent = percentage + '% Complete';

    // Update section statuses
    updateSectionStatuses();
}

function updateSectionStatuses() {
    const sections = ['projectIdentity', 'goalsObjectives', 'scope', 'timelineBudget',
                      'dataSources', 'dependenciesRisks', 'technicalRequirements', 'approvalSignoff'];

    sections.forEach(section => {
        const sectionEl = document.querySelector(\`[data-section="\${section}"]\`);
        const statusBadge = document.getElementById(\`\${section}-status\`);
        const requiredFields = sectionEl.querySelectorAll('[required]');
        const allFields = sectionEl.querySelectorAll('input, select, textarea');

        let requiredFilled = 0;
        let anyFilled = false;

        requiredFields.forEach(f => {
            if (f.value && f.value.trim()) requiredFilled++;
        });

        allFields.forEach(f => {
            if (f.value && f.value.trim()) anyFilled = true;
        });

        if (requiredFields.length === 0) {
            // Optional section
            statusBadge.textContent = anyFilled ? 'Partial' : 'Optional';
            statusBadge.className = 'status-badge ' + (anyFilled ? 'status-partial' : 'status-incomplete');
        } else if (requiredFilled === requiredFields.length) {
            statusBadge.textContent = 'Complete';
            statusBadge.className = 'status-badge status-complete';
        } else if (anyFilled) {
            statusBadge.textContent = 'Partial';
            statusBadge.className = 'status-badge status-partial';
        } else {
            statusBadge.textContent = 'Incomplete';
            statusBadge.className = 'status-badge status-incomplete';
        }
    });
}

// Conditional field visibility
function toggleDeadlineReason() {
    const checkbox = document.getElementById('hardDeadline');
    const reasonGroup = document.getElementById('deadlineReasonGroup');

    if (checkbox.checked) {
        reasonGroup.classList.remove('hidden');
    } else {
        reasonGroup.classList.add('hidden');
    }
}

function togglePlatformSection() {
    const checkboxes = document.querySelectorAll('[name="technicalRequirements.platforms"]');
    const sfGroup = document.getElementById('salesforceOrgGroup');
    const hsGroup = document.getElementById('hubspotPortalGroup');

    let hasSF = false, hasHS = false;
    checkboxes.forEach(cb => {
        if (cb.checked) {
            if (cb.value === 'salesforce') hasSF = true;
            if (cb.value === 'hubspot') hasHS = true;
        }
    });

    sfGroup.classList.toggle('hidden', !hasSF);
    hsGroup.classList.toggle('hidden', !hasHS);
}

function handleProjectTypeChange(value) {
    // Auto-select platforms based on project type
    const checkboxes = document.querySelectorAll('[name="technicalRequirements.platforms"]');

    if (value.includes('salesforce')) {
        checkboxes.forEach(cb => { if (cb.value === 'salesforce') cb.checked = true; });
    }
    if (value.includes('hubspot')) {
        checkboxes.forEach(cb => { if (cb.value === 'hubspot') cb.checked = true; });
    }
    if (value === 'cross-platform-integration') {
        checkboxes.forEach(cb => {
            if (cb.value === 'salesforce' || cb.value === 'hubspot') cb.checked = true;
        });
    }

    togglePlatformSection();
}

// Handle Salesforce org alias selection
function handleOrgAliasChange(value) {
    const customGroup = document.getElementById('customOrgAliasGroup');
    const customInput = document.getElementById('customOrgAlias');
    const orgTypeSelect = document.getElementById('sfOrgType');
    const orgSelect = document.getElementById('sfOrgSelect');

    if (value === '__other__') {
        // Show custom input
        customGroup.classList.remove('hidden');
        customInput.focus();
    } else {
        // Hide custom input
        customGroup.classList.add('hidden');
        customInput.value = '';

        // Auto-set org type based on selection
        if (value) {
            const selectedOption = orgSelect.options[orgSelect.selectedIndex];
            const orgType = selectedOption.getAttribute('data-type');
            if (orgType && orgTypeSelect) {
                // Map detected type to form option
                const typeMap = {
                    'sandbox': 'sandbox',
                    'production': 'production',
                    'scratch': 'scratch'
                };
                if (typeMap[orgType]) {
                    orgTypeSelect.value = typeMap[orgType];
                }
            }
        }
    }
}

// Repeating field handlers
let counters = {
    stakeholders: 0,
    successMetrics: 1,
    inScope: 1,
    assumptions: 0,
    dataSources: 0,
    integrations: 0,
    milestones: 0,
    dependencies: 0,
    risks: 0,
    approvers: 0
};

function addStakeholder() {
    const container = document.getElementById('stakeholders-container');
    const index = counters.stakeholders++;

    const html = \`
        <div class="repeating-field" data-index="\${index}">
            <div class="repeating-field-header">
                <span class="repeating-field-title">Stakeholder #\${index + 1}</span>
                <button type="button" class="btn-remove" onclick="removeRepeatingField(this)">&times;</button>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Name</label>
                    <input type="text" class="form-input" name="projectIdentity.stakeholders[\${index}].name">
                </div>
                <div class="form-group">
                    <label class="form-label">Email</label>
                    <input type="email" class="form-input" name="projectIdentity.stakeholders[\${index}].email">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Role</label>
                    <input type="text" class="form-input" name="projectIdentity.stakeholders[\${index}].role">
                </div>
                <div class="form-group">
                    <label class="form-label">Notification Level</label>
                    <select class="form-select" name="projectIdentity.stakeholders[\${index}].notificationLevel">
                        \${ENUMS.NOTIFICATION_LEVELS.map(n => \`<option value="\${n}">\${formatLabel(n)}</option>\`).join('')}
                    </select>
                </div>
            </div>
        </div>
    \`;

    container.insertAdjacentHTML('beforeend', html);
}

function addSuccessMetric() {
    const container = document.getElementById('successMetrics-container');
    const index = counters.successMetrics++;

    const html = \`
        <div class="repeating-field" data-index="\${index}">
            <div class="repeating-field-header">
                <span class="repeating-field-title">Metric #\${index + 1}</span>
                <button type="button" class="btn-remove" onclick="removeRepeatingField(this)">&times;</button>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Metric Name</label>
                    <input type="text" class="form-input" name="goalsObjectives.successMetrics[\${index}].metric">
                </div>
                <div class="form-group">
                    <label class="form-label">Current Value</label>
                    <input type="text" class="form-input" name="goalsObjectives.successMetrics[\${index}].currentValue">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Target Value</label>
                    <input type="text" class="form-input" name="goalsObjectives.successMetrics[\${index}].targetValue">
                </div>
                <div class="form-group">
                    <label class="form-label">How Measured</label>
                    <input type="text" class="form-input" name="goalsObjectives.successMetrics[\${index}].measurementMethod">
                </div>
            </div>
        </div>
    \`;

    container.insertAdjacentHTML('beforeend', html);
}

function addScopeItem() {
    const container = document.getElementById('inScope-container');
    const index = counters.inScope++;

    const html = \`
        <div class="repeating-field" data-index="\${index}">
            <div class="repeating-field-header">
                <span class="repeating-field-title">Feature #\${index + 1}</span>
                <button type="button" class="btn-remove" onclick="removeRepeatingField(this)">&times;</button>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Feature/Deliverable</label>
                    <input type="text" class="form-input" name="scope.inScope[\${index}].feature">
                </div>
                <div class="form-group">
                    <label class="form-label">Priority</label>
                    <select class="form-select" name="scope.inScope[\${index}].priority">
                        \${ENUMS.PRIORITY_LEVELS.map(p => \`<option value="\${p}">\${formatLabel(p)}</option>\`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">Description</label>
                <textarea class="form-textarea" name="scope.inScope[\${index}].description"></textarea>
            </div>
        </div>
    \`;

    container.insertAdjacentHTML('beforeend', html);
}

function addAssumption() {
    const container = document.getElementById('assumptions-container');
    const index = counters.assumptions++;

    const html = \`
        <div class="repeating-field" data-index="\${index}">
            <div class="repeating-field-header">
                <span class="repeating-field-title">Assumption #\${index + 1}</span>
                <button type="button" class="btn-remove" onclick="removeRepeatingField(this)">&times;</button>
            </div>
            <div class="form-group">
                <label class="form-label">Assumption</label>
                <input type="text" class="form-input" name="scope.assumptions[\${index}].assumption">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Risk if Invalid</label>
                    <select class="form-select" name="scope.assumptions[\${index}].riskIfInvalid">
                        \${ENUMS.RISK_LEVELS.map(r => \`<option value="\${r}">\${formatLabel(r)}</option>\`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Validated By</label>
                    <input type="text" class="form-input" name="scope.assumptions[\${index}].validatedBy">
                </div>
            </div>
        </div>
    \`;

    container.insertAdjacentHTML('beforeend', html);
}

function addDataSource() {
    const container = document.getElementById('dataSources-container');
    const index = counters.dataSources++;

    const html = \`
        <div class="repeating-field" data-index="\${index}">
            <div class="repeating-field-header">
                <span class="repeating-field-title">Data Source #\${index + 1}</span>
                <button type="button" class="btn-remove" onclick="removeRepeatingField(this)">&times;</button>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Source Name</label>
                    <input type="text" class="form-input" name="dataSources.primaryDataSources[\${index}].name">
                </div>
                <div class="form-group">
                    <label class="form-label">Type</label>
                    <select class="form-select" name="dataSources.primaryDataSources[\${index}].type">
                        \${ENUMS.DATA_SOURCE_TYPES.map(t => \`<option value="\${t}">\${formatLabel(t)}</option>\`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Estimated Volume</label>
                    <input type="text" class="form-input" name="dataSources.primaryDataSources[\${index}].estimatedVolume">
                </div>
                <div class="form-group">
                    <label class="form-label">Refresh Frequency</label>
                    <input type="text" class="form-input" name="dataSources.primaryDataSources[\${index}].refreshFrequency">
                </div>
            </div>
        </div>
    \`;

    container.insertAdjacentHTML('beforeend', html);
}

function addIntegration() {
    const container = document.getElementById('integrations-container');
    const index = counters.integrations++;

    const html = \`
        <div class="repeating-field" data-index="\${index}">
            <div class="repeating-field-header">
                <span class="repeating-field-title">Integration #\${index + 1}</span>
                <button type="button" class="btn-remove" onclick="removeRepeatingField(this)">&times;</button>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Source System</label>
                    <input type="text" class="form-input" name="dataSources.integrations[\${index}].sourceSystem">
                </div>
                <div class="form-group">
                    <label class="form-label">Target System</label>
                    <input type="text" class="form-input" name="dataSources.integrations[\${index}].targetSystem">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Data Flow</label>
                    <select class="form-select" name="dataSources.integrations[\${index}].dataFlow">
                        \${ENUMS.DATA_FLOW_TYPES.map(d => \`<option value="\${d}">\${formatLabel(d)}</option>\`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Frequency</label>
                    <input type="text" class="form-input" name="dataSources.integrations[\${index}].frequency">
                </div>
            </div>
        </div>
    \`;

    container.insertAdjacentHTML('beforeend', html);
}

function addMilestone() {
    const container = document.getElementById('milestones-container');
    const index = counters.milestones++;

    const html = \`
        <div class="repeating-field" data-index="\${index}">
            <div class="repeating-field-header">
                <span class="repeating-field-title">Milestone #\${index + 1}</span>
                <button type="button" class="btn-remove" onclick="removeRepeatingField(this)">&times;</button>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Name</label>
                    <input type="text" class="form-input" name="timelineBudget.milestones[\${index}].name">
                </div>
                <div class="form-group">
                    <label class="form-label">Target Date</label>
                    <input type="date" class="form-input" name="timelineBudget.milestones[\${index}].targetDate">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">Description</label>
                <textarea class="form-textarea" name="timelineBudget.milestones[\${index}].description"></textarea>
            </div>
        </div>
    \`;

    container.insertAdjacentHTML('beforeend', html);
}

function addDependency() {
    const container = document.getElementById('dependencies-container');
    const index = counters.dependencies++;

    const html = \`
        <div class="repeating-field" data-index="\${index}">
            <div class="repeating-field-header">
                <span class="repeating-field-title">Dependency #\${index + 1}</span>
                <button type="button" class="btn-remove" onclick="removeRepeatingField(this)">&times;</button>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Dependency</label>
                    <input type="text" class="form-input" name="dependenciesRisks.dependencies[\${index}].dependency">
                </div>
                <div class="form-group">
                    <label class="form-label">Type</label>
                    <select class="form-select" name="dependenciesRisks.dependencies[\${index}].type">
                        \${ENUMS.DEPENDENCY_TYPES.map(t => \`<option value="\${t}">\${formatLabel(t)}</option>\`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Owner</label>
                    <input type="text" class="form-input" name="dependenciesRisks.dependencies[\${index}].owner">
                </div>
                <div class="form-group">
                    <label class="form-label">Status</label>
                    <select class="form-select" name="dependenciesRisks.dependencies[\${index}].status">
                        \${ENUMS.DEPENDENCY_STATUS.map(s => \`<option value="\${s}">\${formatLabel(s)}</option>\`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">What it blocks if delayed</label>
                <input type="text" class="form-input" name="dependenciesRisks.dependencies[\${index}].blocksIfDelayed">
            </div>
        </div>
    \`;

    container.insertAdjacentHTML('beforeend', html);
}

function addRisk() {
    const container = document.getElementById('risks-container');
    const index = counters.risks++;

    const html = \`
        <div class="repeating-field" data-index="\${index}">
            <div class="repeating-field-header">
                <span class="repeating-field-title">Risk #\${index + 1}</span>
                <button type="button" class="btn-remove" onclick="removeRepeatingField(this)">&times;</button>
            </div>
            <div class="form-group">
                <label class="form-label">Risk Description</label>
                <input type="text" class="form-input" name="dependenciesRisks.risks[\${index}].risk">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Probability</label>
                    <select class="form-select" name="dependenciesRisks.risks[\${index}].probability">
                        \${ENUMS.RISK_LEVELS.map(r => \`<option value="\${r}">\${formatLabel(r)}</option>\`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Impact</label>
                    <select class="form-select" name="dependenciesRisks.risks[\${index}].impact">
                        \${ENUMS.RISK_LEVELS.map(r => \`<option value="\${r}">\${formatLabel(r)}</option>\`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">Mitigation Plan</label>
                <textarea class="form-textarea" name="dependenciesRisks.risks[\${index}].mitigation"></textarea>
            </div>
        </div>
    \`;

    container.insertAdjacentHTML('beforeend', html);
}

function addApprover() {
    const container = document.getElementById('approvers-container');
    const index = counters.approvers++;

    const html = \`
        <div class="repeating-field" data-index="\${index}">
            <div class="repeating-field-header">
                <span class="repeating-field-title">Approver #\${index + 1}</span>
                <button type="button" class="btn-remove" onclick="removeRepeatingField(this)">&times;</button>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Name</label>
                    <input type="text" class="form-input" name="approvalSignoff.approvers[\${index}].name">
                </div>
                <div class="form-group">
                    <label class="form-label">Email</label>
                    <input type="email" class="form-input" name="approvalSignoff.approvers[\${index}].email">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">Approval Type</label>
                <select class="form-select" name="approvalSignoff.approvers[\${index}].approvalType">
                    \${ENUMS.APPROVAL_TYPES.map(a => \`<option value="\${a}">\${formatLabel(a)}</option>\`).join('')}
                </select>
            </div>
        </div>
    \`;

    container.insertAdjacentHTML('beforeend', html);
}

function removeRepeatingField(button) {
    const field = button.closest('.repeating-field');
    field.remove();
    updateProgress();
}

// Format label helper
function formatLabel(str) {
    return str.replace(/-/g, ' ').replace(/\\b\\w/g, l => l.toUpperCase());
}

// Collect form data
function collectFormData() {
    const form = document.getElementById('intakeForm');
    const formData = {};

    // Collect all form fields
    const inputs = form.querySelectorAll('input, select, textarea');

    inputs.forEach(input => {
        const name = input.name;
        if (!name) return;

        let value;
        if (input.type === 'checkbox') {
            if (name.includes('platforms')) {
                // Handle platform checkboxes as array
                if (input.checked) {
                    const parts = name.split('.');
                    setNestedValue(formData, parts, input.value, true);
                }
                return;
            }
            value = input.checked;
        } else {
            value = input.value;
        }

        if (value === '' || value === null || value === undefined) return;

        const parts = name.split('.');
        setNestedValue(formData, parts, value);
    });

    // Handle textarea arrays (one per line)
    ['scope.outOfScope', 'scope.constraints', 'dataSources.existingAutomations',
     'dependenciesRisks.blockers', 'technicalRequirements.securityRequirements',
     'technicalRequirements.performanceRequirements'].forEach(fieldPath => {
        const field = form.querySelector(\`[name="\${fieldPath}"]\`);
        if (field && field.value) {
            const parts = fieldPath.split('.');
            const lines = field.value.split('\\n').filter(l => l.trim());
            setNestedValue(formData, parts, lines);
        }
    });

    // Add metadata
    formData.metadata = {
        formVersion: '1.0.0',
        submittedAt: new Date().toISOString(),
        submittedBy: formData.projectIdentity?.projectOwner?.email || 'unknown'
    };

    // Add attachments (without the full base64 data for the main export)
    if (attachments.length > 0) {
        formData.attachments = attachments.map(att => ({
            id: att.id,
            name: att.name,
            size: att.size,
            type: att.type,
            data: att.data // Include base64 data
        }));
    }

    return formData;
}

function setNestedValue(obj, parts, value, isArrayPush = false) {
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
        let part = parts[i];
        const arrayMatch = part.match(/(.+)\\[(\\d+)\\]/);

        if (arrayMatch) {
            const arrayName = arrayMatch[1];
            const index = parseInt(arrayMatch[2]);

            if (!current[arrayName]) current[arrayName] = [];
            if (!current[arrayName][index]) current[arrayName][index] = {};
            current = current[arrayName][index];
        } else {
            if (!current[part]) current[part] = {};
            current = current[part];
        }
    }

    const lastPart = parts[parts.length - 1];
    const lastArrayMatch = lastPart.match(/(.+)\\[(\\d+)\\]/);

    if (lastArrayMatch) {
        const arrayName = lastArrayMatch[1];
        const index = parseInt(lastArrayMatch[2]);
        if (!current[arrayName]) current[arrayName] = [];
        current[arrayName][index] = value;
    } else if (isArrayPush) {
        if (!current[lastPart]) current[lastPart] = [];
        if (!current[lastPart].includes(value)) {
            current[lastPart].push(value);
        }
    } else {
        current[lastPart] = value;
    }
}

// Save draft to localStorage
function saveDraft() {
    const data = collectFormData();
    localStorage.setItem('intakeFormDraft', JSON.stringify(data));
    showToast('Draft saved!', 'success');
}

// Load draft - show modal with options
function loadDraft() {
    const draft = localStorage.getItem('intakeFormDraft');
    const history = JSON.parse(localStorage.getItem('intakeSubmissionHistory') || '[]');

    // Create modal
    const overlay = document.createElement('div');
    overlay.id = 'loadDraftModal';
    overlay.style.cssText = \`
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.5); display: flex;
        align-items: center; justify-content: center; z-index: 10000;
    \`;

    let draftSection = '';
    if (draft) {
        try {
            const draftData = JSON.parse(draft);
            const projectName = draftData.projectIdentity?.projectName || 'Unnamed Draft';
            const savedAt = draftData.metadata?.lastSaved ? new Date(draftData.metadata.lastSaved).toLocaleString() : 'Unknown';
            draftSection = \`
                <div style="background: linear-gradient(135deg, #f5f3ff, #ede7f6); padding: 16px; border-radius: 8px; margin-bottom: 16px; border-left: 4px solid var(--brand-grape, #5F3B8C);">
                    <h4 style="margin: 0 0 8px; color: var(--brand-grape, #5F3B8C);">Current Draft (Auto-saved)</h4>
                    <p style="margin: 0 0 12px; color: var(--text-primary, #3E4A61);">
                        <strong>\${projectName}</strong><br>
                        <span style="font-size: 12px; color: var(--text-secondary, #888);">Saved: \${savedAt}</span>
                    </p>
                    <button onclick="loadDraftData()" style="
                        padding: 8px 16px; border: none;
                        background: var(--brand-grape, #5F3B8C); color: white;
                        border-radius: 6px; font-weight: 600; cursor: pointer;
                    ">Load This Draft</button>
                </div>
            \`;
        } catch (e) {
            // Invalid draft, ignore
        }
    }

    let historySection = '';
    if (history.length > 0) {
        const historyItems = history.slice(0, 5).map((item, i) => \`
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; border-radius: 8px; background: \${i % 2 === 0 ? 'var(--bg-muted, #f5f5f5)' : 'transparent'}; margin-bottom: 8px;">
                <div>
                    <div style="font-weight: 600; color: var(--text-primary, #3E4A61);">\${item.projectName}</div>
                    <div style="font-size: 12px; color: var(--text-secondary, #888);">\${new Date(item.submittedAt).toLocaleString()}</div>
                </div>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <span style="font-size: 11px; padding: 2px 8px; background: var(--bg-muted, #eee); border-radius: 4px;">\${item.priority}</span>
                </div>
            </div>
        \`).join('');

        historySection = \`
            <div style="margin-bottom: 16px;">
                <h4 style="margin: 0 0 12px; color: var(--brand-indigo, #3E4A61);">Previous Submissions</h4>
                <div style="max-height: 200px; overflow-y: auto;">
                    \${historyItems}
                </div>
                <p style="margin: 12px 0 0; font-size: 12px; color: var(--text-secondary, #888);">
                    Note: To reload a previous submission, import the downloaded JSON file.
                </p>
            </div>
        \`;
    }

    const noDataMessage = !draft && history.length === 0 ? \`
        <p style="text-align: center; color: var(--text-secondary, #888); padding: 20px 0;">
            No saved drafts or previous submissions found.
        </p>
    \` : '';

    overlay.innerHTML = \`
        <div style="background: var(--bg-surface, white); border-radius: 12px; padding: 32px; max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
            <h2 style="margin: 0 0 20px; color: var(--brand-grape, #5F3B8C);">Load Previous Work</h2>

            \${draftSection}
            \${historySection}
            \${noDataMessage}

            <div style="background: var(--bg-muted, #EAE4DC); padding: 16px; border-radius: 8px; margin-bottom: 24px;">
                <h4 style="margin: 0 0 8px;">Import from File</h4>
                <p style="margin: 0 0 12px; font-size: 13px; color: var(--text-secondary, #666);">
                    Load a previously exported JSON file
                </p>
                <button onclick="document.getElementById('loadDraftModal').remove(); importJSON();" style="
                    padding: 8px 16px; border: 2px solid var(--brand-grape, #5F3B8C);
                    background: transparent; color: var(--brand-grape, #5F3B8C);
                    border-radius: 6px; font-weight: 600; cursor: pointer;
                ">Choose File...</button>
            </div>

            <div style="text-align: right;">
                <button onclick="document.getElementById('loadDraftModal').remove()" style="
                    padding: 12px 24px; border: 2px solid var(--text-secondary, #888);
                    background: transparent; color: var(--text-secondary, #888);
                    border-radius: 8px; font-weight: 600; cursor: pointer;
                ">Cancel</button>
            </div>
        </div>
    \`;

    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
}

// Load the current auto-saved draft
function loadDraftData() {
    document.getElementById('loadDraftModal')?.remove();
    const draft = localStorage.getItem('intakeFormDraft');
    if (draft) {
        try {
            const data = JSON.parse(draft);
            populateForm(data);
            showToast('Draft loaded', 'success');
        } catch (e) {
            console.error('Error loading draft:', e);
            showToast('Error loading draft', 'error');
        }
    }
}

// Populate form from data
function populateForm(data, prefix = '') {
    if (!data || typeof data !== 'object') return;

    // Handle attachments specially at the top level
    if (!prefix && data.attachments && Array.isArray(data.attachments)) {
        attachments = data.attachments;
        renderAttachmentList();
    }

    Object.keys(data).forEach(key => {
        // Skip attachments and metadata as they're handled separately
        if (key === 'attachments' || key === 'metadata') return;
        const fullKey = prefix ? \`\${prefix}.\${key}\` : key;
        const value = data[key];

        if (Array.isArray(value)) {
            // Handle arrays
            if (key === 'platforms') {
                // Platform checkboxes
                value.forEach(v => {
                    const cb = document.querySelector(\`[name="technicalRequirements.platforms"][value="\${v}"]\`);
                    if (cb) cb.checked = true;
                });
                togglePlatformSection();
            } else if (typeof value[0] === 'object') {
                // Array of objects - repeating fields
                value.forEach((item, index) => {
                    // Add repeating field if needed
                    const counterKey = key === 'primaryDataSources' ? 'dataSources' : key;
                    if (counters[counterKey] !== undefined && index >= counters[counterKey]) {
                        // Call the appropriate add function
                        const addFn = {
                            stakeholders: addStakeholder,
                            successMetrics: addSuccessMetric,
                            inScope: addScopeItem,
                            assumptions: addAssumption,
                            primaryDataSources: addDataSource,
                            integrations: addIntegration,
                            milestones: addMilestone,
                            dependencies: addDependency,
                            risks: addRisk,
                            approvers: addApprover
                        }[key];
                        if (addFn) addFn();
                    }
                    populateForm(item, \`\${fullKey}[\${index}]\`);
                });
            } else {
                // Array of strings
                const field = document.querySelector(\`[name="\${fullKey}"]\`);
                if (field && field.tagName === 'TEXTAREA') {
                    field.value = value.join('\\n');
                }
            }
        } else if (typeof value === 'object' && value !== null) {
            populateForm(value, fullKey);
        } else {
            // Simple value
            const field = document.querySelector(\`[name="\${fullKey}"]\`);
            if (field) {
                if (field.type === 'checkbox') {
                    field.checked = value;
                    // Trigger change for conditional fields
                    if (fullKey === 'timelineBudget.hardDeadline') {
                        toggleDeadlineReason();
                    }
                } else {
                    field.value = value;
                }
            }
        }
    });

    updateProgress();
}

// Export to JSON file
function exportJSON() {
    const data = collectFormData();
    const projectName = data.projectIdentity?.projectName || 'project';
    const safeName = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const date = new Date().toISOString().split('T')[0];

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = \`intake-\${safeName}-\${date}.json\`;
    a.click();
    URL.revokeObjectURL(url);

    showToast('JSON exported!', 'success');
}

// Store submitted data globally for the success page
let lastSubmittedData = null;
let lastSubmittedFilename = null;

// Submit to centralized queue
function submitToQueue() {
    const data = collectFormData();
    const projectName = data.projectIdentity?.projectName || 'project';
    const safeName = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const intakeId = \`\${safeName}-\${timestamp}\`;

    // Add queue metadata
    data._queue = {
        id: intakeId,
        status: 'pending',
        submittedAt: new Date().toISOString(),
        submittedBy: data.projectIdentity?.projectOwner?.email || 'form-user',
        source: 'html-form',
        priority: data.projectIdentity?.priority || 'medium'
    };

    // Queue directory path
    const queueDir = '~/.claude/intake/pending/';
    const filename = \`\${intakeId}.json\`;

    // Create the JSON content
    const jsonContent = JSON.stringify(data, null, 2);

    // Store for success page
    lastSubmittedData = data;
    lastSubmittedFilename = filename;

    // Store submission in localStorage for retrieval
    localStorage.setItem('lastIntakeSubmission', jsonContent);
    localStorage.setItem('lastIntakeFilename', filename);

    // Copy JSON to clipboard for easy pasting
    navigator.clipboard.writeText(jsonContent).catch(() => {});

    // Clear the draft since submission is complete
    localStorage.removeItem('intakeFormDraft');

    // Show the success page (no automatic download - user can download from success page)
    showSuccessPage(data, intakeId, filename, queueDir, jsonContent);
}

function showSuccessPage(data, intakeId, filename, queueDir, jsonContent) {
    // Build submission summary
    const projectName = data.projectIdentity?.projectName || 'Unnamed Project';
    const projectType = data.projectIdentity?.projectType || 'Not specified';
    const priority = data.projectIdentity?.priority || 'medium';
    const owner = data.projectIdentity?.projectOwner?.name || 'Not specified';
    const businessObjective = data.goalsObjectives?.businessObjective || 'Not specified';
    const inScopeCount = data.scope?.inScope?.length || 0;
    const risksCount = data.dependenciesRisks?.risks?.length || 0;
    const attachmentsCount = data.attachments?.length || 0;

    // Calculate completeness
    const sections = ['projectIdentity', 'goalsObjectives', 'scope', 'dataSources', 'timelineBudget', 'dependenciesRisks', 'technicalRequirements', 'approvalSignoff'];
    let filledSections = 0;
    sections.forEach(s => {
        if (data[s] && Object.keys(data[s]).length > 0) filledSections++;
    });
    const completeness = Math.round((filledSections / sections.length) * 100);

    // Priority badge colors
    const priorityColors = {
        low: { bg: '#e8f5e9', text: '#2e7d32' },
        medium: { bg: '#fff3e0', text: '#ef6c00' },
        high: { bg: '#ffebee', text: '#c62828' },
        critical: { bg: '#fce4ec', text: '#ad1457' }
    };
    const pColor = priorityColors[priority] || priorityColors.medium;

    // Hide the form and show success page - use .container selector
    const mainContent = document.querySelector('.container');
    mainContent.innerHTML = \`
        <div class="success-page" style="max-width: 800px; margin: 0 auto; padding: 40px 20px;">
            <!-- Success Header -->
            <div style="text-align: center; margin-bottom: 40px;">
                <div style="width: 80px; height: 80px; background: linear-gradient(135deg, var(--brand-green, #6FBF73), #4caf50); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; box-shadow: 0 8px 24px rgba(111, 191, 115, 0.4);">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                </div>
                <h1 style="margin: 0 0 8px; color: var(--brand-grape, #5F3B8C); font-size: 2rem;">Submission Successful!</h1>
                <p style="margin: 0; color: var(--text-secondary, #666); font-size: 1.1rem;">Your project intake has been exported and is ready for processing.</p>
            </div>

            <!-- Summary Card -->
            <div class="card" style="background: var(--bg-surface, white); border-radius: 12px; padding: 24px; margin-bottom: 24px; box-shadow: 0 4px 16px rgba(0,0,0,0.1);">
                <h2 style="margin: 0 0 20px; color: var(--brand-indigo, #3E4A61); font-size: 1.25rem; display: flex; align-items: center; gap: 8px;">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                    Submission Summary
                </h2>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
                    <div>
                        <label style="font-size: 12px; color: var(--text-secondary, #888); text-transform: uppercase; letter-spacing: 0.5px;">Project Name</label>
                        <p style="margin: 4px 0 0; font-weight: 600; color: var(--text-primary, #3E4A61);">\${projectName}</p>
                    </div>
                    <div>
                        <label style="font-size: 12px; color: var(--text-secondary, #888); text-transform: uppercase; letter-spacing: 0.5px;">Project Type</label>
                        <p style="margin: 4px 0 0; color: var(--text-primary, #3E4A61);">\${projectType.replace(/-/g, ' ').replace(/\\b\\w/g, l => l.toUpperCase())}</p>
                    </div>
                    <div>
                        <label style="font-size: 12px; color: var(--text-secondary, #888); text-transform: uppercase; letter-spacing: 0.5px;">Priority</label>
                        <p style="margin: 4px 0 0;">
                            <span style="display: inline-block; padding: 4px 12px; background: \${pColor.bg}; color: \${pColor.text}; border-radius: 12px; font-weight: 600; font-size: 13px; text-transform: capitalize;">\${priority}</span>
                        </p>
                    </div>
                    <div>
                        <label style="font-size: 12px; color: var(--text-secondary, #888); text-transform: uppercase; letter-spacing: 0.5px;">Owner</label>
                        <p style="margin: 4px 0 0; color: var(--text-primary, #3E4A61);">\${owner}</p>
                    </div>
                </div>

                <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border-color, #eee);">
                    <label style="font-size: 12px; color: var(--text-secondary, #888); text-transform: uppercase; letter-spacing: 0.5px;">Business Objective</label>
                    <p style="margin: 4px 0 0; color: var(--text-primary, #3E4A61);">\${businessObjective}</p>
                </div>

                <div style="display: flex; gap: 24px; margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border-color, #eee);">
                    <div style="text-align: center;">
                        <div style="font-size: 24px; font-weight: 700; color: var(--brand-grape, #5F3B8C);">\${inScopeCount}</div>
                        <div style="font-size: 12px; color: var(--text-secondary, #888);">In-Scope Items</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 24px; font-weight: 700; color: var(--brand-apricot, #E99560);">\${risksCount}</div>
                        <div style="font-size: 12px; color: var(--text-secondary, #888);">Risks Identified</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 24px; font-weight: 700; color: var(--brand-green, #6FBF73);">\${completeness}%</div>
                        <div style="font-size: 12px; color: var(--text-secondary, #888);">Completeness</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 24px; font-weight: 700; color: var(--brand-indigo, #3E4A61);">\${attachmentsCount}</div>
                        <div style="font-size: 12px; color: var(--text-secondary, #888);">Attachments</div>
                    </div>
                </div>
            </div>

            <!-- Next Steps Card -->
            <div class="card" style="background: var(--bg-surface, white); border-radius: 12px; padding: 24px; margin-bottom: 24px; box-shadow: 0 4px 16px rgba(0,0,0,0.1);">
                <h2 style="margin: 0 0 20px; color: var(--brand-indigo, #3E4A61); font-size: 1.25rem;">Next Steps</h2>

                <div style="background: linear-gradient(135deg, #f5f3ff, #ede7f6); padding: 16px; border-radius: 8px; margin-bottom: 16px; border-left: 4px solid var(--brand-grape, #5F3B8C);">
                    <h4 style="margin: 0 0 8px; color: var(--brand-grape, #5F3B8C);">Step 1: Download the JSON file</h4>
                    <p style="margin: 0; font-size: 13px; color: var(--text-secondary, #666);">Click the "Download JSON File" button above to save to your Downloads folder.</p>
                </div>

                <div style="background: var(--bg-muted, #EAE4DC); padding: 16px; border-radius: 8px; margin-bottom: 16px;">
                    <h4 style="margin: 0 0 8px;">Step 2: Move to intake queue</h4>
                    <code style="display: block; background: #2d2d2d; color: #f8f8f2; padding: 12px; border-radius: 4px; font-size: 13px; overflow-x: auto; margin-bottom: 8px;">mv ~/Downloads/\${filename} ~/.claude/intake/pending/</code>
                    <p style="margin: 0; font-size: 13px; color: var(--text-secondary, #666);">Creates the queue directory if needed.</p>
                </div>

                <div style="background: var(--bg-muted, #EAE4DC); padding: 16px; border-radius: 8px;">
                    <h4 style="margin: 0 0 8px;">Step 3: Process in Claude Code</h4>
                    <p style="margin: 0 0 8px; font-size: 13px; color: var(--text-secondary, #666);">In Claude Code, run:</p>
                    <code style="display: block; background: #2d2d2d; color: #f8f8f2; padding: 12px; border-radius: 4px; font-size: 13px; overflow-x: auto;">/intake --form-data ~/.claude/intake/pending/\${filename}</code>
                </div>
            </div>

            <!-- Intake ID Reference -->
            <div style="background: var(--bg-muted, #EAE4DC); padding: 16px; border-radius: 8px; margin-bottom: 32px; text-align: center;">
                <label style="font-size: 12px; color: var(--text-secondary, #888); text-transform: uppercase; letter-spacing: 0.5px;">Intake Reference ID</label>
                <p style="margin: 8px 0 0; font-family: monospace; font-size: 14px; color: var(--brand-grape, #5F3B8C); font-weight: 600;">\${intakeId}</p>
            </div>

            <!-- Clipboard Notice -->
            <div style="background: linear-gradient(135deg, #e8f5e9, #c8e6c9); padding: 16px; border-radius: 8px; margin-bottom: 24px; text-align: center; border-left: 4px solid var(--brand-green, #6FBF73);">
                <p style="margin: 0; color: #2e7d32; font-weight: 500;">
                    JSON copied to clipboard! Paste into a file or use the buttons below.
                </p>
            </div>

            <!-- Action Buttons -->
            <div style="display: flex; flex-wrap: wrap; gap: 16px; justify-content: center;">
                <button onclick="downloadIntakeJSON()" class="btn btn-primary" style="padding: 14px 28px; font-size: 1rem;">
                    Download JSON File
                </button>
                <button onclick="copyQueueCommand('\${filename}')" class="btn btn-secondary" style="padding: 14px 28px; font-size: 1rem;">
                    Copy Move Command
                </button>
                <button onclick="startNewIntake()" class="btn btn-outline" style="padding: 14px 28px; font-size: 1rem;">
                    Start New Intake
                </button>
                <button onclick="viewAllSubmissions()" class="btn btn-outline" style="padding: 14px 28px; font-size: 1rem;">
                    View Saved Intakes
                </button>
            </div>
        </div>
    \`;

    // Store in localStorage history
    saveToSubmissionHistory(data, intakeId, filename);
}

function startNewIntake() {
    // Reload the page to start fresh
    window.location.reload();
}

function downloadIntakeJSON() {
    if (lastSubmittedData && lastSubmittedFilename) {
        const jsonContent = JSON.stringify(lastSubmittedData, null, 2);
        const blob = new Blob([jsonContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = lastSubmittedFilename;
        a.click();
        URL.revokeObjectURL(url);
        showToast('File downloaded again', 'success');
    }
}

function saveToSubmissionHistory(data, intakeId, filename) {
    const history = JSON.parse(localStorage.getItem('intakeSubmissionHistory') || '[]');
    history.unshift({
        intakeId,
        filename,
        projectName: data.projectIdentity?.projectName || 'Unnamed',
        submittedAt: new Date().toISOString(),
        priority: data.projectIdentity?.priority || 'medium'
    });
    // Keep last 20 submissions
    if (history.length > 20) history.pop();
    localStorage.setItem('intakeSubmissionHistory', JSON.stringify(history));
}

function viewAllSubmissions() {
    const history = JSON.parse(localStorage.getItem('intakeSubmissionHistory') || '[]');

    if (history.length === 0) {
        showToast('No previous submissions found', 'info');
        return;
    }

    // Create modal
    const overlay = document.createElement('div');
    overlay.id = 'historyModal';
    overlay.style.cssText = \`
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.5); display: flex;
        align-items: center; justify-content: center; z-index: 10000;
    \`;

    const historyHtml = history.map((item, i) => \`
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; border-radius: 8px; background: \${i % 2 === 0 ? 'var(--bg-muted, #f5f5f5)' : 'transparent'};">
            <div>
                <div style="font-weight: 600; color: var(--text-primary, #3E4A61);">\${item.projectName}</div>
                <div style="font-size: 12px; color: var(--text-secondary, #888);">\${new Date(item.submittedAt).toLocaleString()}</div>
            </div>
            <div style="text-align: right;">
                <div style="font-size: 12px; font-family: monospace; color: var(--brand-grape, #5F3B8C);">\${item.intakeId.substring(0, 20)}...</div>
                <div style="font-size: 11px; color: var(--text-secondary, #888);">\${item.priority}</div>
            </div>
        </div>
    \`).join('');

    overlay.innerHTML = \`
        <div style="background: var(--bg-surface, white); border-radius: 12px; padding: 32px; max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
            <h2 style="margin: 0 0 20px; color: var(--brand-grape, #5F3B8C);">Previous Submissions</h2>
            <div style="max-height: 400px; overflow-y: auto;">
                \${historyHtml}
            </div>
            <div style="margin-top: 24px; text-align: right;">
                <button onclick="document.getElementById('historyModal').remove()" style="
                    padding: 12px 24px; border: 2px solid var(--brand-grape, #5F3B8C);
                    background: transparent; color: var(--brand-grape, #5F3B8C);
                    border-radius: 8px; font-weight: 600; cursor: pointer;
                ">Close</button>
            </div>
        </div>
    \`;

    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
}

function copyQueueCommand(filename) {
    const cmd = \`mkdir -p ~/.claude/intake/pending && mv ~/Downloads/\${filename} ~/.claude/intake/pending/\`;
    navigator.clipboard.writeText(cmd).then(() => {
        showToast('Command copied to clipboard!', 'success');
    });
}

// Form submission
function handleSubmit(event) {
    event.preventDefault();

    // Validate required fields
    const form = document.getElementById('intakeForm');
    const requiredFields = form.querySelectorAll('[required]');
    const errors = [];

    requiredFields.forEach(field => {
        if (!field.value || !field.value.trim()) {
            errors.push(field.name);
            field.classList.add('error');
        } else {
            field.classList.remove('error');
        }
    });

    if (errors.length > 0) {
        const summary = document.getElementById('validationSummary');
        const errorList = document.getElementById('validationErrors');
        errorList.innerHTML = errors.map(e => \`<li>Missing: \${formatLabel(e.split('.').pop())}</li>\`).join('');
        summary.style.display = 'block';
        showToast('Please fill all required fields', 'error');
        return;
    }

    document.getElementById('validationSummary').style.display = 'none';

    // Submit to queue
    submitToQueue();
}

// Toast notification
function showToast(message, type = '') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast ' + type;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Import JSON file
function importJSON() {
    document.getElementById('fileInput').click();
}

function handleFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
        showToast('Please select a JSON file', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);

            // Clear existing repeating fields before populating
            clearRepeatingFields();

            // Populate the form with imported data
            populateForm(data);

            // Also save to localStorage as backup
            localStorage.setItem('intakeFormDraft', JSON.stringify(data));

            showToast('Form loaded from ' + file.name, 'success');
        } catch (err) {
            console.error('Error parsing JSON:', err);
            showToast('Invalid JSON file format', 'error');
        }
    };
    reader.onerror = function() {
        showToast('Error reading file', 'error');
    };
    reader.readAsText(file);

    // Reset the input so the same file can be selected again
    event.target.value = '';
}

function clearRepeatingFields() {
    // Clear all repeating field containers except the first item in some cases
    const containers = [
        'stakeholders-container',
        'successMetrics-container',
        'inScope-container',
        'assumptions-container',
        'dataSources-container',
        'integrations-container',
        'milestones-container',
        'dependencies-container',
        'risks-container',
        'approvers-container'
    ];

    containers.forEach(containerId => {
        const container = document.getElementById(containerId);
        if (container) {
            // For successMetrics and inScope, keep the first item but clear its values
            if (containerId === 'successMetrics-container' || containerId === 'inScope-container') {
                const items = container.querySelectorAll('.repeating-field');
                items.forEach((item, index) => {
                    if (index === 0) {
                        // Clear the values in the first item
                        item.querySelectorAll('input, select, textarea').forEach(input => {
                            if (input.type === 'checkbox') {
                                input.checked = false;
                            } else {
                                input.value = '';
                            }
                        });
                    } else {
                        item.remove();
                    }
                });
            } else {
                container.innerHTML = '';
            }
        }
    });

    // Reset counters
    counters = {
        stakeholders: 0,
        successMetrics: 1,
        inScope: 1,
        assumptions: 0,
        dataSources: 0,
        integrations: 0,
        milestones: 0,
        dependencies: 0,
        risks: 0,
        approvers: 0
    };

    // Clear attachments
    attachments = [];
    renderAttachmentList();
}

// ============================================
// Attachment Handling
// ============================================

let attachments = [];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png',
    'image/jpeg',
    'image/gif',
    'text/plain',
    'text/csv',
    'application/json'
];

function initAttachmentDropzone() {
    const dropzone = document.getElementById('attachmentDropzone');
    if (!dropzone) return;

    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    // Highlight dropzone when dragging over
    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, () => dropzone.classList.add('dragover'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, () => dropzone.classList.remove('dragover'), false);
    });

    // Handle dropped files
    dropzone.addEventListener('drop', handleDrop, false);
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFiles(files);
}

function handleAttachments(event) {
    const files = event.target.files;
    handleFiles(files);
    event.target.value = ''; // Reset input
}

function handleFiles(files) {
    [...files].forEach(processFile);
}

function processFile(file) {
    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type) && !file.name.match(/\\.(pdf|doc|docx|xls|xlsx|png|jpg|jpeg|gif|txt|csv|json)$/i)) {
        showToast('File type not allowed: ' + file.name, 'error');
        return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
        showToast('File too large (max 5MB): ' + file.name, 'error');
        return;
    }

    // Check for duplicate
    if (attachments.some(a => a.name === file.name && a.size === file.size)) {
        showToast('File already attached: ' + file.name, 'error');
        return;
    }

    // Read file and convert to base64
    const reader = new FileReader();
    reader.onload = function(e) {
        const attachment = {
            id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
            name: file.name,
            size: file.size,
            type: file.type,
            data: e.target.result // Base64 data URL
        };

        attachments.push(attachment);
        renderAttachmentList();
        showToast('File attached: ' + file.name, 'success');
    };
    reader.onerror = function() {
        showToast('Error reading file: ' + file.name, 'error');
    };
    reader.readAsDataURL(file);
}

function removeAttachment(id) {
    attachments = attachments.filter(a => a.id !== id);
    renderAttachmentList();
}

function renderAttachmentList() {
    const container = document.getElementById('attachmentList');
    if (!container) return;

    if (attachments.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = attachments.map(att => {
        const icon = getFileIcon(att.type, att.name);
        const size = formatFileSize(att.size);

        return \`
            <div class="attachment-item" data-id="\${att.id}">
                <div class="attachment-info">
                    <span class="attachment-icon">\${icon}</span>
                    <div class="attachment-details">
                        <div class="attachment-name" title="\${att.name}">\${att.name}</div>
                        <div class="attachment-size">\${size}</div>
                    </div>
                </div>
                <button type="button" class="attachment-remove" onclick="removeAttachment('\${att.id}')" title="Remove">&times;</button>
            </div>
        \`;
    }).join('');
}

function getFileIcon(type, name) {
    if (type.includes('pdf') || name.endsWith('.pdf')) return '&#128196;'; // PDF
    if (type.includes('word') || name.match(/\\.docx?$/)) return '&#128195;'; // Word
    if (type.includes('excel') || type.includes('spreadsheet') || name.match(/\\.xlsx?$/)) return '&#128202;'; // Excel
    if (type.includes('image')) return '&#128247;'; // Image
    if (type.includes('json')) return '&#128221;'; // JSON
    if (type.includes('csv') || name.endsWith('.csv')) return '&#128200;'; // CSV
    return '&#128196;'; // Default
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Auto-save draft every 30 seconds
let autoSaveInterval = null;

function startAutoSave() {
    if (autoSaveInterval) clearInterval(autoSaveInterval);
    autoSaveInterval = setInterval(() => {
        const data = collectFormData();
        // Only auto-save if there's meaningful data
        if (data.projectIdentity?.projectName || data.goalsObjectives?.businessObjective) {
            localStorage.setItem('intakeFormDraft', JSON.stringify(data));
            localStorage.setItem('intakeFormDraftTimestamp', new Date().toISOString());
        }
    }, 30000); // 30 seconds
}

// Check for existing draft on load
function checkForExistingDraft() {
    const draft = localStorage.getItem('intakeFormDraft');
    const timestamp = localStorage.getItem('intakeFormDraftTimestamp');

    if (draft && timestamp) {
        const savedDate = new Date(timestamp);
        const now = new Date();
        const hoursSinceSave = (now - savedDate) / (1000 * 60 * 60);

        // If saved within the last 7 days, offer to restore
        if (hoursSinceSave < 168) {
            const formattedDate = savedDate.toLocaleDateString() + ' at ' + savedDate.toLocaleTimeString();
            if (confirm('Found a draft from ' + formattedDate + '.\\n\\nWould you like to restore it?')) {
                try {
                    const data = JSON.parse(draft);
                    populateForm(data);
                    showToast('Draft restored', 'success');
                } catch (e) {
                    console.error('Error loading draft:', e);
                }
            }
        }
    }

    // Start auto-save
    startAutoSave();
}

// Override the DOMContentLoaded initialization
document.addEventListener('DOMContentLoaded', function() {
    initializeForm();
    initAttachmentDropzone();
    checkForExistingDraft();
    updateProgress();
});
`;
  }

  /**
   * Format enum value to display label
   */
  formatLabel(str) {
    return str.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
}

// CLI handling
function main() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' || args[i] === '-o') {
      options.output = args[++i];
    } else if (args[i] === '--project-type') {
      options.projectType = args[++i];
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Project Intake Form Generator

Usage:
  node intake-form-generator.js --output <path>

Options:
  --output, -o       Output file path (default: ./intake-form.html)
  --project-type     Pre-select project type in form
  --help, -h         Show this help

Examples:
  node intake-form-generator.js --output ./forms/intake.html
  node intake-form-generator.js --project-type salesforce-implementation -o ./sf-intake.html
`);
      process.exit(0);
    }
  }

  const outputPath = options.output || './intake-form.html';

  console.log('Generating intake form...');

  const generator = new IntakeFormGenerator(options);
  const html = generator.generate();

  // Ensure output directory exists
  const outputDir = path.dirname(path.resolve(outputPath));
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, html, 'utf-8');

  console.log(`Intake form generated: ${path.resolve(outputPath)}`);
  console.log('\nTo use:');
  console.log('  1. Open the HTML file in a browser');
  console.log('  2. Fill out the form');
  console.log('  3. Click "Export JSON" to save the data');
  console.log('  4. Run: /intake --form-data ./intake-data.json');
}

// Export for use as module
module.exports = { IntakeFormGenerator };

// Run if called directly
if (require.main === module) {
  main();
}
