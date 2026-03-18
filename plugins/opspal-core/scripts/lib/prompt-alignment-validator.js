#!/usr/bin/env node

/**
 * Prompt Alignment Validator
 *
 * Pre-validates prompts and responses to prevent common prompt-mismatch errors:
 * 1. Template format selection - validates user format preferences
 * 2. Platform context detection - ensures correct platform targeting
 * 3. Asset discovery requirement - ensures existing assets are checked first
 *
 * Created: 2026-01-10
 * Based on: prompt-mismatch reflection cohort analysis
 * ROI: $42,000/year (7 reflections prevented)
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

// =============================================================================
// Configuration
// =============================================================================

const TEMPLATE_FORMATS = {
  'bluf+4': {
    name: 'BLUF+4 Executive Summary',
    description: 'Bottom Line Up Front with 4 supporting sections',
    triggers: ['executive', 'summary', 'bluf', 'stakeholder', 'brief'],
    sections: ['Bottom Line', 'Situation', 'Next Steps', 'Risks', 'Support Needed']
  },
  'handoff': {
    name: 'Handoff Format',
    description: 'Structured handoff for team transitions',
    triggers: ['handoff', 'transition', 'handover', 'pass to', 'transfer'],
    sections: ['Context', 'Current State', 'Outstanding Items', 'Next Owner Actions']
  },
  'audit': {
    name: 'Audit Report Format',
    description: 'Detailed audit with findings and recommendations',
    triggers: ['audit', 'assessment', 'review', 'analysis', 'evaluation'],
    sections: ['Executive Summary', 'Methodology', 'Findings', 'Recommendations']
  },
  'technical': {
    name: 'Technical Documentation',
    description: 'Developer-focused technical documentation',
    triggers: ['technical', 'implementation', 'developer', 'api', 'integration'],
    sections: ['Overview', 'Architecture', 'Implementation Details', 'API Reference']
  },
  'runbook': {
    name: 'Operational Runbook',
    description: 'Step-by-step operational procedures',
    triggers: ['runbook', 'procedure', 'playbook', 'sop', 'how-to', 'steps'],
    sections: ['Prerequisites', 'Steps', 'Verification', 'Rollback']
  }
};

const PLATFORM_CONTEXT = {
  salesforce: {
    triggers: ['salesforce', 'sfdc', 'sf org', 'apex', 'soql', 'lightning', 'flow', 'cpq', 'opportunity', 'lead', 'account', 'contact', 'campaign'],
    dataObjects: ['Opportunity', 'Lead', 'Account', 'Contact', 'Campaign', 'CampaignMember', 'Quote', 'Order'],
    exclusiveTerms: ['apex trigger', 'validation rule', 'workflow rule', 'process builder']
  },
  hubspot: {
    triggers: ['hubspot', 'hs', 'hubspot portal', 'deal', 'hubspot workflow', 'hubspot contact'],
    dataObjects: ['Deal', 'Contact', 'Company', 'Ticket', 'Marketing Email'],
    exclusiveTerms: ['hubspot workflow', 'deal stage', 'lifecycle stage']
  },
  marketo: {
    triggers: ['marketo', 'munchkin', 'marketo program', 'smart list', 'smart campaign'],
    dataObjects: ['Lead', 'Program', 'Smart List', 'Smart Campaign'],
    exclusiveTerms: ['smart campaign', 'engagement program', 'munchkin']
  }
};

const ASSET_DISCOVERY_PATTERNS = {
  css: {
    filePatterns: ['*.css', '*.scss', '*.less'],
    searchLocations: ['styles/', 'css/', 'assets/', 'templates/', 'src/styles/'],
    keywords: ['brand', 'theme', 'revpal', 'style', 'color']
  },
  templates: {
    filePatterns: ['*.html', '*.hbs', '*.ejs', '*.pug', '*.md'],
    searchLocations: ['templates/', 'views/', 'layouts/', 'partials/'],
    keywords: ['template', 'layout', 'component', 'partial']
  },
  config: {
    filePatterns: ['*.json', '*.yaml', '*.yml', '*.toml'],
    searchLocations: ['config/', '.claude/', 'settings/'],
    keywords: ['config', 'settings', 'options', 'preferences']
  },
  images: {
    filePatterns: ['*.png', '*.jpg', '*.svg', '*.ico'],
    searchLocations: ['assets/', 'images/', 'public/', 'static/'],
    keywords: ['logo', 'icon', 'brand', 'image']
  }
};

// =============================================================================
// Template Format Validation
// =============================================================================

class TemplateFormatValidator {
  /**
   * Detect intended template format from user prompt
   * @param {string} prompt - User prompt text
   * @returns {Object} Detection result with format and confidence
   */
  detectIntendedFormat(prompt) {
    const promptLower = prompt.toLowerCase();
    const matches = [];

    for (const [formatKey, format] of Object.entries(TEMPLATE_FORMATS)) {
      let score = 0;
      const matchedTriggers = [];

      for (const trigger of format.triggers) {
        if (promptLower.includes(trigger)) {
          score += 1;
          matchedTriggers.push(trigger);
        }
      }

      if (score > 0) {
        matches.push({
          format: formatKey,
          name: format.name,
          score,
          matchedTriggers,
          confidence: Math.min(score / 2, 1) // Normalize to 0-1
        });
      }
    }

    // Sort by score descending
    matches.sort((a, b) => b.score - a.score);

    if (matches.length === 0) {
      return {
        detected: false,
        format: null,
        message: 'No specific format detected - will use default'
      };
    }

    // Check for conflicts (multiple high-scoring formats)
    if (matches.length > 1 && matches[0].score === matches[1].score) {
      return {
        detected: true,
        format: matches[0].format,
        conflict: true,
        alternatives: matches.slice(0, 3),
        message: `Ambiguous format - detected both ${matches[0].name} and ${matches[1].name}`,
        recommendation: 'Clarify with user which format they prefer'
      };
    }

    return {
      detected: true,
      format: matches[0].format,
      name: matches[0].name,
      confidence: matches[0].confidence,
      matchedTriggers: matches[0].matchedTriggers,
      alternatives: matches.slice(1, 3)
    };
  }

  /**
   * Validate that response matches intended format
   * @param {string} response - Generated response text
   * @param {string} intendedFormat - The format that should be used
   * @returns {Object} Validation result
   */
  validateResponseFormat(response, intendedFormat) {
    const format = TEMPLATE_FORMATS[intendedFormat];
    if (!format) {
      return { valid: true, message: 'Unknown format, skipping validation' };
    }

    const missingeSections = [];
    const responseLower = response.toLowerCase();

    for (const section of format.sections) {
      // Check for section header patterns
      const patterns = [
        section.toLowerCase(),
        `## ${section.toLowerCase()}`,
        `**${section.toLowerCase()}**`,
        `### ${section.toLowerCase()}`
      ];

      const found = patterns.some(pattern => responseLower.includes(pattern));
      if (!found) {
        missingeSections.push(section);
      }
    }

    if (missingeSections.length > 0) {
      return {
        valid: false,
        format: intendedFormat,
        missingSections: missingeSections,
        message: `Response missing expected sections for ${format.name}: ${missingeSections.join(', ')}`,
        recommendation: `Add the following sections: ${missingeSections.join(', ')}`
      };
    }

    return {
      valid: true,
      format: intendedFormat,
      message: `Response matches ${format.name} format`
    };
  }
}

// =============================================================================
// Platform Context Validator
// =============================================================================

class PlatformContextValidator {
  /**
   * Detect platform context from prompt
   * @param {string} prompt - User prompt text
   * @returns {Object} Platform detection result
   */
  detectPlatformContext(prompt) {
    const promptLower = prompt.toLowerCase();
    const detections = [];

    for (const [platform, config] of Object.entries(PLATFORM_CONTEXT)) {
      let score = 0;
      const matchedTriggers = [];

      // Check triggers
      for (const trigger of config.triggers) {
        if (promptLower.includes(trigger)) {
          score += 1;
          matchedTriggers.push(trigger);
        }
      }

      // Check data objects (higher weight)
      for (const obj of config.dataObjects) {
        if (promptLower.includes(obj.toLowerCase())) {
          score += 0.5;
          matchedTriggers.push(`[object: ${obj}]`);
        }
      }

      // Check exclusive terms (definitive)
      for (const term of config.exclusiveTerms) {
        if (promptLower.includes(term)) {
          score += 2;
          matchedTriggers.push(`[exclusive: ${term}]`);
        }
      }

      if (score > 0) {
        detections.push({
          platform,
          score,
          matchedTriggers,
          confidence: Math.min(score / 3, 1)
        });
      }
    }

    // Sort by score
    detections.sort((a, b) => b.score - a.score);

    if (detections.length === 0) {
      return {
        detected: false,
        platform: null,
        message: 'No specific platform context detected'
      };
    }

    // Check for cross-platform confusion
    if (detections.length > 1) {
      const [primary, secondary] = detections;

      // If both platforms mentioned, flag potential confusion
      if (secondary.score > 0.5) {
        return {
          detected: true,
          platform: primary.platform,
          confidence: primary.confidence,
          crossPlatformWarning: true,
          allPlatforms: detections,
          message: `Multiple platforms detected: ${primary.platform} (primary), ${secondary.platform} (also mentioned)`,
          recommendation: 'Clarify which platform should be the data source vs target'
        };
      }
    }

    return {
      detected: true,
      platform: detections[0].platform,
      confidence: detections[0].confidence,
      matchedTriggers: detections[0].matchedTriggers
    };
  }

  /**
   * Detect attribution vs outcome window confusion
   * @param {string} prompt - User prompt
   * @returns {Object} Confusion detection result
   */
  detectTimeWindowConfusion(prompt) {
    const promptLower = prompt.toLowerCase();

    const attributionPatterns = ['attribution', 'influence', 'touchpoint', 'campaign ran', 'campaign period'];
    const outcomePatterns = ['closed', 'won', 'converted', 'outcome', 'result period'];

    const hasAttribution = attributionPatterns.some(p => promptLower.includes(p));
    const hasOutcome = outcomePatterns.some(p => promptLower.includes(p));

    if (hasAttribution && hasOutcome) {
      return {
        potentialConfusion: true,
        message: 'Prompt mentions both attribution and outcome windows',
        recommendation: 'Clarify: Are you analyzing when campaigns ran (attribution) or when opportunities closed (outcome)?'
      };
    }

    return { potentialConfusion: false };
  }
}

// =============================================================================
// Asset Discovery Validator
// =============================================================================

class AssetDiscoveryValidator {
  constructor(basePath = process.cwd()) {
    this.basePath = basePath;
  }

  /**
   * Check if task requires asset discovery
   * @param {string} prompt - User prompt
   * @returns {Object} Asset discovery requirements
   */
  detectAssetDiscoveryRequirement(prompt) {
    const promptLower = prompt.toLowerCase();
    const requirements = [];

    // Check for CSS/styling creation
    if (promptLower.match(/creat|build|make|generat|add/i) &&
        promptLower.match(/css|style|theme|color|brand/i)) {
      requirements.push({
        type: 'css',
        action: 'Before creating CSS, search for existing brand/theme styles',
        searchLocations: ASSET_DISCOVERY_PATTERNS.css.searchLocations,
        searchPatterns: ASSET_DISCOVERY_PATTERNS.css.filePatterns
      });
    }

    // Check for template creation
    if (promptLower.match(/creat|build|make|generat|add/i) &&
        promptLower.match(/template|layout|page|component/i)) {
      requirements.push({
        type: 'templates',
        action: 'Before creating templates, search for existing layouts and partials',
        searchLocations: ASSET_DISCOVERY_PATTERNS.templates.searchLocations,
        searchPatterns: ASSET_DISCOVERY_PATTERNS.templates.filePatterns
      });
    }

    // Check for config creation
    if (promptLower.match(/creat|add|set/i) &&
        promptLower.match(/config|setting|option/i)) {
      requirements.push({
        type: 'config',
        action: 'Before creating config, check for existing configuration files',
        searchLocations: ASSET_DISCOVERY_PATTERNS.config.searchLocations,
        searchPatterns: ASSET_DISCOVERY_PATTERNS.config.filePatterns
      });
    }

    if (requirements.length === 0) {
      return {
        required: false,
        message: 'No asset discovery required for this task'
      };
    }

    return {
      required: true,
      requirements,
      message: `Asset discovery required for: ${requirements.map(r => r.type).join(', ')}`,
      recommendation: 'Run asset discovery before creating new files'
    };
  }

  /**
   * Search for existing assets of a given type
   * @param {string} assetType - Type of asset to search for
   * @returns {Array} Found assets
   */
  async discoverAssets(assetType) {
    const config = ASSET_DISCOVERY_PATTERNS[assetType];
    if (!config) {
      return { found: false, assets: [], message: `Unknown asset type: ${assetType}` };
    }

    const foundAssets = [];

    for (const location of config.searchLocations) {
      const fullPath = path.join(this.basePath, location);

      if (!fs.existsSync(fullPath)) {
        continue;
      }

      try {
        const files = this.findFilesRecursive(fullPath, config.filePatterns);

        for (const file of files) {
          // Check if file contains relevant keywords
          const content = fs.readFileSync(file, 'utf8');
          const relevantKeywords = config.keywords.filter(kw =>
            content.toLowerCase().includes(kw.toLowerCase())
          );

          if (relevantKeywords.length > 0) {
            foundAssets.push({
              path: path.relative(this.basePath, file),
              matchedKeywords: relevantKeywords,
              size: fs.statSync(file).size
            });
          }
        }
      } catch (err) {
        // Skip inaccessible directories
      }
    }

    return {
      found: foundAssets.length > 0,
      assets: foundAssets,
      message: foundAssets.length > 0
        ? `Found ${foundAssets.length} existing ${assetType} assets`
        : `No existing ${assetType} assets found`
    };
  }

  /**
   * Recursively find files matching patterns
   * @param {string} dir - Directory to search
   * @param {Array} patterns - File patterns to match
   * @returns {Array} Matching file paths
   */
  findFilesRecursive(dir, patterns) {
    const results = [];

    try {
      const items = fs.readdirSync(dir);

      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
          results.push(...this.findFilesRecursive(fullPath, patterns));
        } else if (stat.isFile()) {
          const matchesPattern = patterns.some(pattern => {
            const regex = new RegExp(pattern.replace('*', '.*'));
            return regex.test(item);
          });

          if (matchesPattern) {
            results.push(fullPath);
          }
        }
      }
    } catch (err) {
      // Skip inaccessible directories
    }

    return results;
  }
}

// =============================================================================
// Combined Prompt Alignment Validator
// =============================================================================

class PromptAlignmentValidator {
  constructor(basePath = process.cwd()) {
    this.templateValidator = new TemplateFormatValidator();
    this.platformValidator = new PlatformContextValidator();
    this.assetValidator = new AssetDiscoveryValidator(basePath);
  }

  /**
   * Full prompt alignment validation
   * @param {string} prompt - User prompt to validate
   * @returns {Object} Comprehensive validation result
   */
  async validatePrompt(prompt) {
    const results = {
      timestamp: new Date().toISOString(),
      prompt: prompt.substring(0, 200) + (prompt.length > 200 ? '...' : ''),
      validations: {},
      warnings: [],
      recommendations: []
    };

    // 1. Template format detection
    const formatResult = this.templateValidator.detectIntendedFormat(prompt);
    results.validations.templateFormat = formatResult;
    if (formatResult.conflict) {
      results.warnings.push(formatResult.message);
      results.recommendations.push(formatResult.recommendation);
    }

    // 2. Platform context detection
    const platformResult = this.platformValidator.detectPlatformContext(prompt);
    results.validations.platformContext = platformResult;
    if (platformResult.crossPlatformWarning) {
      results.warnings.push(platformResult.message);
      results.recommendations.push(platformResult.recommendation);
    }

    // 3. Time window confusion detection
    const timeWindowResult = this.platformValidator.detectTimeWindowConfusion(prompt);
    results.validations.timeWindow = timeWindowResult;
    if (timeWindowResult.potentialConfusion) {
      results.warnings.push(timeWindowResult.message);
      results.recommendations.push(timeWindowResult.recommendation);
    }

    // 4. Asset discovery requirements
    const assetResult = this.assetValidator.detectAssetDiscoveryRequirement(prompt);
    results.validations.assetDiscovery = assetResult;
    if (assetResult.required) {
      results.warnings.push(assetResult.message);
      results.recommendations.push(assetResult.recommendation);

      // Run actual asset discovery for required types
      for (const req of assetResult.requirements) {
        const discovered = await this.assetValidator.discoverAssets(req.type);
        req.discoveredAssets = discovered;

        if (discovered.found) {
          results.recommendations.push(
            `Use existing ${req.type} assets: ${discovered.assets.slice(0, 3).map(a => a.path).join(', ')}`
          );
        }
      }
    }

    // Summary
    results.hasWarnings = results.warnings.length > 0;
    results.summary = results.hasWarnings
      ? `${results.warnings.length} potential alignment issue(s) detected`
      : 'No alignment issues detected';

    return results;
  }

  /**
   * Validate response against detected format
   * @param {string} response - Generated response
   * @param {Object} promptValidation - Result from validatePrompt()
   * @returns {Object} Response validation result
   */
  validateResponse(response, promptValidation) {
    const formatDetection = promptValidation.validations?.templateFormat;

    if (!formatDetection || !formatDetection.detected || !formatDetection.format) {
      return { valid: true, message: 'No format validation required' };
    }

    return this.templateValidator.validateResponseFormat(response, formatDetection.format);
  }
}

// =============================================================================
// CLI Interface
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const validator = new PromptAlignmentValidator();

  switch (command) {
    case 'validate': {
      const prompt = args.slice(1).join(' ');
      if (!prompt) {
        console.log('Usage: node prompt-alignment-validator.js validate <prompt>');
        process.exit(1);
      }

      const result = await validator.validatePrompt(prompt);
      console.log('\n' + '═'.repeat(70));
      console.log('PROMPT ALIGNMENT VALIDATION');
      console.log('═'.repeat(70));
      console.log('\nPrompt:', result.prompt);
      console.log('\n' + '─'.repeat(70));

      console.log('\n📋 Template Format:');
      const tf = result.validations.templateFormat;
      if (tf.detected) {
        console.log(`   Detected: ${tf.name} (confidence: ${(tf.confidence * 100).toFixed(0)}%)`);
        console.log(`   Triggers: ${tf.matchedTriggers?.join(', ') || 'N/A'}`);
      } else {
        console.log('   No specific format detected');
      }

      console.log('\n🖥️  Platform Context:');
      const pc = result.validations.platformContext;
      if (pc.detected) {
        console.log(`   Platform: ${pc.platform} (confidence: ${(pc.confidence * 100).toFixed(0)}%)`);
        if (pc.crossPlatformWarning) {
          console.log('   ⚠️  Cross-platform warning: ' + pc.message);
        }
      } else {
        console.log('   No specific platform detected');
      }

      console.log('\n📦 Asset Discovery:');
      const ad = result.validations.assetDiscovery;
      if (ad.required) {
        console.log('   Required: YES');
        for (const req of ad.requirements) {
          console.log(`   - ${req.type}: ${req.action}`);
          if (req.discoveredAssets?.found) {
            console.log(`     Found: ${req.discoveredAssets.assets.map(a => a.path).join(', ')}`);
          }
        }
      } else {
        console.log('   Required: NO');
      }

      if (result.warnings.length > 0) {
        console.log('\n⚠️  WARNINGS:');
        result.warnings.forEach((w, i) => console.log(`   ${i + 1}. ${w}`));
      }

      if (result.recommendations.length > 0) {
        console.log('\n💡 RECOMMENDATIONS:');
        result.recommendations.forEach((r, i) => console.log(`   ${i + 1}. ${r}`));
      }

      console.log('\n' + '═'.repeat(70));
      console.log('Summary:', result.summary);
      console.log('═'.repeat(70) + '\n');
      break;
    }

    case 'formats': {
      console.log('\n' + '═'.repeat(70));
      console.log('AVAILABLE TEMPLATE FORMATS');
      console.log('═'.repeat(70));

      for (const [key, format] of Object.entries(TEMPLATE_FORMATS)) {
        console.log(`\n📋 ${format.name} (${key})`);
        console.log(`   ${format.description}`);
        console.log(`   Triggers: ${format.triggers.join(', ')}`);
        console.log(`   Sections: ${format.sections.join(', ')}`);
      }
      console.log('\n' + '═'.repeat(70) + '\n');
      break;
    }

    case 'platforms': {
      console.log('\n' + '═'.repeat(70));
      console.log('PLATFORM CONTEXT DETECTION');
      console.log('═'.repeat(70));

      for (const [platform, config] of Object.entries(PLATFORM_CONTEXT)) {
        console.log(`\n🖥️  ${platform.toUpperCase()}`);
        console.log(`   Triggers: ${config.triggers.slice(0, 5).join(', ')}...`);
        console.log(`   Data Objects: ${config.dataObjects.join(', ')}`);
        console.log(`   Exclusive Terms: ${config.exclusiveTerms.join(', ')}`);
      }
      console.log('\n' + '═'.repeat(70) + '\n');
      break;
    }

    case 'discover': {
      const assetType = args[1];
      if (!assetType) {
        console.log('Usage: node prompt-alignment-validator.js discover <type>');
        console.log('Types: css, templates, config, images');
        process.exit(1);
      }

      const result = await validator.assetValidator.discoverAssets(assetType);
      console.log('\n' + '═'.repeat(70));
      console.log(`ASSET DISCOVERY: ${assetType.toUpperCase()}`);
      console.log('═'.repeat(70));

      if (result.found) {
        console.log(`\nFound ${result.assets.length} assets:\n`);
        result.assets.forEach((asset, i) => {
          console.log(`${i + 1}. ${asset.path}`);
          console.log(`   Keywords: ${asset.matchedKeywords.join(', ')}`);
          console.log(`   Size: ${asset.size} bytes`);
        });
      } else {
        console.log('\nNo assets found.');
      }
      console.log('\n' + '═'.repeat(70) + '\n');
      break;
    }

    default:
      console.log(`
Prompt Alignment Validator

Pre-validates prompts to prevent common mismatches:
- Template format selection (BLUF+4 vs handoff vs audit)
- Platform context (Salesforce vs HubSpot confusion)
- Asset discovery (checking for existing CSS/templates)

Usage: node prompt-alignment-validator.js <command> [args]

Commands:
  validate <prompt>     Validate a prompt for alignment issues
  formats               List available template formats
  platforms             Show platform detection patterns
  discover <type>       Discover existing assets (css, templates, config, images)

Examples:
  node prompt-alignment-validator.js validate "Create an executive summary of the audit"
  node prompt-alignment-validator.js validate "Generate CSS styles for the dashboard"
  node prompt-alignment-validator.js formats
  node prompt-alignment-validator.js discover css
`);
  }
}

// Export classes for programmatic use
module.exports = {
  PromptAlignmentValidator,
  TemplateFormatValidator,
  PlatformContextValidator,
  AssetDiscoveryValidator,
  TEMPLATE_FORMATS,
  PLATFORM_CONTEXT,
  ASSET_DISCOVERY_PATTERNS
};

// Run CLI if called directly
if (require.main === module) {
  main().catch(console.error);
}
