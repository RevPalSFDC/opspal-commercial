#!/usr/bin/env node

/**
 * Instance Alias Resolver
 *
 * Intelligently resolves user input ("peregrine production") to the correct
 * Salesforce org alias (peregrine-main vs peregrine-production).
 *
 * Features:
 * - Fuzzy matching with confidence scoring
 * - Context-aware (production/sandbox/uat patterns)
 * - Disambiguation prompts when ambiguous
 * - Learning from user corrections
 *
 * Usage:
 *   const { resolveOrgAlias } = require('./lib/instance-alias-resolver');
 *
 *   const result = await resolveOrgAlias('peregrine production');
 *   if (result.confidence >= 80) {
 *       console.log(`Using: ${result.orgAlias}`);
 *   } else {
 *       // Present options to user
 *       result.matches.forEach((m, i) => {
 *           console.log(`${i+1}) ${m.orgAlias} (${m.description})`);
 *       });
 *   }
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { InstanceConfig } = require('./instance-config-registry');

class InstanceAliasResolver {
    constructor(options = {}) {
        this.options = {
            verbose: options.verbose || false,
            interactive: options.interactive !== false,
            confidenceThreshold: options.confidenceThreshold || 80,
            ...options
        };

        this.instances = [];
        this.corrections = []; // Track user corrections for learning
    }

    /**
     * Load all instance configurations
     */
    async loadInstances() {
        const instancesDir = path.join(__dirname, '../../instances');

        if (!fs.existsSync(instancesDir)) {
            return;
        }

        const dirs = fs.readdirSync(instancesDir, { withFileTypes: true });

        for (const dir of dirs) {
            if (!dir.isDirectory()) continue;

            const configPath = path.join(instancesDir, dir.name, 'config.json');

            if (fs.existsSync(configPath)) {
                try {
                    const config = new InstanceConfig(dir.name, { verbose: false });
                    await config.init();

                    this.instances.push({
                        orgAlias: dir.name,
                        config: config.config
                    });
                } catch (error) {
                    if (this.options.verbose) {
                        console.warn(`⚠️  Could not load config for ${dir.name}: ${error.message}`);
                    }
                }
            } else {
                // Instance directory exists but no config - create minimal entry
                this.instances.push({
                    orgAlias: dir.name,
                    config: {
                        orgAlias: dir.name,
                        knownAliases: [],
                        environmentType: 'unknown',
                        businessName: '',
                        lastAccessed: null,
                        accessCount: 0
                    }
                });
            }
        }

        if (this.options.verbose) {
            console.log(`✓ Loaded ${this.instances.length} instance configurations`);
        }
    }

    /**
     * Parse user input to extract org name and context
     * Examples:
     *   "peregrine production" → {org: "peregrine", context: "production"}
     *   "rentable sandbox" → {org: "rentable", context: "sandbox"}
     *   "wedgewood" → {org: "wedgewood", context: null}
     */
    parseUserInput(input) {
        const normalized = input.toLowerCase().trim();

        // Known environment keywords
        const envKeywords = ['production', 'prod', 'sandbox', 'uat', 'dev', 'legacy', 'main'];

        // Extract environment context
        let context = null;
        let orgName = normalized;

        for (const keyword of envKeywords) {
            if (normalized.includes(keyword)) {
                context = keyword;
                // Remove context from org name
                orgName = normalized.replace(keyword, '').trim();
                break;
            }
        }

        return { orgName, context, original: input };
    }

    /**
     * Score a match between user input and an instance
     */
    scoreMatch(userInput, instance) {
        const { orgName, context } = this.parseUserInput(userInput);
        const config = instance.config;

        let score = 0;
        const reasons = [];

        // 1. Exact org alias match (highest score)
        if (instance.orgAlias.toLowerCase() === userInput.toLowerCase()) {
            score += 100;
            reasons.push('exact alias match');
            return { score, reasons }; // Perfect match, return immediately
        }

        // 2. Known alias exact match
        if (config.knownAliases && Array.isArray(config.knownAliases)) {
            const normalizedAliases = config.knownAliases.map(a => a.toLowerCase());
            if (normalizedAliases.includes(userInput.toLowerCase())) {
                score += 90;
                reasons.push('known alias exact match');
                return { score, reasons }; // Very strong match
            }
        }

        // 3. Org name similarity
        if (instance.orgAlias.toLowerCase().includes(orgName)) {
            score += 50;
            reasons.push('org name match');
        } else if (orgName && orgName.length > 2) {
            // Partial match
            const similarity = this.stringSimilarity(orgName, instance.orgAlias.toLowerCase());
            if (similarity > 0.6) {
                score += Math.floor(similarity * 40);
                reasons.push(`partial org name match (${Math.floor(similarity * 100)}%)`);
            }
        }

        // 4. Environment type match
        if (context && config.environmentType) {
            if (this.matchesEnvironment(context, config.environmentType)) {
                score += 30;
                reasons.push('environment type match');
            } else if (config.environmentType !== 'unknown') {
                // Penalize if explicitly wrong environment
                score -= 20;
                reasons.push('environment type mismatch');
            }
        }

        // 5. Recent access bonus
        if (config.lastAccessed) {
            const daysSinceAccess = this.daysSince(config.lastAccessed);
            if (daysSinceAccess < 7) {
                score += 20;
                reasons.push('recently accessed');
            } else if (daysSinceAccess < 30) {
                score += 10;
                reasons.push('accessed this month');
            }
        }

        // 6. Access frequency bonus
        if (config.accessCount && config.accessCount > 10) {
            score += 10;
            reasons.push('frequently used');
        }

        return { score, reasons };
    }

    /**
     * Check if context matches environment type
     */
    matchesEnvironment(context, envType) {
        const contextMap = {
            'production': ['production', 'prod', 'main'],
            'sandbox': ['sandbox', 'uat', 'dev'],
            'uat': ['uat', 'sandbox'],
            'dev': ['dev', 'sandbox'],
            'legacy': ['legacy'],
            'main': ['production', 'main', 'prod']
        };

        const validMatches = contextMap[envType] || [envType];
        return validMatches.includes(context);
    }

    /**
     * Calculate string similarity (Jaro-Winkler distance)
     */
    stringSimilarity(s1, s2) {
        const longer = s1.length > s2.length ? s1 : s2;
        const shorter = s1.length > s2.length ? s2 : s1;

        if (longer.length === 0) return 1.0;

        const editDistance = this.levenshteinDistance(longer, shorter);
        return (longer.length - editDistance) / longer.length;
    }

    /**
     * Levenshtein distance calculation
     */
    levenshteinDistance(s1, s2) {
        const costs = [];
        for (let i = 0; i <= s1.length; i++) {
            let lastValue = i;
            for (let j = 0; j <= s2.length; j++) {
                if (i === 0) {
                    costs[j] = j;
                } else if (j > 0) {
                    let newValue = costs[j - 1];
                    if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
                        newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                    }
                    costs[j - 1] = lastValue;
                    lastValue = newValue;
                }
            }
            if (i > 0) costs[s2.length] = lastValue;
        }
        return costs[s2.length];
    }

    /**
     * Calculate days since a date
     */
    daysSince(dateString) {
        if (!dateString) return Infinity;
        const date = new Date(dateString);
        const now = new Date();
        return Math.floor((now - date) / (1000 * 60 * 60 * 24));
    }

    /**
     * Resolve user input to org alias
     */
    async resolve(userInput, options = {}) {
        await this.loadInstances();

        if (this.instances.length === 0) {
            return {
                success: false,
                error: 'No instances found. Create at least one instance configuration.',
                matches: []
            };
        }

        // Score all instances
        const scored = this.instances.map(instance => {
            const { score, reasons } = this.scoreMatch(userInput, instance);
            return {
                orgAlias: instance.orgAlias,
                score,
                reasons,
                config: instance.config,
                environmentType: instance.config.environmentType || 'unknown',
                businessName: instance.config.businessName || '',
                lastAccessed: instance.config.lastAccessed,
                accessCount: instance.config.accessCount || 0
            };
        });

        // Sort by score descending
        scored.sort((a, b) => b.score - a.score);

        // Filter to only viable matches (score > 0)
        const matches = scored.filter(m => m.score > 0);

        if (matches.length === 0) {
            return {
                success: false,
                error: `No matches found for "${userInput}"`,
                matches: scored.slice(0, 5) // Show top 5 even if score is 0
            };
        }

        const topMatch = matches[0];
        const confidence = topMatch.score;

        // High confidence - auto-select
        if (confidence >= this.options.confidenceThreshold) {
            // Record access
            await this.recordAccess(topMatch.orgAlias);

            return {
                success: true,
                orgAlias: topMatch.orgAlias,
                confidence,
                autoSelected: true,
                match: topMatch,
                matches
            };
        }

        // Medium confidence - interactive disambiguation if enabled
        if (this.options.interactive && matches.length > 1) {
            const selected = await this.disambiguate(userInput, matches);
            if (selected) {
                // Learn from this correction
                await this.learnCorrection(userInput, selected.orgAlias);
                await this.recordAccess(selected.orgAlias);

                return {
                    success: true,
                    orgAlias: selected.orgAlias,
                    confidence: selected.score,
                    autoSelected: false,
                    userSelected: true,
                    match: selected,
                    matches
                };
            }
        }

        // Low confidence - return matches for caller to handle
        return {
            success: false,
            confidence,
            needsDisambiguation: true,
            matches
        };
    }

    /**
     * Interactive disambiguation prompt
     */
    async disambiguate(userInput, matches) {
        console.log(`\n🔍 Multiple matches found for "${userInput}":\n`);

        matches.slice(0, 5).forEach((match, index) => {
            const lastUsed = match.lastAccessed
                ? `last used: ${this.formatDate(match.lastAccessed)}`
                : 'never used';

            const description = match.businessName || match.environmentType || 'no description';

            console.log(`  ${index + 1}) ${match.orgAlias}`);
            console.log(`     ${description} | ${lastUsed} | confidence: ${match.score}%`);
            console.log('');
        });

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        return new Promise((resolve) => {
            rl.question('Select option (1-5, or 0 to cancel): ', (answer) => {
                rl.close();

                const selection = parseInt(answer);
                if (selection > 0 && selection <= matches.length) {
                    resolve(matches[selection - 1]);
                } else {
                    resolve(null);
                }
            });
        });
    }

    /**
     * Learn from user correction
     */
    async learnCorrection(userInput, selectedOrg) {
        const config = new InstanceConfig(selectedOrg, { verbose: false });
        await config.init();

        // Add user input as a known alias
        config.addAlias(userInput);

        if (this.options.verbose) {
            console.log(`✓ Learned: "${userInput}" → ${selectedOrg}`);
        }
    }

    /**
     * Record access to instance
     */
    async recordAccess(orgAlias) {
        const config = new InstanceConfig(orgAlias, { verbose: false });
        await config.init();
        config.recordAccess();
    }

    /**
     * Format date for display
     */
    formatDate(dateString) {
        if (!dateString) return 'never';

        const date = new Date(dateString);
        const days = this.daysSince(dateString);

        if (days === 0) return 'today';
        if (days === 1) return 'yesterday';
        if (days < 7) return `${days} days ago`;
        if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
        if (days < 365) return `${Math.floor(days / 30)} months ago`;
        return `${Math.floor(days / 365)} years ago`;
    }
}

/**
 * Quick resolve function
 */
async function resolveOrgAlias(userInput, options = {}) {
    const resolver = new InstanceAliasResolver(options);
    return await resolver.resolve(userInput, options);
}

module.exports = {
    InstanceAliasResolver,
    resolveOrgAlias
};

// CLI usage
if (require.main === module) {
    (async () => {
        const args = process.argv.slice(2);

        if (args.length === 0) {
            console.log('Usage: instance-alias-resolver.js <org-name-or-alias> [options]');
            console.log('');
            console.log('Options:');
            console.log('  --no-interactive      Disable interactive disambiguation');
            console.log('  --confidence N        Set confidence threshold (default: 80)');
            console.log('  --verbose             Show detailed matching info');
            console.log('');
            console.log('Examples:');
            console.log('  instance-alias-resolver.js "peregrine production"');
            console.log('  instance-alias-resolver.js "rentable" --no-interactive');
            console.log('  instance-alias-resolver.js "wedgewood sandbox" --verbose');
            process.exit(1);
        }

        const userInput = args[0];
        const options = {
            interactive: !args.includes('--no-interactive'),
            verbose: args.includes('--verbose'),
            confidenceThreshold: 80
        };

        // Parse --confidence flag
        const confIndex = args.indexOf('--confidence');
        if (confIndex !== -1 && args[confIndex + 1]) {
            options.confidenceThreshold = parseInt(args[confIndex + 1]);
        }

        const result = await resolveOrgAlias(userInput, options);

        if (result.success) {
            console.log(`\n✅ Resolved to: ${result.orgAlias}`);
            console.log(`   Confidence: ${result.confidence}%`);
            if (result.autoSelected) {
                console.log(`   Auto-selected (high confidence)`);
            }
        } else {
            console.error(`\n❌ ${result.error || 'Could not resolve org alias'}`);
            if (result.matches && result.matches.length > 0) {
                console.log('\nTop matches:');
                result.matches.slice(0, 3).forEach((m, i) => {
                    console.log(`  ${i + 1}. ${m.orgAlias} (confidence: ${m.score}%)`);
                });
            }
            process.exit(1);
        }
    })();
}
