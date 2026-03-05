/**
 * Validation Rule Auditor - Comprehensive Validation Rules Analysis
 *
 * Purpose: Extracts, analyzes, and audits all validation rules across Salesforce objects.
 * Detects redundancy, obsolete logic, consolidation opportunities, and provides
 * optimization recommendations.
 *
 * Capabilities:
 * - Extract all validation rules with formulas
 * - Detect redundant rules (same field, overlapping conditions)
 * - Identify obsolete rules (references to deleted fields)
 * - Propose consolidation opportunities
 * - Calculate complexity scores
 * - Generate remediation plans
 *
 * @author Automation Audit System v2.0
 * @version 2.0.0
 * @date 2025-10-09
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const xml2js = require('xml2js');
const QueryRetryUtility = require('./query-retry-utility');
const MetadataCapabilityChecker = require('./metadata-capability-checker');
const AuditErrorLogger = require('./audit-error-logger');
const { RobustCSVParser } = require('./csv-schema-validator');

class ValidationRuleAuditor {
  constructor(orgAlias, options = {}) {
    this.orgAlias = orgAlias;
    this.validationRules = [];
    this.objects = [];
    this.redundancyPatterns = [];
    this.consolidationOpportunities = [];
    this.obsoleteRules = [];
    this.retryUtil = new QueryRetryUtility();
    this.entityDefinitionCache = null; // Cache for EntityDefinitionId → QualifiedApiName mapping
    this.capabilityChecker = options.capabilityChecker || new MetadataCapabilityChecker();
    this.errorLogger = options.errorLogger || new AuditErrorLogger();
    this.formulaCache = new Map(); // Cache for retrieved formulas: ruleName -> formula
    this.tempDir = path.join(os.tmpdir(), `vr-audit-${Date.now()}`);
    this.parser = new xml2js.Parser();
    this.csvParser = new RobustCSVParser();
  }

  /**
   * Execute full validation rule audit
   * @returns {Object} Complete audit results
   */
  async audit() {
    console.log(`🔍 Starting validation rule audit for org: ${this.orgAlias}\n`);

    try {
      // Phase 1: Discover all objects with validation rules
      console.log('Phase 1: Discovering objects with validation rules...');
      await this.discoverObjects();
      console.log(`✓ Found ${this.objects.length} objects with validation rules\n`);

      // Phase 2: Extract all validation rules
      console.log('Phase 2: Extracting validation rules...');
      await this.extractValidationRules();
      console.log(`✓ Extracted ${this.validationRules.length} validation rules\n`);

      // Phase 3: Detect redundancy
      console.log('Phase 3: Detecting redundancy...');
      this.detectRedundancy();
      console.log(`✓ Found ${this.redundancyPatterns.length} redundancy patterns\n`);

      // Phase 4: Identify consolidation opportunities
      console.log('Phase 4: Identifying consolidation opportunities...');
      this.identifyConsolidation();
      console.log(`✓ Found ${this.consolidationOpportunities.length} consolidation opportunities\n`);

      // Phase 5: Detect obsolete rules
      console.log('Phase 5: Detecting obsolete rules...');
      this.detectObsoleteRules();
      console.log(`✓ Found ${this.obsoleteRules.length} potentially obsolete rules\n`);

      console.log('✅ Validation rule audit complete!\n');

      return {
        validationRules: this.validationRules,
        redundancyPatterns: this.redundancyPatterns,
        consolidationOpportunities: this.consolidationOpportunities,
        obsoleteRules: this.obsoleteRules,
        summary: this.generateSummary()
      };

    } catch (error) {
      console.error('❌ Validation rule audit failed:', error.message);
      throw error;
    }
  }

  /**
   * Discover objects that have validation rules
   * NOTE: GROUP BY on ValidationRule via Tooling API causes UNKNOWN_EXCEPTION
   * NOTE: OFFSET is not supported on ValidationRule queries
   * NOTE: EntityDefinition.QualifiedApiName relationship causes UNKNOWN_EXCEPTION in some orgs
   * Workaround: Query EntityDefinitionId, then resolve separately with high LIMIT
   */
  async discoverObjects() {
    // Use EntityDefinitionId instead of EntityDefinition.QualifiedApiName to avoid relationship join error
    const query = "SELECT EntityDefinitionId FROM ValidationRule WHERE Active = true LIMIT 500";

    try {
      console.log('Executing discovery query...');

      // Wrap in retry logic to handle transient errors
      const result = await this.retryUtil.queryWithRetry(
        () => this.executeQuery(query),
        { maxRetries: 3, baseDelay: 1000 }
      );

      console.log('Query executed, parsing result...');
      const data = JSON.parse(result).result;
      console.log(`Query returned ${data.records.length} records (totalSize: ${data.totalSize})`);

      // Resolve EntityDefinitionId → Object Name
      await this.resolveEntityDefinitionIds();

      // Group by object in JavaScript
      const objectCounts = {};
      data.records.forEach(r => {
        const entityDefId = r.EntityDefinitionId;
        const obj = this.entityDefinitionCache?.[entityDefId] || entityDefId;
        objectCounts[obj] = (objectCounts[obj] || 0) + 1;
      });

      this.objects = Object.entries(objectCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([object, ruleCount]) => ({ object, ruleCount }));

      console.log(`Grouped into ${this.objects.length} objects`);

    } catch (error) {
      console.error('Error discovering objects:', error.message);
      console.error(error.stack);
      this.objects = [];
    }
  }

  /**
   * Extract all validation rules from org
   * NOTE: OFFSET is not supported on ValidationRule queries
   * NOTE: EntityDefinition.QualifiedApiName relationship causes UNKNOWN_EXCEPTION in some orgs
   * Workaround: Query EntityDefinitionId, then resolve separately with high LIMIT
   */
  async extractValidationRules() {
    // Use EntityDefinitionId instead of EntityDefinition.QualifiedApiName to avoid relationship join error
    const query = `
      SELECT
        Id,
        ValidationName,
        EntityDefinitionId,
        Active,
        Description,
        ErrorDisplayField,
        ErrorMessage,
        LastModifiedDate,
        LastModifiedBy.Name,
        CreatedDate
      FROM ValidationRule
      WHERE Active = true
      ORDER BY ValidationName
      LIMIT 500
    `;

    try {
      console.log('Extracting validation rules...');

      // Wrap in retry logic to handle transient errors
      const result = await this.retryUtil.queryWithRetry(
        () => this.executeQuery(query),
        { maxRetries: 3, baseDelay: 1000 }
      );

      console.log('Extraction query executed successfully');
      const rules = JSON.parse(result).result.records;

      // Resolve EntityDefinitionId → Object Name (if not already cached)
      if (!this.entityDefinitionCache) {
        await this.resolveEntityDefinitionIds();
      }

      // Retrieve formulas via Tooling API Metadata field (individual queries)
      console.log(`🔍 Retrieving formulas for ${rules.length} validation rules via Tooling API...`);
      const formulaPromises = rules.map(rule => this.getFormulaViaToolingAPI(rule.Id));
      const formulas = await Promise.all(formulaPromises);

      // Create formula map for quick lookup
      const formulaMap = new Map();
      rules.forEach((rule, index) => {
        formulaMap.set(rule.Id, formulas[index]);
      });

      console.log(`✓ Formula retrieval complete\n`);

      // Build validation rules with formulas
      this.validationRules = rules.map(rule => {
        const objectName = this.entityDefinitionCache?.[rule.EntityDefinitionId] || rule.EntityDefinitionId;
        const formula = formulaMap.get(rule.Id) || '[Retrieval Failed]';

        return {
          id: rule.Id,
          name: rule.ValidationName,
          object: objectName,
          active: rule.Active,
          description: rule.Description || '',
          errorField: rule.ErrorDisplayField || '',
          errorMessage: rule.ErrorMessage || '',
          formula: formula,
          lastModified: rule.LastModifiedDate,
          modifiedBy: rule.LastModifiedBy?.Name || 'Unknown',
          created: rule.CreatedDate,
          complexity: this.calculateComplexity(formula),
          fieldsReferenced: this.extractFieldReferences(formula)
        };
      });

    } catch (error) {
      console.error('Error extracting validation rules:', error.message);

      // Log structured error
      this.errorLogger.log({
        component: 'ValidationRules',
        error,
        fallback: 'Partial recovery - EntityDefinitionId resolution',
        context: { phase: 'extraction', ruleCount: rules?.length || 0 }
      });

      this.validationRules = [];
    }
  }

  /**
   * Resolve EntityDefinitionId → QualifiedApiName mapping
   * Queries EntityDefinition object separately to avoid relationship join errors in ValidationRule queries
   * Results are cached for reuse across discovery and extraction phases
   */
  async resolveEntityDefinitionIds() {
    // Skip if already cached
    if (this.entityDefinitionCache) {
      console.log('Using cached EntityDefinition mappings');
      return;
    }

    const query = "SELECT DurableId, QualifiedApiName FROM EntityDefinition WHERE IsCustomizable = true LIMIT 1000";

    try {
      console.log('Resolving EntityDefinitionId → Object Name mappings...');

      // Wrap in retry logic to handle transient errors
      const result = await this.retryUtil.queryWithRetry(
        () => this.executeQuery(query),
        { maxRetries: 3, baseDelay: 1000 }
      );

      const data = JSON.parse(result).result;
      console.log(`Resolved ${data.records.length} object definitions`);

      // Build cache: EntityDefinitionId → QualifiedApiName
      this.entityDefinitionCache = {};
      data.records.forEach(r => {
        this.entityDefinitionCache[r.DurableId] = r.QualifiedApiName;
      });

      console.log(`✓ EntityDefinition cache built with ${Object.keys(this.entityDefinitionCache).length} entries`);

    } catch (error) {
      console.warn('⚠️  Could not resolve EntityDefinition mappings:', error.message);
      console.warn('   Validation rules will show EntityDefinitionId instead of object names');
      this.entityDefinitionCache = {}; // Empty cache to prevent repeated queries
    }
  }

  /**
   * Bulk retrieve validation rule formulas via Metadata API
   * Retrieves all validation rules for specified objects at once
   * @param {Array<string>} objectNames - Array of object API names
   * @returns {Promise<void>} Populates formulaCache
   */
  async bulkRetrieveFormulas(objectNames) {
    console.log(`📦 Bulk retrieving formulas for ${objectNames.length} object(s)...`);

    const uniqueObjects = [...new Set(objectNames)];
    let successCount = 0;
    let failureCount = 0;

    for (const objectName of uniqueObjects) {
      try {
        // Create temp directory for this object
        const outputDir = path.join(this.tempDir, objectName);
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }

        // Retrieve validation rules for this object
        const cmd = `sf project retrieve start --metadata "ValidationRule:${objectName}.*" --target-org ${this.orgAlias} --output-dir "${outputDir}" --wait 10 2>&1`;

        try {
          execSync(cmd, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
        } catch (retrieveError) {
          // Check if this is a "no components found" error (not a real error)
          const errorMsg = retrieveError.message || '';
          if (errorMsg.includes('No source-backed components')) {
            console.log(`   ⚠️  ${objectName}: No validation rules found via metadata retrieve`);
            continue;
          }
          throw retrieveError;
        }

        // Parse retrieved XML files
        const rulesDir = path.join(outputDir, 'force-app', 'main', 'default', 'objects', objectName, 'validationRules');

        if (fs.existsSync(rulesDir)) {
          const files = fs.readdirSync(rulesDir);

          for (const file of files) {
            if (file.endsWith('.validationRule-meta.xml')) {
              const filePath = path.join(rulesDir, file);
              const content = fs.readFileSync(filePath, 'utf8');

              try {
                const parsed = await this.parser.parseStringPromise(content);

                if (parsed.ValidationRule) {
                  const rule = parsed.ValidationRule;
                  const ruleName = path.basename(file, '.validationRule-meta.xml');
                  const formula = rule.errorConditionFormula?.[0] || '';

                  // Store in cache: objectName.ruleName -> formula
                  const cacheKey = `${objectName}.${ruleName}`;
                  this.formulaCache.set(cacheKey, formula);
                }
              } catch (parseError) {
                console.warn(`   ⚠️  Failed to parse ${file}:`, parseError.message);
                failureCount++;
              }
            }
          }

          successCount++;
        }

      } catch (error) {
        console.warn(`   ⚠️  Failed to retrieve formulas for ${objectName}:`, error.message);
        failureCount++;
      }
    }

    console.log(`✓ Formula retrieval complete: ${successCount} objects succeeded, ${failureCount} failed\n`);

    // Cleanup temp directory
    try {
      if (fs.existsSync(this.tempDir)) {
        fs.rmSync(this.tempDir, { recursive: true, force: true });
      }
    } catch (cleanupError) {
      console.warn('⚠️  Failed to cleanup temp directory:', cleanupError.message);
    }
  }

  /**
   * Get validation rule formula via Tooling API Metadata field
   * @param {string} ruleId - Validation rule Id
   * @returns {Promise<string>} Formula text or failure message
   */
  async getFormulaViaToolingAPI(ruleId) {
    const query = `SELECT Id, Metadata FROM ValidationRule WHERE Id='${ruleId}'`;

    try {
      const result = await this.retryUtil.queryWithRetry(
        () => this.executeQuery(query),
        { maxRetries: 2, baseDelay: 500 }
      );

      const data = JSON.parse(result).result;
      if (data.records && data.records.length > 0) {
        const metadata = data.records[0].Metadata;
        return metadata?.errorConditionFormula || '[Empty Formula]';
      }

      return '[Not Found]';
    } catch (error) {
      // Suppress individual errors but track them
      return '[Retrieval Failed]';
    }
  }

  /**
   * Calculate formula complexity score
   * @param {string} formula - Validation formula
   * @returns {number} Complexity score (1-10)
   */
  calculateComplexity(formula) {
    if (!formula || formula.includes('[Formula not retrieved]')) {
      return 5; // Unknown complexity
    }

    let score = 0;

    // Count operators
    const operators = formula.match(/&&|\|\||NOT|ISBLANK|ISNULL|ISPICKVAL|OR|AND/g) || [];
    score += operators.length;

    // Count field references
    const fields = formula.match(/\b[A-Z][a-zA-Z0-9_]*__c\b|\b[A-Z][a-zA-Z0-9_]*\b/g) || [];
    score += fields.length * 0.5;

    // Count nested functions
    const functions = formula.match(/\(/g) || [];
    score += functions.length * 0.3;

    // Count SOQL-like patterns (relationship queries)
    if (formula.includes('.')) {
      score += 2;
    }

    return Math.min(Math.round(score), 10);
  }

  /**
   * Extract field references from formula
   * @param {string} formula - Validation formula
   * @returns {Array} Field names referenced
   */
  extractFieldReferences(formula) {
    if (!formula || formula.includes('[Formula not retrieved]')) {
      return [];
    }

    // Extract field patterns (simplified)
    const fieldPattern = /\b([A-Z][a-zA-Z0-9_]*(?:__c)?)\b/g;
    const matches = formula.match(fieldPattern) || [];

    // Filter out formula functions
    const functions = ['AND', 'OR', 'NOT', 'ISBLANK', 'ISNULL', 'ISPICKVAL', 'TEXT', 'IF', 'CASE'];
    return [...new Set(matches.filter(f => !functions.includes(f)))];
  }

  /**
   * Detect redundancy patterns across validation rules
   */
  detectRedundancy() {
    // Group rules by object
    const rulesByObject = {};
    this.validationRules.forEach(rule => {
      if (!rulesByObject[rule.object]) {
        rulesByObject[rule.object] = [];
      }
      rulesByObject[rule.object].push(rule);
    });

    // Detect redundancy within each object
    Object.entries(rulesByObject).forEach(([object, rules]) => {
      // Pattern 1: Multiple rules checking same field
      const fieldUsage = {};
      rules.forEach(rule => {
        rule.fieldsReferenced.forEach(field => {
          if (!fieldUsage[field]) {
            fieldUsage[field] = [];
          }
          fieldUsage[field].push(rule.name);
        });
      });

      Object.entries(fieldUsage).forEach(([field, ruleNames]) => {
        if (ruleNames.length > 2) {
          this.redundancyPatterns.push({
            type: 'MULTIPLE_RULES_SAME_FIELD',
            object: object,
            field: field,
            rules: ruleNames,
            count: ruleNames.length,
            severity: 'MEDIUM',
            recommendation: `Consider consolidating ${ruleNames.length} rules checking ${field} into a single rule with combined logic`
          });
        }
      });

      // Pattern 2: Similar error messages (potential duplicates)
      const errorMessages = {};
      rules.forEach(rule => {
        const normalized = rule.errorMessage.toLowerCase().trim();
        if (!errorMessages[normalized]) {
          errorMessages[normalized] = [];
        }
        errorMessages[normalized].push(rule.name);
      });

      Object.entries(errorMessages).forEach(([msg, ruleNames]) => {
        if (ruleNames.length > 1) {
          this.redundancyPatterns.push({
            type: 'DUPLICATE_ERROR_MESSAGES',
            object: object,
            errorMessage: msg.substring(0, 50) + '...',
            rules: ruleNames,
            count: ruleNames.length,
            severity: 'LOW',
            recommendation: `Rules have identical error messages - verify they serve different purposes`
          });
        }
      });

      // Pattern 3: High rule count per object
      if (rules.length > 10) {
        this.redundancyPatterns.push({
          type: 'HIGH_RULE_COUNT',
          object: object,
          count: rules.length,
          severity: 'MEDIUM',
          recommendation: `${object} has ${rules.length} validation rules. Review for consolidation opportunities to improve maintainability.`
        });
      }
    });
  }

  /**
   * Identify consolidation opportunities
   */
  identifyConsolidation() {
    // Group rules by object
    const rulesByObject = {};
    this.validationRules.forEach(rule => {
      if (!rulesByObject[rule.object]) {
        rulesByObject[rule.object] = [];
      }
      rulesByObject[rule.object].push(rule);
    });

    Object.entries(rulesByObject).forEach(([object, rules]) => {
      // Opportunity 1: Simple rules that could be one complex rule
      const simpleRules = rules.filter(r => r.complexity <= 3);
      if (simpleRules.length >= 3) {
        this.consolidationOpportunities.push({
          type: 'SIMPLE_RULE_CONSOLIDATION',
          object: object,
          rules: simpleRules.map(r => r.name),
          count: simpleRules.length,
          priority: 'MEDIUM',
          estimatedTime: '2-4 hours',
          recommendation: `Consolidate ${simpleRules.length} simple validation rules into fewer complex rules`,
          rationale: 'Reduces rule count, improves performance, easier maintenance'
        });
      }

      // Opportunity 2: Rules checking overlapping fields
      const fieldOverlap = this.findFieldOverlap(rules);
      fieldOverlap.forEach(overlap => {
        if (overlap.rules.length >= 2) {
          this.consolidationOpportunities.push({
            type: 'FIELD_OVERLAP_CONSOLIDATION',
            object: object,
            fields: overlap.fields,
            rules: overlap.rules,
            count: overlap.rules.length,
            priority: 'LOW',
            estimatedTime: '1-2 hours',
            recommendation: `Consider consolidating rules with overlapping field references`,
            rationale: 'Related validations in single rule improves clarity'
          });
        }
      });

      // Opportunity 3: Very old rules (>2 years) - may be obsolete
      const now = new Date();
      const twoYearsAgo = new Date(now.setFullYear(now.getFullYear() - 2));
      const oldRules = rules.filter(r => new Date(r.lastModified) < twoYearsAgo);

      if (oldRules.length > 0) {
        this.consolidationOpportunities.push({
          type: 'OLD_RULES_REVIEW',
          object: object,
          rules: oldRules.map(r => r.name),
          count: oldRules.length,
          priority: 'LOW',
          estimatedTime: '1-2 hours',
          recommendation: `Review ${oldRules.length} validation rules not modified in 2+ years`,
          rationale: 'May contain obsolete business logic or reference deleted fields'
        });
      }
    });
  }

  /**
   * Find field overlap between rules
   * @param {Array} rules - Validation rules
   * @returns {Array} Field overlap patterns
   */
  findFieldOverlap(rules) {
    const overlaps = [];

    // Find rules that share 2+ fields
    for (let i = 0; i < rules.length - 1; i++) {
      for (let j = i + 1; j < rules.length; j++) {
        const commonFields = rules[i].fieldsReferenced.filter(f =>
          rules[j].fieldsReferenced.includes(f)
        );

        if (commonFields.length >= 2) {
          overlaps.push({
            fields: commonFields,
            rules: [rules[i].name, rules[j].name]
          });
        }
      }
    }

    return overlaps;
  }

  /**
   * Detect potentially obsolete rules
   */
  detectObsoleteRules() {
    this.validationRules.forEach(rule => {
      const obsoleteIndicators = [];

      // Indicator 1: No description
      if (!rule.description || rule.description.trim() === '') {
        obsoleteIndicators.push('No description provided - purpose unclear');
      }

      // Indicator 2: Very high complexity (>8) - may be outdated complex logic
      if (rule.complexity > 8) {
        obsoleteIndicators.push(`High complexity (${rule.complexity}/10) - consider simplification`);
      }

      // Indicator 3: Not modified in 3+ years
      const threeYearsAgo = new Date();
      threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
      if (new Date(rule.lastModified) < threeYearsAgo) {
        obsoleteIndicators.push('Not modified in 3+ years - may be obsolete');
      }

      // Indicator 4: References potentially deleted fields (heuristic)
      const suspiciousFields = rule.fieldsReferenced.filter(f =>
        f.includes('Old') || f.includes('Legacy') || f.includes('Deprecated')
      );
      if (suspiciousFields.length > 0) {
        obsoleteIndicators.push(`References suspicious fields: ${suspiciousFields.join(', ')}`);
      }

      if (obsoleteIndicators.length >= 2) {
        this.obsoleteRules.push({
          rule: rule.name,
          object: rule.object,
          indicators: obsoleteIndicators,
          lastModified: rule.lastModified,
          modifiedBy: rule.modifiedBy,
          recommendation: 'Review with business stakeholders to determine if still needed',
          action: obsoleteIndicators.length >= 3 ? 'DEACTIVATE_CANDIDATE' : 'REVIEW'
        });
      }
    });
  }

  /**
   * Generate summary statistics
   * @returns {Object} Summary data
   */
  generateSummary() {
    const totalRules = this.validationRules.length;
    const activeRules = this.validationRules.filter(r => r.active).length;

    // Calculate average complexity
    const avgComplexity = this.validationRules.reduce((sum, r) => sum + r.complexity, 0) / totalRules;

    // Rules by object count
    const rulesByObject = {};
    this.validationRules.forEach(r => {
      rulesByObject[r.object] = (rulesByObject[r.object] || 0) + 1;
    });

    const topObjects = Object.entries(rulesByObject)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    return {
      totalRules,
      activeRules,
      objectsWithRules: Object.keys(rulesByObject).length,
      avgComplexity: Math.round(avgComplexity * 10) / 10,
      redundancyPatterns: this.redundancyPatterns.length,
      consolidationOpportunities: this.consolidationOpportunities.length,
      obsoleteRules: this.obsoleteRules.length,
      topObjects: topObjects.map(([obj, count]) => ({ object: obj, ruleCount: count })),
      potentialSavings: {
        rulesCanConsolidate: this.consolidationOpportunities.reduce((sum, o) => sum + (o.count || 0), 0),
        estimatedHours: this.consolidationOpportunities.reduce((sum, o) => {
          const match = o.estimatedTime.match(/(\d+)-(\d+)/);
          return sum + (match ? parseInt(match[1]) : 0);
        }, 0)
      }
    };
  }

  /**
   * Execute SOQL query
   * @param {string} query - SOQL query
   * @returns {string} JSON result
   */
  executeQuery(query) {
    const sanitizedQuery = query.replace(/\s+/g, ' ').trim();
    const cmd = `sf data query --query "${sanitizedQuery}" --use-tooling-api --target-org ${this.orgAlias} --json`;

    try {
      return execSync(cmd, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
    } catch (error) {
      // Enhanced error logging
      console.error('Query execution failed:');
      console.error('Command:', cmd);
      console.error('Error Code:', error.status);
      console.error('STDERR:', error.stderr?.toString() || 'No stderr');
      console.error('STDOUT:', error.stdout?.toString() || 'No stdout');
      throw new Error(`Query failed: ${error.message}`);
    }
  }

  /**
   * Export audit results to CSV
   * @param {string} outputPath - Output directory
   */
  exportToCSV(outputPath) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];

    // Export validation rules with formula and errorField columns
    const rulesCSV = this.generateCSV(this.validationRules, [
      'name', 'object', 'active', 'formula', 'errorField', 'complexity', 'errorMessage', 'lastModified', 'modifiedBy'
    ]);
    fs.writeFileSync(
      path.join(outputPath, `validation-rules-${timestamp}.csv`),
      rulesCSV
    );

    // Export redundancy patterns
    const redundancyCSV = this.generateCSV(this.redundancyPatterns, [
      'type', 'object', 'severity', 'count', 'recommendation'
    ]);
    fs.writeFileSync(
      path.join(outputPath, `validation-redundancy-${timestamp}.csv`),
      redundancyCSV
    );

    // Export consolidation opportunities
    const consolidationCSV = this.generateCSV(this.consolidationOpportunities, [
      'type', 'object', 'priority', 'count', 'estimatedTime', 'recommendation'
    ]);
    fs.writeFileSync(
      path.join(outputPath, `validation-consolidation-${timestamp}.csv`),
      consolidationCSV
    );

    // Export obsolete rules
    if (this.obsoleteRules.length > 0) {
      const obsoleteCSV = this.generateCSV(this.obsoleteRules, [
        'rule', 'object', 'lastModified', 'action', 'recommendation'
      ]);
      fs.writeFileSync(
        path.join(outputPath, `validation-obsolete-${timestamp}.csv`),
        obsoleteCSV
      );
    }

    console.log(`✓ CSV files exported to ${outputPath}`);
  }

  /**
   * Generate CSV from data array
   * @param {Array} data - Data array
   * @param {Array} columns - Column names
   * @returns {string} CSV content
   */
  generateCSV(data, columns) {
    // Convert data to object-based rows with proper column names
    const rows = data.map(item => {
      const row = {};
      columns.forEach(col => {
        let value = item[col];

        // Handle arrays (join with semicolon)
        if (Array.isArray(value)) {
          value = value.join('; ');
        }

        // Handle objects (stringify)
        if (typeof value === 'object' && value !== null) {
          value = JSON.stringify(value);
        }

        // Convert column name to Title Case for header
        const headerName = col.charAt(0).toUpperCase() + col.slice(1);
        row[headerName] = value || '';
      });
      return row;
    });

    return this.csvParser.generate(rows);
  }

  /**
   * Generate summary report
   * @returns {string} Markdown report
   */
  generateSummaryReport() {
    const summary = this.generateSummary();

    let report = `# Validation Rule Audit Summary\n\n`;
    report += `**Org**: ${this.orgAlias}\n`;
    report += `**Date**: ${new Date().toISOString().split('T')[0]}\n\n`;

    report += `## Overview\n\n`;
    report += `- **Total Validation Rules**: ${summary.totalRules}\n`;
    report += `- **Objects with Rules**: ${summary.objectsWithRules}\n`;
    report += `- **Average Complexity**: ${summary.avgComplexity}/10\n`;
    report += `- **Redundancy Patterns**: ${summary.redundancyPatterns}\n`;
    report += `- **Consolidation Opportunities**: ${summary.consolidationOpportunities}\n`;
    report += `- **Potentially Obsolete Rules**: ${summary.obsoleteRules}\n\n`;

    report += `## Potential Savings\n\n`;
    report += `- **Rules Can Consolidate**: ${summary.potentialSavings.rulesCanConsolidate}\n`;
    report += `- **Estimated Effort**: ${summary.potentialSavings.estimatedHours}+ hours\n\n`;

    report += `## Top 10 Objects by Rule Count\n\n`;
    summary.topObjects.forEach(({ object, ruleCount }) => {
      report += `- **${object}**: ${ruleCount} rules\n`;
    });

    report += `\n## Key Findings\n\n`;

    if (summary.redundancyPatterns > 0) {
      report += `⚠️ **${summary.redundancyPatterns} redundancy patterns detected** - multiple rules checking same fields or logic\n\n`;
    }

    if (summary.consolidationOpportunities > 0) {
      report += `💡 **${summary.consolidationOpportunities} consolidation opportunities** - can reduce rule count and improve maintainability\n\n`;
    }

    if (summary.obsoleteRules > 0) {
      report += `🗑️ **${summary.obsoleteRules} potentially obsolete rules** - not modified in 3+ years or referencing deprecated fields\n\n`;
    }

    if (summary.avgComplexity > 7) {
      report += `⚠️ **High average complexity (${summary.avgComplexity}/10)** - rules may be difficult to maintain\n\n`;
    }

    return report;
  }
}

// CLI Usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('Usage: node validation-rule-auditor.js <org-alias> [output-dir]');
    process.exit(1);
  }

  const orgAlias = args[0];
  const outputDir = args[1] || process.cwd();

  (async () => {
    try {
      const auditor = new ValidationRuleAuditor(orgAlias);
      const results = await auditor.audit();

      // Export to CSV
      auditor.exportToCSV(outputDir);

      // Generate summary report
      const summaryReport = auditor.generateSummaryReport();
      fs.writeFileSync(
        path.join(outputDir, 'validation-rules-audit-summary.md'),
        summaryReport
      );

      // Export full JSON
      fs.writeFileSync(
        path.join(outputDir, 'validation-rules-audit.json'),
        JSON.stringify(results, null, 2)
      );

      console.log('\n' + summaryReport);
      console.log(`\n✅ Audit complete! Files saved to: ${outputDir}`);

    } catch (error) {
      console.error('\n❌ Audit failed:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = ValidationRuleAuditor;
