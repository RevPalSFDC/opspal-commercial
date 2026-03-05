#!/usr/bin/env node

/**
 * Skill Transfer Engine - ACE Framework Cross-Agent Learning
 *
 * Enables high-performing skills to transfer from one agent to similar agents,
 * creating a knowledge multiplier effect where one agent's success improves
 * all similar agents.
 *
 * Features:
 * - Detect transfer candidates (high-performing skills)
 * - Find similar agents based on task patterns
 * - Execute transfers with validation period
 * - Automatic rollback on failure
 * - Transfer analytics and reporting
 *
 * Based on ACE Framework's cross-agent skill transfer pattern.
 *
 * @version 1.0.0
 * @date 2025-12-06
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Try to load Supabase client
let supabase = null;
try {
    const { createClient } = require('@supabase/supabase-js');
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY;

    if (supabaseUrl && supabaseKey) {
        supabase = createClient(supabaseUrl, supabaseKey);
    }
} catch (e) {
    // Supabase not available
}

class SkillTransferEngine {
    constructor(options = {}) {
        this.verbose = options.verbose || false;
        this.dryRun = options.dryRun || false;
        this.useSupabase = options.useSupabase !== false && supabase !== null;

        // Transfer configuration
        this.config = {
            // High performer thresholds
            minSuccessRate: options.minSuccessRate || 0.90,      // 90% success rate
            minUsageCount: options.minUsageCount || 50,          // 50+ uses
            minConfidence: options.minConfidence || 0.85,         // 85% confidence

            // Validation configuration
            validationThreshold: options.validationThreshold || 20, // 20 uses before decision
            acceptanceThreshold: options.acceptanceThreshold || 0.80, // 80% to accept
            rejectionThreshold: options.rejectionThreshold || 0.60,   // Below 60% to reject

            // Agent similarity
            similarityCategoryWeight: 0.5,    // Same category
            similarityKeywordWeight: 0.3,     // Keyword overlap
            similarityToolWeight: 0.2         // Tool overlap
        };

        // Agent metadata cache
        this.agentMetadata = new Map();

        this.log('SkillTransferEngine initialized');
    }

    /**
     * Initialize the engine
     */
    async init() {
        await this.loadAgentMetadata();
        return this;
    }

    /**
     * Load agent metadata from agent files
     */
    async loadAgentMetadata() {
        const pluginDirs = [
            path.join(__dirname, '../../..', 'salesforce-plugin', 'agents'),
            path.join(__dirname, '../../..', 'hubspot-plugin', 'agents'),
            path.join(__dirname, '..', '..', 'agents')
        ];

        for (const dir of pluginDirs) {
            if (!fs.existsSync(dir)) continue;

            const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));

            for (const file of files) {
                try {
                    const content = fs.readFileSync(path.join(dir, file), 'utf-8');
                    const metadata = this.extractAgentMetadata(content, file);
                    if (metadata) {
                        this.agentMetadata.set(metadata.name, metadata);
                    }
                } catch (e) {
                    // Skip files that can't be read
                }
            }
        }

        this.log(`Loaded metadata for ${this.agentMetadata.size} agents`);
    }

    /**
     * Extract metadata from agent file
     */
    extractAgentMetadata(content, filename) {
        // Extract YAML frontmatter
        const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (!yamlMatch) return null;

        const yaml = yamlMatch[1];
        const name = yaml.match(/name:\s*(.+)/)?.[1]?.trim();
        const description = yaml.match(/description:\s*(.+)/)?.[1]?.trim();
        const tools = yaml.match(/tools:\s*(.+)/)?.[1]?.trim()?.split(',').map(t => t.trim());
        const keywords = yaml.match(/triggerKeywords:\s*\n((?:\s+-\s*.+\n?)+)/)?.[1]
            ?.split('\n')
            .filter(l => l.trim())
            .map(l => l.replace(/^\s*-\s*/, '').trim());

        if (!name) return null;

        // Infer category from name or description
        let category = 'general';
        if (name.includes('sfdc') || description?.toLowerCase().includes('salesforce')) {
            category = 'salesforce';
        } else if (name.includes('hubspot') || description?.toLowerCase().includes('hubspot')) {
            category = 'hubspot';
        } else if (name.includes('data') || name.includes('query')) {
            category = 'data';
        } else if (name.includes('deploy') || name.includes('metadata')) {
            category = 'deployment';
        } else if (name.includes('audit') || name.includes('assess')) {
            category = 'assessment';
        }

        return {
            name,
            description: description || '',
            tools: tools || [],
            keywords: keywords || [],
            category,
            filename
        };
    }

    /**
     * Find transfer candidates (high-performing skills)
     */
    async findTransferCandidates() {
        if (!this.useSupabase) {
            this.log('Supabase not available - cannot find candidates');
            return [];
        }

        const { data, error } = await supabase
            .from('transfer_candidates')
            .select('*');

        if (error) {
            this.log(`Error finding candidates: ${error.message}`, 'ERROR');
            return [];
        }

        this.log(`Found ${data.length} transfer candidate(s)`);
        return data;
    }

    /**
     * Find agents similar to the source agent
     */
    findSimilarAgents(sourceAgent, options = {}) {
        const maxResults = options.maxResults || 5;
        const minSimilarity = options.minSimilarity || 0.3;

        const sourceMetadata = this.agentMetadata.get(sourceAgent);
        if (!sourceMetadata) {
            this.log(`Source agent not found: ${sourceAgent}`);
            return [];
        }

        const similarities = [];

        for (const [agentName, metadata] of this.agentMetadata.entries()) {
            if (agentName === sourceAgent) continue;

            const similarity = this.calculateSimilarity(sourceMetadata, metadata);

            if (similarity >= minSimilarity) {
                similarities.push({
                    agent: agentName,
                    similarity,
                    category: metadata.category,
                    matchFactors: {
                        sameCategory: sourceMetadata.category === metadata.category,
                        keywordOverlap: this.calculateOverlap(sourceMetadata.keywords, metadata.keywords),
                        toolOverlap: this.calculateOverlap(sourceMetadata.tools, metadata.tools)
                    }
                });
            }
        }

        return similarities
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, maxResults);
    }

    /**
     * Calculate similarity between two agents
     */
    calculateSimilarity(agent1, agent2) {
        let score = 0;

        // Category match
        if (agent1.category === agent2.category) {
            score += this.config.similarityCategoryWeight;
        }

        // Keyword overlap
        const keywordOverlap = this.calculateOverlap(agent1.keywords, agent2.keywords);
        score += keywordOverlap * this.config.similarityKeywordWeight;

        // Tool overlap
        const toolOverlap = this.calculateOverlap(agent1.tools, agent2.tools);
        score += toolOverlap * this.config.similarityToolWeight;

        return Math.round(score * 100) / 100;
    }

    /**
     * Calculate overlap ratio between two arrays
     */
    calculateOverlap(arr1, arr2) {
        if (!arr1?.length || !arr2?.length) return 0;

        const set1 = new Set(arr1.map(s => s.toLowerCase()));
        const set2 = new Set(arr2.map(s => s.toLowerCase()));

        let overlap = 0;
        for (const item of set1) {
            if (set2.has(item)) overlap++;
        }

        return overlap / Math.max(set1.size, set2.size);
    }

    /**
     * Execute a skill transfer
     */
    async transferSkill(skillId, sourceAgent, targetAgent, options = {}) {
        this.log(`Transferring skill ${skillId} from ${sourceAgent} to ${targetAgent}`);

        if (this.dryRun) {
            this.log('[DRY RUN] Would create transfer record');
            return {
                success: true,
                dryRun: true,
                skillId,
                sourceAgent,
                targetAgent
            };
        }

        if (!this.useSupabase) {
            this.log('Supabase not available - cannot execute transfer', 'ERROR');
            return { success: false, error: 'Supabase not available' };
        }

        try {
            // Create transfer record
            const { data: transfer, error: transferError } = await supabase
                .from('skill_transfers')
                .insert({
                    skill_id: skillId,
                    source_agent: sourceAgent,
                    target_agent: targetAgent,
                    status: 'validating',
                    validation_threshold: options.validationThreshold || this.config.validationThreshold,
                    acceptance_threshold: options.acceptanceThreshold || this.config.acceptanceThreshold,
                    rejection_threshold: options.rejectionThreshold || this.config.rejectionThreshold,
                    initiated_by: options.initiatedBy || 'auto'
                })
                .select()
                .single();

            if (transferError) {
                throw transferError;
            }

            // Create skill assignment for target agent
            const { error: assignError } = await supabase
                .from('agent_skill_assignments')
                .insert({
                    agent: targetAgent,
                    skill_id: skillId,
                    assignment_type: 'transferred',
                    transfer_id: transfer.id,
                    active: true
                });

            if (assignError) {
                // Rollback transfer record
                await supabase
                    .from('skill_transfers')
                    .delete()
                    .eq('id', transfer.id);
                throw assignError;
            }

            this.log(`Transfer created: ${transfer.id}`);

            return {
                success: true,
                transferId: transfer.id,
                skillId,
                sourceAgent,
                targetAgent,
                status: 'validating',
                validationThreshold: transfer.validation_threshold
            };

        } catch (error) {
            this.log(`Transfer failed: ${error.message}`, 'ERROR');
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Run automatic transfer detection and execution
     */
    async runAutoTransfer(options = {}) {
        this.log('Running automatic skill transfer...');

        const results = {
            candidatesFound: 0,
            transfersAttempted: 0,
            transfersSucceeded: 0,
            transfers: []
        };

        // Find candidates
        const candidates = await this.findTransferCandidates();
        results.candidatesFound = candidates.length;

        if (candidates.length === 0) {
            this.log('No transfer candidates found');
            return results;
        }

        // Process each candidate
        for (const candidate of candidates) {
            // Find similar agents
            const similarAgents = this.findSimilarAgents(candidate.source_agent, {
                maxResults: options.maxTargets || 3,
                minSimilarity: options.minSimilarity || 0.4
            });

            if (similarAgents.length === 0) {
                this.log(`No similar agents found for ${candidate.skill_id}`);
                continue;
            }

            // Attempt transfer to each similar agent
            for (const target of similarAgents) {
                results.transfersAttempted++;

                const transferResult = await this.transferSkill(
                    candidate.skill_id,
                    candidate.source_agent,
                    target.agent,
                    { initiatedBy: 'auto' }
                );

                if (transferResult.success) {
                    results.transfersSucceeded++;
                }

                results.transfers.push({
                    skillId: candidate.skill_id,
                    sourceAgent: candidate.source_agent,
                    targetAgent: target.agent,
                    similarity: target.similarity,
                    ...transferResult
                });
            }
        }

        this.log(`Transfer complete: ${results.transfersSucceeded}/${results.transfersAttempted} succeeded`);

        return results;
    }

    /**
     * Get transfer status
     */
    async getTransferStatus(transferId) {
        if (!this.useSupabase) {
            return { error: 'Supabase not available' };
        }

        const { data, error } = await supabase
            .from('skill_transfers')
            .select('*')
            .eq('id', transferId)
            .single();

        if (error) {
            return { error: error.message };
        }

        return data;
    }

    /**
     * Rollback a transfer
     */
    async rollbackTransfer(transferId, reason) {
        this.log(`Rolling back transfer ${transferId}: ${reason}`);

        if (this.dryRun) {
            return { success: true, dryRun: true };
        }

        if (!this.useSupabase) {
            return { success: false, error: 'Supabase not available' };
        }

        try {
            // Get transfer details
            const { data: transfer, error: fetchError } = await supabase
                .from('skill_transfers')
                .select('*')
                .eq('id', transferId)
                .single();

            if (fetchError) throw fetchError;

            // Update transfer status
            const { error: updateError } = await supabase
                .from('skill_transfers')
                .update({
                    status: 'rolled_back',
                    rollback_reason: reason,
                    rolled_back_at: new Date().toISOString()
                })
                .eq('id', transferId);

            if (updateError) throw updateError;

            // Deactivate assignment
            const { error: assignError } = await supabase
                .from('agent_skill_assignments')
                .update({
                    active: false,
                    deactivated_at: new Date().toISOString()
                })
                .eq('transfer_id', transferId);

            if (assignError) throw assignError;

            this.log(`Transfer rolled back: ${transferId}`);

            return {
                success: true,
                transferId,
                reason
            };

        } catch (error) {
            this.log(`Rollback failed: ${error.message}`, 'ERROR');
            return { success: false, error: error.message };
        }
    }

    /**
     * Get transfer statistics
     */
    async getStatistics() {
        if (!this.useSupabase) {
            return { error: 'Supabase not available' };
        }

        const { data: transfers, error } = await supabase
            .from('skill_transfers')
            .select('*');

        if (error) {
            return { error: error.message };
        }

        const stats = {
            total: transfers.length,
            byStatus: {
                validating: transfers.filter(t => t.status === 'validating').length,
                accepted: transfers.filter(t => t.status === 'accepted').length,
                rejected: transfers.filter(t => t.status === 'rejected').length,
                rolledBack: transfers.filter(t => t.status === 'rolled_back').length
            },
            acceptanceRate: 0,
            avgValidationSuccessRate: 0
        };

        const decided = transfers.filter(t => ['accepted', 'rejected'].includes(t.status));
        if (decided.length > 0) {
            stats.acceptanceRate = Math.round(
                (stats.byStatus.accepted / decided.length) * 100
            );
        }

        const withRates = transfers.filter(t => t.validation_success_rate > 0);
        if (withRates.length > 0) {
            stats.avgValidationSuccessRate = Math.round(
                withRates.reduce((sum, t) => sum + t.validation_success_rate, 0) /
                withRates.length * 100
            );
        }

        return stats;
    }

    /**
     * Log message
     */
    log(message, level = 'INFO') {
        if (this.verbose || level === 'ERROR') {
            console.log(`[SkillTransfer] [${level}] ${message}`);
        }
    }
}

// CLI Interface
if (require.main === module) {
    const args = process.argv.slice(2);

    const printHelp = () => {
        console.log('Usage: skill-transfer-engine.js <command> [options]');
        console.log('');
        console.log('ACE Framework Skill Transfer Engine v1.0.0');
        console.log('');
        console.log('Commands:');
        console.log('  candidates           List transfer candidates');
        console.log('  similar <agent>      Find similar agents');
        console.log('  transfer <skill> <from> <to>  Execute a transfer');
        console.log('  auto                 Run automatic transfers');
        console.log('  status <transfer-id> Get transfer status');
        console.log('  rollback <id> <reason> Rollback a transfer');
        console.log('  stats                Show transfer statistics');
        console.log('');
        console.log('Options:');
        console.log('  --help, -h           Show this help');
        console.log('  --verbose, -v        Verbose output');
        console.log('  --json               JSON output');
        console.log('  --dry-run            Simulate without making changes');
    };

    if (args.includes('--help') || args.includes('-h') || args.length === 0) {
        printHelp();
        process.exit(0);
    }

    const verbose = args.includes('--verbose') || args.includes('-v');
    const json = args.includes('--json');
    const dryRun = args.includes('--dry-run');
    const command = args.find(a => !a.startsWith('-'));

    (async () => {
        try {
            const engine = new SkillTransferEngine({ verbose, dryRun });
            await engine.init();

            switch (command) {
                case 'candidates':
                    const candidates = await engine.findTransferCandidates();
                    if (json) {
                        console.log(JSON.stringify(candidates, null, 2));
                    } else {
                        console.log(`Found ${candidates.length} transfer candidate(s):`);
                        for (const c of candidates) {
                            console.log(`  ${c.skill_id}`);
                            console.log(`    Source: ${c.source_agent}`);
                            console.log(`    Success Rate: ${(c.success_rate * 100).toFixed(1)}%`);
                            console.log(`    Uses: ${c.usage_count}`);
                            console.log('');
                        }
                    }
                    break;

                case 'similar':
                    const agentIndex = args.indexOf('similar') + 1;
                    const agent = args[agentIndex];
                    if (!agent || agent.startsWith('-')) {
                        console.error('Error: agent name required');
                        process.exit(1);
                    }
                    const similar = engine.findSimilarAgents(agent);
                    if (json) {
                        console.log(JSON.stringify(similar, null, 2));
                    } else {
                        console.log(`Similar agents to ${agent}:`);
                        for (const s of similar) {
                            console.log(`  ${s.agent}: ${(s.similarity * 100).toFixed(0)}% similar`);
                        }
                    }
                    break;

                case 'transfer':
                    const tIndex = args.indexOf('transfer');
                    const skillId = args[tIndex + 1];
                    const fromAgent = args[tIndex + 2];
                    const toAgent = args[tIndex + 3];
                    if (!skillId || !fromAgent || !toAgent) {
                        console.error('Error: skill-id, from-agent, and to-agent required');
                        process.exit(1);
                    }
                    const result = await engine.transferSkill(skillId, fromAgent, toAgent);
                    console.log(json ? JSON.stringify(result, null, 2) : result);
                    break;

                case 'auto':
                    const autoResult = await engine.runAutoTransfer();
                    console.log(json ? JSON.stringify(autoResult, null, 2) : autoResult);
                    break;

                case 'status':
                    const sIndex = args.indexOf('status') + 1;
                    const transferId = args[sIndex];
                    if (!transferId || transferId.startsWith('-')) {
                        console.error('Error: transfer-id required');
                        process.exit(1);
                    }
                    const status = await engine.getTransferStatus(transferId);
                    console.log(json ? JSON.stringify(status, null, 2) : status);
                    break;

                case 'rollback':
                    const rIndex = args.indexOf('rollback');
                    const rbId = args[rIndex + 1];
                    const reason = args[rIndex + 2];
                    if (!rbId || !reason) {
                        console.error('Error: transfer-id and reason required');
                        process.exit(1);
                    }
                    const rbResult = await engine.rollbackTransfer(rbId, reason);
                    console.log(json ? JSON.stringify(rbResult, null, 2) : rbResult);
                    break;

                case 'stats':
                    const stats = await engine.getStatistics();
                    if (json) {
                        console.log(JSON.stringify(stats, null, 2));
                    } else {
                        console.log('='.repeat(50));
                        console.log('Skill Transfer Statistics');
                        console.log('='.repeat(50));
                        console.log(`Total Transfers:      ${stats.total}`);
                        console.log(`  Validating:         ${stats.byStatus.validating}`);
                        console.log(`  Accepted:           ${stats.byStatus.accepted}`);
                        console.log(`  Rejected:           ${stats.byStatus.rejected}`);
                        console.log(`  Rolled Back:        ${stats.byStatus.rolledBack}`);
                        console.log(`Acceptance Rate:      ${stats.acceptanceRate}%`);
                        console.log(`Avg Validation Rate:  ${stats.avgValidationSuccessRate}%`);
                        console.log('='.repeat(50));
                    }
                    break;

                default:
                    console.error(`Unknown command: ${command}`);
                    printHelp();
                    process.exit(1);
            }

        } catch (error) {
            console.error(`Error: ${error.message}`);
            if (verbose) console.error(error.stack);
            process.exit(1);
        }
    })();
}

module.exports = { SkillTransferEngine };
