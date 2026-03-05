# Branching Patterns

## STATIC_BRANCH vs LIST_BRANCH

| Feature | STATIC_BRANCH | LIST_BRANCH |
|---------|---------------|-------------|
| **API Support** | ✅ Full | ❌ None |
| **Branching Logic** | Single property/outcome | Complex AND/OR filters |
| **Max Branches** | Auto-generated per value | Up to 20 custom |
| **Use Case** | "Split by lifecycle stage" | "If (lead AND open) OR (opp AND qualified)" |
| **Configuration Complexity** | Low | High |
| **Error Prone** | Low | High |

## STATIC_BRANCH (API-Supported)

### When to Use

✅ Branching on a single property with discrete values:
- Branch by lifecycle stage (lead, MQL, SQL, opportunity)
- Branch by contact owner
- Branch by single enum/select property

### Example Configuration

```json
{
  "actionTypeId": "STATIC_BRANCH",
  "stepId": "branch-001",
  "splitOnProperty": "lifecyclestage",
  "branches": [
    {
      "propertyValue": "suspect",
      "actions": [
        {
          "actionTypeId": "SET_PROPERTY_VALUE",
          "propertyName": "hs_lead_status",
          "newValue": "engaged"
        }
      ]
    },
    {
      "propertyValue": "engaged",
      "actions": []  // Do nothing
    },
    {
      "propertyValue": "default",
      "actions": [
        {
          "actionTypeId": "DELAY",
          "duration": "PT24H"
        }
      ]
    }
  ]
}
```

### Implementation

```javascript
async function createStaticBranchWorkflow(flowId, branchConfig) {
  const payload = {
    actions: [{
      actionTypeId: "STATIC_BRANCH",
      splitOnProperty: branchConfig.property,
      branches: branchConfig.values.map(v => ({
        propertyValue: v.value,
        actions: v.actions || []
      }))
    }]
  };

  const response = await hubspotClient.put(
    `/automation/v4/flows/${flowId}`,
    payload
  );

  return response;
}
```

## LIST_BRANCH (UI Only)

### When to Use

✅ Complex AND/OR filter logic required:
- "IF (stage = Suspect AND score > 50) OR (VIP = true)"
- Multiple property conditions with AND/OR combinations
- Complex date/time-based conditions

### Structure (From GET Response)

```json
{
  "actionTypeId": "LIST_BRANCH",
  "stepId": "12345",
  "filters": [
    [
      {
        "filterType": "PROPERTY",
        "property": "lifecyclestage",
        "operation": "EQ",
        "value": "lead",
        "type": "enumeration"
      },
      {
        "filterType": "PROPERTY",
        "property": "hs_lead_status",
        "operation": "EQ",
        "value": "open",
        "type": "enumeration"
      }
    ],
    [
      {
        "filterType": "PROPERTY",
        "property": "lifecyclestage",
        "operation": "EQ",
        "value": "opportunity",
        "type": "enumeration"
      }
    ]
  ],
  "branches": [
    {
      "branchId": "branch-1",
      "filters": [...],
      "actions": [...]
    },
    {
      "branchId": "branch-2",
      "filters": [...],
      "actions": [...]
    }
  ]
}
```

### Manual UI Steps

1. Navigate to workflow editor: `https://app.hubspot.com/workflows/{portalId}/flow/{flowId}/edit`
2. Click "+" to add new action
3. Select "If/then branch"
4. Click "Add filter" for each condition
5. Configure filters:
   - Select property (e.g., "Business Unit Pipeline Stage")
   - Select operator (e.g., "is equal to")
   - Enter value (e.g., "Suspect")
6. For AND conditions: Add filter in same branch
7. For OR conditions: Click "Add OR rule"
8. Add actions under "Yes" branch
9. Leave "No" branch empty (or add alternative actions)
10. Click "Save"

## AB_TEST_BRANCH

### When to Use

✅ A/B testing with random distribution:
- Email variation testing
- Message timing tests
- Content experiments

### Example Configuration

```json
{
  "actionTypeId": "AB_TEST_BRANCH",
  "stepId": "ab-test-001",
  "testName": "Email Variation Test",
  "variations": [
    {
      "variationId": "A",
      "percentage": 50,
      "actions": [
        {
          "actionTypeId": "SEND_EMAIL",
          "templateId": "template-a-id"
        }
      ]
    },
    {
      "variationId": "B",
      "percentage": 50,
      "actions": [
        {
          "actionTypeId": "SEND_EMAIL",
          "templateId": "template-b-id"
        }
      ]
    }
  ]
}
```

## Common Patterns

### Pattern 1: Lifecycle Stage Routing

```json
{
  "actionTypeId": "STATIC_BRANCH",
  "splitOnProperty": "lifecyclestage",
  "branches": [
    { "propertyValue": "lead", "actions": [/* nurture sequence */] },
    { "propertyValue": "marketingqualifiedlead", "actions": [/* MQL handling */] },
    { "propertyValue": "salesqualifiedlead", "actions": [/* SQL routing */] },
    { "propertyValue": "opportunity", "actions": [/* opportunity nurture */] },
    { "propertyValue": "customer", "actions": [/* customer onboarding */] }
  ]
}
```

### Pattern 2: Lead Score Tier Routing

```json
{
  "actionTypeId": "STATIC_BRANCH",
  "splitOnProperty": "lead_score_tier",
  "branches": [
    { "propertyValue": "hot", "actions": [/* immediate sales outreach */] },
    { "propertyValue": "warm", "actions": [/* accelerated nurture */] },
    { "propertyValue": "cold", "actions": [/* standard nurture */] }
  ]
}
```

### Pattern 3: Owner-Based Routing

```json
{
  "actionTypeId": "STATIC_BRANCH",
  "splitOnProperty": "hubspot_owner_id",
  "branches": [
    { "propertyValue": "owner-id-1", "actions": [/* team A actions */] },
    { "propertyValue": "owner-id-2", "actions": [/* team B actions */] },
    { "propertyValue": "default", "actions": [/* unassigned handling */] }
  ]
}
```

## Branch Verification

After creating any branch, verify via API:

```javascript
async function verifyBranch(flowId, expectedBranchType) {
  const response = await hubspotClient.get(`/automation/v4/flows/${flowId}`);
  const workflow = response.data;

  const branches = workflow.actions.filter(a =>
    a.actionTypeId === expectedBranchType
  );

  if (branches.length === 0) {
    throw new Error(`No ${expectedBranchType} found in workflow`);
  }

  return branches;
}
```
