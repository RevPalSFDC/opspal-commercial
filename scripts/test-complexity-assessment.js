#!/usr/bin/env node

/**
 * Test script for Complexity Assessment Framework
 * Tests complexity analysis and Sequential Thinking integration
 */

const ComplexityAnalyzer = require('../shared-infrastructure/complexity-assessment/complexity-analyzer');
const ComplexityAwareAgent = require('../shared-infrastructure/complexity-assessment/ComplexityAwareAgent');
const profiles = require('../shared-infrastructure/complexity-assessment/complexity-profiles.json');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
    complexity: 'all',
    agent: 'all',
    override: null,
    verbose: false
};

args.forEach(arg => {
    if (arg.startsWith('--complexity=')) {
        options.complexity = arg.split('=')[1];
    } else if (arg.startsWith('--agent=')) {
        options.agent = arg.split('=')[1];
    } else if (arg.startsWith('--override=')) {
        options.override = arg.split('=')[1];
    } else if (arg === '--verbose') {
        options.verbose = true;
    }
});

// Test scenarios by complexity level
const testScenarios = {
    simple: [
        {
            name: "Single field creation",
            task: {
                description: "Create Email field on Contact object",
                operation: "field_creation",
                objects: ["Contact"],
                fieldCount: 1
            }
        },
        {
            name: "Basic query",
            task: {
                description: "Query Account records by name",
                operation: "query",
                objects: ["Account"]
            }
        }
    ],
    medium: [
        {
            name: "Multi-field merge",
            task: {
                description: "Merge 5 duplicate fields on Account object and update validation rules",
                operation: "field_merge",
                objects: ["Account"],
                fieldCount: 5,
                validationRules: 3
            }
        },
        {
            name: "Workflow migration",
            task: {
                description: "Migrate workflow rules to Flow Builder for Lead object",
                operation: "workflow_migration",
                objects: ["Lead"],
                workflowCount: 4
            }
        }
    ],
    high: [
        {
            name: "Complex object merge",
            task: {
                description: "Merge Lead and Contact objects in production with all dependencies, relationships, and data migration",
                operation: "object_merge",
                objects: ["Lead", "Contact", "Account", "Opportunity"],
                environment: "production",
                fieldCount: 50,
                relationshipCount: 12,
                recordCount: 50000
            }
        },
        {
            name: "Cross-platform release",
            task: {
                description: "Deploy release across Salesforce, HubSpot, and main application with database migrations and rollback strategy",
                operation: "release",
                platforms: ["salesforce", "hubspot", "application"],
                environment: "production",
                hasRollback: true,
                hasMigrations: true
            }
        }
    ]
};

// Test agents
const testAgents = [
    'sfdc-merge-orchestrator',
    'sfdc-dependency-analyzer',
    'project-orchestrator',
    'release-coordinator'
];

/**
 * Run complexity analysis test
 */
function testComplexityAnalysis(scenario, agentName = 'default') {
    const analyzer = new ComplexityAnalyzer();
    const agentProfile = profiles[agentName] || profiles.default;
    
    // Apply override if specified
    if (options.override) {
        if (options.override === 'sequential') {
            scenario.task.description += ' [PLAN_CAREFULLY]';
        } else if (options.override === 'direct') {
            scenario.task.description += ' [QUICK_MODE]';
        }
    }
    
    const analysis = analyzer.analyzeTask(scenario.task, agentProfile);
    
    console.log('\n' + '='.repeat(60));
    console.log(`Test: ${scenario.name}`);
    console.log(`Agent: ${agentName}`);
    console.log('='.repeat(60));
    
    if (options.verbose) {
        console.log('\nTask:', JSON.stringify(scenario.task, null, 2));
    }
    
    console.log('\nAnalysis Results:');
    console.log(`  Complexity Score: ${analysis.score.toFixed(3)}`);
    console.log(`  Complexity Level: ${analysis.level}`);
    console.log(`  Use Sequential: ${analysis.useSequentialThinking ? 'YES' : 'NO'}`);
    
    if (options.verbose) {
        console.log('\nFactor Breakdown:');
        for (const [factor, details] of Object.entries(analysis.factors)) {
            if (details.contribution > 0) {
                console.log(`  ${factor}: ${details.value} → ${details.contribution.toFixed(3)}`);
            }
        }
        
        if (analysis.reasoning.length > 0) {
            console.log('\nReasoning:');
            analysis.reasoning.forEach(r => console.log(`  - ${r}`));
        }
        
        if (analysis.recommendations.length > 0) {
            console.log('\nRecommendations:');
            analysis.recommendations.forEach(r => console.log(`  - ${r}`));
        }
    }
    
    return analysis;
}

/**
 * Test agent integration
 */
async function testAgentIntegration(scenario, agentName) {
    console.log('\n' + '='.repeat(60));
    console.log(`Agent Integration Test: ${agentName}`);
    console.log('='.repeat(60));
    
    const agentProfile = profiles[agentName] || profiles.default;
    const agent = new ComplexityAwareAgent(agentName, agentProfile);
    
    // Mock the agent-specific methods
    agent.executeDirect = async (task, complexity) => {
        return {
            success: true,
            message: `Direct execution by ${agentName}`,
            complexity: complexity.level,
            method: 'direct'
        };
    };
    
    agent.callSequentialThinking = async (params) => {
        return {
            thought: params.thought,
            thoughtNumber: params.thoughtNumber,
            totalThoughts: params.totalThoughts,
            timestamp: new Date().toISOString()
        };
    };
    
    agent.executePlan = async (plan, task) => {
        return {
            success: true,
            message: `Sequential execution by ${agentName}`,
            thoughtsUsed: plan.thoughts.length,
            method: 'sequential'
        };
    };
    
    try {
        const result = await agent.execute(scenario.task);
        console.log('\nExecution Result:', result);
        
        const metrics = agent.getMetrics();
        console.log('\nAgent Metrics:', metrics);
        
        return result;
    } catch (error) {
        console.error('Execution failed:', error);
        return null;
    }
}

/**
 * Run all tests
 */
async function runTests() {
    console.log('🧪 Complexity Assessment Framework Test Suite');
    console.log('=' .repeat(60));
    
    // Determine which scenarios to test
    let scenariosToTest = [];
    if (options.complexity === 'all') {
        scenariosToTest = [
            ...testScenarios.simple,
            ...testScenarios.medium,
            ...testScenarios.high
        ];
    } else if (testScenarios[options.complexity]) {
        scenariosToTest = testScenarios[options.complexity];
    } else {
        console.error(`Unknown complexity level: ${options.complexity}`);
        process.exit(1);
    }
    
    // Determine which agents to test
    let agentsToTest = [];
    if (options.agent === 'all') {
        agentsToTest = testAgents;
    } else {
        agentsToTest = [options.agent];
    }
    
    // Run complexity analysis tests
    console.log('\n📊 COMPLEXITY ANALYSIS TESTS');
    const analysisResults = [];
    
    for (const scenario of scenariosToTest) {
        for (const agent of agentsToTest) {
            const result = testComplexityAnalysis(scenario, agent);
            analysisResults.push({
                scenario: scenario.name,
                agent: agent,
                score: result.score,
                level: result.level,
                useSequential: result.useSequentialThinking
            });
        }
    }
    
    // Run agent integration tests (only if single agent specified)
    if (options.agent !== 'all') {
        console.log('\n🤖 AGENT INTEGRATION TESTS');
        
        for (const scenario of scenariosToTest) {
            await testAgentIntegration(scenario, options.agent);
        }
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📈 TEST SUMMARY');
    console.log('='.repeat(60));
    
    // Group results by complexity level
    const summary = {
        simple: analysisResults.filter(r => r.level === 'SIMPLE'),
        medium: analysisResults.filter(r => r.level === 'MEDIUM'),
        high: analysisResults.filter(r => r.level === 'HIGH')
    };
    
    console.log('\nComplexity Distribution:');
    console.log(`  Simple: ${summary.simple.length} scenarios`);
    console.log(`  Medium: ${summary.medium.length} scenarios`);
    console.log(`  High: ${summary.high.length} scenarios`);
    
    console.log('\nSequential Thinking Usage:');
    const sequentialCount = analysisResults.filter(r => r.useSequential).length;
    console.log(`  Would use Sequential: ${sequentialCount}/${analysisResults.length} scenarios`);
    
    if (options.verbose) {
        console.log('\nDetailed Results:');
        console.table(analysisResults);
    }
}

// Display help if needed
if (args.includes('--help')) {
    console.log(`
Complexity Assessment Framework Test Script

Usage: node test-complexity-assessment.js [options]

Options:
  --complexity=<level>  Test specific complexity level (simple|medium|high|all)
  --agent=<name>        Test specific agent or 'all'
  --override=<type>     Force override (sequential|direct)
  --verbose             Show detailed output
  --help                Show this help message

Examples:
  node test-complexity-assessment.js --complexity=high
  node test-complexity-assessment.js --agent=sfdc-merge-orchestrator
  node test-complexity-assessment.js --override=sequential --verbose
`);
    process.exit(0);
}

// Run tests
runTests().catch(error => {
    console.error('Test suite failed:', error);
    process.exit(1);
});