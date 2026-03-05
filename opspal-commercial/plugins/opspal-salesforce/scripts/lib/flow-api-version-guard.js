/**
 * Flow API Version Guard
 *
 * Provides proactive API version checking for flow editing operations.
 * Checks element compatibility BEFORE operations are attempted, enabling
 * graceful upgrade prompts rather than deployment failures.
 *
 * @module flow-api-version-guard
 * @version 1.0.0
 * @since salesforce-plugin@3.65.0
 *
 * Key Capabilities:
 * - Query org's current API version
 * - Extract flow's declared API version
 * - Pre-flight element compatibility checks
 * - Proactive upgrade recommendations
 * - Automated flow version upgrades
 *
 * Usage:
 *   const FlowAPIVersionGuard = require('./flow-api-version-guard');
 *   const guard = new FlowAPIVersionGuard('myOrgAlias');
 *
 *   // Check before adding element
 *   const check = guard.canAddElement('subflows', flowAPIVersion);
 *   if (check.requiresUpgrade) {
 *     console.log(check.prompt);
 *   }
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

/**
 * Element types and their minimum required API versions
 * Based on Salesforce release notes and compatibility testing
 */
const ELEMENT_VERSION_REQUIREMENTS = {
    // Subflow invocation (v65.0+)
    subflows: {
        minimum_version: 65.0,
        description: 'Subflow invocation element',
        introduced: 'v65.0',
        replaces: 'actionCalls with actionType="flow"',
        notes: 'Required for calling flows from record-triggered flows'
    },

    // Record Choice Sets (enhanced in v58.0)
    recordChoiceSets: {
        minimum_version: 58.0,
        description: 'Dynamic picklist from records',
        introduced: 'v50.0',
        enhanced: 'v58.0',
        notes: 'Enhanced filtering capabilities in v58.0+'
    },

    // Transform formulas (v60.0+)
    transforms: {
        minimum_version: 60.0,
        description: 'Data transformation formulas',
        introduced: 'v60.0',
        notes: 'Allows inline data transformation in assignments'
    },

    // Collection filters (v58.0+)
    collectionProcessors: {
        minimum_version: 58.0,
        description: 'Collection filter and sort operations',
        introduced: 'v58.0',
        notes: 'Filter, sort, and process collections without loops'
    },

    // Screen components with reactive visibility (v59.0+)
    screenWithReactiveComponents: {
        minimum_version: 59.0,
        description: 'Screen with reactive component visibility',
        introduced: 'v59.0',
        notes: 'Component visibility based on other field values'
    },

    // Orchestrator stages (v61.0+)
    orchestratedStages: {
        minimum_version: 61.0,
        description: 'Orchestrator flow stages',
        introduced: 'v61.0',
        notes: 'For multi-step orchestration flows'
    },

    // Async paths (v62.0+)
    asyncPaths: {
        minimum_version: 62.0,
        description: 'Asynchronous flow paths',
        introduced: 'v62.0',
        notes: 'Execute paths asynchronously'
    },

    // Data Cloud triggers (v63.0+)
    dataCloudTriggers: {
        minimum_version: 63.0,
        description: 'Data Cloud record triggers',
        introduced: 'v63.0',
        notes: 'Trigger flows from Data Cloud records'
    },

    // Enhanced wait events (v58.0+)
    waitEvents: {
        minimum_version: 58.0,
        description: 'Enhanced wait event conditions',
        introduced: 'v54.0',
        enhanced: 'v58.0',
        notes: 'Wait for multiple conditions with enhanced logic'
    },

    // Standard elements (no version restriction)
    decisions: { minimum_version: 40.0, description: 'Decision element' },
    assignments: { minimum_version: 40.0, description: 'Assignment element' },
    recordCreates: { minimum_version: 40.0, description: 'Create Records element' },
    recordUpdates: { minimum_version: 40.0, description: 'Update Records element' },
    recordDeletes: { minimum_version: 40.0, description: 'Delete Records element' },
    recordLookups: { minimum_version: 40.0, description: 'Get Records element' },
    loops: { minimum_version: 40.0, description: 'Loop element' },
    screens: { minimum_version: 40.0, description: 'Screen element' },
    actionCalls: { minimum_version: 40.0, description: 'Action element' },
    waits: { minimum_version: 46.0, description: 'Pause element' },
    customErrors: { minimum_version: 54.0, description: 'Custom Error element' }
};

/**
 * Current/recommended versions
 */
const VERSION_INFO = {
    CURRENT: 66.0,       // Latest stable
    RECOMMENDED: 65.0,   // Recommended for new flows
    MINIMUM_SUPPORTED: 54.0  // Minimum for modern features
};

class FlowAPIVersionGuard {
    /**
     * Create a new FlowAPIVersionGuard
     * @param {string} orgAlias - Salesforce org alias for version queries
     * @param {Object} options - Configuration options
     * @param {boolean} options.verbose - Enable verbose logging
     * @param {boolean} options.cacheOrgVersion - Cache org version (default: true)
     */
    constructor(orgAlias = null, options = {}) {
        this.orgAlias = orgAlias;
        this.verbose = options.verbose || false;
        this.cacheOrgVersion = options.cacheOrgVersion !== false;
        this.orgVersionCache = null;
        this.elementRequirements = ELEMENT_VERSION_REQUIREMENTS;
    }

    /**
     * Log message if verbose mode is enabled
     * @param {string} message - Message to log
     * @private
     */
    _log(message) {
        if (this.verbose) {
            console.log(`[FlowAPIVersionGuard] ${message}`);
        }
    }

    /**
     * Get the org's current API version
     * @param {string} orgAlias - Optional org alias override
     * @returns {Promise<number>} Org API version
     */
    async getOrgAPIVersion(orgAlias = null) {
        const alias = orgAlias || this.orgAlias;

        // Return cached version if available
        if (this.cacheOrgVersion && this.orgVersionCache && !orgAlias) {
            return this.orgVersionCache;
        }

        if (!alias) {
            this._log('No org alias provided, returning current recommended version');
            return VERSION_INFO.RECOMMENDED;
        }

        try {
            // Query org limits which returns API version info
            const orgFlag = alias ? `-o ${alias}` : '';
            const result = execSync(
                `sf org display ${orgFlag} --json`,
                { encoding: 'utf8', timeout: 30000 }
            );

            const orgInfo = JSON.parse(result);
            if (orgInfo.result && orgInfo.result.apiVersion) {
                const version = parseFloat(orgInfo.result.apiVersion);
                if (this.cacheOrgVersion) {
                    this.orgVersionCache = version;
                }
                this._log(`Org ${alias} API version: ${version}`);
                return version;
            }
        } catch (error) {
            this._log(`Could not query org version: ${error.message}`);
        }

        // Fallback to recommended version
        return VERSION_INFO.RECOMMENDED;
    }

    /**
     * Get the API version declared in a flow
     * @param {string} flowXMLOrPath - Flow XML content or file path
     * @returns {Promise<number|null>} Flow API version or null if not declared
     */
    async getFlowAPIVersion(flowXMLOrPath) {
        let flowXML = flowXMLOrPath;

        // Read from file if path provided
        if (typeof flowXMLOrPath === 'string' && flowXMLOrPath.endsWith('.xml')) {
            try {
                flowXML = await fs.readFile(flowXMLOrPath, 'utf8');
            } catch (error) {
                this._log(`Could not read flow file: ${error.message}`);
                return null;
            }
        }

        // Extract API version using regex (faster than full XML parse)
        const versionMatch = flowXML.match(/<apiVersion>(\d+\.?\d*)<\/apiVersion>/);
        if (versionMatch && versionMatch[1]) {
            return parseFloat(versionMatch[1]);
        }

        return null;
    }

    /**
     * Check full version compatibility for a flow
     * @param {string} flowPath - Path to flow XML file
     * @returns {Promise<Object>} Compatibility check result
     */
    async checkVersionCompatibility(flowPath) {
        const flowVersion = await this.getFlowAPIVersion(flowPath);
        const orgVersion = await this.getOrgAPIVersion();

        const result = {
            flowPath,
            flowVersion,
            orgVersion,
            currentRecommended: VERSION_INFO.RECOMMENDED,
            outdated: false,
            upgradeRecommended: false,
            upgradeRequired: false,
            warnings: [],
            suggestions: []
        };

        // Check if flow has no version declared
        if (flowVersion === null) {
            result.warnings.push({
                type: 'MISSING_VERSION',
                message: 'Flow does not declare an API version',
                suggestion: `Add <apiVersion>${VERSION_INFO.RECOMMENDED}</apiVersion> to flow metadata`
            });
            result.upgradeRecommended = true;
            return result;
        }

        // Check if flow version is below minimum
        if (flowVersion < VERSION_INFO.MINIMUM_SUPPORTED) {
            result.outdated = true;
            result.upgradeRequired = true;
            result.warnings.push({
                type: 'VERSION_TOO_OLD',
                message: `Flow version ${flowVersion} is below minimum supported (${VERSION_INFO.MINIMUM_SUPPORTED})`,
                suggestion: `Upgrade to API version ${VERSION_INFO.RECOMMENDED}`
            });
        }

        // Check if flow is older than org's version
        if (flowVersion < orgVersion) {
            result.outdated = true;
            result.suggestions.push({
                type: 'VERSION_MISMATCH',
                message: `Flow version ${flowVersion} is older than org version ${orgVersion}`,
                suggestion: 'Consider upgrading to take advantage of new features'
            });
        }

        // Check if flow is not on recommended version
        if (flowVersion < VERSION_INFO.RECOMMENDED && !result.upgradeRequired) {
            result.upgradeRecommended = true;
            result.suggestions.push({
                type: 'UPGRADE_AVAILABLE',
                message: `Newer API version ${VERSION_INFO.RECOMMENDED} is available`,
                suggestion: 'Upgrade recommended for latest features and fixes'
            });
        }

        return result;
    }

    /**
     * Check if an element type can be added to a flow with given API version
     * This is the key pre-flight check method
     * @param {string} elementType - Type of element to add
     * @param {number} flowAPIVersion - Current flow API version
     * @returns {Object} Compatibility result
     */
    canAddElement(elementType, flowAPIVersion) {
        const requirement = this.elementRequirements[elementType];

        const result = {
            elementType,
            flowAPIVersion,
            canAdd: true,
            requiresUpgrade: false,
            minimumVersion: null,
            prompt: null,
            details: null
        };

        // Unknown element type - allow by default
        if (!requirement) {
            this._log(`Unknown element type: ${elementType}, allowing by default`);
            return result;
        }

        result.minimumVersion = requirement.minimum_version;
        result.details = requirement;

        // Check version requirement
        if (flowAPIVersion < requirement.minimum_version) {
            result.canAdd = false;
            result.requiresUpgrade = true;
            result.prompt = this.formatUpgradePrompt(
                flowAPIVersion,
                null,
                requirement.minimum_version,
                elementType,
                requirement.description
            );
        }

        return result;
    }

    /**
     * Get the minimum API version required for an element type
     * @param {string} elementType - Element type to check
     * @returns {number|null} Minimum version or null if unknown
     */
    getMinimumVersionForElement(elementType) {
        const requirement = this.elementRequirements[elementType];
        return requirement ? requirement.minimum_version : null;
    }

    /**
     * Get upgrade suggestion for a flow
     * @param {string} flowPath - Path to flow XML file
     * @returns {Promise<Object>} Upgrade suggestion
     */
    async suggestUpgrade(flowPath) {
        const compatibility = await this.checkVersionCompatibility(flowPath);
        const orgVersion = await this.getOrgAPIVersion();

        return {
            flowPath,
            currentVersion: compatibility.flowVersion,
            orgVersion,
            suggestedVersion: VERSION_INFO.RECOMMENDED,
            latestVersion: VERSION_INFO.CURRENT,
            upgradeRecommended: compatibility.upgradeRecommended || compatibility.upgradeRequired,
            upgradeRequired: compatibility.upgradeRequired,
            reasons: [
                ...compatibility.warnings.map(w => w.message),
                ...compatibility.suggestions.map(s => s.message)
            ],
            command: `sf flow upgrade --path "${flowPath}" --target-version ${VERSION_INFO.RECOMMENDED}`
        };
    }

    /**
     * Upgrade a flow's API version
     * @param {string} flowPath - Path to flow XML file
     * @param {number} targetVersion - Target API version
     * @param {Object} options - Upgrade options
     * @returns {Promise<Object>} Upgrade result
     */
    async upgradeFlowVersion(flowPath, targetVersion = VERSION_INFO.RECOMMENDED, options = {}) {
        const dryRun = options.dryRun || false;
        const backup = options.backup !== false;

        // Read current flow
        let flowXML;
        try {
            flowXML = await fs.readFile(flowPath, 'utf8');
        } catch (error) {
            return {
                success: false,
                error: `Could not read flow file: ${error.message}`
            };
        }

        const currentVersion = await this.getFlowAPIVersion(flowXML);

        // Check if upgrade is needed
        if (currentVersion && currentVersion >= targetVersion) {
            return {
                success: true,
                upgraded: false,
                message: `Flow already at version ${currentVersion} (target: ${targetVersion})`
            };
        }

        // Create backup if requested
        if (backup && !dryRun) {
            const backupPath = `${flowPath}.backup-v${currentVersion || 'unknown'}`;
            try {
                await fs.writeFile(backupPath, flowXML);
                this._log(`Created backup at ${backupPath}`);
            } catch (error) {
                this._log(`Warning: Could not create backup: ${error.message}`);
            }
        }

        // Update API version in XML
        let updatedXML;
        if (currentVersion) {
            // Replace existing version
            updatedXML = flowXML.replace(
                /<apiVersion>\d+\.?\d*<\/apiVersion>/,
                `<apiVersion>${targetVersion}</apiVersion>`
            );
        } else {
            // Add version after <?xml ...?> declaration or at start of <Flow>
            const flowTagMatch = flowXML.match(/<Flow\s+[^>]*>/);
            if (flowTagMatch) {
                const insertPoint = flowTagMatch.index + flowTagMatch[0].length;
                updatedXML =
                    flowXML.slice(0, insertPoint) +
                    `\n    <apiVersion>${targetVersion}</apiVersion>` +
                    flowXML.slice(insertPoint);
            } else {
                return {
                    success: false,
                    error: 'Could not find <Flow> tag to insert API version'
                };
            }
        }

        // Write updated flow (unless dry run)
        if (!dryRun) {
            try {
                await fs.writeFile(flowPath, updatedXML);
            } catch (error) {
                return {
                    success: false,
                    error: `Could not write updated flow: ${error.message}`
                };
            }
        }

        return {
            success: true,
            upgraded: true,
            dryRun,
            previousVersion: currentVersion,
            newVersion: targetVersion,
            flowPath,
            message: dryRun
                ? `Would upgrade from v${currentVersion || 'none'} to v${targetVersion}`
                : `Upgraded from v${currentVersion || 'none'} to v${targetVersion}`
        };
    }

    /**
     * Format a user-friendly upgrade prompt
     * @param {number} flowVersion - Current flow API version
     * @param {number|null} orgVersion - Org API version (optional)
     * @param {number} requiredVersion - Required API version
     * @param {string} elementType - Element type being added (optional)
     * @param {string} elementDescription - Element description (optional)
     * @returns {string} Formatted prompt message
     */
    formatUpgradePrompt(flowVersion, orgVersion, requiredVersion, elementType = null, elementDescription = null) {
        const lines = [
            '┌────────────────────────────────────────────────────┐',
            '│  API VERSION UPGRADE REQUIRED                      │',
            '├────────────────────────────────────────────────────┤'
        ];

        lines.push(`│  Flow Version: ${flowVersion || 'Not declared'}`.padEnd(53) + '│');

        if (orgVersion) {
            lines.push(`│  Org Version:  ${orgVersion}`.padEnd(53) + '│');
        }

        lines.push(`│  Required:     ${requiredVersion}+`.padEnd(53) + '│');

        if (elementType) {
            lines.push('│'.padEnd(53) + '│');
            lines.push(`│  Element: ${elementType}`.padEnd(53) + '│');
            if (elementDescription) {
                lines.push(`│  (${elementDescription})`.padEnd(53) + '│');
            }
        }

        lines.push('├────────────────────────────────────────────────────┤');
        lines.push('│  Options:                                          │');
        lines.push('│  1. Upgrade flow to v' + requiredVersion.toString().padEnd(29) + '│');
        lines.push('│  2. Cancel operation                               │');
        lines.push('│  3. View version requirements                      │');
        lines.push('└────────────────────────────────────────────────────┘');

        return lines.join('\n');
    }

    /**
     * Get all element type version requirements
     * @returns {Object} Element requirements map
     */
    getElementRequirements() {
        return { ...this.elementRequirements };
    }

    /**
     * Get version information
     * @returns {Object} Version info
     */
    static get VERSION_INFO() {
        return VERSION_INFO;
    }

    /**
     * Detect element type from instruction text
     * Used for pre-flight checks when parsing NL instructions
     * @param {string} instruction - Natural language instruction
     * @returns {string|null} Detected element type or null
     */
    detectElementTypeFromInstruction(instruction) {
        const lower = instruction.toLowerCase();

        // Subflow patterns
        if (lower.includes('call flow') || lower.includes('invoke flow') ||
            lower.includes('subflow') || lower.includes('sub-flow')) {
            return 'subflows';
        }

        // Decision patterns
        if (lower.includes('decision') || lower.includes('if ') ||
            lower.includes('branch') || lower.includes('condition')) {
            return 'decisions';
        }

        // Loop patterns
        if (lower.includes('loop') || lower.includes('for each') ||
            lower.includes('iterate')) {
            return 'loops';
        }

        // Record operations
        if (lower.includes('create record') || lower.includes('insert ')) {
            return 'recordCreates';
        }
        if (lower.includes('update record') || lower.includes('update ')) {
            return 'recordUpdates';
        }
        if (lower.includes('delete record') || lower.includes('delete ')) {
            return 'recordDeletes';
        }
        if (lower.includes('get record') || lower.includes('query ') ||
            lower.includes('lookup')) {
            return 'recordLookups';
        }

        // Assignment patterns
        if (lower.includes('assignment') || lower.includes('set ') ||
            lower.includes('assign ')) {
            return 'assignments';
        }

        // Screen patterns
        if (lower.includes('screen') || lower.includes('form') ||
            lower.includes('input')) {
            return 'screens';
        }

        // Action patterns
        if (lower.includes('action') || lower.includes('email') ||
            lower.includes('chatter') || lower.includes('post')) {
            return 'actionCalls';
        }

        // Wait/pause patterns
        if (lower.includes('wait') || lower.includes('pause') ||
            lower.includes('schedule')) {
            return 'waits';
        }

        // Collection processing
        if (lower.includes('filter collection') || lower.includes('sort collection')) {
            return 'collectionProcessors';
        }

        // Custom error
        if (lower.includes('error') || lower.includes('fault')) {
            return 'customErrors';
        }

        return null;
    }

    /**
     * Pre-flight check for adding element via instruction
     * Combines instruction parsing with version checking
     * @param {string} instruction - Natural language instruction
     * @param {number} flowAPIVersion - Current flow API version
     * @returns {Object} Pre-flight check result
     */
    preflightCheck(instruction, flowAPIVersion) {
        const elementType = this.detectElementTypeFromInstruction(instruction);

        if (!elementType) {
            return {
                passed: true,
                elementType: null,
                message: 'Could not detect specific element type, proceeding'
            };
        }

        const canAdd = this.canAddElement(elementType, flowAPIVersion);

        return {
            passed: canAdd.canAdd,
            elementType,
            requiresUpgrade: canAdd.requiresUpgrade,
            minimumVersion: canAdd.minimumVersion,
            prompt: canAdd.prompt,
            instruction
        };
    }
}

module.exports = FlowAPIVersionGuard;
