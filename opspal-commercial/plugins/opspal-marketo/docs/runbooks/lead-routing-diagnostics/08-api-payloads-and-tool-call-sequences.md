# 08 - API Payloads and Tool Call Sequences

## Canonical Diagnostic Sequence

1. Identity resolution
```javascript
mcp__marketo__lead_query({ filterType: 'email', filterValues: ['user@example.com'] })
```

2. Membership snapshot
```javascript
mcp__marketo__lead_list_membership({ leadId: 12345 })
mcp__marketo__lead_program_membership({ leadId: 12345 })
mcp__marketo__lead_smart_campaign_membership({ leadId: 12345 })
```

3. Timeline reconstruction
```javascript
mcp__marketo__lead_activity_paging_token({ sinceDatetime: '2026-02-01T00:00:00Z' })
mcp__marketo__lead_activities({ leadIds: [12345], nextPageToken: '...' })
mcp__marketo__analytics_lead_changes({ startDate: '2026-02-01T00:00:00Z', leadIds: [12345] })
```

4. Rule correlation
```javascript
mcp__marketo__campaign_get({ campaignId: 678 })
mcp__marketo__campaign_get_smart_list({ campaignId: 678, includeRules: true })
```

5. Loop/race check
```javascript
mcp__marketo__analytics_loop_detector({
  startDate: '2026-02-01T00:00:00Z',
  leadIds: [12345],
  routingFields: ['leadStatus', 'segment', 'sfdcOwnerId']
})
```

## One-Call Composite Diagnostic

```javascript
mcp__marketo__lead_routing_trace({
  filterType: 'email',
  filterValues: ['user@example.com'],
  sinceDatetime: '2026-02-01T00:00:00Z',
  maxActivityPages: 20,
  includeCampaignDetails: true
})
```
