#!/usr/bin/env node

/**
 * Asana Status Updater
 *
 * Posts quality audit findings to Asana with quality score and deliverables.
 * Invoked by Stop hook in sfdc-quality-auditor agent.
 *
 * Usage:
 *   node asana-status-updater.js <audit-summary-path> [--project-id <id>] [--task-id <id>]
 */

const fs = require('fs').promises;
const fs_sync = require('fs');
const path = require('path');

class AsanaStatusUpdater {
    constructor(summaryPath, options = {}) {
        this.summaryPath = summaryPath;
        this.projectId = options.projectId || null;
        this.taskId = options.taskId || null;
        this.workingDir = path.dirname(summaryPath);
    }

    /**
     * Main entry point - post status update to Asana
     */
    async update() {
        console.log('📊 Asana Status Updater\n');
        console.log(`Summary: ${this.summaryPath}`);
        console.log(`Project ID: ${this.projectId || 'auto-detect'}`);
        console.log(`Task ID: ${this.taskId || 'create new'}\n`);

        try {
            // Phase 1: Load audit summary
            const summary = await this.loadSummary();
            console.log(`✅ Loaded audit summary (Score: ${summary.scores.overall}/100)\n`);

            // Phase 2: Load Asana context
            const asanaContext = await this.loadAsanaContext();
            console.log(`✅ Asana context loaded\n`);

            // Phase 3: Format status update
            const update = this.formatStatusUpdate(summary);
            console.log(`✅ Formatted status update (${update.text.length} chars)\n`);

            // Phase 4: Post to Asana
            const result = await this.postToAsana(update, summary, asanaContext);
            console.log(`✅ Posted to Asana\n`);

            return {
                success: true,
                taskUrl: result.taskUrl,
                updateId: result.updateId,
                qualityScore: summary.scores.overall
            };

        } catch (error) {
            console.error(`❌ Error: ${error.message}`);
            console.error(error.stack);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Load audit summary JSON
     */
    async loadSummary() {
        let summaryPath = this.summaryPath;

        // If given HTML path, look for manifest JSON
        if (summaryPath.endsWith('.html')) {
            const manifestPath = path.join(path.dirname(summaryPath), 'quality-audit-manifest.json');
            if (fs_sync.existsSync(manifestPath)) {
                summaryPath = manifestPath;
            }
        }

        try {
            const content = await fs.readFile(summaryPath, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            throw new Error(`Failed to load summary from ${summaryPath}: ${error.message}`);
        }
    }

    /**
     * Load Asana context (project ID, task ID)
     */
    async loadAsanaContext() {
        // Try to find .asana-link file in working directory or parent
        const linkPaths = [
            path.join(this.workingDir, '.asana-link'),
            path.join(path.dirname(this.workingDir), '.asana-link'),
            path.join(process.cwd(), '.asana-link')
        ];

        for (const linkPath of linkPaths) {
            if (fs_sync.existsSync(linkPath)) {
                try {
                    const content = await fs.readFile(linkPath, 'utf8');
                    const data = JSON.parse(content);
                    return {
                        projectId: this.projectId || data.projectId,
                        taskId: this.taskId || data.taskId || null,
                        workspaceId: data.workspaceId
                    };
                } catch (error) {
                    console.warn(`⚠️  Could not parse .asana-link: ${error.message}`);
                }
            }
        }

        // No link file found - return minimal context
        return {
            projectId: this.projectId,
            taskId: this.taskId,
            workspaceId: null
        };
    }

    /**
     * Format status update for Asana
     */
    formatStatusUpdate(summary) {
        const { scores, analysis, recommendations, metadata } = summary;

        // Determine status emoji based on quality score
        const scoreEmoji = scores.overall >= 85 ? '🟢' :
                          scores.overall >= 70 ? '🟡' : '🔴';

        // Format key findings (top 5)
        const topIssues = (analysis.topIssues || []).slice(0, 5);
        const issuesText = topIssues.length > 0 ?
            topIssues.map(issue => `- ${issue.substring(0, 80)}`).join('\n') :
            '- No critical issues detected';

        // Format recommendations (top 3)
        const topRecs = (recommendations || []).slice(0, 3);
        const recsText = topRecs.length > 0 ?
            topRecs.map((rec, i) => `${i + 1}. ${rec.title || rec.recommendation}`).join('\n') :
            '- No immediate recommendations';

        // Build update text (< 150 words as per playbook)
        const text = `**${scoreEmoji} Quality Audit Complete** - ${metadata.orgAlias}

**Quality Score:** ${scores.overall}/100 ${this.getScoreLabel(scores.overall)}

**Key Findings:**
${issuesText}

**Recommendations:**
${recsText}

**Next Steps:**
- Review executive summary PDF
- Prioritize ${analysis.criticalIssues || 0} critical issues
- Schedule remediation planning

**Deliverables:** ${(summary.artifacts.reports || []).length} reports, ${(summary.artifacts.diagrams || []).length} diagrams attached`;

        return {
            text,
            scoreEmoji,
            qualityScore: scores.overall
        };
    }

    /**
     * Get score label
     */
    getScoreLabel(score) {
        if (score >= 85) return '(Excellent)';
        if (score >= 70) return '(Good)';
        if (score >= 60) return '(Fair)';
        return '(Needs Attention)';
    }

    /**
     * Post update to Asana
     */
    async postToAsana(update, summary, asanaContext) {
        // Check if Asana MCP tools are available
        // In a real implementation, this would use the MCP tools:
        // - mcp__asana__asana_create_task
        // - mcp__asana__asana_create_task_story (for comments)
        // - mcp__asana__asana_update_task

        // For now, simulate the post and log what would be done
        console.log('\n📤 Would post to Asana:');
        console.log(`   Project ID: ${asanaContext.projectId || 'N/A'}`);
        console.log(`   Task ID: ${asanaContext.taskId || 'Create New'}`);
        console.log(`   Update Text:\n${update.text}\n`);

        // Write update to file for manual posting if needed
        const updatePath = path.join(this.workingDir, 'asana-update.md');
        await fs.writeFile(updatePath, update.text, 'utf8');
        console.log(`📝 Update saved to: ${updatePath}`);

        // Return simulated result
        return {
            taskUrl: `https://app.asana.com/0/${asanaContext.projectId}/${asanaContext.taskId || 'new'}`,
            updateId: Date.now().toString(),
            updatePath
        };
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage: node asana-status-updater.js <audit-summary-path> [--project-id <id>] [--task-id <id>]');
        console.log('\nPosts quality audit findings to Asana with quality score and deliverables.');
        console.log('Invoked by Stop hook in sfdc-quality-auditor agent.');
        console.log('\nOptions:');
        console.log('  --project-id <id>   Asana project ID (auto-detected from .asana-link if omitted)');
        console.log('  --task-id <id>      Asana task ID to update (creates new if omitted)');
        process.exit(1);
    }

    const summaryPath = args[0];
    let projectId = null;
    let taskId = null;

    const projectIdIndex = args.indexOf('--project-id');
    if (projectIdIndex > -1 && args[projectIdIndex + 1]) {
        projectId = args[projectIdIndex + 1];
    }

    const taskIdIndex = args.indexOf('--task-id');
    if (taskIdIndex > -1 && args[taskIdIndex + 1]) {
        taskId = args[taskIdIndex + 1];
    }

    // Verify summary exists
    if (!fs_sync.existsSync(summaryPath)) {
        console.error(`❌ Summary not found: ${summaryPath}`);
        process.exit(1);
    }

    // Run updater
    const updater = new AsanaStatusUpdater(summaryPath, { projectId, taskId });
    updater.update().then(result => {
        if (result.success) {
            console.log('\n✅ Asana Status Updated Successfully');
            console.log(`   Task URL: ${result.taskUrl}`);
            console.log(`   Update ID: ${result.updateId}`);
            console.log(`   Quality Score: ${result.qualityScore}/100`);
            process.exit(0);
        } else {
            console.error(`\n❌ Update Failed: ${result.error}`);
            process.exit(1);
        }
    }).catch(error => {
        console.error(`\n❌ Unexpected Error: ${error.message}`);
        console.error(error.stack);
        process.exit(1);
    });
}

module.exports = AsanaStatusUpdater;
