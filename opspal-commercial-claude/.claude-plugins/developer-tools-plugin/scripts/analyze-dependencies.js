#!/usr/bin/env node

/**
 * analyze-dependencies.js
 *
 * Analyzes plugin dependencies, detects conflicts, builds dependency graphs
 * Prevents version conflicts and circular dependencies in plugin marketplace
 *
 * Usage:
 *   node analyze-dependencies.js [options]
 *
 * Options:
 *   --plugin=<name>       Analyze specific plugin only
 *   --all                 Analyze all plugins
 *   --check-circular      Detect circular dependencies
 *   --check-compatibility Check version compatibility
 *   --graph               Generate dependency graph
 *   --output=<format>     Output format (json, csv, mermaid, text)
 *   --find-dependents <plugin>  Find plugins that depend on this one
 *   --impact <plugin> <version> Calculate breaking change impact
 *   --strict              Fail on any issues (for CI/CD)
 *   --verbose             Detailed output
 *
 * Examples:
 *   node analyze-dependencies.js --plugin=salesforce-plugin
 *   node analyze-dependencies.js --all --check-circular
 *   node analyze-dependencies.js --graph --output=mermaid
 *   node analyze-dependencies.js --find-dependents developer-tools-plugin
 *   node analyze-dependencies.js --impact developer-tools-plugin 3.0.0
 */

const fs = require('fs/promises');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const PLUGINS_DIR = path.join(process.cwd(), '.claude-plugins');

class DependencyAnalyzer {
  constructor(options = {}) {
    this.options = options;
    this.plugins = new Map();
    this.graph = {
      nodes: [],
      edges: []
    };
    this.issues = {
      circularDependencies: [],
      versionConflicts: [],
      missingDependencies: [],
      orphanedPlugins: []
    };
  }

  async analyze() {
    console.log('\n🔍 Analyzing plugin dependencies...\n');

    // 1. Discover all plugins
    await this.discoverPlugins();

    // 2. Build dependency graph
    await this.buildGraph();

    // 3. Perform analysis
    if (this.options.checkCircular) {
      await this.detectCircularDependencies();
    }

    if (this.options.checkCompatibility) {
      await this.checkVersionCompatibility();
    }

    // 4. Generate report
    await this.generateReport();

    return {
      plugins: Array.from(this.plugins.values()),
      graph: this.graph,
      issues: this.issues
    };
  }

  async discoverPlugins() {
    const pluginFilter = this.options.plugin;

    try {
      const entries = await fs.readdir(PLUGINS_DIR, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (pluginFilter && entry.name !== pluginFilter) continue;

        const pluginPath = path.join(PLUGINS_DIR, entry.name);
        const manifestPath = path.join(pluginPath, '.claude-plugin', 'plugin.json');

        try {
          const manifestContent = await fs.readFile(manifestPath, 'utf-8');
          const manifest = JSON.parse(manifestContent);

          // Read package.json if it exists
          let packageJson = null;
          try {
            const pkgPath = path.join(pluginPath, 'package.json');
            const pkgContent = await fs.readFile(pkgPath, 'utf-8');
            packageJson = JSON.parse(pkgContent);
          } catch (error) {
            // No package.json, that's okay - optional dependency
          }

          this.plugins.set(entry.name, {
            name: entry.name,
            version: manifest.version || '0.0.0',
            manifest,
            packageJson,
            path: pluginPath,
            installed: true
          });

          if (this.options.verbose) {
            console.log(`   ✅ Discovered ${entry.name}@${manifest.version}`);
          }
        } catch (error) {
          console.log(`   ⚠️  Skipping ${entry.name}: ${error.message}`);
          // Continue with other plugins - graceful degradation in discovery
        }
      }

      console.log(`\n   Found ${this.plugins.size} plugins\n`);
    } catch (error) {
      throw new Error(`Failed to discover plugins: ${error.message}`);
    }
  }

  async buildGraph() {
    // Build nodes
    for (const [name, plugin] of this.plugins) {
      this.graph.nodes.push({
        id: name,
        version: plugin.version,
        installed: plugin.installed
      });
    }

    // Build edges
    for (const [name, plugin] of this.plugins) {
      const dependencies = plugin.manifest.dependencies || {};
      const optionalDeps = plugin.manifest.optionalDependencies || {};
      const peerDeps = plugin.manifest.peerDependencies || {};

      // Required dependencies
      for (const [depName, versionRange] of Object.entries(dependencies)) {
        const depPlugin = this.plugins.get(depName);
        this.graph.edges.push({
          from: name,
          to: depName,
          type: 'required',
          versionRange,
          satisfied: depPlugin && this.isVersionCompatible(depPlugin.version, versionRange),
          installed: !!depPlugin
        });
      }

      // Optional dependencies
      for (const [depName, versionRange] of Object.entries(optionalDeps)) {
        const depPlugin = this.plugins.get(depName);
        this.graph.edges.push({
          from: name,
          to: depName,
          type: 'optional',
          versionRange,
          satisfied: !depPlugin || this.isVersionCompatible(depPlugin.version, versionRange),
          installed: !!depPlugin
        });
      }

      // Peer dependencies
      for (const [depName, versionRange] of Object.entries(peerDeps)) {
        const depPlugin = this.plugins.get(depName);
        this.graph.edges.push({
          from: name,
          to: depName,
          type: 'peer',
          versionRange,
          satisfied: depPlugin && this.isVersionCompatible(depPlugin.version, versionRange),
          installed: !!depPlugin
        });
      }
    }
  }

  isVersionCompatible(version, range) {
    // Simple semver compatibility check
    // In production, use semver npm package for robust checking

    const cleanVersion = version.replace(/^v/, '');
    const cleanRange = range.replace(/^[\^~]/, '');

    const [vMajor, vMinor = 0, vPatch = 0] = cleanVersion.split('.').map(Number);
    const [rMajor, rMinor = 0, rPatch = 0] = cleanRange.split('.').map(Number);

    if (range.startsWith('^')) {
      // Caret: compatible with same major version
      return vMajor === rMajor && (vMinor > rMinor || (vMinor === rMinor && vPatch >= rPatch));
    } else if (range.startsWith('~')) {
      // Tilde: compatible with same minor version
      return vMajor === rMajor && vMinor === rMinor && vPatch >= rPatch;
    } else if (range === '*') {
      // Any version
      return true;
    } else {
      // Exact match
      return cleanVersion === cleanRange;
    }
  }

  async detectCircularDependencies() {
    console.log('🔄 Checking for circular dependencies...\n');

    const visited = new Set();
    const recStack = new Set();

    const detectCycle = (node, path = []) => {
      if (recStack.has(node)) {
        // Cycle detected
        const cycleStart = path.indexOf(node);
        const cycle = [...path.slice(cycleStart), node];
        this.issues.circularDependencies.push(cycle);
        return true;
      }

      if (visited.has(node)) {
        return false;
      }

      visited.add(node);
      recStack.add(node);
      path.push(node);

      // Check all outgoing edges
      const outgoingEdges = this.graph.edges.filter(e => e.from === node && e.type === 'required');
      for (const edge of outgoingEdges) {
        if (detectCycle(edge.to, [...path])) {
          // Cycle found in recursion
        }
      }

      recStack.delete(node);
      return false;
    };

    for (const node of this.graph.nodes) {
      if (!visited.has(node.id)) {
        detectCycle(node.id);
      }
    }

    if (this.issues.circularDependencies.length > 0) {
      console.log(`   ❌ Found ${this.issues.circularDependencies.length} circular dependencies:\n`);
      for (const cycle of this.issues.circularDependencies) {
        console.log(`      ${cycle.join(' → ')}`);
      }
      console.log('');
    } else {
      console.log('   ✅ No circular dependencies detected\n');
    }
  }

  async checkVersionCompatibility() {
    console.log('🔍 Checking version compatibility...\n');

    for (const edge of this.graph.edges) {
      if (edge.type === 'required' && !edge.satisfied) {
        const depPlugin = this.plugins.get(edge.to);

        if (!depPlugin) {
          this.issues.missingDependencies.push({
            plugin: edge.from,
            dependency: edge.to,
            versionRange: edge.versionRange
          });
        } else {
          this.issues.versionConflicts.push({
            plugin: edge.from,
            dependency: edge.to,
            required: edge.versionRange,
            installed: depPlugin.version,
            compatible: false
          });
        }
      }
    }

    if (this.issues.versionConflicts.length > 0) {
      console.log(`   ⚠️  Found ${this.issues.versionConflicts.length} version conflicts:\n`);
      for (const conflict of this.issues.versionConflicts) {
        console.log(`      ${conflict.plugin} requires ${conflict.dependency}@${conflict.required}`);
        console.log(`      but ${conflict.installed} is installed\n`);
      }
    } else {
      console.log('   ✅ No version conflicts detected\n');
    }

    if (this.issues.missingDependencies.length > 0) {
      console.log(`   ⚠️  Found ${this.issues.missingDependencies.length} missing dependencies:\n`);
      for (const missing of this.issues.missingDependencies) {
        console.log(`      ${missing.plugin} requires ${missing.dependency}@${missing.versionRange}`);
        console.log(`      but it is not installed\n`);
      }
    }
  }

  calculateDependents(pluginName) {
    const dependents = [];

    for (const edge of this.graph.edges) {
      if (edge.to === pluginName) {
        const plugin = this.plugins.get(edge.from);
        dependents.push({
          name: edge.from,
          version: plugin ? plugin.version : 'unknown',
          type: edge.type
        });
      }
    }

    return dependents;
  }

  calculateImpact(pluginName, newVersion) {
    const dependents = this.calculateDependents(pluginName);

    const impact = {
      plugin: pluginName,
      currentVersion: this.plugins.get(pluginName)?.version,
      newVersion,
      isBreaking: this.isBreakingChange(
        this.plugins.get(pluginName)?.version,
        newVersion
      ),
      affectedPlugins: {
        direct: [],
        indirect: []
      }
    };

    // Direct dependents
    for (const dep of dependents) {
      const edge = this.graph.edges.find(e => e.from === dep.name && e.to === pluginName);
      const willBreak = !this.isVersionCompatible(newVersion, edge.versionRange);

      impact.affectedPlugins.direct.push({
        ...dep,
        willBreak,
        currentRange: edge.versionRange,
        mustUpdate: willBreak
      });

      // Indirect dependents (transitive)
      if (willBreak) {
        const indirectDeps = this.calculateDependents(dep.name);
        impact.affectedPlugins.indirect.push(...indirectDeps.map(d => d.name));
      }
    }

    return impact;
  }

  isBreakingChange(oldVersion, newVersion) {
    const [oldMajor] = (oldVersion || '0.0.0').split('.').map(Number);
    const [newMajor] = (newVersion || '0.0.0').split('.').map(Number);
    return newMajor > oldMajor;
  }

  async generateReport() {
    const format = this.options.output || 'text';

    switch (format) {
      case 'json':
        await this.generateJSONReport();
        break;
      case 'csv':
        await this.generateCSVReport();
        break;
      case 'mermaid':
        await this.generateMermaidReport();
        break;
      case 'text':
      default:
        await this.generateTextReport();
        break;
    }
  }

  async generateTextReport() {
    if (this.options.plugin) {
      // Single plugin report
      const plugin = this.plugins.get(this.options.plugin);
      if (!plugin) {
        console.log(`❌ Plugin '${this.options.plugin}' not found`);
        return;
      }

      console.log(`📦 ${plugin.name} v${plugin.version}\n`);

      // Dependencies
      const deps = this.graph.edges.filter(e => e.from === plugin.name);
      if (deps.length > 0) {
        console.log(`Dependencies (${deps.length}):`);
        for (const dep of deps) {
          const icon = dep.satisfied ? '✅' : '❌';
          const typeLabel = dep.type === 'optional' ? '(optional)' : '';
          const depPlugin = this.plugins.get(dep.to);
          const version = depPlugin ? `v${depPlugin.version}` : 'NOT INSTALLED';
          console.log(`   ${icon} ${dep.to}@${dep.versionRange} ${typeLabel} → ${version}`);
        }
        console.log('');
      }

      // Dependents
      const dependents = this.calculateDependents(plugin.name);
      if (dependents.length > 0) {
        console.log(`Dependents (${dependents.length} plugins depend on this):`);
        for (const dep of dependents) {
          console.log(`   ← ${dep.name}@${dep.version}`);
        }
        console.log('');
      }

      // Metrics
      const depth = this.calculateDepth(plugin.name);
      const fanOut = deps.length;
      const fanIn = dependents.length;

      console.log(`Metrics:`);
      console.log(`   Depth: ${depth}`);
      console.log(`   Fan-out: ${fanOut} (dependencies)`);
      console.log(`   Fan-in: ${fanIn} (dependents)`);
      console.log(`   Risk: ${this.calculateRisk(fanIn, fanOut)}`);
    } else {
      // All plugins summary
      console.log(`📊 Marketplace Summary\n`);
      console.log(`Total Plugins: ${this.plugins.size}`);
      console.log(`Total Dependencies: ${this.graph.edges.length}\n`);

      if (this.issues.circularDependencies.length > 0) {
        console.log(`❌ Circular Dependencies: ${this.issues.circularDependencies.length}`);
      }
      if (this.issues.versionConflicts.length > 0) {
        console.log(`⚠️  Version Conflicts: ${this.issues.versionConflicts.length}`);
      }
      if (this.issues.missingDependencies.length > 0) {
        console.log(`⚠️  Missing Dependencies: ${this.issues.missingDependencies.length}`);
      }

      if (this.issues.circularDependencies.length === 0 &&
          this.issues.versionConflicts.length === 0 &&
          this.issues.missingDependencies.length === 0) {
        console.log(`✅ No issues detected`);
      }
    }
  }

  calculateDepth(pluginName, visited = new Set()) {
    if (visited.has(pluginName)) return 0;
    visited.add(pluginName);

    const incomingEdges = this.graph.edges.filter(e => e.to === pluginName);
    if (incomingEdges.length === 0) return 0;

    const depths = incomingEdges.map(e => 1 + this.calculateDepth(e.from, new Set(visited)));
    return Math.max(...depths);
  }

  calculateRisk(fanIn, fanOut) {
    // Simple risk heuristic
    const score = (fanIn * 2) + fanOut;
    if (score === 0) return 'NONE';
    if (score < 3) return 'LOW';
    if (score < 6) return 'MEDIUM';
    if (score < 10) return 'HIGH';
    return 'CRITICAL';
  }

  async generateJSONReport() {
    const report = {
      marketplace: 'revpal-internal-plugins',
      analysis_date: new Date().toISOString(),
      total_plugins: this.plugins.size,
      plugins: Array.from(this.plugins.values()).map(p => ({
        name: p.name,
        version: p.version,
        dependencies: this.graph.edges.filter(e => e.from === p.name),
        dependents: this.calculateDependents(p.name),
        depth: this.calculateDepth(p.name)
      })),
      issues: this.issues
    };

    console.log(JSON.stringify(report, null, 2));
  }

  async generateCSVReport() {
    console.log('Plugin,Version,Dependencies,Dependents,Depth,Risk');

    for (const [name, plugin] of this.plugins) {
      const deps = this.graph.edges.filter(e => e.from === name).length;
      const dependents = this.calculateDependents(name).length;
      const depth = this.calculateDepth(name);
      const risk = this.calculateRisk(dependents, deps);

      console.log(`${name},${plugin.version},${deps},${dependents},${depth},${risk}`);
    }
  }

  async generateMermaidReport() {
    console.log('```mermaid');
    console.log('graph TD');

    // Add nodes
    for (const [name, plugin] of this.plugins) {
      const safeId = name.replace(/-/g, '_');
      console.log(`  ${safeId}[${name}<br/>v${plugin.version}]`);
    }

    // Add edges
    for (const edge of this.graph.edges) {
      const fromId = edge.from.replace(/-/g, '_');
      const toId = edge.to.replace(/-/g, '_');

      if (edge.type === 'required') {
        console.log(`  ${fromId} --> ${toId}`);
      } else if (edge.type === 'optional') {
        console.log(`  ${fromId} -.-> ${toId}`);
      }
    }

    console.log('```');
  }
}

// CLI Entry Point
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node analyze-dependencies.js [options]

Options:
  --plugin=<name>       Analyze specific plugin only
  --all                 Analyze all plugins
  --check-circular      Detect circular dependencies
  --check-compatibility Check version compatibility
  --graph               Generate dependency graph
  --output=<format>     Output format (json, csv, mermaid, text)
  --find-dependents <plugin>  Find plugins that depend on this one
  --impact <plugin> <version> Calculate breaking change impact
  --strict              Fail on any issues (for CI/CD)
  --verbose             Detailed output
  --help, -h            Show this help

Examples:
  node analyze-dependencies.js --plugin=salesforce-plugin
  node analyze-dependencies.js --all --check-circular
  node analyze-dependencies.js --graph --output=mermaid
  node analyze-dependencies.js --find-dependents developer-tools-plugin
  node analyze-dependencies.js --impact developer-tools-plugin 3.0.0
    `);
    process.exit(0);
  }

  const options = {
    plugin: args.find(a => a.startsWith('--plugin='))?.split('=')[1],
    all: args.includes('--all'),
    checkCircular: args.includes('--check-circular'),
    checkCompatibility: args.includes('--check-compatibility'),
    graph: args.includes('--graph'),
    output: args.find(a => a.startsWith('--output='))?.split('=')[1],
    strict: args.includes('--strict'),
    verbose: args.includes('--verbose')
  };

  const analyzer = new DependencyAnalyzer(options);

  if (args.includes('--find-dependents')) {
    const pluginIndex = args.indexOf('--find-dependents');
    const pluginName = args[pluginIndex + 1];

    await analyzer.discoverPlugins();
    await analyzer.buildGraph();

    const dependents = analyzer.calculateDependents(pluginName);
    console.log(`\n📦 Plugins that depend on ${pluginName}:\n`);
    for (const dep of dependents) {
      console.log(`   ${dep.name}@${dep.version} (${dep.type})`);
    }
    console.log('');
    process.exit(0);
  }

  if (args.includes('--impact')) {
    const impactIndex = args.indexOf('--impact');
    const pluginName = args[impactIndex + 1];
    const newVersion = args[impactIndex + 2];

    await analyzer.discoverPlugins();
    await analyzer.buildGraph();

    const impact = analyzer.calculateImpact(pluginName, newVersion);

    console.log(`\n🎯 Breaking Change Impact Analysis\n`);
    console.log(`Plugin: ${impact.plugin}`);
    console.log(`Current: v${impact.currentVersion}`);
    console.log(`New: v${impact.newVersion}`);
    console.log(`Breaking: ${impact.isBreaking ? '❌ YES' : '✅ NO'}\n`);

    if (impact.affectedPlugins.direct.length > 0) {
      console.log(`Direct Impact (${impact.affectedPlugins.direct.length} plugins):`);
      for (const plugin of impact.affectedPlugins.direct) {
        const status = plugin.willBreak ? '❌ WILL BREAK' : '✅ Compatible';
        console.log(`   ${plugin.name} ${status}`);
        if (plugin.willBreak) {
          console.log(`      Current range: ${plugin.currentRange}`);
          console.log(`      Must update to: ^${newVersion}`);
        }
      }
      console.log('');
    }

    if (impact.affectedPlugins.indirect.length > 0) {
      console.log(`Indirect Impact (${impact.affectedPlugins.indirect.length} plugins):`);
      console.log(`   ${[...new Set(impact.affectedPlugins.indirect)].join(', ')}\n`);
    }

    process.exit(0);
  }

  const result = await analyzer.analyze();

  if (options.strict) {
    const hasIssues =
      result.issues.circularDependencies.length > 0 ||
      result.issues.versionConflicts.length > 0 ||
      result.issues.missingDependencies.filter(m => m.type !== 'optional').length > 0;

    if (hasIssues) {
      console.log('\n❌ Dependency validation failed (strict mode)\n');
      process.exit(1);
    } else {
      console.log('\n✅ Dependency validation passed\n');
      process.exit(0);
    }
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { DependencyAnalyzer };
