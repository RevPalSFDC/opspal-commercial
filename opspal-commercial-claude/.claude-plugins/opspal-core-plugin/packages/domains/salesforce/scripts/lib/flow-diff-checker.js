/**
 * FlowDiffChecker
 *
 * Compares flow metadata before and after modifications.
 * Generates detailed diffs in JSON, human-readable, and XML formats.
 *
 * Usage:
 *   const checker = new FlowDiffChecker();
 *   const diff = await checker.compare('./flows/original.xml', './flows/modified.xml');
 *   await checker.saveDiff(diff, './diffs/flow-diff-2025-10-31.json');
 */

const fs = require('fs').promises;
const path = require('path');
const FlowXMLParser = require('./flow-xml-parser');

class FlowDiffChecker {
    constructor(options = {}) {
        this.parser = new FlowXMLParser();
        this.verbose = options.verbose || false;
    }

    /**
     * Compare two flow versions
     */
    async compare(originalPath, modifiedPath) {
        this.log(`Comparing flows:\n  Original: ${originalPath}\n  Modified: ${modifiedPath}`);

        const original = await this.parser.parse(originalPath);
        const modified = await this.parser.parse(modifiedPath);

        const diff = {
            timestamp: new Date().toISOString(),
            originalPath: originalPath,
            modifiedPath: modifiedPath,
            summary: {},
            elementsAdded: [],
            elementsRemoved: [],
            elementsModified: [],
            connectorsChanged: [],
            metadataChanges: {}
        };

        // Compare elements
        const originalElements = this.getElementMap(original);
        const modifiedElements = this.getElementMap(modified);

        // Find added elements
        for (const [name, element] of modifiedElements.entries()) {
            if (!originalElements.has(name)) {
                diff.elementsAdded.push({
                    name: name,
                    type: element.elementType,
                    label: element.label,
                    details: element
                });
            }
        }

        // Find removed elements
        for (const [name, element] of originalElements.entries()) {
            if (!modifiedElements.has(name)) {
                diff.elementsRemoved.push({
                    name: name,
                    type: element.elementType,
                    label: element.label,
                    details: element
                });
            }
        }

        // Find modified elements
        for (const [name, modElement] of modifiedElements.entries()) {
            if (originalElements.has(name)) {
                const origElement = originalElements.get(name);
                const elementDiff = this.compareElements(origElement, modElement);

                if (elementDiff.hasChanges) {
                    diff.elementsModified.push({
                        name: name,
                        type: modElement.elementType,
                        changes: elementDiff.changes
                    });
                }
            }
        }

        // Compare connectors
        diff.connectorsChanged = this.compareConnectors(original, modified);

        // Compare metadata
        diff.metadataChanges = this.compareMetadata(original, modified);

        // Generate summary
        diff.summary = {
            totalChanges: diff.elementsAdded.length + diff.elementsRemoved.length + diff.elementsModified.length + diff.connectorsChanged.length,
            elementsAdded: diff.elementsAdded.length,
            elementsRemoved: diff.elementsRemoved.length,
            elementsModified: diff.elementsModified.length,
            connectorsChanged: diff.connectorsChanged.length,
            riskLevel: this.calculateRiskLevel(diff)
        };

        this.log(`Diff complete: ${diff.summary.totalChanges} changes detected`);

        return diff;
    }

    /**
     * Compare individual elements
     */
    compareElements(original, modified) {
        const changes = [];
        let hasChanges = false;

        // Compare all properties
        const allKeys = new Set([...Object.keys(original), ...Object.keys(modified)]);

        for (const key of allKeys) {
            // Skip connector-related properties - these are handled separately in compareConnectors
            if (key === 'connector' || key === 'faultConnector' || key === 'defaultConnector') {
                continue;
            }

            if (JSON.stringify(original[key]) !== JSON.stringify(modified[key])) {
                hasChanges = true;
                changes.push({
                    property: key,
                    oldValue: original[key],
                    newValue: modified[key]
                });
            }
        }

        return { hasChanges, changes };
    }

    /**
     * Compare connectors
     */
    compareConnectors(original, modified) {
        const changes = [];

        const originalConnectors = this.getConnectorMap(original);
        const modifiedConnectors = this.getConnectorMap(modified);

        // Get element maps to check if elements were added/removed
        const originalElements = this.getElementMap(original);
        const modifiedElements = this.getElementMap(modified);

        for (const [source, targets] of modifiedConnectors.entries()) {
            const origTargets = originalConnectors.get(source);

            if (!origTargets) {
                // Only count as "added connector" if the element itself wasn't added
                if (originalElements.has(source)) {
                    changes.push({
                        type: 'added',
                        source: source,
                        targets: targets
                    });
                }
            } else if (JSON.stringify(origTargets) !== JSON.stringify(targets)) {
                changes.push({
                    type: 'modified',
                    source: source,
                    oldTargets: origTargets,
                    newTargets: targets
                });
            }
        }

        for (const [source, targets] of originalConnectors.entries()) {
            if (!modifiedConnectors.has(source)) {
                // Only count as "removed connector" if the element itself wasn't removed
                if (modifiedElements.has(source)) {
                    changes.push({
                        type: 'removed',
                        source: source,
                        targets: targets
                    });
                }
            }
        }

        return changes;
    }

    /**
     * Compare metadata (processType, start conditions, etc.)
     */
    compareMetadata(original, modified) {
        const changes = {};

        const metadataFields = ['label', 'processType', 'processMetadataValues', 'start', 'status', 'triggerType'];

        metadataFields.forEach(field => {
            if (JSON.stringify(original[field]) !== JSON.stringify(modified[field])) {
                changes[field] = {
                    before: original[field],
                    after: modified[field],
                    // Keep old names for backward compatibility
                    oldValue: original[field],
                    newValue: modified[field]
                };
            }
        });

        return changes;
    }

    /**
     * Calculate risk level based on changes
     */
    calculateRiskLevel(diff) {
        let riskScore = 0;

        // High risk: Removed elements (30 points each)
        riskScore += diff.elementsRemoved.length * 30;

        // Medium risk: Modified elements (10 points each)
        riskScore += diff.elementsModified.length * 10;

        // Low risk: Added elements (2 points each)
        riskScore += diff.elementsAdded.length * 2;

        // High risk: Connector changes (30 points each)
        // Connectors define flow execution path - changes are HIGH risk
        riskScore += diff.connectorsChanged.length * 30;

        // Critical: Metadata changes (50 points)
        if (Object.keys(diff.metadataChanges).length > 0) {
            riskScore += 50;
        }

        if (riskScore >= 50) return 'CRITICAL';
        if (riskScore >= 30) return 'HIGH';
        if (riskScore >= 10) return 'MEDIUM';
        return 'LOW';
    }

    /**
     * Save diff to file
     */
    async saveDiff(diff, outputPath) {
        const dir = path.dirname(outputPath);
        await fs.mkdir(dir, { recursive: true });

        // Save JSON diff
        await fs.writeFile(outputPath, JSON.stringify(diff, null, 2), 'utf8');

        // Save human-readable diff
        const readablePath = outputPath.replace('.json', '.txt');
        await fs.writeFile(readablePath, this.formatReadableDiff(diff), 'utf8');

        this.log(`Diff saved to:\n  JSON: ${outputPath}\n  Text: ${readablePath}`);

        return { jsonPath: outputPath, textPath: readablePath };
    }

    /**
     * Format human-readable diff
     */
    formatReadableDiff(diff) {
        let text = '';

        text += '='.repeat(80) + '\n';
        text += `Flow Modification Diff\n`;
        text += `Generated: ${diff.timestamp}\n`;
        text += '='.repeat(80) + '\n\n';

        text += `Summary:\n`;
        text += `  Total Changes: ${diff.summary.totalChanges}\n`;
        text += `  Risk Level: ${diff.summary.riskLevel}\n`;
        text += `  Elements Added: ${diff.summary.elementsAdded}\n`;
        text += `  Elements Removed: ${diff.summary.elementsRemoved}\n`;
        text += `  Elements Modified: ${diff.summary.elementsModified}\n`;
        text += `  Connectors Changed: ${diff.summary.connectorsChanged}\n\n`;

        if (diff.elementsAdded.length > 0) {
            text += '➕ Elements Added:\n';
            diff.elementsAdded.forEach(el => {
                text += `  - ${el.name} (${el.type})\n`;
            });
            text += '\n';
        }

        if (diff.elementsRemoved.length > 0) {
            text += '➖ Elements Removed:\n';
            diff.elementsRemoved.forEach(el => {
                text += `  - ${el.name} (${el.type})\n`;
            });
            text += '\n';
        }

        if (diff.elementsModified.length > 0) {
            text += '🔄 Elements Modified:\n';
            diff.elementsModified.forEach(el => {
                text += `  ${el.name} (${el.type}):\n`;
                el.changes.forEach(change => {
                    text += `    - ${change.property}: ${JSON.stringify(change.oldValue)} → ${JSON.stringify(change.newValue)}\n`;
                });
            });
            text += '\n';
        }

        if (diff.connectorsChanged.length > 0) {
            text += '🔗 Connectors Changed:\n';
            diff.connectorsChanged.forEach(conn => {
                text += `  ${conn.type.toUpperCase()}: ${conn.source}\n`;
            });
            text += '\n';
        }

        if (Object.keys(diff.metadataChanges).length > 0) {
            text += '📋 Metadata Changes:\n';
            Object.entries(diff.metadataChanges).forEach(([field, change]) => {
                text += `  ${field}: ${JSON.stringify(change.oldValue)} → ${JSON.stringify(change.newValue)}\n`;
            });
            text += '\n';
        }

        text += '='.repeat(80) + '\n';

        return text;
    }

    /**
     * Get element map (name → element)
     */
    getElementMap(flow) {
        const map = new Map();
        const elements = flow.getAllElements();

        elements.forEach(el => {
            map.set(el.name, el);
        });

        return map;
    }

    /**
     * Get connector map (source → [targets])
     */
    getConnectorMap(flow) {
        const map = new Map();
        const elements = flow.getAllElements();

        elements.forEach(el => {
            const targets = [];

            // Check regular connector
            if (el.connector?.targetReference) {
                targets.push(el.connector.targetReference);
            }

            // Check default connector (used in decisions)
            if (el.defaultConnector?.targetReference) {
                targets.push(el.defaultConnector.targetReference);
            }

            // Check fault connector
            if (el.faultConnector?.targetReference) {
                targets.push(el.faultConnector.targetReference);
            }

            // Check decision rules connectors
            if (el.rules && Array.isArray(el.rules)) {
                el.rules.forEach(rule => {
                    if (rule.connector?.targetReference) {
                        targets.push(rule.connector.targetReference);
                    }
                });
            }

            if (targets.length > 0) {
                map.set(el.name, targets);
            }
        });

        return map;
    }

    /**
     * Format diff for display (alias for formatReadableDiff for test compatibility)
     */
    format(diff) {
        return this.formatReadableDiff(diff);
    }

    /**
     * Log helper
     */
    log(message) {
        if (this.verbose) {
            console.log(`[FlowDiffChecker] ${message}`);
        }
    }
}

module.exports = FlowDiffChecker;

// CLI Support
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log(`
Usage:
  node flow-diff-checker.js <original.xml> <modified.xml> [output.json]

Example:
  node flow-diff-checker.js ./flows/original/Account_AfterSave.flow-meta.xml ./flows/modified/Account_AfterSave.flow-meta.xml ./diffs/account-flow-diff.json
        `);
        process.exit(1);
    }

    const [originalPath, modifiedPath, outputPath] = args;
    const checker = new FlowDiffChecker({ verbose: true });

    checker.compare(originalPath, modifiedPath).then(async diff => {
        if (outputPath) {
            await checker.saveDiff(diff, outputPath);
        } else {
            console.log(checker.formatReadableDiff(diff));
        }
    }).catch(console.error);
}
