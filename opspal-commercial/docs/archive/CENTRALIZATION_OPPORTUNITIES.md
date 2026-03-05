# Centralization Opportunities - OpsPal Plugin Marketplace

**Date**: 2025-10-19
**Status**: 📋 Documented for Future Review
**Analysis Scope**: 8 plugins, 512+ scripts, 100+ agents

---

## Executive Summary

Analysis of the OpsPal plugin marketplace reveals **10 major centralization opportunities** that would eliminate significant code duplication, improve consistency, and enhance maintainability. These opportunities span authentication, caching, logging, error handling, observability, and API client management.

**Key Findings**:
- **8,395 logging calls** with no centralized logging service
- **1,418 caching patterns** using inconsistent strategies
- **943 error handling blocks** without standard taxonomy
- **487 HubSpot API calls** with no unified client
- **180 retry logic patterns** each implementing their own backoff
- **25+ monitoring scripts** creating fragmented observability
- **2 nearly identical metadata cache implementations** (Salesforce vs HubSpot)
- **13 Salesforce connection patterns** duplicated across scripts
- **10 separate API client classes** with inconsistent interfaces

**Expected ROI**:
- **Time Savings**: 300+ hours annually ($45,000-$60,000 value)
- **Code Reduction**: 60%+ reduction in boilerplate
- **Quality Improvement**: Consistent patterns across all plugins
- **Maintainability**: 10 centralized services vs 50+ duplicated patterns

---

## Analysis Metrics

### Duplication Counts

| Category | Count | Impact |
|----------|-------|--------|
| Logging calls (console.log/error) | 8,395 | No structured logs, no trace IDs |
| Caching patterns | 1,418 | Inconsistent TTL, eviction strategies |
| Error handling blocks (try/catch) | 943 | Different error formats per script |
| HubSpot API calls | 487 | No rate limiting, auth duplication |
| Retry logic patterns | 180 | Each implements own exponential backoff |
| Monitoring/telemetry scripts | 25+ | Fragmented, no unified dashboard |
| Metadata-related scripts | 20 | Just in Salesforce plugin alone |
| Salesforce connection patterns | 13 | Repeated `sf org display` calls |
| API client classes | 10 | Inconsistent interfaces |

### Current State

**Strengths**:
- ✅ Report generation centralized (report_service)
- ✅ Record matching centralized (record-match-merge-service)
- ✅ Service registry exists (central_services.json)
- ✅ Routing policy defined (routing_policy.json)

**Gaps**:
- ❌ No centralized authentication service
- ❌ No centralized logging/telemetry
- ❌ No centralized caching strategy
- ❌ No centralized error handling
- ❌ No unified API client factory
- ❌ Monitoring scripts scattered across plugins

---

## Priority 1: High-Impact Services 🔥

### 1. Unified Metadata Cache Service

**Problem**: Two nearly identical implementations with 758 total lines of code
- `.claude-plugins/opspal-salesforce/scripts/lib/field-metadata-cache.js` (433 lines)
- `.claude-plugins/opspal-hubspot/scripts/lib/hubspot-metadata-cache.js` (325 lines)

**Impact**:
- Eliminate 400+ lines of duplicate code
- Single cache strategy across all platforms
- Consistent TTL and eviction policies
- 80%+ cache hit rate target

**Proposed Service**: `metadata-cache-service.js`

**Location**: `.claude-plugins/developer-tools-plugin/scripts/lib/metadata-cache-service.js`

**Key Features**:
- Platform-agnostic LRU cache with TTL
- Support for Salesforce fields, HubSpot properties, custom objects
- Multi-tier caching (memory → disk → remote optional)
- Cache statistics dashboard (hit rate, miss rate, evictions)
- Automatic expiry and cleanup

**Contract**:
```javascript
class MetadataCacheService {
  constructor(options = {}) {
    // options: { platform, maxSize, ttl, enableDisk }
  }

  get(key, options = {}) {
    // Returns: cached value or undefined
    // Options: { skipExpired, updateAccessTime }
  }

  set(key, value, options = {}) {
    // Options: { ttl, priority }
  }

  has(key) {
    // Returns: boolean (exists and not expired)
  }

  delete(key) {
    // Returns: boolean (was deleted)
  }

  clear(options = {}) {
    // Options: { platform, olderThan }
  }

  getStats() {
    // Returns: { hits, misses, hitRate, size, evictions }
  }

  warmCache(keysOrQuery) {
    // Pre-populate cache for common queries
  }
}
```

**Deprecates**:
- `.claude-plugins/opspal-salesforce/scripts/lib/field-metadata-cache.js`
- `.claude-plugins/opspal-hubspot/scripts/lib/hubspot-metadata-cache.js`
- `.claude-plugins/opspal-salesforce/scripts/lib/org-metadata-cache.js`

**Complexity**: Medium (3-4 days)

**Dependencies**: None

---

### 2. Centralized Authentication Service

**Problem**: Authentication duplicated across 500+ scripts
- 13 Salesforce patterns (`sf org display`, jsforce connection)
- 487 HubSpot API calls (axios with manual token handling)
- No connection pooling or reuse

**Impact**:
- Single authentication flow per platform
- Connection pooling (reuse existing connections)
- Automatic token refresh
- Rate limit awareness
- 50%+ reduction in auth-related code

**Proposed Service**: `platform-auth-service.js`

**Location**: `.claude-plugins/developer-tools-plugin/scripts/lib/platform-auth-service.js`

**Key Features**:
- Multi-platform support (Salesforce, HubSpot, Supabase)
- Connection pooling with automatic expiry
- Token refresh before expiry (proactive)
- Rate limit tracking per platform
- Health checks (connection valid?)

**Contract**:
```javascript
class PlatformAuthService {
  async getConnection(platform, alias) {
    // Returns: authenticated connection/client
    // Platforms: 'salesforce', 'hubspot', 'supabase'
  }

  async authenticate(platform, credentials) {
    // Manual authentication (for setup)
  }

  async refreshToken(platform, alias) {
    // Force token refresh
  }

  isAuthenticated(platform, alias) {
    // Check if valid connection exists
  }

  getConnectionStats(platform, alias) {
    // Returns: { created, lastUsed, expiresAt, requestCount }
  }

  clearConnections(platform) {
    // Close all connections for platform
  }
}
```

**Usage Example**:
```javascript
const authService = new PlatformAuthService();

// Instead of: execSync(`sf org display --target-org ${orgAlias} --json`)
const sfConnection = await authService.getConnection('salesforce', orgAlias);
const result = await sfConnection.query('SELECT Id FROM Account LIMIT 10');

// Instead of: axios.create({ headers: { Authorization: `Bearer ${token}` } })
const hsClient = await authService.getConnection('hubspot', portalName);
const contacts = await hsClient.getContacts({ limit: 100 });
```

**Deprecates**:
- All inline `sf org display` calls
- All `axios.create()` patterns with auth headers
- All manual token refresh logic

**Complexity**: Large (5-7 days)

**Dependencies**: logging-service (for connection tracking)

---

### 3. Structured Logging Service

**Problem**: 8,395 logging calls with no centralization
- Mix of `console.log`, `console.error`, `console.warn`
- No structured format (difficult to parse/analyze)
- No log levels or filtering
- No trace IDs for request correlation
- No integration with observability tools

**Impact**:
- Consistent log format across all plugins
- Structured logs (JSON) for analysis
- Log levels (debug, info, warn, error, fatal)
- Trace IDs automatically injected
- Integration with telemetry dashboard

**Proposed Service**: `logging-service.js`

**Location**: `.claude-plugins/developer-tools-plugin/scripts/lib/logging-service.js`

**Key Features**:
- Structured logging (JSON format)
- Log levels with filtering
- Automatic trace ID injection
- Multiple outputs (stdout, file, remote)
- Performance tracking (log with duration)
- PII masking for sensitive data

**Contract**:
```javascript
class LoggingService {
  constructor(options = {}) {
    // options: { level, outputs, maskPII, traceId }
  }

  debug(message, context = {}) {
    // Debug-level logs (verbose)
  }

  info(message, context = {}) {
    // Info-level logs (normal operations)
  }

  warn(message, context = {}, error = null) {
    // Warning-level logs (potential issues)
  }

  error(message, context = {}, error = null) {
    // Error-level logs (failures)
  }

  fatal(message, context = {}, error = null) {
    // Fatal-level logs (system failures)
  }

  startOperation(operationName, context = {}) {
    // Returns: operationId for tracking duration
  }

  endOperation(operationId, context = {}) {
    // Logs operation completion with duration
  }

  setTraceId(traceId) {
    // Set trace ID for current context
  }

  child(context = {}) {
    // Create child logger with additional context
  }
}
```

**Usage Example**:
```javascript
const logger = new LoggingService({ level: 'info', maskPII: true });

// Instead of: console.log('Starting metadata retrieval')
logger.info('Starting metadata retrieval', {
  org: 'delta-corp',
  objectType: 'Account',
  fieldCount: 47
});

// Instead of: console.error('Query failed:', error)
logger.error('Query failed', {
  org: 'delta-corp',
  query: 'SELECT Id FROM Account',
  retryCount: 3
}, error);

// Track operation duration
const opId = logger.startOperation('bulk_merge', { pairCount: 150 });
await executeBulkMerge();
logger.endOperation(opId, { successCount: 148, failureCount: 2 });
```

**Log Format**:
```json
{
  "timestamp": "2025-10-19T14:32:01.234Z",
  "level": "info",
  "message": "Starting metadata retrieval",
  "traceId": "abc123",
  "context": {
    "org": "delta-corp",
    "objectType": "Account",
    "fieldCount": 47
  },
  "plugin": "salesforce-plugin",
  "script": "metadata-analyzer.js"
}
```

**Deprecates**:
- All `console.log` calls
- All `console.error` calls
- All `console.warn` calls
- Custom logging utilities in individual scripts

**Complexity**: Medium (3-4 days)

**Dependencies**: None

---

## Priority 2: Quality-of-Life Services

### 4. Retry & Circuit Breaker Service

**Problem**: 180 retry patterns, each implementing exponential backoff differently
- Inconsistent retry counts (2, 3, 5, 10)
- Different backoff strategies (linear, exponential, jitter)
- No circuit breaker pattern for failing services
- Duplicate code across all API-calling scripts

**Impact**:
- Consistent retry policies across all operations
- Circuit breaker prevents cascading failures
- Automatic failure detection and recovery
- 90%+ reduction in retry logic code

**Proposed Service**: `resilience-service.js`

**Location**: `.claude-plugins/developer-tools-plugin/scripts/lib/resilience-service.js`

**Key Features**:
- Configurable retry strategies (immediate, linear, exponential, exponential-jitter)
- Circuit breaker pattern (closed, open, half-open)
- Per-operation policies (query: 3 retries, deploy: 5 retries)
- Failure tracking and metrics
- Integration with logging-service

**Contract**:
```javascript
class ResilienceService {
  async executeWithRetry(operation, options = {}) {
    // operation: async function to execute
    // options: { maxRetries, strategy, backoffMs, shouldRetry }
    // Returns: operation result or throws after max retries
  }

  async executeWithCircuitBreaker(serviceId, operation, options = {}) {
    // Circuit breaker wrapper
    // options: { failureThreshold, resetTimeout, halfOpenRequests }
  }

  getCircuitState(serviceId) {
    // Returns: 'closed' | 'open' | 'half-open'
  }

  resetCircuit(serviceId) {
    // Manually reset circuit breaker
  }

  getStats(serviceId) {
    // Returns: { state, failures, successes, lastFailure }
  }
}
```

**Usage Example**:
```javascript
const resilience = new ResilienceService();

// Instead of: manual try/catch with sleep
const result = await resilience.executeWithRetry(
  async () => {
    return await sfConnection.query('SELECT Id FROM Account');
  },
  {
    maxRetries: 3,
    strategy: 'exponential',
    backoffMs: 1000,
    shouldRetry: (error) => error.code === 'ECONNRESET'
  }
);

// Circuit breaker for external service
const apiResult = await resilience.executeWithCircuitBreaker(
  'hubspot-api',
  async () => {
    return await hubspotClient.getContacts();
  },
  { failureThreshold: 5, resetTimeout: 60000 }
);
```

**Deprecates**:
- All manual retry loops
- All `sleep()` + retry patterns
- Scattered error recovery logic

**Complexity**: Medium (3-4 days)

**Dependencies**: logging-service

---

### 5. Unified API Client Factory

**Problem**: 10 separate API client classes with inconsistent patterns
- Different error handling per client
- No standard rate limiting
- Inconsistent retry logic
- Duplicate authentication code

**Impact**:
- One factory for all platform clients
- Consistent error handling and retries
- Automatic rate limiting per platform
- Simplified client creation

**Proposed Service**: `api-client-factory.js`

**Location**: `.claude-plugins/developer-tools-plugin/scripts/lib/api-client-factory.js`

**Key Features**:
- Creates platform-specific clients (Salesforce, HubSpot, Supabase)
- Automatic integration with auth-service, resilience-service, logging-service
- Built-in rate limiting per platform (HubSpot: 100 req/10s, Salesforce: per-org limits)
- Consistent error handling
- Request/response logging

**Contract**:
```javascript
class APIClientFactory {
  createClient(platform, alias, options = {}) {
    // Returns: platform-specific client
    // Platforms: 'salesforce', 'hubspot', 'supabase'
    // Options: { rateLimit, timeout, retryPolicy }
  }

  getClientStats(platform, alias) {
    // Returns: { requests, errors, rateLimitHits, avgLatency }
  }
}

// Platform-specific clients returned
class SalesforceClient {
  async query(soql, options = {}) { }
  async queryMore(queryLocator) { }
  async describe(objectType) { }
  async create(objectType, records) { }
  async update(objectType, records) { }
  async delete(objectType, ids) { }
}

class HubSpotClient {
  async getContacts(options = {}) { }
  async getCompanies(options = {}) { }
  async getDeals(options = {}) { }
  async createContact(data) { }
  async updateContact(id, data) { }
  async deleteContact(id) { }
}
```

**Usage Example**:
```javascript
const factory = new APIClientFactory();

// Instead of: manual client creation
const sf = factory.createClient('salesforce', 'delta-corp', {
  rateLimit: { requests: 100, perMs: 1000 },
  timeout: 30000
});

const accounts = await sf.query('SELECT Id, Name FROM Account LIMIT 100');
```

**Deprecates**:
- All inline client creation
- Scattered rate limiting logic
- Manual error handling per API call

**Complexity**: Large (5-7 days)

**Dependencies**: platform-auth-service, resilience-service, logging-service

---

### 6. Error Handling Service

**Problem**: 943 try/catch blocks with different error formats
- No standard error taxonomy
- Inconsistent error messages
- No retryable flag
- Difficult to aggregate errors

**Impact**:
- Structured error taxonomy (categories, severity)
- Consistent error responses
- Retryable detection
- Error tracking and metrics

**Proposed Service**: `error-handler-service.js`

**Location**: `.claude-plugins/developer-tools-plugin/scripts/lib/error-handler-service.js`

**Key Features**:
- Error categories (AUTH, RATE_LIMIT, VALIDATION, NETWORK, PLATFORM, UNKNOWN)
- Error severity (LOW, MEDIUM, HIGH, CRITICAL)
- Retryable detection
- User-friendly messages vs technical messages
- Integration with logging-service

**Contract**:
```javascript
class ErrorHandlerService {
  handleError(error, context = {}) {
    // Converts error to structured format
    // Returns: StructuredError
  }

  isRetryable(error) {
    // Returns: boolean
  }

  getUserMessage(error) {
    // Returns: user-friendly error message
  }

  getTechnicalMessage(error) {
    // Returns: technical error details
  }

  logError(error, context = {}) {
    // Log error with full context
  }
}

class StructuredError extends Error {
  constructor(message, options = {}) {
    // options: { category, severity, retryable, cause, context }
  }
}
```

**Error Categories**:
```javascript
const ErrorCategories = {
  AUTH_ERROR: 'AUTH_ERROR',           // Authentication failures
  RATE_LIMIT: 'RATE_LIMIT',           // API rate limits exceeded
  VALIDATION_ERROR: 'VALIDATION_ERROR', // Input validation failures
  NETWORK_ERROR: 'NETWORK_ERROR',     // Connection issues
  PLATFORM_ERROR: 'PLATFORM_ERROR',   // Salesforce/HubSpot errors
  DATA_ERROR: 'DATA_ERROR',           // Data quality issues
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',     // Operation timeouts
  PERMISSION_ERROR: 'PERMISSION_ERROR', // Permission denied
  NOT_FOUND_ERROR: 'NOT_FOUND_ERROR', // Resource not found
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'      // Unclassified errors
};
```

**Usage Example**:
```javascript
const errorHandler = new ErrorHandlerService();

try {
  await sfConnection.query(soql);
} catch (error) {
  const structured = errorHandler.handleError(error, {
    operation: 'query',
    org: 'delta-corp',
    soql
  });

  if (errorHandler.isRetryable(structured)) {
    // Retry logic
  } else {
    errorHandler.logError(structured);
    throw structured;
  }
}
```

**Deprecates**:
- All custom error handling
- Inconsistent error messages
- Manual retryable detection

**Complexity**: Medium (3-4 days)

**Dependencies**: logging-service

---

## Priority 3: Observability & Operations

### 7. Centralized Observability Service

**Problem**: 25+ monitoring scripts scattered across plugins
- `.claude-plugins/opspal-salesforce/scripts/monitoring/` (6 scripts)
- `.claude-plugins/opspal-salesforce/scripts/*-monitor.js` (12 scripts)
- `.claude-plugins/opspal-salesforce/scripts/lib/*-monitor.js` (4 scripts)
- `.claude-plugins/developer-tools-plugin/scripts/lib/routing-telemetry-dashboard.js`
- No unified dashboard, fragmented metrics

**Impact**:
- Single dashboard for all metrics
- Consistent telemetry format
- Real-time health checks
- Cross-service correlation

**Proposed Service**: `observability-service.js`

**Location**: `.claude-plugins/developer-tools-plugin/scripts/lib/observability-service.js`

**Key Features**:
- Unified metrics collection (operation counts, latency, errors)
- Health checks (service status, connection pools, cache hit rates)
- Dashboard consolidation (replaces 25+ separate scripts)
- Alerting (threshold-based)
- Trend analysis

**Contract**:
```javascript
class ObservabilityService {
  recordMetric(metricName, value, context = {}) {
    // Record metric value
  }

  recordLatency(operationName, durationMs, context = {}) {
    // Record operation latency
  }

  recordError(errorType, context = {}) {
    // Record error occurrence
  }

  getHealthStatus(service = null) {
    // Returns: { status, checks, metrics }
  }

  getDashboard(options = {}) {
    // Returns: formatted dashboard data
    // Options: { timeRange, services, format }
  }

  getMetricSummary(metricName, timeRange = '1h') {
    // Returns: { count, min, max, avg, p50, p95, p99 }
  }
}
```

**Dashboard Features**:
- Real-time metrics (requests/sec, errors/sec, latency)
- Service health (green/yellow/red status)
- Cache performance (hit rates, evictions)
- Connection pool status (active, idle, max)
- Top errors (by frequency)
- Slowest operations (by p99 latency)

**Deprecates**:
- All monitoring scripts in `.claude-plugins/opspal-salesforce/scripts/monitoring/`
- All standalone `*-monitor.js` scripts
- `routing-telemetry-dashboard.js` (extends instead)

**Complexity**: Large (5-7 days)

**Dependencies**: logging-service, metadata-cache-service

---

### 8. Validation Service

**Problem**: Schema validation duplicated across multiple scripts
- Different validation logic per script
- No reusable validation schemas
- Inconsistent error messages
- Manual validation in 100+ places

**Impact**:
- Single source of truth for validation rules
- Consistent error messages
- Reusable validation schemas
- Integration with error-handler-service

**Proposed Service**: `validation-service.js`

**Location**: `.claude-plugins/developer-tools-plugin/scripts/lib/validation-service.js`

**Key Features**:
- Schema-based validation (JSON Schema)
- Built-in validators (email, phone, URL, SOQL, object names)
- Custom validator registration
- Detailed error messages
- Integration with error-handler-service

**Contract**:
```javascript
class ValidationService {
  validate(data, schema, options = {}) {
    // Validate data against schema
    // Returns: { valid, errors, warnings }
  }

  validateField(value, fieldType, options = {}) {
    // Validate single field
    // fieldType: 'email', 'phone', 'url', 'soql', etc.
  }

  registerValidator(name, validatorFn) {
    // Register custom validator
  }

  getSchema(schemaName) {
    // Returns: JSON Schema
  }
}
```

**Built-in Validators**:
```javascript
const Validators = {
  email: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
  phone: (value) => /^\+?[1-9]\d{1,14}$/.test(value),
  url: (value) => URL.canParse(value),
  soql: (value) => validateSOQLSyntax(value),
  objectName: (value) => /^[A-Z][a-zA-Z0-9_]*(__c)?$/.test(value),
  fieldName: (value) => /^[A-Za-z][a-zA-Z0-9_]*(__c)?$/.test(value),
  recordId: (value) => /^[a-zA-Z0-9]{15,18}$/.test(value)
};
```

**Usage Example**:
```javascript
const validator = new ValidationService();

const result = validator.validate(request, {
  type: 'object',
  required: ['report_type', 'audience'],
  properties: {
    report_type: { type: 'string', enum: ['exec_update', 'audit'] },
    audience: { type: 'string', enum: ['exec', 'engineering'] }
  }
});

if (!result.valid) {
  throw new ValidationError('Invalid request', { errors: result.errors });
}
```

**Deprecates**:
- All inline validation logic
- Scattered schema definitions
- Manual validation in scripts

**Complexity**: Medium (3-4 days)

**Dependencies**: error-handler-service

---

## Priority 4: Advanced Features

### 9. Query Result Cache Service

**Problem**: 1,418 caching patterns beyond metadata (query results, API responses)
- No consistent caching strategy for query results
- Repeated queries waste API calls
- No cache warming for common queries
- No multi-tier caching

**Impact**:
- Multi-tier caching (memory → disk → remote)
- Automatic cache warming for common queries
- Cache invalidation strategies
- 70%+ reduction in redundant API calls

**Proposed Service**: `query-cache-service.js`

**Location**: `.claude-plugins/developer-tools-plugin/scripts/lib/query-cache-service.js`

**Key Features**:
- Multi-tier caching (L1: memory, L2: disk, L3: remote optional)
- Query result caching (Salesforce SOQL, HubSpot searches, Supabase)
- Automatic cache key generation (query hash + params)
- TTL by query type (metadata: 1h, records: 5m, reports: 30m)
- Cache warming (pre-populate common queries)
- Invalidation strategies (time-based, event-based, manual)

**Contract**:
```javascript
class QueryCacheService {
  async get(query, options = {}) {
    // Returns: cached result or undefined
    // Options: { platform, tier, skipExpired }
  }

  async set(query, result, options = {}) {
    // Cache query result
    // Options: { platform, ttl, tier }
  }

  generateCacheKey(query, params = {}) {
    // Returns: cache key hash
  }

  async warmCache(queries) {
    // Pre-populate cache with common queries
  }

  invalidate(pattern) {
    // Invalidate cache entries matching pattern
  }

  getStats() {
    // Returns: { l1Hits, l2Hits, l3Hits, misses, size }
  }
}
```

**Usage Example**:
```javascript
const queryCache = new QueryCacheService();

// Check cache first
const cacheKey = queryCache.generateCacheKey(soql, { org: 'delta-corp' });
let result = await queryCache.get(cacheKey, { platform: 'salesforce' });

if (!result) {
  result = await sfConnection.query(soql);
  await queryCache.set(cacheKey, result, { platform: 'salesforce', ttl: 300000 });
}
```

**Cache Tiers**:
- **L1 (Memory)**: Fast (< 1ms), limited size (100MB), process-local
- **L2 (Disk)**: Medium (< 10ms), larger size (1GB), persistent
- **L3 (Remote)**: Slow (< 100ms), unlimited size, shared across processes

**Deprecates**:
- All inline query result caching
- Repeated query patterns
- Manual cache key generation

**Complexity**: Large (5-7 days)

**Dependencies**: metadata-cache-service, logging-service

---

### 10. Telemetry Aggregation Service

**Problem**: Decision logs, routing logs, performance logs all separate
- `routing_decisions.jsonl` (routing only)
- `operation_logs.jsonl` (operations only)
- `performance_metrics.jsonl` (performance only)
- No cross-service correlation
- No trend analysis or anomaly detection

**Impact**:
- Single telemetry pipeline
- Cross-service correlation (by trace_id, session_id)
- Trend analysis (weekly summaries)
- Anomaly detection (automatic alerts)

**Proposed Service**: `telemetry-aggregator-service.js`

**Location**: `.claude-plugins/developer-tools-plugin/scripts/lib/telemetry-aggregator-service.js`

**Key Features**:
- Unified telemetry ingestion (routing, operations, performance)
- Correlation by trace_id and session_id
- Trend analysis (hourly, daily, weekly summaries)
- Anomaly detection (statistical outliers)
- Report generation (weekly summaries, top issues)

**Contract**:
```javascript
class TelemetryAggregatorService {
  ingest(telemetryType, data) {
    // Ingest telemetry data
    // Types: 'routing', 'operation', 'performance', 'error'
  }

  correlate(traceId) {
    // Returns: all telemetry for trace_id
  }

  getTrends(options = {}) {
    // Returns: trend data
    // Options: { metric, timeRange, aggregation }
  }

  detectAnomalies(options = {}) {
    // Returns: detected anomalies
    // Options: { metric, sensitivity, timeRange }
  }

  generateReport(reportType, options = {}) {
    // Generate summary report
    // Types: 'weekly', 'monthly', 'custom'
  }
}
```

**Telemetry Schema**:
```javascript
{
  timestamp: '2025-10-19T14:32:01.234Z',
  type: 'routing' | 'operation' | 'performance' | 'error',
  traceId: 'abc123',
  sessionId: 'xyz789',
  data: {
    // Type-specific data
  }
}
```

**Deprecates**:
- Separate log files (routing_decisions.jsonl, operation_logs.jsonl)
- Manual log correlation
- Scattered analytics scripts

**Complexity**: Large (7-10 days)

**Dependencies**: logging-service, observability-service

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1)
**Goal**: Build core infrastructure services

**Tasks**:
1. Build `metadata-cache-service.js` (Priority 1.1)
   - Platform-agnostic LRU cache with TTL
   - Support Salesforce + HubSpot metadata
   - Cache statistics dashboard
   - **Deliverable**: Service + tests + migration guide

2. Build `platform-auth-service.js` (Priority 1.2)
   - Multi-platform authentication (Salesforce, HubSpot, Supabase)
   - Connection pooling
   - Token refresh
   - **Deliverable**: Service + tests + migration guide

3. Build `logging-service.js` (Priority 1.3)
   - Structured logging (JSON format)
   - Log levels and filtering
   - Trace ID injection
   - **Deliverable**: Service + tests + migration guide

4. Wire 4 report-generating agents to new services
   - Update agent prompts with new service usage
   - Test service integration
   - **Deliverable**: Updated agents + verification script

**Success Criteria**:
- All 3 services built and tested
- 80%+ test coverage
- 4 agents successfully using new services
- Documentation complete

---

### Phase 2: Resilience (Week 2)
**Goal**: Add error handling and retry capabilities

**Tasks**:
1. Build `resilience-service.js` (Priority 2.4)
   - Retry strategies (exponential backoff)
   - Circuit breaker pattern
   - Failure tracking
   - **Deliverable**: Service + tests + migration guide

2. Build `api-client-factory.js` (Priority 2.5)
   - Platform-specific client creation
   - Integration with auth-service, resilience-service
   - Rate limiting
   - **Deliverable**: Service + tests + migration guide

3. Build `error-handler-service.js` (Priority 2.6)
   - Structured error taxonomy
   - Retryable detection
   - User-friendly messages
   - **Deliverable**: Service + tests + migration guide

4. Update all API-calling scripts
   - Replace manual retry logic with resilience-service
   - Replace inline client creation with api-client-factory
   - **Deliverable**: Updated scripts + verification

**Success Criteria**:
- All 3 services built and tested
- 50+ scripts updated to use new services
- Error handling consistent across plugins
- Retry logic standardized

---

### Phase 3: Observability (Week 3)
**Goal**: Consolidate monitoring and validation

**Tasks**:
1. Build `observability-service.js` (Priority 3.7)
   - Unified metrics collection
   - Health checks
   - Dashboard consolidation
   - **Deliverable**: Service + tests + unified dashboard

2. Build `validation-service.js` (Priority 3.8)
   - Schema-based validation
   - Built-in validators
   - Custom validator registration
   - **Deliverable**: Service + tests + migration guide

3. Consolidate 25+ monitoring scripts
   - Replace separate monitoring scripts with observability-service
   - Migrate routing-telemetry-dashboard to unified dashboard
   - **Deliverable**: Single dashboard + migration guide

**Success Criteria**:
- All monitoring consolidated into single service
- 1 unified dashboard replaces 25+ scripts
- Validation consistent across plugins
- Health checks automated

---

### Phase 4: Advanced (Week 4)
**Goal**: Add advanced caching and telemetry

**Tasks**:
1. Build `query-cache-service.js` (Priority 4.9)
   - Multi-tier caching (memory, disk, remote)
   - Query result caching
   - Cache warming
   - **Deliverable**: Service + tests + migration guide

2. Build `telemetry-aggregator-service.js` (Priority 4.10)
   - Unified telemetry pipeline
   - Cross-service correlation
   - Trend analysis and anomaly detection
   - **Deliverable**: Service + tests + weekly reports

3. Generate migration guide for all deprecated patterns
   - Document all deprecated files and patterns
   - Provide migration examples
   - Update CLAUDE.md with new service references
   - **Deliverable**: Comprehensive migration guide

**Success Criteria**:
- All 10 services implemented
- Query result caching reduces API calls by 70%+
- Telemetry aggregation provides single source of truth
- Migration guide complete

---

## Expected ROI

### Time Savings

**Development Time**:
- **Before**: 2 hours/week writing boilerplate (auth, retry, logging)
- **After**: 15 min/week (service configuration only)
- **Savings**: ~90 hours/year

**Debugging Time**:
- **Before**: 3 hours/week debugging scattered logs, auth issues
- **After**: 30 min/week (unified dashboard + structured logs)
- **Savings**: ~130 hours/year

**Monitoring Setup**:
- **Before**: 1 hour/week maintaining 25+ monitoring scripts
- **After**: 10 min/week (single dashboard)
- **Savings**: ~43 hours/year

**Code Review**:
- **Before**: 1 hour/week reviewing duplicated patterns
- **After**: 15 min/week (services already reviewed)
- **Savings**: ~39 hours/year

**Total Annual Savings**: 300+ hours ($45,000-$60,000 value at $150-200/hour)

---

### Code Quality Improvements

**Before Centralization**:
- 8,395 logging calls (inconsistent format)
- 943 error handling blocks (different formats)
- 180 retry patterns (each custom)
- 50+ duplicated patterns

**After Centralization**:
- Single logging service (structured JSON)
- Consistent error taxonomy across all plugins
- Unified retry logic (3 strategies)
- 10 centralized services

**Metrics**:
- **Code Duplication**: 60%+ reduction
- **Consistency**: 100% (all services follow same contract pattern)
- **Test Coverage**: 80%+ for all centralized services
- **Maintainability**: 1 place to update vs 50+ places

---

### Maintainability Improvements

**Before**:
- Update retry logic → 180 files to change
- Fix auth bug → 13 Salesforce patterns + 487 HubSpot calls
- Change log format → 8,395 calls to update
- Add monitoring → Create new script + wire it up

**After**:
- Update retry logic → 1 file (resilience-service.js)
- Fix auth bug → 1 file (platform-auth-service.js)
- Change log format → 1 file (logging-service.js)
- Add monitoring → Configure observability-service

**Maintenance Velocity**: 10x faster for cross-cutting concerns

---

## Migration Strategy

### Option A: Big Bang Migration (Recommended)

**Approach**:
1. Implement all 10 services (Phase 1-4)
2. Update all affected scripts in single PR
3. Deprecate old patterns immediately
4. Run comprehensive verification suite

**Pros**:
- Clean break, no hybrid state
- Immediate consistency gains
- Easier to track adoption (100% or 0%)

**Cons**:
- Larger initial implementation effort
- Higher risk of breaking changes
- Requires comprehensive testing

**Timeline**: 4 weeks (Phases 1-4)

---

### Option B: Gradual Rollout

**Approach**:
1. Implement services one phase at a time
2. Allow new services to coexist with old patterns
3. Gradual migration script by script
4. Deprecate old patterns after 80%+ adoption

**Pros**:
- Lower risk (can roll back per service)
- Incremental value delivery
- Easier to test each service independently

**Cons**:
- Hybrid state (both old and new patterns)
- Slower consistency gains
- More complex to track adoption

**Timeline**: 8-12 weeks (gradual adoption)

---

### Option C: Pilot Program

**Approach**:
1. Implement Phase 1 services only (metadata-cache, auth, logging)
2. Migrate 10-20 high-impact scripts
3. Monitor for 2 weeks, gather feedback
4. Decide whether to proceed with Phases 2-4

**Pros**:
- Lowest risk (small initial scope)
- Early validation of approach
- Can refine service contracts based on feedback

**Cons**:
- Slowest overall timeline
- Hybrid state for longer period
- May not see full ROI until later phases

**Timeline**: 6-8 weeks (pilot + decision + full rollout)

---

### Recommendation: **Option C (Pilot Program)**

**Rationale**:
- Lowest risk for large-scale architectural change
- Validates service contract design before full commitment
- Allows refinement based on real-world usage
- Still delivers significant value (Phase 1 = 40% of total ROI)

**Pilot Success Criteria**:
- 80%+ cache hit rate (metadata-cache-service)
- 50%+ reduction in auth-related code (platform-auth-service)
- 100% structured logs (logging-service)
- Positive developer feedback (ease of use, consistency)

---

## Service Contracts - Quick Reference

### Service Registry Structure

```json
{
  "version": 2,
  "updated": "2025-10-19",
  "services": [
    {
      "name": "metadata_cache_service",
      "version": "1.0.0",
      "status": "proposed",
      "priority": "P1",
      "contract": { ... }
    },
    {
      "name": "platform_auth_service",
      "version": "1.0.0",
      "status": "proposed",
      "priority": "P1",
      "contract": { ... }
    },
    ...
  ]
}
```

### Service Status States
- `proposed` - Documented but not implemented
- `development` - Implementation in progress
- `testing` - Implementation complete, testing in progress
- `production` - Live and available for use
- `deprecated` - Marked for removal

---

## Deprecation List

### Files to Be Replaced

**Phase 1 Deprecations**:
- `.claude-plugins/opspal-salesforce/scripts/lib/field-metadata-cache.js` → metadata-cache-service
- `.claude-plugins/opspal-hubspot/scripts/lib/hubspot-metadata-cache.js` → metadata-cache-service
- `.claude-plugins/opspal-salesforce/scripts/lib/org-metadata-cache.js` → metadata-cache-service
- All inline `sf org display` calls → platform-auth-service
- All `axios.create()` patterns → platform-auth-service
- All `console.log/error/warn` calls → logging-service

**Phase 2 Deprecations**:
- All manual retry loops → resilience-service
- All inline client creation → api-client-factory
- All custom error handling → error-handler-service

**Phase 3 Deprecations**:
- All monitoring scripts in `.claude-plugins/opspal-salesforce/scripts/monitoring/` → observability-service
- All standalone `*-monitor.js` scripts → observability-service
- All inline validation logic → validation-service

**Phase 4 Deprecations**:
- All inline query result caching → query-cache-service
- Separate log files (routing_decisions.jsonl, operation_logs.jsonl) → telemetry-aggregator-service

---

## Success Criteria

### Phase 1 Success (Foundation)
- [ ] metadata-cache-service achieving 80%+ hit rate
- [ ] platform-auth-service reducing auth code by 50%+
- [ ] logging-service handling 100% of log calls
- [ ] 4 agents successfully using new services
- [ ] 80%+ test coverage for all 3 services

### Phase 2 Success (Resilience)
- [ ] resilience-service handling 100% of retry logic
- [ ] api-client-factory creating all platform clients
- [ ] error-handler-service providing consistent error taxonomy
- [ ] 50+ scripts migrated to new services
- [ ] Retry patterns standardized across plugins

### Phase 3 Success (Observability)
- [ ] Single unified dashboard replacing 25+ monitoring scripts
- [ ] observability-service tracking all service metrics
- [ ] validation-service handling 100% of validation logic
- [ ] Health checks automated for all services

### Phase 4 Success (Advanced)
- [ ] query-cache-service reducing API calls by 70%+
- [ ] telemetry-aggregator-service providing single source of truth
- [ ] Weekly telemetry reports generated automatically
- [ ] Anomaly detection alerting on outliers

### Overall Success
- [ ] 300+ hours annual time savings achieved
- [ ] 60%+ reduction in boilerplate code
- [ ] 100% consistency across plugins
- [ ] Positive developer feedback (NPS 8+)
- [ ] Zero service-related outages after migration

---

## Conclusion

The 10 centralization opportunities identified represent significant value:
- **$45,000-$60,000 annual ROI** from time savings
- **60%+ reduction in code duplication**
- **Consistent patterns across all 8 plugins**
- **10x faster maintenance velocity**

**Recommended Next Step**: Implement **Phase 1 (Foundation)** as a pilot program to validate the approach before committing to full rollout.

---

**Document Version**: 1.0
**Last Updated**: 2025-10-19
**Status**: 📋 For Review
**Contact**: RevPal Engineering
