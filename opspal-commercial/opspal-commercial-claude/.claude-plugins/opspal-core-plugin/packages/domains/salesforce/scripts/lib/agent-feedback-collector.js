#!/usr/bin/env node

/**
 * Agent Feedback Collector
 *
 * Collects structured feedback from agents about tool performance,
 * documentation quality, and improvement suggestions.
 *
 * Enables data-driven decisions about:
 * - Which tools need better docs
 * - Which tools are confusing
 * - What new tools are needed
 * - How to improve agent experience
 *
 * Usage:
 *   const collector = new AgentFeedbackCollector({ dbPath: './feedback.db' });
 *   await collector.submitFeedback({
 *       agentName: 'sfdc-cpq-assessor',
 *       toolName: 'DataAccessError',
 *       rating: 5,
 *       category: 'documentation',
 *       feedback: 'Clear examples, easy to implement'
 *   });
 *
 * @module agent-feedback-collector
 * @version 1.0.0
 * @created 2025-10-26
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

class AgentFeedbackCollector {
    constructor(options = {}) {
        this.dbPath = options.dbPath || path.join(process.cwd(), '.claude', 'agent-feedback.db');
        this.verbose = options.verbose || false;
        this.db = null;

        const dbDir = path.dirname(this.dbPath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }
    }

    async initialize() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    reject(err);
                    return;
                }

                this.db.run(`
                    CREATE TABLE IF NOT EXISTS feedback (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        agent_name TEXT NOT NULL,
                        tool_name TEXT,
                        playbook_name TEXT,
                        rating INTEGER CHECK(rating BETWEEN 1 AND 5),
                        category TEXT NOT NULL,
                        feedback_text TEXT NOT NULL,
                        improvement_suggestion TEXT,
                        timestamp TEXT NOT NULL,
                        context TEXT,
                        resolved BOOLEAN DEFAULT 0,
                        resolution_notes TEXT
                    )
                `, (err) => {
                    if (err) reject(err);
                    else {
                        this.db.run(`CREATE INDEX IF NOT EXISTS idx_agent ON feedback(agent_name)`);
                        this.db.run(`CREATE INDEX IF NOT EXISTS idx_tool ON feedback(tool_name)`);
                        this.db.run(`CREATE INDEX IF NOT EXISTS idx_category ON feedback(category)`);
                        resolve();
                    }
                });
            });
        });
    }

    /**
     * Submit feedback from agent
     * @param {object} feedback - Feedback details
     * @param {string} feedback.agentName - Agent providing feedback
     * @param {string} feedback.toolName - Tool being reviewed (optional)
     * @param {string} feedback.playbookName - Playbook being reviewed (optional)
     * @param {number} feedback.rating - 1-5 rating
     * @param {string} feedback.category - documentation|usability|performance|bug|feature_request
     * @param {string} feedback.feedbackText - Detailed feedback
     * @param {string} feedback.improvementSuggestion - Suggestion for improvement
     * @param {object} feedback.context - Additional context
     */
    async submitFeedback(feedback) {
        const timestamp = new Date().toISOString();
        const context = JSON.stringify(feedback.context || {});

        return new Promise((resolve, reject) => {
            this.db.run(`
                INSERT INTO feedback (
                    agent_name, tool_name, playbook_name, rating, category,
                    feedback_text, improvement_suggestion, timestamp, context
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                feedback.agentName,
                feedback.toolName || null,
                feedback.playbookName || null,
                feedback.rating,
                feedback.category,
                feedback.feedbackText,
                feedback.improvementSuggestion || null,
                timestamp,
                context
            ], function(err) {
                if (err) reject(err);
                else {
                    const feedbackId = this.lastID;
                    if (this.verbose) {
                        console.log(`Feedback submitted: ID ${feedbackId} from ${feedback.agentName}`);
                    }
                    resolve(feedbackId);
                }
            });
        });
    }

    /**
     * Get feedback summary for a specific tool
     */
    async getToolFeedback(toolName) {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT
                    AVG(rating) as avg_rating,
                    COUNT(*) as total_feedback,
                    category,
                    COUNT(*) as count
                FROM feedback
                WHERE tool_name = ?
                GROUP BY category
            `, [toolName], async (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }

                const detailsQuery = `
                    SELECT
                        agent_name,
                        rating,
                        category,
                        feedback_text,
                        improvement_suggestion,
                        timestamp
                    FROM feedback
                    WHERE tool_name = ?
                    ORDER BY timestamp DESC
                `;

                this.db.all(detailsQuery, [toolName], (err2, details) => {
                    if (err2) reject(err2);
                    else {
                        resolve({
                            tool_name: toolName,
                            summary: rows,
                            details: details
                        });
                    }
                });
            });
        });
    }

    /**
     * Get tools needing attention (low ratings or many issues)
     */
    async getToolsNeedingAttention() {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT
                    tool_name,
                    AVG(rating) as avg_rating,
                    COUNT(*) as feedback_count,
                    SUM(CASE WHEN category = 'bug' THEN 1 ELSE 0 END) as bug_count,
                    SUM(CASE WHEN category = 'documentation' AND rating <= 2 THEN 1 ELSE 0 END) as doc_issues
                FROM feedback
                WHERE tool_name IS NOT NULL
                GROUP BY tool_name
                HAVING avg_rating < 3 OR bug_count > 0 OR doc_issues > 0
                ORDER BY avg_rating ASC, bug_count DESC
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    /**
     * Get feature requests
     */
    async getFeatureRequests() {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT
                    agent_name,
                    tool_name,
                    feedback_text,
                    improvement_suggestion,
                    timestamp
                FROM feedback
                WHERE category = 'feature_request'
                ORDER BY timestamp DESC
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    /**
     * Get documentation issues
     */
    async getDocumentationIssues() {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT
                    tool_name,
                    playbook_name,
                    AVG(rating) as avg_rating,
                    COUNT(*) as issue_count,
                    GROUP_CONCAT(feedback_text, ' | ') as issues
                FROM feedback
                WHERE category = 'documentation' AND rating <= 2
                GROUP BY tool_name, playbook_name
                ORDER BY avg_rating ASC, issue_count DESC
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    /**
     * Generate feedback report
     */
    async generateReport() {
        const [
            toolsNeedingAttention,
            featureRequests,
            docIssues
        ] = await Promise.all([
            this.getToolsNeedingAttention(),
            this.getFeatureRequests(),
            this.getDocumentationIssues()
        ]);

        return {
            summary: {
                tools_needing_attention: toolsNeedingAttention.length,
                feature_requests: featureRequests.length,
                documentation_issues: docIssues.length
            },
            tools_needing_attention: toolsNeedingAttention.slice(0, 10),
            feature_requests: featureRequests.slice(0, 10),
            documentation_issues: docIssues.slice(0, 10),
            recommendations: this.generateRecommendations(toolsNeedingAttention, docIssues)
        };
    }

    /**
     * Generate recommendations based on feedback
     */
    generateRecommendations(toolIssues, docIssues) {
        const recommendations = [];

        // Tools with low ratings
        const lowRated = toolIssues.filter(t => t.avg_rating < 2.5);
        if (lowRated.length > 0) {
            recommendations.push({
                priority: 'high',
                category: 'tool_quality',
                issue: `${lowRated.length} tools with ratings below 2.5`,
                action: 'Review and improve or consider deprecating',
                tools: lowRated.map(t => t.tool_name)
            });
        }

        // Tools with bugs
        const buggy = toolIssues.filter(t => t.bug_count > 0);
        if (buggy.length > 0) {
            recommendations.push({
                priority: 'critical',
                category: 'bugs',
                issue: `${buggy.length} tools with reported bugs`,
                action: 'Fix bugs immediately',
                tools: buggy.map(t => t.tool_name)
            });
        }

        // Documentation issues
        if (docIssues.length > 0) {
            recommendations.push({
                priority: 'medium',
                category: 'documentation',
                issue: `${docIssues.length} tools with poor documentation`,
                action: 'Improve examples and clarity',
                tools: docIssues.filter(d => d.tool_name).map(d => d.tool_name)
            });
        }

        return recommendations;
    }

    /**
     * Mark feedback as resolved
     */
    async resolveFeedback(feedbackId, resolutionNotes) {
        return new Promise((resolve, reject) => {
            this.db.run(`
                UPDATE feedback
                SET resolved = 1, resolution_notes = ?
                WHERE id = ?
            `, [resolutionNotes, feedbackId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    async close() {
        return new Promise((resolve, reject) => {
            if (this.db) {
                this.db.close((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

// CLI usage
if (require.main === module) {
    const command = process.argv[2];
    const collector = new AgentFeedbackCollector({ verbose: true });

    (async () => {
        await collector.initialize();

        switch (command) {
            case 'report':
                const report = await collector.generateReport();
                console.log(JSON.stringify(report, null, 2));
                break;

            case 'attention':
                const tools = await collector.getToolsNeedingAttention();
                console.log('Tools Needing Attention:');
                tools.forEach(t => {
                    console.log(`  ${t.tool_name}: Rating ${t.avg_rating.toFixed(1)}/5, ${t.bug_count} bugs, ${t.doc_issues} doc issues`);
                });
                break;

            case 'features':
                const features = await collector.getFeatureRequests();
                console.log('Feature Requests:');
                features.forEach(f => {
                    console.log(`  [${f.agent_name}] ${f.feedback_text}`);
                    if (f.improvement_suggestion) {
                        console.log(`    Suggestion: ${f.improvement_suggestion}`);
                    }
                });
                break;

            case 'docs':
                const docs = await collector.getDocumentationIssues();
                console.log('Documentation Issues:');
                docs.forEach(d => {
                    console.log(`  ${d.tool_name || d.playbook_name}: Rating ${d.avg_rating.toFixed(1)}/5 (${d.issue_count} issues)`);
                });
                break;

            default:
                console.log('Usage:');
                console.log('  node agent-feedback-collector.js report      - Full feedback report');
                console.log('  node agent-feedback-collector.js attention   - Tools needing attention');
                console.log('  node agent-feedback-collector.js features    - Feature requests');
                console.log('  node agent-feedback-collector.js docs        - Documentation issues');
        }

        await collector.close();
    })().catch(err => {
        console.error('Error:', err);
        process.exit(1);
    });
}

module.exports = AgentFeedbackCollector;
