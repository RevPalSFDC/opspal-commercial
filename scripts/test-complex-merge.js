#!/usr/bin/env node

/**
 * Test Complex Salesforce Merge Scenario
 * This simulates a high-complexity task that should trigger Sequential Thinking
 */

const axios = require('axios');
const path = require('path');

// Simulate a complex merge request
const complexMergeScenario = {
  task: "Merge duplicate Salesforce objects with complex dependencies",
  description: "Consolidating 15 duplicate Account objects with related Contacts, Opportunities, and Cases",
  metadata: {
    objects: [
      'Account', 'Contact', 'Opportunity', 'Case', 'Task', 'Event',
      'OpportunityLineItem', 'Quote', 'QuoteLineItem', 'Order',
      'OrderItem', 'Contract', 'Asset', 'Attachment', 'Note'
    ],
    recordCount: 45000,
    hasCircularDependencies: true,
    requiresDataBackup: true,
    impactsProduction: true,
    estimatedDuration: "2-3 hours"
  },
  flags: [],
  context: {
    agent: "sfdc-merge-orchestrator",
    timestamp: new Date().toISOString(),
    environment: "sandbox"
  }
};

// Function to assess complexity
function assessComplexity(scenario) {
  let score = 0;
  let factors = [];
  
  // Object count factor
  const objectCount = scenario.metadata.objects.length;
  if (objectCount > 10) {
    score += 0.4;
    factors.push(`High object count: ${objectCount}`);
  } else if (objectCount > 5) {
    score += 0.2;
    factors.push(`Medium object count: ${objectCount}`);
  }
  
  // Record count factor
  if (scenario.metadata.recordCount > 10000) {
    score += 0.3;
    factors.push(`Large data volume: ${scenario.metadata.recordCount} records`);
  }
  
  // Circular dependencies
  if (scenario.metadata.hasCircularDependencies) {
    score += 0.2;
    factors.push("Has circular dependencies");
  }
  
  // Production impact
  if (scenario.metadata.impactsProduction) {
    score += 0.1;
    factors.push("Impacts production");
  }
  
  return {
    score: Math.min(score, 1.0),
    factors,
    recommendation: score > 0.7 ? "USE_SEQUENTIAL_THINKING" : 
                   score > 0.3 ? "CONSIDER_SEQUENTIAL" : "DIRECT_EXECUTION"
  };
}

// Send to dashboard
async function updateDashboard(scenario, complexity) {
  try {
    const response = await axios.post('http://localhost:3005/api/update', {
      agent: scenario.context.agent,
      task: scenario.task,
      complexity: complexity.score,
      factors: complexity.factors,
      recommendation: complexity.recommendation,
      timestamp: scenario.context.timestamp,
      metadata: scenario.metadata
    });
    console.log('✅ Dashboard updated:', response.data);
  } catch (error) {
    console.log('⚠️  Dashboard not running (start with: node scripts/complexity-metrics-dashboard.js)');
  }
}

async function main() {
  console.log('🧪 Testing Complex Salesforce Merge Scenario\n');
  console.log('📋 Scenario:', complexMergeScenario.task);
  console.log('📊 Objects involved:', complexMergeScenario.metadata.objects.length);
  console.log('📈 Records affected:', complexMergeScenario.metadata.recordCount);
  console.log('');
  
  const complexity = assessComplexity(complexMergeScenario);
  
  console.log('🧠 Complexity Assessment:');
  console.log('   Score:', complexity.score.toFixed(2), complexity.score > 0.7 ? '(HIGH)' : complexity.score > 0.3 ? '(MEDIUM)' : '(LOW)');
  console.log('   Factors:');
  complexity.factors.forEach(f => console.log('   -', f));
  console.log('   Recommendation:', complexity.recommendation);
  console.log('');
  
  // Update dashboard
  await updateDashboard(complexMergeScenario, complexity);
  
  // Simulate what would happen
  if (complexity.score > 0.7) {
    console.log('🎯 Action: This task would automatically use Sequential Thinking MCP');
    console.log('   The sfdc-merge-orchestrator agent would:');
    console.log('   1. Create a comprehensive plan with sequential_thinking.create_thought_system');
    console.log('   2. Analyze dependencies and create execution order');
    console.log('   3. Execute merge in phases with checkpoints');
    console.log('   4. Validate data integrity at each step');
  } else if (complexity.score > 0.3) {
    console.log('⚡ Action: This task might use Sequential Thinking based on runtime conditions');
  } else {
    console.log('🚀 Action: This task would execute directly without Sequential Thinking');
  }
  
  console.log('\n📊 Check the dashboard at: http://localhost:3005');
}

main().catch(console.error);