#!/usr/bin/env node

/**
 * CPQ Diagram Generator Library
 *
 * Generates Mermaid diagrams for CPQ configurations extracted from sfdc-cpq-assessor.
 * Supports layered output (high-level overviews + detailed diagrams).
 *
 * @module cpq-diagram-generator
 * @version 1.0.0
 * @phase Phase 1: Extract & Modularize Existing CPQ Diagram Code
 *
 * Diagram Types:
 * 1. Pricing Logic Flowchart - Price rules, actions, evaluation order
 * 2. Quote Lifecycle State Diagram - Status transitions and counts
 * 3. Subscription Renewal Flow - Renewal process sequence
 * 4. Product Bundle Configuration Tree - Bundle hierarchy
 *
 * Related Runbooks:
 * - Flow XML Development Runbooks (diagram patterns)
 * - Q2C Audit Runbook (process visualization)
 */

const fs = require('fs');
const path = require('path');

/**
 * Diagram Generator Class
 * Generates Mermaid diagrams for CPQ configurations
 */
class CPQDiagramGenerator {
  constructor(options = {}) {
    this.options = {
      detailLevel: options.detailLevel || 'both', // 'high-level', 'detailed', 'both'
      outputDir: options.outputDir || './diagrams',
      saveAsMarkdown: options.saveAsMarkdown !== false, // Default true
      saveMermaidOnly: options.saveMermaidOnly || false, // Save .mmd files
      ...options
    };
  }

  /**
   * Generate all applicable CPQ diagrams based on assessment data
   * @param {Object} assessmentData - CPQ assessment data
   * @param {Object} options - Generation options
   * @returns {Object} Generated diagram metadata
   */
  async generateAllDiagrams(assessmentData, options = {}) {
    const diagrams = {};
    const detailLevel = options.detailLevel || this.options.detailLevel;

    // 1. Pricing Logic Flowchart (if price rules exist)
    if (assessmentData.priceRules && assessmentData.priceRules.length > 0) {
      console.log('📊 Generating pricing logic flowchart...');
      diagrams.pricingFlow = await this.generatePricingLogicFlowchart(
        assessmentData.priceRules,
        assessmentData.priceActions || [],
        { detailLevel }
      );
    }

    // 2. Quote Lifecycle State Diagram (if quote statuses analyzed)
    if (assessmentData.quotesByStatus && Object.keys(assessmentData.quotesByStatus).length > 0) {
      console.log('📊 Generating quote lifecycle state diagram...');
      diagrams.quoteLifecycle = await this.generateQuoteLifecycleStateDiagram(
        assessmentData.quotesByStatus,
        { detailLevel }
      );
    }

    // 3. Subscription Renewal Flow (if subscriptions used)
    if (assessmentData.subscriptionsUsed) {
      console.log('📊 Generating subscription renewal flow...');
      diagrams.renewalFlow = await this.generateSubscriptionRenewalFlow(
        assessmentData.renewalConfig || {},
        { detailLevel }
      );
    }

    // 4. Product Bundle Configuration Tree (if complex bundles detected)
    if (assessmentData.bundleComplexity >= 3 && assessmentData.bundles?.length > 0) {
      console.log('📊 Generating product bundle configuration tree...');
      diagrams.bundleConfig = await this.generateProductBundleTree(
        assessmentData.bundles,
        { detailLevel }
      );
    }

    return diagrams;
  }

  /**
   * Generate Pricing Logic Flowchart
   * Shows price rules, actions, and evaluation order
   *
   * @param {Array} priceRules - Array of price rule objects
   * @param {Array} priceActions - Array of price action objects
   * @param {Object} options - Generation options
   * @returns {Object} Diagram metadata with file paths
   */
  async generatePricingLogicFlowchart(priceRules, priceActions, options = {}) {
    const detailLevel = options.detailLevel || this.options.detailLevel;
    const diagrams = {};

    // High-level: Show only major price rule categories
    if (detailLevel === 'high-level' || detailLevel === 'both') {
      const highLevelMermaid = this._buildHighLevelPricingFlowchart(priceRules, priceActions);
      diagrams.highLevel = await this._saveDiagram(
        highLevelMermaid,
        'pricing-logic-flowchart-overview',
        'Pricing Logic Flowchart (Overview)'
      );
    }

    // Detailed: Show all price rules and actions
    if (detailLevel === 'detailed' || detailLevel === 'both') {
      const detailedMermaid = this._buildDetailedPricingFlowchart(priceRules, priceActions);
      diagrams.detailed = await this._saveDiagram(
        detailedMermaid,
        'pricing-logic-flowchart-detailed',
        'Pricing Logic Flowchart (Detailed)'
      );
    }

    return diagrams;
  }

  /**
   * Generate Quote Lifecycle State Diagram
   * Shows quote status transitions and current counts
   *
   * @param {Object} quotesByStatus - Quote counts by status
   * @param {Object} options - Generation options
   * @returns {Object} Diagram metadata with file paths
   */
  async generateQuoteLifecycleStateDiagram(quotesByStatus, options = {}) {
    const detailLevel = options.detailLevel || this.options.detailLevel;
    const diagrams = {};

    // High-level: Show only major quote states
    if (detailLevel === 'high-level' || detailLevel === 'both') {
      const highLevelMermaid = this._buildHighLevelQuoteLifecycle(quotesByStatus);
      diagrams.highLevel = await this._saveDiagram(
        highLevelMermaid,
        'quote-lifecycle-state-diagram-overview',
        'Quote Lifecycle State Diagram (Overview)'
      );
    }

    // Detailed: Show all quote states and transitions
    if (detailLevel === 'detailed' || detailLevel === 'both') {
      const detailedMermaid = this._buildDetailedQuoteLifecycle(quotesByStatus);
      diagrams.detailed = await this._saveDiagram(
        detailedMermaid,
        'quote-lifecycle-state-diagram-detailed',
        'Quote Lifecycle State Diagram (Detailed)'
      );
    }

    return diagrams;
  }

  /**
   * Generate Subscription Renewal Flow Sequence
   * Shows renewal process from trigger to booking
   *
   * @param {Object} renewalConfig - Renewal configuration data
   * @param {Object} options - Generation options
   * @returns {Object} Diagram metadata with file paths
   */
  async generateSubscriptionRenewalFlow(renewalConfig, options = {}) {
    const detailLevel = options.detailLevel || this.options.detailLevel;
    const diagrams = {};

    // High-level: Show major renewal phases
    if (detailLevel === 'high-level' || detailLevel === 'both') {
      const highLevelMermaid = this._buildHighLevelRenewalFlow(renewalConfig);
      diagrams.highLevel = await this._saveDiagram(
        highLevelMermaid,
        'subscription-renewal-flow-overview',
        'Subscription Renewal Flow (Overview)'
      );
    }

    // Detailed: Show all renewal steps and actors
    if (detailLevel === 'detailed' || detailLevel === 'both') {
      const detailedMermaid = this._buildDetailedRenewalFlow(renewalConfig);
      diagrams.detailed = await this._saveDiagram(
        detailedMermaid,
        'subscription-renewal-flow-detailed',
        'Subscription Renewal Flow (Detailed)'
      );
    }

    return diagrams;
  }

  /**
   * Generate Product Bundle Configuration Tree
   * Shows bundle hierarchy with required/optional components
   *
   * @param {Array} bundles - Array of product bundle objects
   * @param {Object} options - Generation options
   * @returns {Object} Diagram metadata with file paths
   */
  async generateProductBundleTree(bundles, options = {}) {
    const detailLevel = options.detailLevel || this.options.detailLevel;
    const diagrams = {};

    // High-level: Show only top-level bundles
    if (detailLevel === 'high-level' || detailLevel === 'both') {
      const highLevelMermaid = this._buildHighLevelBundleTree(bundles);
      diagrams.highLevel = await this._saveDiagram(
        highLevelMermaid,
        'product-bundle-configuration-overview',
        'Product Bundle Configuration (Overview)'
      );
    }

    // Detailed: Show all bundle options and features
    if (detailLevel === 'detailed' || detailLevel === 'both') {
      const detailedMermaid = this._buildDetailedBundleTree(bundles);
      diagrams.detailed = await this._saveDiagram(
        detailedMermaid,
        'product-bundle-configuration-detailed',
        'Product Bundle Configuration (Detailed)'
      );
    }

    return diagrams;
  }

  // ==================== PRIVATE METHODS: HIGH-LEVEL DIAGRAMS ====================

  /**
   * Build high-level pricing flowchart (categories only)
   * @private
   */
  _buildHighLevelPricingFlowchart(priceRules, priceActions) {
    // Group rules by category (Base Price, Discounts, Markup, etc.)
    const categories = this._categorizePriceRules(priceRules);

    let mermaid = `flowchart TB
  start((Product Selected))

`;

    // Add category nodes
    Object.keys(categories).forEach(category => {
      const count = categories[category].length;
      mermaid += `  ${this._sanitizeId(category)}["${category}\\n(${count} rule${count !== 1 ? 's' : ''})"]
`;
    });

    mermaid += `  finish((Final Price))

`;

    // Add connections
    const categoryKeys = Object.keys(categories);
    mermaid += `  start --> ${this._sanitizeId(categoryKeys[0])}
`;

    for (let i = 0; i < categoryKeys.length - 1; i++) {
      mermaid += `  ${this._sanitizeId(categoryKeys[i])} --> ${this._sanitizeId(categoryKeys[i + 1])}
`;
    }

    if (categoryKeys.length > 0) {
      mermaid += `  ${this._sanitizeId(categoryKeys[categoryKeys.length - 1])} --> finish
`;
    }

    return mermaid;
  }

  /**
   * Build detailed pricing flowchart (all rules and actions)
   * @private
   */
  _buildDetailedPricingFlowchart(priceRules, priceActions) {
    // Sort by evaluation order
    const sortedRules = [...priceRules].sort((a, b) =>
      (a.evaluationOrder || 0) - (b.evaluationOrder || 0)
    );

    let mermaid = `flowchart TB
  start((Product Selected))

`;

    // Add price rule nodes
    sortedRules.forEach(rule => {
      const ruleId = this._sanitizeId(rule.id || rule.name);
      const ruleName = this._sanitizeMermaidText(rule.name || 'Unnamed Rule');
      const order = rule.evaluationOrder || '?';
      mermaid += `  ${ruleId}["${ruleName}\\nOrder: ${order}"]
`;
    });

    // Add price action nodes
    priceActions.forEach(action => {
      const actionId = this._sanitizeId(action.id || action.type);
      const actionType = this._sanitizeMermaidText(action.type || 'Unknown Action');
      const targetField = this._sanitizeMermaidText(action.targetField || '');
      mermaid += `  ${actionId}[/"${actionType}\\n${targetField}"/]
`;
    });

    mermaid += `  finish((Final Price))

`;

    // Add connections
    if (sortedRules.length > 0) {
      mermaid += `  start --> ${this._sanitizeId(sortedRules[0].id || sortedRules[0].name)}
`;

      sortedRules.forEach((rule, i) => {
        const ruleId = this._sanitizeId(rule.id || rule.name);
        const actions = rule.actions || [];
        const hasConditions = rule.conditions && rule.conditions.length > 0;
        const label = hasConditions ? '|If met|' : '|Always|';

        if (actions.length > 0) {
          const actionId = this._sanitizeId(actions[0].id || actions[0].type);
          mermaid += `  ${ruleId} -->${label} ${actionId}
`;

          // Connect action to next rule or finish
          const nextRuleId = sortedRules[i + 1]
            ? this._sanitizeId(sortedRules[i + 1].id || sortedRules[i + 1].name)
            : 'finish';
          mermaid += `  ${actionId} --> ${nextRuleId}
`;
        } else {
          // No actions, connect directly to next rule or finish
          const nextRuleId = sortedRules[i + 1]
            ? this._sanitizeId(sortedRules[i + 1].id || sortedRules[i + 1].name)
            : 'finish';
          mermaid += `  ${ruleId} --> ${nextRuleId}
`;
        }
      });
    }

    return mermaid;
  }

  /**
   * Build high-level quote lifecycle (major states only)
   * @private
   */
  _buildHighLevelQuoteLifecycle(quotesByStatus) {
    // Map to simplified states
    const stateMapping = {
      draft: ['Draft', 'In Progress'],
      review: ['In Review', 'Pending Approval'],
      approved: ['Approved', 'Accepted'],
      rejected: ['Rejected', 'Declined', 'Lost']
    };

    const simplifiedCounts = {};
    Object.entries(quotesByStatus).forEach(([status, count]) => {
      const statusLower = status.toLowerCase();
      const simplifiedState = Object.keys(stateMapping).find(key =>
        stateMapping[key].some(s => statusLower.includes(s.toLowerCase()))
      ) || 'other';

      simplifiedCounts[simplifiedState] = (simplifiedCounts[simplifiedState] || 0) + count;
    });

    let mermaid = `stateDiagram-v2
  [*] --> Draft: Create Quote (${simplifiedCounts.draft || 0} quotes)
  Draft --> InReview: Submit (${simplifiedCounts.review || 0} quotes)
  InReview --> Approved: Approve (${simplifiedCounts.approved || 0} quotes)
  InReview --> Draft: Send Back
  Approved --> [*]: Convert to Order
  Approved --> Rejected: Customer Declines (${simplifiedCounts.rejected || 0} quotes)
  Rejected --> [*]
`;

    return mermaid;
  }

  /**
   * Build detailed quote lifecycle (all statuses and transitions)
   * @private
   */
  _buildDetailedQuoteLifecycle(quotesByStatus) {
    let mermaid = `stateDiagram-v2
  [*] --> Draft: Create Quote
`;

    // Add all status states with counts
    Object.entries(quotesByStatus).forEach(([status, count]) => {
      const statusId = this._sanitizeId(status);
      const statusLabel = this._sanitizeMermaidText(status);

      // Add transitions based on status
      if (status.toLowerCase().includes('draft')) {
        mermaid += `  Draft --> InReview: Submit (${count} quotes)
  InReview --> Draft: Send Back
`;
      } else if (status.toLowerCase().includes('review') || status.toLowerCase().includes('pending')) {
        mermaid += `  InReview --> Approved: Manager Approves (${count} quotes)
`;
      } else if (status.toLowerCase().includes('approved')) {
        mermaid += `  Approved --> Presented: Send to Customer (${count} quotes)
`;
      } else if (status.toLowerCase().includes('presented')) {
        mermaid += `  Presented --> Accepted: Customer Accepts (${count} quotes)
  Presented --> Rejected: Customer Declines
  Presented --> Draft: Revise Quote
`;
      } else if (status.toLowerCase().includes('accepted')) {
        mermaid += `  Accepted --> [*]
`;
      } else if (status.toLowerCase().includes('rejected') || status.toLowerCase().includes('declined')) {
        mermaid += `  Rejected --> [*]
`;
      }
    });

    return mermaid;
  }

  /**
   * Build high-level renewal flow (major phases)
   * @private
   */
  _buildHighLevelRenewalFlow(renewalConfig) {
    const renewalWindow = renewalConfig.renewalWindowDays || 30;

    let mermaid = `sequenceDiagram
  autonumber
  participant CPQ as Salesforce CPQ
  participant Customer
  participant OrderSystem as Order System

  CPQ->>Customer: ${renewalWindow} days before expiry: Send Renewal Notification
  Customer->>CPQ: Accept Renewal
  CPQ->>OrderSystem: Generate Renewal Order
  OrderSystem->>CPQ: Confirm Order Booked
  CPQ->>CPQ: Update Subscription End Date
`;

    return mermaid;
  }

  /**
   * Build detailed renewal flow (all steps and actors)
   * @private
   */
  _buildDetailedRenewalFlow(renewalConfig) {
    const renewalWindow = renewalConfig.renewalWindowDays || 30;
    const hasCustomFlow = renewalConfig.hasCustomRenewalFlow || false;

    let mermaid = `sequenceDiagram
  autonumber
  participant Customer
  participant SalesforceCPQ as Salesforce CPQ
  participant RenewalFlow as Renewal Flow
  participant PricingEngine as Pricing Engine
  participant OrderSystem as Order System

  SalesforceCPQ->>RenewalFlow: ${renewalWindow} days before expiry: Trigger Renewal
  RenewalFlow->>PricingEngine: Calculate Renewal Pricing
  PricingEngine->>RenewalFlow: Return Updated Prices
  RenewalFlow->>SalesforceCPQ: Create Renewal Quote
  RenewalFlow->>Customer: Send Renewal Notification
  Customer->>SalesforceCPQ: Review Renewal Quote
  Customer->>SalesforceCPQ: Accept Renewal
  SalesforceCPQ->>RenewalFlow: Trigger Quote to Order Conversion
  RenewalFlow->>PricingEngine: Validate Final Pricing
  PricingEngine->>RenewalFlow: Pricing Confirmed
  RenewalFlow->>OrderSystem: Generate Renewal Order
  OrderSystem->>SalesforceCPQ: Confirm Order Booked
  SalesforceCPQ->>SalesforceCPQ: Update Subscription End Date
  SalesforceCPQ->>Customer: Send Confirmation Email
`;

    return mermaid;
  }

  /**
   * Build high-level bundle tree (top-level bundles only)
   * @private
   */
  _buildHighLevelBundleTree(bundles) {
    const topBundle = bundles[0]; // Most complex bundle
    const bundleId = this._sanitizeId(topBundle.id || topBundle.name);
    const bundleName = this._sanitizeMermaidText(topBundle.name || 'Unnamed Bundle');

    // Count required vs optional options
    const requiredCount = (topBundle.options || []).filter(opt => opt.required).length;
    const optionalCount = (topBundle.options || []).length - requiredCount;

    let mermaid = `flowchart TB
  bundle["${bundleName}\\n(Base Product)"]
  required["Required Components\\n(${requiredCount} item${requiredCount !== 1 ? 's' : ''})"]
  optional["Optional Add-ons\\n(${optionalCount} item${optionalCount !== 1 ? 's' : ''})"]

  bundle -->|Must include| required
  bundle -->|May include| optional
`;

    return mermaid;
  }

  /**
   * Build detailed bundle tree (all options and features)
   * @private
   */
  _buildDetailedBundleTree(bundles) {
    const topBundle = bundles[0]; // Most complex bundle
    const bundleId = this._sanitizeId(topBundle.id || topBundle.name);
    const bundleName = this._sanitizeMermaidText(topBundle.name || 'Unnamed Bundle');

    let mermaid = `flowchart TB
  bundle["${bundleName}\\n(Base Product)"]

`;

    // Add option nodes
    (topBundle.options || []).forEach(opt => {
      const optId = this._sanitizeId(opt.id || opt.name);
      const optName = this._sanitizeMermaidText(opt.name || 'Unnamed Option');
      const shape = opt.required
        ? `["${optName}\\n✓ Required"]`
        : `{"${optName}\\n? Optional"}`;
      mermaid += `  ${optId}${shape}
`;
    });

    // Add feature nodes
    (topBundle.features || []).forEach(feat => {
      const featId = this._sanitizeId(feat.id || feat.name);
      const featName = this._sanitizeMermaidText(feat.name || 'Unnamed Feature');
      const priceAdjustment = feat.priceAdjustment || 0;
      const priceLabel = priceAdjustment !== 0 ? `\\n${priceAdjustment > 0 ? '+' : ''}$${priceAdjustment}` : '';
      mermaid += `  ${featId}[/"${featName}${priceLabel}"/]
`;
    });

    mermaid += `
`;

    // Add bundle to options connections
    (topBundle.options || []).forEach(opt => {
      const optId = this._sanitizeId(opt.id || opt.name);
      const label = opt.required ? '|Must include|' : '|May include|';
      mermaid += `  bundle -->${label} ${optId}
`;
    });

    // Add option to feature connections
    (topBundle.features || []).forEach(feat => {
      const featId = this._sanitizeId(feat.id || feat.name);
      const parentOptId = feat.parentOption
        ? this._sanitizeId(feat.parentOption)
        : (topBundle.options?.[0] ? this._sanitizeId(topBundle.options[0].id || topBundle.options[0].name) : 'bundle');
      mermaid += `  ${parentOptId} --> ${featId}
`;
    });

    return mermaid;
  }

  // ==================== HELPER METHODS ====================

  /**
   * Categorize price rules by type
   * @private
   */
  _categorizePriceRules(priceRules) {
    const categories = {
      'Base Price': [],
      'Discounts': [],
      'Markup': [],
      'Volume Pricing': [],
      'Other': []
    };

    priceRules.forEach(rule => {
      const nameLower = (rule.name || '').toLowerCase();
      if (nameLower.includes('base') || nameLower.includes('list price')) {
        categories['Base Price'].push(rule);
      } else if (nameLower.includes('discount')) {
        categories['Discounts'].push(rule);
      } else if (nameLower.includes('markup') || nameLower.includes('margin')) {
        categories['Markup'].push(rule);
      } else if (nameLower.includes('volume') || nameLower.includes('tier')) {
        categories['Volume Pricing'].push(rule);
      } else {
        categories['Other'].push(rule);
      }
    });

    // Remove empty categories
    return Object.fromEntries(
      Object.entries(categories).filter(([_, rules]) => rules.length > 0)
    );
  }

  /**
   * Sanitize text for Mermaid diagram nodes
   * @private
   */
  _sanitizeMermaidText(text) {
    return (text || '')
      .replace(/"/g, '\\"')  // Escape quotes
      .replace(/\n/g, '\\n') // Escape newlines
      .substring(0, 100);    // Limit length
  }

  /**
   * Sanitize ID for Mermaid node IDs
   * @private
   */
  _sanitizeId(text) {
    return (text || 'node')
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .substring(0, 50);
  }

  /**
   * Save diagram to file(s)
   * @private
   */
  async _saveDiagram(mermaidCode, filename, title) {
    // Ensure output directory exists
    if (!fs.existsSync(this.options.outputDir)) {
      fs.mkdirSync(this.options.outputDir, { recursive: true });
    }

    const metadata = {
      filename,
      title,
      paths: {}
    };

    // Save as Markdown file (default)
    if (this.options.saveAsMarkdown) {
      const mdPath = path.join(this.options.outputDir, `${filename}.md`);
      const mdContent = `# ${title}

\`\`\`mermaid
${mermaidCode}
\`\`\`

---

*Generated by CPQ Diagram Generator v1.0.0*
`;
      fs.writeFileSync(mdPath, mdContent, 'utf8');
      metadata.paths.markdown = mdPath;
    }

    // Save as standalone .mmd file (optional)
    if (this.options.saveMermaidOnly) {
      const mmdPath = path.join(this.options.outputDir, `${filename}.mmd`);
      fs.writeFileSync(mmdPath, mermaidCode, 'utf8');
      metadata.paths.mermaid = mmdPath;
    }

    return metadata;
  }
}

// ==================== EXPORTS ====================

module.exports = CPQDiagramGenerator;

// CLI support
if (require.main === module) {
  console.log('CPQ Diagram Generator v1.0.0');
  console.log('This library is designed to be imported and used programmatically.');
  console.log('\nExample usage:');
  console.log(`
const CPQDiagramGenerator = require('./cpq-diagram-generator');
const generator = new CPQDiagramGenerator({ outputDir: './diagrams' });

// Generate all diagrams
const diagrams = await generator.generateAllDiagrams(assessmentData);

// Generate specific diagram
const pricingDiagram = await generator.generatePricingLogicFlowchart(
  priceRules,
  priceActions,
  { detailLevel: 'both' }
);
`);
}
