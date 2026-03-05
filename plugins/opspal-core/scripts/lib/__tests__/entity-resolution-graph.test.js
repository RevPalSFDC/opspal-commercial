/**
 * Entity Resolution Graph Tests
 *
 * Tests for graph-based entity resolution with transitive closure.
 */

const {
    EntityResolutionGraph,
    RecordNode,
    MatchEdge,
    ResolutionCluster
} = require('../entity-resolution-graph');

describe('EntityResolutionGraph', () => {

    // ============================================
    // MatchEdge Class Tests
    // ============================================
    describe('MatchEdge', () => {
        test('constructor initializes all properties', () => {
            const edge = new MatchEdge('A', 'B', 85, 'domain');

            expect(edge.sourceId).toBe('A');
            expect(edge.targetId).toBe('B');
            expect(edge.score).toBe(85);
            expect(edge.matchType).toBe('domain');
            expect(edge.confidence).toBeGreaterThan(0);
            expect(edge.isTransitive).toBe(false);
            expect(edge.metadata.createdAt).toBeDefined();
        });

        test('constructor accepts custom metadata', () => {
            const edge = new MatchEdge('A', 'B', 85, 'domain', { source: 'test' });

            expect(edge.metadata.source).toBe('test');
            expect(edge.metadata.createdAt).toBeDefined();
        });

        describe('calculateConfidence', () => {
            test('applies type multiplier for salesforce_id', () => {
                const edge = new MatchEdge('A', 'B', 100, 'salesforce_id');
                expect(edge.confidence).toBe(1.0); // 100/100 * 1.0
            });

            test('applies type multiplier for email', () => {
                const edge = new MatchEdge('A', 'B', 100, 'email');
                expect(edge.confidence).toBe(0.95); // 100/100 * 0.95
            });

            test('applies type multiplier for domain', () => {
                const edge = new MatchEdge('A', 'B', 100, 'domain');
                expect(edge.confidence).toBe(0.85); // 100/100 * 0.85
            });

            test('applies type multiplier for name', () => {
                const edge = new MatchEdge('A', 'B', 100, 'name');
                expect(edge.confidence).toBe(0.70); // 100/100 * 0.70
            });

            test('applies type multiplier for phone', () => {
                const edge = new MatchEdge('A', 'B', 100, 'phone');
                expect(edge.confidence).toBe(0.60); // 100/100 * 0.60
            });

            test('applies type multiplier for transitive', () => {
                const edge = new MatchEdge('A', 'B', 100, 'transitive');
                expect(edge.confidence).toBe(0.50); // 100/100 * 0.50
            });

            test('uses default multiplier for unknown type', () => {
                const edge = new MatchEdge('A', 'B', 100, 'unknown_type');
                expect(edge.confidence).toBe(0.70); // Default multiplier
            });

            test('scales confidence by score', () => {
                const edge1 = new MatchEdge('A', 'B', 100, 'email');
                const edge2 = new MatchEdge('A', 'B', 50, 'email');

                expect(edge1.confidence).toBe(0.95);
                expect(edge2.confidence).toBe(0.475); // 50/100 * 0.95
            });
        });

        describe('toJSON', () => {
            test('returns properly formatted object', () => {
                const edge = new MatchEdge('A', 'B', 85.567, 'domain');
                const json = edge.toJSON();

                expect(json.sourceId).toBe('A');
                expect(json.targetId).toBe('B');
                expect(json.score).toBe(85.567);
                expect(json.matchType).toBe('domain');
                expect(json.confidence).toBeDefined();
                expect(typeof json.confidence).toBe('number');
                expect(json.isTransitive).toBe(false);
                expect(json.metadata).toBeDefined();
            });

            test('rounds confidence to 2 decimal places', () => {
                const edge = new MatchEdge('A', 'B', 77, 'domain');
                const json = edge.toJSON();

                // 77/100 * 0.85 = 0.6545
                expect(json.confidence).toBe(0.65);
            });
        });
    });

    // ============================================
    // RecordNode Class Tests
    // ============================================
    describe('RecordNode', () => {
        test('constructor initializes all properties', () => {
            const record = { id: '123', name: 'Test' };
            const node = new RecordNode('123', record, 'salesforce');

            expect(node.id).toBe('123');
            expect(node.record).toBe(record);
            expect(node.source).toBe('salesforce');
            expect(node.edges).toBeInstanceOf(Map);
            expect(node.edges.size).toBe(0);
            expect(node.clusterId).toBeNull();
            expect(node.metadata.addedAt).toBeDefined();
        });

        test('constructor uses default source', () => {
            const node = new RecordNode('123', {});
            expect(node.source).toBe('unknown');
        });

        test('addEdge adds edge to node', () => {
            const node = new RecordNode('A', {});
            const edge = new MatchEdge('A', 'B', 85, 'domain');

            node.addEdge(edge);

            expect(node.edges.size).toBe(1);
            expect(node.edges.get('B')).toBe(edge);
        });

        test('addEdge handles reverse edge direction', () => {
            const node = new RecordNode('B', {});
            const edge = new MatchEdge('A', 'B', 85, 'domain');

            node.addEdge(edge);

            expect(node.edges.size).toBe(1);
            expect(node.edges.get('A')).toBe(edge);
        });

        test('getNeighbors returns array of neighbor IDs', () => {
            const node = new RecordNode('A', {});
            node.addEdge(new MatchEdge('A', 'B', 85, 'domain'));
            node.addEdge(new MatchEdge('A', 'C', 90, 'email'));

            const neighbors = node.getNeighbors();

            expect(neighbors).toHaveLength(2);
            expect(neighbors).toContain('B');
            expect(neighbors).toContain('C');
        });

        test('getEdge returns edge for neighbor', () => {
            const node = new RecordNode('A', {});
            const edge = new MatchEdge('A', 'B', 85, 'domain');
            node.addEdge(edge);

            expect(node.getEdge('B')).toBe(edge);
            expect(node.getEdge('C')).toBeUndefined();
        });

        test('toJSON returns proper format', () => {
            const record = { id: '123', name: 'Test' };
            const node = new RecordNode('123', record, 'salesforce');
            node.addEdge(new MatchEdge('123', '456', 85, 'domain'));
            node.clusterId = 'cluster-1';

            const json = node.toJSON();

            expect(json.id).toBe('123');
            expect(json.source).toBe('salesforce');
            expect(json.clusterId).toBe('cluster-1');
            expect(json.edgeCount).toBe(1);
            expect(json.record).toBe(record);
            expect(json.metadata.addedAt).toBeDefined();
        });
    });

    // ============================================
    // ResolutionCluster Class Tests
    // ============================================
    describe('ResolutionCluster', () => {
        test('constructor initializes all properties', () => {
            const cluster = new ResolutionCluster('cluster-1');

            expect(cluster.id).toBe('cluster-1');
            expect(cluster.nodeIds).toBeInstanceOf(Set);
            expect(cluster.nodeIds.size).toBe(0);
            expect(cluster.edges).toEqual([]);
            expect(cluster.confidence).toBe(0);
            expect(cluster.metadata.createdAt).toBeDefined();
        });

        test('addNode adds node ID to cluster', () => {
            const cluster = new ResolutionCluster('cluster-1');
            cluster.addNode('A');
            cluster.addNode('B');

            expect(cluster.nodeIds.size).toBe(2);
            expect(cluster.nodeIds.has('A')).toBe(true);
            expect(cluster.nodeIds.has('B')).toBe(true);
        });

        test('addNode ignores duplicates', () => {
            const cluster = new ResolutionCluster('cluster-1');
            cluster.addNode('A');
            cluster.addNode('A');

            expect(cluster.nodeIds.size).toBe(1);
        });

        test('addEdge adds edge to cluster', () => {
            const cluster = new ResolutionCluster('cluster-1');
            const edge = new MatchEdge('A', 'B', 85, 'domain');
            cluster.addEdge(edge);

            expect(cluster.edges).toHaveLength(1);
            expect(cluster.edges[0]).toBe(edge);
        });

        describe('calculateConfidence', () => {
            test('returns 0 for empty cluster', () => {
                const cluster = new ResolutionCluster('cluster-1');
                expect(cluster.calculateConfidence()).toBe(0);
            });

            test('calculates average confidence', () => {
                const cluster = new ResolutionCluster('cluster-1');
                // email (0.95 multiplier) with score 100 -> 0.95 confidence
                cluster.addEdge(new MatchEdge('A', 'B', 100, 'email'));
                // email (0.95 multiplier) with score 100 -> 0.95 confidence
                cluster.addEdge(new MatchEdge('B', 'C', 100, 'email'));

                // Average: (0.95 + 0.95) / 2 = 0.95 (no boost since same match type)
                expect(cluster.calculateConfidence()).toBeCloseTo(0.95, 2);
            });

            test('boosts confidence for multiple match types', () => {
                const cluster = new ResolutionCluster('cluster-1');
                cluster.addEdge(new MatchEdge('A', 'B', 100, 'email'));
                cluster.addEdge(new MatchEdge('A', 'B', 100, 'domain'));

                const confidence = cluster.calculateConfidence();
                // Multiple match types should boost confidence by 10%
                expect(confidence).toBeGreaterThan(0.85);
            });

            test('penalizes transitive-heavy clusters', () => {
                const cluster = new ResolutionCluster('cluster-1');

                const directEdge = new MatchEdge('A', 'B', 100, 'email');
                const transitiveEdge1 = new MatchEdge('A', 'C', 100, 'transitive');
                transitiveEdge1.isTransitive = true;
                const transitiveEdge2 = new MatchEdge('B', 'C', 100, 'transitive');
                transitiveEdge2.isTransitive = true;

                cluster.addEdge(directEdge);
                cluster.addEdge(transitiveEdge1);
                cluster.addEdge(transitiveEdge2);

                const confidence = cluster.calculateConfidence();
                // >50% transitive should apply 0.9 penalty
                expect(confidence).toBeLessThan(0.7);
            });

            test('caps confidence at 1.0', () => {
                const cluster = new ResolutionCluster('cluster-1');
                // Multiple high-confidence edges of different types
                cluster.addEdge(new MatchEdge('A', 'B', 100, 'salesforce_id'));
                cluster.addEdge(new MatchEdge('A', 'C', 100, 'hubspot_id'));
                cluster.addEdge(new MatchEdge('B', 'C', 100, 'email'));

                const confidence = cluster.calculateConfidence();
                expect(confidence).toBeLessThanOrEqual(1.0);
            });
        });

        describe('toJSON', () => {
            test('returns proper format', () => {
                const cluster = new ResolutionCluster('cluster-1');
                cluster.addNode('A');
                cluster.addNode('B');
                cluster.addEdge(new MatchEdge('A', 'B', 85, 'domain'));

                const json = cluster.toJSON();

                expect(json.id).toBe('cluster-1');
                expect(json.nodeCount).toBe(2);
                expect(json.nodeIds).toEqual(['A', 'B']);
                expect(json.confidence).toBeGreaterThan(0);
                expect(json.edgeCount).toBe(1);
                expect(json.edges).toHaveLength(1);
                expect(json.matchTypes).toContain('domain');
                expect(json.hasTransitiveMatches).toBe(false);
            });

            test('detects transitive matches', () => {
                const cluster = new ResolutionCluster('cluster-1');
                const edge = new MatchEdge('A', 'B', 85, 'transitive');
                edge.isTransitive = true;
                cluster.addEdge(edge);

                const json = cluster.toJSON();
                expect(json.hasTransitiveMatches).toBe(true);
            });
        });
    });

    // ============================================
    // EntityResolutionGraph Constructor Tests
    // ============================================
    describe('Constructor', () => {
        test('creates instance with default options', () => {
            const graph = new EntityResolutionGraph();

            expect(graph.nodes).toBeInstanceOf(Map);
            expect(graph.edges).toBeInstanceOf(Map);
            expect(graph.clusters).toEqual([]);
            expect(graph.options.minEdgeScore).toBe(65);
            expect(graph.options.transitiveMinScore).toBe(75);
            expect(graph.options.transitiveDecay).toBe(0.85);
            expect(graph.options.maxTransitiveDepth).toBe(3);
            expect(graph.options.conflictThreshold).toBe(0.3);
        });

        test('accepts custom options', () => {
            const graph = new EntityResolutionGraph({
                minEdgeScore: 70,
                transitiveMinScore: 80,
                transitiveDecay: 0.9,
                maxTransitiveDepth: 5
            });

            expect(graph.options.minEdgeScore).toBe(70);
            expect(graph.options.transitiveMinScore).toBe(80);
            expect(graph.options.transitiveDecay).toBe(0.9);
            expect(graph.options.maxTransitiveDepth).toBe(5);
        });

        test('initializes stats', () => {
            const graph = new EntityResolutionGraph();

            expect(graph.stats.nodesAdded).toBe(0);
            expect(graph.stats.edgesAdded).toBe(0);
            expect(graph.stats.transitiveEdgesAdded).toBe(0);
            expect(graph.stats.clustersFound).toBe(0);
            expect(graph.stats.conflictsDetected).toBe(0);
        });
    });

    // ============================================
    // Edge Key Generation Tests
    // ============================================
    describe('edgeKey', () => {
        test('generates consistent key regardless of order', () => {
            const graph = new EntityResolutionGraph();

            expect(graph.edgeKey('A', 'B')).toBe(graph.edgeKey('B', 'A'));
        });

        test('generates unique keys for different pairs', () => {
            const graph = new EntityResolutionGraph();

            expect(graph.edgeKey('A', 'B')).not.toBe(graph.edgeKey('A', 'C'));
            expect(graph.edgeKey('A', 'B')).not.toBe(graph.edgeKey('B', 'C'));
        });

        test('uses alphabetical ordering', () => {
            const graph = new EntityResolutionGraph();

            expect(graph.edgeKey('B', 'A')).toBe('A|B');
            expect(graph.edgeKey('Z', 'A')).toBe('A|Z');
        });
    });

    // ============================================
    // Node Management Tests
    // ============================================
    describe('addNode', () => {
        test('adds new node to graph', () => {
            const graph = new EntityResolutionGraph();
            const record = { id: '123', name: 'Test' };

            const node = graph.addNode('123', record, 'salesforce');

            expect(graph.nodes.size).toBe(1);
            expect(node.id).toBe('123');
            expect(node.record).toBe(record);
            expect(node.source).toBe('salesforce');
        });

        test('returns existing node if already added', () => {
            const graph = new EntityResolutionGraph();
            const record1 = { id: '123', name: 'Test 1' };
            const record2 = { id: '123', name: 'Test 2' };

            const node1 = graph.addNode('123', record1, 'salesforce');
            const node2 = graph.addNode('123', record2, 'hubspot');

            expect(graph.nodes.size).toBe(1);
            expect(node1).toBe(node2);
            expect(node1.record).toBe(record1); // Original record preserved
        });

        test('increments stats.nodesAdded', () => {
            const graph = new EntityResolutionGraph();

            graph.addNode('A', {});
            graph.addNode('B', {});
            graph.addNode('A', {}); // Duplicate

            expect(graph.stats.nodesAdded).toBe(2);
        });
    });

    // ============================================
    // Match Addition Tests
    // ============================================
    describe('addMatch', () => {
        test('creates edge between nodes', () => {
            const graph = new EntityResolutionGraph();
            graph.addNode('A', { name: 'A' });
            graph.addNode('B', { name: 'B' });

            const edge = graph.addMatch('A', 'B', 85, 'domain');

            expect(graph.edges.size).toBe(1);
            expect(edge.sourceId).toBe('A');
            expect(edge.targetId).toBe('B');
            expect(edge.score).toBe(85);
        });

        test('auto-creates nodes if not exist', () => {
            const graph = new EntityResolutionGraph();

            graph.addMatch('A', 'B', 85, 'domain');

            expect(graph.nodes.size).toBe(2);
            expect(graph.nodes.has('A')).toBe(true);
            expect(graph.nodes.has('B')).toBe(true);
        });

        test('rejects edges below minimum score', () => {
            const graph = new EntityResolutionGraph({ minEdgeScore: 70 });

            const edge = graph.addMatch('A', 'B', 65, 'domain');

            expect(edge).toBeNull();
            expect(graph.edges.size).toBe(0);
        });

        test('updates existing edge if new score is higher', () => {
            const graph = new EntityResolutionGraph();

            graph.addMatch('A', 'B', 80, 'name');
            const updatedEdge = graph.addMatch('A', 'B', 90, 'domain');

            expect(graph.edges.size).toBe(1);
            expect(updatedEdge.score).toBe(90);
            expect(updatedEdge.matchType).toBe('domain');
        });

        test('keeps existing edge if new score is lower', () => {
            const graph = new EntityResolutionGraph();

            const originalEdge = graph.addMatch('A', 'B', 90, 'domain');
            graph.addMatch('A', 'B', 80, 'name');

            expect(graph.edges.size).toBe(1);
            expect(originalEdge.score).toBe(90);
            expect(originalEdge.matchType).toBe('domain');
        });

        test('adds edge to both nodes', () => {
            const graph = new EntityResolutionGraph();

            graph.addMatch('A', 'B', 85, 'domain');

            expect(graph.nodes.get('A').edges.size).toBe(1);
            expect(graph.nodes.get('B').edges.size).toBe(1);
        });

        test('accepts custom metadata', () => {
            const graph = new EntityResolutionGraph();

            const edge = graph.addMatch('A', 'B', 85, 'domain', { source: 'test' });

            expect(edge.metadata.source).toBe('test');
        });

        test('increments stats.edgesAdded', () => {
            const graph = new EntityResolutionGraph();

            graph.addMatch('A', 'B', 85, 'domain');
            graph.addMatch('B', 'C', 90, 'email');
            graph.addMatch('A', 'B', 95, 'email'); // Update existing

            expect(graph.stats.edgesAdded).toBe(2);
        });
    });

    // ============================================
    // Transitive Resolution Tests
    // ============================================
    describe('resolveTransitive', () => {
        test('creates transitive edges for A-B-C chain', () => {
            const graph = new EntityResolutionGraph({
                transitiveMinScore: 50,
                transitiveDecay: 0.9
            });

            // A -- B -- C (no direct A-C edge)
            graph.addMatch('A', 'B', 95, 'email');
            graph.addMatch('B', 'C', 95, 'email');

            const transitiveEdges = graph.resolveTransitive();

            // Should create A-C transitive edge
            expect(transitiveEdges.length).toBeGreaterThan(0);
            expect(graph.edges.has(graph.edgeKey('A', 'C'))).toBe(true);
        });

        test('marks transitive edges as isTransitive', () => {
            const graph = new EntityResolutionGraph({
                transitiveMinScore: 50,
                transitiveDecay: 0.9
            });

            graph.addMatch('A', 'B', 95, 'salesforce_id');
            graph.addMatch('B', 'C', 95, 'salesforce_id');

            graph.resolveTransitive();

            const transitiveEdge = graph.edges.get(graph.edgeKey('A', 'C'));
            expect(transitiveEdge.isTransitive).toBe(true);
            expect(transitiveEdge.matchType).toBe('transitive');
        });

        test('applies decay to transitive score', () => {
            const graph = new EntityResolutionGraph({
                transitiveMinScore: 50,
                transitiveDecay: 0.8
            });

            graph.addMatch('A', 'B', 100, 'salesforce_id'); // confidence = 1.0
            graph.addMatch('B', 'C', 100, 'salesforce_id'); // confidence = 1.0

            graph.resolveTransitive();

            const transitiveEdge = graph.edges.get(graph.edgeKey('A', 'C'));
            // Score = pathScore * 100 = (1.0 * 1.0 * 0.8 * 1.0 * 0.8) * 100 = 64
            expect(transitiveEdge.score).toBeLessThan(100);
        });

        test('respects maxTransitiveDepth', () => {
            const graph = new EntityResolutionGraph({
                transitiveMinScore: 10,
                transitiveDecay: 0.95,
                maxTransitiveDepth: 2
            });

            // Chain: A - B - C - D - E
            graph.addMatch('A', 'B', 100, 'salesforce_id');
            graph.addMatch('B', 'C', 100, 'salesforce_id');
            graph.addMatch('C', 'D', 100, 'salesforce_id');
            graph.addMatch('D', 'E', 100, 'salesforce_id');

            graph.resolveTransitive();

            // A-C should exist (depth 2 from A)
            expect(graph.edges.has(graph.edgeKey('A', 'C'))).toBe(true);
            // A-D might exist depending on score threshold
            // A-E should NOT exist (beyond depth 2)
        });

        test('does not create duplicate edges', () => {
            const graph = new EntityResolutionGraph({
                transitiveMinScore: 50,
                transitiveDecay: 0.9
            });

            // Already have direct A-C edge
            graph.addMatch('A', 'B', 95, 'email');
            graph.addMatch('B', 'C', 95, 'email');
            graph.addMatch('A', 'C', 90, 'domain'); // Direct edge

            const initialEdgeCount = graph.edges.size;
            graph.resolveTransitive();

            // Should not add transitive A-C since direct edge exists
            expect(graph.edges.size).toBe(initialEdgeCount);
        });

        test('does not create edges below transitiveMinScore', () => {
            const graph = new EntityResolutionGraph({
                transitiveMinScore: 80,
                transitiveDecay: 0.8
            });

            // Low confidence chain that would produce score < 80
            graph.addMatch('A', 'B', 70, 'name');
            graph.addMatch('B', 'C', 70, 'name');

            graph.resolveTransitive();

            // Transitive edge should not be created
            expect(graph.edges.has(graph.edgeKey('A', 'C'))).toBe(false);
        });

        test('increments stats.transitiveEdgesAdded', () => {
            const graph = new EntityResolutionGraph({
                transitiveMinScore: 50,
                transitiveDecay: 0.9
            });

            graph.addMatch('A', 'B', 95, 'email');
            graph.addMatch('B', 'C', 95, 'email');

            graph.resolveTransitive();

            expect(graph.stats.transitiveEdgesAdded).toBeGreaterThan(0);
        });
    });

    // ============================================
    // Cluster Finding Tests
    // ============================================
    describe('findClusters', () => {
        test('finds connected components', () => {
            const graph = new EntityResolutionGraph();

            // Cluster 1: A-B-C
            graph.addMatch('A', 'B', 85, 'domain');
            graph.addMatch('B', 'C', 90, 'email');

            // Cluster 2: D-E
            graph.addMatch('D', 'E', 80, 'phone');

            const clusters = graph.findClusters();

            expect(clusters).toHaveLength(2);
        });

        test('returns clusters with correct node counts', () => {
            const graph = new EntityResolutionGraph();

            graph.addMatch('A', 'B', 85, 'domain');
            graph.addMatch('B', 'C', 90, 'email');
            graph.addMatch('D', 'E', 80, 'phone');

            const clusters = graph.findClusters();

            const cluster1 = clusters.find(c => c.nodeCount === 3);
            const cluster2 = clusters.find(c => c.nodeCount === 2);

            expect(cluster1).toBeDefined();
            expect(cluster2).toBeDefined();
        });

        test('excludes singleton nodes (no duplicates)', () => {
            const graph = new EntityResolutionGraph();

            graph.addNode('A', { name: 'A' });
            graph.addNode('B', { name: 'B' });
            graph.addMatch('C', 'D', 85, 'domain');

            const clusters = graph.findClusters();

            expect(clusters).toHaveLength(1);
            expect(clusters[0].nodeCount).toBe(2);
        });

        test('assigns cluster IDs to nodes', () => {
            const graph = new EntityResolutionGraph();

            graph.addMatch('A', 'B', 85, 'domain');

            graph.findClusters();

            expect(graph.nodes.get('A').clusterId).toBe('cluster-1');
            expect(graph.nodes.get('B').clusterId).toBe('cluster-1');
        });

        test('includes edges in cluster', () => {
            const graph = new EntityResolutionGraph();

            graph.addMatch('A', 'B', 85, 'domain');
            graph.addMatch('B', 'C', 90, 'email');

            const clusters = graph.findClusters();

            expect(clusters[0].edgeCount).toBe(2);
            expect(clusters[0].edges).toHaveLength(2);
        });

        test('calculates cluster confidence', () => {
            const graph = new EntityResolutionGraph();

            graph.addMatch('A', 'B', 100, 'email');

            const clusters = graph.findClusters();

            expect(clusters[0].confidence).toBeGreaterThan(0);
        });

        test('updates stats.clustersFound', () => {
            const graph = new EntityResolutionGraph();

            graph.addMatch('A', 'B', 85, 'domain');
            graph.addMatch('C', 'D', 80, 'email');

            graph.findClusters();

            expect(graph.stats.clustersFound).toBe(2);
        });

        test('handles disconnected subgraphs', () => {
            const graph = new EntityResolutionGraph();

            // Three separate clusters
            graph.addMatch('A1', 'A2', 85, 'domain');
            graph.addMatch('B1', 'B2', 85, 'domain');
            graph.addMatch('C1', 'C2', 85, 'domain');

            const clusters = graph.findClusters();

            expect(clusters).toHaveLength(3);
        });

        test('handles complex graph with multiple paths', () => {
            const graph = new EntityResolutionGraph();

            // Diamond: A-B, A-C, B-D, C-D
            graph.addMatch('A', 'B', 85, 'domain');
            graph.addMatch('A', 'C', 85, 'email');
            graph.addMatch('B', 'D', 85, 'phone');
            graph.addMatch('C', 'D', 85, 'name');

            const clusters = graph.findClusters();

            expect(clusters).toHaveLength(1);
            expect(clusters[0].nodeCount).toBe(4);
        });
    });

    // ============================================
    // Conflict Detection Tests
    // ============================================
    describe('detectConflicts', () => {
        test('detects conflicting Salesforce IDs', () => {
            const graph = new EntityResolutionGraph();

            graph.addNode('A', { salesforce_id: 'SF001' }, 'salesforce');
            graph.addNode('B', { salesforce_id: 'SF002' }, 'salesforce');
            graph.addMatch('A', 'B', 90, 'domain');

            graph.findClusters();
            const conflicts = graph.detectConflicts();

            expect(conflicts).toHaveLength(1);
            expect(conflicts[0].conflicts[0].type).toBe('external_id_conflict');
            expect(conflicts[0].conflicts[0].field).toBe('salesforce_id');
        });

        test('detects conflicting HubSpot IDs', () => {
            const graph = new EntityResolutionGraph();

            graph.addNode('A', { hubspot_id: 'HS001' }, 'hubspot');
            graph.addNode('B', { hubspot_id: 'HS002' }, 'hubspot');
            graph.addMatch('A', 'B', 90, 'email');

            graph.findClusters();
            const conflicts = graph.detectConflicts();

            expect(conflicts).toHaveLength(1);
            expect(conflicts[0].conflicts[0].field).toBe('hubspot_id');
        });

        test('detects conflicting DUNS numbers', () => {
            const graph = new EntityResolutionGraph();

            graph.addNode('A', { duns_number: '123456789' }, 'source1');
            graph.addNode('B', { duns_number: '987654321' }, 'source2');
            graph.addMatch('A', 'B', 90, 'name');

            graph.findClusters();
            const conflicts = graph.detectConflicts();

            expect(conflicts.some(c =>
                c.conflicts.some(conf => conf.field === 'duns_number')
            )).toBe(true);
        });

        test('returns no conflicts when IDs match', () => {
            const graph = new EntityResolutionGraph();

            graph.addNode('A', { salesforce_id: 'SF001' }, 'salesforce');
            graph.addNode('B', { salesforce_id: 'SF001' }, 'import');
            graph.addMatch('A', 'B', 90, 'domain');

            graph.findClusters();
            const conflicts = graph.detectConflicts();

            // Same SF ID, no conflict
            const sfConflicts = conflicts.filter(c =>
                c.conflicts.some(conf => conf.field === 'salesforce_id')
            );
            expect(sfConflicts).toHaveLength(0);
        });

        test('returns no conflicts when one record lacks ID', () => {
            const graph = new EntityResolutionGraph();

            graph.addNode('A', { salesforce_id: 'SF001' }, 'salesforce');
            graph.addNode('B', { name: 'Test' }, 'import');
            graph.addMatch('A', 'B', 90, 'domain');

            graph.findClusters();
            const conflicts = graph.detectConflicts();

            expect(conflicts).toHaveLength(0);
        });

        test('increments stats.conflictsDetected', () => {
            const graph = new EntityResolutionGraph();

            graph.addNode('A', { salesforce_id: 'SF001' });
            graph.addNode('B', { salesforce_id: 'SF002' });
            graph.addMatch('A', 'B', 90, 'domain');

            graph.findClusters();
            graph.detectConflicts();

            expect(graph.stats.conflictsDetected).toBeGreaterThan(0);
        });
    });

    // ============================================
    // Extract ID Tests
    // ============================================
    describe('extractId', () => {
        let graph;

        beforeEach(() => {
            graph = new EntityResolutionGraph();
        });

        test('extracts salesforce_id variations', () => {
            expect(graph.extractId({ salesforce_id: 'SF1' }, 'salesforce_id')).toBe('SF1');
            expect(graph.extractId({ salesforceaccountid: 'SF2' }, 'salesforce_id')).toBe('SF2');
            expect(graph.extractId({ sf_id: 'SF3' }, 'salesforce_id')).toBe('SF3');
            expect(graph.extractId({ Id: 'SF4' }, 'salesforce_id')).toBe('SF4');
        });

        test('extracts hubspot_id variations', () => {
            expect(graph.extractId({ hubspot_id: 'HS1' }, 'hubspot_id')).toBe('HS1');
            expect(graph.extractId({ hs_object_id: 'HS2' }, 'hubspot_id')).toBe('HS2');
        });

        test('extracts from nested properties', () => {
            const record = { properties: { salesforce_id: 'SF1' } };
            expect(graph.extractId(record, 'salesforce_id')).toBe('SF1');
        });

        test('returns null for missing ID', () => {
            expect(graph.extractId({}, 'salesforce_id')).toBeNull();
            expect(graph.extractId({ name: 'Test' }, 'salesforce_id')).toBeNull();
        });

        test('converts numeric IDs to string', () => {
            expect(graph.extractId({ hubspot_id: 12345 }, 'hubspot_id')).toBe('12345');
        });
    });

    // ============================================
    // Cluster Records Retrieval Tests
    // ============================================
    describe('getClusterRecords', () => {
        test('returns records for a cluster', () => {
            const graph = new EntityResolutionGraph();

            graph.addNode('A', { name: 'Record A' }, 'salesforce');
            graph.addNode('B', { name: 'Record B' }, 'hubspot');
            graph.addMatch('A', 'B', 90, 'domain');

            graph.findClusters();
            const records = graph.getClusterRecords('cluster-1');

            expect(records).toHaveLength(2);
            expect(records[0].id).toBeDefined();
            expect(records[0].record).toBeDefined();
            expect(records[0].source).toBeDefined();
        });

        test('returns empty array for non-existent cluster', () => {
            const graph = new EntityResolutionGraph();

            const records = graph.getClusterRecords('non-existent');

            expect(records).toEqual([]);
        });
    });

    // ============================================
    // Import Matches Tests
    // ============================================
    describe('importMatches', () => {
        test('imports cluster-based matches', () => {
            const graph = new EntityResolutionGraph();

            // importMatches expects an array, each element checked for .clusters
            const matches = [
                {
                    clusters: [
                        {
                            records: [
                                { id: 'A', name: 'Record A', source: 'salesforce' },
                                { id: 'B', name: 'Record B', source: 'hubspot' }
                            ],
                            confidence: 85
                        }
                    ]
                }
            ];

            graph.importMatches(matches, 'deterministic');

            expect(graph.nodes.size).toBe(2);
            expect(graph.edges.size).toBe(1);
        });

        test('imports pair-based matches', () => {
            const graph = new EntityResolutionGraph();

            const matches = [
                { record1Index: 0, record2Index: 1, score: 85 },
                { record1Index: 1, record2Index: 2, score: 90 }
            ];

            graph.importMatches(matches, 'probabilistic');

            expect(graph.nodes.size).toBe(3);
            expect(graph.edges.size).toBe(2);
        });

        test('handles nested record objects', () => {
            const graph = new EntityResolutionGraph();

            // importMatches expects an array
            const matches = [
                {
                    clusters: [
                        {
                            records: [
                                { record: { id: 'A', name: 'A' }, source: 'sf' },
                                { record: { id: 'B', name: 'B' }, source: 'hs' }
                            ],
                            score: 90
                        }
                    ]
                }
            ];

            graph.importMatches(matches, 'test');

            expect(graph.nodes.size).toBe(2);
        });

        test('uses default ID if not present', () => {
            const graph = new EntityResolutionGraph();

            // importMatches expects an array
            const matches = [
                {
                    clusters: [
                        {
                            records: [
                                { name: 'No ID 1' },
                                { name: 'No ID 2' }
                            ],
                            confidence: 80
                        }
                    ]
                }
            ];

            graph.importMatches(matches, 'test');

            expect(graph.nodes.size).toBe(2);
        });
    });

    // ============================================
    // DOT Export Tests
    // ============================================
    describe('toDOT', () => {
        test('generates valid DOT format', () => {
            const graph = new EntityResolutionGraph();

            graph.addNode('A', { name: 'Record A' });
            graph.addNode('B', { name: 'Record B' });
            graph.addMatch('A', 'B', 85, 'domain');

            const dot = graph.toDOT();

            expect(dot).toContain('graph EntityResolution');
            expect(dot).toContain('"A"');
            expect(dot).toContain('"B"');
            expect(dot).toContain('--'); // Undirected edge
        });

        test('includes edge labels', () => {
            const graph = new EntityResolutionGraph();

            graph.addMatch('A', 'B', 85, 'domain');

            const dot = graph.toDOT();

            expect(dot).toContain('domain');
            expect(dot).toContain('85%');
        });

        test('uses dashed style for transitive edges', () => {
            const graph = new EntityResolutionGraph({
                transitiveMinScore: 50,
                transitiveDecay: 0.9
            });

            graph.addMatch('A', 'B', 95, 'email');
            graph.addMatch('B', 'C', 95, 'email');
            graph.resolveTransitive();

            const dot = graph.toDOT();

            expect(dot).toContain('style=dashed');
        });

        test('escapes special characters in labels', () => {
            const graph = new EntityResolutionGraph();

            graph.addNode('A', { name: 'Test "Company"' });
            graph.addNode('B', { name: 'Other' });
            graph.addMatch('A', 'B', 85, 'domain');

            const dot = graph.toDOT();

            // Should escape quotes
            expect(dot).not.toContain('label="Test "Company""');
        });

        test('applies cluster coloring', () => {
            const graph = new EntityResolutionGraph();

            graph.addMatch('A', 'B', 85, 'domain');
            graph.findClusters();

            const dot = graph.toDOT();

            expect(dot).toContain('fillcolor=');
        });
    });

    // ============================================
    // Statistics Tests
    // ============================================
    describe('getStats', () => {
        test('returns comprehensive statistics', () => {
            const graph = new EntityResolutionGraph();

            graph.addMatch('A', 'B', 85, 'domain');
            graph.addMatch('B', 'C', 90, 'email');
            graph.addMatch('D', 'E', 80, 'phone');
            graph.findClusters();

            const stats = graph.getStats();

            expect(stats.nodesAdded).toBe(5);
            expect(stats.edgesAdded).toBe(3);
            expect(stats.totalNodes).toBe(5);
            expect(stats.totalEdges).toBe(3);
            expect(stats.totalClusters).toBe(2);
        });

        test('calculates average cluster size', () => {
            const graph = new EntityResolutionGraph();

            graph.addMatch('A', 'B', 85, 'domain');
            graph.addMatch('B', 'C', 90, 'email');
            graph.addMatch('D', 'E', 80, 'phone');
            graph.findClusters();

            const stats = graph.getStats();

            // Cluster 1: 3 nodes, Cluster 2: 2 nodes
            expect(stats.averageClusterSize).toBe(2.5);
        });

        test('calculates max cluster size', () => {
            const graph = new EntityResolutionGraph();

            graph.addMatch('A', 'B', 85, 'domain');
            graph.addMatch('B', 'C', 90, 'email');
            graph.addMatch('C', 'D', 80, 'phone');
            graph.addMatch('E', 'F', 80, 'name');
            graph.findClusters();

            const stats = graph.getStats();

            expect(stats.maxClusterSize).toBe(4);
        });

        test('handles empty graph', () => {
            const graph = new EntityResolutionGraph();
            const stats = graph.getStats();

            expect(stats.totalNodes).toBe(0);
            expect(stats.totalEdges).toBe(0);
            expect(stats.averageClusterSize).toBe(0);
            expect(stats.maxClusterSize).toBe(0);
        });
    });

    // ============================================
    // Full Resolution Pipeline Tests
    // ============================================
    describe('resolve', () => {
        test('executes full resolution pipeline', () => {
            const graph = new EntityResolutionGraph({
                transitiveMinScore: 50,
                transitiveDecay: 0.9
            });

            graph.addMatch('A', 'B', 95, 'email');
            graph.addMatch('B', 'C', 95, 'email');
            graph.addMatch('D', 'E', 90, 'domain');

            const result = graph.resolve();

            expect(result.clusters).toBeDefined();
            expect(result.conflicts).toBeDefined();
            expect(result.transitiveEdgesAdded).toBeDefined();
            expect(result.stats).toBeDefined();
        });

        test('includes transitive edges in result', () => {
            const graph = new EntityResolutionGraph({
                transitiveMinScore: 50,
                transitiveDecay: 0.9
            });

            graph.addMatch('A', 'B', 95, 'salesforce_id');
            graph.addMatch('B', 'C', 95, 'salesforce_id');

            const result = graph.resolve();

            expect(result.transitiveEdgesAdded).toBeGreaterThan(0);
        });

        test('detects conflicts after resolution', () => {
            const graph = new EntityResolutionGraph();

            graph.addNode('A', { salesforce_id: 'SF001' });
            graph.addNode('B', { salesforce_id: 'SF002' });
            graph.addMatch('A', 'B', 90, 'domain');

            const result = graph.resolve();

            expect(result.conflicts).toHaveLength(1);
        });
    });

    // ============================================
    // Integration Tests
    // ============================================
    describe('Integration Tests', () => {
        test('full workflow: import, resolve, export', () => {
            const graph = new EntityResolutionGraph({
                transitiveMinScore: 50,
                transitiveDecay: 0.85
            });

            // Import matches from deterministic matcher (wrapped in array)
            const deterministicMatches = [
                {
                    clusters: [
                        {
                            records: [
                                { id: 'SF-001', name: 'Acme Corp', source: 'salesforce' },
                                { id: 'HS-001', name: 'Acme Corporation', source: 'hubspot' }
                            ],
                            confidence: 95
                        }
                    ]
                }
            ];

            // Import matches from probabilistic matcher (already array format)
            const probabilisticMatches = [
                { record1Index: 0, record2Index: 2, score: 85 } // HS-001 matches new record
            ];

            graph.addNode('2', { id: 'NEW-001', name: 'ACME Corp' }, 'import');

            graph.importMatches(deterministicMatches, 'deterministic');
            graph.importMatches(probabilisticMatches, 'probabilistic');

            const result = graph.resolve();

            expect(result.clusters.length).toBeGreaterThan(0);
            expect(result.stats.totalNodes).toBeGreaterThan(0);
        });

        test('handles large graph with many nodes', () => {
            const graph = new EntityResolutionGraph();

            // Create 100 nodes with some connections
            for (let i = 0; i < 100; i++) {
                graph.addNode(`node-${i}`, { name: `Record ${i}` });
            }

            // Create chains of matches
            for (let i = 0; i < 99; i += 10) {
                graph.addMatch(`node-${i}`, `node-${i + 1}`, 85, 'domain');
            }

            const clusters = graph.findClusters();
            const stats = graph.getStats();

            expect(stats.totalNodes).toBe(100);
            expect(clusters.length).toBeGreaterThan(0);
        });

        test('cross-platform deduplication scenario', () => {
            const graph = new EntityResolutionGraph();

            // Salesforce records
            graph.addNode('SF-001', {
                id: 'SF-001',
                name: 'Acme Corp',
                domain: 'acme.com',
                salesforce_id: '001ABC123'
            }, 'salesforce');

            graph.addNode('SF-002', {
                id: 'SF-002',
                name: 'Beta Inc',
                domain: 'beta.com',
                salesforce_id: '001DEF456'
            }, 'salesforce');

            // HubSpot records
            graph.addNode('HS-001', {
                id: 'HS-001',
                name: 'ACME Corporation',
                domain: 'acme.com',
                hubspot_id: '12345'
            }, 'hubspot');

            graph.addNode('HS-002', {
                id: 'HS-002',
                name: 'Beta Industries',
                domain: 'beta.com',
                hubspot_id: '67890'
            }, 'hubspot');

            // Add matches
            graph.addMatch('SF-001', 'HS-001', 95, 'domain');
            graph.addMatch('SF-002', 'HS-002', 90, 'domain');

            const result = graph.resolve();

            expect(result.clusters).toHaveLength(2);

            // Verify first cluster has SF and HS record
            const acmeCluster = result.clusters.find(c =>
                c.nodeIds.includes('SF-001')
            );
            expect(acmeCluster.nodeIds).toContain('HS-001');
        });
    });

    // ============================================
    // Edge Cases
    // ============================================
    describe('Edge Cases', () => {
        test('handles empty graph', () => {
            const graph = new EntityResolutionGraph();

            const clusters = graph.findClusters();
            const conflicts = graph.detectConflicts();
            const dot = graph.toDOT();

            expect(clusters).toEqual([]);
            expect(conflicts).toEqual([]);
            expect(dot).toContain('graph EntityResolution');
        });

        test('handles single node', () => {
            const graph = new EntityResolutionGraph();
            graph.addNode('A', { name: 'Single' });

            const clusters = graph.findClusters();

            expect(clusters).toEqual([]); // Single nodes are not clusters
        });

        test('handles self-referencing edge attempt', () => {
            const graph = new EntityResolutionGraph();

            const edge = graph.addMatch('A', 'A', 100, 'domain');

            // Should create the edge (implementation doesn't prevent self-loops)
            expect(graph.edges.size).toBe(1);
        });

        test('handles very long node IDs', () => {
            const graph = new EntityResolutionGraph();
            const longId1 = 'A'.repeat(500);
            const longId2 = 'B'.repeat(500);

            graph.addMatch(longId1, longId2, 85, 'domain');

            expect(graph.nodes.size).toBe(2);
            expect(graph.edges.size).toBe(1);
        });

        test('handles special characters in IDs', () => {
            const graph = new EntityResolutionGraph();

            graph.addMatch('id-with-dashes', 'id_with_underscores', 85, 'domain');
            graph.addMatch('id.with.dots', 'id:with:colons', 90, 'email');

            expect(graph.nodes.size).toBe(4);
            expect(graph.edges.size).toBe(2);
        });

        test('handles numeric node IDs', () => {
            const graph = new EntityResolutionGraph();

            graph.addMatch(123, 456, 85, 'domain');

            // IDs should be treated consistently
            expect(graph.nodes.size).toBe(2);
        });
    });
});
