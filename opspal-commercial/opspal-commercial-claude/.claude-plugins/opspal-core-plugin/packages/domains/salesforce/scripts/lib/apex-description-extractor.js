#!/usr/bin/env node

/**
 * Apex Description Extractor
 *
 * Extracts purpose/description information from Salesforce automations:
 * - JavaDoc comments from Apex classes and triggers
 * - Description metadata from Flows
 * - Fallback to regular comment blocks
 *
 * Purpose: Populate Purpose/Description column in Master Automation Inventory
 *
 * @version 1.0.0
 * @date 2025-10-21
 */

const fs = require('fs');
const path = require('path');

class ApexDescriptionExtractor {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
    }

    /**
     * Extract description from Apex source code
     * @param {string} sourceCode - Apex class or trigger source code
     * @param {string} automationType - Type of automation (ApexTrigger, ApexClass, etc.)
     * @returns {Object} {description: string, source: 'javadoc'|'comment'|'none'}
     */
    extractApexDescription(sourceCode, automationType = 'Apex') {
        if (!sourceCode || typeof sourceCode !== 'string') {
            return { description: null, source: 'none' };
        }

        // Step 1: Try to extract JavaDoc comment (/** ... */)
        const javadocMatch = sourceCode.match(/\/\*\*([\s\S]*?)\*\//);
        if (javadocMatch) {
            const javadocContent = javadocMatch[1];
            const cleanedDescription = this.cleanJavaDocComment(javadocContent);
            if (cleanedDescription) {
                if (this.verbose) {
                    console.log(`[${automationType}] Found JavaDoc description: ${cleanedDescription.substring(0, 100)}...`);
                }
                return { description: cleanedDescription, source: 'javadoc' };
            }
        }

        // Step 2: Try to extract first multi-line comment (/* ... */)
        const multilineCommentMatch = sourceCode.match(/\/\*([\s\S]*?)\*\//);
        if (multilineCommentMatch) {
            const commentContent = multilineCommentMatch[1];
            const cleanedDescription = this.cleanComment(commentContent);
            if (cleanedDescription) {
                if (this.verbose) {
                    console.log(`[${automationType}] Found multi-line comment: ${cleanedDescription.substring(0, 100)}...`);
                }
                return { description: cleanedDescription, source: 'comment' };
            }
        }

        // Step 3: Try to extract first single-line comment block
        const singleLineComments = sourceCode.match(/\/\/.*$/gm);
        if (singleLineComments && singleLineComments.length > 0) {
            // Get first contiguous block of comments
            const firstCommentBlock = singleLineComments.slice(0, 5).join(' ');
            const cleanedDescription = firstCommentBlock.replace(/\/\//g, '').trim();
            if (cleanedDescription && cleanedDescription.length > 10) {
                if (this.verbose) {
                    console.log(`[${automationType}] Found single-line comments: ${cleanedDescription.substring(0, 100)}...`);
                }
                return { description: cleanedDescription, source: 'comment' };
            }
        }

        if (this.verbose) {
            console.log(`[${automationType}] No description found`);
        }
        return { description: null, source: 'none' };
    }

    /**
     * Extract description from Flow metadata
     * @param {Object} flowMetadata - Flow metadata object
     * @returns {Object} {description: string, source: 'metadata'|'none'}
     */
    extractFlowDescription(flowMetadata) {
        if (!flowMetadata || typeof flowMetadata !== 'object') {
            return { description: null, source: 'none' };
        }

        // Check for Description field in metadata
        if (flowMetadata.description) {
            if (this.verbose) {
                console.log(`[Flow] Found metadata description: ${flowMetadata.description.substring(0, 100)}...`);
            }
            return { description: flowMetadata.description, source: 'metadata' };
        }

        // Check for processMetadataValues (older Flow format)
        if (flowMetadata.processMetadataValues) {
            const descriptionValue = flowMetadata.processMetadataValues.find(
                pmv => pmv.name === 'description' || pmv.name === 'Description'
            );
            if (descriptionValue && descriptionValue.value && descriptionValue.value.stringValue) {
                if (this.verbose) {
                    console.log(`[Flow] Found processMetadataValues description: ${descriptionValue.value.stringValue.substring(0, 100)}...`);
                }
                return { description: descriptionValue.value.stringValue, source: 'metadata' };
            }
        }

        // Check for label as fallback
        if (flowMetadata.label) {
            if (this.verbose) {
                console.log(`[Flow] Using label as description: ${flowMetadata.label}`);
            }
            return { description: `Flow: ${flowMetadata.label}`, source: 'metadata' };
        }

        if (this.verbose) {
            console.log(`[Flow] No description found`);
        }
        return { description: null, source: 'none' };
    }

    /**
     * Extract description from Process Builder metadata
     * @param {Object} processMetadata - Process Builder metadata object
     * @returns {Object} {description: string, source: 'metadata'|'none'}
     */
    extractProcessDescription(processMetadata) {
        if (!processMetadata || typeof processMetadata !== 'object') {
            return { description: null, source: 'none' };
        }

        // Process Builders have description field
        if (processMetadata.description) {
            if (this.verbose) {
                console.log(`[Process] Found description: ${processMetadata.description.substring(0, 100)}...`);
            }
            return { description: processMetadata.description, source: 'metadata' };
        }

        // Fallback to name
        if (processMetadata.name) {
            if (this.verbose) {
                console.log(`[Process] Using name as description: ${processMetadata.name}`);
            }
            return { description: `Process: ${processMetadata.name}`, source: 'metadata' };
        }

        if (this.verbose) {
            console.log(`[Process] No description found`);
        }
        return { description: null, source: 'none' };
    }

    /**
     * Extract description from Workflow Rule metadata
     * @param {Object} workflowMetadata - Workflow Rule metadata object
     * @returns {Object} {description: string, source: 'metadata'|'none'}
     */
    extractWorkflowDescription(workflowMetadata) {
        if (!workflowMetadata || typeof workflowMetadata !== 'object') {
            return { description: null, source: 'none' };
        }

        // Workflow rules have description field
        if (workflowMetadata.description) {
            if (this.verbose) {
                console.log(`[Workflow] Found description: ${workflowMetadata.description.substring(0, 100)}...`);
            }
            return { description: workflowMetadata.description, source: 'metadata' };
        }

        // Fallback to fullName
        if (workflowMetadata.fullName) {
            if (this.verbose) {
                console.log(`[Workflow] Using fullName as description: ${workflowMetadata.fullName}`);
            }
            return { description: `Workflow: ${workflowMetadata.fullName}`, source: 'metadata' };
        }

        if (this.verbose) {
            console.log(`[Workflow] No description found`);
        }
        return { description: null, source: 'none' };
    }

    /**
     * Clean JavaDoc comment content
     * @param {string} javadocContent - Raw JavaDoc content
     * @returns {string} Cleaned description
     */
    cleanJavaDocComment(javadocContent) {
        if (!javadocContent) return null;

        // Remove leading asterisks and whitespace from each line
        const lines = javadocContent
            .split('\n')
            .map(line => line.trim())
            .map(line => line.replace(/^\*\s?/, ''))
            .filter(line => {
                // Filter out @tags and empty lines
                return line.length > 0 && !line.startsWith('@');
            });

        const cleaned = lines.join(' ').trim();

        // Return null if too short or just punctuation
        if (cleaned.length < 10 || /^[^\w\s]+$/.test(cleaned)) {
            return null;
        }

        return cleaned;
    }

    /**
     * Clean regular comment content
     * @param {string} commentContent - Raw comment content
     * @returns {string} Cleaned description
     */
    cleanComment(commentContent) {
        if (!commentContent) return null;

        // Remove leading asterisks and whitespace
        const cleaned = commentContent
            .split('\n')
            .map(line => line.trim())
            .map(line => line.replace(/^\*\s?/, ''))
            .filter(line => line.length > 0)
            .join(' ')
            .trim();

        // Return null if too short
        if (cleaned.length < 10) {
            return null;
        }

        return cleaned;
    }

    /**
     * Extract description based on automation type
     * @param {Object} automation - Automation object with type and metadata
     * @returns {Object} {description: string, source: string}
     */
    extractDescription(automation) {
        if (!automation || !automation.automationType) {
            return { description: null, source: 'none' };
        }

        const type = automation.automationType;

        switch (type) {
            case 'ApexTrigger':
            case 'ApexClass':
                if (automation.body || automation.sourceCode) {
                    return this.extractApexDescription(automation.body || automation.sourceCode, type);
                }
                break;

            case 'Flow':
                if (automation.metadata) {
                    return this.extractFlowDescription(automation.metadata);
                }
                break;

            case 'Workflow':
            case 'WorkflowRule':
                if (automation.metadata) {
                    return this.extractWorkflowDescription(automation.metadata);
                }
                break;

            case 'Process':
            case 'ProcessBuilder':
                if (automation.metadata) {
                    return this.extractProcessDescription(automation.metadata);
                }
                break;

            default:
                if (this.verbose) {
                    console.log(`[${type}] Unsupported automation type for description extraction`);
                }
        }

        return { description: null, source: 'none' };
    }
}

module.exports = ApexDescriptionExtractor;

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage: node apex-description-extractor.js <automation-file> [--verbose]');
        console.log('');
        console.log('Extracts purpose/description from Salesforce automation metadata.');
        console.log('');
        console.log('Examples:');
        console.log('  node apex-description-extractor.js ./MyTrigger.trigger --verbose');
        console.log('  node apex-description-extractor.js ./MyFlow.json');
        process.exit(1);
    }

    const automationFile = args[0];
    const verbose = args.includes('--verbose');

    if (!fs.existsSync(automationFile)) {
        console.error(`Error: File not found: ${automationFile}`);
        process.exit(1);
    }

    const extractor = new ApexDescriptionExtractor({ verbose });
    const fileContent = fs.readFileSync(automationFile, 'utf8');
    const ext = path.extname(automationFile);

    let result;
    if (ext === '.trigger' || ext === '.cls') {
        // Apex file
        result = extractor.extractApexDescription(fileContent, ext === '.trigger' ? 'ApexTrigger' : 'ApexClass');
    } else if (ext === '.json') {
        // Flow or Process metadata
        try {
            const metadata = JSON.parse(fileContent);
            if (metadata.processType) {
                result = extractor.extractFlowDescription(metadata);
            } else if (metadata.description || metadata.name) {
                result = extractor.extractProcessDescription(metadata);
            } else {
                result = { description: null, source: 'none' };
            }
        } catch (e) {
            console.error(`Error: Failed to parse JSON: ${e.message}`);
            process.exit(1);
        }
    } else {
        console.error(`Error: Unsupported file type: ${ext}`);
        process.exit(1);
    }

    console.log('\n=== Description Extraction Result ===\n');
    console.log(`Source: ${result.source}`);
    console.log(`Description: ${result.description || '(none)'}`);
    console.log('');
}
