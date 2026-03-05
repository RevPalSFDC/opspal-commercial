#!/usr/bin/env node

/**
 * Org Context Manager
 *
 * Persists and retrieves org-level context across assessments, providing
 * continuity and cross-referencing capabilities between different evaluations.
 *
 * Supports dual-path resolution:
 * - New: orgs/{org}/platforms/salesforce/{instance}
 * - Legacy: instances/{orgAlias} or instances/salesforce/{orgAlias}
 *
 * Usage:
 *   node scripts/lib/org-context-manager.js load eta-corp
 *   node scripts/lib/org-context-manager.js update eta-corp --assessment ./path/to/assessment/
 *   node scripts/lib/org-context-manager.js cross-reference eta-corp --latest-assessment ./path/
 *   node scripts/lib/org-context-manager.js generate-summary eta-corp
 *   node scripts/lib/org-context-manager.js migrate eta-corp --org acme [--instance production]
 *   node scripts/lib/org-context-manager.js resolve eta-corp [--org acme]
 *
 * Context Structure:
 *   ORG_CONTEXT.json:
 *   {
 *     "org": "eta-corp",
 *     "assessments": [...],
 *     "quirks": {...},
 *     "key_metrics": {...},
 *     "recommendations": [...]
 *   }
 */

const fs = require('fs');
const path = require('path');

const CONTEXT_FILE = 'ORG_CONTEXT.json';
const SUMMARY_FILE = 'ORG_SUMMARY.md';
const PLATFORM = 'salesforce';

// Try to load PathResolver from opspal-core
let PathResolver;
try {
  PathResolver = require('../../../opspal-core/scripts/lib/path-resolver').PathResolver;
} catch (e) {
  // Fallback if opspal-core not available
  PathResolver = null;
}

// Try to load MetadataLoader from opspal-core
let MetadataLoader;
try {
  MetadataLoader = require('../../../opspal-core/scripts/lib/metadata-loader').MetadataLoader;
} catch (e) {
  MetadataLoader = null;
}

/**
 * Resolve instance path with dual-path support
 *
 * Priority:
 * 1. Environment variable override (INSTANCE_PATH)
 * 2. Org-centric: orgs/{org}/platforms/salesforce/{instance}
 * 3. Legacy platform: instances/salesforce/{instance}
 * 4. Legacy simple: instances/{instance}
 *
 * @param {string} orgAlias - Org alias or instance name
 * @param {Object} [options] - Resolution options
 * @param {string} [options.org] - Explicit org slug for org-centric path
 * @param {string} [options.instance] - Instance name (defaults to orgAlias)
 * @param {boolean} [options.preferLegacy] - Prefer legacy paths (default: false)
 * @returns {Object} Resolution result with path and structure type
 */
function resolveInstancePath(orgAlias, options = {}) {
  const basePath = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
  const { org, instance, preferLegacy } = options;

  // Check environment override
  const envPath = process.env.INSTANCE_PATH;
  if (envPath && fs.existsSync(envPath)) {
    return { path: envPath, structure: 'env-override', found: true };
  }

  // Use PathResolver if available
  if (PathResolver && !preferLegacy) {
    const resolver = new PathResolver({ basePath });
    const effectiveOrg = org || process.env.ORG_SLUG || process.env.CLIENT_ORG;
    const effectiveInstance = instance || orgAlias;

    // Try org-centric first
    if (effectiveOrg) {
      const orgPath = path.join(basePath, 'orgs', effectiveOrg, 'platforms', PLATFORM, effectiveInstance);
      if (fs.existsSync(orgPath)) {
        return { path: orgPath, structure: 'org-centric', found: true, org: effectiveOrg, instance: effectiveInstance };
      }
    }
  }

  // Build candidate paths for legacy patterns
  const candidates = [];

  // Priority 1: Org-centric (if org provided)
  const effectiveOrg = org || process.env.ORG_SLUG || process.env.CLIENT_ORG;
  const effectiveInstance = instance || orgAlias;

  if (effectiveOrg && !preferLegacy) {
    candidates.push({
      path: path.join(basePath, 'orgs', effectiveOrg, 'platforms', PLATFORM, effectiveInstance),
      structure: 'org-centric',
      org: effectiveOrg,
      instance: effectiveInstance
    });
  }

  // Priority 2: Legacy platform pattern
  candidates.push({
    path: path.join(basePath, 'instances', PLATFORM, orgAlias),
    structure: 'legacy-platform',
    instance: orgAlias
  });

  // Priority 3: Legacy simple pattern
  candidates.push({
    path: path.join(basePath, 'instances', orgAlias),
    structure: 'legacy-simple',
    instance: orgAlias
  });

  // Priority 4: Plugin-specific instances
  candidates.push({
    path: path.join(basePath, '.claude-plugins', 'salesforce-plugin', 'instances', orgAlias),
    structure: 'plugin-specific',
    instance: orgAlias
  });

  candidates.push({
    path: path.join(basePath, '.claude-plugins', 'salesforce-plugin', 'instances', PLATFORM, orgAlias),
    structure: 'plugin-specific',
    instance: orgAlias
  });

  // Find first existing path
  for (const candidate of candidates) {
    if (fs.existsSync(candidate.path)) {
      return { ...candidate, found: true };
    }
  }

  // Not found - return first candidate (preferred structure)
  return { ...candidates[0], found: false };
}

/**
 * Get instance path with backward compatibility
 *
 * @param {string} orgAlias - Org alias
 * @param {Object} [options] - Resolution options
 * @returns {string} Resolved path
 */
function getInstancePath(orgAlias, options = {}) {
  const result = resolveInstancePath(orgAlias, options);
  return result.path;
}

/**
 * Get context file path
 *
 * @param {string} orgAlias - Org alias
 * @param {Object} [options] - Resolution options
 * @returns {string} Path to ORG_CONTEXT.json
 */
function getContextPath(orgAlias, options = {}) {
  const instancePath = getInstancePath(orgAlias, options);

  // For org-centric paths, context goes in configs/ subdirectory
  const resolution = resolveInstancePath(orgAlias, options);
  if (resolution.structure === 'org-centric') {
    return path.join(instancePath, 'configs', CONTEXT_FILE);
  }

  return path.join(instancePath, CONTEXT_FILE);
}

/**
 * Load org context with dual-path support
 *
 * @param {string} orgAlias - Org alias
 * @param {Object} [options] - Resolution options
 * @returns {Object} Context object
 */
function loadContext(orgAlias, options = {}) {
  const resolution = resolveInstancePath(orgAlias, options);
  const contextPath = getContextPath(orgAlias, options);

  if (!fs.existsSync(contextPath)) {
    console.log(`📂 No existing context found for ${orgAlias}, returning empty context`);
    console.log(`   Path checked: ${contextPath}`);
    console.log(`   Resolution: ${resolution.structure} (found: ${resolution.found})`);

    return {
      org: orgAlias,
      created: new Date().toISOString(),
      last_updated: new Date().toISOString(),
      assessments: [],
      quirks: {},
      key_metrics: {},
      recommendations: [],
      _resolution: {
        path: resolution.path,
        structure: resolution.structure,
        org: resolution.org || null,
        instance: resolution.instance || orgAlias
      }
    };
  }

  console.log(`📂 Loading context from ${contextPath}`);
  console.log(`   Structure: ${resolution.structure}`);

  const context = JSON.parse(fs.readFileSync(contextPath, 'utf8'));

  // Add resolution metadata
  context._resolution = {
    path: resolution.path,
    structure: resolution.structure,
    org: resolution.org || null,
    instance: resolution.instance || orgAlias
  };

  return context;
}

/**
 * Save org context with dual-path support
 *
 * @param {string} orgAlias - Org alias
 * @param {Object} context - Context to save
 * @param {Object} [options] - Resolution options
 */
function saveContext(orgAlias, context, options = {}) {
  const resolution = resolveInstancePath(orgAlias, options);
  const instancePath = resolution.path;
  const contextPath = getContextPath(orgAlias, options);

  // Ensure directory exists
  const contextDir = path.dirname(contextPath);
  if (!fs.existsSync(contextDir)) {
    fs.mkdirSync(contextDir, { recursive: true });
  }

  context.last_updated = new Date().toISOString();

  // Update resolution metadata
  context._resolution = {
    path: resolution.path,
    structure: resolution.structure,
    org: resolution.org || null,
    instance: resolution.instance || orgAlias
  };

  fs.writeFileSync(contextPath, JSON.stringify(context, null, 2));
  console.log(`✅ Context saved to ${contextPath}`);
  console.log(`   Structure: ${resolution.structure}`);
}

/**
 * Migrate context from legacy to org-centric structure
 *
 * @param {string} orgAlias - Legacy org alias
 * @param {string} targetOrg - Target org slug
 * @param {string} [targetInstance] - Target instance name (defaults to orgAlias)
 * @param {Object} [options] - Migration options
 * @returns {Object} Migration result
 */
function migrateContext(orgAlias, targetOrg, targetInstance = null, options = {}) {
  const { dryRun = false, copyQuirks = true } = options;

  console.log(`🚀 Migrating context for ${orgAlias} → ${targetOrg}/${targetInstance || orgAlias}`);

  // Load from legacy path
  const legacyContext = loadContext(orgAlias, { preferLegacy: true });

  if (!legacyContext._resolution?.found && legacyContext.assessments.length === 0) {
    console.log(`⚠️  No existing context found for ${orgAlias}`);
    return { success: false, reason: 'no-existing-context' };
  }

  // Prepare target path
  const basePath = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
  const targetPath = path.join(
    basePath,
    'orgs',
    targetOrg,
    'platforms',
    PLATFORM,
    targetInstance || orgAlias
  );

  console.log(`   Source: ${legacyContext._resolution?.path || 'new context'}`);
  console.log(`   Target: ${targetPath}`);

  if (dryRun) {
    console.log(`   [DRY RUN] Would migrate ${legacyContext.assessments.length} assessments`);
    return {
      success: true,
      dryRun: true,
      sourcePath: legacyContext._resolution?.path,
      targetPath: targetPath,
      assessmentCount: legacyContext.assessments.length
    };
  }

  // Create target directory structure
  const configsDir = path.join(targetPath, 'configs');
  if (!fs.existsSync(configsDir)) {
    fs.mkdirSync(configsDir, { recursive: true });
  }

  // Update context with new metadata
  legacyContext.org = targetOrg;
  legacyContext.instance = targetInstance || orgAlias;
  legacyContext.platform = PLATFORM;
  legacyContext._migration = {
    migrated_at: new Date().toISOString(),
    source_path: legacyContext._resolution?.path,
    source_structure: legacyContext._resolution?.structure || 'legacy'
  };

  // Remove old resolution metadata
  delete legacyContext._resolution;

  // Save to new location
  const newContextPath = path.join(configsDir, CONTEXT_FILE);
  fs.writeFileSync(newContextPath, JSON.stringify(legacyContext, null, 2));
  console.log(`✅ Context migrated to ${newContextPath}`);

  // Copy ORG_QUIRKS.json if it exists and copyQuirks is enabled
  if (copyQuirks) {
    const legacyQuirksPath = path.join(legacyContext._migration.source_path || '', 'ORG_QUIRKS.json');
    if (fs.existsSync(legacyQuirksPath)) {
      const newQuirksPath = path.join(configsDir, 'ORG_QUIRKS.json');
      fs.copyFileSync(legacyQuirksPath, newQuirksPath);
      console.log(`✅ Quirks copied to ${newQuirksPath}`);
    }
  }

  return {
    success: true,
    sourcePath: legacyContext._migration.source_path,
    targetPath: newContextPath,
    assessmentCount: legacyContext.assessments.length
  };
}

/**
 * Enrich context with YAML metadata (if available)
 *
 * @param {string} orgAlias - Org alias
 * @param {Object} [options] - Options
 * @returns {Promise<Object>} Enriched context
 */
async function enrichContextWithMetadata(orgAlias, options = {}) {
  const context = loadContext(orgAlias, options);

  if (!MetadataLoader) {
    return context;
  }

  const loader = new MetadataLoader();
  const resolution = resolveInstancePath(orgAlias, options);

  if (resolution.structure === 'org-centric' && resolution.org) {
    const enriched = await loader.enrichContextWithMetadata(
      context,
      resolution.org,
      PLATFORM,
      resolution.instance || orgAlias
    );
    return enriched;
  }

  return context;
}

function updateWithAssessment(orgAlias, assessmentPath, options = {}) {
  console.log(`📊 Updating context with assessment from ${assessmentPath}`);

  const context = loadContext(orgAlias, options);

  // Load assessment data
  const dataPath = path.join(assessmentPath, 'reports', 'COMPREHENSIVE_ASSESSMENT_DATA.json');

  if (!fs.existsSync(dataPath)) {
    console.error(`❌ Assessment data not found at ${dataPath}`);
    process.exit(1);
  }

  const assessmentData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  // Add assessment to history
  context.assessments.push({
    type: assessmentData.assessment_type || 'comprehensive',
    date: new Date().toISOString().split('T')[0],
    path: assessmentPath,
    overall_score: assessmentData.overall_score,
    scores: assessmentData.scores,
    key_findings: assessmentData.key_findings || []
  });

  // Update key metrics
  context.key_metrics = {
    ...context.key_metrics,
    last_assessment_score: assessmentData.overall_score,
    assessment_count: context.assessments.length
  };

  saveContext(orgAlias, context, options);
  console.log(`✅ Context updated with assessment`);
}

function crossReference(orgAlias, latestAssessmentPath, options = {}) {
  console.log(`🔗 Cross-referencing assessments for ${orgAlias}`);

  const context = loadContext(orgAlias, options);

  if (context.assessments.length === 0) {
    console.log(`ℹ️  No previous assessments to cross-reference`);
    return;
  }

  // Load latest assessment
  const latestDataPath = path.join(latestAssessmentPath, 'reports', 'COMPREHENSIVE_ASSESSMENT_DATA.json');

  if (!fs.existsSync(latestDataPath)) {
    console.error(`❌ Latest assessment data not found at ${latestDataPath}`);
    process.exit(1);
  }

  const latestData = JSON.parse(fs.readFileSync(latestDataPath, 'utf8'));

  // Identify overlapping areas
  const overlaps = [];

  context.assessments.forEach(prevAssessment => {
    // Compare assessment types
    if (prevAssessment.type !== latestData.assessment_type) {
      // Different assessment types might still have overlapping areas
      const overlap = {
        previous_assessment: prevAssessment.type,
        date: prevAssessment.date,
        overlapping_areas: []
      };

      // Example: CPQ assessment + RevOps assessment overlap in automation, data quality
      if (prevAssessment.type === 'cpq' && latestData.assessment_type === 'comprehensive') {
        overlap.overlapping_areas = [
          'Subscription Management',
          'Automation & Workflows',
          'Data Quality',
          'Product Catalog'
        ];
      }

      if (overlap.overlapping_areas.length > 0) {
        overlaps.push(overlap);
      }
    }
  });

  if (overlaps.length > 0) {
    console.log(`\n🔗 Cross-Reference Results:\n`);
    overlaps.forEach(overlap => {
      console.log(`  Previous Assessment: ${overlap.previous_assessment} (${overlap.date})`);
      console.log(`  Overlapping Areas:`);
      overlap.overlapping_areas.forEach(area => {
        console.log(`    - ${area}`);
      });
      console.log('');
    });
  } else {
    console.log(`ℹ️  No overlapping areas identified between assessments`);
  }

  return overlaps;
}

function generateSummary(orgAlias, options = {}) {
  console.log(`📄 Generating org summary for ${orgAlias}`);

  const context = loadContext(orgAlias, options);

  if (context.assessments.length === 0) {
    console.log(`ℹ️  No assessments found for ${orgAlias}`);
    return;
  }

  let md = `# ${orgAlias} - Organization Summary\n\n`;
  md += `**Last Updated:** ${context.last_updated.split('T')[0]}\n`;
  md += `**Total Assessments:** ${context.assessments.length}\n\n`;
  md += `---\n\n`;

  md += `## Assessment History\n\n`;
  md += `| Date | Type | Overall Score | Path |\n`;
  md += `|------|------|---------------|------|\n`;

  context.assessments.forEach(assessment => {
    md += `| ${assessment.date} | ${assessment.type} | ${assessment.overall_score}/100 | ${assessment.path} |\n`;
  });

  md += `\n---\n\n`;

  md += `## Latest Scores by Assessment Type\n\n`;

  const assessmentTypes = [...new Set(context.assessments.map(a => a.type))];

  assessmentTypes.forEach(type => {
    const latestOfType = context.assessments
      .filter(a => a.type === type)
      .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

    md += `### ${type.toUpperCase()} Assessment\n\n`;
    md += `**Score:** ${latestOfType.overall_score}/100\n`;
    md += `**Date:** ${latestOfType.date}\n\n`;

    if (latestOfType.scores) {
      md += `**Dimensional Scores:**\n`;
      Object.entries(latestOfType.scores).forEach(([dimension, score]) => {
        md += `- ${dimension}: ${score}\n`;
      });
      md += '\n';
    }
  });

  md += `---\n\n`;

  md += `## Org Quirks\n\n`;

  if (context.quirks && Object.keys(context.quirks).length > 0) {
    md += `**Detected Customizations:**\n`;
    if (context.quirks.label_customizations) {
      md += `- ${context.quirks.label_customizations.length} object label customizations\n`;
    }
    md += `\nSee: \`ORG_QUIRKS.json\` for full details\n\n`;
  } else {
    md += `No org quirks detected or documented.\n\n`;
  }

  md += `---\n\n`;
  md += `**Context File:** \`ORG_CONTEXT.json\`\n`;

  const instancePath = getInstancePath(orgAlias, options);
  const resolution = resolveInstancePath(orgAlias, options);

  // For org-centric paths, save to configs/
  let summaryPath;
  if (resolution.structure === 'org-centric') {
    summaryPath = path.join(instancePath, 'configs', SUMMARY_FILE);
  } else {
    summaryPath = path.join(instancePath, SUMMARY_FILE);
  }

  // Ensure directory exists
  const summaryDir = path.dirname(summaryPath);
  if (!fs.existsSync(summaryDir)) {
    fs.mkdirSync(summaryDir, { recursive: true });
  }

  fs.writeFileSync(summaryPath, md);
  console.log(`✅ Summary saved to ${summaryPath}`);

  return md;
}

/**
 * Parse CLI arguments for options
 * @private
 */
function parseOptions(args) {
  const options = {};

  const orgIndex = args.indexOf('--org');
  if (orgIndex !== -1 && args[orgIndex + 1]) {
    options.org = args[orgIndex + 1];
  }

  const instanceIndex = args.indexOf('--instance');
  if (instanceIndex !== -1 && args[instanceIndex + 1]) {
    options.instance = args[instanceIndex + 1];
  }

  options.preferLegacy = args.includes('--legacy');
  options.dryRun = args.includes('--dry-run');

  return options;
}

function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: org-context-manager.js <action> <org-alias> [options]');
    console.error('');
    console.error('Actions:');
    console.error('  load                Load org context (outputs JSON)');
    console.error('  update              Update context with assessment data');
    console.error('  cross-reference     Cross-reference with latest assessment');
    console.error('  generate-summary    Generate ORG_SUMMARY.md');
    console.error('  resolve             Show path resolution for org alias');
    console.error('  migrate             Migrate context to org-centric structure');
    console.error('');
    console.error('Options:');
    console.error('  --org <slug>        Org slug for org-centric resolution');
    console.error('  --instance <name>   Instance name (defaults to org-alias)');
    console.error('  --legacy            Prefer legacy paths');
    console.error('  --dry-run           Show what would happen without making changes');
    console.error('');
    console.error('Examples:');
    console.error('  node org-context-manager.js load eta-corp');
    console.error('  node org-context-manager.js load production --org acme');
    console.error('  node org-context-manager.js resolve eta-corp');
    console.error('  node org-context-manager.js migrate eta-corp --org acme --instance production --dry-run');
    console.error('  node org-context-manager.js update eta-corp --assessment ./comprehensive-assessment-2025-10-03/');
    console.error('  node org-context-manager.js cross-reference eta-corp --latest-assessment ./path/');
    console.error('  node org-context-manager.js generate-summary eta-corp');
    process.exit(1);
  }

  const action = args[0];
  const orgAlias = args[1];
  const options = parseOptions(args);

  switch (action) {
    case 'load': {
      const context = loadContext(orgAlias, options);
      console.log(JSON.stringify(context, null, 2));
      break;
    }

    case 'resolve': {
      const resolution = resolveInstancePath(orgAlias, options);
      console.log(`\n📍 Path Resolution for "${orgAlias}":\n`);
      console.log(`   Path:      ${resolution.path}`);
      console.log(`   Structure: ${resolution.structure}`);
      console.log(`   Found:     ${resolution.found ? 'Yes' : 'No'}`);
      if (resolution.org) {
        console.log(`   Org:       ${resolution.org}`);
      }
      console.log(`   Instance:  ${resolution.instance || orgAlias}`);
      console.log('');
      break;
    }

    case 'migrate': {
      if (!options.org) {
        console.error('❌ --org flag required for migration');
        process.exit(1);
      }
      const result = migrateContext(orgAlias, options.org, options.instance, options);
      if (!result.success) {
        console.error(`❌ Migration failed: ${result.reason}`);
        process.exit(1);
      }
      break;
    }

    case 'update': {
      const assessmentIndex = args.indexOf('--assessment');
      if (assessmentIndex === -1 || !args[assessmentIndex + 1]) {
        console.error('❌ --assessment flag required with path to assessment');
        process.exit(1);
      }
      const assessmentPath = args[assessmentIndex + 1];
      updateWithAssessment(orgAlias, assessmentPath, options);
      break;
    }

    case 'cross-reference': {
      const latestIndex = args.indexOf('--latest-assessment');
      if (latestIndex === -1 || !args[latestIndex + 1]) {
        console.error('❌ --latest-assessment flag required with path');
        process.exit(1);
      }
      const latestPath = args[latestIndex + 1];
      crossReference(orgAlias, latestPath, options);
      break;
    }

    case 'generate-summary': {
      const summary = generateSummary(orgAlias, options);
      console.log('\n' + summary);
      break;
    }

    default:
      console.error(`Unknown action: ${action}`);
      process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  // Core functions
  loadContext,
  saveContext,
  updateWithAssessment,
  crossReference,
  generateSummary,
  // Path resolution (dual-path support)
  resolveInstancePath,
  getInstancePath,
  getContextPath,
  // Migration
  migrateContext,
  // Metadata enrichment
  enrichContextWithMetadata
};
