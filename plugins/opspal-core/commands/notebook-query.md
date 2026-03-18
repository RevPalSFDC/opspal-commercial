---
name: notebook-query
description: Query a client's NotebookLM knowledge base with natural language
argument-hint: "eta-corp \"What were the main CPQ findings?\""
allowed-tools:
  - mcp__notebooklm__notebook_query
  - Read
  - Write
thinking-mode: enabled
arguments:
  - name: alias
    description: Client org alias (e.g., eta-corp, acme)
    required: true
  - name: query
    description: Natural language question to ask the knowledge base
    required: true
  - name: priority
    description: Query priority for budget allocation (P0-P3)
    required: false
    default: P2
---

# Query NotebookLM Knowledge Base

## Purpose

**What this command does**: Executes natural language queries against a client's NotebookLM knowledge base to retrieve historical context, findings, and insights.

**When to use it**:
- ✅ Before assessments to load historical context
- ✅ During assessments to check for known issues
- ✅ When researching client history across assessments
- ✅ Ad-hoc questions about client operations

**When NOT to use it**:
- ❌ Notebook doesn't exist (run `/notebook-init` first)
- ❌ Query budget exhausted (check with `/notebook-status`)

## Usage

```bash
# Basic query
/notebook-query eta-corp "What were the main CPQ findings?"

# With priority
/notebook-query acme "What are the known automation conflicts?" --priority P1

# Complex query
/notebook-query acme-corp "List all recommendations that haven't been implemented yet"
```

## PROCESS

### 1) Load Notebook Registry

```bash
# Find registry
REGISTRY_PATH="instances/salesforce/${ALIAS}/notebooklm/notebook-registry.json"
# Fallback paths
if [ ! -f "$REGISTRY_PATH" ]; then
  REGISTRY_PATH="instances/${ALIAS}/notebooklm/notebook-registry.json"
fi
```

**Extract notebook ID:**
```bash
NOTEBOOK_ID=$(jq -r '.notebooks.primary.notebookId' "$REGISTRY_PATH")
```

**If not found:**
```
❌ Notebook not found for ${ALIAS}

   To create one: /notebook-init ${ALIAS}
```

### 2) Check Query Cache

**Load cache:**
```bash
CACHE_PATH="instances/${ALIAS}/notebooklm/query-cache.json"
```

**Check for similar recent query:**
- Hash the query
- Check if cached response exists within TTL (default 1 hour)
- If cache hit, return cached response

**Cache structure:**
```json
{
  "queries": {
    "hash_abc123": {
      "query": "What were the main CPQ findings?",
      "response": {...},
      "cachedAt": "2025-01-23T10:00:00Z",
      "ttl": 3600
    }
  },
  "budget": {
    "date": "2025-01-23",
    "used": 15,
    "remaining": 35,
    "byPriority": {"P0": 5, "P1": 3, "P2": 7, "P3": 0}
  }
}
```

### 3) Check Query Budget

**Budget allocation:**
| Priority | Daily Budget | Use Case |
|----------|--------------|----------|
| P0 | 15 | Active assessment context loading |
| P1 | 10 | Cross-assessment insight discovery |
| P2 | 15 | On-demand user queries |
| P3 | 5 | Weekly briefing generation |
| Reserve | 5 | Error retries |

**If budget exceeded:**
```
⚠️ Daily query budget exhausted for priority ${PRIORITY}

   P0: 15/15 used
   P1: 10/10 used
   P2: 15/15 used (← your priority)
   P3: 2/5 used

   Options:
   1. Use lower priority: /notebook-query ${ALIAS} "..." --priority P3
   2. Wait until tomorrow (budget resets at midnight)
   3. Check cache for similar queries
```

### 4) Execute Query

**Via MCP tool:**
```
Tool: notebook_query
Params:
  - notebook_id: {notebook_id}
  - query: "{user_query}"
```

**Handle response:**
- Extract answer text
- Extract cited sources
- Calculate confidence (if available)

### 5) Update Cache

**Save response to cache:**
```javascript
{
  "query": "What were the main CPQ findings?",
  "response": {
    "answer": "The main CPQ findings from the December 2024 assessment were...",
    "sources": [
      {"title": "CPQ Assessment Summary", "id": "src_001"},
      {"title": "RUNBOOK.md", "id": "src_002"}
    ],
    "confidence": 0.92
  },
  "cachedAt": "2025-01-23T10:30:00Z",
  "ttl": 3600,
  "priority": "P2"
}
```

**Decrement budget:**
```javascript
cache.budget.used += 1;
cache.budget.remaining -= 1;
cache.budget.byPriority[priority] += 1;
```

### 6) Format Response

```
📋 Query: "What were the main CPQ findings?"

💬 Answer:
The main CPQ findings from the December 2024 assessment were:

1. **Pricing Complexity**: 47 active price rules with 12 redundant conditions
2. **Approval Bottlenecks**: 5-level approval chain causing 3-day average delays
3. **Product Bundle Issues**: Nested bundles exceeding 4 levels causing errors

📚 Sources Cited:
   • CPQ Assessment Summary (2024-12-15)
   • RUNBOOK.md - CPQ Section

🎯 Confidence: 92%

📊 Budget: 16/50 queries used today (P2: 8/15)
```

## Examples

### Example 1: Historical Context

```
User: /notebook-query eta-corp "What are the known org quirks?"

Agent:
📋 Query: "What are the known org quirks?"

💬 Answer:
Based on the RUNBOOK and org context, eta-corp has these known quirks:

1. **Custom Labels**: Quote → "Order Form", QuoteLine → "Order Line"
2. **Multi-Currency**: EUR primary, USD secondary with custom conversion rules
3. **Validation Exceptions**: Bypass for system user 005xxxxx (integration)
4. **API Limits**: Heavy REST API usage requires batching for bulk ops

📚 Sources Cited:
   • RUNBOOK.md - Org Quirks Section
   • ORG_CONTEXT.json

🎯 Confidence: 95%
```

### Example 2: Cross-Assessment Insights

```
User: /notebook-query acme "What recommendations have been repeated?" --priority P1

Agent:
📋 Query: "What recommendations have been repeated?"

💬 Answer:
Three recommendations appear across multiple assessments:

1. **Flow Consolidation** (CPQ, Automation, RevOps assessments)
   - Mentioned in Dec 2024, Oct 2024, Aug 2024
   - Priority: High in all assessments

2. **Permission Set Cleanup** (Security, RevOps assessments)
   - Mentioned in Nov 2024, Sep 2024
   - Estimated impact: 40% reduction in complexity

3. **Report Rationalization** (RevOps assessments)
   - 67 reports identified as unused in both audits

📚 Sources Cited:
   • CPQ Assessment Summary
   • Automation Audit Report
   • RevOps Assessment

🎯 Confidence: 88%
```

### Example 3: Assessment Prep

```
User: /notebook-query acme-corp "What should I know before running a RevOps assessment?" --priority P0

Agent:
📋 Query: "What should I know before running a RevOps assessment?"

💬 Answer:
Key context for acme-corp RevOps assessment:

**Previous Findings:**
- Pipeline stages customized (7 stages vs standard 5)
- Custom probability fields override standard Probability
- Finance team has separate forecast process

**Known Data Quality Issues:**
- 12% duplicate accounts identified in last audit
- CloseDate reliability: 78% (historical)

**Stakeholder Preferences:**
- CEO prefers monthly cohort analysis
- Finance requires GAAP-compliant metrics

📚 Sources Cited:
   • Previous RevOps Assessment (2024-09)
   • RUNBOOK.md - RevOps Section
   • Meeting Notes - Q4 Planning

🎯 Confidence: 91%
```

## Error Handling

| Error | Resolution |
|-------|------------|
| Notebook not found | Run `/notebook-init {alias}` |
| Budget exhausted | Lower priority or wait |
| Query timeout | Retry, simplify query |
| Auth expired | Run `/setup-notebooklm` |
| No relevant sources | Sync more sources with `/notebook-sync` |

## Query Optimization Tips

1. **Be specific**: "CPQ pricing rule conflicts" > "CPQ issues"
2. **Reference time**: "findings from last assessment" helps scope
3. **Ask for lists**: "List all..." returns structured responses
4. **Use P0 sparingly**: Reserve for assessment context loading

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| NOTEBOOKLM_CACHE_TTL | 3600 | Cache TTL in seconds |
| NOTEBOOKLM_DAILY_QUERY_BUDGET | 50 | Total daily budget |
| NOTEBOOKLM_QUERY_TIMEOUT | 120 | Query timeout seconds |
