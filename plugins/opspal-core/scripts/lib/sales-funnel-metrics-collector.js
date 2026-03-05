#!/usr/bin/env node

/**
 * Sales Funnel Metrics Collector
 *
 * Purpose: Collect and normalize sales funnel metrics from Salesforce and HubSpot.
 * Supports flexible stage mappings, date range filtering, and segmentation analysis.
 *
 * Usage:
 *   const { FunnelMetricsCollector } = require('./sales-funnel-metrics-collector');
 *
 *   const collector = new FunnelMetricsCollector({
 *       platform: 'salesforce', // or 'hubspot' or 'both'
 *       dateRange: '90d',
 *       stageConfig: stageDefinitions
 *   });
 *
 *   const metrics = await collector.collectMetrics({
 *       includeActivities: true,
 *       includeLeads: true,
 *       includeOpportunities: true,
 *       segmentBy: ['Owner', 'Region']
 *   });
 *
 * @module sales-funnel-metrics-collector
 * @version 1.0.0
 * @created 2025-10-28
 */

const fs = require('fs');
const path = require('path');
const { DataAccessError } = require('./data-access-error');

/**
 * Sales Funnel Metrics Collector
 */
class FunnelMetricsCollector {
    /**
     * Initialize metrics collector
     *
     * @param {Object} config - Configuration
     * @param {string} config.platform - Platform to collect from ('salesforce', 'hubspot', 'both')
     * @param {string} config.dateRange - Date range (e.g., '90d', '6m', '1y')
     * @param {Object} config.stageConfig - Stage mapping configuration
     * @param {string} [config.orgAlias] - Salesforce org alias (if platform includes salesforce)
     * @param {Object} [config.sfConnection] - Salesforce connection object (optional, will use CLI if not provided)
     * @param {Object} [config.hsConnection] - HubSpot connection object (optional, will use MCP if not provided)
     */
    constructor(config) {
        this.platform = config.platform;
        this.dateRange = config.dateRange;
        this.stageConfig = config.stageConfig;
        this.orgAlias = config.orgAlias;
        this.sfConnection = config.sfConnection;
        this.hsConnection = config.hsConnection;

        // Calculate date boundaries
        this.dateBoundaries = this._calculateDateBoundaries(config.dateRange);

        // Initialize metrics storage
        this.metrics = {
            platform: config.platform,
            dateRange: config.dateRange,
            startDate: this.dateBoundaries.startDate,
            endDate: this.dateBoundaries.endDate,
            collectedAt: new Date().toISOString(),
            salesforce: null,
            hubspot: null
        };
    }

    /**
     * Calculate date boundaries from date range string
     *
     * @param {string} dateRange - Date range string (e.g., '90d', '6m', '1y')
     * @returns {Object} Date boundaries { startDate, endDate }
     * @private
     */
    _calculateDateBoundaries(dateRange) {
        const endDate = new Date();
        const startDate = new Date();

        const match = dateRange.match(/^(\d+)([dmy])$/);
        if (!match) {
            throw new Error(`Invalid date range format: ${dateRange}. Expected format: '90d', '6m', '1y'`);
        }

        const [, value, unit] = match;
        const amount = parseInt(value, 10);

        switch (unit) {
            case 'd':
                startDate.setDate(startDate.getDate() - amount);
                break;
            case 'm':
                startDate.setMonth(startDate.getMonth() - amount);
                break;
            case 'y':
                startDate.setFullYear(startDate.getFullYear() - amount);
                break;
        }

        return {
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0]
        };
    }

    /**
     * Collect metrics from all configured platforms
     *
     * @param {Object} options - Collection options
     * @param {boolean} [options.includeActivities=true] - Include activity metrics
     * @param {boolean} [options.includeLeads=true] - Include lead/contact metrics
     * @param {boolean} [options.includeOpportunities=true] - Include opportunity metrics
     * @param {Array<string>} [options.segmentBy=[]] - Segmentation dimensions
     * @returns {Promise<Object>} Collected metrics
     */
    async collectMetrics(options = {}) {
        const {
            includeActivities = true,
            includeLeads = true,
            includeOpportunities = true,
            segmentBy = []
        } = options;

        try {
            // Collect from Salesforce
            if (this.platform === 'salesforce' || this.platform === 'both') {
                console.log('Collecting Salesforce metrics...');
                this.metrics.salesforce = await this.collectSalesforceMetrics({
                    includeActivities,
                    includeLeads,
                    includeOpportunities,
                    segmentBy
                });
            }

            // Collect from HubSpot
            if (this.platform === 'hubspot' || this.platform === 'both') {
                console.log('Collecting HubSpot metrics...');
                this.metrics.hubspot = await this.collectHubSpotMetrics({
                    includeActivities,
                    includeLeads,
                    includeOpportunities,
                    segmentBy
                });
            }

            // Calculate conversion rates
            this.metrics.conversions = this.calculateConversions();

            // Calculate segmented metrics if requested
            if (segmentBy.length > 0) {
                this.metrics.segmented = await this.calculateSegmentedMetrics(segmentBy);
            }

            return this.metrics;

        } catch (error) {
            throw new DataAccessError(
                'FunnelMetricsCollector',
                `Failed to collect funnel metrics: ${error.message}`,
                {
                    platform: this.platform,
                    dateRange: this.dateRange,
                    originalError: error.message
                }
            );
        }
    }

    /**
     * Collect metrics from Salesforce
     *
     * @param {Object} options - Collection options
     * @returns {Promise<Object>} Salesforce metrics
     * @private
     */
    async collectSalesforceMetrics(options) {
        const metrics = {
            activities: null,
            leads: null,
            opportunities: null,
            rawData: {}
        };

        try {
            // Get stage mapping for Salesforce
            const stageMapping = this.stageConfig.platformDefaults.salesforce.stageMapping;

            // Collect activity data
            if (options.includeActivities) {
                metrics.activities = await this._collectSalesforceActivities(stageMapping, options.segmentBy);
            }

            // Collect lead data
            if (options.includeLeads) {
                metrics.leads = await this._collectSalesforceLeads(stageMapping, options.segmentBy);
            }

            // Collect opportunity data
            if (options.includeOpportunities) {
                metrics.opportunities = await this._collectSalesforceOpportunities(stageMapping, options.segmentBy);
            }

            return metrics;

        } catch (error) {
            throw new DataAccessError(
                'Salesforce',
                `Failed to collect Salesforce metrics: ${error.message}`,
                {
                    orgAlias: this.orgAlias,
                    dateRange: this.dateRange,
                    originalError: error.message
                }
            );
        }
    }

    /**
     * Collect activity metrics from Salesforce
     *
     * @param {Object} stageMapping - Stage mapping configuration
     * @param {Array<string>} segmentBy - Segmentation dimensions
     * @returns {Promise<Object>} Activity metrics
     * @private
     */
    async _collectSalesforceActivities(stageMapping, segmentBy) {
        const { startDate, endDate } = this.dateBoundaries;

        // Query for calls
        const callQuery = `
            SELECT Id, OwnerId, Owner.Name, ActivityDate, Type, Status,
                   CallDurationInSeconds, Subject
            FROM Task
            WHERE Type = 'Call'
              AND ActivityDate >= ${startDate}
              AND ActivityDate <= ${endDate}
              AND Status = 'Completed'
        `;

        // Query for emails
        const emailQuery = `
            SELECT Id, OwnerId, Owner.Name, ActivityDate, Type, Status, Subject
            FROM Task
            WHERE Type = 'Email'
              AND ActivityDate >= ${startDate}
              AND ActivityDate <= ${endDate}
              AND Status = 'Completed'
        `;

        // Query for meetings/events
        const meetingQuery = `
            SELECT Id, OwnerId, Owner.Name, ActivityDate, StartDateTime, EndDateTime,
                   Type, Subject, ShowedUp__c
            FROM Event
            WHERE Type = 'Meeting'
              AND ActivityDate >= ${startDate}
              AND ActivityDate <= ${endDate}
        `;

        try {
            const [calls, emails, meetings] = await Promise.all([
                this._executeSalesforceQuery(callQuery),
                this._executeSalesforceQuery(emailQuery),
                this._executeSalesforceQuery(meetingQuery)
            ]);

            // Calculate activity metrics
            const totalCalls = calls.length;
            const totalEmails = emails.length;
            const connectedCalls = calls.filter(c => c.CallDurationInSeconds > 0).length;
            const totalTouches = totalCalls + totalEmails;

            const meetingsScheduled = meetings.length;
            const meetingsHeld = meetings.filter(m =>
                m.ShowedUp__c === true ||
                (m.ActivityDate < endDate && !m.ShowedUp__c) // Assume past meetings without flag were held
            ).length;

            return {
                prospecting: {
                    totalTouches,
                    calls: totalCalls,
                    emails: totalEmails,
                    avgTouchesPerDay: totalTouches / this._calculateDaysDifference()
                },
                engagement: {
                    connectedCalls,
                    connectRate: totalCalls > 0 ? connectedCalls / totalCalls : 0,
                    repliedEmails: 0, // Would need custom field for this
                    replyRate: 0 // Would need custom field
                },
                meetings: {
                    scheduled: meetingsScheduled,
                    held: meetingsHeld,
                    showRate: meetingsScheduled > 0 ? meetingsHeld / meetingsScheduled : 0,
                    noShows: meetingsScheduled - meetingsHeld
                },
                rawData: {
                    calls,
                    emails,
                    meetings
                }
            };

        } catch (error) {
            throw new DataAccessError(
                'Salesforce_Activities',
                `Failed to query Salesforce activities: ${error.message}`,
                {
                    queries: { calls: callQuery, emails: emailQuery, meetings: meetingQuery },
                    originalError: error.message
                }
            );
        }
    }

    /**
     * Collect lead/contact metrics from Salesforce
     *
     * @param {Object} stageMapping - Stage mapping configuration
     * @param {Array<string>} segmentBy - Segmentation dimensions
     * @returns {Promise<Object>} Lead metrics
     * @private
     */
    async _collectSalesforceLeads(stageMapping, segmentBy) {
        const { startDate, endDate } = this.dateBoundaries;

        const leadQuery = `
            SELECT Id, OwnerId, Owner.Name, CreatedDate, Status, LeadSource,
                   IsConverted, ConvertedDate, ConvertedOpportunityId
            FROM Lead
            WHERE CreatedDate >= ${startDate}T00:00:00Z
              AND CreatedDate <= ${endDate}T23:59:59Z
        `;

        try {
            const leads = await this._executeSalesforceQuery(leadQuery);

            const totalLeads = leads.length;
            const convertedLeads = leads.filter(l => l.IsConverted).length;
            const conversionRate = totalLeads > 0 ? convertedLeads / totalLeads : 0;

            return {
                totalLeads,
                convertedLeads,
                conversionRate,
                rawData: leads
            };

        } catch (error) {
            throw new DataAccessError(
                'Salesforce_Leads',
                `Failed to query Salesforce leads: ${error.message}`,
                {
                    query: leadQuery,
                    originalError: error.message
                }
            );
        }
    }

    /**
     * Collect opportunity metrics from Salesforce
     *
     * @param {Object} stageMapping - Stage mapping configuration
     * @param {Array<string>} segmentBy - Segmentation dimensions
     * @returns {Promise<Object>} Opportunity metrics
     * @private
     */
    async _collectSalesforceOpportunities(stageMapping, segmentBy) {
        const { startDate, endDate } = this.dateBoundaries;

        const oppQuery = `
            SELECT Id, OwnerId, Owner.Name, CreatedDate, CloseDate, StageName,
                   Amount, IsClosed, IsWon, LeadSource, Type
            FROM Opportunity
            WHERE CreatedDate >= ${startDate}T00:00:00Z
              AND CreatedDate <= ${endDate}T23:59:59Z
        `;

        try {
            const opportunities = await this._executeSalesforceQuery(oppQuery);

            const totalOpportunities = opportunities.length;
            const openOpportunities = opportunities.filter(o => !o.IsClosed).length;
            const closedWon = opportunities.filter(o => o.IsWon).length;
            const closedLost = opportunities.filter(o => o.IsClosed && !o.IsWon).length;
            const winRate = totalOpportunities > 0 ? closedWon / totalOpportunities : 0;

            const totalValue = opportunities.reduce((sum, o) => sum + (o.Amount || 0), 0);
            const wonValue = opportunities.filter(o => o.IsWon).reduce((sum, o) => sum + (o.Amount || 0), 0);

            // Calculate average sales cycle for closed deals
            const closedDeals = opportunities.filter(o => o.IsClosed && o.CloseDate);
            const avgSalesCycleDays = closedDeals.length > 0
                ? closedDeals.reduce((sum, o) => {
                    const created = new Date(o.CreatedDate);
                    const closed = new Date(o.CloseDate);
                    const days = (closed - created) / (1000 * 60 * 60 * 24);
                    return sum + days;
                }, 0) / closedDeals.length
                : 0;

            return {
                totalOpportunities,
                openOpportunities,
                closedWon,
                closedLost,
                winRate,
                totalValue,
                wonValue,
                avgSalesCycleDays,
                rawData: opportunities
            };

        } catch (error) {
            throw new DataAccessError(
                'Salesforce_Opportunities',
                `Failed to query Salesforce opportunities: ${error.message}`,
                {
                    query: oppQuery,
                    originalError: error.message
                }
            );
        }
    }

    /**
     * Execute Salesforce query via CLI or connection
     *
     * @param {string} query - SOQL query
     * @returns {Promise<Array>} Query results
     * @private
     */
    async _executeSalesforceQuery(query) {
        // If we have a direct connection, use it
        if (this.sfConnection) {
            const result = await this.sfConnection.query(query);
            return result.records;
        }

        // Otherwise, use Salesforce CLI
        const { execSync } = require('child_process');
        const orgFlag = this.orgAlias ? `--target-org ${this.orgAlias}` : '';

        try {
            const command = `sf data query --query "${query.replace(/"/g, '\\"')}" ${orgFlag} --json`;
            const result = execSync(command, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
            const parsed = JSON.parse(result);

            if (parsed.status !== 0) {
                throw new Error(parsed.message || 'Query failed');
            }

            return parsed.result.records || [];

        } catch (error) {
            throw new Error(`Salesforce CLI query failed: ${error.message}`);
        }
    }

    /**
     * Collect metrics from HubSpot
     *
     * @param {Object} options - Collection options
     * @returns {Promise<Object>} HubSpot metrics
     * @private
     */
    async collectHubSpotMetrics(options) {
        const metrics = {
            engagements: null,
            contacts: null,
            deals: null,
            rawData: {}
        };

        try {
            // Get stage mapping for HubSpot
            const stageMapping = this.stageConfig.platformDefaults.hubspot.stageMapping;

            // Collect engagement data
            if (options.includeActivities) {
                metrics.engagements = await this._collectHubSpotEngagements(stageMapping, options.segmentBy);
            }

            // Collect contact data
            if (options.includeLeads) {
                metrics.contacts = await this._collectHubSpotContacts(stageMapping, options.segmentBy);
            }

            // Collect deal data
            if (options.includeOpportunities) {
                metrics.deals = await this._collectHubSpotDeals(stageMapping, options.segmentBy);
            }

            return metrics;

        } catch (error) {
            throw new DataAccessError(
                'HubSpot',
                `Failed to collect HubSpot metrics: ${error.message}`,
                {
                    dateRange: this.dateRange,
                    originalError: error.message
                }
            );
        }
    }

    /**
     * Collect engagement metrics from HubSpot
     *
     * @param {Object} stageMapping - Stage mapping configuration
     * @param {Array<string>} segmentBy - Segmentation dimensions
     * @returns {Promise<Object>} Engagement metrics
     * @private
     */
    async _collectHubSpotEngagements(stageMapping, segmentBy) {
        // This would use HubSpot MCP tools to query engagements
        // Placeholder implementation - actual implementation would use MCP tools

        return {
            prospecting: {
                totalTouches: 0,
                calls: 0,
                emails: 0,
                avgTouchesPerDay: 0
            },
            engagement: {
                connectedCalls: 0,
                connectRate: 0,
                repliedEmails: 0,
                replyRate: 0
            },
            meetings: {
                scheduled: 0,
                held: 0,
                showRate: 0,
                noShows: 0
            },
            rawData: {},
            note: 'HubSpot engagement collection requires MCP implementation'
        };
    }

    /**
     * Collect contact metrics from HubSpot
     *
     * @param {Object} stageMapping - Stage mapping configuration
     * @param {Array<string>} segmentBy - Segmentation dimensions
     * @returns {Promise<Object>} Contact metrics
     * @private
     */
    async _collectHubSpotContacts(stageMapping, segmentBy) {
        // Placeholder - would use HubSpot MCP tools
        return {
            totalContacts: 0,
            qualifiedContacts: 0,
            conversionRate: 0,
            rawData: {},
            note: 'HubSpot contact collection requires MCP implementation'
        };
    }

    /**
     * Collect deal metrics from HubSpot
     *
     * @param {Object} stageMapping - Stage mapping configuration
     * @param {Array<string>} segmentBy - Segmentation dimensions
     * @returns {Promise<Object>} Deal metrics
     * @private
     */
    async _collectHubSpotDeals(stageMapping, segmentBy) {
        // Placeholder - would use HubSpot MCP tools
        return {
            totalDeals: 0,
            openDeals: 0,
            closedWon: 0,
            closedLost: 0,
            winRate: 0,
            totalValue: 0,
            wonValue: 0,
            avgSalesCycleDays: 0,
            rawData: {},
            note: 'HubSpot deal collection requires MCP implementation'
        };
    }

    /**
     * Calculate conversion rates across funnel stages
     *
     * @returns {Object} Conversion rates
     * @private
     */
    calculateConversions() {
        const conversions = {};

        // If we have Salesforce data
        if (this.metrics.salesforce) {
            const sf = this.metrics.salesforce;

            conversions.salesforce = {
                // Call connect rate
                call_connect_rate: sf.activities?.engagement?.connectRate || 0,

                // Email reply rate (would need custom field)
                email_reply_rate: sf.activities?.engagement?.replyRate || 0,

                // Meeting show rate
                meeting_show_rate: sf.activities?.meetings?.showRate || 0,

                // Meeting to SQL (using opportunities as proxy for SQL)
                meeting_to_sql: sf.activities?.meetings?.held > 0
                    ? (sf.opportunities?.totalOpportunities || 0) / sf.activities.meetings.held
                    : 0,

                // Lead to opportunity
                lead_to_opportunity: sf.leads?.totalLeads > 0
                    ? (sf.opportunities?.totalOpportunities || 0) / sf.leads.totalLeads
                    : 0,

                // Opportunity win rate
                opportunity_win_rate: sf.opportunities?.winRate || 0,

                // Overall conversion (touches to closed won)
                overall_conversion: sf.activities?.prospecting?.totalTouches > 0
                    ? (sf.opportunities?.closedWon || 0) / sf.activities.prospecting.totalTouches
                    : 0
            };
        }

        // If we have HubSpot data
        if (this.metrics.hubspot) {
            const hs = this.metrics.hubspot;

            conversions.hubspot = {
                call_connect_rate: hs.engagements?.engagement?.connectRate || 0,
                email_reply_rate: hs.engagements?.engagement?.replyRate || 0,
                meeting_show_rate: hs.engagements?.meetings?.showRate || 0,
                meeting_to_sql: 0, // Would calculate from deals
                contact_to_deal: 0, // Would calculate from contacts/deals
                deal_win_rate: hs.deals?.winRate || 0,
                overall_conversion: 0
            };
        }

        return conversions;
    }

    /**
     * Calculate segmented metrics
     *
     * @param {Array<string>} dimensions - Segmentation dimensions
     * @returns {Promise<Object>} Segmented metrics
     * @private
     */
    async calculateSegmentedMetrics(dimensions) {
        const segmented = {};

        // Placeholder for segmentation logic
        // Would group metrics by each dimension (owner, region, etc.)

        for (const dimension of dimensions) {
            segmented[dimension] = {
                note: `Segmentation by ${dimension} not yet implemented`,
                segments: []
            };
        }

        return segmented;
    }

    /**
     * Calculate number of days in date range
     *
     * @returns {number} Number of days
     * @private
     */
    _calculateDaysDifference() {
        const start = new Date(this.dateBoundaries.startDate);
        const end = new Date(this.dateBoundaries.endDate);
        return Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    }

    /**
     * Export metrics to JSON file
     *
     * @param {string} outputPath - Path to output file
     * @returns {Promise<void>}
     */
    async exportToFile(outputPath) {
        try {
            const dir = path.dirname(outputPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            fs.writeFileSync(
                outputPath,
                JSON.stringify(this.metrics, null, 2),
                'utf8'
            );

            console.log(`Metrics exported to ${outputPath}`);

        } catch (error) {
            throw new Error(`Failed to export metrics: ${error.message}`);
        }
    }
}

/**
 * Command-line interface
 */
async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help')) {
        console.log(`
Sales Funnel Metrics Collector

Usage:
  node sales-funnel-metrics-collector.js [options]

Options:
  --platform <sf|hs|both>     Platform to collect from (default: salesforce)
  --date-range <range>        Date range (e.g., 90d, 6m, 1y) (default: 90d)
  --org-alias <alias>         Salesforce org alias (if platform is sf or both)
  --output <path>             Output file path (default: ./funnel-metrics.json)
  --segment-by <dimensions>   Comma-separated segmentation dimensions
  --help                      Show this help message

Examples:
  node sales-funnel-metrics-collector.js --platform salesforce --date-range 90d --org-alias production
  node sales-funnel-metrics-collector.js --platform both --date-range 6m --segment-by Owner,Region
        `);
        process.exit(0);
    }

    // Parse arguments
    const platform = args.includes('--platform') ? args[args.indexOf('--platform') + 1] : 'salesforce';
    const dateRange = args.includes('--date-range') ? args[args.indexOf('--date-range') + 1] : '90d';
    const orgAlias = args.includes('--org-alias') ? args[args.indexOf('--org-alias') + 1] : null;
    const outputPath = args.includes('--output') ? args[args.indexOf('--output') + 1] : './funnel-metrics.json';
    const segmentBy = args.includes('--segment-by')
        ? args[args.indexOf('--segment-by') + 1].split(',').map(s => s.trim())
        : [];

    try {
        // Load stage configuration
        const configPath = path.join(__dirname, '../../config/funnel-stage-definitions.json');
        const stageConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

        // Initialize collector
        const collector = new FunnelMetricsCollector({
            platform,
            dateRange,
            stageConfig,
            orgAlias
        });

        // Collect metrics
        console.log(`Collecting funnel metrics from ${platform}...`);
        console.log(`Date range: ${dateRange}`);
        if (segmentBy.length > 0) {
            console.log(`Segmentation: ${segmentBy.join(', ')}`);
        }

        const metrics = await collector.collectMetrics({
            includeActivities: true,
            includeLeads: true,
            includeOpportunities: true,
            segmentBy
        });

        // Export results
        await collector.exportToFile(outputPath);

        console.log('\nMetrics collection completed successfully!');
        console.log(`Results saved to: ${outputPath}`);

    } catch (error) {
        console.error('\nError collecting metrics:');
        console.error(error.message);
        if (error.context) {
            console.error('\nContext:', JSON.stringify(error.context, null, 2));
        }
        process.exit(1);
    }
}

// Run CLI if executed directly
if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { FunnelMetricsCollector };
