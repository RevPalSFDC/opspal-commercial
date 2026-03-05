#!/usr/bin/env node
/**
 * Project Intake Validator
 *
 * Validates intake form data for:
 * - Schema compliance (required fields, types)
 * - Consistency checks (timeline, budget vs scope)
 * - Circular dependency detection
 * - Completeness analysis with gap identification
 * - Assumption validation markers
 *
 * Usage:
 *   node intake-validator.js ./intake-data.json
 *   node intake-validator.js ./intake-data.json --verbose
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

const { intakeSchema, enums } = require('./intake-schema');

class IntakeValidator {
  constructor(options = {}) {
    this.schema = intakeSchema;
    this.options = {
      verbose: options.verbose || false,
      strictMode: options.strictMode || false,
      ...options
    };
    this.errors = [];
    this.warnings = [];
  }

  /**
   * Full validation pipeline
   * @param {Object} data - Intake form data
   * @returns {Object} Validation result
   */
  validate(data) {
    this.errors = [];
    this.warnings = [];

    if (!data || typeof data !== 'object') {
      this.errors.push({
        type: 'invalid_data',
        field: 'root',
        message: 'Input must be a valid object'
      });
      return this.getResult(data);
    }

    // Run validation pipeline
    this.validateRequiredSections(data);
    this.validateRequiredFields(data);
    this.validateFieldTypes(data);
    this.checkConsistency(data);
    this.detectCircularDependencies(data);
    this.analyzeCompleteness(data);
    this.validateAssumptions(data);
    this.checkContradictions(data);

    return this.getResult(data);
  }

  /**
   * Get validation result
   */
  getResult(data) {
    const completenessScore = this.calculateCompleteness(data);

    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
      completenessScore,
      readyForHandoff: this.errors.length === 0 && this.warnings.filter(w => w.severity === 'high').length === 0,
      summary: {
        errorCount: this.errors.length,
        warningCount: this.warnings.length,
        completeness: completenessScore,
        sectionsComplete: this.getSectionsComplete(data),
        criticalGaps: this.getCriticalGaps()
      }
    };
  }

  /**
   * Validate required sections exist
   */
  validateRequiredSections(data) {
    const requiredSections = this.schema.required || [];

    for (const section of requiredSections) {
      if (!data[section]) {
        this.errors.push({
          type: 'missing_section',
          field: section,
          message: `Required section "${this.formatLabel(section)}" is missing`,
          severity: 'critical'
        });
      }
    }
  }

  /**
   * Validate required fields within sections
   */
  validateRequiredFields(data) {
    const requiredFields = {
      projectIdentity: ['projectName', 'projectType', 'projectOwner'],
      goalsObjectives: ['businessObjective', 'successMetrics'],
      scope: ['inScope'],
      timelineBudget: ['targetStartDate', 'targetEndDate']
    };

    for (const [section, fields] of Object.entries(requiredFields)) {
      if (!data[section]) continue;

      for (const field of fields) {
        const value = this.getNestedValue(data[section], field);

        if (value === undefined || value === null || value === '') {
          this.errors.push({
            type: 'missing_field',
            field: `${section}.${field}`,
            message: `Required field "${this.formatLabel(field)}" is missing in ${this.formatLabel(section)}`,
            severity: 'critical'
          });
        } else if (Array.isArray(value) && value.length === 0) {
          this.errors.push({
            type: 'empty_array',
            field: `${section}.${field}`,
            message: `"${this.formatLabel(field)}" must have at least one entry`,
            severity: 'critical'
          });
        }
      }
    }

    // Check projectOwner subfields
    if (data.projectIdentity?.projectOwner) {
      const owner = data.projectIdentity.projectOwner;
      if (!owner.name) {
        this.errors.push({
          type: 'missing_field',
          field: 'projectIdentity.projectOwner.name',
          message: 'Project owner name is required',
          severity: 'critical'
        });
      }
      if (!owner.email) {
        this.errors.push({
          type: 'missing_field',
          field: 'projectIdentity.projectOwner.email',
          message: 'Project owner email is required',
          severity: 'critical'
        });
      }
    }

    // Check at least one success metric has a name
    if (data.goalsObjectives?.successMetrics) {
      const hasValidMetric = data.goalsObjectives.successMetrics.some(m => m && m.metric);
      if (!hasValidMetric) {
        this.errors.push({
          type: 'invalid_field',
          field: 'goalsObjectives.successMetrics',
          message: 'At least one success metric with a name is required',
          severity: 'critical'
        });
      }
    }

    // Check at least one scope item has a feature name
    if (data.scope?.inScope) {
      const hasValidScope = data.scope.inScope.some(s => s && s.feature);
      if (!hasValidScope) {
        this.errors.push({
          type: 'invalid_field',
          field: 'scope.inScope',
          message: 'At least one scope item with a feature name is required',
          severity: 'critical'
        });
      }
    }
  }

  /**
   * Validate field types and formats
   */
  validateFieldTypes(data) {
    // Email validation
    const emailFields = [
      'projectIdentity.projectOwner.email'
    ];

    for (const fieldPath of emailFields) {
      const value = this.getNestedValue(data, fieldPath);
      if (value && !this.isValidEmail(value)) {
        this.errors.push({
          type: 'invalid_format',
          field: fieldPath,
          message: `Invalid email format: "${value}"`,
          severity: 'high'
        });
      }
    }

    // Date validation
    const dateFields = [
      'timelineBudget.targetStartDate',
      'timelineBudget.targetEndDate'
    ];

    for (const fieldPath of dateFields) {
      const value = this.getNestedValue(data, fieldPath);
      if (value && !this.isValidDate(value)) {
        this.errors.push({
          type: 'invalid_format',
          field: fieldPath,
          message: `Invalid date format: "${value}" (expected YYYY-MM-DD)`,
          severity: 'high'
        });
      }
    }

    // Enum validation
    if (data.projectIdentity?.projectType) {
      if (!enums.PROJECT_TYPES.includes(data.projectIdentity.projectType)) {
        this.warnings.push({
          type: 'invalid_enum',
          field: 'projectIdentity.projectType',
          message: `Unknown project type: "${data.projectIdentity.projectType}"`,
          severity: 'low'
        });
      }
    }
  }

  /**
   * Check consistency between fields
   */
  checkConsistency(data) {
    // Timeline consistency
    if (data.timelineBudget) {
      const { targetStartDate, targetEndDate, milestones, hardDeadline, deadlineReason } = data.timelineBudget;

      // Start before end
      if (targetStartDate && targetEndDate) {
        const start = new Date(targetStartDate);
        const end = new Date(targetEndDate);

        if (start >= end) {
          this.errors.push({
            type: 'consistency',
            field: 'timelineBudget',
            message: 'Start date must be before end date',
            severity: 'critical',
            details: { startDate: targetStartDate, endDate: targetEndDate }
          });
        }

        // Check if timeline is in the past
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (start < today) {
          this.warnings.push({
            type: 'consistency',
            field: 'timelineBudget.targetStartDate',
            message: 'Start date is in the past',
            severity: 'medium'
          });
        }

        // Check milestone dates are within range
        if (milestones && milestones.length > 0) {
          for (const milestone of milestones) {
            if (milestone.targetDate) {
              const milestoneDate = new Date(milestone.targetDate);
              if (milestoneDate < start || milestoneDate > end) {
                this.warnings.push({
                  type: 'consistency',
                  field: 'timelineBudget.milestones',
                  message: `Milestone "${milestone.name || 'Unnamed'}" (${milestone.targetDate}) is outside project timeline`,
                  severity: 'medium',
                  details: { milestone: milestone.name, date: milestone.targetDate }
                });
              }
            }
          }
        }

        // Calculate project duration
        const durationDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

        // Warn about very short or very long timelines
        if (durationDays < 7) {
          this.warnings.push({
            type: 'consistency',
            field: 'timelineBudget',
            message: `Very short timeline (${durationDays} days) - ensure this is realistic`,
            severity: 'medium'
          });
        } else if (durationDays > 365) {
          this.warnings.push({
            type: 'consistency',
            field: 'timelineBudget',
            message: `Very long timeline (${durationDays} days / ${Math.round(durationDays / 30)} months) - consider phasing`,
            severity: 'low'
          });
        }
      }

      // Hard deadline requires reason
      if (hardDeadline && !deadlineReason) {
        this.errors.push({
          type: 'consistency',
          field: 'timelineBudget.deadlineReason',
          message: 'Hard deadline selected but no reason provided',
          severity: 'high'
        });
      }
    }

    // Budget vs scope consistency
    if (data.scope?.inScope && data.timelineBudget?.budgetRange) {
      const scopeItems = data.scope.inScope.length;
      const criticalItems = data.scope.inScope.filter(s => s.priority === 'critical').length;
      const budget = data.timelineBudget.budgetRange;

      // Heuristic: complex projects with low budget
      if (scopeItems > 10 && (budget === '<$5k' || budget === '$5k-$15k')) {
        this.warnings.push({
          type: 'consistency',
          field: 'timelineBudget.budgetRange',
          message: `Budget (${budget}) may be insufficient for ${scopeItems} scope items`,
          severity: 'medium',
          details: { scopeItems, budget }
        });
      }

      if (criticalItems > 5 && budget === '<$5k') {
        this.warnings.push({
          type: 'consistency',
          field: 'timelineBudget.budgetRange',
          message: `${criticalItems} critical items with budget under $5k may be unrealistic`,
          severity: 'high'
        });
      }
    }

    // Platform vs technical requirements
    if (data.technicalRequirements?.platforms) {
      const platforms = data.technicalRequirements.platforms;

      if (platforms.includes('salesforce') && !data.technicalRequirements?.salesforceOrg?.orgAlias) {
        this.warnings.push({
          type: 'consistency',
          field: 'technicalRequirements.salesforceOrg',
          message: 'Salesforce platform selected but no org alias provided',
          severity: 'medium'
        });
      }

      if (platforms.includes('hubspot') && !data.technicalRequirements?.hubspotPortal?.portalId) {
        this.warnings.push({
          type: 'consistency',
          field: 'technicalRequirements.hubspotPortal',
          message: 'HubSpot platform selected but no portal ID provided',
          severity: 'medium'
        });
      }
    }
  }

  /**
   * Detect circular dependencies using DFS
   */
  detectCircularDependencies(data) {
    if (!data.dependenciesRisks?.dependencies) return;

    const dependencies = data.dependenciesRisks.dependencies.filter(d => d && d.dependency);

    if (dependencies.length === 0) return;

    // Build adjacency list from blocksIfDelayed relationships
    const graph = new Map();
    const nodeNames = new Set();

    for (const dep of dependencies) {
      nodeNames.add(dep.dependency);
      if (dep.blocksIfDelayed) {
        nodeNames.add(dep.blocksIfDelayed);

        if (!graph.has(dep.dependency)) {
          graph.set(dep.dependency, []);
        }
        graph.get(dep.dependency).push(dep.blocksIfDelayed);
      }
    }

    // Also add scope items as potential nodes
    if (data.scope?.inScope) {
      data.scope.inScope.forEach(item => {
        if (item.feature) nodeNames.add(item.feature);
      });
    }

    // DFS cycle detection
    const visited = new Set();
    const recursionStack = new Set();

    const findCycle = (node, path = []) => {
      if (recursionStack.has(node)) {
        // Found cycle - return the cycle path
        const cycleStart = path.indexOf(node);
        return path.slice(cycleStart).concat(node);
      }

      if (visited.has(node)) return null;

      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      const neighbors = graph.get(node) || [];
      for (const neighbor of neighbors) {
        const cycle = findCycle(neighbor, [...path]);
        if (cycle) return cycle;
      }

      recursionStack.delete(node);
      return null;
    };

    // Check all nodes
    for (const node of graph.keys()) {
      if (!visited.has(node)) {
        const cycle = findCycle(node);
        if (cycle) {
          this.errors.push({
            type: 'circular_dependency',
            field: 'dependenciesRisks.dependencies',
            message: `Circular dependency detected: ${cycle.join(' → ')}`,
            severity: 'critical',
            details: { cycle }
          });
          break; // Report first cycle found
        }
      }
    }

    // Check for self-referential dependencies
    for (const dep of dependencies) {
      if (dep.dependency === dep.blocksIfDelayed) {
        this.errors.push({
          type: 'circular_dependency',
          field: 'dependenciesRisks.dependencies',
          message: `Self-referential dependency: "${dep.dependency}" blocks itself`,
          severity: 'critical'
        });
      }
    }
  }

  /**
   * Analyze completeness and identify gaps
   */
  analyzeCompleteness(data) {
    const gaps = [];

    // Check for vague scope descriptions
    if (data.scope?.inScope) {
      for (const item of data.scope.inScope) {
        if (item.feature && item.feature.length < 10) {
          gaps.push({
            field: 'scope.inScope',
            message: `Scope item "${item.feature}" needs more detail`,
            severity: 'low'
          });
        }
      }
    }

    // Check for unvalidated assumptions
    if (data.scope?.assumptions) {
      const unvalidated = data.scope.assumptions.filter(a => a && a.assumption && !a.validatedBy);
      if (unvalidated.length > 0) {
        this.warnings.push({
          type: 'completeness',
          field: 'scope.assumptions',
          message: `${unvalidated.length} assumption(s) not yet validated`,
          severity: 'medium',
          details: { unvalidated: unvalidated.map(a => a.assumption) }
        });
      }

      // Flag high-risk unvalidated assumptions
      const highRiskUnvalidated = unvalidated.filter(a => a.riskIfInvalid === 'high');
      if (highRiskUnvalidated.length > 0) {
        this.warnings.push({
          type: 'completeness',
          field: 'scope.assumptions',
          message: `${highRiskUnvalidated.length} HIGH-RISK assumption(s) not validated - these should be confirmed before proceeding`,
          severity: 'high',
          details: { assumptions: highRiskUnvalidated.map(a => a.assumption) }
        });
      }
    }

    // Check for success metrics without targets
    if (data.goalsObjectives?.successMetrics) {
      const missingTargets = data.goalsObjectives.successMetrics.filter(
        m => m && m.metric && (!m.targetValue || !m.currentValue)
      );
      if (missingTargets.length > 0) {
        this.warnings.push({
          type: 'completeness',
          field: 'goalsObjectives.successMetrics',
          message: `${missingTargets.length} success metric(s) missing current or target values`,
          severity: 'medium',
          details: { metrics: missingTargets.map(m => m.metric) }
        });
      }
    }

    // Check for high-impact risks without mitigation
    if (data.dependenciesRisks?.risks) {
      const unmitigated = data.dependenciesRisks.risks.filter(
        r => r && r.risk && r.impact === 'high' && !r.mitigation
      );
      if (unmitigated.length > 0) {
        this.warnings.push({
          type: 'completeness',
          field: 'dependenciesRisks.risks',
          message: `${unmitigated.length} high-impact risk(s) without mitigation plan`,
          severity: 'high',
          details: { risks: unmitigated.map(r => r.risk) }
        });
      }
    }

    // Check for pending dependencies
    if (data.dependenciesRisks?.dependencies) {
      const atRisk = data.dependenciesRisks.dependencies.filter(
        d => d && d.dependency && d.status === 'at-risk'
      );
      if (atRisk.length > 0) {
        this.warnings.push({
          type: 'completeness',
          field: 'dependenciesRisks.dependencies',
          message: `${atRisk.length} dependenc(ies) marked as at-risk`,
          severity: 'high',
          details: { dependencies: atRisk.map(d => d.dependency) }
        });
      }
    }

    // Check for missing communication plan
    if (!data.approvalSignoff?.communicationPlan?.preferredChannel) {
      this.warnings.push({
        type: 'completeness',
        field: 'approvalSignoff.communicationPlan',
        message: 'No communication channel specified',
        severity: 'low'
      });
    }

    // Add collected gaps as warnings
    gaps.forEach(gap => {
      this.warnings.push({
        type: 'completeness',
        ...gap
      });
    });
  }

  /**
   * Mark assumptions that require org validation
   */
  validateAssumptions(data) {
    if (!data.scope?.assumptions) return;

    const platformKeywords = {
      salesforce: ['salesforce', 'sf', 'apex', 'flow', 'object', 'field', 'cpq', 'quote'],
      hubspot: ['hubspot', 'hs', 'workflow', 'property', 'portal'],
      data: ['data', 'record', 'migration', 'api', 'integration']
    };

    for (const assumption of data.scope.assumptions) {
      if (!assumption || !assumption.assumption) continue;

      const text = assumption.assumption.toLowerCase();

      // Check if assumption mentions platforms
      for (const [platform, keywords] of Object.entries(platformKeywords)) {
        if (keywords.some(kw => text.includes(kw))) {
          assumption.requiresOrgValidation = true;
          assumption.validationPlatform = platform;

          if (!assumption.validatedBy) {
            this.warnings.push({
              type: 'assumption_validation',
              field: 'scope.assumptions',
              message: `Assumption "${assumption.assumption}" references ${platform} - should be validated against org`,
              severity: 'medium',
              details: { assumption: assumption.assumption, platform }
            });
          }
          break;
        }
      }
    }
  }

  /**
   * Check for contradictions between in-scope and out-of-scope
   */
  checkContradictions(data) {
    if (!data.scope?.inScope || !data.scope?.outOfScope) return;

    const inScopeFeatures = data.scope.inScope
      .filter(s => s && s.feature)
      .map(s => s.feature.toLowerCase());

    const outOfScope = Array.isArray(data.scope.outOfScope)
      ? data.scope.outOfScope.map(s => s.toLowerCase())
      : data.scope.outOfScope.split('\n').map(s => s.trim().toLowerCase()).filter(Boolean);

    // Check for overlapping terms
    for (const feature of inScopeFeatures) {
      for (const excluded of outOfScope) {
        // Check for significant word overlap
        const featureWords = feature.split(/\s+/).filter(w => w.length > 3);
        const excludedWords = excluded.split(/\s+/).filter(w => w.length > 3);

        const overlap = featureWords.filter(w => excludedWords.includes(w));

        if (overlap.length >= 2 || feature.includes(excluded) || excluded.includes(feature)) {
          this.warnings.push({
            type: 'contradiction',
            field: 'scope',
            message: `Potential contradiction: "${feature}" (in-scope) may conflict with "${excluded}" (out-of-scope)`,
            severity: 'medium',
            details: { inScope: feature, outOfScope: excluded, overlap }
          });
        }
      }
    }
  }

  /**
   * Calculate completeness score
   */
  calculateCompleteness(data) {
    if (!data) return 0;

    const weights = {
      // Required sections (higher weight)
      projectIdentity: { weight: 20, fields: ['projectName', 'projectType', 'projectOwner.name', 'projectOwner.email'] },
      goalsObjectives: { weight: 20, fields: ['businessObjective', 'successMetrics', 'expectedOutcome'] },
      scope: { weight: 15, fields: ['inScope', 'outOfScope', 'assumptions'] },
      timelineBudget: { weight: 15, fields: ['targetStartDate', 'targetEndDate', 'budgetRange'] },
      // Optional sections (lower weight)
      dataSources: { weight: 10, fields: ['primaryDataSources', 'integrations'] },
      dependenciesRisks: { weight: 10, fields: ['dependencies', 'risks'] },
      technicalRequirements: { weight: 5, fields: ['platforms', 'complexity'] },
      approvalSignoff: { weight: 5, fields: ['approvers', 'communicationPlan.preferredChannel'] }
    };

    let totalWeight = 0;
    let earnedWeight = 0;

    for (const [section, config] of Object.entries(weights)) {
      totalWeight += config.weight;

      if (!data[section]) continue;

      let filledCount = 0;
      for (const field of config.fields) {
        const value = this.getNestedValue(data[section], field);
        if (this.hasValue(value)) {
          filledCount++;
        }
      }

      const sectionCompletion = filledCount / config.fields.length;
      earnedWeight += config.weight * sectionCompletion;
    }

    return Math.round((earnedWeight / totalWeight) * 100);
  }

  /**
   * Get sections completion status
   */
  getSectionsComplete(data) {
    const sections = {};
    const requiredFields = {
      projectIdentity: ['projectName', 'projectType', 'projectOwner.name', 'projectOwner.email'],
      goalsObjectives: ['businessObjective', 'successMetrics'],
      scope: ['inScope'],
      timelineBudget: ['targetStartDate', 'targetEndDate'],
      dataSources: [],
      dependenciesRisks: [],
      technicalRequirements: [],
      approvalSignoff: []
    };

    for (const [section, fields] of Object.entries(requiredFields)) {
      if (!data || !data[section]) {
        sections[section] = fields.length > 0 ? 'missing' : 'optional';
        continue;
      }

      if (fields.length === 0) {
        // Optional section - check if any content
        const hasContent = Object.values(data[section]).some(v => this.hasValue(v));
        sections[section] = hasContent ? 'partial' : 'optional';
        continue;
      }

      let filled = 0;
      for (const field of fields) {
        const value = this.getNestedValue(data[section], field);
        if (this.hasValue(value)) filled++;
      }

      if (filled === fields.length) {
        sections[section] = 'complete';
      } else if (filled > 0) {
        sections[section] = 'partial';
      } else {
        sections[section] = 'incomplete';
      }
    }

    return sections;
  }

  /**
   * Get critical gaps from warnings
   */
  getCriticalGaps() {
    return this.warnings
      .filter(w => w.severity === 'high')
      .map(w => w.message);
  }

  // Utility methods
  getNestedValue(obj, path) {
    if (!obj) return undefined;
    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (current === undefined || current === null) return undefined;
      current = current[part];
    }

    return current;
  }

  hasValue(value) {
    if (value === undefined || value === null || value === '') return false;
    if (Array.isArray(value)) return value.length > 0 && value.some(v => this.hasValue(v));
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return true;
  }

  isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  isValidDate(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const d = new Date(date);
    return !isNaN(d.getTime());
  }

  formatLabel(str) {
    return str
      .replace(/([A-Z])/g, ' $1')
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase())
      .trim();
  }
}

// CLI handling
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
Project Intake Validator

Usage:
  node intake-validator.js <input-file.json> [options]

Options:
  --verbose, -v      Show detailed output
  --strict           Enable strict validation mode
  --json             Output results as JSON
  --help, -h         Show this help

Examples:
  node intake-validator.js ./intake-data.json
  node intake-validator.js ./intake-data.json --verbose
  node intake-validator.js ./intake-data.json --json > results.json
`);
    process.exit(0);
  }

  const inputPath = args[0];
  const options = {
    verbose: args.includes('--verbose') || args.includes('-v'),
    strictMode: args.includes('--strict'),
    jsonOutput: args.includes('--json')
  };

  // Load input file
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: File not found: ${inputPath}`);
    process.exit(1);
  }

  let data;
  try {
    const content = fs.readFileSync(inputPath, 'utf-8');
    data = JSON.parse(content);
  } catch (e) {
    console.error(`Error: Invalid JSON in ${inputPath}: ${e.message}`);
    process.exit(1);
  }

  // Validate
  const validator = new IntakeValidator(options);
  const result = validator.validate(data);

  // Output results
  if (options.jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('\n=== Project Intake Validation Results ===\n');

    // Summary
    console.log(`Status: ${result.valid ? '✅ VALID' : '❌ INVALID'}`);
    console.log(`Completeness: ${result.completenessScore}%`);
    console.log(`Ready for Handoff: ${result.readyForHandoff ? 'Yes' : 'No'}`);
    console.log('');

    // Sections
    console.log('Section Status:');
    for (const [section, status] of Object.entries(result.summary.sectionsComplete)) {
      const icon = status === 'complete' ? '✅' :
                   status === 'partial' ? '🟡' :
                   status === 'optional' ? '⚪' :
                   status === 'missing' ? '❌' : '🔴';
      console.log(`  ${icon} ${validator.formatLabel(section)}: ${status}`);
    }
    console.log('');

    // Errors
    if (result.errors.length > 0) {
      console.log(`Errors (${result.errors.length}):`);
      result.errors.forEach((err, i) => {
        console.log(`  ${i + 1}. [${err.type.toUpperCase()}] ${err.message}`);
        if (options.verbose && err.details) {
          console.log(`     Details: ${JSON.stringify(err.details)}`);
        }
      });
      console.log('');
    }

    // Warnings
    if (result.warnings.length > 0) {
      console.log(`Warnings (${result.warnings.length}):`);
      result.warnings.forEach((warn, i) => {
        const severityIcon = warn.severity === 'high' ? '🔴' :
                            warn.severity === 'medium' ? '🟡' : '⚪';
        console.log(`  ${severityIcon} ${warn.message}`);
        if (options.verbose && warn.details) {
          console.log(`     Details: ${JSON.stringify(warn.details)}`);
        }
      });
      console.log('');
    }

    // Critical gaps
    if (result.summary.criticalGaps.length > 0) {
      console.log('Critical Gaps to Address:');
      result.summary.criticalGaps.forEach((gap, i) => {
        console.log(`  ${i + 1}. ${gap}`);
      });
      console.log('');
    }

    // Next steps
    if (!result.valid) {
      console.log('Next Steps:');
      console.log('  1. Fix all errors listed above');
      console.log('  2. Re-run validation');
      console.log('  3. Address high-severity warnings before handoff');
    } else if (!result.readyForHandoff) {
      console.log('Next Steps:');
      console.log('  1. Address critical gaps listed above');
      console.log('  2. Re-run validation');
    } else {
      console.log('✅ Intake is ready for handoff!');
      console.log('   Run: /intake --form-data ' + inputPath);
    }
  }

  // Exit with appropriate code
  process.exit(result.valid ? 0 : 1);
}

// Export for use as module
module.exports = { IntakeValidator };

// Run if called directly
if (require.main === module) {
  main();
}
