#!/usr/bin/env node

/**
 * Agent Registration Check Script
 * ================================
 * Verifies that all management agents are properly registered and configured
 */

const fs = require('fs');
const path = require('path');

const BASE_DIR = '/home/chris/Desktop/RevPal/Agents';

// Expected management agents
const expectedManagementAgents = [
  'agent-maintainer',
  'config-manager', 
  'documentation-curator',
  'integration-architect',
  'mcp-tools-manager',
  'quality-auditor',
  'release-coordinator'
];

// Expected HubSpot agents  
const expectedHubSpotAgents = [
  'hubspot-contact-manager',
  'hubspot-marketing-automation',
  'hubspot-pipeline-manager',
  'hubspot-analytics-reporter',
  'hubspot-integration-specialist',
  'hubspot-workflow-builder',
  'hubspot-email-campaign-manager',
  'hubspot-orchestrator'
];

function checkAgentFile(filePath, agentName) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const stats = fs.statSync(filePath);
    
    // Basic validation
    const hasName = content.includes(`name: ${agentName}`);
    const hasDescription = content.includes('description:');
    const hasVersion = content.includes('version:');
    const hasTools = content.includes('tools:');
    
    return {
      exists: true,
      valid: hasName && hasDescription && hasVersion,
      size: stats.size,
      lastModified: stats.mtime,
      issues: [
        !hasName && 'Missing name field',
        !hasDescription && 'Missing description field',
        !hasVersion && 'Missing version field',
        !hasTools && 'Missing tools field'
      ].filter(Boolean)
    };
  } catch (error) {
    return {
      exists: false,
      valid: false,
      error: error.message
    };
  }
}

function checkAgentRegistration() {
  console.log('🔍 AGENT REGISTRATION STATUS CHECK');
  console.log('=' .repeat(50));
  console.log();

  // Check management agents
  console.log('📋 MANAGEMENT AGENTS:');
  console.log('-' .repeat(30));
  
  let managementIssues = 0;
  expectedManagementAgents.forEach(agentName => {
    const filePath = path.join(BASE_DIR, 'agents', 'management', `${agentName}.yaml`);
    const status = checkAgentFile(filePath, agentName);
    
    const statusIcon = status.exists && status.valid ? '✅' : '❌';
    console.log(`${statusIcon} ${agentName}`);
    
    if (!status.exists) {
      console.log(`   ⚠️  File not found: ${filePath}`);
      managementIssues++;
    } else if (!status.valid) {
      console.log(`   ⚠️  Validation issues: ${status.issues.join(', ')}`);
      managementIssues++;
    } else {
      console.log(`   📄 Size: ${status.size} bytes, Modified: ${status.lastModified.toDateString()}`);
    }
  });
  
  console.log();

  // Check HubSpot agents
  console.log('🚀 HUBSPOT AGENTS:');
  console.log('-' .repeat(30));
  
  let hubspotIssues = 0;
  expectedHubSpotAgents.forEach(agentName => {
    const filePath = path.join(BASE_DIR, 'ClaudeHubSpot', 'agents', `${agentName}.yaml`);
    const status = checkAgentFile(filePath, agentName);
    
    const statusIcon = status.exists && status.valid ? '✅' : '❌';
    console.log(`${statusIcon} ${agentName}`);
    
    if (!status.exists) {
      console.log(`   ⚠️  File not found: ${filePath}`);
      hubspotIssues++;
    } else if (!status.valid) {
      console.log(`   ⚠️  Validation issues: ${status.issues.join(', ')}`);
      hubspotIssues++;
    } else {
      console.log(`   📄 Size: ${status.size} bytes, Modified: ${status.lastModified.toDateString()}`);
    }
  });
  
  console.log();

  // Check additional HubSpot agents
  console.log('📊 ADDITIONAL HUBSPOT AGENTS:');
  console.log('-' .repeat(30));
  
  try {
    const hubspotAgentsDir = path.join(BASE_DIR, 'ClaudeHubSpot', 'agents');
    const allAgentFiles = fs.readdirSync(hubspotAgentsDir)
      .filter(file => file.endsWith('.yaml'))
      .map(file => file.replace('.yaml', ''));
    
    const additionalAgents = allAgentFiles.filter(agent => 
      !expectedHubSpotAgents.includes(agent) && 
      !agent.startsWith('sfdc-') // Exclude bridge agents
    );
    
    if (additionalAgents.length > 0) {
      additionalAgents.forEach(agentName => {
        const filePath = path.join(hubspotAgentsDir, `${agentName}.yaml`);
        const status = checkAgentFile(filePath, agentName);
        const statusIcon = status.valid ? '✅' : '⚠️';
        console.log(`${statusIcon} ${agentName} (additional)`);
        
        if (status.valid) {
          console.log(`   📄 Size: ${status.size} bytes, Modified: ${status.lastModified.toDateString()}`);
        } else if (status.issues.length > 0) {
          console.log(`   ⚠️  Issues: ${status.issues.join(', ')}`);
        }
      });
    } else {
      console.log('ℹ️  No additional agents found');
    }
  } catch (error) {
    console.log(`❌ Error scanning additional agents: ${error.message}`);
  }
  
  console.log();

  // Summary
  console.log('📈 REGISTRATION SUMMARY:');
  console.log('-' .repeat(30));
  console.log(`Management Agents: ${expectedManagementAgents.length - managementIssues}/${expectedManagementAgents.length} registered`);
  console.log(`HubSpot Core Agents: ${expectedHubSpotAgents.length - hubspotIssues}/${expectedHubSpotAgents.length} registered`);
  
  const totalIssues = managementIssues + hubspotIssues;
  if (totalIssues === 0) {
    console.log('✅ All core agents are properly registered!');
  } else {
    console.log(`❌ ${totalIssues} registration issues found`);
  }
  
  console.log();

  // MCP Tools check
  console.log('🔧 MCP TOOLS CHECK:');
  console.log('-' .repeat(30));
  
  try {
    const mcpConfigPath = path.join(BASE_DIR, 'ClaudeHubSpot', '.mcp.json');
    if (fs.existsSync(mcpConfigPath)) {
      const mcpConfig = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf8'));
      console.log('✅ MCP configuration found');
      
      if (mcpConfig.mcpServers && mcpConfig.mcpServers['hubspot-enhanced-server']) {
        console.log('✅ HubSpot Enhanced Server configured');
        console.log(`   📍 Command: ${mcpConfig.mcpServers['hubspot-enhanced-server'].command}`);
      } else {
        console.log('⚠️  HubSpot Enhanced Server not found in MCP config');
      }
    } else {
      console.log('❌ MCP configuration file not found');
    }
  } catch (error) {
    console.log(`❌ Error checking MCP configuration: ${error.message}`);
  }
  
  console.log();

  return totalIssues === 0;
}

// Run the check
const allRegistered = checkAgentRegistration();

if (allRegistered) {
  console.log('🎉 Agent registration check completed successfully!');
  process.exit(0);
} else {
  console.log('⚠️  Some agents need attention. Review the issues above.');
  process.exit(1);
}