# Model Proxy Feature - Shared Infrastructure

## Overview

The Model Proxy feature provides optional multi-model AI capabilities to the Principal Engineer Agent System. It allows both ClaudeHubSpot and ClaudeSFDC to leverage multiple AI models (GPT-5, Claude variants, etc.) through a unified proxy system.

## Architecture

```
┌─────────────────────────────────────────┐
│         Shared Infrastructure           │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │    Model Proxy Coordinator      │   │
│  │  (shared-infrastructure/        │   │
│  │   model-proxy/coordinator.js)   │   │
│  └──────────┬──────────────────────┘   │
│             │                           │
│      ┌──────┴──────┐                   │
│      │             │                   │
└──────┼─────────────┼───────────────────┘
       │             │
┌──────▼────┐ ┌─────▼──────┐
│ HubSpot   │ │ Salesforce │
│ Model     │ │ Model      │
│ Proxy     │ │ Proxy      │
└───────────┘ └────────────┘
```

## Operating Modes

### 1. Disabled (Default)
- No impact on system
- Agents use default Claude models
- Zero resource consumption

### 2. Standalone Mode
- Each project runs its own model proxy
- Independent configuration and operation
- No coordination required

### 3. Sibling Mode
- Automatically detected when both projects present
- Coordinates ports to avoid conflicts
- Independent model pools

### 4. Shared Mode
- Full infrastructure sharing
- Unified model pool
- Cost optimization across projects
- Centralized monitoring

## Quick Start Guide

### Enable for Single Project

**ClaudeHubSpot:**
```bash
cd ClaudeHubSpot
./scripts/enable-model-proxy.sh
```

**ClaudeSFDC:**
```bash
cd ClaudeSFDC
./scripts/enable-model-proxy.sh
```

### Enable Shared Mode

```bash
# Enable both projects
cd ClaudeHubSpot && ./scripts/enable-model-proxy.sh
cd ../ClaudeSFDC && ./scripts/enable-model-proxy.sh

# Start shared coordinator
cd ../shared-infrastructure/model-proxy
node coordinator.js
```

### Disable Feature

```bash
# Disable for specific project
cd ClaudeHubSpot
./scripts/disable-model-proxy.sh

# Or disable all
cd shared-infrastructure/model-proxy
node coordinator.js --disable-all
```

## Configuration

### Shared Configuration
Edit `shared-infrastructure/model-proxy/shared-config.yaml`:

```yaml
cost_settings:
  daily_limit: 125.00
  project_allocations:
    ClaudeHubSpot:
      daily_limit: 50.00
    ClaudeSFDC:
      daily_limit: 75.00
```

### Model Selection Rules

| Task Type | HubSpot Model | Salesforce Model |
|-----------|---------------|------------------|
| Code Generation | GPT-5 | GPT-5 |
| Automation | GPT-5 Mini | GPT-5 Mini |
| Data Operations | Claude Haiku | Claude Haiku |
| Complex Logic | Claude Opus | Claude Opus |

## Cost Management

### Tracking
- Real-time cost monitoring
- Per-project allocation
- Daily and monthly limits
- Alert thresholds

### Optimization Strategies
1. **Intelligent Routing**: Tasks routed to most cost-effective model
2. **Caching**: Responses cached to reduce redundant calls
3. **Bulk Operations**: Optimized for batch processing
4. **Fallback Chain**: Automatic fallback to cheaper models

### Cost Dashboard
Access at `http://localhost:3000` when shared mode is active

## Monitoring

### Health Check
```bash
# Check status of all projects
node shared-infrastructure/model-proxy/coordinator.js --status
```

### Metrics Endpoint
Available at `http://localhost:9090/metrics` when active

### Logs
- HubSpot: `ClaudeHubSpot/logs/model-proxy.log`
- Salesforce: `ClaudeSFDC/logs/model-proxy.log`
- Shared: `shared-infrastructure/model-proxy/logs/shared-model-proxy.log`

## Environment Variables

Required for all modes:
```bash
# At least one API key required
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key
```

Optional configuration:
```bash
MODEL_PROXY_ENV=development|staging|production
MODEL_PROXY_HOST=127.0.0.1
MODEL_PROXY_PORT=8000
MODEL_PROXY_DAILY_LIMIT=125.00
MODEL_PROXY_MONTHLY_LIMIT=2500.00
```

## Troubleshooting

### Common Issues

**Port Conflicts:**
```bash
# Find process using port
lsof -i :8000

# Kill process
kill -9 <PID>
```

**Python Dependencies:**
```bash
# Install required packages
pip3 install "litellm[proxy]" pyyaml uvicorn
```

**Configuration Validation:**
```bash
# Test HubSpot config
cd ClaudeHubSpot
python3 model-proxy/server.py --test

# Test Salesforce config
cd ClaudeSFDC
python3 model-proxy/server.py --test
```

## Advanced Features

### Load Balancing
When in shared mode, requests are automatically load-balanced across available model instances.

### Failover
Automatic failover to backup models if primary model fails or rate-limited.

### Priority Queuing
High-priority tasks (e.g., Apex generation) get precedence over low-priority tasks.

### Learning & Optimization
The system learns from usage patterns to optimize model selection over time.

## Security

- API keys stored as environment variables
- All model requests over HTTPS
- Optional encryption for cached responses
- Rate limiting to prevent abuse
- Audit logging for compliance

## Performance Impact

### Resource Usage
- **Memory**: ~50-100MB per instance
- **CPU**: Minimal (<5% on average)
- **Network**: Depends on request volume

### Latency
- **Cache hit**: <10ms
- **Model request**: 500ms-3s depending on model
- **Shared mode overhead**: <50ms

## Integration with Agents

The model proxy integrates seamlessly with existing agents:

1. **No code changes required** - Agents work the same
2. **Transparent routing** - Model selection happens automatically
3. **Fallback to default** - If proxy unavailable, uses Claude directly
4. **Enhanced capabilities** - When enabled, provides multi-model power

## Best Practices

1. **Start with standalone** - Test in single project first
2. **Monitor costs** - Watch daily usage in initial period
3. **Tune routing rules** - Adjust model selection for your use cases
4. **Use caching** - Enable for frequently repeated queries
5. **Regular updates** - Keep LiteLLM and dependencies updated

## Support

For issues or questions:
1. Check project-specific READMEs
2. Review shared configuration
3. Check coordinator logs
4. Validate with test scripts

## Roadmap

### Phase 1 ✅ (Complete)
- Basic model proxy implementation
- Standalone mode for each project
- Enable/disable scripts

### Phase 2 ✅ (Complete)
- Shared infrastructure
- Cost tracking
- Intelligent routing

### Phase 3 (Future)
- ML-based model selection
- Advanced caching strategies
- Custom model integration
- Auto-scaling support

## License

This feature follows the same license as the Principal Engineer Agent System.