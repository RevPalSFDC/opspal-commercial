#!/usr/bin/env node

/**
 * Territory Hierarchy Analyzer
 *
 * Analyzes and visualizes territory hierarchies.
 * Detects cycles, orphans, calculates metrics, and generates diagrams.
 *
 * @module territory-hierarchy-analyzer
 * @version 1.0.0
 * @see docs/runbooks/territory-management/04-hierarchy-configuration.md
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Execute SF CLI query
 * @param {string} query - SOQL query
 * @param {string} orgAlias - Target org alias
 * @returns {Array} Query results
 */
function sfQuery(query, orgAlias) {
  const cmd = `sf data query --query "${query}" --target-org ${orgAlias} --json`;

  try {
    const result = JSON.parse(execSync(cmd, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }));
    return result.result?.records || [];
  } catch (error) {
    console.error(`Query failed: ${error.message}`);
    return [];
  }
}

/**
 * Build hierarchy tree from territories
 * @param {Array} territories - Territory records
 * @returns {Object} Hierarchy tree structure
 */
function buildTree(territories) {
  const tree = {
    roots: [],
    nodes: new Map(),
    parentMap: new Map(),
    childrenMap: new Map()
  };

  // Index all territories
  for (const t of territories) {
    tree.nodes.set(t.Id, t);
    tree.parentMap.set(t.Id, t.ParentTerritory2Id);

    if (!tree.childrenMap.has(t.ParentTerritory2Id || 'root')) {
      tree.childrenMap.set(t.ParentTerritory2Id || 'root', []);
    }
    tree.childrenMap.get(t.ParentTerritory2Id || 'root').push(t.Id);
  }

  // Find roots
  tree.roots = tree.childrenMap.get('root') || [];

  return tree;
}

/**
 * Detect cycles in hierarchy
 * @param {Object} tree - Hierarchy tree
 * @returns {Array} List of cycles found
 */
function detectCycles(tree) {
  const cycles = [];
  const visited = new Set();
  const recursionStack = new Set();

  function dfs(nodeId, path = []) {
    if (recursionStack.has(nodeId)) {
      // Found a cycle
      const cycleStart = path.indexOf(nodeId);
      cycles.push({
        path: path.slice(cycleStart).concat(nodeId),
        nodes: path.slice(cycleStart).map(id => tree.nodes.get(id)?.DeveloperName || id)
      });
      return;
    }

    if (visited.has(nodeId)) return;

    visited.add(nodeId);
    recursionStack.add(nodeId);
    path.push(nodeId);

    const children = tree.childrenMap.get(nodeId) || [];
    for (const childId of children) {
      dfs(childId, [...path]);
    }

    recursionStack.delete(nodeId);
  }

  for (const rootId of tree.roots) {
    dfs(rootId);
  }

  // Also check for orphaned cycles
  for (const [nodeId] of tree.nodes) {
    if (!visited.has(nodeId)) {
      dfs(nodeId);
    }
  }

  return cycles;
}

/**
 * Detect orphaned territories
 * @param {Object} tree - Hierarchy tree
 * @returns {Array} List of orphaned territories
 */
function detectOrphans(tree) {
  const orphans = [];
  const validIds = new Set(tree.nodes.keys());

  for (const [nodeId, parentId] of tree.parentMap) {
    if (parentId && !validIds.has(parentId)) {
      const node = tree.nodes.get(nodeId);
      orphans.push({
        id: nodeId,
        developerName: node?.DeveloperName,
        name: node?.Name,
        invalidParentId: parentId
      });
    }
  }

  return orphans;
}

/**
 * Calculate hierarchy metrics
 * @param {Object} tree - Hierarchy tree
 * @returns {Object} Hierarchy metrics
 */
function calculateMetrics(tree) {
  const metrics = {
    totalNodes: tree.nodes.size,
    rootCount: tree.roots.length,
    maxDepth: 0,
    avgDepth: 0,
    maxBreadth: 0,
    leafCount: 0,
    depthDistribution: {},
    breadthByLevel: {}
  };

  // Calculate depth for each node
  const depthMap = new Map();

  function getDepth(nodeId) {
    if (depthMap.has(nodeId)) return depthMap.get(nodeId);

    const parentId = tree.parentMap.get(nodeId);
    if (!parentId || !tree.nodes.has(parentId)) {
      depthMap.set(nodeId, 0);
      return 0;
    }

    const depth = getDepth(parentId) + 1;
    depthMap.set(nodeId, depth);
    return depth;
  }

  for (const [nodeId] of tree.nodes) {
    const depth = getDepth(nodeId);
    metrics.maxDepth = Math.max(metrics.maxDepth, depth);
    metrics.depthDistribution[depth] = (metrics.depthDistribution[depth] || 0) + 1;

    // Count leaves (nodes with no children)
    const children = tree.childrenMap.get(nodeId) || [];
    if (children.length === 0) {
      metrics.leafCount++;
    }
  }

  // Calculate breadth by level
  for (const [depth, count] of Object.entries(metrics.depthDistribution)) {
    metrics.breadthByLevel[depth] = count;
    metrics.maxBreadth = Math.max(metrics.maxBreadth, count);
  }

  // Calculate average depth
  let totalDepth = 0;
  for (const [depth, count] of Object.entries(metrics.depthDistribution)) {
    totalDepth += parseInt(depth) * count;
  }
  metrics.avgDepth = metrics.totalNodes > 0
    ? (totalDepth / metrics.totalNodes).toFixed(2)
    : 0;

  return metrics;
}

/**
 * Generate Mermaid diagram of hierarchy
 * @param {Object} tree - Hierarchy tree
 * @param {Object} options - Diagram options
 * @returns {string} Mermaid diagram code
 */
function generateMermaidDiagram(tree, options = {}) {
  const { maxNodes = 100, includeTypes = true } = options;

  let diagram = 'graph TD\n';
  let nodeCount = 0;

  // Helper to create safe node ID
  const safeId = (id) => id.replace(/[^a-zA-Z0-9]/g, '_');

  // Helper to create node label
  const nodeLabel = (node) => {
    let label = node.Name || node.DeveloperName;
    if (includeTypes && node.TypeName) {
      label += `\\n(${node.TypeName})`;
    }
    return label.replace(/"/g, '\\"');
  };

  // Process nodes breadth-first from roots
  const queue = [...tree.roots];
  const processed = new Set();

  while (queue.length > 0 && nodeCount < maxNodes) {
    const nodeId = queue.shift();
    if (processed.has(nodeId)) continue;
    processed.add(nodeId);

    const node = tree.nodes.get(nodeId);
    if (!node) continue;

    const parentId = tree.parentMap.get(nodeId);
    const nodeSafeId = safeId(node.DeveloperName || nodeId);
    const label = nodeLabel(node);

    if (parentId && tree.nodes.has(parentId)) {
      const parent = tree.nodes.get(parentId);
      const parentSafeId = safeId(parent.DeveloperName || parentId);
      diagram += `    ${parentSafeId} --> ${nodeSafeId}["${label}"]\n`;
    } else {
      diagram += `    ${nodeSafeId}["${label}"]\n`;
    }

    nodeCount++;

    // Add children to queue
    const children = tree.childrenMap.get(nodeId) || [];
    queue.push(...children);
  }

  if (nodeCount >= maxNodes) {
    diagram += `    truncated["... and ${tree.nodes.size - nodeCount} more"]\n`;
  }

  return diagram;
}

/**
 * Generate text tree representation
 * @param {Object} tree - Hierarchy tree
 * @param {Object} options - Display options
 * @returns {string} Text tree
 */
function generateTextTree(tree, options = {}) {
  const { maxDepth = 10 } = options;
  let output = '';

  function printNode(nodeId, prefix = '', isLast = true, depth = 0) {
    if (depth > maxDepth) return;

    const node = tree.nodes.get(nodeId);
    if (!node) return;

    const connector = isLast ? '└── ' : '├── ';
    const name = node.Name || node.DeveloperName;
    const type = node.TypeName ? ` (${node.TypeName})` : '';

    output += `${prefix}${connector}${name}${type}\n`;

    const children = tree.childrenMap.get(nodeId) || [];
    const childPrefix = prefix + (isLast ? '    ' : '│   ');

    children.forEach((childId, index) => {
      printNode(childId, childPrefix, index === children.length - 1, depth + 1);
    });
  }

  for (let i = 0; i < tree.roots.length; i++) {
    printNode(tree.roots[i], '', i === tree.roots.length - 1);
  }

  return output;
}

/**
 * Analyze territory hierarchy for a model
 * @param {string} orgAlias - Target org alias
 * @param {string} modelId - Territory2Model ID
 * @param {Object} options - Analysis options
 * @returns {Object} Analysis results
 */
function analyzeHierarchy(orgAlias, modelId, options = {}) {
  console.log(`\n🔍 Analyzing territory hierarchy for model: ${modelId}\n`);

  // Fetch territories with type info
  const territories = sfQuery(`
    SELECT Id, Name, DeveloperName, ParentTerritory2Id,
           Territory2Type.MasterLabel TypeName,
           AccountAccessLevel, OpportunityAccessLevel, CaseAccessLevel
    FROM Territory2
    WHERE Territory2ModelId = '${modelId}'
    ORDER BY ParentTerritory2Id NULLS FIRST, Name
  `, orgAlias);

  if (territories.length === 0) {
    return {
      error: 'No territories found in model',
      modelId
    };
  }

  // Build tree
  const tree = buildTree(territories);

  // Run analysis
  const cycles = detectCycles(tree);
  const orphans = detectOrphans(tree);
  const metrics = calculateMetrics(tree);

  // Generate visualizations
  const mermaidDiagram = generateMermaidDiagram(tree, options);
  const textTree = generateTextTree(tree, options);

  const results = {
    modelId,
    timestamp: new Date().toISOString(),
    summary: {
      totalTerritories: territories.length,
      rootCount: tree.roots.length,
      maxDepth: metrics.maxDepth,
      avgDepth: metrics.avgDepth,
      leafCount: metrics.leafCount
    },
    health: {
      hasCycles: cycles.length > 0,
      hasOrphans: orphans.length > 0,
      isHealthy: cycles.length === 0 && orphans.length === 0
    },
    cycles,
    orphans,
    metrics,
    visualizations: {
      mermaid: mermaidDiagram,
      textTree
    }
  };

  // Print summary
  console.log('Hierarchy Analysis Summary:');
  console.log('═'.repeat(60));
  console.log(`Total Territories: ${results.summary.totalTerritories}`);
  console.log(`Root Territories: ${results.summary.rootCount}`);
  console.log(`Maximum Depth: ${results.summary.maxDepth}`);
  console.log(`Average Depth: ${results.summary.avgDepth}`);
  console.log(`Leaf Territories: ${results.summary.leafCount}`);
  console.log('─'.repeat(60));

  if (cycles.length > 0) {
    console.log(`❌ Cycles Detected: ${cycles.length}`);
    for (const cycle of cycles) {
      console.log(`   - ${cycle.nodes.join(' → ')}`);
    }
  } else {
    console.log('✅ No Cycles Detected');
  }

  if (orphans.length > 0) {
    console.log(`❌ Orphaned Territories: ${orphans.length}`);
    for (const orphan of orphans.slice(0, 5)) {
      console.log(`   - ${orphan.name} (${orphan.developerName})`);
    }
    if (orphans.length > 5) {
      console.log(`   - ... and ${orphans.length - 5} more`);
    }
  } else {
    console.log('✅ No Orphaned Territories');
  }

  console.log('─'.repeat(60));
  console.log(`Overall Health: ${results.health.isHealthy ? '✅ HEALTHY' : '❌ ISSUES FOUND'}`);
  console.log('═'.repeat(60));

  // Print text tree
  console.log('\nHierarchy Tree:');
  console.log(textTree);

  return results;
}

/**
 * Export analysis results
 * @param {Object} results - Analysis results
 * @param {string} outputPath - Output file path
 * @param {string} format - Output format (json, mermaid, text)
 */
function exportResults(results, outputPath, format = 'json') {
  let content;

  switch (format) {
    case 'mermaid':
      content = results.visualizations.mermaid;
      break;
    case 'text':
      content = `Territory Hierarchy Analysis
Generated: ${results.timestamp}

Summary:
${JSON.stringify(results.summary, null, 2)}

Health:
${JSON.stringify(results.health, null, 2)}

${results.cycles.length > 0 ? `Cycles:\n${JSON.stringify(results.cycles, null, 2)}\n` : ''}
${results.orphans.length > 0 ? `Orphans:\n${JSON.stringify(results.orphans, null, 2)}\n` : ''}

Hierarchy Tree:
${results.visualizations.textTree}
`;
      break;
    default:
      content = JSON.stringify(results, null, 2);
  }

  fs.writeFileSync(outputPath, content);
  console.log(`\n📄 Results exported to: ${outputPath}`);
}

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(`
Territory Hierarchy Analyzer

Usage: node territory-hierarchy-analyzer.js <org-alias> <model-id> [options]

Options:
  --output=<path>     Export results to file
  --format=<type>     Output format: json, mermaid, text (default: json)
  --max-depth=<n>     Maximum depth to display in tree (default: 10)
  --max-nodes=<n>     Maximum nodes in Mermaid diagram (default: 100)

Examples:
  node territory-hierarchy-analyzer.js myorg 0MCxxxxxxxxxx
  node territory-hierarchy-analyzer.js myorg 0MCxxxxxxxxxx --output=hierarchy.json
  node territory-hierarchy-analyzer.js myorg 0MCxxxxxxxxxx --output=diagram.md --format=mermaid
`);
    process.exit(1);
  }

  const orgAlias = args[0];
  const modelId = args[1];

  // Parse options
  const options = {
    maxDepth: 10,
    maxNodes: 100
  };
  let outputPath = null;
  let outputFormat = 'json';

  for (const arg of args.slice(2)) {
    const match = arg.match(/^--([^=]+)=(.+)$/);
    if (match) {
      switch (match[1]) {
        case 'output':
          outputPath = match[2];
          break;
        case 'format':
          outputFormat = match[2];
          break;
        case 'max-depth':
          options.maxDepth = parseInt(match[2]);
          break;
        case 'max-nodes':
          options.maxNodes = parseInt(match[2]);
          break;
      }
    }
  }

  const results = analyzeHierarchy(orgAlias, modelId, options);

  if (outputPath) {
    exportResults(results, outputPath, outputFormat);
  }

  // Exit with error if issues found
  process.exit(results.health?.isHealthy ? 0 : 1);
}

module.exports = {
  buildTree,
  detectCycles,
  detectOrphans,
  calculateMetrics,
  generateMermaidDiagram,
  generateTextTree,
  analyzeHierarchy,
  exportResults
};
