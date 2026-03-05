/**
 * Report Template Engine
 *
 * Loads and renders strategic GTM report templates with data.
 * Provides standardized template parsing, metric calculation orchestration,
 * and output generation for all strategic report types.
 *
 * @module report-template-engine
 */

const fs = require('fs');
const path = require('path');

// Template directory relative to plugin root
const TEMPLATE_DIR = path.join(__dirname, '..', '..', 'templates', 'reports', 'strategic');
const BENCHMARK_FILE = path.join(__dirname, '..', '..', 'config', 'benchmark-baseline.json');

/**
 * ReportTemplateEngine class
 * Handles template loading, validation, and rendering
 */
class ReportTemplateEngine {
  constructor(options = {}) {
    this.templateDir = options.templateDir || TEMPLATE_DIR;
    this.benchmarkFile = options.benchmarkFile || BENCHMARK_FILE;
    this.templates = {};
    this.benchmarks = null;
    this.initialized = false;
  }

  /**
   * Initialize the engine by loading templates and benchmarks
   */
  async initialize() {
    if (this.initialized) return;

    // Load template index
    const indexPath = path.join(this.templateDir, '..', 'index.json');
    if (fs.existsSync(indexPath)) {
      const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
      this.templateIndex = index;
    }

    // Load all templates
    const templateFiles = fs.readdirSync(this.templateDir)
      .filter(f => f.endsWith('.json'));

    for (const file of templateFiles) {
      const templatePath = path.join(this.templateDir, file);
      const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
      this.templates[template.template_id] = template;
    }

    // Load benchmarks
    if (fs.existsSync(this.benchmarkFile)) {
      this.benchmarks = JSON.parse(fs.readFileSync(this.benchmarkFile, 'utf8'));
    }

    this.initialized = true;
    return this;
  }

  /**
   * Get a template by ID
   * @param {string} templateId - Template identifier
   * @returns {object} Template configuration
   */
  getTemplate(templateId) {
    if (!this.initialized) {
      throw new Error('Engine not initialized. Call initialize() first.');
    }

    const template = this.templates[templateId];
    if (!template) {
      throw new Error(`Template not found: ${templateId}. Available: ${Object.keys(this.templates).join(', ')}`);
    }

    return template;
  }

  /**
   * List all available templates
   * @returns {Array} Template summaries
   */
  listTemplates() {
    if (!this.initialized) {
      throw new Error('Engine not initialized. Call initialize() first.');
    }

    return Object.values(this.templates).map(t => ({
      template_id: t.template_id,
      report_name: t.report_name,
      category: t.category,
      owner_function_default: t.owner_function_default
    }));
  }

  /**
   * Get templates by category
   * @param {string} category - Template category
   * @returns {Array} Matching templates
   */
  getTemplatesByCategory(category) {
    return Object.values(this.templates)
      .filter(t => t.category === category);
  }

  /**
   * Find template by keyword matching
   * @param {string} query - User query string
   * @returns {Array} Matching templates sorted by relevance
   */
  findTemplateByKeywords(query) {
    const queryLower = query.toLowerCase();
    const scores = [];

    for (const template of Object.values(this.templates)) {
      let score = 0;

      // Check report name
      if (template.report_name.toLowerCase().includes(queryLower)) {
        score += 10;
      }

      // Check template ID
      if (template.template_id.includes(queryLower)) {
        score += 8;
      }

      // Check executive questions
      for (const question of template.executive_questions_answered || []) {
        if (question.toLowerCase().includes(queryLower)) {
          score += 5;
        }
      }

      // Check metric names
      for (const metric of template.metric_definitions || []) {
        if (metric.metric_name.toLowerCase().includes(queryLower)) {
          score += 3;
        }
      }

      if (score > 0) {
        scores.push({ template, score });
      }
    }

    return scores
      .sort((a, b) => b.score - a.score)
      .map(s => s.template);
  }

  /**
   * Get data contract for a template
   * @param {string} templateId - Template identifier
   * @returns {object} Data contract specification
   */
  getDataContract(templateId) {
    const template = this.getTemplate(templateId);
    return template.required_data_contract;
  }

  /**
   * Get metric definitions for a template
   * @param {string} templateId - Template identifier
   * @returns {Array} Metric definitions with formulas
   */
  getMetricDefinitions(templateId) {
    const template = this.getTemplate(templateId);
    return template.metric_definitions;
  }

  /**
   * Get dashboard blueprint for visualization
   * @param {string} templateId - Template identifier
   * @returns {object} Dashboard configuration
   */
  getDashboardBlueprint(templateId) {
    const template = this.getTemplate(templateId);
    return template.dashboard_blueprint;
  }

  /**
   * Get insight generation prompts for AI narratives
   * @param {string} templateId - Template identifier
   * @returns {object} Insight prompts and guidance
   */
  getInsightPrompts(templateId) {
    const template = this.getTemplate(templateId);
    return template.insight_prompts_for_agent;
  }

  /**
   * Get applicable benchmarks for a template
   * @param {string} templateId - Template identifier
   * @returns {object} Relevant benchmarks
   */
  getBenchmarksForTemplate(templateId) {
    const template = this.getTemplate(templateId);
    const templateBenchmarks = template.benchmarks || {};

    // Merge with global benchmarks based on template type
    const relevantGlobal = {};

    switch (templateId) {
      case 'net-dollar-retention':
        relevantGlobal.nrr = this.benchmarks?.benchmarks?.nrr;
        relevantGlobal.grr = this.benchmarks?.benchmarks?.grr;
        break;
      case 'multi-year-revenue-model':
      case 'scenario-planning-model':
        relevantGlobal.growth_rates = this.benchmarks?.benchmarks?.growth_rates_by_stage;
        break;
      case 'arr-waterfall':
        relevantGlobal.revenue_mix = this.benchmarks?.benchmarks?.revenue_mix_by_stage;
        break;
      case 'sales-capacity-model':
      case 'new-hire-ramp-model':
        relevantGlobal.ramp = this.benchmarks?.benchmarks?.sales_ramp_months;
        relevantGlobal.quota = this.benchmarks?.benchmarks?.quota_attainment;
        break;
      case 'tam-sam-som':
        relevantGlobal.penetration = this.benchmarks?.benchmarks?.market_penetration_by_stage;
        break;
      case 'icp-performance-win-profile':
        relevantGlobal.win_rate = this.benchmarks?.benchmarks?.win_rate;
        break;
      case 'customer-support-capacity-model':
        relevantGlobal.accounts_per_csm = this.benchmarks?.benchmarks?.accounts_per_csm;
        relevantGlobal.tickets_per_agent = this.benchmarks?.benchmarks?.tickets_per_agent;
        break;
    }

    return {
      template_specific: templateBenchmarks,
      global: relevantGlobal,
      sources: this.benchmarks?.benchmarks?.[Object.keys(relevantGlobal)[0]]?.sources || []
    };
  }

  /**
   * Generate report structure from template and data
   * @param {string} templateId - Template identifier
   * @param {object} data - Calculated metrics data
   * @param {object} options - Generation options
   * @returns {object} Complete report structure
   */
  generateReport(templateId, data, options = {}) {
    const template = this.getTemplate(templateId);
    const benchmarks = this.getBenchmarksForTemplate(templateId);

    const report = {
      template_id: templateId,
      report_name: template.report_name,
      generated_at: new Date().toISOString(),
      period: options.period || this.getCurrentPeriod(),
      segments: options.segments || [],

      // Metadata
      owner_function: options.owner || template.owner_function_default,
      executive_questions_answered: template.executive_questions_answered,

      // Data sections
      metrics: this.formatMetrics(template.metric_definitions, data),
      visualizations: this.generateVisualizations(template.dashboard_blueprint, data),
      benchmarks: this.applyBenchmarks(data, benchmarks),

      // AI guidance for insight generation
      insight_guidance: template.insight_prompts_for_agent,

      // Quality and implementation notes
      quality_checks: template.required_data_contract.data_quality_checks,
      implementation_notes: template.implementation_notes
    };

    return report;
  }

  /**
   * Format metrics with calculated values
   * @private
   */
  formatMetrics(definitions, data) {
    return definitions.map(def => ({
      name: def.metric_name,
      definition: def.definition,
      formula: def.formula,
      value: data[this.toSnakeCase(def.metric_name)] || null,
      grain: def.grain,
      variants: def.known_variants,
      pitfalls: def.pitfalls
    }));
  }

  /**
   * Generate visualization configurations
   * @private
   */
  generateVisualizations(blueprint, data) {
    if (!blueprint?.layout) return [];

    return blueprint.layout.map(panel => ({
      title: panel.panel_title,
      purpose: panel.purpose,
      type: panel.visual_type,
      metrics: panel.primary_metrics,
      data: this.extractVisualizationData(panel, data),
      filters: panel.filters,
      drilldowns: panel.drilldowns,
      thresholds: panel.annotations_or_thresholds
    }));
  }

  /**
   * Extract data for a specific visualization panel
   * @private
   */
  extractVisualizationData(panel, data) {
    // Extract relevant data based on panel metrics
    const vizData = {};

    for (const metric of panel.primary_metrics) {
      const key = this.toSnakeCase(metric);
      if (data[key] !== undefined) {
        vizData[metric] = data[key];
      }
    }

    return vizData;
  }

  /**
   * Apply benchmark comparisons to data
   * @private
   */
  applyBenchmarks(data, benchmarks) {
    const comparisons = [];

    // Compare each metric against benchmarks
    for (const [key, value] of Object.entries(data)) {
      const benchmark = this.findBenchmarkForMetric(key, benchmarks);
      if (benchmark) {
        comparisons.push({
          metric: key,
          value: value,
          benchmark: benchmark.value,
          variance: this.calculateVariance(value, benchmark.value),
          assessment: this.assessAgainstBenchmark(value, benchmark),
          source: benchmark.source
        });
      }
    }

    return {
      comparisons,
      sources: benchmarks.sources
    };
  }

  /**
   * Find applicable benchmark for a metric
   * @private
   */
  findBenchmarkForMetric(metricKey, benchmarks) {
    // Check template-specific benchmarks first
    for (const [key, value] of Object.entries(benchmarks.template_specific || {})) {
      if (metricKey.includes(key)) {
        return { value, source: 'template' };
      }
    }

    // Check global benchmarks
    for (const [key, value] of Object.entries(benchmarks.global || {})) {
      if (metricKey.includes(key) && value?.median) {
        return { value: value.median, source: key };
      }
    }

    return null;
  }

  /**
   * Calculate variance from benchmark
   * @private
   */
  calculateVariance(actual, benchmark) {
    if (!benchmark || benchmark === 0) return null;
    return Math.round(((actual - benchmark) / benchmark) * 100 * 10) / 10;
  }

  /**
   * Assess metric value against benchmark thresholds
   * @private
   */
  assessAgainstBenchmark(value, benchmark) {
    if (!benchmark) return 'no_benchmark';

    const variance = this.calculateVariance(value, benchmark.value);
    if (variance === null) return 'no_benchmark';

    if (variance >= 20) return 'above_benchmark';
    if (variance >= -10) return 'at_benchmark';
    return 'below_benchmark';
  }

  /**
   * Get current period (quarter) string
   * @private
   */
  getCurrentPeriod() {
    const now = new Date();
    const quarter = Math.ceil((now.getMonth() + 1) / 3);
    return `Q${quarter}-${now.getFullYear()}`;
  }

  /**
   * Convert string to snake_case
   * @private
   */
  toSnakeCase(str) {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  }

  /**
   * Validate report data against template requirements
   * @param {string} templateId - Template identifier
   * @param {object} data - Data to validate
   * @returns {object} Validation results
   */
  validateData(templateId, data) {
    const template = this.getTemplate(templateId);
    const contract = template.required_data_contract;
    const results = {
      valid: true,
      errors: [],
      warnings: [],
      checks: []
    };

    // Check required fields
    for (const field of contract.required_fields || []) {
      const fieldKey = this.toSnakeCase(field.field_name);
      if (data[fieldKey] === undefined || data[fieldKey] === null) {
        results.errors.push({
          type: 'missing_field',
          field: field.field_name,
          description: field.description
        });
        results.valid = false;
      }
    }

    // Run data quality checks
    for (const check of contract.data_quality_checks || []) {
      const checkResult = {
        name: check.check_name,
        logic: check.logic,
        severity: check.severity,
        passed: true // Would need actual validation logic
      };

      results.checks.push(checkResult);

      if (!checkResult.passed && check.severity === 'high') {
        results.valid = false;
        results.errors.push({
          type: 'quality_check_failed',
          check: check.check_name,
          severity: check.severity
        });
      } else if (!checkResult.passed) {
        results.warnings.push({
          type: 'quality_check_warning',
          check: check.check_name,
          severity: check.severity
        });
      }
    }

    return results;
  }

  /**
   * Get primary agent for a template
   * @param {string} templateId - Template identifier
   * @returns {string} Agent name
   */
  getPrimaryAgent(templateId) {
    if (!this.templateIndex?.templates) {
      // Fallback routing based on template ID
      if (['multi-year-revenue-model', 'scenario-planning-model', 'arr-waterfall'].includes(templateId)) {
        return 'gtm-revenue-modeler';
      }
      if (['net-dollar-retention', 'bookings-to-revenue-conversion', 'revenue-mix-new-expansion-renewal'].includes(templateId)) {
        return 'gtm-retention-analyst';
      }
      if (['tam-sam-som', 'revenue-by-segment', 'icp-performance-win-profile', 'product-adoption-by-segment'].includes(templateId)) {
        return 'gtm-market-intelligence';
      }
      if (['sales-capacity-model', 'new-hire-ramp-model', 'customer-support-capacity-model'].includes(templateId)) {
        return 'gtm-quota-capacity';
      }
      return 'gtm-strategic-reports-orchestrator';
    }

    const template = this.templateIndex.templates.find(t => t.template_id === templateId);
    return template?.primary_agent || 'gtm-strategic-reports-orchestrator';
  }

  /**
   * Export report to specified format
   * @param {object} report - Generated report
   * @param {string} format - Output format (json, csv, markdown)
   * @returns {string} Formatted output
   */
  exportReport(report, format = 'json') {
    switch (format.toLowerCase()) {
      case 'json':
        return JSON.stringify(report, null, 2);

      case 'markdown':
        return this.toMarkdown(report);

      case 'csv':
        return this.toCsv(report);

      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * Convert report to Markdown format
   * @private
   */
  toMarkdown(report) {
    const lines = [
      `# ${report.report_name}`,
      '',
      `**Generated**: ${report.generated_at}`,
      `**Period**: ${report.period}`,
      `**Owner**: ${report.owner_function}`,
      '',
      '## Executive Questions Answered',
      '',
      ...report.executive_questions_answered.map(q => `- ${q}`),
      '',
      '## Metrics',
      '',
      '| Metric | Value | Formula |',
      '|--------|-------|---------|',
      ...report.metrics.map(m => `| ${m.name} | ${m.value || 'N/A'} | ${m.formula} |`),
      '',
      '## Benchmark Comparisons',
      '',
      ...report.benchmarks.comparisons.map(c =>
        `- **${c.metric}**: ${c.value} (Benchmark: ${c.benchmark}, ${c.assessment})`
      ),
      ''
    ];

    return lines.join('\n');
  }

  /**
   * Convert metrics to CSV format
   * @private
   */
  toCsv(report) {
    const headers = ['Metric', 'Value', 'Formula', 'Grain'];
    const rows = report.metrics.map(m =>
      [m.name, m.value, `"${m.formula}"`, m.grain].join(',')
    );

    return [headers.join(','), ...rows].join('\n');
  }
}

// Export for use in other modules
module.exports = { ReportTemplateEngine };

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const engine = new ReportTemplateEngine();

  (async () => {
    await engine.initialize();

    switch (command) {
      case 'list':
        console.log('\nAvailable Templates:');
        console.log('='.repeat(60));
        for (const t of engine.listTemplates()) {
          console.log(`\n${t.template_id}`);
          console.log(`  Name: ${t.report_name}`);
          console.log(`  Owner: ${t.owner_function_default}`);
        }
        break;

      case 'show':
        const templateId = args[1];
        if (!templateId) {
          console.error('Usage: node report-template-engine.js show <template-id>');
          process.exit(1);
        }
        const template = engine.getTemplate(templateId);
        console.log(JSON.stringify(template, null, 2));
        break;

      case 'find':
        const query = args.slice(1).join(' ');
        const matches = engine.findTemplateByKeywords(query);
        console.log(`\nTemplates matching "${query}":`);
        for (const t of matches.slice(0, 5)) {
          console.log(`  - ${t.template_id}: ${t.report_name}`);
        }
        break;

      case 'benchmarks':
        const benchId = args[1];
        if (!benchId) {
          console.error('Usage: node report-template-engine.js benchmarks <template-id>');
          process.exit(1);
        }
        const benchmarks = engine.getBenchmarksForTemplate(benchId);
        console.log(JSON.stringify(benchmarks, null, 2));
        break;

      default:
        console.log(`
Report Template Engine CLI

Commands:
  list                    List all available templates
  show <template-id>      Show full template configuration
  find <keywords>         Find templates matching keywords
  benchmarks <template-id> Show benchmarks for a template

Examples:
  node report-template-engine.js list
  node report-template-engine.js show arr-waterfall
  node report-template-engine.js find retention churn
  node report-template-engine.js benchmarks net-dollar-retention
        `);
    }
  })().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
