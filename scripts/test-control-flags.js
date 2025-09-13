#!/usr/bin/env node

/**
 * Test User Control Flags for Sequential Thinking
 * Tests [PLAN_CAREFULLY], [SEQUENTIAL], [QUICK_MODE], and [DIRECT] flags
 */

const axios = require('axios');

// Test scenarios with different control flags
const testScenarios = [
  {
    name: "Simple task with [PLAN_CAREFULLY] flag",
    task: "[PLAN_CAREFULLY] Create a single custom field on Account",
    baseComplexity: 0.1,  // Normally LOW
    expectedBehavior: "FORCED_SEQUENTIAL",
    flags: ["PLAN_CAREFULLY"],
    description: "Forces Sequential Thinking even for simple tasks"
  },
  {
    name: "Simple task with [SEQUENTIAL] flag",
    task: "[SEQUENTIAL] Update a single validation rule",
    baseComplexity: 0.15,
    expectedBehavior: "FORCED_SEQUENTIAL",
    flags: ["SEQUENTIAL"],
    description: "Alternative flag to force Sequential Thinking"
  },
  {
    name: "Complex task with [QUICK_MODE] flag",
    task: "[QUICK_MODE] Deploy metadata to 8 objects with dependencies",
    baseComplexity: 0.65,  // Normally MEDIUM-HIGH
    expectedBehavior: "FORCED_DIRECT",
    flags: ["QUICK_MODE"],
    description: "Bypasses Sequential Thinking for faster execution"
  },
  {
    name: "Complex task with [DIRECT] flag",
    task: "[DIRECT] Merge 12 duplicate records with relationships",
    baseComplexity: 0.75,  // Normally HIGH
    expectedBehavior: "FORCED_DIRECT",
    flags: ["DIRECT"],
    description: "Alternative flag to bypass Sequential Thinking"
  },
  {
    name: "Medium task with no flags",
    task: "Create workflow with 6 steps and conditions",
    baseComplexity: 0.45,  // MEDIUM
    expectedBehavior: "CONDITIONAL",
    flags: [],
    description: "Uses default complexity assessment"
  }
];

// Function to process control flags
function processControlFlags(task, baseComplexity) {
  const forceSequential = /\[PLAN_CAREFULLY\]|\[SEQUENTIAL\]/i.test(task);
  const forceDirect = /\[QUICK_MODE\]|\[DIRECT\]/i.test(task);
  
  let finalComplexity = baseComplexity;
  let routing = "DEFAULT";
  
  if (forceSequential) {
    finalComplexity = Math.max(0.8, baseComplexity); // Force HIGH
    routing = "FORCED_SEQUENTIAL";
  } else if (forceDirect) {
    finalComplexity = Math.min(0.2, baseComplexity); // Force LOW
    routing = "FORCED_DIRECT";
  } else {
    routing = baseComplexity > 0.7 ? "AUTO_SEQUENTIAL" :
             baseComplexity > 0.3 ? "CONDITIONAL" : "AUTO_DIRECT";
  }
  
  return {
    originalComplexity: baseComplexity,
    adjustedComplexity: finalComplexity,
    routing,
    flagsDetected: {
      forceSequential,
      forceDirect
    }
  };
}

// Send to dashboard
async function updateDashboard(scenario, result) {
  try {
    await axios.post('http://localhost:3005/api/update', {
      agent: "control-flag-test",
      task: scenario.task,
      complexity: result.adjustedComplexity,
      factors: [
        `Base complexity: ${result.originalComplexity}`,
        `Flags: ${scenario.flags.join(', ') || 'none'}`,
        `Routing: ${result.routing}`
      ],
      recommendation: result.routing,
      timestamp: new Date().toISOString(),
      metadata: {
        testName: scenario.name,
        flagsApplied: scenario.flags,
        expectedBehavior: scenario.expectedBehavior
      }
    });
  } catch (error) {
    // Dashboard might not be running
  }
}

async function main() {
  console.log('🎮 Testing User Control Flags for Sequential Thinking\n');
  console.log('=' .repeat(60));
  
  for (const scenario of testScenarios) {
    console.log(`\n📝 Test: ${scenario.name}`);
    console.log(`   Task: "${scenario.task}"`);
    console.log(`   Base Complexity: ${scenario.baseComplexity.toFixed(2)}`);
    
    const result = processControlFlags(scenario.task, scenario.baseComplexity);
    
    console.log(`\n   🔍 Results:`);
    console.log(`      Original: ${result.originalComplexity.toFixed(2)}`);
    console.log(`      Adjusted: ${result.adjustedComplexity.toFixed(2)}`);
    console.log(`      Routing: ${result.routing}`);
    
    const passed = result.routing === scenario.expectedBehavior ||
                  (scenario.expectedBehavior === 'CONDITIONAL' && result.routing === 'CONDITIONAL');
    
    console.log(`      Status: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
    
    if (result.flagsDetected.forceSequential) {
      console.log(`      ⚡ Sequential Thinking FORCED by flag`);
    } else if (result.flagsDetected.forceDirect) {
      console.log(`      🚀 Direct execution FORCED by flag`);
    }
    
    console.log(`\n   📖 ${scenario.description}`);
    
    // Update dashboard
    await updateDashboard(scenario, result);
    
    console.log('-'.repeat(60));
  }
  
  console.log('\n\n📊 Summary:');
  console.log('✅ Control flags allow users to override automatic complexity assessment');
  console.log('🎯 [PLAN_CAREFULLY] or [SEQUENTIAL] - Forces Sequential Thinking');
  console.log('⚡ [QUICK_MODE] or [DIRECT] - Bypasses Sequential Thinking');
  console.log('\nCheck dashboard at: http://localhost:3005');
}

main().catch(console.error);