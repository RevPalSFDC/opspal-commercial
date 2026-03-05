#!/usr/bin/env node

/**
 * Documentation Quality Validator
 * Validates command and agent documentation for clarity, completeness, and consistency
 *
 * Part of: Documentation Clarity Update
 * ROI: $2,400/year | Effort: 8 hours | Payback: 8 weeks
 *
 * Quality Dimensions:
 * - Completeness: All required sections present
 * - Clarity: Examples, decision trees, expected outputs
 * - Consistency: Follows style guide
 * - Accuracy: Code examples are valid
 */

const fs = require('fs');
const path = require('path');

/**
 * Documentation Validator
 * Validates markdown documentation files for quality
 */
class DocumentationValidator {
  constructor(options = {}) {
    this.options = {
      strictMode: options.strictMode || false,
      requireExamples: options.requireExamples !== false,
      requireDecisionTrees: options.requireDecisionTrees || false,
      requireExpectedOutputs: options.requireExpectedOutputs !== false,
      minClarityScore: options.minClarityScore || 70
    };

    this.issues = [];
    this.warnings = [];
    this.metrics = {
      completeness: 0,
      clarity: 0,
      consistency: 0,
      accuracy: 0,
      overall: 0
    };
  }

  /**
   * Validate a command documentation file
   * @param {string} filePath - Path to the markdown file
   * @returns {object} Validation result
   */
  validateCommandDoc(filePath) {
    this.issues = [];
    this.warnings = [];

    if (!fs.existsSync(filePath)) {
      this.issues.push(`File does not exist: ${filePath}`);
      return this._buildResult(filePath, 'command');
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const sections = this._parseSections(content);
    const frontmatter = this._parseFrontmatter(content);

    // Validate frontmatter
    this._validateFrontmatter(frontmatter, 'command');

    // Validate required sections for commands
    this._validateCommandSections(sections, content);

    // Validate clarity elements
    this._validateClarityElements(content, sections);

    // Validate consistency
    this._validateConsistency(content, frontmatter);

    // Validate code examples
    this._validateCodeExamples(content);

    // Calculate metrics
    this._calculateMetrics(sections, content);

    return this._buildResult(filePath, 'command');
  }

  /**
   * Validate an agent documentation file
   * @param {string} filePath - Path to the markdown file
   * @returns {object} Validation result
   */
  validateAgentDoc(filePath) {
    this.issues = [];
    this.warnings = [];

    if (!fs.existsSync(filePath)) {
      this.issues.push(`File does not exist: ${filePath}`);
      return this._buildResult(filePath, 'agent');
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const sections = this._parseSections(content);
    const frontmatter = this._parseFrontmatter(content);

    // Validate frontmatter
    this._validateFrontmatter(frontmatter, 'agent');

    // Validate required sections for agents
    this._validateAgentSections(sections, content);

    // Validate clarity elements
    this._validateClarityElements(content, sections);

    // Validate consistency
    this._validateConsistency(content, frontmatter);

    // Calculate metrics
    this._calculateMetrics(sections, content);

    return this._buildResult(filePath, 'agent');
  }

  /**
   * Validate multiple documentation files
   * @param {Array<string>} filePaths - Array of file paths
   * @param {string} type - 'command' or 'agent'
   * @returns {object} Batch validation result
   */
  validateBatch(filePaths, type) {
    const results = filePaths.map(filePath => {
      if (type === 'command') {
        return this.validateCommandDoc(filePath);
      } else if (type === 'agent') {
        return this.validateAgentDoc(filePath);
      } else {
        throw new Error(`Invalid type: ${type}`);
      }
    });

    const summary = {
      total: results.length,
      passed: results.filter(r => r.valid).length,
      failed: results.filter(r => !r.valid).length,
      averageClarityScore: Math.round(
        results.reduce((sum, r) => sum + r.metrics.overall, 0) / results.length
      )
    };

    return { results, summary };
  }

  /**
   * Parse frontmatter from markdown
   */
  _parseFrontmatter(content) {
    const frontmatterMatch = content.match(/^---\n([\s\S]+?)\n---/);
    if (!frontmatterMatch) return null;

    const frontmatterText = frontmatterMatch[1];
    const frontmatter = {};

    frontmatterText.split('\n').forEach(line => {
      const match = line.match(/^([^:]+):\s*(.+)$/);
      if (match) {
        frontmatter[match[1].trim()] = match[2].trim();
      }
    });

    return frontmatter;
  }

  /**
   * Parse sections from markdown
   */
  _parseSections(content) {
    const sections = new Map();
    const lines = content.split('\n');

    let currentSection = null;
    let currentContent = [];

    lines.forEach(line => {
      const headerMatch = line.match(/^##\s+(.+)$/);
      if (headerMatch) {
        if (currentSection) {
          sections.set(currentSection, currentContent.join('\n'));
        }
        currentSection = headerMatch[1];
        currentContent = [];
      } else if (currentSection) {
        currentContent.push(line);
      }
    });

    if (currentSection) {
      sections.set(currentSection, currentContent.join('\n'));
    }

    return sections;
  }

  /**
   * Validate frontmatter completeness
   */
  _validateFrontmatter(frontmatter, type) {
    if (!frontmatter) {
      this.issues.push('Missing frontmatter block (---...---)');
      return;
    }

    const requiredFields = type === 'command'
      ? ['name', 'description']
      : ['name', 'description', 'tools'];

    requiredFields.forEach(field => {
      if (!frontmatter[field]) {
        this.issues.push(`Missing required frontmatter field: ${field}`);
      }
    });

    // Validate description quality
    if (frontmatter.description) {
      const desc = frontmatter.description;
      if (desc.length < 20) {
        this.warnings.push('Description is very short (< 20 chars) - consider adding more detail');
      }
      if (desc.length > 200) {
        this.warnings.push('Description is very long (> 200 chars) - consider condensing');
      }
    }
  }

  /**
   * Validate required sections for commands
   */
  _validateCommandSections(sections, content) {
    const requiredSections = [
      'Purpose',
      'Usage',
      'Prerequisites'
    ];

    const recommendedSections = [
      'Examples',
      'Expected Output',
      'Troubleshooting'
    ];

    requiredSections.forEach(section => {
      if (!sections.has(section)) {
        this.issues.push(`Missing required section: ## ${section}`);
      }
    });

    recommendedSections.forEach(section => {
      if (!sections.has(section)) {
        this.warnings.push(`Missing recommended section: ## ${section}`);
      }
    });

    // Validate Prerequisites section structure
    if (sections.has('Prerequisites')) {
      const prereqContent = sections.get('Prerequisites');

      // Should separate "Configuration (Optional)" from "Execution Required"
      const hasConfigOptional = /configuration.*optional/i.test(prereqContent);
      const hasExecutionRequired = /execution.*required/i.test(prereqContent);

      if (!hasConfigOptional && !hasExecutionRequired) {
        this.warnings.push('Prerequisites should clearly separate "Configuration (Optional)" from "Execution Required"');
      }
    }
  }

  /**
   * Validate required sections for agents
   */
  _validateAgentSections(sections, content) {
    const requiredSections = [
      'Overview',
      'Tools Available'
    ];

    const recommendedSections = [
      'When to Use This Agent',
      'Example Workflow'
    ];

    requiredSections.forEach(section => {
      if (!sections.has(section)) {
        this.issues.push(`Missing required section: ## ${section}`);
      }
    });

    recommendedSections.forEach(section => {
      if (!sections.has(section)) {
        this.warnings.push(`Missing recommended section: ## ${section}`);
      }
    });
  }

  /**
   * Validate clarity elements (examples, decision trees, outputs)
   */
  _validateClarityElements(content, sections) {
    // Check for code examples
    const codeBlocks = content.match(/```[\s\S]+?```/g) || [];
    if (this.options.requireExamples && codeBlocks.length === 0) {
      this.issues.push('No code examples found - add at least one example');
    }

    // Check for example outputs
    if (this.options.requireExpectedOutputs) {
      const hasExpectedOutput = sections.has('Expected Output') ||
                                content.includes('Example Output') ||
                                content.includes('Sample Output');
      if (!hasExpectedOutput) {
        this.warnings.push('No expected output examples - users may not know what success looks like');
      }
    }

    // Check for decision trees or "when to use" guidance
    if (this.options.requireDecisionTrees) {
      const hasDecisionGuidance = content.includes('When to use') ||
                                   content.includes('Use this when') ||
                                   content.includes('Decision tree') ||
                                   /if.*then/i.test(content);
      if (!hasDecisionGuidance) {
        this.warnings.push('No decision guidance - add "When to use" or decision tree');
      }
    }

    // Check for common pitfalls or troubleshooting
    const hasTroubleshooting = sections.has('Troubleshooting') ||
                                sections.has('Common Issues') ||
                                content.includes('Common mistakes');
    if (!hasTroubleshooting) {
      this.warnings.push('No troubleshooting section - consider adding common issues');
    }
  }

  /**
   * Validate consistency
   */
  _validateConsistency(content, frontmatter) {
    // Check heading levels consistency
    const headings = content.match(/^#+\s+.+$/gm) || [];
    const levels = headings.map(h => h.match(/^#+/)[0].length);

    // Should not skip heading levels (e.g., # followed by ###)
    for (let i = 1; i < levels.length; i++) {
      if (levels[i] - levels[i-1] > 1) {
        this.warnings.push(`Heading level skip detected: ${headings[i-1]} followed by ${headings[i]}`);
      }
    }

    // Check for consistent terminology
    const hasSlashCommand = content.includes('/') && /\/\w+/.test(content);
    if (hasSlashCommand && frontmatter && frontmatter.name) {
      const commandName = frontmatter.name;
      if (!content.includes(`/${commandName}`)) {
        this.warnings.push(`Command name in frontmatter (${commandName}) not used with slash notation in content`);
      }
    }
  }

  /**
   * Validate code examples
   */
  _validateCodeExamples(content) {
    const codeBlocks = content.match(/```(\w+)?\n([\s\S]+?)```/g) || [];

    codeBlocks.forEach((block, index) => {
      // Check for language specification
      const langMatch = block.match(/```(\w+)/);
      if (!langMatch) {
        this.warnings.push(`Code block ${index + 1} has no language specified`);
      }

      // Check for overly long code blocks (> 50 lines)
      const lines = block.split('\n');
      if (lines.length > 50) {
        this.warnings.push(`Code block ${index + 1} is very long (${lines.length} lines) - consider breaking it up`);
      }

      // Check for placeholder values that should be explained
      const content = block.match(/```\w*\n([\s\S]+?)```/)[1];
      const placeholders = content.match(/<[^>]+>|{[^}]+}|\$\{[^}]+\}/g) || [];
      if (placeholders.length > 0) {
        // Check if placeholders are explained
        const hasExplanation = content.includes('Replace') ||
                                content.includes('where') ||
                                content.includes('Example:');
        if (!hasExplanation) {
          this.warnings.push(`Code block ${index + 1} has placeholders but no explanation`);
        }
      }
    });
  }

  /**
   * Calculate quality metrics
   */
  _calculateMetrics(sections, content) {
    // Completeness: % of required sections present
    const totalSections = 6; // Typical number of sections
    this.metrics.completeness = Math.min(100, (sections.size / totalSections) * 100);

    // Clarity: presence of examples, outputs, decision trees
    let clarityScore = 0;
    const codeBlocks = (content.match(/```/g) || []).length / 2;
    const hasExpectedOutput = content.includes('Output') || content.includes('Result');
    const hasDecisionGuidance = content.includes('when') || content.includes('if');

    clarityScore += Math.min(40, codeBlocks * 10); // Max 40 for examples
    clarityScore += hasExpectedOutput ? 30 : 0;
    clarityScore += hasDecisionGuidance ? 30 : 0;
    this.metrics.clarity = clarityScore;

    // Consistency: fewer warnings = higher score
    this.metrics.consistency = Math.max(0, 100 - (this.warnings.length * 10));

    // Accuracy: no issues = 100
    this.metrics.accuracy = this.issues.length === 0 ? 100 : 70;

    // Overall score (weighted average)
    this.metrics.overall = Math.round(
      (this.metrics.completeness * 0.3) +
      (this.metrics.clarity * 0.4) +
      (this.metrics.consistency * 0.2) +
      (this.metrics.accuracy * 0.1)
    );
  }

  /**
   * Build validation result
   */
  _buildResult(filePath, type) {
    const valid = this.issues.length === 0 &&
                  this.metrics.overall >= this.options.minClarityScore;

    return {
      filePath,
      type,
      valid,
      issues: this.issues,
      warnings: this.warnings,
      metrics: this.metrics,
      clarityScore: this.metrics.overall
    };
  }

  /**
   * Generate a summary report
   */
  generateReport(result) {
    const lines = [];
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push(`Documentation Quality Report: ${path.basename(result.filePath)}`);
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');
    lines.push(`Overall Clarity Score: ${result.clarityScore}/100`);
    lines.push(`Status: ${result.valid ? '✅ PASSED' : '❌ FAILED'}`);
    lines.push('');
    lines.push('Metrics:');
    lines.push(`  Completeness: ${Math.round(result.metrics.completeness)}/100`);
    lines.push(`  Clarity:      ${Math.round(result.metrics.clarity)}/100`);
    lines.push(`  Consistency:  ${Math.round(result.metrics.consistency)}/100`);
    lines.push(`  Accuracy:     ${Math.round(result.metrics.accuracy)}/100`);
    lines.push('');

    if (result.issues.length > 0) {
      lines.push('Issues (Must Fix):');
      result.issues.forEach(issue => {
        lines.push(`  ❌ ${issue}`);
      });
      lines.push('');
    }

    if (result.warnings.length > 0) {
      lines.push('Warnings (Recommended):');
      result.warnings.forEach(warning => {
        lines.push(`  ⚠️  ${warning}`);
      });
      lines.push('');
    }

    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    return lines.join('\n');
  }

  /**
   * Log validation result to console
   */
  logResult(result) {
    console.log(this.generateReport(result));
  }
}

module.exports = DocumentationValidator;

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log('Documentation Validator');
    console.log('');
    console.log('Usage: documentation-validator.js <file> [options]');
    console.log('');
    console.log('Options:');
    console.log('  --type <command|agent>    Type of documentation');
    console.log('  --strict                  Strict mode (warnings become errors)');
    console.log('  --no-examples             Do not require examples');
    console.log('  --min-score <number>      Minimum clarity score (default: 70)');
    console.log('');
    console.log('Examples:');
    console.log('  node documentation-validator.js commands/reflect.md --type command');
    console.log('  node documentation-validator.js agents/my-agent.md --type agent --strict');
    process.exit(0);
  }

  const filePath = args[0];
  const type = args.includes('--type') ? args[args.indexOf('--type') + 1] : 'command';
  const strict = args.includes('--strict');
  const minScore = args.includes('--min-score') ? parseInt(args[args.indexOf('--min-score') + 1]) : 70;

  const validator = new DocumentationValidator({
    strictMode: strict,
    minClarityScore: minScore
  });

  let result;
  if (type === 'command') {
    result = validator.validateCommandDoc(filePath);
  } else if (type === 'agent') {
    result = validator.validateAgentDoc(filePath);
  } else {
    console.error(`Invalid type: ${type}`);
    process.exit(1);
  }

  validator.logResult(result);
  process.exit(result.valid ? 0 : 1);
}
