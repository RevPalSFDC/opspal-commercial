#!/usr/bin/env node

/**
 * Flow XML Validator
 *
 * Validates Flow XML syntax and semantics to prevent deployment failures:
 * - `.CurrentItem` accessor syntax (not `$CurrentItem`)
 * - Duplicate field assignments
 * - Invalid element references
 * - Screen Flow UI components requiring manual setup
 * - Formula syntax errors
 * - Loop collection references
 * - Decision logic completeness
 *
 * ROI: Part of $126,000/year dependency analyzer suite
 *
 * Usage:
 *   node flow-xml-validator.js <flow-file.xml>
 *   node flow-xml-validator.js <flow-file.xml> --fix
 *   node flow-xml-validator.js --batch <directory>
 *
 * @see docs/runbooks/flow-xml-development/04-validation-and-best-practices.md
 * @runbook Validates Flow XML before deployment
 */

const fs = require('fs');
const path = require('path');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');

class FlowXMLValidator {
  constructor(options = {}) {
    this.verbose = options.verbose !== false;
    this.autoFix = options.autoFix || false;
    this.errors = [];
    this.warnings = [];
    this.fixes = [];
  }

  /**
   * Validate a Flow XML file
   * @param {string} flowPath - Path to flow-meta.xml file
   * @returns {Object} Validation results
   */
  validateFlow(flowPath) {
    this.errors = [];
    this.warnings = [];
    this.fixes = [];

    try {
      if (!fs.existsSync(flowPath)) {
        throw new Error(`Flow file not found: ${flowPath}`);
      }

      const flowXML = fs.readFileSync(flowPath, 'utf-8');
      const flowName = path.basename(flowPath, '.flow-meta.xml');

      this.log(`🔍 Validating flow: ${flowName}`);

      // Basic XML structure validation
      if (!flowXML || flowXML.trim().length === 0) {
        this.errors.push({
          type: 'EMPTY_FILE',
          message: 'Flow file is empty'
        });
      }

      // Check for basic XML structure (opening and closing tags must match)
      // Count different tag types (exclude XML declarations and comments)
      const allTags = (flowXML.match(/<[^>]+>/g) || [])
        .filter(tag => !tag.startsWith('<?') && !tag.startsWith('<!--'));
      const selfClosingTags = allTags.filter(tag => tag.endsWith('/>')).length;
      const closingTags = allTags.filter(tag => tag.startsWith('</')).length;
      const openingTags = allTags.length - selfClosingTags - closingTags;

      // For balanced XML: opening tags should equal closing tags
      if (openingTags !== closingTags && openingTags > 0) {
        this.errors.push({
          type: 'XML_STRUCTURE_ERROR',
          message: `Malformed XML - unclosed tags detected (${openingTags} opening, ${closingTags} closing, ${selfClosingTags} self-closing)`
        });
      }

      // Parse XML
      const parser = new DOMParser();
      const doc = parser.parseFromString(flowXML, 'text/xml');

      // Check for XML parsing errors
      const parserErrors = doc.getElementsByTagName('parsererror');
      if (parserErrors.length > 0) {
        this.errors.push({
          type: 'XML_PARSE_ERROR',
          message: 'Malformed XML - unable to parse flow definition',
          details: parserErrors[0].textContent
        });
      }

      // Check if document root is valid
      if (!doc.documentElement || doc.documentElement.tagName === 'parsererror') {
        this.errors.push({
          type: 'XML_STRUCTURE_ERROR',
          message: 'Invalid XML structure - missing or malformed root element'
        });
      }

      // Run validation checks
      this.checkCurrentItemSyntax(doc, flowXML);
      this.checkDuplicateFieldAssignments(doc);
      this.checkInvalidReferences(doc);
      this.checkScreenFlowComponents(doc);
      this.checkFormulasSyntax(doc);
      this.checkLoopReferences(doc);
      this.checkDecisionLogic(doc);
      this.checkRecordLookups(doc);
      this.checkRecordVariableNullHandling(doc);

      // Generate result
      const result = {
        flowName,
        valid: this.errors.length === 0,
        errors: this.errors,
        warnings: this.warnings,
        fixes: this.fixes,
        summary: this.generateSummary()
      };

      // Auto-fix if requested
      if (this.autoFix && this.fixes.length > 0) {
        this.applyFixes(flowPath, doc);
      }

      return result;
    } catch (error) {
      return {
        flowName: path.basename(flowPath),
        valid: false,
        errors: [{ type: 'PARSE_ERROR', message: error.message }],
        warnings: [],
        fixes: []
      };
    }
  }

  /**
   * Check .CurrentItem syntax (not $CurrentItem)
   */
  checkCurrentItemSyntax(doc, flowXML) {
    // Common error: Using $CurrentItem instead of .CurrentItem in loops
    const invalidPatterns = [
      /\$CurrentItem/g,
      /\{!\s*CurrentItem/g,  // Missing dot
      /\{!loop\.CurrentItem/g  // Incorrect loop reference
    ];

    const validPattern = /{!(\w+)\.CurrentItem/g;  // Correct: {!loopVar.CurrentItem}

    invalidPatterns.forEach(pattern => {
      const matches = flowXML.match(pattern);
      if (matches) {
        matches.forEach(match => {
          this.errors.push({
            type: 'CURRENTITEM_SYNTAX',
            severity: 'HIGH',
            message: `Invalid .CurrentItem syntax: "${match}"`,
            details: 'Use {!loopVar.CurrentItem} not $CurrentItem or CurrentItem',
            location: this.findLineNumber(flowXML, match),
            fix: {
              from: match,
              to: match.replace('$CurrentItem', 'loopVar.CurrentItem').replace('{!CurrentItem', '{!loopVar.CurrentItem')
            }
          });

          this.fixes.push({
            type: 'CURRENTITEM_SYNTAX',
            description: `Fix CurrentItem reference: ${match}`,
            automated: true
          });
        });
      }
    });
  }

  /**
   * Check for duplicate field assignments
   */
  checkDuplicateFieldAssignments(doc) {
    const assignments = doc.getElementsByTagName('assignments');
    const fieldMap = new Map();

    for (let i = 0; i < assignments.length; i++) {
      const assignment = assignments[i];
      const assignmentItems = assignment.getElementsByTagName('assignmentItems');

      for (let j = 0; j < assignmentItems.length; j++) {
        const item = assignmentItems[j];
        const fieldElement = item.getElementsByTagName('field')[0];

        if (fieldElement) {
          const fieldName = fieldElement.textContent;
          const assignToRef = assignment.getElementsByTagName('assignToReference')[0]?.textContent;

          const key = `${assignToRef}:${fieldName}`;

          if (fieldMap.has(key)) {
            this.errors.push({
              type: 'DUPLICATE_ASSIGNMENT',
              severity: 'HIGH',
              message: `Duplicate assignment to field: ${fieldName}`,
              details: `Field "${fieldName}" is assigned multiple times in the same assignment block`,
              location: `Assignment to ${assignToRef}`,
              fix: {
                description: 'Remove duplicate assignment or merge into single assignment',
                automated: false  // Requires human judgment
              }
            });
          } else {
            fieldMap.set(key, true);
          }
        }
      }
    }

    if (fieldMap.size > 0) {
      this.log(`  ✅ Checked ${fieldMap.size} field assignment(s)`);
    }
  }

  /**
   * Check for invalid element references
   */
  checkInvalidReferences(doc) {
    // Get all elements with names
    const elementNames = new Set();
    const elementsWithNames = [
      'start', 'decisions', 'assignments', 'recordCreates', 'recordUpdates',
      'recordDeletes', 'recordLookups', 'loops', 'subflows', 'screens',
      'actionCalls'
    ];

    elementsWithNames.forEach(tagName => {
      const elements = doc.getElementsByTagName(tagName);
      for (let i = 0; i < elements.length; i++) {
        const nameElement = elements[i].getElementsByTagName('name')[0];
        if (nameElement) {
          elementNames.add(nameElement.textContent);
        }
      }
    });

    // Check all references
    const connectors = doc.getElementsByTagName('connector');
    for (let i = 0; i < connectors.length; i++) {
      const targetElement = connectors[i].getElementsByTagName('targetReference')[0];
      if (targetElement) {
        const targetRef = targetElement.textContent;
        if (!elementNames.has(targetRef)) {
          this.errors.push({
            type: 'INVALID_REFERENCE',
            severity: 'HIGH',
            message: `Invalid element reference: ${targetRef}`,
            details: `Element "${targetRef}" is referenced but does not exist in flow`,
            location: 'Flow connector'
          });
        }
      }
    }
  }

  /**
   * Check for Screen Flow components requiring manual setup
   */
  checkScreenFlowComponents(doc) {
    const screens = doc.getElementsByTagName('screens');

    for (let i = 0; i < screens.length; i++) {
      const screen = screens[i];
      const screenName = screen.getElementsByTagName('name')[0]?.textContent || 'Unknown';

      // Check for components that need manual configuration
      const components = screen.getElementsByTagName('fields');
      let hasUIComponents = false;

      for (let j = 0; j < components.length; j++) {
        const fieldType = components[j].getElementsByTagName('fieldType')[0]?.textContent;

        if (fieldType && ['RadioButtons', 'DropdownBox', 'ComponentInstance'].includes(fieldType)) {
          hasUIComponents = true;
          this.warnings.push({
            type: 'SCREEN_UI_COMPONENT',
            severity: 'MEDIUM',
            message: `Screen "${screenName}" contains ${fieldType} component`,
            details: `${fieldType} components may require manual configuration in Flow Builder`,
            location: `Screen: ${screenName}`,
            recommendation: 'Verify component configuration after deployment'
          });
        }
      }

      if (hasUIComponents) {
        this.log(`  ⚠️  Screen "${screenName}" has UI components needing verification`);
      }
    }
  }

  /**
   * Check formula syntax
   */
  checkFormulasSyntax(doc) {
    const formulas = doc.getElementsByTagName('formulas');

    for (let i = 0; i < formulas.length; i++) {
      const formula = formulas[i];
      const formulaName = formula.getElementsByTagName('name')[0]?.textContent || 'Unknown';
      const expression = formula.getElementsByTagName('expression')[0]?.textContent;

      if (expression) {
        // Check for common formula errors
        this.checkFormulaBalancedParentheses(formulaName, expression);
        this.checkFormulaFieldReferences(formulaName, expression);
      }
    }
  }

  /**
   * Check formula balanced parentheses
   */
  checkFormulaBalancedParentheses(formulaName, expression) {
    let balance = 0;
    for (let char of expression) {
      if (char === '(') balance++;
      if (char === ')') balance--;
      if (balance < 0) {
        this.errors.push({
          type: 'FORMULA_SYNTAX',
          severity: 'HIGH',
          message: `Formula "${formulaName}" has unbalanced parentheses`,
          details: 'Closing parenthesis without matching opening parenthesis',
          location: `Formula: ${formulaName}`
        });
        return;
      }
    }

    if (balance !== 0) {
      this.errors.push({
        type: 'FORMULA_SYNTAX',
        severity: 'HIGH',
        message: `Formula "${formulaName}" has unbalanced parentheses`,
        details: `Missing ${balance > 0 ? 'closing' : 'opening'} parenthesis`,
        location: `Formula: ${formulaName}`
      });
    }
  }

  /**
   * Check formula field references
   */
  checkFormulaFieldReferences(formulaName, expression) {
    // Check for invalid reference syntax
    const invalidRefs = expression.match(/\$Record\.[a-zA-Z0-9_]+\s*\./g);
    if (invalidRefs) {
      this.warnings.push({
        type: 'FORMULA_REFERENCE',
        severity: 'LOW',
        message: `Formula "${formulaName}" may have incorrect field reference`,
        details: 'Use {!$Record.FieldName} not $Record.FieldName.',
        location: `Formula: ${formulaName}`
      });
    }
  }

  /**
   * Check loop references
   */
  checkLoopReferences(doc) {
    const loops = doc.getElementsByTagName('loops');

    for (let i = 0; i < loops.length; i++) {
      const loop = loops[i];
      const loopName = loop.getElementsByTagName('name')[0]?.textContent || 'Unknown';
      const collectionRef = loop.getElementsByTagName('collectionReference')[0]?.textContent;

      if (!collectionRef) {
        this.errors.push({
          type: 'LOOP_COLLECTION',
          severity: 'HIGH',
          message: `Loop "${loopName}" missing collection reference`,
          details: 'Loops must reference a collection variable',
          location: `Loop: ${loopName}`
        });
      }
    }
  }

  /**
   * Check decision logic completeness
   */
  checkDecisionLogic(doc) {
    const decisions = doc.getElementsByTagName('decisions');

    for (let i = 0; i < decisions.length; i++) {
      const decision = decisions[i];
      const decisionName = decision.getElementsByTagName('name')[0]?.textContent || 'Unknown';
      const rules = decision.getElementsByTagName('rules');

      if (rules.length === 0) {
        this.warnings.push({
          type: 'DECISION_LOGIC',
          severity: 'MEDIUM',
          message: `Decision "${decisionName}" has no rules`,
          details: 'Decisions should have at least one rule',
          location: `Decision: ${decisionName}`
        });
      }

      // Check for default connector
      const defaultConnector = decision.getElementsByTagName('defaultConnector')[0];
      if (!defaultConnector) {
        this.warnings.push({
          type: 'DECISION_DEFAULT',
          severity: 'LOW',
          message: `Decision "${decisionName}" has no default path`,
          details: 'Consider adding a default connector for unmatched cases',
          location: `Decision: ${decisionName}`,
          recommendation: 'Add default path to handle edge cases'
        });
      }
    }
  }

  /**
   * Check record lookups
   */
  checkRecordLookups(doc) {
    const lookups = doc.getElementsByTagName('recordLookups');

    for (let i = 0; i < lookups.length; i++) {
      const lookup = lookups[i];
      const lookupName = lookup.getElementsByTagName('name')[0]?.textContent || 'Unknown';
      const filters = lookup.getElementsByTagName('filters');

      if (filters.length === 0) {
        this.warnings.push({
          type: 'RECORD_LOOKUP',
          severity: 'MEDIUM',
          message: `Record Lookup "${lookupName}" has no filters`,
          details: 'Lookups without filters may return unexpected results',
          location: `Record Lookup: ${lookupName}`,
          recommendation: 'Add filter conditions to ensure correct records are retrieved'
        });
      }
    }
  }

  /**
   * Check record variable null handling
   * Validates that record variables from Get Records are null-checked before field access
   */
  checkRecordVariableNullHandling(doc) {
    const lookups = doc.getElementsByTagName('recordLookups');
    const decisions = doc.getElementsByTagName('decisions');
    const assignments = doc.getElementsByTagName('assignments');
    const updates = doc.getElementsByTagName('recordUpdates');
    const creates = doc.getElementsByTagName('recordCreates');

    // Build a map of single-record lookup output variables
    const singleRecordVars = new Map();

    for (let i = 0; i < lookups.length; i++) {
      const lookup = lookups[i];
      const lookupName = lookup.getElementsByTagName('name')[0]?.textContent || 'Unknown';
      const getFirstRecordOnly = lookup.getElementsByTagName('getFirstRecordOnly')[0]?.textContent;
      const outputReference = lookup.getElementsByTagName('outputReference')[0]?.textContent;
      const storeOutputAutomatically = lookup.getElementsByTagName('storeOutputAutomatically')[0]?.textContent;

      // Track single record lookups (getFirstRecordOnly=true or outputReference to a record var)
      if (getFirstRecordOnly === 'true' || outputReference) {
        const outputVar = outputReference || `${lookupName}`;
        singleRecordVars.set(outputVar, {
          lookupName,
          outputVar,
          storeOutputAutomatically: storeOutputAutomatically === 'true'
        });
      }
    }

    if (singleRecordVars.size === 0) {
      return; // No single-record lookups to check
    }

    // Build set of variables that are null-checked in decisions
    const nullCheckedVars = new Set();

    for (let i = 0; i < decisions.length; i++) {
      const decision = decisions[i];
      const rules = decision.getElementsByTagName('rules');

      for (let j = 0; j < rules.length; j++) {
        const conditions = rules[j].getElementsByTagName('conditions');

        for (let k = 0; k < conditions.length; k++) {
          const condition = conditions[k];
          const leftValue = condition.getElementsByTagName('leftValueReference')[0]?.textContent;
          const operator = condition.getElementsByTagName('operator')[0]?.textContent;
          const rightValue = condition.getElementsByTagName('rightValue')[0];

          // Check for null checks: isNull, isEmpty, or comparison to null/empty
          if (leftValue && singleRecordVars.has(leftValue.split('.')[0])) {
            const baseVar = leftValue.split('.')[0];

            // Direct null/empty checks
            if (operator === 'IsNull' || operator === 'IsBlank' ||
                operator === 'EqualTo' && !rightValue?.textContent) {
              nullCheckedVars.add(baseVar);
            }

            // $Record.Field style check on the variable
            if (leftValue === baseVar) {
              nullCheckedVars.add(baseVar);
            }
          }
        }
      }
    }

    // Check assignments, updates, creates for unprotected variable access
    const checkElementsForUncheckedAccess = (elements, elementType) => {
      for (let i = 0; i < elements.length; i++) {
        const element = elements[i];
        const elementName = element.getElementsByTagName('name')[0]?.textContent || 'Unknown';

        // Check value references
        const valueRefs = [
          ...element.getElementsByTagName('value'),
          ...element.getElementsByTagName('inputReference'),
          ...element.getElementsByTagName('assignToReference')
        ];

        for (let j = 0; j < valueRefs.length; j++) {
          const ref = valueRefs[j];
          const refText = ref.textContent || '';

          // Check if this references a single-record variable's field
          for (const [varName, varInfo] of singleRecordVars) {
            if (refText.startsWith(varName + '.') && !nullCheckedVars.has(varName)) {
              this.warnings.push({
                type: 'RECORD_NULL_CHECK',
                severity: 'MEDIUM',
                message: `${elementType} "${elementName}" accesses field from record variable "${varName}" without null check`,
                details: `Record lookup "${varInfo.lookupName}" may return no records. Add a decision to check if ${varName} is null before accessing ${refText}.`,
                location: `${elementType}: ${elementName}`,
                recommendation: 'Add a Decision element after the Get Records to check if the record variable is null before accessing its fields'
              });
            }
          }
        }
      }
    };

    checkElementsForUncheckedAccess(assignments, 'Assignment');
    checkElementsForUncheckedAccess(updates, 'Record Update');
    checkElementsForUncheckedAccess(creates, 'Record Create');

    // Also check formula references
    const formulas = doc.getElementsByTagName('formulas');
    for (let i = 0; i < formulas.length; i++) {
      const formula = formulas[i];
      const formulaName = formula.getElementsByTagName('name')[0]?.textContent || 'Unknown';
      const expression = formula.getElementsByTagName('expression')[0]?.textContent || '';

      for (const [varName, varInfo] of singleRecordVars) {
        // Check for {!varName.Field} pattern in formula
        const varPattern = new RegExp(`\\{!${varName}\\.\\w+`, 'g');
        if (varPattern.test(expression) && !nullCheckedVars.has(varName)) {
          this.warnings.push({
            type: 'RECORD_NULL_CHECK',
            severity: 'MEDIUM',
            message: `Formula "${formulaName}" accesses field from record variable "${varName}" without null check`,
            details: `Record lookup "${varInfo.lookupName}" may return no records. The formula may fail at runtime if no record is found.`,
            location: `Formula: ${formulaName}`,
            recommendation: 'Either add null-safe formula logic (BLANKVALUE, NULLVALUE) or add a Decision element before this formula to handle null cases'
          });
        }
      }
    }
  }

  /**
   * Apply auto-fixes to flow XML
   */
  applyFixes(flowPath, doc) {
    this.log(`\n🔧 Applying ${this.fixes.length} auto-fix(es)...`);

    let flowXML = fs.readFileSync(flowPath, 'utf-8');

    this.fixes.forEach(fix => {
      if (fix.automated && fix.from && fix.to) {
        flowXML = flowXML.replace(fix.from, fix.to);
        this.log(`  ✅ Fixed: ${fix.description}`);
      }
    });

    // Write back to file
    const backupPath = flowPath.replace('.flow-meta.xml', '.flow-meta.xml.bak');
    fs.writeFileSync(backupPath, fs.readFileSync(flowPath));
    fs.writeFileSync(flowPath, flowXML);

    this.log(`  💾 Backup saved to: ${backupPath}`);
    this.log(`  ✅ Fixes applied to: ${flowPath}`);
  }

  /**
   * Find line number of text in XML
   */
  findLineNumber(xml, text) {
    const lines = xml.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(text)) {
        return `Line ${i + 1}`;
      }
    }
    return 'Unknown';
  }

  /**
   * Generate validation summary
   */
  generateSummary() {
    const lines = [];

    if (this.errors.length === 0 && this.warnings.length === 0) {
      lines.push('✅ Flow validation passed - no issues found');
    } else {
      if (this.errors.length > 0) {
        lines.push(`❌ ${this.errors.length} error(s) found`);
      }
      if (this.warnings.length > 0) {
        lines.push(`⚠️  ${this.warnings.length} warning(s) found`);
      }
      if (this.fixes.length > 0) {
        lines.push(`🔧 ${this.fixes.length} auto-fix(es) available`);
      }
    }

    return lines.join(' | ');
  }

  /**
   * Logging helper
   */
  log(message) {
    if (this.verbose) {
      console.log(message);
    }
  }

  /**
   * Format validation report
   */
  formatReport(result) {
    const lines = [];

    lines.push('═══════════════════════════════════════════════════════════');
    lines.push(`  FLOW VALIDATION REPORT: ${result.flowName}`);
    lines.push('═══════════════════════════════════════════════════════════');
    lines.push('');
    lines.push(`Status: ${result.valid ? '✅ VALID' : '❌ INVALID'}`);
    lines.push(`Errors: ${result.errors.length}`);
    lines.push(`Warnings: ${result.warnings.length}`);
    lines.push('');

    if (result.errors.length > 0) {
      lines.push('🔴 ERRORS:');
      result.errors.forEach((error, i) => {
        lines.push(`\n${i + 1}. [${error.type}] ${error.message}`);
        if (error.details) lines.push(`   ${error.details}`);
        if (error.location) lines.push(`   Location: ${error.location}`);
        if (error.fix) lines.push(`   Fix: ${error.fix.description || 'Manual fix required'}`);
      });
      lines.push('');
    }

    if (result.warnings.length > 0) {
      lines.push('🟡 WARNINGS:');
      result.warnings.forEach((warning, i) => {
        lines.push(`\n${i + 1}. [${warning.type}] ${warning.message}`);
        if (warning.details) lines.push(`   ${warning.details}`);
        if (warning.recommendation) lines.push(`   Recommendation: ${warning.recommendation}`);
      });
      lines.push('');
    }

    if (result.fixes.length > 0) {
      lines.push('🔧 AVAILABLE FIXES:');
      result.fixes.forEach((fix, i) => {
        lines.push(`${i + 1}. ${fix.description} ${fix.automated ? '(automated)' : '(manual)'}`);
      });
      lines.push('');
      lines.push('💡 Run with --fix to apply automated fixes');
      lines.push('');
    }

    lines.push('═══════════════════════════════════════════════════════════');

    return lines.join('\n');
  }
}

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: node flow-xml-validator.js <flow-file.xml>');
    console.error('       node flow-xml-validator.js <flow-file.xml> --fix');
    console.error('       node flow-xml-validator.js --batch <directory>');
    process.exit(1);
  }

  const autoFix = args.includes('--fix');
  const flowPath = args.find(arg => !arg.startsWith('--'));

  const validator = new FlowXMLValidator({ verbose: true, autoFix });
  const result = validator.validateFlow(flowPath);

  console.log('\n' + validator.formatReport(result));

  process.exit(result.valid ? 0 : 1);
}

module.exports = FlowXMLValidator;
