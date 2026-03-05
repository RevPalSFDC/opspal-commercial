# Program-to-SFDC Campaign Sync Runbook

## Purpose

Complete operational procedures for configuring and managing Marketo program to Salesforce campaign synchronization for attribution and reporting.

## Overview

Program-to-campaign sync links a Marketo program with a Salesforce campaign, enabling:
- Unified membership tracking
- Revenue attribution
- Multi-touch campaign reporting
- Cross-system visibility

### Sync Types

| Type | Direction | Use Case |
|------|-----------|----------|
| **Bidirectional** | Marketo ↔ SFDC | Full sync, shared membership |
| **Marketo to SFDC** | Marketo → SFDC | Marketing source of truth |
| **SFDC to Marketo** | SFDC → Marketo | Sales-added members |

---

## Phase 1: Pre-Sync Planning

### 1.1 Sync Strategy Decision

Determine sync approach:

- [ ] **Program Type**
  - Event/Webinar: Bidirectional (registrations from both)
  - Email Campaign: Marketo → SFDC (marketing only)
  - Tradeshow: Bidirectional (sales adds booth leads)
  - Content: Marketo → SFDC (marketing only)

- [ ] **Sync Direction**
  - [ ] Bidirectional
  - [ ] Marketo to SFDC only
  - [ ] SFDC to Marketo only

- [ ] **Sync Timing**
  - Create SFDC campaign first
  - Link after program creation
  - Or auto-create via sync

### 1.2 Status Mapping Design

Map Marketo program statuses to SFDC campaign member statuses:

| Marketo Status | SFDC Status | Responded? |
|----------------|-------------|------------|
| Not in Program | (no sync) | - |
| Invited | Sent | No |
| Registered | Responded | Yes |
| Attended | Attended | Yes |
| No Show | No Show | No |

**Important:** SFDC campaign member statuses have 40-character limit.

### 1.3 Prerequisites Check

- [ ] **Marketo Sync User**
  - Active in SFDC
  - Has "Marketing User" flag
  - Can create campaign members

- [ ] **SFDC Campaign**
  - Exists or will be created
  - Has matching member statuses
  - Parent campaign set (if applicable)

- [ ] **Field Mappings**
  - Lead/Contact fields mapped
  - No blocking sync errors

---

## Phase 2: SFDC Campaign Setup

### 2.1 Create SFDC Campaign

If campaign doesn't exist:

1. Salesforce > Campaigns > New
2. Configure:
   - Name: Match Marketo program name
   - Type: Event, Email, Webinar, etc.
   - Status: Planned → In Progress
   - Parent Campaign (optional)
   - Expected Revenue (optional)

### 2.2 Configure Campaign Member Statuses

Customize member statuses to match Marketo:

1. Campaign > Advanced Setup > Edit Member Statuses
2. Add/modify statuses:

| Status | Default | Responded |
|--------|---------|-----------|
| Sent | Yes | No |
| Responded | No | Yes |
| Attended | No | Yes |
| No Show | No | No |

**Best Practice:** Create statuses in SFDC BEFORE setting up sync.

### 2.3 Record Campaign ID

Note the SFDC Campaign ID for linking:
- Format: `7014x00000XXXXXXX`
- Campaign ID: ________________

---

## Phase 3: Program Sync Configuration

### 3.1 Link Program to Campaign

In Marketo:

1. Navigate to program > Setup tab
2. Find "Salesforce Campaign Sync" section
3. Click "Not Set" to configure

Or use wizard:
```
/sync-program-to-sfdc --program=[ID] --campaign=[SFDC_ID]
```

### 3.2 Select Campaign

Options:
- **Link to Existing**: Select SFDC campaign by name/ID
- **Create New**: Auto-create matching SFDC campaign
- **None**: No sync (can configure later)

If creating new:
- Campaign name = Program name
- Type = Channel-based default
- Status = In Progress

### 3.3 Configure Status Mapping

Map each Marketo status to SFDC status:

```
Marketo Status          →    SFDC Campaign Member Status
───────────────────────────────────────────────────────
Not in Program          →    (do not sync)
Invited                 →    Sent
Registered              →    Responded ✓
Attended                →    Attended ✓
No Show                 →    No Show
Attended On-Demand      →    Attended On-Demand ✓
```

**Responded Checkbox:** Check if status indicates success/engagement.

### 3.4 Configure Sync Direction

Select sync behavior:

| Option | Behavior |
|--------|----------|
| **Both (default)** | Changes sync both ways |
| **Marketo to Salesforce** | Marketo is source of truth |
| **Salesforce to Marketo** | SFDC is source of truth |

**Recommendation:** Use "Both" unless specific reason not to.

### 3.5 Save Configuration

Click "Save" to activate sync.

Immediate actions:
- Existing members sync to SFDC (may take minutes)
- Future status changes sync automatically
- New SFDC members sync to Marketo (if bidirectional)

---

## Phase 4: Member Management

### 4.1 Initial Member Sync

When sync is first enabled:

1. **Marketo → SFDC:**
   - All existing program members sync
   - Status mapped per configuration
   - New campaign members created in SFDC

2. **Volume Considerations:**
   - Large programs may take time
   - API limits apply
   - Monitor sync queue

### 4.2 Ongoing Member Updates

**When Marketo status changes:**
1. Program status update triggers
2. Sync job queues the change
3. SFDC campaign member status updates
4. Typically within 5-15 minutes

**When SFDC status changes (if bidirectional):**
1. Salesforce sync picks up change
2. Marketo program status updates
3. May trigger additional Marketo flows

### 4.3 New Lead Creation

Configure what happens when member has no SFDC record:

| Setting | Behavior |
|---------|----------|
| **Create as Lead** | New SFDC Lead created |
| **Create as Contact** | Requires Account match |
| **Do Not Create** | Member not synced until SFDC record exists |

Configure in Admin > Salesforce > Sync Settings.

---

## Phase 5: Validation & Testing

### 5.1 Pre-Sync Validation

Run validation before enabling sync:

```
/marketo-preflight sync --program=[ID] --campaign=[SFDC_ID]
```

Checks:
- [ ] SFDC campaign accessible
- [ ] Status mapping complete
- [ ] No status mismatches
- [ ] User has permissions
- [ ] No circular sync risk

### 5.2 Test Sync

With a test lead:

1. **Add test lead to Marketo program**
   - Change program status to "Registered"
   - Wait 5-10 minutes

2. **Verify in Salesforce**
   - Check campaign member list
   - Status should be "Responded"
   - Campaign Member created

3. **Test reverse (if bidirectional)**
   - Change SFDC member status
   - Verify Marketo program status updates

### 5.3 Validation Checklist

- [ ] Test member synced Marketo → SFDC
- [ ] Status mapped correctly
- [ ] Test member synced SFDC → Marketo (if bidirectional)
- [ ] New lead creation works (if configured)
- [ ] Sync timing acceptable

---

## Phase 6: Monitoring & Maintenance

### 6.1 Sync Status Monitoring

Check sync status regularly:

```
/monitor-sync --program=[ID]
```

Or via MCP:
```javascript
mcp__marketo__sync_status({ programId: [ID] })
```

### 6.2 Common Monitoring Points

| Metric | Normal | Warning |
|--------|--------|---------|
| Sync lag | < 15 min | > 30 min |
| Pending records | < 100 | > 500 |
| Error rate | < 1% | > 5% |

### 6.3 Sync Error Handling

Common sync errors:

| Error | Cause | Solution |
|-------|-------|----------|
| "Campaign not found" | SFDC campaign deleted/moved | Re-link or restore |
| "Status mismatch" | SFDC status doesn't exist | Add status in SFDC |
| "Permission denied" | Sync user permissions | Check profile |
| "Lead not synced" | Lead not in SFDC | Enable lead creation |

View errors:
```javascript
mcp__marketo__sync_errors({
  programId: [ID],
  limit: 50
})
```

### 6.4 Periodic Maintenance

**Weekly:**
- Check sync status
- Review error queue
- Verify member counts match

**Monthly:**
- Audit status mappings
- Review sync direction relevance
- Clean up orphaned links

**Quarterly:**
- Full sync reconciliation
- Permission audit
- Performance review

---

## Phase 7: Advanced Configuration

### 7.1 Multi-Program Hierarchy

For campaign hierarchies:

```
SFDC Parent Campaign
├── SFDC Child Campaign 1 ← Marketo Program 1
├── SFDC Child Campaign 2 ← Marketo Program 2
└── SFDC Child Campaign 3 ← Marketo Program 3
```

Configure each Marketo program to sync with appropriate child campaign.

### 7.2 Channel-Based Defaults

Configure default sync behavior by channel:

Admin > Salesforce > Campaign Sync Settings

| Channel | Default Sync | Default Direction |
|---------|--------------|-------------------|
| Webinar | Enabled | Bidirectional |
| Email Send | Enabled | Marketo to SFDC |
| Tradeshow | Enabled | Bidirectional |
| Content | Enabled | Marketo to SFDC |

### 7.3 Custom Sync Rules

For complex scenarios, use smart campaigns:

**Example: Conditional SFDC Sync**

**Smart List:**
- Program Status is Changed
- New Status: Attended
- Lead Score >= 50

**Flow:**
1. Change Data Value: SFDC_Sync_Priority = High
2. Sync Lead to SFDC (if not synced)

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Members not syncing | Sync disabled | Re-enable sync |
| Wrong status in SFDC | Mapping error | Review status mapping |
| Duplicate members | Multiple syncs | Check for duplicates |
| Sync delays | High volume | Check sync queue |
| SFDC campaign locked | Campaign completed | Change campaign status |

### Diagnostic Commands

```bash
# Check sync status
/monitor-sync --program=PROGRAM_ID

# View sync errors
/marketo-logs --filter=sync-error --program=PROGRAM_ID

# Force re-sync (use with caution)
# Via Program Actions > Sync with Salesforce
```

### Emergency Procedures

**Stop Sync (if causing issues):**
1. Program > Setup > Salesforce Campaign Sync
2. Click "Not Set" to unlink
3. Confirm removal

**Re-establish Sync:**
1. Verify SFDC campaign status
2. Re-link program to campaign
3. Re-map statuses
4. Test with single member

---

## Quick Commands

```bash
# Sync program to SFDC wizard
/sync-program-to-sfdc --program=PROGRAM_ID --campaign=SFDC_CAMPAIGN_ID

# Pre-flight validation
/marketo-preflight sync --program=PROGRAM_ID

# Monitor sync status
/monitor-sync --program=PROGRAM_ID

# View sync errors
/marketo-logs --filter=sync --program=PROGRAM_ID
```

---

## Related Resources

- **Agent**: `marketo-sfdc-sync-specialist`
- **Script**: `scripts/lib/program-sync-configurator.js`
- **Command**: `/sync-program-to-sfdc`
- **Command**: `/monitor-sync`
- **Runbook**: `salesforce-sync-troubleshooting.md`

---

## Appendix: Status Mapping Templates

### Webinar Program

| Marketo Status | SFDC Status | Responded |
|----------------|-------------|-----------|
| Not in Program | (no sync) | - |
| Invited | Sent | No |
| Registered | Responded | Yes |
| Confirmation Sent | Responded | Yes |
| Reminder Sent | Responded | Yes |
| Attended | Attended | Yes |
| No Show | No Show | No |
| Attended On-Demand | Attended On-Demand | Yes |

### Email Program

| Marketo Status | SFDC Status | Responded |
|----------------|-------------|-----------|
| Not in Program | (no sync) | - |
| Member | Sent | No |
| Engaged | Responded | Yes |

### Event/Tradeshow Program

| Marketo Status | SFDC Status | Responded |
|----------------|-------------|-----------|
| Not in Program | (no sync) | - |
| Invited | Sent | No |
| RSVP Yes | Registered | Yes |
| RSVP No | Declined | No |
| Attended | Attended | Yes |
| No Show | No Show | No |
| Visited Booth | Engaged | Yes |

### Content/Asset Program

| Marketo Status | SFDC Status | Responded |
|----------------|-------------|-----------|
| Not in Program | (no sync) | - |
| Targeted | Sent | No |
| Engaged | Responded | Yes |
| Downloaded | Converted | Yes |

---

## Appendix: Sync Configuration Checklist

```markdown
## Program: [Name]
## SFDC Campaign: [Name] (ID: [ID])
## Date: [Date]

### Pre-Configuration
- [ ] SFDC campaign created
- [ ] SFDC member statuses configured
- [ ] Marketo sync user permissions verified

### Configuration
- [ ] Program linked to campaign
- [ ] Status mapping complete
- [ ] Sync direction selected
- [ ] Default status set

### Testing
- [ ] Test member added in Marketo
- [ ] Test member appeared in SFDC
- [ ] Status mapped correctly
- [ ] Reverse sync tested (if bidirectional)

### Go-Live
- [ ] Initial sync completed
- [ ] Member counts verified
- [ ] Monitoring plan in place

### Sign-Off
- [ ] **SYNC ACTIVATED**
- [ ] Configured by: _______________
- [ ] Date: _______________
```
