/**
 * Variation Resolver
 *
 * Core logic for resolving and applying template variations based on org
 * characteristics, user preferences, and auto-detection.
 *
 * Resolution Order:
 * 1. Explicit variation (user-specified)
 * 2. Org profile (stored preferences)
 * 3. Auto-detection (CPQ, company size, GTM model)
 *
 * Usage:
 *   const VariationResolver = require('./variation-resolver');
 *   const resolver = new VariationResolver('my-org');
 *   await resolver.initialize();
 *   const variation = await resolver.resolveVariation('revenue-performance');
 *   const adaptedTemplate = resolver.applyVariation(template, variation);
 */

const fs = require('fs');
const path = require('path');
const CPQDetector = require('./cpq-detector');

// Live-first mode - always revalidate org profile against live data
// Set VARIATION_LIVE_FIRST=false to use cache-first behavior (not recommended)
const LIVE_FIRST = process.env.GLOBAL_LIVE_FIRST !== 'false' &&
                   process.env.VARIATION_LIVE_FIRST !== 'false';

class VariationResolver {
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.options = options;
        this.cpqDetector = new CPQDetector(orgAlias, options);
        this.orgProfile = null;
        this.orgProfileTimestamp = null;
        this.initialized = false;
        this.liveFirst = options.liveFirst !== undefined ? options.liveFirst : LIVE_FIRST;

        // Paths
        this.pluginRoot = options.pluginRoot || path.resolve(__dirname, '../..');
        this.orgProfilePath = options.orgProfilePath || this.getOrgProfilePath();
        this.variationSchemaPath = options.schemaPath ||
            path.join(this.pluginRoot, 'config/variation-schema.json');
    }

    /**
     * Get the org profile path based on context
     */
    getOrgProfilePath() {
        // Try multiple locations for org profile
        const locations = [
            path.join(process.cwd(), `instances/${this.orgAlias}/org-variation-profile.json`),
            path.join(process.cwd(), `orgs/${this.orgAlias}/platforms/salesforce/variation-profile.json`),
            path.join(this.pluginRoot, `config/org-profiles/${this.orgAlias}.json`)
        ];

        for (const loc of locations) {
            if (fs.existsSync(loc)) {
                return loc;
            }
        }

        // Return default location for new profiles
        return path.join(this.pluginRoot, `config/org-profiles/${this.orgAlias}.json`);
    }

    /**
     * Initialize resolver with CPQ detection and org profile loading
     * In live-first mode, always runs fresh CPQ detection
     */
    async initialize() {
        // In live-first mode, always refresh (reset initialized flag)
        if (this.liveFirst) {
            this.initialized = false;
        }

        if (this.initialized) return this;

        // Run CPQ detection (always queries live in live-first mode)
        await this.cpqDetector.detect();

        // Load org profile if exists (local file, but validated against live CPQ)
        this.orgProfile = this.loadOrgProfile();
        this.orgProfileTimestamp = Date.now();

        // In live-first mode, validate profile against live CPQ status
        if (this.liveFirst && this.orgProfile) {
            const cpqResult = this.cpqDetector.cache;
            if (cpqResult && this.orgProfile.lastKnownCpqStatus !== cpqResult.quotingSystem) {
                console.warn(`[VariationResolver] Profile CPQ status (${this.orgProfile.lastKnownCpqStatus}) differs from live (${cpqResult.quotingSystem})`);
                // Update profile with current CPQ status
                this.orgProfile.lastKnownCpqStatus = cpqResult.quotingSystem;
                this.orgProfile.lastValidated = new Date().toISOString();
            }
        }

        this.initialized = true;
        return this;
    }

    /**
     * Load org variation profile from disk
     */
    loadOrgProfile() {
        try {
            if (fs.existsSync(this.orgProfilePath)) {
                const content = fs.readFileSync(this.orgProfilePath, 'utf8');
                return JSON.parse(content);
            }
        } catch (error) {
            console.warn(`[VariationResolver] Could not load org profile: ${error.message}`);
        }
        return null;
    }

    /**
     * Save org variation profile to disk
     */
    saveOrgProfile(profile) {
        try {
            const dir = path.dirname(this.orgProfilePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.orgProfilePath, JSON.stringify(profile, null, 2));
            this.orgProfile = profile;
            return true;
        } catch (error) {
            console.error(`[VariationResolver] Could not save org profile: ${error.message}`);
            return false;
        }
    }

    /**
     * Main resolution method - determines which variation to use
     *
     * @param {string} templateId - Template identifier
     * @param {Object} options - Resolution options
     * @param {string} options.variation - Explicit variation to use
     * @param {boolean} options.autoDetect - Enable auto-detection (default: true)
     * @returns {Object} Resolved variation info
     */
    async resolveVariation(templateId, options = {}) {
        if (!this.initialized) {
            await this.initialize();
        }

        const result = {
            templateId,
            resolvedVariation: null,
            resolutionMethod: null,
            cpqStatus: null,
            confidence: 1.0,
            alternativeVariations: [],
            metadata: {}
        };

        // Priority 1: Explicit variation
        if (options.variation) {
            result.resolvedVariation = options.variation;
            result.resolutionMethod = 'explicit';
            result.confidence = 1.0;
            return result;
        }

        // Priority 2: Org profile default
        if (this.orgProfile?.defaultVariation) {
            result.resolvedVariation = this.orgProfile.defaultVariation;
            result.resolutionMethod = 'org-profile';
            result.confidence = 0.95;
            result.metadata.profileSource = this.orgProfilePath;
            return result;
        }

        // Priority 3: Template-specific org profile
        if (this.orgProfile?.templateVariations?.[templateId]) {
            result.resolvedVariation = this.orgProfile.templateVariations[templateId];
            result.resolutionMethod = 'org-profile-template';
            result.confidence = 0.95;
            return result;
        }

        // Priority 4: Auto-detection
        if (options.autoDetect !== false) {
            const detected = await this.autoDetectVariation();
            result.resolvedVariation = detected.variation;
            result.resolutionMethod = 'auto-detect';
            result.confidence = detected.confidence;
            result.cpqStatus = detected.cpqStatus;
            result.metadata.detection = detected;
            result.alternativeVariations = detected.alternatives || [];
            return result;
        }

        // Fallback: standard
        result.resolvedVariation = 'standard';
        result.resolutionMethod = 'fallback';
        result.confidence = 0.5;
        return result;
    }

    /**
     * Auto-detect the best variation based on org characteristics
     */
    async autoDetectVariation() {
        const cpqResult = this.cpqDetector.cache || await this.cpqDetector.detect();

        const result = {
            variation: 'standard',
            confidence: 0.7,
            cpqStatus: cpqResult.quotingSystem,
            alternatives: [],
            factors: []
        };

        // Factor 1: CPQ Detection
        if (cpqResult.quotingSystem === 'cpq') {
            result.variation = 'cpq';
            result.confidence = 0.9;
            result.factors.push({
                factor: 'quoting-system',
                value: 'cpq',
                weight: 0.4,
                detail: cpqResult.version ? `CPQ v${cpqResult.version}` : 'CPQ detected'
            });
            result.alternatives.push('standard', 'advanced');
        } else if (cpqResult.quotingSystem === 'hybrid') {
            result.variation = 'hybrid';
            result.confidence = 0.85;
            result.factors.push({
                factor: 'quoting-system',
                value: 'hybrid',
                weight: 0.3,
                detail: 'Both CPQ and native quote objects found'
            });
            result.alternatives.push('cpq', 'native');
        } else {
            result.variation = 'native';
            result.confidence = 0.8;
            result.factors.push({
                factor: 'quoting-system',
                value: 'native',
                weight: 0.3,
                detail: 'Standard Salesforce Quote'
            });
            result.alternatives.push('simple', 'standard');
        }

        // Factor 2: Org complexity (could be enhanced with more signals)
        if (this.orgProfile?.complexity) {
            result.factors.push({
                factor: 'org-complexity',
                value: this.orgProfile.complexity,
                weight: 0.2
            });

            // Adjust variation based on complexity
            if (this.orgProfile.complexity === 'simple' && result.variation !== 'cpq') {
                result.variation = 'simple';
                result.confidence *= 0.95;
            }
        }

        return result;
    }

    /**
     * Apply variation overlay to a template
     *
     * @param {Object} template - Base template
     * @param {string|Object} variation - Variation name or resolved variation object
     * @returns {Object} Template with variation overlay applied
     */
    applyVariation(template, variation) {
        // Handle variation object or string
        const variationName = typeof variation === 'object' ?
            variation.resolvedVariation : variation;

        // If template has no variations, return as-is
        if (!template.variations?.variationOverrides) {
            return template;
        }

        // If no matching variation override, return as-is
        const overlay = template.variations.variationOverrides[variationName];
        if (!overlay) {
            return template;
        }

        // Deep clone template to avoid mutation
        const adapted = JSON.parse(JSON.stringify(template));

        // Apply field substitutions
        if (overlay.fieldSubstitutions) {
            adapted._fieldSubstitutions = overlay.fieldSubstitutions;
            this.applyFieldSubstitutions(adapted, overlay.fieldSubstitutions);
        }

        // Apply component overrides
        if (overlay.componentOverrides && adapted.dashboardLayout?.components) {
            adapted.dashboardLayout.components = this.applyComponentOverrides(
                adapted.dashboardLayout.components,
                overlay.componentOverrides
            );
        }

        // Apply filter overrides
        if (overlay.filterOverrides && adapted.dashboardFilters) {
            this.applyFilterOverrides(adapted.dashboardFilters, overlay.filterOverrides);
        }

        // Apply metric adjustments
        if (overlay.metricAdjustments) {
            this.applyMetricAdjustments(adapted, overlay.metricAdjustments);
        }

        // Apply orgAdaptation overrides
        if (overlay.orgAdaptationOverrides && adapted.orgAdaptation) {
            Object.assign(adapted.orgAdaptation, overlay.orgAdaptationOverrides);
        }

        // Mark the template as variation-adapted
        adapted._variationApplied = {
            variation: variationName,
            timestamp: new Date().toISOString()
        };

        return adapted;
    }

    /**
     * Apply field substitutions throughout template
     */
    applyFieldSubstitutions(template, substitutions) {
        const substituteInString = (str) => {
            if (typeof str !== 'string') return str;
            let result = str;
            for (const [from, to] of Object.entries(substitutions)) {
                // Use word boundary to avoid double substitution (e.g., Amount in SBQQ__NetAmount__c)
                // Also escape special regex characters in the 'from' value
                const escapedFrom = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                result = result.replace(new RegExp(`\\b${escapedFrom}\\b`, 'g'), to);
            }
            return result;
        };

        const substituteInObject = (obj) => {
            if (!obj || typeof obj !== 'object') return;

            if (Array.isArray(obj)) {
                obj.forEach((item, index) => {
                    if (typeof item === 'string') {
                        obj[index] = substituteInString(item);
                    } else if (typeof item === 'object') {
                        substituteInObject(item);
                    }
                });
            } else {
                for (const key of Object.keys(obj)) {
                    if (typeof obj[key] === 'string') {
                        obj[key] = substituteInString(obj[key]);
                    } else if (typeof obj[key] === 'object') {
                        substituteInObject(obj[key]);
                    }
                }
            }
        };

        substituteInObject(template);
    }

    /**
     * Apply component overrides to dashboard components
     */
    applyComponentOverrides(components, overrides) {
        let result = [...components];

        // Include filter (whitelist)
        if (overrides.include && overrides.include.length > 0) {
            result = result.filter(c =>
                overrides.include.includes(c.title) ||
                overrides.include.includes(String(c.position))
            );
        }

        // Exclude filter (blacklist)
        if (overrides.exclude && overrides.exclude.length > 0) {
            result = result.filter(c =>
                !overrides.exclude.includes(c.title) &&
                !overrides.exclude.includes(String(c.position))
            );
        }

        // Max components limit
        if (overrides.maxComponents && result.length > overrides.maxComponents) {
            result = result.slice(0, overrides.maxComponents);
        }

        return result;
    }

    /**
     * Apply filter overrides
     */
    applyFilterOverrides(filters, overrides) {
        for (const override of overrides) {
            const filter = filters.find(f => f.field === override.field);
            if (filter) {
                if (override.default !== undefined) filter.default = override.default;
                if (override.values !== undefined) filter.values = override.values;
            }
        }
    }

    /**
     * Apply metric adjustments
     */
    applyMetricAdjustments(template, adjustments) {
        // Apply to kpiDefinitions if present
        if (template.kpiDefinitions) {
            for (const [metricName, adjustment] of Object.entries(adjustments)) {
                if (template.kpiDefinitions[metricName]) {
                    Object.assign(template.kpiDefinitions[metricName], adjustment);
                }
            }
        }

        // Apply to dashboard components if they reference metrics
        if (template.dashboardLayout?.components) {
            for (const component of template.dashboardLayout.components) {
                if (component.metric && adjustments[component.metric]) {
                    const adj = adjustments[component.metric];
                    if (adj.target) component.target = adj.target;
                    if (adj.thresholds) {
                        if (adj.thresholds.green) component.greenZone = adj.thresholds.green;
                        if (adj.thresholds.yellow) component.yellowZone = adj.thresholds.yellow;
                        if (adj.thresholds.red) component.redZone = adj.thresholds.red;
                    }
                }
            }
        }
    }

    /**
     * Get available variations for a template
     *
     * @param {Object} template - Template to check
     * @returns {string[]} List of available variation names
     */
    getAvailableVariations(template) {
        if (!template.variations?.availableVariations) {
            return ['standard']; // Default if no variations defined
        }
        return template.variations.availableVariations;
    }

    /**
     * Validate that a variation is available for a template
     *
     * @param {Object} template - Template to check
     * @param {string} variation - Variation name
     * @returns {boolean} Whether variation is valid
     */
    isValidVariation(template, variation) {
        const available = this.getAvailableVariations(template);
        return available.includes(variation);
    }

    /**
     * Get CPQ-aware field fallbacks for a template field
     *
     * @param {string} templateField - Field name from template
     * @param {Object} template - Full template with orgAdaptation
     * @returns {string[]} Array of field API names to try
     */
    getCpqAwareFieldFallbacks(templateField, template) {
        const result = [];
        const cpqStatus = this.cpqDetector.cache?.quotingSystem || 'native';
        const fieldConfig = template.orgAdaptation?.fieldFallbacks?.[templateField];

        if (!fieldConfig) {
            return [templateField]; // No fallback config, return as-is
        }

        // If CPQ detected, prioritize CPQ patterns
        if (cpqStatus === 'cpq' || cpqStatus === 'hybrid') {
            if (fieldConfig.cpqPatterns) {
                result.push(...fieldConfig.cpqPatterns);
            }
            if (fieldConfig.fallbackChain) {
                const cpqFallbacks = fieldConfig.fallbackChain
                    .filter(f => f.namespace === 'SBQQ')
                    .map(f => f.field);
                result.push(...cpqFallbacks);
            }
        }

        // Add standard patterns
        if (fieldConfig.patterns) {
            result.push(...fieldConfig.patterns);
        }

        // Add non-CPQ fallback chain
        if (fieldConfig.fallbackChain) {
            const nativeFallbacks = fieldConfig.fallbackChain
                .filter(f => !f.namespace || f.namespace !== 'SBQQ')
                .map(f => f.field);
            result.push(...nativeFallbacks);
        }

        // Deduplicate
        return [...new Set(result)];
    }

    /**
     * Create a default org profile
     */
    createDefaultProfile() {
        return {
            orgAlias: this.orgAlias,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            defaultVariation: null,
            complexity: null,
            companySize: null,
            gtmModel: null,
            templateVariations: {},
            preferences: {
                autoDetect: true,
                confirmVariation: false
            }
        };
    }

    /**
     * Get summary for debugging/logging
     */
    getSummary() {
        const cpqSummary = this.cpqDetector.getSummary();
        const profileStatus = this.orgProfile ? 'loaded' : 'not found';
        const defaultVar = this.orgProfile?.defaultVariation || 'auto-detect';

        return `Org: ${this.orgAlias} | Profile: ${profileStatus} | Default: ${defaultVar} | ${cpqSummary}`;
    }
}

module.exports = VariationResolver;

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0 || args[0] === '--help') {
        console.log(`
Variation Resolver - Resolve and apply template variations

Usage:
  node variation-resolver.js <org-alias> [options]

Options:
  --resolve <template-id>   Resolve variation for a template
  --variation <name>        Explicit variation to use
  --detect                  Show auto-detection results
  --profile                 Show/create org profile
  --json                    Output as JSON

Examples:
  node variation-resolver.js my-org --detect
  node variation-resolver.js my-org --resolve revenue-performance
  node variation-resolver.js my-org --resolve pipeline-health --variation cpq
        `);
        process.exit(0);
    }

    const orgAlias = args[0];
    const isJson = args.includes('--json');
    const templateId = args.includes('--resolve') ?
        args[args.indexOf('--resolve') + 1] : null;
    const explicitVariation = args.includes('--variation') ?
        args[args.indexOf('--variation') + 1] : null;
    const showDetection = args.includes('--detect');
    const showProfile = args.includes('--profile');

    (async () => {
        console.log(`\n🎯 Variation Resolver for org: ${orgAlias}\n`);

        const resolver = new VariationResolver(orgAlias);
        await resolver.initialize();

        if (showDetection) {
            const detection = await resolver.autoDetectVariation();
            if (isJson) {
                console.log(JSON.stringify(detection, null, 2));
            } else {
                console.log('Auto-Detection Results:');
                console.log('─'.repeat(50));
                console.log(`  Recommended:   ${detection.variation.toUpperCase()}`);
                console.log(`  Confidence:    ${(detection.confidence * 100).toFixed(0)}%`);
                console.log(`  CPQ Status:    ${detection.cpqStatus}`);
                console.log(`  Alternatives:  ${detection.alternatives.join(', ')}`);
                console.log('\n  Factors:');
                detection.factors.forEach(f => {
                    console.log(`    - ${f.factor}: ${f.value} (weight: ${f.weight})`);
                    if (f.detail) console.log(`      ${f.detail}`);
                });
            }
        }

        if (templateId) {
            const result = await resolver.resolveVariation(templateId, {
                variation: explicitVariation
            });

            if (isJson) {
                console.log(JSON.stringify(result, null, 2));
            } else {
                console.log('Variation Resolution:');
                console.log('─'.repeat(50));
                console.log(`  Template:     ${result.templateId}`);
                console.log(`  Variation:    ${result.resolvedVariation.toUpperCase()}`);
                console.log(`  Method:       ${result.resolutionMethod}`);
                console.log(`  Confidence:   ${(result.confidence * 100).toFixed(0)}%`);
                if (result.alternativeVariations.length > 0) {
                    console.log(`  Alternatives: ${result.alternativeVariations.join(', ')}`);
                }
            }
        }

        if (showProfile) {
            const profile = resolver.orgProfile || resolver.createDefaultProfile();
            if (isJson) {
                console.log(JSON.stringify(profile, null, 2));
            } else {
                console.log('Org Profile:');
                console.log('─'.repeat(50));
                console.log(`  Org Alias:         ${profile.orgAlias}`);
                console.log(`  Default Variation: ${profile.defaultVariation || 'auto-detect'}`);
                console.log(`  Complexity:        ${profile.complexity || 'not set'}`);
                console.log(`  Company Size:      ${profile.companySize || 'not set'}`);
                console.log(`  GTM Model:         ${profile.gtmModel || 'not set'}`);
                console.log(`  Auto-Detect:       ${profile.preferences?.autoDetect ? 'enabled' : 'disabled'}`);
            }
        }

        if (!showDetection && !templateId && !showProfile) {
            console.log(resolver.getSummary());
        }

        console.log('\n');
    })();
}
