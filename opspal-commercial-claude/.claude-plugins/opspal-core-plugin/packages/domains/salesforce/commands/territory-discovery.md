---
description: Discover and analyze current territory configuration with health metrics and hierarchy visualization
---

# Territory Discovery Command

Analyze Salesforce Territory2 configuration, generate health reports, and visualize hierarchy.

## Usage

```
/territory-discovery [org-alias]
```

## What This Command Does

1. **Lists all Territory2Models** with their states (Planning, Active, Archived)
2. **Analyzes hierarchy** for cycles and orphaned territories
3. **Calculates coverage metrics** (territories, users, accounts)
4. **Generates health score** based on configuration quality
5. **Outputs Mermaid diagram** for hierarchy visualization

## Instructions for Claude

When the user invokes this command, perform the following steps:

### Step 1: Get Org Alias

If org alias not provided, prompt user or use default connected org.

### Step 2: List Models

Execute and report results:

```bash
sf data query --query "SELECT Id, Name, DeveloperName, State, Description FROM Territory2Model ORDER BY State, Name" --target-org $ORG --json
```

### Step 3: Analyze Active or Specified Model

For the active model (or user-specified model):

```bash
# Get territory count and hierarchy depth
node .claude-plugins/opspal-core-plugin/packages/domains/salesforce/scripts/territory/territory-hierarchy-analyzer.js $ORG $MODEL_ID
```

### Step 4: Generate Coverage Report

Query coverage metrics:

```sql
-- Territory coverage summary
SELECT
  COUNT(DISTINCT t.Id) TotalTerritories,
  COUNT(DISTINCT uta.Territory2Id) TerritoriesWithUsers,
  COUNT(DISTINCT ota.Territory2Id) TerritoriesWithAccounts,
  COUNT(DISTINCT uta.UserId) UniqueUsers,
  COUNT(DISTINCT ota.ObjectId) UniqueAccounts
FROM Territory2 t
LEFT JOIN UserTerritory2Association uta ON t.Id = uta.Territory2Id
LEFT JOIN ObjectTerritory2Association ota ON t.Id = ota.Territory2Id
WHERE t.Territory2ModelId = '<model_id>'
```

### Step 5: Calculate Health Score

Health factors:
- **No cycles** (critical - 0 points if cycles exist)
- **No orphans** (critical - 0 points if orphans exist)
- **User coverage** (30 points max - territories with users / total)
- **Account coverage** (30 points max - territories with accounts / total)
- **Reasonable depth** (20 points max - penalize depth > 6)
- **Balanced structure** (20 points max - low variance in breadth)

### Step 6: Output Report

Format output as:

```
═══════════════════════════════════════════════════════════
TERRITORY DISCOVERY REPORT
Org: [org-alias]
Generated: [timestamp]
═══════════════════════════════════════════════════════════

MODELS FOUND: [count]
───────────────────────────────────────────────────────────
✅ Active:   [model_name] (ID: [id])
📝 Planning: [model_name] (ID: [id])
📦 Archived: [model_name] (ID: [id])

ACTIVE MODEL ANALYSIS: [model_name]
───────────────────────────────────────────────────────────
Territories:     [count] (Depth: [max_depth], Roots: [count])
User Coverage:   [count] users across [count] territories
Account Coverage: [count] accounts across [count] territories

HIERARCHY HEALTH
───────────────────────────────────────────────────────────
✅ No circular references
✅ No orphaned territories
⚠️  [warnings if any]

HEALTH SCORE: [score]/100
───────────────────────────────────────────────────────────

HIERARCHY VISUALIZATION (Mermaid)
───────────────────────────────────────────────────────────
[mermaid diagram code]

═══════════════════════════════════════════════════════════
```

## Related Commands

- `/territory-validator` - Validate specific operations
- `/territory-assign` - Interactive assignment wizard

## Related Agents

- `sfdc-territory-discovery` - Full discovery agent with advanced analysis
- `sfdc-territory-orchestrator` - Master coordinator for territory operations
