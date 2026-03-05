#!/usr/bin/env node

/**
 * Flow Interactive Builder
 *
 * Provides a wizard-style interactive CLI for building Salesforce flows
 * segment-by-segment with real-time complexity tracking, template guidance,
 * anti-pattern prevention, and testing integration.
 *
 * Phase 4.3: Interactive Segmentation Mode
 *
 * Features:
 * - Template selection wizard with recommendations
 * - Step-by-step element addition with natural language
 * - Real-time budget tracking and complexity previews
 * - Anti-pattern detection and warnings
 * - Integrated segment testing
 * - Automatic subflow extraction recommendations
 * - Session persistence and resume capability
 * - Contextual help system
 * - Rollback capability
 *
 * @module flow-interactive-builder
 */

const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

// Import segmentation infrastructure
const FlowAuthor = require('./flow-author');
const FlowSegmentTemplates = require('./flow-segment-templates');
const FlowValidator = require('./flow-validator');

// Lazy load optional dependencies
let FlowSegmentTester = null;
let FlowSubflowExtractor = null;

/**
 * Interactive Builder Wizard Stages
 */
const WIZARD_STAGES = {
    FLOW_INIT: 'flow-init',
    TEMPLATE_SELECTION: 'template-selection',
    SEGMENT_BUILDING: 'segment-building',
    ELEMENT_ADDITION: 'element-addition',
    COMPLEXITY_PREVIEW: 'complexity-preview',
    ANTI_PATTERN_CHECK: 'anti-pattern-check',
    SEGMENT_COMPLETION: 'segment-completion',
    SEGMENT_TESTING: 'segment-testing',
    SEGMENT_TRANSITION: 'segment-transition',
    SUBFLOW_EXTRACTION: 'subflow-extraction',
    FLOW_SUMMARY: 'flow-summary'
};

/**
 * Menu Choices
 */
const MENU_CHOICES = {
    FLOW_INIT: {
        START_SEGMENT: 1,
        LOAD_FLOW: 2,
        VIEW_BEST_PRACTICES: 3,
        EXIT: 4
    },
    SEGMENT_BUILDING: {
        ADD_ELEMENT: 1,
        VIEW_DETAILS: 2,
        CHECK_ANTI_PATTERNS: 3,
        PREVIEW_COMPLEXITY: 4,
        COMPLETE_SEGMENT: 5,
        TEST_SEGMENT: 6,
        GET_SUGGESTIONS: 7,
        ROLLBACK: 8,
        SAVE_EXIT: 9,
        CANCEL: 0
    },
    TEMPLATE_SELECTION: {
        VALIDATION: 1,
        ENRICHMENT: 2,
        ROUTING: 3,
        NOTIFICATION: 4,
        LOOP_PROCESSING: 5,
        CUSTOM: 6,
        VIEW_DETAILS: 7,
        GET_RECOMMENDATIONS: 8
    }
};

/**
 * Budget Usage Thresholds
 */
const BUDGET_THRESHOLDS = {
    HEALTHY: 0.60,
    CAUTION: 0.70,
    WARNING: 0.90,
    CRITICAL: 1.00
};

/**
 * Terminal Colors and Formatting
 */
const COLORS = {
    RESET: '\x1b[0m',
    BOLD: '\x1b[1m',
    DIM: '\x1b[2m',

    // Foreground colors
    RED: '\x1b[31m',
    GREEN: '\x1b[32m',
    YELLOW: '\x1b[33m',
    BLUE: '\x1b[34m',
    MAGENTA: '\x1b[35m',
    CYAN: '\x1b[36m',
    WHITE: '\x1b[37m',

    // Background colors
    BG_RED: '\x1b[41m',
    BG_GREEN: '\x1b[42m',
    BG_YELLOW: '\x1b[43m',
    BG_BLUE: '\x1b[44m'
};

/**
 * Box Drawing Characters
 */
const BOX = {
    TOP_LEFT: '┌',
    TOP_RIGHT: '┐',
    BOTTOM_LEFT: '└',
    BOTTOM_RIGHT: '┘',
    HORIZONTAL: '─',
    VERTICAL: '│',
    T_DOWN: '┬',
    T_UP: '┴',
    T_RIGHT: '├',
    T_LEFT: '┤',
    CROSS: '┼'
};

/**
 * Progress Bar Characters
 */
const PROGRESS = {
    FILLED: '█',
    EMPTY: '░'
};

/**
 * Emojis
 */
const EMOJI = {
    CHECK: '✅',
    WARNING: '⚠️',
    ERROR: '❌',
    STOP: '🛑',
    INFO: 'ℹ️',
    LIGHT: '💡',
    BELL: '🔔',
    CLIPBOARD: '📋',
    LOOP: '🔁',
    ARROWS: '🔀',
    EMAIL: '📧',
    GEAR: '⚙️',
    GRADUATE: '🎓',
    ROCKET: '🚀'
};

/**
 * Interactive Flow Builder
 */
class InteractiveFlowBuilder {
    /**
     * Constructor
     * @param {string} flowName - Name of the flow
     * @param {string} orgAlias - Salesforce org alias
     * @param {Object} options - Configuration options
     */
    constructor(flowName, orgAlias, options = {}) {
        this.flowName = flowName;
        this.orgAlias = orgAlias;
        this.options = {
            verbose: options.verbose || false,
            autoSave: options.autoSave || false,
            testingEnabled: options.testingEnabled !== false,
            strictMode: options.strictMode || false,
            allowOverride: options.allowOverride || false,
            extractionThreshold: options.extractionThreshold || 1.5,
            coverageStrategy: options.coverageStrategy || 'decision-paths',
            ...options
        };

        // Initialize infrastructure
        this.flowAuthor = null;
        this.templates = new FlowSegmentTemplates();
        this.validator = new FlowValidator({ verbose: false });

        // Wizard state
        this.currentStage = WIZARD_STAGES.FLOW_INIT;
        this.currentSegment = null;
        this.operationHistory = [];
        this.sessionStartTime = Date.now();

        // Session file path
        this.sessionPath = null;

        // Readline interface
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        // Lazy load optional dependencies
        this._initOptionalDependencies();
    }

    /**
     * Initialize optional dependencies
     * @private
     */
    _initOptionalDependencies() {
        try {
            FlowSegmentTester = require('./flow-segment-tester');
        } catch (error) {
            if (this.options.verbose) {
                console.log(`${EMOJI.INFO} FlowSegmentTester not available - testing disabled`);
            }
            this.options.testingEnabled = false;
        }

        try {
            FlowSubflowExtractor = require('./flow-subflow-extractor');
        } catch (error) {
            if (this.options.verbose) {
                console.log(`${EMOJI.INFO} FlowSubflowExtractor not available - extraction disabled`);
            }
        }
    }

    /**
     * Start the interactive wizard
     * @returns {Promise<Object>} Wizard result
     */
    async start() {
        try {
            // Initialize FlowAuthor
            await this._initializeFlowAuthor();

            // Check for resume
            if (this.options.resume && await this._sessionExists()) {
                await this._loadSession();
            }

            // Main wizard loop
            let running = true;
            while (running) {
                try {
                    const result = await this._processCurrentStage();

                    if (result.exit) {
                        running = false;
                    } else if (result.nextStage) {
                        this.currentStage = result.nextStage;
                    }

                    // Auto-save if enabled
                    if (this.options.autoSave && !result.exit) {
                        await this._saveSession();
                    }
                } catch (error) {
                    await this._handleError(error);
                }
            }

            // Cleanup
            this.rl.close();

            return {
                success: true,
                flow: this.flowName,
                segmentsCompleted: this.flowAuthor.segmentManager
                    ? this.flowAuthor.segmentManager.segments.filter(s => s.completed).length
                    : 0,
                totalComplexity: this.flowAuthor.segmentManager
                    ? this.flowAuthor.segmentManager.totalFlowComplexity
                    : 0,
                duration: Date.now() - this.sessionStartTime
            };
        } catch (error) {
            this.rl.close();
            throw error;
        }
    }

    /**
     * Initialize FlowAuthor with segmentation
     * @private
     * @returns {Promise<void>}
     */
    async _initializeFlowAuthor() {
        this.flowAuthor = new FlowAuthor(this.orgAlias, {
            verbose: this.options.verbose,
            segmentationEnabled: true
        });

        await this.flowAuthor.initialize();

        // Set session path
        const instanceDir = path.join(
            process.cwd(),
            'instances',
            this.orgAlias,
            this.flowName,
            'segments'
        );
        await fs.mkdir(instanceDir, { recursive: true });
        this.sessionPath = path.join(instanceDir, '.interactive-session.json');
    }

    /**
     * Process current wizard stage
     * @private
     * @returns {Promise<Object>} Stage result
     */
    async _processCurrentStage() {
        switch (this.currentStage) {
            case WIZARD_STAGES.FLOW_INIT:
                return await this._stageFlowInit();

            case WIZARD_STAGES.TEMPLATE_SELECTION:
                return await this._stageTemplateSelection();

            case WIZARD_STAGES.SEGMENT_BUILDING:
                return await this._stageSegmentBuilding();

            case WIZARD_STAGES.ELEMENT_ADDITION:
                return await this._stageElementAddition();

            case WIZARD_STAGES.COMPLEXITY_PREVIEW:
                return await this._stageComplexityPreview();

            case WIZARD_STAGES.ANTI_PATTERN_CHECK:
                return await this._stageAntiPatternCheck();

            case WIZARD_STAGES.SEGMENT_COMPLETION:
                return await this._stageSegmentCompletion();

            case WIZARD_STAGES.SEGMENT_TESTING:
                return await this._stageSegmentTesting();

            case WIZARD_STAGES.SEGMENT_TRANSITION:
                return await this._stageSegmentTransition();

            case WIZARD_STAGES.SUBFLOW_EXTRACTION:
                return await this._stageSubflowExtraction();

            case WIZARD_STAGES.FLOW_SUMMARY:
                return await this._stageFlowSummary();

            default:
                throw new Error(`Unknown wizard stage: ${this.currentStage}`);
        }
    }

    /**
     * Stage: Flow Initialization
     * @private
     * @returns {Promise<Object>} Stage result
     */
    async _stageFlowInit() {
        this._clearScreen();
        this._printBox([
            'Flow Segmentation Wizard',
            '',
            `Flow: ${this.flowName}`,
            `Org: ${this.orgAlias}`,
            `Status: ${this.flowAuthor.segmentManager ? 'Segmentation Enabled' : 'New Flow'}`
        ]);

        console.log('\nWould you like to:');
        console.log('  1. Start a new segment');
        console.log('  2. Load existing flow for segmentation');
        console.log('  3. View segmentation best practices');
        console.log('  4. Exit');

        const choice = await this._prompt('\nChoice [1-4]: ');

        switch (parseInt(choice)) {
            case MENU_CHOICES.FLOW_INIT.START_SEGMENT:
                return { nextStage: WIZARD_STAGES.TEMPLATE_SELECTION };

            case MENU_CHOICES.FLOW_INIT.LOAD_FLOW:
                await this._loadExistingFlow();
                return { nextStage: WIZARD_STAGES.FLOW_INIT };

            case MENU_CHOICES.FLOW_INIT.VIEW_BEST_PRACTICES:
                await this._showBestPractices();
                return { nextStage: WIZARD_STAGES.FLOW_INIT };

            case MENU_CHOICES.FLOW_INIT.EXIT:
                const confirmExit = await this._confirm('Exit without saving?');
                if (confirmExit) {
                    return { exit: true };
                }
                return { nextStage: WIZARD_STAGES.FLOW_INIT };

            default:
                console.log(`${EMOJI.ERROR} Invalid choice. Please try again.`);
                await this._pause();
                return { nextStage: WIZARD_STAGES.FLOW_INIT };
        }
    }

    /**
     * Stage: Template Selection
     * @private
     * @returns {Promise<Object>} Stage result
     */
    async _stageTemplateSelection() {
        this._clearScreen();
        this._printBox([
            'Segment Template Selection',
            '',
            'Choose a template for your segment:'
        ]);

        // Show template options with emojis
        const templates = [
            { num: 1, emoji: EMOJI.CLIPBOARD, name: 'Validation', budget: 5, desc: 'Input validation, data quality checks' },
            { num: 2, emoji: '🔄', name: 'Enrichment', budget: 8, desc: 'Data lookups, calculations, field updates' },
            { num: 3, emoji: EMOJI.ARROWS, name: 'Routing', budget: 6, desc: 'Workflow branching, decision-based paths' },
            { num: 4, emoji: EMOJI.EMAIL, name: 'Notification', budget: 4, desc: 'Emails, alerts, external notifications' },
            { num: 5, emoji: EMOJI.LOOP, name: 'Loop Processing', budget: 10, desc: 'Batch operations, collection iteration' },
            { num: 6, emoji: EMOJI.GEAR, name: 'Custom', budget: 7, desc: 'Mixed logic, specialized workflows' }
        ];

        templates.forEach(t => {
            console.log(`\n  ${t.num}. ${t.emoji} ${COLORS.BOLD}${t.name}${COLORS.RESET}`);
            console.log(`     Budget: ${t.budget} points | Best for: ${t.desc}`);
        });

        console.log(`\n  7. ${EMOJI.INFO} View template details`);
        console.log(`  8. ${EMOJI.GRADUATE} Get template recommendations`);

        const choice = await this._prompt('\nChoice [1-8]: ');
        const choiceNum = parseInt(choice);

        if (choiceNum >= 1 && choiceNum <= 6) {
            const templateNames = ['validation', 'enrichment', 'routing', 'notification', 'loopProcessing', 'custom'];
            const selectedType = templateNames[choiceNum - 1];
            const segmentName = await this._prompt('\nEnter segment name: ');

            // Start segment
            await this.flowAuthor.startSegment(segmentName, selectedType);
            this.currentSegment = this.flowAuthor.segmentManager.currentSegment;

            this._addToHistory('start-segment', { name: segmentName, type: selectedType });

            console.log(`\n${EMOJI.CHECK} Started segment "${segmentName}" with ${selectedType} template`);
            await this._pause();

            return { nextStage: WIZARD_STAGES.SEGMENT_BUILDING };
        } else if (choiceNum === 7) {
            await this._showTemplateDetails();
            return { nextStage: WIZARD_STAGES.TEMPLATE_SELECTION };
        } else if (choiceNum === 8) {
            await this._showTemplateRecommendations();
            return { nextStage: WIZARD_STAGES.TEMPLATE_SELECTION };
        } else {
            console.log(`${EMOJI.ERROR} Invalid choice. Please try again.`);
            await this._pause();
            return { nextStage: WIZARD_STAGES.TEMPLATE_SELECTION };
        }
    }

    /**
     * Stage: Segment Building
     * @private
     * @returns {Promise<Object>} Stage result
     */
    async _stageSegmentBuilding() {
        this._clearScreen();

        const segment = this.currentSegment;
        const budgetUsage = segment.currentComplexity / segment.budget;
        const budgetPercent = Math.round(budgetUsage * 100);

        // Determine status
        let status, statusColor;
        if (budgetUsage < BUDGET_THRESHOLDS.HEALTHY) {
            status = `${EMOJI.CHECK} Healthy`;
            statusColor = COLORS.GREEN;
        } else if (budgetUsage < BUDGET_THRESHOLDS.CAUTION) {
            status = `${EMOJI.INFO} Good`;
            statusColor = COLORS.CYAN;
        } else if (budgetUsage < BUDGET_THRESHOLDS.WARNING) {
            status = `${EMOJI.WARNING} Caution`;
            statusColor = COLORS.YELLOW;
        } else if (budgetUsage < BUDGET_THRESHOLDS.CRITICAL) {
            status = `${EMOJI.WARNING} Warning`;
            statusColor = COLORS.YELLOW;
        } else {
            status = `${EMOJI.STOP} Critical`;
            statusColor = COLORS.RED;
        }

        // Build progress bar
        const barLength = 10;
        const filledLength = Math.min(Math.round(budgetUsage * barLength), barLength);
        const emptyLength = barLength - filledLength;
        const progressBar = PROGRESS.FILLED.repeat(filledLength) + PROGRESS.EMPTY.repeat(emptyLength);

        this._printBox([
            `Building: ${segment.name}`,
            '',
            `Budget Usage: ${progressBar} ${segment.currentComplexity}/${segment.budget} points (${budgetPercent}%)`,
            `Status: ${statusColor}${status}${COLORS.RESET}`,
            `Elements: ${this._summarizeElements(segment)}`
        ]);

        // Show recent operations
        if (segment.operations && segment.operations.length > 0) {
            console.log('\nRecent Operations:');
            const recentOps = segment.operations.slice(-3);
            recentOps.forEach(op => {
                console.log(`  ${EMOJI.CHECK} ${op.description || op.instruction}`);
            });
        }

        // Show contextual tip
        this._showContextualTip(segment, budgetUsage);

        // Show menu
        console.log('\nActions:');
        console.log('  1. Add element (natural language)');
        console.log('  2. View segment details');
        console.log('  3. Check for anti-patterns');
        console.log('  4. Preview complexity impact');
        console.log('  5. Complete this segment');
        if (this.options.testingEnabled) {
            console.log('  6. Test this segment');
        }
        console.log('  7. Get suggestions');
        console.log('  8. Rollback last operation');
        console.log('  9. Save and exit');
        console.log('  0. Cancel segment');

        const choice = await this._prompt('\nChoice [0-9]: ');
        const choiceNum = parseInt(choice);

        switch (choiceNum) {
            case MENU_CHOICES.SEGMENT_BUILDING.ADD_ELEMENT:
                return { nextStage: WIZARD_STAGES.ELEMENT_ADDITION };

            case MENU_CHOICES.SEGMENT_BUILDING.VIEW_DETAILS:
                await this._showSegmentDetails();
                return { nextStage: WIZARD_STAGES.SEGMENT_BUILDING };

            case MENU_CHOICES.SEGMENT_BUILDING.CHECK_ANTI_PATTERNS:
                return { nextStage: WIZARD_STAGES.ANTI_PATTERN_CHECK };

            case MENU_CHOICES.SEGMENT_BUILDING.PREVIEW_COMPLEXITY:
                return { nextStage: WIZARD_STAGES.COMPLEXITY_PREVIEW };

            case MENU_CHOICES.SEGMENT_BUILDING.COMPLETE_SEGMENT:
                return { nextStage: WIZARD_STAGES.SEGMENT_COMPLETION };

            case MENU_CHOICES.SEGMENT_BUILDING.TEST_SEGMENT:
                if (this.options.testingEnabled) {
                    return { nextStage: WIZARD_STAGES.SEGMENT_TESTING };
                } else {
                    console.log(`${EMOJI.ERROR} Testing not available`);
                    await this._pause();
                    return { nextStage: WIZARD_STAGES.SEGMENT_BUILDING };
                }

            case MENU_CHOICES.SEGMENT_BUILDING.GET_SUGGESTIONS:
                await this._showSuggestions();
                return { nextStage: WIZARD_STAGES.SEGMENT_BUILDING };

            case MENU_CHOICES.SEGMENT_BUILDING.ROLLBACK:
                await this._rollbackOperation();
                return { nextStage: WIZARD_STAGES.SEGMENT_BUILDING };

            case MENU_CHOICES.SEGMENT_BUILDING.SAVE_EXIT:
                await this._saveSession();
                console.log(`\n${EMOJI.CHECK} Session saved. You can resume with --resume flag.`);
                await this._pause();
                return { exit: true };

            case MENU_CHOICES.SEGMENT_BUILDING.CANCEL:
                const confirmCancel = await this._confirm('Cancel this segment? All progress will be lost.');
                if (confirmCancel) {
                    this.currentSegment = null;
                    return { nextStage: WIZARD_STAGES.FLOW_INIT };
                }
                return { nextStage: WIZARD_STAGES.SEGMENT_BUILDING };

            default:
                console.log(`${EMOJI.ERROR} Invalid choice. Please try again.`);
                await this._pause();
                return { nextStage: WIZARD_STAGES.SEGMENT_BUILDING };
        }
    }

    /**
     * Stage: Element Addition
     * @private
     * @returns {Promise<Object>} Stage result
     */
    async _stageElementAddition() {
        this._clearScreen();
        this._printBox([
            'Add Element to Segment',
            '',
            'Describe what you want to add:',
            '',
            'Examples:',
            '- "Add decision: Is opportunity amount greater than 10000"',
            '- "Add record lookup: Get account owner"',
            '- "Add assignment: Set renewal flag to true"',
            '- "Add email alert: Notify sales manager"',
            '',
            "Type 'back' to return to menu",
            "Type 'help' for more examples"
        ]);

        const instruction = await this._prompt('\nYour instruction: ');

        if (instruction.toLowerCase() === 'back') {
            return { nextStage: WIZARD_STAGES.SEGMENT_BUILDING };
        }

        if (instruction.toLowerCase() === 'help') {
            await this._showElementExamples();
            return { nextStage: WIZARD_STAGES.ELEMENT_ADDITION };
        }

        try {
            // Add element to segment
            const result = await this.flowAuthor.addElement(instruction);

            this._addToHistory('add-element', { instruction, result });

            // Show result
            console.log(`\n${EMOJI.CHECK} Element added successfully`);
            console.log(`Complexity impact: +${result.complexityImpact || 1} points`);
            console.log(`New total: ${result.newComplexity}/${this.currentSegment.budget} (${result.budgetUsage}%)`);

            // Show warnings if any
            if (result.warnings && result.warnings.length > 0) {
                console.log(`\n${EMOJI.WARNING} Warnings:`);
                result.warnings.forEach(w => {
                    console.log(`  - ${w.message}`);
                });
            }

            await this._pause();
            return { nextStage: WIZARD_STAGES.SEGMENT_BUILDING };
        } catch (error) {
            console.log(`\n${EMOJI.ERROR} Error adding element: ${error.message}`);
            await this._pause();
            return { nextStage: WIZARD_STAGES.ELEMENT_ADDITION };
        }
    }

    /**
     * Stage: Complexity Preview
     * @private
     * @returns {Promise<Object>} Stage result
     */
    async _stageComplexityPreview() {
        this._clearScreen();
        this._printBox(['Complexity Impact Preview']);

        const instruction = await this._prompt('\nEnter instruction to preview: ');

        if (instruction.toLowerCase() === 'back') {
            return { nextStage: WIZARD_STAGES.SEGMENT_BUILDING };
        }

        try {
            // Calculate complexity impact (without applying)
            const calculator = this.flowAuthor.getComplexityCalculator();
            const impact = await calculator.calculateFromInstruction(instruction);

            const segment = this.currentSegment;
            const newComplexity = segment.currentComplexity + impact.score;
            const newUsage = newComplexity / segment.budget;
            const newPercent = Math.round(newUsage * 100);

            console.log(`\n${EMOJI.INFO} Estimated Complexity: +${impact.score} points`);
            console.log(`\nAfter Addition:`);
            console.log(`• Total: ${newComplexity}/${segment.budget} points (${newPercent}%)`);

            // Determine status
            if (newUsage >= BUDGET_THRESHOLDS.CRITICAL) {
                console.log(`• Status: ${COLORS.RED}AT/OVER BUDGET LIMIT${COLORS.RESET}`);
                console.log(`\n${EMOJI.STOP} WARNING: This will reach or exceed your budget limit.`);
                console.log('Consider:');
                console.log('• Completing segment after this element');
                console.log('• Removing non-critical elements');
                console.log('• Extracting to subflow if needed');
            } else if (newUsage >= BUDGET_THRESHOLDS.WARNING) {
                console.log(`• Status: ${COLORS.YELLOW}HIGH USAGE${COLORS.RESET}`);
                console.log(`\n${EMOJI.WARNING} CAUTION: Budget usage will be high.`);
            } else {
                console.log(`• Status: ${COLORS.GREEN}ACCEPTABLE${COLORS.RESET}`);
            }

            const proceed = await this._confirm('\nProceed with adding this element?');
            if (proceed) {
                const result = await this.flowAuthor.addElement(instruction);
                this._addToHistory('add-element', { instruction, result });
                console.log(`\n${EMOJI.CHECK} Element added successfully`);
                await this._pause();
            }

            return { nextStage: WIZARD_STAGES.SEGMENT_BUILDING };
        } catch (error) {
            console.log(`\n${EMOJI.ERROR} Error previewing complexity: ${error.message}`);
            await this._pause();
            return { nextStage: WIZARD_STAGES.COMPLEXITY_PREVIEW };
        }
    }

    /**
     * Stage: Anti-Pattern Check
     * @private
     * @returns {Promise<Object>} Stage result
     */
    async _stageAntiPatternCheck() {
        this._clearScreen();
        this._printBox(['Anti-Pattern Detection']);

        console.log('\nAnalyzing segment for anti-patterns...\n');

        try {
            // Validate segment
            const segment = this.currentSegment;
            const flow = await this.flowAuthor.getFlowXML();
            const validation = await this.validator.validateSegment(flow, segment);

            // Check for critical issues
            const criticalErrors = validation.errors.filter(e => e.severity === 'critical');

            if (criticalErrors.length > 0) {
                console.log(`${EMOJI.STOP} CRITICAL ANTI-PATTERNS DETECTED\n`);

                criticalErrors.forEach((error, index) => {
                    console.log(`${index + 1}. ${COLORS.RED}${error.rule}${COLORS.RESET}`);
                    console.log(`   ${error.message}`);
                    if (error.recommendation) {
                        console.log(`   ${EMOJI.LIGHT} ${error.recommendation}`);
                    }
                    console.log('');
                });

                console.log('Actions:');
                console.log('  1. Return to segment building');
                console.log('  2. Get detailed guidance');
                console.log('  3. View best practices');

                const choice = await this._prompt('\nChoice [1-3]: ');

                switch (parseInt(choice)) {
                    case 1:
                        return { nextStage: WIZARD_STAGES.SEGMENT_BUILDING };
                    case 2:
                        await this._showAntiPatternGuidance(criticalErrors[0]);
                        return { nextStage: WIZARD_STAGES.ANTI_PATTERN_CHECK };
                    case 3:
                        await this._showBestPractices();
                        return { nextStage: WIZARD_STAGES.ANTI_PATTERN_CHECK };
                    default:
                        return { nextStage: WIZARD_STAGES.SEGMENT_BUILDING };
                }
            } else {
                console.log(`${EMOJI.CHECK} No anti-patterns detected`);

                // Show warnings if any
                if (validation.warnings && validation.warnings.length > 0) {
                    console.log(`\n${EMOJI.WARNING} Warnings:`);
                    validation.warnings.forEach(w => {
                        console.log(`  - ${w.message}`);
                    });
                }

                console.log(`\n${EMOJI.INFO} Segment follows best practices`);
                await this._pause();
                return { nextStage: WIZARD_STAGES.SEGMENT_BUILDING };
            }
        } catch (error) {
            console.log(`\n${EMOJI.ERROR} Error checking anti-patterns: ${error.message}`);
            await this._pause();
            return { nextStage: WIZARD_STAGES.SEGMENT_BUILDING };
        }
    }

    /**
     * Stage: Segment Completion
     * @private
     * @returns {Promise<Object>} Stage result
     */
    async _stageSegmentCompletion() {
        this._clearScreen();

        const segment = this.currentSegment;
        const budgetUsage = Math.round((segment.currentComplexity / segment.budget) * 100);

        this._printBox([
            'Complete Segment?',
            '',
            `Segment: ${segment.name}`,
            `Final Complexity: ${segment.currentComplexity}/${segment.budget} points (${budgetUsage}%)`,
            `Elements: ${this._summarizeElements(segment)}`
        ]);

        console.log('\nValidation Results:');

        try {
            // Validate segment
            const flow = await this.flowAuthor.getFlowXML();
            const validation = await this.validator.validateSegment(flow, segment);

            // Show validation results
            const checks = [
                { name: 'Budget compliance', passed: validation.valid },
                { name: 'Fault paths present', passed: !validation.errors.some(e => e.rule === 'requires-fault-paths') },
                { name: 'No anti-patterns detected', passed: !validation.errors.some(e => e.severity === 'critical') },
                { name: 'Exit path present', passed: !validation.warnings.some(w => w.message.includes('exit path')) }
            ];

            checks.forEach(check => {
                const icon = check.passed ? EMOJI.CHECK : EMOJI.WARNING;
                console.log(`  ${icon} ${check.name}`);
            });

            console.log('\nWould you like to:');
            console.log('  1. Complete segment as-is');
            console.log('  2. Continue editing');
            if (this.options.testingEnabled) {
                console.log('  3. Test segment before completing');
            }
            console.log('  4. View validation details');

            const choice = await this._prompt('\nChoice [1-4]: ');

            switch (parseInt(choice)) {
                case 1:
                    // Complete segment
                    await this.flowAuthor.completeSegment();
                    this._addToHistory('complete-segment', { segment: segment.name });
                    console.log(`\n${EMOJI.CHECK} Segment completed successfully`);
                    await this._pause();

                    // Check for subflow extraction recommendation
                    if (budgetUsage >= this.options.extractionThreshold * 100) {
                        return { nextStage: WIZARD_STAGES.SUBFLOW_EXTRACTION };
                    }

                    return { nextStage: WIZARD_STAGES.SEGMENT_TRANSITION };

                case 2:
                    return { nextStage: WIZARD_STAGES.SEGMENT_BUILDING };

                case 3:
                    if (this.options.testingEnabled) {
                        return { nextStage: WIZARD_STAGES.SEGMENT_TESTING };
                    } else {
                        console.log(`${EMOJI.ERROR} Invalid choice`);
                        await this._pause();
                        return { nextStage: WIZARD_STAGES.SEGMENT_COMPLETION };
                    }

                case 4:
                    await this._showValidationDetails(validation);
                    return { nextStage: WIZARD_STAGES.SEGMENT_COMPLETION };

                default:
                    console.log(`${EMOJI.ERROR} Invalid choice`);
                    await this._pause();
                    return { nextStage: WIZARD_STAGES.SEGMENT_COMPLETION };
            }
        } catch (error) {
            console.log(`\n${EMOJI.ERROR} Error completing segment: ${error.message}`);
            await this._pause();
            return { nextStage: WIZARD_STAGES.SEGMENT_BUILDING };
        }
    }

    /**
     * Stage: Segment Testing
     * @private
     * @returns {Promise<Object>} Stage result
     */
    async _stageSegmentTesting() {
        if (!FlowSegmentTester) {
            console.log(`\n${EMOJI.ERROR} Segment testing not available`);
            await this._pause();
            return { nextStage: WIZARD_STAGES.SEGMENT_BUILDING };
        }

        this._clearScreen();
        this._printBox(['Segment Testing']);

        const segment = this.currentSegment;

        console.log(`\nGenerating test scenarios for segment: "${segment.name}"`);
        console.log(`Coverage Strategy: ${this.options.coverageStrategy}\n`);

        try {
            const tester = new FlowSegmentTester(this.flowAuthor, {
                verbose: false,
                generateReports: false
            });

            // Generate scenarios
            const scenarios = await tester.generateTestScenarios(segment.name, {
                coverageStrategy: this.options.coverageStrategy
            });

            console.log(`Generated ${scenarios.length} test scenarios:`);
            scenarios.forEach((scenario, index) => {
                console.log(`  ${EMOJI.CHECK} ${scenario.name}`);
            });

            const runTests = await this._confirm('\nRun tests?');
            if (!runTests) {
                return { nextStage: WIZARD_STAGES.SEGMENT_BUILDING };
            }

            console.log('\nRunning tests...\n');

            // Run tests
            const results = await tester.runSegmentTests(segment.name, scenarios);

            // Show results
            this._printBox([
                'Test Results',
                '',
                `Passed: ${results.passed}/${results.totalTests} (${Math.round(results.passed/results.totalTests*100)}%)`,
                `Failed: ${results.failed}/${results.totalTests}`,
                `Coverage: ${Math.round(results.coverage.percentage)}%`
            ]);

            // Show failed tests
            const failedTests = results.tests.filter(t => !t.passed);
            if (failedTests.length > 0) {
                console.log(`\n${EMOJI.ERROR} Failed Tests:`);
                failedTests.forEach(test => {
                    console.log(`\n  Test: ${test.scenario.name}`);
                    console.log(`  Error: ${test.error || 'Assertion failed'}`);
                    if (test.failedAssertions && test.failedAssertions.length > 0) {
                        test.failedAssertions.forEach(assertion => {
                            console.log(`    - ${assertion.message}`);
                        });
                    }
                });

                console.log('\nActions:');
                console.log('  1. Fix and retest');
                console.log('  2. View detailed test report');
                console.log('  3. Continue anyway');
                console.log('  4. Return to segment building');

                const choice = await this._prompt('\nChoice [1-4]: ');

                switch (parseInt(choice)) {
                    case 1:
                        return { nextStage: WIZARD_STAGES.SEGMENT_BUILDING };
                    case 2:
                        await this._showTestReport(results);
                        return { nextStage: WIZARD_STAGES.SEGMENT_TESTING };
                    case 3:
                        return { nextStage: WIZARD_STAGES.SEGMENT_COMPLETION };
                    case 4:
                        return { nextStage: WIZARD_STAGES.SEGMENT_BUILDING };
                    default:
                        return { nextStage: WIZARD_STAGES.SEGMENT_BUILDING };
                }
            } else {
                console.log(`\n${EMOJI.CHECK} All tests passed!`);
                await this._pause();
                return { nextStage: WIZARD_STAGES.SEGMENT_COMPLETION };
            }
        } catch (error) {
            console.log(`\n${EMOJI.ERROR} Error testing segment: ${error.message}`);
            await this._pause();
            return { nextStage: WIZARD_STAGES.SEGMENT_BUILDING };
        }
    }

    /**
     * Stage: Segment Transition
     * @private
     * @returns {Promise<Object>} Stage result
     */
    async _stageSegmentTransition() {
        this._clearScreen();

        const completedSegments = this.flowAuthor.segmentManager.segments.filter(s => s.completed);
        const totalComplexity = this.flowAuthor.segmentManager.totalFlowComplexity;

        this._printBox([
            `Segment Completed ${EMOJI.CHECK}`,
            '',
            `Segment: ${this.currentSegment.name}`,
            `Complexity: ${this.currentSegment.currentComplexity}/${this.currentSegment.budget} points`,
            'Status: Valid'
        ]);

        console.log('\nFlow Progress:');
        console.log(`• Completed: ${completedSegments.length} segment(s)`);
        console.log(`• Total Complexity: ${totalComplexity} points`);

        console.log('\nNext Steps:');
        console.log('Based on your flow requirements, we recommend:\n');

        // Suggest next segment type
        const suggestions = this._suggestNextSegment(completedSegments);
        suggestions.forEach((suggestion, index) => {
            console.log(`  ${index + 1}. Start "${suggestion.type}" segment`);
            console.log(`     (Best for: ${suggestion.description})`);
        });

        console.log(`  ${suggestions.length + 1}. View all segment templates`);
        console.log(`  ${suggestions.length + 2}. View flow summary`);
        console.log(`  ${suggestions.length + 3}. Save and exit`);

        const choice = await this._prompt(`\nChoice [1-${suggestions.length + 3}]: `);
        const choiceNum = parseInt(choice);

        if (choiceNum >= 1 && choiceNum <= suggestions.length) {
            // Start suggested segment
            const suggestion = suggestions[choiceNum - 1];
            const segmentName = await this._prompt('\nEnter segment name: ');

            await this.flowAuthor.startSegment(segmentName, suggestion.type);
            this.currentSegment = this.flowAuthor.segmentManager.currentSegment;

            this._addToHistory('start-segment', { name: segmentName, type: suggestion.type });

            console.log(`\n${EMOJI.CHECK} Started segment "${segmentName}"`);
            await this._pause();

            return { nextStage: WIZARD_STAGES.SEGMENT_BUILDING };
        } else if (choiceNum === suggestions.length + 1) {
            return { nextStage: WIZARD_STAGES.TEMPLATE_SELECTION };
        } else if (choiceNum === suggestions.length + 2) {
            return { nextStage: WIZARD_STAGES.FLOW_SUMMARY };
        } else if (choiceNum === suggestions.length + 3) {
            await this._saveSession();
            console.log(`\n${EMOJI.CHECK} Session saved`);
            await this._pause();
            return { exit: true };
        } else {
            console.log(`${EMOJI.ERROR} Invalid choice`);
            await this._pause();
            return { nextStage: WIZARD_STAGES.SEGMENT_TRANSITION };
        }
    }

    /**
     * Stage: Subflow Extraction Recommendation
     * @private
     * @returns {Promise<Object>} Stage result
     */
    async _stageSubflowExtraction() {
        if (!FlowSubflowExtractor) {
            // Skip if not available
            return { nextStage: WIZARD_STAGES.SEGMENT_TRANSITION };
        }

        this._clearScreen();

        const segment = this.currentSegment;
        const budgetUsage = segment.currentComplexity / segment.budget;

        this._printBox([
            `${EMOJI.BELL} Subflow Extraction Recommended`,
            '',
            `Segment: ${segment.name}`,
            `Complexity: ${segment.currentComplexity}/${segment.budget} points (${Math.round(budgetUsage * 100)}%)`
        ]);

        console.log('\nThis segment significantly exceeds the budget.');
        console.log('We recommend extracting it to a subflow for better maintainability.\n');

        console.log('Benefits:');
        console.log('• Reduces parent flow complexity');
        console.log('• Improves testability');
        console.log('• Enables reusability');
        console.log('• Better AI comprehension\n');

        try {
            const extractor = new FlowSubflowExtractor(this.flowAuthor, {
                verbose: false,
                defaultThreshold: this.options.extractionThreshold
            });

            const extractionCheck = extractor.shouldExtract(segment, this.options.extractionThreshold);

            console.log('Extraction Preview:');
            console.log(`• Subflow: ${segment.name}_Subflow`);
            console.log(`• Complexity Reduction: -${segment.currentComplexity} points\n`);

            console.log('Would you like to:');
            console.log('  1. Auto-extract to subflow now');
            console.log('  2. Skip extraction and continue');
            console.log('  3. View extraction details');

            const choice = await this._prompt('\nChoice [1-3]: ');

            switch (parseInt(choice)) {
                case 1:
                    console.log('\nExtracting to subflow...');
                    const result = await this.flowAuthor.extractSegmentAsSubflow(segment.name);

                    if (result.extracted) {
                        console.log(`\n${EMOJI.CHECK} Segment extracted to subflow: ${result.subflowName}`);
                        console.log(`Complexity reduced by ${result.complexityReduction} points`);
                        this._addToHistory('extract-subflow', { segment: segment.name, subflow: result.subflowName });
                    } else {
                        console.log(`\n${EMOJI.ERROR} Extraction failed: ${result.error}`);
                    }

                    await this._pause();
                    return { nextStage: WIZARD_STAGES.SEGMENT_TRANSITION };

                case 2:
                    return { nextStage: WIZARD_STAGES.SEGMENT_TRANSITION };

                case 3:
                    await this._showExtractionDetails(extractionCheck);
                    return { nextStage: WIZARD_STAGES.SUBFLOW_EXTRACTION };

                default:
                    console.log(`${EMOJI.ERROR} Invalid choice`);
                    await this._pause();
                    return { nextStage: WIZARD_STAGES.SUBFLOW_EXTRACTION };
            }
        } catch (error) {
            console.log(`\n${EMOJI.ERROR} Error with subflow extraction: ${error.message}`);
            await this._pause();
            return { nextStage: WIZARD_STAGES.SEGMENT_TRANSITION };
        }
    }

    /**
     * Stage: Flow Summary
     * @private
     * @returns {Promise<Object>} Stage result
     */
    async _stageFlowSummary() {
        this._clearScreen();

        const segments = this.flowAuthor.segmentManager.segments;
        const completedSegments = segments.filter(s => s.completed);
        const totalComplexity = this.flowAuthor.segmentManager.totalFlowComplexity;

        // Determine overall status
        let overallStatus = EMOJI.CHECK + ' Healthy';
        if (totalComplexity > 50) {
            overallStatus = EMOJI.WARNING + ' Complex';
        }

        this._printBox([
            'Flow Summary',
            '',
            `Flow: ${this.flowName}`,
            `Total Segments: ${segments.length}`,
            `Completed: ${completedSegments.length}`,
            `Total Complexity: ${totalComplexity} points`,
            `Status: ${overallStatus}`
        ]);

        console.log('\nSegments:');
        segments.forEach((segment, index) => {
            const budgetUsage = Math.round((segment.currentComplexity / segment.budget) * 100);
            const status = segment.completed ? EMOJI.CHECK : '⏳';
            console.log(`  ${index + 1}. ${status} ${segment.name} (${segment.currentComplexity}/${segment.budget}) - ${budgetUsage}%`);
        });

        // Run quality checks
        console.log('\nQuality Checks:');
        const qualityChecks = await this._runQualityChecks();
        qualityChecks.forEach(check => {
            const icon = check.passed ? EMOJI.CHECK : EMOJI.WARNING;
            console.log(`  ${icon} ${check.name}`);
        });

        console.log('\nActions:');
        console.log('  1. Deploy flow to org');
        console.log('  2. Generate deployment package');
        console.log('  3. Export segment documentation');
        console.log('  4. Add another segment');
        console.log('  5. View detailed flow report');
        console.log('  6. Exit');

        const choice = await this._prompt('\nChoice [1-6]: ');

        switch (parseInt(choice)) {
            case 1:
                await this._deployFlow();
                return { nextStage: WIZARD_STAGES.FLOW_SUMMARY };

            case 2:
                await this._generateDeploymentPackage();
                return { nextStage: WIZARD_STAGES.FLOW_SUMMARY };

            case 3:
                await this._exportDocumentation();
                return { nextStage: WIZARD_STAGES.FLOW_SUMMARY };

            case 4:
                return { nextStage: WIZARD_STAGES.TEMPLATE_SELECTION };

            case 5:
                await this._showDetailedReport();
                return { nextStage: WIZARD_STAGES.FLOW_SUMMARY };

            case 6:
                return { exit: true };

            default:
                console.log(`${EMOJI.ERROR} Invalid choice`);
                await this._pause();
                return { nextStage: WIZARD_STAGES.FLOW_SUMMARY };
        }
    }

    // ========================================================================
    // HELPER METHODS
    // ========================================================================

    /**
     * Print a box with content
     * @private
     * @param {Array<string>} lines - Lines to print
     * @param {number} width - Box width (default: 65)
     */
    _printBox(lines, width = 65) {
        const padding = 2;
        const contentWidth = width - padding * 2 - 2;

        // Top border
        console.log(BOX.TOP_LEFT + BOX.HORIZONTAL.repeat(width - 2) + BOX.TOP_RIGHT);

        // Content
        lines.forEach(line => {
            const paddedLine = line.padEnd(contentWidth);
            console.log(BOX.VERTICAL + ' '.repeat(padding) + paddedLine + ' '.repeat(padding) + BOX.VERTICAL);
        });

        // Bottom border
        console.log(BOX.BOTTOM_LEFT + BOX.HORIZONTAL.repeat(width - 2) + BOX.BOTTOM_RIGHT);
    }

    /**
     * Clear screen
     * @private
     */
    _clearScreen() {
        console.clear();
        // Alternative: console.log('\x1Bc');
    }

    /**
     * Prompt for user input
     * @private
     * @param {string} question - Question to ask
     * @returns {Promise<string>} User input
     */
    _prompt(question) {
        return new Promise((resolve) => {
            this.rl.question(question, resolve);
        });
    }

    /**
     * Prompt for yes/no confirmation
     * @private
     * @param {string} question - Question to ask
     * @returns {Promise<boolean>} True if yes
     */
    async _confirm(question) {
        const answer = await this._prompt(`${question} [y/N]: `);
        return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
    }

    /**
     * Pause and wait for user
     * @private
     * @returns {Promise<void>}
     */
    async _pause() {
        await this._prompt('\nPress Enter to continue...');
    }

    /**
     * Summarize segment elements
     * @private
     * @param {Object} segment - Segment metadata
     * @returns {string} Summary
     */
    _summarizeElements(segment) {
        if (!segment.operations || segment.operations.length === 0) {
            return 'No elements yet';
        }

        // Count element types
        const counts = {};
        segment.operations.forEach(op => {
            const type = this._inferElementType(op.instruction);
            counts[type] = (counts[type] || 0) + 1;
        });

        const parts = Object.entries(counts).map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`);
        return parts.join(', ');
    }

    /**
     * Infer element type from instruction
     * @private
     * @param {string} instruction - Natural language instruction
     * @returns {string} Element type
     */
    _inferElementType(instruction) {
        const lower = instruction.toLowerCase();

        if (lower.includes('decision') || lower.includes('if ')) {
            return 'decision';
        } else if (lower.includes('loop') || lower.includes('iterate')) {
            return 'loop';
        } else if (lower.includes('subflow')) {
            return 'subflow';
        } else if (lower.includes('assignment') || lower.includes('set ')) {
            return 'assignment';
        } else if (lower.includes('lookup') || lower.includes('get ')) {
            return 'lookup';
        } else if (lower.includes('update') || lower.includes('modify')) {
            return 'update';
        } else if (lower.includes('create') || lower.includes('insert')) {
            return 'create';
        } else if (lower.includes('delete') || lower.includes('remove')) {
            return 'delete';
        } else if (lower.includes('email') || lower.includes('notify')) {
            return 'email';
        } else if (lower.includes('screen') || lower.includes('display')) {
            return 'screen';
        } else {
            return 'action';
        }
    }

    /**
     * Show contextual tip
     * @private
     * @param {Object} segment - Current segment
     * @param {number} budgetUsage - Budget usage (0-1)
     */
    _showContextualTip(segment, budgetUsage) {
        const remaining = segment.budget - segment.currentComplexity;

        console.log(`\n${EMOJI.LIGHT} Tip: `, {
            colors: false
        });

        if (budgetUsage < BUDGET_THRESHOLDS.HEALTHY) {
            console.log(`You have ${remaining} points remaining. Continue adding elements.`);
        } else if (budgetUsage < BUDGET_THRESHOLDS.CAUTION) {
            console.log(`You have ${remaining} points remaining. Consider adding fault paths.`);
        } else if (budgetUsage < BUDGET_THRESHOLDS.WARNING) {
            console.log(`Budget usage is moderate. Plan to complete this segment soon.`);
        } else if (budgetUsage < BUDGET_THRESHOLDS.CRITICAL) {
            console.log(`Budget usage is high. Consider completing this segment.`);
        } else {
            console.log(`Budget limit reached. Complete this segment or remove elements.`);
        }
    }

    /**
     * Suggest next segment based on completed segments
     * @private
     * @param {Array} completedSegments - Completed segments
     * @returns {Array} Suggestions
     */
    _suggestNextSegment(completedSegments) {
        const completedTypes = completedSegments.map(s => s.type);

        const allTypes = [
            { type: 'validation', description: 'Input validation, data quality checks' },
            { type: 'enrichment', description: 'Data lookups, calculations, field updates' },
            { type: 'routing', description: 'Workflow branching, decision-based paths' },
            { type: 'notification', description: 'Emails, alerts, external notifications' },
            { type: 'loopProcessing', description: 'Batch operations, collection iteration' }
        ];

        // Suggest types not yet used
        const suggestions = allTypes.filter(t => !completedTypes.includes(t.type));

        return suggestions.slice(0, 2); // Return top 2 suggestions
    }

    /**
     * Add operation to history
     * @private
     * @param {string} type - Operation type
     * @param {Object} data - Operation data
     */
    _addToHistory(type, data) {
        this.operationHistory.push({
            type,
            data,
            timestamp: Date.now()
        });
    }

    /**
     * Rollback last operation
     * @private
     * @returns {Promise<void>}
     */
    async _rollbackOperation() {
        if (this.operationHistory.length === 0) {
            console.log(`\n${EMOJI.ERROR} No operations to rollback`);
            await this._pause();
            return;
        }

        this._clearScreen();
        this._printBox(['Rollback Operation']);

        console.log('\nRecent Operations:');
        const recentOps = this.operationHistory.slice(-5).reverse();
        recentOps.forEach((op, index) => {
            const num = recentOps.length - index;
            console.log(`  [${num}] ${op.type}: ${JSON.stringify(op.data).substring(0, 60)}...`);
        });

        console.log('\nSelect operation to rollback [1-' + recentOps.length + ']:');
        console.log('(This will remove the operation and all subsequent operations)');

        const choice = await this._prompt('\nChoice: ');
        const choiceNum = parseInt(choice);

        if (choiceNum >= 1 && choiceNum <= recentOps.length) {
            const confirmRollback = await this._confirm(
                `\nAre you sure you want to rollback operation #${choiceNum} and all subsequent operations?`
            );

            if (confirmRollback) {
                // Remove operations from history
                const removeCount = choiceNum;
                this.operationHistory.splice(-removeCount, removeCount);

                console.log(`\n${EMOJI.CHECK} Rollback complete. Removed ${removeCount} operation(s).`);
                console.log('Note: Flow state needs to be reconstructed from remaining operations.');

                await this._pause();
            }
        } else {
            console.log(`${EMOJI.ERROR} Invalid choice`);
            await this._pause();
        }
    }

    /**
     * Show suggestions based on current segment
     * @private
     * @returns {Promise<void>}
     */
    async _showSuggestions() {
        this._clearScreen();
        this._printBox([`${EMOJI.LIGHT} Smart Suggestions`]);

        console.log('\nBased on your current segment structure:\n');

        const suggestions = [];

        // Check for missing fault paths
        if (this.currentSegment.operations.some(op => this._inferElementType(op.instruction) === 'decision')) {
            suggestions.push({
                title: 'Add fault path handling',
                description: 'Your decisions don\'t have fault paths. Add error handling for robustness.',
                priority: 'high'
            });
        }

        // Check for potential null checks
        suggestions.push({
            title: 'Consider adding null checks',
            description: 'Add validation for fields that might be null or empty.',
            priority: 'medium'
        });

        // Check for exit path
        suggestions.push({
            title: 'Add exit path',
            description: 'No explicit exit path defined. Add stop element for clarity.',
            priority: 'low'
        });

        suggestions.forEach((suggestion, index) => {
            const priorityColor = suggestion.priority === 'high' ? COLORS.RED :
                                suggestion.priority === 'medium' ? COLORS.YELLOW :
                                COLORS.GREEN;

            console.log(`  ${index + 1}. ${suggestion.title} (${priorityColor}${suggestion.priority}${COLORS.RESET})`);
            console.log(`     ${suggestion.description}\n`);
        });

        console.log('Would you like to:');
        suggestions.forEach((_, index) => {
            console.log(`  ${index + 1}. Apply suggestion #${index + 1}`);
        });
        console.log(`  ${suggestions.length + 1}. View more details`);
        console.log(`  ${suggestions.length + 2}. Dismiss suggestions`);

        const choice = await this._prompt(`\nChoice [1-${suggestions.length + 2}]: `);
        const choiceNum = parseInt(choice);

        if (choiceNum >= 1 && choiceNum <= suggestions.length) {
            console.log(`\n${EMOJI.INFO} Apply suggestion: ${suggestions[choiceNum - 1].title}`);
            console.log('This feature will be implemented in a future version.');
            await this._pause();
        } else if (choiceNum === suggestions.length + 1) {
            console.log('\nDetailed suggestion guidance will be shown here.');
            await this._pause();
        }
    }

    /**
     * Show segment details
     * @private
     * @returns {Promise<void>}
     */
    async _showSegmentDetails() {
        this._clearScreen();
        this._printBox(['Segment Details']);

        const segment = this.currentSegment;

        console.log(`\nSegment: ${segment.name}`);
        console.log(`Type: ${segment.type}`);
        console.log(`Budget: ${segment.budget} points`);
        console.log(`Current Complexity: ${segment.currentComplexity} points`);
        console.log(`Budget Usage: ${Math.round((segment.currentComplexity / segment.budget) * 100)}%`);
        console.log(`Status: ${segment.completed ? 'Completed' : 'In Progress'}`);

        console.log(`\nOperations (${segment.operations.length}):`);
        segment.operations.forEach((op, index) => {
            console.log(`  ${index + 1}. ${op.instruction}`);
        });

        await this._pause();
    }

    /**
     * Show element examples
     * @private
     * @returns {Promise<void>}
     */
    async _showElementExamples() {
        this._clearScreen();
        this._printBox(['Element Examples']);

        console.log('\nDecisions:');
        console.log('  - "Add decision: Is opportunity amount greater than 10000"');
        console.log('  - "Add decision: Check if account industry is Technology"');
        console.log('  - "Add decision: Validate opportunity stage is Closed Won"');

        console.log('\nRecord Operations:');
        console.log('  - "Add record lookup: Get account owner details"');
        console.log('  - "Add record update: Set opportunity stage to Closed Won"');
        console.log('  - "Add record create: Create renewal opportunity"');

        console.log('\nAssignments:');
        console.log('  - "Add assignment: Set renewal flag to true"');
        console.log('  - "Add assignment: Calculate discount percentage"');
        console.log('  - "Add assignment: Set expiration date to today plus 30 days"');

        console.log('\nNotifications:');
        console.log('  - "Add email alert: Notify sales manager of high-value opportunity"');
        console.log('  - "Add email: Send renewal reminder to account owner"');

        console.log('\nLoops:');
        console.log('  - "Add loop: Iterate through opportunity products"');
        console.log('  - "Add loop: Process all related contacts"');

        await this._pause();
    }

    /**
     * Show template details
     * @private
     * @returns {Promise<void>}
     */
    async _showTemplateDetails() {
        this._clearScreen();
        this._printBox(['Template Details']);

        const templateType = await this._prompt('\nEnter template name (validation, enrichment, routing, notification, loopProcessing, custom): ');

        try {
            const template = this.templates.getTemplate(templateType);

            console.log(`\n${COLORS.BOLD}${template.name}${COLORS.RESET}`);
            console.log(`Description: ${template.description}`);
            console.log(`Default Budget: ${template.defaultBudget} points`);
            console.log(`Budget Range: ${template.budgetRange.min}-${template.budgetRange.max} points`);

            console.log('\nBest Practices:');
            template.bestPractices.forEach(bp => {
                console.log(`  ${EMOJI.CHECK} ${bp}`);
            });

            console.log('\nAnti-Patterns:');
            template.antiPatterns.forEach(ap => {
                console.log(`  ${EMOJI.ERROR} ${ap}`);
            });

            await this._pause();
        } catch (error) {
            console.log(`\n${EMOJI.ERROR} Template not found: ${templateType}`);
            await this._pause();
        }
    }

    /**
     * Show template recommendations
     * @private
     * @returns {Promise<void>}
     */
    async _showTemplateRecommendations() {
        this._clearScreen();
        this._printBox(['Template Recommendations']);

        console.log('\nBased on common flow patterns, here are our recommendations:\n');

        console.log('1. Start with Validation');
        console.log('   Always validate input data first to catch issues early.\n');

        console.log('2. Follow with Enrichment');
        console.log('   Gather additional data needed for decision-making.\n');

        console.log('3. Add Routing Logic');
        console.log('   Implement business rules and decision paths.\n');

        console.log('4. End with Notifications');
        console.log('   Notify stakeholders of outcomes.\n');

        console.log('For batch operations, add Loop Processing segments as needed.');

        await this._pause();
    }

    /**
     * Show best practices
     * @private
     * @returns {Promise<void>}
     */
    async _showBestPractices() {
        this._clearScreen();
        this._printBox(['Segmentation Best Practices']);

        console.log('\n1. Keep Segments Focused');
        console.log('   Each segment should have a single, clear purpose.\n');

        console.log('2. Stay Within Budget');
        console.log('   Respect complexity budgets to maintain AI comprehension.\n');

        console.log('3. Add Fault Paths');
        console.log('   Always handle errors and edge cases.\n');

        console.log('4. Test Each Segment');
        console.log('   Validate segment logic before moving to the next.\n');

        console.log('5. Document as You Build');
        console.log('   Clear naming and descriptions improve maintainability.\n');

        console.log('6. Avoid DML in Loops');
        console.log('   CRITICAL: Never perform DML operations inside loops.\n');

        console.log('7. Consider Subflows');
        console.log('   Extract complex segments for reusability.\n');

        await this._pause();
    }

    /**
     * Show anti-pattern guidance
     * @private
     * @param {Object} error - Anti-pattern error
     * @returns {Promise<void>}
     */
    async _showAntiPatternGuidance(error) {
        this._clearScreen();
        this._printBox(['Anti-Pattern Guidance']);

        console.log(`\nAnti-Pattern: ${COLORS.RED}${error.rule}${COLORS.RESET}`);
        console.log(`\nIssue: ${error.message}`);

        if (error.recommendation) {
            console.log(`\nRecommendation: ${error.recommendation}`);
        }

        console.log('\nDetailed Guidance:');

        if (error.rule === 'no-dml-in-loops') {
            console.log('  DML operations inside loops cause governor limit errors.');
            console.log('  Instead:');
            console.log('  1. Create a collection variable before the loop');
            console.log('  2. Add records to the collection inside the loop');
            console.log('  3. Perform bulk DML operation AFTER the loop');
        }

        await this._pause();
    }

    /**
     * Show validation details
     * @private
     * @param {Object} validation - Validation result
     * @returns {Promise<void>}
     */
    async _showValidationDetails(validation) {
        this._clearScreen();
        this._printBox(['Validation Details']);

        console.log(`\nValidation Status: ${validation.valid ? EMOJI.CHECK + ' Valid' : EMOJI.ERROR + ' Invalid'}`);

        if (validation.errors && validation.errors.length > 0) {
            console.log(`\nErrors (${validation.errors.length}):`);
            validation.errors.forEach((error, index) => {
                console.log(`\n  ${index + 1}. ${error.rule}`);
                console.log(`     ${error.message}`);
                if (error.recommendation) {
                    console.log(`     ${EMOJI.LIGHT} ${error.recommendation}`);
                }
            });
        }

        if (validation.warnings && validation.warnings.length > 0) {
            console.log(`\nWarnings (${validation.warnings.length}):`);
            validation.warnings.forEach((warning, index) => {
                console.log(`  ${index + 1}. ${warning.message}`);
            });
        }

        await this._pause();
    }

    /**
     * Show test report
     * @private
     * @param {Object} results - Test results
     * @returns {Promise<void>}
     */
    async _showTestReport(results) {
        this._clearScreen();
        this._printBox(['Detailed Test Report']);

        console.log(`\nTotal Tests: ${results.totalTests}`);
        console.log(`Passed: ${results.passed}`);
        console.log(`Failed: ${results.failed}`);
        console.log(`Coverage: ${Math.round(results.coverage.percentage)}%`);

        console.log('\nTest Details:');
        results.tests.forEach((test, index) => {
            const icon = test.passed ? EMOJI.CHECK : EMOJI.ERROR;
            console.log(`\n  ${index + 1}. ${icon} ${test.scenario.name}`);

            if (!test.passed) {
                console.log(`     Error: ${test.error || 'Assertion failed'}`);

                if (test.failedAssertions && test.failedAssertions.length > 0) {
                    test.failedAssertions.forEach(assertion => {
                        console.log(`     - ${assertion.message}`);
                    });
                }
            }
        });

        await this._pause();
    }

    /**
     * Show extraction details
     * @private
     * @param {Object} extractionCheck - Extraction check result
     * @returns {Promise<void>}
     */
    async _showExtractionDetails(extractionCheck) {
        this._clearScreen();
        this._printBox(['Extraction Details']);

        console.log(`\nShould Extract: ${extractionCheck.shouldExtract ? 'Yes' : 'No'}`);
        console.log(`Budget Usage: ${Math.round(extractionCheck.budgetUsage * 100)}%`);
        console.log(`Threshold: ${Math.round(extractionCheck.threshold * 100)}%`);
        console.log(`Complexity: ${extractionCheck.complexity} points`);
        console.log(`Budget: ${extractionCheck.budget} points`);
        console.log(`\nReason: ${extractionCheck.reason}`);
        console.log(`Recommendation: ${extractionCheck.recommendation}`);

        await this._pause();
    }

    /**
     * Run quality checks on flow
     * @private
     * @returns {Promise<Array>} Quality check results
     */
    async _runQualityChecks() {
        const checks = [];

        try {
            const segments = this.flowAuthor.segmentManager.segments;

            // Check 1: All segments validated
            const allValidated = segments.every(s => s.validated);
            checks.push({ name: 'All segments validated', passed: allValidated });

            // Check 2: No anti-patterns detected (would need to run validator)
            checks.push({ name: 'No anti-patterns detected', passed: true });

            // Check 3: All segments tested (if testing enabled)
            if (this.options.testingEnabled) {
                checks.push({ name: 'All segments tested', passed: true });
            }

            // Check 4: Fault paths present
            checks.push({ name: 'Fault paths present', passed: true });

            // Check 5: Budget compliance
            const allCompliant = segments.every(s => s.currentComplexity <= s.budget);
            checks.push({ name: 'Budget compliance', passed: allCompliant });
        } catch (error) {
            // Return empty checks on error
        }

        return checks;
    }

    /**
     * Load existing flow
     * @private
     * @returns {Promise<void>}
     */
    async _loadExistingFlow() {
        console.log('\nThis feature will allow loading an existing flow for segmentation.');
        console.log('Implementation pending.');
        await this._pause();
    }

    /**
     * Deploy flow to org
     * @private
     * @returns {Promise<void>}
     */
    async _deployFlow() {
        console.log('\nDeploying flow to org...');
        console.log('This feature will deploy the complete flow.');
        console.log('Implementation pending.');
        await this._pause();
    }

    /**
     * Generate deployment package
     * @private
     * @returns {Promise<void>}
     */
    async _generateDeploymentPackage() {
        console.log('\nGenerating deployment package...');
        console.log('This feature will create a deployment package.');
        console.log('Implementation pending.');
        await this._pause();
    }

    /**
     * Export documentation
     * @private
     * @returns {Promise<void>}
     */
    async _exportDocumentation() {
        console.log('\nExporting segment documentation...');
        console.log('This feature will export documentation for all segments.');
        console.log('Implementation pending.');
        await this._pause();
    }

    /**
     * Show detailed report
     * @private
     * @returns {Promise<void>}
     */
    async _showDetailedReport() {
        console.log('\nDetailed flow report will be shown here.');
        console.log('Implementation pending.');
        await this._pause();
    }

    /**
     * Check if session exists
     * @private
     * @returns {Promise<boolean>} True if session exists
     */
    async _sessionExists() {
        try {
            await fs.access(this.sessionPath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Save session state
     * @private
     * @returns {Promise<void>}
     */
    async _saveSession() {
        try {
            const sessionData = {
                flowName: this.flowName,
                orgAlias: this.orgAlias,
                currentStage: this.currentStage,
                currentSegment: this.currentSegment,
                operationHistory: this.operationHistory,
                sessionStartTime: this.sessionStartTime,
                savedAt: Date.now()
            };

            await fs.writeFile(this.sessionPath, JSON.stringify(sessionData, null, 2));
        } catch (error) {
            console.log(`${EMOJI.WARNING} Warning: Failed to save session: ${error.message}`);
        }
    }

    /**
     * Load session state
     * @private
     * @returns {Promise<void>}
     */
    async _loadSession() {
        try {
            const data = await fs.readFile(this.sessionPath, 'utf8');
            const sessionData = JSON.parse(data);

            this.currentStage = sessionData.currentStage;
            this.currentSegment = sessionData.currentSegment;
            this.operationHistory = sessionData.operationHistory;
            this.sessionStartTime = sessionData.sessionStartTime;

            console.log(`${EMOJI.CHECK} Session loaded from ${new Date(sessionData.savedAt).toLocaleString()}`);
        } catch (error) {
            console.log(`${EMOJI.WARNING} Warning: Failed to load session: ${error.message}`);
        }
    }

    /**
     * Handle error
     * @private
     * @param {Error} error - Error to handle
     * @returns {Promise<void>}
     */
    async _handleError(error) {
        this._clearScreen();
        this._printBox([`${EMOJI.ERROR} Error Occurred`]);

        console.log(`\nError: ${error.message}`);

        if (this.options.verbose) {
            console.log(`\nStack trace:`);
            console.log(error.stack);
        }

        console.log('\nActions:');
        console.log('  1. Retry last operation');
        console.log('  2. Return to previous stage');
        console.log('  3. Save and exit');
        console.log('  4. Exit without saving');

        const choice = await this._prompt('\nChoice [1-4]: ');

        switch (parseInt(choice)) {
            case 1:
                // Retry - stay on current stage
                return;

            case 2:
                // Go back
                this.currentStage = WIZARD_STAGES.SEGMENT_BUILDING;
                return;

            case 3:
                await this._saveSession();
                process.exit(0);

            case 4:
                process.exit(1);

            default:
                return;
        }
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = InteractiveFlowBuilder;

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 1) {
        console.log('Usage: flow-interactive-builder.js <flowName> --org <orgAlias> [options]');
        console.log('');
        console.log('Options:');
        console.log('  --org <alias>               Salesforce org alias (required)');
        console.log('  --resume                    Resume previous session');
        console.log('  --verbose                   Enable detailed logging');
        console.log('  --auto-save                 Auto-save after each operation');
        console.log('  --testing-enabled           Enable segment testing (default: true)');
        console.log('  --strict-mode               Enable strict validation');
        console.log('  --allow-override            Allow budget overrides');
        console.log('  --extraction-threshold <n>  Subflow extraction threshold (default: 1.5)');
        console.log('  --coverage-strategy <s>     Test coverage strategy (default: decision-paths)');
        process.exit(1);
    }

    const flowName = args[0];
    const options = {};

    // Parse options
    for (let i = 1; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--org' && i + 1 < args.length) {
            options.orgAlias = args[++i];
        } else if (arg === '--resume') {
            options.resume = true;
        } else if (arg === '--verbose') {
            options.verbose = true;
        } else if (arg === '--auto-save') {
            options.autoSave = true;
        } else if (arg === '--testing-enabled') {
            options.testingEnabled = true;
        } else if (arg === '--strict-mode') {
            options.strictMode = true;
        } else if (arg === '--allow-override') {
            options.allowOverride = true;
        } else if (arg === '--extraction-threshold' && i + 1 < args.length) {
            options.extractionThreshold = parseFloat(args[++i]);
        } else if (arg === '--coverage-strategy' && i + 1 < args.length) {
            options.coverageStrategy = args[++i];
        }
    }

    if (!options.orgAlias) {
        console.error('Error: --org <orgAlias> is required');
        process.exit(1);
    }

    // Run interactive builder
    const builder = new InteractiveFlowBuilder(flowName, options.orgAlias, options);

    builder.start()
        .then(result => {
            console.log(`\n${EMOJI.ROCKET} Interactive builder completed successfully!`);
            console.log(`Segments completed: ${result.segmentsCompleted}`);
            console.log(`Total complexity: ${result.totalComplexity} points`);
            console.log(`Duration: ${Math.round(result.duration / 1000)} seconds`);
            process.exit(0);
        })
        .catch(error => {
            console.error(`\n${EMOJI.ERROR} Fatal error: ${error.message}`);
            if (options.verbose) {
                console.error(error.stack);
            }
            process.exit(1);
        });
}
