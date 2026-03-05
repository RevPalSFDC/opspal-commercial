#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

class AgentModelUpgrader {
    constructor(agentsDir = '.claude/agents') {
        this.agentsDir = agentsDir;
    }

    upgradeAgent(agentPath, targetModel = 'sonnet', dryRun = false) {
        const content = fs.readFileSync(agentPath, 'utf8');
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

        if (!frontmatterMatch) {
            throw new Error('No frontmatter found');
        }

        const currentModel = content.match(/^model:\s*(\w+)$/m);
        if (!currentModel) {
            throw new Error('No model declaration found');
        }

        if (currentModel[1] === targetModel) {
            return {
                agent: path.basename(agentPath, '.md'),
                upgraded: false,
                reason: 'Already using target model',
                currentModel: currentModel[1]
            };
        }

        const updatedContent = content.replace(
            /^model:\s*\w+$/m,
            `model: ${targetModel}`
        );

        if (dryRun) {
            return {
                agent: path.basename(agentPath, '.md'),
                upgraded: false,
                dryRun: true,
                currentModel: currentModel[1],
                targetModel: targetModel,
                preview: updatedContent.substring(0, 200)
            };
        }

        // Backup original
        const backupPath = `${agentPath}.bak`;
        fs.writeFileSync(backupPath, content);

        // Write updated
        fs.writeFileSync(agentPath, updatedContent);

        return {
            agent: path.basename(agentPath, '.md'),
            upgraded: true,
            currentModel: currentModel[1],
            targetModel: targetModel,
            backup: backupPath
        };
    }

    upgradeAgentsWithMCPTools(dryRun = false) {
        const AgentToolValidator = require('./agent-tool-validator.js');
        const validatorPath = path.resolve(__dirname, '../../.claude/agents');
        const validator = new AgentToolValidator(validatorPath);
        const results = validator.validateAllAgents();

        const toUpgrade = results.results.filter(r =>
            r.warnings &&
            r.warnings.some(w => w.type === 'MODEL_TOOL_MISMATCH')
        );

        console.log(`\n🔍 Found ${toUpgrade.length} agents requiring model upgrades\n`);

        const upgraded = [];
        const skipped = [];
        const failed = [];

        toUpgrade.forEach(result => {
            const agentPath = path.join(validatorPath, `${result.agent}.md`);

            if (!fs.existsSync(agentPath)) {
                skipped.push({
                    agent: result.agent,
                    reason: 'Agent file not found'
                });
                return;
            }

            try {
                const upgradeResult = this.upgradeAgent(agentPath, 'sonnet', dryRun);

                if (upgradeResult.upgraded || upgradeResult.dryRun) {
                    upgraded.push(upgradeResult);
                    const status = dryRun ? '🔍 [DRY RUN]' : '✅';
                    console.log(`${status} ${result.agent}: ${upgradeResult.currentModel} → sonnet`);
                    if (upgradeResult.mcpTools) {
                        console.log(`   MCP tools: ${upgradeResult.mcpTools.join(', ')}`);
                    }
                } else {
                    skipped.push(upgradeResult);
                    console.log(`⏭️  Skipped ${result.agent}: ${upgradeResult.reason}`);
                }
            } catch (error) {
                failed.push({
                    agent: result.agent,
                    error: error.message
                });
                console.error(`❌ Failed to upgrade ${result.agent}: ${error.message}`);
            }
        });

        return {
            upgraded: upgraded,
            skipped: skipped,
            failed: failed,
            summary: {
                total: toUpgrade.length,
                upgraded: upgraded.length,
                skipped: skipped.length,
                failed: failed.length
            }
        };
    }

    upgradeAllAgents(targetModel = 'sonnet', dryRun = false) {
        const validatorPath = path.resolve(__dirname, '../../.claude/agents');
        const agentFiles = fs.readdirSync(validatorPath)
            .filter(f => f.endsWith('.md'))
            .map(f => path.join(validatorPath, f));

        console.log(`\n🔄 ${dryRun ? '[DRY RUN] ' : ''}Upgrading all agents to model: ${targetModel}\n`);

        const results = {
            upgraded: [],
            skipped: [],
            failed: []
        };

        agentFiles.forEach(agentPath => {
            try {
                const result = this.upgradeAgent(agentPath, targetModel, dryRun);
                if (result.upgraded || result.dryRun) {
                    results.upgraded.push(result);
                } else {
                    results.skipped.push(result);
                }
            } catch (error) {
                results.failed.push({
                    agent: path.basename(agentPath, '.md'),
                    error: error.message
                });
            }
        });

        return results;
    }

    generateUpgradeReport(results) {
        const report = [];

        report.push('# Agent Model Upgrade Report');
        report.push(`\n**Date**: ${new Date().toISOString()}`);
        report.push(`\n## Summary`);
        report.push(`\n- Total agents processed: ${results.summary.total}`);
        report.push(`- Successfully upgraded: ${results.summary.upgraded}`);
        report.push(`- Skipped: ${results.summary.skipped}`);
        report.push(`- Failed: ${results.summary.failed}`);

        if (results.upgraded.length > 0) {
            report.push(`\n## Upgraded Agents`);
            results.upgraded.forEach(r => {
                report.push(`\n### ${r.agent}`);
                report.push(`- Previous model: ${r.currentModel}`);
                report.push(`- New model: ${r.targetModel}`);
                if (r.backup) {
                    report.push(`- Backup: ${r.backup}`);
                }
            });
        }

        if (results.skipped.length > 0) {
            report.push(`\n## Skipped Agents`);
            results.skipped.forEach(r => {
                report.push(`\n- **${r.agent}**: ${r.reason}`);
            });
        }

        if (results.failed.length > 0) {
            report.push(`\n## Failed Upgrades`);
            results.failed.forEach(r => {
                report.push(`\n- **${r.agent}**: ${r.error}`);
            });
        }

        return report.join('\n');
    }
}

// CLI Usage
if (require.main === module) {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const allAgents = args.includes('--all');
    const targetModel = args.find(a => a.startsWith('--model='))?.split('=')[1] || 'sonnet';

    const upgrader = new AgentModelUpgrader();

    if (allAgents) {
        console.log(`\n🔄 ${dryRun ? '[DRY RUN] ' : ''}Upgrading ALL agents to model: ${targetModel}\n`);
        const results = upgrader.upgradeAllAgents(targetModel, dryRun);
        console.log(`\n✅ Upgraded ${results.upgraded.length} agents`);
        console.log(`⏭️  Skipped ${results.skipped.length} agents`);
        console.log(`❌ Failed ${results.failed.length} agents\n`);
    } else {
        console.log(`\n🔄 ${dryRun ? '[DRY RUN] ' : ''}Upgrading agents with MCP tools...\n`);
        const results = upgrader.upgradeAgentsWithMCPTools(dryRun);

        console.log(`\n📊 Summary:`);
        console.log(`✅ Upgraded: ${results.summary.upgraded}`);
        console.log(`⏭️  Skipped: ${results.summary.skipped}`);
        console.log(`❌ Failed: ${results.summary.failed}\n`);

        if (!dryRun && results.upgraded.length > 0) {
            const report = upgrader.generateUpgradeReport(results);
            const reportPath = path.join(__dirname, '..', '..', 'docs', 'AGENT_UPGRADE_REPORT.md');
            fs.writeFileSync(reportPath, report);
            console.log(`📝 Report written to: ${reportPath}\n`);
        }
    }

    if (dryRun) {
        console.log('ℹ️  This was a dry run. No files were modified.');
        console.log('   Run without --dry-run to apply changes.\n');
    }
}

module.exports = AgentModelUpgrader;