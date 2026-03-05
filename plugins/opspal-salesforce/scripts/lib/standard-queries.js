#!/usr/bin/env node

/**
 * Standard Query Library
 *
 * Prebuilt, tested SOQL queries for common Salesforce operations.
 * Uses instance-agnostic query builder for field validation.
 *
 * Usage:
 *   const { StandardQueries } = require('./lib/standard-queries');
 *   const queries = new StandardQueries(orgAlias);
 *
 *   const leads = await queries.getConvertedLeadsToday();
 *   const campaigns = await queries.getCampaignMembershipForLeads(leadIds);
 */

const { execSync } = require('child_process');
const { getOrgContext } = require('./org-context-injector');

class StandardQueries {
    constructor(orgAlias = null, options = {}) {
        this.orgAlias = orgAlias;
        this.options = {
            verbose: options.verbose || false,
            maxBuffer: options.maxBuffer || 50 * 1024 * 1024,
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
     * Execute SOQL query
     */
    async execute(query, options = {}) {
        await this.init();

        const useToolingApi = options.useToolingApi || false;
        const toolingFlag = useToolingApi ? '--use-tooling-api' : '';

        try {
            if (this.options.verbose) {
                console.log(`🔍 Executing query: ${query.substring(0, 100)}...`);
            }

            const result = execSync(
                `sf data query --query "${query}" ${toolingFlag} --json --target-org ${this.orgAlias}`,
                {
                    encoding: 'utf8',
                    maxBuffer: this.options.maxBuffer
                }
            );

            const data = JSON.parse(result);
            return data.result?.records || [];
        } catch (error) {
            if (this.options.verbose) {
                console.error(`❌ Query failed: ${error.message}`);
            }
            throw error;
        }
    }

    // ========================================================================
    // LEAD QUERIES
    // ========================================================================

    /**
     * Get leads converted today
     */
    async getConvertedLeadsToday() {
        const query = `SELECT Id, Name, FirstName, LastName, Email, Company,
                             ConvertedDate, ConvertedContactId, ConvertedAccountId,
                             ConvertedOpportunityId, LeadSource, CreatedDate
                      FROM Lead
                      WHERE ConvertedDate = TODAY
                      AND ConvertedContactId != null
                      ORDER BY ConvertedDate DESC`;

        return await this.execute(query);
    }

    /**
     * Get leads converted on specific date
     */
    async getConvertedLeadsByDate(date) {
        const query = `SELECT Id, Name, FirstName, LastName, Email, Company,
                             ConvertedDate, ConvertedContactId, ConvertedAccountId,
                             ConvertedOpportunityId, LeadSource, CreatedDate
                      FROM Lead
                      WHERE ConvertedDate = ${date}
                      AND ConvertedContactId != null
                      ORDER BY ConvertedDate DESC`;

        return await this.execute(query);
    }

    /**
     * Get leads by IDs
     */
    async getLeadsByIds(leadIds) {
        if (!Array.isArray(leadIds) || leadIds.length === 0) return [];

        const query = `SELECT Id, Name, FirstName, LastName, Email, Company,
                             Status, LeadSource, CreatedDate, ConvertedDate,
                             ConvertedContactId, ConvertedAccountId
                      FROM Lead
                      WHERE Id IN ('${leadIds.join("','")}')`;

        return await this.execute(query);
    }

    // ========================================================================
    // CONTACT QUERIES
    // ========================================================================

    /**
     * Get contacts created today
     */
    async getContactsCreatedToday() {
        const query = `SELECT Id, Name, FirstName, LastName, Email, AccountId,
                             LeadId, CreatedDate, LastModifiedDate
                      FROM Contact
                      WHERE CreatedDate = TODAY
                      ORDER BY CreatedDate DESC`;

        return await this.execute(query);
    }

    /**
     * Get contacts created today with Lead IDs
     */
    async getContactsCreatedTodayWithLeads() {
        const query = `SELECT Id, Name, FirstName, LastName, Email, AccountId,
                             LeadId, CreatedDate
                      FROM Contact
                      WHERE CreatedDate = TODAY
                      AND LeadId != null
                      ORDER BY CreatedDate DESC`;

        return await this.execute(query);
    }

    /**
     * Get contacts by IDs
     */
    async getContactsByIds(contactIds) {
        if (!Array.isArray(contactIds) || contactIds.length === 0) return [];

        const query = `SELECT Id, Name, FirstName, LastName, Email, AccountId,
                             LeadId, CreatedDate, LastModifiedDate
                      FROM Contact
                      WHERE Id IN ('${contactIds.join("','")}')`;

        return await this.execute(query);
    }

    // ========================================================================
    // CAMPAIGN MEMBERSHIP QUERIES
    // ========================================================================

    /**
     * Get campaign memberships for leads
     */
    async getCampaignMembershipForLeads(leadIds) {
        if (!Array.isArray(leadIds) || leadIds.length === 0) return [];

        const query = `SELECT LeadId, CampaignId, Campaign.Name, Campaign.Type,
                             Status, CreatedDate, HasResponded
                      FROM CampaignMember
                      WHERE LeadId IN ('${leadIds.join("','")}')
                      ORDER BY LeadId, CreatedDate ASC`;

        return await this.execute(query);
    }

    /**
     * Get campaign memberships for contacts
     */
    async getCampaignMembershipForContacts(contactIds) {
        if (!Array.isArray(contactIds) || contactIds.length === 0) return [];

        const query = `SELECT ContactId, CampaignId, Campaign.Name, Campaign.Type,
                             Status, CreatedDate, HasResponded
                      FROM CampaignMember
                      WHERE ContactId IN ('${contactIds.join("','")}')
                      ORDER BY ContactId, CreatedDate ASC`;

        return await this.execute(query);
    }

    // ========================================================================
    // CAMPAIGN QUERIES
    // ========================================================================

    /**
     * Get active campaigns
     */
    async getActiveCampaigns() {
        const query = `SELECT Id, Name, Type, Status, IsActive,
                             StartDate, EndDate, CreatedDate
                      FROM Campaign
                      WHERE IsActive = true
                      ORDER BY CreatedDate DESC`;

        return await this.execute(query);
    }

    /**
     * Get campaigns created in the past year
     */
    async getCampaignsPastYear() {
        const query = `SELECT Id, Name, Type, Status, IsActive,
                             StartDate, EndDate, CreatedDate,
                             NumberOfContacts, NumberOfLeads, NumberOfResponses
                      FROM Campaign
                      WHERE CreatedDate >= LAST_N_DAYS:365
                      ORDER BY CreatedDate DESC`;

        return await this.execute(query);
    }

    /**
     * Get campaigns with recent member activity
     */
    async getCampaignsWithRecentActivity(days = 365) {
        const query = `SELECT Campaign.Id, Campaign.Name, Campaign.Type, Campaign.Status,
                             COUNT(Id) MemberCount
                      FROM CampaignMember
                      WHERE CreatedDate >= LAST_N_DAYS:${days}
                      GROUP BY Campaign.Id, Campaign.Name, Campaign.Type, Campaign.Status
                      ORDER BY COUNT(Id) DESC`;

        return await this.execute(query);
    }

    // ========================================================================
    // ACCOUNT QUERIES
    // ========================================================================

    /**
     * Get accounts by IDs
     */
    async getAccountsByIds(accountIds) {
        if (!Array.isArray(accountIds) || accountIds.length === 0) return [];

        const query = `SELECT Id, Name, Type, Industry, BillingCity,
                             BillingState, BillingCountry, CreatedDate
                      FROM Account
                      WHERE Id IN ('${accountIds.join("','")}')`;

        return await this.execute(query);
    }

    // ========================================================================
    // OPPORTUNITY QUERIES
    // ========================================================================

    /**
     * Get opportunities by IDs
     */
    async getOpportunitiesByIds(opportunityIds) {
        if (!Array.isArray(opportunityIds) || opportunityIds.length === 0) return [];

        const query = `SELECT Id, Name, StageName, Amount, CloseDate,
                             AccountId, OwnerId, CreatedDate
                      FROM Opportunity
                      WHERE Id IN ('${opportunityIds.join("','")}')`;

        return await this.execute(query);
    }

    // ========================================================================
    // VALIDATION RULE QUERIES
    // ========================================================================

    /**
     * Get active validation rules for an object
     */
    async getActiveValidationRules(objectName) {
        const query = `SELECT Id, ValidationName, Active, ErrorDisplayField,
                             ErrorMessage, CreatedDate, LastModifiedDate,
                             LastModifiedBy.Name
                      FROM ValidationRule
                      WHERE EntityDefinitionId = '${objectName}'
                      AND Active = true
                      ORDER BY ValidationName`;

        return await this.execute(query, { useToolingApi: true });
    }

    /**
     * Get all validation rules for an object (active and inactive)
     */
    async getAllValidationRules(objectName) {
        const query = `SELECT Id, ValidationName, Active, ErrorDisplayField,
                             ErrorMessage, CreatedDate, LastModifiedDate,
                             LastModifiedBy.Name
                      FROM ValidationRule
                      WHERE EntityDefinitionId = '${objectName}'
                      ORDER BY Active DESC, ValidationName`;

        return await this.execute(query, { useToolingApi: true });
    }

    // ========================================================================
    // FLOW QUERIES
    // ========================================================================

    /**
     * Get active flows
     */
    async getActiveFlows() {
        const query = `SELECT Id, Definition.DeveloperName, MasterLabel,
                             ProcessType, TriggerType, VersionNumber,
                             Status, CreatedDate
                      FROM Flow
                      WHERE Status = 'Active'
                      ORDER BY Definition.DeveloperName`;

        return await this.execute(query, { useToolingApi: true });
    }

    /**
     * Get flows for specific object
     */
    async getFlowsForObject(objectName) {
        const query = `SELECT Id, Definition.DeveloperName, MasterLabel,
                             ProcessType, TriggerType, VersionNumber,
                             Status, CreatedDate
                      FROM Flow
                      WHERE ProcessType = 'AutolaunchedFlow'
                      AND MasterLabel LIKE '%${objectName}%'
                      ORDER BY VersionNumber DESC`;

        return await this.execute(query, { useToolingApi: true });
    }

    // ========================================================================
    // HELPER METHODS
    // ========================================================================

    /**
     * Batch query for large datasets
     */
    async batchQuery(baseQuery, recordIds, batchSize = 200) {
        const batches = [];
        for (let i = 0; i < recordIds.length; i += batchSize) {
            batches.push(recordIds.slice(i, i + batchSize));
        }

        const allRecords = [];

        for (const batch of batches) {
            const query = baseQuery.replace('BATCH_IDS', `'${batch.join("'،'")}'`);
            const records = await this.execute(query);
            allRecords.push(...records);
        }

        return allRecords;
    }

    /**
     * Count records matching criteria
     */
    async count(objectName, whereClause = '') {
        const where = whereClause ? `WHERE ${whereClause}` : '';
        const query = `SELECT COUNT() FROM ${objectName} ${where}`;

        try {
            const result = await this.execute(query);
            return result.length > 0 ? result[0].expr0 : 0;
        } catch (error) {
            return 0;
        }
    }
}

// Quick access functions
async function getConvertedLeadsToday(orgAlias) {
    const queries = new StandardQueries(orgAlias);
    return await queries.getConvertedLeadsToday();
}

async function getCampaignMembershipForLeads(leadIds, orgAlias) {
    const queries = new StandardQueries(orgAlias);
    return await queries.getCampaignMembershipForLeads(leadIds);
}

async function getCampaignMembershipForContacts(contactIds, orgAlias) {
    const queries = new StandardQueries(orgAlias);
    return await queries.getCampaignMembershipForContacts(contactIds);
}

module.exports = {
    StandardQueries,
    getConvertedLeadsToday,
    getCampaignMembershipForLeads,
    getCampaignMembershipForContacts
};

// CLI usage
if (require.main === module) {
    (async () => {
        const args = process.argv.slice(2);

        if (args.length < 2) {
            console.log('Usage: standard-queries.js <org-alias> <query-name> [params...]');
            console.log('');
            console.log('Available queries:');
            console.log('  converted-leads-today');
            console.log('  contacts-created-today');
            console.log('  active-campaigns');
            console.log('  campaigns-past-year');
            console.log('  active-validation-rules <object-name>');
            console.log('  active-flows');
            console.log('');
            console.log('Examples:');
            console.log('  standard-queries.js beta-production converted-leads-today');
            console.log('  standard-queries.js beta-production active-validation-rules Contact');
            process.exit(1);
        }

        const orgAlias = args[0];
        const queryName = args[1];

        const queries = new StandardQueries(orgAlias, { verbose: true });

        let results;

        switch (queryName) {
            case 'converted-leads-today':
                results = await queries.getConvertedLeadsToday();
                break;
            case 'contacts-created-today':
                results = await queries.getContactsCreatedToday();
                break;
            case 'active-campaigns':
                results = await queries.getActiveCampaigns();
                break;
            case 'campaigns-past-year':
                results = await queries.getCampaignsPastYear();
                break;
            case 'active-validation-rules':
                if (!args[2]) {
                    console.error('Error: Object name required');
                    process.exit(1);
                }
                results = await queries.getActiveValidationRules(args[2]);
                break;
            case 'active-flows':
                results = await queries.getActiveFlows();
                break;
            default:
                console.error(`Unknown query: ${queryName}`);
                process.exit(1);
        }

        console.log(`\n📊 Results: ${results.length} records\n`);
        console.log(JSON.stringify(results, null, 2));
    })();
}
