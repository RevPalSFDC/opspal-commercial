# Real-time Dashboard Templates

WebSocket-enabled dashboard templates for live RevOps visibility.

## Templates

| Template | Description | Topics |
|----------|-------------|--------|
| `pipeline-tracker.json` | Live deal movement, stage progression, pipeline value | pipeline.* |
| `kpi-monitor.json` | Revenue, funnel, and health KPIs | kpi.*, health.* |
| `alert-feed.json` | Critical notifications and alert management | alerts.* |
| `team-activity.json` | Team engagement and performance | activity.* |

## Requirements

### Server-side
- WebSocket server (see `realtime-dashboard-coordinator` agent)
- Redis for multi-instance scaling (optional)
- Data fetchers for each topic

### Client-side
- Modern browser with WebSocket support
- Chart.js for visualizations
- Optional: Audio support for alert sounds

## Quick Start

### 1. Start the Realtime Hub

```bash
# Start WebSocket server
node scripts/lib/realtime/realtime-hub.js --port 8080
```

### 2. Generate Dashboard

```bash
# Using web-viz generator
node scripts/lib/web-viz/generator.js \
  --template realtime-dashboard/pipeline-tracker.json \
  --output ./reports/pipeline-live.html \
  --websocket ws://localhost:8080/realtime
```

### 3. Connect to Data

```javascript
// The generated dashboard auto-connects to WebSocket
// Topics are subscribed based on template configuration
```

## Template Structure

```json
{
  "templateId": "realtime-xxx",
  "refreshMode": "websocket",
  "topics": ["topic1", "topic2"],

  "websocket": {
    "topics": ["topic1", "topic2"],
    "reconnectStrategy": {
      "maxAttempts": 10,
      "initialDelay": 1000,
      "maxDelay": 30000
    },
    "deltaUpdates": true
  },

  "components": [
    {
      "id": "component-id",
      "type": "kpi|chart|table|feed|list",
      "topic": "topic1",
      "dataPath": "path.to.data",
      "layout": { "col": 1, "row": 1, "width": 3, "height": 1 }
    }
  ]
}
```

## Component Types

### Real-time Specific

| Type | Description | Use Case |
|------|-------------|----------|
| `feed` | Scrolling activity feed | Live updates, notifications |
| `alertList` | Alert cards with actions | Critical alerts |
| `leaderboard` | Ranked list with scores | Team performance |
| `presenceList` | Active user indicators | Team status |
| `gauge` | Real-time gauge meter | KPI thresholds |
| `heatmap` | Activity patterns | Engagement analysis |

### Standard (with live updates)

| Type | Description |
|------|-------------|
| `kpi` | Single metric card |
| `chart` | Line, bar, pie, etc. |
| `table` | Data table |
| `list` | Simple list |

## WebSocket Topics

### Pipeline Topics
- `pipeline.summary` - Aggregate metrics (30s refresh)
- `pipeline.deals` - Individual deals (10s refresh)
- `pipeline.stages` - Stage movements (15s refresh)

### Health Topics
- `health.accounts` - Health scores (60s refresh)
- `health.churn` - Churn risk alerts (60s refresh)

### Activity Topics
- `activity.recent` - Recent activities (5s refresh)
- `activity.team` - Team activity feed (10s refresh)

### KPI Topics
- `kpi.revenue` - Revenue metrics (60s refresh)
- `kpi.funnel` - Funnel metrics (30s refresh)
- `kpi.team` - Team KPIs (60s refresh)

### Alert Topics
- `alerts.critical` - Real-time critical alerts
- `alerts.digest` - Aggregated alert stats (60s refresh)
- `alerts.history` - Alert history (on-demand)

## Delta Updates

Templates support delta-only updates to minimize data transfer:

```json
// Full update (initial)
{ "delta": false, "data": { "deals": [...] } }

// Delta update (changes only)
{ "delta": true, "data": { "changed": [...], "added": [...], "removed": [...] } }
```

## Fallback Behavior

When WebSocket unavailable, templates fall back to polling:

```json
{
  "fallback": {
    "mode": "polling",
    "interval": 30000,
    "endpoints": {
      "pipeline.summary": "/api/pipeline/summary"
    }
  }
}
```

## Customization

### Theme Override

```json
{
  "layout": {
    "theme": "revpal-dashboard",
    "customTheme": {
      "primaryColor": "#5F3B8C",
      "accentColor": "#E99560"
    }
  }
}
```

### Sound Notifications

```json
{
  "websocket": {
    "soundNotifications": {
      "enabled": true,
      "P1": "/sounds/critical.mp3",
      "P2": "/sounds/high.mp3"
    }
  }
}
```

### Row Highlighting

```json
{
  "rowHighlight": {
    "field": "recentlyUpdated",
    "className": "row-highlight",
    "duration": 5000
  }
}
```

## Related Files

- **Agents**: `realtime-dashboard-coordinator.md`, `alert-streaming-manager.md`
- **Scripts**: `scripts/lib/realtime/`, `scripts/lib/web-viz/`
- **Config**: `config/web-viz-defaults.json`
- **Themes**: `templates/web-viz/themes/revpal-dashboard.css`

## Performance Guidelines

1. **Limit subscriptions** - Only subscribe to needed topics
2. **Use delta updates** - Minimize data transfer
3. **Batch client updates** - Group UI updates (1s interval)
4. **Lazy load components** - Load below-fold components on scroll
5. **Cache static data** - Don't refetch reference data

## Troubleshooting

### Connection Issues
- Check WebSocket server is running
- Verify firewall allows WebSocket connections
- Check browser console for errors

### Missing Updates
- Verify topic subscription in browser dev tools
- Check server logs for data fetcher errors
- Validate data path in template

### Performance
- Reduce subscription topics
- Increase batch interval
- Enable delta-only updates
