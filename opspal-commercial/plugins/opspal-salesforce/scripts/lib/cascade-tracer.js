/**
 * Cascade Tracer - Automation Chain Analysis with Performance Estimates
 *
 * Purpose: Traces automation execution chains (cascades) through dependency graphs,
 * identifies representative examples, estimates performance impact, and detects
 * circular dependencies that could cause infinite loops.
 *
 * Cascade Types Detected:
 * - Sequential: Trigger → Helper Class → Subflow → Process Builder
 * - Circular: Account Trigger → Opportunity Update → Account Update → loop
 * - Fan-out: Single trigger spawning multiple async processes
 * - Critical Path: Key business processes (Quote → Subscription → Invoice)
 *
 * Performance Estimates:
 * - DML operations count (max 150 per transaction)
 * - SOQL queries count (max 100 per transaction)
 * - Heap size usage (estimated)
 * - CPU time (estimated)
 *
 * @author Automation Audit System v2.0
 * @version 2.0.0
 * @date 2025-10-09
 */

const fs = require('fs');
const path = require('path');

class CascadeTracer {
  constructor(dependencyGraph) {
    this.graph = dependencyGraph;
    this.cascades = [];
    this.circularDependencies = [];
  }

  /**
   * Trace all automation cascades
   * @returns {Object} Cascade analysis results
   */
  trace() {
    console.log('🔍 Tracing automation cascades...\n');

    try {
      // Phase 1: Build cascade chains
      console.log('Phase 1: Building cascade chains...');
      this.buildCascades();
      console.log(`✓ Found ${this.cascades.length} cascades\n`);

      // Phase 2: Detect circular dependencies
      console.log('Phase 2: Detecting circular dependencies...');
      this.detectCircularDependencies();
      console.log(`✓ Found ${this.circularDependencies.length} circular dependencies\n`);

      // Phase 3: Select representative examples
      console.log('Phase 3: Selecting representative examples...');
      const examples = this.selectRepresentativeExamples(5);
      console.log(`✓ Selected ${examples.length} representative cascades\n`);

      // Phase 4: Estimate performance impact
      console.log('Phase 4: Estimating performance impact...');
      examples.forEach(cascade => {
        cascade.performanceEstimate = this.estimatePerformance(cascade);
      });
      console.log(`✓ Performance estimates complete\n`);

      console.log('✅ Cascade tracing complete!\n');

      return {
        totalCascades: this.cascades.length,
        circularDependencies: this.circularDependencies,
        representativeExamples: examples,
        statistics: this.generateStatistics()
      };

    } catch (error) {
      console.error('❌ Cascade tracing failed:', error.message);
      throw error;
    }
  }

  /**
   * Build cascade chains from dependency graph
   */
  buildCascades() {
    if (!this.graph || !this.graph.nodes || !this.graph.edges) {
      console.warn('⚠ Invalid dependency graph - skipping cascade building');
      this.cascades = [];
      return;
    }

    // Find all entry points (triggers, scheduled flows)
    const entryPoints = this.graph.nodes.filter(node =>
      node.type === 'ApexTrigger' ||
      (node.type === 'Flow' && node.processType === 'Scheduled')
    );

    // Trace from each entry point
    entryPoints.forEach(entry => {
      const cascade = this.traceCascade(entry, [], new Set());
      if (cascade.length > 1) { // Only include cascades with >1 component
        this.cascades.push({
          id: `cascade_${entry.id}`,
          name: this.generateCascadeName(cascade),
          entry: entry.name,
          entryType: entry.type,
          chain: cascade,
          hops: cascade.length,
          objects: this.extractObjects(cascade),
          types: this.extractTypes(cascade),
          riskScore: this.calculateCascadeRisk(cascade)
        });
      }
    });
  }

  /**
   * Trace cascade from a starting node
   * @param {Object} node - Starting node
   * @param {Array} visited - Visited nodes in chain
   * @param {Set} visitedIds - Set of visited node IDs (for cycle detection)
   * @returns {Array} Cascade chain
   */
  traceCascade(node, visited, visitedIds) {
    // Add current node to chain
    const chain = [...visited, node];

    // Check for circular dependency
    if (visitedIds.has(node.id)) {
      return chain; // Stop to prevent infinite loop
    }

    // Mark as visited
    visitedIds.add(node.id);

    // Find outgoing edges (what this node invokes/calls)
    const outgoingEdges = this.graph.edges.filter(edge =>
      edge.from === node.id && edge.type === 'invokes'
    );

    // If no outgoing edges, return current chain
    if (outgoingEdges.length === 0) {
      return chain;
    }

    // Follow the first outgoing edge (depth-first)
    const nextNode = this.graph.nodes.find(n => n.id === outgoingEdges[0].to);
    if (nextNode) {
      return this.traceCascade(nextNode, chain, new Set(visitedIds));
    }

    return chain;
  }

  /**
   * Detect circular dependencies in automation chains
   */
  detectCircularDependencies() {
    if (!this.graph || !this.graph.edges) {
      this.circularDependencies = [];
      return;
    }

    // Use depth-first search to find cycles
    const visited = new Set();
    const recursionStack = new Set();
    const cycles = [];

    const dfs = (nodeId, path) => {
      if (recursionStack.has(nodeId)) {
        // Found a cycle
        const cycleStart = path.indexOf(nodeId);
        const cycle = path.slice(cycleStart);
        cycles.push(cycle);
        return;
      }

      if (visited.has(nodeId)) {
        return;
      }

      visited.add(nodeId);
      recursionStack.add(nodeId);
      path.push(nodeId);

      // Find outgoing edges
      const outgoing = this.graph.edges.filter(e => e.from === nodeId);
      outgoing.forEach(edge => {
        dfs(edge.to, [...path]);
      });

      recursionStack.delete(nodeId);
    };

    // Start DFS from each node
    this.graph.nodes.forEach(node => {
      if (!visited.has(node.id)) {
        dfs(node.id, []);
      }
    });

    // Convert cycle IDs to node objects
    this.circularDependencies = cycles.map(cycle => {
      const nodes = cycle.map(id => this.graph.nodes.find(n => n.id === id)).filter(Boolean);
      return {
        cycle: nodes.map(n => n.name).join(' → '),
        objects: [...new Set(nodes.map(n => n.object).filter(Boolean))],
        components: nodes,
        severity: 'CRITICAL',
        impact: 'Infinite loop risk - recursion until governor limits hit',
        recommendation: 'Add static flags or conditional logic to break cycle'
      };
    });
  }

  /**
   * Select 5 representative cascade examples
   * @param {number} count - Number of examples to select
   * @returns {Array} Representative cascades
   */
  selectRepresentativeExamples(count = 5) {
    const examples = [];

    // Example 1: Longest cascade chain
    const longestChain = this.cascades.sort((a, b) => b.hops - a.hops)[0];
    if (longestChain) {
      examples.push({
        ...longestChain,
        exampleType: 'LONGEST_CHAIN',
        description: `Longest automation chain with ${longestChain.hops} hops`
      });
    }

    // Example 2: Highest risk score
    const highestRisk = this.cascades
      .filter(c => !examples.find(e => e.id === c.id))
      .sort((a, b) => b.riskScore - a.riskScore)[0];
    if (highestRisk) {
      examples.push({
        ...highestRisk,
        exampleType: 'HIGHEST_RISK',
        description: `Highest risk cascade (score: ${highestRisk.riskScore}/100)`
      });
    }

    // Example 3: CPQ critical path (Quote-related)
    const cpqCascade = this.cascades
      .filter(c => !examples.find(e => e.id === c.id))
      .find(c =>
        c.objects.some(obj => obj.includes('Quote') || obj.includes('SBQQ'))
      );
    if (cpqCascade) {
      examples.push({
        ...cpqCascade,
        exampleType: 'CPQ_CRITICAL_PATH',
        description: 'Critical Quote-to-Cash automation path'
      });
    }

    // Example 4: Lead-to-Opportunity conversion
    const leadConversion = this.cascades
      .filter(c => !examples.find(e => e.id === c.id))
      .find(c =>
        (c.objects.includes('Lead') && c.objects.includes('Opportunity')) ||
        c.name.toLowerCase().includes('conversion')
      );
    if (leadConversion) {
      examples.push({
        ...leadConversion,
        exampleType: 'LEAD_CONVERSION',
        description: 'Lead to Opportunity conversion automation'
      });
    }

    // Example 5: Post-close (Case, Subscription, or Support)
    const postClose = this.cascades
      .filter(c => !examples.find(e => e.id === c.id))
      .find(c =>
        c.objects.some(obj =>
          obj.includes('Case') ||
          obj.includes('Subscription') ||
          obj.includes('Support') ||
          obj.includes('Renewal')
        )
      );
    if (postClose) {
      examples.push({
        ...postClose,
        exampleType: 'POST_CLOSE',
        description: 'Post-sale customer success or support automation'
      });
    }

    // If we don't have 5 examples, fill with next highest risk
    while (examples.length < count && examples.length < this.cascades.length) {
      const next = this.cascades
        .filter(c => !examples.find(e => e.id === c.id))
        .sort((a, b) => b.riskScore - a.riskScore)[0];
      if (next) {
        examples.push({
          ...next,
          exampleType: 'ADDITIONAL_RISK',
          description: `Additional high-risk cascade (score: ${next.riskScore}/100)`
        });
      } else {
        break;
      }
    }

    return examples;
  }

  /**
   * Estimate performance impact of cascade
   * @param {Object} cascade - Cascade data
   * @returns {Object} Performance estimates
   */
  estimatePerformance(cascade) {
    let totalDML = 0;
    let totalSOQL = 0;
    let estimatedHeap = 0;
    let estimatedCPU = 0;

    cascade.chain.forEach(component => {
      // Estimate based on component type
      if (component.type === 'ApexTrigger') {
        // Triggers typically have 1-5 DML, 1-3 SOQL
        totalDML += 3; // Average
        totalSOQL += 2; // Average
        estimatedCPU += 500; // ms
        estimatedHeap += 100; // KB
      } else if (component.type === 'ApexClass') {
        // Helper classes vary widely
        totalDML += 2;
        totalSOQL += 1;
        estimatedCPU += 300;
        estimatedHeap += 50;
      } else if (component.type === 'Flow') {
        // Flows typically lighter than Apex
        totalDML += 1;
        totalSOQL += 1;
        estimatedCPU += 200;
        estimatedHeap += 30;
      } else if (component.processType === 'Workflow') {
        // Process Builder/Workflows
        totalDML += 1;
        totalSOQL += 0;
        estimatedCPU += 100;
        estimatedHeap += 20;
      }
    });

    // Calculate governor limit pressure
    const dmlPressure = (totalDML / 150) * 100; // 150 DML limit
    const soqlPressure = (totalSOQL / 100) * 100; // 100 SOQL limit
    const heapPressure = (estimatedHeap / 6144) * 100; // 6MB heap limit
    const cpuPressure = (estimatedCPU / 10000) * 100; // 10s CPU limit

    const governorRisk = Math.max(dmlPressure, soqlPressure, heapPressure, cpuPressure);

    return {
      totalDML,
      totalSOQL,
      estimatedHeapKB: estimatedHeap,
      estimatedCPUms: estimatedCPU,
      governorLimitPressure: {
        dml: Math.round(dmlPressure),
        soql: Math.round(soqlPressure),
        heap: Math.round(heapPressure),
        cpu: Math.round(cpuPressure),
        overall: Math.round(governorRisk)
      },
      riskLevel: governorRisk > 70 ? 'HIGH' : governorRisk > 40 ? 'MEDIUM' : 'LOW',
      notes: this.generatePerformanceNotes(totalDML, totalSOQL, governorRisk)
    };
  }

  /**
   * Generate performance notes
   * @param {number} dml - DML count
   * @param {number} soql - SOQL count
   * @param {number} risk - Risk percentage
   * @returns {string} Performance notes
   */
  generatePerformanceNotes(dml, soql, risk) {
    const notes = [];

    if (dml > 100) {
      notes.push(`High DML usage (${dml} ops) - risk of hitting 150 limit in bulk operations`);
    }

    if (soql > 50) {
      notes.push(`High SOQL usage (${soql} queries) - risk of hitting 100 limit`);
    }

    if (risk > 70) {
      notes.push('CRITICAL governor limit risk - consider async processing or optimization');
    } else if (risk > 40) {
      notes.push('Moderate governor limit risk - monitor in production');
    } else {
      notes.push('Low governor limit risk - within safe thresholds');
    }

    return notes.join('. ');
  }

  /**
   * Calculate cascade risk score
   * @param {Array} chain - Cascade chain
   * @returns {number} Risk score (0-100)
   */
  calculateCascadeRisk(chain) {
    let score = 0;

    // Longer chains = higher risk
    score += Math.min(chain.length * 10, 40);

    // Mixed automation types = higher risk
    const types = new Set(chain.map(c => c.type));
    if (types.size > 2) {
      score += 20;
    }

    // Check for critical objects
    const criticalObjects = ['Account', 'Opportunity', 'Quote', 'Contract', 'SBQQ__Quote__c'];
    const hasCriticalObject = chain.some(c =>
      criticalObjects.some(obj => (c.object || '').includes(obj))
    );
    if (hasCriticalObject) {
      score += 20;
    }

    // Cross-object cascades = higher risk
    const uniqueObjects = new Set(chain.map(c => c.object).filter(Boolean));
    if (uniqueObjects.size > 3) {
      score += 15;
    }

    // Recent modifications = potential instability
    const recentMods = chain.filter(c => {
      if (!c.lastModified) return false;
      const modDate = new Date(c.lastModified);
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      return modDate > threeMonthsAgo;
    });

    if (recentMods.length > chain.length / 2) {
      score += 5;
    }

    return Math.min(score, 100);
  }

  /**
   * Generate cascade name from chain
   * @param {Array} chain - Cascade chain
   * @returns {string} Descriptive name
   */
  generateCascadeName(chain) {
    if (chain.length === 0) return 'Empty Cascade';

    const objects = this.extractObjects(chain);

    if (objects.length === 1) {
      return `${objects[0]} Automation Chain`;
    } else if (objects.length <= 3) {
      return `${objects.join(' → ')} Flow`;
    } else {
      return `${objects[0]} → ... → ${objects[objects.length - 1]} (${objects.length} objects)`;
    }
  }

  /**
   * Extract unique objects from cascade chain
   * @param {Array} chain - Cascade chain
   * @returns {Array} Unique object names
   */
  extractObjects(chain) {
    return [...new Set(chain.map(c => c.object).filter(Boolean))];
  }

  /**
   * Extract automation types from cascade chain
   * @param {Array} chain - Cascade chain
   * @returns {Array} Unique automation types
   */
  extractTypes(chain) {
    return [...new Set(chain.map(c => c.type))];
  }

  /**
   * Generate cascade statistics
   * @returns {Object} Statistics
   */
  generateStatistics() {
    const stats = {
      totalCascades: this.cascades.length,
      avgChainLength: 0,
      maxChainLength: 0,
      circularDependencies: this.circularDependencies.length,
      highRiskCascades: 0,
      mediumRiskCascades: 0,
      lowRiskCascades: 0
    };

    if (this.cascades.length > 0) {
      stats.avgChainLength = Math.round(
        this.cascades.reduce((sum, c) => sum + c.hops, 0) / this.cascades.length
      );
      stats.maxChainLength = Math.max(...this.cascades.map(c => c.hops));

      stats.highRiskCascades = this.cascades.filter(c => c.riskScore >= 70).length;
      stats.mediumRiskCascades = this.cascades.filter(c => c.riskScore >= 40 && c.riskScore < 70).length;
      stats.lowRiskCascades = this.cascades.filter(c => c.riskScore < 40).length;
    }

    return stats;
  }

  /**
   * Export cascades to JSON
   * @param {Object} results - Cascade analysis results
   * @param {string} outputPath - Output directory
   */
  exportToJSON(results, outputPath) {
    const timestamp = new Date().toISOString().split('T')[0];

    fs.writeFileSync(
      path.join(outputPath, `automation-cascades-${timestamp}.json`),
      JSON.stringify(results, null, 2)
    );

    console.log(`✓ Cascade data exported to ${outputPath}`);
  }

  /**
   * Generate cascade summary report
   * @param {Object} results - Cascade analysis results
   * @returns {string} Markdown report
   */
  generateSummaryReport(results) {
    const { statistics, representativeExamples, circularDependencies } = results;

    let report = `# Automation Cascade Analysis\n\n`;
    report += `**Date**: ${new Date().toISOString().split('T')[0]}\n\n`;

    report += `## Statistics\n\n`;
    report += `- **Total Cascades**: ${statistics.totalCascades}\n`;
    report += `- **Average Chain Length**: ${statistics.avgChainLength} hops\n`;
    report += `- **Longest Chain**: ${statistics.maxChainLength} hops\n`;
    report += `- **Circular Dependencies**: ${statistics.circularDependencies}\n`;
    report += `- **High Risk Cascades**: ${statistics.highRiskCascades}\n`;
    report += `- **Medium Risk Cascades**: ${statistics.mediumRiskCascades}\n`;
    report += `- **Low Risk Cascades**: ${statistics.lowRiskCascades}\n\n`;

    if (circularDependencies.length > 0) {
      report += `## ⚠️ Circular Dependencies (CRITICAL)\n\n`;
      circularDependencies.forEach((cycle, idx) => {
        report += `### Circular Dependency ${idx + 1}\n`;
        report += `**Chain**: ${cycle.cycle}\n`;
        report += `**Objects Involved**: ${cycle.objects.join(', ')}\n`;
        report += `**Impact**: ${cycle.impact}\n`;
        report += `**Recommendation**: ${cycle.recommendation}\n\n`;
      });
    }

    report += `## Representative Cascade Examples\n\n`;
    representativeExamples.forEach((example, idx) => {
      report += `### Example ${idx + 1}: ${example.exampleType.replace(/_/g, ' ')}\n`;
      report += `**Name**: ${example.name}\n`;
      report += `**Chain**: ${example.chain.map(c => c.name).join(' → ')}\n`;
      report += `**Objects**: ${example.objects.join(', ')}\n`;
      report += `**Hops**: ${example.hops}\n`;
      report += `**Risk Score**: ${example.riskScore}/100\n\n`;

      if (example.performanceEstimate) {
        const perf = example.performanceEstimate;
        report += `**Performance Estimate**:\n`;
        report += `- DML Operations: ${perf.totalDML} (${perf.governorLimitPressure.dml}% of limit)\n`;
        report += `- SOQL Queries: ${perf.totalSOQL} (${perf.governorLimitPressure.soql}% of limit)\n`;
        report += `- Heap Usage: ~${perf.estimatedHeapKB}KB (${perf.governorLimitPressure.heap}% of limit)\n`;
        report += `- CPU Time: ~${perf.estimatedCPUms}ms (${perf.governorLimitPressure.cpu}% of limit)\n`;
        report += `- Risk Level: ${perf.riskLevel}\n`;
        report += `- Notes: ${perf.notes}\n\n`;
      }

      report += `---\n\n`;
    });

    return report;
  }
}

// CLI Usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: node cascade-tracer.js <dependency-graph.json> <output-dir>');
    console.error('');
    console.error('Example:');
    console.error('  node cascade-tracer.js audit/dependency-graph.json ./output/');
    process.exit(1);
  }

  const graphFile = args[0];
  const outputDir = args[1];

  try {
    // Load dependency graph
    const graph = JSON.parse(fs.readFileSync(graphFile, 'utf-8'));
    console.log(`📊 Loaded dependency graph with ${graph.nodes?.length || 0} nodes\n`);

    // Create tracer
    const tracer = new CascadeTracer(graph);

    // Trace cascades
    const results = tracer.trace();

    // Export to JSON
    tracer.exportToJSON(results, outputDir);

    // Generate summary report
    const summaryReport = tracer.generateSummaryReport(results);
    fs.writeFileSync(
      path.join(outputDir, 'automation-cascades-summary.md'),
      summaryReport
    );

    console.log('\n' + summaryReport);
    console.log(`\n✅ Cascade analysis complete! Files saved to: ${outputDir}`);

  } catch (error) {
    console.error('\n❌ Cascade analysis failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

module.exports = CascadeTracer;
