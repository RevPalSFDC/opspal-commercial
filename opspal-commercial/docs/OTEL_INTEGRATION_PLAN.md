# OpenTelemetry Integration Plan

## Overview
Leverage Claude Code's OpenTelemetry (OTel) metrics to enhance the RevPal Agent System with real-time performance monitoring, cost optimization, and automated quality insights.

## Architecture

```
Claude Code (OTel Exporter)
    ↓
OTel Collector
    ↓
    ├─→ Supabase (Metrics Storage)
    ├─→ Grafana/Datadog (Visualization)
    └─→ Reflection System (Auto-analysis)
```

## Phase 1: Basic Metrics Collection

### 1.1 Enable OTel Export
```bash
# Set environment variables
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
export OTEL_SERVICE_NAME="revpal-agent-system"
export OTEL_METRICS_EXPORTER="otlp"
```

### 1.2 Setup OTel Collector
```yaml
# otel-collector-config.yaml
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:

exporters:
  # Export to Supabase via HTTP
  otlphttp:
    endpoint: https://your-supabase-function.supabase.co/otel-ingest

  # Export to stdout for debugging
  logging:
    loglevel: debug

service:
  pipelines:
    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlphttp, logging]
```

### 1.3 Create Supabase Table
```sql
-- Store OTel metrics
CREATE TABLE claude_code_metrics (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  metric_name TEXT NOT NULL,
  metric_value DOUBLE PRECISION NOT NULL,
  agent_type TEXT,
  plugin_name TEXT,
  task_complexity TEXT,
  success BOOLEAN,
  error_type TEXT,
  token_count INTEGER,
  duration_ms INTEGER,
  attributes JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for common queries
CREATE INDEX idx_metrics_timestamp ON claude_code_metrics(timestamp);
CREATE INDEX idx_metrics_agent ON claude_code_metrics(agent_type);
CREATE INDEX idx_metrics_plugin ON claude_code_metrics(plugin_name);
```

## Phase 2: Metric Enrichment

### 2.1 Add Custom Attributes
Extend metrics with RevPal-specific context:
- Agent type (sfdc-cpq-assessor, release-coordinator, etc.)
- Plugin name (salesforce-plugin, hubspot-plugin)
- Task complexity (LOW/MEDIUM/HIGH)
- Client/org identifier
- Workflow type (assessment, deployment, etc.)

### 2.2 Tag Agent Invocations
```javascript
// In agent wrapper
const startSpan = (agentType, taskComplexity) => {
  return {
    agentType,
    taskComplexity,
    startTime: Date.now(),
    pluginName: getPluginFromAgent(agentType)
  };
};
```

## Phase 3: Analytics & Insights

### 3.1 Key Metrics to Track

#### Agent Performance
- `agent.duration` - Execution time per agent
- `agent.token_usage` - Tokens consumed per invocation
- `agent.success_rate` - Success/failure ratio
- `agent.retry_count` - Number of retries before success

#### Workflow Metrics
- `workflow.duration` - End-to-end workflow time
- `workflow.agent_chain_length` - Number of agents in chain
- `workflow.complexity_score` - Calculated complexity

#### Cost Metrics
- `cost.tokens_total` - Total token consumption
- `cost.per_agent` - Cost breakdown by agent
- `cost.per_client` - Cost attribution by client/org

#### Quality Metrics
- `quality.error_rate` - Errors per 100 invocations
- `quality.reflection_triggers` - How often issues trigger reflections
- `quality.fix_effectiveness` - Did the fix prevent recurrence?

### 3.2 Dashboards

#### Dashboard 1: Agent Performance
- Top 10 most-used agents (bar chart)
- Average execution time by agent (line chart)
- Success rate by agent (gauge)
- Token usage distribution (histogram)

#### Dashboard 2: Cost Analysis
- Daily token consumption (area chart)
- Cost per client/org (pie chart)
- Most expensive workflows (table)
- Cost trends over time (line chart)

#### Dashboard 3: Quality Monitoring
- Error rate over time (line chart)
- Error types breakdown (bar chart)
- Agents with highest failure rate (table)
- Reflection system effectiveness (gauge)

#### Dashboard 4: Workflow Analytics
- Common agent chains (sankey diagram)
- Workflow completion times (box plot)
- Complexity vs duration correlation (scatter)

## Phase 4: Automated Actions

### 4.1 Integration with Reflection System
```javascript
// Trigger reflection when patterns detected
if (metricData.errorRate > 0.15) {
  createReflection({
    type: 'HIGH_ERROR_RATE',
    agent: metricData.agentType,
    context: metricData,
    severity: 'CRITICAL'
  });
}
```

### 4.2 Alerting Rules
```yaml
alerts:
  - name: HighAgentFailureRate
    condition: agent.error_rate > 0.20
    duration: 15m
    action: slack_notification

  - name: TokenUsageSpike
    condition: rate(tokens_total) > 1.5x_baseline
    duration: 5m
    action: slack_notification + create_reflection

  - name: SlowAgentExecution
    condition: agent.duration > P95(last_7d)
    duration: 3 consecutive runs
    action: create_reflection
```

### 4.3 Auto-optimization
- Switch to Haiku model for tasks < MEDIUM complexity
- Suggest agent consolidation when overlap detected
- Auto-disable underperforming agents
- Recommend workflow optimizations

## Phase 5: Advanced Features

### 5.1 Predictive Analytics
- Predict workflow duration based on complexity
- Forecast token usage for budgeting
- Identify potential failures before they occur
- Optimize agent routing based on historical data

### 5.2 A/B Testing
- Test new agent implementations vs old
- Compare different complexity scoring algorithms
- Measure impact of agent improvements

### 5.3 Client Reporting
- Generate monthly usage reports
- Show cost breakdown per client
- Highlight efficiency improvements
- ROI metrics for agent system

## Implementation Steps

### Week 1: Setup
- [ ] Install OTel Collector
- [ ] Create Supabase tables
- [ ] Configure Claude Code OTel export
- [ ] Verify metrics flowing

### Week 2: Enrichment
- [ ] Add agent type tagging
- [ ] Add complexity scoring
- [ ] Add client/org attribution
- [ ] Test metric accuracy

### Week 3: Dashboards
- [ ] Build Grafana/Superset dashboards
- [ ] Create agent performance views
- [ ] Create cost analysis views
- [ ] Create quality monitoring views

### Week 4: Automation
- [ ] Wire metrics to reflection system
- [ ] Configure alerting rules
- [ ] Test auto-optimization logic
- [ ] Document runbooks

## Success Metrics

- **Visibility**: 100% of agent invocations tracked
- **Performance**: Identify 3+ optimization opportunities in first month
- **Cost**: Achieve 15% token usage reduction
- **Quality**: Reduce error rate by 25% through proactive alerts
- **ROI**: System pays for itself through optimizations

## Tools & Services

### Option 1: Self-Hosted (Recommended for Privacy)
- OTel Collector (open-source)
- Supabase (existing infrastructure)
- Grafana (open-source dashboards)

### Option 2: Managed Services
- Datadog (full observability platform)
- New Relic (APM + metrics)
- Honeycomb (observability for complex systems)

### Option 3: Hybrid
- OTel Collector → Supabase (storage)
- OTel Collector → Grafana Cloud (visualization)
- Export to multiple backends for redundancy

## Security Considerations

- Never log PII or credentials in metrics
- Sanitize client names in attributes
- Use secure OTLP endpoints (HTTPS)
- Rotate Supabase API keys regularly
- Restrict dashboard access by role

## Cost Estimate

**Self-Hosted Option:**
- OTel Collector: Free (open-source)
- Supabase storage: ~$25/mo (existing plan)
- Grafana: Free (self-hosted) or $50/mo (Cloud)
- **Total**: $25-75/mo

**Managed Option:**
- Datadog: $15/host/mo + $0.10/1M spans
- Estimated: $100-200/mo
- **Total**: $100-200/mo

**ROI**: If metrics identify 20% token savings on a $500/mo bill, that's $100/mo saved → Pays for itself immediately.

## References

- Claude Code Monitoring Docs: https://code.claude.com/docs/en/monitoring-usage
- OpenTelemetry Docs: https://opentelemetry.io/docs/
- OTel Collector Config: https://opentelemetry.io/docs/collector/configuration/
- Grafana OTel Guide: https://grafana.com/docs/grafana-cloud/monitor-applications/application-observability/setup/collector/

## Next Steps

1. **Proof of Concept**: Set up basic OTel export to stdout (1 day)
2. **Supabase Integration**: Create ingest function and tables (2 days)
3. **Dashboard MVP**: Build first 2 dashboards (3 days)
4. **Reflection Integration**: Wire to existing system (2 days)
5. **Production**: Roll out gradually, monitor for issues (1 week)

**Estimated Total Time**: 2-3 weeks for full implementation
**Expected ROI**: 3-6 months based on optimizations identified
