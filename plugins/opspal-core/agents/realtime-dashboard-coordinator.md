---
name: realtime-dashboard-coordinator
description: "Coordinates real-time dashboard updates via WebSocket connections."
color: indigo
model: sonnet
version: 1.0.0
tools:
  - Read
  - Write
  - Grep
  - Glob
  - Bash
  - Task
  - TodoWrite
  - mcp_salesforce_data_query
  - mcp_hubspot_*
triggerKeywords:
  - real-time dashboard
  - live dashboard
  - websocket
  - streaming dashboard
  - live updates
  - real-time metrics
  - dashboard refresh
---

# Real-time Dashboard Coordinator

## Purpose

Coordinate real-time dashboard updates using WebSocket connections. Provides live RevOps visibility with configurable refresh intervals, delta-only data transmission, connection state recovery, and multi-dashboard scaling.

## Core Principles

### 1. Efficient Data Transmission
- Delta-only updates (only changed data)
- Compression for large payloads
- Batched updates to reduce overhead
- Smart polling fallback when WebSocket unavailable

### 2. Resilient Connections
- Automatic reconnection with exponential backoff
- Connection state persistence
- Graceful degradation to polling
- Multi-tab coordination

### 3. Scalable Architecture
- Multiple concurrent dashboard support
- Topic-based subscription model
- Server-side rate limiting
- Client-side throttling

## Architecture

### System Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Data Sources   │────▶│  Realtime Hub    │────▶│   Dashboards    │
│  (SF, HS, etc)  │     │  (WebSocket)     │     │   (Clients)     │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                       │                        │
        │  Change Detection     │  Pub/Sub Topics       │  Subscriptions
        │  Polling/Webhooks     │  Delta Computation    │  State Recovery
        │                       │  Rate Limiting        │  Reconnection
        └───────────────────────┴────────────────────────┘
```

### Component Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Realtime Hub Server                     │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │   Data      │  │   Topic     │  │   Connection    │ │
│  │   Fetcher   │  │   Manager   │  │   Manager       │ │
│  └─────────────┘  └─────────────┘  └─────────────────┘ │
│         │                │                  │           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │   Delta     │  │   Rate      │  │   State         │ │
│  │   Computer  │  │   Limiter   │  │   Persistence   │ │
│  └─────────────┘  └─────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Topics & Subscriptions

### Available Topics

| Topic | Description | Refresh Interval | Data Source |
|-------|-------------|------------------|-------------|
| `pipeline.summary` | Pipeline metrics overview | 30s | Salesforce |
| `pipeline.deals` | Individual deal updates | 10s | Salesforce |
| `pipeline.stages` | Stage movement | 15s | Salesforce |
| `health.accounts` | Account health scores | 60s | Health Scorer |
| `health.churn` | Churn risk alerts | 60s | Churn Scorer |
| `activity.recent` | Recent activities | 5s | SF + HS |
| `activity.team` | Team activity feed | 10s | SF + HS |
| `kpi.revenue` | Revenue KPIs | 60s | Salesforce |
| `kpi.funnel` | Funnel metrics | 30s | SF + HS |
| `alerts.critical` | Critical alerts | Real-time | Alert Manager |
| `alerts.digest` | Alert digest | 60s | Alert Manager |

### Subscription Model

```javascript
// Client subscription example
const subscription = {
  topics: ['pipeline.summary', 'pipeline.deals', 'alerts.critical'],
  filters: {
    'pipeline.deals': {
      stage: ['Negotiation', 'Proposal'],
      minAmount: 50000,
      owner: 'current_user'
    }
  },
  options: {
    deltaOnly: true,
    batchUpdates: true,
    batchInterval: 1000
  }
};
```

## WebSocket Protocol

### Connection Lifecycle

```
1. Client connects to ws://server/realtime
2. Server sends: { type: 'connected', sessionId: 'xxx', serverTime: '...' }
3. Client sends: { type: 'subscribe', topics: [...], filters: {...} }
4. Server sends: { type: 'subscribed', topics: [...], initialData: {...} }
5. Server pushes: { type: 'update', topic: '...', data: {...}, delta: true }
6. Client sends: { type: 'ping' } (every 30s)
7. Server sends: { type: 'pong', serverTime: '...' }
8. On disconnect: Client reconnects with { type: 'reconnect', sessionId: 'xxx', lastSeq: 123 }
```

### Message Types

```typescript
// Server → Client
interface ServerMessage {
  type: 'connected' | 'subscribed' | 'update' | 'error' | 'pong';
  sessionId?: string;
  serverTime?: string;
  topic?: string;
  data?: any;
  delta?: boolean;
  sequence?: number;
}

// Client → Server
interface ClientMessage {
  type: 'subscribe' | 'unsubscribe' | 'ping' | 'reconnect';
  topics?: string[];
  filters?: Record<string, any>;
  sessionId?: string;
  lastSeq?: number;
}
```

### Delta Updates

```javascript
// Full update (initial or recovery)
{
  type: 'update',
  topic: 'pipeline.deals',
  delta: false,
  data: {
    deals: [
      { id: '006xxx', name: 'Acme Corp', amount: 150000, stage: 'Proposal' },
      { id: '006yyy', name: 'Beta Inc', amount: 80000, stage: 'Negotiation' }
    ]
  },
  sequence: 100
}

// Delta update (changes only)
{
  type: 'update',
  topic: 'pipeline.deals',
  delta: true,
  data: {
    changed: [
      { id: '006xxx', stage: 'Negotiation' }  // Only changed fields
    ],
    added: [],
    removed: []
  },
  sequence: 101
}
```

## Server Implementation

### Real-time Hub Server

```javascript
// scripts/lib/realtime/realtime-hub.js
const WebSocket = require('ws');
const Redis = require('redis');

class RealtimeHub {
  constructor(config) {
    this.config = config;
    this.wss = new WebSocket.Server({ port: config.port });
    this.redis = Redis.createClient(config.redis);
    this.topics = new Map();
    this.sessions = new Map();
    this.dataFetchers = new Map();
  }

  async start() {
    // Initialize topic fetchers
    await this.initializeTopics();

    // Handle connections
    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    // Start data polling
    this.startDataPolling();

    console.log(`Realtime Hub started on port ${this.config.port}`);
  }

  handleConnection(ws, req) {
    const sessionId = this.generateSessionId();
    const session = {
      id: sessionId,
      ws,
      subscriptions: new Set(),
      filters: {},
      lastActivity: Date.now(),
      lastSequences: {}
    };

    this.sessions.set(sessionId, session);

    ws.send(JSON.stringify({
      type: 'connected',
      sessionId,
      serverTime: new Date().toISOString()
    }));

    ws.on('message', (message) => {
      this.handleMessage(session, JSON.parse(message));
    });

    ws.on('close', () => {
      this.handleDisconnect(session);
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error for session ${sessionId}:`, error);
    });
  }

  handleMessage(session, message) {
    switch (message.type) {
      case 'subscribe':
        this.handleSubscribe(session, message);
        break;
      case 'unsubscribe':
        this.handleUnsubscribe(session, message);
        break;
      case 'ping':
        session.ws.send(JSON.stringify({
          type: 'pong',
          serverTime: new Date().toISOString()
        }));
        session.lastActivity = Date.now();
        break;
      case 'reconnect':
        this.handleReconnect(session, message);
        break;
    }
  }

  handleSubscribe(session, message) {
    const { topics, filters } = message;

    topics.forEach(topic => {
      session.subscriptions.add(topic);
      if (filters && filters[topic]) {
        session.filters[topic] = filters[topic];
      }
    });

    // Send initial data for subscribed topics
    const initialData = {};
    topics.forEach(topic => {
      const topicData = this.topics.get(topic);
      if (topicData) {
        initialData[topic] = this.filterData(topicData.data, session.filters[topic]);
        session.lastSequences[topic] = topicData.sequence;
      }
    });

    session.ws.send(JSON.stringify({
      type: 'subscribed',
      topics,
      initialData
    }));
  }

  async broadcastUpdate(topic, data, isDelta = true) {
    const topicData = this.topics.get(topic);
    topicData.sequence++;
    topicData.data = isDelta ? this.applyDelta(topicData.data, data) : data;

    this.sessions.forEach(session => {
      if (session.subscriptions.has(topic)) {
        const filteredData = this.filterData(data, session.filters[topic]);
        session.ws.send(JSON.stringify({
          type: 'update',
          topic,
          delta: isDelta,
          data: filteredData,
          sequence: topicData.sequence
        }));
        session.lastSequences[topic] = topicData.sequence;
      }
    });
  }

  startDataPolling() {
    // Pipeline summary - every 30 seconds
    setInterval(() => this.fetchAndBroadcast('pipeline.summary'), 30000);

    // Deal updates - every 10 seconds
    setInterval(() => this.fetchAndBroadcast('pipeline.deals'), 10000);

    // Health scores - every 60 seconds
    setInterval(() => this.fetchAndBroadcast('health.accounts'), 60000);

    // Activity feed - every 5 seconds
    setInterval(() => this.fetchAndBroadcast('activity.recent'), 5000);
  }

  async fetchAndBroadcast(topic) {
    const fetcher = this.dataFetchers.get(topic);
    if (!fetcher) return;

    try {
      const previousData = this.topics.get(topic)?.data;
      const newData = await fetcher.fetch();
      const delta = this.computeDelta(previousData, newData);

      if (delta.hasChanges) {
        await this.broadcastUpdate(topic, delta.changes, true);
      }
    } catch (error) {
      console.error(`Error fetching ${topic}:`, error);
    }
  }

  computeDelta(previous, current) {
    if (!previous) {
      return { hasChanges: true, changes: current };
    }

    const changes = { changed: [], added: [], removed: [] };
    let hasChanges = false;

    // Compare and compute delta
    // Implementation depends on data structure

    return { hasChanges, changes };
  }
}
```

### Data Fetchers

```javascript
// scripts/lib/realtime/fetchers/pipeline-fetcher.js
class PipelineFetcher {
  constructor(config) {
    this.config = config;
  }

  async fetch() {
    const query = `
      SELECT Id, Name, Amount, StageName, CloseDate, OwnerId,
             Deal_Score__c, Last_Activity_Date__c
      FROM Opportunity
      WHERE IsClosed = false
      AND CloseDate >= TODAY
      ORDER BY Amount DESC
      LIMIT 100
    `;

    const result = await this.executeSalesforceQuery(query);
    return this.transform(result);
  }

  transform(records) {
    return {
      summary: {
        totalDeals: records.length,
        totalValue: records.reduce((sum, r) => sum + r.Amount, 0),
        byStage: this.groupByStage(records),
        avgDealScore: this.avgScore(records)
      },
      deals: records.map(r => ({
        id: r.Id,
        name: r.Name,
        amount: r.Amount,
        stage: r.StageName,
        closeDate: r.CloseDate,
        owner: r.OwnerId,
        score: r.Deal_Score__c,
        lastActivity: r.Last_Activity_Date__c
      }))
    };
  }
}
```

## Client Implementation

### React Hook

```javascript
// hooks/useRealtimeDashboard.js
import { useEffect, useState, useCallback, useRef } from 'react';

export function useRealtimeDashboard(topics, filters = {}) {
  const [data, setData] = useState({});
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const wsRef = useRef(null);
  const sessionIdRef = useRef(null);
  const reconnectAttempts = useRef(0);

  const connect = useCallback(() => {
    const ws = new WebSocket(process.env.REALTIME_URL);

    ws.onopen = () => {
      setConnected(true);
      setError(null);
      reconnectAttempts.current = 0;

      // Subscribe to topics
      ws.send(JSON.stringify({
        type: 'subscribe',
        topics,
        filters
      }));
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case 'connected':
          sessionIdRef.current = message.sessionId;
          break;
        case 'subscribed':
          setData(message.initialData);
          break;
        case 'update':
          handleUpdate(message);
          break;
        case 'error':
          setError(message.error);
          break;
      }
    };

    ws.onclose = () => {
      setConnected(false);
      scheduleReconnect();
    };

    ws.onerror = (error) => {
      setError('Connection error');
      console.error('WebSocket error:', error);
    };

    wsRef.current = ws;

    // Ping interval
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);

    return () => {
      clearInterval(pingInterval);
      ws.close();
    };
  }, [topics, filters]);

  const handleUpdate = (message) => {
    setData(prev => {
      if (message.delta) {
        return applyDelta(prev, message.topic, message.data);
      }
      return { ...prev, [message.topic]: message.data };
    });
  };

  const scheduleReconnect = () => {
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
    reconnectAttempts.current++;

    setTimeout(() => {
      if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
        connect();
      }
    }, delay);
  };

  useEffect(() => {
    const cleanup = connect();
    return cleanup;
  }, [connect]);

  return { data, connected, error };
}
```

### Dashboard Component

```javascript
// components/RealtimeDashboard.js
import React from 'react';
import { useRealtimeDashboard } from '../hooks/useRealtimeDashboard';

export function RealtimeDashboard() {
  const { data, connected, error } = useRealtimeDashboard([
    'pipeline.summary',
    'pipeline.deals',
    'alerts.critical'
  ]);

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>Pipeline Dashboard</h1>
        <ConnectionStatus connected={connected} error={error} />
      </header>

      <main className="dashboard-content">
        <div className="dashboard-grid">
          <PipelineSummary data={data['pipeline.summary']} />
          <DealsList data={data['pipeline.deals']} />
          <AlertsFeed data={data['alerts.critical']} />
        </div>
      </main>
    </div>
  );
}

function ConnectionStatus({ connected, error }) {
  if (error) {
    return <span className="status status--error">⚠️ {error}</span>;
  }
  return (
    <span className={`status status--${connected ? 'connected' : 'disconnected'}`}>
      {connected ? '🟢 Live' : '🔴 Reconnecting...'}
    </span>
  );
}
```

## Configuration

### Server Configuration

```json
{
  "realtimeHub": {
    "enabled": true,
    "port": 8080,
    "host": "0.0.0.0",

    "websocket": {
      "path": "/realtime",
      "pingInterval": 30000,
      "pingTimeout": 60000,
      "maxPayloadSize": 1048576
    },

    "redis": {
      "enabled": true,
      "host": "${REDIS_HOST}",
      "port": 6379,
      "prefix": "realtime:"
    },

    "topics": {
      "pipeline.summary": {
        "refreshInterval": 30000,
        "fetcher": "PipelineFetcher",
        "cacheSeconds": 25
      },
      "pipeline.deals": {
        "refreshInterval": 10000,
        "fetcher": "DealsFetcher",
        "filters": ["stage", "owner", "minAmount"]
      },
      "health.accounts": {
        "refreshInterval": 60000,
        "fetcher": "HealthFetcher"
      },
      "activity.recent": {
        "refreshInterval": 5000,
        "fetcher": "ActivityFetcher",
        "maxItems": 50
      },
      "alerts.critical": {
        "refreshInterval": 0,
        "fetcher": "AlertFetcher",
        "pushOnly": true
      }
    },

    "rateLimiting": {
      "enabled": true,
      "maxConnectionsPerIP": 10,
      "maxSubscriptionsPerSession": 20,
      "messagesPerSecond": 10
    },

    "scaling": {
      "maxConnections": 1000,
      "maxTopics": 50,
      "connectionTimeout": 300000
    }
  }
}
```

### Environment Variables

```bash
# Server
REALTIME_PORT=8080
REALTIME_HOST=0.0.0.0

# Redis (for multi-instance scaling)
REDIS_HOST=localhost
REDIS_PORT=6379

# Authentication
REALTIME_JWT_SECRET=your_jwt_secret

# Rate Limiting
REALTIME_MAX_CONNECTIONS=1000
REALTIME_RATE_LIMIT=10
```

## Monitoring & Health

### Health Metrics

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| `connections.active` | Current active connections | >800 (80% capacity) |
| `connections.rate` | Connections per minute | >100/min |
| `messages.sent` | Messages sent per second | >1000/s |
| `latency.avg` | Average message latency | >100ms |
| `errors.rate` | Error rate | >1% |
| `topics.lag` | Data freshness lag | >2x refresh interval |

### Health Check Endpoint

```javascript
// GET /realtime/health
{
  "status": "healthy",
  "timestamp": "2026-01-18T10:00:00Z",
  "metrics": {
    "connections": {
      "active": 245,
      "max": 1000,
      "utilizationPercent": 24.5
    },
    "topics": {
      "active": 11,
      "subscriptions": 892
    },
    "messages": {
      "sentPerSecond": 45,
      "avgLatencyMs": 12
    },
    "errors": {
      "ratePercent": 0.1,
      "recent": []
    },
    "uptime": {
      "seconds": 86400,
      "startedAt": "2026-01-17T10:00:00Z"
    }
  }
}
```

## Fallback Behavior

### Polling Fallback

When WebSocket is unavailable:

```javascript
// Automatic fallback to polling
class RealtimeClient {
  connect() {
    if (!this.supportsWebSocket()) {
      return this.startPolling();
    }
    // WebSocket connection
  }

  startPolling() {
    this.pollingIntervals = {};

    this.subscribedTopics.forEach(topic => {
      const config = this.topicConfigs[topic];
      this.pollingIntervals[topic] = setInterval(
        () => this.pollTopic(topic),
        config.refreshInterval * 1.5  // Slightly slower than WebSocket
      );
    });
  }

  async pollTopic(topic) {
    const response = await fetch(`/api/realtime/${topic}`);
    const data = await response.json();
    this.handleUpdate({ topic, data, delta: false });
  }
}
```

## Related Agents

- `alert-streaming-manager` - Push-based alert delivery
- `revops-reporting-assistant` - Report generation
- `revops-customer-health-scorer` - Health score data
- `revops-deal-scorer` - Deal score data

## Scripts

- `scripts/lib/realtime/realtime-hub.js` - WebSocket server
- `scripts/lib/realtime/fetchers/` - Data fetchers per topic
- `scripts/lib/realtime/delta-computer.js` - Delta calculation
- `scripts/lib/realtime/connection-manager.js` - Connection handling

## CLI Commands

```bash
# Start realtime hub server
node scripts/lib/realtime/realtime-hub.js --port 8080

# Check hub health
curl http://localhost:8080/realtime/health

# Monitor connections
node scripts/lib/realtime/monitor.js --metrics

# Test topic data
node scripts/lib/realtime/test-topic.js --topic pipeline.summary
```

## Best Practices

### Do's
- Use delta updates for efficiency
- Implement client-side caching
- Handle reconnection gracefully
- Rate limit connections and messages
- Monitor connection health continuously
- Use Redis for multi-instance scaling

### Don'ts
- Don't send full data on every update
- Don't allow unlimited subscriptions
- Don't skip authentication
- Don't ignore connection timeouts
- Don't poll when WebSocket available
- Don't cache sensitive data client-side

## Disclaimer

> Real-time functionality requires proper infrastructure (WebSocket server, Redis for scaling). Ensure network security with TLS/WSS. Test performance under expected load before production deployment. Consider fallback mechanisms for clients that don't support WebSocket.
