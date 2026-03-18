/**
 * Salesforce Upsert Field Mapper
 *
 * Handles field mapping, transformations, and null handling
 * for Lead/Contact/Account upsert operations.
 *
 * @module upsert-field-mapper
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

/**
 * Default field mappings
 */
const DEFAULT_MAPPINGS = {
    leadToContact: {
        FirstName: 'FirstName',
        LastName: 'LastName',
        Email: 'Email',
        Phone: 'Phone',
        MobilePhone: 'MobilePhone',
        Title: 'Title',
        LeadSource: 'LeadSource',
        Street: 'MailingStreet',
        City: 'MailingCity',
        State: 'MailingState',
        PostalCode: 'MailingPostalCode',
        Country: 'MailingCountry',
        Description: 'Description'
    },
    leadToAccount: {
        Company: 'Name',
        Website: 'Website',
        Industry: 'Industry',
        NumberOfEmployees: 'NumberOfEmployees',
        AnnualRevenue: 'AnnualRevenue',
        Phone: 'Phone',
        Street: 'BillingStreet',
        City: 'BillingCity',
        State: 'BillingState',
        PostalCode: 'BillingPostalCode',
        Country: 'BillingCountry',
        Description: 'Description'
    }
};

/**
 * Default transformations
 */
const DEFAULT_TRANSFORMATIONS = {
    Email: { transform: 'lowercase' },
    Phone: { transform: 'phoneNormalize' },
    MobilePhone: { transform: 'phoneNormalize' },
    Company: { transform: 'companyNormalize' },
    Website: { transform: 'urlNormalize' }
};

/**
 * Null handling strategies
 */
const NULL_HANDLING = {
    PRESERVE_EXISTING: 'preserveExisting',
    ALLOW_NULL: 'allowNull',
    USE_DEFAULT: 'useDefault',
    SKIP_FIELD: 'skipField'
};

/**
 * Common company suffixes to normalize
 */
const COMPANY_SUFFIXES = [
    'inc', 'inc.', 'incorporated',
    'llc', 'l.l.c.', 'limited liability company',
    'ltd', 'ltd.', 'limited',
    'corp', 'corp.', 'corporation',
    'co', 'co.', 'company',
    'plc', 'p.l.c.',
    'gmbh', 'ag', 'sa', 'bv', 'nv'
];

/**
 * UpsertFieldMapper class
 */
class UpsertFieldMapper {
    /**
     * Create a new UpsertFieldMapper
     * @param {Object} config - Configuration options
     */
    constructor(config = {}) {
        this.config = {
            mappings: config.mappings || DEFAULT_MAPPINGS,
            transformations: config.transformations || DEFAULT_TRANSFORMATIONS,
            nullHandling: {
                default: config.nullHandling?.default || NULL_HANDLING.PRESERVE_EXISTING,
                overrides: config.nullHandling?.overrides || {}
            },
            defaults: config.defaults || {},
            customTransformers: config.customTransformers || {}
        };

        // Built-in transformers
        this.transformers = {
            lowercase: (value) => value?.toLowerCase?.() || value,
            uppercase: (value) => value?.toUpperCase?.() || value,
            trim: (value) => value?.trim?.() || value,
            phoneNormalize: this.normalizePhone.bind(this),
            companyNormalize: this.normalizeCompany.bind(this),
            urlNormalize: this.normalizeUrl.bind(this),
            toNumber: (value) => value ? Number(value) : null,
            toBoolean: (value) => value === true || value === 'true' || value === '1',
            toDate: (value) => value ? new Date(value).toISOString().split('T')[0] : null,
            ...config.customTransformers
        };
    }

    /**
     * Map fields from source to target object
     * @param {Object} source - Source record
     * @param {string} objectType - Target object type (Lead, Contact, Account)
     * @param {Object} existingRecord - Existing record for null handling
     * @returns {Object} Mapped record
     */
    mapFields(source, objectType, existingRecord = null) {
        const result = {};

        // Get the appropriate mapping for the target object
        const mapping = this.getMappingForObject(objectType, source);

        for (const [sourceField, targetConfig] of Object.entries(mapping)) {
            const targetField = typeof targetConfig === 'string'
                ? targetConfig
                : targetConfig.target || targetConfig;

            // Get source value
            let value = source[sourceField];

            // Skip if source field not present
            if (value === undefined && !source.hasOwnProperty(sourceField)) {
                continue;
            }

            // Apply transformation
            const transformConfig = this.config.transformations[sourceField]
                || (typeof targetConfig === 'object' ? targetConfig : null);

            if (transformConfig?.transform && this.transformers[transformConfig.transform]) {
                value = this.transformers[transformConfig.transform](value);
            }

            // Apply null handling
            const nullStrategy = this.config.nullHandling.overrides[targetField]
                || this.config.nullHandling.default;

            const existingValue = existingRecord?.[targetField];
            const defaultValue = this.config.defaults[targetField]
                || (typeof targetConfig === 'object' ? targetConfig.default : null);

            value = this.applyNullHandling(value, existingValue, nullStrategy, defaultValue);

            // Only include field if value is defined
            if (value !== undefined) {
                result[targetField] = value;
            }
        }

        return result;
    }

    /**
     * Get mapping configuration for object type
     * @param {string} objectType - Target object type
     * @param {Object} source - Source record (to detect source type)
     * @returns {Object} Mapping configuration
     */
    getMappingForObject(objectType, source) {
        // Check if this is a Lead-to-Contact/Account conversion
        if (source._isLead || source.IsConverted !== undefined) {
            if (objectType === 'Contact') {
                return this.config.mappings.leadToContact || DEFAULT_MAPPINGS.leadToContact;
            }
            if (objectType === 'Account') {
                return this.config.mappings.leadToAccount || DEFAULT_MAPPINGS.leadToAccount;
            }
        }

        // Check for object-specific mapping
        if (this.config.mappings[objectType]) {
            return this.config.mappings[objectType];
        }

        // Default: pass-through mapping (field names match)
        return Object.fromEntries(
            Object.keys(source)
                .filter(k => !k.startsWith('_')) // Skip internal fields
                .map(k => [k, k])
        );
    }

    /**
     * Apply null handling strategy
     * @param {*} newValue - New value from source
     * @param {*} existingValue - Existing value in target
     * @param {string} strategy - Null handling strategy
     * @param {*} defaultValue - Default value if applicable
     * @returns {*} Final value
     */
    applyNullHandling(newValue, existingValue, strategy, defaultValue) {
        switch (strategy) {
            case NULL_HANDLING.PRESERVE_EXISTING:
                return newValue ?? existingValue;

            case NULL_HANDLING.ALLOW_NULL:
                return newValue;

            case NULL_HANDLING.USE_DEFAULT:
                return newValue ?? defaultValue ?? existingValue;

            case NULL_HANDLING.SKIP_FIELD:
                return newValue != null ? newValue : undefined;

            default:
                return newValue ?? existingValue;
        }
    }

    /**
     * Normalize phone number
     * @param {string} phone - Phone number
     * @returns {string|null} Normalized phone
     */
    normalizePhone(phone) {
        if (!phone) return null;

        const digits = phone.replace(/\D/g, '');

        // US 10-digit
        if (digits.length === 10) {
            return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
        }

        // US 11-digit with country code
        if (digits.length === 11 && digits[0] === '1') {
            return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
        }

        // International - return with + prefix
        if (digits.length > 10) {
            return `+${digits}`;
        }

        // Return as-is if can't normalize
        return phone.trim();
    }

    /**
     * Normalize company name
     * @param {string} company - Company name
     * @returns {string|null} Normalized company name
     */
    normalizeCompany(company) {
        if (!company) return null;

        let normalized = company
            .trim()
            .replace(/\s+/g, ' '); // Collapse multiple spaces

        // Note: We don't remove suffixes by default as they're part of legal name
        // Only normalize for matching purposes in the matcher

        return normalized;
    }

    /**
     * Normalize URL
     * @param {string} url - URL
     * @returns {string|null} Normalized URL
     */
    normalizeUrl(url) {
        if (!url) return null;

        let normalized = url.trim().toLowerCase();

        // Add protocol if missing
        if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
            normalized = 'https://' + normalized;
        }

        // Remove trailing slash
        normalized = normalized.replace(/\/+$/, '');

        // Remove www. prefix
        normalized = normalized.replace(/^(https?:\/\/)www\./, '$1');

        return normalized;
    }

    /**
     * Map picklist value using value mapping
     * @param {string} value - Source value
     * @param {Object} mapping - Value mapping
     * @returns {string|null} Mapped value
     */
    mapPicklistValue(value, mapping) {
        if (!value || !mapping) return value;

        // Direct mapping
        if (mapping[value]) {
            return mapping[value];
        }

        // Case-insensitive mapping
        const lowerValue = value.toLowerCase();
        for (const [key, mappedValue] of Object.entries(mapping)) {
            if (key.toLowerCase() === lowerValue) {
                return mappedValue;
            }
        }

        // Return original if no mapping found
        return value;
    }

    /**
     * Validate required fields
     * @param {Object} record - Record to validate
     * @param {string} objectType - Object type
     * @returns {Object} Validation result
     */
    validateRequiredFields(record, objectType) {
        const errors = [];

        const requiredFields = {
            Lead: ['LastName', 'Company'],
            Contact: ['LastName'],
            Account: ['Name']
        };

        const required = requiredFields[objectType] || [];

        for (const field of required) {
            if (!record[field]) {
                errors.push({
                    field,
                    error: 'REQUIRED_FIELD_MISSING',
                    message: `Required field '${field}' is missing`
                });
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Get fields that have changed between two records
     * @param {Object} newRecord - New record values
     * @param {Object} existingRecord - Existing record
     * @returns {Object} Changed fields with old and new values
     */
    getChangedFields(newRecord, existingRecord) {
        const changes = {};

        for (const [field, newValue] of Object.entries(newRecord)) {
            const existingValue = existingRecord[field];

            // Compare values (handle type coercion)
            if (String(newValue) !== String(existingValue)) {
                changes[field] = {
                    oldValue: existingValue,
                    newValue: newValue
                };
            }
        }

        return changes;
    }

    /**
     * Load mapping configuration from file
     * @param {string} configPath - Path to configuration file
     * @returns {Object} Configuration
     */
    static loadConfig(configPath) {
        try {
            const content = fs.readFileSync(configPath, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            console.warn(`Could not load config from ${configPath}:`, error.message);
            return {};
        }
    }

    /**
     * Create mapper from configuration file
     * @param {string} configPath - Path to configuration file
     * @returns {UpsertFieldMapper} Configured mapper
     */
    static fromConfig(configPath) {
        const config = UpsertFieldMapper.loadConfig(configPath);
        return new UpsertFieldMapper(config);
    }
}

/**
 * Convenience function to map Lead to Contact fields
 * @param {Object} lead - Lead record
 * @param {Object} existingContact - Existing Contact (optional)
 * @returns {Object} Mapped Contact fields
 */
function mapLeadToContact(lead, existingContact = null) {
    const mapper = new UpsertFieldMapper();
    return mapper.mapFields({ ...lead, _isLead: true }, 'Contact', existingContact);
}

/**
 * Convenience function to map Lead to Account fields
 * @param {Object} lead - Lead record
 * @param {Object} existingAccount - Existing Account (optional)
 * @returns {Object} Mapped Account fields
 */
function mapLeadToAccount(lead, existingAccount = null) {
    const mapper = new UpsertFieldMapper();
    return mapper.mapFields({ ...lead, _isLead: true }, 'Account', existingAccount);
}

module.exports = {
    UpsertFieldMapper,
    mapLeadToContact,
    mapLeadToAccount,
    NULL_HANDLING,
    DEFAULT_MAPPINGS,
    DEFAULT_TRANSFORMATIONS,
    COMPANY_SUFFIXES
};
