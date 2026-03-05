#!/usr/bin/env node

/**
 * Change Validation Framework
 * ============================
 * Validates that planned changes don't exceed requested scope
 * Enforces preservation-first principle for metadata modifications
 */

class ChangeValidator {
    constructor() {
        this.validationRules = this.loadValidationRules();
        this.preservationRequirements = this.loadPreservationRequirements();
    }

    /**
     * Load validation rules for different change types
     */
    loadValidationRules() {
        return {
            objectRelabel: {
                allowed: ['label', 'pluralLabel', 'description'],
                prohibited: ['nameField', 'fields', 'validationRules', 'recordTypes', 'sharingModel']
            },
            fieldUpdate: {
                allowed: ['label', 'helpText', 'description', 'inlineHelpText'],
                prohibited: ['type', 'length', 'precision', 'scale', 'required', 'unique', 'defaultValue']
            },
            fieldCreate: {
                required: ['type', 'label', 'fullName'],
                optional: ['length', 'precision', 'scale', 'required', 'unique', 'defaultValue', 'helpText']
            }
        };
    }

    /**
     * Load preservation requirements
     */
    loadPreservationRequirements() {
        return {
            alwaysPreserve: [
                'existingFields',
                'existingValidationRules',
                'existingRecordTypes',
                'existingPageLayouts',
                'existingApexTriggers',
                'existingFlows',
                'existingProcessBuilders'
            ],
            neverChangeWithoutRequest: [
                'fieldType',
                'fieldLength',
                'fieldPrecision',
                'requiredStatus',
                'uniqueStatus',
                'defaultValues',
                'picklistValues',
                'formulaDefinitions'
            ]
        };
    }

    /**
     * Validate that planned changes don't exceed requested scope
     */
    async validateChangeScope(requested, planned, changeType) {
        const validation = {
            valid: true,
            violations: [],
            extraChanges: [],
            missingPreservation: [],
            requiresApproval: false
        };

        // Get rules for this change type
        const rules = this.validationRules[changeType];
        if (!rules) {
            validation.violations.push(`Unknown change type: ${changeType}`);
            validation.valid = false;
            return validation;
        }

        // Check for prohibited changes
        for (const change of planned) {
            if (rules.prohibited && rules.prohibited.includes(change.field)) {
                validation.violations.push({
                    field: change.field,
                    violation: 'PROHIBITED_CHANGE',
                    message: `Cannot modify ${change.field} during ${changeType} operation`,
                    severity: 'CRITICAL'
                });
                validation.valid = false;
            }

            // Check if change was requested
            if (!this.wasChangeRequested(change, requested)) {
                validation.extraChanges.push({
                    field: change.field,
                    from: change.oldValue,
                    to: change.newValue,
                    risk: this.assessRisk(change)
                });
                validation.requiresApproval = true;
            }
        }

        // Check preservation requirements
        const preservationCheck = this.validatePreservation(planned);
        if (!preservationCheck.valid) {
            validation.missingPreservation = preservationCheck.missing;
            validation.valid = false;
        }

        return validation;
    }

    /**
     * Check if a change was explicitly requested
     */
    wasChangeRequested(change, requested) {
        return requested.some(req => 
            req.field === change.field && 
            req.action === change.action
        );
    }

    /**
     * Validate that required elements are preserved
     */
    validatePreservation(planned) {
        const result = {
            valid: true,
            missing: []
        };

        // Check if any "never change" items are being modified
        for (const change of planned) {
            if (this.preservationRequirements.neverChangeWithoutRequest.includes(change.field)) {
                if (!change.explicitlyRequested) {
                    result.valid = false;
                    result.missing.push({
                        field: change.field,
                        issue: 'UNREQUESTED_MODIFICATION',
                        message: `${change.field} cannot be changed without explicit request`
                    });
                }
            }
        }

        return result;
    }

    /**
     * Assess risk level of a change
     */
    assessRisk(change) {
        const highRiskChanges = ['fieldType', 'required', 'unique', 'sharingModel'];
        const mediumRiskChanges = ['length', 'precision', 'defaultValue', 'picklistValues'];
        
        if (highRiskChanges.includes(change.field)) {
            return 'HIGH';
        } else if (mediumRiskChanges.includes(change.field)) {
            return 'MEDIUM';
        }
        return 'LOW';
    }

    /**
     * Generate validation report
     */
    generateReport(validation) {
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                valid: validation.valid,
                violationCount: validation.violations.length,
                extraChangeCount: validation.extraChanges.length,
                requiresApproval: validation.requiresApproval
            },
            details: validation
        };

        // Format for display
        let output = '\n=== Change Validation Report ===\n';
        output += `Status: ${validation.valid ? '✅ VALID' : '❌ INVALID'}\n`;
        output += `Timestamp: ${report.timestamp}\n`;

        if (validation.violations.length > 0) {
            output += '\n⚠️ VIOLATIONS:\n';
            validation.violations.forEach(v => {
                output += `  - ${v.message} [${v.severity}]\n`;
            });
        }

        if (validation.extraChanges.length > 0) {
            output += '\n📋 UNREQUESTED CHANGES (Requires Approval):\n';
            validation.extraChanges.forEach(c => {
                output += `  - ${c.field}: ${c.from} → ${c.to} [Risk: ${c.risk}]\n`;
            });
        }

        if (validation.missingPreservation.length > 0) {
            output += '\n🔒 PRESERVATION VIOLATIONS:\n';
            validation.missingPreservation.forEach(p => {
                output += `  - ${p.message}\n`;
            });
        }

        return {
            report,
            formatted: output
        };
    }

    /**
     * Validate a specific object relabel operation
     */
    async validateObjectRelabel(currentConfig, plannedChanges) {
        const requested = [{
            field: 'label',
            action: 'update'
        }];

        const planned = [];
        
        // Check what's actually changing
        if (currentConfig.label !== plannedChanges.label) {
            planned.push({
                field: 'label',
                action: 'update',
                oldValue: currentConfig.label,
                newValue: plannedChanges.label,
                explicitlyRequested: true
            });
        }

        // Check for unrequested changes
        if (currentConfig.nameField?.type !== plannedChanges.nameField?.type) {
            planned.push({
                field: 'nameFieldType',
                action: 'update',
                oldValue: currentConfig.nameField?.type,
                newValue: plannedChanges.nameField?.type,
                explicitlyRequested: false
            });
        }

        return this.validateChangeScope(requested, planned, 'objectRelabel');
    }

    /**
     * Create preservation checklist
     */
    createPreservationChecklist(objectName) {
        return {
            object: objectName,
            checklist: [
                { item: 'All existing fields', preserve: true, verified: false },
                { item: 'Field data types', preserve: true, verified: false },
                { item: 'Field properties (length, precision, etc.)', preserve: true, verified: false },
                { item: 'Validation rules', preserve: true, verified: false },
                { item: 'Record types', preserve: true, verified: false },
                { item: 'Page layouts', preserve: true, verified: false },
                { item: 'Apex triggers', preserve: true, verified: false },
                { item: 'Flows and process builders', preserve: true, verified: false },
                { item: 'Sharing settings', preserve: true, verified: false },
                { item: 'Field-level security', preserve: true, verified: false }
            ]
        };
    }
}

// CLI interface
if (require.main === module) {
    const validator = new ChangeValidator();
    
    // Example validation
    const example = async () => {
        console.log('Change Validator - Example Validation\n');
        
        const currentConfig = {
            label: 'Timeframe',
            nameField: { type: 'Text', length: 255 },
            fields: 12,
            validationRules: 3
        };
        
        const plannedChanges = {
            label: 'Pricing Segment',
            nameField: { type: 'AutoNumber' }, // This would be flagged!
            fields: 12,
            validationRules: 3
        };
        
        const validation = await validator.validateObjectRelabel(currentConfig, plannedChanges);
        const { formatted } = validator.generateReport(validation);
        
        console.log(formatted);
        
        if (!validation.valid) {
            console.log('\n❌ Changes rejected due to violations');
            process.exit(1);
        } else if (validation.requiresApproval) {
            console.log('\n⚠️ Changes require user approval');
            process.exit(2);
        } else {
            console.log('\n✅ Changes validated successfully');
            process.exit(0);
        }
    };
    
    example();
}

module.exports = ChangeValidator;