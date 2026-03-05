/**
 * Report Field Translator
 * Instance-agnostic tool for translating field names between different report type formats
 *
 * Handles the complex field naming requirements for different Salesforce report types:
 * - CustomEntity$ reports use CUST_* for system fields
 * - Custom report types use Object$Field notation
 * - Standard reports use different patterns
 */

class ReportFieldTranslator {
    constructor() {
        // System field mappings for CustomEntity reports
        this.customEntitySystemFields = {
            'Name': 'CUST_NAME',
            'CreatedDate': 'CUST_CREATED_DATE',
            'CreatedBy': 'CUST_CREATED_BY',
            'LastModifiedDate': 'CUST_LAST_UPDATE',
            'LastModifiedBy': 'CUST_LAST_UPDATE_BY',
            'LastActivityDate': 'CUST_LAST_ACTIVITY',
            'Id': 'CUST_ID',
            'RecordType': 'CUST_RECORDTYPE',
            'Owner': 'CUST_OWNER_NAME'
        };

        // Standard object field mappings
        this.standardObjectFields = {
            'Lead': {
                'Name': 'NAME',
                'Company': 'COMPANY',
                'Status': 'STATUS',
                'Owner': 'OWNER.FULL_NAME',
                'Email': 'EMAIL'
            },
            'Contact': {
                'Name': 'NAME',
                'Account': 'ACCOUNT.NAME',
                'Owner': 'OWNER.FULL_NAME',
                'Email': 'EMAIL',
                'Phone': 'PHONE1'
            },
            'Opportunity': {
                'Name': 'NAME',
                'Account': 'ACCOUNT.NAME',
                'Owner': 'FULL_NAME',
                'Amount': 'AMOUNT',
                'Stage': 'STAGE_NAME',
                'CloseDate': 'CLOSE_DATE'
            },
            'Account': {
                'Name': 'NAME',
                'Owner': 'OWNER.FULL_NAME',
                'Type': 'TYPE',
                'Industry': 'INDUSTRY'
            }
        };
    }

    /**
     * Detect report type from metadata
     */
    detectReportType(reportMetadata) {
        const reportType = reportMetadata.reportType || '';

        if (reportType.startsWith('CustomEntity$')) {
            return {
                type: 'CustomEntity',
                objectName: reportType.replace('CustomEntity$', '')
            };
        }

        if (reportType.endsWith('__c')) {
            return {
                type: 'CustomReportType',
                reportTypeName: reportType
            };
        }

        // Check for standard report types
        const standardTypes = ['LeadList', 'ContactList', 'Opportunity', 'AccountList', 'CaseList'];
        if (standardTypes.includes(reportType)) {
            return {
                type: 'Standard',
                reportTypeName: reportType
            };
        }

        return {
            type: 'Unknown',
            reportTypeName: reportType
        };
    }

    /**
     * Translate field reference based on report type
     */
    translateField(fieldRef, reportType, direction = 'toAPI') {
        const typeInfo = typeof reportType === 'string'
            ? this.detectReportType({ reportType })
            : reportType;

        if (typeInfo.type === 'CustomEntity') {
            return this.translateCustomEntityField(fieldRef, typeInfo.objectName, direction);
        }

        if (typeInfo.type === 'CustomReportType') {
            return this.translateCustomReportTypeField(fieldRef, direction);
        }

        if (typeInfo.type === 'Standard') {
            return this.translateStandardField(fieldRef, typeInfo.reportTypeName, direction);
        }

        return fieldRef; // Return unchanged if unknown
    }

    /**
     * Translate CustomEntity report fields
     */
    translateCustomEntityField(fieldRef, objectName, direction) {
        // Parse field reference
        const parts = fieldRef.split('.');

        if (direction === 'toAPI') {
            // Convert from user format to API format
            if (parts.length === 1) {
                // System field
                const systemField = this.customEntitySystemFields[parts[0]];
                if (systemField) return systemField;

                // Check if it's already in CUST_ format
                if (parts[0].startsWith('CUST_')) return parts[0];

                // Assume it's a direct field name that needs object prefix
                return `${objectName}.${parts[0]}`;
            }

            if (parts.length === 2 && parts[0] === objectName) {
                // Already in correct format (Object__c.Field__c)
                return fieldRef;
            }

            // Handle relationship fields
            if (parts[1] && (parts[1] === 'Name' || parts[1].endsWith('__c'))) {
                return fieldRef;
            }
        } else {
            // Convert from API format to user format
            if (fieldRef.startsWith('CUST_')) {
                // Find the original field name
                for (const [original, cust] of Object.entries(this.customEntitySystemFields)) {
                    if (cust === fieldRef) return original;
                }
            }

            // Keep object.field format as-is for custom fields
            if (fieldRef.startsWith(objectName)) {
                return fieldRef;
            }
        }

        return fieldRef;
    }

    /**
     * Translate custom report type fields (Object$Field notation)
     */
    translateCustomReportTypeField(fieldRef, direction) {
        if (direction === 'toAPI') {
            // Convert Object.Field to Object$Field
            if (fieldRef.includes('.')) {
                return fieldRef.replace('.', '$');
            }

            // Check if already in $ format
            if (fieldRef.includes('$')) {
                return fieldRef;
            }
        } else {
            // Convert Object$Field to Object.Field
            if (fieldRef.includes('$')) {
                return fieldRef.replace('$', '.');
            }
        }

        return fieldRef;
    }

    /**
     * Translate standard report fields
     */
    translateStandardField(fieldRef, reportTypeName, direction) {
        // Determine object from report type
        let objectName = null;
        if (reportTypeName === 'LeadList') objectName = 'Lead';
        else if (reportTypeName === 'ContactList') objectName = 'Contact';
        else if (reportTypeName === 'Opportunity') objectName = 'Opportunity';
        else if (reportTypeName === 'AccountList') objectName = 'Account';

        if (!objectName || !this.standardObjectFields[objectName]) {
            return fieldRef;
        }

        const fieldMap = this.standardObjectFields[objectName];

        if (direction === 'toAPI') {
            return fieldMap[fieldRef] || fieldRef;
        } else {
            // Reverse lookup
            for (const [original, api] of Object.entries(fieldMap)) {
                if (api === fieldRef) return original;
            }
        }

        return fieldRef;
    }

    /**
     * Translate entire report metadata
     */
    translateReportMetadata(metadata, direction = 'toAPI') {
        const translated = { ...metadata };
        const reportType = this.detectReportType(metadata);

        // Translate columns
        if (translated.columns) {
            translated.columns = translated.columns.map(col => ({
                ...col,
                field: this.translateField(col.field, reportType, direction)
            }));
        }

        // Translate filters
        if (translated.filter?.criteriaItems) {
            translated.filter.criteriaItems = translated.filter.criteriaItems.map(item => ({
                ...item,
                column: this.translateField(item.column, reportType, direction)
            }));
        }

        // Translate groupings
        if (translated.groupingsDown) {
            translated.groupingsDown = translated.groupingsDown.map(group => ({
                ...group,
                field: this.translateField(group.field, reportType, direction)
            }));
        }

        if (translated.groupingsAcross) {
            translated.groupingsAcross = translated.groupingsAcross.map(group => ({
                ...group,
                field: this.translateField(group.field, reportType, direction)
            }));
        }

        // Translate sort column
        if (translated.sortColumn) {
            translated.sortColumn = this.translateField(translated.sortColumn, reportType, direction);
        }

        return translated;
    }

    /**
     * Validate field references for a report type
     */
    validateFields(fields, reportType) {
        const errors = [];
        const warnings = [];
        const typeInfo = this.detectReportType({ reportType });

        fields.forEach(field => {
            if (typeInfo.type === 'CustomEntity') {
                // Check for common mistakes
                if (field.includes('__c.Name')) {
                    warnings.push({
                        field,
                        message: 'Use CUST_NAME instead of Object__c.Name for CustomEntity reports',
                        suggestion: 'CUST_NAME'
                    });
                } else if (field.includes('__c.CreatedDate')) {
                    warnings.push({
                        field,
                        message: 'Use CUST_CREATED_DATE instead of Object__c.CreatedDate',
                        suggestion: 'CUST_CREATED_DATE'
                    });
                }
            }

            if (typeInfo.type === 'Standard') {
                // Check for incorrect patterns
                if (field === 'OWNER' && typeInfo.reportTypeName !== 'Opportunity') {
                    errors.push({
                        field,
                        message: 'Use OWNER.FULL_NAME instead of OWNER',
                        suggestion: 'OWNER.FULL_NAME'
                    });
                }
            }
        });

        return { errors, warnings };
    }

    /**
     * Auto-fix common field reference issues
     */
    autoFixFields(metadata) {
        const fixed = this.translateReportMetadata(metadata, 'toAPI');
        const reportType = this.detectReportType(metadata);

        // Additional fixes based on report type
        if (reportType.type === 'CustomEntity') {
            // Ensure aggregate formulas have correct names
            if (fixed.aggregates) {
                fixed.aggregates = fixed.aggregates.map(agg => {
                    if (agg.developerName && !agg.developerName.startsWith('FORMULA')) {
                        return {
                            ...agg,
                            developerName: `FORMULA${agg.developerName}`
                        };
                    }
                    return agg;
                });
            }
        }

        return fixed;
    }

    /**
     * Get field suggestions for a report type
     */
    getFieldSuggestions(reportType, objectName = null) {
        const typeInfo = this.detectReportType({ reportType });
        const suggestions = [];

        if (typeInfo.type === 'CustomEntity' && objectName) {
            // System fields
            suggestions.push(
                { field: 'CUST_NAME', description: 'Record name' },
                { field: 'CUST_CREATED_DATE', description: 'Created date' },
                { field: 'CUST_LAST_UPDATE', description: 'Last modified date' },
                { field: 'CUST_OWNER_NAME', description: 'Record owner' }
            );

            // Common custom field patterns
            suggestions.push(
                { field: `${objectName}.Status__c`, description: 'Status field (if exists)' },
                { field: `${objectName}.Account__c`, description: 'Account lookup (if exists)' }
            );
        }

        if (typeInfo.type === 'Standard') {
            const objectName = this.getObjectFromReportType(typeInfo.reportTypeName);
            if (objectName && this.standardObjectFields[objectName]) {
                Object.entries(this.standardObjectFields[objectName]).forEach(([key, value]) => {
                    suggestions.push({
                        field: value,
                        description: key
                    });
                });
            }
        }

        return suggestions;
    }

    getObjectFromReportType(reportTypeName) {
        const mapping = {
            'LeadList': 'Lead',
            'ContactList': 'Contact',
            'Opportunity': 'Opportunity',
            'AccountList': 'Account',
            'CaseList': 'Case'
        };
        return mapping[reportTypeName];
    }
}

// Export for use as module
module.exports = { ReportFieldTranslator };

// CLI interface for testing
if (require.main === module) {
    const translator = new ReportFieldTranslator();

    // Example usage
    const examples = [
        {
            field: 'Subscription__c.Name',
            reportType: 'CustomEntity$Subscription__c'
        },
        {
            field: 'CreatedDate',
            reportType: 'CustomEntity$Subscription__c'
        },
        {
            field: 'Owner',
            reportType: 'LeadList'
        }
    ];

    console.log('Report Field Translation Examples:\n');
    examples.forEach(ex => {
        const translated = translator.translateField(ex.field, ex.reportType);
        console.log(`${ex.field} (${ex.reportType}) → ${translated}`);
    });

    // Show suggestions
    console.log('\nField Suggestions for CustomEntity$Subscription__c:');
    const suggestions = translator.getFieldSuggestions('CustomEntity$Subscription__c', 'Subscription__c');
    suggestions.forEach(s => {
        console.log(`  ${s.field} - ${s.description}`);
    });
}