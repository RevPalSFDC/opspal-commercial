#!/usr/bin/env node

/**
 * Interactive Agent Selector
 * Helps users find and invoke the right agent for their task
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');

// Agent database with enhanced metadata
const AGENTS = {
  'release-coordinator': {
    description: 'Orchestrates releases across all platforms',
    keywords: ['release', 'deploy', 'production', 'tag', 'merge to main'],
    complexity: 'HIGH',
    examples: [
      'I just merged to main',
      'Deploy v2.5.0 to production',
      'Create a new release'
    ],
    tools: ['Task', 'Read', 'Grep', 'Glob', 'Bash(git:*)']
  },
  
  'project-orchestrator': {
    description: 'Coordinates work across multiple repositories',
    keywords: ['multi-repo', 'across repos', 'coordinate', 'ClaudeSFDC and ClaudeHubSpot'],
    complexity: 'HIGH',
    examples: [
      'Update customer model in all repos',
      'Coordinate changes across platforms',
      'Multi-repository deployment'
    ],
    tools: ['Task', 'Read', 'Grep', 'Glob', 'Bash(git:*)']
  },
  
  'sequential-planner': {
    description: 'Plans complex tasks with unknown scope',
    keywords: ['complex', 'unknown scope', 'planning', '[SEQUENTIAL]', 'migrate'],
    complexity: 'HIGH',
    examples: [
      '[SEQUENTIAL] Design new system',
      'Complex migration with unknown dependencies',
      'Plan a fault-tolerant architecture'
    ],
    tools: ['sequential_thinking', 'Read', 'Write', 'Grep', 'Glob', 'TodoWrite']
  },
  
  'sfdc-conflict-resolver': {
    description: 'Resolves Salesforce deployment conflicts',
    keywords: ['deployment failed', 'conflict', 'field mismatch', 'field history tracking'],
    complexity: 'MEDIUM',
    examples: [
      'Deployment failed with field history errors',
      'Resolve metadata conflicts',
      'Fix deployment blockers'
    ],
    tools: ['mcp_salesforce', 'mcp_salesforce_metadata_describe', 'Read', 'Write']
  },
  
  'sfdc-merge-orchestrator': {
    description: 'Merges Salesforce objects and fields',
    keywords: ['merge fields', 'consolidate', 'combine objects'],
    complexity: 'HIGH',
    examples: [
      'Merge Customer_Status__c and Account_Status__c',
      'Consolidate duplicate fields',
      'Combine related objects'
    ],
    tools: ['mcp_salesforce', 'mcp_salesforce_metadata_deploy', 'TodoWrite', 'Task']
  },
  
  'sfdc-state-discovery': {
    description: 'Analyzes current Salesforce org state',
    keywords: ['current state', 'org state', 'drift detection', 'what is'],
    complexity: 'MEDIUM',
    examples: [
      'What is the current state of Account?',
      'Analyze org configuration',
      'Detect metadata drift'
    ],
    tools: ['mcp_salesforce', 'mcp_salesforce_metadata_describe', 'Write', 'Grep']
  },
  
  'sfdc-dependency-analyzer': {
    description: 'Maps Salesforce object dependencies',
    keywords: ['dependencies', 'circular dependency', 'analyze dependencies'],
    complexity: 'MEDIUM',
    examples: [
      'Analyze dependencies between objects',
      'Find circular dependencies',
      'Map field relationships'
    ],
    tools: ['mcp_salesforce', 'mcp_salesforce_field_describe', 'Write', 'TodoWrite']
  },
  
  'quality-control-analyzer': {
    description: 'Identifies recurring issues and patterns',
    keywords: ['recurring', 'keeps happening', 'friction', 'Claude keeps', 'pattern'],
    complexity: 'LOW',
    examples: [
      'Claude keeps making the same mistakes',
      'Review friction points from sprint',
      'Analyze recurring errors'
    ],
    tools: ['Read', 'Grep', 'Write', 'TodoWrite']
  },
  
  'gdrive-document-manager': {
    description: 'Manages Google Drive documents',
    keywords: ['Google Drive', 'document', 'specifications', 'requirements'],
    complexity: 'LOW',
    examples: [
      'Get API specs from Google Drive',
      'Access project documentation',
      'Retrieve requirements document'
    ],
    tools: ['gdrive', 'Read', 'Grep', 'Glob']
  },
  
  'gdrive-template-library': {
    description: 'Manages template library',
    keywords: ['template', 'email template', 'code pattern'],
    complexity: 'LOW',
    examples: [
      'Get onboarding email template',
      'Access code templates',
      'Retrieve workflow template'
    ],
    tools: ['gdrive', 'Read', 'Write', 'Glob']
  },
  
  'gdrive-report-exporter': {
    description: 'Exports reports to Google Sheets',
    keywords: ['export report', 'Google Sheets', 'report to Drive'],
    complexity: 'MEDIUM',
    examples: [
      'Export Salesforce reports to Sheets',
      'Create executive dashboard',
      'Generate analytics report'
    ],
    tools: ['gdrive', 'salesforce-dx', 'hubspot', 'Read', 'Write', 'Task']
  },
  
  'router-doctor': {
    description: 'Diagnoses agent discovery issues',
    keywords: ['agent not found', 'agent discovery', 'name collision'],
    complexity: 'LOW',
    examples: [
      'Agent not found error',
      'Fix agent discovery',
      'Resolve naming conflicts'
    ],
    tools: ['Read', 'Grep', 'Glob']
  },
  
  'mcp-guardian': {
    description: 'Validates MCP server configuration',
    keywords: ['MCP', 'tool mismatch', 'server validation'],
    complexity: 'LOW',
    examples: [
      'MCP server not working',
      'Tool mismatch error',
      'Validate MCP setup'
    ],
    tools: ['Read', 'Grep', 'Glob']
  },
  
  'claude-compliance-enforcer': {
    description: 'Enforces CLAUDE.md standards',
    keywords: ['CLAUDE.md', 'compliance', 'standards', 'follows standards'],
    complexity: 'MEDIUM',
    examples: [
      'Check code compliance',
      'Validate against standards',
      'Enforce project conventions'
    ],
    tools: ['Read', 'Grep', 'Glob', 'Task']
  }
};

class AgentSelector {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  // Calculate match score for agent
  calculateScore(input, agent) {
    const lowerInput = input.toLowerCase();
    let score = 0;
    
    // Check keywords
    for (const keyword of agent.keywords) {
      if (lowerInput.includes(keyword.toLowerCase())) {
        score += 10;
      }
    }
    
    // Check examples similarity
    for (const example of agent.examples) {
      const similarity = this.calculateSimilarity(lowerInput, example.toLowerCase());
      score += similarity * 5;
    }
    
    // Complexity preference (prefer simpler agents for ambiguous matches)
    if (agent.complexity === 'LOW') score += 1;
    if (agent.complexity === 'MEDIUM') score += 0.5;
    
    return score;
  }

  // Simple similarity calculation
  calculateSimilarity(str1, str2) {
    const words1 = str1.split(/\s+/);
    const words2 = str2.split(/\s+/);
    const common = words1.filter(w => words2.includes(w)).length;
    return common / Math.max(words1.length, words2.length);
  }

  // Find matching agents
  findMatches(input) {
    const matches = [];
    
    for (const [name, agent] of Object.entries(AGENTS)) {
      const score = this.calculateScore(input, agent);
      if (score > 0) {
        matches.push({ name, agent, score });
      }
    }
    
    return matches.sort((a, b) => b.score - a.score);
  }

  // Generate Task tool invocation
  generateInvocation(agentName, userInput) {
    const agent = AGENTS[agentName];
    
    return `
Task tool invocation:
\`\`\`
subagent_type: "${agentName}"
description: "${userInput.substring(0, 50)}"
prompt: "${userInput}

Please help with the above request using your specialized capabilities."
\`\`\`

Required MCP servers:
${agent.tools.filter(t => t.includes('mcp_')).join(', ') || 'None'}

Agent complexity: ${agent.complexity}
`;
  }

  // Interactive selection
  async selectInteractive(matches) {
    console.log('\n📋 Matching Agents:');
    console.log('------------------');
    
    matches.slice(0, 5).forEach((match, index) => {
      console.log(`\n${index + 1}. ${match.name} (Score: ${match.score.toFixed(1)})`);
      console.log(`   ${match.agent.description}`);
      console.log(`   Complexity: ${match.agent.complexity}`);
      console.log(`   Example: "${match.agent.examples[0]}"`);
    });
    
    return new Promise((resolve) => {
      this.rl.question('\nSelect agent (1-5) or 0 for none: ', (answer) => {
        const index = parseInt(answer) - 1;
        if (index >= 0 && index < matches.length) {
          resolve(matches[index].name);
        } else {
          resolve(null);
        }
      });
    });
  }

  // Explain why agent was selected
  explainSelection(agentName, input) {
    const agent = AGENTS[agentName];
    const explanations = [];
    const lowerInput = input.toLowerCase();
    
    // Check which keywords matched
    const matchedKeywords = agent.keywords.filter(k => 
      lowerInput.includes(k.toLowerCase())
    );
    
    if (matchedKeywords.length > 0) {
      explanations.push(`Matched keywords: ${matchedKeywords.join(', ')}`);
    }
    
    // Check example similarity
    const bestExample = agent.examples.reduce((best, example) => {
      const similarity = this.calculateSimilarity(lowerInput, example.toLowerCase());
      return similarity > best.similarity ? { example, similarity } : best;
    }, { example: null, similarity: 0 });
    
    if (bestExample.similarity > 0.3) {
      explanations.push(`Similar to: "${bestExample.example}"`);
    }
    
    return explanations.join('\n');
  }

  // Main interactive flow
  async run() {
    console.log('🤖 Interactive Agent Selector');
    console.log('=============================\n');
    console.log('Describe your task, and I\'ll help you find the right agent.\n');
    console.log('Special commands:');
    console.log('  "list" - Show all available agents');
    console.log('  "help <agent>" - Get details about specific agent');
    console.log('  "exit" - Exit the selector\n');
    
    const askQuestion = () => {
      this.rl.question('Your task: ', async (input) => {
        if (input.toLowerCase() === 'exit') {
          console.log('\n👋 Goodbye!');
          this.rl.close();
          return;
        }
        
        if (input.toLowerCase() === 'list') {
          this.listAgents();
          askQuestion();
          return;
        }
        
        if (input.toLowerCase().startsWith('help ')) {
          const agentName = input.substring(5).trim();
          this.showAgentHelp(agentName);
          askQuestion();
          return;
        }
        
        // Find matching agents
        const matches = this.findMatches(input);
        
        if (matches.length === 0) {
          console.log('\n❌ No matching agents found.');
          console.log('💡 Try using different keywords or "list" to see all agents.\n');
          askQuestion();
          return;
        }
        
        // If clear winner, auto-select
        if (matches[0].score > 20 && matches[0].score > matches[1]?.score * 2) {
          console.log(`\n✅ Best match: ${matches[0].name}`);
          console.log(this.explainSelection(matches[0].name, input));
          console.log(this.generateInvocation(matches[0].name, input));
        } else {
          // Interactive selection
          const selected = await this.selectInteractive(matches);
          if (selected) {
            console.log(`\n✅ Selected: ${selected}`);
            console.log(this.explainSelection(selected, input));
            console.log(this.generateInvocation(selected, input));
          } else {
            console.log('\n❌ No agent selected.');
          }
        }
        
        console.log('\n' + '-'.repeat(50) + '\n');
        askQuestion();
      });
    };
    
    askQuestion();
  }

  // List all agents
  listAgents() {
    console.log('\n📚 Available Agents:');
    console.log('-------------------');
    
    const byComplexity = { HIGH: [], MEDIUM: [], LOW: [] };
    
    for (const [name, agent] of Object.entries(AGENTS)) {
      byComplexity[agent.complexity].push({ name, description: agent.description });
    }
    
    for (const [complexity, agents] of Object.entries(byComplexity)) {
      if (agents.length > 0) {
        console.log(`\n${complexity} Complexity:`);
        for (const agent of agents) {
          console.log(`  • ${agent.name}: ${agent.description}`);
        }
      }
    }
  }

  // Show detailed help for agent
  showAgentHelp(agentName) {
    const agent = AGENTS[agentName];
    
    if (!agent) {
      console.log(`\n❌ Agent "${agentName}" not found.`);
      return;
    }
    
    console.log(`\n📖 ${agentName}`);
    console.log('='.repeat(40));
    console.log(`Description: ${agent.description}`);
    console.log(`Complexity: ${agent.complexity}`);
    console.log(`\nKeywords: ${agent.keywords.join(', ')}`);
    console.log(`\nExamples:`);
    agent.examples.forEach(ex => console.log(`  • "${ex}"`));
    console.log(`\nRequired tools: ${agent.tools.join(', ')}`);
  }
}

// CLI mode
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--batch')) {
    // Batch mode - process single input
    const input = args.slice(args.indexOf('--batch') + 1).join(' ');
    const selector = new AgentSelector();
    const matches = selector.findMatches(input);
    
    if (matches.length > 0) {
      console.log('Best match:', matches[0].name);
      console.log('Score:', matches[0].score.toFixed(1));
      console.log(selector.generateInvocation(matches[0].name, input));
    } else {
      console.log('No matching agent found');
    }
    
    process.exit(0);
  } else {
    // Interactive mode
    const selector = new AgentSelector();
    selector.run();
  }
}

module.exports = { AgentSelector, AGENTS };