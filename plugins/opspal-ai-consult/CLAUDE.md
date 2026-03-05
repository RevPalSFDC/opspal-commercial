# AI Consult Plugin - User Guide

This file provides guidance when using the AI Consult Plugin with Claude Code.

## Plugin Overview

The **AI Consult Plugin** enables cross-model AI consultation, allowing you to get second opinions from Google's Gemini AI directly within Claude Code. It also includes domain canonicalization to detect shadow duplicates where distinct company websites resolve to the same destination domain (often from acquisitions/rebrands).

**Version**: 1.4.0
**Repository**: https://github.com/RevPalSFDC/opspal-plugin-internal-marketplace

## Quick Start

### Prerequisites

```bash
# 1. Install Gemini CLI
npm install -g @google/gemini-cli

# 2. Set your API key
export GEMINI_API_KEY="your-api-key"

# 3. Verify installation
bash .claude-plugins/opspal-ai-consult/scripts/lib/prereq-check.sh
```

**Get API Key**: https://aistudio.google.com/apikey (free tier: 60 req/min, 1K/day)

## Validation Framework (NEW)

**Comprehensive validation system preventing errors in AI consultation operations**

The Validation Framework provides automatic error prevention through 5 validation stages:

1. **Schema Validation** - Validates consultation request/response structure
2. **Parse Error Handling** - Auto-fixes JSON parsing in Gemini responses
3. **Data Quality** - Detects synthetic/low-quality responses (4-layer scoring)
4. **Tool Contract** - Validates Gemini CLI invocations before execution
5. **Permission Validation** - Checks sensitive content before sending to Gemini

**Automatic Hooks** (already enabled):
- `pre-reflection-submit.sh` - Validates reflections before submission
- `pre-tool-execution.sh` - Validates Gemini tool calls

**Quick Commands**:
```bash
# Generate validation dashboard
node ../opspal-core/scripts/lib/validation-dashboard-generator.js generate --days 30

# Temporarily disable validation
export SKIP_VALIDATION=1              # All validation
export SKIP_TOOL_VALIDATION=1         # Tool validation only
```

**Documentation**: See `../../docs/VALIDATION_FRAMEWORK_GUIDE.md` for complete guide

**Performance**:
- <500ms total validation time
- <100ms sensitive content detection
- 95%+ pass rate for legitimate operations

**Common Validations**:
- ✅ GEMINI_API_KEY configuration check
- ✅ Gemini CLI installation validation
- ✅ Rate limit checks (60 req/min, 1K/day free tier)
- ✅ Sensitive content detection (API keys, PII, proprietary code)
- ✅ Response quality scoring (alignment percentage)
- ✅ Timeout validation (default 120s)

## Auto-Consultation (v1.1.0)

The plugin now **automatically suggests Gemini consultation** when agents struggle:

### Automatic Triggers

| Trigger | Condition | Urgency |
|---------|-----------|---------|
| **Very High Complexity** | Complexity >= 85% | HIGH |
| **Low Confidence** | Routing confidence < 40% | MEDIUM |
| **Uncertainty Detected** | 3+ uncertainty phrases in output | HIGH |
| **Error Patterns** | 2+ errors/retries | HIGH |
| **Architecture Decisions** | Design-related errors | MEDIUM |

### What You'll See

When triggered, you'll see:
```
🔴 GEMINI CONSULTATION SUGGESTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Reason: Very high complexity (90%) with low confidence
Urgency: HIGH

To get a second opinion:
  Task(subagent_type='gemini-consult', prompt='<describe what you need help with>')
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Configuration

```bash
# Disable auto-consultation (default: enabled)
export ENABLE_AUTO_CONSULTATION=0

# Enable debug output
export CONSULTATION_VERBOSE=1
```

### Basic Usage

Just ask for a second opinion naturally:

```
"Ask Gemini to review this function"
"Get a second opinion on our caching strategy"
"Consult Gemini about this architecture decision"
```

The `gemini-consult` agent will:
1. Develop Claude's perspective
2. Query Gemini for its perspective
3. Synthesize both into a unified comparison

### Shadow Duplicate Domain Usage (v1.4.0+)

Use the domain scanner when you need to reconcile account/company records by canonical website destination.

Default resolution mode is deterministic-first (local redirect checks first, Gemini escalation for unresolved domains).

```bash
# CSV
/gemini-domain-resolve --source csv --input ./exports/accounts.csv

# Salesforce
/gemini-domain-resolve --source salesforce --org my-sandbox --max-records 300

# HubSpot
/gemini-domain-resolve --source hubspot --max-records 300

# Marketo
/gemini-domain-resolve --source marketo --max-records 200
```

## Available Agent

### gemini-consult

**Trigger Keywords**: `gemini`, `second opinion`, `consult gemini`, `alternative perspective`, `gemini review`, `ask gemini`

**What It Does**:
- Invokes Gemini CLI non-interactively
- Compares Claude and Gemini responses
- Identifies agreement points and differences
- Provides synthesized recommendations

**Output Format**:
```markdown
# Cross-Model Consultation Results

**Question:** [Your question]
**Overall Alignment:** 75%

## Recommendation
[Guidance based on agreement level]

## Agreement Points
- [Shared insights]

## Key Differences
- **Claude:** [Unique Claude perspective]
- **Gemini:** [Unique Gemini perspective]

## Claude's Perspective
[Full response]

## Gemini's Perspective
[Full response]
```

### gemini-domain-shadow-analyzer

**Trigger Keywords**: `shadow duplicate`, `domain resolution`, `acquired domain`, `canonical domain`

**What It Does**:
- Scans source records from CSV/Salesforce/HubSpot/Marketo/domain list
- Resolves input websites to canonical domains through Gemini
- Applies local HTTP redirect fallback for unresolved domains
- Produces grouped shadow duplicate candidates for merge planning

**Primary Output**:
- `stats` summary
- `resolutions` per input domain
- `shadowDuplicateGroups` (`distinct input domains -> same resolved domain`)
- Record-level IDs for downstream cleanup

## Use Cases

### Code Review
```
"Get Gemini's opinion on this function for edge cases"
"Ask Gemini to review the error handling in auth.js"
```

### Architecture Decisions
```
"Consult Gemini on microservices vs monolith for our use case"
"Get a second opinion on our database design"
```

### Debugging
```
"Get Gemini's perspective on why this test is flaky"
"Ask Gemini to analyze this stack trace"
```

### Best Practices
```
"What does Gemini think about our API design?"
"Consult Gemini on security best practices for this endpoint"
```

### Data Hygiene / Deduplication
```
"Find shadow duplicate accounts where websites resolve to the same domain"
"/gemini-domain-resolve --source salesforce --org prod --max-records 500"
```

## Understanding Results

| Alignment | Meaning | Action |
|-----------|---------|--------|
| 80-100% | Strong consensus | High confidence in shared recommendations |
| 50-79% | Moderate agreement | Combine insights from both |
| 30-49% | Partial agreement | Review unique insights carefully |
| 0-29% | Low agreement | Question may need clarification |

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | API key from AI Studio |
| `GEMINI_MODEL` | No | Default model (default: `gemini-2.5-pro`) |
| `GEMINI_TIMEOUT` | No | Timeout in ms (default: 120000) |
| `HUBSPOT_ACCESS_TOKEN` | No | Required for `--source hubspot` |
| `MARKETO_BASE_URL` | No | Required for `--source marketo` |
| `MARKETO_CLIENT_ID` | No | Required for `--source marketo` |
| `MARKETO_CLIENT_SECRET` | No | Required for `--source marketo` |

### Model Selection

Available models:
- `gemini-2.5-pro` - Best quality, 1M token context (default)
- `gemini-2.5-flash` - Faster, good for quick checks
- `gemini-2.0-flash` - Legacy, fastest

## Security Considerations

**Before consulting Gemini, consider:**

1. **No Secrets**: API keys, passwords, credentials
2. **No PII**: Personal identifiable information
3. **Proprietary Code**: Consider sensitivity before sharing

The agent will warn you before sending potentially sensitive content.

## Troubleshooting

### "Gemini CLI not found"
```bash
npm install -g @google/gemini-cli
```

### "GEMINI_API_KEY not set"
```bash
export GEMINI_API_KEY="your-key"
# Add to .bashrc or .zshrc for persistence
```

### "Rate limit exceeded"
Free tier limits: 60 req/min, 1,000 req/day. Wait and retry.

### "Request timed out"
Try:
- Simplify the prompt
- Use `gemini-2.5-flash` for faster response
- Check network connectivity

## Rate Limits

| Tier | Requests/Min | Requests/Day |
|------|--------------|--------------|
| Free | 60 | 1,000 |
| Paid | Higher | Higher |

## Scripts Reference

| Script | Purpose |
|--------|---------|
| `scripts/lib/prereq-check.sh` | Verify prerequisites |
| `scripts/lib/gemini-cli-invoker.js` | Invoke Gemini CLI |
| `scripts/lib/response-synthesizer.js` | Synthesize responses |
| `scripts/lib/domain-shadow-duplicate-scanner.js` | Resolve canonical domains and detect shadow duplicate account groups |

### Direct Script Usage

```bash
# Check prerequisites
bash scripts/lib/prereq-check.sh

# Invoke Gemini directly
node scripts/lib/gemini-cli-invoker.js --prompt "Your question"

# Synthesize responses manually
node scripts/lib/response-synthesizer.js \
  --question "Question" \
  --claude "Claude's response" \
  --gemini "Gemini's response"

# Domain shadow duplicate scan
node scripts/lib/domain-shadow-duplicate-scanner.js \
  --source csv \
  --input ./accounts.csv
```

## Best Practices

1. **Be Specific**: Vague questions yield vague comparisons
2. **Provide Context**: Include relevant files for code-related questions
3. **Focus Topics**: One topic per consultation works best
4. **Value Differences**: Low alignment can surface valuable insights
5. **Iterate**: Follow up on interesting differences

## Future Roadmap

- Additional AI models (OpenAI, Anthropic API direct)
- Batch consultation mode
- Consultation history and trends
- Custom synthesis templates

---

**Last Updated**: 2026-02-11
**Maintained By**: RevPal Engineering
