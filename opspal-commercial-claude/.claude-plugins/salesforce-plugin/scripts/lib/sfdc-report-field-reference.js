#!/usr/bin/env node

/**
 * Salesforce Report Field Name Reference Library
 *
 * Provides valid field names for different report types to prevent
 * deployment failures due to incorrect field naming syntax.
 *
 * Key Lesson: Activity reports use UNPREFIXED field names (SUBJECT not ACTIVITY.SUBJECT)
 *
 * @see docs/SALESFORCE_REPORT_FIELD_REFERENCE.md for detailed documentation
 */

const REPORT_TYPE_FIELDS = {
  /**
   * Activity Report (Tasks and Events)
   * Note: Use simple unprefixed field names, NOT ACTIVITY.* or TASK.*
   */
  Activity: {
    reportType: 'Activity',
    validFields: [
      'SUBJECT',
      'DUE_DATE',
      'STATUS',
      'PRIORITY',
      'OWNER',
      'RELATED_TO',
      'DESCRIPTION',
      'CREATED_DATE',
      'LAST_MODIFIED_DATE',
      'TYPE',
      'ACCOUNT',
      'CONTACT',
      'REMINDER_DATE_TIME',
      'IS_CLOSED',
      'IS_HIGH_PRIORITY',
      'CALL_DURATION',
      'CALL_TYPE'
    ],
    groupableFields: [
      'DUE_DATE',
      'STATUS',
      'PRIORITY',
      'OWNER',
      'TYPE',
      'CREATED_DATE',
      'LAST_MODIFIED_DATE'
    ],
    dateFields: [
      'DUE_DATE',
      'CREATED_DATE',
      'LAST_MODIFIED_DATE',
      'REMINDER_DATE_TIME'
    ],
    invalidPrefixes: [
      'ACTIVITY.',
      'TASK.',
      'EVENT.'
    ],
    notes: 'Activity reports combine Tasks and Events. Use unprefixed field names only.'
  },

  /**
   * Opportunity Report
   */
  Opportunity: {
    reportType: 'Opportunity',
    validFields: [
      'OPPORTUNITY_NAME',
      'ACCOUNT_NAME',
      'STAGE_NAME',
      'AMOUNT',
      'CLOSE_DATE',
      'PROBABILITY',
      'AGE',
      'CREATED_DATE',
      'LAST_MODIFIED_DATE',
      'OWNER',
      'TYPE',
      'LEAD_SOURCE',
      'NEXT_STEP',
      'FORECAST_CATEGORY'
    ],
    groupableFields: [
      'STAGE_NAME',
      'OWNER',
      'TYPE',
      'LEAD_SOURCE',
      'FORECAST_CATEGORY',
      'CLOSE_DATE',
      'CREATED_DATE'
    ],
    dateFields: [
      'CLOSE_DATE',
      'CREATED_DATE',
      'LAST_MODIFIED_DATE'
    ],
    notes: 'Standard Opportunity report type'
  },

  /**
   * Account Report
   */
  Account: {
    reportType: 'AccountList',
    validFields: [
      'ACCOUNT_NAME',
      'BILLING_ADDRESS',
      'PHONE',
      'TYPE',
      'OWNER',
      'INDUSTRY',
      'ANNUAL_REVENUE',
      'EMPLOYEES',
      'CREATED_DATE',
      'LAST_MODIFIED_DATE',
      'LAST_ACTIVITY'
    ],
    groupableFields: [
      'TYPE',
      'OWNER',
      'INDUSTRY',
      'CREATED_DATE'
    ],
    dateFields: [
      'CREATED_DATE',
      'LAST_MODIFIED_DATE',
      'LAST_ACTIVITY'
    ],
    notes: 'Note: reportType is AccountList not Account'
  },

  /**
   * Contact Report
   */
  Contact: {
    reportType: 'ContactList',
    validFields: [
      'CONTACT_NAME',
      'ACCOUNT_NAME',
      'TITLE',
      'EMAIL',
      'PHONE',
      'OWNER',
      'CREATED_DATE',
      'LAST_MODIFIED_DATE',
      'LAST_ACTIVITY'
    ],
    groupableFields: [
      'ACCOUNT_NAME',
      'OWNER',
      'CREATED_DATE'
    ],
    dateFields: [
      'CREATED_DATE',
      'LAST_MODIFIED_DATE',
      'LAST_ACTIVITY'
    ],
    notes: 'Note: reportType is ContactList not Contact'
  },

  /**
   * Lead Report
   */
  Lead: {
    reportType: 'LeadList',
    validFields: [
      'LEAD_NAME',
      'COMPANY',
      'EMAIL',
      'PHONE',
      'STATUS',
      'OWNER',
      'RATING',
      'LEAD_SOURCE',
      'CREATED_DATE',
      'LAST_MODIFIED_DATE',
      'CONVERTED',
      'CONVERTED_DATE'
    ],
    groupableFields: [
      'STATUS',
      'OWNER',
      'RATING',
      'LEAD_SOURCE',
      'CREATED_DATE',
      'CONVERTED'
    ],
    dateFields: [
      'CREATED_DATE',
      'LAST_MODIFIED_DATE',
      'CONVERTED_DATE'
    ],
    notes: 'Note: reportType is LeadList not Lead'
  },

  /**
   * Case Report
   */
  Case: {
    reportType: 'CaseList',
    validFields: [
      'CASE_NUMBER',
      'SUBJECT',
      'STATUS',
      'PRIORITY',
      'OWNER',
      'ACCOUNT_NAME',
      'CONTACT_NAME',
      'CREATED_DATE',
      'CLOSED_DATE',
      'CASE_AGE',
      'ORIGIN',
      'TYPE',
      'REASON'
    ],
    groupableFields: [
      'STATUS',
      'PRIORITY',
      'OWNER',
      'ORIGIN',
      'TYPE',
      'CREATED_DATE'
    ],
    dateFields: [
      'CREATED_DATE',
      'CLOSED_DATE',
      'LAST_MODIFIED_DATE'
    ],
    notes: 'Note: reportType is CaseList not Case'
  }
};

/**
 * Validate if a field name is valid for a given report type
 */
function isValidField(reportType, fieldName) {
  const schema = REPORT_TYPE_FIELDS[reportType];
  if (!schema) {
    return { valid: false, error: `Unknown report type: ${reportType}` };
  }

  // Check for invalid prefixes (e.g., ACTIVITY.SUBJECT for Activity reports)
  if (schema.invalidPrefixes) {
    for (const prefix of schema.invalidPrefixes) {
      if (fieldName.startsWith(prefix)) {
        return {
          valid: false,
          error: `Invalid prefix "${prefix}" for ${reportType} report. Use unprefixed name: ${fieldName.replace(prefix, '')}`
        };
      }
    }
  }

  if (!schema.validFields.includes(fieldName)) {
    return {
      valid: false,
      error: `Field "${fieldName}" not valid for ${reportType} report. Valid fields: ${schema.validFields.slice(0, 10).join(', ')}...`
    };
  }

  return { valid: true };
}

/**
 * Check if a field can be used in groupings
 */
function isGroupableField(reportType, fieldName) {
  const schema = REPORT_TYPE_FIELDS[reportType];
  if (!schema) {
    return { valid: false, error: `Unknown report type: ${reportType}` };
  }

  if (!schema.groupableFields.includes(fieldName)) {
    return {
      valid: false,
      error: `Field "${fieldName}" cannot be used in groupings for ${reportType} report`
    };
  }

  return { valid: true };
}

/**
 * Get all valid fields for a report type
 */
function getValidFields(reportType) {
  const schema = REPORT_TYPE_FIELDS[reportType];
  if (!schema) {
    return null;
  }
  return schema.validFields;
}

/**
 * Get report type metadata
 */
function getReportTypeSchema(reportType) {
  return REPORT_TYPE_FIELDS[reportType] || null;
}

/**
 * Validate multiple fields at once
 */
function validateFields(reportType, fields) {
  const results = {
    valid: true,
    errors: [],
    warnings: []
  };

  for (const field of fields) {
    const validation = isValidField(reportType, field);
    if (!validation.valid) {
      results.valid = false;
      results.errors.push({
        field,
        error: validation.error
      });
    }
  }

  return results;
}

/**
 * Suggest correct field name if invalid prefix detected
 */
function suggestCorrection(reportType, fieldName) {
  const schema = REPORT_TYPE_FIELDS[reportType];
  if (!schema || !schema.invalidPrefixes) {
    return null;
  }

  for (const prefix of schema.invalidPrefixes) {
    if (fieldName.startsWith(prefix)) {
      const corrected = fieldName.replace(prefix, '');
      if (schema.validFields.includes(corrected)) {
        return {
          original: fieldName,
          corrected,
          reason: `Remove "${prefix}" prefix for ${reportType} reports`
        };
      }
    }
  }

  return null;
}

module.exports = {
  REPORT_TYPE_FIELDS,
  isValidField,
  isGroupableField,
  getValidFields,
  getReportTypeSchema,
  validateFields,
  suggestCorrection
};

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: node sfdc-report-field-reference.js <command> [args]');
    console.log('\nCommands:');
    console.log('  list <reportType>              List valid fields for a report type');
    console.log('  validate <reportType> <field>  Validate a field name');
    console.log('  suggest <reportType> <field>   Suggest correction for invalid field');
    console.log('  types                          List all supported report types');
    console.log('\nExamples:');
    console.log('  node sfdc-report-field-reference.js list Activity');
    console.log('  node sfdc-report-field-reference.js validate Activity ACTIVITY.SUBJECT');
    console.log('  node sfdc-report-field-reference.js suggest Activity ACTIVITY.SUBJECT');
    process.exit(0);
  }

  const command = args[0];

  switch (command) {
    case 'list': {
      const reportType = args[1];
      const fields = getValidFields(reportType);
      if (fields) {
        console.log(`Valid fields for ${reportType}:`);
        fields.forEach(f => console.log(`  - ${f}`));
      } else {
        console.error(`Unknown report type: ${reportType}`);
        process.exit(1);
      }
      break;
    }

    case 'validate': {
      const reportType = args[1];
      const field = args[2];
      const result = isValidField(reportType, field);
      if (result.valid) {
        console.log(`✅ "${field}" is valid for ${reportType} reports`);
      } else {
        console.error(`❌ ${result.error}`);
        process.exit(1);
      }
      break;
    }

    case 'suggest': {
      const reportType = args[1];
      const field = args[2];
      const suggestion = suggestCorrection(reportType, field);
      if (suggestion) {
        console.log(`Correction for "${suggestion.original}":`);
        console.log(`  ✅ Use: ${suggestion.corrected}`);
        console.log(`  Reason: ${suggestion.reason}`);
      } else {
        console.log(`No correction needed for "${field}"`);
      }
      break;
    }

    case 'types': {
      console.log('Supported report types:');
      Object.keys(REPORT_TYPE_FIELDS).forEach(type => {
        const schema = REPORT_TYPE_FIELDS[type];
        console.log(`  - ${type} (reportType: ${schema.reportType})`);
        if (schema.notes) {
          console.log(`    Note: ${schema.notes}`);
        }
      });
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}
