#!/usr/bin/env node

/**
 * Campaign Attribution Library
 *
 * Reusable logic for campaign attribution analysis including:
 * - First touch / Last touch calculation
 * - Multi-touch attribution models
 * - Campaign journey mapping
 * - Hand raiser identification
 *
 * Usage:
 *   const { CampaignAttribution } = require('./lib/campaign-attribution');
 *   const attribution = new CampaignAttribution(orgAlias);
 *
 *   const touches = await attribution.getFirstLastTouch(contactIds);
 *   // Returns: { contactId: { firstTouch, lastTouch, journeyCount } }
 */

const { execSync } = require('child_process');
const { getOrgContext, getOrgParam } = require('./org-context-injector');

class CampaignAttribution {
    constructor(orgAlias = null, options = {}) {
        this.orgAlias = orgAlias;
        this.options = {
            includeLeadHistory: options.includeLeadHistory !== false,
            sortByCreatedDate: options.sortByCreatedDate !== false,
            verbose: options.verbose || false,
            ...options
        };
    }

    /**
     * Initialize with automatic org detection if needed
     */
    async init() {
        if (!this.orgAlias) {
            const orgContext = await getOrgContext({ verbose: this.options.verbose });
            this.orgAlias = orgContext.alias;
        }
    }

    /**
     * Get first and last touch attribution for contacts
     *
     * @param {Array<string>} contactIds - Contact IDs to analyze
     * @param {Object} options - Optional parameters
     * @returns {Object} Attribution data by contact ID
     */
    async getFirstLastTouch(contactIds, options = {}) {
        await this.init();

        if (!Array.isArray(contactIds) || contactIds.length === 0) {
            return {};
        }

        const includeLeadHistory = options.includeLeadHistory ?? this.options.includeLeadHistory;
        const attributionData = {};

        // Get Contact campaign memberships
        const contactMemberships = await this.getCampaignMembershipsForContacts(contactIds);

        // Get Lead campaign memberships if requested (for converted contacts)
        let leadMemberships = {};
        if (includeLeadHistory) {
            leadMemberships = await this.getCampaignMembershipsForLeads(contactIds);
        }

        // Calculate attribution for each contact
        for (const contactId of contactIds) {
            const contactCampaigns = contactMemberships[contactId] || [];
            const leadCampaigns = leadMemberships[contactId] || [];

            // Combine all campaigns
            const allCampaigns = [...leadCampaigns, ...contactCampaigns];

            if (allCampaigns.length === 0) {
                attributionData[contactId] = {
                    firstTouch: null,
                    lastTouch: null,
                    journeyCount: 0,
                    touchPoints: []
                };
                continue;
            }

            // Sort by CreatedDate
            allCampaigns.sort((a, b) => new Date(a.CreatedDate) - new Date(b.CreatedDate));

            attributionData[contactId] = {
                firstTouch: {
                    campaignId: allCampaigns[0].CampaignId,
                    campaignName: allCampaigns[0].Campaign?.Name || null,
                    date: allCampaigns[0].CreatedDate,
                    status: allCampaigns[0].Status
                },
                lastTouch: {
                    campaignId: allCampaigns[allCampaigns.length - 1].CampaignId,
                    campaignName: allCampaigns[allCampaigns.length - 1].Campaign?.Name || null,
                    date: allCampaigns[allCampaigns.length - 1].CreatedDate,
                    status: allCampaigns[allCampaigns.length - 1].Status
                },
                journeyCount: allCampaigns.length,
                touchPoints: allCampaigns.map(c => ({
                    campaignId: c.CampaignId,
                    campaignName: c.Campaign?.Name || null,
                    date: c.CreatedDate,
                    status: c.Status
                })),
                daysBetweenFirstLast: this.calculateDaysBetween(
                    allCampaigns[0].CreatedDate,
                    allCampaigns[allCampaigns.length - 1].CreatedDate
                )
            };
        }

        return attributionData;
    }

    /**
     * Get campaign memberships for contacts
     */
    async getCampaignMembershipsForContacts(contactIds) {
        const batchSize = 200;
        const batches = [];

        for (let i = 0; i < contactIds.length; i += batchSize) {
            batches.push(contactIds.slice(i, i + batchSize));
        }

        const allMemberships = {};

        for (const batch of batches) {
            const query = `SELECT ContactId, CampaignId, Campaign.Name, Status, CreatedDate
                          FROM CampaignMember
                          WHERE ContactId IN ('${batch.join("','")}')
                          ORDER BY ContactId, CreatedDate ASC`;

            try {
                const result = execSync(
                    `sf data query --query "${query}" --json --target-org ${this.orgAlias}`,
                    { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
                );

                const data = JSON.parse(result);
                const records = data.result?.records || [];

                for (const record of records) {
                    if (!allMemberships[record.ContactId]) {
                        allMemberships[record.ContactId] = [];
                    }
                    allMemberships[record.ContactId].push(record);
                }
            } catch (error) {
                if (this.options.verbose) {
                    console.error(`Error querying contact memberships: ${error.message}`);
                }
            }
        }

        return allMemberships;
    }

    /**
     * Get campaign memberships from original leads (for converted contacts)
     */
    async getCampaignMembershipsForLeads(contactIds) {
        // First, get the Lead IDs from Contact records
        const leadIdQuery = `SELECT Id, LeadId FROM Contact WHERE Id IN ('${contactIds.join("','")}') AND LeadId != null`;

        try {
            const result = execSync(
                `sf data query --query "${leadIdQuery}" --json --target-org ${this.orgAlias}`,
                { encoding: 'utf8' }
            );

            const data = JSON.parse(result);
            const contacts = data.result?.records || [];

            if (contacts.length === 0) {
                return {};
            }

            // Map Contact ID to Lead ID
            const contactToLead = {};
            const leadIds = [];

            for (const contact of contacts) {
                if (contact.LeadId) {
                    contactToLead[contact.Id] = contact.LeadId;
                    leadIds.push(contact.LeadId);
                }
            }

            if (leadIds.length === 0) {
                return {};
            }

            // Query campaign memberships for these leads
            const membershipQuery = `SELECT LeadId, CampaignId, Campaign.Name, Status, CreatedDate
                                    FROM CampaignMember
                                    WHERE LeadId IN ('${leadIds.join("','")}')
                                    ORDER BY LeadId, CreatedDate ASC`;

            const membershipResult = execSync(
                `sf data query --query "${membershipQuery}" --json --target-org ${this.orgAlias}`,
                { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
            );

            const membershipData = JSON.parse(membershipResult);
            const memberships = membershipData.result?.records || [];

            // Map back to Contact IDs
            const leadToContact = {};
            for (const [contactId, leadId] of Object.entries(contactToLead)) {
                leadToContact[leadId] = contactId;
            }

            const contactMemberships = {};
            for (const membership of memberships) {
                const contactId = leadToContact[membership.LeadId];
                if (contactId) {
                    if (!contactMemberships[contactId]) {
                        contactMemberships[contactId] = [];
                    }
                    contactMemberships[contactId].push(membership);
                }
            }

            return contactMemberships;

        } catch (error) {
            if (this.options.verbose) {
                console.error(`Error querying lead memberships: ${error.message}`);
            }
            return {};
        }
    }

    /**
     * Identify hand raisers based on campaign patterns
     *
     * @param {Array<string>} contactIds - Contact IDs to analyze
     * @param {Object} patterns - Patterns to identify hand raisers
     * @returns {Object} Hand raiser classification
     */
    async identifyHandRaisers(contactIds, patterns = {}) {
        await this.init();

        const defaultPatterns = {
            landingPages: ['*Landing Page*', '*Form*'],
            interestLists: ['*Interest List*'],
            webinars: ['*Webinar*', '*CE *', '*Continuing Education*'],
            employeeReferrals: ['*Employee Referral*'],
            statusIndicators: ['Responded', 'Attended', 'Registered']
        };

        const campaignPatterns = { ...defaultPatterns, ...patterns };

        // Get all campaign memberships
        const attribution = await this.getFirstLastTouch(contactIds);
        const handRaisers = {};

        for (const [contactId, data] of Object.entries(attribution)) {
            if (!data.touchPoints || data.touchPoints.length === 0) {
                handRaisers[contactId] = {
                    isHandRaiser: false,
                    reason: 'No campaign engagement',
                    campaigns: []
                };
                continue;
            }

            let isHandRaiser = false;
            const matchingCampaigns = [];

            for (const touch of data.touchPoints) {
                const campaignName = touch.campaignName || '';
                const status = touch.status || '';

                // Check landing pages
                if (this.matchesPattern(campaignName, campaignPatterns.landingPages)) {
                    isHandRaiser = true;
                    matchingCampaigns.push({ ...touch, type: 'Landing Page' });
                }

                // Check interest lists
                if (this.matchesPattern(campaignName, campaignPatterns.interestLists)) {
                    isHandRaiser = true;
                    matchingCampaigns.push({ ...touch, type: 'Interest List' });
                }

                // Check webinars with specific status
                if (this.matchesPattern(campaignName, campaignPatterns.webinars) &&
                    campaignPatterns.statusIndicators.includes(status)) {
                    isHandRaiser = true;
                    matchingCampaigns.push({ ...touch, type: 'Webinar Attendee' });
                }

                // Check employee referrals
                if (this.matchesPattern(campaignName, campaignPatterns.employeeReferrals)) {
                    isHandRaiser = true;
                    matchingCampaigns.push({ ...touch, type: 'Employee Referral' });
                }
            }

            handRaisers[contactId] = {
                isHandRaiser,
                reason: isHandRaiser ? 'Explicit interest shown' : 'Passive engagement only',
                campaigns: matchingCampaigns,
                totalTouches: data.journeyCount
            };
        }

        return handRaisers;
    }

    /**
     * Match campaign name against patterns (supports wildcards)
     */
    matchesPattern(campaignName, patterns) {
        for (const pattern of patterns) {
            const regex = new RegExp(pattern.replace(/\*/g, '.*'), 'i');
            if (regex.test(campaignName)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Calculate days between two dates
     */
    calculateDaysBetween(date1, date2) {
        const d1 = new Date(date1);
        const d2 = new Date(date2);
        const diffTime = Math.abs(d2 - d1);
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    /**
     * Generate attribution update CSV for bulk API
     */
    async generateAttributionUpdateCSV(contactIds, fields = {}) {
        await this.init();

        const attribution = await this.getFirstLastTouch(contactIds);
        const rows = [];

        // CSV Header
        const headers = ['Id'];
        if (fields.firstTouchCampaign) headers.push(fields.firstTouchCampaign);
        if (fields.firstTouchDate) headers.push(fields.firstTouchDate);
        if (fields.lastTouchCampaign) headers.push(fields.lastTouchCampaign);
        if (fields.lastTouchDate) headers.push(fields.lastTouchDate);

        rows.push(headers.join(','));

        // Data rows
        for (const [contactId, data] of Object.entries(attribution)) {
            if (!data.firstTouch) continue; // Skip if no campaign data

            const row = [contactId];

            if (fields.firstTouchCampaign) {
                row.push(data.firstTouch.campaignId);
            }
            if (fields.firstTouchDate) {
                row.push(data.firstTouch.date.split('T')[0]); // Date only
            }
            if (fields.lastTouchCampaign) {
                row.push(data.lastTouch.campaignId);
            }
            if (fields.lastTouchDate) {
                row.push(data.lastTouch.date.split('T')[0]); // Date only
            }

            rows.push(row.join(','));
        }

        return rows.join('\n');
    }

    /**
     * Get campaign journey statistics
     */
    async getCampaignJourneyStats(contactIds) {
        await this.init();

        const attribution = await this.getFirstLastTouch(contactIds);
        const stats = {
            totalContacts: contactIds.length,
            contactsWithCampaigns: 0,
            contactsWithoutCampaigns: 0,
            averageTouches: 0,
            averageDaysBetweenFirstLast: 0,
            singleTouchContacts: 0,
            multiTouchContacts: 0,
            topFirstTouchCampaigns: {},
            topLastTouchCampaigns: {}
        };

        let totalTouches = 0;
        let totalDays = 0;
        let contactsWithDays = 0;

        for (const [contactId, data] of Object.entries(attribution)) {
            if (data.journeyCount === 0) {
                stats.contactsWithoutCampaigns++;
                continue;
            }

            stats.contactsWithCampaigns++;
            totalTouches += data.journeyCount;

            if (data.journeyCount === 1) {
                stats.singleTouchContacts++;
            } else {
                stats.multiTouchContacts++;
            }

            if (data.daysBetweenFirstLast > 0) {
                totalDays += data.daysBetweenFirstLast;
                contactsWithDays++;
            }

            // Track top campaigns
            const firstCampaign = data.firstTouch.campaignName || 'Unknown';
            const lastCampaign = data.lastTouch.campaignName || 'Unknown';

            stats.topFirstTouchCampaigns[firstCampaign] =
                (stats.topFirstTouchCampaigns[firstCampaign] || 0) + 1;
            stats.topLastTouchCampaigns[lastCampaign] =
                (stats.topLastTouchCampaigns[lastCampaign] || 0) + 1;
        }

        stats.averageTouches = stats.contactsWithCampaigns > 0
            ? (totalTouches / stats.contactsWithCampaigns).toFixed(1)
            : 0;

        stats.averageDaysBetweenFirstLast = contactsWithDays > 0
            ? (totalDays / contactsWithDays).toFixed(1)
            : 0;

        return stats;
    }
}

module.exports = {
    CampaignAttribution
};

// CLI usage
if (require.main === module) {
    (async () => {
        const args = process.argv.slice(2);

        if (args.length < 2) {
            console.log('Usage: campaign-attribution.js <org-alias> <contact-ids...>');
            console.log('');
            console.log('Examples:');
            console.log('  campaign-attribution.js beta-production 003...AAA 003...BBB');
            process.exit(1);
        }

        const orgAlias = args[0];
        const contactIds = args.slice(1);

        const attribution = new CampaignAttribution(orgAlias, { verbose: true });

        console.log(`\n🎯 Campaign Attribution Analysis`);
        console.log(`Org: ${orgAlias}`);
        console.log(`Contacts: ${contactIds.length}\n`);

        const touches = await attribution.getFirstLastTouch(contactIds);

        for (const [contactId, data] of Object.entries(touches)) {
            console.log(`\nContact: ${contactId}`);
            console.log(`  Journey: ${data.journeyCount} touches over ${data.daysBetweenFirstLast} days`);
            if (data.firstTouch) {
                console.log(`  First Touch: ${data.firstTouch.campaignName} (${data.firstTouch.date})`);
                console.log(`  Last Touch: ${data.lastTouch.campaignName} (${data.lastTouch.date})`);
            } else {
                console.log(`  No campaign engagement`);
            }
        }

        console.log('\n');
    })();
}
