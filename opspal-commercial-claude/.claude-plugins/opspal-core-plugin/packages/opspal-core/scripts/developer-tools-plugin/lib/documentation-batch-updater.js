#!/usr/bin/env node

/**
 * Documentation Batch Updater
 * Updates multiple documentation files to meet quality standards
 *
 * Part of: Documentation Clarity Update
 * ROI: $2,400/year | Effort: 8 hours | Payback: 8 weeks
 */

const fs = require('fs');
const path = require('path');
const DocumentationValidator = require('./documentation-validator');

/**
 * Documentation Batch Updater
 * Scans and updates documentation files for quality
 */
class DocumentationBatchUpdater {
  constructor(options = {}) {
    this.options = {
      dryRun: options.dryRun || false,
      verbose: options.verbose || false,
      minScore: options.minScore || 70
    };

    this.validator = new DocumentationValidator({ minClarityScore: this.options.minScore });
    this.results = [];
  }

  /**
   * Scan a directory for documentation files
   * @param {string} dir - Directory to scan
   * @param {string} type - 'command' or 'agent'
   * @returns {Array<string>} File paths
   */
  scanDirectory(dir, type) {
    const files = [];

    if (!fs.existsSync(dir)) {
      console.warn(`Directory does not exist: ${dir}`);
      return files;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    entries.forEach(entry => {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Recursively scan subdirectories
        files.push(...this.scanDirectory(fullPath, type));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    });

    return files;
  }

  /**
   * Validate all files in a directory
   * @param {string} dir - Directory to validate
   * @param {string} type - 'command' or 'agent'
   * @returns {object} Validation results
   */
  validateDirectory(dir, type) {
    const files = this.scanDirectory(dir, type);

    if (files.length === 0) {
      return { files: [], passed: 0, failed: 0, averageScore: 0 };
    }

    const results = files.map(filePath => {
      if (type === 'command') {
        return this.validator.validateCommandDoc(filePath);
      } else if (type === 'agent') {
        return this.validator.validateAgentDoc(filePath);
      }
    });

    const passed = results.filter(r => r.valid).length;
    const failed = results.filter(r => !r.valid).length;
    const averageScore = Math.round(
      results.reduce((sum, r) => sum + r.clarityScore, 0) / results.length
    );

    return {
      files,
      results,
      passed,
      failed,
      averageScore
    };
  }

  /**
   * Generate improvement suggestions for a file
   * @param {object} validationResult - Validation result from validator
   * @returns {Array<string>} Suggestions
   */
  generateSuggestions(validationResult) {
    const suggestions = [];

    // Generate suggestions based on issues
    validationResult.issues.forEach(issue => {
      if (issue.includes('Missing required section')) {
        const section = issue.match(/## (.+)$/)[1];
        suggestions.push({
          type: 'add_section',
          section,
          template: this._getSectionTemplate(section)
        });
      }

      if (issue.includes('Missing required frontmatter field')) {
        const field = issue.match(/field: (.+)$/)[1];
        suggestions.push({
          type: 'add_frontmatter',
          field,
          example: this._getFrontmatterExample(field)
        });
      }
    });

    // Generate suggestions based on warnings
    validationResult.warnings.forEach(warning => {
      if (warning.includes('No code examples')) {
        suggestions.push({
          type: 'add_example',
          template: this._getExampleTemplate()
        });
      }

      if (warning.includes('No expected output examples')) {
        suggestions.push({
          type: 'add_expected_output',
          template: this._getExpectedOutputTemplate()
        });
      }

      if (warning.includes('No decision guidance')) {
        suggestions.push({
          type: 'add_decision_tree',
          template: this._getDecisionTreeTemplate()
        });
      }

      if (warning.includes('Prerequisites should clearly separate')) {
        suggestions.push({
          type: 'improve_prerequisites',
          template: this._getPrerequisitesTemplate()
        });
      }
    });

    return suggestions;
  }

  /**
   * Apply improvements to a file
   * @param {string} filePath - Path to file
   * @param {Array} suggestions - Improvement suggestions
   * @returns {boolean} Success status
   */
  applyImprovements(filePath, suggestions) {
    if (this.options.dryRun) {
      console.log(`[DRY RUN] Would apply ${suggestions.length} improvements to ${filePath}`);
      return true;
    }

    let content = fs.readFileSync(filePath, 'utf-8');
    let modified = false;

    suggestions.forEach(suggestion => {
      switch (suggestion.type) {
        case 'add_section':
          content = this._addSection(content, suggestion.section, suggestion.template);
          modified = true;
          break;

        case 'add_frontmatter':
          content = this._addFrontmatterField(content, suggestion.field, suggestion.example);
          modified = true;
          break;

        case 'add_example':
          content = this._addExampleSection(content, suggestion.template);
          modified = true;
          break;

        case 'add_expected_output':
          content = this._addExpectedOutputSection(content, suggestion.template);
          modified = true;
          break;

        case 'add_decision_tree':
          content = this._addDecisionTreeSection(content, suggestion.template);
          modified = true;
          break;

        case 'improve_prerequisites':
          content = this._improvePrerequisites(content, suggestion.template);
          modified = true;
          break;
      }
    });

    if (modified) {
      fs.writeFileSync(filePath, content);
      return true;
    }

    return false;
  }

  /**
   * Process all files in a directory
   * @param {string} dir - Directory to process
   * @param {string} type - 'command' or 'agent'
   * @returns {object} Processing results
   */
  processDirectory(dir, type) {
    const validationResults = this.validateDirectory(dir, type);

    const improvements = validationResults.results.map(result => {
      const suggestions = this.generateSuggestions(result);
      const applied = suggestions.length > 0 ? this.applyImprovements(result.filePath, suggestions) : false;

      return {
        filePath: result.filePath,
        clarityScore: result.clarityScore,
        suggestions: suggestions.length,
        applied
      };
    });

    return {
      validation: validationResults,
      improvements,
      summary: {
        totalFiles: validationResults.files.length,
        filesImproved: improvements.filter(i => i.applied).length,
        averageScoreBefore: validationResults.averageScore,
        suggestionsMade: improvements.reduce((sum, i) => sum + i.suggestions, 0)
      }
    };
  }

  /**
   * Helper: Add section to content
   */
  _addSection(content, sectionName, template) {
    // Append section at the end before any final notes
    const insertPoint = content.lastIndexOf('## Notes') !== -1
      ? content.lastIndexOf('## Notes')
      : content.length;

    const newSection = `\n\n## ${sectionName}\n\n${template}\n`;
    return content.slice(0, insertPoint) + newSection + content.slice(insertPoint);
  }

  /**
   * Helper: Add frontmatter field
   */
  _addFrontmatterField(content, field, example) {
    const frontmatterEnd = content.indexOf('---', 3);
    if (frontmatterEnd === -1) return content;

    const newField = `${field}: ${example}\n`;
    return content.slice(0, frontmatterEnd) + newField + content.slice(frontmatterEnd);
  }

  /**
   * Helper: Add example section
   */
  _addExampleSection(content, template) {
    return this._addSection(content, 'Examples', template);
  }

  /**
   * Helper: Add expected output section
   */
  _addExpectedOutputSection(content, template) {
    return this._addSection(content, 'Expected Output', template);
  }

  /**
   * Helper: Add decision tree section
   */
  _addDecisionTreeSection(content, template) {
    return this._addSection(content, 'Decision Tree', template);
  }

  /**
   * Helper: Improve prerequisites section
   */
  _improvePrerequisites(content, template) {
    const prereqRegex = /## Prerequisites\n([\s\S]+?)(?=\n## )/;
    const match = content.match(prereqRegex);

    if (!match) {
      return this._addSection(content, 'Prerequisites', template);
    }

    // Replace existing prerequisites with improved version
    return content.replace(prereqRegex, `## Prerequisites\n\n${template}\n`);
  }

  /**
   * Get section template
   */
  _getSectionTemplate(sectionName) {
    const templates = {
      'Purpose': '[Describe what this command/agent does and when to use it]',
      'Usage': '```bash\n/command-name\n```\n\n[Explain what happens when run]',
      'Prerequisites': this._getPrerequisitesTemplate(),
      'Examples': this._getExampleTemplate(),
      'Expected Output': this._getExpectedOutputTemplate(),
      'Troubleshooting': '### Issue: [Common problem]\n**Symptoms**: [What user sees]\n\n**Solution**:\n```bash\n[Fix command]\n```',
      'Decision Tree': this._getDecisionTreeTemplate()
    };

    return templates[sectionName] || `[Add content for ${sectionName}]`;
  }

  /**
   * Get prerequisites template
   */
  _getPrerequisitesTemplate() {
    return `### Configuration (Optional)
**These improve functionality but are NOT required for basic operation**:

- **\`VARIABLE_NAME\`** - Description of what it enables
  - Default: None
  - Impact if not set: [What functionality is unavailable]

### Execution Required
**These are MANDATORY before running the command**:

- **✅ Required Thing** - Description
  - Verify: \`command to check\`
  - Fix: \`command to fix\``;
  }

  /**
   * Get example template
   */
  _getExampleTemplate() {
    return `### Example 1: [Scenario Name]

**Scenario**: [Description of the situation]

**Command**:
\`\`\`bash
/command-name
\`\`\`

**Expected Output**:
\`\`\`
[Exact output user should see]
\`\`\`

**What this means**: [Explanation of the result]`;
  }

  /**
   * Get expected output template
   */
  _getExpectedOutputTemplate() {
    return `### Success
\`\`\`
[Full success output example]
\`\`\`

**Indicators of success**:
- ✅ [Specific thing to look for]
- ✅ [Another indicator]

### Failure
\`\`\`
[Error message example]
\`\`\`

**Common causes**:
1. [First common cause]
   - How to fix: [Solution]`;
  }

  /**
   * Get decision tree template
   */
  _getDecisionTreeTemplate() {
    return `\`\`\`
Start Here
  ↓
[Key question]?
  ├─ YES → [Next decision or action]
  │
  └─ NO → [Alternative action]
\`\`\`

**Key Decision Factors**:
- ✅ **USE** when: [Scenario]
- ❌ **SKIP** when: [Scenario]`;
  }

  /**
   * Get frontmatter example
   */
  _getFrontmatterExample(field) {
    const examples = {
      'name': 'command-name',
      'description': 'Brief description of what this does',
      'tools': 'Read, Write, Bash'
    };

    return examples[field] || '[value]';
  }

  /**
   * Generate summary report
   */
  generateReport(results) {
    const lines = [];
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('Documentation Quality Report');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');
    lines.push(`Total Files: ${results.summary.totalFiles}`);
    lines.push(`Files Improved: ${results.summary.filesImproved}`);
    lines.push(`Suggestions Made: ${results.summary.suggestionsMade}`);
    lines.push(`Average Score Before: ${results.summary.averageScoreBefore}/100`);
    lines.push('');
    lines.push('Files:');

    results.improvements.forEach(improvement => {
      const status = improvement.applied ? '✅' : (improvement.suggestions > 0 ? '⚠️ ' : '  ');
      lines.push(`  ${status} ${path.basename(improvement.filePath)} (${improvement.clarityScore}/100, ${improvement.suggestions} suggestions)`);
    });

    lines.push('');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    return lines.join('\n');
  }
}

module.exports = DocumentationBatchUpdater;

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log('Documentation Batch Updater');
    console.log('');
    console.log('Usage: documentation-batch-updater.js <dir> --type <command|agent> [options]');
    console.log('');
    console.log('Options:');
    console.log('  --type <command|agent>    Type of documentation');
    console.log('  --dry-run                 Show what would be changed without modifying files');
    console.log('  --min-score <number>      Minimum clarity score (default: 70)');
    console.log('  --verbose                 Show detailed progress');
    console.log('');
    console.log('Examples:');
    console.log('  # Validate and improve all commands');
    console.log('  node documentation-batch-updater.js .claude-plugins/plugin/commands --type command');
    console.log('');
    console.log('  # Dry run to see what would change');
    console.log('  node documentation-batch-updater.js .claude-plugins/plugin/commands --type command --dry-run');
    process.exit(0);
  }

  const dir = args[0];
  const type = args.includes('--type') ? args[args.indexOf('--type') + 1] : 'command';
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose');
  const minScore = args.includes('--min-score') ? parseInt(args[args.indexOf('--min-score') + 1]) : 70;

  const updater = new DocumentationBatchUpdater({ dryRun, verbose, minScore });

  console.log(`Processing ${type} documentation in: ${dir}`);
  console.log(dryRun ? '[DRY RUN MODE - No files will be modified]' : '');
  console.log('');

  const results = updater.processDirectory(dir, type);
  console.log(updater.generateReport(results));

  process.exit(0);
}
