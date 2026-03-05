#!/usr/bin/env node

/**
 * Tool Usage Monitor
 *
 * Tracks which tools from library-reference.yaml are actually used by agents.
 * Helps identify:
 * - Most/least used tools
 * - Tool adoption rates
 * - Unused tools that can be deprecated
 * - Tools needing better documentation
 *
 * Usage:
 *   const monitor = new ToolUsageMonitor({ dbPath: './tool-usage.db' });
 *   await monitor.recordUsage('DataAccessError', 'sfdc-cpq-assessor', 'success');
 *   const stats = await monitor.getUsageStats();
 *
 * @module tool-usage-monitor
 * @version 1.0.0
 * @created 2025-10-26
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

class ToolUsageMonitor {
    constructor(options = {}) {
        this.dbPath = options.dbPath || path.join(process.cwd(), '.claude', 'tool-usage.db');
        this.verbose = options.verbose || false;
        this.db = null;

        // Ensure database directory exists
        const dbDir = path.dirname(this.dbPath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }
    }

    /**
     * Initialize database and create tables
     */
    async initialize() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    reject(err);
                    return;
                }

                this.db.run(`
                    CREATE TABLE IF NOT EXISTS tool_usage (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        tool_name TEXT NOT NULL,
                        agent_name TEXT NOT NULL,
                        usage_type TEXT NOT NULL,
                        status TEXT NOT NULL,
                        timestamp TEXT NOT NULL,
                        duration_ms INTEGER,
                        error_message TEXT,
                        metadata TEXT
                    )
                `, (err) => {
                    if (err) reject(err);
                    else {
                        this.db.run(`
                            CREATE INDEX IF NOT EXISTS idx_tool_name ON tool_usage(tool_name)
                        `);
                        this.db.run(`
                            CREATE INDEX IF NOT EXISTS idx_agent_name ON tool_usage(agent_name)
                        `);
                        this.db.run(`
                            CREATE INDEX IF NOT EXISTS idx_timestamp ON tool_usage(timestamp)
                        `);
                        resolve();
                    }
                });
            });
        });
    }

    /**
     * Record tool usage
     * @param {string} toolName - Name of tool from library-reference.yaml
     * @param {string} agentName - Name of agent using the tool
     * @param {string} status - success|failure|warning
     * @param {object} options - Additional metadata
     */
    async recordUsage(toolName, agentName, status, options = {}) {
        const timestamp = new Date().toISOString();
        const metadata = JSON.stringify(options.metadata || {});

        return new Promise((resolve, reject) => {
            this.db.run(`
                INSERT INTO tool_usage (
                    tool_name, agent_name, usage_type, status, timestamp,
                    duration_ms, error_message, metadata
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                toolName,
                agentName,
                options.usageType || 'invoke',
                status,
                timestamp,
                options.durationMs || null,
                options.errorMessage || null,
                metadata
            ], (err) => {
                if (err) reject(err);
                else {
                    if (this.verbose) {
                        console.log(`Recorded: ${toolName} by ${agentName} (${status})`);
                    }
                    resolve();
                }
            });
        });
    }

    /**
     * Get overall usage statistics
     */
    async getUsageStats() {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT
                    tool_name,
                    COUNT(*) as total_uses,
                    COUNT(DISTINCT agent_name) as unique_agents,
                    SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
                    SUM(CASE WHEN status = 'failure' THEN 1 ELSE 0 END) as failure_count,
                    AVG(duration_ms) as avg_duration_ms,
                    MIN(timestamp) as first_used,
                    MAX(timestamp) as last_used
                FROM tool_usage
                GROUP BY tool_name
                ORDER BY total_uses DESC
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    /**
     * Get tool usage by agent
     */
    async getAgentUsage(agentName) {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT
                    tool_name,
                    COUNT(*) as uses,
                    SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successes,
                    AVG(duration_ms) as avg_duration_ms
                FROM tool_usage
                WHERE agent_name = ?
                GROUP BY tool_name
                ORDER BY uses DESC
            `, [agentName], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    /**
     * Get unused tools (tools in library but never used)
     */
    async getUnusedTools(toolList) {
        const stats = await this.getUsageStats();
        const usedTools = new Set(stats.map(s => s.tool_name));
        return toolList.filter(tool => !usedTools.has(tool));
    }

    /**
     * Get adoption rate (% of agents using each tool)
     */
    async getAdoptionRates(totalAgents) {
        const stats = await this.getUsageStats();
        return stats.map(s => ({
            tool_name: s.tool_name,
            adoption_rate: (s.unique_agents / totalAgents * 100).toFixed(1) + '%',
            unique_agents: s.unique_agents,
            total_agents: totalAgents
        }));
    }

    /**
     * Get recent usage (last N days)
     */
    async getRecentUsage(days = 7) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        const cutoff = cutoffDate.toISOString();

        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT
                    tool_name,
                    agent_name,
                    status,
                    timestamp,
                    duration_ms
                FROM tool_usage
                WHERE timestamp >= ?
                ORDER BY timestamp DESC
            `, [cutoff], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    /**
     * Generate usage report
     */
    async generateReport() {
        const stats = await this.getUsageStats();
        const totalUses = stats.reduce((sum, s) => sum + s.total_uses, 0);

        const report = {
            summary: {
                total_uses: totalUses,
                unique_tools: stats.length,
                most_used: stats[0]?.tool_name || 'none',
                least_used: stats[stats.length - 1]?.tool_name || 'none'
            },
            top_tools: stats.slice(0, 10).map(s => ({
                tool: s.tool_name,
                uses: s.total_uses,
                agents: s.unique_agents,
                success_rate: (s.success_count / s.total_uses * 100).toFixed(1) + '%'
            })),
            underutilized: stats.filter(s => s.total_uses < 5).map(s => ({
                tool: s.tool_name,
                uses: s.total_uses,
                recommendation: 'Consider deprecating or improving documentation'
            }))
        };

        return report;
    }

    /**
     * Close database connection
     */
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
    const monitor = new ToolUsageMonitor({ verbose: true });

    (async () => {
        await monitor.initialize();

        switch (command) {
            case 'report':
                const report = await monitor.generateReport();
                console.log(JSON.stringify(report, null, 2));
                break;

            case 'stats':
                const stats = await monitor.getUsageStats();
                console.log('Tool Usage Statistics:');
                stats.forEach(s => {
                    console.log(`  ${s.tool_name}: ${s.total_uses} uses by ${s.unique_agents} agents`);
                });
                break;

            case 'recent':
                const days = parseInt(process.argv[3]) || 7;
                const recent = await monitor.getRecentUsage(days);
                console.log(`Recent Usage (last ${days} days):`);
                recent.forEach(r => {
                    console.log(`  [${r.timestamp}] ${r.tool_name} by ${r.agent_name} (${r.status})`);
                });
                break;

            default:
                console.log('Usage:');
                console.log('  node tool-usage-monitor.js report  - Generate full report');
                console.log('  node tool-usage-monitor.js stats   - Show usage statistics');
                console.log('  node tool-usage-monitor.js recent [days]  - Show recent usage');
        }

        await monitor.close();
    })().catch(err => {
        console.error('Error:', err);
        process.exit(1);
    });
}

module.exports = ToolUsageMonitor;
