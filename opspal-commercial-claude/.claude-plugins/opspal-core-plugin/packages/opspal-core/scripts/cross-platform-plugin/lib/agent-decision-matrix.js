#!/usr/bin/env node

/**
 * Agent Decision Matrix - Multi-Faceted Task Routing
 *
 * Decomposes complex tasks into facets and selects appropriate agent(s).
 *
 * Key Features:
 * - Task facet decomposition
 * - Agent capability matching
 * - Sequential orchestration planning
 * - Delegation logging
 *
 * Addresses: Cohort 6 (agent/selection) - 8 reflections, $12K ROI
 *
 * Prevention Target: Wrong agent selected for multi-faceted tasks
 *
 * Usage:
 *   const { AgentDecisionMatrix } = require('./agent-decision-matrix');
 *   const matrix = new AgentDecisionMatrix();
 *
 *   const decision = await matrix.analyze(taskDescription);
 *   // Returns:
 *   // {
 *   //   facets: [...],
 *   //   recommendedAgents: [...],
 *   //   executionPlan: [...],
 *   //   complexity: 0.0-1.0
 *   // }
 */

const fs = require('fs').promises;
const path = require('path');

class AgentDecisionMatrix {
  constructor(options = {}) {
    this.agentCapabilityFile = options.agentCapabilityFile || null;
    this.logDir = options.logDir || './.agent-decisions';

    // Task facet patterns
    this.facetPatterns = {
      analysis: {
        keywords: ['analyze', 'audit', 'review', 'assess', 'evaluate', 'inspect', 'examine'],
        agentCategories: ['discovery', 'auditor', 'analyzer', 'assessor']
      },
      modification: {
        keywords: ['update', 'modify', 'change', 'edit', 'adjust', 'fix', 'correct'],
        agentCategories: ['metadata', 'data-operations', 'orchestrator']
      },
      creation: {
        keywords: ['create', 'build', 'implement', 'add', 'generate', 'deploy'],
        agentCategories: ['builder', 'specialist', 'developer', 'metadata']
      },
      deletion: {
        keywords: ['delete', 'remove', 'clean', 'purge', 'archive'],
        agentCategories: ['data-operations', 'orchestrator']
      },
      migration: {
        keywords: ['migrate', 'move', 'transfer', 'copy', 'sync'],
        agentCategories: ['orchestrator', 'data-operations', 'bridge']
      },
      validation: {
        keywords: ['validate', 'verify', 'check', 'confirm', 'test'],
        agentCategories: ['validator', 'quality', 'analyzer']
      },
      reporting: {
        keywords: ['report', 'dashboard', 'analytics', 'metrics', 'summary'],
        agentCategories: ['reports', 'analytics', 'aggregator']
      },
      security: {
        keywords: ['permission', 'access', 'security', 'profile', 'role', 'sharing'],
        agentCategories: ['security', 'permission', 'admin']
      },
      orchestration: {
        keywords: ['workflow', 'process', 'automation', 'trigger', 'flow'],
        agentCategories: ['automation', 'workflow', 'orchestrator']
      }
    };

    // Agent complexity matrix
    this.complexityFactors = {
      multiPlatform: 0.3,        // Task spans SF + HS
      multiObject: 0.2,          // Multiple objects involved
      dataVolume: 0.2,           // High data volume (>1000 records)
      dependencies: 0.15,        // Object/field dependencies
      customLogic: 0.15          // Custom code/formula logic
    };
  }

  /**
   * Analyze task and recommend agent(s)
   *
   * @param {string} taskDescription - The task to analyze
   * @param {Object} options - Additional options
   * @returns {Object} - Analysis with agent recommendations
   */
  async analyze(taskDescription, options = {}) {
    const analysis = {
      originalTask: taskDescription,
      timestamp: new Date().toISOString(),
      facets: [],
      recommendedAgents: [],
      executionPlan: [],
      complexity: 0,
      requiresOrchestration: false,
      reasoning: []
    };

    // Decompose into facets
    analysis.facets = this._decomposeFacets(taskDescription);

    // Calculate complexity
    analysis.complexity = this._calculateComplexity(taskDescription, analysis.facets);

    // Load agent capabilities
    const agentCapabilities = await this._loadAgentCapabilities();

    // Match agents to facets
    analysis.recommendedAgents = this._matchAgents(analysis.facets, agentCapabilities);

    // Generate execution plan
    analysis.executionPlan = this._generateExecutionPlan(
      analysis.facets,
      analysis.recommendedAgents,
      analysis.complexity
    );

    // Determine if orchestration needed
    analysis.requiresOrchestration = analysis.recommendedAgents.length > 1 ||
                                     analysis.complexity > 0.7;

    // Generate reasoning
    analysis.reasoning = this._generateReasoning(analysis);

    return analysis;
  }

  /**
   * Decompose task into facets
   */
  _decomposeFacets(text) {
    const facets = [];
    const normalized = text.toLowerCase();

    Object.entries(this.facetPatterns).forEach(([facetType, config]) => {
      const matches = config.keywords.filter(keyword =>
        normalized.includes(keyword)
      );

      if (matches.length > 0) {
        facets.push({
          type: facetType,
          matchedKeywords: matches,
          priority: this._determineFacetPriority(facetType, text),
          agentCategories: config.agentCategories
        });
      }
    });

    // Sort by priority
    facets.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    return facets;
  }

  /**
   * Determine facet priority
   */
  _determineFacetPriority(facetType, text) {
    const normalized = text.toLowerCase();

    // Analysis usually comes first
    if (facetType === 'analysis' && normalized.match(/^(analyze|audit|review|assess)/)) {
      return 'high';
    }

    // Creation and modification are typically primary actions
    if (['creation', 'modification', 'migration'].includes(facetType)) {
      return 'high';
    }

    // Validation and reporting are often follow-ups
    if (['validation', 'reporting'].includes(facetType)) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Calculate task complexity
   */
  _calculateComplexity(text, facets) {
    let complexity = 0;
    const normalized = text.toLowerCase();

    // Multi-platform
    if (normalized.match(/\b(salesforce|hubspot)\b.*\b(salesforce|hubspot)\b/)) {
      complexity += this.complexityFactors.multiPlatform;
    }

    // Multi-object
    const objectCount = (normalized.match(/\b(account|contact|lead|opportunity|case|task|company|deal|ticket)s?\b/gi) || []).length;
    if (objectCount > 2) {
      complexity += this.complexityFactors.multiObject;
    }

    // Data volume indicators
    if (normalized.match(/\b(all|every|entire)\b/) || normalized.match(/\d{3,}/)) {
      complexity += this.complexityFactors.dataVolume;
    }

    // Dependencies
    if (normalized.match(/\b(related|dependent|linked|associated|connected)\b/)) {
      complexity += this.complexityFactors.dependencies;
    }

    // Custom logic
    if (normalized.match(/\b(custom|formula|trigger|apex|code|script)\b/)) {
      complexity += this.complexityFactors.customLogic;
    }

    // Multiple facets increase complexity
    if (facets.length > 2) {
      complexity += 0.1 * (facets.length - 2);
    }

    return Math.min(complexity, 1.0); // Cap at 1.0
  }

  /**
   * Load agent capabilities from file or use defaults
   */
  async _loadAgentCapabilities() {
    // If custom capability file provided, load it
    if (this.agentCapabilityFile) {
      try {
        const data = await fs.readFile(this.agentCapabilityFile, 'utf8');
        return JSON.parse(data);
      } catch (error) {
        console.warn(`Could not load agent capabilities from ${this.agentCapabilityFile}, using defaults`);
      }
    }

    // Default agent capabilities (subset for common agents)
    return {
      'sfdc-state-discovery': {
        categories: ['discovery', 'analyzer'],
        platforms: ['salesforce'],
        capabilities: ['metadata analysis', 'org state', 'object discovery'],
        complexity: 'low'
      },
      'sfdc-conflict-resolver': {
        categories: ['validator', 'metadata'],
        platforms: ['salesforce'],
        capabilities: ['conflict detection', 'deployment validation'],
        complexity: 'medium'
      },
      'sfdc-metadata-manager': {
        categories: ['metadata', 'orchestrator'],
        platforms: ['salesforce'],
        capabilities: ['metadata deployment', 'object creation', 'field management'],
        complexity: 'medium'
      },
      'sfdc-data-operations': {
        categories: ['data-operations'],
        platforms: ['salesforce'],
        capabilities: ['data import', 'data export', 'bulk operations'],
        complexity: 'medium'
      },
      'sfdc-merge-orchestrator': {
        categories: ['orchestrator', 'data-operations'],
        platforms: ['salesforce'],
        capabilities: ['record merging', 'object consolidation'],
        complexity: 'high'
      },
      'sfdc-security-admin': {
        categories: ['security', 'admin'],
        platforms: ['salesforce'],
        capabilities: ['permission management', 'profile management', 'sharing rules'],
        complexity: 'medium'
      },
      'sfdc-reports-dashboards': {
        categories: ['reports', 'analytics'],
        platforms: ['salesforce'],
        capabilities: ['report creation', 'dashboard design'],
        complexity: 'low'
      },
      'hubspot-workflow-orchestrator': {
        categories: ['workflow', 'orchestrator', 'automation'],
        platforms: ['hubspot'],
        capabilities: ['workflow creation', 'automation'],
        complexity: 'medium'
      },
      'hubspot-data-operations': {
        categories: ['data-operations'],
        platforms: ['hubspot'],
        capabilities: ['property creation', 'data import', 'bulk updates'],
        complexity: 'medium'
      },
      'unified-orchestrator': {
        categories: ['orchestrator'],
        platforms: ['salesforce', 'hubspot', 'cross-platform'],
        capabilities: ['multi-platform coordination', 'complex workflows'],
        complexity: 'high'
      },
      'unified-data-quality-validator': {
        categories: ['validator', 'quality', 'analyzer'],
        platforms: ['salesforce', 'hubspot', 'cross-platform'],
        capabilities: ['data validation', 'quality checks', 'sync validation'],
        complexity: 'medium'
      }
    };
  }

  /**
   * Match agents to task facets
   */
  _matchAgents(facets, agentCapabilities) {
    const matches = [];
    const seenAgents = new Set();

    facets.forEach(facet => {
      // Find agents that match this facet's categories
      Object.entries(agentCapabilities).forEach(([agentName, agentData]) => {
        const categoryMatch = facet.agentCategories.some(category =>
          agentData.categories.includes(category)
        );

        if (categoryMatch && !seenAgents.has(agentName)) {
          matches.push({
            agent: agentName,
            facet: facet.type,
            matchScore: this._calculateMatchScore(facet, agentData),
            capabilities: agentData.capabilities,
            complexity: agentData.complexity
          });
          seenAgents.add(agentName);
        }
      });
    });

    // Sort by match score
    matches.sort((a, b) => b.matchScore - a.matchScore);

    return matches;
  }

  /**
   * Calculate how well agent matches facet
   */
  _calculateMatchScore(facet, agentData) {
    let score = 0;

    // Category match (primary factor)
    const categoryMatches = facet.agentCategories.filter(category =>
      agentData.categories.includes(category)
    ).length;
    score += categoryMatches * 10;

    // Priority bonus
    if (facet.priority === 'high') {
      score += 5;
    }

    return score;
  }

  /**
   * Generate execution plan
   */
  _generateExecutionPlan(facets, recommendedAgents, complexity) {
    const plan = [];

    // If high complexity or multiple facets, orchestrate
    if (complexity > 0.7 || facets.length > 2) {
      plan.push({
        step: 1,
        phase: 'orchestration',
        agent: 'unified-orchestrator',
        description: 'Coordinate multi-faceted task execution',
        delegates: recommendedAgents.map(a => a.agent)
      });
      return plan;
    }

    // Otherwise, create sequential plan based on facet priorities
    let step = 1;

    // Discovery/analysis first
    const analysisFacets = facets.filter(f => f.type === 'analysis');
    if (analysisFacets.length > 0) {
      const analysisAgents = recommendedAgents.filter(a =>
        analysisFacets.some(f => f.type === a.facet)
      );

      analysisAgents.forEach(agent => {
        plan.push({
          step: step++,
          phase: 'analysis',
          agent: agent.agent,
          facet: agent.facet,
          description: `Analyze current state using ${agent.agent}`
        });
      });
    }

    // Then modifications/creations
    const actionFacets = facets.filter(f =>
      ['creation', 'modification', 'migration', 'deletion'].includes(f.type)
    );
    if (actionFacets.length > 0) {
      const actionAgents = recommendedAgents.filter(a =>
        actionFacets.some(f => f.type === a.facet)
      );

      actionAgents.forEach(agent => {
        plan.push({
          step: step++,
          phase: 'execution',
          agent: agent.agent,
          facet: agent.facet,
          description: `Execute ${agent.facet} using ${agent.agent}`
        });
      });
    }

    // Finally validation/reporting
    const verificationFacets = facets.filter(f =>
      ['validation', 'reporting'].includes(f.type)
    );
    if (verificationFacets.length > 0) {
      const verificationAgents = recommendedAgents.filter(a =>
        verificationFacets.some(f => f.type === a.facet)
      );

      verificationAgents.forEach(agent => {
        plan.push({
          step: step++,
          phase: 'verification',
          agent: agent.agent,
          facet: agent.facet,
          description: `Verify results using ${agent.agent}`
        });
      });
    }

    return plan;
  }

  /**
   * Generate human-readable reasoning
   */
  _generateReasoning(analysis) {
    const reasoning = [];

    reasoning.push(
      `Task complexity: ${(analysis.complexity * 100).toFixed(0)}% ` +
      `(${analysis.complexity < 0.3 ? 'simple' : analysis.complexity < 0.7 ? 'moderate' : 'complex'})`
    );

    reasoning.push(
      `Identified ${analysis.facets.length} task facet(s): ${analysis.facets.map(f => f.type).join(', ')}`
    );

    reasoning.push(
      `Recommended ${analysis.recommendedAgents.length} agent(s) for execution`
    );

    if (analysis.requiresOrchestration) {
      reasoning.push(
        'Orchestration recommended due to ' +
        (analysis.recommendedAgents.length > 1 ? 'multiple agents' : 'high complexity')
      );
    }

    return reasoning;
  }

  /**
   * Log decision for audit trail
   */
  async logDecision(analysis) {
    await fs.mkdir(this.logDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const filename = `decision-${timestamp}.json`;
    const filePath = path.join(this.logDir, filename);

    await fs.writeFile(filePath, JSON.stringify(analysis, null, 2));

    return filePath;
  }

  /**
   * Generate summary for display
   */
  generateSummary(analysis) {
    let summary = '# Agent Decision Matrix\n\n';

    summary += `**Task**: ${analysis.originalTask}\n\n`;

    summary += `**Complexity**: ${(analysis.complexity * 100).toFixed(0)}% `;
    summary += `(${analysis.complexity < 0.3 ? '🟢 Simple' : analysis.complexity < 0.7 ? '🟡 Moderate' : '🔴 Complex'})\n\n`;

    // Facets
    summary += '## Identified Facets\n\n';
    analysis.facets.forEach(facet => {
      const priorityIcon = facet.priority === 'high' ? '🔴' :
                          facet.priority === 'medium' ? '🟡' : '🟢';
      summary += `${priorityIcon} **${facet.type}** (${facet.priority} priority)\n`;
      summary += `   Keywords: ${facet.matchedKeywords.join(', ')}\n\n`;
    });

    // Recommended agents
    summary += '## Recommended Agents\n\n';
    analysis.recommendedAgents.slice(0, 5).forEach((agent, i) => {
      summary += `${i + 1}. **${agent.agent}** (score: ${agent.matchScore})\n`;
      summary += `   - Facet: ${agent.facet}\n`;
      summary += `   - Capabilities: ${agent.capabilities.join(', ')}\n`;
      summary += `   - Complexity: ${agent.complexity}\n\n`;
    });

    // Execution plan
    summary += '## Execution Plan\n\n';
    if (analysis.executionPlan.length > 0) {
      analysis.executionPlan.forEach(step => {
        summary += `**Step ${step.step}** (${step.phase}):\n`;
        summary += `   ${step.description}\n`;
        if (step.delegates) {
          summary += `   Delegates to: ${step.delegates.join(', ')}\n`;
        }
        summary += '\n';
      });
    } else {
      summary += '*No execution plan generated*\n\n';
    }

    // Reasoning
    summary += '## Reasoning\n\n';
    analysis.reasoning.forEach(reason => {
      summary += `- ${reason}\n`;
    });
    summary += '\n';

    return summary;
  }
}

// CLI interface
if (require.main === module) {
  const [,, ...args] = process.argv;
  const taskDescription = args.join(' ');

  if (!taskDescription) {
    console.log(`
Agent Decision Matrix - Multi-Faceted Task Routing

Usage:
  node agent-decision-matrix.js "<task description>"

Example:
  node agent-decision-matrix.js "Analyze and migrate all Account data from Salesforce to HubSpot"
    `);
    process.exit(1);
  }

  const matrix = new AgentDecisionMatrix();

  async function main() {
    console.log('Analyzing task...\n');

    const analysis = await matrix.analyze(taskDescription);
    const summary = matrix.generateSummary(analysis);

    console.log(summary);

    // Save decision log
    const logPath = await matrix.logDecision(analysis);
    console.log(`Decision log saved to: ${logPath}\n`);
  }

  main().catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
  });
}

module.exports = { AgentDecisionMatrix };
