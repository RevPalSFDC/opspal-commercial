/**
 * Confidence Scorer
 *
 * Implements a 1-5 confidence scoring system for enriched data points,
 * inspired by the Mira agentic enrichment pattern.
 *
 * Confidence Levels:
 * - 5: VERIFIED - Multi-source corroboration, verified data
 * - 4: HIGH - Authoritative source (company website, LinkedIn)
 * - 3: MEDIUM - Secondary source (news, directories)
 * - 2: LOW - Search results, may be outdated
 * - 1: INFERRED - AI-inferred, needs verification
 *
 * @module enrichment/confidence-scorer
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Confidence level descriptions
 */
const CONFIDENCE_LEVELS = {
    5: 'VERIFIED',
    4: 'HIGH',
    3: 'MEDIUM',
    2: 'LOW',
    1: 'INFERRED'
};

/**
 * Default base scores by source type
 */
const DEFAULT_BASE_SCORES = {
    customer_provided: 5,
    crm_user_entered: 5,
    company_website: 4,
    linkedin: 4,
    government_database: 4,
    verified_api: 4,
    business_directory: 3,
    news_article: 3,
    press_release: 3,
    third_party_enrichment: 3,
    web_search: 2,
    social_media: 2,
    ai_inference: 1,
    unknown: 1
};

/**
 * Default boost/penalty configuration
 */
const DEFAULT_MODIFIERS = {
    boosts: {
        corroboration: 0.5,      // Multiple sources agree
        exact_match: 0.5,       // Exact vs fuzzy match
        verified: 1.0,          // Verified (email, phone)
        recent_data: 0.3,       // Data < 30 days old
        official_source: 0.3,   // Official company/gov source
        structured_data: 0.2    // Structured vs unstructured
    },
    penalties: {
        stale_data: 1.0,        // Data > 1 year old
        fuzzy_match: 0.5,       // Fuzzy match confidence loss
        single_source: 0.3,     // Only one source
        unverified: 0.3,        // Not verified
        indirect_source: 0.5    // Secondary/indirect source
    }
};

/**
 * Enriched value with confidence metadata
 */
class EnrichedValue {
    /**
     * Create an enriched value
     * @param {*} value - The enriched value
     * @param {Object} options - Enrichment options
     */
    constructor(value, options = {}) {
        this.value = value;
        this.confidence = options.confidence !== undefined ? options.confidence : 1;
        this.level = CONFIDENCE_LEVELS[Math.round(this.confidence)] || 'UNKNOWN';
        this.source = options.source || 'unknown';
        this.sourceUrl = options.sourceUrl || null;
        this.collectedAt = options.collectedAt || new Date().toISOString();
        this.expiresAt = options.expiresAt || null;
        this.corroboratedBy = options.corroboratedBy || [];
        this.matchType = options.matchType || 'exact';
        this.verified = options.verified || false;
        this.metadata = options.metadata || {};
    }

    /**
     * Check if this value meets a confidence threshold
     * @param {number} threshold - Minimum confidence required
     * @returns {boolean}
     */
    meetsThreshold(threshold) {
        return this.confidence >= threshold;
    }

    /**
     * Check if the value has expired based on TTL
     * @returns {boolean}
     */
    isExpired() {
        if (!this.expiresAt) return false;
        return new Date() > new Date(this.expiresAt);
    }

    /**
     * Check if this value is stale (> specified days)
     * @param {number} days - Number of days to consider stale
     * @returns {boolean}
     */
    isStale(days = 365) {
        const collectedDate = new Date(this.collectedAt);
        const staleDate = new Date();
        staleDate.setDate(staleDate.getDate() - days);
        return collectedDate < staleDate;
    }

    /**
     * Convert to plain object
     * @returns {Object}
     */
    toJSON() {
        return {
            value: this.value,
            confidence: this.confidence,
            level: this.level,
            source: this.source,
            sourceUrl: this.sourceUrl,
            collectedAt: this.collectedAt,
            expiresAt: this.expiresAt,
            corroboratedBy: this.corroboratedBy,
            matchType: this.matchType,
            verified: this.verified,
            metadata: this.metadata
        };
    }
}

/**
 * Confidence Scorer for enrichment pipeline
 */
class ConfidenceScorer {
    /**
     * Create a confidence scorer
     * @param {Object} options - Configuration options
     * @param {Object} [options.baseScores] - Custom base scores by source
     * @param {Object} [options.modifiers] - Custom boost/penalty modifiers
     * @param {string} [options.configPath] - Path to config file
     */
    constructor(options = {}) {
        this.baseScores = { ...DEFAULT_BASE_SCORES, ...options.baseScores };
        this.modifiers = this._mergeModifiers(DEFAULT_MODIFIERS, options.modifiers);
        this.minScore = options.minScore || 1;
        this.maxScore = options.maxScore || 5;

        if (options.configPath) {
            this._loadConfig(options.configPath);
        }
    }

    /**
     * Merge modifier configurations
     * @private
     */
    _mergeModifiers(base, custom = {}) {
        return {
            boosts: { ...base.boosts, ...custom?.boosts },
            penalties: { ...base.penalties, ...custom?.penalties }
        };
    }

    /**
     * Load configuration from file
     * @private
     */
    _loadConfig(configPath) {
        try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            if (config.confidence_scoring) {
                const cs = config.confidence_scoring;
                if (cs.base_scores) {
                    this.baseScores = { ...this.baseScores, ...cs.base_scores };
                }
                if (cs.boosts) {
                    this.modifiers.boosts = { ...this.modifiers.boosts, ...cs.boosts };
                }
                if (cs.penalties) {
                    this.modifiers.penalties = { ...this.modifiers.penalties, ...cs.penalties };
                }
                if (cs.min_score) this.minScore = cs.min_score;
                if (cs.max_score) this.maxScore = cs.max_score;
            }
        } catch (error) {
            console.warn(`Failed to load confidence config from ${configPath}: ${error.message}`);
        }
    }

    /**
     * Calculate confidence score for an enriched value
     * @param {*} value - The enriched value
     * @param {string} source - The source of the data
     * @param {Object} signals - Additional signals for scoring
     * @returns {EnrichedValue}
     */
    calculate(value, source, signals = {}) {
        if (value === null || value === undefined || value === '') {
            return new EnrichedValue(value, {
                confidence: 0,
                source,
                metadata: { reason: 'empty_value' }
            });
        }

        // Get base score from source
        let score = this.getBaseScore(source);

        // Apply boosts
        score = this._applyBoosts(score, signals);

        // Apply penalties
        score = this._applyPenalties(score, signals);

        // Clamp to valid range
        score = this._clamp(score);

        return new EnrichedValue(value, {
            confidence: score,
            source,
            sourceUrl: signals.sourceUrl,
            collectedAt: signals.collectedAt || new Date().toISOString(),
            expiresAt: signals.expiresAt,
            corroboratedBy: signals.corroboratedBy || [],
            matchType: signals.matchType || 'exact',
            verified: signals.verified || false,
            metadata: {
                baseScore: this.getBaseScore(source),
                appliedBoosts: signals._appliedBoosts || [],
                appliedPenalties: signals._appliedPenalties || [],
                ...signals.metadata
            }
        });
    }

    /**
     * Get base score for a source type
     * @param {string} source - Source identifier
     * @returns {number}
     */
    getBaseScore(source) {
        const normalizedSource = source?.toLowerCase().replace(/[\s-]/g, '_') || 'unknown';
        return this.baseScores[normalizedSource] || this.baseScores.unknown || 1;
    }

    /**
     * Apply boosts based on signals
     * @private
     */
    _applyBoosts(score, signals) {
        const appliedBoosts = [];

        // Corroboration boost
        if (signals.corroboratedBy?.length > 0) {
            const boost = this.modifiers.boosts.corroboration * Math.min(signals.corroboratedBy.length, 3);
            score += boost;
            appliedBoosts.push({ type: 'corroboration', boost, sources: signals.corroboratedBy });
        }

        // Exact match boost
        if (signals.matchType === 'exact') {
            score += this.modifiers.boosts.exact_match;
            appliedBoosts.push({ type: 'exact_match', boost: this.modifiers.boosts.exact_match });
        }

        // Verified boost
        if (signals.verified) {
            score += this.modifiers.boosts.verified;
            appliedBoosts.push({ type: 'verified', boost: this.modifiers.boosts.verified });
        }

        // Recent data boost (< 30 days)
        if (signals.collectedAt) {
            const collectedDate = new Date(signals.collectedAt);
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            if (collectedDate > thirtyDaysAgo) {
                score += this.modifiers.boosts.recent_data;
                appliedBoosts.push({ type: 'recent_data', boost: this.modifiers.boosts.recent_data });
            }
        }

        // Official source boost
        if (signals.isOfficialSource) {
            score += this.modifiers.boosts.official_source;
            appliedBoosts.push({ type: 'official_source', boost: this.modifiers.boosts.official_source });
        }

        // Structured data boost
        if (signals.isStructuredData) {
            score += this.modifiers.boosts.structured_data;
            appliedBoosts.push({ type: 'structured_data', boost: this.modifiers.boosts.structured_data });
        }

        signals._appliedBoosts = appliedBoosts;
        return score;
    }

    /**
     * Apply penalties based on signals
     * @private
     */
    _applyPenalties(score, signals) {
        const appliedPenalties = [];

        // Stale data penalty (> 1 year)
        if (signals.collectedAt || signals.dataAge) {
            const dataAgeDays = signals.dataAge ||
                Math.floor((Date.now() - new Date(signals.collectedAt).getTime()) / (1000 * 60 * 60 * 24));

            if (dataAgeDays > (signals.staleDays || 365)) {
                score -= this.modifiers.penalties.stale_data;
                appliedPenalties.push({ type: 'stale_data', penalty: this.modifiers.penalties.stale_data, ageDays: dataAgeDays });
            }
        }

        // Fuzzy match penalty
        if (signals.matchType === 'fuzzy') {
            const matchConfidence = signals.matchConfidence || 0.8;
            const penalty = this.modifiers.penalties.fuzzy_match * (1 - matchConfidence);
            score -= penalty;
            appliedPenalties.push({ type: 'fuzzy_match', penalty, matchConfidence });
        }

        // Single source penalty
        if (!signals.corroboratedBy || signals.corroboratedBy.length === 0) {
            if (signals.requireCorroboration) {
                score -= this.modifiers.penalties.single_source;
                appliedPenalties.push({ type: 'single_source', penalty: this.modifiers.penalties.single_source });
            }
        }

        // Unverified penalty for fields that should be verified
        if (signals.shouldBeVerified && !signals.verified) {
            score -= this.modifiers.penalties.unverified;
            appliedPenalties.push({ type: 'unverified', penalty: this.modifiers.penalties.unverified });
        }

        // Indirect source penalty
        if (signals.isIndirectSource) {
            score -= this.modifiers.penalties.indirect_source;
            appliedPenalties.push({ type: 'indirect_source', penalty: this.modifiers.penalties.indirect_source });
        }

        signals._appliedPenalties = appliedPenalties;
        return score;
    }

    /**
     * Clamp score to valid range
     * @private
     */
    _clamp(score) {
        return Math.round(Math.min(this.maxScore, Math.max(this.minScore, score)) * 10) / 10;
    }

    /**
     * Compare two enriched values and return the better one
     * @param {EnrichedValue} value1 - First value
     * @param {EnrichedValue} value2 - Second value
     * @returns {EnrichedValue}
     */
    selectBest(value1, value2) {
        if (!value1 || value1.confidence === 0) return value2;
        if (!value2 || value2.confidence === 0) return value1;

        // Prefer higher confidence
        if (value1.confidence !== value2.confidence) {
            return value1.confidence > value2.confidence ? value1 : value2;
        }

        // Prefer verified
        if (value1.verified !== value2.verified) {
            return value1.verified ? value1 : value2;
        }

        // Prefer more corroboration
        if (value1.corroboratedBy.length !== value2.corroboratedBy.length) {
            return value1.corroboratedBy.length > value2.corroboratedBy.length ? value1 : value2;
        }

        // Prefer more recent
        return new Date(value1.collectedAt) > new Date(value2.collectedAt) ? value1 : value2;
    }

    /**
     * Merge multiple enriched values, selecting best and tracking corroboration
     * @param {EnrichedValue[]} values - Array of enriched values
     * @returns {EnrichedValue}
     */
    merge(values) {
        if (!values || values.length === 0) return null;

        const validValues = values.filter(v => v && v.confidence > 0);
        if (validValues.length === 0) return null;
        if (validValues.length === 1) return validValues[0];

        // Find matching values for corroboration
        const valueGroups = new Map();
        for (const v of validValues) {
            const key = this._normalizeValue(v.value);
            if (!valueGroups.has(key)) {
                valueGroups.set(key, []);
            }
            valueGroups.get(key).push(v);
        }

        // Find the group with most corroboration
        let bestGroup = null;
        let maxCount = 0;
        for (const [key, group] of valueGroups) {
            if (group.length > maxCount) {
                maxCount = group.length;
                bestGroup = group;
            }
        }

        // Select best from the group
        let best = bestGroup[0];
        for (let i = 1; i < bestGroup.length; i++) {
            best = this.selectBest(best, bestGroup[i]);
        }

        // Add corroboration from other sources in the group
        const corroboratedBy = bestGroup
            .filter(v => v !== best)
            .map(v => v.source);

        // Recalculate with corroboration
        return this.calculate(best.value, best.source, {
            ...best.metadata,
            corroboratedBy: [...(best.corroboratedBy || []), ...corroboratedBy],
            sourceUrl: best.sourceUrl,
            collectedAt: best.collectedAt,
            verified: best.verified,
            matchType: best.matchType
        });
    }

    /**
     * Normalize value for comparison
     * @private
     */
    _normalizeValue(value) {
        if (value === null || value === undefined) return '';
        if (typeof value === 'string') {
            return value.toLowerCase().trim().replace(/\s+/g, ' ');
        }
        if (typeof value === 'number') {
            return String(value);
        }
        return JSON.stringify(value);
    }

    /**
     * Get confidence level description
     * @param {number} score - Confidence score
     * @returns {string}
     */
    getLevel(score) {
        const rounded = Math.round(score);
        return CONFIDENCE_LEVELS[rounded] || 'UNKNOWN';
    }

    /**
     * Check if a confidence score meets a threshold
     * @param {number} score - Confidence score
     * @param {number} threshold - Minimum required
     * @returns {boolean}
     */
    meetsThreshold(score, threshold) {
        return score >= threshold;
    }

    /**
     * Get all confidence levels
     * @returns {Object}
     */
    static get LEVELS() {
        return { ...CONFIDENCE_LEVELS };
    }

    /**
     * Get default base scores
     * @returns {Object}
     */
    static get DEFAULT_SCORES() {
        return { ...DEFAULT_BASE_SCORES };
    }
}

module.exports = {
    ConfidenceScorer,
    EnrichedValue,
    CONFIDENCE_LEVELS,
    DEFAULT_BASE_SCORES,
    DEFAULT_MODIFIERS
};
