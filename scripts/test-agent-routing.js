#!/usr/bin/env node

/**
 * Agent Routing Test Framework
 * Tests that the correct agents are selected for various user requests
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Test scenarios mapping user requests to expected agents
const TEST_SCENARIOS = [
  // Release & Deployment Scenarios
  {
    category: 'Release & Deployment',
    tests: [
      {
        input: 'I just merged the new features to main',
        expectedAgent: 'release-coordinator',
        reason: 'Post-merge to main should trigger release-coordinator'
      },
      {
        input: 'Deploy v2.5.0 to production',
        expectedAgent: 'release-coordinator',
        reason: 'Production deployment should use release-coordinator'
      },
      {
        input: 'Create a new release tag',
        expectedAgent: 'release-coordinator',
        reason: 'Tagging releases should use release-coordinator'
      }
    ]
  },

  // Salesforce Scenarios
  {
    category: 'Salesforce Operations',
    tests: [
      {
        input: 'Merge Customer_Status__c and Account_Status__c fields',
        expectedAgent: 'sfdc-merge-orchestrator',
        reason: 'Field merging requires sfdc-merge-orchestrator'
      },
      {
        input: 'My deployment failed with field history tracking errors',
        expectedAgent: 'sfdc-conflict-resolver',
        reason: 'Deployment conflicts need sfdc-conflict-resolver'
      },
      {
        input: 'Analyze dependencies between Order and Invoice objects',
        expectedAgent: 'sfdc-dependency-analyzer',
        reason: 'Dependency analysis uses sfdc-dependency-analyzer'
      },
      {
        input: 'What is the current state of the Account object?',
        expectedAgent: 'sfdc-state-discovery',
        reason: 'State discovery uses sfdc-state-discovery'
      }
    ]
  },

  // Complex Planning Scenarios
  {
    category: 'Complex Planning',
    tests: [
      {
        input: '[SEQUENTIAL] Design a new permission system',
        expectedAgent: 'sequential-planner',
        reason: '[SEQUENTIAL] flag forces sequential-planner'
      },
      {
        input: 'Migrate 50000 records from legacy system to Salesforce and HubSpot',
        expectedAgent: 'sequential-planner',
        reason: 'High-volume multi-platform migration needs sequential-planner'
      },
      {
        input: 'Implement a complex workflow with unknown dependencies',
        expectedAgent: 'sequential-planner',
        reason: 'Unknown scope triggers sequential-planner'
      }
    ]
  },

  // Quality & Analysis Scenarios
  {
    category: 'Quality Control',
    tests: [
      {
        input: 'Claude keeps making the same API naming mistakes',
        expectedAgent: 'quality-control-analyzer',
        reason: 'Recurring issues trigger quality-control-analyzer'
      },
      {
        input: 'Review friction points from last sprint',
        expectedAgent: 'quality-control-analyzer',
        reason: 'Sprint reviews use quality-control-analyzer'
      },
      {
        input: 'I keep having to correct the same issues',
        expectedAgent: 'quality-control-analyzer',
        reason: 'Pattern detection uses quality-control-analyzer'
      }
    ]
  },

  // Multi-Repo Scenarios
  {
    category: 'Multi-Repository',
    tests: [
      {
        input: 'Update customer model across ClaudeSFDC and ClaudeHubSpot',
        expectedAgent: 'project-orchestrator',
        reason: 'Cross-repo work needs project-orchestrator'
      },
      {
        input: 'Coordinate changes across all repositories',
        expectedAgent: 'project-orchestrator',
        reason: 'Multi-repo coordination uses project-orchestrator'
      }
    ]
  },

  // Google Drive Scenarios
  {
    category: 'Google Drive',
    tests: [
      {
        input: 'Get the API documentation from Google Drive',
        expectedAgent: 'gdrive-document-manager',
        reason: 'Document retrieval uses gdrive-document-manager'
      },
      {
        input: 'Export Salesforce reports to Google Sheets',
        expectedAgent: 'gdrive-report-exporter',
        reason: 'Report export uses gdrive-report-exporter'
      },
      {
        input: 'Get the email template from our library',
        expectedAgent: 'gdrive-template-library',
        reason: 'Template access uses gdrive-template-library'
      }
    ]
  },

  // System Maintenance Scenarios
  {
    category: 'System Maintenance',
    tests: [
      {
        input: 'Agent not found error',
        expectedAgent: 'router-doctor',
        reason: 'Agent discovery issues need router-doctor'
      },
      {
        input: 'MCP tool mismatch error',
        expectedAgent: 'mcp-guardian',
        reason: 'MCP validation uses mcp-guardian'
      },
      {
        input: 'Check if our code follows CLAUDE.md standards',
        expectedAgent: 'claude-compliance-enforcer',
        reason: 'Compliance checks use claude-compliance-enforcer'
      }
    ]
  },

  // Direct Execution Scenarios (No Agent Needed)
  {
    category: 'Direct Execution',
    tests: [
      {
        input: 'Add a checkbox field to Account',
        expectedAgent: null,
        reason: 'Simple field creation can be done directly'
      },
      {
        input: '[DIRECT] Deploy these 15 objects',
        expectedAgent: null,
        reason: '[DIRECT] flag skips agent routing'
      },
      {
        input: 'Run a simple SOQL query',
        expectedAgent: null,
        reason: 'Basic queries dont need agents'
      }
    ]
  }
];

// Agent keywords from CLAUDE.md - Enhanced with test feedback
const AGENT_KEYWORDS = {
  'release-coordinator': ['release', 'deploy', 'production', 'tag', 'merge to main', 'merged to main', 'just merged', 'rollout', 'merged the'],
  'project-orchestrator': ['across repos', 'ClaudeSFDC and ClaudeHubSpot', 'coordinate', 'multi-repo', 'multiple repositories'],
  'sfdc-conflict-resolver': ['field history tracking', 'conflict', 'field mismatch', 'deployment error'],
  'sfdc-merge-orchestrator': ['merge fields', 'merge.*field', 'consolidate objects', 'combine', 'field consolidation', 'merge customer', 'merge account'],
  'sfdc-dependency-analyzer': ['dependencies', 'dependency analysis', 'circular dependency', 'analyze dependencies'],
  'sfdc-state-discovery': ['current state', 'org state', 'what is the state', 'drift detection'],
  'sequential-planner': ['complex', 'unknown scope', 'needs planning', '[SEQUENTIAL]', 'high complexity', 'migrate.*records', 'migration.*system', 'unknown dependencies'],
  'quality-control-analyzer': ['recurring', 'keeps happening', 'same mistake', 'friction', 'Claude keeps', 'pattern', 'keep having', 'correct the same'],
  'gdrive-document-manager': ['Google Drive', 'document', 'requirements', 'specifications'],
  'gdrive-template-library': ['template', 'email template', 'code pattern'],
  'gdrive-report-exporter': ['export report', 'Google Sheets', 'report to Drive'],
  'router-doctor': ['agent not found', 'agent discovery', 'name collision'],
  'mcp-guardian': ['MCP', 'tool mismatch', 'server validation'],
  'claude-compliance-enforcer': ['CLAUDE.md', 'compliance', 'standards', 'follows standards']
};

// Function to determine expected agent based on keywords
function determineAgent(input) {
  const lowerInput = input.toLowerCase();
  
  // Check for direct execution flags
  if (lowerInput.includes('[direct]') || lowerInput.includes('[quick_mode]')) {
    return null;
  }
  
  // Check each agent's keywords
  for (const [agent, keywords] of Object.entries(AGENT_KEYWORDS)) {
    for (const keyword of keywords) {
      // Check if keyword contains regex pattern (has .* or other regex chars)
      if (keyword.includes('.*') || keyword.includes('\\')) {
        // Use as regex
        const regex = new RegExp(keyword.toLowerCase());
        if (regex.test(lowerInput)) {
          return agent;
        }
      } else {
        // Use as literal string
        if (lowerInput.includes(keyword.toLowerCase())) {
          return agent;
        }
      }
    }
  }
  
  return null;
}

// Run tests
function runTests() {
  console.log('🧪 Agent Routing Test Framework\n');
  console.log('=' .repeat(80));
  
  let totalTests = 0;
  let passedTests = 0;
  let failedTests = [];
  
  for (const category of TEST_SCENARIOS) {
    console.log(`\n📁 ${category.category}`);
    console.log('-'.repeat(40));
    
    for (const test of category.tests) {
      totalTests++;
      const detectedAgent = determineAgent(test.input);
      const passed = detectedAgent === test.expectedAgent;
      
      if (passed) {
        passedTests++;
        console.log(`✅ PASS: "${test.input.substring(0, 50)}..."`);
        console.log(`   Expected: ${test.expectedAgent || 'direct'}, Got: ${detectedAgent || 'direct'}`);
      } else {
        failedTests.push({
          category: category.category,
          test: test,
          detected: detectedAgent
        });
        console.log(`❌ FAIL: "${test.input.substring(0, 50)}..."`);
        console.log(`   Expected: ${test.expectedAgent || 'direct'}, Got: ${detectedAgent || 'direct'}`);
        console.log(`   Reason: ${test.reason}`);
      }
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 Test Summary\n');
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed: ${passedTests} (${((passedTests/totalTests)*100).toFixed(1)}%)`);
  console.log(`Failed: ${failedTests.length} (${((failedTests.length/totalTests)*100).toFixed(1)}%)`);
  
  if (failedTests.length > 0) {
    console.log('\n❌ Failed Tests Details:');
    for (const failure of failedTests) {
      console.log(`\n  Category: ${failure.category}`);
      console.log(`  Input: "${failure.test.input}"`);
      console.log(`  Expected: ${failure.test.expectedAgent || 'direct'}`);
      console.log(`  Detected: ${failure.detected || 'direct'}`);
      console.log(`  Reason: ${failure.test.reason}`);
    }
  }
  
  // Recommendations
  console.log('\n💡 Recommendations:');
  if (failedTests.length === 0) {
    console.log('  ✅ All tests passed! Agent routing is working correctly.');
  } else {
    console.log('  1. Review failed test cases and update CLAUDE.md keywords if needed');
    console.log('  2. Add missing trigger patterns to agent descriptions');
    console.log('  3. Consider adding more specific keywords for failed scenarios');
  }
  
  // Coverage Report
  console.log('\n📈 Agent Coverage:');
  const testedAgents = new Set();
  for (const category of TEST_SCENARIOS) {
    for (const test of category.tests) {
      if (test.expectedAgent) {
        testedAgents.add(test.expectedAgent);
      }
    }
  }
  
  console.log(`  Agents Tested: ${testedAgents.size}`);
  console.log(`  Agents: ${Array.from(testedAgents).join(', ')}`);
  
  // Check for untested agents
  const allAgents = Object.keys(AGENT_KEYWORDS);
  const untestedAgents = allAgents.filter(a => !testedAgents.has(a));
  if (untestedAgents.length > 0) {
    console.log(`  ⚠️  Untested Agents: ${untestedAgents.join(', ')}`);
  }
  
  return failedTests.length === 0;
}

// Main execution
if (require.main === module) {
  const success = runTests();
  process.exit(success ? 0 : 1);
}

module.exports = { runTests, determineAgent, TEST_SCENARIOS };