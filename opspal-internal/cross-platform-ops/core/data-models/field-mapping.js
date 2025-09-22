/**
 * Field Mapping Engine for Cross-Platform Operations
 * Manages field transformations between Salesforce and HubSpot
 */

const path = require('path');
const fs = require('fs');

class FieldMappingEngine {
  constructor(config = {}) {
    this.config = {
      mappingDir: config.mappingDir || path.join(__dirname, '../../config/mappings'),
      customTransformers: config.customTransformers || {},
      strictMode: config.strictMode || false,
      autoLearn: config.autoLearn || false,
      ...config
    };

    // Standard field mappings between platforms
    this.standardMappings = {
      // Contact/Lead mappings
      'contact': {
        'salesforce_to_hubspot': {
          'FirstName': 'firstname',
          'LastName': 'lastname',
          'Email': 'email',
          'Phone': 'phone',
          'MobilePhone': 'mobilephone',
          'Title': 'jobtitle',
          'Department': 'department',
          'LeadSource': 'hs_lead_status',
          'Description': 'description',
          'OwnerId': 'hubspot_owner_id',
          'AccountId': 'associatedcompanyid',
          'MailingStreet': 'address',
          'MailingCity': 'city',
          'MailingState': 'state',
          'MailingPostalCode': 'zip',
          'MailingCountry': 'country',
          'Birthdate': 'date_of_birth',
          'HasOptedOutOfEmail': 'unsubscribed_from_email',
          'DoNotCall': 'hs_do_not_call'
        },
        'hubspot_to_salesforce': {
          'firstname': 'FirstName',
          'lastname': 'LastName',
          'email': 'Email',
          'phone': 'Phone',
          'mobilephone': 'MobilePhone',
          'jobtitle': 'Title',
          'department': 'Department',
          'hs_lead_status': 'LeadSource',
          'description': 'Description',
          'hubspot_owner_id': 'OwnerId',
          'associatedcompanyid': 'AccountId',
          'address': 'MailingStreet',
          'city': 'MailingCity',
          'state': 'MailingState',
          'zip': 'MailingPostalCode',
          'country': 'MailingCountry',
          'date_of_birth': 'Birthdate',
          'unsubscribed_from_email': 'HasOptedOutOfEmail',
          'hs_do_not_call': 'DoNotCall'
        }
      },
      // Company/Account mappings
      'company': {
        'salesforce_to_hubspot': {
          'Name': 'name',
          'Website': 'domain',
          'Phone': 'phone',
          'Industry': 'industry',
          'NumberOfEmployees': 'numberofemployees',
          'AnnualRevenue': 'annualrevenue',
          'Description': 'description',
          'BillingStreet': 'address',
          'BillingCity': 'city',
          'BillingState': 'state',
          'BillingPostalCode': 'zip',
          'BillingCountry': 'country',
          'Type': 'type',
          'OwnerId': 'hubspot_owner_id',
          'ParentId': 'hs_parent_company_id',
          'AccountNumber': 'hs_account_number',
          'Site': 'website2',
          'TickerSymbol': 'twitterhandle'
        },
        'hubspot_to_salesforce': {
          'name': 'Name',
          'domain': 'Website',
          'phone': 'Phone',
          'industry': 'Industry',
          'numberofemployees': 'NumberOfEmployees',
          'annualrevenue': 'AnnualRevenue',
          'description': 'Description',
          'address': 'BillingStreet',
          'city': 'BillingCity',
          'state': 'BillingState',
          'zip': 'BillingPostalCode',
          'country': 'BillingCountry',
          'type': 'Type',
          'hubspot_owner_id': 'OwnerId',
          'hs_parent_company_id': 'ParentId',
          'hs_account_number': 'AccountNumber',
          'website2': 'Site',
          'twitterhandle': 'TickerSymbol'
        }
      },
      // Deal/Opportunity mappings
      'deal': {
        'salesforce_to_hubspot': {
          'Name': 'dealname',
          'Amount': 'amount',
          'StageName': 'dealstage',
          'CloseDate': 'closedate',
          'Probability': 'hs_probability',
          'Description': 'description',
          'Type': 'dealtype',
          'LeadSource': 'source',
          'NextStep': 'hs_next_step',
          'OwnerId': 'hubspot_owner_id',
          'AccountId': 'associatedcompanyid',
          'CampaignId': 'hs_campaign',
          'IsClosed': 'hs_is_closed',
          'IsWon': 'hs_is_closed_won',
          'ForecastCategory': 'hs_forecast_category',
          'ExpectedRevenue': 'hs_tcv',
          'TotalOpportunityQuantity': 'num_associated_contacts'
        },
        'hubspot_to_salesforce': {
          'dealname': 'Name',
          'amount': 'Amount',
          'dealstage': 'StageName',
          'closedate': 'CloseDate',
          'hs_probability': 'Probability',
          'description': 'Description',
          'dealtype': 'Type',
          'source': 'LeadSource',
          'hs_next_step': 'NextStep',
          'hubspot_owner_id': 'OwnerId',
          'associatedcompanyid': 'AccountId',
          'hs_campaign': 'CampaignId',
          'hs_is_closed': 'IsClosed',
          'hs_is_closed_won': 'IsWon',
          'hs_forecast_category': 'ForecastCategory',
          'hs_tcv': 'ExpectedRevenue',
          'num_associated_contacts': 'TotalOpportunityQuantity'
        }
      }
    };

    // Field type transformers
    this.typeTransformers = {
      'date': {
        'salesforce_to_hubspot': (value) => {
          if (!value) return null;
          return new Date(value).getTime();
        },
        'hubspot_to_salesforce': (value) => {
          if (!value) return null;
          return new Date(value).toISOString().split('T')[0];
        }
      },
      'datetime': {
        'salesforce_to_hubspot': (value) => {
          if (!value) return null;
          return new Date(value).getTime();
        },
        'hubspot_to_salesforce': (value) => {
          if (!value) return null;
          return new Date(value).toISOString();
        }
      },
      'boolean': {
        'salesforce_to_hubspot': (value) => {
          return value === true || value === 'true' || value === '1';
        },
        'hubspot_to_salesforce': (value) => {
          return value === true || value === 'true' || value === '1';
        }
      },
      'picklist': {
        'salesforce_to_hubspot': (value, mapping) => {
          if (!value || !mapping) return value;
          return mapping[value] || value;
        },
        'hubspot_to_salesforce': (value, mapping) => {
          if (!value || !mapping) return value;
          return mapping[value] || value;
        }
      },
      'currency': {
        'salesforce_to_hubspot': (value) => {
          if (!value) return null;
          return parseFloat(value);
        },
        'hubspot_to_salesforce': (value) => {
          if (!value) return null;
          return parseFloat(value);
        }
      },
      'percent': {
        'salesforce_to_hubspot': (value) => {
          if (!value) return null;
          return parseFloat(value);
        },
        'hubspot_to_salesforce': (value) => {
          if (!value) return null;
          return parseFloat(value);
        }
      }
    };

    // Stage mappings
    this.stageMappings = {
      'opportunity_to_deal': {
        'Prospecting': 'appointmentscheduled',
        'Qualification': 'qualifiedtobuy',
        'Needs Analysis': 'presentationscheduled',
        'Value Proposition': 'decisionmakerboughtin',
        'Id. Decision Makers': 'contractsent',
        'Perception Analysis': 'closedwon',
        'Proposal/Price Quote': 'contractsent',
        'Negotiation/Review': 'contractsent',
        'Closed Won': 'closedwon',
        'Closed Lost': 'closedlost'
      },
      'deal_to_opportunity': {
        'appointmentscheduled': 'Prospecting',
        'qualifiedtobuy': 'Qualification',
        'presentationscheduled': 'Needs Analysis',
        'decisionmakerboughtin': 'Value Proposition',
        'contractsent': 'Proposal/Price Quote',
        'closedwon': 'Closed Won',
        'closedlost': 'Closed Lost'
      }
    };

    // Custom field mappings cache
    this.customMappings = new Map();

    // Load custom mappings if they exist
    this.loadCustomMappings();
  }

  /**
   * Map fields from source to target platform
   */
  mapFields(data, objectType, direction) {
    const mappedData = {};
    const unmappedFields = [];
    const transformationLog = [];

    // Get the appropriate mapping
    const mappingKey = objectType.toLowerCase();
    const directionKey = direction.toLowerCase();

    let fieldMap = {};
    if (this.standardMappings[mappingKey] && this.standardMappings[mappingKey][directionKey]) {
      fieldMap = this.standardMappings[mappingKey][directionKey];
    }

    // Check for custom mappings
    const customMapKey = `${mappingKey}_${directionKey}`;
    if (this.customMappings.has(customMapKey)) {
      fieldMap = { ...fieldMap, ...this.customMappings.get(customMapKey) };
    }

    // Process each field
    for (const [sourceField, value] of Object.entries(data)) {
      if (fieldMap[sourceField]) {
        const targetField = fieldMap[sourceField];
        let transformedValue = value;

        // Apply type transformation if needed
        if (this.shouldTransform(sourceField, objectType)) {
          const transformer = this.getTransformer(sourceField, objectType, direction);
          if (transformer) {
            transformedValue = transformer(value);
            transformationLog.push({
              field: sourceField,
              original: value,
              transformed: transformedValue,
              targetField: targetField
            });
          }
        }

        mappedData[targetField] = transformedValue;
      } else {
        unmappedFields.push({ field: sourceField, value: value });

        // In non-strict mode, pass through unmapped fields
        if (!this.config.strictMode) {
          mappedData[sourceField] = value;
        }
      }
    }

    // Apply stage mapping for opportunities/deals
    if (mappingKey === 'deal' || mappingKey === 'opportunity') {
      this.mapStages(mappedData, direction);
    }

    return {
      data: mappedData,
      unmapped: unmappedFields,
      transformations: transformationLog
    };
  }

  /**
   * Create a custom field mapping
   */
  addCustomMapping(objectType, sourceField, targetField, direction) {
    const key = `${objectType.toLowerCase()}_${direction.toLowerCase()}`;

    if (!this.customMappings.has(key)) {
      this.customMappings.set(key, {});
    }

    const mapping = this.customMappings.get(key);
    mapping[sourceField] = targetField;

    // Save to file if autoLearn is enabled
    if (this.config.autoLearn) {
      this.saveCustomMappings();
    }

    return true;
  }

  /**
   * Bulk add custom mappings
   */
  addCustomMappings(objectType, mappings, direction) {
    for (const [source, target] of Object.entries(mappings)) {
      this.addCustomMapping(objectType, source, target, direction);
    }
  }

  /**
   * Map stage values between platforms
   */
  mapStages(data, direction) {
    const stageField = direction.includes('salesforce') ? 'StageName' : 'dealstage';
    const targetField = direction.includes('salesforce') ? 'dealstage' : 'StageName';

    if (data[stageField] || data[targetField]) {
      const currentStage = data[stageField] || data[targetField];
      const mappingKey = direction.includes('hubspot_to') ? 'deal_to_opportunity' : 'opportunity_to_deal';

      if (this.stageMappings[mappingKey][currentStage]) {
        const fieldToUpdate = direction.includes('hubspot_to') ? 'StageName' : 'dealstage';
        data[fieldToUpdate] = this.stageMappings[mappingKey][currentStage];
      }
    }
  }

  /**
   * Get field mapping schema for an object type
   */
  getMappingSchema(objectType, direction) {
    const mappingKey = objectType.toLowerCase();
    const directionKey = direction.toLowerCase();

    const schema = {
      standard: {},
      custom: {},
      transformers: [],
      unmappable: []
    };

    // Get standard mappings
    if (this.standardMappings[mappingKey] && this.standardMappings[mappingKey][directionKey]) {
      schema.standard = this.standardMappings[mappingKey][directionKey];
    }

    // Get custom mappings
    const customMapKey = `${mappingKey}_${directionKey}`;
    if (this.customMappings.has(customMapKey)) {
      schema.custom = this.customMappings.get(customMapKey);
    }

    // Identify fields that need transformation
    for (const field of Object.keys(schema.standard)) {
      if (this.shouldTransform(field, objectType)) {
        schema.transformers.push(field);
      }
    }

    return schema;
  }

  /**
   * Validate mapping configuration
   */
  validateMapping(objectType, sourceData, direction) {
    const errors = [];
    const warnings = [];

    const mappingKey = objectType.toLowerCase();
    const directionKey = direction.toLowerCase();

    // Check if mapping exists
    if (!this.standardMappings[mappingKey] || !this.standardMappings[mappingKey][directionKey]) {
      errors.push(`No standard mapping found for ${objectType} in direction ${direction}`);
      return { valid: false, errors, warnings };
    }

    const fieldMap = this.standardMappings[mappingKey][directionKey];

    // Check required fields
    const requiredFields = this.getRequiredFields(objectType, direction);
    for (const field of requiredFields) {
      if (!sourceData[field] && !fieldMap[field]) {
        warnings.push(`Required field '${field}' is missing or unmapped`);
      }
    }

    // Check for potential data loss
    const sourceFieldCount = Object.keys(sourceData).length;
    const mappableFieldCount = Object.keys(sourceData).filter(f => fieldMap[f]).length;

    if (mappableFieldCount < sourceFieldCount * 0.5) {
      warnings.push(`Only ${mappableFieldCount} of ${sourceFieldCount} fields can be mapped (${Math.round(mappableFieldCount/sourceFieldCount*100)}%)`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      coverage: mappableFieldCount / sourceFieldCount
    };
  }

  /**
   * Auto-detect field mappings based on similarity
   */
  autoDetectMappings(sourceFields, targetFields, threshold = 0.7) {
    const suggestions = [];

    for (const sourceField of sourceFields) {
      let bestMatch = null;
      let bestScore = 0;

      for (const targetField of targetFields) {
        const score = this.calculateFieldSimilarity(sourceField, targetField);

        if (score > bestScore && score >= threshold) {
          bestScore = score;
          bestMatch = targetField;
        }
      }

      if (bestMatch) {
        suggestions.push({
          source: sourceField,
          target: bestMatch,
          confidence: bestScore,
          status: bestScore > 0.9 ? 'high' : bestScore > 0.8 ? 'medium' : 'low'
        });
      }
    }

    return suggestions;
  }

  /**
   * Calculate similarity between field names
   */
  calculateFieldSimilarity(field1, field2) {
    // Normalize field names
    const norm1 = field1.toLowerCase().replace(/[_\s-]/g, '');
    const norm2 = field2.toLowerCase().replace(/[_\s-]/g, '');

    // Exact match
    if (norm1 === norm2) return 1;

    // Check if one contains the other
    if (norm1.includes(norm2) || norm2.includes(norm1)) {
      return 0.8;
    }

    // Levenshtein distance
    const distance = this.levenshteinDistance(norm1, norm2);
    const maxLength = Math.max(norm1.length, norm2.length);
    const similarity = 1 - (distance / maxLength);

    return similarity;
  }

  /**
   * Calculate Levenshtein distance
   */
  levenshteinDistance(str1, str2) {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Check if field needs transformation
   */
  shouldTransform(field, objectType) {
    const dateFields = ['closedate', 'CloseDate', 'createdate', 'CreatedDate', 'LastModifiedDate', 'lastmodifieddate', 'Birthdate', 'date_of_birth'];
    const booleanFields = ['HasOptedOutOfEmail', 'DoNotCall', 'IsClosed', 'IsWon', 'unsubscribed_from_email', 'hs_do_not_call', 'hs_is_closed', 'hs_is_closed_won'];
    const currencyFields = ['Amount', 'amount', 'AnnualRevenue', 'annualrevenue', 'ExpectedRevenue', 'hs_tcv'];

    return dateFields.includes(field) || booleanFields.includes(field) || currencyFields.includes(field);
  }

  /**
   * Get appropriate transformer for a field
   */
  getTransformer(field, objectType, direction) {
    const dateFields = ['closedate', 'CloseDate', 'createdate', 'CreatedDate', 'LastModifiedDate', 'lastmodifieddate', 'Birthdate', 'date_of_birth'];
    const booleanFields = ['HasOptedOutOfEmail', 'DoNotCall', 'IsClosed', 'IsWon', 'unsubscribed_from_email', 'hs_do_not_call', 'hs_is_closed', 'hs_is_closed_won'];
    const currencyFields = ['Amount', 'amount', 'AnnualRevenue', 'annualrevenue', 'ExpectedRevenue', 'hs_tcv'];

    if (dateFields.includes(field)) {
      return this.typeTransformers.date[direction];
    } else if (booleanFields.includes(field)) {
      return this.typeTransformers.boolean[direction];
    } else if (currencyFields.includes(field)) {
      return this.typeTransformers.currency[direction];
    }

    return null;
  }

  /**
   * Get required fields for an object type
   */
  getRequiredFields(objectType, direction) {
    const requirements = {
      'contact': {
        'salesforce_to_hubspot': ['LastName', 'Email'],
        'hubspot_to_salesforce': ['lastname', 'email']
      },
      'company': {
        'salesforce_to_hubspot': ['Name'],
        'hubspot_to_salesforce': ['name']
      },
      'deal': {
        'salesforce_to_hubspot': ['Name', 'StageName', 'CloseDate'],
        'hubspot_to_salesforce': ['dealname', 'dealstage']
      }
    };

    const objKey = objectType.toLowerCase();
    const dirKey = direction.toLowerCase();

    return requirements[objKey] && requirements[objKey][dirKey] ? requirements[objKey][dirKey] : [];
  }

  /**
   * Load custom mappings from file
   */
  loadCustomMappings() {
    try {
      const mappingFile = path.join(this.config.mappingDir, 'custom-mappings.json');
      if (fs.existsSync(mappingFile)) {
        const data = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));
        for (const [key, value] of Object.entries(data)) {
          this.customMappings.set(key, value);
        }
      }
    } catch (error) {
      console.error('Error loading custom mappings:', error);
    }
  }

  /**
   * Save custom mappings to file
   */
  saveCustomMappings() {
    try {
      const mappingFile = path.join(this.config.mappingDir, 'custom-mappings.json');
      const data = {};

      for (const [key, value] of this.customMappings.entries()) {
        data[key] = value;
      }

      // Ensure directory exists
      if (!fs.existsSync(this.config.mappingDir)) {
        fs.mkdirSync(this.config.mappingDir, { recursive: true });
      }

      fs.writeFileSync(mappingFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error saving custom mappings:', error);
    }
  }

  /**
   * Export mapping configuration
   */
  exportMappings() {
    return {
      standard: this.standardMappings,
      custom: Object.fromEntries(this.customMappings),
      stages: this.stageMappings,
      transformers: Object.keys(this.typeTransformers)
    };
  }

  /**
   * Import mapping configuration
   */
  importMappings(config) {
    if (config.standard) {
      this.standardMappings = { ...this.standardMappings, ...config.standard };
    }

    if (config.custom) {
      for (const [key, value] of Object.entries(config.custom)) {
        this.customMappings.set(key, value);
      }
    }

    if (config.stages) {
      this.stageMappings = { ...this.stageMappings, ...config.stages };
    }

    // Save if autoLearn is enabled
    if (this.config.autoLearn) {
      this.saveCustomMappings();
    }
  }
}

module.exports = FieldMappingEngine;