#!/usr/bin/env node
/**
 * Entity Resolution Graph - Graph-Based Entity Resolution
 *
 * Part of the RevOps Data Quality System.
 * Performs Phase 3 of multi-layer deduplication: graph-based transitive resolution.
 *
 * Features:
 * - Graph structure for representing potential matches
 * - Transitive closure computation (A≈B, B≈C → A,B,C cluster)
 * - Connected component detection for clustering
 * - Edge weighting and confidence propagation
 * - Conflict detection (contradictory evidence)
 * - Visualization export (DOT format)
 *
 * Usage:
 *   const { EntityResolutionGraph } = require('./entity-resolution-graph');
 *   const graph = new EntityResolutionGraph();
 *   graph.addMatch(record1Id, record2Id, score, 'domain');
 *   const clusters = graph.findClusters();
 */

/**
 * Edge class representing a match relationship between records
 */
class MatchEdge {
    constructor(sourceId, targetId, score, matchType, metadata = {}) {
        this.sourceId = sourceId;
        this.targetId = targetId;
        this.score = score;
        this.matchType = matchType;
        this.confidence = this.calculateConfidence(score, matchType);
        this.metadata = {
            createdAt: new Date().toISOString(),
            ...metadata
        };
        this.isTransitive = false;
    }

    calculateConfidence(score, matchType) {
        // Base confidence from score
        let confidence = score / 100;

        // Adjust based on match type reliability
        const typeMultipliers = {
            'salesforce_id': 1.0,
            'hubspot_id': 1.0,
            'email': 0.95,
            'duns_number': 0.98,
            'domain': 0.85,
            'name': 0.70,
            'phone': 0.60,
            'address': 0.65,
            'probabilistic': 0.75,
            'transitive': 0.50
        };

        return confidence * (typeMultipliers[matchType] || 0.70);
    }

    toJSON() {
        return {
            sourceId: this.sourceId,
            targetId: this.targetId,
            score: this.score,
            matchType: this.matchType,
            confidence: Math.round(this.confidence * 100) / 100,
            isTransitive: this.isTransitive,
            metadata: this.metadata
        };
    }
}

/**
 * Node class representing a record in the graph
 */
class RecordNode {
    constructor(id, record, source = 'unknown') {
        this.id = id;
        this.record = record;
        this.source = source;
        this.edges = new Map(); // targetId -> MatchEdge
        this.clusterId = null;
        this.metadata = {
            addedAt: new Date().toISOString()
        };
    }

    addEdge(edge) {
        const targetId = edge.sourceId === this.id ? edge.targetId : edge.sourceId;
        this.edges.set(targetId, edge);
    }

    getNeighbors() {
        return Array.from(this.edges.keys());
    }

    getEdge(targetId) {
        return this.edges.get(targetId);
    }

    toJSON() {
        return {
            id: this.id,
            source: this.source,
            clusterId: this.clusterId,
            edgeCount: this.edges.size,
            record: this.record,
            metadata: this.metadata
        };
    }
}

/**
 * Cluster class representing a group of matching records
 */
class ResolutionCluster {
    constructor(id) {
        this.id = id;
        this.nodeIds = new Set();
        this.edges = [];
        this.confidence = 0;
        this.metadata = {
            createdAt: new Date().toISOString()
        };
    }

    addNode(nodeId) {
        this.nodeIds.add(nodeId);
    }

    addEdge(edge) {
        this.edges.push(edge);
    }

    calculateConfidence() {
        if (this.edges.length === 0) {
            this.confidence = 0;
            return this.confidence;
        }

        // Weighted average of edge confidences
        const totalConfidence = this.edges.reduce((sum, e) => sum + e.confidence, 0);
        this.confidence = totalConfidence / this.edges.length;

        // Boost for multiple confirming matches
        const matchTypes = new Set(this.edges.map(e => e.matchType));
        if (matchTypes.size > 1) {
            this.confidence = Math.min(1.0, this.confidence * 1.1);
        }

        // Penalty for transitive-only connections
        const transitiveRatio = this.edges.filter(e => e.isTransitive).length / this.edges.length;
        if (transitiveRatio > 0.5) {
            this.confidence *= 0.9;
        }

        return this.confidence;
    }

    toJSON() {
        return {
            id: this.id,
            nodeCount: this.nodeIds.size,
            nodeIds: Array.from(this.nodeIds),
            confidence: Math.round(this.calculateConfidence() * 100) / 100,
            edgeCount: this.edges.length,
            edges: this.edges.map(e => e.toJSON()),
            matchTypes: [...new Set(this.edges.map(e => e.matchType))],
            hasTransitiveMatches: this.edges.some(e => e.isTransitive),
            metadata: this.metadata
        };
    }
}

/**
 * Entity Resolution Graph Class
 * Manages graph-based entity resolution with transitive closure
 */
class EntityResolutionGraph {
    constructor(options = {}) {
        this.nodes = new Map();      // nodeId -> RecordNode
        this.edges = new Map();      // edgeKey -> MatchEdge
        this.clusters = [];
        this.options = {
            minEdgeScore: options.minEdgeScore || 65,
            transitiveMinScore: options.transitiveMinScore || 75,
            transitiveDecay: options.transitiveDecay || 0.85,
            maxTransitiveDepth: options.maxTransitiveDepth || 3,
            conflictThreshold: options.conflictThreshold || 0.3,
            ...options
        };
        this.stats = this.initStats();
    }

    /**
     * Initialize statistics
     */
    initStats() {
        return {
            nodesAdded: 0,
            edgesAdded: 0,
            transitiveEdgesAdded: 0,
            clustersFound: 0,
            conflictsDetected: 0
        };
    }

    /**
     * Generate unique edge key
     */
    edgeKey(id1, id2) {
        return id1 < id2 ? `${id1}|${id2}` : `${id2}|${id1}`;
    }

    /**
     * Add a record node to the graph
     */
    addNode(id, record, source = 'unknown') {
        if (!this.nodes.has(id)) {
            this.nodes.set(id, new RecordNode(id, record, source));
            this.stats.nodesAdded++;
        }
        return this.nodes.get(id);
    }

    /**
     * Add a match edge between two records
     */
    addMatch(record1Id, record2Id, score, matchType, metadata = {}) {
        // Ensure score meets minimum
        if (score < this.options.minEdgeScore) return null;

        // Ensure nodes exist
        if (!this.nodes.has(record1Id)) {
            this.addNode(record1Id, { id: record1Id });
        }
        if (!this.nodes.has(record2Id)) {
            this.addNode(record2Id, { id: record2Id });
        }

        // Create edge
        const key = this.edgeKey(record1Id, record2Id);
        if (!this.edges.has(key)) {
            const edge = new MatchEdge(record1Id, record2Id, score, matchType, metadata);
            this.edges.set(key, edge);

            // Add to nodes
            this.nodes.get(record1Id).addEdge(edge);
            this.nodes.get(record2Id).addEdge(edge);

            this.stats.edgesAdded++;
            return edge;
        }

        // If edge exists, update if new score is higher
        const existingEdge = this.edges.get(key);
        if (score > existingEdge.score) {
            existingEdge.score = score;
            existingEdge.matchType = matchType;
            existingEdge.confidence = existingEdge.calculateConfidence(score, matchType);
        }

        return existingEdge;
    }

    /**
     * Compute transitive closure (find implied matches)
     * If A matches B and B matches C, then A might match C
     */
    resolveTransitive() {
        const addedEdges = [];
        const visited = new Set();

        // For each node, find transitive matches via BFS
        for (const [startId, startNode] of this.nodes) {
            visited.clear();
            visited.add(startId);

            // BFS to find nodes within maxTransitiveDepth hops
            const queue = [{ id: startId, depth: 0, pathScore: 1.0 }];

            while (queue.length > 0) {
                const { id, depth, pathScore } = queue.shift();

                if (depth >= this.options.maxTransitiveDepth) continue;

                const node = this.nodes.get(id);
                for (const neighborId of node.getNeighbors()) {
                    if (visited.has(neighborId)) continue;
                    visited.add(neighborId);

                    const edge = node.getEdge(neighborId);
                    const newPathScore = pathScore * edge.confidence * this.options.transitiveDecay;

                    // Add to queue for further exploration
                    queue.push({
                        id: neighborId,
                        depth: depth + 1,
                        pathScore: newPathScore
                    });

                    // Check if we should create a transitive edge
                    if (depth >= 1) { // Only create transitive edges for depth > 1
                        const transitiveScore = newPathScore * 100;
                        const existingKey = this.edgeKey(startId, neighborId);

                        if (transitiveScore >= this.options.transitiveMinScore && !this.edges.has(existingKey)) {
                            const transitiveEdge = new MatchEdge(
                                startId,
                                neighborId,
                                transitiveScore,
                                'transitive',
                                { originalDepth: depth + 1 }
                            );
                            transitiveEdge.isTransitive = true;

                            this.edges.set(existingKey, transitiveEdge);
                            this.nodes.get(startId).addEdge(transitiveEdge);
                            this.nodes.get(neighborId).addEdge(transitiveEdge);

                            addedEdges.push(transitiveEdge);
                            this.stats.transitiveEdgesAdded++;
                        }
                    }
                }
            }
        }

        return addedEdges;
    }

    /**
     * Find connected components (clusters) in the graph
     */
    findClusters() {
        this.clusters = [];
        const visited = new Set();
        let clusterId = 0;

        // DFS to find connected components
        for (const [nodeId, node] of this.nodes) {
            if (visited.has(nodeId)) continue;

            const cluster = new ResolutionCluster(`cluster-${++clusterId}`);
            const stack = [nodeId];

            while (stack.length > 0) {
                const currentId = stack.pop();
                if (visited.has(currentId)) continue;
                visited.add(currentId);

                cluster.addNode(currentId);
                const currentNode = this.nodes.get(currentId);
                currentNode.clusterId = cluster.id;

                // Add edges within cluster
                for (const [neighborId, edge] of currentNode.edges) {
                    if (cluster.nodeIds.has(neighborId) || !visited.has(neighborId)) {
                        // Only add edge once per cluster
                        const edgeKey = this.edgeKey(currentId, neighborId);
                        if (!cluster.edges.find(e => this.edgeKey(e.sourceId, e.targetId) === edgeKey)) {
                            cluster.addEdge(edge);
                        }
                    }
                    if (!visited.has(neighborId)) {
                        stack.push(neighborId);
                    }
                }
            }

            // Only keep clusters with more than one node (actual duplicates)
            if (cluster.nodeIds.size > 1) {
                cluster.calculateConfidence();
                this.clusters.push(cluster);
            }
        }

        this.stats.clustersFound = this.clusters.length;
        return this.clusters.map(c => c.toJSON());
    }

    /**
     * Detect conflicts (contradictory evidence)
     * e.g., A and B match, but have conflicting external IDs
     */
    detectConflicts() {
        const conflicts = [];

        for (const cluster of this.clusters) {
            const clusterConflicts = this.analyzeClusterConflicts(cluster);
            if (clusterConflicts.length > 0) {
                conflicts.push({
                    clusterId: cluster.id,
                    conflicts: clusterConflicts
                });
                this.stats.conflictsDetected += clusterConflicts.length;
            }
        }

        return conflicts;
    }

    /**
     * Analyze a single cluster for conflicts
     */
    analyzeClusterConflicts(cluster) {
        const conflicts = [];
        const nodeIds = Array.from(cluster.nodeIds);

        // Check for conflicting external IDs
        const externalIds = ['salesforce_id', 'hubspot_id', 'duns_number', 'ein'];

        for (const idField of externalIds) {
            const values = new Map();

            for (const nodeId of nodeIds) {
                const node = this.nodes.get(nodeId);
                const record = node.record;
                const value = this.extractId(record, idField);

                if (value) {
                    if (!values.has(idField)) {
                        values.set(idField, new Map());
                    }
                    const fieldValues = values.get(idField);
                    if (!fieldValues.has(value)) {
                        fieldValues.set(value, []);
                    }
                    fieldValues.get(value).push(nodeId);
                }
            }

            // Check for conflicts (multiple different values)
            for (const [field, fieldValues] of values) {
                if (fieldValues.size > 1) {
                    conflicts.push({
                        type: 'external_id_conflict',
                        field,
                        values: Array.from(fieldValues.entries()).map(([v, nodes]) => ({
                            value: v,
                            nodeIds: nodes
                        })),
                        severity: 'high'
                    });
                }
            }
        }

        return conflicts;
    }

    /**
     * Extract ID field from record
     */
    extractId(record, field) {
        const variations = {
            salesforce_id: ['salesforce_id', 'salesforceaccountid', 'sf_id', 'Id'],
            hubspot_id: ['hubspot_id', 'hs_object_id', 'id'],
            duns_number: ['duns_number', 'duns', 'DUNSNumber__c'],
            ein: ['ein', 'tax_id', 'EIN__c']
        };

        const fields = variations[field] || [field];
        for (const f of fields) {
            if (record[f]) return String(record[f]);
            if (record.properties?.[f]) return String(record.properties[f]);
        }
        return null;
    }

    /**
     * Get records for a cluster
     */
    getClusterRecords(clusterId) {
        const cluster = this.clusters.find(c => c.id === clusterId);
        if (!cluster) return [];

        return Array.from(cluster.nodeIds).map(id => {
            const node = this.nodes.get(id);
            return {
                id,
                record: node.record,
                source: node.source
            };
        });
    }

    /**
     * Merge deterministic and probabilistic matches into graph
     */
    importMatches(matches, matchType) {
        for (const match of matches) {
            if (match.clusters) {
                // Import from deterministic/probabilistic matcher output
                for (const cluster of match.clusters) {
                    const records = cluster.records || [];
                    for (let i = 0; i < records.length; i++) {
                        for (let j = i + 1; j < records.length; j++) {
                            const r1 = records[i].record || records[i];
                            const r2 = records[j].record || records[j];
                            const id1 = r1.id || r1.Id || `record-${i}`;
                            const id2 = r2.id || r2.Id || `record-${j}`;

                            this.addNode(id1, r1, records[i].source || 'unknown');
                            this.addNode(id2, r2, records[j].source || 'unknown');
                            this.addMatch(id1, id2, cluster.confidence || cluster.score || 80, matchType);
                        }
                    }
                }
            } else if (match.record1Index !== undefined) {
                // Import from pair-based output
                this.addMatch(
                    String(match.record1Index),
                    String(match.record2Index),
                    match.score,
                    matchType
                );
            }
        }
    }

    /**
     * Export graph to DOT format for visualization
     */
    toDOT() {
        let dot = 'graph EntityResolution {\n';
        dot += '  graph [overlap=false, splines=true];\n';
        dot += '  node [shape=box, style=filled];\n\n';

        // Add nodes with cluster coloring
        const clusterColors = ['#e6f3ff', '#ffe6e6', '#e6ffe6', '#fff3e6', '#f3e6ff'];
        const nodeCluster = new Map();

        this.clusters.forEach((cluster, idx) => {
            const color = clusterColors[idx % clusterColors.length];
            cluster.nodeIds.forEach(nodeId => {
                nodeCluster.set(nodeId, { color, clusterId: cluster.id });
            });
        });

        for (const [nodeId, node] of this.nodes) {
            const clusterInfo = nodeCluster.get(nodeId);
            const color = clusterInfo?.color || '#ffffff';
            const label = this.getNodeLabel(node);
            dot += `  "${nodeId}" [label="${label}", fillcolor="${color}"];\n`;
        }

        dot += '\n';

        // Add edges
        for (const [key, edge] of this.edges) {
            const style = edge.isTransitive ? 'dashed' : 'solid';
            const penwidth = Math.max(1, Math.min(5, edge.score / 25));
            dot += `  "${edge.sourceId}" -- "${edge.targetId}" [`;
            dot += `label="${edge.matchType}\\n${Math.round(edge.score)}%", `;
            dot += `style=${style}, penwidth=${penwidth}`;
            dot += '];\n';
        }

        dot += '}\n';
        return dot;
    }

    /**
     * Get display label for a node
     */
    getNodeLabel(node) {
        const record = node.record;
        const name = record.name || record.account_name || record.Name || record.id;
        return String(name).replace(/"/g, '\\"').substring(0, 30);
    }

    /**
     * Get graph statistics
     */
    getStats() {
        return {
            ...this.stats,
            totalNodes: this.nodes.size,
            totalEdges: this.edges.size,
            totalClusters: this.clusters.length,
            averageClusterSize: this.clusters.length > 0
                ? this.clusters.reduce((sum, c) => sum + c.nodeIds.size, 0) / this.clusters.length
                : 0,
            maxClusterSize: this.clusters.length > 0
                ? Math.max(...this.clusters.map(c => c.nodeIds.size))
                : 0
        };
    }

    /**
     * Full resolution pipeline
     */
    resolve() {
        // Step 1: Compute transitive closure
        const transitiveEdges = this.resolveTransitive();

        // Step 2: Find clusters
        const clusters = this.findClusters();

        // Step 3: Detect conflicts
        const conflicts = this.detectConflicts();

        return {
            clusters,
            conflicts,
            transitiveEdgesAdded: transitiveEdges.length,
            stats: this.getStats()
        };
    }
}

// CLI Usage
if (require.main === module) {
    const fs = require('fs');
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help')) {
        console.log(`
Entity Resolution Graph - Graph-Based Clustering

Usage:
  node entity-resolution-graph.js <matches-file> [options]

Options:
  --output <file>           Output file path (default: stdout)
  --format <format>         Output format: json, dot (default: json)
  --min-score <n>           Minimum edge score (default: 65)
  --transitive-min <n>      Minimum transitive score (default: 75)
  --max-depth <n>           Max transitive depth (default: 3)
  --no-transitive           Disable transitive resolution

Examples:
  node entity-resolution-graph.js matches.json --output clusters.json
  node entity-resolution-graph.js matches.json --format dot > graph.dot
        `);
        process.exit(0);
    }

    const matchesFile = args[0];

    if (!fs.existsSync(matchesFile)) {
        console.error(`❌ Matches file not found: ${matchesFile}`);
        process.exit(1);
    }

    // Parse options
    const options = {
        output: null,
        format: 'json',
        minEdgeScore: 65,
        transitiveMinScore: 75,
        maxTransitiveDepth: 3,
        enableTransitive: true
    };

    for (let i = 1; i < args.length; i++) {
        switch (args[i]) {
            case '--output':
                options.output = args[++i];
                break;
            case '--format':
                options.format = args[++i];
                break;
            case '--min-score':
                options.minEdgeScore = parseInt(args[++i], 10);
                break;
            case '--transitive-min':
                options.transitiveMinScore = parseInt(args[++i], 10);
                break;
            case '--max-depth':
                options.maxTransitiveDepth = parseInt(args[++i], 10);
                break;
            case '--no-transitive':
                options.enableTransitive = false;
                break;
        }
    }

    try {
        console.log('📋 Loading matches...');
        const matches = JSON.parse(fs.readFileSync(matchesFile, 'utf8'));

        const graph = new EntityResolutionGraph({
            minEdgeScore: options.minEdgeScore,
            transitiveMinScore: options.transitiveMinScore,
            maxTransitiveDepth: options.maxTransitiveDepth
        });

        // Import matches
        console.log('🔍 Building graph...');
        graph.importMatches(matches, 'imported');

        // Resolve
        console.log('⚙️  Resolving entities...');
        let results;
        if (options.enableTransitive) {
            results = graph.resolve();
        } else {
            results = {
                clusters: graph.findClusters(),
                conflicts: graph.detectConflicts(),
                stats: graph.getStats()
            };
        }

        // Format output
        let output;
        if (options.format === 'dot') {
            output = graph.toDOT();
        } else {
            output = JSON.stringify(results, null, 2);
        }

        // Output
        if (options.output) {
            fs.writeFileSync(options.output, output);
            console.log(`\n✅ Results written to: ${options.output}`);
        } else {
            console.log('\n📊 Results:');
            console.log(output);
        }

        // Print summary
        console.log('\n📈 Summary:');
        console.log(`   Nodes: ${results.stats.totalNodes}`);
        console.log(`   Edges: ${results.stats.totalEdges}`);
        console.log(`   Clusters: ${results.stats.totalClusters}`);
        console.log(`   Transitive edges: ${results.stats.transitiveEdgesAdded}`);
        console.log(`   Conflicts: ${results.conflicts.length}`);

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (error.stack) {
            console.error('\nStack trace:');
            console.error(error.stack);
        }
        process.exit(1);
    }
}

module.exports = { EntityResolutionGraph, RecordNode, MatchEdge, ResolutionCluster };
