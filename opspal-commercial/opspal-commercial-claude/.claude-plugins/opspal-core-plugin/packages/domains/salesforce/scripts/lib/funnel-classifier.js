#!/usr/bin/env node

/**
 * Funnel Classification Engine
 *
 * Configurable logic for categorizing leads/contacts by demand funnel stage
 * based on campaign engagement patterns.
 *
 * Default stages: Suspect, Engaged, MQL, SQL, Opportunity
 *
 * Usage:
 *   const { FunnelClassifier } = require('./lib/funnel-classifier');
 *   const classifier = new FunnelClassifier(orgAlias);
 *
 *   const stages = await classifier.classifyContacts(contactIds);
 *   // Returns: { contactId: { stage, reason, campaigns, score } }
 */

const { execSync } = require('child_process');
const { getOrgContext } = require('./org-context-injector');
const { CampaignAttribution } = require('./campaign-attribution');

class FunnelClassifier {
    constructor(orgAlias = null, options = {}) {
        this.orgAlias = orgAlias;
        this.options = {
            verbose: options.verbose || false,
            ...options
        };

        // Default funnel stage definitions
        this.stageDefinitions = options.stageDefinitions || {
            suspect: {
                order: 1,
                label: 'Suspect',
                description: 'No tracked activity or brand engagement',
                criteria: {
                    campaignCount: 0
                }
            },
            engaged: {
                order: 2,
                label: 'Engaged',
                description: 'Has engaged through marketing but no explicit hand raise',
                criteria: {
                    campaignCount: { min: 1 },
                    excludeCampaignPatterns: ['*Landing Page*', '*Interest List*', '*Employee Referral*']
                }
            },
            mql: {
                order: 3,
                label: 'MQL',
                description: 'Marketing Qualified Lead - explicit interest shown',
                criteria: {
                    campaignPatterns: ['*Landing Page*', '*Interest List*', '*Form*'],
                    or: {
                        campaignTypes: ['Website Direct'],
                        memberStatus: ['Responded', 'Attended']
                    }
                }
            },
            sql: {
                order: 4,
                label: 'SQL',
                description: 'Sales Qualified Lead - sales engagement',
                criteria: {
                    // Define SQL criteria as needed
                    // Example: Lead Score > 50, or specific campaign patterns
                }
            }
        };

        // Hand raiser campaign patterns (MQL indicators)
        this.mqlPatterns = options.mqlPatterns || {
            landingPages: ['*Landing Page*', '*Form Submission*'],
            interestLists: ['*Interest List*', '*Waiting List*'],
            employeeReferrals: ['*Employee Referral*'],
            webinarAttendance: {
                patterns: ['*Webinar*', '*CE *', '*Continuing Education*'],
                statuses: ['Attended', 'Registered']
            }
        };

        this.attribution = new CampaignAttribution(orgAlias, { verbose: this.options.verbose });
    }

    /**
     * Initialize with automatic org detection if needed
     */
    async init() {
        if (!this.orgAlias) {
            const orgContext = await getOrgContext({ verbose: this.options.verbose });
            this.orgAlias = orgContext.alias;
        }
        await this.attribution.init();
    }

    /**
     * Classify leads/contacts by funnel stage
     *
     * @param {Array<string>} recordIds - Lead or Contact IDs
     * @param {Object} options - Classification options
     * @returns {Object} Classification by record ID
     */
    async classify(recordIds, options = {}) {
        await this.init();

        if (!Array.isArray(recordIds) || recordIds.length === 0) {
            return {};
        }

        const recordType = options.recordType || 'Contact'; // 'Contact' or 'Lead'
        const classifications = {};

        // Get campaign attribution data
        const attribution = recordType === 'Contact'
            ? await this.attribution.getFirstLastTouch(recordIds)
            : await this.getLeadAttribution(recordIds);

        // Get hand raiser identification
        const handRaisers = recordType === 'Contact'
            ? await this.attribution.identifyHandRaisers(recordIds, this.mqlPatterns)
            : await this.identifyLeadHandRaisers(recordIds);

        // Classify each record
        for (const recordId of recordIds) {
            const attributionData = attribution[recordId];
            const handRaiserData = handRaisers[recordId];

            const classification = this.determineStage(attributionData, handRaiserData);

            classifications[recordId] = {
                stage: classification.stage,
                stageLabel: this.stageDefinitions[classification.stage]?.label || classification.stage,
                reason: classification.reason,
                campaignCount: attributionData?.journeyCount || 0,
                isHandRaiser: handRaiserData?.isHandRaiser || false,
                engagementScore: this.calculateEngagementScore(attributionData, handRaiserData),
                firstTouchCampaign: attributionData?.firstTouch?.campaignName || null,
                lastTouchCampaign: attributionData?.lastTouch?.campaignName || null,
                daysSinceFirstTouch: attributionData?.firstTouch
                    ? this.daysSince(attributionData.firstTouch.date)
                    : null
            };
        }

        return classifications;
    }

    /**
     * Determine funnel stage based on attribution and hand raiser data
     */
    determineStage(attributionData, handRaiserData) {
        // No campaign engagement = Suspect
        if (!attributionData || attributionData.journeyCount === 0) {
            return {
                stage: 'suspect',
                reason: 'No tracked campaign engagement'
            };
        }

        // Hand raiser = MQL
        if (handRaiserData && handRaiserData.isHandRaiser) {
            return {
                stage: 'mql',
                reason: handRaiserData.reason || 'Explicit interest shown via campaign',
                mqlCampaigns: handRaiserData.campaigns
            };
        }

        // Has campaigns but no hand raise = Engaged
        if (attributionData.journeyCount > 0) {
            return {
                stage: 'engaged',
                reason: `${attributionData.journeyCount} campaign touches, no explicit hand raise`
            };
        }

        // Default to Suspect
        return {
            stage: 'suspect',
            reason: 'Unable to determine engagement level'
        };
    }

    /**
     * Calculate engagement score (0-100)
     */
    calculateEngagementScore(attributionData, handRaiserData) {
        let score = 0;

        if (!attributionData || attributionData.journeyCount === 0) {
            return 0;
        }

        // Base score from campaign count (max 40 points)
        score += Math.min(attributionData.journeyCount * 5, 40);

        // Hand raiser bonus (30 points)
        if (handRaiserData && handRaiserData.isHandRaiser) {
            score += 30;
        }

        // Recency bonus (max 20 points)
        if (attributionData.lastTouch) {
            const daysSince = this.daysSince(attributionData.lastTouch.date);
            if (daysSince <= 7) score += 20;
            else if (daysSince <= 30) score += 15;
            else if (daysSince <= 90) score += 10;
            else if (daysSince <= 180) score += 5;
        }

        // Multi-touch bonus (10 points)
        if (attributionData.journeyCount >= 3) {
            score += 10;
        }

        return Math.min(score, 100);
    }

    /**
     * Get attribution for leads (similar to contact attribution)
     */
    async getLeadAttribution(leadIds) {
        const batchSize = 200;
        const batches = [];

        for (let i = 0; i < leadIds.length; i += batchSize) {
            batches.push(leadIds.slice(i, i + batchSize));
        }

        const allAttribution = {};

        for (const batch of batches) {
            const query = `SELECT LeadId, CampaignId, Campaign.Name, Status, CreatedDate
                          FROM CampaignMember
                          WHERE LeadId IN ('${batch.join("','")}')
                          ORDER BY LeadId, CreatedDate ASC`;

            try {
                const result = execSync(
                    `sf data query --query "${query}" --json --target-org ${this.orgAlias}`,
                    { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
                );

                const data = JSON.parse(result);
                const records = data.result?.records || [];

                // Group by Lead
                const leadMemberships = {};
                for (const record of records) {
                    if (!leadMemberships[record.LeadId]) {
                        leadMemberships[record.LeadId] = [];
                    }
                    leadMemberships[record.LeadId].push(record);
                }

                // Calculate attribution for each lead
                for (const [leadId, campaigns] of Object.entries(leadMemberships)) {
                    if (campaigns.length === 0) continue;

                    campaigns.sort((a, b) => new Date(a.CreatedDate) - new Date(b.CreatedDate));

                    allAttribution[leadId] = {
                        firstTouch: {
                            campaignId: campaigns[0].CampaignId,
                            campaignName: campaigns[0].Campaign?.Name || null,
                            date: campaigns[0].CreatedDate,
                            status: campaigns[0].Status
                        },
                        lastTouch: {
                            campaignId: campaigns[campaigns.length - 1].CampaignId,
                            campaignName: campaigns[campaigns.length - 1].Campaign?.Name || null,
                            date: campaigns[campaigns.length - 1].CreatedDate,
                            status: campaigns[campaigns.length - 1].Status
                        },
                        journeyCount: campaigns.length,
                        touchPoints: campaigns
                    };
                }
            } catch (error) {
                if (this.options.verbose) {
                    console.error(`Error querying lead memberships: ${error.message}`);
                }
            }
        }

        // Add leads with no campaigns
        for (const leadId of leadIds) {
            if (!allAttribution[leadId]) {
                allAttribution[leadId] = {
                    firstTouch: null,
                    lastTouch: null,
                    journeyCount: 0,
                    touchPoints: []
                };
            }
        }

        return allAttribution;
    }

    /**
     * Identify hand raisers from lead campaign data
     */
    async identifyLeadHandRaisers(leadIds) {
        const attribution = await this.getLeadAttribution(leadIds);
        const handRaisers = {};

        for (const [leadId, data] of Object.entries(attribution)) {
            if (!data.touchPoints || data.touchPoints.length === 0) {
                handRaisers[leadId] = {
                    isHandRaiser: false,
                    reason: 'No campaign engagement',
                    campaigns: []
                };
                continue;
            }

            let isHandRaiser = false;
            const matchingCampaigns = [];

            for (const touch of data.touchPoints) {
                const campaignName = touch.Campaign?.Name || '';
                const status = touch.Status || '';

                // Check all MQL patterns
                if (this.matchesAnyMQLPattern(campaignName, status)) {
                    isHandRaiser = true;
                    matchingCampaigns.push(touch);
                }
            }

            handRaisers[leadId] = {
                isHandRaiser,
                reason: isHandRaiser ? 'Explicit interest shown' : 'Passive engagement only',
                campaigns: matchingCampaigns
            };
        }

        return handRaisers;
    }

    /**
     * Check if campaign matches any MQL pattern
     */
    matchesAnyMQLPattern(campaignName, status) {
        // Landing pages
        for (const pattern of this.mqlPatterns.landingPages) {
            if (this.matchesPattern(campaignName, pattern)) return true;
        }

        // Interest lists
        for (const pattern of this.mqlPatterns.interestLists) {
            if (this.matchesPattern(campaignName, pattern)) return true;
        }

        // Employee referrals
        for (const pattern of this.mqlPatterns.employeeReferrals) {
            if (this.matchesPattern(campaignName, pattern)) return true;
        }

        // Webinar attendance
        const webinarMatch = this.mqlPatterns.webinarAttendance.patterns.some(p =>
            this.matchesPattern(campaignName, p)
        );
        const statusMatch = this.mqlPatterns.webinarAttendance.statuses.includes(status);

        if (webinarMatch && statusMatch) return true;

        return false;
    }

    /**
     * Match pattern with wildcard support
     */
    matchesPattern(text, pattern) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'), 'i');
        return regex.test(text);
    }

    /**
     * Calculate days since a date
     */
    daysSince(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    /**
     * Generate funnel distribution summary
     */
    async getFunnelDistribution(recordIds, options = {}) {
        const classifications = await this.classify(recordIds, options);

        const distribution = {
            suspect: { count: 0, percentage: 0, avgScore: 0 },
            engaged: { count: 0, percentage: 0, avgScore: 0 },
            mql: { count: 0, percentage: 0, avgScore: 0 },
            sql: { count: 0, percentage: 0, avgScore: 0 }
        };

        const scoresByStage = {
            suspect: [],
            engaged: [],
            mql: [],
            sql: []
        };

        for (const classification of Object.values(classifications)) {
            const stage = classification.stage;
            distribution[stage].count++;
            scoresByStage[stage].push(classification.engagementScore);
        }

        const total = recordIds.length;

        for (const [stage, data] of Object.entries(distribution)) {
            data.percentage = total > 0 ? ((data.count / total) * 100).toFixed(1) : 0;
            data.avgScore = scoresByStage[stage].length > 0
                ? (scoresByStage[stage].reduce((a, b) => a + b, 0) / scoresByStage[stage].length).toFixed(1)
                : 0;
        }

        return {
            total,
            distribution,
            summary: `${distribution.mql.count} MQLs (${distribution.mql.percentage}%), ` +
                    `${distribution.engaged.count} Engaged (${distribution.engaged.percentage}%), ` +
                    `${distribution.suspect.count} Suspects (${distribution.suspect.percentage}%)`
        };
    }

    /**
     * Generate CSV for funnel stage bulk update
     */
    async generateFunnelStageCSV(recordIds, funnelStageField, options = {}) {
        const classifications = await this.classify(recordIds, options);
        const rows = [];

        // CSV Header
        rows.push(`Id,${funnelStageField}`);

        // Data rows
        for (const [recordId, classification] of Object.entries(classifications)) {
            rows.push(`${recordId},${classification.stageLabel}`);
        }

        return rows.join('\n');
    }
}

module.exports = {
    FunnelClassifier
};

// CLI usage
if (require.main === module) {
    (async () => {
        const args = process.argv.slice(2);

        if (args.length < 2) {
            console.log('Usage: funnel-classifier.js <org-alias> <record-ids...>');
            console.log('');
            console.log('Examples:');
            console.log('  funnel-classifier.js wedgewood-production 003...AAA 003...BBB');
            process.exit(1);
        }

        const orgAlias = args[0];
        const recordIds = args.slice(1);

        const classifier = new FunnelClassifier(orgAlias, { verbose: true });

        console.log(`\n📊 Funnel Classification Analysis`);
        console.log(`Org: ${orgAlias}`);
        console.log(`Records: ${recordIds.length}\n`);

        const classifications = await classifier.classify(recordIds);

        for (const [recordId, data] of Object.entries(classifications)) {
            console.log(`\nRecord: ${recordId}`);
            console.log(`  Stage: ${data.stageLabel}`);
            console.log(`  Reason: ${data.reason}`);
            console.log(`  Score: ${data.engagementScore}/100`);
            console.log(`  Campaigns: ${data.campaignCount}`);
            console.log(`  Hand Raiser: ${data.isHandRaiser ? 'Yes' : 'No'}`);
        }

        const distribution = await classifier.getFunnelDistribution(recordIds);
        console.log(`\n\n📈 Distribution Summary:`);
        console.log(distribution.summary);
        console.log('');
    })();
}
