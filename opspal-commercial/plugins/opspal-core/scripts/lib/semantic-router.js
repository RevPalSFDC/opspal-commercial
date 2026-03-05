#!/usr/bin/env node

/**
 * Semantic Router - Advanced agent routing using semantic similarity
 *
 * Uses TF-IDF vectorization and cosine similarity to match tasks to agents
 * based on semantic meaning, not just keyword matching.
 *
 * @version 1.0.0
 * @date 2025-01-08
 */

const fs = require('fs');
const path = require('path');
const SEMVER_PLUGIN_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

class SemanticRouter {
    constructor(options = {}) {
        this.routingIndexPath = options.routingIndexPath ||
            path.join(__dirname, '../../../opspal-core/routing-index.json');
        this.vectorCachePath = options.vectorCachePath ||
            path.join('/tmp', 'routing-vector-cache.json');
        this.guardrailLogPath = options.guardrailLogPath ||
            path.join(process.env.HOME || '/tmp', '.claude', 'logs', 'routing-alerts.jsonl');
        this.verbose = options.verbose || false;

        // TF-IDF parameters
        this.minTermFrequency = 1;
        this.maxDocumentFrequency = 0.8; // Ignore terms in >80% of docs

        // Routing thresholds
        this.semanticThreshold = 0.3; // Minimum similarity score
        this.highConfidenceThreshold = 0.7; // High confidence similarity

        // Load routing index
        this.loadRoutingIndex();

        // Load or build vector cache
        this.loadVectorCache();
    }

    /**
     * Check whether an agent name has a semver pseudo-plugin prefix.
     * @param {string} agentName
     * @returns {boolean}
     */
    isSemverPrefixedAgent(agentName) {
        if (typeof agentName !== 'string' || !agentName.includes(':')) {
            return false;
        }

        const pluginName = agentName.split(':')[0];
        return SEMVER_PLUGIN_PATTERN.test(String(pluginName));
    }

    /**
     * Persist routing guardrail alerts for telemetry.
     * @param {Object} alert
     */
    logGuardrailAlert(alert) {
        try {
            const payload = {
                timestamp: new Date().toISOString(),
                source: 'semantic-router',
                ...alert
            };

            const logDir = path.dirname(this.guardrailLogPath);
            fs.mkdirSync(logDir, { recursive: true });
            fs.appendFileSync(this.guardrailLogPath, JSON.stringify(payload) + '\n', 'utf-8');
        } catch (error) {
            if (this.verbose) {
                console.warn(`[semantic-router][guardrail] Failed to write alert: ${error.message}`);
            }
        }
    }

    /**
     * Load routing index from JSON
     */
    loadRoutingIndex() {
        if (!fs.existsSync(this.routingIndexPath)) {
            throw new Error(`Routing index not found: ${this.routingIndexPath}`);
        }

        this.routingIndex = JSON.parse(fs.readFileSync(this.routingIndexPath, 'utf-8'));
        this.log(`Loaded routing index: ${this.getAgentEntries().length} agents`);
    }

    /**
     * Get agent entries from collision-safe index when available
     */
    getAgentEntries() {
        const fullAgents = this.routingIndex?.agentsByFull;
        if (fullAgents && Object.keys(fullAgents).length > 0) {
            return Object.entries(fullAgents);
        }
        return Object.entries(this.routingIndex?.agents || {});
    }

    /**
     * Detect explicit platform intent from task text.
     * @param {string} taskDescription
     * @returns {string[]} platforms
     */
    detectPlatformIntent(taskDescription) {
        const text = String(taskDescription || '').toLowerCase();
        const platforms = new Set();

        if (/\bmarketo\b/.test(text)) {
            platforms.add('marketo');
        }
        if (/\bhubspot\b/.test(text)) {
            platforms.add('hubspot');
        }
        if (/\bsalesforce\b|\bsfdc\b/.test(text)) {
            platforms.add('salesforce');
        }
        if (/\bmonday(?:\.com)?\b/.test(text)) {
            platforms.add('monday');
        }

        return Array.from(platforms);
    }

    /**
     * Infer primary platform of an agent by plugin namespace.
     * @param {string} agentName
     * @returns {string|null}
     */
    getAgentPlatform(agentName) {
        if (typeof agentName !== 'string' || !agentName.includes(':')) {
            return null;
        }

        const plugin = agentName.split(':')[0].toLowerCase();
        if (plugin.includes('marketo')) return 'marketo';
        if (plugin.includes('hubspot')) return 'hubspot';
        if (plugin.includes('salesforce') || plugin.includes('sfdc')) return 'salesforce';
        if (plugin.includes('monday')) return 'monday';
        return null;
    }

    /**
     * Apply platform-intent bias to semantic similarity.
     * @param {number} similarity
     * @param {string} agentName
     * @param {string[]} platformIntent
     * @returns {number}
     */
    applyPlatformIntent(similarity, agentName, platformIntent) {
        if (!Array.isArray(platformIntent) || platformIntent.length === 0) {
            return similarity;
        }

        const agentPlatform = this.getAgentPlatform(agentName);
        if (!agentPlatform) {
            return similarity;
        }

        let adjusted = similarity;

        if (platformIntent.length === 1) {
            const target = platformIntent[0];
            if (agentPlatform === target) {
                adjusted += 0.12;
            } else {
                adjusted -= 0.08;
            }
        } else {
            if (platformIntent.includes(agentPlatform)) {
                adjusted += 0.04;
            } else {
                adjusted -= 0.03;
            }
        }

        return Math.max(0, Math.min(1, adjusted));
    }

    /**
     * Load vector cache or build if missing/stale
     */
    loadVectorCache() {
        const cacheExists = fs.existsSync(this.vectorCachePath);
        const indexModified = fs.statSync(this.routingIndexPath).mtime;

        if (cacheExists) {
            const cacheModified = fs.statSync(this.vectorCachePath).mtime;
            if (cacheModified >= indexModified) {
                this.vectorCache = JSON.parse(fs.readFileSync(this.vectorCachePath, 'utf-8'));
                this.log(`Loaded vector cache: ${Object.keys(this.vectorCache.agentVectors).length} agents`);
                return;
            }
        }

        // Build vector cache
        this.log('Building vector cache...');
        this.buildVectorCache();
        this.saveVectorCache();
        this.log(`Vector cache built: ${Object.keys(this.vectorCache.agentVectors).length} agents`);
    }

    /**
     * Build TF-IDF vectors for all agents
     */
    buildVectorCache() {
        // Collect all documents (agent descriptions + keywords)
        const documents = [];
        const agentNames = [];

        for (const [agentName, agent] of this.getAgentEntries()) {
            if (this.isSemverPrefixedAgent(agentName)) {
                this.logGuardrailAlert({
                    type: 'semver_index_reference_filtered',
                    leakedAgent: agentName,
                    message: `Filtered semver-prefixed agent "${agentName}" while building semantic vectors.`
                });
                continue;
            }

            const text = this.getAgentText(agent);
            documents.push(text);
            agentNames.push(agentName);
        }

        // Build vocabulary
        const vocabulary = this.buildVocabulary(documents);

        // Calculate IDF
        const idf = this.calculateIDF(documents, vocabulary);

        // Calculate TF-IDF vectors for each agent
        const agentVectors = {};
        for (let i = 0; i < documents.length; i++) {
            const vector = this.calculateTFIDF(documents[i], vocabulary, idf);
            agentVectors[agentNames[i]] = vector;
        }

        this.vectorCache = {
            version: '1.0.0',
            createdAt: new Date().toISOString(),
            vocabulary: Array.from(vocabulary),
            idf,
            agentVectors
        };
    }

    /**
     * Get searchable text for an agent
     */
    getAgentText(agent) {
        const parts = [];

        // Agent name (high weight)
        parts.push(agent.name.replace(/-/g, ' ').repeat(3));

        // Description
        if (agent.description) {
            parts.push(agent.description);
        }

        // Keywords (medium weight)
        if (agent.triggerKeywords && agent.triggerKeywords.length > 0) {
            parts.push(agent.triggerKeywords.join(' ').repeat(2));
        }

        return parts.join(' ').toLowerCase();
    }

    /**
     * Build vocabulary from documents
     */
    buildVocabulary(documents) {
        const vocabulary = new Set();

        for (const doc of documents) {
            const terms = this.tokenize(doc);
            for (const term of terms) {
                vocabulary.add(term);
            }
        }

        return vocabulary;
    }

    /**
     * Calculate Inverse Document Frequency
     */
    calculateIDF(documents, vocabulary) {
        const idf = {};
        const numDocs = documents.length;

        for (const term of vocabulary) {
            let docCount = 0;
            for (const doc of documents) {
                if (this.tokenize(doc).includes(term)) {
                    docCount++;
                }
            }

            // Skip terms that appear in too many documents
            if (docCount / numDocs <= this.maxDocumentFrequency) {
                idf[term] = Math.log(numDocs / (1 + docCount));
            }
        }

        return idf;
    }

    /**
     * Calculate TF-IDF vector for a document
     */
    calculateTFIDF(document, vocabulary, idf) {
        const terms = this.tokenize(document);
        const termFreq = {};

        // Count term frequencies
        for (const term of terms) {
            termFreq[term] = (termFreq[term] || 0) + 1;
        }

        // Calculate TF-IDF
        const vector = {};
        for (const term of vocabulary) {
            if (termFreq[term] && idf[term]) {
                const tf = termFreq[term] / terms.length;
                vector[term] = tf * idf[term];
            }
        }

        return vector;
    }

    /**
     * Tokenize text into terms
     */
    tokenize(text) {
        // Lowercase and split on non-word characters
        return text
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, ' ')
            .split(/\s+/)
            .filter(term => term.length > 2) // Remove short terms
            .filter(term => !this.isStopWord(term));
    }

    /**
     * Check if term is a stop word
     */
    isStopWord(term) {
        const stopWords = new Set([
            'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all',
            'can', 'her', 'was', 'one', 'our', 'out', 'day', 'get',
            'has', 'him', 'his', 'how', 'its', 'may', 'new', 'now',
            'old', 'see', 'two', 'who', 'boy', 'did', 'she', 'use'
        ]);
        return stopWords.has(term);
    }

    /**
     * Calculate cosine similarity between two vectors
     */
    cosineSimilarity(vectorA, vectorB) {
        let dotProduct = 0;
        let magnitudeA = 0;
        let magnitudeB = 0;

        // Get all unique terms
        const terms = new Set([...Object.keys(vectorA), ...Object.keys(vectorB)]);

        for (const term of terms) {
            const a = vectorA[term] || 0;
            const b = vectorB[term] || 0;

            dotProduct += a * b;
            magnitudeA += a * a;
            magnitudeB += b * b;
        }

        magnitudeA = Math.sqrt(magnitudeA);
        magnitudeB = Math.sqrt(magnitudeB);

        if (magnitudeA === 0 || magnitudeB === 0) {
            return 0;
        }

        return dotProduct / (magnitudeA * magnitudeB);
    }

    /**
     * Route a task using semantic similarity
     * @param {string} taskDescription - Task to route
     * @returns {Object} Routing result with agent recommendations
     */
    route(taskDescription) {
        const platformIntent = this.detectPlatformIntent(taskDescription);

        // Vectorize the task description
        const taskVector = this.calculateTFIDF(
            taskDescription.toLowerCase(),
            new Set(this.vectorCache.vocabulary),
            this.vectorCache.idf
        );

        // Calculate similarity with all agents
        const similarities = [];
        for (const [agentName, agentVector] of Object.entries(this.vectorCache.agentVectors)) {
            if (this.isSemverPrefixedAgent(agentName)) {
                this.logGuardrailAlert({
                    type: 'semver_vector_reference_filtered',
                    leakedAgent: agentName,
                    message: `Filtered semver-prefixed agent "${agentName}" during semantic routing.`
                });
                continue;
            }

            const similarity = this.cosineSimilarity(taskVector, agentVector);
            const adjustedSimilarity = this.applyPlatformIntent(similarity, agentName, platformIntent);

            if (adjustedSimilarity >= this.semanticThreshold) {
                similarities.push({
                    agent: agentName,
                    similarity: adjustedSimilarity,
                    baseSimilarity: similarity,
                    platformBoost: Number((adjustedSimilarity - similarity).toFixed(4)),
                    confidence: this.calculateConfidence(adjustedSimilarity)
                });
            }
        }

        // Sort by similarity (descending)
        similarities.sort((a, b) => b.similarity - a.similarity);

        // Take top 5 matches
        const topMatches = similarities.slice(0, 5);

        return {
            taskDescription,
            matches: topMatches,
            topAgent: topMatches.length > 0 ? topMatches[0].agent : null,
            confidence: topMatches.length > 0 ? topMatches[0].confidence : 0,
            similarity: topMatches.length > 0 ? topMatches[0].similarity : 0,
            method: 'semantic',
            matchCount: topMatches.length
        };
    }

    /**
     * Calculate confidence score from similarity
     */
    calculateConfidence(similarity) {
        // Map similarity [0.3, 1.0] to confidence [0, 100]
        if (similarity < this.semanticThreshold) {
            return 0;
        }
        if (similarity >= this.highConfidenceThreshold) {
            return Math.min(100, 70 + (similarity - this.highConfidenceThreshold) * 100);
        }
        // Linear interpolation between threshold and high confidence
        const range = this.highConfidenceThreshold - this.semanticThreshold;
        const normalized = (similarity - this.semanticThreshold) / range;
        return Math.round(normalized * 70);
    }

    /**
     * Combine semantic and keyword-based routing
     * @param {string} taskDescription - Task to route
     * @param {Object} keywordResult - Result from keyword-based router
     * @returns {Object} Hybrid routing result
     */
    hybridRoute(taskDescription, keywordResult = null) {
        const semanticResult = this.route(taskDescription);

        // If no keyword result, return semantic only
        if (!keywordResult) {
            return {
                ...semanticResult,
                method: 'semantic-only'
            };
        }

        // Combine results
        const combinedMatches = new Map();

        // Add semantic matches
        for (const match of semanticResult.matches) {
            combinedMatches.set(match.agent, {
                agent: match.agent,
                semanticScore: match.similarity,
                semanticConfidence: match.confidence,
                keywordScore: 0,
                keywordConfidence: 0,
                combined: match.similarity * 0.6 // Weight semantic 60%
            });
        }

        // Add/merge keyword matches
        // TaskRouter returns {agent, confidence, alternatives}
        const keywordMatches = [];
        if (keywordResult.agent) {
            keywordMatches.push({
                agent: keywordResult.agent,
                confidence: keywordResult.confidence || 0
            });
        }
        if (keywordResult.alternatives) {
            for (const alt of keywordResult.alternatives) {
                keywordMatches.push({
                    agent: alt.agent,
                    confidence: alt.confidence || 0
                });
            }
        }

        for (const match of keywordMatches) {
            const keywordConfidence = match.confidence || 0; // 0-1 decimal
            if (combinedMatches.has(match.agent)) {
                const existing = combinedMatches.get(match.agent);
                existing.keywordScore = keywordConfidence;
                existing.keywordConfidence = Math.round(keywordConfidence * 100); // Convert to percentage for display
                existing.combined += keywordConfidence * 0.4; // Weight keyword 40%
            } else {
                combinedMatches.set(match.agent, {
                    agent: match.agent,
                    semanticScore: 0,
                    semanticConfidence: 0,
                    keywordScore: keywordConfidence,
                    keywordConfidence: Math.round(keywordConfidence * 100), // Convert to percentage for display
                    combined: keywordConfidence * 0.4 // Weight keyword 40%
                });
            }
        }

        // Sort by combined score
        const sortedMatches = Array.from(combinedMatches.values())
            .sort((a, b) => b.combined - a.combined)
            .slice(0, 5);

        return {
            taskDescription,
            matches: sortedMatches,
            topAgent: sortedMatches.length > 0 ? sortedMatches[0].agent : null,
            confidence: sortedMatches.length > 0 ?
                Math.round(Math.max(sortedMatches[0].semanticConfidence, sortedMatches[0].keywordConfidence)) : 0,
            method: 'hybrid',
            matchCount: sortedMatches.length
        };
    }

    /**
     * Save vector cache to disk
     */
    saveVectorCache() {
        try {
            fs.writeFileSync(
                this.vectorCachePath,
                JSON.stringify(this.vectorCache, null, 2),
                'utf-8'
            );
            this.log(`Vector cache saved: ${this.vectorCachePath}`);
        } catch (error) {
            console.error(`Failed to save vector cache: ${error.message}`);
        }
    }

    /**
     * Get cache statistics
     */
    getStats() {
        return {
            totalAgents: Object.keys(this.vectorCache.agentVectors).length,
            vocabularySize: this.vectorCache.vocabulary.length,
            cacheCreated: this.vectorCache.createdAt,
            semanticThreshold: this.semanticThreshold,
            highConfidenceThreshold: this.highConfidenceThreshold
        };
    }

    /**
     * Log message if verbose
     */
    log(message) {
        if (this.verbose) {
            console.log(`[SEMANTIC] ${message}`);
        }
    }

    /**
     * Format routing result for display
     */
    format(result) {
        const lines = [];

        lines.push('='.repeat(60));
        lines.push('Semantic Routing Result');
        lines.push('='.repeat(60));
        lines.push(`Task: ${result.taskDescription}`);
        lines.push(`Method: ${result.method}`);
        lines.push('');

        if (result.matches.length === 0) {
            lines.push('No matches found above threshold');
            return lines.join('\n');
        }

        lines.push('Top Matches:');
        lines.push('-'.repeat(60));

        for (const match of result.matches) {
            if (result.method === 'hybrid') {
                lines.push(`${match.agent}`);
                lines.push(`  Semantic: ${(match.semanticScore * 100).toFixed(1)}% (confidence: ${match.semanticConfidence}%)`);
                lines.push(`  Keyword:  ${match.keywordConfidence}% (score: ${(match.keywordScore * 100).toFixed(1)})`);
                lines.push(`  Combined: ${(match.combined * 100).toFixed(1)}%`);
            } else {
                lines.push(`${match.agent}`);
                lines.push(`  Similarity: ${(match.similarity * 100).toFixed(1)}%`);
                lines.push(`  Confidence: ${match.confidence}%`);
            }
            lines.push('');
        }

        lines.push('='.repeat(60));
        lines.push(`RECOMMENDED AGENT: ${result.topAgent}`);
        lines.push(`CONFIDENCE: ${result.confidence}%`);
        lines.push('='.repeat(60));

        return lines.join('\n');
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        console.log('Usage: semantic-router.js [options] <task description>');
        console.log('');
        console.log('Options:');
        console.log('  --help, -h          Show this help message');
        console.log('  --verbose, -v       Show detailed output');
        console.log('  --hybrid            Use hybrid semantic + keyword routing');
        console.log('  --stats             Show cache statistics');
        console.log('  --rebuild-cache     Rebuild vector cache');
        console.log('');
        console.log('Examples:');
        console.log('  semantic-router.js "Deploy validation rules to production"');
        console.log('  semantic-router.js --hybrid "Create CPQ assessment report"');
        console.log('  semantic-router.js --stats');
        console.log('  semantic-router.js --rebuild-cache');
        process.exit(0);
    }

    const verbose = args.includes('--verbose') || args.includes('-v');
    const hybrid = args.includes('--hybrid');
    const stats = args.includes('--stats');
    const rebuildCache = args.includes('--rebuild-cache');

    try {
        const router = new SemanticRouter({ verbose });

        if (stats) {
            const statistics = router.getStats();
            console.log('Vector Cache Statistics:');
            console.log(JSON.stringify(statistics, null, 2));
            process.exit(0);
        }

        if (rebuildCache) {
            console.log('Rebuilding vector cache...');
            router.buildVectorCache();
            router.saveVectorCache();
            console.log('✓ Vector cache rebuilt successfully');
            process.exit(0);
        }

        // Get task description
        const taskDescription = args
            .filter(a => !a.startsWith('-'))
            .join(' ');

        if (!taskDescription) {
            console.error('Error: No task description provided');
            process.exit(1);
        }

        // Route the task
        let result;
        if (hybrid) {
            // Load keyword router for hybrid mode
            const { TaskRouter } = require('./task-router');
            const keywordRouter = new TaskRouter({ verbose: false });
            const keywordResult = keywordRouter.analyze(taskDescription);
            result = router.hybridRoute(taskDescription, keywordResult);
        } else {
            result = router.route(taskDescription);
        }

        console.log(router.format(result));

    } catch (error) {
        console.error(`Error: ${error.message}`);
        if (verbose) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

module.exports = { SemanticRouter };
