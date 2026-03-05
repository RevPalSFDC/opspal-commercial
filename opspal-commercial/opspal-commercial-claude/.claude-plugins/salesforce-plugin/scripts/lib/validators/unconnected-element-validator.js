#!/usr/bin/env node

/**
 * Unconnected Element Validator
 *
 * Detects Flow elements that have no incoming or outgoing connectors,
 * making them unreachable and effectively dead code. These orphaned
 * elements should be removed to avoid confusion and maintain Flow clarity.
 *
 * @module unconnected-element-validator
 */

class UnconnectedElementValidator {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
    }

    /**
     * Validate for unconnected elements
     * @param {Object} flow - Parsed flow object
     * @returns {Array} Array of unconnected element violations
     */
    validate(flow) {
        const violations = [];

        // Build connectivity graph
        const { elements, connections } = this._buildConnectivityGraph(flow);

        // Find start element
        const startElement = this._getStartElement(flow);

        // Find all reachable elements from start
        const reachableElements = this._findReachableElements(startElement, connections);

        // Check each element for connectivity
        for (const elementName of elements) {
            // Skip start element (it's always reachable)
            if (elementName === startElement) {
                continue;
            }

            // Check if element is reachable from start
            if (!reachableElements.has(elementName)) {
                const elementType = this._getElementType(flow, elementName);

                violations.push({
                    rule: 'UnconnectedElement',
                    severity: 'error',
                    element: elementName,
                    message: `Element '${elementName}' (${elementType}) is not connected to the Flow and will never execute`,
                    recommendation: 'Connect this element to the Flow path or remove it if not needed',
                    autoFixable: true,  // Can remove element
                    details: {
                        elementName: elementName,
                        elementType: elementType
                    }
                });

                if (this.verbose) {
                    console.log(`  ❌ Unconnected element: ${elementName} (${elementType})`);
                }
            }
        }

        return violations;
    }

    /**
     * Build connectivity graph of Flow elements
     * @private
     */
    _buildConnectivityGraph(flow) {
        const elements = new Set();
        const connections = new Map();  // element -> [targets]

        const elementTypes = [
            'decisions',
            'loops',
            'recordLookups',
            'recordCreates',
            'recordUpdates',
            'recordDeletes',
            'assignments',
            'actionCalls',
            'screens',
            'subflows',
            'waits',
            'collectionProcessors'
        ];

        // Collect all elements and their connections
        for (const elementType of elementTypes) {
            if (flow[elementType]) {
                const items = Array.isArray(flow[elementType]) ? flow[elementType] : [flow[elementType]];

                for (const element of items) {
                    const elementName = this._getElementName(element);
                    if (elementName) {
                        elements.add(elementName);

                        // Get all connectors for this element
                        const targets = this._getConnectorTargets(element);
                        if (targets.length > 0) {
                            connections.set(elementName, targets);
                        }
                    }
                }
            }
        }

        return { elements, connections };
    }

    /**
     * Get start element name
     * @private
     */
    _getStartElement(flow) {
        if (flow.start && flow.start[0]) {
            const start = flow.start[0];

            // Start can have connector
            if (start.connector) {
                const connector = Array.isArray(start.connector) ? start.connector[0] : start.connector;
                if (connector.targetReference) {
                    return Array.isArray(connector.targetReference)
                        ? connector.targetReference[0]
                        : connector.targetReference;
                }
            }

            // Or scheduled path
            if (start.scheduledPaths) {
                const paths = Array.isArray(start.scheduledPaths) ? start.scheduledPaths : [start.scheduledPaths];
                if (paths[0] && paths[0].connector) {
                    const connector = Array.isArray(paths[0].connector) ? paths[0].connector[0] : paths[0].connector;
                    if (connector.targetReference) {
                        return Array.isArray(connector.targetReference)
                            ? connector.targetReference[0]
                            : connector.targetReference;
                    }
                }
            }
        }

        return null;
    }

    /**
     * Find all elements reachable from start
     * @private
     */
    _findReachableElements(startElement, connections) {
        const reachable = new Set();
        const queue = [startElement];
        const visited = new Set();

        while (queue.length > 0) {
            const current = queue.shift();

            if (!current || visited.has(current)) {
                continue;
            }

            visited.add(current);
            reachable.add(current);

            // Add all targets to queue
            const targets = connections.get(current) || [];
            for (const target of targets) {
                if (!visited.has(target)) {
                    queue.push(target);
                }
            }
        }

        return reachable;
    }

    /**
     * Get element name
     * @private
     */
    _getElementName(element) {
        if (element.name) {
            return Array.isArray(element.name) ? element.name[0] : element.name;
        }
        return null;
    }

    /**
     * Get all connector targets for an element
     * @private
     */
    _getConnectorTargets(element) {
        const targets = [];

        // Standard connector
        if (element.connector) {
            const connector = Array.isArray(element.connector) ? element.connector[0] : element.connector;
            const target = this._getConnectorTarget(connector);
            if (target) {
                targets.push(target);
            }
        }

        // Fault connector
        if (element.faultConnector) {
            const connector = Array.isArray(element.faultConnector) ? element.faultConnector[0] : element.faultConnector;
            const target = this._getConnectorTarget(connector);
            if (target) {
                targets.push(target);
            }
        }

        // Decision outcomes
        if (element.rules) {
            const rules = Array.isArray(element.rules) ? element.rules : [element.rules];
            for (const rule of rules) {
                if (rule.connector) {
                    const connector = Array.isArray(rule.connector) ? rule.connector[0] : rule.connector;
                    const target = this._getConnectorTarget(connector);
                    if (target) {
                        targets.push(target);
                    }
                }
            }
        }

        // Default connector (for decisions)
        if (element.defaultConnector) {
            const connector = Array.isArray(element.defaultConnector) ? element.defaultConnector[0] : element.defaultConnector;
            const target = this._getConnectorTarget(connector);
            if (target) {
                targets.push(target);
            }
        }

        // Next value connector (for loops)
        if (element.nextValueConnector) {
            const connector = Array.isArray(element.nextValueConnector) ? element.nextValueConnector[0] : element.nextValueConnector;
            const target = this._getConnectorTarget(connector);
            if (target) {
                targets.push(target);
            }
        }

        // No more values connector (for loops)
        if (element.noMoreValuesConnector) {
            const connector = Array.isArray(element.noMoreValuesConnector) ? element.noMoreValuesConnector[0] : element.noMoreValuesConnector;
            const target = this._getConnectorTarget(connector);
            if (target) {
                targets.push(target);
            }
        }

        return targets;
    }

    /**
     * Get target from connector
     * @private
     */
    _getConnectorTarget(connector) {
        if (connector && connector.targetReference) {
            return Array.isArray(connector.targetReference)
                ? connector.targetReference[0]
                : connector.targetReference;
        }
        return null;
    }

    /**
     * Get element type
     * @private
     */
    _getElementType(flow, elementName) {
        const elementTypes = {
            'decisions': 'Decision',
            'loops': 'Loop',
            'recordLookups': 'Get Records',
            'recordCreates': 'Create Records',
            'recordUpdates': 'Update Records',
            'recordDeletes': 'Delete Records',
            'assignments': 'Assignment',
            'actionCalls': 'Action',
            'screens': 'Screen',
            'subflows': 'Subflow',
            'waits': 'Wait',
            'collectionProcessors': 'Collection Processor'
        };

        for (const [type, label] of Object.entries(elementTypes)) {
            if (flow[type]) {
                const elements = Array.isArray(flow[type]) ? flow[type] : [flow[type]];
                for (const element of elements) {
                    const name = this._getElementName(element);
                    if (name === elementName) {
                        return label;
                    }
                }
            }
        }

        return 'Unknown';
    }
}

module.exports = UnconnectedElementValidator;
