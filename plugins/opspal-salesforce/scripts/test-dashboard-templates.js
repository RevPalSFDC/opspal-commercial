#!/usr/bin/env node
/**
 * Dashboard Template Validation Script
 *
 * Validates all dashboard templates in the catalog for:
 * 1. JSON structure and required fields
 * 2. Report template references
 * 3. Persona KPI contract compliance
 * 4. Dashboard quality score (minimum 70)
 * 5. Variation schema compliance (NEW)
 * 6. CPQ field mapping completeness (NEW)
 *
 * Usage:
 *   node scripts/test-dashboard-templates.js [--verbose] [--template <id>]
 *   node scripts/test-dashboard-templates.js --include-variations
 *   node scripts/test-dashboard-templates.js --variations-only
 *
 * @version 1.1.0
 * @since 2026-01-24
 */

const fs = require('fs');
const path = require('path');
const { resolveProtectedAssetPath } = require('../../opspal-core/scripts/lib/protected-asset-runtime');

// Configuration
const PLUGIN_ROOT = path.join(__dirname, '..');
const TEMPLATES_DIR = path.join(PLUGIN_ROOT, 'templates', 'dashboards');
const REPORTS_DIR = path.join(PLUGIN_ROOT, 'templates', 'reports');
const REGISTRY_PATH = path.join(TEMPLATES_DIR, 'dashboard-template-registry.json');
const PERSONA_KPI_PATH = resolveProtectedAssetPath({
  pluginRoot: PLUGIN_ROOT,
  pluginName: 'opspal-salesforce',
  relativePath: 'config/persona-kpi-contracts.json',
  allowPlaintextFallback: true
}) || path.join(PLUGIN_ROOT, 'config', 'persona-kpi-contracts.json');
const METRIC_DEFINITIONS_PATH = path.join(PLUGIN_ROOT, 'config', 'metric-definitions.json');
const VARIATION_SCHEMA_PATH = path.join(PLUGIN_ROOT, 'config', 'variation-schema.json');
const CPQ_MAPPINGS_PATH = resolveProtectedAssetPath({
  pluginRoot: PLUGIN_ROOT,
  pluginName: 'opspal-salesforce',
  relativePath: 'config/cpq-field-mappings.json',
  allowPlaintextFallback: true
}) || path.join(PLUGIN_ROOT, 'config', 'cpq-field-mappings.json');

// Required fields in dashboard templates
const REQUIRED_FIELDS = [
  'templateMetadata.templateId',
  'templateMetadata.templateName',
  'templateMetadata.description',
  'templateMetadata.audience',
  'templateMetadata.function',
  'templateMetadata.level',
  'dashboardLayout.components',
  'sourceReportTemplates'
];

// Valid values
const VALID_FUNCTIONS = ['sales', 'marketing', 'customer-success'];
const VALID_LEVELS = ['executive', 'manager', 'individual'];

/**
 * Load JSON file safely
 */
function loadJson(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Get nested property from object using dot notation
 */
function getNestedProperty(obj, path) {
  return path.split('.').reduce((current, key) =>
    current && current[key] !== undefined ? current[key] : undefined, obj);
}

/**
 * Find all dashboard template files
 */
function findTemplateFiles() {
  const templates = [];
  const levels = ['executive', 'manager', 'individual'];

  for (const level of levels) {
    const levelDir = path.join(TEMPLATES_DIR, level);
    if (fs.existsSync(levelDir)) {
      const files = fs.readdirSync(levelDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        templates.push({
          path: path.join(levelDir, file),
          level,
          filename: file
        });
      }
    }
  }

  return templates;
}

/**
 * Validate template structure
 */
function validateStructure(template, filePath) {
  const errors = [];
  const warnings = [];

  // Check required fields
  for (const field of REQUIRED_FIELDS) {
    const value = getNestedProperty(template, field);
    if (value === undefined || value === null || value === '') {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Validate function
  if (template.templateMetadata?.function &&
      !VALID_FUNCTIONS.includes(template.templateMetadata.function)) {
    errors.push(`Invalid function: ${template.templateMetadata.function}. Must be one of: ${VALID_FUNCTIONS.join(', ')}`);
  }

  // Validate level
  if (template.templateMetadata?.level &&
      !VALID_LEVELS.includes(template.templateMetadata.level)) {
    errors.push(`Invalid level: ${template.templateMetadata.level}. Must be one of: ${VALID_LEVELS.join(', ')}`);
  }

  // Validate component count
  const components = template.dashboardLayout?.components || [];
  if (components.length === 0) {
    errors.push('Dashboard has no components');
  } else if (components.length > 12) {
    warnings.push(`Dashboard has ${components.length} components (recommended max: 12)`);
  }

  // Check component count matches metadata
  if (template.templateMetadata?.componentCount &&
      template.templateMetadata.componentCount !== components.length) {
    warnings.push(`componentCount (${template.templateMetadata.componentCount}) doesn't match actual components (${components.length})`);
  }

  // Validate components have required fields
  components.forEach((comp, idx) => {
    if (!comp.position) {
      errors.push(`Component ${idx + 1} missing position`);
    }
    if (!comp.type) {
      errors.push(`Component ${idx + 1} missing type`);
    }
    if (!comp.title) {
      warnings.push(`Component ${idx + 1} missing title`);
    }
  });

  // Check for duplicate templateIds
  const templateId = template.templateMetadata?.templateId;
  const filename = path.basename(filePath, '.json');
  if (templateId && templateId !== filename) {
    warnings.push(`templateId (${templateId}) doesn't match filename (${filename})`);
  }

  return { errors, warnings };
}

/**
 * Validate report references exist
 */
function validateReportReferences(template) {
  const errors = [];
  const warnings = [];
  const reports = template.sourceReportTemplates || [];

  for (const reportRef of reports) {
    // Report references are in format: category/template-name
    const reportPath = path.join(REPORTS_DIR, `${reportRef}.json`);
    if (!fs.existsSync(reportPath)) {
      errors.push(`Referenced report template not found: ${reportRef}`);
    }
  }

  // Check component sourceReport references
  const components = template.dashboardLayout?.components || [];
  for (const comp of components) {
    if (comp.sourceReport) {
      // sourceReport is just the template name without path
      // We need to find it in any report directory
      const found = findReportTemplate(comp.sourceReport);
      if (!found) {
        warnings.push(`Component "${comp.title}" references report "${comp.sourceReport}" which may not exist`);
      }
    }
  }

  return { errors, warnings };
}

/**
 * Find a report template by name in any category
 */
function findReportTemplate(name) {
  const categories = [
    'marketing',
    'customer-success',
    'sales',
    'sales-executive',
    'sales-managers',
    'sales-reps',
    'sales-leaders',
    'dashboards',
    'format-bases'
  ];
  for (const cat of categories) {
    const reportPath = path.join(REPORTS_DIR, cat, `${name}.json`);
    if (fs.existsSync(reportPath)) {
      return reportPath;
    }
  }
  return null;
}

/**
 * Validate against persona KPI contracts
 */
function validatePersonaKpi(template, personaContracts) {
  const errors = [];
  const warnings = [];

  if (!personaContracts || !personaContracts.personas) {
    return { errors: [], warnings: ['Could not load persona KPI contracts'] };
  }

  const audience = template.templateMetadata?.audience || '';
  const templateTags = template.templateMetadata?.tags || [];
  const components = template.dashboardLayout?.components || [];

  // Extract metric keywords from template
  const templateKeywords = new Set();

  // Add tags
  templateTags.forEach(tag => templateKeywords.add(tag.toLowerCase()));

  // Extract from component titles and metrics
  components.forEach(comp => {
    if (comp.title) {
      comp.title.toLowerCase().split(/\s+/).forEach(word => {
        if (word.length > 2) templateKeywords.add(word);
      });
    }
    if (comp.metric) {
      templateKeywords.add(comp.metric.toLowerCase());
    }
  });

  // Find matching personas
  for (const [personaKey, persona] of Object.entries(personaContracts.personas)) {
    // Check if this persona might be the target audience
    const audienceLower = audience.toLowerCase();
    const isMatch = persona.aliases.some(alias =>
      audienceLower.includes(alias.toLowerCase())
    );

    if (isMatch) {
      // Check for required metrics (using aliases)
      const metricAliases = personaContracts.metricAliases || {};

      for (const required of (persona.required || [])) {
        const aliases = metricAliases[required] || [required];
        const hasMetric = aliases.some(alias =>
          templateKeywords.has(alias.toLowerCase()) ||
          [...templateKeywords].some(kw => kw.includes(alias.toLowerCase().split(' ')[0]))
        );

        if (!hasMetric) {
          warnings.push(`Persona ${persona.label} expects metric "${required}" but not clearly present`);
        }
      }

      // Check for forbidden keywords
      for (const forbidden of (persona.neverKeywords || [])) {
        if (templateKeywords.has(forbidden.toLowerCase())) {
          warnings.push(`Persona ${persona.label} should not see "${forbidden}" keyword`);
        }
      }

      // Check detail table count
      const tables = components.filter(c => c.type === 'Table');
      if (tables.length > (persona.maxDetailTables || 6)) {
        warnings.push(`Too many tables (${tables.length}) for ${persona.label} persona (max: ${persona.maxDetailTables})`);
      }
    }
  }

  return { errors, warnings };
}

/**
 * Calculate quality score (simplified version)
 */
function calculateQualityScore(template) {
  let score = 100;
  const issues = [];

  const components = template.dashboardLayout?.components || [];

  // Component count (optimal 5-7)
  if (components.length < 3) {
    score -= 15;
    issues.push('Too few components');
  } else if (components.length > 10) {
    score -= 10;
    issues.push('Many components may reduce clarity');
  }

  // Has filters (recommended)
  if (!template.dashboardFilters || template.dashboardFilters.length === 0) {
    score -= 10;
    issues.push('No dashboard filters defined');
  }

  // Has KPI definitions
  if (!template.kpiDefinitions || Object.keys(template.kpiDefinitions).length === 0) {
    score -= 5;
    issues.push('No KPI definitions');
  }

  // Has org adaptation
  if (!template.orgAdaptation) {
    score -= 5;
    issues.push('No org adaptation configuration');
  } else if (!template.orgAdaptation.fieldFallbacks) {
    score -= 5;
    issues.push('No field fallbacks defined');
  }

  // Has deployment instructions
  if (!template.deploymentInstructions) {
    score -= 5;
    issues.push('No deployment instructions');
  }

  // Variety of chart types
  const chartTypes = new Set(components.map(c => c.type));
  if (chartTypes.size < 2) {
    score -= 5;
    issues.push('Limited chart type variety');
  }

  // Has tables for actionable data (for non-executive)
  const hasTable = components.some(c => c.type === 'Table');
  if (template.templateMetadata?.level !== 'executive' && !hasTable) {
    score -= 5;
    issues.push('Non-executive dashboard should have actionable tables');
  }

  return { score: Math.max(0, score), issues };
}

/**
 * Validate variation schema compliance
 */
function validateVariations(template, cpqMappings) {
  const errors = [];
  const warnings = [];
  const info = [];

  // Check if template has variations section
  if (!template.variations) {
    info.push('No variations section (optional)');
    return { errors, warnings, info, hasVariations: false };
  }

  const variations = template.variations;

  // Validate schemaVersion
  if (!variations.schemaVersion) {
    errors.push('variations.schemaVersion is required');
  } else if (variations.schemaVersion !== '1.0') {
    warnings.push(`Unexpected schemaVersion: ${variations.schemaVersion} (expected: 1.0)`);
  }

  // Validate baseTemplate flag
  if (typeof variations.baseTemplate !== 'boolean') {
    warnings.push('variations.baseTemplate should be a boolean');
  }

  // Validate availableVariations array
  if (!Array.isArray(variations.availableVariations)) {
    errors.push('variations.availableVariations must be an array');
  } else if (variations.availableVariations.length === 0) {
    warnings.push('variations.availableVariations is empty');
  }

  // Validate defaultVariation
  if (variations.defaultVariation &&
      !variations.availableVariations?.includes(variations.defaultVariation)) {
    warnings.push(`defaultVariation "${variations.defaultVariation}" not in availableVariations`);
  }

  // Validate variationOverrides
  if (!variations.variationOverrides) {
    errors.push('variations.variationOverrides is required');
  } else {
    // Each available variation should have an override
    for (const varName of (variations.availableVariations || [])) {
      if (!variations.variationOverrides[varName]) {
        errors.push(`Missing variationOverride for "${varName}"`);
      } else {
        const override = variations.variationOverrides[varName];

        // Validate override structure
        if (!override.description) {
          warnings.push(`Variation "${varName}" missing description`);
        }

        // Validate fieldSubstitutions (for cpq variation)
        if (varName === 'cpq' && override.fieldSubstitutions) {
          validateCpqFieldSubstitutions(override.fieldSubstitutions, cpqMappings, errors, warnings);
        }

        // Validate componentOverrides (for simple variation)
        if (override.componentOverrides) {
          if (override.componentOverrides.maxComponents &&
              typeof override.componentOverrides.maxComponents !== 'number') {
            errors.push(`Variation "${varName}": componentOverrides.maxComponents must be a number`);
          }
          if (override.componentOverrides.exclude &&
              !Array.isArray(override.componentOverrides.exclude)) {
            errors.push(`Variation "${varName}": componentOverrides.exclude must be an array`);
          }
        }

        // Validate metricAdjustments
        if (override.metricAdjustments) {
          for (const [metricName, adjustment] of Object.entries(override.metricAdjustments)) {
            if (adjustment.thresholds) {
              const thresholdKeys = Object.keys(adjustment.thresholds);
              const expectedKeys = ['green', 'yellow', 'red'];
              const missingKeys = expectedKeys.filter(k => !thresholdKeys.includes(k));
              if (missingKeys.length > 0) {
                warnings.push(`Variation "${varName}" metric "${metricName}" missing threshold keys: ${missingKeys.join(', ')}`);
              }
            }
          }
        }
      }
    }
  }

  // Validate orgAdaptation if present
  if (template.orgAdaptation) {
    validateOrgAdaptation(template.orgAdaptation, errors, warnings);
  }

  return {
    errors,
    warnings,
    info,
    hasVariations: true,
    variationCount: variations.availableVariations?.length || 0
  };
}

/**
 * Validate CPQ field substitutions against known mappings
 */
function validateCpqFieldSubstitutions(substitutions, cpqMappings, errors, warnings) {
  if (!cpqMappings || cpqMappings.error) {
    warnings.push('Could not load CPQ mappings for validation');
    return;
  }

  for (const [nativeField, cpqField] of Object.entries(substitutions)) {
    // Check if CPQ field follows SBQQ__ pattern
    if (!cpqField.startsWith('SBQQ__')) {
      warnings.push(`Field substitution "${nativeField}" → "${cpqField}" doesn't use SBQQ__ namespace`);
    }

    // Check if this is a known mapping
    let found = false;
    for (const [objType, mapping] of Object.entries(cpqMappings.objectMappings || {})) {
      if (mapping.fieldMappings?.[nativeField] === cpqField) {
        found = true;
        break;
      }
      if (mapping.cpqFieldMappings?.[nativeField]?.includes(cpqField)) {
        found = true;
        break;
      }
    }

    if (!found) {
      // Not an error, just info - could be a valid custom mapping
      // warnings.push(`Field substitution "${nativeField}" → "${cpqField}" not in standard CPQ mappings`);
    }
  }
}

/**
 * Validate orgAdaptation section
 */
function validateOrgAdaptation(orgAdaptation, errors, warnings) {
  // Required fields
  if (!Array.isArray(orgAdaptation.requiredFields)) {
    warnings.push('orgAdaptation.requiredFields should be an array');
  }

  // Adaptation strategy
  const validStrategies = ['graceful-degradation', 'strict', 'best-effort'];
  if (orgAdaptation.adaptationStrategy &&
      !validStrategies.includes(orgAdaptation.adaptationStrategy)) {
    warnings.push(`Unknown adaptationStrategy: ${orgAdaptation.adaptationStrategy}`);
  }

  // Minimum fidelity
  if (orgAdaptation.minimumFidelity !== undefined) {
    if (typeof orgAdaptation.minimumFidelity !== 'number' ||
        orgAdaptation.minimumFidelity < 0 || orgAdaptation.minimumFidelity > 1) {
      errors.push('orgAdaptation.minimumFidelity must be a number between 0 and 1');
    }
  }

  // Field fallbacks
  if (orgAdaptation.fieldFallbacks) {
    for (const [fieldName, fallback] of Object.entries(orgAdaptation.fieldFallbacks)) {
      // Should have patterns array
      if (!Array.isArray(fallback.patterns)) {
        warnings.push(`fieldFallback "${fieldName}" missing patterns array`);
      }

      // Should have dataType
      if (!fallback.dataType) {
        warnings.push(`fieldFallback "${fieldName}" missing dataType`);
      }

      // CPQ-aware fallbacks should have cpqPatterns
      if (fallback.namespaceAware && !fallback.cpqPatterns) {
        warnings.push(`fieldFallback "${fieldName}" is namespaceAware but missing cpqPatterns`);
      }
    }
  }

  // Data availability tiers
  if (orgAdaptation.dataAvailabilityTiers) {
    const tiers = orgAdaptation.dataAvailabilityTiers;
    const expectedTiers = ['complete', 'partial', 'minimal'];

    for (const tierName of expectedTiers) {
      if (!tiers[tierName]) {
        warnings.push(`orgAdaptation missing "${tierName}" data tier`);
      } else {
        const tier = tiers[tierName];
        if (tier.minimumFidelity === undefined) {
          warnings.push(`Data tier "${tierName}" missing minimumFidelity`);
        }
        if (!tier.components && !tier.enabledComponents) {
          warnings.push(`Data tier "${tierName}" should specify components or enabledComponents`);
        }
      }
    }
  }
}

/**
 * Validate registry variation support
 */
function validateRegistryVariationSupport(registry, errors, warnings) {
  // Check variationSupport section
  if (!registry.variationSupport) {
    warnings.push('Registry missing variationSupport section');
    return;
  }

  const vs = registry.variationSupport;

  if (!vs.enabled) {
    warnings.push('Variation support not enabled in registry');
  }

  if (!vs.schemaVersion) {
    warnings.push('Registry variationSupport missing schemaVersion');
  }

  if (!vs.defaultVariation) {
    warnings.push('Registry variationSupport missing defaultVariation');
  }

  if (!Array.isArray(vs.variationResolutionOrder)) {
    warnings.push('Registry variationSupport missing variationResolutionOrder');
  }

  // Check variationProfiles
  if (!registry.variationProfiles || Object.keys(registry.variationProfiles).length === 0) {
    warnings.push('Registry missing variationProfiles');
  } else {
    // Validate each profile has required properties
    for (const [profileName, profile] of Object.entries(registry.variationProfiles)) {
      if (!profile.description) {
        warnings.push(`Variation profile "${profileName}" missing description`);
      }
    }
  }

  // Check searchIndex has variations
  if (!registry.searchIndex?.variations) {
    warnings.push('Registry searchIndex missing variations section');
  } else {
    // Ensure key variations are indexed
    const expectedVariations = ['cpq', 'simple', 'enterprise', 'smb'];
    for (const variation of expectedVariations) {
      if (!registry.searchIndex.variations[variation]) {
        warnings.push(`Registry searchIndex.variations missing "${variation}" index`);
      }
    }
  }
}

/**
 * Validate registry against actual templates
 */
function validateRegistry(registry, templateFiles) {
  const errors = [];
  const warnings = [];

  // Check that registry lists all templates
  const registryTemplateIds = new Set();

  for (const [func, funcData] of Object.entries(registry.categories)) {
    for (const [level, templates] of Object.entries(funcData)) {
      if (Array.isArray(templates)) {
        templates.forEach(t => registryTemplateIds.add(t.templateId));
      }
    }
  }

  // Check each file is in registry
  for (const file of templateFiles) {
    const templateId = path.basename(file.filename, '.json');
    if (!registryTemplateIds.has(templateId)) {
      errors.push(`Template "${templateId}" not found in registry`);
    }
  }

  // Verify statistics
  const actualCounts = {
    sales: templateFiles.filter(t => {
      const template = loadJson(t.path);
      return template.templateMetadata?.function === 'sales';
    }).length,
    marketing: templateFiles.filter(t => {
      const template = loadJson(t.path);
      return template.templateMetadata?.function === 'marketing';
    }).length,
    'customer-success': templateFiles.filter(t => {
      const template = loadJson(t.path);
      return template.templateMetadata?.function === 'customer-success';
    }).length
  };

  for (const [func, count] of Object.entries(actualCounts)) {
    if (registry.statistics?.byFunction?.[func] !== count) {
      warnings.push(`Registry shows ${registry.statistics?.byFunction?.[func]} ${func} templates but found ${count}`);
    }
  }

  return { errors, warnings };
}

/**
 * Main validation runner
 */
function runValidation(options = {}) {
  const verbose = options.verbose || false;
  const targetTemplate = options.template || null;
  const includeVariations = options.includeVariations || false;
  const variationsOnly = options.variationsOnly || false;

  console.log('\n=== Dashboard Template Validation ===\n');
  if (includeVariations || variationsOnly) {
    console.log('  [Variation validation enabled]\n');
  }

  // Load configuration files
  const registry = loadJson(REGISTRY_PATH);
  const personaContracts = loadJson(PERSONA_KPI_PATH);
  const cpqMappings = loadJson(CPQ_MAPPINGS_PATH);

  if (registry.error) {
    console.error(`Error loading registry: ${registry.error}`);
    return { success: false, totalErrors: 1 };
  }

  // Find all template files
  let templateFiles = findTemplateFiles();

  if (targetTemplate) {
    templateFiles = templateFiles.filter(t =>
      path.basename(t.filename, '.json') === targetTemplate
    );
    if (templateFiles.length === 0) {
      console.error(`Template not found: ${targetTemplate}`);
      return { success: false, totalErrors: 1 };
    }
  }

  console.log(`Found ${templateFiles.length} dashboard templates\n`);

  let totalErrors = 0;
  let totalWarnings = 0;
  const results = [];

  // Validate each template
  for (const file of templateFiles) {
    const template = loadJson(file.path);
    const templateId = path.basename(file.filename, '.json');

    if (template.error) {
      console.log(`\n[ERROR] ${templateId}: Invalid JSON - ${template.error}`);
      totalErrors++;
      results.push({ templateId, valid: false, error: template.error });
      continue;
    }

    // Standard validations (skip if variationsOnly)
    let structureResult = { errors: [], warnings: [] };
    let reportResult = { errors: [], warnings: [] };
    let personaResult = { errors: [], warnings: [] };
    let qualityResult = { score: 100, issues: [] };

    if (!variationsOnly) {
      structureResult = validateStructure(template, file.path);
      reportResult = validateReportReferences(template);
      personaResult = validatePersonaKpi(template, personaContracts);
      qualityResult = calculateQualityScore(template);
    }

    // Variation validation (if enabled)
    let variationResult = { errors: [], warnings: [], info: [], hasVariations: false };
    if (includeVariations || variationsOnly) {
      variationResult = validateVariations(template, cpqMappings);
    }

    const errors = [
      ...structureResult.errors,
      ...reportResult.errors,
      ...personaResult.errors,
      ...variationResult.errors
    ];

    const warnings = [
      ...structureResult.warnings,
      ...reportResult.warnings,
      ...personaResult.warnings,
      ...variationResult.warnings,
      ...(qualityResult.score < 70 ? qualityResult.issues : [])
    ];

    totalErrors += errors.length;
    totalWarnings += warnings.length;

    const status = errors.length === 0 ?
      (qualityResult.score >= 70 ? 'PASS' : 'WARN') : 'FAIL';
    const statusIcon = status === 'PASS' ? '✓' : (status === 'WARN' ? '!' : '✗');

    // Build status line
    let statusLine = `[${statusIcon}] ${templateId} (${template.templateMetadata?.function || 'unknown'}/${file.level})`;
    if (!variationsOnly) {
      statusLine += ` - Quality: ${qualityResult.score}%`;
    }
    if (includeVariations || variationsOnly) {
      statusLine += variationResult.hasVariations
        ? ` - Variations: ${variationResult.variationCount}`
        : ' - No variations';
    }
    console.log(statusLine);

    if (verbose || errors.length > 0) {
      errors.forEach(e => console.log(`    ERROR: ${e}`));
    }
    if (verbose || (warnings.length > 0 && errors.length === 0)) {
      warnings.forEach(w => console.log(`    WARN: ${w}`));
    }
    if (verbose && variationResult.info.length > 0) {
      variationResult.info.forEach(i => console.log(`    INFO: ${i}`));
    }

    results.push({
      templateId,
      function: template.templateMetadata?.function,
      level: file.level,
      valid: errors.length === 0,
      qualityScore: qualityResult.score,
      hasVariations: variationResult.hasVariations,
      variationCount: variationResult.variationCount || 0,
      errors,
      warnings
    });
  }

  // Validate registry
  console.log('\n--- Registry Validation ---');
  const registryResult = validateRegistry(registry, templateFiles);
  registryResult.errors.forEach(e => {
    console.log(`[ERROR] Registry: ${e}`);
    totalErrors++;
  });
  registryResult.warnings.forEach(w => {
    console.log(`[WARN] Registry: ${w}`);
    totalWarnings++;
  });

  // Validate registry variation support (if enabled)
  if (includeVariations || variationsOnly) {
    console.log('\n--- Registry Variation Support ---');
    const registryVarErrors = [];
    const registryVarWarnings = [];
    validateRegistryVariationSupport(registry, registryVarErrors, registryVarWarnings);

    registryVarErrors.forEach(e => {
      console.log(`[ERROR] Registry Variations: ${e}`);
      totalErrors++;
    });
    registryVarWarnings.forEach(w => {
      console.log(`[WARN] Registry Variations: ${w}`);
      totalWarnings++;
    });

    if (registryVarErrors.length === 0 && registryVarWarnings.length === 0) {
      console.log('[✓] Registry variation support is properly configured');
    }
  }

  // Summary
  console.log('\n=== Validation Summary ===');
  console.log(`Templates: ${templateFiles.length}`);
  console.log(`Passed: ${results.filter(r => r.valid && r.qualityScore >= 70).length}`);
  console.log(`Warnings: ${results.filter(r => r.valid && r.qualityScore < 70).length}`);
  console.log(`Failed: ${results.filter(r => !r.valid).length}`);
  console.log(`Total Errors: ${totalErrors}`);
  console.log(`Total Warnings: ${totalWarnings}`);

  // Quality breakdown
  if (!variationsOnly) {
    console.log('\n--- Quality Scores ---');
    const byFunction = {};
    results.forEach(r => {
      const func = r.function || 'unknown';
      if (!byFunction[func]) byFunction[func] = [];
      byFunction[func].push(r.qualityScore);
    });

    for (const [func, scores] of Object.entries(byFunction)) {
      const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      console.log(`  ${func}: ${avg}% avg (${scores.length} templates)`);
    }
  }

  // Variation stats
  if (includeVariations || variationsOnly) {
    console.log('\n--- Variation Coverage ---');
    const withVariations = results.filter(r => r.hasVariations);
    const withoutVariations = results.filter(r => !r.hasVariations);

    console.log(`  Templates with variations: ${withVariations.length} (${Math.round(withVariations.length / results.length * 100)}%)`);
    console.log(`  Templates without variations: ${withoutVariations.length}`);

    if (withVariations.length > 0) {
      const totalVariations = withVariations.reduce((sum, r) => sum + r.variationCount, 0);
      const avgVariations = (totalVariations / withVariations.length).toFixed(1);
      console.log(`  Total variation definitions: ${totalVariations}`);
      console.log(`  Average variations per template: ${avgVariations}`);
    }

    // List templates with variations
    if (verbose && withVariations.length > 0) {
      console.log('\n  Templates with variations:');
      withVariations.forEach(r => {
        console.log(`    - ${r.templateId}: ${r.variationCount} variations`);
      });
    }
  }

  const success = totalErrors === 0;
  console.log(`\n${success ? '✓ All templates valid!' : '✗ Validation failed - fix errors above'}\n`);

  return { success, totalErrors, totalWarnings, results };
}

// CLI handling
if (require.main === module) {
  const args = process.argv.slice(2);

  // Show help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Dashboard Template Validation Script

Usage:
  node scripts/test-dashboard-templates.js [options]

Options:
  --verbose, -v          Show detailed output
  --template <id>        Validate specific template
  --include-variations   Include variation schema validation
  --variations-only      Only validate variations (skip other checks)
  --help, -h            Show this help message

Examples:
  node scripts/test-dashboard-templates.js
  node scripts/test-dashboard-templates.js --verbose
  node scripts/test-dashboard-templates.js --template revenue-performance
  node scripts/test-dashboard-templates.js --include-variations
  node scripts/test-dashboard-templates.js --variations-only --verbose
`);
    process.exit(0);
  }

  const options = {
    verbose: args.includes('--verbose') || args.includes('-v'),
    template: null,
    includeVariations: args.includes('--include-variations'),
    variationsOnly: args.includes('--variations-only')
  };

  const templateIdx = args.indexOf('--template');
  if (templateIdx !== -1 && args[templateIdx + 1]) {
    options.template = args[templateIdx + 1];
  }

  const result = runValidation(options);
  process.exit(result.success ? 0 : 1);
}

module.exports = {
  runValidation,
  validateStructure,
  validatePersonaKpi,
  calculateQualityScore,
  validateVariations,
  validateOrgAdaptation
};
