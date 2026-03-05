#!/usr/bin/env node

/**
 * Automation Dependency Graph
 *
 * Purpose: Build specialized dependency graph for automation components
 * showing invocation chains, data dependencies, and execution order.
 *
 * Features:
 * - Nodes: Apex Triggers, Classes, Flows, Process Builder, Workflow Rules, Assignment Rules (v3.62.0)
 * - Edges: invokes, reads, writes, triggers, assigns relationships
 * - Circular dependency detection
 * - Execution phase calculation
 * - Overlap detection (multiple automation on same object+event)
 * - Topological sorting for execution order
 * - Assignment routing path visualization (v3.62.0)
 *
 * Usage:
 *   const graph = new AutomationDependencyGraph();
 *   graph.addAutomation(automation);
 *   const cycles = graph.detectCircularPaths();
 *   const phases = graph.calculateExecutionPhases();
 */

class AutomationDependencyGraph {
    constructor() {
        this.nodes = new Map(); // id -> node data
        this.edges = new Map(); // from_id -> Set of {to_id, type, label}
        this.reverseEdges = new Map(); // to_id -> Set of {from_id, type}
        this.objectIndex = new Map(); // object -> Set of automation ids
        this.eventIndex = new Map(); // object:event -> Set of automation ids
    }

    /**
     * Add automation to graph
     */
    addAutomation(automation) {
        // Add node
        this.nodes.set(automation.id, {
            id: automation.id,
            name: automation.name,
            type: automation.type,
            status: automation.status,
            objectTargets: automation.objectTargets || [],
            reads: automation.reads || [],
            writes: automation.writes || [],
            invokes: automation.invokes || [],
            riskScore: automation.riskScore || 0
        });

        // Index by object
        for (const target of (automation.objectTargets || [])) {
            const obj = target.objectApiName;
            if (!this.objectIndex.has(obj)) {
                this.objectIndex.set(obj, new Set());
            }
            this.objectIndex.get(obj).add(automation.id);

            // Index by object:event
            for (const event of (target.when || [])) {
                const key = `${obj}:${event}`;
                if (!this.eventIndex.has(key)) {
                    this.eventIndex.set(key, new Set());
                }
                this.eventIndex.get(key).add(automation.id);
            }
        }

        // Add invocation edges
        for (const invoke of (automation.invokes || [])) {
            if (invoke.id) {
                this.addEdge(automation.id, invoke.id, 'invokes', invoke.name);
            }
        }

        // Add data dependency edges (writes -> reads)
        for (const write of (automation.writes || [])) {
            // Find other automation that reads this field
            for (const [otherId, otherNode] of this.nodes) {
                if (otherId !== automation.id && otherNode.reads.includes(write)) {
                    this.addEdge(automation.id, otherId, 'data_dependency', write);
                }
            }
        }
    }

    /**
     * Add edge to graph
     */
    addEdge(fromId, toId, type, label = '') {
        // Forward edge
        if (!this.edges.has(fromId)) {
            this.edges.set(fromId, new Set());
        }
        this.edges.get(fromId).add({ toId, type, label });

        // Reverse edge
        if (!this.reverseEdges.has(toId)) {
            this.reverseEdges.set(toId, new Set());
        }
        this.reverseEdges.get(toId).add({ fromId, type });
    }

    /**
     * Find circular dependency paths
     */
    detectCircularPaths() {
        const visited = new Set();
        const recursionStack = new Set();
        const cycles = [];

        const dfs = (nodeId, path = []) => {
            visited.add(nodeId);
            recursionStack.add(nodeId);
            path.push(nodeId);

            const neighbors = this.edges.get(nodeId) || new Set();
            for (const edge of neighbors) {
                if (!visited.has(edge.toId)) {
                    if (dfs(edge.toId, [...path])) {
                        return true;
                    }
                } else if (recursionStack.has(edge.toId)) {
                    // Cycle detected!
                    const cycleStart = path.indexOf(edge.toId);
                    const cycle = path.slice(cycleStart).map(id => ({
                        id,
                        name: this.nodes.get(id)?.name,
                        type: this.nodes.get(id)?.type
                    }));
                    cycles.push(cycle);
                }
            }

            recursionStack.delete(nodeId);
            return false;
        };

        for (const nodeId of this.nodes.keys()) {
            if (!visited.has(nodeId)) {
                dfs(nodeId);
            }
        }

        return cycles;
    }

    /**
     * Find overlaps (multiple automation on same object+event)
     */
    findOverlaps(object = null, event = null) {
        const overlaps = [];

        // If specific object+event provided
        if (object && event) {
            const key = `${object}:${event}`;
            const automations = this.eventIndex.get(key);
            if (automations && automations.size > 1) {
                overlaps.push({
                    object,
                    event,
                    count: automations.size,
                    automations: Array.from(automations).map(id => ({
                        id,
                        name: this.nodes.get(id)?.name,
                        type: this.nodes.get(id)?.type
                    }))
                });
            }
            return overlaps;
        }

        // Find all overlaps
        for (const [key, automations] of this.eventIndex) {
            if (automations.size > 1) {
                const [obj, evt] = key.split(':');
                overlaps.push({
                    object: obj,
                    event: evt,
                    count: automations.size,
                    automations: Array.from(automations).map(id => ({
                        id,
                        name: this.nodes.get(id)?.name,
                        type: this.nodes.get(id)?.type
                    }))
                });
            }
        }

        return overlaps.sort((a, b) => b.count - a.count);
    }

    /**
     * Calculate execution phases using topological sort
     */
    calculateExecutionPhases() {
        const phases = [];
        const processed = new Set();
        const inDegree = new Map();

        // Calculate in-degree for each node
        for (const nodeId of this.nodes.keys()) {
            const deps = this.reverseEdges.get(nodeId) || new Set();
            inDegree.set(nodeId, deps.size);
        }

        let phaseNum = 1;
        let stuck = false;

        while (processed.size < this.nodes.size && !stuck) {
            // Find nodes with all dependencies satisfied
            const ready = [];
            for (const nodeId of this.nodes.keys()) {
                if (processed.has(nodeId)) continue;

                const deps = this.reverseEdges.get(nodeId) || new Set();
                const allDepsProcessed = Array.from(deps).every(dep =>
                    processed.has(dep.fromId)
                );

                if (allDepsProcessed) {
                    ready.push(nodeId);
                }
            }

            if (ready.length === 0) {
                // Circular dependency or blocked - include remaining nodes
                const blocked = Array.from(this.nodes.keys()).filter(id =>
                    !processed.has(id)
                );

                if (blocked.length > 0) {
                    phases.push({
                        phase: phaseNum,
                        parallel: false,
                        warning: 'Circular dependency detected',
                        strategy: 'REQUIRES_BYPASS',
                        nodes: blocked.map(id => ({
                            id,
                            name: this.nodes.get(id)?.name,
                            type: this.nodes.get(id)?.type,
                            objectTargets: this.nodes.get(id)?.objectTargets
                        }))
                    });
                }
                stuck = true;
                break;
            }

            // Add ready nodes as new phase
            phases.push({
                phase: phaseNum,
                parallel: ready.length > 1,
                nodes: ready.map(id => ({
                    id,
                    name: this.nodes.get(id)?.name,
                    type: this.nodes.get(id)?.type,
                    objectTargets: this.nodes.get(id)?.objectTargets,
                    dependencies: Array.from(this.reverseEdges.get(id) || new Set())
                        .map(dep => this.nodes.get(dep.fromId)?.name)
                }))
            });

            ready.forEach(id => processed.add(id));
            phaseNum++;
        }

        return phases;
    }

    /**
     * Get automation by object
     */
    getAutomationByObject(objectName) {
        const automationIds = this.objectIndex.get(objectName) || new Set();
        return Array.from(automationIds).map(id => this.nodes.get(id));
    }

    /**
     * Get automation by type
     */
    getAutomationByType(type) {
        const result = [];
        for (const node of this.nodes.values()) {
            if (node.type === type) {
                result.push(node);
            }
        }
        return result;
    }

    /**
     * Export to JSON format
     */
    toJSON() {
        return {
            nodes: Array.from(this.nodes.values()),
            edges: Array.from(this.edges.entries()).map(([fromId, edgeSet]) => ({
                from: fromId,
                fromName: this.nodes.get(fromId)?.name,
                edges: Array.from(edgeSet).map(edge => ({
                    to: edge.toId,
                    toName: this.nodes.get(edge.toId)?.name,
                    type: edge.type,
                    label: edge.label
                }))
            })),
            summary: {
                totalNodes: this.nodes.size,
                totalEdges: Array.from(this.edges.values()).reduce((sum, set) => sum + set.size, 0),
                objectCount: this.objectIndex.size,
                eventCount: this.eventIndex.size
            }
        };
    }

    /**
     * Export to DOT format (Graphviz)
     */
    toDOT(options = {}) {
        const includeTypes = options.types || null;
        const includeObjects = options.objects || null;

        let dot = 'digraph AutomationDependencies {\n';
        dot += '  rankdir=LR;\n';
        dot += '  node [shape=box, style=rounded];\n\n';

        // Add nodes
        for (const [id, node] of this.nodes) {
            // Filter by type
            if (includeTypes && !includeTypes.includes(node.type)) {
                continue;
            }

            // Filter by object
            if (includeObjects) {
                const hasObject = node.objectTargets.some(t =>
                    includeObjects.includes(t.objectApiName)
                );
                if (!hasObject) continue;
            }

            const color = this.getNodeColor(node);
            const label = `${node.name}\\n(${node.type})`;
            dot += `  "${id}" [label="${label}", color="${color}"];\n`;
        }

        dot += '\n';

        // Add edges
        for (const [fromId, edgeSet] of this.edges) {
            const fromNode = this.nodes.get(fromId);
            if (!fromNode) continue;

            // Apply filters to from node
            if (includeTypes && !includeTypes.includes(fromNode.type)) {
                continue;
            }

            for (const edge of edgeSet) {
                const toNode = this.nodes.get(edge.toId);
                if (!toNode) continue;

                // Apply filters to to node
                if (includeTypes && !includeTypes.includes(toNode.type)) {
                    continue;
                }

                const edgeColor = this.getEdgeColor(edge.type);
                const label = edge.label ? `label="${edge.label}"` : '';
                dot += `  "${fromId}" -> "${edge.toId}" [color="${edgeColor}", ${label}];\n`;
            }
        }

        dot += '}\n';
        return dot;
    }

    /**
     * Get node color based on type and risk
     */
    getNodeColor(node) {
        if (node.riskScore >= 70) return 'red';
        if (node.riskScore >= 50) return 'orange';
        if (node.riskScore >= 30) return 'yellow';

        switch (node.type) {
            case 'ApexTrigger': return 'lightblue';
            case 'ApexClass': return 'lightgreen';
            case 'Flow': return 'lightpink';
            case 'ProcessBuilder': return 'lightyellow';
            case 'WorkflowRule': return 'lightgray';
            case 'AssignmentRule': return 'lightcyan';  // v3.62.0
            default: return 'white';
        }
    }

    /**
     * Get edge color based on type
     */
    getEdgeColor(type) {
        switch (type) {
            case 'invokes': return 'blue';
            case 'data_dependency': return 'orange';
            case 'triggers': return 'red';
            case 'assigns': return 'purple';  // v3.62.0 - Assignment Rule routing
            default: return 'gray';
        }
    }

    /**
     * Get statistics
     */
    getStatistics() {
        const stats = {
            totalNodes: this.nodes.size,
            totalEdges: 0,
            nodesByType: {},
            objectsWithAutomation: this.objectIndex.size,
            overlappingEvents: 0,
            circularDependencies: this.detectCircularPaths().length,
            highRiskNodes: 0
        };

        // Count edges
        for (const edgeSet of this.edges.values()) {
            stats.totalEdges += edgeSet.size;
        }

        // Count by type
        for (const node of this.nodes.values()) {
            stats.nodesByType[node.type] = (stats.nodesByType[node.type] || 0) + 1;
            if (node.riskScore >= 70) {
                stats.highRiskNodes++;
            }
        }

        // Count overlapping events
        for (const automations of this.eventIndex.values()) {
            if (automations.size > 1) {
                stats.overlappingEvents++;
            }
        }

        return stats;
    }

    /**
     * Find transaction paths (sequences of automation that execute together)
     */
    findTransactionPaths(startNodeId, maxDepth = 10) {
        const paths = [];
        const visited = new Set();

        const dfs = (nodeId, path, depth) => {
            if (depth > maxDepth) return;
            if (visited.has(nodeId)) return;

            visited.add(nodeId);
            path.push(nodeId);

            const neighbors = this.edges.get(nodeId) || new Set();
            if (neighbors.size === 0) {
                // Leaf node - complete path
                paths.push({
                    path: path.map(id => ({
                        id,
                        name: this.nodes.get(id)?.name,
                        type: this.nodes.get(id)?.type
                    })),
                    length: path.length
                });
            } else {
                for (const edge of neighbors) {
                    dfs(edge.toId, [...path], depth + 1);
                }
            }

            visited.delete(nodeId);
        };

        dfs(startNodeId, [], 0);
        return paths.sort((a, b) => b.length - a.length);
    }
}

module.exports = AutomationDependencyGraph;

// CLI Interface
if (require.main === module) {
    const fs = require('fs');
    const args = process.argv.slice(2);

    if (args.length < 1) {
        console.log(`
Automation Dependency Graph
===========================

Usage:
  node automation-dependency-graph.js <udm-file.json> [options]

Options:
  --output <file>         Write graph JSON to file
  --dot <file>           Write DOT format to file
  --types <type1,type2>  Filter by automation types
  --objects <obj1,obj2>  Filter by objects
  --stats                Show statistics only

Examples:
  node automation-dependency-graph.js automations.json --output graph.json
  node automation-dependency-graph.js automations.json --dot graph.dot
  node automation-dependency-graph.js automations.json --stats
  node automation-dependency-graph.js automations.json --types ApexTrigger,Flow,AssignmentRule
  node automation-dependency-graph.js automations.json --objects Account,Opportunity,Lead,Case
        `);
        process.exit(1);
    }

    try {
        const inputFile = args[0];
        const automations = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

        const graph = new AutomationDependencyGraph();

        // Build graph
        console.log('Building dependency graph...');
        for (const automation of automations) {
            graph.addAutomation(automation);
        }

        // Show stats if requested
        if (args.includes('--stats')) {
            const stats = graph.getStatistics();
            console.log('\nGraph Statistics:');
            console.log(JSON.stringify(stats, null, 2));
        }

        // Output JSON
        if (args.includes('--output')) {
            const outputFile = args[args.indexOf('--output') + 1];
            fs.writeFileSync(outputFile, JSON.stringify(graph.toJSON(), null, 2));
            console.log(`\n✓ Graph JSON written to: ${outputFile}`);
        }

        // Output DOT
        if (args.includes('--dot')) {
            const dotFile = args[args.indexOf('--dot') + 1];
            const options = {};

            if (args.includes('--types')) {
                options.types = args[args.indexOf('--types') + 1].split(',');
            }
            if (args.includes('--objects')) {
                options.objects = args[args.indexOf('--objects') + 1].split(',');
            }

            fs.writeFileSync(dotFile, graph.toDOT(options));
            console.log(`\n✓ DOT format written to: ${dotFile}`);
            console.log(`  Render with: dot -Tpng ${dotFile} -o graph.png`);
        }

        // Show overlaps
        console.log('\nOverlapping Events:');
        const overlaps = graph.findOverlaps();
        for (const overlap of overlaps.slice(0, 10)) {
            console.log(`  ${overlap.object}.${overlap.event}: ${overlap.count} automation(s)`);
        }

        // Show cycles
        const cycles = graph.detectCircularPaths();
        if (cycles.length > 0) {
            console.log(`\n⚠️  Found ${cycles.length} circular dependenc${cycles.length === 1 ? 'y' : 'ies'}!`);
        }

    } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
        process.exit(1);
    }
}
