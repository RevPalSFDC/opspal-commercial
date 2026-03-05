#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

class AgentToolValidator {
    constructor(agentsDir = '.claude/agents') {
        this.agentsDir = agentsDir;
        this.standardTools = ['Bash', 'Read', 'Write', 'Grep', 'Glob', 'TodoWrite', 'Edit', 'Task', 'ExitPlanMode', 'WebFetch', 'WebSearch'];
        this.mcpTools = [
            'mcp_salesforce',
            'mcp_salesforce_data_query',
            'mcp_salesforce_data_create',
            'mcp_salesforce_data_update',
            'mcp_salesforce_data_delete',
            'mcp_salesforce_metadata_deploy',
            'mcp_salesforce_metadata_retrieve',
            'mcp_salesforce_field_create',
            'mcp_salesforce_object_create',
            'mcp_asana_list_workspaces',
            'mcp_asana_search_projects',
            'mcp_asana_get_task',
            'mcp_asana_create_task',
            'mcp_asana_update_task'
        ];
        this.modelCapabilities = {
            'sonnet': ['all_tools', 'mcp_tools'],
            'haiku': ['standard_tools_only'],
            'opus': ['all_tools', 'mcp_tools']
        };
    }

    parseFrontmatter(content) {
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (!frontmatterMatch) {
            return null;
        }

        const frontmatter = {};
        const lines = frontmatterMatch[1].split('\n');

        lines.forEach(line => {
            const match = line.match(/^(\w+):\s*(.+)$/);
            if (match) {
                const [, key, value] = match;
                frontmatter[key] = value.trim();
            }
        });

        return frontmatter;
    }

    validateAgent(agentPath) {
        const content = fs.readFileSync(agentPath, 'utf8');
        const frontmatter = this.parseFrontmatter(content);

        if (!frontmatter) {
            return { valid: false, error: 'No frontmatter found' };
        }

        const { name, model, tools } = frontmatter;

        if (!model) {
            return { valid: false, error: 'No model specified' };
        }

        if (!tools) {
            return { valid: false, error: 'No tools specified' };
        }

        const toolList = tools.split(',').map(t => t.trim());
        const mcpToolsUsed = toolList.filter(t => t.startsWith('mcp_'));

        const issues = [];
        const warnings = [];

        // Check model vs tool compatibility
        if (model === 'haiku' && mcpToolsUsed.length > 0) {
            warnings.push({
                type: 'MODEL_TOOL_MISMATCH',
                message: `Agent '${name}' uses model 'haiku' but declares MCP tools: ${mcpToolsUsed.join(', ')}`,
                recommendation: 'Upgrade to model: sonnet or remove MCP tools',
                severity: 'HIGH'
            });
        }

        // Check for unknown tools
        const unknownTools = toolList.filter(t =>
            !this.standardTools.includes(t) &&
            !this.mcpTools.includes(t) &&
            !t.startsWith('mcp_') &&
            !t.includes('*') // Allow wildcards
        );

        if (unknownTools.length > 0) {
            issues.push({
                type: 'UNKNOWN_TOOLS',
                message: `Unknown tools declared: ${unknownTools.join(', ')}`,
                severity: 'MEDIUM'
            });
        }

        return {
            valid: issues.length === 0,
            agent: name,
            model: model,
            tools: toolList,
            mcpTools: mcpToolsUsed,
            issues: issues,
            warnings: warnings
        };
    }

    validateAllAgents() {
        const agentFiles = fs.readdirSync(this.agentsDir)
            .filter(f => f.endsWith('.md') || f.endsWith('.yaml'))
            .map(f => path.join(this.agentsDir, f));

        const results = agentFiles.map(f => {
            try {
                return this.validateAgent(f);
            } catch (error) {
                return {
                    valid: false,
                    agent: path.basename(f),
                    error: error.message
                };
            }
        });

        const summary = {
            total: results.length,
            valid: results.filter(r => r.valid).length,
            withWarnings: results.filter(r => r.warnings && r.warnings.length > 0).length,
            withIssues: results.filter(r => r.issues && r.issues.length > 0).length,
            errors: results.filter(r => r.error).length
        };

        return { results, summary };
    }

    generateFixScript(validationResults) {
        const fixes = [];

        validationResults.results.forEach(result => {
            if (result.warnings) {
                result.warnings.forEach(warning => {
                    if (warning.type === 'MODEL_TOOL_MISMATCH') {
                        fixes.push({
                            agent: result.agent,
                            fix: `Upgrade model from '${result.model}' to 'sonnet'`,
                            script: `sed -i 's/^model: haiku$/model: sonnet/' .claude/agents/${result.agent}.md`
                        });
                    }
                });
            }
        });

        return fixes;
    }
}

// CLI Usage
if (require.main === module) {
    const validator = new AgentToolValidator();
    const results = validator.validateAllAgents();

    console.log('\n📊 Agent Tool Validation Report\n');
    console.log(`Total agents: ${results.summary.total}`);
    console.log(`Valid: ${results.summary.valid}`);
    console.log(`With warnings: ${results.summary.withWarnings}`);
    console.log(`With issues: ${results.summary.withIssues}`);
    console.log(`Errors: ${results.summary.errors}\n`);

    // Show detailed results
    let hasProblems = false;

    results.results.forEach(result => {
        if (result.error) {
            console.log(`❌ ${result.agent}: ${result.error}\n`);
            hasProblems = true;
        }

        if (result.warnings && result.warnings.length > 0) {
            console.log(`⚠️  ${result.agent} (${result.model}):`);
            result.warnings.forEach(w => {
                console.log(`   ${w.message}`);
                console.log(`   → ${w.recommendation}\n`);
            });
            hasProblems = true;
        }

        if (result.issues && result.issues.length > 0) {
            console.log(`❌ ${result.agent}:`);
            result.issues.forEach(i => {
                console.log(`   ${i.message}\n`);
            });
            hasProblems = true;
        }
    });

    if (!hasProblems) {
        console.log('✅ All agents are properly configured!\n');
    }

    // Generate fix script
    const fixes = validator.generateFixScript(results);
    if (fixes.length > 0) {
        console.log('\n🔧 Suggested Fixes:\n');
        fixes.forEach(fix => {
            console.log(`Agent: ${fix.agent}`);
            console.log(`Fix: ${fix.fix}`);
            console.log(`Command: ${fix.script}\n`);
        });

        // Write fix script
        const fixScriptPath = path.join(__dirname, '..', 'fix-agent-models.sh');
        const fixScript = '#!/bin/bash\n\n' + fixes.map(f => f.script).join('\n') + '\n';
        fs.writeFileSync(fixScriptPath, fixScript, { mode: 0o755 });
        console.log(`📝 Fix script written to: ${fixScriptPath}\n`);
    }

    process.exit(results.summary.withIssues > 0 ? 1 : 0);
}

module.exports = AgentToolValidator;