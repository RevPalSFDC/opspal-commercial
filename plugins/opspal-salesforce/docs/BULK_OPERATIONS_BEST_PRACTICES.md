# Salesforce Bulk Operations Best Practices

**Version**: 1.0.0
**Last Updated**: 2025-10-19
**Status**: Production Ready
**Audience**: Agents, Developers, Operations Teams

---

## Table of Contents

1. [Introduction](#introduction)
2. [Choosing the Right Salesforce API](#choosing-the-right-salesforce-api)
3. [Bulk API 2.0 Mastery](#bulk-api-20-mastery)
4. [Batching with Standard APIs](#batching-with-standard-apis)
5. [Client-Side Parallelism](#client-side-parallelism)
6. [LLM Agent Strategies](#llm-agent-strategies)
7. [Auditing for Sequential Bias](#auditing-for-sequential-bias)
8. [Code Examples](#code-examples)
9. [Performance Benchmarks](#performance-benchmarks)
10. [Troubleshooting](#troubleshooting)

---

## Introduction

### Purpose

This playbook provides **Salesforce API-specific** best practices for bulk data operations to avoid sequential bias and achieve optimal performance. It complements the existing [PERFORMANCE_OPTIMIZATION_PLAYBOOK.md](./PERFORMANCE_OPTIMIZATION_PLAYBOOK.md) with Salesforce-specific patterns.

### When to Use This Playbook

Use this playbook when:
- Designing data operations involving **>10 records**
- Agent is processing records sequentially (one-by-one)
- Operations are "way too slow" (user feedback)
- API limit warnings appear
- Implementing data imports, exports, updates, or migrations

### Core Principle

**"Batch by default, sequential only when necessary"**

Salesforce provides multiple APIs with different performance characteristics. Choosing the right API and batching strategy can improve performance by **50-99%** (5-100x faster).

---

## Choosing the Right Salesforce API

### Decision Tree

```
┌─────────────────────────────────────────────────┐
│ How many records are you processing?            │
└─────────────────────────────────────────────────┘
                      │
         ┌────────────┴────────────┐
         │                         │
      < 10 records            > 10 records
         │                         │
         v                         v
  ┌─────────────┐        ┌──────────────────┐
  │ Standard API│        │  How many total? │
  │ (individual)│        └──────────────────┘
  └─────────────┘                 │
                     ┌─────────────┼─────────────┐
                     │             │             │
                 10-200       200-10,000      >10,000
                     │             │             │
                     v             v             v
            ┌────────────┐  ┌────────────┐  ┌─────────┐
            │ Standard   │  │ Standard   │  │ Bulk    │
            │ API (loop) │  │ API (batch)│  │ API 2.0 │
            └────────────┘  └────────────┘  └─────────┘
```

### API Comparison Table

| Records | API | Method | Performance | Tools |
|---------|-----|--------|-------------|-------|
| < 10 | Standard REST/SOAP | Individual calls | ~200ms per call | `sf.query()`, `sf.update()` |
| 10-200 | Standard REST/SOAP | Loop with error handling | ~200ms × N | Loop with try-catch |
| 200-10K | Standard REST/SOAP | **200-record batches** | ~200ms × (N/200) | Composite API, `batch-query-executor.js` |
| >10K | **Bulk API 2.0** | **Async batch jobs** | ~10-60s for 10K | `bulk-api-handler.js`, `async-bulk-ops.js` |

### Rule of Thumb

**Key Thresholds:**
- **10+ records**: Start thinking about batching
- **200+ records**: Batching is **mandatory** (use 200-record chunks)
- **10,000+ records**: Bulk API 2.0 is **mandatory**

**Why these thresholds?**
- **200 records**: Salesforce REST/SOAP API limit per batch
- **10,000 records**: Bulk API becomes dramatically faster than batched Standard API
- **Crossover point**: ~10K records is where Bulk API overhead is worth it

---

## Bulk API 2.0 Mastery

### Always Use Bulk API 2.0 (NOT 1.0)

Bulk API v2.0 is newer, simpler, and faster than v1.0.

**Migration:**
```javascript
// ❌ OLD: Bulk API v1.0 (deprecated)
// Complex XML, manual batch splitting, slower

// ✅ NEW: Bulk API v2.0 (recommended)
const handler = await BulkAPIHandler.fromSFAuth(orgAlias);
const result = await handler.smartOperation('update', 'Account', records);
```

**Why v2.0?**
- Simpler API (fewer steps)
- Better error messages
- Faster processing (Salesforce optimizations)
- Native JSON support (no XML conversion)

### Use Parallel Concurrency Mode (Default)

**Parallel mode** processes batches simultaneously on Salesforce servers for maximum throughput.

```javascript
// ✅ GOOD: Parallel mode (default)
{
  "concurrencyMode": "Parallel"  // Batches process simultaneously
}

// ❌ BAD: Serial mode (only for locking conflicts)
{
  "concurrencyMode": "Serial"  // Batches process one-at-a-time (slow!)
}
```

**When to use Serial mode:**
- Record locking conflicts detected
- Complex cross-record dependencies
- Troubleshooting failed parallel jobs

**Otherwise**: Always use Parallel mode (5-10x faster)

### Maximize Batch Size (10,000 Records)

Bulk API 2.0 allows up to **10,000 records per batch**. Larger batches = fewer batches = less overhead.

```javascript
// ❌ SUBOPTIMAL: Small batches
const batchSize = 1000;  // 50 batches for 50K records

// ✅ OPTIMAL: Maximum batch size
const batchSize = 10000;  // 5 batches for 50K records (10x fewer batches!)
```

**When to reduce batch size:**
- Batches timing out (large record size × many fields)
- Complex triggers causing long processing times
- Governor limit errors (DML rows, CPU time)

**Tuning approach:**
1. Start with 10,000 (max)
2. If timeout errors → reduce to 5,000
3. If still timing out → reduce to 2,000
4. Investigate trigger/workflow complexity

### Monitor Job Status and Handle Partial Failures

Bulk API is **asynchronous** - you won't get immediate per-record results.

**Required workflow:**
```javascript
// 1. Submit job
const jobId = await submitBulkJob('update', 'Account', csvPath, orgAlias);
console.log(`Job ID: ${jobId}`);

// 2. Poll for completion (async)
const status = await pollJobStatus(jobId, orgAlias);

// 3. Retrieve results (MANDATORY)
const successResults = await getSuccessfulResults(jobId, orgAlias);
const failedResults = await getFailedResults(jobId, orgAlias);

// 4. Handle failures
if (failedResults.length > 0) {
  console.log(`${failedResults.length} records failed`);
  // Log failures, retry, or report
  await handleFailedRecords(failedResults);
}
```

**Key points:**
- **Always check results** - partial failures are common
- **Plan for failures** - validation rules, duplicates, permissions
- **Retry strategy** - retry transient errors, skip data errors
- **Capture error details** - error codes, messages, record IDs

### Avoid Unnecessary Small Bulk Jobs

Bulk API has job **creation and polling overhead** (~5-15 seconds).

```javascript
// ❌ BAD: Many small bulk jobs (inefficient)
for (const batch of batches) {
  const jobId = await createBulkJob('update', 'Account');
  await uploadBatch(jobId, batch);  // 100 records
  await pollJob(jobId);  // 15s overhead × 50 jobs = 12.5 minutes wasted!
}

// ✅ GOOD: One bulk job with multiple batches
const jobId = await createBulkJob('update', 'Account');
for (const batch of batches) {
  await uploadBatch(jobId, batch);  // 100 records × 50 batches = 5K records
}
await closeJob(jobId);
await pollJob(jobId);  // 15s overhead × 1 job = 15 seconds total
```

**Rule**: Combine records into as few jobs as possible.

---

## Batching with Standard APIs

### 200-Record Batches (REST/SOAP Limit)

Salesforce REST and SOAP APIs support **up to 200 records per batch** in a single call.

**Example: Batched Updates**
```javascript
const batchSize = 200;
const batches = chunk(records, batchSize);  // Split into 200-record chunks

for (const batch of batches) {
  try {
    await sf.update('Account', batch);  // Single API call for 200 records
    console.log(`✓ Updated ${batch.length} records`);
  } catch (error) {
    console.error(`✗ Batch failed: ${error.message}`);
    // Handle failure (retry, log, etc.)
  }
}
```

**Performance:**
- **1 record at a time**: 1000 records = 1000 API calls = ~200 seconds
- **200 per batch**: 1000 records = 5 API calls = ~1 second (**200x faster**)

### Composite REST API

The **Composite API** allows multiple operations in a single HTTP request, reducing network overhead.

**Use cases:**
- Multiple operations on different objects (Account + Contact + Opportunity)
- Complex related record creation (parent + children in one call)
- Transaction-like behavior (all-or-nothing execution)

**Example: Composite SObject Collections**
```javascript
// Update 200 Accounts in one call
POST /services/data/v62.0/composite/sobjects/Account

{
  "allOrNone": false,
  "records": [
    {"Id": "001xx00000", "Name": "Acme Inc", "AnnualRevenue": 1000000},
    {"Id": "001xx00001", "Name": "Beta Corp", "AnnualRevenue": 500000},
    // ... up to 200 records
  ]
}
```

**Limits:**
- **25 sub-requests** in Composite Batch
- **200 records** in SObject Collections
- **5 graphs** in Composite Graph (nested operations)

**Performance:**
- **Reduces API calls by 50-70%**
- **Reduces network latency** (1 HTTP request instead of N)
- **Atomic execution** with `allOrNone: true`

### SOQL Query Optimization (Batch Reads)

Reading data is also a place to batch.

```javascript
// ❌ BAD: N+1 query pattern (500 queries!)
for (const accountId of accountIds) {
  const account = await sf.query(
    `SELECT Id, Name, Owner.Name FROM Account WHERE Id = '${accountId}'`
  );
  // 500 IDs = 500 API calls = 100 seconds
}

// ✅ GOOD: Single query with IN clause (1 query!)
const accounts = await sf.query(`
  SELECT Id, Name, Owner.Name
  FROM Account
  WHERE Id IN ('${accountIds.join("','")}')
`);
// 500 IDs = 1 API call = 0.5 seconds (200x faster)
```

**SOQL batching strategies:**
- **IN clause**: Up to 4,000 values (but keep queries under 20K characters)
- **Query all + filter**: Use `WHERE CreatedDate > YESTERDAY` instead of looping
- **Pagination**: Use `queryMore` for >2,000 records (or use Bulk Query for millions)
- **Related queries**: Use subqueries to join data (avoid N+1 lookups)

**Example: Subquery to avoid N+1**
```javascript
// ❌ BAD: Query accounts, then query contacts for each account
const accounts = await sf.query('SELECT Id, Name FROM Account');
for (const account of accounts) {
  const contacts = await sf.query(
    `SELECT Id, Name FROM Contact WHERE AccountId = '${account.Id}'`
  );
  // N+1 problem: 1 account query + N contact queries
}

// ✅ GOOD: Single query with subquery
const accounts = await sf.query(`
  SELECT Id, Name,
    (SELECT Id, Name FROM Contacts)
  FROM Account
`);
// 1 query returns accounts + related contacts
```

---

## Client-Side Parallelism

### When to Use Promise.all() for Concurrent Calls

If operations are **independent** (no shared state/dependencies), you can execute them **in parallel** on the client side.

**Example: Parallel queries**
```javascript
// ❌ SEQUENTIAL: 3 queries one-at-a-time (1.5 seconds)
const accounts = await sf.query('SELECT Id FROM Account');
const contacts = await sf.query('SELECT Id FROM Contact');
const opportunities = await sf.query('SELECT Id FROM Opportunity');
// Total: 500ms + 500ms + 500ms = 1500ms

// ✅ PARALLEL: 3 queries simultaneously (500ms)
const [accounts, contacts, opportunities] = await Promise.all([
  sf.query('SELECT Id FROM Account'),
  sf.query('SELECT Id FROM Contact'),
  sf.query('SELECT Id FROM Opportunity')
]);
// Total: max(500ms, 500ms, 500ms) = 500ms (3x faster!)
```

**When to parallelize:**
- ✅ Fetching data from **different objects** (Account, Contact, Case)
- ✅ Independent **validation checks** (field exists, user active, etc.)
- ✅ **Bulk job polling** for multiple jobs
- ✅ **Metadata queries** for different types (fields, validation rules, flows)

**When NOT to parallelize:**
- ❌ Operations on **same records** (risk of record locking)
- ❌ Operations with **dependencies** (create parent → then create children)
- ❌ **Rate limit sensitive** (already hitting API limits)

### Salesforce Concurrency Limits

Salesforce allows **moderate parallelism** but has limits:

**Concurrency limits:**
- **25 concurrent long-running requests** per org (queries >2 seconds)
- **Unlimited short requests** (<2 seconds) - but be reasonable
- **API call limits**: 15,000-100,000 calls per 24 hours (depends on edition)

**Best practices:**
- **Limit to 10-20 parallel calls** at a time (reasonable default)
- **Use `p-limit`** or similar to cap concurrency
- **Monitor API usage** with `sf limits api display`
- **Implement backoff** if hitting limits

**Example: Controlled concurrency**
```javascript
const pLimit = require('p-limit');
const limit = pLimit(10);  // Max 10 concurrent calls

const promises = records.map(record =>
  limit(() => processRecord(record))  // Controlled parallelism
);

const results = await Promise.all(promises);
```

### Async Workflows for Long-Running Bulk Jobs

Since Bulk API jobs are asynchronous (take minutes), don't block waiting for results.

**Workflow:**
```javascript
// ❌ BAD: Blocking workflow (agent waits)
const jobId = await submitBulkJob('update', 'Account', data);
await waitForJobCompletion(jobId);  // Blocks for 5 minutes!
// Agent can't do anything else during this time

// ✅ GOOD: Non-blocking workflow (agent continues)
const jobId = await submitBulkJob('update', 'Account', data);
console.log(`Job submitted: ${jobId}. Check status at:`);
console.log(`  sf data bulk status --job-id ${jobId}`);
// Agent can handle other tasks or exit
// User checks status later or sets up polling in background
```

**Implementation:**
- Use `async-bulk-ops.js` for fire-and-forget jobs
- Return job ID to user immediately
- Provide command to check status
- Optionally: Set up background polling (separate process)

### Limiting Sequential Dependencies

**Identify truly sequential steps** (must run in order) vs **falsely sequential** (could run in parallel).

**Example: Falsely sequential**
```javascript
// ❌ FALSELY SEQUENTIAL: These can run in parallel!
await backupData('Account');
await backupData('Contact');
await backupData('Opportunity');
// Total: 10s + 10s + 10s = 30 seconds

// ✅ PARALLEL: Run backups simultaneously
await Promise.all([
  backupData('Account'),
  backupData('Contact'),
  backupData('Opportunity')
]);
// Total: max(10s, 10s, 10s) = 10 seconds (3x faster)
```

**Checklist for dependencies:**
- ❓ Does step B need output from step A? → **Sequential**
- ❓ Do steps touch the same records? → **Sequential** (avoid lock conflicts)
- ❓ Are steps completely independent? → **Parallel**

**Rule**: Default to parallel, only serialize when dependencies exist.

---

## LLM Agent Strategies

### Teach Agents About Bulk Operations

LLM agents (Claude, GPT-4) tend toward **sequential bias** ("for each item, do X") unless explicitly guided.

**Strategy 1: Add bulk guidance to prompts**
```markdown
# Agent Prompt Enhancement

You have the following bulk operation tools:
- bulk_update_records(object, records) - Update many records at once
- batch_query(queries) - Execute multiple queries in one call
- bulk_insert_records(object, records) - Insert many records at once

**IMPORTANT**:
- If updating >10 records, use bulk_update_records (not update_record in a loop)
- If querying multiple objects, use batch_query (not individual queries)
- Avoid "for each" thinking - always ask "can I batch this?"
```

**Strategy 2: Provide bulk tools (not just single-record tools)**
```javascript
// ❌ BAD: Only expose single-record tools
tools: ['update_record', 'query_record', 'delete_record']

// ✅ GOOD: Expose bulk tools prominently
tools: [
  'bulk_update_records',  // Highlighted
  'bulk_insert_records',
  'batch_query',
  'update_record',  // Available but not preferred
  'query_record'
]
```

### Incentivize Fewer Steps

LLM agents tend to be verbose (more steps = more tokens = more cost).

**Strategy: Add cost/iteration awareness**
```markdown
# Agent Constraint

You have a budget of 50 API calls for this task. Exceeding the budget will fail the task.

**Cost accounting:**
- Individual API call: 1 credit
- Batch call (200 records): 1 credit (same cost!)
- Bulk API job: 5 credits (setup overhead)

**Optimization incentive:** Minimize API calls to stay under budget.
```

**Result**: Agent will naturally batch operations to conserve budget.

### Tool Selection Logic

Guide the agent to choose the right tool based on operation size.

**Example: Tool selection hints**
```javascript
tools: [
  {
    name: 'update_record',
    description: 'Update a single record. Use for <10 records only.',
    hint: 'For >10 records, use bulk_update_records instead'
  },
  {
    name: 'bulk_update_records',
    description: 'Update multiple records at once (10-10,000 records).',
    hint: 'Use this for any batch operation >10 records'
  },
  {
    name: 'bulk_api_update',
    description: 'Update >10,000 records via Bulk API 2.0 (async).',
    hint: 'Use for large-scale operations >10K records'
  }
]
```

**Agent reasoning:**
```
User wants to update 500 contacts.
- update_record: <10 records only → ❌ Not appropriate
- bulk_update_records: 10-10,000 records → ✅ Use this
- bulk_api_update: >10K records → ❌ Overkill
→ Decision: Use bulk_update_records
```

### Breaking Down Tasks Intelligently

Agents often break tasks into **per-record subtasks** (bad). Guide them to break by **operation type** (good).

**Example: Task decomposition**
```markdown
# ❌ BAD: Per-record breakdown
Task: Update 1000 opportunities
Subtasks:
1. Update opportunity 1
2. Update opportunity 2
3. Update opportunity 3
...
1000. Update opportunity 1000
→ 1000 sequential steps!

# ✅ GOOD: Operation-type breakdown
Task: Update 1000 opportunities
Subtasks:
1. Fetch all 1000 opportunities (1 query)
2. Transform data (in-memory operation)
3. Batch update in 200-record chunks (5 API calls)
→ 3 steps, 6 API calls total
```

**Prompt guidance:**
```markdown
When breaking down tasks:
- Group by operation type (all reads together, all writes together)
- Avoid per-record subtasks
- Think: "What's the minimum number of API calls needed?"
```

### Use of Intermediate Aggregation

Push computations to Salesforce (server-side) instead of fetching all data to compute client-side.

**Example: Aggregation in SOQL**
```javascript
// ❌ BAD: Fetch all records, compute in agent
const accounts = await sf.query('SELECT Id, AnnualRevenue FROM Account');
const totalRevenue = accounts.reduce((sum, acc) => sum + acc.AnnualRevenue, 0);
const avgRevenue = totalRevenue / accounts.length;
// Fetches 10,000 records, computes client-side

// ✅ GOOD: Use SOQL aggregation (server-side)
const result = await sf.query(`
  SELECT COUNT(Id), SUM(AnnualRevenue), AVG(AnnualRevenue)
  FROM Account
`);
const totalRevenue = result[0].expr0;
const avgRevenue = result[0].expr1;
// Returns 1 row with aggregated data
```

**Agent prompt:**
```markdown
**Optimization tip:**
Use SOQL aggregate functions (COUNT, SUM, AVG, MIN, MAX) instead of fetching all records.

Example:
- ❌ Don't: SELECT all → count in code
- ✅ Do: SELECT COUNT(Id) FROM Object
```

---

## Auditing for Sequential Bias

### Automated Detection

**Grep patterns to find sequential bias in code:**
```bash
# Find loops over records
grep -rn "for.*in.*records" scripts/ agents/

# Find sequential agent launches
grep -rn "await.*Task.launch" agents/ | grep -v "parallel"

# Find N+1 query patterns
grep -rn "for.*await.*query" scripts/

# Find individual updates in loops
grep -rn "for.*await.*update" scripts/
```

**Red flags:**
- `for (const record of records) { await processRecord(record); }`
- Multiple `Task.launch()` calls in sequence
- Individual API calls inside loops
- No mention of "batch", "bulk", "parallel" in implementation

### Manual Review Checklist

For each agent/script:
- [ ] Does it process >10 records?
- [ ] Does it use loops with await inside?
- [ ] Does it mention bulk/batch operations?
- [ ] Does it have examples of batching?
- [ ] Does it reference bulk tools (bulk-api-handler.js)?
- [ ] Does it use Promise.all() for independent operations?

**If >2 red flags**: Candidate for refactoring.

### Test with Large Data Sets

**Performance test pattern:**
```javascript
// Test with 100 records
const records = generateTestRecords(100);
const start = Date.now();
await processRecords(records);
const duration = Date.now() - start;

console.log(`Processed 100 records in ${duration}ms`);
console.log(`Rate: ${(100 / (duration/1000)).toFixed(1)} records/sec`);

// Expected rates:
// - Sequential: 5-10 records/sec (slow!)
// - Batched: 100-500 records/sec (good)
// - Bulk API: 1000+ records/sec (excellent)
```

**Thresholds:**
- <10 rec/sec → **Sequential bias** (refactor required)
- 10-100 rec/sec → **Batching present** (good)
- >100 rec/sec → **Optimized** (bulk or parallel)

---

## Code Examples

### Example 1: Python with Bulk API v2.0

```python
import requests
import time

# Auth (assume you have access_token and instance_url)
headers = {
    "Authorization": f"Bearer {access_token}",
    "Content-Type": "application/json"
}

# 1. Create bulk ingest job
job_config = {
    "operation": "update",
    "object": "Account",
    "contentType": "CSV"
}
resp = requests.post(
    f"{instance_url}/services/data/v62.0/jobs/ingest",
    headers=headers, json=job_config
)
job_id = resp.json()["id"]
print(f"Created job: {job_id}")

# 2. Upload CSV data (up to 10K records per batch)
csv_data = "Id,Name,AnnualRevenue\n"
csv_data += "001xx000001,Acme Inc,1000000\n"
csv_data += "001xx000002,Beta Corp,500000\n"
# ... (add up to 10,000 records)

resp = requests.put(
    f"{instance_url}/services/data/v62.0/jobs/ingest/{job_id}/batches",
    headers={"Authorization": f"Bearer {access_token}", "Content-Type": "text/csv"},
    data=csv_data
)
print(f"Uploaded batch: {resp.status_code}")

# 3. Close job (start processing)
requests.patch(
    f"{instance_url}/services/data/v62.0/jobs/ingest/{job_id}",
    headers=headers, json={"state": "UploadComplete"}
)

# 4. Poll for completion
while True:
    resp = requests.get(
        f"{instance_url}/services/data/v62.0/jobs/ingest/{job_id}",
        headers=headers
    )
    status = resp.json()["state"]
    print(f"Job status: {status}")
    if status in ("JobComplete", "Failed"):
        break
    time.sleep(5)  # Wait 5 seconds before next poll

# 5. Retrieve results
if status == "JobComplete":
    success_resp = requests.get(
        f"{instance_url}/services/data/v62.0/jobs/ingest/{job_id}/successfulResults",
        headers=headers
    )
    print("Successful records:", success_resp.text)

    failed_resp = requests.get(
        f"{instance_url}/services/data/v62.0/jobs/ingest/{job_id}/failedResults",
        headers=headers
    )
    print("Failed records:", failed_resp.text)
```

### Example 2: JavaScript with Promise.all()

```javascript
const sf = require('./sf-connection');

async function parallelMetadataFetch(objectNames) {
  // ❌ SEQUENTIAL (slow)
  // const results = [];
  // for (const obj of objectNames) {
  //   const metadata = await sf.metadata.read('CustomObject', obj);
  //   results.push(metadata);
  // }
  // Time: N × 500ms = 5 seconds for 10 objects

  // ✅ PARALLEL (fast)
  const promises = objectNames.map(obj =>
    sf.metadata.read('CustomObject', obj)
  );
  const results = await Promise.all(promises);
  // Time: max(500ms) = 500ms for 10 objects (10x faster!)

  return results;
}

// Usage
const objects = ['Account', 'Contact', 'Opportunity', 'Case', 'Lead'];
const metadata = await parallelMetadataFetch(objects);
console.log(`Fetched ${metadata.length} objects in parallel`);
```

### Example 3: Composite API (Reduce API Calls)

```javascript
async function compositeUpdate(accounts, contacts) {
  // ❌ SEQUENTIAL (slow)
  // await sf.update('Account', accounts);  // 1 API call
  // await sf.update('Contact', contacts);  // 1 API call
  // Total: 2 API calls, 2 network round trips

  // ✅ COMPOSITE (fast)
  const compositeRequest = {
    allOrNone: false,
    compositeRequest: [
      {
        method: 'PATCH',
        url: '/services/data/v62.0/composite/sobjects/Account',
        referenceId: 'updateAccounts',
        body: { records: accounts }
      },
      {
        method: 'PATCH',
        url: '/services/data/v62.0/composite/sobjects/Contact',
        referenceId: 'updateContacts',
        body: { records: contacts }
      }
    ]
  };

  const result = await sf.request({
    method: 'POST',
    url: '/services/data/v62.0/composite',
    body: compositeRequest
  });
  // Total: 1 API call, 1 network round trip (50% reduction)

  return result;
}
```

---

## Performance Benchmarks

### Benchmark 1: Update 1,000 Accounts

| Method | API Calls | Duration | Rate | Improvement |
|--------|-----------|----------|------|-------------|
| Sequential (loop) | 1,000 | 200s | 5 rec/s | Baseline |
| Batched (200/batch) | 5 | 1s | 1,000 rec/s | **200x faster** |
| Bulk API 2.0 | 1 | 10s | 100 rec/s | **20x faster** |

**Observation**: Batching is fastest for <10K records. Bulk API is best for >10K.

### Benchmark 2: Query 10 Objects Metadata

| Method | API Calls | Duration | Speedup |
|--------|-----------|----------|---------|
| Sequential | 10 | 5s | Baseline |
| Parallel (Promise.all) | 10 | 0.5s | **10x faster** |

**Observation**: Parallelism provides near-linear speedup for independent operations.

### Benchmark 3: Create Account + Contacts

| Method | API Calls | Duration | Notes |
|--------|-----------|----------|-------|
| Sequential | 2 | 1s | Account → then Contacts |
| Composite API | 1 | 0.5s | Account + Contacts in one call |

**Observation**: Composite API reduces network overhead significantly.

---

## Troubleshooting

### Issue: "Job failed with timeout error"

**Symptom**: Bulk API job fails with timeout.

**Causes**:
- Batch size too large (>10K records with many fields)
- Complex triggers/workflows on target object
- Validation rules causing slow processing

**Solutions**:
1. Reduce batch size to 5K or 2K records
2. Temporarily disable complex triggers (if safe)
3. Use serial concurrency mode (slower but more stable)
4. Profile triggers for performance issues

### Issue: "API limit exceeded"

**Symptom**: Error "REQUEST_LIMIT_EXCEEDED"

**Causes**:
- Too many individual API calls
- Not using batching
- Sequential processing

**Solutions**:
1. Implement batching (200 records per call)
2. Use Bulk API for >10K records
3. Monitor API usage: `sf limits api display`
4. Spread operations over time (not all at once)

### Issue: "Agent still processing sequentially"

**Symptom**: Agent uses loops despite bulk guidance

**Diagnosis**:
- Check agent logs for "for each" language
- Measure records/sec rate (<10 rec/sec = sequential)
- Review agent prompt for bulk tool mentions

**Solutions**:
1. Add explicit bulk tool to agent's tool list
2. Update agent prompt with batching examples
3. Add few-shot examples of bulk operations
4. Consider tool selection hints (see LLM Agent Strategies)

### Issue: "Partial failures in bulk job"

**Symptom**: Some records succeed, others fail

**Causes**:
- Validation rule failures
- Duplicate record detection
- Permission issues
- Data type mismatches

**Solutions**:
1. Retrieve failed results: `getFailedResults(jobId)`
2. Analyze error messages (group by error type)
3. Fix data issues and retry failed records
4. Consider validation bypass for migrations (with caution)

---

## Cross-References

### Related Documentation
- [PERFORMANCE_OPTIMIZATION_PLAYBOOK.md](./PERFORMANCE_OPTIMIZATION_PLAYBOOK.md) - Agent optimization patterns
- [OPTIMIZATION_CHECKLIST.md](./OPTIMIZATION_CHECKLIST.md) - Step-by-step optimization workflow
- [SEQUENTIAL_BIAS_AUDIT.md](./SEQUENTIAL_BIAS_AUDIT.md) - Systematic audit process

### Tools and Libraries
- `bulk-api-handler.js` - Smart API switching (sync/bulk)
- `batch-query-executor.js` - Batch SOQL queries with Composite API
- `async-bulk-ops.js` - Fire-and-forget bulk jobs
- `bulk-merge-executor-parallel.js` - Parallel merge execution

### Salesforce Documentation
- [Bulk API 2.0 Developer Guide](https://developer.salesforce.com/docs/atlas.en-us.api_asynch.meta/api_asynch/)
- [Composite REST API](https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/resources_composite.htm)
- [REST API Limits](https://developer.salesforce.com/docs/atlas.en-us.salesforce_app_limits_cheatsheet.meta/salesforce_app_limits_cheatsheet/)

---

## Appendix: Quick Reference Card

### When to Use Which API

```
< 10 records       → Standard API (individual calls)
10-200 records     → Standard API (loop)
200-10K records    → Standard API (batched, 200/batch)
> 10K records      → Bulk API 2.0
```

### Key Batching Limits

- **Standard API**: 200 records per batch
- **Bulk API 2.0**: 10,000 records per batch
- **Composite Batch**: 25 sub-requests
- **SOQL IN clause**: 4,000 values

### Performance Targets

- **Sequential**: 5-10 records/sec → ❌ Refactor required
- **Batched**: 100-500 records/sec → ✅ Good
- **Optimized**: 1,000+ records/sec → ✅ Excellent

### Agent Guidance Checklist

- [ ] Bulk tools exposed prominently
- [ ] Prompt mentions batching for >10 records
- [ ] Few-shot examples of bulk operations
- [ ] Tool selection hints by operation size
- [ ] Cost/iteration limits to incentivize batching

---

**Version**: 1.0.0
**Last Updated**: 2025-10-19
**Maintained By**: Salesforce Plugin Team
**Feedback**: Submit issues via `/reflect` command
