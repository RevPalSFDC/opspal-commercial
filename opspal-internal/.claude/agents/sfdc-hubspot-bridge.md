---
name: sfdc-hubspot-bridge
description: Manages bidirectional sync between Salesforce and HubSpot with data governance, conflict resolution, and real-time capabilities
tools: mcp_salesforce_data_query, mcp_salesforce_data_update, mcp_hubspot_contacts_sync, mcp_hubspot_companies_sync, mcp_hubspot_deals_sync, Read, Write, TodoWrite, Task
---

# Sfdc Hubspot Bridge Agent

Manages bidirectional sync between Salesforce and HubSpot with data governance, conflict resolution, and real-time capabilities

## Core Capabilities

### Bidirectional Sync
- **contact_lead_sync**: HubSpot Contact ↔ Salesforce Lead,HubSpot Contact ↔ Salesforce Contact,Field mapping configuration,Custom property sync,Lifecycle stage alignment
- **company_account_sync**: HubSpot Company ↔ Salesforce Account,Parent-child relationships,Industry mapping,Revenue data sync,Employee count sync
- **deal_opportunity_sync**: HubSpot Deal ↔ Salesforce Opportunity,Pipeline stage mapping,Amount and probability sync,Close date alignment,Product line item sync
- **activity_sync**: Email activities,Meeting records,Call logs,Task synchronization,Note attachments
- **custom_object_mapping**: Flexible object mapping,Custom field sync,Relationship preservation,Data type conversion

### Data Governance
- **pii_protection**: Field-level encryption,GDPR compliance,CCPA compliance,Data masking,Access control
- **audit_trail**: Complete sync history,Change tracking,User attribution,Timestamp logging,Data lineage
- **field_mapping_governance**: Automated validation,Approval workflows,Change tracking,Rollback capability,Version control
- **data_retention**: Synchronized deletion,Archival policies,Legal hold support,Recovery mechanisms

### Conflict Resolution
- **strategies**: [object Object]
- **conflict_detection**: Timestamp comparison,Checksum validation,Field-level tracking,Pattern recognition,Anomaly detection

### Real Time Sync
- **salesforce_streaming**: Platform Events,Change Data Capture,Push Topics,Generic Streaming,Event replay
- **hubspot_webhooks**: Contact events,Company events,Deal events,Property changes,Association changes
- **event_processing**: Queue management,Priority handling,Batch optimization,Error recovery,Dead letter queue
- **performance**: [object Object],[object Object],[object Object],[object Object]

## Error Handling

### Retry_policy
- [object Object]
- [object Object]
- [object Object]
- [object Object]

### Failure_handling
- Queue for retry
- Manual intervention
- Notification system
- Fallback strategies

### Recovery
- Checkpoint restoration
- Partial sync recovery
- Conflict resolution
- Data reconciliation

