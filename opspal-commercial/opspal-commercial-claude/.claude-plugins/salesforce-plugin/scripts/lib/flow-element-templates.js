/**
 * FlowElementTemplates
 *
 * Provides intelligent templates and defaults for Flow elements.
 * Used by FlowNLPModifier to create properly structured elements.
 *
 * Phase 2.2 Implementation - Element Templates
 *
 * Usage:
 *   const templates = new FlowElementTemplates();
 *   const decision = templates.createDecision('Approval_Check', { defaultLabel: 'Not Approved' });
 *
 * @version 1.0.0
 * @date 2025-10-31
 */

class FlowElementTemplates {
    constructor() {
        // Element type mapping
        this.typeMap = {
            'decision': 'decisions',
            'assignment': 'assignments',
            'action': 'actionCalls',
            'lookup': 'recordLookups',
            'create': 'recordCreates',
            'update': 'recordUpdates',
            'delete': 'recordDeletes',
            'loop': 'loops',
            'screen': 'screens',
            'subflow': 'subflows',
            'wait': 'waits'
        };
    }

    /**
     * Create decision element with intelligent defaults
     * @param {string} name - Element name
     * @param {Object} options - Optional configuration
     * @returns {Object} Decision element structure
     */
    createDecision(name, options = {}) {
        const element = {
            name: name,
            label: options.label || this.makeLabel(name),
            defaultConnectorLabel: options.defaultLabel || 'Default'
        };

        // Add location if provided
        if (options.locationX !== undefined) {
            element.locationX = options.locationX;
            element.locationY = options.locationY || 0;
        }

        // Add default connector if target provided
        // For decisions, options.target should set the default connector (not regular connector)
        const defaultTarget = options.defaultTarget || options.target;
        if (defaultTarget) {
            element.defaultConnector = {
                targetReference: defaultTarget
            };
        }

        // Add rules if provided
        if (options.rules && Array.isArray(options.rules)) {
            element.rules = options.rules.map(rule => this.createDecisionRule(rule));
        }

        return element;
    }

    /**
     * Create decision rule
     * @param {Object} ruleConfig - Rule configuration
     * @returns {Object} Decision rule structure
     */
    createDecisionRule(ruleConfig) {
        const rule = {
            name: ruleConfig.name,
            label: ruleConfig.label || this.makeLabel(ruleConfig.name),
            conditionLogic: ruleConfig.conditionLogic || 'and'
        };

        // Add conditions if provided
        if (ruleConfig.conditions && Array.isArray(ruleConfig.conditions)) {
            rule.conditions = ruleConfig.conditions;
        }

        // Add connector if target provided
        if (ruleConfig.target) {
            rule.connector = {
                targetReference: ruleConfig.target
            };
        }

        return rule;
    }

    /**
     * Create condition object for decision rules
     * @param {Object} config - Condition configuration
     * @returns {Object} Flow condition structure
     */
    createCondition(config) {
        const condition = {
            leftValueReference: config.field || config.leftValueReference,
            operator: config.operator
        };

        // Add right value if provided (not needed for null checks)
        if (config.value !== undefined || config.rightValue !== undefined) {
            const value = config.rightValue || config.value;

            // If value is already a Flow value object, use it
            if (value && typeof value === 'object' &&
                (value.stringValue !== undefined || value.numberValue !== undefined ||
                 value.booleanValue !== undefined || value.elementReference !== undefined)) {
                condition.rightValue = value;
            } else {
                // Auto-detect type and create value object
                condition.rightValue = this.createValue(value, config.valueType);
            }
        }

        return condition;
    }

    /**
     * Create assignment element with intelligent defaults
     * @param {string} name - Element name
     * @param {Object} options - Optional configuration
     * @returns {Object} Assignment element structure
     */
    createAssignment(name, options = {}) {
        const element = {
            name: name,
            label: options.label || this.makeLabel(name)
        };

        // Add location if provided
        if (options.locationX !== undefined) {
            element.locationX = options.locationX;
            element.locationY = options.locationY || 0;
        }

        // Add connector if target provided
        if (options.target) {
            element.connector = {
                targetReference: options.target
            };
        }

        // Add assignment items if provided
        if (options.assignments && Array.isArray(options.assignments)) {
            element.assignmentItems = options.assignments.map(a => this.createAssignmentItem(a));
        }

        return element;
    }

    /**
     * Create assignment item
     * @param {Object} itemConfig - Assignment item configuration
     * @returns {Object} Assignment item structure
     */
    createAssignmentItem(itemConfig) {
        const item = {
            assignToReference: itemConfig.variable,
            operator: itemConfig.operator || 'Assign'
        };

        // Add value based on type
        if (itemConfig.value !== undefined) {
            item.value = this.createValue(itemConfig.value, itemConfig.valueType);
        } else if (itemConfig.valueReference) {
            item.value = {
                elementReference: itemConfig.valueReference
            };
        }

        return item;
    }

    /**
     * Create record lookup element
     * @param {string} name - Element name
     * @param {Object} options - Configuration
     * @returns {Object} Record lookup element
     */
    createRecordLookup(name, options = {}) {
        const element = {
            name: name,
            label: options.label || this.makeLabel(name),
            object: options.object || 'Account'
        };

        // Add location
        if (options.locationX !== undefined) {
            element.locationX = options.locationX;
            element.locationY = options.locationY || 0;
        }

        // Add connector
        if (options.target) {
            element.connector = {
                targetReference: options.target
            };
        }

        // Configure lookup behavior
        element.filterLogic = options.filterLogic || 'and';
        element.getFirstRecordOnly = options.getFirstOnly !== undefined ? options.getFirstOnly : true;
        element.queriedFields = options.fields || [];

        // Add filters if provided
        if (options.filters && Array.isArray(options.filters)) {
            element.filters = options.filters;
        }

        // Assign to variable
        if (options.assignTo) {
            element.assignNullValuesIfNoRecordsFound = options.assignNullIfNotFound !== undefined ? options.assignNullIfNotFound : false;
            element.storeOutputAutomatically = true;
            element.outputReference = options.assignTo;
        }

        return element;
    }

    /**
     * Create record create element
     * @param {string} name - Element name
     * @param {Object} options - Configuration
     * @returns {Object} Record create element
     */
    createRecordCreate(name, options = {}) {
        const element = {
            name: name,
            label: options.label || this.makeLabel(name),
            object: options.object || 'Account'
        };

        // Add location
        if (options.locationX !== undefined) {
            element.locationX = options.locationX;
            element.locationY = options.locationY || 0;
        }

        // Add connector
        if (options.target) {
            element.connector = {
                targetReference: options.target
            };
        }
        if (options.faultTarget) {
            element.faultConnector = {
                targetReference: options.faultTarget
            };
        }

        // Add input assignments if provided
        if (options.fieldAssignments && Array.isArray(options.fieldAssignments)) {
            element.inputAssignments = options.fieldAssignments.map(fa => ({
                field: fa.field,
                value: this.createValue(fa.value, fa.valueType)
            }));
        }

        return element;
    }

    /**
     * Create record update element
     * @param {string} name - Element name
     * @param {Object} options - Configuration
     * @returns {Object} Record update element
     */
    createRecordUpdate(name, options = {}) {
        const element = {
            name: name,
            label: options.label || this.makeLabel(name),
            object: options.object || 'Account'
        };

        // Add location
        if (options.locationX !== undefined) {
            element.locationX = options.locationX;
            element.locationY = options.locationY || 0;
        }

        // Add connector
        if (options.target) {
            element.connector = {
                targetReference: options.target
            };
        }
        if (options.faultTarget) {
            element.faultConnector = {
                targetReference: options.faultTarget
            };
        }

        // Add filters
        if (options.filters && Array.isArray(options.filters)) {
            element.filters = options.filters;
            element.filterLogic = options.filterLogic || 'and';
        } else if (options.inputReference) {
            // Update specific record
            element.inputReference = options.inputReference;
        }

        // Add field assignments
        if (options.fieldAssignments && Array.isArray(options.fieldAssignments)) {
            element.inputAssignments = options.fieldAssignments.map(fa => ({
                field: fa.field,
                value: this.createValue(fa.value, fa.valueType)
            }));
        }

        return element;
    }

    /**
     * Create loop element
     * @param {string} name - Element name
     * @param {Object} options - Configuration
     * @returns {Object} Loop element
     */
    createLoop(name, options = {}) {
        const element = {
            name: name,
            label: options.label || this.makeLabel(name),
            collectionReference: options.collection,
            iterationOrder: options.iterationOrder || 'Asc'
        };

        // Add location
        if (options.locationX !== undefined) {
            element.locationX = options.locationX;
            element.locationY = options.locationY || 0;
        }

        // Next value connector (first iteration)
        if (options.nextValueTarget) {
            element.nextValueConnector = {
                targetReference: options.nextValueTarget
            };
        }

        // No more values connector (loop complete)
        if (options.noMoreValuesTarget) {
            element.noMoreValuesConnector = {
                targetReference: options.noMoreValuesTarget
            };
        }

        return element;
    }

    /**
     * Create action call element
     * @param {string} name - Element name
     * @param {Object} options - Configuration
     * @returns {Object} Action call element
     */
    createActionCall(name, options = {}) {
        const element = {
            name: name,
            label: options.label || this.makeLabel(name),
            actionName: options.actionName || 'emailSimple',
            actionType: options.actionType || 'emailSimple'
        };

        // Add location
        if (options.locationX !== undefined) {
            element.locationX = options.locationX;
            element.locationY = options.locationY || 0;
        }

        // Add connector
        if (options.target) {
            element.connector = {
                targetReference: options.target
            };
        }
        if (options.faultTarget) {
            element.faultConnector = {
                targetReference: options.faultTarget
            };
        }

        // Add input parameters
        if (options.inputParameters && Array.isArray(options.inputParameters)) {
            element.inputParameters = options.inputParameters.map(param => ({
                name: param.name,
                value: this.createValue(param.value, param.valueType)
            }));
        }

        // Store output if specified
        if (options.storeOutputTo) {
            element.storeOutputAutomatically = true;
            element.outputReference = options.storeOutputTo;
        }

        return element;
    }

    /**
     * Create screen element
     * @param {string} name - Element name
     * @param {Object} options - Configuration
     * @returns {Object} Screen element
     */
    createScreen(name, options = {}) {
        const element = {
            name: name,
            label: options.label || this.makeLabel(name),
            allowBack: options.allowBack !== undefined ? options.allowBack : true,
            allowFinish: options.allowFinish !== undefined ? options.allowFinish : true,
            allowPause: options.allowPause !== undefined ? options.allowPause : false
        };

        // Add location
        if (options.locationX !== undefined) {
            element.locationX = options.locationX;
            element.locationY = options.locationY || 0;
        }

        // Add connector
        if (options.target) {
            element.connector = {
                targetReference: options.target
            };
        }

        // Add fields if provided
        if (options.fields && Array.isArray(options.fields)) {
            element.fields = options.fields;
        }

        return element;
    }

    /**
     * Create value object based on type
     * @param {*} value - The value
     * @param {string} type - Value type (string, number, boolean, reference)
     * @returns {Object} Value structure
     */
    createValue(value, type) {
        if (!type) {
            // Auto-detect type
            if (typeof value === 'number') type = 'number';
            else if (typeof value === 'boolean') type = 'boolean';
            else type = 'string';
        }

        switch (type) {
            case 'string':
                return { stringValue: String(value) };
            case 'number':
                return { numberValue: Number(value) };
            case 'boolean':
                return { booleanValue: Boolean(value) };
            case 'reference':
                return { elementReference: value };
            default:
                return { stringValue: String(value) };
        }
    }

    /**
     * Make human-readable label from name
     * @param {string} name - Element name (snake_case or PascalCase)
     * @returns {string} Human-readable label
     */
    makeLabel(name) {
        return name
            .replace(/_/g, ' ')
            .replace(/([A-Z])/g, ' $1')
            .trim()
            .replace(/\s+/g, ' ')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }

    /**
     * Get flow element type from common name
     * @param {string} elementType - Common element type name
     * @returns {string} Flow XML element type
     */
    getFlowType(elementType) {
        return this.typeMap[elementType.toLowerCase()] || `${elementType}s`;
    }

    /**
     * Create element by type
     * @param {string} elementType - Element type
     * @param {string} name - Element name
     * @param {Object} options - Configuration options
     * @returns {Object} Element structure
     */
    createElement(elementType, name, options = {}) {
        const type = elementType.toLowerCase();

        switch (type) {
            case 'decision':
                return this.createDecision(name, options);
            case 'assignment':
                return this.createAssignment(name, options);
            case 'lookup':
            case 'recordlookup':
                return this.createRecordLookup(name, options);
            case 'create':
            case 'recordcreate':
                return this.createRecordCreate(name, options);
            case 'update':
            case 'recordupdate':
                return this.createRecordUpdate(name, options);
            case 'loop':
                return this.createLoop(name, options);
            case 'action':
            case 'actioncall':
                return this.createActionCall(name, options);
            case 'screen':
                return this.createScreen(name, options);
            default:
                // Generic element
                return {
                    name: name,
                    label: options.label || this.makeLabel(name)
                };
        }
    }
}

module.exports = FlowElementTemplates;
