# AI Consult Plugin

Cross-model AI consultation for Claude Code. Get second opinions from Google's Gemini AI.

## Features

- **Cross-Model Consultation**: Query Gemini from within Claude Code
- **Synthesized Comparisons**: Claude + Gemini perspectives merged intelligently
- **Agreement Analysis**: Identifies consensus and differences
- **Auto-Consultation Triggers**: Automatic suggestions when agents struggle
- **Slash Commands**: Quick `/gemini-link` and `/gemini-consult` commands
- **Multiple Use Cases**: Code review, architecture, debugging, best practices

## Installation

### Prerequisites

1. **Install Gemini CLI**:
   ```bash
   npm install -g @google/gemini-cli
   ```

2. **Set API Key**:
   ```bash
   export GEMINI_API_KEY="your-api-key"
   ```

   Get a free key: https://aistudio.google.com/apikey

3. **Verify Setup**:
   ```bash
   gemini --version
   ```

### Plugin Installation

```bash
/plugin install ai-consult-plugin@revpal-internal-plugins
```

## Quick Start Commands

| Command | Description |
|---------|-------------|
| `/gemini-link` | Set up and verify Gemini connection |
| `/gemini-link --setup` | Guided setup wizard |
| `/gemini-link --test` | Test connection |
| `/gemini-consult <question>` | Quick consultation |

## Usage

### Slash Commands (Fastest)

```
/gemini-link              # Check connection status
/gemini-link --setup      # Setup wizard
/gemini-consult How should I structure my auth middleware?
```

### Natural Language

```
"Ask Gemini to review this function"
"Get a second opinion on our caching strategy"
"Consult Gemini about this architecture decision"
```

### Via Task Tool

```javascript
Task(subagent_type='gemini-consult', prompt='Review this code for edge cases: [code]')
```

## Auto-Consultation (v1.1.0+)

The plugin automatically suggests Gemini consultation when agents struggle:

| Trigger | Condition | Urgency |
|---------|-----------|---------|
| Very High Complexity | >= 85% complexity | HIGH |
| Low Confidence | < 40% routing confidence | MEDIUM |
| Uncertainty Detected | 3+ uncertainty phrases | HIGH |
| Error Patterns | 2+ errors/retries | HIGH |

When triggered, you'll see:
```
🔴 GEMINI CONSULTATION SUGGESTED
Reason: Very high complexity (90%) with low confidence
To get a second opinion: Task(subagent_type='gemini-consult', prompt='...')
```

Disable with: `export ENABLE_AUTO_CONSULTATION=0`

## Output Format

```markdown
# Cross-Model Consultation Results

**Question:** How should we implement caching?
**Overall Alignment:** 72%

## Recommendation
Moderate agreement. Both models favor Redis but differ on implementation details.

## Agreement Points
- Use Redis for distributed caching
- Implement cache invalidation on writes
- Set reasonable TTLs

## Key Differences
- **Claude:** Recommends cache-aside pattern
- **Gemini:** Suggests write-through for consistency

## Claude's Perspective
[Full Claude analysis]

## Gemini's Perspective
[Full Gemini analysis]
```

## Alignment Interpretation

| Score | Interpretation |
|-------|---------------|
| 80-100% | Strong consensus - high confidence |
| 50-79% | Moderate agreement - combine insights |
| 30-49% | Partial agreement - review carefully |
| 0-29% | Low agreement - may need clarification |

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `GEMINI_API_KEY` | (required) | API key from AI Studio |
| `GEMINI_MODEL` | `gemini-2.5-pro` | Model to use |
| `GEMINI_TIMEOUT` | `120000` | Timeout in ms |

## Rate Limits

Free tier:
- 60 requests/minute
- 1,000 requests/day

## Security

The agent will warn before sending potentially sensitive content. Never include:
- API keys or credentials
- Personal identifiable information
- Highly proprietary code

## Scripts

| Script | Purpose |
|--------|---------|
| `prereq-check.sh` | Verify prerequisites |
| `gemini-cli-invoker.js` | Invoke Gemini CLI |
| `response-synthesizer.js` | Synthesize responses |
| `consultation-trigger.js` | Determine when to suggest consultation |
| `ace-integration.js` | ACE skill registry integration |

## ACE Integration (v1.3.0)

Consultation outcomes are logged to the ACE (Agentic Context Engineering) skill registry:

- **Automatic Logging**: Every gemini-consult completion is recorded
- **Learning-Based Triggers**: Uses historical success rates to recommend consultation
- **Agent Statistics**: Track consultation effectiveness per agent/topic

```bash
# Get agent consultation stats
node .claude-plugins/opspal-core-plugin/packages/domains/ai-consult/scripts/lib/ace-integration.js stats --agent sfdc-cpq-assessor

# Check if consultation recommended based on history
node .claude-plugins/opspal-core-plugin/packages/domains/ai-consult/scripts/lib/ace-integration.js should-consult --agent my-agent --complexity 0.85

# Disable ACE logging
export ENABLE_ACE_LOGGING=0
```

## Troubleshooting

**CLI not found**: `npm install -g @google/gemini-cli`

**API key not set**: `export GEMINI_API_KEY="your-key"`

**Rate limited**: Wait and retry (60 req/min limit)

**Timeout**: Try `gemini-2.5-flash` for faster response

## License

MIT

## Contributing

Issues and PRs welcome at: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace

---

**Version**: 1.3.0 | **Author**: RevPal Engineering
