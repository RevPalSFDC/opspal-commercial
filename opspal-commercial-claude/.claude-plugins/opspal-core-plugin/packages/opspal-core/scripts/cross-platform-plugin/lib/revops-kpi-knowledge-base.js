#!/usr/bin/env node

/**
 * RevOps KPI Knowledge Base
 *
 * Provides APIs for accessing RevOps KPI definitions, formulas, benchmarks,
 * and data requirements. Used by revops-reporting-assistant agent to:
 * - Match user requests to appropriate KPIs
 * - Generate data collection queries
 * - Apply industry benchmarks
 * - Document methodology
 *
 * @see ../config/revops-kpi-definitions.json
 * @author RevPal Engineering
 * @version 2.0.0
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG_PATH = path.join(__dirname, '..', '..', 'config', 'revops-kpi-definitions.json');

// ============================================================================
// KPI KNOWLEDGE BASE CLASS
// ============================================================================

class RevOpsKPIKnowledgeBase {
  constructor() {
    this.definitions = null;
    this.kpiIndex = new Map();
    this.keywordIndex = new Map();
    this.initialized = false;
  }

  /**
   * Initialize the knowledge base by loading definitions
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) return;

    try {
      const configContent = fs.readFileSync(CONFIG_PATH, 'utf8');
      this.definitions = JSON.parse(configContent);
      this._buildIndexes();
      this.initialized = true;
    } catch (error) {
      throw new Error(`Failed to load KPI definitions: ${error.message}`);
    }
  }

  /**
   * Build search indexes for quick lookups
   * @private
   */
  _buildIndexes() {
    // Index by KPI ID and aliases
    for (const [categoryId, category] of Object.entries(this.definitions.categories)) {
      for (const [kpiId, kpi] of Object.entries(category.kpis)) {
        // Index by primary ID
        this.kpiIndex.set(kpiId.toLowerCase(), { categoryId, kpiId, kpi });
        this.kpiIndex.set(kpi.id.toLowerCase(), { categoryId, kpiId, kpi });

        // Index by abbreviation
        if (kpi.abbreviation) {
          this.kpiIndex.set(kpi.abbreviation.toLowerCase(), { categoryId, kpiId, kpi });
        }

        // Index by aliases
        if (kpi.aliases) {
          for (const alias of kpi.aliases) {
            this.kpiIndex.set(alias.toLowerCase(), { categoryId, kpiId, kpi });
          }
        }

        // Build keyword index for natural language matching
        const keywords = this._extractKeywords(kpi);
        for (const keyword of keywords) {
          if (!this.keywordIndex.has(keyword)) {
            this.keywordIndex.set(keyword, []);
          }
          this.keywordIndex.get(keyword).push({ categoryId, kpiId, kpi });
        }
      }
    }
  }

  /**
   * Extract searchable keywords from a KPI definition
   * @private
   * @param {Object} kpi - KPI definition
   * @returns {string[]} - Keywords
   */
  _extractKeywords(kpi) {
    const keywords = new Set();

    // Add words from full name
    const nameWords = kpi.fullName.toLowerCase().split(/\s+/);
    nameWords.forEach(w => keywords.add(w));

    // Add words from description
    const descWords = kpi.description.toLowerCase().split(/\s+/);
    descWords.filter(w => w.length > 3).forEach(w => keywords.add(w));

    // Add related KPIs
    if (kpi.relatedKPIs) {
      kpi.relatedKPIs.forEach(r => keywords.add(r.toLowerCase()));
    }

    return Array.from(keywords);
  }

  // ============================================================================
  // KPI LOOKUP METHODS
  // ============================================================================

  /**
   * Get a KPI by ID, abbreviation, or alias
   * @param {string} identifier - KPI identifier
   * @returns {Object|null} - KPI definition or null
   */
  getKPI(identifier) {
    this._ensureInitialized();
    const result = this.kpiIndex.get(identifier.toLowerCase());
    return result ? result.kpi : null;
  }

  /**
   * Get all KPIs in a category
   * @param {string} categoryId - Category ID (revenue, retention, acquisition, unitEconomics, pipeline)
   * @returns {Object[]} - Array of KPI definitions
   */
  getKPIsByCategory(categoryId) {
    this._ensureInitialized();
    const category = this.definitions.categories[categoryId];
    if (!category) return [];
    return Object.values(category.kpis);
  }

  /**
   * Get all categories
   * @returns {Object} - Categories with metadata
   */
  getCategories() {
    this._ensureInitialized();
    const result = {};
    for (const [id, category] of Object.entries(this.definitions.categories)) {
      result[id] = {
        name: category.name,
        description: category.description,
        kpiCount: Object.keys(category.kpis).length
      };
    }
    return result;
  }

  /**
   * Get KPIs relevant for a specific GTM model
   * @param {string} model - GTM model (salesLed, plg, hybrid)
   * @returns {Object[]} - Relevant KPIs with GTM-specific context
   */
  getKPIsByGTMModel(model) {
    this._ensureInitialized();
    const validModels = ['salesLed', 'plg', 'hybrid'];
    if (!validModels.includes(model)) {
      throw new Error(`Invalid GTM model: ${model}. Valid options: ${validModels.join(', ')}`);
    }

    const results = [];

    for (const [categoryId, category] of Object.entries(this.definitions.categories)) {
      for (const [kpiId, kpi] of Object.entries(category.kpis)) {
        // Check if KPI has GTM-specific flag
        const isGTMSpecific = kpi.gtmModel === model;

        // Check if KPI has GTM-specific benchmarks
        const hasGTMBenchmarks = kpi.benchmarks?.saas?.byGTM?.[model];

        // Include KPIs that are either GTM-specific or have GTM-specific benchmarks
        if (isGTMSpecific || hasGTMBenchmarks) {
          results.push({
            kpi,
            categoryId,
            categoryName: category.name,
            gtmSpecific: isGTMSpecific,
            gtmBenchmarks: hasGTMBenchmarks || null,
            relevance: isGTMSpecific ? 'primary' : 'secondary'
          });
        }
      }
    }

    // Add universal KPIs that apply to all GTM models
    const universalKPIs = ['ARR', 'MRR', 'NRR', 'GRR', 'LTV', 'CAC'];
    for (const kpiId of universalKPIs) {
      const kpi = this.getKPI(kpiId);
      if (kpi && !results.find(r => r.kpi.id === kpi.id)) {
        results.push({
          kpi,
          categoryId: this._getCategoryForKPI(kpiId),
          gtmSpecific: false,
          gtmBenchmarks: kpi.benchmarks?.saas?.byGTM?.[model] || null,
          relevance: 'universal'
        });
      }
    }

    // Sort by relevance: primary > universal > secondary
    const relevanceOrder = { 'primary': 0, 'universal': 1, 'secondary': 2 };
    return results.sort((a, b) => relevanceOrder[a.relevance] - relevanceOrder[b.relevance]);
  }

  /**
   * Get the category ID for a KPI
   * @private
   */
  _getCategoryForKPI(kpiId) {
    for (const [categoryId, category] of Object.entries(this.definitions.categories)) {
      if (category.kpis[kpiId]) {
        return categoryId;
      }
    }
    return null;
  }

  /**
   * Search for KPIs matching a natural language query
   * @param {string} query - Natural language search query
   * @returns {Object[]} - Matching KPIs with relevance scores
   */
  searchKPIs(query) {
    this._ensureInitialized();
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const scores = new Map();

    for (const word of queryWords) {
      // Exact keyword match
      if (this.keywordIndex.has(word)) {
        for (const match of this.keywordIndex.get(word)) {
          const key = match.kpiId;
          scores.set(key, (scores.get(key) || 0) + 2);
        }
      }

      // Partial match
      for (const [keyword, matches] of this.keywordIndex.entries()) {
        if (keyword.includes(word) || word.includes(keyword)) {
          for (const match of matches) {
            const key = match.kpiId;
            scores.set(key, (scores.get(key) || 0) + 1);
          }
        }
      }
    }

    // Convert to sorted results
    const results = [];
    for (const [kpiId, score] of scores.entries()) {
      const kpi = this.getKPI(kpiId);
      if (kpi) {
        results.push({ kpi, score, relevance: score / queryWords.length });
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * Recommend KPIs based on a business goal
   * Uses goal mappings from revops-kpi-definitions.json when available,
   * falls back to hardcoded defaults for backward compatibility.
   * @param {string} goal - Business goal (e.g., "reduce churn", "improve efficiency", "grow revenue")
   * @returns {Object[]} - Recommended KPIs with explanations
   */
  recommendKPIsForGoal(goal) {
    this._ensureInitialized();
    const goalLower = goal.toLowerCase();
    const recommendations = [];

    // Use goal mappings from JSON config if available (v2.0.0+)
    const configMappings = this.definitions.goalMappings || {};

    // Fallback defaults for backward compatibility
    const defaultMappings = {
      'revenue': ['ARR', 'MRR', 'RevenueGrowthRate', 'ARPU'],
      'growth': ['ARR', 'MRR', 'RevenueGrowthRate', 'LeadConversionRate'],
      'churn': ['CustomerChurn', 'NRR', 'GRR'],
      'retention': ['NRR', 'GRR', 'CustomerChurn', 'LTV'],
      'efficiency': ['CAC', 'CACPayback', 'LTVCACRatio', 'SalesVelocity'],
      'acquisition': ['CAC', 'LeadConversionRate', 'CACPayback'],
      'pipeline': ['PipelineCoverage', 'WinRate', 'SalesVelocity', 'SalesCycleLength'],
      'sales': ['WinRate', 'SalesVelocity', 'SalesCycleLength', 'PipelineCoverage'],
      'profitability': ['LTV', 'LTVCACRatio', 'GRR', 'ARPU'],
      'unit economics': ['CAC', 'LTV', 'LTVCACRatio', 'CACPayback', 'ARPU'],
      'customer health': ['NRR', 'GRR', 'CustomerChurn', 'ARPU'],
      'forecast': ['PipelineCoverage', 'WinRate', 'SalesCycleLength'],
      'benchmark': ['NRR', 'GRR', 'CAC', 'LTVCACRatio', 'WinRate']
    };

    // Merge config mappings with defaults (config takes precedence)
    const goalMappings = { ...defaultMappings, ...configMappings };

    for (const [keyword, kpiIds] of Object.entries(goalMappings)) {
      if (goalLower.includes(keyword)) {
        for (const kpiId of kpiIds) {
          const kpi = this.getKPI(kpiId);
          if (kpi && !recommendations.find(r => r.kpi.id === kpi.id)) {
            recommendations.push({
              kpi,
              reason: `Relevant for ${keyword} analysis`,
              priority: goalLower.indexOf(keyword) === 0 ? 'high' : 'medium'
            });
          }
        }
      }
    }

    // If no specific mappings, use search
    if (recommendations.length === 0) {
      const searchResults = this.searchKPIs(goal);
      for (const result of searchResults.slice(0, 5)) {
        recommendations.push({
          kpi: result.kpi,
          reason: `Matches search criteria`,
          priority: result.relevance > 0.5 ? 'high' : 'medium'
        });
      }
    }

    return recommendations;
  }

  // ============================================================================
  // DATA REQUIREMENTS METHODS
  // ============================================================================

  /**
   * Get data requirements for a KPI on a specific platform
   * @param {string} kpiId - KPI identifier
   * @param {string} platform - Platform (salesforce, hubspot)
   * @returns {Object|null} - Data requirements
   */
  getDataRequirements(kpiId, platform) {
    this._ensureInitialized();
    const kpi = this.getKPI(kpiId);
    if (!kpi || !kpi.dataRequirements) return null;
    return kpi.dataRequirements[platform] || null;
  }

  /**
   * Generate SOQL query template for a KPI
   * @param {string} kpiId - KPI identifier
   * @param {Object} options - Query options (dateRange, filters, groupBy)
   * @returns {string|null} - SOQL query or null
   */
  generateSOQLTemplate(kpiId, options = {}) {
    this._ensureInitialized();
    const req = this.getDataRequirements(kpiId, 'salesforce');
    if (!req) return null;

    const { dateRange, additionalFilters, groupBy } = options;
    const fields = req.fields || [];
    const object = req.primaryObject;
    let filter = req.filter || '';

    // Replace placeholders
    if (dateRange) {
      filter = filter.replace('[PERIOD_START]', dateRange.start);
      filter = filter.replace('[PERIOD_END]', dateRange.end);
    }

    // Build query
    let query = `SELECT ${fields.join(', ')} FROM ${object}`;
    if (filter) {
      query += ` WHERE ${filter}`;
    }
    if (additionalFilters) {
      query += filter ? ` AND ${additionalFilters}` : ` WHERE ${additionalFilters}`;
    }
    if (groupBy || req.groupBy) {
      const groups = groupBy || req.groupBy;
      if (Array.isArray(groups)) {
        query += ` GROUP BY ${groups.join(', ')}`;
      }
    }

    return query;
  }

  /**
   * Get all KPIs that can be calculated from available data
   * @param {string} platform - Platform (salesforce, hubspot)
   * @param {string[]} availableObjects - List of available objects
   * @returns {Object[]} - KPIs that can be calculated
   */
  getCalculableKPIs(platform, availableObjects) {
    this._ensureInitialized();
    const calculable = [];

    for (const [categoryId, category] of Object.entries(this.definitions.categories)) {
      for (const [kpiId, kpi] of Object.entries(category.kpis)) {
        const req = kpi.dataRequirements?.[platform];
        if (!req) continue;

        const requiredObject = req.primaryObject;
        if (availableObjects.includes(requiredObject)) {
          calculable.push({
            kpi,
            categoryId,
            dataRequirements: req,
            isDerived: req.derived || false
          });
        }
      }
    }

    return calculable;
  }

  // ============================================================================
  // BENCHMARK METHODS
  // ============================================================================

  /**
   * Get benchmarks for a KPI
   * @param {string} kpiId - KPI identifier
   * @param {string} industry - Industry (default: saas)
   * @returns {Object|null} - Benchmarks
   */
  getBenchmarks(kpiId, industry = 'saas') {
    this._ensureInitialized();
    const kpi = this.getKPI(kpiId);
    if (!kpi || !kpi.benchmarks) return null;
    return kpi.benchmarks[industry] || kpi.benchmarks['saas'] || null;
  }

  /**
   * Get benchmarks for a KPI filtered by segmentation criteria
   * Supports filtering by company stage, ACV tier, and GTM model
   * @param {string} kpiId - KPI identifier
   * @param {Object} segmentation - Segmentation criteria
   * @param {string} [segmentation.stage] - Company stage (seed, seriesA, seriesB, seriesC, growth, scaleUp)
   * @param {string} [segmentation.acv] - ACV tier (smb, midMarket, enterprise)
   * @param {string} [segmentation.gtm] - GTM model (salesLed, plg, hybrid)
   * @param {string} [segmentation.industry] - Industry (default: saas)
   * @returns {Object} - Segmented benchmark data with context
   */
  getBenchmarksBySegment(kpiId, segmentation = {}) {
    this._ensureInitialized();
    const kpi = this.getKPI(kpiId);
    if (!kpi) return null;

    const { stage, acv, gtm, industry = 'saas' } = segmentation;
    const baseBenchmarks = kpi.benchmarks?.[industry] || kpi.benchmarks?.saas || {};
    const segmentationDefs = this.definitions.benchmarkSegmentation || {};

    const result = {
      kpiId,
      kpiName: kpi.fullName,
      segmentation: { stage, acv, gtm, industry },
      baseBenchmarks,
      segmentedBenchmarks: {},
      segmentContext: {}
    };

    // Get stage-specific benchmarks
    if (stage && baseBenchmarks.byStage?.[stage]) {
      result.segmentedBenchmarks.stage = baseBenchmarks.byStage[stage];
      result.segmentContext.stage = segmentationDefs.companyStage?.[stage] || {};
    }

    // Get ACV-specific benchmarks
    if (acv && baseBenchmarks.byACV?.[acv]) {
      result.segmentedBenchmarks.acv = baseBenchmarks.byACV[acv];
      result.segmentContext.acv = segmentationDefs.acvTier?.[acv] || {};
    }

    // Get GTM-specific benchmarks
    if (gtm && baseBenchmarks.byGTM?.[gtm]) {
      result.segmentedBenchmarks.gtm = baseBenchmarks.byGTM[gtm];
      result.segmentContext.gtm = segmentationDefs.gtmModel?.[gtm] || {};
    }

    // Determine most relevant benchmark value
    result.recommendedBenchmark = this._selectBestBenchmark(result.segmentedBenchmarks, baseBenchmarks);

    return result;
  }

  /**
   * Select the most relevant benchmark based on available segmented data
   * @private
   */
  _selectBestBenchmark(segmentedBenchmarks, baseBenchmarks) {
    // Priority: stage > acv > gtm > base
    if (segmentedBenchmarks.stage?.median) {
      return { value: segmentedBenchmarks.stage.median, source: 'stage-specific' };
    }
    if (segmentedBenchmarks.acv?.median) {
      return { value: segmentedBenchmarks.acv.median, source: 'acv-specific' };
    }
    if (segmentedBenchmarks.gtm?.median) {
      return { value: segmentedBenchmarks.gtm.median, source: 'gtm-specific' };
    }
    // Fall back to base benchmark
    if (baseBenchmarks.median || baseBenchmarks.good) {
      return { value: baseBenchmarks.median || baseBenchmarks.good, source: 'industry-average' };
    }
    return null;
  }

  /**
   * Get available segmentation options
   * @returns {Object} - Segmentation options with descriptions
   */
  getSegmentationOptions() {
    this._ensureInitialized();
    return this.definitions.benchmarkSegmentation || {};
  }

  /**
   * Evaluate a metric value against benchmarks
   * @param {string} kpiId - KPI identifier
   * @param {number} value - Actual value
   * @param {string} industry - Industry (default: saas)
   * @returns {Object} - Evaluation result
   */
  evaluateAgainstBenchmarks(kpiId, value, industry = 'saas') {
    this._ensureInitialized();
    const kpi = this.getKPI(kpiId);
    const benchmarks = this.getBenchmarks(kpiId, industry);

    if (!kpi || !benchmarks) {
      return { evaluated: false, reason: 'No benchmarks available' };
    }

    const result = {
      kpiId,
      value,
      unit: kpi.unit,
      direction: kpi.direction,
      benchmarks,
      rating: 'unknown',
      percentile: null,
      recommendation: null
    };

    // Parse benchmark thresholds
    const thresholds = this._parseBenchmarkThresholds(benchmarks, kpi);
    if (thresholds) {
      result.rating = this._calculateRating(value, thresholds, kpi.direction);
      result.recommendation = this._generateRecommendation(result.rating, kpi);
    }

    return result;
  }

  /**
   * Parse benchmark thresholds from various formats
   * @private
   */
  _parseBenchmarkThresholds(benchmarks, kpi) {
    const thresholds = {};

    // Try to extract numeric thresholds
    for (const [key, value] of Object.entries(benchmarks)) {
      if (typeof value === 'string') {
        const match = value.match(/([<>]?)(\d+\.?\d*)%?/);
        if (match) {
          thresholds[key] = parseFloat(match[2]);
        }
      } else if (typeof value === 'number') {
        thresholds[key] = value;
      }
    }

    return Object.keys(thresholds).length > 0 ? thresholds : null;
  }

  /**
   * Calculate rating based on thresholds
   * @private
   */
  _calculateRating(value, thresholds, direction) {
    const isHigherBetter = direction === 'higher_is_better';

    if (thresholds.excellent || thresholds.elite) {
      const excellent = thresholds.excellent || thresholds.elite;
      if (isHigherBetter ? value >= excellent : value <= excellent) {
        return 'excellent';
      }
    }

    if (thresholds.good) {
      if (isHigherBetter ? value >= thresholds.good : value <= thresholds.good) {
        return 'good';
      }
    }

    if (thresholds.average || thresholds.median) {
      const avg = thresholds.average || thresholds.median;
      if (isHigherBetter ? value >= avg : value <= avg) {
        return 'average';
      }
    }

    if (thresholds.poor || thresholds.concernThreshold) {
      const poor = thresholds.poor || thresholds.concernThreshold;
      if (isHigherBetter ? value < poor : value > poor) {
        return 'poor';
      }
    }

    return 'below_average';
  }

  /**
   * Generate improvement recommendation
   * @private
   */
  _generateRecommendation(rating, kpi) {
    if (rating === 'excellent' || rating === 'good') {
      return `${kpi.fullName} is performing well. Continue current strategies.`;
    }

    if (rating === 'average') {
      return `${kpi.fullName} is at industry average. Consider optimization opportunities.`;
    }

    return `${kpi.fullName} needs improvement. Review related factors: ${kpi.relatedKPIs?.join(', ') || 'underlying processes'}.`;
  }

  // ============================================================================
  // CALCULATION METHODS
  // ============================================================================

  /**
   * Calculate a derived KPI value from input components
   * Supports complex efficiency metrics like Magic Number, Burn Multiple, Rule of 40, etc.
   * @param {string} kpiId - KPI identifier
   * @param {Object} inputs - Input values required for calculation
   * @returns {Object} - Calculation result with value, formula, and validation
   */
  calculateDerivedKPI(kpiId, inputs) {
    this._ensureInitialized();
    const kpi = this.getKPI(kpiId);
    if (!kpi) {
      return { error: `KPI not found: ${kpiId}`, value: null };
    }

    // Dispatch to specific calculation methods
    const calculators = {
      // Efficiency Metrics
      'magic_number': this._calculateMagicNumber.bind(this),
      'burn_multiple': this._calculateBurnMultiple.bind(this),
      'bes': this._calculateBES.bind(this),
      'rule_of_40': this._calculateRuleOf40.bind(this),
      'arr_per_employee': this._calculateARRperEmployee.bind(this),
      'gross_margin': this._calculateGrossMargin.bind(this),
      'opex_ratios': this._calculateOpExRatios.bind(this),

      // Expansion Metrics
      'expansion_revenue_rate': this._calculateExpansionRate.bind(this),
      'acv_growth': this._calculateACVGrowth.bind(this),
      'retention_expansion_mix': this._calculateRetentionExpansionMix.bind(this),

      // Retention Metrics
      'nrr': this._calculateNRR.bind(this),
      'grr': this._calculateGRR.bind(this),
      'logo_retention': this._calculateLogoRetention.bind(this),
      'customer_churn': this._calculateCustomerChurn.bind(this),

      // Unit Economics
      'cac': this._calculateCAC.bind(this),
      'ltv': this._calculateLTV.bind(this),
      'ltv_cac_ratio': this._calculateLTVCACRatio.bind(this),
      'cac_payback': this._calculateCACPayback.bind(this),

      // Pipeline Metrics
      'pipeline_coverage': this._calculatePipelineCoverage.bind(this),
      'sales_velocity': this._calculateSalesVelocity.bind(this),
      'win_rate': this._calculateWinRate.bind(this)
    };

    const calculator = calculators[kpi.id] || calculators[kpiId.toLowerCase()];
    if (!calculator) {
      return {
        error: `No calculator available for KPI: ${kpiId}`,
        value: null,
        formula: kpi.formula,
        hint: 'Provide raw data and apply the formula manually'
      };
    }

    try {
      const result = calculator(inputs, kpi);
      return {
        kpiId: kpi.id,
        kpiName: kpi.fullName,
        value: result.value,
        unit: kpi.unit,
        formula: kpi.formula,
        inputs: result.inputs,
        calculationSteps: result.steps || [],
        direction: kpi.direction,
        interpretation: result.interpretation || this._interpretValue(kpi, result.value)
      };
    } catch (error) {
      return {
        error: `Calculation error: ${error.message}`,
        value: null,
        formula: kpi.formula,
        requiredInputs: this._getRequiredInputs(kpiId)
      };
    }
  }

  /**
   * Get required inputs for a KPI calculation
   * @param {string} kpiId - KPI identifier
   * @returns {Object} - Required inputs with descriptions
   */
  _getRequiredInputs(kpiId) {
    const inputRequirements = {
      'magic_number': {
        netNewARR: 'Net new ARR added in the period',
        priorQuarterSMSpend: 'Sales & Marketing spend from prior quarter'
      },
      'burn_multiple': {
        netBurn: 'Net cash burn in the period',
        netNewARR: 'Net new ARR added in the period'
      },
      'rule_of_40': {
        revenueGrowthRate: 'Revenue growth rate (decimal, e.g., 0.30 for 30%)',
        ebitdaMargin: 'EBITDA margin (decimal, e.g., 0.15 for 15%)'
      },
      'arr_per_employee': {
        arr: 'Annual Recurring Revenue',
        employeeCount: 'Total employee count'
      },
      'gross_margin': {
        revenue: 'Total revenue',
        cogs: 'Cost of goods sold'
      },
      'nrr': {
        startingMRR: 'MRR at start of period',
        expansionMRR: 'Expansion MRR (upsells)',
        contractionMRR: 'Contraction MRR (downgrades)',
        churnMRR: 'Churned MRR (lost customers)'
      },
      'ltv': {
        arpu: 'Average revenue per user (monthly)',
        churnRate: 'Monthly churn rate (decimal)'
      },
      'sales_velocity': {
        opportunities: 'Number of opportunities',
        winRate: 'Win rate (decimal)',
        avgDealSize: 'Average deal size',
        salesCycleLength: 'Average sales cycle in days'
      }
    };

    return inputRequirements[kpiId.toLowerCase()] || { note: 'Consult KPI formula for required inputs' };
  }

  // --- Efficiency Metric Calculators ---

  _calculateMagicNumber(inputs) {
    const { netNewARR, priorQuarterSMSpend } = inputs;
    if (!netNewARR || !priorQuarterSMSpend) {
      throw new Error('Required: netNewARR, priorQuarterSMSpend');
    }
    const value = (netNewARR * 4) / priorQuarterSMSpend;
    return {
      value: Math.round(value * 100) / 100,
      inputs: { netNewARR, priorQuarterSMSpend },
      steps: [
        `Annualized Net New ARR: ${netNewARR} × 4 = ${netNewARR * 4}`,
        `Magic Number: ${netNewARR * 4} / ${priorQuarterSMSpend} = ${value.toFixed(2)}`
      ],
      interpretation: this._interpretMagicNumber(value)
    };
  }

  _interpretMagicNumber(value) {
    if (value < 0.5) return 'Inefficient - re-evaluate GTM strategy';
    if (value < 0.75) return 'Acceptable - room for improvement';
    if (value < 1.0) return 'Good - efficient sales motion';
    return 'Excellent - consider investing more in growth';
  }

  _calculateBurnMultiple(inputs) {
    const { netBurn, netNewARR } = inputs;
    if (!netBurn || !netNewARR) {
      throw new Error('Required: netBurn, netNewARR');
    }
    const value = netBurn / netNewARR;
    return {
      value: Math.round(value * 100) / 100,
      inputs: { netBurn, netNewARR },
      steps: [`Burn Multiple: ${netBurn} / ${netNewARR} = ${value.toFixed(2)}x`],
      interpretation: this._interpretBurnMultiple(value)
    };
  }

  _interpretBurnMultiple(value) {
    if (value < 1) return 'Amazing - generating more ARR than burning';
    if (value < 1.5) return 'Great - efficient growth';
    if (value < 2) return 'Good - sustainable';
    if (value < 3) return 'Suspect - needs attention';
    return 'Bad - unsustainable';
  }

  _calculateBES(inputs) {
    const { netNewARR, netBurn } = inputs;
    if (!netNewARR || !netBurn) {
      throw new Error('Required: netNewARR, netBurn');
    }
    const value = netNewARR / netBurn;
    return {
      value: Math.round(value * 100) / 100,
      inputs: { netNewARR, netBurn },
      steps: [`BES (Bessemer Efficiency Score): ${netNewARR} / ${netBurn} = ${value.toFixed(2)}`]
    };
  }

  _calculateRuleOf40(inputs) {
    const { revenueGrowthRate, ebitdaMargin } = inputs;
    if (revenueGrowthRate === undefined || ebitdaMargin === undefined) {
      throw new Error('Required: revenueGrowthRate, ebitdaMargin');
    }
    const value = (revenueGrowthRate * 100) + (ebitdaMargin * 100);
    return {
      value: Math.round(value * 10) / 10,
      inputs: { revenueGrowthRate, ebitdaMargin },
      steps: [
        `Revenue Growth: ${(revenueGrowthRate * 100).toFixed(1)}%`,
        `EBITDA Margin: ${(ebitdaMargin * 100).toFixed(1)}%`,
        `Rule of 40: ${(revenueGrowthRate * 100).toFixed(1)} + ${(ebitdaMargin * 100).toFixed(1)} = ${value.toFixed(1)}%`
      ],
      interpretation: this._interpretRuleOf40(value)
    };
  }

  _interpretRuleOf40(value) {
    if (value < 30) return 'Needs significant improvement';
    if (value < 40) return 'Approaching healthy balance';
    if (value < 50) return 'Healthy SaaS business';
    return 'Excellent - premium valuation territory';
  }

  _calculateARRperEmployee(inputs) {
    const { arr, employeeCount } = inputs;
    if (!arr || !employeeCount) {
      throw new Error('Required: arr, employeeCount');
    }
    const value = arr / employeeCount;
    return {
      value: Math.round(value),
      inputs: { arr, employeeCount },
      steps: [`ARR per Employee: ${arr} / ${employeeCount} = $${Math.round(value).toLocaleString()}`]
    };
  }

  _calculateGrossMargin(inputs) {
    const { revenue, cogs } = inputs;
    if (!revenue || cogs === undefined) {
      throw new Error('Required: revenue, cogs');
    }
    const value = ((revenue - cogs) / revenue) * 100;
    return {
      value: Math.round(value * 10) / 10,
      inputs: { revenue, cogs },
      steps: [
        `Gross Profit: ${revenue} - ${cogs} = ${revenue - cogs}`,
        `Gross Margin: ${revenue - cogs} / ${revenue} × 100 = ${value.toFixed(1)}%`
      ]
    };
  }

  _calculateOpExRatios(inputs) {
    const { revenue, smSpend, rdSpend, gaSpend } = inputs;
    if (!revenue) {
      throw new Error('Required: revenue, and at least one of smSpend, rdSpend, gaSpend');
    }
    const ratios = {};
    const steps = [];

    if (smSpend !== undefined) {
      ratios.sm = Math.round((smSpend / revenue) * 1000) / 10;
      steps.push(`S&M Ratio: ${smSpend} / ${revenue} × 100 = ${ratios.sm}%`);
    }
    if (rdSpend !== undefined) {
      ratios.rd = Math.round((rdSpend / revenue) * 1000) / 10;
      steps.push(`R&D Ratio: ${rdSpend} / ${revenue} × 100 = ${ratios.rd}%`);
    }
    if (gaSpend !== undefined) {
      ratios.ga = Math.round((gaSpend / revenue) * 1000) / 10;
      steps.push(`G&A Ratio: ${gaSpend} / ${revenue} × 100 = ${ratios.ga}%`);
    }

    const total = (ratios.sm || 0) + (ratios.rd || 0) + (ratios.ga || 0);
    steps.push(`Total OpEx Ratio: ${total.toFixed(1)}%`);

    return {
      value: ratios,
      inputs,
      steps
    };
  }

  // --- Expansion Metric Calculators ---

  _calculateExpansionRate(inputs) {
    const { expansionMRR, startingMRR } = inputs;
    if (!expansionMRR || !startingMRR) {
      throw new Error('Required: expansionMRR, startingMRR');
    }
    const value = (expansionMRR / startingMRR) * 100;
    return {
      value: Math.round(value * 10) / 10,
      inputs: { expansionMRR, startingMRR },
      steps: [`Expansion Rate: ${expansionMRR} / ${startingMRR} × 100 = ${value.toFixed(1)}%`]
    };
  }

  _calculateACVGrowth(inputs) {
    const { currentACV, previousACV } = inputs;
    if (!currentACV || !previousACV) {
      throw new Error('Required: currentACV, previousACV');
    }
    const value = ((currentACV - previousACV) / previousACV) * 100;
    return {
      value: Math.round(value * 10) / 10,
      inputs: { currentACV, previousACV },
      steps: [`ACV Growth: (${currentACV} - ${previousACV}) / ${previousACV} × 100 = ${value.toFixed(1)}%`]
    };
  }

  _calculateRetentionExpansionMix(inputs) {
    const { expansionRevenue, retentionRevenue } = inputs;
    if (!expansionRevenue || !retentionRevenue) {
      throw new Error('Required: expansionRevenue, retentionRevenue');
    }
    const total = expansionRevenue + retentionRevenue;
    const value = (expansionRevenue / total) * 100;
    return {
      value: Math.round(value * 10) / 10,
      inputs: { expansionRevenue, retentionRevenue },
      steps: [
        `Total: ${expansionRevenue} + ${retentionRevenue} = ${total}`,
        `Expansion Mix: ${expansionRevenue} / ${total} × 100 = ${value.toFixed(1)}%`
      ]
    };
  }

  // --- Retention Metric Calculators ---

  _calculateNRR(inputs) {
    const { startingMRR, expansionMRR = 0, contractionMRR = 0, churnMRR = 0 } = inputs;
    if (!startingMRR) {
      throw new Error('Required: startingMRR');
    }
    const endingMRR = startingMRR + expansionMRR - contractionMRR - churnMRR;
    const value = (endingMRR / startingMRR) * 100;
    return {
      value: Math.round(value * 10) / 10,
      inputs: { startingMRR, expansionMRR, contractionMRR, churnMRR },
      steps: [
        `Ending MRR: ${startingMRR} + ${expansionMRR} - ${contractionMRR} - ${churnMRR} = ${endingMRR}`,
        `NRR: ${endingMRR} / ${startingMRR} × 100 = ${value.toFixed(1)}%`
      ]
    };
  }

  _calculateGRR(inputs) {
    const { startingMRR, contractionMRR = 0, churnMRR = 0 } = inputs;
    if (!startingMRR) {
      throw new Error('Required: startingMRR');
    }
    const retained = startingMRR - contractionMRR - churnMRR;
    const value = (retained / startingMRR) * 100;
    return {
      value: Math.round(value * 10) / 10,
      inputs: { startingMRR, contractionMRR, churnMRR },
      steps: [
        `Retained MRR: ${startingMRR} - ${contractionMRR} - ${churnMRR} = ${retained}`,
        `GRR: ${retained} / ${startingMRR} × 100 = ${value.toFixed(1)}%`
      ]
    };
  }

  _calculateLogoRetention(inputs) {
    const { startingCustomers, newCustomers = 0, lostCustomers = 0 } = inputs;
    if (!startingCustomers) {
      throw new Error('Required: startingCustomers');
    }
    const endingCustomers = startingCustomers + newCustomers - lostCustomers;
    const value = ((endingCustomers - newCustomers) / startingCustomers) * 100;
    return {
      value: Math.round(value * 10) / 10,
      inputs: { startingCustomers, newCustomers, lostCustomers },
      steps: [
        `Ending (ex-new): ${endingCustomers} - ${newCustomers} = ${endingCustomers - newCustomers}`,
        `Logo Retention: ${endingCustomers - newCustomers} / ${startingCustomers} × 100 = ${value.toFixed(1)}%`
      ]
    };
  }

  _calculateCustomerChurn(inputs) {
    const { startingCustomers, lostCustomers } = inputs;
    if (!startingCustomers || lostCustomers === undefined) {
      throw new Error('Required: startingCustomers, lostCustomers');
    }
    const value = (lostCustomers / startingCustomers) * 100;
    return {
      value: Math.round(value * 10) / 10,
      inputs: { startingCustomers, lostCustomers },
      steps: [`Customer Churn: ${lostCustomers} / ${startingCustomers} × 100 = ${value.toFixed(1)}%`]
    };
  }

  // --- Unit Economics Calculators ---

  _calculateCAC(inputs) {
    const { salesSpend = 0, marketingSpend = 0, newCustomers } = inputs;
    if (!newCustomers) {
      throw new Error('Required: newCustomers, and at least salesSpend or marketingSpend');
    }
    const totalSpend = salesSpend + marketingSpend;
    const value = totalSpend / newCustomers;
    return {
      value: Math.round(value),
      inputs: { salesSpend, marketingSpend, newCustomers },
      steps: [
        `Total S&M Spend: ${salesSpend} + ${marketingSpend} = ${totalSpend}`,
        `CAC: ${totalSpend} / ${newCustomers} = $${Math.round(value).toLocaleString()}`
      ]
    };
  }

  _calculateLTV(inputs) {
    const { arpu, churnRate } = inputs;
    if (!arpu || !churnRate) {
      throw new Error('Required: arpu (monthly), churnRate (monthly decimal)');
    }
    const value = arpu / churnRate;
    return {
      value: Math.round(value),
      inputs: { arpu, churnRate },
      steps: [`LTV: ${arpu} / ${churnRate} = $${Math.round(value).toLocaleString()}`]
    };
  }

  _calculateLTVCACRatio(inputs) {
    const { ltv, cac } = inputs;
    if (!ltv || !cac) {
      throw new Error('Required: ltv, cac');
    }
    const value = ltv / cac;
    return {
      value: Math.round(value * 100) / 100,
      inputs: { ltv, cac },
      steps: [`LTV:CAC Ratio: ${ltv} / ${cac} = ${value.toFixed(2)}:1`]
    };
  }

  _calculateCACPayback(inputs) {
    const { cac, mrrPerCustomer } = inputs;
    if (!cac || !mrrPerCustomer) {
      throw new Error('Required: cac, mrrPerCustomer');
    }
    const value = cac / mrrPerCustomer;
    return {
      value: Math.round(value * 10) / 10,
      inputs: { cac, mrrPerCustomer },
      steps: [`CAC Payback: ${cac} / ${mrrPerCustomer} = ${value.toFixed(1)} months`]
    };
  }

  // --- Pipeline Metric Calculators ---

  _calculatePipelineCoverage(inputs) {
    const { pipelineValue, quota } = inputs;
    if (!pipelineValue || !quota) {
      throw new Error('Required: pipelineValue, quota');
    }
    const value = pipelineValue / quota;
    return {
      value: Math.round(value * 100) / 100,
      inputs: { pipelineValue, quota },
      steps: [`Pipeline Coverage: ${pipelineValue} / ${quota} = ${value.toFixed(2)}x`]
    };
  }

  _calculateSalesVelocity(inputs) {
    const { opportunities, winRate, avgDealSize, salesCycleLength } = inputs;
    if (!opportunities || !winRate || !avgDealSize || !salesCycleLength) {
      throw new Error('Required: opportunities, winRate, avgDealSize, salesCycleLength');
    }
    const value = (opportunities * winRate * avgDealSize) / salesCycleLength;
    return {
      value: Math.round(value * 100) / 100,
      inputs: { opportunities, winRate, avgDealSize, salesCycleLength },
      steps: [
        `Numerator: ${opportunities} × ${winRate} × ${avgDealSize} = ${opportunities * winRate * avgDealSize}`,
        `Sales Velocity: ${opportunities * winRate * avgDealSize} / ${salesCycleLength} = $${value.toFixed(2)}/day`
      ]
    };
  }

  _calculateWinRate(inputs) {
    const { closedWon, totalOpportunities } = inputs;
    if (!closedWon || !totalOpportunities) {
      throw new Error('Required: closedWon, totalOpportunities');
    }
    const value = (closedWon / totalOpportunities) * 100;
    return {
      value: Math.round(value * 10) / 10,
      inputs: { closedWon, totalOpportunities },
      steps: [`Win Rate: ${closedWon} / ${totalOpportunities} × 100 = ${value.toFixed(1)}%`]
    };
  }

  /**
   * Interpret a KPI value based on its direction and common thresholds
   * @private
   */
  _interpretValue(kpi, value) {
    const benchmarks = this.getBenchmarks(kpi.id);
    if (!benchmarks) return null;

    const isHigherBetter = kpi.direction === 'higher_is_better';
    const rating = this._calculateRating(value, this._parseBenchmarkThresholds(benchmarks, kpi), kpi.direction);

    return `${kpi.fullName} of ${value} is rated as ${rating}`;
  }

  // ============================================================================
  // METHODOLOGY DOCUMENTATION METHODS
  // ============================================================================

  /**
   * Get formula documentation for a KPI
   * @param {string} kpiId - KPI identifier
   * @returns {Object} - Formula documentation
   */
  getFormulaDocumentation(kpiId) {
    this._ensureInitialized();
    const kpi = this.getKPI(kpiId);
    if (!kpi) return null;

    return {
      name: kpi.fullName,
      abbreviation: kpi.abbreviation,
      formula: kpi.formula,
      formulaDetailed: kpi.formulaDetailed,
      unit: kpi.unit,
      direction: kpi.direction,
      description: kpi.description,
      components: kpi.components || null,
      interpretation: kpi.interpretation || null
    };
  }

  /**
   * Generate methodology text for a set of KPIs
   * @param {string[]} kpiIds - Array of KPI identifiers
   * @returns {string} - Markdown methodology text
   */
  generateMethodologyText(kpiIds) {
    this._ensureInitialized();
    const sections = [];

    sections.push('## Methodology\n');
    sections.push('### Metrics Definitions and Formulas\n');

    for (const kpiId of kpiIds) {
      const doc = this.getFormulaDocumentation(kpiId);
      if (!doc) continue;

      sections.push(`#### ${doc.name} (${doc.abbreviation})\n`);
      sections.push(`**Definition**: ${doc.description}\n`);
      sections.push(`**Formula**: \`${doc.formula}\`\n`);
      if (doc.formulaDetailed) {
        sections.push(`**Detailed**: \`${doc.formulaDetailed}\`\n`);
      }
      sections.push(`**Unit**: ${doc.unit}\n`);
      sections.push(`**Direction**: ${doc.direction === 'higher_is_better' ? 'Higher is better' : 'Lower is better'}\n`);
      sections.push('');
    }

    return sections.join('\n');
  }

  /**
   * Get benchmark sources for citation
   * @returns {string[]} - Source citations
   */
  getBenchmarkSources() {
    this._ensureInitialized();
    return this.definitions.sources || [];
  }

  // ============================================================================
  // REPORT TEMPLATE METHODS
  // ============================================================================

  /**
   * Get pre-defined report templates
   * @returns {Object} - Report templates
   */
  getReportTemplates() {
    this._ensureInitialized();
    return this.definitions.reportTemplates || {};
  }

  /**
   * Get a specific report template
   * @param {string} templateId - Template identifier
   * @returns {Object|null} - Template or null
   */
  getReportTemplate(templateId) {
    this._ensureInitialized();
    return this.definitions.reportTemplates?.[templateId] || null;
  }

  /**
   * Recommend a report template based on user description
   * @param {string} description - User's report description
   * @returns {Object[]} - Recommended templates with scores
   */
  recommendReportTemplate(description) {
    this._ensureInitialized();
    const templates = this.definitions.reportTemplates || {};
    const descLower = description.toLowerCase();
    const recommendations = [];

    for (const [id, template] of Object.entries(templates)) {
      let score = 0;

      // Match audience
      if (descLower.includes(template.audience.toLowerCase())) {
        score += 3;
      }

      // Match template name keywords
      const nameWords = template.name.toLowerCase().split(/\s+/);
      for (const word of nameWords) {
        if (descLower.includes(word) && word.length > 3) {
          score += 2;
        }
      }

      // Match KPIs
      for (const kpiId of template.kpis) {
        const kpi = this.getKPI(kpiId);
        if (kpi && descLower.includes(kpi.fullName.toLowerCase())) {
          score += 2;
        }
        if (kpi && descLower.includes(kpi.abbreviation.toLowerCase())) {
          score += 1;
        }
      }

      if (score > 0) {
        recommendations.push({ templateId: id, template, score });
      }
    }

    return recommendations.sort((a, b) => b.score - a.score);
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Ensure the knowledge base is initialized
   * @private
   */
  _ensureInitialized() {
    if (!this.initialized) {
      // Sync initialization for CLI usage
      const configContent = fs.readFileSync(CONFIG_PATH, 'utf8');
      this.definitions = JSON.parse(configContent);
      this._buildIndexes();
      this.initialized = true;
    }
  }

  /**
   * Get summary statistics about the knowledge base
   * @returns {Object} - Statistics
   */
  getStats() {
    this._ensureInitialized();
    const stats = {
      version: this.definitions.version,
      lastUpdated: this.definitions.lastUpdated,
      categories: Object.keys(this.definitions.categories).length,
      totalKPIs: 0,
      kpisByCategory: {}
    };

    for (const [categoryId, category] of Object.entries(this.definitions.categories)) {
      const count = Object.keys(category.kpis).length;
      stats.kpisByCategory[categoryId] = count;
      stats.totalKPIs += count;
    }

    return stats;
  }

  /**
   * Export all KPIs as flat list
   * @returns {Object[]} - All KPIs
   */
  exportAllKPIs() {
    this._ensureInitialized();
    const kpis = [];

    for (const [categoryId, category] of Object.entries(this.definitions.categories)) {
      for (const [kpiId, kpi] of Object.entries(category.kpis)) {
        kpis.push({
          ...kpi,
          categoryId,
          categoryName: category.name
        });
      }
    }

    return kpis;
  }
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const kb = new RevOpsKPIKnowledgeBase();
  await kb.initialize();

  if (args.length === 0 || args[0] === '--help') {
    console.log(`
RevOps KPI Knowledge Base CLI (v2.0.0)

Usage:
  node revops-kpi-knowledge-base.js <command> [options]

Commands:
  stats                    Show knowledge base statistics
  list                     List all KPIs
  categories               List all categories
  get <kpi-id>            Get details for a specific KPI
  search <query>          Search KPIs by natural language
  recommend <goal>        Recommend KPIs for a business goal
  benchmarks <kpi-id>     Get benchmarks for a KPI
  evaluate <kpi-id> <value>  Evaluate a value against benchmarks
  soql <kpi-id>           Generate SOQL template for a KPI
  methodology <kpi-ids>   Generate methodology text
  templates               List report templates
  template <id>           Get a specific template

NEW in v2.0.0:
  gtm <model>             Get KPIs for a GTM model (salesLed, plg, hybrid)
  segment <kpi-id>        Get segmented benchmarks (use --stage, --acv, --gtm flags)
  calculate <kpi-id>      Calculate a derived KPI (prompts for inputs)
  segmentation            Show available segmentation options

Examples:
  node revops-kpi-knowledge-base.js get ARR
  node revops-kpi-knowledge-base.js search "customer retention"
  node revops-kpi-knowledge-base.js recommend "reduce churn"
  node revops-kpi-knowledge-base.js recommend "board readiness"
  node revops-kpi-knowledge-base.js evaluate NRR 105
  node revops-kpi-knowledge-base.js soql ARR
  node revops-kpi-knowledge-base.js gtm plg
  node revops-kpi-knowledge-base.js segment NRR --stage seriesB --acv enterprise
  node revops-kpi-knowledge-base.js calculate magic_number
    `);
    return;
  }

  const command = args[0];

  switch (command) {
    case 'stats':
      console.log(JSON.stringify(kb.getStats(), null, 2));
      break;

    case 'list':
      const allKPIs = kb.exportAllKPIs();
      console.log(JSON.stringify(allKPIs.map(k => ({
        id: k.id,
        name: k.fullName,
        abbreviation: k.abbreviation,
        category: k.categoryName
      })), null, 2));
      break;

    case 'categories':
      console.log(JSON.stringify(kb.getCategories(), null, 2));
      break;

    case 'get':
      if (!args[1]) {
        console.error('Error: KPI ID required');
        process.exit(1);
      }
      const kpi = kb.getKPI(args[1]);
      if (kpi) {
        console.log(JSON.stringify(kpi, null, 2));
      } else {
        console.error(`KPI not found: ${args[1]}`);
        process.exit(1);
      }
      break;

    case 'search':
      if (!args[1]) {
        console.error('Error: Search query required');
        process.exit(1);
      }
      const searchResults = kb.searchKPIs(args.slice(1).join(' '));
      console.log(JSON.stringify(searchResults.map(r => ({
        id: r.kpi.id,
        name: r.kpi.fullName,
        score: r.score,
        relevance: r.relevance.toFixed(2)
      })), null, 2));
      break;

    case 'recommend':
      if (!args[1]) {
        console.error('Error: Goal required');
        process.exit(1);
      }
      const recommendations = kb.recommendKPIsForGoal(args.slice(1).join(' '));
      console.log(JSON.stringify(recommendations.map(r => ({
        id: r.kpi.id,
        name: r.kpi.fullName,
        reason: r.reason,
        priority: r.priority
      })), null, 2));
      break;

    case 'benchmarks':
      if (!args[1]) {
        console.error('Error: KPI ID required');
        process.exit(1);
      }
      const benchmarks = kb.getBenchmarks(args[1], args[2] || 'saas');
      console.log(JSON.stringify(benchmarks, null, 2));
      break;

    case 'evaluate':
      if (!args[1] || !args[2]) {
        console.error('Error: KPI ID and value required');
        process.exit(1);
      }
      const evaluation = kb.evaluateAgainstBenchmarks(args[1], parseFloat(args[2]), args[3] || 'saas');
      console.log(JSON.stringify(evaluation, null, 2));
      break;

    case 'soql':
      if (!args[1]) {
        console.error('Error: KPI ID required');
        process.exit(1);
      }
      const soql = kb.generateSOQLTemplate(args[1], {
        dateRange: args[2] ? { start: args[2], end: args[3] } : null
      });
      console.log(soql || 'No SOQL template available for this KPI');
      break;

    case 'methodology':
      if (!args[1]) {
        console.error('Error: KPI IDs required (comma-separated)');
        process.exit(1);
      }
      const kpiIds = args[1].split(',').map(s => s.trim());
      const methodology = kb.generateMethodologyText(kpiIds);
      console.log(methodology);
      break;

    case 'templates':
      console.log(JSON.stringify(kb.getReportTemplates(), null, 2));
      break;

    case 'template':
      if (!args[1]) {
        console.error('Error: Template ID required');
        process.exit(1);
      }
      const template = kb.getReportTemplate(args[1]);
      console.log(JSON.stringify(template, null, 2));
      break;

    // NEW v2.0.0 commands

    case 'gtm':
      if (!args[1]) {
        console.error('Error: GTM model required (salesLed, plg, hybrid)');
        process.exit(1);
      }
      try {
        const gtmKPIs = kb.getKPIsByGTMModel(args[1]);
        console.log(JSON.stringify(gtmKPIs.map(r => ({
          id: r.kpi.id,
          name: r.kpi.fullName,
          category: r.categoryName,
          gtmSpecific: r.gtmSpecific,
          relevance: r.relevance,
          hasGTMBenchmarks: !!r.gtmBenchmarks
        })), null, 2));
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
      break;

    case 'segment':
      if (!args[1]) {
        console.error('Error: KPI ID required');
        process.exit(1);
      }
      // Parse flags: --stage, --acv, --gtm
      const segArgs = args.slice(1);
      const kpiIdForSeg = segArgs[0];
      const segmentation = {};
      for (let i = 1; i < segArgs.length; i++) {
        if (segArgs[i] === '--stage' && segArgs[i + 1]) {
          segmentation.stage = segArgs[++i];
        } else if (segArgs[i] === '--acv' && segArgs[i + 1]) {
          segmentation.acv = segArgs[++i];
        } else if (segArgs[i] === '--gtm' && segArgs[i + 1]) {
          segmentation.gtm = segArgs[++i];
        }
      }
      const segResult = kb.getBenchmarksBySegment(kpiIdForSeg, segmentation);
      if (segResult) {
        console.log(JSON.stringify(segResult, null, 2));
      } else {
        console.error(`KPI not found: ${kpiIdForSeg}`);
        process.exit(1);
      }
      break;

    case 'segmentation':
      console.log(JSON.stringify(kb.getSegmentationOptions(), null, 2));
      break;

    case 'calculate':
      if (!args[1]) {
        console.error('Error: KPI ID required');
        console.error('Supported KPIs: magic_number, burn_multiple, rule_of_40, arr_per_employee, gross_margin, nrr, grr, ltv, cac, pipeline_coverage, sales_velocity, win_rate');
        process.exit(1);
      }
      // For CLI, show required inputs
      const calcKpiId = args[1];
      const calcKpi = kb.getKPI(calcKpiId);
      if (!calcKpi) {
        console.error(`KPI not found: ${calcKpiId}`);
        process.exit(1);
      }
      // Check if inputs provided as JSON in args[2]
      if (args[2]) {
        try {
          const calcInputs = JSON.parse(args[2]);
          const calcResult = kb.calculateDerivedKPI(calcKpiId, calcInputs);
          console.log(JSON.stringify(calcResult, null, 2));
        } catch (parseErr) {
          console.error('Error parsing inputs JSON:', parseErr.message);
          console.error('Usage: calculate <kpi-id> \'{"input1": value, "input2": value}\'');
          process.exit(1);
        }
      } else {
        // Show required inputs
        const requiredInputs = kb._getRequiredInputs(calcKpiId);
        console.log(`KPI: ${calcKpi.fullName} (${calcKpi.id})`);
        console.log(`Formula: ${calcKpi.formula}\n`);
        console.log('Required inputs:');
        console.log(JSON.stringify(requiredInputs, null, 2));
        console.log(`\nUsage: calculate ${calcKpiId} '${JSON.stringify(Object.fromEntries(Object.keys(requiredInputs).map(k => [k, '<value>'])))}'`);
      }
      break;

    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

// Run CLI if executed directly
if (require.main === module) {
  main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}

// Export for programmatic use
module.exports = {
  RevOpsKPIKnowledgeBase
};
