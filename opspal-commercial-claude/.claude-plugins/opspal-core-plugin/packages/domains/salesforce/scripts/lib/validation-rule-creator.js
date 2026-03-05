#!/usr/bin/env node

/**
 * Validation Rule Creator
 *
 * Interactive wizard and CLI tool for creating validation rules from templates or custom formulas.
 *
 * Usage:
 *   node validation-rule-creator.js                    # Interactive mode
 *   node validation-rule-creator.js --template <id>    # Direct template application
 *   node validation-rule-creator.js --custom           # Custom formula
 *   node validation-rule-creator.js --list             # List templates
 *   node validation-rule-creator.js --search <keyword> # Search templates
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Template registry location
const TEMPLATE_REGISTRY_PATH = path.join(__dirname, '../../templates/validation-rules/template-registry.json');
const TEMPLATES_DIR = path.join(__dirname, '../../templates/validation-rules');

class ValidationRuleCreator {
  constructor() {
    this.registry = this.loadRegistry();
    this.complexityCalculator = require('./validation-rule-complexity-calculator');
  }

  /**
   * Load template registry
   */
  loadRegistry() {
    try {
      const registryContent = fs.readFileSync(TEMPLATE_REGISTRY_PATH, 'utf8');
      return JSON.parse(registryContent);
    } catch (error) {
      console.error(`Error loading template registry: ${error.message}`);
      process.exit(1);
    }
  }

  /**
   * List all available templates
   */
  listTemplates(options = {}) {
    console.log(`\nAvailable Validation Rule Templates (${this.registry.totalTemplates} total):\n`);

    const categories = this.registry.categories;
    let templateIndex = 1;

    categories.forEach(category => {
      console.log(`\n${category.name.toUpperCase()} (${category.templateCount} templates)`);

      const categoryTemplates = this.registry.templates.filter(t => t.category === category.id);

      categoryTemplates.forEach(template => {
        const stars = '⭐'.repeat(Math.round(template.popularityScore / 20));
        console.log(`  ${templateIndex}. ${template.name} ${stars}`);
        console.log(`     ${template.description}`);
        console.log(`     Complexity: ${template.complexity} | Uses: ${template.usageCount || 0}`);
        templateIndex++;
      });
    });

    console.log('\nUse --show <id> to view template details');
    console.log('Use --search <keyword> to search templates\n');
  }

  /**
   * Show template details
   */
  showTemplate(templateId) {
    const template = this.registry.templates.find(t => t.id === templateId);

    if (!template) {
      console.error(`Template not found: ${templateId}`);
      console.log('Use --list to see all available templates');
      process.exit(1);
    }

    // Load full template details
    const templatePath = path.join(TEMPLATES_DIR, template.file);
    const fullTemplate = JSON.parse(fs.readFileSync(templatePath, 'utf8'));

    console.log(`\nTemplate: ${template.id}`);
    console.log(`Name: ${fullTemplate.name}`);
    console.log(`Category: ${template.category}`);
    console.log(`Version: ${fullTemplate.version}`);
    console.log(`Complexity: ${template.complexity} (${this.getComplexityLabel(template.complexity)})`);

    const stars = '⭐'.repeat(Math.round(template.popularityScore / 20));
    console.log(`Popularity: ${stars} (${template.popularityScore}/100)`);
    console.log(`Uses: ${template.usageCount || 0} times`);

    console.log(`\nDescription:`);
    console.log(`  ${fullTemplate.description}`);

    console.log(`\nFormula:`);
    console.log(`  ${fullTemplate.formula.split('\n').join('\n  ')}`);

    console.log(`\nParameters:`);
    Object.entries(fullTemplate.placeholders).forEach(([key, value]) => {
      console.log(`  - ${key}: ${value.description}`);
    });

    if (fullTemplate.examples && fullTemplate.examples.length > 0) {
      console.log(`\nExamples:`);
      fullTemplate.examples.forEach((example, i) => {
        console.log(`  ${i + 1}. ${example.name}`);
        console.log(`     Object: ${example.object}`);
        console.log(`     Use: ${example.useCase}`);
      });
    }

    if (fullTemplate.bestPractices && fullTemplate.bestPractices.length > 0) {
      console.log(`\nBest Practices:`);
      fullTemplate.bestPractices.forEach((practice, i) => {
        console.log(`  - ${practice}`);
      });
    }

    if (fullTemplate.relatedTemplates && fullTemplate.relatedTemplates.length > 0) {
      console.log(`\nRelated Templates:`);
      fullTemplate.relatedTemplates.forEach(relatedId => {
        const related = this.registry.templates.find(t => t.id === relatedId);
        if (related) {
          console.log(`  - ${relatedId}: ${related.description}`);
        }
      });
    }

    console.log(`\nUse --template ${templateId} to apply this template\n`);
  }

  /**
   * Search templates by keyword
   */
  searchTemplates(keyword, categoryFilter = null) {
    console.log(`\nSearch Results for "${keyword}"${categoryFilter ? ` in category "${categoryFilter}"` : ''}:\n`);

    let matchingTemplates = this.registry.templates.filter(template => {
      const matchesKeyword =
        template.name.toLowerCase().includes(keyword.toLowerCase()) ||
        template.description.toLowerCase().includes(keyword.toLowerCase()) ||
        template.keywords.some(k => k.toLowerCase().includes(keyword.toLowerCase()));

      const matchesCategory = !categoryFilter || template.category === categoryFilter;

      return matchesKeyword && matchesCategory;
    });

    if (matchingTemplates.length === 0) {
      console.log('No templates found matching your search.\n');
      console.log('Try:\n');
      console.log('  - Different keywords');
      console.log('  - Broader search terms');
      console.log('  - --list to see all templates\n');
      return;
    }

    // Sort by popularity
    matchingTemplates.sort((a, b) => b.popularityScore - a.popularityScore);

    matchingTemplates.forEach((template, i) => {
      const stars = '⭐'.repeat(Math.round(template.popularityScore / 20));
      console.log(`${i + 1}. ${template.name} ${stars} (${template.popularityScore}/100)`);
      console.log(`   ${template.description}`);
      console.log(`   Complexity: ${template.complexity} | Uses: ${template.usageCount || 0}`);
      console.log('');
    });

    console.log('Use --show <id> to view details or --template <id> to apply\n');
  }

  /**
   * Apply template with parameters
   */
  applyTemplate(templateId, params, options = {}) {
    const template = this.registry.templates.find(t => t.id === templateId);

    if (!template) {
      console.error(`Template not found: ${templateId}`);
      process.exit(1);
    }

    // Load full template
    const templatePath = path.join(TEMPLATES_DIR, template.file);
    const fullTemplate = JSON.parse(fs.readFileSync(templatePath, 'utf8'));

    console.log(`\n✓ Template loaded: ${template.id}`);

    // Validate parameters
    const missingParams = [];
    Object.keys(fullTemplate.placeholders).forEach(placeholder => {
      if (!params[placeholder]) {
        missingParams.push(placeholder);
      }
    });

    if (missingParams.length > 0) {
      console.error(`\n✗ Missing required parameters: ${missingParams.join(', ')}`);
      console.log('\nRequired parameters:');
      missingParams.forEach(param => {
        const info = fullTemplate.placeholders[param];
        console.log(`  ${param}: ${info.description}`);
        console.log(`    Example: ${info.examples[0]}`);
      });
      process.exit(1);
    }

    console.log('✓ Parameters validated');

    // Substitute parameters in formula
    let formula = fullTemplate.formula;
    let errorMessage = fullTemplate.errorMessage;

    Object.entries(params).forEach(([key, value]) => {
      const placeholder = `[${key}]`;
      formula = formula.split(placeholder).join(value);
      errorMessage = errorMessage.split(placeholder).join(value);
    });

    console.log('✓ Formula generated:', formula.replace(/\n/g, ' '));

    // Calculate complexity
    const complexity = this.complexityCalculator.calculateFromFormula(formula);
    console.log(`✓ Complexity score: ${complexity.score} (${this.getComplexityLabel(complexity.score)})`);

    if (complexity.score > 60) {
      console.log('⚠️  WARNING: High complexity detected');
      console.log('   Recommendation: Consider segmentation');

      if (options.autoSegment) {
        console.log('   Running segmentation specialist...');
        // TODO: Invoke segmentation specialist agent
      }
    }

    // Check for anti-patterns
    if (complexity.antiPatterns && complexity.antiPatterns.length > 0) {
      console.log('⚠️  Anti-patterns detected:');
      complexity.antiPatterns.forEach(ap => {
        console.log(`   - ${ap.description}`);
      });
    }

    // Run impact analysis (if not skipped)
    if (!options.skipImpact && options.targetOrg) {
      console.log('\n✓ Running impact analysis...');
      try {
        const impactResult = this.runImpactAnalysis(formula, options.object, options.targetOrg);
        console.log(`  Total Records: ${impactResult.totalRecords}`);
        console.log(`  Violating Records: ${impactResult.violatingRecords} (${impactResult.violationRate}%)`);
        console.log(`  Risk Level: ${impactResult.riskLevel}`);

        if (impactResult.riskLevel === 'HIGH' || impactResult.riskLevel === 'VERY_HIGH') {
          console.log('\n⚠️  WARNING: High violation rate detected');
          console.log('   Recommended: Deploy as inactive with grace period');

          if (!options.force) {
            console.log('\nUse --force to deploy anyway, or fix data first');
            process.exit(1);
          }
        }
      } catch (error) {
        console.log(`  ⚠️  Impact analysis failed: ${error.message}`);
        console.log('  Continuing without impact analysis...');
      }
    }

    // Deploy (if not dry-run)
    if (!options.dryRun && options.targetOrg) {
      console.log('\n✓ Deploying validation rule...');

      try {
        this.deployValidationRule({
          name: options.name || this.generateRuleName(template.name),
          object: options.object,
          formula,
          errorMessage,
          description: `${fullTemplate.description}\n\nTemplate: ${template.id} v${fullTemplate.version}`,
          active: options.active || false
        }, options.targetOrg);

        console.log('✓ Deployment successful\n');
        console.log('Validation Rule:', options.name);
        console.log('Status:', options.active ? 'Active' : 'Inactive');
        console.log('Object:', options.object);
        console.log('Org:', options.targetOrg);
        console.log('');
      } catch (error) {
        console.error(`\n✗ Deployment failed: ${error.message}`);
        process.exit(1);
      }
    } else {
      console.log('\n[DRY RUN] - No deployment performed');
      console.log('\nGenerated Rule:');
      console.log(`  Name: ${options.name || this.generateRuleName(template.name)}`);
      console.log(`  Object: ${options.object}`);
      console.log(`  Formula: ${formula.replace(/\n/g, ' ')}`);
      console.log(`  Error Message: ${errorMessage}`);
      console.log('');
    }
  }

  /**
   * Run impact analysis
   */
  runImpactAnalysis(formula, object, targetOrg) {
    // Build SOQL query from formula
    const whereClause = formula
      .replace(/AND\(/g, '')
      .replace(/OR\(/g, '')
      .replace(/NOT\(/g, '')
      .replace(/\)/g, '')
      .replace(/ISPICKVAL\(([^,]+),\s*"([^"]+)"\)/g, '$1 = \'$2\'')
      .replace(/ISBLANK\(([^)]+)\)/g, '$1 = null')
      .replace(/ISNULL\(([^)]+)\)/g, '$1 = null')
      .trim();

    const query = `SELECT COUNT() FROM ${object} WHERE ${whereClause}`;

    try {
      const result = execSync(
        `sf data query --query "${query}" --target-org ${targetOrg} --json`,
        { encoding: 'utf8' }
      );

      const parsed = JSON.parse(result);
      const violatingRecords = parsed.result.totalSize || 0;

      // Get total record count
      const totalQuery = `SELECT COUNT() FROM ${object}`;
      const totalResult = execSync(
        `sf data query --query "${totalQuery}" --target-org ${targetOrg} --json`,
        { encoding: 'utf8' }
      );
      const totalParsed = JSON.parse(totalResult);
      const totalRecords = totalParsed.result.totalSize || 0;

      const violationRate = totalRecords > 0 ? ((violatingRecords / totalRecords) * 100).toFixed(2) : 0;

      let riskLevel = 'NONE';
      if (violationRate > 10) riskLevel = 'VERY_HIGH';
      else if (violationRate > 5) riskLevel = 'HIGH';
      else if (violationRate > 1) riskLevel = 'MEDIUM';
      else if (violationRate > 0) riskLevel = 'LOW';

      return {
        totalRecords,
        violatingRecords,
        violationRate,
        riskLevel
      };
    } catch (error) {
      throw new Error(`Impact analysis query failed: ${error.message}`);
    }
  }

  /**
   * Deploy validation rule
   */
  deployValidationRule(rule, targetOrg) {
    // Create metadata XML
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ValidationRule xmlns="http://soap.sforce.com/2006/04/metadata">
    <fullName>${rule.name}</fullName>
    <active>${rule.active}</active>
    <description>${this.escapeXml(rule.description)}</description>
    <errorConditionFormula>${this.escapeXml(rule.formula)}</errorConditionFormula>
    <errorMessage>${this.escapeXml(rule.errorMessage)}</errorMessage>
</ValidationRule>`;

    // Write to temporary file
    const tempDir = path.join(__dirname, '../../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const metadataPath = path.join(
      tempDir,
      `${rule.object}`,
      'validationRules',
      `${rule.name}.validationRule-meta.xml`
    );

    // Create directory structure
    const dir = path.dirname(metadataPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(metadataPath, xml);

    // Deploy using Salesforce CLI
    try {
      const result = execSync(
        `sf project deploy start --metadata ValidationRule:${rule.object}.${rule.name} --target-org ${targetOrg}`,
        { encoding: 'utf8', cwd: tempDir }
      );

      // Clean up temp files
      fs.rmSync(tempDir, { recursive: true, force: true });

      return result;
    } catch (error) {
      // Clean up temp files even on error
      fs.rmSync(tempDir, { recursive: true, force: true });
      throw error;
    }
  }

  /**
   * Helper: Generate rule name from template
   */
  generateRuleName(templateName) {
    return templateName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
  }

  /**
   * Helper: Get complexity label
   */
  getComplexityLabel(score) {
    if (score <= 30) return 'Simple';
    if (score <= 60) return 'Medium';
    return 'Complex';
  }

  /**
   * Helper: Escape XML special characters
   */
  escapeXml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

// CLI Entry Point
if (require.main === module) {
  const args = process.argv.slice(2);
  const creator = new ValidationRuleCreator();

  // Parse command-line arguments
  const options = {
    template: null,
    object: null,
    name: null,
    params: {},
    targetOrg: null,
    active: false,
    dryRun: false,
    skipImpact: false,
    force: false,
    autoSegment: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--list':
        creator.listTemplates();
        process.exit(0);
        break;
      case '--show':
        creator.showTemplate(args[++i]);
        process.exit(0);
        break;
      case '--search':
        creator.searchTemplates(args[++i]);
        process.exit(0);
        break;
      case '--template':
        options.template = args[++i];
        break;
      case '--object':
        options.object = args[++i];
        break;
      case '--name':
        options.name = args[++i];
        break;
      case '--params':
        options.params = JSON.parse(args[++i]);
        break;
      case '--target-org':
        options.targetOrg = args[++i];
        break;
      case '--active':
        options.active = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--skip-impact':
        options.skipImpact = true;
        break;
      case '--force':
        options.force = true;
        break;
      case '--auto-segment':
        options.autoSegment = true;
        break;
    }
  }

  // Execute command
  if (options.template) {
    if (!options.object) {
      console.error('Error: --object is required when using --template');
      process.exit(1);
    }
    creator.applyTemplate(options.template, options.params, options);
  } else {
    console.log('Use --list to see all templates');
    console.log('Use --help for usage information');
  }
}

module.exports = ValidationRuleCreator;
