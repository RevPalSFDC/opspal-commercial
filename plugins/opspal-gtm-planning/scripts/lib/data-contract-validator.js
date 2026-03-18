/**
 * Data Contract Validator
 *
 * Validates data against template data contracts before report generation.
 * Ensures required fields exist, data quality checks pass, and transformations
 * are properly applied.
 *
 * @module data-contract-validator
 */

const fs = require('fs');
const path = require('path');

// Template directory relative to plugin root
const TEMPLATE_DIR = path.join(__dirname, '..', '..', 'templates', 'reports', 'strategic');

/**
 * DataContractValidator class
 * Validates data against template requirements
 */
class DataContractValidator {
  constructor(options = {}) {
    this.templateDir = options.templateDir || TEMPLATE_DIR;
    this.strictMode = options.strictMode || false;
  }

  /**
   * Load a template's data contract
   * @param {string} templateId - Template identifier
   * @returns {object} Data contract specification
   */
  loadDataContract(templateId) {
    const templatePath = path.join(this.templateDir, `${templateId}.json`);

    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    return template.required_data_contract;
  }

  /**
   * Validate data against a template's data contract
   * @param {string} templateId - Template identifier
   * @param {object} data - Data to validate
   * @param {object} metadata - Optional metadata about data sources
   * @returns {object} Validation results
   */
  validate(templateId, data, metadata = {}) {
    const contract = this.loadDataContract(templateId);

    const results = {
      template_id: templateId,
      valid: true,
      timestamp: new Date().toISOString(),
      summary: {
        total_checks: 0,
        passed: 0,
        failed: 0,
        warnings: 0
      },
      field_validation: [],
      quality_checks: [],
      transformation_notes: [],
      recommendations: []
    };

    // Validate required fields
    this.validateFields(contract, data, results);

    // Run data quality checks
    this.runQualityChecks(contract, data, results);

    // Check data source systems
    this.validateDataSources(contract, metadata, results);

    // Validate timestamps
    this.validateTimestamps(contract, data, results);

    // Check joins and relationships
    this.validateJoins(contract, data, results);

    // Apply transformation rules validation
    this.validateTransformations(contract, data, results);

    // Generate recommendations
    this.generateRecommendations(results);

    // Update summary
    results.summary.total_checks =
      results.field_validation.length +
      results.quality_checks.length;
    results.summary.passed =
      results.field_validation.filter(f => f.status === 'pass').length +
      results.quality_checks.filter(q => q.status === 'pass').length;
    results.summary.failed =
      results.field_validation.filter(f => f.status === 'fail').length +
      results.quality_checks.filter(q => q.status === 'fail').length;
    results.summary.warnings =
      results.field_validation.filter(f => f.status === 'warning').length +
      results.quality_checks.filter(q => q.status === 'warning').length;

    // Set overall validity
    results.valid = results.summary.failed === 0 || !this.strictMode;

    return results;
  }

  /**
   * Validate required fields exist in data
   * @private
   */
  validateFields(contract, data, results) {
    for (const field of contract.required_fields || []) {
      const fieldResult = {
        field_name: field.field_name,
        description: field.description,
        status: 'pass',
        value_present: false,
        source_field: null,
        message: null
      };

      // Check for field in data (try multiple key formats)
      const possibleKeys = this.generatePossibleKeys(field.field_name);
      let foundKey = null;
      let foundValue = null;

      for (const key of possibleKeys) {
        if (data[key] !== undefined && data[key] !== null) {
          foundKey = key;
          foundValue = data[key];
          break;
        }
      }

      if (foundKey) {
        fieldResult.value_present = true;
        fieldResult.source_field = foundKey;
        fieldResult.message = `Found as "${foundKey}"`;

        // Validate value type if possible
        if (typeof foundValue === 'number' && field.field_name.toLowerCase().includes('arr')) {
          if (foundValue < 0) {
            fieldResult.status = 'warning';
            fieldResult.message = 'ARR value is negative - verify data';
          }
        }
      } else {
        fieldResult.status = 'fail';
        fieldResult.message = `Required field not found. Expected: ${possibleKeys.join(' or ')}`;
        results.valid = false;
      }

      results.field_validation.push(fieldResult);
    }
  }

  /**
   * Generate possible key variations for a field name
   * @private
   */
  generatePossibleKeys(fieldName) {
    const base = fieldName.toLowerCase();
    return [
      base,
      base.replace(/\s+/g, '_'),
      base.replace(/\s+/g, ''),
      this.toCamelCase(fieldName),
      this.toSnakeCase(fieldName),
      fieldName.replace(/\s+/g, '__c'), // Salesforce custom field
    ];
  }

  /**
   * Run data quality checks from contract
   * @private
   */
  runQualityChecks(contract, data, results) {
    for (const check of contract.data_quality_checks || []) {
      const checkResult = {
        check_name: check.check_name,
        logic: check.logic,
        severity: check.severity,
        status: 'pass',
        details: null
      };

      // Execute check based on check name patterns
      const checkOutcome = this.executeQualityCheck(check, data);
      checkResult.status = checkOutcome.passed ? 'pass' : (check.severity === 'high' ? 'fail' : 'warning');
      checkResult.details = checkOutcome.details;

      if (checkResult.status === 'fail') {
        results.valid = false;
      }

      results.quality_checks.push(checkResult);
    }
  }

  /**
   * Execute a specific quality check
   * @private
   */
  executeQualityCheck(check, data) {
    const checkName = check.check_name.toLowerCase();
    const logic = check.logic.toLowerCase();

    // Reconciliation checks
    if (checkName.includes('reconciliation') || logic.includes('equals')) {
      return this.checkReconciliation(data, logic);
    }

    // Completeness checks
    if (checkName.includes('completeness') || logic.includes('every') || logic.includes('all')) {
      return this.checkCompleteness(data, logic);
    }

    // Range/threshold checks
    if (logic.includes('>') || logic.includes('<') || logic.includes('threshold')) {
      return this.checkThresholds(data, logic);
    }

    // Consistency checks
    if (checkName.includes('consistency') || logic.includes('consistent')) {
      return this.checkConsistency(data, logic);
    }

    // Default: pass with note
    return {
      passed: true,
      details: 'Check requires manual verification'
    };
  }

  /**
   * Check data reconciliation (e.g., Starting + New - Churn = Ending)
   * @private
   */
  checkReconciliation(data, logic) {
    // Try to identify reconciliation formula from common patterns
    if (data.starting_arr !== undefined && data.ending_arr !== undefined) {
      const expansion = data.expansion_arr || 0;
      const newArr = data.new_arr || 0;
      const churned = data.churned_arr || 0;

      const calculated = data.starting_arr + newArr + expansion - churned;
      const actual = data.ending_arr;
      const variance = Math.abs(calculated - actual);
      const tolerance = actual * 0.01; // 1% tolerance

      return {
        passed: variance <= tolerance,
        details: `Calculated: ${calculated.toLocaleString()}, Actual: ${actual.toLocaleString()}, Variance: ${variance.toLocaleString()}`
      };
    }

    return { passed: true, details: 'Unable to verify reconciliation - missing fields' };
  }

  /**
   * Check data completeness
   * @private
   */
  checkCompleteness(data, logic) {
    // Count null/undefined values
    const totalFields = Object.keys(data).length;
    const populatedFields = Object.values(data).filter(v => v !== null && v !== undefined).length;
    const completeness = (populatedFields / totalFields) * 100;

    return {
      passed: completeness >= 95,
      details: `${completeness.toFixed(1)}% fields populated (${populatedFields}/${totalFields})`
    };
  }

  /**
   * Check value thresholds
   * @private
   */
  checkThresholds(data, logic) {
    // Check NRR thresholds
    if (data.nrr !== undefined) {
      if (data.nrr > 150) {
        return {
          passed: false,
          details: `NRR of ${data.nrr}% is unusually high - verify large expansions`
        };
      }
      if (data.nrr < 50) {
        return {
          passed: false,
          details: `NRR of ${data.nrr}% is unusually low - verify churn data`
        };
      }
    }

    // Check GRR thresholds
    if (data.grr !== undefined) {
      if (data.grr > 100) {
        return {
          passed: false,
          details: `GRR of ${data.grr}% exceeds 100% - check calculation (GRR cannot exceed 100%)`
        };
      }
    }

    return { passed: true, details: 'Values within expected thresholds' };
  }

  /**
   * Check data consistency
   * @private
   */
  checkConsistency(data, logic) {
    // Check NRR >= GRR (since NRR includes expansion)
    if (data.nrr !== undefined && data.grr !== undefined) {
      if (data.nrr < data.grr) {
        return {
          passed: false,
          details: `NRR (${data.nrr}%) should not be less than GRR (${data.grr}%)`
        };
      }
    }

    // Check segment totals
    if (data.segments && Array.isArray(data.segments)) {
      const segmentTotal = data.segments.reduce((sum, s) => sum + (s.arr || 0), 0);
      if (data.total_arr && Math.abs(segmentTotal - data.total_arr) > data.total_arr * 0.01) {
        return {
          passed: false,
          details: `Segment total (${segmentTotal.toLocaleString()}) doesn't match total ARR (${data.total_arr.toLocaleString()})`
        };
      }
    }

    return { passed: true, details: 'Data appears consistent' };
  }

  /**
   * Validate data sources are available
   * @private
   */
  validateDataSources(contract, metadata, results) {
    const requiredSources = contract.source_systems || [];
    const availableSources = metadata.available_sources || [];

    for (const source of requiredSources) {
      if (!availableSources.includes(source) && availableSources.length > 0) {
        results.recommendations.push({
          type: 'data_source',
          message: `Template requires "${source}" but it may not be connected`,
          severity: 'info'
        });
      }
    }
  }

  /**
   * Validate required timestamps are present
   * @private
   */
  validateTimestamps(contract, data, results) {
    for (const timestamp of contract.required_timestamps || []) {
      const possibleKeys = this.generatePossibleKeys(timestamp);
      const found = possibleKeys.some(key => data[key] !== undefined);

      if (!found) {
        results.field_validation.push({
          field_name: timestamp,
          description: 'Required timestamp',
          status: 'warning',
          value_present: false,
          message: 'Timestamp not found - may affect period filtering'
        });
      }
    }
  }

  /**
   * Validate join relationships
   * @private
   */
  validateJoins(contract, data, results) {
    // Check for orphaned records if join data is present
    for (const join of contract.joins_and_keys || []) {
      if (data[`${join.left_entity.toLowerCase()}_count`] && data[`matched_count`]) {
        const matchRate = (data.matched_count / data[`${join.left_entity.toLowerCase()}_count`]) * 100;
        if (matchRate < 90) {
          results.quality_checks.push({
            check_name: `${join.left_entity} to ${join.right_entity} Join`,
            logic: join.notes,
            severity: 'medium',
            status: 'warning',
            details: `Only ${matchRate.toFixed(1)}% of ${join.left_entity} records matched`
          });
        }
      }
    }
  }

  /**
   * Validate transformation rules were applied
   * @private
   */
  validateTransformations(contract, data, results) {
    for (const rule of contract.transformation_rules || []) {
      results.transformation_notes.push({
        rule: rule,
        status: 'info',
        note: 'Verify transformation was applied during data preparation'
      });
    }
  }

  /**
   * Generate recommendations based on validation results
   * @private
   */
  generateRecommendations(results) {
    // Check for high failure rate
    const failedChecks = results.quality_checks.filter(q => q.status === 'fail');
    if (failedChecks.length > 2) {
      results.recommendations.push({
        type: 'data_quality',
        message: `${failedChecks.length} quality checks failed - review data preparation pipeline`,
        severity: 'high'
      });
    }

    // Check for missing fields
    const missingFields = results.field_validation.filter(f => f.status === 'fail');
    if (missingFields.length > 0) {
      results.recommendations.push({
        type: 'missing_data',
        message: `${missingFields.length} required fields missing: ${missingFields.map(f => f.field_name).join(', ')}`,
        severity: 'high'
      });
    }

    // Check for warnings
    const warnings = [
      ...results.field_validation.filter(f => f.status === 'warning'),
      ...results.quality_checks.filter(q => q.status === 'warning')
    ];
    if (warnings.length > 0) {
      results.recommendations.push({
        type: 'review_needed',
        message: `${warnings.length} items need review before report generation`,
        severity: 'medium'
      });
    }
  }

  /**
   * Validate Salesforce field mappings
   * @param {string} templateId - Template identifier
   * @param {object} orgMetadata - Org field metadata from describe calls
   * @returns {object} Field mapping validation results
   */
  validateSalesforceFields(templateId, orgMetadata) {
    const contract = this.loadDataContract(templateId);
    const results = {
      valid: true,
      mappings: [],
      missing_fields: []
    };

    for (const field of contract.required_fields || []) {
      if (field.salesforce_field) {
        const sfFields = field.salesforce_field.split(',').map(f => f.trim());

        for (const sfField of sfFields) {
          // Parse object.field format
          const parts = sfField.match(/(\w+)\.(\w+)/);
          if (parts) {
            const [, objectName, fieldName] = parts;
            const objectMeta = orgMetadata[objectName];

            if (objectMeta) {
              const fieldExists = objectMeta.fields?.some(f =>
                f.name === fieldName || f.name === `${fieldName}__c`
              );

              results.mappings.push({
                template_field: field.field_name,
                salesforce_field: sfField,
                exists: fieldExists,
                object: objectName
              });

              if (!fieldExists) {
                results.missing_fields.push(sfField);
                results.valid = false;
              }
            }
          }
        }
      }
    }

    return results;
  }

  /**
   * Validate HubSpot field mappings
   * @param {string} templateId - Template identifier
   * @param {object} hubspotSchema - HubSpot property schema
   * @returns {object} Field mapping validation results
   */
  validateHubSpotFields(templateId, hubspotSchema) {
    const contract = this.loadDataContract(templateId);
    const results = {
      valid: true,
      mappings: [],
      missing_fields: []
    };

    for (const field of contract.required_fields || []) {
      if (field.hubspot_field) {
        const hsFields = field.hubspot_field.split(',').map(f => f.trim());

        for (const hsField of hsFields) {
          // Parse object.property format
          const parts = hsField.match(/(\w+)\.(\w+)/);
          if (parts) {
            const [, objectType, propertyName] = parts;
            const objectSchema = hubspotSchema[objectType];

            if (objectSchema) {
              const propertyExists = objectSchema.properties?.some(p =>
                p.name === propertyName
              );

              results.mappings.push({
                template_field: field.field_name,
                hubspot_field: hsField,
                exists: propertyExists,
                object_type: objectType
              });

              if (!propertyExists) {
                results.missing_fields.push(hsField);
                results.valid = false;
              }
            }
          }
        }
      }
    }

    return results;
  }

  /**
   * Generate field mapping documentation
   * @param {string} templateId - Template identifier
   * @returns {string} Markdown documentation
   */
  generateFieldMappingDocs(templateId) {
    const contract = this.loadDataContract(templateId);
    const lines = [
      `# Field Mapping Documentation: ${templateId}`,
      '',
      '## Required Fields',
      '',
      '| Field | Description | Salesforce | HubSpot |',
      '|-------|-------------|------------|---------|'
    ];

    for (const field of contract.required_fields || []) {
      lines.push([
        `| ${field.field_name}`,
        field.description || '-',
        field.salesforce_field || '-',
        field.hubspot_field || '-',
        ''
      ].join(' | '));
    }

    lines.push('');
    lines.push('## Data Quality Checks');
    lines.push('');

    for (const check of contract.data_quality_checks || []) {
      lines.push(`### ${check.check_name} (${check.severity})`);
      lines.push(`> ${check.logic}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Convert string to camelCase
   * @private
   */
  toCamelCase(str) {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]+(.)/g, (m, chr) => chr.toUpperCase());
  }

  /**
   * Convert string to snake_case
   * @private
   */
  toSnakeCase(str) {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  }
}

// Export for use in other modules
module.exports = { DataContractValidator };

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  const validator = new DataContractValidator();

  switch (command) {
    case 'contract':
      const templateId = args[1];
      if (!templateId) {
        console.error('Usage: node data-contract-validator.js contract <template-id>');
        process.exit(1);
      }
      const contract = validator.loadDataContract(templateId);
      console.log(JSON.stringify(contract, null, 2));
      break;

    case 'validate':
      const tplId = args[1];
      const dataFile = args[2];
      if (!tplId || !dataFile) {
        console.error('Usage: node data-contract-validator.js validate <template-id> <data-file.json>');
        process.exit(1);
      }
      const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
      const results = validator.validate(tplId, data);
      console.log(JSON.stringify(results, null, 2));
      break;

    case 'docs':
      const docTemplateId = args[1];
      if (!docTemplateId) {
        console.error('Usage: node data-contract-validator.js docs <template-id>');
        process.exit(1);
      }
      console.log(validator.generateFieldMappingDocs(docTemplateId));
      break;

    default:
      console.log(`
Data Contract Validator CLI

Commands:
  contract <template-id>              Show data contract for a template
  validate <template-id> <data.json>  Validate data against contract
  docs <template-id>                  Generate field mapping documentation

Examples:
  node data-contract-validator.js contract arr-waterfall
  node data-contract-validator.js validate net-dollar-retention ./data.json
  node data-contract-validator.js docs tam-sam-som
      `);
  }
}
