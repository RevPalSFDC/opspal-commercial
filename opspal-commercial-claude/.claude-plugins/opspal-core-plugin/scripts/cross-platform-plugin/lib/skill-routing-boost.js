#!/usr/bin/env node

/**
 * Skill Routing Boost - ACE Framework Integration for Routing
 *
 * Calculates routing confidence boost based on agent's historical skill performance.
 * Supports category-weighted boost for more accurate task-agent matching.
 *
 * Usage:
 *   node skill-routing-boost.js --agent sfdc-revops-auditor --format json
 *   node skill-routing-boost.js --agent sfdc-revops-auditor --category assessment --format json
 *
 * Output (JSON):
 *   {
 *     "boost": 1.15,
 *     "category_success_rate": 0.92,
 *     "overall_success_rate": 0.87,
 *     "usage_count": 45,
 *     "confidence": 0.88,
 *     "category_match": true,
 *     "skill_count": 12
 *   }
 *
 * @version 1.0.0
 * @date 2025-12-06
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

// Configuration
const CONFIG = {
    // Boost calculation weights
    CATEGORY_WEIGHT: 0.7,      // Weight for category-specific success rate
    OVERALL_WEIGHT: 0.3,       // Weight for overall success rate

    // Boost factors
    EXCELLENT_BOOST: 1.3,      // >= 90% success rate
    GOOD_BOOST: 1.15,          // >= 80% success rate
    NEUTRAL_BOOST: 1.0,        // 60-80% success rate
    PENALTY_BOOST: 0.85,       // < 60% success rate

    // Minimum data requirements
    MIN_USAGE_COUNT: 5,        // Minimum executions to apply boost

    // Cache settings
    CACHE_TTL: parseInt(process.env.ACE_CACHE_TTL) || 300,  // 5 minutes
    CACHE_DIR: path.join(os.homedir(), '.claude', 'cache', 'ace-routing')
};

class SkillRoutingBoost {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.agent = options.agent;
        this.category = options.category || null;

        // Ensure cache directory exists
        if (!fs.existsSync(CONFIG.CACHE_DIR)) {
            fs.mkdirSync(CONFIG.CACHE_DIR, { recursive: true });
        }
    }

    /**
     * Calculate routing boost for agent
     * @returns {Object} Boost result
     */
    async calculateBoost() {
        // Check cache first
        const cached = this.getFromCache();
        if (cached) {
            this.log('Using cached boost result');
            return cached;
        }

        // Get skills data
        const skills = await this.getAgentSkills();

        if (!skills || skills.length === 0) {
            this.log('No skills found for agent');
            return this.neutralResult('No skills found');
        }

        // Calculate overall stats
        const overall = this.calculateStats(skills);

        // Calculate category-specific stats if category provided
        let categoryStats = null;
        let categoryMatch = false;
        if (this.category) {
            const categorySkills = skills.filter(s =>
                s.category === this.category ||
                (s.tags && s.tags.includes(this.category))
            );
            if (categorySkills.length > 0) {
                categoryStats = this.calculateStats(categorySkills);
                categoryMatch = true;
                this.log(`Found ${categorySkills.length} skills matching category '${this.category}'`);
            }
        }

        // Calculate weighted success rate
        let weightedSuccessRate;
        if (categoryMatch && categoryStats) {
            // Category-weighted calculation
            weightedSuccessRate =
                (categoryStats.avgSuccessRate * CONFIG.CATEGORY_WEIGHT) +
                (overall.avgSuccessRate * CONFIG.OVERALL_WEIGHT);
        } else {
            // Overall only
            weightedSuccessRate = overall.avgSuccessRate;
        }

        // Calculate boost factor
        const boost = this.calculateBoostFactor(weightedSuccessRate, overall.totalUsage);

        const result = {
            boost,
            category_success_rate: categoryStats ? categoryStats.avgSuccessRate : null,
            overall_success_rate: overall.avgSuccessRate,
            usage_count: overall.totalUsage,
            confidence: overall.avgConfidence,
            category_match: categoryMatch,
            skill_count: skills.length,
            category_skill_count: categoryStats ? categoryStats.count : null,
            agent: this.agent,
            category: this.category,
            timestamp: new Date().toISOString()
        };

        // Cache result
        this.saveToCache(result);

        return result;
    }

    /**
     * Get skills for agent from registry
     */
    async getAgentSkills() {
        try {
            const registryPath = path.join(__dirname, 'strategy-registry.js');

            if (!fs.existsSync(registryPath)) {
                this.log('Strategy registry not found');
                return null;
            }

            // Use CLI interface of strategy-registry.js
            const output = execSync(
                `node "${registryPath}" for-agent --agent "${this.agent}" --format json`,
                {
                    encoding: 'utf-8',
                    timeout: 10000,
                    env: process.env
                }
            ).trim();

            if (!output) {
                return null;
            }

            const parsed = JSON.parse(output);
            return Array.isArray(parsed) ? parsed : parsed.skills || [];

        } catch (error) {
            // Try getting skills by source agent as fallback
            try {
                const registryPath = path.join(__dirname, 'strategy-registry.js');
                const output = execSync(
                    `node "${registryPath}" by-agent --agent "${this.agent}" --format json`,
                    {
                        encoding: 'utf-8',
                        timeout: 10000,
                        env: process.env
                    }
                ).trim();

                if (output) {
                    const parsed = JSON.parse(output);
                    return Array.isArray(parsed) ? parsed : parsed.skills || [];
                }
            } catch (fallbackError) {
                this.log(`Error getting skills: ${fallbackError.message}`);
            }

            return null;
        }
    }

    /**
     * Calculate statistics from skills array
     */
    calculateStats(skills) {
        if (!skills || skills.length === 0) {
            return {
                count: 0,
                avgSuccessRate: 0,
                avgConfidence: 0,
                totalUsage: 0
            };
        }

        const validSkills = skills.filter(s =>
            typeof s.success_rate === 'number' &&
            typeof s.usage_count === 'number'
        );

        if (validSkills.length === 0) {
            return {
                count: skills.length,
                avgSuccessRate: 0.5,  // Neutral default
                avgConfidence: 0.5,
                totalUsage: 0
            };
        }

        const totalUsage = validSkills.reduce((sum, s) => sum + (s.usage_count || 0), 0);

        // Usage-weighted average success rate
        let weightedSuccessRate = 0;
        if (totalUsage > 0) {
            weightedSuccessRate = validSkills.reduce((sum, s) => {
                return sum + (s.success_rate * s.usage_count);
            }, 0) / totalUsage;
        } else {
            // Simple average if no usage data
            weightedSuccessRate = validSkills.reduce((sum, s) => sum + s.success_rate, 0) / validSkills.length;
        }

        const avgConfidence = validSkills.reduce((sum, s) =>
            sum + (s.confidence || 0.5), 0) / validSkills.length;

        return {
            count: validSkills.length,
            avgSuccessRate: weightedSuccessRate,
            avgConfidence,
            totalUsage
        };
    }

    /**
     * Calculate boost factor from success rate
     */
    calculateBoostFactor(successRate, usageCount) {
        // Don't apply significant boost/penalty without enough data
        if (usageCount < CONFIG.MIN_USAGE_COUNT) {
            return CONFIG.NEUTRAL_BOOST;
        }

        if (successRate >= 0.90) {
            return CONFIG.EXCELLENT_BOOST;
        } else if (successRate >= 0.80) {
            return CONFIG.GOOD_BOOST;
        } else if (successRate >= 0.60) {
            return CONFIG.NEUTRAL_BOOST;
        } else {
            return CONFIG.PENALTY_BOOST;
        }
    }

    /**
     * Return neutral result when no data available
     */
    neutralResult(reason) {
        return {
            boost: 1.0,
            category_success_rate: null,
            overall_success_rate: null,
            usage_count: 0,
            confidence: null,
            category_match: false,
            skill_count: 0,
            category_skill_count: null,
            agent: this.agent,
            category: this.category,
            reason,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Get cached result if still valid
     */
    getFromCache() {
        const cacheKey = `${this.agent}_${this.category || 'all'}`;
        const cachePath = path.join(CONFIG.CACHE_DIR, `${cacheKey}.json`);

        try {
            if (!fs.existsSync(cachePath)) {
                return null;
            }

            const stat = fs.statSync(cachePath);
            const ageSeconds = (Date.now() - stat.mtimeMs) / 1000;

            if (ageSeconds > CONFIG.CACHE_TTL) {
                this.log('Cache expired');
                return null;
            }

            const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
            cached._cached = true;
            return cached;

        } catch (error) {
            this.log(`Cache read error: ${error.message}`);
            return null;
        }
    }

    /**
     * Save result to cache
     */
    saveToCache(result) {
        const cacheKey = `${this.agent}_${this.category || 'all'}`;
        const cachePath = path.join(CONFIG.CACHE_DIR, `${cacheKey}.json`);

        try {
            fs.writeFileSync(cachePath, JSON.stringify(result, null, 2));
            this.log(`Cached result to ${cachePath}`);
        } catch (error) {
            this.log(`Cache write error: ${error.message}`);
        }
    }

    /**
     * Log message if verbose
     */
    log(message, data = null) {
        if (this.verbose) {
            if (data) {
                console.error(`[skill-routing-boost] ${message}:`, data);
            } else {
                console.error(`[skill-routing-boost] ${message}`);
            }
        }
    }
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

function parseArgs(args) {
    const options = {
        agent: null,
        category: null,
        format: 'json',
        verbose: false
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--agent' && args[i + 1]) {
            options.agent = args[++i];
        } else if (arg === '--category' && args[i + 1]) {
            options.category = args[++i];
        } else if (arg === '--format' && args[i + 1]) {
            options.format = args[++i];
        } else if (arg === '--verbose' || arg === '-v') {
            options.verbose = true;
        } else if (arg === '--help' || arg === '-h') {
            options.help = true;
        }
    }

    return options;
}

function showHelp() {
    console.log(`
Skill Routing Boost - ACE Framework Integration

Usage:
  node skill-routing-boost.js --agent <agent-name> [options]

Options:
  --agent <name>      Agent name to calculate boost for (required)
  --category <name>   Task category for weighted boost (optional)
  --format <type>     Output format: json (default), text
  --verbose, -v       Show debug output to stderr
  --help, -h          Show this help message

Categories:
  assessment          Audits, assessments, reviews
  deployment          Deploys, releases, production pushes
  creation            Create, build, new items
  remediation         Fix, resolve, debug errors
  analysis            Query, report, dashboard, metrics

Examples:
  # Basic boost calculation
  node skill-routing-boost.js --agent sfdc-revops-auditor

  # Category-weighted boost
  node skill-routing-boost.js --agent sfdc-revops-auditor --category assessment

  # With verbose output
  node skill-routing-boost.js --agent sfdc-cpq-assessor --category assessment -v

Output (JSON):
  {
    "boost": 1.15,                    // Boost factor (0.85-1.3)
    "category_success_rate": 0.92,    // Category-specific success rate
    "overall_success_rate": 0.87,     // Agent-wide success rate
    "usage_count": 45,                // Total skill executions
    "confidence": 0.88,               // Average confidence
    "category_match": true,           // Category matched
    "skill_count": 12                 // Total skills
  }
`);
}

async function main() {
    const args = process.argv.slice(2);
    const options = parseArgs(args);

    if (options.help) {
        showHelp();
        process.exit(0);
    }

    if (!options.agent) {
        console.error('Error: --agent is required');
        console.error('Usage: node skill-routing-boost.js --agent <agent-name>');
        process.exit(1);
    }

    try {
        const booster = new SkillRoutingBoost({
            agent: options.agent,
            category: options.category,
            verbose: options.verbose
        });

        const result = await booster.calculateBoost();

        if (options.format === 'text') {
            console.log(`Agent: ${result.agent}`);
            console.log(`Boost: ${result.boost.toFixed(2)}x`);
            if (result.category_match) {
                console.log(`Category: ${result.category} (match: yes)`);
                console.log(`Category Success Rate: ${(result.category_success_rate * 100).toFixed(1)}%`);
            }
            console.log(`Overall Success Rate: ${result.overall_success_rate ? (result.overall_success_rate * 100).toFixed(1) + '%' : 'N/A'}`);
            console.log(`Usage Count: ${result.usage_count}`);
            console.log(`Skill Count: ${result.skill_count}`);
        } else {
            console.log(JSON.stringify(result));
        }

    } catch (error) {
        console.error(`Error: ${error.message}`);
        // Return neutral boost on error
        console.log(JSON.stringify({ boost: 1.0, error: error.message }));
        process.exit(1);
    }
}

// Run CLI
if (require.main === module) {
    main();
}

module.exports = { SkillRoutingBoost, CONFIG };
