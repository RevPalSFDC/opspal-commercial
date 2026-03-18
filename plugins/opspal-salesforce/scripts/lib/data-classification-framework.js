#!/usr/bin/env node

/**
 * Data Classification Framework
 *
 * Automatically detects and classifies sensitive data fields in Salesforce.
 * Supports GDPR, HIPAA, and SOX compliance requirements.
 *
 * Classification Levels:
 *   - PUBLIC: Non-sensitive data, no restrictions
 *   - INTERNAL: Internal use only, not for external sharing
 *   - CONFIDENTIAL: Sensitive business data, restricted access
 *   - RESTRICTED: PII, PHI, financial data, strict controls required
 *
 * PII Categories:
 *   - Direct Identifiers: Name, Email, SSN, Phone, Address
 *   - Quasi-Identifiers: DOB, ZIP, Gender, Race
 *   - Sensitive Personal: Health, Financial, Biometric
 *
 * @version 1.0.0
 * @created 2025-10-25
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Data Classification Framework class
 */
class DataClassificationFramework {
    constructor(org, options = {}) {
        this.org = org;
        this.verbose = options.verbose || false;

        // PII field patterns (case-insensitive matching)
        this.piiPatterns = {
            // Direct identifiers (HIGH risk)
            DIRECT_IDENTIFIER: [
                /email/i,
                /ssn|social.*security/i,
                /tax.*id|tin|ein/i,
                /passport/i,
                /driver.*license|dl.*number/i,
                /national.*id|government.*id/i
            ],

            // Personal contact info (MEDIUM-HIGH risk)
            CONTACT_INFO: [
                /phone|mobile|fax/i,
                /address|street|city|state|zip|postal/i,
                /country/i,
                /latitude|longitude|geo/i
            ],

            // Demographic/Quasi-identifiers (MEDIUM risk)
            DEMOGRAPHIC: [
                /birth.*date|dob|age/i,
                /gender|sex/i,
                /race|ethnicity/i,
                /marital.*status/i,
                /nationality|citizenship/i
            ],

            // Financial (HIGH risk)
            FINANCIAL: [
                /credit.*card|cc.*number/i,
                /bank.*account|account.*number/i,
                /routing.*number/i,
                /salary|income|compensation/i,
                /tax|revenue/i
            ],

            // Health (PHI - HIGHEST risk for HIPAA)
            HEALTH: [
                /diagnosis|condition|symptom/i,
                /medication|prescription|rx/i,
                /treatment|procedure|surgery/i,
                /insurance|policy.*number/i,
                /medical.*record|patient.*id/i,
                /health.*status/i
            ]
        };

        // Classification levels
        this.classificationLevels = {
            PUBLIC: { score: 0, label: 'Public', requirements: [] },
            INTERNAL: { score: 1, label: 'Internal Use Only', requirements: ['Access controls'] },
            CONFIDENTIAL: { score: 2, label: 'Confidential', requirements: ['FLS', 'Sharing rules', 'Access logging'] },
            RESTRICTED: { score: 3, label: 'Restricted', requirements: ['FLS', 'Shield encryption', 'Audit trail', 'Access reviews'] }
        };
    }

    /**
     * Classify all fields in org
     */
    async classifyAllFields() {
        const startTime = Date.now();

        try {
            console.log('Classifying all fields...\n');

            // Query all fields
            const query = `SELECT QualifiedApiName, Label, DataType, EntityDefinition.QualifiedApiName FROM FieldDefinition WHERE EntityDefinition.IsCustomizable = true ORDER BY EntityDefinition.QualifiedApiName, QualifiedApiName`;

            const result = this.executeQuery(query, true);
            const fields = JSON.parse(result).result.records;

            const classified = {
                PUBLIC: [],
                INTERNAL: [],
                CONFIDENTIAL: [],
                RESTRICTED: []
            };

            for (const field of fields) {
                const classification = this.classifyField(field);
                classified[classification.level].push({
                    field: field.QualifiedApiName,
                    label: field.Label,
                    object: field.EntityDefinition?.QualifiedApiName,
                    dataType: field.DataType,
                    ...classification
                });
            }

            const summary = {
                totalFields: fields.length,
                byLevel: {
                    PUBLIC: classified.PUBLIC.length,
                    INTERNAL: classified.INTERNAL.length,
                    CONFIDENTIAL: classified.CONFIDENTIAL.length,
                    RESTRICTED: classified.RESTRICTED.length
                },
                piiFields: classified.RESTRICTED.length + classified.CONFIDENTIAL.filter(f => f.piiCategory).length,
                classificationTime: Date.now() - startTime
            };

            if (this.verbose) {
                this.printClassificationSummary(summary, classified);
            }

            return {
                summary,
                classified,
                compliance: this.generateComplianceReport(classified)
            };

        } catch (error) {
            console.error('Failed to classify fields:', error.message);
            throw error;
        }
    }

    /**
     * Classify individual field
     */
    classifyField(field) {
        const fieldName = field.QualifiedApiName || '';
        const label = field.Label || '';
        const combinedText = `${fieldName} ${label}`;

        // Check for PII patterns
        for (const [category, patterns] of Object.entries(this.piiPatterns)) {
            for (const pattern of patterns) {
                if (pattern.test(combinedText)) {
                    // Determine classification level based on PII category
                    let level = 'RESTRICTED';
                    if (category === 'CONTACT_INFO' || category === 'DEMOGRAPHIC') {
                        level = 'CONFIDENTIAL';
                    }

                    return {
                        level,
                        isPII: true,
                        piiCategory: category,
                        matchedPattern: pattern.source,
                        requirements: this.classificationLevels[level].requirements,
                        complianceFrameworks: this.getComplianceFrameworks(category)
                    };
                }
            }
        }

        // Check for standard sensitive fields
        if (this.isSensitiveStandardField(field)) {
            return {
                level: 'CONFIDENTIAL',
                isPII: false,
                requirements: this.classificationLevels.CONFIDENTIAL.requirements,
                complianceFrameworks: []
            };
        }

        // Default: Internal use only for custom fields, Public for standard
        const isCustom = fieldName.includes('__c');
        return {
            level: isCustom ? 'INTERNAL' : 'PUBLIC',
            isPII: false,
            requirements: this.classificationLevels[isCustom ? 'INTERNAL' : 'PUBLIC'].requirements,
            complianceFrameworks: []
        };
    }

    /**
     * Check if standard field is sensitive
     */
    isSensitiveStandardField(field) {
        const sensitiveFields = [
            'Account.AnnualRevenue',
            'Contact.Email',
            'Contact.Phone',
            'Contact.MailingAddress',
            'Lead.Email',
            'Lead.Phone',
            'Opportunity.Amount',
            'User.Email'
        ];

        const fullFieldName = `${field.EntityDefinition?.QualifiedApiName}.${field.QualifiedApiName.split('.').pop()}`;
        return sensitiveFields.includes(fullFieldName);
    }

    /**
     * Get applicable compliance frameworks
     */
    getComplianceFrameworks(piiCategory) {
        const frameworks = [];

        // GDPR applies to all PII
        if (piiCategory) {
            frameworks.push('GDPR');
        }

        // HIPAA applies to health data
        if (piiCategory === 'HEALTH') {
            frameworks.push('HIPAA');
        }

        // SOX applies to financial data
        if (piiCategory === 'FINANCIAL') {
            frameworks.push('SOX');
        }

        return frameworks;
    }

    /**
     * Generate compliance report
     */
    generateComplianceReport(classified) {
        return {
            gdpr: {
                applicableFields: classified.RESTRICTED.length + classified.CONFIDENTIAL.filter(f => f.isPII).length,
                directIdentifiers: classified.RESTRICTED.filter(f => f.piiCategory === 'DIRECT_IDENTIFIER').length,
                recommendations: [
                    'Implement data retention policies',
                    'Configure data deletion processes',
                    'Enable audit trail for PII access',
                    'Consider Shield encryption for direct identifiers'
                ]
            },
            hipaa: {
                applicableFields: classified.RESTRICTED.filter(f => f.piiCategory === 'HEALTH').length,
                recommendations: classified.RESTRICTED.filter(f => f.piiCategory === 'HEALTH').length > 0 ? [
                    'MANDATORY: Enable Shield Platform Encryption for PHI',
                    'MANDATORY: Implement field-level audit trail',
                    'MANDATORY: Restrict access via FLS to authorized personnel only',
                    'Configure Event Monitoring for PHI access tracking'
                ] : []
            },
            sox: {
                applicableFields: classified.RESTRICTED.filter(f => f.piiCategory === 'FINANCIAL').length +
                                 classified.CONFIDENTIAL.filter(f => f.piiCategory === 'FINANCIAL').length,
                recommendations: classified.RESTRICTED.filter(f => f.piiCategory === 'FINANCIAL').length > 0 ? [
                    'Implement change control for financial data fields',
                    'Enable field history tracking for audit trail',
                    'Restrict modification access via FLS',
                    'Implement segregation of duties for financial operations'
                ] : []
            }
        };
    }

    /**
     * Print classification summary
     */
    printClassificationSummary(summary, classified) {
        console.log('\n═══════════════════════════════════════════════════════════════════');
        console.log('DATA CLASSIFICATION SUMMARY');
        console.log('═══════════════════════════════════════════════════════════════════\n');

        console.log(`Total Fields Classified: ${summary.totalFields}`);
        console.log(`PII Fields Detected: ${summary.piiFields}\n`);

        console.log('CLASSIFICATION BREAKDOWN:\n');
        console.log(`  🟢 PUBLIC:       ${summary.byLevel.PUBLIC.toString().padStart(5)} fields (${(summary.byLevel.PUBLIC / summary.totalFields * 100).toFixed(1)}%)`);
        console.log(`  🟡 INTERNAL:     ${summary.byLevel.INTERNAL.toString().padStart(5)} fields (${(summary.byLevel.INTERNAL / summary.totalFields * 100).toFixed(1)}%)`);
        console.log(`  🟠 CONFIDENTIAL: ${summary.byLevel.CONFIDENTIAL.toString().padStart(5)} fields (${(summary.byLevel.CONFIDENTIAL / summary.totalFields * 100).toFixed(1)}%)`);
        console.log(`  🔴 RESTRICTED:   ${summary.byLevel.RESTRICTED.toString().padStart(5)} fields (${(summary.byLevel.RESTRICTED / summary.totalFields * 100).toFixed(1)}%)\n`);

        if (classified.RESTRICTED.length > 0) {
            console.log('🔴 RESTRICTED FIELDS (PII/PHI/Financial - Top 10):\n');
            classified.RESTRICTED.slice(0, 10).forEach(f => {
                console.log(`  ${f.field}`);
                console.log(`    Category: ${f.piiCategory}`);
                console.log(`    Compliance: ${f.complianceFrameworks.join(', ') || 'None'}`);
                console.log(`    Requirements: ${f.requirements.join(', ')}\n`);
            });
        }

        console.log('═══════════════════════════════════════════════════════════════════\n');
    }

    /**
     * Execute SOQL query
     */
    executeQuery(query, useToolingApi = false) {
        const toolingFlag = useToolingApi ? '--use-tooling-api' : '';
        const cmd = `sf data query --query "${query}" --target-org ${this.org} ${toolingFlag} --json`;

        return execSync(cmd, { encoding: 'utf8' });
    }

    // ====================================================================
    // PHASE 2 ENHANCEMENTS: VALUE-BASED PII DETECTION
    // ====================================================================

    /**
     * Classify field with value sampling (Phase 2 enhancement)
     *
     * Samples actual field values and applies pattern matching for higher accuracy.
     *
     * @param {Object} field - Field definition
     * @param {number} sampleSize - Number of records to sample (default: 100)
     * @returns {Object} Enhanced classification with confidence score
     */
    async classifyFieldWithSampling(field, sampleSize = 100) {
        // Get name-based classification first
        const nameClassification = this.classifyField(field);

        // For certain data types, value sampling adds little value
        const nonSampleableTypes = ['boolean', 'date', 'datetime', 'picklist', 'reference'];
        if (nonSampleableTypes.includes(field.DataType?.toLowerCase())) {
            return {
                ...nameClassification,
                confidence: 100,
                detectionMethod: 'name-based-only',
                note: 'Value sampling skipped for this data type'
            };
        }

        try {
            // Sample field values
            const objectName = field.EntityDefinition?.QualifiedApiName;
            const fieldName = field.QualifiedApiName;

            const sampleQuery = `
                SELECT ${fieldName}
                FROM ${objectName}
                WHERE ${fieldName} != null
                LIMIT ${sampleSize}
            `;

            const result = this.executeQuery(sampleQuery, false);
            const records = JSON.parse(result).result?.records || [];

            if (records.length === 0) {
                return {
                    ...nameClassification,
                    confidence: nameClassification.isPII ? 80 : 100,
                    detectionMethod: 'name-based-only',
                    note: 'No sample values available (empty field)'
                };
            }

            // Extract values
            const values = records.map(r => r[fieldName]).filter(v => v != null);

            // Pattern match on values
            const valueClassification = this.classifyByValues(values, field.DataType);

            // Merge classifications
            return this.mergeClassifications(nameClassification, valueClassification);

        } catch (error) {
            // Fallback to name-based if value sampling fails
            if (this.verbose) {
                console.warn(`Value sampling failed for ${field.QualifiedApiName}: ${error.message}`);
            }

            return {
                ...nameClassification,
                confidence: nameClassification.isPII ? 80 : 100,
                detectionMethod: 'name-based-only',
                note: 'Value sampling failed, using name-based classification'
            };
        }
    }

    /**
     * Classify based on field values using pattern matching
     *
     * @param {Array} values - Sample field values
     * @param {string} dataType - Field data type
     * @returns {Object} Classification based on value patterns
     */
    classifyByValues(values, dataType) {
        const patterns = {
            EMAIL: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
            PHONE: /^[\d\s\-\(\)\.+]{10,}$/,
            SSN: /^\d{3}-?\d{2}-?\d{4}$/,
            CREDIT_CARD: /^\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}$/,
            ZIP_CODE: /^\d{5}(-\d{4})?$/,
            DATE_OF_BIRTH: /^(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,
            IP_ADDRESS: /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
            URL: /^https?:\/\/.+/
        };

        const matches = Object.keys(patterns).reduce((acc, pattern) => {
            acc[pattern] = 0;
            return acc;
        }, {});

        // Test first 20 values for performance
        const sampleSize = Math.min(values.length, 20);
        for (let i = 0; i < sampleSize; i++) {
            const value = String(values[i] || '');

            for (const [patternName, regex] of Object.entries(patterns)) {
                if (regex.test(value)) {
                    matches[patternName]++;
                }
            }
        }

        // If >50% of samples match a PII pattern, classify as PII
        const threshold = sampleSize * 0.5;

        for (const [patternName, count] of Object.entries(matches)) {
            if (count >= threshold) {
                const piiCategory = this.mapPatternToPIICategory(patternName);
                const level = this.mapPIICategoryToLevel(piiCategory);

                return {
                    level,
                    isPII: true,
                    piiCategory,
                    detectionMethod: 'value-based',
                    confidence: Math.round((count / sampleSize) * 100),
                    matchedPattern: patternName,
                    matchCount: count,
                    sampleSize,
                    requirements: this.classificationLevels[level].requirements,
                    complianceFrameworks: this.getComplianceFrameworks(piiCategory)
                };
            }
        }

        // No PII patterns detected
        return {
            level: 'INTERNAL',
            isPII: false,
            detectionMethod: 'value-based',
            confidence: 100,
            note: 'No PII patterns detected in values',
            requirements: this.classificationLevels.INTERNAL.requirements,
            complianceFrameworks: []
        };
    }

    /**
     * Map pattern name to PII category
     */
    mapPatternToPIICategory(patternName) {
        const mapping = {
            'EMAIL': 'DIRECT_IDENTIFIER',
            'PHONE': 'CONTACT_INFO',
            'SSN': 'DIRECT_IDENTIFIER',
            'CREDIT_CARD': 'FINANCIAL',
            'ZIP_CODE': 'CONTACT_INFO',
            'DATE_OF_BIRTH': 'DEMOGRAPHIC',
            'IP_ADDRESS': 'CONTACT_INFO',
            'URL': 'INTERNAL'
        };

        return mapping[patternName] || 'INTERNAL';
    }

    /**
     * Map PII category to classification level
     */
    mapPIICategoryToLevel(piiCategory) {
        const mapping = {
            'DIRECT_IDENTIFIER': 'RESTRICTED',
            'FINANCIAL': 'RESTRICTED',
            'HEALTH': 'RESTRICTED',
            'CONTACT_INFO': 'CONFIDENTIAL',
            'DEMOGRAPHIC': 'CONFIDENTIAL'
        };

        return mapping[piiCategory] || 'INTERNAL';
    }

    /**
     * Merge name-based and value-based classifications
     *
     * Takes the highest classification level and confidence score.
     */
    mergeClassifications(nameClass, valueClass) {
        // Classification level priority: RESTRICTED > CONFIDENTIAL > INTERNAL > PUBLIC
        const levelPriority = { RESTRICTED: 3, CONFIDENTIAL: 2, INTERNAL: 1, PUBLIC: 0 };

        const nameLevel = levelPriority[nameClass.level] || 0;
        const valueLevel = levelPriority[valueClass.level] || 0;

        // Use higher classification level
        const finalLevel = nameLevel >= valueLevel ? nameClass.level : valueClass.level;

        // Combine detection methods
        const detectionMethods = [];
        if (nameClass.isPII) detectionMethods.push('name-based');
        if (valueClass.detectionMethod === 'value-based') detectionMethods.push('value-based');

        // Calculate combined confidence
        let confidence = 100;
        if (nameClass.isPII && valueClass.isPII) {
            // Both methods detected PII - high confidence
            confidence = 100;
        } else if (nameClass.isPII && !valueClass.isPII) {
            // Name detected but not values - medium confidence
            confidence = 80;
        } else if (!nameClass.isPII && valueClass.isPII) {
            // Values detected but not name - medium confidence
            confidence = 85;
        } else {
            // Neither detected PII
            confidence = 100;
        }

        return {
            level: finalLevel,
            isPII: nameClass.isPII || valueClass.isPII,
            piiCategory: nameClass.piiCategory || valueClass.piiCategory,
            detectionMethod: detectionMethods.join(' + '),
            confidence,
            matchedPattern: valueClass.matchedPattern || nameClass.matchedPattern,
            requirements: this.classificationLevels[finalLevel].requirements,
            complianceFrameworks: [...new Set([
                ...(nameClass.complianceFrameworks || []),
                ...(valueClass.complianceFrameworks || [])
            ])]
        };
    }

    /**
     * Detect composite PII (multiple fields together = PII)
     *
     * Examples:
     * - FirstName + LastName = Direct Identifier
     * - Street + City + State + ZIP = Full Address
     * - DOB + ZIP = Quasi-identifier (can re-identify 87% of US population)
     *
     * @param {Array} fields - All fields for an object
     * @returns {Array} Composite PII combinations
     */
    detectCompositePII(fields) {
        const composites = [];

        // Helper to find field by pattern
        const findField = (pattern) => fields.find(f =>
            pattern.test(f.QualifiedApiName) || pattern.test(f.Label)
        );

        // 1. FirstName + LastName = DIRECT_IDENTIFIER
        const firstName = findField(/first.*name/i);
        const lastName = findField(/last.*name/i);

        if (firstName && lastName) {
            composites.push({
                type: 'FULL_NAME',
                fields: [firstName.QualifiedApiName, lastName.QualifiedApiName],
                classification: 'RESTRICTED',
                piiCategory: 'DIRECT_IDENTIFIER',
                complianceFrameworks: ['GDPR'],
                note: 'Full name is a direct identifier under GDPR'
            });
        }

        // 2. Full Address = CONFIDENTIAL (Contact Info)
        const street = findField(/street|address.*line/i);
        const city = findField(/city/i);
        const state = findField(/state|province/i);
        const zip = findField(/zip|postal/i);

        if (street && city && state && zip) {
            composites.push({
                type: 'FULL_ADDRESS',
                fields: [street, city, state, zip].map(f => f.QualifiedApiName),
                classification: 'CONFIDENTIAL',
                piiCategory: 'CONTACT_INFO',
                complianceFrameworks: ['GDPR'],
                note: 'Complete mailing address'
            });
        }

        // 3. DOB + ZIP = QUASI_IDENTIFIER
        const dob = findField(/birth.*date|dob/i);
        if (dob && zip) {
            composites.push({
                type: 'QUASI_IDENTIFIER',
                fields: [dob.QualifiedApiName, zip.QualifiedApiName],
                classification: 'CONFIDENTIAL',
                piiCategory: 'DEMOGRAPHIC',
                complianceFrameworks: ['GDPR'],
                note: 'DOB + ZIP can re-identify 87% of US population (Sweeney, 2000)',
                reference: 'https://dataprivacylab.org/projects/identifiability/'
            });
        }

        // 4. Email + Phone = Enhanced Contact Profile
        const email = findField(/email/i);
        const phone = findField(/phone|mobile/i);

        if (email && phone) {
            composites.push({
                type: 'CONTACT_PROFILE',
                fields: [email.QualifiedApiName, phone.QualifiedApiName],
                classification: 'RESTRICTED',
                piiCategory: 'DIRECT_IDENTIFIER',
                complianceFrameworks: ['GDPR'],
                note: 'Multiple contact methods increase re-identification risk'
            });
        }

        // 5. Financial Combo: Account Number + Routing Number
        const accountNumber = findField(/account.*number|bank.*account/i);
        const routingNumber = findField(/routing.*number/i);

        if (accountNumber && routingNumber) {
            composites.push({
                type: 'BANK_ACCOUNT',
                fields: [accountNumber.QualifiedApiName, routingNumber.QualifiedApiName],
                classification: 'RESTRICTED',
                piiCategory: 'FINANCIAL',
                complianceFrameworks: ['SOX', 'GDPR'],
                note: 'Complete bank account information - highest protection required'
            });
        }

        return composites;
    }
}

/**
 * CLI interface
 */
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command || command === '--help' || command === '-h') {
        console.log(`
Data Classification Framework - Detect and classify sensitive data

Commands:
  classify <org>    Classify all fields in org

Examples:
  node data-classification-framework.js classify beta-corp-revpal-sandbox
`);
        process.exit(0);
    }

    const org = args[1] || 'beta-corp-revpal-sandbox';
    const framework = new DataClassificationFramework(org, { verbose: true });

    (async () => {
        try {
            if (command === 'classify') {
                const result = await framework.classifyAllFields();

                // Write results to file
                const outputDir = `./instances/${org}/data-classification-${new Date().toISOString().split('T')[0]}`;
                if (!fs.existsSync(outputDir)) {
                    fs.mkdirSync(outputDir, { recursive: true });
                }

                fs.writeFileSync(
                    path.join(outputDir, 'classification-results.json'),
                    JSON.stringify(result, null, 2),
                    'utf8'
                );

                console.log(`\n✅ Classification results saved to: ${outputDir}/classification-results.json`);
                process.exit(0);

            } else {
                console.error(`Unknown command: ${command}`);
                process.exit(1);
            }
        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    })();
}

module.exports = DataClassificationFramework;
