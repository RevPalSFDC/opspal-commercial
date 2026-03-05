# Automation Capability Matrix

## Flow Types

| Flow Type | API Support | Use Case | Trigger |
|-----------|-------------|----------|---------|
| Record-Triggered | Full | Auto-update fields on save | Before/After insert/update/delete |
| Scheduled | Full | Daily/weekly batch processing | Time-based schedule |
| Auto-Launched | Full | Called from other automations | Invocable action |
| Screen Flow | Partial | User input forms | Button/Quick Action |
| Platform Event | Full | Event-driven automation | Platform events |

## Flow Template Library

### 6 Production-Ready Templates

1. **lead-assignment**
   - Auto-assign leads based on criteria
   - Parameters: assignmentField, assignmentValue, ownerUserId
   - Use case: Route leads by State, Industry, etc.

2. **opportunity-validation**
   - Validate opportunity data at stage gates
   - Parameters: requiredStage, requiredField, errorMessage
   - Use case: Enforce data quality before progression

3. **account-enrichment**
   - Enrich account data on create/update
   - Parameters: industryMapping, segmentValue, revenueThreshold
   - Use case: Auto-segment accounts

4. **case-escalation**
   - Auto-escalate cases by priority and age
   - Parameters: priorityLevel, ageThresholdHours, escalationQueueId
   - Use case: Ensure timely attention

5. **task-reminder**
   - Send reminders for overdue/upcoming tasks
   - Parameters: reminderDaysBefore, taskStatus, emailTemplate
   - Use case: Reduce missed deadlines

6. **contact-deduplication**
   - Detect and flag duplicate contacts
   - Parameters: matchField, duplicateFlagField, autoMerge
   - Use case: Maintain clean database

## CLI Commands

### Template Operations

```bash
# List available templates
flow template list --category core

# Show template details
flow template show lead-assignment

# Apply template with parameters
flow template apply lead-assignment \
  --name CA_Lead_Assignment \
  --params "assignmentField=State,assignmentValue=California,ownerUserId=005xx..."
```

### Flow Operations

```bash
# Create new Flow
flow create MyFlow --type Record-Triggered --object Account

# Validate Flow
flow validate MyFlow.xml --best-practices --governor-limits

# Deploy Flow
flow deploy MyFlow.xml --activate

# Dry-run (test without deploying)
flow deploy MyFlow.xml --activate --dry-run
```

### Batch Operations

```bash
# Validate multiple Flows
flow batch validate "./flows/*.xml" --parallel 5

# Deploy multiple Flows
flow batch deploy "./flows/*.xml" --activate --parallel 3
```

## API Limitations Reference

| Component | Can Create | Can Modify | Can Delete |
|-----------|------------|------------|------------|
| Auto-launched Flows | Yes | Yes | Yes |
| Screen Flow Logic | Yes | Yes | Yes |
| Screen Flow UI | No | No | No |
| Quick Actions | No | No | No |
| Approval Processes | No | No | No |
| Validation Rules | Yes | Yes | Yes |
| Workflow Rules | Yes | Yes | Yes |
