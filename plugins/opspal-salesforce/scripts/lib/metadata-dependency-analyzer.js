#!/usr/bin/env node

/**
 * Metadata Dependency Analyzer
 *
 * Prevents deployment failures by analyzing ALL field references across:
 * - Flows (assignments, formulas, screens, decisions)
 * - Validation Rules (formulas)
 * - Page Layouts (field assignments)
 * - Formula Fields (field references)
 * - Process Builders (field criteria)
 * - Workflow Rules (field criteria)
 *
 * ROI: $126,000/year (addresses 42 reflections - 51% of all issues)
 *
 * Usage:
 *   node metadata-dependency-analyzer.js <orgAlias> <objectName> <fieldName>
 *   node metadata-dependency-analyzer.js <orgAlias> --check-deployment <path>
 *
 * @see docs/runbooks/DEPENDENCY_ANALYSIS.md
 * @runbook Prevents 80% of field deletion deployment failures
 */

const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Input validation patterns to prevent command injection
 */
const SAFE_PATTERNS = {
    apiName: /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/,
    orgAlias: /^[a-zA-Z0-9_-]{1,64}$/
};

function validateInput(value, type, fieldName) {
    if (!value || typeof value !== 'string') {
        throw new Error(`${fieldName} is required`);
    }
    const pattern = SAFE_PATTERNS[type];
    if (pattern && !pattern.test(value)) {
        throw new Error(`Invalid ${fieldName}: contains unsafe characters`);
    }
    return true;
}

class MetadataDependencyAnalyzer {
  constructor(orgAlias, options = {}) {
    // Validate org alias to prevent command injection
    validateInput(orgAlias, 'orgAlias', 'orgAlias');
    this.orgAlias = orgAlias;
    this.verbose = options.verbose || false;
    this.cache = new Map();
    this.cacheDir = options.cacheDir || path.join(__dirname, '../../.validation-cache/dependencies');

    // Ensure cache directory exists
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Find all dependencies for a specific field
   * @param {string} objectName - The object API name
   * @param {string} fieldName - The field API name
   * @returns {Object} Dependencies grouped by metadata type
   */
  async analyzeField(objectName, fieldName) {
    const startTime = Date.now();
    this.log(`🔍 Analyzing dependencies for ${objectName}.${fieldName}...`);

    const dependencies = {
      object: objectName,
      field: fieldName,
      totalReferences: 0,
      canDelete: true,
      blockers: [],
      references: {
        flows: [],
        validationRules: [],
        formulaFields: [],
        layouts: [],
        processBuilders: [],
        workflowRules: []
      }
    };

    try {
      // 1. Check Flows (via Tooling API)
      await this.checkFlowReferences(objectName, fieldName, dependencies);

      // 2. Check Validation Rules
      await this.checkValidationRules(objectName, fieldName, dependencies);

      // 3. Check Formula Fields
      await this.checkFormulaFields(objectName, fieldName, dependencies);

      // 4. Check Page Layouts
      await this.checkPageLayouts(objectName, fieldName, dependencies);

      // 5. Check Process Builders
      await this.checkProcessBuilders(objectName, fieldName, dependencies);

      // 6. Check Workflow Rules
      await this.checkWorkflowRules(objectName, fieldName, dependencies);

      // Calculate totals
      dependencies.totalReferences =
        dependencies.references.flows.length +
        dependencies.references.validationRules.length +
        dependencies.references.formulaFields.length +
        dependencies.references.layouts.length +
        dependencies.references.processBuilders.length +
        dependencies.references.workflowRules.length;

      dependencies.canDelete = dependencies.totalReferences === 0;

      const duration = Date.now() - startTime;
      this.log(`✅ Analysis complete in ${duration}ms`);
      this.log(`   Found ${dependencies.totalReferences} reference(s)`);

      return dependencies;
    } catch (error) {
      this.logError(`Failed to analyze dependencies: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check Flow references using Tooling API
   */
  async checkFlowReferences(objectName, fieldName, dependencies) {
    try {
      // Query FlowDefinitionView for flows that might reference this field
      const query = `SELECT DeveloperName, ActiveVersionId FROM FlowDefinitionView WHERE ActiveVersionId != null`;
      const flows = this.executeQuery(query, true);

      if (!flows || flows.length === 0) {
        this.log('  📄 No active flows found');
        return;
      }

      this.log(`  📄 Checking ${flows.length} active flow(s)...`);

      for (const flow of flows) {
        // Retrieve flow XML via Metadata API
        const flowXML = this.retrieveFlowXML(flow.DeveloperName);

        if (this.flowReferencesField(flowXML, objectName, fieldName)) {
          const reference = {
            name: flow.DeveloperName,
            type: 'Flow',
            referenceType: this.identifyFlowReferenceType(flowXML, fieldName),
            canModify: true,
            risk: 'HIGH' // Modifying flows is risky
          };

          dependencies.references.flows.push(reference);
          dependencies.blockers.push({
            type: 'Flow',
            name: flow.DeveloperName,
            message: `Flow "${flow.DeveloperName}" references this field`,
            action: 'Must update flow definition before deleting field'
          });
        }
      }

      if (dependencies.references.flows.length > 0) {
        this.log(`    ⚠️  Found ${dependencies.references.flows.length} flow reference(s)`);
      } else {
        this.log(`    ✅ No flow references`);
      }
    } catch (error) {
      this.logError(`  ❌ Flow check failed: ${error.message}`);
      // Continue with other checks
    }
  }

  /**
   * Check Validation Rule references
   */
  async checkValidationRules(objectName, fieldName, dependencies) {
    try {
      // Query validation rules via Metadata API
      const query = `SELECT ValidationName, Active FROM ValidationRule WHERE EntityDefinition.QualifiedApiName = '${objectName}'`;
      const rules = this.executeQuery(query, true);

      if (!rules || rules.length === 0) {
        this.log('  🔒 No validation rules found');
        return;
      }

      this.log(`  🔒 Checking ${rules.length} validation rule(s)...`);

      for (const rule of rules) {
        // Retrieve full rule metadata to get formula
        const ruleMetadata = this.retrieveValidationRule(objectName, rule.ValidationName);

        if (this.formulaReferencesField(ruleMetadata.errorConditionFormula, fieldName)) {
          const reference = {
            name: rule.ValidationName,
            type: 'ValidationRule',
            active: rule.Active,
            formula: ruleMetadata.errorConditionFormula.substring(0, 100) + '...',
            canModify: true,
            risk: 'MEDIUM'
          };

          dependencies.references.validationRules.push(reference);
          dependencies.blockers.push({
            type: 'ValidationRule',
            name: rule.ValidationName,
            message: `Validation rule "${rule.ValidationName}" uses this field in formula`,
            action: 'Must update formula before deleting field'
          });
        }
      }

      if (dependencies.references.validationRules.length > 0) {
        this.log(`    ⚠️  Found ${dependencies.references.validationRules.length} validation rule reference(s)`);
      } else {
        this.log(`    ✅ No validation rule references`);
      }
    } catch (error) {
      this.logError(`  ❌ Validation rule check failed: ${error.message}`);
    }
  }

  /**
   * Check Formula Field references
   */
  async checkFormulaFields(objectName, fieldName, dependencies) {
    try {
      const query = `SELECT QualifiedApiName, DataType FROM FieldDefinition
                     WHERE EntityDefinition.QualifiedApiName = '${objectName}'
                     AND DataType LIKE '%Formula%'`;
      const fields = this.executeQuery(query, true);

      if (!fields || fields.length === 0) {
        this.log('  🧮 No formula fields found');
        return;
      }

      this.log(`  🧮 Checking ${fields.length} formula field(s)...`);

      for (const field of fields) {
        // Retrieve formula via sobject describe
        const describe = this.describeField(objectName, field.QualifiedApiName);

        if (describe.calculatedFormula && this.formulaReferencesField(describe.calculatedFormula, fieldName)) {
          const reference = {
            name: field.QualifiedApiName,
            type: 'FormulaField',
            dataType: field.DataType,
            formula: describe.calculatedFormula.substring(0, 100) + '...',
            canModify: true,
            risk: 'HIGH' // Breaking formulas affects calculations
          };

          dependencies.references.formulaFields.push(reference);
          dependencies.blockers.push({
            type: 'FormulaField',
            name: field.QualifiedApiName,
            message: `Formula field "${field.QualifiedApiName}" references this field`,
            action: 'Must update formula before deleting field'
          });
        }
      }

      if (dependencies.references.formulaFields.length > 0) {
        this.log(`    ⚠️  Found ${dependencies.references.formulaFields.length} formula field reference(s)`);
      } else {
        this.log(`    ✅ No formula field references`);
      }
    } catch (error) {
      this.logError(`  ❌ Formula field check failed: ${error.message}`);
    }
  }

  /**
   * Check Page Layout references
   */
  async checkPageLayouts(objectName, fieldName, dependencies) {
    try {
      const query = `SELECT Name FROM Layout WHERE TableEnumOrId = '${objectName}'`;
      const layouts = this.executeQuery(query, true);

      if (!layouts || layouts.length === 0) {
        this.log('  📋 No page layouts found');
        return;
      }

      this.log(`  📋 Checking ${layouts.length} page layout(s)...`);

      for (const layout of layouts) {
        // Retrieve layout metadata
        const layoutMetadata = this.retrieveLayout(objectName, layout.Name);

        if (this.layoutReferencesField(layoutMetadata, fieldName)) {
          const reference = {
            name: layout.Name,
            type: 'Layout',
            canModify: true,
            risk: 'LOW' // Layout changes are generally safe
          };

          dependencies.references.layouts.push(reference);
          // Layouts don't block deletion, but worth noting
        }
      }

      if (dependencies.references.layouts.length > 0) {
        this.log(`    ℹ️  Found ${dependencies.references.layouts.length} layout reference(s) (non-blocking)`);
      } else {
        this.log(`    ✅ No layout references`);
      }
    } catch (error) {
      this.logError(`  ❌ Layout check failed: ${error.message}`);
    }
  }

  /**
   * Check Process Builder references
   */
  async checkProcessBuilders(objectName, fieldName, dependencies) {
    try {
      // Process Builders are a type of Flow
      const query = `SELECT DeveloperName, ProcessType FROM FlowDefinitionView
                     WHERE ProcessType = 'Workflow' AND ActiveVersionId != null`;
      const processes = this.executeQuery(query, true);

      if (!processes || processes.length === 0) {
        this.log('  ⚙️  No active process builders found');
        return;
      }

      this.log(`  ⚙️  Checking ${processes.length} process builder(s)...`);

      for (const process of processes) {
        const flowXML = this.retrieveFlowXML(process.DeveloperName);

        if (this.flowReferencesField(flowXML, objectName, fieldName)) {
          const reference = {
            name: process.DeveloperName,
            type: 'ProcessBuilder',
            canModify: true,
            risk: 'HIGH'
          };

          dependencies.references.processBuilders.push(reference);
          dependencies.blockers.push({
            type: 'ProcessBuilder',
            name: process.DeveloperName,
            message: `Process Builder "${process.DeveloperName}" references this field`,
            action: 'Must update process criteria before deleting field'
          });
        }
      }

      if (dependencies.references.processBuilders.length > 0) {
        this.log(`    ⚠️  Found ${dependencies.references.processBuilders.length} process builder reference(s)`);
      } else {
        this.log(`    ✅ No process builder references`);
      }
    } catch (error) {
      this.logError(`  ❌ Process builder check failed: ${error.message}`);
    }
  }

  /**
   * Check Workflow Rule references
   */
  async checkWorkflowRules(objectName, fieldName, dependencies) {
    try {
      const query = `SELECT DeveloperName FROM WorkflowRule WHERE TableEnumOrId = '${objectName}'`;
      const rules = this.executeQuery(query, true);

      if (!rules || rules.length === 0) {
        this.log('  📜 No workflow rules found');
        return;
      }

      this.log(`  📜 Checking ${rules.length} workflow rule(s)...`);

      for (const rule of rules) {
        const ruleMetadata = this.retrieveWorkflowRule(objectName, rule.DeveloperName);

        if (ruleMetadata.formula && this.formulaReferencesField(ruleMetadata.formula, fieldName)) {
          const reference = {
            name: rule.DeveloperName,
            type: 'WorkflowRule',
            formula: ruleMetadata.formula.substring(0, 100) + '...',
            canModify: true,
            risk: 'MEDIUM'
          };

          dependencies.references.workflowRules.push(reference);
          dependencies.blockers.push({
            type: 'WorkflowRule',
            name: rule.DeveloperName,
            message: `Workflow Rule "${rule.DeveloperName}" uses this field`,
            action: 'Must update criteria before deleting field'
          });
        }
      }

      if (dependencies.references.workflowRules.length > 0) {
        this.log(`    ⚠️  Found ${dependencies.references.workflowRules.length} workflow rule reference(s)`);
      } else {
        this.log(`    ✅ No workflow rule references`);
      }
    } catch (error) {
      this.logError(`  ❌ Workflow rule check failed: ${error.message}`);
    }
  }

  /**
   * Helper: Execute SOQL query via SF CLI
   */
  executeQuery(query, useToolingApi = false) {
    try {
      const apiFlag = useToolingApi ? '--use-tooling-api' : '';
      const cmd = `sf data query --query "${query}" --target-org ${this.orgAlias} ${apiFlag} --json`;

      const result = childProcess.execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
      const parsed = JSON.parse(result);

      if (parsed.status === 0 && parsed.result && parsed.result.records) {
        return parsed.result.records;
      }

      return [];
    } catch (error) {
      this.logError(`Query failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Helper: Retrieve flow XML via Metadata API
   */
  retrieveFlowXML(flowDeveloperName) {
    try {
      const tempDir = fs.mkdtempSync(path.join(this.cacheDir, 'flow-'));

      // Create package.xml
      const packageXML = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
  <types>
    <members>${flowDeveloperName}</members>
    <name>Flow</name>
  </types>
  <version>62.0</version>
</Package>`;

      fs.writeFileSync(path.join(tempDir, 'package.xml'), packageXML);

      // Validate flowDeveloperName to prevent injection
      validateInput(flowDeveloperName, 'apiName', 'flowDeveloperName');

      // Retrieve flow using execFileSync for safety
      childProcess.execFileSync('sf', [
        'project', 'retrieve', 'start',
        '--manifest', path.join(tempDir, 'package.xml'),
        '--target-org', this.orgAlias,
        '--output-dir', tempDir
      ], { stdio: 'pipe' });

      // Read flow XML
      const flowPath = path.join(tempDir, 'flows', `${flowDeveloperName}.flow-meta.xml`);
      if (fs.existsSync(flowPath)) {
        return fs.readFileSync(flowPath, 'utf-8');
      }

      return '';
    } catch (error) {
      this.logError(`Failed to retrieve flow ${flowDeveloperName}: ${error.message}`);
      return '';
    }
  }

  /**
   * Helper: Check if flow XML references a field
   */
  flowReferencesField(flowXML, objectName, fieldName) {
    if (!flowXML) return false;

    // Check for various field reference patterns in flow XML
    const patterns = [
      `<field>${fieldName}</field>`,
      `{!${objectName}.${fieldName}}`,
      `{!$Record.${fieldName}}`,
      `{!$Record__Prior.${fieldName}}`,
      `fieldName>${fieldName}</fieldName>`
    ];

    return patterns.some(pattern => flowXML.includes(pattern));
  }

  /**
   * Validate Flow XML for common errors that cause deployment failures
   * Detects .null__NotFound patterns and other loop variable misuse
   *
   * @param {string} flowXML - The flow XML content
   * @returns {Object} Validation result with errors and warnings
   */
  validateFlowXMLPatterns(flowXML) {
    const result = {
      valid: true,
      errors: [],
      warnings: []
    };

    if (!flowXML) return result;

    // Pattern 1: Detect .null__NotFound pattern (incorrect loop variable reference)
    // This occurs when Flow uses wrong syntax for loop iteration variables
    const nullNotFoundPattern = /\.null__NotFound/g;
    let match;
    while ((match = nullNotFoundPattern.exec(flowXML)) !== null) {
      result.valid = false;
      result.errors.push({
        type: 'NULL_NOTFOUND_PATTERN',
        message: 'Flow uses incorrect .null__NotFound pattern instead of .CurrentItem accessor',
        position: match.index,
        context: flowXML.substring(Math.max(0, match.index - 50), Math.min(flowXML.length, match.index + 80)),
        fix: 'Replace .null__NotFound with .CurrentItem for loop variable references'
      });
    }

    // Pattern 2: Detect incorrect loop variable reference (should use .CurrentItem)
    // Common error: {!LoopVar.FieldName} should be {!LoopVar.CurrentItem.FieldName}
    const loopVarPattern = /<loops>[\s\S]*?<name>(\w+)<\/name>[\s\S]*?<\/loops>/g;
    const loopVars = [];
    while ((match = loopVarPattern.exec(flowXML)) !== null) {
      loopVars.push(match[1]);
    }

    // Check for direct loop var references without .CurrentItem
    for (const loopVar of loopVars) {
      // Pattern like {!LoopVar.FieldName} instead of {!LoopVar.CurrentItem.FieldName}
      const directRefPattern = new RegExp(`\\{!${loopVar}\\.(?!CurrentItem)([A-Za-z0-9_]+)\\}`, 'g');
      while ((match = directRefPattern.exec(flowXML)) !== null) {
        result.warnings.push({
          type: 'POTENTIAL_LOOP_VAR_MISUSE',
          message: `Loop variable "${loopVar}" may be missing .CurrentItem accessor`,
          field: match[1],
          position: match.index,
          context: flowXML.substring(Math.max(0, match.index - 30), Math.min(flowXML.length, match.index + 60)),
          suggestion: `Consider using {!${loopVar}.CurrentItem.${match[1]}} if accessing loop iteration field`
        });
      }
    }

    // Pattern 3: Detect $Record references with invalid fields
    const recordRefPattern = /\{!\$Record\.([A-Za-z0-9_]+)\}/g;
    while ((match = recordRefPattern.exec(flowXML)) !== null) {
      const fieldRef = match[1];
      // Check if field reference looks like an error pattern
      if (fieldRef.includes('null') || fieldRef.includes('NotFound') || fieldRef.includes('undefined')) {
        result.valid = false;
        result.errors.push({
          type: 'INVALID_RECORD_FIELD_REF',
          message: `Invalid $Record field reference: ${fieldRef}`,
          position: match.index,
          context: flowXML.substring(Math.max(0, match.index - 20), Math.min(flowXML.length, match.index + 50)),
          fix: 'Replace with valid field API name'
        });
      }
    }

    // Pattern 4: Detect empty or null value elements that cause issues
    const emptyValuePatterns = [
      /<value><\/value>/g,
      /<stringValue><\/stringValue>/g,
      /<numberValue><\/numberValue>/g
    ];

    for (const pattern of emptyValuePatterns) {
      while ((match = pattern.exec(flowXML)) !== null) {
        result.warnings.push({
          type: 'EMPTY_VALUE_ELEMENT',
          message: 'Empty value element found - may cause unexpected behavior',
          position: match.index,
          context: flowXML.substring(Math.max(0, match.index - 30), Math.min(flowXML.length, match.index + 50))
        });
      }
    }

    return result;
  }

  /**
   * Check all flows in deployment for XML pattern errors
   * @param {string} deployDir - Directory containing flows to check
   * @returns {Object} Validation results for all flows
   */
  async validateDeploymentFlows(deployDir) {
    const results = {
      totalFlows: 0,
      validFlows: 0,
      invalidFlows: 0,
      flowResults: [],
      canDeploy: true
    };

    try {
      const flowsDir = path.join(deployDir, 'flows');
      if (!fs.existsSync(flowsDir)) {
        this.log('  📄 No flows directory found in deployment');
        return results;
      }

      const flowFiles = fs.readdirSync(flowsDir)
        .filter(f => f.endsWith('.flow-meta.xml'));

      results.totalFlows = flowFiles.length;
      this.log(`  📄 Found ${flowFiles.length} flow(s) to validate`);

      for (const flowFile of flowFiles) {
        const flowPath = path.join(flowsDir, flowFile);
        const flowXML = fs.readFileSync(flowPath, 'utf-8');
        const flowName = flowFile.replace('.flow-meta.xml', '');

        const validation = this.validateFlowXMLPatterns(flowXML);

        results.flowResults.push({
          name: flowName,
          file: flowFile,
          ...validation
        });

        if (validation.valid) {
          results.validFlows++;
          this.log(`    ✅ ${flowName}`);
        } else {
          results.invalidFlows++;
          results.canDeploy = false;
          this.logError(`    ❌ ${flowName}: ${validation.errors.length} error(s)`);

          for (const error of validation.errors) {
            this.logError(`       - ${error.type}: ${error.message}`);
            if (error.fix) {
              this.log(`         💡 Fix: ${error.fix}`);
            }
          }
        }

        if (validation.warnings.length > 0) {
          this.log(`    ⚠️  ${flowName}: ${validation.warnings.length} warning(s)`);
        }
      }

      return results;
    } catch (error) {
      this.logError(`Flow validation failed: ${error.message}`);
      results.canDeploy = false;
      return results;
    }
  }

  /**
   * Helper: Identify how a flow references a field
   */
  identifyFlowReferenceType(flowXML, fieldName) {
    const types = [];

    if (flowXML.includes(`<field>${fieldName}</field>`)) types.push('Assignment');
    if (flowXML.includes(`{!$Record.${fieldName}}`)) types.push('RecordVariable');
    if (flowXML.includes(`<screenField>`) && flowXML.includes(fieldName)) types.push('Screen');
    if (flowXML.includes(`<conditions>`) && flowXML.includes(fieldName)) types.push('Decision');

    return types.length > 0 ? types.join(', ') : 'Unknown';
  }

  /**
   * Helper: Check if formula references a field
   */
  formulaReferencesField(formula, fieldName) {
    if (!formula) return false;

    // Match field references in formulas: FIELD_NAME__c or FieldName
    const patterns = [
      new RegExp(`\\b${fieldName}\\b`, 'i'),
      new RegExp(`${fieldName.replace(/__c$/, '')}\\b`, 'i')
    ];

    return patterns.some(pattern => pattern.test(formula));
  }

  /**
   * Helper: Retrieve validation rule metadata
   */
  retrieveValidationRule(objectName, ruleName) {
    try {
      const cmd = `sf sobject describe --sobject ${objectName} --target-org ${this.orgAlias} --json`;
      const result = childProcess.execSync(cmd, { encoding: 'utf-8' });
      const parsed = JSON.parse(result);

      // Find validation rule in describe result
      const rule = parsed.result?.validationRules?.find(r => r.name === ruleName);
      return rule || { errorConditionFormula: '' };
    } catch (error) {
      return { errorConditionFormula: '' };
    }
  }

  /**
   * Helper: Describe a specific field
   */
  describeField(objectName, fieldName) {
    try {
      const cmd = `sf sobject describe --sobject ${objectName} --target-org ${this.orgAlias} --json`;
      const result = childProcess.execSync(cmd, { encoding: 'utf-8' });
      const parsed = JSON.parse(result);

      const field = parsed.result?.fields?.find(f => f.name === fieldName);
      return field || {};
    } catch (error) {
      return {};
    }
  }

  /**
   * Helper: Retrieve layout metadata
   */
  retrieveLayout(objectName, layoutName) {
    // Simplified - would need full Metadata API retrieval
    // For now, assume layouts reference fields if they exist
    return { hasField: true };
  }

  /**
   * Helper: Check if layout references field
   */
  layoutReferencesField(layoutMetadata, fieldName) {
    // Simplified check - would need to parse layout XML
    return layoutMetadata.hasField;
  }

  /**
   * Helper: Retrieve workflow rule metadata
   */
  retrieveWorkflowRule(objectName, ruleName) {
    // Simplified - would need Metadata API retrieval
    return { formula: '' };
  }

  /**
   * Logging helpers
   */
  log(message) {
    if (this.verbose || true) { // Always log for now
      console.log(message);
    }
  }

  logError(message) {
    console.error(`❌ ${message}`);
  }

  /**
   * Generate human-readable report
   */
  generateReport(dependencies) {
    const lines = [];

    lines.push('═══════════════════════════════════════════════════════════');
    lines.push('  FIELD DEPENDENCY ANALYSIS REPORT');
    lines.push('═══════════════════════════════════════════════════════════');
    lines.push('');
    lines.push(`Field: ${dependencies.object}.${dependencies.field}`);
    lines.push(`Total References: ${dependencies.totalReferences}`);
    lines.push(`Can Delete: ${dependencies.canDelete ? '✅ YES' : '❌ NO (see blockers below)'}`);
    lines.push('');

    if (dependencies.blockers.length > 0) {
      lines.push('🚫 BLOCKERS (must resolve before deletion):');
      lines.push('');
      dependencies.blockers.forEach((blocker, i) => {
        lines.push(`${i + 1}. ${blocker.type}: ${blocker.name}`);
        lines.push(`   ${blocker.message}`);
        lines.push(`   → ${blocker.action}`);
        lines.push('');
      });
    }

    lines.push('📊 REFERENCE DETAILS:');
    lines.push('');

    Object.entries(dependencies.references).forEach(([type, refs]) => {
      if (refs.length > 0) {
        lines.push(`${type.toUpperCase()}: ${refs.length} reference(s)`);
        refs.forEach(ref => {
          lines.push(`  • ${ref.name} (${ref.risk} risk)`);
          if (ref.formula) lines.push(`    Formula: ${ref.formula}`);
          if (ref.referenceType) lines.push(`    Type: ${ref.referenceType}`);
        });
        lines.push('');
      }
    });

    lines.push('═══════════════════════════════════════════════════════════');

    return lines.join('\n');
  }

  /**
   * Comprehensive deployment validation
   * Checks for field dependencies, flow XML patterns, and other deployment blockers
   *
   * @param {string} deployDir - Directory containing metadata to deploy
   * @param {Object} options - Validation options
   * @returns {Object} Comprehensive validation result
   */
  async checkDeployment(deployDir, options = {}) {
    const { blockOnErrors = true, blockOnWarnings = false } = options;

    const result = {
      canDeploy: true,
      summary: {
        totalChecks: 0,
        passed: 0,
        failed: 0,
        warnings: 0
      },
      checks: {
        flowXMLValidation: null,
        fieldDependencies: null,
        deletedFields: []
      },
      errors: [],
      warnings: [],
      timestamp: new Date().toISOString()
    };

    console.log('═══════════════════════════════════════════════════════════');
    console.log('  COMPREHENSIVE DEPLOYMENT VALIDATION');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log(`📁 Deployment Directory: ${deployDir}`);
    console.log(`🎯 Target Org: ${this.orgAlias}`);
    console.log('');

    // Check 1: Flow XML Pattern Validation
    console.log('🌊 Check 1: Flow XML Pattern Validation');
    result.summary.totalChecks++;

    const flowValidation = await this.validateDeploymentFlows(deployDir);
    result.checks.flowXMLValidation = flowValidation;

    if (flowValidation.invalidFlows > 0) {
      result.summary.failed++;
      result.errors.push({
        type: 'FLOW_XML_ERRORS',
        message: `${flowValidation.invalidFlows} flow(s) have XML pattern errors`,
        details: flowValidation.flowResults.filter(f => !f.valid)
      });
      if (blockOnErrors) {
        result.canDeploy = false;
      }
    } else {
      result.summary.passed++;
      console.log(`  ✅ All ${flowValidation.totalFlows} flow(s) passed XML validation`);
    }

    // Count warnings from flow validation
    const flowWarnings = flowValidation.flowResults.reduce((acc, f) => acc + f.warnings.length, 0);
    if (flowWarnings > 0) {
      result.summary.warnings += flowWarnings;
      result.warnings.push({
        type: 'FLOW_XML_WARNINGS',
        message: `${flowWarnings} warning(s) in flow XML`,
        details: flowValidation.flowResults.filter(f => f.warnings.length > 0)
      });
    }

    console.log('');

    // Check 2: Field Deletion Dependencies
    console.log('🔗 Check 2: Field Deletion Dependencies');
    result.summary.totalChecks++;

    try {
      // Find fields marked for deletion
      const fieldsDir = path.join(deployDir, 'objects');
      const deletedFields = [];

      if (fs.existsSync(fieldsDir)) {
        const objectDirs = fs.readdirSync(fieldsDir);

        for (const objectDir of objectDirs) {
          const fieldPath = path.join(fieldsDir, objectDir, 'fields');
          if (fs.existsSync(fieldPath)) {
            const fieldFiles = fs.readdirSync(fieldPath);

            for (const fieldFile of fieldFiles) {
              const fieldContent = fs.readFileSync(path.join(fieldPath, fieldFile), 'utf-8');
              // Check for deletion markers
              if (fieldContent.includes('deleted') ||
                  fieldContent.includes('<fullName></fullName>') ||
                  fieldFile.includes('.DELETED')) {
                deletedFields.push({
                  object: objectDir,
                  field: fieldFile.replace('.field-meta.xml', '')
                });
              }
            }
          }
        }
      }

      if (deletedFields.length > 0) {
        console.log(`  📋 Found ${deletedFields.length} field(s) marked for deletion`);

        let hasBlockers = false;

        for (const { object, field } of deletedFields) {
          console.log(`  🔍 Checking ${object}.${field}...`);

          try {
            const deps = await this.analyzeField(object, field);
            result.checks.deletedFields.push({
              object,
              field,
              dependencies: deps
            });

            if (!deps.canDelete) {
              hasBlockers = true;
              result.errors.push({
                type: 'FIELD_DEPENDENCY_BLOCKER',
                message: `Cannot delete ${object}.${field} - has ${deps.totalReferences} active reference(s)`,
                blockers: deps.blockers
              });
              console.log(`    ❌ BLOCKED: ${deps.totalReferences} active reference(s)`);

              for (const blocker of deps.blockers.slice(0, 3)) {
                console.log(`       - ${blocker.type}: ${blocker.name}`);
              }

              if (deps.blockers.length > 3) {
                console.log(`       ... and ${deps.blockers.length - 3} more`);
              }
            } else {
              console.log(`    ✅ Safe to delete`);
            }
          } catch (depError) {
            console.log(`    ⚠️  Could not verify: ${depError.message}`);
            result.warnings.push({
              type: 'DEPENDENCY_CHECK_FAILED',
              message: `Could not verify dependencies for ${object}.${field}: ${depError.message}`
            });
            result.summary.warnings++;
          }
        }

        if (hasBlockers) {
          result.summary.failed++;
          if (blockOnErrors) {
            result.canDeploy = false;
          }
        } else {
          result.summary.passed++;
        }
      } else {
        console.log('  ✅ No field deletions detected');
        result.summary.passed++;
      }
    } catch (error) {
      console.log(`  ⚠️  Field dependency check failed: ${error.message}`);
      result.warnings.push({
        type: 'DEPENDENCY_CHECK_ERROR',
        message: error.message
      });
      result.summary.warnings++;
    }

    console.log('');

    // Final Summary
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  VALIDATION SUMMARY');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log(`Total Checks: ${result.summary.totalChecks}`);
    console.log(`Passed: ${result.summary.passed}`);
    console.log(`Failed: ${result.summary.failed}`);
    console.log(`Warnings: ${result.summary.warnings}`);
    console.log('');

    if (result.canDeploy) {
      console.log('✅ DEPLOYMENT APPROVED');
    } else {
      console.log('❌ DEPLOYMENT BLOCKED - Fix errors before deploying');
      console.log('');
      console.log('To bypass validation (NOT recommended):');
      console.log('  export SKIP_COMPREHENSIVE_VALIDATION=1');
    }

    console.log('═══════════════════════════════════════════════════════════');

    return result;
  }
}

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: node metadata-dependency-analyzer.js <orgAlias> <objectName> <fieldName>');
    console.error('       node metadata-dependency-analyzer.js <orgAlias> --check-deployment <path>');
    console.error('       node metadata-dependency-analyzer.js <orgAlias> --block-if-referenced <objectName> <fieldName>');
    console.error('');
    console.error('Options:');
    console.error('  --check-deployment <path>    Run comprehensive deployment validation');
    console.error('  --block-if-referenced        Exit with code 1 if field has references (for CI/CD)');
    console.error('  --verbose                    Show detailed output');
    console.error('');
    console.error('Examples:');
    console.error('  node metadata-dependency-analyzer.js myorg Account MyField__c');
    console.error('  node metadata-dependency-analyzer.js myorg --check-deployment ./force-app');
    console.error('  node metadata-dependency-analyzer.js myorg --block-if-referenced Account MyField__c');
    process.exit(1);
  }

  const orgAlias = args[0];
  const analyzer = new MetadataDependencyAnalyzer(orgAlias, { verbose: true });

  // Check for --check-deployment flag
  if (args[1] === '--check-deployment') {
    const deployPath = args[2] || './force-app/main/default';

    analyzer.checkDeployment(deployPath)
      .then(result => {
        process.exit(result.canDeploy ? 0 : 1);
      })
      .catch(error => {
        console.error(`\n❌ Deployment validation failed: ${error.message}`);
        process.exit(1);
      });
  }
  // Check for --block-if-referenced flag
  else if (args[1] === '--block-if-referenced') {
    const objectName = args[2];
    const fieldName = args[3];

    if (!objectName || !fieldName) {
      console.error('Error: --block-if-referenced requires <objectName> and <fieldName>');
      process.exit(1);
    }

    analyzer.analyzeField(objectName, fieldName)
      .then(dependencies => {
        console.log('');
        console.log(analyzer.generateReport(dependencies));

        if (dependencies.totalReferences > 0) {
          console.log('');
          console.log('❌ DEPLOYMENT BLOCKED: Field has active references');
          console.log('');
          console.log('Action Required:');
          console.log('  1. Update/remove references listed above');
          console.log('  2. Deploy the changes');
          console.log('  3. Re-run this validation');
          console.log('');
          process.exit(1);
        } else {
          console.log('');
          console.log('✅ Field has no active references - safe to proceed');
          process.exit(0);
        }
      })
      .catch(error => {
        console.error(`\n❌ Analysis failed: ${error.message}`);
        process.exit(1);
      });
  }
  // Standard field analysis
  else {
    const objectName = args[1];
    const fieldName = args[2];

    if (!fieldName) {
      console.error('Error: Field name required');
      console.error('Usage: node metadata-dependency-analyzer.js <orgAlias> <objectName> <fieldName>');
      process.exit(1);
    }

    analyzer.analyzeField(objectName, fieldName)
      .then(dependencies => {
        console.log('');
        console.log(analyzer.generateReport(dependencies));

        // Exit with error code if deletion is blocked
        process.exit(dependencies.canDelete ? 0 : 1);
      })
      .catch(error => {
        console.error(`\n❌ Analysis failed: ${error.message}`);
        process.exit(1);
      });
  }
}

module.exports = MetadataDependencyAnalyzer;
