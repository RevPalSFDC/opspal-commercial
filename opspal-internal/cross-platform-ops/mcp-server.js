#!/usr/bin/env node

/**
 * MCP Server for Cross-Platform Operations
 * Provides unified tools for Salesforce-HubSpot data operations
 */

// Install runtime mock guard FIRST
const RuntimeMockGuard = require('../../scripts/lib/runtime-mock-guard.js');
const guard = new RuntimeMockGuard();
guard.install();

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ToolSchema
} = require('@modelcontextprotocol/sdk/types.js');

const SalesforceConnector = require('./core/connectors/salesforce-connector');
const HubSpotConnector = require('./core/connectors/hubspot-connector');
const UnifiedRecord = require('./core/data-models/unified-record');
const FieldMappingEngine = require('./core/data-models/field-mapping');
const DeduplicationEngine = require('./modules/deduplication');
const path = require('path');
const fs = require('fs');

class CrossPlatformMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'cross-platform-ops',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    // Initialize connectors
    this.sfConnector = null;
    this.hsConnector = null;
    this.mappingEngine = new FieldMappingEngine();
    this.dedupeEngine = null;

    // Cache for performance
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes

    this.setupToolHandlers();
  }

  async initialize() {
    // Load configuration
    const configPath = path.join(__dirname, 'config', 'mcp-config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

      if (config.salesforce) {
        this.sfConnector = new SalesforceConnector(config.salesforce);
      }

      if (config.hubspot) {
        this.hsConnector = new HubSpotConnector(config.hubspot);
      }
    }
  }

  setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'xplat_map_records',
          description: 'Map records between Salesforce and HubSpot formats',
          inputSchema: {
            type: 'object',
            properties: {
              source_platform: { type: 'string', enum: ['salesforce', 'hubspot'] },
              target_platform: { type: 'string', enum: ['salesforce', 'hubspot'] },
              object_type: { type: 'string' },
              records: { type: 'array' }
            },
            required: ['source_platform', 'target_platform', 'object_type', 'records']
          }
        },
        {
          name: 'xplat_find_duplicates',
          description: 'Find duplicate records within or across platforms',
          inputSchema: {
            type: 'object',
            properties: {
              mode: { type: 'string', enum: ['single', 'cross'] },
              platform: { type: 'string', enum: ['salesforce', 'hubspot', 'both'] },
              object_type: { type: 'string' },
              threshold: { type: 'number', minimum: 0, maximum: 1 },
              max_records: { type: 'number' }
            },
            required: ['mode', 'object_type']
          }
        },
        {
          name: 'xplat_sync_records',
          description: 'Sync records between Salesforce and HubSpot',
          inputSchema: {
            type: 'object',
            properties: {
              direction: { type: 'string', enum: ['sf_to_hs', 'hs_to_sf', 'bidirectional'] },
              object_type: { type: 'string' },
              record_ids: { type: 'array' },
              conflict_resolution: { type: 'string', enum: ['newer', 'source', 'target', 'manual'] }
            },
            required: ['direction', 'object_type']
          }
        },
        {
          name: 'xplat_analyze_data',
          description: 'Analyze data quality and completeness across platforms',
          inputSchema: {
            type: 'object',
            properties: {
              platform: { type: 'string', enum: ['salesforce', 'hubspot', 'both'] },
              object_type: { type: 'string' },
              metrics: { type: 'array', items: { type: 'string' } }
            },
            required: ['platform', 'object_type']
          }
        },
        {
          name: 'xplat_merge_records',
          description: 'Merge duplicate records with conflict resolution',
          inputSchema: {
            type: 'object',
            properties: {
              platform: { type: 'string', enum: ['salesforce', 'hubspot'] },
              master_id: { type: 'string' },
              duplicate_ids: { type: 'array', items: { type: 'string' } },
              strategy: { type: 'string', enum: ['master', 'newer', 'custom'] }
            },
            required: ['platform', 'master_id', 'duplicate_ids']
          }
        },
        {
          name: 'xplat_field_mapping',
          description: 'Get or update field mappings between platforms',
          inputSchema: {
            type: 'object',
            properties: {
              action: { type: 'string', enum: ['get', 'add', 'update', 'auto_detect'] },
              object_type: { type: 'string' },
              mappings: { type: 'object' }
            },
            required: ['action', 'object_type']
          }
        },
        {
          name: 'xplat_validate_sync',
          description: 'Validate sync configuration and data integrity',
          inputSchema: {
            type: 'object',
            properties: {
              object_type: { type: 'string' },
              sample_size: { type: 'number' },
              check_mappings: { type: 'boolean' },
              check_required: { type: 'boolean' }
            },
            required: ['object_type']
          }
        },
        {
          name: 'xplat_export_report',
          description: 'Generate cross-platform analysis report',
          inputSchema: {
            type: 'object',
            properties: {
              report_type: { type: 'string', enum: ['duplicates', 'sync_status', 'data_quality', 'mapping_coverage'] },
              format: { type: 'string', enum: ['json', 'csv', 'html'] },
              filters: { type: 'object' }
            },
            required: ['report_type']
          }
        }
      ]
    }));

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'xplat_map_records':
            return await this.mapRecords(args);

          case 'xplat_find_duplicates':
            return await this.findDuplicates(args);

          case 'xplat_sync_records':
            return await this.syncRecords(args);

          case 'xplat_analyze_data':
            return await this.analyzeData(args);

          case 'xplat_merge_records':
            return await this.mergeRecords(args);

          case 'xplat_field_mapping':
            return await this.handleFieldMapping(args);

          case 'xplat_validate_sync':
            return await this.validateSync(args);

          case 'xplat_export_report':
            return await this.exportReport(args);

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`
            }
          ]
        };
      }
    });
  }

  /**
   * Tool implementations
   */

  async mapRecords({ source_platform, target_platform, object_type, records }) {
    const direction = `${source_platform}_to_${target_platform}`;
    const results = [];

    for (const record of records) {
      const mapped = this.mappingEngine.mapFields(record, object_type, direction);
      results.push(mapped);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            mapped_count: results.length,
            results: results
          }, null, 2)
        }
      ]
    };
  }

  async findDuplicates({ mode, platform, object_type, threshold = 0.8, max_records = 1000 }) {
    // Initialize dedup engine if needed
    if (!this.dedupeEngine) {
      this.dedupeEngine = new DeduplicationEngine({
        salesforce: this.sfConnector?.config,
        hubspot: this.hsConnector?.config,
        defaultThreshold: threshold
      });
      await this.dedupeEngine.initialize();
    }

    let result;
    if (mode === 'cross') {
      result = await this.dedupeEngine.findCrossPlatformDuplicates(object_type, {
        threshold,
        maxRecords: max_records
      });
    } else {
      result = await this.dedupeEngine.findDuplicates(platform, object_type, {
        threshold,
        maxRecords: max_records
      });
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }

  async syncRecords({ direction, object_type, record_ids, conflict_resolution = 'newer' }) {
    const results = {
      synced: [],
      failed: [],
      conflicts: []
    };

    // Ensure connectors are authenticated
    if (direction.includes('sf') && this.sfConnector && !this.sfConnector.authenticated) {
      await this.sfConnector.authenticate();
    }
    if (direction.includes('hs') && this.hsConnector && !this.hsConnector.authenticated) {
      await this.hsConnector.authenticate();
    }

    try {
      if (direction === 'sf_to_hs') {
        results.details = await this.syncSalesforceToHubSpot(object_type, record_ids, conflict_resolution);
      } else if (direction === 'hs_to_sf') {
        results.details = await this.syncHubSpotToSalesforce(object_type, record_ids, conflict_resolution);
      } else if (direction === 'bidirectional') {
        results.details = await this.syncBidirectional(object_type, record_ids, conflict_resolution);
      }

      results.success = true;
    } catch (error) {
      results.success = false;
      results.error = error.message;
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(results, null, 2)
        }
      ]
    };
  }

  async analyzeData({ platform, object_type, metrics = ['completeness', 'quality', 'duplicates'] }) {
    const analysis = {
      platform,
      object_type,
      metrics: {},
      timestamp: new Date().toISOString()
    };

    // Fetch sample data
    let records = [];
    if (platform === 'salesforce' && this.sfConnector) {
      const result = await this.sfConnector.query(
        `SELECT * FROM ${object_type} LIMIT 100`
      );
      records = result.records.map(r => UnifiedRecord.fromSalesforce(r, object_type));
    } else if (platform === 'hubspot' && this.hsConnector) {
      const result = await this.hsConnector.searchRecords(object_type, {
        limit: 100
      });
      records = result.records.map(r => UnifiedRecord.fromHubSpot(r, object_type));
    }

    // Calculate metrics
    if (metrics.includes('completeness')) {
      analysis.metrics.completeness = this.calculateCompleteness(records);
    }

    if (metrics.includes('quality')) {
      analysis.metrics.quality = this.calculateDataQuality(records);
    }

    if (metrics.includes('duplicates')) {
      analysis.metrics.duplicates = this.calculateDuplicateMetrics(records);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(analysis, null, 2)
        }
      ]
    };
  }

  async mergeRecords({ platform, master_id, duplicate_ids, strategy = 'master' }) {
    let result;

    if (platform === 'salesforce' && this.sfConnector) {
      result = await this.sfConnector.mergeRecords('Contact', master_id, duplicate_ids, {
        strategy
      });
    } else if (platform === 'hubspot' && this.hsConnector) {
      result = await this.hsConnector.mergeRecords('contact', master_id, duplicate_ids, {
        strategy
      });
    } else {
      throw new Error(`Platform ${platform} not configured`);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            result
          }, null, 2)
        }
      ]
    };
  }

  async handleFieldMapping({ action, object_type, mappings }) {
    let result;

    switch (action) {
      case 'get':
        result = this.mappingEngine.getMappingSchema(object_type, 'salesforce_to_hubspot');
        break;

      case 'add':
        for (const [source, target] of Object.entries(mappings)) {
          this.mappingEngine.addCustomMapping(object_type, source, target, 'salesforce_to_hubspot');
        }
        result = { success: true, message: 'Mappings added' };
        break;

      case 'update':
        this.mappingEngine.addCustomMappings(object_type, mappings, 'salesforce_to_hubspot');
        result = { success: true, message: 'Mappings updated' };
        break;

      case 'auto_detect':
        // Fetch field lists from both platforms
        const sfFields = await this.getSalesforceFields(object_type);
        const hsFields = await this.getHubSpotFields(object_type);
        result = this.mappingEngine.autoDetectMappings(sfFields, hsFields);
        break;
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }

  async validateSync({ object_type, sample_size = 10, check_mappings = true, check_required = true }) {
    const validation = {
      object_type,
      timestamp: new Date().toISOString(),
      checks: {},
      warnings: [],
      errors: []
    };

    // Check field mappings
    if (check_mappings) {
      const mappingValidation = this.mappingEngine.validateMapping(
        object_type,
        { LastName: 'Test', Email: 'test@example.com' },
        'salesforce_to_hubspot'
      );
      validation.checks.mappings = mappingValidation;
    }

    // Check required fields
    if (check_required) {
      const sfRequired = this.mappingEngine.getRequiredFields(object_type, 'salesforce_to_hubspot');
      const hsRequired = this.mappingEngine.getRequiredFields(object_type, 'hubspot_to_salesforce');

      validation.checks.required_fields = {
        salesforce: sfRequired,
        hubspot: hsRequired
      };
    }

    // Sample data validation
    if (sample_size > 0) {
      validation.checks.sample_validation = await this.validateSampleData(object_type, sample_size);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(validation, null, 2)
        }
      ]
    };
  }

  async exportReport({ report_type, format = 'json', filters = {} }) {
    let reportData;

    switch (report_type) {
      case 'duplicates':
        reportData = await this.generateDuplicateReport(filters);
        break;

      case 'sync_status':
        reportData = await this.generateSyncStatusReport(filters);
        break;

      case 'data_quality':
        reportData = await this.generateDataQualityReport(filters);
        break;

      case 'mapping_coverage':
        reportData = await this.generateMappingCoverageReport(filters);
        break;

      default:
        throw new Error(`Unknown report type: ${report_type}`);
    }

    // Format report based on requested format
    let formattedReport;
    switch (format) {
      case 'csv':
        formattedReport = this.convertToCSV(reportData);
        break;

      case 'html':
        formattedReport = this.convertToHTML(reportData);
        break;

      default:
        formattedReport = JSON.stringify(reportData, null, 2);
    }

    return {
      content: [
        {
          type: 'text',
          text: formattedReport
        }
      ]
    };
  }

  /**
   * Helper methods
   */

  async syncSalesforceToHubSpot(objectType, recordIds, conflictResolution) {
    const results = [];

    // Fetch Salesforce records
    const sfRecords = await this.sfConnector.query(
      `SELECT * FROM ${objectType} WHERE Id IN ('${recordIds.join("','")}')`
    );

    for (const sfRecord of sfRecords.records) {
      // Convert to unified format
      const unified = UnifiedRecord.fromSalesforce(sfRecord, objectType);

      // Map to HubSpot format
      const hsData = unified.toHubSpot(this.getHubSpotObjectType(objectType));

      // Create or update in HubSpot
      try {
        let result;
        if (hsData.id) {
          result = await this.hsConnector.updateRecords(
            this.getHubSpotObjectType(objectType),
            [hsData]
          );
        } else {
          result = await this.hsConnector.createRecords(
            this.getHubSpotObjectType(objectType),
            [hsData.properties]
          );
        }
        results.push({ success: true, sfId: sfRecord.Id, result });
      } catch (error) {
        results.push({ success: false, sfId: sfRecord.Id, error: error.message });
      }
    }

    return results;
  }

  async syncHubSpotToSalesforce(objectType, recordIds, conflictResolution) {
    const results = [];

    // Fetch HubSpot records
    const hsRecords = await this.hsConnector.searchRecords(
      objectType,
      {
        filterGroups: [{
          filters: [{
            propertyName: 'hs_object_id',
            operator: 'IN',
            values: recordIds
          }]
        }]
      }
    );

    for (const hsRecord of hsRecords.records) {
      // Convert to unified format
      const unified = UnifiedRecord.fromHubSpot(hsRecord, objectType);

      // Map to Salesforce format
      const sfData = unified.toSalesforce(this.getSalesforceObjectType(objectType));

      // Create or update in Salesforce
      try {
        let result;
        if (sfData.Id) {
          result = await this.sfConnector.updateRecords(
            this.getSalesforceObjectType(objectType),
            [sfData]
          );
        } else {
          result = await this.sfConnector.createRecords(
            this.getSalesforceObjectType(objectType),
            [sfData]
          );
        }
        results.push({ success: true, hsId: hsRecord.id, result });
      } catch (error) {
        results.push({ success: false, hsId: hsRecord.id, error: error.message });
      }
    }

    return results;
  }

  async syncBidirectional(objectType, recordIds, conflictResolution) {
    // Implement bidirectional sync logic
    return {
      message: 'Bidirectional sync not yet implemented'
    };
  }

  calculateCompleteness(records) {
    if (!records.length) return 0;

    const scores = records.map(r => {
      r.calculateCompleteness();
      return r.dataQuality.completeness;
    });

    return {
      average: scores.reduce((a, b) => a + b, 0) / scores.length,
      min: Math.min(...scores),
      max: Math.max(...scores),
      distribution: this.getDistribution(scores)
    };
  }

  calculateDataQuality(records) {
    const issues = {
      missingEmail: 0,
      invalidEmail: 0,
      missingPhone: 0,
      invalidPhone: 0,
      duplicateEmails: new Set(),
      shortNames: 0
    };

    const emails = new Map();

    for (const record of records) {
      // Check email
      if (!record.email) {
        issues.missingEmail++;
      } else if (!record.isValidEmail(record.email)) {
        issues.invalidEmail++;
      } else {
        const count = emails.get(record.email) || 0;
        emails.set(record.email, count + 1);
        if (count > 0) {
          issues.duplicateEmails.add(record.email);
        }
      }

      // Check phone
      if (!record.phone) {
        issues.missingPhone++;
      } else if (!record.isValidPhone(record.phone)) {
        issues.invalidPhone++;
      }

      // Check name
      if (record.name && record.name.length < 3) {
        issues.shortNames++;
      }
    }

    return {
      total_records: records.length,
      issues: {
        ...issues,
        duplicateEmails: issues.duplicateEmails.size
      },
      quality_score: this.calculateQualityScore(issues, records.length)
    };
  }

  calculateDuplicateMetrics(records) {
    const emailMap = new Map();
    const phoneMap = new Map();
    const nameMap = new Map();

    for (const record of records) {
      if (record.email) {
        const count = emailMap.get(record.email) || 0;
        emailMap.set(record.email, count + 1);
      }

      if (record.phone) {
        const normalized = record.phone.replace(/\D/g, '');
        const count = phoneMap.get(normalized) || 0;
        phoneMap.set(normalized, count + 1);
      }

      if (record.name) {
        const normalized = record.name.toLowerCase().trim();
        const count = nameMap.get(normalized) || 0;
        nameMap.set(normalized, count + 1);
      }
    }

    return {
      duplicate_emails: Array.from(emailMap.entries()).filter(([_, count]) => count > 1).length,
      duplicate_phones: Array.from(phoneMap.entries()).filter(([_, count]) => count > 1).length,
      duplicate_names: Array.from(nameMap.entries()).filter(([_, count]) => count > 1).length
    };
  }

  getDistribution(values) {
    const buckets = {
      '0-25': 0,
      '26-50': 0,
      '51-75': 0,
      '76-100': 0
    };

    for (const value of values) {
      if (value <= 25) buckets['0-25']++;
      else if (value <= 50) buckets['26-50']++;
      else if (value <= 75) buckets['51-75']++;
      else buckets['76-100']++;
    }

    return buckets;
  }

  calculateQualityScore(issues, totalRecords) {
    if (totalRecords === 0) return 100;

    const weights = {
      missingEmail: 2,
      invalidEmail: 1.5,
      missingPhone: 1,
      invalidPhone: 0.5,
      duplicateEmails: 3,
      shortNames: 0.5
    };

    let totalPenalty = 0;
    for (const [issue, count] of Object.entries(issues)) {
      if (typeof count === 'number') {
        totalPenalty += (count / totalRecords) * (weights[issue] || 1) * 10;
      }
    }

    return Math.max(0, 100 - totalPenalty);
  }

  async getSalesforceFields(objectType) {
    if (this.sfConnector) {
      const metadata = await this.sfConnector.describeObject(objectType);
      return metadata.fields.map(f => f.name);
    }
    return [];
  }

  async getHubSpotFields(objectType) {
    if (this.hsConnector) {
      const schema = await this.hsConnector.describeObject(objectType);
      return schema.properties.map(p => p.name);
    }
    return [];
  }

  getHubSpotObjectType(sfObjectType) {
    const mapping = {
      'Contact': 'contact',
      'Lead': 'contact',
      'Account': 'company',
      'Opportunity': 'deal'
    };
    return mapping[sfObjectType] || sfObjectType.toLowerCase();
  }

  getSalesforceObjectType(hsObjectType) {
    const mapping = {
      'contact': 'Contact',
      'company': 'Account',
      'deal': 'Opportunity'
    };
    return mapping[hsObjectType] || hsObjectType;
  }

  async validateSampleData(objectType, sampleSize) {
    // Implementation for sample data validation
    return {
      validated: sampleSize,
      issues: []
    };
  }

  async generateDuplicateReport(filters) {
    // Implementation for duplicate report
    return {
      generated: new Date().toISOString(),
      type: 'duplicates',
      data: []
    };
  }

  async generateSyncStatusReport(filters) {
    // Implementation for sync status report
    return {
      generated: new Date().toISOString(),
      type: 'sync_status',
      data: []
    };
  }

  async generateDataQualityReport(filters) {
    // Implementation for data quality report
    return {
      generated: new Date().toISOString(),
      type: 'data_quality',
      data: []
    };
  }

  async generateMappingCoverageReport(filters) {
    // Implementation for mapping coverage report
    return {
      generated: new Date().toISOString(),
      type: 'mapping_coverage',
      data: []
    };
  }

  convertToCSV(data) {
    // Simple CSV conversion
    if (Array.isArray(data)) {
      if (data.length === 0) return '';
      const headers = Object.keys(data[0]).join(',');
      const rows = data.map(item => Object.values(item).join(','));
      return [headers, ...rows].join('\n');
    }
    return JSON.stringify(data);
  }

  convertToHTML(data) {
    // Simple HTML conversion
    return `
<!DOCTYPE html>
<html>
<head>
  <title>Cross-Platform Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    pre { background: #f4f4f4; padding: 10px; border-radius: 5px; }
  </style>
</head>
<body>
  <h1>Cross-Platform Data Report</h1>
  <pre>${JSON.stringify(data, null, 2)}</pre>
</body>
</html>`;
  }

  async run() {
    await this.initialize();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    console.error('Cross-Platform MCP Server running...');
  }
}

// Start server if run directly
if (require.main === module) {
  const server = new CrossPlatformMCPServer();
  server.run().catch(console.error);
}

module.exports = CrossPlatformMCPServer;