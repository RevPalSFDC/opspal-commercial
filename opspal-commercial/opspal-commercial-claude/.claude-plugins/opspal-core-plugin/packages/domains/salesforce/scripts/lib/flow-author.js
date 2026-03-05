/**
 * FlowAuthor - Complete Flow Authoring Orchestrator
 * Integrates all Phase 1-2 components into a unified API
 *
 * Features:
 * - Complete Flow creation from natural language
 * - Comprehensive validation framework
 * - Automated deployment with permission escalation
 * - Change tracking and rollback
 * - Documentation generation
 *
 * Part of Phase 3.0: Complete Flow Authoring Orchestrator
 *
 * @see Related Runbooks (v3.42.0):
 * - **Runbook 1**: Authoring Flows via XML
 *   Location: docs/runbooks/flow-xml-development/01-authoring-flows-via-xml.md
 *   Topics: Flow scaffolding, CLI commands, element templates, best practices
 *   Use when: Creating new Flows from scratch, selecting Flow types
 *
 * - **Runbook 3**: Tools and Techniques
 *   Location: docs/runbooks/flow-xml-development/03-tools-and-techniques.md
 *   Topics: Template-driven generation, NLP modification, programmatic API usage
 *   Use when: Choosing development method, using FlowAuthor programmatically
 *
 * - **Runbook 4**: Validation and Best Practices
 *   Location: docs/runbooks/flow-xml-development/04-validation-and-best-practices.md
 *   Topics: 11-stage validation pipeline, best practices enforcement
 *   Use when: Validating Flows before deployment
 *
 * Quick Examples (from Runbooks):
 * ```javascript
 * // Runbook 1: Create new Flow
 * const author = new FlowAuthor('myOrg', { verbose: true });
 * await author.createFlow('Account_Validation', 'Record-Triggered', 'Account');
 *
 * // Runbook 3: Add elements via NLP
 * await author.addElement('Add a decision called Status_Check...');
 *
 * // Runbook 4: Validate
 * const validation = await author.validate();
 * ```
 */

const fs = require('fs').promises;
const path = require('path');
const FlowXMLParser = require('./flow-xml-parser');
const FlowNLPModifier = require('./flow-nlp-modifier');
const FlowPermissionEscalator = require('./flow-permission-escalator');
const FlowDiffChecker = require('./flow-diff-checker');
const FlowTaskContext = require('./flow-task-context');
const FlowDeploymentManager = require('./flow-deployment-manager');
const SegmentManager = require('./flow-segment-manager');
const FlowComplexityCalculator = require('./flow-complexity-calculator');

class FlowAuthor {
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.verbose = options.verbose !== false;
        this.workingDir = options.workingDir || process.cwd();
        this.autoSave = options.autoSave === true;
        this.autoValidate = options.autoValidate === true;

        // Initialize components
        this.parser = new FlowXMLParser();
        this.diffChecker = new FlowDiffChecker();

        const contextPath = path.join(this.workingDir, '.flow-context', 'context.json');
        this.context = new FlowTaskContext(contextPath, { verbose: this.verbose });

        this.deploymentManager = new FlowDeploymentManager(orgAlias, { verbose: this.verbose });

        // Segmentation support (Phase 1.3 - NEW)
        this.segmentationEnabled = options.segmentationEnabled === true;
        this.segmentManager = null; // Initialized when segmentation is enabled
        this.complexityCalculator = new FlowComplexityCalculator();

        // State
        this.currentFlow = null;
        this.currentFlowPath = null;
        this.modifier = null;
        this.checkpoints = [];
        this.initialState = null;
        this.contextInitialized = false;
    }

    /**
     * Create a new Flow from scratch
     * @param {string} name - Flow API name
     * @param {Object} config - Flow configuration
     * @returns {Promise<Object>} Created Flow object
     */
    async createFlow(name, config = {}) {
        this.log(`Creating new Flow: ${name}`);

        await this.ensureContextInitialized(name);

        try {
            const flowXML = this.generateFlowXML(name, config);

            // Save to temporary file
            const flowPath = path.join(this.workingDir, `${name}.flow-meta.xml`);
            await fs.writeFile(flowPath, flowXML);

            // Initialize modifier with the new Flow
            this.currentFlowPath = flowPath;
            this.modifier = new FlowNLPModifier(flowPath, this.orgAlias, { verbose: this.verbose });
            await this.modifier.init();

            // Parse into currentFlow object
            this.currentFlow = await this.parser.parse(flowPath);

            // Save initial state for diff tracking
            this.initialState = await fs.readFile(flowPath, 'utf8');

            await this.context.recordStep('createFlow', { success: true, flowPath });

            this.log(`Flow created: ${flowPath}`);

            return this.currentFlow;
        } catch (error) {
            await this.context.recordError(error, 'createFlow');
            throw error;
        }
    }

    /**
     * Load an existing Flow
     * @param {string} flowPath - Path to Flow XML file
     * @returns {Promise<Object>} Loaded Flow object
     */
    async loadFlow(flowPath) {
        this.log(`Loading Flow: ${flowPath}`);

        await this.ensureContextInitialized(); // ('loadFlow', { flowPath });

        try {
            // Initialize modifier
            this.currentFlowPath = flowPath;
            this.modifier = new FlowNLPModifier(flowPath, this.orgAlias, { verbose: this.verbose });
            await this.modifier.init();

            // Parse Flow
            this.currentFlow = await this.parser.parse(flowPath);

            // Save initial state for diff tracking
            this.initialState = await fs.readFile(flowPath, 'utf8');

            await this.context.recordStep('loadFlow');

            this.log(`Flow loaded successfully`);

            return this.currentFlow;
        } catch (error) {
            await this.context.recordError(error, 'loadFlow');
            throw error;
        }
    }

    /**
     * Add element using natural language
     * @param {string} instruction - Natural language instruction
     * @param {Object} options - Add options
     * @param {boolean} options.dryRun - Calculate complexity without adding (default: false)
     * @returns {Promise<Object>} Added element with complexity info if segmentation enabled
     */
    async addElement(instruction, options = {}) {
        this.ensureFlowLoaded();

        this.log(`Adding element: ${instruction}`);

        await this.ensureContextInitialized(); // ('addElement', { instruction });

        try {
            // If segmentation is enabled, use SegmentManager
            if (this.segmentationEnabled && this.segmentManager) {
                const result = await this.segmentManager.addElementToSegment(instruction, options);

                // Display complexity warnings if present
                if (result.warnings && result.warnings.length > 0 && this.verbose) {
                    for (const warning of result.warnings) {
                        const emoji = warning.level === 'critical' ? '🛑' :
                                    warning.level === 'error' ? '❌' :
                                    warning.level === 'caution' ? '⚠️' : 'ℹ️';
                        this.log(`${emoji} ${warning.message}`);
                    }
                }

                // If dry run or budget exceeded in strict mode, return without adding
                if (result.dryRun || (result.budgetExceeded && !options.force)) {
                    return result;
                }

                return result;
            }

            // Standard flow (no segmentation)
            await this.modifier.parseAndApply(instruction);

            // Save modifier state to file
            await this.modifier.save(this.currentFlowPath);

            // Reload Flow to get updated state
            this.currentFlow = await this.parser.parse(this.currentFlowPath);

            if (this.autoSave) {
                // Already saved above, just update initial state
                this.initialState = await fs.readFile(this.currentFlowPath, 'utf8');
            }

            if (this.autoValidate) {
                await this.validate();
            }

            await this.context.recordStep('addElement');

            return this.currentFlow;
        } catch (error) {
            await this.context.recordError(error, 'addElement');
            throw error;
        }
    }

    /**
     * Remove element by name
     * @param {string} elementName - Name of element to remove
     * @returns {Promise<Object>} Updated Flow
     */
    async removeElement(elementName) {
        this.ensureFlowLoaded();

        this.log(`Removing element: ${elementName}`);

        await this.ensureContextInitialized(); // ('removeElement', { elementName });

        try {
            await this.modifier.removeElement(elementName);

            // Save modifier state to file
            await this.modifier.save(this.currentFlowPath);

            // Reload Flow
            this.currentFlow = await this.parser.parse(this.currentFlowPath);

            if (this.autoSave) {
                // Already saved above, just update initial state
                this.initialState = await fs.readFile(this.currentFlowPath, 'utf8');
            }

            if (this.autoValidate) {
                await this.validate();
            }

            await this.context.recordStep('removeElement');

            return this.currentFlow;
        } catch (error) {
            await this.context.recordError(error, 'removeElement');
            throw error;
        }
    }

    /**
     * Modify element by name
     * @param {string} elementName - Name of element to modify
     * @param {Object} changes - Changes to apply
     * @returns {Promise<Object>} Updated element
     */
    async modifyElement(elementName, changes) {
        this.ensureFlowLoaded();

        this.log(`Modifying element: ${elementName}`);

        await this.ensureContextInitialized(); // ('modifyElement', { elementName, changes });

        try {
            await this.modifier.modifyElement(elementName, changes);

            // Save modifier state to file
            await this.modifier.save(this.currentFlowPath);

            // Reload Flow
            this.currentFlow = await this.parser.parse(this.currentFlowPath);

            if (this.autoSave) {
                // Already saved above, just update initial state
                this.initialState = await fs.readFile(this.currentFlowPath, 'utf8');
            }

            if (this.autoValidate) {
                await this.validate();
            }

            await this.context.recordStep('modifyElement');

            const element = this.modifier.findElement(elementName);
            return element;
        } catch (error) {
            await this.context.recordError(error, 'modifyElement');
            throw error;
        }
    }

    /**
     * Find element by name
     * @param {string} elementName - Name of element to find
     * @returns {Object|null} Element or null
     */
    findElement(elementName) {
        this.ensureFlowLoaded();
        return this.modifier.findElement(elementName);
    }

    /**
     * Get all elements in the Flow
     * @returns {Array} Array of all elements
     */
    getAllElements() {
        this.ensureFlowLoaded();
        return this.currentFlow.getAllElements();
    }

    /**
     * Comprehensive Flow validation
     * @returns {Promise<Object>} Validation result
     */
    async validate() {
        this.ensureFlowLoaded();

        this.log('Running comprehensive validation...');

        await this.ensureContextInitialized(); // ('validate');

        try {
            const validation = await this.parser.validate(this.currentFlowPath);

            // Add best practice checks
            const bestPractices = await this.checkBestPractices();

            // Add governor limit checks
            const governorLimits = await this.checkGovernorLimits();

            const result = {
                ...validation,
                bestPractices: bestPractices,
                governorLimits: governorLimits
            };

            await this.context.recordStep('validate', { valid: validation.valid, result });

            return result;
        } catch (error) {
            await this.context.recordError(error, 'validate');
            throw error;
        }
    }

    /**
     * Check best practices
     * @returns {Promise<Object>} Best practices report
     */
    async checkBestPractices() {
        const issues = [];
        const recommendations = [];
        let score = 100;

        // Check for description
        if (!this.currentFlow.description) {
            issues.push('Missing Flow description');
            recommendations.push('Add a description to document the Flow purpose');
            score -= 10;
        }

        // Check for proper naming
        const elements = this.getAllElements();
        elements.forEach(el => {
            if (!el.label) {
                issues.push(`Element ${el.name} missing label`);
                score -= 5;
            }
        });

        // Check for error handling
        const hasErrorHandling = elements.some(el => el.faultConnector);
        if (!hasErrorHandling) {
            recommendations.push('Consider adding error handling with fault connectors');
            score -= 10;
        }

        return {
            score: Math.max(0, score),
            issues: issues,
            recommendations: recommendations
        };
    }

    /**
     * Check governor limits
     * @returns {Promise<Object>} Governor limits report
     */
    async checkGovernorLimits() {
        const elements = this.getAllElements();
        const elementCount = elements.length;
        const variableCount = this.currentFlow.variables ? this.currentFlow.variables.length : 0;

        const limits = {
            elements: { current: elementCount, limit: 2000, percentage: (elementCount / 2000) * 100 },
            variables: { current: variableCount, limit: 500, percentage: (variableCount / 500) * 100 }
        };

        const warnings = [];

        if (limits.elements.percentage > 80) {
            warnings.push(`Element count approaching limit: ${elementCount}/2000`);
        }

        if (limits.variables.percentage > 80) {
            warnings.push(`Variable count approaching limit: ${variableCount}/500`);
        }

        return {
            limits: limits,
            warnings: warnings
        };
    }

    /**
     * Analyze Flow complexity
     * @returns {Promise<Object>} Complexity analysis
     */
    async analyzeComplexity() {
        const elements = this.getAllElements();
        const elementCount = elements.length;

        let complexity = 'SIMPLE';

        if (elementCount > 50) {
            complexity = 'COMPLEX';
        } else if (elementCount > 20) {
            complexity = 'MODERATE';
        }

        return {
            level: complexity,
            elementCount: elementCount,
            score: elementCount
        };
    }

    /**
     * Suggest improvements
     * @returns {Promise<Array>} Array of suggestions
     */
    async suggestImprovements() {
        const suggestions = [];
        const validation = await this.validate();

        // Add suggestions based on validation
        if (validation.warnings.length > 0) {
            suggestions.push(...validation.warnings.map(w => `Fix warning: ${w}`));
        }

        // Add best practice suggestions
        if (validation.bestPractices.recommendations.length > 0) {
            suggestions.push(...validation.bestPractices.recommendations);
        }

        return suggestions;
    }

    /**
     * Get diff since last save or load
     * @returns {Promise<Object>} Diff report
     */
    async getDiff() {
        this.ensureFlowLoaded();

        const currentState = await fs.readFile(this.currentFlowPath, 'utf8');

        // Create temp files for comparison
        const tempDir = path.join(this.workingDir, '.flow-temp');
        await fs.mkdir(tempDir, { recursive: true });

        const originalPath = path.join(tempDir, 'original.xml');
        const currentPath = path.join(tempDir, 'current.xml');

        await fs.writeFile(originalPath, this.initialState);
        await fs.writeFile(currentPath, currentState);

        const diff = await this.diffChecker.compare(originalPath, currentPath);

        // Cleanup
        await fs.rm(tempDir, { recursive: true, force: true });

        return diff;
    }

    /**
     * Create a checkpoint for rollback
     * @param {string} name - Checkpoint name
     * @returns {Promise<Object>} Checkpoint info
     */
    async createCheckpoint(name) {
        this.ensureFlowLoaded();

        const checkpointPath = path.join(this.workingDir, '.flow-checkpoints');
        await fs.mkdir(checkpointPath, { recursive: true });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${name}_${timestamp}.xml`;
        const filepath = path.join(checkpointPath, filename);

        const currentState = await fs.readFile(this.currentFlowPath, 'utf8');
        await fs.writeFile(filepath, currentState);

        const checkpoint = {
            name: name,
            timestamp: timestamp,
            path: filepath
        };

        this.checkpoints.push(checkpoint);

        this.log(`Checkpoint created: ${name}`);

        return checkpoint;
    }

    /**
     * Rollback to a checkpoint
     * @param {string|number} checkpoint - Checkpoint name or index
     * @returns {Promise<void>}
     */
    async rollback(checkpoint) {
        this.ensureFlowLoaded();

        let checkpointObj;

        if (typeof checkpoint === 'number') {
            checkpointObj = this.checkpoints[checkpoint];
        } else {
            checkpointObj = this.checkpoints.find(c => c.name === checkpoint);
        }

        if (!checkpointObj) {
            throw new Error(`Checkpoint not found: ${checkpoint}`);
        }

        this.log(`Rolling back to checkpoint: ${checkpointObj.name}`);

        const checkpointContent = await fs.readFile(checkpointObj.path, 'utf8');
        await fs.writeFile(this.currentFlowPath, checkpointContent);

        // Reload Flow
        await this.loadFlow(this.currentFlowPath);

        this.log('Rollback completed');
    }

    /**
     * Save Flow to file
     * @param {string} outputPath - Optional output path
     * @returns {Promise<string>} Saved file path
     */
    async save(outputPath = null) {
        this.ensureFlowLoaded();

        const savePath = outputPath || this.currentFlowPath;

        await this.ensureContextInitialized(); // ('save', { savePath });

        try {
            await this.modifier.save(savePath);

            // Update initial state if saving to current path
            if (savePath === this.currentFlowPath) {
                this.initialState = await fs.readFile(savePath, 'utf8');
            }

            await this.context.recordStep('save');

            this.log(`Flow saved: ${savePath}`);

            return savePath;
        } catch (error) {
            await this.context.recordError(error, 'save');
            throw error;
        }
    }

    /**
     * Deploy Flow to org
     * @param {Object} options - Deployment options
     * @returns {Promise<Object>} Deployment result
     */
    async deploy(options = {}) {
        this.ensureFlowLoaded();

        this.log('Deploying Flow...');

        await this.ensureContextInitialized(); // ('deploy', { options });

        try {
            // Validate before deployment
            if (options.validate !== false) {
                const validation = await this.validate();
                if (!validation.valid) {
                    throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
                }
            }

            // Save before deploying
            await this.save();

            // Deploy using FlowDeploymentManager
            const result = await this.deploymentManager.deploy(this.currentFlowPath, {
                activateOnDeploy: options.activateOnDeploy,
                runTests: options.runTests,
                escalatePermissions: options.escalatePermissions !== false,
                verify: options.verify !== false
            });

            await this.context.recordStep('deploy', result);

            this.log('Deployment successful');

            return result;
        } catch (error) {
            await this.context.recordError(error, 'deploy');
            throw error;
        }
    }

    /**
     * Activate Flow
     * @returns {Promise<Object>} Activation result
     */
    async activate() {
        this.ensureFlowLoaded();

        const flowName = path.basename(this.currentFlowPath, '.flow-meta.xml');
        return await this.deploymentManager.activate(flowName);
    }

    /**
     * Deactivate Flow
     * @returns {Promise<Object>} Deactivation result
     */
    async deactivate() {
        this.ensureFlowLoaded();

        const flowName = path.basename(this.currentFlowPath, '.flow-meta.xml');
        return await this.deploymentManager.deactivate(flowName);
    }

    /**
     * Generate Flow documentation
     * @returns {Promise<string>} Markdown documentation
     */
    async generateDocumentation() {
        this.ensureFlowLoaded();

        const flowName = path.basename(this.currentFlowPath, '.flow-meta.xml');
        const elements = this.getAllElements();

        let doc = `# Flow Documentation: ${flowName}\n\n`;

        doc += `**Label**: ${this.currentFlow.label || 'N/A'}\n`;
        doc += `**Type**: ${this.currentFlow.processType || 'N/A'}\n`;
        doc += `**Status**: ${this.currentFlow.status || 'Draft'}\n`;
        doc += `**Description**: ${this.currentFlow.description || 'No description'}\n\n`;

        doc += `## Elements (${elements.length})\n\n`;

        elements.forEach(el => {
            doc += `### ${el.name}\n`;
            doc += `- **Type**: ${el.elementType || 'Unknown'}\n`;
            doc += `- **Label**: ${el.label || 'N/A'}\n`;

            if (el.connector) {
                doc += `- **Connects to**: ${el.connector.targetReference}\n`;
            }

            if (el.defaultConnector) {
                doc += `- **Default connects to**: ${el.defaultConnector.targetReference}\n`;
            }

            if (el.rules && el.rules.length > 0) {
                doc += `- **Rules**: ${el.rules.length}\n`;
                el.rules.forEach(rule => {
                    doc += `  - ${rule.name}: ${rule.conditions ? rule.conditions.length : 0} conditions\n`;
                });
            }

            doc += '\n';
        });

        return doc;
    }

    /**
     * Get Flow context/metadata
     * @returns {Object} Flow context
     */
    getContext() {
        this.ensureFlowLoaded();
        return {
            name: path.basename(this.currentFlowPath, '.flow-meta.xml'),
            path: this.currentFlowPath,
            label: this.currentFlow.label,
            type: this.currentFlow.processType,
            status: this.currentFlow.status
        };
    }

    /**
     * Get Flow metadata
     * @returns {Object} Flow metadata
     */
    getMetadata() {
        this.ensureFlowLoaded();
        return {
            label: this.currentFlow.label,
            description: this.currentFlow.description,
            processType: this.currentFlow.processType,
            status: this.currentFlow.status,
            apiVersion: this.currentFlow.apiVersion
        };
    }

    /**
     * Get Flow statistics
     * @returns {Object} Flow statistics
     */
    getStatistics() {
        this.ensureFlowLoaded();

        const elements = this.getAllElements();

        return {
            elementCount: elements.length,
            variableCount: this.currentFlow.variables ? this.currentFlow.variables.length : 0,
            checkpointCount: this.checkpoints.length,
            hasChanges: this.initialState !== null
        };
    }

    /**
     * Generate Flow XML
     * @private
     */
    generateFlowXML(name, config) {
        const label = config.label || name.replace(/_/g, ' ');
        const description = config.description || '';
        const processType = config.type || 'AutoLaunchedFlow';
        const status = config.status || 'Draft';

        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<Flow xmlns="http://soap.sforce.com/2006/04/metadata">\n';
        xml += '    <apiVersion>62.0</apiVersion>\n';

        if (description) {
            xml += `    <description>${description}</description>\n`;
        }

        xml += `    <label>${label}</label>\n`;
        xml += `    <processType>${processType}</processType>\n`;
        xml += `    <status>${status}</status>\n`;

        // Add trigger config if Record-Triggered
        if (processType === 'Record-Triggered' && config.object) {
            xml += '    <start>\n';
            xml += '        <filterLogic>and</filterLogic>\n';
            xml += `        <object>${config.object}</object>\n`;
            xml += '        <recordTriggerType>Create</recordTriggerType>\n';

            if (config.trigger) {
                xml += `        <triggerType>${config.trigger}</triggerType>\n`;
            }

            xml += '    </start>\n';
        }

        xml += '</Flow>';

        return xml;
    }

    /**
     * Ensure Flow is loaded
     * @private
     */
    ensureFlowLoaded() {
        if (!this.currentFlow || !this.modifier) {
            throw new Error('No Flow loaded. Use createFlow() or loadFlow() first.');
        }
    }

    /**
     * Ensure context is initialized
     * @private
     */
    async ensureContextInitialized(flowName = null) {
        if (!this.contextInitialized) {
            await this.context.init({
                flowName: flowName || (this.currentFlowPath ? path.basename(this.currentFlowPath, '.flow-meta.xml') : 'unknown'),
                operation: 'Flow Authoring',
                orgAlias: this.orgAlias
            });
            this.contextInitialized = true;
        }
    }

    /**
     * Logging helper
     * @private
     */
    log(message) {
        if (this.verbose) {
            console.log(`[FlowAuthor] ${message}`);
        }
    }

    /**
     * Enable segmentation mode for the current flow
     * @param {Object} options - Segmentation options
     * @returns {SegmentManager} Initialized segment manager
     */
    enableSegmentation(options = {}) {
        this.ensureFlowLoaded();

        if (!this.segmentManager) {
            this.segmentManager = new SegmentManager(this, options);
            this.segmentationEnabled = true;
            this.log('Segmentation mode enabled');
        }

        return this.segmentManager;
    }

    /**
     * Disable segmentation mode
     */
    disableSegmentation() {
        this.segmentationEnabled = false;
        this.log('Segmentation mode disabled');
    }

    /**
     * Start a new segment
     * @param {string} name - Segment name
     * @param {Object} options - Segment options
     * @returns {Object} Segment metadata
     */
    startSegment(name, options = {}) {
        if (!this.segmentationEnabled) {
            this.enableSegmentation();
        }

        return this.segmentManager.startSegment(name, options);
    }

    /**
     * Complete the current segment
     * @param {Object} options - Completion options
     * @returns {Promise<Object>} Completion result
     */
    async completeSegment(options = {}) {
        if (!this.segmentManager) {
            throw new Error('No segment manager initialized. Start a segment first.');
        }

        return await this.segmentManager.completeSegment(options);
    }

    /**
     * Get current segment status
     * @returns {Object} Segment status
     */
    getSegmentStatus() {
        if (!this.segmentManager) {
            return {
                hasActiveSegment: false,
                segmentationEnabled: this.segmentationEnabled,
                message: 'Segmentation not enabled'
            };
        }

        return this.segmentManager.getSegmentStatus();
    }

    /**
     * List all segments in the flow
     * @param {Object} options - Listing options
     * @returns {Array<Object>} Segment list
     */
    listSegments(options = {}) {
        if (!this.segmentManager) {
            return [];
        }

        return this.segmentManager.listSegments(options);
    }

    /**
     * Extract a segment as a subflow (Phase 4.1)
     * @param {string} segmentName - Name of segment to extract
     * @param {Object} options - Extraction options
     * @returns {Promise<Object>} Extraction result
     */
    async extractSegmentAsSubflow(segmentName, options = {}) {
        if (!this.segmentManager) {
            throw new Error('No segment manager initialized. Enable segmentation first.');
        }

        return await this.segmentManager.extractSegmentAsSubflow(segmentName, options);
    }

    /**
     * Calculate complexity of current flow
     * @returns {Promise<Object>} Complexity result
     */
    async calculateComplexity() {
        this.ensureFlowLoaded();

        // Read current flow XML
        const flowXML = await fs.readFile(this.currentFlowPath, 'utf8');

        // Calculate complexity
        return await this.complexityCalculator.calculateFromXML(flowXML);
    }

    /**
     * Get complexity calculator instance
     * @returns {FlowComplexityCalculator} Calculator instance
     */
    getComplexityCalculator() {
        return this.complexityCalculator;
    }

    /**
     * Cleanup and close context
     */
    async close() {
        if (this.context) {
            await this.context.clear();
        }
    }
}

module.exports = FlowAuthor;
